// node --experimental-transform-types --test scripts/story-ch11.test.mjs
// Story content, chapter 11 (SEN TRONG BÙN · GIAO TẬN TAY: c11-m1 the reefer truck and the railing, c11-m2 the 68th
// floor and the dive, c11-m3 the roof pad and CS12, c11-m4 the epilogue and the credits). The chapter loads through the
// registry beside chapters 1–5 and lints clean against the real sites and the engine contract (ENGINE_CONTRACT and
// SCENE_REQUESTS) plus the ids it asks for (content/ch11.ts ENGINE_NEEDS, which must name exactly what the contract
// lacks); every text reference resolves (no inline strings, no orphan keys, no real brands, the ring only through
// {@ring}, subtitles fit and are readable, the decided lines of story-decisions.md §8 are exact); every place is a site,
// a chapter place checked on today's map, or a declared space anchor, and each mission uses the sites story-decisions.md
// gave it; the cutscenes are consistent (durations, marks, cast, sets, dignity) and name only contract ids; the steps only
// wait for what the script offers; the flags it reads are written; the rescued count runs 28 → 40 → 41.
// A mock host and an autopilot (each step's own conditions satisfied in turn) play the chapter's main path c11-m1 →
// c11-m4 from an end-of-chapter-10 progress, resume from every checkpoint, and play the alternatives: the convoy lost and
// skipped, the truck sliding three times, a pedestrian hurt, the deck staff harmed, the window missed, the landing missed
// (the hovering helicopter and its tail rotor), detection on the pad, a kill and what it changes in the epilogue, Mai's
// other choice, "Ngồi thêm chút nữa", every optional stop, the LƯƠNG TÂM rules and the replays.
// Chapters 6–9 are written in parallel: a stand-in module per chapter provides just the cast chapter 11 speaks with
// (phuong ch.6, loc ch.7, bao ch.8, tam-ho, kieu-anh, dai-ta ch.9); a separate test checks the real modules once they load.
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
const SCENE_SCHEMA = await import('../app/game/story/scene.ts');
const ch1 = await import('../app/game/story/content/ch01.ts');
const ch2 = await import('../app/game/story/content/ch02.ts');
const ch3 = await import('../app/game/story/content/ch03.ts');
const ch4 = await import('../app/game/story/content/ch04.ts');
const ch5 = await import('../app/game/story/content/ch05.ts');
const ch11 = await import('../app/game/story/content/ch11.ts');
const cs11 = await import('../app/game/story/cutscenes/ch11.ts');
const t11 = await import('../app/game/story/text/vi/ch11.ts');
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT, SCENE_REQUESTS } = await import('../app/game/story/contract.ts');
const city = await import('../app/game/city.ts');
const { TERRAIN } = await import('../app/game/map/terrain.ts');
const DIST = await import('../app/game/map/districts.ts');

/** The cast chapter 11 speaks with that chapters 6–9 introduce (story-final.md), standing in for those modules. */
const STAND_INS = [
  { chapter: 6, missions: [], cast: [{ id: 'phuong', name: '@cast.phuong', look: 'phuong', portrait: { bg: '#3f8f6b', initials: 'P' } }], text: { 'cast.phuong': 'Bà Phượng' } },
  { chapter: 7, missions: [], cast: [{ id: 'loc', name: '@cast.loc', look: 'loc', portrait: { bg: '#1f3f78', initials: 'L' } }], text: { 'cast.loc': 'Thiếu tá Lộc' } },
  { chapter: 8, missions: [], cast: [{ id: 'bao', name: '@cast.bao', look: 'bao', portrait: { bg: '#8a8f98', initials: 'B' } }], text: { 'cast.bao': 'Ông Bảo' } },
  {
    chapter: 9, missions: [],
    cast: [
      { id: 'tam-ho', name: '@cast.tam-ho', look: 'tam-ho', portrait: { bg: '#d8a020', initials: 'H' } },
      { id: 'kieu-anh', name: '@cast.kieu-anh', look: 'kieu-anh', portrait: { bg: '#c9a27a', initials: 'KA' } },
      { id: 'dai-ta', name: '@cast.dai-ta', look: 'dai-ta', portrait: { bg: '#2f5b3a', initials: 'ĐT' } },
    ],
    text: { 'cast.tam-ho': 'Tám Hổ', 'cast.kieu-anh': 'Kiều Anh', 'cast.dai-ta': 'Đại tá' },
  },
];
C.registerChapter(11, () => import('../app/game/story/content/ch11.ts'));
const catalog = await C.loadCatalog([1, 2, 3, 4, 5, 11]);
for (const m of STAND_INS) R.addModule(catalog, m);
const MODULES = [ch1.chapter, ch2.chapter, ch3.chapter, ch4.chapter, ch5.chapter, ...STAND_INS, ch11.chapter];
const SCENES = cs11.CUTSCENES;
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = {};
for (const a of [ch1.ANCHORS, ch2.ANCHORS, ch3.ANCHORS, ch4.ANCHORS, ch5.ANCHORS, ch11.ANCHORS]) for (const [k, v] of Object.entries(a ?? {})) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const MISSIONS = ['c11-m1', 'c11-m2', 'c11-m3', 'c11-m4'];
const SPACE_IDS = Object.keys(S.SPACES);
/** The engine contract as chapter 11 uses it: ENGINE_CONTRACT, SCENE_REQUESTS (chapters 4–5's scene ids) and ENGINE_NEEDS. */
const CONTRACT = Object.fromEntries(Object.entries(ENGINE_CONTRACT).map(([k, v]) => [k, { ...v, ...(SCENE_REQUESTS[k] ?? {}), ...(ch11.ENGINE_NEEDS[k] ?? {}) }]));
const BASE = Object.fromEntries(Object.entries(ENGINE_CONTRACT).map(([k, v]) => [k, { ...v, ...(SCENE_REQUESTS[k] ?? {}) }]));
const tx = R.makeText(catalog, (n) => ({ cash: 1350, debtPaid: 1350, debtTotal: 40000, hintTokens: 2, rescued: 41 })[n]);

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
const HELPER_OPS = new Set(['chase', 'escort']);

