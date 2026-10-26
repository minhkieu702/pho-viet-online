// node --experimental-transform-types --test scripts/story-content.test.mjs
// Story content, chapters 1–2 (SEN TRONG BÙN): the chapters load through the registry and lint clean against the
// real sites; every text reference resolves (and content holds no inline strings, no orphan keys, no real brands,
// subtitles fit); every place is a site, a chapter place or a declared space anchor, and each mission uses the
// sites story-decisions.md gave it; cutscene data is consistent (durations, marks, cast, sets, dignified extras);
// the case-board cards solve; the steps only wait for interactions, tails and evidence the script offers.
// A mock host and an autopilot (it satisfies each step's own conditions) play the campaign's main path from
// c1-m1 to c2-m3, every alternative branch, fail → retry/skip paths, and a resume from every checkpoint.
import test from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../app/game/story/runner.ts');
const C = await import('../app/game/story/content/index.ts');
const S = await import('../app/game/story/sites.ts');
const F = await import('../app/game/story/flags.ts');
const D = await import('../app/game/story/deduction.ts');
const ch1 = await import('../app/game/story/content/ch01.ts');
const ch2 = await import('../app/game/story/content/ch02.ts');
const cs1 = await import('../app/game/story/cutscenes/ch01.ts');
const cs2 = await import('../app/game/story/cutscenes/ch02.ts');
const SCENE_SCHEMA = await import('../app/game/story/scene.ts');
const t1 =await import('../app/game/story/text/vi/ch01.ts');
const t2 = await import('../app/game/story/text/vi/ch02.ts');
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT, LANE_WAVE, CHAPTER_WAVE } = await import('../app/game/story/contract.ts');

C.registerChapter(1, () => import('../app/game/story/content/ch01.ts'));
C.registerChapter(2, () => import('../app/game/story/content/ch02.ts'));
const catalog = await C.loadCatalog([1, 2]);
const MODULES = [ch1.chapter, ch2.chapter];
const SCENES = [...cs1.CUTSCENES, ...cs2.CUTSCENES];
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = { ...ch1.ANCHORS };
for (const [k, v] of Object.entries(ch2.ANCHORS)) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const MISSIONS = ['c1-m1', 'c1-m2', 'c1-m3', 'c2-m1', 'c2-m2', 'c2-m3'];
const SPACE_IDS = Object.keys(S.SPACES);
const tx = R.makeText(catalog, (n) => ({ cash: 1350, debtPaid: 1350, debtTotal: 40000, hintTokens: 2 })[n]);

// ---- helpers over the content ---------------------------------------------------------------------------------

/** Every value of a deep structure (strings, with their key). */
function* deep(x, key = '') {
  if (typeof x === 'string') yield [key, x];
  else if (Array.isArray(x)) for (const v of x) yield* deep(v, key);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) yield* deep(v, k);
}
/** Every act and condition of a mission, with the step it belongs to. */
function visit(m, fn) {
  R.walkMission(m, { act: (a, at) => fn('act', a, at), cond: (c, at) => fn('cond', c, at) });
}
const actsOf = (m) => { const out = []; visit(m, (kind, x, at) => { if (kind === 'act') out.push([x, at]); }); return out; };
const condsOf = (m) => { const out = []; visit(m, (kind, x, at) => { if (kind === 'cond') out.push([x, at]); }); return out; };
const isRef = (s) => /^@[\w.:-]+$/.test(s);

// ---- mock host -------------------------------------------------------------------------------------------------

const cmp = (a, op, b) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : op === '!=' ? a !== b : a === b);
const MODE = { foot: ['foot'], bike: ['bike'], car: ['car'], vehicle: ['bike', 'car', 'boat'], boat: ['boat'], swim: ['swim'] };
const STATE = { idle: 'idle', goto: 'goto', patrol: 'patrol', follow: 'follow', escort: 'escort', guard: 'idle', act: 'act', flee: 'flee', surrender: 'surrender', captive: 'captive' };
const BLOCKING = new Set(['cutscene', 'dialogue', 'call', 'title', 'fade', 'teleport', 'choice', 'space']);

/** Resolves a PlaceRef like the engine: sites and chapter places, 'space/anchor' (anchors placed in the space's off-map slot). */
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
          if (a.model || a.at) { const p = a.at ? resolve(a.at) : null; if (a.at && !p) miss(`vehicle place ${a.at}`, ctx); w.vehicles.set(a.id, { x: p?.x ?? v?.x ?? 0, z: p?.z ?? v?.z ?? 0, state: st[a.state ?? 'park'] }); }
          else if (!v) miss(`vehicle ${a.id}`, ctx);
          else if (a.state) v.state = st[a.state];
          if (a.route && !resolve(a.route)) miss(`route ${a.route}`, ctx);
          break;
        }
        case 'tail': if (!w.vehicles.has(a.target) && !w.actors.has(a.target)) miss(`tail ${a.target}`, ctx); w.helpers.set(a.target, a); break;
        case 'photoTarget': case 'clue': case 'eavesdrop': w.helpers.set(a.id, a); if (a.k === 'eavesdrop' && typeof a.source === 'string' && !w.actors.has(a.source)) miss(`eavesdrop source ${a.source}`, ctx); break;
        case 'stop': w.helpers.delete(a.id); break;
        case 'teleport': { const p = resolve(a.at); if (!p) miss(`teleport ${a.at}`, ctx); else Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: p.level ?? null, mode: a.vehicle ? 'bike' : 'foot', speed: 0 }); break; }
        case 'space':
          if (a.enter) { const p = resolve(`${a.enter}/${a.link}`) ?? resolve(`${a.enter}/${Object.keys(ANCHORS[a.enter] ?? {})[0]}`); if (!p) miss(`space ${a.enter}`, ctx); Object.assign(w.player, { x: p?.x ?? 0, z: p?.z ?? 0, space: a.enter, mode: 'foot' }); }
          if (a.leave) { const p = a.leave === true ? null : resolve(a.leave); Object.assign(w.player, { space: null, mode: 'foot' }, p ? { x: p.x, z: p.z } : {}); }
          break;
        case 'player': if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover; break;
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
      // a replayed beat starts fresh: helper meters and guards' sight are re-evaluated by the engine
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
  // the runner works on the progress object it is given: alternative runs start from a copy
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 3 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot: satisfies each step's own conditions -------------------------------------------------------------

