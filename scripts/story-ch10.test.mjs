// node --experimental-transform-types --test scripts/story-ch10.test.mjs
// Story content, chapter 10 (SEN TRONG BÙN · ĐÊM RẰM): the chapter loads through the registry beside chapters 1–5 and
// lints clean against the real sites and the engine contract plus the ids the chapter asks for (content/ch10.ts
// ENGINE_NEEDS); every text reference resolves (no inline strings, no orphan keys, no real brands, the ring named only
// through {@ring}, subtitles fit and are readable); every place is a site, a chapter place or a declared space anchor
// and each mission uses the sites story-decisions.md gave it; the cutscenes are consistent (durations, marks, cast, sets,
// dignity) and name only contract ids; slow motion lives only in frozen scenes and every QTE is a play QTE in real
// seconds; the escort of seventeen makes the rescued count 11 → 28; the case board cards solve; the steps only wait for
// what the script offers.
// A mock host and an autopilot (each step's own conditions satisfied in turn) play the chapter's main path c10-m1 →
// c10-m4 from an end-of-chapter-9 progress, resume from every checkpoint, and play the alternatives: spotted in the
// festival crowd and skipped, the mooncake bought, the security office and the cell corridor skipped after three
// detections, a recaptured follower, down in a duel phase (the phase restarts) and outside one, the conscience lines,
// Quang's reply, a wrong deduction, the LƯƠNG TÂM rules and the replays.
// Chapters 6–9 are written in parallel: stand-in modules provide the cast this chapter speaks with (the abbot
// 'thay-minh-tinh' of chapter 6, Tám Hổ 'tam-ho' and his men 'ho-vang' of chapter 9) until they are built and registered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

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
const ch10 = await import('../app/game/story/content/ch10.ts');
const cs10 = await import('../app/game/story/cutscenes/ch10.ts');
const t1 = await import('../app/game/story/text/vi/ch01.ts');
const t2 = await import('../app/game/story/text/vi/ch02.ts');
const t3 = await import('../app/game/story/text/vi/ch03.ts');
const t4 = await import('../app/game/story/text/vi/ch04.ts');
const t5 = await import('../app/game/story/text/vi/ch05.ts');
const t10 = await import('../app/game/story/text/vi/ch10.ts');
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT, SCENE_REQUESTS, LANE_WAVE, CHAPTER_WAVE, CAMPAIGN_CONTRACT } = await import('../app/game/story/contract.ts');

/** Cast of chapters 6 and 9 as chapter 10 uses it (the abbot, Tám Hổ and his men), standing in for content/ch06.ts and ch09.ts. */
const STAND_INS = [
  { chapter: 6, missions: [], cast: [{ id: 'thay-minh-tinh', name: '@cast.thay-minh-tinh', look: 'abbot', portrait: { bg: '#8a5a2e', initials: 'T' } }], text: { 'cast.thay-minh-tinh': 'Thầy Minh Tịnh' } },
  { chapter: 9, missions: [], cast: [{ id: 'tam-ho', name: '@cast.tam-ho', look: 'tam-ho', portrait: { bg: '#d8a020', initials: 'TH' } }, { id: 'ho-vang', name: '@cast.ho-vang', look: 'ho-vang', portrait: { bg: '#e0b23a', initials: 'H' } }],
    text: { 'cast.tam-ho': 'Tám Hổ', 'cast.ho-vang': 'Đàn em Hổ Vàng' } },
];
for (const n of [1, 2, 3, 4, 5]) C.registerChapter(n, () => import(`../app/game/story/content/ch0${n}.ts`));
C.registerChapter(10, () => import('../app/game/story/content/ch10.ts'));
const catalog = await C.loadCatalog([1, 2, 3, 4, 5, 10]);
for (const m of STAND_INS) R.addModule(catalog, m);
const MODULES = [ch1.chapter, ch2.chapter, ch3.chapter, ch4.chapter, ch5.chapter, ...STAND_INS, ch10.chapter];
const SCENES = cs10.CUTSCENES;
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = {};
for (const a of [ch1.ANCHORS, ch2.ANCHORS, ch3.ANCHORS, ch4.ANCHORS, ch5.ANCHORS, ch10.ANCHORS]) for (const [k, v] of Object.entries(a)) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const MISSIONS = ['c10-m1', 'c10-m2', 'c10-m3', 'c10-m4'];
const SPACE_IDS = Object.keys(S.SPACES);
/** The engine contract plus the scene ids chapters 4–5 requested (SCENE_REQUESTS) plus the ids chapter 10 asks for. */
const CONTRACT = Object.fromEntries(Object.entries(ENGINE_CONTRACT).map(([k, v]) => [k, { ...v, ...(SCENE_REQUESTS[k] ?? {}), ...(ch10.ENGINE_NEEDS[k] ?? {}) }]));
const tx = R.makeText(catalog, (n) => ({ cash: 900, debtPaid: 1350, debtTotal: 40000, hintTokens: 2, rescued: 28 })[n]);
const FOLLOWERS = ch10.B2_FOLLOWERS.length;

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
const ops = (id, op) => actsOf(mission(id)).map(([a, at]) => [a, at]).filter(([a]) => a.k === 'do' && a.op === op);
const qkey = (c) => `${c.name}|${JSON.stringify(c.args ?? {})}`;

