// node --experimental-transform-types --test scripts/terrain.test.mjs
// The terrain module (app/game/map/terrain.ts) against the code it replaced: world.ts groundHeight, onSidewalk and
// dockAt, and game.ts / boats.ts river checks (inRect on RIVER and LAND, the pier and berth tests, the climb-out
// and vault constants), embedded below as frozen copies. They must agree on 1e6 seeded samples over LAND ± 100 m
// and the river, including exact edge values. Decks: nothing below a deck ever snaps onto it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../app/game/map/consts.ts');
const T = await import('../app/game/map/terrain.ts');
const { WORLD_BOUNDS, PEER_BOUNDS, WORLD_VERSION } = await import('../lib/world-bounds.ts');
const { DOCKS, LAND, RIVER, RIVER_BED, ROADS_X, ROADS_Z, PLAY, WATER_LEVEL } = C;

// ---- Frozen legacy code (world.ts before the terrain module; SCENERY.docks is DOCKS). ----
const inRect = (r, x, z, margin = 0) => x >= r.minX + margin && x <= r.maxX - margin && z >= r.minZ + margin && z <= r.maxZ - margin;
const CURB_HEIGHT = 0.14, ASPHALT_HALF = 7, SIDEWALK_EDGE = 12.5, ROAD_FIRST = ROADS_Z[0];
const roadDistance = (roads, v) => { let best = Infinity; for (const r of roads) best = Math.min(best, Math.abs(v - r)); return best; };
const PIER_DECK = 0.28, STEPS_TOP = -136, STEPS_DROP = 1.8 / 4.5;
function onSidewalk(x, z) {
  const dz = roadDistance(ROADS_Z, z);
  const dx = z > ROAD_FIRST ? roadDistance(ROADS_X, x) : Infinity;
  if (dz < ASPHALT_HALF || dx < ASPHALT_HALF) return false;
  return dz < SIDEWALK_EDGE || dx < SIDEWALK_EDGE;
}
function dockAt(x, z) {
  if (z > -134.6 || z < -152) return null;
  for (const d of DOCKS) if (inRect(d.pier, x, z) || inRect(d.steps, x, z)) return d;
  return null;
}
function groundHeight(x, z) {
  if (z < -136.4) {
    for (const d of DOCKS) {
      if (inRect(d.pier, x, z)) return PIER_DECK;
      if (inRect(d.steps, x, z)) return 0.1 + Math.min(0, z - STEPS_TOP) * STEPS_DROP;
    }
    return z < RIVER.maxZ ? RIVER_BED : 0.1;
  }
  if (x > 13 && x < 43 && z > -44 && z < -22) return 0.24;
  if (x > 228.5 && x < 257.5 && ((z > 12.5 && z < 41.5) || (z > 66.5 && z < 95.5))) return z < 50 ? 0.26 : 0.25;
  if (x > 14.5 && x < 43.5 && z > 29.5 && z < 46.5) return 0.27;
  return onSidewalk(x, z) ? 0.1 + CURB_HEIGHT : 0.1;
}
// boats.ts water(), and the pier tests in game.ts swimClear (reach 0.35) and climbOut (reach 1.4).
function boatWater(x, z, margin) {
  if (!inRect(RIVER, x, z, margin)) return false;
  for (const d of DOCKS) if (x > d.pier.minX - margin && x < d.steps.maxX + margin && z > d.pier.minZ - margin) return false;
  return true;
}
function legacyPier(x, z, reach) {
  for (const d of DOCKS) if (x > d.pier.minX - reach && x < d.pier.maxX + reach && z > d.pier.minZ - reach) return d;
  return null;
}