/**
 * Drives the running mission to completion. Each tick in a step's run phase it makes the next required sub true,
 * then the step's `done` (or a branch: o.branch[stepId] picks one, default the first). Events are pushed once per
 * step visit; interactions must be offered (view().interacts) and evidence must come from a live photo target or
 * clue, so a script that waits for something it never offers fails here. Hooks can hold a step (fail paths).
 */
function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), answered = new Set();
  const push = (e) => { const k = `${key}|${e.type}|${e.id}`; if (pushed.has(k)) return; pushed.add(k); r.event(e); };
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
      case 'actor': { const a = w.actors.get(c.id); assert.ok(a, `actor ${c.id} exists for ${step}`); if (c.state) a.state = c.state; if (c.sees !== undefined) a.sees = c.sees; return; }
      case 'vehicle': { const v = w.vehicles.get(c.id); assert.ok(v, `vehicle ${c.id} exists for ${step}`); if (c.state) v.state = c.state; if (c.at) Object.assign(v, resolve(c.at)); return; }
      case 'evidence': {
        const src = [...w.helpers.values()].find((h) => (h.k === 'photoTarget' || h.k === 'clue') && h.evidence === c.id);
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
          // the climb link: start at its foot (on its level), end at its far end, then the engine's climbDone
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
        push({ type: c.ev, id: c.id, ...(c.tag ? { tag: c.tag } : {}), ...(c.where ?? {}) });
        return;
      }
      default: return; // flags, vars, after, subs, never: time and the script do it
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
    else if (sess?.kind === 'board') for (const [a, b] of catalog.boards.get(sess.id).links) r.ui.link(a, b);
    if (v.phase !== 'run') continue;
    // a new visit: another step, or the same step entered again after a (soft or hard) fail
    if (`${v.step}|${w.fails}` !== lastVisit) { lastVisit = `${v.step}|${w.fails}`; step = v.step; visits[step] = (visits[step] ?? 0) + 1; key = `${step}#${visits[step]}`; }
    const mission = catalog.missions.get(s.mission), def = mission.steps.find((x) => x.id === step);
    if (o.hold?.[step]?.({ r, w, visit: visits[step], t: s.t, push })) continue;
    for (const id of o.optional ?? []) {
      const od = [...(def.optional ?? []), ...(mission.optional ?? [])].find((x) => x.id === id);
      if (od && !s.stats.optional.includes(id)) satisfy(od.when, def);
    }
    const order = o.subOrder?.[step], subs = (def.subs ?? []).filter((x) => !x.optional).sort((a, b) => (order ? order.indexOf(a.id) - order.indexOf(b.id) : 0)), doneSubs = new Set(v.subs.filter((x) => x.done).map((x) => x.id));
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
/** A progress that has finished every mission before `id` on the main path (for standalone alternative runs). */
const before = new Map();

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapters 1–2 load through the registry, cover their index and lint clean against the real sites', async () => {
  assert.deepEqual([...catalog.missions.keys()], MISSIONS);
  for (const id of MISSIONS) assert.ok(catalog.meta.get(id).chapter <= 2);
  assert.deepEqual(R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: ENGINE_CONTRACT }), [], 'places are sites and every engine id is in story/contract.ts');
  assert.equal(catalog.meta.get('c2-m1').giver, 'quang', 'chapter files patch the hub metadata');
  assert.equal(catalog.missions.get('c2-m1').chain, 'c2-m2'); assert.equal(catalog.missions.get('c2-m2').chain, 'c2-m3');
  for (const id of MISSIONS) {
    const m = catalog.missions.get(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.5, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
  }
  const total = MISSIONS.reduce((t, id) => t + catalog.meta.get(id).minutes, 0);
  assert.equal(total, 39, 'chapters 1–2 are 39 of the 235 planned minutes');
});

