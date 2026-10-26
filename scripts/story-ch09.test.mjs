// node --experimental-transform-types --test scripts/story-ch09.test.mjs
// Story content, chapter 9 (SEN TRONG BÙN · TRUY NÃ): the chapter loads through the registry beside chapters 1–5 and
// lints clean against the real sites and the engine contract (plus SCENE_REQUESTS and the ids the chapter asks for in
// content/ch09.ts ENGINE_NEEDS); every text reference resolves (no inline strings, no orphan keys, no real brands, the
// ring only through {@ring}, subtitles fit and are readable); every place is a site, a chapter place checked on the
// map, or a declared space anchor, and each mission uses the sites story-decisions.md gave it; the cutscenes are
// consistent (durations, marks, cast, sets, dignity, nobody struck) and name only contract ids; the case board cards
// solve and tie into chapters 3 and 5; the steps only wait for what the script offers; the choices chapter 9 reads
// from chapters 6 and 8 are the ones those chapters make.
// A mock host and an autopilot (each step's own conditions satisfied in turn) play the chapter's main path c9-m1 →
// c9-m3 from an end-of-chapter-8 progress, resume from every checkpoint, and play the alternatives: no Bà Sáu (the
// back-alley detour), no envelope, the hollow too late, the search skipped, a patrol that recognises Tín, the drunk's
// bluff answered loud and with a beer, a wrong deduction, the foot chase and the SUV chase skipped, the pistol taken
// or left, a kill in the lane (LƯƠNG TÂM stained), Cô Ba caught, the scooter kick, the pagoda reached by a skip, and
// the replays. Chapter 6 introduces the abbot (cast 'thay-minh-tinh'); until content/ch06.ts is registered a stand-in
// provides that cast entry, and a test checks the stand-in and the upstream choices against chapters 6–8 when they load.
// Imports pure modules only; city.ts imports './x' without an extension (Vite style), which a resolve hook retries as .ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { existsSync } from 'node:fs';

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

const R = await import('../app/game/story/runner.ts');
const C = await import('../app/game/story/content/index.ts');
const S = await import('../app/game/story/sites.ts');
const F = await import('../app/game/story/flags.ts');
const D = await import('../app/game/story/deduction.ts');
const SCENE_SCHEMA = await import('../app/game/story/scene.ts');
const ch1 = await import('../app/game/story/content/ch01.ts');
const ch2 = await import('../app/game/story/content/ch02.ts');
const ch3 = await import('../app/game/story/content/ch03.ts');
const ch4 = await import('../app/game/story/content/ch04.ts');
const ch5 = await import('../app/game/story/content/ch05.ts');
const ch9 = await import('../app/game/story/content/ch09.ts');
const cs9 = await import('../app/game/story/cutscenes/ch09.ts');
const t1 = await import('../app/game/story/text/vi/ch01.ts');
const t2 = await import('../app/game/story/text/vi/ch02.ts');
const t3 = await import('../app/game/story/text/vi/ch03.ts');
const t4 = await import('../app/game/story/text/vi/ch04.ts');
const t5 = await import('../app/game/story/text/vi/ch05.ts');
const t9 = await import('../app/game/story/text/vi/ch09.ts');
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT, SCENE_REQUESTS } = await import('../app/game/story/contract.ts');
const city = await import('../app/game/city.ts');
const { TERRAIN } = await import('../app/game/map/terrain.ts');
const DIST = await import('../app/game/map/districts.ts');

/** Chapter 6's cast as chapter 9 uses it (Thầy Minh Tịnh at the pagoda gate), standing in for content/ch06.ts. */
const CH6_STAND_IN = {
  chapter: 6, missions: [],
  cast: [{ id: 'thay-minh-tinh', name: '@cast.thay-minh-tinh', look: 'abbot', portrait: { bg: '#b5835a', initials: 'T' } }],
  text: { 'cast.thay-minh-tinh': 'Thầy Minh Tịnh' },
};
for (const n of [1, 2, 3, 4, 5]) C.registerChapter(n, () => import(`../app/game/story/content/ch0${n}.ts`));
C.registerChapter(9, () => import('../app/game/story/content/ch09.ts'));
const catalog = await C.loadCatalog([1, 2, 3, 4, 5, 9]);
R.addModule(catalog, CH6_STAND_IN);
const MODULES = [ch1.chapter, ch2.chapter, ch3.chapter, ch4.chapter, ch5.chapter, CH6_STAND_IN, ch9.chapter];
const SCENES = cs9.CUTSCENES;
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = {};
for (const a of [ch1.ANCHORS, ch2.ANCHORS, ch3.ANCHORS, ch4.ANCHORS, ch5.ANCHORS, ch9.ANCHORS]) for (const [k, v] of Object.entries(a ?? {})) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const MISSIONS = ['c9-m1', 'c9-m2', 'c9-m3'];
const SPACE_IDS = Object.keys(S.SPACES);
/** The engine contract plus the cutscene requests of chapters 4–5 (registered) and the ids chapter 9 asks for. */
const CONTRACT = Object.fromEntries(Object.entries(ENGINE_CONTRACT).map(([k, v]) => [k, { ...v, ...(SCENE_REQUESTS[k] ?? {}), ...(ch9.ENGINE_NEEDS[k] ?? {}) }]));
const tx = R.makeText(catalog, (n) => ({ cash: 900, debtPaid: 1350, debtTotal: 40000, hintTokens: 2 })[n]);
const anchorOf = (ref) => { if (typeof ref !== 'string' || !ref.includes('/')) return null; const [space, anchor] = ref.split('/'); return ANCHORS[space]?.[anchor] ? { space, anchor } : null; };

// ---- helpers over the content ---------------------------------------------------------------------------------

function* deep(x, key = '') {
  if (typeof x === 'string') yield [key, x];
  else if (Array.isArray(x)) for (const v of x) yield* deep(v, key);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) yield* deep(v, k);
}
function visit(m, fn) { R.walkMission(m, { act: (a, at) => fn('act', a, at), cond: (c, at) => fn('cond', c, at) }); }
const actsOf = (m) => { const out = []; visit(m, (kind, x, at) => { if (kind === 'act') out.push([x, at]); }); return out; };
const condsOf = (m) => { const out = []; visit(m, (kind, x, at) => { if (kind === 'cond') out.push([x, at]); }); return out; };
const isRef = (s) => /^@[\w.:-]+$/.test(s);
const mission = (id) => catalog.missions.get(id);
const ops = (id, op) => actsOf(mission(id)).map(([a]) => a).filter((a) => a.k === 'do' && a.op === op);

// ---- mock host (story-ch05.test.mjs, plus chase controllers, the wanted mode, the weapon and the pillion) ----------

const cmp = (a, op, b) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : op === '!=' ? a !== b : a === b);
const MODE = { foot: ['foot'], bike: ['bike'], car: ['car'], vehicle: ['bike', 'car', 'boat'], boat: ['boat'], swim: ['swim'] };
const STATE = { idle: 'idle', goto: 'goto', patrol: 'patrol', follow: 'follow', escort: 'escort', guard: 'idle', act: 'act', flee: 'flee', surrender: 'surrender', captive: 'captive' };
const BLOCKING = new Set(['cutscene', 'dialogue', 'call', 'title', 'fade', 'teleport', 'choice', 'space']);