// ---- Seeded samples: uniform over LAND ± 100 and the river, near the docks, and snapped to a 5 cm grid so edges are hit exactly. ----
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DOMAIN = { minX: LAND.minX - 100, maxX: LAND.maxX + 100, minZ: RIVER.minZ - 100, maxZ: LAND.maxZ + 100 };
function* samples(n, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const kind = i % 10;
    let x, z;
    if (kind < 5) { x = DOMAIN.minX + r() * (DOMAIN.maxX - DOMAIN.minX); z = DOMAIN.minZ + r() * (DOMAIN.maxZ - DOMAIN.minZ); }
    else if (kind < 8) { const d = DOCKS[Math.floor(r() * DOCKS.length)]; x = d.x - 8 + r() * 18; z = -156 + r() * 24; }
    else { x = Math.round((DOMAIN.minX + r() * (DOMAIN.maxX - DOMAIN.minX)) * 20) / 20; z = Math.round((DOMAIN.minZ + r() * (DOMAIN.maxZ - DOMAIN.minZ)) * 20) / 20; }
    if (kind === 9 && i % 20 === 9) z = Math.round((-160 + r() * 30) * 20) / 20; // the wall, steps and pier ends on the grid
    yield [x, z];
  }
}
// Exact edge values: road strips, surfaces, walls, docks, NaN.
function* edges() {
  const xs = [NaN, 0, -0, 13, 14.5, 43, 43.5, 228.5, 257.5, -138, 352, LAND.minX - 0.35, ...ROADS_X.flatMap((r) => [r - 12.5, r - 7, r, r + 7, r + 12.5]),
    ...DOCKS.flatMap((d) => [d.pier.minX, d.pier.maxX, d.steps.minX, d.steps.maxX, d.pier.minX - 0.35, d.pier.maxX + 0.35, d.pier.minX - 1.4, d.pier.maxX + 1.4, d.steps.maxX + 0.35])];
  const zs = [NaN, 0, -0, -44, -22, 12.5, 41.5, 29.5, 46.5, 50, 66.5, 95.5, -134.6, -135, -136, -136.4, -136.6, -137.6, -138.6, -139.2, -140.5, -152, -152.35, -153.4, -201.1, -203.6, 137.5,
    ...ROADS_Z.flatMap((r) => [r - 12.5, r - 7, r, r + 7, r + 12.5])];
  for (const x of xs) for (const z of zs) yield [x, z];
}

const ix = (d) => (d ? DOCKS.indexOf(d) : -1);
const tid = (d) => (d ? d.id : -1);

test('groundHeight, onSidewalk and dockAt equal the legacy functions on 1e6 samples and every edge value', () => {
  let n = 0, wet = 0, dock = 0, side = 0;
  const check = (x, z) => {
    const g = groundHeight(x, z), t = T.groundHeight(x, z);
    if (!Object.is(g, t)) assert.fail(`groundHeight(${x}, ${z}): legacy ${g}, terrain ${t}`);
    if (onSidewalk(x, z) !== T.onSidewalk(x, z)) assert.fail(`onSidewalk(${x}, ${z})`);
    const a = ix(dockAt(x, z)), b = tid(T.dockAt(x, z));
    if (a !== b) assert.fail(`dockAt(${x}, ${z}): legacy ${a}, terrain ${b}`);
    n++; if (g === RIVER_BED) wet++; if (a >= 0) dock++; if (g === 0.1 + CURB_HEIGHT) side++;
  };
  for (const [x, z] of samples(1e6, 20251025)) check(x, z);
  for (const [x, z] of edges()) check(x, z);
  console.log(`  ${n} points: ${wet} river bed, ${dock} on docks, ${side} on sidewalks`);
  assert.ok(wet > 1e5 && dock > 1e4 && side > 5e4);
});

test('river and land queries equal the inline checks they replace in game.ts and boats.ts', () => {
  for (const [x, z] of [...samples(4e5, 7), ...edges()]) {
    for (const m of [0, 0.35, 0.9, 1.15]) {
      if (inRect(RIVER, x, z, m) !== T.inWater(x, z, m)) assert.fail(`inWater(${x}, ${z}, ${m})`);
      if (boatWater(x, z, m) !== T.navigable(x, z, m)) assert.fail(`navigable(${x}, ${z}, ${m})`);
    }
    for (const r of [0, 0.4, 0.5]) if (inRect(LAND, x, z, r) !== T.walkable(x, z, r)) assert.fail(`walkable(${x}, ${z}, ${r})`);
    for (const reach of [0.35, 1.4]) if (ix(legacyPier(x, z, reach)) !== tid(T.pierNear(x, z, reach))) assert.fail(`pierNear(${x}, ${z}, ${reach})`);
    if ((groundHeight(x, z) < WATER_LEVEL - 0.55) !== T.deep(x, z)) assert.fail(`deep(${x}, ${z})`);
    if (inRect(PLAY, x, z, 0.5) !== T.inBounds(x, z, 0.5)) assert.fail(`inBounds(${x}, ${z})`);
    const level = T.waterLevel(x, z);
    if (level !== WATER_LEVEL && level !== -Infinity) assert.fail(`waterLevel(${x}, ${z}) = ${level}`);
    if (level === -Infinity && groundHeight(x, z) < 0.1) assert.fail(`dry ground below the street at (${x}, ${z})`);
  }
});

