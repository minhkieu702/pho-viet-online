import * as THREE from 'three';
import type { createRagdolls, RagdollBody, RagdollLook } from './ragdoll';

type Ragdolls = ReturnType<typeof createRagdolls>;
type Npc = {
  centerX: number;
  centerZ: number;
  axis: 'x' | 'z';
  range: number;
  offset: number;
  dir: number;
  pace: number;
  stride: number;
  panicUntil: number;
  state: 'walk' | 'down' | 'away';
  timer: number;
  body: RagdollBody | null;
  pooled: boolean;
  look: RagdollLook;
  x: number;
  y: number;
  z: number;
  yaw: number;
  swing: number;
  arms: number;
  health: number;
  hitAt: number;
};

// Sidewalk and park routes [centerX, centerZ, axis, half-length], kept clear of shop fronts and street trees.
const ROUTES: [number, number, 'x' | 'z', number][] = [
  [-27, -8.2, 'x', 9], [27, 8.2, 'x', 9], [27, -8.2, 'x', 9], [-27, 8.2, 'x', 8],
  [-75, -62.2, 'x', 6], [27, -62.2, 'x', 9], [-27, 62.2, 'x', 9], [74.5, 62.2, 'x', 6],
  [27, 45.8, 'x', 8], [27, -46.2, 'x', 8], [8.2, -27, 'z', 8], [-8.2, 27, 'z', 8],
  [-8.2, -74, 'z', 5], [8.2, 74, 'z', 5], [-75, 8.2, 'x', 6], [74.5, -8.2, 'x', 6],
  [20.5, -33, 'z', 8], [28, 38, 'x', 10],
];
const SHIRTS = ['#db9876', '#86a799', '#d4b164', '#bca5b7', '#8caaa9', '#d18469', '#9fb4d6', '#e0b8a0', '#c96f6f', '#7fa37a', '#e8d6a8', '#6f86a8'];
const PANTS = ['#536c69', '#6d5d4f', '#3f4d5c', '#7b6a58', '#4f5a4a'];
const SKINS = ['#d3a179', '#c58f69', '#e0b48e', '#b98260'];
// Model units are ~2.1 m tall; scale to a 1.75 m person.
const BODY_SCALE = 0.82;
const SCALE = 0.7;
const HIT_RADIUS = 0.38;
const HEIGHT = 1.85;
const MAX_HEALTH = 60;
// Box parts per pedestrian: torso, two legs, two arms.
const BOXES = 5;

/**
 * A crowd of pedestrians who stroll the sidewalks, scatter at gunfire and fall as ragdolls when hit.
 * Every body part is an instance, so the whole crowd costs three draw calls.
 */