function resolve(at) {
  if (at && typeof at === 'object') return at;
  if (typeof at !== 'string') return null;
  if (at.includes('/')) {
    const [space, anchor] = at.split('/'), i = Object.keys(ANCHORS[space] ?? {}).indexOf(anchor);
    return i < 0 ? null : { x: -1200 + 200 * SPACE_IDS.indexOf(space) + 3 * i, z: -3400, space };
  }
  return PLACES[at] ?? null;
}
function mockWorld(o = {}) {
  const w = {
    runner: null, choose: structuredClone(o.choose ?? {}), log: [], outs: [], resets: [], missing: [], ops: [], fails: 0, weapon: null, pillion: null, wanted: null, rules: null,
    player: { x: 0, z: 0, mode: 'foot', space: null, level: null, crouched: false, hidden: false, speed: 0, carrying: null, cover: null, visibility: 1, wanted: 0, outfit: null },
    actors: new Map(), vehicles: new Map([['dream', { x: 0, z: 0, state: 'parked' }]]), meters: new Map(), q: new Set(), helpers: new Map(), hour: 12, alarm: 0,
  };
  const miss = (what, ctx) => w.missing.push(`${what} (${ctx.mission}/${ctx.step})`);
  w.port = {
    test(c) {
      const p = w.player;
      switch (c.k) {
        case 'reach': {
          if (c.mode && c.mode !== 'any' && !MODE[c.mode].includes(p.mode)) return false;
          if (c.space !== undefined && p.space !== c.space) return false;
          if (c.level !== undefined && c.level !== null && p.level !== c.level) return false;
          const t = resolve(c.at);
          if (!t) { w.missing.push(`reach place ${c.at}`); return false; }
          return (t.space ?? null) === p.space && Math.hypot(t.x - p.x, t.z - p.z) <= (c.r ?? 3);
        }
        case 'mode': return p.mode === c.is;
        case 'space': return p.space === c.id;
        case 'player': return cmp(p[c.prop] ?? 0, c.op, c.value);
        case 'stance': return c.is === 'crouch' ? p.crouched : c.is === 'stand' ? !p.crouched : c.is === 'hidden' ? p.hidden : p.hidden || p.crouched;
        case 'carrying': return p.carrying === c.item;
        case 'down': return false;
        case 'hour': return c.from <= c.to ? w.hour >= c.from && w.hour < c.to : w.hour >= c.from || w.hour < c.to;
        case 'actor': {
          const a = w.actors.get(c.id);
          if (!a) return false;
          if (c.state && a.state !== c.state) return false;
          if (c.down !== undefined && a.down !== c.down) return false;
          if (c.sees !== undefined && a.sees !== c.sees) return false;
          const t = c.at ? resolve(c.at) : null;
          return !c.at || (!!t && (t.space ?? null) === (a.space ?? null) && Math.hypot(t.x - a.x, t.z - a.z) <= (c.r ?? 2));
        }
        case 'vehicle': {
          const v = w.vehicles.get(c.id), t = c.at ? resolve(c.at) : null;
          return !!v && (!c.state || v.state === c.state) && (!c.at || (!!t && Math.hypot(t.x - v.x, t.z - v.z) <= (c.r ?? 6)));
        }
        case 'near': { const pos = (id) => (id === 'player' ? p : w.actors.get(id) ?? w.vehicles.get(id)); const a = pos(c.a), b = pos(c.b); return !!a && !!b && (a.space ?? null) === (b.space ?? null) && Math.hypot(a.x - b.x, a.z - b.z) <= c.r; }
        case 'meter': { const v = w.meters.get(c.id); return v !== undefined && cmp(v, c.op, c.value); }
        case 'alarm': return cmp(w.alarm, c.op, c.level);
        case 'q': return w.q.has(c.name);
        default: return false;
      }
    },
    exec(a, h, ctx) {
      w.log.push({ k: a.k, id: a.id ?? a.target ?? a.op, step: ctx.step, mission: ctx.mission, restoring: ctx.restoring, a });
      switch (a.k) {
        case 'spawn': if (!w.actors.has(a.id)) { const p = resolve(a.at); if (!p) miss(`spawn place ${a.at}`, ctx); w.actors.set(a.id, { state: STATE[a.behaviour?.k ?? 'idle'], sees: false, down: false, x: p?.x ?? 0, z: p?.z ?? 0, space: p?.space ?? null, tags: a.tags ?? [] }); } break;
        case 'despawn': if (a.id) w.actors.delete(a.id); if (a.tag) for (const [k, v] of [...w.actors]) if (v.tags.includes(a.tag)) w.actors.delete(k); break;
        case 'behave': { const x = w.actors.get(a.id); if (!x) miss(`behave ${a.id}`, ctx); else x.state = STATE[a.b.k]; break; }
        case 'bark': if (!w.actors.has(a.actor)) miss(`bark ${a.actor}`, ctx); break;
        case 'vehicle': {
          const v = w.vehicles.get(a.id), st = { drive: 'driving', park: 'parked', stop: 'stopped', flee: 'fleeing' };
          if (a.model || a.at) { const p = a.at ? resolve(a.at) : null; if (a.at && !p) miss(`vehicle place ${a.at}`, ctx); w.vehicles.set(a.id, { x: p?.x ?? v?.x ?? 0, z: p?.z ?? v?.z ?? 0, state: st[a.state ?? 'park'] }); }
          else if (!v) miss(`vehicle ${a.id}`, ctx);
          else if (a.state) v.state = st[a.state];
          for (const x of [a.route ?? []].flat()) if (!resolve(x)) miss(`route ${x}`, ctx);
          break;
        }
        case 'tail': if (!w.vehicles.has(a.target) && !w.actors.has(a.target)) miss(`tail ${a.target}`, ctx); w.helpers.set(a.target, a); break;
        case 'photoTarget': case 'clue': case 'eavesdrop': w.helpers.set(a.id, a); if (typeof a.source === 'string' && a.k === 'eavesdrop' && !w.actors.has(a.source)) miss(`eavesdrop source ${a.source}`, ctx);
          if (a.k === 'photoTarget' && typeof a.subject === 'string' && !resolve(a.subject) && !w.actors.has(a.subject) && !w.vehicles.has(a.subject)) miss(`photo subject ${a.subject}`, ctx);
          if (a.k === 'clue' && !resolve(a.at)) miss(`clue place ${a.at}`, ctx);
          break;
        case 'stop': w.helpers.delete(a.id); break;
        case 'teleport': { const p = resolve(a.at); if (!p) miss(`teleport ${a.at}`, ctx); else Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: p.level ?? null, mode: a.vehicle ? 'bike' : 'foot', speed: 0 }); break; }
        case 'space':
          if (a.enter) { const p = resolve(`${a.enter}/${a.link}`) ?? resolve(`${a.enter}/${Object.keys(ANCHORS[a.enter] ?? {})[0]}`); if (!p) miss(`space ${a.enter}`, ctx); Object.assign(w.player, { x: p?.x ?? 0, z: p?.z ?? 0, space: a.enter, mode: 'foot' }); }
          if (a.leave) { const p = a.leave === true ? null : resolve(a.leave); if (a.leave !== true && !p) miss(`leave place ${a.leave}`, ctx); Object.assign(w.player, { space: null, mode: 'foot' }, p ? { x: p.x, z: p.z } : {}); }
          break;
        case 'player':
          if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover;
          if (a.outfit) w.player.outfit = a.outfit;
          break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; if (a.rules) w.rules = a.rules; break;
        case 'time': w.hour = a.hour; break;
        case 'do':
          w.ops.push(a.op);
          if (a.op === 'chase') w.helpers.set(a.args.id, a);
          if (a.op === 'pursue') { if (a.args.stop) w.helpers.delete('pursue'); else { for (const id of a.args.ids) if (!w.vehicles.has(id)) miss(`pursuer ${id}`, ctx); w.helpers.set('pursue', a); } }
          if (a.op === 'wanted') w.wanted = a.args;
          if (a.op === 'arm') w.weapon = a.args.weapon;
          if (a.op === 'pillion') w.pillion = a.args.cast;
          break;
      }
      const blocking = (BLOCKING.has(a.k) && a.mode !== 'ambient') || (a.k === 'do' && a.wait);
      if (!blocking) return false;
      let result;
      if (a.k === 'choice') { const pick = w.choose[a.id]; result = Array.isArray(pick) ? pick.shift() : pick; result ??= a.options[0]?.id; }
      w.runner.resolve(h, result);
      return true;
    },
    cancel() {},
    reset(scope) {
      w.resets.push(scope);
      w.meters.clear(); for (const a of w.actors.values()) a.sees = false;
      if (scope === 'step') return;
      w.actors.clear(); for (const k of [...w.vehicles.keys()]) if (k !== 'dream') w.vehicles.delete(k);
      w.helpers.clear(); w.meters.clear(); w.alarm = 0;
      Object.assign(w.player, { hidden: false, crouched: false, level: null, visibility: 1 });
    },
    emit(e) { w.outs.push(e); if (e.type === 'fail') w.fails++; if (e.type === 'checkpoint') o.onCheckpoint?.(e, w.runner); },
  };
  return w;
}
function setup(o = {}) {
  const w = mockWorld(o);
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 9 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot ----------------------------------------------------------------------------------------------------

function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), answered = new Set(), waiting = {};
  const kf = (e) => `${key}|${e.type}|${e.id}|${e.evidence ?? ''}`;
  const push = (e) => { const k = kf(e); if (pushed.has(k)) return; pushed.add(k); r.event(e); };
  const moveTo = (at, when, level) => {
    const p = resolve(at);
    assert.ok(p, `place ${at}`);
    Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: level !== undefined ? level : p.level ?? null });
    if (when === 'ride') w.player.mode = 'bike'; else if (when === 'water') w.player.mode = 'swim'; else if (when === 'foot') w.player.mode = 'foot';
  };
  function satisfy(c, def) {
    switch (c.k) {
      case 'all': for (const x of c.of) satisfy(x, def); return;
      case 'any': satisfy(c.of[o.any?.[step] ?? 0], def); return;
      case 'hold': satisfy(c.c, def); return;
      case 'reach': {
        moveTo(c.at);
        if (c.mode === 'bike' || c.mode === 'vehicle') w.player.mode = 'bike'; else if (c.mode === 'swim') w.player.mode = 'swim'; else if (c.mode === 'foot') w.player.mode = 'foot';
        if (c.space !== undefined) w.player.space = c.space;
        if (c.level !== undefined) w.player.level = c.level;
        return;
      }
      case 'mode': w.player.mode = c.is; return;
      case 'space': w.player.space = c.id; return;
      case 'stance': if (c.is === 'crouch') w.player.crouched = true; else if (c.is === 'stand') w.player.crouched = false; else w.player.hidden = true; return;
      case 'player': w.player[c.prop] = c.op === '>' || c.op === '>=' ? c.value + 1 : c.op === '<' || c.op === '<=' ? 0 : c.value; return;
      case 'meter': w.meters.set(c.id, c.op === '>' || c.op === '>=' ? Math.max(1, c.value) : 0); return;
      case 'q': w.q.add(c.name); return;
      case 'actor': {
        const a = w.actors.get(c.id);
        assert.ok(a, `actor ${c.id} exists for ${step}`);
        if (c.state) a.state = c.state; if (c.sees !== undefined) a.sees = c.sees; if (c.down !== undefined) a.down = c.down;
        if (c.at) { const p = resolve(c.at); Object.assign(a, { x: p.x, z: p.z, space: p.space ?? null }); }
        return;
      }
      case 'near': {
        const a = w.actors.get(c.a), b = c.b === 'player' ? w.player : w.actors.get(c.b);
        assert.ok(a && b, `${step}: near ${c.a} ${c.b}`);
        Object.assign(a, { x: b.x, z: b.z, space: b.space ?? null });
        return;
      }
      case 'vehicle': { const v = w.vehicles.get(c.id); assert.ok(v, `vehicle ${c.id} exists for ${step}`); if (c.state) v.state = c.state; if (c.at) Object.assign(v, resolve(c.at)); return; }
      case 'evidence': {
        const src = [...w.helpers.values()].find((h) => (h.k === 'photoTarget' || h.k === 'clue') && h.evidence === c.id);
        assert.ok(src, `${step}: evidence ${c.id} has a live photo target or clue`);
        if (src.k === 'clue') moveTo(src.at);
        push({ type: src.k === 'clue' ? 'examine' : 'photo', id: src.id, evidence: c.id, quality: 0.9 });
        return;
      }
      case 'on': {
        if (pushed.has(kf({ type: c.ev, id: c.id }))) return;
        if (c.ev === 'interact') {
          const it = r.view().interacts.find((x) => x.id === c.id);
          // an entry a watcher adds (the keg's drop point) appears with the watcher's queue on the next tick
          if (!it && (waiting[c.id] = (waiting[c.id] ?? 0) + 1) <= 5) return;
          assert.ok(it, `${step}: interaction ${c.id} is offered`);
          moveTo(it.at, it.when, it.level);
        } else if (c.ev === 'climb') {
          const it = r.view().interacts.find((x) => x.id === c.id);
          assert.ok(it && it.kind === 'climb' && it.to, `${step}: climb ${c.id} is offered with a far end`);
          moveTo(it.at, it.when, it.level);
          moveTo(it.to, 'foot');
        } else if (c.ev === 'eavesdrop') assert.ok(w.helpers.has(c.id), `${step}: eavesdrop ${c.id} is running`);
        else if (['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(w.helpers.has(c.id), `${step}: tail ${c.id} is running`);
        else if (['escaped', 'caught'].includes(c.ev) && c.id) assert.ok(w.helpers.has(c.id), `${step}: chase ${c.id} is running`);
        else if (c.ev === 'signal' || c.ev === 'choice' || c.ev === 'cutscene') return; // raised by the script's own acts
        push({ type: c.ev, id: c.id, ...(c.tag ? { tag: c.tag } : {}), ...(c.where ?? {}) });
        return;
      }
      default: return;
    }
  }
  for (let i = 0; i < (o.maxTicks ?? 15000); i++) {
    r.tick(0.1);
    const v = r.view(), s = r.state();
    if (v.phase === 'done') return { visits, ticks: i };
    if (v.phase === 'failed') {
      const how = o.onFail?.(v, visits[step] ?? 0, w);
      if (!how) throw new Error(`${s.mission}/${v.step} failed: ${v.failure.reason}`);
      assert.ok(how === 'skip' ? r.skipSection() : r.retry(), `${how} after "${v.failure.reason}"`);
      continue;
    }
    const sess = s.session;
    if (sess?.kind === 'deduce') { const q = catalog.questions.get(sess.id), wrong = o.wrong?.[sess.id]; r.ui.answer(wrong && !answered.has(sess.id) ? wrong : q.answer); answered.add(sess.id); }
    else if (sess?.kind === 'board') for (const [a, b] of catalog.boards.get(sess.id).links) r.ui.link(a, b);
    if (v.phase !== 'run') continue;
    if (`${v.step}|${w.fails}` !== lastVisit) { lastVisit = `${v.step}|${w.fails}`; step = v.step; visits[step] = (visits[step] ?? 0) + 1; key = `${step}#${visits[step]}`; }
    const m = catalog.missions.get(s.mission), def = m.steps.find((x) => x.id === step);
    if (o.hold?.[step]?.({ r, w, visit: visits[step], t: s.t, push })) continue;
    for (const id of o.optional ?? []) {
      const od = [...(def.optional ?? []), ...(m.optional ?? [])].find((x) => x.id === id);
      if (od && !s.stats.optional.includes(id)) satisfy(od.when, def);
    }
    const subs = (def.subs ?? []).filter((x) => !x.optional), doneSubs = new Set(v.subs.filter((x) => x.done).map((x) => x.id));
    const next = subs.find((x) => !doneSubs.has(x.id));
    if (next) { satisfy(next.done, def); continue; }
    const b = o.branch?.[step] ?? (def.done?.k === 'never' ? 0 : undefined);
    if (b !== undefined && def.branch?.[b]) satisfy(def.branch[b].when, def);
    else if (def.done) satisfy(def.done, def);
  }
  const v = r.view();
  throw new Error(`${r.state().mission} did not finish (stuck at ${v.step}, phase ${v.phase}, subs ${JSON.stringify(v.subs)}, offered ${v.interacts.map((x) => x.id)}, visits ${JSON.stringify(visits)}, state ${JSON.stringify(r.state())}, log ${JSON.stringify(w.log.slice(-8).map((l) => [l.k, l.id, l.step]))})`);
}
const outs = (w, type) => w.outs.filter((e) => e.type === type);
const completed = (w) => outs(w, 'complete');
function play(id, o = {}) {
  const { r, w } = setup(o);
  assert.equal(r.start(id, o.replay ? { replay: true } : undefined), true, `${id} starts`);
  const res = autopilot(r, w, o);
  return { r, w, res, done: completed(w).at(-1), p: r.progress() };
}

/** The progress at the end of chapter 8 as far as chapter 9 reads it (chapters 6–8 are other batches; their hand-offs per story-final.md). */
function endOfChapter8(flags = {}) {
  const p = F.newProgress();
  for (const m of F.missionOrder(C.CAMPAIGN)) { if (m.chapter >= 9) break; p.completed.push(m.id); }
  Object.assign(p.flags, {
    arrived: true, dreamRevived: true, helpedBaSau: true, hoaNote: true, sawKho7: true, knowsB2: true, sawMaiBag: true, filmedLuc: true, sawMoonlight: true, dreamMatte: true,
    rescued: 11, wearsTuJacket: true, vanSuspended: true, 'choice:caPhe': 'sua', 'choice:quangBen': 'keo-day', 'choice:phongBi': 'cam', ...flags,
  });
  p.evidence.push('ev-don-dem-quang', 'ev-xe-den', 'ev-dong-ho-vang', 'ev-tu-ke', 'ev-clip-luc', 'ev-luc-noi', 'ev-thang-may-b2', 'ev-dau-doc-the', 'ev-so-do-b2', 'ev-cap-mai');
  p.abilities.push('phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill', 'faceCover', 'lean', 'throw', 'takedown', 'drag', 'clipCam', 'whistle');
  p.outfits.push('tin-shipper', 'tin-ao-tu');
  Object.assign(p, { cash: 900, chapter: 8, lunar: { month: 8, day: 12 } });
  p.debt.paid = 1350;
  return p;
}
const START = endOfChapter8();
const before = new Map();

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapter 9 loads through the registry beside chapters 1–5 and lints clean against the real sites and the contract plus its needs', () => {
  assert.deepEqual([...catalog.missions.keys()].filter((id) => id.startsWith('c9-')), MISSIONS);
  for (const id of MISSIONS) assert.equal(catalog.meta.get(id).chapter, 9);
  const lint = R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: CONTRACT });
  // the stand-in carries chapter 6's cast only, so its missions are reported missing; nothing else may be
  assert.deepEqual(lint.filter((s) => !/^c6-m\d+: no mission script in chapter 6$/.test(s)), []);
  assert.equal(mission('c9-m1').chain, undefined, 'the manhunt ends at noon; the bia hơi is the next evening');
  assert.equal(mission('c9-m2').chain, 'c9-m3', 'c9-m2 runs straight into the 23:30 goodbye at Cô Ba\'s');
  for (const id of MISSIONS) {
    const m = mission(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.5, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
    assert.ok(m.steps.every((s) => s.minutes > 0));
  }
  assert.deepEqual(MISSIONS.map((id) => mission(id).lethal), ['fail', 'fail', 'allow'], 'only the raid allows open combat (LƯƠNG TÂM still books it)');
  assert.equal(MISSIONS.reduce((t, id) => t + catalog.meta.get(id).minutes, 0), 20, 'chapter 9 is 20 of the 235 planned minutes');
  assert.deepEqual(MISSIONS.map((id) => catalog.meta.get(id).giver), ['coba', 'van', 'coba']);
  assert.deepEqual(catalog.index.chapters.find((c) => c.n === 9).lunar, { month: 8, day: 13 });
});

