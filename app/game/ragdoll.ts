import * as THREE from 'three';
import type { Collider } from './world';
import { WATER_LEVEL } from './city';
import type { CollisionIndex } from './map/collision';
import { bounds as terrainBounds } from './map/terrain';
import {
  ARM_ITEMS, FIGURE, FigureBatch, HAND, HEAD, RAGDOLL_RADII, TORSO, figureGeometry, figureMaterial, mixHand, palettesOf, ragdollPose, setBits, styleOf, swingCode,
  type Detail, type FigureLook, type FigureStyle,
} from './figures';
import {
  COUNT, P, RAGDOLL_QUALITY, STEP, blast as blastBody, createColliderGrid, createSkeleton, createState, detach as detachPart, heading as headingOf,
  hingeAngles, impulseAt, interpolate, launch, nearestPart as nearestPartOf, poseFromLandmarks, push as pushBody, raycast as raycastBody,
  sleep, solverOptions, step, strike as strikeBody, sweep as sweepBody, wake,
  type BodyPart, type FallMode, type HitKind, type Mover, type RagdollState, type RagdollWorld, type RayHit, type Skeleton,
} from './ragdoll-solver';

/**
 * Ragdolls: the physics of ragdoll-solver.ts (20 anatomical particles per body, joint limits, friction, buoyancy,
 * momentum-true blows) drawn with the same articulated figure meshes as the standing crowd, so a person who falls
 * keeps their face, clothes, hands and shoes, and their size: the rest skeleton comes from figures.ts FIGURE and a
 * body spawns at the standing figure's scale and build.
 *
 * Each body is five instances of four shared meshes (body, left arm, right arm, legs): the body follows the hips
 * and turns toward the shoulders (chest twist), the head nods and turns from the neck; arms and legs are laid
 * through shoulder/elbow/wrist and hip/knee/ankle, with the wrist, hand and ankle bent toward the knuckle and toe
 * particles. A severed head is a second body instance showing only the head, with a stump cap on the neck. The
 * whole pile is four draw calls; instance matrices are written straight into the buffers, looks only at spawn.
 * Bodies push each other apart (pelvis, chest, head and limb spheres), and a hat that is not strapped on comes off
 * in the fall and lands on the street by itself (one more body instance showing only the hat).
 */
export type RagdollLook = FigureLook;
export type { BodyPart, FallMode, HitKind } from './ragdoll-solver';
type Point = { x: number; y: number; z: number };

export type SpawnOptions = {
  /** Feet at (x, y, z), facing yaw (forward = (sin, cos)). */
  x: number; y: number; z: number; yaw: number;
  /** The standing figure's scale (BODY_SCALE for residents); the build comes from styleOf(look) unless `build` is given. */
  scale: number;
  look: RagdollLook;
  /** Body velocity (m/s): the total momentum is this times the mass. */
  velocity: Point;
  /** Where the blow landed (world), so the push concentrates there and turns the body. */
  hit?: Point | null;
  kind?: HitKind;
  /** limp when killed, brace (hands out) when knocked down, stumble for a shove; default by speed. */
  mode?: FallMode;
  /** Never evicted to make room (the player and other players' bodies). */
  keep?: boolean;
  /** Overrides the look's build (a zombie brute is broader than its clothes say). */
  build?: { width: number; height: number };
  /** 'sit': fall from a seat (riders, drivers) instead of from standing; `y` is then the seat, where the hips rest. */
  from?: 'stand' | 'sit';
};
export type RagdollHit = { body: RagdollBody; t: number; index: number; part: BodyPart | null; point: THREE.Vector3 };

const { PELVIS, HIP_L, HIP_R, CHEST, NECK, SH_L, SH_R, HEAD: HEAD_P, EL_L, EL_R, WR_L, WR_R, HA_L, HA_R, KN_L, KN_R, AN_L, AN_R, TO_L, TO_R } = P;
const MAX_BODIES = 18;
/** Hats that come off in a fall (helmets are strapped on), and how far below the head centre each one's rim is (head radii). */
const LOOSE_HATS: [number, number][] = [[HEAD.CONE, 0.32], [HEAD.BUCKET, 0.33], [HEAD.PITH, 0.29], [HEAD.CAP, 0.3], [HEAD.BASEBALL, 0.06]];
/** Particles that keep two bodies apart, and the pelvis distance under which a pair is tested. */
const CONTACT = [PELVIS, CHEST, HEAD_P, HIP_L, HIP_R, SH_L, SH_R, KN_L, KN_R, AN_L, AN_R, EL_L, EL_R];
const PAIR_RANGE = 2.2;
/** Instances of one body: torso, loose head, left arm, right arm, left leg, right leg. */
const TORSO_I = 0, HEAD_I = 1, ARM_L = 2, ARM_R = 3, LEG_L = 4, LEG_R = 5;
const PARTS: readonly BodyPart[] = ['head', 'armL', 'armR', 'legL', 'legR'];
/** Bodies further than this from the focus step at 60 Hz; beyond SLEEP_FAR a body lying still is put to sleep. */
const HALF_RATE_FAR = 60, SLEEP_FAR = 120;
/** Bodies stepping at 120 Hz in a frame that needs three or more substeps (the rest step at 60 Hz). */
const SLOW_FULL = 4;

// ---- Rest skeleton, from the figure ----------------------------------------------------------------------

/**
 * The 20 rest particles of a build in FIGURE units, from ragdollPose(): waist (lumbar) above the hips, the chest
 * particle on the sternum line and the neck particle at C7 behind it, so the chest tetrahedron has volume (the
 * figure's own chest/neck landmarks are nearly coplanar with the shoulders). Radii are the figure's half
 * thicknesses where the part meets the street, so a body lies on its clothes rather than in or above them.
 */
function skeletonFor(fem: boolean) {
  const j = ragdollPose(fem);
  const pose = poseFromLandmarks({
    pelvis: [0, j.waist[1], -0.005], chest: [0, j.chest[1] - 0.02, fem ? 0.035 : 0.02], neck: [0, j.neck[1] - 0.01, -0.04], head: [0, j.head[1], 0],
    hip: j.hipL, shoulder: j.shL, elbow: j.elL, wrist: j.wrL, hand: j.haL, knee: j.knL, ankle: j.anL, toe: j.toL,
  });
  // Waist and hips as deep as the belly and seat, the chest as the ribcage, shoulders a little fuller than the
  // joint (the chest is deeper there than it is wide), the head with its hair, ankles reaching down to the heel.
  const r = RAGDOLL_RADII;
  const radius = [
    0.115, 0.1, 0.1, 0.12, r.neck, 0.09, 0.09, 0.15, r.elL, r.elR, r.wrL, r.wrR, r.haL, r.haR, r.knL, r.knR, 0.065, 0.065, r.toL, r.toR,
  ];
  return createSkeleton({ pose, radius });
}
const SKELETONS = { m: skeletonFor(false), f: skeletonFor(true) };

