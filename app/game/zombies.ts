import * as THREE from 'three';
import { BUILDINGS, LAND, ROADS_X, ROADS_Z, SIDEWALK, inRect } from './city';
import type { FallMode, HitKind, RagdollBody, RagdollLook } from './ragdoll';
import type { createRagdolls } from './ragdoll';
import {
  FIGURE, FigureBatch, HAND, HEAD, chestMatrix, figureMaterial, gait, limbMatrix, newGait, setBits, sideX, swingCode,
  type ArmPose, type Detail,
} from './figures';
// ---- zombie co-op (design.md §5, MODE) ----
import { MAX_ZOMBIES, MAX_ZOMBIE_GEN, NO_SLOT, ZF, ZOMBIE_KINDS, ZSTATES, type AttackId, type NetZombie, type ZEvent, type ZState } from '../../lib/zombie-protocol.ts';
import type { SpawnHow } from './zombie-director.ts';
import { BURST_FUSE, KINDS, act, acquired, attackFromFlags, burstAt, cancel, chaseSpeed, interrupts, newPose, pose as kindPose, preyCode, senses, steer, targetOf, zoneDamage, type KindCtx, type PoseIn, type Zone } from './zombie-kinds.ts';
import { DRESS_PER_KIND, bendLimit, eyeWorld, newTwitch, propMatrix, scaleLimb, twitch, zombieDress, zombieGeometry, type ZombieDress } from './zombie-looks.ts';
// ---- end zombie co-op ----

/**
 * Zombie mode's undead: the neighbourhood's residents, turned. They shamble about, notice the player by
 * sight or by noise (gunfire carries far), chase along the sidewalks when a building is in the way, and
 * claw at whoever they reach. They come in waves, crawling out of the ground or stumbling out of doors.
 * Eleven kinds (zombie-kinds.ts: walkers, runners, brutes, crawlers, spitters, bloaters, riot police, shippers,
 * screamers, blind hunters and stalkers), each with its own silhouette (zombie-looks.ts), gait, tells and threat.
 * Head shots count. The wave director (zombie-director.ts, through zombie-coop.ts) decides who spawns where; on an
 * online client the horde is a set of puppets the host's snapshots drive (setAuthority('puppet'), netApply).
 */
export type { ZombieKind } from '../../lib/zombie-protocol.ts';
import type { ZombieKind } from '../../lib/zombie-protocol.ts';
export type { SpawnHow } from './zombie-director.ts';
type ZombieState = ZState;
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
  // ---- zombie co-op (design.md §5, MODE) ----
  /** Generation of this slot: the net id is index | gen << 7 (wrapping at MAX_ZOMBIE_GEN). */
  gen: number;
  /** Height above the ground (on a roof edge, dropping, a lunge) and vertical speed. */
  y: number; vy: number;
  /** The attack being wound up (windup > 0) or in flight (a lunge), and when its windup began. */
  attack: AttackId | null; windStart: number;
  /** Where a lunge, a spit or a grab aims. */
  aimX: number; aimZ: number;
  /** Index of its prey in this frame's prey list (-1: none). */
  prey: number;
  /** ZF bits (attack in progress and its kind, helmet off, shield broken, held by a dog, a glowing tell). */
  flags: number;
  /** Its spawn's scaling (§2.1). */
  speedMul: number; damageMul: number;
  /** Riot shield HP left; the shipper's helmet still on. */
  shield: number; helmet: boolean;
  /** Held by a dog until; a stalker last seen at; a crawler's burst ends at; the kind's own cooldown (spit, scream, lunge). */
  heldUntil: number; seenAt: number; burstAt: number; cool: number;
  /** A sound a blind hunter heard. */
  heardAt: number; heardX: number; heardZ: number;
  /** Bitten by a dog at (it may turn on the dog). */
  bitAt: number;
  /** Stalker freeze pose (0-3); alertness for the twitches (0..1). */
  freeze: number; alert: number;
  /** Puppets: the net's target code, tell progress (0..1), hidden as predicted dead until, last applied (frame). */
  target: number; prog: number; ghostUntil: number; netStamp: number;
  // ---- end zombie co-op ----
};
export type ZombieWorld = {
  clear: (x: number, z: number, radius: number) => boolean;
  sight: (x1: number, z1: number, x2: number, z2: number) => boolean;
  ground: (x: number, z: number) => number;
  route: (fromX: number, fromZ: number, toX: number, toZ: number) => Point[];
  // ---- zombie co-op (design.md §5, MODE): optional, set by zombie-coop.ts ----
  /** A spawn is fair here (§2.4): ≥ 12 m from every player, never in view closer than 18 m (rising excepted). */
  spawnOk?: (x: number, z: number, how: SpawnHow, kind: ZombieKind) => boolean;
  /** Some player sees this point (the stalker moves only when nobody does). */
  seen?: (x: number, z: number, y: number) => boolean;
  /** This client's camera sees it: a stalker puppet holds still on screen (A25). */
  seenLocal?: (x: number, z: number, y: number) => boolean;
  /** An ambush spot near (px, pz): a roof edge to drop from (y > 0) or an alley mouth out of view. */
  ambush?: (px: number, pz: number, how: 'drop' | 'alley') => { x: number; z: number; y: number } | null;
  // ---- end zombie co-op ----
};
/** The player as zombies see them. */
export type Prey = {
  x: number; z: number; down: boolean; inVehicle: boolean; reach: number; night: number;
  // ---- zombie co-op (design.md §5, MODE) ----
  slot?: number; dog?: boolean; vx?: number; vz?: number; quiet?: boolean; firing?: boolean; sprint?: boolean; camYaw?: number;
  /** Not a target now (swimming, just respawned). */
  away?: boolean;
  /** This client's own player or dog. */
  local?: boolean;
  /** A remote victim's round trip (s), for the telegraph's latency allowance. */
  rtt?: number;
  /** Speed on foot (m/s): what a blind hunter hears. */
  speed?: number;
  // ---- end zombie co-op ----
};
export type ZombieStrike = { damage: number; x: number; z: number; heavy: boolean };

const MAX = MAX_ZOMBIES;
/** Hit height in figure units: the top of a hunched head (the figure is 2.08 u tall standing straight). */
const HEIGHT = 2.0;
const GROANS = ['Grừ…', 'Ưưư…', 'Grràoo!', 'Hừ… hừ…', 'Ááá…', 'Khhh…'];
const clamp = THREE.MathUtils.clamp;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Knocked back by a hit: arms thrown out. */
const FLINCH: ArmPose = [-0.45, 0.5, 0, -0.45, 0.2, -0.3, HAND.OPEN];
const KIND_INDEX = Object.fromEntries(ZOMBIE_KINDS.map((k, i) => [k, i])) as Record<ZombieKind, number>;
const STATE_INDEX = Object.fromEntries(ZSTATES.map((s, i) => [s, i])) as Record<ZState, number>;
/** The near batch set draws 'hi' figures within this distance (quality levels 0-1). */
const NEAR = 28;
export type ZombieScaling = { hp: number; speed: number; damage: number };
const NO_SCALING: ZombieScaling = { hp: 1, speed: 1, damage: 1 };
/** Death and knock-over events zombie-coop.ts turns into feed lines and net events (host). */
export type ZombieEvents = {
  strikes: ZombieStrike[]; waveStarted: number; waveCleared: number; risen: Point[];
  /** Telegraphs, hits, projectiles, clouds, screams and spawns this frame (host/solo). */
  ev: ZEvent[];
  /** Extra zombies a scream calls (the caller places them fairly). */
  summons: { kind: ZombieKind; x: number; z: number; count: number; how: SpawnHow }[];
};

