import * as THREE from 'three';
import { LAND, ROADS_X, ROADS_Z } from './city';
import { STOP_LINE, lightFor } from './signals';
import { groundHeight } from './world';
import { SECONDS_PER_HOUR } from './clock';
import { playHorn } from './audio';
import { ASPHALT_HALF } from './map/terrain';
import { SPOTS, wanted as spotWanted } from './parking';
import type { RagdollLook } from './ragdoll';
import {
  CAR_DRIVER, FIGURE, FigureBatch, HAND, RIDER, TORSO, applyRig, armFK, deriveStyle, figureGeometry, figureMaterial, handCode, limbMatrix,
  palettesOf, setStyle, sideX, socket, styleOf, swingCode, twoBoneIK, type FigureKind, type FigurePalettes, type FigurePiece, type FigureStyle,
} from './figures';
import {
  FLOORBOARD, MOTO_RIDER, ModelParts, carGeometry, carGlassGeometry, carSpec, glassMaterial, motoGeometry, vehicleMaterial, type CarStyle, type MotoStyle, type Vec3,
} from './vehicle-models';

/**
 * Traffic on the street grid: cars and motorbikes that keep to right-hand lanes, stop at red lights, turn at
 * junctions, stop for anyone on a crosswalk and ease past anything standing in their lane; police cruisers that
 * route along road centre lines to the player; and every parked vehicle in town (parking.ts spots: sidewalk
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
/** Why a lane vehicle waits: a light, the vehicle ahead, people crossing, crossing traffic, or something it cannot get past. */
export type Wait = 'light' | 'queue' | 'walk' | 'cross' | 'block' | null;
type Axis = 'x' | 'z';
type Point = { x: number; z: number };
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
  axis: Axis;
  road: number;
  along: number;
  dir: number;
  plan: { axis: Axis; road: number; dir: number; at: number; along: number } | null;
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

/** Roads a vehicle can drive along an axis (east-west roads for 'x'), and the junctions it meets on the way. */
const roadsAlong = (axis: Axis) => (axis === 'x' ? ROADS_Z : ROADS_X);
const junctionsAlong = (axis: Axis) => (axis === 'x' ? ROADS_X : ROADS_Z);
/** The last junction in a direction along an axis: beyond it the road only runs into the fence. */
const lastJunction = (axis: Axis, dir: number) => { const list = junctionsAlong(axis); return dir > 0 ? list[list.length - 1] : list[0]; };
/** How far from the player traffic is kept (and recycled from), so the streets around them stay busy. */
const TRAFFIC_NEAR = 140, TRAFFIC_FAR = 200;
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
// Sài Gòn traffic is motorbikes: at most CAR_LANES cars run beside 25 bikes (83%); the spare cars are there for the
// zombie mode's wrecks. FLOW is the share of them on the road by the hour (rush hours full, the small hours a quarter).
const COUNTS: Record<CarKind, number> = { traffic: 8, police: 8, moto: 25 };
const CAR_LANES = 5;
/** Share of the lane fleet running at an hour: rush 6:30-8:30 and 16:30-19:00, daytime 0.75, late evening 0.5, night 0.25. */
export function flowShare(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  if ((h >= 6.5 && h < 8.5) || (h >= 16.5 && h < 19)) return 1;
  if ((h >= 8.5 && h < 16.5) || (h >= 19 && h < 21)) return 0.75;
  if ((h >= 21 && h < 23) || (h >= 5 && h < 6.5)) return 0.5;
  return 0.25;
}
/** How many of a kind may run in the lanes at an hour. */
const laneAllowance = (kind: CarKind, hour: number) => Math.round((kind === 'moto' ? COUNTS.moto : CAR_LANES) * flowShare(hour));
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


/** Position of a lane-driving vehicle from its road, along-coordinate, direction and distance right of the centre line. */
function lanePoint(kind: CarKind, axis: Axis, road: number, along: number, dir: number, lateral = LANES[kind]) {
  return axis === 'x' ? { x: along, z: road + dir * lateral, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2 } : { x: road - dir * lateral, z: along, yaw: dir > 0 ? 0 : Math.PI };
}

