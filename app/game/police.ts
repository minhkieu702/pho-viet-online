import * as THREE from 'three';
import type { createRagdolls, RagdollBody, RagdollLook } from './ragdoll';
import type { Car, createVehicles } from './vehicles';

type Ragdolls = ReturnType<typeof createRagdolls>;
type Vehicles = ReturnType<typeof createVehicles>;
type Officer = {
  index: number;
  state: 'off' | 'seated' | 'chase' | 'return' | 'down';
  car: Car | null;
  x: number;
  z: number;
  yaw: number;
  stride: number;
  health: number;
  hitAt: number;
  nextShot: number;
  arrest: number;
  body: RagdollBody | null;
  timer: number;
};
export type PoliceShot = { from: THREE.Vector3; hit: boolean };
export type PlayerView = { x: number; z: number; car: Car | null; speed: number; down: boolean };

const OFFICERS = 8;
const SCALE = 0.84;
const HIT_RADIUS = 0.4;
const HEIGHT = 1.8;
const LOOK: RagdollLook = { shirt: '#2c3e66', pants: '#1f2a40', skin: '#d3a179', helmet: '#1f2a40' };
const RAGDOLL_SCALE = 0.72;

/**
 * Wanted level, police dispatch and officers on foot. Crimes raise heat; enough heat adds stars.
 * Cruisers route to the player, officers jump out to arrest, and from two stars they open fire.
 */
