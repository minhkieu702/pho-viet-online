import * as THREE from 'three';
import { BUILDINGS } from './city';
import { worldRoads } from './map/world-types';
import type { RoadEdge } from './map/roads';
import type { FallMode, HitKind, RagdollBody, RagdollLook } from './ragdoll';
import type { createRagdolls } from './ragdoll';
import {
  FIGURE, FigureBatch, HAND, HEAD, chestMatrix, deriveStyle, figureGeometry, figureMaterial, gait, limbMatrix, newGait, palettesOf, setBits, setStyle, sideX, swingCode, zombify,
  type ArmPose, type Detail,
} from './figures';

/**
 * Zombie mode's undead: the neighbourhood's residents, turned. They shamble about, notice the player by
 * sight or by noise (gunfire carries far), chase along the sidewalks when a building is in the way, and
 * claw at whoever they reach. They come in waves, crawling out of the ground or stumbling out of doors.
 * Walkers are slow, runners sprint (more of them at night), brutes are huge and hit hard. Head shots count.
 */
export type ZombieKind = 'walker' | 'runner' | 'brute';
type ZombieState = 'off' | 'rise' | 'wander' | 'chase' | 'stagger' | 'down';
type Point = { x: number; z: number };
export type Zombie = {
  index: number; kind: ZombieKind; state: ZombieState;
  x: number; z: number; yaw: number; pace: number; stride: number; lean: number; tilt: number;
  health: number; maxHealth: number; hitAt: number;
  /** Rising out of the ground: 0 buried, 1 standing. */
  rise: number;
  goalX: number; goalZ: number; lastSeen: number; investigateUntil: number; thinkAt: number;
  waypoints: Point[]; routeAt: number; stuck: number; sniffAt: number;
  windup: number; attackAt: number; timer: number;
  body: RagdollBody | null; look: number;
  /** Where the head is turned (animation only). */
  headYaw: number;
};
export type ZombieWorld = {
  clear: (x: number, z: number, radius: number) => boolean;
  sight: (x1: number, z1: number, x2: number, z2: number) => boolean;
  ground: (x: number, z: number) => number;
  route: (fromX: number, fromZ: number, toX: number, toZ: number) => Point[];
};
/** The player as zombies see them. */
export type Prey = { x: number; z: number; down: boolean; inVehicle: boolean; reach: number; night: number };
export type ZombieStrike = { damage: number; x: number; z: number; heavy: boolean };

const MAX = 64;
const KINDS: Record<ZombieKind, { health: number; wander: number; chase: number; damage: number; reach: number; cooldown: number; windup: number; scale: number; width: number; sight: number }> = {
  walker: { health: 90, wander: 0.55, chase: 1.9, damage: 7, reach: 1.15, cooldown: 1.15, windup: 0.38, scale: 0.84, width: 1, sight: 24 },
  runner: { health: 55, wander: 0.85, chase: 4.1, damage: 5, reach: 1.1, cooldown: 0.8, windup: 0.25, scale: 0.8, width: 0.92, sight: 30 },
  brute: { health: 320, wander: 0.5, chase: 1.7, damage: 20, reach: 1.55, cooldown: 1.7, windup: 0.55, scale: 1.14, width: 1.3, sight: 20 },
};
/** Hit height in figure units: the top of a hunched head (the figure is 2.08 u tall standing straight). */
const HEIGHT = 2.0;
const RADIUS = 0.38;
const GROANS = ['Grừ…', 'Ưưư…', 'Grràoo!', 'Hừ… hừ…', 'Ááá…', 'Khhh…'];
// Grey-green skin, dirty and faded clothes.
const SKINS = ['#9aa88a', '#8e9c80', '#a7ad92', '#87937a', '#b0b39a', '#99a17f'];
const SHIRTS = ['#6f5a52', '#5f6d73', '#7a6a4c', '#4f5a4c', '#8a5a4f', '#5b5168', '#6d6a63', '#7d4a40', '#4d5f6a', '#8f8576', '#6b3a32', '#9a8f7a'];
const PANTS = ['#3a3f45', '#4a4238', '#2f3540', '#504a40', '#3d4a4a', '#5a4a3c'];
const ROLES = ['worker', 'student', 'vendor', 'retiree', 'owl'];
const clamp = THREE.MathUtils.clamp;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// Arm poses ([swing, abduct, roll, elbow, twist, flex, hand], mirrored for the left arm).
/** The classic reach: arms out in front, palms down, clawed fingers raised at the wrist. */
const REACH: ArmPose = [-1.45, 0.12, 0, -0.25, 0.9, -0.5, HAND.CLAW];
/** Wandering: forearms half raised, the hands hanging limp from the wrists. */
const DROOP: ArmPose = [-0.75, 0.1, 0, -0.85, 1.1, 0.95, HAND.RELAXED];
/** Knocked back by a hit: arms thrown out. */
const FLINCH: ArmPose = [-0.45, 0.5, 0, -0.45, 0.2, -0.3, HAND.OPEN];