// ---- mock host (as scripts/story-ch05.test.mjs, plus chase/escort helpers, vehicles in 'near' and engine signals) ----

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
    runner: null, choose: structuredClone(o.choose ?? {}), log: [], outs: [], resets: [], missing: [], ops: [], fails: 0,
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
        case 'near': { const pos = (id) => (id === 'player' ? p : w.actors.get(id) ?? w.vehicles.get(id)); const a = pos(c.a), b = pos(c.b); return !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) <= c.r; }
        case 'meter': { const v = w.meters.get(c.id); return v !== undefined && cmp(v, c.op, c.value); }
        case 'alarm': return cmp(w.alarm, c.op, c.level);
        case 'q': return w.q.has(c.name);
        default: return false;
      }
    },
    exec(a, h, ctx) {
      w.log.push({ k: a.k, id: a.id ?? a.target ?? a.op, step: ctx.step, mission: ctx.mission, restoring: ctx.restoring, a });
      switch (a.k) {
        case 'spawn': if (!w.actors.has(a.id)) { const p = resolve(a.at); if (!p) miss(`spawn place ${a.at}`, ctx); w.actors.set(a.id, { scope: a.scope ?? 'mission', state: STATE[a.behaviour?.k ?? 'idle'], sees: false, down: false, x: p?.x ?? 0, z: p?.z ?? 0, space: p?.space ?? null, tags: a.tags ?? [] }); } break;
        case 'despawn': if (a.id) w.actors.delete(a.id); if (a.tag) for (const [k, v] of [...w.actors]) if (v.tags.includes(a.tag)) w.actors.delete(k); break;
        case 'behave': { const x = w.actors.get(a.id); if (!x) miss(`behave ${a.id}`, ctx); else x.state = STATE[a.b.k]; break; }
        case 'bark': if (!w.actors.has(a.actor)) miss(`bark ${a.actor}`, ctx); break;
        case 'vehicle': {
          const v = w.vehicles.get(a.id), st = { drive: 'driving', park: 'parked', stop: 'stopped', flee: 'fleeing' };
          if (a.model || a.at) { const p = a.at ? resolve(a.at) : null; if (a.at && !p) miss(`vehicle place ${a.at}`, ctx); w.vehicles.set(a.id, { scope: a.model ? (a.scope ?? 'mission') : v?.scope, x: p?.x ?? v?.x ?? 0, z: p?.z ?? v?.z ?? 0, state: st[a.state ?? 'park'] }); }
          else if (!v) miss(`vehicle ${a.id}`, ctx);
          else if (a.state) v.state = st[a.state];
          for (const x of [a.route ?? []].flat()) if (!resolve(x)) miss(`route ${x}`, ctx);
          break;
        }
        case 'tail': if (!w.vehicles.has(a.target) && !w.actors.has(a.target)) miss(`tail ${a.target}`, ctx); w.helpers.set(a.target, a); break;
        case 'photoTarget': case 'clue': case 'eavesdrop': w.helpers.set(a.id, a); break;
        case 'stop': w.helpers.delete(a.id); break;
        case 'teleport': { const p = resolve(a.at); if (!p) miss(`teleport ${a.at}`, ctx); else Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: p.level ?? null, mode: a.vehicle ? 'bike' : 'foot', speed: 0 }); break; }
        case 'space':
          if (a.enter) { const p = resolve(`${a.enter}/${a.link}`) ?? resolve(`${a.enter}/${Object.keys(ANCHORS[a.enter] ?? {})[0]}`); if (!p) miss(`space ${a.enter}`, ctx); Object.assign(w.player, { x: p?.x ?? 0, z: p?.z ?? 0, space: a.enter, mode: 'foot' }); }
          if (a.leave) { const p = a.leave === true ? null : resolve(a.leave); Object.assign(w.player, { space: null, mode: 'foot' }, p ? { x: p.x, z: p.z } : {}); }
          break;
        case 'player': if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'time': w.hour = a.hour; break;
        // chase controllers and escort groups are helpers: their 'arrived' / 'lost' / 'escaped' come from them
        case 'do':
          w.ops.push(a.op);
          if (HELPER_OPS.has(a.op) && typeof a.args?.id === 'string') w.helpers.set(a.args.id, a);
          if (a.op === 'festival') for (const tr of a.args?.troupes ?? []) if (!resolve(tr.at)) miss(`troupe place ${tr.at}`, ctx);
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
      if (scope === 'step') {
        for (const [k, v] of [...w.actors]) if (v.scope === 'step') w.actors.delete(k);
        for (const [k, v] of [...w.vehicles]) if (v.scope === 'step') w.vehicles.delete(k);
        return;
      }
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
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 11 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot ----------------------------------------------------------------------------------------------------

function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), waiting = new Map();
  const kf = (e) => `${key}|${e.type}|${e.id}|${e.evidence ?? ''}`;
  const push = (e) => { const k = kf(e); if (pushed.has(k)) return; pushed.add(k); r.event(e); };
  const moveTo = (at, when, level) => {
    const p = resolve(at);
    assert.ok(p, `place ${at}`);
    Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: level !== undefined ? level : p.level ?? null });
    if (when === 'ride') w.player.mode = 'bike'; else if (when === 'water') w.player.mode = 'swim'; else if (when === 'foot') w.player.mode = 'foot';
  };
  /** An interaction a watcher of the step adds shows up a tick or two after its trigger: wait a little before failing. */
  const offered = (id, kind) => {
    const it = r.view().interacts.find((x) => x.id === id);
    if (it) return it;
    const n = (waiting.get(`${key}|${id}`) ?? 0) + 1;
    waiting.set(`${key}|${id}`, n);
    assert.ok(n < 6, `${step}: ${kind} ${id} is offered`);
    return null;
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
        const pos = (id) => (id === 'player' ? w.player : w.actors.get(id) ?? w.vehicles.get(id));
        const a = pos(c.a), b = pos(c.b);
        assert.ok(a && b, `${step}: near ${c.a} ${c.b}`);
        if (c.a === 'player') Object.assign(w.player, { x: b.x, z: b.z, space: b.space ?? null }); else Object.assign(a, { x: b.x, z: b.z, space: b.space ?? null });
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
          const it = offered(c.id, 'interaction');
          if (!it) return;
          moveTo(it.at, it.when, it.level);
        } else if (c.ev === 'climb') {
          const it = offered(c.id, 'climb');
          if (!it) return;
          moveTo(it.at, it.when, it.level); moveTo(it.to, 'foot');
        } else if (c.ev === 'signal') {
          if (!CONTRACT.signals[c.id]) return; // the latch of the script's own blocking op
        } else if (['arrived', 'lost', 'spotted', 'escaped'].includes(c.ev)) assert.ok(w.helpers.has(c.id), `${step}: helper ${c.id} is running`);
        else if (c.ev === 'choice') return; // raised by the script's own acts
        push({ type: c.ev, id: c.id, ...(c.tag ? { tag: c.tag } : {}), ...(c.where ?? {}) });
        return;
      }
      default: return;
    }
  }
  for (let i = 0; i < (o.maxTicks ?? 16000); i++) {
    r.tick(0.1);
    const v = r.view(), s = r.state();
    if (v.phase === 'done') return { visits, ticks: i };
    if (v.phase === 'failed') {
      const how = o.onFail?.(v, visits[step] ?? 0);
      if (!how) throw new Error(`${s.mission}/${v.step} failed: ${v.failure.reason}`);
      assert.ok(how === 'skip' ? r.skipSection() : r.retry(), `${how} after "${v.failure.reason}"`);
      continue;
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
function play(id, o = {}) {
  const { r, w } = setup(o);
  assert.equal(r.start(id, o.replay ? { replay: true } : undefined), true, `${id} starts`);
  const res = autopilot(r, w, o);
  return { r, w, res, done: completed(w).at(-1), p: r.progress() };
}
const dialogue = (w, id) => w.log.findLast((l) => (l.k === 'dialogue' || l.k === 'call') && l.id === id)?.a.lines.map((l) => l.text);

/** The progress at the end of chapter 10 as far as chapter 11 reads it (chapters 6–10 are other batches). */
function endOfChapter10() {
  const p = F.newProgress();
  for (const m of F.missionOrder(C.CAMPAIGN)) { if (m.chapter >= 11) break; p.completed.push(m.id); }
  Object.assign(p.flags, { arrived: true, dreamRevived: true, helpedBaSau: true, hoaNote: true, sawKho7: true, maiTaken: true, hunter: true, dreamMatte: true, knowsB2: true, filmedLuc: true, rescued: 28 });
  p.evidence.push('ev-don-dem-quang', 'ev-giay-hoa', 'ev-bien-so', 'ev-the-sen-vang', 'ev-kho-7', 'ev-cuong-seo', 'ev-so-mai', 'ev-cap-mai', 'ev-so-do-b2', 'ev-clip-luc', 'ev-luc-noi');
  p.abilities.push('phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill', 'observe', 'faceCover', 'clipCam');
  p.outfits.push('tin-shipper');
  Object.assign(p, { cash: 320, chapter: 10, lunar: { month: 8, day: 15 } });
  p.debt.paid = 1350;
  p.conscience.knockouts = 23;
  return p;
}
const START = endOfChapter10();
const before = new Map();

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapter 11 loads through the registry beside chapters 1–5 and lints clean against the real sites and the contract plus its needs', () => {
  assert.deepEqual([...catalog.missions.keys()].filter((id) => id.startsWith('c11-')), MISSIONS);
  for (const id of MISSIONS) assert.equal(catalog.meta.get(id).chapter, 11);
  const lint = R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: CONTRACT });
  // the stand-ins carry chapters 6–9's cast only, so their missions are reported missing; nothing else may be
  assert.deepEqual(lint.filter((s) => !/^c[6-9]-m\d+: no mission script in chapter [6-9]$/.test(s)), []);
  assert.deepEqual(MISSIONS.map((id) => mission(id).chain ?? null), ['c11-m2', 'c11-m3', 'c11-m4', null], 'the four missions chain: Rằm night into dawn, then the epilogue');
  for (const id of MISSIONS) {
    const m = mission(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.5, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
    assert.ok(m.steps.every((s) => s.minutes > 0));
  }
  assert.deepEqual(MISSIONS.map((id) => mission(id).lethal ?? 'allow'), ['allow', 'fail', 'allow', 'allow'], 'open combat in c11-m1 and c11-m3 (every kill booked), the deck of innocents in c11-m2 fails on any death');
  assert.equal(MISSIONS.reduce((t, id) => t + catalog.meta.get(id).minutes, 0), 24, 'chapter 11 is 24 of the 235 planned minutes');
  assert.deepEqual(MISSIONS.map((id) => catalog.meta.get(id).giver), ['van', 'van', 'van', 'quang']);
  assert.ok(C.builtChapters().includes(11), 'registering chapter 11 adds it to the built chapters');
});

