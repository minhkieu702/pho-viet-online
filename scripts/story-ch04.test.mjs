// node --experimental-transform-types --test scripts/story-ch04.test.mjs
// Story content, chapter 4 · NGƯỜI TUYỂN DỤNG (c4-m1 Ánh Dương, c4-m2 the ledger, the race and the crash chase,
// c4-m3 the hospital, the walk home, the first BẢNG MANH MỐI and MAI on the wall). The chapter loads through the
// registry beside chapters 1–2 and lints clean against the real sites and the engine contract plus the ids it
// requests (content/ch04.ts CONTRACT_REQUESTS, which must name exactly the ids the contract lacks); every text
// reference resolves (no inline strings, no orphan keys, no real brands, subtitles fit); every place is a site, a
// chapter place checked on today's map, or a declared space anchor, and each mission uses its decided sites;
// cutscene data is consistent (durations, marks, cast, sets, readable subtitles, contract vocabulary, slow motion
// only in a freezeWorld scene, dignified victims); the case board places chapters 1–2's cards with this chapter's,
// lints, is connected and solves. A mock host and an autopilot play chapters 1–2 for a real progress, then
// c4-m1 → c4-m3 on the main path, resume every checkpoint, and play the alternatives: the bluff that saves once,
// the second catch, a wrong bluff, the call running out, a blown cover, the optional clues, the race lost three
// times and skipped, a ram, a lost van skipped to the crash, the xe ôm home, wrong strings and a wrong answer on the
// board, and replays from the chapter start and from nothing but the replay blocks.
// Imports pure modules only; city.ts imports './x' without an extension (Vite style), which a resolve hook retries as .ts.
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

const R = await import('../app/game/story/runner.ts');
const C = await import('../app/game/story/content/index.ts');
const S = await import('../app/game/story/sites.ts');
const F = await import('../app/game/story/flags.ts');
const D = await import('../app/game/story/deduction.ts');
const ch1 = await import('../app/game/story/content/ch01.ts');
const ch2 = await import('../app/game/story/content/ch02.ts');
const ch3 = await import('../app/game/story/content/ch03.ts');
const ch4 = await import('../app/game/story/content/ch04.ts');
const cs1 = await import('../app/game/story/cutscenes/ch01.ts');
const cs2 = await import('../app/game/story/cutscenes/ch02.ts');
const cs4 = await import('../app/game/story/cutscenes/ch04.ts');
const SCENE_SCHEMA = await import('../app/game/story/scene.ts');
const t1 = await import('../app/game/story/text/vi/ch01.ts');
const t2 = await import('../app/game/story/text/vi/ch02.ts');
const t4 = await import('../app/game/story/text/vi/ch04.ts');
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT } = await import('../app/game/story/contract.ts');
const city = await import('../app/game/city.ts');
const { TERRAIN } = await import('../app/game/map/terrain.ts');
const DIST = await import('../app/game/map/districts.ts');

C.registerChapter(1, () => import('../app/game/story/content/ch01.ts'));
C.registerChapter(2, () => import('../app/game/story/content/ch02.ts'));
// chapter 3 is in the tree: its cards and strings are on this chapter's board (BẢNG MANH MỐI shows chapters 1–4)
C.registerChapter(3, () => import('../app/game/story/content/ch03.ts'));
C.registerChapter(4, () => import('../app/game/story/content/ch04.ts'));
const catalog = await C.loadCatalog([1, 2, 3, 4]);
const MODULES = [ch1.chapter, ch2.chapter, ch3.chapter, ch4.chapter];
const SCENES4 = cs4.CUTSCENES;
const SCENES = [...cs1.CUTSCENES, ...cs2.CUTSCENES, ...SCENES4];
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = {};
for (const a of [ch1.ANCHORS, ch2.ANCHORS, ch3.ANCHORS, ch4.ANCHORS]) for (const [k, v] of Object.entries(a)) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const EARLIER = ['c1-m1', 'c1-m2', 'c1-m3', 'c2-m1', 'c2-m2', 'c2-m3'];
const CH3 = ['c3-m1', 'c3-m2', 'c3-m3'];
const CH4 = ['c4-m1', 'c4-m2', 'c4-m3'];
const SPACE_IDS = Object.keys(S.SPACES);
const tx = R.makeText(catalog, (n) => ({ cash: 1350, debtPaid: 1350, debtTotal: 40000, hintTokens: 2 })[n]);
const REQ = ch4.CONTRACT_REQUESTS ?? {};
/** The engine contract as the chapter needs it: story/contract.ts plus this chapter's requests. */
const CONTRACT = Object.fromEntries(Object.entries(ENGINE_CONTRACT).map(([k, v]) => [k, { ...v, ...(REQ[k] ?? {}) }]));
const BOARD = catalog.boards.get('bang-ch4');

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
const has = (o, k) => Object.prototype.hasOwnProperty.call(o ?? {}, k);

