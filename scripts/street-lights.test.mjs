// node --experimental-transform-types --test scripts/street-lights.test.mjs
// Night light on the ground (street-lights.ts, night plan §5, §6.3, §6.8, §10.1 #6): every lamp gets a tone (LED in
// Quận 1 south and Thủ Thiêm and on the arterials, warm hẻm lamps, park globes), the pools of the bridges, promenades,
// piers and docks lie on land or deck (none floats over the water, A7), the light mesh carries what each light is, and
// an open front of a new kind keeps its building's random stream (facades.ts frontDraws).
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import * as THREE from 'three';

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

const lights = await import('../app/game/street-lights.ts');
const facades = await import('../app/game/facades.ts');
const night = await import('../app/game/night.ts');
const wm = skip ? null : await import('../app/game/map/world-map.ts');
const city = skip ? null : await import('../app/game/city.ts');
const districts = skip ? null : await import('../app/game/map/districts.ts');
const render = skip ? null : await import('../app/game/district-render.ts');
const { TONES, HEAD, legacyTone, districtTone, aimedLight, toneLight, makeLight, buildLightMesh, createLightMaterials, createLightStore, poolRim } = lights;

/** The world.ts frame (lx along the front, lz out of it). */
function frameAt(x, z, facing, k) {
  const c = Math.cos(facing), s = Math.sin(facing);
  const wx = (lx, lz) => x + lx * c + lz * s, wz = (lx, lz) => z - lx * s + lz * c;
  const none = () => {};
  return {
    facing, at: (lx, lz) => ({ x: wx(lx, lz), z: wz(lx, lz) }), local: (px, pz) => ({ x: (px - x) * c - (pz - z) * s, z: (px - x) * s + (pz - z) * c }),
    part: none, solid: none, decal: none, cloth: none, smoke: none, tag: none,
    pool: (lx, lz, size, shop, color, strength) => k.pool(wx(lx, lz), wz(lx, lz), size, shop, color, strength),
  };
}
/** A district kit that draws nothing and records every light (as world.ts makes them), with the scope's code. */
function recordingKit() {
  const out = [];
  let code = 0;
  const k = {
    out,
    lit: (c, draw) => { const saved = code; code = c; try { return draw(); } finally { code = saved; } },
    light: (tone, x, z, headY, scale = 1, gain = 1, groundY, color) => out.push({ what: 'light', tone, code, color, l: toneLight(tone, x, groundY ?? 0, z, Math.max(0, headY - (groundY ?? 0)), code, scale, gain) }),
    streetLamp: (tone, px, pz, hx, hz, headY, scale = 1) => out.push({ what: 'street', tone, code, l: aimedLight(tone, px, pz, hx, hz, 0, headY, code, scale) }),
    pool: (x, z, size, shop, color, strength) => out.push({ what: 'pool', code, l: makeLight(x, 0, z, size, 0, code, color ?? '#ffffff', strength ?? 0.5, '#000000', 0) }),
    frame: (x, z, facing) => frameAt(x, z, facing, k),
  };
  // Anything else: a callable that answers every property with itself (draws nothing).
  const none = new Proxy(function none() {}, {
    get: (_, p) => (p === Symbol.toPrimitive ? () => 0 : p === Symbol.iterator ? function* empty() {} : p === 'then' ? undefined : none),
    apply: () => none,
  });
  return new Proxy(k, { get: (t, p) => (p in t ? t[p] : none) });
}

test('tones: every lamp of today\'s map and the districts has one, by street, slice and kind', { skip }, () => {
  const counts = {};
  for (const l of city.SCENERY.lamps) {
    const t = legacyTone(l.kind, l.hx, city.DOWNTOWN_X);
    assert.ok(t in TONES);
    counts[`today ${t}`] = (counts[`today ${t}`] ?? 0) + 1;
    if (l.kind === 'post') assert.equal(t, 'park');
  }
  for (const l of wm.DISTRICT_SCENERY.lamps) {
    const t = districtTone(l.kind, l.slice, wm.WORLD_ROADS.edgesNear(l.hx, l.hz, 14)[0]?.edge.cls ?? null);
    assert.ok(t in TONES, `${l.slice} ${l.kind} lamp at ${l.x}, ${l.z}`);
    counts[`${l.slice} ${t}`] = (counts[`${l.slice} ${t}`] ?? 0) + 1;
    if (l.kind === 'wall') assert.equal(t, 'warm');
    if (l.kind === 'post') assert.equal(t, 'park');
    if (l.kind === 'street' && (l.slice === 'quan-1-south' || l.slice === 'thu-thiem')) assert.equal(t, 'led');
  }
  console.log(`  lamps by tone: ${JSON.stringify(counts)}`);
  assert.ok(wm.DISTRICT_SCENERY.lamps.length > 500, 'the wired districts have their lamps');
});

