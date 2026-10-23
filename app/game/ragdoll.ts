import * as THREE from 'three';
import type { Collider } from './world';

/**
 * Verlet ragdolls: nine particles joined by distance constraints, rendered with the same blocky
 * body parts as the characters. Cheap enough to run a dozen at a fixed 120 Hz on a weak laptop.
 */
export type RagdollLook = { shirt: string; pants: string; skin: string; hat?: string; helmet?: string };
export type RagdollBody = {
  pos: Float32Array;
  prev: Float32Array;
  rest: Float32Array;
  spacing: Float32Array;
  scale: number;
  group: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  cap: THREE.Mesh | null;
  hat: THREE.Mesh | null;
  limbs: THREE.Mesh[];
  nearby: Collider[];
  still: number;
  asleep: boolean;
  removed: boolean;
};

const HEAD = 0, LS = 1, RS = 2, LH = 3, RH = 4, LA = 5, RA = 6, LF = 7, RF = 8;
const COUNT = 9;
// Standing pose of the player model at scale 1, feet at y = 0 and facing +z.
const POSE = [0, 2.18, 0.03, -0.4, 1.78, 0, 0.4, 1.78, 0, -0.24, 1.08, 0, 0.24, 1.08, 0, -0.57, 1.03, 0.04, 0.57, 1.03, 0.04, -0.26, 0.2, 0.09, 0.26, 0.2, 0.09];
const STICKS = [HEAD, LS, HEAD, RS, LS, RS, LH, RH, LS, LH, RS, RH, LS, RH, RS, LH, HEAD, LH, HEAD, RH, LS, LA, RS, RA, LH, LF, RH, RF];
// Minimum distances (fraction of rest length) stop limbs folding through the torso.
const SPACERS: [number, number, number][] = [[LF, RF, 0.4], [LF, LS, 0.75], [RF, RS, 0.75], [LA, RH, 0.5], [RA, LH, 0.5]];
const LIMBS: [number, number, 'shirt' | 'pants', number][] = [[LS, LA, 'shirt', 0.26], [RS, RA, 'shirt', 0.26], [LH, LF, 'pants', 0.32], [RH, RF, 'pants', 0.32]];
const STEP = 1 / 120;
const GRAVITY = -24;
const DRAG = 0.996;
const RADIUS = 0.12;
const MAX_BODIES = 14;
const BOUND = 88;

