// node --experimental-transform-types --test scripts/map-layout.test.mjs
// The map validator (critique step 13): generator v2 (app/game/map/build-district.ts) on a synthetic district
// (app/game/map/gen/sample.ts) and on every layout file under app/game/map/layout/. Each must pass
// gen/validate.ts (no building on another, a road or water; every door and seat reachable from the walking network;
// nothing solid in a lane, on a walking line or a crosswalk; roads inside the layout, joined to today's grid only
// through portals on fence ends; junctions without slivers; decks only over water, with a height, never over a
// road), generate the same bytes twice, keep untouched blocks byte-identical when one block changes or the streets
// are listed in another order, build in under 150 ms and stay within design 2's instance budget. Slices stack, water
// inside a block is kept clear, hẻm are lived in, and Quận 4's port, Vĩnh Khánh and blocks keep their design.
// A layout whose portal is a link's island node (Thủ Thiêm on the Đò ngang, stack.ts DistrictLink) is built and
// validated on today's graph plus that link. The P1 stack (p1.ts: Quận 4 and the four P1 slices) welds its seams and
// passes stack.ts validateStack (seams meet, no overlap, no road built twice or stopping short, nothing of one slice on
// another's roads, every door and seat on the welded walking network), in either order, within the P1 budgets.
// Imports only pure modules (no three.js); some import './x' without an extension (Vite style), which a resolve hook
// retries as .ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const { LEGACY_ROADS } = await import('../app/game/map/roads-legacy.ts');
const { createRoadGraph } = await import('../app/game/map/roads.ts');
const { buildDistrict, applyPatch, inputOf, INSTANCE_BUDGET } = await import('../app/game/map/build-district.ts');
const { validateDistrict } = await import('../app/game/map/gen/validate.ts');
const { SAMPLE_LAYOUT } = await import('../app/game/map/gen/sample.ts');
const { isLayout } = await import('../app/game/map/layout/types.ts');
const { QUAN_4 } = await import('../app/game/map/layout/quan-4.ts');
const { STORY_STAMP } = await import('../app/game/map/stamps.ts');
const { hemParkSide } = await import('../app/game/map/gen/dressing.ts');
const { stream, hashKey, pointKey, digest } = await import('../app/game/map/rng.ts');
const { isLink, linkGraph, linksOf, stackSlices, validateStack, stackTotals, liveInput, stackKey, SEAM_TRIM } = await import('../app/game/map/stack.ts');
const { buildP1, seamsAmong, linksAmong, P1_LAYOUTS, P1_LINKS, P1_SEAMS } = await import('../app/game/map/p1.ts');

// Layout files: every export of app/game/map/layout/*.ts (types.ts aside) that looks like a DistrictLayout, and the
// links (DistrictLink) island layouts hang on.
const LAYOUT_DIR = fileURLToPath(new URL('../app/game/map/layout/', import.meta.url));
const files = readdirSync(LAYOUT_DIR).filter((f) => f.endsWith('.ts') && f !== 'types.ts').sort();
const layouts = [{ name: 'sample (synthetic)', layout: SAMPLE_LAYOUT }];
const LINKS = [];
for (const f of files) {
  const mod = await import(pathToFileURL(`${LAYOUT_DIR}${f}`).href);
  for (const [name, value] of Object.entries(mod)) if (isLayout(value)) layouts.push({ name: `${f}:${name}`, layout: value }); else if (isLink(value)) LINKS.push(value);
}
/** The graph a layout is built and validated on: today's, plus the links its portals stand on. */
const baseFor = (layout) => linkGraph(LEGACY_ROADS, linksOf(layout, LINKS));
const built = new Map(layouts.map(({ name, layout }) => [name, buildDistrict(layout, baseFor(layout))]));

const report = (issues) => issues.slice(0, 25).map((i) => `${i.code}: ${i.msg}${i.x !== undefined ? ` @(${i.x}, ${i.z})` : ''}`).join('\n');
const median = (list) => list.slice().sort((a, b) => a - b)[list.length >> 1];

test('rng: keyed streams are deterministic and independent', () => {
  const a = stream('D5', 'block', 'b1'), b = stream('D5', 'block', 'b1'), c = stream('D5', 'block', 'b2');
  const xa = Array.from({ length: 64 }, () => a.next()), xb = Array.from({ length: 64 }, () => b.next()), xc = Array.from({ length: 64 }, () => c.next());
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, xc);
  assert.ok(xa.every((v) => v >= 0 && v < 1));
  assert.notEqual(hashKey('ab', 'c'), hashKey('a', 'bc'));
  assert.equal(hashKey('x', 1.234), hashKey('x', 1.2341), 'numbers key at 1 cm');
  assert.equal(pointKey(-0.1, 12.26), '0:12.5');
  const r = stream('stats');
  let sum = 0;
  for (let i = 0; i < 1e5; i++) sum += r.next();
  assert.ok(Math.abs(sum / 1e5 - 0.5) < 0.01, 'uniform');
  assert.equal(digest({ a: 1 }), digest({ a: 1 }));
  assert.notEqual(digest({ a: 1 }), digest({ a: 2 }));
});

test('inputOf rebuilds a road graph exactly, and a district patch keeps today\'s signals', () => {
  const again = createRoadGraph(inputOf(LEGACY_ROADS));
  assert.deepEqual(again.approaches, LEGACY_ROADS.approaches);
  assert.deepEqual(again.crosswalks, LEGACY_ROADS.crosswalks);
  assert.deepEqual(again.nodes.map((n) => [n.x, n.z, n.control, n.radius]), LEGACY_ROADS.nodes.map((n) => [n.x, n.z, n.control, n.radius]));
  for (const { name, layout } of layouts) {
    const d = built.get(name), base = baseFor(layout);
    const merged = createRoadGraph(applyPatch(inputOf(base), d.graphPatch));
    for (let i = 0; i < base.nodes.length; i++) assert.deepEqual([merged.nodes[i].x, merged.nodes[i].z], [base.nodes[i].x, base.nodes[i].z]);
    // Every legacy approach keeps its pole and timing group; new ones appear only where a fence stub now carries
    // traffic into its junction (the portal's neighbour). Approach ids after those junctions shift by design.
    const key = (a) => `${a.node}:${a.edge}:${a.dir}:${a.group}:${a.pole.x}:${a.pole.z}`;
    const now = new Set(merged.approaches.map(key));
    for (const a of base.approaches) assert.ok(now.has(key(a)), `${name}: legacy approach ${a.id} kept`);
    const opened = new Set(d.graphPatch.traffic.flatMap((e) => [base.edges[e].a, base.edges[e].b]));
    const was = new Set(base.approaches.map(key));
    for (const a of merged.approaches) if (a.node < base.nodes.length && !was.has(key(a))) assert.ok(opened.has(a.node), `${name}: new approach at legacy node ${a.node}`);
  }
});

