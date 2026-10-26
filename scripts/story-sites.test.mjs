// node --experimental-transform-types --test scripts/story-sites.test.mjs
// Story sites (app/game/story/sites.ts, story-decisions.md): every site and spot of SEN TRONG BÙN stands in its declared
// district and phase, on land (or the intended water, road, pier, roof, deck or stamp), off the asphalt unless it is
// a road scene, and clear of colliders (city.ts and the generated Quận 4); doors equal city.ts doors and facings;
// stamps equal stamps.ts and are built by the quan-4 layout; routes stay on roads, water or clear ground; the anchored
// barge clears the boat lanes; the 36 missions and 12 cutscenes reference existing sites and spaces with the right
// phase; the renames match today's buildings and leave the story names unique. When the map team moves a building
// or regenerates Quận 4, this test names the site to re-pick. (Ported from the W0-MAP self-check.)
// Imports pure modules only; some import './x' without an extension (Vite style), which a resolve hook retries as .ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { readFileSync } from 'node:fs';

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

const S = await import('../app/game/story/sites.ts');
const city = await import('../app/game/city.ts');
const { TERRAIN } = await import('../app/game/map/terrain.ts');
const D = await import('../app/game/map/districts.ts');
const { STORY_STAMP } = await import('../app/game/map/stamps.ts');
const { LEGACY_ROADS } = await import('../app/game/map/roads-legacy.ts');
const { buildDistrict } = await import('../app/game/map/build-district.ts');
const { QUAN_4 } = await import('../app/game/map/layout/quan-4.ts');
const { DOCKS } = await import('../app/game/map/consts.ts');

const q4 = buildDistrict(QUAN_4, LEGACY_ROADS);
const PH = { P0: 0, P1: 1, P2: 2 };

/**
 * The river fleet as boats.ts builds it, read from its source (boats.ts imports three.js and keeps its lanes
 * private): every `make(kind, x, lane, dir, cruise, mode?, weave?)` with a literal lane or a LANES.<name> entry,
 * and the SPEC beams. When the boats owner moves a lane, the anchored barge check below re-runs on the new numbers.
 */