/** Whether a point is on a carriageway (north-south roads start at the riverside road). */
export function onAsphalt(x: number, z: number) {
  return ROADS_Z.some((r) => Math.abs(z - r) < ASPHALT_HALF) || (z > ROADS_Z[0] - ASPHALT_HALF && ROADS_X.some((r) => Math.abs(x - r) < ASPHALT_HALF));
}

/** Nearest point on a road centre line, used as the police destination. */
function snapToRoad(x: number, z: number) {
  let best = { x: ROADS_X[0], z, axis: 'z' as Axis, road: ROADS_X[0], d: Infinity };
  for (const r of ROADS_X) {
    const dv = Math.abs(x - r);
    if (dv < best.d) best = { x: r, z: THREE.MathUtils.clamp(z, ROADS_Z[0], LAND.maxZ - 3), axis: 'z', road: r, d: dv };
  }
  for (const r of ROADS_Z) {
    const dh = Math.abs(z - r);
    if (dh < best.d) best = { x: THREE.MathUtils.clamp(x, LAND.minX + 3, LAND.maxX - 3), z: r, axis: 'x', road: r, d: dh };
  }
  return best;
}

/** Waypoints along road centre lines from one point to another (at most one detour road). */
function roadRoute(fromX: number, fromZ: number, toX: number, toZ: number): Point[] {
  const a = snapToRoad(fromX, fromZ);
  const b = snapToRoad(toX, toZ);
  const route: Point[] = [];
  if (a.axis === b.axis && a.road === b.road) route.push({ x: b.x, z: b.z });
  else if (a.axis !== b.axis) {
    route.push(a.axis === 'z' ? { x: a.road, z: b.road } : { x: b.road, z: a.road });
    route.push({ x: b.x, z: b.z });
  } else {
    // Parallel roads: cross over on whichever perpendicular road is the shortest detour.
    const from = a.axis === 'z' ? a.z : a.x, to = a.axis === 'z' ? b.z : b.x;
    const cross = junctionsAlong(a.axis);
    const via = cross.reduce((best, r) => Math.abs(from - r) + Math.abs(to - r) < Math.abs(from - best) + Math.abs(to - best) ? r : best, cross[0]);
    if (a.axis === 'z') route.push({ x: a.road, z: via }, { x: b.road, z: via });
    else route.push({ x: via, z: a.road }, { x: via, z: b.road });
    route.push({ x: b.x, z: b.z });
  }
  if (a.d > 1.5) route.unshift({ x: a.x, z: a.z });
  return route;
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
    index, kind, mode: 'off', x: 0, z: 0, yaw: 0, speed: 0, axis: 'x', road: 0, along: 0, dir: 1, plan: null,
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
  /** Leaves a vehicle abandoned somewhere on the roads, often across a lane. */
  function wreck(car: Car) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const axis: Axis = random() < 0.5 ? 'x' : 'z';
      const roads = roadsAlong(axis), cross = junctionsAlong(axis);
      const road = roads[Math.floor(random() * roads.length)];
      const along = cross[0] + random() * (cross[cross.length - 1] - cross[0]);
      const across = (random() - 0.5) * 12;
      const x = axis === 'x' ? along : road + across, z = axis === 'x' ? road + across : along;
      if (x < LAND.minX + 4 || x > LAND.maxX - 4 || z < LAND.minZ + 4 || z > LAND.maxZ - 4 || blocked(x, z, 2.8, car) || !worldClear(x, z, 1.2)) continue;
      Object.assign(car, { mode: 'parked', role: 'wreck', x, z, yaw: random() * Math.PI * 2, speed: 0, driver: null, waypoints: [], plan: null, stuck: 0, timer: 0 });
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
  const obstacles = new Map<string | number, { x: number; z: number; hx: number; hz: number; yaw: number; follow: boolean }>();
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

  function placeOnLane(car: Car, axis: Axis, road: number, along: number, dir: number) {
    Object.assign(car, { axis, road, along, dir, plan: null, speed: car.cruise * 0.6, lateral: LANES[car.kind], lateralTarget: LANES[car.kind], wait: null });
    const p = lanePoint(car.kind, axis, road, along, dir);
    car.x = p.x; car.z = p.z; car.yaw = p.yaw;
  }

  /**
   * Puts a traffic vehicle on a random lane spot at least `minDistance` from a point, within TRAFFIC_NEAR
   * of it where possible (the city is big; traffic is kept where the player is).
   */
  function spawnTraffic(car: Car, awayX: number, awayZ: number, minDistance: number) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const axis: Axis = random() < 0.5 ? 'x' : 'z';
      const roads = roadsAlong(axis).filter((r) => Math.abs(r - (axis === 'x' ? awayZ : awayX)) < TRAFFIC_NEAR);
      if (!roads.length) continue;
      const road = roads[Math.floor(random() * roads.length)];
      const cross = junctionsAlong(axis);
      const centre = axis === 'x' ? awayX : awayZ;
      const lo = Math.max(cross[0], centre - TRAFFIC_NEAR), hi = Math.min(cross[cross.length - 1], centre + TRAFFIC_NEAR);
      if (hi <= lo) continue;
      const along = lo + random() * (hi - lo);
      // Not inside a junction or between its stop line and the crossing, where a car would sit across a red light.
      if (cross.some((r) => Math.abs(r - along) < STOP_LINE + 8)) continue;
      if (along < cross[0] + 2 || along > cross[cross.length - 1] - 2) continue;
      const dir = random() < 0.5 ? 1 : -1;
      const p = lanePoint(car.kind, axis, road, along, dir);
      if (Math.hypot(p.x - awayX, p.z - awayZ) < minDistance) continue;
      car.mode = 'lane';
      Object.assign(car, { vx: 0, vz: 0, spin: 0, fallen: false, recoverAt: 0, role: 'traffic', still: 0, unseen: 0, timer: 0 });
      car.health = car.kind === 'moto' ? MOTO_HEALTH : CAR_HEALTH;
      car.cruise = car.kind === 'moto' ? 7 + random() * 4 : 8.5 + random() * 4;
      const shirt = Math.floor(random() * DRIVER_SHIRTS.length);
      car.driver = car.kind === 'moto' ? riderLook(shirt) : driverLook(shirt);
      car.stuck = 0;
      placeOnLane(car, axis, road, along, dir);
      if (!blocked(car.x, car.z, 2.6, car)) return true;
    }
    car.mode = 'off';
    return false;
  }

  /** Decides what a lane vehicle does at the next junction, never driving into the dead-end edges. */
  function planJunction(car: Car) {
    const lane = LANES[car.kind];
    const ahead = junctionsAlong(car.axis).filter((r) => (r - car.along) * car.dir > lane + 0.5).sort((a, b) => (a - b) * car.dir)[0];
    if (ahead === undefined) { car.plan = null; return; }
    const options: { axis: Axis; road: number; dir: number; at: number; along: number }[] = [];
    if (ahead !== lastJunction(car.axis, car.dir)) options.push({ axis: car.axis, road: car.road, dir: car.dir, at: ahead, along: NaN });
    const laneCoord = car.axis === 'x' ? car.road + car.dir * lane : car.road - car.dir * lane;
    const other: Axis = car.axis === 'x' ? 'z' : 'x';
    for (const nd of [1, -1]) {
      if (car.road === lastJunction(other, nd)) continue;
      const at = other === 'z' ? ahead - nd * lane : ahead + nd * lane;
      options.push({ axis: other, road: ahead, dir: nd, at, along: laneCoord });
    }
    const straight = options.find((o) => o.axis === car.axis);
    car.plan = straight && random() < 0.45 ? straight : options[Math.floor(random() * options.length)];
  }

  /** What stands ahead of a lane vehicle (s0, s1 along the road, lo, hi across it for its centre), gathered per vehicle per frame. */
  const bands: number[] = [];
  /**
   * One lane vehicle's frame: wait for the light, the vehicle ahead, people on the crossing and crossing traffic;
   * ease past whatever stands in the lane (parked or knocked vehicles, crash leftovers, a body, a bus at its stop,
   * the player) by moving across within the asphalt, slowly, over the centre line only when nothing comes the
   * other way; wait and honk when there is no way past, and turn round only after 15 s (6 s at a police roadblock
   * or a zombie-mode wreck, which are not passed).
   */
  function driveLane(car: Car, dt: number, time: number, player: PlayerView) {
    const [hw, hl] = HALF[car.kind], L0 = LANES[car.kind];
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const width = car.kind === 'moto' ? 1.1 : 2.3;
    const check = (x: number, z: number, reach: number, side = width) => {
      const dx = x - car.x, dz = z - car.z;
      const ahead = dx * fx + dz * fz, lateral = Math.abs(dx * fz - dz * fx);
      return ahead > 0 && ahead < reach && lateral < side;
    };
    const ax = car.axis === 'x';
    // The road frame: s ahead of the lane point, l to the right of the centre line.
    const reach = Math.max(10, car.speed * 1.8 + 6) + hl;
    let wait: Wait = null, stopGap = Infinity, hard = false, oncoming = false, abandoned = false, tail = Infinity;
    bands.length = 0;
    const band = (x: number, z: number, ex: number, ez: number, deliberate: boolean, old = false) => {
      const s = ((ax ? x : z) - car.along) * car.dir, l = (ax ? z - car.road : car.road - x) * car.dir;
      const es = ax ? ex : ez, el = ax ? ez : ex;
      // Passed (its far end 2 m behind the tail), beyond the look-ahead, or off the carriageway.
      if (s + es < -hl - 2 || s - es > reach || Math.abs(l) - el > ASPHALT_HALF + 0.3) return;
      const lo = deliberate ? -Infinity : l - el - hw - PASS_MARGIN, hi = deliberate ? Infinity : l + el + hw + PASS_MARGIN;
      bands.push(s - es, s + es, lo, hi);
      if (car.lateral > lo && car.lateral < hi && s > 0) {
        stopGap = Math.min(stopGap, s - es - hl);
        if (deliberate) hard = true;
      }
      if (old && s < 15) abandoned = true;
    };
    const box = (x: number, z: number, yaw: number, bw: number, bl: number, deliberate: boolean, old = false) => {
      const sn = Math.abs(Math.sin(yaw)), cs = Math.abs(Math.cos(yaw));
      band(x, z, sn * bl + cs * bw, cs * bl + sn * bw, deliberate, old);
    };
    /** Oncoming within 40 m and nearer the centre line than the far moto lane. */
    const comesAt = (o: Car) => {
      const s = ((ax ? o.x : o.z) - car.along) * car.dir, l = (ax ? o.z - car.road : car.road - o.x) * car.dir;
      return s > -6 && s < 40 && l > -(LANES.traffic + 1.6);
    };
    if (!player.car) band(player.x, player.z, 0.7, 0.7, false);
    // People on a crosswalk anywhere across the lane: wait. A body lying in the road: go round it.
    for (const p of crossing) {
      if (p.body) band(p.x, p.z, 0.9, 0.9, false);
      else if (check(p.x, p.z, 9, 2.6)) wait = 'walk';
    }
    for (const other of active) {
      if (other === car || other.mode === 'off') continue;
      if (Math.abs(other.x - car.x) > reach + 3 || Math.abs(other.z - car.z) > reach + 3) {
        if (other.mode === 'lane' && other.axis === car.axis && other.road === car.road && other.dir !== car.dir && comesAt(other)) oncoming = true;
        continue;
      }
      if (other.mode === 'lane') {
        if (other.axis === car.axis && other.dir === car.dir) {
          // Following: wait behind the vehicle ahead (as at a red light).
          if (check(other.x, other.z, other.kind === 'moto' ? 5 : 7.5)) wait ??= 'queue';
        } else if (other.axis === car.axis) {
          // Coming the other way: keep clear of it, and do not pull out over the centre line while it is near.
          if (other.road === car.road && comesAt(other)) oncoming = true;
          const [ow, ol] = HALF[other.kind];
          box(other.x, other.z, other.yaw, ow, ol, false);
        } else if (check(other.x, other.z, 7.5)) wait = 'cross';
        continue;
      }
      if (other.kind === 'police' && (other.mode === 'chase' || other.mode === 'leave')) {
        if (check(other.x, other.z, 7.5)) wait = 'cross';
        continue;
      }
      // Standing, skidding or being driven by the player: something to get round. Roadblocks and zombie wrecks are not passed.
      const [ow, ol] = HALF[other.kind];
      box(other.x, other.z, other.yaw, ow, ol, (other.kind === 'police' && other.mode === 'hold') || wrecks.has(other), other.still > 60);
    }
    // Parked vehicles in their spots are on the sidewalk; one only drawn never stands in a lane.
    for (const o of obstacles.values()) {
      if (!o.follow) { box(o.x, o.z, o.yaw, o.hx, o.hz, false); continue; }
      // A bus in traffic, measured to the nearest point of its centre line: queue behind it like a lane vehicle, keep
      // clear of it coming the other way, wait while it crosses.
      const ox = Math.sin(o.yaw), oz = Math.cos(o.yaw), dot = ox * fx + oz * fz;
      if (Math.abs(o.x - car.x) > reach + o.hz + 3 || Math.abs(o.z - car.z) > reach + o.hz + 3) {
        if (dot < -0.7 && Math.abs(o.x - car.x) < 45 + o.hz && Math.abs(o.z - car.z) < 45 + o.hz) {
          const s = ((ax ? o.x : o.z) - car.along) * car.dir, l = (ax ? o.z - car.road : car.road - o.x) * car.dir;
          if (s > -6 && s < 40 + o.hz && l > -(LANES.traffic + 1.6) && l < ASPHALT_HALF) oncoming = true;
        }
        continue;
      }
      const along = (car.x - o.x) * ox + (car.z - o.z) * oz, u = THREE.MathUtils.clamp(along, -o.hz, o.hz), px = o.x + ox * u, pz = o.z + oz * u;
      if (dot > 0.7) {
        if (along > -o.hz - hl * 0.5) { box(o.x, o.z, o.yaw, o.hx, o.hz, false); continue; }
        // Behind it: follow at a braking distance, and queue once close.
        const gapAhead = (px - car.x) * fx + (pz - car.z) * fz - hl, side = Math.abs((px - car.x) * fz - (pz - car.z) * fx);
        if (gapAhead > -1 && side < width - hw + o.hx) { tail = Math.min(tail, gapAhead); if (gapAhead < (car.kind === 'moto' ? 3 : 2.9)) wait ??= 'queue'; }
      } else if (dot < -0.92) {
        const s = ((ax ? o.x : o.z) - car.along) * car.dir, l = (ax ? o.z - car.road : car.road - o.x) * car.dir;
        if (s > -6 - o.hz && s < 40 + o.hz && l > -(LANES.traffic + 1.6) && l < ASPHALT_HALF) oncoming = true;
        box(o.x, o.z, o.yaw, o.hx, o.hz, false);
      } else if (junctionsAlong(car.axis).some((r) => Math.abs(r - car.along) < ASPHALT_HALF + 1.5)) {
        // Already out in the junction box with a bus turning across: clear the box rather than stop in its way (the
        // bus waits), unless it stands right in front.
        box(o.x, o.z, o.yaw, o.hx, o.hz, false);
      } else if (check(px, pz, 7.5, width + o.hx)) wait = 'cross';
    }
    // Where to drive across the road: the lane if it is free, else the nearest free line (never over the centre while
    // traffic comes the other way, unless already committed to passing).
    let passing = false, noWay = false;
    // Plan the way past the nearest thing ahead and whatever stands right after it (within 6 m); anything further
    // on is dealt with once this is passed (the stop below still keeps the vehicle short of it).
    let nearest = Infinity, nearEnd = Infinity;
    for (let i = 0; i < bands.length; i += 4) if (bands[i] < nearest) { nearest = bands[i]; nearEnd = bands[i + 1]; }
    const inPlan = (i: number) => bands[i] < nearEnd + 6;
    if (bands.length) {
      const maxL = ASPHALT_HALF - hw - 0.25, own = hw + 0.15;
      const minL = car.lateral < own - 0.05 || !oncoming ? -maxL : own;
      let best = NaN, cost = Infinity;
      const consider = (l: number) => {
        if (!(l >= minL && l <= maxL)) return;
        for (let i = 0; i < bands.length; i += 4) if (inPlan(i) && l > bands[i + 2] && l < bands[i + 3]) return;
        const c = Math.abs(l - L0) + (l < own ? 1.5 : 0);
        if (c < cost) { cost = c; best = l; }
      };
      consider(L0);
      for (let i = 0; i < bands.length; i += 4) if (inPlan(i)) { consider(bands[i + 2] - 0.02); consider(bands[i + 3] + 0.02); }
      if (Number.isNaN(best)) noWay = true;
      else { car.lateralTarget = best; passing = Math.abs(best - L0) > 0.25; }
    } else car.lateralTarget = L0;
    let target = wait === 'queue' || wait === 'walk' || wait === 'cross' ? 0 : car.cruise;
    if (passing) target = Math.min(target, PASS_SPEED);
    // Stop short of whatever the current line runs into until the new line is clear of it.
    if (stopGap < Infinity) {
      target = Math.min(target, Math.sqrt(Math.max(0, stopGap - 0.5) * 4));
      if (stopGap < 3 && !wait) wait = 'block';
    }
    // Behind a bus: keep a braking distance back from its tail.
    if (tail < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, tail - 1.8) * 5));
    // The next junction ahead (within a block): its light.
    const before = car.along;
    let junction: number | undefined;
    for (const r of junctionsAlong(car.axis)) {
      const ahead = (r - car.along) * car.dir;
      if (ahead > 0 && ahead < 60 && (junction === undefined || ahead < (junction - car.along) * car.dir)) junction = r;
    }
    if (junction !== undefined) {
      // Distance from the front bumper to the stop line before the junction.
      const gap = (junction - car.along) * car.dir - STOP_LINE - hl;
      const light = ax ? lightFor(junction, car.road, 'x', time) : lightFor(car.road, junction, 'z', time);
      const stop = light === 'red' || (light === 'yellow' && gap > (car.speed * car.speed) / 9 + 1);
      if (stop && gap > -0.6) {
        const limit = Math.sqrt(Math.max(0, gap - 0.2) * 5);
        if (limit < target) { target = limit; if (limit < 1 && (!wait || wait === 'block')) wait = 'light'; }
      }
    }
    car.wait = wait;
    // Blocked with no way past: honk after a moment and, after a long wait, turn round. Waiting for a light, the
    // vehicle ahead or people crossing is just waiting.
    const stuckNow = (wait === 'block' || wait === 'cross') && car.speed < 1;
    car.stuck = stuckNow ? car.stuck + dt : 0;
    if (stuckNow && car.stuck > 1.5 && (noWay || hard)) honk(car.x, car.z, time, player);
    if (passing && abandoned) honk(car.x, car.z, time, player);
    if (car.stuck > (hard || wait === 'cross' ? 6 : 15)) {
      car.stuck = 0;
      car.dir = -car.dir;
      car.plan = null;
      car.lateral = car.lateralTarget = L0;
      car.uturns++;
    }
    car.speed = target < car.speed ? Math.max(target, car.speed - 7 * dt) : THREE.MathUtils.damp(car.speed, target, 1.4, dt);
    // Across the road mostly as it rolls (a little even when stopped, edging out to see past).
    const step = (0.8 + Math.abs(car.speed) * 0.45) * dt;
    car.lateral += THREE.MathUtils.clamp((car.lateralTarget - car.lateral) * (1 - Math.exp(-dt / 0.6)), -step, step);
    if (!car.plan) planJunction(car);
    car.along += car.dir * car.speed * dt;
    const plan = car.plan;
    if (plan) {
      if (plan.axis === car.axis) {
        if ((car.along - plan.at) * car.dir > LANES[car.kind] + 1) car.plan = null;
      } else if ((before - plan.at) * (car.along - plan.at) <= 0) {
        car.axis = plan.axis; car.road = plan.road; car.dir = plan.dir; car.along = plan.along;
        car.plan = null;
        car.speed *= 0.6;
        car.lateral = car.lateralTarget = L0;
      }
    }
    const p = lanePoint(car.kind, car.axis, car.road, car.along, car.dir, car.lateral);
    // The body trails its lane point by a short lag, so it rounds every corner in a smooth arc (a radius of
    // about speed x 0.3 s) instead of pivoting on the spot, and it faces the way it is actually moving.
    const follow = 1 - Math.exp(-dt / 0.3);
    const ox = car.x, oz = car.z;
    car.x += (p.x - car.x) * follow;
    car.z += (p.z - car.z) * follow;
    const mx = car.x - ox, mz = car.z - oz;
    if (mx * mx + mz * mz > 1e-6) {
      let desired = Math.atan2(mx, mz);
      // Edging sideways past something at a crawl, the nose points only a little off the lane; rounding a corner
      // (or turning back) it follows the arc.
      const off = Math.atan2(Math.sin(desired - p.yaw), Math.cos(desired - p.yaw));
      if (Math.abs(car.speed) < 2 && Math.abs(off) < 2.4) desired = p.yaw + THREE.MathUtils.clamp(off, -0.45, 0.45);
      car.yaw = angleLerp(car.yaw, desired, 1 - Math.exp(-dt * 12));
    }
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
    let best: { axis: Axis; road: number; d: number } | null = null;
    for (const axis of ['x', 'z'] as Axis[]) {
      const cross = axis === 'x' ? car.z : car.x;
      for (const road of roadsAlong(axis)) {
        const d = Math.abs(cross - road);
        if (d < 8 && (!best || d < best.d)) best = { axis, road, d };
      }
    }
    if (!best) { car.mode = 'parked'; return; }
    const heading = best.axis === 'x' ? Math.sin(car.yaw) : Math.cos(car.yaw);
    const dir = heading >= 0 ? 1 : -1;
    const [hw] = HALF[car.kind];
    const l = (best.axis === 'x' ? car.z - best.road : best.road - car.x) * dir;
    Object.assign(car, {
      mode: 'lane', axis: best.axis, road: best.road, along: best.axis === 'x' ? car.x : car.z, dir, plan: null, speed: 0, recoverAt: 0,
      lateral: THREE.MathUtils.clamp(l, hw + 0.15, ASPHALT_HALF - hw - 0.25), lateralTarget: LANES[car.kind],
    });
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
    for (let i = 0; i < curbCars.length; i++) {
      const car = curbCars[i], n = fleetCount + i;
      if (car.impounded) continue;
      if (car.mode === 'off') {
        if (!occ[i] || !car.home) continue;
        const s = SPOTS[i];
        const d = eyeKnown ? Math.hypot(s.x - eye.x, s.z - eye.z) : 0;
        if (d > DRAW_FAR || (view && !view.intersectsSphere(sphere.set(sphere.center.set(s.x, 0.8, s.z), car.kind === 'moto' ? 1.3 : 2.6)))) continue;
        spotPose(i);
        place(car, d > LOD_NEAR ? 'far' : 'near');
        if (d < SHADOW_FAR) {
          const moto = car.kind === 'moto';
          quat.setFromAxisAngle(up, s.yaw);
          shadows.setMatrixAt(shade++, bodyMatrix.compose(pos.set(s.x, spotY[i] + 0.02, s.z), quat, scale.set(moto ? 0.9 : 2.6, 1, moto ? 2.1 : 5.2)));
        }
        continue;
      }
      pose(car, n, dt);
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

  // Initial traffic spread over the grid (as much as the hour allows).
  {
    const n = { traffic: 0, moto: 0, police: 0 };
    for (const car of fleet) if (car.kind !== 'police' && n[car.kind] < laneAllowance(car.kind, hours) && spawnTraffic(car, 12, 12, 14)) n[car.kind]++;
  }
  rebuildActive();

  let flash = 0;
  return {
    cars,
    blocked,
    raycast,
    roadRoute,
    halfSize(kind: CarKind) { return HALF[kind]; },
    /** Takes a free police car from the pool and places it on a road `min..max` metres from the player. */
    spawnPolice(px: number, pz: number, min: number, max: number) {
      const car = fleet.find((c) => c.kind === 'police' && c.mode === 'off');
      if (!car) return null;
      for (let attempt = 0; attempt < 60; attempt++) {
        const axis: Axis = random() < 0.5 ? 'x' : 'z';
        const roads = roadsAlong(axis), cross = junctionsAlong(axis);
        const road = roads[Math.floor(random() * roads.length)];
        const centre = axis === 'x' ? px : pz;
        const lo = Math.max(cross[0] - 5, centre - max), hi = Math.min(cross[cross.length - 1] + 5, centre + max);
        if (hi <= lo) continue;
        const along = lo + random() * (hi - lo);
        const x = axis === 'x' ? along : road, z = axis === 'x' ? road : along;
        const d = Math.hypot(x - px, z - pz);
        if (d < min || d > max || blocked(x, z, 3)) continue;
        Object.assign(car, { mode: 'chase', health: POLICE_CAR_HEALTH, x, z, speed: 0, yaw: Math.atan2(px - x, pz - z), waypoints: [], routeAt: 0, stuck: 0, driver: null });
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
            const p = snapToRoad(car.x, car.z);
            const awayAlong = p.axis === 'x' ? (car.x > px ? LAND.maxX - 3 : LAND.minX + 3) : (car.z > pz ? LAND.maxZ - 3 : ROADS_Z[0]);
            car.waypoints = p.axis === 'x' ? [{ x: awayAlong, z: p.road }] : [{ x: p.road, z: awayAlong }];
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
      rebuildActive();
      for (const car of active) if (car.mode === 'player') adopt(car);
      // The hour's flow: surplus traffic leaves the road only unseen and far off; missing traffic spawns out of sight.
      const running = { traffic: 0, moto: 0, police: 0 }, allow = { traffic: laneAllowance('traffic', hours), moto: laneAllowance('moto', hours), police: 0 };
      for (const car of fleet) if (car.mode === 'lane' && car.kind !== 'police') running[car.kind]++;
      for (const car of fleet) {
        if (car.kind === 'police' || car.impounded) continue;
        if (car.mode === 'lane' || car.mode === 'parked') settleShove(car, dt);
        const dp = Math.hypot(car.x - player.x, car.z - player.z);
        if (car.mode === 'lane' && traffic && running[car.kind] > allow[car.kind] && dp > FLIP_ANY && !sees(car.x, car.z, 3, dp)) {
          Object.assign(car, { mode: 'off', driver: null, speed: 0 });
          running[car.kind]--;
          continue;
        }
        // Traffic that has drifted far away from the player reappears on a street nearer them, out of sight.
        if (car.mode === 'lane' && traffic && dp > TRAFFIC_FAR) spawnTraffic(car, player.x, player.z, 90);
        if (car.mode === 'lane') driveLane(car, dt, time, player);
        else if (car.mode === 'knocked') skid(car, dt, time);
        else if (traffic && car.mode === 'off' && running[car.kind] < allow[car.kind] && spawnTraffic(car, player.x, player.z, 60)) running[car.kind]++;
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
          if (car.timer > 4) { car.timer = 0; car.role = 'traffic'; spawnTraffic(car, player.x, player.z, 60); }
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
        if (car.mode === 'off') {
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
        if (on) { if (running[car.kind] < laneAllowance(car.kind, hours) && spawnTraffic(car, px, pz, 14)) running[car.kind]++; else car.mode = 'off'; }
        else wreck(car);
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
    registerObstacle(id: string | number, x: number, z: number, hx: number, hz: number, yaw: number, follow = false) {
      const o = obstacles.get(id);
      if (o) Object.assign(o, { x, z, hx, hz, yaw, follow }); else obstacles.set(id, { x, z, hx, hz, yaw, follow });
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
