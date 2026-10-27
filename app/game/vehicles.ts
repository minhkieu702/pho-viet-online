import * as THREE from 'three';
import { nodeLight } from './signals';
import { groundHeight } from './world';
import { SECONDS_PER_HOUR } from './clock';
import { playHorn } from './audio';
import { SPOTS, wanted as spotWanted } from './parking';
import type { Lane, RoadEdge, RoadGraph, RoadNode } from './map/roads';
import { hoursUntil, inHours, worldRoads, worldVersion, type WorldRoads } from './map/world-types';
import type { RagdollLook } from './ragdoll';
import {
  CAR_DRIVER, FIGURE, FigureBatch, HAND, RIDER, TORSO, applyRig, armFK, deriveStyle, figureGeometry, figureMaterial, handCode, limbMatrix,
  palettesOf, setStyle, sideX, socket, styleOf, swingCode, twoBoneIK, type FigureKind, type FigurePalettes, type FigurePiece, type FigureStyle,
} from './figures';
import {
  FLOORBOARD, MOTO_RIDER, ModelParts, carGeometry, carGlassGeometry, carSpec, glassMaterial, motoGeometry, vehicleMaterial, type CarStyle, type MotoStyle, type Vec3,
} from './vehicle-models';

/**
 * Traffic on the live road graph (map/world-types.ts: today's grid plus the wired districts): cars and motorbikes in
 * the right-hand lanes of the edges, through the nodes on smooth connectors that keep their bodies on the asphalt,
 * stopping at red lights, yielding at junctions without lights to the main road and to whoever is already in the
 * box, stopping for anyone on a crosswalk, shifting out of the curb lane past occupied bays (and merging behind
 * whoever already drives where they move to), keeping off streets while they are closed (Bùi Viện's walking street,
 * the night markets) and easing past anything standing in their lane; police cruisers that route along road centre
 * lines to the player; and every parked vehicle in town (parking.ts spots: sidewalk
 * scooters, giữ-xe rows, car parks), which stays where it is parked, wakes when something hits it and can be
 * ridden away. Vehicles collide as capsules: an impact exchanges momentum (with spin from where it lands), knocks
 * cars out of their lane into a skid, and topples motorbikes. Vehicles left blocking the road are towed; the
 * player's own end up in the impound. Every body style (vehicle-models.ts) is one instanced draw, with its glass,
 * drivers and riders batched too; parked vehicles far away are drawn as low-poly boxes.
 */
export type CarKind = 'traffic' | 'police' | 'moto';
/** `knocked`: skidding after an impact, under physics until it comes to rest. */
export type CarMode = 'lane' | 'parked' | 'player' | 'chase' | 'hold' | 'leave' | 'off' | 'knocked';
/**
 * What a vehicle is to the city: lane traffic (or its crash leftovers), a cruiser, parked at the curb (a parking.ts
 * spot, never recycled into traffic), the player's own, one the player took and left, or a wreck.
 */
export type CarRole = 'traffic' | 'police' | 'curb' | 'owned' | 'loose' | 'wreck';
/**
 * Why a lane vehicle waits: a light, the vehicle ahead, people crossing, crossing traffic, giving way at a junction
 * without lights (or turning left across oncoming traffic), a gap to merge into, or something it cannot get past.
 */
export type Wait = 'light' | 'queue' | 'walk' | 'cross' | 'yield' | 'merge' | 'block' | null;
type Axis = 'x' | 'z';
type Point = { x: number; z: number };
/** What a lane vehicle will do at the end of its edge: the connector it takes there. */
export type Plan = Connector;
/** Someone traffic stops for: a pedestrian on a crosswalk, or (`body`) a person lying in the road. */
export type Walker = Point & { body?: boolean };
export type Car = {
  index: number;
  kind: CarKind;
  mode: CarMode;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  /**
   * Lane state: the edge of the live road graph, the travel direction on it (+1 from node a to b), the arc length of
   * the vehicle's centre from node a, its lane (index into edge.fwd or edge.back) and that lane's offset right of
   * the centre line; through a node, the connector it is on and how far along it.
   */
  edge: number;
  s: number;
  dir: number;
  lane: number;
  laneOff: number;
  conn: Connector | null;
  connS: number;
  /** On a connector, how far right of its path it drives (getting round something standing in the junction). */
  connLat: number;
  /** The connector it means to take at the end of this edge. */
  plan: Plan | null;
  /** Derived each frame for checks and tools: the axis it drives along ('x': more east-west), the road's cross coordinate there and its own along it. */
  axis: Axis;
  road: number;
  along: number;
  /** Who it waits for this frame (a queue, a merge, giving way), and since when it has waited at a junction. */
  waitFor: Car | null;
  yieldSince: number;
  /** When it last entered a node's box (who was there first goes first). */
  boxAt: number;
  cruise: number;
  driver: RagdollLook | null;
  waypoints: Point[];
  routeAt: number;
  timer: number;
  stuck: number;
  health: number;
  /** Skid (or shove) velocity and spin after an impact. */
  vx: number; vz: number; spin: number;
  /** A motorbike lying on its side; when a skidding car may rejoin its lane. */
  fallen: boolean; recoverAt: number;
  role: CarRole;
  /** A curb vehicle's spot (parking.ts SPOTS) and whose it is: a resident's, a giữ-xe lot's, or the player's. */
  curb?: { spot: number; owner: 'resident' | 'lot' | 'player' };
  /** Body style and paint of a vehicle not drawn from the fleet tables (curb vehicles). */
  style?: CarStyle | MotoStyle; paint?: string;
  /** Number plate (biển số). */
  plate: string;
  /** Where across the road a lane vehicle drives (metres right of the centre line) and where it is steering to, for passing obstacles. */
  lateral: number; lateralTarget: number;
  /** Why it waits this frame (lane traffic), and how many times it turned back. */
  wait: Wait; uturns: number;
  /** Seconds standing on the asphalt (towing), and the player's last vehicle unseen. */
  still: number; unseen: number;
  /** A curb vehicle standing in its spot; once knocked or taken its spot waits until the player is far away. */
  home: boolean; touched: boolean;
  /** Impound ticket (0: not impounded). */
  impounded: number;
};
/** A moving vehicle for collisions: centre, heading, velocity, spin, mass and capsule half-sizes. */
export type Body = { x: number; z: number; yaw: number; vx: number; vz: number; spin: number; mass: number; hw: number; hl: number };
/** One impact: where, along which normal (from `a` towards `b`), and the closing speed. */
export type Crash = { a: Car | null; b: Car; x: number; z: number; nx: number; nz: number; impact: number };
/** The player as traffic sees them: where, the fleet vehicle they drive, and (optional) their wanted stars. */
export type PlayerView = Point & { car: Car | null; wanted?: number };
/** A player vehicle the tow truck took away, waiting for its fine at the ward police. */
export type Impounded = { id: number; style: string; label: string; since: number; fee: number };

/** How far from the player traffic is kept (and recycled from), so the streets around them stay busy. */
const TRAFFIC_NEAR = 140, TRAFFIC_FAR = 200;
/** Ngã tư Hàng Xanh (binh-thanh.ts BINH_THANH_EXTRA.hangXanh) and the half-size of the box round it that jams at the evening rush. */
const HANG_XANH = { x: -390, z: 0, r: 130 } as const;
export const CAR_HALF_WIDTH = 1.05;
export const CAR_HALF_LENGTH = 2.3;
export const CAR_HEALTH = 160;
export const POLICE_CAR_HEALTH = 220;
export const MOTO_HEALTH = 70;
const HALF: Record<CarKind, [number, number]> = { traffic: [CAR_HALF_WIDTH, CAR_HALF_LENGTH], police: [CAR_HALF_WIDTH, CAR_HALF_LENGTH], moto: [0.4, 1.0] };
/** Kilograms, rider included. */
export const MASS: Record<CarKind, number> = { traffic: 1300, police: 1500, moto: 260 };

/** Closest points between segments p1-q1 and p2-q2 on the ground plane. */
function closestPoints(p1x: number, p1z: number, q1x: number, q1z: number, p2x: number, p2z: number, q2x: number, q2z: number) {
  const d1x = q1x - p1x, d1z = q1z - p1z, d2x = q2x - p2x, d2z = q2z - p2z, rx = p1x - p2x, rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  let s = 0, t = 0;
  if (a < 1e-9 && e < 1e-9) { s = t = 0; }
  else if (a < 1e-9) { t = THREE.MathUtils.clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1z * rz;
    if (e < 1e-9) { s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1z * d2z, denom = a * e - b * b;
      s = denom > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
    }
  }
  return { ax: p1x + d1x * s, az: p1z + d1z * s, bx: p2x + d2x * t, bz: p2z + d2z * t };
}
/** Where two capsule-shaped vehicles touch: normal from a to b, overlap depth and the contact point. */
export function contact(a: Body, b: Body) {
  const sa = Math.max(0, a.hl - a.hw), sb = Math.max(0, b.hl - b.hw);
  const fax = Math.sin(a.yaw) * sa, faz = Math.cos(a.yaw) * sa, fbx = Math.sin(b.yaw) * sb, fbz = Math.cos(b.yaw) * sb;
  const c = closestPoints(a.x - fax, a.z - faz, a.x + fax, a.z + faz, b.x - fbx, b.z - fbz, b.x + fbx, b.z + fbz);
  let dx = c.bx - c.ax, dz = c.bz - c.az;
  let d = Math.hypot(dx, dz);
  if (d >= a.hw + b.hw) return null;
  if (d < 1e-5) { dx = b.x - a.x; dz = b.z - a.z; d = Math.hypot(dx, dz) || 1; if (d === 1 && dx === 0 && dz === 0) dx = 1; }
  const nx = dx / d, nz = dz / d, depth = a.hw + b.hw - Math.min(d, a.hw + b.hw);
  return { nx, nz, depth, px: c.ax + nx * (a.hw - depth / 2), pz: c.az + nz * (a.hw - depth / 2) };
}
/**
 * Resolves an impact between two bodies with an impulse at the contact point (a little bounce, some sliding
 * friction), changing both velocities and spins. Returns the closing speed (0 if they were already parting).
 */
export function impulse(a: Body, b: Body, c: { nx: number; nz: number; px: number; pz: number }, restitution = 0.22) {
  const rax = c.px - a.x, raz = c.pz - a.z, rbx = c.px - b.x, rbz = c.pz - b.z;
  // The velocity of a point at r on a body spinning at w about +y is (w * rz, -w * rx).
  const vax = a.vx + a.spin * raz, vaz = a.vz - a.spin * rax, vbx = b.vx + b.spin * rbz, vbz = b.vz - b.spin * rbx;
  const rel = (vbx - vax) * c.nx + (vbz - vaz) * c.nz;
  if (rel >= 0) return 0;
  const ia = (a.mass * ((2 * a.hl) ** 2 + (2 * a.hw) ** 2)) / 12, ib = (b.mass * ((2 * b.hl) ** 2 + (2 * b.hw) ** 2)) / 12;
  const apply = (jx: number, jz: number) => {
    b.vx += jx / b.mass; b.vz += jz / b.mass; b.spin += (rbz * jx - rbx * jz) / ib;
    a.vx -= jx / a.mass; a.vz -= jz / a.mass; a.spin -= (raz * jx - rax * jz) / ia;
  };
  const cna = raz * c.nx - rax * c.nz, cnb = rbz * c.nx - rbx * c.nz;
  const j = (-(1 + restitution) * rel) / (1 / a.mass + 1 / b.mass + (cna * cna) / ia + (cnb * cnb) / ib);
  apply(j * c.nx, j * c.nz);
  // Friction along the contact: the bodies drag on each other as they scrape past.
  const tx = -c.nz, tz = c.nx;
  const slip = (vbx - vax) * tx + (vbz - vaz) * tz;
  const cta = raz * tx - rax * tz, ctb = rbz * tx - rbx * tz;
  const jt = THREE.MathUtils.clamp(-slip / (1 / a.mass + 1 / b.mass + (cta * cta) / ia + (ctb * ctb) / ib), -0.35 * j, 0.35 * j);
  apply(jt * tx, jt * tz);
  return -rel;
}
// Cars keep to the middle of the right-hand side, motorbikes hug the curb.
const LANES: Record<CarKind, number> = { traffic: 3.0, police: 3.0, moto: 5.4 };
// Sài Gòn traffic is motorbikes (about 83%): the lane fleet's cap follows the quality level (design-engine §8: 60 / 45
// / 30 vehicles on High / Medium / Low), and within it the streets round the player get as many as their lanes hold
// (LANE_METRES per bike, per car), by the hour's flow (rush hours full, the small hours a quarter). The spare cars are
// there for the zombie mode's wrecks.
const COUNTS: Record<CarKind, number> = { traffic: 13, police: 8, moto: 50 };
/** Lane fleet caps by quality level (quality.ts QUALITY_LEVELS order: Cao … Tối thiểu). */
const FLEET_CAPS: readonly { moto: number; traffic: number }[] = [
  { moto: 50, traffic: 10 }, { moto: 38, traffic: 7 }, { moto: 38, traffic: 7 }, { moto: 25, traffic: 5 }, { moto: 25, traffic: 5 }, { moto: 25, traffic: 5 },
];
/** Lane metres (length times lanes, within TRAFFIC_NEAR) per motorbike and per car at the full flow: today's grid round An Hòa (about 9 km of lanes) holds the whole High fleet. */
const LANE_METRES = { moto: 175, traffic: 900 } as const;
/** The quality level until the game sets one: the smallest fleet (today's 25 bikes and 5 cars), as tests and sims run. */
const DEFAULT_LEVEL = 5;
/** A strongly connected set of lane states smaller than this is not driven unless it is the largest (a stub, a parking aisle). */
const MIN_OPEN = 40;
/** Share of the lane fleet running at an hour: rush 6:30-8:30 and 16:30-19:00, daytime 0.75, late evening 0.5, night 0.25. */
export function flowShare(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  if ((h >= 6.5 && h < 8.5) || (h >= 16.5 && h < 19)) return 1;
  if ((h >= 8.5 && h < 16.5) || (h >= 19 && h < 21)) return 0.75;
  if ((h >= 21 && h < 23) || (h >= 5 && h < 6.5)) return 0.5;
  return 0.25;
}
/**
 * How many of a kind may run in the lanes at an hour: the quality level's cap, fewer where the streets round the player
 * have few lanes (`laneMetres`, Infinity: no limit), times the hour's flow.
 */
const laneAllowance = (kind: CarKind, hour: number, level = DEFAULT_LEVEL, laneMetres = Infinity) => {
  if (kind === 'police') return 0;
  const cap = FLEET_CAPS[Math.max(0, Math.min(FLEET_CAPS.length - 1, level))][kind];
  return Math.round(Math.max(Math.min(cap, laneMetres / LANE_METRES[kind]), kind === 'moto' ? 6 : 1) * flowShare(hour));
};
const BODY_COLORS = ['#c9493b', '#3f6f9f', '#e8d6a8', '#5e927c', '#f0f0ea', '#2f3a40', '#d98c3c', '#8c6fae', '#9fb4d6', '#b8b2a4'];
const MOTO_COLORS = ['#ed763e', '#4f86c6', '#c9493b', '#e8e2d0', '#2b2f33', '#86b8a0', '#d4b164', '#a57fb0'];
const TAXI_COLORS = ['#f3f1ea', '#3a9a68'];
const COLOR_NAMES: Record<string, string> = {
  '#c9493b': 'đỏ', '#3f6f9f': 'xanh dương', '#e8d6a8': 'màu be', '#5e927c': 'xanh lá', '#f0f0ea': 'trắng', '#2f3a40': 'đen', '#d98c3c': 'cam', '#8c6fae': 'tím',
  '#9fb4d6': 'xanh nhạt', '#b8b2a4': 'bạc', '#ed763e': 'cam', '#4f86c6': 'xanh dương', '#e8e2d0': 'màu kem', '#2b2f33': 'đen', '#86b8a0': 'xanh ngọc', '#d4b164': 'vàng',
  '#a57fb0': 'tím', '#f3f1ea': 'trắng', '#3a9a68': 'xanh lá', '#f4f4f0': 'trắng',
};
const STYLE_NAMES: Record<CarStyle | MotoStyle, string> = {
  scooter: 'Xe tay ga', cub: 'Xe số', vespa: 'Xe Vespa', sport: 'Xe côn tay', sedan: 'Ô tô sedan', hatch: 'Ô tô hatchback', suv: 'Ô tô SUV', taxi: 'Taxi', pickup: 'Xe bán tải', police: 'Xe cảnh sát',
};
const DUST = new THREE.Color('#9b9384');
const DRIVER_SHIRTS = ['#db9876', '#86a799', '#d4b164', '#8caaa9', '#c96f6f', '#6f86a8'];
/** Body style of each traffic car (by index), and of each motorbike: mostly scooters and step-throughs. */
const TRAFFIC_STYLES: CarStyle[] = ['sedan', 'hatch', 'suv', 'taxi', 'sedan', 'pickup', 'hatch', 'sedan', 'suv', 'taxi', 'hatch', 'sedan'];
const MOTO_STYLES: MotoStyle[] = ['scooter', 'cub', 'scooter', 'vespa', 'cub', 'sport', 'scooter', 'cub', 'scooter'];
/** Curb vehicles' indices start here, so they never share a fleet vehicle's (kind, index). */
export const CURB_INDEX = 100;
/** The body style a vehicle is drawn with. */
export function vehicleStyle(car: Car): CarStyle | MotoStyle {
  if (car.style) return car.style;
  return car.kind === 'moto' ? MOTO_STYLES[car.index % MOTO_STYLES.length] : car.kind === 'police' ? 'police' : TRAFFIC_STYLES[car.index % TRAFFIC_STYLES.length];
}
/** Hip position of whoever sits in the driver's seat, in the vehicle's own frame (metres): cars are left-hand drive. */
export function seatOf(car: Car): Vec3 {
  return car.kind === 'moto' ? MOTO_RIDER.hip : carSpec(vehicleStyle(car) as CarStyle).seat;
}
/** "Xe tay ga đỏ · 59-X1 234.56": what a vehicle is, for menus and notices. */
export function vehicleLabel(car: Car, paint: string) {
  const colour = COLOR_NAMES[paint.toLowerCase()];
  return `${STYLE_NAMES[vehicleStyle(car)]}${colour ? ` ${colour}` : ''} · ${car.plate}`;
}
const COP: RagdollLook = { shirt: '#5a6640', pants: '#3d4a2c', skin: '#d3a179', helmet: '#46532f' };
setStyle(COP, deriveStyle(COP, 0, 'police'));
// Motorbike riders: varied clothes and skin, always a helmet (it is the law); the wardrobe adds face masks, sun
// jackets with the hood over the helmet, gloves and wrap skirts.
const RIDER_SHIRTS = ['#b8463a', '#86a799', '#d4b164', '#8caaa9', '#c96f6f', '#6f86a8', '#f0f0ea', '#a57fb0', '#3f6f9f', '#7fa37a', '#2f3a48', '#5e927c'];
const RIDER_PANTS = ['#3f4d5c', '#536c69', '#6d5d4f', '#2f3a48', '#7b6a58', '#26303a', '#4f5a4a'];
const RIDER_SKINS = ['#d3a179', '#c58f69', '#e0b48e', '#b98260'];
const HELMETS = ['#f2efe6', '#c9493b', '#2b2f33', '#4f86c6', '#e2b53a', '#86b8a0', '#e8a0b4', '#7d5ba6', '#f2efe6', '#d98c3c'];
let riderCount = 0;
function hash01(k: number, salt: number) {
  let h = Math.imul(k ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** A Sài Gòn plate: motorbikes "59-X1 234.56", cars "51G-123.45" (made up from a hash, never a real one). */
function plateOf(moto: boolean, k: number) {
  const letters = 'ABCDEFGHKLMNPSTUVXYZ', d = (salt: number, n: number) => String(Math.floor(hash01(k, salt) * 10 ** n)).padStart(n, '0');
  const letter = letters[Math.floor(hash01(k, 21) * letters.length)];
  return moto ? `${59 - Math.floor(hash01(k, 22) * 3)}-${letter}${1 + Math.floor(hash01(k, 23) * 9)} ${d(24, 3)}.${d(25, 2)}` : `51${letter}-${d(24, 3)}.${d(25, 2)}`;
}
/** A rider's look from the rolled shirt; the rest is hashed from a counter so the traffic's random sequence is unchanged. */
function riderLook(shirt: number): RagdollLook {
  const k = ++riderCount;
  const pickOf = (list: string[], salt: number) => list[Math.floor(hash01(k, salt) * list.length)];
  const look: RagdollLook = {
    shirt: RIDER_SHIRTS[(shirt + Math.floor(hash01(k, 1) * RIDER_SHIRTS.length)) % RIDER_SHIRTS.length],
    pants: pickOf(RIDER_PANTS, 2), skin: pickOf(RIDER_SKINS, 3), helmet: pickOf(HELMETS, 4),
  };
  // Remembered with the look, so a rider thrown off becomes a ragdoll dressed the same.
  setStyle(look, deriveStyle(look, k, 'rider'));
  return look;
}

/** A car driver's look, varied by a counter hash like the riders'. */
function driverLook(shirt: number): RagdollLook {
  const k = ++riderCount;
  const look = { shirt: DRIVER_SHIRTS[shirt], pants: RIDER_PANTS[Math.floor(hash01(k, 7) * RIDER_PANTS.length)], skin: RIDER_SKINS[Math.floor(hash01(k, 8) * RIDER_SKINS.length)] };
  setStyle(look, deriveStyle(look, k, 'driver'));
  return look;
}

// ---- Occupants ---------------------------------------------------------------------------------------------

/**
 * Where people sit in each vehicle body (vehicle-models.ts: metres, nose toward +z) and what they reach for:
 * hip above the seat, forward lean, world scale, each fist on a grip with the bar running through it, and the
 * ball of each foot on the floorboard, a footpeg or the pedals. Poses are solved by IK when a person takes
 * a seat, so hands close on the grips whatever their build.
 */
export type SeatSpec = {
  hip: Vec3; lean: number; scale: number;
  /** A fist's centre and the way the bar leaves it past the thumb, for a side (+1 is +x); null rests the hands on the thighs. */
  grip: ((side: 1 | -1) => [THREE.Vector3, THREE.Vector3]) | null;
  /** The ball of the foot, sole down on what it rests on. */
  foot: (side: 1 | -1) => THREE.Vector3;
  /** Which way elbows and knees point, for the +x side (x is mirrored). */
  elbow: Vec3; knee: Vec3;
  hand: number;
  /** Tallest build that still clears the roof. */
  maxHeight: number;
};
export type SeatKind = MotoStyle | CarStyle | 'passenger';

/** Riders sit a little ahead of the saddle's hip mark and lean toward the bars, so straight-ish arms reach the grips. */
const MOTO_HIP: Vec3 = [MOTO_RIDER.hip[0], MOTO_RIDER.hip[1], MOTO_RIDER.hip[2] + 0.12];
const MOTO_LEAN = RIDER.lean + 0.04;
/** Fists close on the rubber grips with the index finger resting on the brake lever. */
const BAR_HAND = handCode(0.85, 0.6, 0.7);
/** Knees up and only a little apart behind the leg shield, or forward along the tank (RIDER.knee splays them too wide for these legs). */
const FLOORBOARD_KNEE: Vec3 = [0.5, 0.5, 0.75], PEG_KNEE: Vec3 = [0.3, 0.25, 0.95];
/** Floorboard tops and footpeg tops (x, top, z) of each bike body. */
const BOARD: Partial<Record<MotoStyle, number>> = { scooter: 0.603, vespa: 0.622 };
const PEG: Partial<Record<MotoStyle, Vec3>> = { cub: [0.2, 0.36, -0.03], sport: [0.2, 0.398, -0.05] };
/** Steering wheel centre of each car body relative to the driver's seat (vehicle-models.ts carBody: the belt line + 0.1, 0.4 behind the windshield base), tilted back 0.45 rad. */
const STEERING: Record<CarStyle, Vec3> = {
  sedan: [0, 0.628, 0.6], taxi: [0, 0.628, 0.6], police: [0, 0.628, 0.6], hatch: [0, 0.608, 0.52], suv: [0, 0.628, 0.67], pickup: [0, 0.608, 0.48],
};
/** The cabin floor under the pedals relative to the seat (a little above each body's ground clearance), so feet stay inside the car. */
const FLOOR: Record<CarStyle, number> = { sedan: -0.22, taxi: -0.22, police: -0.22, hatch: -0.24, suv: -0.32, pickup: -0.32 };
/** Rim radius and tilt of the wheel, and where on the rim the hands hold it (radians from twelve o'clock). */
const WHEEL_RADIUS = 0.14, WHEEL_TILT = -0.45, WHEEL_HOLD = 2.15;
/** Drivers sit this far behind the wheel (hip to wheel centre along the car), which the seat's own mark leaves a little long for these arms. */
const WHEEL_REACH = 0.5;

function motoSeat(style: MotoStyle): SeatSpec {
  const [gx, gy, gz] = MOTO_RIDER.grip;
  const board = BOARD[style], peg = PEG[style] ?? PEG.cub!;
  return {
    hip: MOTO_HIP, lean: MOTO_LEAN, scale: RIDER.scale, maxHeight: 2,
    grip: (side) => [new THREE.Vector3(side * (gx - 0.03), gy, gz), new THREE.Vector3(-side, 0, 0)],
    foot: FLOORBOARD[style] && board !== undefined
      ? (side) => new THREE.Vector3(side * 0.12, board, 0.34)
      : (side) => new THREE.Vector3(side * peg[0], peg[1], peg[2] + 0.02),
    elbow: RIDER.elbow as Vec3, knee: FLOORBOARD[style] ? FLOORBOARD_KNEE : PEG_KNEE, hand: BAR_HAND,
  };
}
function carSeat(style: CarStyle | null): SeatSpec {
  const wheel = STEERING[style ?? 'sedan'];
  const hip: Vec3 = [0, 0, wheel[2] - WHEEL_REACH];
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), WHEEL_TILT);
  return {
    hip, lean: 0, scale: CAR_DRIVER.scale, maxHeight: 1,
    // Twenty past eight on the rim (the wheel sits high for a seated figure, ten to two would put the hands at
    // the chin); the rim runs up through each fist toward twelve o'clock.
    grip: style ? (side) => [
      new THREE.Vector3(side * Math.sin(WHEEL_HOLD), Math.cos(WHEEL_HOLD), 0).multiplyScalar(WHEEL_RADIUS).applyQuaternion(tilt).add(new THREE.Vector3(...wheel)),
      new THREE.Vector3(-side * Math.cos(WHEEL_HOLD), Math.sin(WHEEL_HOLD), 0).applyQuaternion(tilt),
    ] : null,
    foot: (side) => new THREE.Vector3(side * 0.13, FLOOR[style ?? 'police'], hip[2] + 0.58),
    elbow: [0.9, -0.6, -0.3], knee: CAR_DRIVER.knee as Vec3, hand: HAND.GRIP,
  };
}
export const SEATS = {} as Record<SeatKind, SeatSpec>;
for (const style of ['scooter', 'cub', 'vespa', 'sport'] as MotoStyle[]) SEATS[style] = motoSeat(style);
for (const style of Object.keys(STEERING) as CarStyle[]) SEATS[style] = carSeat(style);
SEATS.passenger = carSeat(null);