test('texts: every reference resolves, content holds no inline strings, no orphan keys, no real brands, lines fit', () => {
  const tables = [common.COMMON, t1.TEXT, t2.TEXT];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'text keys are unique across chapters');
  const used = new Set();
  const sources = [...MODULES, ...SCENES, ch1.ANCHORS, ch2.ANCHORS];
  for (const [, s] of deep(sources)) if (isRef(s)) { assert.ok(keys.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const t of tables) for (const v of Object.values(t)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) { assert.ok(keys.has(m[1]), `missing {@${m[1]}}`); used.add(m[1]); }
  const orphans = [...keys].filter((k) => !used.has(k) && !(k in common.COMMON));
  assert.equal(C.CAMPAIGN.text, common.COMMON, 'the campaign constants load with the index, not with chapter 1');
  assert.deepEqual(orphans, [], 'every text key is used');
  // every TextRef the runner shows comes from the tables
  const inline = [];
  for (const m of MODULES.flatMap((x) => x.missions)) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...MODULES.flatMap((m) => [...(m.evidence ?? []), ...(m.journal ?? [])])]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of catalog.cast.values()) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const q of catalog.questions.values()) for (const t of [q.prompt, q.hint, ...q.options.map((x) => x.text)]) if (!isRef(t)) inline.push(`question ${q.id}: ${t}`);
  for (const sc of SCENES) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  assert.deepEqual(inline, []);
  // resolved texts: no real brands, Vietnamese typography, subtitle lengths
  for (const k of keys) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/giao\s*nhanh/i.test(v), `${k}: "giao nhanh" trips the brand lint`);
  }
  assert.equal(tx('{@app}'), 'ĐơnƠi'); assert.match(tx('@c1m2.order.blank'), /150\.000đ/);
  assert.match(tx('@c2m1.toast.don'), /DO-0413/, 'order codes come from {@code}');
  for (const k of keys) assert.ok(!/Sen Vàng|SEN VÀNG/.test(t1.TEXT[k] ?? t2.TEXT[k] ?? ''), `${k}: the ring is named through {@ring}/{@ringUpper}, never written out (the lowercase bông sen vàng is the logo)`);
  const lines = [];
  for (const m of MODULES.flatMap((x) => x.missions)) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') lines.push(...a.lines.map((l) => [m.id, l.text]));
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') lines.push([sc.id, c.text]);
  for (const [at, ref] of lines) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of MODULES.flatMap((x) => x.missions)) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long`);
    for (const [a, at] of actsOf(m)) if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long`);
  }
});

