import * as THREE from 'three';
import { BOUND, BUILDINGS, ROADS, SIDEWALK } from './city';
import type { RagdollBody, RagdollLook } from './ragdoll';
import type { createRagdolls } from './ragdoll';
import { FIGURE, FigureBatch, PART, armGeometry, bodyGeometry, deriveStyle, figureMaterial, legGeometry, palette, setStyle, styleOf } from './figures';

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
const HEIGHT = 1.85;
const RADIUS = 0.38;
const RAGDOLL_SCALE = 0.7;
const GROANS = ['Grừ…', 'Ưưư…', 'Grràoo!', 'Hừ… hừ…', 'Ááá…', 'Khhh…'];
// Grey-green skin, dirty and faded clothes.
const SKINS = ['#9aa88a', '#8e9c80', '#a7ad92', '#87937a', '#b0b39a', '#99a17f'];
const SHIRTS = ['#6f5a52', '#5f6d73', '#7a6a4c', '#4f5a4c', '#8a5a4f', '#5b5168', '#6d6a63', '#7d4a40', '#4d5f6a', '#8f8576', '#6b3a32', '#9a8f7a'];
const PANTS = ['#3a3f45', '#4a4238', '#2f3540', '#504a40', '#3d4a4a', '#5a4a3c'];
const ROLES = ['worker', 'student', 'vendor', 'retiree', 'owl'];