// ---- mock host (as scripts/story-content.test.mjs, plus 'near' and the ride helper) ------------------------------

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
    player: { x: 0, z: 0, mode: 'foot', space: null, level: null, crouched: false, hidden: false, speed: 0, carrying: null, cover: null },
    actors: new Map(), vehicles: new Map([['dream', { x: 0, z: 0, state: 'parked' }]]), meters: new Map(), q: new Set(), helpers: new Map(), hour: 12, alarm: 0,
  };
  const miss = (what, ctx) => w.missing.push(`${what} (${ctx.mission}/${ctx.step})`);
  const pos = (id) => (id === 'player' ? w.player : w.actors.get(id) ?? w.vehicles.get(id));
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
        case 'near': { const a = pos(c.a), b = pos(c.b); return !!a && !!b && (a.space ?? null) === (b.space ?? null) && Math.hypot(a.x - b.x, a.z - b.z) <= c.r; }
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
          if (a.route && !resolve(a.route)) miss(`route ${a.route}`, ctx);
          break;
        }
        case 'tail': if (!w.vehicles.has(a.target) && !w.actors.has(a.target)) miss(`tail ${a.target}`, ctx); w.helpers.set(a.target, a); break;
        case 'photoTarget': case 'clue': case 'eavesdrop': w.helpers.set(a.id, a); if (a.k === 'eavesdrop' && typeof a.source === 'string' && !w.actors.has(a.source)) miss(`eavesdrop source ${a.source}`, ctx); break;
        case 'stop': w.helpers.delete(a.id); break;
        // a scene that frames a story vehicle ('vehicle:<id>') needs it in the world, also after a skip or a restore
        case 'cutscene': for (const [, s] of deep(SCENE.get(a.id) ?? {})) if (s.startsWith('vehicle:') && !w.vehicles.has(s.slice(8))) miss(`${a.id} frames ${s}`, ctx); break;
        case 'ride': if (a.driver && !w.actors.has(a.driver)) miss(`ride driver ${a.driver}`, ctx); if (a.to && !resolve(a.to)) miss(`ride to ${a.to}`, ctx); w.helpers.set(`ride:${a.mode}`, a); break;
        case 'teleport': { const p = resolve(a.at); if (!p) miss(`teleport ${a.at}`, ctx); else Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: p.level ?? null, mode: a.vehicle ? 'bike' : 'foot', speed: 0 }); break; }
        case 'space':
          if (a.enter) { const p = resolve(`${a.enter}/${a.link}`) ?? resolve(`${a.enter}/${Object.keys(ANCHORS[a.enter] ?? {})[0]}`); if (!p) miss(`space ${a.enter}`, ctx); Object.assign(w.player, { x: p?.x ?? 0, z: p?.z ?? 0, space: a.enter, mode: 'foot' }); }
          if (a.leave) { const p = a.leave === true ? null : resolve(a.leave); if (a.leave !== true && !p) miss(`leave to ${a.leave}`, ctx); Object.assign(w.player, { space: null, mode: 'foot' }, p ? { x: p.x, z: p.z } : {}); }
          break;
        case 'player': if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover; if (a.outfit) w.player.outfit = a.outfit; if (a.lock !== undefined) w.player.lock = a.lock; if (a.pose !== undefined) w.player.pose = a.pose; break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'time': w.hour = a.hour; break;
        case 'do': w.ops.push(a.op); break;
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
      Object.assign(w.player, { hidden: false, crouched: false, level: null });
    },
    emit(e) { w.outs.push(e); if (e.type === 'fail') w.fails++; if (e.type === 'checkpoint') o.onCheckpoint?.(e, w.runner); },
  };
  return w;
}
function setup(o = {}) {
  const w = mockWorld(o);
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 3 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot: satisfies each step's own conditions -------------------------------------------------------------

/**
 * Drives the running mission to completion (scripts/story-content.test.mjs's autopilot, extended): `near` moves the
 * player beside the vehicle or actor; optional clues are only taken while their photo target or clue is live; the
 * board is solved by its strings and hypotheses (o.boardWrong first draws a wrong string); o.wrong answers a
 * question wrongly once. Interactions must be offered and evidence must come from a live source, so a script
 * that waits for something it never offers fails here. Hooks can hold a step (fail paths).
 */
function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), answered = new Set(), wrongDrawn = new Set();
  const push = (e) => { const k = `${key}|${e.type}|${e.id}`; if (pushed.has(k)) return; pushed.add(k); r.event(e); };
  const moveTo = (at, when, level) => {
    const p = resolve(at);
    assert.ok(p, `place ${at}`);
    Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: level !== undefined ? level : p.level ?? null });
    if (when === 'ride') w.player.mode = 'bike'; else if (when === 'water') w.player.mode = 'swim'; else if (when === 'foot') w.player.mode = 'foot';
  };
  const liveSource = (id) => [...w.helpers.values()].find((h) => (h.k === 'photoTarget' || h.k === 'clue') && h.evidence === id);
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
      case 'actor': { const a = w.actors.get(c.id); assert.ok(a, `actor ${c.id} exists for ${step}`); if (c.state) a.state = c.state; if (c.sees !== undefined) a.sees = c.sees; return; }
      case 'vehicle': { const v = w.vehicles.get(c.id); assert.ok(v, `vehicle ${c.id} exists for ${step}`); if (c.state) v.state = c.state; if (c.at) Object.assign(v, { x: resolve(c.at).x, z: resolve(c.at).z }); return; }
      case 'near': {
        const target = c.a === 'player' ? c.b : c.a, t = w.vehicles.get(target) ?? w.actors.get(target);
        assert.ok(t, `${step}: ${target} exists to ride beside`);
        Object.assign(w.player, { x: t.x + Math.min(1, c.r / 2), z: t.z, space: t.space ?? null });
        return;
      }
      case 'evidence': {
        const src = liveSource(c.id);
        assert.ok(src, `${step}: evidence ${c.id} has a live photo target or clue`);
        if (src.k === 'clue') moveTo(src.at);
        push({ type: src.k === 'clue' ? 'examine' : 'photo', id: src.id, evidence: c.id, quality: 0.9 });
        return;
      }
      case 'on': {
        if (pushed.has(`${key}|${c.ev}|${c.id}`)) return;
        if (c.ev === 'interact') {
          const it = r.view().interacts.find((x) => x.id === c.id);
          assert.ok(it, `${step}: interaction ${c.id} is offered`);
          moveTo(it.at, it.when, it.level);
        } else if (c.ev === 'climb') {
          const it = r.view().interacts.find((x) => x.id === c.id);
          assert.ok(it && it.kind === 'climb' && it.to, `${step}: climb ${c.id} is offered with a far end`);
          moveTo(it.at, it.when, it.level);
          moveTo(it.to, 'foot');
        } else if (c.ev === 'cutscene') {
          const wt = (def.watchers ?? []).find((x) => x.do.some((a) => a.k === 'cutscene' && a.id === c.id));
          assert.ok(wt, `${step}: a watcher plays ${c.id}`);
          satisfy(wt.when, def);
          return;
        } else if (c.ev === 'eavesdrop') assert.ok(w.helpers.has(c.id), `${step}: eavesdrop ${c.id} is running`);
        else if (['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(w.helpers.has(c.id), `${step}: tail ${c.id} is running`);
        else if (c.ev === 'alight' || c.ev === 'ride') {
          // the ride starts from a watcher one tick after the call; until then there is nothing to get off (a ride never offered stalls the run)
          const ride = [...w.helpers.values()].find((h) => h.k === 'ride');
          if (!ride) return;
          if (c.ev === 'alight' && ride.to) moveTo(ride.to, 'foot');
        }
        push({ type: c.ev, id: c.id, ...(c.tag ? { tag: c.tag } : {}), ...(c.where ?? {}) });
        return;
      }
      default: return;
    }
  }
  for (let i = 0; i < (o.maxTicks ?? 9000); i++) {
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
      if (o.boardWrong && !wrongDrawn.has(sess.id)) { wrongDrawn.add(sess.id); r.ui.link(...o.boardWrong); }
      for (const [a, b] of def.links) r.ui.link(a, b);
      for (const h of def.hypotheses ?? []) r.ui.propose(h.id, h.needs);
    }
    if (v.phase !== 'run') continue;
    if (`${v.step}|${w.fails}` !== lastVisit) { lastVisit = `${v.step}|${w.fails}`; step = v.step; visits[step] = (visits[step] ?? 0) + 1; key = `${step}#${visits[step]}`; }
    const mission = catalog.missions.get(s.mission), def = mission.steps.find((x) => x.id === step);
    if (o.hold?.[step]?.({ r, w, visit: visits[step], t: s.t, push })) continue;
    for (const id of o.optional ?? []) {
      const od = [...(def.optional ?? []), ...(mission.optional ?? [])].find((x) => x.id === id);
      if (od && !s.stats.optional.includes(id) && (od.when.k !== 'evidence' || liveSource(od.when.id))) satisfy(od.when, def);
    }
    const order = o.subOrder?.[step], subs = (def.subs ?? []).filter((x) => !x.optional).sort((a, b) => (order ? order.indexOf(a.id) - order.indexOf(b.id) : 0)), doneSubs = new Set(v.subs.filter((x) => x.done).map((x) => x.id));
    const next = subs.find((x) => !doneSubs.has(x.id));
    if (next) { satisfy(next.done, def); continue; }
    const b = o.branch?.[step] ?? (def.done?.k === 'never' ? 0 : undefined);
    if (b !== undefined && def.branch?.[b]) satisfy(def.branch[b].when, def);
    else if (def.done) satisfy(def.done, def);
  }
  throw new Error(`${r.state().mission} did not finish (stuck at ${r.view().step}, phase ${r.view().phase}, visits ${JSON.stringify(visits)}, fails ${w.fails}, session ${JSON.stringify(r.state().session)})`);
}
const outs = (w, type) => w.outs.filter((e) => e.type === type);
const completed = (w) => outs(w, 'complete');
function play(id, o = {}) {
  const { r, w } = setup(o);
  assert.equal(r.start(id, o.replay ? { replay: true } : undefined), true, `${id} starts`);
  const res = autopilot(r, w, o);
  return { r, w, res, done: completed(w).at(-1), p: r.progress() };
}
/** Chapter 2's tail: the van passes the patrol-car junction and the bridge before arriving. */
const tailBeats = ({ w, t }) => {
  const van = w.vehicles.get('van-51d');
  if (t < 0.15) Object.assign(van, resolve('nga-tu-108-54'));
  else if (t > 0.45 && t < 0.55) Object.assign(van, resolve('cau-khanh-hoi'));
  return t < 0.9;
};
const EARLY_HOLD = { 'bam-duoi': tailBeats };
/** Moves the player into the back office in view of the secretary (a catch). */
const catchIn = (w) => { const p = resolve('anh-duong-office/backOffice'); Object.assign(w.player, { x: p.x, z: p.z, space: p.space }); w.actors.get('thu-ky').sees = true; };
/** Counts entries into a step from its own clock: t restarts at 0 on every entry, also a goto back from the bluff (which never reaches its run phase). */
const entries = () => { let n = 0, last = Infinity; return (t) => { if (t < last) n++; last = t; return n; }; };
const before = new Map();
const snapshots = [];

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapter 4 loads through the registry beside chapters 1–2, covers its index and lints clean against the sites and the contract plus its requests', () => {
  assert.deepEqual([...catalog.missions.keys()], [...EARLIER, ...CH3, ...CH4]);
  for (const id of CH4) assert.equal(catalog.meta.get(id).chapter, 4);
  assert.deepEqual(R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: CONTRACT }), [], 'places are sites and every engine id is in the contract or requested');
  assert.deepEqual(CH4.map((id) => catalog.missions.get(id).chain ?? null), ['c4-m2', 'c4-m3', null], 'the chapter is one continuous fall');
  assert.equal(catalog.meta.get('c4-m1').giver, 'app');
  for (const id of CH4) {
    const m = catalog.missions.get(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.5, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
    assert.ok(m.steps.every((s) => s.minutes > 0));
  }
  assert.equal(CH4.reduce((t, id) => t + catalog.meta.get(id).minutes, 0), 19, 'chapter 4 is 19 of the 235 planned minutes');
  assert.deepEqual(C.CAMPAIGN.chapters.find((c) => c.n === 4).lunar, { month: 8, day: 4 });
});