for (const { name, layout } of layouts) {
  const base = baseFor(layout);
  test(`${name}: passes the validator`, () => {
    const d = built.get(name);
    const issues = validateDistrict(layout, d, base);
    assert.equal(issues.length, 0, `\n${report(issues)}`);
    assert.ok(d.buildings.length > 0 && d.blocks.length > 0);
    // Every building has today's Building and Plot fields, and a door with a curb.
    for (const b of d.buildings) {
      for (const k of ['id', 'x', 'z', 'w', 'd', 'h', 'facing', 'name', 'subtitle', 'kind', 'color', 'door', 'curb', 'residents', 'jobs']) assert.ok(k in b, `${b.key} lacks ${k}`);
      assert.ok(b.name.length > 0 && Number.isFinite(b.h) && b.h > 2);
    }
    assert.equal(d.plots.length, d.buildings.length);
    d.plots.forEach((p, i) => assert.equal(p.id, d.buildings[i].id));
    // Every collider once (buildings come with the scenery solids), and no two share a key.
    const keys = d.colliders.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length, 'collider keys are unique');
    assert.equal(d.colliders.filter((c) => c.kind === 'building').length, d.buildings.length);
    // No shop sign twice on one street; chung cư slabs of a block have distinct lô letters.
    const lotOf = new Map(d.lots.map((l) => [l.key, l])), seen = new Set();
    for (const b of d.buildings) {
      if (b.kind === 'home' || b.typology !== 'tube') continue;
      const k = `${lotOf.get(b.lot)?.line}|${b.name}`;
      assert.ok(!seen.has(k), `${b.name} twice on ${lotOf.get(b.lot)?.line}`);
      seen.add(k);
    }
    for (const blk of d.blocks) {
      const lots = d.buildings.filter((b) => b.block === blk.key && b.typology === 'apartment').map((b) => b.subtitle.split(' • ')[0]);
      assert.equal(new Set(lots).size, lots.length, `${blk.key}: lô letters`);
    }
  });

  test(`${name}: every market, pagoda, church or school zone builds its institution (a lot or a stamp of that kind)`, (t) => {
    // The generator falls back to plain rows when an institution lot finds no room (lots.ts) without an issue, so the
    // layout files are held to it here; the synthetic sample (gen/sample.ts) is the generator's own fixture.
    if (layout === SAMPLE_LAYOUT) { t.skip('the generator\'s synthetic fixture'); return; }
    const d = built.get(name), TYP = { market: 'market-hall', pagoda: 'pagoda', church: 'church', school: 'school' };
    for (const blk of d.blocks) {
      const typ = TYP[blk.zone];
      if (!typ) continue;
      const own = d.buildings.some((b) => b.block === blk.key && b.typology === typ) || d.stamps.some((s) => s.building >= 0 && s.kind === blk.zone && inPolyJs(blk.face, s.x, s.z));
      assert.ok(own, `${blk.key} (${blk.zone} zone at ${labelOf(blk.face).map((v) => v.toFixed(0))}) has no ${blk.zone}`);
    }
  });

  test(`${name}: the order of the arterial list changes no block`, () => {
    const d = built.get(name), rev = buildDistrict({ ...layout, arterials: [...layout.arterials].reverse() }, base);
    assert.deepEqual(rev.blockHashes, d.blockHashes);
    assert.equal(validateDistrict(layout, rev, base).length, 0);
  });

  test(`${name}: hẻm are lived in (motos against the walls, wall lamps, stool tables, poles at the mouths) and gaps between houses are footways`, () => {
    const d = built.get(name), g = d.graph, hemEdges = g.edges.filter((e) => e.cls === 'hem');
    const inHem = (x, z) => hemEdges.some((e) => { const h = g.project(e, x, z); return h.d > 0.5 && h.d < e.half && h.s > 0.5 && h.s < e.len - 0.5; });
    const motos = d.scenery.parked.filter((p) => inHem(p.x, p.z));
    assert.ok(motos.length >= 20, `${motos.length} motos in hẻm`);
    for (const p of motos) {
      const e = hemEdges.find((h) => { const q = g.project(h, p.x, p.z); return q.d > 0.5 && q.d < h.half; }), q = g.project(e, p.x, p.z);
      assert.ok(Math.abs(Math.sin(p.yaw) * q.hx + Math.cos(p.yaw) * q.hz) > 0.95, `${p.key} parks along the hẻm`);
    }
    assert.ok(d.scenery.lamps.filter((l) => l.kind === 'wall').length >= 10, 'wall lamps');
    assert.ok(d.scenery.eateries.some((t) => inHem(t.x, t.z)), 'a stool table in a hẻm');
    assert.ok(d.scenery.poles.filter((p) => p.line.startsWith('hem:')).length >= 10, 'poles at hẻm mouths');
    assert.ok(d.graphPatch.footways.length >= 10, `${d.graphPatch.footways.length} footways`);
    assert.equal(hemParkSide(3) * hemParkSide(9), -1, 'motos take turns side to side');
  });

  test(`${name}: same layout, same bytes; editing one block leaves the others identical`, () => {
    const d = built.get(name), again = buildDistrict(layout, base);
    assert.equal(again.hash, d.hash);
    assert.deepEqual(again.blockHashes, d.blockHashes);
    // Turn one busy block into a park (its houses, hẻm and dressing go): every other block keeps its bytes.
    const victim = d.blocks.filter((b) => b.buildings.length >= 6 && b.zone !== 'park').sort((a, b) => b.buildings.length - a.buildings.length)[0];
    assert.ok(victim, 'a block to edit');
    const block = d.blocks.find((b) => b.key === victim.key);
    const at = labelOf(block.face);
    const edited = buildDistrict({ ...layout, zoning: [{ zone: 'park', at }, ...(layout.zoning ?? [])] }, base);
    assert.notEqual(edited.blockHashes[victim.key], d.blockHashes[victim.key], 'the edited block changed');
    const changed = Object.keys(d.blockHashes).filter((k) => k !== victim.key && edited.blockHashes[k] !== d.blockHashes[k]);
    assert.deepEqual(changed, [], 'other blocks changed');
    assert.deepEqual(Object.keys(edited.blockHashes).sort(), Object.keys(d.blockHashes).sort());
  });

  test(`${name}: builds in under 150 ms and within the instance budget`, () => {
    const d = built.get(name);
    // Best of ten: node --test runs the test files side by side, and the clock also counts whatever else is busy.
    const wall = [];
    for (let i = 0; i < 10; i++) { const t = performance.now(); buildDistrict(layout, base); wall.push(performance.now() - t); }
    const ms = Math.min(...wall), s = d.stats;
    console.log(`  ${name}: ${s.buildings} buildings, ${s.lots} lots, ${s.hems} hẻm (${s.hemLength} m), ${s.blocks} blocks on ${(s.landM2 / 1e6).toFixed(3)} km²; ` +
      `${s.trees} trees, ${s.lamps} lamps, ${s.poles} poles, ${s.parked} parked motos, ${s.eateries} eateries, ${s.pois} POIs, ${s.signs} signs; ` +
      `${s.colliders} colliders; ~${Math.round(s.instances)} instances (${s.instancesPerM2}/m², budget ${INSTANCE_BUDGET}); ` +
      `build ${ms.toFixed(1)} ms (best of 10; median ${median(wall).toFixed(1)} ms, first build ${s.ms} ms)`);
    // Design 2: a Quận 4-sized district (0.143 km²) in under 150 ms; larger layouts get time pro rata.
    const limit = 150 * Math.max(1, s.landM2 / 143000);
    assert.ok(ms < limit, `build ${ms.toFixed(1)} ms > ${limit.toFixed(0)} ms`);
    assert.ok(s.instancesPerM2 <= INSTANCE_BUDGET, `${s.instancesPerM2} instances/m² > ${INSTANCE_BUDGET}`);
    assert.ok(s.colliders < 40 * s.landM2 / 1000, 'colliders per 1000 m²');
  });
}

