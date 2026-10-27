import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';

// Vehicle layout dependencies use extensionless TypeScript imports, as in Vite.
module.register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) {
  try { return await n(s, c); } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) return n(s + '.ts', c);
    throw e;
  }
}`)}`);

const THREE = await import('three');
const { createVehicles } = await import('../app/game/vehicles.ts');

test('first-person vehicle visibility changes drawing, preserves physics and restores on exit', () => {
  const scene = new THREE.Scene();
  const fleet = createVehicles(scene, () => true);
  const car = fleet.cars.find((c) => c.kind === 'police');
  Object.assign(car, { mode: 'player', x: 42.312, z: 42.812, yaw: 0, speed: 0, health: 180 });
  const player = { x: car.x, z: car.z, car };
  const ownInstances = () => {
    let count = 0;
    const matrix = new THREE.Matrix4();
    scene.traverse((mesh) => {
      if (!mesh.isInstancedMesh || !mesh.visible) return;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        if (Math.abs(matrix.elements[12] - car.x) < 0.8 && Math.abs(matrix.elements[14] - car.z) < 0.8 && Math.abs(matrix.determinant()) > 1e-9) count++;
      }
    });
    return count;
  };
  try {
    fleet.update(0, 0, player, []);
    const visible = ownInstances();
    assert.ok(visible >= 3, 'car body, glass and lights are drawn');
    const physical = { x: car.x, z: car.z, mode: car.mode, health: car.health, speed: car.speed };
    fleet.setHiddenVehicle(car);
    fleet.update(0, 0, player, []);
    assert.equal(ownInstances(), 0, 'no local car geometry blocks the first-person eye');
    assert.deepEqual({ x: car.x, z: car.z, mode: car.mode, health: car.health, speed: car.speed }, physical);
    assert.ok(fleet.live.includes(car), 'vehicle remains in the physics world');
    fleet.setHiddenVehicle(null);
    fleet.update(0, 0, player, []);
    assert.equal(ownInstances(), visible, 'switching back restores every car instance');
  } finally {
    fleet.dispose();
  }
});