/**
 * A seated start for riders and drivers thrown from a seat: thighs forward, shins down, forearms reaching
 * toward the knees. Every bone keeps its rest length, so the first step does not snap.
 */
function seatedPose(skel: Skeleton) {
  const r = skel.pose, p = Float32Array.from(r);
  const len = (a: number, b: number) => Math.hypot(r[a * 3] - r[b * 3], r[a * 3 + 1] - r[b * 3 + 1], r[a * 3 + 2] - r[b * 3 + 2]);
  // child = parent + direction (x mirrored per side) x rest length.
  const hang = (parent: number, child: number, side: number, dx: number, dy: number, dz: number) => {
    const l = len(parent, child) / Math.hypot(dx, dy, dz);
    p[child * 3] = p[parent * 3] + side * dx * l; p[child * 3 + 1] = p[parent * 3 + 1] + dy * l; p[child * 3 + 2] = p[parent * 3 + 2] + dz * l;
  };
  const sides = [[-1, HIP_L, KN_L, AN_L, TO_L, SH_L, EL_L, WR_L, HA_L], [1, HIP_R, KN_R, AN_R, TO_R, SH_R, EL_R, WR_R, HA_R]];
  for (const [side, hip, knee, ankle, toe, sh, el, wr, ha] of sides) {
    hang(hip, knee, side, 0.02, 0.04, 1);
    hang(knee, ankle, side, 0, -1, 0.05);
    for (let a = 0; a < 3; a++) p[toe * 3 + a] = p[ankle * 3 + a] + r[toe * 3 + a] - r[ankle * 3 + a];
    hang(sh, el, side, 0.03, -0.92, 0.4);
    hang(el, wr, side, -0.1, -0.45, 0.89);
    hang(wr, ha, side, -0.05, -0.6, 0.8);
  }
  return p;
}
const SEATED = { m: seatedPose(SKELETONS.m), f: seatedPose(SKELETONS.f) };

// Rest directions the renderer measures joints from (model space; same for both builds).
const restOf = (skel: Skeleton, i: number) => [skel.pose[i * 3], skel.pose[i * 3 + 1], skel.pose[i * 3 + 2]] as const;
const REST_HEAD = restOf(SKELETONS.m, HEAD_P);
const REST_NECK = restOf(SKELETONS.m, NECK);
/** Neck-to-head direction at rest (a severed head's "up"). */
const NECK_UP = new THREE.Vector3(REST_HEAD[0] - REST_NECK[0], REST_HEAD[1] - REST_NECK[1], REST_HEAD[2] - REST_NECK[2]).normalize();
/** Forward tilt of the head particle seen from the head's pivot on the neck, at rest. */
const HEAD_TILT = Math.atan2(REST_HEAD[2], REST_HEAD[1] - FIGURE.headPivotY);
/** Ankle-to-toe direction at rest, as an angle from straight down toward the front. */
const FOOT_ANGLE = (() => {
  const s = SKELETONS.m.pose;
  return Math.atan2(s[TO_L * 3 + 2] - s[AN_L * 3 + 2], s[AN_L * 3 + 1] - s[TO_L * 3 + 1]);
})();

// ---- Bodies ------------------------------------------------------------------------------------------------

export class RagdollBody {
  removed = false;
  /** Render positions (interpolated between the last two substeps), world metres. */
  readonly view = new Float32Array(COUNT * 3);
  /** Instance matrices (column-major, 16 each) and poses (4 each) of TORSO_I..LEG_R. */
  readonly matrices = new Float32Array(16 * 6);
  readonly poses = new Float32Array(4 * 6);
  readonly matrixOf: Float32Array[];
  readonly poseOf: Float32Array[];
  /** Packed looks (palettes) of the torso, the loose head, the arms and the legs. */
  readonly looks: { body: Float32Array; head: Float32Array; armL: Float32Array; armR: Float32Array; legs: Float32Array };
  /** Last limb bend axis of each arm and leg (fallback when a severed limb lies straight). */
  readonly bendAxis = new Float32Array(12);
  /** Orientation of a severed head, rolled along as it moves. */
  readonly spin = new THREE.Quaternion();
  /** A hat knocked off in the fall (its HEAD bit, 0 if none): rim centre, velocity, tumble and spin, and whether it lies still. */
  hat = 0; hatLow = 0; hatRest = false;
  readonly hatPos = new THREE.Vector3(); readonly hatVel = new THREE.Vector3(); readonly hatQ = new THREE.Quaternion(); readonly hatSpin = new THREE.Vector3();
  readonly hatMatrix = new Float32Array(16); hatLook!: Float32Array;
  /** Steps at 120 Hz (else 60 Hz), the tick of its latest substep, and whether its instances are up to date. */
  full = true; lastTick = 0; synced = false;
  bornAt = 0; bornFrame = 0; focus = 0;
  constructor(
    readonly slot: number, readonly state: RagdollState, readonly look: RagdollLook, readonly style: FigureStyle,
    readonly keep: boolean, readonly limp: boolean,
  ) {
    this.matrixOf = Array.from({ length: 6 }, (_, i) => this.matrices.subarray(i * 16, i * 16 + 16));
    this.poseOf = Array.from({ length: 6 }, (_, i) => this.poses.subarray(i * 4, i * 4 + 4));
    const p = palettesOf(style);
    // Whatever was in the right hand (or on the shoulder: a gánh) falls away; a dead person's eyes are closed.
    setBits(p.armR, 0, ARM_ITEMS, false);
    setBits(p.body, 1, TORSO.GANH, false);
    if (limp) { setBits(p.body, 0, HEAD.EYES | HEAD.MOUTH, false); setBits(p.body, 0, HEAD.BLINK, true); }
    // A loose hat leaves the head: it is drawn on its own (only its bit shown).
    for (const [bit, low] of LOOSE_HATS) if (style.head & bit) { this.hat = bit; this.hatLow = low; break; }
    if (this.hat) {
      setBits(p.body, 0, this.hat, false);
      this.hatLook = Float32Array.from(p.body);
      this.hatLook[6] = this.hat; this.hatLook[7] = 0;
    }
    this.looks = { body: p.body, head: Float32Array.from(p.body), armL: p.armL, armR: p.armR, legs: p.legs };
  }
  get asleep() { return this.state.asleep; }
}

// ---- Small vector helpers on Float64Array(3) scratch ------------------------------------------------------

