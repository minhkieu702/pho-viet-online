import type {
  Act, Behaviour, BoardDef, CampaignIndex, Catalog, ChapterModule, Cond, CoreAct, EngineAct, ExecAct, ExecCtx, FailDef, Flag, InteractSpec, InterrogationDef,
  Line, MarkerSpec, MissionDef, MissionStats, Progress, QuestionDef, Scope, StepDef, StoryEvent, StoryPort, StoryView, SubDef,
  TextRef, WorldCond, WorldPolicy,
} from './types.ts';
import {
  addOnce, availability, chapterUnlocked, cloneProgress, compare, emptyStats, formatDong, gradeMission, lunarLabel, markChapterStart, mergeMedal, mergeReplay,
  missionOrder, newProgress, recordHarm, replaySandbox, statOf, testProgress,
} from './flags.ts';
import * as D from './deduction.ts';
import * as I from './interrogation.ts';
import { METER_PREFIXES, type ContractKind, type EngineContract } from './contract.ts';

/**
 * The story runner (pure, deterministic): executes missions against an injected StoryPort. Time only moves
 * through tick(dt); engine events (runner.event) and completions of blocking actions (runner.resolve) are
 * queued and applied at the start of the next tick or right after the exec call that produced them, so the
 * same inputs always give the same state. Randomness ('oneOf') comes from a seeded RNG saved with checkpoints.
 *
 * Step lifecycle: enter (checkpoint snapshot, then setup + enter acts, blocking ones wait) → run (watchers,
 * fail rules, branches, subs, optional objectives, done) → exit acts → next step or mission complete.
 * A hard fail shows the fail card; retry() restores the last checkpoint (the engine despawns mission things,
 * the runner rolls its state and the progress back, then re-runs mission setup + the checkpoint's setup and
 * enter); skipSection() jumps past the failing section once allowSkipAfter fails are reached (grade capped
 * at C). Soft fails replay the step without a card. Blocking UI sessions (deduction board, question,
 * interrogation) live here and are driven by runner.ui; the story UI only draws their views.
 */

// ---- Catalog and text --------------------------------------------------------------------------------

export function buildCatalog(source: CampaignIndex, modules: ChapterModule[] = []): Catalog {
  // own copy of the mission metadata so chapter files can patch hours, givers and prerequisites
  const index: CampaignIndex = { ...source, chapters: source.chapters.map((c) => ({ ...c, missions: c.missions.map((m) => ({ ...m })) })) };
  const cat: Catalog = {
    index, missions: new Map(), meta: new Map(), evidence: new Map(), journal: new Map(), cast: new Map(), places: new Map(),
    boards: new Map(), questions: new Map(), interrogations: new Map(), text: new Map(),
  };
  for (const m of missionOrder(index)) cat.meta.set(m.id, m);
  for (const [k, v] of Object.entries(index.text ?? {})) cat.text.set(k, v);
  for (const mod of modules) addModule(cat, mod);
  return cat;
}
/** Adds a lazily loaded chapter to a catalog (first definition of an id wins; lintContent reports duplicates). */
export function addModule(cat: Catalog, mod: ChapterModule) {
  const put = <T extends { id: string }>(map: Map<string, T>, list: T[] | undefined) => { for (const x of list ?? []) if (!map.has(x.id)) map.set(x.id, x); };
  put(cat.missions, mod.missions); put(cat.evidence, mod.evidence);
  for (const m of mod.missions) {
    if (!m.meta || cat.missions.get(m.id) !== m) continue;
    for (const c of cat.index.chapters) for (const x of c.missions) if (x.id === m.id) Object.assign(x, m.meta);
    const meta = cat.meta.get(m.id);
    if (meta) Object.assign(meta, m.meta);
  } put(cat.journal, mod.journal); put(cat.cast, mod.cast);
  put(cat.boards, mod.boards); put(cat.questions, mod.questions); put(cat.interrogations, mod.interrogations);
  for (const [k, v] of Object.entries(mod.places ?? {})) if (!cat.places.has(k)) cat.places.set(k, v);
  for (const [k, v] of Object.entries(mod.text ?? {})) if (!cat.text.has(k)) cat.text.set(k, v);
}

const PLACEHOLDER = /\{(@?[\w.:-]+?)(?::(dong))?\}/g;
/** Resolves a TextRef: '@key' from the text tables, then `{name}`, `{name:dong}` and `{@key}` placeholders. */
export function makeText(cat: Catalog, lookup: (name: string) => Flag | undefined) {
  return (ref: TextRef | undefined): string => {
    if (!ref) return '';
    const raw = ref.startsWith('@') ? cat.text.get(ref.slice(1)) ?? ref : ref;
    return raw.replace(PLACEHOLDER, (_m, name: string, fmt?: string) => {
      const v = name.startsWith('@') ? cat.text.get(name.slice(1)) : lookup(name);
      if (fmt === 'dong') return formatDong(Number(v ?? 0) || 0);
      return v === undefined || v === false ? '' : String(v);
    });
  };
}

// ---- Runner ------------------------------------------------------------------------------------------

type Phase = 'enter' | 'run' | 'exit' | 'failed' | 'done';
type ChoiceAct = Extract<CoreAct, { k: 'choice' }>;
type Wait = { k: 'time'; left: number } | { k: 'cond'; c: Cond; left: number } | { k: 'handle'; h: number; act: Act; left: number } | { k: 'session' };
type Queue = { acts: Act[]; i: number; wait: Wait | null; alive: boolean; scope: 'step' | 'mission' };
type LiveMarker = MarkerSpec & { id: string; scope: Scope };
type LiveInteract = InteractSpec & { scope: Scope };
type LiveTimer = { id: string; left: number; label?: TextRef; fail?: TextRef; scope: Scope };
/** Runner-owned presentation and world-environment state (saved with checkpoints). */
export type Live = {
  objective: TextRef | null; subs: SubDef[] | null; markers: LiveMarker[]; interacts: LiveInteract[]; timers: LiveTimer[];
  env: { policy: WorldPolicy; hour?: number; weather?: { set: string; lock?: boolean }; space?: string | null };
};
/** What a save slot keeps of a running mission (the progress at that checkpoint is stored beside it). */
export type CheckpointSave = {
  v: 1; mission: string; step: string; start: boolean; vars: Record<string, Flag>; stats: MissionStats;
  history: StoryEvent[]; fired: Record<string, number>; live: Live; rng: number; mt: number;
};
type Checkpoint = CheckpointSave & { progress: Progress };
export type StorySave = { progress: Progress; checkpoint: CheckpointSave | null };
type Session = {
  kind: 'board' | 'deduce' | 'interrogate'; id: string; q: Queue; until?: 'solved' | 'closed';
  board?: BoardDef; question?: QuestionDef; inter?: InterrogationDef; state?: I.InterrogationState;
};
type Run = {
  def: MissionDef; id: string; chapter: number; ix: number; step: StepDef; phase: Phase;
  /** Seconds since the step started running; mission seconds (kept across retries). */
  t: number; mt: number; wasRun: boolean;
  vars: Record<string, Flag>; latched: StoryEvent[]; history: StoryEvent[]; fired: Record<string, number>;
  subsDone: string[]; failCounts: Record<string, number>; stats: MissionStats; live: Live;
  checkpoint: Checkpoint; origin: Checkpoint; stepSnap: Checkpoint; restoring: boolean;
  main: Queue; bg: Queue[]; forced: FailDef | null;
  failure: { reason: string; def: FailDef; canSkip: boolean } | null;
  replay: { main: Progress } | null; rng: number;
};

export const DOWN_REASONS = { wasted: 'Tín đã gục.', busted: 'Tín bị bắt.' } as const;
export const LETHAL_REASON = 'Đã có người chết. Tín không giết ai.';
const NEVER: Cond = { k: 'never' };
/** Presentation acts that pause timers while the main queue waits on them. */
const CINEMATIC = new Set(['cutscene', 'dialogue', 'call', 'title', 'fade', 'choice']);
/**
 * Perception and helper events dropped while a cutscene holds the world (view().cinematic): the engine suspends
 * guards, tails and chasers under a cutscene, so one that still arrives cannot fail the step behind it.
 */
export const CINE_MUTED: ReadonlySet<string> = new Set(['suspicious', 'detected', 'alarm', 'bodyFound', 'coverBlown', 'spotted', 'lost', 'caught', 'noise']);
const CORE = new Set<string>([
  'wait', 'waitFor', 'goto', 'complete', 'fail', 'if', 'parallel', 'oneOf', 'save', 'flag', 'inc', 'var', 'evidence', 'journal', 'give', 'take',
  'unlock', 'cash', 'score', 'hintToken', 'payDebt', 'lunar', 'objective', 'marker', 'unmark', 'interactable', 'uninteract', 'timer', 'stopTimer',
  'board', 'deduce', 'interrogate', 'choice',
]);
export const isCoreAct = (a: Act): a is CoreAct => CORE.has(a.k);
/** Engine acts that block the queue until the engine resolves them. */
export function isBlocking(a: Act): boolean {
  switch (a.k) {
    case 'cutscene': case 'call': case 'title': case 'fade': case 'teleport': case 'wait': case 'waitFor': case 'choice':
    case 'board': case 'deduce': case 'interrogate': return true;
    case 'dialogue': return a.mode !== 'ambient';
    case 'space': return !!(a.enter || a.leave);
    case 'do': return !!a.wait;
    default: return false;
  }
}
const hashStr = (s: string, seed: number) => {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
};
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const upsert = <T extends { id: string }>(list: T[], x: T) => { const i = list.findIndex((y) => y.id === x.id); if (i >= 0) list[i] = x; else list.push(x); };