test('the contract requests name exactly the engine ids chapter 4 uses that story/contract.ts lacks', () => {
  // gameplay ids: what the lint rejects against the plain contract
  const missing = new Set();
  for (const i of R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: ENGINE_CONTRACT })) {
    const m = i.match(/: (\w+) '([^']+)' is not in the engine contract/);
    assert.ok(m, `only contract misses with the plain contract: ${i}`);
    missing.add(`${m[1]}:${m[2]}`);
  }
  // cutscene ids: ride models may be models or rideModels, scene props may be props or sceneProps
  const alt = { rides: ['models', 'rideModels'], sceneProps: ['props', 'sceneProps'] };
  for (const sc of SCENES4) for (const [kind, id] of SCENE_SCHEMA.sceneVocab(sc)) {
    const kinds = alt[kind] ?? [kind];
    if (!kinds.some((k) => has(ENGINE_CONTRACT[k], id))) missing.add(`${kind}:${id}`);
  }
  const requested = new Set(), lanes = new Set(['core', 'director', 'spaces', 'stealth', 'vehicles', 'police', 'world', 'ui', 'audio']);
  for (const [kind, ids] of Object.entries(REQ)) for (const [id, entry] of Object.entries(ids)) {
    assert.ok(kind in ENGINE_CONTRACT, `request kind ${kind}`);
    assert.ok(Array.isArray(entry) && lanes.has(entry[0]) && entry[1].length > 10, `${kind}:${id} names its lane and what the engine does`);
    if (has(ENGINE_CONTRACT[kind], id)) assert.equal(ENGINE_CONTRACT[kind][id][0], entry[0], `${kind}:${id} is already in the contract (lane ${ENGINE_CONTRACT[kind][id][0]})`);
    else requested.add(`${kind}:${id}`);
  }
  const covered = (need) => { const [kind, id] = need.split(':'); return (alt[kind] ?? [kind]).some((k) => requested.has(`${k}:${id}`)); };
  for (const need of missing) assert.ok(covered(need), `${need} is used but neither in story/contract.ts nor requested`);
  for (const req of requested) {
    const [kind, id] = req.split(':');
    const back = Object.entries(alt).find(([, ks]) => ks.includes(kind))?.[0];
    assert.ok(missing.has(req) || (back && missing.has(`${back}:${id}`)), `request ${req} is not used by chapter 4 (stale)`);
  }
  // planned contract ids the chapter relies on are spelled as the contract has them
  assert.ok(has(ENGINE_CONTRACT.ops, 'chase') && /keepUp/.test(ENGINE_CONTRACT.ops.chase[1]), 'the keepUp chase is the planned vehicles op');
});

test('texts: every reference resolves, content holds no inline strings, no orphan keys, no real brands, lines fit', () => {
  const tables = [common.COMMON, t1.TEXT, t2.TEXT, t4.TEXT];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'text keys are unique across chapters');
  const used = new Set();
  for (const [, s] of deep([ch4.chapter, SCENES4])) if (isRef(s)) { assert.ok(keys.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const v of Object.values(t4.TEXT)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) { assert.ok(keys.has(m[1]), `missing {@${m[1]}}`); used.add(m[1]); }
  assert.deepEqual(Object.keys(t4.TEXT).filter((k) => !used.has(k)), [], 'every chapter 4 key is used by chapter 4');
  const inline = [];
  for (const m of ch4.chapter.missions) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...ch4.EVIDENCE, ...ch4.JOURNAL]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of ch4.CAST) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const q of ch4.QUESTIONS) for (const t of [q.prompt, q.hint, ...q.options.map((x) => x.text)]) if (!isRef(t)) inline.push(`question ${q.id}: ${t}`);
  for (const b of ch4.BOARDS) for (const t of [b.title, ...(b.hypotheses ?? []).flatMap((h) => [h.text, h.hint])]) if (!isRef(t)) inline.push(`board ${b.id}: ${t}`);
  for (const sc of SCENES4) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  for (const m of ch4.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'do') for (const [k, s] of deep(a.args)) if (typeof s === 'string' && /[^\x20-\x7e]/.test(s)) inline.push(`${at} ${a.op}.${k}: ${s}`);
  assert.deepEqual(inline, []);
  for (const k of Object.keys(t4.TEXT)) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/giao\s*nhanh/i.test(v), `${k}: "giao nhanh" trips the brand lint`);
    assert.ok(!/Sen Vàng|SEN VÀNG/.test(t4.TEXT[k]), `${k}: the ring is named through {@ring}/{@ringUpper}`);
    assert.ok(!/GiaoNhanh|GN-0|Quận Trung Tâm|KHO LẠNH SỐ 9|kho lạnh số 9|Phương Nam/i.test(t4.TEXT[k].replace(/THÁP PHƯƠNG NAM/g, '')), `${k}: a name story-decisions.md retired`);
  }
  assert.match(tx('@c4m1.toast.don'), /DO-1446/, 'order codes come from {@code}');
  assert.match(tx('@c4m1.cs.d2'), /Nhà nợ bên Sen Vàng\.$/);
  assert.match(tx('@c4m3.q.quang'), /DO-04/);
  const lines = [];
  for (const m of ch4.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') lines.push(...a.lines.map((l) => [m.id, l.text]));
  for (const m of ch4.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'sms' || a.k === 'bark') lines.push([m.id, a.text]);
  for (const sc of SCENES4) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') lines.push([sc.id, c.text]);
  for (const [at, ref] of lines) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of ch4.chapter.missions) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long`);
    for (const [a, at] of actsOf(m)) if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long`);
    for (const [a, at] of actsOf(m)) if (a.k === 'choice') for (const op of a.options) assert.ok(tx(op.text).length <= 70, `${at}: choice option too long`);
  }
});

