// node --experimental-transform-types --test scripts/story-campaign.test.mjs
// The whole campaign SEN TRONG BÙN, chapters 1–11 together (wave-2 integration). Static checks over the content in
// campaign order: the chapters load through content/index.ts LOADERS and lint clean against the real sites and
// story/contract.ts CAMPAIGN_CONTRACT; every engine id of every mission script and cutscene has one owner lane
// (ENGINE_CONTRACT, SCENE_REQUESTS for chapters 4–5's scene ids, LATE_SCENE_REQUESTS for chapters 6–11's) and nothing
// there is stale; each chapter's own request list landed with its lane; no step waits on a query of a lane built after
// its chapter's wave. Continuity: every evidence id is granted before a condition, board, question or interrogation
// uses it; flags are written before they are read; items are given before they are taken; every speaker is in the
// cast by the chapter they speak in, nobody speaks in person while away (Quang between the pier and his return, Mai
// between the van and B2) or after death (Ông Tư only in Tín's head after the fire); the boards and the lotus wall keep
// one card per slot; the rescued count runs 0 → 11 → 28 → 40 → 41 and each rise is the group led out; playtime per
// chapter from the index minutes, the step minutes and the cutscene seconds (target 235 minutes).
// A mock host (the union of the chapter tests' hosts) and one autopilot play the campaign's main path c1-m1 → c11-m4 in
// order from a new game, saving through story/save.ts and loading into a fresh runner between chapters; every
// chapter's own test starts from a synthetic progress (its endOfChapterN), and the real progress at that point is
// checked against it; a save taken inside each chapter's first mission resumes and finishes; the LƯƠNG TÂM record
// reaches the right lines (Ông Tư in CS06, Vân after the stairwell and after B2, Cô Ba and Vân in the epilogue, Ông
// Tư's last line, the zero-kill badge) for a clean, a stained and a lost record.
// Imports pure modules only; city.ts-style './x' imports without an extension are retried as .ts (story-ch11.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { readFileSync } from 'node:fs';

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
const SAVE = await import('../app/game/story/save.ts');
const SCENE_SCHEMA = await import('../app/game/story/scene.ts');
const K = await import('../app/game/story/contract.ts');
const { TERRAIN } = await import('../app/game/map/terrain.ts');

const N = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const pad = (n) => String(n).padStart(2, '0');
const CH = await Promise.all(N.map((n) => import(`../app/game/story/content/ch${pad(n)}.ts`)));
const CS = await Promise.all(N.map((n) => import(`../app/game/story/cutscenes/ch${pad(n)}.ts`)));
const [ch1, ch2, ch3, ch4, ch5, , , , ch9] = CH;
/** Every built chapter, through the registry (content/index.ts LOADERS): this is what the game loads. */
const catalog = await C.loadCatalog();
const MODULES = CH.map((m) => m.chapter);
const SCENES = CS.flatMap((m) => m.CUTSCENES);
const SCENE = new Map(SCENES.map((s) => [s.id, s]));
const ANCHORS = {};
for (const m of CH) for (const [k, v] of Object.entries(m.ANCHORS ?? {})) ANCHORS[k] = { ...(ANCHORS[k] ?? {}), ...v };
const SITE_PLACES = S.sitePlaces();
const PLACES = { ...SITE_PLACES, ...Object.fromEntries(catalog.places) };
const SPACE_IDS = Object.keys(S.SPACES);
const ORDER = F.missionOrder(C.CAMPAIGN);
const ORD = new Map(ORDER.map((m, i) => [m.id, i]));
const MISSIONS = ORDER.map((m) => m.id);
const mission = (id) => catalog.missions.get(id);
const chapterOf = (id) => catalog.meta.get(id).chapter;
const tx = R.makeText(catalog, (n) => ({ cash: 300, debtPaid: 1350, debtTotal: 40000, hintTokens: 2, rescued: 41 })[n]);
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const LANES = new Set(Object.keys(K.LANE_WAVE));
const SCENE_ONLY = ['clips', 'pairClips', 'fx', 'sfx', 'grades', 'meshes', 'ambience'];
const BOAT_MODELS = new Set(['speedboat', 'speedboat-dark', 'tug', 'police-boat', 'barge-container']);
/** Water places: site spots flagged water and chapter places on the open river (a teleport there swims). */
const WATER = new Set([
  ...Object.entries(S.SITES).flatMap(([id, s]) => Object.entries(s.spots ?? {}).filter(([, p]) => p.water).map(([k]) => `${id}.${k}`)),
  ...[...catalog.places].filter(([, p]) => !p.level && !p.space && p.y === undefined && TERRAIN.inWater(p.x, p.z)).map(([id]) => id),
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
/** Conditions outside the mission walk: the index gate, dialogue `if`s inside cutscenes (scene cues). */
const sceneConds = (sc) => sc.shots.flatMap((sh) => (sh.cues ?? []).filter((c) => c.if).map((c) => c.if));
const cutscenesOf = (m) => actsOf(m).map(([a]) => a).filter((a) => a.k === 'cutscene').map((a) => SCENE.get(a.id)).filter(Boolean);
/** The cast id of a scene actor ('tpl:' and extras batches have none). */
const sceneCast = (sc, who) => (typeof sc.cast[who] === 'string' && !sc.cast[who].startsWith('tpl:') ? sc.cast[who] : null);

// ---- mock host: the union of the chapter tests' hosts -----------------------------------------------------------

const cmp = (a, op, b) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : op === '!=' ? a !== b : a === b);
const MODE = { foot: ['foot'], bike: ['bike'], car: ['car'], vehicle: ['bike', 'car', 'boat'], boat: ['boat'], swim: ['swim'] };
const STATE = { idle: 'idle', goto: 'goto', patrol: 'patrol', follow: 'follow', escort: 'escort', guard: 'idle', act: 'act', flee: 'flee', surrender: 'surrender', captive: 'captive' };
const BLOCKING = new Set(['cutscene', 'dialogue', 'call', 'title', 'fade', 'teleport', 'choice', 'space']);
/** What a blocking `do` op resolves with on the happy path (the keypad opens, a QTE is hit). */
const RESULTS = { keypad: 'open', qte: 'ok' };
/** Voices and scene channels that need nobody on stage. */
const OFFSTAGE = new Set(['phone', 'radio', 'think', 'narrate', 'inner', 'tv']);
const qkey = (c) => `${c.name}|${JSON.stringify(c.args ?? {})}`;

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
    player: { x: 0, z: 0, mode: 'foot', space: null, level: null, crouched: false, hidden: false, speed: 0, carrying: null, cover: null, visibility: 1, wanted: 0, outfit: null, locks: null },
    actors: new Map(), vehicles: new Map([['dream', { x: 0, z: 0, state: 'parked', model: 'dream' }]]), meters: new Map(), q: new Set(), helpers: new Map(),
    groups: new Map(), props: new Map(), hour: 12, alarm: 0, weapon: null, pillion: null, wanted: null,
    /** Lines spoken in missions with whether the speaker was on stage; scene lines that played (their `if` held). */
    presence: [], sceneLines: [], lastScene: null, frames: [],
  };
  const miss = (what, ctx) => w.missing.push(`${what} (${ctx.mission}/${ctx.step})`);
  const onStage = (who) => [...w.actors.entries()].some(([id, a]) => id === who || a.cast === who) || [...w.groups.values()].some((g) => g.looks.includes(who));
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
        case 'near': {
          const pos = (id) => (id === 'player' ? p : w.actors.get(id) ?? w.vehicles.get(id));
          const a = pos(c.a), b = pos(c.b);
          return !!a && !!b && (a.space ?? null) === (b.space ?? null) && Math.hypot(a.x - b.x, a.z - b.z) <= c.r;
        }
        case 'meter': { const v = w.meters.get(c.id); return v !== undefined && cmp(v, c.op, c.value); }
        case 'alarm': return cmp(w.alarm, c.op, c.level);
        case 'q': if (c.name === 'escort' && w.groups.get(c.args?.id)?.state === 'caged') return false; return w.q.has(qkey(c));
        default: return false;
      }
    },
    exec(a, h, ctx) {
      w.log.push({ k: a.k, id: a.id ?? a.target ?? a.op, step: ctx.step, mission: ctx.mission, restoring: ctx.restoring, a });
      switch (a.k) {
        case 'spawn':
          if (!w.actors.has(a.id)) {
            const p = resolve(a.at);
            if (!p) miss(`spawn place ${a.at}`, ctx);
            w.actors.set(a.id, { scope: a.scope ?? 'mission', state: STATE[a.behaviour?.k ?? 'idle'], sees: false, down: false, x: p?.x ?? 0, z: p?.z ?? 0, space: p?.space ?? null, tags: a.tags ?? [], cast: a.cast ?? null });
          }
          break;
        case 'despawn': if (a.id) w.actors.delete(a.id); if (a.tag) for (const [k, v] of [...w.actors]) if (v.tags.includes(a.tag)) w.actors.delete(k); break;
        case 'behave': {
          const x = w.actors.get(a.id);
          if (!x) miss(`behave ${a.id}`, ctx); else x.state = STATE[a.b.k];
          for (const k of ['at', 'post']) if (typeof a.b[k] === 'string' && !resolve(a.b[k])) miss(`behave place ${a.b[k]}`, ctx);
          break;
        }
        case 'bark': if (!w.actors.has(a.actor)) miss(`bark ${a.actor}`, ctx); break;
        case 'vehicle': {
          const v = w.vehicles.get(a.id), st = { drive: 'driving', park: 'parked', stop: 'stopped', flee: 'fleeing' };
          if (a.model || a.at) {
            const p = a.at ? resolve(a.at) : null;
            if (a.at && !p) miss(`vehicle place ${a.at}`, ctx);
            if (!a.model && !v) miss(`vehicle ${a.id} placed before it was spawned`, ctx);
            w.vehicles.set(a.id, { scope: a.model ? (a.scope ?? 'mission') : v?.scope, x: p?.x ?? v?.x ?? 0, z: p?.z ?? v?.z ?? 0, space: p?.space ?? null, state: st[a.state ?? 'park'], model: a.model ?? v?.model });
          } else if (!v) miss(`vehicle ${a.id}`, ctx);
          else if (a.state) v.state = st[a.state];
          for (const x of [a.route ?? []].flat()) if (!resolve(x)) miss(`route ${x}`, ctx);
          break;
        }
        case 'prop': if (a.remove) w.props.delete(a.id); else { if (a.at !== undefined && !resolve(a.at)) miss(`prop place ${a.at}`, ctx); w.props.set(a.id, a.kind); } break;
        case 'tail': if (!w.vehicles.has(a.target) && !w.actors.has(a.target)) miss(`tail ${a.target}`, ctx); w.helpers.set(a.target, a); break;
        case 'photoTarget': case 'clue': case 'eavesdrop':
          w.helpers.set(a.id, a);
          if (a.k === 'eavesdrop' && typeof a.source === 'string' && !w.actors.has(a.source) && !resolve(a.source)) miss(`eavesdrop source ${a.source}`, ctx);
          if (a.k === 'photoTarget' && typeof a.subject === 'string' && !resolve(a.subject) && !w.actors.has(a.subject) && !w.vehicles.has(a.subject)) miss(`photo subject ${a.subject}`, ctx);
          if (a.k === 'clue' && !resolve(a.at)) miss(`clue place ${a.at}`, ctx);
          break;
        case 'ride': if (a.driver && !w.actors.has(a.driver)) miss(`ride driver ${a.driver}`, ctx); if (a.to && !resolve(a.to)) miss(`ride to ${a.to}`, ctx); w.helpers.set(`ride:${a.mode}`, a); break;
        case 'stop': w.helpers.delete(a.id); break;
        case 'teleport': {
          const p = resolve(a.at);
          if (!p) { miss(`teleport ${a.at}`, ctx); break; }
          if (a.vehicle && !w.vehicles.has(a.vehicle)) miss(`teleport into missing vehicle ${a.vehicle}`, ctx);
          const boat = a.vehicle && BOAT_MODELS.has(w.vehicles.get(a.vehicle)?.model);
          Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: p.level ?? null, speed: 0, mode: a.vehicle ? (boat ? 'boat' : 'bike') : WATER.has(a.at) ? 'swim' : 'foot' });
          break;
        }
        case 'space':
          if (a.enter) {
            const p = resolve(`${a.enter}/${a.link}`) ?? resolve(`${a.enter}/${Object.keys(ANCHORS[a.enter] ?? {})[0]}`);
            if (!p) miss(`space ${a.enter}`, ctx);
            Object.assign(w.player, { x: p?.x ?? 0, z: p?.z ?? 0, space: a.enter, mode: 'foot', level: null });
          }
          if (a.leave) {
            const p = a.leave === true ? null : resolve(a.leave);
            if (a.leave !== true && !p) miss(`space leave ${a.leave}`, ctx);
            Object.assign(w.player, { space: null, mode: 'foot', level: p?.level ?? null }, p ? { x: p.x, z: p.z } : {});
          }
          if (a.variant && !S.SPACES[a.variant.id] && !S.SITES[a.variant.id]) miss(`space variant ${a.variant.id}`, ctx);
          break;
        case 'player':
          if (a.stance) w.player.crouched = a.stance === 'crouch';
          if (a.carry !== undefined) w.player.carrying = a.carry;
          if (a.cover !== undefined) w.player.cover = a.cover;
          if (a.outfit) w.player.outfit = a.outfit;
          if (a.lock !== undefined) w.player.locks = a.lock;
          break;
        case 'stealth': if (a.cover !== undefined) w.player.cover = a.cover; break;
        case 'time': w.hour = a.hour; break;
        case 'police': if (a.force !== undefined) w.player.wanted = a.force; if (a.reset) w.player.wanted = 0; break;
        case 'cutscene': {
          const sc = SCENE.get(a.id);
          if (!sc) { miss(`cutscene ${a.id}`, ctx); break; }
          // a scene that frames a story vehicle ('vehicle:<id>') needs it in the world, also after a skip or a restore
          for (const [, s] of deep(sc)) if (s.startsWith('vehicle:')) {
            const v = w.vehicles.get(s.slice(8));
            if (!v) miss(`${a.id} frames ${s}`, ctx); else w.frames.push({ scene: a.id, mark: s, x: v.x, z: v.z, px: w.player.x, pz: w.player.z, step: ctx.step });
          }
          for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say' && (!c.if || w.runner.test(c.if))) w.sceneLines.push({ mission: ctx.mission, scene: sc.id, who: sceneCast(sc, c.who) ?? c.who, ch: c.ch ?? 'scene', key: c.text.replace(/^@/, '') });
          w.lastScene = { mission: ctx.mission, cast: new Set(Object.keys(sc.cast).map((k) => sceneCast(sc, k)).filter(Boolean)) };
          break;
        }
        case 'dialogue': case 'call': {
          const staged = w.lastScene?.mission === ctx.mission ? w.lastScene.cast : new Set();
          for (const l of a.lines) {
            const off = a.k === 'call' || OFFSTAGE.has(l.voice ?? 'say') || l.who === 'tin' || !catalog.cast.has(l.who);
            w.presence.push({ mission: ctx.mission, step: ctx.step, id: a.id, who: l.who, voice: a.k === 'call' ? 'phone' : l.voice ?? 'say', present: off || onStage(l.who) || staged.has(l.who) });
          }
          break;
        }
        case 'do': {
          w.ops.push(a.op);
          const args = a.args ?? {};
          // ops with an id are live helpers (chases, escorts, the gondola: their 'arrived' / 'lost' / 'escaped' / 'spotted' carry that id)
          if (typeof args.id === 'string' && !a.wait) w.helpers.set(args.id, a);
          for (const [, s] of deep(args)) if (/^[a-z][\w-]*\/[\w]+$/.test(s) && !resolve(s)) miss(`op ${a.op} place ${s}`, ctx);
          if (a.op === 'chase') {
            for (const id of [args.ride, ...(args.rides ?? []), ...(args.pursuers ?? [])].filter(Boolean)) if (!w.vehicles.has(id)) miss(`chase ${args.id} vehicle ${id}`, ctx);
            for (const k of ['start', 'giveUp']) if (args[k] && !resolve(args[k])) miss(`chase ${k} ${args[k]}`, ctx);
          }
          if (a.op === 'pursue') { if (args.stop) w.helpers.delete('pursue'); else { for (const id of args.ids) if (!w.vehicles.has(id)) miss(`pursuer ${id}`, ctx); w.helpers.set('pursue', a); } }
          if (a.op === 'cctv') w.helpers.set(`cctv:${args.id}`, a);
          if (a.op === 'festival') for (const tr of args.troupes ?? []) if (!resolve(tr.at)) miss(`troupe place ${tr.at}`, ctx);
          if (a.op === 'wanted') w.wanted = args;
          if (a.op === 'arm') w.weapon = args.weapon;
          if (a.op === 'pillion') w.pillion = args.cast;
          if (a.op === 'escort') {
            if (args.spec && !w.groups.has(args.id)) w.groups.set(args.id, { state: args.spec.start?.aboard ? 'aboard' : args.spec.start?.cells ? 'caged' : 'out', n: args.spec.followers?.length ?? 0, looks: (args.spec.followers ?? []).map((f) => f.look) });
            const g = w.groups.get(args.id);
            if (!g) { miss(`escort group ${args.id}`, ctx); break; }
            const cmd = args.cmd?.k;
            if (cmd === 'follow' && g.state === 'caged') miss(`escort ${args.id}: 'follow' sent to a group still caged (only 'free' opens the cells)`, ctx);
            else if (cmd === 'free' || cmd === 'follow') g.state = 'follow';
            if (cmd === 'board') { if (!w.vehicles.has(args.cmd.vehicle)) miss(`board ${args.cmd.vehicle}`, ctx); g.state = 'aboard'; }
            if (cmd === 'release') g.state = 'safe';
          }
          break;
        }
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
      if (scope === 'step') {
        for (const [k, v] of [...w.actors]) if (v.scope === 'step') w.actors.delete(k);
        for (const [k, v] of [...w.vehicles]) if (v.scope === 'step') w.vehicles.delete(k);
        return;
      }
      w.actors.clear(); for (const k of [...w.vehicles.keys()]) if (k !== 'dream') w.vehicles.delete(k);
      w.helpers.clear(); w.groups.clear(); w.props.clear(); w.q.clear(); w.alarm = 0; w.lastScene = null;
      Object.assign(w.player, { hidden: false, crouched: false, level: null, visibility: 1, wanted: 0, locks: null });
    },
    emit(e) { w.outs.push(e); if (e.type === 'fail') w.fails++; if (e.type === 'checkpoint') o.onCheckpoint?.(e, w.runner); },
  };
  return w;
}
function setup(o = {}) {
  const w = mockWorld(o);
  const r = R.createRunner({ catalog, port: w.port, progress: o.progress && F.cloneProgress(o.progress), seed: o.seed ?? 12 });
  w.runner = r;
  return { r, w };
}

