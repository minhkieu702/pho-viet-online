// node --experimental-transform-types --test scripts/night.test.mjs
// The night core (E:/pvo-work/night/plan.md §3, §4, §10.1): brighter nights (atmosphere.ts), the shared NIGHT uniforms,
// opening-hour schedules and rhythms (night.ts), and when each lit thing is lit (night-hours.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';

// The game modules use extensionless imports (Vite style); teach node to try `.ts`.
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

const night = await import('../app/game/night.ts');
const atmo = await import('../app/game/atmosphere.ts');
const hours = skip ? null : await import('../app/game/night-hours.ts');
const counters = skip ? null : await import('../app/game/counters.ts');
const wm = skip ? null : await import('../app/game/map/world-map.ts');
const facades = skip ? null : await import('../app/game/facades.ts');
const { NIGHT, OPEN_SLOTS, HOME, OFFICE, FLATS } = night;

const near = (actual, expected, eps, what) => assert.ok(Math.abs(actual - expected) <= eps, `${what}: ${actual} (want ${expected} ± ${eps})`);
/** A seeded 0..1 stream (Park–Miller), so random picks are the same every run. */
const seeded = (seed) => { let v = seed % 2147483646 + 1; return () => (v = (v * 16807) % 2147483647) / 2147483647; };

// ---- 1. Schedules --------------------------------------------------------------------------------------------------

test('schedules: openLevel > 0 exactly when counters.isOpen, 1 inside, 0 outside', { skip }, () => {
  const { COUNTERS, PLACES, isOpen } = counters;
  const all = new Map();
  for (const p of PLACES) if (p.kind === 'counter' && COUNTERS[p.key]) all.set(JSON.stringify(COUNTERS[p.key].hours), COUNTERS[p.key].hours);
  for (const h of Object.values(hours.VENUE_HOURS)) all.set(JSON.stringify(h), h);
  assert.ok(all.size > 40, `distinct schedules ${all.size}`);
  for (const h of all.values()) {
    for (const [a, b] of h) assert.ok(b > a, `counters.ts spans run forward (${JSON.stringify(h)}): isOpen reads [a, b) literally`);
    const probes = [23.99, 0.01, 12];
    for (let q = 0; q < 96; q++) probes.push(q / 4);
    for (const [a, b] of h) for (const edge of [a, b]) for (const d of [-0.01, 0.01]) probes.push((((edge + d) % 24) + 24) % 24);
    for (const hour of probes) {
      assert.equal(night.openLevel(h, hour) > 0, isOpen(h, hour), `${JSON.stringify(h)} at ${hour}`);
    }
    // Exactly 1 at least 0.1 h inside an opening, exactly 0 outside.
    const arcs = night.normalizeSchedule(h);
    for (let m = 0; m < 24 * 60; m += 7) {
      const hour = m / 60, level = night.openLevel(h, hour);
      if (!isOpen(h, hour)) { assert.equal(level, 0, `${JSON.stringify(h)} closed at ${hour}`); continue; }
      if (!arcs) { assert.equal(level, 1); continue; }
      const deep = arcs.some(([a, b]) => { const t = hour >= a ? hour : hour + 24; return t >= a + 0.1 && t <= b - 0.1; });
      if (deep) assert.equal(level, 1, `${JSON.stringify(h)} well inside at ${hour}`);
    }
  }
  // The closing ramp ends at the closing time (the shutter drops then); the opening one is already on at the opening minute.
  const coba = COUNTERS.coba.hours;
  assert.equal(night.openLevel(coba, 22.5), 0);
  assert.ok(night.openLevel(coba, 22.49) > 0 && night.openLevel(coba, 22.49) < 0.2);
  assert.ok(night.openLevel(coba, 6) > 0 && night.openLevel(coba, 6) < 0.25);
  assert.equal(night.openLevel(coba, 6.1), 1);
  assert.equal(night.openLevel(coba, 22.4), 1);
});