test('places: every place is a site, a chapter place or a declared anchor; the missions use their decided sites; the chapter places stand on the map', () => {
  const refs = new Map(CH4.map((id) => [id, new Set()]));
  const check = (id, ref, at) => {
    if (typeof ref !== 'string') return;
    refs.get(id).add(ref);
    if (ref.includes('/')) {
      const [space, anchor] = ref.split('/');
      assert.ok(S.SPACES[space], `${at}: unknown space ${space}`);
      assert.ok(ANCHORS[space]?.[anchor], `${at}: anchor ${anchor} is not declared for ${space}`);
    } else assert.ok(PLACES[ref], `${at}: unknown place ${ref}`);
  };
  for (const id of CH4) {
    const m = catalog.missions.get(id);
    check(id, m.start?.at, id);
    if (m.start?.space) refs.get(id).add(`${m.start.space}/`);
    for (const s of m.steps) {
      for (const x of [s.marker].flat().filter(Boolean)) check(id, x.at, `${id}/${s.id}`);
      for (const x of s.interact ?? []) check(id, x.at, `${id}/${s.id}`);
    }
    for (const [a, at] of actsOf(m)) {
      for (const k of ['at', 'leave', 'to']) if (typeof a[k] === 'string') check(id, a[k], at);
      if (a.k === 'vehicle' && typeof a.route === 'string') check(id, a.route, at);
      if (a.k === 'do' && a.args?.route) check(id, a.args.route, at);
      if (a.k === 'do' && a.args?.window?.at) check(id, a.args.window.at, at);
      if (a.k === 'do' && a.op === 'appOrder') for (const k of ['from', 'to']) if (a.args[k]) check(id, a.args[k], at);
      if (a.k === 'photoTarget' && typeof a.subject === 'string' && /[./]/.test(a.subject)) check(id, a.subject, at);
      if (a.k === 'space' && a.enter) refs.get(id).add(`${a.enter}/`);
      const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
      if (b?.k === 'goto') check(id, b.at, at); else if (b?.k === 'guard') check(id, b.post, at); else if (b?.k === 'patrol') b.route.forEach((x) => check(id, x, at));
    }
    for (const [c, at] of condsOf(m)) if (c.at) check(id, c.at, at);
    for (const [a] of actsOf(m)) if (a.k === 'cutscene') for (const [, s] of deep(SCENE.get(a.id))) refs.get(id).add(s.replace(/^set:([\w-]+)\..*$/, '$1/'));
  }
  const used = (id, site) => [...refs.get(id)].some((r) => r === site || r.startsWith(`${site}.`) || r.startsWith(`${site}/`));
  for (const id of CH4) {
    const ms = S.MISSION_SITES[id];
    assert.equal(ms.phase, 'P0');
    for (const site of ms.sites) assert.ok(used(id, site), `${id} uses ${site} (MISSION_SITES)`);
    for (const space of ms.spaces ?? []) assert.ok(used(id, space), `${id} uses space ${space} (MISSION_SITES)`);
    assert.ok(![...refs.get(id)].some((r) => S.SITES[r.split(/[./]/)[0]]?.phase === 'P1'), `${id} stays on today's map`);
  }
  // chapter places: QUÁN CƠM DÌ SÁU is building 79's door; the Dream's restart is on the eastbound asphalt behind the van
  const keys = Object.keys(ch4.PLACES);
  assert.ok(keys.every((k) => k.startsWith('ch4.')));
  const b79 = city.BUILDINGS[79], q = ch4.PLACES['ch4.quan-com'];
  assert.equal(b79.name, 'QUÁN CƠM DÌ SÁU'); assert.match(b79.subtitle, /CƠM TẤM/);
  assert.ok(Math.hypot(b79.door.x - q.x, b79.door.z - q.z) < 0.02 && Math.abs(b79.facing - q.yaw) < 0.01, 'ch4.quan-com is the door of QUÁN CƠM DÌ SÁU');
  assert.ok(city.pointClear(q.x, q.z, 0.3), 'the door is clear');
  assert.equal(city.BUILDINGS.filter((x) => x.name === b79.name).length, 1, 'the only QUÁN CƠM DÌ SÁU: the marker is unambiguous');
  assert.equal(t4.TEXT['c4m1.mk.quanCom'], b79.name, 'the marker prints the sign over the door');
  const asphalt = (x, z) => TERRAIN.strips.some((s) => {
    const along = s.alongX ? x : z, v = s.alongX ? z : x;
    if ((s.lo !== -Infinity && along <= s.lo) || (s.hi !== Infinity && along >= s.hi)) return false;
    return Math.abs(v - s.at) < s.half && city.inRect(city.LAND, x, z, -0.5);
  });
  const d = ch4.PLACES['ch4.ben-xe-dream'], van = PLACES['ben-xe-an-hoa.van'];
  assert.ok(asphalt(d.x, d.z) && TERRAIN.walkable(d.x, d.z), 'the Dream restarts on the carriageway');
  assert.equal(d.z, van.z, 'in the van\'s lane'); assert.ok(van.x - d.x >= 20 && van.x - d.x <= 30, '20–30 m behind the van');
  assert.ok(city.pointClear(d.x, d.z, d.r), 'clear for a bike');
  for (const [k, p] of Object.entries(ch4.PLACES)) assert.equal(DIST.districtAt(p.x, p.z)?.district.id, 'D1', `${k} is in An Hòa (P0)`);
  for (const [k, p] of Object.entries(ch4.PLACES)) for (const [s, sp] of Object.entries(SITE_PLACES)) assert.ok(Math.hypot(sp.x - p.x, sp.z - p.z) >= 1 || s === 'ben-xe-an-hoa.van', `${k} is clear of ${s}`);
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
const VICTIMS = new Set(['hoa', 'beti', 'mai']);
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle', 'thrown']);
test('cutscenes: durations add up, marks, cast, sets and lines resolve, victims stay dignified, every scene is played; CS04 covers its sites in two halves', () => {
  const played = new Map();
  for (const id of CH4) for (const [a] of actsOf(catalog.missions.get(id))) if (a.k === 'cutscene') played.set(a.id, [...(played.get(a.id) ?? []), id]);
  assert.equal(new Set(SCENES.map((s) => s.id)).size, SCENES.length, 'scene ids are unique across chapters');
  assert.deepEqual([...played.keys()].sort(), SCENES4.map((s) => s.id).sort(), 'chapter 4 plays exactly its scenes');
  for (const sc of SCENES4) {
    assert.deepEqual(played.get(sc.id), [sc.mission], `${sc.id} is played by ${sc.mission} only`);
    const total = sc.shots.reduce((t, s) => t + s.dur, 0);
    assert.ok(Math.abs(total - sc.seconds) < 1e-9, `${sc.id}: shots add to ${total}, not ${sc.seconds}`);
    for (const s of sc.sets ?? []) assert.ok(S.SPACES[s], `${sc.id}: set ${s}`);
    const props = new Set(), rides = new Set();
    for (const sh of sc.shots) for (const c of sh.cues ?? []) { if (c.k === 'prop') props.add(c.id); if (c.k === 'ride') rides.add(c.id); }
    const mark = (m, where) => {
      if (m && typeof m === 'object') { assert.ok(m.off.length === 3 && m.off.every(Number.isFinite), `${sc.id} ${where}: offset`); return mark(m.at, where); }
      assert.equal(typeof m, 'string', `${sc.id} ${where}: mark`);
      if (m.startsWith('set:')) { const [space, anchor] = m.slice(4).split('.'); assert.ok((sc.sets ?? []).includes(space) && ANCHORS[space]?.[anchor], `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('prop:')) { assert.ok(props.has(m.slice(5)), `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('ride:')) { assert.ok(rides.has(m.slice(5).split('.')[0]), `${sc.id} ${where}: ${m}`); return; }
      if (m.startsWith('vehicle:')) { assert.ok(actsOf(catalog.missions.get(sc.mission)).some(([a]) => a.k === 'vehicle' && a.id === m.slice(8) && (a.model || a.at)), `${sc.id} ${where}: ${m} is a vehicle ${sc.mission} spawns`); return; }
      if (PLACES[m]) return;
      const [who, joint] = m.split('.');
      assert.ok(who in sc.cast && (joint === undefined || JOINTS.has(joint)), `${sc.id} ${where}: unknown mark ${m}`);
    };
    const cam = (c, where) => {
      if (c.k === 'split') { cam(c.left, where); cam(c.right, where); return; }
      for (const k of c.k === 'snapZoom' ? ['target'] : ['eye', 'look', 'from', 'to', 'target', 'center']) if (c[k] !== undefined) [c[k]].flat().forEach((m) => mark(m, where));
      if (c.points) c.points.forEach((m) => mark(m, where));
      if (c.k === 'rail') { assert.equal(c.points.length, c.look.length, `${sc.id} ${where}: rail look per point`); assert.equal(c.points.length, c.fov.length); if (c.roll) assert.equal(c.roll.length, c.points.length); }
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
        if (c.k === 'pair') { for (const x of [c.a, c.b]) assert.ok(x in sc.cast); if (ROUGH.has(c.clip) || c.clip === 'lead-by-arm') for (const x of [c.a, c.b]) assert.ok(!VICTIMS.has(sc.cast[x]), `${sc.id}: ${c.clip} on a victim`); }
        if (c.k === 'anim' && VICTIMS.has(sc.cast[c.who])) assert.ok(!ROUGH.has(c.clip), `${sc.id}: ${c.clip} on a victim`);
        if (c.k === 'place' && VICTIMS.has(sc.cast[c.who])) assert.ok(SCENE_SCHEMA.POSES_DIGNIFIED.includes(c.pose ?? 'sit'), `${sc.id}: ${c.who} placed in ${c.pose}`);
        if (c.k === 'walk' && VICTIMS.has(sc.cast[c.who])) assert.ok(!c.pace || c.pace === 'walk', `${sc.id}: ${c.who} walks of her own will`);
        if (c.at !== undefined && c.at !== null) mark(c.at, `${where} ${c.k}`);
        if (c.k === 'walk' || c.k === 'ride') c.path.forEach((m) => mark(m, `${where} ${c.k}`));
        if (c.if) assert.doesNotThrow(() => setup().r.test(c.if));
      }
    });
  }
  // CS04 "Anh Hai" is two halves (the bible's "[CS04 cont.] triggered mid-chase"); together they stage its sites and sets
  const halves = ['cs04_anh_hai', 'cs04_anh_hai_xe'].map((id) => SCENE.get(id));
  assert.ok(halves.every(Boolean));
  assert.ok(halves[1].stage.freezeWorld && halves[1].shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'slowmo')), 'the crash half is the slow-motion one');
  assert.equal(halves[0].sets.join(), 'attic,village-tan-thuan');
  for (const [id, cs] of Object.entries(S.CUTSCENE_SITES)) if (cs.mission.startsWith('c4-')) {
    const parts = SCENES4.filter((s) => s.id === id || s.id.startsWith(`${id}_`)), all = parts.flatMap((p) => [...deep(p)].map(([, s]) => s));
    assert.ok(parts.length, `${id} is scripted`);
    for (const site of cs.sites) {
      const staged = all.some((s) => s === site || s.startsWith(`${site}.`));
      // a route site is the chase that leads into the scene: the playing mission drives it
      const driven = S.SITES[site].kind === 'route' && actsOf(catalog.missions.get(cs.mission)).some(([a]) => a.k === 'vehicle' && a.route === site);
      assert.ok(staged || driven, `${id} is staged at ${site}`);
    }
    for (const space of cs.spaces ?? []) assert.ok(parts.some((p) => (p.sets ?? []).includes(space)), `${id} uses set ${space}`);
  }
  // the scenes follow one another without a gap in the story: each handoff is where the next step expects the player
  assert.equal(SCENE.get('c4m2-ben-xe').handoff.player.at, 'ch4.ben-xe-dream');
  assert.equal(SCENE.get('cs04_anh_hai').handoff.player.at, 'cafe-co-ba.pickup', 'the race starts at the café front, where the guide route begins');
  assert.deepEqual([S.SITES['r-ve-nha'].route.at(-2), S.SITES['r-ve-nha'].route.at(-1)], [-30, 14.7], 'r-ve-nha ends (so the reversed race begins) at the café door');
  assert.equal(SCENE.get('cs04_anh_hai_xe').handoff, undefined, 'the crash ends on black: the mission completes');
});