test('ENGINE_NEEDS: every id the chapter adds is used by it, has a lane (the same once it lands in contract.ts), and covers exactly what the lint misses', () => {
  const used = new Set();
  for (const m of ch11.chapter.missions) if (m.start?.outfit) used.add(`outfits:${m.start.outfit}`);
  for (const m of ch11.chapter.missions) for (const [a] of actsOf(m)) {
    if (a.k === 'do') used.add(`ops:${a.op}`);
    if (a.k === 'player' && a.outfit) used.add(`outfits:${a.outfit}`);
    if (a.k === 'stealth' && a.arena) used.add(`arenas:${a.arena}`);
    if (a.k === 'unlock' && a.ability) used.add(`abilities:${a.ability}`);
    if (a.k === 'unlock' && a.outfit) used.add(`outfits:${a.outfit}`);
    if (a.k === 'player' && a.carry) used.add(`carry:${a.carry}`);
    if (a.k === 'vehicle' && a.model) used.add(`models:${a.model}`);
    if (a.k === 'prop' && a.kind) used.add(`props:${a.kind}`);
    const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
    if (b?.k === 'act') used.add(`acts:${b.name}`);
    if (a.k === 'spawn' && a.template) used.add(`templates:${a.template}`);
  }
  for (const m of ch11.chapter.missions) for (const [c] of condsOf(m)) if (c.k === 'on' && c.ev === 'signal') used.add(`signals:${c.id}`);
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) {
    if (k === 'rides') { used.add(`rideModels:${id}`); used.add(`models:${id}`); } else if (k === 'sceneProps') { used.add(`sceneProps:${id}`); used.add(`props:${id}`); } else used.add(`${k}:${id}`);
  }
  const LANES = new Set(['core', 'director', 'spaces', 'stealth', 'vehicles', 'police', 'world', 'ui', 'audio']);
  for (const [kind, ids] of Object.entries(ch11.ENGINE_NEEDS)) {
    assert.ok(kind in ENGINE_CONTRACT, `contract kind ${kind}`);
    for (const [id, [lane, what]] of Object.entries(ids)) {
      assert.ok(used.has(`${kind}:${id}`), `need ${kind} '${id}' is used by chapter 11`);
      assert.ok(LANES.has(lane) && what.length > 10, `need ${kind} '${id}' names its lane and what it does`);
      const landed = ENGINE_CONTRACT[kind][id] ?? SCENE_REQUESTS[kind]?.[id];
      if (landed) assert.equal(landed[0], lane, `${kind} '${id}' landed in contract.ts with the lane chapter 11 asked for`);
    }
  }
  // without the needs, the script lint names each mission-script id of them (so the list is what the contract still lacks)
  const plain = R.lintContent(C.CAMPAIGN, [...STAND_INS, ch1.chapter, ch2.chapter, ch11.chapter], { engine: BASE }).filter((s) => / is not in the engine contract/.test(s));
  const missing = plain.map((s) => s.match(/: (\w+) '([^']+)' is not/).slice(1));
  for (const [kind, id] of missing) assert.ok(ch11.ENGINE_NEEDS[kind]?.[id], `lint without needs: ${kind} '${id}' must be listed in ENGINE_NEEDS`);
  // the cutscene ids the base contract lacks are listed too (rides count as models or ride models, scene props as props)
  const kinds = (k) => (k === 'rides' ? ['models', 'rideModels'] : k === 'sceneProps' ? ['props', 'sceneProps'] : [k]);
  for (const sc of SCENES) for (const [kind, id, where] of SCENE_SCHEMA.sceneVocab(sc)) {
    if (kinds(kind).some((k) => Object.prototype.hasOwnProperty.call(BASE[k] ?? {}, id))) continue;
    assert.ok(kinds(kind).some((k) => ch11.ENGINE_NEEDS[k]?.[id]), `${sc.id} ${where}: ${kind} '${id}' must be listed in ENGINE_NEEDS`);
  }
});

test('texts: every reference resolves, no inline strings, no orphan keys, no real brands, the ring only via {@ring}, lines fit', () => {
  const tables = [common.COMMON, t11.TEXT];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'chapter 11 keys do not shadow the common table');
  for (const m of [ch1, ch2, ch3, ch4, ch5]) for (const k of Object.keys(m.chapter.text ?? {})) assert.ok(!(k in t11.TEXT), `${k} is defined by an earlier chapter`);
  for (const k of Object.keys(t11.TEXT)) assert.match(k, /^(c11m[1234]\.|cast\.|ev\.|j\.)/, `${k}: chapter 11 key namespace`);
  const used = new Set();
  for (const [, s] of deep([ch11.chapter, SCENES])) if (isRef(s)) { assert.ok(keys.has(s.slice(1)) || catalog.text.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const v of Object.values(t11.TEXT)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) { assert.ok(keys.has(m[1]), `missing {@${m[1]}}`); used.add(m[1]); }
  assert.deepEqual(Object.keys(t11.TEXT).filter((k) => !used.has(k)), [], 'every chapter 11 text key is used');
  const inline = [];
  for (const m of ch11.chapter.missions) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...ch11.EVIDENCE, ...ch11.JOURNAL]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of ch11.CAST) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const sc of SCENES) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  for (const m of ch11.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'do') for (const [, v] of deep(a.args ?? {})) if (/[^\x20-\x7e]/.test(v)) inline.push(`${at} ${a.op} arg: ${v}`);
  assert.deepEqual(inline, []);
  for (const k of Object.keys(t11.TEXT)) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/Sen Vàng|SEN VÀNG/.test(t11.TEXT[k]), `${k}: the ring is named through {@ring}/{@ringUpper}, never written out`);
    assert.ok(!/\b(Dream|Vios|GiaoNhanh|GN-\d)/.test(v), `${k}: working names of the bible stay out of the text`);
    assert.ok(!/đèn trời/i.test(v), `${k}: no sky lanterns (festival-blackout-heli.md §1.4)`);
  }
  assert.match(tx('@c11m2.toast.don'), /DO-0815/, 'order codes come from {@code}');
  const lines = [];
  for (const m of ch11.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') lines.push(...a.lines.map((l) => [m.id, l.text]));
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') lines.push([sc.id, c.text]);
  for (const [at, ref] of lines) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of ch11.chapter.missions) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long: ${tx(s.objective)}`);
    for (const s of m.steps) for (const x of s.subs ?? []) assert.ok(tx(x.text).length <= 60, `${m.id}/${s.id}: sub too long`);
    for (const [a, at] of actsOf(m)) {
      if (a.k === 'objective') assert.ok(tx(a.text).length <= 60, `${at}: objective too long`);
      if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long: ${tx(a.text)}`);
      if (a.k === 'sms' || a.k === 'bark' || a.k === 'toast') assert.ok(tx(a.text).length <= 90, `${at}: ${a.k} too long`);
    }
  }
  // the decided lines (story-decisions.md §8 c11-m1, c11-m3 and CS12; 13: Lực loose, Tín exact)
  assert.equal(tx('@c11m1.cs.bl3'), 'Sổ gốc của bả mới là người — sáu chục mấy cái tên, đi đâu hết rồi, chỉ bả biết.');
  assert.equal(tx('@c11m3.cs.b3'), 'Và vì sáu mươi mốt người trong cuốn sổ đó còn chờ đường về.');
  assert.match(tx('@c11m3.cs.b7'), /sáu mươi mốt cái tên.*Giao tận tay\.$/);
  assert.equal(tx('@c11m3.cs.a3'), 'Con là shipper. Con không bán. Con chỉ giao — giao tận tay.');
  assert.equal(tx('@c11m2.cs.cn2'), 'Đường tắt cho kịp giờ giao.');
  assert.match(tx('@c11m4.cs.tit1'), /41 NẠN NHÂN/);
  assert.match(tx('@c11m4.cs.tit2'), /37 TRÊN 61/, 'the news reads the decided 37 of 61 (decision 13)');
  assert.equal(tx('@c11m4.cs.bao'), 'NGƯỜI SHIPPER VÀ TỜ HÓA ĐƠN LÚC NỬA ĐÊM', 'Kiều Anh\'s headline closes the game');
  assert.match(tx('@c11m4.cr.hu'), /hư cấu/, 'the credits carry the fiction notice');
  // decision 13: 41 in all, 30 of them on Rằm night (the 11 of the barge were mùng 10)
  assert.equal(tx('@c11m4.cr.cuu'), 'Đã cứu: 41 người · Riêng đêm Rằm: 30.');
  for (const k of Object.keys(t11.TEXT).filter((x) => x.startsWith('c11m4.'))) {
    const v = tx(`@${k}`);
    assert.ok(!(/Rằm|RẰM/.test(v) && /\b41\b|bốn mươi mốt/i.test(v) && !/\b30\b|ba mươi/i.test(v)), `${k}: "${v}" puts all 41 on Rằm night`);
  }
  // chapter 9's locks open on screen: Diễm testifies, the paper publishes, the task force stops waiting
  assert.match(tx('@c11m2.v3'), /làm chứng.*lên bài/);
  assert.match(tx('@c11m2.v3b'), /bốn mươi tám tiếng/);
});