test('places: every place is a site, a chapter place or a declared space anchor; missions use their decided sites', () => {
  const refs = new Map(MISSIONS.map((id) => [id, new Set()]));
  const check = (id, ref, at) => {
    if (typeof ref !== 'string') return;
    refs.get(id).add(ref);
    if (ref.includes('/')) {
      const [space, anchor] = ref.split('/');
      assert.ok(S.SPACES[space], `${at}: unknown space ${space}`);
      assert.ok(ANCHORS[space]?.[anchor], `${at}: anchor ${anchor} is not declared for ${space}`);
    } else assert.ok(PLACES[ref], `${at}: unknown place ${ref}`);
  };
  for (const id of MISSIONS) {
    const m = catalog.missions.get(id);
    check(id, m.start?.at, id);
    for (const s of m.steps) {
      for (const x of [s.marker].flat().filter(Boolean)) check(id, x.at, `${id}/${s.id}`);
      for (const x of s.interact ?? []) check(id, x.at, `${id}/${s.id}`);
    }
    for (const [a, at] of actsOf(m)) {
      for (const k of ['at', 'leave']) if (typeof a[k] === 'string') check(id, a[k], at);
      if (a.k === 'ride' && a.to) check(id, a.to, at);
      if (a.k === 'vehicle' && typeof a.route === 'string') check(id, a.route, at);
      if (a.k === 'do' && a.args?.route) check(id, a.args.route, at);
      if (a.k === 'do' && a.op === 'appOrder') for (const k of ['from', 'to']) if (a.args[k]) check(id, a.args[k], at);
      if (a.k === 'photoTarget' && typeof a.subject === 'string' && a.subject.includes('.')) check(id, a.subject, at);
      if (a.k === 'space' && a.enter) refs.get(id).add(`${a.enter}/`);
      const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
      if (b?.k === 'goto') check(id, b.at, at); else if (b?.k === 'guard') check(id, b.post, at); else if (b?.k === 'patrol') b.route.forEach((x) => check(id, x, at));
    }
    for (const [c, at] of condsOf(m)) if (c.at) check(id, c.at, at);
    // cutscenes played by this mission count as its use of a site
    for (const [a] of actsOf(m)) if (a.k === 'cutscene') for (const [, s] of deep(SCENE.get(a.id))) refs.get(id).add(s.replace(/^set:([\w-]+)\..*$/, '$1/'));
  }
  const used = (id, site) => [...refs.get(id)].some((r) => r === site || r.startsWith(`${site}.`) || r.startsWith(`${site}/`));
  for (const id of MISSIONS) {
    const ms = S.MISSION_SITES[id];
    for (const site of ms.sites) assert.ok(used(id, site), `${id} uses ${site} (MISSION_SITES)`);
    for (const space of ms.spaces ?? []) assert.ok(used(id, space), `${id} uses space ${space} (MISSION_SITES)`);
  }
  // the chapter's own place: inside its alley, clear of the stake-out hides and the van
  const p = ch2.PLACES['ch2.hem-dream'], [x0, x1, z0, z1] = S.SITES['hem-sau-nha-nghi'].area;
  assert.ok(p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);
  for (const [k, q] of Object.entries(S.SITES['hem-sau-nha-nghi'].spots)) assert.ok(Math.hypot(q.x - p.x, q.z - p.z) >= 3, `ch2.hem-dream clear of ${k}`);
  // P1 missions are exactly the ones the decisions scheduled after the Quận 4 wiring
  for (const id of MISSIONS) {
    const p1 = [...refs.get(id)].some((r) => S.SITES[r.split(/[./]/)[0]]?.phase === 'P1');
    assert.equal(p1, S.MISSION_SITES[id].phase === 'P1', `${id} phase`);
  }
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
const VICTIMS = new Set(['hoa', 'beti', 'mai']);
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle']);
test('cutscenes: durations add up, marks, cast, sets and lines resolve, captives stay dignified, every scene is played', () => {
  const played = new Map();
  for (const id of MISSIONS) for (const [a] of actsOf(catalog.missions.get(id))) if (a.k === 'cutscene') played.set(a.id, [...(played.get(a.id) ?? []), id]);
  assert.equal(SCENE.size, SCENES.length, 'scene ids are unique');
  for (const sc of SCENES) {
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
      for (const k of ['points']) if (c[k]) c[k].forEach((m) => mark(m, where));
      if (c.k === 'rail') { assert.equal(c.points.length, c.look.length, `${sc.id} ${where}: rail look per point`); assert.equal(c.points.length, c.fov.length); }
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
        if (c.k === 'pair') { for (const x of [c.a, c.b]) assert.ok(x in sc.cast); if (ROUGH.has(c.clip)) for (const x of [c.a, c.b]) assert.ok(!VICTIMS.has(sc.cast[x]), `${sc.id}: ${c.clip} on a victim`); }
        if (c.k === 'anim' && VICTIMS.has(sc.cast[c.who])) assert.ok(!ROUGH.has(c.clip), `${sc.id}: ${c.clip} on a victim`);
        for (const k of ['at']) if (c[k] !== undefined && c[k] !== null) mark(c[k], `${where} ${c.k}`);
        if (c.k === 'walk' || c.k === 'ride') c.path.forEach((m) => mark(m, `${where} ${c.k}`));
        if (c.k === 'look' && c.at !== null) mark(c.at, `${where} look`);
        if (c.if) assert.doesNotThrow(() => setup().r.test(c.if));
      }
    });
  }
  for (const id of ['cs01_mo_dau', 'cs02_phong_so_7', 'cs03_phong_vo_o']) assert.ok(SCENE.has(id), `${id} is scripted`);
  assert.deepEqual([70, 40, 53], ['cs01_mo_dau', 'cs02_phong_so_7', 'cs03_phong_vo_o'].map((id) => SCENE.get(id).seconds), 'the bible lengths');
  for (const [id, cs] of Object.entries(S.CUTSCENE_SITES)) if (/^c[12]-/.test(cs.mission)) {
    const sc = SCENE.get(id), all = [...deep(sc)].map(([, s]) => s);
    for (const site of cs.sites) assert.ok(all.some((s) => s === site || s.startsWith(`${site}.`)), `${id} is staged at ${site}`);
    for (const space of cs.spaces ?? []) assert.ok((sc.sets ?? []).includes(space), `${id} uses set ${space}`);
  }
  // CS03 is one on-map swoop: the KHO 7 interior marks lie inside the hollow shell
  for (const [k, [x, y, z]] of Object.entries(cs2.KHO7_MARKS)) {
    const p = { x: S.SITES['kho-7'].spots.hall.x + x, z: S.SITES['kho-7'].spots.hall.z + z };
    assert.ok(p.x >= 560 && p.x <= 600 && p.z >= -132 && p.z <= -79.2 && y >= 0 && y < 11, `KHO7 mark ${k} inside the shell`);
  }
  const swoop = SCENE.get('cs03_phong_vo_o').shots[1];
  assert.equal(swoop.cam.k, 'rail'); assert.ok(swoop.cues.some((c) => c.k === 'hide' && c.mesh === 'kho-7.skylight-glass'), 'the swoop hides the skylight glass');
  // the swoop is one move onto the packing line: it ends where the lateral track begins, looking at the same thing
  const track = SCENE.get('cs03_phong_vo_o').shots[2].cam;
  assert.deepEqual([swoop.cam.points.at(-1), swoop.cam.look.at(-1)], [track.from, track.look], 'the swoop hands over to the packing-line track without a cut');
  assert.notEqual(swoop.cam.ease, 'inCubic', 'the swoop lands softly');
});

/** Subtitle time of a line (director-actors-extras.md §5.2): clamp(1.4 + 0.065·chars, 1.8, 7.5) s. */
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
      // lines with an `if` at the same moment are alternatives (choice consequences), never on screen together
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

