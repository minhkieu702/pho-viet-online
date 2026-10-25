/**
 * Ragdoll physics, independent of three.js and of the city: ragdoll.ts hands it the ground function, the
 * colliders and a rest skeleton (derived from figures.ts FIGURE), and draws whatever the particles do.
 *
 * Every body is 20 anatomical particles (waist, hips, chest, neck, shoulders, head, elbows, wrists, knuckles,
 * knees, ankles, toes) plus 5 spares that become the stubs of severed parts. Position-based dynamics at a fixed
 * 120 Hz step (60 Hz for far bodies): a rigid pelvis triangle and chest tetrahedron joined by a spine that bends
 * and twists within limits, shoulder / hip / neck / spine cones, one-way elbow and knee hinges, wrist and ankle
 * ranges, cheap point-vs-capsule self collision, Coulomb ground friction with restitution, curb faces, wall
 * friction, buoyancy, rigid-motion damping and sleep. Every blow goes through one momentum-conserving impulse
 * (applyImpulse), so a hit turns the whole body instead of tearing its joints apart.
 *
 * Pure and allocation-free in the hot path; runs under `node --experimental-transform-types` for the tests.
 */

export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number; top?: number };
export type Ground = (x: number, z: number) => number;
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type BodyPart = 'head' | 'armL' | 'armR' | 'legL' | 'legR';
export type HitKind = 'bullet' | 'vehicle' | 'melee' | 'blast' | 'fall';
/** Active phase after the knock: limp (killed), brace (hands reach out to break the fall), stumble (legs still carry some weight). */
export type FallMode = 'limp' | 'brace' | 'stumble';

export const P = {
  PELVIS: 0, HIP_L: 1, HIP_R: 2, CHEST: 3, NECK: 4, SH_L: 5, SH_R: 6, HEAD: 7, EL_L: 8, EL_R: 9, WR_L: 10, WR_R: 11,
  HA_L: 12, HA_R: 13, KN_L: 14, KN_R: 15, AN_L: 16, AN_R: 17, TO_L: 18, TO_R: 19,
} as const;
const { PELVIS, HIP_L, HIP_R, CHEST, NECK, SH_L, SH_R, HEAD, EL_L, EL_R, WR_L, WR_R, HA_L, HA_R, KN_L, KN_R, AN_L, AN_R, TO_L, TO_R } = P;
export const JOINTS = 20, SPARES = 5, COUNT = JOINTS + SPARES;
export const STEP = 1 / 120;
export const GRAVITY = -24;
export const PARTS: readonly BodyPart[] = ['head', 'armL', 'armR', 'legL', 'legR'];

// ---------------------------------------------------------------------------------------------------------
// Skeleton.
// ---------------------------------------------------------------------------------------------------------

/**
 * Default rest pose in crowd-model units (feet at y = 0, facing +z, +x is the right side), proportioned from the
 * pre-redesign figures.ts FIGURE (hips 0.135/0.76, shoulders 0.33/1.47, head 1.87 r 0.27). Tests use it; the game
 * passes a skeleton derived from the current FIGURE instead.
 */
export const DEFAULT_POSE = Float32Array.from([
  0, 0.93, -0.03, -0.135, 0.76, 0, 0.135, 0.76, 0, // waist, hips
  0, 1.18, 0.05, 0, 1.55, -0.02, -0.33, 1.47, 0, 0.33, 1.47, 0, // chest (front of the lower ribs), neck (C7), shoulders
  0, 1.87, 0.015, // head
  -0.35, 1.18, -0.01, 0.35, 1.18, -0.01, // elbows
  -0.36, 0.91, 0.02, 0.36, 0.91, 0.02, // wrists
  -0.36, 0.8, 0.03, 0.36, 0.8, 0.03, // knuckles
  -0.13, 0.415, 0.015, 0.13, 0.415, 0.015, // knees
  -0.13, 0.1, -0.01, 0.13, 0.1, -0.01, // ankles
  -0.14, 0.03, 0.2, 0.14, 0.03, 0.2, // toes
]);
export const DEFAULT_RADIUS = Float32Array.from([0.17, 0.12, 0.12, 0.19, 0.08, 0.1, 0.1, 0.27, 0.08, 0.08, 0.065, 0.065, 0.06, 0.06, 0.1, 0.1, 0.075, 0.075, 0.05, 0.05]);
/** Mass fractions (Dempster/Winter segments lumped onto end particles; hands and toes clamped up for stability). */
export const DEFAULT_MASS = Float32Array.from([0.11, 0.1, 0.1, 0.14, 0.04, 0.064, 0.064, 0.081, 0.022, 0.022, 0.012, 0.012, 0.012, 0.012, 0.073, 0.073, 0.03, 0.03, 0.012, 0.012]);
/**
 * Buoyancy relative to gravity: lungs and belly float, limbs sink a little, so a body drifts at the surface with
 * its legs hanging (the waist and hips are a little more buoyant than the spec's table so the waist stays within
 * ~0.4 m of the surface whichever way the body went in).
 */
const FLOAT = Float32Array.from([1.4, 1.1, 1.1, 1.5, 1.1, 1.05, 1.05, 1, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95]);
/** Mass of the stub particle a severed part keeps at its cut end. */
const STUB_MASS = 0.02;

export type Vec3 = readonly [number, number, number];
/** Centre-line points plus the left-side joints (the right side mirrors x), in model units. */
export type Landmarks = {
  pelvis: Vec3; chest: Vec3; neck: Vec3; head: Vec3;
  hip: Vec3; shoulder: Vec3; elbow: Vec3; wrist: Vec3; hand: Vec3; knee: Vec3; ankle: Vec3; toe: Vec3;
};

/** Packs named landmarks into the 20-particle rest pose (left side at -|x|, right side at +|x|). */
export function poseFromLandmarks(l: Landmarks): Float32Array {
  const out = new Float32Array(JOINTS * 3);
  const put = (i: number, v: Vec3, side: number) => { out[i * 3] = side ? side * Math.abs(v[0]) : v[0]; out[i * 3 + 1] = v[1]; out[i * 3 + 2] = v[2]; };
  put(PELVIS, l.pelvis, 0); put(CHEST, l.chest, 0); put(NECK, l.neck, 0); put(HEAD, l.head, 0);
  const pairs: [number, number, Vec3][] = [[HIP_L, HIP_R, l.hip], [SH_L, SH_R, l.shoulder], [EL_L, EL_R, l.elbow], [WR_L, WR_R, l.wrist],
    [HA_L, HA_R, l.hand], [KN_L, KN_R, l.knee], [AN_L, AN_R, l.ankle], [TO_L, TO_R, l.toe]];
  for (const [left, right, v] of pairs) { put(left, v, -1); put(right, v, 1); }
  return out;
}

export type SkeletonDesc = { pose: ArrayLike<number>; radius?: ArrayLike<number>; mass?: ArrayLike<number> };
export type Skeleton = {
  /** 20 rest positions (x, y, z) in model units. */
  readonly pose: Float32Array;
  readonly radius: Float32Array;
  readonly mass: Float32Array;
  /** Cones [frame, joint, child, axis x y z, max angle]; the spine and neck axes are the rest pose's own directions. */
  readonly cones: Float64Array;
  /** Self collision [point, capsule a, capsule b, capsule radius] in model units. */
  readonly self: Float64Array;
  /** Capsule radius per stick for raycasts (model units, 0 = not hit-tested). */
  readonly rayRadius: Float32Array;
  /** Farthest rest distance from the waist to a particle surface, for quick rejects. */
  readonly reach: number;
};

// Rigid sticks: pelvis triangle, chest tetrahedron (chest in front, neck behind), spine, neck, then each limb.
const STICKS = Int8Array.from([
  HIP_L, HIP_R, HIP_L, PELVIS, HIP_R, PELVIS,
  CHEST, NECK, CHEST, SH_L, CHEST, SH_R, NECK, SH_L, NECK, SH_R, SH_L, SH_R,
  PELVIS, CHEST, NECK, HEAD,
  SH_L, EL_L, EL_L, WR_L, WR_L, HA_L, SH_R, EL_R, EL_R, WR_R, WR_R, HA_R,
  HIP_L, KN_L, KN_L, AN_L, AN_L, TO_L, HIP_R, KN_R, KN_R, AN_R, AN_R, TO_R,
]);
export const STICK_COUNT = STICKS.length / 2;
/** Which part each stick belongs to (index into PARTS, -1 for the torso). */
const STICK_PART = Int8Array.from({ length: STICK_COUNT }, (_, k) => {
  const a = STICKS[k * 2], b = STICKS[k * 2 + 1];
  if (a === NECK && b === HEAD) return 0;
  const limb = (l: number[], r: number[]) => (l.includes(b) ? 1 : r.includes(b) ? 2 : -1);
  const arm = limb([EL_L, WR_L, HA_L], [EL_R, WR_R, HA_R]);
  if (arm > 0) return arm;
  const leg = limb([KN_L, AN_L, TO_L], [KN_R, AN_R, TO_R]);
  return leg > 0 ? leg + 2 : -1;
});
// Distance ranges [a, b, min, max] as fractions of the rest length: spine bend/twist, neck tilt, legs apart.
const RANGES: [number, number, number, number][] = [
  [HIP_L, SH_L, 0.9, 1.04], [HIP_R, SH_R, 0.9, 1.04], [HIP_L, SH_R, 0.92, 1.04], [HIP_R, SH_L, 0.92, 1.04],
  [PELVIS, NECK, 0.9, 1.02], [HIP_L, CHEST, 0.82, 1.06], [HIP_R, CHEST, 0.82, 1.06],
  [HEAD, CHEST, 0.8, 1.03], [HEAD, SH_L, 0.82, 1.1], [HEAD, SH_R, 0.82, 1.1],
  [KN_L, KN_R, 0.55, 99], [AN_L, AN_R, 0.45, 99], [TO_L, TO_R, 0.4, 99],
];
const RANGE_I = Int8Array.from(RANGES.flatMap(([a, b]) => [a, b]));
const D = Math.PI / 180;
// Cones in a torso frame (0 pelvis, 1 chest): [frame, joint, child, axis (left side; right mirrors x), max angle].
// Shoulder: hanging arm, arms overhead, hugging, ~50° back, never behind the back. Hip: 120° flexion, 25° extension,
// ~60° abduction. Neck and spine axes are replaced by the skeleton's rest directions.
const CONE_BASE: number[][] = [
  [1, SH_L, EL_L, -0.707, 0, 0.707, 100 * D], [1, SH_R, EL_R, 0.707, 0, 0.707, 100 * D],
  [0, HIP_L, KN_L, -0.15, -0.7, 0.7, 72 * D], [0, HIP_R, KN_R, 0.15, -0.7, 0.7, 72 * D],
  [1, NECK, HEAD, 0, 0.95, 0.3, 38 * D],
  [0, PELVIS, NECK, 0, 0.98, 0.2, 26 * D],
];
// Hinges: [frame, root, joint, child, reference bone direction (frame space), hinge axis at the reference, min, max].
// The swing reference (T-pose for arms, hanging for legs) is never near 180° inside the cones, so it never flips.
const HINGE_F = Float64Array.from([
  1, SH_L, EL_L, WR_L, -1, 0, 0, 0, 1, 0, -3 * D, 145 * D,
  1, SH_R, EL_R, WR_R, 1, 0, 0, 0, -1, 0, -3 * D, 145 * D,
  0, HIP_L, KN_L, AN_L, 0, -1, 0, 1, 0, 0, -2 * D, 150 * D,
  0, HIP_R, KN_R, AN_R, 0, -1, 0, 1, 0, 0, -2 * D, 150 * D,
]);
// Angle ranges between two bones sharing a joint: [root, joint, child, min, max] (wrists, ankles).
const BEND_F = Float64Array.from([
  EL_L, WR_L, HA_L, 0, 65 * D, EL_R, WR_R, HA_R, 0, 65 * D,
  KN_L, AN_L, TO_L, 55 * D, 125 * D, KN_R, AN_R, TO_R, 55 * D, 125 * D,
]);
const CONE_BIT = 0, HINGE_BIT = 6, RANGE_BIT = 10;
/** Per part: torso particle it hangs from, first joint, the joint after it, joining stick, cone, hinge, ranges to drop. */
const PART_INFO = PARTS.map((part) => {
  const head = part === 'head', arm = part.startsWith('arm'), left = part.endsWith('L');
  const root = head ? NECK : arm ? (left ? SH_L : SH_R) : left ? HIP_L : HIP_R;
  const joint = head ? HEAD : arm ? (left ? EL_L : EL_R) : left ? KN_L : KN_R;
  const child = head ? -1 : arm ? (left ? WR_L : WR_R) : left ? AN_L : AN_R;
  let stick = -1;
  for (let k = 0; k < STICK_COUNT; k++) if (STICKS[k * 2] === root && STICKS[k * 2 + 1] === joint) stick = k;
  const cone = CONE_BASE.findIndex((c) => c[1] === root && c[2] === joint);
  const hinge = head ? -1 : (arm ? 0 : 2) + (left ? 0 : 1);
  const ranges = head ? [7, 8, 9] : arm ? [] : [10, 11, 12];
  const probes = head ? [HEAD, NECK] : arm ? (left ? [EL_L, WR_L, HA_L] : [EL_R, WR_R, HA_R]) : left ? [KN_L, AN_L, TO_L] : [KN_R, AN_R, TO_R];
  return { root, joint, child, stick, cone, hinge, ranges, probes, bendMax: (arm ? 145 : 150) * D };
});