// ---- autopilot: the union of the chapter tests' autopilots ------------------------------------------------------

const ENGINE_SIGNALS = new Set(Object.keys(K.CAMPAIGN_CONTRACT.signals));
/**
 * Drives the running mission to completion: each tick of a step's run phase it makes the next required sub true, then
 * the step's `done` (or o.branch[step]'s branch). Events are pushed once per step entry; interactions and climbs must
 * be offered, evidence must come from a live photo target, clue or recorder mark, helper events from a running
 * helper, so a script that waits for something it never offers stalls here. Boards are solved by their strings and
 * hypotheses, questions answered right (o.wrong answers once wrongly), interrogations settled with an owned card.
 * Holds are keyed 'mission/step'.
 */
function autopilot(r, w, o = {}) {
  let step = null, lastVisit = '', key = '';
  const visits = {}, pushed = new Set(), answered = new Set(), waiting = new Map();
  const kf = (e) => `${key}|${e.type}|${e.id}|${e.evidence ?? ''}|${e.tag ?? ''}|${e.phase ?? ''}|${e.pad ?? ''}|${e.result ?? ''}`;
  const push = (e) => { const k = kf(e); if (pushed.has(k)) return; pushed.add(k); r.event(e); };
  const moveTo = (at, when, level) => {
    const p = resolve(at);
    assert.ok(p, `place ${at}`);
    Object.assign(w.player, { x: p.x, z: p.z, space: p.space ?? null, level: level !== undefined ? level : p.level ?? null });
    if (when === 'ride') w.player.mode = w.player.mode === 'boat' ? 'boat' : 'bike'; else if (when === 'water') w.player.mode = 'swim'; else if (when === 'foot') w.player.mode = 'foot';
  };
  /** An entry a watcher adds shows up with the watcher's queue a tick or two later: wait a little before failing. */
  const offered = (id, kind) => {
    const it = r.view().interacts.find((x) => x.id === id);
    if (it) return it;
    const n = (waiting.get(`${key}|${id}`) ?? 0) + 1;
    waiting.set(`${key}|${id}`, n);
    assert.ok(n < 6, `${step}: ${kind} ${id} is offered`);
    return null;
  };
  const liveSource = (id) => [...w.helpers.values()].find((h) => (h.k === 'photoTarget' || h.k === 'clue') && h.evidence === id)
    ?? [...w.helpers.values()].find((h) => h.k === 'do' && h.op === 'cctv' && h.args.marks.some((m) => m.evidence === id));
  function satisfy(c, def) {
    switch (c.k) {
      case 'all': for (const x of c.of) satisfy(x, def); return;
      case 'any': satisfy(c.of[o.any?.[step] ?? 0], def); return;
      case 'hold': satisfy(c.c, def); return;
      case 'reach': {
        moveTo(c.at);
        if (c.mode === 'bike' || c.mode === 'vehicle') w.player.mode = 'bike'; else if (c.mode === 'boat') w.player.mode = 'boat';
        else if (c.mode === 'swim') w.player.mode = 'swim'; else if (c.mode === 'foot') w.player.mode = 'foot';
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
        const pos = (id) => (id === 'player' ? w.player : w.actors.get(id) ?? w.vehicles.get(id));
        const a = pos(c.a), b = pos(c.b);
        assert.ok(a && b, `${step}: near ${c.a} ${c.b}`);
        if (c.a === 'player') Object.assign(w.player, { x: b.x, z: b.z, space: b.space ?? null }); else Object.assign(a, { x: b.x, z: b.z, space: b.space ?? null });
        return;
      }
      case 'vehicle': {
        const v = w.vehicles.get(c.id);
        assert.ok(v, `vehicle ${c.id} exists for ${step}`);
        if (c.state) v.state = c.state;
        if (c.at) { const p = resolve(c.at); Object.assign(v, { x: p.x, z: p.z }); }
        return;
      }
      case 'evidence': {
        const src = liveSource(c.id);
        assert.ok(src, `${step}: evidence ${c.id} has a live photo target, clue or recorder mark`);
        if (src.k === 'do') { push({ type: 'overlay', id: src.args.id, evidence: c.id }); return; }
        if (src.k === 'clue') moveTo(src.at, undefined, resolve(src.at).level ?? null);
        push({ type: src.k === 'clue' ? 'examine' : 'photo', id: src.id, evidence: c.id, quality: 0.9 });
        return;
      }
      case 'on': {
        const ev = { type: c.ev, id: c.id, ...(c.tag ? { tag: c.tag } : {}), ...(c.where ?? {}) };
        if (pushed.has(kf(ev))) return;
        if (c.ev === 'interact') {
          const it = offered(c.id, 'interaction');
          if (!it) return;
          moveTo(it.at, it.when, it.level);
        } else if (c.ev === 'climb') {
          const it = offered(c.id, 'climb');
          if (!it) return;
          assert.ok(it.kind === 'climb' && it.to, `${step}: climb ${c.id} is offered with a far end`);
          moveTo(it.at, it.when, it.level); moveTo(it.to, 'foot');
        } else if (c.ev === 'signal') {
          // an engine signal (duel phases, the landing, a red light…) is pushed; an op's own latch comes from the script,
          // or from a watcher that runs the op (the nurses' monitor): trigger that watcher
          if (!ENGINE_SIGNALS.has(c.id)) {
            const wt = (def.watchers ?? []).find((x) => x.do.some((a) => a.k === 'do' && a.op === c.id));
            if (wt) satisfy(wt.when, def);
            return;
          }
        } else if (c.ev === 'cutscene') {
          const wt = (def.watchers ?? []).find((x) => x.do.some((a) => a.k === 'cutscene' && a.id === c.id));
          if (wt) satisfy(wt.when, def);
          return;
        } else if (c.ev === 'eavesdrop') assert.ok(w.helpers.has(c.id), `${step}: eavesdrop ${c.id} is running`);
        else if (['arrived', 'lost', 'spotted', 'caught', 'escaped'].includes(c.ev) && c.id) {
          if (!w.helpers.has(c.id)) { const n = (waiting.get(`${key}|h:${c.id}`) ?? 0) + 1; waiting.set(`${key}|h:${c.id}`, n); assert.ok(n < 6, `${step}: helper ${c.id} is running`); return; }
        } else if (c.ev === 'alight' || c.ev === 'ride') {
          const ride = [...w.helpers.values()].find((x) => x.k === 'ride');
          if (!ride) return;
          if (c.ev === 'alight' && ride.to) moveTo(ride.to, 'foot');
        } else if (['takedown', 'knockout', 'restrain'].includes(c.ev) && c.id) {
          const a = w.actors.get(c.id);
          assert.ok(a, `${step}: ${c.id} is on stage to be taken down`);
          if (c.ev !== 'takedown') a.down = true;
        } else if (c.ev === 'choice' || c.ev === 'timer' || c.ev === 'dialogue' || c.ev === 'call' || c.ev === 'board' || c.ev === 'deduce' || c.ev === 'interrogation' || c.ev === 'evidence') return;
        push(ev);
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
      const how = o.onFail?.(v, visits[step] ?? 0, w);
      if (!how) throw new Error(`${s.mission}/${v.step} failed: ${v.failure.reason}`);
      assert.ok(how === 'skip' ? r.skipSection() : r.retry(), `${how} after "${v.failure.reason}"`);
      continue;
    }
    const sess = s.session;
    if (sess?.kind === 'deduce') { const q = catalog.questions.get(sess.id), wrong = o.wrong?.[sess.id]; r.ui.answer(wrong && !answered.has(sess.id) ? wrong : q.answer); answered.add(sess.id); }
    else if (sess?.kind === 'board') {
      const def = catalog.boards.get(sess.id);
      for (const [a, b] of def.links) r.ui.link(a, b);
      for (const hy of def.hypotheses ?? []) r.ui.propose(hy.id, hy.needs);
    } else if (sess?.kind === 'interrogate') {
      const def = catalog.interrogations.get(sess.id), view = r.ui.view();
      if (view.silent > 0 || !view.statement) continue;
      const st = def.statements.find((x) => x.id === view.statement.id);
      const card = st.cards.find((x) => r.progress().evidence.includes(x));
      assert.ok(card, `${sess.id}/${st.id}: a card that settles it is owned`);
      r.ui.present(card, st.kind === 'lie' ? 'accuse' : 'empathy');
      continue;
    }
    if (v.phase !== 'run') continue;
    // a new step entry (a re-entry after a branch, a soft fail, a retry) always resets the step scope: count entries by those resets
    const gen = `${s.mission}|${v.step}|${w.resets.length}`;
    if (gen !== lastVisit) { lastVisit = gen; step = v.step; visits[step] = (visits[step] ?? 0) + 1; key = `${s.mission}/${step}#${visits[step]}#${w.resets.length}`; }
    const m = mission(s.mission), def = m.steps.find((x) => x.id === step);
    if (o.hold?.[`${s.mission}/${step}`]?.({ r, w, visit: visits[step], t: s.t, push, moveTo })) continue;
    for (const id of o.optional?.[s.mission] ?? []) {
      const od = [...(def.optional ?? []), ...(m.optional ?? [])].find((x) => x.id === id);
      if (od && !s.stats.optional.includes(id) && (od.when.k !== 'evidence' || liveSource(od.when.id))) satisfy(od.when, def);
    }
    const subs = (def.subs ?? []).filter((x) => !x.optional), doneSubs = new Set(v.subs.filter((x) => x.done).map((x) => x.id));
    const next = subs.find((x) => !doneSubs.has(x.id));
    if (next) { satisfy(next.done, def); continue; }
    const b = o.branch?.[`${s.mission}/${step}`] ?? (def.done?.k === 'never' ? 0 : undefined);
    if (b !== undefined && def.branch?.[b]) satisfy(def.branch[b].when, def);
    else if (def.done) satisfy(def.done, def);
  }
  const v = r.view();
  throw new Error(`${r.state().mission} did not finish (stuck at ${v.step}, phase ${v.phase}, subs ${JSON.stringify(v.subs)}, offered ${v.interacts.map((x) => x.id)}, session ${JSON.stringify(r.state().session)}, log ${JSON.stringify(w.log.slice(-6).map((l) => [l.k, l.id, l.step]))})`);
}
const outs = (w, type) => w.outs.filter((e) => e.type === type);
const lines = (w, id) => w.log.findLast((l) => (l.k === 'dialogue' || l.k === 'call') && l.id === id)?.a.lines.map((l) => l.text) ?? [];

/** The beats chapters 1–3 hold on the main path (story-content.test.mjs, story-ch03.test.mjs). */
const tailBeats = ({ w, t }) => {
  const van = w.vehicles.get('van-51d');
  if (t < 0.15) Object.assign(van, resolve('nga-tu-108-54'));
  else if (t > 0.45 && t < 0.55) Object.assign(van, resolve('cau-khanh-hoi'));
  return t < 0.9;
};
const rightAnswer = ({ r, w }) => { w.choose.binLamGi ??= r.state().vars.binDo; return false; };
/** The main path: the plate test's right plate (c1-m2), the beats above, and every stop of the epilogue ride. */
const MAIN = {
  choose: { bienSo: 'b' },
  hold: { 'c2-m2/bam-duoi': tailBeats, 'c3-m3/nhin-goc': rightAnswer },
  optional: { 'c11-m4': ['ghe-ba-sau', 'ghe-truong', 'ghe-cong-vien'] },
};
/** Plays `ids` in order on one runner; returns per-mission records. */
function playMissions(r, w, ids, o = MAIN) {
  const rec = [];
  for (const id of ids) {
    const before = F.cloneProgress(r.progress());
    const meta = catalog.meta.get(id), hour = meta.hours ? (meta.hours[0] + 0.5) % 24 : 12;
    const avail = F.availability(catalog.index, r.progress(), hour).find((a) => a.id === id);
    assert.equal(avail.state, 'open', `${id} is open at ${hour}h`);
    const at = w.outs.length, logAt = w.log.length;
    assert.equal(r.start(id), true, `${id} starts`);
    const res = autopilot(r, w, o);
    const done = outs(w, 'complete').at(-1);
    assert.equal(done.id, id);
    assert.equal(done.chain, mission(id).chain ?? null, `${id} chains as its script says`);
    const p = r.progress();
    const startOutfit = mission(id).start?.outfit ?? null;
    const outfits = w.log.slice(logAt).filter((l) => l.k === 'player' && l.a.outfit).map((l) => l.a.outfit);
    rec.push({ id, before, after: F.cloneProgress(p), done, ticks: res.ticks, fails: w.outs.slice(at).filter((e) => e.type === 'fail'), startOutfit, endOutfit: outfits.at(-1) ?? startOutfit });
  }
  return rec;
}
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const KNOWN = { missions: [...catalog.missions.keys()], evidence: [...catalog.evidence.keys()] };

// ---- static checks: the campaign and the contract -----------------------------------------------------------------

test('chapters 1–11 are registered in LOADERS and lint clean together against the real sites and CAMPAIGN_CONTRACT', () => {
  assert.deepEqual(C.builtChapters(), N);
  assert.deepEqual([...catalog.missions.keys()].sort(), [...MISSIONS].sort(), 'every mission of the index has its script');
  assert.equal(MISSIONS.length, 36);
  for (const n of N) assert.equal(MODULES[n - 1].chapter, n);
  assert.deepEqual(R.lintContent(C.CAMPAIGN, MODULES, { places: Object.keys(SITE_PLACES), engine: K.CAMPAIGN_CONTRACT }), []);
  // one definition per id across the campaign (the lint reports duplicates of what the runner keys; scenes and places too)
  const dup = (what, ids) => { const seen = new Set(), d = []; for (const id of ids) { if (seen.has(id)) d.push(id); seen.add(id); } assert.deepEqual(d, [], `duplicate ${what}`); };
  dup('cutscene', SCENES.map((s) => s.id));
  dup('chapter place', MODULES.flatMap((m) => Object.keys(m.places ?? {})));
  for (const sc of SCENES) assert.ok(catalog.missions.has(sc.mission), `${sc.id}: mission ${sc.mission}`);
  for (const id of Object.keys(S.CUTSCENE_SITES)) assert.ok(SCENE.has(id), `numbered cutscene ${id} is written`);
  // every chapter's anchors belong to a space of sites.ts
  for (const [n, m] of CH.entries()) for (const space of Object.keys(m.ANCHORS ?? {})) assert.ok(S.SPACES[space], `ch${n + 1}: anchors of unknown space ${space}`);
});

test('engine contract: every id of chapters 1–11 has one owner lane; nothing is stale; each chapter\'s request list landed with its lane; waves', () => {
  const kinds = (k) => (k === 'rides' ? ['models', 'rideModels'] : k === 'sceneProps' ? ['props', 'sceneProps'] : [k]);
  const TABLES = [['ENGINE_CONTRACT', K.ENGINE_CONTRACT], ['SCENE_REQUESTS', K.SCENE_REQUESTS], ['LATE_SCENE_REQUESTS', K.LATE_SCENE_REQUESTS]];
  // one table per id, scene kinds only outside ENGINE_CONTRACT, owner lanes everywhere
  for (const [name, table] of TABLES) for (const [kind, ids] of Object.entries(table)) {
    assert.ok(kind in K.ENGINE_CONTRACT, `${name}: kind ${kind}`);
    if (name !== 'ENGINE_CONTRACT') assert.ok(SCENE_ONLY.includes(kind), `${name} holds scene vocabulary only (${kind})`);
    for (const [id, entry] of Object.entries(ids)) {
      assert.ok(LANES.has(entry[0]) && entry[1].length > 3, `${name} ${kind} '${id}': owner lane and what it does`);
      assert.equal(TABLES.filter(([, t]) => has(t[kind], id)).length, 1, `${kind} '${id}' is listed once`);
    }
  }
  // every cutscene id has an owner, and every scene-vocabulary id of the three tables is used by a cutscene
  const used = new Set();
  for (const sc of SCENES) for (const [kind, id, where] of SCENE_SCHEMA.sceneVocab(sc)) {
    assert.ok(kinds(kind).some((k) => has(K.CAMPAIGN_CONTRACT[k], id)), `${sc.id} ${where}: ${kind} '${id}' has no owner in story/contract.ts`);
    for (const k of kinds(kind)) used.add(`${k}:${id}`);
  }
  for (const kind of SCENE_ONLY) for (const id of Object.keys(K.CAMPAIGN_CONTRACT[kind])) assert.ok(used.has(`${kind}:${id}`), `${kind} '${id}' is used by no cutscene (stale)`);
  // mission-script vocabulary: used by some chapter unless it is a planned id of the Wave 0 specs
  for (const m of catalog.missions.values()) {
    if (m.start?.outfit) used.add(`outfits:${m.start.outfit}`);
    if (m.start?.weather) used.add(`weather:${m.start.weather}`);
    for (const [a] of actsOf(m)) {
      if (a.k === 'do') used.add(`ops:${a.op}`);
      if (a.k === 'player') { for (const [k, v] of [['outfits', a.outfit], ['carry', a.carry], ['poses', a.pose], ['covers', a.cover]]) if (v) used.add(`${k}:${v}`); for (const l of a.lock ?? []) used.add(`locks:${l}`); }
      if (a.k === 'stealth') { if (a.arena) used.add(`arenas:${a.arena}`); if (a.cover) used.add(`covers:${a.cover}`); for (const k of Object.keys(a.rules ?? {})) used.add(`stealthRules:${k}`); }
      if (a.k === 'unlock') { if (a.ability) used.add(`abilities:${a.ability}`); if (a.outfit) used.add(`outfits:${a.outfit}`); }
      if (a.k === 'prop' && a.kind) used.add(`props:${a.kind}`);
      if (a.k === 'vehicle' && a.model) used.add(`models:${a.model}`);
      if (a.k === 'spawn' && a.template) used.add(`templates:${a.template}`);
      const b = a.k === 'spawn' ? a.behaviour : a.k === 'behave' ? a.b : null;
      if (b?.k === 'act') used.add(`acts:${b.name}`);
      if (a.k === 'music' && a.id) used.add(`music:${a.id}`);
      if (a.k === 'sting') used.add(`stings:${a.id}`);
      if (a.k === 'weather') used.add(`weather:${a.set}`);
      if (a.k === 'world' && a.policy.weather?.set) used.add(`weather:${a.policy.weather.set}`);
    }
    if (m.world?.weather?.set) used.add(`weather:${m.world.weather.set}`);
    for (const s of m.steps) for (const x of s.meters ?? []) if (!x.flag) used.add(`meters:${x.id}`);
    for (const [c] of condsOf(m)) {
      if (c.k === 'q') used.add(`queries:${c.name}`);
      if (c.k === 'on' && c.ev === 'signal') used.add(`signals:${c.id}`);
      if (c.k === 'meter') used.add(`meters:${c.id}`);
      if (c.k === 'ability') used.add(`abilities:${c.id}`);
      if (c.k === 'carrying') used.add(`carry:${c.item}`);
    }
  }
  const stale = [];
  for (const [kind, ids] of Object.entries(K.ENGINE_CONTRACT)) {
    if (SCENE_ONLY.includes(kind) || ['stealthRules', 'covers', 'locks', 'weather'].includes(kind)) continue;
    // a scene prop may also be a prop a mission places, and a ride model a model it drives
    const alsoAs = kind === 'sceneProps' ? 'props' : kind === 'rideModels' ? 'models' : null;
    for (const [id, [, what]] of Object.entries(ids)) if (!used.has(`${kind}:${id}`) && !(alsoAs && used.has(`${alsoAs}:${id}`)) && !/^planned\b/.test(what)) stale.push(`${kind}:${id}`);
  }
  assert.deepEqual(stale, [], 'contract ids no chapter uses (mark them planned or drop them)');
  // the chapters' own request lists (chapter 4 CONTRACT_REQUESTS, chapters 5–11 ENGINE_NEEDS) all landed, each with its lane
  for (const [n, m] of CH.entries()) for (const table of [m.CONTRACT_REQUESTS, m.ENGINE_NEEDS]) for (const [kind, ids] of Object.entries(table ?? {})) for (const [id, [lane]] of Object.entries(ids)) {
    const landed = K.CAMPAIGN_CONTRACT[kind]?.[id];
    assert.ok(landed, `ch${n + 1}: ${kind} '${id}' is in story/contract.ts`);
    assert.equal(landed[0], lane, `ch${n + 1}: ${kind} '${id}' lane`);
  }
  // every chapter has a wave; a step only waits on a query of a lane built by its chapter's wave (a stub answers false)
  for (const n of N) assert.ok(K.CHAPTER_WAVE[n] >= 1, `chapter ${n} has a wave`);
  for (const id of MISSIONS) for (const [c, at] of condsOf(mission(id))) if (c.k === 'q') {
    const lane = K.CAMPAIGN_CONTRACT.queries[c.name][0];
    assert.ok(K.LANE_WAVE[lane] <= K.CHAPTER_WAVE[chapterOf(id)], `${at}: query ${c.name} (${lane}, wave ${K.LANE_WAVE[lane]}) in chapter ${chapterOf(id)} (wave ${K.CHAPTER_WAVE[chapterOf(id)]})`);
  }
  for (const [lane, wave] of Object.entries(K.LANE_WAVE)) assert.ok(wave <= Math.max(...Object.values(K.CHAPTER_WAVE)), `lane ${lane} lands before the last chapter is played`);
});

test('power regions: street only, each a map/consts.ts Rect object (never a bare array), in a mission op or a scene cue', () => {
  const rectOk = (r) => !!r && !Array.isArray(r) && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(r[k])) && r.minX < r.maxX && r.minZ < r.maxZ;
  let n = 0;
  for (const id of MISSIONS) for (const [a, at] of actsOf(mission(id))) if (a.k === 'do' && a.op === 'power') {
    for (const reg of a.args.regions) { n++; assert.ok(typeof reg === 'object' && rectOk(reg.rect), `${at}: power region ${JSON.stringify(reg)} is {id, rect: {minX, maxX, minZ, maxZ}, level}`); }
    for (const reg of a.args.regions) assert.ok(!S.SPACES[reg.id ?? reg], `${at}: ${reg.id ?? reg} is an interior: its light is a space variant (festival-blackout-heli.md §2.6)`);
  }
  for (const sc of SCENES) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'power') {
    n++; assert.ok(rectOk(c.region.rect), `${sc.id}: power cue rect`);
    if (c.sweep) assert.ok(c.sweep.from !== c.sweep.to && c.sweep.step > 0, `${sc.id}: a sweep that moves`);
  }
  assert.ok(n >= 2, 'the strip blackout: the CS09 sweep and the steady state');
  // the CS09 sweep and the steady state are the same region
  const cue = SCENE.get('cs09_dem_ram_mat_dien').shots.flatMap((sh) => sh.cues ?? []).find((c) => c.k === 'power');
  const op = actsOf(mission('c10-m1')).map(([a]) => a).find((a) => a.k === 'do' && a.op === 'power');
  assert.deepEqual(cue.region, op.args.regions[0]);
});