// ---- mock host (story-ch05.test.mjs, plus keyed queries and engine signals) -------------------------------------

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
    runner: null, choose: structuredClone(o.choose ?? {}), log: [], outs: [], resets: [], missing: [], fails: 0,
    player: { x: 0, z: 0, mode: 'foot', space: null, level: null, crouched: false, hidden: false, speed: 0, carrying: null, cover: null, visibility: 1, locks: null },
    actors: new Map(), vehicles: new Map([['dream', { x: 0, z: 0, state: 'parked' }]]), meters: new Map(), q: new Set(), helpers: new Map(), props: new Map(), hour: 12, alarm: 0,
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
        case 'q': return w.q.has(qkey(c));
        default: return false;
      }
    },
    exec(a, h, ctx) {
      w.log.push({ k: a.k, id: a.id ?? a.target ?? a.op, step: ctx.step, mission: ctx.mission, restoring: ctx.restoring, a });
      switch (a.k) {
        case 'spawn': if (!w.actors.has(a.id)) { const p = resolve(a.at); if (!p) miss(`spawn place ${a.at}`, ctx); w.actors.set(a.id, { state: STATE[a.behaviour?.k ?? 'idle'], sees: false, down: false, x: p?.x ?? 0, z: p?.z ?? 0, space: p?.space ?? null, tags: a.tags ?? [] }); } break;
        case 'despawn': if (a.id) w.actors.delete(a.id); if (a.tag) for (const [k, v] of [...w.actors]) if (v.tags.includes(a.tag)) w.actors.delete(k); break;
        case 'behave': { const x = w.actors.get(a.id); if (!x) miss(`behave ${a.id}`, ctx); else x.state = STATE[a.b.k]; for (const k of ['at', 'post']) if (a.b[k] && !resolve(a.b[k])) miss(`behave place ${a.b[k]}`, ctx); break; }
        case 'bark': if (!w.actors.has(a.actor)) miss(`bark ${a.actor}`, ctx); break;
        case 'vehicle': {
          const v = w.vehicles.get(a.id), st = { drive: 'driving', park: 'parked', stop: 'stopped', flee: 'fleeing' };
          if (a.model || a.at) { const p = a.at ? resolve(a.at) : null; if (a.at && !p) miss(`vehicle place ${a.at}`, ctx); w.vehicles.set(a.id, { x: p?.x ?? v?.x ?? 0, z: p?.z ?? v?.z ?? 0, state: st[a.state ?? 'park'] }); }
          else if (!v) miss(`vehicle ${a.id}`, ctx);
          else if (a.state) v.state = st[a.state];
          for (const x of [a.route ?? []].flat()) if (!resolve(x)) miss(`route ${x}`, ctx);
          break;
        }
        case 'prop': if (a.remove) w.props.delete(a.id); else { if (!resolve(a.at)) miss(`prop place ${a.at}`, ctx); w.props.set(a.id, a.kind); } break;
        case 'tail': if (!w.vehicles.has(a.target) && !w.actors.has(a.target)) miss(`tail ${a.target}`, ctx); w.helpers.set(a.target, a); break;
        case 'photoTarget': case 'clue': case 'eavesdrop': w.helpers.set(a.id, a);
          if (a.k === 'photoTarget' && typeof a.subject === 'string' && !resolve(a.subject) && !w.actors.has(a.subject) && !w.vehicles.has(a.subject)) miss(`photo subject ${a.subject}`, ctx);
          if (a.k === 'clue' && !resolve(a.at)) miss(`clue place ${a.at}`, ctx);
          break;
        case 'stop': w.helpers.delete(a.id); break;
        case 'teleport': { const p = resolve(a.at); if (!p) miss(`teleport ${a.at}`, ctx); else Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: p.level ?? null, mode: a.vehicle ? 'bike' : 'foot', speed: 0 }); break; }
        case 'space':
          if (a.enter) { const p = resolve(`${a.enter}/${a.link}`) ?? resolve(`${a.enter}/${Object.keys(ANCHORS[a.enter] ?? {})[0]}`); if (!p) miss(`space ${a.enter}`, ctx); Object.assign(w.player, { x: p?.x ?? 0, z: p?.z ?? 0, space: a.enter, mode: 'foot', level: null }); }
          if (a.leave) { const p = a.leave === true ? null : resolve(a.leave); Object.assign(w.player, { space: null, mode: 'foot', level: null }, p ? { x: p.x, z: p.z } : {}); }
          if (a.variant && !S.SPACES[a.variant.id]) miss(`space variant ${a.variant.id}`, ctx);
          break;
        case 'player': if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover; if (a.lock !== undefined) w.player.locks = a.lock; break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'time': w.hour = a.hour; break;
        case 'do': for (const [, s] of deep(a.args ?? {})) if (/^[a-z][\w-]*\/[\w]+$/.test(s) && !resolve(s)) miss(`op ${a.op} place ${s}`, ctx); break;
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
      w.helpers.clear(); w.meters.clear(); w.q.clear(); w.props.clear(); w.alarm = 0;
      Object.assign(w.player, { hidden: false, crouched: false, level: null, visibility: 1, locks: null });
    },
    emit(e) { w.outs.push(e); if (e.type === 'fail') w.fails++; if (e.type === 'checkpoint') o.onCheckpoint?.(e, w.runner); },
  };
  return w;
}
function setup(o = {}) {
  const w = mockWorld(o);
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 10 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot ----------------------------------------------------------------------------------------------------

/** Signals the engine raises by itself (the duel); a `do` op with wait latches its own op id. */
const ENGINE_SIGNALS = new Set(Object.keys(CONTRACT.signals));
function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), answered = new Set();
  const kf = (e) => `${key}|${e.type}|${e.id}|${e.evidence ?? ''}|${e.phase ?? ''}`;
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
      case 'q': w.q.add(qkey(c)); return;
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
        if (pushed.has(kf({ type: c.ev, id: c.id, ...(c.where ?? {}) }))) return;
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
        else if (c.ev === 'choice') return;
        else if (c.ev === 'signal' && !ENGINE_SIGNALS.has(c.id)) return; // the latch of the script's own blocking op
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
/** The resolved lines of the last dialogue or call with this id. */
const lines = (w, id) => w.log.findLast((l) => (l.k === 'dialogue' || l.k === 'call') && l.id === id)?.a.lines.map((l) => l.text) ?? [];
function play(id, o = {}) {
  const { r, w } = setup(o);
  assert.equal(r.start(id, o.replay ? { replay: true } : undefined), true, `${id} starts`);
  const res = autopilot(r, w, o);
  return { r, w, res, done: completed(w).at(-1), p: r.progress() };
}

/** The progress at the end of chapter 9 as far as chapter 10 reads it (chapters 6–9 are other batches; their hand-offs per story-final.md and story-decisions.md 13). */
function endOfChapter9(o = {}) {
  const p = F.newProgress();
  for (const m of F.missionOrder(C.CAMPAIGN)) { if (m.chapter >= 10) break; p.completed.push(m.id); }
  Object.assign(p.flags, { arrived: true, dreamMatte: true, knowsB2: true, sawMaiBag: true, filmedLuc: true, sawMoonlight: true, rescued: 11, 'choice:caPhe': 'sua' });
  p.evidence.push('ev-don-dem-quang', 'ev-chi-phuong', 'ev-cuong-seo', 'ev-diem-goi', 'ev-so-do-b2', 'ev-cap-mai', 'ev-sen-than-spa', 'ev-thang-may-b2', 'ev-luc-noi');
  p.abilities.push('phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill', 'faceCover', 'lean', 'throw', 'takedown', 'drag', 'clipCam');
  p.outfits.push('tin-shipper', 'tin-whistle', 'tin-ao-tu');
  Object.assign(p, { cash: 900, chapter: 9, lunar: { month: 8, day: 14 } });
  p.debt.paid = 1350;
  if (o.kills) { p.conscience.kills = o.kills; p.conscience.byCause.bullet = o.kills; }
  return p;
}
const START = endOfChapter9();
const before = new Map();

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapter 10 loads through the registry beside chapters 1–5 and lints clean against the real sites and the contract plus its needs', () => {
  assert.deepEqual([...catalog.missions.keys()].filter((id) => id.startsWith('c10-')), MISSIONS);
  for (const id of MISSIONS) assert.equal(catalog.meta.get(id).chapter, 10);
  const lint = R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: CONTRACT });
  // stand-ins carry cast only (their missions are reported missing); chapters 1–5 are linted by their own tests
  assert.deepEqual(lint.filter((s) => !/^c[6-9]-m\d+: no mission script in chapter [6-9]$/.test(s) && !/^c[1-5]-m\d+[/: ]/.test(s)), []);
  assert.deepEqual(['c10-m1', 'c10-m2', 'c10-m3', 'c10-m4'].map((id) => catalog.missions.get(id).chain), ['c10-m2', 'c10-m3', 'c10-m4', 'c11-m1'], 'one continuous night into chapter 11');
  for (const id of MISSIONS) {
    const m = mission(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.25, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
    assert.equal(m.lethal, 'fail', `${id}: LƯƠNG TÂM, nobody dies`);
    assert.ok(m.steps.every((s) => s.minutes > 0));
    assert.equal(m.start.lunar, 15, `${id}: Rằm`);
  }
  assert.equal(MISSIONS.reduce((t, id) => t + catalog.meta.get(id).minutes, 0), 25, 'chapter 10 is 25 of the 235 planned minutes');
  assert.deepEqual(MISSIONS.map((id) => catalog.meta.get(id).giver), ['van', 'quang', 'mai', 'diem']);
});

