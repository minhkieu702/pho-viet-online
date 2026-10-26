// node --experimental-transform-types --test scripts/story-ch03.test.mjs
// Story content, chapter 3 (SEN TRONG BÙN · KHÔNG AI TIN): the chapter loads through the registry beside chapters 1–2
// and lints clean against the real sites and the engine contract plus the chapter-3 requests (CH03_REQUESTS, the ids
// the integrator adds to story/contract.ts); every text reference resolves (no inline strings, no orphan keys, no real
// brands, subtitles fit); every place is a site, a chapter place or a declared space anchor, the missions use the
// sites story-decisions.md gave them, and the chapter's own places stand on today's map (road, ground, the KHO 7
// shell); cutscene data is consistent and readable; the case-board cards of chapters 1–3 solve; the steps only wait
// for what the script offers. A mock host and an autopilot play the campaign from c1-m1 to c3-m3, every chapter-3
// checkpoint resumed, the alternative branches (the phone handed over, an early escape, the counter-tail skipped,
// the wrong deduction, the bear's ear, the course grades A–D, a slip of the chokehold) and the replays.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';

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
const ch1 = await import('../app/game/story/content/ch01.ts');
const ch2 = await import('../app/game/story/content/ch02.ts');
const ch3 = await import('../app/game/story/content/ch03.ts');
const cs1 = await import('../app/game/story/cutscenes/ch01.ts');
const cs2 = await import('../app/game/story/cutscenes/ch02.ts');
const cs3 = await import('../app/game/story/cutscenes/ch03.ts');
const SCENE_SCHEMA = await import('../app/game/story/scene.ts');
const t1 = await import('../app/game/story/text/vi/ch01.ts');
const t2 = await import('../app/game/story/text/vi/ch02.ts');
const t3 = await import('../app/game/story/text/vi/ch03.ts');
const common = await import('../app/game/story/text/vi/common.ts');
const { ENGINE_CONTRACT, LANE_WAVE, CHAPTER_WAVE, METER_PREFIXES } = await import('../app/game/story/contract.ts');

/**
 * Engine ids chapter 3 uses that story/contract.ts does not list yet: [contract kind, id, lane, what the engine does].
 * The integrator adds each as one line of contract.ts (owned by that lane); this test then still passes, since it only
 * asks that whatever the real contract rejects is listed here.
 */
const CH03_REQUESTS = [
  ['models', 'suv-den', 'vehicles', 'the existing suv body, black paint, tinted windows, plate 51K-660.13 (ev-xe-den; c3-m1 counter-tail, the chase op drives it)'],
  ['models', 'vios-van', 'vehicles', "Vân's old silver sedan (parked at KHO 7 in c3-m2; never named in text)"],
  ['meters', 'eye:suv-den', 'vehicles', "counter-tail eye meter 0..1 (chase-wanted.md §5.2 publishes 'eye:<ride>'; or add 'eye:' to METER_PREFIXES)"],
  ['props', 'sign', 'world', "story sign prop by variant: 'cho-thue' (KHO CHO THUÊ on the KHO 7 gate; story-decisions §7 world requests)"],
  ['arenas', 'hem-ong-tu', 'stealth', 'the training course in the alley behind SỬA XE TƯ: gravel, puddles, a wall lamp, the dark nook, bamboo hide, the shop corner; Bin is its one guard'],
  ['abilities', 'lean', 'stealth', 'lean and peek at a cover edge (A/D, stealth-player-kit.md §3.4)'],
  ['abilities', 'throw', 'stealth', 'throw a bolt, coin or bottle (G, §6.1)'],
  ['abilities', 'takedown', 'stealth', 'takedown from behind: tap E Hạ nhanh, hold E Khóa cổ (§4)'],
  ['abilities', 'drag', 'stealth', 'drag a knocked-out body (hold E, §9.2)'],
  ['abilities', 'phoneSilent', 'ui', 'phone silent mode: rings become a 3 m vibration (phone-detective-ui.md §3)'],
  ['abilities', 'luongTam', 'ui', 'the LƯƠNG TÂM page of the pause menu (knockouts vs kills)'],
  ['sceneProps', 'tea-set', 'director', "Lực's lacquered tea set (variant 'pouring')"],
  ['sceneProps', 'window-blinds', 'director', "venetian blinds in Lực's office (variant 'closing')"],
  ['sceneProps', 'business-card', 'director', "Vân's card with text lines"],
  ['sceneProps', 'gold-watch', 'director', "the gold watch on Lực's wrist"],
  ['sceneProps', 'wallet-photo', 'director', "Vân's open wallet with the photo of Bống (text caption)"],
  ['sceneProps', 'old-photo', 'director', 'the 2014 photo face up: two young policemen beside a jeep (text caption)'],
  ['sceneProps', 'cheap-phone', 'director', 'the burner: a cheap old smartphone with a cracked screen, taped at the corner, no accounts'],
  ['sceneProps', 'clip-camera', 'director', 'button-sized clip-on camera'],
];
/** The wave that plays chapter 3 for real: stealth, director, vehicles, spaces (wave 2); KHO 7 needs the Quận 4 wiring. */
const CH03_WAVE = CHAPTER_WAVE[3] ?? 2;
const ENGINE = Object.fromEntries(Object.entries(ENGINE_CONTRACT).map(([k, v]) => [k, { ...v }]));
for (const [kind, id, lane, what] of CH03_REQUESTS) ENGINE[kind][id] = [lane, what];

for (const n of [1, 2, 3]) C.registerChapter(n, () => import(`../app/game/story/content/ch0${n}.ts`));
const catalog = await C.loadCatalog([1, 2, 3]);
const MODULES = [ch1.chapter, ch2.chapter, ch3.chapter];
const SCENES = [...cs1.CUTSCENES, ...cs2.CUTSCENES, ...cs3.CUTSCENES];
const SCENES3 = cs3.CUTSCENES;
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = {};
for (const a of [ch1.ANCHORS, ch2.ANCHORS, ch3.ANCHORS]) for (const [k, v] of Object.entries(a)) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const MISSIONS = ['c1-m1', 'c1-m2', 'c1-m3', 'c2-m1', 'c2-m2', 'c2-m3', 'c3-m1', 'c3-m2', 'c3-m3'];
const CH3 = ['c3-m1', 'c3-m2', 'c3-m3'];
const SPACE_IDS = Object.keys(S.SPACES);
const tx = R.makeText(catalog, (n) => ({ cash: 1350, debtPaid: 1350, debtTotal: 40000, hintTokens: 2, hang: 'A' })[n]);

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
const subDur = (text) => Math.min(7.5, Math.max(1.8, 1.4 + 0.065 * [...text].length));

