import * as THREE from 'three';
import { FigureParts, ball, loft, type Ring } from './anatomy.ts';
import { DOG_SHAPE } from './animals.ts';
import { bark, pant, setListener, silence, whimper, yelp } from './dog-audio.ts';
import { DOG_MODES, MUTANT_ID_BASE, type DogMode, type DogNet, type MutantKind, type ZombieKind } from '../../lib/zombie-protocol.ts';

/**
 * The companion dog of zombie mode (design.md §6b): one chó cỏ per player. It heels behind-left of its owner,
 * sits when told, bites zombies for a little damage (holding the small kinds still for a second), never bites a
 * bloater, barks at what its owner cannot see, growls at the stalker, keeps away from telegraphed attacks and from
 * mutants, rides along in vehicles and, solo, licks its downed owner awake once a wave. Zombies can hurt it: it
 * yelps, limps and whimpers below 40%, goes down at 0 and is revived within 60 s, or it runs off to hide and comes
 * back at the next rest (no permanent death).
 *
 * The owner's client runs its own dog (owner-authoritative: `netState()` goes into PlayerState.dog); teammates'
 * dogs are puppets interpolated on the peer snapshot clock (`setPeers`). Four InstancedMeshes draw every dog
 * (trunk with the collar, head, jaw, and one tapered segment shared by legs, paws, tail and ears), lofted with
 * anatomy.ts in the street dog's proportions (animals.ts DOG_SHAPE) ×1.15, about 1.4 k triangles per dog.
 *
 * Every timer runs on the `dt` given to update(), so a paused game pauses the dog; `now` is only compared with the
 * caller's own `dangers[].until`. Positions are metres, angles radians (yaw 0 faces +z, as everywhere in the game).
 */

export type DogCommand = 'call' | 'stay' | 'attack' | 'heal';
/** hp is a percentage (0..100), like DogNet.h. reviveIn: seconds left to revive a downed dog; awayFor: seconds it has been hiding. */
export type DogHudView = { name: string; coat: string; hp: number; state: DogMode; label: string; hint: string; reviveIn: number | null; awayFor: number | null };
export type CompanionWorld = {
  ground(x: number, z: number): number;
  /** Walkable and free of solids (land only: the dog never enters deep water). */
  clear(x: number, z: number, r: number): boolean;
  sight(x1: number, z1: number, x2: number, z2: number): boolean;
  /** The nearest standing zombie (net id) a dog may bite within r of (x, z): small kinds only for holds. */
  nearestZombie(x: number, z: number, r: number): { w: number; x: number; z: number; kind: ZombieKind | MutantKind; big: boolean } | null;
  /** The dog bit zombie w: base damage and hold seconds (MODE turns it into a local hit or a zhit). */
  bite(w: number, damage: number, hold: number, x: number, z: number): void;
  /** Something the dog should bark at: within 20 m of the owner and outside the owner's view. */
  unseenThreat(x: number, z: number, camYaw: number): { x: number; z: number } | null;
  alarm?(x: number, z: number): void;   // the bark: a hunter hears it
  /** Optional (additive): the nearest mutant within r, which the dog keeps 8 m away from unless ordered to bite it. */
  nearestMutant?(x: number, z: number, r: number): { x: number; z: number } | null;
  /** Optional (additive): the nearest stalker within r, which the dog growls at. */
  stalker?(x: number, z: number, r: number): { x: number; z: number } | null;
};
/**
 * The owner as its dog sees them. camYaw is the heading the camera looks along (forward = (sin camYaw, cos camYaw),
 * game.ts' view.yaw + π); speed in m/s; aimX/aimZ where the crosshair points on the ground. firing (optional): shot
 * in the last moment (no petting while shooting).
 */
export type DogOwner = { x: number; z: number; yaw: number; camYaw: number; speed: number; inVehicle: boolean; down: boolean; aimX: number; aimZ: number; firing?: boolean };
/** What the dog did, for the HUD (bark pings with a direction, the feed, notifications); `text` is ready to show. */
export type DogEvent = {
  k: 'bark' | 'growl' | 'hurt' | 'down' | 'away' | 'back' | 'revived' | 'lick' | 'rescued' | 'ride' | 'hop' | 'refuse';
  x: number; z: number; tx?: number; tz?: number; text: string | null;
};

// ---- Numbers (design.md §6b) -----------------------------------------------------------------------------------

export const DOG_MAX_HP = 120;
export const DOG_NAMES = ['Vàng', 'Mực', 'Bông', 'Mít'] as const;
/** [coat, dark, light] per coat index, from animals.ts. */
export const DOG_COATS = DOG_SHAPE.coats;
const SCALE = 1.15;
const HURT = 0.4;
const REGEN = 2, REGEN_CAP = 0.5, REGEN_DELAY = 6;
const PET_RATE = 6, PET_RANGE = 2, PET_CLEAR = 12;
const BANDAGE = 60, BANDAGE_RANGE = 2.2;
const REVIVE_WINDOW = 60, REVIVE_SHARE = 0.5, BANDAGE_REVIVE = 0.6, BACK_SHARE = 0.5;
const BITE = 12, NIP = 6, HOLD = 1, BITE_EVERY = 2.4, DEFEND_EVERY = 2.5;
const GALLOP = 9, LIMP = 0.6;
const TELEPORT = 45, STUCK_TELEPORT = 4;
const ATTACK_RANGE = 15, ATTACK_TIMEOUT = 6, GUARD_BARK = 12, GUARD_BITE = 2, DEFEND_REACH = 1.9, DEFEND_DOG = 4;
const MUTANT_KEEP = 8, STALKER_GROWL = 18;
const RESCUE_SECONDS = 5;
const RADIUS = 0.25;
const VIEW_HALF = 0.95;       // radians: a little wider than the camera's half view, so a teleport is never seen
const MAX_DOGS = 8;
const SEGS = 17;              // segment instances per dog: 8 leg bones, 4 paws, 3 tail, 2 ears
const LABEL_RANGE = 15;

const clamp = THREE.MathUtils.clamp;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
const approach = (a: number, b: number, step: number) => (a < b ? Math.min(b, a + step) : Math.max(b, a - step));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** What one bite does to a kind: base damage and hold seconds; null = it will not bite it (a bloater bursts). */
export function biteFor(kind: ZombieKind | MutantKind, big = false): { damage: number; hold: number } | null {
  if (kind === 'bloater') return null;
  if (big || kind === 'brute' || kind === 'riot' || kind === 'stalker' || kind === 'colossus' || kind === 'leaper' || kind === 'matriarch') return { damage: NIP, hold: 0 };
  return { damage: BITE, hold: HOLD };
}

/** The heel spot: 1.6 m behind-left of the owner (left of a figure facing +z is +x). */
export function heelSpot(o: { x: number; z: number; yaw: number }, back = 1.45, side = 0.7) {
  const s = Math.sin(o.yaw), c = Math.cos(o.yaw);
  return { x: o.x - s * back + c * side, z: o.z - c * back - s * side };
}

/** Whether the owner can see (x, z): inside the view cone (a little wider than the screen), within 70 m, in line of sight. */
export function seenBy(o: { x: number; z: number; camYaw: number }, x: number, z: number, sight: (x1: number, z1: number, x2: number, z2: number) => boolean) {
  const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz);
  if (d < 2.5) return true;
  if (d > 70) return false;
  return Math.abs(wrap(Math.atan2(dx, dz) - o.camYaw)) < VIEW_HALF && sight(o.x, o.z, x, z);
}

/** One reported state of a teammate's dog, at server time t (ms). */
export type DogSample = { t: number; x: number; z: number; a: number; m: number; h: number; w: number };
/** A puppet at renderTime: interpolated between the samples around it (modes step at their sample time), extrapolated ≤ 150 ms. */
export function samplePuppet(samples: readonly DogSample[], renderTime: number) {
  if (!samples.length) return null;
  const first = samples[0];
  if (renderTime <= first.t) return { x: first.x, z: first.z, a: first.a, m: first.m, h: first.h, w: first.w, speed: 0 };
  for (let i = 1; i < samples.length; i++) {
    const n = samples[i];
    if (renderTime > n.t) continue;
    const p = samples[i - 1], f = (renderTime - p.t) / Math.max(1, n.t - p.t);
    const speed = Math.hypot(n.x - p.x, n.z - p.z) / Math.max(0.001, (n.t - p.t) / 1000);
    return { x: p.x + (n.x - p.x) * f, z: p.z + (n.z - p.z) * f, a: p.a + wrap(n.a - p.a) * f, m: p.m, h: p.h, w: p.w, speed };
  }
  const last = samples[samples.length - 1], prev = samples.length > 1 ? samples[samples.length - 2] : null;
  const span = prev ? Math.max(0.001, (last.t - prev.t) / 1000) : 1;
  const vx = prev ? (last.x - prev.x) / span : 0, vz = prev ? (last.z - prev.z) / span : 0;
  const ahead = Math.min(150, renderTime - last.t) / 1000;
  const moving = renderTime - last.t < 150 && Math.hypot(vx, vz) > 0.05;
  return { x: last.x + vx * ahead, z: last.z + vz * ahead, a: last.a, m: last.m, h: last.h, w: last.w, speed: moving ? Math.hypot(vx, vz) : 0 };
}

// ---- The model ------------------------------------------------------------------------------------------------

