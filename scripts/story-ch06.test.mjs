// node --experimental-transform-types --test scripts/story-ch06.test.mjs
// Story content, chapter 6 (SEN TRONG BÙN · KẺ PHẢN BỘI): c6-m1 the pagoda, Phượng, the tail and the 68th-floor deck,
// c6-m2 the iron box, Quang's text, the burning shop, Ông Tư's whistle and the officers who came first, c6-m3 dawn,
// the pier, the box opened and the funeral. The chapter loads through the registry beside chapters 1–5 and lints
// clean against the real sites and the engine contract (plus SCENE_REQUESTS, chapter 4's CONTRACT_REQUESTS, chapter
// 5's ENGINE_NEEDS and this chapter's ENGINE_NEEDS, which must name exactly what the contract lacks); every text
// reference resolves (no inline strings, no orphan keys, no real brands, the ring only via {@ring}, lines fit); every
// place is a site, a chapter place checked on today's map, or a declared space anchor, and each mission uses the sites
// story-decisions.md gave it; the cutscenes are consistent (durations, marks, cast, sets, nobody struck on screen,
// readable subtitles) and name only contract ids; the case board places its cards on free lotus slots, lints and
// solves; the steps only wait for what the script offers. A mock host and an autopilot play c6-m1 → c6-m3 from an
// end-of-chapter-5 progress, resume from every checkpoint, and play the alternatives: standing too close to Phượng, a
// lost tail skipped to the deck, the car photo missed (the plate remembered), the roof skipped to the roof-gap scene,
// the collapse timer skipped with the box still saved, the text answered after "Giấu chuyện Quang", the punch held
// back or thrown, either gesture, Quang reaching the boat, the race to the pier skipped, a wrong answer on the board,
// the optional clues, LƯƠNG TÂM and the replays. The hand-offs to chapters 7–9 are checked when those chapters load.
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
const ch6 = await import('../app/game/story/content/ch06.ts');
const cs6 = await import('../app/game/story/cutscenes/ch06.ts');
const T = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => import(`../app/game/story/text/vi/ch0${n}.ts`)));
const t6 = T[5];
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT, SCENE_REQUESTS } = await import('../app/game/story/contract.ts');
const city = await import('../app/game/city.ts');
const { TERRAIN } = await import('../app/game/map/terrain.ts');
const DIST = await import('../app/game/map/districts.ts');

for (const n of [1, 2, 3, 4, 5]) C.registerChapter(n, () => import(`../app/game/story/content/ch0${n}.ts`));
C.registerChapter(6, () => import('../app/game/story/content/ch06.ts'));
const catalog = await C.loadCatalog([1, 2, 3, 4, 5, 6]);
const MODULES = [ch1.chapter, ch2.chapter, ch3.chapter, ch4.chapter, ch5.chapter, ch6.chapter];
const SCENES = cs6.CUTSCENES;
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = {};
for (const a of [ch1.ANCHORS, ch2.ANCHORS, ch3.ANCHORS, ch4.ANCHORS, ch5.ANCHORS, ch6.ANCHORS]) for (const [k, v] of Object.entries(a ?? {})) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const MISSIONS = ['c6-m1', 'c6-m2', 'c6-m3'];
const SPACE_IDS = Object.keys(S.SPACES);
const KINDS = Object.keys(ENGINE_CONTRACT);
const merge = (...tables) => Object.fromEntries(KINDS.map((k) => [k, Object.assign({}, ...tables.map((t) => t?.[k] ?? {}))]));
/** What the contract offers before this chapter: ENGINE_CONTRACT, the chapter 4–5 scene requests and those chapters' own lists. */
const BEFORE = merge(ENGINE_CONTRACT, SCENE_REQUESTS, ch4.CONTRACT_REQUESTS, ch5.ENGINE_NEEDS);
/** ...plus the ids chapter 6 asks for (lanes in content/ch06.ts ENGINE_NEEDS). */
const CONTRACT = merge(BEFORE, ch6.ENGINE_NEEDS);
const tx = R.makeText(catalog, (n) => ({ cash: 195, debtPaid: 1350, debtTotal: 40000, hintTokens: 2 })[n]);

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

// ---- mock host (story-ch05.test.mjs, plus QTE results and the level of interactions) -----------------------------

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
    runner: null, choose: structuredClone(o.choose ?? {}), qte: o.qte ?? {}, log: [], outs: [], resets: [], missing: [], fails: 0,
    player: { x: 0, z: 0, mode: 'foot', space: null, level: null, crouched: false, hidden: false, speed: 0, carrying: null, cover: null, visibility: 1, wanted: 0 },
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
          if (c.level !== undefined && p.level !== c.level) return false;
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
          if (a.leave) { const p = a.leave === true ? null : resolve(a.leave); Object.assign(w.player, { space: null, level: null, mode: 'foot' }, p ? { x: p.x, z: p.z } : {}); }
          if (a.variant && !S.SPACES[a.variant.id]) miss(`space variant ${a.variant.id}`, ctx);
          break;
        case 'player': if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover; if (a.outfit) w.player.outfit = a.outfit; break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'time': w.hour = a.hour; break;
        case 'police': if (a.force) w.player.wanted = a.force; if (a.reset) w.player.wanted = 0; break;
      }
      const blocking = (BLOCKING.has(a.k) && a.mode !== 'ambient') || (a.k === 'do' && a.wait);
      if (!blocking) return false;
      let result;
      if (a.k === 'choice') { const pick = w.choose[a.id]; result = Array.isArray(pick) ? pick.shift() : pick; result ??= a.options[0]?.id; }
      if (a.k === 'do' && a.op === 'qte') result = w.qte[a.args.id] ?? 'ok';
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
      Object.assign(w.player, { hidden: false, crouched: false, level: null, visibility: 1, wanted: 0 });
    },
    emit(e) { w.outs.push(e); if (e.type === 'fail') w.fails++; if (e.type === 'checkpoint') o.onCheckpoint?.(e, w.runner); },
  };
  return w;
}
function setup(o = {}) {
  const w = mockWorld(o);
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 6 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot ----------------------------------------------------------------------------------------------------

function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), answered = new Set(), waited = {};
  /** An interaction a watcher adds shows up once that watcher's acts have run (the next tick): allow a few ticks. */
  const offered = (id) => { const it = r.view().interacts.find((x) => x.id === id); if (it) return it; waited[id] = (waited[id] ?? 0) + 1; assert.ok(waited[id] < 5, `${step}: interaction ${id} is offered`); return null; };
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
          const it = offered(c.id);
          if (!it) return;
          moveTo(it.at, it.when, it.level);
        } else if (c.ev === 'climb') {
          const it = offered(c.id);
          if (!it) return;
          assert.ok(it.kind === 'climb' && it.to, `${step}: climb ${c.id} is offered with a far end`);
          moveTo(it.at, it.when, it.level);
          moveTo(it.to, 'foot');
        } else if (c.ev === 'eavesdrop') assert.ok(w.helpers.has(c.id), `${step}: eavesdrop ${c.id} is running`);
        else if (['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(w.helpers.has(c.id), `${step}: tail ${c.id} is running`);
        else if (c.ev === 'signal' || c.ev === 'choice' || c.ev === 'timer') return; // raised by the script's own acts
        else if (c.ev === 'knockout') { const a = w.actors.get(c.id); assert.ok(a, `${step}: ${c.id} is there to take down`); a.down = true; }
        push({ type: c.ev, id: c.id, ...(c.tag ? { tag: c.tag } : {}), ...(c.where ?? {}) });
        return;
      }
      default: return;
    }
  }
  for (let i = 0; i < (o.maxTicks ?? 20000); i++) {
    r.tick(0.1);
    const v = r.view(), s = r.state();
    if (v.phase === 'done') return { visits, ticks: i };
    if (v.phase === 'failed') {
      const how = o.onFail?.(v, visits[step] ?? 0);
      if (!how) throw new Error(`${s.mission}/${v.step} failed: ${v.failure.reason}`);
      assert.ok(how === 'skip' ? r.skipSection() : r.retry(), `${how} after "${v.failure.reason}"`);
      continue;
    }
    const sess = s.session;
    if (sess?.kind === 'deduce') { const q = catalog.questions.get(sess.id), wrong = o.wrong?.[sess.id]; r.ui.answer(wrong && !answered.has(sess.id) ? wrong : q.answer); answered.add(sess.id); }
    else if (sess?.kind === 'board') {
      const def = catalog.boards.get(sess.id);
      for (const [a, b] of o.wrongLinks?.[sess.id] ?? []) r.ui.link(a, b);
      for (const [a, b] of def.links) r.ui.link(a, b);
      for (const h of def.hypotheses ?? []) r.ui.propose(h.id, h.needs);
    }
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
    const b = o.branch?.[step];
    if (b !== undefined && def.branch?.[b]) satisfy(def.branch[b].when, def);
    else if (def.done) satisfy(def.done, def);
  }
  throw new Error(`${r.state().mission} did not finish (stuck at ${r.view().step})`);
}
const outs = (w, type) => w.outs.filter((e) => e.type === type);
const completed = (w) => outs(w, 'complete');
const lines = (w, id) => w.log.find((l) => l.k === 'dialogue' && l.id === id)?.a.lines.map((l) => l.text);
function play(id, o = {}) {
  const { r, w } = setup(o);
  assert.equal(r.start(id, o.replay ? { replay: true } : undefined), true, `${id} starts`);
  const res = autopilot(r, w, o);
  return { r, w, res, done: completed(w).at(-1), p: r.progress() };
}