// ---- mock host (story-content.test.mjs, plus the chase controllers and actor moves) -------------------------------

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
    runner: null, choose: structuredClone(o.choose ?? {}), log: [], outs: [], resets: [], missing: [], ops: [], fails: 0, chases: new Map(),
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
        case 'spawn': if (!w.actors.has(a.id)) { const p = resolve(a.at); if (!p) miss(`spawn place ${a.at}`, ctx); w.actors.set(a.id, { state: STATE[a.behaviour?.k ?? 'idle'], sees: false, down: false, x: p?.x ?? 0, z: p?.z ?? 0, tags: a.tags ?? [], team: a.team }); } break;
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
        case 'photoTarget': case 'clue': case 'eavesdrop':
          w.helpers.set(a.id, a);
          if (a.k === 'eavesdrop' && typeof a.source === 'string' && !w.actors.has(a.source)) miss(`eavesdrop source ${a.source}`, ctx);
          if (a.k === 'photoTarget' && typeof a.subject === 'string' && !a.subject.includes('.') && !w.vehicles.has(a.subject) && !w.actors.has(a.subject)) miss(`photo subject ${a.subject}`, ctx);
          break;
        case 'stop': w.helpers.delete(a.id); w.chases.delete(a.id); break;
        case 'teleport': { const p = resolve(a.at); if (!p) miss(`teleport ${a.at}`, ctx); else Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: p.level ?? null, mode: a.vehicle ? 'bike' : 'foot', speed: 0 }); break; }
        case 'space':
          if (a.enter) { const p = resolve(`${a.enter}/${a.link}`) ?? resolve(`${a.enter}/${Object.keys(ANCHORS[a.enter] ?? {})[0]}`); if (!p) miss(`space ${a.enter}`, ctx); Object.assign(w.player, { x: p?.x ?? 0, z: p?.z ?? 0, space: a.enter, mode: 'foot' }); }
          if (a.leave) { const p = a.leave === true ? null : resolve(a.leave); if (a.leave !== true && !p) miss(`space leave ${a.leave}`, ctx); Object.assign(w.player, { space: null, mode: 'foot' }, p ? { x: p.x, z: p.z } : {}); }
          break;
        case 'player': if (a.stance) w.player.crouched = a.stance === 'crouch'; if (a.carry !== undefined) w.player.carrying = a.carry; if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'time': w.hour = a.hour; break;
        case 'do':
          w.ops.push(a.op);
          if (a.op === 'chase') {
            const ride = a.args?.ride;
            if (!w.vehicles.has(ride)) miss(`chase ride ${ride}`, ctx);
            for (const k of ['start', 'giveUp']) if (a.args?.[k] && !resolve(a.args[k])) miss(`chase ${k} ${a.args[k]}`, ctx);
            w.chases.set(a.args.id, a.args);
          }
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
      w.helpers.clear(); w.chases.clear(); w.meters.clear(); w.alarm = 0;
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

// ---- autopilot: satisfies each step's own conditions (story-content.test.mjs, extended) --------------------------

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
      case 'actor': {
        const a = w.actors.get(c.id);
        assert.ok(a, `actor ${c.id} exists for ${step}`);
        if (c.state) a.state = c.state;
        if (c.sees !== undefined) a.sees = c.sees;
        if (c.at) { const p = resolve(c.at); assert.ok(p, `place ${c.at}`); Object.assign(a, { x: p.x, z: p.z }); }
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
        else if (['escaped', 'caught'].includes(c.ev)) assert.ok(w.chases.has(c.id), `${step}: chase ${c.id} is running`);
        else if (c.ev === 'takedown') assert.ok(w.actors.has(c.id), `${step}: ${c.id} is on stage to be taken down`);
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
    else if (sess?.kind === 'board') for (const [a, b] of catalog.boards.get(sess.id).links) r.ui.link(a, b);
    if (v.phase !== 'run') continue;
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
/** Holds: the c2-m2 tail beats (as story-content.test.mjs) and the right answer at the c3-m3 corner (seeded per save). */
const tailBeats = ({ w, t }) => {
  const van = w.vehicles.get('van-51d');
  if (t < 0.15) Object.assign(van, resolve('nga-tu-108-54'));
  else if (t > 0.45 && t < 0.55) Object.assign(van, resolve('cau-khanh-hoi'));
  return t < 0.9;
};
const rightAnswer = ({ r, w }) => { w.choose.binLamGi ??= r.state().vars.binDo; return false; };
const HOLDS = { 'bam-duoi': tailBeats, 'nhin-goc': rightAnswer };
function play(id, o = {}) {
  const { r, w } = setup(o);
  assert.equal(r.start(id, o.replay ? { replay: true } : undefined), true, `${id} starts`);
  const res = autopilot(r, w, { ...o, hold: { ...HOLDS, ...(o.hold ?? {}) } });
  return { r, w, res, done: completed(w).at(-1), p: r.progress() };
}
const before = new Map();
const snapshots = [];

// ---- static checks ---------------------------------------------------------------------------------------------

test('chapter 3 loads through the registry beside chapters 1–2 and lints clean against the sites and the contract (plus the chapter-3 requests)', () => {
  assert.deepEqual([...catalog.missions.keys()], MISSIONS);
  for (const id of CH3) assert.equal(catalog.meta.get(id).chapter, 3);
  assert.deepEqual(R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: ENGINE }), [], 'chapters 1–3 lint clean');
  // whatever today's contract rejects is a listed request (once contract.ts has them, this keeps passing)
  const asked = new Set(CH03_REQUESTS.map(([k, id]) => `${k} '${id}'`));
  const rejected = R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: ENGINE_CONTRACT });
  for (const s of rejected) assert.ok([...asked].some((a) => s.includes(a)), `not requested: ${s}`);
  for (const [kind, id] of CH03_REQUESTS) assert.ok(kind in ENGINE_CONTRACT && !(kind === 'meters' && METER_PREFIXES.some((p) => id.startsWith(p))), `request ${kind} ${id}`);
  assert.deepEqual(Object.fromEntries(CH3.map((id) => [id, catalog.meta.get(id).giver])), { 'c3-m1': 'tin', 'c3-m2': 'van', 'c3-m3': 'tu' });
  for (const id of CH3) {
    const m = catalog.missions.get(id), meta = catalog.meta.get(id), sum = m.steps.reduce((t, s) => t + s.minutes, 0);
    assert.ok(Math.abs(sum - meta.minutes) <= meta.minutes * 0.5, `${id}: ${sum} min of steps vs ${meta.minutes} planned`);
    assert.ok(!m.chain, `${id} does not chain (the next mission is another day or night)`);
  }
  assert.equal(CH3.reduce((t, id) => t + catalog.meta.get(id).minutes, 0), 19, 'chapter 3 is 19 of the 235 planned minutes');
  assert.equal(catalog.missions.get('c3-m3').lethal, 'fail');
});