test('slices built alone against today\'s graph stack: each patch\'s own nodes move to where they land', () => {
  const q4 = built.get('quan-4.ts:QUAN_4');
  const fence = LEGACY_ROADS.nodes.find((n) => n.control === 'fence-end' && n.x === 54 && n.z === 137.5);
  const south = {
    id: 'D3', key: 'south-test', name: 'NAM', bounds: [-100, 137.5, 300, 137.5, 300, 260, -100, 260],
    arterials: [{ id: 's', name: 'ĐƯỜNG NAM', cls: 'R1', pts: [fence.x, fence.z, fence.x, 250] }, { id: 't', name: 'ĐƯỜNG NGANG', cls: 'R2', pts: [-90, 200, 290, 200], sidewalk: 4.5 }],
    portals: [{ id: 'ps', x: fence.x, z: fence.z, road: 's' }],
  };
  const s = buildDistrict(south, LEGACY_ROADS);
  assert.deepEqual(s.graphPatch.base, q4.graphPatch.base, 'both built on today\'s graph');
  for (const [first, second] of [[q4, s], [s, q4]]) {
    const g = createRoadGraph(applyPatch(applyPatch(inputOf(LEGACY_ROADS), first.graphPatch), second.graphPatch));
    const at = LEGACY_ROADS.edges.length + first.graphPatch.edges.length;
    second.graphPatch.edges.forEach((_, i) => {
      const e = g.edges[at + i], own = second.graph.edges[second.graphPatch.base.edges + i];
      assert.deepEqual([e.pts[0], e.pts[1], e.pts[e.pts.length - 2], e.pts[e.pts.length - 1]], [own.pts[0], own.pts[1], own.pts[own.pts.length - 2], own.pts[own.pts.length - 1]], `${e.name} lands where it was built`);
    });
    assert.equal(g.footways.length, LEGACY_ROADS.footways.length + q4.graphPatch.footways.length + s.graphPatch.footways.length);
  }
  // Two slices on one portal: the second finds the fence end taken.
  assert.throws(() => applyPatch(applyPatch(inputOf(LEGACY_ROADS), s.graphPatch), s.graphPatch), /another slice/);
});

test('water inside a block (a pond, a creek\'s end): lots and hẻm keep off it', () => {
  const base = (key, waterways, bridges = []) => ({
    id: 'D5', key, name: key, bounds: [352, -30, 600, -30, 600, 200, 352, 200],
    arterials: [{ id: 'a', name: 'ĐƯỜNG MỘT', cls: 'R1', pts: [352, 0, 600, 0] }, { id: 'b', name: 'ĐƯỜNG HAI', cls: 'R1', pts: [352, 108, 600, 108] }, { id: 'c', name: 'ĐƯỜNG BA', cls: 'R2', pts: [420, 0, 420, 108], sidewalk: 4.5 }, { id: 'd', name: 'ĐƯỜNG BỐN', cls: 'R2', pts: [560, 0, 560, 108], sidewalk: 4.5 }],
    portals: [{ id: 'p', x: 352, z: 0, road: 'a' }, { id: 'q', x: 352, z: 108, road: 'b' }], waterways, bridges,
  });
  const pond = base('pond', [{ id: 'ho', name: 'HỒ', kind: 'basin', poly: [460, 35, 520, 35, 520, 75, 460, 75], bank: 'ke' }]);
  const creek = base('creek', [{ id: 'rach', name: 'RẠCH', kind: 'canal', poly: [500, 40, 600, 40, 600, 60, 500, 60], bank: 'ke' }], [{ id: 'cau-d', name: 'CẦU D', road: 'd', over: 'rach', yHint: 0.8, ramp: 6 }]);
  for (const layout of [pond, creek]) {
    const d = buildDistrict(layout, LEGACY_ROADS), issues = validateDistrict(layout, d, LEGACY_ROADS);
    assert.equal(issues.length, 0, `${layout.key}\n${report(issues)}`);
    assert.ok(d.buildings.length > 100);
  }
  // The pond's block is built round it, its houses all clear of the water.
  const d = buildDistrict(pond, LEGACY_ROADS), round = d.buildings.filter((b) => b.box.cx > 430 && b.box.cx < 550 && b.box.cz > 10 && b.box.cz < 100);
  assert.ok(round.length > 10);
});

test('Quận 4: a closed port fence round KHO 7 with its gates, cover on the aprons, and other ways aboard and in', () => {
  const d = built.get('quan-4.ts:QUAN_4');
  // Every fence panel laid (a blocked one is a generator issue, see the validator test below); the gates are the openings.
  assert.deepEqual(d.fences.map((f) => f.id), ['cang-tay', 'cang-ntt', 'cang-bai']);
  assert.ok(d.fences.every((f) => f.panels > 20));
  const kho7 = d.stamps.find((s) => s.id === 'kho7'), b = d.buildings[kho7.building], gate = d.fences[1].gates[0];
  assert.ok(Math.abs(b.door.x - gate.x) < gate.w / 2, 'KHO 7\'s door opens through its truck gate');
  assert.deepEqual(kho7.ways.map((w) => w.kind), ['hatch', 'ladder']);
  const kinds = (k) => d.scenery.props.filter((p) => p.kind === k);
  assert.ok(kinds('container').length >= 20 && kinds('crate').length + kinds('pallet').length >= 30 && kinds('bollard').length >= 20 && kinds('booth').length === 1);
  // The bend apron (x 600..680, z < -30): no open ground more than 14 m from cover.
  const cover = d.colliders.filter((c) => c.kind !== 'tree');
  const wet = (x, z) => QUAN_4.waterways.some((w) => inPolyJs(w.poly, x, z));
  let worst = 0;
  for (let x = 600.5; x < 680; x += 2) for (let z = -137.5; z < -30; z += 2) {
    if (wet(x, z) || d.graph.edgeAt(x, z, 6)) continue;
    worst = Math.max(worst, Math.min(...cover.map((c) => obbDist(c, x, z))));
  }
  assert.ok(worst < 14, `open ground ${worst.toFixed(1)} m from cover on the bend apron`);
  // Fixture bollards hold the ship's lines; fenders hang on its quay side and a pilot ladder on its river side.
  const ship = STORY_STAMP['cargo-ship'];
  for (const l of ship.moor.lines) assert.ok(kinds('bollard').some((p) => Math.hypot(p.x - l.ax, p.z - l.az) < 0.6), `bollard at (${l.ax}, ${l.az})`);
  assert.ok(ship.moor.fenders.length >= 6 && ship.moor.ladder.z < ship.z - ship.d / 2 + 0.5);
});

test('Quận 4: Vĩnh Khánh is the ốc street; hẻm run through the blocks north of Tôn Đản; Tôn Đản has a bus stop', () => {
  const d = built.get('quan-4.ts:QUAN_4'), lotOf = new Map(d.lots.map((l) => [l.key, l]));
  const vk = d.buildings.filter((b) => lotOf.get(b.lot)?.line === 'vinh-khanh');
  assert.ok(vk.filter((b) => b.kind === 'food').length >= 0.7 * vk.length, 'mostly food');
  assert.ok(vk.filter((b) => /^ỐC|^SÒ/.test(b.name)).length >= 5, 'ốc first');
  assert.ok(vk.filter((b) => b.kind === 'cafe').length <= 3, 'hardly a café');
  const north = d.blocks.filter((b) => b.buildings.length && b.face.every((v, k) => k % 2 === 0 || v <= 162) && b.face.every((v, k) => k % 2 === 1 || v >= 450));
  assert.ok(north.filter((b) => b.hems.length).length >= 5, `${north.filter((b) => b.hems.length).length} blocks north of Tôn Đản with hẻm`);
  assert.ok(d.scenery.props.some((p) => p.kind === 'shelter' && p.key.startsWith('bus:ton-dan:')), 'a stop on Tôn Đản');
  assert.ok(!d.graph.edges.some((e) => e.name === 'ĐƯỜNG TÔN ĐỨC THẮNG' && e.id >= d.graphPatch.base.edges), 'the stub keeps its legacy name');
  assert.ok(!d.buildings.some((b) => b.name === 'CHÙA PHƯỚC HẢI'));
});

