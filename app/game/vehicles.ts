import * as THREE from 'three';
import { LAND, ROADS_X, ROADS_Z } from './city';
import { STOP_LINE, lightFor } from './signals';
import { groundHeight } from './world';
import type { RagdollLook } from './ragdoll';
import { CAR_DRIVER, FigureBatch, PART, PEG_RIDER, RIDER, figureMaterial, palette, riderGeometry, setStyle, styleOf } from './figures';
import { FLOORBOARD, MOTO_RIDER, carGeometry, carGlassGeometry, carSpec, glassMaterial, motoGeometry, vehicleMaterial, type CarStyle, type MotoStyle, type Vec3 } from './vehicle-models';

/**
 * Traffic on the street grid: cars and motorbikes that keep to right-hand lanes, stop at red lights, turn at
 * junctions and stop for anyone on a crosswalk, plus police cruisers that route along road centre lines to the
 * player. Vehicles collide as capsules: an impact exchanges momentum (with spin from where it lands), knocks
 * cars out of their lane into a skid, and topples motorbikes. Every body style (vehicle-models.ts) is one
 * instanced draw, with its glass, drivers and riders batched too.
 */
export type CarKind = 'traffic' | 'police' | 'moto';
/** `knocked`: skidding after an impact, under physics until it comes to rest. */
export type CarMode = 'lane' | 'parked' | 'player' | 'chase' | 'hold' | 'leave' | 'off' | 'knocked';
type Axis = 'x' | 'z';
type Point = { x: number; z: number };
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
};
/** A moving vehicle for collisions: centre, heading, velocity, spin, mass and capsule half-sizes. */
export type Body = { x: number; z: number; yaw: number; vx: number; vz: number; spin: number; mass: number; hw: number; hl: number };
/** One impact: where, along which normal (from `a` towards `b`), and the closing speed. */
export type Crash = { a: Car | null; b: Car; x: number; z: number; nx: number; nz: number; impact: number };

