import * as THREE from 'three';

type Pickup = { x: number; z: number; y: number; amount: number; born: number; spin: number };

/** Cash bundles dropped by robbed or downed people; walk over them to collect. One draw call. */
export function createPickups(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  const MAX = 40;
  const geometry = new THREE.BoxGeometry(0.42, 0.12, 0.24);
  const material = new THREE.MeshStandardMaterial({ color: '#4fae5a', emissive: '#1d6b2a', emissiveIntensity: 0.6, roughness: 0.6 });
  const mesh = new THREE.InstancedMesh(geometry, material, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  const items: Pickup[] = [];
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  return {
    /** Drops `amount` (thousands of đồng) near a point, scattered a little so stacks don't overlap. */
    drop(x: number, z: number, amount: number, now: number) {
      if (items.length >= MAX) items.shift();
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      items.push({ x: px, z: pz, y: ground(px, pz), amount, born: now, spin: Math.random() * 6 });
    },
    forEach(callback: (x: number, z: number) => void) { for (const item of items) callback(item.x, item.z); },
    /** Returns the total collected by a player standing at (x, z) this frame. */
    update(now: number, x: number, z: number, canCollect: boolean) {
      let collected = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (now - item.born > 90_000) { items.splice(i, 1); continue; }
        if (canCollect && now - item.born > 350 && (item.x - x) ** 2 + (item.z - z) ** 2 < 1.3) {
          collected += item.amount;
          items.splice(i, 1);
        }
      }
      items.forEach((item, i) => {
        quat.setFromAxisAngle(up, item.spin + now * 0.003);
        matrix.compose(pos.set(item.x, item.y + 0.35 + Math.sin(now * 0.004 + item.spin) * 0.08, item.z), quat, one);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.count = items.length;
      mesh.instanceMatrix.needsUpdate = true;
      return collected;
    },
    clear() { items.length = 0; },
    dispose() { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}
