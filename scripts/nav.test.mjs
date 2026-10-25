// node --experimental-transform-types --test scripts/nav.test.mjs
// Pedestrian routing. Step 3: A* and a snap grid, checked against a frozen copy of the old O(N²) Dijkstra and linear
// snap. Step 12: the walking graph comes from the road graph; on today's map (LEGACY_ROADS) it is the old one index for
// index, except that the 9 phantom crosswalks are plain sidewalk now, and on any graph it carries hẻm centre lines,
// bends, footways and joins.
// Imports pure modules only. map/roads-legacy.ts imports './consts' without an extension (Vite style), which Node does
// not resolve, so a resolve hook retries such specifiers as .ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { performance } from 'node:perf_hooks';

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

const { BUILDINGS, LAND, ROADS_X, ROADS_Z, SIDEWALK } = await import('../app/game/city.ts');
const { LEGACY_ROADS: G } = await import('../app/game/map/roads-legacy.ts');
const { createRoadGraph } = await import('../app/game/map/roads.ts');
const { buildNav, createNav } = await import('../app/game/nav.ts');

// Frozen copy of nav.ts before the A* rewrite (O(N²) Dijkstra, linear snap, walking lines laid over a road grid). Only
// additions: it exposes its graph and the cost of the last route, so the new search can be checked against it, takes
// the road grid as parameters, and can link a given list of legs instead of laying the grid's lines.
function createOldNav(roadsX = ROADS_X, roadsZ = ROADS_Z, land = LAND, legs = null) {
  const nodes = [];
  const ids = new Map();
  const segments = [];
  let lastCost = NaN;

  function node(x, z) {
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    let id = ids.get(key);
    if (id === undefined) { id = nodes.length; nodes.push({ x, z, edges: [] }); ids.set(key, id); }
    return id;
  }
  function link(ax, az, bx, bz, crossing) {
    const a = node(ax, az), b = node(bx, bz);
    const cost = Math.hypot(bx - ax, bz - az) * (crossing ? 1.4 : 1);
    nodes[a].edges.push({ to: b, cost, crossing });
    nodes[b].edges.push({ to: a, cost, crossing });
    segments.push({ ax, az, bx, bz, a, b, crossing });
  }
  const breaksOf = (crossRoads, lo, hi) =>
    [lo + 1, ...crossRoads.flatMap((r) => [r - SIDEWALK, r + SIDEWALK]), hi - 1].sort((p, q) => p - q);
  const layLines = (roads, crossRoads, lo, hi, alongX) => {
    const breaks = breaksOf(crossRoads, lo, hi);
    for (const road of roads) {
      for (const side of [-1, 1]) {
        const line = road + side * SIDEWALK;
        for (let i = 0; i < breaks.length - 1; i++) {
          const from = breaks[i], to = breaks[i + 1];
          const crossing = crossRoads.some((r) => Math.abs(from - (r - SIDEWALK)) < 0.01 && Math.abs(to - (r + SIDEWALK)) < 0.01);
          if (alongX) link(from, line, to, line, crossing);
          else link(line, from, line, to, crossing);
        }
      }
    }
  };
  if (legs) for (const s of legs) link(s.ax, s.az, s.bx, s.bz, s.crossing);
  else {
    layLines(roadsZ, roadsX, land.minX, land.maxX, true);
    layLines(roadsX, roadsZ, land.minZ, land.maxZ, false);
  }

  function snap(x, z) {
    let best = { x, z, segment: segments[0], d: Infinity };
    for (const s of segments) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
      const px = s.ax + dx * t, pz = s.az + dz * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < best.d) best = { x: px, z: pz, segment: s, d };
    }
    return best;
  }

  function route(fromX, fromZ, toX, toZ) {
    lastCost = NaN;
    const from = snap(fromX, fromZ), to = snap(toX, toZ);
    if (from.segment === to.segment) return [{ x: to.x, z: to.z, crossing: to.segment.crossing }];
    const count = nodes.length;
    const dist = new Float64Array(count).fill(Infinity);
    const previous = new Int32Array(count).fill(-1);
    const crossingInto = new Uint8Array(count);
    const done = new Uint8Array(count);
    const seed = (id, x, z) => {
      const cost = Math.hypot(nodes[id].x - x, nodes[id].z - z) * (from.segment.crossing ? 1.4 : 1);
      if (cost < dist[id]) { dist[id] = cost; crossingInto[id] = from.segment.crossing ? 1 : 0; }
    };
    seed(from.segment.a, from.x, from.z);
    seed(from.segment.b, from.x, from.z);
    for (let n = 0; n < count; n++) {
      let u = -1, best = Infinity;
      for (let i = 0; i < count; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const edge of nodes[u].edges) {
        const next = dist[u] + edge.cost;
        if (next < dist[edge.to]) { dist[edge.to] = next; previous[edge.to] = u; crossingInto[edge.to] = edge.crossing ? 1 : 0; }
      }
    }
    const tail = (id) => dist[id] + Math.hypot(nodes[id].x - to.x, nodes[id].z - to.z);
    let last = tail(to.segment.a) <= tail(to.segment.b) ? to.segment.a : to.segment.b;
    lastCost = tail(last);
    const path = [{ x: to.x, z: to.z, crossing: to.segment.crossing }];
    while (last >= 0) {
      path.unshift({ x: nodes[last].x, z: nodes[last].z, crossing: crossingInto[last] === 1 });
      last = previous[last];
    }
    return path;
  }

  return { route, snap, nodeCount: () => nodes.length, nodes, segments, ids, lastCost: () => lastCost };
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Today's walking network as the old builder laid it, and the reference since the phantom crosswalks went: the same
// legs, with the 9 at z = -116.4 over the missing north arms of the riverside T junctions plain sidewalk.
const legacy = createOldNav();
const phantomZ = ROADS_Z[0] - SIDEWALK;
const isPhantom = (s) => s.crossing && s.az === phantomZ && s.bz === phantomZ;
const old = createOldNav(undefined, undefined, undefined, legacy.segments.map((s) => (isPhantom(s) ? { ...s, crossing: false } : s)));
const nav = createNav();
const fields = (s) => ({ ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, a: s.a, b: s.b, crossing: s.crossing });
const sameEnds = (s, p) => (s.ax === p.ax && s.az === p.az && s.bx === p.bx && s.bz === p.bz) || (s.ax === p.bx && s.az === p.bz && s.bx === p.ax && s.bz === p.az);