export function createZombies(scene: THREE.Scene, ragdolls: ReturnType<typeof createRagdolls>, world: ZombieWorld, say: (zombie: Zombie, text: string) => void = () => {}) {
  let seed = 9001;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];

  // The dresses of every kind (zombie-looks.ts), flat: kind index × DRESS_PER_KIND + dress index. Filled lazily.
  const dress: ZombieDress[] = [];
  const dressAt = (kind: ZombieKind, i: number) => {
    const flat = KIND_INDEX[kind] * DRESS_PER_KIND + (((i % DRESS_PER_KIND) + DRESS_PER_KIND) % DRESS_PER_KIND);
    if (!dress[flat]) dress[flat] = zombieDress(kind, flat % DRESS_PER_KIND);
    return flat;
  };

  // Figure meshes of the zombie variant: a near set ('hi' at quality levels 0-1) for the closest few and a far set ('lo').
  const materials = { body: figureMaterial('body'), arm: figureMaterial('arm'), leg: figureMaterial('leg') };
  type BatchSet = { body: FigureBatch; armL: FigureBatch; armR: FigureBatch; legs: FigureBatch; detail: Detail; all: FigureBatch[] };
  const makeSet = (d: Detail): BatchSet => {
    const body = new FigureBatch(zombieGeometry('body', d), materials.body, MAX);
    const armL = new FigureBatch(zombieGeometry('armL', d), materials.arm, MAX);
    const armR = new FigureBatch(zombieGeometry('armR', d), materials.arm, MAX);
    const legs = new FigureBatch(zombieGeometry('leg', d), materials.leg, MAX * 2);
    const all = [body, armL, armR, legs];
    for (const batch of all) { batch.mesh.receiveShadow = true; scene.add(batch.mesh); }
    return { body, armL, armR, legs, detail: d, all };
  };
  const nearSet = makeSet('hi'), farSet = makeSet('lo');
  const batches = [...nearSet.all, ...farSet.all];
  // Rigid props of the zombies drawn this frame (riot shields, shippers' boxes: zombie-looks.ts propMatrix), for horror-fx.
  const propMatrices = new Float32Array(MAX * 16), propRgb = new Int32Array(MAX), propShape = new Uint8Array(MAX);
  let drawCap = 80, hiCap = 16, frustum: THREE.Frustum | null = null, eyeX = 0, eyeZ = 0, fogFar = Infinity, viewSet = false;

  const zombies: Zombie[] = Array.from({ length: MAX }, (_, index) => ({
    index, kind: 'walker', state: 'off', x: 0, z: 0, yaw: 0, pace: 0, stride: 0, lean: 0.25, tilt: 0,
    health: 0, maxHealth: 1, hitAt: -99, rise: 1, goalX: 0, goalZ: 0, lastSeen: -99, investigateUntil: 0, thinkAt: 0,
    waypoints: [], routeAt: 0, stuck: 0, sniffAt: 0, windup: 0, attackAt: 0, timer: 0, body: null, look: 0, headYaw: 0,
    gen: 0, y: 0, vy: 0, attack: null, windStart: 0, aimX: 0, aimZ: 0, prey: -1, flags: 0, speedMul: 1, damageMul: 1,
    shield: 0, helmet: false, heldUntil: 0, seenAt: -99, burstAt: 0, cool: 0, heardAt: -99, heardX: 0, heardZ: 0, bitAt: -99,
    freeze: 0, alert: 0, target: NO_SLOT, prog: 0, ghostUntil: 0, netStamp: 0,
  }));
  const corpses: { body: RagdollBody; until: number }[] = [];
  const doors = BUILDINGS.map((b) => ({ x: b.door.x, z: b.door.z, curb: b.curb }));

  let running = false;
  let wave = 0, toSpawn = 0, spawnAt = 0, breakUntil = 0, inBreak = true, kills = 0, spawned = 0, groanAt = 0;
  const events: ZombieEvents = { strikes: [], waveStarted: 0, waveCleared: 0, risen: [], ev: [], summons: [] };

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

  /** A spot 22–55 m from the player: a doorway (they stumble out) or the sidewalk (they claw out of the ground). */
  function spawnSpot(px: number, pz: number): (Point & { rise: boolean }) | null {
    for (let attempt = 0; attempt < 24; attempt++) {
      if (random() < 0.45) {
        const door = pick(doors);
        const d = Math.hypot(door.x - px, door.z - pz);
        if (d > 20 && d < 60 && world.clear(door.x, door.z, 0.4)) return { x: door.x, z: door.z, rise: false };
      } else {
        const a = random() * Math.PI * 2, r = 22 + random() * 33;
        const road = ROADS_Z.reduce((best, v) => (Math.abs(v - (pz + Math.sin(a) * r)) < Math.abs(best - (pz + Math.sin(a) * r)) ? v : best), ROADS_Z[0]);
        const along = random() < 0.5;
        const x = along ? px + Math.cos(a) * r : ROADS_X.reduce((best, v) => (Math.abs(v - (px + Math.cos(a) * r)) < Math.abs(best - (px + Math.cos(a) * r)) ? v : best), ROADS_X[0]) + (random() < 0.5 ? -1 : 1) * SIDEWALK;
        const z = along ? road + (random() < 0.5 ? -1 : 1) * SIDEWALK : pz + Math.sin(a) * r;
        if (!inRect(LAND, x, z, 3)) continue;
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

  // ---- zombie co-op (design.md §5, MODE): authority, the director's spawns, the net, per-kind behaviour ----
  let authority: 'sim' | 'puppet' = 'sim';
  /** A director (zombie-coop.ts) decides the waves: the built-in ones stay off. */
  let managed = false;
  let players = 1, scaling: ZombieScaling = NO_SCALING, night = 0;
  let nowT = 0, stamp = 1, inUpdate = false, frameDt = 0, frameNo = 0;
  let lastPrey: readonly Prey[] = [];
  /** Events raised between updates (a spawn by the director, a bloater shot dead) wait here for the next update. */
  const outbox: ZEvent[] = [];
  const emit = (e: ZEvent) => (inUpdate ? events.ev : outbox).push(e);
  const netId = (z: Zombie) => z.index | (z.gen << 7);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const predicted = new Float32Array(MAX), lastHp = new Float32Array(MAX).fill(-1);
  const specimen = new Uint8Array(MAX);
  // Stop-motion: a frozen pose clock per zombie, and the stride skip owed when the freeze ends.
  const poseClock = new Float64Array(MAX), frozeAt = new Uint8Array(MAX);
  const tw = newTwitch();
  const groanKind = (z: Zombie, time: number, chance: number) => {
    if (z.kind === 'walker') { groan(z, time, chance); return; }
    if (time < groanAt || random() > chance) return;
    groanAt = time + 2.2;
    say(z, pick(KINDS[z.kind].groans));
  };
  // A coarse hash grid of the standing horde for keeping apart (rebuilt each update): 128 zombies, no O(n²).
  const GRID = 1024, gridHead = new Int16Array(GRID), gridNext = new Int16Array(MAX);
  const cellOf = (x: number, z: number) => ((Math.floor(x) * 73856093) ^ (Math.floor(z) * 19349663)) & (GRID - 1);
  function rebuildGrid() {
    gridHead.fill(-1);
    for (const o of zombies) {
      if (!standing(o)) continue;
      const h = cellOf(o.x, o.z);
      gridNext[o.index] = gridHead[h];
      gridHead[h] = o.index;
    }
  }
  const kctx: KindCtx = {
    time: 0, dt: 0, players: 1, prey: [],
    random,
    sight: (x1, z1, x2, z2) => world.sight(x1, z1, x2, z2),
    clear: (x, z, r) => world.clear(x, z, r),
    seen: (z) => !!world.seen?.(z.x, z.z, world.ground(z.x, z.z) + 2.4),
    netId,
    emit,
    summon: (kind, x, z, count, how) => { if (count > 0) events.summons.push({ kind, x, z, count, how }); },
    hear: (x, z, r) => hearAt(x, z, r, 1, kctx.time),
    say: (z, text) => say(z, text),
    expire: (z) => expire(z),
  };
  /**
   * Bloaters shot dead: each bursts BURST_FUSE after its death where it fell, announced at once with a `tele` (the ring
   * marker and the hiss on every client), so a teammate's kill next to you is never damage without a tell.
   */
  const fuses: { at: number; w: number; x: number; z: number; mul: number }[] = [];
  function fuse(z: Zombie, time: number) {
    const s = KINDS.bloater.special!;
    emit({ k: 'tele', w: netId(z), a: 'burst', x: r2(z.x), z: r2(z.z), yaw: 0, r: s.r, arc: 6.283, t: BURST_FUSE });
    // Outside an update the tell waits in the outbox for the next one: the fuse starts when it goes out.
    fuses.push({ at: inUpdate ? time + BURST_FUSE : -1, w: netId(z), x: z.x, z: z.z, mul: z.damageMul });
  }
  /** Dies without a killer (the bloater's own burst): gone, the wave counts it, nobody scores. */
  function expire(z: Zombie) {
    emit({ k: 'kill', w: netId(z), kind: z.kind, by: NO_SLOT, wp: 0, dx: 0, dz: 0, f: 0 });
    if (z.body) ragdolls.remove(z.body);
    z.body = null;
    z.state = 'off';
    cancel(z);
  }

  /** Puts a fresh zombie of `kind` in slot z at (x, zz) entering `how`, scaled by `sc` (§2.1). */
  function place(z: Zombie, kind: ZombieKind, x: number, zz: number, how: SpawnHow, sc: ZombieScaling, time: number, y = 0, toward?: Point) {
    const k = KINDS[kind];
    if (z.body) ragdolls.remove(z.body);
    const look = dressAt(kind, Math.floor(random() * DRESS_PER_KIND));
    const L = dress[look].limbs;
    const hp = Math.max(1, k.hp * sc.hp);
    const goal = toward ?? { x, z: zz };
    Object.assign(z, {
      kind, state: how === 'drop' ? 'drop' : how === 'door' || how === 'alley' ? 'wander' : 'rise',
      x, z: zz, yaw: Math.atan2(goal.x - x, goal.z - zz) || random() * Math.PI * 2, pace: 0, stride: random() * 6,
      lean: kind === 'crawler' ? 1.35 : L.lean * (0.9 + random() * 0.2), tilt: L.tilt + (random() - 0.5) * 0.12,
      health: hp, maxHealth: hp, hitAt: -99,
      rise: how === 'rise' ? 0 : how === 'burst' ? 0.5 : how === 'brood' ? 0.55 : 1,
      goalX: goal.x, goalZ: goal.z, lastSeen: -99, investigateUntil: time + 30, thinkAt: time + random() * 0.3, waypoints: [], routeAt: 0, stuck: 0,
      sniffAt: time + 6 + random() * 8, windup: 0, attackAt: time + 0.4, timer: how === 'drop' ? time + 0.6 : 0, body: null, look, headYaw: 0,
      gen: (z.gen + 1) % MAX_ZOMBIE_GEN, y: how === 'drop' ? y : 0, vy: 0, attack: null, windStart: 0, aimX: x, aimZ: zz, prey: -1, flags: 0,
      speedMul: sc.speed, damageMul: sc.damage, shield: kind === 'riot' ? 150 : 0, helmet: kind === 'shipper',
      heldUntil: 0, seenAt: -99, burstAt: 0, cool: time + 1.5 + random() * 2, heardAt: -99, heardX: x, heardZ: zz, bitAt: -99,
      freeze: 0, alert: 0, target: NO_SLOT, prog: 0, ghostUntil: 0, netStamp: stamp,
    } satisfies Partial<Zombie>);
    specimen[z.index] = 0;
    predicted[z.index] = 0;
    lastHp[z.index] = -1;
    if (how === 'rise') events.risen.push({ x, z: zz });
    emit({ k: 'spawn', w: netId(z), how, x: r2(x), z: r2(zz) });
    return z;
  }
  const freeSlot = () => zombies.find((c) => c.state === 'off' && !c.ghostUntil && !c.body) ?? zombies.find((c) => c.state === 'off');
  /** A zombie at exactly (x, z) (a scream's call, a brood, a burst from rubble), if there is room. */
  function spawnHere(kind: ZombieKind, x: number, z: number, how: SpawnHow, sc: ZombieScaling, time: number, y = 0, toward?: Point) {
    const slot = freeSlot();
    if (!slot || !world.clear(x, z, 0.35)) return null;
    return place(slot, kind, x, z, how, sc, time, y, toward);
  }
  /**
   * A zombie near (px, pz), fairly placed: rising and door spawns use the street spot finder (spawnSpot, 22-55 m),
   * roof drops and alley bursts the world's ambush spots; `world.spawnOk` vetoes spots too close or in view.
   */
  function spawnNear(kind: ZombieKind, px: number, pz: number, how: SpawnHow, sc: ZombieScaling, time: number) {
    const slot = freeSlot();
    if (!slot) return null;
    for (let attempt = 0; attempt < 6; attempt++) {
      let x = 0, z = 0, y = 0, h: SpawnHow = how;
      const ambush = how === 'drop' || how === 'alley' ? world.ambush?.(px, pz, how) ?? null : null;
      if (ambush) { x = ambush.x; z = ambush.z; y = ambush.y; if (how === 'drop' && y < 3) h = 'alley'; }
      else {
        const s = spawnSpot(px, pz);
        if (!s) continue;
        x = s.x; z = s.z;
        h = how === 'alley' ? 'alley' : s.rise ? 'rise' : 'door';
      }
      if (world.spawnOk && !world.spawnOk(x, z, h, kind)) continue;
      return place(slot, kind, x, z, h, sc, time, y, { x: px, z: pz });
    }
    return null;
  }
  // ---- end zombie co-op ----

  function spawn(px: number, pz: number, time: number, night: number) {
    const kind = kindFor(time, night);
    return !!spawnNear(kind, px, pz, 'rise', { hp: 1 + wave * 0.05, speed: 1, damage: 1 }, time);
  }

  /** What a zombie's body wears (its dress's look, for its ragdoll). */
  const bodyLook = (z: Zombie): RagdollLook => dress[z.look].look;
  function knock(z: Zombie, vx: number, vy: number, vz: number, time: number, hit?: { x: number; y: number; z: number } | null, mode?: FallMode, kind?: HitKind) {
    const d = dress[z.look], L = d.limbs;
    z.state = 'down';
    z.timer = time + 3 + random() * 1.5;
    cancel(z);
    z.y = 0;
    // The ragdoll has the standing zombie's scale and build (a brute stays broad), drawn as a zombie; the blow lands where it hit.
    z.body = ragdolls.spawn({
      x: z.x, y: world.ground(z.x, z.z), z: z.z, yaw: z.yaw, scale: L.scale, look: bodyLook(z), velocity: { x: vx, y: vy, z: vz },
      build: { width: d.style.width * L.width, height: d.style.height }, hit, mode, kind, variant: 'zombie',
    });
    return z.body;
  }

  /** Moves toward (tx, tz), sliding along walls and keeping a little apart from the rest of the horde. */
  function walk(z: Zombie, tx: number, tz: number, speed: number, dt: number) {
    let dx = tx - z.x, dz = tz - z.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05 || speed <= 0) { z.pace = 0; return; }
    dx /= d; dz /= d;
    const fx = Math.floor(z.x), fz = Math.floor(z.z);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (let n = gridHead[(((fx + i) * 73856093) ^ ((fz + j) * 19349663)) & (GRID - 1)]; n >= 0; n = gridNext[n]) {
        const o = zombies[n];
        if (o === z || !standing(o)) continue;
        const ox = z.x - o.x, oz = z.z - o.z, od = ox * ox + oz * oz;
        if (od < 0.64 && od > 1e-4) { const s = (0.8 - Math.sqrt(od)) * 1.5; dx += (ox / Math.sqrt(od)) * s; dz += (oz / Math.sqrt(od)) * s; }
      }
    }
    const n = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, speed * dt);
    const nx = z.x + (dx / n) * step, nz = z.z + (dz / n) * step;
    if (world.clear(nx, nz, 0.32)) { z.x = nx; z.z = nz; z.stuck = Math.max(0, z.stuck - dt); }
    else if (world.clear(nx, z.z, 0.32)) { z.x = nx; z.stuck += dt * 0.5; }
    else if (world.clear(z.x, nz, 0.32)) { z.z = nz; z.stuck += dt * 0.5; }
    else z.stuck += dt;
    const turn = Math.atan2(dx, dz);
    z.yaw += Math.atan2(Math.sin(turn - z.yaw), Math.cos(turn - z.yaw)) * Math.min(1, dt * KINDS[z.kind].turn);
    z.pace = speed;
    z.stride += dt * speed * KINDS[z.kind].cadence;
  }

  /** Picks its prey (the nearest it senses; dogs count double the distance unless one just bit it) and its route. */
  function think(z: Zombie, prey: readonly Prey[], time: number) {
    z.thinkAt = time + (z.kind === 'stalker' ? 0.12 : 0.22 + random() * 0.18);
    z.alert = Math.max(0, z.alert - 0.15);
    let best = -1, bestScore = Infinity;
    const bitten = time - z.bitAt < 3 && (z.index & 1) === 0;
    for (let i = 0; i < prey.length; i++) {
      const p = prey[i];
      if (p.down || p.away) continue;
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (!senses(z, p, d, p.night, () => world.sight(z.x, z.z, p.x, p.z))) continue;
      const s = d * (p.dog ? (bitten ? 0.5 : 2) : 1) * (i === z.prey ? 0.77 : 1);
      if (s < bestScore) { bestScore = s; best = i; }
    }
    const current = z.prey >= 0 && z.prey < prey.length ? prey[z.prey] : null;
    if (best >= 0) {
      const p = prey[best];
      if (z.state !== 'chase' && z.state !== 'frozen') { acquired(z, kctx); groanKind(z, time, 0.35); }
      if (z.state !== 'frozen') z.state = 'chase';
      z.prey = best;
      z.goalX = p.x;
      z.goalZ = p.z;
      z.lastSeen = time;
    } else if (z.state === 'chase' && (time - z.lastSeen > 5 || !current || current.down || current.away)) {
      z.state = 'wander';
      z.prey = -1;
      z.investigateUntil = time + 8;
    }
    // The horde smells the living: every so often a lost zombie heads back toward the nearest of them.
    if (z.state !== 'chase' && time > z.sniffAt) {
      z.sniffAt = time + 7 + random() * 6;
      let near: Prey | null = null, nd = Infinity;
      for (const p of prey) { if (p.down || p.away || p.dog) continue; const d = Math.hypot(p.x - z.x, p.z - z.z); if (d < nd) { nd = d; near = p; } }
      if (near) {
        z.goalX = near.x + (random() - 0.5) * 16;
        z.goalZ = near.z + (random() - 0.5) * 16;
        z.investigateUntil = time + 16;
        z.routeAt = 0;
      }
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

  function step(z: Zombie, dt: number, time: number, prey: readonly Prey[]) {
    if (specimen[z.index]) { z.pace = 0; return; }
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
      if (z.rise >= 1) { z.state = 'chase'; z.lastSeen = time; groanKind(z, time, 0.5); }
      return;
    }
    if (z.state === 'drop') {
      // On a roof edge for the 0.6 s tell (dust, a scrape), then the fall and a thud.
      z.pace = 0;
      if (time < z.timer) return;
      z.vy -= 14 * dt;
      z.y = Math.max(0, z.y + z.vy * dt);
      if (z.y <= 0) { z.y = 0; z.vy = 0; z.state = 'rise'; z.rise = 0.7; }
      return;
    }
    if (z.state === 'stagger') {
      if (time >= z.timer) z.state = 'chase';
      z.pace = 0;
      return;
    }
    if (z.heldUntil > time) { z.pace = 0; z.flags |= ZF.HELD; return; }
    z.flags &= ~ZF.HELD;
    if (time >= z.thinkAt) think(z, prey, time);
    if (act(z, kctx)) return;
    // Stop-motion: the whole zombie holds for a moment (then its stride skips ahead, see draw).
    if (z.kind !== 'stalker' && twitch(z.index * 7919 + z.gen, time, z.kind, z.alert, tw).freeze) { z.pace = 0; return; }
    const hunting = z.state === 'chase' || time < z.investigateUntil;
    let tx = z.goalX, tz = z.goalZ;
    while (z.waypoints.length && Math.hypot(z.waypoints[0].x - z.x, z.waypoints[0].z - z.z) < 1) z.waypoints.shift();
    if (z.waypoints.length) { tx = z.waypoints[0].x; tz = z.waypoints[0].z; }
    const p = targetOf(z, kctx);
    if (z.state === 'chase' && !z.waypoints.length && p) { tx = p.x; tz = p.z; }
    const chase = chaseSpeed(z.kind, z.speedMul, night, z.health < z.maxHealth * 0.35);
    const move = steer(z, kctx, tx, tz, hunting, chase);
    walk(z, move.x, move.z, move.speed, dt);
  }

  const base = new THREE.Matrix4(), hips = new THREE.Matrix4(), chest = new THREE.Matrix4(), limbM = new THREE.Matrix4(), armLM = new THREE.Matrix4(), propM = new THREE.Matrix4();
  const quat = new THREE.Quaternion(), turn = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3(), euler = new THREE.Euler();
  const pivot = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), sphere = new THREE.Sphere(), eyeV = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const walkCycle = newGait();
  const bodyPose = [0, 0, 0, 0], limbPose = [0, 0, 0, 0], armLPose = [0, 0, 0, 0];
  const face = new Float32Array(8);
  const P = newPose();
  const pin: PoseIn = { time: 0, g: walkCycle, go: 0, chasing: false, toward: 0, prog: 0, lean: 0, tw };
  /** Eye positions of the zombies drawn this frame (forEachEye), and which frame they belong to. */
  const eyes = new Float32Array(MAX * 6), eyeFrame = new Int32Array(MAX);
  let propCount = 0;
  // An arm from the chest matrix, scaled to its kind's [length, thickness], its elbow kept within the bend limit (A13).
  const arm = (set: BatchSet, side: 1 | -1, a: number[], look: Float32Array, shoulderX: number, drop: number, ls: readonly [number, number], keep?: THREE.Matrix4, keepPose?: number[]) => {
    const sx = sideX(side);
    limbMatrix(chest, sx * shoulderX, FIGURE.shoulderY + drop, a[0], sx * a[1], sx * a[2], limbM);
    scaleLimb(limbM, ls);
    limbPose[0] = Math.max(a[3], -bendLimit(ls)); limbPose[1] = a[4]; limbPose[2] = a[5]; limbPose[3] = a[6];
    (side > 0 ? set.armR : set.armL).push(limbM, look, limbPose);
    if (keep) keep.copy(limbM);
    if (keepPose) { keepPose[0] = limbPose[0]; keepPose[1] = limbPose[1]; keepPose[2] = limbPose[2]; keepPose[3] = limbPose[3]; }
  };
  const leg = (set: BatchSet, side: 1 | -1, l: number[], look: Float32Array, ls: readonly [number, number]) => {
    limbMatrix(hips, sideX(side) * FIGURE.hipX, FIGURE.hipY, l[0], sideX(side) * l[4], 0, limbM);
    scaleLimb(limbM, ls);
    limbPose[0] = Math.min(l[1], bendLimit(ls)); limbPose[1] = l[2]; limbPose[2] = l[3]; limbPose[3] = 0;
    set.legs.push(limbM, look, limbPose);
  };
  /** The prey a puppet hunts (from the net's target code), for where its head turns. */
  const preyOfCode = (code: number) => {
    if ((code & 15) === NO_SLOT) return null;
    for (const p of lastPrey) if ((p.slot ?? 0) === (code & 15) && !!p.dog === !!(code & 16)) return p;
    return null;
  };

  function draw(z: Zombie, set: BatchSet, time: number, prey: readonly Prey[]) {
    const d = dress[z.look], L = d.limbs, p = d.palettes;
    const k = KINDS[z.kind];
    const i = z.index;
    // Stop-motion: the pose clock holds while frozen; the stride jumps ahead when it lets go.
    twitch(i * 7919 + z.gen, time, z.kind, z.alert, tw);
    const frozen = tw.freeze && !z.attack && z.state !== 'frozen' && z.state !== 'lunge';
    if (frozen) frozeAt[i] = 1;
    else { if (frozeAt[i]) { z.stride += tw.skip || 0.8; frozeAt[i] = 0; } poseClock[i] = time; }
    const t = poseClock[i] || time;
    const target = authority === 'puppet' ? preyOfCode(z.target) : z.prey >= 0 && z.prey < prey.length ? prey[z.prey] : null;
    const chasing = (z.state === 'chase' || z.state === 'frozen') && !!target && !target.down;
    const go = clamp(z.pace / (k.run > 0.5 ? 2.5 : 1.2), 0, 1) * (k.run > 0.5 || z.kind === 'brute' ? 1 : 0.8);
    const g = gait(z.stride, Math.min(1, k.run), go, walkCycle);
    pin.time = t; pin.go = go; pin.chasing = chasing; pin.lean = pitchOf(z);
    const twist0 = k.run > 0.5 ? g.chest : g.chest * 0.5;
    pin.toward = chasing ? clamp(wrap(Math.atan2(target!.x - z.x, target!.z - z.z) - z.yaw) - twist0, -1.2, 1.2) : 0;
    pin.prog = z.attack ? (z.windup > z.windStart ? (time - z.windStart) / (z.windup - z.windStart) : z.prog) : 0;
    if (z.state === 'lunge') pin.prog = z.prog;
    kindPose(z, pin, P);
    if (z.state === 'rise' || z.state === 'drop') {
      // Clawing up out of the ground (or hanging over a roof edge), one arm after the other.
      P.armL[0] = -2.6 + Math.sin(t * 9) * 0.3; P.armL[1] = 0.2; P.armL[3] = -0.3 - 0.3 * Math.max(0, Math.sin(t * 9)); P.armL[6] = HAND.CLAW;
      P.armR[0] = -2.4 + Math.cos(t * 8) * 0.3; P.armR[1] = 0.2; P.armR[3] = -0.3 - 0.3 * Math.max(0, Math.cos(t * 8)); P.armR[6] = HAND.CLAW;
      if (z.kind !== 'crawler') P.sink = 0;
    } else if (z.state === 'stagger') {
      for (let n = 0; n < 7; n++) { P.armL[n] = FLINCH[n]; P.armR[n] = FLINCH[n]; }
    }
    const swell = P.swell;
    const sx = L.scale * L.width * d.style.width * swell, sy = L.scale * d.style.height * (z.kind === 'bloater' ? swell : 1), sh = d.style.shoulderX;
    const sink = (1 - z.rise) * HEIGHT * sy + P.sink * sy;
    const feet = world.ground(z.x, z.z) + z.y - sink + g.bob * sy, hip = FIGURE.hipY * sy;
    hips.compose(pos.set(z.x, feet, z.z), turn.setFromAxisAngle(up, z.yaw), size.set(sx, sy, sx));
    euler.set(P.pitch, z.yaw, P.tilt, 'YXZ');
    quat.setFromEuler(euler);
    pivot.set(0, hip, 0).applyQuaternion(quat);
    base.compose(pos.set(z.x, feet + hip, z.z).sub(pivot), quat, size);
    z.headYaw = THREE.MathUtils.damp(z.headYaw, P.headYaw, z.kind === 'stalker' ? 2 : 6, frameDt);
    bodyPose[0] = z.headYaw;
    bodyPose[1] = P.headPitch;
    bodyPose[2] = P.twist;
    const flare = Math.abs(P.legL[0]) * 0.6 + 0.1 * go;
    bodyPose[3] = swingCode(flare, P.hair, flare);
    face.set(p.body);
    setBits(face, 0, HEAD.MOUTH, P.mouth || d.gape || z.state === 'rise');
    set.body.push(base, face, bodyPose);
    chestMatrix(base, P.twist, chest);
    leg(set, -1, P.legL, p.legs, L.legL);
    leg(set, 1, P.legR, p.legs, L.legR);
    arm(set, -1, P.armL, p.armL, sh, L.shoulder[0], L.armL, armLM, armLPose);
    arm(set, 1, P.armR, p.armR, sh, L.shoulder[1], L.armR);
    eyeWorld(base, bodyPose, 0, eyeV); eyes[i * 6] = eyeV.x; eyes[i * 6 + 1] = eyeV.y; eyes[i * 6 + 2] = eyeV.z;
    eyeWorld(base, bodyPose, 1, eyeV); eyes[i * 6 + 3] = eyeV.x; eyes[i * 6 + 4] = eyeV.y; eyes[i * 6 + 5] = eyeV.z;
    eyeFrame[i] = frameNo;
    if (d.prop && !(d.prop === 'shield' && z.flags & ZF.BROKEN) && propCount < MAX && propMatrix(d, chest, armLM, armLPose, propM)) {
      propM.toArray(propMatrices, propCount * 16);
      propRgb[propCount] = d.propColor;
      propShape[propCount] = d.prop === 'box' ? 0 : 1;
      propCount++;
    }
  }

  /** Draws the nearest standing zombies in view (at most drawCap; the closest few 'hi' at quality levels 0-1). */
  const order: number[] = [];
  const dist2 = new Float32Array(MAX);
  function render(time: number, prey: readonly Prey[]) {
    frameNo++;
    order.length = 0;
    const cull = viewSet ? (fogFar + 5) ** 2 : Infinity;
    for (const z of zombies) {
      if (!standing(z)) continue;
      const d2 = (z.x - eyeX) ** 2 + (z.z - eyeZ) ** 2;
      if (d2 > cull) continue;
      const L = dress[z.look]?.limbs;
      if (frustum && L && !frustum.intersectsSphere(sphere.set(pos.set(z.x, world.ground(z.x, z.z) + z.y + 1.1 * L.scale, z.z), 1.6 * L.scale))) continue;
      dist2[z.index] = d2;
      order.push(z.index);
    }
    order.sort((a, b) => dist2[a] - dist2[b]);
    for (const batch of batches) batch.begin();
    propCount = 0;
    const lo = nearSet.detail === 'lo';
    for (let n = 0; n < order.length && n < drawCap; n++) {
      const z = zombies[order[n]];
      draw(z, lo || (n < hiCap && dist2[z.index] < NEAR * NEAR) ? nearSet : farSet, time, prey);
    }
    for (const batch of batches) batch.end();
  }

  function hide() {
    for (const batch of batches) { batch.begin(); batch.end(); }
    propCount = 0;
  }
  hide();

  /** The wire state of a simulated zombie (§1.3 ZSTATES). */
  const wireState = (z: Zombie): ZState => {
    if (z.windup && (z.state === 'chase' || z.state === 'wander')) return z.attack === 'scream' ? 'scream' : z.attack === 'burst' ? 'burst' : 'windup';
    if (z.heldUntil > nowT && z.state !== 'down' && z.state !== 'off') return 'held';
    return z.state;
  };
  /** Progress 0..7 for the wire: a windup, a rise, a lunge in the air, or the stalker's freeze pose. */
  const progOf = (z: Zombie) => {
    if (z.windup) return Math.round(clamp((nowT - z.windStart) / Math.max(1e-3, z.windup - z.windStart), 0, 1) * 7);
    if (z.state === 'rise') return Math.round(clamp(z.rise, 0, 1) * 7);
    if (z.state === 'lunge') return Math.round(clamp((nowT - z.windStart) / Math.max(1e-3, z.timer - z.windStart), 0, 1) * 7);
    if (z.state === 'frozen') return z.freeze & 3;
    return 0;
  };
  /** Puppets between snapshots: strides from their pace, knocked-over ones as local ragdolls, the gone ones removed. */
  function updatePuppets(dt: number, time: number) {
    for (const z of zombies) {
      if (z.state === 'off') continue;
      if (z.netStamp !== stamp) {
        // No longer in the host's horde.
        if (z.body) ragdolls.remove(z.body);
        z.body = null;
        z.state = 'off';
        continue;
      }
      z.stride += dt * z.pace * KINDS[z.kind].cadence;
      if (z.state === 'down' && !z.body) {
        z.body = ragdolls.spawn({
          x: z.x, y: world.ground(z.x, z.z), z: z.z, yaw: z.yaw, scale: dress[z.look].limbs.scale, look: dress[z.look].look,
          velocity: { x: -Math.sin(z.yaw) * 3, y: 1.5, z: -Math.cos(z.yaw) * 3 }, build: { width: dress[z.look].style.width * dress[z.look].limbs.width, height: dress[z.look].style.height }, variant: 'zombie',
        });
      } else if (z.state !== 'down' && z.body) { ragdolls.remove(z.body); z.body = null; }
      if (z.attack && time >= z.windup && z.windup > 0 && z.state !== 'lunge') { z.attack = null; z.windup = 0; }
    }
    stamp++;
  }

  /** A sound at (x, z): hunters within radius × loudness remember it; other wanderers come to look. */
  function hearAt(x: number, z: number, radius: number, loud: number, time: number) {
    const r = radius * Math.max(0.2, loud);
    for (const zb of zombies) {
      if (!standing(zb) || specimen[zb.index]) continue;
      if ((zb.x - x) ** 2 + (zb.z - z) ** 2 > r * r) continue;
      if (zb.kind === 'hunter') { zb.heardAt = time; zb.heardX = x; zb.heardZ = z; zb.alert = 1; }
      if (zb.state === 'chase') continue;
      zb.goalX = x + (random() - 0.5) * 6;
      zb.goalZ = z + (random() - 0.5) * 6;
      zb.investigateUntil = time + 25;
      zb.routeAt = 0;
      zb.thinkAt = time;
    }
  }

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
      managed = false;
      wave = 0; toSpawn = 0; kills = 0; spawned = 0;
      inBreak = true;
      breakUntil = time + 6;
    },
    stop() {
      running = false;
      for (const z of zombies) { if (z.body) ragdolls.remove(z.body); z.body = null; z.state = 'off'; z.ghostUntil = 0; cancel(z); specimen[z.index] = 0; }
      for (const c of corpses) ragdolls.remove(c.body);
      corpses.length = 0;
      outbox.length = 0;
      fuses.length = 0;
      hide();
    },
    /** Gunfire, explosions and crashes: zombies within `radius` come to look. */
    hear(x: number, z: number, radius: number, time: number) { hearAt(x, z, radius, 1, time); },
    /**
     * Applies damage; returns the body when the zombie falls (killed: limp, or knocked over by a big hit).
     * `at` is the world point that was hit and `kind` what hit it, if known. With a `zone`, `amount` is the base
     * damage and the kind's zone and armour rules apply (zombie-kinds.ts zoneDamage); `from` is the attacker.
     */
    damage(zb: Zombie, amount: number, vx: number, vy: number, vz: number, time: number, force = false, at?: { x: number; y: number; z: number } | null, kind?: HitKind, zone?: Zone, from?: { x: number; z: number } | null) {
      if (!standing(zb) || zb.state === 'rise' && zb.rise < 0.5) return null;
      const dealt = zone ? zoneDamage(zb, amount, zone, kind ?? 'bullet', from) : amount;
      zb.health -= dealt;
      zb.hitAt = time;
      zb.alert = 1;
      const head = zone === 'head';
      if (zb.state !== 'rise' && zb.state !== 'drop' && zb.state !== 'frozen' && zb.state !== 'lunge') zb.state = 'chase';
      zb.lastSeen = time;
      if (from) { zb.goalX = from.x; zb.goalZ = from.z; zb.investigateUntil = time + 12; }
      if (interrupts(zb, dealt, head)) {
        const scream = zb.attack === 'scream';
        cancel(zb);
        if (scream) { zb.cool = time + 6; zb.state = 'stagger'; zb.timer = time + 0.6; }
      }
      const killed = zb.health <= 0;
      if (killed) {
        if (zb.kind === 'bloater') fuse(zb, time);
        const body = knock(zb, vx, vy, vz, time, at, 'limp', kind);
        zb.state = 'off';
        zb.body = null;
        corpses.push({ body, until: time + 14 });
        kills++;
        return { body, killed: true, dealt };
      }
      const big = KINDS[zb.kind].big;
      if (force && !big && zb.state !== 'drop') return { body: knock(zb, vx, vy, vz, time, at, undefined, kind), killed: false, dealt };
      if (zb.kind === 'stalker') {
        // Only a head shot staggers the stalker (1 s).
        if (head && zb.state !== 'drop') { zb.state = 'stagger'; zb.timer = time + 1; }
      } else if (zb.state !== 'rise' && zb.state !== 'drop' && zb.state !== 'lunge') {
        zb.state = 'stagger';
        zb.timer = time + (big ? 0.12 : 0.32);
        zb.x += vx * 0.02;
        zb.z += vz * 0.02;
      }
      return { body: null, killed: false, dealt };
    },
    /**
     * Nearest standing zombie crossed by a ray (`dir` normalised): `height` is the hit height above its feet in
     * figure units (compare with FIGURE.neckY), `head` is true above the neck of the hunched figure. A crawler is a
     * low capsule ahead of its pivot (A14): its head is the front end.
     */
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { zombie: Zombie; t: number; height: number; head: boolean } | null = null;
      for (const zb of zombies) {
        if (!standing(zb)) continue;
        const k = KINDS[zb.kind], L = dress[zb.look].limbs;
        const crawler = zb.kind === 'crawler';
        const cx = zb.x + (crawler ? Math.sin(zb.yaw) * 0.35 : 0), cz = zb.z + (crawler ? Math.cos(zb.yaw) * 0.35 : 0);
        const r = crawler ? 0.55 * L.scale : k.radius * L.scale * Math.max(0.8, L.width);
        const rx = origin.x - cx, rz = origin.z - cz;
        const a = dir.x * dir.x + dir.z * dir.z;
        if (a < 1e-6) continue;
        const b = 2 * (rx * dir.x + rz * dir.z), c = rx * rx + rz * rz - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        let t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0) t = (-b + Math.sqrt(disc)) / (2 * a);
        if (t <= 0 || t >= maxT || (best && t >= best.t)) continue;
        const sy = scaleY(zb);
        const feet = world.ground(zb.x, zb.z) + zb.y - (1 - zb.rise) * HEIGHT * sy;
        const y = origin.y + dir.y * t - feet;
        if (crawler) {
          if (y <= 0 || y >= 0.75) continue;
          const hx = origin.x + dir.x * t - zb.x, hz = origin.z + dir.z * t - zb.z, ahead = hx * Math.sin(zb.yaw) + hz * Math.cos(zb.yaw);
          best = { zombie: zb, t, height: y / sy, head: ahead > 0.55 && y > 0.25 };
          continue;
        }
        // The neck of a figure bent at the hips sits lower than a standing one's.
        const neck = (FIGURE.hipY + (FIGURE.neckY - FIGURE.hipY) * Math.cos(pitchOf(zb))) * sy;
        if (y > 0 && y < HEIGHT * sy * (zb.kind === 'stalker' ? 1.12 : 1)) best = { zombie: zb, t, height: y / sy, head: y > neck };
      }
      return best;
    },
    near(x: number, z: number, radius: number, callback: (zombie: Zombie) => void) {
      for (const zb of zombies) if (standing(zb) && (zb.x - x) ** 2 + (zb.z - z) ** 2 < radius * radius) callback(zb);
    },
    /** Upright capsules for aiming: centre, feet, top and radius (a crawler's low capsule sits ahead of it). */
    forEachStanding(callback: (x: number, z: number, y0: number, y1: number, radius: number, zombie: Zombie) => void) {
      for (const zb of zombies) {
        if (!standing(zb)) continue;
        const k = KINDS[zb.kind], sy = scaleY(zb), L = dress[zb.look].limbs;
        const feet = world.ground(zb.x, zb.z) + zb.y - (1 - zb.rise) * HEIGHT * sy;
        if (zb.kind === 'crawler') callback(zb.x + Math.sin(zb.yaw) * 0.35, zb.z + Math.cos(zb.yaw) * 0.35, feet, feet + 0.75, 0.55 * L.scale, zb);
        else callback(zb.x, zb.z, feet, feet + HEIGHT * sy, k.radius * L.scale * Math.max(0.8, L.width), zb);
      }
    },
    forEachHurt(time: number, callback: (x: number, y: number, z: number, fraction: number) => void) {
      for (const zb of zombies) {
        if (!standing(zb) || time - zb.hitAt > 3) continue;
        callback(zb.x, world.ground(zb.x, zb.z) + zb.y + (zb.kind === 'crawler' ? 1.0 : HEIGHT * scaleY(zb) + 0.3), zb.z, Math.max(0, zb.health) / zb.maxHealth);
      }
    },
    update(dt: number, time: number, prey: Prey | readonly Prey[], drawNow = true) {
      const list: readonly Prey[] = Array.isArray(prey) ? prey : [prey as Prey];
      frameDt = dt;
      nowT = time;
      lastPrey = list;
      night = list[0]?.night ?? 0;
      events.strikes.length = 0;
      events.risen.length = 0;
      events.waveStarted = 0;
      events.waveCleared = 0;
      events.summons.length = 0;
      events.ev.length = 0;
      for (const e of outbox) events.ev.push(e);
      outbox.length = 0;
      if (!running) return events;
      if (authority === 'puppet') {
        updatePuppets(dt, time);
      } else {
        inUpdate = true;
        kctx.time = time; kctx.dt = dt; kctx.prey = list; kctx.players = players;
        const solo = list[0];
        if (!managed && solo) {
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
            if (!spawn(solo.x, solo.z, time, solo.night)) { spawnAt = time + 0.5; break; }
            toSpawn--;
            spawnAt = time + Math.max(0.2, 0.8 - wave * 0.05);
          }
        }
        rebuildGrid();
        for (let i = fuses.length - 1; i >= 0; i--) {
          if (fuses[i].at < 0) fuses[i].at = time + BURST_FUSE;
          else if (time >= fuses[i].at) { const f = fuses.splice(i, 1)[0]; burstAt(f.w, f.x, f.z, f.mul, emit); }
        }
        for (const z of zombies) if (z.state !== 'off') step(z, dt, time, list);
        // Legacy strikes (the first prey only) for callers that do not read the hit events.
        if (solo) for (const e of events.ev) {
          if (e.k !== 'hit' || !(e.to & 1)) continue;
          const d = Math.hypot(solo.x - e.x, solo.z - e.z);
          if (d < e.r + 0.45) events.strikes.push({ damage: e.dmg, x: e.x, z: e.z, heavy: e.kb >= 5 });
        }
        inUpdate = false;
      }
      for (let i = corpses.length - 1; i >= 0; i--) {
        if (time > corpses[i].until || corpses[i].body.removed) { ragdolls.remove(corpses[i].body); corpses.splice(i, 1); }
      }
      if (drawNow) render(time, list);
      return events;
    },
    /**
     * Figure level of detail: the near set is 'hi' at quality levels 0-1 ('lo' from 2), the far set always 'lo'.
     * At most 80 zombies are drawn at levels 0-2 (16 of them 'hi'), 48 at level 3, 40 at levels 4-5 (§6a.4).
     */
    setDetail(next: Detail, level = 0) {
      void next;
      const d: Detail = level >= 2 ? 'lo' : 'hi';
      drawCap = level <= 2 ? 80 : level === 3 ? 48 : 40;
      hiCap = level <= 1 ? 16 : 0;
      if (d === nearSet.detail) return;
      nearSet.detail = d;
      nearSet.body.setGeometry(zombieGeometry('body', d));
      nearSet.armL.setGeometry(zombieGeometry('armL', d));
      nearSet.armR.setGeometry(zombieGeometry('armR', d));
      nearSet.legs.setGeometry(zombieGeometry('leg', d));
    },
    dispose() {
      this.stop();
      for (const batch of batches) { scene.remove(batch.mesh); batch.dispose(); }
      for (const m of Object.values(materials)) m.dispose();
    },
    // ---- zombie co-op (design.md §5, MODE) ----
    /** 'sim' runs the horde here (solo, the host); 'puppet' draws what the host's snapshots say (netApply). */
    setAuthority(mode: 'sim' | 'puppet') {
      if (mode === authority) return;
      authority = mode;
      for (const z of zombies) { cancel(z); z.waypoints.length = 0; z.thinkAt = 0; z.prey = -1; z.netStamp = stamp; }
    },
    get authority() { return authority; },
    /** The director (zombie-coop.ts) runs the waves; the built-in ones stay off. */
    startManaged(time: number) { this.stop(); running = true; managed = true; void time; },
    setPlayers(n: number) { players = Math.max(1, Math.min(8, n)); },
    /** The current wave's scaling, for adopted and legacy spawns. */
    setScaling(s: ZombieScaling) { scaling = s; },
    spawnAt: spawnHere,
    spawnNear,
    /** The zombie with this net id (generation checked), or null. */
    byId(id: number) { const z = zombies[id & 127]; return z && z.gen === id >> 7 && standing(z) ? z : null; },
    netId,
    /** Standing zombies of a kind (the director's per-kind caps). */
    aliveOf(kind: ZombieKind) { let n = 0; for (const z of zombies) if (z.kind === kind && z.state !== 'off') n++; return n; },
    alive,
    /** Gunfire (loud 1), barks and footsteps: hunters remember where; others within the radius come to look. */
    hearAt,
    /** A dog's bite: holds a small kind still (no attack) for `seconds`; the bitten zombie may turn on the dog. */
    hold(z: Zombie, seconds: number, time: number) {
      z.bitAt = time;
      if (seconds > 0 && KINDS[z.kind].holdable && standing(z)) { z.heldUntil = Math.max(z.heldUntil, time + seconds); cancel(z); z.flags |= ZF.HELD; }
    },
    /** Host records for the snapshot (NetZombie, §1.4); returns how many were written. */
    netExport(out: NetZombie[]) {
      let n = 0;
      for (const z of zombies) {
        if (z.state === 'off') continue;
        const r = out[n] ?? (out[n] = { id: 0, kind: 0, state: 0, look: 0, x: 0, z: 0, y: 0, yaw: 0, hp: 0, pace: 0, flags: 0, target: NO_SLOT, prog: 0 });
        n++;
        r.id = netId(z); r.kind = KIND_INDEX[z.kind]; r.state = STATE_INDEX[wireState(z)]; r.look = z.look % DRESS_PER_KIND;
        r.x = z.x; r.z = z.z; r.y = z.y; r.yaw = wrap(z.yaw); r.hp = clamp(z.health / z.maxHealth, 0, 1); r.pace = z.pace;
        r.flags = (z.flags | (z.heldUntil > nowT ? ZF.HELD : 0)) & 255;
        r.target = z.prey >= 0 && z.prey < lastPrey.length ? preyCode(lastPrey[z.prey]) : NO_SLOT;
        r.prog = progOf(z);
      }
      return n;
    },
    /**
     * One puppet at render time (zombie-net samplePuppets): a new generation snaps, the rest follow the samples. A
     * stalker this client is looking at holds still (A25); a puppet predicted dead stays hidden until its kill or 600 ms.
     */
    netApply(nz: NetZombie, fresh: boolean, renderTime: number) {
      void renderTime;
      const z = zombies[nz.id & 127], gen = nz.id >> 7, kind = ZOMBIE_KINDS[nz.kind] ?? 'walker';
      if (!z) return;
      if (z.ghostUntil) {
        if (gen === z.gen && nowT < z.ghostUntil) { z.netStamp = stamp; return; }
        // No kill came: it was standing after all (or the slot moved on: the body stays a corpse).
        if (z.body) { if (gen === z.gen) ragdolls.remove(z.body); else corpses.push({ body: z.body, until: nowT + 14 }); z.body = null; }
        z.ghostUntil = 0;
        fresh = true;
      }
      const isNew = fresh || z.gen !== gen || z.state === 'off' || z.kind !== kind;
      if (isNew) {
        if (z.body) { ragdolls.remove(z.body); z.body = null; }
        const look = dressAt(kind, nz.look);
        const L = dress[look].limbs;
        Object.assign(z, {
          kind, gen, look, stride: random() * 6, lean: kind === 'crawler' ? 1.35 : L.lean, tilt: L.tilt, rise: 1, attack: null, windup: 0, windStart: 0,
          maxHealth: Math.max(1, KINDS[kind].hp * scaling.hp), headYaw: 0, alert: 0, heldUntil: 0, freeze: 0, y: 0,
        } satisfies Partial<Zombie>);
        predicted[z.index] = 0;
        lastHp[z.index] = -1;
        specimen[z.index] = 0;
      } else if (kind === 'stalker' && world.seenLocal?.(z.x, z.z, world.ground(z.x, z.z) + 2.4)) {
        // On this screen the stalker never moves (A25): keep its pose and spot until it is out of view.
        z.netStamp = stamp; z.pace = 0;
        if (z.state !== 'frozen' && ZSTATES[nz.state] === 'frozen') { z.state = 'frozen'; z.freeze = nz.prog & 3; }
        return;
      }
      if (nz.hp !== lastHp[z.index]) { predicted[z.index] = 0; lastHp[z.index] = nz.hp; }
      z.x = nz.x; z.z = nz.z; z.y = nz.y; z.yaw = nz.yaw; z.pace = nz.pace; z.flags = nz.flags; z.target = nz.target; z.prog = nz.prog / 7;
      z.health = Math.max(1, nz.hp * z.maxHealth - predicted[z.index]);
      const st = ZSTATES[nz.state] ?? 'wander';
      if (st === 'windup' || st === 'scream' || st === 'burst') {
        // A windup the tele did not announce (joined mid-attack): its kind from the flags, its progress from prog.
        if (!z.attack) { z.attack = attackFromFlags(kind, nz.flags); z.windStart = 0; z.windup = 0; }
        z.state = 'chase';
      } else {
        if (z.attack && !(z.windup > nowT) && st !== 'lunge') { z.attack = null; z.windup = 0; }
        z.state = st;
        if (st === 'lunge') z.attack = 'lunge';
      }
      if (st === 'rise') z.rise = Math.max(0.05, z.prog);
      else z.rise = 1;
      if (st === 'frozen') z.freeze = nz.prog & 3;
      if (z.flags & ZF.HELD) z.heldUntil = nowT + 0.2;
      z.netStamp = stamp;
    },
    /** A promoted host takes over the mirror (§1.7): the puppets become simulated zombies; windups restart. */
    adopt(records: readonly NetZombie[], maxHp: (kind: ZombieKind) => number, time = nowT) {
      const keep = new Set<number>();
      for (const r of records) keep.add(r.id & 127);
      for (const z of zombies) if (!keep.has(z.index) && z.state !== 'off') { if (z.body) ragdolls.remove(z.body); z.body = null; z.state = 'off'; cancel(z); }
      for (const r of records) {
        const z = zombies[r.id & 127], kind = ZOMBIE_KINDS[r.kind] ?? 'walker';
        if (!z) continue;
        if (z.body) { ragdolls.remove(z.body); z.body = null; }
        const look = dressAt(kind, r.look), L = dress[look].limbs, max = Math.max(1, maxHp(kind));
        const st = ZSTATES[r.state] ?? 'wander';
        const state: ZState = st === 'off' ? 'off' : st === 'frozen' ? 'frozen' : st === 'drop' ? 'drop' : st === 'rise' || st === 'down' ? 'rise' : st === 'wander' ? 'wander' : 'chase';
        Object.assign(z, {
          kind, gen: r.id >> 7, look, state, x: r.x, z: r.z, y: st === 'drop' ? r.y : 0, vy: 0, yaw: r.yaw, pace: 0,
          lean: kind === 'crawler' ? 1.35 : L.lean, tilt: L.tilt, health: Math.max(1, r.hp * max), maxHealth: max, hitAt: -99,
          rise: st === 'rise' ? r.prog / 7 : st === 'down' ? 0.35 : 1, goalX: r.x, goalZ: r.z, lastSeen: time, investigateUntil: time + 10,
          thinkAt: time, waypoints: [], routeAt: 0, stuck: 0, sniffAt: time + 3, windup: 0, attackAt: time + 0.3, timer: time, body: null,
          attack: null, windStart: 0, prey: -1, flags: r.flags & (ZF.BARE | ZF.BROKEN), speedMul: scaling.speed, damageMul: scaling.damage,
          shield: kind === 'riot' && !(r.flags & ZF.BROKEN) ? 150 : 0, helmet: kind === 'shipper' && !(r.flags & ZF.BARE),
          heldUntil: 0, seenAt: -99, burstAt: 0, cool: time + 1, freeze: r.prog & 3, alert: 0.5, ghostUntil: 0, netStamp: stamp,
        } satisfies Partial<Zombie>);
      }
    },
    /** A tele reached this client: the puppet shows its windup at once (it never waits for the delayed snapshot, A9). */
    telegraph(id: number, attack: AttackId, seconds: number, time: number) {
      const z = zombies[id & 127];
      if (!z || z.gen !== id >> 7 || !standing(z)) return;
      z.attack = attack; z.windStart = time; z.windup = time + Math.max(0.05, seconds);
    },
    /** A `kill` reached this client: the puppet falls where it is drawn (unless its death was already predicted). */
    puppetKill(id: number, dx: number, dz: number, force: number, time: number) {
      const z = zombies[id & 127];
      if (!z || z.gen !== id >> 7) return;
      if (z.ghostUntil) {
        if (z.body) corpses.push({ body: z.body, until: time + 14 });
        z.body = null; z.ghostUntil = 0;
        return;
      }
      if (!standing(z)) return;
      const body = knock(z, dx * force, 2 + force * 0.2, dz * force, time, null, 'limp');
      corpses.push({ body, until: time + 14 });
      z.body = null;
      z.state = 'off';
    },
    /** A client's own shot predicts this puppet's death: it falls now and stays hidden unless the host disagrees (600 ms). */
    predict(z: Zombie, damage: number, vx: number, vy: number, vz: number, time: number, at?: { x: number; y: number; z: number } | null, kind?: HitKind) {
      if (!standing(z)) return false;
      predicted[z.index] += damage;
      z.hitAt = time;
      z.health = Math.max(0, lastHp[z.index] * z.maxHealth - predicted[z.index]);
      if (z.health > 0) return false;
      const body = knock(z, vx, vy, vz, time, at, 'limp', kind);
      z.state = 'off';
      z.body = body;
      z.ghostUntil = time + 0.6;
      return true;
    },
    /** Every zombie standing, for the HUD, the dog and tests. */
    list() { return zombies.filter(standing); },
    /** Removes every zombie at once (tests, a restart). */
    clear() { fuses.length = 0; for (const z of zombies) { if (z.body) ragdolls.remove(z.body); z.body = null; z.state = 'off'; z.ghostUntil = 0; cancel(z); } },
    /** A frozen display specimen (__pvo.z.look): no AI, an idle pose. */
    specimen(kind: ZombieKind, x: number, z: number, yaw: number, index: number, time: number) {
      const slot = freeSlot();
      if (!slot) return null;
      place(slot, kind, x, z, 'door', NO_SCALING, time);
      slot.look = dressAt(kind, index);
      slot.yaw = yaw;
      slot.state = 'wander';
      specimen[slot.index] = 1;
      return slot;
    },
    /** The camera: zombies outside the frustum or past the fog are not drawn (their eyes still are, forEachEye). */
    setView(next: THREE.Frustum | null, x = eyeX, z = eyeZ, far = fogFar) { frustum = next; eyeX = x; eyeZ = z; fogFar = far; viewSet = !!next; },
    /** Eye glints of every standing zombie (posed ones exactly, the undrawn ones from their pivot): rgb, glow 0..1. */
    forEachEye(cb: (x: number, y: number, z: number, rgb: number, strength: number, kind: ZombieKind) => void) {
      for (const z of zombies) {
        if (!standing(z)) continue;
        const d = dress[z.look];
        if (!d || d.glow <= 0) continue;
        const i = z.index;
        if (eyeFrame[i] === frameNo) {
          cb(eyes[i * 6], eyes[i * 6 + 1], eyes[i * 6 + 2], d.eye, d.glow, z.kind);
          cb(eyes[i * 6 + 3], eyes[i * 6 + 4], eyes[i * 6 + 5], d.eye, d.glow, z.kind);
          continue;
        }
        const s = d.limbs.scale, y = world.ground(z.x, z.z) + z.y + (z.kind === 'crawler' ? 0.55 : 1.62 * s * (1 - 0.12 * d.limbs.lean)) - (1 - z.rise) * HEIGHT * s;
        const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw), ahead = (z.kind === 'crawler' ? 0.75 : 0.1 + 0.25 * d.limbs.lean) * s, side = 0.045 * s;
        cb(z.x + fx * ahead + fz * side, y, z.z + fz * ahead - fx * side, d.eye, d.glow, z.kind);
        cb(z.x + fx * ahead - fz * side, y, z.z + fz * ahead + fx * side, d.eye, d.glow, z.kind);
      }
    },
    /** The rigid props drawn this frame (horror-fx props: shape 0 box, 1 riot shield; the matrix scales a unit box). */
    forEachProp(cb: (m: THREE.Matrix4, rgb: number, shape: number) => void) {
      for (let n = 0; n < propCount; n++) cb(propM.fromArray(propMatrices, n * 16), propRgb[n], propShape[n]);
    },
    /**
     * Glowing tells on the body (horror-fx glows): a spitter's swelling throat and a bloater's belly while they wind
     * up (ZF.GLOW), pulsing faster toward the end.
     */
    forEachGlow(time: number, cb: (x: number, y: number, z: number, r: number, rgb: number, pulse: number) => void) {
      for (const z of zombies) {
        if (!standing(z) || !(z.flags & ZF.GLOW) || (z.kind !== 'spitter' && z.kind !== 'bloater')) continue;
        const d = dress[z.look], s = d.limbs.scale, fx = Math.sin(z.yaw), fz = Math.cos(z.yaw), g = world.ground(z.x, z.z) + z.y;
        const pulse = 0.5 + 0.5 * Math.sin(time * (z.attack ? 18 : 6));
        if (z.kind === 'spitter') cb(z.x + fx * 0.22 * s, g + 1.45 * s, z.z + fz * 0.22 * s, 0.13 * s, 0x9fe04a, pulse);
        else cb(z.x + fx * 0.32 * s * d.limbs.width, g + 1.05 * s, z.z + fz * 0.32 * s * d.limbs.width, 0.22 * s, 0xc8d84a, pulse);
      }
    },
    /** The rest of the world zombie-coop.ts adds (fair spawn spots, who sees what, ambushes), after creation. */
    extendWorld(extra: Partial<ZombieWorld>) { Object.assign(world, extra); },
    /** The dress (looks) of a zombie, for the HUD and FX. */
    dressOf(z: Zombie) { return dress[z.look]; },
    /** Drawing stats: zombies drawn (near 'hi' + far), props. */
    drawStats() { return { near: nearSet.body.mesh.count, far: farSet.body.mesh.count, props: propCount, cap: drawCap }; },
    // ---- end zombie co-op ----
  };

}
