// node --experimental-transform-types --test scripts/collision.test.mjs
// The collision index (app/game/map/collision.ts) against the linear scans it replaced in game.ts: worldClear,
// wallDistance, lineOfSight, airBlocked and roofUnder must give identical answers on the real world solids (city.ts
// COLLIDERS plus the signal poles world.ts appends), and every query must equal a brute-force scan on synthetic
// AABB/OBB solids with height ranges, negative coordinates, cell borders, wide solids and removals. Prints timings.
// signals.ts imports './city' without an extension (Vite style), so a resolve hook retries such specifiers as .ts.
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
const { COLLIDERS, PLOTS, LAND, inRect } = await import('../app/game/city.ts');
const { APPROACHES } = await import('../app/game/signals.ts');
const { createCollisionIndex, OWNER } = await import('../app/game/map/collision.ts');

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const us = (ms, n) => ((ms * 1000) / n).toFixed(3);
const time = (fn) => { const t = performance.now(); fn(); return performance.now() - t; };

// ---- The world exactly as game.ts sees it: world.colliders = copies of COLLIDERS, then one pole per approach. ----
const colliders = COLLIDERS.map((c) => ({ ...c }));
for (const a of APPROACHES) colliders.push({ minX: a.pole.x - 0.17, maxX: a.pole.x + 0.17, minZ: a.pole.z - 0.17, maxZ: a.pole.z + 0.17 });

// ---- Frozen copies of the game.ts functions before the port (verbatim, vectors as plain objects). ----
function oldWorldClear(x, z, radius) {
  if (!inRect(LAND, x, z, radius)) return false;
  for (const collider of colliders) {
    const nearX = Math.max(collider.minX, Math.min(collider.maxX, x));
    const nearZ = Math.max(collider.minZ, Math.min(collider.maxZ, z));
    if ((x - nearX) ** 2 + (z - nearZ) ** 2 < radius * radius) return false;
  }
  return true;
}
function oldWallDistance(origin, dir, maxT) {
  let best = maxT;
  for (const c of colliders) {
    let enter = 0, exit = best;
    for (const [o, d, min, max] of [[origin.x, dir.x, c.minX, c.maxX], [origin.z, dir.z, c.minZ, c.maxZ]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < min || o > max) { enter = Infinity; break; }
        continue;
      }
      let t1 = (min - o) / d, t2 = (max - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      enter = Math.max(enter, t1);
      exit = Math.min(exit, t2);
    }
    if (enter <= exit && enter > 0 && enter < best) best = enter;
  }
  return best;
}
function oldLineOfSight(x1, z1, x2, z2) {
  const d = Math.hypot(x2 - x1, z2 - z1);
  if (d < 0.01) return true;
  return oldWallDistance({ x: x1, y: 1.2, z: z1 }, { x: (x2 - x1) / d, y: 0, z: (z2 - z1) / d }, d) >= d - 0.05;
}
function oldAirBlocked(x, z, y) {
  for (const p of PLOTS) if (p.h > y - 0.4 && inRect(p.full, x, z, -0.6)) return true;
  return y < 8 && !oldWorldClear(x, z, 0.4);
}
function oldRoofUnder(x, z, y) {
  let roof = 0;
  for (const p of PLOTS) if (p.h <= y + 0.5 && p.h > roof && inRect(p.full, x, z, -0.3)) roof = p.h;
  return roof;
}

// ---- The ported functions, line for line as game.ts now has them. ----
const solids = createCollisionIndex();
for (const c of colliders) solids.add(c.minX, c.minZ, c.maxX, c.maxZ, -Infinity, Infinity, OWNER.legacy, c);
const roofs = createCollisionIndex();
for (const p of PLOTS) roofs.add(p.full.minX, p.full.minZ, p.full.maxX, p.full.maxZ, 0, p.h, OWNER.roof, p);
const roofHits = [];
function worldClear(x, z, radius) {
  return inRect(LAND, x, z, radius) && solids.clear(x, z, radius);
}
function wallDistance(origin, dir, maxT) {
  return solids.cast(origin.x, origin.z, dir.x, dir.z, maxT, origin.y, dir.y);
}
function lineOfSight(x1, z1, x2, z2) {
  const d = Math.hypot(x2 - x1, z2 - z1);
  if (d < 0.01) return true;
  return solids.cast(x1, z1, (x2 - x1) / d, (z2 - z1) / d, d, 1.2, 0) >= d - 0.05;
}
function airBlocked(x, z, y) {
  for (let i = 0, n = roofs.containing(x, z, 0.6, roofHits); i < n; i++) if (roofs.top(roofHits[i]) > y - 0.4) return true;
  return y < 8 && !worldClear(x, z, 0.4);
}
function roofUnder(x, z, y) {
  let roof = 0;
  for (let i = 0, n = roofs.containing(x, z, 0.3, roofHits); i < n; i++) {
    const h = roofs.top(roofHits[i]);
    if (h <= y + 0.5 && h > roof) roof = h;
  }
  return roof;
}

