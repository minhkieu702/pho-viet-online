import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraMode, firstPersonAllowed, firstPersonPose, cameraDirection, EYE_HEIGHT } from '../app/game/camera-mode.ts';

const play = { running: true, interior: false, counter: false, down: false };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('camera defaults to third person and toggles locally toward current heading', () => {
  const camera = createCameraMode();
  assert.equal(camera.mode, 'third-person');
  assert.equal(camera.toggle(Math.PI / 2), 'first-person');
  close(camera.yaw, Math.PI / 2); close(camera.pitch, 0);
  assert.equal(camera.toggle(-1), 'third-person');
  const otherPlayer = createCameraMode(); assert.equal(otherPlayer.mode, 'third-person');
});

test('interiors, counter shots, arrest and downed scenes override and restore saved first-person choice', () => {
  const camera = createCameraMode(); camera.toggle(0.7); camera.rotate(30, -25);
  const yaw = camera.yaw, pitch = camera.pitch;
  for (const overlay of ['interior', 'counter', 'down']) {
    assert.equal(firstPersonAllowed(camera.mode, { ...play, [overlay]: true }), false);
    assert.equal(firstPersonAllowed(camera.mode, play), true);
    close(camera.yaw, yaw); close(camera.pitch, pitch);
  }
  assert.equal(firstPersonAllowed(camera.mode, { ...play, running: false }), false);
  assert.equal(firstPersonAllowed('third-person', play), false);
});

test('looking right follows the Three.js camera right vector when facing positive Z', () => {
  const camera = createCameraMode(); camera.toggle(0); camera.rotate(50, 0);
  const direction = cameraDirection(camera.yaw, camera.pitch);
  assert.ok(direction.x < 0); assert.ok(direction.z > 0);
  close(Math.hypot(direction.x, direction.y, direction.z), 1);
});

test('look input clamps up and down and ignores invalid events', () => {
  const camera = createCameraMode(); camera.toggle(0); camera.rotate(0, -10000);
  close(camera.pitch, 1.3); assert.ok(cameraDirection(camera.yaw, camera.pitch).y > 0);
  camera.rotate(0, 10000); close(camera.pitch, -1.3);
  const yaw = camera.yaw; camera.rotate(NaN, Infinity); close(camera.yaw, yaw); close(camera.pitch, -1.3);
  camera.reset(2); close(camera.yaw, 2); close(camera.pitch, 0); assert.equal(camera.mode, 'first-person');
});

test('first-person eye respects real elevation, jump and Iron Man flight instead of the ground below', () => {
  const ground = firstPersonPose({ x: 4, y: 3, z: 8, kind: 'foot' }, 0, 0);
  const jumping = firstPersonPose({ x: 4, y: 4, z: 8, kind: 'foot' }, 0, 0);
  const flying = firstPersonPose({ x: 4, y: 8.5, z: 8, kind: 'foot' }, 0, 0);
  close(ground.eye.y, 4.55); close(jumping.eye.y - ground.eye.y, 1); close(flying.eye.y - ground.eye.y, 5.5);
});

for (const [kind, anchor, expected] of [
  ['car', 0.7, 1.42], ['scooter', 0.8, 1.72], ['boat', -2, -0.35], ['swim', -2, -1.74],
  ['passenger', 1.2, 2.08], ['seat', 0.45, 1.33], ['glide', 90, 91.5],
]) test(`${kind} eye height follows its own seat, water or air anchor`, () => {
  const pose = firstPersonPose({ x: 12, y: anchor, z: -4, kind }, 1, -0.2);
  close(pose.eye.y, expected); close(pose.eye.x, 12); close(pose.eye.z, -4);
  assert.ok(EYE_HEIGHT[kind] > 0); close(Math.hypot(...Object.values(pose.direction)), 1);
});

test('vehicle yaw changes carry a free look offset through steering and angle wrapping', () => {
  const camera = createCameraMode(); camera.toggle(3.1); camera.followCarrier('car', 3.1);
  camera.rotate(40, -20); const before = camera.yaw, pitch = camera.pitch;
  camera.followCarrier('car', -3.1);
  close(camera.yaw - before, Math.PI * 2 - 6.2); close(camera.pitch, pitch);
  const after = camera.yaw; camera.followCarrier(null, 1); camera.followCarrier(null, 2);
  close(camera.yaw, after);
});

test('switching carrier does not apply an unrelated previous vehicle turn', () => {
  const camera = createCameraMode(); camera.toggle(0.5); camera.followCarrier('car', 1.2);
  const yaw = camera.yaw; camera.followCarrier('boat', -2.7); close(camera.yaw, yaw);
  camera.followCarrier('boat', -2.2); close(camera.yaw, yaw + 0.5);
});