test('small and odd layouts build and validate (one street; villas, warehouses and a skewed street)', () => {
  const mini = [
    { id: 'D5', key: 'mini', name: 'MINI', bounds: [352, -30, 520, -30, 520, 40, 352, 40], arterials: [{ id: 'a', name: 'ĐƯỜNG MỘT', cls: 'R1', pts: [352, 0, 520, 0] }], portals: [{ id: 'p', x: 352, z: 0, road: 'a' }] },
    {
      id: 'D5', key: 'mini2', name: 'MINI 2', bounds: [352, -30, 600, -30, 600, 200, 352, 200], zone: 'villa',
      arterials: [{ id: 'a', name: 'ĐƯỜNG MỘT', cls: 'R1', pts: [352, 0, 600, 0] }, { id: 'b', name: 'ĐƯỜNG HAI', cls: 'R2', pts: [450, 0, 470, 200], sidewalk: 4.5 }],
      portals: [{ id: 'p', x: 352, z: 0, road: 'a' }], zoning: [{ zone: 'warehouse', at: [550, 100] }],
    },
  ];
  for (const layout of mini) {
    const d = buildDistrict(layout, LEGACY_ROADS), issues = validateDistrict(layout, d, LEGACY_ROADS);
    assert.equal(issues.length, 0, `${layout.key}\n${report(issues)}`);
    assert.ok(d.buildings.length > 10, `${layout.key}: ${d.buildings.length} buildings`);
  }
});

