import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeerInterpolator, createSnapshotClock, INTERPOLATION_DELAY_MS, MAX_EXTRAPOLATION_MS } from '../app/game/peer-interpolation.ts';

const EPOCH = 1_800_000_000_000;
const peer = (x, updatedAt, extra = {}) => ({
  id: 'other-player', name: 'Minh', color: '#123456', x, z: 0, angle: 0,
  riding: false, speed: 10, score: 0, updatedAt, ...extra,
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} should equal ${expected}`);

test('server epoch maps to the local monotonic clock despite unrelated wall clocks', () => {
  const clock = createSnapshotClock();
  assert.equal(clock.observe(EPOCH, 5000), true);
  close(clock.renderTime(5000), EPOCH - INTERPOLATION_DELAY_MS);
  close(clock.renderTime(5300), EPOCH + 300 - INTERPOLATION_DELAY_MS);
});

test('irregular arrivals interpolate by server sample times instead of packet arrival gaps', () => {
  const clock = createSnapshotClock();
  const track = createPeerInterpolator();
  for (const [at, arrival, x] of [[0, 100, 0], [50, 185, 0.5], [100, 202, 1], [150, 275, 1.5]]) {
    assert.equal(clock.observe(EPOCH + at, arrival), true);
    track.push(peer(x, EPOCH + at), EPOCH + at);
  }
  close(track.sample(clock.renderTime(320)).x, 1);
  close(track.sample(clock.renderTime(345)).x, 1.25);
});

test('clock rejects duplicate or out-of-order snapshots and limits clock correction', () => {
  const clock = createSnapshotClock();
  clock.observe(EPOCH, 150);
  const before = clock.renderTime(250);
  assert.equal(clock.observe(EPOCH, 300), false);
  assert.equal(clock.observe(EPOCH - 1, 301), false);
  assert.equal(clock.observe(EPOCH + 50, 150), true);
  const after = clock.renderTime(250);
  close(after - before, 5);
  assert.ok(clock.renderTime(200) >= after, 'render clock never rewinds');
});

test('duplicate peer timestamps do not accumulate velocity or rewrite newer samples', () => {
  const track = createPeerInterpolator();
  track.push(peer(0, 0), 0);
  track.push(peer(1, 100), 100);
  assert.equal(track.push(peer(99, 100), 150), false);
  assert.equal(track.push(peer(-99, 50), 200), false);
  close(track.sample(50).x, 0.5);
  close(track.sample(100).x, 1);
});

test('angles interpolate across the shortest arc at the wrap boundary', () => {
  const track = createPeerInterpolator();
  const radians = Math.PI / 180;
  track.push(peer(0, 0, { angle: 179 * radians }), 0);
  track.push(peer(0, 100, { angle: -179 * radians }), 100);
  close(track.sample(50).angle, Math.PI);
});

test('bounded extrapolation freezes position and walking after a network gap', () => {
  const track = createPeerInterpolator();
  track.push(peer(0, 0), 0);
  track.push(peer(1, 100), 100);
  close(track.sample(160).x, 1.6);
  const limit = 1 + 10 * MAX_EXTRAPOLATION_MS / 1000;
  close(track.sample(500).x, limit);
  close(track.sample(60_000).x, limit);
  assert.equal(track.sample(500).speed, 0);
});

test('a stationary sample overrides stale transmitted velocity', () => {
  const track = createPeerInterpolator();
  track.push(peer(0, 0), 0);
  track.push(peer(1, 100, { vx: 10, vz: 0 }), 100);
  track.push(peer(1, 150, { vx: 10, vz: 0 }), 150);
  close(track.sample(200).x, 1);
  assert.equal(track.sample(200).speed, 0);
});

test('teleports discard the old path and do not extrapolate the teleport velocity', () => {
  const track = createPeerInterpolator();
  track.push(peer(0, 0), 0);
  track.push(peer(1, 100), 100);
  track.push(peer(80, 150, { vx: 50 }), 150);
  close(track.sample(50).x, 80);
  close(track.sample(200).x, 80);
});

test('down, respawn and vehicle changes reset interpolation without sliding between poses', () => {
  const track = createPeerInterpolator();
  track.push(peer(0, 0), 0);
  track.push(peer(1, 100, { down: true }), 100);
  close(track.sample(50).x, 1);
  track.push(peer(3, 200, { down: false }), 200);
  close(track.sample(150).x, 3);
  track.push(peer(5, 300, { riding: true, vehicle: 'car' }), 300);
  close(track.sample(250).x, 5);
  close(track.sample(350).x, 5);
});

test('a new report after a long outage resets the old history', () => {
  const track = createPeerInterpolator();
  track.push(peer(0, 0), 0);
  track.push(peer(1, 100), 100);
  track.push(peer(4, 2500), 2500);
  close(track.sample(2400).x, 4);
  close(track.sample(2600).x, 4);
});

test('rendered position is frame-rate independent and does not consume a simulation dt', () => {
  const run = (step) => {
    const track = createPeerInterpolator();
    track.push(peer(0, 0), 0);
    track.push(peer(1, 100), 100);
    for (let time = 0; time < 75; time += step) track.sample(time);
    return track.sample(75);
  };
  assert.deepEqual(run(1000 / 30), run(1000 / 144));
  close(run(1000 / 144).x, 0.75);
});

test('reset removes old positions and allows a fresh clock or peer timeline', () => {
  const clock = createSnapshotClock();
  const track = createPeerInterpolator();
  clock.observe(EPOCH, 100);
  track.push(peer(1, EPOCH), EPOCH);
  clock.reset();
  track.reset();
  assert.equal(track.sample(EPOCH), null);
  assert.equal(clock.observe(EPOCH - 1000, 50), true);
  assert.equal(track.push(peer(3, EPOCH - 1000), EPOCH - 1000), true);
  close(track.sample(clock.renderTime(50)).x, 3);
});

test('invalid reports are rejected and unreasonable velocity cannot escape the cap', () => {
  const track = createPeerInterpolator();
  assert.equal(track.push(peer(NaN, 0), 0), false);
  assert.equal(track.sample(0), null);
  track.push(peer(0, 0, { vx: 10000, vz: 0 }), 0);
  close(track.sample(100).x, 5);
});
