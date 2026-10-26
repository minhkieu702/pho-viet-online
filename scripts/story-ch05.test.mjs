// node --experimental-transform-types --test scripts/story-ch05.test.mjs
// Story content, chapter 5 (SEN TRONG BÙN · BÓNG TRONG ĐÈN NEON): the chapter loads through the registry beside
// chapters 1–2 and lints clean against the real sites and the engine contract plus the ids the chapter asks for
// (content/ch05.ts ENGINE_NEEDS); every text reference resolves (no inline strings, no orphan keys, no real brands,
// the ring named only through {@ring}, subtitles fit and are readable); every place is a site or a declared space
// anchor and each mission uses the sites story-decisions.md gave it; the cutscenes are consistent (durations, marks,
// cast, sets, dignity) and name only contract ids; the CCTV timeline puts its acts on the recorder's marks; the case
// board cards solve; the steps only wait for what the script offers.
// A mock host and an autopilot (each step's own conditions satisfied in turn) play the chapter's main path c5-m1 →
// c5-m3 from an end-of-chapter-4 progress, resume from every checkpoint, and play the alternatives: the recorder
// closed early, the bluff answered wrong, a lost tail skipped, the spa skipped after three detections, a wrong
// deduction, the brawl with Tèo, a blown cover, the optional clues, the LƯƠNG TÂM rules and the replays.
// Chapter 3 introduces Vân and Lực (cast 'van', 'luc'); until content/ch03.ts is built and registered, a stand-in
// module provides just those two cast entries.
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
const ch5 = await import('../app/game/story/content/ch05.ts');
const cs5 = await import('../app/game/story/cutscenes/ch05.ts');
const t1 = await import('../app/game/story/text/vi/ch01.ts');
const t2 = await import('../app/game/story/text/vi/ch02.ts');
const t5 = await import('../app/game/story/text/vi/ch05.ts');
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT } = await import('../app/game/story/contract.ts');

/** Chapter 3's cast as chapter 5 uses it (Đại úy Vân, Thiếu tá Lực), standing in for content/ch03.ts. */
const CH3_STAND_IN = {
  chapter: 3, missions: [],
  cast: [{ id: 'van', name: '@cast.van', look: 'van', portrait: { bg: '#8fb3d9', initials: 'V' } }, { id: 'luc', name: '@cast.luc', look: 'luc', portrait: { bg: '#c9a35a', initials: 'L' } }],
  text: { 'cast.van': 'Chị Vân', 'cast.luc': 'Thiếu tá Lực' },
};
C.registerChapter(1, () => import('../app/game/story/content/ch01.ts'));
C.registerChapter(2, () => import('../app/game/story/content/ch02.ts'));
C.registerChapter(5, () => import('../app/game/story/content/ch05.ts'));
const catalog = await C.loadCatalog([1, 2, 5]);
R.addModule(catalog, CH3_STAND_IN);
const MODULES = [ch1.chapter, ch2.chapter, CH3_STAND_IN, ch5.chapter];
const SCENES = cs5.CUTSCENES;
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = {};
for (const a of [ch1.ANCHORS, ch2.ANCHORS, ch5.ANCHORS]) for (const [k, v] of Object.entries(a)) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const MISSIONS = ['c5-m1', 'c5-m2', 'c5-m3'];
const SPACE_IDS = Object.keys(S.SPACES);
/** The engine contract plus the ids chapter 5 asks for (lanes in content/ch05.ts ENGINE_NEEDS). */
const CONTRACT = Object.fromEntries(Object.entries(ENGINE_CONTRACT).map(([k, v]) => [k, { ...v, ...(ch5.ENGINE_NEEDS[k] ?? {}) }]));
const tx = R.makeText(catalog, (n) => ({ cash: 1350, debtPaid: 1350, debtTotal: 40000, hintTokens: 2 })[n]);

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
const cctvAct = () => actsOf(mission('c5-m1')).map(([a]) => a).find((a) => a.k === 'do' && a.op === 'cctv');

// ---- mock host (story-content.test.mjs, plus CCTV marks and actor moves) -----------------------------------------

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
          break;
        case 'stop': w.helpers.delete(a.id); break;
        case 'teleport': { const p = resolve(a.at); if (!p) miss(`teleport ${a.at}`, ctx); else Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: p.level ?? null, mode: a.vehicle ? 'bike' : 'foot', speed: 0 }); break; }
        case 'space':
          if (a.enter) { const p = resolve(`${a.enter}/${a.link}`) ?? resolve(`${a.enter}/${Object.keys(ANCHORS[a.enter] ?? {})[0]}`); if (!p) miss(`space ${a.enter}`, ctx); Object.assign(w.player, { x: p?.x ?? 0, z: p?.z ?? 0, space: a.enter, mode: 'foot' }); }
          if (a.leave) { const p = a.leave === true ? null : resolve(a.leave); Object.assign(w.player, { space: null, mode: 'foot' }, p ? { x: p.x, z: p.z } : {}); }
          break;
        case 'player': if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'time': w.hour = a.hour; break;
        // the café recorder: its marks stay findable (evidence through {type:'overlay'}) like a live photo target
        case 'do': w.ops.push(a.op); if (a.op === 'cctv') w.helpers.set(`cctv:${a.args.id}`, a); break;
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
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 5 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot ----------------------------------------------------------------------------------------------------