/** Swing, abduct, roll (limbMatrix), knee and ankle of a leg. */
export type LegAngles = [number, number, number, number, number];
/** A seated person in seat space: instance matrices and shader poses of body, arms and legs ([left (+x), right (-x)]: people face +z). */
export type SeatPose = {
  body: THREE.Matrix4;
  arm: [THREE.Matrix4, THREE.Matrix4]; armPose: [number[], number[]];
  leg: [THREE.Matrix4, THREE.Matrix4]; legPose: [number[], number[]];
  /** Shoulder swing, abduct, roll of each arm (limbMatrix; a hero figure's 'XZY' shoulder rotation) and both legs' angles. */
  armAngles: [Vec3, Vec3]; legAngles: [LegAngles, LegAngles];
  /** Head pitch that keeps the eyes on the road whatever the lean. */
  pitch: number;
  /** The left leg on its rest and planted on the road beside a stopped bike, blended at red lights. */
  rest: LegAngles; down: LegAngles | null;
};

const IDENTITY = new THREE.Matrix4();
const UA = FIGURE.upperArm, FA = FIGURE.foreArm;
/** Rest positions of the sole under the heel and under the ball of the foot (leg space), moved by the knee and ankle only. */
const HEEL = new THREE.Vector3(0, -FIGURE.sole, -0.04), BALL = new THREE.Vector3(0, -FIGURE.sole, FIGURE.ball), FOOT_RIG = [1, 1, 0, 0];
/**
 * Where a stopped rider's left foot goes (bike frame before the tilt, the road 0.04 above the bike's origin): out
 * to the left (+x: riders face +z) clear of the floorboard skirt, a little ahead of the hip, and how far the bike
 * tips onto it (toward +x, a negative lean). The right foot stays on the board for the rear brake.
 */
const FOOT_DOWN: Vec3 = [0.44, 0.04, 0.2];
const FOOT_DOWN_TILT = 0.12;
/** Forearm twist and elbow swivel that run the bar through each fist, found once per seat and side (they hardly change with build). */
const gripFit = new Map<string, [number, number]>();

/**
 * IK for an arm: the shoulder and elbow put the GRIP socket of the fist on `point`. The forearm twist and the
 * elbow's swivel about the shoulder-wrist line turn the fist so its channel runs along `along` (wrist flex
 * turns about that channel, so it cannot help): searched coarse to fine, or refined around `fit`. Returns the
 * arm's instance matrix (seat space), shader pose, shoulder angles and the fit used.
 */
export function reachGrip(body: THREE.Matrix4, inv: THREE.Matrix4, side: 1 | -1, shoulderX: number, point: THREE.Vector3, along: THREE.Vector3, hint: THREE.Vector3, hand: number, flex: number, fit: [number, number] | null) {
  const root = new THREE.Vector3(sideX(side) * shoulderX, FIGURE.shoulderY, 0);
  const target = point.clone().applyMatrix4(inv), wrist = target.clone(), grip = socket('GRIP', side);
  const local = new THREE.Matrix4(), fk = new THREE.Matrix4(), m = new THREE.Matrix4(), dir = new THREE.Vector3(), at = new THREE.Vector3();
  const axis = new THREE.Vector3(), turned = new THREE.Vector3();
  let [twist, swivel] = fit ?? [0.5, 0];
  let ik = twoBoneIK(root, wrist, UA, FA, hint);
  const solve = (sw: number) => {
    turned.copy(hint).applyAxisAngle(axis.subVectors(wrist, root).normalize(), sw);
    ik = twoBoneIK(root, wrist, UA, FA, turned);
    limbMatrix(IDENTITY, root.x, root.y, ik.swing, ik.abduct, ik.roll, local, root.z);
  };
  for (let iter = 0; iter < 8; iter++) {
    if (iter < (fit ? 2 : 4)) {
      // A coarse sweep first (or the seat's fit), then finer steps around the best; the elbow prefers its hinted side.
      const step = fit ? 0.05 / (iter + 1) : iter === 0 ? 0.1 : 0.1 / (iter * 2);
      const [t0, t1] = iter === 0 && !fit ? [-0.9, 1.6] : [twist - step * 4, twist + step * 4];
      const [s0, s1] = iter === 0 && !fit ? [-0.8, 0.8] : [swivel - step * 4, swivel + step * 4];
      let best = Infinity, bt = twist, bs = swivel;
      for (let sw = s0; sw <= s1 + 1e-9; sw += step) {
        solve(sw);
        m.multiplyMatrices(body, local);
        for (let t = t0; t <= t1 + 1e-9; t += step) {
          armFK([ik.bend, t, flex, hand], side, fk);
          const e = -dir.set(0, 0, 1).transformDirection(fk.premultiply(m)).dot(along) + 0.05 * sw * sw;
          if (e < best) { best = e; bt = t; bs = sw; }
        }
      }
      twist = bt; swivel = bs;
    }
    solve(swivel);
    armFK([ik.bend, twist, flex, hand], side, fk);
    at.copy(grip).applyMatrix4(fk.premultiply(local));
    wrist.add(at.subVectors(target, at));
  }
  solve(swivel);
  return {
    matrix: limbMatrix(body, root.x, root.y, ik.swing, ik.abduct, ik.roll, new THREE.Matrix4(), root.z),
    pose: [ik.bend, twist, flex, hand], angles: [ik.swing, ik.abduct, ik.roll] as Vec3, fit: [twist, swivel] as [number, number],
  };
}

/**
 * IK for a leg: the ball of the foot on `point` with the ankle turned so the sole lies on the surface (the heel
 * `lift` higher than the ball: a rider on tiptoe). Returns the angles, the instance matrix and the shader pose.
 */
export function plantFoot(body: THREE.Matrix4, inv: THREE.Matrix4, side: 1 | -1, point: THREE.Vector3, hint: THREE.Vector3, lift = 0) {
  const root = new THREE.Vector3(sideX(side) * FIGURE.hipX, FIGURE.hipY, 0);
  const target = point.clone().applyMatrix4(inv);
  // First guess: the ankle above and behind the ball as in a standing foot.
  const ankle = target.clone().add(new THREE.Vector3(0, FIGURE.sole - FIGURE.thigh - FIGURE.shin, -FIGURE.ball));
  const local = new THREE.Matrix4(), seat = new THREE.Matrix4(), heel = new THREE.Vector3(), ball = new THREE.Vector3(), pose = [0, 0, 0, 0];
  let angle = 0, ik = twoBoneIK(root, ankle, FIGURE.thigh, FIGURE.shin, hint, true);
  const tilt = (a: number) => {
    pose[1] = a;
    applyRig('leg', FOOT_RIG, pose, HEEL, heel).applyMatrix4(seat);
    applyRig('leg', FOOT_RIG, pose, BALL, ball).applyMatrix4(seat);
    return Math.abs(heel.y - ball.y - lift);
  };
  for (let iter = 0; iter < 6; iter++) {
    ik = twoBoneIK(root, ankle, FIGURE.thigh, FIGURE.shin, hint, true);
    limbMatrix(IDENTITY, root.x, root.y, ik.swing, ik.abduct, ik.roll, local, root.z);
    seat.multiplyMatrices(body, local);
    pose[0] = ik.bend;
    // The ankle angle that levels the sole in seat space (the foot turns in one plane), coarse then fine.
    let best = Infinity;
    for (let a = -1.2; a <= 1.2; a += 0.04) { const e = tilt(a); if (e < best) { best = e; angle = a; } }
    const a0 = angle;
    for (let a = a0 - 0.04; a <= a0 + 0.04; a += 0.004) { const e = tilt(a); if (e < best) { best = e; angle = a; } }
    pose[1] = angle;
    applyRig('leg', FOOT_RIG, pose, BALL, ball).applyMatrix4(local);
    ankle.add(ball.subVectors(target, ball));
  }
  ik = twoBoneIK(root, ankle, FIGURE.thigh, FIGURE.shin, hint, true);
  return {
    angles: [ik.swing, ik.abduct, ik.roll, ik.bend, angle] as LegAngles,
    matrix: limbMatrix(body, root.x, root.y, ik.swing, ik.abduct, ik.roll, new THREE.Matrix4(), root.z),
    pose: [ik.bend, angle, 0, 0],
  };
}

/**
 * Solves a seated person of a given build in a seat (seat space: the bike's frame, or the car seat's): everything
 * but the head is fixed for the ride. game.ts can seat the player the same way from the angles.
 */
export function solveSeat(kind: SeatKind, style: FigureStyle): SeatPose {
  const spec = SEATS[kind];
  const s = spec.scale, [w, h] = seatBuild(kind, style);
  const body = new THREE.Matrix4().compose(new THREE.Vector3(...spec.hip), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spec.lean), new THREE.Vector3(s * w, s * h, s * w))
    .multiply(new THREE.Matrix4().makeTranslation(0, -FIGURE.hipY, 0));
  const inv = body.clone().invert();
  // Hints are directions: undo only the lean.
  const unlean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -spec.lean);
  // Seat specs are given per x sign (+1 is +x); a side's limbs hang at sideX(side).
  const hint = (v: Vec3, side: number) => new THREE.Vector3(sideX(side) * v[0], v[1], v[2]).applyQuaternion(unlean);
  const legs = ([-1, 1] as const).map((side) => plantFoot(body, inv, side, spec.foot(sideX(side) as 1 | -1), hint(spec.knee, side)));
  const arms = ([-1, 1] as const).map((side) => {
    if (spec.grip) {
      const [point, along] = spec.grip(sideX(side) as 1 | -1);
      const key = `${kind}:${side}`;
      const r = reachGrip(body, inv, side, style.shoulderX, point, along, hint(spec.elbow, side), spec.hand, 0, gripFit.get(key) ?? null);
      if (!gripFit.has(key)) gripFit.set(key, r.fit);
      return r;
    }
    // A passenger's hands rest on the thighs, just behind the knees.
    const knee = new THREE.Vector3(sideX(side) * FIGURE.hipX, FIGURE.hipY, 0).lerp(new THREE.Vector3(0, -FIGURE.thigh, 0).applyMatrix4(legs[side < 0 ? 0 : 1].matrix).applyMatrix4(inv), 0.78);
    const rest = knee.add(new THREE.Vector3(sideX(side) * 0.02, 0.1, 0)).applyMatrix4(body);
    return reachGrip(body, inv, side, style.shoulderX, rest, new THREE.Vector3(0, 0, 1), hint([0.6, -0.4, -0.5], side), HAND.RELAXED, 0.25, [0.7, 0]);
  });
  let down: LegAngles | null = null;
  if (kind in BOARD || kind in PEG) {
    // The road under the left foot, in the frame of a bike tipped onto that foot; the knee opens outward, away
    // from the side panel.
    const ground = new THREE.Vector3(...FOOT_DOWN).applyAxisAngle(new THREE.Vector3(0, 0, 1), FOOT_DOWN_TILT);
    down = plantFoot(body, inv, -1, ground, hint([0.75, 0.2, 1], -1), 0.06).angles;
  }
  return {
    body, pitch: 0.08 - spec.lean,
    arm: [arms[0].matrix, arms[1].matrix], armPose: [arms[0].pose, arms[1].pose], armAngles: [arms[0].angles, arms[1].angles],
    legAngles: [legs[0].angles, legs[1].angles],
    leg: [legs[0].matrix, legs[1].matrix], legPose: [legs[0].pose, legs[1].pose],
    rest: legs[0].angles, down,
  };
}

/**
 * How a person looks sitting astride: a rider's wrap skirt (váy chống nắng) is drawn as the cloth wrapped round
 * the legs, since the skirt panels hang from the hips and the seated thighs would run through them.
 */
function seatedStyle(style: FigureStyle): FigureStyle {
  if (!(style.torso & TORSO.SKIRT)) return style;
  return { ...style, torso: style.torso & ~TORSO.SKIRT, colors: { ...style.colors, thigh: style.colors.pants, shin: style.colors.pants } };
}

/** The build a seat is solved for: width and height (capped under a roof) rounded to 2%, so poses can be shared. */
function seatBuild(kind: SeatKind, style: FigureStyle) {
  const q = (x: number) => Math.round(x * 50) / 50;
  return [q(style.width), q(Math.min(style.height, SEATS[kind].maxHeight))];
}
const solved = new Map<string, SeatPose>();
/** A seat's pose for a build, solved once and shared by everyone of that build in that kind of seat. */
function seatPose(kind: SeatKind, style: FigureStyle) {
  const [w, h] = seatBuild(kind, style);
  const key = `${kind}|${w}|${h}|${style.shoulderX}`;
  let pose = solved.get(key);
  if (!pose) { pose = solveSeat(kind, style); solved.set(key, pose); }
  return pose;
}
/** Whether a seat's pose is already solved (new ones cost a millisecond or two each). */
const isSolved = (kind: SeatKind, style: FigureStyle) => { const [w, h] = seatBuild(kind, style); return solved.has(`${kind}|${w}|${h}|${style.shoulderX}`); };

function angleLerp(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}


// ---- The lane network on the live road graph --------------------------------------------------------------------

/** A travel state: an edge driven one way (edge * 2, plus 1 when driven from node b to node a). */
export const stateOf = (edge: number, dir: number) => edge * 2 + (dir > 0 ? 0 : 1);
const dirOfState = (k: number): 1 | -1 => (k & 1 ? -1 : 1);
type Use = 'car' | 'moto';
const laneUseOf = (kind: CarKind): Use => (kind === 'moto' ? 'moto' : 'car');
/** Body half-width and half-length a kind's connectors are laid out for. */
const BODY: Record<Use, [number, number]> = { car: [CAR_HALF_WIDTH, CAR_HALF_LENGTH], moto: [0.4, 1.0] };
/** Sideways acceleration (m/s²) traffic accepts through a node. */
const GRIP: Record<Use, number> = { car: 3.2, moto: 4.0 };
/** A body keeps this far inside the edge of the asphalt. */
const KERB_CLEAR = 0.15;

/**
 * A way through a node: from a lane of one travel state to a lane of the next, leaving the in-edge at arc `sIn` and
 * joining the out-edge at arc `sOut` (arc lengths from each edge's node a), `latOut` metres right of the out-edge's
 * centre line. Turning, its path is a quadratic corner between the two lane lines, as wide as the body allows on the
 * asphalt (a tight right turn swings out and ends wider than its lane, then eases back in); straight on, an ease from
 * one lane line to the other; a U-turn, a half circle across the road.
 */
export type Connector = {
  id: number; node: number; from: number; to: number; inLane: number; outLane: number;
  sIn: number; sOut: number; latOut: number;
  /** -1 left, 0 straight on, 1 right, 2 back the way it came. */
  turn: number;
  /** The path (x,z pairs), arc length at each point, and its length. */
  pts: Float64Array; cum: Float64Array; len: number;
  /** Comfortable speed through it (m/s). */
  vmax: number;
  /** How far before the node, along the in-edge, it starts. */
  before: number;
  /** Half width of the bodies it is laid out for (cars or motorbikes). */
  hw: number;
};