test('schedules: wrapped input, all day, merging across midnight', () => {
  assert.equal(night.scheduleIndex([[17, 2]]), night.scheduleIndex([[17, 26]]));
  assert.deepEqual(night.normalizeSchedule([[17, 2]]), [[17, 26]]);
  assert.equal(night.normalizeSchedule([[0, 24]]), null, '[[0, 24]] is always open');
  const allDay = night.scheduleIndex([[0, 24]]);
  assert.ok(allDay >= 1 && allDay < OPEN_SLOTS, '[[0, 24]] has its own slot');
  assert.deepEqual(night.normalizeSchedule([[17, 24], [0, 2]]), [[17, 26]], 'two spans meeting at midnight are one');
  assert.deepEqual(night.normalizeSchedule([[20, 28]]), [[20, 28]]);
  assert.deepEqual(night.normalizeSchedule([[6, 13.5], [16.5, 21.5]]), [[6, 13.5], [16.5, 21.5]]);
  assert.equal(night.openLevel([[17, 24], [0, 2]], 0), 1, 'no dip at midnight inside one opening');
  assert.equal(night.openLevel([[0, 24]], 0), 1);
  assert.equal(night.openLevel([[20, 28]], 3), 1);
  assert.equal(night.openLevel([[20, 28]], 4), 0);
});

test('schedules: registered at load, at most 90, none added by a district build', { skip }, async () => {
  const count = night.scheduleCount();
  assert.ok(hours.SCHEDULES_AT_LOAD <= 90, `${hours.SCHEDULES_AT_LOAD} schedules at load (the table holds ${OPEN_SLOTS - 1}; raise OPEN_SLOTS past 90)`);
  console.log(`night: ${hours.SCHEDULES_AT_LOAD} opening-hour schedules registered at load (${wm.WIRED_KEYS.length} slices wired)`);
  // Every counter's, venue's and timed item's schedule is already in the table.
  const { COUNTERS, PLACES } = counters;
  for (const p of PLACES) if (p.kind === 'counter' && COUNTERS[p.key]) night.scheduleIndex(COUNTERS[p.key].hours);
  for (const e of wm.DISTRICT_SCENERY.eateries) hours.timedCode(e.hours);
  for (const e of wm.EDGE_INFO) if (e.closed) hours.timedCode(typeof e.closed[0] === 'number' ? e.closed : e.closed[0]);
  assert.equal(night.scheduleCount(), count, 'a schedule was missing from the load-time registration');
  // A district build through a kit that records nothing registers nothing new.
  const { planDistricts } = await import('../app/game/district-render.ts');
  const kit = new Proxy(function kit() {}, {
    get(_, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === Symbol.iterator) return function* none() {};
      if (p === 'then') return undefined;
      if (p === 'lit') return (_code, draw) => draw();
      return kit;
    },
    apply() { return kit; },
  });
  let items = [];
  try { items = planDistricts(kit); } catch { /* the recording kit is not a real one: what ran is what counts */ }
  for (const item of items) { try { item.draw(); } catch { /* as above */ } }
  assert.equal(night.scheduleCount(), count, 'planning or drawing a district registered a schedule mid-game');
});

test('schedules: past the table a schedule lights with the night (one warning, no throw)', () => {
  const src = `const n = await import(${JSON.stringify(new URL('../app/game/night.ts', import.meta.url).href)});
    let warned = 0; console.warn = () => { warned++; };
    const codes = []; for (let i = 0; i < 110; i++) codes.push(n.scheduleIndex([[i * 0.2, i * 0.2 + 1]]));
    console.log(JSON.stringify({ last: codes.slice(-3), max: Math.max(...codes), warned, count: n.scheduleCount() }));`;
  const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--input-type=module', '-e', src], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.deepEqual(out.last, [0, 0, 0]);
  assert.equal(out.max, OPEN_SLOTS - 1);
  assert.equal(out.count, OPEN_SLOTS - 1);
  assert.equal(out.warned, 1);
});

// ---- 2. Buildings and front kinds ----------------------------------------------------------------------------------

test('buildings: every building resolves; Cô Ba open at 20:30, closed at 23:00', { skip }, () => {
  for (const b of wm.WORLD_BUILDINGS) {
    const L = hours.buildingLight(b.id);
    assert.ok(Number.isFinite(L.code), `building ${b.id}`);
    assert.ok(L.code === -1 || (L.code >= 0 && L.code < OPEN_SLOTS) || [HOME, OFFICE, FLATS].includes(L.code), `building ${b.id} code ${L.code}`);
  }
  const coba = counters.PLACES.find((p) => p.kind === 'counter' && p.name === 'CÀ PHÊ CÔ BA');
  assert.ok(coba, 'Cà phê Cô Ba is a counter');
  const L = hours.buildingLight(coba.building);
  assert.equal(L.kind, 'cafe');
  assert.equal(L.words, 'CÀ PHÊ');
  assert.equal(L.code, night.scheduleIndex([[6, 22.5]]));
  night.updateNightTables(20.5);
  assert.equal(NIGHT.nightOpen.value[L.code], 1, 'open at 20:30');
  night.updateNightTables(23);
  assert.equal(NIGHT.nightOpen.value[L.code], 0, 'closed at 23:00');
});

