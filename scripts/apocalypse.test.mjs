// node --experimental-transform-types --test scripts/apocalypse.test.mjs
// The ruined city of zombie mode (app/game/apocalypse.ts, design.md §6c and §7.1): planRuins is deterministic (twice,
// shuffled inputs, chunk order, without transcendental functions, a frozen hash for today's map), keeps its colliders
// off walking lines, solids and keep-clear spots, never disconnects the car graph or blocks a bridge, leaves no pocket,
// meets the densities and budgets, and the runtime puts its colliders in and takes them out again under its own owner
// tag with ragdoll-readable refs. A synthetic district (no city.ts) plans and builds too. The wired city
// (apocalypse-inputs.ts ruinInputsFromWorld: today's map and the P1 districts) plans deterministically (the worker's
// packed round trip included), gives every district ruins in proportion to its size, never collapses a KEEP building,
// keeps doors, places and story sites open, a drive lane down every road and two open arms at every junction, keeps a
// rotated building's rubble within its footprint and margin, stays on land, in budget and streams in chunk pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { readFileSync } from 'node:fs';

// Some game modules import without an extension (Vite style): retry such specifiers as .ts.
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
const THREE = await import('three');
const A = await import('../app/game/apocalypse.ts');
const { ruinInputsFromCity } = await import('../app/game/apocalypse-inputs.ts');
const { createCollisionIndex } = await import('../app/game/map/collision.ts');
const { createColliderGrid, queryColliders } = await import('../app/game/ragdoll-solver.ts');
const { groundHeight } = await import('../app/game/map/terrain.ts');
const { createNav } = await import('../app/game/nav.ts');
const { BUILDINGS, POIS, LAND } = await import('../app/game/city.ts');
const { RUIN_THROWN } = await import('../lib/zombie-protocol.ts');

/**
 * planRuins(ruinInputsFromCity()).hash, frozen: a change to the plan of today's map must be deliberate (bump
 * APOCALYPSE_VERSION and ZOMBIE_VERSION with it, then update this constant).
 */
const FROZEN_HASH = 2178311882;

const STEP = Math.PI / 32;
const kOf = (yaw) => ((Math.round(yaw / STEP) % 64) + 64) % 64;
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffled = (list, r) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** The collider's box: centre, half sizes and its axes (side (c, −s), forward (s, c)) with Math trig (tests may). */
const box = (c) => ({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, c: Math.cos(c.yaw), s: Math.sin(c.yaw) });
function dist2(b, x, z) {
  const dx = x - b.cx, dz = z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
  const ex = Math.max(Math.abs(lx) - b.hx, 0), ez = Math.max(Math.abs(lz) - b.hz, 0);
  return ex * ex + ez * ez;
}
/** Smallest distance from a segment to the box, sampled every 5 cm (exact enough for a 1 m rule). */
function segDist(b, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 0.05));
  let best = Infinity;
  for (let i = 0; i <= n; i++) best = Math.min(best, dist2(b, ax + (bx - ax) * (i / n), az + (bz - az) * (i / n)));
  return Math.sqrt(best);
}
function obbOverlapsRect(b, r, tol) {
  // Separating axes: the rect's x and z, the box's side and forward.
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [b.cx + b.c * b.hx * u + b.s * b.hz * v, b.cz - b.s * b.hx * u + b.c * b.hz * v]);
  const xs = corners.map((p) => p[0]), zs = corners.map((p) => p[1]);
  if (Math.min(...xs) >= r.maxX - tol || Math.max(...xs) <= r.minX + tol || Math.min(...zs) >= r.maxZ - tol || Math.max(...zs) <= r.minZ + tol) return false;
  for (const [ux, uz, h] of [[b.c, -b.s, b.hx], [b.s, b.c, b.hz]]) {
    const pr = [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]].map(([x, z]) => (x - b.cx) * ux + (z - b.cz) * uz);
    if (Math.min(...pr) >= h - tol || Math.max(...pr) <= -h + tol) return false;
  }
  return true;
}
const median = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];

const input = ruinInputsFromCity();
const plan = A.planRuins(input);

// ---- A synthetic district: a 1400 × 880 m grid of R1 and R2 streets with hẻm, plots, trees, poles, a park, a bridge. ----
function district() {
  const xs = [], zs = [];
  for (let x = -700; x <= 700; x += 140) xs.push(x);
  for (let z = -440; z <= 440; z += 110) zs.push(z);
  const spec = { R1: [7, 5.5, 8.4], R2: [4.5, 3, 5.9], hem: [1.75, 0, 0] };
  const roads = [], junctions = [], plots = [], trees = [], poles = [], solids = [], stalls = [], greens = [];
  const road = (pts, cls, extra = {}) => { const [half, sidewalk, walk] = spec[cls]; roads.push({ id: roads.length, pts, half, sidewalk, walk, cls, traffic: true, ...extra }); return roads.length - 1; };
  const r = rng(77);
  const park = { minX: 160, maxX: 260, minZ: 130, maxZ: 210 };
  greens.push(park);
  zs.forEach((z, j) => { for (let i = 0; i + 1 < xs.length; i++) road([xs[i], z, xs[i + 1], z], j % 2 ? 'R2' : 'R1'); });
  const bridges = [];
  xs.forEach((x, i) => { for (let j = 0; j + 1 < zs.length; j++) { const id = road([x, zs[j], x, zs[j + 1]], i % 2 ? 'R2' : 'R1', x === 0 && j === 0 ? { bridge: true } : {}); if (x === 0 && j === 0) bridges.push(id); } });
  // Hẻm through the middle of every other block, north to south (their ends meet the streets mid-edge).
  for (let i = 0; i + 1 < xs.length; i += 2) for (let j = 0; j + 1 < zs.length; j += 2) road([(xs[i] + xs[i + 1]) / 2, zs[j] + 9, (xs[i] + xs[i + 1]) / 2 + 3, (zs[j] + zs[j + 1]) / 2, (xs[i] + xs[i + 1]) / 2, zs[j + 1] - 9], 'hem');
  for (const x of xs) for (const z of zs) {
    const arms = (x > xs[0] ? 1 : 0) + (x < xs[xs.length - 1] ? 1 : 0) + (z > zs[0] ? 1 : 0) + (z < zs[zs.length - 1] ? 1 : 0);
    junctions.push({ x, z, r: 11, arms });
  }
  // Plots along both sides of every street edge, facing it, with gaps here and there; trees and poles in the curb band.
  for (const rd of roads) {
    if (rd.cls === 'hem') continue;
    const [ax, az, bx, bz] = rd.pts, len = Math.hypot(bx - ax, bz - az), hx = (bx - ax) / len, hz = (bz - az) / len;
    for (const side of [-1, 1]) {
      const nx = -hz * side, nz = hx * side, set = rd.half + rd.sidewalk;
      for (let s = 18; s < len - 18;) {
        const w = 8 + r() * 6;
        if (r() < 0.1) { s += w; continue; }
        const cx = ax + hx * (s + w / 2) + nx * (set + 7), cz = az + hz * (s + w / 2) + nz * (set + 7);
        const along = Math.abs(hx) > 0.5, p = along ? { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - 6, maxZ: cz + 6 } : { minX: cx - 6, maxX: cx + 6, minZ: cz - w / 2, maxZ: cz + w / 2 };
        if (!(p.maxX < park.minX - 1 || p.minX > park.maxX + 1 || p.maxZ < park.minZ - 1 || p.minZ > park.maxZ + 1)) { s += w; continue; }
        const facing = Math.atan2(-nx, -nz), h = r() < 0.08 ? 50 + r() * 60 : 6 + r() * 26;
        plots.push({ id: plots.length, ...p, h, facing, style: h > 40 ? 'tower' : r() < 0.5 ? 'home' : 'shop', sign: r() < 0.5, keep: r() < 0.03 });
        solids.push(p);
        s += w + 0.2;
      }
      for (let s = 12; s < len - 12; s += 9) {
        const x = ax + hx * s + nx * (rd.half + rd.sidewalk * 0.6), z = az + hz * s + nz * (rd.half + rd.sidewalk * 0.6);
        trees.push({ x, z, size: 0.8 + r() * 0.6, species: r() < 0.15 ? 'palm' : 'round' });
        solids.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
      }
      if (rd.cls === 'R2' && side > 0) for (let s = 14; s < len - 14; s += 26) {
        const x = ax + hx * s + nx * (rd.half + 0.6), z = az + hz * s + nz * (rd.half + 0.6);
        poles.push({ x, z, yaw: 0, line: `l${rd.id}` });
        solids.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15 });
      }
    }
  }
  for (let i = 0; i < 40; i++) stalls.push({ x: 175 + r() * 60, z: 120 + r() * 4, yaw: 0, kind: r() < 0.5 ? 'stall' : 'cart' });
  return {
    input: {
      bounds: { minX: -720, minZ: -460, maxX: 720, maxZ: 460 }, roads, junctions, crosswalks: [], plots, trees, poles, lamps: [], greens, stalls,
      keepClear: [{ x: 0, z: 0, r: 12, major: true }], solids, checkpoints: [{ x: 300, z: 6, yaw: 0 }],
    },
    bridges,
  };
}
const synthetic = district();
const synthPlan = A.planRuins(synthetic.input);