test('docks: legacy rectangles, landings and the bank they stand on', () => {
  assert.equal(T.TERRAIN.docks.length, DOCKS.length);
  T.TERRAIN.docks.forEach((d, i) => {
    const s = DOCKS[i];
    assert.equal(d.id, i);
    assert.deepEqual([d.x, d.name, d.rental, d.pier, d.steps, d.ring], [s.x, s.name, s.rental, s.pier, s.steps, s.ring]);
    assert.equal(T.TERRAIN.banks[d.bank].kind, 'promenade');
    assert.equal(d.at, s.x);
    // game.ts climbOut and leaveBoat clamped to these, built from the same expressions.
    for (const [r, k] of [[s.pier, 0], [s.steps, 1]]) {
      assert.deepEqual(d.landings[k], { minX: r.minX + 0.5, maxX: r.maxX - 0.5, minZ: r.minZ + 0.5, maxZ: Math.min(r.maxZ - 0.5, -136.6) });
    }
  });
});

test('banks: the promenade, far wall and steps give the legacy climb, vault and fence constants', () => {
  const kinds = T.TERRAIN.banks.map((b) => b.kind);
  assert.deepEqual(kinds, ['promenade', 'far', ...DOCKS.map(() => 'steps')]);
  const r = rng(99);
  for (let i = 0; i < 2e5; i++) {
    const x = RIVER.minX + 0.35 + r() * (RIVER.maxX - RIVER.minX - 0.7);
    const z = -125 - r() * 80;
    const quay = T.bankNear(x, z, Infinity, true);
    assert.equal(quay.bank.kind, 'promenade');
    const b = quay.bank;
    assert.equal(quay.x, x);
    // Climb-out lands on LAND.minZ + 0.5; the vault lands at -138.6; both bit-exact.
    assert.ok(Object.is(quay.z - b.nz * b.land, LAND.minZ + 0.5) && Object.is(quay.x - b.nx * b.land, x));
    assert.ok(Object.is(quay.z + b.nz * b.drop, -138.6) && Object.is(quay.x + b.nx * b.drop, x));
    assert.ok(Object.is(x + b.nx * 1.4, x) && Object.is(z + b.nz * 1.4, z - 1.4));
    // Facing the water (cos(angle) < -0.4 in game.ts) is forward·n > 0.4, exactly.
    const a = r() * 7 - 3.5;
    assert.equal(Math.sin(a) * b.nx + Math.cos(a) * b.nz > 0.4, Math.cos(a) < -0.4);
    // Away from a 1e-9 m band round each threshold the thresholds agree: vault reach, climb reach, the far wall.
    const near = (v, c) => Math.abs(v - c) < 1e-9;
    if (!near(z, -133.2)) assert.equal(quay.d > -b.vault, z < -133.2);
    if (!near(z, RIVER.maxZ - 1.6)) assert.equal(quay.d < b.reach, z > RIVER.maxZ - 1.6);
    if (z < RIVER.maxZ && z > RIVER.minZ && !near(z, RIVER.minZ + 2.5)) assert.equal(T.bankNear(x, z, 2.5)?.bank.kind === 'far', z < RIVER.minZ + 2.5);
  }
  // Steps banks face the river at the steps' outer end; the far wall is not climbable.
  const d = DOCKS[1];
  assert.equal(T.bankNear(d.steps.minX + 1, d.steps.minZ - 0.3, 1)?.bank.kind, 'steps');
  assert.equal(T.bankNear(60, -202, Infinity, true).bank.kind, 'promenade');
  assert.equal(T.bankNear(60, -170, 2.5), null);
  // Off the end of a waterline the distance runs to its end point.
  const off = T.bankNear(RIVER.maxX + 3, RIVER.maxZ - 4, Infinity, true);
  assert.ok(Math.abs(off.d - 5) < 1e-12 && off.x === RIVER.maxX && off.z === RIVER.maxZ);
  T.TERRAIN.banks.forEach((b) => assert.equal(b.dock, b.kind === 'steps' ? T.TERRAIN.banks.filter((q) => q.kind === 'steps').indexOf(b) : -1));
  // A diagonal waterline (a canal bend): perpendicular distance abreast of it, distance to the end point past it.
  const spec = T.legacyTerrain(), s = Math.SQRT1_2;
  const diag = { ...spec.waters[0].banks[0], id: 0, ax: 0, az: 0, bx: 10, bz: 10, nx: s, nz: -s };
  const t = T.createTerrain({ ...spec, waters: [{ ...spec.waters[0], banks: [diag] }] });
  const a = t.bankNear(8, 2);
  assert.ok(Math.abs(a.d - Math.sqrt(18)) < 1e-12 && Math.abs(a.x - 5) < 1e-12 && Math.abs(a.z - 5) < 1e-12);
  const b = t.bankNear(12, 15);
  assert.ok(Math.abs(b.d + Math.hypot(2, 5)) < 1e-12 && b.x === 10 && b.z === 10);
  assert.equal(t.bankNear(12, 15, 5), null);
});