test('buildings: district counters give their own hours; counterOf never returns a table, kiosk or cart', { skip }, () => {
  const { COUNTERS, PLACES } = counters;
  const district = PLACES.filter((p) => p.kind === 'counter' && /^d\d+$/.test(p.id));
  assert.ok(district.length > 500, `${district.length} district building counters`);
  const rand = seeded(20261027);
  for (let i = 0; i < 20; i++) {
    const p = district[Math.floor(rand() * district.length)];
    assert.equal(hours.buildingLight(p.building).code, night.scheduleIndex(COUNTERS[p.key].hours), `${p.id} ${p.key}`);
    assert.equal(hours.counterOf(p.building).place.id, p.id);
  }
  for (const b of wm.WORLD_BUILDINGS) {
    const c = hours.counterOf(b.id);
    if (c) assert.ok(/^[bd]\d+$/.test(c.place.id), `building ${b.id} → ${c.place.id}`);
  }
});

test('buildings: district fronts take their kind from the counter, food only for food trades', { skip }, () => {
  const { COUNTERS } = counters;
  for (const [key, def] of Object.entries(COUNTERS)) {
    const f = hours.frontOfCounter(hours.baseKey(key), def);
    if (f?.[0] === 'food' && !(hours.baseKey(key) in facades.FRONT_OF)) assert.ok(['food', 'beer', 'cart', 'stall'].includes(def.kind), `${key} (${def.kind}) → food`);
  }
  // The district k.house businesses (count-legacy.mjs's filter): how many draw a food front now.
  let total = 0, food = 0;
  const kinds = {};
  for (const b of wm.DISTRICT_BUILDINGS) {
    if (b.kind === 'home') continue;
    const pl = wm.genPlot(b.id);
    if (!pl || !(['tube', 'shophouse', 'stilt'].includes(pl.typology) || (pl.typology === 'landmark' && (b.kind === 'food' || b.kind === 'shop')))) continue;
    total++;
    const k = hours.buildingLight(b.id).kind ?? 'none';
    kinds[k] = (kinds[k] ?? 0) + 1;
    if (k === 'food') food++;
  }
  console.log(`night: district k.house businesses ${total}, fronts by kind ${JSON.stringify(kinds)}`);
  assert.ok(total > 300, `${total} district shop fronts`);
  // Plan §10.1: at wired 5, 274 food + 21 beer + 49 stall = 344 of 714 (today 486 fall back to 'food' alone).
  assert.ok(food <= Math.ceil(total * (344 / 714)) + 2, `${food} of ${total} district fronts are food`);
});

test('buildings: windows by what the building is', { skip }, () => {
  const byTyp = (t) => wm.DISTRICT_BUILDINGS.find((b) => wm.genBuilding(b.id)?.typology === t);
  for (const t of ['warehouse', 'pagoda', 'church', 'market-hall', 'school']) { const b = byTyp(t); if (b) assert.equal(hours.windowCode(b.id), -1, t); }
  const apartment = byTyp('apartment');
  if (apartment) assert.equal(hours.windowCode(apartment.id), FLATS);
  const office = wm.WORLD_BUILDINGS.find((b) => b.kind === 'office' && !hours.counterOf(b.id));
  if (office) assert.equal(hours.windowCode(office.id), OFFICE);
  const homeB = wm.WORLD_BUILDINGS.find((b) => b.kind === 'home');
  assert.equal(hours.windowCode(homeB.id), HOME);
  assert.equal(hours.buildingLight(homeB.id).code, HOME);
});

// ---- 3. Sun and lamps ----------------------------------------------------------------------------------------------