// ---- Sample generators that favour the hard cases: collider edges and corners, cell borders, exact radii. ----
const CELL = solids.cell;
function pointNear(rand, rects, r) {
  const k = rand();
  if (k < 0.3) return [LAND.minX - 12 + rand() * (LAND.maxX - LAND.minX + 24), LAND.minZ - 12 + rand() * (LAND.maxZ - LAND.minZ + 24)];
  const c = rects[Math.floor(rand() * rects.length)];
  const ex = [c.minX, c.maxX][rand() < 0.5 ? 0 : 1], ez = [c.minZ, c.maxZ][rand() < 0.5 ? 0 : 1];
  const ux = c.minX + rand() * (c.maxX - c.minX), uz = c.minZ + rand() * (c.maxZ - c.minZ);
  if (k < 0.45) return rand() < 0.5 ? [ex + (rand() < 0.5 ? r : -r), uz] : [ux, ez + (rand() < 0.5 ? r : -r)]; // exactly r off a face
  if (k < 0.55) return [ex, ez]; // a corner
  if (k < 0.62) { const a = rand() * Math.PI * 2; return [ex + Math.cos(a) * r, ez + Math.sin(a) * r]; } // r off a corner (rounded)
  if (k < 0.7) return rand() < 0.5 ? [ex, uz] : [ux, ez]; // on a face
  if (k < 0.8) return [Math.round(ux / CELL) * CELL + (rand() < 0.3 ? 0 : (rand() - 0.5) * 2 * r), Math.round(uz / CELL) * CELL]; // cell borders
  return [ux + (rand() - 0.5) * 6, uz + (rand() - 0.5) * 6];
}
const RADII = [0.3, 0.35, 0.4, 0.45, 0.5, 0.65, 1.0, 1.05, 1.2, 2.2, 2.6, 2.8, 3];
const HEIGHTS = [undefined, NaN, -3, 0, 1.2, 2.9, 40];
const clearSamples = (() => {
  const rand = rng(5150), out = [];
  for (let i = 0; i < 200000; i++) {
    const r = rand() < 0.5 ? 0.3 + rand() * 0.9 : RADII[Math.floor(rand() * RADII.length)];
    const [x, z] = pointNear(rand, colliders, r);
    out.push([x, z, r, HEIGHTS[i % HEIGHTS.length]]);
  }
  return out;
})();
const raySamples = (() => {
  const rand = rng(9001), out = [];
  for (let i = 0; i < 100000; i++) {
    const [x, z] = pointNear(rand, colliders, rand() * 2);
    const k = rand();
    let dx, dy, dz;
    if (k < 0.55) { const a = rand() * Math.PI * 2, e = (rand() - 0.5) * 0.4; dx = Math.cos(a) * Math.cos(e); dz = Math.sin(a) * Math.cos(e); dy = Math.sin(e); } // a bullet
    else if (k < 0.7) { const axis = Math.floor(rand() * 4); dx = [1, -1, 0, 0][axis]; dz = [0, 0, 1, -1][axis]; dy = 0; } // along a street
    else if (k < 0.78) { dx = (rand() - 0.5) * 3e-9; dz = rand() < 0.5 ? 1 : -1; dy = 0; } // the 1e-9 parallel threshold
    else if (k < 0.84) { const s = rand() < 0.5 ? 1 : -1; dx = s * Math.SQRT1_2; dz = (rand() < 0.5 ? 1 : -1) * Math.SQRT1_2; dy = 0; } // diagonals through cell corners
    else if (k < 0.88) { dx = 0; dz = 0; dy = -1; } // straight down
    else { const a = rand() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); dy = 0; }
    const maxT = k > 0.97 ? Infinity : rand() < 0.1 ? rand() * 2 : rand() * 260;
    out.push([{ x, y: 1.2 + rand() * 30, z }, { x: dx, y: dy, z: dz }, maxT]);
  }
  return out;
})();