/** Distance from (x, z) to a polyline (x,z pairs). */
function polylineDistance(p: readonly number[], x: number, z: number) {
  let best = Infinity;
  for (let k = 0; k + 3 < p.length; k += 2) {
    const ax = p[k], az = p[k + 1], dx = p[k + 2] - ax, dz = p[k + 3] - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const ex = x - ax - dx * t, ez = z - az - dz * t, d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
/** Where a vehicle `lat` metres right of an edge's centre line is at arc s, driving `dir`, and its heading. */
function laneAt(roads: RoadGraph, e: RoadEdge, s: number, dir: number, lat: number) {
  const p = roads.pointAt(e, s), hx = p.hx * dir, hz = p.hz * dir;
  return { x: p.x - hz * lat, z: p.z + hx * lat, hx, hz };
}

export type LaneNet = ReturnType<typeof createLaneNet>;
/**
 * Everything traffic derives from the live roads: each travel state's lanes for cars and motorbikes, where it can go
 * at its far node and how it turns there, which arms of a junction without lights are the main road, the
 * connectors (built when first needed, then shared), which connectors cross, and which states are open now: those
 * in the largest strongly connected part of the network once the closed streets (and those about to close) are
 * left out, so traffic never turns into a dead end or a street it could not leave.
 */
export function createLaneNet(world: WorldRoads) {
  const roads = world.roads, edges = roads.edges, nodes = roads.nodes, S = edges.length * 2;
  const armOf = new Int32Array(edges.length * 2).fill(-1);
  nodes.forEach((n) => n.arms.forEach((a, i) => { armOf[a.edge * 2 + a.end] = i; }));
  const arrival = (k: number) => (dirOfState(k) > 0 ? edges[k >> 1].b : edges[k >> 1].a);
  const departure = (k: number) => (dirOfState(k) > 0 ? edges[k >> 1].a : edges[k >> 1].b);
  /** The arm a state reaches its far node along, and the arm it leaves its near node by. */
  const inArm = (k: number) => nodes[arrival(k)].arms[armOf[(k >> 1) * 2 + (dirOfState(k) > 0 ? 1 : 0)]];
  const outArm = (k: number) => nodes[departure(k)].arms[armOf[(k >> 1) * 2 + (dirOfState(k) > 0 ? 0 : 1)]];
  const lanesOf = (k: number): Lane[] => (dirOfState(k) > 0 ? edges[k >> 1].fwd : edges[k >> 1].back);
  /** Lane indices a kind may use in a state, from the centre line out to the curb. */
  const laneLists: Record<Use, number[][]> = { car: [], moto: [] };
  for (let k = 0; k < S; k++) {
    for (const use of ['car', 'moto'] as Use[]) {
      const list: number[] = [];
      lanesOf(k).forEach((l, i) => { if (l.use === use || l.use === 'any') list.push(i); });
      laneLists[use].push(list.sort((a, b) => lanesOf(k)[a].off - lanesOf(k)[b].off));
    }
  }
  const lanesFor = (k: number, use: Use) => laneLists[use][k];
  /** States leaving each state's far node (never straight back along itself). */
  const exits: number[][] = [];
  for (let k = 0; k < S; k++) exits.push(nodes[arrival(k)].arms.map((a) => stateOf(a.edge, a.end === 0 ? 1 : -1)).filter((o) => o !== (k ^ 1)));
  /** -1 left, 0 straight on, 1 right, 2 back. */
  function turnOf(from: number, to: number) {
    if (to === (from ^ 1)) return 2;
    const a = inArm(from), b = outArm(to), hx = -a.hx, hz = -a.hz, dot = hx * b.hx + hz * b.hz;
    if (dot > 0.75) return 0;
    if (dot < -0.97) return 2;
    return hx * b.hz - hz * b.hx > 0 ? 1 : -1;
  }
  /** A junction: three or more roads (not a fence end). */
  const isJunction = (n: RoadNode) => n.arms.length >= 3 && n.control !== 'fence-end';
  /**
   * The main road through each junction without lights: the pair of arms most nearly opposite, ranked by class and
   * width, a street running on under one name preferred; any bigger road joining it is main road too. Where no two
   * arms are opposite, the biggest roads are.
   */
  const rank = (e: RoadEdge) => (e.cls === 'R1' ? 200 : e.cls === 'R2' ? 100 : 0) + e.half + (e.traffic ? 50 : 0);
  const major = nodes.map((n) => {
    const m = new Uint8Array(n.arms.length);
    if (!isJunction(n)) return m.fill(1);
    let bi = -1, bj = -1, best = -Infinity;
    for (let i = 0; i < n.arms.length; i++) {
      for (let j = i + 1; j < n.arms.length; j++) {
        const a = n.arms[i], b = n.arms[j], dot = a.hx * b.hx + a.hz * b.hz;
        if (dot > -0.7) continue;
        const ea = edges[a.edge], eb = edges[b.edge];
        const score = Math.min(rank(ea), rank(eb)) * 2 + (ea.name === eb.name ? 50 : 0) - dot * 10;
        if (score > best) { best = score; bi = i; bj = j; }
      }
    }
    if (bi >= 0) {
      m[bi] = m[bj] = 1;
      const floor = Math.min(rank(edges[n.arms[bi].edge]), rank(edges[n.arms[bj].edge]));
      n.arms.forEach((a, i) => { if (rank(edges[a.edge]) > floor + 20) m[i] = 1; });
    } else {
      const top = Math.max(...n.arms.map((a) => rank(edges[a.edge])));
      n.arms.forEach((a, i) => { if (rank(edges[a.edge]) >= top - 1e-6) m[i] = 1; });
    }
    return m;
  });
  /** Whether a state reaches its far node on the main road (always, at a node with lights or none to give way at). */
  const onMajor = (k: number) => major[arrival(k)][armOf[(k >> 1) * 2 + (dirOfState(k) > 0 ? 1 : 0)]] === 1;
  /** The asphalt round each node: its roads (not hẻm) as edges whose centre lines a body must stay within. */
  const carriage = nodes.map((n) => [...new Set(n.arms.map((a) => a.edge))].filter((e) => edges[e].cls !== 'hem' || n.arms.every((a) => edges[a.edge].cls === 'hem')));
  const onCarriage = (list: number[], x: number, z: number) => {
    for (const id of list) { const e = edges[id]; if (polylineDistance(e.pts, x, z) < e.half - KERB_CLEAR) return true; }
    return false;
  };

  // ---- Connectors ----
  let ids = 0;
  const cache = new Map<number, Connector>();
  /** Off-asphalt body points along a path (x,z pairs with headings), counting each bad sample once. */
  function offAsphalt(list: number[], pts: number[], hw: number, hl: number) {
    let bad = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = Math.min(pts.length - 2, i + 2), k = Math.max(0, i - 2);
      let hx = pts[j] - pts[k], hz = pts[j + 1] - pts[k + 1];
      const l = Math.hypot(hx, hz) || 1;
      hx /= l; hz /= l;
      const x = pts[i], z = pts[i + 1], ax = hl * 0.75, rx = -hz * hw, rz = hx * hw;
      if (!onCarriage(list, x + rx, z + rz) || !onCarriage(list, x - rx, z - rz)
        || !onCarriage(list, x + hx * ax + rx, z + hz * ax + rz) || !onCarriage(list, x + hx * ax - rx, z + hz * ax - rz)
        || !onCarriage(list, x - hx * ax + rx, z - hz * ax + rz) || !onCarriage(list, x - hx * ax - rx, z - hz * ax - rz)) bad++;
    }
    return bad;
  }
  function make(node: number, from: number, inLane: number, to: number, outLane: number, turn: number, pts: number[], sIn: number, sOut: number, latOut: number, before: number, use: Use): Connector {
    const n = pts.length / 2, cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    // Tightest radius along it, from the turn between successive chords.
    let rmin = Infinity;
    for (let i = 1; i + 1 < n; i++) {
      const ax = pts[i * 2] - pts[i * 2 - 2], az = pts[i * 2 + 1] - pts[i * 2 - 1], bx = pts[i * 2 + 2] - pts[i * 2], bz = pts[i * 2 + 3] - pts[i * 2 + 1];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la < 1e-6 || lb < 1e-6) continue;
      const ang = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
      if (ang > 1e-4) rmin = Math.min(rmin, ((la + lb) / 2) / ang);
    }
    const vmax = Math.max(2.2, Math.min(16, Math.sqrt(GRIP[use] * rmin)));
    return { id: ids++, node, from, to, inLane, outLane, sIn, sOut, latOut, turn, pts: Float64Array.from(pts), cum, len: cum[n - 1], vmax, before, hw: BODY[use][0] };
  }
  function build(from: number, inLane: number, to: number, outLane: number, use: Use): Connector {
    const e1 = edges[from >> 1], d1 = dirOfState(from), e2 = edges[to >> 1], d2 = dirOfState(to);
    const node = arrival(from), n = nodes[node], L1 = lanesOf(from)[inLane], L2 = lanesOf(to)[outLane];
    const turn = turnOf(from, to), [hw, hl] = BODY[use], a1 = inArm(from), a2 = outArm(to), junction = isJunction(n);
    const room1 = Math.max(0.4, e1.len * 0.48), room2 = Math.max(0.4, e2.len * 0.48);
    const sAt1 = (t: number) => (d1 > 0 ? e1.len - t : t), sAt2 = (u: number) => (d2 > 0 ? u : e2.len - u);
    const at1 = (t: number, lat: number) => laneAt(roads, e1, sAt1(t), d1, lat), at2 = (u: number, lat: number) => laneAt(roads, e2, sAt2(u), d2, lat);
    const list = carriage[node];
    if (turn === 2) {
      // Round across the road in a half circle, short of the node (at a dead end, short of its barrier).
      const t = Math.min(room1, Math.max(junction ? a1.setback : 0, 5 + (L1.off + L2.off) / 2));
      const A = at1(t, L1.off), B = at2(t, L2.off), k = (4 / 3) * (Math.hypot(B.x - A.x, B.z - A.z) / 2), pts: number[] = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16, v = 1 - u, b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
        pts.push(b0 * A.x + b1 * (A.x + A.hx * k) + b2 * (B.x - B.hx * k) + b3 * B.x, b0 * A.z + b1 * (A.z + A.hz * k) + b2 * (B.z - B.hz * k) + b3 * B.z);
      }
      return make(node, from, inLane, to, outLane, turn, pts, sAt1(t), sAt2(t), L2.off, t, use);
    }
    // How far back along the in-edge it may start (the stop line at a junction) and on along the out-edge it may end.
    const back = junction ? Math.min(a1.setback, room1) : Math.min(turn === 0 ? 3 : 9, room1);
    const on = junction ? Math.min(Math.max(a2.setback, 6), room2) : Math.min(turn === 0 ? 3 : 9, room2);
    if (turn === 0) {
      const A = at1(back, L1.off), B = at2(on, L2.off), D = Math.hypot(B.x - A.x, B.z - A.z) / 3, pts: number[] = [];
      const steps = Math.max(2, Math.ceil((D * 3) / 1.5));
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, v = 1 - u, b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
        pts.push(b0 * A.x + b1 * (A.x + A.hx * D) + b2 * (B.x - B.hx * D) + b3 * B.x, b0 * A.z + b1 * (A.z + A.hz * D) + b2 * (B.z - B.hz * D) + b3 * B.z);
      }
      return make(node, from, inLane, to, outLane, turn, pts, sAt1(back), sAt2(on), L2.off, back, use);
    }
    // A turn: the quadratic corner between the lane lines, as wide as fits on the asphalt. A right turn round a tight
    // kerb may also end nearer the centre line than its lane (it swings out); a left turn either side of its lane.
    const maxLat = e2.half - hw - KERB_CLEAR - 0.1, minLat = Math.min(L2.off, hw + 0.3);
    const lats = [L2.off];
    for (let d = 0.6; d <= 2.4 + 1e-9; d += 0.6) {
      for (const l of turn > 0 ? [L2.off - d] : [L2.off + d, L2.off - d]) if (l <= maxLat && l >= minLat) lats.push(l);
    }
    /** Tightest radius of a sampled path. */
    const radius = (pts: number[]) => {
      let r = Infinity;
      for (let i = 2; i + 3 < pts.length; i += 2) {
        const ax = pts[i] - pts[i - 2], az = pts[i + 1] - pts[i - 1], bx = pts[i + 2] - pts[i], bz = pts[i + 3] - pts[i + 1];
        const ang = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
        if (ang > 1e-4) r = Math.min(r, (Math.hypot(ax, az) + Math.hypot(bx, bz)) / 2 / ang);
      }
      return r;
    };
    let best: { pts: number[]; t: number; u: number; lat: number; bad: number; score: number } | null = null;
    for (const lat of lats) {
      // Past a valid corner that keeps the lane, a wider swing has to earn its place (a much rounder corner).
      if (best && best.bad === 0 && Math.abs(lat - L2.off) > 1.25) break;
      for (const f of [1, 0.82, 0.66, 0.52, 0.4, 0.3]) {
        const t = Math.max(0.3, back * f), u = Math.max(0.3, on * f);
        const A = at1(t, L1.off), B = at2(u, lat);
        // Where the two lane lines meet: ahead of A along its heading, before B along its own.
        const c = A.hx * B.hz - A.hz * B.hx;
        if (Math.abs(c) < 1e-6) continue;
        const v = ((B.x - A.x) * B.hz - (B.z - A.z) * B.hx) / c, w = -((B.x - A.x) * A.hz - (B.z - A.z) * A.hx) / c;
        if (!(v > 0.15 && w > 0.15)) continue;
        const Cx = A.x + A.hx * v, Cz = A.z + A.hz * v, steps = Math.max(6, Math.ceil((v + w) / 0.6)), pts: number[] = [];
        for (let i = 0; i <= steps; i++) {
          const q = i / steps, r = 1 - q;
          pts.push(r * r * A.x + 2 * q * r * Cx + q * q * B.x, r * r * A.z + 2 * q * r * Cz + q * q * B.z);
        }
        const bad = offAsphalt(list, pts, hw, hl);
        // The roundest corner on the asphalt, a little against leaving the lane.
        const score = Math.sqrt(Math.min(radius(pts), 60)) - 0.6 * Math.abs(lat - L2.off);
        if (!best || bad < best.bad || (bad === 0 && best.bad === 0 && score > best.score)) best = { pts, t, u, lat, bad, score };
        // The first that fits at this offset is its roundest.
        if (bad === 0) break;
      }
    }
    // Lines that never meet ahead (a hairpin): a straight ease, as on.
    const A = at1(back, L1.off), B = at2(on, L2.off);
    const pick = best ?? { pts: [A.x, A.z, (A.x + B.x) / 2, (A.z + B.z) / 2, B.x, B.z], t: back, u: on, lat: L2.off, bad: 0, score: 0 };
    return make(node, from, inLane, to, outLane, turn, pick.pts, sAt1(pick.t), sAt2(pick.u), pick.lat, pick.t, use);
  }
  /** The connector from lane `inLane` of state `from` to lane `outLane` of state `to` (built once, then shared). */
  function connector(from: number, inLane: number, to: number, outLane: number, use: Use) {
    const key = (((from * 4 + inLane) * S + to) * 4 + outLane) * 2 + (use === 'moto' ? 1 : 0);
    let c = cache.get(key);
    if (!c) cache.set(key, (c = build(from, inLane, to, outLane, use)));
    return c;
  }
  /** Whether two connectors through the same node cross or come within two bodies' width of each other. */
  const crossings = new Map<number, boolean>();
  function conflicts(a: Connector, b: Connector) {
    if (a === b || a.node !== b.node) return false;
    // Following one another out of the same lane is queueing, not crossing.
    if (a.from === b.from && a.inLane === b.inLane) return false;
    const key = a.id < b.id ? a.id * 1048576 + b.id : b.id * 1048576 + a.id;
    let hit = crossings.get(key);
    if (hit === undefined) {
      hit = false;
      // Converging on the same lane is a conflict; leaving side by side in different lanes is not.
      const clear = a.hw + b.hw + 0.35;
      for (let i = 0; i < a.pts.length && !hit; i += 2) {
        for (let j = 0; j < b.pts.length; j += 2) if (Math.hypot(a.pts[i] - b.pts[j], a.pts[i + 1] - b.pts[j + 1]) < clear) { hit = true; break; }
      }
      crossings.set(key, hit);
    }
    return hit;
  }

  // ---- Which states are open now ----
  const base = new Uint8Array(S);
  for (let k = 0; k < S; k++) base[k] = edges[k >> 1].traffic && !edges[k >> 1].closed && lanesOf(k).length ? 1 : 0;
  /** Edges with closing hours. */
  const timed = world.edges.flatMap((info, i) => (info.closed ? [i] : []));
  let openKey = '\u0000', open = new Uint8Array(S);
  /** Closed now, or closing within `ahead` game hours (traffic stays out of a street about to close). */
  const closedAt = (edge: number, hours: number, ahead = 0) => hoursUntil(world.edges[edge].closed, hours) <= ahead;
  /** Marks the strongly connected sets of states among those `ok` that traffic drives (Tarjan, iteratively). */
  function largest(ok: Uint8Array) {
    const index = new Int32Array(S).fill(-1), low = new Int32Array(S), on = new Uint8Array(S), comp = new Int32Array(S).fill(-1);
    const stack: number[] = [], work: number[] = [], next: number[] = [];
    let counter = 0, comps = 0;
    const sizes: number[] = [];
    for (let root = 0; root < S; root++) {
      if (!ok[root] || index[root] >= 0) continue;
      work.push(root); next.push(0);
      index[root] = low[root] = counter++; stack.push(root); on[root] = 1;
      while (work.length) {
        const v = work[work.length - 1], i = next[next.length - 1], out = exits[v];
        if (i < out.length) {
          next[next.length - 1]++;
          const w = out[i];
          if (!ok[w]) continue;
          if (index[w] < 0) { index[w] = low[w] = counter++; stack.push(w); on[w] = 1; work.push(w); next.push(0); }
          else if (on[w]) low[v] = Math.min(low[v], index[w]);
          continue;
        }
        work.pop(); next.pop();
        if (work.length) { const u = work[work.length - 1]; low[u] = Math.min(low[u], low[v]); }
        if (low[v] === index[v]) {
          let size = 0, w: number;
          do { w = stack.pop()!; on[w] = 0; comp[w] = comps; size++; } while (w !== v);
          sizes.push(size); comps++;
        }
      }
    }
    // The largest set, and every other one big enough to be a district of its own (Thủ Thiêm, reached only by the đò
    // ngang): no lane joins two sets, so traffic never crosses between them, and it spawns only round the player.
    let big = -1;
    sizes.forEach((s, c) => { if (big < 0 || s > sizes[big]) big = c; });
    const out = new Uint8Array(S);
    for (let k = 0; k < S; k++) out[k] = comp[k] >= 0 && (comp[k] === big || sizes[comp[k]] >= MIN_OPEN) ? 1 : 0;
    return out;
  }
  /** Brings the open set up to the hour (rebuilt only when a street opens or closes). */
  function refresh(hours: number, ahead: number) {
    const shut = timed.filter((e) => closedAt(e, hours, ahead));
    const key = shut.join(',');
    if (key === openKey) return;
    openKey = key;
    const ok = base.slice();
    for (const e of shut) ok[e * 2] = ok[e * 2 + 1] = 0;
    open = largest(ok);
  }
  refresh(12, 0);
  /**
   * The way out for a vehicle on a state outside the open network (a street that is closing, or closed round it, a
   * dead end): the exit that starts the shortest way (in nodes) back into it, through any street a car can drive
   * (closed ones included: it is already inside). -1 when there is none.
   */
  const outs = new Map<number, number>();
  let outsKey = '';
  function wayOut(k: number, use: Use) {
    if (outsKey !== openKey) { outs.clear(); outsKey = openKey; }
    const key = k * 2 + (use === 'moto' ? 1 : 0);
    const hit = outs.get(key);
    if (hit !== undefined) return hit;
    const first = new Map<number, number>(), queue: number[] = [];
    for (const o of exits[k]) if (base[o] && lanesFor(o, use).length && !first.has(o)) { first.set(o, o); queue.push(o); }
    let found = -1;
    for (let i = 0; i < queue.length && found < 0; i++) {
      const v = queue[i];
      if (open[v]) { found = first.get(v)!; break; }
      for (const w of exits[v]) if (base[w] && lanesFor(w, use).length && !first.has(w)) { first.set(w, first.get(v)!); queue.push(w); }
    }
    outs.set(key, found);
    return found;
  }

  /** Whether a body (centre, heading, half width and length) stands on the asphalt round a node. */
  function fits(node: number, x: number, z: number, hx: number, hz: number, hw: number, hl: number) {
    const list = carriage[node], rx = -hz * hw, rz = hx * hw, ax = hx * hl * 0.85, az = hz * hl * 0.85;
    return onCarriage(list, x + ax + rx, z + az + rz) && onCarriage(list, x + ax - rx, z + az - rz) && onCarriage(list, x - ax + rx, z - az + rz) && onCarriage(list, x - ax - rx, z - az - rz);
  }

  return {
    world, roads, S, exits, arrival, departure, inArm, outArm, lanesOf, lanesFor, turnOf, isJunction, onMajor, connector, conflicts, refresh, closedAt, wayOut, fits,
    /** Whether a state is open (in the connected network, its street not closed or about to close). */
    open: (k: number) => open[k] === 1,
    /** Whether a state carries traffic at all (whatever the hour). */
    drivable: (k: number) => base[k] === 1,
  };
}
const laneNets = new Map<number, LaneNet>();
/** The lane network of the live roads (rebuilt when the wiring hands over a new map). */
export function laneNet(): LaneNet {
  const v = worldVersion();
  let net = laneNets.get(v);
  if (!net) { laneNets.clear(); laneNets.set(v, (net = createLaneNet(worldRoads()))); }
  return net;
}

/**
 * Whether a point is on a carriageway of the live roads (asphalt of a road or a hẻm, junction boxes included as the
 * roads crossing them).
 */
export function onAsphalt(x: number, z: number) {
  return !!worldRoads().roads.edgeAt(x, z);
}

/** Waypoints along road centre lines from one point to another (the quickest way for a car), ending on the road nearest the target. */
function roadRoute(fromX: number, fromZ: number, toX: number, toZ: number): Point[] {
  const roads = worldRoads().roads;
  // Both ends on the nearest road a car can drive (not a hẻm beside them).
  const drivable = (e: RoadEdge) => e.traffic && !e.closed && e.fwd.length + e.back.length > 0 && e.cls !== 'hem';
  const a = roads.nearestEdge(fromX, fromZ, 80, drivable), b = roads.nearestEdge(toX, toZ, 120, drivable);
  if (!a || !b) return [{ x: toX, z: toZ }];
  const r = roads.route(a.x, a.z, b.x, b.z, { use: 'car', snap: 1 });
  if (!r) return [{ x: toX, z: toZ }];
  // Ends on the road nearest the target (the cruiser stops there; its crew walks the rest).
  const out = r.points.slice(1).map((p) => ({ x: p.x, z: p.z }));
  const first = r.points[0];
  if (Math.hypot(first.x - fromX, first.z - fromZ) > 1.5) out.unshift({ x: first.x, z: first.z });
  return out;
}

/**
 * Parked vehicles are full entities within PROMOTE metres of the player (and wherever something is about to hit them)
 * and go back to being only drawn beyond DEMOTE; drawn ones still block people and traffic, stop bullets and cast
 * their own soft shadow (the game's blob shadows are kept for the live ones and the crowd).
 */
const PROMOTE = 10, DEMOTE = 16;
/** Parked vehicles' soft shadows are drawn out to this far from the camera. */
const SHADOW_FAR = 90;
/** Parked vehicles are drawn up to DRAW_FAR from the camera, as low-poly boxes beyond LOD_NEAR. */
const LOD_NEAR = 45, DRAW_FAR = 230;
/** A spot changes hands only unseen beyond FLIP_HIDDEN metres from the player, or anywhere beyond FLIP_ANY (design-real 4.2). */
const FLIP_HIDDEN = 60, FLIP_ANY = 120;
/** Tow thresholds: seconds standing on the asphalt (design-real 4.8), and how long the player's last vehicle may sit unseen. */
const TOW = { owned: 180, wanted: 30, loose: 240, leftover: 90 } as const, UNSEEN_TOW = 600;
/** Impound fines (thousands of đồng). */
const FEE = { moto: 150, car: 500 } as const;
/** Passing something in the lane: at most this fast, this far clear of it. */
const PASS_SPEED = 4.5, PASS_MARGIN = 0.3;
/** Fleet model slots kept for parked vehicles that are being ridden or are skidding (drawn with lit lamps). */
const SPARE = 4;
/** A parked motorbike leans on its side stand (to its left, +x); a toppled one lies on its right. */
const SIDE_STAND = -0.14, TOPPLED = 1.42;
const SPOT_CELL = 8;
/** How many vehicles the player may own at once (markOwned); older ones become loose and go back to the city. */
const OWNED_KEEP = 3;

/** A low-poly parked motorbike (about 100 triangles) for the far layer; painted panels take the instance colour. */
function lowMoto() {
  const parts = new ModelParts();
  parts.add(new THREE.BoxGeometry(0.4, 0.36, 1.1), { at: [0, 0.55, -0.1], paint: true });
  parts.add(new THREE.BoxGeometry(0.34, 0.12, 0.66), { at: [0, 0.83, -0.25], color: '#2a2624', finish: 'cloth' });
  parts.add(new THREE.BoxGeometry(0.42, 0.72, 0.12), { at: [0, 0.75, 0.5], paint: true });
  parts.add(new THREE.BoxGeometry(0.62, 0.05, 0.05), { at: [0, 1.13, 0.52], color: '#26292b' });
  for (const z of [-0.62, 0.64]) parts.add(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 8), { at: [0, 0.27, z], rot: [0, 0, Math.PI / 2], color: '#1c1f21', finish: 'rubber' });
  return parts.build();
}
/** A low-poly parked car (about 130 triangles). */
function lowCar() {
  const parts = new ModelParts();
  parts.add(new THREE.BoxGeometry(1.74, 0.52, 4.4), { at: [0, 0.56, 0], paint: true });
  parts.add(new THREE.BoxGeometry(1.52, 0.44, 2.1), { at: [0, 1.04, -0.25], color: '#3a4850', finish: 'glass' });
  parts.add(new THREE.BoxGeometry(1.54, 0.06, 2.0), { at: [0, 1.29, -0.25], paint: true });
  for (const sx of [-1, 1]) for (const z of [1.36, -1.32]) parts.add(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 8), { at: [sx * 0.8, 0.31, z], rot: [0, 0, Math.PI / 2], color: '#1c1f21', finish: 'rubber' });
  return parts.build();
}