/** Every evidence id chapters 1–5 grant in play (evidence acts, photo targets, clues, recorder marks). */
const GRANTED_1_5 = new Set();
for (const m of MODULES.slice(0, 5)) for (const mi of m.missions) for (const [a] of actsOf(mi)) {
  if (a.k === 'evidence') GRANTED_1_5.add(a.id);
  if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) GRANTED_1_5.add(a.evidence);
  if (a.k === 'do' && a.op === 'cctv') for (const x of a.args.marks) GRANTED_1_5.add(x.evidence);
}
/** The progress at the end of chapter 5 as far as chapter 6 reads it (the main paths of chapters 1–5, summarised). */
function endOfChapter5(o = {}) {
  const p = F.newProgress();
  for (const m of F.missionOrder(C.CAMPAIGN)) { if (m.chapter >= 6) break; p.completed.push(m.id); }
  Object.assign(p.flags, {
    arrived: true, dreamRevived: true, hoaNote: true, sawKho7: true, knowsBarge: true, sawDen: true, reportedToLuc: true, vanAlly: true, trainedByTu: true,
    boardCh4: true, dreamMatte: true, knowsQuangForced: true, knowsQuangDebt: true, tailedQuang: true, bugPlanted: true, sawMaiBag: true, knowsB2: true,
    sawSpa: true, filmedLuc: true, sawMoonlight: true, 'choice:keQuang': o.keQuang ?? 'ke',
  });
  p.evidence.push(...[...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS, ...ch3.BOARD_CARDS, ...ch4.BOARD_CARDS, ...ch5.BOARD_CARDS].map((c) => c.id), 'ev-anh-2014', 'ev-goi-nho');
  p.abilities.push('phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill', 'observe', 'lean', 'throw', 'takedown', 'drag', 'phoneSilent', 'luongTam', 'faceCover', 'clipCam');
  p.outfits.push('tin-shipper');
  Object.assign(p, { cash: 195, chapter: 5, lunar: { month: 8, day: 7 }, hintTokens: 3 });
  p.debt.paid = 1350;
  p.conscience.knockouts = 1;
  if (o.hurt) p.conscience.civiliansHurt = o.hurt;
  return p;
}
const START = endOfChapter5();
const before = new Map();

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapter 6 loads through the registry beside chapters 1–5 and lints clean against the real sites and the contract plus its needs', () => {
  assert.deepEqual([...catalog.missions.keys()].filter((id) => id.startsWith('c6-')), MISSIONS);
  for (const id of MISSIONS) assert.equal(catalog.meta.get(id).chapter, 6);
  assert.deepEqual(R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: CONTRACT }), []);
  assert.equal(mission('c6-m1').chain, undefined);
  assert.equal(mission('c6-m2').chain, 'c6-m3', 'the night of the fire runs straight into the dawn on the pier');
  for (const id of MISSIONS) {
    const m = mission(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.5, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
    assert.equal(m.lethal, 'fail', `${id}: LƯƠNG TÂM, nobody dies`);
    assert.ok(m.steps.every((s) => s.minutes > 0));
  }
  assert.equal(MISSIONS.reduce((t, id) => t + catalog.meta.get(id).minutes, 0), 20, 'chapter 6 is 20 of the 235 planned minutes');
  assert.deepEqual(MISSIONS.map((id) => catalog.meta.get(id).giver), ['van', 'tu', 'coba']);
  assert.deepEqual(MISSIONS.map((id) => mission(id).start.lunar), [8, 8, 9], 'mùng 8 to mùng 9 (story-final.md ch.6)');
});

test('ENGINE_NEEDS: every id the chapter adds to the contract is used by it, has a lane, and is exactly what the contract lacks', () => {
  const used = new Set();
  const add = (k, id) => used.add(`${k}:${id}`);
  for (const m of ch6.chapter.missions) if (m.start?.outfit) add('outfits', m.start.outfit);
  for (const m of ch6.chapter.missions) for (const [a] of actsOf(m)) {
    if (a.k === 'do') add('ops', a.op);
    if (a.k === 'player') { if (a.outfit) add('outfits', a.outfit); if (a.carry) add('carry', a.carry); if (a.pose) add('poses', a.pose); }
    if (a.k === 'stealth' && a.arena) add('arenas', a.arena);
    if (a.k === 'unlock' && a.ability) add('abilities', a.ability);
    if (a.k === 'prop' && a.kind) add('props', a.kind);
    if (a.k === 'vehicle' && a.model) add('models', a.model);
    const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
    if (b?.k === 'act') add('acts', b.name);
    if (a.k === 'spawn' && a.template) add('templates', a.template);
  }
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) {
    if (k === 'rides') { add('models', id); add('rideModels', id); } else if (k === 'sceneProps') { add('sceneProps', id); add('props', id); } else add(k, id);
  }
  const LANES = new Set(['core', 'director', 'spaces', 'stealth', 'vehicles', 'police', 'world', 'ui', 'audio']);
  for (const [kind, ids] of Object.entries(ch6.ENGINE_NEEDS)) {
    assert.ok(kind in ENGINE_CONTRACT, `contract kind ${kind}`);
    for (const [id, [lane, what]] of Object.entries(ids)) {
      assert.ok(used.has(`${kind}:${id}`), `need ${kind} '${id}' is used by chapter 6`);
      assert.ok(LANES.has(lane) && what.length > 10, `need ${kind} '${id}' names its lane and what it does`);
      const landed = BEFORE[kind][id];
      if (landed) assert.equal(landed[0], lane, `${kind} '${id}' is already in the contract under the lane chapter 6 asks for`);
    }
  }
  // without the needs, the lint and the scene vocabulary name each of them (so the list is exactly what is missing)
  const plain = R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: BEFORE }).filter((s) => / is not in the engine contract/.test(s));
  assert.ok(plain.every((s) => /^c6-/.test(s)), `only chapter 6 needs anything new:\n${plain.filter((s) => !/^c6-/.test(s)).join('\n')}`);
  const missing = new Set(plain.map((s) => s.match(/: (\w+) '([^']+)' is not/).slice(1).join(':')));
  const kinds = { ...BEFORE, rides: { ...BEFORE.models, ...BEFORE.rideModels }, sceneProps: { ...BEFORE.props, ...BEFORE.sceneProps } };
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) if (!Object.prototype.hasOwnProperty.call(kinds[k] ?? {}, id)) missing.add(`${k === 'rides' ? 'models' : k}:${id}`);
  const needs = new Set(Object.entries(ch6.ENGINE_NEEDS).flatMap(([k, ids]) => Object.keys(ids).map((id) => `${k}:${id}`)));
  for (const k of missing) { const [kind, id] = k.split(':'); assert.ok(needs.has(k) || (kind === 'signals' && ch6.ENGINE_NEEDS.ops?.[id]) || (kind === 'sceneProps' && ch6.ENGINE_NEEDS.props?.[id]), `missing ${k} must be listed in ENGINE_NEEDS`); }
  for (const k of needs) { const [kind, id] = k.split(':'); assert.ok(missing.has(k) || (kind === 'props' && missing.has(`sceneProps:${id}`)) || BEFORE[kind][id], `need ${k} is really missing from the contract`); }
});

