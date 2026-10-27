// node --experimental-transform-types --test scripts/story-ch08.test.mjs
// Story content, chapter 8 (SEN TRONG BÙN · NGƯỜI ĐÀN BÀ TỪ THIỆN): c8-m1 Diễm tailed to PHÚ MỸ, the interrogation, the
// fire stairs and the supported walk; c8-m2 the impostor orderlies on the ward and the tackle; c8-m3 the gala, the catwalk,
// CS08 in three parts around the envelope; c8-m4 the bank floor 20, the safe, under the desk, the gondola and the TV.
// The chapter loads through the registry beside chapters 1–5 and lints clean against the real sites and the engine contract
// (plus SCENE_REQUESTS and the requests of chapters 4–5) and exactly the ids it asks for (content/ch08.ts ENGINE_NEEDS); every
// text reference resolves (no inline strings, no orphan keys, no real brands, the ring only through {@ring}, the bank only
// through {@bank}, subtitles fit and read at ≤ 17 characters a second); every place is a site, a chapter place checked on today's
// map, or a declared space anchor, and each mission uses the sites story-decisions.md gave it; the cutscenes are consistent and
// name only contract ids; the interrogation settles with cards earlier chapters give; the safe code is the one the clues show;
// the case-board cards connect to chapters 3–5 and solve; the steps only wait for what the script offers.
// A mock host and an autopilot (each step's own conditions satisfied in turn) play c8-m1 → c8-m4 from an end-of-chapter-7
// progress, resume from every checkpoint, and play the alternatives: wrong cards and an accused truth, the 2014 file missing,
// a wrong room number, a lost tail skipped, a kill on the stairs (booked, not failed) and the clean stairs, the panic that sends
// the third man early, a real orderly knocked down, a missed tackle, a shot in the hospital, a wrong deduction, the three
// answers to Phượng, a blown waiter cover and a run past the bodyguards, the catwalk skipped, the safe closed and reopened, the
// blackout run out, the cameras skipped, the gondola lit, LƯƠNG TÂM and the replays.
// Chapters 6 and 7 are written beside this one: until they load, stand-ins provide exactly the ids chapter 8 uses from them
// (cast 'phuong', 'loc'; evidence 'ev-ho-so-diem'), and a test checks the real chapters agree once they do.
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
const I = await import('../app/game/story/interrogation.ts');
const SCENE_SCHEMA = await import('../app/game/story/scene.ts');
const ch1 = await import('../app/game/story/content/ch01.ts');
const ch2 = await import('../app/game/story/content/ch02.ts');
const ch3 = await import('../app/game/story/content/ch03.ts');
const ch4 = await import('../app/game/story/content/ch04.ts');
const ch5 = await import('../app/game/story/content/ch05.ts');
const ch8 = await import('../app/game/story/content/ch08.ts');
const cs8 = await import('../app/game/story/cutscenes/ch08.ts');
const t8 = await import('../app/game/story/text/vi/ch08.ts');
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT, SCENE_REQUESTS, CAMPAIGN_CONTRACT } = await import('../app/game/story/contract.ts');
const city = await import('../app/game/city.ts');
const { TERRAIN } = await import('../app/game/map/terrain.ts');
const DIST = await import('../app/game/map/districts.ts');

/** Chapter 6 as chapter 8 uses it: Phượng (CS05) and Ông Tư's 2014 file on Diễm (c6-m3, the iron box). */
const CH6_STAND_IN = {
  chapter: 6, missions: [],
  cast: [{ id: 'phuong', name: '@cast.phuong', look: 'phuong', portrait: { bg: '#3f8f6b', initials: 'P' } }],
  evidence: [{ id: 'ev-ho-so-diem', kind: 'document', title: '@ev.hoSoDiem.t', text: '@ev.hoSoDiem.x', chapter: 6, tags: ['diem', '2014'] }],
  text: { 'cast.phuong': 'Bà Phượng', 'ev.hoSoDiem.t': 'Hồ sơ mất tích năm 2014', 'ev.hoSoDiem.x': 'Võ Ngọc Diễm, 17 tuổi, Tân Châu, mất tích.' },
};
/** Chapter 7 as chapter 8 uses it: Thiếu tá Lộc of the river police. */
const CH7_STAND_IN = {
  chapter: 7, missions: [],
  cast: [{ id: 'loc', name: '@cast.loc', look: 'loc', portrait: { bg: '#2f4a7a', initials: 'L' } }],
  text: { 'cast.loc': 'Thiếu tá Lộc' },
};
for (const n of [1, 2, 3, 4, 5]) C.registerChapter(n, () => import(`../app/game/story/content/ch0${n}.ts`));
C.registerChapter(8, () => import('../app/game/story/content/ch08.ts'));
const catalog = await C.loadCatalog([1, 2, 3, 4, 5, 8]);
R.addModule(catalog, CH6_STAND_IN);
R.addModule(catalog, CH7_STAND_IN);
const EARLIER = [ch1, ch2, ch3, ch4, ch5].map((m) => m.chapter);
const SCENES = cs8.CUTSCENES;
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = {};
for (const a of [ch1.ANCHORS, ch2.ANCHORS, ch3.ANCHORS, ch4.ANCHORS, ch5.ANCHORS, ch8.ANCHORS]) for (const [k, v] of Object.entries(a)) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const MISSIONS = ['c8-m1', 'c8-m2', 'c8-m3', 'c8-m4'];
const SPACE_IDS = Object.keys(S.SPACES);
/** What the contract holds before chapter 8: ENGINE_CONTRACT, SCENE_REQUESTS and the requests of chapters 4–5. */
const merge = (...tables) => Object.fromEntries(Object.keys(ENGINE_CONTRACT).map((k) => [k, Object.assign({}, ...tables.map((t) => t[k] ?? {}))]));
const BASE = merge(ENGINE_CONTRACT, SCENE_REQUESTS, ch4.CONTRACT_REQUESTS, ch5.ENGINE_NEEDS);
const CONTRACT = merge(BASE, ch8.ENGINE_NEEDS);
const tx = R.makeText(catalog, (n) => ({ cash: 2000, debtPaid: 1350, debtTotal: 40000, hintTokens: 2 })[n]);
/** Earlier chapters contribute only their catalog data to the lint (their scripts are their own tests'). */
const LINT_MODULES = [...EARLIER.map((m) => ({ ...m, missions: [] })), CH6_STAND_IN, CH7_STAND_IN, ch8.chapter];
const lintOf = (engine) => R.lintContent(C.CAMPAIGN, LINT_MODULES, { places: Object.keys(SITE_PLACES), engine }).filter((s) => !/^c[1-7]-m\d+: no mission script in chapter [1-7]$/.test(s));

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
const opArgs = (id, op) => actsOf(mission(id)).map(([a]) => a).find((a) => a.k === 'do' && a.op === op)?.args;

// ---- mock host (story-ch05.test.mjs, plus op helpers, op results and the interrogation) -----------------------------

const cmp = (a, op, b) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : op === '!=' ? a !== b : a === b);
const MODE = { foot: ['foot'], bike: ['bike'], car: ['car'], vehicle: ['bike', 'car', 'boat'], boat: ['boat'], swim: ['swim'] };
const STATE = { idle: 'idle', goto: 'goto', patrol: 'patrol', follow: 'follow', escort: 'escort', guard: 'idle', act: 'act', flee: 'flee', surrender: 'surrender', captive: 'captive' };
const BLOCKING = new Set(['cutscene', 'dialogue', 'call', 'title', 'fade', 'teleport', 'choice', 'space']);
/** What a blocking `do` op resolves with on the happy path (keypad: the right code; qte: hit). */
const RESULTS = { keypad: 'open', qte: 'ok' };

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
    runner: null, choose: structuredClone(o.choose ?? {}), results: structuredClone(o.results ?? {}), log: [], outs: [], resets: [], missing: [], ops: [], fails: 0,
    player: { x: 0, z: 0, mode: 'foot', space: null, level: null, crouched: false, hidden: false, speed: 0, carrying: null, cover: null, visibility: 1 },
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
          if (a.leave) { const p = a.leave === true ? null : resolve(a.leave); if (a.leave !== true && !p) miss(`space leave ${a.leave}`, ctx); Object.assign(w.player, { space: null, mode: 'foot' }, p ? { x: p.x, z: p.z } : {}); }
          break;
        case 'player': if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'time': w.hour = a.hour; break;
        // ops with an id are live helpers (the gondola pushes 'arrived' / 'spotted' with that id) until stopped
        case 'do': w.ops.push(a.op); if (a.args?.id && !a.wait) w.helpers.set(a.args.id, a); break;
      }
      const blocking = (BLOCKING.has(a.k) && a.mode !== 'ambient') || (a.k === 'do' && a.wait);
      if (!blocking) return false;
      let result;
      if (a.k === 'choice') { const pick = w.choose[a.id]; result = Array.isArray(pick) ? pick.shift() : pick; result ??= a.options[0]?.id; }
      if (a.k === 'do') { const r = w.results[a.op]; result = Array.isArray(r) ? r.shift() : r; result ??= RESULTS[a.op]; }
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
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 8 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot ----------------------------------------------------------------------------------------------------

