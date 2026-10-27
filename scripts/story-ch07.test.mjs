// node --experimental-transform-types --test scripts/story-ch07.test.mjs
// Story content, chapter 7 (SEN TRONG BÙN · SÀ LAN SỐ 07): the chapter loads through the registry beside chapters 1–5
// and lints clean against the real sites and the engine contract plus the ids the chapter asks for
// (content/ch07.ts ENGINE_NEEDS); every text reference resolves (no inline strings, no orphan keys, no real brands,
// the ring named only through {@ring}/{@ringUpper}, subtitles fit and are readable); every place is a site or a
// chapter place, each mission uses the sites story-decisions.md gave it, and the chapter's own places stand where they
// say (deck points on the barge's hull, water points on navigable water outside the hull and every cruising lane);
// the cutscenes are consistent (durations, marks, cast, dignity, cameras out of buildings) and name only contract
// ids; the escort group is the eleven of the bible; the case board ties chapter 7 to chapters 2 and 5 and solves; the
// steps only wait for what the script offers.
// A mock host and an autopilot (each step's own conditions satisfied in turn) play the chapter's main path c7-m1 →
// c7-m3 from an end-of-chapter-6 progress, resume from every checkpoint, and play the alternatives: the rope and the
// bow climb, a blown tourist cover, the searchlight on the swimmer, the deck skipped after three detections, the
// escort skipped after three, the old deckhand harmed, the boat sunk and the chase skipped, the pier strike, the wrong
// deduction, Cô Ba's text, the LƯƠNG TÂM rule and the replays. Chapter 6 is written in parallel: the end-of-chapter-6
// progress assumes only what the bible gives it (Ông Tư's whistle, the dawn of mùng 9) and chapter 7 reads none of
// its flags or evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { readFileSync } from 'node:fs';

// some map modules import './x' without an extension (Vite style): retry as .ts (as scripts/story-sites.test.mjs)
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
const ch7 = await import('../app/game/story/content/ch07.ts');
const cs7 = await import('../app/game/story/cutscenes/ch07.ts');
const texts = await Promise.all(['ch01', 'ch02', 'ch03', 'ch04', 'ch05'].map((n) => import(`../app/game/story/text/vi/${n}.ts`)));
const t7 = await import('../app/game/story/text/vi/ch07.ts');
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT } = await import('../app/game/story/contract.ts');
const city = await import('../app/game/city.ts');
const { TERRAIN } = await import('../app/game/map/terrain.ts');

for (const n of [1, 2, 3, 4, 5]) C.registerChapter(n, () => import(`../app/game/story/content/ch0${n}.ts`));
C.registerChapter(7, () => import('../app/game/story/content/ch07.ts'));
const catalog = await C.loadCatalog([1, 2, 3, 4, 5, 7]);
const MODULES = [ch1.chapter, ch2.chapter, ch3.chapter, ch4.chapter, ch5.chapter, ch7.chapter];
const SCENES = cs7.CUTSCENES;
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const MISSIONS = ['c7-m1', 'c7-m2', 'c7-m3'];
/** The engine contract plus the ids chapter 7 asks for (lanes in content/ch07.ts ENGINE_NEEDS). */
const CONTRACT = Object.fromEntries(Object.entries(ENGINE_CONTRACT).map(([k, v]) => [k, { ...v, ...(ch7.ENGINE_NEEDS[k] ?? {}) }]));
const tx = R.makeText(catalog, (n) => ({ cash: 195, debtPaid: 1350, debtTotal: 40000, hintTokens: 2, rescued: 11 })[n]);
const BOAT_MODELS = new Set(['speedboat', 'speedboat-dark', 'tug', 'police-boat', 'barge-container']);
/** Water places: site spots flagged water and the chapter's places off the deck that lie on the river. */
const WATER = new Set([
  ...Object.entries(S.SITES).flatMap(([id, s]) => Object.entries(s.spots ?? {}).filter(([, p]) => p.water).map(([k]) => `${id}.${k}`)),
  ...Object.entries(ch7.PLACES).filter(([, p]) => !p.level && TERRAIN.inWater(p.x, p.z)).map(([id]) => id),
]);

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
const escortActs = () => MISSIONS.flatMap((id) => actsOf(mission(id)).map(([a]) => a).filter((a) => a.k === 'do' && a.op === 'escort'));

// ---- mock host (story-ch05.test.mjs, plus boats, swimming, escort groups and the river chase) -----------------------

const cmp = (a, op, b) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : op === '!=' ? a !== b : a === b);
const MODE = { foot: ['foot'], bike: ['bike'], car: ['car'], vehicle: ['bike', 'car', 'boat'], boat: ['boat'], swim: ['swim'] };
const STATE = { idle: 'idle', goto: 'goto', patrol: 'patrol', follow: 'follow', escort: 'escort', guard: 'idle', act: 'act', flee: 'flee', surrender: 'surrender', captive: 'captive' };
const BLOCKING = new Set(['cutscene', 'dialogue', 'call', 'title', 'fade', 'teleport', 'choice', 'space']);

