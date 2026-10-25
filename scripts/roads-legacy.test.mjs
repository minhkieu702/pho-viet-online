// node --experimental-transform-types --test scripts/roads-legacy.test.mjs
// Road graph parity (critique step 8): the legacy importer rebuilds today's grid exactly, and the node-based
// signals.ts answers exactly as the old grid-based one did. The old signals.ts and nav.ts walking lines are frozen
// below as the reference. Imports only pure modules (no three.js); they import './city' without an extension
// (Vite style), which Node does not resolve, so a resolve hook retries such specifiers as .ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';

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
const signals = await import('../app/game/signals.ts');
const { LEGACY_ROADS: G, STREETS_EW, STREETS_NS, buildLegacyRoads } = await import('../app/game/map/roads-legacy.ts');
const { createRoadGraph } = await import('../app/game/map/roads.ts');
const { createNav } = await import('../app/game/nav.ts');

// ---- Reference: signals.ts before the road graph, verbatim ----
const OLD = (() => {
  const GREEN = 13, AMBER = 3, CLEAR = 1;
  const HALF = GREEN + AMBER + CLEAR;
  const CYCLE = HALF * 2;
  function phase(rx, rz, time) {
    const offset = ((rx - ROADS_X[0]) / 54) * 5.5 + ((rz - ROADS_Z[0]) / 54) * 3.5;
    return (((time + offset) % CYCLE) + CYCLE) % CYCLE;
  }
  function lightFor(rx, rz, axis, time) {
    const t = (phase(rx, rz, time) + (axis === 'z' ? 0 : HALF)) % CYCLE;
    return t < GREEN ? 'green' : t < GREEN + AMBER ? 'yellow' : 'red';
  }
  function greenIn(rx, rz, axis, time) {
    const t = (phase(rx, rz, time) + (axis === 'z' ? 0 : HALF)) % CYCLE;
    return t < GREEN ? 0 : CYCLE - t;
  }
  function walkOk(ax, az, bx, bz, time) {
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const rx = nearest(ROADS_X, mx), rz = nearest(ROADS_Z, mz);
    const held = alongX ? 'z' : 'x';
    return lightFor(rx, rz, held, time) === 'red' && greenIn(rx, rz, held, time) > 2;
  }
  function nearest(list, v) {
    let best = list[0];
    for (const r of list) if (Math.abs(r - v) < Math.abs(best - v)) best = r;
    return best;
  }
  const APPROACHES = [];
  for (const rx of ROADS_X) {
    for (const rz of ROADS_Z) {
      for (const dir of [1, -1]) {
        if (!(dir > 0 ? rx === ROADS_X[0] : rx === ROADS_X[ROADS_X.length - 1])) {
          APPROACHES.push({ rx, rz, axis: 'x', dir, pole: { x: rx - dir * 11.6, z: rz + dir * 7.7 } });
        }
        if (!(dir > 0 ? rz === ROADS_Z[0] : rz === ROADS_Z[ROADS_Z.length - 1])) {
          APPROACHES.push({ rx, rz, axis: 'z', dir, pole: { x: rx - dir * 7.7, z: rz - dir * 11.6 } });
        }
      }
    }
  }
  return { CYCLE, STOP_LINE: 11.2, lightFor, greenIn, walkOk, nearest, APPROACHES };
})();

// ---- Reference: nav.ts's walking lines before the road graph (the segment set it links), verbatim ----
const OLD_LEGS = (() => {
  const legs = [];
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
          if (alongX) legs.push({ ax: from, az: line, bx: to, bz: line, crossing });
          else legs.push({ ax: line, az: from, bx: line, bz: to, crossing });
        }
      }
    }
  };
  layLines(ROADS_Z, ROADS_X, LAND.minX, LAND.maxX, true);
  layLines(ROADS_X, ROADS_Z, LAND.minZ, LAND.maxZ, false);
  return legs;
})();

/** A leg as an order-free key with exact coordinates. */
function legKey(l) {
  let { ax, az, bx, bz } = l;
  if (ax > bx || (ax === bx && az > bz)) [ax, az, bx, bz] = [bx, bz, ax, az];
  return `${ax},${az},${bx},${bz},${!!l.crossing}`;
}
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const junctionId = (i, j) => i * ROADS_Z.length + j;
const graphData = (g) => JSON.stringify({ nodes: g.nodes, edges: g.edges, approaches: g.approaches, crosswalks: g.crosswalks, phantoms: g.phantoms, footways: g.footways });