function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), answered = new Set();
  // one push per event per step visit; recorder marks share the recorder id, so the evidence is part of the key
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
        const rec = [...w.helpers.values()].find((h) => h.k === 'do' && h.op === 'cctv' && h.args.marks.some((m) => m.evidence === c.id));
        assert.ok(src || rec, `${step}: evidence ${c.id} has a live photo target, clue or recorder mark`);
        if (rec && !src) { push({ type: 'overlay', id: rec.args.id, evidence: c.id }); return; }
        if (src.k === 'clue') moveTo(src.at);
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
        } else if (c.ev === 'cutscene') {
          const wt = (def.watchers ?? []).find((x) => x.do.some((a) => a.k === 'cutscene' && a.id === c.id));
          assert.ok(wt, `${step}: a watcher plays ${c.id}`);
          satisfy(wt.when, def);
          return;
        } else if (c.ev === 'eavesdrop') assert.ok(w.helpers.has(c.id), `${step}: eavesdrop ${c.id} is running`);
        else if (['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(w.helpers.has(c.id), `${step}: tail ${c.id} is running`);
        else if (c.ev === 'signal' || c.ev === 'choice') return; // raised by the script's own acts
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

/** The progress at the end of chapter 4 as far as chapter 5 reads it (chapters 3–4 are other batches). */
function endOfChapter4() {
  const p = F.newProgress();
  for (const m of F.missionOrder(C.CAMPAIGN)) { if (m.chapter >= 5) break; p.completed.push(m.id); }
  Object.assign(p.flags, { arrived: true, dreamRevived: true, plateRight: true, sawBlankOrder: true, hoaNote: true, sawKho7: true, deadlineSL07: true, knowsBarge: true, sawDen: true, 'choice:caPhe': 'sua', escapeRoute: 'song' });
  p.evidence.push('ev-don-dem-quang', 'ev-giay-hoa', 'ev-bien-so', 'ev-the-sen-vang', 'ev-kho-7', 'ev-bang-trang', 'ev-cuong-noi', 'ev-chi-phuong', 'ev-long-sat', 'ev-tui-cam', 'ev-cuong-seo', 'ev-goi-nho');
  p.abilities.push('phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill');
  p.outfits.push('tin-shipper');
  Object.assign(p, { cash: 150, chapter: 4, lunar: { month: 8, day: 5 } });
  p.debt.paid = 1350;
  return p;
}
const START = endOfChapter4();
const before = new Map();

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapter 5 loads through the registry beside chapters 1–2 and lints clean against the real sites and the contract plus its needs', () => {
  assert.deepEqual([...catalog.missions.keys()].filter((id) => id.startsWith('c5-')), MISSIONS);
  for (const id of MISSIONS) assert.equal(catalog.meta.get(id).chapter, 5);
  const lint = R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: CONTRACT });
  // the stand-in carries chapter 3's cast only, so its missions are reported missing; nothing else may be
  assert.deepEqual(lint.filter((s) => !/^c3-m\d+: no mission script in chapter 3$/.test(s)), []);
  assert.equal(catalog.missions.get('c5-m1').chain, 'c5-m2', 'c5-m1 runs straight into the 02:00 spa job');
  assert.equal(catalog.missions.get('c5-m2').chain, undefined);
  for (const id of MISSIONS) {
    const m = mission(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.5, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
    assert.equal(m.lethal, 'fail', `${id}: LƯƠNG TÂM, nobody dies`);
    assert.ok(m.steps.every((s) => s.minutes > 0));
  }
  assert.equal(MISSIONS.reduce((t, id) => t + catalog.meta.get(id).minutes, 0), 21, 'chapter 5 is 21 of the 235 planned minutes');
  assert.deepEqual([catalog.meta.get('c5-m1').giver, catalog.meta.get('c5-m2').giver, catalog.meta.get('c5-m3').giver], ['tu', 'van', 'van']);
});