/**
 * Cost of a returned route under the network's rules, summed in the same order the searches add it up, after
 * checking every leg: it starts on the start leg, follows real legs with their crossing flags, and ends on the
 * destination leg at the snapped point.
 */
function pathCost(ref, fromX, fromZ, toX, toZ, path) {
  const from = ref.snap(fromX, fromZ), to = ref.snap(toX, toZ);
  const nodeAt = (p) => ref.ids.get(`${Math.round(p.x * 10)},${Math.round(p.z * 10)}`);
  const end = path[path.length - 1];
  assert.ok(Object.is(end.x, to.x) && Object.is(end.z, to.z) && end.crossing === to.segment.crossing, 'route ends at the snapped destination');
  if (path.length === 1) return NaN;
  let id = nodeAt(path[0]);
  assert.ok(id === from.segment.a || id === from.segment.b, 'route starts at an end of the start leg');
  assert.equal(path[0].crossing, from.segment.crossing);
  let cost = Math.hypot(ref.nodes[id].x - from.x, ref.nodes[id].z - from.z) * (from.segment.crossing ? 1.4 : 1);
  for (let i = 1; i < path.length - 1; i++) {
    const next = nodeAt(path[i]);
    const edge = ref.nodes[id].edges.find((e) => e.to === next && e.crossing === path[i].crossing);
    assert.ok(edge, `leg ${i} follows the network`);
    cost += edge.cost;
    id = next;
  }
  assert.ok(id === to.segment.a || id === to.segment.b, 'route reaches an end of the destination leg');
  return cost + Math.hypot(ref.nodes[id].x - to.x, ref.nodes[id].z - to.z);
}

/** Mean and p95 of one call per pair, in ms, after a warm-up. */
function timeRoutes(fn, pairs) {
  for (const p of pairs.slice(0, 200)) fn(...p);
  const samples = [];
  for (const p of pairs) { const t = performance.now(); fn(...p); samples.push(performance.now() - t); }
  samples.sort((p, q) => p - q);
  return { mean: samples.reduce((s, v) => s + v, 0) / samples.length, p95: samples[Math.floor(samples.length * 0.95)] };
}
const ms = (v) => v.toFixed(4);