test('generator code keeps to bit-exact maths (same layout on every browser)', () => {
  // Math.hypot is not specified to the last bit: Node and Chrome gave lot yaws one ulp apart before gen/geom.ts hyp().
  const dir = fileURLToPath(new URL('../app/game/map/', import.meta.url));
  const sources = ['build-district.ts', 'rng.ts', ...readdirSync(`${dir}gen`).filter((f) => f.endsWith('.ts')).map((f) => `gen/${f}`)];
  for (const f of sources) assert.ok(!/Math\.hypot\(/.test(readFileSync(`${dir}${f}`, 'utf8')), `${f} calls Math.hypot`);
});

test('the validator catches broken layouts', () => {
  const codes = (layout) => {
    const d = buildDistrict(layout, LEGACY_ROADS);
    return new Set(validateDistrict(layout, d, LEGACY_ROADS).map((i) => `${i.code}:${i.msg}`));
  };
  const has = (set, re) => [...set].some((s) => re.test(s));
  // A canal crossing without its bridge, a bridge over nothing, a portal off the legacy grid, car bays on a narrow road.
  const broken = {
    ...SAMPLE_LAYOUT, key: 'broken',
    bridges: [...SAMPLE_LAYOUT.bridges.filter((b) => b.id !== 'cau-khanh-hoi'), { id: 'nowhere', name: 'CẦU ẢO', road: 'vinh-hoi', over: 'kenh', yHint: 1 }],
    arterials: SAMPLE_LAYOUT.arterials.map((a) => (a.id === 'vinh-hoi' ? { ...a, curb: ['car', 'moto'] } : a)),
    portals: [...SAMPLE_LAYOUT.portals, { id: 'p-x', x: 360, z: 20, road: 'vinh-hoi' }],
  };
  const found = codes(broken);
  assert.ok(has(found, /^generator:arterial khanh-hoi crosses waterway kenh .* no bridge/), 'unbridged crossing');
  assert.ok(has(found, /^road-in-water:/), 'road over water without a deck');
  assert.ok(has(found, /^generator:bridge nowhere:/), 'bridge over nothing');
  assert.ok(has(found, /^generator:portal p-x:/), 'portal off the grid');
  assert.ok(has(found, /^generator:arterial vinh-hoi: car bays need/), 'car bays on a narrow road');
  // A stamp dropped across a street: its building sits on the road.
  const onRoad = { ...SAMPLE_LAYOUT, key: 'on-road', stamps: [{ id: 'bad', kind: 'landmark', name: 'NHÀ SAI CHỖ', x: 530, z: -54, w: 20, d: 20, yaw: 0 }] };
  assert.ok(has(codes(onRoad), /^building-on-road:NHÀ SAI CHỖ/), 'building on a road');
  // A bridge ramp longer than its street has room for runs onto the junctions, whichever order the streets are listed in.
  const ramp = (layout) => ({ ...layout, bridges: layout.bridges.map((b) => (b.id === 'cau-khanh-hoi' ? { ...b, ramp: 30 } : b)) });
  const first = (layout, id) => ({ ...layout, arterials: [layout.arterials.find((a) => a.id === id), ...layout.arterials.filter((a) => a.id !== id)] });
  for (const layout of [ramp(QUAN_4), first(ramp(QUAN_4), 'cau-khanh-hoi')]) {
    const found = codes({ ...layout, key: 'ramp' });
    assert.ok(has(found, /^generator:bridge cau-khanh-hoi: ramp runs .* onto the junction/), 'ramp onto a junction');
    assert.ok(has(found, /^deck-over-road:deck cau-khanh-hoi/), 'deck over a road');
  }
  // A portal on an inner junction of today's map, its street running back over today's land; a street along the fence
  // line through fence ends it does not join; two stamps with one id; a street leaving another at 12°.
  const box = { id: 'D5', name: 'X', bounds: [352, -30, 600, -30, 600, 200, 352, 200] };
  const inner = codes({ ...box, key: 'inner', arterials: [{ id: 'a', name: 'ĐƯỜNG MỘT', cls: 'R1', pts: [352, 0, 600, 0] }, { id: 'x', name: 'ĐƯỜNG CHÉO', cls: 'R2', pts: [324, 0, 420, 60], sidewalk: 4.5 }], portals: [{ id: 'p', x: 352, z: 0, road: 'a' }, { id: 'pin', x: 324, z: 0, road: 'x' }] });
  for (const re of [/^portal-not-fence-end:/, /^control-change:/, /^road-outside:/, /^road-on-legacy-land:/, /^generator:portal pin: .* not a fence end/]) assert.ok(has(inner, re), String(re));
  const along = codes({ ...box, key: 'along', arterials: [{ id: 'a', name: 'ĐƯỜNG MỘT', cls: 'R1', pts: [352, 0, 600, 0] }, { id: 'b', name: 'ĐƯỜNG BIÊN', cls: 'R2', pts: [352, 20, 352, 190], sidewalk: 4.5 }, { id: 'c', name: 'ĐƯỜNG NỐI', cls: 'R2', pts: [352, 190, 600, 190], sidewalk: 4.5 }, { id: 'e', name: 'ĐƯỜNG ĐÔNG', cls: 'R2', pts: [600, 0, 600, 190], sidewalk: 4.5 }], portals: [{ id: 'p', x: 352, z: 0, road: 'a' }] });
  for (const re of [/^generator:arterial b: passes legacy node/, /^legacy-node-on-road:/, /^edge-crossing:ĐƯỜNG BIÊN/]) assert.ok(has(along, re), String(re));
  const st = (id, x, name) => ({ id, kind: 'landmark', name, x, z: 30, w: 24, d: 16, yaw: Math.PI, h: 9, storeys: 2, yard: 1, anchor: id });
  const twins = codes({ ...box, key: 'twins', bounds: [352, -30, 600, -30, 600, 42, 352, 42], arterials: [{ id: 'a', name: 'ĐƯỜNG MỘT', cls: 'R1', pts: [352, 0, 600, 0] }], portals: [{ id: 'p', x: 352, z: 0, road: 'a' }], stamps: [st('k1', 420, 'KHO A'), st('k1', 520, 'KHO B')] });
  assert.ok(has(twins, /^generator:stamp k1: duplicate id/) && has(twins, /^duplicate-key:/), 'two stamps with one id');
  const dx = Math.cos((12 * Math.PI) / 180) * 200, dz = Math.sin((12 * Math.PI) / 180) * 200;
  const acute = codes({ ...box, key: 'acute', arterials: [{ id: 'a', name: 'ĐƯỜNG MỘT', cls: 'R1', pts: [352, 0, 600, 0] }, { id: 'b', name: 'ĐƯỜNG HAI', cls: 'R1', pts: [380, 0, 380 + dx, dz] }], portals: [{ id: 'p', x: 352, z: 0, road: 'a' }] });
  assert.ok(has(acute, /^junction-angle:/) && has(acute, /^crosswalk-long:/), 'a 12° junction');
  // A fence across a street with no gate there.
  const fenced = codes({ ...box, key: 'fenced', bounds: [352, -30, 600, -30, 600, 42, 352, 42], arterials: [{ id: 'a', name: 'ĐƯỜNG MỘT', cls: 'R1', pts: [352, 0, 600, 0] }], portals: [{ id: 'p', x: 352, z: 0, road: 'a' }], fences: [{ id: 'f', kind: 'fence', h: 2, pts: [450, -25, 450, 38] }] });
  assert.ok(has(fenced, /^generator:fence f: blocked/), 'a fence across a street');
});

// ---- P1: Quận 4 and the four P1 slices as one stack (p1.ts, stack.ts) ----
const p1 = buildP1(LEGACY_ROADS);
const geometry = (stack) => ({
  nodes: stack.graph.nodes.map((n) => `${n.x},${n.z},${n.control},${n.arms.length}`).sort(),
  edges: stack.graph.edges.map((e) => { const a = `${e.pts[0]},${e.pts[1]}`, b = `${e.pts.at(-2)},${e.pts.at(-1)}`; return `${e.name}|${e.cls}|${a < b ? a + '|' + b : b + '|' + a}|${e.len.toFixed(2)}`; }).sort(),
  trimmed: stack.trimmed.map((t) => stackKey(t.slice, t.key)).sort(),
  footways: stack.graph.footways.length,
});

test('P1: Quận 4 and the four P1 slices stack on today\'s graph and the ferry, every seam welds, and the slices fit together', () => {
  assert.deepEqual(p1.slices.map((s) => s.key), ['quan-4', 'binh-thanh', 'quan-3', 'quan-1-south', 'thu-thiem']);
  // The stacked builds are the layout files' own districts (only the building ids run on from slice to slice).
  for (const s of p1.slices) {
    const own = [...built].find(([, d]) => d.layout === s.key)[1];
    assert.deepEqual(s.data.blockHashes, own.blockHashes, `${s.key}: same blocks as built alone`);
  }
  const ids = p1.slices.flatMap((s) => s.data.buildings.map((b) => b.id));
  assert.deepEqual(ids, ids.map((_, i) => i), 'building ids run on from slice to slice');
  assert.deepEqual(p1.stack.issues, []);
  assert.deepEqual(p1.stack.welds.map((w) => w.seam), P1_SEAMS.map((s) => s.id), 'every seam welds');
  // Straight-on seams join one street; T and four-way seams get their control from the arms.
  const control = (id) => p1.stack.graph.nodes[p1.stack.welds.find((w) => w.seam === id).node].control;
  assert.deepEqual(['le-thanh-ton-q4', 'le-lai', 'bui-vien', 'nguyen-thi-minh-khai', 'le-van-sy', 'hoang-sa'].map(control), ['signal', 'signal', 'priority', 'priority', 'priority', 'none']);
  const issues = validateStack(p1.stack, p1.slices, P1_SEAMS);
  assert.equal(issues.length, 0, `\n${report(issues)}`);
  // The seam trim: a few pieces of dressing laid before a neighbour's road existed, all at seams, never a building.
  assert.ok(p1.stack.trimmed.length <= 12, `${p1.stack.trimmed.length} trimmed`);
  for (const t of p1.stack.trimmed) {
    assert.notEqual(t.kind, 'building');
    assert.ok(P1_SEAMS.some((s) => Math.hypot(s.x - t.x, s.z - t.z) < SEAM_TRIM), `${t.key} near a seam`);
  }
  // Stacked the other way round: the same roads, junctions and trim (ids differ).
  const rev = stackSlices(LEGACY_ROADS, P1_LINKS, [...p1.slices].reverse(), P1_SEAMS);
  assert.deepEqual(rev.issues, []);
  assert.deepEqual(geometry(rev), geometry(p1.stack));
  // Every road of every slice reaches today's map (Thủ Thiêm over the ferry link).
  const g = p1.stack.graph, seen = new Set([0]), queue = [0];
  while (queue.length) { const n = queue.pop(); for (const arm of g.nodes[n].arms) { const e = g.edges[arm.edge], m = e.a === n ? e.b : e.a; if (!seen.has(m)) { seen.add(m); queue.push(m); } } }
  assert.equal(seen.size, g.nodes.length);
  // The live map's road input: the ferry is a ride, not a road; today's riverside T keeps its phantom crosswalk.
  const live = liveInput(p1.stack, LEGACY_ROADS), lg = createRoadGraph(live.input);
  assert.equal(lg.edges.length, g.edges.length - P1_LINKS.length);
  assert.ok(!live.edgeOf.some((o) => o.slice.startsWith('link:')));
  const anchor = LEGACY_ROADS.nodes.find((n) => n.x === -54 && n.z === -108).id;
  assert.ok(lg.phantoms.some((p) => p.node === anchor) && !g.phantoms.some((p) => p.node === anchor));
  for (const id of [anchor]) assert.deepEqual(lg.nodes[id].arms.map((a) => a.angle), LEGACY_ROADS.nodes[id].arms.map((a) => a.angle));
  // Story stamps stand in the layout stamps.ts names (villa-p1 in Thủ Thiêm).
  assert.ok(p1.slices.find((s) => s.key === 'thu-thiem').data.stamps.some((s) => s.id === 'villa-p1' && s.building >= 0));
  assert.equal(STORY_STAMP['villa-p1'].layout, 'thu-thiem');
});

test('P1: every earlier wiring step (Quận 4 alone, then with Bình Thạnh, Quận 3, Quận 1 south) stacks clean with the seams among its slices', () => {
  for (let n = 1; n < p1.slices.length; n++) {
    const slices = p1.slices.slice(0, n), keys = slices.map((s) => s.key), seams = seamsAmong(keys);
    const stack = stackSlices(LEGACY_ROADS, linksAmong(slices.map((s) => s.layout)), slices, seams);
    assert.deepEqual(stack.issues, [], keys.join(' + '));
    assert.equal(stack.welds.length, seams.length);
    const issues = validateStack(stack, slices, seams);
    assert.equal(issues.length, 0, `${keys.join(' + ')}\n${report(issues)}`);
  }
});

test('P1: the stack check catches a seam that moved, slices left unwelded, overlapping land and one slice building on another\'s road', () => {
  const codes = (issues) => new Set(issues.map((i) => i.code));
  // A seam point a slice no longer ends a road on.
  const moved = stackSlices(LEGACY_ROADS, P1_LINKS, p1.slices, P1_SEAMS.map((s) => (s.id === 'hoang-sa' ? { ...s, z: s.z + 1 } : s)));
  assert.ok(moved.issues.some((i) => i.code === 'seam-missing' && /hoang-sa/.test(i.msg)));
  // No seams at all: ends meet unwelded, roads stop short of their neighbours, the hẻm footways are missing.
  const loose = stackSlices(LEGACY_ROADS, P1_LINKS, p1.slices, []);
  const looseIssues = validateStack(loose, p1.slices, []), found = codes(looseIssues);
  for (const c of ['seam-unwelded', 'seam-gap']) assert.ok(found.has(c), c);
  for (const re of [/HẺM 24\/21/, /HẺM 24\/35 LÊ THÁNH TÔN/, /CẦU LÊ VĂN SỸ/, /BÙI VIỆN/]) assert.ok(looseIssues.some((i) => i.code === 'seam-gap' && re.test(i.msg)), String(re));
  // A building of one slice on another's sidewalk, a prop on another's asphalt far from any seam, and Quận 1 south's
  // first bounds (they took the corner x 352..372, z 300..318 that Quận 4 builds on).
  const bad = p1.slices.map((s) => (s.key !== 'binh-thanh' ? s : { ...s, data: { ...s.data, colliders: [...s.data.colliders,
    { cx: -167, cz: 146, hx: 2, hz: 2, yaw: 0, top: 6, kind: 'building', key: 'test:house' }, { cx: -108, cz: 300, hx: 0.5, hz: 0.5, yaw: 0, top: 1, kind: 'prop', key: 'test:prop' }] } }));
  const wrong = { ...P1_LAYOUTS[3], bounds: P1_LAYOUTS[3].bounds.slice(0, 24).concat([372, 318, 412, 318], P1_LAYOUTS[3].bounds.slice(36)) };
  bad[3] = { ...bad[3], layout: wrong };
  const issues = validateStack(stackSlices(LEGACY_ROADS, P1_LINKS, bad, P1_SEAMS), bad, P1_SEAMS);
  assert.ok(issues.some((i) => i.code === 'building-on-road' && /test:house/.test(i.msg)), 'building on a neighbour\'s road');
  assert.ok(issues.some((i) => i.code === 'solid-on-asphalt' && /test:prop/.test(i.msg)), 'prop on a neighbour\'s asphalt');
  assert.ok(issues.some((i) => i.code === 'slice-overlap' && /quan-4 and quan-1-south/.test(i.msg)), 'overlapping land');
});

test('P1: totals within the budgets (design 1, design 2, the critique)', () => {
  // Today's map (design 2's baseline): 164 buildings, 1,158 world colliders, 34,082 instances on 0.134 km².
  const today = { buildings: 164, colliders: 1158, instances: 34082, landM2: 134000 };
  const t = stackTotals(p1.slices), all = { buildings: t.buildings + today.buildings, colliders: t.colliders + today.colliders, instances: t.instances + today.instances, landM2: t.landM2 + today.landM2 };
  const wall = [];
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); buildP1(LEGACY_ROADS); wall.push(performance.now() - t0); }
  const ms = Math.min(...wall), biggest = Math.max(...p1.slices.map((s) => s.data.stats.ms));
  console.log(`  P1 stack: ${t.buildings} buildings (+${today.buildings} today), ${t.colliders} colliders, ~${t.instances} instances (${(t.instances / t.landM2).toFixed(2)}/m²) on ${(t.landM2 / 1e6).toFixed(3)} km², ` +
    `${t.signs} signs (${t.glyphs} glyphs), ${t.pois} POIs, ${t.trees} trees, ${t.parked} parked motos; with today: ${all.buildings} buildings, ${all.colliders} colliders, ~${all.instances} instances; ` +
    `build + stack ${ms.toFixed(0)} ms (best of 3), slowest single first build ${biggest} ms`);
  // Design 2: about 2.5k buildings of P1 macro data; the instance budget of 0.3 per m² of land (Medium preset).
  assert.ok(all.buildings <= 2500, `${all.buildings} buildings`);
  assert.ok(t.instances / t.landM2 <= INSTANCE_BUDGET, 'instances per m²');
  // Design 1: at most 12k colliders loaded (16 m hash: collision.ts).
  assert.ok(all.colliders <= 12000, `${all.colliders} colliders`);
  // Resident with no streaming (the critique's P1 plan): within its measured 9x stress proxy (9 × today's instances).
  assert.ok(all.instances <= 9 * today.instances, `${all.instances} resident instances`);
  // Generation: the generator test's pro-rata rule (150 ms per Quận 4-sized 0.143 km²) over the whole stack.
  assert.ok(ms < 150 * (t.landM2 / 143000), `build ${ms.toFixed(0)} ms`);
});