test('ENGINE_NEEDS: every id the chapter adds to the contract is used by it, has a lane, and lints only with it', () => {
  const used = new Set();
  for (const m of ch5.chapter.missions) if (m.start?.outfit) used.add(`outfits:${m.start.outfit}`);
  for (const m of ch5.chapter.missions) for (const [a] of actsOf(m)) {
    if (a.k === 'do') used.add(`ops:${a.op}`);
    if (a.k === 'player' && a.outfit) used.add(`outfits:${a.outfit}`);
    if (a.k === 'stealth' && a.arena) used.add(`arenas:${a.arena}`);
    if (a.k === 'unlock' && a.ability) used.add(`abilities:${a.ability}`);
    if (a.k === 'player' && a.carry) used.add(`carry:${a.carry}`);
    const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
    if (b?.k === 'act') used.add(`acts:${b.name}`);
    if (a.k === 'spawn' && a.template) used.add(`templates:${a.template}`);
  }
  for (const sc of SCENES) for (const [k, id] of SCENE_SCHEMA.sceneVocab(sc)) used.add(`${k === 'rides' ? 'rideModels' : k}:${id}`);
  const LANES = new Set(['core', 'director', 'spaces', 'stealth', 'vehicles', 'police', 'world', 'ui', 'audio']);
  for (const [kind, ids] of Object.entries(ch5.ENGINE_NEEDS)) {
    assert.ok(kind in ENGINE_CONTRACT, `contract kind ${kind}`);
    for (const [id, [lane, what]] of Object.entries(ids)) {
      assert.ok(used.has(`${kind}:${id}`), `need ${kind} '${id}' is used by chapter 5`);
      assert.ok(LANES.has(lane) && what.length > 10, `need ${kind} '${id}' names its lane and what it does`);
      const landed = ENGINE_CONTRACT[kind][id];
      if (landed) assert.equal(landed[0], lane, `${kind} '${id}' landed in contract.ts with the lane chapter 5 asked for`);
    }
  }
  // without the needs the lint names each of them (so the list is exactly what the contract still lacks)
  const plain = R.lintContent(C.CAMPAIGN, [ch5.chapter, CH3_STAND_IN, ch1.chapter, ch2.chapter], { engine: ENGINE_CONTRACT }).filter((s) => / is not in the engine contract/.test(s));
  const missing = new Set(plain.map((s) => s.match(/: (\w+) '([^']+)' is not/).slice(1).join(':')));
  // a signal the content waits for may be the latch of its own blocking op ({k:'do', op, wait:true} latches signal op)
  for (const k of missing) { const [kind, id] = k.split(':'); assert.ok(ch5.ENGINE_NEEDS[kind]?.[id] || (kind === 'signals' && ch5.ENGINE_NEEDS.ops?.[id]), `lint without needs: ${k} must be listed in ENGINE_NEEDS`); }
});

test('texts: every reference resolves, no inline strings, no orphan keys, no real brands, the ring only via {@ring}, lines fit', () => {
  const tables = [common.COMMON, t1.TEXT, t2.TEXT, t5.TEXT];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'text keys are unique across chapters 1, 2, 5 and the common table');
  for (const k of Object.keys(t5.TEXT)) assert.match(k, /^(c5m[123]\.|cast\.|ev\.|j\.)/, `${k}: chapter 5 key namespace`);
  const used = new Set();
  const sources = [ch5.chapter, SCENES, ch5.CCTV_C5M1];
  for (const [, s] of deep(sources)) if (isRef(s)) { assert.ok(keys.has(s.slice(1)) || catalog.text.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const v of Object.values(t5.TEXT)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) { assert.ok(keys.has(m[1]), `missing {@${m[1]}}`); used.add(m[1]); }
  assert.deepEqual(Object.keys(t5.TEXT).filter((k) => !used.has(k)), [], 'every chapter 5 text key is used');
  const inline = [];
  for (const m of ch5.chapter.missions) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...ch5.EVIDENCE, ...ch5.JOURNAL]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of ch5.CAST) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const q of ch5.QUESTIONS) for (const t of [q.prompt, q.hint, ...q.options.map((x) => x.text)]) if (!isRef(t)) inline.push(`question ${q.id}: ${t}`);
  for (const sc of SCENES) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  for (const e of ch5.CCTV_C5M1.events) if (!isRef(e.label)) inline.push(`cctv ${e.t}: ${e.label}`);
  for (const [k, v] of Object.entries(cctvAct().args)) if (typeof v === 'string' && /[^\x20-\x7e]/.test(v)) inline.push(`cctv arg ${k}: ${v}`);
  assert.deepEqual(inline, []);
  for (const k of Object.keys(t5.TEXT)) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/Sen Vàng|SEN VÀNG/.test(t5.TEXT[k]), `${k}: the ring is named through {@ring}/{@ringUpper}, never written out`);
    assert.ok(!/\b(Dream|Vios|GiaoNhanh|GN-\d)/.test(v), `${k}: working names of the bible stay out of the text`);
  }
  assert.match(tx('@ev.tui0431.t'), /^Túi đơn DO-0431$/, 'order codes come from {@code}');
  const lines = [];
  for (const m of ch5.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') lines.push(...a.lines.map((l) => [m.id, l.text]));
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') lines.push([sc.id, c.text]);
  for (const [at, ref] of lines) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of ch5.chapter.missions) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long: ${tx(s.objective)}`);
    for (const s of m.steps) for (const x of s.subs ?? []) assert.ok(tx(x.text).length <= 60, `${m.id}/${s.id}: sub too long`);
    for (const [a, at] of actsOf(m)) {
      if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long: ${tx(a.text)}`);
      if (a.k === 'sms' || a.k === 'bark' || a.k === 'toast') assert.ok(tx(a.text).length <= 90, `${at}: ${a.k} too long`);
    }
  }
});