/** A synthetic map with today's topology (54 m blocks, walking lines at road ± 8.4) and random point pairs on it. */
function grid(nx, nz) {
  const roadsX = Array.from({ length: nx }, (_, i) => i * 54), roadsZ = Array.from({ length: nz }, (_, i) => i * 54);
  return { roadsX, roadsZ, land: { minX: -30, maxX: (nx - 1) * 54 + 30, minZ: -30, maxZ: (nz - 1) * 54 + 30 } };
}
/**
 * The road graph of a full grid: a signalled junction at every crossing, roads running on to fence ends on all four
 * sides. Its walking network is the one the old builder laid over any grid (today's map lacks the north arms, which
 * is why the legacy importer carries the promenade footways and the phantom crosswalks as data).
 */
function gridRoads(roadsX, roadsZ, land) {
  const nodes = [], edges = [];
  const at = (i, j) => i * roadsZ.length + j, fence = (x, z) => nodes.push({ x, z, control: 'fence-end' }) - 1;
  for (const x of roadsX) for (const z of roadsZ) nodes.push({ x, z, control: 'signal' });
  const road = (ends, name) => ends.slice(1).forEach((b, k) => edges.push({ a: ends[k], b, name }));
  roadsZ.forEach((z, j) => road([fence(land.minX, z), ...roadsX.map((_, i) => at(i, j)), fence(land.maxX, z)], `EW ${z}`));
  roadsX.forEach((x, i) => road([fence(x, land.minZ), ...roadsZ.map((_, j) => at(i, j)), fence(x, land.maxZ)], `NS ${x}`));
  return createRoadGraph({ nodes, edges });
}
function randomPairs(land, count, random, reach = 0) {
  const pairs = [];
  while (pairs.length < count) {
    const fx = land.minX + random() * (land.maxX - land.minX), fz = land.minZ + random() * (land.maxZ - land.minZ);
    const a = random() * Math.PI * 2;
    const [tx, tz] = reach ? [fx + Math.cos(a) * reach, fz + Math.sin(a) * reach] : [land.minX + random() * (land.maxX - land.minX), land.minZ + random() * (land.maxZ - land.minZ)];
    if (tx > land.minX && tx < land.maxX && tz > land.minZ && tz < land.maxZ) pairs.push([fx, fz, tx, tz]);
  }
  return pairs;
}

const samePath = (p, q) => p.length === q.length && p.every((w, i) => Object.is(w.x, q[i].x) && Object.is(w.z, q[i].z) && w.crossing === q[i].crossing);

test('one shared nav, built from the legacy road graph: the old walking network index for index, phantom crosswalks as sidewalk', () => {
  assert.equal(createNav(), nav);
  assert.equal(nav.roads, G);
  assert.equal(nav.nodeCount(), legacy.nodeCount());
  assert.equal(legacy.nodeCount(), 236);
  assert.equal(legacy.segments.length, 388);
  assert.equal(legacy.segments.filter((s) => s.crossing).length, 180);
  assert.equal(legacy.segments.filter(isPhantom).length, 9);
  assert.equal(old.nodeCount(), 236);
  assert.equal(old.segments.filter((s) => s.crossing).length, 171);
  // The same legs in the same order with the same ends and node ids, so the same nodes and adjacency in the same order.
  assert.deepStrictEqual(nav.legs().map(fields), old.segments.map(fields));
  // Against the old network only the 9 phantom legs changed, and only their crossing flag.
  assert.deepStrictEqual(nav.legs().map((s, i) => ({ ...fields(s), crossing: s.crossing || isPhantom(legacy.segments[i]) })), legacy.segments.map(fields));
  // Every legacy leg is found, unchanged, by snapping to its midpoint.
  for (const s of old.segments) assert.deepEqual(fields(nav.snap((s.ax + s.bx) / 2, (s.az + s.bz) / 2).segment), fields(s));
});