test('ENGINE_NEEDS: every id the chapter adds to the contract is used by it, has a lane, and lints only with it', () => {
  const used = new Set();
  for (const m of ch10.chapter.missions) if (m.start?.outfit) used.add(`outfits:${m.start.outfit}`);
  for (const m of ch10.chapter.missions) for (const [a] of actsOf(m)) {
    if (a.k === 'do') used.add(`ops:${a.op}`);
    if (a.k === 'player' && a.outfit) used.add(`outfits:${a.outfit}`);
    if (a.k === 'stealth' && a.arena) used.add(`arenas:${a.arena}`);
    if (a.k === 'unlock' && a.ability) used.add(`abilities:${a.ability}`);
    if (a.k === 'player' && a.carry) used.add(`carry:${a.carry}`);
    const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
    if (b?.k === 'act') used.add(`acts:${b.name}`);
    if (a.k === 'spawn' && a.template) used.add(`templates:${a.template}`);
    if (a.k === 'prop' && a.kind) used.add(`props:${a.kind}`);
    if (a.k === 'vehicle' && a.model) used.add(`models:${a.model}`);
  }
  for (const m of ch10.chapter.missions) {
    for (const [c] of condsOf(m)) if (c.k === 'on' && c.ev === 'signal') used.add(`signals:${c.id}`);
    for (const s of m.steps) for (const x of s.meters ?? []) if (!x.flag) used.add(`meters:${x.id}`);
  }
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) used.add(`${k === 'rides' ? 'rideModels' : k}:${id}`);
  const LANES = new Set(['core', 'director', 'spaces', 'stealth', 'vehicles', 'police', 'world', 'ui', 'audio']);
  for (const [kind, ids] of Object.entries(ch10.ENGINE_NEEDS)) {
    assert.ok(kind in ENGINE_CONTRACT, `contract kind ${kind}`);
    for (const [id, [lane, what]] of Object.entries(ids)) {
      assert.ok(used.has(`${kind}:${id}`), `need ${kind} '${id}' is used by chapter 10`);
      assert.ok(LANES.has(lane) && what.length > 10, `need ${kind} '${id}' names its lane and what it does`);
      const landed = ENGINE_CONTRACT[kind][id] ?? SCENE_REQUESTS[kind]?.[id];
      if (landed) assert.equal(landed[0], lane, `${kind} '${id}' landed in contract.ts with the lane chapter 10 asked for`);
    }
  }
  // without the needs the lint names each of them (so the list is exactly what the contract still lacks)
  const plain = R.lintContent(C.CAMPAIGN, [ch10.chapter, ...STAND_INS, ch1.chapter, ch2.chapter, ch3.chapter, ch4.chapter, ch5.chapter], { engine: ENGINE_CONTRACT })
    .filter((s) => /^c10-/.test(s) && / is not in the engine contract/.test(s));
  const missing = new Set(plain.map((s) => s.match(/: (\w+) '([^']+)' is not/).slice(1).join(':')));
  for (const k of missing) { const i = k.indexOf(':'), kind = k.slice(0, i), id = k.slice(i + 1); assert.ok(ch10.ENGINE_NEEDS[kind]?.[id], `lint without needs: ${k} must be listed in ENGINE_NEEDS`); }
  // every need is either still missing from ENGINE_CONTRACT (the lint names it) or has landed in contract.ts (wave-2 integration)
  for (const [kind, ids] of Object.entries(ch10.ENGINE_NEEDS)) for (const id of Object.keys(ids)) assert.ok(missing.has(`${kind}:${id}`) || CAMPAIGN_CONTRACT[kind]?.[id], `${kind} '${id}' is either missing from the contract or in it`);
});