test('places: every place is a site or a declared space anchor; each mission uses its decided sites and spaces; all P0', () => {
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
      if (a.k === 'ride' && a.to) check(id, a.to, at);
      if (a.k === 'vehicle' && a.route) check(id, a.route, at);
      if (a.k === 'do' && a.op === 'appOrder') for (const k of ['from', 'to']) if (a.args[k]) check(id, a.args[k], at);
      if (a.k === 'do' && a.op === 'cctv') check(id, a.args.camera, at);
      if (a.k === 'photoTarget' && typeof a.subject === 'string' && (a.subject.includes('.') || a.subject.includes('/'))) check(id, a.subject, at);
      if (a.k === 'eavesdrop' && typeof a.source !== 'string') check(id, a.source, at);
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
  // every anchor chapter 5 declares is used by its scripts or its cutscenes
  const all = new Set([...refs.values()].flatMap((s) => [...s]));
  for (const sc of SCENES) for (const [, s] of deep(sc)) { const m = s.match(/^set:([\w-]+)\.(\w+)$/); if (m) all.add(`${m[1]}/${m[2]}`); }
  for (const [space, anchors] of Object.entries(ch5.ANCHORS)) for (const a of Object.keys(anchors)) assert.ok(all.has(`${space}/${a}`) || [...deep(ch5.chapter)].some(([, s]) => s === `${space}/${a}`), `anchor ${space}/${a} is used`);
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
const VICTIMS = new Set(['hoa', 'beti', 'mai']);
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle']);
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
      // orbit from/to and snapZoom from/to are angles and fovs, not marks
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
        if (c.k === 'anim' && VICTIMS.has(sc.cast[c.who])) assert.fail(`${sc.id}: a victim is animated`);
        if (c.at !== undefined && c.at !== null) mark(c.at, `${where} ${c.k}`);
        if (c.k === 'walk' || c.k === 'ride') c.path.forEach((m) => mark(m, `${where} ${c.k}`));
        if (c.k === 'prop' && c.attach) mark(c.attach, `${where} prop`);
        if (c.if) assert.doesNotThrow(() => setup().r.test(c.if));
      }
    });
  }
  // Mai never appears in chapter 5: only her bag and her tea
  for (const sc of SCENES) assert.ok(!Object.values(sc.cast).includes('mai'), `${sc.id}: Mai is not staged`);
  const vipScene = SCENE.get('c5m1-vip');
  assert.ok(vipScene.shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'say' && c.ch === 'overheard')), 'the bolero breaks the bookie\'s words into overheard fragments');
  assert.ok(SCENE.get('c5m2-bag').shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'music' && c.id === null)), 'no music over the bag, only the bass');
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

test('the café recorder: the CCTV timeline is valid and its acts sit on the two marks; the footage shows a grab, never a blow', () => {
  const tl = ch5.CCTV_C5M1, args = cctvAct().args;
  assert.equal(args.timeline, tl.id); assert.equal(args.duration, tl.duration);
  assert.equal(args.start, 3.5 * 3600, 'the clip starts at 03:30:00');
  assert.equal(args.needed, args.marks.length);
  for (const tr of tl.tracks) {
    assert.ok(catalog.cast.has(tr.look), `track look ${tr.look} is a cast entry`);
    for (let i = 1; i < tr.keys.length; i++) {
      const a = tr.keys[i - 1], b = tr.keys[i];
      assert.ok(b.t > a.t, `${tr.actor}: keys sorted at ${b.t}`);
      if (a.pose !== 'hidden' && b.pose !== 'hidden') assert.ok(Math.hypot(b.x - a.x, b.z - a.z) / (b.t - a.t) <= 7, `${tr.actor}: no jump faster than 7 m/s at ${b.t}`);
    }
    for (const k of tr.keys) if (k.act) assert.ok(['collar-grab', 'call', 'head-in-hands'].includes(k.act), `${tr.actor}: act ${k.act}`);
    assert.ok(tr.keys.every((k) => k.t >= 0 && k.t <= tl.duration));
  }
  const clock = (t) => new Date((args.start + t) * 1000).toISOString().slice(11, 19);
  assert.deepEqual(args.marks.map((m) => clock(m.t)), ['03:36:10', '03:41:05'], 'the bible\'s two moments');
  for (const m of args.marks) {
    assert.ok(catalog.evidence.has(m.evidence), m.evidence);
    const hit = tl.tracks.find((tr) => tr.actor === 'quang').keys.find((k) => k.act && Math.abs(k.t - m.t) <= m.tol);
    assert.ok(hit, `a Quang act within ±${m.tol} s of ${clock(m.t)}`);
    assert.ok(tl.events.some((e) => e.kind === 'mark' && Math.abs(e.t - m.t) <= m.tol), `an event labels ${clock(m.t)}`);
  }
  // the rider is on the porch at the first mark and gone after he leaves; the camera is the porch camera spot
  const rider = tl.tracks.find((tr) => tr.actor === 'ran-den').keys;
  assert.ok(rider.some((k) => k.act === 'collar-grab' && Math.abs(k.t - args.marks[0].t) <= args.marks[0].tol));
  assert.ok(Math.hypot(PLACES[args.camera].x - S.SITES['cafe-co-ba'].x, PLACES[args.camera].z - S.SITES['cafe-co-ba'].z) < 2, 'CAM 01 is over the café door');
});