test('every leg knows what it is: sidewalks along their road (on past the riverside Ts), crosswalks, the promenade footways', () => {
  const legs = nav.legs(), count = (kind) => legs.filter((s) => s.kind === kind).length;
  assert.deepEqual(['sidewalk', 'crossing', 'footway', 'hem', 'join'].map(count), [199, 171, 18, 0, 0]);
  for (const s of legs) {
    assert.equal(s.crossing, s.kind === 'crossing');
    if (s.kind === 'sidewalk') {
      const e = G.edges[s.ref];
      for (const [x, z] of [[s.ax, s.az], [s.bx, s.bz]]) assert.ok(Math.abs(Math.abs(G.project(e, x, z).off) - e.walk) < 1e-9, 'on its road\'s walking line');
    } else if (s.kind === 'crossing') {
      const c = G.crosswalks[s.ref];
      assert.ok(sameEnds(s, c));
      assert.equal(c.phantom, false);
    } else assert.ok(sameEnds(s, G.footways[s.ref]));
  }
  // Where the road graph has a phantom crosswalk, the river-side walking line of Đường Bờ Sông runs on past the T.
  const past = legs.filter((s) => G.crosswalks.some((c) => c.phantom && sameEnds(s, c)));
  assert.equal(past.length, 9);
  for (const s of past) assert.deepEqual([s.kind, s.az, s.bz, G.edges[s.ref].name], ['sidewalk', phantomZ, phantomZ, 'ĐƯỜNG BỜ SÔNG']);
  // Each real crosswalk and each footway is one leg.
  assert.deepEqual(legs.filter((s) => s.kind === 'crossing').map((s) => s.ref).sort((p, q) => p - q), G.crosswalks.filter((c) => !c.phantom).map((c) => c.id));
  assert.equal(new Set(legs.filter((s) => s.kind === 'footway').map((s) => s.ref)).size, G.footways.length);
});

test('no phantom crosswalks: the promenade side of Đường Bờ Sông walks on past the 9 riverside T junctions', () => {
  const [fx, tx, z] = [LAND.minX + 2, LAND.maxX - 2, phantomZ];
  const path = nav.route(fx, z, tx, z);
  assert.ok(path.every((w) => w.z === z), 'straight along the walking line');
  assert.equal(path.filter((w) => w.crossing).length, 0);
  // The old network sent the same walk over 9 roads that are not there (one per T, where no road leaves north),
  // each a crossing to wait at, costed 1.4x its length.
  const before = legacy.route(fx, z, tx, z), cost = legacy.lastCost();
  assert.deepEqual(before.filter((w) => w.crossing).map((w) => w.x), ROADS_X.map((x) => x + SIDEWALK));
  assert.ok(samePath(path, before.map((w) => ({ ...w, crossing: false }))));
  old.route(fx, z, tx, z);
  assert.ok(Math.abs(cost - old.lastCost() - 9 * 2 * SIDEWALK * 0.4) < 1e-9);
});

test('snap equals the linear scan on 20k seeded points', () => {
  const random = mulberry32(20240611);
  const points = [];
  for (let i = 0; i < 20000; i++) points.push([LAND.minX - 90 + random() * (LAND.maxX - LAND.minX + 180), LAND.minZ - 90 + random() * (LAND.maxZ - LAND.minZ + 180)]);
  // Exact nodes and leg ends, cell borders, far away and non-finite points.
  for (const n of old.nodes) points.push([n.x, n.z]);
  for (let x = LAND.minX - 32; x < LAND.maxX + 32; x += 16) for (let z = LAND.minZ - 32; z < LAND.maxZ + 32; z += 16) points.push([x + 1, z + 0.6]);
  points.push([1e4, 0], [-1e4, -1e4], [0, 1e12], [NaN, 0], [Infinity, 3], [0, -Infinity]);
  for (const [x, z] of points) {
    const a = old.snap(x, z), b = nav.snap(x, z);
    assert.ok(Object.is(a.x, b.x) && Object.is(a.z, b.z) && Object.is(a.d, b.d), `snap ${x},${z}`);
    assert.deepEqual(fields(b.segment), fields(a.segment), `snap ${x},${z}`);
  }
});