test('the plan is deterministic: twice, shuffled inputs, a frozen hash for today\'s map', () => {
  const again = A.planRuins(ruinInputsFromCity());
  assert.equal(again.hash, plan.hash);
  assert.deepEqual(again.items, plan.items);
  assert.deepEqual(again.colliders, plan.colliders);
  assert.deepEqual(again.fleetSpots, plan.fleetSpots);
  const r = rng(5);
  const mixed = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? shuffled(v, r) : v]));
  const shuffledPlan = A.planRuins(mixed);
  assert.equal(shuffledPlan.hash, plan.hash, 'a shuffled input plans the same ruins');
  assert.deepEqual(shuffledPlan.items, plan.items);
  assert.equal(A.planRuins(input, A.APOCALYPSE_SEED + 1).hash === plan.hash, false, 'another seed plans other ruins');
  assert.equal(plan.hash, FROZEN_HASH, 'planRuins output changed: bump APOCALYPSE_VERSION and ZOMBIE_VERSION, then update FROZEN_HASH');
});

test('without Math.sin/cos/exp/pow/hypot/atan2 the plan is the same (no branching on engine-dependent maths)', () => {
  const saved = {};
  for (const f of ['sin', 'cos', 'exp', 'pow', 'hypot', 'atan2', 'tan', 'asin', 'acos', 'log']) { saved[f] = Math[f]; Math[f] = () => { throw new Error(`Math.${f} in planRuins`); }; }
  let stubbed;
  try { stubbed = A.planRuins(input); } finally { Object.assign(Math, saved); }
  assert.equal(stubbed.hash, plan.hash);
});

test('chunks plan the same in any order, a subset first or all at once', () => {
  const all = A.createRuinPlanner(input).plan();
  const keys = A.createRuinPlanner(input).keys();
  const backward = A.createRuinPlanner(input);
  for (const k of [...keys].reverse()) backward.chunk(k);
  const partial = A.createRuinPlanner(input);
  for (const k of keys.filter((_, i) => i % 3 === 1)) partial.chunk(k);
  const some = partial.plan(keys.filter((_, i) => i % 2 === 0));
  for (const p of [backward.plan(), partial.plan()]) { assert.equal(p.hash, all.hash); assert.deepEqual(p.items, all.items); }
  // A subset's items are exactly the full plan's items of those chunks (collider indices aside: the arrays differ).
  const want = new Set(keys.filter((_, i) => i % 2 === 0));
  const resolve = (p) => p.items.map((it) => ({ ...it, collider: it.collider < 0 ? null : { ...p.colliders[it.collider], item: undefined } }));
  assert.deepEqual(resolve(some), resolve(all).filter((it) => want.has(Math.floor(it.id / 4096))));
});

test('colliders keep 1 m off walking lines, door and seat paths and crosswalks, overlap no solid, respect keep-clear', () => {
  const legs = createNav().legs().map((l) => [l.ax, l.az, l.bx, l.bz]);
  for (const b of BUILDINGS) legs.push([b.door.x, b.door.z, b.curb.x, b.curb.z]);
  for (const p of POIS) legs.push([p.curb.x, p.curb.z, p.x, p.z]);
  const solids = input.solids;
  let checked = 0;
  for (const c of plan.colliders) {
    const b = box(c), reach = Math.hypot(c.hx, c.hz) + 4;
    for (const [ax, az, bx, bz] of legs) {
      if (Math.max(ax, bx) < c.cx - reach || Math.min(ax, bx) > c.cx + reach || Math.max(az, bz) < c.cz - reach || Math.min(az, bz) > c.cz + reach) continue;
      const d = segDist(b, ax, az, bx, bz);
      assert.ok(d >= 0.99, `${plan.items[c.item].kind} collider at ${c.cx},${c.cz} is ${d.toFixed(2)} m from a walking leg`);
      checked++;
    }
    const it = plan.items[c.item];
    for (const s of solids) {
      if (s.maxX < c.cx - reach || s.minX > c.cx + reach || s.maxZ < c.cz - reach || s.minZ > c.cz + reach) continue;
      assert.equal(obbOverlapsRect(b, s, 0.02), false, `${it.kind} collider at ${c.cx},${c.cz} overlaps a solid`);
    }
    for (const k of input.keepClear) assert.ok(Math.sqrt(dist2(b, k.x, k.z)) >= k.r - 0.02, `${it.kind} collider at ${c.cx},${c.cz} inside the keep-clear spot ${k.x},${k.z} (r ${k.r})`);
    assert.ok(c.cx - c.hx >= LAND.minX - 4 && c.cx + c.hx <= LAND.maxX + 4);
  }
  assert.ok(checked > 100, 'the walking legs were checked');
  assert.ok(plan.colliders.length > 150 && plan.colliders.length <= 1500, `${plan.colliders.length} colliders (≤ 1500)`);
});

test('the car graph stays connected, bridges are never blocked, at most 10% of the streets fully blocked', () => {
  for (const [inp, extra] of [[input, []], [synthetic.input, synthetic.bridges]]) {
    const planner = A.createRuinPlanner(inp);
    const blocked = new Set(planner.blockedEdges()), edges = planner.traffic();
    const components = (skip) => {
      const parent = new Map(), find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
      for (const e of edges) { if (!parent.has(e.a)) parent.set(e.a, e.a); if (!parent.has(e.b)) parent.set(e.b, e.b); }
      for (const e of edges) if (!skip.has(e.id)) { const a = find(e.a), b = find(e.b); if (a !== b) parent.set(a, b); }
      return new Set([...parent.keys()].map(find)).size;
    };
    assert.equal(components(blocked), components(new Set()), 'blocking never disconnects the car graph');
    for (const id of extra) assert.equal(blocked.has(id), false, 'a bridge is never blocked');
    const streets = inp.roads.filter((r) => r.traffic && r.cls !== 'hem').length;
    assert.ok(blocked.size <= Math.ceil(streets * 0.1), `${blocked.size} blocked of ${streets} streets (≤ 10%)`);
  }
  assert.ok(A.createRuinPlanner(synthetic.input).blockedEdges().length > 0, 'the district gets some full blocks');
});

