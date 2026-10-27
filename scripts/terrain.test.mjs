// node --experimental-transform-types --test scripts/terrain.test.mjs
// The terrain module (app/game/map/terrain.ts) against the code it replaced: world.ts groundHeight, onSidewalk and
// dockAt, and game.ts / boats.ts river checks (inRect on RIVER and LAND, the pier and berth tests, the climb-out
// and vault constants), embedded below as frozen copies. They must agree on 1e6 seeded samples over LAND ± 100 m
// and the river, including exact edge values. Decks: nothing below a deck ever snaps onto it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';

// The map modules import './x' without an extension (Vite style): a resolve hook retries those as .ts.
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
} else {
  module.register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) {
    try { return await n(s, c); } catch (e) {
      if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) return n(s + '.ts', c);
      throw e;
    }
  }`)}`);
}

const C = await import('../app/game/map/consts.ts');
const T = await import('../app/game/map/terrain.ts');
const { WORLD_BOUNDS, PEER_BOUNDS, WORLD_VERSION, worldBoundsFor } = await import('../lib/world-bounds.ts');
const { DOCKS, LAND, RIVER, RIVER_BED, ROADS_X, ROADS_Z, PLAY, WATER_LEVEL } = C;
const { buildP1, P1_LAYOUTS } = await import('../app/game/map/p1.ts');
const { liveInput } = await import('../app/game/map/stack.ts');
const { createRoadGraph } = await import('../app/game/map/roads.ts');
const { LEGACY_ROADS } = await import('../app/game/map/roads-legacy.ts');
const EXTRA = {
  'quan-4': (await import('../app/game/map/layout/quan-4.ts')).QUAN_4_EXTRA,
  'binh-thanh': (await import('../app/game/map/layout/binh-thanh.ts')).BINH_THANH_EXTRA,
  'quan-3': (await import('../app/game/map/layout/quan-3.ts')).QUAN_3_EXTRA,
  'quan-1-south': (await import('../app/game/map/layout/quan-1-south.ts')).QUAN_1_SOUTH_EXTRA,
  'thu-thiem': (await import('../app/game/map/layout/thu-thiem.ts')).THU_THIEM_EXTRA,
};
/**
 * The world terrain with the first n P1 slices wired, built as world-map.ts builds it: the slices (bounds, waters,
 * decks, EXTRA) and every road edge of the live graph that is not today's.
 */
const worlds = new Map();
function worldInput(n) {
  const p1 = buildP1(LEGACY_ROADS, { idBase: 164, layouts: P1_LAYOUTS.slice(0, n) });
  const live = liveInput(p1.stack, LEGACY_ROADS), g = createRoadGraph(live.input);
  return {
    slices: p1.slices.map((s) => ({ key: s.key, bounds: s.layout.bounds, waters: s.data.waters, decks: s.data.decks, extra: EXTRA[s.key] })),
    roads: g.edges.filter((_, i) => live.edgeOf[i].slice !== 'legacy'), graph: g, p1,
  };
}
function world(n) {
  if (!worlds.has(n)) { const input = worldInput(n); const t = T.createTerrain(T.worldTerrain(input)); t.input = input; worlds.set(n, t); }
  return worlds.get(n);
}

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

