import * as THREE from 'three';
import type { Collider } from './world';
import { LAND, RIVER } from './city';
import { FigureBatch, palette, figureMaterial, ragdollHeadGeometry, ragdollLimbGeometry, ragdollTorsoGeometry, styleOf } from './figures';

/**
 * Verlet ragdolls with elbows and knees: 13 particles joined by distance constraints, heavier in the
 * torso than in the limbs. Limbs and heads can be torn off by violent hits; a torn part keeps its own
 * constraints and the stump bleeds for a while. Every body part of every ragdoll is an instance of
 * one of three shared figure meshes (torso, head, limb), so the whole pile costs three draw calls.
 */
export type RagdollLook = { shirt: string; pants: string; skin: string; hat?: string; helmet?: string };
export type BodyPart = 'head' | 'armL' | 'armR' | 'legL' | 'legR';
export type RagdollBody = {
  slot: number;
  pos: Float32Array;
  prev: Float32Array;
  sticks: Int16Array;
  rest: Float32Array;
  spacing: Float32Array;
  spacers: Int16Array;
  /** Render segments [a, b] for the eight limb boxes; detaching re-points the root to a spare particle. */
  segments: Int16Array;
  scale: number;
  look: RagdollLook;
  nearby: Collider[];
  still: number;
  asleep: boolean;
  removed: boolean;
  detached: Set<BodyPart>;
  spare: number;
};

const HEAD = 0, LS = 1, RS = 2, LH = 3, RH = 4, LE = 5, RE = 6, LA = 7, RA = 8, LK = 9, RK = 10, LF = 11, RF = 12;
const JOINTS = 13;
const SPARES = 5;
const COUNT = JOINTS + SPARES;
// Standing pose of the player model at scale 1, feet at y = 0 and facing +z.
const POSE = [
  0, 2.18, 0.03, -0.42, 1.8, 0, 0.42, 1.8, 0, -0.24, 1.08, 0, 0.24, 1.08, 0,
  -0.6, 1.4, 0.03, 0.6, 1.4, 0.03, -0.6, 1.02, 0.08, 0.6, 1.02, 0.08,
  -0.26, 0.62, 0.05, 0.26, 0.62, 0.05, -0.26, 0.18, 0.09, 0.26, 0.18, 0.09,
];
const STICKS = [
  LS, RS, LH, RH, LS, LH, RS, RH, LS, RH, RS, LH,
  HEAD, LS, HEAD, RS, HEAD, LH, HEAD, RH,
  LS, LE, LE, LA, RS, RE, RE, RA,
  LH, LK, LK, LF, RH, RK, RK, RF,
];
// Minimum distances (fraction of rest length): elbows and knees cannot fold flat, limbs stay out of the torso.
const SPACERS: [number, number, number][] = [
  [LS, LA, 0.5], [RS, RA, 0.5], [LH, LF, 0.6], [RH, RF, 0.6],
  [LF, RF, 0.35], [LK, RK, 0.35], [LF, LS, 0.75], [RF, RS, 0.75], [LA, RH, 0.45], [RA, LH, 0.45],
];
// Eight limb boxes: upper arm, forearm, thigh, shin on each side, with colour slot and thickness.
const LIMBS: [number, number, 'shirt' | 'pants' | 'skin', number][] = [
  [LS, LE, 'shirt', 0.27], [LE, LA, 'skin', 0.21], [RS, RE, 'shirt', 0.27], [RE, RA, 'skin', 0.21],
  [LH, LK, 'pants', 0.33], [LK, LF, 'pants', 0.29], [RH, RK, 'pants', 0.33], [RK, RF, 'pants', 0.29],
];
// Which stick joins each part to the torso, and the render segment that starts at the torso.
const PARTS: Record<BodyPart, { root: number; joint: number; segment: number; limb: number[] }> = {
  armL: { root: LS, joint: LE, segment: 0, limb: [LE, LA] }, armR: { root: RS, joint: RE, segment: 2, limb: [RE, RA] },
  legL: { root: LH, joint: LK, segment: 4, limb: [LK, LF] }, legR: { root: RH, joint: RK, segment: 6, limb: [RK, RF] },
  head: { root: -1, joint: HEAD, segment: -1, limb: [HEAD] },
};
// Heavier torso, lighter limbs: inverse masses used when splitting a constraint correction.
const INV_MASS = [1.1, 0.55, 0.55, 0.5, 0.5, 1.2, 1.2, 1.5, 1.5, 0.9, 0.9, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2];
const STEP = 1 / 120;
const GRAVITY = -24;
const DRAG = 0.996;
const RADIUS = 0.12;
const MAX_BODIES = 18;
// Crowd-model units to ragdoll units across the torso, the head radius, and limbs a little slimmer than their physics thickness.
const TORSO_WIDTH = 1.35;
const HEAD_RADIUS = 0.34;
const LIMB_SLIM = 0.85;

