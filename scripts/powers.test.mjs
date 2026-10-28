import test from 'node:test';
import assert from 'node:assert/strict';
import { createPowerState, initialPowerHud, HEROES, POWER_COST, MAX_ALTITUDE, POWER_HEIGHT_BOUNDS, SHIELD_DURATION, clipPowerTarget, distanceToPowerSegment, resolvePowerTarget, shieldPosition } from '../app/game/powers.ts';

function tick(state, seconds, clear = true) { for (let i = 0; i < seconds * 100; i++) state.step(0.01, clear); }

test('civilian is opt-in default; no cast or flight before choosing a hero', () => {
  const state = createPowerState();
  assert.deepEqual(state.hud(), initialPowerHud());
  assert.equal(state.cast(), null);
  assert.equal(state.toggleFlight(), false);
  assert.equal(state.select('bogus'), false);
});

test('each hero casts its own power and uses shared energy', () => {
  for (const hero of HEROES.filter((h) => h.id !== 'none')) {
    const state = createPowerState(); state.select(hero.id);
    assert.equal(state.cast(), hero.id);
    assert.equal(state.hud().energy, 100 - POWER_COST[hero.id]);
    assert.equal(state.hud().cooldownTotal, hero.cooldown);
    assert.equal(state.cast(), null);
  }
});

test('switching away and back does not reset cooldown or refill energy', () => {
  const state = createPowerState(); state.select('thor'); state.cast();
  state.select('none'); state.select('thor');
  assert.equal(state.cast(), null);
  assert.equal(state.hud().energy, 74);
  tick(state, 5.6);
  assert.equal(state.cast(), 'thor');
});

test('blocked controls do not spend energy, change flight, or begin cooldown', () => {
  const state = createPowerState(); state.select('ironman');
  assert.equal(state.cast(true), null); assert.equal(state.toggleFlight(true), false);
  assert.equal(state.hud(true).blocked, true);
  assert.equal(state.hud().energy, 100); assert.equal(state.hud().cooldown, 0);
});

test('rapidly cycling all heroes cannot bypass shared energy requirement', () => {
  const state = createPowerState();
  for (const hero of ['ironman', 'thor', 'hulk', 'captain']) { state.select(hero); assert.equal(state.cast(), hero); }
  assert.equal(state.hud().energy, 10);
  state.select('ironman'); assert.equal(state.toggleFlight(), false);
});

test('only Iron Man flies, at bounded height; flight drains then automatically lands', () => {
  const state = createPowerState(); state.select('thor'); assert.equal(state.toggleFlight(), false);
  state.select('ironman'); assert.equal(state.toggleFlight(), true);
  tick(state, 3);
  assert.ok(state.altitude > 3 && state.altitude <= MAX_ALTITUDE);
  assert.ok(state.hud().energy < 100);
  tick(state, 11);
  assert.equal(state.flying, false); assert.equal(state.altitude, 0);
  tick(state, 10); assert.equal(state.hud().energy, 100);
});

test('hero cannot be changed while airborne, and landing is independent of cast cooldown', () => {
  const state = createPowerState(); state.select('ironman'); state.toggleFlight(); tick(state, 1);
  assert.equal(state.select('hulk'), false); assert.equal(state.hero, 'ironman');
  state.cast(); assert.equal(state.toggleFlight(), true); tick(state, 1.2);
  assert.equal(state.altitude, 0); assert.ok(state.hud().cooldown > 0);
  assert.equal(state.select('hulk'), true);
});

test('obstructed landing holds above ground until the landing point is safe', () => {
  const state = createPowerState(); state.select('ironman'); state.toggleFlight(); tick(state, 1); state.stopFlight();
  tick(state, 2, false); assert.ok(state.altitude >= 1);
  tick(state, 1, true); assert.equal(state.altitude, 0);
  state.step(0.1, false); assert.equal(state.altitude, 0, 'a grounded civilian must never be lifted by an obstruction');
});

test('invalid or huge frame times stay bounded; reset and forced land clean flight state', () => {
  const state = createPowerState(); state.select('ironman'); state.toggleFlight();
  state.step(NaN); assert.equal(state.altitude, 0);
  state.step(Infinity); assert.equal(state.altitude, 0);
  state.step(5000); assert.ok(state.altitude <= 0.5);
  state.land(); assert.equal(state.altitude, 0); assert.equal(state.flying, false);
  state.reset(); assert.deepEqual(state.hud(), initialPowerHud());
});