test('hash shape over the real world solids', () => {
  const s = solids.stats();
  console.log(`# ${colliders.length} world solids (${COLLIDERS.length} city + ${colliders.length - COLLIDERS.length} poles), ${PLOTS.length} roofs; ` +
    `${s.cells} cells of ${CELL} m, ${s.refs} cell refs, at most ${s.most} per cell, ${s.wide} wide`);
  assert.equal(s.solids, colliders.length);
  assert.equal(roofs.size, PLOTS.length);
});

test('worldClear: index equals the linear scan on 2e5 points (edges, corners, cell borders, heights)', () => {
  let want, got, blocked = 0;
  const before = time(() => { want = clearSamples.map(([x, z, r]) => oldWorldClear(x, z, r)); });
  const after = time(() => { got = clearSamples.map(([x, z, r]) => worldClear(x, z, r)); });
  clearSamples.forEach(([x, z, r, y], i) => {
    if (want[i] === false && inRect(LAND, x, z, r)) blocked++;
    assert.equal(got[i], want[i], `worldClear(${x}, ${z}, ${r})`);
    // The legacy solids are infinitely tall, so a height changes nothing.
    assert.equal(inRect(LAND, x, z, r) && solids.clear(x, z, r, y), want[i], `clear(${x}, ${z}, ${r}, ${y})`);
  });
  assert.ok(blocked > 40000, `enough blocked samples (${blocked})`);
  console.log(`# worldClear: ${us(before, clearSamples.length)} µs linear -> ${us(after, clearSamples.length)} µs indexed per call`);
});

/**
 * The old wallDistance without its per-collider array allocations (same operations in the same order), so 1e5 rays
 * run in seconds; the verbatim copy is checked against it on every tenth ray and timed on those.
 */
function scanWallDistance(origin, dir, maxT) {
  let best = maxT;
  const ox = origin.x, oz = origin.z, dx = dir.x, dz = dir.z;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    let enter = 0, exit = best;
    if (Math.abs(dx) < 1e-9) { if (ox < c.minX || ox > c.maxX) continue; } else {
      let t1 = (c.minX - ox) / dx, t2 = (c.maxX - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      enter = Math.max(enter, t1);
      exit = Math.min(exit, t2);
    }
    if (Math.abs(dz) < 1e-9) { if (oz < c.minZ || oz > c.maxZ) continue; } else {
      let t1 = (c.minZ - oz) / dz, t2 = (c.maxZ - oz) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      enter = Math.max(enter, t1);
      exit = Math.min(exit, t2);
    }
    if (enter <= exit && enter > 0 && enter < best) best = enter;
  }
  return best;
}
const scanLineOfSight = (x1, z1, x2, z2) => {
  const d = Math.hypot(x2 - x1, z2 - z1);
  if (d < 0.01) return true;
  return scanWallDistance({ x: x1, y: 1.2, z: z1 }, { x: (x2 - x1) / d, y: 0, z: (z2 - z1) / d }, d) >= d - 0.05;
};

test('wallDistance: DDA raycast equals the slab scan on 1e5 rays', () => {
  let want, got, old, hits = 0;
  const verbatim = raySamples.filter((_, i) => i % 10 === 0);
  const before = time(() => { old = verbatim.map(([o, d, maxT]) => oldWallDistance(o, d, maxT)); });
  const scan = time(() => { want = raySamples.map(([o, d, maxT]) => scanWallDistance(o, d, maxT)); });
  const after = time(() => { got = raySamples.map(([o, d, maxT]) => wallDistance(o, d, maxT)); });
  old.forEach((t, i) => assert.ok(Object.is(want[i * 10], t), 'the scan copy is faithful'));
  raySamples.forEach(([o, d, maxT], i) => {
    if (want[i] < maxT) hits++;
    assert.ok(Object.is(got[i], want[i]), `wallDistance(${JSON.stringify(o)}, ${JSON.stringify(d)}, ${maxT}) = ${got[i]}, want ${want[i]}`);
  });
  assert.ok(hits > 30000, `enough hits (${hits})`);
  console.log(`# wallDistance: ${us(before, verbatim.length)} µs old code (${us(scan, raySamples.length)} µs without its allocations) -> ${us(after, raySamples.length)} µs indexed per ray`);
});