export function createZombies(scene: THREE.Scene, ragdolls: ReturnType<typeof createRagdolls>, world: ZombieWorld, say: (zombie: Zombie, text: string) => void = () => {}) {
  let seed = 9001;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];

  // A wardrobe of turned residents (their everyday outfits, faded and dirtied, some barefoot); each zombie wears
  // one. Trouser legs and sleeves are often torn off. The style is remembered so ragdolls dress the same.
  const dress = Array.from({ length: 28 }, (_, i) => {
    const look: RagdollLook = { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS) };
    const style = zombify(deriveStyle(look, i, ROLES[i % ROLES.length]), i);
    if (random() < 0.35) style.colors.shin = look.skin;
    if (random() < 0.5) style.colors.lower = look.skin;
    setStyle(look, style);
    return { look, style, palettes: palettesOf(style) };
  });

  // Four articulated figure meshes (body, left arm, right arm, legs) for the whole horde.
  const materials = { body: figureMaterial('body'), arm: figureMaterial('arm'), leg: figureMaterial('leg') };
  let detail: Detail = 'hi';
  const bodies = new FigureBatch(figureGeometry('body', detail), materials.body, MAX);
  const armsL = new FigureBatch(figureGeometry('armL', detail), materials.arm, MAX);
  const armsR = new FigureBatch(figureGeometry('armR', detail), materials.arm, MAX);
  const legs = new FigureBatch(figureGeometry('leg', detail), materials.leg, MAX * 2);
  const batches = [bodies, armsL, armsR, legs];
  for (const batch of batches) { batch.mesh.receiveShadow = true; scene.add(batch.mesh); }

  const zombies: Zombie[] = Array.from({ length: MAX }, (_, index) => ({
    index, kind: 'walker', state: 'off', x: 0, z: 0, yaw: 0, pace: 0, stride: 0, lean: 0.25, tilt: 0,
    health: 0, maxHealth: 1, hitAt: -99, rise: 1, goalX: 0, goalZ: 0, lastSeen: -99, investigateUntil: 0, thinkAt: 0,
    waypoints: [], routeAt: 0, stuck: 0, sniffAt: 0, windup: 0, attackAt: 0, timer: 0, body: null, look: 0, headYaw: 0,
  }));
  const corpses: { body: RagdollBody; until: number }[] = [];
  const doors = BUILDINGS.map((b) => ({ x: b.door.x, z: b.door.z, curb: b.curb }));

  let running = false;
  let wave = 0, toSpawn = 0, spawnAt = 0, breakUntil = 0, inBreak = true, kills = 0, spawned = 0, groanAt = 0;
  const events = { strikes: [] as ZombieStrike[], waveStarted: 0, waveCleared: 0, risen: [] as Point[] };

  const standing = (z: Zombie) => z.state !== 'off' && z.state !== 'down';
  /** Vertical world scale of a zombie's figure (its kind's size times the build of what it wears). */
  const scaleY = (z: Zombie) => KINDS[z.kind].scale * dress[z.look].style.height;
  /** How far the torso is bent forward at the hips (back when staggering from a hit, further while clawing out of the ground). */
  const pitchOf = (z: Zombie) => z.lean + (z.state === 'stagger' ? -0.45 : 0) + (z.state === 'rise' ? 0.4 * (1 - z.rise) : 0);
  const alive = () => zombies.reduce((n, z) => n + (z.state !== 'off' ? 1 : 0), 0);
  const groan = (z: Zombie, time: number, chance: number) => {
    if (time < groanAt || random() > chance) return;
    groanAt = time + 2.2;
    say(z, pick(GROANS));
  };

  /**
   * A spot 22–55 m from the player: a doorway (they stumble out) or a walking line of the live roads, a sidewalk or
   * the middle of a hẻm (they claw out of the ground).
   */
  const ring: { e: RoadEdge; w: number }[] = [];
  function spawnSpot(px: number, pz: number): (Point & { rise: boolean }) | null {
    const roads = worldRoads().roads;
    ring.length = 0;
    let total = 0;
    for (const h of roads.edgesNear(px, pz, 55)) { const w = Math.min(h.edge.len, 110); ring.push({ e: h.edge, w }); total += w; }
    for (let attempt = 0; attempt < 24; attempt++) {
      if (random() < 0.45) {
        const door = pick(doors);
        const d = Math.hypot(door.x - px, door.z - pz);
        if (d > 20 && d < 60 && world.clear(door.x, door.z, 0.4)) return { x: door.x, z: door.z, rise: false };
      } else if (total > 0) {
        let k = random() * total, e = ring[0].e;
        for (const r of ring) { k -= r.w; if (k <= 0) { e = r.e; break; } }
        const p = roads.pointAt(e, random() * e.len), side = e.walk > 0 ? (random() < 0.5 ? -1 : 1) * e.walk : 0;
        const x = p.x - p.hz * side, z = p.z + p.hx * side, d = Math.hypot(x - px, z - pz);
        if (d > 22 && d < 55 && world.clear(x, z, 0.45)) return { x, z, rise: true };
      }
    }
    return null;
  }

  function kindFor(time: number, night: number): ZombieKind {
    spawned++;
    if (wave >= 3 && spawned % Math.max(5, 11 - wave) === 0) return 'brute';
    const runners = (wave >= 2 ? Math.min(0.35, 0.08 + wave * 0.04) : 0) + night * 0.15;
    return random() < runners ? 'runner' : 'walker';
  }

  function spawn(px: number, pz: number, time: number, night: number) {
    const z = zombies.find((c) => c.state === 'off');
    const spot = z && spawnSpot(px, pz);
    if (!z || !spot) return false;
    const kind = kindFor(time, night);
    const k = KINDS[kind];
    Object.assign(z, {
      kind, state: spot.rise ? 'rise' : 'wander', x: spot.x, z: spot.z, yaw: Math.atan2(px - spot.x, pz - spot.z), pace: 0, stride: random() * 6,
      lean: kind === 'runner' ? 0.38 : kind === 'brute' ? 0.18 : 0.22 + random() * 0.12, tilt: (random() - 0.5) * 0.24,
      health: k.health * (1 + wave * 0.05), maxHealth: k.health * (1 + wave * 0.05), hitAt: -99, rise: spot.rise ? 0 : 1,
      goalX: px, goalZ: pz, lastSeen: -99, investigateUntil: time + 30, thinkAt: time + random() * 0.3, waypoints: [], routeAt: 0, stuck: 0, sniffAt: time + 20 + random() * 10,
      windup: 0, attackAt: 0, timer: 0, body: null, look: Math.floor(random() * dress.length), headYaw: 0,
    });
    if (spot.rise) events.risen.push({ x: spot.x, z: spot.z });
    return true;
  }

  function knock(z: Zombie, vx: number, vy: number, vz: number, time: number, hit?: { x: number; y: number; z: number } | null, mode?: FallMode, kind?: HitKind) {
    const k = KINDS[z.kind];
    const d = dress[z.look];
    z.state = 'down';
    z.timer = time + 3 + random() * 1.5;
    // The ragdoll has the standing zombie's scale and build (a brute stays broad); the blow lands where it hit.
    z.body = ragdolls.spawn({
      x: z.x, y: world.ground(z.x, z.z), z: z.z, yaw: z.yaw, scale: k.scale, look: d.look, velocity: { x: vx, y: vy, z: vz },
      build: { width: d.style.width * k.width, height: d.style.height }, hit, mode, kind,
    });
    return z.body;
  }

  /** Moves toward (tx, tz), sliding along walls and keeping a little apart from the rest of the horde. */
  function walk(z: Zombie, tx: number, tz: number, speed: number, dt: number) {
    let dx = tx - z.x, dz = tz - z.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { z.pace = 0; return; }
    dx /= d; dz /= d;
    for (const o of zombies) {
      if (o === z || !standing(o)) continue;
      const ox = z.x - o.x, oz = z.z - o.z, od = ox * ox + oz * oz;
      if (od < 0.64 && od > 1e-4) { const s = (0.8 - Math.sqrt(od)) * 1.5; dx += (ox / Math.sqrt(od)) * s; dz += (oz / Math.sqrt(od)) * s; }
    }
    const n = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, speed * dt);
    const nx = z.x + (dx / n) * step, nz = z.z + (dz / n) * step;
    if (world.clear(nx, nz, 0.32)) { z.x = nx; z.z = nz; z.stuck = Math.max(0, z.stuck - dt); }
    else if (world.clear(nx, z.z, 0.32)) { z.x = nx; z.stuck += dt * 0.5; }
    else if (world.clear(z.x, nz, 0.32)) { z.z = nz; z.stuck += dt * 0.5; }
    else z.stuck += dt;
    const turn = Math.atan2(dx, dz);
    z.yaw += Math.atan2(Math.sin(turn - z.yaw), Math.cos(turn - z.yaw)) * Math.min(1, dt * (z.kind === 'runner' ? 9 : 4));
    z.pace = speed;
    z.stride += dt * speed * (z.kind === 'runner' ? 3.2 : 2.6);
  }

  function think(z: Zombie, prey: Prey, time: number) {
    const k = KINDS[z.kind];
    z.thinkAt = time + 0.22 + random() * 0.18;
    const d = Math.hypot(prey.x - z.x, prey.z - z.z);
    const sight = k.sight * (1 - prey.night * 0.3);
    const seen = !prey.down && (d < 5 || (d < sight && world.sight(z.x, z.z, prey.x, prey.z)));
    if (seen) {
      if (z.state !== 'chase') groan(z, time, 0.35);
      z.state = 'chase';
      z.goalX = prey.x;
      z.goalZ = prey.z;
      z.lastSeen = time;
    } else if (z.state === 'chase' && time - z.lastSeen > 5) {
      z.state = 'wander';
      z.investigateUntil = time + 8;
    }
    // The horde smells the living: every so often a lost zombie heads back toward the player.
    if (z.state !== 'chase' && time > z.sniffAt && !prey.down) {
      z.sniffAt = time + 7 + random() * 6;
      z.goalX = prey.x + (random() - 0.5) * 16;
      z.goalZ = prey.z + (random() - 0.5) * 16;
      z.investigateUntil = time + 16;
      z.routeAt = 0;
    }
    // A building in the way: follow the sidewalks around it.
    const hunting = z.state === 'chase' || time < z.investigateUntil;
    if (hunting && (z.stuck > 0.6 || !world.sight(z.x, z.z, z.goalX, z.goalZ))) {
      if (time > z.routeAt) {
        z.waypoints = world.route(z.x, z.z, z.goalX, z.goalZ);
        z.routeAt = time + 2.2;
        z.stuck = 0;
      }
    } else z.waypoints.length = 0;
    if (!hunting && (z.stuck > 1 || Math.hypot(z.goalX - z.x, z.goalZ - z.z) < 1.2)) {
      z.stuck = 0;
      // Aimless shuffling around the block.
      const a = random() * Math.PI * 2;
      z.goalX = z.x + Math.cos(a) * (4 + random() * 8);
      z.goalZ = z.z + Math.sin(a) * (4 + random() * 8);
      if (!world.clear(z.goalX, z.goalZ, 0.4)) { z.goalX = z.x; z.goalZ = z.z; }
    }
  }

  function step(z: Zombie, dt: number, time: number, prey: Prey) {
    const k = KINDS[z.kind];
    if (z.state === 'down') {
      if (time >= z.timer) {
        // Back on their feet where the body lies, clawing up off the ground again.
        if (z.body && !z.body.removed) {
          const c = ragdolls.center(z.body, tmp);
          z.x = c.x; z.z = c.z;
          ragdolls.remove(z.body);
        }
        z.body = null;
        z.state = 'rise';
        z.rise = 0.35;
      }
      return;
    }
    if (z.state === 'rise') {
      z.rise = Math.min(1, z.rise + dt / 1.6);
      z.pace = 0;
      if (z.rise >= 1) { z.state = 'chase'; z.lastSeen = time; groan(z, time, 0.5); }
      return;
    }
    if (z.state === 'stagger') {
      if (time >= z.timer) z.state = 'chase';
      z.pace = 0;
      return;
    }
    if (time >= z.thinkAt) think(z, prey, time);
    const d = Math.hypot(prey.x - z.x, prey.z - z.z);
    const reach = prey.inVehicle ? prey.reach + 0.45 : k.reach;
    // Clawing: a short wind-up, then the blow lands if the prey is still in reach.
    if (z.state === 'chase' && !prey.down && d < reach) {
      const face = Math.atan2(prey.x - z.x, prey.z - z.z);
      z.yaw += Math.atan2(Math.sin(face - z.yaw), Math.cos(face - z.yaw)) * Math.min(1, dt * 10);
      if (!z.windup && time >= z.attackAt) z.windup = time + k.windup;
      z.pace = 0;
    }
    if (z.windup && time >= z.windup) {
      z.windup = 0;
      z.attackAt = time + k.cooldown;
      if (!prey.down && d < reach + 0.45) {
        events.strikes.push({ damage: k.damage * (1 + prey.night * 0.2), x: z.x, z: z.z, heavy: z.kind === 'brute' });
        groan(z, time, 0.25);
      }
    }
    if (z.windup || (z.state === 'chase' && d < reach * 0.85)) return;
    const hunting = z.state === 'chase' || time < z.investigateUntil;
    const speed = hunting ? k.chase * (1 + prey.night * 0.3) * (z.health < z.maxHealth * 0.35 ? 0.75 : 1) : k.wander;
    let tx = z.goalX, tz = z.goalZ;
    while (z.waypoints.length && Math.hypot(z.waypoints[0].x - z.x, z.waypoints[0].z - z.z) < 1) z.waypoints.shift();
    if (z.waypoints.length) { tx = z.waypoints[0].x; tz = z.waypoints[0].z; }
    if (z.state === 'chase' && !z.waypoints.length) { tx = prey.x; tz = prey.z; }
    walk(z, tx, tz, speed, dt);
  }

  const base = new THREE.Matrix4(), hips = new THREE.Matrix4(), chest = new THREE.Matrix4(), limbM = new THREE.Matrix4();
  const quat = new THREE.Quaternion(), turn = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3(), euler = new THREE.Euler();
  const pivot = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const walkCycle = newGait();
  const bodyPose = [0, 0, 0, 0], limbPose = [0, 0, 0, 0];
  const face = new Float32Array(8);
  const armL: number[] = [], armR: number[] = [];
  let frameDt = 0;
  // An arm from the chest matrix: [swing, abduct, roll, elbow, twist, flex, hand], abduct and roll mirrored on the left.
  const arm = (side: 1 | -1, a: ArmPose, look: Float32Array, shoulderX: number) => {
    const sx = sideX(side);
    limbMatrix(chest, sx * shoulderX, FIGURE.shoulderY, a[0], sx * a[1], sx * a[2], limbM);
    limbPose[0] = a[3]; limbPose[1] = a[4]; limbPose[2] = a[5]; limbPose[3] = a[6];
    (side > 0 ? armsR : armsL).push(limbM, look, limbPose);
  };
  const leg = (side: 1 | -1, thigh: number, knee: number, ankle: number, toe: number, look: Float32Array) => {
    limbMatrix(hips, sideX(side) * FIGURE.hipX, FIGURE.hipY, thigh, 0, 0, limbM);
    limbPose[0] = knee; limbPose[1] = ankle; limbPose[2] = toe; limbPose[3] = 0;
    legs.push(limbM, look, limbPose);
  };
  const tuple = (out: number[], swing: number, abduct: number, roll: number, elbow: number, twist: number, flex: number, hand: number): ArmPose => {
    out[0] = swing; out[1] = abduct; out[2] = roll; out[3] = elbow; out[4] = twist; out[5] = flex; out[6] = hand;
    return out as unknown as ArmPose;
  };

  function draw(z: Zombie, time: number, prey: Prey) {
    if (!standing(z)) return;
    const k = KINDS[z.kind];
    const d = dress[z.look], p = d.palettes;
    const sx = k.scale * k.width * d.style.width, sy = k.scale * d.style.height, sh = d.style.shoulderX;
    const sink = (1 - z.rise) * HEIGHT * sy;
    const runner = z.kind === 'runner', brute = z.kind === 'brute';
    // Walkers shuffle with short steps; runners sprint.
    const go = clamp(z.pace / (runner ? 2.5 : 1.2), 0, 1) * (runner || brute ? 1 : 0.8);
    const g = gait(z.stride, runner ? 1 : brute ? 0.3 : 0, go, walkCycle);
    // Hunched forward at the hips and tilted to one side over upright legs; the body lurches with each step.
    const swing = Math.sin(z.stride);
    const chasing = z.state === 'chase';
    const feet = world.ground(z.x, z.z) - sink + g.bob * sy, hip = FIGURE.hipY * sy;
    hips.compose(pos.set(z.x, feet, z.z), turn.setFromAxisAngle(up, z.yaw), size.set(sx, sy, sx));
    euler.set(pitchOf(z), z.yaw, z.tilt + swing * 0.07 * Math.min(1, z.pace), 'YXZ');
    quat.setFromEuler(euler);
    pivot.set(0, hip, 0).applyQuaternion(quat);
    base.compose(pos.set(z.x, feet + hip, z.z).sub(pivot), quat, size);
    // The head lolls and sways; a chasing zombie lifts it and turns it toward the prey.
    const twist = runner ? g.chest : g.chest * 0.5;
    const toward = chasing && !prey.down ? clamp(wrap(Math.atan2(prey.x - z.x, prey.z - z.z) - z.yaw) - twist, -1, 1) : 0;
    z.headYaw = THREE.MathUtils.damp(z.headYaw, toward + 0.4 * Math.sin(time * 0.9 + z.index * 1.3) * (chasing ? 0.35 : 1), 4, frameDt);
    bodyPose[0] = z.headYaw;
    bodyPose[1] = z.windup ? -0.2 : chasing ? 0.05 - z.lean * 0.9 : 0.3 + 0.08 * Math.sin(time * 0.7 + z.index);
    bodyPose[2] = twist;
    // Skirts and áo dài panels swing open with the stride so the knees stay inside; hair swings half as much.
    const flare = Math.abs(g.thighL) + 0.1 * go;
    bodyPose[3] = swingCode(flare, flare * 0.5);
    // The jaw hangs open while clawing, rising, and in bursts of groaning.
    face.set(p.body);
    setBits(face, 0, HEAD.MOUTH, !!z.windup || z.state === 'rise' || Math.sin(time * 2.3 + z.index * 1.7) > 0.55);
    bodies.push(base, face, bodyPose);
    chestMatrix(base, twist, chest);
    // A limp: one leg (the same one for each zombie) drags along behind, toes scraping the ground.
    const lame = z.index % 2 ? -1 : 1;
    const dragL = lame < 0 && !runner, dragR = lame > 0 && !runner;
    leg(-1, dragL ? g.thighL * 0.55 + 0.08 : g.thighL, dragL ? g.kneeL * 0.25 + 0.03 : g.kneeL, dragL ? g.ankleL + 0.45 : g.ankleL, dragL ? 0 : g.toeL, p.legs);
    leg(1, dragR ? g.thighR * 0.55 + 0.08 : g.thighR, dragR ? g.kneeR * 0.25 + 0.03 : g.kneeR, dragR ? g.ankleR + 0.45 : g.ankleR, dragR ? 0 : g.toeR, p.legs);
    let left: ArmPose, right: ArmPose;
    if (z.windup) {
      // Wind-up to claw: both arms raised high, then brought down.
      const t = 1 - Math.max(0, z.windup - time) / k.windup;
      left = right = tuple(armL, -2.7 + t * 1.6, 0.25, 0, -0.4, 0.9, -0.4, HAND.CLAW);
    } else if (z.state === 'rise') {
      // Clawing up out of the ground, one arm after the other.
      left = tuple(armL, -2.6 + Math.sin(time * 9) * 0.3, 0.2, 0, -0.3 - 0.3 * Math.max(0, Math.sin(time * 9)), 0.6, -0.3, HAND.CLAW);
      right = tuple(armR, -2.4 + Math.cos(time * 8) * 0.3, 0.2, 0, -0.3 - 0.3 * Math.max(0, Math.cos(time * 8)), 0.6, -0.3, HAND.CLAW);
    } else if (z.state === 'stagger') {
      left = right = FLINCH;
    } else if (runner) {
      // Sprinting with the elbows bent and the fingers hooked.
      left = tuple(armL, -0.35 + g.armL * 1.3, 0.3, 0, -1.3, 0.5, -0.3, HAND.CLAW);
      right = tuple(armR, -0.35 + g.armR * 1.3, 0.3, 0, -1.3, 0.5, -0.3, HAND.CLAW);
    } else if (brute) {
      // Heavy fists swinging wide.
      left = tuple(armL, 0.1 + swing * 0.35, 0.35, 0, -0.6, 0, 0, HAND.FIST);
      right = tuple(armR, 0.1 - swing * 0.35, 0.35, 0, -0.6, 0, 0, HAND.FIST);
    } else {
      // The classic reach when it has prey, arms dangling when it wanders; swaying either way.
      const reach = chasing ? REACH : DROOP;
      left = tuple(armL, reach[0] + Math.sin(time * 2.1 + z.index) * 0.14, reach[1], reach[2], reach[3], reach[4], reach[5] + Math.sin(time * 3.1 + z.index) * 0.15, reach[6]);
      right = tuple(armR, reach[0] + 0.1 + Math.cos(time * 1.9 + z.index) * 0.14, reach[1], reach[2], reach[3], reach[4], reach[5] + Math.cos(time * 2.7 + z.index) * 0.15, reach[6]);
      // Wanderers' arms swing a little with the shuffle.
      if (!chasing) { armL[0] += g.armL * 0.3; armR[0] += g.armR * 0.3; }
    }
    arm(-1, left, p.armL, sh);
    arm(1, right, p.armR, sh);
  }

  function hide() {
    for (const batch of batches) { batch.begin(); batch.end(); }
  }
  hide();

  return {
    zombies,
    get running() { return running; },
    /** Wave number, zombies left in it (standing or still to come), kills and seconds of the break left. */
    stats(time: number) {
      return { wave, left: alive() + toSpawn, kills, breakLeft: running && inBreak ? Math.max(0, Math.ceil(breakUntil - time)) : 0 };
    },
    start(time: number) {
      this.stop();
      running = true;
      wave = 0; toSpawn = 0; kills = 0; spawned = 0;
      inBreak = true;
      breakUntil = time + 6;
    },
    stop() {
      running = false;
      for (const z of zombies) { if (z.body) ragdolls.remove(z.body); z.body = null; z.state = 'off'; }
      for (const c of corpses) ragdolls.remove(c.body);
      corpses.length = 0;
      hide();
    },
    /** Gunfire, explosions and crashes: zombies within `radius` come to look. */
    hear(x: number, z: number, radius: number, time: number) {
      for (const zb of zombies) {
        if (!standing(zb) || zb.state === 'chase') continue;
        if ((zb.x - x) ** 2 + (zb.z - z) ** 2 > radius * radius) continue;
        zb.goalX = x + (random() - 0.5) * 6;
        zb.goalZ = z + (random() - 0.5) * 6;
        zb.investigateUntil = time + 25;
        zb.routeAt = 0;
        zb.thinkAt = time;
      }
    },
    /**
     * Applies damage; returns the body when the zombie falls (killed: limp, or knocked over by a big hit).
     * `at` is the world point that was hit and `kind` what hit it, if known.
     */
    damage(zb: Zombie, amount: number, vx: number, vy: number, vz: number, time: number, force = false, at?: { x: number; y: number; z: number } | null, kind?: HitKind) {
      if (!standing(zb) || zb.state === 'rise' && zb.rise < 0.5) return null;
      zb.health -= amount;
      zb.hitAt = time;
      zb.state = zb.state === 'rise' ? 'rise' : 'chase';
      zb.lastSeen = time;
      zb.windup = 0;
      const killed = zb.health <= 0;
      if (killed) {
        const body = knock(zb, vx, vy, vz, time, at, 'limp', kind);
        zb.state = 'off';
        zb.body = null;
        corpses.push({ body, until: time + 14 });
        kills++;
        return { body, killed: true };
      }
      if (force && zb.kind !== 'brute') return { body: knock(zb, vx, vy, vz, time, at, undefined, kind), killed: false };
      if (zb.state !== 'rise') {
        zb.state = 'stagger';
        zb.timer = time + (zb.kind === 'brute' ? 0.12 : 0.32);
        zb.x += vx * 0.02;
        zb.z += vz * 0.02;
      }
      return { body: null, killed: false };
    },
    /**
     * Nearest standing zombie crossed by a ray (`dir` normalised): `height` is the hit height above its feet in
     * figure units (compare with FIGURE.neckY), `head` is true above the neck of the hunched figure.
     */
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { zombie: Zombie; t: number; height: number; head: boolean } | null = null;
      for (const zb of zombies) {
        if (!standing(zb)) continue;
        const k = KINDS[zb.kind];
        const r = RADIUS * k.scale * k.width;
        const rx = origin.x - zb.x, rz = origin.z - zb.z;
        const a = dir.x * dir.x + dir.z * dir.z;
        if (a < 1e-6) continue;
        const b = 2 * (rx * dir.x + rz * dir.z), c = rx * rx + rz * rz - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        let t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0) t = (-b + Math.sqrt(disc)) / (2 * a);
        if (t <= 0 || t >= maxT || (best && t >= best.t)) continue;
        const sy = scaleY(zb);
        const feet = world.ground(zb.x, zb.z) - (1 - zb.rise) * HEIGHT * sy;
        const y = origin.y + dir.y * t - feet;
        // The neck of a figure bent at the hips sits lower than a standing one's.
        const neck = (FIGURE.hipY + (FIGURE.neckY - FIGURE.hipY) * Math.cos(pitchOf(zb))) * sy;
        if (y > 0 && y < HEIGHT * sy) best = { zombie: zb, t, height: y / sy, head: y > neck };
      }
      return best;
    },
    near(x: number, z: number, radius: number, callback: (zombie: Zombie) => void) {
      for (const zb of zombies) if (standing(zb) && (zb.x - x) ** 2 + (zb.z - z) ** 2 < radius * radius) callback(zb);
    },
    /** Upright capsules for aiming: centre, feet, top and radius. */
    forEachStanding(callback: (x: number, z: number, y0: number, y1: number, radius: number, zombie: Zombie) => void) {
      for (const zb of zombies) {
        if (!standing(zb)) continue;
        const k = KINDS[zb.kind], sy = scaleY(zb);
        const feet = world.ground(zb.x, zb.z) - (1 - zb.rise) * HEIGHT * sy;
        callback(zb.x, zb.z, feet, feet + HEIGHT * sy, RADIUS * k.scale * k.width, zb);
      }
    },
    forEachHurt(time: number, callback: (x: number, y: number, z: number, fraction: number) => void) {
      for (const zb of zombies) {
        if (!standing(zb) || time - zb.hitAt > 3) continue;
        callback(zb.x, world.ground(zb.x, zb.z) + HEIGHT * scaleY(zb) + 0.3, zb.z, Math.max(0, zb.health) / zb.maxHealth);
      }
    },
    update(dt: number, time: number, prey: Prey) {
      frameDt = dt;
      events.strikes.length = 0;
      events.risen.length = 0;
      events.waveStarted = 0;
      events.waveCleared = 0;
      if (!running) return events;
      // Waves: a break, then a wave that grows each time; it ends when every zombie in it is down.
      const left = alive() + toSpawn;
      if (left === 0 && !inBreak) {
        inBreak = true;
        breakUntil = time + 20;
        events.waveCleared = wave;
      }
      if (inBreak && time >= breakUntil) {
        inBreak = false;
        wave++;
        toSpawn = 8 + wave * 6;
        spawnAt = time;
        events.waveStarted = wave;
      }
      const cap = Math.min(MAX, 22 + wave * 4);
      while (toSpawn > 0 && time >= spawnAt && alive() < cap) {
        if (!spawn(prey.x, prey.z, time, prey.night)) { spawnAt = time + 0.5; break; }
        toSpawn--;
        spawnAt = time + Math.max(0.2, 0.8 - wave * 0.05);
      }
      for (const z of zombies) if (z.state !== 'off') step(z, dt, time, prey);
      for (let i = corpses.length - 1; i >= 0; i--) {
        if (time > corpses[i].until || corpses[i].body.removed) { ragdolls.remove(corpses[i].body); corpses.splice(i, 1); }
      }
      for (const batch of batches) batch.begin();
      for (const z of zombies) draw(z, time, prey);
      for (const batch of batches) batch.end();
      return events;
    },
    /**
     * Figure level of detail ('hi' at quality levels 0-2, 'lo' at 3-5). With up to 64 on screen, zombies already
     * switch to 'lo' from quality level 2: pass the level to apply that.
     */
    setDetail(next: Detail, level = 0) {
      const d: Detail = level >= 2 ? 'lo' : next;
      if (d === detail) return;
      detail = d;
      bodies.setGeometry(figureGeometry('body', detail));
      armsL.setGeometry(figureGeometry('armL', detail));
      armsR.setGeometry(figureGeometry('armR', detail));
      legs.setGeometry(figureGeometry('leg', detail));
    },
    dispose() {
      this.stop();
      for (const batch of batches) { scene.remove(batch.mesh); batch.dispose(); }
      for (const m of Object.values(materials)) m.dispose();
    },
  };
}
