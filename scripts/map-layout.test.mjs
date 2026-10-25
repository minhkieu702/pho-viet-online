// node --experimental-transform-types --test scripts/map-layout.test.mjs
// The map validator (critique step 13): generator v2 (app/game/map/build-district.ts) on a synthetic district
// (app/game/map/gen/sample.ts) and on every layout file under app/game/map/layout/. Each must pass
// gen/validate.ts (no building on another, a road or water; every door and seat reachable from the walking network;
// nothing solid in a lane, on a walking line or a crosswalk; roads inside the layout, joined to today's grid only
// through portals on fence ends; junctions without slivers; decks only over water, with a height, never over a
// road), generate the same bytes twice, keep untouched blocks byte-identical when one block changes or the streets
// are listed in another order, build in under 150 ms and stay within design 2's instance budget. Slices stack, water
// inside a block is kept clear, hẻm are lived in, and Quận 4's port, Vĩnh Khánh and blocks keep their design.
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

// Layout files: every export of app/game/map/layout/*.ts (types.ts aside) that looks like a DistrictLayout.
const LAYOUT_DIR = fileURLToPath(new URL('../app/game/map/layout/', import.meta.url));
const files = readdirSync(LAYOUT_DIR).filter((f) => f.endsWith('.ts') && f !== 'types.ts').sort();
const layouts = [{ name: 'sample (synthetic)', layout: SAMPLE_LAYOUT }];
for (const f of files) {
  const mod = await import(pathToFileURL(`${LAYOUT_DIR}${f}`).href);
  for (const [name, value] of Object.entries(mod)) if (isLayout(value)) layouts.push({ name: `${f}:${name}`, layout: value });
}
const built = new Map(layouts.map(({ name, layout }) => [name, buildDistrict(layout, LEGACY_ROADS)]));

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
  for (const [name, d] of built) {
    const merged = createRoadGraph(applyPatch(inputOf(LEGACY_ROADS), d.graphPatch));
    for (let i = 0; i < LEGACY_ROADS.nodes.length; i++) assert.deepEqual([merged.nodes[i].x, merged.nodes[i].z], [LEGACY_ROADS.nodes[i].x, LEGACY_ROADS.nodes[i].z]);
    // Every legacy approach keeps its pole and timing group; new ones appear only where a fence stub now carries
    // traffic into its junction (the portal's neighbour). Approach ids after those junctions shift by design.
    const key = (a) => `${a.node}:${a.edge}:${a.dir}:${a.group}:${a.pole.x}:${a.pole.z}`;
    const now = new Set(merged.approaches.map(key));
    for (const a of LEGACY_ROADS.approaches) assert.ok(now.has(key(a)), `${name}: legacy approach ${a.id} kept`);
    const opened = new Set(d.graphPatch.traffic.flatMap((e) => [LEGACY_ROADS.edges[e].a, LEGACY_ROADS.edges[e].b]));
    const was = new Set(LEGACY_ROADS.approaches.map(key));
    for (const a of merged.approaches) if (a.node < LEGACY_ROADS.nodes.length && !was.has(key(a))) assert.ok(opened.has(a.node), `${name}: new approach at legacy node ${a.node}`);
  }
});

for (const { name, layout } of layouts) {
  test(`${name}: passes the validator`, () => {
    const d = built.get(name);
    const issues = validateDistrict(layout, d, LEGACY_ROADS);
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

  test(`${name}: the order of the arterial list changes no block`, () => {
    const d = built.get(name), rev = buildDistrict({ ...layout, arterials: [...layout.arterials].reverse() }, LEGACY_ROADS);
    assert.deepEqual(rev.blockHashes, d.blockHashes);
    assert.equal(validateDistrict(layout, rev, LEGACY_ROADS).length, 0);
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
    const d = built.get(name), again = buildDistrict(layout, LEGACY_ROADS);
    assert.equal(again.hash, d.hash);
    assert.deepEqual(again.blockHashes, d.blockHashes);
    // Turn one busy block into a park (its houses, hẻm and dressing go): every other block keeps its bytes.
    const victim = d.blocks.filter((b) => b.buildings.length >= 6 && b.zone !== 'park').sort((a, b) => b.buildings.length - a.buildings.length)[0];
    assert.ok(victim, 'a block to edit');
    const block = d.blocks.find((b) => b.key === victim.key);
    const at = labelOf(block.face);
    const edited = buildDistrict({ ...layout, zoning: [{ zone: 'park', at }, ...(layout.zoning ?? [])] }, LEGACY_ROADS);
    assert.notEqual(edited.blockHashes[victim.key], d.blockHashes[victim.key], 'the edited block changed');
    const changed = Object.keys(d.blockHashes).filter((k) => k !== victim.key && edited.blockHashes[k] !== d.blockHashes[k]);
    assert.deepEqual(changed, [], 'other blocks changed');
    assert.deepEqual(Object.keys(edited.blockHashes).sort(), Object.keys(d.blockHashes).sort());
  });

  test(`${name}: builds in under 150 ms and within the instance budget`, () => {
    const d = built.get(name);
    // Best of ten: node --test runs the test files side by side, and the clock also counts whatever else is busy.
    const wall = [];
    for (let i = 0; i < 10; i++) { const t = performance.now(); buildDistrict(layout, LEGACY_ROADS); wall.push(performance.now() - t); }
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