test('texts: every chapter-3 reference resolves, no inline strings, no orphan keys, no real brands, lines fit', () => {
  const tables = [common.COMMON, t1.TEXT, t2.TEXT, t3.TEXT];
  const keys = new Set(tables.flatMap((t) => Object.keys(t)));
  assert.equal(keys.size, tables.reduce((n, t) => n + Object.keys(t).length, 0), 'text keys are unique across chapters 1–3');
  const used = new Set();
  for (const [, s] of deep([ch3.chapter, ...SCENES3, ch3.ANCHORS])) if (isRef(s)) { assert.ok(keys.has(s.slice(1)), `missing text ${s}`); used.add(s.slice(1)); }
  for (const v of Object.values(t3.TEXT)) for (const m of v.matchAll(/\{@([\w.:-]+)\}/g)) assert.ok(keys.has(m[1]), `missing {@${m[1]}}`);
  assert.deepEqual(Object.keys(t3.TEXT).filter((k) => !used.has(k)), [], 'every chapter-3 key is used by chapter 3');
  const inline = [];
  for (const m of ch3.chapter.missions) R.walkMission(m, { text: (t, at) => { if (!isRef(t)) inline.push(`${at}: ${t}`); } });
  for (const x of [...ch3.EVIDENCE, ...ch3.JOURNAL]) for (const t of [x.title, x.text]) if (!isRef(t)) inline.push(`${x.id}: ${t}`);
  for (const c of ch3.CAST) for (const t of [c.name, c.role].filter(Boolean)) if (!isRef(t)) inline.push(`cast ${c.id}: ${t}`);
  for (const q of ch3.QUESTIONS) for (const t of [q.prompt, q.hint, ...q.options.map((x) => x.text)]) if (!isRef(t)) inline.push(`question ${q.id}: ${t}`);
  for (const sc of SCENES3) for (const [k, s] of deep(sc)) if (['text', 'sub', 'as', 'title', 'names', 'lines'].includes(k) && !isRef(s)) inline.push(`${sc.id}.${k}: ${s}`);
  assert.deepEqual(inline, []);
  for (const k of Object.keys(t3.TEXT)) {
    const v = tx(`@${k}`);
    for (const b of R.FORBIDDEN_BRANDS) assert.ok(!b.test(v), `${k}: real brand in "${v}"`);
    assert.ok(!/ {2}|\s[,.!?]|^\s|\s$/.test(v), `${k}: spacing in "${v}"`);
    assert.ok(!/Sen Vàng|SEN VÀNG/.test(t3.TEXT[k]), `${k}: the ring is named through {@ring}, never written out`);
    assert.ok(!/GiaoNhanh|GN-|Vios|Dream/.test(v), `${k}: retired or real name`);
  }
  assert.match(tx('@ev.tui0417.x'), /DO-0417/, 'order codes come from {@code}');
  assert.match(tx('@c3m1.cs.luc12'), /chạy ĐơnƠi/);
  assert.match(tx('@c3m1.tv1'), /Mái Ấm Sen Vàng/, 'the charity is named through {@ring}');
  const lines = [];
  for (const m of ch3.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') lines.push(...a.lines.map((l) => [m.id, l.text]));
  for (const sc of SCENES3) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') lines.push([sc.id, c.text]);
  for (const [at, ref] of lines) assert.ok(tx(ref).length <= 90, `${at}: subtitle over 90 characters: ${tx(ref)}`);
  for (const m of ch3.chapter.missions) {
    for (const s of m.steps) if (s.objective) assert.ok(tx(s.objective).length <= 60, `${m.id}/${s.id}: objective too long`);
    for (const [a, at] of actsOf(m)) {
      if (a.k === 'hint') assert.ok(tx(a.text).length <= 100, `${at}: hint too long`);
      if (a.k === 'sms' || a.k === 'toast' || a.k === 'bark') assert.ok(tx(a.text).length <= 90, `${at}: ${a.k} too long`);
    }
  }
  // every speaker of a chapter-3 line has a voice of its own (cast or the TV)
  for (const m of ch3.chapter.missions) for (const [a] of actsOf(m)) if (a.k === 'dialogue') for (const l of a.lines) assert.ok(catalog.cast.has(l.who) || l.who === 'tv', `${m.id}: speaker ${l.who}`);
});

/** Today's map: legacy strips, colliders and the Quận 4 build (as scripts/story-sites.test.mjs). */
const city = await import('../app/game/city.ts');
const { TERRAIN } = await import('../app/game/map/terrain.ts');
const DIST = await import('../app/game/map/districts.ts');
const { LEGACY_ROADS } = await import('../app/game/map/roads-legacy.ts');
const { buildDistrict } = await import('../app/game/map/build-district.ts');
const { QUAN_4 } = await import('../app/game/map/layout/quan-4.ts');
const q4 = buildDistrict(QUAN_4, LEGACY_ROADS);
const inPoly = (p, x, z) => { let hit = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit; } return hit; };
const stripsAt = (x, z) => TERRAIN.strips.filter((s) => {
  const along = s.alongX ? x : z, v = s.alongX ? z : x;
  return !((s.lo !== -Infinity && s.lo !== null && along <= s.lo) || (s.hi !== Infinity && s.hi !== null && along >= s.hi)) && Math.abs(v - s.at) < s.half;
});
const legacyAsphalt = (x, z) => stripsAt(x, z).length > 0 && city.inRect(city.LAND, x, z, -0.5);
const asphalt = (x, z) => legacyAsphalt(x, z) || (x >= 352 && !!q4.graph.edgeAt(x, z, 0));
function q4Clear(x, z, r) {
  for (const c of q4.colliders) {
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw), dx = x - c.cx, dz = z - c.cz;
    const lx = dx * co - dz * s, lz = dx * s + dz * co;
    const nx = Math.max(-c.hx, Math.min(c.hx, lx)), nz = Math.max(-c.hz, Math.min(c.hz, lz));
    if ((lx - nx) ** 2 + (lz - nz) ** 2 < r * r) return `${c.kind}:${c.key}`;
  }
  return null;
}
const land = (x, z) => (x < 352 ? TERRAIN.walkable(x, z) || !!TERRAIN.dockAt(x, z) : x >= 352 && inPoly(QUAN_4.bounds, x, z) && !DIST.waterAt(x, z));
const clear = (x, z, r) => (x < 352 ? (city.pointClear(x, z, r) ? null : 'legacy collider') : q4Clear(x, z, r));