function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), answered = new Set(), tried = new Set();
  const kf = (e) => `${key}|${e.type}|${e.id}|${e.evidence ?? ''}|${e.tag ?? ''}`;
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
        if (pushed.has(kf({ type: c.ev, id: c.id, tag: c.tag }))) return;
        if (c.ev === 'interact') {
          const it = r.view().interacts.find((x) => x.id === c.id);
          assert.ok(it, `${step}: interaction ${c.id} is offered`);
          moveTo(it.at, it.when, it.level);
        } else if (c.ev === 'climb') {
          const it = r.view().interacts.find((x) => x.id === c.id);
          assert.ok(it && it.kind === 'climb' && it.to, `${step}: climb ${c.id} is offered with a far end`);
          moveTo(it.at, it.when, it.level);
          moveTo(it.to, 'foot');
        } else if (c.ev === 'eavesdrop') assert.ok(w.helpers.has(c.id), `${step}: eavesdrop ${c.id} is running`);
        else if (['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(w.helpers.has(c.id), `${step}: helper ${c.id} is running`);
        else if (c.ev === 'signal') {
          // a blocking op the script runs from a watcher (the nurses' monitor): trigger that watcher; else the step's own act raises it
          const wt = (def.watchers ?? []).find((x) => x.do.some((a) => a.k === 'do' && a.op === c.id));
          if (wt) satisfy(wt.when, def);
          return;
        } else if (c.ev === 'choice' || c.ev === 'timer') return;
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
      const how = o.onFail?.(v, visits[step] ?? 0);
      if (!how) throw new Error(`${s.mission}/${v.step} failed: ${v.failure.reason}`);
      assert.ok(how === 'skip' ? r.skipSection() : r.retry(), `${how} after "${v.failure.reason}"`);
      continue;
    }
    const sess = s.session;
    if (sess?.kind === 'deduce') { const q = catalog.questions.get(sess.id), wrong = o.wrong?.[sess.id]; r.ui.answer(wrong && !answered.has(sess.id) ? wrong : q.answer); answered.add(sess.id); }
    else if (sess?.kind === 'board') for (const [a, b] of catalog.boards.get(sess.id).links) r.ui.link(a, b);
    else if (sess?.kind === 'interrogate') {
      const def = catalog.interrogations.get(sess.id), view = r.ui.view();
      if (view.silent > 0 || !view.statement) continue;
      const st = def.statements.find((x) => x.id === view.statement.id), bad = o.ivWrong?.[st.id];
      if (bad && !tried.has(st.id)) { tried.add(st.id); r.ui.present(bad.card, bad.approach ?? 'accuse'); continue; }
      const card = st.cards.find((x) => r.progress().evidence.includes(x));
      assert.ok(card, `${sess.id}/${st.id}: a card that settles it is owned`);
      r.ui.present(card, st.kind === 'lie' ? 'accuse' : 'empathy');
      continue;
    }
    if (v.phase !== 'run') continue;
    // a new step entry (a re-entry after a branch, a soft fail, a retry) always resets the step scope: count entries by those resets
    const gen = `${v.step}|${w.resets.length}`;
    if (gen !== lastVisit) { lastVisit = gen; step = v.step; visits[step] = (visits[step] ?? 0) + 1; key = `${step}#${visits[step]}#${w.resets.length}`; }
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
  throw new Error(`${r.state().mission} did not finish (stuck at ${r.view().step})`);
}
const outs = (w, type) => w.outs.filter((e) => e.type === type);
const completed = (w) => outs(w, 'complete');
function play(id, o = {}) {
  const { r, w } = setup(o);
  assert.equal(r.start(id, o.replay ? { replay: true } : undefined), true, `${id} starts`);
  const res = autopilot(r, w, o);
  return { r, w, res, done: completed(w).at(-1), p: r.progress() };
}
const lines = (w, id) => w.log.filter((l) => (l.k === 'dialogue' || l.k === 'call') && l.id === id).at(-1)?.a.lines.map((l) => l.text);

/** The progress at the end of chapter 7 as far as chapter 8 reads it (chapters 6–7 are written beside this one). */
function endOfChapter7() {
  const p = F.newProgress();
  for (const m of F.missionOrder(C.CAMPAIGN)) { if (m.chapter >= 8) break; p.completed.push(m.id); }
  Object.assign(p.flags, { arrived: true, dreamRevived: true, dreamMatte: true, sawKho7: true, knowsBarge: true, leadQuang: true, knowsB2: true, sawMaiBag: true, filmedLuc: true });
  p.evidence.push('ev-don-dem-quang', 'ev-giay-hoa', 'ev-bien-so', 'ev-the-sen-vang', 'ev-kho-7', 'ev-cuong-seo', 'ev-luc-hoi', 'ev-dong-ho-vang', 'ev-tu-ke',
    'ev-diem-goi', 'ev-so-trang-1', 'ev-so-trang-2', 'ev-so-trang-3', 'ev-so-mai', 'ev-xe-trang', 'ev-giay-no',
    'ev-quang-no', 'ev-so-do-b2', 'ev-cap-mai', 'ev-clip-luc', 'ev-luc-noi', 'ev-ho-so-diem');
  p.abilities.push('phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill', 'observe', 'lean', 'throw', 'takedown', 'drag', 'phoneSilent', 'luongTam', 'faceCover', 'clipCam', 'whistle');
  p.outfits.push('tin-shipper', 'tin-ao-tu');
  p.conscience.knockouts = 9;
  Object.assign(p, { cash: 300, chapter: 7, lunar: { month: 8, day: 10 } });
  p.debt.paid = 1350;
  return p;
}
const START = endOfChapter7();
const before = new Map();

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapter 8 loads through the registry beside chapters 1–5 and lints clean against the real sites and the contract plus its needs', () => {
  assert.deepEqual([...catalog.missions.keys()].filter((id) => id.startsWith('c8-')), MISSIONS);
  for (const id of MISSIONS) assert.equal(catalog.meta.get(id).chapter, 8);
  assert.deepEqual(lintOf(CONTRACT), []);
  assert.deepEqual(MISSIONS.map((id) => mission(id).chain ?? null), [null, null, 'c8-m4', null], 'the gala night runs straight into the 02:00 heist');
  for (const id of MISSIONS) {
    const m = mission(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.35, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
    assert.ok(m.steps.every((s) => s.minutes > 0));
  }
  // LƯƠNG TÂM: the stairwell firefight books a kill (the zero-kill path is the player's); everywhere else a death fails
  assert.deepEqual(MISSIONS.map((id) => mission(id).lethal), ['allow', 'fail', 'fail', 'fail']);
  assert.equal(MISSIONS.reduce((t, id) => t + catalog.meta.get(id).minutes, 0), 27, 'chapter 8 is 27 of the 235 planned minutes');
  assert.deepEqual(MISSIONS.map((id) => catalog.meta.get(id).giver), ['van', 'loc', 'diem', 'van']);
  assert.deepEqual(MISSIONS.map((id) => mission(id).start.lunar), [11, 12, 12, 12], 'mùng 11–12, "Còn 3 ngày tới Rằm" on the gala day');
  assert.equal(F.lunarLabel({ month: 8, day: 12 }).countdown, 'CÒN 3 NGÀY TỚI RẰM');
});