/** Building footprints of the two towers (city.ts) and the walkable tops the bible uses: the 6.7 m deck and the 22 m pad. */
const inFootprint = (b, x, z, pad = 0) => Math.abs(x - b.x) <= b.w / 2 - pad && Math.abs(z - b.z) <= b.d / 2 - pad;
const asphalt = (x, z) => TERRAIN.strips.some((s) => {
  const along = s.alongX ? x : z, v = s.alongX ? z : x;
  if ((s.lo !== -Infinity && s.lo !== null && along <= s.lo) || (s.hi !== Infinity && s.hi !== null && along >= s.hi)) return false;
  return Math.abs(v - s.at) < s.half && city.inRect(city.LAND, x, z, -0.5);
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
    for (const s of m.steps) {
      for (const x of [s.marker].flat().filter(Boolean)) check(id, x.at, `${id}/${s.id}`);
      for (const x of s.interact ?? []) { check(id, x.at, `${id}/${s.id}`); check(id, x.to, `${id}/${s.id}`); }
    }
    for (const [a, at] of actsOf(m)) {
      for (const k of ['at', 'leave']) if (typeof a[k] === 'string') check(id, a[k], at);
      if (a.k === 'vehicle' && a.route) check(id, a.route, at);
      if (a.k === 'do' && a.op === 'appOrder') for (const k of ['from', 'to']) if (a.args[k]) check(id, a.args[k], at);
      if (a.k === 'do' && a.op === 'gps' && a.args.route) check(id, a.args.route, at);
      if (a.k === 'do' && a.op === 'festival') for (const tr of a.args.troupes ?? []) check(id, tr.at, at);
      if (a.k === 'do' && a.op === 'escort') for (const p of [a.args.spec?.start?.at, a.args.spec?.release]) check(id, p, at);
      if (a.k === 'do' && (a.op === 'deckJump' || a.op === 'heli')) for (const k of ['from', 'toward', 'at']) if (typeof a.args[k] === 'string') check(id, a.args[k], at);
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
    for (const r of refs.get(id)) assert.notEqual(S.SITES[r.split(/[./]/)[0]]?.phase, 'P1', `${id}: ${r} waits for the Quận 4 wiring (the cargo ship stays a "later" upgrade)`);
  }
  // every anchor chapter 11 declares is used by its cutscenes
  const all = new Set();
  for (const sc of SCENES) for (const [, s] of deep(sc)) { const m = s.match(/^set:([\w-]+)\.(\w+)$/); if (m) all.add(`${m[1]}/${m[2]}`); }
  for (const [space, anchors] of Object.entries(ch11.ANCHORS)) for (const a of Object.keys(anchors)) assert.ok(all.has(`${space}/${a}`), `anchor ${space}/${a} is used`);
});