function riverFleet() {
  const src = readFileSync(new URL('../app/game/boats.ts', import.meta.url), 'utf8');
  const lanes = Object.fromEntries([...(src.match(/const LANES = \{([^}]*)\}/)?.[1] ?? '').matchAll(/(\w+):\s*(-?[\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  const beam = Object.fromEntries([...src.matchAll(/(\w+): \{ length: ([\d.]+), beam: ([\d.]+) \}/g)].map((m) => [m[1], Number(m[3])]));
  const boats = [];
  for (const m of src.matchAll(/^\s*(?:const \w+ = )?make\('(\w+)', (-?[\d.]+), (-?[\d.]+|LANES\.\w+), (-?1), ([\d.]+)(?:, '(\w+)')?(?:, ([\d.]+))?/gm)) {
    const lane = m[3].startsWith('LANES.') ? lanes[m[3].slice(6)] : Number(m[3]);
    boats.push({ kind: m[1], x: Number(m[2]), lane, mode: m[6] ?? 'cruise', weave: Number(m[7] ?? 0), beam: beam[m[1]] });
  }
  return boats;
}
const FLEET = riverFleet();
const fmt = (x, z) => `(${x}, ${z})`;
const inPoly = (p, x, z) => { let hit = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit; } return hit; };
const q4Land = (x, z) => x >= 352 && inPoly(QUAN_4.bounds, x, z) && !D.waterAt(x, z);
/** Today's asphalt: the road strips (half 7). */
function legacyAsphalt(x, z) {
  for (const s of TERRAIN.strips) {
    const along = s.alongX ? x : z, v = s.alongX ? z : x;
    if ((s.lo !== -Infinity && along <= s.lo) || (s.hi !== Infinity && along >= s.hi)) continue;
    if (Math.abs(v - s.at) < s.half && city.inRect(city.LAND, x, z, -0.5)) return true;
  }
  return false;
}
const q4Asphalt = (x, z) => x >= 352 && !!q4.graph.edgeAt(x, z, 0);
const onDeck = (x, z) => q4.decks.some((d) => inPoly(d.poly, x, z));
const asphalt = (x, z) => legacyAsphalt(x, z) || q4Asphalt(x, z) || onDeck(x, z);
/** Circle vs the Quận 4 colliders (oriented boxes): the collider's kind and key, or null. */
function q4Clear(x, z, r) {
  for (const c of q4.colliders) {
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw), dx = x - c.cx, dz = z - c.cz;
    const lx = dx * co - dz * s, lz = dx * s + dz * co;
    const nx = Math.max(-c.hx, Math.min(c.hx, lx)), nz = Math.max(-c.hz, Math.min(c.hz, lz));
    if ((lx - nx) ** 2 + (lz - nz) ** 2 < r * r) return `${c.kind}:${c.key}`;
  }
  return null;
}
const land = (x, z) => (x < 352 ? TERRAIN.walkable(x, z) || !!TERRAIN.dockAt(x, z) : q4Land(x, z));
const clear = (x, z, r) => (x < 352 ? (city.pointClear(x, z, r) ? null : 'legacy collider') : q4Clear(x, z, r));
const water = (x, z) => (x < 352 && x > city.LAND.minX ? TERRAIN.inWater(x, z) : D.waterAt(x, z)?.id === 'song-sai-gon');

function districtOk(err, id, site, x, z) {
  const at = D.districtAt(x, z);
  if (!at) { if (!water(x, z) && !onDeck(x, z) && !TERRAIN.dockAt(x, z)) err(`${id} ${fmt(x, z)}: outside every district and not on water/deck/pier`); return; }
  if (at.district.id !== site.district) err(`${id} ${fmt(x, z)}: in ${at.district.id}, site says ${site.district}`);
  if (PH[at.part.phase] > PH[site.phase]) err(`${id} ${fmt(x, z)}: needs ${at.part.phase}, site says ${site.phase}`);
}
function spotOk(err, id, p, hull) {
  if (p.air) return;
  if (p.solid && hull) { if (p.x < hull[0] || p.x > hull[1] || p.z < hull[2] || p.z > hull[3]) err(`${id} ${fmt(p.x, p.z)}: off the hull`); return; }
  if (p.solid) {
    // On or at a building that tall: within 1.5 m of a footprint whose top is at least y - 0.5 (roofs, walls, gaps between roofs).
    if (p.y !== undefined && p.x < 352) {
      const near = (f) => Math.hypot(Math.max(f.minX - p.x, 0, p.x - f.maxX), Math.max(f.minZ - p.z, 0, p.z - f.maxZ)) <= 1.5;
      if (!city.PLOTS.some((q) => near(q.full) && q.h + 0.25 >= p.y - 0.5)) err(`${id} ${fmt(p.x, p.z)} y ${p.y}: no building that tall here`);
    }
    return;
  }
  if (p.water) { if (!water(p.x, p.z)) err(`${id} ${fmt(p.x, p.z)}: should be on water`); return; }
  if (p.road) { if (!asphalt(p.x, p.z)) err(`${id} ${fmt(p.x, p.z)}: road scene off the asphalt`); return; }
  if (!land(p.x, p.z)) err(`${id} ${fmt(p.x, p.z)}: not on land`);
  if (asphalt(p.x, p.z)) err(`${id} ${fmt(p.x, p.z)}: inside a road lane`);
  const hit = clear(p.x, p.z, p.r ?? 0.45);
  if (hit) err(`${id} ${fmt(p.x, p.z)} r ${p.r ?? 0.45}: hits ${hit}`);
}
/** Hulls a boat route must go round: the moored cargo ship and every water site's footprint. */
const HULLS = [[479.5, 574.5, -166, -150], ...Object.values(S.SITES).filter((s) => s.kind === 'water' && s.area).map((s) => s.area)];
/** The legacy road strips under (x, z) (several at a junction). */
const stripsAt = (x, z) => TERRAIN.strips.filter((s) => {
  const along = s.alongX ? x : z, v = s.alongX ? z : x;
  return !((s.lo !== -Infinity && along <= s.lo) || (s.hi !== Infinity && along >= s.hi)) && Math.abs(v - s.at) < s.half;
});
/**
 * A route sampled every metre, vertices included: a foot route on clear walkable ground (r 0.4), a boat route on
 * water and outside every hull (its ends may touch a quay or a bank), a road route on the asphalt (its two ends and
 * its `free` segments may be clear ground, r 0.5 / 0.9) and, on today's strips, in the lane of its direction: off
 * the centre line, eastbound runs south of the centre and northbound east of it (traffic keeps right).
 */
function routeOk(err, id, s) {
  const pts = s.route, free = new Set(s.free ?? []), segs = pts.length / 2 - 1;
  if (pts[0] !== s.x || pts[1] !== s.z) err(`${id}: (x, z) is not the route start`);
  for (const k of free) if (!(k >= 0 && k < segs)) err(`${id}: free segment ${k} out of range`);
  const mode = id.startsWith('r-thuyen') || id.startsWith('r-boi') ? 'water' : id === 'r-bin' || id === 'r-ve-nha' ? 'foot' : 'road';
  for (let k = 0; k < segs; k++) {
    const ax = pts[2 * k], az = pts[2 * k + 1], bx = pts[2 * k + 2], bz = pts[2 * k + 3], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    const bad = new Map();
    const note = (why, x, z) => { const q = bad.get(why); if (q) { q.n++; q.to = [x, z]; } else bad.set(why, { n: 1, from: [x, z], to: [x, z] }); };
    for (let i = k === 0 ? 0 : 1; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n, end = (k === 0 && i === 0) || (k === segs - 1 && i === n);
      if (mode === 'foot') { if (!land(x, z)) note('not on land', x, z); else if (clear(x, z, 0.4)) note(`hits ${clear(x, z, 0.4)}`, x, z); continue; }
      if (mode === 'water') {
        if (end) continue;
        if (!water(x, z)) note('not on water', x, z);
        else if (HULLS.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) note('inside a hull', x, z);
        continue;
      }
      const off = free.has(k) || (i === 0 && free.has(k - 1)) || (i === n && free.has(k + 1));
      if (!asphalt(x, z)) {
        if (end) { if (!land(x, z) || clear(x, z, 0.9)) note(`end neither road nor clear ground (${clear(x, z, 0.9)})`, x, z); }
        else if (!off) note('off the road', x, z);
        else if (!water(x, z) && (!land(x, z) || clear(x, z, 0.5))) note(`free segment hits ${clear(x, z, 0.5) ?? 'no ground'}`, x, z);
        continue;
      }
      // the lane check covers straight runs on today's strips; turns and diagonals (a left turn into a ramp) cross lanes on purpose
      const dx = Math.abs(bx - ax), dz = Math.abs(bz - az);
      if (x >= 352 || Math.min(dx, dz) > 0.25 * Math.max(dx, dz)) continue;
      const st = stripsAt(x, z);
      if (st.length !== 1) continue;
      const [strip] = st;
      if (strip.alongX !== dx > dz) continue;
      const lateral = (strip.alongX ? z : x) - strip.at, heading = strip.alongX ? Math.sign(bx - ax) : Math.sign(bz - az);
      if (Math.abs(lateral) > 1.2 && Math.sign(lateral) !== (strip.alongX ? heading : -heading)) note(`against the traffic, ${strip.alongX ? 'z' : 'x'} off the centre line on the wrong side`, x, z);
    }
    for (const [why, b] of bad) err(`${id} segment ${k} ${fmt(...b.from.map((v) => +v.toFixed(1)))} → ${fmt(...b.to.map((v) => +v.toFixed(1)))}: ${b.n} m ${why}`);
  }
}
const names = city.BUILDINGS.map((b) => b.name);
for (const r of S.RENAMES) names[r.id] = r.name;

test('the Quận 4 slice builds cleanly (the P1 sites stand on it)', () => {
  assert.equal(q4.issues.length, 0, q4.issues.slice(0, 5).join('\n'));
  assert.ok(q4.colliders.length > 500 && q4.stats.buildings > 100);
});

test('renames match today\'s buildings and leave every story name unique; no building keeps the real bank\'s name', () => {
  const errors = [];
  for (const r of S.RENAMES) {
    const b = city.BUILDINGS[r.id];
    if (!b || b.name !== r.from || Math.hypot(b.door.x - r.door[0], b.door.z - r.door[1]) > 0.02) errors.push(`rename ${r.id}: today it is ${b?.name} at ${b && fmt(b.door.x, b.door.z)}, expected ${r.from} at ${fmt(r.door[0], r.door[1])}`);
  }
  for (const keep of ['CÀ PHÊ CÔ BA', 'TIỆM HOA', 'BÁNH MÌ', 'SỬA XE TƯ', 'CHÈ BÀ SÁU', 'VIỆC LÀM ÁNH DƯƠNG', 'NHÀ THUỐC', 'NGÂN HÀNG KIM THÀNH']) {
    const n = names.filter((v) => v === keep).length;
    if (n !== 1) errors.push(`name ${keep} on ${n} buildings after renames`);
  }
  const coBa = names.map((v, i) => [v, i]).filter(([v]) => v.includes('CÔ BA'));
  if (coBa.length !== 1) errors.push(`"CÔ BA" on ${coBa.map(([v, i]) => `${i}:${v}`).join(', ')}`);
  if (names.some((v) => /PHƯƠNG NAM/.test(v) && v !== 'THÁP PHƯƠNG NAM')) errors.push('a building is still named after the real Phương Nam bank');
  assert.deepEqual(errors, []);
});

test('every site and spot is in its district and phase, on its ground, off the asphalt and clear; doors, stamps, routes and the barge hold', (t) => {
  const errors = [], notes = [], err = (m) => errors.push(m);
  let spots = 0;
  for (const [id, s] of Object.entries(S.SITES)) {
    districtOk(err, id, s, s.x, s.z);
    if (s.kind === 'door') {
      const b = city.BUILDINGS[s.building];
      if (!b) err(`${id}: no building ${s.building}`);
      else {
        if (Math.hypot(b.door.x - s.x, b.door.z - s.z) > 0.02 || !s.door || Math.hypot(b.door.x - s.door.x, b.door.z - s.door.z) > 0.02) err(`${id}: door ${fmt(s.x, s.z)} but city.ts says ${fmt(b.door.x, b.door.z)}`);
        if (Math.abs(((b.facing - (s.yaw ?? 0) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) > 0.01) err(`${id}: yaw ${s.yaw} but the door faces ${b.facing}`);
        const final = names[s.building];
        if (b.kind !== 'home' || S.RENAMES.some((r) => r.id === s.building)) if (final !== s.name && b.subtitle !== s.name) err(`${id}: named ${s.name}, the building is ${final}`);
        if (!city.pointClear(s.x, s.z, 0.3)) err(`${id}: door blocked`);
      }
    } else if (s.kind === 'roof' || s.kind === 'deck') {
      const p = city.PLOTS[s.building], f = p.full;
      if (!(s.x > f.minX && s.x < f.maxX && s.z > f.minZ && s.z < f.maxZ)) err(`${id}: not over building ${s.building}`);
      const top = s.kind === 'deck' ? p.h + 0.2 : p.h;
      if (Math.abs(top - s.y) > 0.05) err(`${id}: y ${s.y}, the ${s.kind} is at ${top}`);
      if (s.kind === 'deck') for (const [k, q] of Object.entries(s.spots ?? {})) {
        if (Math.abs(q.x - 189) > 3.34 || Math.abs(q.z + 82) > 3.34 || Math.hypot(q.x - 189, q.z + 82) < 1.3) err(`${id}.${k}: off the walkable deck square`);
      }
    } else if (s.kind === 'stamp') {
      const st = STORY_STAMP[s.stamp];
      if (!st) err(`${id}: no stamp ${s.stamp}`);
      else {
        if (Math.hypot(st.x - s.x, st.z - s.z) > 1) err(`${id}: (${s.x}, ${s.z}) but stamp ${s.stamp} is at (${st.x}, ${st.z})`);
        if (s.door && Math.hypot(st.entrance.x - s.door.x, st.entrance.z - s.door.z) > 0.02) err(`${id}: door differs from the stamp entrance`);
        if (st.phase !== s.phase) err(`${id}: phase ${s.phase}, stamp ${st.phase}`);
        if (s.stamp !== 'cargo-ship' && !q4.stamps.some((o) => o.id === s.stamp)) err(`${id}: the quan-4 layout does not build ${s.stamp}`);
      }
    } else if (s.kind === 'road') {
      if (!asphalt(s.x, s.z)) err(`${id}: road scene off the asphalt ${fmt(s.x, s.z)}`);
    } else if (s.kind === 'water') {
      const [x0, x1, z0, z1] = s.area;
      if (!TERRAIN.navigable(s.x, s.z, (z1 - z0) / 2)) err(`${id}: hull not navigable`);
      // Every boat still sailing its lane sweeps lane ± (weave + half beam); the traffic barge is the one anchored
      // here in chapter 7 (story-decisions.md decision 10), so it is left out. Anchored and moored boats are fixed rects.
      const fleet = riverFleet();
      if (fleet.filter((b) => b.mode === 'cruise').length < 5) err(`${id}: could not read the river fleet from boats.ts`);
      for (const b of fleet) {
        if (b.kind === 'barge' || !b.beam) continue;
        if (b.mode === 'cruise') {
          const lo = b.lane - b.weave - b.beam / 2, hi = b.lane + b.weave + b.beam / 2;
          if (lo < z1 && hi > z0) err(`${id}: hull z ${z0}..${z1} reaches the ${b.kind} lane ${b.lane} (sweeps ${lo.toFixed(2)}..${hi.toFixed(2)})`);
          else if (Math.min(Math.abs(lo - z1), Math.abs(z0 - hi)) < 3) notes.push(`${id}: ${(lo >= z1 ? lo - z1 : z0 - hi).toFixed(2)} m from the ${b.kind} lane ${b.lane}`);
        } else if (b.mode === 'anchored' && x1 > b.x - 5 && x0 < b.x + 5 && b.lane - b.beam / 2 < z1 && b.lane + b.beam / 2 > z0) err(`${id}: overlaps the ${b.kind} anchored at x ${b.x}`);
      }
      // the boarding points hug the hull edge they name (WAVE1-PLAN §1.3: they move with any re-pick of the hull)
      const sp = s.spots ?? {};
      if (sp.fenders && !(sp.fenders.z > z1 && sp.fenders.z - z1 <= 1 && sp.fenders.x > x0 && sp.fenders.x < x1)) err(`${id}.fenders ${fmt(sp.fenders.x, sp.fenders.z)}: not within 1 m outside the An Hòa (+z) edge z ${z1}`);
      if (sp.ladder && !(sp.ladder.x < x0 && x0 - sp.ladder.x <= 1 && sp.ladder.z > z0 && sp.ladder.z < z1)) err(`${id}.ladder ${fmt(sp.ladder.x, sp.ladder.z)}: not within 1 m off the stern x ${x0}`);
    } else if (s.kind === 'pier') {
      if (!DOCKS.some((d) => city.inRect(d.pier, s.x, s.z))) err(`${id}: not on a pier`);
    } else if (s.kind === 'route') routeOk(err, id, s);
    else spotOk(err, id, s);
    for (const [k, p] of Object.entries(s.spots ?? {})) {
      spots++;
      // a water spot is never in a cruising boat's sweep (the traffic barge's lane is the one emptied in chapter 7)
      if (p.water) for (const b of FLEET) {
        if (b.mode !== 'cruise' || b.kind === 'barge' || !b.beam) continue;
        if (Math.abs(p.z - b.lane) < b.weave + b.beam / 2) err(`${id}.${k} ${fmt(p.x, p.z)}: in the ${b.kind} lane ${b.lane} sweep`);
      }
      if (!p.air && !p.solid) districtOk(err, `${id}.${k}`, s, p.x, p.z);
      spotOk(err, `${id}.${k}`, p, s.kind === 'water' ? s.area : undefined);
    }
    for (const sp of s.spaces ?? []) if (!S.SPACES[sp]) err(`${id}: unknown space ${sp}`);
  }
  // The deck spots are measured against THÁP PHƯƠNG NAM's central tube; the plot centre must stay at (189, -82).
  const f = city.PLOTS[154].full;
  if ((f.minX + f.maxX) / 2 !== 189 || (f.minZ + f.maxZ) / 2 !== -82) err('THÁP PHƯƠNG NAM moved');
  for (const [id, sp] of Object.entries(S.SPACES)) if (sp.site && !S.SITES[sp.site]) err(`space ${id}: unknown site ${sp.site}`);
  assert.deepEqual(errors, []);
  assert.ok(spots >= 100, `${spots} spots`);
  for (const n of notes) t.diagnostic(n);
});

test('36 missions and 12 cutscenes in order, with existing sites and spaces and matching phases; every site is used', () => {
  const errors = [], err = (m) => errors.push(m);
  const want = [];
  [3, 3, 3, 3, 3, 3, 3, 4, 3, 4, 4].forEach((n, c) => { for (let m = 1; m <= n; m++) want.push(`c${c + 1}-m${m}`); });
  assert.deepEqual(Object.keys(S.MISSION_SITES), want, 'the 36 missions of story-final.md in order');
  const maxPhase = (list) => list.reduce((p, id) => Math.max(p, PH[S.SITES[id]?.phase ?? 'P0']), 0);
  for (const [id, m] of Object.entries(S.MISSION_SITES)) {
    for (const s of [...m.sites, ...(m.later ?? [])]) if (!S.SITES[s]) err(`${id}: unknown site ${s}`);
    for (const sp of m.spaces ?? []) if (!S.SPACES[sp]) err(`${id}: unknown space ${sp}`);
    if (maxPhase(m.sites) !== PH[m.phase]) err(`${id}: phase ${m.phase}, its sites need P${maxPhase(m.sites)}`);
    for (const s of m.later ?? []) if (PH[S.SITES[s].phase] <= PH[m.phase]) err(`${id}: later site ${s} is not later than the mission`);
  }
  assert.equal(Object.keys(S.CUTSCENE_SITES).length, 12);
  for (const [id, c] of Object.entries(S.CUTSCENE_SITES)) {
    if (!S.MISSION_SITES[c.mission]) err(`${id}: unknown mission ${c.mission}`);
    for (const s of [...c.sites, ...(c.later ?? [])]) if (!S.SITES[s]) err(`${id}: unknown site ${s}`);
    for (const sp of c.spaces ?? []) if (!S.SPACES[sp]) err(`${id}: unknown space ${sp}`);
    if (maxPhase(c.sites) !== PH[c.phase]) err(`${id}: phase ${c.phase}, its sites need P${maxPhase(c.sites)}`);
    for (const s of c.sites) if (!S.MISSION_SITES[c.mission]?.sites.includes(s)) err(`${id}: site ${s} is not among ${c.mission}'s sites`);
  }
  const used = new Set(Object.values(S.MISSION_SITES).flatMap((m) => [...m.sites, ...(m.later ?? [])]));
  for (const id of Object.keys(S.SITES)) if (!used.has(id)) err(`site ${id} is used by no mission`);
  assert.deepEqual(errors, []);
  const byPhase = { P0: 0, P1: 0, P2: 0 };
  for (const m of Object.values(S.MISSION_SITES)) byPhase[m.phase]++;
  assert.deepEqual(byPhase, { P0: 33, P1: 3, P2: 0 }, 'story-decisions.md: only c2-m2, c2-m3 and c3-m2 need the Quận 4 slice');
});

test('cutscene cameras placed from a site never start inside a building (eye, move ends, rail points)', async () => {
  const scenes = [...(await import('../app/game/story/cutscenes/ch01.ts')).CUTSCENES, ...(await import('../app/game/story/cutscenes/ch02.ts')).CUTSCENES];
  const places = S.sitePlaces(), errors = [];
  /** World position of a site-relative mark (world axes, y from the site's own height); null for cast, set and ride marks. */
  const pos = (m) => {
    const at = typeof m === 'string' ? m : m.at, off = typeof m === 'string' ? [0, 0, 0] : m.off, p = places[at];
    return p ? { x: p.x + off[0], y: (p.y ?? 0) + off[1], z: p.z + off[2] } : null;
  };
  const cams = (c) => (c.k === 'split' ? [...cams(c.left), ...cams(c.right)] : [c.eye, c.from, c.to, ...(c.points ?? [])].filter(Boolean));
  for (const sc of scenes) sc.shots.forEach((sh, i) => {
    for (const m of cams(sh.cam)) {
      const p = pos(m);
      if (!p || p.x >= 352) continue; // Quận 4: the KHO 7 swoop enters its hollow shell on purpose
      const hit = city.PLOTS.findIndex((q) => p.x > q.full.minX && p.x < q.full.maxX && p.z > q.full.minZ && p.z < q.full.maxZ && p.y < q.h);
      if (hit >= 0) errors.push(`${sc.id} shot ${i + 1}: camera at (${p.x}, ${p.y}, ${p.z}) is inside building ${hit} (${city.BUILDINGS[hit]?.name})`);
    }
  });
  assert.deepEqual(errors, []);
});

test('sitePlaces and siteAreas: one flat place table for the runner, exclusion rects for the world policy', () => {
  const places = S.sitePlaces(), areas = S.siteAreas();
  assert.ok(Object.keys(places).length >= Object.keys(S.SITES).length);
  for (const [k, p] of Object.entries(places)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), k);
  for (const id of Object.keys(S.SITES)) assert.ok(places[id], id);
  assert.deepEqual(places['kho-7.skylight'] && [places['kho-7.skylight'].x, places['kho-7.skylight'].z], [578, -112]);
  for (const [k, [x0, x1, z0, z1]] of Object.entries(areas)) assert.ok(x0 < x1 && z0 < z1, k);
  assert.deepEqual(S.OFFMAP, { z: -3400, x0: -1200, step: 200, size: 160 }, 'the off-map band (story-decisions.md 16)');
});