test('places: every chapter-3 place resolves; the missions use their decided sites; only c3-m2 is P1; the chapter places stand on the map', () => {
  const refs = new Map(CH3.map((id) => [id, new Set()]));
  const check = (id, ref, at) => {
    if (typeof ref !== 'string') return;
    refs.get(id).add(ref);
    if (ref.includes('/')) {
      const [space, anchor] = ref.split('/');
      assert.ok(S.SPACES[space], `${at}: unknown space ${space}`);
      assert.ok(ANCHORS[space]?.[anchor], `${at}: anchor ${anchor} is not declared for ${space}`);
    } else assert.ok(PLACES[ref], `${at}: unknown place ${ref}`);
  };
  for (const id of CH3) {
    const m = catalog.missions.get(id);
    check(id, m.start?.at, id);
    for (const s of m.steps) {
      for (const x of [s.marker].flat().filter(Boolean)) check(id, x.at, `${id}/${s.id}`);
      for (const x of s.interact ?? []) check(id, x.at, `${id}/${s.id}`);
    }
    for (const [a, at] of actsOf(m)) {
      for (const k of ['at', 'leave']) if (typeof a[k] === 'string') check(id, a[k], at);
      if (a.k === 'vehicle' && typeof a.route === 'string') check(id, a.route, at);
      if (a.k === 'do') for (const k of ['route', 'start', 'giveUp']) if (typeof a.args?.[k] === 'string') check(id, a.args[k], at);
      if (a.k === 'photoTarget' && typeof a.subject === 'string' && a.subject.includes('.')) check(id, a.subject, at);
      if (a.k === 'space' && a.enter) refs.get(id).add(`${a.enter}/`);
      const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
      if (b?.k === 'goto') check(id, b.at, at); else if (b?.k === 'guard') check(id, b.post, at); else if (b?.k === 'patrol') [b.route].flat().forEach((x) => check(id, x, at));
    }
    for (const [c, at] of condsOf(m)) if (c.at) check(id, c.at, at);
    for (const [a] of actsOf(m)) if (a.k === 'cutscene') for (const [, s] of deep(SCENE.get(a.id))) refs.get(id).add(s.replace(/^set:([\w-]+)\..*$/, '$1/'));
  }
  const usedSite = (id, site) => [...refs.get(id)].some((r) => r === site || r.startsWith(`${site}.`) || r.startsWith(`${site}/`));
  for (const id of CH3) {
    const ms = S.MISSION_SITES[id];
    for (const site of ms.sites) assert.ok(usedSite(id, site), `${id} uses ${site} (MISSION_SITES)`);
    for (const space of ms.spaces ?? []) assert.ok(usedSite(id, space), `${id} uses space ${space} (MISSION_SITES)`);
    const p1 = [...refs.get(id)].some((r) => S.SITES[r.split(/[./]/)[0]]?.phase === 'P1');
    assert.equal(p1, ms.phase === 'P1', `${id} phase`);
  }
  // the chapter's own places
  const P = ch3.PLACES, errors = [];
  const ROAD = ['ch3.suv-cho', 'ch3.suv-bo', 'ch3.k7-xe-van'], SHELL = ['ch3.k7-long', 'ch3.k7-long-luoi', 'ch3.k7-day-chuyen', 'ch3.k7-thung-phuy'];
  for (const [id, p] of Object.entries(P)) {
    assert.ok(id.startsWith('ch3.') && !SITE_PLACES[id], `${id}: chapter places are 'ch3.*' and never shadow a site`);
    if (SHELL.includes(id)) { if (!(p.x > 560 && p.x < 600 && p.z > -132 && p.z < -80)) errors.push(`${id}: outside the KHO 7 shell`); continue; }
    if (ROAD.includes(id)) {
      if (!asphalt(p.x, p.z)) errors.push(`${id}: road place off the asphalt`);
      const st = stripsAt(p.x, p.z);
      // on a legacy strip along z, traffic keeps right: northbound (yaw π, heading -z) east of the centre line
      if (p.x < 352 && st.length === 1 && !st[0].alongX && Math.abs(Math.cos(p.yaw)) > 0.9) {
        const heading = Math.round(Math.cos(p.yaw)), lateral = p.x - st[0].at;
        if (Math.sign(lateral) !== -heading) errors.push(`${id}: against the traffic`);
      }
      continue;
    }
    if (!land(p.x, p.z)) errors.push(`${id}: not on land`);
    if (asphalt(p.x, p.z)) errors.push(`${id}: inside a road lane`);
    const hit = clear(p.x, p.z, p.r ?? 0.45);
    if (hit) errors.push(`${id} r ${p.r ?? 0.45}: hits ${hit}`);
  }
  assert.deepEqual(errors, []);
  assert.ok((P['ch3.ca-dream'].r ?? 0) >= 1, 'the Dream is restored on a bike-clear spot');
  // the KHO 7 interior places are where CS03 put the cage and the packing line (cutscenes/ch02.ts KHO7_MARKS)
  const hall = S.SITES['kho-7'].spots.hall, mk = (n) => ({ x: hall.x + cs2.KHO7_MARKS[n][0], z: hall.z + cs2.KHO7_MARKS[n][2] });
  assert.deepEqual([P['ch3.k7-long'], P['ch3.k7-long-luoi'], P['ch3.k7-day-chuyen']].map(({ x, z }) => ({ x, z })), [mk('cage'), mk('cageDoor'), mk('packing')]);
  // the corner Tín peeks round hides Bin from the alley: the shop's back corner lies between them
  const corner = P['ch3.goc-tiem'], bin = P['ch3.bin-goc'];
  assert.ok(Math.hypot(corner.x - bin.x, corner.z - bin.z) < 7 && bin.z > -77.5 && corner.z < -77.5, 'Bin waits round the corner, Tín on the alley side');
});

