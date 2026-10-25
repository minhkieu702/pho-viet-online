import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { BUILDINGS, LAND, ROADS_X, ROADS_Z, SIDEWALK } from '../app/game/city.ts';
import { buildNav, createNav } from '../app/game/nav.ts';

// Frozen copy of nav.ts before the A* rewrite (O(N²) Dijkstra, linear snap). Only additions: it exposes its graph and
// the cost of the last route, so the new search can be checked against it, and takes the road grid as parameters.
function createOldNav(roadsX = ROADS_X, roadsZ = ROADS_Z, land = LAND) {
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
  layLines(roadsZ, roadsX, land.minX, land.maxX, true);
  layLines(roadsX, roadsZ, land.minZ, land.maxZ, false);

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

const old = createOldNav();
const nav = createNav();
const fields = (s) => ({ ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, a: s.a, b: s.b, crossing: s.crossing });

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

test('one shared nav over the legacy walking network, phantom crosswalks included', () => {
  assert.equal(createNav(), nav);
  assert.equal(nav.nodeCount(), old.nodeCount());
  assert.equal(old.nodeCount(), 236);
  assert.equal(old.segments.length, 388);
  assert.equal(old.segments.filter((s) => s.crossing).length, 180);
  assert.equal(old.segments.filter((s) => s.crossing && s.az === -116.4 && s.bz === -116.4).length, 9);
  // Every legacy leg is found, unchanged, by snapping to its midpoint.
  for (const s of old.segments) assert.deepEqual(fields(nav.snap((s.ax + s.bx) / 2, (s.az + s.bz) / 2).segment), fields(s));
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

test('P1-size grid (3.4k nodes): A* costs equal the old Dijkstra', () => {
  const { roadsX, roadsZ, land } = grid(40, 20);
  const ref = createOldNav(roadsX, roadsZ, land), big = buildNav(roadsX, roadsZ, land);
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
  const big = buildNav(roadsX, roadsZ, land), random = mulberry32(5);
  const across = timeRoutes(big.route, randomPairs(land, 600, random)), trips = timeRoutes(big.route, randomPairs(land, 2000, random, 300));
  console.log(`P3 grid: ${big.nodeCount()} nodes; route ms/call cross-map mean ${ms(across.mean)} p95 ${ms(across.p95)}, 300 m trips mean ${ms(trips.mean)} p95 ${ms(trips.p95)}`);
  assert.ok(trips.p95 < 2);
});