test('chapter places stand on today\'s map: the convoy on the boulevard\'s asphalt, the box doors on the promenade, the deck and the pad on their tops', () => {
  const P = ch11.PLACES, keys = Object.keys(P);
  assert.ok(keys.every((k) => k.startsWith('ch11.')));
  const deck = city.BUILDINGS[154], tower = city.BUILDINGS[155];
  assert.equal(deck.name, 'THÁP PHƯƠNG NAM'); assert.equal(tower.name, 'TÒA THÁP TÀI CHÍNH');
  const road = ['ch11.xe-lanh', 'ch11.suv-truoc', 'ch11.suv-sau', 'ch11.xe-may-1', 'ch11.xe-may-2', 'ch11.xe-may-3', 'ch11.xe-may-4', 'ch11.chu-t', 'ch11.duong-cang', 'ch11.xe-do-di', 'ch11.qua-lan', 'ch11.nhay', 'ch11.nhay-ben'];
  for (const k of road) assert.ok(asphalt(P[k].x, P[k].z) && city.pointClear(P[k].x, P[k].z, P[k].r ?? 0.45), `${k} is clear asphalt`);
  // the column runs north in the boulevard's northbound lanes (x 216, half-width 7: east of the centre line)
  for (const k of road.slice(0, 7)) { assert.ok(P[k].x > 216 && P[k].x < 223, `${k} in the northbound lanes`); assert.equal(P[k].yaw, Math.PI, `${k} faces north`); }
  const zs = road.slice(0, 7).map((k) => P[k].z);
  for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) assert.ok(Math.hypot(P[road[i]].x - P[road[j]].x, zs[i] - zs[j]) >= 2.4, `${road[i]} and ${road[j]} do not overlap`);
  const cab = PLACES['lan-can-bach-dang.cab'], door = P['ch11.cua-thung'];
  assert.ok(TERRAIN.walkable(door.x, door.z) && !asphalt(door.x, door.z) && city.pointClear(door.x, door.z, 0.45), 'the box doors open onto the promenade');
  assert.ok(Math.abs(door.x - cab.x) < 0.01 && cab.z - door.z <= -8 && cab.z - door.z >= -12, 'the box stretches 8–12 m back from the hanging cab');
  for (const k of ['ch11.mai-tiem', 'ch11.bong', 'ch11.su-cv']) assert.ok(TERRAIN.walkable(P[k].x, P[k].z) && !asphalt(P[k].x, P[k].z) && city.pointClear(P[k].x, P[k].z, 0.45), `${k} on clear ground off the road`);
  for (const k of ['ch11.ngam-1', 'ch11.ngam-2']) {
    assert.equal(P[k].y, PLACES['dai-quan-sat-68'].y, `${k} on the deck`);
    assert.ok(Math.abs(P[k].x - deck.x) <= 3.35 && Math.abs(P[k].z - deck.z) <= 3.35 && Math.hypot(P[k].x - deck.x, P[k].z - deck.z) >= 2, `${k} on the 6.7 m deck, clear of the spire`);
  }
  for (const k of ['ch11.ve-si-1', 'ch11.ve-si-2', 'ch11.ve-si-3', 'ch11.su']) {
    assert.equal(P[k].y, PLACES['san-thuong-tai-chinh'].y, `${k} on the pad`);
    assert.ok(inFootprint(tower, P[k].x, P[k].z, 1), `${k} inside the 22 × 22 m roof, 1 m from its edges`);
  }
  for (const [k, p] of Object.entries(P)) {
    assert.ok(['D1', 'D2'].includes(DIST.districtAt(p.x, p.z)?.district.id), `${k} is in An Hòa or Quận 1 (P0)`);
    for (const [s, sp] of Object.entries(SITE_PLACES)) assert.ok(Math.hypot(sp.x - p.x, sp.z - p.z) >= 1, `${k} is clear of ${s}`);
  }
  const used = new Set();
  for (const [, s] of deep([ch11.chapter.missions, SCENES])) if (s.startsWith('ch11.')) used.add(s);
  assert.deepEqual(keys.filter((k) => !used.has(k)), [], 'every chapter place is used');
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
const VICTIMS = new Set(['hoa', 'beti', 'mai', 'su']);
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle', 'thrown']);
test('cutscenes: durations add up, marks, cast, sets and lines resolve, nobody is struck, victims are never animated, every scene is played by its mission', () => {
  const played = new Map();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) if (a.k === 'cutscene') played.set(a.id, [...(played.get(a.id) ?? []), id]);
  assert.equal(SCENE.size, SCENES.length, 'scene ids are unique');
  assert.deepEqual([...played.keys()].sort(), [...SCENE.keys()].sort(), 'every scene the missions play exists, and every scene is played');
  for (const sc of SCENES) {
    assert.deepEqual([...new Set(played.get(sc.id))], [sc.mission], `${sc.id} is played by ${sc.mission} only`);
    const total = sc.shots.reduce((t, s) => t + s.dur, 0);
    assert.ok(Math.abs(total - sc.seconds) < 1e-9, `${sc.id}: shots add to ${total}, not ${sc.seconds}`);
    assert.ok(sc.seconds <= 35, `${sc.id}: a short in-engine scene`);
    for (const s of sc.sets ?? []) assert.ok(S.SPACES[s], `${sc.id}: set ${s}`);
    const props = new Set(), rides = new Set();
    for (const sh of sc.shots) for (const c of sh.cues ?? []) { if (c.k === 'prop') props.add(c.id); if (c.k === 'ride') rides.add(c.id); }
    const mark = (m, where) => {
      if (m && typeof m === 'object') { assert.ok(m.off.length === 3 && m.off.every(Number.isFinite), `${sc.id} ${where}: offset`); return mark(m.at, where); }
      assert.equal(typeof m, 'string', `${sc.id} ${where}: mark`);
      if (m.startsWith('set:')) { const [space, anchor] = m.slice(4).split('.'); assert.ok((sc.sets ?? []).includes(space) && ANCHORS[space]?.[anchor], `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('prop:')) { assert.ok(props.has(m.slice(5)), `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('ride:')) { assert.ok(rides.has(m.slice(5)), `${sc.id} ${where}: ${m} is a ride of the scene`); return; }
      if (m.startsWith('vehicle:')) { assert.ok(actsOf(mission(sc.mission)).some(([a]) => a.k === 'vehicle' && a.id === m.slice(8) && (a.model || a.at)), `${sc.id} ${where}: ${m} is a vehicle ${sc.mission} spawns`); return; }
      if (PLACES[m]) return;
      const [who, joint] = m.split('.');
      assert.ok(who in sc.cast && (joint === undefined || JOINTS.has(joint)), `${sc.id} ${where}: unknown mark ${m}`);
    };
    const cam = (c, where) => {
      if (c.k === 'split') { cam(c.left, where); cam(c.right, where); return; }
      for (const k of c.k === 'snapZoom' ? ['target'] : c.k === 'orbit' ? ['center'] : ['eye', 'look', 'from', 'to', 'target', 'center']) if (c[k] !== undefined) [c[k]].flat().forEach((m) => mark(m, where));
      if (c.k === 'rail') { c.points.forEach((m) => mark(m, where)); c.look.forEach((m) => mark(m, where)); assert.equal(c.points.length, c.look.length); assert.equal(c.points.length, c.fov.length); }
      if (c.k === 'follow') mark(c.target, where);
      if (c.k === 'twoShot') for (const x of [c.a, c.b]) assert.ok(x in sc.cast, `${sc.id} ${where}: two-shot of ${x}`);
      if (c.k === 'ots') for (const x of [c.speaker, c.listener]) assert.ok(x in sc.cast, `${sc.id} ${where}: ots of ${x}`);
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
        if (c.k === 'anim' && VICTIMS.has(sc.cast[c.who])) assert.fail(`${sc.id}: a victim is animated`);
        if (c.k === 'place' && VICTIMS.has(sc.cast[c.who]) && c.pose) assert.ok([...SCENE_SCHEMA.POSES_DIGNIFIED, 'stand', 'sit', 'walk'].includes(c.pose), `${sc.id}: ${c.who} in a dignified pose`);
        if (c.at !== undefined && c.at !== null) mark(c.at, `${where} ${c.k}`);
        if (c.k === 'walk' || c.k === 'ride') c.path.forEach((m) => mark(m, `${where} ${c.k}`));
        if (c.k === 'prop' && c.attach) mark(c.attach, `${where} prop`);
        if (c.k === 'ride' && c.driver) assert.ok(c.driver in sc.cast, `${sc.id}: ride driver ${c.driver}`);
        for (const x of c.k === 'ride' ? c.passengers ?? [] : []) assert.ok(x in sc.cast, `${sc.id}: passenger ${x}`);
        if (c.if) assert.doesNotThrow(() => setup().r.test(c.if));
      }
    });
  }
  // nobody is shot on screen: the guns are props that are never fired (no muzzle flash or gunshot sound)
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) assert.ok(!(c.k === 'sfx' && /shot|gun|bang/.test(c.id)) && !(c.k === 'fx' && /muzzle|blood/.test(c.kind)), `${sc.id}: no gunfire or blood on screen`);
  // CS12 covers its decided site in three short parts around the QTEs; the task-force aircraft never lands (decision 11)
  for (const id of ['cs12_giao_tan_tay', 'cs12_giao_tan_tay_trao', 'cs12_binh_minh']) assert.equal(SCENE.get(id).mission, 'c11-m3');
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'ride') assert.notEqual(c.model, 'heli:task-force', 'the task force holds its hover');
  const loa = SCENE.get('cs12_giao_tan_tay').shots.flatMap((s) => s.cues ?? []).find((c) => c.k === 'say' && c.text === '@c11m3.cs.a4');
  assert.equal(loa.as, '@c11m3.cs.loa', 'the loudspeaker speaks from the hovering helicopter');
  // the epilogue's last scene has LƯƠNG TÂM-dependent lines for both records
  const last = SCENE.get('c11m4-hoang-hon').shots.flatMap((s) => s.cues ?? []).filter((c) => c.k === 'say' && c.if);
  assert.deepEqual(last.map((c) => c.text).sort(), ['@c11m4.cs.h4', '@c11m4.cs.h4b', '@c11m4.cs.h4c', '@c11m4.cs.h5', '@c11m4.cs.h5b', '@c11m4.cs.h5c']);
  // one rule for the whole epilogue: the campaign tier (clean / no kill but an innocent hurt / a kill), as CS06 and c10-m3
  const tierOf = (c) => JSON.stringify(c);
  const clean = tierOf({ k: 'conscience', is: 'clean' });
  assert.deepEqual(last.filter((c) => ['@c11m4.cs.h4', '@c11m4.cs.h5'].includes(c.text)).map((c) => tierOf(c.if)), [clean, clean]);
  // the scene QTEs of the cab fight and CS12 are cues of their scenes (escort-boss-qte.md §3.4 context 'scene')
  const qteIn = (id) => SCENE.get(id).shots.flatMap((sh) => (sh.cues ?? []).filter((c) => c.k === 'qte').map((c) => c.id));
  assert.deepEqual(qteIn('c11m1-ca-bin'), ['c11m1-gun', 'c11m1-wheel']);
  assert.deepEqual(qteIn('cs12_giao_tan_tay'), ['c11m3-grip']);
  assert.deepEqual(qteIn('cs12_giao_tan_tay_trao'), ['c11m3-haul']);
  assert.ok(SCENE.get('c11m1-ca-bin').handoff, 'a skip of the cab fight leaves a play state');
  // Bé Tí comes home to his mother too; Quang answers for what he did; Diễm's sentence is said
  assert.ok(SCENE.get('c11m4-ve-nha').shots.flatMap((sh) => sh.cues ?? []).some((c) => c.k === 'pair' && c.clip === 'hug' && [c.a, c.b].includes('beti')));
  assert.ok(SCENE.get('c11m4-bang-hieu').shots.flatMap((sh) => sh.cues ?? []).some((c) => c.k === 'say' && c.text === '@c11m4.cs.q4'));
  assert.match(tx('@c11m4.diem1'), /án treo/);
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
      // two alternatives of one beat (LƯƠNG TÂM lines) are never on screen together: count them once
      const shownLive = live.filter((o) => !(o !== l && o.alt && live.some((x) => x !== o && x.alt && Math.abs(x.s - o.s) < 1e-9 && live.indexOf(x) < live.indexOf(o))));
      if (shownLive.length > 2) issues.push(`${sc.id} [${l.shot}]: ${shownLive.length} lines on screen at ${l.s.toFixed(1)} s`);
    }
  }
  assert.deepEqual(issues, []);
});