// Torso frames, 9 floats each (x, y, z axes): pelvis at 0, chest at 9, rebuilt on every limit pass; tv is the
// scratch result of toWorld().
const frames = new Float64Array(18);
const tv = new Float64Array(3);

/** Builds the constraint tables for a rest skeleton. Call once at load (ragdoll.ts derives the pose from FIGURE). */
export function createSkeleton(desc: SkeletonDesc): Skeleton {
  if (desc.pose.length < JOINTS * 3) throw new Error('ragdoll skeleton needs 20 rest positions');
  const pose = Float32Array.from({ length: JOINTS * 3 }, (_, i) => desc.pose[i]);
  const radius = Float32Array.from({ length: JOINTS }, (_, i) => (desc.radius ?? DEFAULT_RADIUS)[i]);
  const mass = Float32Array.from({ length: JOINTS }, (_, i) => (desc.mass ?? DEFAULT_MASS)[i]);
  // The spine and neck cones are centred on the rest pose's own bone directions, expressed in the torso frames.
  buildFrames(pose);
  const cones = Float64Array.from(CONE_BASE.flatMap((c) => {
    const [frame, joint, child, , , , max] = c;
    let [, , , ax, ay, az] = c;
    if (joint === NECK || joint === PELVIS) {
      let dx = pose[child * 3] - pose[joint * 3], dy = pose[child * 3 + 1] - pose[joint * 3 + 1], dz = pose[child * 3 + 2] - pose[joint * 3 + 2];
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      const o = frame * 9;
      ax = dx * frames[o] + dy * frames[o + 1] + dz * frames[o + 2];
      ay = dx * frames[o + 3] + dy * frames[o + 4] + dz * frames[o + 5];
      az = dx * frames[o + 6] + dy * frames[o + 7] + dz * frames[o + 8];
    }
    const n = Math.hypot(ax, ay, az) || 1;
    return [frame, joint, child, ax / n, ay / n, az / n, max];
  }));
  const r = radius;
  const abdomen = Math.max(r[PELVIS], r[CHEST]) * 1.05, thorax = r[CHEST];
  const thigh = (r[HIP_L] + r[KN_L]) / 2, shin = (r[KN_L] + r[AN_L]) / 2;
  const self: number[] = [];
  // Arms stay out of the torso, knees and feet out of the other leg, hands out of the thighs and the head.
  for (const pt of [EL_L, EL_R, WR_L, WR_R, HA_L, HA_R]) self.push(pt, PELVIS, CHEST, abdomen, pt, CHEST, NECK, thorax);
  self.push(KN_L, HIP_R, KN_R, thigh, KN_R, HIP_L, KN_L, thigh, AN_L, KN_R, AN_R, shin, AN_R, KN_L, AN_L, shin, TO_L, KN_R, AN_R, shin, TO_R, KN_L, AN_L, shin);
  self.push(HA_L, HIP_L, KN_L, thigh, HA_L, HIP_R, KN_R, thigh, HA_R, HIP_L, KN_L, thigh, HA_R, HIP_R, KN_R, thigh, HA_L, HEAD, HEAD, r[HEAD], HA_R, HEAD, HEAD, r[HEAD]);
  const rayRadius = Float32Array.from({ length: STICK_COUNT }, (_, k) => {
    const a = STICKS[k * 2], b = STICKS[k * 2 + 1];
    if (a === PELVIS && b === CHEST) return abdomen;
    if (a === CHEST && b === NECK) return thorax;
    if (a === HIP_L && b === HIP_R) return r[HIP_L];
    if (a === SH_L && b === SH_R || a === CHEST && (b === SH_L || b === SH_R)) return r[SH_L];
    if (STICK_PART[k] < 0) return 0; // the remaining torso braces are covered by the capsules above
    return a === NECK ? r[NECK] : (r[a] + r[b]) / 2;
  });
  let reach = 0;
  for (let i = 0; i < JOINTS; i++) {
    reach = Math.max(reach, Math.hypot(pose[i * 3] - pose[0], pose[i * 3 + 1] - pose[1], pose[i * 3 + 2] - pose[2]) + r[i]);
  }
  return { pose, radius, mass, cones, self: Float64Array.from(self), rayRadius, reach };
}

export const DEFAULT_SKELETON = createSkeleton({ pose: DEFAULT_POSE, radius: DEFAULT_RADIUS, mass: DEFAULT_MASS });

// ---------------------------------------------------------------------------------------------------------
// Body state.
// ---------------------------------------------------------------------------------------------------------

export type RagdollState = {
  /** The rest skeleton this body was built from (cone axes, capsule radii). */
  skel: Skeleton;
  /** Particle positions (x, y, z) in world metres; the first `n` particles are live. */
  pos: Float32Array;
  /** Verlet previous positions: velocity is (pos - prev) / dt. */
  prev: Float32Array;
  /** Positions before the latest substep, for render interpolation (see interpolate()). */
  shown: Float32Array;
  /** Inverse masses, radii (m) and buoyancy per particle; spares take the stub's values. */
  w: Float32Array; r: Float32Array; buoy: Float32Array;
  /** Per-body copies of the stick table (re-pointed when a part is severed) and its rest lengths (m). */
  sticks: Int8Array; rest: Float32Array;
  /** [min, max] metres per range constraint; min 0 disables it. */
  ranges: Float32Array;
  /** Self collision [point, capsule a, capsule b, min distance (m)]. */
  self: Float32Array;
  /** Cut-limb bends [root, joint, child] x 4 (root -1 = unused) that replace an elbow or knee hinge. */
  cutBends: Int8Array;
  /** Hinge axes (elbow L, R, knee L, R) from the last limit pass, for orienting hands and feet. */
  axis: Float32Array;
  floor: Float32Array; floorPrev: Float32Array; fx: Float32Array; fz: Float32Array; pen: Float32Array; vin: Float32Array;
  wall: Float32Array; nx: Int8Array; nz: Int8Array;
  /** Vehicle contact per particle this step (mover index + 1, 0 = none) and its face normal. */
  mv: Int8Array; mn: Float32Array;
  /** Colliders near the body (kept by the grid broadphase, or by the caller when no grid is given). */
  nearby: Collider[];
  qMinX: number; qMaxX: number; qMinZ: number; qMaxZ: number;
  /** Live particles: 20 plus one spare per severed part. */
  n: number;
  /** Horizontal scale (BODY_SCALE x style width) used for radii and capsules; height scale for the rest pose's y. */
  k: number; ky: number;
  mass: number; reach: number;
  /** Bit masks: disabled cones (bits 0-5) / hinges (6-9) / ranges (10-22), and severed parts (bit = PARTS index). */
  off: number; cut: number;
  /** Spare particle index of each severed part's stub (by PARTS index), -1 while attached. */
  stub: Int8Array;
  /** Current step length (STEP or 2 x STEP for far bodies). */
  dt: number;
  age: number; tone: number; toneMax: number; toneUntil: number; toneSpan: number; bracing: boolean;
  stumble: number; stumbleSpan: number; stepAt: number;
  /** Seconds of stillness (every part slow), of idling (the body as a whole slow) and afloat. */
  calm: number; idle: number; wet: number;
  /** Mass-weighted RMS speed (m/s) and particles touching the ground or a wall, from the last step. */
  speed: number; contacts: number; grounded: number;
  asleep: boolean;
};

export type Placement = {
  x: number; y: number; z: number; yaw: number;
  /** Figure scale (BODY_SCALE); width and height are the person's build (styleOf). */
  scale: number; width?: number; height?: number;
  mode?: FallMode;
  /** Optional posed start (20 x xyz in model units, same frame as the skeleton), e.g. the animated figure. */
  pose?: ArrayLike<number>;
  /** Ground under the particles, so the first step knows where the curbs are. */
  ground?: Ground;
};

const MODES: Record<FallMode, { tone: number; span: number; reach: boolean; stumble: number }> = {
  limp: { tone: 0.3, span: 0.25, reach: false, stumble: 0 },
  brace: { tone: 1, span: 0.9, reach: true, stumble: 0 },
  stumble: { tone: 1, span: 0.9, reach: true, stumble: 0.5 },
};

/** A body standing at rest in the skeleton's pose (no velocity yet: follow with launch() or applyImpulse()). */
export function createState(skel: Skeleton, at: Placement): RagdollState {
  const pos = new Float32Array(COUNT * 3), w = new Float32Array(COUNT), r = new Float32Array(COUNT), buoy = new Float32Array(COUNT);
  const width = at.width ?? 1, height = at.height ?? 1, k = at.scale * width, ky = at.scale * height;
  const c = Math.cos(at.yaw), s = Math.sin(at.yaw);
  const place = (src: ArrayLike<number>) => {
    for (let i = 0; i < JOINTS; i++) {
      const lx = src[i * 3] * k, ly = src[i * 3 + 1] * ky, lz = src[i * 3 + 2] * k;
      pos[i * 3] = at.x + lx * c + lz * s; pos[i * 3 + 1] = at.y + ly; pos[i * 3 + 2] = at.z - lx * s + lz * c;
    }
  };
  place(skel.pose);
  let mass = 0;
  for (let i = 0; i < JOINTS; i++) { w[i] = 1 / skel.mass[i]; r[i] = skel.radius[i] * k; buoy[i] = FLOAT[i]; mass += skel.mass[i]; }
  // Lengths and ranges always come from the rest skeleton, even when the body starts from a pose.
  const sticks = Int8Array.from(STICKS);
  const rest = new Float32Array(STICK_COUNT);
  for (let q = 0; q < STICK_COUNT; q++) rest[q] = dist(pos, sticks[q * 2], sticks[q * 2 + 1]);
  const ranges = new Float32Array(RANGES.length * 2);
  RANGES.forEach(([a, b, lo, hi], q) => { const d = dist(pos, a, b); ranges[q * 2] = d * lo; ranges[q * 2 + 1] = d * hi; });
  const self = new Float32Array(skel.self.length);
  for (let q = 0; q < skel.self.length; q += 4) {
    self[q] = skel.self[q]; self[q + 1] = skel.self[q + 1]; self[q + 2] = skel.self[q + 2];
    self[q + 3] = skel.self[q + 3] * k + r[skel.self[q]];
  }
  if (at.pose) place(at.pose);
  const floorPrev = new Float32Array(COUNT);
  for (let i = 0; i < JOINTS; i++) floorPrev[i] = at.ground ? at.ground(pos[i * 3], pos[i * 3 + 2]) : at.y;
  const mode = MODES[at.mode ?? 'brace'];
  const reach = skel.reach * Math.max(k, ky);
  return {
    skel, pos, prev: Float32Array.from(pos), shown: Float32Array.from(pos), w, r, buoy, sticks, rest, ranges, self,
    cutBends: new Int8Array(12).fill(-1), axis: new Float32Array(12),
    floor: Float32Array.from(floorPrev), floorPrev, fx: new Float32Array(COUNT), fz: new Float32Array(COUNT), pen: new Float32Array(COUNT),
    vin: new Float32Array(COUNT), wall: new Float32Array(COUNT), nx: new Int8Array(COUNT), nz: new Int8Array(COUNT),
    mv: new Int8Array(COUNT), mn: new Float32Array(COUNT * 3), nearby: [], qMinX: Infinity, qMaxX: -Infinity, qMinZ: Infinity, qMaxZ: -Infinity,
    n: JOINTS, k, ky, mass, reach, off: 0, cut: 0, stub: new Int8Array(PARTS.length).fill(-1), dt: STEP,
    age: 0, tone: mode.tone, toneMax: mode.tone, toneUntil: mode.span, toneSpan: mode.span, bracing: mode.reach,
    stumble: mode.stumble, stumbleSpan: mode.stumble || 1, stepAt: mode.stumble ? 0.25 : 0,
    calm: 0, idle: 0, wet: 0, speed: 0, contacts: 0, grounded: 0, asleep: false,
  };
}

