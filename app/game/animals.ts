import * as THREE from 'three';
import { BUILDINGS, POIS } from './city';

type Kind = 'dog' | 'cat' | 'squirrel' | 'bird';
type Part = [number, number, number, number, number, number, number]; // size xyz, offset xyz, colour slot (0 coat, 1 dark, 2 light)
type Corpse = { pos: Float32Array; prev: Float32Array; rest: Float32Array; asleep: number };
type Animal = {
  kind: Kind;
  x: number; z: number; y: number; yaw: number; targetYaw: number;
  speed: number; stride: number;
  state: 'idle' | 'walk' | 'run' | 'fly' | 'down' | 'gone';
  tx: number; tz: number; timer: number;
  homeX: number; homeZ: number; roam: number;
  colors: string[];
  corpse: Corpse | null;
  barkAt: number;
};

// Body parts per species in metres, at rest, facing +z.
const PARTS: Record<Kind, Part[]> = {
  dog: [[0.3, 0.28, 0.72, 0, 0.45, 0, 0], [0.24, 0.24, 0.28, 0, 0.62, 0.44, 0], [0.13, 0.1, 0.14, 0, 0.57, 0.62, 2], [0.06, 0.12, 0.06, -0.08, 0.78, 0.4, 1], [0.06, 0.12, 0.06, 0.08, 0.78, 0.4, 1], [0.06, 0.06, 0.3, 0, 0.56, -0.46, 0]],
  cat: [[0.18, 0.17, 0.42, 0, 0.27, 0, 0], [0.17, 0.16, 0.17, 0, 0.4, 0.27, 0], [0.05, 0.07, 0.05, -0.05, 0.51, 0.27, 1], [0.05, 0.07, 0.05, 0.05, 0.51, 0.27, 1], [0.04, 0.32, 0.04, 0, 0.42, -0.24, 0]],
  squirrel: [[0.11, 0.12, 0.2, 0, 0.1, 0, 0], [0.1, 0.1, 0.1, 0, 0.17, 0.12, 0], [0.12, 0.24, 0.08, 0, 0.22, -0.15, 2]],
  bird: [[0.12, 0.12, 0.22, 0, 0.1, 0, 0], [0.08, 0.08, 0.09, 0, 0.18, 0.12, 2], [0.2, 0.02, 0.1, -0.13, 0.13, 0, 1], [0.2, 0.02, 0.1, 0.13, 0.13, 0, 1]],
};
// Legs (dogs and cats): hip/shoulder pivots and length.
const LEGS: Partial<Record<Kind, { x: number; z: number; y: number; length: number; width: number }>> = {
  dog: { x: 0.1, z: 0.26, y: 0.36, length: 0.36, width: 0.08 },
  cat: { x: 0.06, z: 0.15, y: 0.2, length: 0.2, width: 0.05 },
};
const COATS: Record<Kind, string[][]> = {
  dog: [['#c8a06a', '#5a3e28', '#e8dcc4'], ['#2b2522', '#141110', '#8a7f74'], ['#e9e2d2', '#8a6b4a', '#f6f1e6'], ['#a0643a', '#4a2c1a', '#d9b48c']],
  cat: [['#d98c3c', '#7a4a20', '#f2e2c8'], ['#3a3a3e', '#1a1a1c', '#9a9aa0'], ['#f0ece2', '#b0a090', '#ffffff']],
  squirrel: [['#8a5a32', '#4a2e18', '#c08a5a']],
  bird: [['#8f98a3', '#5f6873', '#4f7a6a'], ['#a7adb4', '#6a7078', '#7a5a8a']],
};
const SPEEDS: Record<Kind, { walk: number; run: number }> = { dog: { walk: 1.3, run: 6.5 }, cat: { walk: 0.9, run: 5 }, squirrel: { walk: 1.6, run: 4.5 }, bird: { walk: 0.5, run: 1.2 } };
const COUNT: Record<Kind, number> = { dog: 9, cat: 6, squirrel: 8, bird: 32 };
// Simple corpse physics: a few particles joined by sticks.
const CORPSE: Record<Kind, number[][]> = {
  dog: [[0, 0.45, 0.32], [0, 0.45, -0.32], [0, 0.62, 0.5], [-0.1, 0.05, 0.28], [0.1, 0.05, 0.28], [-0.1, 0.05, -0.28], [0.1, 0.05, -0.28]],
  cat: [[0, 0.27, 0.18], [0, 0.27, -0.18], [0, 0.4, 0.3], [-0.06, 0.03, 0.16], [0.06, 0.03, 0.16], [-0.06, 0.03, -0.16], [0.06, 0.03, -0.16]],
  squirrel: [[0, 0.1, 0.08], [0, 0.1, -0.08], [0, 0.17, 0.14], [0, 0.22, -0.18]],
  bird: [[0, 0.1, 0.08], [0, 0.1, -0.08], [0, 0.18, 0.13], [-0.22, 0.12, 0], [0.22, 0.12, 0]],
};
const STEP = 1 / 90;