test('sun and lamps: elevation, lamp switch hours, staggered by seed', () => {
  near(atmo.sunElevation(17.75), 0.08, 0.01, 'elevation 17:45');
  near(atmo.sunElevation(18.25), -0.08, 0.01, 'elevation 18:15');
  const lamps = (h) => atmo.lampsAt(atmo.sunElevation(h));
  assert.equal(lamps(17.6), 0);
  assert.equal(lamps(18.3), 1);
  assert.equal(lamps(5.6), 1);
  assert.equal(lamps(6.3), 0);
  near(lamps(18), 0.5, 0.01, 'half the lamps at 18:00');
  // Each lamp switches at its own moment inside 17:45–18:15, later for a higher seed.
  let last = 0;
  for (let s = 0.001; s < 1; s += 0.037) {
    let at = NaN;
    for (let h = 17.5; h <= 18.5; h += 0.002) if (night.nightLightJs(s, { level: 1, lamps: lamps(h) })[0] >= 0.5) { at = h; break; }
    assert.ok(at >= 17.74 && at <= 18.26, `seed ${s} switches at ${at}`);
    assert.ok(at >= last, `seed ${s} switches at ${at}, before a lower seed (${last})`);
    last = at;
  }
  // lampSeed: in 0.001..0.999, the same for a head and its pool (rounded to 0.5 m).
  for (let i = 0; i < 200; i++) {
    const x = Math.round((i * 37.1) % 400 - 200) / 2 + 0.1, z = Math.round((i * 53.7) % 400 - 200) / 2 - 0.1, s = night.lampSeed(x, z);
    assert.ok(s >= 0.001 && s <= 0.999);
    assert.equal(night.lampSeed(x + 0.05, z - 0.05), s, 'a pool a few cm off its head hashes the same');
  }
});

// ---- 4. Atmosphere ---------------------------------------------------------------------------------------------------

function sky(weather, hour, zombie = false) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#dce7e6', 120, 260);
  scene.background = new THREE.Color('#dce7e6');
  const hemi = new THREE.HemisphereLight('#fff2d2', '#789a8c', 2.55), sun = new THREE.DirectionalLight('#ffe5be', 3.7);
  const a = atmo.createAtmosphere(scene, sun, hemi, hour);
  a.setWeather(weather);
  if (zombie) a.setApocalypse(true);
  // One long step: rain, cover and the zombie mood all reach their targets (dt·0.25, dt·0.2, dt·0.6 ≥ 1).
  a.update(5, 0, new THREE.Vector3());
  a.setHours(hour);
  a.update(1e-6, 0, new THREE.Vector3());
  return { a, hemi, sun, scene };
}
const sameColor = (c, hex, what, eps = 0.01) => { const w = new THREE.Color(hex); for (const k of ['r', 'g', 'b']) near(c[k], w[k], eps, `${what}.${k}`); };

test('atmosphere: a clear night is a little brighter (moonlit hemisphere, brighter moon, exposure 1.20)', () => {
  const { a, hemi, sun } = sky('clear', 21);
  near(hemi.intensity, 0.85, 0.01, 'hemi 21:00');
  sameColor(hemi.color, '#d3d8e4', 'hemi sky');
  sameColor(hemi.groundColor, '#8c7d68', 'hemi ground');
  near(sun.intensity, 0.5 * (1 - 0.15 * 0.25), 0.005, 'moon 21:00');
  near(a.exposure, 1.2, 1e-6, 'exposure 21:00');
  assert.equal(a.night, 1);
  assert.equal(a.lamps, 1);
});

test('atmosphere: noon is unchanged', () => {
  const { a, hemi, sun, scene } = sky('clear', 12);
  near(hemi.intensity, 2.55, 1e-6, 'hemi noon');
  sameColor(hemi.color, '#fff2d2', 'hemi sky noon', 1e-6);
  sameColor(hemi.groundColor, '#789a8c', 'hemi ground noon', 1e-6);
  near(sun.intensity, 3.7 * (1 - 0.15 * 0.25), 1e-6, 'sun noon');
  near(a.exposure, 1.14, 1e-9, 'exposure noon');
  assert.equal(a.night, 0);
  assert.equal(a.lamps, 0);
  sameColor(scene.fog.color, '#dce7e6', 'noon fog', 0.02);
});