export function createZombies(scene: THREE.Scene, ragdolls: ReturnType<typeof createRagdolls>, world: ZombieWorld, say: (zombie: Zombie, text: string) => void = () => {}) {
  let seed = 9001;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];

  // A wardrobe of turned residents; each zombie wears one.
  const looks: RagdollLook[] = Array.from({ length: 28 }, (_, i) => {
    const look: RagdollLook = { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS) };
    const style = deriveStyle(look, i, ROLES[i % ROLES.length]);
    setStyle(look, { ...style, forearm: 'skin', shin: random() < 0.35 ? 'skin' : 'pants', shoes: random() < 0.3 ? look.skin : style.shoes });
    return look;
  });
  const dress = looks.map((look) => {
    const style = styleOf(look);
    return {
      body: palette([look.shirt, look.pants, look.skin, style.hair, style.accent], style.mask),
      legs: palette([look.pants, style.shin === 'skin' ? look.skin : look.pants, style.shoes], PART.STRAIGHT),
      arms: palette([look.shirt, look.skin, look.skin]),
    };
  });

  const material = figureMaterial();
  const bodies = new FigureBatch(bodyGeometry('civil'), material, MAX);
  const legs = new FigureBatch(legGeometry(), material, MAX * 2);
  const arms = new FigureBatch(armGeometry(false), material, MAX * 2);
  for (const batch of [bodies, legs, arms]) { batch.mesh.receiveShadow = true; scene.add(batch.mesh); }

  const zombies: Zombie[] = Array.from({ length: MAX }, (_, index) => ({
    index, kind: 'walker', state: 'off', x: 0, z: 0, yaw: 0, pace: 0, stride: 0, lean: 0.25, tilt: 0,
    health: 0, maxHealth: 1, hitAt: -99, rise: 1, goalX: 0, goalZ: 0, lastSeen: -99, investigateUntil: 0, thinkAt: 0,
    waypoints: [], routeAt: 0, stuck: 0, sniffAt: 0, windup: 0, attackAt: 0, timer: 0, body: null, look: 0,
  }));
  const corpses: { body: RagdollBody; until: number }[] = [];
  const doors = BUILDINGS.map((b) => ({ x: b.door.x, z: b.door.z, curb: b.curb }));

  let running = false;
  let wave = 0, toSpawn = 0, spawnAt = 0, breakUntil = 0, inBreak = true, kills = 0, spawned = 0, groanAt = 0;
  const events = { strikes: [] as ZombieStrike[], waveStarted: 0, waveCleared: 0, risen: [] as Point[] };

  const standing = (z: Zombie) => z.state !== 'off' && z.state !== 'down';
  const alive = () => zombies.reduce((n, z) => n + (z.state !== 'off' ? 1 : 0), 0);
  const groan = (z: Zombie, time: number, chance: number) => {
    if (time < groanAt || random() > chance) return;
    groanAt = time + 2.2;
    say(z, pick(GROANS));
  };

  /** A spot 22–55 m from the player: a doorway (they stumble out) or the sidewalk (they claw out of the ground). */
  function spawnSpot(px: number, pz: number): (Point & { rise: boolean }) | null {
    for (let attempt = 0; attempt < 24; attempt++) {
      if (random() < 0.45) {
        const door = pick(doors);
        const d = Math.hypot(door.x - px, door.z - pz);
        if (d > 20 && d < 60 && world.clear(door.x, door.z, 0.4)) return { x: door.x, z: door.z, rise: false };
      } else {
        const a = random() * Math.PI * 2, r = 22 + random() * 33;
        const road = ROADS.reduce((best, v) => (Math.abs(v - (pz + Math.sin(a) * r)) < Math.abs(best - (pz + Math.sin(a) * r)) ? v : best), ROADS[0]);
        const along = random() < 0.5;
        const x = along ? px + Math.cos(a) * r : ROADS.reduce((best, v) => (Math.abs(v - (px + Math.cos(a) * r)) < Math.abs(best - (px + Math.cos(a) * r)) ? v : best), ROADS[0]) + (random() < 0.5 ? -1 : 1) * SIDEWALK;
        const z = along ? road + (random() < 0.5 ? -1 : 1) * SIDEWALK : pz + Math.sin(a) * r;
        if (Math.abs(x) > BOUND - 3 || Math.abs(z) > BOUND - 3) continue;
        if (Math.hypot(x - px, z - pz) > 18 && world.clear(x, z, 0.45)) return { x, z, rise: true };
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
      windup: 0, attackAt: 0, timer: 0, body: null, look: Math.floor(random() * looks.length),
    });
    if (spot.rise) events.risen.push({ x: spot.x, z: spot.z });
    return true;
  }

  function knock(z: Zombie, vx: number, vy: number, vz: number, time: number) {
    const k = KINDS[z.kind];
    z.state = 'down';
    z.timer = time + 3 + random() * 1.5;
    z.body = ragdolls.spawn({ x: z.x, y: world.ground(z.x, z.z), z: z.z, yaw: z.yaw, scale: RAGDOLL_SCALE * k.scale / 0.84, look: looks[z.look], velocity: { x: vx, y: vy, z: vz } });
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

  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), out = new THREE.Matrix4();
  const quat = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3(), euler = new THREE.Euler();
  const tmp = new THREE.Vector3();
  const limb = (batch: FigureBatch, px: number, py: number, angle: number, look: Float32Array, twist = 0) => {
    local.compose(pos.set(px, py, 0), quat.setFromEuler(euler.set(angle, 0, twist)), size.set(1, 1, 1));
    batch.push(out.multiplyMatrices(base, local), look);
  };

  function draw(z: Zombie, time: number) {
    if (!standing(z)) return;
    const k = KINDS[z.kind];
    const d = dress[z.look];
    const sink = (1 - z.rise) * HEIGHT * k.scale;
    // Hunched forward and tilted to one side; the body lurches with each step.
    const swing = Math.sin(z.stride);
    const stagger = z.state === 'stagger' ? -0.45 : 0;
    euler.set(z.lean + stagger + (z.state === 'rise' ? 0.4 * (1 - z.rise) : 0), z.yaw, z.tilt + swing * 0.07 * Math.min(1, z.pace), 'YXZ');
    base.compose(pos.set(z.x, world.ground(z.x, z.z) - sink, z.z), quat.setFromEuler(euler), size.set(k.scale * k.width, k.scale, k.scale * k.width));
    bodies.push(base, d.body);
    const stride = swing * Math.min(0.7, z.pace * 0.28);
    // A limp: one leg drags behind the other.
    limb(legs, -FIGURE.hipX, FIGURE.hipY, stride * 0.55 + 0.08, d.legs);
    limb(legs, FIGURE.hipX, FIGURE.hipY, -stride, d.legs);
    let left: number, right: number, spread = 0.12;
    if (z.windup) {
      // Wind-up to claw: both arms raised high, then brought down.
      const t = 1 - Math.max(0, z.windup - time) / k.windup;
      left = right = -2.7 + t * 1.6;
      spread = 0.25;
    } else if (z.state === 'rise') {
      left = -2.6 + Math.sin(time * 9) * 0.3;
      right = -2.4 + Math.cos(time * 8) * 0.3;
    } else if (z.kind === 'runner') {
      left = -0.5 + swing * 1.4;
      right = -0.5 - swing * 1.4;
      spread = 0.3;
    } else if (z.kind === 'brute') {
      left = 0.1 + swing * 0.35;
      right = 0.1 - swing * 0.35;
      spread = 0.35;
    } else {
      // The classic reach: arms out in front, swaying.
      left = -1.45 + Math.sin(time * 2.1 + z.index) * 0.14;
      right = -1.35 + Math.cos(time * 1.9 + z.index) * 0.14;
    }
    limb(arms, -FIGURE.shoulderX, FIGURE.shoulderY, left, d.arms, spread);
    limb(arms, FIGURE.shoulderX, FIGURE.shoulderY, right, d.arms, -spread);
  }

  function hide() {
    for (const batch of [bodies, legs, arms]) { batch.begin(); batch.end(); }
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
    /** Applies damage; returns the body when the zombie falls (killed, or knocked over by a big hit). */
    damage(zb: Zombie, amount: number, vx: number, vy: number, vz: number, time: number, force = false) {
      if (!standing(zb) || zb.state === 'rise' && zb.rise < 0.5) return null;
      zb.health -= amount;
      zb.hitAt = time;
      zb.state = zb.state === 'rise' ? 'rise' : 'chase';
      zb.lastSeen = time;
      zb.windup = 0;
      const killed = zb.health <= 0;
      if (killed) {
        const body = knock(zb, vx, vy, vz, time);
        zb.state = 'off';
        zb.body = null;
        corpses.push({ body, until: time + 14 });
        kills++;
        return { body, killed: true };
      }
      if (force && zb.kind !== 'brute') return { body: knock(zb, vx, vy, vz, time), killed: false };
      if (zb.state !== 'rise') {
        zb.state = 'stagger';
        zb.timer = time + (zb.kind === 'brute' ? 0.12 : 0.32);
        zb.x += vx * 0.02;
        zb.z += vz * 0.02;
      }
      return { body: null, killed: false };
    },
    /** Nearest standing zombie crossed by a ray (`dir` normalised), with the hit height above its feet. */
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { zombie: Zombie; t: number; height: number } | null = null;
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
        const feet = world.ground(zb.x, zb.z) - (1 - zb.rise) * HEIGHT * k.scale;
        const y = origin.y + dir.y * t - feet;
        if (y > 0 && y < HEIGHT * k.scale) best = { zombie: zb, t, height: y / k.scale };
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
        const k = KINDS[zb.kind];
        const feet = world.ground(zb.x, zb.z) - (1 - zb.rise) * HEIGHT * k.scale;
        callback(zb.x, zb.z, feet, feet + HEIGHT * k.scale, RADIUS * k.scale * k.width, zb);
      }
    },
    forEachHurt(time: number, callback: (x: number, y: number, z: number, fraction: number) => void) {
      for (const zb of zombies) {
        if (!standing(zb) || time - zb.hitAt > 3) continue;
        callback(zb.x, world.ground(zb.x, zb.z) + HEIGHT * KINDS[zb.kind].scale + 0.3, zb.z, Math.max(0, zb.health) / zb.maxHealth);
      }
    },
    update(dt: number, time: number, prey: Prey) {
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
      bodies.begin(); legs.begin(); arms.begin();
      for (const z of zombies) draw(z, time);
      bodies.end(); legs.end(); arms.end();
      return events;
    },
    dispose() {
      this.stop();
      for (const batch of [bodies, legs, arms]) { scene.remove(batch.mesh); batch.mesh.geometry.dispose(); batch.dispose(); }
      material.dispose();
    },
  };
}
