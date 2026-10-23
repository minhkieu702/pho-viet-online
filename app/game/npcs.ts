import * as THREE from 'three';
import type { createRagdolls, RagdollBody, RagdollLook } from './ragdoll';

type Ragdolls = ReturnType<typeof createRagdolls>;
type Npc = {
  group: THREE.Group;
  legLeft: THREE.Group;
  legRight: THREE.Group;
  armLeft: THREE.Group;
  armRight: THREE.Group;
  centerX: number;
  centerZ: number;
  axis: 'x' | 'z';
  range: number;
  offset: number;
  dir: number;
  stride: number;
  panicUntil: number;
  state: 'walk' | 'down' | 'away';
  timer: number;
  body: RagdollBody | null;
  look: RagdollLook;
};

// Sidewalk routes [centerX, centerZ, axis, half-length], kept clear of shop fronts and street trees.
const ROUTES: [number, number, 'x' | 'z', number][] = [
  [-27, -8.2, 'x', 9], [27, 8.2, 'x', 9], [27, -8.2, 'x', 9], [-27, 8.2, 'x', 8],
  [-75, -62.2, 'x', 6], [27, -62.2, 'x', 9], [-27, 62.2, 'x', 9], [74.5, 62.2, 'x', 6],
  [27, 45.8, 'x', 8], [27, -46.2, 'x', 8], [8.2, -27, 'z', 8], [-8.2, 27, 'z', 8],
  [-8.2, -74, 'z', 5], [8.2, 74, 'z', 5], [-75, 8.2, 'x', 6], [74.5, -8.2, 'x', 6],
];
const SHIRTS = ['#db9876', '#86a799', '#d4b164', '#bca5b7', '#8caaa9', '#d18469', '#9fb4d6', '#e0b8a0'];
const SCALE = 0.85;
const HIT_RADIUS = 0.45;