test('texts: every reference resolves, no inline strings, no orphan keys, no real brands, the ring only via {@ring}, lines fit', () => {
  const tables = [common.COMMON, t1.TEXT, t2.TEXT, t3.TEXT, t4.TEXT, t5.TEXT, t10.TEXT, ...STAND_INS.map((m) => m.text)];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'text keys are unique across chapters 1–5, 10, the stand-ins and the common table');
  for (const k of Object.keys(t10.TEXT)) assert.match(k, /^(c10m[1-4]\.|cs09\.|cs10\.|cs11\.|cast\.|ev\.c10\.|j\.c10\.)/, `${k}: chapter 10 key namespace`);
  const used = new Set();
  const sources = [ch10.chapter, SCENES];
  for (const [, s] of deep(sources)) if (isRef(s)) { assert.ok(keys.has(s.slice(1)) || catalog.text.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const v of Object.values(t10.TEXT)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) { assert.ok(keys.has(m[1]), `missing {@${m[1]}}`); used.add(m[1]); }
  assert.deepEqual(Object.keys(t10.TEXT).filter((k) => !used.has(k)), [], 'every chapter 10 text key is used');
  const inline = [];
  for (const m of ch10.chapter.missions) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...ch10.EVIDENCE, ...ch10.JOURNAL]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of ch10.CAST) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const q of ch10.QUESTIONS) for (const t of [q.prompt, q.hint, ...q.options.map((x) => x.text)]) if (!isRef(t)) inline.push(`question ${q.id}: ${t}`);
  for (const sc of SCENES) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  // engine op arguments carry ids and '@keys' only (QTE labels and counts are '@keys')
  for (const m of ch10.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'do') for (const [k, v] of deep(a.args ?? {})) if (/[^\x20-\x7e]/.test(v)) inline.push(`${at} ${a.op}.${k}: ${v}`);
  assert.deepEqual(inline, []);
  for (const k of Object.keys(t10.TEXT)) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/Sen Vàng|SEN VÀNG/.test(t10.TEXT[k]), `${k}: the ring is named through {@ring}/{@ringUpper}, never written out`);
    assert.ok(!/\b(Dream|Vios|GiaoNhanh|GN-\d)/.test(v), `${k}: working names of the bible stay out of the text`);
  }
  assert.equal(tx('@c10m4.v2'), 'Trực thăng Sen Vàng vừa xin bay lúc một giờ sáng.', 'the ring comes from {@ring}');
  assert.equal(tx('@c10m3.toast.cuu'), 'ĐÃ CỨU: 28', 'the counter reads the rescued flag');
  const lines = [];
  for (const m of ch10.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') lines.push(...a.lines.map((l) => [m.id, l.text]));
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') lines.push([sc.id, c.text]);
  for (const [at, ref] of lines) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of ch10.chapter.missions) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long: ${tx(s.objective)}`);
    for (const s of m.steps) for (const x of s.subs ?? []) assert.ok(tx(x.text).length <= 60, `${m.id}/${s.id}: sub too long`);
    for (const [a, at] of actsOf(m)) {
      if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long: ${tx(a.text)}`);
      if (a.k === 'sms' || a.k === 'bark' || a.k === 'toast') assert.ok(tx(a.text).length <= 90, `${at}: ${a.k} too long`);
    }
  }
  // the bible's lines, as the bible has them (story-final.md CS09–CS11, c10-m2 and c10-m4)
  for (const [k, v] of [['cs09.van', 'Mười giờ. Cắt đi.'], ['cs09.tin', 'Đi giao đơn cuối thôi.'], ['cs10.mai5', 'Mọi người nắm tay nhau. Đứa nhỏ đi giữa.'], ['cs10.mai6', 'Không ai bị bỏ lại.'],
    ['cs11.mai1', 'Ông nói với tôi ông cũng có em gái mà!'], ['cs11.tin2', 'Ông Tư nói tao giết mày là tao thành tụi mày.'], ['cs11.coba1', 'Về rồi. Về hết rồi.'],
    ['c10m3.cs.q4', 'Lần này... tao giao hàng đúng hẹn ha mậy.'], ['c10m4.cs.q2', 'Chạy đi... đơn cuối mà.']]) assert.equal(t10.TEXT[k], v, k);
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
      if (a.k === 'do' && a.op === 'tracker') assert.ok(S.SITES[a.args.route]?.kind === 'route', `${at}: tracker route ${a.args.route} is a sites.ts route`);
      if (a.k === 'do') for (const [, s] of deep(a.args ?? {})) if (/^[a-z][\w-]*\/\w+$/.test(s) || PLACES[s] || /^[a-z][\w-]*\.\w+$/.test(s)) { if (!s.startsWith('@')) check(id, s, `${at} ${a.op}`); }
      if (a.k === 'photoTarget' && typeof a.subject === 'string' && (a.subject.includes('.') || a.subject.includes('/'))) check(id, a.subject, at);
      if (a.k === 'space' && a.enter) { refs.get(id).add(`${a.enter}/`); if (a.link) { assert.ok(ANCHORS[a.enter]?.[a.link], `${at}: entry link ${a.link} is an anchor of ${a.enter}`); refs.get(id).add(`${a.enter}/${a.link}`); } }
      if (a.k === 'space' && a.variant) refs.get(id).add(`${a.variant.id}/`);
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
  // the numbered cutscenes are played by the missions CUTSCENE_SITES gives them, at the places it names
  for (const [cs, d] of Object.entries(S.CUTSCENE_SITES).filter(([, d]) => d.mission.startsWith('c10-'))) {
    const sc = SCENE.get(cs);
    assert.ok(sc, `${cs} exists`);
    assert.equal(sc.mission, d.mission);
    const strings = new Set([...SCENES.filter((s) => s.id.startsWith(cs.slice(0, 4)))].flatMap((s) => [...deep(s)].map(([, v]) => v)));
    for (const site of d.sites) assert.ok([...strings].some((v) => v === site || v.startsWith(`${site}.`)), `${cs} is staged at ${site}`);
    for (const sp of d.spaces ?? []) assert.ok([...strings].some((v) => v === sp || v.startsWith(`set:${sp}.`)), `${cs} uses set ${sp}`);
  }
  // every anchor and chapter place chapter 10 declares is used by its scripts or its cutscenes
  const all = new Set([...refs.values()].flatMap((s) => [...s]));
  for (const sc of SCENES) for (const [, s] of deep(sc)) { const m = s.match(/^set:([\w-]+)\.(\w+)$/); if (m) all.add(`${m[1]}/${m[2]}`); }
  for (const [space, anchors] of Object.entries(ch10.ANCHORS)) for (const a of Object.keys(anchors)) assert.ok(all.has(`${space}/${a}`) || [...deep(ch10.chapter)].some(([, s]) => s === `${space}/${a}`), `anchor ${space}/${a} is used`);
  for (const k of Object.keys(ch10.PLACES)) assert.ok(all.has(k), `chapter place ${k} is used`);
  // chapter places sit next to the validated sites.ts spots they stand in for (same sidewalk or lane, within 30 m)
  for (const [k, p] of Object.entries(ch10.PLACES)) assert.ok(Object.values(S.SITES.moonlight.spots).some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 30), `${k} is on the strip`);
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
/** The rescued (story cast and captive templates): dignified poses only; Mai, free in this chapter, may also stand, kneel and sit. */
const RESCUED = new Set(['mai', 'be-na']);
const RESCUED_POSES = new Set([...SCENE_SCHEMA.POSES_DIGNIFIED, 'stand', 'squat', 'sit']);
const GENTLE_CLIPS = new Set(['wipe-tears']);
const GENTLE_PAIRS = new Set(['forehead-touch', 'hug', 'tie-bracelet', 'hand-on-shoulder']);
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle', 'kick', 'stab']);
test('cutscenes: durations add up, marks, cast, sets and lines resolve, nobody is struck, the rescued keep their dignity, every scene is played by its mission', () => {
  const played = new Map();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) if (a.k === 'cutscene') played.set(a.id, [...(played.get(a.id) ?? []), id]);
  assert.equal(SCENE.size, SCENES.length, 'scene ids are unique');
  assert.deepEqual([...played.keys()].sort(), [...SCENE.keys()].sort(), 'every scene the missions play exists, and every scene is played');
  for (const sc of SCENES) {
    assert.deepEqual([...new Set(played.get(sc.id))], [sc.mission], `${sc.id} is played by ${sc.mission} only`);
    const total = sc.shots.reduce((t, s) => t + s.dur, 0);
    assert.ok(Math.abs(total - sc.seconds) < 1e-9, `${sc.id}: shots add to ${total}, not ${sc.seconds}`);
    assert.ok(sc.seconds <= (/^cs\d\d/.test(sc.id) ? 45 : 40), `${sc.id}: a short in-engine scene (${sc.seconds} s)`);
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
    const rescued = (who) => { const v = sc.cast[who]; return typeof v === 'string' && (RESCUED.has(v) || CAPTIVE.test(v.replace(/^tpl:/, ''))); };
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
          if (rescued(c.a) || rescued(c.b)) assert.ok(GENTLE_PAIRS.has(c.clip), `${sc.id}: ${c.clip} with a rescued person`);
        }
        if (c.k === 'anim') { assert.ok(!ROUGH.has(c.clip), `${sc.id}: ${c.clip} on screen (violence happens in play, never staged)`); if (rescued(c.who)) assert.ok(GENTLE_CLIPS.has(c.clip), `${sc.id}: ${c.clip} on a rescued person`); }
        if (c.k === 'place' && rescued(c.who) && c.pose) assert.ok(RESCUED_POSES.has(c.pose), `${sc.id}: ${c.who} posed ${c.pose}`);
        if (c.at !== undefined && c.at !== null) mark(c.at, `${where} ${c.k}`);
        if (c.k === 'walk' || c.k === 'ride') c.path.forEach((m) => mark(m, `${where} ${c.k}`));
        if (c.k === 'prop' && c.attach) mark(c.attach, `${where} prop`);
        if (c.if) assert.doesNotThrow(() => setup().r.test(c.if));
      }
    });
  }
  // no blood, no impact: the shot that hits Quang is heard over black
  const q = SCENE.get('c10m3-quang');
  const gun = q.shots.findIndex((sh) => (sh.cues ?? []).some((c) => c.k === 'sfx' && c.id === 'gunshot-echo'));
  assert.ok(gun >= 0 && q.shots[gun + 1].cam.k === 'black', 'the shot cuts to black');
  // the rescued are numbered as the escort has them: Mai and Bé Na in cell 4, the extras of CS10 the other fourteen
  const cs = SCENE.get('cs10_doan_tu'), extrasN = Object.values(cs.cast).filter((v) => typeof v === 'object').reduce((n, v) => n + v.count, 0);
  assert.equal(extrasN + 3, FOLLOWERS, 'CS10 shows all seventeen');
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