test('a street lamp throws its pool over the road, drawn out along the street, its halo at the head', () => {
  // A pole at the origin, its arm reaching +x over the road (the street runs along z).
  const l = aimedLight('sodium', 0, 0, 1.1, 0, 0.1, HEAD.street, 0.5);
  assert.ok(Math.abs(l.x - (1.1 + 2.2)) < 1e-9 && Math.abs(l.z) < 1e-9, 'the pool lies out over the road');
  assert.equal(l.hx, 1.1);
  assert.ok(l.len > l.size, 'longer along the street than across');
  // The pool's long axis (its local z, turned by yaw) runs along the street: square to the arm.
  const along = [Math.sin(l.yaw), Math.cos(l.yaw)];
  assert.ok(Math.abs(along[0] * 1 + along[1] * 0) < 1e-9);
  const mesh = buildLightMesh([l, makeLight(5, 0.2, 5, 4, 0, 7, '#ffffff', 0.5, '#000000', 0)], createLightMaterials(), 'test');
  const m = mesh.instanceMatrix.array;
  // x axis across (size), y axis up to the head, z axis along (len), the centre.
  assert.ok(Math.abs(Math.hypot(m[0], m[1], m[2]) - l.size) < 1e-4);
  assert.ok(Math.abs(Math.hypot(m[8], m[9], m[10]) - l.len) < 1e-4);
  assert.ok(Math.abs(m[4] - (l.hx - l.x)) < 1e-4 && Math.abs(m[5] - HEAD.street) < 1e-4 && Math.abs(m[6]) < 1e-4);
  assert.deepEqual([...mesh.geometry.getAttribute('aLit').array], [0.5, 7]);
  // Two draws: the pools (modulated) and the glows and halos (screened); 12 vertices an instance.
  assert.deepEqual(mesh.geometry.groups.map((g) => [g.start, g.count, g.materialIndex]), [[0, 6, 0], [6, 12, 1]]);
  assert.equal(mesh.visible, false, 'hidden until the night shows it');
  assert.ok(mesh.boundingSphere.radius >= l.len, 'the bounding sphere covers the pool and its halo');
});

test('the light store: every light of the world in one mesh, appended range by range, grown in place', () => {
  const materials = createLightMaterials(), parent = new THREE.Group();
  const store = createLightStore(materials, 'Night lights', 64);
  parent.add(store.mesh);
  const some = (n, code) => Array.from({ length: n }, (_, i) => makeLight(i, 0, -i, 6, 3, code, '#ffd59a', 0.8, '#ffe2b0', 0.35));
  store.append(some(40, 0.25));
  const first = store.mesh;
  assert.equal(store.count, 40);
  assert.equal(first.count, 40, 'draws only the lights it holds');
  assert.equal(first.frustumCulled, false, 'one mesh for the world: not culled as a mesh');
  // A second tile's lights: only their range goes to the GPU.
  first.instanceMatrix.clearUpdateRanges();
  first.geometry.getAttribute('aLit').clearUpdateRanges();
  store.append(some(10, 3));
  assert.equal(store.mesh, first, 'still the same mesh within its capacity');
  assert.deepEqual(first.instanceMatrix.updateRanges, [{ start: 40 * 16, count: 10 * 16 }]);
  assert.deepEqual(first.geometry.getAttribute('aLit').updateRanges, [{ start: 40, count: 10 }]);
  assert.equal(first.geometry.getAttribute('aLit').array[45], 3);
  // Past its capacity it grows: a new mesh with everything so far takes the old one's place.
  first.visible = true;
  store.append(some(30, 7));
  const grown = store.mesh;
  assert.notEqual(grown, first);
  assert.equal(grown.parent, parent);
  assert.equal(first.parent, null);
  assert.equal(grown.visible, true, 'keeps its visibility (the night shows it)');
  assert.equal(store.count, 80);
  assert.ok(grown.instanceMatrix.count >= 80);
  const lit = grown.geometry.getAttribute('aLit').array;
  assert.deepEqual([lit[0], lit[39], lit[40], lit[49], lit[50], lit[79]], [0.25, 0.25, 3, 3, 7, 7]);
  assert.equal(grown.instanceMatrix.array[49 * 16 + 12], 9, 'the lights before the growth kept their places');
  assert.deepEqual(grown.geometry.groups.map((g) => [g.start, g.count, g.materialIndex]), [[0, 6, 0], [6, 12, 1]]);
  assert.equal(grown.material, materials);
  store.dispose();
  assert.equal(grown.parent, null);
});

test('light materials: one program key, pools modulated, halos screened; display colours, nothing tone-mapped', () => {
  const [pool, halo] = createLightMaterials();
  assert.equal(pool.customProgramCacheKey(), 'light-decal');
  assert.equal(halo.customProgramCacheKey(), 'light-decal');
  assert.equal(pool.vertexShader, halo.vertexShader);
  assert.equal(pool.blendSrc, THREE.DstColorFactor);
  assert.equal(halo.blendSrc, THREE.OneMinusDstColorFactor);
  for (const m of [pool, halo]) {
    assert.equal(m.blendDst, THREE.OneFactor);
    assert.equal(m.depthWrite, false);
    // The NIGHT uniforms are shared by reference, not copied.
    assert.equal(m.uniforms.nightLevel, night.NIGHT.nightLevel);
    assert.equal(m.uniforms.nightOpen, night.NIGHT.nightOpen);
    assert.ok(!/tonemapping_fragment|colorspace_fragment/.test(m.fragmentShader));
  }
  assert.ok(pool.vertexShader.includes(`nightOpen[${night.OPEN_SLOTS / 4}]`));
});