export type RunnerOptions = { catalog: Catalog; port: StoryPort; progress?: Progress; seed?: number; historyCap?: number };
export type Runner = ReturnType<typeof createRunner>;

export function createRunner(opts: RunnerOptions) {
  const cat = opts.catalog, port = opts.port, seed = opts.seed ?? 1, cap = opts.historyCap ?? 400;
  let p: Progress = opts.progress ?? newProgress();
  let run: Run | null = null;
  let session: Session | null = null;
  let handle = 0, tickNo = 0, rev = 0, lastSig = '', lastObjective = '';
  const pending = new Map<number, Queue>();
  const inbox: ({ e: StoryEvent } | { h: number; result: unknown })[] = [];
  const issues: string[] = [];
  let holds = new WeakMap<Cond, { acc: number; tick: number }>();

  const builtin = (name: string): Flag | undefined =>
    name === 'cash' ? p.cash : name === 'debtPaid' ? p.debt.paid : name === 'debtTotal' ? p.debt.total : name === 'hintTokens' ? p.hintTokens : undefined;
  const tx = makeText(cat, (name) => run?.vars[name] ?? builtin(name) ?? p.flags[name]);
  const owned = (id: string) => p.evidence.includes(id);
  const issue = (s: string) => { if (issues.length < 200) issues.push(s); };
  const ctx = (): ExecCtx => ({ mission: run?.id ?? '', step: run?.step.id ?? '', restoring: !!run?.restoring });

  // -- conditions --
  function test(c: Cond, dt: number): boolean {
    switch (c.k) {
      case 'all': { let r = true; for (const x of c.of) r = test(x, dt) && r; return r; }
      case 'any': { let r = false; for (const x of c.of) r = test(x, dt) || r; return r; }
      case 'not': return !test(c.c, dt);
      case 'var': return compare(run?.vars[c.name], c.op, c.value);
      case 'stat': return compare(statOf(c.scope === 'campaign' || !run ? p.conscience : run.stats, c.name), c.op, c.value);
      case 'after': return !!run && run.t >= c.seconds;
      case 'missionTime': return !!run && compare(run.mt, c.op, c.seconds);
      case 'hold': {
        const inner = test(c.c, dt);
        let h = holds.get(c);
        if (!h) holds.set(c, (h = { acc: 0, tick: -1 }));
        if (h.tick !== tickNo) { h.tick = tickNo; h.acc = inner ? h.acc + dt : 0; }
        return h.acc >= c.seconds - 1e-9;
      }
      case 'on': {
        if (!run) return false;
        let n = 0;
        for (const e of c.scope === 'mission' ? run.history : run.latched) {
          if (e.type === c.ev && (c.id === undefined || e.id === c.id) && (c.tag === undefined || e.tag === c.tag)
            && (!c.where || Object.entries(c.where).every(([k, v]) => e[k] === v))) n++;
        }
        return n >= (c.n ?? 1);
      }
      case 'subs': return !!run && (run.live.subs ?? []).every((s) => s.optional || run!.subsDone.includes(s.id));
      default: { const r = testProgress(c, p); return r !== undefined ? r : port.test(c as WorldCond); }
    }
  }

  // -- events --
  function latch(e: StoryEvent) {
    if (!run) return;
    run.latched.push(e);
    if (run.latched.length > cap) run.latched.splice(0, run.latched.length - cap);
    if (e.type !== 'noise') { run.history.push(e); if (run.history.length > cap) run.history.splice(0, run.history.length - cap); }
  }
  function addEvidence(id: string) {
    if (!addOnce(p.evidence, id)) return;
    port.emit({ type: 'evidence', id, title: tx(cat.evidence.get(id)?.title ?? id) });
    latch({ type: 'evidence', id });
  }
  function handleEvent(e: StoryEvent) {
    const r = run;
    if (!r || r.phase === 'done' || r.phase === 'failed') return;
    if (CINE_MUTED.has(e.type) && cinematic()) return;
    let ev = e;
    switch (e.type) {
      case 'knockout': case 'kill': case 'restrain': case 'hurt': {
        const h = recordHarm(e, r.stats, p.conscience);
        if (e.type === 'kill' && h === 'ko') ev = { ...e, type: 'knockout', downgraded: true };
        if (h === 'kill' && r.def.lethal === 'fail') r.forced ??= { when: NEVER, reason: r.def.lethalReason ?? LETHAL_REASON };
        break;
      }
      case 'detected': r.stats.detections++; break;
      case 'alarm': r.stats.alarms++; break;
      case 'interact': case 'climb': { const it = r.live.interacts.find((x) => x.id === e.id); if (it && it.once !== false) r.live.interacts = r.live.interacts.filter((x) => x !== it); break; }
      case 'down': if (!r.def.allowDown) r.forced ??= { when: NEVER, reason: e.kind === 'busted' ? DOWN_REASONS.busted : DOWN_REASONS.wasted }; break;
    }
    if (typeof e.evidence === 'string') addEvidence(e.evidence);
    latch(ev);
  }
  function drain() {
    while (inbox.length) {
      const m = inbox.shift()!;
      if ('e' in m) { handleEvent(m.e); continue; }
      const q = pending.get(m.h);
      if (!q) continue;
      pending.delete(m.h);
      if (q.wait?.k === 'handle' && q.wait.h === m.h) { const a = q.wait.act; q.wait = null; resolved(a, m.result, q); }
    }
  }
  function resolved(a: Act, result: unknown, q: Queue) {
    switch (a.k) {
      case 'cutscene': addOnce(p.seen, a.id); latch({ type: 'cutscene', id: a.id }); break;
      case 'dialogue': latch({ type: 'dialogue', id: a.id }); break;
      case 'call': latch({ type: 'call', id: a.id, declined: result === 'declined' }); break;
      case 'choice': pick(a, typeof result === 'string' ? result : undefined, q); break;
      case 'space': latch({ type: 'space', id: a.enter ?? 'out' }); break;
      case 'do': latch({ type: 'signal', id: a.op, result: typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean' ? result : undefined }); break;
    }
  }
  function pick(a: ChoiceAct, id: string | undefined, q: Queue) {
    const shown = a.options.filter((o) => !o.if || test(o.if, 0));
    const o = shown.find((x) => x.id === id) ?? shown.find((x) => x.id === a.default) ?? shown[0];
    if (!o) return;
    Object.assign(p.flags, o.set ?? {});
    p.flags[`choice:${a.id}`] = o.id;
    latch({ type: 'choice', id: a.id, option: o.id });
    if (o.then?.length) q.acts.splice(q.i, 0, ...o.then);
  }

  // -- queues --
  const newQueue = (acts: Act[] | undefined, scope: 'step' | 'mission'): Queue => ({ acts: [...(acts ?? [])], i: 0, wait: null, alive: true, scope });
  const idle = (q: Queue) => !q.wait && q.i >= q.acts.length;
  function cancelQueue(q: Queue) {
    q.alive = false;
    if (q.wait?.k === 'handle') { pending.delete(q.wait.h); port.cancel?.(q.wait.h); }
    if (session?.q === q) closeSession(false);
    q.wait = null;
  }
  function spawnQueue(acts: Act[], scope: 'step' | 'mission') { if (run && acts.length) run.bg.push(newQueue(acts, scope)); }
  function runQueue(q: Queue, dt: number) {
    const w = q.wait;
    if (w) {
      if (w.k === 'time') { w.left -= dt; if (w.left > 1e-9) return; q.wait = null; }
      else if (w.k === 'cond') { if (!test(w.c, dt)) { w.left -= dt; if (w.left > 0) return; } q.wait = null; }
      else if (w.k === 'handle') {
        if (w.left === Infinity) return;
        w.left -= dt;
        if (w.left > 0) return;
        pending.delete(w.h); port.cancel?.(w.h); q.wait = null;
        if (w.act.k === 'choice') pick(w.act, undefined, q);
      } else return;
    }
    let guard = 0;
    while (q.alive && !q.wait && q.i < q.acts.length) {
      if (++guard > 500) { issue(`queue overflow in ${run?.id}/${run?.step.id}`); q.alive = false; break; }
      perform(q.acts[q.i++], q);
    }
  }
  function perform(a: Act, q: Queue) {
    const r = run!;
    switch (a.k) {
      case 'wait': q.wait = { k: 'time', left: a.seconds }; return;
      case 'waitFor': if (!test(a.c, 0)) q.wait = { k: 'cond', c: a.c, left: a.timeout ?? Infinity }; return;
      case 'goto': gotoStep(a.step); return;
      case 'complete': completeMission(); return;
      case 'fail': failWith({ when: NEVER, reason: a.reason, retry: a.retry }); return;
      case 'if': q.acts.splice(q.i, 0, ...(test(a.c, 0) ? a.then : a.else ?? [])); return;
      case 'parallel': spawnQueue(a.acts, q.scope); return;
      case 'oneOf': if (a.acts.length) q.acts.splice(q.i, 0, ...a.acts[Math.floor(rand() * a.acts.length)]); return;
      case 'save': if (!r.replay) port.emit({ type: 'save', reason: 'manual' }); return;
      case 'flag': p.flags[a.name] = a.value ?? true; return;
      case 'inc': p.flags[a.name] = Number(p.flags[a.name] ?? 0) + (a.by ?? 1); return;
      case 'var': r.vars[a.name] = a.inc !== undefined ? Number(r.vars[a.name] ?? 0) + a.inc : a.value ?? true; return;
      case 'evidence': addEvidence(a.id); return;
      case 'journal': if (addOnce(p.journal, a.id)) port.emit({ type: 'journal', id: a.id, title: tx(cat.journal.get(a.id)?.title ?? a.id) }); return;
      case 'give': p.items[a.item] = (p.items[a.item] ?? 0) + (a.n ?? 1); return;
      case 'take': p.items[a.item] = Math.max(0, (p.items[a.item] ?? 0) - (a.n ?? 1)); if (!p.items[a.item]) delete p.items[a.item]; return;
      case 'unlock': {
        const fresh = (a.ability ? addOnce(p.abilities, a.ability) : false) || (a.outfit ? addOnce(p.outfits, a.outfit) : false);
        if (fresh) port.emit({ type: 'unlock', ability: a.ability, outfit: a.outfit, label: tx(a.label ?? a.ability ?? a.outfit) });
        return;
      }
      case 'cash': p.cash = Math.max(0, p.cash + a.n); return;
      case 'score': p.score += a.n; return;
      case 'hintToken': p.hintTokens = Math.max(0, p.hintTokens + a.n); return;
      case 'payDebt': { const n = Math.max(0, Math.min(a.n, p.cash, p.debt.total - p.debt.paid)); p.cash -= n; p.debt.paid += n; return; }
      case 'lunar': p.lunar = { month: a.month ?? p.lunar.month, day: a.day }; return;
      case 'objective': r.live.objective = a.text; if (a.subs) { r.live.subs = a.subs; r.subsDone = []; } return;
      case 'marker': upsert(r.live.markers, { id: a.id, at: a.at, label: a.label, style: a.style, r: a.r, scope: a.scope ?? 'step' }); return;
      case 'unmark': r.live.markers = r.live.markers.filter((m) => m.id !== a.id); return;
      case 'interactable': upsert(r.live.interacts, {
        id: a.id, at: a.at, r: a.r, prompt: a.prompt, verb: a.verb, hold: a.hold, once: a.once, when: a.when, kind: a.kind, crime: a.crime, level: a.level, to: a.to, scope: a.scope ?? 'step',
      }); return;
      case 'uninteract': r.live.interacts = r.live.interacts.filter((x) => x.id !== a.id); return;
      case 'timer': upsert(r.live.timers, { id: a.id, left: a.seconds, label: a.label, fail: a.fail, scope: a.scope ?? 'mission' }); return;
      case 'stopTimer': r.live.timers = r.live.timers.filter((t) => t.id !== a.id); return;
      case 'board': case 'deduce': case 'interrogate': openSession(a, q); return;
      case 'choice': openChoice(a, q); return;
      default: execEngine(a, q);
    }
  }
  function rand() {
    const r = run!;
    let t = (r.rng = (r.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // -- engine actions --
  const lines = (ls: Line[]) => ls.filter((l) => !l.if || test(l.if, 0))
    .map((l) => ({ who: l.who, name: tx(cat.cast.get(l.who)?.name ?? l.who), text: tx(l.text), voice: l.voice, dur: l.dur }));
  function resolveAct(a: EngineAct): ExecAct | null {
    switch (a.k) {
      case 'dialogue': { const ls = lines(a.lines); return ls.length ? { ...a, lines: ls } : null; }
      case 'call': case 'eavesdrop': return { ...a, lines: lines(a.lines) };
      case 'sms': case 'bark': case 'hint': case 'toast': return { ...a, text: tx(a.text) };
      case 'title': return { ...a, text: tx(a.text), sub: a.sub === undefined ? undefined : tx(a.sub) };
      default: return a;
    }
  }
  function trackEnv(a: EngineAct) {
    const env = run!.live.env;
    if (a.k === 'world') env.policy = { ...env.policy, ...a.policy };
    else if (a.k === 'time') env.hour = a.hour;
    else if (a.k === 'weather') env.weather = { set: a.set, lock: a.lock };
    else if (a.k === 'space') { if (a.enter) env.space = a.enter; else if (a.leave) env.space = null; }
  }
  function execEngine(a: EngineAct, q: Queue | null) {
    trackEnv(a);
    const out = resolveAct(a);
    if (!out) { if (a.k === 'dialogue') latch({ type: 'dialogue', id: a.id }); return; }
    const blocking = !!q && isBlocking(a), h = ++handle;
    if (blocking) { pending.set(h, q!); q!.wait = { k: 'handle', h, act: a, left: Infinity }; }
    const later = port.exec(out, h, { ...ctx(), seen: a.k === 'cutscene' ? p.seen.includes(a.id) : undefined });
    if (blocking && !later && pending.has(h)) { pending.delete(h); q!.wait = null; resolved(a, undefined, q!); }
    drain();
  }
  function openChoice(a: ChoiceAct, q: Queue) {
    const shown = a.options.filter((o) => !o.if || test(o.if, 0)), h = ++handle;
    pending.set(h, q);
    q.wait = { k: 'handle', h, act: a, left: a.timeout ?? Infinity };
    const later = port.exec({ k: 'choice', id: a.id, prompt: tx(a.prompt), options: shown.map((o) => ({ id: o.id, text: tx(o.text) })), timeout: a.timeout, style: a.style ?? 'scene' }, h, ctx());
    if (!later && pending.has(h)) { pending.delete(h); q.wait = null; pick(a, undefined, q); }
    drain();
  }

  // -- sessions: board, question, interrogation --
  function sessionView(): unknown {
    const s = session;
    if (!s) return null;
    if (s.kind === 'board') return D.boardView(s.board!, p, owned, tx);
    if (s.kind === 'deduce') return D.questionView(s.question!, p, tx);
    return I.interrogationView(s.inter!, s.state!, tx);
  }
  const emitSession = (open: boolean) => { if (session) port.emit({ type: 'session', kind: session.kind, id: session.id, open, view: sessionView() }); };
  function closeSession(cont: boolean) {
    const s = session;
    if (!s) return;
    emitSession(false);
    session = null;
    if (cont && s.q.wait?.k === 'session') s.q.wait = null;
  }
  function openSession(a: Extract<CoreAct, { k: 'board' | 'deduce' | 'interrogate' }>, q: Queue) {
    if (session) closeSession(true);
    if (a.k === 'board') {
      const def = cat.boards.get(a.id);
      if (!def) { issue(`unknown board ${a.id}`); return; }
      if ((a.until ?? 'solved') === 'solved' && p.board.solved.includes(def.id)) { latch({ type: 'board', id: def.id, solved: true }); return; }
      session = { kind: 'board', id: def.id, q, until: a.until ?? 'solved', board: def };
    } else if (a.k === 'deduce') {
      const qd = a.q ?? cat.questions.get(a.id);
      if (!qd) { issue(`unknown question ${a.id}`); return; }
      if (p.deductions[qd.id]?.answer) { latch({ type: 'deduce', id: qd.id, correct: true }); return; }
      session = { kind: 'deduce', id: qd.id, q, question: qd };
    } else {
      const def = cat.interrogations.get(a.id);
      if (!def) { issue(`unknown interrogation ${a.id}`); return; }
      session = { kind: 'interrogate', id: def.id, q, inter: def, state: I.startInterrogation(def) };
    }
    q.wait = { k: 'session' };
    emitSession(true);
    if (session.state?.done) afterInterrogation({ result: 'done', line: '', silent: 0, done: true });
  }
  function afterBoard(def: BoardDef, solved: boolean) {
    if (solved) {
      latch({ type: 'board', id: def.id, solved: true });
      if (def.reveals?.length) spawnQueue(def.reveals, 'mission');
      if (session?.kind === 'board' && session.until === 'solved') {
        const qd = def.question ? cat.questions.get(def.question) : undefined, q = session.q;
        closeSession(!(qd && !p.deductions[qd.id]?.answer));
        if (qd && !p.deductions[qd.id]?.answer) { session = { kind: 'deduce', id: qd.id, q, question: qd }; emitSession(true); }
        return;
      }
    }
    emitSession(true);
  }
  function afterInterrogation(r: I.Reply) {
    const s = session!;
    if (!r.done) { emitSession(true); return; }
    const def = s.inter!, st = s.state!, o = I.outcome(def, st);
    Object.assign(p.flags, I.settledFlags(def, st));
    p.interrogations[def.id] = { wrong: o.wrong, bluffs: o.bluffs, empathy: o.empathy, trust: o.trust };
    latch({ type: 'interrogation', id: def.id, perfect: o.perfect, empathy: o.empathy, trust: o.trust });
    if (def.done?.length) spawnQueue(def.done, 'mission');
    closeSession(true);
  }
  /** Story UI → runner. Each returns the solver's result (null when no matching session is open). */
  const ui = {
    view: sessionView,
    link(a: string, b: string) {
      if (session?.kind !== 'board') return null;
      const def = session.board!, r = D.linkCards(def, p, a, b, owned);
      if (r.result === 'correct') latch({ type: 'link', id: D.pairKey(a, b) });
      afterBoard(def, r.solved);
      return r;
    },
    propose(hyp: string, cards: string[]) {
      if (session?.kind !== 'board') return null;
      const def = session.board!, r = D.propose(def, p, hyp, cards, owned);
      afterBoard(def, r.solved);
      return r;
    },
    hint() {
      const s = session;
      if (!s) return null;
      if (s.kind === 'board') { const r = D.boardHint(s.board!, p, owned); if (r.kind === 'link') afterBoard(s.board!, r.solved); else emitSession(true); return r; }
      if (s.kind === 'deduce') {
        const qd = s.question!, cost = Math.min(1, p.hintTokens);
        if (!cost) return { kind: 'no-tokens' as const, cost: 0 };
        p.hintTokens -= cost; emitSession(true);
        return { kind: 'text' as const, text: tx(qd.hint ?? ''), options: D.provable(qd, owned), cost };
      }
      return { kind: 'interrogation' as const, ...I.interrogationHint(s.inter!, s.state!, owned), cost: 0 };
    },
    answer(option: string) {
      if (session?.kind !== 'deduce') return null;
      const qd = session.question!, r = D.answerQuestion(qd, p, option);
      if (r.result === 'correct') {
        latch({ type: 'deduce', id: qd.id, correct: true, tries: r.tries });
        if (qd.onCorrect?.length) spawnQueue(qd.onCorrect, 'mission');
        closeSession(true);
      } else emitSession(true);
      return r;
    },
    present(card: string, approach: I.Approach) {
      if (session?.kind !== 'interrogate') return null;
      const r = I.present(session.inter!, session.state!, card, approach, owned);
      afterInterrogation(r);
      return r;
    },
    press() { if (session?.kind !== 'interrogate') return null; const r = I.press(session.inter!, session.state!); afterInterrogation(r); return r; },
    bluff() { if (session?.kind !== 'interrogate') return null; const r = I.bluff(session.inter!, session.state!); afterInterrogation(r); return r; },
    /** Leaves the board (only boards can be closed; questions and interrogations stay until finished). */
    close() {
      if (session?.kind !== 'board') return false;
      latch({ type: 'board', id: session.id, solved: p.board.solved.includes(session.id) });
      closeSession(true);
      return true;
    },
  };

  // -- steps --
  function snapshotRun(start: boolean): Checkpoint {
    const r = run!;
    return json({ v: 1 as const, mission: r.id, step: r.step.id, start, vars: r.vars, stats: r.stats, history: r.history, fired: r.fired, live: r.live, rng: r.rng, mt: r.mt, progress: p });
  }
  function applySnap(s: Checkpoint, keepCounters = true) {
    const r = run!, c = json(s);
    const keep = keepCounters ? { retries: r.stats.retries, skipped: r.stats.skipped } : {};
    r.vars = c.vars; r.stats = { ...c.stats, ...keep }; r.history = c.history; r.fired = c.fired; r.live = c.live; r.rng = c.rng;
    p = c.progress;
  }
  function startActs(def: MissionDef): Act[] {
    const s = def.start ?? {}, out: Act[] = [];
    if (def.world) out.push({ k: 'world', policy: def.world });
    if (s.lunar !== undefined) out.push({ k: 'lunar', day: s.lunar });
    if (s.hour !== undefined) out.push({ k: 'time', hour: s.hour });
    if (s.weather) out.push({ k: 'weather', set: s.weather, lock: def.world?.weather?.lock });
    if (s.space) out.push({ k: 'space', enter: s.space });
    if (s.at) out.push({ k: 'teleport', at: s.at, yaw: s.yaw, vehicle: s.vehicle });
    if (s.outfit) out.push({ k: 'player', outfit: s.outfit });
    return [...out, ...(def.setup ?? [])];
  }
  function envActs(env: Live['env']): Act[] {
    const out: Act[] = [{ k: 'world', policy: env.policy }];
    if (env.hour !== undefined) out.push({ k: 'time', hour: env.hour });
    if (env.weather) out.push({ k: 'weather', set: env.weather.set, lock: env.weather.lock });
    if (env.space) out.push({ k: 'space', enter: env.space });
    return out;
  }
  function enterStep(ix: number, mode: 'normal' | 'restore' | 'retry' | 'skip', pre: Act[] = [], startCp = false) {
    const r = run!, st = r.def.steps[ix];
    r.ix = ix; r.step = st; r.t = 0; r.wasRun = false; r.latched = []; r.subsDone = []; r.forced = null; r.failure = null;
    r.restoring = mode === 'restore' || mode === 'retry';
    holds = new WeakMap();
    for (const k of Object.keys(r.fired)) if (k.startsWith(`s:${st.id}:`)) delete r.fired[k];
    if (st.objective !== undefined) r.live.objective = st.objective;
    r.live.subs = st.subs ?? null;
    (Array.isArray(st.marker) ? st.marker : st.marker ? [st.marker] : []).forEach((m, i) =>
      upsert(r.live.markers, { id: m.id ?? `${st.id}#${i}`, at: m.at, label: m.label, style: m.style, r: m.r, scope: 'step' }));
    for (const it of st.interact ?? []) upsert(r.live.interacts, { ...it, scope: 'step' });
    const snap = snapshotRun(startCp);
    r.stepSnap = snap;
    if (mode !== 'retry' && (st.checkpoint || startCp)) r.checkpoint = snap;
    const acts: Act[] = [...pre];
    if (st.world) acts.push({ k: 'world', policy: st.world });
    if (mode === 'retry') acts.push(...(st.retry ?? []));
    else if (typeof st.checkpoint === 'object') acts.push(...(st.checkpoint.setup ?? []));
    acts.push(...(st.enter ?? []));
    r.main = newQueue(acts, 'step');
    r.phase = 'enter';
  }
  function beginRun() {
    const r = run!, st = r.step;
    r.phase = 'run'; r.wasRun = true; r.t = 0;
    if (st.timer) upsert(r.live.timers, { id: st.id, left: st.timer.seconds, label: st.timer.label, fail: st.timer.fail, scope: 'step' });
    if (r.restoring || r.replay) return;
    if (st.checkpoint) port.emit({ type: 'checkpoint', step: st.id, label: tx(typeof st.checkpoint === 'object' ? st.checkpoint.label ?? 'Đã lưu' : 'Đã lưu') });
    if (st.checkpoint || (r.ix === 0 && r.checkpoint.start)) port.emit({ type: 'save', reason: 'checkpoint' });
  }
  function leaveStep() {
    const r = run!;
    cancelQueue(r.main);
    for (const q of r.bg) if (q.scope === 'step') cancelQueue(q);
    r.bg = r.bg.filter((q) => q.alive);
    const keep = <T extends { scope: Scope }>(xs: T[]) => xs.filter((x) => x.scope !== 'step');
    r.live.markers = keep(r.live.markers); r.live.interacts = keep(r.live.interacts); r.live.timers = keep(r.live.timers);
    port.reset('step');
  }
  function gotoStep(id: string) {
    const r = run!, ix = r.def.steps.findIndex((s) => s.id === id);
    if (ix < 0) { issue(`${r.id}: goto unknown step ${id}`); return; }
    leaveStep();
    enterStep(ix, 'normal');
  }
  /** After exit acts: `next` ('end' completes), else the following step, else the mission is complete. */
  function advance() {
    const r = run!, st = r.step;
    if (st.next === 'end' || (st.next === undefined && r.ix + 1 >= r.def.steps.length)) { completeMission(); return; }
    if (st.next !== undefined) { gotoStep(st.next); return; }
    leaveStep();
    enterStep(r.ix + 1, 'normal');
  }
  /**
   * Runs the instant acts of step-scoped queues that have not had a tick yet (watchers that fired this tick):
   * the step is about to change (done with no exit acts, or a branch) and leaveStep would cancel them unrun.
   * Blocking acts and whatever follows them are dropped with the step, as before.
   */
  function flushFresh() {
    const r = run!, st = r.step, ph = r.phase;
    for (const q of [...r.bg]) {
      if (!q.alive || q.scope !== 'step' || q.i !== 0 || q.wait) continue;
      while (q.alive && !q.wait && q.i < q.acts.length && !isBlocking(q.acts[q.i]) && run === r && r.step === st && r.phase === ph) perform(q.acts[q.i++], q);
    }
  }
  function watch(list: StepDef['watchers'], prefix: string, scope: 'step' | 'mission', dt: number) {
    const r = run!;
    (list ?? []).forEach((w, i) => {
      const key = `${prefix}${w.id ?? i}`, last = r.fired[key];
      if (last !== undefined && ((w.once ?? w.cooldown === undefined) || r.mt - last < (w.cooldown ?? 0))) return;
      if (!test(w.when, dt)) return;
      r.fired[key] = r.mt;
      spawnQueue(w.do, scope);
    });
  }
  /** Run-phase checks; false when the step changed, failed or the mission ended. */
  function evaluate(dt: number): boolean {
    const r = run!, st = r.step;
    watch(r.def.watchers, 'm:', 'mission', dt);
    watch(st.watchers, `s:${st.id}:`, 'step', dt);
    for (const f of [...(st.fail ?? []), ...(r.def.fail ?? [])]) if (test(f.when, dt)) { failWith(f); return false; }
    for (const b of st.branch ?? []) {
      if (!test(b.when, dt)) continue;
      flushFresh();
      if (run !== r || r.step !== st || r.phase !== 'run') return false;
      if (b.do?.length) spawnQueue(b.do, 'mission');
      gotoStep(b.goto);
      return false;
    }
    for (const s of r.live.subs ?? []) if (!r.subsDone.includes(s.id) && test(s.done, dt)) r.subsDone.push(s.id);
    for (const o of [...(st.optional ?? []), ...(r.def.optional ?? [])]) {
      if (r.stats.optional.includes(o.id) || !test(o.when, dt)) continue;
      r.stats.optional.push(o.id);
      port.emit({ type: 'optional', id: o.id, text: tx(o.text) });
      if (o.reward?.length) spawnQueue(o.reward, 'mission');
    }
    const done: Cond | null = st.done ?? (r.live.subs?.length ? { k: 'subs' } : null);
    if (!done || test(done, dt)) { r.phase = 'exit'; r.main = newQueue(st.exit, 'step'); }
    return true;
  }

  // -- fails, retries, completion --
  function stopAll() {
    const r = run!;
    cancelQueue(r.main);
    r.bg.forEach(cancelQueue);
    r.bg = [];
    if (session) closeSession(false);
  }
  function failWith(f: FailDef) {
    const r = run!, st = r.step;
    r.failCounts[st.id] = (r.failCounts[st.id] ?? 0) + 1;
    const reason = tx(f.reason);
    if (f.soft) { r.stats.retries++; port.emit({ type: 'fail', reason, soft: true, canSkip: false }); retryStep(); return; }
    stopAll();
    r.phase = 'failed';
    r.failure = { reason, def: f, canSkip: f.allowSkipAfter !== undefined && r.failCounts[st.id] >= f.allowSkipAfter };
    port.emit({ type: 'fail', reason, soft: false, canSkip: r.failure.canSkip });
  }
  function retryStep() {
    const r = run!;
    stopAll();
    applySnap(r.stepSnap);
    port.reset('step');
    enterStep(r.ix, 'retry', [{ k: 'fade', to: 'dip' }], r.stepSnap.start);
  }
  function restoreFrom(cp: Checkpoint, keepCounters = true) {
    const r = run!;
    stopAll();
    port.reset('checkpoint');
    applySnap(cp, keepCounters);
    const ix = Math.max(0, r.def.steps.findIndex((s) => s.id === cp.step));
    const pre = cp.start ? startActs(r.def) : [...envActs(r.live.env), ...(r.def.setup ?? [])];
    enterStep(ix, 'restore', pre, cp.start);
  }
  function completeMission() {
    const r = run!;
    if (r.phase === 'done') return;
    stopAll();
    r.phase = 'done'; r.stats.seconds = r.mt;
    const tmp = newQueue([], 'mission');
    for (const a of r.def.rewards ?? []) { if (isCoreAct(a)) { if (!isBlocking(a)) perform(a, tmp); } else execEngine(a, null); }
    const nextChapter = r.chapter + 1, wasOpen = chapterUnlocked(cat.index, p, nextChapter);
    const g = gradeMission(r.stats, r.def, p.evidence);
    p.medals[r.id] = mergeMedal(p.medals[r.id], g, r.stats.seconds);
    p.hintTokens += g.tokens;
    addOnce(p.completed, r.id);
    r.live.markers = []; r.live.interacts = []; r.live.timers = [];
    port.reset('end');
    if (r.replay) { const box = p; p = r.replay.main; mergeReplay(p, box, r.id, r.stats.seconds); }
    else p.playSeconds += r.stats.seconds;
    const opened = !r.replay && !wasOpen && cat.index.chapters.some((c) => c.n === nextChapter) && chapterUnlocked(cat.index, p, nextChapter);
    port.emit({ type: 'complete', id: r.id, stats: json(r.stats), result: g, replay: !!r.replay, chain: r.replay ? null : r.def.chain ?? null, chapterUnlocked: opened ? nextChapter : null });
    if (!r.replay) port.emit({ type: 'save', reason: 'complete' });
  }
  function makeRun(def: MissionDef, chapter: number, replay: Run['replay']): Run {
    const none = {} as Checkpoint;
    return {
      def, id: def.id, chapter, ix: 0, step: def.steps[0], phase: 'enter', t: 0, mt: 0, wasRun: false,
      vars: {}, latched: [], history: [], fired: {}, subsDone: [], failCounts: {}, stats: emptyStats(),
      live: { objective: null, subs: null, markers: [], interacts: [], timers: [], env: { policy: {} } },
      checkpoint: none, origin: none, stepSnap: none, restoring: false, main: newQueue([], 'step'), bg: [], forced: null, failure: null,
      replay, rng: hashStr(def.id, seed),
    };
  }
  function titleOf(id: string) { return tx(cat.missions.get(id)?.title ?? cat.meta.get(id)?.title ?? id); }

  // -- public --
  /** Starts a mission fresh (or as a replay sandbox: only medals and play time reach the main progress). */
  function start(id: string, o: { replay?: boolean } = {}): boolean {
    const def = cat.missions.get(id);
    if (!def || !def.steps.length) { issue(`mission ${id} is not loaded`); return false; }
    if (run && run.phase !== 'done') stop();
    const chapter = cat.meta.get(id)?.chapter ?? 0;
    let replay: Run['replay'] = null;
    if (o.replay) { replay = { main: p }; p = replaySandbox(p, cat.index, id, def); }
    const meta = cat.index.chapters.find((c) => c.n === chapter);
    if (meta && (p.lunar.month < meta.lunar.month || (p.lunar.month === meta.lunar.month && p.lunar.day < meta.lunar.day))) p.lunar = { ...meta.lunar };
    const fresh = !o.replay && chapter > 0 && markChapterStart(p, chapter);
    run = makeRun(def, chapter, replay);
    port.reset('mission');
    port.emit({ type: 'mission', id, title: titleOf(id), chapter, restoring: false });
    if (fresh && meta) port.emit({ type: 'chapter', n: chapter, title: meta.title, card: meta.card });
    enterStep(0, 'normal', startActs(def), true);
    run.origin = run.checkpoint;
    return true;
  }
  /** Continues a saved game: at its checkpoint when a mission was running, else just loads the progress. */
  function resume(save: StorySave): boolean {
    if (run && run.phase !== 'done') stop();
    run = null;
    p = cloneProgress(save.progress);
    const c = save.checkpoint;
    if (!c) return false;
    const def = cat.missions.get(c.mission);
    if (!def || !def.steps.length) { issue(`saved mission ${c.mission} is not loaded`); return false; }
    run = makeRun(def, cat.meta.get(def.id)?.chapter ?? 0, null);
    const cp: Checkpoint = { ...json(c), progress: cloneProgress(p) };
    if (!def.steps.some((s) => s.id === cp.step)) { cp.step = def.steps[0].id; cp.start = true; }
    run.checkpoint = cp;
    run.origin = cp.start ? cp : { ...cp, start: true, step: def.steps[0].id };
    run.mt = c.mt;
    port.emit({ type: 'mission', id: def.id, title: titleOf(def.id), chapter: run.chapter, restoring: true });
    restoreFrom(cp, false);
    return true;
  }
  /**
   * Leaves the mission (quit to menu, abandon). An unfinished mission's gains are rolled back to its start
   * (take snapshot() first to keep the checkpoint for Continue); a replay sandbox is dropped.
   */
  function stop() {
    const r = run;
    if (!r) return;
    if (r.phase !== 'done') { stopAll(); port.reset('end'); if (!r.replay && r.origin.progress) p = cloneProgress(r.origin.progress); }
    if (r.replay) p = r.replay.main;
    run = null;
  }
  function retry(): boolean {
    const r = run;
    if (!r || r.phase !== 'failed' || !r.failure) return false;
    const mode = r.failure.def.retry ?? 'checkpoint';
    r.stats.retries++;
    if (mode === 'step') retryStep();
    else restoreFrom(mode === 'mission' ? r.origin : r.checkpoint);
    return true;
  }
  function skipSection(): boolean {
    const r = run;
    if (!r || r.phase !== 'failed' || !r.failure?.canSkip) return false;
    const steps = r.def.steps, f = r.failure.def;
    let target = f.skipTo ?? r.step.skipTo;
    if (!target) { const n = steps.findIndex((s, i) => i > r.ix && !!s.checkpoint); target = n >= 0 ? steps[n].id : steps[r.ix + 1]?.id ?? 'end'; }
    r.stats.skipped++; r.failure = null;
    if (target === 'end') { r.phase = 'run'; completeMission(); return true; }
    const ix = steps.findIndex((s) => s.id === target);
    if (ix < 0) { issue(`${r.id}: skip to unknown step ${target}`); return false; }
    stopAll();
    port.reset('checkpoint');
    const keep = <T extends { scope: Scope }>(xs: T[]) => xs.filter((x) => x.scope !== 'step');
    r.live.markers = keep(r.live.markers); r.live.interacts = keep(r.live.interacts); r.live.timers = keep(r.live.timers);
    enterStep(ix, 'skip', [...envActs(r.live.env), ...(r.def.setup ?? [])]);
    return true;
  }
  /**
   * The world is held: a session is open, the main queue waits on a presentation act, or a background queue (a
   * watcher, a branch, a reward) waits on a cutscene. Timers, the step clock (`after`, `hold`) and the run-phase
   * checks (watchers, fail rules, branches, subs, done) all wait until it ends; CINE_MUTED events are dropped.
   */
  const cinematic = () => !!run && (!!session || (run.main.wait?.k === 'handle' && CINEMATIC.has(run.main.wait.act.k))
    || run.bg.some((q) => q.alive && q.wait?.k === 'handle' && q.wait.act.k === 'cutscene'));
  function tickTimers(dt: number) {
    const r = run!;
    for (const tm of [...r.live.timers]) {
      tm.left -= dt;
      if (tm.left > 1e-9) continue;
      r.live.timers = r.live.timers.filter((x) => x !== tm);
      if (tm.fail) { failWith({ when: NEVER, reason: tm.fail }); return; }
      latch({ type: 'timer', id: tm.id });
    }
  }
  /** Advances the story by dt seconds of game time (scaled by cutscene slow motion, 0 while paused). */
  function tick(dt: number) {
    tickNo++;
    drain();
    if (session?.kind === 'interrogate') { const before = session.state!.silent; I.tickInterrogation(session.state!, dt); if (before > 0 !== session.state!.silent > 0) emitSession(true); }
    const r = run;
    if (!r || r.phase === 'done' || r.phase === 'failed') return;
    const live = () => run === r && r.phase !== 'done' && r.phase !== 'failed';
    if (r.forced) { const f = r.forced; r.forced = null; failWith(f); return; }
    const held = cinematic();
    r.mt += dt;
    if (r.phase === 'run' && r.wasRun && !held) r.t += dt;
    if (!held) { tickTimers(dt); if (!live()) return; }
    runQueue(r.main, dt);
    for (const q of [...r.bg]) if (q.alive && live()) runQueue(q, dt);
    if (!live()) return;
    r.bg = r.bg.filter((q) => q.alive && !idle(q));
    if (r.forced) { const f = r.forced; r.forced = null; failWith(f); return; }
    if (r.phase === 'enter' && idle(r.main)) beginRun();
    if (r.phase === 'run' && !cinematic() && !evaluate(dt)) { emitObjective(); return; }
    if (r.phase === 'exit' && idle(r.main)) { flushFresh(); if (live() && r.phase === 'exit' && idle(r.main)) advance(); }
    emitObjective();
  }
  function emitObjective() {
    const o = run && run.phase !== 'done' ? tx(run.live.objective ?? '') : '';
    if (o !== lastObjective) { lastObjective = o; if (o) port.emit({ type: 'objective', text: o }); }
  }
  function view(): StoryView {
    const r = run, st = r?.step;
    const base: Omit<StoryView, 'rev'> = {
      mission: r?.id ?? null, title: r ? titleOf(r.id) : '', chapter: r?.chapter ?? p.chapter, step: st?.id ?? null,
      phase: r?.phase ?? 'idle', cinematic: cinematic(), objective: r && r.phase !== 'done' ? tx(r.live.objective ?? '') : '',
      subs: (r?.live.subs ?? []).map((s) => ({ id: s.id, text: tx(s.text), done: r!.subsDone.includes(s.id), optional: !!s.optional })),
      markers: (r?.live.markers ?? []).map((m) => ({ id: m.id, at: m.at, label: m.label === undefined ? undefined : tx(m.label), style: m.style, r: m.r })),
      interacts: (r?.live.interacts ?? []).map((x) => ({ id: x.id, at: x.at, r: x.r, prompt: tx(x.prompt), verb: x.verb === undefined ? undefined : tx(x.verb), hold: x.hold, once: x.once, when: x.when, kind: x.kind, crime: x.crime, level: x.level, to: x.to })),
      timers: (r?.live.timers ?? []).map((t) => ({ id: t.id, label: tx(t.label ?? ''), left: Math.max(0, Math.ceil(t.left * 10) / 10) })),
      meters: (r && r.phase !== 'done' ? st?.meters ?? [] : []).map((m) => ({ id: m.id, label: tx(m.label), kind: m.kind ?? 'bar', max: m.max, value: m.flag ? Number(p.flags[m.flag] ?? 0) : undefined })),
      hud: { light: !!st?.hud?.light, noise: !!st?.hud?.noise, cover: !!st?.hud?.cover },
      failure: r?.failure ? { reason: r.failure.reason, canSkip: r.failure.canSkip } : null,
      lunar: lunarLabel(p.lunar),
      conscience: r ? { knockouts: r.stats.knockouts, kills: r.stats.kills } : { knockouts: p.conscience.knockouts, kills: p.conscience.kills },
    };
    const sig = JSON.stringify(base);
    if (sig !== lastSig) { lastSig = sig; rev++; }
    return { rev, ...base };
  }
  /** Save data: the last checkpoint of a running mission (with the progress at that moment), else the progress. */
  function snapshot(): StorySave {
    const r = run;
    if (r && r.phase !== 'done' && !r.replay) {
      const { progress, ...c } = r.checkpoint;
      return { progress: cloneProgress(progress), checkpoint: json({ ...c, mt: r.mt }) };
    }
    return { progress: cloneProgress(r?.replay ? r.replay.main : p), checkpoint: null };
  }

  return {
    start, resume, stop, tick, retry, skipSection, view, snapshot, ui,
    /** Engine → runner: interactions, photos, stealth and helper events (applied in order at the next tick). */
    event(e: StoryEvent) { inbox.push({ e }); },
    /** Engine → runner: a blocking action finished (choice: the option id; call: 'declined' to decline). */
    resolve(h: number, result?: unknown) { inbox.push({ h, result }); },
    /** The live progress (the replay sandbox during a replay). Replaced on restore: read it again after retry(). */
    progress: () => p,
    /** Loads progress while no mission runs (hub, new game). */
    setProgress(next: Progress) { if (!run || run.phase === 'done') { run = null; p = cloneProgress(next); } },
    /** Missions for the hub and chapter select. */
    available: (hour = 12) => availability(cat.index, p, hour),
    text: (ref: TextRef) => tx(ref),
    test: (c: Cond) => test(c, 0),
    state: () => ({
      mission: run?.id ?? null, step: run?.step.id ?? null, phase: run?.phase ?? 'idle', t: run?.t ?? 0, mt: run?.mt ?? 0,
      vars: { ...(run?.vars ?? {}) }, stats: run ? json(run.stats) : null, session: session ? { kind: session.kind, id: session.id } : null,
      pending: pending.size, issues: [...issues],
    }),
  };
}

// ---- Content lint ------------------------------------------------------------------------------------

type Visit = { act?(a: Act, at: string): void; cond?(c: Cond, at: string): void; text?(t: TextRef | undefined, at: string): void };
export function walkCond(c: Cond | undefined, v: Visit, at: string) {
  if (!c) return;
  v.cond?.(c, at);
  if (c.k === 'all' || c.k === 'any') c.of.forEach((x) => walkCond(x, v, at));
  else if (c.k === 'not' || c.k === 'hold') walkCond(c.c, v, at);
}
export function walkActs(list: Act[] | undefined, v: Visit, at: string) {
  for (const a of list ?? []) {
    v.act?.(a, at);
    const t = (s: TextRef | undefined) => v.text?.(s, at);
    switch (a.k) {
      case 'if': walkCond(a.c, v, at); walkActs(a.then, v, at); walkActs(a.else, v, at); break;
      case 'parallel': walkActs(a.acts, v, at); break;
      case 'oneOf': a.acts.forEach((x) => walkActs(x, v, at)); break;
      case 'waitFor': walkCond(a.c, v, at); break;
      case 'choice': if (a.prompt !== undefined) t(a.prompt); for (const o of a.options) { t(o.text); walkCond(o.if, v, at); walkActs(o.then, v, at); } break;
      case 'dialogue': case 'call': case 'eavesdrop': for (const l of a.lines) { t(l.text); walkCond(l.if, v, at); } break;
      case 'fail': t(a.reason); break;
      case 'objective': t(a.text); for (const s of a.subs ?? []) { t(s.text); walkCond(s.done, v, at); } break;
      case 'sms': case 'bark': case 'hint': case 'toast': t(a.text); break;
      case 'title': t(a.text); if (a.sub !== undefined) t(a.sub); break;
      case 'marker': if (a.label !== undefined) t(a.label); break;
      case 'interactable': t(a.prompt); if (a.verb !== undefined) t(a.verb); break;
      case 'timer': if (a.label !== undefined) t(a.label); if (a.fail !== undefined) t(a.fail); break;
      case 'unlock': if (a.label !== undefined) t(a.label); break;
      case 'deduce': if (a.q) { t(a.q.prompt); a.q.options.forEach((o) => t(o.text)); walkActs(a.q.onCorrect, v, at); } break;
    }
  }
}
/** Visits every act, condition and text of a mission (step ones with `mission/step` as location). */
export function walkMission(m: MissionDef, v: Visit) {
  const at = m.id, t = (s: TextRef | undefined, w: string) => v.text?.(s, w);
  if (m.title !== undefined) t(m.title, at);
  if (m.lethalReason !== undefined) t(m.lethalReason, at);
  walkActs(m.setup, v, `${at}/setup`); walkActs(m.rewards, v, `${at}/rewards`);
  for (const w of m.watchers ?? []) { walkCond(w.when, v, at); walkActs(w.do, v, at); }
  for (const f of m.fail ?? []) { walkCond(f.when, v, at); t(f.reason, at); }
  for (const o of m.optional ?? []) { t(o.text, at); walkCond(o.when, v, at); walkActs(o.reward, v, at); }
  for (const s of m.steps) {
    const w = `${m.id}/${s.id}`;
    if (s.objective !== undefined) t(s.objective, w);
    for (const x of s.subs ?? []) { t(x.text, w); walkCond(x.done, v, w); }
    for (const x of Array.isArray(s.marker) ? s.marker : s.marker ? [s.marker] : []) if (x.label !== undefined) t(x.label, w);
    for (const x of s.interact ?? []) { t(x.prompt, w); if (x.verb !== undefined) t(x.verb, w); }
    if (typeof s.checkpoint === 'object') { if (s.checkpoint.label !== undefined) t(s.checkpoint.label, w); walkActs(s.checkpoint.setup, v, w); }
    walkActs(s.enter, v, w); walkActs(s.retry, v, w); walkActs(s.exit, v, w); walkCond(s.done, v, w);
    for (const f of s.fail ?? []) { walkCond(f.when, v, w); t(f.reason, w); }
    for (const b of s.branch ?? []) { walkCond(b.when, v, w); walkActs(b.do, v, w); }
    for (const x of s.watchers ?? []) { walkCond(x.when, v, w); walkActs(x.do, v, w); }
    for (const o of s.optional ?? []) { t(o.text, w); walkCond(o.when, v, w); walkActs(o.reward, v, w); }
    if (s.timer) { if (s.timer.label !== undefined) t(s.timer.label, w); if (s.timer.fail !== undefined) t(s.timer.fail, w); }
    for (const x of s.meters ?? []) t(x.label, w);
  }
}

const PLACEHOLDER_WORDS = /\b(TODO|FIXME|XXX|TBD|lorem)\b/i;
/**
 * Real companies the story must not name and the names and codes retired with them (story-decisions.md 14:
 * GiaoNhanh → GiaoLẹ → ĐơnƠi with order codes {@code}-04xx, since "lẹ" is Southern for "nhanh"; Ngân hàng Phương
 * Nam → NGÂN HÀNG KIM THÀNH). The ring ({@ring}) is never printed with a company-type word: "Sen Vàng Logistics",
 * "Tập đoàn Sen Vàng" and "Sen Vàng Việt Nam" are registered companies.
 */
export const FORBIDDEN_BRANDS = [/giao\s*nhanh/i, /ngân\s*hàng\s*phương\s*nam/i, /\bNH\s+Phương\s+Nam\b/i, /\bGN-\d{3,4}\b/,
  /GiaoL[ẹe]/, /GIAO\s*LẸ/, /\bGL-\d{3,4}\b/,
  /sen\s*vàng\s+(logistics|group|việt\s*nam|jewel)/iu, /(công\s*ty|tập\s*đoàn|tín\s*dụng|tnhh|cổ\s*phần)[^.,;:!?"“”]{0,24}sen\s*vàng/iu,
  // real vehicle models the bible used as working names: Tín's bike and Vân's car stay ids ('dream', 'vios-van'), never text
  /\bDream\b/, /\bVios\b/];
const SPEAKERS = new Set(['narrator', 'system', 'radio', 'tv', 'crowd']);

/**
 * Lints chapter modules against the campaign index: unique ids; mission scripts for every indexed mission of
 * a loaded chapter; step targets, reachability; texts (non-empty, '@keys' present, no placeholders, no real
 * brands, Vietnamese with diacritics); references to evidence, boards, questions, interrogations and cast;
 * that each checkpoint's setup spawns every actor and vehicle the steps of its section use; rewards that
 * do not block; and step minute estimates within ±50% of the mission's minutes. With `engine` (story/contract.ts
 * ENGINE_CONTRACT) every op, query, signal, outfit, model, template, arena, rule, cover, meter, ability, prop kind,
 * carried item, pose, act, input lock, music, sting and weather id must be one the engine implements. A climb
 * entry (kind 'climb') needs its far end `to`.
 */
export function lintContent(index: CampaignIndex, modules: ChapterModule[], opts: { places?: Iterable<string>; engine?: EngineContract } = {}): string[] {
  const out: string[] = [], cat = buildCatalog(index, modules);
  const places = opts.places ? new Set([...opts.places, ...cat.places.keys()]) : null;
  const dup = (what: string, ids: string[]) => { const seen = new Set<string>(); for (const id of ids) { if (seen.has(id)) out.push(`duplicate ${what} id ${id}`); seen.add(id); } };
  dup('mission', modules.flatMap((m) => m.missions.map((x) => x.id)));
  dup('evidence', modules.flatMap((m) => (m.evidence ?? []).map((x) => x.id)));
  dup('cast', modules.flatMap((m) => (m.cast ?? []).map((x) => x.id)));
  dup('board', modules.flatMap((m) => (m.boards ?? []).map((x) => x.id)));
  dup('question', modules.flatMap((m) => (m.questions ?? []).map((x) => x.id)));
  dup('interrogation', modules.flatMap((m) => (m.interrogations ?? []).map((x) => x.id)));
  dup('journal', modules.flatMap((m) => (m.journal ?? []).map((x) => x.id)));
  dup('text key', [...Object.keys(index.text ?? {}), ...modules.flatMap((m) => Object.keys(m.text ?? {}))]);
  const evidence = new Set(cat.evidence.keys());

  const body = (s: string, at: string) => {
    if (PLACEHOLDER_WORDS.test(s)) out.push(`${at}: placeholder text "${s}"`);
    for (const b of FORBIDDEN_BRANDS) if (b.test(s)) out.push(`${at}: real brand name in "${s}"`);
    for (const m of s.matchAll(/\{@([\w.:-]+)\}/g)) if (!cat.text.has(m[1])) out.push(`${at}: missing text key {@${m[1]}}`);
    const words = s.replace(/\{[^}]*\}/g, '').split(/\s+/).filter((w) => /[a-z]/i.test(w));
    if (words.length >= 4 && !/[^\x20-\x7e]/.test(s)) out.push(`${at}: text without Vietnamese diacritics "${s}"`);
  };
  const text = (t: TextRef | undefined, at: string) => {
    if (typeof t !== 'string' || !t.trim()) { out.push(`${at}: empty text`); return; }
    if (t.startsWith('@')) { const v = cat.text.get(t.slice(1)); if (v === undefined) out.push(`${at}: missing text key ${t}`); else body(v, at); }
    else body(t, at);
  };
  for (const [k, v] of cat.text) if (!v.trim()) out.push(`text ${k}: empty`);

  for (const mod of modules) {
    const ch = index.chapters.find((c) => c.n === mod.chapter);
    if (!ch) { out.push(`chapter module ${mod.chapter} is not in the index`); continue; }
    for (const meta of ch.missions) if (!mod.missions.some((m) => m.id === meta.id)) out.push(`${meta.id}: no mission script in chapter ${ch.n}`);
    for (const m of mod.missions) {
      if (!ch.missions.some((x) => x.id === m.id)) out.push(`${m.id}: not listed in chapter ${ch.n} of the index`);
      lintMission(m, cat, evidence, text, out, places, opts.engine ?? null);
    }
  }
  for (const b of cat.boards.values()) {
    out.push(...D.lintBoard(b, evidence));
    if (b.question && !cat.questions.has(b.question)) out.push(`board ${b.id}: unknown question ${b.question}`);
    text(b.title, `board ${b.id}`);
    walkActs(b.reveals, { text }, `board ${b.id}`);
  }
  for (const q of cat.questions.values()) { out.push(...D.lintQuestion(q, evidence)); text(q.prompt, `question ${q.id}`); q.options.forEach((o) => text(o.text, `question ${q.id}`)); }
  for (const d of cat.interrogations.values()) {
    out.push(...I.lintInterrogation(d, evidence));
    if (!cat.cast.has(d.subject)) out.push(`interrogation ${d.id}: unknown subject ${d.subject}`);
    for (const s of d.statements) { text(s.text, `interrogation ${d.id}/${s.id}`); text(s.reply, `interrogation ${d.id}/${s.id}`); if (s.press) text(s.press.text, `interrogation ${d.id}/${s.id}`); }
  }
  for (const e of cat.evidence.values()) { text(e.title, `evidence ${e.id}`); text(e.text, `evidence ${e.id}`); }
  for (const c of cat.cast.values()) text(c.name, `cast ${c.id}`);
  return out;
}

function lintMission(m: MissionDef, cat: Catalog, evidence: Set<string>, text: (t: TextRef | undefined, at: string) => void, out: string[], places: Set<string> | null, engine: EngineContract | null) {
  if (!m.steps.length) { out.push(`${m.id}: no steps`); return; }
  const place = (ref: unknown, at: string) => {
    if (places && typeof ref === 'string' && !ref.includes('/') && !places.has(ref)) out.push(`${at}: unknown place ${ref}`);
    else if (Array.isArray(ref)) ref.forEach((x) => place(x, at));
  };
  const known = (kind: ContractKind, id: string | null | undefined, at: string) => {
    if (engine && typeof id === 'string' && !Object.prototype.hasOwnProperty.call(engine[kind], id)) out.push(`${at}: ${kind} '${id}' is not in the engine contract (story/contract.ts)`);
  };
  const meter = (id: string, at: string) => { if (!METER_PREFIXES.some((p) => id.startsWith(p))) known('meters', id, at); };
  const climb = (x: InteractSpec, at: string) => { if (x.kind !== 'climb') return; if (x.to === undefined) out.push(`${at}: climb ${x.id} has no far end 'to'`); else place(x.to, at); };
  const behaviour = (b: Behaviour | undefined, at: string) => {
    if (!b) return;
    if (b.k === 'goto') place(b.at, at); else if (b.k === 'guard') place(b.post, at); else if (b.k === 'patrol') place(b.route, at);
    else if (b.k === 'act') known('acts', b.name, at);
  };
  place(m.start?.at, m.id);
  known('outfits', m.start?.outfit, m.id); known('weather', m.start?.weather, m.id);
  for (const s of m.steps) {
    for (const x of Array.isArray(s.marker) ? s.marker : s.marker ? [s.marker] : []) place(x.at, `${m.id}/${s.id}`);
    for (const x of s.interact ?? []) { place(x.at, `${m.id}/${s.id}`); climb(x, `${m.id}/${s.id}`); }
    for (const x of s.meters ?? []) if (!x.flag) meter(x.id, `${m.id}/${s.id}`);
  }
  const ids = m.steps.map((s) => s.id), has = (id: string) => ids.includes(id);
  if (new Set(ids).size !== ids.length) out.push(`${m.id}: duplicate step id`);
  if (has('end')) out.push(`${m.id}: step id 'end' is reserved (next: 'end' completes the mission)`);
  const target = (id: string | undefined, at: string) => { if (id !== undefined && id !== 'end' && !has(id)) out.push(`${at}: unknown step ${id}`); };
  const speaker = (who: string, at: string) => { if (!cat.cast.has(who) && !SPEAKERS.has(who)) out.push(`${at}: unknown speaker ${who}`); };
  walkMission(m, {
    text,
    act(a, at) {
      if (a.k === 'goto') target(a.step, at);
      else if (a.k === 'evidence' && !evidence.has(a.id)) out.push(`${at}: unknown evidence ${a.id}`);
      else if ((a.k === 'photoTarget' || a.k === 'clue') && a.evidence && !evidence.has(a.evidence)) out.push(`${at}: unknown evidence ${a.evidence}`);
      else if (a.k === 'board' && !cat.boards.has(a.id)) out.push(`${at}: unknown board ${a.id}`);
      else if (a.k === 'deduce' && !a.q && !cat.questions.has(a.id)) out.push(`${at}: unknown question ${a.id}`);
      else if (a.k === 'interrogate' && !cat.interrogations.has(a.id)) out.push(`${at}: unknown interrogation ${a.id}`);
      else if (a.k === 'journal' && !cat.journal.has(a.id)) out.push(`${at}: unknown journal entry ${a.id}`);
      else if (a.k === 'spawn' && a.cast && !cat.cast.has(a.cast)) out.push(`${at}: unknown cast ${a.cast}`);
      else if (a.k === 'dialogue' || a.k === 'call' || a.k === 'eavesdrop') a.lines.forEach((l) => speaker(l.who, at));
      else if (a.k === 'sms') speaker(a.from, at);
      if (a.k === 'call') speaker(a.from, at);
      if (a.k === 'deduce' && a.q) out.push(...D.lintQuestion(a.q, evidence).map((s) => `${at}: ${s}`));
      if (a.k === 'spawn' || a.k === 'teleport' || a.k === 'marker' || a.k === 'interactable' || a.k === 'prop' || a.k === 'clue') place(a.at, at);
      if (a.k === 'interactable') climb(a, at);
      if (a.k === 'spawn') behaviour(a.behaviour, at); else if (a.k === 'behave') behaviour(a.b, at);
      else if (a.k === 'vehicle') { place(a.at, at); place(a.route, at); } else if (a.k === 'ride') place(a.to, at);
      else if (a.k === 'space' && a.leave !== true) place(a.leave, at);
      if (!engine) return;
      switch (a.k) {
        case 'do': known('ops', a.op, at); break;
        case 'player': known('outfits', a.outfit, at); known('poses', a.pose, at); known('carry', a.carry, at); known('covers', a.cover, at); for (const l of a.lock ?? []) known('locks', l, at); break;
        case 'spawn': known('templates', a.template, at); break;
        case 'vehicle': known('models', a.model, at); break;
        case 'prop': known('props', a.kind, at); break;
        case 'stealth': known('arenas', a.arena, at); known('covers', a.cover, at); for (const k of Object.keys(a.rules ?? {})) known('stealthRules', k, at); break;
        case 'unlock': known('abilities', a.ability, at); known('outfits', a.outfit, at); break;
        case 'music': known('music', a.id, at); break;
        case 'sting': known('stings', a.id, at); break;
        case 'weather': known('weather', a.set, at); break;
      }
    },
    cond(c, at) {
      if (c.k === 'evidence' && !evidence.has(c.id)) out.push(`${at}: unknown evidence ${c.id}`);
      if (c.k === 'reach' || c.k === 'actor' || c.k === 'vehicle') place(c.at, at);
      if (c.k === 'q') known('queries', c.name, at);
      else if (c.k === 'on' && c.ev === 'signal' && c.id !== undefined && engine && !Object.prototype.hasOwnProperty.call(engine.ops, c.id)) known('signals', c.id, at);
      else if (c.k === 'meter' && engine) meter(c.id, at);
      else if (c.k === 'carrying') known('carry', c.item, at);
    },
  });
  for (const s of m.steps) {
    const at = `${m.id}/${s.id}`;
    target(s.next, at); target(s.skipTo, at);
    for (const b of s.branch ?? []) target(b.goto, at);
    for (const f of s.fail ?? []) target(f.skipTo, at);
  }
  for (const f of m.fail ?? []) target(f.skipTo, m.id);
  // reachability from the first step
  const gotos = (acts: Act[] | undefined, into: Set<string>) => walkActs(acts, { act: (a) => { if (a.k === 'goto') into.add(a.step); } }, '');
  const global = new Set<string>();
  gotos(m.setup, global);
  for (const w of m.watchers ?? []) gotos(w.do, global);
  for (const o of m.optional ?? []) gotos(o.reward, global);
  const seen = new Set<string>([m.steps[0].id, ...global]), todo = [...seen];
  while (todo.length) {
    const i = ids.indexOf(todo.pop()!);
    if (i < 0) continue;
    const s = m.steps[i], next = new Set<string>();
    if (s.next !== undefined) next.add(s.next); else if (i + 1 < ids.length) next.add(ids[i + 1]);
    for (const b of s.branch ?? []) next.add(b.goto);
    for (const f of s.fail ?? []) if (f.skipTo) next.add(f.skipTo);
    if (s.skipTo) next.add(s.skipTo);
    for (const l of [s.enter, s.exit, s.retry, typeof s.checkpoint === 'object' ? s.checkpoint.setup : undefined, ...(s.watchers ?? []).map((w) => w.do), ...(s.branch ?? []).map((b) => b.do), ...(s.optional ?? []).map((o) => o.reward)]) gotos(l, next);
    // a failing step's fail card can skip to the next checkpoint
    if ((s.fail ?? []).some((f) => f.allowSkipAfter !== undefined)) { const n = m.steps.findIndex((x, j) => j > i && !!x.checkpoint); if (n >= 0) next.add(ids[n]); }
    for (const n of next) if (n !== 'end' && !seen.has(n)) { seen.add(n); todo.push(n); }
  }
  for (const id of ids) if (!seen.has(id)) out.push(`${m.id}/${id}: unreachable step`);
  // checkpoint coverage: every actor/vehicle a step uses is spawned in its section (or mission-wide)
  const persistent = new Set<string>();
  const spawns = (acts: Act[] | undefined, into: Set<string>) => walkActs(acts, {
    act: (a) => { if (a.k === 'spawn' || (a.k === 'vehicle' && (a.model || a.at)) || (a.k === 'prop' && !a.remove)) into.add(a.id); },
  }, '');
  spawns(m.setup, persistent);
  walkMission(m, { act: (a) => { if ((a.k === 'spawn' || a.k === 'vehicle' || a.k === 'prop') && (a.scope === 'chapter' || a.scope === 'hub')) persistent.add(a.id); } });
  let have = new Set<string>(), section = m.steps[0].id;
  for (const s of m.steps) {
    if (s.checkpoint) { have = new Set(); section = s.id; if (typeof s.checkpoint === 'object') spawns(s.checkpoint.setup, have); }
    const own = new Set<string>(), refs = new Set<string>();
    for (const l of [s.enter, s.exit, ...(s.watchers ?? []).map((w) => w.do), ...(s.branch ?? []).map((b) => b.do), ...(s.optional ?? []).map((o) => o.reward)]) spawns(l, own);
    const ref = (id: string | undefined) => { if (id && id !== 'player') refs.add(id); };
    const one: StepDef = { ...s, checkpoint: typeof s.checkpoint === 'object' ? { ...s.checkpoint, setup: [] } : s.checkpoint };
    walkMission({ id: m.id, steps: [one] }, {
      act(a) {
        if (a.k === 'behave' || (a.k === 'despawn' && a.id)) ref(a.id);
        else if (a.k === 'bark') ref(a.actor);
        else if (a.k === 'tail') ref(a.target);
        else if (a.k === 'vehicle' && !a.model && !a.at) ref(a.id);
        else if (a.k === 'ride') ref(a.driver);
      },
      cond(c) { if (c.k === 'actor' || c.k === 'vehicle') ref(c.id); else if (c.k === 'near') { ref(c.a); ref(c.b); } },
    });
    for (const id of refs) if (!have.has(id) && !own.has(id) && !persistent.has(id)) out.push(`${m.id}/${s.id}: '${id}' is used but not spawned since checkpoint '${section}' (spawn it in that checkpoint's setup)`);
    own.forEach((id) => have.add(id));
  }
  for (const a of m.rewards ?? []) if (isBlocking(a)) out.push(`${m.id}: reward ${a.k} blocks (rewards must be instant)`);
  if (m.chain && !cat.meta.has(m.chain)) out.push(`${m.id}: chains to unknown mission ${m.chain}`);
  for (const r of m.meta?.requires ?? []) if (!cat.meta.has(r)) out.push(`${m.id}: requires unknown mission ${r}`);
  const meta = cat.meta.get(m.id);
  if (meta && m.steps.every((s) => s.minutes !== undefined)) {
    const sum = m.steps.reduce((t, s) => t + (s.minutes ?? 0), 0);
    if (sum < meta.minutes * 0.5 || sum > meta.minutes * 1.5) out.push(`${m.id}: step minutes ${sum} vs ${meta.minutes} planned`);
  }
}