/** Subtitle time of a line (director-actors-extras.md §5.2): clamp(1.4 + 0.065·chars, 1.8, 7.5) s. */
const subDur = (text) => Math.min(7.5, Math.max(1.8, 1.4 + 0.065 * [...text].length));
test('cutscene subtitles are readable: at most 17 characters a second, two lines on screen, none runs past the scene', () => {
  const issues = [];
  for (const sc of SCENES4) {
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

test('cutscenes name only contract ids (plus the requests); slow motion only in a freezeWorld scene; two-actor shots have two actors; the crash shows no injury', () => {
  const kinds = { ...CONTRACT, rides: { ...CONTRACT.models, ...CONTRACT.rideModels }, sceneProps: { ...CONTRACT.props, ...CONTRACT.sceneProps } };
  const issues = [];
  for (const sc of SCENES4) {
    for (const [kind, id, where] of SCENE_SCHEMA.sceneVocab(sc)) if (!has(kinds[kind], id)) issues.push(`${sc.id} ${where}: ${kind} '${id}'`);
    const slow = sc.shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'slowmo'));
    if (slow && !sc.stage.freezeWorld) issues.push(`${sc.id}: slowmo outside a stage.freezeWorld scene`);
    const twoActors = (cam, where) => {
      if (cam.k === 'split') { twoActors(cam.left, where); twoActors(cam.right, where); return; }
      if (cam.k === 'ots' && cam.speaker === cam.listener) issues.push(`${sc.id} ${where}: over-the-shoulder of ${cam.speaker} onto ${cam.listener}`);
      if (cam.k === 'twoShot' && cam.a === cam.b) issues.push(`${sc.id} ${where}: two-shot of ${cam.a} alone`);
    };
    sc.shots.forEach((sh, i) => twoActors(sh.cam, `shot ${i + 1}`));
    for (const [, s] of deep(sc)) if (/blood|gore|máu/i.test(s) && !/no blood|không máu/i.test(s)) issues.push(`${sc.id}: "${s}"`);
  }
  assert.deepEqual(issues, []);
  const crash = SCENE.get('cs04_anh_hai_xe').shots.find((sh) => sh.label === 'va');
  assert.ok(crash.cues.some((c) => c.k === 'sfx' && c.id === 'smash-cut' && !c.t), 'the impact itself is a smash cut');
  assert.ok(!SCENES4.some((sc) => sc.shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'pair' && ['collar-grab', 'punch', 'lead-by-arm'].includes(c.clip)))), 'nobody is struck or led in chapter 4');
});