/** Pedestrians who stroll the sidewalks, scatter at gunfire and fall as ragdolls when hit. */
export function createNpcs(scene: THREE.Scene, ragdolls: Ragdolls) {
  const root = new THREE.Group();
  root.name = 'Pedestrians';
  scene.add(root);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.IcosahedronGeometry(1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 8);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string) => {
    let mat = materials.get(color);
    if (!mat) { mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 }); materials.set(color, mat); }
    return mat;
  };
  const part = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, scale: [number, number, number], pos: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.scale.set(...scale);
    mesh.position.set(...pos);
    parent.add(mesh);
    return mesh;
  };
  const limb = (parent: THREE.Object3D, x: number, y: number, color: string, scale: [number, number, number]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    part(pivot, box, color, scale, [0, -scale[1] / 2, 0]);
    parent.add(pivot);
    return pivot;
  };

  const npcs: Npc[] = ROUTES.map(([centerX, centerZ, axis, range], i) => {
    const look: RagdollLook = { shirt: SHIRTS[i % SHIRTS.length], pants: i % 3 ? '#536c69' : '#6d5d4f', skin: i % 4 === 1 ? '#c58f69' : '#d3a179', hat: i % 2 ? undefined : '#e5cf92' };
    const group = new THREE.Group();
    part(group, box, look.shirt, [0.58, 0.78, 0.38], [0, 1.13, 0]);
    part(group, ball, look.skin, [0.28, 0.3, 0.28], [0, 1.85, 0]);
    if (look.hat) part(group, cone, look.hat, [0.52, 0.3, 0.52], [0, 2.14, 0]);
    const legLeft = limb(group, -0.16, 0.76, look.pants, [0.2, 0.7, 0.23]);
    const legRight = limb(group, 0.16, 0.76, look.pants, [0.2, 0.7, 0.23]);
    const armLeft = limb(group, -0.38, 1.47, look.shirt, [0.15, 0.62, 0.17]);
    const armRight = limb(group, 0.38, 1.47, look.shirt, [0.15, 0.62, 0.17]);
    root.add(group);
    return { group, legLeft, legRight, armLeft, armRight, centerX, centerZ, axis, range, offset: (((i * 7) % 11) / 5.5 - 1) * range, dir: i % 2 ? 1 : -1, stride: i, panicUntil: 0, state: 'walk', timer: 0, body: null, look };
  });

  function position(npc: Npc) {
    return { x: npc.centerX + (npc.axis === 'x' ? npc.offset : 0), z: npc.centerZ + (npc.axis === 'z' ? npc.offset : 0) };
  }

  /** Knocks a standing pedestrian into a ragdoll with the given velocity (m/s). */
  function knock(npc: Npc, vx: number, vy: number, vz: number, time: number) {
    if (npc.state !== 'walk') return null;
    const { x, z } = position(npc);
    npc.group.visible = false;
    npc.state = 'down';
    npc.timer = time + 7;
    npc.body = ragdolls.spawn({ x, y: npc.group.position.y, z, yaw: npc.group.rotation.y, scale: SCALE, look: npc.look, velocity: { x: vx, y: vy, z: vz } });
    return npc.body;
  }

  return {
    knock,
    /** Nearest standing pedestrian crossed by a ray; `dir` must be normalised. */
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { npc: Npc; t: number } | null = null;
      for (const npc of npcs) {
        if (npc.state !== 'walk') continue;
        const { x, z } = position(npc);
        const rx = origin.x - x, rz = origin.z - z;
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
        if (y > 0 && y < 2.2) best = { npc, t };
      }
      return best;
    },
    /** Every pedestrian inside `radius` of a point, standing ones only. */
    near(x: number, z: number, radius: number, callback: (npc: Npc, nx: number, nz: number) => void) {
      for (const npc of npcs) {
        if (npc.state !== 'walk') continue;
        const p = position(npc);
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < radius * radius) callback(npc, p.x, p.z);
      }
    },
    /** Pedestrians within `radius` run away from the noise for a few seconds. */
    alarm(x: number, z: number, radius: number, time: number) {
      for (const npc of npcs) {
        if (npc.state !== 'walk') continue;
        const p = position(npc);
        if ((p.x - x) ** 2 + (p.z - z) ** 2 > radius * radius) continue;
        npc.panicUntil = time + 6;
        const away = npc.axis === 'x' ? p.x - x : p.z - z;
        npc.dir = away >= 0 ? 1 : -1;
      }
    },
    forEachStanding(callback: (x: number, z: number) => void) {
      for (const npc of npcs) if (npc.state === 'walk') { const p = position(npc); callback(p.x, p.z); }
    },
    update(dt: number, time: number, ground: (x: number, z: number) => number) {
      for (const npc of npcs) {
        if (npc.state === 'down') {
          if (time > npc.timer || !npc.body || npc.body.removed) {
            if (npc.body) ragdolls.remove(npc.body);
            npc.body = null;
            npc.state = 'away';
            npc.timer = time + 3;
          }
          continue;
        }
        if (npc.state === 'away') {
          if (time < npc.timer) continue;
          npc.state = 'walk';
          npc.offset = (Math.random() * 2 - 1) * npc.range;
          npc.panicUntil = 0;
          npc.group.visible = true;
        }
        const panic = time < npc.panicUntil;
        const speed = panic ? 4.4 : 1.25;
        npc.offset += npc.dir * speed * dt;
        if (Math.abs(npc.offset) > npc.range) {
          npc.offset = Math.sign(npc.offset) * npc.range;
          npc.dir = -npc.dir;
        }
        npc.stride += speed * dt * 2.4;
        const swing = Math.sin(npc.stride) * (panic ? 0.85 : 0.5);
        npc.legLeft.rotation.x = swing;
        npc.legRight.rotation.x = -swing;
        npc.armLeft.rotation.x = panic ? -2.6 : -swing * 0.8;
        npc.armRight.rotation.x = panic ? -2.6 : swing * 0.8;
        const { x, z } = position(npc);
        npc.group.position.set(x, ground(x, z) + Math.abs(Math.sin(npc.stride)) * 0.04, z);
        npc.group.rotation.y = npc.axis === 'x' ? (npc.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : npc.dir > 0 ? 0 : Math.PI;
      }
    },
    dispose() {
      scene.remove(root);
      materials.forEach((m) => m.dispose());
      box.dispose();
      ball.dispose();
      cone.dispose();
    },
  };
}