test('texts: every reference resolves, no inline strings, no orphan keys, no real brands, the ring only via {@ring}, lines fit', () => {
  const tables = [common.COMMON, ...T.map((t) => t.TEXT)];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'text keys are unique across chapters 1–6 and the common table');
  for (const k of Object.keys(t6.TEXT)) assert.match(k, /^(c6m[123]\.|cs0[56]\.|board\.ch6\.|cast\.|ev\.|j\.)/, `${k}: chapter 6 key namespace`);
  const used = new Set();
  for (const [, s] of deep([ch6.chapter, SCENES])) if (isRef(s)) { assert.ok(keys.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const v of Object.values(t6.TEXT)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) { assert.ok(keys.has(m[1]), `missing {@${m[1]}}`); used.add(m[1]); }
  assert.deepEqual(Object.keys(t6.TEXT).filter((k) => !used.has(k)), [], 'every chapter 6 text key is used');
  const inline = [];
  for (const m of ch6.chapter.missions) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...ch6.EVIDENCE, ...ch6.JOURNAL]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of ch6.CAST) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const q of ch6.QUESTIONS) for (const t of [q.prompt, q.hint, ...q.options.map((x) => x.text)]) if (!isRef(t)) inline.push(`question ${q.id}: ${t}`);
  for (const b of ch6.BOARDS) for (const t of [b.title, ...(b.hypotheses ?? []).flatMap((h) => [h.text, h.hint])]) if (!isRef(t)) inline.push(`board ${b.id}: ${t}`);
  for (const sc of SCENES) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  for (const m of ch6.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'do') for (const [k, s] of deep(a.args)) if (/[^\x20-\x7e]/.test(s) || (['title', 'label'].includes(k) && !isRef(s))) inline.push(`${at} ${a.op}.${k}: ${s}`);
  assert.deepEqual(inline, []);
  for (const k of Object.keys(t6.TEXT)) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/Sen Vàng|SEN VÀNG/.test(t6.TEXT[k]), `${k}: the ring is named through {@ring}/{@ringUpper}, never written out`);
    assert.ok(!/\b(Dream|Vios|GiaoNhanh|GN-\d|Phương Nam bank|NH Phương Nam)/.test(v), `${k}: working names of the bible stay out of the text`);
  }
  assert.match(tx('@ev.nguoiGiuSoChi.x'), /Tạ Quốc Bảo — NGÂN HÀNG KIM THÀNH/, 'the bank is the fictional {@bank}');
  assert.match(tx('@cs05.banner'), /^MÁI ẤM SEN VÀNG — /, 'the charity banner carries the ring through {@ringUpper}');
  const said = [];
  for (const m of ch6.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') said.push(...a.lines.map((l) => [m.id, l.text]));
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') said.push([sc.id, c.text]);
  for (const [at, ref] of said) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of ch6.chapter.missions) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long: ${tx(s.objective)}`);
    for (const s of m.steps) for (const x of s.subs ?? []) assert.ok(tx(x.text).length <= 60, `${m.id}/${s.id}: sub too long`);
    for (const [a, at] of actsOf(m)) {
      if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long: ${tx(a.text)}`);
      if (a.k === 'sms' || a.k === 'bark' || a.k === 'toast') assert.ok(tx(a.text).length <= 90, `${at}: ${a.k} too long`);
      if (a.k === 'choice') for (const op of a.options) assert.ok(tx(op.text).length <= 60, `${at}: choice option too long`);
    }
  }
  // distinct voices: Phượng and the abbot never say tao/mày; Ông Tư, Quang and Cường speak tao/mày, Vân chị/em
  const voice = new Map();
  for (const m of ch6.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') for (const l of a.lines) voice.set(l.text, l.who);
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') voice.set(c.text, sc.cast[c.who]);
  for (const [ref, who] of voice) {
    const v = tx(ref);
    if (who === 'phuong' || who === 'thay-minh-tinh') assert.ok(!/(^|\s)(tao|mày)(\s|[.,!?]|$)/iu.test(v), `${ref}: ${who} never says tao/mày`);
    if (who === 'van') assert.ok(!/(^|\s)(tao|mày)(\s|[.,!?]|$)/iu.test(v), `${ref}: Vân says chị/em`);
  }
  assert.ok([...voice].filter(([, who]) => who === 'tu').some(([ref]) => /(^|\s)(tao|mày)(\s|[.,!?]|$)/iu.test(tx(ref))), 'Ông Tư speaks tao/mày');
});