test('ENGINE_NEEDS: every id the chapter adds to the contract is used by it, has a lane, and lints only with it', () => {
  const used = new Set();
  for (const m of ch9.chapter.missions) if (m.start?.outfit) used.add(`outfits:${m.start.outfit}`);
  for (const m of ch9.chapter.missions) {
    for (const s of m.steps) for (const x of s.meters ?? []) used.add(`meters:${x.id}`);
    for (const [a] of actsOf(m)) {
      if (a.k === 'do') { used.add(`ops:${a.op}`); if (a.args?.meter) used.add(`meters:${a.args.meter}`); }
      if (a.k === 'player' && a.outfit) used.add(`outfits:${a.outfit}`);
      if (a.k === 'player' && a.carry) used.add(`carry:${a.carry}`);
      if (a.k === 'stealth' && a.arena) used.add(`arenas:${a.arena}`);
      if (a.k === 'unlock' && a.ability) used.add(`abilities:${a.ability}`);
      if (a.k === 'vehicle' && a.model) used.add(`models:${a.model}`);
      if (a.k === 'prop' && a.kind) used.add(`props:${a.kind}`);
      const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
      if (b?.k === 'act') used.add(`acts:${b.name}`);
      if (a.k === 'spawn' && a.template) used.add(`templates:${a.template}`);
    }
  }
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) used.add(`${k === 'rides' ? 'rideModels' : k}:${id}`);
  const LANES = new Set(['core', 'director', 'spaces', 'stealth', 'vehicles', 'police', 'world', 'ui', 'audio']);
  for (const [kind, ids] of Object.entries(ch9.ENGINE_NEEDS)) {
    assert.ok(kind in ENGINE_CONTRACT, `contract kind ${kind}`);
    for (const [id, [lane, what]] of Object.entries(ids)) {
      assert.ok(used.has(`${kind}:${id}`), `need ${kind} '${id}' is used by chapter 9`);
      assert.ok(LANES.has(lane) && what.length > 10, `need ${kind} '${id}' names its lane and what it does`);
      const landed = ENGINE_CONTRACT[kind][id] ?? SCENE_REQUESTS[kind]?.[id];
      if (landed) assert.equal(landed[0], lane, `${kind} '${id}' landed in contract.ts with the lane chapter 9 asked for`);
      assert.ok(!/\{@/.test(what), `need ${kind} '${id}': plain text, no text-table placeholders`);
    }
  }
  // without the needs the lint names each of them (so the list is exactly what the contract still lacks)
  const plain = R.lintContent(C.CAMPAIGN, [ch9.chapter, CH6_STAND_IN, ch1.chapter, ch2.chapter, ch3.chapter, ch4.chapter, ch5.chapter], { engine: ENGINE_CONTRACT }).filter((s) => / is not in the engine contract/.test(s));
  const missing = new Set(plain.map((s) => s.match(/: (\w+) '([^']+)' is not/).slice(1).join(':')));
  for (const k of missing) { const i = k.indexOf(':'), kind = k.slice(0, i), id = k.slice(i + 1); assert.ok(ch9.ENGINE_NEEDS[kind]?.[id], `lint without needs: ${k} must be listed in ENGINE_NEEDS`); }
  // the planned ops chapter 9 gives their first content keep their lanes
  assert.deepEqual([ENGINE_CONTRACT.ops.wanted[0], ENGINE_CONTRACT.ops.chase[0], ENGINE_CONTRACT.ops.pursue[0]], ['police', 'vehicles', 'vehicles']);
  // the wanted mode reads the recognition meter the chapter shows; the chase controllers are the spec's
  for (const a of ops('c9-m1', 'wanted').concat(ops('c9-m2', 'wanted'), ops('c9-m3', 'wanted'))) assert.equal(a.args.meter, 'nhan-dien');
  for (const id of MISSIONS) for (const a of ops(id, 'chase')) assert.ok(['pursuers', 'allyBlock'].includes(a.args.controller), `${id}: chase ${a.args.id}`);
});

test('texts: every reference resolves, no inline strings, no orphan keys, no real brands, the ring only via {@ring}, lines fit', () => {
  const tables = [common.COMMON, t1.TEXT, t2.TEXT, t3.TEXT, t4.TEXT, t5.TEXT, t9.TEXT];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'text keys are unique across chapters 1–5, 9 and the common table');
  for (const k of Object.keys(t9.TEXT)) assert.match(k, /^(c9m[123]\.|cast\.|ev\.|j\.)/, `${k}: chapter 9 key namespace`);
  const used = new Set();
  const sources = [ch9.chapter, SCENES];
  for (const [, s] of deep(sources)) if (isRef(s)) { assert.ok(keys.has(s.slice(1)) || catalog.text.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const v of Object.values(t9.TEXT)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) { assert.ok(keys.has(m[1]), `missing {@${m[1]}}`); used.add(m[1]); }
  assert.deepEqual(Object.keys(t9.TEXT).filter((k) => !used.has(k)), [], 'every chapter 9 text key is used');
  const inline = [];
  for (const m of ch9.chapter.missions) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...ch9.EVIDENCE, ...ch9.JOURNAL]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of ch9.CAST) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const q of ch9.QUESTIONS) for (const t of [q.prompt, q.hint, ...q.options.map((x) => x.text)]) if (!isRef(t)) inline.push(`question ${q.id}: ${t}`);
  for (const sc of SCENES) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  assert.deepEqual(inline, []);
  for (const k of Object.keys(t9.TEXT)) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/Sen Vàng|SEN VÀNG/.test(t9.TEXT[k]), `${k}: the ring is named through {@ring}/{@ringUpper}, never written out`);
    assert.ok(!/\b(Dream|Vios|GiaoNhanh|GiaoLẹ|GN-\d|GL-\d)/.test(v), `${k}: working names of the bible stay out of the text`);
    assert.ok(!/Quận Trung Tâm|KHO LẠNH SỐ 9|kho lạnh số 9|Phương Nam bank/i.test(v), `${k}: retired place names`);
  }
  assert.equal(tx('@c9m1.sub.coiAo'), 'Cởi áo mưa, lộ áo ĐơnƠi bên trong', 'the app name comes from {@app}');
  const lines = [];
  for (const m of ch9.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') lines.push(...a.lines.map((l) => [m.id, l.text]));
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') lines.push([sc.id, c.text]);
  for (const [at, ref] of lines) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of ch9.chapter.missions) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long: ${tx(s.objective)}`);
    for (const s of m.steps) for (const x of s.subs ?? []) assert.ok(tx(x.text).length <= 60, `${m.id}/${s.id}: sub too long`);
    for (const [a, at] of actsOf(m)) {
      if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long: ${tx(a.text)}`);
      if (a.k === 'sms' || a.k === 'bark' || a.k === 'toast') assert.ok(tx(a.text).length <= 90, `${at}: ${a.k} too long`);
    }
  }
  // the bible's signature lines are kept word for word
  for (const [k, line] of [['c9m1.cs.lam6', 'Cô mất thằng Lâm vì cái thứ tụi nó bán.'], ['c9m1.cs.lam7', 'Cô không để mất thêm đứa nào nữa.'],
    ['c9m2.cs.th3', 'Tao buôn bán bậy bạ thật, nhưng tao không bán người.'], ['c9m2.cs.l5', 'Thấy là bắn. Khỏi ra tòa.'],
    ['c9m3.cs.q5', 'Mày không cần tha thứ cho tao.'], ['c9m3.cs.q6', 'Chỉ cần cho tao đi cùng.'], ['c9m3.cs.tmt1', 'A Di Đà Phật. Ở đây chỉ có lá rụng thôi con.'],
    ['c9m3.cs.coba2', 'Nhớ về ăn cơm.'], ['c9m3.cs.hv1', 'Tụi bây vô nhầm phố rồi.']]) assert.equal(tx(`@${k}`), line, k);
});

