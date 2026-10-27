// node --experimental-transform-types --test scripts/parking.test.mjs
// Parked-vehicle spots (app/game/parking.ts): the layout's scooters kept exactly, everything else on the sidewalk band
// or in an off-street car park, clear of the asphalt, the colliders, doors and each other; occupancy curves sane.
// The P1 districts' spots (every slice, as the live map wires them in turn): the generator's bikes nose toward their
// building, the busy places' rows and giữ-xe lots, xe ôm corners, cars only in the car and taxi bays.
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
  const { SPOTS: ALL, LEGACY_SPOT_COUNT, COLLIDERS, ROADS_X, ROADS_Z, BUILDINGS, spotRect } = await load();
  // Today's spots on today's grid (the wired districts' are checked against their own roads below).
  const SPOTS = ALL.slice(0, LEGACY_SPOT_COUNT);
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

/** Whether two oriented rectangles (centre, half sizes, yaw) overlap by more than `m` (separating axes). */
function obbOverlap(a, b, m = 0) {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2].map((t) => [Math.cos(t), -Math.sin(t)]);
  for (const [ax, az] of axes) {
    const proj = (r) => {
      const c = Math.cos(r.yaw), s2 = Math.sin(r.yaw);
      const rx = Math.abs(c * ax - s2 * az) * r.hx + Math.abs(s2 * ax + c * az) * r.hz;
      const mid = r.x * ax + r.z * az;
      return [mid - rx, mid + rx];
    };
    const [a0, a1] = proj(a), [b0, b1] = proj(b);
    if (a1 - m <= b0 || b1 - m <= a0) return false;
  }
  return true;
}
/** The whole of P1 (every slice, as the wiring steps add them), built once for the district tests. */
let p1 = null;
const loadP1 = async () => {
  if (p1) return p1;
  const life = await import('../app/game/district-life.ts');
  const parking = await import('../app/game/parking.ts');
  const view = life.viewOf(life.buildWorld());
  p1 = { life, parking, view, ...parking.districtSpots(view, 0, 0) };
  return p1;
};

test('the P1 districts: bikes on the sidewalks and along the hẻm, cars in the bays, nothing on another', { skip }, async () => {
  const { view, spots, lots } = await loadP1();
  const roads = view.world.roads;
  assert.ok(spots.length > 1500, `${spots.length} district spots`);
  assert.ok(spots.filter((s) => s.vehicle === 'car').length > 100, 'cars in the car bays');
  const box = (s) => ({ x: s.x, z: s.z, yaw: s.yaw, hx: s.vehicle === 'moto' ? 0.31 : 0.95, hz: s.vehicle === 'moto' ? 0.87 : 2.25 });
  for (const s of spots) {
    for (const h of roads.edgesNear(s.x, s.z, 14)) {
      // Distance to the centre line (past an end, to its end point).
      const e = h.edge, d = h.d;
      if (s.vehicle === 'car') continue;
      if (e.cls === 'hem') assert.ok(d >= 0.6, `bike ${s.id} in the middle of ${e.name} (${d.toFixed(2)} m) at ${s.x},${s.z}`);
      else assert.ok(d >= e.half + 0.25 || h.s < 0.5 || h.s > e.len - 0.5, `bike ${s.id} on the asphalt of ${e.name} (${d.toFixed(2)} m of ${e.half}) at ${s.x},${s.z}`);
    }
    if (s.vehicle === 'car') {
      const h = roads.nearestEdge(s.x, s.z, 14, (e) => e.bays.some((b) => b.kind === 'car' || b.kind === 'taxi'));
      assert.ok(h, `car ${s.id} by no bay`);
      const bay = h.edge.bays.find((b) => (b.kind === 'car' || b.kind === 'taxi') && h.s >= b.s0 - 0.01 && h.s <= b.s1 + 0.01 && Math.sign(h.off) === b.side);
      assert.ok(bay, `car ${s.id} outside the bays of ${h.edge.name}`);
      assert.ok(Math.abs(Math.abs(h.off) - (h.edge.half - bay.depth / 2)) < 0.05, `car ${s.id} not in its bay's middle`);
    }
  }
  // No two vehicles on each other (8 m cells).
  const cells = new Map();
  for (const s of spots) { const k = `${Math.floor(s.x / 8)},${Math.floor(s.z / 8)}`; (cells.get(k) ?? cells.set(k, []).get(k)).push(s); }
  for (const s of spots) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of cells.get(`${Math.floor(s.x / 8) + i},${Math.floor(s.z / 8) + j}`) ?? []) {
    if (o.id <= s.id) continue;
    assert.ok(!obbOverlap(box(s), box(o), 0.05), `spots ${s.id} and ${o.id} overlap at ${s.x},${s.z}`);
  }
  // Lots: six or more, an attendant's chair clear of every bike in it.
  assert.ok(lots.length >= 8, `${lots.length} giữ-xe lots`);
  for (const l of lots) {
    assert.ok(l.spots.length >= 6, `${l.name}: ${l.spots.length} bikes`);
    assert.ok(l.attendant, `${l.name} has no chair`);
    for (const id of l.spots) assert.equal(spots[id].lot, l.id);
    for (const s of spots) assert.ok(Math.hypot(s.x - l.attendant.x, s.z - l.attendant.z) > 0.7, `${l.name}: the chair stands on bike ${s.id}`);
  }
});

test('the P1 districts: bikes nose toward their building, xe ôm at the corners, busy places fill by the hour', { skip }, async () => {
  const { view, spots, parking } = await loadP1();
  let toward = 0, street = 0;
  for (const s of spots) {
    if (s.vehicle !== 'moto' || s.host < view.buildingBase || s.kind === 'perch') continue;
    const b = view.buildings[s.host - view.buildingBase];
    const dot = Math.sin(s.yaw) * (b.door.x - s.x) + Math.cos(s.yaw) * (b.door.z - s.z);
    street++;
    if (dot >= -0.05) toward++;
  }
  assert.ok(toward >= street * 0.98, `${toward}/${street} bikes nose toward their building`);
  const xeom = spots.filter((s) => s.occ === 'xeom');
  assert.ok(xeom.length >= 10, `${xeom.length} xe ôm corners`);
  assert.equal(xeom.length, view.perches.length);
  for (const q of view.perches) {
    const p = view.pois[q.poi - view.poiBase], s = xeom.find((t) => Math.hypot(t.x - p.x, t.z - p.z) < 0.4);
    assert.ok(s && p.kind === 'perch' && p.seat, 'a perch on the saddle of a xe ôm bike');
  }
  const taken = (occ, h) => spots.filter((s) => s.occ === occ && parking.wanted(s, h, 2)).length;
  assert.ok(taken('night', 21) > taken('night', 14) * 2, 'night streets fill after dark');
  assert.ok(taken('market', 7) > taken('market', 20), 'the chợ fills in the morning');
  assert.ok(taken('xeom', 10) === spots.filter((s) => s.occ === 'xeom').length && taken('xeom', 23) === 0, 'xe ôm in their hours');
});