test('places: every place is a site, a chapter place or a declared space anchor; each mission uses its decided sites; all P0', () => {
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
    for (const s of m.steps) {
      for (const x of [s.marker].flat().filter(Boolean)) check(id, x.at, `${id}/${s.id}`);
      for (const x of s.interact ?? []) { check(id, x.at, `${id}/${s.id}`); check(id, x.to, `${id}/${s.id}`); }
    }
    for (const [a, at] of actsOf(m)) {
      for (const k of ['at', 'leave']) if (typeof a[k] === 'string') check(id, a[k], at);
      if (a.k === 'interactable' && a.to) check(id, a.to, at);
      if (a.k === 'vehicle' && a.route) check(id, a.route, at);
      if (a.k === 'photoTarget' && typeof a.subject === 'string' && (a.subject.includes('.') || a.subject.includes('/') || PLACES[a.subject])) check(id, a.subject, at);
      if (a.k === 'eavesdrop' && typeof a.source !== 'string') check(id, a.source, at);
      if (a.k === 'do') for (const [k, s] of deep(a.args)) if (['at', 'focus'].includes(k)) check(id, s, `${at} ${a.op}`);
      if (a.k === 'space' && a.enter) { refs.get(id).add(`${a.enter}/`); if (a.link) { assert.ok(ANCHORS[a.enter]?.[a.link], `${at}: entry link ${a.link} is an anchor of ${a.enter}`); refs.get(id).add(`${a.enter}/${a.link}`); } }
      if (a.k === 'space' && a.variant) assert.ok(S.SPACES[a.variant.id] && ['burning', 'burnt'].includes(a.variant.v), `${at}: space variant ${a.variant.id}/${a.variant.v} (spaces spec §11: burning, burnt)`);
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
  // the pagoda hosts ceremony and mourning only (decision 22): no stealth arena, no hostile, no takedown near it
  for (const id of ['c6-m1', 'c6-m3']) for (const [a, at] of actsOf(mission(id))) {
    assert.notEqual(a.k === 'spawn' && a.team, 'hostile', `${at}: no hostile at the pagoda`);
    assert.ok(!(a.k === 'stealth' && a.arena), `${at}: no stealth arena at the pagoda`);
  }
  // every anchor chapter 6 declares is used by its scripts or its cutscenes
  const all = new Set([...refs.values()].flatMap((s) => [...s]));
  for (const sc of SCENES) for (const [, s] of deep(sc)) { const m = s.match(/^set:([\w-]+)\.(\w+)$/); if (m) all.add(`${m[1]}/${m[2]}`); }
  for (const [space, anchors] of Object.entries(ch6.ANCHORS)) for (const a of Object.keys(anchors)) assert.ok(all.has(`${space}/${a}`), `anchor ${space}/${a} is used`);
  for (const k of Object.keys(ch6.ANCHORS['xe-may-shop'])) assert.ok(!(k in ch3.ANCHORS['xe-may-shop']), `anchor xe-may-shop/${k} does not redefine chapter 3's`);
});

test('chapter places stand on today\'s map: bikes clear on the sidewalk or in the alley, the pier spots on the pier, the yard spots clear', () => {
  const P = ch6.PLACES;
  const asphalt = (x, z) => TERRAIN.strips.some((s) => {
    const along = s.alongX ? x : z, v = s.alongX ? z : x;
    if ((s.lo !== -Infinity && along <= s.lo) || (s.hi !== Infinity && along >= s.hi)) return false;
    return Math.abs(v - s.at) < s.half && city.inRect(city.LAND, x, z, -0.5);
  });
  for (const [k, p] of Object.entries(P)) {
    assert.ok(k.startsWith('ch6.') && !SITE_PLACES[k], `${k}: chapter places are 'ch6.*' and never shadow a site`);
    assert.ok(city.pointClear(p.x, p.z, p.r ?? 0.45), `${k} is clear at r ${p.r}`);
    assert.ok(!asphalt(p.x, p.z), `${k} is off the carriageway`);
    const onPier = !!TERRAIN.dockAt(p.x, p.z);
    assert.ok(TERRAIN.walkable(p.x, p.z) || onPier, `${k} is walkable ground or the pier deck`);
    for (const [s, sp] of Object.entries(SITE_PLACES)) assert.ok(Math.hypot(sp.x - p.x, sp.z - p.z) >= 1, `${k} is clear of ${s}`);
  }
  for (const k of ['ch6.dream-chua', 'ch6.dream-hem', 'ch6.dream-q1', 'ch6.dream-ben']) assert.equal(P[k].r, 1, `${k} is a bike spot (r 1)`);
  assert.ok(TERRAIN.dockAt(P['ch6.ben-dau'].x, P['ch6.ben-dau'].z), 'Quang starts on the pier of BẾN AN HÒA');
  const yard = S.SITES['chua-an-hoa'].area, inYard = (p) => p.x >= yard[0] && p.x <= yard[1] && p.z >= yard[2] && p.z <= yard[3];
  assert.ok(inYard(P['ch6.lu-huong']) && inYard(P['ch6.thay']), 'the incense urn spots are in the pagoda yard');
  const alley = S.SITES['xe-may-alley'].area;
  assert.ok(P['ch6.dream-hem'].x > alley[0] && P['ch6.dream-hem'].x < alley[1] && P['ch6.dream-hem'].z > alley[2] && P['ch6.dream-hem'].z < alley[3], 'the Dream waits in the alley behind the shop');
  assert.ok(Math.hypot(P['ch6.dream-q1'].x - PLACES['thap-phuong-nam'].x, P['ch6.dream-q1'].z - PLACES['thap-phuong-nam'].z) < 10, 'parked by THÁP PHƯƠNG NAM');
  for (const [k, p] of Object.entries(P)) assert.equal(DIST.districtAt(p.x, p.z)?.district.id ?? (TERRAIN.dockAt(p.x, p.z) ? 'D1' : null), k === 'ch6.dream-q1' ? 'D2' : 'D1', `${k} is in its P0 district`);
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle', 'swing-wrench', 'hit']);
test('cutscenes: durations add up, marks, cast, sets and lines resolve, nobody is struck on screen, every scene is played by its mission', () => {
  const played = new Map();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) if (a.k === 'cutscene') played.set(a.id, [...(played.get(a.id) ?? []), id]);
  assert.equal(SCENE.size, SCENES.length, 'scene ids are unique');
  assert.deepEqual([...played.keys()].sort(), [...SCENE.keys()].sort(), 'every scene the missions play exists, and every scene is played');
  for (const sc of SCENES) {
    assert.deepEqual([...new Set(played.get(sc.id))], [sc.mission], `${sc.id} is played by ${sc.mission} only`);
    const total = sc.shots.reduce((t, s) => t + s.dur, 0);
    assert.ok(Math.abs(total - sc.seconds) < 1e-9, `${sc.id}: shots add to ${total}, not ${sc.seconds}`);
    assert.ok(sc.seconds <= (sc.id.startsWith('cs0') ? 45 : 44), `${sc.id}: a short in-engine scene (the bible's 45 s for CS05)`);
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
        if (c.at !== undefined && c.at !== null) mark(c.at, `${where} ${c.k}`);
        if (c.k === 'walk' || c.k === 'ride') c.path.forEach((m) => mark(m, `${where} ${c.k}`));
        if (c.k === 'prop' && c.attach) mark(c.attach, `${where} prop`);
        if (c.if) assert.doesNotThrow(() => setup().r.test(c.if));
      }
    });
  }
  // the numbered cutscenes stage the sites and sets story-decisions.md §3 gives them (CS06 in three parts, like CS04)
  for (const [id, cs] of Object.entries(S.CUTSCENE_SITES)) if (cs.mission.startsWith('c6-')) {
    const parts = SCENES.filter((s) => s.id === id || s.id.startsWith(`${id}_`)), all = parts.flatMap((p) => [...deep(p)].map(([, s]) => s));
    assert.ok(parts.length, `${id} is scripted`);
    assert.ok(parts.every((p) => p.mission === cs.mission), `${id} plays in ${cs.mission}`);
    for (const site of cs.sites) assert.ok(all.some((s) => s === site || s.startsWith(`${site}.`)), `${id} is staged at ${site}`);
    for (const space of cs.spaces ?? []) assert.ok(parts.some((p) => (p.sets ?? []).includes(space)), `${id} uses set ${space}`);
  }
  assert.equal(SCENE.get('cs06_lua_tiem_xe').seconds + SCENE.get('cs06_lua_tiem_xe_mai').seconds + SCENE.get('cs06_lua_tiem_xe_coi').seconds, 65, 'CS06 is the bible\'s 63 s, give or take');
  // the bible's beats, as data: the collar, the incense with the abbot, the whistle and the plate, the wreath
  const cues = (id) => SCENE.get(id).shots.flatMap((sh) => sh.cues ?? []);
  assert.ok(cues('cs05_sen_bi_hai').some((c) => c.k === 'pair' && c.clip === 'fix-collar'), 'Phượng straightens his collar');
  assert.ok(cues('cs05_sen_bi_hai').some((c) => c.k === 'say' && c.text === '@cs05.thay1'), 'the abbot: "Lòng người thì chỉ có người biết."');
  assert.ok(cues('cs06_lua_tiem_xe_coi').some((c) => c.k === 'pair' && c.clip === 'hang-whistle'), 'the whistle changes necks');
  assert.ok(cues('cs06_lua_tiem_xe_coi').some((c) => c.k === 'say' && c.text === '@cs06.tu7'), 'the plate question, one last time');
  assert.ok(cues('c6m3-dam-tang').some((c) => c.k === 'prop' && c.kind === 'wreath'), 'the white wreath at the gate');
  // Ông Tư's two blows are only heard, then seen done; Cường's blow is cut away from (the last shot of part 2 is an insert on Tín)
  const mai = SCENE.get('cs06_lua_tiem_xe_mai');
  assert.ok(mai.shots[0].cues.some((c) => c.k === 'fx' && c.kind === 'smoke' && c.t !== undefined && c.t < mai.shots[0].cues.find((x) => x.k === 'sfx' && x.id === 'metal-clang').t), 'the smoke covers the blows before they ring out');
  assert.equal(mai.shots.at(-1).cam.k, 'insert');
  assert.equal(mai.shots.at(-1).cam.target, 'tin.handR', 'cut away to the roof tiles before Cường\'s blow');
  assert.ok(SCENE.get('cs06_lua_tiem_xe_coi').shots.flatMap((sh) => sh.cues ?? []).some((c) => c.k === 'say' && c.if?.k === 'conscience'), 'the LƯƠNG TÂM record changes his last word on the rule');
  // the handoffs: back on the loft ladder in the shop, on the PHỞ roof, crouched by the Cub with the whistle on
  assert.deepEqual([SCENE.get('cs06_lua_tiem_xe').handoff.player.at, SCENE.get('cs06_lua_tiem_xe').handoff.player.space], ['set:xe-may-shop.loft', 'xe-may-shop']);
  assert.equal(mai.handoff.player.at, 'xe-may-roofs.pho');
  assert.deepEqual([SCENE.get('cs06_lua_tiem_xe_coi').handoff.player.outfit, SCENE.get('cs06_lua_tiem_xe_coi').handoff.player.crouch], ['tin-whistle', true]);
});