test('no slow motion in interactive play: slowmo only in freezeWorld scenes; the CS11 QTEs are scene QTEs that hold the frame, loop and cannot kill', () => {
  for (const sc of SCENES) if (sc.shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'slowmo'))) assert.equal(sc.stage.freezeWorld, true, `${sc.id}: slowmo outside freezeWorld`);
  // escort-boss-qte.md §3.4: c10m3-roll and c10m3-choke are context 'scene', a director Wait inside CS11 (scene.ts cue 'qte'),
  // never a play prompt over gameplay that does not show the pin
  assert.deepEqual(MISSIONS.flatMap((id) => ops(id, 'qte')), [], 'no play QTE in chapter 10');
  const cs11 = SCENE.get('cs11_dem_toi_nam'), labels = cs11.shots.map((sh) => sh.label);
  const qtes = cs11.shots.flatMap((sh) => (sh.cues ?? []).filter((c) => c.k === 'qte').map((c) => [c, sh.label]));
  assert.deepEqual(qtes.map(([c]) => c.id), ['c10m3-roll', 'c10m3-choke'], 'the two QTEs of CS11 (escort-boss-qte.md §3.4)');
  for (const [c, shot] of qtes) {
    assert.ok(c.window >= 1, `${c.id}: a real-seconds window of at least a second`);
    assert.equal(c.onFail, 'loop', `${c.id}: a failure replays from its shot`);
    assert.ok(labels.includes(c.loop ?? shot) && labels.indexOf(c.loop ?? shot) <= labels.indexOf(shot), `${c.id}: loops back to a shot label of the scene`);
    for (const k of Object.keys(c)) assert.ok(!/time|scale|slow/i.test(k), `${c.id}: no time scale argument (${k})`);
  }
  assert.ok(CONTRACT.ops.qte, 'ops.qte owns scene QTEs too');
  const choke = qtes.find(([c]) => c.id === 'c10m3-choke')[0];
  assert.equal(choke.kind, 'band'); assert.equal(choke.lethal, false);
  assert.deepEqual([choke.target, choke.count], [3, ['@c10m3.dem1', '@c10m3.dem2', '@c10m3.dem3']], 'the QTE counts "Một… hai… ba…", the scene finishes "…bốn… năm." (bible CS11 shots 4–5)');
  assert.ok(cs11.shots.flatMap((sh) => sh.cues ?? []).some((c) => c.k === 'say' && c.text === '@cs11.tin1'));
  assert.equal(cs11.stage.freezeWorld, true, 'the scene that holds the QTEs freezes the world');
  // the play state after CS11 matches its last frame: Cường out cold and neutral, his men given up, the suppression over
  const guc = mission('c10-m3').steps.find((s) => s.id === 'guc');
  assert.deepEqual(guc.enter.filter((a) => a.k === 'cutscene').map((a) => a.id), ['cs11_dem_toi_nam']);
  assert.ok(guc.enter.some((a) => a.k === 'spawn' && a.id === 'cuong' && a.team === 'neutral' && a.behaviour.k === 'act'), 'Cường lies out cold, no longer hostile');
  assert.ok(guc.enter.some((a) => a.k === 'do' && a.op === 'ally' && a.args.stop), 'Vân stops firing at the cover');
  for (const id of ['dan-em-1', 'dan-em-2', 'dan-em-3', 'dan-em-4', 'dan-em-5']) assert.ok(guc.enter.some((a) => a.k === 'behave' && a.id === id && a.b.k === 'surrender'), `${id} gives up`);
  for (const [a] of ops('c10-m3', 'duel')) for (const k of Object.keys(a.args)) assert.ok(!/time|scale|slow/i.test(k), `duel: no time scale (${k})`);
  // the only prompt over the pistol is "Còng tay": no other interaction, fire locked, the pistol a prop
  const cuff = mission('c10-m3').steps.find((s) => s.id === 'cong-tay');
  assert.deepEqual(cuff.interact.map((x) => x.id), ['cong-tay']);
  assert.ok(cuff.enter.some((a) => a.k === 'player' && a.lock?.includes('fire')));
  assert.ok(guc.enter.some((a) => a.k === 'prop' && a.kind === 'pistol-floor') && CONTRACT.props['pistol-floor']);
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) assert.ok(!(a.k === 'interactable' || a.k === 'player') || !/sung|gun|pistol/.test(a.id ?? a.carry ?? ''), 'no pistol pickup anywhere');
});

test('the escort of seventeen: ids, ages, children in the middle, cells, the release on the street; the rescued count goes 11 → 28', () => {
  const fs = ch10.B2_FOLLOWERS;
  assert.equal(fs.length, 17);
  assert.equal(new Set(fs.map((x) => x.id)).size, 17);
  assert.deepEqual(fs.filter((x) => x.hero).map((x) => x.id), ['mai', 'be-na']);
  for (const x of fs) {
    assert.ok(['mai', 'be-na', 'captive-child', 'captive-teen', 'captive-adult'].includes(x.look), `${x.id}: look ${x.look}`);
    assert.ok(x.look === x.id || CONTRACT.templates[x.look], `${x.id}: an extras template or a story cast`);
    assert.ok(ANCHORS['moonlight-b2'][x.cell.split('/')[1]], `${x.id}: cell ${x.cell}`);
  }
  assert.deepEqual(Object.fromEntries(['child', 'teen', 'adult'].map((a) => [a, fs.filter((x) => x.age === a).length])), { child: 5, teen: 8, adult: 4 });
  const spawns = MISSIONS.flatMap((id) => ops(id, 'escort')).map(([a]) => a.args).filter((x) => x.spec);
  assert.ok(spawns.length >= 4);
  for (const s of spawns) {
    assert.equal(s.spec.order, 'kids-middle', '"Đứa nhỏ đi giữa"');
    assert.equal(s.spec.hands, true, '"Mọi người nắm tay nhau"');
    assert.equal(s.spec.leader, 'player');
    assert.equal(s.spec.release, 'moonlight-floor/front', 'released inside the front doors, in the set the group walks (escort trails never cross a space transition)');
    assert.ok(resolve(s.spec.release), `release ${s.spec.release}`);
    for (const x of s.spec.safe) assert.ok(resolve(x), `safe spot ${x}`);
  }
  const set = actsOf(mission('c10-m3')).map(([a]) => a).find((a) => a.k === 'flag' && a.name === 'rescued');
  assert.equal(set.value, 11 + 17, 'story-decisions.md 13: 11 (barge) + 17 (B2, Mai included) = 28');
  assert.equal(START.flags.rescued, 11, 'chapter 7 leaves 11');
});

