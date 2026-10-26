import type { CampaignIndex, Conscience, Difficulty, Flag, Medal, MissionStats, Progress, StoryEvent } from './types.ts';
import type { CheckpointSave, Live, StorySave } from './runner.ts';
import { DEBT_TOTAL, chapterOf, emptyConscience, emptyStats, newProgress, percentDone } from './flags.ts';

/**
 * Story saves (pure apart from the injected storage). One JSON file under 'pvo-story' holds three slots, the
 * last used slot and the story settings. Every storage access is wrapped in try/catch; when storage is missing
 * or throws (private mode, previews) the store keeps the data in memory and reports `blocked` so the UI can
 * warn once. Reading migrates old versions step by step (v0 = the unslotted prototype blob) and sanitizes:
 * wrong types become defaults, numbers are clamped, unknown ids (content removed later) are dropped, and a
 * checkpoint of a mission that no longer exists falls back to the hub. A corrupt or newer file is copied to
 * 'pvo-story-bak' before anything overwrites it. Writes are throttled (default one per 2 s; force skips it).
 */

export const SAVE_KEY = 'pvo-story';
export const BACKUP_KEY = 'pvo-story-bak';
export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;
export const BLOCKED_TEXT = 'Trình duyệt chặn lưu trữ: tiến độ chỉ giữ trong phiên này.';

export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void };
export type SaveSettings = { subtitles: 's' | 'm' | 'l'; skipSeen: boolean; holdToSkip: boolean; difficulty: Difficulty };
export type Slot = {
  createdAt: number; updatedAt: number; label: string; chapter: number; mission: string | null;
  progress: Progress; checkpoint: CheckpointSave | null;
  /** Engine-side snapshot (player pose, bike, hour, weather), opaque here. */
  director: unknown;
};
export type SaveFile = { version: typeof SAVE_VERSION; slots: (Slot | null)[]; last: number; settings: SaveSettings };
export type KnownIds = { missions?: Iterable<string>; evidence?: Iterable<string> };
export type DecodeStatus = 'ok' | 'empty' | 'migrated' | 'corrupt' | 'future';

export const defaultSettings = (): SaveSettings => ({ subtitles: 'm', skipSeen: true, holdToSkip: true, difficulty: 'thuong' });
export const emptySave = (): SaveFile => ({ version: SAVE_VERSION, slots: Array(SLOT_COUNT).fill(null), last: 0, settings: defaultSettings() });

// ---- Sanitizing --------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const obj = (x: unknown): Raw | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Raw) : null);
const num = (x: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const int = (x: unknown, d: number, lo = -Infinity, hi = Infinity) => Math.round(num(x, d, lo, hi));
const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
const str = (x: unknown, d: string) => (typeof x === 'string' ? x : d);
const oneOf = <T extends string>(x: unknown, list: readonly T[], d: T): T => (list.includes(x as T) ? (x as T) : d);
const flagValue = (x: unknown): x is Flag => typeof x === 'boolean' || typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x));
function strings(x: unknown, keep?: Set<string>): string[] {
  if (!Array.isArray(x)) return [];
  return [...new Set(x.filter((s): s is string => typeof s === 'string' && (!keep || keep.has(s))))];
}
function record<T>(x: unknown, f: (v: unknown, k: string) => T | undefined): Record<string, T> {
  const o = obj(x), out: Record<string, T> = {};
  if (o) for (const [k, v] of Object.entries(o)) { const r = f(v, k); if (r !== undefined) out[k] = r; }
  return out;
}
const flags = (x: unknown) => record(x, (v) => (flagValue(v) ? v : undefined));
type Sets = { missions?: Set<string>; evidence?: Set<string> };