const subDur = (text) => Math.min(7.5, Math.max(1.8, 1.4 + 0.065 * [...text].length));
test('cutscene subtitles are readable: at most 17 characters a second, two lines on screen, none runs past the scene', () => {
  const issues = [];
  for (const sc of SCENES) {
    let t0 = 0;
    const ls = [];
    for (const [i, sh] of sc.shots.entries()) {
      for (const c of sh.cues ?? []) if (c.k === 'say') { const text = tx(c.text), s = t0 + (c.t ?? 0); ls.push({ s, e: s + (c.dur ?? subDur(text)), text, alt: !!c.if, shot: sh.label ?? `shot ${i + 1}` }); }
      t0 += sh.dur;
    }
    ls.sort((a, b) => a.s - b.s);
    for (const l of ls) {
      const next = ls.find((o) => o.s > l.s + 1e-9);
      const shown = (next ? Math.min(next.s, t0) : Math.min(l.e, t0)) - l.s, cps = [...l.text].length / Math.max(0.01, shown);
      if (next && cps > 17) issues.push(`${sc.id} [${l.shot}]: ${cps.toFixed(1)} cps (${shown.toFixed(1)} s for "${l.text}")`);
      if (l.e > t0 + 0.5) issues.push(`${sc.id} [${l.shot}]: "${l.text}" runs ${(l.e - t0).toFixed(1)} s past the scene`);
      const live = ls.filter((o) => o.s <= l.s + 1e-9 && o.e > l.s && !(o !== l && o.alt && l.alt && Math.abs(o.s - l.s) < 1e-9));
      if (live.length > 2) issues.push(`${sc.id} [${l.shot}]: ${live.length} lines on screen at ${l.s.toFixed(1)} s`);
    }
  }
  assert.deepEqual(issues, []);
});

test('cutscenes name only contract ids (plus the chapter\'s needs); slow motion only when frozen; two-actor shots have two actors', async () => {
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

test('every flag and mission variable a chapter 6 condition reads is written by chapters 1–6 (or is a choice result)', () => {
  const written = new Set(), read = [];
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  for (const m of MODULES.flatMap((x) => x.missions)) { for (const [a] of actsOf(m)) note(a); for (const a of m.rewards ?? []) note(a); }
  for (const q of catalog.questions.values()) for (const a of q.onCorrect ?? []) note(a);
  for (const b of catalog.boards.values()) for (const a of b.reveals ?? []) note(a);
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
  for (const [n, at] of read) assert.ok(written.has(n), `${at}: reads flag ${n} that nothing sets`);
  // items: what is taken was given before
  const given = new Set(ch6.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a).filter((a) => a.k === 'give').map((a) => a.item)));
  for (const m of ch6.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'take') assert.ok(given.has(a.item), `${at}: takes ${a.item}`);
  // the end-of-chapter-5 progress the playthroughs start from is what chapters 1–5 really grant
  for (const e of START.evidence) assert.ok(catalog.evidence.has(e) && GRANTED_1_5.has(e), `${e}: granted in play by chapters 1–5`);
  for (const f of Object.keys(START.flags)) assert.ok(written.has(f), `start flag ${f} is written by chapters 1–5`);
});