test('cutscenes name only engine ids of the contract; slow motion only in a freezeWorld scene; two-actor shots have two actors', async () => {
  const kinds = { ...ENGINE_CONTRACT, rides: { ...ENGINE_CONTRACT.models, ...ENGINE_CONTRACT.rideModels }, sceneProps: { ...ENGINE_CONTRACT.props, ...ENGINE_CONTRACT.sceneProps } };
  const issues = [];
  for (const sc of SCENES) {
    for (const [kind, id, where] of SCENE_SCHEMA.sceneVocab(sc)) if (!Object.prototype.hasOwnProperty.call(kinds[kind] ?? {}, id)) issues.push(`${sc.id} ${where}: ${kind} '${id}' is not in story/contract.ts`);
    const slow = sc.shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'slowmo'));
    if (slow && !sc.stage.freezeWorld) issues.push(`${sc.id}: slowmo outside a stage.freezeWorld scene`);
    const twoActors = (cam, where) => {
      if (cam.k === 'split') { twoActors(cam.left, where); twoActors(cam.right, where); return; }
      if (cam.k === 'ots' && cam.speaker === cam.listener) issues.push(`${sc.id} ${where}: over-the-shoulder of ${cam.speaker} onto ${cam.listener}`);
      if (cam.k === 'twoShot' && cam.a === cam.b) issues.push(`${sc.id} ${where}: two-shot of ${cam.a} alone`);
    };
    sc.shots.forEach((sh, i) => twoActors(sh.cam, `shot ${i + 1}`));
  }
  assert.deepEqual(issues, []);
  // every cutscene id of the contract is used by some scene (no stale entries for the director to build)
  const used = new Set(SCENES.flatMap((sc) => SCENE_SCHEMA.sceneVocab(sc).map(([k, id]) => `${k}:${id}`)));
  for (const k of ['clips', 'pairClips', 'fx', 'sfx', 'grades', 'meshes', 'ambience']) for (const id of Object.keys(ENGINE_CONTRACT[k])) assert.ok(used.has(`${k}:${id}`), `contract ${k} '${id}' is used by no cutscene`);
  const { gradeFilter } = await import('../app/story-ui/format.ts');
  for (const g of Object.keys(ENGINE_CONTRACT.grades)) assert.notEqual(gradeFilter(g), 'none', `the story UI draws grade ${g}`);
});

test('c1-m2: Cô Ba texts once per red light, three times at most, and only on the signal', () => {
  let pushed = 0;
  const { w } = play('c1-m2', {
    progress: before.get('c1-m2'), choose: { bienSo: 'b' },
    hold: { 'lay-1': ({ r }) => { if (pushed < 5) { r.event({ type: 'signal', id: 'ranRed' }); pushed++; return true; } return false; } },
  });
  const texts = w.log.filter((l) => l.k === 'sms' && l.a.from === 'coba').map((l) => l.a.text);
  assert.deepEqual(texts, [tx('@c1m2.sms.denDo'), tx('@c1m2.sms.denDo2'), tx('@c1m2.sms.denDo3')]);
});

test('case board: chapter cards are evidence with a source, the strings connect them and the board solves', () => {
  const cards = [...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS], ids = cards.map((c) => c.id);
  const evidence = new Set(catalog.evidence.keys());
  const board = { id: 'test-ch1-2', title: '@cast.tin', cards, links: ch2.BOARD_LINKS };
  assert.deepEqual(D.lintBoard(board, evidence), []);
  // connected
  const seen = new Set([ids[0]]), todo = [ids[0]];
  while (todo.length) { const a = todo.pop(); for (const [x, y] of board.links) for (const [p, q] of [[x, y], [y, x]]) if (p === a && !seen.has(q)) { seen.add(q); todo.push(q); } }
  assert.equal(seen.size, ids.length, 'every card is on a string');
  const p = F.newProgress(); p.evidence.push(...ids);
  let solved = false;
  for (const [a, b] of board.links) solved = D.linkCards(board, p, a, b, (id) => p.evidence.includes(id)).solved;
  assert.equal(solved, true);
  // every evidence card can be found in play
  const sources = new Set();
  for (const id of MISSIONS) for (const [a] of actsOf(catalog.missions.get(id))) {
    if (a.k === 'evidence') sources.add(a.id);
    if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence);
  }
  assert.deepEqual([...evidence].filter((e) => !sources.has(e)), []);
});