test('places: every place is a site, a chapter place or a declared space anchor; each mission uses its decided sites and spaces; all P0', () => {
  const refs = new Map(MISSIONS.map((id) => [id, new Set()]));
  const check = (id, ref, at) => {
    if (Array.isArray(ref)) { ref.forEach((x) => check(id, x, at)); return; }
    if (typeof ref !== 'string') return;
    refs.get(id).add(ref);
    if (ref.includes('/')) {
      const [space, anchor] = ref.split('/');
      assert.ok(S.SPACES[space], `${at}: unknown space ${space}`);
      assert.ok(ANCHORS[space]?.[anchor], `${at}: anchor ${anchor} is not declared for ${space}`);
    } else assert.ok(PLACES[ref], `${at}: unknown place ${ref}`);
  };
  for (const id of MISSIONS) {
    const m = mission(id);
    check(id, m.start?.at, id);
    if (m.start?.space) refs.get(id).add(`${m.start.space}/`);
    for (const s of m.steps) {
      for (const x of [s.marker].flat().filter(Boolean)) check(id, x.at, `${id}/${s.id}`);
      for (const x of s.interact ?? []) { check(id, x.at, `${id}/${s.id}`); check(id, x.to, `${id}/${s.id}`); }
    }
    for (const [a, at] of actsOf(m)) {
      for (const k of ['at', 'leave']) if (typeof a[k] === 'string') check(id, a[k], at);
      if (a.k === 'vehicle' && a.route) check(id, a.route, at);
      if (a.k === 'photoTarget' && typeof a.subject === 'string' && (a.subject.includes('.') || a.subject.includes('/'))) check(id, a.subject, at);
      if (a.k === 'do' && a.op === 'chase' && a.args.at) check(id, a.args.at, at);
      if (a.k === 'do' && a.op === 'wanted') for (const cp of a.args.checkpoints ?? []) { check(id, cp.at, at); assert.equal(S.SITES[cp.at]?.kind, 'road', `${at}: checkpoint ${cp.id} stands on a road site`); }
      if (a.k === 'space' && a.enter) { refs.get(id).add(`${a.enter}/`); if (a.link) { assert.ok(ANCHORS[a.enter]?.[a.link], `${at}: entry link ${a.link} is an anchor of ${a.enter}`); refs.get(id).add(`${a.enter}/${a.link}`); } }
      const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
      if (b?.k === 'goto') check(id, b.at, at); else if (b?.k === 'guard') check(id, b.post, at); else if (b?.k === 'patrol') b.route.forEach((x) => check(id, x, at));
    }
    for (const [c, at] of condsOf(m)) if (c.at) check(id, c.at, at);
    for (const [a] of actsOf(m)) if (a.k === 'cutscene') for (const [, s] of deep(SCENE.get(a.id))) refs.get(id).add(s.replace(/^set:([\w-]+)\..*$/, '$1/'));
  }
  const usedSite = (id, site) => [...refs.get(id)].some((r) => r === site || r.startsWith(`${site}.`) || r.startsWith(`${site}/`));
  for (const id of MISSIONS) {
    const ms = S.MISSION_SITES[id];
    assert.equal(ms.phase, 'P0');
    for (const site of ms.sites) assert.ok(usedSite(id, site), `${id} uses ${site} (MISSION_SITES)`);
    for (const space of ms.spaces ?? []) assert.ok(usedSite(id, space), `${id} uses space ${space} (MISSION_SITES)`);
    for (const r of refs.get(id)) assert.notEqual(S.SITES[r.split(/[./]/)[0]]?.phase, 'P1', `${id}: ${r} waits for the Quận 4 wiring`);
  }
  // every anchor chapter 9 declares is used by its scripts or its cutscenes
  const all = new Set([...refs.values()].flatMap((s) => [...s]));
  for (const sc of SCENES) for (const [, s] of deep(sc)) { const m = s.match(/^set:([\w-]+)\.(\w+)$/); if (m) all.add(`${m[1]}/${m[2]}`); }
  for (const [space, anchors] of Object.entries(ch9.ANCHORS)) for (const a of Object.keys(anchors)) assert.ok(all.has(`${space}/${a}`), `anchor ${space}/${a} is used`);
  // chapter 9 adds no anchor a chapter before it already declares (one meaning per anchor)
  for (const [space, anchors] of Object.entries(ch9.ANCHORS)) for (const a of Object.keys(anchors)) for (const prev of [ch1.ANCHORS, ch2.ANCHORS, ch3.ANCHORS, ch4.ANCHORS, ch5.ANCHORS]) assert.ok(!prev?.[space]?.[a], `${space}/${a} is already declared by an earlier chapter`);
  // the climb links the chapter waits on are listed for the spaces lane
  const climbs = ch9.chapter.missions.flatMap((m) => m.steps.flatMap((s) => (s.interact ?? []).filter((x) => x.kind === 'climb').map((x) => x.id)));
  assert.deepEqual([...new Set(climbs)].sort(), Object.keys(ch9.CLIMBS).sort());
});