test('every flag and mission variable a chapter 5 condition reads is written by chapters 1, 2 and 5 (or is a choice result)', () => {
  const written = new Set(), read = [];
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  for (const m of [...ch1.chapter.missions, ...ch2.chapter.missions, ...ch5.chapter.missions]) { for (const [a] of actsOf(m)) note(a); for (const a of m.rewards ?? []) note(a); }
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
  // items: what is taken was given before, on the main path and on the skip
  const given = new Set(ch5.chapter.missions.flatMap((m) => actsOf(m).map(([a]) => a).filter((a) => a.k === 'give').map((a) => a.item)));
  for (const m of ch5.chapter.missions) for (const [a, at] of actsOf(m)) if (a.k === 'take') assert.ok(given.has(a.item), `${at}: takes ${a.item}`);
});

test('steps only wait for what the script offers: interactions, climbs, tails, eavesdrops, evidence sources, contract signals and meters', () => {
  const METERS = new Set(Object.keys(CONTRACT.meters));
  for (const id of MISSIONS) {
    const m = mission(id), acts = actsOf(m).map(([a]) => a);
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id)), climbs = new Set(specs.filter((x) => x.kind === 'climb').map((x) => x.id));
    for (const x of specs) if (x.kind === 'climb') assert.ok(x.to && PLACES[x.to], `${id}: climb ${x.id} has a far end on the map`);
    const tails = new Set(acts.filter((a) => a.k === 'tail').map((a) => a.target)), ears = new Set(acts.filter((a) => a.k === 'eavesdrop').map((a) => a.id));
    const sources = new Set([...acts.filter((a) => a.k === 'evidence').map((a) => a.id), ...acts.filter((a) => (a.k === 'photoTarget' || a.k === 'clue') && a.evidence).map((a) => a.evidence),
      ...acts.filter((a) => a.k === 'do' && a.op === 'cctv').flatMap((a) => a.args.marks.map((x) => x.evidence))]);
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id) && !climbs.has(c.id), `${at}: waits for interaction ${c.id}`);
      if (c.k === 'on' && c.ev === 'climb') assert.ok(climbs.has(c.id), `${at}: waits for climb ${c.id}`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(CONTRACT.signals[c.id] || CONTRACT.ops[c.id], `${at}: signal ${c.id}`);
      if (c.k === 'on' && ['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(tails.has(c.id), `${at}: waits for tail ${c.id}`);
      if (c.k === 'on' && c.ev === 'eavesdrop') assert.ok(ears.has(c.id), `${at}: waits for eavesdrop ${c.id}`);
      if (c.k === 'evidence' && ch5.EVIDENCE.some((e) => e.id === c.id)) assert.ok(sources.has(c.id), `${at}: evidence ${c.id} has a source in ${id}`);
      if (c.k === 'meter') assert.ok(METERS.has(c.id) || /^(tail|eavesdrop):/.test(c.id), `${at}: meter ${c.id}`);
      assert.notEqual(c.k, 'q', `${at}: chapter 5 waits on no engine query`);
    }
    for (const a of acts) if (a.k === 'do') assert.ok(CONTRACT.ops[a.op], `${id}: op ${a.op}`);
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(METERS.has(x.id) || tails.has(x.id.slice(5)) || ears.has(x.id.slice(10)), `${id}/${s.id}: meter ${x.id} has a helper`);
  }
});