type V = Float64Array;
const vec = () => new Float64Array(3);
function load(v: Float32Array, i: number, out: V) { out[0] = v[i * 3]; out[1] = v[i * 3 + 1]; out[2] = v[i * 3 + 2]; return out; }
function sub(a: V, b: V, out: V) { out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2]; return out; }
function dot(a: V, b: V) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: V, b: V, out: V) {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z; return out;
}
function unit(a: V) { const l = Math.hypot(a[0], a[1], a[2]); if (l > 1e-9) { a[0] /= l; a[1] /= l; a[2] /= l; } return l; }
/** a minus its component along unit `axis`, normalised; returns the remaining length. */
function ortho(a: V, axis: V) { const d = dot(a, axis); a[0] -= axis[0] * d; a[1] -= axis[1] * d; a[2] -= axis[2] * d; return unit(a); }
/** Column-major T(t) [x*sx | y*sy | z*sz]. */
function basis(m: Float32Array, x: V, y: V, z: V, sx: number, sy: number, sz: number, t: V) {
  m[0] = x[0] * sx; m[1] = x[1] * sx; m[2] = x[2] * sx; m[3] = 0;
  m[4] = y[0] * sy; m[5] = y[1] * sy; m[6] = y[2] * sy; m[7] = 0;
  m[8] = z[0] * sz; m[9] = z[1] * sz; m[10] = z[2] * sz; m[11] = 0;
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
}
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/**
 * `colliders` are what bodies hit (filed in a collision index on first use). `setup.solids` is the game's shared
 * index of static solids (map/collision.ts, refs are colliders): when given, it is queried too, so `colliders` need
 * only hold what it lacks (seats and tables). `setup.bounds` fences the bodies in (default: the terrain's bounds).
 */