test('cutscenes name only contract ids (plus the chapter\'s needs); slow motion only when frozen; grades map to a filter', async () => {
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

test('every flag and mission variable a chapter 11 condition reads is written by chapters 1–5 or 11 (or is a choice result); items are given before they are taken', () => {
  const written = new Set(), read = [];
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  for (const m of [ch1, ch2, ch3, ch4, ch5, ch11].flatMap((x) => x.chapter.missions)) { for (const [a] of actsOf(m)) note(a); for (const a of m.rewards ?? []) note(a); }
  for (const id of MISSIONS) {
    const m = mission(id);
    for (const [c, at] of condsOf(m)) if (c.k === 'flag') read.push([c.name, at]);
    for (const sc of SCENES.filter((s) => s.mission === id)) for (const sh of sc.shots) for (const cue of sh.cues ?? []) {
      const walk = (c) => { if (!c) return; if (c.k === 'flag') read.push([c.name, sc.id]); (c.of ?? []).forEach(walk); walk(c.c); };
      walk(cue.if);
    }
    for (const f of Object.keys(m.replay?.flags ?? {})) assert.ok(written.has(f), `${id} replay sets ${f}, which play also sets`);
    assert.ok(!condsOf(m).some(([c]) => c.k === 'var'), `${id} reads no mission variable`);
  }
  for (const [n, at] of read) assert.ok(written.has(n), `${at}: reads flag ${n} that nothing sets`);
  const given = new Set(ch11.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a).filter((a) => a.k === 'give').map((a) => a.item)));
  for (const m of ch11.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'take') assert.ok(given.has(a.item), `${at}: takes ${a.item}`);
  // the rescued count: 28 (chapter 10) → 40 (the truck) → 41 (Su); story-decisions.md 13
  const sets = ch11.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a)).filter((a) => a.k === 'flag' && a.name === 'rescued').map((a) => a.value);
  assert.deepEqual([...new Set(sets)], [40, 41]);
});

test('steps only wait for what the script offers: interactions, chase and escort helpers, evidence sources, engine signals and meters; no engine query', () => {
  const METERS = new Set(Object.keys(CONTRACT.meters));
  for (const id of MISSIONS) {
    const m = mission(id), acts = actsOf(m).map(([a]) => a);
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id));
    const helpers = new Set([...acts.filter((a) => a.k === 'tail').map((a) => a.target), ...acts.filter((a) => a.k === 'do' && HELPER_OPS.has(a.op)).map((a) => a.args.id)]);
    const sources = new Set([...acts.filter((a) => a.k === 'evidence').map((a) => a.id), ...acts.filter((a) => (a.k === 'photoTarget' || a.k === 'clue') && a.evidence).map((a) => a.evidence)]);
    const timers = new Set([...acts.filter((a) => a.k === 'timer').map((a) => a.id), ...m.steps.filter((s) => s.timer).map((s) => s.id)]);
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id), `${at}: waits for interaction ${c.id}`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(CONTRACT.signals[c.id] || CONTRACT.ops[c.id], `${at}: signal ${c.id}`);
      if (c.k === 'on' && ['arrived', 'lost', 'spotted', 'escaped'].includes(c.ev)) assert.ok(helpers.has(c.id), `${at}: waits for helper ${c.id}`);
      if (c.k === 'on' && c.ev === 'timer') assert.ok(timers.has(c.id), `${at}: waits for timer ${c.id}`);
      if (c.k === 'evidence' && ch11.EVIDENCE.some((e) => e.id === c.id)) assert.ok(sources.has(c.id), `${at}: evidence ${c.id} has a source in ${id}`);
      if (c.k === 'meter') assert.ok(METERS.has(c.id) || /^(tail|eavesdrop):/.test(c.id), `${at}: meter ${c.id}`);
      assert.notEqual(c.k, 'q', `${at}: chapter 11 waits on no engine query (a stub answers false)`);
    }
    for (const a of acts) if (a.k === 'do') assert.ok(CONTRACT.ops[a.op], `${id}: op ${a.op}`);
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(x.flag || METERS.has(x.id), `${id}/${s.id}: meter ${x.id}`);
  }
  // every chapter 11 evidence can be found in play
  const sources = new Set();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) { if (a.k === 'evidence') sources.add(a.id); if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence); }
  assert.deepEqual(ch11.EVIDENCE.map((e) => e.id).filter((e) => !sources.has(e)), []);
  for (const e of ch11.EVIDENCE) assert.equal(e.chapter, 11);
});