/** Lone wrecks (not in a cluster) per 100 m of each road class. */
function wreckDensity(p, inp) {
  const inCluster = new Set(p.clusters.flatMap((c) => c.colliders));
  const length = { R1: 0, R2: 0, hem: 0 }, count = { R1: [0, 0], R2: [0, 0], hem: [0, 0] };
  for (const r of inp.roads) for (let i = 2; i < r.pts.length; i += 2) length[r.cls] += Math.hypot(r.pts[i] - r.pts[i - 2], r.pts[i + 1] - r.pts[i - 1]);
  for (const it of p.items) {
    if (!['car', 'carBurnt', 'moto'].includes(it.kind) || it.y > 0 || (it.collider >= 0 && inCluster.has(it.collider))) continue;
    let best = null, bd = Infinity;
    for (const r of inp.roads) for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], vx = r.pts[i] - ax, vz = r.pts[i + 1] - az, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((it.x - ax) * vx + (it.z - az) * vz) / l2)), d = Math.hypot(it.x - ax - vx * t, it.z - az - vz * t);
      if (d < bd) { bd = d; best = r; }
    }
    if (best) count[best.cls][it.kind === 'moto' ? 1 : 0]++;
  }
  return Object.fromEntries(Object.keys(length).map((c) => [c, length[c] ? [count[c][0] / length[c] * 100, count[c][1] / length[c] * 100] : null]));
}
const within = (value, want, label) => assert.ok(value >= want * 0.75 && value <= want * 1.25, `${label}: ${value.toFixed(3)} (want ${want} ±25%)`);

test('densities match §6c.1 within ±25%', () => {
  const today = wreckDensity(plan, input);
  within(today.R1[0], 2.5, 'cars per 100 m of R1'); within(today.R1[1], 3, 'motorbikes per 100 m of R1');
  const synth = wreckDensity(synthPlan, synthetic.input);
  within(synth.R1[0], 2.5, 'district cars per 100 m of R1'); within(synth.R1[1], 3, 'district motorbikes per 100 m of R1');
  within(synth.R2[0], 1.5, 'district cars per 100 m of R2'); within(synth.R2[1], 2.5, 'district motorbikes per 100 m of R2');
  within(synth.hem[1], 1.5, 'district motorbikes per 100 m of hẻm');
  assert.equal(synth.hem[0], 0, 'no cars in a hẻm');
  for (const [p, inp] of [[plan, input], [synthPlan, synthetic.input]]) {
    const items = p.items, n = (kind, f = () => true) => items.filter((it) => it.kind === kind && f(it)).length;
    const low = inp.plots.filter((q) => q.h <= 40 && q.h >= 3 && q.style !== 'tower');
    const corners = low.filter((q) => !q.keep && q.h >= 5 && q.style !== 'kiosk').length;
    within(n('breach'), corners * 0.06, 'half-collapsed corners (6% of plots)');
    within(n('vine'), low.length * 0.35, 'vines (35% of plots)');
    within(n('moss'), low.length * 0.6, 'moss (60% of plots)');
    within(n('window'), low.reduce((s, q) => s + Math.max(1, Math.floor(frontWidth(q) / 6)), 0) * 0.4, 'broken windows (one per 6 m of frontage on 40% of plots)');
    within(n('sign'), inp.plots.filter((q) => q.sign && q.h <= 40).length * 0.2, 'fallen signs (20% of plots with a sign)');
    // Strip items carry their count in ext[0]; densities are over the road outside the junction boxes.
    const sum = (kind, f) => items.filter((it) => it.kind === kind && f(it)).reduce((s, it) => s + it.ext[0], 0);
    const { curb, lane } = usable(inp);
    within(sum('weeds', (it) => (it.v & 1) === 0) / curb, 0.35, 'curb tufts per metre of curb');
    within(sum('weeds', (it) => (it.v & 1) === 1) / lane, 1 / 30, 'crack tufts per m² of lane');
    within(sum('crack', () => true) / lane, 1 / 20, 'cracks per m² of lane');
    const greenArea = inp.greens.reduce((s, g) => s + (g.maxX - g.minX) * (g.maxZ - g.minZ), 0);
    within(n('grass') / greenArea, 1 / 6 * 0.9, 'clumps per m² of green');
    const junctions = inp.junctions.length;
    assert.ok(new Set(items.filter((it) => it.kind === 'barricade' && (it.v & 3) === 0).map((it) => Math.floor(it.id / 4096))).size >= 1);
    within(items.filter((it) => it.kind === 'barricade' && (it.v & 3) === 0).length, junctions * 0.3 * 0.9, 'junction barricades (30% of junctions)');
    const area = (inp.bounds.maxX - inp.bounds.minX) * (inp.bounds.maxZ - inp.bounds.minZ) / 1e6;
    assert.ok(p.fires.length >= 12 * area, `${p.fires.length} fires over ${area.toFixed(2)} km² (≥ 12 / km²)`);
    assert.ok(p.columns.length >= 1, 'smoke columns over burning ruins');
    assert.ok(p.spawnHoles.length > 0 && p.craters.length > 0, 'spawn holes and craters for the mutants');
  }
  within(n2(plan, 'bus'), Math.round(A.createRuinPlanner(input).r1Length / 600), 'bus crashes (one per ~600 m of R1)');
  within(n2(plan, 'tree'), countGaps(input) * 0.08, 'fallen trees (8% of street-tree gaps)');
});
const n2 = (p, kind) => p.items.filter((it) => it.kind === kind).length;
/** A plot's street front width (the planner's face of `facing`). */
function frontWidth(p) {
  const a = ((p.facing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), q = Math.round(a / (Math.PI / 2)) % 4;
  return q % 2 ? p.maxZ - p.minZ : p.maxX - p.minX;
}
/** Curb length (both sides) and lane area of the roads outside the junction boxes at their ends. */
function usable(inp) {
  let curb = 0, lane = 0;
  for (const r of inp.roads) {
    let len = 0;
    for (let i = 2; i < r.pts.length; i += 2) len += Math.hypot(r.pts[i] - r.pts[i - 2], r.pts[i + 1] - r.pts[i - 1]);
    for (const [x, z] of [[r.pts[0], r.pts[1]], [r.pts[r.pts.length - 2], r.pts[r.pts.length - 1]]]) {
      let clear = 0;
      for (const j of inp.junctions) if (Math.hypot(x - j.x, z - j.z) <= j.r + 2) clear = Math.max(clear, j.r + 0.5);
      len -= clear;
    }
    if (len <= 0) continue;
    curb += len * 2; lane += len * r.half * 2;
  }
  return { curb, lane };
}
/** Gaps of 6–40 m between consecutive street trees (the planner's own rule, recomputed). */
function countGaps(inp) {
  const sides = new Map();
  for (const t of inp.trees) {
    let best = null, bd = 16;
    for (const r of inp.roads) for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], vx = r.pts[i] - ax, vz = r.pts[i + 1] - az, l = Math.hypot(vx, vz);
      const tt = Math.max(0, Math.min(1, ((t.x - ax) * vx + (t.z - az) * vz) / (l * l))), d = Math.hypot(t.x - ax - vx * tt, t.z - az - vz * tt);
      if (d < bd) { bd = d; const off = (-(vz / l) * (t.x - ax) + (vx / l) * (t.z - az)); best = { r, off, s: tt * l }; }
    }
    if (!best || Math.abs(best.off) < best.r.half || Math.abs(best.off) > best.r.half + best.r.sidewalk + 1.5) continue;
    const key = `${best.r.id}:${best.off > 0}`;
    if (!sides.has(key)) sides.set(key, []);
    sides.get(key).push(best.s);
  }
  let gaps = 0;
  for (const l of sides.values()) { l.sort((a, b) => a - b); for (let i = 1; i < l.length; i++) if (l[i] - l[i - 1] >= 6 && l[i] - l[i - 1] <= 40) gaps++; }
  return gaps;
}