test('chapter places stand where they say on today\'s map: walkable, clear, on the asphalt only when they are road spots, in An Hòa or Quận 1', () => {
  const asphalt = (x, z) => TERRAIN.strips.some((s) => {
    const along = s.alongX ? x : z, v = s.alongX ? z : x;
    if ((s.lo !== -Infinity && along <= s.lo) || (s.hi !== Infinity && along >= s.hi)) return false;
    return Math.abs(v - s.at) < s.half && city.inRect(city.LAND, x, z, -0.5);
  });
  const keys = Object.keys(ch9.PLACES);
  assert.ok(keys.every((k) => k.startsWith('ch9.')), 'chapter places are namespaced');
  for (const k of ch9.ROAD_PLACES) assert.ok(keys.includes(k), `${k} is a chapter place`);
  for (const [k, p] of Object.entries(ch9.PLACES)) {
    assert.ok(TERRAIN.walkable(p.x, p.z), `${k} is walkable ground`);
    assert.ok(city.pointClear(p.x, p.z, p.r ?? 0.45), `${k} is clear of colliders by ${p.r ?? 0.45} m`);
    assert.equal(asphalt(p.x, p.z), ch9.ROAD_PLACES.includes(k), `${k} ${ch9.ROAD_PLACES.includes(k) ? 'is on' : 'stays off'} the asphalt`);
    assert.ok(['D1', 'D2'].includes(DIST.districtAt(p.x, p.z)?.district.id), `${k} is in An Hòa or Quận 1 (P0)`);
    for (const [s, sp] of Object.entries(SITE_PLACES)) assert.ok(Math.hypot(sp.x - p.x, sp.z - p.z) >= 1, `${k} is clear of ${s}`);
  }
  // road spots face the way their lane runs (traffic keeps right): southbound on the west half, eastbound on the south half
  const P = ch9.PLACES;
  assert.ok(P['ch9.rd-xe-1'].x < 0 && P['ch9.rd-xe-2'].x < 0 && P['ch9.rd-xe-1'].yaw === 0, 'the bikers start southbound on ĐƯỜNG TRUNG TÂM');
  assert.ok(P['ch9.vios-chua'].z > 108 && Math.abs(P['ch9.vios-chua'].yaw - Math.PI / 2) < 1e-9, 'Vân\'s car waits eastbound in front of the pagoda');
  assert.ok(P['ch9.suv-luc'].x < 108 && P['ch9.suv-luc'].yaw === 0, 'Lực\'s SUV at the southbound curb beside the tables');
  // the patrol walks past Bà Sáu's cart; the detour stays out of the first checkpoint's screening zone (14 × 10 m)
  const cart = PLACES['xe-che-c9'], a = P['ch9.tuan-tra-a'], b = P['ch9.tuan-tra-b'];
  assert.ok(a.z === b.z && Math.min(a.x, b.x) < cart.x && cart.x < Math.max(a.x, b.x) && Math.abs(cart.z - a.z) < 1.5, 'the patrol passes the cart');
  for (const k of ['ch9.hem-vong', 'ch9.giua-hem']) assert.ok(Math.abs(P[k].z) > 15, `${k} is out of the checkpoint zones on z 0`);
  // the bike waits where the foot chase ends: outside the loading-bay gate of the courtyard; and at the lane's east end in c9-m3
  assert.ok(Math.hypot(P['ch9.dream-hem'].x - PLACES['san-sau-pho-dem.loadingBay'].x, P['ch9.dream-hem'].z - PLACES['san-sau-pho-dem.loadingBay'].z) < 6);
  assert.ok(Math.hypot(P['ch9.dream-cho'].x - PLACES['cho-an-hoa.eastMouth'].x, P['ch9.dream-cho'].z - PLACES['cho-an-hoa.eastMouth'].z) < 6);
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
const VICTIMS = new Set(['hoa', 'beti', 'mai', 'su']);
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle', 'kick', 'shoot']);
test('cutscenes: durations add up, marks, cast, sets and lines resolve, nobody is struck, every scene is played by its mission', () => {
  const played = new Map();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) if (a.k === 'cutscene') played.set(a.id, [...(played.get(a.id) ?? []), id]);
  assert.equal(SCENE.size, SCENES.length, 'scene ids are unique');
  assert.deepEqual([...played.keys()].sort(), [...SCENE.keys()].sort(), 'every scene the missions play exists, and every scene is played');
  for (const sc of SCENES) {
    assert.deepEqual([...new Set(played.get(sc.id))], [sc.mission], `${sc.id} is played by ${sc.mission} only`);
    const total = sc.shots.reduce((t, s) => t + s.dur, 0);
    assert.ok(Math.abs(total - sc.seconds) < 1e-9, `${sc.id}: shots add to ${total}, not ${sc.seconds}`);
    assert.ok(sc.seconds <= 35, `${sc.id}: a short in-engine scene`);
    assert.ok(sc.shots.length >= 3, `${sc.id}: cut into shots`);
    for (const s of sc.sets ?? []) assert.ok(S.SPACES[s], `${sc.id}: set ${s}`);
    const props = new Set();
    for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'prop') props.add(c.id);
    const mark = (m, where) => {
      if (m && typeof m === 'object') { assert.ok(m.off.length === 3 && m.off.every(Number.isFinite), `${sc.id} ${where}: offset`); return mark(m.at, where); }
      assert.equal(typeof m, 'string', `${sc.id} ${where}: mark`);
      if (m.startsWith('set:')) { const [space, anchor] = m.slice(4).split('.'); assert.ok((sc.sets ?? []).includes(space) && ANCHORS[space]?.[anchor], `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('prop:')) { assert.ok(props.has(m.slice(5)), `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('vehicle:')) { assert.ok(actsOf(mission(sc.mission)).some(([a]) => a.k === 'vehicle' && a.id === m.slice(8) && (a.model || a.at)), `${sc.id} ${where}: ${m} is a vehicle ${sc.mission} spawns`); return; }
      if (PLACES[m]) return;
      const [who, joint] = m.split('.');
      assert.ok(who in sc.cast && (joint === undefined || JOINTS.has(joint)), `${sc.id} ${where}: unknown mark ${m}`);
    };
    const cam = (c, where) => {
      if (c.k === 'split') { cam(c.left, where); cam(c.right, where); return; }
      for (const k of c.k === 'snapZoom' ? ['target'] : c.k === 'orbit' ? ['center'] : ['eye', 'look', 'from', 'to', 'target', 'center']) if (c[k] !== undefined) [c[k]].flat().forEach((m) => mark(m, where));
      if (c.k === 'rail') { c.points.forEach((m) => mark(m, where)); assert.equal(c.points.length, c.look.length); assert.equal(c.points.length, c.fov.length); }
      if (c.k === 'follow') mark(c.target, where);
    };
    mark(sc.stage.at, 'stage');
    if (sc.handoff) { mark(sc.handoff.player.at, 'handoff'); if (sc.handoff.player.space) assert.ok(S.SPACES[sc.handoff.player.space]); }
    for (const [k, v] of Object.entries(sc.cast)) {
      if (typeof v === 'string') assert.ok(v.startsWith('tpl:') || catalog.cast.has(v), `${sc.id}: cast ${k} → ${v}`);
      else { mark(v.area, `extras ${k}`); if (CAPTIVE.test(v.template)) for (const p of v.poses) assert.ok(SCENE_SCHEMA.POSES_DIGNIFIED.includes(p), `${sc.id}: captive pose ${p}`); }
    }
    sc.shots.forEach((sh, i) => {
      const where = `shot ${i + 1}`;
      cam(sh.cam, where);
      for (const c of sh.cues ?? []) {
        if (c.t !== undefined) assert.ok(c.t >= 0 && c.t < sh.dur, `${sc.id} ${where}: cue at ${c.t}s`);
        if ('who' in c && c.who !== undefined) assert.ok(c.who in sc.cast, `${sc.id} ${where}: ${c.k} by ${c.who}`);
        if (c.k === 'say') { const id = sc.cast[c.who]; assert.ok(typeof id === 'string' && catalog.cast.has(id), `${sc.id}: speaker ${c.who} needs a story cast entry`); }
        if (c.k === 'pair') { for (const x of [c.a, c.b]) assert.ok(x in sc.cast); assert.ok(!ROUGH.has(c.clip), `${sc.id}: ${c.clip} on screen`); }
        if (c.k === 'anim') assert.ok(!ROUGH.has(c.clip), `${sc.id}: ${c.clip} on screen (violence happens in play, never staged)`);
        if ((c.k === 'anim' || c.k === 'pair') && [c.who, c.a, c.b].some((x) => x && VICTIMS.has(sc.cast[x]))) assert.fail(`${sc.id}: a victim is animated`);
        if (c.at !== undefined && c.at !== null) mark(c.at, `${where} ${c.k}`);
        if (c.k === 'walk' || c.k === 'ride') c.path.forEach((m) => mark(m, `${where} ${c.k}`));
        if (c.k === 'prop' && c.attach) mark(c.attach, `${where} prop`);
        if (c.if) assert.doesNotThrow(() => setup().r.test(c.if));
      }
    });
  }
  // Mai is only spoken of in chapter 9; no gun is ever shown in a scene; the pagoda scene stages no fight
  for (const sc of SCENES) assert.ok(!Object.values(sc.cast).includes('mai'), `${sc.id}: Mai is not staged`);
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) assert.ok(!(c.k === 'prop' && /pistol|gun|sung/.test(c.kind)), `${sc.id}: a gun on screen`);
  const pagoda = SCENE.get('c9m3-la-rung');
  assert.ok(pagoda.shots.every((sh) => (sh.cues ?? []).every((c) => c.k !== 'anim' || ['sweep'].includes(c.clip))), 'at the pagoda only the broom moves');
  // the two answers to Quang start together, so only one is ever on screen
  const tra = SCENE.get('c9m3-quang').shots.at(-1).cues.filter((c) => c.k === 'say');
  assert.equal(new Set(tra.map((c) => c.t)).size, 1);
});

const subDur = (text) => Math.min(7.5, Math.max(1.8, 1.4 + 0.065 * [...text].length));
test('cutscene subtitles are readable: at most 17 characters a second, two lines on screen, none runs past the scene', () => {
  const issues = [];
  for (const sc of SCENES) {
    let t0 = 0;
    const lines = [];
    for (const [i, sh] of sc.shots.entries()) {
      for (const c of sh.cues ?? []) if (c.k === 'say') { const text = tx(c.text), s = t0 + (c.t ?? 0); lines.push({ s, e: s + (c.dur ?? subDur(text)), text, alt: !!c.if, shot: sh.label ?? `shot ${i + 1}` }); }
      t0 += sh.dur;
    }
    lines.sort((a, b) => a.s - b.s);
    for (const l of lines) {
      const next = lines.find((o) => o.s > l.s + 1e-9);
      const shown = (next ? Math.min(next.s, t0) : Math.min(l.e, t0)) - l.s, cps = [...l.text].length / Math.max(0.01, shown);
      if (next && cps > 17) issues.push(`${sc.id} [${l.shot}]: ${cps.toFixed(1)} cps (${shown.toFixed(1)} s for "${l.text}")`);
      if (l.e > t0 + 0.5) issues.push(`${sc.id} [${l.shot}]: "${l.text}" runs ${(l.e - t0).toFixed(1)} s past the scene`);
      const live = lines.filter((o) => o.s <= l.s + 1e-9 && o.e > l.s && !(o !== l && o.alt && l.alt && Math.abs(o.s - l.s) < 1e-9));
      if (live.length > 2) issues.push(`${sc.id} [${l.shot}]: ${live.length} lines on screen at ${l.s.toFixed(1)} s`);
    }
  }
  assert.deepEqual(issues, []);
});

test('cutscenes name only contract ids (plus the requests and the chapter\'s needs); slow motion only when frozen; two-actor shots have two actors', async () => {
  const kinds = { ...CONTRACT, rides: { ...CONTRACT.models, ...CONTRACT.rideModels }, sceneProps: { ...CONTRACT.props, ...CONTRACT.sceneProps } };
  const issues = [];
  for (const sc of SCENES) {
    for (const [kind, id, where] of SCENE_SCHEMA.sceneVocab(sc)) if (!Object.prototype.hasOwnProperty.call(kinds[kind] ?? {}, id)) issues.push(`${sc.id} ${where}: ${kind} '${id}'`);
    if (sc.shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'slowmo')) && !sc.stage.freezeWorld) issues.push(`${sc.id}: slowmo outside freezeWorld`);
    for (const [i, sh] of sc.shots.entries()) {
      if (sh.cam.k === 'ots' && sh.cam.speaker === sh.cam.listener) issues.push(`${sc.id} shot ${i + 1}: ots of one actor`);
      if (sh.cam.k === 'twoShot' && sh.cam.a === sh.cam.b) issues.push(`${sc.id} shot ${i + 1}: two-shot of one actor`);
    }
  }
  assert.deepEqual(issues, []);
  const { gradeFilter } = await import('../app/story-ui/format.ts');
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) if (k === 'grades') assert.notEqual(gradeFilter(id), 'none');
});