export function createRagdolls(scene: THREE.Scene, colliders: Collider[], ground: (x: number, z: number) => number) {
  const root = new THREE.Group();
  root.name = 'Ragdolls';
  scene.add(root);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const ballGeometry = new THREE.SphereGeometry(1, 10, 7);
  const coneGeometry = new THREE.ConeGeometry(1, 1, 8);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const bodies: RagdollBody[] = [];
  let accumulator = 0;

  const ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), mid = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);

  function material(color: string) {
    let mat = materials.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      materials.set(color, mat);
    }
    return mat;
  }
  function mesh(geometry: THREE.BufferGeometry, color: string, parent: THREE.Object3D) {
    const m = new THREE.Mesh(geometry, material(color));
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }
  function read(body: RagdollBody, i: number, out: THREE.Vector3) {
    return out.set(body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]);
  }
  function distanceOf(p: Float32Array, a: number, b: number) {
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  }

  function spawn(options: { x: number; y: number; z: number; yaw: number; scale: number; look: RagdollLook; velocity: { x: number; y: number; z: number } }) {
    while (bodies.length >= MAX_BODIES) remove(bodies[0]);
    const { x, y, z, yaw, scale, look, velocity } = options;
    const pos = new Float32Array(COUNT * 3);
    const prev = new Float32Array(COUNT * 3);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < COUNT; i++) {
      const lx = POSE[i * 3] * scale, ly = POSE[i * 3 + 1] * scale, lz = POSE[i * 3 + 2] * scale;
      pos[i * 3] = x + lx * c + lz * s;
      pos[i * 3 + 1] = y + ly;
      pos[i * 3 + 2] = z - lx * s + lz * c;
      // A little per-particle variation keeps every fall from looking identical.
      const jitter = 0.6 + Math.random() * 0.5;
      prev[i * 3] = pos[i * 3] - velocity.x * STEP * jitter;
      prev[i * 3 + 1] = pos[i * 3 + 1] - velocity.y * STEP * (i === HEAD ? 0.8 : jitter);
      prev[i * 3 + 2] = pos[i * 3 + 2] - velocity.z * STEP * jitter;
    }
    const rest = new Float32Array(STICKS.length / 2);
    for (let k = 0; k < rest.length; k++) rest[k] = distanceOf(pos, STICKS[k * 2], STICKS[k * 2 + 1]);
    const spacing = new Float32Array(SPACERS.length);
    SPACERS.forEach(([a, b, fraction], k) => { spacing[k] = distanceOf(pos, a, b) * fraction; });
    const group = new THREE.Group();
    root.add(group);
    const torso = mesh(boxGeometry, look.shirt, group);
    const head = mesh(ballGeometry, look.skin, group);
    const cap = look.helmet ? mesh(ballGeometry, look.helmet, group) : null;
    const hat = look.hat ? mesh(coneGeometry, look.hat, group) : null;
    const limbs = LIMBS.map(([, , part]) => mesh(boxGeometry, look[part], group));
    const body: RagdollBody = { pos, prev, rest, spacing, scale, group, torso, head, cap, hat, limbs, nearby: [], still: 0, asleep: false, removed: false };
    bodies.push(body);
    refreshNearby(body);
    sync(body);
    return body;
  }

  function remove(body: RagdollBody) {
    if (body.removed) return;
    body.removed = true;
    root.remove(body.group);
    const index = bodies.indexOf(body);
    if (index >= 0) bodies.splice(index, 1);
  }

  function center(body: RagdollBody, out: THREE.Vector3) {
    const p = body.pos;
    return out.set((p[LH * 3] + p[RH * 3]) / 2, (p[LH * 3 + 1] + p[RH * 3 + 1]) / 2, (p[LH * 3 + 2] + p[RH * 3 + 2]) / 2);
  }

  function refreshNearby(body: RagdollBody) {
    center(body, mid);
    body.nearby.length = 0;
    const reach = 3.5 * body.scale;
    for (const c of colliders) {
      if (mid.x > c.minX - reach && mid.x < c.maxX + reach && mid.z > c.minZ - reach && mid.z < c.maxZ + reach) body.nearby.push(c);
    }
  }

  /** Adds a velocity change (m/s) to the body, strongest at `index` when given. */
  function impulse(body: RagdollBody, vx: number, vy: number, vz: number, index = -1) {
    body.asleep = false;
    body.still = 0;
    for (let i = 0; i < COUNT; i++) {
      const f = index < 0 ? 1 : i === index ? 1.7 : 0.55;
      body.prev[i * 3] -= vx * STEP * f;
      body.prev[i * 3 + 1] -= vy * STEP * f;
      body.prev[i * 3 + 2] -= vz * STEP * f;
    }
  }

  /** Shoves particles inside a circle on the ground plane, used for kicks and vehicles. */
  function push(x: number, z: number, radius: number, vx: number, vy: number, vz: number) {
    let touched = 0;
    for (const body of bodies) {
      for (let i = 0; i < COUNT; i++) {
        const dx = body.pos[i * 3] - x, dz = body.pos[i * 3 + 2] - z;
        if (dx * dx + dz * dz > radius * radius || body.pos[i * 3 + 1] > 1.4) continue;
        body.asleep = false;
        body.still = 0;
        body.prev[i * 3] = body.pos[i * 3] - vx * STEP;
        body.prev[i * 3 + 1] = body.pos[i * 3 + 1] - vy * STEP;
        body.prev[i * 3 + 2] = body.pos[i * 3 + 2] - vz * STEP;
        touched++;
      }
    }
    return touched;
  }

  /** Nearest particle hit by a ray; `dir` must be normalised. */
  function raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
    let best: { body: RagdollBody; t: number; index: number } | null = null;
    for (const body of bodies) {
      for (let i = 0; i < COUNT; i++) {
        const r = (i === HEAD || i <= RH ? 0.34 : 0.22) * body.scale;
        const ox = origin.x - body.pos[i * 3], oy = origin.y - body.pos[i * 3 + 1], oz = origin.z - body.pos[i * 3 + 2];
        const b = ox * dir.x + oy * dir.y + oz * dir.z;
        const c = ox * ox + oy * oy + oz * oz - r * r;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < maxT && (!best || t < best.t)) best = { body, t, index: i };
      }
    }
    return best;
  }

  function step(body: RagdollBody) {
    const p = body.pos, q = body.prev;
    for (let i = 0; i < COUNT * 3; i += 3) {
      const vx = (p[i] - q[i]) * DRAG, vy = (p[i + 1] - q[i + 1]) * DRAG, vz = (p[i + 2] - q[i + 2]) * DRAG;
      q[i] = p[i]; q[i + 1] = p[i + 1]; q[i + 2] = p[i + 2];
      p[i] += vx; p[i + 1] += vy + GRAVITY * STEP * STEP; p[i + 2] += vz;
    }
    for (let iteration = 0; iteration < 5; iteration++) {
      for (let k = 0; k < body.rest.length; k++) {
        const a = STICKS[k * 2] * 3, b = STICKS[k * 2 + 1] * 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const f = (d - body.rest[k]) / d * 0.5;
        p[a] += dx * f; p[a + 1] += dy * f; p[a + 2] += dz * f;
        p[b] -= dx * f; p[b + 1] -= dy * f; p[b + 2] -= dz * f;
      }
      for (let k = 0; k < SPACERS.length; k++) {
        const a = SPACERS[k][0] * 3, b = SPACERS[k][1] * 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d >= body.spacing[k]) continue;
        const f = (d - body.spacing[k]) / d * 0.5;
        p[a] += dx * f; p[a + 1] += dy * f; p[a + 2] += dz * f;
        p[b] -= dx * f; p[b + 1] -= dy * f; p[b + 2] -= dz * f;
      }
    }
    const r = RADIUS * body.scale;
    let motion = 0;
    for (let i = 0; i < COUNT * 3; i += 3) {
      const floor = ground(p[i], p[i + 2]) + r;
      if (p[i + 1] < floor) {
        p[i + 1] = floor;
        // Ground friction: bleed off horizontal velocity while touching the street.
        q[i] = p[i] - (p[i] - q[i]) * 0.86;
        q[i + 2] = p[i + 2] - (p[i + 2] - q[i + 2]) * 0.86;
      }
      for (const c of body.nearby) {
        const x = p[i], z = p[i + 2];
        if (x <= c.minX - r || x >= c.maxX + r || z <= c.minZ - r || z >= c.maxZ + r) continue;
        const left = x - (c.minX - r), right = c.maxX + r - x, near = z - (c.minZ - r), far = c.maxZ + r - z;
        const least = Math.min(left, right, near, far);
        if (least === left) p[i] = c.minX - r;
        else if (least === right) p[i] = c.maxX + r;
        else if (least === near) p[i + 2] = c.minZ - r;
        else p[i + 2] = c.maxZ + r;
      }
      p[i] = Math.max(-BOUND, Math.min(BOUND, p[i]));
      p[i + 2] = Math.max(-BOUND, Math.min(BOUND, p[i + 2]));
      motion += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
    }
    body.still = motion < 0.004 ? body.still + 1 : 0;
    if (body.still > 60) body.asleep = true;
  }

  function limb(target: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thickness: number) {
    mid.copy(a).add(b).multiplyScalar(0.5);
    target.position.copy(mid);
    vb.subVectors(b, a);
    const length = vb.length() || 0.01;
    target.quaternion.setFromUnitVectors(UP, vb.divideScalar(length));
    target.scale.set(thickness, length + thickness * 0.5, thickness);
  }

  function sync(body: RagdollBody) {
    const s = body.scale;
    read(body, LS, va).add(read(body, RS, vb)).multiplyScalar(0.5);
    const shoulders = ay.copy(va);
    read(body, LH, va).add(read(body, RH, vb)).multiplyScalar(0.5);
    const torsoMid = mid.copy(shoulders).add(va).multiplyScalar(0.5);
    body.torso.position.copy(torsoMid);
    ay.sub(va);
    const torsoLength = ay.length() || 0.01;
    ay.divideScalar(torsoLength);
    read(body, RS, ax).sub(read(body, LS, vb)).normalize();
    az.crossVectors(ax, ay).normalize();
    ax.crossVectors(ay, az);
    basis.makeBasis(ax, ay, az);
    body.torso.quaternion.setFromRotationMatrix(basis);
    body.torso.scale.set(0.9 * s, torsoLength + 0.3 * s, 0.5 * s);
    read(body, HEAD, va);
    body.head.position.copy(va);
    body.head.quaternion.copy(body.torso.quaternion);
    body.head.scale.setScalar(0.38 * s);
    if (body.cap) {
      body.cap.position.copy(va).addScaledVector(ay, 0.14 * s);
      body.cap.quaternion.copy(body.torso.quaternion);
      body.cap.scale.set(0.405 * s, 0.26 * s, 0.405 * s);
    }
    if (body.hat) {
      body.hat.position.copy(va).addScaledVector(ay, 0.32 * s);
      body.hat.quaternion.copy(body.torso.quaternion);
      body.hat.scale.set(0.6 * s, 0.34 * s, 0.6 * s);
    }
    LIMBS.forEach(([a, b, , thickness], k) => limb(body.limbs[k], read(body, a, va), read(body, b, vb), thickness * s));
  }

  return {
    spawn,
    remove,
    impulse,
    push,
    raycast,
    center,
    forEach(callback: (body: RagdollBody) => void) { bodies.forEach(callback); },
    update(dt: number) {
      for (const body of bodies) if (!body.asleep) refreshNearby(body);
      accumulator = Math.min(accumulator + dt, STEP * 4);
      while (accumulator >= STEP) {
        accumulator -= STEP;
        for (const body of bodies) if (!body.asleep) step(body);
      }
      for (const body of bodies) if (!body.asleep) sync(body);
    },
    dispose() {
      scene.remove(root);
      bodies.length = 0;
      materials.forEach((m) => m.dispose());
      boxGeometry.dispose();
      ballGeometry.dispose();
      coneGeometry.dispose();
    },
  };
}