test('planning today\'s map takes ≤ 25 ms (the best warm run: other work on a shared machine only slows some runs)', () => {
  // Up to 80 runs or 10 s; stops early once the plan's own cost is clear.
  const times = [], until = performance.now() + 10_000;
  while (times.length < 80 && performance.now() < until) {
    const t = performance.now(); A.planRuins(input); times.push(performance.now() - t);
    if (times.length >= 10 && Math.min(...times) <= 20) break;
  }
  // The design budget is 25 ms on a quiet machine (18 ms measured running this file alone). The package "test" script
  // runs ~40 files in parallel, which slows even the best run past it (29 ms measured), so the shared suite only
  // guards against regressions at twice the budget; PVO_PERF_STRICT=1 checks the budget itself.
  const budget = process.env.PVO_PERF_STRICT ? 25 : 50;
  assert.ok(Math.min(...times) <= budget, `best ${Math.min(...times).toFixed(1)} ms of ${times.length} runs, median ${median(times).toFixed(1)} ms (budget ${budget} ms)`);
  console.log(`# planRuins today: best ${Math.min(...times).toFixed(1)} ms of ${times.length} runs, median ${median(times).toFixed(1)} ms; ${plan.items.length} items, ${plan.colliders.length} colliders`);
});

test('every chunk mesh stays in budget: ≤ 30 k triangles at High, ≤ 12 k at Low (no vines, tufts, litter, windows)', () => {
  for (const [p, ground] of [[plan, groundHeight], [synthPlan, () => 0]]) {
    let most = 0, mostLow = 0;
    for (const key of p.chunks.keys()) {
      const hi = A.buildChunkGeometry(p, key, ground, 0), lo = A.buildChunkGeometry(p, key, ground, 4);
      most = Math.max(most, hi.triangles); mostLow = Math.max(mostLow, lo.triangles);
      assert.ok(hi.triangles <= A.CHUNK_TRIS.high, `chunk ${key}: ${hi.triangles} triangles at High`);
      assert.ok(lo.triangles <= A.CHUNK_TRIS.low, `chunk ${key}: ${lo.triangles} triangles at Low`);
      assert.ok(lo.triangles <= hi.triangles);
      const pos = hi.geometry.getAttribute('position').array;
      for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) assert.fail(`chunk ${key}: a vertex is not finite`);
      hi.geometry.dispose(); lo.geometry.dispose();
    }
    console.log(`# biggest chunk: ${most} triangles at High, ${mostLow} at Low`);
  }
});

test('no pockets: every cluster of today\'s map and of the district is open to a 1 m path', () => {
  assert.deepEqual(A.findPockets(plan, input), []);
  assert.deepEqual(A.findPockets(synthPlan, synthetic.input), []);
  assert.ok(plan.clusters.length > 10 && synthPlan.clusters.length > 50);
});

test('setEnabled puts the colliders in under RUIN_OWNER and takes only them out; refs are ragdoll-safe', () => {
  const index = createCollisionIndex();
  const others = [1, 2, 16, 48].map((owner, i) => index.add(-120 + i * 3, 10, -118 + i * 3, 12, -Infinity, Infinity, owner, { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }));
  const count = (owner) => { const out = []; const n = index.query(-1e4, -1e4, 1e4, 1e4, out); let c = 0; for (let i = 0; i < n; i++) if (index.owner(out[i]) === owner) c++; return c; };
  const scene = new THREE.Scene();
  const apo = A.createApocalypse(scene, index, { ground: groundHeight });
  apo.setEnabled(true, plan);
  assert.equal(count(A.RUIN_OWNER), plan.colliders.length);
  assert.equal(apo.stats().colliders, plan.colliders.length);
  assert.ok(apo.fires.length > 0);
  // Ragdoll refs: an axis-aligned Collider (its own box) within 10° of an axis, otherwise no minX at all.
  const ids = []; const n = index.query(-1e4, -1e4, 1e4, 1e4, ids);
  let shaped = 0, skewed = 0;
  for (let i = 0; i < n; i++) {
    if (index.owner(ids[i]) !== A.RUIN_OWNER) continue;
    const ref = index.ref(ids[i]), item = apo.item(ref.ruin), c = plan.colliders[item.collider], k = kOf(c.yaw) % 16;
    assert.ok(Number.isInteger(ref.ruin));
    if (k <= 1 || k >= 15) {
      shaped++;
      const swap = Math.round(c.yaw / (Math.PI / 2)) % 2 !== 0, ex = swap ? c.hz : c.hx, ez = swap ? c.hx : c.hz;
      assert.ok(Math.abs(ref.maxX - ref.minX - 2 * ex) < 1e-6 && Math.abs(ref.maxZ - ref.minZ - 2 * ez) < 1e-6, 'its own box');
      assert.ok(Math.abs((ref.minX + ref.maxX) / 2 - c.cx) < 1e-6 && ref.top > c.top - 0.01);
    } else { skewed++; assert.equal(ref.minX, undefined); }
  }
  assert.ok(shaped > 0 && skewed > 0, `${shaped} axis-aligned refs, ${skewed} skewed`);
  const grid = createColliderGrid([], 16, index), got = queryColliders(grid, LAND.minX, LAND.minZ, LAND.maxX, LAND.maxZ, []);
  for (const ref of got) {
    if (ref.ruin === undefined) continue;
    const c = plan.colliders[apo.item(ref.ruin).collider];
    assert.ok((ref.maxX - ref.minX) * (ref.maxZ - ref.minZ) <= 4 * c.hx * c.hz * 1.05 + 1e-6, 'a ragdoll AABB never exceeds its box by > 5%');
  }
  apo.setEnabled(false);
  assert.equal(count(A.RUIN_OWNER), 0);
  for (const id of others) assert.ok(index.owner(id) >= 1 && index.ref(id) !== null, 'other owners untouched');
  assert.equal(index.size, 4);
  assert.deepEqual(apo.fires, []);
  apo.setEnabled(true);
  assert.equal(count(A.RUIN_OWNER), plan.colliders.length, 'on again');
  apo.dispose();
  assert.equal(count(A.RUIN_OWNER), 0);
  assert.equal(scene.children.length, 0);
});

test('smash: crushed (0..7) or thrown, collider out, packed list, late-joiner sync, forgotten on leaving', () => {
  const index = createCollisionIndex();
  const apo = A.createApocalypse(new THREE.Scene(), index, { ground: () => 0 });
  apo.setEnabled(true, plan);
  const cars = plan.items.filter((it) => it.smash && it.collider >= 0 && it.kind !== 'moto');
  const [a, b, c] = cars;
  const before = apo.stats().colliders;
  let near = [];
  apo.smashables(a.x, a.z, 3, (id) => near.push(id));
  assert.ok(near.includes(a.id));
  assert.equal(apo.smash(a.id, 3, 1000), true);
  assert.equal(apo.stats().colliders, before - 1);
  assert.deepEqual(apo.smashed(), [a.id * 16 + 3]);
  assert.equal(apo.smash(a.id, 5, 1100), false, 'crushed once');
  assert.equal(apo.smash(a.id, RUIN_THROWN, 1200), true, 'a crushed wreck can still be thrown');
  near = []; apo.smashables(a.x, a.z, 3, (id) => near.push(id));
  assert.equal(near.includes(a.id), false, 'a thrown wreck is gone');
  assert.equal(apo.smash(b.id, 9, 0), false, 'codes are 0..8');
  assert.equal(apo.smash(12345, 1, 0), false, 'unknown ids are ignored');
  apo.syncSmashed([a.id * 16 + 3, b.id * 16 + RUIN_THROWN, c.id * 16 + 6]);
  assert.deepEqual(apo.smashed(), [a.id * 16 + 3, a.id * 16 + RUIN_THROWN, b.id * 16 + RUIN_THROWN, c.id * 16 + 6]);
  assert.equal(apo.stats().colliders, before - 3);
  apo.update(new THREE.PerspectiveCamera(), a.x, a.z, 2000);
  apo.setEnabled(false);
  assert.deepEqual(apo.smashed(), []);
  apo.setEnabled(true);
  assert.equal(apo.stats().colliders, before, 'every wreck back in its plan pose');
  apo.dispose();
});