test('case board: chapter 5 cards are evidence with a source, the strings tie them to chapters 1–3 and the board solves', async () => {
  const ch3 = await import('../app/game/story/content/ch03.ts'), ch4 = await import('../app/game/story/content/ch04.ts');
  const ids = [...new Set([...ch5.BOARD_CARDS.map((c) => c.id), ...ch5.BOARD_LINKS.flat()])];
  const board = { id: 'test-ch5', title: '@cast.tin', cards: ids.map((id) => ({ id })), links: ch5.BOARD_LINKS };
  const evidence = new Set([...catalog.evidence.keys(), ...ch3.EVIDENCE.map((e) => e.id)]);
  // a board that shows every chapter's cards (a later BẢNG MANH MỐI) stacks none of them on one lotus slot
  const all = [...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS, ...ch3.BOARD_CARDS, ...ch4.BOARD_CARDS, ...ch5.BOARD_CARDS], slots = all.map((c) => c.slot);
  assert.equal(new Set(slots).size, slots.length, `one card per lotus slot across chapters 1–5 (${slots.join(',')})`);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, 'no card twice');
  // chapter 5 reaches back to chapter 3: Lực's "vụ thằng Hải" and Ông Tư's account, the clip and the gold watch
  for (const [a, b] of [['ev-luc-noi', 'ev-tu-ke'], ['ev-clip-luc', 'ev-dong-ho-vang']]) assert.ok(ch5.BOARD_LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a)), `${a} ↔ ${b}`);
  assert.deepEqual(D.lintBoard(board, evidence), []);
  const seen = new Set([ids[0]]), todo = [ids[0]];
  while (todo.length) { const a = todo.pop(); for (const [x, y] of board.links) for (const [p, q] of [[x, y], [y, x]]) if (p === a && !seen.has(q)) { seen.add(q); todo.push(q); } }
  assert.equal(seen.size, ids.length, 'every card is on a string');
  const p = F.newProgress(); p.evidence.push(...ids);
  let solved = false;
  for (const [a, b] of board.links) solved = D.linkCards(board, p, a, b, (id) => p.evidence.includes(id)).solved;
  assert.equal(solved, true);
  for (const c of ch5.BOARD_CARDS) assert.equal(ch5.EVIDENCE.find((e) => e.id === c.id)?.chapter, 5, `${c.id} is a chapter 5 card`);
  // every chapter 5 evidence can be found in play
  const sources = new Set();
  for (const id of MISSIONS) for (const [a] of actsOf(mission(id))) {
    if (a.k === 'evidence') sources.add(a.id);
    if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence);
    if (a.k === 'do' && a.op === 'cctv') for (const x of a.args.marks) sources.add(x.evidence);
  }
  assert.deepEqual(ch5.EVIDENCE.map((e) => e.id).filter((e) => !sources.has(e)), []);
});