test('stand-ins agree with chapters 6–10 once they are built: the cast chapter 11 assumes is theirs, and nobody else introduces chapter 11\'s new cast', async (t) => {
  const mods = [];
  for (const n of [6, 7, 8, 9, 10]) {
    const url = new URL(`../app/game/story/content/ch${String(n).padStart(2, '0')}.ts`, import.meta.url);
    if (!existsSync(url)) continue;
    try { const m = await import(url.href); mods.push([n, m.chapter ?? m]); } catch (e) { t.diagnostic(`content/ch${n}.ts does not load yet (${e.message.split('\n')[0]})`); }
  }
  if (!mods.length) { t.skip('chapters 6–10 are not built yet'); return; }
  const theirs = new Map(mods.flatMap(([n, m]) => (m.cast ?? []).map((c) => [c.id, n])));
  const mine = new Set(ch11.CAST.map((c) => c.id));
  for (const [id, n] of theirs) assert.ok(!mine.has(id), `cast '${id}' is introduced by chapter ${n} and by chapter 11: keep one`);
  for (const sm of STAND_INS) for (const c of sm.cast) {
    if (!mods.some(([n]) => n === sm.chapter)) continue;
    assert.ok(theirs.has(c.id), `chapter ${sm.chapter} (or a neighbour) defines cast '${c.id}', which chapter 11 speaks with`);
  }
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

const snapshots = [];
const CHECKPOINTS = ['c11-m1/duoi', 'c11-m1/cat-khoa', 'c11-m2/lay-banh', 'c11-m2/giao-banh', 'c11-m3/giu-su', 'c11-m3/nup', 'c11-m3/danh', 'c11-m4/tiem-moi', 'c11-m4/dao-pho', 'c11-m4/ra-ben'];

test('main path: one save plays c11-m1 → c11-m4 end to end on the mock host from the end of chapter 10', () => {
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
    assert.ok(res.ticks < 16000);
    assert.equal(done.result.nonLethal, true);
  }
  const p = r.progress();
  for (const id of MISSIONS) assert.ok(p.completed.includes(id));
  assert.deepEqual(w.missing, [], 'every actor, vehicle and place a step uses exists');
  assert.deepEqual(r.state().issues, []);
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [11], 'the chapter card shows once');
  assert.equal(completed(w).at(-1).chapterUnlocked, null, 'nothing after chapter 11');
  assert.deepEqual(p.lunar, { month: 9, day: 6 }, 'three weeks after Rằm');
  assert.equal(p.flags.rescued, 41, 'ĐÃ CỨU 28 → 40 → 41');
  assert.equal(p.cash, 320 + 40, 'the mooncake order pays 40.000đ');
  assert.deepEqual(p.items, {}, 'the bolt cutters and the rig are used up');
  for (const f of ['truckRescue', 'lucArrested', 'dreamWreckedRam', 'deckDelivered', 'giaoTanTay', 'debtVoid', 'campaignDone', 'luatOngTu', 'titleShipperBongDem']) assert.equal(p.flags[f], true, f);
  assert.equal(p.flags.hoverBranch, undefined, 'a clean landing keeps the easier branch');
  assert.deepEqual([p.flags['choice:maiChon'], p.flags['choice:donMoi']], ['ve-que', 'nhan']);
  for (const e of ['ev-luc-khai', 'ev-so-goc']) assert.ok(p.evidence.includes(e), e);
  for (const j of ['j-xe-lanh', 'j-giao-tan-tay']) assert.ok(p.journal.includes(j), j);
  for (const a of ['luatOngTu', 'chapterSelect']) assert.ok(p.abilities.includes(a), a);
  assert.ok(p.outfits.includes('tin-huyen-thoai'));
  assert.equal(F.conscienceTier(p.conscience), 'clean');
  for (const sc of SCENES) assert.ok(p.seen.includes(sc.id), `${sc.id} played`);
  // the beats in order: the leap, the QTEs, the wreck, the escort, the dive, the landing, CS12 around its QTEs, the credits
  const ops = w.log.filter((l) => l.k === 'do' || l.k === 'cutscene').map((l) => (l.k === 'cutscene' ? `cs:${l.id}` : l.a.op));
  const order = ['chase', 'cs:c11m1-nhay', 'cs:c11m1-ca-bin', 'escort', 'deckJump', 'cs:cs12_giao_tan_tay', 'cs:cs12_giao_tan_tay_trao', 'pillion', 'credits'];
  assert.deepEqual(w.log.filter((l) => l.k === 'do' && l.a.op === 'qte'), [], 'the chapter\'s QTEs are scene cues');
  let k = 0; for (const op of ops) if (op === order[k]) k++;
  assert.equal(k, order.length, `beats in order: ${order.join(' → ')}`);
  assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'bike' && l.a.args.look === 'wrecked'), 'the Dream skids away in the leap');
  assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'bike' && l.a.args.look === 'matte'), 'Quang rebuilds it the way Ông Tư did');
  assert.ok(w.log.some((l) => l.k === 'title' && l.a.text === tx('@c11m4.badge')), 'the "Luật của Ông Tư" badge for a clean campaign');
  assert.deepEqual(dialogue(w, 'c11m4-co-ba').slice(0, 2), [tx('@c11m4.coba1'), tx('@c11m4.coba.sach')], 'Cô Ba\'s line for a clean record');
  const credits = w.log.find((l) => l.k === 'do' && l.a.op === 'credits');
  assert.ok(credits.a.args.lines.every(isRef) && credits.a.args.lines.includes('@c11m4.cr.111'), 'the credits close on the helplines');
  assert.deepEqual(snapshots.map((x) => `${x.id}/${x.step}`), CHECKPOINTS, 'every checkpoint of the main path saved');
  assert.ok(outs(w, 'checkpoint').every((e) => /^Đã lưu · /.test(e.label)));
});

test('resume from every checkpoint of the main path: the setups rebuild the world and the mission completes', () => {
  assert.equal(snapshots.length, CHECKPOINTS.length);
  for (const { id, step, save } of snapshots) {
    const { r, w } = setup({});
    assert.equal(r.resume(save), true, `${id}/${step} resumes`);
    autopilot(r, w);
    assert.equal(completed(w).at(-1)?.id, id, `${id} completes from ${step}`);
    assert.deepEqual(w.missing, [], `${id}/${step}: nothing used before it is rebuilt`);
    assert.equal(w.resets[0], 'checkpoint');
    assert.deepEqual(outs(w, 'fail'), []);
  }
});