test('route costs equal the old Dijkstra on 5000 seeded pairs', () => {
  const random = mulberry32(7);
  const pick = () => BUILDINGS[Math.floor(random() * BUILDINGS.length)];
  const pairs = [];
  for (let i = 0; i < 2000; i++) {
    const a = pick(), b = pick();
    pairs.push([a.curb.x, a.curb.z, b.curb.x, b.curb.z]);
  }
  for (let i = 0; i < 3000; i++) {
    const p = () => [LAND.minX - 20 + random() * (LAND.maxX - LAND.minX + 40), LAND.minZ - 20 + random() * (LAND.maxZ - LAND.minZ + 40)];
    pairs.push([...p(), ...p()]);
  }
  let same = 0, tied = 0, worst = 0;
  for (const [fx, fz, tx, tz] of pairs) {
    const reference = old.route(fx, fz, tx, tz), cost = old.lastCost();
    const path = nav.route(fx, fz, tx, tz);
    const got = pathCost(old, fx, fz, tx, tz, path);
    if (reference.length === 1) { assert.ok(samePath(path, reference), 'same leg: straight to the destination'); same++; continue; }
    const diff = Math.abs(got - cost);
    worst = Math.max(worst, diff);
    assert.ok(diff <= 1e-9 * Math.max(1, cost), `route ${fx},${fz} -> ${tx},${tz}: ${got} vs ${cost}`);
    if (samePath(path, reference)) same++;
    else {
      // A different path is fine only as a tie: the old one costs the same.
      assert.ok(Math.abs(pathCost(old, fx, fz, tx, tz, reference) - got) <= 1e-9 * Math.max(1, cost));
      tied++;
    }
  }
  console.log(`routes: ${pairs.length} pairs, ${same} identical paths, ${tied} different paths of equal cost, largest cost difference ${worst}`);
});

test('timing: old Dijkstra vs A*', () => {
  const random = mulberry32(99);
  const pairs = [];
  for (let i = 0; i < 2000; i++) {
    const a = BUILDINGS[Math.floor(random() * BUILDINGS.length)], b = BUILDINGS[Math.floor(random() * BUILDINGS.length)];
    pairs.push([a.curb.x, a.curb.z, b.curb.x, b.curb.z]);
  }
  const before = timeRoutes(old.route, pairs), after = timeRoutes(nav.route, pairs);
  const points = pairs.map(([x, z]) => [x + 3.7, z - 5.1]);
  const snapTime = (fn) => { const t = performance.now(); for (let k = 0; k < 10; k++) for (const [x, z] of points) fn(x, z); return (performance.now() - t) / (points.length * 10); };
  const snapBefore = snapTime(old.snap), snapAfter = snapTime(nav.snap);
  console.log(`route ms/call  old mean ${ms(before.mean)} p95 ${ms(before.p95)}  new mean ${ms(after.mean)} p95 ${ms(after.p95)}  (${(before.mean / after.mean).toFixed(1)}x)`);
  console.log(`snap  µs/call  old ${(snapBefore * 1000).toFixed(2)}  new ${(snapAfter * 1000).toFixed(2)}  (${(snapBefore / snapAfter).toFixed(1)}x)`);
  assert.ok(after.mean < before.mean);
});

test('any full grid: its road graph gives the old builder\'s walking network, index for index', () => {
  const grids = [grid(2, 2), grid(5, 3), { roadsX: ROADS_X, roadsZ: ROADS_Z, land: LAND }, grid(40, 20)];
  for (const { roadsX, roadsZ, land } of grids) {
    const ref = createOldNav(roadsX, roadsZ, land), mine = buildNav(gridRoads(roadsX, roadsZ, land));
    assert.equal(mine.nodeCount(), ref.nodeCount());
    assert.deepStrictEqual(mine.legs().map(fields), ref.segments.map(fields), `${roadsX.length}x${roadsZ.length} grid`);
  }
  // Today's grid with its north arms is the old walking network: the phantom crosswalks were real ones there.
  const full = buildNav(gridRoads(ROADS_X, ROADS_Z, LAND));
  assert.deepStrictEqual(full.legs().map(fields), legacy.segments.map(fields));
  assert.equal(full.legs().filter((s) => s.kind === 'footway').length, 0);
});

