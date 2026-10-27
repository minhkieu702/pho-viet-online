// node --experimental-transform-types --test scripts/districts.test.mjs
// Districts, named areas and streets of today's map and of the wired P1 slices (app/game/map/districts.ts), the big
// map's and the minimap's data (map/mapdata.ts), and the SSR rule (plan decision 4): page.tsx's static imports never
// reach the city generator.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISTRICTS, P1_ORDER, WIRED_KEYS, isWired, ZONES, STREETS, areaAt, districtAt, districtOpen, registerStreets, registeredStreets, settleArea, settleStreet, streetLabel, waterAt, zoneAt } from '../app/game/map/districts.ts';
import * as consts from '../app/game/map/consts.ts';

// mapdata.ts and the map modules it reaches use extensionless imports (Vite style); teach node to try `.ts`.
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

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('today\'s map: An Hòa, Quận 1 · Bến Nghé and the river', () => {
  assert.equal(areaAt(12.6, 12.4).title, 'AN HÒA');
  assert.equal(areaAt(12.6, 12.4).subtitle, 'Phường An Hòa · ven kênh Thị Nghè');
  assert.equal(areaAt(200, 0).title, 'QUẬN 1 · BẾN NGHÉ');
  assert.equal(areaAt(60, -170).title, 'SÔNG SÀI GÒN');
  assert.equal(areaAt(80, 54).zone, 'Phố đêm Phượng Vĩ');
  assert.equal(areaAt(-31, 32).zone, 'Chợ An Hòa');
  assert.equal(areaAt(243, 27).zone, 'Quảng trường Nhà hát');
  assert.equal(areaAt(243, 80).zone, 'Công viên Thành phố');
  assert.equal(areaAt(-80, -148).zone, 'Bến đò An Hòa');
  assert.equal(areaAt(190, -148).title, 'QUẬN 1 · BẾN NGHÉ', 'a pier belongs to the district on its bank');
  // Every reachable point has a name, and the only districts there are the open ones.
  const { PLAY } = consts;
  for (let x = PLAY.minX; x <= PLAY.maxX; x += 2) for (let z = PLAY.minZ; z <= PLAY.maxZ; z += 2) {
    const a = areaAt(x, z);
    assert.ok(a.title, `no area at ${x}, ${z}`);
    // (A wired slice's pier zone reaches over the far edge of today's river: Bến đò Thủ Thiêm.)
    assert.ok(a.water || a.district === 'D1' || a.district === 'D2' || !!ZONES.find((q) => q.name === a.zone)?.slice, `${a.title} at ${x}, ${z}`);
  }
});

test('ten districts of design 1, no overlaps, open land is exactly today\'s', () => {
  assert.deepEqual(DISTRICTS.map((d) => d.id), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10']);
  const parts = DISTRICTS.flatMap((d) => d.parts.map((p) => ({ d: d.id, ...p })));
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i].rect, b = parts[j].rect;
    assert.ok(!(a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ), `${parts[i].d} overlaps ${parts[j].d}`);
  }
  const open = parts.filter((p) => p.phase === 'P0');
  assert.deepEqual(open.map((p) => p.d), ['D1', 'D2']);
  assert.equal(Math.min(...open.map((p) => p.rect.minX)), consts.LAND.minX);
  assert.equal(Math.max(...open.map((p) => p.rect.maxX)), consts.LAND.maxX);
  assert.equal(districtAt(consts.DOWNTOWN_X - 0.01, 0).district.id, 'D1');
  assert.equal(districtAt(consts.DOWNTOWN_X, 0).district.id, 'D2');
  for (const z of ZONES) assert.ok(DISTRICTS.some((d) => d.id === z.district), z.id);
  assert.equal(waterAt(100, -170)?.id, 'song-sai-gon');
  assert.equal(waterAt(100, -120), null);
});