test('every flag and mission variable a chapter 9 condition reads is written by chapters 1–5 and 9, or is a declared upstream choice of chapters 6–8', () => {
  const written = new Set(), read = [];
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  for (const m of [ch1, ch2, ch3, ch4, ch5, ch9].flatMap((c) => c.chapter.missions)) { for (const [a] of actsOf(m)) note(a); for (const a of m.rewards ?? []) note(a); }
  for (const q of catalog.questions.values()) for (const a of q.onCorrect ?? []) note(a);
  for (const b of catalog.boards.values()) for (const a of b.reveals ?? []) note(a);
  const upstream = new Set(Object.keys(ch9.UPSTREAM_FLAGS));
  for (const id of MISSIONS) {
    const m = mission(id), vars = new Set(), varReads = [];
    for (const [a] of actsOf(m)) if (a.k === 'var') vars.add(a.name);
    for (const [c, at] of condsOf(m)) { if (c.k === 'flag') read.push([c.name, at]); if (c.k === 'var') varReads.push([c.name, at]); }
    for (const sc of SCENES.filter((s) => s.mission === id)) for (const sh of sc.shots) for (const cue of sh.cues ?? []) {
      const walk = (c) => { if (!c) return; if (c.k === 'flag') read.push([c.name, sc.id]); if (c.k === 'var') varReads.push([c.name, sc.id]); (c.of ?? []).forEach(walk); walk(c.c); };
      walk(cue.if);
    }
    for (const [n, at] of varReads) assert.ok(vars.has(n), `${at}: reads mission var ${n} that nothing sets`);
    for (const f of Object.keys(m.replay?.flags ?? {})) assert.ok(written.has(f), `${id} replay sets ${f}, which play also sets`);
  }
  for (const [n, at] of read) assert.ok(written.has(n) || upstream.has(n), `${at}: reads flag ${n} that nothing sets`);
  for (const f of upstream) assert.ok(read.some(([n]) => n === f), `upstream flag ${f} is read by chapter 9`);
  // items: what is taken was given before (the pistol only when Tín took it)
  const given = new Set(ch9.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a).filter((a) => a.k === 'give').map((a) => a.item)));
  for (const m of ch9.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'take') assert.ok(given.has(a.item), `${at}: takes ${a.item}`);
});

test('steps only wait for what the script offers: interactions, climbs, chases, eavesdrops, evidence sources, contract signals and meters', () => {
  const METERS = new Set(Object.keys(CONTRACT.meters));
  for (const id of MISSIONS) {
    const m = mission(id), acts = actsOf(m).map(([a]) => a);
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id)), climbs = new Set(specs.filter((x) => x.kind === 'climb').map((x) => x.id));
    for (const x of specs) if (x.kind === 'climb') assert.ok(x.to && (PLACES[x.to] || anchorOf(x.to)), `${id}: climb ${x.id} has a far end`);
    const tails = new Set(acts.filter((a) => a.k === 'tail').map((a) => a.target)), ears = new Set(acts.filter((a) => a.k === 'eavesdrop').map((a) => a.id));
    const chases = new Set(acts.filter((a) => a.k === 'do' && a.op === 'chase').map((a) => a.args.id));
    const pursued = acts.some((a) => a.k === 'do' && a.op === 'pursue' && !a.args.stop);
    const sources = new Set([...acts.filter((a) => a.k === 'evidence').map((a) => a.id), ...acts.filter((a) => (a.k === 'photoTarget' || a.k === 'clue') && a.evidence).map((a) => a.evidence)]);
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id) && !climbs.has(c.id), `${at}: waits for interaction ${c.id}`);
      if (c.k === 'on' && c.ev === 'climb') assert.ok(climbs.has(c.id), `${at}: waits for climb ${c.id}`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(CONTRACT.signals[c.id] || CONTRACT.ops[c.id], `${at}: signal ${c.id}`);
      if (c.k === 'on' && ['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(tails.has(c.id), `${at}: waits for tail ${c.id}`);
      if (c.k === 'on' && ['escaped', 'caught'].includes(c.ev) && c.id && c.id !== 'coba') assert.ok(chases.has(c.id), `${at}: waits for chase ${c.id}`);
      if (c.k === 'on' && c.ev === 'caught' && !c.id) assert.ok(pursued, `${at}: a pursuit is running`);
      if (c.k === 'on' && c.ev === 'eavesdrop') assert.ok(ears.has(c.id), `${at}: waits for eavesdrop ${c.id}`);
      if (c.k === 'evidence' && ch9.EVIDENCE.some((e) => e.id === c.id)) assert.ok(sources.has(c.id), `${at}: evidence ${c.id} has a source in ${id}`);
      if (c.k === 'meter') assert.ok(METERS.has(c.id) || /^(tail|eavesdrop):/.test(c.id), `${at}: meter ${c.id}`);
      assert.notEqual(c.k, 'q', `${at}: chapter 9 waits on no engine query (they answer false until their lane lands)`);
    }
    for (const a of acts) if (a.k === 'do') assert.ok(CONTRACT.ops[a.op], `${id}: op ${a.op}`);
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(METERS.has(x.id) || tails.has(x.id.slice(5)) || ears.has(x.id.slice(10)), `${id}/${s.id}: meter ${x.id} has a helper`);
  }
  // every chase controller started is stopped (or ends with its step's checkpoint section)
  for (const id of MISSIONS) {
    const acts = actsOf(mission(id)).map(([a]) => a);
    for (const c of acts.filter((a) => a.k === 'do' && a.op === 'chase')) assert.ok(acts.some((a) => a.k === 'stop' && a.id === c.args.id) || id === 'c9-m3', `${id}: chase ${c.args.id} is stopped`);
  }
});

test('case board: chapter 9 cards are evidence with a source, the strings tie them to chapters 3 and 5 and the board solves', () => {
  const ids = [...new Set([...ch9.BOARD_CARDS.map((c) => c.id), ...ch9.BOARD_LINKS.flat()])];
  const board = { id: 'test-ch9', title: '@cast.tin', cards: ids.map((id) => ({ id })), links: ch9.BOARD_LINKS };
  const evidence = new Set(catalog.evidence.keys());
  const all = [...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS, ...ch3.BOARD_CARDS, ...ch4.BOARD_CARDS, ...ch5.BOARD_CARDS, ...ch9.BOARD_CARDS], slots = all.map((c) => c.slot);
  assert.equal(new Set(slots).size, slots.length, `one card per lotus slot across chapters 1–5 and 9 (${slots.join(',')})`);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, 'no card twice');
  assert.ok(ch9.BOARD_CARDS.every((c) => c.slot >= 90 && c.slot <= 99), 'chapter 9 keeps to its slot block 90–99');
  for (const [a, b] of [['ev-ghi-am-luc', 'ev-clip-luc'], ['ev-the-b2', 'ev-thang-may-b2'], ['ev-bien-suv', 'ev-xe-den']]) assert.ok(ch9.BOARD_LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a)), `${a} ↔ ${b}`);
  assert.deepEqual(D.lintBoard(board, evidence), []);
  const seen = new Set([ids[0]]), todo = [ids[0]];
  while (todo.length) { const a = todo.pop(); for (const [x, y] of board.links) for (const [p, q] of [[x, y], [y, x]]) if (p === a && !seen.has(q)) { seen.add(q); todo.push(q); } }
  assert.equal(seen.size, ids.length, 'every card is on a string');
  const p = F.newProgress(); p.evidence.push(...ids);
  let solved = false;
  for (const [a, b] of board.links) solved = D.linkCards(board, p, a, b, (id) => p.evidence.includes(id)).solved;
  assert.equal(solved, true);
  for (const c of ch9.BOARD_CARDS) assert.equal(ch9.EVIDENCE.find((e) => e.id === c.id)?.chapter, 9, `${c.id} is a chapter 9 card`);
  const sources = new Set();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) {
    if (a.k === 'evidence') sources.add(a.id);
    if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence);
  }
  assert.deepEqual(ch9.EVIDENCE.map((e) => e.id).filter((e) => !sources.has(e)), []);
  // the deduction rests on the two things Lực said
  assert.deepEqual(catalog.questions.get('ai-chan-xe').options.find((o) => o.id === 'bo').needs, ['ev-ghi-am-luc', 'ev-luc-ram']);
});