export type RagdollOptions = { solids?: CollisionIndex | null; bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } };
export function createRagdolls(scene: THREE.Scene, colliders: Collider[], ground: (x: number, z: number) => number, setup: RagdollOptions = {}) {
  let detail: Detail = 'hi';
  const materials = { body: figureMaterial('body'), arm: figureMaterial('arm'), leg: figureMaterial('leg') };
  // Torsos first, then loose heads and fallen hats, in one body batch.
  const bodyBatch = new FigureBatch(figureGeometry('body', detail), materials.body, MAX_BODIES * 3);
  const armBatchL = new FigureBatch(figureGeometry('armL', detail), materials.arm, MAX_BODIES);
  const armBatchR = new FigureBatch(figureGeometry('armR', detail), materials.arm, MAX_BODIES);
  const legBatch = new FigureBatch(figureGeometry('leg', detail), materials.leg, MAX_BODIES * 2);
  const batches = [bodyBatch, armBatchL, armBatchR, legBatch];
  for (const batch of batches) { batch.end(0); batch.mesh.visible = false; scene.add(batch.mesh); }

  const bodies: RagdollBody[] = [];
  const freeSlots = Array.from({ length: MAX_BODIES }, (_, i) => MAX_BODIES - 1 - i);
  const stumps: { body: RagdollBody; part: number; until: number }[] = [];
  // Vehicles swept this frame: solved inside every substep of the next update, then cleared.
  const moverPool: Mover[] = [];
  const movers: Mover[] = [];
  const world: RagdollWorld = {
    ground, grid: null, water: WATER_LEVEL, movers,
    bounds: { ...(setup.bounds ?? terrainBounds) },
  };
  let quality: { bodies: number; iterations: number; fullRate: number } = RAGDOLL_QUALITY[0];
  let options = solverOptions(quality.iterations);
  let accumulator = 0, tick = 0, frame = 0, clock = 0, frameDt = 0;
  let focusX = 0, focusZ = 0;
  let dirty = false;
  const awake: RagdollBody[] = [], stepped: RagdollBody[] = [];

  // ---- Render sync ----------------------------------------------------------------------------------------

  const A = vec(), B = vec(), C = vec(), D = vec(), M = vec(), O = vec(), X = vec(), Y = vec(), Z = vec(), W = vec(), CX = vec(), CZ = vec();
  const LY = vec(), LX = vec(), LZ = vec(), FY = vec(), FZ = vec(), F = vec(), H = vec(), T = vec(), R = vec();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const HAT_POSE = [0, 0, 0, 0];

  /**
   * Lays one arm or leg from its root (rendered shoulder or hip, or the stub of a severed limb) along the bone from
   * particle `from` through the middle and end particles, then bends the wrist / ankle toward the knuckle or toe
   * particle. Attached limbs take the solver's hinge axis (it never flips on a straight limb); severed ones the
   * plane of their three points.
   */
  function limb(body: RagdollBody, inst: number, root: V, from: number, mid: number, end: number, tip: number, slot: number, arm: boolean, side: number, attached: boolean) {
    const v = body.view, st = body.state, k = st.k, ky = st.ky;
    load(v, mid, B); load(v, end, C);
    // The limb hangs from `root` (where the drawn torso has its shoulder or hip) but points the way its own
    // bone does, so a torso that cannot bend like the particles shifts the limb a little instead of swinging it.
    load(v, from, LY);
    sub(LY, B, LY);
    if (unit(LY) < 1e-6) { LY[0] = 0; LY[1] = 1; LY[2] = 0; }
    sub(C, B, F);
    unit(F);
    const sign = arm ? -1 : 1, saved = body.bendAxis, o = slot * 3;
    let ok = false;
    if (attached) {
      LX[0] = st.axis[o] * sign; LX[1] = st.axis[o + 1] * sign; LX[2] = st.axis[o + 2] * sign;
      ok = ortho(LX, LY) > 0.2;
    }
    if (!ok) {
      // z' = the end segment's side of the bend (forward for a forearm, backward for a shin), x' = y' x z'.
      LZ[0] = F[0]; LZ[1] = F[1]; LZ[2] = F[2];
      if (ortho(LZ, LY) > 0.05) {
        if (!arm) { LZ[0] = -LZ[0]; LZ[1] = -LZ[1]; LZ[2] = -LZ[2]; }
        cross(LY, LZ, LX);
        ok = unit(LX) > 0.5;
      }
      if (!ok) { LX[0] = saved[o]; LX[1] = saved[o + 1]; LX[2] = saved[o + 2]; if (ortho(LX, LY) < 0.2) { LX[0] = 1; LX[1] = 0; LX[2] = 0; ortho(LX, LY); } }
    }
    load(v, tip, D);
    sub(D, C, H);
    unit(H);
    if (!arm) {
      // A straight knee shows no bend plane, but the foot shows which way the leg is turned: blend the leg's
      // roll toward the one that puts the toes in front of the shin, as far as a hip turns (about 45 degrees).
      cross(LX, LY, LZ);
      const knee = Math.atan2(-dot(F, LZ), -dot(F, LY)), w = clamp((0.5 - knee) / 0.3, 0, 1);
      FZ[0] = H[0]; FZ[1] = H[1]; FZ[2] = H[2];
      if (w > 0 && ortho(FZ, LY) > 0.3) {
        cross(LY, FZ, FY);
        cross(LX, FY, R);
        const turn = clamp(Math.atan2(dot(R, LY), dot(LX, FY)), -1.6, 1.6) * w, c = Math.cos(turn), s = Math.sin(turn);
        // Rodrigues about y' (LX is perpendicular to it).
        cross(LY, LX, R);
        for (let a = 0; a < 3; a++) LX[a] = LX[a] * c + R[a] * s;
      }
    }
    saved[o] = LX[0]; saved[o + 1] = LX[1]; saved[o + 2] = LX[2];
    cross(LX, LY, LZ);
    basis(body.matrixOf[inst], LX, LY, LZ, k, ky, k, root);
    // Elbow (< 0 flexes forward) or knee (> 0 flexes backward): the end segment's angle in the bend plane.
    let bend = Math.atan2(-dot(F, LZ), -dot(F, LY));
    bend = arm ? clamp(bend, -2.75, 0.1) : clamp(bend, -0.1, 2.75);
    const c = Math.cos(bend), s = Math.sin(bend);
    // Forearm / shin frame after the bend: y'' runs back up the segment, z'' its front.
    for (let a = 0; a < 3; a++) { FY[a] = LY[a] * c + LZ[a] * s; FZ[a] = LZ[a] * c - LY[a] * s; }
    const pose = body.poseOf[inst];
    pose[0] = bend;
    if (arm) {
      // The hand points at the knuckles: forearm twist turns the bend plane, wrist flex bends toward the palm
      // (mirrored for the left arm). The twist stays within a forearm's range by flexing the other way instead.
      const ux = -side * dot(H, LX), uz = -dot(H, FZ);
      let flex = Math.atan2(Math.hypot(ux, uz), -dot(H, FY)), twist = Math.atan2(uz, ux);
      if (twist > Math.PI / 2) { twist -= Math.PI; flex = -flex; } else if (twist < -Math.PI / 2) { twist += Math.PI; flex = -flex; }
      if (Math.abs(flex) < 0.05) twist *= Math.abs(flex) / 0.05;
      pose[1] = clamp(twist, -1.4, 1.4);
      pose[2] = clamp(flex, -1.1, 1.25);
      // Relaxed hands, spread open while flying or bracing for the street.
      const open = Math.max(clamp((st.speed - 4) / 3, 0, 1), st.bracing ? clamp(st.tone * 1.5, 0, 1) : 0);
      pose[3] = open > 0 ? mixHand(HAND.RELAXED, HAND.OPEN, open) : HAND.RELAXED;
    } else {
      // The foot turns about the ankle toward the toe particle (its sideways lean is the leg's roll above).
      const angle = Math.atan2(dot(H, FZ), -dot(H, FY));
      pose[1] = clamp(FOOT_ANGLE - angle, -0.75, 1.2);
      pose[2] = 0;
      pose[3] = 0;
    }
  }

  /** Recomputes a body's instances from its particles (interpolated by `alpha` between the last two substeps). */
  function sync(body: RagdollBody, alpha: number) {
    const st = body.state, v = body.view, k = st.k, ky = st.ky, cut = st.cut;
    interpolate(st, alpha, v);
    // Body frame: x along the hips (the legs hang exactly from them), y toward the middle of the shoulders.
    load(v, HIP_L, A); load(v, HIP_R, B);
    for (let a = 0; a < 3; a++) M[a] = (A[a] + B[a]) / 2;
    sub(B, A, X);
    unit(X);
    load(v, SH_L, C); load(v, SH_R, D);
    for (let a = 0; a < 3; a++) Y[a] = (C[a] + D[a]) / 2 - M[a];
    if (ortho(Y, X) < 1e-4) { load(v, PELVIS, Y); sub(Y, M, Y); ortho(Y, X); }
    cross(X, Y, Z);
    // Chest twist about the spine: the shoulder line against the hip line.
    sub(D, C, W);
    ortho(W, Y);
    const twist = clamp(Math.atan2(-dot(W, Z), dot(W, X)), -1, 1);
    for (let a = 0; a < 3; a++) O[a] = M[a] - Y[a] * FIGURE.hipY * ky;
    basis(body.matrixOf[TORSO_I], X, Y, Z, k, ky, k, O);
    const ct = Math.cos(twist), stw = Math.sin(twist);
    for (let a = 0; a < 3; a++) { CX[a] = X[a] * ct - Z[a] * stw; CZ[a] = X[a] * stw + Z[a] * ct; }
    const bodyPose = body.poseOf[TORSO_I];
    bodyPose[2] = twist;
    // Skirts, áo dài tà and aprons hang along the legs: the front panel opens as far as the thigh that is most
    // forward (a raised knee drapes it, the shader folding the cloth back down past the knee), the back one as far
    // as the thigh that is most behind. Lying on the back or the front, a ponytail swings in toward the nape
    // instead of through the street.
    const flexL = thighFlex(v, HIP_L, KN_L), flexR = thighFlex(v, HIP_R, KN_R);
    const front = clamp(Math.max(flexL, flexR) + 0.12, 0, 1.9), back = clamp(0.12 - Math.min(flexL, flexR), 0, 1.4);
    bodyPose[3] = swingCode(front, -0.4 * Math.abs(CZ[1]), back);
    if (!(cut & 1)) {
      // The head turns about its pivot on the neck so that its centre goes toward the head particle (which is
      // what touches the street): nodding for the forward tilt, and a sideways tilt turns the face that way.
      load(v, HEAD_P, A);
      for (let a = 0; a < 3; a++) H[a] = A[a] - O[a] - Y[a] * FIGURE.headPivotY * ky;
      const nx = dot(H, CX) / k, ny = dot(H, Y) / ky, nz = dot(H, CZ) / k;
      bodyPose[0] = clamp(Math.atan2(nx, Math.max(ny, 0.02)) * 1.3, -1.05, 1.05);
      bodyPose[1] = clamp(Math.atan2(nz, ny) - HEAD_TILT, -0.8, 0.9);
    } else {
      bodyPose[0] = bodyPose[1] = 0;
      looseHead(body);
    }
    // Arms from the rendered shoulders (they follow the chest twist), legs from the hips. The solver's L chain
    // is at -x, which is the person's right (they face +z): it is drawn with the right arm (mirrored build, the
    // right palette); `side` is the x sign.
    for (const side of [-1, 1]) {
      const left = side < 0, part = left ? 1 : 2;
      if (cut & (1 << part)) load(v, st.stub[part], T);
      else for (let a = 0; a < 3; a++) T[a] = O[a] + CX[a] * side * body.style.shoulderX * k + Y[a] * FIGURE.shoulderY * ky;
      const from = cut & (1 << part) ? st.stub[part] : left ? SH_L : SH_R;
      limb(body, left ? ARM_R : ARM_L, T, from, left ? EL_L : EL_R, left ? WR_L : WR_R, left ? HA_L : HA_R, left ? 0 : 1, true, side, !(cut & (1 << part)));
    }
    for (const side of [-1, 1]) {
      const left = side < 0, part = left ? 3 : 4;
      if (cut & (1 << part)) load(v, st.stub[part], T);
      else for (let a = 0; a < 3; a++) T[a] = M[a] + X[a] * side * FIGURE.hipX * k;
      const from = cut & (1 << part) ? st.stub[part] : left ? HIP_L : HIP_R;
      limb(body, left ? LEG_L : LEG_R, T, from, left ? KN_L : KN_R, left ? AN_L : AN_R, left ? TO_L : TO_R, left ? 2 : 3, false, side, !(cut & (1 << part)));
    }
  }

  /** A thigh's swing in the body frame (X, Y, Z of the last sync): radians forward of hanging straight down. */
  const TF = vec(), TH = vec();
  function thighFlex(v: Float32Array, hip: number, knee: number) {
    load(v, knee, TF); load(v, hip, TH); sub(TF, TH, TF);
    return Math.atan2(dot(TF, Z), -dot(TF, Y));
  }

  /** A severed head: neck-to-head along its two particles, rolled about the rest as it moves over the street. */
  const HP = vec(), HN = vec(), HU = vec(), HX = vec(), HY = vec(), HZ = vec(), HT = vec();
  function looseHead(body: RagdollBody) {
    const st = body.state, v = body.view;
    load(v, HEAD_P, HP); load(v, st.stub[0], HN);
    const r = st.r[HEAD_P];
    // Rolling contact: turn about (up x velocity) by distance / radius.
    const i = HEAD_P * 3;
    const vx = (st.pos[i] - st.prev[i]) / st.dt, vz = (st.pos[i + 2] - st.prev[i + 2]) / st.dt;
    const speed = Math.hypot(vx, vz);
    if (!st.asleep && speed > 0.05 && HP[1] - ground(HP[0], HP[2]) < r * 1.3) {
      qa.setFromAxisAngle(va.set(vz / speed, 0, -vx / speed), speed * frameDt / r);
      body.spin.premultiply(qa);
    }
    // Keep the neck axis on the particles.
    sub(HP, HN, HU);
    if (unit(HU) > 1e-5) {
      va.copy(NECK_UP).applyQuaternion(body.spin);
      qb.setFromUnitVectors(va, vb.set(HU[0], HU[1], HU[2]));
      body.spin.premultiply(qb).normalize();
    }
    m4.makeRotationFromQuaternion(body.spin);
    const e = m4.elements, k = st.k, ky = st.ky;
    HX[0] = e[0]; HX[1] = e[1]; HX[2] = e[2]; HY[0] = e[4]; HY[1] = e[5]; HY[2] = e[6]; HZ[0] = e[8]; HZ[1] = e[9]; HZ[2] = e[10];
    // T(head particle) R S T(-rest head): the rest head position lands on the particle.
    for (let a = 0; a < 3; a++) HT[a] = HP[a] - HX[a] * REST_HEAD[0] * k - HY[a] * REST_HEAD[1] * ky - HZ[a] * REST_HEAD[2] * k;
    basis(body.matrixOf[HEAD_I], HX, HY, HZ, k, ky, k, HT);
    // A ponytail or long hair hangs toward the street whichever way the head lies (about the head's x axis).
    const hair = clamp(Math.atan2(HZ[1], HY[1]), -1.6, 1.6);
    const pose = body.poseOf[HEAD_I];
    pose[0] = pose[1] = pose[2] = 0;
    pose[3] = swingCode(0, hair, 0);
  }

  // ---- Fallen hats --------------------------------------------------------------------------------------------

  const hatUp = new THREE.Vector3(), hatAxis = new THREE.Vector3(), hatTurn = new THREE.Quaternion(), hatRestQ = new THREE.Quaternion(), hatM = new THREE.Matrix4();
  const HAT_UP = new THREE.Vector3(0, 1, 0);
  /** The hat pops off the head with the body's start velocity, a little up and to the side, tumbling. */
  function dropHat(body: RagdollBody, vel: Point) {
    const v = body.view, i = HEAD_P * 3, st = body.state;
    body.hatPos.set(v[i], v[i + 1] + 0.12 * st.ky, v[i + 2]);
    body.hatVel.set(vel.x * 0.75 + (Math.random() - 0.5) * 1.2, Math.max(1.2, vel.y * 0.5 + 1.6), vel.z * 0.75 + (Math.random() - 0.5) * 1.2);
    body.hatQ.setFromAxisAngle(HAT_UP, Math.random() * Math.PI * 2);
    body.hatSpin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 9);
    body.hatRest = false;
    hatMatrix(body);
  }
  /** Falls, bounces and slides to a stop rim down (nón lá sometimes land upside down, as they do). */
  function moveHat(body: RagdollBody, dt: number) {
    if (!body.hat || body.hatRest) return;
    const p = body.hatPos, vel = body.hatVel;
    vel.y -= 9.8 * dt;
    vel.multiplyScalar(Math.pow(0.6, dt));
    p.addScaledVector(vel, dt);
    const floor = ground(p.x, p.z);
    let landed = false;
    if (p.y <= floor + 0.004) {
      p.y = floor + 0.004;
      if (vel.y < 0) vel.y = -vel.y * 0.15;
      vel.x *= Math.pow(0.02, dt); vel.z *= Math.pow(0.02, dt);
      landed = true;
    }
    if (!landed) {
      const s = body.hatSpin.length();
      if (s > 1e-4) body.hatQ.premultiply(hatTurn.setFromAxisAngle(hatAxis.copy(body.hatSpin).divideScalar(s), s * dt));
    } else {
      // On the street it settles flat: its axis turns to the nearer of up and down (a cone lands either way).
      hatUp.copy(HAT_UP).applyQuaternion(body.hatQ);
      const down = body.hat === HEAD.CONE && hatUp.y < -0.2 ? -1 : 1;
      hatRestQ.setFromUnitVectors(hatUp, hatAxis.set(0, down, 0)).multiply(body.hatQ);
      body.hatQ.slerp(hatRestQ, 1 - Math.pow(0.0005, dt));
      body.hatSpin.multiplyScalar(Math.pow(0.01, dt));
      if (Math.hypot(vel.x, vel.y, vel.z) < 0.05 && hatUp.angleTo(hatAxis) < 0.02) body.hatRest = true;
    }
    hatMatrix(body);
  }
  function hatMatrix(body: RagdollBody) {
    const st = body.state, k = st.k, ky = st.ky;
    hatUp.copy(HAT_UP).applyQuaternion(body.hatQ);
    // Turned over, a hat rests on its crown (a cone on its tip), its rim higher above the street.
    const lift = Math.max(0, -hatUp.y) * (body.hat === HEAD.CONE ? 1.38 : 0.6) * FIGURE.headR * ky;
    hatM.compose(hatAxis.set(body.hatPos.x, body.hatPos.y + lift, body.hatPos.z), body.hatQ, va.set(k, ky, k))
      .multiply(m4.makeTranslation(0, -(FIGURE.headY + body.hatLow * FIGURE.headR), 0));
    body.hatMatrix.set(hatM.elements);
  }

  // ---- Bodies against each other ------------------------------------------------------------------------------

  /**
   * Keeps bodies from sinking into each other in a pile: spheres at the pelvis, chest, head and limb joints of every
   * pair whose pelvises are close are pushed apart (by inverse mass, a capped step per substep so a deep overlap
   * eases out instead of exploding). A sleeping body that is pushed wakes.
   */
  const BA = new Float64Array(6), BB = new Float64Array(6);
  /** Box round a body's contact spheres: min x, y, z then max x, y, z. */
  function bounds(st: RagdollState, out: Float64Array) {
    out[0] = out[1] = out[2] = Infinity; out[3] = out[4] = out[5] = -Infinity;
    const p = st.pos;
    for (const i of CONTACT) {
      const r = st.r[i], x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      if (x - r < out[0]) out[0] = x - r; if (y - r < out[1]) out[1] = y - r; if (z - r < out[2]) out[2] = z - r;
      if (x + r > out[3]) out[3] = x + r; if (y + r > out[4]) out[4] = y + r; if (z + r > out[5]) out[5] = z + r;
    }
  }
  function collideBodies(stepped: RagdollBody[]) {
    for (let a = 0; a < stepped.length; a++) {
      const A = stepped[a].state, pa = A.pos;
      for (const other of bodies) {
        const B = other.state;
        if (other === stepped[a]) continue;
        const ib = stepped.indexOf(other);
        if (ib >= 0 && ib < a) continue;
        const pb = B.pos;
        const dx = pa[PELVIS * 3] - pb[PELVIS * 3], dy = pa[PELVIS * 3 + 1] - pb[PELVIS * 3 + 1], dz = pa[PELVIS * 3 + 2] - pb[PELVIS * 3 + 2];
        if (dx * dx + dy * dy + dz * dz > PAIR_RANGE * PAIR_RANGE) continue;
        // Their boxes (with the largest radius) must overlap before any sphere can.
        bounds(A, BA); bounds(B, BB);
        if (BA[0] > BB[3] || BB[0] > BA[3] || BA[1] > BB[4] || BB[1] > BA[4] || BA[2] > BB[5] || BB[2] > BA[5]) continue;
        let pushed = false;
        for (const i of CONTACT) {
          const oi = i * 3, ri = A.r[i];
          for (const j of CONTACT) {
            const oj = j * 3, min = ri + B.r[j];
            const x = pa[oi] - pb[oj], y = pa[oi + 1] - pb[oj + 1], z = pa[oi + 2] - pb[oj + 2], d2 = x * x + y * y + z * z;
            if (d2 >= min * min || d2 < 1e-10) continue;
            const d = Math.sqrt(d2), depth = min - d;
            const wa = A.w[i], wb = B.asleep && depth < 0.01 ? 0 : B.w[j], s = Math.min(depth, 0.015) * 0.7 / (d * (wa + wb));
            pa[oi] += x * s * wa; pa[oi + 1] += y * s * wa; pa[oi + 2] += z * s * wa;
            if (wb > 0) { pb[oj] -= x * s * wb; pb[oj + 1] -= y * s * wb; pb[oj + 2] -= z * s * wb; pushed = true; }
          }
        }
        if (pushed && B.asleep) { wake(B); other.synced = false; }
      }
    }
  }

  /** Writes every body into the batches: torsos then loose heads, arms, legs (two per body). */
  function flush() {
    dirty = false;
    const n = bodies.length;
    const put = (batch: FigureBatch, index: number, body: RagdollBody, inst: number, look: Float32Array) => {
      (batch.mesh.instanceMatrix.array as Float32Array).set(body.matrixOf[inst], index * 16);
      batch.setLook(index, look);
      batch.setPose(index, body.poseOf[inst]);
    };
    let heads = n;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      put(bodyBatch, i, b, TORSO_I, b.looks.body);
      put(armBatchL, i, b, ARM_L, b.looks.armL);
      put(armBatchR, i, b, ARM_R, b.looks.armR);
      put(legBatch, i * 2, b, LEG_L, b.looks.legs);
      put(legBatch, i * 2 + 1, b, LEG_R, b.looks.legs);
    }
    for (const b of bodies) if (b.state.cut & 1) put(bodyBatch, heads++, b, HEAD_I, b.looks.head);
    for (const b of bodies) {
      if (!b.hat) continue;
      (bodyBatch.mesh.instanceMatrix.array as Float32Array).set(b.hatMatrix, heads * 16);
      bodyBatch.setLook(heads, b.hatLook);
      bodyBatch.setPose(heads++, HAT_POSE);
    }
    bodyBatch.end(heads); armBatchL.end(n); armBatchR.end(n); legBatch.end(n * 2);
    for (const batch of batches) batch.mesh.visible = batch.mesh.count > 0;
  }

  // ---- Pool -------------------------------------------------------------------------------------------------

  function distanceToFocus(body: RagdollBody) {
    const p = body.state.pos;
    return Math.hypot(p[PELVIS * 3] - focusX, p[PELVIS * 3 + 2] - focusZ);
  }

  /**
   * Frees a slot: asleep, old and far bodies go first; never a body kept for a player (unless every body is) or
   * one spawned this frame (unless `force`).
   */
  function evict(force: boolean) {
    const allKeep = bodies.every((b) => b.keep);
    let victim: RagdollBody | null = null, best = -Infinity;
    for (const b of bodies) {
      if (b.keep && !allKeep) continue;
      if (!force && b.bornFrame === frame) continue;
      const score = (b.state.asleep ? 2 : 0) + (clock - b.bornAt) / 10 + distanceToFocus(b) / 50;
      if (score > best) { best = score; victim = b; }
    }
    if (victim) remove(victim);
    return !!victim;
  }

  function spawn(options: SpawnOptions) {
    // Colliders are static once the world is built (traffic-light poles are added late): index them on first use.
    if (!world.grid) world.grid = createColliderGrid(colliders, 16, setup.solids ?? null);
    while (bodies.length >= quality.bodies || !freeSlots.length) if (!evict(false) && !evict(true)) break;
    const { x, y, z, yaw, scale, look, velocity: vel } = options;
    const style = styleOf(look);
    const width = options.build?.width ?? style.width, height = options.build?.height ?? style.height;
    const mode: FallMode = options.mode ?? (Math.hypot(vel.x, vel.z) < 6 ? 'stumble' : 'brace');
    const skel = style.fem ? SKELETONS.f : SKELETONS.m;
    const seated = options.from === 'sit';
    // A seated body starts with its hip joints on the seat (the rest skeleton's feet would be below it).
    const feet = seated ? y - (FIGURE.hipY - FIGURE.seatClear) * scale * height : y;
    const state = createState(skel, { x, y: feet, z, yaw, scale, width, height, mode, ground, pose: seated ? (style.fem ? SEATED.f : SEATED.m) : undefined });
    launch(state, vel.x, vel.y, vel.z, options.kind ?? (options.hit ? 'bullet' : 'fall'), options.hit ?? null);
    // Hinge axes for the first frame (the solver refreshes them on every step).
    hingeAngles(state);
    const body = new RagdollBody(freeSlots.pop()!, state, look, style, !!options.keep, mode === 'limp');
    body.bornAt = clock;
    body.bornFrame = frame;
    body.lastTick = tick;
    // The first frame shows the start pose; interpolation then runs from there.
    body.spin.identity();
    sync(body, 1);
    if (body.hat) dropHat(body, vel);
    bodies.push(body);
    flush();
    return body;
  }

  function remove(body: RagdollBody) {
    if (body.removed) return;
    body.removed = true;
    freeSlots.push(body.slot);
    const index = bodies.indexOf(body);
    if (index >= 0) bodies.splice(index, 1);
    for (let i = stumps.length - 1; i >= 0; i--) if (stumps[i].body === body) stumps.splice(i, 1);
    flush();
  }

  /** The waist particle (about 0.12 m above the street when the body lies flat). */
  function center(body: RagdollBody, out: THREE.Vector3) {
    const v = body.view;
    return out.set(v[PELVIS * 3], v[PELVIS * 3 + 1], v[PELVIS * 3 + 2]);
  }

  /** Tears a limb or the head off; the stump bleeds for a few seconds. Returns false if it was already gone. */
  function detach(body: RagdollBody, part: BodyPart | null, now: number) {
    if (!part || body.removed) return false;
    const st = body.state;
    if (detachPart(st, part) < 0) return false;
    if (part === 'head') {
      // The head keeps the orientation it had on the shoulders, then rolls on its own.
      const v = body.view;
      load(v, HIP_L, A); load(v, HIP_R, B);
      for (let a = 0; a < 3; a++) M[a] = (A[a] + B[a]) / 2;
      sub(B, A, X); unit(X);
      load(v, SH_L, C); load(v, SH_R, D);
      for (let a = 0; a < 3; a++) Y[a] = (C[a] + D[a]) / 2 - M[a];
      ortho(Y, X); cross(X, Y, Z);
      const pose = body.poseOf[TORSO_I], tw = pose[2];
      m4.makeBasis(va.set(X[0], X[1], X[2]), vb.set(Y[0], Y[1], Y[2]), new THREE.Vector3(Z[0], Z[1], Z[2]));
      body.spin.setFromRotationMatrix(m4).multiply(qa.setFromEuler(euler.set(pose[1], pose[0] + tw, 0, 'YXZ')));
      // Torso: no head, a stump on the neck. Loose head: only the head (hair, hat, face) and its cut.
      const look = body.looks.body, head = body.looks.head;
      head.set(look);
      head[7] = TORSO.HEAD | TORSO.STUMP;
      look[6] = 0;
      setBits(look, 1, TORSO.HEAD, false);
      setBits(look, 1, TORSO.STUMP, true);
    }
    stumps.push({ body, part: PARTS.indexOf(part), until: now + 3500 });
    body.synced = false;
    dirty = true;
    return true;
  }

  /** Ray (unit `dir`) against every body's bone capsules and heads; the nearest hit before maxT. */
  const rayHit: RayHit = { t: 0, index: 0, part: null, x: 0, y: 0, z: 0 };
  function raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number): RagdollHit | null {
    let best: RagdollHit | null = null, limit = maxT;
    for (const body of bodies) {
      if (!raycastBody(body.state, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, limit, rayHit)) continue;
      limit = rayHit.t;
      best = { body, t: rayHit.t, index: rayHit.index, part: rayHit.part, point: new THREE.Vector3(rayHit.x, rayHit.y, rayHit.z) };
    }
    return best;
  }

  function setQuality(level: number) {
    quality = RAGDOLL_QUALITY[clamp(Math.round(level), 0, RAGDOLL_QUALITY.length - 1)];
    options = solverOptions(quality.iterations);
    while (bodies.length > quality.bodies) if (!evict(true)) break;
  }

  return {
    spawn,
    remove,
    detach,
    center,
    raycast,
    setQuality,
    /** The attached part nearest a world point (what a blast or a point-blank shot tears off), null if none is left. */
    nearestPart(body: RagdollBody, x: number, y: number, z: number) { return nearestPartOf(body.state, x, y, z); },
    /** The old impulse: a blow (m/s) centred on particle `index`, or spread over the body. */
    impulse(body: RagdollBody, vx: number, vy: number, vz: number, index = -1) { impulseAt(body.state, vx, vy, vz, index); },
    /** A blow at a world point (bullet, kick, bumper): it turns the body as well as pushing it. */
    strike(body: RagdollBody, x: number, y: number, z: number, vx: number, vy: number, vz: number, kind: HitKind = 'bullet') {
      strikeBody(body.state, x, y, z, vx, vy, vz, kind);
    },
    /** Shoves parts within `radius` of (x, z) to at least this speed (kicks, walking into a body). */
    push(x: number, z: number, radius: number, vx: number, vy: number, vz: number) {
      const floorY = ground(x, z);
      let touched = 0;
      for (const body of bodies) {
        const p = body.state.pos, reach = body.state.reach + radius;
        if ((p[PELVIS * 3] - x) ** 2 + (p[PELVIS * 3 + 2] - z) ** 2 > reach * reach && !body.state.cut) continue;
        touched += pushBody(body.state, x, z, floorY, radius, vx, vy, vz);
      }
      return touched;
    },
    /** Throws every body near an explosion outward and upward (strength 26 is a grenade). */
    blast(x: number, y: number, z: number, radius: number, strength: number) {
      for (const body of bodies) blastBody(body.state, x, y, z, radius, strength);
    },
    /**
     * A moving vehicle this frame, as a box: centre, heading, half width / length, roof height and velocity. Bodies
     * it touches are pushed out of it inside the next update's substeps (and can land on the bonnet or roof).
     * Returns how many body parts are inside it now.
     */
    sweep(x: number, z: number, yaw: number, halfW: number, halfL: number, top: number, vx: number, vz: number) {
      if (!bodies.length || movers.length >= 48) return 0;
      const mover = moverPool[movers.length] ?? (moverPool[movers.length] = { x: 0, z: 0, floorY: 0, yaw: 0, halfW: 0, halfL: 0, top: 0, vx: 0, vz: 0 });
      Object.assign(mover, { x, z, floorY: ground(x, z), yaw, halfW, halfL, top, vx, vz });
      movers.push(mover);
      let touched = 0;
      for (const body of bodies) touched += sweepBody(body.state, mover);
      return touched;
    },
    /** Which way a body lies (yaw of its spine, game convention) and whether it faces the sky: for getting up. */
    heading(body: RagdollBody) { return headingOf(body.state); },
    forEach(callback: (body: RagdollBody) => void) { bodies.forEach(callback); },
    /**
     * A soft shadow under each body: centre (x, z) between the head and the feet, width, length along the body
     * on the ground, its yaw, and the waist's height (a body in the air casts a smaller shadow).
     */
    forEachShadow(callback: (x: number, z: number, width: number, length: number, yaw: number, height: number) => void) {
      for (const body of bodies) {
        const v = body.view, st = body.state;
        const top = st.cut & 1 ? NECK : HEAD_P;
        const fx = (v[AN_L * 3] + v[AN_R * 3]) / 2, fz = (v[AN_L * 3 + 2] + v[AN_R * 3 + 2]) / 2;
        const dx = v[top * 3] - fx, dz = v[top * 3 + 2] - fz;
        callback((v[top * 3] + fx) / 2, (v[top * 3 + 2] + fz) / 2, 0.75 * st.k / 0.82, Math.hypot(dx, dz) + 0.45 * st.k / 0.82, Math.atan2(dx, dz), v[PELVIS * 3 + 1]);
      }
    },
    /** Bleeding stumps: calls back with the wound position and an outward spray direction (torso side and severed end). */
    forEachStump(now: number, callback: (x: number, y: number, z: number, dx: number, dy: number, dz: number) => void) {
      for (let i = stumps.length - 1; i >= 0; i--) {
        const { body, part, until } = stumps[i];
        if (now > until || body.removed) { stumps.splice(i, 1); continue; }
        const v = body.view, st = body.state;
        // Torso side: the neck, shoulder or hip the part hung from, spraying away from the trunk.
        const root = part === 0 ? NECK : part === 1 ? SH_L : part === 2 ? SH_R : part === 3 ? HIP_L : HIP_R;
        const from = part === 0 ? CHEST : part <= 2 ? CHEST : PELVIS;
        load(v, root, A); load(v, from, B);
        callback(A[0], A[1], A[2], A[0] - B[0], A[1] - B[1] + 0.3, A[2] - B[2]);
        // Severed end: the stub, away from the joint next to it.
        const stub = st.stub[part];
        if (stub < 0) continue;
        const next = part === 0 ? HEAD_P : part === 1 ? EL_L : part === 2 ? EL_R : part === 3 ? KN_L : KN_R;
        load(v, stub, A); load(v, next, B);
        callback(A[0], A[1], A[2], A[0] - B[0], A[1] - B[1] + 0.2, A[2] - B[2]);
      }
    },
    /**
     * Steps the physics (fixed 120 Hz; bodies beyond the nearest few, or far from `focus`, at 60 Hz) and redraws
     * the bodies that moved. `focusX/Z` is where the camera looks.
     */
    update(dt: number, fx = focusX, fz = focusZ) {
      focusX = fx; focusZ = fz;
      frame++; clock += dt; frameDt = dt;
      if (!bodies.length) { movers.length = 0; accumulator = 0; if (dirty) flush(); return; }
      // The nearest awake bodies run at full rate; far ones lying still are put to sleep.
      awake.length = 0;
      for (const body of bodies) {
        const st = body.state;
        if (st.asleep) continue;
        body.focus = distanceToFocus(body);
        if (body.focus > SLEEP_FAR && st.grounded >= 4) { sleep(st); continue; }
        awake.push(body);
      }
      awake.sort((a, b) => a.focus - b.focus);
      accumulator = Math.min(accumulator + dt, STEP * 4);
      // A slow frame (more than two substeps to catch up) keeps only the nearest few at 120 Hz, so the cost of
      // a pile does not grow as the frame rate drops.
      const full = accumulator >= STEP * 3 ? Math.min(quality.fullRate, SLOW_FULL) : quality.fullRate;
      awake.forEach((body, i) => { body.full = i < full && body.focus < HALF_RATE_FAR; });
      while (accumulator >= STEP) {
        accumulator -= STEP;
        tick++;
        stepped.length = 0;
        for (const body of awake) {
          if (body.full) step(body.state, world, options, STEP);
          else if (((tick + body.slot) & 1) === 0) step(body.state, world, options, STEP * 2);
          else continue;
          body.lastTick = tick;
          body.synced = false;
          stepped.push(body);
        }
        if (stepped.length && bodies.length > 1) collideBodies(stepped);
      }
      movers.length = 0;
      for (const body of bodies) if (body.hat && !body.hatRest) { moveHat(body, dt); dirty = true; }
      let changed = dirty;
      for (const body of bodies) {
        const st = body.state;
        if (st.asleep && body.synced) continue;
        sync(body, st.asleep ? 1 : Math.min(1, ((tick - body.lastTick) * STEP + accumulator) / st.dt));
        body.synced = st.asleep;
        changed = true;
      }
      if (changed) flush();
    },
    /** Figure detail: 'hi' at quality levels 0-2, 'lo' at 3-5 (like the crowd). */
    setDetail(next: Detail) {
      if (next === detail) return;
      detail = next;
      bodyBatch.setGeometry(figureGeometry('body', next));
      armBatchL.setGeometry(figureGeometry('armL', next));
      armBatchR.setGeometry(figureGeometry('armR', next));
      legBatch.setGeometry(figureGeometry('leg', next));
    },
    /** Bodies in the pool, awake, and stepping at full rate (for the debug handle). */
    stats() {
      let up = 0, full = 0;
      for (const body of bodies) if (!body.state.asleep) { up++; if (body.full) full++; }
      return { bodies: bodies.length, awake: up, full, cap: quality.bodies, iterations: quality.iterations };
    },
    dispose() {
      for (const batch of batches) { scene.remove(batch.mesh); batch.dispose(); }
      for (const m of Object.values(materials)) m.dispose();
      bodies.length = 0;
      stumps.length = 0;
    },
  };
}