test('finite beam targeting excludes targets behind, past the endpoint, or far above it', () => {
  const from = { x: 0, y: 1, z: 0 }, to = { x: 0, y: 1, z: 10 };
  assert.equal(distanceToPowerSegment({ x: 0.5, y: 1, z: 5 }, from, to), 0.5);
  assert.equal(distanceToPowerSegment({ x: 0, y: 1, z: -3 }, from, to), 3);
  assert.equal(distanceToPowerSegment({ x: 0, y: 1, z: 12 }, from, to), 2);
  assert.equal(distanceToPowerSegment({ x: 0, y: 6, z: 5 }, from, to), 5);
  assert.equal(distanceToPowerSegment(from, from, from), 0);
});

test('shield travels to endpoint then returns to the owner even if they move', () => {
  const from = { x: 0, y: 1, z: 0 }, to = { x: 0, y: 1, z: 18 }, home = { x: 4, y: 1, z: 0 };
  assert.deepEqual(shieldPosition(from, to, 0), from);
  const tip = shieldPosition(from, to, SHIELD_DURATION * 0.45);
  assert.equal(tip.z, 18);
  const returning = shieldPosition(from, to, SHIELD_DURATION * 0.75, home);
  assert.ok(returning.z > 0 && returning.z < 18); assert.ok(returning.x > 0 && returning.x < 4);
  const end = shieldPosition(from, to, SHIELD_DURATION, home);
  assert.ok(Math.hypot(end.x - home.x, end.y - home.y, end.z - home.z) < 1e-10);
});

test('cast preserves airborne target height and the beam intersects that body', () => {
  const from = { x: 0, y: 1.1, z: 0 }, target = { x: 0, y: 6.6, z: 12 };
  const hit = resolvePowerTarget(from, target, 24);
  assert.ok(Math.abs(hit.y - target.y) < 1e-10);
  assert.ok(distanceToPowerSegment(target, from, hit) < 1e-10);
});

test('sloped casts trace a normalized 3D direction and stop at walls using 3D distance', () => {
  const from = { x: 0, y: 7, z: 0 }, target = { x: 0, y: 1, z: 8 };
  const hit = resolvePowerTarget(from, target, 24, (direction, distance) => {
    assert.equal(distance, 10);
    assert.equal(direction.y, -0.6); assert.equal(direction.z, 0.8);
    // A building wall at z=4 is five metres along this ray, not four.
    return 4 / direction.z;
  });
  assert.deepEqual(hit, { x: 0, y: 4, z: 4 });
  const limited = resolvePowerTarget(from, target, 5);
  assert.deepEqual(limited, hit);
});

test('a returning shield reaches an owner who has gained altitude', () => {
  const home = { x: 2, y: 6.6, z: 0 };
  const end = shieldPosition({ x: 0, y: 1.1, z: 0 }, { x: 0, y: 7, z: 16 }, SHIELD_DURATION, home);
  assert.ok(Math.hypot(end.x - home.x, end.y - home.y, end.z - home.z) < 1e-10);
});

test('first-person upward and downward casts keep the traced direction throughout their full range', () => {
  const from = { x: 0, y: 6.6, z: 0 };
  const min = { x: -100, y: POWER_HEIGHT_BOUNDS.min, z: -100 }, max = { x: 100, y: POWER_HEIGHT_BOUNDS.max, z: 100 };
  for (const y of [30, -20]) {
    const traced = resolvePowerTarget(from, { x: 0, y, z: 6 }, 24);
    const clipped = clipPowerTarget(from, traced, min, max);
    assert.deepEqual(clipped, traced, 'valid endpoints above 12 or below 0 must not be bent back to ground height');
  }
});

test('world-edge clipping shortens the same traced beam, including its height', () => {
  const from = { x: 0, y: 6, z: 0 }, to = { x: 12, y: 24, z: 24 };
  const clipped = clipPowerTarget(from, to, { x: -10, y: -32, z: -10 }, { x: 10, y: 48, z: 10 });
  assert.deepEqual(clipped, { x: 5, y: 13.5, z: 10 });
  assert.ok(distanceToPowerSegment(clipped, from, to) < 1e-10);
  const ceiling = clipPowerTarget({ x: 0, y: 40, z: 0 }, { x: 16, y: 56, z: 16 }, { x: -100, y: -32, z: -100 }, { x: 100, y: 48, z: 100 });
  assert.deepEqual(ceiling, { x: 8, y: 48, z: 8 });
});