// Proportions from the street dog (animals.ts): body box (a little shorter: a compact chó cỏ), legs, ears and tail.
const [BODY, , , EAR, , TAIL] = DOG_SHAPE.parts;
const BW = BODY[0] / 2, BH = BODY[1] / 2, BL = BODY[2] / 2 * 0.86, BY = BODY[4];
const LEGS = DOG_SHAPE.legs;
/** Torso rings along z as fractions of the body box: [z/BL, halfWidth/BW, top/BH, bottom/BH, (centreY - BY)/BH]. */
const TRUNK: readonly (readonly [number, number, number, number, number])[] = [
  [-1.11, 0.33, 0.32, 0.32, 0.39], [-1.03, 0.7, 0.68, 0.64, 0.29], [-0.83, 0.9, 0.86, 0.82, 0.14], [-0.56, 0.87, 0.86, 0.64, 0.18],
  [-0.22, 0.85, 0.89, 0.61, 0.21], [0.11, 0.93, 0.93, 0.86, 0.14], [0.42, 1, 0.93, 1.07, 0.11], [0.72, 0.95, 0.9, 0.98, 0.18],
  [0.94, 0.78, 0.82, 0.82, 0.39], [1.11, 0.57, 0.62, 0.64, 0.79], [1.22, 0.52, 0.54, 0.54, 1.21], [1.31, 0.49, 0.52, 0.52, 1.54],
];
/** A torso ring at z/BL = zf (linear between the table's rings), in metres: [z, halfWidth, top, bottom, centreY]. */
function trunkRing(zf: number): [number, number, number, number, number] {
  let i = 1;
  while (i < TRUNK.length - 1 && TRUNK[i][0] < zf) i++;
  const p = TRUNK[i - 1], n = TRUNK[i], f = clamp((zf - p[0]) / (n[0] - p[0]), 0, 1);
  const at = (k: number) => p[k] + (n[k] - p[k]) * f;
  return [zf * BL, at(1) * BW, at(2) * BH, at(3) * BH, BY + at(4) * BH];
}
const NECK = new THREE.Vector3(0, BY + 1.54 * BH, 1.31 * BL);            // head pivot (top of the neck)
const SHOULDER = new THREE.Vector3(LEGS.x * 0.95, LEGS.y + 0.07, LEGS.z * 0.92);
const HIP = new THREE.Vector3(LEGS.x * 0.95, LEGS.y + 0.08, -LEGS.z * 1.0);
const FRONT = [LEGS.length * 0.58, LEGS.length * 0.56] as const, HIND = [LEGS.length * 0.64, LEGS.length * 0.6] as const;
const TAIL_ROOT = new THREE.Vector3(0, BY + 0.4 * BH, -1.1 * BL);
const TAIL_SEG = TAIL[2] / 3;
const EAR_LEN = EAR[1] * 0.8;
const JAW_HINGE = new THREE.Vector3(0, -0.038, 0.115);
/** Sitting: the trunk rears up on the hips by this much and drops so the rump rests on the ground. */
const SIT_PITCH = 0.7, SIT_DROP = 0.34;
/** Palette slots of a dog vertex: the coat (instance colour), its dark and light shades, the collar, or the vertex colour itself. */
const COAT = 0, DARK = 1, LIGHT = 2, COLLAR = 3, FIXED = 6;

/** A loft along +z: rings [z, halfWidth, top, bottom, centreY] (anatomy's loft runs along y; turned so y → z). */
function lengthwise(rings: readonly (readonly [number, number, number, number, number])[], seg: number, capFirst: number | null, capLast: number | null, n = 2) {
  const list: Ring[] = rings.map(([z, w, top, bottom, cy]) => ({ y: z, rx: w, rz: bottom, rzb: top, cz: -cy, n }));
  const l = loft(list, seg, capFirst, capLast);
  l.g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  return { l, count: rings.length * seg };
}
/** Slot/shade per loft vertex from its angle round the ring (k = 0 is the underside) and its ring. */
function paint(l: { slots: number[]; shades: number[] }, seg: number, count: number, rule: (ring: number, under: number) => [number, number]) {
  for (let v = 0; v < l.slots.length; v++) {
    const ring = v < count ? Math.floor(v / seg) : v === count ? 0 : Math.floor(count / seg) - 1;
    const under = v < count ? Math.cos((v % seg) / seg * Math.PI * 2) : 0;
    [l.slots[v], l.shades[v]] = rule(ring, under);
  }
}
function finish(parts: FigureParts) {
  const g = parts.build();
  g.deleteAttribute('rig');
  return g;
}

/** The four dog meshes' geometries (dog units, before the ×1.15 instance scale), with position, normal, color (shade) and tag (slot, -, gloss). */
export function dogGeometries() {
  // Trunk and neck: a lighter chest and belly, a darker saddle along the back; the collar round the neck with its tag.
  const trunk = new FigureParts();
  {
    const rings = TRUNK.map(([zf]) => trunkRing(zf));
    const seg = 12;
    const { l, count } = lengthwise(rings, seg, rings[0][0] - 0.025, rings[rings.length - 1][0] + 0.02, 2.3);
    paint(l, seg, count, (ring, under) => {
      const chest = ring >= 4 && ring <= 10;
      if (under > 0.55 && (chest || under > 0.85) && ring >= 2) return [LIGHT, 1];
      return [COAT, under < -0.55 ? 0.82 : under < -0.1 ? 0.92 : 1];
    });
    trunk.add(l.g, {}, l.slots, l.shades);
    const grow = (r: [number, number, number, number, number], m: number) => [r[0], r[1] + m, r[2] + m, r[3] + m, r[4]] as const;
    const collar = lengthwise([grow(trunkRing(1.12), 0.012), grow(trunkRing(1.17), 0.015), grow(trunkRing(1.22), 0.012)], 12, null, null, 2.3);
    trunk.add(collar.l.g, { slot: COLLAR, gloss: 0.3 });
    const tag = trunkRing(1.17);
    trunk.add(ball(5, 4), { at: [0, tag[4] - tag[3] - 0.03, tag[0] + 0.01], scale: [0.017, 0.021, 0.007], slot: FIXED, shade: '#d9b44a', gloss: 0.9 });
  }
  // Head: skull, muzzle (lighter below, a darker bridge), wet nose, glossy eyes with catchlights, brow spots, upper canines.
  const head = new FigureParts();
  head.add(ball(10, 7), { at: [0, 0.04, 0.075], scale: [0.12, 0.11, 0.13], slot: COAT });
  {
    const seg = 8;
    const { l, count } = lengthwise([[0.12, 0.068, 0.056, 0.05, 0], [0.19, 0.057, 0.047, 0.04, -0.012], [0.25, 0.046, 0.037, 0.031, -0.02], [0.283, 0.036, 0.029, 0.025, -0.024]], seg, null, 0.3);
    // A darker bridge over the nose (the black mask of many chó cỏ vàng), light lips and chin.
    paint(l, seg, count, (ring, under) => (under < -0.7 && ring >= 1 ? [DARK, 1] : under < -0.35 ? [COAT, 0.92] : [LIGHT, 1]));
    head.add(l.g, {}, l.slots, l.shades);
  }
  head.add(ball(6, 4), { at: [0, -0.006, 0.293], scale: [0.028, 0.021, 0.019], slot: FIXED, shade: '#1b1715', gloss: 1 });
  for (const side of [1, -1]) {
    head.add(ball(6, 4), { at: [side * 0.057, 0.058, 0.158], scale: 0.022, slot: FIXED, shade: '#120d0b', gloss: 1 });
    head.add(ball(4, 3), { at: [side * 0.062, 0.067, 0.176], scale: 0.006, slot: FIXED, shade: '#f4f0e8', gloss: 1 });
    head.add(ball(5, 3), { at: [side * 0.052, 0.094, 0.152], scale: [0.019, 0.009, 0.012], slot: LIGHT });
    head.add(new THREE.ConeGeometry(0.007, 0.024, 4), { at: [side * 0.03, -0.045, 0.24], rot: [Math.PI, 0, 0], slot: FIXED, shade: '#e8e1cf' });
  }
  // Lower jaw (pivots at its hinge), tongue and lower canines.
  const jaw = new FigureParts();
  {
    const seg = 8;
    const { l } = lengthwise([[0, 0.054, 0.02, 0.028, -0.005], [0.08, 0.048, 0.016, 0.024, -0.01], [0.145, 0.036, 0.011, 0.017, -0.013]], seg, -0.012, 0.165);
    jaw.add(l.g, { slot: LIGHT });
    jaw.add(ball(6, 3), { at: [0, 0.013, 0.095], scale: [0.029, 0.009, 0.06], slot: FIXED, shade: '#c96c72', gloss: 0.6 });
    for (const side of [1, -1]) jaw.add(new THREE.ConeGeometry(0.0065, 0.022, 4), { at: [side * 0.027, 0.017, 0.138], slot: FIXED, shade: '#e8e1cf' });
  }
  // One tapered capsule from y = 0 down to y = -1 (radius 0.5 → 0.32): leg bones, paws, tail and ears.
  const segment = new FigureParts();
  {
    const l = loft([{ y: 0, rx: 0.5, rz: 0.5 }, { y: -0.5, rx: 0.43, rz: 0.43 }, { y: -1, rx: 0.32, rz: 0.32 }], 7, 0.18, -1.12);
    segment.add(l.g, { slot: COAT }, undefined, l.shades.map((_, v) => (v < 7 ? 0.95 : v < 14 ? 1 : 1.04)));
  }
  return { trunk: finish(trunk), head: finish(head), jaw: finish(jaw), segment: finish(segment) };
}

/** Triangles of one dog as drawn (trunk + head + jaw + 17 segments). */
export function dogTriangles(g = dogGeometries()) {
  const t = (x: THREE.BufferGeometry) => (x.index ? x.index.count : x.getAttribute('position').count) / 3;
  return t(g.trunk) + t(g.head) + t(g.jaw) + SEGS * t(g.segment);
}