test('scene QTEs (escort-boss-qte.md §3.4 context scene) are scene cues; play QTEs are only the play ones of the catalogue', () => {
  // c6m3-punch is 'scene' in the §3.4 table, but c6-m3 reads its result (the punch may be held back: flag punchedQuang) and a
  // scene cue has no result to latch yet, so it stays a play QTE between two scenes (contract ops.qte; openIssues of s2-fix)
  const PLAY = new Set(['c6m3-tackle', 'c6m3-punch', 'c8m2-tackle']);
  const SCENE_QTES = new Map([['c10m3-roll', 'cs11_dem_toi_nam'], ['c10m3-choke', 'cs11_dem_toi_nam'], ['c11m1-gun', 'c11m1-ca-bin'], ['c11m1-wheel', 'c11m1-ca-bin'], ['c11m3-grip', 'cs12_giao_tan_tay'], ['c11m3-haul', 'cs12_giao_tan_tay_trao']]);
  for (const id of MISSIONS) for (const [a, at] of actsOf(mission(id))) if (a.k === 'do' && a.op === 'qte') assert.ok(PLAY.has(a.args.id) && a.args.context === 'play', `${at}: ${a.args.id} is a play QTE of the catalogue`);
  for (const [qid, sid] of SCENE_QTES) {
    const sc = SCENE.get(sid), labels = sc.shots.map((sh) => sh.label);
    const hit = sc.shots.flatMap((sh) => (sh.cues ?? []).filter((c) => c.k === 'qte' && c.id === qid).map((c) => [c, sh]));
    assert.equal(hit.length, 1, `${qid} is a cue of ${sid}`);
    const [c, sh] = hit[0];
    assert.ok(typeof c.window === 'number' && c.window > 0, `${qid}: a window in real seconds`);
    assert.ok(c.t === undefined || c.t <= sh.dur, `${qid}: inside its shot`);
    assert.equal(c.onFail, 'loop');
    assert.ok(labels.includes(c.loop ?? sh.label), `${qid}: loops to a shot of its scene`);
    assert.ok(catalog.text.has(c.label.slice(1)), `${qid}: label`);
  }
});