// ---- P1 after the Sài Gòn review (E:/pvo-work/p1/review-saigon): churches, skyline, night streets, hẻm, edges ----
const { QUAN_4_EXTRA } = await import('../app/game/map/layout/quan-4.ts');
const { BINH_THANH, BINH_THANH_EXTRA } = await import('../app/game/map/layout/binh-thanh.ts');
const { QUAN_3, QUAN_3_EXTRA } = await import('../app/game/map/layout/quan-3.ts');
const { QUAN_1_SOUTH, QUAN_1_SOUTH_EXTRA } = await import('../app/game/map/layout/quan-1-south.ts');
const { THU_THIEM_EXTRA } = await import('../app/game/map/layout/thu-thiem.ts');
const { hemOf } = await import('../app/game/map/addresses.ts');
const EXTRA = { 'quan-4': QUAN_4_EXTRA, 'binh-thanh': BINH_THANH_EXTRA, 'quan-3': QUAN_3_EXTRA, 'quan-1-south': QUAN_1_SOUTH_EXTRA, 'thu-thiem': THU_THIEM_EXTRA };
const sliceOf = (key) => p1.slices.find((s) => s.key === key);
const inBox = (b, x, z, pad = 0) => { const s = Math.sin(b.yaw), c = Math.cos(b.yaw), dx = x - b.cx, dz = z - b.cz; return Math.abs(dx * c - dz * s) <= b.hx + pad && Math.abs(dx * s + dz * c) <= b.hz + pad; };

test('P1 churches: every church is a church (never a pagoda) with its spire or bell tower inside its own footprint', () => {
  let n = 0;
  for (const s of p1.slices) {
    for (const st of s.layout.stamps ?? []) if (st.kind === 'church') assert.notEqual(st.building, 'pagoda', `${st.id}: a church stamp is no pagoda`);
    for (const p of s.data.plots.filter((q) => q.typology === 'church')) {
      n++;
      const b = s.data.buildings.find((q) => q.key === p.key), towers = (EXTRA[s.key].towers ?? []).filter((t) => t.stamp === b.stamp);
      assert.ok(b.stamp, `${b.name}: churches are authored stamps (the renderer reads their towers)`);
      assert.ok(towers.some((t) => /spire|bell tower/.test(t.kind)), `${b.name} has a spire or bell tower in ${s.key}'s EXTRA.towers`);
      for (const t of towers) for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) assert.ok(inBox(p.box, t.x + (i * t.w) / 2, t.z + (j * (t.d ?? t.w)) / 2, 0.01), `${b.name}: its ${t.kind} stands inside its footprint`);
    }
  }
  assert.ok(n >= 4, `${n} churches (Đức Bà, Tân Định, Xóm Chiếu, Thủ Thiêm)`);
  // Every tower part of any stamp stands on its stamp, or on the ground stamp reserved for it (Vĩnh Nghiêm's bảo tháp):
  // the renderer draws them where the data says, never at a fixed spot of today's map.
  for (const s of p1.slices) for (const t of EXTRA[s.key].towers ?? []) {
    const st = (s.layout.stamps ?? []).find((q) => q.id === (t.on ?? t.stamp)), box = st && { cx: st.x, cz: st.z, hx: st.w / 2, hz: st.d / 2, yaw: st.yaw };
    assert.ok(box && [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([i, j]) => inBox(box, t.x + (i * t.w) / 2, t.z + (j * (t.d ?? t.w)) / 2, 0.01)), `${s.key}: ${t.kind} of ${t.stamp} on ${t.on ?? 'its stamp'}`);
  }
});