test('lineOfSight, airBlocked and roofUnder match on 1e5 samples each', () => {
  const rand = rng(77);
  let seen = 0, blockedAir = 0, roofed = 0;
  const pairs = [];
  for (let i = 0; i < 100000; i++) {
    const [x1, z1] = pointNear(rand, colliders, 0.5);
    const a = rand() * Math.PI * 2, len = rand() < 0.05 ? rand() * 0.02 : rand() * 70;
    const x2 = rand() < 0.1 ? Math.round(x1 / 54) * 54 : x1 + Math.cos(a) * len, z2 = z1 + Math.sin(a) * len;
    pairs.push([x1, z1, x2, z2]);
    const want = i % 20 ? scanLineOfSight(x1, z1, x2, z2) : oldLineOfSight(x1, z1, x2, z2);
    if (want) seen++;
    assert.equal(lineOfSight(x1, z1, x2, z2), want, `lineOfSight(${x1}, ${z1}, ${x2}, ${z2})`);
  }
  const fulls = PLOTS.map((p) => p.full), air = [];
  for (let i = 0; i < 100000; i++) {
    const [x, z] = pointNear(rand, fulls, rand() < 0.5 ? 0.6 : 0.3);
    const p = PLOTS[Math.floor(rand() * PLOTS.length)];
    const y = rand() < 0.4 ? [p.h + 0.4, p.h - 0.5, p.h, 8, 0][Math.floor(rand() * 5)] : rand() * 220;
    air.push([x, z, y]);
    const a = oldAirBlocked(x, z, y), r = oldRoofUnder(x, z, y);
    if (a) blockedAir++;
    if (r > 0) roofed++;
    assert.equal(airBlocked(x, z, y), a, `airBlocked(${x}, ${z}, ${y})`);
    assert.equal(roofUnder(x, z, y), r, `roofUnder(${x}, ${z}, ${y})`);
  }
  assert.ok(seen > 20000 && seen < 95000 && blockedAir > 10000 && roofed > 10000, `mixed samples (${seen} seen, ${blockedAir} blocked, ${roofed} roofed)`);
  const few = pairs.slice(0, 2000);
  const t = [
    time(() => { for (const [a, b, c, d] of few) oldLineOfSight(a, b, c, d); }), time(() => { for (const [a, b, c, d] of pairs) lineOfSight(a, b, c, d); }),
    time(() => { for (const [x, z, y] of air) { oldAirBlocked(x, z, y); oldRoofUnder(x, z, y); } }), time(() => { for (const [x, z, y] of air) { airBlocked(x, z, y); roofUnder(x, z, y); } }),
  ];
  console.log(`# lineOfSight: ${us(t[0], few.length)} -> ${us(t[1], pairs.length)} µs; airBlocked+roofUnder: ${us(t[2], air.length)} -> ${us(t[3], air.length)} µs`);
});