const resolve = (at) => (at && typeof at === 'object' ? at : typeof at === 'string' ? PLACES[at] ?? null : null);
function mockWorld(o = {}) {
  const w = {
    runner: null, choose: structuredClone(o.choose ?? {}), log: [], outs: [], resets: [], missing: [], ops: [], fails: 0,
    player: { x: 0, z: 0, mode: 'foot', space: null, level: null, crouched: false, hidden: false, speed: 0, carrying: null, cover: null, visibility: 1, wanted: 0 },
    actors: new Map(), vehicles: new Map([['dream', { x: 0, z: 0, state: 'parked', model: 'dream' }]]), meters: new Map(), q: new Set(), helpers: new Map(),
    groups: new Map(), hour: 12, alarm: 0,
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
          return !c.at || (!!t && Math.hypot(t.x - a.x, t.z - a.z) <= (c.r ?? 2));
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
        case 'spawn': if (!w.actors.has(a.id)) { const p = resolve(a.at); if (!p) miss(`spawn place ${a.at}`, ctx); w.actors.set(a.id, { state: STATE[a.behaviour?.k ?? 'idle'], sees: false, down: false, x: p?.x ?? 0, z: p?.z ?? 0, tags: a.tags ?? [] }); } break;
        case 'despawn': if (a.id) w.actors.delete(a.id); if (a.tag) for (const [k, v] of [...w.actors]) if (v.tags.includes(a.tag)) w.actors.delete(k); break;
        case 'behave': { const x = w.actors.get(a.id); if (!x) miss(`behave ${a.id}`, ctx); else x.state = STATE[a.b.k]; break; }
        case 'bark': if (!w.actors.has(a.actor)) miss(`bark ${a.actor}`, ctx); break;
        case 'vehicle': {
          const v = w.vehicles.get(a.id), st = { drive: 'driving', park: 'parked', stop: 'stopped', flee: 'fleeing' };
          if (a.model || a.at) {
            const p = a.at ? resolve(a.at) : null;
            if (a.at && !p) miss(`vehicle place ${a.at}`, ctx);
            if (!a.model && !v) miss(`vehicle ${a.id} placed before it was spawned`, ctx);
            w.vehicles.set(a.id, { x: p?.x ?? v?.x ?? 0, z: p?.z ?? v?.z ?? 0, state: st[a.state ?? 'park'], model: a.model ?? v?.model });
          } else if (!v) miss(`vehicle ${a.id}`, ctx);
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
        case 'teleport': {
          const p = resolve(a.at);
          if (!p) { miss(`teleport ${a.at}`, ctx); break; }
          if (a.vehicle && !w.vehicles.has(a.vehicle)) miss(`teleport into missing vehicle ${a.vehicle}`, ctx);
          const boat = a.vehicle && BOAT_MODELS.has(w.vehicles.get(a.vehicle)?.model);
          Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: p.level ?? null, speed: 0, mode: a.vehicle ? (boat ? 'boat' : 'bike') : WATER.has(a.at) ? 'swim' : 'foot' });
          break;
        }
        case 'player': if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'time': w.hour = a.hour; break;
        case 'police': if (a.force !== undefined) w.player.wanted = a.force; if (a.reset) w.player.wanted = 0; break;
        case 'do': {
          w.ops.push(a.op);
          if (a.op === 'chase') { w.helpers.set(a.args.id, a); for (const id of a.args.pursuers ?? []) if (!w.vehicles.has(id)) miss(`pursuer ${id}`, ctx); if (!w.vehicles.has(a.args.ride)) miss(`chase ride ${a.args.ride}`, ctx); }
          if (a.op === 'escort') {
            const g = w.groups.get(a.args.id);
            if (a.args.spec && !g) w.groups.set(a.args.id, { state: a.args.spec.start?.aboard ? 'aboard' : 'caged', n: a.args.spec.followers.length });
            const grp = w.groups.get(a.args.id);
            if (!grp) { miss(`escort group ${a.args.id}`, ctx); break; }
            const cmd = a.args.cmd?.k;
            if (cmd === 'free' || cmd === 'follow') grp.state = 'follow';
            if (cmd === 'board') { if (!w.vehicles.has(a.args.cmd.vehicle)) miss(`board ${a.args.cmd.vehicle}`, ctx); grp.state = 'aboard'; }
            if (cmd === 'release') grp.state = 'safe';
          }
          break;
        }
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
      w.helpers.clear(); w.meters.clear(); w.groups.clear(); w.alarm = 0;
      Object.assign(w.player, { hidden: false, crouched: false, level: null, visibility: 1, wanted: 0 });
    },
    emit(e) { w.outs.push(e); if (e.type === 'fail') w.fails++; if (e.type === 'checkpoint') o.onCheckpoint?.(e, w.runner); },
  };
  return w;
}
function setup(o = {}) {
  const w = mockWorld(o);
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 7 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot ----------------------------------------------------------------------------------------------------

function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), answered = new Set();
  const kf = (e) => `${key}|${e.type}|${e.id}|${e.evidence ?? ''}`;
  const push = (e) => { const k = kf(e); if (pushed.has(k)) return; pushed.add(k); r.event(e); };
  const moveTo = (at, when, level) => {
    const p = resolve(at);
    assert.ok(p, `place ${at}`);
    Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: level !== undefined ? level : p.level ?? null });
    if (when === 'ride') w.player.mode = w.player.mode === 'boat' ? 'boat' : 'bike'; else if (when === 'water') w.player.mode = 'swim'; else if (when === 'foot') w.player.mode = 'foot';
  };
  function satisfy(c, def) {
    switch (c.k) {
      case 'all': for (const x of c.of) satisfy(x, def); return;
      case 'any': satisfy(c.of[o.any?.[step] ?? 0], def); return;
      case 'hold': satisfy(c.c, def); return;
      case 'reach': {
        moveTo(c.at);
        if (c.mode === 'bike' || c.mode === 'vehicle') w.player.mode = 'bike'; else if (c.mode === 'boat') w.player.mode = 'boat'; else if (c.mode === 'swim') w.player.mode = 'swim'; else if (c.mode === 'foot') w.player.mode = 'foot';
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
        if (c.at) Object.assign(a, resolve(c.at));
        return;
      }
      case 'near': {
        const a = w.actors.get(c.a), b = c.b === 'player' ? w.player : w.actors.get(c.b);
        assert.ok(a && b, `${step}: near ${c.a} ${c.b}`);
        Object.assign(a, { x: b.x, z: b.z });
        return;
      }
      case 'vehicle': { const v = w.vehicles.get(c.id); assert.ok(v, `vehicle ${c.id} exists for ${step}`); if (c.state) v.state = c.state; if (c.at) Object.assign(v, resolve(c.at)); return; }
      case 'evidence': {
        const src = [...w.helpers.values()].find((h) => (h.k === 'photoTarget' || h.k === 'clue') && h.evidence === c.id);
        assert.ok(src, `${step}: evidence ${c.id} has a live photo target or clue`);
        if (src.k === 'clue') moveTo(src.at, undefined, resolve(src.at).level ?? null);
        push({ type: src.k === 'clue' ? 'examine' : 'photo', id: src.id, evidence: c.id, quality: 0.9 });
        return;
      }
      case 'on': {
        if (pushed.has(kf({ type: c.ev, id: c.id }))) return;
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
        else if (['arrived', 'lost', 'spotted', 'caught', 'escaped'].includes(c.ev) && c.id) assert.ok(w.helpers.has(c.id), `${step}: helper ${c.id} is running`);
        else if (c.ev === 'signal' || c.ev === 'choice') return;
        push({ type: c.ev, id: c.id, ...(c.tag ? { tag: c.tag } : {}), ...(c.where ?? {}) });
        return;
      }
      default: return;
    }
  }
  for (let i = 0; i < (o.maxTicks ?? 12000); i++) {
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
    if (v.phase !== 'run') continue;
    if (`${v.step}|${w.fails}` !== lastVisit) { lastVisit = `${v.step}|${w.fails}`; step = v.step; visits[step] = (visits[step] ?? 0) + 1; key = `${step}#${visits[step]}`; }
    const m = catalog.missions.get(s.mission), def = m.steps.find((x) => x.id === step);
    if (o.hold?.[step]?.({ r, w, visit: visits[step], t: s.t, push, moveTo })) continue;
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

/**
 * The progress at the end of chapter 6 as far as chapter 7 reads it: chapters 1–5 as their own tests leave them, plus
 * what the bible gives chapter 6 (Ông Tư's whistle on its K key, dawn of mùng 9). Chapter 7 reads no chapter-6 flag.
 */
function endOfChapter6() {
  const p = F.newProgress();
  for (const m of F.missionOrder(C.CAMPAIGN)) { if (m.chapter >= 7) break; p.completed.push(m.id); }
  Object.assign(p.flags, {
    arrived: true, dreamRevived: true, plateRight: true, sawBlankOrder: true, hoaNote: true, sawKho7: true, deadlineSL07: true, knowsBarge: true, sawDen: true,
    'choice:caPhe': 'sua', escapeRoute: 'song', reportedToLuc: true, vanAlly: true, dreamMatte: true, knowsQuangForced: true, knowsQuangDebt: true, tailedQuang: true,
    bugPlanted: true, sawMaiBag: true, knowsB2: true, sawSpa: true, filmedLuc: true, sawMoonlight: true,
  });
  p.evidence.push('ev-don-dem-quang', 'ev-giay-hoa', 'ev-bien-so', 'ev-the-sen-vang', 'ev-kho-7', 'ev-bang-trang', 'ev-cuong-noi', 'ev-chi-phuong', 'ev-long-sat', 'ev-tui-cam',
    'ev-cuong-seo', 'ev-goi-nho', 'ev-cctv-0336', 'ev-cctv-0341', 'ev-quang-no', 'ev-hang-don-dem', 'ev-so-do-b2', 'ev-cap-mai', 'ev-anh-cuong-moonlight', 'ev-thang-may-b2',
    'ev-clip-luc', 'ev-luc-noi');
  p.abilities.push('phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill', 'observe', 'lean', 'throw', 'takedown', 'drag', 'phoneSilent', 'luongTam', 'faceCover', 'clipCam', 'whistle');
  p.outfits.push('tin-shipper', 'tin-wrist-wrap');
  Object.assign(p, { cash: 195, chapter: 6, lunar: { month: 8, day: 9 } });
  p.debt.paid = 1350;
  return p;
}
const START = endOfChapter6();
const before = new Map();

/** Today's river fleet read from boats.ts' source (as scripts/story-sites.test.mjs): lane, weave, beam, mode. */
function riverFleet() {
  const src = readFileSync(new URL('../app/game/boats.ts', import.meta.url), 'utf8');
  const lanes = Object.fromEntries([...(src.match(/const LANES = \{([^}]*)\}/)?.[1] ?? '').matchAll(/(\w+):\s*(-?[\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  const beam = Object.fromEntries([...src.matchAll(/(\w+): \{ length: ([\d.]+), beam: ([\d.]+) \}/g)].map((m) => [m[1], Number(m[3])]));
  const boats = [];
  for (const m of src.matchAll(/^\s*(?:const \w+ = )?make\('(\w+)', (-?[\d.]+), (-?[\d.]+|LANES\.\w+), (-?1), ([\d.]+)(?:, '(\w+)')?(?:, ([\d.]+))?/gm)) {
    const lane = m[3].startsWith('LANES.') ? lanes[m[3].slice(6)] : Number(m[3]);
    boats.push({ kind: m[1], x: Number(m[2]), lane, mode: m[6] ?? 'cruise', weave: Number(m[7] ?? 0), beam: beam[m[1]] });
  }
  return boats;
}

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapter 7 loads through the registry beside chapters 1–5 and lints clean against the real sites and the contract plus its needs', () => {
  assert.deepEqual([...catalog.missions.keys()].filter((id) => id.startsWith('c7-')), MISSIONS);
  for (const id of MISSIONS) assert.equal(catalog.meta.get(id).chapter, 7);
  // chapters 3–5 carry their own engine requests (their tests); only chapter 7 and the shared tables are judged here
  const lint = R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: CONTRACT }).filter((s) => !/^c[1-5]-m\d/.test(s));
  assert.deepEqual(lint, []);
  assert.deepEqual(MISSIONS.map((id) => catalog.missions.get(id).chain ?? null), ['c7-m2', 'c7-m3', null], 'one night: recon at dusk, the barge at 22:30, the chase straight after');
  for (const id of MISSIONS) {
    const m = mission(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.5, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
    assert.equal(m.lethal, 'fail', `${id}: LƯƠNG TÂM, nobody dies`);
    assert.ok(m.steps.every((s) => s.minutes > 0));
    assert.equal(m.start.lunar, 10, `${id}: the night of mùng 10`);
  }
  assert.equal(MISSIONS.reduce((t, id) => t + catalog.meta.get(id).minutes, 0), 21, 'chapter 7 is 21 of the 235 planned minutes');
  assert.deepEqual(MISSIONS.map((id) => catalog.meta.get(id).giver), ['van', 'van', 'van']);
  assert.equal(mission('c7-m2').start.weather, 'rain');
  assert.equal(mission('c7-m2').start.hour, 22.5, '22:30, half an hour before "SL 07 — ĐÊM MÙNG 10 — 23:00"');
});

test('ENGINE_NEEDS: every id the chapter adds to the contract is used by it, has a lane, and lints only with it', () => {
  const used = new Set();
  for (const m of ch7.chapter.missions) if (m.start?.outfit) used.add(`outfits:${m.start.outfit}`);
  for (const m of ch7.chapter.missions) {
    for (const [a] of actsOf(m)) {
      if (a.k === 'do') used.add(`ops:${a.op}`);
      if (a.k === 'player' && a.outfit) used.add(`outfits:${a.outfit}`);
      if (a.k === 'unlock' && a.outfit) used.add(`outfits:${a.outfit}`);
      if (a.k === 'stealth' && a.arena) used.add(`arenas:${a.arena}`);
      if (a.k === 'unlock' && a.ability) used.add(`abilities:${a.ability}`);
      if (a.k === 'player' && a.carry) used.add(`carry:${a.carry}`);
      if (a.k === 'vehicle' && a.model) used.add(`models:${a.model}`);
      if (a.k === 'sting') used.add(`stings:${a.id}`);
      if (a.k === 'music' && a.id) used.add(`music:${a.id}`);
      const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
      if (b?.k === 'act') used.add(`acts:${b.name}`);
      if (a.k === 'spawn' && a.template) used.add(`templates:${a.template}`);
    }
    for (const s of m.steps) for (const x of s.meters ?? []) if (!x.flag) used.add(`meters:${x.id}`);
    for (const [c] of condsOf(m)) if (c.k === 'meter') used.add(`meters:${c.id}`);
  }
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) { if (k === 'rides') { used.add(`rideModels:${id}`); used.add(`models:${id}`); } else used.add(`${k}:${id}`); }
  const LANES = new Set(['core', 'director', 'spaces', 'stealth', 'vehicles', 'police', 'world', 'ui', 'audio']);
  for (const [kind, ids] of Object.entries(ch7.ENGINE_NEEDS)) {
    assert.ok(kind in ENGINE_CONTRACT, `contract kind ${kind}`);
    for (const [id, [lane, what]] of Object.entries(ids)) {
      assert.ok(used.has(`${kind}:${id}`), `need ${kind} '${id}' is used by chapter 7`);
      assert.ok(LANES.has(lane) && what.length > 10, `need ${kind} '${id}' names its lane and what it does`);
      const landed = ENGINE_CONTRACT[kind][id];
      if (landed) assert.equal(landed[0], lane, `${kind} '${id}' landed in contract.ts with the lane chapter 7 asked for`);
      for (const other of [ch5.ENGINE_NEEDS, ch4.CONTRACT_REQUESTS]) assert.ok(!other?.[kind]?.[id] || other[kind][id][0] === lane, `${kind} '${id}' is requested by an earlier chapter for another lane`);
    }
  }
  // without the needs the lint names each of them (so the list is exactly what the contract still lacks)
  const plain = R.lintContent(C.CAMPAIGN, MODULES, { engine: ENGINE_CONTRACT }).filter((s) => /^c7-m\d/.test(s) && / is not in the engine contract/.test(s));
  const missing = new Set(plain.map((s) => s.match(/: (\w+) '([^']+)' is not/).slice(1).join(':')));
  for (const k of missing) { const i = k.indexOf(':'), kind = k.slice(0, i), id = k.slice(i + 1); assert.ok(ch7.ENGINE_NEEDS[kind]?.[id], `lint without needs: ${k} must be listed in ENGINE_NEEDS`); }
  // the planned ops chapter 7 builds on: the escort group (stealth lane) and the boat chase (vehicles lane)
  assert.ok(ENGINE_CONTRACT.ops.escort && ENGINE_CONTRACT.ops.chase, 'escort and chase are planned contract ops');
});

test('texts: every reference resolves, no inline strings, no orphan keys, no real brands, the ring only via {@ring}, lines fit', () => {
  const tables = [common.COMMON, ...texts.map((t) => t.TEXT), t7.TEXT];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'text keys are unique across chapters 1–5, 7 and the common table');
  for (const k of Object.keys(t7.TEXT)) assert.match(k, /^(c7m[123]\.|cs07\.|cast\.|ev\.|j\.)/, `${k}: chapter 7 key namespace`);
  const used = new Set();
  const sources = [ch7.chapter, SCENES];
  for (const [, s] of deep(sources)) if (isRef(s)) { assert.ok(keys.has(s.slice(1)) || catalog.text.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const v of Object.values(t7.TEXT)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) { assert.ok(keys.has(m[1]), `missing {@${m[1]}}`); used.add(m[1]); }
  assert.deepEqual(Object.keys(t7.TEXT).filter((k) => !used.has(k)), [], 'every chapter 7 text key is used');
  const inline = [];
  for (const m of ch7.chapter.missions) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...ch7.EVIDENCE, ...ch7.JOURNAL]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of ch7.CAST) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const q of ch7.QUESTIONS) for (const t of [q.prompt, q.hint, ...q.options.map((x) => x.text)]) if (!isRef(t)) inline.push(`question ${q.id}: ${t}`);
  for (const sc of SCENES) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  assert.deepEqual(inline, []);
  for (const k of Object.keys(t7.TEXT)) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/Sen Vàng|SEN VÀNG/.test(t7.TEXT[k]), `${k}: the ring is named through {@ring}/{@ringUpper}, never written out`);
    assert.ok(!/\b(Dream|Vios|GiaoNhanh|GN-\d)/.test(v), `${k}: working names of the bible stay out of the text`);
    assert.ok(!/lô người|món hàng/i.test(v), `${k}: the victims are never cargo`);
  }
  assert.equal(tx('@ev.sl07Gac.t'), 'Sà lan SEN VÀNG 07', 'the barge is named through {@ringUpper}');
  assert.equal(tx('@c7m3.cs.daCuu'), 'ĐÃ CỨU: 11');
  const lines = [];
  for (const m of ch7.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') lines.push(...a.lines.map((l) => [m.id, l.text]));
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') lines.push([sc.id, c.text]);
  for (const [at, ref] of lines) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of ch7.chapter.missions) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long: ${tx(s.objective)}`);
    for (const s of m.steps) for (const x of s.subs ?? []) assert.ok(tx(x.text).length <= 60, `${m.id}/${s.id}: sub too long`);
    for (const [a, at] of actsOf(m)) {
      if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long: ${tx(a.text)}`);
      if (a.k === 'sms' || a.k === 'bark' || a.k === 'toast') assert.ok(tx(a.text).length <= 90, `${at}: ${a.k} too long`);
    }
  }
});