export function createVehicles(scene: THREE.Scene, worldClear: (x: number, z: number, radius: number) => boolean) {
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const cars: Car[] = [];
  const blank = (index: number, kind: CarKind, role: CarRole): Car => ({
    index, kind, mode: 'off', x: 0, z: 0, yaw: 0, speed: 0, edge: 0, s: 0, dir: 1, lane: 0, laneOff: LANES[kind], conn: null, connS: 0, connLat: 0, plan: null,
    axis: 'x', road: 0, along: 0, waitFor: null, yieldSince: -1, boxAt: 0,
    cruise: 10, driver: null, waypoints: [], routeAt: 0, timer: 0, stuck: 0, health: CAR_HEALTH,
    vx: 0, vz: 0, spin: 0, fallen: false, recoverAt: 0,
    role, plate: plateOf(kind === 'moto', index * 3 + (kind === 'moto' ? 1 : kind === 'police' ? 2 : 0)), lateral: LANES[kind], lateralTarget: LANES[kind],
    wait: null, uturns: 0, still: 0, unseen: 0, home: false, touched: false, impounded: 0,
  });
  for (const kind of ['traffic', 'police', 'moto'] as CarKind[]) for (let i = 0; i < COUNTS[kind]; i++) cars.push(blank(i, kind, kind === 'police' ? 'police' : 'traffic'));
  const fleet = cars.slice();
  const fleetCount = fleet.length;

  // ---- Parked vehicles: one per parking.ts spot, standing in it whenever the spot is taken. ----
  /** Spots something in the world now stands on (generated rows only; the layout's own scooters always fit). */
  const dead = new Uint8Array(SPOTS.length);
  for (const s of SPOTS) {
    const moto = s.vehicle === 'moto';
    const car = blank(CURB_INDEX + s.id, moto ? 'moto' : 'traffic', 'curb');
    const palette = moto ? MOTO_COLORS : s.style === 'taxi' ? TAXI_COLORS : BODY_COLORS;
    Object.assign(car, {
      x: s.x, z: s.z, yaw: s.yaw, style: s.style, paint: palette[Math.floor(s.tint * palette.length)], home: true,
      curb: { spot: s.id, owner: s.lot >= 0 ? 'lot' : 'resident' }, plate: plateOf(moto, 5000 + s.id), health: moto ? MOTO_HEALTH : CAR_HEALTH,
    });
    cars.push(car);
    if (!s.legacy) {
      const [hw, hl] = HALF[car.kind], fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      if (![-1, 0, 1].every((t) => worldClear(s.x + fx * t * (hl - hw), s.z + fz * t * (hl - hw), hw * 0.75))) dead[s.id] = 1;
    }
  }
  const curbCars = cars.slice(fleetCount);
  const ordinal = new Map<Car, number>(cars.map((c, n) => [c, n]));
  /** Spots by 8 m cell. */
  const spotCells = new Map<number, number[]>();
  const cellKey = (ix: number, iz: number) => (ix + 4096) * 8192 + iz + 4096;
  for (const s of SPOTS) {
    const key = cellKey(Math.floor(s.x / SPOT_CELL), Math.floor(s.z / SPOT_CELL));
    let list = spotCells.get(key);
    if (!list) spotCells.set(key, (list = []));
    list.push(s.id);
  }
  const nearIds: number[] = [];
  /** Spot ids in the cells within r (plus a vehicle length) of a point, into nearIds; returns the count. */
  function spotsNear(x: number, z: number, r: number) {
    let n = 0;
    const reach = r + 2.4;
    const ix0 = Math.floor((x - reach) / SPOT_CELL), ix1 = Math.floor((x + reach) / SPOT_CELL), iz0 = Math.floor((z - reach) / SPOT_CELL), iz1 = Math.floor((z + reach) / SPOT_CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const list = spotCells.get(cellKey(ix, iz));
      if (list) for (const id of list) nearIds[n++] = id;
    }
    return n;
  }
  /** Spots by 32 m cell (DRAW_CELL), for drawing: the cells within draw range are a few hundred, not thousands. */
  const DRAW_CELL = 32;
  const drawCells = new Map<number, Int32Array>();
  {
    const lists = new Map<number, number[]>();
    for (const s of SPOTS) {
      const key = cellKey(Math.floor(s.x / DRAW_CELL), Math.floor(s.z / DRAW_CELL));
      let list = lists.get(key);
      if (!list) lists.set(key, (list = []));
      list.push(s.id);
    }
    for (const [k, l] of lists) drawCells.set(k, Int32Array.from(l));
  }

  // The clock the parked vehicles follow (game.ts keeps it in step with setClock; it runs on its own meanwhile).
  let hours = 7.5, day = 0;
  // Zombie mode: no traffic, only abandoned cars (dusty or burnt out) and toppled motorbikes.
  let traffic = true;
  /** Which spots are taken, and which are held taken (somebody sits on the scooter). */
  const occ = new Uint8Array(SPOTS.length), pinned = new Uint8Array(SPOTS.length);
  /** Until when (update's time, seconds) a spot's vehicle is out being ridden by its owner (awayCurb). */
  const awayUntil = new Float64Array(SPOTS.length);
  let now = 0;
  const want = (id: number) => !dead[id] && now >= awayUntil[id] && (pinned[id] === 1 || (traffic ? spotWanted(SPOTS[id], hours, day) : occ[id] === 1));
  for (const s of SPOTS) occ[s.id] = want(s.id) ? 1 : 0;
  /** Parked vehicles that are full entities this frame (the rest are only drawn). */
  const activeCurb: Car[] = [];
  /** Every vehicle that can be touched: the fleet and the active parked ones (rebuilt each frame). */
  const active: Car[] = [];
  const rebuildActive = () => {
    let n = 0;
    for (const car of activeCurb) if (car.mode !== 'off') activeCurb[n++] = car;
    activeCurb.length = n;
    active.length = 0;
    active.push(...fleet, ...activeCurb);
  };

  // ---- Models: one instanced model per body style; each fleet vehicle owns a slot in its style's model. ----
  const { material, lamps } = vehicleMaterial();
  // Parked vehicles have their lamps off.
  const parkedLook = vehicleMaterial();
  parkedLook.lamps.value = 0.02;
  const windows = glassMaterial();
  type Model = { body: THREE.InstancedMesh; glass: THREE.InstancedMesh | null; size: number; used: number };
  const geometries = new Map<string, { body: THREE.BufferGeometry; glass: THREE.BufferGeometry | null }>();
  const geometryOf = (style: CarStyle | MotoStyle, moto: boolean) => {
    let g = geometries.get(style);
    if (!g) geometries.set(style, (g = { body: moto ? motoGeometry(style as MotoStyle) : carGeometry(style as CarStyle), glass: moto ? null : carGlassGeometry(style as CarStyle) }));
    return g;
  };
  const makeModel = (style: CarStyle | MotoStyle, moto: boolean, look: THREE.Material, capacity: number): Model => {
    const g = geometryOf(style, moto);
    return { body: new THREE.InstancedMesh(g.body, look, capacity), glass: g.glass ? new THREE.InstancedMesh(g.glass, windows, capacity) : null, size: 0, used: 0 };
  };
  const models = new Map<string, Model>();
  const modelOf: Model[] = [];
  const slotOf: number[] = [];
  for (const car of fleet) {
    const style = vehicleStyle(car);
    let model = models.get(style);
    if (!model) models.set(style, (model = makeModel(style, car.kind === 'moto', material, fleet.filter((c) => vehicleStyle(c) === style).length + SPARE)));
    modelOf.push(model);
    slotOf.push(model.size++);
  }
  // Parked vehicles: their own models (lamps off), packed each frame with what is in view, and the far layer.
  const curbModels = new Map<string, Model>();
  for (const s of SPOTS) if (!curbModels.has(s.style)) curbModels.set(s.style, makeModel(s.style, s.vehicle === 'moto', parkedLook.material, SPOTS.filter((t) => t.style === s.style).length));
  const lowGeometries = [lowMoto(), lowCar()];
  const far = {
    moto: new THREE.InstancedMesh(lowGeometries[0], parkedLook.material, Math.max(1, SPOTS.filter((s) => s.vehicle === 'moto').length)),
    car: new THREE.InstancedMesh(lowGeometries[1], parkedLook.material, Math.max(1, SPOTS.filter((s) => s.vehicle === 'car').length)),
  };
  // Soft shadows under parked vehicles that are only drawn: the same blob as the game's (effects.ts), one draw.
  const shadowTexture = (() => {
    const size = 64, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2), k = (y * size + x) * 4;
      data[k] = 28; data[k + 1] = 40; data[k + 2] = 34; data[k + 3] = Math.round(255 * 0.45 * Math.max(0, 1 - r));
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  })();
  const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, Math.max(1, SPOTS.length));
  /** Ground under each spot (it never changes). */
  const spotY = SPOTS.map((s) => groundHeight(s.x, s.z));
  const color = new THREE.Color();
  for (const [n, car] of fleet.entries()) modelOf[n].body.setColorAt(slotOf[n], color.set(paintOf(car)));
  for (const m of curbModels.values()) m.body.setColorAt(0, color.set('#ffffff'));
  for (const mesh of Object.values(far)) mesh.setColorAt(0, color.set('#ffffff'));
  const curbMeshes = [...curbModels.values()].flatMap((m) => (m.glass ? [m.body, m.glass] : [m.body]));
  const meshes = [...models.values()].flatMap((m) => (m.glass ? [m.body, m.glass] : [m.body]));
  // Seated people, articulated like the crowd (always at 'lo' detail): motorbike riders, car drivers and the
  // partner in each police cruiser. One person is five instances (body, arms, legs) in four draw calls.
  const carSlots = COUNTS.traffic + COUNTS.police;
  const seats = COUNTS.moto + carSlots + COUNTS.police;
  const batch = (piece: FigurePiece, kind: FigureKind, capacity: number) => new FigureBatch(figureGeometry(piece, 'lo'), figureMaterial(kind), capacity);
  const occupants = { body: batch('body', 'body', seats), armL: batch('armL', 'arm', seats), armR: batch('armR', 'arm', seats), legs: batch('leg', 'leg', seats * 2) };
  const occupantBatches = Object.values(occupants);
  for (const b of occupantBatches) { b.mesh.receiveShadow = true; scene.add(b.mesh); }
  /** Who sits in each seat (a car's index, or cars.length + index for a cruiser's partner): look, palettes and solved pose. */
  type Occupant = { look: RagdollLook; kind: SeatKind; looks: FigurePalettes; pose: SeatPose };
  const seated = new Map<number, Occupant>();
  /** What the camera sees (last frame's) and where it is; null draws everything. */
  let view: THREE.Frustum | null = null;
  const eye = new THREE.Vector3();
  let eyeKnown = false;
  const cross3 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const seatBound = new THREE.Sphere(new THREE.Vector3(), 1.3);
  const headYaw = new Float32Array(cars.length * 2);
  const bodyPose = [0, 0, 0, 0], legPose = [0, 0, 0, 0];
  const bodyMatrix = new THREE.Matrix4(), limb = new THREE.Matrix4();
  let solvesLeft = 0;
  /** An idle glance to one side now and then (radians of head yaw), different for every seat. */
  function glance(key: number, time: number) {
    const phase = time * 0.21 + key * 0.37, k = Math.floor(phase), f = phase - k;
    if (f > 0.32 || hash01(k + 1, key * 7 + 3) > 0.5) return 0;
    return (hash01(k + 1, key * 7 + 4) < 0.5 ? -1 : 1) * (0.35 + 0.45 * hash01(k + 1, key * 7 + 5)) * Math.sin((f / 0.32) * Math.PI);
  }
  /**
   * Draws a seated person in `frame` (the bike's matrix, lean included, or their car seat's): the head turns into
   * the bend and glances about, long hair lifts with the speed, and `down` (0..1) puts a stopped rider's left
   * foot on the road.
   */
  function seat(key: number, look: RagdollLook, kind: SeatKind, frame: THREE.Matrix4, yawRate: number, speed: number, down: number, time: number, dt: number) {
    // Occupants the camera cannot see are not posed or drawn.
    if (view) {
      const e = frame.elements;
      if (!view.intersectsSphere(seatBound.set(seatBound.center.set(e[12], e[13] + 0.7, e[14]), 1.3))) return;
    }
    let o = seated.get(key);
    if (!o || o.look !== look || o.kind !== kind) {
      const style = styleOf(look);
      // A few new IK solves per frame at most (a full street at start-up would otherwise stall a frame); the
      // rest take their seats over the next frames.
      if (!isSolved(kind, style) && solvesLeft-- <= 0) return;
      o = { look, kind, looks: palettesOf(seatedStyle(style)), pose: seatPose(kind, style) };
      seated.set(key, o);
    }
    const p = o.pose;
    const target = THREE.MathUtils.clamp(yawRate * 0.35, -0.6, 0.6) + glance(key, time);
    headYaw[key] = THREE.MathUtils.damp(headYaw[key], target, 6, dt);
    bodyMatrix.multiplyMatrices(frame, p.body);
    bodyPose[0] = headYaw[key];
    bodyPose[1] = p.pitch;
    // A ponytail or long hair lifts a little in the wind.
    bodyPose[3] = swingCode(0, Math.min(0.22, Math.abs(speed) * 0.025) * (1 + 0.15 * Math.sin(time * 9 + key)));
    occupants.body.push(bodyMatrix, o.looks.body, bodyPose);
    occupants.armL.push(limb.multiplyMatrices(frame, p.arm[0]), o.looks.armL, p.armPose[0]);
    occupants.armR.push(limb.multiplyMatrices(frame, p.arm[1]), o.looks.armR, p.armPose[1]);
    if (p.down && down > 0.002) {
      const a = p.rest, b = p.down, mix = (k: number) => a[k] + (b[k] - a[k]) * down;
      limbMatrix(bodyMatrix, sideX(-1) * FIGURE.hipX, FIGURE.hipY, mix(0), mix(1), mix(2), limb);
      legPose[0] = mix(3); legPose[1] = mix(4);
      occupants.legs.push(limb, o.looks.legs, legPose);
    } else occupants.legs.push(limb.multiplyMatrices(frame, p.leg[0]), o.looks.legs, p.legPose[0]);
    occupants.legs.push(limb.multiplyMatrices(frame, p.leg[1]), o.looks.legs, p.legPose[1]);
  }
  const lightGeometry = new THREE.BoxGeometry(0.42, 0.12, 0.28);
  const lightMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lights = new THREE.InstancedMesh(lightGeometry, lightMaterial, COUNTS.police * 2);
  for (let i = 0; i < COUNTS.police * 2; i++) lights.setColorAt(i, color.set('#444444'));
  // Áo mưa cánh dơi: on wet days every rider in traffic wears a bright poncho from the shoulders over the handlebars
  // and the seat (eight triangles in the bike's own frame, so it leans with it). One draw call.
  const ponchoGeometry = (() => {
    const N = [0, 1.53, -0.1], FM = [0, 1.22, 0.8], FL = [-0.5, 1.17, 0.68], FR = [0.5, 1.17, 0.68], ML = [-0.58, 0.9, 0.04], MR = [0.58, 0.9, 0.04];
    const BL = [-0.46, 0.82, -0.6], BR = [0.46, 0.82, -0.6], BM = [0, 0.88, -0.68];
    const tris = [N, FM, FL, N, FR, FM, N, MR, FR, N, BR, MR, N, BM, BR, N, BL, BM, N, ML, BL, N, FL, ML];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    g.computeVertexNormals();
    return g;
  })();
  const ponchoMaterial = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ponchos = new THREE.InstancedMesh(ponchoGeometry, ponchoMaterial, COUNTS.moto);
  const PONCHO_COLORS = ['#2f6fc0', '#e0507a', '#f2c23a', '#7fc9a0'].map((c) => new THREE.Color(c));
  for (let i = 0; i < COUNTS.moto; i++) ponchos.setColorAt(i, PONCHO_COLORS[i % PONCHO_COLORS.length]);
  ponchos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ponchos.frustumCulled = false;
  ponchos.count = 0;
  ponchos.visible = false;
  ponchos.renderOrder = 1;
  scene.add(ponchos);
  /** How wet the streets are (atmosphere rain, 0..1): ponchos come out above 0.3. */
  let wet = 0;
  for (const mesh of [...meshes, ...curbMeshes, far.moto, far.car, lights, shadows]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    if (mesh.instanceColor) { mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor.needsUpdate = true; }
    scene.add(mesh);
  }
  for (const mesh of [...curbMeshes, far.moto, far.car, shadows]) { mesh.count = 0; mesh.visible = false; }
  shadows.receiveShadow = false;
  for (const model of [...models.values(), ...curbModels.values()]) if (model.glass) model.glass.renderOrder = 2;
  const seatMatrix = new THREE.Matrix4();
  const policeRoof = carSpec('police');
  const wrecks = new Map<Car, 'dusty' | 'burnt'>();
  /** Parsed paint colours (dusty in zombie mode), so drawing the parked vehicles parses no colour strings per frame. */
  const paints = new Map<string, THREE.Color>();
  function paintColor(paint: string) {
    const key = traffic ? paint : `${paint}~`;
    let c = paints.get(key);
    if (!c) { c = new THREE.Color(paint); if (!traffic) c.lerp(DUST, 0.45).multiplyScalar(0.8); paints.set(key, c); }
    return c;
  }
  /** Flags an instanced mesh for upload of only its first `count` instances (matrices, and colours if it has them). */
  function uploadUsed(mesh: THREE.InstancedMesh, count: number) {
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, Math.max(1, count) * 16);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(0, Math.max(1, count) * 3);
      mesh.instanceColor.needsUpdate = true;
    }
  }
  function paintOf(car: Car) {
    if (car.paint) return car.paint;
    return car.kind === 'moto' ? MOTO_COLORS[car.index % MOTO_COLORS.length]
      : car.kind === 'police' ? '#f4f4f0'
      : vehicleStyle(car) === 'taxi' ? TAXI_COLORS[car.index % TAXI_COLORS.length] : BODY_COLORS[car.index % BODY_COLORS.length];
  }
  function repaint(car: Car) {
    const n = ordinal.get(car)!;
    if (n >= fleetCount) return;
    const wreck = wrecks.get(car);
    color.set(paintOf(car));
    if (wreck === 'dusty') color.lerp(DUST, 0.45).multiplyScalar(0.8);
    else if (wreck === 'burnt') color.set('#2b2724');
    modelOf[n].body.setColorAt(slotOf[n], color);
    modelOf[n].body.instanceColor!.needsUpdate = true;
  }
  /**
   * A random point on the traffic roads between rMin and rMax of (cx, cz), uniform over their length (edges near the
   * point, each sampled where it lies in the ring): the edge, the arc, the centre-line point and its heading.
   */
  const ringEdges: { edge: RoadEdge; w: number }[] = [];
  function roadPoint(cx: number, cz: number, rMin: number, rMax: number, ok: (e: RoadEdge) => boolean = (e) => e.traffic) {
    const roads = worldRoads().roads;
    ringEdges.length = 0;
    let total = 0;
    for (const h of roads.edgesNear(cx, cz, rMax, ok)) { const w = Math.min(h.edge.len, 2 * rMax); ringEdges.push({ edge: h.edge, w }); total += w; }
    for (let attempt = 0; attempt < 12 && total > 0; attempt++) {
      let pick = random() * total, e = ringEdges[0].edge;
      for (const r of ringEdges) { pick -= r.w; if (pick <= 0) { e = r.edge; break; } }
      const s = random() * e.len, p = roads.pointAt(e, s), d = Math.hypot(p.x - cx, p.z - cz);
      if (d >= rMin && d <= rMax) return { edge: e, s, x: p.x, z: p.z, hx: p.hx, hz: p.hz };
    }
    return null;
  }
  /** Leaves a vehicle abandoned on the roads round (px, pz), often across a lane. */
  function wreck(car: Car, px: number, pz: number) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const at = roadPoint(px, pz, 20, 170);
      if (!at) break;
      const across = (random() - 0.5) * 2 * Math.max(0, at.edge.half - 1);
      const x = at.x - at.hz * across, z = at.z + at.hx * across;
      if (blocked(x, z, 2.8, car) || !worldClear(x, z, 1.2)) continue;
      Object.assign(car, { mode: 'parked', role: 'wreck', x, z, yaw: random() * Math.PI * 2, speed: 0, driver: null, waypoints: [], plan: null, conn: null, stuck: 0, timer: 0 });
      const burnt = car.kind !== 'moto' && random() < 0.35;
      car.health = burnt ? 0 : (car.kind === 'moto' ? MOTO_HEALTH : CAR_HEALTH) * (0.4 + random() * 0.4);
      wrecks.set(car, burnt ? 'burnt' : 'dusty');
      repaint(car);
      return;
    }
    car.mode = 'off';
  }

  const matrix = new THREE.Matrix4();
  const lightMatrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1), scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tilt = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const red = new THREE.Color('#ff2a2a'), blue = new THREE.Color('#2a6bff'), dim = new THREE.Color('#3a3a3a');
  const crossing: Walker[] = [];
  const lean = new Float32Array(cars.length);
  const lastYaw = new Float32Array(cars.length);
  for (const car of curbCars) { lean[ordinal.get(car)!] = car.kind === 'moto' ? SIDE_STAND : 0; lastYaw[ordinal.get(car)!] = car.yaw; }
  /** How far a stopped rider has put a foot down (0..1). */
  const footDown = new Float32Array(cars.length);
  /**
   * Obstacles other systems put in the road (a bus): centre, half sizes across and along, heading. A `follow` one is a
   * vehicle in traffic: queued behind, kept clear of and waited for as it crosses, never passed; the rest are passed.
   */
  const obstacles = new Map<string | number, { x: number; z: number; hx: number; hz: number; yaw: number; follow: boolean; speed: number }>();
  /** The player's vehicles (markOwned), oldest first, and the one they drove last. */
  let owned: Car[] = [];
  let lastCar: Car | null = null;
  const impounds: (Impounded & { car: Car })[] = [];
  let ticket = 0;
  const towed: ((car: Car) => void)[] = [];
  let hornAt = 0;

  /** Whether a circle at (x, z) overlaps a box (centre, heading, half width and length). */
  function boxHit(x: number, z: number, radius: number, cx: number, cz: number, yaw: number, hw: number, hl: number) {
    const dx = x - cx, dz = z - cz;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // Into the box's local frame: local x across it, local z along its nose.
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const nx = THREE.MathUtils.clamp(lx, -hw, hw), nz = THREE.MathUtils.clamp(lz, -hl, hl);
    return (lx - nx) ** 2 + (lz - nz) ** 2 < radius * radius;
  }
  /** True when a circle overlaps any vehicle's footprint (parked ones included) or a registered obstacle, except `exclude`. */
  function blocked(x: number, z: number, radius: number, exclude?: Car | null) {
    for (const car of active) {
      if (car.mode === 'off' || car === exclude) continue;
      const dx = x - car.x, dz = z - car.z;
      if (dx * dx + dz * dz > 16) continue;
      const [hw, hl] = HALF[car.kind];
      if (boxHit(x, z, radius, car.x, car.z, car.yaw, hw, hl)) return true;
    }
    const n = spotsNear(x, z, radius);
    for (let i = 0; i < n; i++) {
      const id = nearIds[i], car = curbCars[id];
      if (!occ[id] || car.mode !== 'off' || !car.home || car === exclude) continue;
      const s = SPOTS[id], [hw, hl] = HALF[car.kind];
      if (Math.abs(x - s.x) < hl + radius + 0.1 && Math.abs(z - s.z) < hl + radius + 0.1 && boxHit(x, z, radius, s.x, s.z, s.yaw, hw, hl)) return true;
    }
    for (const o of obstacles.values()) if (boxHit(x, z, radius, o.x, o.z, o.yaw, o.hx, o.hz)) return true;
    return false;
  }

  /** A ray against a box (local slab test); the entry distance if it enters before `limit` at a height the box covers. */
  function rayBox(origin: THREE.Vector3, dir: THREE.Vector3, cx: number, cz: number, yaw: number, hw: number, hl: number, top: number, limit: number) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ox = origin.x - cx, oz = origin.z - cz;
    const lo0 = ox * c - oz * s, lo1 = ox * s + oz * c, ld0 = dir.x * c - dir.z * s, ld1 = dir.x * s + dir.z * c;
    let enter = 0, exit = limit;
    for (let k = 0; k < 2 && enter <= exit; k++) {
      const o = k ? lo1 : lo0, d = k ? ld1 : ld0, half = k ? hl : hw;
      if (Math.abs(d) < 1e-9) { if (Math.abs(o) > half) enter = Infinity; continue; }
      let t1 = (-half - o) / d, t2 = (half - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      enter = Math.max(enter, t1);
      exit = Math.min(exit, t2);
    }
    if (enter > exit || enter <= 0) return Infinity;
    const y = origin.y + dir.y * enter;
    return y > 0 && y < top ? enter : Infinity;
  }
  /** Nearest vehicle body hit by a ray (bullets stop on cars, parked ones too). */
  function raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
    let best: { car: Car; t: number } | null = null;
    for (const car of active) {
      if (car.mode === 'off') continue;
      const [hw, hl] = HALF[car.kind];
      const t = rayBox(origin, dir, car.x, car.z, car.yaw, hw, hl, car.kind === 'moto' ? 1.9 : 1.75, best ? best.t : maxT);
      if (t < Infinity) best = { car, t };
    }
    // Parked vehicles that are only drawn: the cells along the ray (out to 120 m).
    const reach = Math.min(maxT, best ? best.t : maxT, 120);
    let hit = -1;
    for (let d = 0; d <= reach + SPOT_CELL; d += SPOT_CELL) {
      const n = spotsNear(origin.x + dir.x * Math.min(d, reach), origin.z + dir.z * Math.min(d, reach), SPOT_CELL * 0.5);
      for (let i = 0; i < n; i++) {
        const id = nearIds[i], car = curbCars[id];
        if (!occ[id] || car.mode !== 'off' || !car.home) continue;
        const s = SPOTS[id], [hw, hl] = HALF[car.kind];
        const t = rayBox(origin, dir, s.x, s.z, s.yaw, hw, hl, car.kind === 'moto' ? 1.2 : 1.6, best ? best.t : reach);
        if (t < Infinity) { best = { car, t }; hit = id; }
      }
    }
    if (hit >= 0) promote(hit);
    return best;
  }

  /** Brings a parked vehicle that is only drawn to life as an entity, exactly where it is drawn. */
  function promote(id: number) {
    const car = curbCars[id], s = SPOTS[id], n = fleetCount + id;
    if (car.mode !== 'off' || !car.home || car.impounded) return;
    const fallen = !traffic && car.kind === 'moto' && hash01(id, 31) < 0.5;
    Object.assign(car, { mode: 'parked', x: s.x, z: s.z, yaw: s.yaw, speed: 0, vx: 0, vz: 0, spin: 0, fallen, recoverAt: 0, driver: null });
    lean[n] = car.kind === 'moto' ? (fallen ? TOPPLED : SIDE_STAND) : 0;
    lastYaw[n] = s.yaw;
    activeCurb.push(car);
    if (!active.includes(car)) active.push(car);
  }
  /** Wakes the taken spots around a point (something is about to hit them). */
  function wakeNear(x: number, z: number, r: number) {
    const n = spotsNear(x, z, r);
    for (let i = 0; i < n; i++) {
      const id = nearIds[i];
      if (occ[id] && curbCars[id].mode === 'off' && curbCars[id].home && Math.hypot(SPOTS[id].x - x, SPOTS[id].z - z) < r + 2.4) promote(id);
    }
  }
  /** A parked vehicle back in its spot, upright and whole (its owner fetched it, or it came back from the tow yard). */
  function returnHome(car: Car) {
    const s = SPOTS[car.curb!.spot];
    Object.assign(car, {
      mode: 'off', role: 'curb', x: s.x, z: s.z, yaw: s.yaw, speed: 0, vx: 0, vz: 0, spin: 0, fallen: false, recoverAt: 0, driver: null,
      home: true, touched: false, still: 0, unseen: 0, health: car.kind === 'moto' ? MOTO_HEALTH : CAR_HEALTH,
    });
    car.curb!.owner = s.lot >= 0 ? 'lot' : 'resident';
    owned = owned.filter((c) => c !== car);
    if (lastCar === car) lastCar = null;
  }
  /** Whether the camera sees a point (or, without a camera, whether the player is near it). */
  function sees(x: number, z: number, r: number, fromPlayer: number) {
    if (!view || !eyeKnown) return fromPlayer < FLIP_HIDDEN;
    if (Math.hypot(x - eye.x, z - eye.z) > DRAW_FAR) return false;
    return view.intersectsSphere(sphere.set(sphere.center.set(x, 1, z), r));
  }
  /** A horn from a vehicle near the player, at most every 3 s. */
  function honk(x: number, z: number, time: number, player: Point, long = false) {
    if (time < hornAt || Math.hypot(x - player.x, z - player.z) > 40) return;
    hornAt = time + 3;
    playHorn(long);
  }
  /** A fleet vehicle back in the traffic pool, whole (spawnTraffic puts it on a lane when it is wanted). */
  function backToTraffic(car: Car) {
    Object.assign(car, {
      impounded: 0, mode: 'off', role: 'traffic', speed: 0, vx: 0, vz: 0, spin: 0, fallen: false, recoverAt: 0, driver: null, still: 0, unseen: 0, timer: 0,
      touched: false, health: car.kind === 'moto' ? MOTO_HEALTH : CAR_HEALTH,
    });
  }
  /** The tow truck took it (out of sight): the player's vehicles go to the impound, the rest back where they belong. */
  function tow(car: Car) {
    for (const cb of towed) cb(car);
    car.still = car.unseen = 0;
    if (car.role === 'owned' || car === lastCar) {
      const id = ++ticket;
      impounds.push({ id, car, style: vehicleStyle(car), label: vehicleLabel(car, paintOf(car)), since: hours, fee: car.kind === 'moto' ? FEE.moto : FEE.car });
      owned = owned.filter((c) => c !== car);
      if (car === lastCar) lastCar = null;
      // A fleet vehicle is kept on the impound's list by value: its slot goes straight back to traffic, so towing never
      // thins out the streets, and release() takes the same (kind, index) vehicle back out. A parked one stays in the
      // pound and its spot stays empty.
      if (ordinal.get(car)! < fleetCount) backToTraffic(car);
      else Object.assign(car, { impounded: id, mode: 'off', speed: 0, vx: 0, vz: 0, spin: 0, driver: null });
      return;
    }
    if (car.curb) returnHome(car);
    else Object.assign(car, { mode: 'off', role: 'traffic' });
  }
  /** The player is driving it: it is theirs to lose now (exempt from recycling until towed). */
  function adopt(car: Car) {
    if (car.role === 'traffic' || car.role === 'curb' || car.role === 'wreck') car.role = 'loose';
    car.home = false;
    car.touched = true;
    car.still = car.unseen = 0;
    lastCar = car;
  }

  // ---- Lane traffic on the graph ----
  /** The live roads' lane network; when the wiring hands over a new map, traffic starts afresh on it. */
  let net = laneNet();
  let roads = net.roads;
  /** Traffic keeps out of a street this many game hours before it closes (it has time to drive out). */
  const CLOSE_AHEAD = 30 / SECONDS_PER_HOUR;
  /** Refill traffic never appears in view nearer than this (out of view it may, from 60 m). */
  const POP_IN = 120;

  /** The axis-style fields older checks read (axis, road, along), from the lane state. */
  function syncAxis(car: Car) {
    let p: { x: number; z: number; hx: number; hz: number };
    if (car.conn) {
      // Through a node: the road it came in on until it has turned more than half way, then the one it leaves by.
      const c = car.conn, q = connPoint(c, car.connS), a = net.inArm(c.from), b = net.outArm(c.to);
      const out = q.hx * b.hx + q.hz * b.hz > -(q.hx * a.hx + q.hz * a.hz);
      p = roads.pointAt(roads.edges[(out ? c.to : c.from) >> 1], out ? c.sOut : c.sIn);
      const ax = Math.abs(p.hx) >= Math.abs(p.hz);
      car.axis = ax ? 'x' : 'z';
      car.road = ax ? p.z : p.x;
      car.along = ax ? car.x : car.z;
      return;
    }
    p = roads.pointAt(roads.edges[car.edge], car.s);
    const ax = Math.abs(p.hx) >= Math.abs(p.hz);
    car.axis = ax ? 'x' : 'z';
    car.road = ax ? p.z : p.x;
    car.along = ax ? p.x : p.z;
  }
  /** Puts a vehicle in lane `lane` of state k at arc s, facing its travel. */
  function placeOnLane(car: Car, k: number, lane: number, s: number) {
    const e = roads.edges[k >> 1], L = net.lanesOf(k)[lane];
    Object.assign(car, {
      edge: k >> 1, dir: dirOfState(k), lane, laneOff: L.off, s, conn: null, connS: 0, plan: null, speed: Math.min(car.cruise, e.speed + 1) * 0.6,
      lateral: L.off, lateralTarget: L.off, wait: null, waitFor: null, yieldSince: -1,
    });
    const p = laneAt(roads, e, s, car.dir, L.off);
    car.x = p.x; car.z = p.z; car.yaw = Math.atan2(p.hx, p.hz);
    syncAxis(car);
  }

  /**
   * Traffic edges round the player to spawn on, by length, lanes (a boulevard carries more than a side street) and
   * nearness (kept while the player stays within 12 m).
   */
  const spawnPool = { x: NaN, z: NaN, net: null as LaneNet | null, hours: -1, edges: [] as RoadEdge[], weights: [] as number[], total: 0, laneMetres: 0 };
  function spawnEdges(x: number, z: number) {
    if (spawnPool.net === net && Math.hypot(x - spawnPool.x, z - spawnPool.z) < 12 && Math.abs(spawnPool.hours - hours) < 0.05) return spawnPool;
    Object.assign(spawnPool, { x, z, net, hours, total: 0, laneMetres: 0 });
    spawnPool.edges.length = spawnPool.weights.length = 0;
    for (const h of roads.edgesNear(x, z, TRAFFIC_NEAR, (e) => e.traffic && (net.open(stateOf(e.id, 1)) || net.open(stateOf(e.id, -1))))) {
      const lanes = h.edge.fwd.length + h.edge.back.length;
      // (the nearer streets weigh much more: the traffic the player sees is round them, not out at the edge of the circle)
      const near = 1.5 - h.d / TRAFFIC_NEAR;
      const w = Math.min(h.edge.len, 2 * TRAFFIC_NEAR) * Math.max(2, lanes) * near * near * flowWeight(h.edge, hours);
      spawnPool.edges.push(h.edge); spawnPool.weights.push(w); spawnPool.total += w;
      // Its lanes within reach (a straight edge's chord through the circle).
      spawnPool.laneMetres += Math.min(h.edge.len, 2 * Math.sqrt(Math.max(0, TRAFFIC_NEAR * TRAFFIC_NEAR - h.d * h.d))) * Math.max(1, lanes);
    }
    return spawnPool;
  }
  /**
   * Where the traffic is thicker than its lanes alone say (districts-hcmc): Hàng Xanh's junction jams at the evening
   * rush, the central districts' boulevards are busier than the side streets by day.
   */
  function flowWeight(e: RoadEdge, hour: number) {
    const info = net.world.edges[e.id], h = ((hour % 24) + 24) % 24;
    const m = (e.pts.length >> 2) << 1, mx = e.pts[m], mz = e.pts[m + 1];
    if (h >= 16.5 && h < 19 && Math.abs(mx - HANG_XANH.x) < HANG_XANH.r && Math.abs(mz - HANG_XANH.z) < HANG_XANH.r) return 2.5;
    if ((info?.district === 'D2' || info?.district === 'D3') && e.cls !== 'hem' && h >= 7 && h < 22) return 1.3;
    return 1;
  }
  /** The quality level's fleet cap (setQuality). */
  let level = DEFAULT_LEVEL;
  /**
   * Puts a traffic vehicle on a random lane spot of an open traffic edge at least `minDistance` from a point and
   * within TRAFFIC_NEAR of it (the city is big; traffic is kept where the player is), clear of the junctions (never
   * between a stop line and its crossing). With `hidden`, never in view nearer than POP_IN.
   */
  function spawnTraffic(car: Car, awayX: number, awayZ: number, minDistance: number, hidden = false, attempts = 40) {
    const use = laneUseOf(car.kind), pool = spawnEdges(awayX, awayZ);
    for (let attempt = 0; attempt < attempts && pool.total > 0; attempt++) {
      let pick = random() * pool.total, e = pool.edges[0];
      for (let i = 0; i < pool.edges.length; i++) { pick -= pool.weights[i]; if (pick <= 0) { e = pool.edges[i]; break; } }
      const dir: 1 | -1 = random() < 0.5 ? 1 : -1, k = stateOf(e.id, dir);
      const lanes = net.lanesFor(k, use);
      if (!net.open(k) || !lanes.length) continue;
      // Past the stop line it leaves by, and with room to stop before the next.
      const from = roads.nodes[net.departure(k)], to = roads.nodes[net.arrival(k)];
      const lo = (net.isJunction(from) ? net.outArm(k).setback : 0) + 6, hi = e.len - (net.isJunction(to) ? net.inArm(k).setback : 0) - 10;
      if (hi <= lo) continue;
      const t = lo + random() * (hi - lo), s = dir > 0 ? t : e.len - t, lane = lanes[Math.floor(random() * lanes.length)];
      const p = laneAt(roads, e, s, dir, net.lanesOf(k)[lane].off), d = Math.hypot(p.x - awayX, p.z - awayZ);
      if (d < minDistance || d > TRAFFIC_NEAR) continue;
      if (hidden && d < POP_IN && sees(p.x, p.z, 3, d)) continue;
      car.mode = 'lane';
      Object.assign(car, { vx: 0, vz: 0, spin: 0, fallen: false, recoverAt: 0, role: 'traffic', still: 0, unseen: 0, timer: 0 });
      car.health = car.kind === 'moto' ? MOTO_HEALTH : CAR_HEALTH;
      car.cruise = car.kind === 'moto' ? 7 + random() * 4 : 8.5 + random() * 4;
      const shirt = Math.floor(random() * DRIVER_SHIRTS.length);
      car.driver = car.kind === 'moto' ? riderLook(shirt) : driverLook(shirt);
      car.stuck = 0;
      placeOnLane(car, k, lane, s);
      if (!blocked(car.x, car.z, 2.6, car)) return true;
    }
    car.mode = 'off';
    return false;
  }

  /**
   * What a lane vehicle does at the end of its edge: on into an open street (straight on more often, the wider street
   * more often: traffic keeps to the boulevards), never back the way it came and never into a street it could not leave or one about to close; from the
   * lane that serves the turn (rights from the curb-side lane, lefts from the one by the centre line) into the
   * matching lane. Trapped (a street that has closed, a dead end), any way out; none: it turns round short of the end.
   */
  function planNext(car: Car) {
    const k = stateOf(car.edge, car.dir), use = laneUseOf(car.kind);
    let options = net.exits[k].filter((o) => net.open(o) && net.lanesFor(o, use).length);
    if (!options.length) { const out = net.wayOut(k, use); if (out >= 0) options = [out]; }
    if (!options.length) { car.plan = null; return; }
    const weight = (o: number) => Math.max(1, net.lanesOf(o).length) * (net.turnOf(k, o) === 0 ? 2 : 1);
    let pick = random() * options.reduce((sum, o) => sum + weight(o), 0), to = options[options.length - 1];
    for (const o of options) { pick -= weight(o); if (pick <= 0) { to = o; break; } }
    const turn = net.turnOf(k, to), ins = net.lanesFor(k, use), outs = net.lanesFor(to, use);
    const rank = Math.max(0, ins.indexOf(car.lane));
    const inLane = turn === 1 ? ins[ins.length - 1] : turn === -1 ? ins[0] : ins[Math.min(rank, ins.length - 1)];
    const outLane = turn === 1 ? outs[outs.length - 1] : turn === -1 ? outs[0] : outs[Math.min(ins.indexOf(inLane), outs.length - 1)];
    car.plan = net.connector(k, inLane, to, outLane, use);
  }
  /** Turns round on the spot to the matching lane the other way (after a long wait, or short of a dead end). */
  function turnBack(car: Car) {
    const k = stateOf(car.edge, car.dir) ^ 1, lanes = net.lanesFor(k, laneUseOf(car.kind));
    if (!lanes.length) return false;
    const lane = lanes[lanes.length - 1], L = net.lanesOf(k)[lane];
    Object.assign(car, { dir: dirOfState(k), lane, laneOff: L.off, lateral: L.off, lateralTarget: L.off, plan: null, conn: null, connS: 0, yieldSince: -1 });
    car.uturns++;
    return true;
  }
  /** A point of a connector at arc c, with its heading. */
  function connPoint(c: Connector, at: number) {
    const cum = c.cum, n = cum.length;
    at = Math.max(0, Math.min(c.len, at));
    let lo = 0, hi = n - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= at) lo = mid; else hi = mid - 1; }
    const i = Math.min(lo, n - 2), l = cum[i + 1] - cum[i] || 1, t = (at - cum[i]) / l;
    const dx = c.pts[i * 2 + 2] - c.pts[i * 2], dz = c.pts[i * 2 + 3] - c.pts[i * 2 + 1];
    return { x: c.pts[i * 2] + dx * t, z: c.pts[i * 2 + 1] + dz * t, hx: dx / l, hz: dz / l };
  }
  /** Arc of a connector nearest (x, z). */
  function connProject(c: Connector, x: number, z: number) {
    let best = Infinity, at = 0;
    for (let i = 0; i + 3 < c.pts.length; i += 2) {
      const ax = c.pts[i], az = c.pts[i + 1], dx = c.pts[i + 2] - ax, dz = c.pts[i + 3] - az, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) { best = d; at = c.cum[i / 2] + t * Math.sqrt(l2); }
    }
    return at;
  }
  /** How far a lane vehicle is from the node it drives towards (its centre, along the edge). */
  const toNode = (car: Car) => (car.dir > 0 ? roads.edges[car.edge].len - car.s : car.s);
  /** Seconds-ahead threat window of a vehicle coming to a node: within its stop line plus ~2.5 s of travel. */
  function arriving(o: Car, node: number) {
    if (o.mode !== 'lane') return false;
    if (o.conn) return false;
    const k = stateOf(o.edge, o.dir);
    if (net.arrival(k) !== node) return false;
    const d = toNode(o) - (net.isJunction(roads.nodes[node]) ? net.inArm(k).setback : 0) - HALF[o.kind][1];
    // Standing for a reason of its own (a light, giving way, a queue): no threat yet.
    if (o.speed < 0.6 && o.wait) return false;
    return d < 6 + o.speed * 2.5 && (o.speed > 0.6 || d < 2);
  }
  /**
   * Who a vehicle about to take connector `c` at its node must let go first: anyone already in the box on a crossing
   * path; at a junction without lights, from a side road, anyone coming along the main road whose way crosses; turning
   * left (lights or not), anyone coming the other way going straight on or right (or turning left and nearer). After
   * waiting `patience` seconds it takes a smaller gap.
   */
  function giveWay(car: Car, c: Connector, patience: number): Car | true | null {
    const node = roads.nodes[c.node], signal = node.control === 'signal', mine = stateOf(car.edge, car.dir);
    const minor = !signal && !net.onMajor(mine), left = c.turn === -1, myD = toNode(car);
    // Buses driving (other systems' vehicles in traffic, registered as obstacles that are followed): one in the box goes
    // first; from the main road, or coming the other way when turning left, one about to arrive too.
    const ia = net.inArm(mine);
    for (const o of obstacles.values()) {
      if (!o.follow || o.speed < 0.5) continue;
      const dx = node.x - o.x, dz = node.z - o.z, d = Math.hypot(dx, dz);
      if (d > 50) continue;
      const hx = Math.sin(o.yaw), hz = Math.cos(o.yaw);
      if (d < node.radius + o.hz * 0.6) return true;
      if ((dx * hx + dz * hz) / (d || 1) < 0.8 || d - o.hz > node.radius + 6 + o.speed * 3) continue;
      // The arm it comes in along: the one most nearly behind it.
      let arm = -1, best = -Infinity;
      node.arms.forEach((a, i) => { const dot = -(a.hx * hx + a.hz * hz); if (dot > best) { best = dot; arm = i; } });
      if (arm < 0 || node.arms[arm] === ia) continue;
      const k = stateOf(node.arms[arm].edge, node.arms[arm].end === 1 ? 1 : -1);
      if (minor && net.onMajor(k)) return true;
      if (left && net.inArm(k).hx * ia.hx + net.inArm(k).hz * ia.hz < -0.7) return true;
    }
    for (const o of active) {
      if (o === car || o.mode !== 'lane') continue;
      if (Math.abs(o.x - node.x) > 60 || Math.abs(o.z - node.z) > 60) continue;
      if (o.conn) {
        if (o.conn.node === c.node && net.conflicts(o.conn, c)) return o;
        continue;
      }
      if (!o.plan || !arriving(o, c.node) || !net.conflicts(o.plan, c)) continue;
      const k = stateOf(o.edge, o.dir);
      if (k === mine) {
        // From the next lane over, into crossing paths (a car and a motorbike both turning right): the one ahead first.
        const od = toNode(o);
        if (od < myD - 1 || (Math.abs(od - myD) <= 1 && ordinal.get(o)! < ordinal.get(car)!)) return o;
        continue;
      }
      // A long wait takes a smaller gap: after a few seconds only who is near its line, then only who is at it (turning
      // left at lights, sooner: the green is short).
      const line = toNode(o) - net.inArm(stateOf(o.edge, o.dir)).setback - HALF[o.kind][1], p0 = signal ? 2 : 4, p1 = signal ? 5 : 8;
      if ((patience > p0 && line > 8) || (patience > p1 && line > 2.5)) continue;
      // A side road gives way to the main road.
      if (minor) { if (net.onMajor(k)) return o; continue; }
      if (!left) continue;
      // Turning left: the oncoming way first (going straight on or right; turning left too, the nearer one).
      const opposite = net.inArm(k).hx * net.inArm(mine).hx + net.inArm(k).hz * net.inArm(mine).hz < -0.7;
      if (!opposite) continue;
      const theirs = o.plan.turn, od = toNode(o);
      if (theirs >= 0 || (theirs === -1 && (od < myD - 0.5 || (Math.abs(od - myD) <= 0.5 && ordinal.get(o)! < ordinal.get(car)!)))) return o;
    }
    return null;
  }

  /** projectOn's answer: arc of the nearest point of the edge's line (beyond either end along its tangent) and the offset right of a→b. */
  let PS = 0, PL = 0;
  function projectOn(e: RoadEdge, x: number, z: number) {
    const p = e.pts, last = p.length - 4;
    let best = Infinity;
    for (let k = 0; k <= last; k += 2) {
      const ax = p[k], az = p[k + 1], dx = p[k + 2] - ax, dz = p[k + 3] - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2) || 1;
      let u = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      if (u < 0 && k > 0) u = 0;
      if (u > 1 && k < last) u = 1;
      const qx = ax + dx * u, qz = az + dz * u, d = (x - qx) * (x - qx) + (z - qz) * (z - qz);
      if (d < best) { best = d; PS = e.cum[k / 2] + u * l; PL = ((x - ax) * -dz + (z - az) * dx) / l; }
    }
  }
  /**
   * Whether a vehicle `gap` metres short of a stop line stops for its light: on amber when it can stop comfortably, on
   * red unless it is already too close to stop at all (it went on an amber that has just turned).
   */
  const stopsFor = (light: 'green' | 'yellow' | 'red', gap: number, v: number) =>
    light === 'red' ? v < 2.5 || gap > (v * v) / 14 : light === 'yellow' && gap > (v * v) / 9 + 1;
  /**
   * How far along a connector (from arc `from`, then on along its end heading) a body (half width hw, half length hl)
   * can go before it meets a box (centre, heading, half width and length): Infinity when it never does within `reach`.
   */
  function sweep(c: Connector, from: number, reach: number, hw: number, hl: number, ox: number, oz: number, oyaw: number, ow: number, ol: number, off = 0) {
    const bx = Math.sin(oyaw), bz = Math.cos(oyaw);
    for (let d = 0; d <= reach; d += 0.5) {
      const at = from + d, q = connPoint(c, Math.min(at, c.len)), over = Math.max(0, at - c.len);
      const px = q.x + q.hx * over - q.hz * off, pz = q.z + q.hz * over + q.hx * off;
      // Separating axes of two rectangles: each one's along and across.
      const dx = ox - px, dz = oz - pz;
      let apart = false;
      for (const [ux, uz, ah, bh] of [[q.hx, q.hz, hl, 0], [-q.hz, q.hx, hw, 0], [bx, bz, ol, 1], [-bz, bx, ow, 1]] as [number, number, number, number][]) {
        const ra = bh ? hl * Math.abs(q.hx * ux + q.hz * uz) + hw * Math.abs(-q.hz * ux + q.hx * uz) : ah;
        const rb = bh ? ah : ol * Math.abs(bx * ux + bz * uz) + ow * Math.abs(-bz * ux + bx * uz);
        if (Math.abs(dx * ux + dz * uz) > ra + rb + PASS_MARGIN) { apart = true; break; }
      }
      if (!apart) return d;
    }
    return Infinity;
  }
  /** Things standing in a junction a vehicle on a connector must get round (x, z, yaw, half width, half length). */
  const boxObs: number[] = [];
  /** Offsets off a connector's line to try, nearest the current one first (0 first when it is free). */
  const OFFSETS = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, -3.0];
  const offsets = (now: number) => OFFSETS.slice().sort((a, b) => Math.abs(a) - Math.abs(b) || Math.abs(a - now) - Math.abs(b - now));
  /** How far along a connector (with an offset) a body goes before meeting one of boxObs. */
  function clearOf(c: Connector, from: number, reach: number, hw: number, hl: number, off: number) {
    let d = Infinity;
    for (let i = 0; i < boxObs.length; i += 5) d = Math.min(d, sweep(c, from, reach, hw, hl, boxObs[i], boxObs[i + 1], boxObs[i + 2], boxObs[i + 3], boxObs[i + 4], off));
    return d;
  }
  /** Whether a body following a connector at an offset stays on the asphalt round its node, from arc `from` to its end. */
  function fitsAlong(c: Connector, from: number, off: number, hw: number, hl: number) {
    if (Math.abs(off) < 0.05) return true;
    for (let a = from; a <= c.len + 1e-6; a += 1) {
      const q = connPoint(c, a);
      if (!net.fits(c.node, q.x - q.hz * off, q.z + q.hx * off, q.hx, q.hz, hw, hl)) return false;
    }
    return true;
  }
  /** Fills boxObs with what stands (not lane traffic) within r of a point: parked, knocked, wrecks, roadblocks, the player's vehicle, bodies, obstacles. */
  function standingNear(x: number, z: number, r: number, self: Car) {
    boxObs.length = 0;
    for (const o of active) {
      if (o === self || o.mode === 'off' || o.mode === 'lane' || Math.abs(o.x - x) > r || Math.abs(o.z - z) > r) continue;
      if (o.kind === 'police' && (o.mode === 'chase' || o.mode === 'leave')) continue;
      const [ow, ol] = HALF[o.kind];
      boxObs.push(o.x, o.z, o.yaw, ow, ol);
    }
    for (const o of obstacles.values()) if (!o.follow && Math.abs(o.x - x) < r + o.hz && Math.abs(o.z - z) < r + o.hz) boxObs.push(o.x, o.z, o.yaw, o.hx, o.hz);
    for (const p of crossing) if (p.body && Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) boxObs.push(p.x, p.z, 0, 0.9, 0.9);
    return boxObs.length > 0;
  }
  /** Whether something standing in the junction leaves no way along a connector (at any offset on the asphalt). */
  function connBlocked(c: Connector, hw: number, hl: number) {
    for (const off of OFFSETS) if (clearOf(c, 0, c.len + 3, hw, hl, off) === Infinity && fitsAlong(c, 0, off, hw, hl)) return false;
    return true;
  }
  /** What stands ahead of a lane vehicle (s0, s1 along the road, lo, hi across it for its centre, bay or not), gathered per vehicle per frame. */
  const bands: number[] = [];
  /**
   * One lane vehicle's frame: wait for the light (looking a node ahead across short streets), give way at junctions
   * without lights and to whoever is already in the box, keep out of a box it could not leave, follow the vehicle
   * ahead at a braking distance, wait for people on the crossing and for crossing traffic; shift out of the curb lane
   * past occupied bays (merging behind whoever is already there) and ease past whatever stands in the lane (parked or
   * knocked vehicles, crash leftovers, a body, a bus at its stop, the player) by moving across within the asphalt,
   * slowly, over the centre line only when nothing comes the other way; wait and honk when there is no way past, and
   * turn round only after 15 s (6 s at a police roadblock or a zombie-mode wreck, which are not passed). Then on
   * along the edge, into the connector at its end and out onto the next edge.
   */
  function driveLane(car: Car, dt: number, time: number, player: PlayerView) {
    const [hw, hl] = HALF[car.kind], use = laneUseOf(car.kind);
    if (!car.conn && !car.plan) planNext(car);
    const e = roads.edges[car.edge], k = stateOf(car.edge, car.dir), conn = car.conn, plan = car.plan;
    const L0 = car.laneOff;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const width = car.kind === 'moto' ? 1.1 : 2.3;
    const check = (x: number, z: number, reach: number, side = width) => {
      const dx = x - car.x, dz = z - car.z;
      const ahead = dx * fx + dz * fz, lateral = Math.abs(dx * fz - dz * fx);
      return ahead > 0 && ahead < reach && lateral < side;
    };
    // The road frame: on an edge, the arc ahead of the vehicle along it and the offset right of its centre line (exact
    // round a bend; past either end, on along the end's tangent); on a connector, its own path's tangent at the vehicle.
    let cx = 0, cz = 0, hx: number, hz: number;
    if (conn) { const q = connPoint(conn, car.connS); cx = q.x; cz = q.z; hx = q.hx; hz = q.hz; }
    else { const p = roads.pointAt(e, car.s); hx = p.hx * car.dir; hz = p.hz * car.dir; }
    const rx = -hz, rz = hx;
    let FS = 0, FL = 0;
    const frame = (x: number, z: number) => {
      if (conn) { const dx = x - cx, dz = z - cz; FS = dx * hx + dz * hz; FL = dx * rx + dz * rz; return; }
      projectOn(e, x, z);
      FS = (PS - car.s) * car.dir; FL = PL * car.dir;
    };
    const half = e.half, reach = Math.max(10, car.speed * 1.8 + 6) + hl;
    // The other way: whether it has lanes, and how near the centre line its traffic comes (its innermost lanes).
    const back = net.lanesOf(k ^ 1), twoWay = back.length > 0;
    const farLane = twoWay ? Math.max(...back.filter((l) => l.use !== 'moto').map((l) => l.off), back[0].off) + 1.6 : 0;
    let wait: Wait = null, waitFor: Car | null = null, stopGap = Infinity, hard = false, oncoming = false, abandoned = false, tail = Infinity;
    let lead = Infinity, leadCar: Car | null = null, leadAlong = false;
    // Its way through the node ahead (the connector it is on or will take), and how far off its start is.
    const way = conn ?? (plan && plan.turn !== 2 ? plan : null), toWay = way ? (conn ? -car.connS : (way.sIn - car.s) * car.dir) : 0;
    /**
     * Where another lane vehicle is along that way (in the same turn, or just out of it on the street beyond): metres
     * ahead and across, measured along the path, since round a tight corner the headings part long before the bodies do.
     */
    const alongWay = (o: Car): [number, number] | null => {
      if (!way) return null;
      if (o.conn) {
        if (o.conn.node !== way.node || o.conn.from !== way.from) return null;
        if (o.conn !== way && (o.conn.inLane !== way.inLane || o.connS > 4)) return null;
        return [toWay + o.connS, Math.abs(o.lateral - car.lateral)];
      }
      if (way.turn === 2 || o.edge !== way.to >> 1 || o.dir !== dirOfState(way.to)) return null;
      const past = (o.s - way.sOut) * o.dir;
      if (past < -1 || past > 30) return null;
      return [toWay + way.len + past, Math.abs(o.lateral - (way.latOut + (conn ? car.connLat : 0)))];
    };
    bands.length = 0;
    boxObs.length = 0;
    const bandAt = (s: number, l: number, es: number, el: number, deliberate: boolean, old = false, bay = false) => {
      // Passed (its far end 2 m behind the tail), beyond the look-ahead, or off the carriageway.
      if (s + es < -hl - 2 || s - es > reach || Math.abs(l) - el > half + 0.3) return;
      const lo = deliberate ? -Infinity : l - el - hw - PASS_MARGIN, hi = deliberate ? Infinity : l + el + hw + PASS_MARGIN;
      bands.push(s - es, s + es, lo, hi, bay ? 1 : 0);
      if (car.lateral > lo && car.lateral < hi && s + es > 0) {
        stopGap = Math.min(stopGap, s - es - hl);
        if (deliberate) hard = true;
      }
      if (old && s < 15) abandoned = true;
    };
    /** A box (centre, heading, half width and length) in the road frame. */
    const box = (x: number, z: number, yaw: number, bw: number, bl: number, deliberate: boolean, old = false) => {
      const ox = Math.sin(yaw), oz = Math.cos(yaw), ca = Math.abs(ox * hx + oz * hz), sa = Math.abs(ox * rx + oz * rz);
      frame(x, z);
      bandAt(FS, FL, ca * bl + sa * bw, sa * bl + ca * bw, deliberate, old);
    };
    /** Oncoming within 40 m and nearer the centre line than the far curb lane. */
    const comesAt = (x: number, z: number, extra = 0) => { frame(x, z); return twoWay && FS > -6 - extra && FS < 40 + extra && FL > -farLane && FL < half; };
    if (!player.car && !conn) { frame(player.x, player.z); bandAt(FS, FL, 0.7, 0.7, false); }
    // People on a crosswalk anywhere across the lane: wait. A body lying in the road: go round it.
    for (const p of crossing) {
      if (p.body) { if (!conn) { frame(p.x, p.z); bandAt(FS, FL, 0.9, 0.9, false); } else boxObs.push(p.x, p.z, 0, 0.9, 0.9); }
      else if (check(p.x, p.z, 9, 2.6)) wait = 'walk';
    }
    for (const other of active) {
      if (other === car || other.mode === 'off') continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      if (Math.abs(dx) > 45 || Math.abs(dz) > 45) continue;
      const ofx = Math.sin(other.yaw), ofz = Math.cos(other.yaw), dot = ofx * fx + ofz * fz;
      const near = Math.abs(dx) <= reach + 3 && Math.abs(dz) <= reach + 3;
      if (other.mode === 'lane') {
        const [ow, ol] = HALF[other.kind];
        const along = alongWay(other);
        if (along && along[0] > 0 && along[0] < reach + ol + 4 && along[1] < hw + ow + 0.2) {
          const gap = along[0] - hl - ol;
          if (gap < lead) { lead = gap; leadCar = other; leadAlong = true; }
          continue;
        }
        if (dot > 0.7) {
          // Following: the nearest vehicle ahead in the way (body widths), at a braking distance; along the street's
          // own line (round a bend too), in the box along the body.
          let ahead: number, side: number;
          if (conn) { ahead = dx * fx + dz * fz; side = Math.abs(dx * fz - dz * fx); }
          else { frame(other.x, other.z); ahead = FS; side = Math.abs(FL - car.lateral); }
          if (ahead > 0 && ahead < reach + ol + 4 && side < hw + ow + 0.2) { const gap = ahead - hl - ol; if (gap < lead) { lead = gap; leadCar = other; leadAlong = false; } }
        } else if (dot < -0.7) {
          // Coming the other way: keep clear of it, and do not pull out over the centre line while it is near.
          if (!conn && comesAt(other.x, other.z)) oncoming = true;
          if (near && !conn) box(other.x, other.z, other.yaw, ow, ol, false);
        } else if (near && check(other.x, other.z, 7.5)) {
          // Crossing in front. In the same box, whoever was in it first goes first; one waiting at its line lets the box clear.
          const both = conn && other.conn && other.conn.node === conn.node, atLine = conn && !other.conn && other.speed < 1;
          if (!atLine && (!both || other.boxAt < car.boxAt || (other.boxAt === car.boxAt && ordinal.get(other)! < ordinal.get(car)!))) { wait = 'cross'; waitFor = other; }
        }
        continue;
      }
      if (!near) continue;
      if (other.kind === 'police' && (other.mode === 'chase' || other.mode === 'leave')) {
        if (check(other.x, other.z, 7.5)) { wait = 'cross'; waitFor = other; }
        continue;
      }
      // Standing, skidding or being driven by the player: something to get round. Roadblocks and zombie wrecks are not passed.
      const [ow, ol] = HALF[other.kind];
      if (conn) { boxObs.push(other.x, other.z, other.yaw, ow, ol); continue; }
      box(other.x, other.z, other.yaw, ow, ol, (other.kind === 'police' && other.mode === 'hold') || wrecks.has(other), other.still > 60);
    }
    // Things other systems put in the road (a bus at its stop, the player's own bike; a bus driving is followed).
    for (const o of obstacles.values()) {
      if (!o.follow) {
        if (Math.abs(o.x - car.x) > reach + o.hz + 3 || Math.abs(o.z - car.z) > reach + o.hz + 3) continue;
        if (!conn) box(o.x, o.z, o.yaw, o.hx, o.hz, false);
        else boxObs.push(o.x, o.z, o.yaw, o.hx, o.hz);
        continue;
      }
      // A bus in traffic, measured to the nearest point of its centre line: queue behind it like a lane vehicle, keep
      // clear of it coming the other way, wait while it crosses.
      const ox = Math.sin(o.yaw), oz = Math.cos(o.yaw), dot = ox * fx + oz * fz;
      if (Math.abs(o.x - car.x) > reach + o.hz + 3 || Math.abs(o.z - car.z) > reach + o.hz + 3) {
        if (dot < -0.7 && !conn && Math.abs(o.x - car.x) < 45 + o.hz && Math.abs(o.z - car.z) < 45 + o.hz && comesAt(o.x, o.z, o.hz)) oncoming = true;
        continue;
      }
      const at = (car.x - o.x) * ox + (car.z - o.z) * oz, u = THREE.MathUtils.clamp(at, -o.hz, o.hz), px = o.x + ox * u, pz = o.z + oz * u;
      if (dot > 0.7) {
        if (at > -o.hz - hl * 0.5) { if (!conn) box(o.x, o.z, o.yaw, o.hx, o.hz, false); continue; }
        // Behind it: follow at a braking distance, and queue once close.
        const gapAhead = (px - car.x) * fx + (pz - car.z) * fz - hl, side = Math.abs((px - car.x) * fz - (pz - car.z) * fx);
        if (gapAhead > -1 && side < width - hw + o.hx) { tail = Math.min(tail, gapAhead); if (gapAhead < (car.kind === 'moto' ? 3 : 2.9)) wait ??= 'queue'; }
      } else if (dot < -0.92) {
        if (!conn && comesAt(o.x, o.z, o.hz)) oncoming = true;
        if (!conn) box(o.x, o.z, o.yaw, o.hx, o.hz, false);
      } else if (conn || (roads.junctionAt(car.x, car.z, 9) !== null)) {
        // Already out in the junction box with a bus turning across: clear the box rather than stop in its way (the
        // bus waits), unless it stands right in front.
        if (!conn) box(o.x, o.z, o.yaw, o.hx, o.hz, false);
        else boxObs.push(o.x, o.z, o.yaw, o.hx, o.hz);
      } else if (check(px, pz, 7.5, width + o.hx)) wait = 'cross';
    }
    // In the box: round whatever stands in the way, off the connector's line (on the asphalt), or stop short of it.
    let connTarget = 0;
    if (conn) {
      // Out to where it could stop beyond the connector's end (things standing just past the junction).
      const left = conn.len - car.connS + Math.max(4, (car.speed * car.speed) / 8 + 4), at = (off: number) => clearOf(conn, car.connS, left, hw, hl, off);
      connTarget = car.connLat;
      if (boxObs.length) {
        let found = false;
        for (const off of offsets(car.connLat)) if (at(off) === Infinity && fitsAlong(conn, car.connS, off, hw, hl)) { connTarget = off; found = true; break; }
        const here = at(car.connLat);
        if (here < Infinity) stopGap = Math.min(stopGap, here);
        if (!found) connTarget = car.connLat;
      } else connTarget = 0;
    }
    // Occupied curb bays on this side: the curb lane shifts in past them.
    if (!conn) {
      const info = net.world.edges[car.edge];
      for (const bay of info.bays) {
        if (bay.side !== car.dir || !inHours(bay.hours, hours)) continue;
        const a = (bay.s0 - car.s) * car.dir, b = (bay.s1 - car.s) * car.dir, s0 = Math.min(a, b), s1 = Math.max(a, b);
        if (s1 < -hl - 2 || s0 > reach + 8) continue;
        // In from the curb by the bay's depth, tapering in over 8 m before it.
        bands.push(s0 - 8, s1, half - bay.depth - hw - PASS_MARGIN, Infinity, 1);
        if (car.lateral > half - bay.depth - hw - PASS_MARGIN && s1 > 0) stopGap = Math.min(stopGap, s0 - 8 - hl);
      }
    }
    // Where to drive across the road: the lane if it is free, else the nearest free line (never over the centre while
    // traffic comes the other way, unless already committed to passing).
    let passing = false, noWay = false, merging: Car | null = null;
    if (!conn) {
      // What it has to get round: the nearest thing alongside or ahead (not what it has left behind), and whatever
      // else starts within 6 m of that one's end.
      let nearest = Infinity, nearEnd = Infinity;
      for (let i = 0; i < bands.length; i += 5) if (bands[i + 1] > -hl && bands[i] < nearest) { nearest = bands[i]; nearEnd = bands[i + 1]; }
      const inPlan = (i: number) => bands[i + 1] > -hl && bands[i] < nearEnd + 6;
      // The lane this vehicle wants for its turn at the end of the edge (a lane change on a wider road).
      let want = L0;
      if (plan && plan.inLane !== car.lane) want = net.lanesOf(k)[plan.inLane].off;
      if (bands.length) {
        const maxL = half - hw - 0.25, own = hw + 0.15;
        const minL = !twoWay || car.lateral < own - 0.05 || !oncoming ? -maxL : own;
        let best = NaN, cost = Infinity, obstacle = false;
        const consider = (l: number) => {
          if (!(l >= minL && l <= maxL)) return;
          for (let i = 0; i < bands.length; i += 5) if (inPlan(i) && l > bands[i + 2] && l < bands[i + 3]) return;
          const c = Math.abs(l - want) + (l < own && twoWay ? 1.5 : 0);
          if (c < cost) { cost = c; best = l; }
        };
        consider(want);
        for (let i = 0; i < bands.length; i += 5) if (inPlan(i)) { consider(bands[i + 2] - 0.02); consider(bands[i + 3] + 0.02); }
        // No way past yet (traffic coming the other way): hold back short of all of it, with room to swing out later
        // rather than tucked in beside something it would then have to cross.
        if (Number.isNaN(best)) { noWay = true; stopGap = Math.min(stopGap, nearest - hl - 0.3); }
        else {
          car.lateralTarget = best;
          // Away from its lane for something standing in it (not only a bay): a pass, taken slowly.
          for (let i = 0; i < bands.length; i += 5) if (inPlan(i) && !bands[i + 4] && want > bands[i + 2] && want < bands[i + 3]) obstacle = true;
          passing = obstacle && Math.abs(best - want) > 0.25;
        }
      } else car.lateralTarget = want;
      // Moving over (a lane change, a merge past a bay; not getting round something standing in its lane, which it
      // edges round anyway): not into a vehicle alongside or just behind on that line.
      if (Math.abs(car.lateralTarget - car.lateral) > 0.4 && !passing) {
        for (const o of active) {
          if (o === car || o.mode !== 'lane' || Math.abs(o.x - car.x) > 14 || Math.abs(o.z - car.z) > 14) continue;
          if (Math.sin(o.yaw) * fx + Math.cos(o.yaw) * fz < 0.8) continue;
          frame(o.x, o.z);
          const s = FS, l = FL, [ow, ol] = HALF[o.kind];
          const lo = Math.min(car.lateral, car.lateralTarget), hi = Math.max(car.lateral, car.lateralTarget);
          if (s > -hl - ol - 4 && s < hl + ol + 0.5 && l > lo - hw - ow - 0.2 && l < hi + hw + ow + 0.2 && Math.abs(l - car.lateral) > 0.3) {
            // Zip: one behind that is not coming on (queued, or waiting on this one) lets it in first.
            if (s < 0 && (o.speed < 1 || o.waitFor === car)) continue;
            merging = o; break;
          }
        }
        if (merging) car.lateralTarget = car.lateral;
        else if (plan && want !== L0 && Math.abs(car.lateralTarget - want) < 0.05) { car.lane = plan.inLane; car.laneOff = want; }
      }
    }
    const top = conn ? Math.min(car.cruise, conn.vmax) : Math.min(car.cruise, e.speed + 1);
    let target = wait === 'queue' || wait === 'walk' || wait === 'cross' ? 0 : top;
    if (passing || (conn && (Math.abs(connTarget) > 0.25 || Math.abs(car.connLat) > 0.25) && boxObs.length)) target = Math.min(target, PASS_SPEED);
    // Stop short of whatever the current line runs into until the new line is clear of it.
    if (stopGap < Infinity) {
      target = Math.min(target, Math.sqrt(Math.max(0, stopGap - 0.5) * 4));
      if (stopGap < 3 && !wait) { wait = merging ? 'merge' : 'block'; if (merging) waitFor = merging; }
    }
    // The vehicle ahead: follow it at its own pace a little way back (able to stop if it does), queue once close.
    if (lead < Infinity && leadCar) {
      const gap = car.kind === 'moto' ? 1.4 : 2.0, room = Math.max(0, lead - gap);
      const vl = leadAlong ? Math.max(0, leadCar.speed) : Math.max(0, leadCar.speed * (Math.sin(leadCar.yaw) * fx + Math.cos(leadCar.yaw) * fz));
      target = Math.min(target, Math.sqrt(2 * 3.5 * room + vl * vl), vl + room * 1.2 + 0.3);
      if (lead < gap + 0.8) { if (!wait || wait === 'block') { wait = 'queue'; waitFor = leadCar; } }
    }
    // Behind a bus: keep a braking distance back from its tail.
    if (tail < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, tail - 1.8) * 5));

    // ---- The node ahead: its light (and the next one's across a short street), giving way, a box it could not leave ----
    const brakeTo = (gap: number, why: Wait, who: Car | null = null) => {
      const limit = Math.sqrt(Math.max(0, gap - 0.2) * 5);
      if (limit < target) { target = limit; if (limit < 1 && (!wait || wait === 'block')) { wait = why; waitFor = who; } }
    };
    let yielding = false;
    if (!conn && plan) {
      const node = roads.nodes[plan.node], arm = net.inArm(k), d = toNode(car);
      const line = net.isJunction(node) ? arm.setback : 0, gap = d - line - hl;
      if (node.control === 'signal' && arm.approach >= 0 && gap > -0.6 && stopsFor(nodeLight(node.id, arm.group, time), gap, car.speed)) brakeTo(gap, 'light');
      if (net.isJunction(node) && gap > -0.6 && gap < 30) {
        // A side road without lights slows right down at its line.
        if (node.control !== 'signal' && !net.onMajor(k) && gap < 12) target = Math.min(target, Math.max(3, Math.sqrt(Math.max(0, gap) * 3)));
        if (gap < 6 + car.speed) {
          const patience = car.yieldSince >= 0 ? time - car.yieldSince : 0;
          const yieldTo = giveWay(car, plan, patience), who = yieldTo === true ? null : yieldTo;
          // Something standing in the junction across the way it means to take: another way, or wait at the line.
          if (!yieldTo && gap < 8 && standingNear(node.x, node.z, node.radius + 14, car) && connBlocked(plan, hw, hl)) {
            const old = car.plan;
            planNext(car);
            for (let tries = 0; tries < 4 && car.plan && car.plan !== old && connBlocked(car.plan, hw, hl); tries++) planNext(car);
            if (!car.plan || connBlocked(car.plan, hw, hl)) { car.plan = old; brakeTo(gap, 'block'); }
          }
          if (yieldTo) { brakeTo(gap, 'yield', who); yielding = true; }
          else {
            // Into the box only with room on the far side.
            const out = roads.edges[plan.to >> 1], od = dirOfState(plan.to);
            for (const o of active) {
              if (o === car || o.mode !== 'lane' || o.conn || o.edge !== out.id || o.dir !== od || o.speed > 1) continue;
              const past = (o.s - plan.sOut) * od;
              if (past < HALF[o.kind][1] + hl + 1.5 && past > -HALF[o.kind][1] && Math.abs(o.lateral - plan.latOut) < hw + HALF[o.kind][0] + 0.3) { brakeTo(gap, 'queue', o); break; }
            }
          }
        }
      }
    }
    car.yieldSince = yielding ? (car.yieldSince >= 0 ? car.yieldSince : time) : -1;
    // The next light along the way, a node on (a short street after this one).
    {
      const next = conn ? conn.to : plan ? plan.to : -1;
      if (next >= 0) {
        const n2 = roads.nodes[net.arrival(next)], arm2 = net.inArm(next), out = roads.edges[next >> 1];
        if (n2.control === 'signal' && arm2.approach >= 0) {
          const c = conn ?? plan!, rest = conn ? conn.len - car.connS : toNode(car) - c.before + c.len;
          const onOut = dirOfState(next) > 0 ? out.len - c.sOut : c.sOut;
          const gap2 = rest + onOut - arm2.setback - hl;
          if (gap2 > -0.6 && gap2 < 60 && stopsFor(nodeLight(n2.id, arm2.group, time), gap2, car.speed)) brakeTo(gap2, 'light');
        }
      }
    }
    car.wait = wait;
    car.waitFor = waitFor;
    // Blocked with no way past: honk after a moment and, after a long wait, turn round. Waiting for a light, the
    // vehicle ahead, people crossing or a gap is just waiting.
    const stuckNow = (wait === 'block' || wait === 'cross') && car.speed < 1;
    car.stuck = stuckNow ? car.stuck + dt : 0;
    if (stuckNow && car.stuck > 1.5 && (noWay || hard)) honk(car.x, car.z, time, player);
    if (passing && abandoned) honk(car.x, car.z, time, player);
    if (car.stuck > (hard || wait === 'cross' ? 6 : 15) && !conn) {
      car.stuck = 0;
      turnBack(car);
      return;
    }
    // Shut in the middle of a junction (no turning round there): gone once nobody is looking.
    if (conn && car.stuck > 8 && !sees(car.x, car.z, 3, Math.hypot(car.x - player.x, car.z - player.z))) {
      Object.assign(car, { mode: 'off', driver: null, speed: 0, conn: null, plan: null, stuck: 0 });
      return;
    }
    car.speed = target < car.speed ? Math.max(target, car.speed - 7 * dt) : THREE.MathUtils.damp(car.speed, target, 1.4, dt);
    // Across the road mostly as it rolls (a little even when stopped, edging out to see past).
    const step = (0.8 + Math.abs(car.speed) * 0.45) * dt;
    if (!conn) {
      let next = car.lateral + THREE.MathUtils.clamp((car.lateralTarget - car.lateral) * (1 - Math.exp(-dt / 0.6)), -step, step);
      // Never sideways into something standing beside it.
      for (let i = 0; i < bands.length; i += 5) {
        if (bands[i + 1] < -hl || bands[i] > hl) continue;
        const lo = bands[i + 2], hi = bands[i + 3];
        if (car.lateral <= lo && next > lo) next = lo;
        else if (car.lateral >= hi && next < hi) next = hi;
      }
      car.lateral = next;
    } else {
      car.connLat += THREE.MathUtils.clamp((connTarget - car.connLat) * (1 - Math.exp(-dt / 0.6)), -step, step);
      car.lateral = car.laneOff + car.connLat;
    }

    // ---- On along the edge, through the connector, onto the next edge ----
    if (car.conn) {
      const c = car.conn;
      car.connS += car.speed * dt;
      if (car.connS >= c.len) {
        const to = c.to, out = roads.edges[to >> 1], od = dirOfState(to), over = car.connS - c.len;
        const L = net.lanesOf(to)[c.outLane];
        Object.assign(car, {
          edge: to >> 1, dir: od, s: THREE.MathUtils.clamp(c.sOut + od * over, 0, out.len), lane: c.outLane, laneOff: L.off,
          lateral: c.latOut + car.connLat, lateralTarget: L.off, conn: null, connS: 0, connLat: 0, plan: null, yieldSince: -1,
        });
      }
    } else {
      car.s = THREE.MathUtils.clamp(car.s + car.dir * car.speed * dt, 0, e.len);
      const p = car.plan;
      if (p && (car.s - p.sIn) * car.dir >= 0) {
        // Into the connector from the lane it is actually in (a lane change it could not finish).
        const c = car.lane === p.inLane ? p : net.connector(k, car.lane, p.to, p.outLane, use);
        // Still off its lane (getting round something): it keeps that offset off the connector's line and eases back.
        const lp = laneAt(roads, e, car.s, car.dir, car.laneOff);
        car.conn = c;
        car.connS = Math.min(c.len, connProject(c, lp.x, lp.z));
        car.connLat = car.lateral - car.laneOff;
        car.plan = c;
        car.boxAt = time;
      } else if (!p && toNode(car) < 8) {
        // Nowhere to go on (a dead end, every way closed): round before its end.
        if (!turnBack(car)) car.speed = 0;
      }
    }
    // The body trails its lane point by a short lag, so it rounds every corner in a smooth arc instead of pivoting
    // on the spot, and it faces the way it is actually moving.
    let px: number, pz: number, pyaw: number;
    if (car.conn) { const q = connPoint(car.conn, car.connS); px = q.x - q.hz * car.connLat; pz = q.z + q.hx * car.connLat; pyaw = Math.atan2(q.hx, q.hz); }
    else { const q = laneAt(roads, roads.edges[car.edge], car.s, car.dir, car.lateral); px = q.x; pz = q.z; pyaw = Math.atan2(q.hx, q.hz); }
    const follow = 1 - Math.exp(-dt / (car.conn ? 0.12 : 0.3));
    const ox = car.x, oz = car.z;
    car.x += (px - car.x) * follow;
    car.z += (pz - car.z) * follow;
    const mx = car.x - ox, mz = car.z - oz;
    if (mx * mx + mz * mz > 1e-6) {
      let desired = Math.atan2(mx, mz);
      // Edging sideways past something at a crawl, the nose points only a little off the lane; rounding a corner
      // (or turning back) it follows the arc.
      const off = Math.atan2(Math.sin(desired - pyaw), Math.cos(desired - pyaw));
      if (Math.abs(car.speed) < 2 && Math.abs(off) < 2.4) desired = pyaw + THREE.MathUtils.clamp(off, -0.45, 0.45);
      car.yaw = angleLerp(car.yaw, desired, 1 - Math.exp(-dt * 12));
    }
    syncAxis(car);
  }

  /** Steers toward the next waypoint; returns the distance left to the final one. */
  function driveRoute(car: Car, dt: number, topSpeed: number, direct: Point | null) {
    while (car.waypoints.length > 1 && Math.hypot(car.waypoints[0].x - car.x, car.waypoints[0].z - car.z) < 4) car.waypoints.shift();
    const next = direct ?? car.waypoints[0];
    if (!next) { car.speed = THREE.MathUtils.damp(car.speed, 0, 5, dt); return 0; }
    const desired = Math.atan2(next.x - car.x, next.z - car.z);
    car.yaw = angleLerp(car.yaw, desired, 1 - Math.exp(-dt * 4.5));
    const gap = Math.abs(Math.atan2(Math.sin(desired - car.yaw), Math.cos(desired - car.yaw)));
    const remaining = Math.hypot(next.x - car.x, next.z - car.z);
    const last = direct !== null || car.waypoints.length === 1;
    const target = last && remaining < 12 && !direct ? Math.min(topSpeed, remaining) : gap > 0.7 ? 7 : topSpeed;
    car.speed = THREE.MathUtils.damp(car.speed, target, 2.2, dt);
    const nx = car.x + Math.sin(car.yaw) * car.speed * dt, nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    // After being stuck for a while, ghost through other cars so a chase never deadlocks.
    const hitsCar = car.stuck < 2.5 && blocked(nx + Math.sin(car.yaw) * 1.6, nz + Math.cos(car.yaw) * 1.6, 1.2, car);
    if (!hitsCar && worldClear(nx, nz, 1.2)) {
      car.x = nx; car.z = nz;
      car.stuck = car.speed < 0.5 ? car.stuck + dt : Math.max(0, car.stuck - dt);
    } else {
      car.speed *= 0.3;
      car.stuck += dt;
    }
    if (car.stuck > 4) car.stuck = 0;
    return last ? remaining : remaining + 20;
  }

  /** A vehicle as a collision body (lane traffic moves along its heading at its speed, plus any shove). */
  function bodyOf(car: Car): Body {
    const [hw, hl] = HALF[car.kind];
    const moving = car.mode === 'knocked' ? 0 : car.speed;
    return { x: car.x, z: car.z, yaw: car.yaw, vx: Math.sin(car.yaw) * moving + car.vx, vz: Math.cos(car.yaw) * moving + car.vz, spin: car.spin, mass: MASS[car.kind], hw, hl };
  }
  /**
   * Writes a body's new motion back: traffic that took a real hit skids out of its lane; police only get shoved; a
   * parked vehicle starts to slide, and a bike on its side stand goes over at a much lighter knock than one ridden.
   */
  function knock(car: Car, body: Body, before: Body) {
    const dvx = body.vx - before.vx, dvz = body.vz - before.vz;
    const kick = Math.hypot(dvx, dvz);
    const standing = car.mode === 'parked' || car.mode === 'off';
    if (car.mode === 'knocked' || standing) {
      if (car.mode === 'parked' && kick > 0.4) { car.mode = 'knocked'; car.recoverAt = 0; }
      car.vx = body.vx; car.vz = body.vz; car.spin = body.spin;
    } else if (car.kind === 'police') {
      // Cruisers keep their crews' plans; the hit shoves them and turns them for a moment.
      car.vx += dvx; car.vz += dvz; car.spin += body.spin - before.spin;
      car.speed *= 0.6;
    } else if (kick > 1.0) {
      car.mode = 'knocked';
      car.vx = body.vx; car.vz = body.vz; car.spin = body.spin;
      car.plan = null;
      car.recoverAt = 0;
    }
    if (car.kind === 'moto' && kick > (standing || !car.driver ? 1.2 : 3.2)) car.fallen = true;
    if (car.curb && kick > 0.05) { car.home = false; car.touched = true; }
  }
  /** A skid: tyres scrub off sideways speed fast, rolling speed slowly; walls stop it; then it rests or drives on. */
  function skid(car: Car, dt: number, time: number) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    let along = car.vx * fx + car.vz * fz, side = car.vx * fz - car.vz * fx;
    if (car.fallen) {
      // A bike on its side just grinds to a halt.
      const sp = Math.hypot(car.vx, car.vz), slow = Math.max(0, sp - 7 * dt);
      if (sp > 0) { car.vx *= slow / sp; car.vz *= slow / sp; }
    } else {
      along = Math.sign(along) * Math.max(0, Math.abs(along) - 2.2 * dt);
      side = Math.sign(side) * Math.max(0, Math.abs(side) - 9 * dt);
      car.vx = fx * along + fz * side;
      car.vz = fz * along - fx * side;
    }
    car.spin *= Math.exp(-dt * 2.4);
    const radius = HALF[car.kind][0];
    const nx = car.x + car.vx * dt, nz = car.z + car.vz * dt;
    if (worldClear(nx, nz, radius)) { car.x = nx; car.z = nz; }
    else {
      if (worldClear(nx, car.z, radius)) car.x = nx; else car.vx *= -0.3;
      if (worldClear(car.x, nz, radius)) car.z = nz; else car.vz *= -0.3;
      car.spin *= 0.6;
    }
    car.yaw += car.spin * dt;
    car.speed = car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
    if (Math.hypot(car.vx, car.vz) < 0.25 && Math.abs(car.spin) < 0.15) {
      car.vx = car.vz = car.spin = car.speed = 0;
      // Shaken drivers set off again after a moment if they still can; wrecks and fallen bikes stay put.
      if (car.fallen || !car.driver || car.health <= 0) { car.mode = 'parked'; return; }
      if (!car.recoverAt) car.recoverAt = time + 2.5;
      if (time > car.recoverAt) rejoin(car);
    }
  }
  /** Back into the nearest lane heading the way the vehicle points (merging in from where it stopped), or left parked if it is off the road. */
  function rejoin(car: Car) {
    const use = laneUseOf(car.kind);
    let best: { k: number; s: number; off: number; d: number } | null = null;
    for (const h of roads.edgesNear(car.x, car.z, 8, (e) => e.traffic)) {
      if (h.d > h.edge.half + 1) continue;
      const heading = Math.sin(car.yaw) * h.hx + Math.cos(car.yaw) * h.hz, dir: 1 | -1 = heading >= 0 ? 1 : -1, k = stateOf(h.edge.id, dir);
      if (!net.drivable(k) || !net.lanesFor(k, use).length) continue;
      if (!best || h.d < best.d) best = { k, s: h.s, off: h.off * dir, d: h.d };
    }
    if (!best) { car.mode = 'parked'; return; }
    const lanes = net.lanesFor(best.k, use), L = net.lanesOf(best.k), off = best.off;
    const lane = lanes.reduce((a, b) => (Math.abs(L[b].off - off) < Math.abs(L[a].off - off) ? b : a), lanes[0]);
    const e = roads.edges[best.k >> 1], [hw] = HALF[car.kind];
    Object.assign(car, {
      mode: 'lane', edge: best.k >> 1, dir: dirOfState(best.k), s: best.s, lane, laneOff: L[lane].off, conn: null, connS: 0, plan: null, speed: 0, recoverAt: 0,
      lateral: THREE.MathUtils.clamp(off, hw + 0.15, e.half - hw - 0.25), lateralTarget: L[lane].off, yieldSince: -1, wait: null, waitFor: null,
    });
    syncAxis(car);
  }
  /** Resolves every pair of touching vehicles where at least one is skidding (or a cruiser on a chase); returns the impacts. */
  const movers: Car[] = [];
  const isMover = (c: Car) => c.mode === 'knocked' || (c.kind === 'police' && c.mode === 'chase');
  function collisions(crashes: Crash[]) {
    movers.length = 0;
    for (const car of active) if (car.mode !== 'off' && car.mode !== 'player' && isMover(car)) movers.push(car);
    // Parked vehicles that are only drawn wake when something comes skidding at them.
    for (const a of movers) if (a.mode === 'knocked') wakeNear(a.x, a.z, 4);
    for (let i = 0; i < movers.length; i++) {
      const a = movers[i];
      for (const b of active) {
        if (b === a || b.mode === 'off' || b.mode === 'player') continue;
        // Each pair of movers once.
        if (isMover(b) && movers.indexOf(b) < i) continue;
        if (Math.abs(a.x - b.x) > 5 || Math.abs(a.z - b.z) > 5) continue;
        const ba = bodyOf(a), bb = bodyOf(b);
        const c = contact(ba, bb);
        if (!c) continue;
        const a0 = { ...ba }, b0 = { ...bb };
        const hit = impulse(ba, bb, c);
        // Push apart (heavier bodies move less).
        const wa = 1 / ba.mass, wb = 1 / bb.mass, share = c.depth / (wa + wb);
        a.x -= c.nx * share * wa; a.z -= c.nz * share * wa;
        b.x += c.nx * share * wb; b.z += c.nz * share * wb;
        knock(a, ba, a0);
        knock(b, bb, b0);
        if (hit > 0.8) crashes.push({ a, b, x: c.px, z: c.pz, nx: c.nx, nz: c.nz, impact: hit });
      }
    }
  }
  /** Shove left over from a hit on a vehicle that keeps driving (police), fading out. */
  function settleShove(car: Car, dt: number) {
    if (!car.vx && !car.vz && !car.spin) return;
    const nx = car.x + car.vx * dt, nz = car.z + car.vz * dt;
    if (worldClear(nx, nz, HALF[car.kind][0])) { car.x = nx; car.z = nz; }
    car.yaw += car.spin * dt;
    const k = Math.exp(-dt * 4);
    car.vx *= k; car.vz *= k; car.spin *= k;
    if (Math.abs(car.vx) + Math.abs(car.vz) + Math.abs(car.spin) < 0.05) car.vx = car.vz = car.spin = 0;
  }

  /** Brings the parked vehicles round the player to life, lets far untouched ones go back to being drawn, and turns spots over by the clock. */
  let flipCursor = 0;
  function tendSpots(player: Point) {
    const n = spotsNear(player.x, player.z, PROMOTE);
    for (let i = 0; i < n; i++) {
      const id = nearIds[i];
      if (occ[id] && curbCars[id].mode === 'off' && curbCars[id].home && Math.hypot(SPOTS[id].x - player.x, SPOTS[id].z - player.z) < PROMOTE) promote(id);
    }
    for (const car of activeCurb) {
      if (car.mode === 'parked' && car.home && !car.touched && Math.hypot(car.x - player.x, car.z - player.z) > DEMOTE) car.mode = 'off';
    }
    // A slice of the spots each frame: one taken or freed only out of sight (design-real 4.2), and never one the player touched.
    const slice = Math.ceil(SPOTS.length / 30);
    for (let k = 0; k < slice && SPOTS.length; k++) {
      const id = flipCursor;
      flipCursor = (flipCursor + 1) % SPOTS.length;
      const car = curbCars[id];
      if (car.mode !== 'off' || !car.home || car.impounded) continue;
      const w = want(id) ? 1 : 0;
      if (w === occ[id]) continue;
      const s = SPOTS[id], d = Math.hypot(s.x - player.x, s.z - player.z);
      if (d < FLIP_HIDDEN || (d < FLIP_ANY && sees(s.x, s.z, 1.5, d))) continue;
      if (w && blockedSpot(id)) continue;
      occ[id] = w;
    }
  }
  /** Something else stands where a spot's vehicle would go. */
  function blockedSpot(id: number) {
    const s = SPOTS[id], self = curbCars[id];
    for (const car of active) {
      if (car === self || car.mode === 'off') continue;
      if (Math.abs(car.x - s.x) < 3 && Math.abs(car.z - s.z) < 3 && boxHit(car.x, car.z, HALF[car.kind][0], s.x, s.z, s.yaw, HALF[self.kind][0], HALF[self.kind][1])) return true;
    }
    return false;
  }
  /** Every taken spot looked at again now (a clock jump behind a fade): untouched vehicles come and go at once. */
  function settleSpots() {
    for (let id = 0; id < SPOTS.length; id++) {
      const car = curbCars[id];
      if (!car.home || car.touched || car.impounded) continue;
      const w = want(id) ? 1 : 0;
      if (w === occ[id]) continue;
      if (w && blockedSpot(id)) continue;
      occ[id] = w;
      if (!w && car.mode === 'parked') car.mode = 'off';
    }
  }

  /** The vehicle's matrix (into `matrix`): leaning into a bend, on its side stand, toppled. Returns its yaw rate. */
  function pose(car: Car, n: number, dt: number) {
    quat.setFromAxisAngle(up, car.yaw);
    const toppled = car.kind === 'moto' && (car.fallen || (car.mode === 'parked' && wrecks.has(car)));
    // How fast the vehicle is turning (a rising yaw is a left turn).
    const yawRate = Math.atan2(Math.sin(car.yaw - lastYaw[n]), Math.cos(car.yaw - lastYaw[n])) / Math.max(dt, 1e-3);
    lastYaw[n] = car.yaw;
    if (car.kind === 'moto') {
      const ridden = (car.mode === 'lane' || (car.mode === 'knocked' && !car.fallen)) && !!car.driver;
      // Stopped in the lane (a red light, a queue) the rider puts the left foot down and the bike tips onto it.
      footDown[n] = THREE.MathUtils.damp(footDown[n], ridden && car.mode === 'lane' && Math.abs(car.speed) < 0.3 ? 1 : 0, 5, dt);
      // Riders bank into the corner by the angle that balances it, towards the inside of the turn; a bike nobody
      // rides stands on its side stand.
      const bank = -Math.atan(car.speed * yawRate / 9.81);
      const standing = !ridden && car.mode !== 'player' && car.mode !== 'knocked';
      lean[n] = toppled ? THREE.MathUtils.damp(lean[n], TOPPLED, 9, dt)
        : standing ? THREE.MathUtils.damp(lean[n], SIDE_STAND, 6, dt)
        : THREE.MathUtils.damp(lean[n], THREE.MathUtils.clamp(bank, -0.45, 0.45) - FOOT_DOWN_TILT * footDown[n], 8, dt);
      quat.multiply(tilt.setFromAxisAngle(zAxis, lean[n]));
    }
    // Wheels on the road surface, or up on the sidewalk when a car mounts the curb.
    matrix.compose(pos.set(car.x, groundHeight(car.x, car.z) - 0.04 + (toppled ? 0.3 : 0), car.z), quat, one);
    return yawRate;
  }
  /** A parked vehicle standing in its spot, into `matrix`. */
  function spotPose(id: number) {
    const s = SPOTS[id], car = curbCars[id];
    quat.setFromAxisAngle(up, s.yaw);
    let y = spotY[id] - 0.04;
    if (car.kind === 'moto') {
      const toppled = !traffic && hash01(id, 31) < 0.5;
      quat.multiply(tilt.setFromAxisAngle(zAxis, toppled ? TOPPLED : SIDE_STAND));
      if (toppled) y += 0.3;
    }
    matrix.compose(pos.set(s.x, y, s.z), quat, one);
  }
  /** Draws every parked vehicle in view: near ones as full models, far ones as boxes; ridden or skidding ones with the fleet (lamps lit). */
  function drawParked(dt: number) {
    for (const m of curbModels.values()) m.used = 0;
    let farMoto = 0, farCar = 0, shade = 0;
    /** A parked vehicle only drawn, standing in its spot. */
    const drawSpot = (i: number) => {
      const car = curbCars[i];
      if (car === hiddenVehicle || car.impounded || car.mode !== 'off' || !occ[i] || !car.home) return;
      const s = SPOTS[i];
      const d = eyeKnown ? Math.hypot(s.x - eye.x, s.z - eye.z) : 0;
      if (d > DRAW_FAR || (view && !view.intersectsSphere(sphere.set(sphere.center.set(s.x, 0.8, s.z), car.kind === 'moto' ? 1.3 : 2.6)))) return;
      spotPose(i);
      place(car, d > LOD_NEAR ? 'far' : 'near');
      if (d < SHADOW_FAR) {
        const moto = car.kind === 'moto';
        quat.setFromAxisAngle(up, s.yaw);
        shadows.setMatrixAt(shade++, bodyMatrix.compose(pos.set(s.x, spotY[i] + 0.02, s.z), quat, scale.set(moto ? 0.9 : 2.6, 1, moto ? 2.1 : 5.2)));
      }
    };
    // The spots within draw range of the eye (the spot index), or every spot when there is no camera.
    if (eyeKnown) {
      const ix0 = Math.floor((eye.x - DRAW_FAR) / DRAW_CELL), ix1 = Math.floor((eye.x + DRAW_FAR) / DRAW_CELL), iz0 = Math.floor((eye.z - DRAW_FAR) / DRAW_CELL), iz1 = Math.floor((eye.z + DRAW_FAR) / DRAW_CELL);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const list = drawCells.get(cellKey(ix, iz));
        if (list) for (let k = 0; k < list.length; k++) drawSpot(list[k]);
      }
    } else for (let i = 0; i < curbCars.length; i++) drawSpot(i);
    // The parked vehicles that are entities (promoted, ridden, knocked about): every one is in activeCurb.
    for (const car of activeCurb) {
      if (car === hiddenVehicle || car.impounded || car.mode === 'off') continue;
      pose(car, ordinal.get(car)!, dt);
      const e = matrix.elements, d = eyeKnown ? Math.hypot(e[12] - eye.x, e[14] - eye.z) : 0;
      if (d > DRAW_FAR || (view && !view.intersectsSphere(sphere.set(sphere.center.set(e[12], e[13] + 0.8, e[14]), car.kind === 'moto' ? 1.3 : 2.6)))) continue;
      place(car, car.mode === 'player' || car.mode === 'knocked' ? 'fleet' : d > LOD_NEAR ? 'far' : 'near');
    }
    function place(car: Car, where: 'near' | 'far' | 'fleet') {
      color.copy(paintColor(paintOf(car)));
      const style = vehicleStyle(car);
      const fleetModel = where === 'fleet' ? models.get(style) : undefined;
      if (fleetModel && fleetModel.used < SPARE) {
        const slot = fleetModel.size + fleetModel.used++;
        fleetModel.body.setMatrixAt(slot, matrix);
        fleetModel.body.setColorAt(slot, color);
        fleetModel.glass?.setMatrixAt(slot, matrix);
        return;
      }
      if (where === 'far') {
        const mesh = car.kind === 'moto' ? far.moto : far.car;
        const k = car.kind === 'moto' ? farMoto++ : farCar++;
        mesh.setMatrixAt(k, matrix);
        mesh.setColorAt(k, color);
        return;
      }
      const m = curbModels.get(style)!;
      m.body.setMatrixAt(m.used, matrix);
      m.body.setColorAt(m.used, color);
      m.glass?.setMatrixAt(m.used, matrix);
      m.used++;
    }
    for (const m of curbModels.values()) {
      for (const mesh of m.glass ? [m.body, m.glass] : [m.body]) {
        mesh.count = m.used;
        mesh.visible = m.used > 0;
        if (m.used) uploadUsed(mesh, m.used);
      }
    }
    for (const [mesh, count] of [[far.moto, farMoto], [far.car, farCar], [shadows, shade]] as const) {
      mesh.count = count;
      mesh.visible = count > 0;
      if (count) uploadUsed(mesh, count);
    }
  }

  // Initial traffic spread over the streets round the start (as much as the hour allows).
  {
    const n = { traffic: 0, moto: 0, police: 0 };
    const near = spawnEdges(12, 12).laneMetres;
    for (const car of fleet) if (car.kind !== 'police' && n[car.kind] < laneAllowance(car.kind, hours, level, near) && spawnTraffic(car, 12, 12, 14)) n[car.kind]++;
  }
  rebuildActive();

  let flash = 0;
  // First-person view hides only this local vehicle's draw instances. Physics, traffic,
  // damage and the shared vehicle state continue unchanged.
  let hiddenVehicle: Car | null = null;
  return {
    setHiddenVehicle(car: Car | null) { hiddenVehicle = car; },
    /** Every vehicle: the fleet, then one per parking spot (most of those only drawn, mode 'off'). */
    cars,
    /**
     * The vehicles that can be touched this frame: the fleet and the parked ones that are entities (rebuilt each update).
     * Loops that skip mode 'off' read this instead of `cars`, so their cost follows what is round the player, not the
     * number of parking spots on the map.
     */
    get live(): readonly Car[] { return active; },
    /** The quality level (quality.ts): the lane fleet's cap follows it (design-engine §8). */
    setQuality(next: number) { level = Math.max(0, Math.min(FLEET_CAPS.length - 1, Math.round(next))); },
    /** Lane vehicles allowed round a point now, and the lane metres they share (debug and benches). */
    allowance(x: number, z: number) { const m = spawnEdges(x, z).laneMetres; return { moto: laneAllowance('moto', hours, level, m), traffic: laneAllowance('traffic', hours, level, m), laneMetres: Math.round(m), level }; },
    blocked,
    raycast,
    roadRoute,
    halfSize(kind: CarKind) { return HALF[kind]; },
    /** Takes a free police car from the pool and places it on a road `min..max` metres from the player. */
    spawnPolice(px: number, pz: number, min: number, max: number) {
      const car = fleet.find((c) => c.kind === 'police' && c.mode === 'off');
      if (!car) return null;
      // On a road centre line between min and max from the player, facing them.
      for (let attempt = 0; attempt < 60; attempt++) {
        const at = roadPoint(px, pz, min, max);
        if (!at) break;
        if (blocked(at.x, at.z, 3)) continue;
        Object.assign(car, { mode: 'chase', health: POLICE_CAR_HEALTH, x: at.x, z: at.z, speed: 0, yaw: Math.atan2(px - at.x, pz - at.z), waypoints: [], routeAt: 0, stuck: 0, driver: null, conn: null, plan: null });
        return car;
      }
      return null;
    },
    /** Parks a free cruiser at an exact spot (a roadblock); its crew gets out straight away. */
    placePolice(x: number, z: number, yaw: number) {
      const car = fleet.find((c) => c.kind === 'police' && c.mode === 'off');
      if (!car || blocked(x, z, 2.2)) return null;
      Object.assign(car, { mode: 'hold', health: POLICE_CAR_HEALTH, x, z, yaw, speed: 0, waypoints: [], routeAt: 0, stuck: 0, driver: null });
      return car;
    },
    /**
     * Steers police cars. `stars` sets how hard they push: faster cruisers, and from three stars
     * they drive straight at a player who is in a vehicle (ramming) instead of stopping short.
     */
    updatePolice(dt: number, time: number, px: number, pz: number, playerCar: Car | null, stars: number, heading = 0) {
      const top = 18 + stars * 3;
      for (const car of fleet) {
        if (car.kind !== 'police') continue;
        if (car.mode !== 'knocked' && car.mode !== 'player') settleShove(car, dt);
        if (car.mode === 'chase') {
          if (time > car.routeAt) {
            car.waypoints = roadRoute(car.x, car.z, px, pz);
            car.routeAt = time + 0.8;
          }
          const close = Math.hypot(px - car.x, pz - car.z);
          const ram = stars >= 3 && playerCar !== null && close < 30;
          // Ramming aims at the rear quarter of the player's vehicle, like a PIT manoeuvre.
          const pit = { x: px - Math.sin(heading) * 2.4 + Math.cos(heading) * 0.9, z: pz - Math.cos(heading) * 2.4 - Math.sin(heading) * 0.9 };
          const remaining = driveRoute(car, dt, top, ram ? (close < 8 ? { x: px, z: pz } : pit) : null);
          if (!ram && (remaining < 6 || close < (playerCar ? 9 : 11))) car.mode = 'hold';
        } else if (car.mode === 'hold') {
          car.speed = THREE.MathUtils.damp(car.speed, 0, 6, dt);
          const nx = car.x + Math.sin(car.yaw) * car.speed * dt, nz = car.z + Math.cos(car.yaw) * car.speed * dt;
          if (worldClear(nx, nz, 1.2) && !blocked(nx, nz, 1.0, car)) { car.x = nx; car.z = nz; }
        } else if (car.mode === 'leave') {
          if (!car.waypoints.length || time > car.routeAt) {
            // Off along the roads, away from the player.
            const ax = car.x - px, az = car.z - pz, l = Math.hypot(ax, az) || 1;
            car.waypoints = roadRoute(car.x, car.z, car.x + (ax / l) * 120, car.z + (az / l) * 120);
            car.routeAt = time + 3;
          }
          driveRoute(car, dt, 16, null);
          if (Math.hypot(px - car.x, pz - car.z) > 75 || time > car.timer) car.mode = 'off';
        }
      }
    },
    /**
     * Pushes the player's vehicle (as a body) against everything it touches, knocking traffic about and parked
     * bikes over; the body's velocity, spin and position are updated in place. Returns the impacts.
     */
    collideBody(body: Body, exclude: Car | null) {
      const crashes: Crash[] = [];
      wakeNear(body.x, body.z, 6);
      for (const car of active) {
        if (car === exclude || car.mode === 'off') continue;
        if (Math.abs(car.x - body.x) > 6 || Math.abs(car.z - body.z) > 6) continue;
        const other = bodyOf(car);
        const c = contact(body, other);
        if (!c) continue;
        const before = { ...other };
        const hit = impulse(body, other, c);
        const wa = 1 / body.mass, wb = 1 / other.mass, share = c.depth / (wa + wb);
        body.x -= c.nx * share * wa; body.z -= c.nz * share * wa;
        const ox = car.x + c.nx * share * wb, oz = car.z + c.nz * share * wb;
        if (worldClear(ox, oz, HALF[car.kind][0] * 0.8)) { car.x = ox; car.z = oz; }
        knock(car, other, before);
        if (hit > 0.8) crashes.push({ a: null, b: car, x: c.px, z: c.pz, nx: c.nx, nz: c.nz, impact: hit });
      }
      return crashes;
    },
    /**
     * `pedestrians` are people on crosswalks (and bodies lying about) this frame; traffic stops for them. `player.wanted`
     * (stars) shortens the tow of the player's own vehicle. Returns impacts between vehicles.
     */
    update(dt: number, time: number, player: PlayerView, pedestrians: Walker[]) {
      now = time;
      hours += dt / SECONDS_PER_HOUR;
      if (hours >= 24) { hours -= 24; day++; }
      crossing.length = 0;
      crossing.push(...pedestrians);
      const crashes: Crash[] = [];
      // A new map from the wiring: lane traffic starts afresh on it.
      if (laneNet() !== net) {
        net = laneNet();
        roads = net.roads;
        for (const car of fleet) if (car.mode === 'lane') Object.assign(car, { mode: 'off', driver: null, speed: 0, conn: null, plan: null });
      }
      // Streets opening and closing with the hour (traffic stays out of one about to close).
      net.refresh(hours, CLOSE_AHEAD);
      rebuildActive();
      for (const car of active) if (car.mode === 'player') adopt(car);
      // The hour's flow: surplus traffic leaves the road only unseen and far off; missing traffic spawns out of sight.
      const lanesNear = spawnEdges(player.x, player.z).laneMetres;
      const running = { traffic: 0, moto: 0, police: 0 }, allow = { traffic: laneAllowance('traffic', hours, level, lanesNear), moto: laneAllowance('moto', hours, level, lanesNear), police: 0 };
      for (const car of fleet) if (car.mode === 'lane' && car.kind !== 'police') running[car.kind]++;
      // A few spawns per frame at most (each tries a few spots out of sight).
      let spawns = 3;
      for (const car of fleet) {
        if (car.kind === 'police' || car.impounded) continue;
        if (car.mode === 'lane' || car.mode === 'parked') settleShove(car, dt);
        const dp = Math.hypot(car.x - player.x, car.z - player.z);
        if (car.mode === 'lane' && traffic && running[car.kind] > allow[car.kind] && dp > FLIP_ANY && !sees(car.x, car.z, 3, dp)) {
          Object.assign(car, { mode: 'off', driver: null, speed: 0, conn: null, plan: null });
          running[car.kind]--;
          continue;
        }
        // Caught on a street that has closed (a clock jump): gone if nobody sees it, else it drives out.
        if (car.mode === 'lane' && !car.conn && net.closedAt(car.edge, hours) && !sees(car.x, car.z, 3, dp)) {
          Object.assign(car, { mode: 'off', driver: null, speed: 0, conn: null, plan: null });
          running[car.kind]--;
          continue;
        }
        // Traffic that has drifted far away from the player reappears on a street nearer them, out of sight.
        if (car.mode === 'lane' && traffic && dp > TRAFFIC_FAR && spawns-- > 0) spawnTraffic(car, player.x, player.z, 50, true, 25);
        if (car.mode === 'lane') driveLane(car, dt, time, player);
        else if (car.mode === 'knocked') skid(car, dt, time);
        else if (traffic && car.mode === 'off' && running[car.kind] < allow[car.kind] && spawns-- > 0 && spawnTraffic(car, player.x, player.z, 35, true, 25)) running[car.kind]++;
      }
      for (const car of activeCurb) {
        if (car.mode === 'parked') settleShove(car, dt);
        else if (car.mode === 'knocked') skid(car, dt, time);
      }
      // Vehicles standing about: the blocking timer and the tow truck, the player's last one unseen, and the
      // owners or the fleet taking back what was left far away.
      for (const car of active) {
        if (car.mode === 'off' || car.kind === 'police' || car.impounded) continue;
        if (car.mode === 'player' || car.mode === 'lane') { car.still = car.unseen = 0; continue; }
        if (car.health <= 0 && car.role === 'traffic') car.role = 'wreck';
        // A parked vehicle shot up or burnt out is no longer the one drawn in its spot.
        if (car.curb && car.home && car.health <= 0) { car.home = false; car.touched = true; }
        const dp = Math.hypot(car.x - player.x, car.z - player.z);
        const seen = sees(car.x, car.z, car.kind === 'moto' ? 1.5 : 3, dp);
        const standing = car.mode === 'parked' && !(car.curb && car.home);
        car.still = standing && traffic && dp > 8 && onAsphalt(car.x, car.z) ? car.still + dt : 0;
        if (car === lastCar) car.unseen = seen || dp < 30 ? 0 : car.unseen + dt;
        if (!traffic || car.mode === 'knocked') continue;
        const limit = car.role === 'owned' ? ((player.wanted ?? 0) > 0 ? TOW.wanted : TOW.owned) : car.role === 'loose' ? TOW.loose : TOW.leftover;
        if (!seen && (car.still > limit || (car === lastCar && car.unseen > UNSEEN_TOW))) { tow(car); continue; }
        if (car === lastCar || car.role === 'owned') continue;
        if (car.curb) {
          if (!car.home && dp > FLIP_ANY && !seen) returnHome(car);
        } else if (car.mode === 'parked' && dp > 70) {
          // Abandoned vehicles far from the player are recycled into fresh traffic.
          car.timer += dt;
          if (car.timer > 4) { car.timer = 0; car.role = 'traffic'; spawnTraffic(car, player.x, player.z, 60, true); }
        } else car.timer = 0;
      }
      tendSpots(player);
      // Skidding police cars too, then every pair that touches.
      for (const car of fleet) if (car.kind === 'police' && car.mode === 'knocked') skid(car, dt, time);
      collisions(crashes);
      flash += dt;
      const phase = Math.floor(flash * 6) % 2 === 0;
      for (const b of occupantBatches) b.begin();
      solvesLeft = 6;
      let caped = 0;
      for (const model of models.values()) model.used = 0;
      fleet.forEach((car, n) => {
        const model = modelOf[n], slot = slotOf[n];
        model.glass?.setMatrixAt(slot, hidden);
        if (car.mode === 'off' || car === hiddenVehicle) {
          model.body.setMatrixAt(slot, hidden);
          if (car.kind === 'police') { lights.setMatrixAt(car.index * 2, hidden); lights.setMatrixAt(car.index * 2 + 1, hidden); }
          return;
        }
        const yawRate = pose(car, n, dt);
        model.body.setMatrixAt(slot, matrix);
        // Only a vehicle that still has its own driver shows one; a stolen or parked one does not.
        const occupied = (car.mode === 'lane' || (car.mode === 'knocked' && !car.fallen)) && !!car.driver;
        if (car.kind === 'moto') {
          // The rider sits in the bike's own frame, so it leans into corners with it.
          if (occupied) seat(n, car.driver!, vehicleStyle(car) as MotoStyle, matrix, yawRate, car.speed, footDown[n], time, dt);
          if (occupied && wet > 0.3 && caped < COUNTS.moto) { ponchos.setMatrixAt(caped, matrix); ponchos.setColorAt(caped, PONCHO_COLORS[car.index % PONCHO_COLORS.length]); caped++; }
        } else {
          if (wrecks.get(car) !== 'burnt') model.glass!.setMatrixAt(slot, matrix);
          const crewed = occupied || (car.kind === 'police' && (car.mode === 'chase' || car.mode === 'leave'));
          if (crewed) {
            const at = seatOf(car);
            seatMatrix.makeTranslation(at[0], at[1], at[2]).premultiply(matrix);
            seat(n, car.kind === 'police' ? COP : car.driver!, vehicleStyle(car) as CarStyle, seatMatrix, yawRate, car.speed, 0, time, dt);
            if (car.kind === 'police') {
              // The partner rides on the right.
              seatMatrix.makeTranslation(-at[0], at[1], at[2]).premultiply(matrix);
              seat(cars.length + n, COP, 'passenger', seatMatrix, yawRate, car.speed, 0, time, dt);
            }
          }
        }
        if (car.kind === 'police') {
          const siren = car.mode === 'chase' || car.mode === 'hold';
          for (const side of [0, 1]) {
            lightMatrix.makeTranslation(side ? 0.26 : -0.26, policeRoof.roof + 0.13, policeRoof.roofMid).premultiply(matrix);
            lights.setMatrixAt(car.index * 2 + side, lightMatrix);
            lights.setColorAt(car.index * 2 + side, !siren ? dim : (phase === (side === 0)) ? red : blue);
          }
        }
      });
      drawParked(dt);
      for (const b of occupantBatches) b.end();
      for (const model of models.values()) {
        for (const mesh of model.glass ? [model.body, model.glass] : [model.body]) {
          mesh.count = model.size + model.used;
          mesh.instanceMatrix.needsUpdate = true;
        }
        if (model.used && model.body.instanceColor) model.body.instanceColor.needsUpdate = true;
      }
      lights.instanceMatrix.needsUpdate = true;
      if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
      ponchos.count = caped;
      ponchos.visible = caped > 0;
      if (caped) uploadUsed(ponchos, caped);
      return crashes;
    },
    /** Traffic on, or (zombie mode) every vehicle abandoned on the roads, the cruisers gone and the parked ones left to rot. */
    setTraffic(on: boolean, px: number, pz: number) {
      traffic = on;
      const running = { traffic: 0, moto: 0, police: 0 };
      for (const car of fleet) {
        const had = wrecks.delete(car);
        if (had) repaint(car);
        if (car.kind === 'police') { car.mode = 'off'; continue; }
        if (car.impounded || (on && car.role === 'owned')) continue;
        if (on) { if (running[car.kind] < laneAllowance(car.kind, hours, level, spawnEdges(px, pz).laneMetres) && spawnTraffic(car, px, pz, 14)) running[car.kind]++; else car.mode = 'off'; }
        else wreck(car, px, pz);
      }
      for (const car of curbCars) {
        if (car.impounded || car.role === 'owned' || car === lastCar) continue;
        // Nothing parked moves in an apocalypse; back to normal, everything is where its owner left it.
        if (on) { if (!car.home) returnHome(car); else car.fallen = false; }
        else if (car.mode === 'parked' && car.home && car.kind === 'moto') car.fallen = hash01(car.curb!.spot, 31) < 0.5;
      }
      if (on) settleSpots();
    },
    /** The paint colour a vehicle is drawn in. */
    paintOf,
    /** Whether a vehicle is an abandoned wreck (and how badly). */
    wreckOf(car: Car) { return wrecks.get(car) ?? null; },
    /** Head and tail lamps glow brighter as night falls (0..1). */
    setNight(night: number) { lamps.value = traffic ? 0.2 + night * 0.9 : 0.05; },
    /** Rain on the streets (0..1): riders in traffic pull on their ponchos. */
    setWet(rain: number) { wet = traffic ? rain : 0; },
    /** The camera frustum (null: draw everything); the camera's position is read from its side planes. */
    setView(frustum: THREE.Frustum | null) {
      view = frustum;
      eyeKnown = false;
      if (!frustum) return;
      // Any three side planes meet at the eye: p = -(d0 (n1 x n2) + d1 (n2 x n0) + d2 (n0 x n1)) / (n0 . (n1 x n2)).
      const [p0, p1, p2] = frustum.planes, [a, b, c] = cross3;
      a.crossVectors(p1.normal, p2.normal);
      const det = p0.normal.dot(a);
      if (Math.abs(det) < 1e-9) return;
      b.crossVectors(p2.normal, p0.normal);
      c.crossVectors(p0.normal, p1.normal);
      eye.copy(a.multiplyScalar(-p0.constant)).addScaledVector(b, -p1.constant).addScaledVector(c, -p2.constant).divideScalar(det);
      eyeKnown = Number.isFinite(eye.x + eye.y + eye.z);
    },
    /**
     * The game clock the parked vehicles follow (hours 0..24, day count). `snap` turns every spot over at once (behind
     * a fade: sleeping, a time skip); otherwise spots change only out of sight.
     */
    setClock(next: number, nextDay = day, snap = false) {
      hours = ((next % 24) + 24) % 24;
      day = nextDay;
      if (snap) settleSpots();
    },
    /** Parked vehicles (curb role and spot) within r of a point, brought to life so they can be ridden, knocked or stolen. */
    curbNear(x: number, z: number, r: number) {
      const out: Car[] = [];
      const n = spotsNear(x, z, r);
      for (let i = 0; i < n; i++) {
        const id = nearIds[i];
        if (occ[id] && curbCars[id].mode === 'off' && curbCars[id].home && Math.hypot(SPOTS[id].x - x, SPOTS[id].z - z) <= r) promote(id);
      }
      for (const car of activeCurb) if (car.mode !== 'off' && car.mode !== 'player' && Math.hypot(car.x - x, car.z - z) <= r) out.push(car);
      return out;
    },
    /** Whether a parked vehicle stands within r of a point (drawn-only ones too), without waking any (street life asks often). */
    parkedAt(x: number, z: number, r: number) {
      const n = spotsNear(x, z, r);
      for (let i = 0; i < n; i++) {
        const id = nearIds[i], car = curbCars[id];
        if (car.mode === 'off' && occ[id] && car.home && Math.hypot(SPOTS[id].x - x, SPOTS[id].z - z) <= r) return true;
      }
      for (const car of activeCurb) if (car.mode === 'parked' && Math.hypot(car.x - x, car.z - z) <= r) return true;
      return false;
    },
    /** Its owner rides off on the scooter in the spot nearest (x, z) (behind a fade) and brings it back after `seconds`. */
    awayCurb(x: number, z: number, seconds: number) {
      let best = -1, bestD = 1.2;
      const n = spotsNear(x, z, 1.2);
      for (let i = 0; i < n; i++) { const id = nearIds[i], d = Math.hypot(SPOTS[id].x - x, SPOTS[id].z - z); if (d < bestD) { bestD = d; best = id; } }
      if (best < 0) return;
      const car = curbCars[best];
      if (!car.home || car.touched) return;
      awayUntil[best] = now + seconds;
      occ[best] = 0;
      if (car.mode === 'parked') car.mode = 'off';
    },
    /** Keeps the scooter in the spot nearest (x, z) parked there while somebody sits on it (street life), or lets it go. */
    pinCurb(x: number, z: number, on: boolean) {
      let best = -1, bestD = 1.2;
      const n = spotsNear(x, z, 1.2);
      for (let i = 0; i < n; i++) { const id = nearIds[i], d = Math.hypot(SPOTS[id].x - x, SPOTS[id].z - z); if (d < bestD) { bestD = d; best = id; } }
      if (best < 0) return false;
      pinned[best] = on ? 1 : 0;
      if (on && curbCars[best].home && !dead[best]) occ[best] = 1;
      return true;
    },
    /** The player's vehicle: never recycled, towed to the impound instead (the last OWNED_KEEP of them; older ones go back to the city). */
    markOwned(car: Car) {
      if (car.kind === 'police' || car.impounded) return;
      car.role = 'owned';
      owned = owned.filter((c) => c !== car);
      owned.push(car);
      while (owned.length > OWNED_KEEP) {
        const old = owned.shift()!;
        if (old.role === 'owned' && old.mode !== 'player') old.role = 'loose';
      }
    },
    /** The player's last vehicle, if it is still in town. */
    get lastCar() { return lastCar; },
    impound: {
      /** Towed player vehicles waiting at the ward police: `since` is the game hour it arrived, `fee` thousands of đồng. */
      list(): Impounded[] { return impounds.map(({ id, style, label, since, fee }) => ({ id, style, label, since, fee })); },
      /** Hands a vehicle back (the fine is paid): it stands at (x, z) facing yaw, the player's again. */
      release(id: number, x: number, z: number, yaw: number) {
        const k = impounds.findIndex((i) => i.id === id);
        // A fleet vehicle the player is driving again right now cannot also come out of the pound.
        if (k < 0 || impounds[k].car.mode === 'player') return null;
        const [{ car }] = impounds.splice(k, 1);
        Object.assign(car, {
          impounded: 0, mode: 'parked', role: 'owned', x, z, yaw, speed: 0, vx: 0, vz: 0, spin: 0, fallen: false, recoverAt: 0, driver: null,
          still: 0, unseen: 0, home: false, touched: true, health: car.kind === 'moto' ? MOTO_HEALTH : car.kind === 'police' ? POLICE_CAR_HEALTH : CAR_HEALTH,
        });
        if (car.curb && !activeCurb.includes(car)) activeCurb.push(car);
        if (!active.includes(car)) active.push(car);
        owned = owned.filter((c) => c !== car);
        owned.push(car);
        lastCar = car;
        return car;
      },
    },
    /** Called with each vehicle the tow truck takes (before it disappears). */
    onTow(cb: (car: Car) => void) { towed.push(cb); },
    /**
     * A new game: nothing is the player's any more. Owned, loose and impounded vehicles go back to traffic or to their
     * spot, the impound list and the last vehicle are forgotten (call before setTraffic, which then respawns or wrecks them).
     */
    resetPlayer() {
      hiddenVehicle = null;
      const mine = new Set<Car>([...owned, ...impounds.map((i) => i.car), ...(lastCar ? [lastCar] : []), ...cars.filter((c) => c.role === 'owned' || c.role === 'loose')]);
      impounds.length = 0;
      owned = [];
      lastCar = null;
      for (const car of mine) {
        if (car.kind === 'police') continue;
        if (car.curb) { car.impounded = 0; returnHome(car); } else backToTraffic(car);
      }
      rebuildActive();
    },
    /**
     * Something in the road: centre, half sizes across (hx) and along (hz) its heading yaw. Lane traffic gets round it
     * (a bus at its stop), or with `follow` (a bus driving or waiting at a light) queues behind it and waits while it crosses.
     */
    registerObstacle(id: string | number, x: number, z: number, hx: number, hz: number, yaw: number, follow = false, speed = 0) {
      const o = obstacles.get(id);
      if (o) Object.assign(o, { x, z, hx, hz, yaw, follow, speed }); else obstacles.set(id, { x, z, hx, hz, yaw, follow, speed });
    },
    clearObstacle(id: string | number) { obstacles.delete(id); },
    /** Counts for checks: parked spots taken, drawn near and far, live parked entities, the impound. */
    stats() {
      let taken = 0;
      for (let i = 0; i < occ.length; i++) taken += occ[i];
      let near = 0;
      for (const m of curbModels.values()) near += m.used;
      return { spots: SPOTS.length, taken, near, far: far.moto.count + far.car.count, live: activeCurb.filter((c) => c.mode !== 'off').length, impounded: impounds.length, hours, day };
    },
    dispose() {
      for (const mesh of [...meshes, ...curbMeshes, far.moto, far.car, lights, shadows, ponchos]) { scene.remove(mesh); mesh.geometry.dispose(); mesh.dispose(); }
      ponchoMaterial.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
      for (const g of lowGeometries) g.dispose();
      for (const b of occupantBatches) { scene.remove(b.mesh); b.dispose(); (b.mesh.material as THREE.Material).dispose(); }
      material.dispose();
      parkedLook.material.dispose();
      windows.dispose();
      lightMaterial.dispose();
    },
  };
}

/** A single vehicle (for other players' cars), sharing nothing with the instanced fleet. */
export function makeCarMesh(kind: CarKind, color: string) {
  const group = new THREE.Group();
  const style: CarStyle = kind === 'police' ? 'police' : 'sedan';
  group.add(new THREE.Mesh(kind === 'moto' ? motoGeometry('scooter', color) : carGeometry(style, color), vehicleMaterial().material));
  if (kind !== 'moto') group.add(new THREE.Mesh(carGlassGeometry(style), glassMaterial()));
  return group;
}