test('legacy graph: 45 signalled junctions + 19 fence ends, 95 edges of which 76 carry traffic', () => {
  assert.equal(G.nodes.length, 64);
  assert.equal(G.nodes.filter((n) => n.control === 'signal').length, 45);
  assert.equal(G.nodes.filter((n) => n.control === 'fence-end').length, 19);
  assert.equal(G.edges.length, 95);
  assert.equal(G.edges.filter((e) => e.traffic).length, 76);
  ROADS_X.forEach((x, i) => ROADS_Z.forEach((z, j) => {
    const n = G.nodes[junctionId(i, j)];
    assert.deepEqual([n.x, n.z, n.control, n.phases], [x, z, 'signal', 2]);
    // The north-south roads start at the riverside road: a T there, four arms everywhere else.
    assert.equal(n.arms.length, j === 0 ? 3 : 4);
    for (const arm of n.arms) {
      assert.equal(arm.setback, signals.STOP_LINE, 'stop line of every junction arm');
      assert.equal(arm.group, Math.abs(arm.hz) > Math.abs(arm.hx) ? 0 : 1, 'north-south arms are group 0');
    }
  }));
  for (const n of G.nodes.filter((m) => m.control === 'fence-end')) {
    assert.equal(n.arms.length, 1);
    assert.ok(n.x === LAND.minX || n.x === LAND.maxX || n.z === LAND.maxZ, 'fence ends sit on the west, east or south fence');
  }
  for (const e of G.edges) {
    const a = G.nodes[e.a], b = G.nodes[e.b];
    assert.equal(e.traffic, a.control === 'signal' && b.control === 'signal', 'only stubs into a fence carry no traffic');
    assert.deepEqual([e.cls, e.half, e.sidewalk, e.walk, e.speed, e.closed, e.bays.length], ['R1', 7, 5.5, SIDEWALK, 13, false, 0]);
    // Lanes as vehicles.ts drives them: cars 3.0 m and motorbikes 5.4 m right of the centre, each way.
    assert.deepEqual(e.fwd.map((l) => [l.dir, l.off, l.use]), [[1, 3.0, 'car'], [1, 5.4, 'moto']]);
    assert.deepEqual(e.back.map((l) => [l.dir, l.off, l.use]), [[-1, 3.0, 'car'], [-1, 5.4, 'moto']]);
    // Edges point east or south; names as city.ts gives them.
    assert.ok((a.z === b.z && b.x > a.x) || (a.x === b.x && b.z > a.z));
    assert.equal(e.name, a.z === b.z ? STREETS_EW.get(a.z) : STREETS_NS.get(a.x));
    assert.equal(e.len, Math.hypot(b.x - a.x, b.z - a.z));
  }
  assert.equal(graphData(buildLegacyRoads()), graphData(G), 'rebuilding gives the same graph');
});

test('street names match the houses: each numbered house stands nearest the street on its address', () => {
  const houses = BUILDINGS.filter((b) => /^\d+ (ĐƯỜNG|ĐẠI LỘ) /.test(b.subtitle));
  assert.ok(houses.length > 40);
  for (const b of houses) assert.equal(G.nearestEdge(b.curb.x, b.curb.z, 30)?.edge.name, b.subtitle.replace(/^\d+ /, ''), b.name);
});

test('the 152 approaches and their poles are identical to the old signals.ts', () => {
  assert.equal(signals.APPROACHES.length, 152);
  assert.deepStrictEqual(signals.APPROACHES, OLD.APPROACHES);
  assert.equal(G.approaches.length, 152);
  G.approaches.forEach((a, i) => {
    const n = G.nodes[a.node], old = OLD.APPROACHES[i];
    assert.deepStrictEqual([n.x, n.z, a.pole], [old.rx, old.rz, old.pole]);
    assert.equal(a.group, old.axis === 'z' ? 0 : 1);
    assert.equal(a.stop, signals.STOP_LINE);
    assert.equal(n.arms[a.arm].approach, i);
    assert.ok(G.edges[a.edge].traffic);
  });
  assert.equal(signals.CYCLE, OLD.CYCLE);
  assert.equal(signals.STOP_LINE, OLD.STOP_LINE);
});