test('places: every place is a site or a chapter place; each mission uses its decided sites; all P0; the chapter places stand on the hull and the river', () => {
  const refs = new Map(MISSIONS.map((id) => [id, new Set()]));
  const check = (id, ref, at) => {
    if (Array.isArray(ref)) { ref.forEach((x) => check(id, x, at)); return; }
    if (typeof ref !== 'string') return;
    refs.get(id).add(ref);
    assert.ok(!ref.includes('/'), `${at}: chapter 7 enters no off-map space (${ref})`);
    assert.ok(PLACES[ref], `${at}: unknown place ${ref}`);
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
      if (a.k === 'photoTarget' && typeof a.subject === 'string' && (a.subject.includes('.') || a.subject.includes('/'))) check(id, a.subject, at);
      if (a.k === 'do' && a.op === 'gps' && a.args.route) { assert.equal(S.SITES[a.args.route]?.kind, 'route', `${at}: gps route ${a.args.route}`); refs.get(id).add(a.args.route); }
      if (a.k === 'do' && a.op === 'chase') { check(id, a.args.safe.at, at); check(id, a.args.tug.block, at); assert.equal(S.SITES[a.args.course]?.kind, 'route'); refs.get(id).add(a.args.course); }
      if (a.k === 'do' && a.op === 'escort' && a.args.spec) { const sp = a.args.spec; check(id, sp.release, at); if (sp.start.at) check(id, sp.start.at, at); }
      const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
      if (b?.k === 'goto') check(id, b.at, at); else if (b?.k === 'guard') check(id, b.post, at); else if (b?.k === 'patrol') b.route.forEach((x) => check(id, x, at));
    }
    for (const [c, at] of condsOf(m)) if (c.at) check(id, c.at, at);
    for (const [a] of actsOf(m)) if (a.k === 'cutscene') for (const [, s] of deep(SCENE.get(a.id))) refs.get(id).add(s);
  }
  const usedSite = (id, site) => [...refs.get(id)].some((r) => r === site || r.startsWith(`${site}.`));
  for (const id of MISSIONS) {
    const ms = S.MISSION_SITES[id];
    assert.equal(ms.phase, 'P0');
    for (const site of ms.sites) assert.ok(usedSite(id, site), `${id} uses ${site} (MISSION_SITES)`);
    for (const r of refs.get(id)) assert.notEqual(S.SITES[r.split('.')[0]]?.phase, 'P1', `${id}: ${r} waits for the Quận 4 wiring`);
  }
  assert.deepEqual(S.CUTSCENE_SITES.cs07_container_07, { mission: 'c7-m2', phase: 'P0', sites: ['sa-lan-07'] });
  // the chapter's own places: 'ch7.*', never shadowing a site; deck points on the hull, water points on open water
  const SL = S.SITES['sa-lan-07'], [x0, x1, z0, z1] = SL.area, fleet = riverFleet(), errors = [];
  for (const [id, p] of Object.entries(ch7.PLACES)) {
    assert.ok(id.startsWith('ch7.') && !SITE_PLACES[id], `${id}: chapter places are 'ch7.*' and never shadow a site`);
    if (p.level === 'deck') {
      if (!(p.x > x0 + 0.3 && p.x < x1 - 0.3 && p.z > z0 + 0.3 && p.z < z1 - 0.3)) errors.push(`${id}: off the hull`);
      if (p.y !== SL.spots.containers.y) errors.push(`${id}: not at deck height`);
      continue;
    }
    if (!TERRAIN.inWater(p.x, p.z) || !TERRAIN.navigable(p.x, p.z, 1.2)) { errors.push(`${id} (${p.x}, ${p.z}): not on navigable water`); continue; }
    if (p.x >= x0 - 0.5 && p.x <= x1 + 0.5 && p.z >= z0 - 0.5 && p.z <= z1 + 0.5) errors.push(`${id}: touches the hull`);
    for (const b of fleet) {
      if (b.mode !== 'cruise' || b.kind === 'barge' || !b.beam) continue;
      if (Math.abs(p.z - b.lane) < b.weave + b.beam / 2 + 1.2) errors.push(`${id} (${p.x}, ${p.z}): in the ${b.kind} lane ${b.lane} sweep`);
    }
  }
  assert.deepEqual(errors, []);
  // the layout follows the sites: the stern ladder below the stern deck, the fenders below the near walk, the chase turn on the route
  const P = ch7.PLACES, ladder = SL.spots.ladder, fenders = SL.spots.fenders;
  assert.ok(Math.abs(P['ch7.thang-lai'].x - ladder.x) < 2 && Math.abs(P['ch7.thang-lai'].z - ladder.z) < 1, 'the stern deck point is above the stern ladder');
  assert.ok(Math.abs(P['ch7.boong-hong'].x - fenders.x) < 0.5 && Math.hypot(P['ch7.boong-hong'].z - fenders.z) < 1.5, 'the climb from the fenders lands on the near walk above them');
  const route = S.SITES['r-thuyen-ruot'].route, verts = []; for (let i = 0; i < route.length; i += 2) verts.push([route[i], route[i + 1]]);
  assert.ok(verts.some(([x, z]) => Math.hypot(x - P['ch7.vong-tay'].x, z - P['ch7.vong-tay'].z) < 6), 'the chase turn is on the chase route');
  assert.ok(Math.hypot(P['ch7.ca-no-an-hoa'].x - S.SITES['ben-an-hoa'].x, P['ch7.ca-no-an-hoa'].z - S.SITES['ben-an-hoa'].spots.rental.z) < 4, 'the night start berth is beside BẾN AN HÒA');
  // a re-pick of the hull (WAVE1-PLAN §1.3: Δz -3.5) moves every derived place with it
  for (const id of ['ch7.cont-07', 'ch7.mui', 'ch7.mui-nuoc', 'ch7.xuong-1', 'ch7.vong-tay']) assert.ok(Math.abs(P[id].z - (z0 + z1) / 2) <= 3.5, `${id} hangs off the hull's centre line`);
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
const VICTIMS = new Set(['hoa', 'beti', 'mai']);
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle']);
test('cutscenes: durations add up, marks, cast and lines resolve, captives stay dignified, every scene is played by its mission', () => {
  const played = new Map();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) if (a.k === 'cutscene') played.set(a.id, [...(played.get(a.id) ?? []), id]);
  assert.equal(SCENE.size, SCENES.length, 'scene ids are unique');
  assert.deepEqual([...played.keys()].sort(), [...SCENE.keys()].sort(), 'every scene the missions play exists, and every scene is played');
  for (const sc of SCENES) {
    assert.deepEqual([...new Set(played.get(sc.id))], [sc.mission], `${sc.id} is played by ${sc.mission} only`);
    const total = sc.shots.reduce((t, s) => t + s.dur, 0);
    assert.ok(Math.abs(total - sc.seconds) < 1e-9, `${sc.id}: shots add to ${total}, not ${sc.seconds}`);
    assert.ok(sc.seconds <= (sc.id.startsWith('cs07') ? 45 : 35), `${sc.id}: a short in-engine scene`);
    assert.equal(sc.sets, undefined, `${sc.id}: chapter 7 plays on the map`);
    const props = new Set();
    for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'prop') props.add(c.id);
    const vehicles = new Set(actsOf(mission(sc.mission)).filter(([a]) => a.k === 'vehicle' && (a.model || a.at)).map(([a]) => a.id));
    const mark = (m, where) => {
      if (m && typeof m === 'object') { assert.ok(m.off.length === 3 && m.off.every(Number.isFinite), `${sc.id} ${where}: offset`); return mark(m.at, where); }
      assert.equal(typeof m, 'string', `${sc.id} ${where}: mark`);
      if (m.startsWith('prop:')) { assert.ok(props.has(m.slice(5)), `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('vehicle:')) { assert.ok(vehicles.has(m.slice(8)), `${sc.id} ${where}: ${m} is a vehicle ${sc.mission} spawns`); return; }
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
    if (sc.handoff) mark(sc.handoff.player.at, 'handoff');
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
        if (c.k === 'pair') {
          for (const x of [c.a, c.b]) assert.ok(x in sc.cast);
          assert.ok(!ROUGH.has(c.clip), `${sc.id}: ${c.clip} on screen`);
          if ([c.a, c.b].some((x) => VICTIMS.has(sc.cast[x]))) assert.ok(['hug', 'hold-hands'].includes(c.clip), `${sc.id}: a victim in a ${c.clip} pair`);
        }
        if (c.k === 'anim') assert.ok(!ROUGH.has(c.clip), `${sc.id}: ${c.clip} on screen (violence happens in play, never staged)`);
        if (c.k === 'anim' && VICTIMS.has(sc.cast[c.who])) assert.fail(`${sc.id}: a victim is animated`);
        if (c.at !== undefined && c.at !== null) mark(c.at, `${where} ${c.k}`);
        if (c.k === 'walk' || c.k === 'ride') c.path.forEach((m) => mark(m, `${where} ${c.k}`));
        if (c.k === 'prop' && c.attach) mark(c.attach, `${where} prop`);
        if (c.if) assert.doesNotThrow(() => setup().r.test(c.if));
      }
    });
  }
  // Mai never appears in chapter 7: only her charcoal lotuses and Hoa's words
  for (const sc of SCENES) assert.ok(!Object.values(sc.cast).includes('mai'), `${sc.id}: Mai is not staged`);
  // CS07 as the bible scripts it: eight shots, 45 s, Hoa, Bé Tí and nine others, the bear, the lotus scrap, "B2." in his head
  const cs = SCENE.get('cs07_container_07');
  assert.deepEqual([cs.shots.length, cs.seconds], [8, 45]);
  const extras = Object.values(cs.cast).filter((v) => typeof v === 'object');
  assert.equal(extras.reduce((n, v) => n + v.count, 0) + ['hoa', 'beti'].filter((c) => Object.values(cs.cast).includes(c)).length, 11, 'eleven in container 07');
  const cues = cs.shots.flatMap((sh) => sh.cues ?? []);
  assert.ok(cues.some((c) => c.k === 'prop' && c.kind === 'torn-bear' && c.attach === 'beti.handL'));
  assert.ok(cues.some((c) => c.k === 'prop' && c.kind === 'lotus-cardboard' && c.attach === 'tin.handR'));
  assert.ok(cues.some((c) => c.k === 'say' && c.text === '@cs07.tin3' && c.ch === 'inner'));
  // the vault is the one slow-motion beat, in a freezeWorld scene, with no QTE; the rescued count is shown once Lực's cars arrive
  assert.ok(SCENE.get('c7m3-nhay').stage.freezeWorld && SCENE.get('c7m3-nhay').shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'slowmo')));
  assert.ok(SCENE.get('c7m3-luc').shots.at(-1).cues.some((c) => c.k === 'card' && c.text === '@c7m3.cs.daCuu'));
});

test('cutscene cameras placed from a site or a chapter place never start inside a building', () => {
  const errors = [];
  const pos = (m) => {
    const at = typeof m === 'string' ? m : m.at, off = typeof m === 'string' ? [0, 0, 0] : m.off, p = PLACES[at];
    return p ? { x: p.x + off[0], y: (p.y ?? 0) + off[1], z: p.z + off[2] } : null;
  };
  const cams = (c) => (c.k === 'split' ? [...cams(c.left), ...cams(c.right)] : [c.eye, c.from, c.to, ...(c.points ?? [])].filter(Boolean));
  for (const sc of SCENES) sc.shots.forEach((sh, i) => {
    for (const m of cams(sh.cam)) {
      const p = pos(m);
      if (!p) continue;
      const hit = city.PLOTS.findIndex((q) => p.x > q.full.minX && p.x < q.full.maxX && p.z > q.full.minZ && p.z < q.full.maxZ && p.y < q.h);
      if (hit >= 0) errors.push(`${sc.id} shot ${i + 1}: camera at (${p.x}, ${p.y}, ${p.z}) is inside building ${hit} (${city.BUILDINGS[hit]?.name})`);
    }
  });
  assert.deepEqual(errors, []);
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

test('the escort group is the eleven of the bible: Hoa leads, the little ones in the middle, handed over at BẾN BẠCH ĐẰNG', () => {
  const specs = escortActs().filter((a) => a.args.spec).map((a) => a.args.spec);
  assert.ok(specs.length >= 2);
  for (const sp of specs) {
    assert.equal(sp.followers.length, 11, '11 rescued from SL 07, Hoa and Bé Tí included (story-decisions.md 13)');
    assert.deepEqual(sp.followers.filter((f) => f.hero).map((f) => f.id), ['hoa', 'beti']);
    for (const f of sp.followers) if (!f.hero) assert.match(f.look, /^captive-(teen|child|adult)$/, `${f.id}: a dignified captive template`);
    for (const f of sp.followers) assert.ok(!['mai', 'su'].includes(f.id), 'Mai is not on the barge');
    assert.equal(sp.order, 'kids-middle');
    assert.equal(sp.release, 'ben-bach-dang.handover');
    assert.ok(new Set(sp.followers.map((f) => f.id)).size === 11);
  }
  // the c7-m3 group starts aboard the boat it was loaded into; the rescued count lands at 11 with the handover
  assert.ok(specs.some((sp) => sp.start.aboard === 'ca-no'));
  const flags = actsOf(mission('c7-m3')).map(([a]) => a).filter((a) => a.k === 'flag' && a.name === 'rescued');
  assert.ok(flags.length && flags.every((a) => a.value === 11), 'ĐÃ CỨU: 11 (then 28, 40, 41 in chapters 10–11)');
  const meter = mission('c7-m3').steps.flatMap((s) => s.meters ?? []).find((x) => x.flag === 'rescued');
  assert.ok(meter && meter.kind === 'count', 'the HUD counter reads the rescued flag');
});

test('every flag and mission variable a chapter 7 condition reads is written by chapters 1–5 and 7 (or is a choice result)', () => {
  const written = new Set(), read = [];
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  for (const mod of MODULES) for (const m of mod.missions) { for (const [a] of actsOf(m)) note(a); for (const a of m.rewards ?? []) note(a); }
  for (const q of catalog.questions.values()) for (const a of q.onCorrect ?? []) note(a);
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
  // items: what is taken was given before (in the chapter), and the deck skip hands over the same things as the deck
  const given = new Set(ch7.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a).filter((a) => a.k === 'give').map((a) => a.item)));
  for (const m of ch7.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'take') assert.ok(given.has(a.item), `${at}: takes ${a.item}`);
  // chapter 7 reads nothing of chapter 6 (written in parallel): every evidence a condition or a question needs is from chapters 1–5 or 7
  const known = new Set([...ch1.chapter.evidence ?? [], ...ch2.EVIDENCE, ...ch3.EVIDENCE, ...ch4.chapter.evidence ?? [], ...ch5.EVIDENCE, ...ch7.EVIDENCE].map((e) => e.id));
  for (const id of MISSIONS) for (const [c, at] of condsOf(mission(id))) if (c.k === 'evidence') assert.ok(known.has(c.id), `${at}: ${c.id}`);
  for (const q of ch7.QUESTIONS) for (const o of q.options) for (const e of o.needs ?? []) assert.ok(known.has(e), `${q.id}: needs ${e}`);
});

test('steps only wait for what the script offers: interactions, climbs, clues, eavesdrops, vehicles, the chase, contract meters; no engine query', () => {
  const METERS = new Set(Object.keys(CONTRACT.meters));
  for (const id of MISSIONS) {
    const m = mission(id), acts = actsOf(m).map(([a]) => a);
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id)), climbs = new Set(specs.filter((x) => x.kind === 'climb').map((x) => x.id));
    for (const x of specs) if (x.kind === 'climb') assert.ok(x.to && PLACES[x.to], `${id}: climb ${x.id} has a far end on the map`);
    const ears = new Set(acts.filter((a) => a.k === 'eavesdrop').map((a) => a.id));
    const chases = new Set(acts.filter((a) => a.k === 'do' && a.op === 'chase').map((a) => a.args.id));
    const vehicles = new Set(acts.filter((a) => a.k === 'vehicle' && a.model).map((a) => a.id));
    const actors = new Set(acts.filter((a) => a.k === 'spawn').map((a) => a.id));
    const sources = new Set([...acts.filter((a) => a.k === 'evidence').map((a) => a.id), ...acts.filter((a) => (a.k === 'photoTarget' || a.k === 'clue') && a.evidence).map((a) => a.evidence),
      ...[...(m.optional ?? []), ...m.steps.flatMap((s) => s.optional ?? [])].flatMap((o) => (o.reward ?? []).filter((a) => a.k === 'evidence').map((a) => a.id))]);
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id) && !climbs.has(c.id), `${at}: waits for interaction ${c.id}`);
      if (c.k === 'on' && c.ev === 'climb') assert.ok(climbs.has(c.id), `${at}: waits for climb ${c.id}`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(CONTRACT.signals[c.id] || CONTRACT.ops[c.id], `${at}: signal ${c.id}`);
      if (c.k === 'on' && c.ev === 'eavesdrop') assert.ok(ears.has(c.id), `${at}: waits for eavesdrop ${c.id}`);
      if (c.k === 'on' && c.ev === 'caught') assert.ok(chases.has(c.id), `${at}: waits for chase ${c.id}`);
      if (c.k === 'on' && c.ev === 'knockout') assert.ok(actors.has(c.id), `${at}: knockout of ${c.id}`);
      if (c.k === 'vehicle') assert.ok(vehicles.has(c.id), `${at}: vehicle ${c.id} is spawned by ${id}`);
      if (c.k === 'evidence' && ch7.EVIDENCE.some((e) => e.id === c.id)) assert.ok(sources.has(c.id), `${at}: evidence ${c.id} has a source in ${id}`);
      if (c.k === 'meter') assert.ok(METERS.has(c.id) || /^(tail|eavesdrop):/.test(c.id), `${at}: meter ${c.id}`);
      assert.notEqual(c.k, 'q', `${at}: chapter 7 waits on no engine query (a stub answers false)`);
    }
    for (const a of acts) if (a.k === 'do') assert.ok(CONTRACT.ops[a.op], `${id}: op ${a.op}`);
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(x.flag || METERS.has(x.id) || ears.has(x.id.slice(10)), `${id}/${s.id}: meter ${x.id} has a helper`);
  }
});

test('case board: chapter 7 cards are evidence with a source, the strings tie them to chapters 2 and 5 and the board solves', () => {
  const ids = [...new Set([...ch7.BOARD_CARDS.map((c) => c.id), ...ch7.BOARD_LINKS.flat()])];
  const board = { id: 'test-ch7', title: '@cast.loc', cards: ids.map((id) => ({ id })), links: ch7.BOARD_LINKS };
  const evidence = new Set(catalog.evidence.keys());
  const all = [...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS, ...ch3.BOARD_CARDS, ...ch4.BOARD_CARDS, ...ch5.BOARD_CARDS, ...ch7.BOARD_CARDS], slots = all.map((c) => c.slot);
  assert.equal(new Set(slots).size, slots.length, `one card per lotus slot across chapters 1–5 and 7 (${slots.join(',')})`);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, 'no card twice');
  assert.ok(ch7.BOARD_CARDS.every((c) => c.slot >= 46), 'chapter 7 leaves slots 34–45 to chapter 6');
  // the whiteboard "SL 07" (ch.2), Hoa's note (ch.2), the red pen line to B2 (ch.5) and Lực's "Dời hết hàng ra sà lan" (ch.5)
  for (const [a, b] of [['ev-bang-trang', 'ev-sl07-gac'], ['ev-loi-hoa', 'ev-giay-hoa'], ['ev-loi-hoa', 'ev-so-do-b2'], ['ev-luc-toi-ben', 'ev-luc-noi']]) {
    assert.ok(ch7.BOARD_LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a)), `${a} ↔ ${b}`);
  }
  assert.deepEqual(D.lintBoard(board, evidence), []);
  const seen = new Set([ids[0]]), todo = [ids[0]];
  while (todo.length) { const a = todo.pop(); for (const [x, y] of board.links) for (const [p, q] of [[x, y], [y, x]]) if (p === a && !seen.has(q)) { seen.add(q); todo.push(q); } }
  assert.equal(seen.size, ids.length, 'every card is on a string');
  const p = F.newProgress(); p.evidence.push(...ids);
  let solved = false;
  for (const [a, b] of board.links) solved = D.linkCards(board, p, a, b, (id) => p.evidence.includes(id)).solved;
  assert.equal(solved, true);
  for (const c of ch7.BOARD_CARDS) assert.equal(ch7.EVIDENCE.find((e) => e.id === c.id)?.chapter, 7, `${c.id} is a chapter 7 card`);
  // every chapter 7 evidence can be found in play
  const sources = new Set();
  for (const id of MISSIONS) {
    const m = mission(id);
    for (const [a] of actsOf(m)) {
      if (a.k === 'evidence') sources.add(a.id);
      if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence);
    }
  }
  assert.deepEqual(ch7.EVIDENCE.map((e) => e.id).filter((e) => !sources.has(e)), []);
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

const snapshots = [];
const CHECKPOINTS = ['c7-m1/tuan-song', 'c7-m2/ra-giua-song', 'c7-m2/boi', 'c7-m2/tren-boong', 'c7-m2/cat-khoa', 'c7-m2/dan-nguoi', 'c7-m2/xuong-ca-no',
  'c7-m3/chay-tay', 'c7-m3/chay-dong', 'c7-m3/ben', 'c7-m3/tron'];

test('main path: one save plays c7-m1 → c7-m3 end to end on the mock host from the end of chapter 6', () => {
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
    assert.ok(res.ticks < 12000);
    assert.equal(done.result.nonLethal, true);
  }
  const p = r.progress();
  for (const id of MISSIONS) assert.ok(p.completed.includes(id));
  assert.deepEqual(w.missing, [], 'every actor, vehicle and place a step uses exists');
  assert.deepEqual(r.state().issues, []);
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [7], 'the chapter card shows once');
  assert.deepEqual(p.lunar, { month: 8, day: 10 });
  assert.equal(F.lunarLabel(p.lunar).countdown, 'CÒN 5 NGÀY TỚI RẰM', 'the HUD countdown begins');
  assert.equal(p.flags.rescued, 11);
  assert.equal(p.cash, 195, 'no rope bought on the main path');
  assert.deepEqual([p.items.zipTie, p.items.tracker, p.items.boltCutters], [6, undefined, undefined], 'the tracker planted, the bolt cutters left on the barge');
  assert.ok(p.outfits.includes('tin-ao-tu'), "Ông Tư's jacket");
  for (const f of ['wearsTuJacket', 'sl07Tagged', 'vanSuspended', 'metLoc', 'reconSL07', 'trackerPlanted', 'hoaToldB2', 'freedSL07', 'lucFramedTin', 'knowsLucRiver', 'rescuedSL07']) assert.equal(p.flags[f], true, f);
  assert.equal(p.flags['choice:coBaSms'], 'lien');
  for (const e of ['ev-sl07-mui', 'ev-sl07-hong', 'ev-sl07-cabin', 'ev-sl07-gac', 'ev-dinh-vi', 'ev-cont-07', 'ev-loi-hoa', 'ev-sen-than-hoa', 'ev-luc-toi-ben']) assert.ok(p.evidence.includes(e), e);
  assert.ok(!p.evidence.includes('ev-gac-sa-lan'), 'the guards\' talk is optional');
  for (const j of ['j-ao-ong-tu', 'j-van-dinh-chi', 'j-loc', 'j-hoa-mai', 'j-da-cuu', 'j-luc-song']) assert.ok(p.journal.includes(j), j);
  assert.deepEqual(p.deductions.aiBaoLuc, { answer: 'cuong', tries: 1 });
  assert.equal(p.conscience.kills, 0);
  assert.equal(F.conscienceTier(p.conscience), 'clean');
  for (const sc of SCENES) assert.ok(p.seen.includes(sc.id), `${sc.id} played`);
  // the night in order: tagged guards on the barge, the boat drifting to the ladder, the group freed, aboard, released
  assert.ok(w.log.some((l) => l.k === 'spawn' && l.id === 'gac-den' && l.mission === 'c7-m2' && l.a.tags.includes('tagged')), 'the recon outlines the night guards');
  assert.ok(w.log.some((l) => l.k === 'vehicle' && l.id === 'ca-no' && l.step === 'boi' && l.a.route?.[0] === 'sa-lan-07.ladder'), 'the boat drifts to the stern ladder');
  const cmds = w.log.filter((l) => l.k === 'do' && l.a.op === 'escort' && l.a.args.cmd).map((l) => `${l.mission}:${l.a.args.cmd.k}`);
  assert.deepEqual(cmds.filter((c) => c.startsWith('c7-m2')), ['c7-m2:free', 'c7-m2:follow', 'c7-m2:board']);
  assert.ok(cmds.includes('c7-m3:release'));
  assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'chase' && l.a.args.controller === 'boatChase' && l.a.args.player.load === 11), 'the loaded boat');
  assert.ok(w.log.some((l) => l.k === 'police' && l.a.force === 1), 'the 1-star evasion along the promenade');
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
    // in the water and on the boat, a restore puts the player where the beat is
    if (step === 'boi') assert.equal(w.log.find((l) => l.k === 'teleport')?.a.at, 'sa-lan-07.cut');
    if (step === 'chay-dong') assert.ok(w.log.some((l) => l.k === 'teleport' && l.a.at === 'ch7.vong-tay' && l.a.vehicle === 'ca-no'));
    if (id === 'c7-m3') assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'escort' && l.a.args.spec?.start?.aboard === 'ca-no'), 'the eleven are rebuilt aboard');
  }
});

test('c7-m1: the rope from the market; a blown tourist cover replays the pass from upstream', () => {
  let bought = false;
  const run = play('c7-m1', {
    progress: before.get('c7-m1'), optional: [],
    hold: {
      'ra-ben': ({ visit, push, moveTo }) => { if (visit === 1 && !bought) { bought = true; moveTo('cho-ven-song', 'foot'); push({ type: 'interact', id: 'mua-day' }); return true; } return false; },
      'tuan-song': ({ w: ww, visit }) => { if (visit === 1) { ww.meters.set('cover:visitor', 1); return true; } ww.meters.set('cover:visitor', 0); return false; },
    },
  });
  assert.equal(run.p.items['day-thung'], 1);
  assert.equal(run.p.cash, before.get('c7-m1').cash - 20, 'the rope costs 20.000đ');
  assert.equal(run.done.result.eye, true, 'Mắt cú: the optional rope');
  assert.deepEqual(outs(run.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c7m1.fail.cover'), true]]);
  const retry = run.w.log.findLast((l) => l.step === 'tuan-song' && l.k === 'teleport');
  assert.deepEqual([retry.a.at, retry.a.vehicle], ['ch7.vao-tuan', 'ca-no'], 'the replay starts the pass again upstream of the barge, in the boat');
  assert.deepEqual(run.w.missing, []);
  // with the rope, c7-m2 offers the bow climb beside the fenders, and the climb leaves the rope on the barge
  const offered = (into) => ({ 'leo-len': ({ r }) => { into.push(...r.view().interacts.map((x) => x.id)); return false; } });
  const withRope = [], withoutRope = [];
  const bow = play('c7-m2', { progress: run.p, any: { 'leo-len': 1 }, hold: offered(withRope) });
  assert.ok(withRope.includes('leo-day') && withRope.includes('leo-lop'), 'two ways aboard');
  assert.ok(bow.p.evidence.includes('ev-loi-hoa') && bow.p.flags.freedSL07);
  assert.equal(bow.p.items['day-thung'], undefined, 'the rope stays on the barge');
  assert.deepEqual(bow.w.missing, []);
  const noRope = play('c7-m2', { progress: before.get('c7-m2'), hold: offered(withoutRope) });
  assert.ok(withoutRope.includes('leo-lop') && !withoutRope.includes('leo-day'), 'without the rope only the fenders');
  assert.deepEqual(noRope.w.missing, []);
});

test('c7-m2: the searchlight on the swimmer, the deck skipped after three detections, the escort skipped after three; the deckhand is innocent', () => {
  const lit = play('c7-m2', {
    progress: before.get('c7-m2'),
    hold: { boi: ({ visit, push, moveTo }) => { if (visit === 1) { moveTo('sa-lan-07.ladder', 'water'); push({ type: 'detected', id: 'den-pha' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c7m2.fail.den')); return 'retry'; },
  });
  assert.equal(lit.res.visits.boi, 2);
  assert.equal(lit.w.log.filter((l) => l.k === 'teleport' && l.a.at === 'sa-lan-07.cut').length, 1, 'the retry puts him back in the water at the cut point');
  const deck = play('c7-m2', {
    progress: before.get('c7-m2'),
    hold: { 'tren-boong': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'gac-sl-3' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c7m2.fail.boong')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(deck.res.visits['cat-khoa'] && deck.res.visits['tren-boong'] === 3);
  assert.deepEqual([deck.p.flags.trackerPlanted, deck.p.items.tracker, deck.p.items.boltCutters], [true, undefined, undefined], 'the skip plants the tracker and spends the bolt cutters');
  assert.ok(deck.p.evidence.includes('ev-dinh-vi') && deck.p.evidence.includes('ev-cont-07'));
  assert.deepEqual([deck.done.stats.skipped, deck.done.result.ghost], [1, false]);
  const line = play('c7-m2', {
    progress: before.get('c7-m2'),
    hold: { 'dan-nguoi': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'den-pha' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c7m2.fail.doan')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(line.res.visits['xuong-ca-no']);
  assert.ok(line.w.log.some((l) => l.step === 'xuong-ca-no' && l.k === 'do' && l.a.op === 'escort' && l.a.args.spec), 'the skip rebuilds the group at the stern');
  assert.ok(line.w.log.some((l) => l.k === 'do' && l.a.op === 'escort' && l.a.args.cmd?.k === 'board'));
  const harm = play('c7-m2', {
    progress: before.get('c7-m2'),
    hold: { 'tren-boong': ({ visit, push }) => { if (visit === 1) { push({ type: 'knockout', id: 'lai-sa-lan', tag: 'innocent', cause: 'fast' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c7m2.fail.lai')); assert.equal(v.failure.canSkip, false); return 'retry'; },
  });
  assert.equal(harm.res.visits['tren-boong'], 2);
  const ghost = play('c7-m2', { progress: before.get('c7-m2'), optional: ['nghe-gac'] });
  assert.ok(ghost.p.evidence.includes('ev-gac-sa-lan'));
  assert.deepEqual([ghost.done.result.ghost, ghost.done.result.eye], [true, true], 'Bóng ma and Mắt cú');
  for (const run of [lit, deck, line, harm, ghost]) { assert.deepEqual(run.w.missing, []); assert.equal(F.conscienceTier(run.p.conscience), 'clean'); }
});

test('c7-m3: a sunk boat replays the leg, the chase can be skipped after three, a pier strike, the wrong guess about Lực, Cô Ba\'s text', () => {
  const sunk = play('c7-m3', {
    progress: before.get('c7-m3'), wrong: { aiBaoLuc: 'quang' }, choose: { coBaSms: 'nguyen' }, optional: ['dam-coc'],
    hold: { 'chay-dong': ({ w: ww, visit }) => { if (visit <= 3) { ww.vehicles.get('ca-no').state = 'wrecked'; return true; } ww.vehicles.get('ca-no').state = 'driving'; return false; } },
    onFail: (v, n) => { assert.equal(v.failure.reason, tx('@c7m3.fail.chim')); return n >= 3 && v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(sunk.res.visits['chay-dong'], 3);
  assert.ok(sunk.res.visits.tron && sunk.p.seen.includes('c7m3-ben') && !sunk.res.visits['chay-dong-4'], 'the skip lands at the pier');
  assert.ok(sunk.w.log.filter((l) => l.k === 'do' && l.a.op === 'chase').length >= 3, 'each retry restarts the chase');
  assert.deepEqual(sunk.p.deductions.aiBaoLuc, { answer: 'cuong', tries: 2 });
  assert.equal(sunk.p.flags['choice:coBaSms'], 'nguyen');
  assert.ok(sunk.w.log.some((l) => l.k === 'sms' && l.a.text === tx('@c7m3.sms.nguyen')));
  assert.equal(sunk.p.flags.rescued, 11, 'the eleven are handed over whatever happened on the river');
  assert.ok(sunk.done.stats.optional.includes('dam-coc'));
  const caught = play('c7-m3', {
    progress: before.get('c7-m3'),
    hold: { 'chay-tay': ({ visit, push }) => { if (visit === 1) { push({ type: 'caught', id: 'duoi-song' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c7m3.fail.bat')); return 'retry'; },
  });
  assert.equal(caught.res.visits['chay-tay'], 2);
  const last = caught.w.log.find((l) => l.k === 'dialogue' && l.id === 'c7m3-cuoi');
  assert.deepEqual(last.a.lines.map((l) => l.text), [tx('@c7m3.think.cuoi1'), tx('@c7m3.think.cuoi2'), tx('@c7m3.think.cuoi3')], 'Hoa told him about B2');
  for (const run of [sunk, caught]) { assert.deepEqual(run.w.missing, []); assert.equal(F.conscienceTier(run.p.conscience), 'clean'); }
});

test('LƯƠNG TÂM in chapter 7: a chokehold "kill" is a knockout; a drowning or a crash kill fails each mission', () => {
  for (const id of MISSIONS) {
    const { r } = setup({ progress: before.get(id) });
    r.start(id);
    for (let i = 0; i < 3; i++) r.tick(0.1);
    r.event({ type: 'kill', id: 'gac', tag: 'guard', cause: 'choke' });
    r.tick(0.1);
    assert.notEqual(r.view().phase, 'failed', `${id}: a choke never kills`);
    r.event({ type: 'kill', id: 'gac-2', tag: 'guard', cause: id === 'c7-m3' ? 'vehicle' : 'drown' });
    r.tick(0.1);
    assert.equal(r.view().failure?.reason, R.LETHAL_REASON, `${id}: Tín không giết ai`);
  }
});

test('replays: every chapter 7 mission replays in a sandbox from its chapter start and its replay block', () => {
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