// ---- static checks: continuity in campaign order ------------------------------------------------------------------

/** Where each evidence id, flag and item is first granted / written / given, and where each is used, in campaign order. */
function ledger() {
  const src = { evidence: new Map(), flags: new Map(), items: new Map() }, use = { evidence: [], flags: [], items: [] };
  const first = (map, id, ord) => { if (!map.has(id) || map.get(id) > ord) map.set(id, ord); };
  const grantActs = (acts, ord) => R.walkActs(acts, {
    act(a) {
      if (a.k === 'evidence') first(src.evidence, a.id, ord);
      if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence) first(src.evidence, a.evidence, ord);
      if (a.k === 'do') for (const [k, v] of deep(a.args ?? {})) if (k === 'evidence') first(src.evidence, v, ord);
      if (a.k === 'flag' || a.k === 'inc') first(src.flags, a.name, ord);
      if (a.k === 'choice') { first(src.flags, `choice:${a.id}`, ord); for (const o of a.options) for (const f of Object.keys(o.set ?? {})) first(src.flags, f, ord); }
      if (a.k === 'give') first(src.items, a.item, ord);
    },
  }, '');
  for (const id of MISSIONS) {
    const m = mission(id), ord = ORD.get(id);
    visit(m, (kind, x, at) => {
      if (kind === 'act') {
        grantActs([x], ord);
        if (x.k === 'board') { const b = catalog.boards.get(x.id); grantActs(b.reveals, ord); for (const c of b.cards) if (c.needs !== null) use.evidence.push([c.needs ?? c.id, ord, `${at}: board ${b.id}`]); for (const h of b.hypotheses ?? []) for (const e of h.needs) if (catalog.evidence.has(e)) use.evidence.push([e, ord, `${at}: hypothesis ${h.id}`]); if (b.question) { const q = catalog.questions.get(b.question); grantActs(q.onCorrect, ord); for (const o of q.options) for (const e of o.needs ?? []) use.evidence.push([e, ord, `${at}: question ${q.id}`]); } }
        if (x.k === 'deduce') { const q = x.q ?? catalog.questions.get(x.id); grantActs(q.onCorrect, ord); for (const o of q.options) for (const e of o.needs ?? []) use.evidence.push([e, ord, `${at}: question ${q.id}`]); }
        if (x.k === 'interrogate') { const d = catalog.interrogations.get(x.id); grantActs(d.done, ord); for (const s of d.statements) { for (const f of Object.keys(s.set ?? {})) first(src.flags, f, ord); for (const e of s.cards) if (catalog.evidence.has(e)) use.evidence.push([e, ord, `${at}: interrogation ${d.id}/${s.id}`]); } }
        if (x.k === 'take') use.items.push([x.item, ord, at]);
        if (x.k === 'do' && x.op === 'photoExamine') use.evidence.push([x.args.photo, ord, `${at}: photoExamine`]);
      } else {
        if (x.k === 'evidence') use.evidence.push([x.id, ord, at]);
        if (x.k === 'flag') use.flags.push([x.name, ord, at]);
        if (x.k === 'item') use.items.push([x.id, ord, at]);
      }
    });
    grantActs(m.rewards, ord);
    for (const sc of cutscenesOf(m)) for (const c of sceneConds(sc)) R.walkCond(c, { cond(y) { if (y.k === 'flag') use.flags.push([y.name, ord, `${sc.id}`]); if (y.k === 'evidence') use.evidence.push([y.id, ord, sc.id]); } }, sc.id);
    if (catalog.meta.get(id).when) R.walkCond(catalog.meta.get(id).when, { cond(y) { if (y.k === 'flag') use.flags.push([y.name, ord, `${id} (index gate)`]); } }, id);
  }
  return { src, use };
}
const LEDGER = ledger();