test('bounds are today\'s PLAY rectangle; the server accepts them with 2 m of slack', () => {
  assert.deepEqual({ ...T.bounds }, { ...PLAY });
  assert.deepEqual(WORLD_BOUNDS, { minX: PLAY.minX, maxX: PLAY.maxX, minZ: PLAY.minZ, maxZ: PLAY.maxZ });
  assert.ok(PEER_BOUNDS.minX <= WORLD_BOUNDS.minX - 2 && PEER_BOUNDS.maxX >= WORLD_BOUNDS.maxX + 2);
  assert.ok(PEER_BOUNDS.minZ <= WORLD_BOUNDS.minZ - 2 && PEER_BOUNDS.maxZ >= WORLD_BOUNDS.maxZ + 2);
  assert.ok(Number.isInteger(WORLD_VERSION) && WORLD_VERSION >= 1);
});

test('decks carry only bodies at or above them: swimmers, boats and ragdolls below get the ground', () => {
  const spec = T.legacyTerrain();
  // A river bridge at 6.5 m, ramped down to street level on the promenade (x 100..112), and a flyover at 9 m
  // crossing it (x 90..130, z -150..-146), so two decks stack over the river.
  const bridge = (x, z) => Math.min(6.5, Math.max(0.24, 0.24 + (-z - 118) * 0.067 * (z > -136.4 ? 1 : 100)));
  const ramp = T.rectShape({ minX: 100, maxX: 112, minZ: -215, maxZ: -95 });
  const fly = T.polyShape([90, -150, 130, -150, 130, -146, 90, -146]);
  const terrain = T.createTerrain({ ...spec, decks: [{ id: 0, shape: ramp, y: bridge }, { id: 1, shape: fly, y: () => 9 }] });
  const r = rng(5);
  let carried = 0, under = 0;
  for (let i = 0; i < 3e5; i++) {
    const x = 85 + r() * 50, z = -220 + r() * 130, yHint = -3 + r() * 14;
    const ground = T.groundHeight(x, z);
    const tops = [];
    if (T.inShape(ramp, x, z)) tops.push(bridge(x, z));
    if (T.inShape(fly, x, z)) tops.push(9);
    const got = terrain.groundHeight(x, z, yHint);
    const ok = tops.filter((y) => yHint >= y - T.DECK_STEP);
    const want = Math.max(ground, ...ok);
    assert.equal(got, want, `(${x}, ${z}, ${yHint})`);
    // The property: nothing more than DECK_STEP below every deck there is ever lifted.
    if (tops.length && tops.every((y) => yHint < y - T.DECK_STEP)) { assert.equal(got, ground); under++; }
    if (ok.length) carried++;
    // Without a hint the top deck counts; water, docks and banks ignore decks.
    assert.equal(terrain.groundHeight(x, z), Math.max(ground, ...tops));
    assert.equal(terrain.waterLevel(x, z), T.waterLevel(x, z));
    assert.equal(terrain.inWater(x, z, 0.35), T.inWater(x, z, 0.35));
  }
  assert.ok(carried > 1e4 && under > 1e4);
  // Under the bridge: a swimmer (water level - 1.25) swims, a boat (water level) floats, a ragdoll at the bed lies on it.
  assert.equal(terrain.groundHeight(105, -170, WATER_LEVEL - 1.25), RIVER_BED);
  assert.ok(terrain.deep(105, -170, WATER_LEVEL - 1.25));
  assert.equal(terrain.groundHeight(105, -170, WATER_LEVEL), RIVER_BED);
  assert.equal(terrain.groundHeight(105, -170, RIVER_BED + 0.2), RIVER_BED);
  // On it: standing, slightly below (stepping up), well below (passing under), and the flyover above.
  assert.equal(terrain.groundHeight(105, -170, 6.5), 6.5);
  assert.equal(terrain.groundHeight(105, -170, 6.0), 6.5);
  assert.equal(terrain.groundHeight(105, -170, 5.5), RIVER_BED);
  assert.ok(!terrain.deep(105, -170, 6.5));
  assert.equal(terrain.groundHeight(105, -148, 6.5), 6.5);
  assert.equal(terrain.groundHeight(105, -148, 9), 9);
  assert.equal(terrain.groundHeight(105, -148), 9);
  // Decks added and removed at run time.
  const t2 = T.createTerrain(T.legacyTerrain());
  const id = t2.addDeck(T.rectShape({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }), () => 5);
  assert.equal(t2.groundHeight(5, 5, 5), 5);
  assert.equal(t2.groundHeight(5, 5, 0.1), T.groundHeight(5, 5));
  assert.ok(t2.removeDeck(id) && !t2.removeDeck(id));
  assert.equal(t2.groundHeight(5, 5, 5), T.groundHeight(5, 5));
});