test('chapters 6–8 agree with the stand-in and the upstream choices when they load; no chapter 9 id collides with chapters 6–8, 10 and 11', async (t) => {
  const load = async (n) => {
    const url = new URL(`../app/game/story/content/ch${String(n).padStart(2, '0')}.ts`, import.meta.url);
    if (!existsSync(url)) { t.diagnostic(`content/ch${String(n).padStart(2, '0')}.ts is not built yet`); return null; }
    try { return await import(url.href); } catch (e) { t.diagnostic(`content/ch${String(n).padStart(2, '0')}.ts does not load yet (${e.message.split('\n')[0]})`); return null; }
  };
  const choiceOf = (mod, id) => { for (const m of mod.chapter?.missions ?? []) for (const [a] of actsOf(m)) if (a.k === 'choice' && a.id === id) return a; return null; };
  const m6 = await load(6), m7 = await load(7), m8 = await load(8);
  if (m6) {
    const cast = new Set((m6.chapter?.cast ?? []).map((c) => c.id));
    for (const c of CH6_STAND_IN.cast) assert.ok(cast.has(c.id), `chapter 6 defines cast '${c.id}', which chapter 9 speaks with`);
    const q = choiceOf(m6, 'quangBen');
    assert.ok(q && q.options.some((o) => o.id === 'keo-day') && q.options.some((o) => o.id === 'bo-di'), "c6-m3's choice 'quangBen' offers 'keo-day' and 'bo-di'");
  }
  if (m7) assert.ok(m7.chapter.missions.some((m) => actsOf(m).some(([a]) => (a.k === 'player' || a.k === 'unlock') && a.outfit === 'tin-ao-tu')), "chapter 7 dresses Tín in 'tin-ao-tu'");
  if (m8) { const q = choiceOf(m8, 'phongBi'); assert.ok(q && q.options.some((o) => o.id === 'cam'), "c8-m3's choice 'phongBi' offers 'cam'"); }
  // ids chapter 9 defines must stay unique once the other chapters register
  const mine = {
    cast: ch9.CAST.map((c) => c.id), evidence: ch9.EVIDENCE.map((e) => e.id), journal: ch9.JOURNAL.map((j) => j.id), questions: ch9.QUESTIONS.map((q) => q.id),
    text: Object.keys(t9.TEXT), places: Object.keys(ch9.PLACES), missions: MISSIONS,
  };
  for (const n of [6, 7, 8, 10, 11]) {
    const mod = n <= 8 ? [m6, m7, m8][n - 6] : await load(n);
    const c = mod?.chapter;
    if (!c) continue;
    const theirs = { cast: (c.cast ?? []).map((x) => x.id), evidence: (c.evidence ?? []).map((x) => x.id), journal: (c.journal ?? []).map((x) => x.id), questions: (c.questions ?? []).map((x) => x.id), text: Object.keys(c.text ?? {}), places: Object.keys(c.places ?? {}), missions: c.missions.map((m) => m.id) };
    for (const [k, ids] of Object.entries(mine)) for (const id of ids) assert.ok(!theirs[k].includes(id), `chapter ${n} also defines ${k} '${id}'`);
    // the board blocks stay apart
    const slots = new Set((mod.BOARD_CARDS ?? []).map((x) => x.slot));
    for (const x of ch9.BOARD_CARDS) assert.ok(!slots.has(x.slot), `chapter ${n} also puts a card on slot ${x.slot}`);
  }
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

const MAIN = {};
const snapshots = [];
const CHECKPOINTS = [
  'c9-m1/chui-san', 'c9-m1/cho-sang', 'c9-m1/xe-che', 'c9-m1/qua-chot', 'c9-m1/vao-quan-1',
  'c9-m2/bom-1', 'c9-m2/gan-cam', 'c9-m2/nghe-luc', 'c9-m2/chay-bo', 'c9-m2/chay-xe',
  'c9-m3/bep', 'c9-m3/hem-cho', 'c9-m3/chay-chua',
];

test('main path: one save plays c9-m1 → c9-m3 end to end on the mock host from the end of chapter 8', () => {
  const { r, w } = setup({ ...MAIN, progress: START, onCheckpoint: (e, run) => snapshots.push({ id: run.state().mission, step: e.step, save: run.snapshot() }) });
  for (const id of MISSIONS) {
    before.set(id, F.cloneProgress(r.progress()));
    const meta = catalog.meta.get(id), hour = (meta.hours[0] + 0.5) % 24;
    assert.equal(F.availability(catalog.index, r.progress(), hour).find((a) => a.id === id).state, 'open', `${id} is open at ${hour}h`);
    assert.equal(r.start(id), true);
    const at = w.outs.length;
    const res = autopilot(r, w);
    const done = completed(w).at(-1);
    assert.equal(done.id, id);
    assert.equal(done.chain, mission(id).chain ?? null);
    assert.deepEqual(w.outs.slice(at).filter((e) => e.type === 'fail'), [], `${id}: no fail on the main path`);
    assert.ok(res.ticks < 15000);
    assert.equal(done.result.nonLethal, true);
  }
  const p = r.progress();
  for (const id of MISSIONS) assert.ok(p.completed.includes(id));
  assert.deepEqual(w.missing, [], 'every actor, vehicle and place a step uses exists');
  assert.deepEqual(r.state().issues, []);
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [9], 'the chapter card shows once');
  assert.deepEqual(p.lunar, { month: 8, day: 14 });
  assert.equal(r.view().lunar.countdown, 'MAI LÀ RẰM');
  assert.equal(p.flags.rescued, 11, 'nobody is rescued in chapter 9: 11 stays 11 until B2 (story-decisions.md 13)');
  assert.equal(p.cash, 900, 'no money changes hands on the main path (the drunk is bluffed, not bought a beer)');
  assert.deepEqual([p.items['the-b2'], p.items['sung-van']], [1, undefined], 'the B2 keycard stays with Tín; Vân\'s pistol went back to her');
  for (const f of ['knowsLam', 'knowsBiaHoi', 'tamHoAlly', 'ventCam', 'recordedLuc', 'knowsRamPlan', 'knowsTaskForce', 'quangBack', 'coBaAtPagoda', 'quangComing', 'envelopeBurnt']) assert.equal(p.flags[f], true, f);
  assert.deepEqual([p.flags['choice:noiVoiMa'], p.flags['choice:bluffSay'], p.flags['choice:sungVan']], ['tin', 'giong', 'cam']);
  for (const e of ['ev-ban-tin', 'ev-ghi-am-luc', 'ev-luc-ram', 'ev-the-b2']) assert.ok(p.evidence.includes(e), e);
  for (const j of ['j-truy-na', 'j-lam-co-ba', 'j-ba-sau-che', 'j-tam-ho', 'j-ghi-am', 'j-48-gio', 'j-quang-ve', 'j-la-rung']) assert.ok(p.journal.includes(j), j);
  assert.deepEqual(p.deductions['ai-chan-xe'], { answer: 'bo', tries: 1 });
  assert.deepEqual([p.conscience.kills, F.conscienceTier(p.conscience)], [0, 'clean']);
  for (const sc of SCENES) assert.ok(p.seen.includes(sc.id), `${sc.id} played`);
  // the manhunt: three checkpoints in the morning, posters and witnesses at night, the cooldown for the raid
  const wanted = w.log.filter((l) => l.k === 'do' && l.a.op === 'wanted').map((l) => [l.mission, l.a.args.mode, (l.a.args.checkpoints ?? []).length]);
  assert.deepEqual(wanted[0], ['c9-m1', 'manhunt', 3]);
  assert.ok(wanted.some(([m, mode, n]) => m === 'c9-m2' && mode === 'manhunt' && n === 0) && wanted.some(([m, mode]) => m === 'c9-m3' && mode === 'cooldown'));
  // the disguises in order: Ông Tư's jacket, Lâm's raincoat, the orange jacket among the shippers, the porter, the jacket again
  const outfits = w.log.filter((l) => l.k === 'player' && l.a.outfit).map((l) => l.a.outfit).filter((o, i, a) => o !== a[i - 1]);
  assert.deepEqual(outfits.filter((o, i, a) => a.indexOf(o) === i), ['tin-ao-tu', 'tin-ao-mua', 'tin-shipper', 'tin-khuan-vac']);
  assert.equal(w.player.outfit, 'tin-ao-tu');
  // Vân's pistol: taken in c9-m2, in hand for the raid, back to her in the car; the pillion: on for the ride, off at the gate
  assert.deepEqual(w.log.filter((l) => l.k === 'do' && l.a.op === 'arm').map((l) => l.a.args.weapon), ['pistol', null]);
  assert.deepEqual(w.log.filter((l) => l.k === 'do' && l.a.op === 'pillion').map((l) => l.a.args.cast), ['coba', null]);
  assert.equal(w.rules.guns, 'any');
  // the call to Má after the manhunt, with the proverb at the end
  const call = w.log.find((l) => l.k === 'call' && l.id === 'c9m1-ma-2');
  assert.deepEqual(call.a.lines.map((l) => l.text), [tx('@c9m1.t.tin'), tx('@c9m1.ma.tin'), tx('@c9m1.ma2'), tx('@c9m1.t2'), tx('@c9m1.ma3')]);
  assert.deepEqual(snapshots.map((x) => `${x.id}/${x.step}`), CHECKPOINTS, 'every checkpoint of the main path saved');
  assert.ok(outs(w, 'checkpoint').every((e) => /^Đã lưu · /.test(e.label)));
});

test('resume from every checkpoint of the main path: the setups rebuild the world and the mission completes', () => {
  assert.equal(snapshots.length, CHECKPOINTS.length);
  for (const { id, step, save } of snapshots) {
    const { r, w } = setup(MAIN);
    assert.equal(r.resume(save), true, `${id}/${step} resumes`);
    autopilot(r, w);
    assert.equal(completed(w).at(-1)?.id, id, `${id} completes from ${step}`);
    assert.deepEqual(w.missing, [], `${id}/${step}: nothing used before it is rebuilt`);
    assert.equal(w.resets[0], 'checkpoint');
    assert.deepEqual(outs(w, 'fail'), []);
  }
});

test('c9-m1: without Bà Sáu the route is the back alley; without the envelope nothing burns; the other answer to Má', () => {
  const { w, p, res } = play('c9-m1', { progress: endOfChapter8({ helpedBaSau: false, 'choice:phongBi': 'day' }), choose: { noiVoiMa: 'hua' } });
  assert.ok(res.visits['vong-hem'] && !res.visits['xe-che'], 'the detour instead of the tarp');
  assert.ok(!p.journal.includes('j-ba-sau-che'));
  assert.ok(!w.log.some((l) => l.k === 'prop' && l.a.kind === 'xe-che'), 'no chè cart on the sidewalk');
  assert.ok(!p.seen.includes('c9m1-phong-bi') && !p.flags.envelopeBurnt, 'the envelope scene needs the envelope');
  const call = w.log.find((l) => l.k === 'call' && l.id === 'c9m1-ma-2');
  assert.deepEqual(call.a.lines.slice(0, 2).map((l) => l.text), [tx('@c9m1.t.hua'), tx('@c9m1.ma.hua')]);
  assert.deepEqual(w.missing, []);
  assert.equal(F.conscienceTier(p.conscience), 'clean');
});

test('c9-m1: too slow to the hollow fails back to it; found three times under the floor skips to Cô Ba with the disguise; recognised by the patrol', () => {
  const late = play('c9-m1', { progress: before.get('c9-m1'), hold: { 'chui-san': ({ visit }) => visit === 1 }, onFail: () => 'retry' });
  assert.deepEqual(outs(late.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c9m1.fail.cham'), false]]);
  assert.equal(late.res.visits['chui-san'], 2);
  const found = play('c9-m1', {
    progress: before.get('c9-m1'),
    hold: { 'nin-tho': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'ca-1' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c9m1.fail.lo')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(found.w.log.some((l) => l.step === 'co-ba') && !found.w.log.some((l) => l.step === 'nin-tho' && l.k === 'despawn'), 'the skip lands on Cô Ba lifting the board');
  assert.ok(found.p.seen.includes('c9m1-lam') && found.p.flags.knowsLam);
  assert.ok(found.w.log.some((l) => l.k === 'player' && l.a.outfit === 'tin-ao-mua'), 'Lâm\'s raincoat all the same');
  assert.deepEqual([found.done.stats.skipped, found.done.result.grade, found.done.result.ghost], [1, 'C', false]);
  const seen = play('c9-m1', {
    progress: before.get('c9-m1'),
    hold: { 'xe-che': ({ w, visit }) => { if (visit === 1) w.player.wanted = 1; return visit === 1; } },
    // the call ends with the retry: the restore starts the beat again unstarred
    onFail: (v, _n, w) => { assert.equal(v.failure.reason, tx('@c9m1.fail.tuanTra')); w.player.wanted = 0; return 'retry'; },
  });
  assert.equal(seen.res.visits['xe-che'], 2, 'the restore puts Tín back at the lane mouth before the cart');
  assert.ok(seen.w.log.filter((l) => l.k === 'spawn' && l.id === 'tt-1').length >= 2, 'the patrol walks again');
  for (const run of [late, found, seen]) assert.deepEqual(run.w.missing, []);
});

test('c9-m2: a loud answer to the drunk replays the table and a beer costs 20.000đ; a wrong guess costs a token; the SUV plate; the pistol left', () => {
  const tokens = before.get('c9-m2').hintTokens;
  const run = play('c9-m2', { progress: before.get('c9-m2'), choose: { bluffSay: ['cai', 'bia'], sungVan: 'tra' }, wrong: { 'ai-chan-xe': 'phuong' }, optional: ['bien-suv'] });
  assert.deepEqual(outs(run.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c9m2.fail.say'), true]], 'one soft fail, no card');
  assert.equal(run.res.visits['nghe-luc'], 2);
  assert.ok(run.w.log.some((l) => l.k === 'dialogue' && l.id === 'c9m2-say-cai') && run.w.log.some((l) => l.k === 'dialogue' && l.id === 'c9m2-say-bia'));
  assert.equal(run.p.flags['choice:bluffSay'], 'bia');
  assert.equal(run.p.cash, before.get('c9-m2').cash - 20, 'the beer is on Tín');
  assert.deepEqual(run.p.deductions['ai-chan-xe'], { answer: 'bo', tries: 2 });
  assert.ok(run.p.hintTokens <= tokens + 1, 'the wrong guess cost a token');
  assert.ok(run.p.evidence.includes('ev-bien-suv'));
  assert.equal(run.done.result.eye, true, 'Mắt cú for the plate');
  assert.ok(!run.p.items['sung-van'] && run.p.flags['choice:sungVan'] === 'tra');
  assert.ok(run.w.log.some((l) => l.k === 'dialogue' && l.id === 'c9m2-sung-tra'));
  // and the raid without the pistol: no weapon, no guns in the arena rules
  const raid = play('c9-m3', { progress: run.p });
  assert.ok(!raid.w.ops.includes('arm'), 'no weapon in hand');
  assert.equal(raid.w.rules.guns, 'none');
  assert.ok(!raid.w.log.some((l) => l.k === 'hint' && l.a.text === tx('@c9m3.hint.sung')));
  for (const r of [run, raid]) assert.deepEqual(r.w.missing, []);
});

test('c9-m2: caught three times on foot skips to the bike; the SUV three times skips to the ride home; the camera is lost either way', () => {
  const foot = play('c9-m2', {
    progress: before.get('c9-m2'),
    hold: { 'chay-bo': ({ w, visit }) => { if (visit <= 3) { const g = w.actors.get('ve-si-luc'); Object.assign(g, { x: w.player.x, z: w.player.z, space: w.player.space }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c9m2.fail.tom')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(foot.res.visits['chay-xe'] && foot.res.visits['chay-bo'] === 3, 'the skip lands on the bike with the SUV coming');
  const car = play('c9-m2', {
    progress: before.get('c9-m2'),
    hold: { 'chay-xe': ({ visit, push }) => { if (visit <= 3) { push({ type: 'caught', id: 'duoi-luc' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c9m2.fail.bat')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(car.res.visits['mat-dau'] && car.res.visits['chay-xe'] === 3);
  assert.ok(car.w.log.some((l) => l.k === 'stop' && l.id === 'duoi-luc' && l.step === 'mat-dau'), 'the chase is stopped after the skip');
  for (const run of [foot, car]) {
    assert.deepEqual([run.done.stats.skipped, run.done.result.grade], [1, 'C']);
    assert.ok(run.p.evidence.includes('ev-ghi-am-luc'), 'the recording was already on the phone');
    assert.ok(run.w.log.some((l) => l.k === 'dialogue' && l.id === 'c9m2-mat'));
    assert.deepEqual(run.w.missing, []);
  }
});

test('c9-m3: with the pistol a kill in the lane does not end the mission but stains LƯƠNG TÂM; Cô Ba caught replays the lane', () => {
  const armed = play('c9-m3', {
    progress: before.get('c9-m3'), optional: ['ao-gia'],
    hold: { 'hem-cho': ({ visit, push }) => { if (visit === 1) push({ type: 'kill', id: 'rd-3', tag: 'guard', cause: 'bullet' }); return false; } },
  });
  assert.equal(armed.done.id, 'c9-m3');
  assert.deepEqual([armed.p.conscience.kills, F.conscienceTier(armed.p.conscience), armed.done.result.nonLethal], [1, 'stained', false]);
  assert.ok(armed.w.log.some((l) => l.k === 'dialogue' && l.id === 'c9m3-giet'), 'Tín feels it');
  const vSach = SCENE.get('c9m3-tap-hop').shots.flatMap((s) => s.cues).filter((c) => c.k === 'say' && c.if);
  const { r } = setup({ progress: before.get('c9-m3') });
  r.start('c9-m3'); r.tick(0.1);
  assert.deepEqual(vSach.map((c) => [c.text, r.test(c.if)]), [['@c9m3.cs.vSach', true], ['@c9m3.cs.vGiet', false]], 'Vân\'s line for a night without a death');
  r.event({ type: 'kill', id: 'x', tag: 'guard', cause: 'bullet' }); r.tick(0.1);
  assert.deepEqual(vSach.map((c) => r.test(c.if)), [false, true], 'and for a night with one');
  assert.ok(armed.p.evidence.includes('ev-ao-gia') && armed.done.result.eye);
  const caught = play('c9-m3', {
    progress: before.get('c9-m3'),
    hold: { 'hem-cho': ({ visit, push }) => { if (visit === 1) { push({ type: 'caught', id: 'coba' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c9m3.fail.coba')); return 'retry'; },
  });
  assert.equal(caught.res.visits['hem-cho'], 2);
  assert.ok(caught.w.log.filter((l) => l.k === 'spawn' && l.id === 'coba' && l.step === 'hem-cho').length >= 2, 'the restore brings Cô Ba back to the back door');
  for (const run of [armed, caught]) assert.deepEqual(run.w.missing, []);
});

test('c9-m3: the kick is optional and non-lethal; caught three times on the road skips to the pagoda gate; Quang\'s answer follows c6-m3', () => {
  const kick = play('c9-m3', { progress: before.get('c9-m3'), optional: ['da-xe'] });
  assert.ok(kick.done.stats.optional.includes('da-xe'));
  assert.deepEqual([kick.done.stats.knockouts, F.conscienceTier(kick.p.conscience)], [1, 'clean'], 'a kicked biker is knocked out, never killed');
  const road = play('c9-m3', {
    progress: before.get('c9-m3'),
    hold: { 'chay-chua': ({ visit, push }) => { if (visit <= 3) { push({ type: 'caught', id: 'xe-rd-1' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c9m3.fail.chan')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(road.w.log.some((l) => l.step === 'cong-chua') && road.p.seen.includes('c9m3-la-rung'), 'the abbot still turns them away at the gate');
  assert.ok(road.w.log.some((l) => l.k === 'do' && l.a.op === 'pursue' && l.a.args.stop && l.step === 'cong-chua'));
  assert.equal(road.w.pillion, null, 'Cô Ba is off the bike at the pagoda');
  // the answer at the back door: a hand on the shoulder after "Kéo nó dậy", only the card after "Bỏ đi"
  const last = SCENE.get('c9m3-quang').shots.at(-1).cues;
  for (const [gesture, keo] of [['keo-day', true], ['bo-di', false]]) {
    const p = F.cloneProgress(before.get('c9-m3')); p.flags['choice:quangBen'] = gesture;
    const { r } = setup({ progress: p }); r.start('c9-m3'); r.tick(0.1);
    const shown = last.filter((c) => !c.if || r.test(c.if)).map((c) => c.k === 'say' ? c.text : c.k === 'pair' ? c.clip : null).filter(Boolean);
    assert.deepEqual(shown, keo ? ['hand-on-shoulder', '@c9m3.cs.tKeo', 'handover'] : ['@c9m3.cs.qBo', 'handover']);
  }
  for (const run of [kick, road]) assert.deepEqual(run.w.missing, []);
});

test('LƯƠNG TÂM in chapter 9: a chokehold "kill" is a knockout; a real death fails c9-m1 and c9-m2 and stains c9-m3', () => {
  for (const id of MISSIONS) {
    const { r } = setup({ progress: before.get(id) });
    r.start(id);
    for (let i = 0; i < 3; i++) r.tick(0.1);
    r.event({ type: 'kill', id: 'gac', tag: 'guard', cause: 'choke' });
    r.tick(0.1);
    assert.notEqual(r.view().phase, 'failed', `${id}: a choke never kills`);
    r.event({ type: 'kill', id: 'gac-2', tag: 'guard', cause: 'fall' });
    r.tick(0.1);
    if (id === 'c9-m3') { assert.notEqual(r.view().phase, 'failed', 'the raid allows open combat'); assert.equal(F.conscienceTier(r.progress().conscience), 'stained'); }
    else assert.equal(r.view().failure?.reason, R.LETHAL_REASON, `${id}: Tín không giết ai`);
  }
  // the officers in the attic and the patrol are innocents: hurting one is booked as such
  const { r } = setup({ progress: before.get('c9-m1') });
  r.start('c9-m1'); r.tick(0.1);
  r.event({ type: 'knockout', id: 'tt-1', tag: 'innocent', cause: 'fist' }); r.tick(0.1);
  assert.equal(r.progress().conscience.civiliansHurt, 1);
});

test('replays: every chapter 9 mission replays in a sandbox from its chapter start and its replay block', () => {
  const { r, w } = setup({ progress: START });
  for (const id of MISSIONS) { r.start(id); autopilot(r, w); }
  const main = F.cloneProgress(r.progress());
  for (const id of MISSIONS) {
    assert.equal(r.start(id, { replay: true }), true);
    autopilot(r, w);
    assert.equal(completed(w).at(-1).replay, true, `${id} replay completes`);
  }
  const after = r.progress();
  assert.deepEqual([after.cash, after.flags, after.evidence, after.items], [main.cash, main.flags, main.evidence, main.items], 'replays change nothing but medals');
  assert.ok(MISSIONS.every((id) => after.medals[id].plays === 2));
  assert.deepEqual(w.missing, []);
  assert.deepEqual(r.state().issues, []);
});