// ---- Synthetic solids against brute force: oriented boxes, height ranges, removals, far and negative cells. ----
function makeSolid(rand, i) {
  const k = rand();
  const x = (rand() - 0.6) * 400, z = (rand() - 0.4) * 400;
  const snap = (v) => (rand() < 0.3 ? Math.round(v / 16) * 16 : v); // edges right on cell borders
  const bottom = rand() < 0.4 ? -Infinity : rand() * 6, top = rand() < 0.4 ? Infinity : (Number.isFinite(bottom) ? bottom : 0) + 0.5 + rand() * 12;
  if (k < 0.5) {
    const w = rand() < 0.1 ? 20 + rand() * 60 : 0.2 + rand() * 10, d = rand() < 0.1 ? 20 + rand() * 60 : 0.2 + rand() * 10;
    const x0 = snap(x), z0 = snap(z);
    return { obb: false, x0, z0, x1: x0 + w, z1: z0 + d, bottom, top, owner: i % 5 };
  }
  if (k < 0.52) return { obb: false, x0: x - 900, z0: z - 3, x1: x + 900, z1: z + 3, bottom, top, owner: i % 5 }; // a wide solid
  return { obb: true, x: snap(x), z: snap(z), hx: 0.2 + rand() * 6, hz: 0.2 + rand() * 6, yaw: rand() < 0.2 ? 0 : (rand() - 0.5) * 7, bottom, top, owner: i % 5 };
}
/** Exact reference geometry, computed differently from the index: corner polygons for oriented boxes. */
function corners(s) {
  if (!s.obb) return [[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]];
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), r = [c, -sn], f = [sn, c];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [s.x + r[0] * s.hx * a + f[0] * s.hz * b, s.z + r[1] * s.hx * a + f[1] * s.hz * b]);
}
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
function polyDistance(poly, x, z) {
  let inside = true, best = Infinity;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % 4];
    if ((bx - ax) * (z - az) - (bz - az) * (x - ax) < 0) inside = false;
    best = Math.min(best, segDist(x, z, ax, az, bx, bz));
  }
  return inside ? -best : best;
}
const present = (s, y) => y === undefined || Number.isNaN(y) || (y >= s.bottom && y < s.top);