test('bounds: today\'s terrain is the PLAY rectangle; the wired map\'s follow lib/world-bounds.ts; the server accepts them with 2 m of slack', () => {
  assert.deepEqual({ ...T.bounds }, { ...PLAY });
  assert.deepEqual({ ...T.LEGACY_TERRAIN.bounds }, { ...PLAY });
  assert.deepEqual(worldBoundsFor(0), { minX: PLAY.minX, maxX: PLAY.maxX, minZ: PLAY.minZ, maxZ: PLAY.maxZ });
  assert.ok(PEER_BOUNDS.minX <= WORLD_BOUNDS.minX - 2 && PEER_BOUNDS.maxX >= WORLD_BOUNDS.maxX + 2);
  assert.ok(PEER_BOUNDS.minZ <= WORLD_BOUNDS.minZ - 2 && PEER_BOUNDS.maxZ >= WORLD_BOUNDS.maxZ + 2);
  assert.ok(Number.isInteger(WORLD_VERSION) && WORLD_VERSION >= 1);
  // No slice wired: the world terrain is today's.
  assert.deepEqual(T.worldTerrain({ slices: [], roads: [] }).bounds, worldBoundsFor(0));
  for (let n = 1; n <= P1_LAYOUTS.length; n++) assert.deepEqual({ ...world(n).bounds }, worldBoundsFor(n), `bounds with ${n} wired`);
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

// ---- The wired map (worldTerrain): today's area unchanged, the slices' water, banks, docks, decks, land ----

test('world terrain: today\'s area is exactly today\'s at every wiring step (ground, sidewalks, docks, water, land)', () => {
  const box = { minX: LAND.minX, maxX: LAND.maxX, minZ: RIVER.minZ, maxZ: LAND.maxZ };
  for (let n = 1; n <= P1_LAYOUTS.length; n++) {
    const W = world(n);
    let checked = 0;
    // Thủ Thiêm's piers reach out into today's river from the far bank: their surroundings are new.
    const added = W.docks.filter((d) => d.id >= DOCKS.length).map((d) => ({ minX: d.berth.minX - 3, maxX: d.berth.maxX + 3, minZ: d.berth.minZ - 3, maxZ: d.berth.maxZ + 3 }));
    const check = (x, z) => {
      if (!(x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ)) return;
      if (added.some((r) => inRect(r, x, z))) return;
      checked++;
      const g = groundHeight(x, z), w = W.groundHeight(x, z);
      if (!Object.is(g, w)) assert.fail(`${n} wired: groundHeight(${x}, ${z}): legacy ${g}, world ${w}`);
      if (onSidewalk(x, z) !== W.onSidewalk(x, z)) assert.fail(`${n} wired: onSidewalk(${x}, ${z})`);
      if (ix(dockAt(x, z)) !== tid(W.dockAt(x, z))) assert.fail(`${n} wired: dockAt(${x}, ${z})`);
      if (!Object.is(T.waterLevel(x, z), W.waterLevel(x, z))) assert.fail(`${n} wired: waterLevel(${x}, ${z}): ${T.waterLevel(x, z)} vs ${W.waterLevel(x, z)}`);
      if (T.deep(x, z) !== W.deep(x, z)) assert.fail(`${n} wired: deep(${x}, ${z})`);
      for (const r of [0, 0.4, 0.5]) {
        // Beyond today's fences the land goes on now: compare where the walker's disc stays inside them.
        if (x - r <= LAND.minX + 0.01 || x + r >= LAND.maxX - 0.01 || z + r >= LAND.maxZ - 0.01) continue;
        if (inRect(LAND, x, z, r) !== W.walkable(x, z, r)) assert.fail(`${n} wired: walkable(${x}, ${z}, ${r}): world ${W.walkable(x, z, r)}`);
      }
      for (const m of [0, 0.35, 1.15]) {
        // The buoy lines at x -138 and 352 are gone once the river runs on.
        if (x - m <= RIVER.minX + 0.01 || x + m >= RIVER.maxX - 0.01) continue;
        if (inRect(RIVER, x, z, m) !== W.inWater(x, z, m)) assert.fail(`${n} wired: inWater(${x}, ${z}, ${m})`);
        if (boatWater(x, z, m) !== W.navigable(x, z, m)) assert.fail(`${n} wired: navigable(${x}, ${z}, ${m})`);
      }
      for (const reach of [0.35, 1.4]) if (ix(legacyPier(x, z, reach)) !== tid(W.pierNear(x, z, reach))) assert.fail(`${n} wired: pierNear(${x}, ${z}, ${reach})`);
      // Until Thủ Thiêm is built the promenade is the nearest bank a swimmer can climb (after it, the far bank may be).
      if (n < 5 && z < RIVER.maxZ && z > RIVER.minZ) {
        const a = T.bankNear(x, z, Infinity, true), b = W.bankNear(x, z, Infinity, true);
        if (a.bank.kind !== b.bank.kind || !Object.is(a.d, b.d) || a.x !== b.x || a.z !== b.z) assert.fail(`${n} wired: bankNear(${x}, ${z})`);
        const fa = T.bankNear(x, z, 2.5)?.bank.kind ?? null, fb = W.bankNear(x, z, 2.5)?.bank.kind ?? null;
        if (fa !== fb) assert.fail(`${n} wired: bankNear(${x}, ${z}, 2.5): ${fa} vs ${fb}`);
      }
    };
    for (const [x, z] of samples(n === P1_LAYOUTS.length ? 3e5 : 6e4, 100 + n)) check(x, z);
    for (const [x, z] of edges()) check(x, z);
    assert.ok(checked > 3e4);
  }
});

test('world terrain: Cầu Khánh Hội carries walkers and cars over the canal; swimmers, boats and ragdolls under it get the water', () => {
  const W = world(1), deckY = 0.1 + 1, swimmer = WATER_LEVEL - 1.25;
  // On the carriageway over the water: 1 m above the street; on its sidewalk a curb higher.
  assert.equal(W.groundHeight(412, -108), deckY);
  assert.equal(W.groundHeight(412, -108, deckY), deckY);
  assert.ok(Math.abs(W.groundHeight(412, -98) - (deckY + T.CURB_HEIGHT)) < 1e-12);
  // Underneath: the swimmer swims, the boat floats, a body on the bed lies there, one falling past the deck keeps falling.
  assert.equal(W.groundHeight(412, -108, swimmer), RIVER_BED);
  assert.ok(W.deep(412, -108, swimmer) && !W.deep(412, -108, deckY) && !W.deep(412, -108));
  assert.equal(W.groundHeight(412, -108, WATER_LEVEL), RIVER_BED);
  assert.equal(W.groundHeight(412, -108, RIVER_BED + 0.2), RIVER_BED);
  assert.equal(W.groundHeight(412, -108, deckY - T.DECK_STEP - 0.01), RIVER_BED);
  assert.equal(W.waterLevel(412, -108), WATER_LEVEL);
  // Walking over it along z -108 (the carriageway) and z -98 (the sidewalk): the body follows the surface without a
  // cliff, never swims, and stays on walkable ground (the deck over the water, its fill over the kè walk).
  for (const z of [-108, -98, -119.8]) {
    let y = W.groundHeight(355, z), top = -Infinity;
    for (let x = 355; x <= 470; x += 0.1) {
      const g = W.groundHeight(x, z, y);
      assert.ok(Math.abs(g - y) < 0.2, `a cliff at (${x.toFixed(1)}, ${z}): ${y.toFixed(3)} → ${g.toFixed(3)}`);
      y = g; top = Math.max(top, y);
      assert.ok(!W.deep(x, z, y), `swimming on the bridge at (${x.toFixed(1)}, ${z})`);
      assert.ok(W.walkable(x, z, 0.4), `not walkable at (${x.toFixed(1)}, ${z})`);
    }
    assert.ok(top >= deckY && top <= deckY + T.CURB_HEIGHT + 1e-9, `the deck's top at z ${z}: ${top}`);
  }
  // Swimming under it along the canal, and a hire boat under it: open water all the way, never lifted.
  for (let z = -136; z <= -80; z += 0.25) {
    for (const x of [395, 412, 429]) {
      assert.ok(W.inWater(x, z, 0.35) && W.deep(x, z, swimmer) && W.groundHeight(x, z, swimmer) === RIVER_BED, `swimmer at (${x}, ${z})`);
      if (x === 412) assert.ok(W.navigable(x, z, 1.15) && W.navigable(x, z - 2.6, 0.9), `boat at (${x}, ${z})`);
    }
  }
  // Thrown off its side into the canal: past the parapet the ground is the bed at any height.
  for (const y of [3, deckY, 0, WATER_LEVEL, -2]) assert.equal(W.groundHeight(412, -94, y), RIVER_BED);
  // Every district deck, any height: over the water only bodies at most DECK_STEP below are carried; on the ramps' fill everyone is.
  const r = rng(77);
  for (let n = 1; n <= P1_LAYOUTS.length; n += 4) {
    const D = world(n);
    let over = 0, fill = 0, under = 0;
    for (const deck of D.decks) {
      const s = deck.shape;
      for (let i = 0; i < 4000; i++) {
        const x = s.minX + r() * (s.maxX - s.minX), z = s.minZ + r() * (s.maxZ - s.minZ);
        if (!T.inShape(s, x, z)) continue;
        const y = deck.y(x, z), yHint = WATER_LEVEL - 3 + r() * 6;
        const tops = D.decks.filter((d) => T.inShape(d.shape, x, z)).map((d) => ({ d, y: d.y(x, z) }));
        const got = D.groundHeight(x, z, yHint);
        if (D.wetAt(x, z)) {
          over++;
          const carried = tops.filter((q) => yHint >= q.y - T.DECK_STEP);
          if (!carried.length) { under++; assert.ok(got < y - T.DECK_STEP, `${deck.name} (${x}, ${z}) y ${yHint}: lifted to ${got}`); }
          else assert.equal(got, Math.max(...carried.map((q) => q.y), D.groundHeight(x, z, -1e9)));
        } else { fill++; assert.ok(got >= y - 1e-12, `${deck.name} fill at (${x}, ${z})`); }
      }
    }
    assert.ok(over > 1000 && fill > 300 && under > 300, `deck samples: ${over} over water, ${fill} on fill, ${under} under`);
  }
});

test('world terrain: banks are typed by the land behind them; climbing out lands on walkable ground', () => {
  const kind = (W, x, z, reach = 3) => W.bankNear(x, z, reach)?.bank.kind ?? null;
  const W1 = world(1), W2 = world(2), W3 = world(3), W5 = world(5);
  assert.equal(kind(W1, 500, -139), 'wharf', 'W1 bank at (500, -139)'); // the Khánh Hội quay
  assert.equal(kind(W1, 370, -139), 'promenade', 'W1 bank at (370, -139)'); // the Bến Nghé strip's river park
  assert.equal(kind(W1, 394, 0), 'ke', 'W1 bank at (394, 0)'); // Kênh Bến Nghé, both walls
  assert.equal(kind(W1, 430, 200), 'ke', 'W1 bank at (430, 200)');
  assert.equal(kind(W1, 412, -137.2, 1), null, 'W1 bank at (412, -137.2)'); // the canal's mouth on the river is no bank
  assert.ok(W1.navigable(412, -137.6, 1.15) && W1.navigable(412, -138.4, 1.15) && W1.navigable(412, -136.8, 1.15), 'a boat passes the canal mouth');
  assert.equal(kind(W1, 0, -202), 'far', 'W1 bank at (0, -202)'); // Thủ Thiêm not built: the far bank
  assert.equal(kind(W1, -150, 0), null, 'W1 bank at (-150, 0)'); // Bình Thạnh not built: no Thị Nghè canal yet
  assert.equal(kind(W2, -177, 0), 'ke', 'W2 bank at (-177, 0)');
  assert.equal(kind(W2, -300, 202), 'ke', 'W2 bank at (-300, 202)'); // Nhiêu Lộc, Bình Thạnh's kè
  assert.equal(kind(W2, -300, 228), 'far', 'W2 bank at (-300, 228)'); // its Quận 3 bank before Quận 3
  assert.equal(kind(W3, -300, 228), 'ke', 'W3 bank at (-300, 228)');
  assert.equal(kind(W2, -400, -139), 'promenade', 'W2 bank at (-400, -139)'); // Bình Thạnh's river park
  assert.equal(kind(W5, 0, -202), 'promenade', 'W5 bank at (0, -202)'); // Thủ Thiêm's riverside park
  assert.equal(kind(W5, -400, -202), 'wharf', 'W5 bank at (-400, -202)'); // the villa's private frontage
  assert.equal(kind(W5, 520, -235), 'promenade', 'W5 bank at (520, -235)'); // the basin's taper
  assert.equal(kind(W5, -470, -202), 'far', 'W5 bank at (-470, -202)'); // Thảo Điền, west of Trần Não, is P2
  // The far-bank notice fires only on a far bank that is left (game.ts climbOut).
  for (const W of [W1, W2, W3, W5]) {
    const bad = [];
    let n = 0;
    for (const b of W.banks) {
      if (!b.climbable || b.kind === 'steps') continue;
      const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
      if (len < 3) continue;
      const mx = (b.ax + b.bx) / 2, mz = (b.az + b.bz) / 2;
      if (!W.inBounds(mx, mz)) continue;
      n++;
      // A swimmer just off the wall climbs out `land` behind the waterline; a walker `vault - 0.2` behind it vaults into open water.
      const hit = W.bankNear(mx + b.nx * 1, mz + b.nz * 1, Infinity, true);
      const lx = hit.x - hit.bank.nx * hit.bank.land, lz = hit.z - hit.bank.nz * hit.bank.land;
      if (!W.walkable(lx, lz, 0.4) && !W.dockAt(lx, lz)) bad.push(`${b.kind} ${b.id} (${mx.toFixed(1)}, ${mz.toFixed(1)}): lands at (${lx.toFixed(1)}, ${lz.toFixed(1)})`);
      const vx = mx + b.nx * b.drop, vz = mz + b.nz * b.drop;
      if (!W.inWater(vx, vz, 0.35) && !W.hullAt(vx, vz)) bad.push(`${b.kind} ${b.id}: vault lands off the water at (${vx.toFixed(1)}, ${vz.toFixed(1)})`);
    }
    assert.ok(n > 4);
    assert.deepEqual(bad, []);
  }
});

test('world terrain: land is today\'s LAND, the slices and their roads, less the water and the railings', () => {
  const W1 = world(1), W2 = world(2), W3 = world(3), W4 = world(4), W5 = world(5);
  // Võ Văn Kiệt's east sidewalk is raised and walkable; the canal is not; the kè walk is up to its railing.
  assert.ok(W1.onSidewalk(386, 0) && Math.abs(W1.groundHeight(386, 0) - (0.1 + T.CURB_HEIGHT)) < 1e-12 && W1.walkable(386, 0, 0.4));
  assert.ok(!W1.onSidewalk(372, 0) && W1.groundHeight(372, 0) === 0.1);
  assert.ok(!W1.walkable(412, 0) && W1.wetAt(412, 0) && !W1.walkable(395, 0));
  assert.ok(W1.walkable(390.5, 20) && !W1.walkable(391.2, 20));
  // (the cargo ship's deck is walked: its own test below)
  assert.ok(W1.walkable(500, 200, 0.4) && W1.walkable(560, -120, 0.4) && !W1.walkable(527, -170) && W1.walkable(527, -158));
  // Unbuilt land is not land; a slice's roads are, to the hoardings beyond their outer sidewalks.
  assert.ok(!W1.walkable(-150, 0) && W2.walkable(-150, 0, 0.4));
  assert.ok(!W5.walkable(-550, 330) && !W5.walkable(-550, 330, 0.4));
  assert.ok(W5.walkable(-450, -380, 0.4) && W5.onSidewalk(-450, -380) && !W5.walkable(-455, -380));
  assert.ok(!W3.walkable(40, 300) && W4.walkable(40, 300, 0.4));
  // Bình Thạnh's ground runs on to its P1 edge hoarding (x -713.5) beside the river park and the canal park: no wall at x -700.
  for (const z of [-130, -118, -100, 190, 196]) assert.ok(W2.walkable(-705, z, 0.4) && W2.walkable(-712.9, z, 0.4) && !W2.walkable(-714, z), `Bình Thạnh's west edge at z ${z}`);
  // The Khánh Hội quay is an open wharf (no railing: a walker reaches its edge and steps off); kè and promenade are railed.
  assert.ok(W1.openEdge(500, -137.1) && W1.walkable(500, -137.0) && !W1.walkable(500, -137.2));
  assert.ok(!W1.openEdge(390.6, 20) && !W1.openEdge(370, -135.1) && !T.openEdge(0, -135.1));
  // The glide's fence: land, roads, decks, docks and water (with 2 m to spare over a wall top); not unbuilt land.
  assert.ok(W1.inPlay(0, -136) && W1.inPlay(390.6, 20) && W1.inPlay(412, -108) && !W1.inPlay(-300, 60) && !W5.inPlay(-560, 340));
  // The Thị Nghè decks carry today's roads west over the canal.
  assert.ok(W2.walkable(-190, 0, 0.4) && W2.groundHeight(-190, 0) > 1 && W2.groundHeight(-190, 0, WATER_LEVEL - 1.25) === RIVER_BED);
  // In bounds, everywhere a body may be is land, a deck, a dock or open water; out of it nothing is.
  for (const W of [W1, W5]) {
    assert.ok(W.inPlay(0, 0) && W.inPlay(0, -170) && W.inPlay(-80, -145) && !W.inPlay(0, -300) === (W === W1));
  }
});

test('world terrain: docks and the cargo ship by wiring step', () => {
  const keys = (W) => W.docks.map((d) => d.key);
  assert.deepEqual(keys(world(1)), ['an-hoa', 'an-hoa-ca-no', 'bach-dang', 'du-thuyen', 'ben-nha-rong']);
  assert.deepEqual(keys(world(2)), ['an-hoa', 'an-hoa-ca-no', 'bach-dang', 'du-thuyen', 'ben-nha-rong', 'ben-binh-thanh']);
  assert.deepEqual(keys(world(5)), ['an-hoa', 'an-hoa-ca-no', 'bach-dang', 'du-thuyen', 'ben-nha-rong', 'ben-binh-thanh', 'ben-do-thu-thiem', 'ben-thu-thiem', 'biet-thu']);
  const W = world(5);
  for (const d of W.docks) {
    const b = W.banks[d.bank];
    assert.equal(b.water, 0);
    assert.equal(b.az, d.side === 'S' ? RIVER.maxZ : RIVER.minZ, `${d.key} stands on its bank`);
    assert.equal(d.nz, d.side === 'S' ? -1 : 1);
    for (const l of d.landings) assert.equal(W.dockAt((l.minX + l.maxX) / 2, (l.minZ + l.maxZ) / 2), d, `${d.key} landing`);
    assert.equal(W.groundHeight(d.x, (d.pier.minZ + d.pier.maxZ) / 2), T.PIER_DECK);
    // A swimmer off the pier's end reaches it; a boat keeps clear of it.
    const endZ = d.side === 'S' ? d.pier.minZ : d.pier.maxZ;
    assert.equal(W.pierNear(d.x, endZ + d.nz * 1, 1.4), d);
    assert.ok(!W.navigable(d.x, endZ + d.nz * 0.5, 1.15) && W.navigable(d.x, endZ + d.nz * 4, 1.15), `${d.key} berth`);
    if (d.role !== 'private') assert.ok(W.groundHeight(d.steps.minX + 1, d.side === 'S' ? d.steps.minZ + 0.2 : d.steps.maxZ - 0.2) < WATER_LEVEL, `${d.key} steps run into the water`);
    assert.equal(d.ferry, d.key === 'an-hoa' || d.key === 'ben-do-thu-thiem');
  }
  // The cargo ship: nobody passes through its hull; the dark water in its lee between quay and hull stays open (c2-m3).
  const W1 = world(1);
  assert.ok(W1.hullAt(527, -158) && !W1.navigable(527, -158, 1) && !W1.navigable(480, -158, 1) && !W1.navigable(540, -149.5, 1.15));
  assert.ok(W1.navigable(527, -144, 1.15) && W1.navigable(527, -172, 1.15));
  for (const [x, z] of [[563, -138.6], [540, -144.5], [500, -144], [470, -142], [432, -141], [400, -140]]) assert.ok(W1.inWater(x, z, 0.35) && !W1.hullAt(x, z, 0.35), `the swim along the hull at (${x}, ${z})`);
});

test('world terrain: the cargo ship is boarded up its gangway or from the water, and walked on deck', () => {
  const W1 = world(1), top = WATER_LEVEL + 4.4;
  // The gangway: from street level on the quay, evenly up to the deck where it meets the hull; nothing either side of it.
  assert.ok(Math.abs(W1.groundHeight(527, -137.2) - 0.1) < 1e-9 && W1.walkable(527, -137.2, 0.4));
  let last = 0.1;
  for (let z = -138; z >= -150; z -= 0.5) {
    const y = W1.groundHeight(527, z, last);
    assert.ok(y >= last - 1e-9 && y - last < 0.2, `the gangway climbs evenly at z ${z}: ${y}`);
    assert.ok(W1.walkable(527, z, 0.4) && !W1.walkable(529, z), `on the gangway, not beside it, at z ${z}`);
    last = y;
  }
  assert.ok(Math.abs(last - top) < 1e-9);
  // The deck: walkable to its rails, at deck height for anyone up there, the river bed for a swimmer alongside below.
  assert.ok(W1.walkable(527, -151.5, 0.4) && W1.walkable(545, -164.6, 0.4) && W1.walkable(489.5, -151, 0.4));
  assert.equal(W1.groundHeight(545, -158, top), top);
  assert.equal(W1.groundHeight(527, -149.5, WATER_LEVEL - 1), RIVER_BED);
  // A swimmer climbs out at a tyre fender (quay side) or the pilot ladder (river side) onto the deck beside it.
  for (const [x, z] of [[534, -149.4], [488, -149.4], [545, -166.6]]) {
    const c = W1.climbNear(x, z, 1.6);
    assert.ok(c && W1.walkable(c.toX, c.toZ, 0.35) && W1.groundHeight(c.toX, c.toZ) === top, `a way up at (${x}, ${z})`);
  }
  assert.equal(W1.climbNear(527, -144, 1.6), null);
});

test('world terrain: installTerrain switches every exported query to the wired map and back', () => {
  const W = world(1);
  const before = { g: T.groundHeight(412, -108), b: { ...T.bounds } };
  assert.equal(before.g, groundHeight(412, -108));
  T.installTerrain(W);
  try {
    assert.equal(T.TERRAIN, W);
    assert.equal(T.liveTerrain(), W);
    assert.equal(T.groundHeight(412, -108), 1.1);
    assert.equal(T.groundHeight(412, -108, WATER_LEVEL - 1.25), RIVER_BED);
    assert.deepEqual({ ...T.bounds }, worldBoundsFor(1));
    assert.deepEqual([...T.wiredSlices()], ['quan-4']);
    assert.ok(T.walkable(386, 0, 0.4) && T.inWater(412, 0, 1) && T.navigable(412, 0, 1.15) && !T.navigable(527, -158, 1));
    assert.equal(T.dockAt(455, -145)?.key, 'ben-nha-rong');
  } finally { T.installTerrain(T.LEGACY_TERRAIN); }
  assert.equal(T.TERRAIN, T.LEGACY_TERRAIN);
  assert.equal(T.groundHeight(412, -108), before.g);
  assert.deepEqual({ ...T.bounds }, before.b);
});

test('timing: the wired terrain\'s hot queries', () => {
  const W = world(5), r = rng(9), pts = [];
  for (let i = 0; i < 1e5; i++) pts.push([-720 + r() * 1420, -440 + r() * 885]);
  const time = (f) => { let s = 0; const t0 = performance.now(); for (let k = 0; k < 3; k++) for (const [x, z] of pts) s += +f(x, z); const elapsed = performance.now() - t0; assert.ok(Number.isFinite(s), 'terrain queries return finite results'); return elapsed / (3 * pts.length) * 1e3; };
  time((x, z) => W.groundHeight(x, z)); time((x, z) => W.walkable(x, z, 0.4));
  const g = time((x, z) => W.groundHeight(x, z)), gh = time((x, z) => W.groundHeight(x, z, 0.3)), w = time((x, z) => W.walkable(x, z, 0.4)), n = time((x, z) => W.navigable(x, z, 1.15));
  console.log(`  wired map (5 slices): groundHeight ${g.toFixed(3)} µs, with yHint ${gh.toFixed(3)} µs, walkable(0.4) ${w.toFixed(3)} µs, navigable ${n.toFixed(3)} µs per call`);
  assert.ok(g < 4 && gh < 4 && w < 25 && n < 4, 'terrain queries stay cheap on the wired map');
});

test('timing: terrain groundHeight against the legacy function', () => {
  const pts = [...samples(2e5, 3)];
  const time = (f) => { let s = 0; const t0 = performance.now(); for (let k = 0; k < 5; k++) for (const [x, z] of pts) s += f(x, z); return [(performance.now() - t0) / (5 * pts.length) * 1e3, s]; };
  time(groundHeight); time(T.groundHeight);
  const [a, sa] = time(groundHeight), [b, sb] = time(T.groundHeight);
  assert.equal(sa, sb);
  console.log(`  groundHeight: legacy ${a.toFixed(3)} µs, terrain ${b.toFixed(3)} µs per call`);
});