test('ENGINE_NEEDS: every id the chapter adds is used by it, has a lane, is not already in the contract, and lints only with it', () => {
  const used = new Set();
  for (const m of ch8.chapter.missions) {
    if (m.start?.outfit) used.add(`outfits:${m.start.outfit}`);
    for (const [a] of actsOf(m)) {
      if (a.k === 'do') used.add(`ops:${a.op}`);
      if (a.k === 'player') { if (a.outfit) used.add(`outfits:${a.outfit}`); if (a.carry) used.add(`carry:${a.carry}`); if (a.pose) used.add(`poses:${a.pose}`); }
      if (a.k === 'stealth' && a.arena) used.add(`arenas:${a.arena}`);
      if (a.k === 'vehicle' && a.model) used.add(`models:${a.model}`);
      const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
      if (b?.k === 'act') used.add(`acts:${b.name}`);
      if (a.k === 'spawn' && a.template) used.add(`templates:${a.template}`);
    }
    for (const [c] of condsOf(m)) if (c.k === 'meter') used.add(`meters:${c.id}`);
    for (const s of m.steps) for (const x of s.meters ?? []) used.add(`meters:${x.id}`);
  }
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) used.add(`${k === 'rides' ? 'rideModels' : k}:${id}`);
  const LANES = new Set(['core', 'director', 'spaces', 'stealth', 'vehicles', 'police', 'world', 'ui', 'audio']);
  for (const [kind, ids] of Object.entries(ch8.ENGINE_NEEDS)) {
    assert.ok(kind in ENGINE_CONTRACT, `contract kind ${kind}`);
    for (const [id, [lane, what]] of Object.entries(ids)) {
      assert.ok(used.has(`${kind}:${id}`), `need ${kind} '${id}' is used by chapter 8`);
      assert.ok(LANES.has(lane) && what.length > 10, `need ${kind} '${id}' names its lane and what it does`);
      // since the wave-2 integration the needs are in contract.ts: none was asked for by chapters 4–5, each landed with its lane
      assert.ok(![SCENE_REQUESTS, ch4.CONTRACT_REQUESTS, ch5.ENGINE_NEEDS].some((t) => Object.prototype.hasOwnProperty.call(t[kind] ?? {}, id)), `need ${kind} '${id}' is not an earlier chapter's request`);
      const landed = CAMPAIGN_CONTRACT[kind][id];
      assert.ok(landed, `${kind} '${id}' landed in contract.ts`);
      assert.equal(landed[0], lane, `${kind} '${id}' landed in contract.ts with the lane chapter 8 asked for`);
    }
  }
  // without the needs the lint names each of them (so the list is exactly what the contract still lacks)
  const missing = new Set(lintOf(BASE).filter((s) => / is not in the engine contract/.test(s)).map((s) => s.match(/: (\w+) '([^']+)' is not/).slice(1).join(':')));
  for (const k of missing) { const i = k.indexOf(':'), kind = k.slice(0, i), id = k.slice(i + 1); assert.ok(ch8.ENGINE_NEEDS[kind]?.[id] || (kind === 'signals' && ch8.ENGINE_NEEDS.ops?.[id]), `lint without needs: ${k} must be listed in ENGINE_NEEDS`); }
  // the op shapes the specs give: the tackle is the catalogue's 2 s press, the safe takes six digits, the gondola has a foot
  const qte = opArgs('c8-m2', 'qte'), keypad = opArgs('c8-m4', 'keypad'), gondola = opArgs('c8-m4', 'gondola'), monitor = actsOf(mission('c8-m2')).map(([a]) => a).find((a) => a.k === 'do' && a.op === 'monitor').args;
  assert.deepEqual([qte.id, qte.kind, qte.keys, qte.window, qte.onFail], ['c8m2-tackle', 'press', ['E'], 2, 'soft-fail']);
  assert.equal(keypad.digits, keypad.code.length);
  assert.ok(PLACES[gondola.at] && PLACES[gondola.foot] && PLACES[gondola.at].y > 60, 'the gondola rides from floor 20 to the sidewalk');
  assert.equal(monitor.feeds.length, 4, 'four cameras on the nurses\' station monitor');
});

test('texts: every reference resolves, no inline strings, no orphan keys, no real brands, the ring and the bank only via constants, lines fit', () => {
  const tables = [common.COMMON, ...EARLIER.map((m) => m.text), t8.TEXT];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'text keys are unique across chapters 1–5, 8 and the common table');
  for (const k of Object.keys(t8.TEXT)) assert.match(k, /^(c8m[1-4]\.|cs08b?\.|cast\.|ev\.|j\.)/, `${k}: chapter 8 key namespace`);
  for (const k of Object.keys(CH6_STAND_IN.text).concat(Object.keys(CH7_STAND_IN.text))) assert.ok(!(k in t8.TEXT), `${k} belongs to chapters 6–7`);
  const used = new Set();
  for (const [, s] of deep([ch8.chapter, SCENES])) if (isRef(s)) { assert.ok(catalog.text.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const v of Object.values(t8.TEXT)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) { assert.ok(keys.has(m[1]), `missing {@${m[1]}}`); used.add(m[1]); }
  assert.deepEqual(Object.keys(t8.TEXT).filter((k) => !used.has(k)), [], 'every chapter 8 text key is used');
  const inline = [];
  for (const m of ch8.chapter.missions) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...ch8.EVIDENCE, ...ch8.JOURNAL]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of ch8.CAST) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const q of ch8.QUESTIONS) for (const t of [q.prompt, q.hint, ...q.options.map((x) => x.text)]) if (!isRef(t)) inline.push(`question ${q.id}: ${t}`);
  for (const d of ch8.INTERROGATIONS) for (const [k, s] of deep(d)) if (['title', 'text', 'reply', 'wrong'].includes(k) && !isRef(s)) inline.push(`interrogation ${d.id}.${k}: ${s}`);
  for (const sc of SCENES) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  for (const m of ch8.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'do') for (const [k, v] of deep(a.args)) if (/[^\x20-\x7e]/.test(v)) inline.push(`${at} ${a.op}.${k}: ${v}`);
  assert.deepEqual(inline, []);
  for (const k of Object.keys(t8.TEXT)) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/Sen Vàng|SEN VÀNG/.test(t8.TEXT[k]), `${k}: the ring is named through {@ring}/{@ringUpper}, never written out`);
    assert.ok(!/KIM THÀNH|Kim Thành|Phương Nam/.test(t8.TEXT[k]), `${k}: the bank is named through {@bank}`);
    assert.ok(!/\b(Dream|Vios|GiaoNhanh|GN-\d|GiaoLẹ)/.test(v), `${k}: working names of the bible stay out of the text`);
  }
  assert.equal(tx('@c8m4.order'), 'DO-0512 · Hai tô phở tái', 'order codes come from {@code}');
  assert.match(tx('@cast.bao.role'), /NGÂN HÀNG KIM THÀNH$/);
  const said = [];
  for (const m of ch8.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') said.push(...a.lines.map((l) => [m.id, l.text]));
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') said.push([sc.id, c.text]);
  for (const d of ch8.INTERROGATIONS) for (const s of d.statements) for (const t of [s.text, s.reply, s.wrong, s.press?.text].filter(Boolean)) said.push([d.id, t]);
  for (const [at, ref] of said) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of ch8.chapter.missions) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long: ${tx(s.objective)}`);
    for (const s of m.steps) for (const x of s.subs ?? []) assert.ok(tx(x.text).length <= 60, `${m.id}/${s.id}: sub too long`);
    for (const [a, at] of actsOf(m)) {
      if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long: ${tx(a.text)}`);
      if (a.k === 'sms' || a.k === 'bark' || a.k === 'toast') assert.ok(tx(a.text).length <= 90, `${at}: ${a.k} too long`);
    }
  }
  // the bible's lines (story-final.md ch.8, CS08), as written there
  for (const [k, line] of [
    ['c8m1.iv.s1', 'Chị chỉ làm văn phòng, giới thiệu việc thôi.'], ['c8m1.iv.s3', 'Em không hiểu đâu, chị không có lựa chọn.'],
    ['c8m1.iv.s3.reply', 'Hồ sơ này... năm đó chị mười bảy tuổi. Không ai đi tìm chị hết, Tín à.'], ['c8m1.cs.lk5', 'Chị cũng từng là con Mai đó.'],
    ['c8m2.l2', 'Có mấy đứa mặc đồ hộ lý mà mang giày da.'], ['c8m2.fail.sung', 'Bệnh viện — không nổ súng.'],
    ['cs08.ph5', '...mời nó xuống đây.'], ['cs08b.tin2', 'Bà chỉ chọn làm bùn thôi.'], ['cs08b.ph1', 'Cô cho con một đêm suy nghĩ. Ba ngày nữa là Rằm rồi.'],
    ['c8m4.cs.tvTitle', 'TRUY NÃ ĐẶC BIỆT: ĐỖ MINH TÍN, 20 TUỔI'],
  ]) assert.equal(tx(`@${k}`), line, k);
});