test('P1-size grid (3.4k nodes): A* costs equal the old Dijkstra', () => {
  const { roadsX, roadsZ, land } = grid(40, 20);
  const ref = createOldNav(roadsX, roadsZ, land), big = buildNav(gridRoads(roadsX, roadsZ, land));
  assert.equal(big.nodeCount(), ref.nodeCount());
  let same = 0;
  const pairs = randomPairs(land, 60, mulberry32(11));
  for (const [fx, fz, tx, tz] of pairs) {
    const reference = ref.route(fx, fz, tx, tz), cost = ref.lastCost(), path = big.route(fx, fz, tx, tz);
    if (reference.length === 1) { assert.ok(samePath(path, reference)); same++; continue; }
    assert.ok(Math.abs(pathCost(ref, fx, fz, tx, tz, path) - cost) <= 1e-9 * cost, `route ${fx},${fz} -> ${tx},${tz}`);
    if (samePath(path, reference)) same++;
  }
  const before = timeRoutes(ref.route, pairs.slice(0, 20)), after = timeRoutes(big.route, pairs);
  console.log(`P1 grid: ${ref.nodeCount()} nodes, ${same}/${pairs.length} identical paths; route ms/call old mean ${ms(before.mean)}, new mean ${ms(after.mean)} p95 ${ms(after.p95)}`);
});

test('P3-size grid (20k nodes): A* timing', () => {
  const { roadsX, roadsZ, land } = grid(120, 40);
  const t = performance.now(), roads = gridRoads(roadsX, roadsZ, land), graphMs = performance.now() - t;
  const big = buildNav(roads), buildMs = performance.now() - t - graphMs, random = mulberry32(5);
  const across = timeRoutes(big.route, randomPairs(land, 600, random)), trips = timeRoutes(big.route, randomPairs(land, 2000, random, 300));
  console.log(`P3 grid: ${big.nodeCount()} nodes, ${big.legs().length} legs (road graph ${graphMs.toFixed(0)} ms, nav build ${buildMs.toFixed(0)} ms); route ms/call cross-map mean ${ms(across.mean)} p95 ${ms(across.p95)}, 300 m trips mean ${ms(trips.mean)} p95 ${ms(trips.p95)}`);
  assert.ok(trips.p95 < 2);
});

// A road (R) with a hẻm leaving it south at a T, a signalled crossroads where a bent R2 road leaves north, a footway
// from a park meeting the south sidewalk mid-block, and fence ends.
const HAND = {
  nodes: [
    { x: -60, z: 0, control: 'fence-end' }, { x: 0, z: 0, control: 'priority' }, { x: 60, z: 0, control: 'signal' }, { x: 120, z: 0, control: 'fence-end' },
    { x: 0, z: 50, control: 'none' }, { x: 80, z: -70, control: 'fence-end' }, { x: 60, z: 60, control: 'fence-end' },
  ],
  edges: [
    { a: 0, b: 1, name: 'R' }, { a: 1, b: 2, name: 'R' }, { a: 2, b: 3, name: 'R' },
    { a: 1, b: 4, name: 'HẺM 5', cls: 'hem' },
    { a: 2, b: 5, name: 'B', cls: 'R2', via: [60, -40] },
    { a: 2, b: 6, name: 'S' },
  ],
  footways: [{ ax: 20, az: 40, bx: 20, bz: 8.4 }],
};