test('atmosphere: a zombie night is unchanged', () => {
  const { a, hemi, sun, scene } = sky('clear', 21, true);
  near(hemi.intensity, 0.55 * 0.75, 1e-6, 'zombie hemi');
  sameColor(hemi.color, '#fff2d2', 'zombie hemi sky', 1e-6);
  sameColor(hemi.groundColor, '#789a8c', 'zombie hemi ground', 1e-6);
  near(sun.intensity, 0.35 * (1 - 0.65 * 0.25) * 0.7, 1e-6, 'zombie moon');
  near(a.exposure, 1.14, 1e-9, 'zombie exposure');
  // The old night horizon (#1c2433), 70 % into the night haze, and no skyglow.
  const want = new THREE.Color('#1c2433').lerp(new THREE.Color('#2a2c27'), 0.7);
  for (const k of ['r', 'g', 'b']) near(scene.fog.color[k], want[k], 1e-6, `zombie fog.${k}`);
});

test('atmosphere: a rainy night keeps most of its light and glows under the cloud', () => {
  const clear = sky('clear', 21), rain = sky('rain', 21);
  near(rain.hemi.intensity, 0.85 * (1 - 0.35 * 0.4), 0.01, 'hemi in rain at 21:00 (−14 %, not −35 %)');
  // Skyglow: the rainy night's fog is warmer (red over blue) and not darker than the clear night's.
  const f = rain.scene.fog.color, c = clear.scene.fog.color;
  assert.ok(f.r / f.b > c.r / c.b, `rain fog warmer: ${f.getHexString()} vs ${c.getHexString()}`);
  assert.ok(f.r + f.g + f.b >= c.r + c.g + c.b, 'rain fog not darker');
  // By day rain still darkens as it did.
  const day = sky('rain', 12);
  near(day.hemi.intensity, 2.55 * 0.65, 1e-6, 'hemi in rain at noon');
});

test('atmosphere: dusk and dawn ramps (plan §3.5)', () => {
  const rows = [[17.5, 2.28, 1.14], [17.75, 1.80, 1.145], [18, 1.27, 1.17], [18.25, 0.91, 1.195], [18.5, 0.85, 1.2]];
  for (const [h, hemiI, exposure] of rows) {
    const { a, hemi } = sky('clear', h);
    near(hemi.intensity, hemiI, 0.02, `hemi at ${h}`);
    near(a.exposure, exposure, 0.003, `exposure at ${h}`);
    // Dawn mirrors dusk.
    const dawn = sky('clear', 24 - h);
    near(dawn.hemi.intensity, hemiI, 0.02, `hemi at ${24 - h}`);
  }
  // The night never jumps: no step over 0.12 in hemi intensity per game minute through dusk.
  let prev = sky('clear', 17).hemi.intensity;
  for (let h = 17; h <= 19; h += 1 / 60) { const v = sky('clear', h).hemi.intensity; assert.ok(Math.abs(v - prev) < 0.12, `hemi jumps at ${h}`); prev = v; }
});

// ---- 5. Rhythms and the lit factor -----------------------------------------------------------------------------------

test('rhythms: keypoints and shape', () => {
  // [hour, home, office, flats] (plan §4.1's table; office at 21:00 is 0.42 by its own curve).
  const table = [[19.5, 0.85, 0.605, 0.9], [21, 0.85, 0.42, 0.9], [23.5, 0.4, 0.091, 0.605], [1, 0.15, 0.06, 0.375], [2, 0.08, 0.06, 0.2], [5, 0.215, 0.06, 0.26]];
  for (const [h, hm, of, fl] of table) {
    const t = night.rhythmClock(h);
    near(night.home(t), hm, 0.01, `home ${h}`);
    near(night.office(t), of, 0.01, `office ${h}`);
    near(night.flats(t), fl, 0.01, `flats ${h}`);
  }
  const mono = (f, from, to, dir, what) => { let p = f(from); for (let t = from; t <= to; t += 0.05) { const v = f(t); assert.ok(dir > 0 ? v >= p - 1e-9 : v <= p + 1e-9, `${what} at ${t}`); p = v; } };
  mono(night.home, 17.5, 19, 1, 'home rises in the evening');
  mono(night.home, 21.5, 25.5, -1, 'home goes to bed');
  mono(night.home, 28.5, 29.5, 1, 'home gets up');
  mono(night.office, 18, 24, -1, 'offices empty');
  mono(night.flats, 22, 27, -1, 'flats go to bed');
  near(night.tv(night.rhythmClock(21)), 1, 1e-9, 'TV at 21:00');
  near(night.tv(night.rhythmClock(2)), 0, 1e-9, 'no TV at 02:00');
});