test('case board: chapters 1–4 cards in free lotus slots, strings connect them all, it lints and solves; the question is fair', () => {
  const evidence = new Set(catalog.evidence.keys());
  assert.deepEqual(D.lintBoard(BOARD, evidence), []);
  const ids = BOARD.cards.map((c) => c.id);
  assert.deepEqual(ids, [...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS, ...ch3.BOARD_CARDS, ...ch4.BOARD_CARDS].map((c) => c.id), 'the earlier chapters\' cards (chapter 3\'s included), then this chapter\'s');
  const slots = BOARD.cards.map((c) => c.slot);
  assert.equal(new Set(slots).size, slots.length, 'one card per lotus slot');
  assert.ok(slots.every((s) => Number.isInteger(s) && s >= 0), 'slots are lotus positions');
  assert.ok(ch4.BOARD_CARDS.every((c) => c.slot >= 23), 'chapter 4 sits on a third ring, clear of chapters 1–3 (slots 0–18) and of the chapter 5 plan (19–22)');
  const seen = new Set([ids[0]]), todo = [ids[0]];
  while (todo.length) { const a = todo.pop(); for (const [x, y] of BOARD.links) for (const [p, q] of [[x, y], [y, x]]) if (p === a && !seen.has(q)) { seen.add(q); todo.push(q); } }
  assert.equal(seen.size, ids.length, 'every card is on a string');
  for (const c of ch4.BOARD_CARDS) assert.ok(BOARD.links.filter(([a, b]) => a === c.id || b === c.id).length >= 2, `${c.id} ties into the web, not a dead end`);
  const p = F.newProgress(); p.evidence.push(...ids);
  const own = (id) => p.evidence.includes(id);
  for (const [a, b] of BOARD.links) assert.equal(D.linkCards(BOARD, p, a, b, own).result, 'correct');
  assert.equal(D.isSolved(BOARD, p.board), false, 'the strings alone do not solve it: the hypothesis is proven by picking cards');
  assert.equal(D.propose(BOARD, p, 'no-thanh-nguoi', ['ev-giay-no', 'ev-so-mai'], own).result, 'wrong', 'two of the three cards are not enough');
  assert.equal(D.propose(BOARD, p, 'no-thanh-nguoi', ['ev-giay-no', 'ev-so-mai', 'ev-diem-goi', 'ev-kho-7'], own).solved, true, 'an extra card is tolerated');
  // the question: the supported option is the answer; the others are the two dead ends chapter 3 closed
  const q = catalog.questions.get(BOARD.question);
  assert.deepEqual(D.lintQuestion(q, evidence), []);
  assert.deepEqual(D.provable(q, own), [q.answer]);
  assert.equal(q.answer, 'quang');
  // every card's evidence is found in play (chapters 1–4)
  const sources = new Set();
  for (const m of [...EARLIER, ...CH3, ...CH4].map((id) => catalog.missions.get(id))) for (const [a] of actsOf(m)) {
    if (a.k === 'evidence') sources.add(a.id);
    if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence);
  }
  for (const id of [...ids, ...ch4.EVIDENCE.map((e) => e.id)]) assert.ok(sources.has(id), `${id} can be found in play`);
});

test('chapter 3 on the board: its cards and strings, the burnt receipt tied to the ledger\'s van schedule, the DO-0417 bag in the answer', () => {
  const ids = new Set(BOARD.cards.map((c) => c.id)), key = ([x, y]) => (x < y ? `${x}|${y}` : `${y}|${x}`), links = new Set(BOARD.links.map(key));
  for (const c of ch3.BOARD_CARDS) assert.ok(ids.has(c.id), `${c.id} is on BẢNG MANH MỐI`);
  for (const l of [...ch3.BOARD_LINKS, ['ev-hoa-don-anh-duong', 'ev-so-trang-2']]) assert.ok(links.has(key(l)), `string ${l.join(' – ')}`);
  assert.equal(links.size, BOARD.links.length, 'no string twice');
  const q = catalog.questions.get(BOARD.question);
  assert.ok(q.options.find((o) => o.id === q.answer).needs.includes('ev-tui-0417'), 'the answer rests on chapter 3\'s DO-0417 bag too');
  // c4-m3 replays from its replay block alone: the block carries chapter 3's cards
  const replay = catalog.missions.get('c4-m3').replay.evidence;
  for (const c of ch3.BOARD_CARDS) assert.ok(replay.includes(c.id), `c4-m3 replay evidence has ${c.id}`);
});

test('every flag and mission variable a condition reads is written (chapters 1–2 and 4, or a choice result)', () => {
  const written = new Set(), read = [];
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  for (const id of [...EARLIER, ...CH4]) {
    const m = catalog.missions.get(id), vars = new Set(), varReads = [];
    for (const [a] of actsOf(m)) { note(a); if (a.k === 'var') vars.add(a.name); }
    for (const [c, at] of condsOf(m)) { if (c.k === 'flag') read.push([c.name, at]); if (c.k === 'var') varReads.push([c.name, at]); }
    for (const sc of SCENES.filter((s) => s.mission === id)) for (const sh of sc.shots) for (const cue of sh.cues ?? []) {
      const walk = (c) => { if (!c) return; if (c.k === 'flag') read.push([c.name, sc.id]); if (c.k === 'var') varReads.push([c.name, sc.id]); (c.of ?? []).forEach(walk); walk(c.c); };
      walk(cue.if);
    }
    for (const [n, at] of varReads) assert.ok(vars.has(n), `${at}: reads mission var ${n} that nothing sets`);
  }
  for (const q of catalog.questions.values()) for (const a of q.onCorrect ?? []) note(a);
  for (const b of catalog.boards.values()) for (const a of b.reveals ?? []) note(a);
  for (const m of MODULES) for (const x of m.missions) for (const a of x.rewards ?? []) note(a);
  for (const [n, at] of read) assert.ok(written.has(n), `${at}: reads flag ${n} that nothing sets`);
  for (const id of CH4) for (const f of Object.keys(catalog.missions.get(id).replay?.flags ?? {})) assert.ok(written.has(f), `${id} replay flag ${f} is a real flag`);
});

test('steps only wait for what the script offers: interactions, tails, eavesdrops, rides, contract signals and meters', () => {
  const OPS = new Set(['appOrder', 'gps', 'chase', 'photoExamine', 'bike']);
  const METERS = new Set(['cover:shipper', 'eavesdrop:diem-goi', 'tail:van-mai']);
  for (const id of CH4) {
    const m = catalog.missions.get(id), acts = actsOf(m).map(([a]) => a);
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id));
    const tails = new Set(acts.filter((a) => a.k === 'tail').map((a) => a.target)), ears = new Set(acts.filter((a) => a.k === 'eavesdrop').map((a) => a.id));
    const timers = new Set([...acts.filter((a) => a.k === 'timer').map((a) => a.id), ...m.steps.filter((s) => s.timer && !s.timer.fail).map((s) => s.id)]);
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id), `${at}: waits for interaction ${c.id}`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(has(CONTRACT.signals, c.id) || has(CONTRACT.ops, c.id), `${at}: signal ${c.id}`);
      if (c.k === 'on' && ['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(tails.has(c.id), `${at}: waits for tail ${c.id}`);
      if (c.k === 'on' && c.ev === 'eavesdrop') assert.ok(ears.has(c.id), `${at}: waits for eavesdrop ${c.id}`);
      if (c.k === 'on' && c.ev === 'timer') assert.ok(timers.has(c.id), `${at}: waits for timer ${c.id} that latches (no fail of its own)`);
      if (c.k === 'on' && (c.ev === 'alight' || c.ev === 'ride')) assert.ok(acts.some((a) => a.k === 'ride'), `${at}: waits for a ride`);
      if (c.k === 'meter') assert.ok(METERS.has(c.id), `${at}: meter ${c.id}`);
      assert.ok(c.k !== 'q', `${at}: chapter 4 waits on no engine query`);
    }
    for (const a of acts) if (a.k === 'do') assert.ok(OPS.has(a.op), `${id}: op ${a.op} is documented`);
    // a detour (a branch target) is only entered by its branch: a finished step never falls through into one (c4-m1 'chup-so' → 'bi-hoi')
    const detours = new Set(m.steps.flatMap((s) => (s.branch ?? []).map((b) => b.goto)));
    m.steps.forEach((s, i) => { const next = m.steps[i + 1]; if (s.next === undefined && next && detours.has(next.id)) assert.fail(`${id}/${s.id} falls through into the detour ${next.id} (give it a next)`); });
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(METERS.has(x.id));
  }
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