test('every flag and mission variable a chapter 10 condition reads is written by chapters 1–5 and 10 (or is a choice result)', () => {
  const written = new Set(), read = [];
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  for (const m of [ch1, ch2, ch3, ch4, ch5, ch10].flatMap((c) => c.chapter.missions)) { for (const [a] of actsOf(m)) note(a); for (const a of m.rewards ?? []) note(a); }
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
    for (const f of Object.keys(m.replay?.flags ?? {})) assert.ok(written.has(f) || f === 'rescued', `${id} replay sets ${f}, which play also sets`);
  }
  for (const [n, at] of read) assert.ok(written.has(n), `${at}: reads flag ${n} that nothing sets`);
  const given = new Set(ch10.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a).filter((a) => a.k === 'give').map((a) => a.item)));
  // a take inside an if on that very item reads an earlier chapter's gift safely (Mai's hairclip, c8-m3)
  const guarded = new Set(ch10.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a).filter((a) => a.k === 'if' && a.c.k === 'item' && a.then.some((t) => t.k === 'take' && t.item === a.c.id)).map((a) => a.c.id)));
  for (const m of ch10.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'take') assert.ok(given.has(a.item) || guarded.has(a.item), `${at}: takes ${a.item}`);
});

test('steps only wait for what the script offers: interactions, climbs, evidence sources, contract signals, queries of built lanes and meters', () => {
  const METERS = new Set(Object.keys(CONTRACT.meters)), wave = CHAPTER_WAVE[10] ?? 4;
  for (const id of MISSIONS) {
    const m = mission(id), acts = actsOf(m).map(([a]) => a);
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id)), climbs = new Set(specs.filter((x) => x.kind === 'climb').map((x) => x.id));
    for (const x of specs) if (x.kind === 'climb') assert.ok(x.to && PLACES[x.to], `${id}: climb ${x.id} has a far end on the map`);
    const sources = new Set([...acts.filter((a) => a.k === 'evidence').map((a) => a.id), ...acts.filter((a) => (a.k === 'photoTarget' || a.k === 'clue') && a.evidence).map((a) => a.evidence)]);
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id) && !climbs.has(c.id), `${at}: waits for interaction ${c.id}`);
      if (c.k === 'on' && c.ev === 'climb') assert.ok(climbs.has(c.id), `${at}: waits for climb ${c.id}`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(CONTRACT.signals[c.id] || CONTRACT.ops[c.id], `${at}: signal ${c.id}`);
      if (c.k === 'evidence' && ch10.EVIDENCE.some((e) => e.id === c.id)) assert.ok(sources.has(c.id), `${at}: evidence ${c.id} has a source in ${id}`);
      if (c.k === 'meter') assert.ok(METERS.has(c.id) || /^(tail|eavesdrop):/.test(c.id), `${at}: meter ${c.id}`);
      if (c.k === 'q') {
        const entry = CONTRACT.queries[c.name];
        assert.ok(entry, `${at}: query ${c.name} is in the contract`);
        assert.ok(LANE_WAVE[entry[0]] <= wave, `${at}: query ${c.name} is built by the ${entry[0]} lane in wave ${LANE_WAVE[entry[0]]}, chapter 10 plays in wave ${wave}`);
        assert.equal(c.args.id, 'b2', `${at}: the escort group`);
      }
    }
    for (const a of acts) if (a.k === 'do') assert.ok(CONTRACT.ops[a.op], `${id}: op ${a.op}`);
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(x.flag || METERS.has(x.id), `${id}/${s.id}: meter ${x.id} has a source`);
  }
});

test('case board: chapter 10 cards are evidence with a source, the strings tie them to chapters 2, 4 and 5 and the board solves', () => {
  const ids = [...new Set([...ch10.BOARD_CARDS.map((c) => c.id), ...ch10.BOARD_LINKS.flat()])];
  const board = { id: 'test-ch10', title: '@cast.tin', cards: ids.map((id) => ({ id })), links: ch10.BOARD_LINKS };
  const evidence = new Set(catalog.evidence.keys());
  const all = [...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS, ...ch3.BOARD_CARDS, ...ch4.BOARD_CARDS, ...ch5.BOARD_CARDS, ...ch10.BOARD_CARDS], slots = all.map((c) => c.slot);
  assert.equal(new Set(slots).size, slots.length, `one card per lotus slot across chapters 1–5 and 10 (${slots.join(',')})`);
  assert.ok(ch10.BOARD_CARDS.every((c) => c.slot >= 70 && c.slot < 80), 'chapter 10 keeps to its slot band 70–79 (chapters 6–9 took 34–44, 46–51, 54–61, 90–95)');
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, 'no card twice');
  for (const old of ['ev-so-do-b2', 'ev-luc-noi', 'ev-cap-mai', 'ev-sen-than-spa', 'ev-diem-goi', 'ev-chi-phuong']) assert.ok(ch10.BOARD_LINKS.flat().includes(old), `ties to ${old}`);
  assert.deepEqual(D.lintBoard(board, evidence), []);
  const seen = new Set([ids[0]]), todo = [ids[0]];
  while (todo.length) { const a = todo.pop(); for (const [x, y] of board.links) for (const [p, q] of [[x, y], [y, x]]) if (p === a && !seen.has(q)) { seen.add(q); todo.push(q); } }
  assert.equal(seen.size, ids.length, 'every card is on a string');
  const p = F.newProgress(); p.evidence.push(...ids);
  let solved = false;
  for (const [a, b] of board.links) solved = D.linkCards(board, p, a, b, (id) => p.evidence.includes(id)).solved;
  assert.equal(solved, true);
  for (const c of ch10.BOARD_CARDS) assert.equal(ch10.EVIDENCE.find((e) => e.id === c.id)?.chapter, 10, `${c.id} is a chapter 10 card`);
  const sources = new Set();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) {
    if (a.k === 'evidence') sources.add(a.id);
    if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence);
  }
  assert.deepEqual(ch10.EVIDENCE.map((e) => e.id).filter((e) => !sources.has(e)), []);
  // the deduction rests on two of them
  assert.deepEqual(catalog.questions.get('muoiHaiNguoi').options.find((o) => o.id === 'xe-lanh').needs, ['ev-so-xuat-b2', 'ev-dinh-vi-chay']);
});

