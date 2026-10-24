import * as THREE from 'three';
import { BOUND, ROADS } from './city';
import { groundHeight } from './world';
import type { RagdollLook } from './ragdoll';
import { CAR_DRIVER, FigureBatch, PART, PEG_RIDER, RIDER, figureMaterial, palette, riderGeometry, setStyle, styleOf } from './figures';
import { FLOORBOARD, MOTO_RIDER, carGeometry, carGlassGeometry, carSpec, glassMaterial, motoGeometry, vehicleMaterial, type CarStyle, type MotoStyle, type Vec3 } from './vehicle-models';

/**
 * Traffic on the street grid: cars and motorbikes that keep to right-hand lanes, turn at junctions and
 * stop for anyone on a crosswalk, plus police cruisers that route along road centre lines to the player.
 * Every body style (vehicle-models.ts) is one instanced draw, with its glass, drivers and riders batched too.
 */
export type CarKind = 'traffic' | 'police' | 'moto';
export type CarMode = 'lane' | 'parked' | 'player' | 'chase' | 'hold' | 'leave' | 'off';
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
};

const EDGE = Math.max(...ROADS);
export const CAR_HALF_WIDTH = 1.05;
export const CAR_HALF_LENGTH = 2.3;
export const CAR_HEALTH = 160;
export const POLICE_CAR_HEALTH = 220;
export const MOTO_HEALTH = 70;
const HALF: Record<CarKind, [number, number]> = { traffic: [CAR_HALF_WIDTH, CAR_HALF_LENGTH], police: [CAR_HALF_WIDTH, CAR_HALF_LENGTH], moto: [0.4, 1.0] };
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
  const limit = BOUND - 3;
  let best = { x: ROADS[0], z, axis: 'z' as Axis, road: ROADS[0], d: Infinity };
  for (const r of ROADS) {
    const dv = Math.abs(x - r);
    if (dv < best.d) best = { x: r, z: THREE.MathUtils.clamp(z, -limit, limit), axis: 'z', road: r, d: dv };
    const dh = Math.abs(z - r);
    if (dh < best.d) best = { x: THREE.MathUtils.clamp(x, -limit, limit), z: r, axis: 'x', road: r, d: dh };
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
    const via = ROADS.reduce((best, r) => Math.abs(from - r) + Math.abs(to - r) < Math.abs(from - best) + Math.abs(to - best) ? r : best, ROADS[0]);
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
      const road = ROADS[Math.floor(random() * ROADS.length)];
      const along = -EDGE + random() * EDGE * 2;
      const across = (random() - 0.5) * 12;
      const x = axis === 'x' ? along : road + across, z = axis === 'x' ? road + across : along;
      if (Math.abs(x) > BOUND - 4 || Math.abs(z) > BOUND - 4 || blocked(x, z, 2.8, car) || !worldClear(x, z, 1.2)) continue;
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

  /** Puts a traffic vehicle on a random lane spot at least `minDistance` from a point. */
  function spawnTraffic(car: Car, awayX: number, awayZ: number, minDistance: number) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const axis: Axis = random() < 0.5 ? 'x' : 'z';
      const road = ROADS[Math.floor(random() * ROADS.length)];
      let along = -EDGE + random() * EDGE * 2;
      if (ROADS.some((r) => Math.abs(r - along) < 9)) along += 12;
      if (Math.abs(along) > EDGE - 2) continue;
      const dir = random() < 0.5 ? 1 : -1;
      const p = lanePoint(car.kind, axis, road, along, dir);
      if (Math.hypot(p.x - awayX, p.z - awayZ) < minDistance) continue;
      car.mode = 'lane';
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
    const ahead = ROADS.filter((r) => (r - car.along) * car.dir > lane + 0.5).sort((a, b) => (a - b) * car.dir)[0];
    if (ahead === undefined) { car.plan = null; return; }
    const options: { axis: Axis; road: number; dir: number; at: number; along: number }[] = [];
    if (!(Math.abs(ahead) === EDGE && Math.sign(ahead) === car.dir)) options.push({ axis: car.axis, road: car.road, dir: car.dir, at: ahead, along: NaN });
    const laneCoord = car.axis === 'x' ? car.road + car.dir * lane : car.road - car.dir * lane;
    const other: Axis = car.axis === 'x' ? 'z' : 'x';
    for (const nd of [1, -1]) {
      if (Math.abs(car.road) === EDGE && Math.sign(car.road) === nd) continue;
      const at = other === 'z' ? ahead - nd * lane : ahead + nd * lane;
      options.push({ axis: other, road: ahead, dir: nd, at, along: laneCoord });
    }
    const straight = options.find((o) => o.axis === car.axis);
    car.plan = straight && random() < 0.45 ? straight : options[Math.floor(random() * options.length)];
  }

  function obstacleAhead(car: Car, player: Point & { car: Car | null }) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const width = car.kind === 'moto' ? 1.1 : 2.3;
    const check = (x: number, z: number, reach: number, side = width) => {
      const dx = x - car.x, dz = z - car.z;
      const ahead = dx * fx + dz * fz, lateral = Math.abs(dx * fz - dz * fx);
      return ahead > 0 && ahead < reach && lateral < side;
    };
    if (player.car !== car && check(player.x, player.z, 8.5)) return true;
    for (const p of crossing) if (check(p.x, p.z, 9, 2.6)) return true;
    for (const other of cars) if (other !== car && other.mode !== 'off' && check(other.x, other.z, other.kind === 'moto' ? 5 : 7.5)) return true;
    return false;
  }

  function driveLane(car: Car, dt: number, player: Point & { car: Car | null }) {
    const waiting = obstacleAhead(car, player);
    // Blocked for too long (a parked car, a player standing in the lane): turn around instead of jamming.
    car.stuck = waiting ? car.stuck + dt : 0;
    if (car.stuck > 4.5) {
      car.stuck = 0;
      car.dir = -car.dir;
      car.plan = null;
    }
    const target = waiting ? 0 : car.cruise;
    car.speed = THREE.MathUtils.damp(car.speed, target, target ? 1.4 : 6, dt);
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
    // Ease into the new lane position so turns at junctions are a curve, not a jump.
    const ease = 1 - Math.exp(-dt * 6);
    if (car.axis === 'x') { car.x = p.x; car.z += (p.z - car.z) * ease; }
    else { car.z = p.z; car.x += (p.x - car.x) * ease; }
    car.yaw = angleLerp(car.yaw, p.yaw, 1 - Math.exp(-dt * 5));
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
      const limit = BOUND - 5;
      for (let attempt = 0; attempt < 40; attempt++) {
        const axis: Axis = random() < 0.5 ? 'x' : 'z';
        const road = ROADS[Math.floor(random() * ROADS.length)];
        const along = -limit + random() * limit * 2;
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
            const far = BOUND - 3;
            const awayAlong = p.axis === 'x' ? (car.x > px ? far : -far) : (car.z > pz ? far : -far);
            car.waypoints = p.axis === 'x' ? [{ x: awayAlong, z: p.road }] : [{ x: p.road, z: awayAlong }];
            car.routeAt = time + 3;
          }
          driveRoute(car, dt, 16, null);
          if (Math.hypot(px - car.x, pz - car.z) > 75 || time > car.timer) car.mode = 'off';
        }
      }
    },
    /** `pedestrians` are people on crosswalks this frame; traffic stops for them. */
    update(dt: number, time: number, player: Point & { car: Car | null }, pedestrians: Point[]) {
      crossing.length = 0;
      crossing.push(...pedestrians);
      for (const car of cars) {
        if (car.kind === 'police') continue;
        if (car.mode === 'lane') driveLane(car, dt, player);
        else if (traffic && (car.mode === 'parked' || car.mode === 'off')) {
          // Abandoned vehicles far from the player are recycled into fresh traffic.
          const far = Math.hypot(car.x - player.x, car.z - player.z) > 70;
          car.timer = far ? car.timer + dt : 0;
          if (car.mode === 'off' || car.timer > 4) { car.timer = 0; spawnTraffic(car, player.x, player.z, 60); }
        }
      }
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
        const toppled = car.kind === 'moto' && car.mode === 'parked' && wrecks.has(car);
        if (car.kind === 'moto') {
          // Riders lean into corners a little.
          const goal = car.mode === 'lane' ? lanePoint(car.kind, car.axis, car.road, car.along, car.dir).yaw : car.yaw;
          const turn = Math.atan2(Math.sin(goal - car.yaw), Math.cos(goal - car.yaw));
          lean[n] = toppled ? 1.42 : THREE.MathUtils.damp(lean[n], THREE.MathUtils.clamp(-turn * 0.6, -0.35, 0.35), 6, dt);
          quat.multiply(tilt.setFromAxisAngle(zAxis, lean[n]));
        }
        // Wheels on the road surface, or up on the sidewalk when a car mounts the curb.
        matrix.compose(pos.set(car.x, groundHeight(car.x, car.z) - 0.04 + (toppled ? 0.3 : 0), car.z), quat, one);
        model.body.setMatrixAt(slot, matrix);
        // Only a vehicle that still has its own driver shows one; a stolen or parked one does not.
        const occupied = car.mode === 'lane' && !!car.driver;
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