test('synthetic AABB/OBB solids: clear, overlaps, query, containing and cast equal brute force, with removals', () => {
  const rand = rng(424242);
  const index = createCollisionIndex();
  const list = [];
  const place = (s) => {
    s.id = s.obb ? index.addBox(s.x, s.z, s.hx, s.hz, s.yaw, s.bottom, s.top, s.owner, s) : index.add(s.x0, s.z0, s.x1, s.z1, s.bottom, s.top, s.owner, s);
    s.poly = corners(s);
    s.bx0 = Math.min(...s.poly.map((p) => p[0])); s.bx1 = Math.max(...s.poly.map((p) => p[0]));
    s.bz0 = Math.min(...s.poly.map((p) => p[1])); s.bz1 = Math.max(...s.poly.map((p) => p[1]));
    if (s.obb) { s.grown05 = corners({ ...s, hx: s.hx + 0.05, hz: s.hz + 0.05 }); s.grown3 = corners({ ...s, hx: s.hx + 0.3, hz: s.hz + 0.3 }); }
    list.push(s);
  };
  for (let i = 0; i < 2500; i++) place(makeSolid(rand, i));
  // Removals: one by id, and everything of one owner; then more solids reuse the freed ids.
  for (let i = 0; i < 300; i++) { const s = list.splice(Math.floor(rand() * list.length), 1)[0]; assert.ok(index.remove(s.id)); assert.ok(!index.remove(s.id)); }
  const owned = list.filter((s) => s.owner === 3).length;
  assert.equal(index.removeOwner(3), owned);
  for (let i = list.length - 1; i >= 0; i--) if (list[i].owner === 3) list.splice(i, 1);
  for (let i = 0; i < 400; i++) place(makeSolid(rand, i * 5 + 1));
  // Far away (cell keys wrap every 65536 cells, about 1049 km) and around the origin's negative cells.
  for (const [x, z] of [[16 * 65536 + 3, 5], [-16 * 65536 + 3, -16 * 65536 + 5], [-16, -16], [-0.0001, -16.0001]]) {
    place({ obb: false, x0: x, z0: z, x1: x + 2, z1: z + 2, bottom: -Infinity, top: Infinity, owner: 9 });
  }
  assert.equal(index.size, list.length);
  for (const s of list) assert.equal(index.ref(s.id), s);
  const out = [];
  let checked = 0, nearEdge = 0;
  for (let i = 0; i < 30000; i++) {
    const s = list[Math.floor(rand() * list.length)];
    const [cx, cz] = s.poly[Math.floor(rand() * 4)];
    let x = cx + (rand() - 0.5) * 4, z = cz + (rand() - 0.5) * 4;
    if (rand() < 0.2) x = Math.round(x / 16) * 16;
    if (rand() < 0.2) z = Math.round(z / 16) * 16;
    const r = 0.05 + rand() * 3, y = HEIGHTS[i % HEIGHTS.length];
    const near = list.filter((t) => t.bx1 > x - r * 3 - 1 && t.bx0 < x + r * 3 + 1 && t.bz1 > z - r * 2 - 1 && t.bz0 < z + r * 2 + 1);
    // clear(): the scan's arithmetic for AABBs (exact), polygon distance for OBBs away from their boundary.
    let want = true, unsure = false;
    for (const t of near) {
      if (!present(t, y)) continue;
      if (!t.obb) {
        const nx = Math.max(t.x0, Math.min(t.x1, x)), nz = Math.max(t.z0, Math.min(t.z1, z));
        if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) want = false;
      } else {
        const d = polyDistance(t.poly, x, z);
        if (Math.abs(d - r) < 1e-9) unsure = true;
        else if (d < r) want = false;
      }
    }
    if (unsure && want) { nearEdge++; continue; }
    assert.equal(index.clear(x, z, r, y), want, `clear(${x}, ${z}, ${r}, ${y})`);
    // query(): bounding boxes overlapping the open box, each solid once.
    const qx0 = x - r * 3, qz0 = z - r * 2, qx1 = x + r * 3, qz1 = z + r * 2;
    const n = index.query(qx0, qz0, qx1, qz1, out), got = out.slice(0, n);
    const ref = near.filter((t) => t.bx1 > qx0 + 1e-9 && t.bx0 < qx1 - 1e-9 && t.bz1 > qz0 + 1e-9 && t.bz0 < qz1 - 1e-9);
    for (const t of ref) assert.ok(got.includes(t.id), `query misses ${t.id}`);
    for (const id of got) { const t = index.ref(id); assert.ok(t.bx1 >= qx0 - 1e-9 && t.bx0 <= qx1 + 1e-9 && t.bz1 >= qz0 - 1e-9 && t.bz0 <= qz1 + 1e-9, `query reports far solid ${id}`); }
    assert.equal(new Set(got).size, got.length, 'query reports a solid twice');
    // overlaps(): exact box test (separating axes for OBBs), skipping touching cases.
    let over = false, close = false;
    const qpoly = [[qx0, qz0], [qx1, qz0], [qx1, qz1], [qx0, qz1]];
    for (const t of near) {
      if (!present(t, y)) continue;
      if (!t.obb) { if (qx1 > t.x0 - 0.05 && qx0 < t.x1 + 0.05 && qz1 > t.z0 - 0.05 && qz0 < t.z1 + 0.05) over = true; continue; }
      if (!(t.bx1 + 0.08 > qx0 && t.bx0 - 0.08 < qx1 && t.bz1 + 0.08 > qz0 && t.bz0 - 0.08 < qz1)) continue;
      let separated = false, margin = Infinity;
      for (const poly of [t.grown05, qpoly]) for (let e = 0; e < 4; e++) {
        const [ax, az] = poly[e], [bx, bz] = poly[(e + 1) % 4], nx = bz - az, nz = ax - bx, l = Math.hypot(nx, nz);
        const pa = t.grown05.map(([px, pz]) => (px * nx + pz * nz) / l), pb = qpoly.map(([px, pz]) => (px * nx + pz * nz) / l);
        const gap = Math.max(Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
        margin = Math.min(margin, Math.abs(gap));
        if (gap >= 0) separated = true;
      }
      if (margin < 1e-7) close = true;
      if (!separated) over = true;
    }
    if (!(close && !over)) assert.equal(index.overlaps(qx0, qz0, qx1, qz1, 0.05, y), over, `overlaps(${qx0}, ${qz0}, ${qx1}, ${qz1})`);
    // containing(): inRect(-pad) for AABBs; polygon test for OBBs (points on a grown edge skipped).
    const m = index.containing(x, z, 0.3, out), inside = out.slice(0, m);
    for (const t of near) {
      const want = t.obb ? polyDistance(t.grown3, x, z) : x >= t.x0 - 0.3 && x <= t.x1 + 0.3 && z >= t.z0 - 0.3 && z <= t.z1 + 0.3 ? -1 : 1;
      if (Math.abs(want) > 1e-9) assert.equal(inside.includes(t.id), want < 0, `containing(${x}, ${z}) and ${t.id}`);
    }
    assert.equal(new Set(inside).size, inside.length, 'containing reports a solid twice');
    checked++;
  }
  assert.ok(checked > 27000, `checked ${checked} (${nearEdge} on an OBB boundary skipped)`);
  // cast(): brute force with the same per-solid slab rule (AABB) and polygon edges (OBB), compared within 1e-9.
  let rays = 0, rayHits = 0;
  for (let i = 0; i < 10000; i++) {
    const s = list[Math.floor(rand() * list.length)];
    const [px, pz] = s.poly[Math.floor(rand() * 4)];
    const ox = px + (rand() - 0.5) * 30, oz = pz + (rand() - 0.5) * 30, a = rand() * Math.PI * 2;
    const axis = rand() < 0.2;
    const dx = axis ? Math.round(Math.cos(a)) : Math.cos(a), dz = axis ? (dx ? 0 : Math.sign(Math.sin(a)) || 1) : Math.sin(a);
    const oy = rand() < 0.3 ? NaN : rand() * 10, dy = rand() < 0.5 ? 0 : (rand() - 0.5) * 0.5, maxT = rand() < 0.01 ? Infinity : rand() * 120;
    let want = maxT, unsure = false;
    const ex = ox + dx * Math.min(maxT, 1e4), ez = oz + dz * Math.min(maxT, 1e4);
    for (const t of list) {
      if (maxT < 1e4 && (t.bx1 < Math.min(ox, ex) - 1 || t.bx0 > Math.max(ox, ex) + 1 || t.bz1 < Math.min(oz, ez) - 1 || t.bz0 > Math.max(oz, ez) + 1)) continue;
      const e = refEnter(t, ox, oz, dx, dz, oy, dy, maxT);
      if (e.unsure) unsure = true;
      if (e.t < want) want = e.t;
    }
    if (unsure) continue;
    const got = index.cast(ox, oz, dx, dz, maxT, oy, dy);
    if (want < maxT) rayHits++;
    assert.ok(got === want || Math.abs(got - want) < 1e-9, `cast(${ox}, ${oz}, ${dx}, ${dz}, ${maxT}, ${oy}, ${dy}) = ${got}, want ${want}`);
    rays++;
  }
  assert.ok(rays > 7000 && rayHits > 1500, `rays ${rays}, hits ${rayHits}`);
});