test('steps only wait for what the script offers: interactions, climbs, tails, eavesdrops, evidence sources, contract signals and meters', () => {
  const METERS = new Set(Object.keys(CONTRACT.meters));
  for (const id of MISSIONS) {
    const m = mission(id), acts = actsOf(m).map(([a]) => a);
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id)), climbs = new Set(specs.filter((x) => x.kind === 'climb').map((x) => x.id));
    assert.equal(offered.size, specs.length, `${id}: interaction ids are unique`);
    for (const x of specs) if (x.kind === 'climb') assert.ok(x.to && PLACES[x.to], `${id}: climb ${x.id} has a far end on the map`);
    const tails = new Set(acts.filter((a) => a.k === 'tail').map((a) => a.target)), ears = new Set(acts.filter((a) => a.k === 'eavesdrop').map((a) => a.id));
    const sources = new Set([...acts.filter((a) => a.k === 'evidence').map((a) => a.id), ...acts.filter((a) => (a.k === 'photoTarget' || a.k === 'clue') && a.evidence).map((a) => a.evidence)]);
    const timed = new Set(m.steps.filter((s) => s.timer).map((s) => s.id));
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id) && !climbs.has(c.id), `${at}: waits for interaction ${c.id}`);
      if (c.k === 'on' && c.ev === 'climb') assert.ok(climbs.has(c.id), `${at}: waits for climb ${c.id}`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(CONTRACT.signals[c.id] || CONTRACT.ops[c.id], `${at}: signal ${c.id}`);
      if (c.k === 'on' && c.ev === 'timer') assert.ok(timed.has(c.id), `${at}: waits for the timer of step ${c.id}`);
      if (c.k === 'on' && ['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(tails.has(c.id), `${at}: waits for tail ${c.id}`);
      if (c.k === 'on' && c.ev === 'eavesdrop') assert.ok(ears.has(c.id), `${at}: waits for eavesdrop ${c.id}`);
      if (c.k === 'evidence' && ch6.EVIDENCE.some((e) => e.id === c.id)) assert.ok(sources.has(c.id), `${at}: evidence ${c.id} has a source in ${id}`);
      if (c.k === 'meter') assert.ok(METERS.has(c.id) || /^(tail|eavesdrop):/.test(c.id), `${at}: meter ${c.id}`);
      assert.notEqual(c.k, 'q', `${at}: chapter 6 waits on no engine query`);
    }
    for (const a of acts) if (a.k === 'do') assert.ok(CONTRACT.ops[a.op], `${id}: op ${a.op}`);
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(METERS.has(x.id) || tails.has(x.id.slice(5)) || ears.has(x.id.slice(10)), `${id}/${s.id}: meter ${x.id} has a helper`);
  }
  // climb links are ClimbLinks of the spaces lane: ids unique across the campaign so far
  const allClimbs = MODULES.flatMap((m) => m.missions).flatMap((mi) => [...mi.steps.flatMap((s) => s.interact ?? []), ...actsOf(mi).map(([a]) => a).filter((a) => a.k === 'interactable')]).filter((x) => x.kind === 'climb').map((x) => x.id);
  const mine = ch6.chapter.missions.flatMap((mi) => [...mi.steps.flatMap((s) => s.interact ?? []), ...actsOf(mi).map(([a]) => a).filter((a) => a.k === 'interactable')]).filter((x) => x.kind === 'climb').map((x) => x.id);
  for (const id of mine) assert.equal(allClimbs.filter((x) => x === id).length, 1, `ClimbLink ${id} is used once in the campaign`);
  // the ops' arguments: the QTEs of escort-boss-qte.md §3.4, the rider map's blip and focus, the fire stages
  const qtes = ops('c6-m3', 'qte').map((a) => a.args);
  assert.deepEqual(qtes.map((q) => [q.id, q.keys.join(), q.onFail]), [['c6m3-tackle', 'E', 'continue'], ['c6m3-punch', 'F', 'continue']]);
  const map = ops('c6-m3', 'riderMap')[0].args;
  assert.ok(map.blips.some((b) => b.id === map.find) && PLACES[map.focus]);
  assert.deepEqual([...new Set(MISSIONS.flatMap((id) => ops(id, 'fire').map((a) => a.args.stage)))].sort(), [1, 2, 3]);
  assert.equal(ops('c6-m1', 'heli')[0].args.at, 'san-thuong-tai-chinh.pad', 'the helicopter parks on the flat roof pad (decision 11)');
});

test('case board: chapter 6 cards sit on free lotus slots 34–44, every card is evidence with a source, the strings tie back to chapters 2–5 and the board solves', () => {
  const all = [...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS, ...ch3.BOARD_CARDS, ...ch4.BOARD_CARDS, ...ch5.BOARD_CARDS, ...ch6.BOARD_CARDS], slots = all.map((c) => c.slot);
  assert.equal(new Set(slots).size, slots.length, `one card per lotus slot across chapters 1–6 (${slots.join(',')})`);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, 'no card twice');
  assert.deepEqual(ch6.BOARD_CARDS.map((c) => c.slot), [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44]);
  for (const c of ch6.BOARD_CARDS) assert.equal(ch6.EVIDENCE.find((e) => e.id === c.id)?.chapter, 6, `${c.id} is a chapter 6 card`);
  const optional = new Set(['ev-bang-ron', 'ev-xe-ran-den', 'ev-so-tay-hai']);
  for (const c of ch6.BOARD_CARDS) assert.ok(!optional.has(c.id), `${c.id}: optional finds stay off the board`);
  const board = catalog.boards.get('bang-hop-sat');
  assert.deepEqual(D.lintBoard(board, new Set(catalog.evidence.keys())), []);
  const ids = board.cards.map((c) => c.id);
  assert.deepEqual([...new Set(board.links.flat())].sort(), [...ids].sort(), 'the board shows exactly the cards its strings touch');
  for (const c of board.cards) assert.equal(c.slot, all.find((x) => x.id === c.id).slot, `${c.id} keeps its lotus slot`);
  const seen = new Set([ids[0]]), todo = [ids[0]];
  while (todo.length) { const a = todo.pop(); for (const [x, y] of board.links) for (const [p, q] of [[x, y], [y, x]]) if (p === a && !seen.has(q)) { seen.add(q); todo.push(q); } }
  assert.equal(seen.size, ids.length, 'every card is on a string');
  for (const n of [2, 3, 4, 5]) assert.ok(board.links.some(([a, b]) => [a, b].some((x) => MODULES[n - 1].evidence.some((e) => e.id === x))), `a string reaches back to chapter ${n}`);
  const p = endOfChapter5();
  for (const e of ch6.EVIDENCE) if (!optional.has(e.id)) p.evidence.push(e.id);
  let solved = false;
  for (const [a, b] of board.links) solved = D.linkCards(board, p, a, b, (id) => p.evidence.includes(id)).solved || solved;
  assert.equal(solved, false, 'the hypothesis is part of the board');
  assert.equal(D.propose(board, p, 'phuong-cam-dau', ['ev-phuong-chua', 'ev-chi-phuong'], (id) => p.evidence.includes(id)).result, 'wrong', 'two of the three cards are not enough');
  assert.equal(D.propose(board, p, 'phuong-cam-dau', ['ev-phuong-chua', 'ev-chi-phuong', 'ev-anh-ba-lua'], (id) => p.evidence.includes(id)).solved, true);
  // every chapter 6 evidence can be found in play
  const sources = new Set();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) { if (a.k === 'evidence') sources.add(a.id); if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence); }
  assert.deepEqual(ch6.EVIDENCE.map((e) => e.id).filter((e) => !sources.has(e)), []);
});

test('hand-offs: what chapter 6 takes from chapters 3–5 and what chapters 7–9 expect from it, when they load', async () => {
  // from chapter 5: Vân set the meeting at the pagoda's rice donation; Lực named "vụ thằng Hải"; Quang owes 300 million
  assert.match(T[4].TEXT['c5m3.v5'], /chùa An Hòa phát gạo/);
  assert.equal(mission('c6-m1').start.at.split('.')[0], 'chua-an-hoa');
  assert.ok(catalog.cast.has('bin') && catalog.cast.has('van'), 'Bin (ch.3) mourns at the funeral, Vân (ch.3) carries the case');
  const ids = new Set(ch6.CAST.map((c) => c.id));
  for (const id of ['phuong', 'thay-minh-tinh']) assert.ok(ids.has(id), `chapter 6 introduces ${id}`);
  const load = async (n) => {
    const url = new URL(`../app/game/story/content/ch0${n}.ts`, import.meta.url);
    if (!existsSync(url)) return null;
    try { return await import(url.href); } catch { return null; }
  };
  const [c7, c8, c9] = await Promise.all([load(7), load(8), load(9)]);
  if (c7?.BOARD_CARDS) assert.ok(c7.BOARD_CARDS.every((c) => c.slot > 44), 'chapter 7 places its cards after slot 44');
  if (c8?.chapter) {
    const src = JSON.stringify(c8.chapter);
    for (const e of ['ev-ho-so-diem', 'ev-nguoi-giu-so-chi']) if (src.includes(e)) assert.ok(ch6.EVIDENCE.some((x) => x.id === e), `chapter 8 reads ${e}, which chapter 6 grants`);
    if (src.includes('"cast":"phuong"')) assert.ok(ids.has('phuong'));
  }
  if (c9?.UPSTREAM_FLAGS?.quangGesture) {
    const set = ch6.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a)).filter((a) => a.k === 'choice').flatMap((a) => a.options.map((o) => o.set?.quangGesture)).filter(Boolean);
    assert.deepEqual(set.sort(), ['bo', 'keo'], 'chapter 9 reads quangGesture as keo / bo');
  }
  if (c9?.chapter) for (const m of c9.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'spawn' && /thay/.test(a.cast ?? '')) assert.ok(ids.has(a.cast), `chapter 9's abbot ${a.cast} is chapter 6's`);
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