test('every flag and mission variable a condition reads is written by chapters 1–2 (or is a choice result)', () => {
  const written = new Set(), read = [];
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  for (const id of MISSIONS) {
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
  for (const m of MODULES) for (const x of m.missions) for (const a of x.rewards ?? []) note(a);
  for (const [n, at] of read) assert.ok(written.has(n), `${at}: reads flag ${n} that nothing sets`);
});

test('steps only wait for what the script offers: interactions, climbs, tails, eavesdrops, cutscenes, engine hooks of a built lane', () => {
  const OPS = new Set(['appOrder', 'bike', 'gps', 'offerWait', 'stealthAlarm', 'danger', 'pursue']);
  const METERS = new Set(['cover:shipper', 'tail:van-51d', 'thoat:ran-den']);
  for (const id of MISSIONS) {
    const m = catalog.missions.get(id), acts = actsOf(m).map(([a]) => a), wave = CHAPTER_WAVE[catalog.meta.get(id).chapter];
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id)), climbs = new Set(specs.filter((x) => x.kind === 'climb').map((x) => x.id));
    for (const x of specs) if (x.kind === 'climb') assert.ok(x.to && PLACES[x.to], `${id}: climb ${x.id} has a far end on the map`);
    const tails = new Set(acts.filter((a) => a.k === 'tail').map((a) => a.target)), ears = new Set(acts.filter((a) => a.k === 'eavesdrop').map((a) => a.id));
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id) && !climbs.has(c.id), `${at}: waits for interaction ${c.id} (a climb is waited for with its 'climb' event)`);
      if (c.k === 'on' && c.ev === 'climb') assert.ok(climbs.has(c.id), `${at}: waits for climb ${c.id}`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(ENGINE_CONTRACT.signals[c.id] || ENGINE_CONTRACT.ops[c.id], `${at}: signal ${c.id} is in the contract`);
      if (c.k === 'q') {
        const entry = ENGINE_CONTRACT.queries[c.name];
        assert.ok(entry, `${at}: engine query ${c.name} is in the contract`);
        assert.ok(LANE_WAVE[entry[0]] <= wave, `${at}: query ${c.name} is built by the ${entry[0]} lane in wave ${LANE_WAVE[entry[0]]}, but chapter ${catalog.meta.get(id).chapter} plays in wave ${wave} (a stub answers false)`);
      }
      if (c.k === 'on' && ['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(tails.has(c.id), `${at}: waits for tail ${c.id}`);
      if (c.k === 'on' && c.ev === 'eavesdrop') assert.ok(ears.has(c.id), `${at}: waits for eavesdrop ${c.id}`);
      if (c.k === 'meter') assert.ok(METERS.has(c.id), `${at}: meter ${c.id}`);
    }
    for (const a of acts) if (a.k === 'do') assert.ok(OPS.has(a.op), `${id}: op ${a.op} is documented`);
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(METERS.has(x.id));
    assert.ok(m.steps.every((s) => s.minutes > 0));
  }
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

const MAIN = { choose: { bienSo: 'b' } };
/** Moves the van past the two watched points of the tail before arriving (patrol-car beat, the bridge). */
const tailBeats = ({ w, t }) => {
  const van = w.vehicles.get('van-51d');
  if (t < 0.15) Object.assign(van, resolve('nga-tu-108-54'));
  else if (t > 0.45 && t < 0.55) Object.assign(van, resolve('cau-khanh-hoi'));
  return t < 0.9;
};
const snapshots = [];

test('main path: one save plays c1-m1 → c2-m3 end to end on the mock host', () => {
  const { r, w } = setup({ ...MAIN, onCheckpoint: (e, run) => snapshots.push({ id: run.state().mission, step: e.step, save: run.snapshot() }) });
  for (const id of MISSIONS) {
    before.set(id, F.cloneProgress(r.progress()));
    const meta = catalog.meta.get(id), hour = meta.hours ? (meta.hours[0] + 0.5) % 24 : 12;
    assert.equal(F.availability(catalog.index, r.progress(), hour).find((a) => a.id === id).state, 'open', `${id} is open at ${hour}h`);
    assert.equal(r.start(id), true);
    const at = w.outs.length;
    const res = autopilot(r, w, { hold: { 'bam-duoi': tailBeats } });
    const done = completed(w).at(-1);
    assert.equal(done.id, id);
    assert.equal(done.chain, catalog.missions.get(id).chain ?? null);
    assert.deepEqual(w.outs.slice(at).filter((e) => e.type === 'fail'), [], `${id}: no fail on the main path`);
    assert.ok(res.ticks < 9000);
  }
  const p = r.progress();
  assert.deepEqual(p.completed, MISSIONS);
  assert.deepEqual(w.missing, [], 'every actor, vehicle and place a step uses exists');
  assert.deepEqual(r.state().issues, []);
  // money: 1.000.000đ from Má + 120 + 230 into the can (1.350.000đ), then 150 for room 7
  assert.ok(w.log.some((l) => l.k === 'hint' && l.a.text === 'Lon sữa bò: 1.350.000đ'));
  assert.ok(w.log.some((l) => l.k === 'hint' && l.a.text === 'SỔ NỢ: 1.350.000đ / 40.000.000đ'));
  assert.deepEqual([p.cash, p.debt.paid], [150, 1350]);
  assert.deepEqual(p.lunar, { month: 8, day: 1 });
  assert.equal(p.chapter, 2);
  assert.deepEqual(p.abilities.sort(), ['appOrders', 'crouch', 'floatStill', 'headlight', 'phone', 'phoneCamera', 'soNo']);
  assert.deepEqual(p.outfits, ['tin-shipper']);
  for (const f of ['arrived', 'dreamRevived', 'plateRight', 'sawBlankOrder', 'hoaNote', 'sawKho7', 'deadlineSL07', 'knowsBarge', 'sawDen']) assert.equal(p.flags[f], true, f);
  assert.deepEqual([p.flags['choice:caPhe'], p.flags['choice:nhanDonQuang'], p.flags['choice:oDau'], p.flags.escapeRoute], ['sua', 'ok', 'nha', 'song']);
  for (const e of ['ev-don-dem-quang', 'ev-giay-hoa', 'ev-bien-so', 'ev-the-sen-vang', 'ev-xe-tuan-tra', 'ev-kho-7', 'ev-bang-trang', 'ev-cuong-noi', 'ev-chi-phuong', 'ev-long-sat', 'ev-tui-cam', 'ev-cuong-seo', 'ev-goi-nho']) assert.ok(p.evidence.includes(e), e);
  assert.ok(p.journal.includes('j-sl07') && p.journal.includes('j-lam'));
  assert.equal(F.conscienceTier(p.conscience), 'clean');
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [1, 2]);
  assert.equal(outs(w, 'complete').find((e) => e.id === 'c1-m3').chapterUnlocked, 2);
  assert.deepEqual(p.deductions.sl07, { answer: 'salan', tries: 1 });
  for (const id of ['cs01_mo_dau', 'cs02_phong_so_7', 'cs03_phong_vo_o', 'c2m2-tuan-tra', 'c1m1-cua-so']) assert.ok(p.seen.includes(id), `${id} played`);
  const cps = outs(w, 'checkpoint').map((e) => e.label);
  assert.ok(cps.includes('Đã lưu · Gác xép nhà Cô Ba') && cps.includes('Đã lưu · Trên mái kho'));
  assert.deepEqual(snapshots.map((x) => `${x.id}/${x.step}`), [
    'c1-m1/gac-xep', 'c1-m2/giao-1', 'c1-m2/giao-2', 'c1-m2/giao-3', 'c1-m3/nhan-don', 'c1-m3/ron-ren', 'c2-m1/vao-nha-nghi', 'c2-m1/to-giay',
    'c2-m2/chon-cho-nap', 'c2-m2/bam-duoi', 'c2-m3/vao-san', 'c2-m3/tren-mai', 'c2-m3/thoat', 'c2-m3/song', 'c2-m3/binh-minh'], 'every checkpoint of the main path saved');
});