test('P1 skyline: Quận 1 south reads as the CBD (towers of 40–120 m continuing downtown), not lower than its neighbours', () => {
  const tall = (key, h) => sliceOf(key).data.buildings.filter((b) => b.h >= h);
  const share = (key) => tall(key, 20).length / sliceOf(key).data.buildings.length;
  // Per-slice height targets: the CBD's towers, Bình Thạnh's riverside complex, Thủ Thiêm's condos and the twin towers.
  const TARGET = { 'quan-1-south': 3, 'binh-thanh': 4, 'thu-thiem': 2 };
  for (const [key, n] of Object.entries(TARGET)) assert.ok(tall(key, 40).length >= n, `${key}: ${tall(key, 40).length} buildings of 40 m or more (target ${n})`);
  assert.ok(Math.max(...tall('quan-1-south', 40).map((b) => b.h)) >= 100, 'a Quận 1 tower of 100 m or more');
  for (const key of ['quan-3', 'quan-4']) assert.ok(share('quan-1-south') >= share(key), `Quận 1 south's share of buildings of 20 m or more (${share('quan-1-south').toFixed(3)}) is not below ${key}'s (${share(key).toFixed(3)})`);
  // The towers have their skyline.ts forms, on stamps that exist and stand 40 m or more.
  for (const { stamp, tower } of QUAN_1_SOUTH_EXTRA.skyline) {
    const b = sliceOf('quan-1-south').data.buildings.find((q) => q.stamp === stamp);
    assert.ok(b && b.h >= 40 && b.h <= 120, `${stamp} stands 40–120 m`);
    assert.ok(['glass', 'stepped', 'hotel', 'tapered', 'bundle', 'twin'].includes(tower.form) && tower.floor > 3, `${stamp}: a tower form`);
  }
});

test('P1 night streets: Phan Xích Long seats its quán on the sidewalk; Bùi Viện puts its stools out on the closed carriageway', () => {
  const g = p1.stack.graph, on = (name, x, z) => g.nearestEdge(x, z, 20)?.edge.name === name;
  const bt = sliceOf('binh-thanh').data;
  assert.equal(BINH_THANH.arterials.find((a) => a.id === 'phan-xich-long').sidewalk, 4.5);
  assert.ok(bt.scenery.eateries.filter((e) => on('ĐƯỜNG PHAN XÍCH LONG', e.x, e.z)).length >= 20, 'stool tables along Phan Xích Long');
  assert.ok(bt.scenery.parked.filter((m) => on('ĐƯỜNG PHAN XÍCH LONG', m.x, m.z)).length >= 20, 'bikes parked along Phan Xích Long');
  const bv = QUAN_1_SOUTH.arterials.find((a) => a.id === 'bui-vien'), S = QUAN_1_SOUTH_EXTRA.nightSeats, close = QUAN_1_SOUTH_EXTRA.closures['bui-vien'];
  assert.deepEqual(S.hours, close.hours, 'the stools are out while the street is closed');
  assert.ok(S.tables.length >= 30, `${S.tables.length} tables`);
  const z0 = bv.pts[1], curbSide = S.table.d / 2, laneSide = S.stool.lane + S.stool.r, along = S.stool.along + S.stool.r, bars = close.barriers.map((b) => b.ax);
  for (const t of S.tables) {
    const toLane = Math.sign(z0 - t.z);
    assert.ok(Math.abs(Math.cos(t.yaw) - toLane) < 1e-9, `table at (${t.x}, ${t.z}) faces the lane`);
    assert.ok(Math.abs(t.z - z0) + curbSide <= bv.half - 0.3, `table at (${t.x}, ${t.z}): 0.3 m or more off the curb`);
    assert.ok(t.x - along > Math.min(...bars) + 1 && t.x + along < Math.max(...bars) - 1, `table at (${t.x}, ${t.z}) inside the barriers`);
  }
  const rows = [...new Set(S.tables.map((t) => t.z))].sort((a, b) => a - b);
  assert.equal(rows.length, 2);
  assert.ok(rows[1] - rows[0] - 2 * laneSide >= S.lane, 'the lane between the rows');
  // Not in front of a hẻm mouth, the bar's door or the fire-breather.
  const mouths = QUAN_1_SOUTH.arterials.filter((a) => a.cls === 'hem' && [a.pts[1], a.pts.at(-1)].includes(250)).map((a) => [a.pts[0], a.pts[1] === 250 ? a.pts[3] : a.pts.at(-3)]);
  for (const [x, other] of mouths) for (const t of S.tables.filter((q) => (other < 250) === (q.z < 250))) assert.ok(Math.abs(t.x - x) > 2.5, `table at (${t.x}, ${t.z}) clear of the hẻm mouth at x ${x}`);
  const door = QUAN_1_SOUTH_EXTRA.story['bui-vien-bar'].door, fire = QUAN_1_SOUTH_EXTRA.activities['fire-breather'];
  assert.ok(S.tables.every((t) => Math.hypot(t.x - door.x, t.z - door.z) > 3.5 && Math.abs(t.x - fire.x) > 2.5), 'clear of the bar door and the fire-breather');
});

test('P1 hẻm and addresses: Quận 3 opens onto its hẻm, every house has its own address, a hẻm house is "n/k" on its street', () => {
  const g = p1.stack.graph;
  // Share of doors on hẻm per slice: Quận 3 is "biệt thự · hẻm · cà phê", none falls below a fifth.
  const FLOOR = { 'quan-3': 0.3, 'quan-4': 0.3, 'binh-thanh': 0.2, 'quan-1-south': 0.3, 'thu-thiem': 0.3 };
  for (const s of p1.slices) {
    const doors = s.data.buildings.map((b) => g.nearestEdge(b.curb.x, b.curb.z, 30)?.edge.cls);
    const share = doors.filter((c) => c === 'hem').length / doors.length;
    assert.ok(share >= FLOOR[s.key], `${s.key}: ${(100 * share).toFixed(0)}% of doors on hẻm (floor ${100 * FLOOR[s.key]}%)`);
  }
  assert.ok(sliceOf('quan-3').data.buildings.filter((b) => b.typology === 'villa').length >= 10, 'Quận 3 villas');
  // No address twice on one street in the stack (house subtitles are "address street").
  const seen = new Map();
  for (const s of p1.slices) for (const b of s.data.buildings) {
    if (b.stamp || b.subtitle.includes('•') || !b.subtitle.startsWith(`${b.address} `)) continue;
    assert.ok(!seen.has(b.subtitle), `${b.subtitle}: ${s.key} (${b.x}, ${b.z}) and ${seen.get(b.subtitle)}`);
    seen.set(b.subtitle, `${s.key} (${b.x}, ${b.z})`);
  }
  assert.ok(seen.size > 300);
  // Houses on an authored "HẺM n STREET" are n/k on the street; generated hẻm carry their street's name.
  for (const s of p1.slices) {
    const lots = new Map(s.data.lots.map((l) => [l.key, l])), arts = new Map(s.layout.arterials.map((a) => [a.id, a]));
    for (const b of s.data.buildings) {
      const a = arts.get(lots.get(b.lot)?.line), o = a && a.cls === 'hem' && hemOf(a.name);
      if (o) assert.ok(b.address.startsWith(`${o.n}/`), `${b.name} on ${a.name}: ${b.address}`);
    }
    for (const h of s.data.hems) assert.match(h.name, /^HẺM \d+(\/\d+)* \S/, `${s.key}: ${h.name} names its street`);
  }
  // The Bàn Cờ deliveries (GPS off) have a maze of nested addresses to find.
  const r = QUAN_3_EXTRA.activities.banCoDeliveries.rect;
  const nested = sliceOf('quan-3').data.buildings.filter((b) => b.door.x > r.minX && b.door.x < r.maxX && b.door.z > r.minZ && b.door.z < r.maxZ && b.address.includes('/'));
  assert.ok(nested.length >= 25, `${nested.length} nested addresses in the Bàn Cờ delivery rect`);
});