const snapshots = [];
const CHECKPOINTS = ['c6-m1/nghe-len', 'c6-m1/bam-xe', 'c6-m1/dai', 'c6-m2/hop-sat', 'c6-m2/day-hop', 'c6-m2/om-hop', 'c6-m2/giau-hop', 'c6-m2/hem-sau', 'c6-m2/khoi', 'c6-m2/sap', 'c6-m2/chay',
  'c6-m3/ra-ben', 'c6-m3/duoi', 'c6-m3/dam-tang'];

test('main path: one save plays c6-m1 → c6-m3 end to end on the mock host from the end of chapter 5', () => {
  const { r, w } = setup({ progress: START, onCheckpoint: (e, run) => snapshots.push({ id: run.state().mission, step: e.step, save: run.snapshot() }) });
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
    assert.ok(res.ticks < 20000);
    assert.equal(done.result.nonLethal, true);
  }
  const p = r.progress();
  for (const id of MISSIONS) assert.ok(p.completed.includes(id));
  assert.deepEqual(w.missing, [], 'every actor, vehicle and place a step uses exists');
  assert.deepEqual(r.state().issues, []);
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [6], 'the chapter card shows once');
  assert.deepEqual(p.lunar, { month: 8, day: 9 });
  assert.equal(p.cash, 195 - 50, 'the deck ticket costs 50.000đ');
  assert.deepEqual([p.items['hop-sat'], p.items.whistle], [1, 1], 'the iron box rides in the delivery box; the whistle hangs on his neck');
  for (const a of ['whistle', 'riderMap']) assert.ok(p.abilities.includes(a), a);
  for (const f of ['gaveClipToVan', 'metPhuong', 'tailedPhuong', 'toldQuangWhere', 'boxInTank', 'tuDied', 'hasIronBox', 'shopBurnt', 'confrontedQuang', 'buriedTu', 'openedIronBox', 'boardCh6', 'knowsPhuong', 'knowsBargeSpot', 'punchedQuang']) assert.equal(p.flags[f], true, f);
  assert.deepEqual([p.flags['choice:tinNhan'], p.flags['choice:quayLai'], p.flags['choice:quangBen'], p.flags.quangGesture], ['noi', 'quay-lai', 'bo-di', 'bo']);
  for (const e of ['ev-phuong-chua', 'ev-danh-thiep-phuong', 'ev-xe-phuong', 'ev-truc-thang', 'ev-tin-nhan-quang', 'ev-anh-ba-lua', 'ev-ban-do-sa-lan', 'ev-nguoi-giu-so-chi', 'ev-cong-an-toi-som', 'ev-quang-thu-nhan', 'ev-ho-so-diem']) assert.ok(p.evidence.includes(e), e);
  for (const e of ['ev-bang-ron', 'ev-xe-ran-den', 'ev-so-tay-hai']) assert.ok(!p.evidence.includes(e), `${e} is optional`);
  for (const j of ['j-phuong', 'j-tu-mat', 'j-coi', 'j-quang-ben', 'j-hop-sat', 'j-sa-lan-neo']) assert.ok(p.journal.includes(j), j);
  assert.deepEqual(p.deductions['sa-lan-neo'], { answer: 'giua-song', tries: 1 });
  assert.ok(p.board.solved.includes('bang-hop-sat'));
  assert.equal(p.conscience.knockouts, 3, 'the two at the back door, after chapter 5\'s one');
  assert.equal(F.conscienceTier(p.conscience), 'clean');
  for (const sc of SCENES) assert.ok(p.seen.includes(sc.id), `${sc.id} played`);
  assert.ok(w.log.some((l) => l.k === 'sms' && l.a.from === 'quang' && !l.a.burner), 'Quang texts the smartphone, not the burner');
  assert.deepEqual(lines(w, 'c6m2-do-du'), [tx('@c6m2.think.sms1'), tx('@c6m2.think.ke'), tx('@c6m2.think.sms2')], 'he told Vân about Quang in chapter 5, and remembers her warning');
  assert.ok(w.log.some((l) => l.k === 'police' && l.a.force === 2), 'two forced stars after the fire');
  assert.deepEqual(lines(w, 'c6m3-cu-chi'), [tx('@c6m3.bo1')], 'Bỏ đi: "Đừng quay đầu."');
  assert.deepEqual(snapshots.map((x) => `${x.id}/${x.step}`), CHECKPOINTS, 'every checkpoint of the main path saved');
  assert.ok(outs(w, 'checkpoint').every((e) => /^Đã lưu · /.test(e.label)));
});

test('resume from every checkpoint of the main path: the setups rebuild the world and the mission completes', () => {
  assert.equal(snapshots.length, CHECKPOINTS.length);
  for (const { id, step, save } of snapshots) {
    const { r, w } = setup();
    assert.equal(r.resume(save), true, `${id}/${step} resumes`);
    autopilot(r, w);
    assert.equal(completed(w).at(-1)?.id, id, `${id} completes from ${step}`);
    assert.deepEqual(w.missing, [], `${id}/${step}: nothing used before it is rebuilt`);
    assert.equal(w.resets[0], 'checkpoint');
    assert.deepEqual(outs(w, 'fail'), []);
  }
});