test('continuity: evidence is granted before it is used, flags written before they are read, items given before they are taken', () => {
  const late = [];
  for (const kind of ['evidence', 'flags', 'items']) for (const [id, ord, at] of LEDGER.use[kind]) {
    const s = LEDGER.src[kind].get(id);
    if (s === undefined) late.push(`${kind} ${id} used at ${at} is never ${kind === 'flags' ? 'written' : kind === 'items' ? 'given' : 'granted'}`);
    else if (s > ord) late.push(`${kind} ${id} used at ${at} (${MISSIONS[ord]}) is first ${kind === 'flags' ? 'written' : 'granted'} in ${MISSIONS[s]}`);
  }
  assert.deepEqual(late, []);
  assert.ok(LEDGER.use.evidence.length > 100 && LEDGER.use.flags.length > 100 && LEDGER.use.items.length > 10, `the ledger sees the campaign (${LEDGER.use.evidence.length} evidence uses, ${LEDGER.use.flags.length} flag reads, ${LEDGER.use.items.length} item uses)`);
  assert.ok(LEDGER.src.evidence.size >= catalog.evidence.size - 2, `nearly every evidence id has a source (${LEDGER.src.evidence.size} of ${catalog.evidence.size})`);
  // every evidence the catalog defines can be found in play
  assert.deepEqual([...catalog.evidence.keys()].filter((id) => !LEDGER.src.evidence.has(id)), [], 'evidence no mission grants');
  // a chained mission follows straight on: it starts after the one before (later that day, or the next day at the latest)
  for (const id of MISSIONS) {
    const m = mission(id), next = m.chain && mission(m.chain);
    if (!next) continue;
    const h0 = m.start?.hour, h1 = next.start?.hour, d0 = m.start?.lunar, d1 = next.start?.lunar;
    if (h0 === undefined || h1 === undefined) continue;
    // a night keeps its date past midnight ("đêm mùng một" at 00:18 is still mùng 1)
    let dt = d0 !== undefined && d1 !== undefined ? (d1 - d0) * 24 + (h1 - h0) : (h1 - h0 + 24) % 24;
    if (dt < 0 && d0 === d1) dt += 24;
    assert.ok(dt >= 0 && dt <= 30, `${id} (mùng ${d0 ?? '?'}, ${h0}h) → ${m.chain} (mùng ${d1 ?? '?'}, ${h1}h): ${dt} h later`);
  }
  // the case-board cards each chapter pins on the lotus wall are evidence some mission grants, by that chapter
  for (const [n, m] of CH.entries()) for (const c of m.BOARD_CARDS ?? []) {
    const id = c.needs ?? c.id, s = LEDGER.src.evidence.get(id);
    assert.ok(s !== undefined, `ch${n + 1} wall card ${id} is granted somewhere`);
    assert.ok(chapterOf(MISSIONS[s]) <= n + 1, `ch${n + 1} wall card ${id} is granted by chapter ${n + 1} (first in ${MISSIONS[s]})`);
  }
});

/** In person: a dialogue line in the default, shouted or whispered voice, a bark, or a cutscene line on the 'scene' or 'overheard' channel. */
function speakersByMission() {
  const out = new Map();
  for (const id of MISSIONS) {
    const set = [], add = (who, how, at) => set.push({ who, how, at });
    visit(mission(id), (kind, a, at) => {
      if (kind !== 'act') return;
      if (a.k === 'dialogue' || a.k === 'eavesdrop') for (const l of a.lines) add(l.who, OFFSTAGE.has(l.voice ?? 'say') ? 'off' : 'person', `${at} ${a.id}`);
      if (a.k === 'call') for (const l of a.lines) add(l.who, 'off', `${at} ${a.id}`);
      if (a.k === 'sms') add(a.from, 'off', at);
    });
    for (const sc of cutscenesOf(mission(id))) for (const sh of sc.shots) for (const c of sh.cues ?? []) if (c.k === 'say') add(sceneCast(sc, c.who) ?? c.who, OFFSTAGE.has(c.ch ?? 'scene') ? 'off' : 'person', sc.id);
    out.set(id, set);
  }
  return out;
}
const SPEAKERS = speakersByMission();
/** Missions where someone may not speak in person (story-final.md): away, taken, dead, or not yet in the story. */
const ABSENT = {
  tu: (id) => ORD.get(id) > ORD.get('c6-m2'), // dies in the fire (CS06): afterwards only in Tín's head
  quang: (id) => ORD.get(id) >= ORD.get('c7-m1') && ORD.get(id) < ORD.get('c9-m3'), // leaves on a speedboat at dawn of mùng 9, back in c9-m3
  mai: (id) => (ORD.get(id) > ORD.get('c4-m2') && ORD.get(id) < ORD.get('c10-m2')) || (ORD.get(id) > ORD.get('c1-m1') && ORD.get(id) < ORD.get('c4-m2')), // home in the village, then taken; CS01 is the flash-forward
  su: (id) => chapterOf(id) < 11,
  phuong: (id) => chapterOf(id) < 6,
};

test('continuity: every speaker is in the cast by the chapter they speak in; nobody speaks in person while away, taken or dead', () => {
  const castChapter = new Map();
  for (const [n, m] of CH.entries()) for (const c of m.chapter.cast ?? []) if (!castChapter.has(c.id)) castChapter.set(c.id, n + 1);
  const issues = [];
  for (const [id, set] of SPEAKERS) for (const { who, how, at } of set) {
    if (['narrator', 'system', 'radio', 'tv', 'crowd'].includes(who)) continue;
    if (!castChapter.has(who)) { issues.push(`${at}: ${who} is not in the cast`); continue; }
    if (castChapter.get(who) > chapterOf(id)) issues.push(`${at}: ${who} speaks in chapter ${chapterOf(id)} but joins the cast in chapter ${castChapter.get(who)}`);
    if (how === 'person' && ABSENT[who]?.(id)) issues.push(`${at}: ${who} speaks in person in ${id}`);
  }
  // spawned cast too: an actor of the story is put on stage only by the chapter that introduces it
  for (const id of MISSIONS) for (const [a, at] of actsOf(mission(id))) if (a.k === 'spawn' && a.cast) {
    if (castChapter.get(a.cast) > chapterOf(id)) issues.push(`${at}: spawns ${a.cast} before chapter ${castChapter.get(a.cast)}`);
    if (ABSENT[a.cast]?.(id)) issues.push(`${at}: spawns ${a.cast} in ${id}`);
  }
  assert.deepEqual(issues, []);
  // Ông Tư after the fire: only in Tín's head (his rule in CS11, the last line of the campaign)
  const tuAfter = [...SPEAKERS].filter(([id]) => ORD.get(id) > ORD.get('c6-m2')).flatMap(([id, set]) => set.filter((s) => s.who === 'tu').map((s) => `${id} ${s.at}`));
  assert.ok(tuAfter.length >= 2, `Ông Tư's voice comes back after his death: ${tuAfter.join(', ')}`);
});