test('P1 edges: the Chợ Lớn edge of Quận 3 is closed by hoarding and lô cốt; Bình Thạnh and Thủ Thiêm have theirs beyond the outer sidewalks', () => {
  // Quận 3 (x -380): hoarding runs and lô cốt on one line leave no opening a person fits through, kè to Tàu Hũ.
  const E = QUAN_3_EXTRA.edge, spans = [];
  for (const id of E.fences) { const f = QUAN_3.fences.find((q) => q.id === id), d = sliceOf('quan-3').data.fences.find((q) => q.id === id); assert.ok(d.panels > 0 && !d.gates.length, `${id} laid, no gate`); spans.push([Math.min(f.pts[1], f.pts[3]), Math.max(f.pts[1], f.pts[3])]); assert.equal(f.pts[0], E.x); }
  for (const l of QUAN_3_EXTRA.loCot) { assert.equal(l.x, E.x, `${l.road}'s lô cốt on the hoarding line`); spans.push([l.z - l.w / 2, l.z + l.w / 2]); }
  spans.sort((a, b) => a[0] - b[0]);
  assert.ok(spans[0][0] <= 230.5 && spans.at(-1)[1] >= 440, 'from the Nhiêu Lộc kè to Võ Văn Kiệt\'s canal-side sidewalk');
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] - spans[i - 1][1] < 0.6, `no opening between z ${spans[i - 1][1]} and ${spans[i][0]}`);
  // Every Quận 3 road end at the edge is under its lô cốt across asphalt and sidewalks.
  for (const l of QUAN_3_EXTRA.loCot) { const a = QUAN_3.arterials.find((q) => q.id === l.road), half = a.half ?? (a.cls === 'R1' ? 7 : 4.5), sw = a.sidewalk ?? (a.cls === 'R1' ? 5.5 : 3); assert.ok(l.w >= 2 * (half + sw) - 0.01, `${l.road}: lô cốt ${l.w} m across ${2 * (half + sw)} m`); }
  // Bình Thạnh: the hoarding beyond Nơ Trang Long's west sidewalk, river park to the Nhiêu Lộc kè, its lô cốt on it.
  const B = BINH_THANH_EXTRA.p2.edge;
  assert.ok(B.x <= -700 - 7 - 5.5 && B.z0 <= -137.6 && B.z1 >= 200);
  for (const l of BINH_THANH_EXTRA.p2.loCot) assert.equal(l.x, B.x);
  // Thủ Thiêm: beyond Trần Não's and Tố Hữu's outer sidewalks (R1 centred on x -440 and z -420), lô cốt on the lines.
  const T = THU_THIEM_EXTRA.edge;
  assert.ok(T.west <= -440 - 12.5 && T.north <= -420 - 12.5 && T.east > 680);
  for (const l of THU_THIEM_EXTRA.loCot) assert.ok(l.z === T.north || l.x === T.east, `lô cốt at (${l.x}, ${l.z}) on the hoarding line`);
});

test('P1 roundabouts, the terminus and the piers: room for Công xã Paris\'s ring, kiosks clear of Bến Thành\'s, bays where the rule allows', () => {
  // Islands, statues and rims wait for roads.ts: the nodes are priority crossroads until then.
  for (const r of [...QUAN_3_EXTRA.roundabouts, ...QUAN_1_SOUTH_EXTRA.statues]) assert.equal(r.until, 'roundabout', `${r.name ?? r.id} waits for the roundabout`);
  const at = (x, z) => p1.stack.graph.nodes.find((n) => Math.hypot(n.x - x, n.z - z) < 0.5);
  for (const j of [...QUAN_1_SOUTH.junctions, ...QUAN_3.junctions].filter((q) => q.control === 'roundabout')) assert.equal(at(j.x, j.z).control, 'priority');
  // Công xã Paris (r 14, R1 sidewalk 5.5): the cathedral's front leaves a forecourt beyond the ring's sidewalk.
  const cxp = QUAN_1_SOUTH.junctions.find((j) => j.x === 162 && j.z === 216), cath = QUAN_1_SOUTH.stamps.find((s) => s.id === 'nha-tho-duc-ba');
  assert.ok(cath.z - cath.d / 2 - cxp.z >= cxp.radius + 5.5 + 2, 'the cathedral front 2 m or more beyond the ring\'s sidewalk');
  // Bến Thành (r 20): every metro kiosk corner 27 m or more from its centre (outside the ring and its sidewalk).
  const bt = QUAN_1_SOUTH.junctions.find((j) => j.x === 270 && j.z === 300);
  for (const k of QUAN_1_SOUTH.stamps.filter((s) => s.id.startsWith('ga-ben-thanh'))) for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = k.x + (i * k.w) / 2, cz = k.z + (j * k.d) / 2;
    assert.ok(Math.hypot(cx - bt.x, cz - bt.z) >= bt.radius + 5.5 + 1.5, `${k.id}: corner ${Math.hypot(cx - bt.x, cz - bt.z).toFixed(1)} m from Bến Thành`);
  }
  // Curb uses the generator does not lay ('bus') are in the slice's EXTRA, on a road wide enough for a bay.
  for (const s of p1.slices) for (const a of s.layout.arterials) for (const use of a.curb ?? []) {
    if (use !== 'bus') continue;
    assert.ok((a.half ?? 7) >= 9, `${a.id}: bus bays need asphalt half-width 9`);
    assert.ok(EXTRA[s.key].bus?.bays?.some((b) => b.road === a.id && b.kind === 'bus') && EXTRA[s.key].bus.route === a.id, `${a.id}: its bus bays and route in ${s.key}'s EXTRA`);
  }
  // Bến Nhà Rồng's pier: on the quay between the canal mouth and the museum, 20 m or more clear of the cargo hull.
  const ship = STORY_STAMP['cargo-ship'], [dock] = QUAN_4_EXTRA.docks;
  assert.ok(dock.pier.minX > 432 && dock.pier.maxX < 466 && ship.x - ship.w / 2 - dock.pier.maxX >= 20 && dock.pier.maxZ > -137.6 && dock.pier.minZ < -137.6);
  assert.ok(sliceOf('quan-4').data.scenery.props.filter((p) => p.kind === 'bollard' && Math.abs(p.x - dock.x) < 7 && Math.abs(p.z + 136.9) < 0.1).length === 2, 'its mooring posts on the quay');
});

test('P1 Bình Thạnh: the Nhiêu Lộc bank is the renovated canal\'s kè and park, no stilt houses; Quận 4 builds the Xóm Chiếu church', () => {
  const bt = sliceOf('binh-thanh').data;
  assert.equal(bt.buildings.filter((b) => b.typology === 'stilt').length, 0);
  assert.ok(!bt.waters.some((w) => w.banks.some((b) => b.kind === 'mud')));
  assert.ok(BINH_THANH.zoning.some((z) => z.zone === 'park' && z.name === BINH_THANH_EXTRA.canalPark.name && inPolyJs(z.poly, -600, 196)));
  assert.ok(sliceOf('quan-4').data.buildings.some((b) => b.name === 'NHÀ THỜ XÓM CHIẾU' && b.typology === 'church'));
});

/** Crossing-number point-in-polygon and point-to-box distance, for the tests above. */
function inPolyJs(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) if ((poly[i + 1] > z) !== (poly[j + 1] > z) && x < ((poly[j] - poly[i]) * (z - poly[i + 1])) / (poly[j + 1] - poly[i + 1]) + poly[i]) inside = !inside;
  return inside;
}
function obbDist(b, x, z) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw), dx = x - b.cx, dz = z - b.cz;
  return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - b.hx), Math.max(0, Math.abs(dx * s + dz * c) - b.hz));
}

/** A point inside a face (beside the middle of its longest side), as blocks.ts finds its label. */
function labelOf(face) {
  const n = face.length / 2;
  let best = 0, bl = -1;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, l = Math.hypot(face[j * 2] - face[i * 2], face[j * 2 + 1] - face[i * 2 + 1]); if (l > bl) { bl = l; best = i; } }
  const i = best, j = (i + 1) % n, dx = face[j * 2] - face[i * 2], dz = face[j * 2 + 1] - face[i * 2 + 1], l = Math.hypot(dx, dz);
  return [face[i * 2] + dx / 2 - (dz / l) * 3, face[i * 2 + 1] + dz / 2 + (dx / l) * 3];
}