test('lightFor, greenIn and the node lights match the old code over a full cycle, every 0.25 s', () => {
  const steps = OLD.CYCLE / 0.25;
  for (const base of [0, 7 * 86400 + 0.1, 123456.789]) {
    for (let k = 0; k <= steps; k++) {
      const t = base + k * 0.25;
      signals.APPROACHES.forEach((a, i) => {
        for (const axis of ['x', 'z']) {
          assert.equal(signals.lightFor(a.rx, a.rz, axis, t), OLD.lightFor(a.rx, a.rz, axis, t));
          assert.equal(signals.greenIn(a.rx, a.rz, axis, t), OLD.greenIn(a.rx, a.rz, axis, t));
        }
        assert.equal(signals.approachLight(i, t), OLD.lightFor(a.rx, a.rz, a.axis, t));
      });
      for (const n of G.nodes.filter((m) => m.control === 'signal')) {
        for (const group of [0, 1]) {
          assert.equal(signals.nodeLight(n.id, group, t), OLD.lightFor(n.x, n.z, group ? 'x' : 'z', t));
          assert.equal(signals.nodeGreenIn(n.id, group, t), OLD.greenIn(n.x, n.z, group ? 'x' : 'z', t));
        }
      }
    }
  }
  // Coordinates off the grid fall back to the same formula.
  const random = mulberry32(8);
  for (let k = 0; k < 5000; k++) {
    const rx = Math.round((random() * 600 - 200) * 4) / 4, rz = Math.round((random() * 400 - 200) * 4) / 4, t = random() * 1000, axis = random() < 0.5 ? 'x' : 'z';
    assert.equal(signals.lightFor(rx, rz, axis, t), OLD.lightFor(rx, rz, axis, t));
    assert.equal(signals.greenIn(rx, rz, axis, t), OLD.greenIn(rx, rz, axis, t));
  }
});

test('walkOk matches the old code on every crossing, both ways, and from wherever people stand', () => {
  const crossings = OLD_LEGS.filter((l) => l.crossing);
  assert.equal(crossings.length, 180);
  const steps = OLD.CYCLE / 0.25;
  for (let k = 0; k <= steps; k++) {
    const t = k * 0.25;
    for (const c of crossings) {
      assert.equal(signals.walkOk(c.ax, c.az, c.bx, c.bz, t), OLD.walkOk(c.ax, c.az, c.bx, c.bz, t));
      assert.equal(signals.walkOk(c.bx, c.bz, c.ax, c.az, t), OLD.walkOk(c.bx, c.bz, c.ax, c.az, t));
    }
    for (const c of G.crosswalks) assert.equal(signals.crosswalkOk(c, t), OLD.walkOk(c.ax, c.az, c.bx, c.bz, t));
  }
  // npcs.ts asks from where the walker stands (near one end) towards the far end, at any time.
  const random = mulberry32(3);
  for (let k = 0; k < 40000; k++) {
    const c = crossings[Math.floor(random() * crossings.length)], flip = random() < 0.5, t = random() * 5000;
    const [fx, fz, tx, tz] = flip ? [c.bx, c.bz, c.ax, c.az] : [c.ax, c.az, c.bx, c.bz];
    const ax = fx + (random() - 0.5) * 6, az = fz + (random() - 0.5) * 6;
    assert.equal(signals.walkOk(ax, az, tx, tz, t), OLD.walkOk(ax, az, tx, tz, t));
  }
  for (let k = 0; k < 20000; k++) {
    const p = [0, 0, 0, 0].map((_, i) => (i % 2 ? LAND.minZ + random() * (LAND.maxZ - LAND.minZ) : LAND.minX + random() * (LAND.maxX - LAND.minX)));
    const t = random() * 5000;
    assert.equal(signals.walkOk(p[0], p[1], p[2], p[3], t), OLD.walkOk(p[0], p[1], p[2], p[3], t));
  }
});