test('chapter 3 stand-in agrees with content/ch03.ts when that chapter is built', async (t) => {
  const url = new URL('../app/game/story/content/ch03.ts', import.meta.url);
  if (!existsSync(url)) { t.skip('content/ch03.ts is not built yet'); return; }
  let m;
  try { m = await import(url.href); } catch (e) { t.skip(`content/ch03.ts does not load yet (${e.message.split('\n')[0]})`); return; }
  const cast = new Set((m.chapter?.cast ?? m.CAST ?? []).map((c) => c.id));
  for (const c of CH3_STAND_IN.cast) assert.ok(cast.has(c.id), `chapter 3 defines cast '${c.id}', which chapter 5 speaks with`);
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

const MAIN = {};
const snapshots = [];
const CHECKPOINTS = ['c5-m1/dau-ghi', 'c5-m1/bam-xe', 'c5-m1/di-bo', 'c5-m1/hanh-lang', 'c5-m1/nghe-len', 'c5-m1/cua-sau', 'c5-m2/mai-ton', 'c5-m2/khu-sau', 'c5-m3/san-nhay', 'c5-m3/lau-vip', 'c5-m3/bi-nhan-dien'];

test('main path: one save plays c5-m1 → c5-m3 end to end on the mock host from the end of chapter 4', () => {
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
    assert.ok(res.ticks < 12000);
    assert.equal(done.result.nonLethal, true);
  }
  const p = r.progress();
  for (const id of MISSIONS) assert.ok(p.completed.includes(id));
  assert.deepEqual(w.missing, [], 'every actor, vehicle and place a step uses exists');
  assert.deepEqual(r.state().issues, []);
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [5], 'the chapter card shows once');
  assert.deepEqual(p.lunar, { month: 8, day: 7 });
  assert.equal(p.cash, 150 + 45, 'the cake order pays 45.000đ');
  assert.deepEqual([p.items.bug, p.items['chia-khoa-kho']], [undefined, undefined], 'the bug is planted and the key used');
  for (const a of ['faceCover', 'clipCam']) assert.ok(p.abilities.includes(a), a);
  for (const f of ['dreamMatte', 'knowsQuangForced', 'knowsQuangDebt', 'tailedQuang', 'bugPlanted', 'sawMaiBag', 'knowsB2', 'sawSpa', 'filmedLuc', 'sawMoonlight']) assert.equal(p.flags[f], true, f);
  assert.deepEqual([p.flags['choice:tiepTan'], p.flags['choice:keQuang']], ['phong', 'ke']);
  for (const e of ['ev-cctv-0336', 'ev-cctv-0341', 'ev-quang-no', 'ev-hang-don-dem', 'ev-so-do-b2', 'ev-cap-mai', 'ev-anh-cuong-moonlight', 'ev-thang-may-b2', 'ev-clip-luc', 'ev-luc-noi']) assert.ok(p.evidence.includes(e), e);
  for (const j of ['j-camera', 'j-quang-no', 'j-tay-run', 'j-cap-mai', 'j-b2', 'j-luc-phong-bi']) assert.ok(p.journal.includes(j), j);
  assert.deepEqual([p.deductions.cuocGoi, p.deductions.maiODau], [{ answer: 'nghe-chuong', tries: 1 }, { answer: 'b2', tries: 1 }]);
  assert.equal(p.conscience.knockouts, 1, 'the first real takedown, and only that one');
  assert.equal(F.conscienceTier(p.conscience), 'clean');
  for (const sc of SCENES) assert.ok(p.seen.includes(sc.id), `${sc.id} played`);
  assert.ok(w.log.some((l) => l.k === 'do' && l.a.op === 'bike' && l.a.args.look === 'matte'), 'the rebuilt bike');
  assert.ok(w.log.some((l) => l.k === 'dialogue' && l.id === 'c5m1-coba' && l.a.lines[0].text === tx('@c5m1.coba.sua')), 'Cô Ba remembers his sữa đá');
  assert.ok(w.log.some((l) => l.k === 'call' && l.id === 'c5m1-van-2' && l.a.lines[0].text === tx('@c5m1.ke1')));
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

test('c5-m1: the recorder closed early goes back to it; a wrong bluff throws Tín out; a wrong deduction costs a token; hiding Quang from Vân', () => {
  const { w, p, done, res } = play('c5-m1', {
    progress: before.get('c5-m1'), choose: { tiepTan: ['quang', 've-sinh', 'phong'], keQuang: 'giau' }, wrong: { cuocGoi: 'an-khuya' }, optional: ['tui-0431', 'giao-tui'],
    hold: { 'tua-bang': ({ visit }) => visit === 1 },
  });
  assert.equal(w.log.filter((l) => l.k === 'do' && l.a.op === 'cctv').length, 2, 'the recorder opens again');
  assert.equal(res.visits['dau-ghi'], 2);
  assert.ok(w.log.some((l) => l.k === 'hint' && l.a.text === tx('@c5m1.hint.lai')));
  assert.deepEqual(outs(w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c5m1.fail.tt'), true], [tx('@c5m1.fail.tt'), true]], 'two soft fails, no card');
  assert.ok(w.log.some((l) => l.k === 'dialogue' && l.id === 'c5m1-tt-quang') && w.log.some((l) => l.k === 'dialogue' && l.id === 'c5m1-tt-vs'));
  assert.deepEqual(p.deductions.cuocGoi, { answer: 'nghe-chuong', tries: 2 });
  const call = w.log.find((l) => l.k === 'call' && l.id === 'c5m1-van-2');
  assert.deepEqual(call.a.lines.slice(0, 2).map((l) => l.text), [tx('@c5m1.giau1'), tx('@c5m1.giau2')]);
  assert.equal(p.flags['choice:keQuang'], 'giau');
  assert.ok(p.evidence.includes('ev-tui-0431') && p.evidence.includes('ev-anh-giao-tui'));
  assert.equal(done.result.eye, true, 'Mắt cú for both optional photos');
  assert.equal(done.chain, 'c5-m2');
  assert.deepEqual(w.missing, []);
});

test('c5-m1: a lost tail can be skipped after three tries; Quang spotting Tín on foot replays the alley; detected in the corridor thrice skips to the VIP door', () => {
  let fails = 0;
  const tail = play('c5-m1', {
    progress: before.get('c5-m1'),
    hold: { 'bam-xe': ({ visit, push }) => { if (visit <= 3) { push({ type: 'lost', id: 'xe-quang' }); return true; } return false; } },
    onFail: (v) => { fails++; return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.ok(tail.res.visits['di-bo'] && !tail.res.visits['nha-thuoc'], 'the skip lands at the alley checkpoint');
  assert.deepEqual([tail.done.stats.skipped, tail.done.result.grade], [1, 'C']);
  assert.ok(tail.w.log.filter((l) => l.k === 'vehicle' && l.id === 'xe-quang' && l.a.model).length >= 3, 'each retry restarts Quang\'s scooter');
  const foot = play('c5-m1', {
    progress: before.get('c5-m1'),
    hold: { 'di-bo': ({ visit, push }) => { if (visit === 1) { push({ type: 'spotted', id: 'quang' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c5m1.fail.nhanRa')); return 'retry'; },
  });
  assert.equal(foot.res.visits['di-bo'], 2);
  assert.ok(foot.w.log.filter((l) => l.k === 'spawn' && l.id === 'quang' && l.step === 'di-bo').length >= 2, 'the restore puts Quang back at the alley mouth');
  const corridor = play('c5-m1', {
    progress: before.get('c5-m1'),
    hold: { 'hanh-lang': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'gac-k1' }); return true; } return false; } },
    onFail: (v) => (v.failure.canSkip ? 'skip' : 'retry'),
  });
  assert.ok(corridor.res.visits['nghe-len'], 'the skip still lets him hear the VIP room');
  assert.ok(corridor.p.evidence.includes('ev-quang-no'));
  for (const run of [tail, foot, corridor]) { assert.deepEqual(run.w.missing, []); assert.equal(F.conscienceTier(run.p.conscience), 'clean'); }
});

test('c5-m2: three detections in the spa skip to the storeroom with the objectives counted; a wrong guess about Mai costs a token; the charcoal lotus', () => {
  const skip = play('c5-m2', {
    progress: before.get('c5-m2'), wrong: { maiODau: 'sa-lan' }, optional: ['sen-than'],
    hold: { 'khu-sau': ({ visit, push }) => { if (visit <= 3) { push({ type: 'detected', id: 'gac-spa-1' }); return true; } return false; } },
    onFail: (v) => { assert.equal(v.failure.reason, tx('@c5m2.fail.khu')); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.ok(skip.res.visits['kho-do']);
  assert.deepEqual([skip.p.flags.bugPlanted, skip.p.items.bug, skip.p.items['chia-khoa-kho']], [true, undefined, undefined], 'the skip counts the bug and the key');
  assert.ok(skip.p.evidence.includes('ev-so-do-b2'));
  assert.deepEqual(skip.p.deductions.maiODau, { answer: 'b2', tries: 2 });
  assert.ok(skip.p.evidence.includes('ev-sen-than-spa'));
  const end = skip.w.log.find((l) => l.k === 'dialogue' && l.id === 'c5m2-cuoi');
  assert.deepEqual(end.a.lines.map((l) => l.text), [tx('@c5m2.think.cuoi1'), tx('@c5m2.think.cuoi2')], 'the lotus line only when he saw it');
  const plain = play('c5-m2', { progress: before.get('c5-m2') });
  assert.deepEqual(plain.w.log.find((l) => l.k === 'dialogue' && l.id === 'c5m2-cuoi').a.lines.map((l) => l.text), [tx('@c5m2.think.cuoi2')]);
  assert.equal(plain.done.result.ghost, true, 'Bóng ma with no detection');
  assert.equal(skip.done.result.ghost, false);
  for (const run of [skip, plain]) assert.deepEqual(run.w.missing, []);
});

test('c5-m3: Tèo cornering Tín turns into a short brawl; a blown cover replays the floor with the cake; the keycard reader photo', () => {
  // Tèo closes in before Tín reaches the crowd: the branch condition (near 1.6 m) fires first
  const brawl = play('c5-m3', { progress: before.get('c5-m3'), optional: ['doc-the'],
    hold: { 'bi-nhan-dien': ({ w, visit }) => { const teo = w.actors.get('gac-teo'); Object.assign(teo, { x: w.player.x + 1, z: w.player.z, space: w.player.space }); return visit === 1; } } });
  assert.ok(brawl.res.visits['danh-nhau'] && brawl.res.visits.bep);
  assert.equal(brawl.done.stats.knockouts, 1);
  assert.equal(F.conscienceTier(brawl.p.conscience), 'clean');
  assert.ok(brawl.p.seen.includes('c5m3-strobe'), 'the strobe scene plays after the brawl too');
  assert.equal(brawl.done.result.eye, true);
  const cover = play('c5-m3', {
    progress: before.get('c5-m3'),
    hold: { 'san-nhay': ({ w, visit }) => { if (visit === 1) { w.meters.set('cover:shipper', 1); return true; } w.meters.set('cover:shipper', 0); return false; } },
  });
  assert.deepEqual(outs(cover.w, 'fail').map((e) => [e.reason, e.soft]), [[tx('@c5m3.fail.cover'), true]]);
  const retry = cover.w.log.findLast((l) => l.step === 'san-nhay' && l.k === 'player' && l.a.carry === 'order-banh-kem');
  assert.ok(retry, 'the replay puts the cake back in his hands');
  assert.ok(!cover.res.visits['danh-nhau'], 'the crowd path needs no fight');
  assert.equal(cover.done.stats.knockouts, 0);
  for (const run of [brawl, cover]) assert.deepEqual(run.w.missing, []);
});

test('LƯƠNG TÂM in chapter 5: a chokehold "kill" is a knockout; a real death fails each mission', () => {
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

test('replays: every chapter 5 mission replays in a sandbox from its chapter start and its replay block', () => {
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