test('boards: one card per slot on every board and on the lotus wall; the wall\'s strings tie each chapter\'s cards to the earlier ones', () => {
  for (const b of catalog.boards.values()) {
    const slots = b.cards.filter((c) => c.slot !== undefined).map((c) => c.slot);
    assert.equal(new Set(slots).size, slots.length, `board ${b.id}: one card per slot`);
    assert.equal(new Set(b.cards.map((c) => c.id)).size, b.cards.length, `board ${b.id}: one card per id`);
    assert.deepEqual(D.lintBoard(b, new Set(catalog.evidence.keys())), [], `board ${b.id} lints`);
  }
  const wall = CH.flatMap((m, i) => (m.BOARD_CARDS ?? []).map((c) => ({ ...c, chapter: i + 1 })));
  const bySlot = new Map();
  for (const c of wall) { assert.ok(Number.isInteger(c.slot) && c.slot >= 0, `${c.id}: a slot`); bySlot.set(c.slot, [...(bySlot.get(c.slot) ?? []), `${c.id} (ch${c.chapter})`]); }
  assert.deepEqual([...bySlot].filter(([, v]) => v.length > 1).map(([s, v]) => `slot ${s}: ${v.join(', ')}`), [], 'one card per lotus slot across the campaign');
  assert.equal(new Set(wall.map((c) => c.id)).size, wall.length, 'each card is pinned once');
  for (const c of wall) assert.ok(catalog.evidence.has(c.needs ?? c.id), `${c.id} is evidence`);
  // the wall's strings join cards on the wall; each chapter's cards reach the earlier chapters' cards through them. Three
  // strings of chapters 7, 9 and 10 end on evidence chapters 3 and 5 grant but never pin (their BOARD_CARDS are not this
  // wave's files): they are listed here until those chapters pin them, and the list must shrink, never grow.
  const UNPINNED = ['ev-dau-doc-the', 'ev-sen-than-spa', 'ev-xe-den'];
  const onWall = new Set(wall.map((c) => c.id)), links = CH.flatMap((m) => m.BOARD_LINKS ?? []);
  const loose = [...new Set(links.flat().filter((x) => !onWall.has(x)))].sort();
  assert.deepEqual(loose, UNPINNED, 'string ends that are not pinned on the wall');
  for (const id of loose) assert.ok(LEDGER.src.evidence.get(id) !== undefined && chapterOf(MISSIONS[LEDGER.src.evidence.get(id)]) <= 5, `${id} is granted by chapter 5`);
  for (const id of loose) wall.push({ id, slot: -1, chapter: 0 });
  const adj = new Map(wall.map((c) => [c.id, new Set()]));
  for (const [a, b] of links) { adj.get(a)?.add(b); adj.get(b)?.add(a); }
  const reach = (from) => { const seen = new Set([from]), todo = [from]; while (todo.length) for (const x of adj.get(todo.pop()) ?? []) if (!seen.has(x)) { seen.add(x); todo.push(x); } return seen; };
  const all = reach(wall[0].id);
  assert.deepEqual(wall.filter((c) => !all.has(c.id)).map((c) => `${c.id} (ch${c.chapter})`), [], 'the lotus wall is one web of strings');
  // the two boards the story opens solve with their own strings and hypotheses (the autopilot draws them in the playthrough)
  assert.deepEqual([...catalog.boards.keys()].sort(), ['bang-ch4', 'bang-hop-sat']);
});

test('the rescued count runs 0 → 11 → 28 → 40 → 41, each rise the group led out (story-decisions.md 13)', () => {
  const writes = [];
  for (const id of MISSIONS) for (const [a, at] of actsOf(mission(id))) if (a.k === 'flag' && a.name === 'rescued') writes.push([id, a.value, at]);
  assert.ok(!MISSIONS.some((id) => actsOf(mission(id)).some(([a]) => a.k === 'inc' && a.name === 'rescued')), 'set outright, never incremented');
  const firsts = [];
  for (const [id, v] of writes) if (!firsts.some(([, x]) => x === v)) firsts.push([id, v]);
  assert.deepEqual(firsts.map(([, v]) => v), [11, 28, 40, 41]);
  assert.deepEqual(firsts.map(([id]) => id), ['c7-m3', 'c10-m3', 'c11-m1', 'c11-m3']);
  // a checkpoint setup or a skip may set the count again, but never back: in campaign order it only rises
  let high = 0;
  for (const [, v, at] of writes) { assert.ok(v >= high, `${at}: rescued ${v} after ${high}`); high = Math.max(high, v); }
  // the escort groups: the eleven of container 07, the seventeen of B2, the twelve of the truck; Su is the forty-first
  const group = (id, gid) => actsOf(mission(id)).map(([a]) => a).find((a) => a.k === 'do' && a.op === 'escort' && a.args.id === gid && a.args.spec)?.args.spec;
  const sizes = [group('c7-m2', 'sl07'), group('c10-m2', 'b2'), group('c11-m1', 'nguoi-xe-lanh')].map((g) => g?.followers?.length);
  assert.deepEqual(sizes, [11, 17, 12]);
  assert.deepEqual([sizes[0], 11 + sizes[1], 28 + sizes[2], 40 + 1], [11, 28, 40, 41]);
  // the HUD counter reads the flag where the count rises in play; the forty-first is announced on the roof
  for (const id of ['c7-m3', 'c10-m3', 'c11-m1']) assert.ok(mission(id).steps.some((s) => (s.meters ?? []).some((x) => x.flag === 'rescued' && x.kind === 'count')), `${id} shows ĐÃ CỨU`);
  assert.ok(actsOf(mission('c11-m3')).some(([a]) => a.k === 'toast' && /41/.test(tx(a.text))), 'c11-m3 announces ĐÃ CỨU: 41');
});

/** Playtime per chapter: the index minutes, the step minutes of the scripts, and the cutscene seconds. */
function playtime() {
  return C.CAMPAIGN.chapters.map((c) => {
    const planned = c.missions.reduce((t, m) => t + m.minutes, 0);
    const steps = c.missions.reduce((t, m) => t + mission(m.id).steps.reduce((u, s) => u + (s.minutes ?? 0), 0), 0);
    const scenes = SCENES.filter((s) => chapterOf(s.mission) === c.n);
    return { n: c.n, planned, steps: Math.round(steps * 10) / 10, scenes: scenes.length, sceneMin: Math.round(scenes.reduce((t, s) => t + s.seconds, 0) / 6) / 10, missions: c.missions.map((m) => [m.id, m.minutes, Math.round(mission(m.id).steps.reduce((u, s) => u + (s.minutes ?? 0), 0) * 10) / 10]) };
  });
}

test('playtime: 235 planned minutes; the step minutes of every chapter within 25 % of its plan, every mission within 50 %', (t) => {
  const rows = playtime();
  const total = rows.reduce((s, r) => s + r.planned, 0), steps = rows.reduce((s, r) => s + r.steps, 0), sceneMin = rows.reduce((s, r) => s + r.sceneMin, 0);
  assert.equal(total, 235);
  assert.ok(Math.abs(steps - 235) <= 235 * 0.1, `step minutes ${steps} vs 235`);
  for (const r of rows) {
    assert.ok(Math.abs(r.steps - r.planned) <= r.planned * 0.25, `chapter ${r.n}: ${r.steps} step minutes vs ${r.planned}`);
    for (const [id, plan, got] of r.missions) {
      assert.ok(mission(id).steps.every((s) => s.minutes !== undefined), `${id}: every step has its minutes`);
      assert.ok(Math.abs(got - plan) <= plan * 0.5, `${id}: ${got} vs ${plan}`);
    }
  }
  t.diagnostic(`playtime (planned / step minutes / cutscenes, minutes of cutscene): ${rows.map((r) => `ch${r.n} ${r.planned}/${r.steps}/${r.scenes}, ${r.sceneMin}`).join('; ')}; total ${total}/${Math.round(steps * 10) / 10}, cutscenes ${Math.round(sceneMin * 10) / 10} min`);
});

// ---- the campaign on the mock host ---------------------------------------------------------------------------------

const disk = memoryStorage();
/** The progress saved at the end of each chapter (after the save/load round trip), and the per-mission records. */
const boundary = new Map(), records = [], firstSaves = [], allPresence = [], allScene = [], allWorlds = [];
let finalProgress = null;

test('main path: c1-m1 → c11-m4 in order from a new game, saved and loaded through story/save.ts between chapters', () => {
  const store0 = SAVE.createSaveStore(disk, { known: KNOWN, index: C.CAMPAIGN, throttleMs: 0 });
  assert.equal(store0.read().slots[0], null, 'a new game');
  const chapters = [];
  for (const ch of C.CAMPAIGN.chapters) {
    const store = SAVE.createSaveStore(disk, { known: KNOWN, index: C.CAMPAIGN, throttleMs: 0 });
    store.read();
    const slot = store.slot(0);
    // the chapter's first checkpoint is also saved (a save file of its own) for the mid-mission resume test
    let firstCheckpoint = true;
    const { r, w } = setup({
      ...MAIN,
      onCheckpoint: (e, run) => {
        if (!firstCheckpoint) return;
        firstCheckpoint = false;
        const mid = SAVE.createSaveStore(memoryStorage(), { known: KNOWN, index: C.CAMPAIGN, throttleMs: 0 });
        mid.write(0, run.snapshot(), { force: true });
        firstSaves.push({ chapter: ch.n, mission: run.state().mission, step: e.step, text: SAVE.encode(mid.file()) });
      },
    });
    if (slot) {
      assert.equal(slot.checkpoint, null, `chapter ${ch.n} opens from a hub save`);
      assert.equal(r.resume(SAVE.toStorySave(slot)), false, 'a hub save loads the progress and starts nothing');
      assert.equal(slot.label, `Chương ${ch.n - 1} · Tự do`);
    }
    const rec = playMissions(r, w, ch.missions.map((m) => m.id));
    records.push(...rec);
    for (const x of rec) assert.deepEqual(x.fails, [], `${x.id}: no fail on the main path`);
    for (const x of rec) assert.equal(x.done.result.nonLethal, true, `${x.id}: nobody dies on the main path`);
    assert.deepEqual(w.missing, [], `chapter ${ch.n}: every actor, vehicle and place a step uses exists`);
    assert.deepEqual(r.state().issues, [], `chapter ${ch.n}: runner issues`);
    chapters.push(...outs(w, 'chapter').map((e) => e.n));
    allPresence.push(...w.presence); allScene.push(...w.sceneLines); allWorlds.push(w);
    // save at the end of the chapter (a hub save), through the store's JSON, and read it back with a fresh store
    const snap = r.snapshot();
    assert.equal(snap.checkpoint, null);
    assert.equal(store.write(0, snap, { force: true }), 'saved');
    const back = SAVE.createSaveStore(disk, { known: KNOWN, index: C.CAMPAIGN }).read().slots[0];
    assert.deepEqual(back.progress, snap.progress, `chapter ${ch.n}: the save keeps the whole progress (no unknown evidence or mission dropped)`);
    assert.equal(back.chapter, ch.n);
    boundary.set(ch.n, F.cloneProgress(back.progress));
  }
  assert.deepEqual(chapters, N, 'every chapter card shows once, in order');
  const p = boundary.get(11);
  finalProgress = p;
  assert.deepEqual(p.completed, MISSIONS);
  assert.equal(p.chapter, 11);
  assert.deepEqual(p.lunar, { month: 9, day: 6 }, 'three weeks after Rằm');
  // time only runs forward: the lunar date never goes back from one mission to the next
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1].after.lunar, b = records[i].after.lunar;
    assert.ok(b.month > a.month || (b.month === a.month && b.day >= a.day), `${records[i].id}: lunar ${b.month}/${b.day} after ${a.month}/${a.day}`);
  }
  // the rescued count on the real path
  const rises = records.filter((x, i) => (x.after.flags.rescued ?? 0) !== (records[i - 1]?.after.flags.rescued ?? 0)).map((x) => [x.id, x.after.flags.rescued]);
  assert.deepEqual(rises, [['c7-m3', 11], ['c10-m3', 28], ['c11-m1', 40], ['c11-m3', 41]]);
  // the zero-kill campaign: clean, the badge, the title, chapter select, the legendary jacket
  assert.equal(p.conscience.kills, 0);
  assert.equal(F.conscienceTier(p.conscience), 'clean');
  for (const f of ['campaignDone', 'luatOngTu', 'giaoTanTay', 'debtVoid', 'titleShipperBongDem', 'truckRescue', 'lucArrested', 'tuDied', 'foundMai', 'maiSafe']) assert.equal(p.flags[f], true, f);
  for (const a of ['luatOngTu', 'chapterSelect']) assert.ok(p.abilities.includes(a), a);
  assert.ok(p.outfits.includes('tin-huyen-thoai') && p.outfits.includes('tin-ao-tu'));
  // every numbered cutscene of story-final.md played
  for (const id of Object.keys(S.CUTSCENE_SITES)) assert.ok(p.seen.includes(id), `${id} played`);
  const unseen = SCENES.filter((s) => !p.seen.includes(s.id)).map((s) => s.id);
  // the few scenes that are not on the main path belong to branches (each chapter test plays them)
  assert.ok(unseen.length <= 12, `scenes off the main path: ${unseen.join(', ')}`);
  // the chained missions really chain on the main path: one night, one start
  for (const x of records) if (mission(x.id).chain) assert.equal(records[records.indexOf(x) + 1]?.id, mission(x.id).chain);
});