const PALETTE_GLSL = /* glsl */`
attribute vec3 tag;
attribute vec3 iDark;
attribute vec3 iLight;
attribute vec3 iCollar;
varying float vDogGloss;
`;
/** One material for all four meshes: the vertex colour times the instance's coat, dark, light or collar colour by slot (FIXED keeps it). */
function dogMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PALETTE_GLSL}`)
      .replace('#include <color_vertex>', [
        'vColor = color;',
        '#ifdef USE_INSTANCING_COLOR',
        '\tvColor *= tag.x < 0.5 ? instanceColor : tag.x < 1.5 ? iDark : tag.x < 2.5 ? iLight : tag.x < 3.5 ? iCollar : vec3(1.0);',
        '#endif',
        'vDogGloss = tag.z;',
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDogGloss;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix(roughnessFactor, 0.16, vDogGloss);');
  };
  material.customProgramCacheKey = () => 'pvo-dog';
  return material;
}

// ---- Animation state --------------------------------------------------------------------------------------------

type Pose = 'stand' | 'sit' | 'lie' | 'down';
/** What the brain wants the body to do this frame. */
type Want = {
  pose: Pose; lookX: number; lookZ: number; lookY: number; look: boolean;
  jaw: number; ears: number; tail: number; wag: number; wagHz: number;
  limp: boolean; bite: boolean; lick: boolean; sniff: boolean; scratch: boolean; pant: number;
};
type Anim = {
  x: number; y: number; z: number; yaw: number; speed: number;
  cycle: number; off: number[]; sit: number; lie: number; side: number;
  headYaw: number; headPitch: number; tilt: number; jaw: number; ears: number; tail: number; wag: number; wagHz: number; wagPhase: number;
  pitch: number; roll: number; bob: number; tumble: number; tumbleDir: number; barkUntil: number; time: number;
};
const newAnim = (x: number, z: number, y: number, yaw: number): Anim => ({
  x, y, z, yaw, speed: 0, cycle: 0, off: [0.25, 0.75, 0, 0.5], sit: 0, lie: 0, side: 0,
  headYaw: 0, headPitch: 0, tilt: 0, jaw: 0.03, ears: 0.3, tail: 0.5, wag: 0.3, wagHz: 3, wagPhase: 0,
  pitch: 0, roll: 0, bob: 0, tumble: 0, tumbleDir: 1, barkUntil: -1, time: Math.random() * 10,
});
const restWant = (): Want => ({
  pose: 'stand', lookX: 0, lookZ: 0, lookY: 0.5, look: false, jaw: 0.03, ears: 0.35, tail: 0.5, wag: 0.3, wagHz: 3,
  limp: false, bite: false, lick: false, sniff: false, scratch: false, pant: 0,
});
// Gait phase offsets per leg [LF, RF, LH, RH]: 4-beat walk, diagonal trot, transverse gallop.
const WALK = [0.25, 0.75, 0, 0.5], TROT = [0, 0.5, 0.5, 0], GALLOP_OFF = [0.45, 0.55, 0, 0.1];

// ---- The dogs ---------------------------------------------------------------------------------------------------

type Task =
  | { k: 'attack'; w: number; x: number; z: number; kind: ZombieKind | MutantKind; big: boolean; until: number; ordered: boolean; refresh: number }
  | { k: 'bite'; w: number; x: number; z: number; until: number; ordered: boolean; refresh: number; big: boolean }
  | { k: 'heel'; until: number };
type Own = {
  name: string; coat: number; collar: string;
  hp: number; life: 'up' | 'down' | 'away'; order: 'follow' | 'stay'; stayX: number; stayZ: number;
  task: Task | null; riding: boolean;
  downAt: number; awayAt: number; hurtAt: number; biteAt: number; barkAt: number; growlAt: number; whineAt: number; yelpAt: number;
  thinkAt: number; zombieClose: boolean; threat: { x: number; z: number } | null; watch: { x: number; z: number } | null; lookUntil: number;
  guardAt: number; guard: { x: number; z: number } | null;
  stuck: number; side: number; still: number; fidget: 'sniff' | 'scratch' | null; fidgetUntil: number;
  rescue: number; rescueAt: number; licking: boolean; petting: boolean; exertion: number; panted: number;
  mutant: { x: number; z: number } | null; uneasyUntil: number;
  anim: Anim;
};
type Puppet = {
  slot: number; name: string; owner: string; color: string; coat: number;
  samples: DogSample[]; mode: DogMode; hp: number; seen: boolean; whineAt: number; barkAt: number; anim: Anim;
};

export function createCompanions(scene: THREE.Scene, world: CompanionWorld) {
  const geometries = dogGeometries();
  const material = dogMaterial();
  const meshes = {
    trunk: new THREE.InstancedMesh(geometries.trunk, material, MAX_DOGS),
    head: new THREE.InstancedMesh(geometries.head, material, MAX_DOGS),
    jaw: new THREE.InstancedMesh(geometries.jaw, material, MAX_DOGS),
    segment: new THREE.InstancedMesh(geometries.segment, material, MAX_DOGS * SEGS),
  };
  const white = new THREE.Color('#ffffff');
  for (const mesh of Object.values(meshes)) {
    const n = mesh.instanceMatrix.count;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.setAttribute('iDark', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    mesh.geometry.setAttribute('iLight', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    mesh.geometry.setAttribute('iCollar', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    for (let i = 0; i < n; i++) mesh.setColorAt(i, white);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  let clock = 0;
  let detail = 0;
  let own: Own | null = null;
  const puppets = new Map<number, Puppet>();
  const events: DogEvent[] = [];
  let last: DogOwner = { x: 0, z: 0, yaw: 0, camYaw: 0, speed: 0, inVehicle: false, down: false, aimX: 0, aimZ: 0 };
  let renderAt = -Infinity, renderClock = 0;
  let layout = '';

  const emit = (k: DogEvent['k'], x: number, z: number, text: string | null, tx?: number, tz?: number) => {
    events.push({ k, x, z, text, tx, tz });
    if (events.length > 32) events.shift();
  };
  const hpShare = (d: Own) => d.hp / DOG_MAX_HP;
  const ownMode = (d: Own): DogMode => {
    if (d.life === 'away') return 'away';
    if (d.life === 'down') return 'down';
    if (d.riding) return 'ride';
    if (d.task?.k === 'bite') return 'bite';
    if (d.task?.k === 'attack') return 'attack';
    if (hpShare(d) < HURT) return 'hurt';
    return d.order;
  };

  /** A clear spot near (x, z), trying rings of candidates; null if every candidate is blocked. */
  function clearNear(x: number, z: number, r = 2.5) {
    if (world.clear(x, z, RADIUS + 0.1)) return { x, z };
    for (let ring = 1; ring <= 4; ring++) for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + ring * 0.4, d = ring / 4 * r;
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      if (world.clear(px, pz, RADIUS + 0.1)) return { x: px, z: pz };
    }
    return null;
  }

  /** Puts the dog back at its owner's side, out of the owner's view (behind the camera), with line of sight to them. */
  function reappear(d: Own, o: DogOwner) {
    for (const off of [Math.PI, Math.PI * 0.82, -Math.PI * 0.82, Math.PI * 0.65, -Math.PI * 0.65]) for (const dist of [6, 8, 4.5]) {
      const a = o.camYaw + off, x = o.x + Math.sin(a) * dist, z = o.z + Math.cos(a) * dist;
      if (world.clear(x, z, RADIUS + 0.15) && !seenBy(o, x, z, world.sight) && world.sight(o.x, o.z, x, z)) {
        d.anim.x = x; d.anim.z = z; d.anim.yaw = Math.atan2(o.x - x, o.z - z); d.anim.speed = 0; d.stuck = 0;
        return true;
      }
    }
    return false;
  }

  /**
   * Walks the dog toward (tx, tz) at up to `want` m/s, sliding round solids: straight if clear, else the first clear
   * deflection, preferring the side that worked last. Counts time spent blocked (`stuck`).
   */
  function move(d: Own, tx: number, tz: number, want: number, dt: number) {
    const a = d.anim;
    const dx = tx - a.x, dz = tz - a.z, dist = Math.hypot(dx, dz);
    const target = dist < 0.05 ? 0 : want;
    a.speed = approach(a.speed, target, (target > a.speed ? 7 : 12) * dt);
    if (a.speed < 0.02 || dist < 0.02) { d.stuck = Math.max(0, d.stuck - dt); return; }
    const heading = Math.atan2(dx, dz), step = Math.min(dist, a.speed * dt);
    let moved = false;
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4]) {
      const h = heading + off * d.side;
      const nx = a.x + Math.sin(h) * step, nz = a.z + Math.cos(h) * step;
      if (!world.clear(nx, nz, RADIUS)) continue;
      a.x = nx; a.z = nz;
      a.yaw += wrap(h - a.yaw) * (1 - Math.exp(-dt * (a.speed > 4 ? 7 : 10)));
      if (off < 0) d.side = -d.side;
      d.stuck = Math.abs(off) >= 0.9 ? d.stuck + dt * 0.5 : Math.max(0, d.stuck - dt);
      moved = true;
      break;
    }
    if (!moved) { a.speed *= 0.5; d.stuck += dt; }
  }
  const face = (a: Anim, x: number, z: number, dt: number, rate = 6) => {
    if (Math.hypot(x - a.x, z - a.z) < 0.05) return;
    a.yaw += wrap(Math.atan2(x - a.x, z - a.z) - a.yaw) * (1 - Math.exp(-dt * rate));
  };

  function hopOut(d: Own, o: DogOwner) {
    d.riding = false;
    const h = heelSpot(o);
    const spot = clearNear(h.x, h.z, 3) ?? clearNear(o.x, o.z, 3) ?? { x: o.x, z: o.z };
    d.anim.x = spot.x; d.anim.z = spot.z; d.anim.yaw = o.yaw; d.anim.speed = 0;
    emit('hop', spot.x, spot.z, null);
  }

  function startBite(d: Own, w: number, x: number, z: number, kind: ZombieKind | MutantKind, big: boolean, ordered: boolean) {
    const b = biteFor(kind, big || w >= MUTANT_ID_BASE);
    if (!b) {
      if (clock >= d.barkAt) { d.barkAt = clock + 2.5; bark(d.anim.x, d.anim.z, 'alert'); d.anim.barkUntil = d.anim.time + 0.45; }
      d.task = null;
      return;
    }
    world.bite(w, b.damage, b.hold, d.anim.x, d.anim.z);
    d.biteAt = clock + (ordered ? BITE_EVERY : DEFEND_EVERY);
    d.task = b.hold > 0 ? { k: 'bite', w, x, z, until: clock + b.hold, ordered, refresh: 0, big } : null;
    if (b.hold > 0) bark(d.anim.x, d.anim.z, 'growl');
  }

  /** The own dog's brain for one frame; returns what the body should do. */
  function think(d: Own, o: DogOwner, dangers: readonly { x: number; z: number; r: number; until: number }[], now: number, dt: number): Want | null {
    const a = d.anim, want = restWant();
    const toOwner = Math.hypot(o.x - a.x, o.z - a.z);
    if (d.life === 'away') return null;
    if (d.life === 'down') {
      if (clock - d.downAt >= REVIVE_WINDOW) {
        d.life = 'away'; d.awayAt = clock; d.task = null;
        emit('away', a.x, a.z, `${d.name} chạy đi trốn · sẽ quay lại khi hết đợt`);
        return null;
      }
      if (clock >= d.whineAt) { d.whineAt = clock + 3.5 + Math.random() * 2.5; whimper(a.x, a.z); }
      a.speed = approach(a.speed, 0, 12 * dt);
      want.pose = 'down'; want.ears = 1; want.tail = -0.3; want.wag = 0; want.jaw = 0.08;
      return want;
    }
    // Vehicles: it jumps in beside a following owner and hops out with them.
    if (o.inVehicle) {
      if (d.riding) { a.x = o.x; a.z = o.z; a.yaw = o.yaw; a.speed = 0; return null; }
      if (d.order === 'follow' && !d.task && (toOwner < 6 || (toOwner > TELEPORT && !seenBy(o, a.x, a.z, world.sight)))) {
        d.riding = true; d.anim.tumble = 0;
        emit('ride', o.x, o.z, `${d.name} nhảy lên xe`);
        return null;
      }
    } else if (d.riding) hopOut(d, o);

    // Health over time: slow regeneration to half, petting by its owner up to full.
    if (clock - d.hurtAt > REGEN_DELAY && d.hp < DOG_MAX_HP * REGEN_CAP) d.hp = Math.min(DOG_MAX_HP * REGEN_CAP, d.hp + REGEN * dt);
    if (clock >= d.thinkAt) {
      d.thinkAt = clock + 0.25;
      d.zombieClose = !!world.nearestZombie(o.x, o.z, PET_CLEAR);
      d.mutant = world.nearestMutant?.(a.x, a.z, MUTANT_KEEP + 4) ?? null;
      d.threat = world.unseenThreat(o.x, o.z, o.camYaw);
      // A low growl toward a stalker; an alert bark (and a HUD ping) at a threat behind its owner. A hunter hears it.
      const stalker = world.stalker?.(a.x, a.z, STALKER_GROWL) ?? null;
      if (stalker && clock >= d.growlAt) {
        d.growlAt = clock + 5;
        bark(a.x, a.z, 'growl');
        d.uneasyUntil = clock + 3;
        d.watch = stalker; d.lookUntil = clock + 2.5;
        emit('growl', a.x, a.z, null, stalker.x, stalker.z);
      }
      if (d.threat && clock >= d.barkAt) {
        d.barkAt = clock + 4.5 + Math.random() * 1.5;
        bark(a.x, a.z, 'alert');
        a.barkUntil = a.time + 0.45;
        d.watch = d.threat; d.lookUntil = clock + 1.6;
        world.alarm?.(a.x, a.z);
        emit('bark', a.x, a.z, null, d.threat.x, d.threat.z);
      }
    }
    d.petting = !o.down && !o.inVehicle && !o.firing && o.speed < 0.6 && toOwner < PET_RANGE && !d.zombieClose && d.task?.k !== 'bite';
    if (d.petting && d.hp < DOG_MAX_HP) d.hp = Math.min(DOG_MAX_HP, d.hp + PET_RATE * dt);
    const hurt = hpShare(d) < HURT;
    const top = hurt ? GALLOP * LIMP : GALLOP;
    want.limp = hurt;
    if (hurt) { want.ears = 0.85; want.tail = -1.05; want.wag = 0.06; want.wagHz = 2; }
    if (hurt && clock >= d.whineAt) { d.whineAt = clock + 6 + Math.random() * 4; whimper(a.x, a.z); }

    // A knock-down: tumbling away from the blow, no control.
    if (a.tumble > 0) { a.speed = approach(a.speed, 0, 12 * dt); return want; }

    let tx = a.x, tz = a.z, speed = 0, lookOwner = false;
    const danger = dangers.find((g) => now < g.until && Math.hypot(a.x - g.x, a.z - g.z) < g.r + 0.6);
    const ordered = (d.task?.k === 'attack' || d.task?.k === 'bite') && d.task.ordered;
    const mutant = d.mutant && !ordered && Math.hypot(a.x - d.mutant.x, a.z - d.mutant.z) < MUTANT_KEEP ? d.mutant : null;
    if (danger) {
      // Out of the telegraphed area, the shortest way (from its very centre: toward its owner, or back the way it faced).
      let dx = a.x - danger.x, dz = a.z - danger.z, l = Math.hypot(dx, dz);
      if (l < 0.05) { const away = Math.hypot(o.x - danger.x, o.z - danger.z) > danger.r; dx = away ? o.x - danger.x : -Math.sin(a.yaw); dz = away ? o.z - danger.z : -Math.cos(a.yaw); l = Math.hypot(dx, dz) || 1; }
      tx = danger.x + dx / l * (danger.r + 2); tz = danger.z + dz / l * (danger.r + 2); speed = top;
      if (d.task?.k === 'bite') d.task = null;
      want.ears = 0.9; want.tail = -0.6;
    } else if (mutant) {
      const dx = a.x - mutant.x, dz = a.z - mutant.z, l = Math.hypot(dx, dz) || 1;
      tx = mutant.x + dx / l * (MUTANT_KEEP + 1.5); tz = mutant.z + dz / l * (MUTANT_KEEP + 1.5); speed = top;
      if (d.task?.k === 'bite') d.task = null;
      want.ears = 1; want.tail = -1.1; want.wag = 0;
      if (clock >= d.whineAt) { d.whineAt = clock + 5; whimper(a.x, a.z); }
    } else if (o.down && clock - d.rescueAt < 0.3) {
      // Solo rescue: to the owner's face, then lick.
      const s = Math.sin(o.yaw), c = Math.cos(o.yaw);
      tx = o.x + s * 0.55 + c * 0.25; tz = o.z + c * 0.55 - s * 0.25;
      const dist = Math.hypot(tx - a.x, tz - a.z);
      speed = dist > 0.2 ? Math.min(top, 1 + dist * 2) : 0;
      want.lookX = o.x; want.lookZ = o.z; want.lookY = 0.9; want.look = true;
      want.lick = d.licking; want.wag = 0.6; want.wagHz = 6; want.ears = 0.6;
      if (dist < 0.4) face(a, o.x, o.z, dt);
    } else if (d.task?.k === 'bite') {
      const t = d.task;
      if (clock >= t.refresh) {
        t.refresh = clock + 0.15;
        const z = world.nearestZombie(t.x, t.z, 2);
        if (z && z.w === t.w) { t.x = z.x; t.z = z.z; } else d.task = null;
      }
      if (d.task) {
        const reach = t.big ? 1.9 : 0.85;
        const dx = a.x - t.x, dz = a.z - t.z, l = Math.hypot(dx, dz) || 1;
        tx = t.x + dx / l * reach; tz = t.z + dz / l * reach; speed = 3;
        face(a, t.x, t.z, dt, 10);
        want.bite = true; want.ears = 0.7; want.tail = 0.2; want.wag = 0.1; want.jaw = 0.06;
        want.lookX = t.x; want.lookZ = t.z; want.lookY = 0.9; want.look = true;
        if (clock >= t.until) d.task = null;
      }
    } else if (d.task?.k === 'attack') {
      const t = d.task;
      if (clock >= t.refresh) {
        t.refresh = clock + 0.2;
        const z = world.nearestZombie(t.x, t.z, 2.5);
        if (z) Object.assign(t, { w: z.w, x: z.x, z: z.z, kind: z.kind, big: z.big });
        else if (Math.hypot(t.x - a.x, t.z - a.z) < 3) d.task = null;
      }
      if (d.task) {
        const reach = t.big ? 2.1 : 1.05;
        const dist = Math.hypot(t.x - a.x, t.z - a.z);
        tx = t.x; tz = t.z; speed = dist > reach - 0.1 ? top : 0;
        want.ears = 0; want.tail = 0.8; want.wag = 0.1; want.wagHz = 1.5;
        want.lookX = t.x; want.lookZ = t.z; want.lookY = 1; want.look = true;
        if (dist <= reach && clock >= d.biteAt) startBite(d, t.w, t.x, t.z, t.kind, t.big, t.ordered);
        else if (clock >= t.until) d.task = null;
        if (dist <= reach) face(a, t.x, t.z, dt, 10);
      }
    } else if (d.task?.k === 'heel') {
      // Called over to be treated: sits in front of its owner, looking up.
      const s = Math.sin(o.yaw), c = Math.cos(o.yaw);
      tx = o.x + s * 0.9; tz = o.z + c * 0.9;
      const dist = Math.hypot(tx - a.x, tz - a.z);
      speed = dist > 0.25 ? Math.min(top, 1 + dist * 2) : 0;
      lookOwner = true;
      if (speed === 0) { want.pose = 'sit'; face(a, o.x, o.z, dt); }
      if (clock >= d.task.until || d.hp >= DOG_MAX_HP) d.task = null;
    } else if (d.order === 'stay') {
      tx = d.stayX; tz = d.stayZ;
      const dist = Math.hypot(tx - a.x, tz - a.z);
      speed = dist > 0.3 ? Math.min(top, 0.8 + dist * 1.5) : 0;
      // Guard: bark at zombies within 12 m, bite any that come within 2 m (never a bloater).
      const z = clock >= d.guardAt ? world.nearestZombie(a.x, a.z, GUARD_BARK) : null;
      if (clock >= d.guardAt) { d.guardAt = clock + 0.3; d.guard = z ? { x: z.x, z: z.z } : null; }
      if (z) {
        if (clock >= d.barkAt) { d.barkAt = clock + 3; bark(a.x, a.z, z.kind === 'bloater' ? 'growl' : 'alert'); a.barkUntil = a.time + 0.45; world.alarm?.(a.x, a.z); }
        if (Math.hypot(z.x - a.x, z.z - a.z) < GUARD_BITE && clock >= d.biteAt && z.kind !== 'bloater') {
          d.task = { k: 'attack', w: z.w, x: z.x, z: z.z, kind: z.kind, big: z.big, until: clock + 2, ordered: false, refresh: 0 };
        }
      }
      if (d.guard) { want.lookX = d.guard.x; want.lookZ = d.guard.z; want.lookY = 1; want.look = true; want.ears = 0; want.tail = 0.7; want.wag = 0.08; }
      if (speed === 0) want.pose = d.still > 20 && !d.guard ? 'lie' : 'sit';
    } else {
      // Follow: heel behind-left, match the owner's pace, gallop to catch up; guard a downed owner.
      const h = o.down ? { x: o.x + Math.cos(o.yaw) * 1.1, z: o.z - Math.sin(o.yaw) * 1.1 } : heelSpot(o);
      tx = h.x; tz = h.z;
      const dist = Math.hypot(tx - a.x, tz - a.z);
      // Close enough to a standing owner: it does not trot round them every time they turn to aim.
      const settled = !o.down && o.speed < 0.4 && toOwner > 0.9 && toOwner < 3 && dist < 2.2 && a.speed < 0.5;
      speed = settled || (dist < 0.35 && o.speed < 0.4) ? 0 : clamp(o.speed * (dist > 1.5 ? 1.25 : 1) + (dist - 0.3) * 2.2, 0, top);
      if (toOwner > TELEPORT && !seenBy(o, a.x, a.z, world.sight)) reappear(d, o);
      else if (d.stuck > STUCK_TELEPORT && toOwner > 4 && !seenBy(o, a.x, a.z, world.sight) && reappear(d, o)) d.stuck = 0;
      // Auto-defend: bite a small zombie clawing the owner (within reach of them, 4 m of the dog).
      if (clock >= d.biteAt && clock >= d.guardAt) {
        d.guardAt = clock + 0.3;
        const z = world.nearestZombie(o.x, o.z, o.down ? 3 : DEFEND_REACH);
        if (z && Math.hypot(z.x - a.x, z.z - a.z) < DEFEND_DOG && biteFor(z.kind, z.big)?.hold) {
          d.task = { k: 'attack', w: z.w, x: z.x, z: z.z, kind: z.kind, big: z.big, until: clock + 2.5, ordered: false, refresh: 0 };
        }
      }
      if (speed === 0) {
        lookOwner = true;
        if (d.still > 1.5 && !d.zombieClose) want.pose = 'sit';
      }
      // The owner in the water: it waits at the bank and whines.
      if (!world.clear(o.x, o.z, 0.3) && toOwner > 3 && clock >= d.whineAt) { d.whineAt = clock + 4.5; whimper(a.x, a.z); }
    }
    move(d, tx, tz, speed, dt);
    if (speed === 0 && a.speed < 0.1) {
      d.still += dt;
      if (lookOwner && toOwner > 0.8 && want.pose === 'stand') face(a, o.x, o.z, dt, 3);
    } else { d.still = 0; d.fidget = null; }
    // Idle life: sniff the ground or scratch an ear now and then when nothing is about.
    if (d.still > 8 && !d.zombieClose && !hurt && !d.fidget && Math.random() < dt * 0.12) { d.fidget = Math.random() < 0.6 ? 'sniff' : 'scratch'; d.fidgetUntil = clock + 1.6 + Math.random(); }
    if (d.fidget && clock >= d.fidgetUntil) d.fidget = null;
    if (d.fidget === 'sniff') want.sniff = true;
    if (d.fidget === 'scratch' && want.pose === 'sit') want.scratch = true;
    // Mood: happy near its owner, alert to threats, uneasy near a stalker or a building quake.
    if (d.petting) { want.wag = 0.65; want.wagHz = 6; want.tail = 0.85; want.ears = 0.55; lookOwner = true; }
    else if (!hurt && want.ears === 0.35) { const near = toOwner < 3; want.wag = near ? 0.4 : 0.3; want.wagHz = near ? 4 : 3; }
    if (clock < d.uneasyUntil) { want.ears = 1; want.tail = Math.min(want.tail, -0.9); want.wag = 0.03; }
    if (d.watch && clock < d.lookUntil) { want.lookX = d.watch.x; want.lookZ = d.watch.z; want.lookY = 1; want.look = true; if (clock >= d.uneasyUntil) { want.ears = 0; want.tail = 0.75; want.wag = 0.08; } }
    else if (lookOwner && !want.look) { want.lookX = o.x; want.lookZ = o.z; want.lookY = 1.5; want.look = true; }
    // Exertion: pants after running.
    d.exertion = clamp(d.exertion + (a.speed / GALLOP) * dt * 0.35 - dt * 0.05, 0, 1);
    want.pant = d.exertion;
    if (want.jaw < 0.05 && d.exertion > 0.2) want.jaw = 0.16;
    return want;
  }

  // ---- Body animation and drawing -------------------------------------------------------------------------------

  const base = new THREE.Matrix4(), trunkM = new THREE.Matrix4(), rot = new THREE.Matrix4(), tmpM = new THREE.Matrix4(), headM = new THREE.Matrix4(), out = new THREE.Matrix4();
  const quat = new THREE.Quaternion(), euler = new THREE.Euler(), vPos = new THREE.Vector3(), vScale = new THREE.Vector3();
  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3(), root = new THREE.Vector3(), foot = new THREE.Vector3(), joint = new THREE.Vector3();
  const axX = new THREE.Vector3(), axY = new THREE.Vector3(), axZ = new THREE.Vector3(), dir = new THREE.Vector3(), pole = new THREE.Vector3(), side = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0), legSide = new THREE.Vector3(), fwdV = new THREE.Vector3();

  /** Advances the body toward what the brain wants (pose weights, head, ears, tail, gait phase). */
  function animate(a: Anim, w: Want, dt: number) {
    a.time += dt;
    a.sit = damp(a.sit, w.pose === 'sit' ? 1 : 0, 5, dt);
    a.lie = damp(a.lie, w.pose === 'lie' ? 1 : 0, 3, dt);
    a.side = damp(a.side, w.pose === 'down' ? 1 : 0, w.pose === 'down' ? 4 : 2, dt);
    a.tumble = Math.max(0, a.tumble - dt);
    // Gait: frequency and duty from speed, leg phase offsets blended toward the gait's.
    const v = a.speed, freq = v < 1.8 ? 1 + 0.55 * v : v < 4.5 ? 1.99 + 0.2 * (v - 1.8) : 2.53 + 0.12 * (v - 4.5);
    a.cycle += freq * dt * (w.limp ? 0.8 : 1);
    const offs = v < 1.8 ? WALK : v < 4.5 ? TROT : GALLOP_OFF;
    for (let i = 0; i < 4; i++) a.off[i] += wrap((offs[i] - a.off[i]) * Math.PI * 2) / (Math.PI * 2) * (1 - Math.exp(-dt * 6));
    const gallop = clamp((v - 4.2) / 1.2, 0, 1);
    const cyc = a.cycle * Math.PI * 2;
    a.bob = damp(a.bob, Math.min(1, v / 0.4) * (v < 1.8 ? 0.008 * Math.sin(cyc * 2) : v < 4.5 ? 0.015 * Math.abs(Math.sin(cyc * 2)) : 0.03 * Math.sin(cyc + 0.6)) - gallop * 0.03, 20, dt);
    a.pitch = damp(a.pitch, gallop * 0.11 * Math.sin(cyc) + (w.bite ? 0.12 : 0) + (w.sniff ? 0.05 : 0), 14, dt);
    a.roll = damp(a.roll, (v > 0.2 && v < 1.8 ? 0.025 * Math.sin(cyc) : 0) + (w.limp ? 0.05 : 0), 10, dt);
    // Head: look at the target (yaw within ±0.9 rad), sniff low, shake while biting, bob while galloping.
    let hy = 0, hp = 0, tilt = 0;
    if (w.look) {
      const dx = w.lookX - a.x, dz = w.lookZ - a.z, d = Math.hypot(dx, dz);
      hy = clamp(wrap(Math.atan2(dx, dz) - a.yaw), -0.9, 0.9);
      hp = clamp(-Math.atan2(w.lookY - 0.8, Math.max(0.6, d)) * 0.45, -0.22, 0.5);
    }
    if (w.sniff) { hp = 0.6; hy = 0.25 * Math.sin(a.time * 2.3); }
    if (w.bite) { hp = 0.28; hy += 0.32 * Math.sin(a.time * 19); tilt = 0.25 * Math.sin(a.time * 17); }
    if (w.lick) { hp = -0.15 + 0.08 * Math.sin(a.time * 14); }
    if (w.scratch) { tilt = 0.35; hp = -0.1; }
    if (a.time < a.barkUntil) hp -= 0.15;
    hp += gallop * 0.08 * Math.sin(a.cycle * Math.PI * 2 + 2);
    a.headYaw = damp(a.headYaw, hy, w.bite ? 30 : 7, dt);
    a.headPitch = damp(a.headPitch, hp, w.bite ? 30 : 7, dt);
    a.tilt = damp(a.tilt, tilt, 10, dt);
    // Jaw: barks snap it open twice, panting keeps it ajar, a bite clamps it.
    let jaw = w.jaw;
    if (a.time < a.barkUntil) jaw = 0.45 * Math.abs(Math.sin((a.barkUntil - a.time) / 0.45 * Math.PI * 2));
    else if (w.lick) jaw = 0.15 + 0.12 * Math.abs(Math.sin(a.time * 14));
    else if (w.pant > 0.2 && !w.bite) jaw = Math.max(jaw, 0.14 + 0.07 * Math.sin(a.time * 3.4 * Math.PI * 2));
    a.jaw = damp(a.jaw, jaw, 25, dt);
    a.ears = damp(a.ears, w.ears, 8, dt);
    a.tail = damp(a.tail, w.pose === 'sit' || w.pose === 'lie' ? Math.min(w.tail, -0.15) : w.tail, 5, dt);
    a.wag = damp(a.wag, w.wag, 4, dt);
    a.wagHz = damp(a.wagHz, w.wagHz, 3, dt);
    a.wagPhase += a.wagHz * dt * Math.PI * 2;
  }

  /** A segment instance from P to Q (dog units), `w` wide across `sideHint` and `t` thick. */
  function segment(k: number, p: THREE.Vector3, q: THREE.Vector3, w: number, t: number, sideHint: THREE.Vector3) {
    axY.subVectors(p, q);
    const len = axY.length() || 1e-4;
    axY.divideScalar(len);
    axX.copy(sideHint).addScaledVector(axY, -sideHint.dot(axY));
    if (axX.lengthSq() < 1e-6) axX.set(1, 0, 0).addScaledVector(axY, -axY.x);
    axX.normalize();
    axZ.crossVectors(axX, axY);
    tmpM.makeBasis(axX.multiplyScalar(w), axY.multiplyScalar(len), axZ.multiplyScalar(t)).setPosition(p);
    meshes.segment.setMatrixAt(k, out.multiplyMatrices(base, tmpM));
  }

  /** Two-bone leg from `root` to `foot` (dog units), knee/hock bending toward `pole`; writes 2 bones and a paw. */
  function leg(k: number, len: readonly [number, number], width: number, fwd: THREE.Vector3) {
    dir.subVectors(foot, root);
    const d = clamp(dir.length(), 0.05, len[0] + len[1] - 0.002);
    dir.normalize();
    side.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (side.lengthSq() < 1e-6) side.set(0, 0, -1);
    side.normalize();
    const cosA = clamp((len[0] * len[0] + d * d - len[1] * len[1]) / (2 * len[0] * d), -1, 1);
    joint.copy(root).addScaledVector(dir, len[0] * cosA).addScaledVector(side, len[0] * Math.sqrt(1 - cosA * cosA));
    joint.y = Math.max(joint.y, 0.035);
    pC.copy(root).addScaledVector(dir, d);
    legSide.crossVectors(dir, side);
    segment(k, root, joint, width, width * 0.9, legSide);
    segment(k + 1, joint, pC, width * 0.62, width * 0.6, legSide);
    // Paw: a flattened oval pointing forward from the foot.
    pA.copy(pC).addScaledVector(fwd, -0.02); pA.y += 0.02;
    pB.copy(pC).addScaledVector(fwd, 0.032); pB.y += 0.014;
    pB.y = Math.max(pB.y, pA.y - 0.02);
    pole.crossVectors(Y, fwd);
    if (pole.lengthSq() < 1e-6) pole.set(1, 0, 0);
    segment(k + 2, pA, pB, 0.07, 0.055, pole);
  }

  const tp = new THREE.Vector3();
  /** Transforms a dog-local point by the trunk matrix. */
  const onTrunk = (out3: THREE.Vector3, x: number, y: number, z: number) => out3.set(x, y, z).applyMatrix4(trunkM);

  /** Writes dog `i`'s 21 instances from its animation state. */
  function draw(a: Anim, i: number, w: Want) {
    base.compose(vPos.set(a.x, a.y, a.z), quat.setFromAxisAngle(Y, a.yaw), vScale.setScalar(SCALE));
    // Trunk: pivots on the hips to sit, drops to lie, rolls onto its side when down or tumbling.
    const tumbleRoll = a.tumble > 0 ? Math.sin((1 - a.tumble) * Math.PI) * 1.7 * a.tumbleDir : 0;
    const pz = HIP.z * a.sit, py = BY + (HIP.y - BY) * a.sit;
    const drop = a.bob - SIT_DROP * a.sit - 0.29 * a.lie - (BY - BW + 0.02) * a.side + (a.tumble > 0 ? Math.sin((1 - a.tumble) * Math.PI) * 0.12 : 0);
    euler.set(a.pitch - SIT_PITCH * a.sit, 0, a.roll - 1.42 * a.side + tumbleRoll, 'XYZ');
    rot.makeRotationFromEuler(euler);
    trunkM.makeTranslation(0, py + drop, pz).multiply(rot).multiply(tmpM.makeTranslation(0, -py, -pz));
    meshes.trunk.setMatrixAt(i, out.multiplyMatrices(base, trunkM));
    // Head on the neck, jaw on its hinge.
    onTrunk(tp, NECK.x, NECK.y, NECK.z);
    // The head keeps its own level and heading while the trunk rears up to sit or rocks in a gallop (else it would
    // point at the sky); it only rolls with the body (lying on its side, tumbling).
    euler.set(a.headPitch - 0.04, a.headYaw, a.tilt, 'YXZ');
    headM.makeRotationFromEuler(euler).premultiply(tmpM.makeRotationZ(a.roll - 1.42 * a.side + tumbleRoll)).setPosition(tp);
    meshes.head.setMatrixAt(i, out.multiplyMatrices(base, headM));
    tmpM.makeRotationX(a.jaw).setPosition(JAW_HINGE).premultiply(headM);
    meshes.jaw.setMatrixAt(i, out.multiplyMatrices(base, tmpM));
    const k0 = i * SEGS;
    // Legs: gait foot targets (or the pose's), two-bone IK with the joint pointing back along the trunk.
    const fwd = fwdV.set(0, 0, 1).transformDirection(rot);
    const v = a.speed, duty = v < 1.8 ? 0.62 : v < 4.5 ? 0.45 : 0.32;
    const freq = v < 1.8 ? 1 + 0.55 * v : v < 4.5 ? 1.99 + 0.2 * (v - 1.8) : 2.53 + 0.12 * (v - 4.5);
    const stride = Math.min(0.6, (v / SCALE) * duty / freq), lift = Math.min(1, v / 0.3) * (v < 1.8 ? 0.055 : v < 4.5 ? 0.075 : 0.11);
    const standW = Math.max(0, 1 - a.sit - a.lie - a.side), weights = Math.max(1e-3, standW + a.sit + a.lie + a.side);
    for (let l = 0; l < 4; l++) {
      const front = l < 2, sx = l % 2 === 0 ? 1 : -1;
      const r = front ? SHOULDER : HIP;
      onTrunk(root, sx * r.x, r.y, r.z);
      // Standing / gait.
      const phase = ((a.cycle + a.off[l]) % 1 + 1) % 1;
      let fz: number, fy = 0;
      if (phase < duty) fz = stride * (0.5 - phase / duty);
      else { const s = (phase - duty) / (1 - duty); fz = stride * (-0.5 + s * s * (3 - 2 * s)); fy = lift * Math.sin(Math.PI * s); }
      const nz = front ? r.z + 0.01 : r.z - 0.035;
      foot.set(sx * (r.x + 0.01), fy, nz + fz).multiplyScalar(standW);
      if (w.limp && l === 3 && Math.floor(a.cycle) % 2 === 1 && v > 0.2) foot.set(sx * r.x, 0.1, r.z + 0.03).multiplyScalar(standW);
      // Sitting: front legs straight under the chest, hind feet tucked forward (one scratching the neck).
      if (a.sit > 0.01) {
        if (front) foot.add(pA.set(root.x, 0, root.z + 0.03).multiplyScalar(a.sit));
        else if (w.scratch && l === 2) foot.add(pA.set(0.12, 0.2 + 0.05 * Math.sin(a.time * 44), 0.14).multiplyScalar(a.sit));
        else foot.add(pA.set(sx * 0.14, 0, -0.06).multiplyScalar(a.sit));
      }
      if (a.lie > 0.01) foot.add(pA.set(sx * (front ? 0.09 : 0.17), 0, front ? 0.47 : -0.06).multiplyScalar(a.lie));
      // Down: legs limp, sticking out from the side it lies on.
      if (a.side > 0.01) foot.add(onTrunk(pA, sx * r.x * 1.3, r.y - 0.36, r.z + (front ? 0.08 : -0.02)).multiplyScalar(a.side));
      foot.divideScalar(weights);
      pole.set(0, 0, -1).transformDirection(rot);
      leg(k0 + l * 3, front ? FRONT : HIND, front ? 0.1 : 0.125, fwd);
    }
    // Tail: three segments, lifted or tucked by mood, wagging with a lag along it, curling up at the tip.
    onTrunk(pA, TAIL_ROOT.x, TAIL_ROOT.y, TAIL_ROOT.z);
    let lift2 = a.tail, yawT = 0;
    for (let s = 0; s < 3; s++) {
      yawT = Math.sin(a.wagPhase - s * 0.7) * a.wag * (1 + s * 0.35);
      pB.set(Math.sin(yawT) * Math.cos(lift2), Math.sin(lift2), -Math.cos(yawT) * Math.cos(lift2)).transformDirection(rot).multiplyScalar(TAIL_SEG * (s === 2 ? 0.9 : 1)).add(pA);
      side.set(1, 0, 0).transformDirection(rot);
      segment(k0 + 12 + s, pA, pB, [0.062, 0.052, 0.04][s], [0.062, 0.052, 0.04][s], side);
      pA.copy(pB);
      lift2 += a.tail > 0 ? 0.35 : 0.12;
    }
    // Ears: pricked up (0) to flattened back (1), splayed outward.
    for (const sx of [1, -1]) {
      pA.set(sx * 0.062, 0.115, 0.045).applyMatrix4(headM);
      const back = a.ears * 1.25;
      pB.set(sx * Math.sin(0.3) * Math.cos(back), Math.cos(0.3) * Math.cos(back), -Math.sin(back)).transformDirection(headM).multiplyScalar(EAR_LEN).add(pA);
      side.set(sx, 0, 0).transformDirection(headM);
      pC.set(0, 0, 1).transformDirection(headM);
      side.addScaledVector(pC, 0.25 * sx).normalize();
      segment(k0 + 15 + (sx > 0 ? 0 : 1), pA, pB, 0.1, 0.026, side);
    }
  }

  const cCoat = new THREE.Color(), cDark = new THREE.Color(), cLight = new THREE.Color(), cTmp = new THREE.Color();
  /** Writes dog `i`'s instance colours: coat/dark/light/collar on trunk, head and jaw; legs, paws, tail and ears. */
  function paintDog(i: number, coat: number, collar: string) {
    const [c, d, l] = DOG_COATS[((coat % 4) + 4) % 4];
    cCoat.set(c); cDark.set(d); cLight.set(l);
    for (const mesh of [meshes.trunk, meshes.head, meshes.jaw]) {
      mesh.setColorAt(i, cCoat);
      (mesh.geometry.getAttribute('iDark') as THREE.InstancedBufferAttribute).setXYZ(i, cDark.r, cDark.g, cDark.b);
      (mesh.geometry.getAttribute('iLight') as THREE.InstancedBufferAttribute).setXYZ(i, cLight.r, cLight.g, cLight.b);
    }
    cTmp.set(/^#[0-9a-f]{6}$/i.test(collar) ? collar : '#c0392b');
    (meshes.trunk.geometry.getAttribute('iCollar') as THREE.InstancedBufferAttribute).setXYZ(i, cTmp.r, cTmp.g, cTmp.b);
    const k0 = i * SEGS, seg = meshes.segment;
    for (let leg = 0; leg < 4; leg++) {
      seg.setColorAt(k0 + leg * 3, cCoat);
      seg.setColorAt(k0 + leg * 3 + 1, cTmp.copy(cCoat).lerp(cLight, 0.3));
      seg.setColorAt(k0 + leg * 3 + 2, cTmp.copy(cCoat).lerp(cLight, 0.65));
    }
    seg.setColorAt(k0 + 12, cCoat);
    seg.setColorAt(k0 + 13, cTmp.copy(cCoat).lerp(cDark, 0.15));
    seg.setColorAt(k0 + 14, cTmp.copy(cCoat).lerp(cLight, 0.6));
    seg.setColorAt(k0 + 15, cTmp.copy(cCoat).lerp(cDark, 0.4));
    seg.setColorAt(k0 + 16, cTmp.copy(cCoat).lerp(cDark, 0.4));
  }

  function hideAll() {
    for (const mesh of Object.values(meshes)) { mesh.count = 0; mesh.visible = false; }
    layout = '';
  }

  /** Puppets: sample, animate from speed and mode, play their barks and whines nearby. */
  function updatePuppets(dt: number) {
    const renderTime = renderAt + (clock - renderClock) * 1000;
    for (const p of puppets.values()) {
      const s = samplePuppet(p.samples, renderTime);
      if (!s) { p.seen = false; continue; }
      const mode = DOG_MODES[clamp(Math.round(s.m), 0, DOG_MODES.length - 1)];
      const a = p.anim;
      const jump = Math.hypot(s.x - a.x, s.z - a.z) > 8;
      a.x = s.x; a.z = s.z; a.y = world.ground(s.x, s.z);
      a.yaw = jump ? s.a : a.yaw + wrap(s.a - a.yaw) * (1 - Math.exp(-dt * 14));
      a.speed = damp(a.speed, s.speed, 8, dt);
      if (mode !== p.mode) {
        if ((mode === 'bite' || mode === 'attack') && clock >= p.barkAt) { p.barkAt = clock + 3; bark(a.x, a.z, mode === 'bite' ? 'growl' : 'alert'); a.barkUntil = a.time + 0.45; }
        if (mode === 'down' || mode === 'hurt') { yelp(a.x, a.z); p.whineAt = clock + 3; }
        p.mode = mode;
      }
      if (mode === 'down' && clock >= p.whineAt) { p.whineAt = clock + 5 + Math.random() * 3; whimper(a.x, a.z); }
      p.hp = clamp(s.h, 0, 100);
      p.seen = mode !== 'away' && mode !== 'ride';
      const w = restWant();
      w.pose = mode === 'down' ? 'down' : mode === 'stay' && a.speed < 0.15 ? 'sit' : 'stand';
      w.limp = mode === 'hurt' || (p.hp < HURT * 100 && mode !== 'down');
      w.bite = mode === 'bite';
      if (w.limp) { w.ears = 0.85; w.tail = -1; w.wag = 0.05; }
      if (mode === 'attack' || mode === 'bite') { w.ears = 0; w.tail = 0.8; w.wag = 0.1; }
      if (mode === 'down') { w.ears = 1; w.tail = -0.3; w.wag = 0; }
      w.pant = a.speed > 4 ? 0.5 : 0;
      animate(a, w, dt);
      puppetWants.set(p.slot, w);
    }
  }
  const puppetWants = new Map<number, Want>();
  let ownWant: Want | null = null;

  function render() {
    const drawn: { a: Anim; w: Want; key: string; coat: number; collar: string }[] = [];
    if (own && own.life !== 'away' && !own.riding && ownWant) drawn.push({ a: own.anim, w: ownWant, key: `o${own.coat}${own.collar}`, coat: own.coat, collar: own.collar });
    const far = detail >= 4 ? 45 : 90;
    const list = [...puppets.values()].sort((p, q) => p.slot - q.slot);
    for (const p of list) {
      const w = puppetWants.get(p.slot);
      if (!p.seen || !w || drawn.length >= MAX_DOGS) continue;
      if (Math.hypot(p.anim.x - last.x, p.anim.z - last.z) > far) continue;
      drawn.push({ a: p.anim, w, key: `${p.slot}:${p.coat}${p.color}`, coat: p.coat, collar: p.color });
    }
    if (!drawn.length) { hideAll(); return; }
    const key = drawn.map((d) => d.key).join('|');
    if (key !== layout) {
      layout = key;
      drawn.forEach((d, i) => paintDog(i, d.coat, d.collar));
      for (const mesh of Object.values(meshes)) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.geometry.getAttribute('iDark').needsUpdate = true;
        mesh.geometry.getAttribute('iLight').needsUpdate = true;
        mesh.geometry.getAttribute('iCollar').needsUpdate = true;
      }
    }
    drawn.forEach((d, i) => draw(d.a, i, d.w));
    for (const mesh of [meshes.trunk, meshes.head, meshes.jaw]) { mesh.count = drawn.length; mesh.visible = true; mesh.instanceMatrix.needsUpdate = true; }
    meshes.segment.count = drawn.length * SEGS; meshes.segment.visible = true; meshes.segment.instanceMatrix.needsUpdate = true;
  }

  const LABELS: Record<DogMode, string> = {
    follow: 'Đang theo', stay: 'Đang ngồi đợi', attack: 'Đang lao vào cắn', bite: 'Đang cắn', hurt: 'Bị thương',
    down: 'Đã gục · giữ E để cứu', away: 'Đi trốn · sẽ quay lại khi hết đợt', ride: 'Đang ngồi trên xe',
  };

  return {
    /** The player's own dog appears at (x, z) (or the nearest clear spot): coat 0..3 (Vàng, Mực, Bông, Mít), collar in the owner's colour. */
    spawnOwn(name: string, coat: number, collar: string, x: number, z: number) {
      const spot = clearNear(x, z, 3) ?? { x, z };
      const c = ((Math.round(coat) % 4) + 4) % 4;
      own = {
        name: name || DOG_NAMES[c], coat: c, collar, hp: DOG_MAX_HP, life: 'up', order: 'follow', stayX: spot.x, stayZ: spot.z, task: null, riding: false,
        downAt: -99, awayAt: -99, hurtAt: -99, biteAt: 0, barkAt: 0, growlAt: 0, whineAt: 0, yelpAt: 0, thinkAt: 0, zombieClose: false, threat: null, watch: null, lookUntil: 0, guardAt: 0, guard: null,
        stuck: 0, side: 1, still: 0, fidget: null, fidgetUntil: 0, rescue: 0, rescueAt: -99, licking: false, petting: false, exertion: 0, panted: 0,
        mutant: null, uneasyUntil: 0, anim: newAnim(spot.x, spot.z, world.ground(spot.x, spot.z), 0),
      };
      layout = '';
    },
    despawnOwn() { own = null; ownWant = null; layout = ''; pant(0); silence(); },
    /**
     * G 'call' (come to heel; at heel it toggles to sit-and-wait), 'stay' (sit and guard here), T 'attack' (bite the
     * zombie nearest the aim point), X 'heal' (come close and sit still to be petted or bandaged). Returns the text to
     * notify, or null.
     */
    command(cmd: DogCommand, now: number): string | null {
      void now;
      const d = own;
      if (!d) return null;
      const n = d.name, a = d.anim, o = last;
      if (d.life === 'down') return `${n} đã gục · giữ E 3 giây cạnh nó để cứu`;
      if (d.life === 'away') return `${n} đang đi trốn · sẽ quay lại khi hết đợt`;
      if (cmd === 'call') {
        if (d.order === 'follow' && !d.task && !d.riding && Math.hypot(o.x - a.x, o.z - a.z) < 4) {
          d.order = 'stay'; d.stayX = a.x; d.stayZ = a.z; d.still = 0;
          return `${n} · ngồi đợi!`;
        }
        d.order = 'follow'; d.task = null;
        bark(a.x, a.z, 'happy'); a.barkUntil = a.time + 0.3;
        return `${n} · lại đây!`;
      }
      if (cmd === 'stay') {
        if (d.riding) return `${n} đang ngồi trên xe`;
        d.order = 'stay'; d.stayX = a.x; d.stayZ = a.z; d.task = null; d.still = 0;
        return `${n} · ngồi đợi!`;
      }
      if (cmd === 'attack') {
        if (d.riding || o.inVehicle) return `${n} đang ngồi trên xe`;
        let z = world.nearestZombie(o.aimX, o.aimZ, ATTACK_RANGE);
        if (!z || Math.hypot(z.x - o.x, z.z - o.z) > ATTACK_RANGE + 5) z = world.nearestZombie(o.x, o.z, ATTACK_RANGE);
        if (!z) return `Không có zombie nào gần để ${n} cắn`;
        if (z.kind === 'bloater') {
          bark(a.x, a.z, 'alert'); a.barkUntil = a.time + 0.45;
          emit('refuse', a.x, a.z, null, z.x, z.z);
          return `${n} sủa Bọng độc · không dám lại gần`;
        }
        d.task = { k: 'attack', w: z.w, x: z.x, z: z.z, kind: z.kind, big: z.big, until: clock + ATTACK_TIMEOUT, ordered: true, refresh: 0 };
        d.biteAt = Math.min(d.biteAt, clock);
        bark(a.x, a.z, 'alert'); a.barkUntil = a.time + 0.45;
        world.alarm?.(a.x, a.z);
        return `${n} · cắn!`;
      }
      // heal
      if (d.hp >= DOG_MAX_HP) return `${n} vẫn khỏe re`;
      if (d.riding) return `${n} đang ngồi trên xe`;
      d.task = { k: 'heel', until: clock + 8 };
      return `${n} lại gần · đứng yên cạnh nó để vuốt ve, X để băng bó`;
    },
    /** One frame: the own dog's brain and body, then every dog's drawing. `dangers` are telegraphed areas to leave (until: the caller's clock, like now). */
    update(dt: number, now: number, owner: DogOwner, dangers: readonly { x: number; z: number; r: number; until: number }[]) {
      dt = clamp(dt, 0, 0.1);
      clock += dt;
      last = owner;
      setListener(owner.x, owner.z, owner.camYaw);
      ownWant = null;
      if (own) {
        const d = own;
        const w = think(d, owner, dangers, now, dt);
        if (w) {
          d.anim.y = world.ground(d.anim.x, d.anim.z);
          animate(d.anim, w, dt);
          ownWant = w;
          if (Math.abs(w.pant - d.panted) > 0.03) { d.panted = w.pant; pant(d.life === 'up' && w.pant > 0.2 ? (w.pant - 0.2) / 0.8 : 0); }
        } else if (d.panted) { d.panted = 0; pant(0); }
      }
      updatePuppets(dt);
      render();
    },
    /** Damage to the own dog (victim side, after the caller's hit test); heavy blows knock it over for a second. */
    damage(amount: number, from: { x: number; z: number }, heavy: boolean, now: number) {
      void now;
      const d = own;
      if (!d || d.life !== 'up' || d.riding || !(amount > 0)) return;
      const a = d.anim;
      const before = d.hp;
      d.hp = Math.max(0, d.hp - amount);
      d.hurtAt = clock;
      if (clock >= d.yelpAt) { d.yelpAt = clock + 0.3; yelp(a.x, a.z); }
      if (heavy) {
        a.tumble = 1; a.tumbleDir = Math.sin(wrap(Math.atan2(a.x - from.x, a.z - from.z) - a.yaw)) >= 0 ? -1 : 1;
        const dx = a.x - from.x, dz = a.z - from.z, l = Math.hypot(dx, dz) || 1;
        for (const f of [1.2, 0.8, 0.4]) {
          const nx = a.x + dx / l * f, nz = a.z + dz / l * f;
          if (world.clear(nx, nz, RADIUS)) { a.x = nx; a.z = nz; break; }
        }
        if (d.task?.k === 'bite') d.task = null;
      }
      if (d.hp <= 0) {
        d.hp = 0; d.life = 'down'; d.downAt = clock; d.task = null; d.whineAt = clock + 1.5; a.speed = 0;
        emit('down', a.x, a.z, `${d.name} đã gục! Giữ E 3 giây cạnh nó để cứu`);
      } else if (before >= DOG_MAX_HP * HURT && d.hp < DOG_MAX_HP * HURT) {
        emit('hurt', a.x, a.z, `${d.name} bị thương · đứng yên cạnh nó để vuốt ve, X để băng bó`);
      }
    },
    /** Heals a standing own dog (not a downed one: revive or bandage it). */
    heal(amount: number) {
      if (own && own.life === 'up' && amount > 0) own.hp = Math.min(DOG_MAX_HP, own.hp + amount);
    },
    /**
     * Revives the own dog: a downed one stands up where it lies with 50% (Giữ E 3 s by its owner, or a teammate's
     * zcmd dogRevive); one that ran off to hide comes back to its owner with 50% (call this when a rest starts).
     */
    revive(now: number) {
      void now;
      const d = own;
      if (!d) return;
      if (d.life === 'down') {
        d.life = 'up'; d.hp = DOG_MAX_HP * REVIVE_SHARE; d.hurtAt = clock; d.anim.tumble = 0;
        emit('revived', d.anim.x, d.anim.z, `${d.name} đã đứng dậy!`);
      } else if (d.life === 'away') {
        d.life = 'up'; d.hp = DOG_MAX_HP * BACK_SHARE; d.hurtAt = clock; d.order = 'follow'; d.task = null; d.riding = false;
        if (!reappear(d, last)) { const s = clearNear(last.x, last.z, 4) ?? { x: last.x, z: last.z }; d.anim.x = s.x; d.anim.z = s.z; }
        d.anim.speed = 0;
        emit('back', d.anim.x, d.anim.z, `${d.name} đã quay lại!`);
        bark(d.anim.x, d.anim.z, 'happy');
      }
    },
    /** X next to the own dog: +60 HP, or a downed dog back up with 60%. False when it is not within reach or not hurt (then bandage yourself). */
    bandage(): boolean {
      const d = own;
      if (!d || d.life === 'away' || d.riding) return false;
      if (Math.hypot(last.x - d.anim.x, last.z - d.anim.z) > BANDAGE_RANGE) return false;
      if (d.life === 'down') {
        d.life = 'up'; d.hp = DOG_MAX_HP * BANDAGE_REVIVE; d.hurtAt = clock;
        emit('revived', d.anim.x, d.anim.z, `${d.name} đã được băng bó và đứng dậy!`);
        return true;
      }
      if (d.hp >= DOG_MAX_HP) return false;
      d.hp = Math.min(DOG_MAX_HP, d.hp + BANDAGE);
      return true;
    },
    /**
     * Solo: while the owner is down and `allowed` (once a wave, MODE's rule), a standing dog runs to them and licks
     * them awake in 5 s. Call each frame after update(); returns the progress 0..1 (1 once: stand the owner up), or
     * null when no rescue is possible.
     */
    rescue(owner: DogOwner, now: number, allowed: boolean): number | null {
      void now;
      const d = own;
      if (!d || !allowed || !owner.down || d.life !== 'up') { if (d) { d.rescue = 0; d.licking = false; } return null; }
      const dt = clamp(clock - d.rescueAt, 0, 0.1);
      d.rescueAt = clock;
      if (d.riding) hopOut(d, owner);
      const a = d.anim, dist = Math.hypot(owner.x - a.x, owner.z - a.z);
      if (dist < 1.2 && a.tumble <= 0) {
        if (!d.licking) { d.licking = true; emit('lick', a.x, a.z, `${d.name} đang liếm mặt gọi bạn dậy!`); }
        d.rescue += dt / RESCUE_SECONDS;
      } else if (dist > 3) { d.licking = false; d.rescue = Math.max(0, d.rescue - dt / RESCUE_SECONDS); }
      if (d.rescue >= 1) {
        d.rescue = 0; d.licking = false; d.rescueAt = -99;
        emit('rescued', a.x, a.z, `${d.name} liếm mặt gọi bạn dậy!`);
        bark(a.x, a.z, 'happy');
        return 1;
      }
      return d.rescue;
    },
    /** The own dog for PlayerState.dog (numbers rounded), or null when there is none. */
    netState(): DogNet | null {
      const d = own;
      if (!d) return null;
      const a = d.anim, m = ownMode(d);
      const x = d.riding ? last.x : a.x, z = d.riding ? last.z : a.z;
      return { x: r2(x), z: r2(z), a: r3(wrap(a.yaw)), m: DOG_MODES.indexOf(m), h: clamp(Math.round(d.hp / DOG_MAX_HP * 100), 0, 100), t: d.task?.k === 'bite' ? d.task.w : -1, c: d.coat };
    },
    /**
     * Teammates' dogs from the latest peer snapshot: (slot, owner name, owner colour, PlayerState.dog). renderTime and
     * sampleTime are the peer snapshot clock's (server ms); puppets render at renderTime, advanced by dt between calls.
     */
    setPeers(list: readonly { slot: number; name: string; color: string; dog: DogNet | null | undefined }[], renderTime: number, sampleTime: number) {
      const keep = new Set<number>();
      for (const peer of list) {
        const dog = peer.dog;
        if (!dog || ![dog.x, dog.z, dog.a, dog.m, dog.h].every(Number.isFinite) || !Number.isFinite(peer.slot)) continue;
        keep.add(peer.slot);
        const c = Number.isFinite(dog.c) ? ((Math.round(dog.c) % 4) + 4) % 4 : peer.slot % 4;
        let p = puppets.get(peer.slot);
        if (!p || p.color !== peer.color || p.coat !== c) {
          p = { slot: peer.slot, name: DOG_NAMES[c], owner: peer.name, color: peer.color, coat: c, samples: [], mode: 'follow', hp: 100, seen: false, whineAt: 0, barkAt: 0, anim: newAnim(dog.x, dog.z, world.ground(dog.x, dog.z), dog.a) };
          puppets.set(peer.slot, p);
          layout = '';
        }
        p.owner = peer.name;
        const prev = p.samples[p.samples.length - 1];
        if (prev && sampleTime <= prev.t) continue;
        const hidden = (m: number) => m === 6 || m === 7;
        if (prev && (Math.hypot(dog.x - prev.x, dog.z - prev.z) > 8 || hidden(prev.m) !== hidden(dog.m) || sampleTime - prev.t > 1000)) p.samples = [];
        p.samples.push({ t: sampleTime, x: dog.x, z: dog.z, a: dog.a, m: dog.m, h: dog.h, w: Number.isFinite(dog.t) ? dog.t : -1 });
        if (p.samples.length > 16) p.samples.shift();
      }
      for (const slot of [...puppets.keys()]) if (!keep.has(slot)) { puppets.delete(slot); puppetWants.delete(slot); layout = ''; }
      if (Number.isFinite(renderTime)) { renderAt = renderTime; renderClock = clock; }
    },
    /** Every dog in the world (slot -1 = the own dog), for zombie prey and the minimap; hidden dogs (riding, away) are left out. */
    forEachDog(cb: (slot: number, x: number, z: number, down: boolean) => void) {
      if (own && own.life !== 'away' && !own.riding) cb(-1, own.anim.x, own.anim.z, own.life === 'down');
      for (const p of puppets.values()) if (p.seen) cb(p.slot, p.anim.x, p.anim.z, p.mode === 'down');
    },
    hud(now: number): DogHudView | null {
      void now;
      const d = own;
      if (!d) return null;
      const m = ownMode(d), n = d.name;
      const close = Math.hypot(last.x - d.anim.x, last.z - d.anim.z) < BANDAGE_RANGE;
      const hint = d.life === 'down' ? `Giữ E 3 giây cạnh ${n} để cứu · X băng bó`
        : d.life === 'away' ? 'Sẽ quay lại khi hết đợt'
        : d.petting && d.hp < DOG_MAX_HP ? 'Đang vuốt ve · +6 máu mỗi giây'
        : d.hp < DOG_MAX_HP * HURT ? (close ? 'Đứng yên để vuốt ve · X băng bó' : 'Lại gần để vuốt ve · X băng bó')
        : 'G gọi/ngồi · T cắn · X băng bó';
      return {
        name: n, coat: DOG_COATS[d.coat][0], hp: clamp(Math.round(d.hp / DOG_MAX_HP * 100), 0, 100), state: m, label: LABELS[m], hint,
        reviveIn: d.life === 'down' ? Math.max(0, Math.ceil(REVIVE_WINDOW - (clock - d.downAt))) : null,
        awayFor: d.life === 'away' ? Math.floor(clock - d.awayAt) : null,
      };
    },
    /** The nearest dog within r of (x, z) (slot -1 = own), for revive and bandage prompts. */
    near(x: number, z: number, r: number): { slot: number; down: boolean; hurt: boolean; name: string; x: number; z: number } | null {
      let best: { slot: number; down: boolean; hurt: boolean; name: string; x: number; z: number } | null = null, bd = r;
      if (own && own.life !== 'away' && !own.riding) {
        const d = Math.hypot(own.anim.x - x, own.anim.z - z);
        if (d <= bd) { bd = d; best = { slot: -1, down: own.life === 'down', hurt: own.hp < DOG_MAX_HP * HURT, name: own.name, x: own.anim.x, z: own.anim.z }; }
      }
      for (const p of puppets.values()) {
        if (!p.seen) continue;
        const d = Math.hypot(p.anim.x - x, p.anim.z - z);
        if (d <= bd) { bd = d; best = { slot: p.slot, down: p.mode === 'down', hurt: p.hp < HURT * 100, name: p.name, x: p.anim.x, z: p.anim.z }; }
      }
      return best;
    },
    /** Additive: drains what the dog did since the last call (bark pings with a direction, feed lines, notifications). */
    takeEvents(): DogEvent[] { return events.splice(0, events.length); },
    /** Additive: a quake building or a roar: the own dog whines, flattens its ears and tucks its tail for a few seconds. */
    cue(kind: 'quake' | 'roar') {
      const d = own;
      if (!d || d.life !== 'up' || d.riding) return;
      d.uneasyUntil = clock + (kind === 'quake' ? 6 : 3);
      if (clock >= d.whineAt - 2) { d.whineAt = clock + 4; whimper(d.anim.x, d.anim.z); }
    },
    /** Additive: name tags of teammates' dogs within 15 m of the own player ("Vàng · Minh"), for the caller's label system. */
    forEachTag(cb: (slot: number, text: string, x: number, y: number, z: number) => void) {
      for (const p of puppets.values()) if (p.seen && Math.hypot(p.anim.x - last.x, p.anim.z - last.z) < LABEL_RANGE) cb(p.slot, `${p.name} · ${p.owner}`, p.anim.x, p.anim.y + 1.05, p.anim.z);
    },
    /** Additive: blob shadows under the drawn dogs. */
    forEachShadow(cb: (x: number, z: number, size: number) => void) {
      if (own && own.life !== 'away' && !own.riding) cb(own.anim.x, own.anim.z, 0.7);
      for (const p of puppets.values()) if (p.seen) cb(p.anim.x, p.anim.z, 0.7);
    },
    /** Additive: the own dog's raw state, for tests and __pvo.z.dog(). */
    own() { return own ? { x: own.anim.x, z: own.anim.z, yaw: own.anim.yaw, speed: own.anim.speed, hp: own.hp, life: own.life, order: own.order, riding: own.riding, task: own.task?.k ?? null, mode: ownMode(own), stuck: own.stuck, sit: r2(own.anim.sit), lie: r2(own.anim.lie), side: r2(own.anim.side) } : null; },
    /** Additive (tests): moves the own dog. */
    place(x: number, z: number) { if (own) { own.anim.x = x; own.anim.z = z; own.anim.speed = 0; } },
    stats() { return { dogs: meshes.trunk.count, calls: meshes.trunk.visible ? 4 : 0, triangles: meshes.trunk.count * dogTriangles(geometries), puppets: puppets.size }; },
    setDetail(level: number) { detail = level; },
    dispose() {
      for (const mesh of Object.values(meshes)) { scene.remove(mesh); mesh.dispose(); }
      for (const g of Object.values(geometries)) g.dispose();
      material.dispose();
      pant(0); silence();
      own = null; puppets.clear();
    },
  };
}

export type Companions = ReturnType<typeof createCompanions>;