test('c6-m1: too close to Phượng replays the yard; the banner is the eye clue; a missed car photo leaves the plate in memory', () => {
  const close = play('c6-m1', {
    progress: before.get('c6-m1'), optional: ['bang-ron'],
    hold: {
      'nghe-len': ({ w, visit }) => { if (visit === 1) { Object.assign(w.actors.get('phuong'), { x: w.player.x, z: w.player.z, space: w.player.space }); return true; } return false; },
      'vao-ham': ({ r }) => !r.progress().evidence.includes('ev-xe-phuong'),
    },
  });
  assert.deepEqual(outs(close.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c6m1.fail.gan'), true]], 'one soft fail, no card');
  assert.equal(close.res.visits['nghe-len'], 2);
  assert.ok(close.w.log.some((l) => l.k === 'dialogue' && l.id === 'c6m1-nho'), 'Tín remembers the plate: 51A-868.68');
  assert.ok(close.p.evidence.includes('ev-xe-phuong') && close.p.evidence.includes('ev-bang-ron'));
  assert.equal(close.done.result.eye, true, 'Mắt cú with the banner');
  assert.ok(close.w.log.some((l) => l.k === 'player' && l.a.pose === 'kneel'), 'he kneels among the worshippers');
  assert.deepEqual(close.w.missing, []);
});

test('c6-m1: a lost tail can be skipped after three tries: the deck checkpoint keeps the plate', () => {
  let fails = 0;
  const lost = play('c6-m1', {
    progress: before.get('c6-m1'),
    hold: { 'bam-xe': ({ visit, push }) => { if (visit <= 3) { push({ type: 'lost', id: 'xe-phuong' }); return true; } return false; } },
    onFail: (v) => { fails++; assert.equal(v.failure.reason, tx('@c6m1.fail.mat')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.ok(lost.res.visits.dai && !lost.res.visits['vao-ham'], 'the skip lands on the deck');
  assert.ok(lost.p.evidence.includes('ev-xe-phuong') && lost.p.evidence.includes('ev-truc-thang'));
  assert.deepEqual([lost.done.stats.skipped, lost.done.result.grade], [1, 'C']);
  assert.deepEqual(lost.w.missing, []);
});

test('c6-m2: the text answered after "Giấu chuyện Quang"; the roof skipped to the roof gap; the collapse skipped with the box saved; the Rắn Đen plates', () => {
  const giau = endOfChapter5({ keQuang: 'giau' });
  const { r, w } = setup({ progress: giau });
  r.start('c6-m1'); autopilot(r, w);
  const atM2 = F.cloneProgress(r.progress());
  const roof = play('c6-m2', {
    progress: atM2, choose: { tinNhan: 'gi' }, optional: ['xe-ran-den'],
    hold: { 'gian-tre': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'gac-lua-1' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c6m2.fail.lo')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.deepEqual(lines(roof.w, 'c6m2-do-du'), [tx('@c6m2.think.sms1'), tx('@c6m2.think.giau'), tx('@c6m2.think.sms2')]);
  assert.equal(roof.p.flags['choice:tinNhan'], 'gi');
  assert.ok(roof.w.log.some((l) => l.k === 'cutscene' && l.id === 'cs06_lua_tiem_xe_mai' && l.step === 'khe-mai') && roof.p.flags['choice:quayLai'] === 'quay-lai', 'the skip lands on the roof-gap scene, never past it');
  assert.ok(roof.res.visits['giau-hop'] && !roof.w.log.some((l) => l.k === 'interactable' && l.id === 'keo-hop'), 'then on the PHỞ roof with the box, the scaffold never climbed');
  assert.ok(!roof.p.evidence.includes('ev-xe-ran-den'), 'the plates belong to the roof that was skipped');
  assert.equal(roof.done.result.ghost, false);
  const plates = play('c6-m2', { progress: atM2, optional: ['xe-ran-den'] });
  assert.ok(plates.p.evidence.includes('ev-xe-ran-den'));
  assert.equal(plates.done.result.eye, true);
  assert.equal(plates.done.result.ghost, true, 'Bóng ma with no detection');
  // the shop collapses three times: the skip goes to the officers with the box in his arms, and it is stowed
  let fails = 0;
  const sap = play('c6-m2', {
    progress: atM2,
    hold: { sap: ({ visit, t }) => visit <= 3 && t < 31 },
    onFail: (v) => { fails++; assert.equal(v.failure.reason, tx('@c6m2.fail.sap')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.ok(sap.res.visits.chay && !sap.res.visits['lay-hop'], 'the skip lands on the officers\' checkpoint');
  assert.ok(sap.w.log.some((l) => l.step === 'chay' && l.k === 'player' && l.a.carry === 'hop-sat'), 'the box is in his arms all the same');
  assert.deepEqual([sap.p.items['hop-sat'], sap.p.flags.hasIronBox, sap.p.flags.tuDied], [1, true, true]);
  for (const run of [roof, plates, sap]) { assert.deepEqual(run.w.missing, []); assert.equal(F.conscienceTier(run.p.conscience), 'clean'); }
});

test('c6-m2: Ông Tư\'s last word on the rule follows the LƯƠNG TÂM record (clean, or innocents hurt on the way)', () => {
  const coi = SCENE.get('cs06_lua_tiem_xe_coi').shots.flatMap((sh) => sh.cues ?? []).filter((c) => c.k === 'say' && c.if);
  const shown = (progress) => { const { r } = setup({ progress }); return coi.filter((c) => r.test(c.if)).map((c) => c.text); };
  assert.deepEqual(shown(START), ['@cs06.tu6a']);
  assert.deepEqual(shown(endOfChapter5({ hurt: 2 })), ['@cs06.tu6b']);
});

test('c6-m3: the punch held back or thrown, either gesture, Quang reaching the boat, the race skipped, a wrong answer, Hải\'s notebook', () => {
  const held = play('c6-m3', { progress: before.get('c6-m3'), qte: { 'c6m3-punch': 'miss' }, choose: { quangBen: 'keo-day' }, optional: ['so-tay'], wrong: { 'sa-lan-neo': 'kho-7' } });
  assert.equal(held.p.flags.punchedQuang, false);
  assert.equal(held.p.flags.quangGesture, 'keo');
  assert.deepEqual(lines(held.w, 'c6m3-cu-chi'), [tx('@c6m3.keo1'), tx('@c6m3.keo2'), tx('@c6m3.keo3')]);
  assert.deepEqual(held.p.deductions['sa-lan-neo'], { answer: 'giua-song', tries: 2 });
  assert.ok(held.p.evidence.includes('ev-so-tay-hai') && held.done.result.eye);
  assert.ok(held.w.log.some((l) => l.k === 'dialogue' && l.id === 'c6m3-hai'));
  // the scene's first line follows the punch
  const first = SCENE.get('c6m3-ben-song').shots[0].cues.filter((c) => c.k === 'say');
  for (const [run, want] of [[held, '@c6m3.cs.q0b']]) { const { r } = setup({ progress: run.p }); assert.deepEqual(first.filter((c) => r.test(c.if)).map((c) => c.text), [want]); }
  // he runs for the boat and gets there once: the beat replays with no card
  const boat = play('c6-m3', {
    progress: before.get('c6-m3'),
    hold: { duoi: ({ w, visit }) => { if (visit === 1) { Object.assign(w.actors.get('quang'), { ...PLACES['ben-an-hoa.rental'], space: null }); return true; } return false; } },
  });
  assert.deepEqual(outs(boat.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c6m3.fail.cano'), true]]);
  assert.equal(boat.res.visits.duoi, 2);
  assert.ok(boat.w.log.filter((l) => l.k === 'spawn' && l.id === 'quang').length >= 2, 'the replay puts Quang back at the pier head');
  // the race to the pier, lost three times, is skipped to the pier head
  let fails = 0;
  const late = play('c6-m3', {
    progress: before.get('c6-m3'),
    hold: { 'ra-ben': ({ visit }) => visit <= 3 },
    onFail: (v) => { fails++; assert.equal(v.failure.reason, tx('@c6m3.fail.tre')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.ok(late.res.visits.duoi);
  for (const run of [held, boat, late]) { assert.deepEqual(run.w.missing, []); assert.equal(F.conscienceTier(run.p.conscience), 'clean'); assert.ok(run.p.seen.includes('c6m3-dam-tang')); }
});

test('LƯƠNG TÂM in chapter 6: a chokehold "kill" is a knockout; a real death fails each mission', () => {
  for (const id of MISSIONS) {
    const { r } = setup({ progress: before.get(id) });
    r.start(id);
    for (let i = 0; i < 3; i++) r.tick(0.1);
    r.event({ type: 'kill', id: 'gac', tag: 'guard', cause: 'choke' });
    r.tick(0.1);
    assert.notEqual(r.view().phase, 'failed', `${id}: a choke never kills`);
    r.event({ type: 'kill', id: 'gac-2', tag: 'guard', cause: 'fire' });
    r.tick(0.1);
    assert.equal(r.view().failure?.reason, R.LETHAL_REASON, `${id}: Tín không giết ai`);
  }
});

test('replays: every chapter 6 mission replays in a sandbox from its chapter start and its replay block', () => {
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