function conscience(x: unknown): Conscience {
  const o = obj(x) ?? {}, d = emptyConscience();
  return {
    knockouts: int(o.knockouts, 0, 0, 1e6), kills: int(o.kills, 0, 0, 1e6), restrained: int(o.restrained, 0, 0, 1e6),
    civiliansHurt: int(o.civiliansHurt, 0, 0, 1e6), byCause: { ...d.byCause, ...record(o.byCause, (v) => (typeof v === 'number' && v >= 0 ? Math.round(v) : undefined)) },
  };
}
function medal(x: unknown): Medal | undefined {
  const o = obj(x);
  if (!o) return undefined;
  return {
    grade: oneOf(o.grade, ['A', 'B', 'C', 'D'] as const, 'D'), ghost: bool(o.ghost, false), nonLethal: bool(o.nonLethal, false),
    fast: bool(o.fast, false), eye: bool(o.eye, false), bestSeconds: num(o.bestSeconds, 0, 0, 1e7), plays: int(o.plays, 1, 1, 1e6),
  };
}
/** A clean Progress from anything: defaults for what is missing or wrong, unknown missions/evidence dropped. */
export function sanitizeProgress(x: unknown, sets: Sets = {}, depth = 0): Progress {
  const o = obj(x) ?? {}, d = newProgress(), b = obj(o.board) ?? {}, l = obj(o.lunar) ?? {}, debt = obj(o.debt) ?? {};
  const total = int(debt.total, DEBT_TOTAL, 1, 1e9);
  return {
    completed: strings(o.completed, sets.missions),
    medals: record(o.medals, (v, k) => (!sets.missions || sets.missions.has(k) ? medal(v) : undefined)),
    flags: flags(o.flags), evidence: strings(o.evidence, sets.evidence), journal: strings(o.journal),
    items: record(o.items, (v) => (typeof v === 'number' && v > 0 ? Math.min(9999, Math.round(v)) : undefined)),
    abilities: strings(o.abilities), outfits: strings(o.outfits),
    cash: num(o.cash, 0, 0, 1e9), score: int(o.score, 0, -1e9, 1e9), hintTokens: int(o.hintTokens, d.hintTokens, 0, 99),
    conscience: conscience(o.conscience),
    board: {
      links: strings(b.links).filter((k) => k.includes('|')), solved: strings(b.solved), proven: strings(b.proven), hinted: strings(b.hinted),
      wrong: int(b.wrong, 0, 0, 1e6), streak: int(b.streak, 0, 0, 1e6),
    },
    deductions: record(o.deductions, (v) => { const q = obj(v); return q ? { answer: str(q.answer, ''), tries: int(q.tries, 0, 0, 1e6) } : undefined; }),
    interrogations: record(o.interrogations, (v) => {
      const q = obj(v);
      return q ? { wrong: int(q.wrong, 0, 0, 1e6), bluffs: int(q.bluffs, 0, 0, 1e6), empathy: int(q.empathy, 0, 0, 1e6), trust: int(q.trust, 0, -1e6, 1e6) } : undefined;
    }),
    seen: strings(o.seen),
    lunar: { month: int(l.month, d.lunar.month, 1, 12), day: int(l.day, d.lunar.day, 1, 30) },
    chapter: int(o.chapter, 1, 1, 99),
    chapterStarts: depth > 0 ? {} : record(o.chapterStarts, (v, k) => (/^\d+$/.test(k) && obj(v) ? sanitizeProgress(v, sets, depth + 1) : undefined)),
    debt: { paid: num(debt.paid, 0, 0, total), total },
    playSeconds: num(o.playSeconds, 0, 0, 1e9), difficulty: oneOf(o.difficulty, ['de', 'thuong', 'kho'] as const, 'thuong'),
  };
}
function stats(x: unknown): MissionStats {
  const o = obj(x) ?? {}, s = emptyStats();
  return {
    ...conscience(o), detections: int(o.detections, 0, 0, 1e6), alarms: int(o.alarms, 0, 0, 1e6), retries: int(o.retries, 0, 0, 1e6),
    skipped: int(o.skipped, 0, 0, 1e6), seconds: num(o.seconds, s.seconds, 0, 1e9), optional: strings(o.optional),
  };
}
const place = (x: unknown) => { if (typeof x === 'string') return x; const o = obj(x); return o && typeof o.x === 'number' && typeof o.z === 'number' ? { x: o.x, z: o.z } : undefined; };
function live(x: unknown): Live {
  const o = obj(x) ?? {}, env = obj(o.env) ?? {}, w = obj(env.weather);
  const scope = (v: unknown) => oneOf(v, ['step', 'mission', 'chapter', 'hub'] as const, 'mission');
  const list = <T>(v: unknown, f: (r: Raw) => T | undefined) => (Array.isArray(v) ? v.map((e) => { const r = obj(e); return r ? f(r) : undefined; }).filter((e): e is T => e !== undefined) : []);
  return {
    objective: typeof o.objective === 'string' ? o.objective : null,
    // subs carry content conditions; they are re-derived from the step when the checkpoint is entered
    subs: null,
    markers: list(o.markers, (r) => { const at = place(r.at); return typeof r.id === 'string' && at !== undefined ? { id: r.id, at, label: typeof r.label === 'string' ? r.label : undefined, scope: scope(r.scope) } : undefined; }),
    interacts: list(o.interacts, (r) => {
      const at = place(r.at);
      return typeof r.id === 'string' && at !== undefined && typeof r.prompt === 'string'
        ? { id: r.id, at, prompt: r.prompt, r: typeof r.r === 'number' ? r.r : undefined, hold: typeof r.hold === 'number' ? r.hold : undefined, once: typeof r.once === 'boolean' ? r.once : undefined, scope: scope(r.scope) } : undefined;
    }),
    timers: list(o.timers, (r) => (typeof r.id === 'string' ? { id: r.id, left: num(r.left, 0, 0, 1e6), label: typeof r.label === 'string' ? r.label : undefined, fail: typeof r.fail === 'string' ? r.fail : undefined, scope: scope(r.scope) } : undefined)),
    env: {
      policy: obj(env.policy) ? JSON.parse(JSON.stringify(env.policy)) : {},
      hour: typeof env.hour === 'number' && Number.isFinite(env.hour) ? env.hour : undefined,
      weather: w && typeof w.set === 'string' ? { set: w.set, lock: typeof w.lock === 'boolean' ? w.lock : undefined } : undefined,
      space: typeof env.space === 'string' ? env.space : null,
    },
  };
}
const emptyLive = (): Live => ({ objective: null, subs: null, markers: [], interacts: [], timers: [], env: { policy: {} } });
/** A clean checkpoint, or null when it cannot be resumed (unknown mission, no step). */
export function sanitizeCheckpoint(x: unknown, sets: Sets = {}): CheckpointSave | null {
  const o = obj(x);
  if (!o || typeof o.mission !== 'string' || (sets.missions && !sets.missions.has(o.mission))) return null;
  return {
    v: 1, mission: o.mission, step: str(o.step, ''), start: bool(o.start, false) || typeof o.step !== 'string',
    vars: flags(o.vars), stats: stats(o.stats),
    history: Array.isArray(o.history) ? o.history.map((e) => obj(e)).filter((e): e is Raw => !!e && typeof e.type === 'string').map((e) => flags(e) as StoryEvent) : [],
    fired: record(o.fired, (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)),
    live: live(o.live), rng: int(o.rng, 0, 0, 0xffffffff) >>> 0, mt: num(o.mt, 0, 0, 1e9),
  };
}
function slot(x: unknown, sets: Sets): Slot | null {
  const o = obj(x);
  if (!o) return null;
  const progress = sanitizeProgress(o.progress, sets);
  const checkpoint = sanitizeCheckpoint(o.checkpoint, sets);
  return {
    createdAt: num(o.createdAt, 0, 0), updatedAt: num(o.updatedAt, 0, 0), label: str(o.label, ''), chapter: int(o.chapter, progress.chapter, 1, 99),
    mission: checkpoint?.mission ?? null, progress, checkpoint, director: checkpoint ? o.director ?? null : null,
  };
}
export function sanitize(x: unknown, known: KnownIds = {}): SaveFile {
  const o = obj(x) ?? {}, s = obj(o.settings) ?? {}, d = defaultSettings();
  const sets: Sets = { missions: known.missions ? new Set(known.missions) : undefined, evidence: known.evidence ? new Set(known.evidence) : undefined };
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => (Array.isArray(o.slots) ? slot(o.slots[i], sets) : null));
  return {
    version: SAVE_VERSION, slots, last: int(o.last, 0, 0, SLOT_COUNT - 1),
    settings: {
      subtitles: oneOf(s.subtitles, ['s', 'm', 'l'] as const, d.subtitles), skipSeen: bool(s.skipSeen, d.skipSeen),
      holdToSkip: bool(s.holdToSkip, d.holdToSkip), difficulty: oneOf(s.difficulty, ['de', 'thuong', 'kho'] as const, d.difficulty),
    },
  };
}