/** Roads a vehicle can drive along an axis (east-west roads for 'x'), and the junctions it meets on the way. */
const roadsAlong = (axis: Axis) => (axis === 'x' ? ROADS_Z : ROADS_X);
const junctionsAlong = (axis: Axis) => (axis === 'x' ? ROADS_X : ROADS_Z);
/** The last junction in a direction along an axis: beyond it the road only runs into the fence. */
const lastJunction = (axis: Axis, dir: number) => { const list = junctionsAlong(axis); return dir > 0 ? list[list.length - 1] : list[0]; };
/** How far from the player traffic is kept (and recycled from), so the streets around them stay busy. */
const TRAFFIC_NEAR = 170, TRAFFIC_FAR = 230;
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
const COUNTS: Record<CarKind, number> = { traffic: 12, police: 8, moto: 18 };
const BODY_COLORS = ['#c9493b', '#3f6f9f', '#e8d6a8', '#5e927c', '#f0f0ea', '#2f3a40', '#d98c3c', '#8c6fae', '#9fb4d6', '#b8b2a4'];
const MOTO_COLORS = ['#ed763e', '#4f86c6', '#c9493b', '#e8e2d0', '#2b2f33', '#86b8a0', '#d4b164', '#a57fb0'];
const TAXI_COLORS = ['#f3f1ea', '#3a9a68'];
const DUST = new THREE.Color('#9b9384');
const DRIVER_SHIRTS = ['#db9876', '#86a799', '#d4b164', '#8caaa9', '#c96f6f', '#6f86a8'];
/** Body style of each traffic car (by index), and of each motorbike: mostly scooters and step-throughs. */
const TRAFFIC_STYLES: CarStyle[] = ['sedan', 'hatch', 'suv', 'taxi', 'sedan', 'pickup', 'hatch', 'sedan', 'suv', 'taxi', 'hatch', 'sedan'];
const MOTO_STYLES: MotoStyle[] = ['scooter', 'cub', 'scooter', 'vespa', 'cub', 'sport', 'scooter', 'cub', 'scooter'];
/** The body style a vehicle is drawn with. */
export function vehicleStyle(car: Car): CarStyle | MotoStyle {
  return car.kind === 'moto' ? MOTO_STYLES[car.index % MOTO_STYLES.length] : car.kind === 'police' ? 'police' : TRAFFIC_STYLES[car.index % TRAFFIC_STYLES.length];
}
/** Hip position of whoever sits in the driver's seat, in the vehicle's own frame (metres). */
export function seatOf(car: Car): Vec3 {
  return car.kind === 'moto' ? MOTO_RIDER.hip : carSpec(vehicleStyle(car) as CarStyle).seat;
}
const COP: RagdollLook = { shirt: '#2c3e66', pants: '#1f2a40', skin: '#d3a179' };
setStyle(COP, { mask: PART.DOME | PART.CAP, hair: '#1d1916', accent: '#1f2a40', forearm: 'skin', shin: 'pants', shoes: '#15171a', width: 1, height: 1 });
// Motorbike riders: varied clothes and skin, always a helmet (it is the law), some in sun jackets and face masks.
const RIDER_SHIRTS = ['#b8463a', '#86a799', '#d4b164', '#8caaa9', '#c96f6f', '#6f86a8', '#f0f0ea', '#a57fb0', '#3f6f9f', '#7fa37a', '#2f3a48', '#5e927c'];
const RIDER_PANTS = ['#3f4d5c', '#536c69', '#6d5d4f', '#2f3a48', '#7b6a58', '#26303a', '#4f5a4a'];
const RIDER_SKINS = ['#d3a179', '#c58f69', '#e0b48e', '#b98260'];
const HELMETS = ['#f2efe6', '#c9493b', '#2b2f33', '#4f86c6', '#e2b53a', '#86b8a0', '#e8a0b4', '#7d5ba6', '#f2efe6', '#d98c3c'];
const riderParts = new WeakMap<RagdollLook, number>();
let riderCount = 0;
function hash01(k: number, salt: number) {
  let h = Math.imul(k ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** A rider's look from the rolled shirt; the rest is hashed from a counter so the traffic's random sequence is unchanged. */
function riderLook(shirt: number): RagdollLook {
  const k = ++riderCount;
  const pickOf = (list: string[], salt: number) => list[Math.floor(hash01(k, salt) * list.length)];
  const look: RagdollLook = {
    shirt: RIDER_SHIRTS[(shirt + Math.floor(hash01(k, 1) * RIDER_SHIRTS.length)) % RIDER_SHIRTS.length],
    pants: pickOf(RIDER_PANTS, 2), skin: pickOf(RIDER_SKINS, 3), helmet: pickOf(HELMETS, 4),
  };
  const mask = hash01(k, 5);
  riderParts.set(look, (hash01(k, 6) < 0.4 ? PART.SLEEVE : 0) | (mask < 0.3 ? PART.MASK : mask < 0.5 ? PART.MASK_DARK : 0));
  return look;
}

/** A car driver's look, varied by a counter hash like the riders'. */
function driverLook(shirt: number): RagdollLook {
  const k = ++riderCount;
  return { shirt: DRIVER_SHIRTS[shirt], pants: RIDER_PANTS[Math.floor(hash01(k, 7) * RIDER_PANTS.length)], skin: RIDER_SKINS[Math.floor(hash01(k, 8) * RIDER_SKINS.length)] };
}

function angleLerp(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

/** Position of a lane-driving vehicle from its road, along-coordinate and direction. */
function lanePoint(kind: CarKind, axis: Axis, road: number, along: number, dir: number) {
  const lane = LANES[kind];
  return axis === 'x' ? { x: along, z: road + dir * lane, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2 } : { x: road - dir * lane, z: along, yaw: dir > 0 ? 0 : Math.PI };
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

export function createVehicles(scene: THREE.Scene, worldClear: (x: number, z: number, radius: number) => boolean) {
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const cars: Car[] = [];
  const blank = (index: number, kind: CarKind): Car => ({
    index, kind, mode: 'off', x: 0, z: 0, yaw: 0, speed: 0, axis: 'x', road: 0, along: 0, dir: 1, plan: null,
    cruise: 10, driver: null, waypoints: [], routeAt: 0, timer: 0, stuck: 0, health: CAR_HEALTH,
    vx: 0, vz: 0, spin: 0, fallen: false, recoverAt: 0,
  });
  for (const kind of ['traffic', 'police', 'moto'] as CarKind[]) for (let i = 0; i < COUNTS[kind]; i++) cars.push(blank(i, kind));

  // One instanced model per body style; each vehicle owns a slot in its style's model.
  const { material, lamps } = vehicleMaterial();
  const windows = glassMaterial();
  type Model = { body: THREE.InstancedMesh; glass: THREE.InstancedMesh | null; size: number };
  const models = new Map<string, Model>();
  const modelOf: Model[] = [];
  const slotOf: number[] = [];
  for (const car of cars) {
    const style = vehicleStyle(car);
    let model = models.get(style);
    if (!model) {
      const capacity = cars.filter((c) => vehicleStyle(c) === style).length;
      const moto = car.kind === 'moto';
      model = {
        body: new THREE.InstancedMesh(moto ? motoGeometry(style as MotoStyle) : carGeometry(style as CarStyle), material, capacity),
        glass: moto ? null : new THREE.InstancedMesh(carGlassGeometry(style as CarStyle), windows, capacity),
        size: 0,
      };
      models.set(style, model);
    }
    modelOf.push(model);
    slotOf.push(model.size++);
  }
  const color = new THREE.Color();
  for (const [n, car] of cars.entries()) {
    const paint = car.kind === 'moto' ? MOTO_COLORS[car.index % MOTO_COLORS.length]
      : car.kind === 'police' ? '#f4f4f0'
      : vehicleStyle(car) === 'taxi' ? TAXI_COLORS[car.index % TAXI_COLORS.length] : BODY_COLORS[car.index % BODY_COLORS.length];
    modelOf[n].body.setColorAt(slotOf[n], color.set(paint));
  }
  const meshes = [...models.values()].flatMap((m) => (m.glass ? [m.body, m.glass] : [m.body]));
  // Seated people from the crowd's figure system: scooter riders (feet on the floorboard), riders of
  // manual bikes (feet on pegs), and car drivers, plus a partner in each police cruiser.
  const riderMaterial = figureMaterial();
  const carSlots = COUNTS.traffic + COUNTS.police;
  const riders = new FigureBatch(riderGeometry(RIDER), riderMaterial, COUNTS.moto);
  const pegRiders = new FigureBatch(riderGeometry(PEG_RIDER), riderMaterial, COUNTS.moto);
  const drivers = new FigureBatch(riderGeometry(CAR_DRIVER, 'all'), riderMaterial, carSlots + COUNTS.police);
  for (const batch of [riders, pegRiders, drivers]) { batch.mesh.receiveShadow = true; scene.add(batch.mesh); }
  const lookSeen = new Map<number, RagdollLook>();
  const lookData = new Map<number, Float32Array<ArrayBuffer>>();
  /** Packed palette of a seated person, repacked only when they change (`key` is a seat). */
  function seatedPalette(key: number, look: RagdollLook, helmet: boolean) {
    let data = lookData.get(key);
    if (!data) { data = new Float32Array(16); lookData.set(key, data); }
    if (lookSeen.get(key) !== look) {
      lookSeen.set(key, look);
      if (helmet) palette([look.shirt, look.pants, look.skin, '#2a2220', look.helmet ?? '#f2efe6'], PART.HELMET | (riderParts.get(look) ?? 0), data);
      else {
        const style = styleOf(look);
        palette([look.shirt, look.pants, look.skin, style.hair, style.accent], style.mask, data);
      }
    }
    return data;
  }
  const lightGeometry = new THREE.BoxGeometry(0.42, 0.12, 0.28);
  const lightMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lights = new THREE.InstancedMesh(lightGeometry, lightMaterial, COUNTS.police * 2);
  for (let i = 0; i < COUNTS.police * 2; i++) lights.setColorAt(i, color.set('#444444'));
  for (const mesh of [...meshes, lights]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }
  for (const model of models.values()) if (model.glass) model.glass.renderOrder = 2;
  const seatMatrix = new THREE.Matrix4();
  const policeRoof = carSpec('police');
  // Zombie mode: no traffic, only abandoned cars (dusty or burnt out) and toppled motorbikes.
  let traffic = true;
  const wrecks = new Map<Car, 'dusty' | 'burnt'>();
  const paintOf = (car: Car) => (car.kind === 'moto' ? MOTO_COLORS[car.index % MOTO_COLORS.length]
    : car.kind === 'police' ? '#f4f4f0'
    : vehicleStyle(car) === 'taxi' ? TAXI_COLORS[car.index % TAXI_COLORS.length] : BODY_COLORS[car.index % BODY_COLORS.length]);
  function repaint(car: Car) {
    const n = cars.indexOf(car);
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
      Object.assign(car, { mode: 'parked', x, z, yaw: random() * Math.PI * 2, speed: 0, driver: null, waypoints: [], plan: null, stuck: 0, timer: 0 });
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
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const tilt = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const red = new THREE.Color('#ff2a2a'), blue = new THREE.Color('#2a6bff'), dim = new THREE.Color('#3a3a3a');
  const crossing: Point[] = [];
  const lean = new Float32Array(cars.length);
  const lastYaw = new Float32Array(cars.length);

  /** True when a circle overlaps any vehicle's footprint except `exclude`. */
  function blocked(x: number, z: number, radius: number, exclude?: Car | null) {
    for (const car of cars) {
      if (car.mode === 'off' || car === exclude) continue;
      const dx = x - car.x, dz = z - car.z;
      if (dx * dx + dz * dz > 16) continue;
      const [hw, hl] = HALF[car.kind];
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
      // Into the vehicle's local frame: local x is its right side, local z its nose.
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const nx = THREE.MathUtils.clamp(lx, -hw, hw), nz = THREE.MathUtils.clamp(lz, -hl, hl);
      if ((lx - nx) ** 2 + (lz - nz) ** 2 < radius * radius) return true;
    }
    return false;
  }

  /** Nearest vehicle body hit by a ray (bullets stop on cars). */
  function raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
    let best: { car: Car; t: number } | null = null;
    for (const car of cars) {
      if (car.mode === 'off') continue;
      const [hw, hl] = HALF[car.kind];
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
      const ox = origin.x - car.x, oz = origin.z - car.z;
      const lo = [ox * c - oz * s, ox * s + oz * c], ld = [dir.x * c - dir.z * s, dir.x * s + dir.z * c];
      const half = [hw, hl];
      let enter = 0, exit = best ? best.t : maxT;
      for (let k = 0; k < 2 && enter <= exit; k++) {
        if (Math.abs(ld[k]) < 1e-9) { if (Math.abs(lo[k]) > half[k]) enter = Infinity; continue; }
        let t1 = (-half[k] - lo[k]) / ld[k], t2 = (half[k] - lo[k]) / ld[k];
        if (t1 > t2) [t1, t2] = [t2, t1];
        enter = Math.max(enter, t1);
        exit = Math.min(exit, t2);
      }
      if (enter > exit || enter <= 0) continue;
      const y = origin.y + dir.y * enter;
      if (y > 0 && y < (car.kind === 'moto' ? 1.9 : 1.75)) best = { car, t: enter };
    }
    return best;
  }

  function placeOnLane(car: Car, axis: Axis, road: number, along: number, dir: number) {
    Object.assign(car, { axis, road, along, dir, plan: null, speed: car.cruise * 0.6 });
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
      Object.assign(car, { vx: 0, vz: 0, spin: 0, fallen: false, recoverAt: 0 });
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

  /** What blocks the lane ahead: 'queue' behind traffic going the same way (as at a red light), 'block' otherwise. */
  function obstacleAhead(car: Car, player: Point & { car: Car | null }): 'queue' | 'block' | null {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const width = car.kind === 'moto' ? 1.1 : 2.3;
    const check = (x: number, z: number, reach: number, side = width) => {
      const dx = x - car.x, dz = z - car.z;
      const ahead = dx * fx + dz * fz, lateral = Math.abs(dx * fz - dz * fx);
      return ahead > 0 && ahead < reach && lateral < side;
    };
    if (player.car !== car && check(player.x, player.z, 8.5)) return 'block';
    for (const p of crossing) if (check(p.x, p.z, 9, 2.6)) return 'queue';
    let found: 'queue' | 'block' | null = null;
    for (const other of cars) {
      if (other === car || other.mode === 'off' || !check(other.x, other.z, other.kind === 'moto' ? 5 : 7.5)) continue;
      if (other.mode === 'lane' && other.axis === car.axis && other.dir === car.dir) found ??= 'queue';
      else return 'block';
    }
    return found;
  }

  function driveLane(car: Car, dt: number, time: number, player: Point & { car: Car | null }) {
    const obstacle = obstacleAhead(car, player);
    const waiting = obstacle !== null;
    // Blocked for too long (a parked car, a player standing in the lane): turn around instead of jamming.
    // Queueing behind traffic (at a red light) or people on a crossing is just waiting.
    car.stuck = obstacle === 'block' ? car.stuck + dt : 0;
    if (car.stuck > 4.5) {
      car.stuck = 0;
      car.dir = -car.dir;
      car.plan = null;
    }
    let target = waiting ? 0 : car.cruise;
    const hl = HALF[car.kind][1];
    // The next junction ahead (within a block).
    let junction: number | undefined;
    for (const r of junctionsAlong(car.axis)) {
      const ahead = (r - car.along) * car.dir;
      if (ahead > 0 && ahead < 60 && (junction === undefined || ahead < (junction - car.along) * car.dir)) junction = r;
    }
    if (junction !== undefined) {
      // Distance from the front bumper to the stop line before the junction.
      const gap = (junction - car.along) * car.dir - STOP_LINE - hl;
      const light = car.axis === 'x' ? lightFor(junction, car.road, 'x', time) : lightFor(car.road, junction, 'z', time);
      const stop = light === 'red' || (light === 'yellow' && gap > (car.speed * car.speed) / 9 + 1);
      if (stop && gap > -0.6) target = Math.min(target, Math.sqrt(Math.max(0, gap - 0.2) * 5));
    }
    car.speed = target < car.speed ? Math.max(target, car.speed - 7 * dt) : THREE.MathUtils.damp(car.speed, target, 1.4, dt);
    if (!car.plan) planJunction(car);
    const before = car.along;
    car.along += car.dir * car.speed * dt;
    const plan = car.plan;
    if (plan) {
      if (plan.axis === car.axis) {
        if ((car.along - plan.at) * car.dir > LANES[car.kind] + 1) car.plan = null;
      } else if ((before - plan.at) * (car.along - plan.at) <= 0) {
        car.axis = plan.axis; car.road = plan.road; car.dir = plan.dir; car.along = plan.along;
        car.plan = null;
        car.speed *= 0.6;
      }
    }
    const p = lanePoint(car.kind, car.axis, car.road, car.along, car.dir);
    // The body trails its lane point by a short lag, so it rounds every corner in a smooth arc (a radius of
    // about speed x 0.3 s) instead of pivoting on the spot, and it faces the way it is actually moving.
    const follow = 1 - Math.exp(-dt / 0.3);
    const ox = car.x, oz = car.z;
    car.x += (p.x - car.x) * follow;
    car.z += (p.z - car.z) * follow;
    const mx = car.x - ox, mz = car.z - oz;
    if (mx * mx + mz * mz > 1e-6) car.yaw = angleLerp(car.yaw, Math.atan2(mx, mz), 1 - Math.exp(-dt * 12));
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
  /** Writes a body's new motion back: traffic that took a real hit skids out of its lane; police only get shoved. */
  function knock(car: Car, body: Body, before: Body, time: number) {
    const dvx = body.vx - before.vx, dvz = body.vz - before.vz;
    const kick = Math.hypot(dvx, dvz);
    if (car.mode === 'knocked' || car.mode === 'parked' || car.mode === 'off') {
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
    if (car.kind === 'moto' && kick > 3.2) car.fallen = true;
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
  /** Back into the nearest lane heading the way the vehicle points, or left parked if it is off the road. */
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
    Object.assign(car, { mode: 'lane', axis: best.axis, road: best.road, along: best.axis === 'x' ? car.x : car.z, dir, plan: null, speed: 0, recoverAt: 0 });
  }
  /** Resolves every pair of touching vehicles where at least one is skidding; returns the impacts. */
  function collisions(time: number, crashes: Crash[]) {
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.mode === 'off' || a.mode === 'player') continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.mode === 'off' || b.mode === 'player') continue;
        if (a.mode !== 'knocked' && b.mode !== 'knocked' && !(a.kind === 'police' && a.mode === 'chase') && !(b.kind === 'police' && b.mode === 'chase')) continue;
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
        knock(a, ba, a0, time);
        knock(b, bb, b0, time);
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

  // Initial traffic spread over the grid.
  for (const car of cars) if (car.kind !== 'police') spawnTraffic(car, 12, 12, 14);

  let flash = 0;
  return {
    cars,
    blocked,
    raycast,
    roadRoute,
    halfSize(kind: CarKind) { return HALF[kind]; },
    /** Takes a free police car from the pool and places it on a road `min..max` metres from the player. */
    spawnPolice(px: number, pz: number, min: number, max: number) {
      const car = cars.find((c) => c.kind === 'police' && c.mode === 'off');
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
      const car = cars.find((c) => c.kind === 'police' && c.mode === 'off');
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
      for (const car of cars) {
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
     * Pushes the player's vehicle (as a body) against everything it touches, knocking traffic about; the body's
     * velocity, spin and position are updated in place. Returns the impacts.
     */
    collideBody(body: Body, exclude: Car | null, time: number) {
      const crashes: Crash[] = [];
      for (const car of cars) {
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
        knock(car, other, before, time);
        if (hit > 0.8) crashes.push({ a: null, b: car, x: c.px, z: c.pz, nx: c.nx, nz: c.nz, impact: hit });
      }
      return crashes;
    },
    /** `pedestrians` are people on crosswalks this frame; traffic stops for them. Returns impacts between vehicles. */
    update(dt: number, time: number, player: Point & { car: Car | null }, pedestrians: Point[]) {
      crossing.length = 0;
      crossing.push(...pedestrians);
      const crashes: Crash[] = [];
      for (const car of cars) {
        if (car.kind === 'police') continue;
        if (car.mode === 'lane' || car.mode === 'parked') settleShove(car, dt);
        // Traffic that has drifted far away from the player reappears on a street nearer them, out of sight.
        if (car.mode === 'lane' && traffic && Math.hypot(car.x - player.x, car.z - player.z) > TRAFFIC_FAR) spawnTraffic(car, player.x, player.z, 90);
        if (car.mode === 'lane') driveLane(car, dt, time, player);
        else if (car.mode === 'knocked') skid(car, dt, time);
        else if (traffic && (car.mode === 'parked' || car.mode === 'off')) {
          // Abandoned vehicles far from the player are recycled into fresh traffic.
          const far = Math.hypot(car.x - player.x, car.z - player.z) > 70;
          car.timer = far ? car.timer + dt : 0;
          if (car.mode === 'off' || car.timer > 4) { car.timer = 0; spawnTraffic(car, player.x, player.z, 60); }
        }
      }
      // Skidding police cars too, then every pair that touches.
      for (const car of cars) if (car.kind === 'police' && car.mode === 'knocked') skid(car, dt, time);
      collisions(time, crashes);
      flash += dt;
      const phase = Math.floor(flash * 6) % 2 === 0;
      riders.begin();
      pegRiders.begin();
      drivers.begin();
      cars.forEach((car, n) => {
        const model = modelOf[n], slot = slotOf[n];
        model.glass?.setMatrixAt(slot, hidden);
        if (car.mode === 'off') {
          model.body.setMatrixAt(slot, hidden);
          if (car.kind === 'police') { lights.setMatrixAt(car.index * 2, hidden); lights.setMatrixAt(car.index * 2 + 1, hidden); }
          return;
        }
        quat.setFromAxisAngle(up, car.yaw);
        const toppled = car.kind === 'moto' && (car.fallen || (car.mode === 'parked' && wrecks.has(car)));
        // How fast the vehicle is turning (a rising yaw is a left turn).
        const yawRate = Math.atan2(Math.sin(car.yaw - lastYaw[n]), Math.cos(car.yaw - lastYaw[n])) / Math.max(dt, 1e-3);
        lastYaw[n] = car.yaw;
        if (car.kind === 'moto') {
          // Riders bank into the corner by the angle that balances it, towards the inside of the turn.
          const bank = -Math.atan(car.speed * yawRate / 9.81);
          lean[n] = toppled ? THREE.MathUtils.damp(lean[n], 1.42, 9, dt) : THREE.MathUtils.damp(lean[n], THREE.MathUtils.clamp(bank, -0.45, 0.45), 8, dt);
          quat.multiply(tilt.setFromAxisAngle(zAxis, lean[n]));
        }
        // Wheels on the road surface, or up on the sidewalk when a car mounts the curb.
        matrix.compose(pos.set(car.x, groundHeight(car.x, car.z) - 0.04 + (toppled ? 0.3 : 0), car.z), quat, one);
        model.body.setMatrixAt(slot, matrix);
        // Only a vehicle that still has its own driver shows one; a stolen or parked one does not.
        const occupied = (car.mode === 'lane' || (car.mode === 'knocked' && !car.fallen)) && !!car.driver;
        if (car.kind === 'moto') {
          // The rider sits in the bike's own frame, so it leans into corners with it.
          if (occupied) (FLOORBOARD[vehicleStyle(car) as MotoStyle] ? riders : pegRiders).push(matrix, seatedPalette(n, car.driver!, true));
        } else {
          if (wrecks.get(car) !== 'burnt') model.glass!.setMatrixAt(slot, matrix);
          const crewed = occupied || (car.kind === 'police' && (car.mode === 'chase' || car.mode === 'leave'));
          if (crewed) {
            const seat = seatOf(car);
            seatMatrix.makeTranslation(seat[0], seat[1], seat[2]).premultiply(matrix);
            drivers.push(seatMatrix, seatedPalette(n, car.kind === 'police' ? COP : car.driver!, false));
            if (car.kind === 'police') {
              seatMatrix.makeTranslation(-seat[0], seat[1], seat[2]).premultiply(matrix);
              drivers.push(seatMatrix, seatedPalette(cars.length + n, COP, false));
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
      riders.end();
      pegRiders.end();
      drivers.end();
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
      if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
      return crashes;
    },
    /** Traffic on, or (zombie mode) every vehicle abandoned on the roads and the cruisers gone. */
    setTraffic(on: boolean, px: number, pz: number) {
      traffic = on;
      for (const car of cars) {
        const had = wrecks.delete(car);
        if (had) repaint(car);
        if (car.kind === 'police') { car.mode = 'off'; continue; }
        if (on) spawnTraffic(car, px, pz, 14);
        else wreck(car);
      }
    },
    /** The paint colour a vehicle is drawn in. */
    paintOf,
    /** Whether a vehicle is an abandoned wreck (and how badly). */
    wreckOf(car: Car) { return wrecks.get(car) ?? null; },
    /** Head and tail lamps glow brighter as night falls (0..1). */
    setNight(night: number) { lamps.value = traffic ? 0.2 + night * 0.9 : 0.05; },
    dispose() {
      for (const mesh of [...meshes, lights]) { scene.remove(mesh); mesh.geometry.dispose(); mesh.dispose(); }
      for (const batch of [riders, pegRiders, drivers]) { scene.remove(batch.mesh); batch.mesh.geometry.dispose(); batch.dispose(); }
      riderMaterial.dispose();
      material.dispose();
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