test('continuity on the main path: speakers are on stage when they speak in person; outfits carry over between missions', (t) => {
  // a line in person needs its speaker spawned or staged by the scene that just played (offstage voices need nobody)
  const away = allPresence.filter((l) => !l.present);
  const byWho = new Map();
  for (const l of away) byWho.set(l.who, [...(byWho.get(l.who) ?? []), `${l.mission}/${l.step} ${l.id}`]);
  t.diagnostic(`in-person lines whose speaker is neither spawned nor in the scene before: ${away.length} of ${allPresence.length} (${[...byWho].map(([w, at]) => `${w}: ${at.join(', ')}`).join('; ')})`);
  // chapter 5's hotel receptionist answers the phone desk unseen (c5-m1 is not this wave's file): the only exception
  assert.deepEqual(away.filter((l) => !(l.mission === 'c5-m1' && l.who === 'tiep-tan-ks')).map((l) => `${l.mission}/${l.step} ${l.id}: ${l.who}`), [], 'every in-person line has its speaker on stage');
  assert.ok(allPresence.length > 400, `the main path speaks (${allPresence.length} lines)`);
  // the story's absent and dead never speak in person on the main path either
  for (const l of allPresence) if (l.voice !== 'phone' && !OFFSTAGE.has(l.voice) && ABSENT[l.who]?.(l.mission)) assert.fail(`${l.mission}/${l.step}: ${l.who} speaks in person`);
  for (const l of allScene) if (!OFFSTAGE.has(l.ch) && ABSENT[l.who]?.(l.mission)) assert.fail(`${l.scene}: ${l.who} speaks in person`);
  // outfits: after Ông Tư hangs his whistle on Tín (c6-m2) every mission starts in an outfit with it, in the outfit the last
  // mission ended in, or in a cover the mission itself uses (the orange windbreaker for an order, the waiter's vest…)
  const WHISTLE = new Set(['tin-whistle', 'tin-ao-tu', 'tin-huyen-thoai']);
  const COVER_OF = { 'tin-shipper': (m) => actsOf(m).some(([a]) => (a.k === 'do' && a.op === 'appOrder') || (a.k === 'player' && /^order-/.test(a.carry ?? '')) || (a.k === 'player' && a.cover === 'shipper')), 'tin-waiter': () => true, 'tin-ao-mua': () => true, 'tin-khuan-vac': () => true };
  const rows = [], odd = [];
  for (let i = 0; i < records.length; i++) {
    const x = records[i], prev = records[i - 1];
    rows.push(`${x.id}:${x.startOutfit ?? '-'}→${x.endOutfit ?? '-'}`);
    if (ORD.get(x.id) <= ORD.get('c6-m2') || !x.startOutfit) continue;
    if (!(WHISTLE.has(x.startOutfit) || x.startOutfit === prev.endOutfit || COVER_OF[x.startOutfit]?.(mission(x.id)))) odd.push(`${x.id} starts in ${x.startOutfit} after ${prev.id} ended in ${prev.endOutfit}`);
  }
  t.diagnostic(`outfits by mission (start→end): ${rows.join(' ')}`);
  assert.deepEqual(odd, [], 'outfits carry over');
});