test('places: every place is a site or a declared space anchor; each mission uses its decided sites and spaces; all P0; the chapter places stand on the map', () => {
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
      if (a.k === 'vehicle' && a.route) check(id, a.route, at);
      if (a.k === 'do') for (const [k, v] of deep(a.args)) if (['at', 'foot', 'from', 'to'].includes(k)) check(id, v, at);
      if (a.k === 'photoTarget' && typeof a.subject === 'string' && (a.subject.includes('.') || a.subject.includes('/'))) check(id, a.subject, at);
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
  // every anchor chapter 8 declares is used by its scripts or its cutscenes
  const all = new Set([...refs.values()].flatMap((s) => [...s]));
  for (const sc of SCENES) for (const [, s] of deep(sc)) { const m = s.match(/^set:([\w-]+)\.(\w+)$/); if (m) all.add(`${m[1]}/${m[2]}`); }
  for (const [space, anchors] of Object.entries(ch8.ANCHORS)) for (const a of Object.keys(anchors)) assert.ok(all.has(`${space}/${a}`), `anchor ${space}/${a} is used`);
  // chapter places: on today's map, clear for a person or a bike, off the asphalt, in a P0 district, apart from the site spots
  const asphalt = (x, z) => TERRAIN.strips.some((s) => {
    const along = s.alongX ? x : z, v = s.alongX ? z : x;
    if ((s.lo !== -Infinity && along <= s.lo) || (s.hi !== Infinity && along >= s.hi)) return false;
    return Math.abs(v - s.at) < s.half && city.inRect(city.LAND, x, z, -0.5);
  });
  for (const [k, p] of Object.entries(ch8.PLACES)) {
    assert.ok(k.startsWith('ch8.'), k);
    assert.ok(TERRAIN.walkable(p.x, p.z) && !asphalt(p.x, p.z), `${k} is walkable sidewalk`);
    assert.ok(city.pointClear(p.x, p.z, p.r ?? 0.45), `${k} is clear at r ${p.r}`);
    assert.ok(['D1', 'D2'].includes(DIST.districtAt(p.x, p.z)?.district.id), `${k} is in An Hòa or Quận 1 (P0)`);
    for (const [s, sp] of Object.entries(SITE_PLACES)) assert.ok(Math.hypot(sp.x - p.x, sp.z - p.z) >= 1, `${k} is clear of ${s}`);
  }
  const b129 = city.BUILDINGS[129], pho = ch8.PLACES['ch8.pho-khuya'];
  assert.match(b129.name, /PHỞ/); assert.ok(Math.hypot(b129.door.x - pho.x, b129.door.z - pho.z) < 0.02 && Math.abs(b129.facing - pho.yaw) < 0.01, 'ch8.pho-khuya is the door of building 129');
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const door = S.SITES['anh-duong'], rinh = ch8.PLACES['ch8.rinh'];
  assert.ok(dist(rinh, door) >= 15 && dist(rinh, door) <= 30 && rinh.z < 101, 'the stake-out is across ĐƯỜNG CHỢ CŨ, inside the on-foot tail band');
  assert.ok(dist(ch8.PLACES['ch8.dream-cho-cu'], rinh) <= 5, 'the bike waits beside him');
  assert.ok(dist(ch8.PLACES['ch8.xe-diem'], door) <= 35 && ch8.PLACES['ch8.xe-diem'].z > 115, 'her scooter stands on her own sidewalk, a short walk away');
  assert.ok(dist(ch8.PLACES['ch8.dream-phu-my'], S.SITES['phu-my']) <= 12, 'the Dream at the curb of PHÚ MỸ');
  assert.ok(dist(ch8.PLACES['ch8.pho-dream'], pho) <= 4, 'the Dream at the phở shop');
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
const VICTIMS = new Set(['hoa', 'beti', 'mai', 'su']);
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle', 'aim', 'shoot']);
test('cutscenes: durations add up, marks, cast, sets and lines resolve, nobody is struck, every scene is played by its mission', () => {
  const played = new Map();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) if (a.k === 'cutscene') played.set(a.id, [...(played.get(a.id) ?? []), id]);
  assert.equal(SCENE.size, SCENES.length, 'scene ids are unique');
  assert.deepEqual([...played.keys()].sort(), [...SCENE.keys()].sort(), 'every scene the missions play exists, and every scene is played');
  assert.ok(SCENE.has('cs08_gia_cua_im_lang') && S.CUTSCENE_SITES.cs08_gia_cua_im_lang.mission === 'c8-m3', 'CS08 keeps its id and mission');
  for (const sc of SCENES) {
    assert.deepEqual([...new Set(played.get(sc.id))], [sc.mission], `${sc.id} is played by ${sc.mission} only`);
    const total = sc.shots.reduce((t, s) => t + s.dur, 0);
    assert.ok(Math.abs(total - sc.seconds) < 1e-9, `${sc.id}: shots add to ${total}, not ${sc.seconds}`);
    assert.ok(sc.seconds <= 35, `${sc.id}: a short in-engine scene`);
    for (const s of sc.sets ?? []) assert.ok(S.SPACES[s], `${sc.id}: set ${s}`);
    const props = new Set();
    for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'prop') props.add(c.id);
    const mark = (m, where) => {
      if (m && typeof m === 'object') { assert.ok(m.off.length === 3 && m.off.every(Number.isFinite), `${sc.id} ${where}: offset`); return mark(m.at, where); }
      assert.equal(typeof m, 'string', `${sc.id} ${where}: mark`);
      if (m.startsWith('set:')) { const [space, anchor] = m.slice(4).split('.'); assert.ok((sc.sets ?? []).includes(space) && ANCHORS[space]?.[anchor], `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('prop:')) { assert.ok(props.has(m.slice(5)), `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('vehicle:')) { assert.ok(actsOf(mission(sc.mission)).some(([a]) => a.k === 'vehicle' && a.id === m.slice(8) && (a.model || a.at)), `${sc.id} ${where}: ${m}`); return; }
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
    if (sc.shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'slowmo'))) assert.ok(sc.stage.freezeWorld, `${sc.id}: slowmo only when frozen`);
  }
  // Mai never appears, only her hairclip; Su only as a photo
  for (const sc of SCENES) for (const v of Object.values(sc.cast)) assert.ok(!VICTIMS.has(v), `${sc.id}: ${v} is not staged in chapter 8`);
  // CS08 is played in three parts around the choice, and the third reads it: one reply per answer, all at the same moment
  const exit = mission('c8-m3').steps.find((s) => s.id === 'nghe-len').exit.map((a) => (a.k === 'cutscene' ? a.id : a.k === 'choice' ? `choice:${a.id}` : null)).filter(Boolean);
  assert.deepEqual(exit, ['cs08_gia_cua_im_lang', 'cs08_gia_cua_im_lang_lo', 'choice:phongBi', 'cs08_gia_cua_im_lang_dung']);
  const replies = SCENE.get('cs08_gia_cua_im_lang_dung').shots[0].cues.filter((c) => c.k === 'say');
  assert.deepEqual(replies.map((c) => c.if.eq), ['cam', 'day', 'im']);
  assert.equal(new Set(replies.map((c) => c.t)).size, 1);
  const choice = mission('c8-m3').steps.find((s) => s.id === 'nghe-len').exit.find((a) => a.k === 'choice');
  assert.deepEqual(choice.options.map((o) => o.id), ['cam', 'day', 'im']);
  assert.equal(choice.default, 'im', 'waiting is silence');
});

const subDur = (text) => Math.min(7.5, Math.max(1.8, 1.4 + 0.065 * [...text].length));
test('cutscene subtitles are readable: at most 17 characters a second, two lines on screen, none runs past the scene', () => {
  const issues = [];
  for (const sc of SCENES) {
    let t0 = 0;
    const said = [];
    for (const [i, sh] of sc.shots.entries()) {
      for (const c of sh.cues ?? []) if (c.k === 'say') { const text = tx(c.text), s = t0 + (c.t ?? 0); said.push({ s, e: s + (c.dur ?? subDur(text)), text, alt: !!c.if, shot: sh.label ?? `shot ${i + 1}` }); }
      t0 += sh.dur;
    }
    said.sort((a, b) => a.s - b.s);
    for (const l of said) {
      const next = said.find((o) => o.s > l.s + 1e-9);
      const shown = (next ? Math.min(next.s, t0) : Math.min(l.e, t0)) - l.s, cps = [...l.text].length / Math.max(0.01, shown);
      if (next && cps > 17) issues.push(`${sc.id} [${l.shot}]: ${cps.toFixed(1)} cps (${shown.toFixed(1)} s for "${l.text}")`);
      if (l.e > t0 + 0.5) issues.push(`${sc.id} [${l.shot}]: "${l.text}" runs ${(l.e - t0).toFixed(1)} s past the scene`);
      const live = said.filter((o) => o.s <= l.s + 1e-9 && o.e > l.s && !(o !== l && o.alt && l.alt && Math.abs(o.s - l.s) < 1e-9));
      if (live.length > 2) issues.push(`${sc.id} [${l.shot}]: ${live.length} lines on screen at ${l.s.toFixed(1)} s`);
    }
  }
  assert.deepEqual(issues, []);
});

