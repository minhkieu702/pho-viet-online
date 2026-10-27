// node --experimental-transform-types --test scripts/interact.test.mjs
// The interaction registry (design-real §1-3, critique step 7): best() picks what E does with the right priorities,
// crimes lose ties, closed counters answer but never win over a working one, hysteresis stops the prompt flickering;
// every counter on the map has a catalogue entry with Vietnamese names, prices and opening hours that wrap past
// midnight; effects, natural healing, the lottery and haggling follow services.ts. Pure modules only (no three.js).
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

const I = await import('../app/game/interact.ts');
const C = await import('../app/game/counters.ts');
const S = await import('../app/game/services.ts');
const { BUILDINGS, VENUES } = await import('../app/game/city.ts');

const ctxAt = (x, z, extra = {}) => ({
  x, z, heading: 0, onFoot: true, riding: false, inCar: false, swimming: false, hour: 10, day: 0, zombie: false, wanted: 0, cash: 100, bank: 0,
  armed: false, time: 0, witnesses: () => 0, notify: () => {}, menu: () => {}, ...extra,
});
const entry = (id, kind, x, z, extra = {}) => ({ id, kind, x, z, r: 3, prompt: () => ({ id, key: 'E', verb: id, label: '' }), use: () => {}, ...extra });

test('best(): own bike beats a parked bike to steal, a crime loses a tie, dim prompts lose to working ones', () => {
  const reg = I.createRegistry();
  reg.add(entry('steal', 'vehicle', 1, 0, { crime: 1, hold: 3 }));
  reg.add(entry('own', 'vehicle', 0, 1.2, { priority: I.OWN_VEHICLE }));
  assert.equal(reg.best(ctxAt(0, 0)).entry.id, 'own');
  const tie = I.createRegistry();
  tie.add(entry('rob', 'counter', 1, 0, { crime: 1 }));
  tie.add(entry('buy', 'counter', -1, 0));
  assert.equal(tie.best(ctxAt(0, 0)).entry.id, 'buy');
  const closed = I.createRegistry();
  closed.add(entry('closed', 'counter', 0.5, 0, { prompt: () => ({ id: 'closed', key: '', verb: 'Đóng cửa', label: '', dim: true }) }));
  closed.add(entry('seat', 'seat', 1.5, 0));
  assert.equal(closed.best(ctxAt(0, 0)).entry.id, 'seat');
  // At a closed shop's own door its hours answer, not the red theft prompt of the shop's parked bike.
  const door = I.createRegistry();
  door.add(entry('shut', 'counter', 0.4, 0, { prompt: () => ({ id: 'shut', key: '', verb: 'Đóng cửa', label: 'mở lại 8:00', dim: true }) }));
  door.add(entry('bike', 'vehicle', 0, 1.6, { crime: 1, hold: 3, r: 4.4 }));
  assert.equal(door.best(ctxAt(0, 0)).entry.id, 'shut');
  assert.equal(door.best(ctxAt(0, 2.5, { time: 5 })).entry.id, 'bike', 'a step away the bike is the thing in reach');
});

test('best(): radius, arc, who may use it, a null prompt, and providers', () => {
  const reg = I.createRegistry();
  reg.add(entry('far', 'counter', 5, 0));
  reg.add(entry('behind', 'seat', 0, -2, { arc: 1.2 }));
  reg.add(entry('riding', 'counter', 0, 2, { when: 'ride' }));
  reg.add(entry('nothing', 'counter', 0.2, 0.2, { prompt: () => null }));
  assert.equal(reg.best(ctxAt(0, 0)), null, 'out of reach, behind the player, for riders only, or with nothing to offer');
  assert.equal(reg.best(ctxAt(0, 0, { heading: Math.PI })).entry.id, 'behind', 'facing it');
  const remove = reg.addProvider((x, z, r, out) => out.push(entry('dyn', 'person', x + 0.5, z)));
  assert.equal(reg.best(ctxAt(0, 0, { heading: 0, time: 5 })).entry.id, 'dyn');
  remove();
  assert.equal(reg.best(ctxAt(0, 0, { time: 6 })), null);
});

test('best(): hysteresis keeps the focus until a challenger is 4 better for 0.25 s', () => {
  const reg = I.createRegistry();
  reg.add(entry('a', 'counter', 0.5, 0));
  reg.add(entry('b', 'counter', -0.9, 0));
  assert.equal(reg.best(ctxAt(0, 0, { time: 0 })).entry.id, 'a');
  // b is now a little closer, but not 4 better: no flicker.
  assert.equal(reg.best(ctxAt(-0.3, 0, { time: 0.1 })).entry.id, 'a');
  // b is clearly better: it takes over only after 0.25 s.
  assert.equal(reg.best(ctxAt(-0.9, 0, { time: 0.2 })).entry.id, 'a');
  assert.equal(reg.best(ctxAt(-0.9, 0, { time: 0.5 })).entry.id, 'b');
  reg.move('b', 30, 30);
  assert.equal(reg.best(ctxAt(-0.9, 0, { time: 0.6 })).entry.id, 'a');
  reg.remove('a');
  assert.equal(reg.best(ctxAt(-0.9, 0, { time: 0.7 })), null);
});