function dist(p: Float32Array, a: number, b: number) {
  return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
}

// ---------------------------------------------------------------------------------------------------------
// Collider broadphase: a uniform grid of collider indices (colliders are static after the world is built).
// ---------------------------------------------------------------------------------------------------------

export type ColliderGrid = {
  readonly colliders: readonly Collider[]; readonly cell: number; readonly minX: number; readonly minZ: number;
  readonly cols: number; readonly rows: number; readonly start: Int32Array; readonly items: Int32Array;
  stamp: Uint32Array; tick: number;
};

export function createColliderGrid(colliders: readonly Collider[], cell = 8): ColliderGrid {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const c of colliders) { minX = Math.min(minX, c.minX); minZ = Math.min(minZ, c.minZ); maxX = Math.max(maxX, c.maxX); maxZ = Math.max(maxZ, c.maxZ); }
  if (!colliders.length) { minX = minZ = 0; maxX = maxZ = cell; }
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell)), rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const cellOf = (v: number, lo: number, count: number) => Math.min(count - 1, Math.max(0, Math.floor((v - lo) / cell)));
  const start = new Int32Array(cols * rows + 1);
  const each = (fn: (cellIndex: number, id: number) => void) => colliders.forEach((c, id) => {
    for (let gz = cellOf(c.minZ, minZ, rows); gz <= cellOf(c.maxZ, minZ, rows); gz++) {
      for (let gx = cellOf(c.minX, minX, cols); gx <= cellOf(c.maxX, minX, cols); gx++) fn(gz * cols + gx, id);
    }
  });
  each((ci) => { start[ci + 1]++; });
  for (let i = 0; i < cols * rows; i++) start[i + 1] += start[i];
  const items = new Int32Array(start[cols * rows]), fill = start.slice(0, cols * rows);
  each((ci, id) => { items[fill[ci]++] = id; });
  return { colliders, cell, minX, minZ, cols, rows, start, items, stamp: new Uint32Array(colliders.length), tick: 0 };
}