test('resume from every checkpoint of the main path: the setups rebuild the world and the mission completes', () => {
  assert.ok(snapshots.length);
  for (const { id, step, save } of snapshots) {
    const { r, w } = setup(MAIN);
    assert.equal(r.resume(save), true, `${id}/${step} resumes`);
    autopilot(r, w, { hold: { 'bam-duoi': tailBeats } });
    assert.equal(completed(w).at(-1)?.id, id, `${id} completes from ${step}`);
    assert.deepEqual(w.missing, [], `${id}/${step}: nothing used before it is rebuilt`);
    assert.equal(w.resets[0], 'checkpoint');
  }
});

test('c1-m1: whatever order the attic chores are done in, the bag ends up on the desk', () => {
  for (const order of [['tui', 'hinh', 'cua-so'], ['cua-so', 'hinh', 'tui'], ['hinh', 'tui', 'cua-so']]) {
    const { w, done } = play('c1-m1', { subOrder: { 'gac-xep': order }, hold: { ngu: ({ w }) => { assert.equal(w.player.carrying, null, `${order}: still carrying the duffel`); return false; } } });
    assert.equal(done.id, 'c1-m1');
    assert.ok(w.log.some((l) => l.k === 'prop' && l.id === 'tui-xach'));
  }
});

test('c1-m2: a wrong plate loops through Ông Tư\'s retry; the phở timer fails and the checkpoint restores the order', () => {
  const { w, p } = play('c1-m2', {
    progress: before.get('c1-m2'), choose: { bienSo: ['a', 'c', 'b'] },
    hold: { 'giao-3': ({ visit }) => visit === 1 },
    onFail: (v) => (v.failure.reason === 'Phở nguội rồi. Khách hủy đơn.' ? 'retry' : null),
  });
  assert.equal(w.log.filter((l) => l.k === 'cutscene' && l.id === 'c1m2-bien-so').length, 3, 'the car passes again after each miss');
  assert.equal(w.log.filter((l) => l.k === 'dialogue' && l.id === 'c1m2-sai').length, 2);
  assert.equal(p.flags.plateMissed, true); assert.equal(p.flags.plateRight, true);
  const retry = w.log.findLast((l) => l.step === 'giao-3' && l.restoring && l.k === 'spawn');
  assert.equal(retry?.id, 'khach-pho', 'the restore respawned the customer');
  assert.equal(completed(w).at(-1).stats.retries, 1);
  assert.deepEqual(w.missing, []);
});

test('c1-m3: helping Bà Sáu is remembered; waking Mực replays the stairs without a fail card', () => {
  const helped = play('c1-m3', { progress: before.get('c1-m3'), optional: ['giup-ba-sau'], hold: { 'ron-ren': ({ w, visit, t }) => { if (visit === 1 && t > 0.15) { w.actors.get('muc').state = 'alert'; return true; } return visit === 1; } } });
  assert.equal(helped.p.flags.helpedBaSau, true);
  assert.ok(helped.p.journal.includes('j-ba-sau'));
  assert.equal(helped.done.result.eye, true, 'Mắt cú for the good deed');
  assert.deepEqual(outs(helped.w, 'fail').map((e) => [e.reason, e.soft]), [['Con Mực thức giấc. Nhẹ chân thôi.', true]]);
  assert.ok(helped.w.log.some((l) => l.k === 'dialogue' && l.id === 'c1m3-la'), 'Cô Ba grumbles from below');
  const skipped = play('c1-m3', { progress: before.get('c1-m3') });
  assert.equal(skipped.p.flags.helpedBaSau, undefined);
  assert.equal(skipped.done.result.eye, false);
  assert.ok(skipped.w.log.some((l) => l.k === 'hint' && l.a.text === 'Lon sữa bò: 1.350.000đ'));
});

test('c2-m1: a blown shipper cover restarts the corridor; the optional ice clue', () => {
  const { w, p, done } = play('c2-m1', {
    progress: before.get('c2-m1'), optional: ['nuoc-da'], choose: { nhanDonQuang: 'lo' },
    hold: { 'hanh-lang': ({ w, visit }) => { if (visit === 1) { w.meters.set('cover:shipper', 1); return true; } w.meters.set('cover:shipper', 0); return false; } },
  });
  assert.deepEqual(outs(w, 'fail').map((e) => e.soft), [true]);
  assert.ok(w.log.some((l) => l.k === 'sms' && l.a.text === 'Uống thuốc rồi. Mày lo giao đi, đừng la cà.'));
  assert.ok(p.evidence.includes('ev-nuoc-da')); assert.equal(done.result.eye, true);
  assert.equal(done.chain, 'c2-m2');
});