test('hysteresis: a border never flickers, a teleport switches at once', () => {
  let a = null;
  const changes = [];
  const walk = (x0, x1, z) => {
    const step = x1 > x0 ? 0.25 : -0.25;
    for (let x = x0; step > 0 ? x <= x1 : x >= x1; x += step) {
      const next = settleArea(a, x, z);
      if (!a || next.key !== a.key) changes.push([x, next.title]);
      a = next;
    }
  };
  walk(110, 160, 0);
  assert.deepEqual(changes.map((c) => c[1]), ['AN HÒA', 'QUẬN 1 · BẾN NGHÉ']);
  assert.ok(changes[1][0] >= 135 + 7.5, `switched at ${changes[1][0]}`);
  // Pacing 3 m either side of the border changes nothing.
  for (let i = 0; i < 40; i++) walk(i % 2 ? 132 : 138, i % 2 ? 138 : 132, 0);
  assert.equal(changes.length, 2);
  assert.equal(settleArea(a, -60, 0).title, 'AN HÒA');
  // The market lane (12 m wide) and the riverside market sit inside Trung tâm / Bờ sông An Hòa, never 8 m from
  // them: walking in still names them, and they hold until 8 m past their edge.
  const path = (from, pts) => { let b = from; const seen = []; for (const [x, z] of pts) { b = settleArea(b, x, z); if (seen.at(-1) !== b.zone) seen.push(b.zone); } return seen; };
  const line = (x0, z0, x1, z1) => Array.from({ length: 201 }, (_, i) => [x0 + (x1 - x0) * i / 200, z0 + (z1 - z0) * i / 200]);
  assert.deepEqual(path(null, [...line(-31, 10, -31, 32), ...line(-31, 32, -31, 10)]), ['Trung tâm An Hòa', 'Chợ An Hòa', 'Trung tâm An Hòa']);
  assert.deepEqual(path(null, line(-70, 32, -31, 32)), ['Trung tâm An Hòa', 'Chợ An Hòa']);
  assert.deepEqual(path(null, line(76, -100, 76, -124)), ['Xóm Bờ Sông', 'Chợ ven sông']);
  assert.deepEqual(path(null, line(40, -128, 76, -124)), ['Bờ sông An Hòa', 'Chợ ven sông']);
  let m = settleArea(null, -31, 32);
  for (const z of [27, 25, 22, 19]) { m = settleArea(m, -31, z); assert.equal(m.zone, 'Chợ An Hòa', `at z ${z}`); }
  assert.equal(settleArea(m, -31, 17.5).zone, 'Trung tâm An Hòa');
  // Pacing across the lane's edge, 2 m either way, changes nothing.
  let p = settleArea(settleArea(null, -31, 20), -31, 28);
  const keys = new Set();
  for (let i = 0; i < 20; i++) { p = settleArea(p, -31, i % 2 ? 24 : 28); keys.add(p.key); }
  assert.equal(keys.size, 1);
});

test('streets keep city.ts names; a junction keeps the road you came along', () => {
  assert.equal(STREETS.length, consts.ROADS_X.length + consts.ROADS_Z.length);
  for (const s of STREETS) assert.ok([...consts.STREETS_H.values(), ...consts.STREETS_V.values()].includes(s.name), s.name);
  assert.equal(streetLabel('ĐẠI LỘ NGUYỄN HUỆ'), 'Đại lộ Nguyễn Huệ');
  assert.equal(streetLabel('ĐƯỜNG HOA SỮA'), 'Đường Hoa Sữa');
  let s = null;
  for (let x = -100; x <= 300; x += 1) { s = settleStreet(s, x, -51); assert.equal(s?.id, 'h-54'); }
  assert.equal(settleStreet(null, 30, -30), null, 'in the park, away from every road');
  assert.equal(settleStreet(null, 216, 30)?.short, 'ĐL. Nguyễn Huệ');
});

test('city.ts re-exports the constant tables unchanged', async () => {
  const city = await import('../app/game/city.ts');
  for (const name of ['ROADS_X', 'ROADS_Z', 'SIDEWALK', 'LAND', 'RIVER', 'PLAY', 'WATER_LEVEL', 'RIVER_BED', 'DOWNTOWN_X']) assert.equal(city[name], consts[name], name);
  assert.equal(city.SCENERY.docks, consts.DOCKS);
  assert.equal(city.SCENERY.plaza, consts.PLAZA);
  for (const v of city.VENUES) assert.equal(v.name, consts.VENUE_LOOKS[v.kind].name);
});

test('big map data: places, blocks and roads of today\'s map', { skip }, async () => {
  const { mapData } = await import('../app/game/map/mapdata.ts');
  const m = mapData();
  const count = (kind) => m.pois.filter((p) => p.kind === kind).length;
  for (const kind of ['cafe', 'food', 'shop', 'market', 'venue', 'hospital', 'police', 'bank', 'atm', 'tower', 'dock', 'boat', 'gun', 'bike']) assert.ok(count(kind) > 0, kind);
  assert.equal(new Set(m.pois.map((p) => p.id)).size, m.pois.length);
  // Today's places on today's land; the wired slices' on theirs.
  const onLand = (x, z) => (x >= consts.PLAY.minX && x <= consts.PLAY.maxX && z >= consts.PLAY.minZ && z <= consts.PLAY.maxZ) || m.open.some((poly) => inPoly(poly, x, z));
  for (const p of m.pois) assert.ok(onLand(p.x, p.z), `${p.name} at ${p.x}, ${p.z}`);
  assert.equal(m.roads, STREETS);
  assert.equal(m.blocks.length, (await import('../app/game/city.ts')).PLOTS.length);
});