test('chapter 6 and 9 stand-ins agree with content/ch06.ts and ch09.ts when those chapters are built', async (t) => {
  for (const m of STAND_INS) {
    const url = new URL(`../app/game/story/content/ch0${m.chapter}.ts`, import.meta.url);
    if (!existsSync(url)) { t.diagnostic(`content/ch0${m.chapter}.ts is not built yet`); continue; }
    let mod;
    try { mod = await import(url.href); } catch (e) { t.diagnostic(`content/ch0${m.chapter}.ts does not load yet (${e.message.split('\n')[0]})`); continue; }
    const cast = new Set((mod.chapter?.cast ?? mod.CAST ?? []).map((c) => c.id));
    for (const c of m.cast) assert.ok(cast.has(c.id), `chapter ${m.chapter} defines cast '${c.id}', which chapter 10 speaks with`);
  }
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

const snapshots = [];
const CHECKPOINTS = [
  'c10-m1/qua-pho', 'c10-m1/mai-ton', 'c10-m1/qua-van', 'c10-m1/hanh-lang', 'c10-m1/thang-may',
  'c10-m2/kho-lanh', 'c10-m2/phong-camera', 'c10-m2/hanh-lang-sen', 'c10-m2/dan-ra', 'c10-m2/hai-ten-gac', 'c10-m2/cau-thang',
  'c10-m3/hiep-1', 'c10-m3/hiep-2', 'c10-m3/hiep-3', 'c10-m3/ra-cua',
];

test('main path: one save plays c10-m1 → c10-m4 end to end on the mock host from the end of chapter 9', () => {
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
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [10], 'the chapter card shows once');
  assert.deepEqual(p.lunar, { month: 8, day: 15 });
  assert.equal(p.flags.rescued, 28, 'ĐÃ CỨU: 28');
  for (const f of ['cutPower', 'ramBlackout', 'b2CamerasOff', 'foundMai', 'b2Out', 'ledOutOfB2', 'quangShot', 'cuongCuffed', 'maiSafe', 'b2Freed', 'suTaken', 'heliAt1', 'knowsTruck', 'twoOrders']) assert.equal(p.flags[f], true, f);
  assert.equal(p.flags.boughtMooncake, undefined, 'the mooncake is optional');
  assert.equal(p.flags['choice:traLoiQuang'], 'hen');
  assert.equal(p.items['chia-khoa-b2'], undefined, 'the keys open the cells and are gone');
  for (const e of ['ev-so-xuat-b2', 'ev-sen-b2', 'ev-dinh-vi-chay', 'ev-su-bi-bat', 'ev-truc-thang-1h']) assert.ok(p.evidence.includes(e), e);
  for (const j of ['j-dem-ram', 'j-gap-mai', 'j-quang-do-dan', 'j-cuong-bi-cong', 'j-hai-don']) assert.ok(p.journal.includes(j), j);
  assert.deepEqual(p.deductions.muoiHaiNguoi, { answer: 'xe-lanh', tries: 1 });
  assert.equal(p.conscience.knockouts, 3, 'the camera operator and the two returning guards');
  assert.equal(p.conscience.kills, 0);
  assert.equal(F.conscienceTier(p.conscience), 'clean');
  for (const sc of SCENES) assert.ok(p.seen.includes(sc.id), `${sc.id} played`);
  // the night: festival on in every mission, the strip dark after the cut, the escort spawned, released, the duel's three phases
  for (const id of MISSIONS) assert.ok(w.log.some((l) => l.mission === id && l.k === 'do' && l.a.op === 'festival'), `${id}: the festival`);
  assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'power' && l.step === 'cat-dien'), 'the strip goes dark at the transformer');
  assert.deepEqual(w.log.filter((l) => l.k === 'do' && l.a.op === 'duel' && l.a.args.phase).map((l) => l.a.args.phase), [1], 'the duel starts once and moves through its phases itself');
  for (const step of ['hiep-2', 'hiep-3']) {
    const acts = w.log.filter((l) => l.mission === 'c10-m3' && l.step === step && (['teleport', 'spawn'].includes(l.k) || (l.k === 'do' && ['duel', 'escort', 'ally'].includes(l.a.op))));
    assert.deepEqual(acts, [], `${step}: crossing a threshold neither moves the player nor restarts the fight`);
  }
  // the dispatch sheet goes to Vân at once; the cells open with 'free' before the line forms
  assert.deepEqual(lines(w, 'c10m2-so'), [tx('@c10m2.think.so1'), tx('@c10m2.t.so'), tx('@c10m2.v.so'), tx('@c10m2.think.so2')]);
  const doanTu = w.log.filter((l) => l.mission === 'c10-m2' && l.step === 'doan-tu' && l.k === 'do' && l.a.op === 'escort').map((l) => l.a.args.cmd?.k);
  assert.deepEqual(doanTu, ['free', 'follow'], 'caged in the cells until free (escort-boss-qte.md §1.3, §1.6)');
  // Diễm will testify (chapter 9's lock); Vân lost the truck at the back yard; Mai gets her hairclip back
  assert.ok(lines(w, 'c10m4-diem').includes(tx('@c10m4.d5')) && lines(w, 'c10m4-van').includes(tx('@c10m4.v1b')));
  assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'escort' && l.a.args.cmd?.k === 'release'));
  assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'tracker' && l.a.args.on));
  assert.deepEqual(w.log.filter((l) => l.k === 'do' && l.a.op === 'qte'), [], 'the CS11 QTEs are scene cues, not play prompts');
  assert.ok(w.log.some((l) => l.k === 'dialogue' && l.id === 'c10m3-van-cuoi' && l.a.lines[0].text === tx('@c10m3.van.sach')), 'clean: Vân says Ông Tư would smile');
  assert.ok(w.log.some((l) => l.k === 'call' && l.id === 'c10m4-ma'), 'Mai calls Má');
  assert.deepEqual(snapshots.map((x) => `${x.id}/${x.step}`), CHECKPOINTS, 'every checkpoint of the main path saved');
  assert.equal(snapshots.find((x) => x.step === 'hanh-lang-sen').save.progress.items['chia-khoa-b2'], 1, 'the master keys from the rack, once');
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
    if (step !== 'qua-pho' && step !== 'mai-ton' && id === 'c10-m1') assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'power'), `${id}/${step}: the strip stays dark on a restore`);
  }
});