const JOINTS = new Set(['head', 'chest', 'handL', 'handR', 'pelvis']);
const CAPTIVE = /^captive/;
const VICTIMS = new Set(['hoa', 'beti', 'mai']);
const ROUGH = new Set(['collar-grab', 'punch', 'shove', 'strike', 'slap', 'drag-body', 'tackle']);
test('cutscenes: durations add up, marks, cast, sets and lines resolve, every chapter-3 scene is played by its mission', () => {
  const played = new Map();
  for (const id of MISSIONS) for (const [a] of actsOf(catalog.missions.get(id))) if (a.k === 'cutscene') played.set(a.id, [...(played.get(a.id) ?? []), id]);
  assert.equal(SCENE.size, SCENES.length, 'scene ids are unique across chapters 1–3');
  for (const id of CH3) for (const [a] of actsOf(catalog.missions.get(id))) if (a.k === 'cutscene') assert.ok(SCENES3.some((s) => s.id === a.id), `${id} plays ${a.id}, which chapter 3 scripts`);
  for (const sc of SCENES3) {
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
      if (c.k === 'rail') { assert.equal(c.points.length, c.look.length, `${sc.id} ${where}: rail look per point`); assert.equal(c.points.length, c.fov.length); }
      if (c.k === 'ots' && c.speaker === c.listener) assert.fail(`${sc.id} ${where}: over-the-shoulder of ${c.speaker} onto himself`);
      if (c.k === 'twoShot' && c.a === c.b) assert.fail(`${sc.id} ${where}: two-shot of ${c.a} alone`);
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
        if (c.k === 'anim') assert.ok(!ROUGH.has(c.clip), `${sc.id}: ${c.clip}: nobody is struck in chapter 3`);
        if (c.at !== undefined && c.at !== null) mark(c.at, `${where} ${c.k}`);
        if (c.attach !== undefined) mark(c.attach, `${where} ${c.k} attach`);
        if (c.k === 'walk' || c.k === 'ride') c.path.forEach((m) => mark(m, `${where} ${c.k}`));
        if (c.k === 'look' && c.at !== null) mark(c.at, `${where} look`);
        if (c.if) assert.doesNotThrow(() => setup().r.test(c.if));
      }
    });
    // a scene that opens the letterbox closes it again (a skip lands in play either way)
    const box = sc.shots.flatMap((sh) => (sh.cues ?? []).filter((c) => c.k === 'letterbox'));
    if (box.length) assert.equal(box.at(-1).on, false, `${sc.id}: letterbox closed at the end`);
  }
  // the counter-tail's SUV is introduced by the irony scene before the tail starts
  assert.ok(JSON.stringify(SCENE.get('c3m1-luc-goi')).includes('vehicle:suv-den'));
});