test('polygons, margins and docks facing other ways', () => {
  // A rectangle as a polygon behaves like the rectangle away from its edges, margin included.
  const rect = { minX: -10, maxX: 30, minZ: 5, maxZ: 25 };
  const poly = T.polyShape([-10, 5, 30, 5, 30, 25, -10, 25]);
  const r = rng(11);
  for (let i = 0; i < 1e5; i++) {
    const x = -20 + r() * 60, z = -5 + r() * 40, m = r() < 0.5 ? 0 : r() * 3;
    const dEdge = Math.min(Math.abs(x - rect.minX - m), Math.abs(x - rect.maxX + m), Math.abs(z - rect.minZ - m), Math.abs(z - rect.maxZ + m));
    if (dEdge > 1e-9) assert.equal(T.inShape(poly, x, z, m), inRect(rect, x, z, m), `(${x}, ${z}, ${m})`);
  }
  // An L-shaped canal: inside each arm, outside the notch.
  const L = T.polyShape([0, 0, 40, 0, 40, 10, 10, 10, 10, 40, 0, 40]);
  assert.ok(T.inShape(L, 30, 5) && T.inShape(L, 5, 30) && !T.inShape(L, 20, 20) && !T.inShape(L, 30, 5, 6) && T.inShape(L, 30, 5, 4.9));
  // Today's dock 0 mirrored onto the far wall (waterline z -203.6, water towards +z): the steps fall towards +z
  // and the pier reaches back to the bank (-z), as on the promenade.
  const spec = T.legacyTerrain();
  const north = {
    ...spec.waters[0].docks[0], id: 0, nx: 0, nz: 1, stepsZ: -205.2, stepsY: 0.1,
    pier: { minX: -82, maxX: -78, minZ: -206.6, maxZ: -189.2 }, steps: { minX: -77.4, maxX: -75, minZ: -206.6, maxZ: -200.7 },
    berth: { minX: -82, maxX: -75, minZ: -206.6, maxZ: -189.2 },
  };
  const water = { ...spec.waters[0], open: T.rectShape(RIVER), wet: T.rectShape({ minX: -Infinity, maxX: Infinity, minZ: -203.6, maxZ: -137.6 }, true),
    shore: T.rectShape({ minX: -Infinity, maxX: Infinity, minZ: -204.8, maxZ: -136.4 }, true), docks: [north], banks: [] };
  const t = T.createTerrain({ ...spec, waters: [water] });
  assert.equal(t.groundHeight(-76, -205), 0.1); // behind the wall top: land
  assert.ok(Math.abs(t.groundHeight(-76, -204.5) - (0.1 - 0.7 * STEPS_DROP)) < 1e-12);
  assert.ok(Math.abs(t.groundHeight(-76, -202) - (0.1 - 3.2 * STEPS_DROP)) < 1e-12);
  assert.equal(t.groundHeight(-76, -195), RIVER_BED);
  assert.equal(t.groundHeight(-80, -195), PIER_DECK);
  assert.equal(t.pierNear(-80, -187.9, 1.4), north); // just within 1.4 m of the far end
  assert.equal(t.pierNear(-80, -187.7, 1.4), null);
  assert.equal(t.pierNear(-80, -230, 1.4), north); // the landward side is open
  assert.equal(t.pierNear(-83.5, -195, 1.4), null);
  assert.ok(!t.navigable(-76, -188.1, 1.15) && t.navigable(-76, -188, 1.15));
});

test('timing: terrain groundHeight against the legacy function', () => {
  const pts = [...samples(2e5, 3)];
  const time = (f) => { let s = 0; const t0 = performance.now(); for (let k = 0; k < 5; k++) for (const [x, z] of pts) s += f(x, z); return [(performance.now() - t0) / (5 * pts.length) * 1e3, s]; };
  time(groundHeight); time(T.groundHeight);
  const [a, sa] = time(groundHeight), [b, sb] = time(T.groundHeight);
  assert.equal(sa, sb);
  console.log(`  groundHeight: legacy ${a.toFixed(3)} µs, terrain ${b.toFixed(3)} µs per call`);
});