test('c11-m1: the convoy lost three times skips to the leap; the truck sliding three times skips to the arrest with the twelve out; the slip and a pedestrian', () => {
  const lost = play('c11-m1', {
    progress: before.get('c11-m1'),
    hold: { duoi: ({ visit, push }) => { if (visit <= 3) { push({ type: 'lost', id: 'doan-xe-lanh' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c11m1.fail.mat')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(lost.res.visits.duoi, 3);
  assert.ok(lost.p.seen.includes('c11m1-nhay'), 'the skip still plays the leap');
  assert.deepEqual([lost.done.stats.skipped, lost.done.result.grade], [1, 'C']);
  assert.ok(lost.w.log.filter((l) => l.k === 'vehicle' && l.id === 'xe-lanh' && l.a.model).length >= 4, 'each retry and the skip rebuild the truck');
  const slides = play('c11-m1', {
    progress: before.get('c11-m1'),
    hold: { 'dan-nguoi': ({ visit, push }) => { if (visit <= 3) { push({ type: 'timer', id: 'xe-truot' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c11m1.fail.truot')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(slides.res.visits['cat-khoa'], 3, 'each slide goes back to the padlock');
  assert.ok(slides.p.seen.includes('c11m1-bat-luc'), 'the arrest plays after the skip');
  assert.deepEqual([slides.p.flags.rescued, slides.p.flags.truckRescue, slides.p.items['kim-cong-luc']], [40, true, undefined], 'the skip counts the twelve and drops the cutters');
  assert.ok(slides.p.journal.includes('j-xe-lanh'));
  const hurt = play('c11-m1', {
    progress: before.get('c11-m1'), optional: ['phieu-xuat'],
    hold: { duoi: ({ visit, push }) => {
      if (visit !== 1) return false;
      push({ type: 'hurt', id: 'nguoi-di-ruoc-den', tag: 'civilian', cause: 'vehicle' });
      for (const id of ['xe-may-1', 'xe-may-2', 'xe-may-3', 'xe-may-4']) push({ type: 'knockout', id, tag: 'biker', cause: 'fist' });
      return false;
    } },
  });
  assert.ok(hurt.p.evidence.includes('ev-phieu-xuat'), 'the slip in the meltwater');
  assert.deepEqual(hurt.done.stats.optional.sort(), ['da-ca-bon', 'phieu-xuat'], 'four bikers kicked off, and the slip');
  assert.equal(hurt.done.result.eye, true, 'Mắt cú for the slip');
  assert.ok(hurt.w.log.some((l) => l.k === 'dialogue' && l.id === 'c11m1-ko'), 'he checks that they breathe');
  assert.ok(hurt.w.log.some((l) => l.k === 'hint' && l.a.text === tx('@c11m1.hint.nguoi')), 'the crowd warning');
  assert.equal(hurt.done.stats.civiliansHurt, 1);
  assert.equal(F.conscienceTier(hurt.p.conscience), 'stained', 'LƯƠNG TÂM remembers');
  for (const run of [lost, slides, hurt]) assert.deepEqual(run.w.missing, []);
});

test('c11-m2: harming the deck staff fails; a blown cover and the missed window replay softly; a missed landing goes through the service door', () => {
  const harm = play('c11-m2', {
    progress: before.get('c11-m2'),
    hold: { 'giao-banh': ({ visit, push }) => { if (visit === 1) { push({ type: 'hurt', id: 'nv-dai-1', tag: 'innocent', cause: 'fist' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c11m2.fail.voToi')); return 'retry'; },
  });
  assert.equal(harm.res.visits['giao-banh'], 2);
  assert.equal(F.conscienceTier(harm.p.conscience), 'clean', 'the retry rolls the harm back');
  const soft = play('c11-m2', {
    progress: before.get('c11-m2'),
    hold: {
      'giao-banh': ({ w, visit }) => { if (visit === 1) { w.meters.set('cover:shipper', 1); return true; } w.meters.set('cover:shipper', 0); return false; },
      'cong-nhay': ({ visit, push }) => { if (visit === 1) { push({ type: 'timer', id: 'cong-nhay' }); return true; } return false; },
    },
  });
  assert.deepEqual(outs(soft.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c11m2.fail.lo'), true], [tx('@c11m2.fail.quayLai'), true]]);
  assert.ok(soft.w.log.findLast((l) => l.step === 'giao-banh' && l.k === 'player' && l.a.carry === 'order-banh-trung-thu'), 'the replay puts the boxes back in his hands');
  const miss = play('c11-m2', { progress: before.get('c11-m2'), branch: { luot: 0 } });
  assert.ok(miss.res.visits.truot, 'the missed landing');
  assert.equal(miss.p.flags.hoverBranch, true);
  assert.ok(miss.w.log.some((l) => l.k === 'do' && l.a.op === 'heli' && l.a.args.mode === 'hover'), 'the helicopter lifts off the pad');
  // the sprint to the service door runs out once: back to the street below the tower, the timer starts again
  const late = play('c11-m2', {
    progress: before.get('c11-m2'), branch: { luot: 0 },
    hold: { truot: ({ visit }) => visit === 1 },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c11m2.fail.catCanh')); return 'retry'; },
  });
  assert.deepEqual([late.res.visits.truot, late.p.flags.hoverBranch], [2, true]);
  for (const run of [harm, soft, miss, late]) { assert.deepEqual(run.w.missing, []); assert.equal(run.done.id, 'c11-m2'); }
  // the harder branch of c11-m3: the stair door, the hover, the tail rotor
  const hover = play('c11-m3', { progress: miss.p });
  assert.ok(hover.res.visits['danh-treo'] && !hover.res.visits.danh);
  assert.ok(hover.w.log.some((l) => l.k === 'vehicle' && l.id === 'heli-sv' && l.a.state === 'stop') && hover.w.log.some((l) => l.k === 'do' && l.a.op === 'heli' && l.a.args.mode === 'hover'), 'the aircraft already hovers over the pad');
  assert.ok(hover.p.seen.includes('cs12_giao_tan_tay') && hover.p.seen.includes('cs12_binh_minh'), 'CS12 plays on the harder branch too');
  assert.equal(hover.p.flags.rescued, 41);
  assert.deepEqual(hover.w.missing, []);
});

test('c11-m3: seen on the pad thrice skips to Su\'s hiding place; a kill is booked, allowed, and changes the epilogue', () => {
  const seen = play('c11-m3', {
    progress: before.get('c11-m3'),
    hold: { 'giu-su': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 've-si-3' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c11m3.fail.lo')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(seen.res.visits.danh && !seen.w.log.some((l) => l.step === 'giu-su' && l.k === 'cutscene'), 'the skip lands at the hiding place of Su, then the fight');
  assert.ok(seen.w.log.some((l) => l.k === 'dialogue' && l.id === 'c11m3-su'), 'Tín still hides Su');
  assert.deepEqual(seen.w.missing, []);
  const shot = play('c11-m3', {
    progress: before.get('c11-m3'),
    hold: { danh: ({ visit, push }) => { if (visit === 1) push({ type: 'kill', id: 've-si-1', tag: 'guard', cause: 'bullet' }); return false; } },
  });
  assert.equal(shot.done.stats.kills, 1);
  assert.equal(shot.done.result.nonLethal, false);
  const epilogue = play('c11-m4', { progress: shot.p, optional: ['ghe-truong'] });
  assert.ok(!epilogue.p.abilities.includes('luatOngTu') && !epilogue.p.flags.luatOngTu, 'no badge after a kill');
  assert.ok(!epilogue.w.log.some((l) => l.k === 'title' && l.a.text === tx('@c11m4.badge')));
  assert.deepEqual(dialogue(epilogue.w, 'c11m4-co-ba').slice(0, 2), [tx('@c11m4.coba1'), tx('@c11m4.coba.vet')]);
  assert.equal(dialogue(epilogue.w, 'c11m4-truong')[1], tx('@c11m4.van.giet'), 'Vân\'s line for a record with a death');
  assert.equal(epilogue.r.test({ k: 'stat', name: 'kills', op: '==', value: 0, scope: 'campaign' }), false, 'Ông Tư\'s other last line plays');
  assert.deepEqual(epilogue.w.missing, []);
});

test('c11-m4: Mai stays, "Ngồi thêm chút nữa" once, every stop, Bà Sáu who was never helped, a heavy record', () => {
  const p = F.cloneProgress(before.get('c11-m4'));
  delete p.flags.helpedBaSau;
  Object.assign(p.conscience, { kills: 3, civiliansHurt: 2 });
  const run = play('c11-m4', { progress: p, choose: { maiChon: 'o-lai', donMoi: ['de-sau', 'nhan'] }, optional: ['ghe-ba-sau', 'ghe-truong', 'ghe-cong-vien'] });
  assert.equal(run.w.log.filter((l) => l.k === 'dialogue' && l.id === 'c11m4-ngoi').length, 1, 'one quiet beat on the pier');
  assert.equal(run.w.log.filter((l) => l.k === 'choice' && l.id === 'donMoi').length, 2, 'the order pings again');
  assert.deepEqual(run.done.stats.optional.sort(), ['ghe-ba-sau', 'ghe-cong-vien', 'ghe-truong']);
  assert.deepEqual(dialogue(run.w, 'c11m4-ba-sau'), [tx('@c11m4.basau.la'), tx('@c11m4.mai.che')]);
  assert.deepEqual(dialogue(run.w, 'c11m4-co-ba').slice(0, 2), [tx('@c11m4.coba1'), tx('@c11m4.coba.nang')], 'Cô Ba\'s line for a heavy record');
  assert.deepEqual(dialogue(run.w, 'c11m4-chon'), [tx('@c11m4.mai.oLai1'), tx('@c11m4.mai.oLai2'), tx('@c11m4.t.oLai')]);
  assert.deepEqual(dialogue(run.w, 'c11m4-cong-vien').slice(-2), [tx('@c11m4.mai.diem1'), tx('@c11m4.mai.diem2')], 'Mai answers Diễm herself');
  assert.ok(!run.w.log.some((l) => l.k === 'vehicle' && l.id === 'xe-do' && l.a.state === 'drive'), 'the coach leaves without her');
  assert.deepEqual(dialogue(run.w, 'c11m4-ngoi'), [tx('@c11m4.think.ngoi1'), tx('@c11m4.think.ngoi2'), tx('@c11m4.think.ngoi3')]);
  assert.ok(run.p.outfits.includes('tin-huyen-thoai') && run.p.abilities.includes('chapterSelect'), 'the city opens whatever the record');
  assert.ok(!run.p.abilities.includes('luatOngTu'));
  assert.deepEqual(run.w.missing, []);
  // a clean record with Bà Sáu helped in chapter 1, Mai going home on the coach
  const home = play('c11-m4', { progress: before.get('c11-m4'), optional: ['ghe-ba-sau', 'ghe-truong'] });
  assert.deepEqual(dialogue(home.w, 'c11m4-ba-sau')[0], tx('@c11m4.basau.nho'));
  assert.equal(dialogue(home.w, 'c11m4-truong')[1], tx('@c11m4.van.sach'));
  assert.ok(home.w.log.some((l) => l.k === 'vehicle' && l.id === 'xe-do' && l.a.state === 'drive'), 'the coach takes her home');
});

test('LƯƠNG TÂM in chapter 11: a chokehold "kill" is a knockout; a real death fails c11-m2 only', () => {
  for (const id of MISSIONS) {
    const { r } = setup({ progress: before.get(id) });
    r.start(id);
    for (let i = 0; i < 3; i++) r.tick(0.1);
    r.event({ type: 'kill', id: 'gac', tag: 'guard', cause: 'choke' });
    r.tick(0.1);
    assert.notEqual(r.view().phase, 'failed', `${id}: a choke never kills`);
    r.event({ type: 'kill', id: 'gac-2', tag: 'guard', cause: 'fall' });
    r.tick(0.1);
    if (id === 'c11-m2') assert.equal(r.view().failure?.reason, tx('@c11m2.fail.voToi'), 'nobody dies on the deck');
    else assert.notEqual(r.view().phase, 'failed', `${id}: open combat is allowed, and booked`);
    assert.equal(r.progress().conscience.kills, before.get(id).conscience.kills + 1, `${id}: the death is booked`);
  }
});

test('replays: every chapter 11 mission replays in a sandbox from its chapter start and its replay block', () => {
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