test('cutscenes name only contract ids (plus the chapter\'s needs); two-actor shots have two actors; grades exist', async () => {
  const kinds = { ...CONTRACT, rides: { ...CONTRACT.models, ...CONTRACT.rideModels }, sceneProps: { ...CONTRACT.props, ...CONTRACT.sceneProps } };
  const issues = [];
  for (const sc of SCENES) {
    for (const [kind, id, where] of SCENE_SCHEMA.sceneVocab(sc)) if (!Object.prototype.hasOwnProperty.call(kinds[kind] ?? {}, id)) issues.push(`${sc.id} ${where}: ${kind} '${id}'`);
    for (const [i, sh] of sc.shots.entries()) {
      if (sh.cam.k === 'ots' && sh.cam.speaker === sh.cam.listener) issues.push(`${sc.id} shot ${i + 1}: ots of one actor`);
      if (sh.cam.k === 'twoShot' && sh.cam.a === sh.cam.b) issues.push(`${sc.id} shot ${i + 1}: two-shot of one actor`);
    }
  }
  assert.deepEqual(issues, []);
  const { gradeFilter } = await import('../app/story-ui/format.ts');
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) if (k === 'grades') assert.notEqual(gradeFilter(id), 'none');
});

test('the interrogation: two lies and one truth, each settled by cards earlier chapters give; accusing the truth only hurts; it never fails', () => {
  const d = catalog.interrogations.get('diem-loi-khai');
  assert.deepEqual(I.lintInterrogation(d, new Set(catalog.evidence.keys())), []);
  assert.deepEqual(d.statements.map((s) => s.kind), ['lie', 'lie', 'true']);
  for (const s of d.statements) assert.ok(s.cards.some((c) => START.evidence.includes(c)), `${s.id}: the end of chapter 7 holds a card that settles it`);
  assert.ok(d.statements[0].cards.includes('ev-so-mai') && d.statements[1].cards.includes('ev-cap-mai') && d.statements[2].cards.includes('ev-ho-so-diem'), 'the bible\'s three cards');
  for (const s of d.statements) assert.ok(s.cards.every((c) => catalog.evidence.get(c).chapter < 8), `${s.id}: no chapter 8 card is needed`);
  // a wrong card and an accused truth cost silence and trust, never the session
  const st = I.startInterrogation(d), owned = (id) => START.evidence.includes(id);
  assert.equal(I.present(d, st, 'ev-cap-mai', 'accuse', owned).result, 'wrong');
  I.tickInterrogation(st, 5);
  assert.equal(I.present(d, st, 'ev-so-trang-2', 'accuse', owned).result, 'contradiction');
  assert.equal(I.present(d, st, 'ev-cap-mai', 'accuse', owned).result, 'contradiction');
  assert.equal(I.present(d, st, 'ev-ho-so-diem', 'accuse', owned).result, 'hurt');
  I.tickInterrogation(st, 5);
  const last = I.present(d, st, 'ev-ho-so-diem', 'empathy', owned);
  assert.deepEqual([last.result, last.done, last.line], ['understood', true, '@c8m1.iv.s3.reply']);
  assert.deepEqual(I.outcome(d, st), { settled: 3, wrong: 2, bluffs: 0, called: 0, empathy: 1, trust: 0, perfect: false });
});

test('the safe code is Ngân\'s birthday as the two clues show it (DD-MM-YY), and the clues are in Bảo\'s office', () => {
  const frame = tx('@ev.beNgan.x'), cal = tx('@ev.lichBan.x');
  const year = frame.match(/(20\d\d)/)[1], [, day, month] = cal.match(/ngày (\d+) .*tháng Chín|tháng Chín, ngày (\d+)/) ? [null, cal.match(/ngày (\d+)/)[1], '09'] : [];
  assert.equal(ch8.SAFE_CODE, `${day.padStart(2, '0')}${month}${year.slice(2)}`);
  assert.equal(opArgs('c8-m4', 'keypad').code, ch8.SAFE_CODE);
  const clues = actsOf(mission('c8-m4')).map(([a]) => a).filter((a) => a.k === 'clue').map((a) => [a.evidence, a.at]);
  assert.deepEqual(clues, [['ev-anh-be-ngan', 'bank-floor20/frame'], ['ev-lich-ban', 'bank-floor20/calendar']]);
  assert.match(tx('@c8m4.ket.hint'), /Ngày, tháng, năm/);
});

test('every flag and mission variable a chapter 8 condition reads is written by chapter 8 (or is a choice result); items taken were given', () => {
  const written = new Set();
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'var') written.add(`var:${a.name}`);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  for (const m of ch8.chapter.missions) { for (const [a] of actsOf(m)) note(a); for (const a of m.rewards ?? []) note(a); }
  for (const q of ch8.QUESTIONS) for (const a of q.onCorrect ?? []) note(a);
  for (const d of ch8.INTERROGATIONS) for (const a of d.done ?? []) note(a);
  const read = [];
  for (const id of MISSIONS) {
    const m = mission(id);
    for (const [c, at] of condsOf(m)) { if (c.k === 'flag') read.push([c.name, at]); if (c.k === 'var') read.push([`var:${c.name}`, at]); }
    for (const sc of SCENES.filter((s) => s.mission === id)) for (const sh of sc.shots) for (const cue of sh.cues ?? []) {
      const walk = (c) => { if (!c) return; if (c.k === 'flag') read.push([c.name, sc.id]); if (c.k === 'var') read.push([`var:${c.name}`, sc.id]); (c.of ?? []).forEach(walk); walk(c.c); };
      walk(cue.if);
    }
    for (const f of Object.keys(m.replay?.flags ?? {})) assert.ok(written.has(f), `${id} replay sets ${f}, which play also sets`);
  }
  for (const [n, at] of read) assert.ok(written.has(n), `${at}: reads ${n} that nothing sets`);
  // the hand-offs later chapters read (content/ch09.ts UPSTREAM_FLAGS 'tookEnvelope'; the rescued count is chapter 10's)
  for (const f of ['tookEnvelope', 'diemSafe', 'knowsSoChi', 'knowsSoGoc', 'hasSoChi', 'knowsRamShip', 'wanted']) assert.ok(written.has(f), `hand-off flag ${f}`);
  assert.ok(!written.has('rescued'), 'chapter 8 rescues nobody new: the count stays 11 (story-decisions 13)');
  const given = new Set(ch8.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a).filter((a) => a.k === 'give').map((a) => a.item)));
  for (const m of ch8.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'take') assert.ok(given.has(a.item), `${at}: takes ${a.item}`);
});

test('steps only wait for what the script offers: interactions, climbs, tails, helpers, eavesdrops, evidence sources, contract signals and meters', () => {
  const METERS = new Set(Object.keys(CONTRACT.meters));
  for (const id of MISSIONS) {
    const m = mission(id), acts = actsOf(m).map(([a]) => a);
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id)), climbs = new Set(specs.filter((x) => x.kind === 'climb').map((x) => x.id));
    for (const x of specs) if (x.kind === 'climb') assert.ok(x.to && (PLACES[x.to] || x.to.includes('/')), `${id}: climb ${x.id} has a far end`);
    const helpers = new Set([...acts.filter((a) => a.k === 'tail').map((a) => a.target), ...acts.filter((a) => a.k === 'do' && a.args?.id && !a.wait).map((a) => a.args.id)]);
    const ears = new Set(acts.filter((a) => a.k === 'eavesdrop').map((a) => a.id)), actors = new Set(acts.filter((a) => a.k === 'spawn').map((a) => a.id));
    const photos = new Set(acts.filter((a) => a.k === 'photoTarget').map((a) => a.id));
    const sources = new Set([...acts.filter((a) => a.k === 'evidence').map((a) => a.id), ...acts.filter((a) => (a.k === 'photoTarget' || a.k === 'clue') && a.evidence).map((a) => a.evidence)]);
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id) && !climbs.has(c.id), `${at}: waits for interaction ${c.id}`);
      if (c.k === 'on' && c.ev === 'climb') assert.ok(climbs.has(c.id), `${at}: waits for climb ${c.id}`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(CONTRACT.signals[c.id] || CONTRACT.ops[c.id], `${at}: signal ${c.id}`);
      if (c.k === 'on' && ['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(helpers.has(c.id), `${at}: waits for helper ${c.id}`);
      if (c.k === 'on' && c.ev === 'eavesdrop') assert.ok(ears.has(c.id), `${at}: waits for eavesdrop ${c.id}`);
      if (c.k === 'on' && c.ev === 'photo') assert.ok(photos.has(c.id), `${at}: waits for photo target ${c.id}`);
      if (c.k === 'on' && c.ev === 'knockout' && c.id) assert.ok(actors.has(c.id), `${at}: waits for a knockout of ${c.id}, who is spawned`);
      if (c.k === 'evidence' && ch8.EVIDENCE.some((e) => e.id === c.id)) assert.ok(sources.has(c.id), `${at}: evidence ${c.id} has a source in ${id}`);
      if (c.k === 'meter') assert.ok(METERS.has(c.id) || /^(tail|eavesdrop):/.test(c.id), `${at}: meter ${c.id}`);
      assert.notEqual(c.k, 'q', `${at}: chapter 8 waits on no engine query`);
    }
    for (const a of acts) if (a.k === 'do') assert.ok(CONTRACT.ops[a.op], `${id}: op ${a.op}`);
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(METERS.has(x.id) || helpers.has(x.id.slice(5)) || ears.has(x.id.slice(10)), `${id}/${s.id}: meter ${x.id} has a helper`);
  }
});