/** The progress each chapter test starts from (its endOfChapterN function), evaluated from the test's own source. */
function assumedStart(file, n) {
  const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(new RegExp(`^function endOfChapter${n}\\(([^)]*)\\) \\{\\n([\\s\\S]*?)\\n\\}$`, 'm'));
  assert.ok(m, `${file}: endOfChapter${n}`);
  return new Function('F', 'C', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', `return (function (${m[1]}) {\n${m[2]}\n})();`)(F, C, ch1, ch2, ch3, ch4, ch5);
}

test('hand-offs: what each chapter test assumes at its start is what the real campaign holds at the end of the chapter before', (t) => {
  const FILES = { 5: 'story-ch05.test.mjs', 6: 'story-ch06.test.mjs', 7: 'story-ch07.test.mjs', 8: 'story-ch08.test.mjs', 9: 'story-ch09.test.mjs', 10: 'story-ch10.test.mjs', 11: 'story-ch11.test.mjs' };
  const report = [];
  for (const [nStr, file] of Object.entries(FILES)) {
    const n = Number(nStr), want = assumedStart(file, n - 1), real = boundary.get(n - 1);
    assert.ok(real, `the campaign reached the end of chapter ${n - 1}`);
    // what chapter n reads: evidence and items its conditions, boards, questions and interrogations use; flags it reads
    const reads = { evidence: new Set(), items: new Set(), flags: new Set(), abilities: new Set() };
    for (const [kind, list] of [['evidence', LEDGER.use.evidence], ['items', LEDGER.use.items], ['flags', LEDGER.use.flags]]) for (const [id, ord] of list) if (chapterOf(MISSIONS[ord]) === n) reads[kind].add(id);
    for (const m of MODULES[n - 1].missions) for (const [c] of condsOf(m)) if (c.k === 'ability') reads.abilities.add(c.id);
    const missing = [];
    assert.deepEqual(want.completed.filter((id) => !real.completed.includes(id)), [], `chapter ${n}: every earlier mission is done`);
    for (const e of want.evidence) if (reads.evidence.has(e) && !real.evidence.includes(e)) missing.push(`evidence ${e}`);
    for (const a of want.abilities) if (reads.abilities.has(a) && !real.abilities.includes(a)) missing.push(`ability ${a}`);
    for (const [k, v] of Object.entries(want.items)) if (reads.items.has(k) && (real.items[k] ?? 0) < v) missing.push(`item ${k}`);
    // a flag chapter n reads with a value its test assumes, which no earlier chapter ever gives it
    for (const [k, v] of Object.entries(want.flags)) if (reads.flags.has(k) && real.flags[k] === undefined && !(LEDGER.src.flags.get(k) < ORD.get(`c${n}-m1`))) missing.push(`flag ${k}=${v}`);
    assert.deepEqual(missing, [], `chapter ${n} reads what its test assumes but the campaign does not give`);
    // differences that only pick another branch (the chapter's own tests play both) are reported
    const diff = Object.entries(want.flags).filter(([k, v]) => reads.flags.has(k) && real.flags[k] !== v).map(([k, v]) => `${k}: test ${v}, campaign ${real.flags[k]}`);
    const lunar = `${real.lunar.month}/${real.lunar.day} vs ${want.lunar.month}/${want.lunar.day}`;
    report.push(`ch${n - 1}→ch${n}: lunar ${lunar}, cash ${real.cash} vs ${want.cash}, knockouts ${real.conscience.knockouts} vs ${want.conscience.knockouts}${diff.length ? `, branches: ${diff.join('; ')}` : ''}`);
    // the date the chapter starts on never lies before the date the last one ended on
    const meta = C.CAMPAIGN.chapters.find((c) => c.n === n);
    const startDay = mission(meta.missions[0].id).start?.lunar ?? meta.lunar.day;
    assert.ok(meta.lunar.month > real.lunar.month || (meta.lunar.month === real.lunar.month && startDay >= real.lunar.day), `chapter ${n} starts on ${meta.lunar.month}/${startDay}, after ${real.lunar.month}/${real.lunar.day}`);
  }
  t.diagnostic(report.join(' | '));
  // the chapters' own upstream declarations agree with the campaign (chapter 9's UPSTREAM_FLAGS)
  for (const [flag, note] of Object.entries(ch9.UPSTREAM_FLAGS ?? {})) assert.ok(LEDGER.src.flags.get(flag) !== undefined && LEDGER.src.flags.get(flag) < ORD.get('c9-m1'), `chapter 9 reads ${flag} (${note}) from an earlier chapter`);
});

test('a save taken inside each chapter\'s first mission loads into a fresh runner and finishes the mission', () => {
  assert.equal(firstSaves.length, N.length, 'one save per chapter');
  for (const fs of firstSaves) {
    const file = SAVE.decode(fs.text, KNOWN);
    assert.equal(file.status, 'ok');
    const slot = file.file.slots[0];
    assert.equal(slot.checkpoint.mission, fs.mission);
    const { r, w } = setup(MAIN);
    assert.equal(r.resume(SAVE.toStorySave(slot)), true, `${fs.mission}/${fs.step} resumes`);
    autopilot(r, w, MAIN);
    assert.equal(outs(w, 'complete').at(-1).id, fs.mission);
    assert.deepEqual(w.missing, [], `${fs.mission}: the restore rebuilds what the steps use`);
    assert.deepEqual(r.state().issues, []);
    const real = records.find((x) => x.id === fs.mission).after;
    assert.deepEqual([...r.progress().evidence].sort(), [...real.evidence].sort(), `${fs.mission}: same evidence as the uninterrupted run`);
    assert.deepEqual(r.progress().flags, real.flags, `${fs.mission}: same flags as the uninterrupted run`);
  }
});

// ---- LƯƠNG TÂM: the record reaches the mentors' last lines ------------------------------------------------------

test('LƯƠNG TÂM, clean: Ông Tư\'s rule in CS06, Vân after the stairs and after B2, Cô Ba and Vân in the epilogue, Ông Tư\'s last line, the badge', () => {
  const said = (key) => allScene.some((l) => l.key === key);
  assert.ok(said('cs06.tu6a') && !said('cs06.tu6b'), 'CS06: Ông Tư\'s line for a clean record');
  assert.ok(said('c11m4.cs.h5') && !said('c11m4.cs.h5b'), 'Ông Tư\'s last line, clean');
  const w8 = allWorlds[7], w10 = allWorlds[9], w11 = allWorlds[10];
  assert.ok(lines(w8, 'c8m1-xe').includes(tx('@c8m1.v4.sach')), 'Vân after the clean stairs');
  assert.ok(lines(w10, 'c10m3-van-cuoi').includes(tx('@c10m3.van.sach')), 'Vân after B2');
  assert.deepEqual(lines(w11, 'c11m4-co-ba').slice(0, 2), [tx('@c11m4.coba1'), tx('@c11m4.coba.sach')]);
  assert.equal(lines(w11, 'c11m4-truong')[1], tx('@c11m4.van.sach'));
  assert.ok(finalProgress.abilities.includes('luatOngTu') && finalProgress.flags.luatOngTu, 'the zero-kill badge');
  assert.ok(outs(w11, 'unlock').some((e) => e.ability === 'luatOngTu'), 'the badge is announced');
});

test('LƯƠNG TÂM, stained: a death on the c8-m1 stairs is booked, Vân answers it, B2 and the epilogue remember it, no badge', () => {
  const { r, w } = setup({ ...MAIN, progress: boundary.get(7) });
  playMissions(r, w, ['c8-m1'], { ...MAIN, hold: { ...MAIN.hold, 'c8-m1/tang-5': ({ visit, push }) => { if (visit === 1) push({ type: 'kill', id: 'sat-thu-2', tag: 'guard', cause: 'bullet' }); return false; } } });
  assert.equal(r.progress().conscience.kills, 1);
  assert.ok(lines(w, 'c8m1-xe').includes(tx('@c8m1.v4.chet')), 'Vân answers the death on the stairs');
  playMissions(r, w, MISSIONS.slice(ORD.get('c8-m2')));
  const p = r.progress();
  assert.equal(F.conscienceTier(p.conscience), 'stained');
  assert.ok(lines(w, 'c10m3-van-cuoi').includes(tx('@c10m3.van.vet')), 'Vân after B2, for a stained record');
  assert.deepEqual(lines(w, 'c11m4-co-ba').slice(0, 2), [tx('@c11m4.coba1'), tx('@c11m4.coba.vet')]);
  assert.equal(lines(w, 'c11m4-truong')[1], tx('@c11m4.van.giet'));
  assert.ok(w.sceneLines.some((l) => l.key === 'c11m4.cs.h5b') && !w.sceneLines.some((l) => l.key === 'c11m4.cs.h5'), 'Ông Tư\'s other last line');
  assert.ok(!p.flags.luatOngTu && !p.abilities.includes('luatOngTu'), 'no badge');
  assert.ok(p.flags.campaignDone && p.abilities.includes('chapterSelect'), 'the campaign still ends');
  assert.deepEqual(w.missing, []);
});

test('LƯƠNG TÂM, lost and before the fire: a heavy record reaches Cô Ba\'s other line; a hurt bystander before c6-m2 changes Ông Tư\'s', () => {
  const heavy = F.cloneProgress(boundary.get(10));
  Object.assign(heavy.conscience, { kills: 2, civiliansHurt: 3, byCause: { ...heavy.conscience.byCause, bullet: 2 } });
  const a = setup({ ...MAIN, progress: heavy });
  playMissions(a.r, a.w, MISSIONS.slice(ORD.get('c11-m1')));
  assert.equal(F.conscienceTier(a.r.progress().conscience), 'lost');
  assert.deepEqual(lines(a.w, 'c11m4-co-ba').slice(0, 2), [tx('@c11m4.coba1'), tx('@c11m4.coba.nang')]);
  assert.ok(!a.r.progress().flags.luatOngTu);
  const hurt = F.cloneProgress(boundary.get(5));
  hurt.conscience.civiliansHurt = 1;
  const b = setup({ ...MAIN, progress: hurt });
  playMissions(b.r, b.w, ['c6-m1', 'c6-m2']);
  assert.ok(b.w.sceneLines.some((l) => l.key === 'cs06.tu6b') && !b.w.sceneLines.some((l) => l.key === 'cs06.tu6a'), 'CS06: Ông Tư\'s line for a record that is not clean');
});

test('LƯƠNG TÂM, no kill but an innocent hurt: one rule (the tier) for every mentor; no badge, Vân and Ông Tư name the hurt, Cô Ba the weight', () => {
  // the record a player reaches by knocking out a real orderly (c8-m2) or clipping a lantern walker (c11-m1): kills 0, not clean
  for (const hurt of [1, 4]) {
    const rec = F.cloneProgress(boundary.get(10));
    Object.assign(rec.conscience, { kills: 0, civiliansHurt: hurt });
    const { r, w } = setup({ ...MAIN, progress: rec });
    playMissions(r, w, MISSIONS.slice(ORD.get('c11-m1')));
    const p = r.progress();
    assert.equal(p.conscience.kills, 0);
    const tier = F.conscienceTier(p.conscience);
    assert.equal(tier, hurt === 1 ? 'stained' : 'lost');
    assert.deepEqual(lines(w, 'c11m4-co-ba').slice(0, 2), [tx('@c11m4.coba1'), tx(hurt === 1 ? '@c11m4.coba.vet' : '@c11m4.coba.nang')]);
    assert.equal(lines(w, 'c11m4-truong')[1], tx('@c11m4.van.dau'), 'Vân does not say "Không một mạng người… ổng cười"');
    const keys = new Set(w.sceneLines.map((l) => l.key));
    assert.ok(keys.has('c11m4.cs.h4c') && keys.has('c11m4.cs.h5c'), 'Tín and Ông Tư: no kill, but an innocent hurt');
    for (const k of ['c11m4.cs.h4', 'c11m4.cs.h5', 'c11m4.cs.h4b', 'c11m4.cs.h5b']) assert.ok(!keys.has(k), `not ${k}`);
    assert.ok(!p.flags.luatOngTu && !p.abilities.includes('luatOngTu'), 'the badge is for a clean record only');
    assert.ok(!w.log.some((l) => l.k === 'title' && l.a.text === tx('@c11m4.badge')));
    assert.ok(p.flags.campaignDone);
    assert.deepEqual(w.missing, []);
  }
});

test('the rescued count in the epilogue: 41 in all, 30 on Rằm night (story-decisions.md 13); no line puts 41 on Rằm night', () => {
  const finale = allWorlds[10];
  const credits = finale.log.find((l) => l.k === 'do' && l.a.op === 'credits').a.args.lines.map((k) => tx(k));
  const spoken = finale.sceneLines.filter((l) => l.mission === 'c11-m4').map((l) => tx(`@${l.key}`));
  const shown = SCENES.filter((sc) => sc.mission === 'c11-m4').flatMap((sc) => sc.shots.flatMap((sh) => (sh.cues ?? []).flatMap((c) => [...(c.lines ?? []), ...(c.text ? [c.text] : [])]))).map((k) => tx(k));
  for (const t of [...credits, ...spoken, ...shown]) {
    const ram = /Rằm|RẰM/.test(t);
    assert.ok(!(ram && /\b41\b|bốn mươi mốt|BỐN MƯƠI MỐT/i.test(t) && !/\b30\b|ba mươi/i.test(t)), `"${t}" puts all 41 on Rằm night`);
  }
  assert.equal(tx('@c11m4.cr.cuu'), 'Đã cứu: 41 người · Riêng đêm Rằm: 30.');
  assert.match(tx('@c11m4.cs.n1'), /Bốn mươi mốt.*ba mươi người trong đêm Rằm/);
  // 41 − 11 (the barge, mùng 10) = 30 on Rằm night
  const ch7 = boundary.get(7).flags.rescued, total = boundary.get(11).flags.rescued;
  assert.deepEqual([ch7, total, total - ch7], [11, 41, 30]);
});

test('c11-m1: the leap and the cab fight are staged on the truck where the player drew level with it, not at its start; the lion dance closes the junction behind it', () => {
  const at = { x: 218.6, z: -80 };
  const hold = { ...MAIN.hold, 'c11-m1/duoi': ({ w, t }) => {
    const v = w.vehicles.get('xe-lanh');
    // the convoy carries the truck north through NGÃ TƯ NGUYỄN HUỆ (past the junction first), then on to z -80
    if (v) Object.assign(v, t < 0.25 ? resolve('ch11.qua-lan') : at);
    if (t > 0.3) { Object.assign(w.player, { x: at.x - 1.6, z: at.z + 0.5, mode: 'bike' }); return false; }
    return true;
  } };
  const { r, w } = setup({ ...MAIN, progress: boundary.get(10) });
  playMissions(r, w, ['c11-m1'], { ...MAIN, hold });
  for (const scene of ['c11m1-nhay', 'c11m1-ca-bin']) {
    const fr = w.frames.filter((x) => x.scene === scene);
    assert.ok(fr.length > 0, `${scene} frames the truck`);
    for (const x of fr) assert.ok(Math.hypot(x.x - x.px, x.z - x.pz) < 5, `${scene}: the truck at (${x.x}, ${x.z}), the player at (${x.px}, ${x.pz})`);
  }
  assert.ok(!w.vehicles.has('xe-lanh'), 'the convoy truck is gone once the railing scene takes over (the hanging-truck prop)');
  // the troupe is not on the convoy's road at the start (a 'block' is in env.clear: the truck would stall at it) …
  const fest = w.log.filter((l) => l.mission === 'c11-m1' && l.k === 'do' && l.a.op === 'festival');
  assert.ok(fest.some((l) => l.step === 'duoi' && (l.a.args.troupes ?? []).length === 0), 'the convoy sets off with the junction open');
  // … it closes the junction once the truck is through: the step watcher, on the truck past the junction
  const watcher = mission('c11-m1').steps.find((s) => s.id === 'duoi').watchers.find((x) => x.do.some((a) => a.k === 'do' && a.op === 'festival'));
  assert.deepEqual([watcher.when.k, watcher.when.id], ['vehicle', 'xe-lanh']);
  const past = resolve(watcher.when.at), junction = resolve('nga-tu-216-54');
  assert.ok(past.z < junction.z - 6, 'the truck is past the junction (northbound, z falls) when the troupe moves in');
  const tr = watcher.do.find((a) => a.k === 'do' && a.op === 'festival').args.troupes[0];
  assert.deepEqual([tr.at, tr.program, tr.gap], ['nga-tu-216-54', 'block', 2.2]);
  assert.ok(fest.some((l) => (l.a.args.troupes ?? []).length === 1), 'the block is placed in play');
  // the skip after three lost chases plays the same leap on a stopped truck at a fixed point short of the T, the Dream alongside
  const nhay = mission('c11-m1').steps.find((s) => s.id === 'nhay');
  assert.ok(nhay.checkpoint.setup.some((a) => a.k === 'vehicle' && a.id === 'xe-lanh' && a.at === 'ch11.nhay' && a.state === 'stop' && a.scope === 'step'));
  assert.ok(Math.hypot(resolve('ch11.nhay').x - resolve('ch11.nhay-ben').x, resolve('ch11.nhay').z - resolve('ch11.nhay-ben').z) < 3, 'the Dream alongside');
  assert.deepEqual(w.missing, []);
});