/** Static (non-type, non-dynamic) imports of a module, resolved to project files. */
function staticImports(file) {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const out = [];
  const re = /(?:^|[;\n\r}])\s*(import|export)\s+(?:([^'";]*?)\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    const clause = (m[2] ?? '').trim();
    if (m[1] === 'export' && !clause) continue;
    if (/^type\s/.test(clause)) continue;
    const named = /^\{([\s\S]*)\}$/.exec(clause);
    if (named && named[1].split(',').map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith('type '))) continue;
    const spec = m[3];
    if (!spec.startsWith('.')) continue;
    const base = resolve(dirname(file), spec);
    const hit = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((p) => /\.(tsx?|mts|mjs|js)$/.test(p) && existsSync(p));
    if (hit) out.push(hit);
  }
  return out;
}

test('SSR rule: page.tsx never statically reaches city generation', () => {
  const start = join(ROOT, 'app/page.tsx');
  const seen = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift();
    for (const dep of staticImports(file)) if (!seen.has(dep)) { seen.set(dep, file); queue.push(dep); }
  }
  const reached = [...seen.keys()].map((f) => relative(ROOT, f).replaceAll('\\', '/')).sort();
  for (const banned of ['app/game/city.ts', 'app/game/world.ts', 'app/game/game.ts', 'app/game/map/mapdata.ts', 'app/game/npcs.ts']) {
    assert.ok(!reached.includes(banned), `page.tsx statically reaches ${banned}: ${reached.join(', ')}`);
  }
  assert.ok(reached.includes('app/game/map/consts.ts') && reached.includes('app/game/map/districts.ts') && reached.includes('app/big-map.tsx'), reached.join(', '));
});