test('pedestrian crossings equal the ones nav.ts builds, the 9 phantom ones flagged', () => {
  const old = new Set(OLD_LEGS.filter((l) => l.crossing).map(legKey));
  const mine = G.crosswalks.map((c) => legKey({ ...c, crossing: true }));
  assert.equal(mine.length, 180);
  assert.deepEqual(new Set(mine), old);
  const phantoms = G.crosswalks.filter((c) => c.phantom);
  assert.equal(phantoms.length, 9);
  for (const c of phantoms) {
    // Over the missing north arm of a riverside T junction: z = -116.4, held by north-south traffic.
    assert.deepEqual([c.az, c.bz, c.edge, c.arm, c.group], [ROADS_Z[0] - SIDEWALK, ROADS_Z[0] - SIDEWALK, -1, -1, 0]);
    assert.equal(G.nodes[c.node].z, ROADS_Z[0]);
  }
  for (const c of G.crosswalks.filter((m) => !m.phantom)) {
    const arm = G.nodes[c.node].arms[c.arm];
    assert.deepEqual([arm.edge, arm.crosswalk, arm.group], [c.edge, c.id, c.group]);
  }
  // The whole walking network: sidewalk legs corner to corner, crosswalks and the 18 promenade footways.
  const legs = G.walkLegs();
  assert.equal(legs.length, 388);
  assert.deepEqual(new Set(legs.map(legKey)), new Set(OLD_LEGS.map(legKey)));
  assert.equal(G.footways.length, 18);
  // And the live nav.ts (whatever its internals): same node count, and each leg is one of its segments.
  const nav = createNav();
  assert.equal(nav.nodeCount(), 236);
  for (const l of legs) {
    const s = nav.snap((l.ax + l.bx) / 2, (l.az + l.bz) / 2).segment;
    assert.equal(legKey(s), legKey(l));
  }
});

test('edge grid queries: asphalt and pavement as world.ts draws them, nearest edges, junctions', () => {
  const roadDistance = (roads, v) => roads.reduce((m, r) => Math.min(m, Math.abs(v - r)), Infinity);
  const surface = (x, z) => {
    const dz = roadDistance(ROADS_Z, z), dx = z > ROADS_Z[0] ? roadDistance(ROADS_X, x) : Infinity;
    return dz < 7 || dx < 7 ? 'asphalt' : dz < 12.5 || dx < 12.5 ? 'sidewalk' : 'off';
  };
  const random = mulberry32(11);
  for (let k = 0; k < 100000; k++) {
    const x = LAND.minX + random() * (LAND.maxX - LAND.minX), z = LAND.minZ + random() * (LAND.maxZ - LAND.minZ);
    assert.equal(G.edgeAt(x, z) ? 'asphalt' : G.edgeAt(x, z, 5.5) ? 'sidewalk' : 'off', surface(x, z), `${x},${z}`);
    if (k % 5) continue;
    const best = G.edges.reduce((m, e) => Math.min(m, G.project(e, x, z).d), Infinity);
    assert.equal(G.nearestEdge(x, z, Infinity).d, best);
    const near = G.nearestEdge(x, z);
    assert.equal(near ? near.d : Infinity, best <= 64 ? best : Infinity);
  }
  for (const n of G.nodes) {
    const expect = n.control === 'signal' ? n : null;
    assert.equal(G.junctionAt(n.x + 6.9, n.z - 6.9), expect);
    assert.equal(G.junctionAt(n.x + 10, n.z + 0.5), null);
    assert.equal(G.junctionsNear(n.x, n.z, 1).length, expect ? 1 : 0);
  }
  const hits = G.edgesNear(0, 0, 30);
  assert.deepEqual(hits.map((h) => h.d), [...hits.map((h) => h.d)].sort((p, q) => p - q));
  assert.equal(hits.filter((h) => h.d === 0).length, 4, 'the four arms of the junction at (0, 0)');
});

test('laneFrame puts cars and motorbikes where vehicles.ts lanes are', () => {
  const oldLane = (axis, road, along, dir, lane) =>
    axis === 'x' ? { x: along, z: road + dir * lane, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2 } : { x: road - dir * lane, z: along, yaw: dir > 0 ? 0 : Math.PI };
  for (const e of G.edges) {
    const a = G.nodes[e.a], axis = G.nodes[e.b].z === a.z ? 'x' : 'z';
    for (let s = 0; s <= e.len; s += e.len / 7) {
      for (const lane of [...e.fwd, ...e.back]) {
        const f = G.laneFrame(e, s, lane), o = oldLane(axis, axis === 'x' ? a.z : a.x, (axis === 'x' ? a.x : a.z) + s, lane.dir, lane.off);
        assert.ok(Math.abs(f.x - o.x) < 1e-9 && Math.abs(f.z - o.z) < 1e-9, `${e.id} ${s}`);
        assert.ok(Math.abs(Math.atan2(Math.sin(f.yaw - o.yaw), Math.cos(f.yaw - o.yaw))) < 1e-12);
        assert.ok(Math.abs(f.hx - Math.sin(f.yaw)) < 1e-12 && Math.abs(f.hz - Math.cos(f.yaw)) < 1e-12);
      }
    }
    assert.equal(G.laneFor(e, 1, 'car').off, 3.0);
    assert.equal(G.laneFor(e, -1, 'moto').off, 5.4);
  }
});