test('c2-m2: each hiding spot works and a soft fail returns to it; a lost tail can be skipped after three tries', () => {
  for (const [i, hide, spot] of [[0, 'ket', 'hideCrates'], [1, 'tre', 'hideBamboo'], [2, 'hem', 'hideHem']]) {
    const { w, done } = play('c2-m2', {
      progress: before.get('c2-m2'), any: { 'chon-cho-nap': i }, optional: ['chup-dua-nguoi'],
      hold: { canh: ({ w, visit }) => { const g = w.actors.get('canh-cua'); g.sees = visit === 1; return visit === 1; }, 'bam-duoi': tailBeats },
    });
    const back = w.log.findLast((l) => l.step === 'canh' && l.k === 'teleport');
    assert.deepEqual(resolve(back.a.at), resolve(`hem-sau-nha-nghi.${spot}`), `retry returns to the ${hide} hide`);
    assert.ok(done.result.eye);
  }
  let fails = 0;
  const { done, w } = play('c2-m2', {
    progress: before.get('c2-m2'),
    hold: { 'bam-duoi': ({ visit, push }) => { if (visit <= 3) { push({ type: 'lost', id: 'van-51d' }); return true; } return false; } },
    onFail: (v) => { fails++; return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.deepEqual([done.stats.skipped, done.result.grade], [1, 'C']);
  assert.ok(w.log.filter((l) => l.k === 'vehicle' && l.id === 'van-51d' && l.a.route === 'r-bam-duoi').length >= 3, 'each retry restarts the van');
});

test('c2-m3: both escapes reach dawn; the river can be skipped after three searchlight fails; the call choice and the SL 07 deduction', () => {
  const river = play('c2-m3', { progress: before.get('c2-m3'), optional: ['nghe-gac'] });
  assert.equal(river.p.flags.escapeRoute, 'song'); assert.ok(river.p.evidence.includes('ev-gac-noi'));
  assert.ok(river.res.visits['boi-ve'] && !river.res.visits.khe);
  const slot = play('c2-m3', { progress: before.get('c2-m3'), branch: { thoat: 1 }, choose: { oDau: 'hoi' }, wrong: { sl07: 'lo' } });
  assert.equal(slot.p.flags.escapeRoute, 'khe');
  assert.ok(slot.res.visits.khe && slot.res.visits['ve-bo'] && !slot.res.visits.song);
  assert.ok(slot.w.log.some((l) => l.k === 'vehicle' && l.id === 'xe-rd-2' && l.a.state === 'flee'), 'the bikers give up');
  const call = slot.w.log.find((l) => l.k === 'call' && l.id === 'c2m3-goi-quang-2');
  assert.deepEqual(call.a.lines.map((l) => l.text), ['Sao giọng mày nghe lạ vậy?', 'Lạ gì đâu. Tao... tao còn sốt.', 'Mà mày ở đâu?', '...Ở nhà.']);
  assert.deepEqual(slot.p.deductions.sl07, { answer: 'salan', tries: 2 });
  assert.equal(slot.p.hintTokens, before.get('c2-m3').hintTokens - 1 + slot.done.result.tokens, 'a wrong answer costs one hint token, never a fail');
  let fails = 0;
  const skip = play('c2-m3', {
    progress: before.get('c2-m3'),
    hold: { song: ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'gac-1' }); return true; } return false; } },
    onFail: (v) => { fails++; assert.equal(v.failure.reason, 'Đèn pin rọi trúng bạn.'); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.ok(skip.res.visits['boi-ve'], 'the skip lands on the swim, not the slot route');
  assert.equal(skip.done.stats.skipped, 1);
  for (const run of [river, slot, skip]) { assert.deepEqual(run.w.missing, []); assert.equal(F.conscienceTier(run.p.conscience), 'clean'); }
});

test('LƯƠNG TÂM in c2-m3: a knockout is never a kill, but a real kill fails the mission', () => {
  const { r, w } = setup({ progress: before.get('c2-m3') });
  r.start('c2-m3');
  r.tick(0.2);
  r.event({ type: 'kill', id: 'gac-1', tag: 'guard', cause: 'choke' });
  r.tick(0.1);
  assert.equal(r.view().phase, 'run');
  r.event({ type: 'kill', id: 'gac-2', tag: 'guard', cause: 'fall' });
  r.tick(0.1);
  assert.equal(r.view().failure.reason, R.LETHAL_REASON);
  void w;
});

test('replays: every mission replays in a sandbox from its chapter start and its replay block', () => {
  const { r, w } = setup(MAIN);
  for (const id of MISSIONS) { r.start(id); autopilot(r, w, { hold: { 'bam-duoi': tailBeats } }); }
  const main = F.cloneProgress(r.progress());
  for (const id of MISSIONS) {
    assert.equal(r.start(id, { replay: true }), true);
    autopilot(r, w, { hold: { 'bam-duoi': tailBeats } });
    assert.equal(completed(w).at(-1).replay, true, `${id} replay completes`);
  }
  const after = r.progress();
  assert.deepEqual([after.cash, after.flags, after.evidence], [main.cash, main.flags, main.evidence], 'replays change nothing but medals');
  assert.ok(MISSIONS.every((id) => after.medals[id].plays === 2));
  assert.deepEqual(w.missing, []);
});