test('main path: chapters 1–2 for a real progress, chapter 3 marked done, then c4-m1 → c4-m3 end to end on the mock host', () => {
  const { r, w } = setup({ choose: { bienSo: 'b' }, onCheckpoint: (e, run) => { if (run.state().mission.startsWith('c4-')) snapshots.push({ id: run.state().mission, step: e.step, save: run.snapshot() }); } });
  for (const id of EARLIER) { assert.equal(r.start(id), true); autopilot(r, w, { hold: EARLY_HOLD }); assert.equal(completed(w).at(-1).id, id); }
  // chapter 3 has its own playthrough test: its missions are marked done with the evidence its board cards carry
  r.progress().completed.push(...CH3);
  r.progress().evidence.push(...ch3.BOARD_CARDS.map((c) => c.id));
  const failsBefore = w.fails;
  for (const id of CH4) {
    before.set(id, F.cloneProgress(r.progress()));
    const meta = catalog.meta.get(id), hour = (meta.hours[0] + 0.5) % 24;
    assert.equal(F.availability(catalog.index, r.progress(), hour).find((a) => a.id === id).state, 'open', `${id} is open at ${hour}h`);
    assert.equal(r.start(id), true);
    const res = autopilot(r, w);
    const done = completed(w).at(-1);
    assert.equal(done.id, id);
    assert.equal(done.chain, catalog.missions.get(id).chain ?? null);
    assert.ok(res.ticks < 9000);
  }
  assert.equal(w.fails, failsBefore, 'no fail on the main path');
  const p = r.progress();
  assert.deepEqual(w.missing, [], 'every actor, vehicle and place a step uses exists');
  assert.deepEqual(r.state().issues, []);
  assert.deepEqual(p.lunar, { month: 8, day: 5 });
  assert.equal(p.chapter, 4);
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [1, 2, 4]);
  for (const f of ['sawLedger', 'maiTaken', 'dreamWrecked', 'boardCh4', 'leadQuang', 'hunter']) assert.equal(p.flags[f], true, f);
  assert.deepEqual([p.flags['choice:nhanTu'], p.flags['choice:veNha'], p.flags['choice:nhanMa']], ['chau', 'bo', 'thang']);
  for (const e of ['ev-diem-goi', 'ev-so-trang-1', 'ev-so-trang-2', 'ev-so-trang-3', 'ev-so-mai', 'ev-xe-trang', 'ev-giay-no']) assert.ok(p.evidence.includes(e), e);
  assert.ok(!p.evidence.includes('ev-bang-anh') && !p.evidence.includes('ev-khung-hinh'), 'the optional clues stay optional');
  for (const j of ['j-anh-duong', 'j-diem', 'j-mai-di', 'j-phuong-la-ai', 'j-dau-moi', 'j-di-san']) assert.ok(p.journal.includes(j), j);
  assert.ok(p.board.solved.includes('bang-ch4'));
  assert.deepEqual(p.deductions['dau-moi-phuong'], { answer: 'quang', tries: 1 });
  for (const id of SCENES4.map((s) => s.id)) assert.ok(p.seen.includes(id), `${id} played`);
  assert.equal(F.conscienceTier(p.conscience), 'clean');
  // money: the lunch fee and Diễm's 25.000đ "khỏi thối"; walking home costs nothing
  assert.equal(p.cash - before.get('c4-m1').cash, 50);
  // engine hooks the chapter drove
  for (const op of ['appOrder', 'gps', 'chase', 'photoExamine', 'bike']) assert.ok(w.ops.includes(op), op);
  const exam = w.log.find((l) => l.k === 'do' && l.a.op === 'photoExamine');
  assert.equal(exam.a.wait, true); assert.equal(exam.a.args.photo, 'ev-so-trang-3');
  assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'bike' && l.a.args.look === 'wrecked'));
  assert.ok(w.log.some((l) => l.k === 'behave' && l.id === 'thu-ky' && l.a.b.name === 'answer-phone'), 'the secretary turns to the phone');
  assert.ok(w.log.some((l) => l.k === 'sms' && l.a.from === 'tu' && l.a.burner), 'Ông Tư answers on the burner');
  assert.ok(w.log.some((l) => l.k === 'tail' && l.a.target === 'van-mai'));
  assert.equal(w.player.space, 'attic', 'the chapter ends in the attic');
  assert.ok(!w.log.some((l) => l.mission === 'c4-m1' && l.step === 'bi-hoi'), 'nobody is caught on the main path: the bluff is a detour');
  assert.ok(!w.log.some((l) => l.mission === 'c4-m3' && l.step === 'xe-om'), 'the walk home is the default');
  assert.deepEqual(snapshots.map((x) => `${x.id}/${x.step}`), ['c4-m1/vao', 'c4-m1/nhan-tu', 'c4-m2/chay', 'c4-m2/duoi-theo', 'c4-m3/di-bo', 'c4-m3/len-gac', 'c4-m3/bang'], 'every checkpoint of the main path saved');
  const labels = outs(w, 'checkpoint').filter((e) => snapshots.some((s) => s.step === e.step)).map((e) => e.label);
  assert.ok(labels.includes('Đã lưu · Phòng chờ Ánh Dương') && labels.includes('Đã lưu · Bám theo chiếc xe trắng'));
});

test('resume from every checkpoint of the main path: the setups rebuild the world and the mission completes', () => {
  assert.ok(snapshots.length);
  for (const { id, step, save } of snapshots) {
    const { r, w } = setup();
    assert.equal(r.resume(save), true, `${id}/${step} resumes`);
    autopilot(r, w);
    assert.equal(completed(w).at(-1)?.id, id, `${id} completes from ${step}`);
    assert.deepEqual(w.missing, [], `${id}/${step}: nothing used before it is rebuilt`);
    assert.equal(w.resets[0], 'checkpoint');
    if (id === 'c4-m3' && step === 'bang') assert.ok(r.progress().board.solved.includes('bang-ch4'), 'the board can be solved from the restored progress');
  }
});

test('c4-m1: one bluff saves Tín, the window goes on; the photo board and the desk frame give Mắt cú; Ông Tư\'s other reply', () => {
  const n = entries();
  const { w, p, done } = play('c4-m1', {
    progress: before.get('c4-m1'), choose: { biHoi: 'wc', nhanTu: 'nhanh' }, optional: ['bang-anh', 'khung-hinh'],
    hold: { 'chup-so': ({ w, t }) => { if (n(t) === 1 && t > 0.15) { catchIn(w); return true; } return false; } },
  });
  assert.deepEqual(outs(w, 'fail'), [], 'the bluff is not a fail');
  assert.equal(w.log.filter((l) => l.k === 'photoTarget' && l.id === 'so-trang-1').length, 2, 'back to the ledger after the bluff');
  assert.ok(w.log.some((l) => l.k === 'choice' && l.id === 'biHoi' && l.a.style === 'bluff'), 'the question is a bluff panel');
  assert.ok(w.log.some((l) => l.k === 'dialogue' && l.id === 'c4m1-bi-hoi'));
  assert.ok(w.log.some((l) => l.k === 'sms' && l.a.text === 'Nói gì cũng được là nói bậy. Ừ, đếm tới ba.'));
  assert.ok(p.evidence.includes('ev-bang-anh') && p.evidence.includes('ev-khung-hinh'));
  assert.deepEqual([done.result.eye, done.result.ghost], [true, true]);
  assert.ok(w.log.some((l) => l.k === 'dialogue' && l.id === 'c4m1-hoa'), 'Tín learns Hoa\'s name');
  assert.deepEqual(w.missing, []);
});