function inPoly(p, x, z) {
  let hit = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

test('the wiring: P1 slices in order, the wired count agreed by the bounds and the map', { skip }, async () => {
  const { P1_LAYOUTS } = await import('../app/game/map/p1.ts');
  assert.deepEqual([...P1_ORDER], P1_LAYOUTS.map((l) => l.key));
  const { WIRED_SLICES } = await import('../lib/world-bounds.ts');
  // One source: map/wiring.ts (pure, read by the map, the HUD tables and the people) takes the step from the bounds.
  const wiring = await import('../app/game/map/wiring.ts');
  assert.equal(wiring.P1_WIRED, WIRED_SLICES, 'map/wiring.ts P1_WIRED and lib/world-bounds.ts WIRED_SLICES');
  assert.deepEqual([...wiring.P1_ORDER], [...P1_ORDER]);
  assert.match(readFileSync(join(ROOT, 'app/game/map/world-map-start.ts'), 'utf8'), /from '\.\/wiring\.ts'/, 'world-map-start.ts reads the wiring from map/wiring.ts');
  assert.deepEqual([...WIRED_KEYS], P1_ORDER.slice(0, process.env.PVO_WIRED ? Number(process.env.PVO_WIRED) : WIRED_SLICES));
  // A district is open once a slice of it is wired; today's two always are.
  for (const d of DISTRICTS) {
    const wired = d.parts.some((p) => p.phase === 'P0' || (p.slice && isWired(p.slice)));
    assert.equal(districtOpen(d), wired, d.name);
  }
  // Every P1 part names the slice that builds it; P2 parts none.
  for (const d of DISTRICTS) for (const p of d.parts) assert.equal(!!p.slice, p.phase === 'P1', `${d.name} ${JSON.stringify(p.rect)}`);
});

test('zones of the slices: in their district, as their EXTRA authored them, live once wired', { skip }, async () => {
  const sliced = ZONES.filter((z) => z.slice);
  assert.ok(sliced.length >= 25, `${sliced.length} slice zones`);
  for (const z of sliced) {
    assert.equal(z.phase, 'P1', z.id);
    for (const r of z.rects) {
      const at = districtAt((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2);
      assert.equal(at?.district.id, z.district, `${z.name}: its middle is in ${at?.district.name}`);
    }
  }
  assert.equal(new Set(ZONES.map((z) => z.id)).size, ZONES.length, 'zone ids are unique');
  // Quận 3 and Thủ Thiêm keep their EXTRA's own areas.
  const { QUAN_3_EXTRA } = await import('../app/game/map/layout/quan-3.ts');
  for (const e of QUAN_3_EXTRA.zones) assert.deepEqual(ZONES.find((z) => z.id === e.id)?.rects, e.rects, e.id);
  const { THU_THIEM_EXTRA } = await import('../app/game/map/layout/thu-thiem.ts');
  for (const e of THU_THIEM_EXTRA.zones) {
    const z = ZONES.find((q) => q.id === e.id);
    assert.ok(z, e.id);
    assert.deepEqual(z.rects, [{ minX: e.x0, maxX: e.x1, minZ: e.z0, maxZ: e.z1 }], e.id);
    assert.equal(z.name, e.name);
  }
  // A zone names its area only while its slice is wired.
  for (const z of sliced) {
    const r = z.rects[0], x = (r.minX + r.maxX) / 2, zz = (r.minZ + r.maxZ) / 2;
    if (isWired(z.slice)) assert.ok(zoneAt(x, zz), `${z.name} is live`);
    else assert.ok(zoneAt(x, zz)?.slice !== z.slice, `${z.name} is not live yet`);
  }
  if (isWired('quan-4')) {
    assert.equal(areaAt(535, 3).zone, 'Phố ốc Vĩnh Khánh');
    assert.equal(areaAt(535, 3).title, 'QUẬN 4');
    assert.equal(areaAt(380, -120).zone, 'Công viên Bến Nghé');
  }
});

test('the wired slices\' streets name the HUD line like today\'s roads', { skip }, async () => {
  const { districtStreets } = await import('../app/game/map/mapdata.ts');
  const list = districtStreets();
  if (!WIRED_KEYS.length) { assert.equal(list.length, 0); return; }
  assert.ok(list.length > 10, `${list.length} district streets`);
  assert.equal(new Set(list.map((s) => s.name)).size, list.length, 'one street per name');
  for (const s of list) assert.equal(s.label, streetLabel(s.name));
  registerStreets(list);
  assert.equal(registeredStreets().length, list.length);
  // Today's roads keep their names (Nguyễn Huệ, the riverside road across the whole map).
  assert.equal(settleStreet(null, 216, 30)?.short, 'ĐL. Nguyễn Huệ');
  let s = null;
  for (let x = -100; x <= 300; x += 1) { s = settleStreet(s, x, -51); assert.equal(s?.id, 'h-54'); }
  if (isWired('quan-4')) {
    // Vĩnh Khánh (z 0, x 450..620): its name on its sidewalk, the hẻm off it by theirs, and the name holds at a junction.
    assert.equal(settleStreet(null, 535, 6)?.name, 'ĐƯỜNG VĨNH KHÁNH');
    assert.equal(settleStreet(null, 535, 6)?.short, 'Đ. Vĩnh Khánh');
    let v = null;
    for (let x = 470; x <= 612; x += 0.5) { v = settleStreet(v, x, 7); assert.equal(v?.name, 'ĐƯỜNG VĨNH KHÁNH', `at ${x}`); }
    const hem = settleStreet(null, 556, -12);
    assert.ok(hem?.name.startsWith('HẺM'), `the hẻm south of Vĩnh Khánh: ${hem?.name}`);
  }
  registerStreets([]);
});

test('big map data: the wired slices\' land, roads, buildings and places', { skip }, async () => {
  const { mapData } = await import('../app/game/map/mapdata.ts');
  const wm = await import('../app/game/map/world-map.ts');
  const m = mapData();
  assert.equal(m.open.length, wm.SLICES.length);
  assert.equal(m.footprints.length, wm.DISTRICT_BUILDINGS.length);
  for (const f of m.footprints) assert.equal(f.poly.length, 8);
  if (!wm.SLICES.length) return;
  assert.ok(m.lines.length > 50, `${m.lines.length} district road pieces`);
  for (const l of m.lines) assert.ok(l.pts.length >= 4 && l.half > 0, l.name);
  assert.ok(m.pois.some((p) => p.id.startsWith('b') && Number(p.id.slice(1)) >= wm.ID_BASE), 'district places on the map');
  if (wm.isWired('quan-4')) {
    assert.ok(m.pois.some((p) => p.name === 'PHỐ ỐC VĨNH KHÁNH' && p.layer === 'nightlife'));
    assert.ok(m.pois.some((p) => p.kind === 'church' && p.name === 'NHÀ THỜ XÓM CHIẾU'));
    assert.ok(m.pois.some((p) => p.kind === 'museum' && p.name === 'BẾN NHÀ RỒNG'));
  }
});