test('lit factor: codes decode as plan §2.2, day glow kept by nightDayBase', () => {
  const rhythm = new THREE.Vector4(0.5, 0.3, 0.7, 0);
  const open = new Float32Array(OPEN_SLOTS);
  open[5] = 1; open[6] = 0;
  const tube = 0.1 / 2.3;
  // Code 0 at noon: a tube keeps its day glow; a lamp is off. At night, on with the lamps.
  near(night.nightLightJs(0, { level: 0, lamps: 0, dayBase: tube, open, rhythm })[0], tube, 1e-9, 'tube code 0 at noon');
  assert.equal(night.nightLightJs(0, { level: 0, lamps: 0, open, rhythm })[0], 0);
  assert.equal(night.nightLightJs(0.5, { level: 1, lamps: 1, open, rhythm })[0], 1);
  // An open shop's tube at noon keeps its day glow; a closed one is dark; open at night it is full.
  near(night.nightLightJs(5, { level: 0, lamps: 0, dayBase: tube, open, rhythm })[0], tube, 1e-9, 'open shop tube at noon');
  assert.equal(night.nightLightJs(6, { level: 0, lamps: 0, dayBase: tube, open, rhythm })[0], 0);
  assert.equal(night.nightLightJs(5, { level: 1, lamps: 1, dayBase: tube, open, rhythm })[0], 1);
  assert.equal(night.nightLightJs(-1, { level: 1, lamps: 1, open, rhythm })[0], 0, 'never lit');
  // Rhythms: lit when the seed is under the share; offices ignore the TV.
  assert.equal(night.nightLightJs(HOME + 0.2, { level: 1, lamps: 1, open, rhythm })[0] > 0, true);
  assert.equal(night.nightLightJs(HOME + 0.6, { level: 1, lamps: 1, open, rhythm })[0], 0);
  assert.equal(night.nightLightJs(OFFICE + 0.2, { level: 1, lamps: 1, open, rhythm })[0], 1);
  assert.equal(night.nightLightJs(OFFICE + 0.4, { level: 1, lamps: 1, open, rhythm })[0], 0);
  assert.equal(night.nightLightJs(FLATS + 0.65, { level: 1, lamps: 1, open, rhythm })[0] > 0, true);
  assert.equal(night.nightLightJs(HOME + 0.2, { level: 0, lamps: 1, open, rhythm })[0], 0, 'windows dark without power');
  // TV: about 10 % of home windows when the TV share is 1; cool-white tubes about 45 %.
  const tvOn = new THREE.Vector4(1, 1, 1, 1);
  let tvs = 0, cool = 0;
  const rand = seeded(7);
  for (let i = 0; i < 2000; i++) { const s = rand() * 0.998; const r = night.nightLightJs(HOME + s, { level: 1, lamps: 1, open, rhythm: tvOn }); tvs += r[1]; cool += r[2]; }
  near(tvs / 2000, 0.1, 0.03, 'TV share');
  near(cool / 2000, 0.45, 0.04, 'cool-white share');
});

test('the per-frame writer: night × power, zombie opens every schedule, rhythms by the hour', () => {
  night.writeNight({ night: 1, lamps: 1, power: 1, hours: 23, wet: 0.5, rain: 1 });
  assert.equal(NIGHT.nightLevel.value, 1);
  assert.equal(NIGHT.nightLamps.value, 1);
  assert.equal(NIGHT.nightWet.value, 0.5);
  const coba = night.scheduleIndex([[6, 22.5]]);
  assert.equal(NIGHT.nightOpen.value[coba], 0);
  near(NIGHT.nightRhythm.value.x, night.home(23), 1e-6, 'home share at 23:00');
  night.writeNight({ night: 1, lamps: 1, power: 0, hours: 23, wet: 0, rain: 0 });
  assert.equal(NIGHT.nightLevel.value, 0);
  assert.equal(NIGHT.nightLamps.value, 0);
  assert.equal(NIGHT.nightSky.value, 1, 'the sky is still dark (vehicle lights)');
  for (let i = 1; i <= night.scheduleCount(); i++) assert.equal(NIGHT.nightOpen.value[i], 1, 'zombie mode: every schedule open (neon keeps its old glow)');
  night.writeNight({ night: 0, lamps: 0, power: 1, hours: 12, wet: 0, rain: 0 });
  assert.equal(NIGHT.nightOpen.value[coba], 1);
  night.writeNightDetail(4, 70);
  assert.equal(NIGHT.nightHaloFar.value, 120);
  assert.equal(NIGHT.nightShopFar.value, 70);
  night.writeNightFog(50, 150);
  assert.deepEqual(NIGHT.nightFog.value.toArray(), [50, 150]);
});