/** Street dogs, doorstep cats, park squirrels and pigeon flocks; any of them tumbles as a ragdoll when hit. */
export function createAnimals(
  scene: THREE.Scene,
  world: { clear: (x: number, z: number, radius: number) => boolean; ground: (x: number, z: number) => number },
  say: (key: string, text: string, at: () => { x: number; y: number; z: number } | null) => void = () => {},
) {
  let seed = 23;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const animals: Animal[] = [];
  const parks = POIS.filter((p) => p.kind === 'park' || p.kind === 'square' || p.kind === 'pagoda-yard');
  const homes = BUILDINGS.filter((b) => b.residents > 0);
  const spot = (kind: Kind): { x: number; z: number; roam: number } => {
    if (kind === 'squirrel' || kind === 'bird') { const p = parks[Math.floor(random() * parks.length)] ?? POIS[0]; return { x: p.x, z: p.z, roam: kind === 'bird' ? 4 : 7 }; }
    const b = homes[Math.floor(random() * homes.length)];
    return kind === 'cat' ? { x: b.door.x, z: b.door.z, roam: 2.5 } : { x: b.curb.x, z: b.curb.z, roam: 12 };
  };
  for (const kind of ['dog', 'cat', 'squirrel', 'bird'] as Kind[]) {
    let flock = spot(kind);
    for (let i = 0; i < COUNT[kind]; i++) {
      // Pigeons come in flocks of eight around one spot.
      const home = kind === 'bird' ? (i % 8 === 0 ? (flock = spot(kind)) : flock) : spot(kind);
      const coat = COATS[kind][Math.floor(random() * COATS[kind].length)];
      const a = random() * Math.PI * 2, r = random() * home.roam * 0.6;
      animals.push({ kind, x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r, y: 0, yaw: random() * 6.28, targetYaw: 0, speed: 0, stride: random() * 9, state: 'idle', tx: 0, tz: 0, timer: random() * 4, homeX: home.x, homeZ: home.z, roam: home.roam, colors: coat, corpse: null, barkAt: 0 });
    }
  }

  // One instanced box mesh holds every part of every animal (body parts + legs).
  const slotsPer = (kind: Kind) => PARTS[kind].length + (LEGS[kind] ? 4 : 0);
  const offsets: number[] = [];
  let total = 0;
  for (const animal of animals) { offsets.push(total); total += slotsPer(animal.kind); }
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geometry, material, total);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const color = new THREE.Color();
  animals.forEach((animal, n) => {
    PARTS[animal.kind].forEach((part, k) => mesh.setColorAt(offsets[n] + k, color.set(animal.colors[part[6]])));
    if (LEGS[animal.kind]) for (let k = 0; k < 4; k++) mesh.setColorAt(offsets[n] + PARTS[animal.kind].length + k, color.set(animal.colors[0]));
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), out = new THREE.Matrix4();
  const quat = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0), yAxis = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), basisX = new THREE.Vector3(), basisY = new THREE.Vector3(), basisZ = new THREE.Vector3(), basis = new THREE.Matrix4();

  function startCorpse(animal: Animal, vx: number, vy: number, vz: number) {
    const points = CORPSE[animal.kind];
    const p = new Float32Array(points.length * 3), q = new Float32Array(points.length * 3);
    const c = Math.cos(animal.yaw), s = Math.sin(animal.yaw);
    points.forEach(([lx, ly, lz], i) => {
      p[i * 3] = animal.x + lx * c + lz * s; p[i * 3 + 1] = animal.y + ly; p[i * 3 + 2] = animal.z - lx * s + lz * c;
      const j = 0.7 + Math.random() * 0.6;
      q[i * 3] = p[i * 3] - vx * STEP * j; q[i * 3 + 1] = p[i * 3 + 1] - vy * STEP * j; q[i * 3 + 2] = p[i * 3 + 2] - vz * STEP * j;
    });
    // Every particle is tied to the first two (the body), which keeps the shape without a full skeleton.
    const rest = new Float32Array(points.length * 2);
    for (let i = 0; i < points.length; i++) for (let k = 0; k < 2; k++) rest[i * 2 + k] = Math.hypot(p[i * 3] - p[k * 3], p[i * 3 + 1] - p[k * 3 + 1], p[i * 3 + 2] - p[k * 3 + 2]);
    animal.corpse = { pos: p, prev: q, rest, asleep: 0 };
  }
  function stepCorpse(animal: Animal) {
    const body = animal.corpse!;
    const p = body.pos, q = body.prev, n = p.length / 3;
    for (let i = 0; i < n * 3; i += 3) {
      const vx = (p[i] - q[i]) * 0.995, vy = (p[i + 1] - q[i + 1]) * 0.995, vz = (p[i + 2] - q[i + 2]) * 0.995;
      q[i] = p[i]; q[i + 1] = p[i + 1]; q[i + 2] = p[i + 2];
      p[i] += vx; p[i + 1] += vy - 22 * STEP * STEP; p[i + 2] += vz;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
        if (i === k) continue;
        const a = k * 3, b = i * 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const f = (d - body.rest[i * 2 + k]) / d * 0.5;
        p[a] += dx * f; p[a + 1] += dy * f; p[a + 2] += dz * f;
        p[b] -= dx * f; p[b + 1] -= dy * f; p[b + 2] -= dz * f;
      }
    }
    let motion = 0;
    for (let i = 0; i < n * 3; i += 3) {
      const floor = world.ground(p[i], p[i + 2]) + 0.04;
      if (p[i + 1] < floor) { p[i + 1] = floor; q[i] = p[i] - (p[i] - q[i]) * 0.8; q[i + 2] = p[i + 2] - (p[i + 2] - q[i + 2]) * 0.8; }
      motion += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
    }
    body.asleep = motion < 0.002 ? body.asleep + 1 : 0;
  }

  function drawAlive(animal: Animal, n: number, time: number) {
    const sit = animal.state === 'idle' && animal.kind !== 'bird' && animal.timer > 2;
    base.compose(pos.set(animal.x, animal.y, animal.z), quat.setFromAxisAngle(yAxis, animal.yaw), size.set(1, 1, 1));
    const flap = animal.state === 'fly' ? Math.sin(time * 26 + n) * 0.9 : 0;
    const peck = animal.kind === 'bird' && animal.state === 'idle' ? Math.max(0, Math.sin(time * 4 + n)) * 0.06 : 0;
    PARTS[animal.kind].forEach(([sx, sy, sz, ox, oy, oz], k) => {
      let tilt = 0, roll = 0, y = oy, z = oz;
      if (animal.kind === 'bird' && k >= 2) roll = (k === 2 ? 1 : -1) * flap;
      if (animal.kind === 'bird' && k === 1) { y -= peck; z += peck; }
      if (animal.kind === 'dog' && k === 5) tilt = -0.6 + Math.sin(time * 9 + n) * 0.3;
      if (sit && k === 0) { tilt = -0.35; y -= 0.06; }
      quat.setFromAxisAngle(xAxis, tilt);
      if (roll) quat.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, roll));
      local.compose(pos.set(ox, y, z), quat, size.set(sx, sy, sz));
      mesh.setMatrixAt(offsets[n] + k, out.multiplyMatrices(base, local));
    });
    const leg = LEGS[animal.kind];
    if (leg) {
      const swing = animal.speed > 0.1 ? Math.sin(animal.stride) * (animal.state === 'run' ? 0.9 : 0.5) : 0;
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], k) => {
        const angle = (k === 0 || k === 3 ? swing : -swing) + (sit && sz < 0 ? -1.2 : 0);
        quat.setFromAxisAngle(xAxis, angle);
        local.compose(pos.set(sx * leg.x, leg.y - Math.cos(angle) * leg.length / 2, sz * leg.z - Math.sin(angle) * leg.length / 2), quat, size.set(leg.width, leg.length, leg.width));
        mesh.setMatrixAt(offsets[n] + PARTS[animal.kind].length + k, out.multiplyMatrices(base, local));
      });
    }
  }
  function drawCorpse(animal: Animal, n: number) {
    const p = animal.corpse!.pos;
    va.set(p[0], p[1], p[2]); vb.set(p[3], p[4], p[5]);
    basisZ.subVectors(va, vb);
    const length = basisZ.length() || 0.01;
    basisZ.divideScalar(length);
    basisX.crossVectors(yAxis, basisZ).normalize();
    if (basisX.lengthSq() < 0.01) basisX.set(1, 0, 0);
    basisY.crossVectors(basisZ, basisX);
    basis.makeBasis(basisX, basisY, basisZ);
    // Lying on its side: roll the whole body a quarter turn.
    quat.setFromRotationMatrix(basis).multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, Math.PI / 2));
    base.compose(pos.copy(va).add(vb).multiplyScalar(0.5).setY(Math.min(va.y, vb.y)), quat, size.set(1, 1, 1));
    PARTS[animal.kind].forEach(([sx, sy, sz, ox, oy, oz], k) => {
      local.compose(pos.set(ox, oy - PARTS[animal.kind][0][4], oz), quat.identity(), size.set(sx, sy, sz));
      mesh.setMatrixAt(offsets[n] + k, out.multiplyMatrices(base, local));
    });
    const leg = LEGS[animal.kind];
    if (leg) for (let k = 0; k < 4; k++) {
      const fx = p[(3 + k) * 3], fy = p[(3 + k) * 3 + 1], fz = p[(3 + k) * 3 + 2];
      const root = k < 2 ? va : vb;
      basisY.set(root.x - fx, root.y - fy, root.z - fz);
      const l = basisY.length() || 0.01;
      quat.setFromUnitVectors(yAxis, basisY.divideScalar(l));
      local.compose(pos.set((root.x + fx) / 2, (root.y + fy) / 2, (root.z + fz) / 2), quat, size.set(leg.width, Math.min(l, leg.length * 1.3), leg.width));
      mesh.setMatrixAt(offsets[n] + PARTS[animal.kind].length + k, local);
    }
  }
  function hide(n: number, animal: Animal) {
    for (let k = 0; k < slotsPer(animal.kind); k++) mesh.setMatrixAt(offsets[n] + k, hidden);
  }

  function pickTarget(animal: Animal) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * animal.roam;
      const x = animal.homeX + Math.cos(a) * r, z = animal.homeZ + Math.sin(a) * r;
      if (world.clear(x, z, 0.25)) { animal.tx = x; animal.tz = z; return true; }
    }
    return false;
  }
  function scare(animal: Animal, fromX: number, fromZ: number) {
    if (animal.state === 'down' || animal.state === 'gone') return;
    if (animal.kind === 'bird') {
      // Pigeons take off and settle at another park.
      const p = parks[Math.floor(Math.random() * parks.length)];
      animal.state = 'fly';
      animal.homeX = p.x; animal.homeZ = p.z;
      animal.tx = p.x + (Math.random() - 0.5) * 6; animal.tz = p.z + (Math.random() - 0.5) * 6;
      animal.timer = 0;
      return;
    }
    const dx = animal.x - fromX, dz = animal.z - fromZ, d = Math.hypot(dx, dz) || 1;
    animal.tx = animal.x + dx / d * 10; animal.tz = animal.z + dz / d * 10;
    animal.state = 'run';
    animal.timer = 3;
  }

  let accumulator = 0;
  return {
    /** Nearest living or dead animal hit by a ray. */
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { index: number; t: number } | null = null;
      animals.forEach((animal, index) => {
        if (animal.state === 'gone') return;
        const cy = animal.corpse ? animal.corpse.pos[1] : animal.y + (animal.kind === 'dog' ? 0.45 : animal.kind === 'cat' ? 0.27 : 0.12);
        const cx = animal.corpse ? animal.corpse.pos[0] : animal.x, cz = animal.corpse ? animal.corpse.pos[2] : animal.z;
        const r = animal.kind === 'dog' ? 0.38 : animal.kind === 'cat' ? 0.25 : 0.16;
        const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
        const b = ox * dir.x + oy * dir.y + oz * dir.z, c = ox * ox + oy * oy + oz * oz - r * r;
        const disc = b * b - c;
        if (disc < 0) return;
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < maxT && (!best || t < best.t)) best = { index, t };
      });
      return best as { index: number; t: number } | null;
    },
    /** Knocks an animal over (or flings its corpse); returns its position for blood. */
    hit(index: number, vx: number, vy: number, vz: number) {
      const animal = animals[index];
      if (animal.state === 'gone') return null;
      if (!animal.corpse) {
        startCorpse(animal, vx, vy, vz);
        animal.state = 'down';
        animal.timer = 25;
      } else {
        const p = animal.corpse.prev;
        for (let i = 0; i < p.length; i += 3) { p[i] -= vx * STEP; p[i + 1] -= vy * STEP; p[i + 2] -= vz * STEP; }
        animal.corpse.asleep = 0;
      }
      return { x: animal.corpse!.pos[0], y: animal.corpse!.pos[1], z: animal.corpse!.pos[2] };
    },
    near(x: number, z: number, radius: number, callback: (index: number, ax: number, az: number) => void) {
      animals.forEach((animal, index) => {
        if (animal.state === 'gone' || animal.corpse) return;
        if ((animal.x - x) ** 2 + (animal.z - z) ** 2 < radius * radius && animal.y < 1) callback(index, animal.x, animal.z);
      });
    },
    blast(x: number, y: number, z: number, radius: number, strength: number) {
      animals.forEach((animal, index) => {
        if (animal.state === 'gone') return;
        const ax = animal.corpse ? animal.corpse.pos[0] : animal.x, az = animal.corpse ? animal.corpse.pos[2] : animal.z;
        const d = Math.hypot(ax - x, az - z);
        if (d > radius) return;
        const f = strength * (1 - d / radius);
        this.hit(index, (ax - x) / (d || 1) * f, f * 0.8 + 3, (az - z) / (d || 1) * f);
      });
      void y;
    },
    alarm(x: number, z: number, radius: number) {
      for (const animal of animals) if (Math.hypot(animal.x - x, animal.z - z) < radius) scare(animal, x, z);
    },
    update(dt: number, time: number, playerX: number, playerZ: number) {
      accumulator = Math.min(accumulator + dt, STEP * 4);
      let steps = 0;
      while (accumulator >= STEP) { accumulator -= STEP; steps++; }
      animals.forEach((animal, n) => {
        if (animal.state === 'gone') {
          animal.timer -= dt;
          if (animal.timer <= 0) {
            // A new animal wanders in at its home spot.
            animal.state = 'idle';
            const a = Math.random() * Math.PI * 2;
            animal.x = animal.homeX + Math.cos(a) * animal.roam * 0.5;
            animal.z = animal.homeZ + Math.sin(a) * animal.roam * 0.5;
          } else { hide(n, animal); return; }
        }
        if (animal.state === 'down') {
          for (let s = 0; s < steps; s++) if (animal.corpse!.asleep < 60) stepCorpse(animal);
          animal.timer -= dt;
          if (animal.timer <= 0) { animal.state = 'gone'; animal.corpse = null; animal.timer = 40; hide(n, animal); return; }
          drawCorpse(animal, n);
          return;
        }
        const speeds = SPEEDS[animal.kind];
        const dPlayer = Math.hypot(animal.x - playerX, animal.z - playerZ);
        if (animal.kind === 'bird' && animal.state !== 'fly' && dPlayer < 4.5) scare(animal, playerX, playerZ);
        if ((animal.kind === 'cat' || animal.kind === 'squirrel') && animal.state !== 'run' && dPlayer < 2.5) scare(animal, playerX, playerZ);
        if (animal.kind === 'dog' && dPlayer < 6 && time > animal.barkAt) {
          animal.barkAt = time + 6 + Math.random() * 8;
          say(`dog${n}`, Math.random() < 0.5 ? 'Gâu gâu!' : 'Gâu!', () => (animal.state === 'gone' || animal.corpse ? null : { x: animal.x, y: animal.y + 0.9, z: animal.z }));
          animal.targetYaw = Math.atan2(playerX - animal.x, playerZ - animal.z);
        }
        if (animal.kind === 'cat' && dPlayer < 7 && time > animal.barkAt && Math.random() < dt * 0.2) {
          animal.barkAt = time + 10;
          say(`cat${n}`, 'Meo~', () => (animal.state === 'gone' || animal.corpse ? null : { x: animal.x, y: animal.y + 0.6, z: animal.z }));
        }
        animal.timer -= dt;
        let want = 0;
        if (animal.state === 'fly') {
          // Climb, glide to the new spot, then flutter down.
          const dx = animal.tx - animal.x, dz = animal.tz - animal.z, d = Math.hypot(dx, dz);
          const cruise = d > 4 ? 6 + (n % 4) : 1.5;
          animal.y += ((d > 4 ? 7 + (n % 3) : world.ground(animal.x, animal.z)) - animal.y) * Math.min(1, dt * 1.5);
          if (d > 0.3) { animal.x += dx / d * cruise * dt; animal.z += dz / d * cruise * dt; animal.targetYaw = Math.atan2(dx, dz); }
          if (d < 0.5 && animal.y < world.ground(animal.x, animal.z) + 0.1) { animal.state = 'idle'; animal.timer = 2 + Math.random() * 4; }
        } else {
          if (animal.state === 'idle' && animal.timer <= 0) {
            if (pickTarget(animal)) animal.state = 'walk';
            animal.timer = 3 + Math.random() * 6;
          }
          if (animal.state === 'walk' || animal.state === 'run') {
            const dx = animal.tx - animal.x, dz = animal.tz - animal.z, d = Math.hypot(dx, dz);
            want = animal.state === 'run' ? speeds.run : speeds.walk;
            if (d < 0.3 || (animal.state === 'run' && animal.timer <= 0)) { animal.state = 'idle'; animal.timer = 2 + Math.random() * 5; want = 0; }
            else {
              animal.targetYaw = Math.atan2(dx, dz);
              const step = animal.speed * dt;
              const nx = animal.x + dx / d * step, nz = animal.z + dz / d * step;
              if (world.clear(nx, nz, 0.2)) { animal.x = nx; animal.z = nz; }
              else { animal.state = 'idle'; animal.timer = 1; }
            }
          }
          animal.y = world.ground(animal.x, animal.z);
        }
        animal.speed = THREE.MathUtils.damp(animal.speed, want, 6, dt);
        animal.stride += animal.speed * dt * (animal.kind === 'dog' ? 7 : 10);
        animal.yaw += Math.atan2(Math.sin(animal.targetYaw - animal.yaw), Math.cos(animal.targetYaw - animal.yaw)) * (1 - Math.exp(-dt * 7));
        drawAlive(animal, n, time);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    forEachShadow(callback: (x: number, z: number, size: number) => void) {
      for (const animal of animals) if ((animal.state === 'idle' || animal.state === 'walk' || animal.state === 'run') && animal.kind === 'dog') callback(animal.x, animal.z, 0.6);
    },
    dispose() { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}