// ---- Versions and migration --------------------------------------------------------------------------

/** 0 for the prototype blob (no version, no slots), the stored version otherwise, -1 when unrecognisable. */
export function versionOf(x: unknown): number {
  const o = obj(x);
  if (!o) return -1;
  if (typeof o.version === 'number') return o.version;
  return 'completed' in o || 'flags' in o || 'mission' in o ? 0 : -1;
}
/**
 * v0 → v1: the prototype stored one progress blob {completed, flags, evidence, cash, seconds, chapter,
 * mission?, step?} at the top level. It becomes slot 1 (index 0); a running mission resumes at its step.
 */
function v0to1(o: Raw): Raw {
  const progress = { completed: o.completed, flags: o.flags, evidence: o.evidence, cash: o.cash, playSeconds: o.seconds, chapter: o.chapter, seen: o.seen };
  const checkpoint = typeof o.mission === 'string'
    ? { v: 1, mission: o.mission, step: o.step, start: typeof o.step !== 'string', vars: {}, stats: emptyStats(), history: [], fired: {}, live: emptyLive(), rng: 0, mt: 0 } : null;
  return { version: 1, last: 0, settings: defaultSettings(), slots: [{ createdAt: 0, updatedAt: 0, label: '', chapter: o.chapter ?? 1, progress, checkpoint, director: null }, null, null] };
}
/** Each entry upgrades a file from its version to the next. */
export const MIGRATIONS: Record<number, (o: Raw) => Raw> = { 0: v0to1 };
export function migrate(x: unknown): { raw: Raw | null; from: number; status: DecodeStatus } {
  let v = versionOf(x);
  if (v < 0) return { raw: null, from: v, status: 'corrupt' };
  if (v > SAVE_VERSION) return { raw: null, from: v, status: 'future' };
  const from = v;
  let o = obj(x)!;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return { raw: null, from, status: 'corrupt' };
    o = step(o); v = versionOf(o);
  }
  return { raw: o, from, status: from < SAVE_VERSION ? 'migrated' : 'ok' };
}
/** Text from storage → a clean SaveFile and how it went. */
export function decode(text: string | null, known: KnownIds = {}): { file: SaveFile; from: number; status: DecodeStatus } {
  if (text === null || text === '') return { file: emptySave(), from: SAVE_VERSION, status: 'empty' };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { file: emptySave(), from: -1, status: 'corrupt' }; }
  const m = migrate(parsed);
  if (!m.raw) return { file: emptySave(), from: m.from, status: m.status };
  return { file: sanitize(m.raw, known), from: m.from, status: m.status };
}
export const encode = (f: SaveFile) => JSON.stringify(f);