test('fleet wreck spots: cars then motorbikes, in lanes, clear of every ruin collider', () => {
  const want = input.fleet;
  assert.equal(plan.fleetSpots.filter((s) => s.kind === 'car').length, want.cars);
  assert.equal(plan.fleetSpots.filter((s) => s.kind === 'moto').length, want.motos);
  assert.ok(plan.fleetSpots.findIndex((s) => s.kind === 'moto') === want.cars, 'cars first');
  for (const s of plan.fleetSpots) {
    for (const c of plan.colliders) assert.ok(Math.sqrt(dist2(box(c), s.x, s.z)) > 1.5, `fleet spot ${s.x},${s.z} against a ${plan.items[c.item].kind}`);
    for (const k of input.keepClear) assert.ok(Math.hypot(s.x - k.x, s.z - k.z) >= k.r);
  }
});

test('district readiness: a generated map with no city.ts plans and builds; apocalypse.ts never imports today\'s map', () => {
  assert.ok(synthPlan.items.length > 5000 && synthPlan.colliders.length > 500, `${synthPlan.items.length} items, ${synthPlan.colliders.length} colliders`);
  for (const kind of ['car', 'carBurnt', 'moto', 'bus', 'breach', 'rubble', 'shell', 'wall', 'tree', 'pole', 'cable', 'vine', 'moss', 'weeds', 'grass', 'crack', 'scorch', 'crater', 'litter', 'stall', 'barricade', 'barrel', 'window', 'patch', 'sign', 'tent', 'tangle', 'shards'])
    assert.ok(synthPlan.items.some((it) => it.kind === kind), `the district has ${kind}`);
  const t = performance.now(); A.planRuins(synthetic.input); const ms = performance.now() - t;
  console.log(`# district plan ${ms.toFixed(0)} ms, ${synthPlan.chunks.size} chunks`);
  const src = readFileSync(new URL('../app/game/apocalypse.ts', import.meta.url), 'utf8');
  assert.equal(/from ['"]\.\/city/.test(src), false);
  assert.equal(/Math\.random\(|Date\.now\(/.test(src.slice(0, src.indexOf('// The runtime.'))), false, 'no clock or Math.random in the planner');
});

// ---- The wired city (map/world-map.ts): today's map and every wired district in one input (apocalypse-inputs.ts). ----
const W = await import('../app/game/map/world-map.ts');
const { ruinInputsFromWorld, RUIN_LANE } = await import('../app/game/apocalypse-inputs.ts');
const { liveTerrain } = await import('../app/game/map/terrain.ts');
const { SCENERY } = await import('../app/game/city.ts');
const worldInput = ruinInputsFromWorld();
const worldPlan = A.planRuins(worldInput);
const districtOf = (x, z) => W.sliceAt(x, z)?.key ?? null;
const VEHICLE = new Set(['car', 'carBurnt', 'moto', 'bus']);
/** Segments (x,z pairs and anything after) filed in 16 m cells: those near an area. */
function segIndex(list) {
  const cells = new Map();
  list.forEach((s, i) => {
    for (let x = Math.floor(Math.min(s[0], s[2]) / 16); x <= Math.floor(Math.max(s[0], s[2]) / 16); x++) for (let z = Math.floor(Math.min(s[1], s[3]) / 16); z <= Math.floor(Math.max(s[1], s[3]) / 16); z++) {
      const k = `${x},${z}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i);
    }
  });
  return (x0, z0, x1, z1) => {
    const out = new Set();
    for (let x = Math.floor(x0 / 16); x <= Math.floor(x1 / 16); x++) for (let z = Math.floor(z0 / 16); z <= Math.floor(z1 / 16); z++) for (const i of cells.get(`${x},${z}`) ?? []) out.add(i);
    return [...out].map((i) => list[i]);
  };
}
/** A plot's footprint with its axes (a district plot's oriented box; Math trig is fine in tests). */
const plotBox = (p) => (p.box ? box(p.box) : { cx: (p.minX + p.maxX) / 2, cz: (p.minZ + p.maxZ) / 2, hx: (p.maxX - p.minX) / 2, hz: (p.maxZ - p.minZ) / 2, c: 1, s: 0 });
const angleGap = (a, b) => Math.abs(((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

test('the wired city plans deterministically: twice, shuffled, structured-cloned (the worker), without engine trig, any chunk order', () => {
  assert.ok(W.SLICES.length >= 1, 'districts are wired');
  for (let k = 0; k < 64; k++) { assert.equal(A.FSIN[k * 64], A.SIN[k]); assert.equal(A.FCOS[k * 64], A.COS[k]); }
  const again = A.planRuins(ruinInputsFromWorld());
  assert.equal(again.hash, worldPlan.hash);
  assert.deepEqual(again.items, worldPlan.items);
  assert.deepEqual(again.colliders, worldPlan.colliders);
  assert.deepEqual(again.fleetSpots, worldPlan.fleetSpots);
  const r = rng(9);
  const mixed = Object.fromEntries(Object.entries(worldInput).map(([k, v]) => [k, Array.isArray(v) ? shuffled(v, r) : v]));
  const shuffledPlan = A.planRuins(mixed);
  assert.equal(shuffledPlan.hash, worldPlan.hash, 'a shuffled input plans the same ruins');
  assert.deepEqual(shuffledPlan.items, worldPlan.items);
  assert.equal(A.planRuins(structuredClone(worldInput)).hash, worldPlan.hash, 'what the worker receives plans the same');
  const saved = {};
  for (const f of ['sin', 'cos', 'exp', 'pow', 'hypot', 'atan2', 'tan', 'asin', 'acos', 'log']) { saved[f] = Math[f]; Math[f] = () => { throw new Error(`Math.${f} in planRuins`); }; }
  let stubbed;
  try { stubbed = A.planRuins(worldInput); } finally { Object.assign(Math, saved); }
  assert.equal(stubbed.hash, worldPlan.hash, 'no engine-dependent maths in the plan');
  const backward = A.createRuinPlanner(worldInput);
  for (const k of [...backward.keys()].reverse()) backward.chunk(k);
  assert.equal(backward.plan().hash, worldPlan.hash, 'chunk order never matters');
  console.log(`# wired city: ${worldPlan.items.length} items, ${worldPlan.colliders.length} colliders, ${worldPlan.chunks.size} chunks, ${worldPlan.stats.blockedEdges} full blocks, hash ${worldPlan.hash}`);
});

test('every wired district gets ruins in proportion to its size, today\'s map keeps its own', () => {
  const road = {}, plots = {}, tally = {};
  const add = (o, k, v = 1) => { if (k) o[k] = (o[k] ?? 0) + v; };
  for (const rd of worldInput.roads) for (let i = 2; i < rd.pts.length; i += 2) add(road, districtOf((rd.pts[i] + rd.pts[i - 2]) / 2, (rd.pts[i + 1] + rd.pts[i - 1]) / 2), Math.hypot(rd.pts[i] - rd.pts[i - 2], rd.pts[i + 1] - rd.pts[i - 1]) / 1000);
  for (const p of worldInput.plots) if (p.box) add(plots, districtOf(p.box.cx, p.box.cz));
  for (const it of worldPlan.items) {
    const d = districtOf(it.x, it.z);
    if (!d) continue;
    tally[d] ??= { wrecks: 0, colliders: 0, facades: 0, barricades: 0, road: 0, collapses: 0, trees: 0 };
    const t = tally[d];
    if (VEHICLE.has(it.kind)) t.wrecks++;
    if (it.collider >= 0) t.colliders++;
    if (it.kind === 'vine' || it.kind === 'moss' || it.kind === 'window' || it.kind === 'sign') t.facades++;
    if (it.kind === 'barricade' && (it.v & 3) === 0) t.barricades++;
    if (it.kind === 'crack' || it.kind === 'weeds' || it.kind === 'litter') t.road++;
    if (it.kind === 'breach') t.collapses++;
    if (it.kind === 'tree' || it.kind === 'pole') t.trees++;
  }
  const rows = W.SLICES.map((s) => ({ key: s.key, km: road[s.key], plots: plots[s.key], ...tally[s.key] }));
  console.log(`# per district: ${rows.map((r) => `${r.key} ${r.km.toFixed(1)} km, ${r.plots} plots: ${r.wrecks} wrecks, ${r.colliders} colliders, ${r.collapses} collapses, ${r.facades} facade, ${r.barricades} barricades, ${r.trees} trees/poles`).join(' | ')}`);
  const median = (f) => [...rows.map(f)].sort((a, b) => a - b)[rows.length >> 1];
  const wreckRate = median((r) => r.wrecks / r.km), colliderRate = median((r) => r.colliders / r.km), facadeRate = median((r) => r.facades / r.plots), roadRate = median((r) => r.road / r.km);
  for (const r of rows) {
    assert.ok(r.wrecks > 0 && r.colliders > 0 && r.facades > 0 && r.barricades > 0 && r.collapses > 0 && r.trees > 0, `${r.key} gets every kind of ruin`);
    for (const [label, value, mid] of [['wrecks per km', r.wrecks / r.km, wreckRate], ['colliders per km', r.colliders / r.km, colliderRate], ['facade ruins per plot', r.facades / r.plots, facadeRate], ['road strips per km', r.road / r.km, roadRate]])
      assert.ok(value >= mid * 0.5 && value <= mid * 2, `${r.key}: ${label} ${value.toFixed(2)} (the districts' median ${mid.toFixed(2)})`);
  }
  // Today's map still gets its ruins (the wired city's input keeps it whole).
  const today = worldPlan.items.filter((it) => it.x >= LAND.minX && it.x <= LAND.maxX && it.z >= LAND.minZ && it.z <= LAND.maxZ);
  assert.ok(today.filter((it) => VEHICLE.has(it.kind)).length >= plan.items.filter((it) => VEHICLE.has(it.kind)).length * 0.6, 'today\'s land keeps its wrecks');
  assert.ok(today.filter((it) => it.kind === 'breach').length >= 3);
});

test('KEEP buildings never collapse: landmarks, worship, markets, hospitals, police, story stamps, heritage', () => {
  const byId = new Map(worldInput.plots.map((p) => [p.id, p]));
  for (const s of W.DISTRICT_STAMPS) if (s.building >= 0) assert.equal(byId.get(s.building).keep, true, `stamp ${s.id} keeps`);
  for (const id of ['cho-ben-thanh', 'nha-tho-duc-ba', 'buu-dien-thanh-pho', 'dinh-doc-lap', 'ubnd-thanh-pho', 'lang-ong', 'chua-vinh-nghiem', 'benh-vien-binh-thanh', 'kho7'])
    assert.ok(W.DISTRICT_STAMPS.some((s) => s.id === id && byId.get(s.building)?.keep), `${id} keeps`);
  W.DISTRICT_PLOTS.forEach((p, i) => { if (['pagoda', 'church', 'market-hall', 'hospital', 'police'].includes(p.typology) || W.DISTRICT_BUILDINGS[i].kind === 'hospital') assert.equal(byId.get(p.id).keep, true, `${p.typology} ${p.id} keeps`); });
  // Every collapse is at a front corner of a plot that may collapse (a shared corner may also be a KEEP neighbour's).
  let checked = 0;
  for (const it of worldPlan.items) {
    if (it.kind !== 'breach') continue;
    const owners = worldInput.plots.filter((p) => {
      const b = plotBox(p), dx = it.x - b.cx, dz = it.z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (!p.box) return Math.abs(Math.abs(dx) - b.hx) < 0.05 && Math.abs(Math.abs(dz) - b.hz) < 0.05;
      return Math.abs(Math.abs(lx) - b.hx) < 0.05 && Math.abs(lz - b.hz) < 0.05 && angleGap(it.yaw, p.box.yaw) < 0.002;
    });
    assert.ok(owners.length > 0, `breach at ${it.x},${it.z} belongs to a plot`);
    assert.ok(owners.some((p) => !p.keep), `breach at ${it.x},${it.z} only on KEEP plots`);
    checked++;
  }
  assert.ok(checked > 20, `${checked} collapses checked`);
  // No district heap inside a KEEP building.
  const keepBoxes = worldInput.plots.filter((p) => p.keep && p.box).map(plotBox);
  for (const it of worldPlan.items) if (it.kind === 'rubble' && it.ext?.[2]) for (const b of keepBoxes) assert.ok(dist2(b, it.x, it.z) > 0, `rubble at ${it.x},${it.z} inside a KEEP building`);
});

test('no ruin on a keep-clear spot or on a walking line: doors, places, story sites and heritage entrances stay open', () => {
  const near = segIndex(worldInput.walks.map((w) => [w.ax, w.az, w.bx, w.bz]));
  const keep = worldInput.keepClear;
  const keepNear = segIndex(keep.map((k) => [k.x, k.z, k.x, k.z, k]));
  let checked = 0;
  for (const c of worldPlan.colliders) {
    const b = box(c), reach = Math.hypot(c.hx, c.hz) + 2;
    for (const [ax, az, bx, bz] of near(c.cx - reach, c.cz - reach, c.cx + reach, c.cz + reach)) {
      const d = segDist(b, ax, az, bx, bz);
      assert.ok(d >= 0.99, `${worldPlan.items[c.item].kind} collider at ${c.cx},${c.cz} is ${d.toFixed(2)} m from a walking leg`);
      checked++;
    }
    for (const s of keepNear(c.cx - reach - 13, c.cz - reach - 13, c.cx + reach + 13, c.cz + reach + 13)) {
      const k = s[4];
      assert.ok(Math.sqrt(dist2(b, k.x, k.z)) >= k.r - 0.02, `${worldPlan.items[c.item].kind} collider at ${c.cx},${c.cz} inside the keep-clear spot ${k.x},${k.z} (r ${k.r})`);
    }
  }
  assert.ok(checked > 1000, `${checked} collider-leg pairs checked`);
  // No wreck (walk-over ones included), heap, felled tree, tangle or tent on a keep-clear spot itself (1 m round it).
  for (const it of worldPlan.items) {
    if (!(VEHICLE.has(it.kind) && it.y === 0) && it.kind !== 'rubble' && it.kind !== 'tree' && it.kind !== 'tangle' && it.kind !== 'tent') continue;
    for (const s of keepNear(it.x - 13, it.z - 13, it.x + 13, it.z + 13)) {
      const k = s[4];
      assert.ok(Math.hypot(it.x - k.x, it.z - k.z) >= Math.min(k.r, 1.0), `${it.kind} at ${it.x},${it.z} on the keep-clear spot ${k.x},${k.z}`);
    }
  }
  // The doors players need and the heritage entrances keep a wide circle; the P1 story sites are kept clear.
  const doorOf = (id) => W.DISTRICT_DOORS.find((d) => d.building === W.DISTRICT_STAMPS.find((s) => s.id === id)?.building);
  let wide = 0;
  for (const id of ['benh-vien-binh-thanh', 'tram-y-te-thu-thiem', 'nha-tho-duc-ba', 'dinh-doc-lap', 'cho-ben-thanh', 'buu-dien-thanh-pho']) {
    const d = doorOf(id);
    if (!d) continue;
    assert.ok(keep.some((k) => k.major && Math.hypot(k.x - d.door.x, k.z - d.door.z) < 0.01 && k.r >= 6), `${id}'s door is kept wide open`);
    wide++;
  }
  assert.ok(wide >= 4, `${wide} wide doors`);
  assert.ok(keep.some((k) => Math.hypot(k.x - 580, k.z + 106) < 0.5), 'KHO 7 (a P1 story site) is kept clear');
});

test('a drive lane through every district and round every junction: the car graph whole, no ruin in the lanes', () => {
  const planner = A.createRuinPlanner(worldInput);
  const blocked = new Set(planner.blockedEdges()), edges = planner.traffic();
  const components = (skip) => {
    const parent = new Map(), find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
    for (const e of edges) { if (!parent.has(e.a)) parent.set(e.a, e.a); if (!parent.has(e.b)) parent.set(e.b, e.b); }
    for (const e of edges) if (!skip.has(e.id)) { const a = find(e.a), b = find(e.b); if (a !== b) parent.set(a, b); }
    return new Set([...parent.keys()].map(find)).size;
  };
  assert.equal(components(blocked), components(new Set()), 'blocking never disconnects the car graph');
  // Round every junction: at least two of its arms stay open.
  const arms = new Map(), shut = new Map();
  for (const e of edges) for (const n of [e.a, e.b]) { arms.set(n, (arms.get(n) ?? 0) + 1); if (blocked.has(e.id)) shut.set(n, (shut.get(n) ?? 0) + 1); }
  for (const [n, count] of arms) if (count >= 3) assert.ok(count - (shut.get(n) ?? 0) >= 2, `junction node ${n}: ${shut.get(n)} of ${count} arms blocked`);
  // Every traffic road not deliberately blocked keeps its lane: no ruin collider, no fleet wreck within RUIN_LANE / 2 of its centre line.
  const roads = new Map(worldInput.roads.map((r) => [r.id, r]));
  const boxes = [...worldPlan.colliders.map((c) => box(c)), ...worldPlan.fleetSpots.map((s) => box({ cx: s.x, cz: s.z, hx: s.kind === 'car' ? 1.3 : 0.6, hz: s.kind === 'car' ? 2.7 : 1.3, yaw: s.yaw }))];
  const cells = new Map();
  boxes.forEach((b, i) => { const e = Math.hypot(b.hx, b.hz) + 2; for (let x = Math.floor((b.cx - e) / 8); x <= Math.floor((b.cx + e) / 8); x++) for (let z = Math.floor((b.cz - e) / 8); z <= Math.floor((b.cz + e) / 8); z++) { const k = `${x},${z}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); } });
  const open = {};
  let samples = 0;
  for (const e of edges) {
    const r = roads.get(e.id);
    if (r.cls === 'hem' || blocked.has(e.id)) continue;
    for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], len = Math.hypot(r.pts[i] - ax, r.pts[i + 1] - az);
      for (let t = 0; t <= len; t += 0.5) {
        const x = ax + (r.pts[i] - ax) * (t / len), z = az + (r.pts[i + 1] - az) * (t / len);
        samples++;
        for (const j of cells.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? []) {
          const d = Math.sqrt(dist2(boxes[j], x, z));
          assert.ok(d >= RUIN_LANE / 2 - 0.05, `road ${r.id} (${districtOf(x, z) ?? 'today'}) is shut at ${x.toFixed(1)},${z.toFixed(1)}: a ${j < worldPlan.colliders.length ? worldPlan.items[worldPlan.colliders[j].item].kind : 'fleet wreck'} ${d.toFixed(2)} m from its centre line`);
        }
      }
      const d = districtOf((ax + r.pts[i]) / 2, (az + r.pts[i + 1]) / 2) ?? 'today';
      open[d] = (open[d] ?? 0) + len;
    }
  }
  for (const s of W.SLICES) assert.ok((open[s.key] ?? 0) > 500, `${s.key} has open traffic roads (${Math.round(open[s.key] ?? 0)} m)`);
  assert.ok(samples > 20000, `${samples} lane samples`);
  assert.ok(blocked.size >= 1 && worldPlan.items.some((it) => it.kind === 'bus') && worldPlan.clusters.length > 50, 'the boulevards still get full blocks, bus crashes and pile-ups');
});

test('rotated buildings: collapses, signs, windows, vines and moss follow the box; rubble stays within its footprint plus a margin', () => {
  const rotated = worldInput.plots.filter((p) => p.box && angleGap(p.box.yaw * 4, 0) > 0.01);
  assert.ok(rotated.length > 50, `${rotated.length} rotated plots`);
  const margin = A.RUBBLE_MARGIN + 0.3;
  let heaps = 0, onRotated = 0, aligned = 0;
  for (const it of worldPlan.items) {
    if (it.kind === 'rubble' && it.ext?.[2]) {
      // A district heap: its middle inside its building, its whole disc within the footprint plus the margin.
      const host = worldInput.plots.find((p) => p.box && dist2(box(p.box), it.x, it.z) === 0);
      assert.ok(host, `heap at ${it.x},${it.z} inside its building`);
      const b = box(host.box), dx = it.x - b.cx, dz = it.z - b.cz, lx = Math.abs(dx * b.c - dz * b.s), lz = Math.abs(dx * b.s + dz * b.c);
      assert.ok(lx + it.s <= b.hx + margin && lz + it.s <= b.hz + margin, `heap at ${it.x},${it.z} (s ${it.s}) reaches past its footprint + ${margin} m`);
      if (it.collider >= 0) {
        const c = worldPlan.colliders[it.collider], cb = box(c);
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x = cb.cx + cb.c * cb.hx * u + cb.s * cb.hz * v, z = cb.cz - cb.s * cb.hx * u + cb.c * cb.hz * v;
          assert.ok(Math.sqrt(dist2(b, x, z)) <= margin, `heap collider at ${c.cx},${c.cz} reaches past its footprint`);
        }
      }
      heaps++;
      if (rotated.includes(host)) onRotated++;
    }
    if (['breach', 'window', 'vine', 'moss', 'sign', 'patch'].includes(it.kind)) {
      // On a rotated plot's front: the item turns with the plot, to the fine step (π/2048).
      const host = rotated.find((p) => Math.sqrt(dist2(box(p.box), it.x, it.z)) < 1.2 && angleGap(it.yaw, p.box.yaw) < 0.01);
      if (host) { assert.ok(angleGap(it.yaw, host.box.yaw) <= Math.PI / 2048 + 1e-9, `${it.kind} at ${it.x},${it.z} off its wall by ${angleGap(it.yaw, host.box.yaw)}`); aligned++; }
    }
  }
  assert.ok(heaps > 20, `${heaps} district heaps`);
  assert.ok(onRotated > 0, 'a rotated building collapsed');
  assert.ok(aligned > 100, `${aligned} facade items aligned with rotated walls`);
  // Today's spilling heaps stay on today's land: no district building gets one.
  for (const it of worldPlan.items) if (it.kind === 'rubble' && !it.ext?.[2]) assert.ok(it.x >= LAND.minX - 6 && it.x <= LAND.maxX + 6 && it.z >= LAND.minZ - 6 && it.z <= LAND.maxZ + 6, `a spilling heap at ${it.x},${it.z} outside today's land`);
});

test('the wired city\'s ruins stand on land, leave LEGACY_HIDDEN scenery alone, stay in budget and leave no pocket', () => {
  // On land or a bridge: no collider or fleet wreck in the river or a canal.
  const T = liveTerrain();
  for (const c of worldPlan.colliders) assert.ok(T.landAt(c.cx, c.cz), `${worldPlan.items[c.item].kind} collider at ${c.cx},${c.cz} is not on land`);
  for (const s of worldPlan.fleetSpots) assert.ok(T.landAt(s.x, s.z), `fleet spot ${s.x},${s.z} is not on land`);
  // Today's scenery hidden under wired land feeds nothing.
  const hiddenTrees = new Set([...W.LEGACY_HIDDEN.trees].map((i) => `${SCENERY.trees[i].x},${SCENERY.trees[i].z}`));
  assert.equal(worldInput.trees.filter((t) => hiddenTrees.has(`${t.x},${t.z}`)).length, 0, 'no hidden tree falls');
  assert.equal(worldInput.trees.length, SCENERY.trees.length - W.LEGACY_HIDDEN.trees.size + W.DISTRICT_SCENERY.trees.length);
  assert.equal(worldInput.poles.length, SCENERY.poles.length - W.LEGACY_HIDDEN.poles.size + W.DISTRICT_SCENERY.poles.length);
  // Chunks: items within the id space, triangles in budget at High and Low.
  let most = 0, mostLow = 0;
  for (const [key, list] of worldPlan.chunks) {
    assert.ok(list.length < 4096, `chunk ${key}: ${list.length} items`);
    const hi = A.buildChunkGeometry(worldPlan, key, groundHeight, 0), lo = A.buildChunkGeometry(worldPlan, key, groundHeight, 4);
    most = Math.max(most, hi.triangles); mostLow = Math.max(mostLow, lo.triangles);
    assert.ok(hi.triangles <= A.CHUNK_TRIS.high && lo.triangles <= A.CHUNK_TRIS.low, `chunk ${key}: ${hi.triangles} / ${lo.triangles} triangles`);
    hi.geometry.dispose(); lo.geometry.dispose();
  }
  console.log(`# wired city: biggest chunk ${most} triangles at High, ${mostLow} at Low`);
  assert.deepEqual(A.findPockets(worldPlan, worldInput), []);
  // Planning stays a worker's job of well under a second.
  const times = [];
  for (let i = 0; i < 3; i++) { const t = performance.now(); A.planRuins(worldInput); times.push(performance.now() - t); }
  const best = Math.min(...times);
  console.log(`# planRuins wired city: best ${best.toFixed(0)} ms of ${times.length}`);
  assert.ok(best <= (process.env.PVO_PERF_STRICT ? 600 : 1500), `planning the wired city took ${best.toFixed(0)} ms`);
});

test('the wired city\'s ruins stream: chunks build a few ms at a time into a few pages (a draw call each), far ones are dropped, all freed', () => {
  const index = createCollisionIndex();
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#000000', 48, 169);                  // zombie mode's fog: the ruins draw to 189 m
  const apo = A.createApocalypse(scene, index, { ground: groundHeight });
  apo.setEnabled(true, worldPlan);
  assert.equal(apo.stats().colliders, worldPlan.colliders.length);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 900);
  let t = 0, worst = 0, steps = 0;
  const run = (x, z, yaw, frames) => {
    for (let i = 0; i < frames; i++) {
      camera.position.set(x - Math.sin(yaw) * 14, 7, z - Math.cos(yaw) * 14); camera.lookAt(x, 1, z); camera.updateMatrixWorld();
      const s = performance.now(); apo.update(camera, x, z, t += 1 / 60); const ms = performance.now() - s;
      worst = Math.max(worst, ms); steps++;
    }
  };
  const pages = () => apo.group.children.filter((o) => o.name === 'Ruin chunks').length;
  // Standing still, the chunks round the player settle: none is dropped for another one and built again.
  const setGeometryAt = THREE.BatchedMesh.prototype.setGeometryAt;
  let stores = 0;
  THREE.BatchedMesh.prototype.setGeometryAt = function (...a) { stores++; return setGeometryAt.apply(this, a); };
  const settled = (x, z, yaw, where) => { const before = stores; run(x, z, yaw, 300); assert.equal(stores, before, `${where}: chunks built again while standing still`); };
  try {
    run(545, 4, -Math.PI / 2, 500);                                  // Vĩnh Khánh, Quận 4
    settled(545, 4, -Math.PI / 2, 'Vĩnh Khánh');
    const near = apo.stats(), nearPages = pages();
    assert.ok(near.chunks >= 6 && near.drawn >= 2 && near.drawn < near.chunks, `${near.chunks} built, ${near.drawn} drawn (each culled on its own)`);
    assert.ok(nearPages >= 1 && nearPages <= 3 && near.calls <= nearPages + 1 && near.drawn >= near.calls, `${near.calls} draw calls for ${near.drawn} chunks in ${nearPages} pages (and the wrecks)`);
    run(-405, 14, Math.PI / 2, 700);                                 // Hàng Xanh, Bình Thạnh
    settled(-405, 14, Math.PI / 2, 'Hàng Xanh');
    run(-250, -262, 0, 700);                                         // the Thủ Thiêm riverside park
    settled(-250, -262, 0, 'Thủ Thiêm');
    const far = apo.stats(), farPages = pages();
    assert.ok(far.chunks <= 30 && far.drawn >= 1 && farPages <= 4 && far.calls <= farPages + 1, `after crossing the city: ${far.chunks} built, ${far.drawn} drawn, ${far.calls} calls, ${farPages} pages`);
    console.log(`# ruin streaming: ${steps} updates, the slowest ${worst.toFixed(1)} ms; Vĩnh Khánh ${near.drawn}/${near.chunks} chunks drawn in ${near.calls} calls (${nearPages} pages), ${near.triangles} triangles; after crossing the city ${farPages} pages, ${stores} chunks built in all`);
  } finally { THREE.BatchedMesh.prototype.setGeometryAt = setGeometryAt; }
  assert.ok(worst < 50, `the slowest ruin update took ${worst.toFixed(1)} ms`);
  apo.setEnabled(false);
  assert.equal(apo.stats().colliders, 0);
  apo.dispose();
  assert.equal(scene.children.length, 0);
});

test('the worker round trip (ruin-pack.ts) moves the wired city\'s input and plan unchanged: the same ruins, the same hash', async () => {
  const K = await import('../app/game/ruin-pack.ts');
  const packed = K.packInput(worldInput);
  const moved = structuredClone(packed, { transfer: K.inputTransfer(packed) });
  assert.equal(packed.roads.data.length, 0, 'the input buffers are moved, not copied');
  const input2 = K.unpackInput(moved);
  const plan2 = A.planRuins(input2);
  assert.equal(plan2.hash, worldPlan.hash, 'the worker plans the same ruins');
  assert.deepEqual(plan2.items, worldPlan.items);
  const out = K.packPlan(plan2);
  const back = K.unpackPlan(structuredClone(out, { transfer: K.planTransfer(out) }));
  assert.deepEqual(back, plan2, 'the plan the main thread gets is the plan made');
  // Today's input (no oriented boxes, no land, no lane) round-trips too.
  const city = K.unpackInput(structuredClone(K.packInput(input)));
  assert.equal(A.planRuins(city).hash, plan.hash);
});
