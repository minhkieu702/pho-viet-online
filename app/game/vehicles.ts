import * as THREE from 'three';
import type { RagdollLook } from './ragdoll';

/**
 * Cars on the street grid: traffic that follows right-hand lanes and turns at junctions, and
 * police cruisers that route along road centre lines to chase the player. Each car model is a
 * single vertex-coloured geometry drawn with instancing, so the whole fleet costs three draw calls.
 */
export type CarKind = 'traffic' | 'police';
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

const ROADS = [-54, 0, 54];
const LANE = 3.2;
const EDGE = 54;
export const CAR_HALF_WIDTH = 1.05;
export const CAR_HALF_LENGTH = 2.3;
export const CAR_HEALTH = 160;
export const POLICE_CAR_HEALTH = 220;
const TRAFFIC = 10;
const POLICE = 4;
const BODY_COLORS = ['#c9493b', '#3f6f9f', '#e8d6a8', '#5e927c', '#f0f0ea', '#2f3a40', '#d98c3c', '#8c6fae', '#9fb4d6', '#b8b2a4'];
const DRIVER_SHIRTS = ['#db9876', '#86a799', '#d4b164', '#8caaa9', '#c96f6f', '#6f86a8'];

function angleLerp(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

function carGeometry(police: boolean) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, hex: string) => {
    const part = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const base = positions.length / 3;
    positions.push(...part.attributes.position.array);
    normals.push(...part.attributes.normal.array);
    color.set(hex);
    for (let i = 0; i < part.attributes.position.count; i++) colors.push(color.r, color.g, color.b);
    for (const i of part.index!.array) indices.push(base + i);
    part.dispose();
  };
  // Body parts are white so the per-car instance colour paints them.
  add(2.0, 0.62, 4.4, 0, 0.72, 0, '#ffffff');
  add(1.76, 0.62, 2.3, 0, 1.33, -0.25, '#ffffff');
  add(1.8, 0.4, 2.34, 0, 1.37, -0.25, '#26343a');
  for (const sx of [-1, 1]) {
    for (const sz of [-1.4, 1.45]) add(0.3, 0.68, 0.68, sx * 0.92, 0.36, sz, '#1e2424');
    add(0.42, 0.16, 0.06, sx * 0.6, 0.86, 2.21, '#fff6cf');
    add(0.42, 0.16, 0.06, sx * 0.6, 0.86, -2.21, '#d33a2c');
  }
  add(2.02, 0.18, 0.12, 0, 0.5, 2.22, '#5a6060');
  add(2.02, 0.18, 0.12, 0, 0.5, -2.22, '#5a6060');
  if (police) {
    add(2.04, 0.18, 3.2, 0, 0.86, 0, '#1f4fa8');
    add(1.2, 0.12, 0.38, 0, 1.7, -0.25, '#333b40');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Position of a lane-driving car from its road, along-coordinate and direction. */
function lanePoint(axis: Axis, road: number, along: number, dir: number) {
  return axis === 'x' ? { x: along, z: road + dir * LANE, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2 } : { x: road - dir * LANE, z: along, yaw: dir > 0 ? 0 : Math.PI };
}

/** Nearest point on a road centre line, used as the police destination. */
function snapToRoad(x: number, z: number) {
  let best = { x: ROADS[0], z, axis: 'z' as Axis, road: ROADS[0], d: Infinity };
  for (const r of ROADS) {
    const dv = Math.abs(x - r);
    if (dv < best.d) best = { x: r, z: THREE.MathUtils.clamp(z, -82, 82), axis: 'z', road: r, d: dv };
    const dh = Math.abs(z - r);
    if (dh < best.d) best = { x: THREE.MathUtils.clamp(x, -82, 82), z: r, axis: 'x', road: r, d: dh };
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

/** A single car mesh (for other players' cars), sharing nothing with the instanced fleet. */
export function makeCarMesh(kind: CarKind, color: string) {
  const mesh = new THREE.Mesh(carGeometry(kind === 'police'), new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: 0.5, metalness: 0.15 }));
  mesh.castShadow = false;
  return mesh;
}

export function createVehicles(scene: THREE.Scene, worldClear: (x: number, z: number, radius: number) => boolean) {
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const cars: Car[] = [];
  const blank = (index: number, kind: CarKind): Car => ({
    index, kind, mode: 'off', x: 0, z: 0, yaw: 0, speed: 0, axis: 'x', road: 0, along: 0, dir: 1, plan: null,
    cruise: 10, driver: null, waypoints: [], routeAt: 0, timer: 0, stuck: 0, health: CAR_HEALTH,
  });
  for (let i = 0; i < TRAFFIC; i++) cars.push(blank(i, 'traffic'));
  for (let i = 0; i < POLICE; i++) cars.push(blank(i, 'police'));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });
  const trafficGeometry = carGeometry(false);
  const policeGeometry = carGeometry(true);
  const trafficMesh = new THREE.InstancedMesh(trafficGeometry, material, TRAFFIC);
  const policeMesh = new THREE.InstancedMesh(policeGeometry, material, POLICE);
  const lightGeometry = new THREE.BoxGeometry(0.5, 0.16, 0.32);
  const lightMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lights = new THREE.InstancedMesh(lightGeometry, lightMaterial, POLICE * 2);
  const color = new THREE.Color();
  for (let i = 0; i < TRAFFIC; i++) trafficMesh.setColorAt(i, color.set(BODY_COLORS[i % BODY_COLORS.length]));
  for (let i = 0; i < POLICE; i++) policeMesh.setColorAt(i, color.set('#f4f4f0'));
  for (let i = 0; i < POLICE * 2; i++) lights.setColorAt(i, color.set('#444444'));
  for (const mesh of [trafficMesh, policeMesh, lights]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }

  const matrix = new THREE.Matrix4();
  const lightMatrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const red = new THREE.Color('#ff2a2a'), blue = new THREE.Color('#2a6bff'), dim = new THREE.Color('#3a3a3a');

  /** True when a circle overlaps any car's footprint except `exclude`. */
  function blocked(x: number, z: number, radius: number, exclude?: Car | null) {
    for (const car of cars) {
      if (car.mode === 'off' || car === exclude) continue;
      const dx = x - car.x, dz = z - car.z;
      if (dx * dx + dz * dz > 16) continue;
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
      // Into the car's local frame: local x is its right side, local z its nose.
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const nx = THREE.MathUtils.clamp(lx, -CAR_HALF_WIDTH, CAR_HALF_WIDTH), nz = THREE.MathUtils.clamp(lz, -CAR_HALF_LENGTH, CAR_HALF_LENGTH);
      if ((lx - nx) ** 2 + (lz - nz) ** 2 < radius * radius) return true;
    }
    return false;
  }

  /** Nearest car body hit by a ray (bullets stop on cars). */
  function raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
    let best: { car: Car; t: number } | null = null;
    for (const car of cars) {
      if (car.mode === 'off' || origin.y + dir.y * maxT > 1.8 && origin.y > 1.8) continue;
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
      const ox = origin.x - car.x, oz = origin.z - car.z;
      const lo = [ox * c - oz * s, ox * s + oz * c], ld = [dir.x * c - dir.z * s, dir.x * s + dir.z * c];
      const half = [CAR_HALF_WIDTH, CAR_HALF_LENGTH];
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
      if (y > 0 && y < 1.75) best = { car, t: enter };
    }
    return best;
  }

  function placeOnLane(car: Car, axis: Axis, road: number, along: number, dir: number) {
    Object.assign(car, { axis, road, along, dir, plan: null, speed: car.cruise * 0.6 });
    const p = lanePoint(axis, road, along, dir);
    car.x = p.x; car.z = p.z; car.yaw = p.yaw;
  }

  /** Puts a traffic car on a random lane spot at least `minDistance` from a point. */
  function spawnTraffic(car: Car, awayX: number, awayZ: number, minDistance: number) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const axis: Axis = random() < 0.5 ? 'x' : 'z';
      const road = ROADS[Math.floor(random() * 3)];
      let along = -EDGE + random() * EDGE * 2;
      if (ROADS.some((r) => Math.abs(r - along) < 9)) along += 12;
      if (Math.abs(along) > EDGE - 2) continue;
      const dir = random() < 0.5 ? 1 : -1;
      const p = lanePoint(axis, road, along, dir);
      if (Math.hypot(p.x - awayX, p.z - awayZ) < minDistance) continue;
      car.mode = 'lane';
      car.health = CAR_HEALTH;
      car.cruise = 8.5 + random() * 4;
      car.driver = { shirt: DRIVER_SHIRTS[Math.floor(random() * DRIVER_SHIRTS.length)], pants: '#3f4d5c', skin: '#d3a179' };
      placeOnLane(car, axis, road, along, dir);
      if (!blocked(car.x, car.z, 2.6, car)) return true;
    }
    car.mode = 'off';
    return false;
  }

  /** Decides what a lane car does at the next junction, never driving into the dead-end edges. */
  function planJunction(car: Car) {
    const ahead = ROADS.filter((r) => (r - car.along) * car.dir > LANE + 0.5).sort((a, b) => (a - b) * car.dir)[0];
    if (ahead === undefined) { car.plan = null; return; }
    const options: { axis: Axis; road: number; dir: number; at: number; along: number }[] = [];
    if (!(Math.abs(ahead) === EDGE && Math.sign(ahead) === car.dir)) options.push({ axis: car.axis, road: car.road, dir: car.dir, at: ahead, along: NaN });
    const laneCoord = car.axis === 'x' ? car.road + car.dir * LANE : car.road - car.dir * LANE;
    const other: Axis = car.axis === 'x' ? 'z' : 'x';
    for (const nd of [1, -1]) {
      if (Math.abs(car.road) === EDGE && Math.sign(car.road) === nd) continue;
      const at = other === 'z' ? ahead - nd * LANE : ahead + nd * LANE;
      options.push({ axis: other, road: ahead, dir: nd, at, along: laneCoord });
    }
    const straight = options.find((o) => o.axis === car.axis);
    car.plan = straight && random() < 0.45 ? straight : options[Math.floor(random() * options.length)];
  }

  function obstacleAhead(car: Car, player: Point & { car: Car | null }) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const check = (x: number, z: number, reach: number) => {
      const dx = x - car.x, dz = z - car.z;
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      return ahead > 0 && ahead < reach && side < 2.3;
    };
    if (player.car !== car && check(player.x, player.z, 8.5)) return true;
    for (const other of cars) if (other !== car && other.mode !== 'off' && check(other.x, other.z, 7.5)) return true;
    return false;
  }

  function driveLane(car: Car, dt: number, player: Point & { car: Car | null }) {
    const waiting = obstacleAhead(car, player);
    // Blocked for too long (a parked car, a player standing in the lane): turn around instead of jamming.
    car.stuck = waiting ? car.stuck + dt : 0;
    if (car.stuck > 4) {
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
        if ((car.along - plan.at) * car.dir > LANE + 1) car.plan = null;
      } else if ((before - plan.at) * (car.along - plan.at) <= 0) {
        car.axis = plan.axis; car.road = plan.road; car.dir = plan.dir; car.along = plan.along;
        car.plan = null;
        car.speed *= 0.6;
      }
    }
    const p = lanePoint(car.axis, car.road, car.along, car.dir);
    car.x = p.x; car.z = p.z;
    car.yaw = angleLerp(car.yaw, p.yaw, 1 - Math.exp(-dt * 9));
  }

  /** Steers toward the next waypoint; returns the distance left to the final one. */
  function driveRoute(car: Car, dt: number, topSpeed: number, player: Car | null) {
    while (car.waypoints.length > 1 && Math.hypot(car.waypoints[0].x - car.x, car.waypoints[0].z - car.z) < 4) car.waypoints.shift();
    const next = car.waypoints[0];
    if (!next) { car.speed = THREE.MathUtils.damp(car.speed, 0, 5, dt); return 0; }
    const desired = Math.atan2(next.x - car.x, next.z - car.z);
    car.yaw = angleLerp(car.yaw, desired, 1 - Math.exp(-dt * 4.5));
    const gap = Math.abs(Math.atan2(Math.sin(desired - car.yaw), Math.cos(desired - car.yaw)));
    const remaining = Math.hypot(next.x - car.x, next.z - car.z);
    const target = car.waypoints.length === 1 && remaining < 12 ? Math.min(topSpeed, remaining) : gap > 0.7 ? 7 : topSpeed;
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
    void player;
    return car.waypoints.length === 1 ? remaining : remaining + 20;
  }

  // Initial traffic spread over the grid.
  for (const car of cars) if (car.kind === 'traffic') spawnTraffic(car, 5, 12, 14);

  let flash = 0;
  return {
    cars,
    blocked,
    raycast,
    roadRoute,
    /** Takes a free police car from the pool and places it on a road `min..max` metres from the player. */
    spawnPolice(px: number, pz: number, min: number, max: number) {
      const car = cars.find((c) => c.kind === 'police' && c.mode === 'off');
      if (!car) return null;
      for (let attempt = 0; attempt < 40; attempt++) {
        const axis: Axis = random() < 0.5 ? 'x' : 'z';
        const road = ROADS[Math.floor(random() * 3)];
        const along = -80 + random() * 160;
        const x = axis === 'x' ? along : road, z = axis === 'x' ? road : along;
        const d = Math.hypot(x - px, z - pz);
        if (d < min || d > max || blocked(x, z, 3)) continue;
        Object.assign(car, { mode: 'chase', health: POLICE_CAR_HEALTH, x, z, speed: 0, yaw: Math.atan2(px - x, pz - z), waypoints: [], routeAt: 0, stuck: 0, driver: null });
        return car;
      }
      return null;
    },
    /** Steers police cars along roads; returns nothing, callers read `car.mode` and positions. */
    updatePolice(dt: number, time: number, px: number, pz: number, playerCar: Car | null) {
      for (const car of cars) {
        if (car.kind !== 'police') continue;
        if (car.mode === 'chase') {
          if (time > car.routeAt) {
            car.waypoints = roadRoute(car.x, car.z, px, pz);
            car.routeAt = time + 0.8;
          }
          const remaining = driveRoute(car, dt, 22, playerCar);
          if (remaining < 6 || Math.hypot(px - car.x, pz - car.z) < 11) car.mode = 'hold';
        } else if (car.mode === 'hold') {
          car.speed = THREE.MathUtils.damp(car.speed, 0, 6, dt);
          const nx = car.x + Math.sin(car.yaw) * car.speed * dt, nz = car.z + Math.cos(car.yaw) * car.speed * dt;
          if (worldClear(nx, nz, 1.2) && !blocked(nx, nz, 1.0, car)) { car.x = nx; car.z = nz; }
        } else if (car.mode === 'leave') {
          if (!car.waypoints.length || time > car.routeAt) {
            const p = snapToRoad(car.x, car.z);
            const awayAlong = p.axis === 'x' ? (car.x > px ? 84 : -84) : (car.z > pz ? 84 : -84);
            car.waypoints = p.axis === 'x' ? [{ x: awayAlong, z: p.road }] : [{ x: p.road, z: awayAlong }];
            car.routeAt = time + 3;
          }
          driveRoute(car, dt, 16, playerCar);
          if (Math.hypot(px - car.x, pz - car.z) > 75 || time > car.timer) car.mode = 'off';
        }
      }
    },
    update(dt: number, time: number, player: Point & { car: Car | null }) {
      for (const car of cars) {
        if (car.kind !== 'traffic') continue;
        if (car.mode === 'lane') driveLane(car, dt, player);
        else if (car.mode === 'parked' || car.mode === 'off') {
          // Abandoned cars far from the player are recycled into fresh traffic.
          const far = Math.hypot(car.x - player.x, car.z - player.z) > 70;
          car.timer = far ? car.timer + dt : 0;
          if (car.mode === 'off' || car.timer > 4) { car.timer = 0; spawnTraffic(car, player.x, player.z, 60); }
        }
      }
      flash += dt;
      const phase = Math.floor(flash * 6) % 2 === 0;
      for (const car of cars) {
        const mesh = car.kind === 'traffic' ? trafficMesh : policeMesh;
        if (car.mode === 'off') {
          mesh.setMatrixAt(car.index, hidden);
          if (car.kind === 'police') { lights.setMatrixAt(car.index * 2, hidden); lights.setMatrixAt(car.index * 2 + 1, hidden); }
          continue;
        }
        quat.setFromAxisAngle(up, car.yaw);
        matrix.compose(pos.set(car.x, 0.06, car.z), quat, one);
        mesh.setMatrixAt(car.index, matrix);
        if (car.kind === 'police') {
          const siren = car.mode === 'chase' || car.mode === 'hold';
          for (const side of [0, 1]) {
            lightMatrix.makeTranslation(side ? 0.32 : -0.32, 1.83, -0.25).premultiply(matrix);
            lights.setMatrixAt(car.index * 2 + side, lightMatrix);
            lights.setColorAt(car.index * 2 + side, !siren ? dim : (phase === (side === 0)) ? red : blue);
          }
        }
      }
      trafficMesh.instanceMatrix.needsUpdate = true;
      policeMesh.instanceMatrix.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
      if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [trafficMesh, policeMesh, lights]) { scene.remove(mesh); mesh.dispose(); }
      material.dispose();
      lightMaterial.dispose();
      trafficGeometry.dispose();
      policeGeometry.dispose();
      lightGeometry.dispose();
    },
  };
}