test('road A* finds the quickest route (same cost as a plain Dijkstra), avoiding closed roads', () => {
  // Reference: Dijkstra over the same states and costs, with a linear scan for the next state.
  const turn = (hx, hz, arm, u) => {
    if (u) return 8;
    const dot = hx * arm.hx + hz * arm.hz;
    return dot > 0.7 ? 0 : dot < -0.95 ? 8 : hx * arm.hz - hz * arm.hx > 0 ? 1 : 4;
  };
  function reference(fx, fz, tx, tz) {
    const open = (e) => !e.closed, can = (e, dir) => !e.closed && !!G.laneFor(e, dir, 'car');
    const from = G.nearestEdge(fx, fz, 60, open), to = G.nearestEdge(tx, tz, 60, open);
    let best = Infinity;
    if (from.edge === to.edge && can(from.edge, to.s >= from.s ? 1 : -1)) best = Math.abs(to.s - from.s) / from.edge.speed;
    const dist = new Map(), settled = new Set();
    for (const dir of [1, -1]) if (can(from.edge, dir)) dist.set(`${from.edge.id},${dir}`, (dir > 0 ? from.edge.len - from.s : from.s) / from.edge.speed);
    for (;;) {
      let key = null, g = Infinity;
      for (const [k, v] of dist) if (!settled.has(k) && v < g) { key = k; g = v; }
      if (key === null) break;
      settled.add(key);
      const [id, dir] = key.split(',').map(Number), e = G.edges[id], node = G.nodes[dir > 0 ? e.b : e.a];
      const inArm = node.arms.find((a) => a.edge === id && a.end === (dir > 0 ? 1 : 0));
      for (const arm of node.arms) {
        const e2 = G.edges[arm.edge], dir2 = arm.end === 0 ? 1 : -1;
        if (!can(e2, dir2)) continue;
        const g2 = g + turn(-inArm.hx, -inArm.hz, arm, arm === inArm);
        if (e2 === to.edge) best = Math.min(best, g2 + (dir2 > 0 ? to.s : e2.len - to.s) / e2.speed);
        if (!e2.traffic) continue;
        const k2 = `${e2.id},${dir2}`, ng = g2 + e2.len / e2.speed;
        if (!dist.has(k2) || ng < dist.get(k2)) dist.set(k2, ng);
      }
    }
    return best;
  }
  const random = mulberry32(21);
  const point = () => [LAND.minX + random() * (LAND.maxX - LAND.minX), LAND.minZ + random() * (LAND.maxZ - LAND.minZ)];
  const check = (r, fx, fz, tx, tz) => {
    const from = G.nearestEdge(fx, fz, 60), to = G.nearestEdge(tx, tz, 60);
    assert.deepEqual(r.points[0], { x: from.x, z: from.z });
    const end = r.points[r.points.length - 1];
    assert.ok(Math.hypot(end.x - to.x, end.z - to.z) < 1e-9);
    let length = 0;
    for (let i = 1; i < r.points.length; i++) length += Math.hypot(r.points[i].x - r.points[i - 1].x, r.points[i].z - r.points[i - 1].z);
    assert.ok(Math.abs(length - r.length) < 1e-6);
    // Consecutive edges meet at a node; stubs into a fence only at the ends.
    for (let i = 1; i < r.edges.length; i++) {
      const p = G.edges[r.edges[i - 1]], q = G.edges[r.edges[i]];
      assert.equal(r.dirs[i - 1] > 0 ? p.b : p.a, r.dirs[i] > 0 ? q.a : q.b);
      if (i < r.edges.length - 1) assert.ok(q.traffic);
    }
  };
  for (let k = 0; k < 250; k++) {
    const [fx, fz] = point(), [tx, tz] = point();
    const r = G.route(fx, fz, tx, tz);
    assert.ok(r);
    assert.ok(Math.abs(r.time - reference(fx, fz, tx, tz)) < 1e-9, `${fx},${fz} -> ${tx},${tz}`);
    check(r, fx, fz, tx, tz);
  }
  // Close Đường An Hòa between Trung Tâm and Bưu Điện: routes along it go round.
  const closed = G.edges.find((e) => G.nodes[e.a].x === 0 && G.nodes[e.a].z === 0 && G.nodes[e.b].x === 54 && G.nodes[e.b].z === 0);
  const before = G.route(-40, 2, 100, 2);
  assert.ok(before.edges.includes(closed.id));
  closed.closed = true;
  try {
    const after = G.route(-40, 2, 100, 2);
    assert.ok(!after.edges.includes(closed.id) && after.time > before.time);
    assert.ok(Math.abs(after.time - reference(-40, 2, 100, 2)) < 1e-9);
  } finally { closed.closed = false; }
});