export function createPolice(
  scene: THREE.Scene,
  vehicles: Vehicles,
  ragdolls: Ragdolls,
  world: { clear: (x: number, z: number, radius: number) => boolean; sight: (x1: number, z1: number, x2: number, z2: number) => boolean; ground: (x: number, z: number) => number },
) {
  let wanted = 0;
  let heat = 0;
  let lastSeen = 0;
  let dispatchAt = 0;
  const officers: Officer[] = Array.from({ length: OFFICERS }, (_, index) => ({
    index, state: 'off', car: null, x: 0, z: 0, yaw: 0, stride: 0, health: 80, hitAt: -99, nextShot: 0, arrest: 0, body: null, timer: 0,
  }));

  const box = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.IcosahedronGeometry(1, 1);
  const capGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
  const boxes = new THREE.InstancedMesh(box, material, OFFICERS * 5);
  const heads = new THREE.InstancedMesh(ball, material, OFFICERS);
  const caps = new THREE.InstancedMesh(capGeometry, material, OFFICERS);
  const color = new THREE.Color();
  for (let i = 0; i < OFFICERS; i++) {
    ['#2c3e66', '#1f2a40', '#1f2a40', '#2c3e66', '#2c3e66'].forEach((hex, k) => boxes.setColorAt(i * 5 + k, color.set(hex)));
    heads.setColorAt(i, color.set(LOOK.skin));
    caps.setColorAt(i, color.set('#1f2a40'));
  }
  for (const mesh of [boxes, heads, caps]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), out = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const quat = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0), yAxis = new THREE.Vector3(0, 1, 0);
  const place = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt = 0) => {
    local.compose(pos.set(x, y, z), quat.setFromAxisAngle(xAxis, tilt), size.set(sx, sy, sz));
    mesh.setMatrixAt(index, out.multiplyMatrices(base, local));
  };
  const limb = (index: number, px: number, py: number, length: number, w: number, d: number, angle: number) =>
    place(boxes, index, px, py - Math.cos(angle) * length / 2, -Math.sin(angle) * length / 2, w, length, d, angle);

  function draw(o: Officer) {
    if (o.state !== 'chase' && o.state !== 'return') {
      for (let k = 0; k < 5; k++) boxes.setMatrixAt(o.index * 5 + k, hidden);
      heads.setMatrixAt(o.index, hidden);
      caps.setMatrixAt(o.index, hidden);
      return;
    }
    base.compose(pos.set(o.x, world.ground(o.x, o.z), o.z), quat.setFromAxisAngle(yAxis, o.yaw), size.setScalar(SCALE));
    const swing = Math.sin(o.stride) * 0.6;
    place(boxes, o.index * 5, 0, 1.13, 0, 0.6, 0.8, 0.4);
    limb(o.index * 5 + 1, -0.16, 0.76, 0.72, 0.21, 0.24, swing);
    limb(o.index * 5 + 2, 0.16, 0.76, 0.72, 0.21, 0.24, -swing);
    limb(o.index * 5 + 3, -0.4, 1.48, 0.62, 0.16, 0.18, -swing * 0.8);
    // Right arm raised when aiming.
    limb(o.index * 5 + 4, 0.4, 1.48, 0.62, 0.16, 0.18, wanted >= 2 && o.state === 'chase' ? -1.5 : swing * 0.8);
    place(heads, o.index, 0, 1.86, 0, 0.28, 0.3, 0.28);
    place(caps, o.index, 0, 2.08, 0.02, 0.31, 0.12, 0.33);
  }

  function crewOf(car: Car) { return officers.filter((o) => o.car === car && o.state !== 'off'); }

  function knock(o: Officer, vx: number, vy: number, vz: number, time: number) {
    o.state = 'down';
    o.timer = time + 9;
    o.body = ragdolls.spawn({ x: o.x, y: world.ground(o.x, o.z), z: o.z, yaw: o.yaw, scale: RAGDOLL_SCALE, look: LOOK, velocity: { x: vx, y: vy, z: vz } });
    return o.body;
  }

  function crime(severity: number, time: number) {
    heat += severity;
    wanted = Math.min(5, Math.max(wanted, 1, 1 + Math.floor(heat / 4)));
    lastSeen = time;
  }

  function standDown() {
    wanted = 0;
    heat = 0;
    for (const o of officers) if (o.state === 'chase') o.state = 'return';
  }

  /** Everything vanishes at once, used after an arrest or when the player is downed and respawns. */
  function reset() {
    standDown();
    for (const o of officers) {
      if (o.body) ragdolls.remove(o.body);
      Object.assign(o, { state: 'off', car: null, body: null, arrest: 0 });
    }
    for (const car of vehicles.cars) if (car.kind === 'police' && car.mode !== 'player') car.mode = 'off';
  }

  function step(o: Officer, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - o.x, dz = tz - o.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    o.yaw = Math.atan2(dx, dz);
    const mx = dx / d * speed * dt, mz = dz / d * speed * dt;
    const r = 0.32;
    if (world.clear(o.x + mx, o.z + mz, r) && !vehicles.blocked(o.x + mx, o.z + mz, r)) { o.x += mx; o.z += mz; }
    else {
      if (world.clear(o.x + mx, o.z, r) && !vehicles.blocked(o.x + mx, o.z, r)) o.x += mx;
      if (world.clear(o.x, o.z + mz, r) && !vehicles.blocked(o.x, o.z + mz, r)) o.z += mz;
    }
    o.stride += speed * dt * 2.6;
    return d;
  }

  return {
    get wanted() { return wanted; },
    crime,
    reset,
    /** Pedestrian-style hit test against officers on foot. */
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { officer: Officer; t: number } | null = null;
      for (const o of officers) {
        if (o.state !== 'chase' && o.state !== 'return') continue;
        const rx = origin.x - o.x, rz = origin.z - o.z;
        const a = dir.x * dir.x + dir.z * dir.z;
        if (a < 1e-6) continue;
        const b = 2 * (rx * dir.x + rz * dir.z), c = rx * rx + rz * rz - HIT_RADIUS * HIT_RADIUS;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        let t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0) t = (-b + Math.sqrt(disc)) / (2 * a);
        const y = origin.y + dir.y * t;
        if (t > 0 && t < maxT && y > 0 && y < HEIGHT && (!best || t < best.t)) best = { officer: o, t };
      }
      return best;
    },
    near(x: number, z: number, radius: number, callback: (o: Officer) => void) {
      for (const o of officers) if ((o.state === 'chase' || o.state === 'return') && (o.x - x) ** 2 + (o.z - z) ** 2 < radius * radius) callback(o);
    },
    /** Applies damage; officers drop as ragdolls at zero health. Attacking police is always a crime. */
    damage(o: Officer, amount: number, vx: number, vy: number, vz: number, time: number, force = false) {
      o.health -= amount;
      o.hitAt = time;
      crime(3, time);
      if (o.health <= 0 || force) { knock(o, vx, vy, vz, time); return true; }
      return false;
    },
    forEachUnit(callback: (x: number, z: number, onFoot: boolean) => void) {
      for (const o of officers) if (o.state === 'chase' || o.state === 'return') callback(o.x, o.z, true);
      for (const car of vehicles.cars) if (car.kind === 'police' && (car.mode === 'chase' || car.mode === 'hold')) callback(car.x, car.z, false);
    },
    forEachHurt(time: number, callback: (x: number, y: number, z: number, fraction: number) => void) {
      for (const o of officers) if ((o.state === 'chase' || o.state === 'return') && time - o.hitAt < 4) callback(o.x, HEIGHT + 0.35, o.z, o.health / 80);
    },
    update(dt: number, time: number, player: PlayerView) {
      const shots: PoliceShot[] = [];
      let strikes = 0;
      let arrested = false;
      // Dispatch more cruisers as the wanted level climbs.
      if (wanted > 0 && time > dispatchAt) {
        dispatchAt = time + 1.5;
        const active = vehicles.cars.filter((c) => c.kind === 'police' && (c.mode === 'chase' || c.mode === 'hold')).length;
        if (active < Math.min(4, 1 + Math.floor(wanted * 0.8))) {
          const car = vehicles.spawnPolice(player.x, player.z, 45, 85);
          if (car) {
            let crew = 0;
            for (const o of officers) {
              if (crew === 2) break;
              if (o.state !== 'off') continue;
              Object.assign(o, { state: 'seated', car, health: 80, arrest: 0, body: null, hitAt: -99 });
              crew++;
            }
          }
        }
      }
      vehicles.updatePolice(dt, time, player.x, player.z, player.car);
      let seen = false;
      for (const car of vehicles.cars) {
        if (car.kind !== 'police') continue;
        if ((car.mode === 'chase' || car.mode === 'hold') && Math.hypot(car.x - player.x, car.z - player.z) < 45) seen = true;
        // A stopped cruiser lets its crew out on both sides.
        if (car.mode === 'hold' && wanted > 0) {
          for (const o of crewOf(car)) {
            if (o.state !== 'seated') continue;
            const side = o.index % 2 ? 1 : -1;
            o.x = car.x + Math.cos(car.yaw) * 1.6 * side;
            o.z = car.z - Math.sin(car.yaw) * 1.6 * side;
            o.yaw = car.yaw;
            o.state = 'chase';
          }
        }
        if (car.mode === 'hold') {
          const crew = crewOf(car);
          const aboard = crew.every((o) => o.state === 'seated');
          if (crew.length === 0) car.mode = 'parked';
          else if (aboard) {
            car.mode = wanted > 0 ? 'chase' : 'leave';
            car.timer = time + 25;
          }
        }
        if (car.mode === 'off') for (const o of crewOf(car)) if (o.state === 'seated') o.state = 'off';
      }
      const fleeing = player.car !== null && player.speed > 7;
      for (const o of officers) {
        if (o.state === 'down') {
          if (time > o.timer || !o.body || o.body.removed) {
            if (o.body) ragdolls.remove(o.body);
            Object.assign(o, { state: 'off', body: null, car: null });
          }
        } else if (o.state === 'chase') {
          const d = Math.hypot(player.x - o.x, player.z - o.z);
          if (d < 40) seen = true;
          const carGone = !o.car || o.car.mode === 'player' || o.car.mode === 'off' || o.car.mode === 'parked';
          if (wanted === 0 || (fleeing && d > 10 && !carGone)) o.state = 'return';
          else if (carGone && d > 60) o.state = 'off';
          else {
            step(o, player.x, player.z, d > 1.1 ? 5.6 : 0, dt);
            const reach = player.car ? 2.6 : 1.15;
            const canCuff = !player.down && d < reach && (!player.car || player.speed < 1.5);
            o.arrest = canCuff ? o.arrest + dt : Math.max(0, o.arrest - dt);
            if (o.arrest > 1.3) arrested = true;
            // Up close they swing a baton, which also stops the player from simply walking off.
            if (!player.down && !player.car && d < 1.3 && time > o.nextShot) {
              o.nextShot = time + 1.1 + Math.random() * 0.5;
              strikes++;
            }
            if (wanted >= 2 && !player.down && d < 30 && d > 2 && time > o.nextShot && world.sight(o.x, o.z, player.x, player.z)) {
              o.nextShot = time + 1.0 + Math.random() * 0.9;
              const chance = (0.24 + 0.06 * wanted) * (player.car && player.speed > 8 ? 0.5 : 1);
              shots.push({ from: new THREE.Vector3(o.x + Math.sin(o.yaw) * 0.6, 1.35, o.z + Math.cos(o.yaw) * 0.6), hit: Math.random() < chance });
            }
          }
        } else if (o.state === 'return') {
          const car = o.car;
          if (!car || car.mode === 'player' || car.mode === 'off' || car.mode === 'parked') { o.state = 'off'; continue; }
          if (step(o, car.x, car.z, 5, dt) < 2.2) o.state = 'seated';
        }
        draw(o);
      }
      boxes.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;
      // Lose the police by staying out of sight long enough.
      if (seen) lastSeen = time;
      if (wanted > 0 && time - lastSeen > 6 + 2.5 * wanted) standDown();
      return { shots, strikes, arrested, evading: wanted > 0 && !seen };
    },
    dispose() {
      for (const mesh of [boxes, heads, caps]) { scene.remove(mesh); mesh.dispose(); }
      material.dispose();
      box.dispose();
      ball.dispose();
      capGeometry.dispose();
    },
  };
}