/** Colliders overlapping a box on the ground plane, written into `out`. */
export function queryColliders(grid: ColliderGrid, minX: number, minZ: number, maxX: number, maxZ: number, out: Collider[]) {
  out.length = 0;
  if (++grid.tick > 0xfffffff0) { grid.stamp.fill(0); grid.tick = 1; }
  const tick = grid.tick, cell = grid.cell;
  const gx0 = Math.max(0, Math.floor((minX - grid.minX) / cell)), gx1 = Math.min(grid.cols - 1, Math.floor((maxX - grid.minX) / cell));
  const gz0 = Math.max(0, Math.floor((minZ - grid.minZ) / cell)), gz1 = Math.min(grid.rows - 1, Math.floor((maxZ - grid.minZ) / cell));
  for (let gz = gz0; gz <= gz1; gz++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const ci = gz * grid.cols + gx;
      for (let j = grid.start[ci]; j < grid.start[ci + 1]; j++) {
        const id = grid.items[j];
        if (grid.stamp[id] === tick) continue;
        grid.stamp[id] = tick;
        const c = grid.colliders[id];
        if (c.maxX > minX && c.minX < maxX && c.maxZ > minZ && c.minZ < maxZ) out.push(c);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Constraint solvers.
// ---------------------------------------------------------------------------------------------------------

function buildFrames(p: Float32Array) {
  frameFrom(p, HIP_L, HIP_R, PELVIS, -1, 0); // x hip to hip, y from mid-hips toward the waist
  frameFrom(p, SH_L, SH_R, NECK, CHEST, 9); // x shoulder to shoulder, y from the chest particle to the neck
}
function frameFrom(p: Float32Array, l: number, rr: number, up: number, base: number, o: number) {
  let xx = p[rr * 3] - p[l * 3], xy = p[rr * 3 + 1] - p[l * 3 + 1], xz = p[rr * 3 + 2] - p[l * 3 + 2];
  let n = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1; xx /= n; xy /= n; xz /= n;
  let yx: number, yy: number, yz: number;
  if (base < 0) { yx = p[up * 3] - (p[l * 3] + p[rr * 3]) / 2; yy = p[up * 3 + 1] - (p[l * 3 + 1] + p[rr * 3 + 1]) / 2; yz = p[up * 3 + 2] - (p[l * 3 + 2] + p[rr * 3 + 2]) / 2; }
  else { yx = p[up * 3] - p[base * 3]; yy = p[up * 3 + 1] - p[base * 3 + 1]; yz = p[up * 3 + 2] - p[base * 3 + 2]; }
  const d = yx * xx + yy * xy + yz * xz; yx -= xx * d; yy -= xy * d; yz -= xz * d;
  n = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1; yx /= n; yy /= n; yz /= n;
  frames[o] = xx; frames[o + 1] = xy; frames[o + 2] = xz;
  frames[o + 3] = yx; frames[o + 4] = yy; frames[o + 5] = yz;
  frames[o + 6] = xy * yz - xz * yy; frames[o + 7] = xz * yx - xx * yz; frames[o + 8] = xx * yy - xy * yx;
}
function toWorld(o: number, x: number, y: number, z: number) {
  tv[0] = frames[o] * x + frames[o + 3] * y + frames[o + 6] * z;
  tv[1] = frames[o + 1] * x + frames[o + 4] * y + frames[o + 7] * z;
  tv[2] = frames[o + 2] * x + frames[o + 5] * y + frames[o + 8] * z;
}

/** Distance constraint: mode 0 exact, -1 minimum only, 1 maximum only. */
function solveDistance(p: Float32Array, w: Float32Array, a: number, b: number, target: number, mode: number) {
  const ia = a * 3, ib = b * 3;
  const dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  if (mode < 0 && d >= target) return;
  if (mode > 0 && d <= target) return;
  const wa = w[a], wb = w[b];
  const f = (d - target) / d / (wa + wb);
  p[ia] += dx * f * wa; p[ia + 1] += dy * f * wa; p[ia + 2] += dz * f * wa;
  p[ib] -= dx * f * wb; p[ib + 1] -= dy * f * wb; p[ib + 2] -= dz * f * wb;
}

/** Turns the bone joint→child toward unit direction (tx, ty, tz) keeping its length; the child takes the larger share. */
function steer(p: Float32Array, w: Float32Array, joint: number, child: number, len: number, tx: number, ty: number, tz: number, stiffness: number) {
  const ij = joint * 3, ic = child * 3;
  const gx = p[ij] + tx * len - p[ic], gy = p[ij + 1] + ty * len - p[ic + 1], gz = p[ij + 2] + tz * len - p[ic + 2];
  const wc = w[child], wj = w[joint], s = stiffness / (wc + wj);
  p[ic] += gx * wc * s; p[ic + 1] += gy * wc * s; p[ic + 2] += gz * wc * s;
  p[ij] -= gx * wj * s; p[ij + 1] -= gy * wj * s; p[ij + 2] -= gz * wj * s;
}

function solveCone(b: RagdollState, frame: number, joint: number, child: number, ax: number, ay: number, az: number, max: number) {
  const p = b.pos, ij = joint * 3, ic = child * 3;
  let dx = p[ic] - p[ij], dy = p[ic + 1] - p[ij + 1], dz = p[ic + 2] - p[ij + 2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6; dx /= len; dy /= len; dz /= len;
  toWorld(frame * 9, ax, ay, az);
  const wx = tv[0], wy = tv[1], wz = tv[2];
  const c = dx * wx + dy * wy + dz * wz, cm = Math.cos(max);
  if (c >= cm) return;
  let px = dx - wx * c, py = dy - wy * c, pz = dz - wz * c;
  const n = Math.sqrt(px * px + py * py + pz * pz);
  if (n < 1e-5) { px = frames[frame * 9 + 6]; py = frames[frame * 9 + 7]; pz = frames[frame * 9 + 8]; } else { px /= n; py /= n; pz /= n; }
  const sm = Math.sin(max);
  steer(p, b.w, joint, child, len, wx * cm + px * sm, wy * cm + py * sm, wz * cm + pz * sm, 1);
}

let hingeSide = 0;
/**
 * Elbow or knee `slot` (0-3): measures the signed bend in the hinge plane and, when `apply`, clamps it to the
 * limits and removes sideways bend. The axis is the frame's axis carried by the minimal swing from the
 * reference direction to the parent bone (parallel transport), so it never flips. Returns the angle.
 */
function solveHinge(b: RagdollState, slot: number, apply: boolean) {
  const k = slot * 12, frame = HINGE_F[k], root = HINGE_F[k + 1], joint = HINGE_F[k + 2], child = HINGE_F[k + 3];
  const p = b.pos, ir = root * 3, ij = joint * 3, ic = child * 3;
  let ux = p[ij] - p[ir], uy = p[ij + 1] - p[ir + 1], uz = p[ij + 2] - p[ir + 2];
  let n = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1e-6; ux /= n; uy /= n; uz /= n;
  let dx = p[ic] - p[ij], dy = p[ic + 1] - p[ij + 1], dz = p[ic + 2] - p[ij + 2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6; dx /= len; dy /= len; dz /= len;
  toWorld(frame * 9, HINGE_F[k + 4], HINGE_F[k + 5], HINGE_F[k + 6]); const ax = tv[0], ay = tv[1], az = tv[2];
  toWorld(frame * 9, HINGE_F[k + 7], HINGE_F[k + 8], HINGE_F[k + 9]); let hx = tv[0], hy = tv[1], hz = tv[2];
  // Rotate h by the minimal rotation a -> u (Rodrigues with q = (1 + a.u, a x u)).
  const cw = 1 + ax * ux + ay * uy + az * uz;
  if (cw > 1e-4) {
    const qx = ay * uz - az * uy, qy = az * ux - ax * uz, qz = ax * uy - ay * ux;
    const qn = Math.sqrt(cw * cw + qx * qx + qy * qy + qz * qz);
    const s = cw / qn, vx = qx / qn, vy = qy / qn, vz = qz / qn;
    const cx = vy * hz - vz * hy, cy = vz * hx - vx * hz, cz = vx * hy - vy * hx;
    const ccx = vy * cz - vz * cy, ccy = vz * cx - vx * cz, ccz = vx * cy - vy * cx;
    hx += 2 * (s * cx + ccx); hy += 2 * (s * cy + ccy); hz += 2 * (s * cz + ccz);
  }
  const hd = hx * ux + hy * uy + hz * uz; hx -= ux * hd; hy -= uy * hd; hz -= uz * hd;
  n = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1; hx /= n; hy /= n; hz /= n;
  b.axis[slot * 3] = hx; b.axis[slot * 3 + 1] = hy; b.axis[slot * 3 + 2] = hz;
  const side = dx * hx + dy * hy + dz * hz;
  const qx = dx - hx * side, qy = dy - hy * side, qz = dz - hz * side;
  const cosA = qx * ux + qy * uy + qz * uz;
  const sinA = (uy * qz - uz * qy) * hx + (uz * qx - ux * qz) * hy + (ux * qy - uy * qx) * hz;
  const angle = Math.atan2(sinA, cosA);
  hingeSide = side;
  if (!apply) return angle;
  const lo = HINGE_F[k + 10], hi = HINGE_F[k + 11];
  const clamped = angle < lo ? lo : angle > hi ? hi : angle;
  // Sideways bend is removed gradually (a dead band with a hard snap makes a hanging foot tick back and forth).
  const sideFix = Math.min(0.5, Math.max(0, (Math.abs(side) - 0.02) * 10));
  if (clamped === angle && sideFix === 0) return angle;
  // Target: the parent bone rotated about h by the clamped angle, inside the hinge plane.
  const bx = hy * uz - hz * uy, by = hz * ux - hx * uz, bz = hx * uy - hy * ux; // h x u
  const c = Math.cos(clamped), s = Math.sin(clamped);
  steer(p, b.w, joint, child, len, ux * c + bx * s, uy * c + by * s, uz * c + bz * s, clamped === angle ? sideFix : 1);
  return angle;
}

function solveBend(b: RagdollState, root: number, joint: number, child: number, lo: number, hi: number) {
  const p = b.pos, ir = root * 3, ij = joint * 3, ic = child * 3;
  let ux = p[ij] - p[ir], uy = p[ij + 1] - p[ir + 1], uz = p[ij + 2] - p[ir + 2];
  const n = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1e-6; ux /= n; uy /= n; uz /= n;
  let dx = p[ic] - p[ij], dy = p[ic + 1] - p[ij + 1], dz = p[ic + 2] - p[ij + 2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6; dx /= len; dy /= len; dz /= len;
  const c = ux * dx + uy * dy + uz * dz, angle = Math.acos(c < -1 ? -1 : c > 1 ? 1 : c);
  if (angle >= lo && angle <= hi) return;
  const target = angle < lo ? lo : hi;
  let px = dx - ux * c, py = dy - uy * c, pz = dz - uz * c;
  const m = Math.sqrt(px * px + py * py + pz * pz);
  if (m < 1e-5) return;
  px /= m; py /= m; pz /= m;
  const ct = Math.cos(target), st = Math.sin(target);
  steer(p, b.w, joint, child, len, ux * ct + px * st, uy * ct + py * st, uz * ct + pz * st, 1);
}

// The chest turns against the pelvis about the spine by at most TWIST_MAX (thoracic + lumbar axial rotation).
const TWIST_MAX = 40 * D;
const CHEST_SET = [SH_L, SH_R, CHEST, NECK], PELVIS_SET = [HIP_L, HIP_R, PELVIS];
/** Turns particles `set` by `angle` about the unit axis (ax, ay, az) through their centre (x, y, z). */
function turnSet(p: Float32Array, set: readonly number[], ox: number, oy: number, oz: number, ax: number, ay: number, az: number, angle: number) {
  const c = Math.cos(angle), sn = Math.sin(angle), k = 1 - c;
  for (const i of set) {
    const o = i * 3, rx = p[o] - ox, ry = p[o + 1] - oy, rz = p[o + 2] - oz;
    const d = (ax * rx + ay * ry + az * rz) * k;
    p[o] = ox + rx * c + (ay * rz - az * ry) * sn + ax * d;
    p[o + 1] = oy + ry * c + (az * rx - ax * rz) * sn + ay * d;
    p[o + 2] = oz + rz * c + (ax * ry - ay * rx) * sn + az * d;
  }
}
/**
 * Spine twist: the shoulder line against the hip line about the spine (both measured across it, from this limit
 * pass's frames). Past TWIST_MAX the chest and the pelvis are turned back toward each other, each by the other's
 * share of their mass, as rigid sets (the distance ranges barely notice a twist).
 */
function solveTwist(b: RagdollState) {
  const p = b.pos, w = b.w;
  let sx = frames[3] + frames[12], sy = frames[4] + frames[13], sz = frames[5] + frames[14];
  let n = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (n < 1e-6) return;
  sx /= n; sy /= n; sz /= n;
  let ax = frames[0], ay = frames[1], az = frames[2], d = ax * sx + ay * sy + az * sz;
  ax -= sx * d; ay -= sy * d; az -= sz * d;
  let cx = frames[9], cy = frames[10], cz = frames[11];
  d = cx * sx + cy * sy + cz * sz;
  cx -= sx * d; cy -= sy * d; cz -= sz * d;
  const twist = Math.atan2((ay * cz - az * cy) * sx + (az * cx - ax * cz) * sy + (ax * cy - ay * cx) * sz, ax * cx + ay * cy + az * cz);
  const excess = twist > TWIST_MAX ? twist - TWIST_MAX : twist < -TWIST_MAX ? twist + TWIST_MAX : 0;
  if (excess === 0) return;
  const mc = 1 / w[SH_L] + 1 / w[SH_R] + 1 / w[CHEST] + 1 / w[NECK], mp = 1 / w[HIP_L] + 1 / w[HIP_R] + 1 / w[PELVIS];
  n = 1 / (mc + mp);
  const sl = SH_L * 3, sr = SH_R * 3, hl = HIP_L * 3, hr = HIP_R * 3;
  turnSet(p, CHEST_SET, (p[sl] + p[sr]) / 2, (p[sl + 1] + p[sr + 1]) / 2, (p[sl + 2] + p[sr + 2]) / 2, sx, sy, sz, -excess * mp * n);
  turnSet(p, PELVIS_SET, (p[hl] + p[hr]) / 2, (p[hl + 1] + p[hr + 1]) / 2, (p[hl + 2] + p[hr + 2]) / 2, sx, sy, sz, excess * mc * n);
}

// The foot turns about the shin by at most FOOT_TURN from the knee's forward direction (shin rotation at the
// knee plus a little at the ankle), so a foot cannot spin round the leg.
const FOOT_TURN = 35 * D;
const FEET = Int8Array.from([KN_L, AN_L, TO_L, KN_R, AN_R, TO_R]);
/**
 * Knee hinge `slot` (2 left, 3 right): uses the hinge axis this limit pass just stored. A foot on the street or
 * against a curb or wall is left to its contact (turning it there would only stretch it against the contact).
 */
function solveFoot(b: RagdollState, slot: number) {
  const p = b.pos, f6 = (slot - 2) * 3, toe = FEET[f6 + 2], kn = FEET[f6] * 3, an = FEET[f6 + 1] * 3, to = toe * 3;
  if (p[to + 1] - b.r[toe] < b.floor[toe] + 0.01 || b.wall[toe] > 0 || b.wall[FEET[f6 + 1]] > 0) return;
  const hx = b.axis[slot * 3], hy = b.axis[slot * 3 + 1], hz = b.axis[slot * 3 + 2];
  let dx = p[an] - p[kn], dy = p[an + 1] - p[kn + 1], dz = p[an + 2] - p[kn + 2];
  let n = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (n < 1e-6) return;
  dx /= n; dy /= n; dz /= n;
  // Forward: across the hinge plane, away from the side the shin folds to.
  let fx = dy * hz - dz * hy, fy = dz * hx - dx * hz, fz = dx * hy - dy * hx;
  n = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (n < 1e-6) return;
  fx /= n; fy /= n; fz /= n;
  let tx = p[to] - p[an], ty = p[to + 1] - p[an + 1], tz = p[to + 2] - p[an + 2];
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1e-6;
  tx /= len; ty /= len; tz /= len;
  const along = tx * dx + ty * dy + tz * dz;
  const px = tx - dx * along, py = ty - dy * along, pz = tz - dz * along;
  const m = Math.sqrt(px * px + py * py + pz * pz);
  if (m < 1e-4) return;
  const turn = Math.atan2(((fy * pz - fz * py) * dx + (fz * px - fx * pz) * dy + (fx * py - fy * px) * dz) / m, (fx * px + fy * py + fz * pz) / m);
  if (turn <= FOOT_TURN && turn >= -FOOT_TURN) return;
  const c = Math.cos(turn > 0 ? FOOT_TURN : -FOOT_TURN), sn = Math.sin(turn > 0 ? FOOT_TURN : -FOOT_TURN);
  // Back onto the limit, keeping the ankle's bend (the part along the shin).
  const gx = dy * fz - dz * fy, gy = dz * fx - dx * fz, gz = dx * fy - dy * fx; // shin x forward
  steer(p, b.w, FEET[f6 + 1], FEET[f6 + 2], len, dx * along + (fx * c + gx * sn) * m, dy * along + (fy * c + gy * sn) * m, dz * along + (fz * c + gz * sn) * m, 1);
}

// Brace: chest-frame targets (upper arm forward-down, forearm reaching ahead) applied with length-preserving
// steering, so the hands meet the street first and hold the head up for a moment.
const BRACE = Float64Array.from([-0.25, -0.55, 0.8, 0.25, -0.55, 0.8, -0.05, -0.35, 0.94, 0.05, -0.35, 0.94]);
function braceBone(b: RagdollState, from: number, to: number, o: number, s: number) {
  toWorld(9, BRACE[o], BRACE[o + 1], BRACE[o + 2]);
  const n = Math.hypot(tv[0], tv[1], tv[2]);
  steer(b.pos, b.w, from, to, dist(b.pos, from, to), tv[0] / n, tv[1] / n, tv[2] / n, s);
}
function brace(b: RagdollState) {
  const s = 0.25 * b.tone;
  if (!(b.cut & 2)) { braceBone(b, SH_L, EL_L, 0, s); braceBone(b, EL_L, WR_L, 6, s); }
  if (!(b.cut & 4)) { braceBone(b, SH_R, EL_R, 3, s); braceBone(b, EL_R, WR_R, 9, s); }
}

function solveSelf(b: RagdollState, pt: number, a: number, c: number, min: number) {
  const p = b.pos, ip = pt * 3, ia = a * 3, ic = c * 3;
  const ex = p[ic] - p[ia], ey = p[ic + 1] - p[ia + 1], ez = p[ic + 2] - p[ia + 2];
  const ll = ex * ex + ey * ey + ez * ez;
  let t = ll > 1e-8 ? ((p[ip] - p[ia]) * ex + (p[ip + 1] - p[ia + 1]) * ey + (p[ip + 2] - p[ia + 2]) * ez) / ll : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = p[ip] - (p[ia] + ex * t), dy = p[ip + 1] - (p[ia + 1] + ey * t), dz = p[ip + 2] - (p[ia + 2] + ez * t);
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d >= min || d < 1e-6) return;
  // Barycentric split over the capsule ends.
  const wp = b.w[pt], wa = b.w[a] * (1 - t), wc = a === c ? 0 : b.w[c] * t;
  const corr = (min - d) / d / (wp + wa + wc);
  p[ip] += dx * corr * wp; p[ip + 1] += dy * corr * wp; p[ip + 2] += dz * corr * wp;
  p[ia] -= dx * corr * wa; p[ia + 1] -= dy * corr * wa; p[ia + 2] -= dz * corr * wa;
  p[ic] -= dx * corr * wc; p[ic + 1] -= dy * corr * wc; p[ic + 2] -= dz * corr * wc;
}

// ---------------------------------------------------------------------------------------------------------
// Step.
// ---------------------------------------------------------------------------------------------------------

export type SolverOptions = { iterations: number; limitsEvery: number; selfIters: number };
export type RagdollWorld = {
  ground: Ground;
  /** Static colliders; without a grid the caller keeps `body.nearby` itself. */
  grid?: ColliderGrid | null;
  /** River surface: parts below it float (city.ts WATER_LEVEL). */
  water?: number;
  /** Fence: particles never leave this box (LAND x RIVER..LAND z). */
  bounds?: Bounds;
  /** Moving vehicles this frame (see Mover); they push parts out of their boxes inside the solver iterations. */
  movers?: readonly Mover[];
};
/**
 * A moving vehicle as an oriented box: centre (x, z) with its floor at floorY, heading yaw (forward = (sin, cos)),
 * half width / length, roof height `top` above the floor, and its velocity. Parts inside are pushed out of the
 * nearest face (the roof included, so a victim can land on the bonnet) and leave at the vehicle's speed.
 */
export type Mover = { x: number; z: number; floorY: number; yaw: number; halfW: number; halfL: number; top: number; vx: number; vz: number };

/**
 * Per quality level (quality.ts 0-5): body cap, solver iterations and how many awake bodies step at 120 Hz (the
 * rest at 60 Hz). Level 0 keeps 8 at full rate so a grenade-sized pile stays inside 0.6 ms a frame.
 */
export const RAGDOLL_QUALITY = [
  { bodies: 18, iterations: 6, fullRate: 8 },
  { bodies: 14, iterations: 5, fullRate: 8 },
  { bodies: 14, iterations: 5, fullRate: 8 },
  { bodies: 10, iterations: 4, fullRate: 6 },
  { bodies: 10, iterations: 4, fullRate: 6 },
  { bodies: 8, iterations: 3, fullRate: 4 },
] as const;
/** Limits every second iteration, self collision in the last two (one below 5 iterations). */
export function solverOptions(iterations: number): SolverOptions {
  return { iterations, limitsEvery: 2, selfIters: iterations >= 5 ? 2 : 1 };
}
export const DEFAULT_OPTIONS = solverOptions(6);

/** The particle each hand, wrist, foot and ankle hangs from (-1 for the rest), for climbing curbs. */
const LIMB_PARENT = Int8Array.from({ length: COUNT }, (_, i) =>
  i === TO_L ? AN_L : i === TO_R ? AN_R : i === AN_L ? KN_L : i === AN_R ? KN_R : i === HA_L ? WR_L : i === HA_R ? WR_R : i === WR_L ? EL_L : i === WR_R ? EL_R : -1);
const MU_S = 0.75, MU_K = 0.55, MU_WALL = 0.35, BOUNCE = 0.18, BOUNCE_MIN = 1.6, WALL_REBOUND = 0.1;
const AIR = 0.9995, WATER_H = 0.97, WATER_V = 0.95;
/** Seconds of stillness before sleeping, and before the settle damping kicks in. */
const SLEEP_AFTER = 0.4 + STEP / 2, SETTLE_AFTER = 0.1 + STEP / 2;
/** A part's ground height is re-read once it has moved this far (m, squared) from where it was sampled. */
const RESAMPLE2 = 0.005 * 0.005;
const touching: Collider[] = [];
const MAX_MOVERS = 8, moverBuf = new Float64Array(MAX_MOVERS * 10);

/** Changes a body's step length (120 Hz <-> 60 Hz) keeping its velocity. step() does this by itself. */
export function retime(b: RagdollState, dt: number) {
  const ratio = dt / b.dt, p = b.pos, q = b.prev;
  for (let i = 0; i < b.n * 3; i++) q[i] = p[i] - (p[i] - q[i]) * ratio;
  b.dt = dt;
}

/** Advances one body by one substep of `dt` (STEP, or 2 x STEP for far bodies). */
export function step(b: RagdollState, world: RagdollWorld, opt: SolverOptions, dt = STEP) {
  if (b.asleep) return;
  if (dt !== b.dt) retime(b, dt);
  const p = b.pos, q = b.prev, n = b.n, ground = world.ground, h = dt / STEP;
  b.shown.set(p);
  b.age += dt;
  b.tone = b.toneUntil > b.age ? b.toneMax * (b.toneUntil - b.age) / b.toneSpan : 0;
  // Stumble: for a moment the legs still carry part of the weight while the feet are down.
  if (b.stumble > b.age) {
    const feet = b.pen[AN_L] + b.pen[AN_R] + b.pen[TO_L] + b.pen[TO_R] > 0 ? 1 : 0;
    const lift = -GRAVITY * 0.8 * (b.stumble - b.age) / b.stumbleSpan * feet * dt * dt;
    p[PELVIS * 3 + 1] += lift; p[HIP_L * 3 + 1] += lift; p[HIP_R * 3 + 1] += lift; p[CHEST * 3 + 1] += lift * 0.8;
  }
  if (b.stepAt > 0 && b.age >= b.stepAt) { b.stepAt = 0; catchStep(b); }
  // Integrate: air drag, gravity, and buoyancy with water drag below the river surface.
  const water = world.water ?? -Infinity;
  const air = h === 1 ? AIR : AIR ** h, wh = h === 1 ? WATER_H : WATER_H ** h, wv = h === 1 ? WATER_V : WATER_V ** h;
  for (let i = 0; i < n; i++) {
    const o = i * 3, r = b.r[i];
    let vx = p[o] - q[o], vy = p[o + 1] - q[o + 1], vz = p[o + 2] - q[o + 2];
    let gy = GRAVITY;
    if (p[o + 1] - r < water) {
      const sub = Math.min(1, (water - (p[o + 1] - r)) / (2 * r));
      gy -= GRAVITY * b.buoy[i] * sub;
      vx *= wh; vy *= wv; vz *= wh;
    } else { vx *= air; vy *= air; vz *= air; }
    q[o] = p[o]; q[o + 1] = p[o + 1]; q[o + 2] = p[o + 2];
    b.vin[i] = vy / dt;
    p[o] += vx; p[o + 1] += vy + gy * dt * dt; p[o + 2] += vz;
    // The street under a part that has hardly moved is still the same street.
    const sx = p[o] - b.fx[i], sz = p[o + 2] - b.fz[i];
    if (sx * sx + sz * sz > RESAMPLE2) { b.floor[i] = ground(p[o], p[o + 2]); b.fx[i] = p[o]; b.fz[i] = p[o + 2]; }
    b.pen[i] = 0;
  }
  // Broadphase: only colliders overlapping the body's box this substep take part (usually none on a street).
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], z = p[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  if (world.grid && (minX - 0.4 < b.qMinX || maxX + 0.4 > b.qMaxX || minZ - 0.4 < b.qMinZ || maxZ + 0.4 > b.qMaxZ)) {
    b.qMinX = minX - 2; b.qMaxX = maxX + 2; b.qMinZ = minZ - 2; b.qMaxZ = maxZ + 2;
    queryColliders(world.grid, b.qMinX, b.qMinZ, b.qMaxX, b.qMaxZ, b.nearby);
  }
  touching.length = 0;
  for (const c of b.nearby) if (maxX > c.minX - 0.4 && minX < c.maxX + 0.4 && maxZ > c.minZ - 0.4 && minZ < c.maxZ + 0.4) touching.push(c);
  let movers = 0;
  if (world.movers) {
    for (let m = 0; m < world.movers.length && movers < MAX_MOVERS; m++) {
      const v = world.movers[m], reach = Math.hypot(v.halfW, v.halfL) + 0.4;
      if (v.x + reach < minX || v.x - reach > maxX || v.z + reach < minZ || v.z - reach > maxZ) continue;
      const o = movers++ * 10;
      moverBuf[o] = v.x; moverBuf[o + 1] = v.z; moverBuf[o + 2] = Math.sin(v.yaw); moverBuf[o + 3] = Math.cos(v.yaw);
      moverBuf[o + 4] = v.halfW; moverBuf[o + 5] = v.halfL; moverBuf[o + 6] = v.floorY + v.top; moverBuf[o + 7] = v.vx; moverBuf[o + 8] = v.vz;
    }
  }
  const bounds = world.bounds;
  const sticks = b.sticks, rest = b.rest, w = b.w, cones = b.skel.cones, off = b.off;
  for (let it = 0; it <= opt.iterations; it++) {
    const last = it === opt.iterations;
    if (!last) {
      if (it % opt.limitsEvery === 0) {
        buildFrames(p);
        for (let c = 0; c < 6; c++) {
          if (off & (1 << (CONE_BIT + c))) continue;
          const k = c * 7;
          solveCone(b, cones[k], cones[k + 1], cones[k + 2], cones[k + 3], cones[k + 4], cones[k + 5], cones[k + 6]);
        }
        solveTwist(b);
        for (let s = 0; s < 4; s++) if (!(off & (1 << (HINGE_BIT + s)))) solveHinge(b, s, true);
        for (let k = 0; k < BEND_F.length; k += 5) solveBend(b, BEND_F[k], BEND_F[k + 1], BEND_F[k + 2], BEND_F[k + 3], BEND_F[k + 4]);
        for (let s = 2; s < 4; s++) if (!(off & (1 << (HINGE_BIT + s)))) solveFoot(b, s);
        if (b.cut) {
          for (let s = 0; s < 4; s++) {
            if (b.cutBends[s * 3] >= 0) solveBend(b, b.cutBends[s * 3], b.cutBends[s * 3 + 1], b.cutBends[s * 3 + 2], 0, PART_INFO[s + 1].bendMax);
          }
        }
        if (b.tone > 0 && b.bracing) brace(b);
      }
      if (it >= opt.iterations - opt.selfIters) {
        const self = b.self;
        for (let k = 0; k < self.length; k += 4) solveSelf(b, self[k], self[k + 1], self[k + 2], self[k + 3]);
      }
    } else {
      // Ground friction (Coulomb, position based: Müller 2014) before the last bone pass, so a hand or toe held by
      // the street does not end the step with its bone stretched. Static below MU_S x penetration, else kinetic.
      for (let i = 0; i < n; i++) {
        const o = i * 3, pen = b.pen[i];
        if (pen <= 0) continue;
        const tx = p[o] - q[o], tz = p[o + 2] - q[o + 2];
        const t = Math.sqrt(tx * tx + tz * tz);
        const f = t < MU_S * pen ? 1 : Math.min(MU_K * pen / t, 1);
        p[o] -= tx * f; p[o + 2] -= tz * f;
        // Friction can carry a part back over a curb edge: the final contacts re-read the ground under it.
        if (t * f > 0.004) { b.floor[i] = ground(p[o], p[o + 2]); b.fx[i] = p[o]; b.fz[i] = p[o + 2]; }
      }
      // Elbows and knees get the last word, then the bones, then the final contacts: no frame shows a knee bent
      // backward or a stretched limb.
      buildFrames(p);
      for (let s = 0; s < 4; s++) if (!(off & (1 << (HINGE_BIT + s)))) solveHinge(b, s, true);
      for (let k = 0; k < STICK_COUNT; k++) {
        const a = sticks[k * 2], c = sticks[k * 2 + 1];
        if (a !== c) solveDistance(p, w, a, c, rest[k], 0);
      }
    }
    // Contacts every iteration so constraints never drag a part through the street; the final pass re-reads
    // the ground under every part the solver moved at all (a few millimetres decide which side of a curb it is on).
    for (let i = 0; i < n; i++) {
      const o = i * 3, r = b.r[i];
      if (last) {
        const sx = p[o] - b.fx[i], sz = p[o + 2] - b.fz[i];
        if (sx * sx + sz * sz > RESAMPLE2) { b.floor[i] = ground(p[o], p[o + 2]); b.fx[i] = p[o]; b.fz[i] = p[o + 2]; }
      }
      const floor = b.floor[i] + r;
      if (p[o + 1] < floor) {
        // A step up taller than a third of the radius is a curb face, not a ramp: undo the horizontal move. A part
        // whose centre is already nearly level with the top (a toe its ankle is lifting over), or whose bone already
        // reaches over the top (a foot dragged by the leg), climbs instead.
        const up = LIMB_PARENT[i];
        if (b.floor[i] - b.floorPrev[i] > r * 0.35 && q[o + 1] - r < b.floor[i] - 0.01 && floor - p[o + 1] > Math.min(r * 0.5, 0.02)
          && (up < 0 || p[up * 3 + 1] - b.r[up] < b.floor[i])) {
          if (ground(q[o], p[o + 2]) < b.floor[i] - 0.01) { b.nx[i] = q[o] > p[o] ? 1 : -1; p[o] = q[o]; }
          else { b.nz[i] = q[o + 2] > p[o + 2] ? 1 : -1; p[o + 2] = q[o + 2]; }
          b.wall[i] += 0.01;
          b.floor[i] = ground(p[o], p[o + 2]); b.fx[i] = p[o]; b.fz[i] = p[o + 2];
          if (p[o + 1] < b.floor[i] + r) { b.pen[i] += b.floor[i] + r - p[o + 1]; p[o + 1] = b.floor[i] + r; }
        } else { b.pen[i] += floor - p[o + 1]; p[o + 1] = floor; }
      }
      for (let t = 0; t < touching.length; t++) {
        const c = touching[t];
        const x = p[o], z = p[o + 2];
        if (x <= c.minX - r || x >= c.maxX + r || z <= c.minZ - r || z >= c.maxZ + r) continue;
        if (c.top !== undefined && p[o + 1] - r > c.top) continue;
        const left = x - (c.minX - r), right = c.maxX + r - x, near = z - (c.minZ - r), far = c.maxZ + r - z;
        const least = Math.min(left, right, near, far);
        // Low props (stalls, planters) can be landed on when the part comes from above.
        if (c.top !== undefined && c.top + r - p[o + 1] < least && q[o + 1] - r >= c.top - 0.05) { b.pen[i] += c.top + r - p[o + 1]; p[o + 1] = c.top + r; continue; }
        if (least === left) { p[o] = c.minX - r; b.nx[i] = -1; } else if (least === right) { p[o] = c.maxX + r; b.nx[i] = 1; }
        else if (least === near) { p[o + 2] = c.minZ - r; b.nz[i] = -1; } else { p[o + 2] = c.maxZ + r; b.nz[i] = 1; }
        b.wall[i] += least;
      }
      // Vehicles: out through the nearest face of the box, the roof included.
      for (let m = 0; m < movers; m++) {
        const v = m * 10, dx = p[o] - moverBuf[v], dz = p[o + 2] - moverBuf[v + 1], sn = moverBuf[v + 2], cs = moverBuf[v + 3];
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; // right, forward
        const ex = moverBuf[v + 4] + r - Math.abs(lx), ez = moverBuf[v + 5] + r - Math.abs(lz), ey = moverBuf[v + 6] + r - p[o + 1];
        if (ex <= 0 || ez <= 0 || ey <= 0) continue;
        let nx = 0, ny = 0, nz = 0, depth: number;
        if (ey < ex && ey < ez) { ny = 1; depth = ey; }
        else if (ex < ez) { const sg = lx < 0 ? -1 : 1; nx = cs * sg; nz = -sn * sg; depth = ex; }
        else { const sg = lz < 0 ? -1 : 1; nx = sn * sg; nz = cs * sg; depth = ez; }
        p[o] += nx * depth; p[o + 1] += ny * depth; p[o + 2] += nz * depth;
        b.mv[i] = m + 1; b.mn[o] = nx; b.mn[o + 1] = ny; b.mn[o + 2] = nz;
      }
      // The fences around the map act as walls too.
      if (bounds) {
        if (p[o] < bounds.minX) { b.wall[i] += bounds.minX - p[o]; p[o] = bounds.minX; b.nx[i] = 1; }
        else if (p[o] > bounds.maxX) { b.wall[i] += p[o] - bounds.maxX; p[o] = bounds.maxX; b.nx[i] = -1; }
        if (p[o + 2] < bounds.minZ) { b.wall[i] += bounds.minZ - p[o + 2]; p[o + 2] = bounds.minZ; b.nz[i] = 1; }
        else if (p[o + 2] > bounds.maxZ) { b.wall[i] += p[o + 2] - bounds.maxZ; p[o + 2] = bounds.maxZ; b.nz[i] = -1; }
      }
    }
    if (last) break;
    // Lengths last, so bones are best satisfied when the iteration ends.
    for (let k = 0; k < STICK_COUNT; k++) {
      const a = sticks[k * 2], c = sticks[k * 2 + 1];
      if (a !== c) solveDistance(p, w, a, c, rest[k], 0);
    }
    for (let k = 0; k < RANGES.length; k++) {
      const lo = b.ranges[k * 2];
      if (lo <= 0) continue;
      solveDistance(p, w, RANGE_I[k * 2], RANGE_I[k * 2 + 1], lo, -1);
      solveDistance(p, w, RANGE_I[k * 2], RANGE_I[k * 2 + 1], b.ranges[k * 2 + 1], 1);
    }
  }
  // Restitution on the ground; friction and a small rebound on walls; vehicles carry what they hit.
  let contacts = 0, grounded = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    b.floorPrev[i] = b.floor[i];
    if (b.pen[i] > 0) {
      contacts++; grounded++;
      if (b.vin[i] < -BOUNCE_MIN) q[o + 1] = p[o + 1] + b.vin[i] * BOUNCE * dt;
    }
    if (b.wall[i] > 0) {
      contacts++;
      // Sliding along the face is slowed by friction; most of the normal speed is absorbed.
      const nx = b.nx[i], nz = b.nz[i], pen2 = Math.min(b.wall[i], 0.05);
      const vy = p[o + 1] - q[o + 1];
      const tx = nx ? 0 : p[o] - q[o], tz = nz ? 0 : p[o + 2] - q[o + 2];
      const t = Math.sqrt(tx * tx + vy * vy + tz * tz);
      const f = t > 0 ? Math.min(MU_WALL * pen2 / t, 1) : 0;
      p[o] -= tx * f; p[o + 1] -= vy * f; p[o + 2] -= tz * f;
      if (nx) q[o] = p[o] + (p[o] - q[o]) * WALL_REBOUND;
      if (nz) q[o + 2] = p[o + 2] + (p[o + 2] - q[o + 2]) * WALL_REBOUND;
      b.wall[i] = 0; b.nx[i] = 0; b.nz[i] = 0;
    }
    if (b.mv[i]) {
      // Hit by a vehicle: leave its face a little faster than it moves (or rest on its roof), with grip along it.
      contacts++;
      const v = (b.mv[i] - 1) * 10, cvx = moverBuf[v + 7], cvz = moverBuf[v + 8];
      const nx = b.mn[o], ny = b.mn[o + 1], nz = b.mn[o + 2];
      const ex = (p[o] - q[o]) / dt, ey = (p[o + 1] - q[o + 1]) / dt, ez = (p[o + 2] - q[o + 2]) / dt;
      const cn = cvx * nx + cvz * nz, vn = ex * nx + ey * ny + ez * nz;
      const out = cn > 0 ? cn * 1.1 : Math.min(Math.max(vn, 0), 0.3);
      // Velocity relative to the vehicle, minus its normal part, keeps 80% (grip), then the vehicle's own motion.
      let rx = ex - cvx, ry = ey, rz = ez - cvz;
      const rn = rx * nx + ry * ny + rz * nz;
      rx = (rx - nx * rn) * 0.8; ry = (ry - ny * rn) * 0.8; rz = (rz - nz * rn) * 0.8;
      const ux = cvx - nx * cn + rx + nx * out, uy = ry + ny * out, uz = cvz - nz * cn + rz + nz * out;
      q[o] = p[o] - ux * dt; q[o + 1] = p[o + 1] - uy * dt; q[o + 2] = p[o + 2] - uz * dt;
      b.mv[i] = 0;
    }
  }
  b.contacts = contacts; b.grounded = grounded;
  rigidDamp(b, contacts, h);
  // Sleep on mass-weighted RMS speed, so a light hand twitching on a curb cannot keep the body awake.
  let energy = 0, fastest = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const ex = p[o] - q[o], ey = p[o + 1] - q[o + 1], ez = p[o + 2] - q[o + 2], v2 = ex * ex + ey * ey + ez * ez;
    energy += v2 / w[i];
    if (v2 > fastest) fastest = v2;
  }
  const speed = Math.sqrt(energy / b.mass) / dt;
  b.speed = speed;
  b.calm = speed < 0.1 && fastest < (0.4 * dt) ** 2 ? b.calm + dt : 0;
  b.idle = speed < 0.1 ? b.idle + dt : 0;
  // Floating bodies bob for ever; let them rest once they have drifted for a few seconds.
  b.wet = p[PELVIS * 3 + 1] < water ? b.wet + dt : 0;
  if (b.wet > 6 && speed < 0.6) b.calm = SLEEP_AFTER + 1;
  if (b.calm > SLEEP_AFTER) {
    // A limp body cannot hold a shin or forearm up in the air: tip a balanced one over before sleeping (a body
    // still not done after a few seconds of idling sleeps anyway).
    if (b.wet > 0 || b.idle > 4 || !tipRaisedLimb(b)) sleep(b);
    else b.calm = SETTLE_AFTER;
  }
}

/** Legs [hip, knee, ankle, toe]: a shin can be left balanced upright on its knee (forearms rest on the body). */
const RAISED = [HIP_L, KN_L, AN_L, TO_L, HIP_R, KN_R, AN_R, TO_R];
/**
 * Whether a shin stands up off the street, foot to the sky (the ankle well above the knee, the toes above the
 * ankle, touching nothing); if so it is nudged over, away from where it points, so gravity takes it down.
 */
function tipRaisedLimb(b: RagdollState) {
  const p = b.pos;
  let raised = false;
  for (let k = 0; k < RAISED.length; k += 4) {
    const g = RAISED[k], j = RAISED[k + 1], e = RAISED[k + 2], t = RAISED[k + 3];
    if (b.cut || b.pen[e] > 0 || b.pen[t] > 0) continue;
    const ex = p[e * 3] - p[j * 3], ey = p[e * 3 + 1] - p[j * 3 + 1], ez = p[e * 3 + 2] - p[j * 3 + 2];
    if (ey < 0.75 * Math.hypot(ex, ey, ez) || p[t * 3 + 1] < p[e * 3 + 1]) continue;
    raised = true;
    let dx = ex, dz = ez;
    if (dx * dx + dz * dz < 1e-4) { dx = p[j * 3] - p[g * 3]; dz = p[j * 3 + 2] - p[g * 3 + 2]; }
    const l = Math.hypot(dx, dz) || 1, push = 0.004 * b.k / 0.82;
    for (const i of [e, t]) { p[i * 3] += (dx / l) * push; p[i * 3 + 2] += (dz / l) * push; }
  }
  return raised;
}
/** Stops a body where it lies (it costs nothing until something wakes it). */
export function sleep(b: RagdollState) {
  b.asleep = true; b.speed = 0;
  const p = b.pos;
  for (let i = 0; i < b.n * 3; i++) { b.prev[i] = p[i]; b.shown[i] = p[i]; }
}
export function wake(b: RagdollState) { b.asleep = false; b.calm = 0; b.idle = 0; }

// Stumble catch step: the trailing foot steps toward the fall, as people do before they go down.
function catchStep(b: RagdollState) {
  const p = b.pos, q = b.prev, dt = b.dt;
  let dx = (p[CHEST * 3] - q[CHEST * 3]) / dt, dz = (p[CHEST * 3 + 2] - q[CHEST * 3 + 2]) / dt;
  if (dx * dx + dz * dz < 0.09) { dx = p[NECK * 3] - p[PELVIS * 3]; dz = p[NECK * 3 + 2] - p[PELVIS * 3 + 2]; }
  const l = Math.hypot(dx, dz);
  if (l < 1e-4) return;
  dx /= l; dz /= l;
  const trailing = p[AN_L * 3] * dx + p[AN_L * 3 + 2] * dz < p[AN_R * 3] * dx + p[AN_R * 3 + 2] * dz ? 0 : 1;
  if (b.cut & (8 << trailing)) return;
  const kick = (i: number, f: number) => { q[i * 3] -= dx * 2 * f * dt; q[i * 3 + 1] -= 1.2 * f * dt; q[i * 3 + 2] -= dz * 2 * f * dt; };
  kick(trailing ? AN_R : AN_L, 1); kick(trailing ? TO_R : TO_L, 1); kick(trailing ? KN_R : KN_L, 0.5);
}

// ---------------------------------------------------------------------------------------------------------
// Momentum: rigid projection for impulses, rigid-motion-preserving damping.
// ---------------------------------------------------------------------------------------------------------

/** The joints that leave with each severed part (with its stub particle). */
const PIECE = [[HEAD], [EL_L, WR_L, HA_L], [EL_R, WR_R, HA_R], [KN_L, AN_L, TO_L], [KN_R, AN_R, TO_R]];
const pieceOf = new Int8Array(COUNT);
/**
 * Labels the body's separate pieces in pieceOf: 0 the torso and what is still attached to it, 1 + PARTS index for
 * a severed part. Returns how many labels to visit (1 while nothing is cut).
 */
function pieces(b: RagdollState) {
  pieceOf.fill(0);
  if (!b.cut) return 1;
  for (let id = 0; id < PARTS.length; id++) {
    if (!(b.cut & (1 << id))) continue;
    pieceOf[b.stub[id]] = id + 1;
    for (const i of PIECE[id]) pieceOf[i] = id + 1;
  }
  return PARTS.length + 1;
}

const wv = new Float64Array(3);
/** omega = I^-1 L for a symmetric inertia tensor (a b c / b d e / c f... packed as xx, xy, xz, yy, yz, zz). */
function inverseApply(a: number, bb: number, c: number, d: number, e: number, f: number, lx: number, ly: number, lz: number) {
  const A = d * f - e * e, B = c * e - bb * f, C = bb * e - c * d;
  const det = a * A + bb * B + c * C;
  if (Math.abs(det) < 1e-12) { wv[0] = wv[1] = wv[2] = 0; return false; }
  const E = a * f - c * c, F = bb * c - a * e, I = a * d - bb * bb;
  wv[0] = (A * lx + B * ly + C * lz) / det; wv[1] = (B * lx + E * ly + F * lz) / det; wv[2] = (C * lx + F * ly + I * lz) / det;
  return true;
}

/**
 * Applies per-particle velocity changes (m/s, 3 floats per particle) the way a real body takes a blow: the linear
 * and angular momentum they carry move the whole body, and only `deform` of the remainder bends it. With
 * `maxSpin` (rad/s) the rigid rotation is capped; linear momentum is always exact.
 */
export function applyImpulse(b: RagdollState, dv: ArrayLike<number>, deform: number, maxSpin = Infinity) {
  const q = b.prev, n = b.n, dt = b.dt, u = impBuf;
  // Each piece (the body, and every severed part on its own) takes the momentum of its own share.
  const count = pieces(b);
  for (let g = 0; g < count; g++) projectImpulse(b, dv, deform, maxSpin, g);
  // No bone can take speed along itself: pass that part on to the neighbours (pairwise along each bone, so linear
  // and angular momentum stay exact). Only rotation about the joints is left to bend the body, so a hard blow no
  // longer tears the limbs apart for the first frames.
  const p = b.pos, sticks = b.sticks;
  for (let sweepCount = 0; sweepCount < 8; sweepCount++) {
    for (let k = 0; k < STICK_COUNT; k++) {
      const a = sticks[k * 2], c = sticks[k * 2 + 1];
      if (a === c) continue;
      const ia = a * 3, ic = c * 3;
      let nx = p[ic] - p[ia], ny = p[ic + 1] - p[ia + 1], nz = p[ic + 2] - p[ia + 2];
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l < 1e-6) continue;
      nx /= l; ny /= l; nz /= l;
      const rel = (u[ic] - u[ia]) * nx + (u[ic + 1] - u[ia + 1]) * ny + (u[ic + 2] - u[ia + 2]) * nz;
      const wa = b.w[a], wc = b.w[c], f = rel / (wa + wc);
      u[ia] += nx * f * wa; u[ia + 1] += ny * f * wa; u[ia + 2] += nz * f * wa;
      u[ic] -= nx * f * wc; u[ic + 1] -= ny * f * wc; u[ic + 2] -= nz * f * wc;
    }
  }
  for (let i = 0; i < n * 3; i++) q[i] -= u[i] * dt;
  wake(b);
}

/** The rigid projection of `dv` over one piece (pieceOf label `g`), written into impBuf. */
function projectImpulse(b: RagdollState, dv: ArrayLike<number>, deform: number, maxSpin: number, g: number) {
  const p = b.pos, n = b.n, all = g === 0 && !b.cut;
  let m = 0, cx = 0, cy = 0, cz = 0, px = 0, py = 0, pz = 0;
  for (let i = 0; i < n; i++) {
    if (!all && pieceOf[i] !== g) continue;
    const mi = 1 / b.w[i], o = i * 3;
    m += mi; cx += p[o] * mi; cy += p[o + 1] * mi; cz += p[o + 2] * mi;
    px += dv[o] * mi; py += dv[o + 1] * mi; pz += dv[o + 2] * mi;
  }
  if (m === 0) return;
  cx /= m; cy /= m; cz /= m; px /= m; py /= m; pz /= m;
  let lx = 0, ly = 0, lz = 0, ixx = 0, iyy = 0, izz = 0, ixy = 0, ixz = 0, iyz = 0;
  for (let i = 0; i < n; i++) {
    if (!all && pieceOf[i] !== g) continue;
    const mi = 1 / b.w[i], o = i * 3;
    const rx = p[o] - cx, ry = p[o + 1] - cy, rz = p[o + 2] - cz;
    const ux = dv[o] - px, uy = dv[o + 1] - py, uz = dv[o + 2] - pz;
    lx += (ry * uz - rz * uy) * mi; ly += (rz * ux - rx * uz) * mi; lz += (rx * uy - ry * ux) * mi;
    ixx += (ry * ry + rz * rz) * mi; iyy += (rx * rx + rz * rz) * mi; izz += (rx * rx + ry * ry) * mi;
    ixy -= rx * ry * mi; ixz -= rx * rz * mi; iyz -= ry * rz * mi;
  }
  inverseApply(ixx, ixy, ixz, iyy, iyz, izz, lx, ly, lz);
  // Gameplay blows are far stronger than real ones: the spin a blow may start is capped, and the excess only bends
  // the body (by `deform`) instead of somersaulting it.
  const spin = Math.hypot(wv[0], wv[1], wv[2]), cap = spin > maxSpin ? maxSpin / spin : 1;
  const wx = wv[0] * cap, wy = wv[1] * cap, wz = wv[2] * cap;
  const u = impBuf;
  for (let i = 0; i < n; i++) {
    if (!all && pieceOf[i] !== g) continue;
    const o = i * 3;
    const rx = p[o] - cx, ry = p[o + 1] - cy, rz = p[o + 2] - cz;
    const tx = px + wy * rz - wz * ry, ty = py + wz * rx - wx * rz, tz = pz + wx * ry - wy * rx;
    u[o] = tx + (dv[o] - tx) * deform; u[o + 1] = ty + (dv[o + 1] - ty) * deform; u[o + 2] = tz + (dv[o + 2] - tz) * deform;
  }
}
const impBuf = new Float64Array(COUNT * 3);

/** Blends every particle toward the body's common linear + angular motion: limbs settle, the tumble survives. */
function rigidDamp(b: RagdollState, contacts: number, h: number) {
  const count = pieces(b);
  for (let g = 0; g < count; g++) dampPiece(b, contacts, h, g);
}
function dampPiece(b: RagdollState, contacts: number, h: number, g: number) {
  const p = b.pos, q = b.prev, n = b.n, all = g === 0 && !b.cut;
  let m = 0, cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
  for (let i = 0; i < n; i++) {
    if (!all && pieceOf[i] !== g) continue;
    const mi = 1 / b.w[i], o = i * 3;
    m += mi; cx += p[o] * mi; cy += p[o + 1] * mi; cz += p[o + 2] * mi;
    vx += (p[o] - q[o]) * mi; vy += (p[o + 1] - q[o + 1]) * mi; vz += (p[o + 2] - q[o + 2]) * mi;
  }
  if (m === 0) return;
  cx /= m; cy /= m; cz /= m; vx /= m; vy /= m; vz /= m;
  let lx = 0, ly = 0, lz = 0, ixx = 0, iyy = 0, izz = 0, ixy = 0, ixz = 0, iyz = 0;
  for (let i = 0; i < n; i++) {
    if (!all && pieceOf[i] !== g) continue;
    const mi = 1 / b.w[i], o = i * 3;
    const rx = p[o] - cx, ry = p[o + 1] - cy, rz = p[o + 2] - cz;
    const ux = p[o] - q[o] - vx, uy = p[o + 1] - q[o + 1] - vy, uz = p[o + 2] - q[o + 2] - vz;
    lx += (ry * uz - rz * uy) * mi; ly += (rz * ux - rx * uz) * mi; lz += (rx * uy - ry * ux) * mi;
    ixx += (ry * ry + rz * rz) * mi; iyy += (rx * rx + rz * rz) * mi; izz += (rx * rx + ry * ry) * mi;
    ixy -= rx * ry * mi; ixz -= rx * rz * mi; iyz -= ry * rz * mi;
  }
  // A two-particle piece (a severed head) has no inertia about its own line: its tumble is left alone until the
  // body as a whole settles, then only its drift is damped.
  if (!inverseApply(ixx, ixy, ixz, iyy, iyz, izz, lx, ly, lz) && (all || b.idle <= SETTLE_AFTER)) return;
  const wx = wv[0], wy = wv[1], wz = wv[2];
  // Once the body as a whole has come to rest, a hand or toe still swinging against its limit is damped out too.
  const settle = b.idle > SETTLE_AFTER ? 0.25 : 0;
  let kd = Math.max(settle, (contacts >= 3 ? 0.05 : 0.012) + b.tone * 0.12);
  if (h !== 1) kd = 1 - (1 - kd) ** h;
  for (let i = 0; i < n; i++) {
    if (!all && pieceOf[i] !== g) continue;
    const o = i * 3;
    const rx = p[o] - cx, ry = p[o + 1] - cy, rz = p[o + 2] - cz;
    const tx = vx + wy * rz - wz * ry, ty = vy + wz * rx - wx * rz, tz = vz + wx * ry - wy * rx;
    q[o] -= (tx - (p[o] - q[o])) * kd; q[o + 1] -= (ty - (p[o + 1] - q[o + 1])) * kd; q[o + 2] -= (tz - (p[o + 2] - q[o + 2])) * kd;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Blows: launch at spawn, strike, blast, push, vehicle sweep.
// ---------------------------------------------------------------------------------------------------------

/**
 * How a blow spreads over the body: Gaussian width around the hit (m), uniform share, how much it bends the body,
 * and the most spin (rad/s) it may start (a car wraps and turns a pedestrian; a bullet only topples one).
 */
export const HIT: Record<HitKind, { sigma: number; base: number; deform: number; spin: number }> = {
  bullet: { sigma: 0.25, base: 0.35, deform: 0.3, spin: 5 },
  vehicle: { sigma: 0.35, base: 0.2, deform: 0.5, spin: 9 },
  melee: { sigma: 0.3, base: 0.5, deform: 0.3, spin: 5 },
  blast: { sigma: 0.6, base: 0.5, deform: 0.35, spin: 7 },
  fall: { sigma: 1, base: 1, deform: 0.3, spin: 4 },
};
const dvBuf = new Float32Array(COUNT * 3);

/**
 * Gives the body a total momentum of (vx, vy, vz) x its mass. With a hit point the push concentrates around it
 * (so a shin hit sweeps the legs and the body rotates); without one each part gets a slightly random share.
 */
export function launch(b: RagdollState, vx: number, vy: number, vz: number, kind: HitKind = 'fall', hit?: { x: number; y: number; z: number } | null, rand: () => number = Math.random) {
  const spec = HIT[kind], p = b.pos, n = b.n, s2 = spec.sigma * spec.sigma;
  // A severed part lying apart only feels a blow that lands on it (no share of the body's uniform part).
  if (b.cut) pieces(b);
  let norm = 0, mass = 0;
  for (let i = 0; i < n; i++) {
    let f: number;
    if (hit) {
      const d2 = (p[i * 3] - hit.x) ** 2 + (p[i * 3 + 1] - hit.y) ** 2 + (p[i * 3 + 2] - hit.z) ** 2;
      f = (b.cut && pieceOf[i] ? 0 : spec.base) + (1 - spec.base) * 2 * Math.exp(-d2 / s2);
    } else f = 0.75 + 0.4 * rand();
    dvBuf[i * 3] = f; norm += f / b.w[i]; mass += 1 / b.w[i];
  }
  for (let i = 0; i < n; i++) {
    const g = dvBuf[i * 3] * mass / norm;
    dvBuf[i * 3] = vx * g; dvBuf[i * 3 + 1] = vy * g; dvBuf[i * 3 + 2] = vz * g;
  }
  applyImpulse(b, dvBuf, spec.deform, spec.spin);
}

/** A blow at a world point on an existing body (bullet, kick, bumper). */
export function strike(b: RagdollState, x: number, y: number, z: number, vx: number, vy: number, vz: number, kind: HitKind = 'bullet') {
  launch(b, vx, vy, vz, kind, { x, y, z });
}

/** The old impulse(body, v, index): a strike centred on particle `index` (or spread evenly when -1). */
export function impulseAt(b: RagdollState, vx: number, vy: number, vz: number, index = -1) {
  if (index < 0 || index >= b.n) launch(b, vx, vy, vz, 'fall');
  else strike(b, b.pos[index * 3], b.pos[index * 3 + 1], b.pos[index * 3 + 2], vx, vy, vz, 'bullet');
}

/**
 * Radial explosion (same signature as before: strength 26 is a grenade). Light parts fly a little faster, every
 * part gets some lift. Returns whether the body was within reach.
 */
export function blast(b: RagdollState, x: number, y: number, z: number, radius: number, strength: number) {
  const p = b.pos, n = b.n, S = strength * 16 / 26;
  let hit = false;
  for (let i = 0; i < n; i++) {
    const o = i * 3, dx = p[o] - x, dy = p[o + 1] - y, dz = p[o + 2] - z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d >= radius) { dvBuf[o] = dvBuf[o + 1] = dvBuf[o + 2] = 0; continue; }
    hit = true;
    const fall = 1 - d / radius, e = Math.min(1.3, Math.max(0.8, Math.sqrt(0.05 * b.w[i])));
    const f = S * fall ** 1.5 * e / Math.max(d, 0.3);
    dvBuf[o] = dx * f; dvBuf[o + 1] = Math.abs(dy) * f + 0.45 * S * fall; dvBuf[o + 2] = dz * f;
  }
  if (hit) applyImpulse(b, dvBuf, HIT.blast.deform, HIT.blast.spin);
  return hit;
}

/**
 * Shoves the parts inside a circle (kicks, walking into a body): only the missing speed along the push is
 * added, so calling it every frame never pumps energy or drags a body at the pusher's speed. `floorY` is the
 * ground at (x, z); parts higher than 1.4 m above it are missed. Returns the number of parts touched.
 */
export function push(b: RagdollState, x: number, z: number, floorY: number, radius: number, vx: number, vy: number, vz: number) {
  const p = b.pos, q = b.prev, dt = b.dt, r2 = radius * radius, s = Math.hypot(vx, vz), ux = s ? vx / s : 0, uz = s ? vz / s : 0;
  let touched = 0;
  for (let i = 0; i < b.n; i++) {
    const o = i * 3, dx = p[o] - x, dz = p[o + 2] - z;
    if (dx * dx + dz * dz > r2 || p[o + 1] - floorY > 1.4) continue;
    let ex = (p[o] - q[o]) / dt, ey = (p[o + 1] - q[o + 1]) / dt, ez = (p[o + 2] - q[o + 2]) / dt;
    const along = ex * ux + ez * uz;
    if (along < s) { ex += (s - along) * ux; ez += (s - along) * uz; }
    if (ey < vy) ey = vy;
    q[o] = p[o] - ex * dt; q[o + 1] = p[o + 1] - ey * dt; q[o + 2] = p[o + 2] - ez * dt;
    touched++;
  }
  if (touched) wake(b);
  return touched;
}

/**
 * Number of parts inside a vehicle's box right now (wakes the body if any). The push itself happens inside step()
 * when the vehicle is listed in `world.movers`, where it is solved together with the joints.
 */
export function sweep(b: RagdollState, m: Mover) {
  const p = b.pos, sn = Math.sin(m.yaw), cs = Math.cos(m.yaw), roof = m.floorY + m.top;
  const reach = b.reach + m.halfW + m.halfL;
  if (!b.cut && (p[0] - m.x) ** 2 + (p[2] - m.z) ** 2 > reach * reach) return 0;
  let touched = 0;
  for (let i = 0; i < b.n; i++) {
    const o = i * 3, r = b.r[i], dx = p[o] - m.x, dz = p[o + 2] - m.z;
    if (Math.abs(dx * cs - dz * sn) < m.halfW + r && Math.abs(dx * sn + dz * cs) < m.halfL + r && p[o + 1] - r < roof) touched++;
  }
  if (touched) wake(b);
  return touched;
}

// ---------------------------------------------------------------------------------------------------------
// Dismemberment.
// ---------------------------------------------------------------------------------------------------------

/**
 * Severs a part: its root (neck, shoulder or hip) is copied into a spare particle that becomes the stub, the
 * joining stick moves to it, and the limits that need the torso frame are dropped (a severed elbow or knee keeps
 * a frame-free bend). Returns the stub's particle index, or -1 if the part was already gone.
 */
export function detach(b: RagdollState, part: BodyPart) {
  const id = PARTS.indexOf(part);
  if (id < 0 || b.cut & (1 << id) || b.n >= COUNT) return -1;
  const info = PART_INFO[id], s = b.n++, root = info.root;
  for (let a = 0; a < 3; a++) {
    b.pos[s * 3 + a] = b.pos[root * 3 + a]; b.prev[s * 3 + a] = b.prev[root * 3 + a]; b.shown[s * 3 + a] = b.shown[root * 3 + a];
  }
  b.r[s] = b.r[root]; b.buoy[s] = b.buoy[root]; b.w[s] = 1 / STUB_MASS; b.mass += STUB_MASS;
  b.floor[s] = b.floor[root]; b.floorPrev[s] = b.floorPrev[root]; b.fx[s] = b.fx[root]; b.fz[s] = b.fz[root];
  b.sticks[info.stick * 2] = s;
  b.off |= 1 << (CONE_BIT + info.cone);
  if (info.hinge >= 0) {
    b.off |= 1 << (HINGE_BIT + info.hinge);
    b.cutBends[info.hinge * 3] = s; b.cutBends[info.hinge * 3 + 1] = info.joint; b.cutBends[info.hinge * 3 + 2] = info.child;
  }
  for (const k of info.ranges) { b.off |= 1 << (RANGE_BIT + k); b.ranges[k * 2] = 0; }
  // A severed leg's thigh capsule now starts at the stub, not at the hip it left.
  if (!part.startsWith('arm') && part !== 'head') for (let k = 0; k < b.self.length; k += 4) if (b.self[k + 1] === root) b.self[k + 1] = s;
  b.cut |= 1 << id;
  b.stub[id] = s;
  wake(b);
  return s;
}

/** The attached part nearest a world point (head, arms, legs), or null when all are gone. */
export function nearestPart(b: RagdollState, x: number, y: number, z: number): BodyPart | null {
  let best = -1, bestD = Infinity;
  for (let id = 0; id < PARTS.length; id++) {
    if (b.cut & (1 << id)) continue;
    for (const i of PART_INFO[id].probes) {
      const d = (b.pos[i * 3] - x) ** 2 + (b.pos[i * 3 + 1] - y) ** 2 + (b.pos[i * 3 + 2] - z) ** 2;
      if (d < bestD) { bestD = d; best = id; }
    }
  }
  return best < 0 ? null : PARTS[best];
}

// ---------------------------------------------------------------------------------------------------------
// Queries.
// ---------------------------------------------------------------------------------------------------------

export type RayHit = { t: number; index: number; part: BodyPart | null; x: number; y: number; z: number };

/** Ray (unit direction) against the bone capsules and the head sphere; fills `out` and returns true on a hit before maxT. */
export function raycast(b: RagdollState, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: RayHit) {
  const p = b.pos, n = b.n;
  // Bounding sphere of the live particles first.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const R = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + b.r[HEAD];
  if (sphereHit(ox - cx, oy - cy, oz - cz, dx, dy, dz, R) < 0 && (ox - cx) ** 2 + (oy - cy) ** 2 + (oz - cz) ** 2 > R * R) return false;
  const skelRay = b.skel.rayRadius;
  let bestT = maxT, bestIndex = -1, bestPart = -1;
  const head = b.r[HEAD];
  const th = sphereHit(ox - p[HEAD * 3], oy - p[HEAD * 3 + 1], oz - p[HEAD * 3 + 2], dx, dy, dz, head);
  if (th >= 0 && th < bestT) { bestT = th; bestIndex = HEAD; bestPart = 0; }
  for (let k = 0; k < STICK_COUNT; k++) {
    const rr = skelRay[k] * b.k;
    if (rr <= 0) continue;
    const a = b.sticks[k * 2], c = b.sticks[k * 2 + 1];
    const t = capsuleHit(ox, oy, oz, dx, dy, dz, p, a, c, rr);
    if (t >= 0 && t < bestT) { bestT = t; bestIndex = capsuleY < 0.5 ? a : c; bestPart = STICK_PART[k]; }
  }
  if (bestIndex < 0) return false;
  out.t = bestT; out.index = bestIndex; out.part = bestPart >= 0 ? PARTS[bestPart] : null;
  out.x = ox + dx * bestT; out.y = oy + dy * bestT; out.z = oz + dz * bestT;
  return true;
}

function sphereHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, r: number) {
  const b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}
let capsuleY = 0;
/** Ray vs capsule (Inigo Quilez): entry distance or -1; capsuleY is where along the bone (0..1) it hit. */
function capsuleHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, p: Float32Array, a: number, c: number, r: number) {
  const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
  const bax = p[c * 3] - ax, bay = p[c * 3 + 1] - ay, baz = p[c * 3 + 2] - az;
  const oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz, bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
  const A = baba - bard * bard;
  if (A > 1e-9) {
    const B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba, h = B * B - A * C;
    if (h < 0) return -1;
    const t = (-B - Math.sqrt(h)) / A, y = baoa + t * bard;
    if (y > 0 && y < baba) { capsuleY = y / baba; return t > 0 ? t : -1; }
  }
  // End caps.
  const t0 = sphereHit(oax, oay, oaz, dx, dy, dz, r), t1 = sphereHit(ox - p[c * 3], oy - p[c * 3 + 1], oz - p[c * 3 + 2], dx, dy, dz, r);
  if (t0 >= 0 && (t1 < 0 || t0 <= t1)) { capsuleY = 0; return t0; }
  if (t1 >= 0) { capsuleY = 1; return t1; }
  return -1;
}

/**
 * Which way the body lies, for getting up: yaw of the spine (waist to neck) on the ground plane, in the game's
 * convention (facing (sin yaw, cos yaw)), and whether the chest faces the sky.
 */
export function heading(b: RagdollState) {
  const p = b.pos;
  const sx = p[NECK * 3] - p[PELVIS * 3], sz = p[NECK * 3 + 2] - p[PELVIS * 3 + 2];
  // Chest forward = (shoulder L->R) x (chest->neck).
  const xx = p[SH_R * 3] - p[SH_L * 3], xz = p[SH_R * 3 + 2] - p[SH_L * 3 + 2];
  const yx = p[NECK * 3] - p[CHEST * 3], yz = p[NECK * 3 + 2] - p[CHEST * 3 + 2];
  return { yaw: Math.atan2(sx, sz), faceUp: xz * yx - xx * yz > 0 };
}

/** Render positions between the last two substeps: out = lerp(shown, pos, alpha) for the live particles. */
export function interpolate(b: RagdollState, alpha: number, out: Float32Array) {
  const p = b.pos, s = b.shown;
  for (let i = 0; i < b.n * 3; i++) out[i] = s[i] + (p[i] - s[i]) * alpha;
  return out;
}

/** Signed hinge angles (radians) and sideways bend of elbows (0, 1) and knees (2, 3), without correcting them. */
export function hingeAngles(b: RagdollState): [number, number][] {
  buildFrames(b.pos);
  return [0, 1, 2, 3].map((s) => { const a = solveHinge(b, s, false); return [a, hingeSide]; });
}

/** Angle of each cone joint from its axis, as a fraction of its limit (shoulders, hips, neck, spine). */
export function coneUsage(b: RagdollState) {
  buildFrames(b.pos);
  const p = b.pos, cones = b.skel.cones;
  return [0, 1, 2, 3, 4, 5].map((c) => {
    const k = c * 7, joint = cones[k + 1], child = cones[k + 2];
    let dx = p[child * 3] - p[joint * 3], dy = p[child * 3 + 1] - p[joint * 3 + 1], dz = p[child * 3 + 2] - p[joint * 3 + 2];
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    toWorld(cones[k] * 9, cones[k + 3], cones[k + 4], cones[k + 5]);
    return Math.acos(Math.max(-1, Math.min(1, dx * tv[0] + dy * tv[1] + dz * tv[2]))) / cones[k + 6];
  });
}