// ---- 7. Packing --------------------------------------------------------------------------------------------------

test('packing: sign glow and code round-trip', () => {
  for (const strength of [0.25, 0.5, 0.6, 0.9, 1]) for (const code of [0, 1, 63, 95]) {
    const g = night.packGlow(strength, code), back = night.unpackGlow(g);
    assert.equal(back.code, code, `code ${code} strength ${strength}`);
    near(back.strength, strength, 1e-9, `strength ${strength} code ${code}`);
    // The GLSL decode: floor(g * 0.5), g − 2·code (in float32).
    const f = Math.fround(g), c = Math.floor(f * 0.5);
    assert.equal(c, code);
    near(f - 2 * c, strength, 1e-5, 'float32 decode');
  }
});

// ---- 8. GLSL and program keys ----------------------------------------------------------------------------------------

test('GLSL: the table size, the patches and their program keys', () => {
  assert.ok(night.NIGHT_GLSL.includes(`nightOpen[${OPEN_SLOTS / 4}]`));
  assert.deepEqual([...night.NIGHT_PROGRAM_KEYS], ['night-role', 'night-tube', 'night-led', 'night-neon', 'far-windows']);
  assert.equal(new Set(night.NIGHT_PROGRAM_KEYS).size, night.NIGHT_PROGRAM_KEYS.length);
  const lamp = new THREE.MeshStandardMaterial(), lantern = new THREE.MeshStandardMaterial(), glassLit = new THREE.MeshStandardMaterial();
  const ownLamp = night.patchNight(lamp, 'night-role', { tint: true });
  night.patchNight(lantern, 'night-role');
  night.patchNight(glassLit, 'night-role', { cool: true });
  assert.equal(lamp.customProgramCacheKey(), 'night-role');
  assert.equal(lantern.customProgramCacheKey(), 'night-role');
  assert.equal(glassLit.customProgramCacheKey(), 'night-role');
  assert.equal(ownLamp.nightTint.value, 1);
  // A role with its own patch keeps it and chains the key.
  const tube = new THREE.MeshStandardMaterial();
  tube.onBeforeCompile = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n// tube-glow'); };
  tube.customProgramCacheKey = () => 'tube-glow';
  night.patchNight(tube, 'night-tube', { dayBase: 0.1 / 2.3 });
  assert.equal(tube.customProgramCacheKey(), 'tube-glow|night-tube');
  const far = new THREE.MeshStandardMaterial();
  night.patchFarWindows(far);
  assert.equal(far.customProgramCacheKey(), 'far-windows');
  // The patches find their anchors in three's standard shader and keep them.
  const compile = (material) => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader, null);
    return shader;
  };
  const s = compile(lamp);
  assert.ok(s.vertexShader.includes('attribute float aLit;') && s.vertexShader.includes('vNightL = nightLight(aLit);'));
  assert.ok(s.fragmentShader.includes('totalEmissiveRadiance = nightE * vNightL.x;') && s.fragmentShader.includes('#include <aomap_fragment>'));
  assert.equal(s.uniforms.nightOpen, NIGHT.nightOpen, 'the shared uniform object, not a copy');
  assert.equal(s.uniforms.nightDayBase, ownLamp.nightDayBase);
  const t = compile(tube);
  assert.ok(t.fragmentShader.includes('// tube-glow') && t.fragmentShader.includes('vNightL.x'), 'chained after the role patch');
  assert.equal(t.uniforms.nightDayBase.value, 0.1 / 2.3);
  const f = compile(far);
  assert.ok(f.fragmentShader.includes('farWin') && f.vertexShader.includes('vFarCode = aLit;'));
  // Identical source for the three night-role materials (they share one program per variant).
  assert.equal(compile(lantern).fragmentShader, compile(glassLit).fragmentShader);
  assert.equal(compile(lantern).vertexShader, s.vertexShader);
});