// ---- Slots -------------------------------------------------------------------------------------------

/** 'Chương 4 · Tấm ảnh trong sổ' while a mission is saved, 'Chương 4 · Tự do' in the hub. */
export function slotLabel(index: CampaignIndex | undefined, save: StorySave): string {
  const mission = save.checkpoint?.mission ?? null;
  const ch = mission && index ? chapterOf(index, mission) || save.progress.chapter : save.progress.chapter;
  const title = mission && index ? index.chapters.flatMap((c) => c.missions).find((m) => m.id === mission)?.title : undefined;
  return `Chương ${ch} · ${title ?? 'Tự do'}`;
}
export const toStorySave = (s: Slot): StorySave => ({ progress: s.progress, checkpoint: s.checkpoint });
export type SlotSummary = { slot: number; empty: boolean; label: string; chapter: number; percent: number; updatedAt: number; playSeconds: number };

export type SaveStoreOptions = { now?: () => number; throttleMs?: number; known?: KnownIds; index?: CampaignIndex; key?: string };
/**
 * Slot storage over a localStorage-like object (or null). read() loads and repairs the file; write() stores a
 * slot from runner.snapshot() and returns 'saved', 'queued' (throttled, written by flush) or 'memory' (storage
 * blocked: kept for this session only).
 */