/** Reference ray entry: closed slabs; an OBB through its polygon edges in world space. */
function refEnter(t, ox, oz, dx, dz, oy, dy, maxT) {
  let enter = 0, exit = maxT;
  if (!Number.isNaN(oy) && (t.bottom > -Infinity || t.top < Infinity)) {
    if (Math.abs(dy) < 1e-9) { if (oy < t.bottom || oy > t.top) return { t: Infinity }; } else {
      const a = (t.bottom - oy) / dy, b = (t.top - oy) / dy;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    }
  }
  if (!t.obb) {
    for (const [o, d, lo, hi] of [[ox, dx, t.x0, t.x1], [oz, dz, t.z0, t.z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return { t: Infinity }; continue; }
      const a = (lo - o) / d, b = (hi - o) / d;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    }
    return { t: enter <= exit && enter > 0 && enter < maxT ? enter : Infinity };
  }
  // Interval of the ray inside the convex polygon (half-plane clipping), then the same rule.
  let lo = -Infinity, hi = Infinity, unsure = false;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = t.poly[i], [bx, bz] = t.poly[(i + 1) % 4], nx = bz - az, nz = ax - bx; // outward normal for CCW
    const num = (ax - ox) * nx + (az - oz) * nz, den = dx * nx + dz * nz;
    if (Math.abs(den) < 1e-6) { if (Math.abs(num) < 1e-6) unsure = true; if (num < 0) return { t: Infinity, unsure }; continue; }
    const s = num / den;
    if (den > 0) hi = Math.min(hi, s); else lo = Math.max(lo, s);
  }
  if (lo > hi) return { t: Infinity, unsure: unsure || lo - hi < 1e-6 };
  enter = Math.max(enter, lo); exit = Math.min(exit, hi);
  const near = Math.abs(lo) < 1e-6 || Math.abs(enter - exit) < 1e-6 || Math.abs(enter - maxT) < 1e-6;
  return { t: enter <= exit && enter > 0 && enter < maxT ? enter : Infinity, unsure: unsure || near };
}