export function createRagdolls(scene: THREE.Scene, colliders: Collider[], ground: (x: number, z: number) => number) {
  const material = figureMaterial();
  const torsos = new FigureBatch(ragdollTorsoGeometry(), material, MAX_BODIES);
  const heads = new FigureBatch(ragdollHeadGeometry(), material, MAX_BODIES);
  const limbs = new FigureBatch(ragdollLimbGeometry(), material, MAX_BODIES * LIMBS.length);
  const batches = [torsos, heads, limbs];
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  // Packed palettes per slot: one for torso and head, one per limb segment (main colour, then hand or shoe).
  const dress = Array.from({ length: MAX_BODIES }, () => ({ body: new Float32Array(16), limbs: LIMBS.map(() => new Float32Array(16)) }));
  for (const batch of batches) {
    for (let i = 0; i < batch.capacity; i++) batch.set(i, hidden, dress[0].body);
    batch.end(0);
    scene.add(batch.mesh);
  }
  // Only slots below the highest one in use are submitted to the GPU.
  function commit() {
    let drawn = 0;
    for (const body of bodies) drawn = Math.max(drawn, body.slot + 1);
    torsos.end(drawn);
    heads.end(drawn);
    limbs.end(drawn * LIMBS.length);
  }
  const bodies: RagdollBody[] = [];
  const freeSlots = Array.from({ length: MAX_BODIES }, (_, i) => MAX_BODIES - 1 - i);
  const stumps: { body: RagdollBody; particle: number; until: number }[] = [];
  let accumulator = 0;

  const ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), mid = new THREE.Vector3();
  const basis = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion(), size = new THREE.Vector3(), torsoQuat = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  function read(body: RagdollBody, i: number, out: THREE.Vector3) {
    return out.set(body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]);
  }
  function distanceOf(p: Float32Array, a: number, b: number) {
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  }

  function spawn(options: { x: number; y: number; z: number; yaw: number; scale: number; look: RagdollLook; velocity: { x: number; y: number; z: number } }) {
    while (!freeSlots.length) remove(bodies[0]);
    const { x, y, z, yaw, scale, look, velocity } = options;
    const pos = new Float32Array(COUNT * 3);
    const prev = new Float32Array(COUNT * 3);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < JOINTS; i++) {
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
    const sticks = Int16Array.from(STICKS);
    const rest = new Float32Array(sticks.length / 2);
    for (let k = 0; k < rest.length; k++) rest[k] = distanceOf(pos, sticks[k * 2], sticks[k * 2 + 1]);
    const spacers = Int16Array.from(SPACERS.flatMap(([a, b]) => [a, b]));
    const spacing = new Float32Array(SPACERS.length);
    SPACERS.forEach(([a, b, fraction], k) => { spacing[k] = distanceOf(pos, a, b) * fraction; });
    const segments = Int16Array.from(LIMBS.flatMap(([a, b]) => [a, b]));
    const slot = freeSlots.pop()!;
    const body: RagdollBody = { slot, pos, prev, sticks, rest, spacing, spacers, segments, scale, look, nearby: [], still: 0, asleep: false, removed: false, detached: new Set(), spare: JOINTS };
    // Dressed like the standing person: same hair, hat or helmet, sleeves and shoes.
    const style = styleOf(look);
    const d = dress[slot];
    palette([look.shirt, look.pants, look.skin, style.hair, style.accent], style.mask, d.body);
    const forearm = style.forearm === 'skin' ? look.skin : look.shirt, shin = style.shin === 'skin' ? look.skin : look.pants;
    const ends = [[look.shirt, look.shirt], [forearm, look.skin], [look.shirt, look.shirt], [forearm, look.skin], [look.pants, look.pants], [shin, style.shoes], [look.pants, look.pants], [shin, style.shoes]];
    ends.forEach((colors, k) => palette(colors, 0, d.limbs[k]));
    bodies.push(body);
    refreshNearby(body);
    sync(body);
    commit();
    return body;
  }

  function hide(slot: number) {
    const d = dress[slot];
    torsos.set(slot, hidden, d.body);
    heads.set(slot, hidden, d.body);
    for (let k = 0; k < LIMBS.length; k++) limbs.set(slot * LIMBS.length + k, hidden, d.limbs[k]);
  }

  function remove(body: RagdollBody) {
    if (body.removed) return;
    body.removed = true;
    hide(body.slot);
    freeSlots.push(body.slot);
    const index = bodies.indexOf(body);
    if (index >= 0) bodies.splice(index, 1);
    for (let i = stumps.length - 1; i >= 0; i--) if (stumps[i].body === body) stumps.splice(i, 1);
    commit();
  }

  function center(body: RagdollBody, out: THREE.Vector3) {
    const p = body.pos;
    return out.set((p[LH * 3] + p[RH * 3]) / 2, (p[LH * 3 + 1] + p[RH * 3 + 1]) / 2, (p[LH * 3 + 2] + p[RH * 3 + 2]) / 2);
  }

  function refreshNearby(body: RagdollBody) {
    center(body, mid);
    body.nearby.length = 0;
    const reach = 4 * body.scale;
    for (const c of colliders) {
      if (mid.x > c.minX - reach && mid.x < c.maxX + reach && mid.z > c.minZ - reach && mid.z < c.maxZ + reach) body.nearby.push(c);
    }
  }

  function wake(body: RagdollBody) { body.asleep = false; body.still = 0; }

  /** Adds a velocity change (m/s) to the body, strongest at `index` when given. */
  function impulse(body: RagdollBody, vx: number, vy: number, vz: number, index = -1) {
    wake(body);
    for (let i = 0; i < COUNT; i++) {
      const f = (index < 0 ? 1 : i === index ? 1.8 : 0.5) * INV_MASS[i];
      body.prev[i * 3] -= vx * STEP * f;
      body.prev[i * 3 + 1] -= vy * STEP * f;
      body.prev[i * 3 + 2] -= vz * STEP * f;
    }
  }

  /** Tears a limb or the head off; the stump bleeds for a few seconds. Returns false if already gone. */
  function detach(body: RagdollBody, part: BodyPart, now: number) {
    if (body.detached.has(part) || body.removed) return false;
    body.detached.add(part);
    const info = PARTS[part];
    if (part === 'head') {
      // Collapse the four neck braces onto the head itself so they no longer pull.
      for (let k = 0; k < body.sticks.length / 2; k++) if (body.sticks[k * 2] === HEAD) body.sticks[k * 2 + 1] = HEAD;
      stumps.push({ body, particle: -1, until: now + 3500 });
    } else {
      const spare = body.spare++;
      for (let axis = 0; axis < 3; axis++) {
        body.pos[spare * 3 + axis] = body.pos[info.root * 3 + axis];
        body.prev[spare * 3 + axis] = body.prev[info.root * 3 + axis];
      }
      // Re-point the joining stick and render segment to the new free end.
      for (let k = 0; k < body.sticks.length / 2; k++) {
        if (body.sticks[k * 2] === info.root && body.sticks[k * 2 + 1] === info.joint) body.sticks[k * 2] = spare;
      }
      body.segments[info.segment * 2] = spare;
      for (let k = 0; k < body.spacers.length / 2; k++) {
        if (info.limb.includes(body.spacers[k * 2]) || info.limb.includes(body.spacers[k * 2 + 1])) body.spacing[k] = 0;
      }
      stumps.push({ body, particle: info.root, until: now + 3500 });
    }
    wake(body);
    return true;
  }

  /** The detachable part closest to a world point (used to decide what a hit tears off). */
  function nearestPart(body: RagdollBody, x: number, y: number, z: number): BodyPart {
    let best: BodyPart = 'armL', bestD = Infinity;
    const probe: [BodyPart, number][] = [['head', HEAD], ['armL', LE], ['armR', RE], ['legL', LK], ['legR', RK]];
    for (const [part, i] of probe) {
      const d = (body.pos[i * 3] - x) ** 2 + (body.pos[i * 3 + 1] - y) ** 2 + (body.pos[i * 3 + 2] - z) ** 2;
      if (d < bestD && !body.detached.has(part)) { bestD = d; best = part; }
    }
    return best;
  }

  /** Shoves particles inside a circle on the ground plane, used for kicks and vehicles. */
  function push(x: number, z: number, radius: number, vx: number, vy: number, vz: number) {
    let touched = 0;
    for (const body of bodies) {
      for (let i = 0; i < body.spare; i++) {
        const dx = body.pos[i * 3] - x, dz = body.pos[i * 3 + 2] - z;
        if (dx * dx + dz * dz > radius * radius || body.pos[i * 3 + 1] > 1.4) continue;
        wake(body);
        body.prev[i * 3] = body.pos[i * 3] - vx * STEP;
        body.prev[i * 3 + 1] = body.pos[i * 3 + 1] - vy * STEP;
        body.prev[i * 3 + 2] = body.pos[i * 3 + 2] - vz * STEP;
        touched++;
      }
    }
    return touched;
  }

  /** Throws every body near an explosion outward and upward. */
  function blast(x: number, y: number, z: number, radius: number, strength: number) {
    for (const body of bodies) {
      for (let i = 0; i < body.spare; i++) {
        const dx = body.pos[i * 3] - x, dy = body.pos[i * 3 + 1] - y, dz = body.pos[i * 3 + 2] - z;
        const d = Math.hypot(dx, dy, dz);
        if (d > radius) continue;
        const f = strength * (1 - d / radius) / Math.max(d, 0.5) * INV_MASS[i];
        wake(body);
        body.prev[i * 3] -= dx * f * STEP;
        body.prev[i * 3 + 1] -= (Math.abs(dy) * f + strength * 0.5 * (1 - d / radius)) * STEP;
        body.prev[i * 3 + 2] -= dz * f * STEP;
      }
    }
  }

  /** Nearest particle hit by a ray; `dir` must be normalised. */
  function raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
    let best: { body: RagdollBody; t: number; index: number } | null = null;
    for (const body of bodies) {
      for (let i = 0; i < body.spare; i++) {
        const r = (i === HEAD || i <= RH ? 0.32 : 0.2) * body.scale;
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

  function solve(p: Float32Array, a: number, b: number, target: number, minimum: boolean) {
    const ia = a * 3, ib = b * 3;
    const dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    if (minimum && d >= target) return;
    const wa = INV_MASS[a], wb = INV_MASS[b];
    const f = (d - target) / d / (wa + wb);
    p[ia] += dx * f * wa; p[ia + 1] += dy * f * wa; p[ia + 2] += dz * f * wa;
    p[ib] -= dx * f * wb; p[ib + 1] -= dy * f * wb; p[ib + 2] -= dz * f * wb;
  }

  function step(body: RagdollBody) {
    const p = body.pos, q = body.prev, n = body.spare * 3;
    for (let i = 0; i < n; i += 3) {
      const vx = (p[i] - q[i]) * DRAG, vy = (p[i + 1] - q[i + 1]) * DRAG, vz = (p[i + 2] - q[i + 2]) * DRAG;
      q[i] = p[i]; q[i + 1] = p[i + 1]; q[i + 2] = p[i + 2];
      p[i] += vx; p[i + 1] += vy + GRAVITY * STEP * STEP; p[i + 2] += vz;
    }
    for (let iteration = 0; iteration < 6; iteration++) {
      for (let k = 0; k < body.rest.length; k++) {
        const a = body.sticks[k * 2], b = body.sticks[k * 2 + 1];
        if (a !== b) solve(p, a, b, body.rest[k], false);
      }
      for (let k = 0; k < body.spacing.length; k++) if (body.spacing[k] > 0) solve(p, body.spacers[k * 2], body.spacers[k * 2 + 1], body.spacing[k], true);
    }
    const r = RADIUS * body.scale;
    let motion = 0;
    for (let i = 0; i < n; i += 3) {
      const floor = ground(p[i], p[i + 2]) + r;
      if (p[i + 1] < floor) {
        p[i + 1] = floor;
        // Ground friction: bleed off horizontal velocity while touching the street.
        q[i] = p[i] - (p[i] - q[i]) * 0.84;
        q[i + 2] = p[i + 2] - (p[i + 2] - q[i + 2]) * 0.84;
      }
      for (const c of body.nearby) {
        const x = p[i], z = p[i + 2];
        if (x <= c.minX - r || x >= c.maxX + r || z <= c.minZ - r || z >= c.maxZ + r) continue;
        const left = x - (c.minX - r), right = c.maxX + r - x, near = z - (c.minZ - r), far = c.maxZ + r - z;
        const least = Math.min(left, right, near, far);
        // Walls absorb most of the impact instead of bouncing the body back.
        if (least === left) { p[i] = c.minX - r; q[i] = p[i] + (q[i] - p[i]) * 0.2; }
        else if (least === right) { p[i] = c.maxX + r; q[i] = p[i] + (q[i] - p[i]) * 0.2; }
        else if (least === near) { p[i + 2] = c.minZ - r; q[i + 2] = p[i + 2] + (q[i + 2] - p[i + 2]) * 0.2; }
        else { p[i + 2] = c.maxZ + r; q[i + 2] = p[i + 2] + (q[i + 2] - p[i + 2]) * 0.2; }
      }
      // Bodies stay inside the fences (or in the river).
      p[i] = Math.max(LAND.minX, Math.min(LAND.maxX, p[i]));
      p[i + 2] = Math.max(RIVER.minZ, Math.min(LAND.maxZ, p[i + 2]));
      motion += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
    }
    body.still = motion < 0.004 ? body.still + 1 : 0;
    if (body.still > 70) body.asleep = true;
  }

  function placeBox(index: number, a: THREE.Vector3, b: THREE.Vector3, thickness: number, look: Float32Array) {
    mid.copy(a).add(b).multiplyScalar(0.5);
    vb.subVectors(b, a);
    const length = vb.length() || 0.01;
    quat.setFromUnitVectors(UP, vb.divideScalar(length));
    const width = thickness * LIMB_SLIM;
    matrix.compose(mid, quat, size.set(width, length + thickness * 0.4, width));
    limbs.set(index, matrix, look);
  }

  function sync(body: RagdollBody) {
    const s = body.scale, slot = body.slot;
    read(body, LS, va).add(read(body, RS, vb)).multiplyScalar(0.5);
    ay.copy(va);
    read(body, LH, va).add(read(body, RH, vb)).multiplyScalar(0.5);
    const tx = (ay.x + va.x) / 2, ty = (ay.y + va.y) / 2, tz = (ay.z + va.z) / 2;
    ay.sub(va);
    const torsoLength = ay.length() || 0.01;
    ay.divideScalar(torsoLength);
    read(body, RS, ax).sub(read(body, LS, vb)).normalize();
    az.crossVectors(ax, ay).normalize();
    ax.crossVectors(ay, az);
    basis.makeBasis(ax, ay, az);
    torsoQuat.setFromRotationMatrix(basis);
    const d = dress[slot];
    // The torso geometry spans hip to shoulder joints over y = -0.5..0.5, so it stretches with the body.
    matrix.compose(mid.set(tx, ty, tz), torsoQuat, size.set(TORSO_WIDTH * s, torsoLength, TORSO_WIDTH * s));
    torsos.set(slot, matrix, d.body);
    // A torn-off head tumbles on its own instead of sharing the torso's orientation.
    const loose = body.detached.has('head');
    const headQuat = loose ? quat.setFromAxisAngle(UP, body.pos[HEAD * 3] * 3) : torsoQuat;
    // The head geometry carries its own hair, hat or helmet, so one instance follows the head particle.
    read(body, HEAD, va);
    matrix.compose(va, headQuat, size.setScalar(HEAD_RADIUS * s));
    heads.set(slot, matrix, d.body);
    LIMBS.forEach(([, , , thickness], k) => placeBox(slot * LIMBS.length + k, read(body, body.segments[k * 2], va), read(body, body.segments[k * 2 + 1], ax), thickness * s, d.limbs[k]));
  }

  return {
    spawn,
    remove,
    blast,
    detach,
    nearestPart,
    impulse,
    push,
    raycast,
    center,
    forEach(callback: (body: RagdollBody) => void) { bodies.forEach(callback); },
    /** Bleeding stumps: calls back with the wound position and an outward spray direction. */
    forEachStump(now: number, callback: (x: number, y: number, z: number, dx: number, dy: number, dz: number) => void) {
      for (let i = stumps.length - 1; i >= 0; i--) {
        const stump = stumps[i];
        if (now > stump.until || stump.body.removed) { stumps.splice(i, 1); continue; }
        const body = stump.body;
        if (stump.particle < 0) {
          read(body, LS, va).add(read(body, RS, vb)).multiplyScalar(0.5);
          center(body, vb);
          callback(va.x, va.y, va.z, va.x - vb.x, va.y - vb.y + 0.3, va.z - vb.z);
        } else {
          read(body, stump.particle, va);
          center(body, vb);
          callback(va.x, va.y, va.z, va.x - vb.x, 0.4, va.z - vb.z);
        }
      }
    },
    update(dt: number) {
      for (const body of bodies) if (!body.asleep) refreshNearby(body);
      accumulator = Math.min(accumulator + dt, STEP * 4);
      while (accumulator >= STEP) {
        accumulator -= STEP;
        for (const body of bodies) if (!body.asleep) step(body);
      }
      let changed = false;
      for (const body of bodies) {
        // One last sync on the frame a body falls asleep, then it costs nothing.
        if (!body.asleep || body.still === 71) { sync(body); changed = true; if (body.asleep) body.still++; }
      }
      if (changed) commit();
    },
    dispose() {
      for (const batch of batches) { scene.remove(batch.mesh); batch.dispose(); }
      bodies.length = 0;
      material.dispose();
    },
  };
}