test('c4-m1: a second catch, a wrong bluff and the call running out each restart at the waiting room; a blown cover replays the eavesdrop', () => {
  const n = entries();
  const twice = play('c4-m1', {
    progress: before.get('c4-m1'), choose: { biHoi: 'wc' },
    // first catch: bluffed; back at the ledger, idle, caught again after the 2 s grace: fail, back to the waiting room
    hold: { 'chup-so': ({ w, t }) => { const e = n(t); if (e === 1 && t > 0.15) { catchIn(w); return true; } if (e === 2) { if (t > 2.5) catchIn(w); return true; } return false; } },
    onFail: (v) => (v.failure.reason === 'Thư ký thấy bạn lần nữa. Lần này hết đường chối.' ? 'retry' : null),
  });
  assert.equal(outs(twice.w, 'fail').length, 1);
  assert.equal(twice.done.stats.retries, 1);
  assert.ok(twice.w.log.some((l) => l.step === 'nhan-tu' && l.restoring && l.k === 'spawn' && l.id === 'thu-ky'), 'the restore respawned the secretary');
  const wrong = play('c4-m1', {
    progress: before.get('c4-m1'), choose: { biHoi: 'tien' },
    hold: { 'chup-so': ({ w, visit, t }) => { if (visit === 1 && t > 0.15) { catchIn(w); return true; } w.actors.get('thu-ky').sees = false; return false; } },
    onFail: (v) => (v.failure.reason === 'Thư ký không tin. Bạn bị đuổi ra ngoài.' ? 'retry' : null),
  });
  assert.equal(outs(wrong.w, 'fail').length, 1);
  assert.equal(wrong.done.id, 'c4-m1');
  const late = play('c4-m1', {
    progress: before.get('c4-m1'),
    hold: { 'chup-so': ({ visit }) => visit === 1 },
    onFail: (v) => (v.failure.reason === 'Thư ký cúp máy rồi. Chưa chụp đủ ba trang.' ? 'retry' : null),
  });
  assert.equal(outs(late.w, 'fail').length, 1);
  assert.ok(late.w.log.filter((l) => l.k === 'choice' && l.id === 'nhanTu').length === 2, 'the text to Ông Tư is sent again');
  const cover = play('c4-m1', {
    progress: before.get('c4-m1'),
    hold: { 'nghe-len': ({ w, visit }) => { if (visit === 1) { w.meters.set('cover:shipper', 1); return true; } w.meters.set('cover:shipper', 0); return false; } },
  });
  assert.deepEqual(outs(cover.w, 'fail').map((e) => [e.reason, e.soft]), [['Thư ký nghi rồi. Đứng chờ cho tự nhiên thôi.', true]]);
  for (const run of [twice, wrong, late, cover]) { assert.deepEqual(run.w.missing, []); assert.ok(run.p.evidence.includes('ev-so-trang-3')); }
});

test('LƯƠNG TÂM in c4-m1: nobody may die in the office', () => {
  const { r } = setup({ progress: before.get('c4-m1') });
  r.start('c4-m1');
  r.tick(0.2);
  r.event({ type: 'kill', id: 'thu-ky', tag: 'staff', cause: 'fall' });
  r.tick(0.1);
  assert.equal(r.view().failure.reason, R.LETHAL_REASON);
});

test('c4-m2: the race lost three times is skipped to the coach stop; a ram restarts the chase; a lost van is skipped to the crash', () => {
  let fails = 0;
  const race = play('c4-m2', {
    progress: before.get('c4-m2'),
    hold: { chay: ({ visit }) => visit <= 3 },
    onFail: (v) => { fails++; assert.equal(v.failure.reason, 'Trễ rồi. Chiếc xe trắng chạy mất.'); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.ok(race.w.log.some((l) => l.k === 'cutscene' && l.id === 'c4m2-ben-xe' && l.step === 'ben-xe') && race.p.seen.includes('c4m2-ben-xe'), 'the skip lands on the coach stop, not past it');
  assert.deepEqual([race.done.stats.skipped, race.done.result.grade], [1, 'C']);
  assert.ok(race.w.resets.includes('checkpoint'), 'the skip reset the mission things, and the coach stop scene still found the van');
  const ram = play('c4-m2', {
    progress: before.get('c4-m2'),
    hold: { 'duoi-theo': ({ visit, push }) => { if (visit === 1) { push({ type: 'signal', id: 'rammed', target: 'van-mai' }); return true; } return false; } },
    onFail: (v) => (v.failure.reason === 'Đừng tông xe! Út Mai đang ở trên đó.' ? 'retry' : null),
  });
  assert.equal(outs(ram.w, 'fail').length, 1);
  assert.ok(ram.w.log.filter((l) => l.k === 'vehicle' && l.id === 'van-mai' && l.a.route === 'r-xe-tai-trang').length >= 2, 'the retry restarts the van at the coach stop');
  assert.ok(ram.p.seen.includes('cs04_anh_hai_xe'));
  let lost = 0;
  const gone = play('c4-m2', {
    progress: before.get('c4-m2'),
    hold: { 'duoi-theo': ({ visit, push }) => { if (visit <= 3) { push({ type: 'lost', id: 'van-mai' }); return true; } return false; } },
    onFail: (v) => { lost++; return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(lost, 3);
  assert.ok(gone.p.seen.includes('cs04_anh_hai_xe') && gone.p.flags.dreamWrecked, 'the designed failure plays all the same');
  assert.equal(gone.done.chain, 'c4-m3');
  for (const run of [race, ram, gone]) assert.deepEqual(run.w.missing, []);
});

test('c4-m3: the xe ôm home; a wrong string and a wrong answer cost hint tokens, never a fail; the gentle text to Má', () => {
  const tokens = before.get('c4-m3').hintTokens;
  const run = play('c4-m3', { progress: before.get('c4-m3'), choose: { veNha: 'xeom', nhanMa: 'nhe' }, boardWrong: ['ev-giay-hoa', 'ev-xe-trang'], wrong: { 'dau-moi-phuong': 'cong-an' } });
  assert.ok(run.res.visits['xe-om'] && !run.res.visits['di-bo'], 'the xe ôm branch');
  assert.ok(run.w.log.some((l) => l.k === 'ride' && l.a.mode === 'xeom' && l.a.driver === 'xe-om'));
  assert.equal(before.get('c4-m3').cash - run.p.cash, 20, 'twenty thousand for the xe ôm');
  assert.ok(run.w.log.some((l) => l.k === 'sms' && l.a.from === 'bana' && l.a.text === 'Hổng sao thiệt hông con? Giấy nè, má giấu trong lu gạo.'));
  assert.deepEqual(outs(run.w, 'fail'), []);
  assert.equal(run.p.board.wrong, 1);
  assert.deepEqual(run.p.deductions['dau-moi-phuong'], { answer: 'quang', tries: 2 });
  assert.equal(run.p.hintTokens, Math.max(0, tokens - 2) + run.done.result.tokens, 'one token for the string, one for the answer');
  assert.deepEqual(run.w.missing, []);
});

test('replays: every chapter 4 mission replays from its chapter start, and from nothing but its replay block', () => {
  const { r, w } = setup({ progress: before.get('c4-m1') });
  for (const id of CH4) { r.start(id); autopilot(r, w); }
  const main = F.cloneProgress(r.progress());
  for (const id of CH4) {
    assert.equal(r.start(id, { replay: true }), true);
    autopilot(r, w);
    assert.equal(completed(w).at(-1).replay, true, `${id} replay completes`);
  }
  const after = r.progress();
  assert.deepEqual([after.cash, after.flags, after.evidence], [main.cash, main.flags, main.evidence], 'replays change nothing but medals');
  assert.ok(CH4.every((id) => after.medals[id].plays === 2));
  // a save that never recorded the chapter start (an imported or migrated slot): the replay blocks alone must carry the board
  const bare = F.newProgress(); bare.completed.push(...EARLIER, ...CH3, ...CH4); bare.chapter = 4;
  const fresh = setup({ progress: bare });
  for (const id of CH4) {
    assert.equal(fresh.r.start(id, { replay: true }), true);
    autopilot(fresh.r, fresh.w);
    assert.equal(completed(fresh.w).at(-1).id, id, `${id} replays from its replay block`);
  }
  assert.deepEqual([...w.missing, ...fresh.w.missing], []);
});