test('chapter-3 subtitles are readable: at most 17 characters a second, two lines on screen, none runs past the scene', () => {
  const issues = [];
  for (const sc of SCENES3) {
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

test('chapter-3 cutscenes name only engine ids of the contract or the chapter-3 requests; slow motion only in a freezeWorld scene', () => {
  const kinds = { ...ENGINE, rides: { ...ENGINE.models, ...ENGINE.rideModels }, sceneProps: { ...ENGINE.props, ...ENGINE.sceneProps } };
  const issues = [];
  for (const sc of SCENES3) {
    for (const [kind, id, where] of SCENE_SCHEMA.sceneVocab(sc)) if (!Object.prototype.hasOwnProperty.call(kinds[kind] ?? {}, id)) issues.push(`${sc.id} ${where}: ${kind} '${id}' is not in story/contract.ts`);
    const slow = sc.shots.some((sh) => (sh.cues ?? []).some((c) => c.k === 'slowmo'));
    if (slow && !sc.stage.freezeWorld) issues.push(`${sc.id}: slowmo outside a stage.freezeWorld scene`);
  }
  assert.deepEqual(issues, []);
  // chapter 3 adds no clip, pair clip, fx, sfx, grade, mesh or ambience: story-content.test.mjs checks those against chapters 1–2 only
  const fresh = SCENES3.flatMap((sc) => SCENE_SCHEMA.sceneVocab(sc)).filter(([k, id]) => ['clips', 'pairClips', 'fx', 'sfx', 'grades', 'meshes', 'ambience'].includes(k) && !Object.prototype.hasOwnProperty.call(ENGINE_CONTRACT[k], id));
  assert.deepEqual(fresh, []);
});

test('case board: the cards of chapters 1–3 are evidence with a source, the strings connect them and the board solves', () => {
  const cards = [...ch1.BOARD_CARDS, ...ch2.BOARD_CARDS, ...ch3.BOARD_CARDS], ids = cards.map((c) => c.id);
  assert.equal(new Set(cards.map((c) => c.slot)).size, cards.length, 'one card per lotus slot');
  assert.ok(cards.every((c) => c.slot >= 0 && c.slot <= 18), 'slots on the 19-slot lotus');
  const evidence = new Set(catalog.evidence.keys());
  const board = { id: 'test-ch1-3', title: '@cast.tin', cards, links: [...ch2.BOARD_LINKS, ...ch3.BOARD_LINKS] };
  assert.deepEqual(D.lintBoard(board, evidence), []);
  const seen = new Set([ids[0]]), todo = [ids[0]];
  while (todo.length) { const a = todo.pop(); for (const [x, y] of board.links) for (const [p, q] of [[x, y], [y, x]]) if (p === a && !seen.has(q)) { seen.add(q); todo.push(q); } }
  assert.equal(seen.size, ids.length, 'every card is on a string');
  const p = F.newProgress(); p.evidence.push(...ids);
  let solved = false;
  for (const [a, b] of board.links) solved = D.linkCards(board, p, a, b, (id) => p.evidence.includes(id)).solved;
  assert.equal(solved, true);
  const sources = new Set();
  for (const id of CH3) for (const [a] of actsOf(catalog.missions.get(id))) {
    if (a.k === 'evidence') sources.add(a.id);
    if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) sources.add(a.evidence);
  }
  assert.deepEqual(ch3.EVIDENCE.map((e) => e.id).filter((e) => !sources.has(e)), [], 'every chapter-3 card can be found in play');
  for (const c of ch3.BOARD_CARDS) assert.ok(!['ev-tv-mai-am', 'ev-xe-den', 'ev-tai-gau'].includes(c.id), `${c.id}: optional evidence stays off the board`);
});

test('every flag and mission variable a chapter-3 condition reads is written by chapters 1–3 (or is a choice result)', () => {
  const written = new Set(), read = [];
  const note = (a) => {
    if (a.k === 'flag') written.add(a.name);
    if (a.k === 'choice') { written.add(`choice:${a.id}`); for (const o of a.options) Object.keys(o.set ?? {}).forEach((k) => written.add(k)); }
  };
  const walk = (c, at, vr) => { if (!c) return; if (c.k === 'flag') read.push([c.name, at]); if (c.k === 'var') vr.push([c.name, at]); (c.of ?? []).forEach((x) => walk(x, at, vr)); walk(c.c, at, vr); };
  for (const id of MISSIONS) {
    const m = catalog.missions.get(id), vars = new Set(), varReads = [];
    for (const [a] of actsOf(m)) { note(a); if (a.k === 'var') vars.add(a.name); }
    if (!CH3.includes(id)) continue;
    for (const [c, at] of condsOf(m)) { if (c.k === 'flag') read.push([c.name, at]); if (c.k === 'var') varReads.push([c.name, at]); }
    for (const sc of SCENES3.filter((s) => s.mission === id)) for (const sh of sc.shots) for (const cue of sh.cues ?? []) walk(cue.if, sc.id, varReads);
    for (const [n, at] of varReads) assert.ok(vars.has(n), `${at}: reads mission var ${n} that nothing sets`);
  }
  for (const q of catalog.questions.values()) for (const a of q.onCorrect ?? []) note(a);
  for (const m of MODULES) for (const x of m.missions) for (const a of x.rewards ?? []) note(a);
  for (const [n, at] of read) assert.ok(written.has(n), `${at}: reads flag ${n} that nothing sets`);
});

test('chapter-3 steps only wait for what the script offers: interactions, tails, chases, clues, engine hooks of a built lane', () => {
  const METERS = new Set(['tail:bin', 'eye:suv-den']);
  for (const id of CH3) {
    const m = catalog.missions.get(id), acts = actsOf(m).map(([a]) => a);
    const specs = [...m.steps.flatMap((s) => s.interact ?? []), ...acts.filter((a) => a.k === 'interactable')];
    const offered = new Set(specs.map((x) => x.id)), climbs = new Set(specs.filter((x) => x.kind === 'climb').map((x) => x.id));
    const tails = new Set(acts.filter((a) => a.k === 'tail').map((a) => a.target)), chases = new Set(acts.filter((a) => a.k === 'do' && a.op === 'chase').map((a) => a.args.id));
    const actors = new Set(acts.filter((a) => a.k === 'spawn').map((a) => a.id));
    for (const [c, at] of condsOf(m)) {
      if (c.k === 'on' && c.ev === 'interact') assert.ok(offered.has(c.id) && !climbs.has(c.id), `${at}: waits for interaction ${c.id}`);
      if (c.k === 'on' && c.ev === 'climb') assert.ok(climbs.has(c.id), `${at}: waits for climb ${c.id}`);
      if (c.k === 'on' && ['arrived', 'lost', 'spotted'].includes(c.ev)) assert.ok(tails.has(c.id), `${at}: waits for tail ${c.id}`);
      if (c.k === 'on' && ['escaped', 'caught'].includes(c.ev)) assert.ok(chases.has(c.id), `${at}: waits for chase ${c.id}`);
      if (c.k === 'on' && c.ev === 'takedown') assert.ok(actors.has(c.id), `${at}: waits for a takedown of ${c.id}, who is spawned`);
      if (c.k === 'on' && c.ev === 'signal') assert.ok(ENGINE.signals[c.id] || ENGINE.ops[c.id], `${at}: signal ${c.id}`);
      if (c.k === 'q') {
        const entry = ENGINE.queries[c.name];
        assert.ok(entry, `${at}: engine query ${c.name} is in the contract`);
        assert.ok(LANE_WAVE[entry[0]] <= CH03_WAVE, `${at}: query ${c.name} is built after chapter 3 plays`);
      }
      if (c.k === 'meter') assert.ok(METERS.has(c.id), `${at}: meter ${c.id}`);
    }
    for (const a of acts) {
      if (a.k === 'do') assert.ok(ENGINE.ops[a.op], `${id}: op ${a.op}`);
      if (a.k === 'unlock' && a.ability) assert.ok(LANE_WAVE[ENGINE.abilities[a.ability][0]] <= CH03_WAVE, `${id}: ability ${a.ability} is built by wave ${CH03_WAVE}`);
    }
    for (const s of m.steps) for (const x of s.meters ?? []) assert.ok(METERS.has(x.id));
    assert.ok(m.steps.every((s) => s.minutes > 0));
  }
  // every chapter-3 lane is built by the wave that plays it (KHO 7 waits for the Quận 4 wiring, story-decisions §1.1)
  for (const [kind, , lane] of CH03_REQUESTS) assert.ok(LANE_WAVE[lane] <= CH03_WAVE || kind === 'props', `${kind}: lane ${lane}`);
});

// ---- playthroughs ----------------------------------------------------------------------------------------------

test('main path: one save plays c1-m1 → c3-m3 end to end on the mock host', () => {
  const { r, w } = setup({ onCheckpoint: (e, run) => { if (CH3.includes(run.state().mission)) snapshots.push({ id: run.state().mission, step: e.step, save: run.snapshot() }); } });
  for (const id of MISSIONS) {
    before.set(id, F.cloneProgress(r.progress()));
    const meta = catalog.meta.get(id), hour = meta.hours ? (meta.hours[0] + 0.5) % 24 : 12;
    assert.equal(F.availability(catalog.index, r.progress(), hour).find((a) => a.id === id).state, 'open', `${id} is open at ${hour}h`);
    assert.equal(r.start(id), true);
    const at = w.outs.length;
    w.choose = id === 'c1-m2' ? { bienSo: 'b' } : {};
    const res = autopilot(r, w, { hold: HOLDS });
    assert.equal(completed(w).at(-1).id, id);
    assert.deepEqual(w.outs.slice(at).filter((e) => e.type === 'fail'), [], `${id}: no fail on the main path`);
    assert.ok(res.ticks < 9000);
  }
  const p = r.progress();
  assert.deepEqual(p.completed, MISSIONS);
  assert.deepEqual(w.missing, [], 'every actor, vehicle and place a step uses exists');
  assert.deepEqual(r.state().issues, []);
  assert.equal(p.chapter, 3);
  assert.deepEqual(p.lunar, { month: 8, day: 3 });
  assert.deepEqual(outs(w, 'chapter').map((e) => e.n), [1, 2, 3]);
  assert.equal(outs(w, 'complete').find((e) => e.id === 'c3-m3').chapterUnlocked, 4, 'chapter 4 opens after the course');
  for (const f of ['reportedToLuc', 'vanAlly', 'suspectsPolice', 'knowsTu2014', 'trainedByTu']) assert.equal(p.flags[f], true, f);
  assert.deepEqual([p.flags['choice:dienThoai'], p.flags['choice:nhanVan'], p.flags['choice:lamMat'], p.flags['choice:hoc'], p.flags.courseGrade], ['chi', 'that', 'lam', 'hoc', 'A']);
  assert.equal(p.flags.handedPhoneToLuc, undefined); assert.equal(p.flags.photosRestored, undefined);
  for (const e of ['ev-danh-thiep-van', 'ev-luc-hoi', 'ev-dong-ho-vang', 'ev-kho-trong', 'ev-vach-long', 'ev-tui-0417', 'ev-hoa-don-anh-duong', 'ev-vet-keo', 'ev-anh-2014', 'ev-tu-ke']) assert.ok(p.evidence.includes(e), e);
  for (const j of ['j-luc', 'j-van', 'j-kho-trong', 'j-ai-bao', 'j-hai', 'j-tu-trinh-sat', 'j-luat']) assert.ok(p.journal.includes(j), j);
  assert.deepEqual(p.deductions.aiBao, { answer: 'cong-an', tries: 1 });
  for (const a of ['observe', 'lean', 'throw', 'takedown', 'drag', 'phoneSilent', 'luongTam']) assert.ok(p.abilities.includes(a), a);
  assert.deepEqual([p.items.burner, p.items.clipCam, p.items.bolt], [1, 1, 5]);
  assert.equal(F.conscienceTier(p.conscience), 'clean');
  assert.equal(p.conscience.knockouts, 0, 'practice takedowns never enter LƯƠNG TÂM');
  for (const id of SCENES3.map((s) => s.id)) assert.ok(p.seen.includes(id), `${id} played`);
  // the irony scene plays after Vân's card, and the counter-tail starts after it
  const ids = w.log.filter((l) => l.mission === 'c3-m1' && (l.k === 'cutscene' || (l.k === 'do' && l.id === 'chase'))).map((l) => l.id);
  assert.deepEqual(ids, ['c3m1-luc-moi', 'c3m1-phong-luc', 'c3m1-luc-hoi', 'c3m1-van', 'c3m1-luc-goi', 'chase']);
  assert.ok(w.log.some((l) => l.k === 'toast' && l.a.text === 'Bài tập của ông Tư · Hạng A'));
  assert.ok(w.log.some((l) => l.k === 'sms' && l.a.from === 'van' && l.a.text === 'Mai ba giờ chiều. Kho 7. Đi một mình.'));
  assert.ok(!w.log.some((l) => l.k === 'sms' && l.a.text === tx('@c3m1.sms.tin')), 'the first reply needs no proof');
  assert.deepEqual(snapshots.map((x) => `${x.id}/${x.step}`), [
    'c3-m1/vao-don', 'c3-m1/ra-xe', 'c3-m1/ve-nha', 'c3-m2/quan-sat', 'c3-m3/tieng-dong', 'c3-m3/nem', 'c3-m3/bam-bin', 'c3-m3/luat'], 'every chapter-3 checkpoint saved');
});

test('resume from every chapter-3 checkpoint: the setups rebuild the world and the mission completes', () => {
  assert.ok(snapshots.length);
  for (const { id, step, save } of snapshots) {
    const { r, w } = setup();
    assert.equal(r.resume(save), true, `${id}/${step} resumes`);
    autopilot(r, w, { hold: HOLDS });
    assert.equal(completed(w).at(-1)?.id, id, `${id} completes from ${step}`);
    assert.deepEqual(w.missing, [], `${id}/${step}: nothing used before it is rebuilt`);
    assert.equal(w.resets[0], 'checkpoint');
    assert.deepEqual(r.state().issues, []);
  }
  // after a resume at the course's last checkpoint the grade is recomputed from the saved counters
  const last = snapshots.find((x) => x.step === 'luat');
  const { r, w } = setup();
  r.resume(last.save); autopilot(r, w, { hold: HOLDS });
  assert.equal(r.progress().flags.courseGrade, 'A');
});

test('c3-m1: the phone handed over is wiped and the second reply asks for proof; shaking the SUV on the way out counts', () => {
  const { w, p, done, res } = play('c3-m1', {
    progress: before.get('c3-m1'), choose: { dienThoai: 'dua', nhanVan: 'tin' }, optional: ['tv', 'xe-den'],
    hold: { 've-nha': ({ visit, push, w }) => { if (visit === 1 && !w.pushedEscape) { w.pushedEscape = true; push({ type: 'escaped', id: 'duoi-suv' }); return true; } return false; } },
  });
  assert.equal(p.flags.handedPhoneToLuc, true);
  assert.ok(w.log.some((l) => l.k === 'toast' && l.a.text === tx('@c3m1.toast.xoa')));
  assert.deepEqual(w.log.filter((l) => l.k === 'sms' && l.a.from === 'van').map((l) => l.a.text), [tx('@c3m1.sms.tin'), tx('@c3m1.sms.hen'), tx('@c3m1.sms.xoa')]);
  assert.ok(p.evidence.includes('ev-xe-den') && p.evidence.includes('ev-tv-mai-am'));
  assert.equal(done.result.eye, true, 'Mắt cú: the plate and the TV');
  assert.ok((res.visits['cat-duoi'] ?? 0) <= 1, 'the escape latched in the mission history ends the counter-tail at once');
  assert.ok(w.log.some((l) => l.k === 'vehicle' && l.id === 'suv-den' && l.a.state === 'flee'), 'the SUV gives up');
  assert.deepEqual(w.missing, []);
});

test('c3-m1: caught three times, the fail card skips the counter-tail to the ride home (grade capped at C)', () => {
  let fails = 0;
  const { done, res, w } = play('c3-m1', {
    progress: before.get('c3-m1'),
    hold: { 'cat-duoi': ({ visit, push }) => { if (visit <= 3) { push({ type: 'caught', id: 'duoi-suv' }); return true; } return false; } },
    onFail: (v) => { fails++; assert.equal(v.failure.reason, 'Chiếc xe đen đã bám kịp bạn.'); return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.deepEqual([done.stats.skipped, done.result.grade], [1, 'C']);
  assert.ok(res.visits['thoat-duoi'] && res.visits['cat-duoi'] === 3);
  assert.ok(w.log.filter((l) => l.k === 'do' && l.id === 'chase').length >= 3, 'each retry restarts the SUV from the station');
  assert.deepEqual(w.missing, []);
});

test('c3-m2: a wiped phone comes back from the backup; any clue order works; a wrong deduction costs a token; the bear\'s ear', () => {
  const wiped = F.cloneProgress(before.get('c3-m2')); wiped.flags.handedPhoneToLuc = true;
  const run = play('c3-m2', { progress: wiped, optional: ['tai-gau'], wrong: { aiBao: 'quang' }, subOrder: { 'quan-sat': ['cua-hau', 'phuy', 'tui', 'long'] }, choose: { lamMat: 'so' } });
  assert.equal(run.p.flags.photosRestored, true);
  const anh = run.w.log.find((l) => l.k === 'dialogue' && l.id === 'c3m2-anh');
  assert.deepEqual(anh.a.lines.map((l) => l.text), ['c3m2.van.xoa1', 'c3m2.tin.xoa1', 'c3m2.van.xoa2', 'c3m2.tin.xoa2', 'c3m2.van.xoa3'].map((k) => tx(`@${k}`)));
  assert.deepEqual(run.p.deductions.aiBao, { answer: 'cong-an', tries: 2 });
  assert.equal(run.p.hintTokens, wiped.hintTokens - 1 + run.done.result.tokens, 'a wrong answer costs one hint token, never a fail');
  assert.ok(run.p.evidence.includes('ev-tai-gau')); assert.equal(run.done.result.eye, true);
  const tra = run.w.log.find((l) => l.k === 'dialogue' && l.id === 'c3m2-tra-loi');
  assert.deepEqual(tra.a.lines.slice(0, 2).map((l) => l.text), [tx('@c3m2.tin.so'), tx('@c3m2.van.so')]);
  // Vân reacts to each find, in the order found
  const found = run.w.log.filter((l) => l.k === 'dialogue' && /^c3m2-(long|tui|phuy|cua-hau)$/.test(l.id)).map((l) => l.id);
  assert.deepEqual(found, ['c3m2-cua-hau', 'c3m2-phuy', 'c3m2-tui', 'c3m2-long']);
  const plain = play('c3-m2', { progress: before.get('c3-m2') });
  assert.equal(plain.p.flags.photosRestored, undefined);
  assert.deepEqual(plain.w.log.find((l) => l.k === 'dialogue' && l.id === 'c3m2-anh').a.lines.map((l) => l.text), [tx('@c3m2.van.anh1'), tx('@c3m2.tin.anh1')]);
  for (const x of [run, plain]) assert.deepEqual(x.w.missing, []);
});

test('c3-m3: the course grade — A clean, B after a slip of the chokehold, C with a wrong look round the corner too, D after skipping the tail', () => {
  const grade = (o) => { const x = play('c3-m3', { progress: before.get('c3-m3'), ...o }); assert.deepEqual(x.w.missing, []); return x; };
  const a = grade({});
  assert.equal(a.p.flags.courseGrade, 'A');
  const slip = (cause) => ({ 'ha-guc': ({ push }) => { push({ type: 'takedown', id: 'bin', cause }); return false; } });
  const b = grade({ hold: slip('slip') });
  assert.equal(b.p.flags.courseGrade, 'B');
  assert.ok(b.w.log.some((l) => l.k === 'dialogue' && l.id === 'c3m3-slip'), 'Ông Tư: "Nhẹ thôi!"');
  assert.equal(b.p.conscience.kills, 0, 'a slip never kills');
  const fast = grade({ hold: slip('fast') });
  assert.equal(fast.p.flags.courseGrade, 'A', 'Hạ nhanh is no mistake');
  assert.ok(fast.w.log.some((l) => l.k === 'dialogue' && l.id === 'c3m3-fast'));
  const wrongPeek = ({ r, w }) => { const v = r.state().vars.binDo; w.choose.binLamGi ??= ['dienThoai', 'khoanhTay', 'ngoi'].find((x) => x !== v); return false; };
  const c = grade({ hold: { ...slip('slip'), 'nhin-goc': wrongPeek } });
  assert.equal(c.p.flags.courseGrade, 'C');
  assert.ok(c.w.log.some((l) => l.k === 'dialogue' && l.id === 'c3m3-goc-ket' && l.a.lines[0].text === tx('@c3m3.tu.sai')));
  // soft fails replay the beat and count: Bin hears the gravel once, sees the flashlit player once
  const soft = grade({ hold: {
    'tieng-dong': ({ w, visit }) => { if (visit === 1) { w.actors.get('bin').state = 'suspicious'; return true; } return false; },
    'bong-toi': ({ w, visit }) => { const g = w.actors.get('bin'); g.sees = visit === 1; return visit === 1; },
  } });
  assert.deepEqual(outs(soft.w, 'fail').map((e) => [e.reason, e.soft]), [['Bin nghe tiếng chân rồi.', true], ['Đèn pin của Bin rọi trúng bạn.', true]]);
  assert.equal(soft.p.flags.courseGrade, 'C');
  let fails = 0;
  const d = grade({
    hold: { 'bam-bin': ({ visit, push }) => { if (visit <= 3) { push({ type: 'lost', id: 'bin' }); return true; } return false; } },
    onFail: (v) => { fails++; return v.failure.canSkip ? 'skip' : 'retry'; },
  });
  assert.equal(fails, 3);
  assert.equal(d.p.flags.courseGrade, 'D');
  assert.ok(d.w.log.some((l) => l.k === 'cutscene' && l.id === 'c3m3-luat' && l.step === 'luat'), 'the skip lands on the market and the rule');
  assert.ok(d.w.log.some((l) => l.k === 'toast' && l.a.text === 'Bài tập của ông Tư · Hạng D'));
  for (const x of [a, b, fast, c, soft, d]) assert.equal(F.conscienceTier(x.p.conscience), 'clean');
});

test('c3-m3: the corner question follows what Bin was doing (seeded per save), and Ông Tư\'s line follows the escape route', () => {
  const picks = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const x = play('c3-m3', { progress: before.get('c3-m3'), seed });
    picks.add(x.w.choose.binLamGi);
    assert.equal(x.p.flags.courseGrade, 'A', `seed ${seed}: the right answer is the one Bin acted`);
  }
  assert.ok(picks.size >= 2, 'Bin does not always do the same thing');
  const khe = F.cloneProgress(before.get('c3-m3')); khe.flags.escapeRoute = 'khe';
  const { r } = setup({ progress: khe });
  assert.equal(r.test({ k: 'flag', name: 'escapeRoute', eq: 'khe' }), true);
  const cue = SCENE.get('c3m3-tiem-dem').shots[1].cues.filter((c) => c.k === 'say');
  assert.deepEqual(cue.filter((c) => r.test(c.if)).map((c) => c.text), ['@c3m3.cs.tu2a']);
  const { r: r2 } = setup({ progress: before.get('c3-m3') });
  assert.deepEqual(cue.filter((c) => r2.test(c.if)).map((c) => c.text), ['@c3m3.cs.tu2b']);
});

test('LƯƠNG TÂM in c3-m3: a real kill fails the course; a chokehold "kill" is a knockout', () => {
  const { r } = setup({ progress: before.get('c3-m3') });
  r.start('c3-m3');
  r.tick(0.2);
  r.event({ type: 'kill', id: 'bin', tag: 'training', cause: 'choke' });
  r.tick(0.1);
  assert.equal(r.view().phase === 'failed', false);
  r.event({ type: 'kill', id: 'bin', tag: 'training', cause: 'fall' });
  r.tick(0.1);
  assert.equal(r.view().failure.reason, R.LETHAL_REASON);
});

test('replays: every chapter-3 mission replays in a sandbox from its chapter start and its replay block', () => {
  const { r, w } = setup();
  for (const id of MISSIONS) { w.choose = id === 'c1-m2' ? { bienSo: 'b' } : {}; r.start(id); autopilot(r, w, { hold: HOLDS }); }
  const main = F.cloneProgress(r.progress());
  for (const id of CH3) {
    w.choose = {};
    assert.equal(r.start(id, { replay: true }), true);
    autopilot(r, w, { hold: HOLDS });
    assert.equal(completed(w).at(-1).replay, true, `${id} replay completes`);
  }
  const after = r.progress();
  assert.deepEqual([after.cash, after.flags, after.evidence, after.items], [main.cash, main.flags, main.evidence, main.items], 'replays change nothing but medals');
  assert.ok(CH3.every((id) => after.medals[id].plays === 2));
  assert.deepEqual(w.missing, []);
});
