// node --experimental-transform-types --test scripts/parking.test.mjs
// Parked-vehicle spots (app/game/parking.ts): the layout's scooters kept exactly, everything else on the sidewalk band
// or in an off-street car park, clear of the asphalt, the colliders, doors and each other; occupancy curves sane.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';

// parking.ts and city.ts use extensionless imports (Vite style); teach node to try `.ts`.
const tsFallback = (specifier) => /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier);
if (module.registerHooks) {
  module.registerHooks({
    resolve(specifier, context, next) {
      try { return next(specifier, context); } catch (e) {
        if (e?.code === 'ERR_MODULE_NOT_FOUND' && tsFallback(specifier)) return next(`${specifier}.ts`, context);
        throw e;
      }
    },
  });
}
const skip = module.registerHooks ? false : 'needs node:module registerHooks (Node 22.15+)';
const load = async () => ({ ...(await import('../app/game/parking.ts')), ...(await import('../app/game/city.ts')) });

test('the layout\'s scooters are spots at their exact positions', { skip }, async () => {
  const { SPOTS, SCENERY } = await load();
  const props = SCENERY.props.filter((p) => p.kind === 'scooter');
  const legacy = SPOTS.filter((s) => s.legacy);
  assert.equal(legacy.length, props.length);
  props.forEach((p, i) => { assert.equal(legacy[i].x, p.x); assert.equal(legacy[i].z, p.z); assert.equal(legacy[i].vehicle, 'moto'); });
});

test('spots stand off the asphalt, clear of colliders and of each other', { skip }, async () => {
  const { SPOTS, COLLIDERS, ROADS_X, ROADS_Z, BUILDINGS, spotRect } = await load();
  const asphalt = (x, z) => ROADS_Z.some((r) => Math.abs(z - r) < 7) || (z > ROADS_Z[0] - 7 && ROADS_X.some((r) => Math.abs(x - r) < 7));
  const overlap = (a, b, m = 0) => a.minX < b.maxX - m && a.maxX > b.minX + m && a.minZ < b.maxZ - m && a.maxZ > b.minZ + m;
  for (const s of SPOTS) {
    const r = spotRect(s);
    assert.ok(!asphalt(s.x, s.z), `spot ${s.id} (${s.kind}) on the asphalt at ${s.x},${s.z}`);
    if (!s.legacy) {
      // Generated spots keep clear of every collider (the layout's scooter rects included).
      for (const c of COLLIDERS) assert.ok(!overlap(r, c, 0.05), `spot ${s.id} (${s.kind}) overlaps a collider at ${s.x},${s.z}`);
      // Not in front of a door.
      for (const b of BUILDINGS) assert.ok(Math.hypot(b.door.x - s.x, b.door.z - s.z) > 1.5, `spot ${s.id} blocks the door of ${b.name}`);
    }
  }
  for (let i = 0; i < SPOTS.length; i++) for (let j = i + 1; j < SPOTS.length; j++) {
    assert.ok(!overlap(spotRect(SPOTS[i]), spotRect(SPOTS[j]), 0.12), `spots ${i} and ${j} overlap`);
  }
});

test('lots, cars and occupancy', { skip }, async () => {
  const { SPOTS, LOTS, occupancy, wanted } = await load();
  assert.ok(SPOTS.length > 250, `${SPOTS.length} spots`);
  assert.ok(SPOTS.some((s) => s.vehicle === 'car'), 'some cars in the downtown car parks');
  for (const l of LOTS) {
    assert.ok(l.spots.length >= 6 || l.kind === 'carpark', `lot ${l.name} too small`);
    assert.ok(l.attendant, `lot ${l.name} has no attendant`);
    for (const id of l.spots) assert.equal(SPOTS[id].lot, l.id);
  }
  for (const occ of ['home', 'shop', 'food', 'cafe', 'hospital', 'office', 'bank', 'hotel', 'theatre', 'mall', 'night', 'school', 'pagoda', 'market', 'police', 'impound', 'carpark', 'always']) {
    for (let h = 0; h < 24; h += 0.25) { const o = occupancy(occ, h, 3); assert.ok(o >= 0 && o <= 1, `${occ} at ${h}: ${o}`); }
  }
  assert.equal(occupancy('night', 21), 0.9);
  assert.equal(occupancy('night', 12), 0);
  assert.equal(occupancy('home', 23), 0);
  const taken = (h) => SPOTS.filter((s) => wanted(s, h, 2)).length;
  assert.ok(taken(12) > taken(3) * 2, 'busier at noon than at 3 am');
  assert.ok(SPOTS.filter((s) => s.occ === 'night' && wanted(s, 21, 2)).length > SPOTS.filter((s) => s.occ === 'night' && wanted(s, 14, 2)).length, 'the nightlife rows fill after dark');
  // Deterministic: the same spot, hour and day always agree.
  for (const s of SPOTS.slice(0, 50)) assert.equal(wanted(s, 9.5, 4), wanted(s, 9.7, 4));
});

test('no spot stands on an ATM or a drink machine (counters.ts kiosks are runtime colliders, not in COLLIDERS)', { skip }, async () => {
  const { SPOTS, KIOSK_RECTS, spotRect } = await load();
  assert.equal(KIOSK_RECTS.length, 10);
  for (const k of KIOSK_RECTS) for (const s of SPOTS) {
    if (s.legacy) continue;
    const r = spotRect(s), gap = Math.max(r.minX - k.maxX, k.minX - r.maxX, r.minZ - k.maxZ, k.minZ - r.maxZ);
    assert.ok(gap >= 0.1, `spot ${s.id} (${s.kind}) at ${s.x},${s.z} is ${gap.toFixed(2)} m from the kiosk at ${(k.minX + k.maxX) / 2},${(k.minZ + k.maxZ) / 2}`);
  }
});