test('every counter on the map has a catalogue entry, Vietnamese names, prices and hours', () => {
  const venues = new Set(VENUES.map((v) => v.building.id));
  for (const b of BUILDINGS) {
    if (b.kind === 'home' || venues.has(b.id) || ['gunstore', 'bikeshop', 'hospital'].includes(b.kind)) continue;
    if (b.name === 'THÁP PHƯƠNG NAM') continue;
    assert.ok(C.counterKeyOf(b), `${b.name} (${b.kind}) has no counter`);
  }
  for (const p of C.PLACES) {
    if (p.kind !== 'counter') continue;
    const def = C.COUNTERS[p.key];
    assert.ok(def, `${p.id} → ${p.key}`);
    assert.ok(def.hours.length > 0 && def.hours.every(([a, b]) => b > a && a >= 0 && b <= 26), `${p.key} hours`);
  }
  const ids = new Set();
  for (const [key, def] of Object.entries(C.COUNTERS)) {
    assert.ok(/[à-ỹÀ-Ỹđ]/.test(def.title + def.intro), `${key}: Vietnamese text`);
    for (const it of def.items) {
      assert.ok(/^[a-z0-9]+$/.test(it.id), `${key}.${it.id}: ascii id`);
      assert.ok(it.price >= 0 && it.name && it.description, `${key}.${it.id}`);
      ids.add(`${key}.${it.id}`);
    }
  }
  assert.ok(ids.size > 60);
  assert.ok(C.PLACES.filter((p) => p.kind === 'seat').length >= 80, 'benches, bus-stop and café seats');
  assert.equal(C.ATM_SPOTS.length, 7);
});

test('opening hours wrap past midnight and name the next opening', () => {
  const hutieu = C.COUNTERS.hutieu.hours;
  assert.ok(C.isOpen(hutieu, 23.5) && C.isOpen(hutieu, 0.5) && !C.isOpen(hutieu, 1.5) && !C.isOpen(hutieu, 12));
  const pho = C.COUNTERS.pho.hours;
  assert.ok(C.isOpen(pho, 6) && !C.isOpen(pho, 15) && C.isOpen(pho, 18));
  assert.equal(C.hourLabel(C.opensAt(pho, 15)), '16:30');
  assert.equal(C.hourLabel(C.opensAt(C.COUNTERS.taphoa.hours, 23)), '6:00');
  assert.equal(C.hoursLabel(C.ALL_DAY), 'Mở cửa 24/7');
  assert.equal(C.hoursLabel(C.COUNTERS.coba.hours), '6:00–22:30');
});

test('one clock: every quán sells exactly while street life has its stools, cook and diners out', async () => {
  const { LIFE, POIS } = await import('../app/game/city.ts');
  const L = await import('../app/game/street-life.ts');
  // District seats have POI ids after today's POIS (map/world-map.ts WORLD_POIS, then district-life.ts's extra stools).
  const { district, poiById } = await import('../app/game/district-life.ts');
  const view = district();
  let groups = 0;
  for (const g of LIFE.groups) {
    if ((g.kind !== 'eatery' && g.kind !== 'beer') || !g.dish) continue;
    groups++;
    const counter = C.PLACES.find((p) => p.kind === 'counter' && p.building === g.building);
    assert.ok(counter, `${BUILDINGS[g.building].name}: no counter`);
    const def = C.COUNTERS[counter.key];
    assert.ok(def.eatIn, `${counter.name}: diners sit at its tables, so it serves eat-in`);
    for (let t = 0; t < 24; t += 0.25) assert.equal(C.isOpen(def.hours, t), L.inHours(L.MENU[g.dish], t), `${counter.name} (${counter.key}) at ${t}`);
  }
  assert.ok(groups >= 40, `${groups} eatery groups`);
  // Every stool and café chair of an eatery orders from its own building's counter, never a neighbour's.
  for (const p of C.PLACES) {
    if (p.kind !== 'seat' || p.poi === undefined) continue;
    const poi = p.poi < POIS.length ? POIS[p.poi] : poiById(view, p.poi);
    assert.ok(poi, `${p.id}: no POI ${p.poi}`);
    const g = poi.group !== undefined ? LIFE.groups[poi.group] : null;
    // A district quán's stool (district-life.ts: the eatery it belongs to) counts like one of today's eatery groups.
    const districtStool = p.poi >= POIS.length && poi.eatery >= 0;
    if (!(g && (g.kind === 'eatery' || g.kind === 'beer')) && !districtStool && p.key !== 'cafe-seat') continue;
    assert.ok(C.PLACES.some((q) => q.kind === 'counter' && q.building === p.building && p.building >= 0 && C.COUNTERS[q.key].eatIn), `${p.id} has no eat-in counter of its own`);
  }
  // Every roaming hawker's goods are on sale.
  for (const goods of Object.keys(L.LIFE_LINES.hawk)) assert.ok(C.COUNTERS[`ganh-${goods}`], `hawker goods ${goods} has no counter`);
});