test('A7: no pool of a bridge, promenade, pier or dock lies over the water', { skip }, () => {
  const k = recordingKit();
  const items = render.planDistricts(k);
  for (const item of items) item.draw();
  const polys = [...districts.WATERS.map((w) => w.poly), ...wm.DISTRICT_WATERS.map((w) => w.poly)];
  const inPoly = (p, x, z) => {
    let inside = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  // Decks: on a deck edge's carriageway or footway within its span; piers: their rectangles.
  const deckEdges = new Map();
  for (const d of wm.DISTRICT_DECKS) {
    const id = wm.EDGE_INFO.findIndex((e) => e.slice === d.slice && (e.key === d.edge || e.key.startsWith(`${d.edge}:`)));
    if (id >= 0) deckEdges.set(id, [...(deckEdges.get(id) ?? []), [d.from, d.from + d.len]]);
  }
  const onDeck = (x, z) => wm.WORLD_ROADS.edgesNear(x, z, 30).some((h) => deckEdges.get(h.edge.id)?.some(([a, b]) => h.s >= a - 0.5 && h.s <= b + 0.5) && h.d <= h.edge.half + h.edge.sidewalk + 0.05);
  const piers = [];
  const q4 = wm.SLICE_EXTRA['quan-4'], bt = wm.SLICE_EXTRA['binh-thanh'], tt = wm.SLICE_EXTRA['thu-thiem'];
  for (const d of q4?.docks ?? []) piers.push(d.pier);
  for (const d of bt?.docks ?? []) piers.push({ minX: d.x - 2, maxX: d.x + 2, minZ: -152, maxZ: -134.6 });
  for (const w of tt?.waterbus ?? []) if (w.pier) piers.push(w.pier);
  for (const d of city.SCENERY.docks) piers.push(d.pier);
  const onPier = (x, z) => piers.some((r) => x >= r.minX - 0.05 && x <= r.maxX + 0.05 && z >= r.minZ - 0.05 && z <= r.maxZ + 0.05);
  const wet = [];
  let checked = 0;
  for (const { what, tone, l } of k.out) {
    if (l.r + l.g + l.b < 1e-6) continue;
    checked++;
    // The rim of the pool's ellipse, a little inside its soft edge (85 %: the light there is under 5 % of its centre's).
    for (const [x, z] of poolRim(l, 16)) {
      if (polys.some((p) => inPoly(p, x, z)) && !onDeck(x, z) && !onPier(x, z)) { wet.push(`${what} ${tone ?? ''} at ${l.x.toFixed(1)}, ${l.z.toFixed(1)} (rim ${x.toFixed(1)}, ${z.toFixed(1)})`); break; }
    }
  }
  console.log(`  ${checked} district pools checked against the water; ${wet.length} reach over it`);
  assert.deepEqual(wet, [], 'pools over the water');
});

test('the district plan draws lamps, bulbs, festoons and spill under the right codes', { skip }, () => {
  const k = recordingKit();
  const items = render.planDistricts(k);
  for (const item of items) item.draw();
  const by = {};
  for (const r of k.out) { const key = `${r.what} ${r.tone ?? ''}`.trim(); by[key] = (by[key] ?? 0) + 1; }
  console.log(`  district lights: ${JSON.stringify(by)} (${k.out.length} in all)`);
  // Street lamps light with the lamp switch (code 0 here: their seed is world.ts's); the kiosks' and the night venues'
  // light by their hours (the open fronts' spill comes from world.ts newHouse, which this kit does not draw).
  assert.ok((by['street sodium'] ?? 0) + (by['street led'] ?? 0) > 500);
  const scheduled = k.out.filter((r) => r.what === 'pool' && r.code >= 1 && r.code < night.OPEN_SLOTS);
  assert.ok(scheduled.length > 50, `${scheduled.length} kiosk and venue pools by their hours`);
  // Festoons over the closed streets, lit in their hours.
  const closed = new Set(wm.EDGE_INFO.filter((e) => e.closed).map((e) => night.scheduleIndex([e.closed])));
  assert.ok(k.out.some((r) => r.what === 'light' && r.tone === 'bulb' && closed.has(r.code)), 'festoons and their glow');
});

test('frontDraws: a front of a new kind leaves the building\'s stream where the old front left it', () => {
  const kinds = ['goods', 'pharmacy', 'gold', 'barber', 'tailor', 'repair', 'florist', 'food', 'cafe', 'home'];
  for (const kind of kinds) {
    let n = 0;
    const r = () => { n++; return ((n * 0.37) % 1); };
    const k = { pool: () => {} };
    facades.openFront(frameAt(0, 0, 0, k), r, { lx: 0, w: 4, h: 7, d: 10, front: 5, wall: '#ffffff', kind, shop: -1, drum: true, fine: () => {} });
    assert.equal(n, facades.frontDraws(kind), `${kind}: openFront draws ${n}`);
  }
});