test('a hand-made graph: a hẻm centre line, a bent road, a footway meeting a sidewalk mid-block', () => {
  const roads = createRoadGraph(HAND), hand = buildNav(roads), legs = hand.legs();
  const kinds = (kind) => legs.filter((s) => s.kind === kind);
  // Down the middle of the hẻm, from where it meets the road's south walking line to its end.
  assert.deepEqual(kinds('hem').map((s) => [s.ax, s.az, s.bx, s.bz, s.ref]), [[0, 8.4, 0, 50, 3]]);
  // Its mouth: one informal crossing over the through road (both its arms point to it), laid once.
  assert.deepEqual(roads.crosswalks.filter((c) => c.ax === 0 && c.bx === 0).map((c) => c.informal), [true]);
  assert.equal(new Set(roads.nodes[1].arms.filter((a) => roads.edges[a.edge].cls !== 'hem').map((a) => a.crosswalk)).size, 1);
  assert.equal(kinds('crossing').filter((s) => s.ax === 0 && s.bx === 0).length, 1);
  // The footway's end splits the sidewalk it meets; both halves still belong to that road edge.
  assert.deepEqual(kinds('footway').map((s) => [s.ax, s.az, s.bx, s.bz]), [[20, 8.4, 20, 40]]);
  assert.deepEqual(legs.filter((s) => s.az === 8.4 && s.bz === 8.4 && s.ax >= 0 && s.bx <= 51.6).map((s) => [s.ax, s.bx, s.kind, s.ref]), [[0, 20, 'sidewalk', 1], [20, 51.6, 'sidewalk', 1]]);
  // The bent road's walking lines follow its bend (one leg per polyline piece, each side).
  assert.equal(legs.filter((s) => s.kind === 'sidewalk' && s.ref === 4).length, 4);
  for (const s of legs.filter((l) => l.kind === 'sidewalk')) {
    const e = roads.edges[s.ref];
    for (const [x, z] of [[s.ax, s.az], [s.bx, s.bz]]) assert.ok(Math.abs(Math.abs(roads.project(e, x, z).off) - e.walk) < 1e-6, `sidewalk on ${e.name}`);
  }
  // From the end of the hẻm to the far side of the road: up the hẻm, over the crosswalk at its mouth, along the road.
  const at = (path) => path.map((w) => [+w.x.toFixed(6), +w.z.toFixed(6), w.crossing]);
  assert.deepEqual(at(hand.route(0, 50, 30, -8.4)), [[0, 8.4, false], [0, -8.4, true], [30, -8.4, false]]);
  // From the park end of the footway onto the bent road, through the signalled crossroads.
  const out = at(hand.route(20, 40, 75, -60));
  assert.deepEqual(out[0], [20, 8.4, false]);
  assert.equal(out.filter((w) => w[2]).length, 2, 'over the road, then over the bent one');
  assert.ok(Math.abs(Math.abs(roads.project(roads.edges[4], out[out.length - 1][0], out[out.length - 1][1]).off) - roads.edges[4].walk) < 1e-6);
  // Costs equal a plain Dijkstra over the same legs, and every node is reachable from every other.
  const ref = createOldNav(undefined, undefined, undefined, legs), random = mulberry32(4);
  const box = { minX: -70, maxX: 130, minZ: -80, maxZ: 70 };
  for (const [fx, fz, tx, tz] of randomPairs(box, 400, random)) {
    const reference = ref.route(fx, fz, tx, tz), cost = ref.lastCost(), path = hand.route(fx, fz, tx, tz);
    if (reference.length === 1) { assert.ok(samePath(path, reference)); continue; }
    assert.ok(Number.isFinite(cost), `reachable ${fx},${fz} -> ${tx},${tz}`);
    assert.ok(Math.abs(pathCost(ref, fx, fz, tx, tz, path) - cost) <= 1e-9 * cost, `route ${fx},${fz} -> ${tx},${tz}`);
  }
});

test('the walking graph does not depend on how the road graph lists its nodes and edges', () => {
  const flip = (e) => {
    const via = [];
    for (let k = (e.via ?? []).length - 2; k >= 0; k -= 2) via.push(e.via[k], e.via[k + 1]);
    return { ...e, a: e.b, b: e.a, via };
  };
  const n = HAND.nodes.length, id = (k) => n - 1 - k;
  const shuffled = {
    nodes: [...HAND.nodes].reverse(),
    edges: [...HAND.edges].reverse().map((e, k) => (k % 2 ? flip(e) : e)).map((e) => ({ ...e, a: id(e.a), b: id(e.b) })),
    footways: HAND.footways.map((f) => ({ ax: f.bx, az: f.bz, bx: f.ax, bz: f.az })),
  };
  const a = buildNav(createRoadGraph(HAND)), b = buildNav(createRoadGraph(shuffled));
  const shape = (s) => ({ ...fields(s), kind: s.kind });
  const within = (p, q) => p.length === q.length && p.every((s, i) => Math.abs(s.ax - q[i].ax) < 1e-9 && Math.abs(s.az - q[i].az) < 1e-9 && Math.abs(s.bx - q[i].bx) < 1e-9 && Math.abs(s.bz - q[i].bz) < 1e-9);
  assert.ok(within(a.legs(), b.legs()), 'same legs');
  assert.deepEqual(a.legs().map((s) => [s.a, s.b, s.crossing, s.kind]), b.legs().map((s) => [s.a, s.b, s.crossing, s.kind]));
  // Legacy: rebuilding gives the same network.
  assert.deepStrictEqual(buildNav().legs().map(shape), nav.legs().map(shape));
});