test('applyEffect: heal (30% more eaten in), buffs, sobering, hiding, looks and tickets', () => {
  const log = [];
  const host = {
    now: 0, health: 50, maxHealth: 100, setHealth(v) { this.health = v; }, drunk: (s) => log.push(`drunk ${s}`), sober: () => log.push('sober'),
    score: (n) => log.push(`score ${n}`), hours: 22, setHours(h) { this.hours = h; }, wanted: 2, loseTail: (w) => { log.push(`lose ${w}`); return true; },
    buff: (id, s) => log.push(`buff ${id} ${s}`), fix: (k) => `fix ${k}`, look: (k) => log.push(`look ${k}`), lottery: (n) => log.push(`lottery ${n}`),
    litter: (n) => log.push(`litter ${n}`), item: (n) => log.push(`item ${n}`),
  };
  const parts = S.applyEffect({ heal: 30, buff: { id: 'tinh', seconds: 120 } }, host, true);
  assert.equal(host.health, 89);
  assert.ok(log.includes('buff tinh 120') && log.includes('sober'));
  assert.ok(parts[0].includes('+39 máu'));
  S.applyEffect({ full: true, wakeAt: 7, hide: 2 }, host);
  assert.equal(host.health, 100);
  assert.equal(host.hours, 7);
  assert.ok(log.includes('lose false'));
  S.applyEffect({ look: 'shirt', lottery: 2 }, host);
  assert.ok(log.includes('look shirt') && log.includes('lose true') && log.includes('lottery 2'));
});

test('natural healing: 60 in the city, 70 seated, a full stomach to 100, zombie mode unchanged', () => {
  assert.equal(S.regenRate(40, { zombie: false, full: false, seated: false }), 1);
  assert.equal(S.regenRate(60, { zombie: false, full: false, seated: false }), 0);
  assert.equal(S.regenRate(65, { zombie: false, full: false, seated: true }), 1);
  assert.equal(S.regenRate(80, { zombie: false, full: true, seated: false }), 1);
  assert.equal(S.regenRate(40, { zombie: false, full: true, seated: false }), 2);
  assert.equal(S.regenRate(90, { zombie: true, full: false, seated: false }), 2);
});

test('lottery: one deterministic draw a day at 16:15, best match only', () => {
  assert.match(S.drawNumber(3), /^\d{6}$/);
  assert.equal(S.drawNumber(3), S.drawNumber(3));
  assert.notEqual(S.drawNumber(3), S.drawNumber(4));
  assert.equal(S.drawDay(5, 10), 5);
  assert.equal(S.drawDay(5, 17), 6);
  assert.equal(S.prizeFor('123456', '123456'), 50000);
  assert.equal(S.prizeFor('993456', '123456'), 10000);
  assert.equal(S.prizeFor('999456', '123456'), 1000);
  assert.equal(S.prizeFor('999956', '123456'), 100);
  assert.equal(S.prizeFor('999995', '123456'), 0);
  // Expected return about 30-35%: realistic, and negative.
  let paid = 0, n = 200000, seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < n; i++) paid += S.prizeFor(S.ticketNumber(rnd), S.drawNumber(i % 50));
  const ret = paid / (n * 10);
  assert.ok(ret > 0.2 && ret < 0.5, `return ${ret}`);
});

test('haggling: 55% cheaper, 30% the same, 15% refused', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const count = { cheaper: 0, same: 0, refused: 0 };
  for (let i = 0; i < 20000; i++) count[S.haggle(rnd)]++;
  assert.ok(Math.abs(count.cheaper / 20000 - 0.55) < 0.02 && Math.abs(count.refused / 20000 - 0.15) < 0.02, JSON.stringify(count));
});

test('auditEntries() lists the static places with what they cover', () => {
  const entries = I.auditEntries();
  assert.ok(entries.length > 300);
  for (const e of entries) assert.ok(e.covers.length && Number.isFinite(e.x) && Number.isFinite(e.z) && e.r > 0, e.id);
});