export function createNpcs(scene: THREE.Scene, ragdolls: Ragdolls, onRest: (x: number, z: number) => void = () => {}) {
  const npcs: Npc[] = [];
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  ROUTES.forEach(([centerX, centerZ, axis, range]) => {
    const count = range <= 6 ? 2 : 3;
    for (let k = 0; k < count; k++) {
      const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
      npcs.push({
        centerX, centerZ, axis, range,
        offset: ((k + random() * 0.6) / count * 2 - 1) * range,
        dir: random() < 0.5 ? 1 : -1,
        pace: 0.95 + random() * 0.6,
        stride: random() * 10,
        panicUntil: 0, state: 'walk', timer: 0, body: null, pooled: false,
        look: { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hat: random() < 0.45 ? '#e5cf92' : undefined },
        x: 0, y: 0, z: 0, yaw: 0, swing: 0, arms: 0, health: MAX_HEALTH, hitAt: -99,
      });
    }
  });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.IcosahedronGeometry(1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 8);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const boxes = new THREE.InstancedMesh(box, material, npcs.length * BOXES);
  const heads = new THREE.InstancedMesh(ball, material, npcs.length);
  const hats = new THREE.InstancedMesh(cone, material, npcs.length);
  const color = new THREE.Color();
  npcs.forEach((npc, i) => {
    for (const [k, part] of (['shirt', 'pants', 'pants', 'shirt', 'shirt'] as const).entries()) boxes.setColorAt(i * BOXES + k, color.set(npc.look[part]));
    heads.setColorAt(i, color.set(npc.look.skin));
    hats.setColorAt(i, color.set(npc.look.hat ?? '#e5cf92'));
  });
  for (const mesh of [boxes, heads, hats]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }

  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const size = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);

  function place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt = 0) {
    quat.setFromAxisAngle(xAxis, tilt);
    local.compose(pos.set(x, y, z), quat, size.set(sx, sy, sz));
    mesh.setMatrixAt(index, out.multiplyMatrices(base, local));
  }
  // A limb hanging from `pivot`, swung forward by `angle` around the x axis.
  function limb(index: number, px: number, py: number, length: number, width: number, depth: number, angle: number) {
    place(boxes, index, px, py - Math.cos(angle) * length / 2, -Math.sin(angle) * length / 2, width, length, depth, angle);
  }
  function draw(npc: Npc, i: number) {
    if (npc.state !== 'walk') {
      for (let k = 0; k < BOXES; k++) boxes.setMatrixAt(i * BOXES + k, hidden);
      heads.setMatrixAt(i, hidden);
      hats.setMatrixAt(i, hidden);
      return;
    }
    base.compose(pos.set(npc.x, npc.y, npc.z), quat.setFromAxisAngle(yAxis, npc.yaw), size.setScalar(BODY_SCALE));
    place(boxes, i * BOXES, 0, 1.13, 0, 0.58, 0.78, 0.38);
    limb(i * BOXES + 1, -0.16, 0.76, 0.7, 0.2, 0.23, npc.swing);
    limb(i * BOXES + 2, 0.16, 0.76, 0.7, 0.2, 0.23, -npc.swing);
    limb(i * BOXES + 3, -0.38, 1.47, 0.62, 0.15, 0.17, npc.arms || -npc.swing * 0.8);
    limb(i * BOXES + 4, 0.38, 1.47, 0.62, 0.15, 0.17, npc.arms || npc.swing * 0.8);
    place(heads, i, 0, 1.85, 0, 0.28, 0.3, 0.28);
    if (npc.look.hat) place(hats, i, 0, 2.14, 0, 0.52, 0.3, 0.52);
    else hats.setMatrixAt(i, hidden);
  }

  function position(npc: Npc) {
    return { x: npc.centerX + (npc.axis === 'x' ? npc.offset : 0), z: npc.centerZ + (npc.axis === 'z' ? npc.offset : 0) };
  }

  /** Knocks a standing pedestrian into a ragdoll with the given velocity (m/s). */
  function knock(npc: Npc, vx: number, vy: number, vz: number, time: number) {
    if (npc.state !== 'walk') return null;
    npc.state = 'down';
    npc.timer = time + 9;
    npc.pooled = false;
    npc.body = ragdolls.spawn({ x: npc.x, y: npc.y, z: npc.z, yaw: npc.yaw, scale: SCALE, look: npc.look, velocity: { x: vx, y: vy, z: vz } });
    return npc.body;
  }

  const restPoint = new THREE.Vector3();
  return {
    knock,
    /** Applies damage; at zero health (or with `force`, e.g. a vehicle) the pedestrian falls as a ragdoll. */
    damage(npc: Npc, amount: number, vx: number, vy: number, vz: number, time: number, force = false) {
      if (npc.state !== 'walk') return false;
      npc.health -= amount;
      npc.hitAt = time;
      npc.panicUntil = time + 8;
      if (npc.health <= 0 || force) { knock(npc, vx, vy, vz, time); return true; }
      return false;
    },
    forEachHurt(time: number, callback: (x: number, y: number, z: number, fraction: number) => void) {
      for (const npc of npcs) if (npc.state === 'walk' && time - npc.hitAt < 4) callback(npc.x, HEIGHT + 0.3, npc.z, Math.max(0, npc.health) / MAX_HEALTH);
    },
    /** Nearest standing pedestrian crossed by a ray; `dir` must be normalised. */
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { npc: Npc; t: number } | null = null;
      for (const npc of npcs) {
        if (npc.state !== 'walk') continue;
        const rx = origin.x - npc.x, rz = origin.z - npc.z;
        const a = dir.x * dir.x + dir.z * dir.z;
        if (a < 1e-6) continue;
        const b = 2 * (rx * dir.x + rz * dir.z);
        const c = rx * rx + rz * rz - HIT_RADIUS * HIT_RADIUS;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        let t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0) t = (-b + Math.sqrt(disc)) / (2 * a);
        if (t <= 0 || t >= maxT || (best && t >= best.t)) continue;
        const y = origin.y + dir.y * t;
        if (y > 0 && y < HEIGHT) best = { npc, t };
      }
      return best;
    },
    /** Every standing pedestrian inside `radius` of a point. */
    near(x: number, z: number, radius: number, callback: (npc: Npc, nx: number, nz: number) => void) {
      for (const npc of npcs) {
        if (npc.state === 'walk' && (npc.x - x) ** 2 + (npc.z - z) ** 2 < radius * radius) callback(npc, npc.x, npc.z);
      }
    },
    /** Pedestrians within `radius` run away from the noise for a few seconds. */
    alarm(x: number, z: number, radius: number, time: number) {
      for (const npc of npcs) {
        if (npc.state !== 'walk' || (npc.x - x) ** 2 + (npc.z - z) ** 2 > radius * radius) continue;
        npc.panicUntil = time + 6;
        const away = npc.axis === 'x' ? npc.x - x : npc.z - z;
        npc.dir = away >= 0 ? 1 : -1;
      }
    },
    forEachStanding(callback: (x: number, z: number) => void) {
      for (const npc of npcs) if (npc.state === 'walk') callback(npc.x, npc.z);
    },
    update(dt: number, time: number, ground: (x: number, z: number) => number) {
      npcs.forEach((npc, i) => {
        if (npc.state === 'down') {
          if (npc.body && !npc.pooled && npc.body.asleep) {
            npc.pooled = true;
            ragdolls.center(npc.body, restPoint);
            onRest(restPoint.x, restPoint.z);
          }
          if (time > npc.timer || !npc.body || npc.body.removed) {
            if (npc.body) ragdolls.remove(npc.body);
            npc.body = null;
            npc.state = 'away';
            npc.timer = time + 3;
          }
        } else if (npc.state === 'away' && time >= npc.timer) {
          npc.state = 'walk';
          npc.offset = (Math.random() * 2 - 1) * npc.range;
          npc.panicUntil = 0;
          npc.health = MAX_HEALTH;
          npc.hitAt = -99;
        }
        if (npc.state === 'walk') {
          const panic = time < npc.panicUntil;
          const speed = panic ? 4.4 : 1.25 * npc.pace;
          npc.offset += npc.dir * speed * dt;
          if (Math.abs(npc.offset) > npc.range) {
            npc.offset = Math.sign(npc.offset) * npc.range;
            npc.dir = -npc.dir;
          }
          npc.stride += speed * dt * 2.4;
          npc.swing = Math.sin(npc.stride) * (panic ? 0.85 : 0.5);
          npc.arms = panic ? -2.6 : 0;
          const p = position(npc);
          npc.x = p.x;
          npc.z = p.z;
          npc.y = ground(p.x, p.z) + Math.abs(Math.sin(npc.stride)) * 0.04;
          npc.yaw = npc.axis === 'x' ? (npc.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : npc.dir > 0 ? 0 : Math.PI;
        }
        draw(npc, i);
      });
      boxes.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      hats.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [boxes, heads, hats]) { scene.remove(mesh); mesh.dispose(); }
      material.dispose();
      box.dispose();
      ball.dispose();
      cone.dispose();
    },
  };
}