test('case board: chapter 8 cards are evidence with a source, on their own lotus slots, tied to chapters 3–6, and the board solves', async () => {
  const ids = [...new Set([...ch8.BOARD_CARDS.map((c) => c.id), ...ch8.BOARD_LINKS.flat()])];
  const board = { id: 'test-ch8', title: '@cast.tin', cards: ids.map((id) => ({ id })), links: ch8.BOARD_LINKS };
  const evidence = new Set(catalog.evidence.keys());
  assert.deepEqual(D.lintBoard(board, evidence), []);
  const later = [];
  for (const n of ['06', '07']) {
    const url = new URL(`../app/game/story/content/ch${n}.ts`, import.meta.url);
    if (existsSync(url)) try { later.push(...((await import(url.href)).BOARD_CARDS ?? [])); } catch { /* still being written */ }
  }
  const all = [...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS, ...ch3.BOARD_CARDS, ...ch4.BOARD_CARDS, ...ch5.BOARD_CARDS, ...later, ...ch8.BOARD_CARDS], slots = all.map((c) => c.slot);
  assert.equal(new Set(slots).size, slots.length, `one card per lotus slot across chapters 1–8 (${slots.join(',')})`);
  assert.ok(ch8.BOARD_CARDS.every((c) => c.slot >= 54 && c.slot <= 61));
  for (const c of ch8.BOARD_CARDS) assert.equal(ch8.EVIDENCE.find((e) => e.id === c.id)?.chapter, 8, `${c.id} is a chapter 8 card`);
  for (const [a, b] of [['ev-loi-khai-diem', 'ev-ho-so-diem'], ['ev-kep-toc-mai', 'ev-cap-mai'], ['ev-bao-goi-luc', 'ev-clip-luc'], ['ev-so-chi', 'ev-dong-ho-vang']]) {
    assert.ok(ch8.BOARD_LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a)), `${a} ↔ ${b}`);
  }
  const seen = new Set([ids[0]]), todo = [ids[0]];
  while (todo.length) { const a = todo.pop(); for (const [x, y] of board.links) for (const [p, q] of [[x, y], [y, x]]) if (p === a && !seen.has(q)) { seen.add(q); todo.push(q); } }
  assert.equal(seen.size, ids.length, 'every card is on a string');
  const p = F.newProgress(); p.evidence.push(...ids);
  let solved = false;
  for (const [a, b] of board.links) solved = D.linkCards(board, p, a, b, (id) => p.evidence.includes(id)).solved;
  assert.equal(solved, true);
  const sources = new Set();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) {
    if (a.k === 'evidence') sources.add(a.id);
    if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence);
  }
  assert.deepEqual(ch8.EVIDENCE.map((e) => e.id).filter((e) => !sources.has(e)), [], 'every chapter 8 evidence can be found in play');
});

test('chapters 6 and 7 agree with the stand-ins once they load (cast, evidence, outfits and the qte op chapter 8 uses)', async (t) => {
  const load = async (n) => {
    const url = new URL(`../app/game/story/content/ch0${n}.ts`, import.meta.url);
    if (!existsSync(url)) return null;
    try { return await import(url.href); } catch { return null; }
  };
  const [m6, m7] = [await load(6), await load(7)];
  if (!m6 && !m7) { t.skip('chapters 6 and 7 are not built yet'); return; }
  if (m6) {
    const cast = new Set((m6.chapter?.cast ?? m6.CAST ?? []).map((c) => c.id)), ev = new Set((m6.chapter?.evidence ?? m6.EVIDENCE ?? []).map((e) => e.id));
    for (const c of CH6_STAND_IN.cast) assert.ok(cast.has(c.id), `chapter 6 defines cast '${c.id}'`);
    for (const e of CH6_STAND_IN.evidence) assert.ok(ev.has(e.id), `chapter 6 defines evidence '${e.id}'`);
    if (m6.ENGINE_NEEDS?.ops?.qte) assert.equal(m6.ENGINE_NEEDS.ops.qte[0], ch8.ENGINE_NEEDS.ops.qte[0], 'one qte op, one lane');
    if (m6.ENGINE_NEEDS?.templates?.bodyguard) assert.equal(m6.ENGINE_NEEDS.templates.bodyguard[0], ch8.ENGINE_NEEDS.templates.bodyguard[0], 'one bodyguard template, one lane');
  }
  if (m7) {
    const cast = new Set((m7.chapter?.cast ?? m7.CAST ?? []).map((c) => c.id));
    for (const c of CH7_STAND_IN.cast) assert.ok(cast.has(c.id), `chapter 7 defines cast '${c.id}'`);
    if (m7.ENGINE_NEEDS?.outfits) assert.ok(m7.ENGINE_NEEDS.outfits['tin-ao-tu'], "chapter 7 gives Ông Tư's jacket as 'tin-ao-tu'");
    for (const [kind, ids] of Object.entries(m7.ENGINE_NEEDS ?? {})) for (const [id, [lane]] of Object.entries(ids)) if (ch8.ENGINE_NEEDS[kind]?.[id]) assert.equal(lane, ch8.ENGINE_NEEDS[kind][id][0], `${kind} '${id}': one lane`);
  }
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

const snapshots = [];
const CHECKPOINTS = [
  'c8-m1/bam-bo', 'c8-m1/bam-xe', 'c8-m1/hop-thu', 'c8-m1/can-ho', 'c8-m1/tang-9', 'c8-m1/tang-5', 'c8-m1/tang-1',
  'c8-m2/hanh-lang', 'c8-m2/cua-phong',
  'c8-m3/lay-ao', 'c8-m3/sanh-tiec', 'c8-m3/gian-den', 'c8-m3/nghe-len', 'c8-m3/ra-ve',
  'c8-m4/sanh-nh', 'c8-m4/tang-20', 'c8-m4/phong-bao', 'c8-m4/bao-vao', 'c8-m4/gian-lau-kinh',
];

test('main path: one save plays c8-m1 → c8-m4 end to end on the mock host from the end of chapter 7', () => {
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
    assert.ok(res.ticks < 15000);
    assert.equal(done.result.nonLethal, true);
  }
  const p = r.progress();
  for (const id of MISSIONS) assert.ok(p.completed.includes(id));
  assert.deepEqual(w.missing, [], 'every actor, vehicle and place a step uses exists');
  assert.deepEqual(r.state().issues, []);
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [8], 'the chapter card shows once');
  assert.deepEqual(p.lunar, { month: 8, day: 13 });
  assert.equal(p.cash, 300 + 30, 'the phở order pays 30.000đ');
  assert.deepEqual([p.items['so-chi'], p.items['usb-bao'], p.items['kep-toc-mai']], [1, 1, 1]);
  for (const f of ['diemTalked', 'knowsSoChi', 'knowsSoGoc', 'knowsSu', 'diemSafe', 'savedDiem', 'knowsLucLeak', 'knowsGala', 'savedDiemTwice', 'refusedPhuong', 'knowsRamShip', 'sawGala', 'hasSoChi', 'knowsFrame', 'wanted', 'stoleSoChi']) assert.equal(p.flags[f], true, f);
  assert.deepEqual([p.flags['choice:baoVeCc'], p.flags['choice:phongBi'], p.flags['choice:baoVeNh'], p.flags.tookEnvelope], ['p1204', 'cam', 'anh', true]);
  for (const e of ch8.EVIDENCE.map((x) => x.id).filter((x) => !['ev-anh-be-su', 'ev-luc-da-tiec'].includes(x))) assert.ok(p.evidence.includes(e), e);
  for (const j of ch8.JOURNAL.map((x) => x.id)) assert.ok(p.journal.includes(j), j);
  assert.deepEqual(p.deductions.aiBaoTin, { answer: 'luc', tries: 1 });
  assert.deepEqual(p.interrogations['diem-loi-khai'], { wrong: 0, bluffs: 0, empathy: 1, trust: 1 });
  assert.equal(p.conscience.knockouts, 9 + 2, 'two impostors, nobody else (the theatre is a heritage site: the catwalk man is slipped past)');
  assert.deepEqual([p.conscience.kills, p.conscience.civiliansHurt, F.conscienceTier(p.conscience)], [0, 0, 'clean']);
  for (const sc of SCENES) assert.ok(p.seen.includes(sc.id), `${sc.id} played`);
  assert.deepEqual(lines(w, 'c8m1-xe'), [tx('@c8m1.v3'), tx('@c8m1.v4.sach'), tx('@c8m1.diem.xe'), tx('@c8m1.v6')], 'the clean stairs: Vân\'s line about Ông Tư');
  assert.deepEqual(lines(w, 'c8m2-loc').slice(1), [tx('@c8m2.loc2.em')], 'nobody on the ward noticed');
  assert.ok(lines(w, 'c8m3-van').includes(tx('@c8m3.t.cam')), 'he tells Vân about the envelope');
  assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'qte') && w.log.some((l) => l.k === 'do' && l.a.op === 'keypad'));
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