test('c10-m1: seen three times in the festival crowd skips to the roof; the mooncake bought for Mai', () => {
  const crowd = play('c10-m1', {
    progress: before.get('c10-m1'),
    hold: { 'qua-pho': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'canh-pho-1' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c10m1.fail.nhanRa')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(crowd.res.visits['mai-ton'] && !crowd.res.visits['cong-sau'], 'the skip lands on the roof');
  assert.deepEqual([crowd.done.stats.skipped, crowd.done.result.grade], [1, 'C']);
  const banh = play('c10-m1', { progress: before.get('c10-m1'), optional: ['banh'] });
  assert.equal(banh.p.flags.boughtMooncake, true);
  assert.equal(banh.p.items['banh-nuong'], 1);
  assert.equal(banh.p.cash, before.get('c10-m1').cash - 60, 'sixty thousand đồng');
  assert.equal(banh.done.result.eye, true);
  // CS10 and the ambulance pick their line by the mooncake
  const { r } = setup({ progress: banh.p });
  const bought = SCENE.get('cs10_doan_tu').shots.flatMap((sh) => sh.cues).filter((c) => c.k === 'say' && c.if);
  assert.deepEqual(bought.filter((c) => r.test(c.if)).map((c) => c.text), ['@cs10.tin2b']);
  for (const run of [crowd, banh]) { assert.deepEqual(run.w.missing, []); assert.equal(F.conscienceTier(run.p.conscience), 'clean'); }
});

test('c10-m2: three detections in the office skip to the corridor with the keys and the sheet; three in the corridor skip to the reunion; a recaptured follower is a hint, not a fail', () => {
  const office = play('c10-m2', {
    progress: before.get('c10-m2'),
    hold: { 'phong-camera': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'gac-camera' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c10m2.fail.lo')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(office.res.visits['hanh-lang-sen']);
  assert.deepEqual([office.p.flags.b2CamerasOff, office.p.flags.b2OfficeDone, office.p.items['chia-khoa-b2']], [true, true, undefined], 'the skip counts the cameras and the keys (used at the cell)');
  assert.ok(office.p.evidence.includes('ev-so-xuat-b2'), 'the sheet the c10-m4 deduction rests on');
  const corridor = play('c10-m2', {
    progress: before.get('c10-m2'),
    hold: { 'hanh-lang-sen': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'gac-lim' }); return true; } return false; } },
    onFail: (v) => (v.failure.canSkip ? 'skip' : 'retry'),
  });
  assert.ok(!corridor.res.visits['hanh-lang-sen'] || corridor.res.visits['dan-ra'], 'the skip lands at the reunion');
  assert.ok(corridor.p.evidence.includes('ev-sen-b2') && corridor.p.flags.foundMai);
  assert.ok(corridor.p.seen.includes('cs10_doan_tu'), 'the reunion always plays');
  const led = play('c10-m2', {
    progress: before.get('c10-m2'),
    hold: { 'dan-ra': ({ visit, push }) => { if (visit === 1) { push({ type: 'caught', id: 'b2-t3' }); } return false; } },
  });
  assert.ok(led.w.log.some((l) => l.k === 'hint' && l.a.text === tx('@c10m2.hint.batLai')));
  assert.deepEqual(outs(led.w, 'fail'), []);
  assert.equal(led.done.result.ghost, true, 'Bóng ma with no detection');
  const tuDong = play('c10-m2', { progress: before.get('c10-m2'), optional: ['tu-dong', 'man-hinh'] });
  assert.equal(tuDong.done.result.eye, true);
  assert.ok(tuDong.p.evidence.includes('ev-man-hinh-b2'));
  for (const run of [office, corridor, led, tuDong]) { assert.deepEqual(run.w.missing, []); assert.equal(F.conscienceTier(run.p.conscience), 'clean'); }
});

test('c10-m3: down in a duel phase restarts that phase at its threshold with no card; down elsewhere is the card; the conscience colours Vân\'s line', () => {
  let downs = 0;
  const duel = play('c10-m3', {
    progress: before.get('c10-m3'),
    hold: { 'hiep-2': ({ visit, push }) => { if (visit === 1) { downs++; push({ type: 'down', kind: 'wasted' }); return true; } return false; } },
  });
  assert.equal(downs, 1);
  assert.deepEqual(outs(duel.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c10m3.fail.guc'), true]], 'a soft fail: no card, no hospital');
  assert.ok(duel.w.log.some((l) => l.k === 'do' && l.a.op === 'duel' && l.a.args.phase === 2 && l.a.args.reset), 'phase 2 starts again at its threshold');
  assert.equal(duel.res.visits['hiep-2'], 2);
  const floor = play('c10-m3', {
    progress: before.get('c10-m3'),
    hold: { 'len-san': ({ visit, push }) => { if (visit === 1) { push({ type: 'down', kind: 'wasted' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c10m3.fail.down')); return 'retry'; },
  });
  assert.equal(floor.res.visits['len-san'], 2);
  const stained = play('c10-m3', { progress: endOfChapter9({ kills: 1 }) });
  assert.equal(stained.w.log.find((l) => l.k === 'dialogue' && l.id === 'c10m3-van-cuoi').a.lines[0].text, tx('@c10m3.van.vet'), 'a stained record: Vân speaks of the choice tonight');
  for (const run of [duel, floor, stained]) { assert.deepEqual(run.w.missing, []); assert.equal(run.p.flags.rescued, 28); assert.equal(run.done.result.nonLethal, true); }
});

test('c10-m4: Quang\'s reply colours his whisper; a wrong guess about the twelve costs a token; the Dream waits', () => {
  const tokens = {};
  for (const reply of ['hen', 'tha', 'nam']) {
    const run = play('c10-m4', { progress: before.get('c10-m4'), choose: { traLoiQuang: reply }, wrong: reply === 'tha' ? { muoiHaiNguoi: 'con-b2' } : undefined });
    assert.equal(run.p.flags['choice:traLoiQuang'], reply);
    tokens[reply] = run.p.hintTokens;
    const { r } = setup({ progress: run.p });
    const whisper = SCENE.get('c10m4-xe-cap-cuu').shots[1].cues.filter((c) => c.k === 'say' && c.if && r.test(c.if)).map((c) => c.text);
    assert.deepEqual(whisper, [`@c10m4.cs.q1${{ hen: 'a', tha: 'b', nam: 'c' }[reply]}`]);
    if (reply === 'tha') { assert.deepEqual(run.p.deductions.muoiHaiNguoi, { answer: 'xe-lanh', tries: 2 }); assert.equal(tokens.tha, tokens.hen - 1, 'the wrong guess cost one hint token'); }
    assert.ok(run.w.log.some((l) => l.k === 'vehicle' && l.id === 'dream' && l.a.model === 'dream'));
    assert.equal(run.done.chain, 'c11-m1');
    assert.deepEqual(run.w.missing, []);
  }
});

test('LƯƠNG TÂM in chapter 10: a chokehold "kill" is a knockout; a real death fails each mission', () => {
  for (const id of MISSIONS) {
    const { r } = setup({ progress: before.get(id) });
    r.start(id);
    for (let i = 0; i < 3; i++) r.tick(0.1);
    r.event({ type: 'kill', id: 'gac', tag: 'guard', cause: 'choke' });
    r.tick(0.1);
    assert.notEqual(r.view().phase, 'failed', `${id}: a choke never kills`);
    r.event({ type: 'kill', id: 'gac-2', tag: 'guard', cause: 'fall' });
    r.tick(0.1);
    assert.equal(r.view().failure?.reason, R.LETHAL_REASON, `${id}: Tín không giết ai`);
  }
});

test('replays: every chapter 10 mission replays in a sandbox from its chapter start and its replay block', () => {
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