export function createSaveStore(storage: StorageLike | null | undefined, opts: SaveStoreOptions = {}) {
  const key = opts.key ?? SAVE_KEY, now = opts.now ?? (() => Date.now()), throttle = opts.throttleMs ?? 2000;
  let blocked = !storage, memory: string | null = null, file = emptySave(), status: DecodeStatus = 'empty', last = -Infinity, dirty = false;
  function get(k: string): string | null {
    if (!blocked) try { return storage!.getItem(k); } catch { blocked = true; }
    return k === key ? memory : null;
  }
  function put(k: string, v: string): boolean {
    if (k === key) memory = v;
    if (blocked) return false;
    try { storage!.setItem(k, v); return true; } catch { blocked = true; return false; }
  }
  function read(): SaveFile {
    const text = get(key), r = decode(text, opts.known);
    if ((r.status === 'corrupt' || r.status === 'future') && text) put(BACKUP_KEY, text);
    file = r.file; status = r.status;
    return file;
  }
  function flush(): 'saved' | 'memory' {
    dirty = false; last = now();
    return put(key, encode(file)) ? 'saved' : 'memory';
  }
  function commit(force: boolean): 'saved' | 'queued' | 'memory' {
    if (!force && now() - last < throttle) { dirty = true; return 'queued'; }
    return flush();
  }
  function write(i: number, save: StorySave, o: { director?: unknown; force?: boolean } = {}): 'saved' | 'queued' | 'memory' {
    const at = Math.max(0, Math.min(SLOT_COUNT - 1, Math.round(i))), prev = file.slots[at], t = now();
    file.slots[at] = {
      createdAt: prev?.createdAt ?? t, updatedAt: t, label: slotLabel(opts.index, save),
      chapter: save.checkpoint?.mission && opts.index ? chapterOf(opts.index, save.checkpoint.mission) || save.progress.chapter : save.progress.chapter,
      mission: save.checkpoint?.mission ?? null, progress: JSON.parse(JSON.stringify(save.progress)),
      checkpoint: save.checkpoint ? JSON.parse(JSON.stringify(save.checkpoint)) : null, director: save.checkpoint ? o.director ?? null : null,
    };
    file.last = at;
    return commit(!!o.force);
  }
  return {
    read, write, flush: () => (dirty ? flush() : blocked ? 'memory' as const : 'saved' as const),
    /** True once storage is missing or threw: show BLOCKED_TEXT once. */
    get blocked() { return blocked; },
    /** How the last read went ('corrupt'/'future' files were backed up under BACKUP_KEY). */
    get status() { return status; },
    get pending() { return dirty; },
    file: () => file,
    slot: (i: number) => file.slots[i] ?? null,
    remove(i: number) { if (file.slots[i]) { file.slots[i] = null; flush(); } },
    settings(patch?: Partial<SaveSettings>) { if (patch) { file.settings = { ...file.settings, ...patch }; commit(true); } return file.settings; },
    summaries(): SlotSummary[] {
      return file.slots.map((s, i) => s
        ? { slot: i, empty: false, label: s.label, chapter: s.chapter, percent: opts.index ? Math.round(percentDone(opts.index, s.progress) * 100) : 0, updatedAt: s.updatedAt, playSeconds: s.progress.playSeconds }
        : { slot: i, empty: true, label: '', chapter: 0, percent: 0, updatedAt: 0, playSeconds: 0 });
    },
  };
}
export type SaveStore = ReturnType<typeof createSaveStore>;