test('a hand-made graph: a polyline road, a three-way signalled junction and a hẻm', () => {
  const c = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3);
  const g = createRoadGraph({
    nodes: [
      { x: 0, z: 0, control: 'signal' }, { x: 120, z: 0, control: 'none' }, { x: -100 * c, z: 100 * s, control: 'none' },
      { x: -100 * c, z: -100 * s, control: 'none' }, { x: 120, z: 60, control: 'none' },
    ],
    edges: [
      { a: 0, b: 1, name: 'A', via: [40, 6, 80, 0] },
      { a: 0, b: 2, name: 'B', cls: 'R2' },
      { a: 3, b: 0, name: 'C' },
      { a: 1, b: 4, name: 'HẺM 12', cls: 'hem' },
    ],
  });
  const hub = g.nodes[0];
  assert.equal(hub.phases, 3);
  assert.deepEqual(new Set(hub.arms.map((a) => a.group)), new Set([0, 1, 2]));
  assert.equal(g.approaches.length, 3);
  assert.equal(g.crosswalks.length, 3);
  // Crosswalk ends lie on the walking lines of the road they cross.
  for (const cw of g.crosswalks) {
    const e = g.edges[cw.edge];
    for (const [x, z] of [[cw.ax, cw.az], [cw.bx, cw.bz]]) assert.ok(Math.abs(Math.abs(g.project(e, x, z).off) - e.walk) < 1e-9);
  }
  // Walking lines meet at every corner (the hẻm's centre line is joined to road A's sidewalks); the only loose
  // ends are the sidewalks at the dead ends of B and C and the far end of the hẻm.
  const legs = g.walkLegs(), ends = new Map();
  for (const l of legs) for (const k of [`${l.ax.toFixed(6)},${l.az.toFixed(6)}`, `${l.bx.toFixed(6)},${l.bz.toFixed(6)}`]) ends.set(k, (ends.get(k) ?? 0) + 1);
  assert.equal([...ends.values()].filter((n) => n === 1).length, 5);
  // Lanes follow the polyline at their offset, and the hẻm takes motorbikes only.
  const a = g.edges[0];
  for (let t = 0; t <= a.len; t += 2.5) {
    if (a.cum.some((c) => Math.abs(c - t) < 1.5)) continue;
    const back = g.laneFrame(a, t, a.back[1]), fwd = g.laneFrame(a, t, a.fwd[0]);
    assert.ok(Math.abs(g.project(a, back.x, back.z).off + 5.4) < 1e-9, 'back lanes run on the left of a→b');
    assert.ok(Math.abs(g.project(a, fwd.x, fwd.z).off - 3.0) < 1e-9, 'forward lanes on the right');
  }
  assert.equal(g.laneFor(g.edges[3], 1, 'car'), null);
  assert.equal(g.route(-30, 52, 118, 55, { use: 'car' }), null, 'no car route into the hẻm');
  const r = g.route(-30, 52, 118, 55, { use: 'moto' });
  assert.deepEqual(r.edges, [1, 0, 3]);
  assert.equal(g.junctionAt(1, 1), hub);
  assert.equal(g.edgeAt(40, 6.5).edge.name, 'A');
});