test('an oriented box at yaw 0 behaves exactly like the axis-aligned one (dyadic coordinates)', () => {
  const rand = rng(31337), a = createCollisionIndex(), b = createCollisionIndex();
  const q = (v) => Math.round(v * 64) / 64;
  for (let i = 0; i < 1500; i++) {
    const x = q((rand() - 0.5) * 300), z = q((rand() - 0.5) * 300), hx = q(0.25 + rand() * 6), hz = q(0.25 + rand() * 6);
    const bottom = rand() < 0.5 ? -Infinity : q(rand() * 4), top = bottom + q(1 + rand() * 8);
    a.add(x - hx, z - hz, x + hx, z + hz, bottom, top);
    b.addBox(x, z, hx, hz, 0, bottom, top);
  }
  const out = [], out2 = [];
  for (let i = 0; i < 40000; i++) {
    const x = q((rand() - 0.5) * 320), z = q((rand() - 0.5) * 320), r = q(0.1 + rand() * 3), y = [NaN, 0, 2, 7.5][i % 4];
    assert.equal(b.clear(x, z, r, y), a.clear(x, z, r, y));
    assert.equal(b.overlaps(x - r, z - r * 2, x + r * 2, z + r, 0.25, y), a.overlaps(x - r, z - r * 2, x + r * 2, z + r, 0.25, y));
    const n = a.containing(x, z, 0.5, out), m = b.containing(x, z, 0.5, out2);
    assert.deepEqual(out2.slice(0, m).sort((u, v) => u - v), out.slice(0, n).sort((u, v) => u - v));
    const t = rand() * Math.PI * 2, dx = q(Math.cos(t)), dz = q(Math.sin(t)), maxT = 80;
    assert.equal(b.cast(x, z, dx, dz, maxT, y, i % 3 ? 0 : -0.125), a.cast(x, z, dx, dz, maxT, y, i % 3 ? 0 : -0.125));
  }
});

test('cell borders and negative coordinates are exact', () => {
  const index = createCollisionIndex();
  index.add(-16, -32, -0.5, -16); // ends exactly on the borders of cells -1/-2 and -1/0
  index.add(16, 0, 32, 16);
  const out = [];
  // A circle exactly r from a face does not touch it; a hair closer does.
  assert.equal(index.clear(-16 - 1, -20, 1), true);
  assert.equal(index.clear(-16 - 1 + 1e-12, -20, 1), false);
  assert.equal(index.clear(0.5, -10, 1), true);
  assert.equal(index.clear(0.4999, -16.5, 1), false);
  assert.equal(index.clear(16, 16, 0.001), false);
  assert.equal(index.clear(-0.25, -16.25, 0.3), false); // straddles four cells, the solid is met in two
  assert.equal(index.clear(-0.25, -16.25, 0.25), true); // exactly r away
  assert.equal(index.query(-16, -16, 16, 0, out), 0); // touching edges only (open boxes)
  assert.equal(index.query(-16.5, -16.5, 16.5, 0.5, out), 2);
  assert.equal(index.containing(-16, -16, 0, out), 1); // corner included
  assert.equal(index.containing(-16.25, -15.75, 0.25, out), 1); // on the grown corner
  assert.equal(index.containing(-16.25, -15.74, 0.25, out), 0);
  // Rays along borders and through corners.
  assert.equal(index.cast(-40, -16, 1, 0, 100), 24); // along z = -16, the solid's top face
  assert.equal(index.cast(-40, -15.999, 1, 0, 100), 100);
  assert.equal(index.cast(0, 32, 1, -1, 100), 16); // through the corner (16, 16)
  assert.equal(index.cast(-8, -24, 1, 0, 100), 100); // starts inside the first solid and passes through it
  assert.equal(index.cast(-8, -24, 1, 1, 100), 24); // ... then reaches the second at (16, 0)
  assert.equal(index.cast(-20, -20, -1, 0, 1e9), 1e9);
  assert.equal(index.raycast(48, 8, 0, 8), 16);
  assert.equal(index.raycast(48, 8, 48, 8), 0);
});