test('c8-m1: wrong cards and an accused truth cost silence, never the talk; the 2014 file comes with the box; a wrong room number asks again', () => {
  const noFile = F.cloneProgress(before.get('c8-m1'));
  noFile.evidence = noFile.evidence.filter((e) => e !== 'ev-ho-so-diem');
  const run = play('c8-m1', {
    progress: noFile, choose: { baoVeCc: ['quen', 'goi', 'p1204'] }, optional: ['khung-anh'],
    ivWrong: { 'van-phong': { card: 'ev-cap-mai' }, 'tu-nguyen': { card: 'ev-so-mai' }, 'khong-lua-chon': { card: 'ev-ho-so-diem', approach: 'accuse' } },
  });
  assert.ok(run.w.log.some((l) => l.k === 'toast' && l.a.text === tx('@c8m1.toast.hoSo')), 'Tín carries the box\'s papers');
  assert.ok(run.p.evidence.includes('ev-ho-so-diem'));
  assert.deepEqual(run.p.interrogations['diem-loi-khai'], { wrong: 3, bluffs: 0, empathy: 1, trust: 0 });
  assert.equal(run.p.flags.diemTalked, true);
  assert.deepEqual(outs(run.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c8m1.fail.bv'), true], [tx('@c8m1.fail.bv'), true]], 'two soft fails at the desk, no card');
  assert.ok(lines(run.w, 'c8m1-bv-quen') && lines(run.w, 'c8m1-bv-goi'));
  assert.ok(run.p.evidence.includes('ev-anh-be-su'));
  assert.equal(run.done.result.eye, true, 'Mắt cú for the photo of Su');
  assert.deepEqual(run.w.missing, []);
});

test('c8-m1: a lost tail skips to the bike tail after three tries; a kill on the stairs is booked, not failed, and Vân answers it; a choke never kills', () => {
  let fails = 0;
  const lost = play('c8-m1', {
    progress: before.get('c8-m1'),
    hold: { 'bam-bo': ({ visit, push }) => { if (visit <= 3) { push({ type: 'lost', id: 'diem' }); return true; } return false; } },
    onFail: (v) => { fails++; return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.ok(lost.res.visits['bam-xe'] && !lost.res.visits['len-xe'], 'the skip lands at the bike-tail checkpoint');
  assert.deepEqual([lost.done.stats.skipped, lost.done.result.grade], [1, 'C']);
  const shot = play('c8-m1', {
    progress: before.get('c8-m1'),
    hold: { 'tang-5': ({ visit, push }) => { if (visit === 1) { push({ type: 'kill', id: 'sat-thu-2', tag: 'guard', cause: 'bullet' }); push({ type: 'kill', id: 'sat-thu-x', tag: 'guard', cause: 'choke' }); } return false; } },
  });
  assert.deepEqual(outs(shot.w, 'fail'), [], 'lethal allow: the firefight goes on');
  assert.deepEqual([shot.done.stats.kills, shot.done.stats.knockouts, shot.done.result.nonLethal], [1, 1, false]);
  assert.equal(F.conscienceTier(shot.p.conscience), 'stained');
  assert.deepEqual(lines(shot.w, 'c8m1-xe'), [tx('@c8m1.v3'), tx('@c8m1.v4.chet'), tx('@c8m1.v5.chet'), tx('@c8m1.diem.xe'), tx('@c8m1.v6')]);
  for (const run of [lost, shot]) { assert.deepEqual(run.w.missing, []); assert.equal(run.p.flags.diemSafe, true); }
});

test('c8-m2: panic sends the third man early; a real orderly knocked down is booked against LƯƠNG TÂM; a missed tackle retries the door; a wrong deduction costs a token', () => {
  const panic = play('c8-m2', {
    progress: before.get('c8-m2'), wrong: { aiBaoTin: 'loc' }, results: { qte: ['miss', 'ok'] },
    hold: { 'tim-gia': ({ w, visit }) => { if (visit === 1) { w.meters.set('panic:benh-vien', 1); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c8m2.fail.qte')); return 'retry'; },
  });
  assert.equal(panic.res.visits['cua-phong'], 2, 'the miss replays from the door');
  assert.equal(panic.w.log.filter((l) => l.k === 'do' && l.a.op === 'qte').length, 2, 'and the tackle comes again');
  assert.equal(panic.r.state().vars?.som ?? true, true);
  assert.deepEqual(lines(panic.w, 'c8m2-loc').slice(1), [tx('@c8m2.loc2.on')], 'Lộc noticed the noise');
  assert.ok(!panic.p.evidence.includes('ev-gia-ho-ly-1'), 'the first two ran before Tín could confirm them');
  assert.deepEqual(panic.p.deductions.aiBaoTin, { answer: 'luc', tries: 2 });
  assert.equal(panic.p.flags.knowsGala, true);
  const wrongMan = play('c8-m2', {
    progress: before.get('c8-m2'),
    hold: { 'tim-gia': ({ visit, push }) => { if (visit === 1) push({ type: 'knockout', id: 'ho-ly-1', tag: 'innocent', cause: 'fast' }); return false; } },
  });
  assert.equal(wrongMan.done.stats.civiliansHurt, 1);
  assert.equal(F.conscienceTier(wrongMan.p.conscience), 'stained');
  assert.ok(wrongMan.w.log.some((l) => l.k === 'hint' && l.a.text === tx('@c8m2.hint.voToi')), '"Đừng làm hại người vô tội."');
  assert.ok(wrongMan.w.log.some((l) => l.k === 'toast' && l.a.text === tx('@c8m2.toast.lo')));
  const monitor = play('c8-m2', { progress: before.get('c8-m2'), optional: ['man-hinh'] });
  assert.ok(monitor.w.log.some((l) => l.k === 'do' && l.a.op === 'monitor'));
  assert.equal(monitor.done.result.eye, true, 'Mắt cú for the nurses\' monitor');
  for (const run of [panic, wrongMan, monitor]) { assert.deepEqual(run.w.missing, []); assert.equal(run.p.flags.savedDiemTwice, true); }
});

test('c8-m2: a shot fired on the ward fails the mission ("Bệnh viện — không nổ súng.")', () => {
  const { r, w } = setup({ progress: before.get('c8-m2') });
  r.start('c8-m2');
  let failed = null;
  autopilot(r, w, {
    hold: { 'tim-gia': ({ push, visit }) => { if (visit === 1) push({ type: 'gunfire', id: 'player' }); return false; } },
    onFail: (v) => { failed ??= v.failure.reason; return 'retry'; },
  });
  assert.equal(failed, tx('@c8m2.fail.sung'));
});

test('c8-m3: each answer to Phượng changes her reply and Vân\'s call, never the plot; a blown cover and a run replay their step; the catwalk can be skipped', () => {
  const runs = {};
  for (const pick of ['cam', 'day', 'im']) runs[pick] = play('c8-m3', { progress: before.get('c8-m3'), choose: { phongBi: pick } });
  for (const [pick, run] of Object.entries(runs)) {
    assert.equal(run.p.flags['choice:phongBi'], pick);
    assert.equal(run.p.flags.tookEnvelope === true, pick === 'cam', `${pick}: tookEnvelope (chapter 9 burns it)`);
    assert.deepEqual([run.p.flags.refusedPhuong, run.p.flags.knowsRamShip, run.p.items['kep-toc-mai']], [true, true, 1], `${pick}: same plot`);
    assert.equal(lines(run.w, 'c8m3-van').includes(tx('@c8m3.v.cam')), pick === 'cam');
    assert.equal(run.w.log.some((l) => l.k === 'dialogue' && l.id === 'cs08-cam'), pick === 'cam');
    assert.equal(run.done.chain, 'c8-m4');
  }
  const cover = play('c8-m3', {
    progress: before.get('c8-m3'), optional: ['luc-tiec'],
    hold: {
      'sanh-tiec': ({ w, visit }) => { if (visit === 1) { w.meters.set('cover:waiter', 1); return true; } w.meters.set('cover:waiter', 0); return false; },
      'ra-ve': ({ w, visit }) => { w.player.speed = visit === 1 ? 7 : 0; return visit === 1; },
    },
  });
  assert.deepEqual(outs(cover.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c8m3.fail.voBoc'), true], [tx('@c8m3.fail.chay'), true]]);
  assert.ok(cover.w.log.findLast((l) => l.step === 'sanh-tiec' && l.k === 'player' && l.a.carry === 'khay-ly'), 'the tray is back in his hands');
  assert.ok(cover.p.evidence.includes('ev-luc-da-tiec') && cover.done.result.eye, 'Lực at the table of honour, photographed');
  const skip = play('c8-m3', {
    progress: before.get('c8-m3'),
    hold: { 'gian-den': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'ky-thuat' }); return true; } return false; } },
    onFail: (v) => (v.failure.canSkip ? 'skip' : 'retry'),
  });
  assert.ok(skip.res.visits['nghe-len'] && skip.p.evidence.includes('ev-phuong-ram'), 'the skip still lets him hear the box');
  assert.equal(skip.done.stats.skipped, 1);
  for (const run of [...Object.values(runs), cover, skip]) assert.deepEqual(run.w.missing, []);
});

test('c8-m4: a wrong answer at the desk, the blackout run out, the safe closed, the gondola lit, the cameras skipped: each goes back, none loses the night', () => {
  const run = play('c8-m4', {
    progress: before.get('c8-m4'), choose: { baoVeNh: ['sep', 'anh'] }, results: { keypad: ['closed', 'open'] }, optional: ['chup-cam'],
    hold: {
      'hanh-lang': ({ visit, push }) => { if (visit === 1) { push({ type: 'timer', id: 'cup-dien' }); return true; } return false; },
      'gian-lau-kinh': ({ visit, push }) => { if (visit === 1) { push({ type: 'spotted', id: 'gondola' }); return true; } return false; },
    },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c8m4.fail.gondola')); return 'retry'; },
  });
  assert.deepEqual(outs(run.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c8m4.fail.bv'), true], [tx('@c8m4.fail.gondola'), false]]);
  assert.equal(run.res.visits['cau-dao'], 2, 'the lights came back: cut them again');
  assert.equal(run.res.visits['ket-sat'], 2, 'the keypad closed: back to the safe');
  assert.ok(run.w.log.some((l) => l.k === 'hint' && l.a.text === tx('@c8m4.hint.ketLai')));
  assert.equal(run.res.visits['gian-lau-kinh'], 2);
  assert.equal(run.done.result.eye, true, 'Mắt cú for the three cameras');
  assert.deepEqual([run.p.flags.hasSoChi, run.p.flags.wanted, run.p.lunar.day], [true, true, 13]);
  const cams = play('c8-m4', {
    progress: before.get('c8-m4'),
    hold: { 'tang-20': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'cam-2' }); return true; } return false; } },
    onFail: (v) => (v.failure.canSkip ? 'skip' : 'retry'),
  });
  assert.ok(cams.res.visits['phong-bao'] && !cams.res.visits['cau-dao'], 'the skip lands in Bảo\'s office');
  assert.ok(cams.p.evidence.includes('ev-so-chi'));
  for (const r2 of [run, cams]) assert.deepEqual(r2.w.missing, []);
});

test('LƯƠNG TÂM in chapter 8: a chokehold "kill" is a knockout everywhere; a real death fails c8-m2–m4 and is booked in c8-m1', () => {
  for (const id of MISSIONS) {
    const { r } = setup({ progress: before.get(id) });
    r.start(id);
    for (let i = 0; i < 3; i++) r.tick(0.1);
    r.event({ type: 'kill', id: 'gac', tag: 'guard', cause: 'choke' });
    r.tick(0.1);
    assert.notEqual(r.view().phase, 'failed', `${id}: a choke never kills`);
    r.event({ type: 'kill', id: 'gac-2', tag: 'guard', cause: 'fall' });
    r.tick(0.1);
    if (id === 'c8-m1') { assert.notEqual(r.view().phase, 'failed'); assert.equal(r.view().conscience.kills, 1); }
    else assert.equal(r.view().failure?.reason, R.LETHAL_REASON, `${id}: Tín không giết ai`);
  }
});

test('replays: every chapter 8 mission replays in a sandbox from its chapter start, and from nothing but its replay block', () => {
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
  // a bare save that has only reached chapter 8: the replay blocks alone carry each mission
  for (const id of MISSIONS) {
    const bare = F.newProgress();
    for (const m of F.missionOrder(C.CAMPAIGN)) { if (m.chapter >= 8) break; bare.completed.push(m.id); }
    bare.chapter = 8;
    const run = play(id, { progress: bare, replay: true });
    assert.equal(run.done.replay, true, `${id} replays from its replay block`);
    assert.deepEqual(run.w.missing, []);
  }
});

test('heritage and interiors: no takedown inside NHÀ HÁT THÀNH PHỐ; the bank floor\'s blackout is a set and arena variant, never the street power op', () => {
  // the theatre is a heritage building (content rules; story-decisions.md 22 for the pagoda): avoidance only
  const m3 = mission('c8-m3');
  const arenas = actsOf(m3).filter(([a]) => a.k === 'stealth' && a.rules);
  assert.ok(arenas.length > 0);
  for (const [a, at] of arenas) assert.equal(a.rules.takedowns, false, `${at}: no takedowns in the theatre`);
  for (const [c, at] of condsOf(m3)) assert.ok(!(c.k === 'on' && ['knockout', 'takedown', 'kill'].includes(c.ev)), `${at}: nothing in the theatre waits on a takedown`);
  assert.deepEqual(m3.steps.find((s) => s.id === 'gian-den').subs.map((x) => x.id), ['lach', 'toi'], 'past the catwalk man, then over the box');
  // festival-blackout-heli.md §2.6: interior power is set-owned; the fuse box switches the set and the arena, and they come back
  const m4 = mission('c8-m4');
  assert.ok(!actsOf(m4).some(([a]) => a.k === 'do' && (a.op === 'power' || a.op === 'powerSweep')), 'no street power op inside the bank');
  const cut = m4.steps.find((s) => s.id === 'cau-dao').exit;
  assert.ok(cut.some((a) => a.k === 'space' && a.variant?.id === 'bank-floor20' && a.variant.v === 'blackout'), 'the set goes dark');
  assert.ok(cut.some((a) => a.k === 'stealth' && a.arena === 'ngan-hang' && a.variant === 'floor20-dark'), 'the corridor light field and cam3 go dark');
  const back = m4.steps.find((s) => s.id === 'hanh-lang').branch[0].do;
  assert.ok(back.some((a) => a.k === 'stealth' && a.variant === 'floor20') && back.some((a) => a.k === 'space' && a.variant?.v === 'lit'), 'the lights come back when the 30 s run out');
  for (const id of ['tang-20', 'phong-bao', 'bao-vao']) {
    const setup = m4.steps.find((s) => s.id === id).checkpoint.setup;
    assert.ok(setup.some((a) => a.k === 'space' && a.variant?.v === 'lit') && setup.some((a) => a.k === 'stealth' && a.variant === 'floor20'), `${id}: a restore relights the floor`);
  }
  assert.match(CONTRACT.arenas['ngan-hang'][1], /floor20-dark/);
});
