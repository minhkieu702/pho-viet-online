import type {
  CampaignIndex, Cond, Conscience, ConscienceTier, Difficulty, Flag, Grade, Medal, MissionDef, MissionMeta, MissionStats, Op, Progress, StatName, StoryEvent,
} from './types.ts';

/**
 * Long-lived story progress (pure): flags, evidence, inventory, the LƯƠNG TÂM record (lethal vs non-lethal),
 * grades and medals, mission availability and chapter unlocks, replay sandboxes, the lunar strip and money
 * formatting. Everything here works on plain JSON objects so it saves as is.
 */

/** The family debt in thousands of đồng (the game's cash unit): 40.000.000đ. */
export const DEBT_TOTAL = 40000;
/** Causes that can kill. Anything else (fists, takedowns, a chokehold held too long, throws) only knocks out. */
export const LETHAL_CAUSES: ReadonlySet<string> = new Set(['bullet', 'blast', 'vehicle', 'fall', 'drown', 'fire', 'blade']);
/** Tags of people the hero must never hurt; hurting one is recorded even when nobody dies. */
export const INNOCENT_TAGS: ReadonlySet<string> = new Set(['civilian', 'victim', 'ally', 'bystander', 'innocent']);

export const emptyConscience = (): Conscience => ({ knockouts: 0, kills: 0, restrained: 0, civiliansHurt: 0, byCause: {} });
export const emptyStats = (): MissionStats => ({ ...emptyConscience(), detections: 0, alarms: 0, retries: 0, skipped: 0, seconds: 0, optional: [] });

export function newProgress(opts: { difficulty?: Difficulty; lunar?: { month: number; day: number } } = {}): Progress {
  return {
    completed: [], medals: {}, flags: {}, evidence: [], journal: [], items: {}, abilities: [], outfits: [],
    cash: 0, score: 0, hintTokens: 2, conscience: emptyConscience(),
    board: { links: [], solved: [], proven: [], hinted: [], wrong: 0, streak: 0 },
    deductions: {}, interrogations: {}, seen: [],
    lunar: opts.lunar ?? { month: 7, day: 23 }, chapter: 1, chapterStarts: {},
    debt: { paid: 0, total: DEBT_TOTAL }, playSeconds: 0, difficulty: opts.difficulty ?? 'thuong',
  };
}
/** Deep copy (progress is plain JSON). */
export const cloneProgress = (p: Progress): Progress => JSON.parse(JSON.stringify(p));

// ---- Flags and comparisons ---------------------------------------------------------------------------

export const getFlag = (p: Progress, name: string): Flag => p.flags[name] ?? false;
export function compare(a: Flag | undefined, op: Op, b: Flag): boolean {
  const x = a ?? (typeof b === 'number' ? 0 : typeof b === 'string' ? '' : false);
  if (op === '==') return x === b || (typeof b === 'number' && Number(x) === b);
  if (op === '!=') return !compare(x, '==', b);
  const n = typeof x === 'boolean' ? +x : x, m = typeof b === 'boolean' ? +b : b;
  return op === '<' ? n < m : op === '<=' ? n <= m : op === '>' ? n > m : n >= m;
}
const has = (list: string[], id: string) => list.includes(id);
/** Appends id unless present; true when added. */
export const addOnce = (list: string[], id: string) => { if (has(list, id)) return false; list.push(id); return true; };

/**
 * Conditions that depend on progress alone (no mission, no world): usable by the hub, the menu and the
 * runner. Anything else answers `undefined` so callers can route it elsewhere.
 */
export function testProgress(c: Cond, p: Progress): boolean | undefined {
  switch (c.k) {
    case 'always': return true;
    case 'never': return false;
    case 'not': { const r = testProgress(c.c, p); return r === undefined ? undefined : !r; }
    case 'all': { let r: boolean | undefined = true; for (const x of c.of) { const v = testProgress(x, p); if (v === undefined) return undefined; r = r && v; } return r; }
    case 'any': { let r: boolean | undefined = false; for (const x of c.of) { const v = testProgress(x, p); if (v === undefined) return undefined; r = r || v; } return r; }
    case 'flag': return c.op ? compare(p.flags[c.name], c.op, c.eq ?? true) : c.eq === undefined ? !!p.flags[c.name] : compare(p.flags[c.name], '==', c.eq);
    case 'evidence': return has(p.evidence, c.id);
    case 'item': return (p.items[c.id] ?? 0) >= (c.n ?? 1);
    case 'ability': return has(p.abilities, c.id);
    case 'done': return has(p.completed, c.mission);
    case 'seen': return has(p.seen, c.cutscene);
    case 'solved': return has(p.board.solved, c.board);
    case 'deduced': { const d = p.deductions[c.id]; return !!d?.answer && (!c.firstTry || d.tries === 1); }
    case 'difficulty': return p.difficulty === c.is;
    case 'conscience': return conscienceTier(p.conscience) === c.is;
    case 'stat': return c.scope === 'campaign' ? compare(statOf(p.conscience, c.name), c.op, c.value) : undefined;
    default: return undefined;
  }
}
export const statOf = (s: Partial<MissionStats>, name: StatName) => (s[name] as number | undefined) ?? 0;

// ---- LƯƠNG TÂM ---------------------------------------------------------------------------------------

export type Harm = 'ko' | 'kill' | 'restrain' | 'hurt' | null;
/**
 * Books one harm event into the mission stats and the campaign record. A 'kill' with a non-lethal cause is a
 * knockout: over-squeezing a chokehold makes noise or lets the guard wake, it never kills. Innocents (tags in
 * INNOCENT_TAGS) hurt or killed by the player are counted separately. 'takedown' is the move, not the result,
 * so only 'knockout'/'kill'/'restrain'/'hurt' are booked.
 */
export function recordHarm(e: StoryEvent, stats: Conscience, campaign: Conscience): Harm {
  const cause = typeof e.cause === 'string' ? e.cause : e.type === 'kill' ? 'unknown' : 'fist';
  const innocent = !!e.tag && INNOCENT_TAGS.has(e.tag);
  const both = (f: (c: Conscience) => void) => { f(stats); f(campaign); };
  if (e.type === 'restrain') { both((c) => c.restrained++); return 'restrain'; }
  if (e.type === 'hurt') { if (!innocent) return null; both((c) => c.civiliansHurt++); return 'hurt'; }
  if (e.type === 'knockout' || (e.type === 'kill' && !LETHAL_CAUSES.has(cause) && cause !== 'unknown')) {
    both((c) => { c.knockouts++; if (innocent) c.civiliansHurt++; });
    return 'ko';
  }
  if (e.type !== 'kill') return null;
  both((c) => { c.kills++; c.byCause[cause] = (c.byCause[cause] ?? 0) + 1; if (innocent) c.civiliansHurt++; });
  return 'kill';
}
/** 'clean': nobody killed or innocent hurt; 'stained': 1–3; 'lost': more. Mentors' last lines read this. */
export function conscienceTier(c: Conscience): ConscienceTier {
  const bad = c.kills + c.civiliansHurt;
  return bad === 0 ? 'clean' : bad <= 3 ? 'stained' : 'lost';
}

// ---- Grades and medals -------------------------------------------------------------------------------

/**
 * score = 100 − 15·detections − 25·kills − 10·innocents hurt − 5·alarms − 10·skips + 5·optional clues
 * (+10 at or under par). A ≥ 85, B ≥ 70, C ≥ 50, else D; a skipped section caps the grade at C.
 * Medals: Bóng ma (no detection, offered by the mission), Lương tâm (no kill), Thần tốc (par), Mắt cú (all clues).
 */
export function gradeMission(stats: MissionStats, def: MissionDef | undefined, evidence: string[]): Grade {
  const m = def?.medals ?? {};
  const fast = m.par !== undefined && stats.seconds <= m.par && stats.skipped === 0;
  const clues = m.clues ?? [];
  const eye = clues.length > 0 && clues.every((id) => stats.optional.includes(id) || evidence.includes(id));
  let score = 100 - 15 * stats.detections - 25 * stats.kills - 10 * stats.civiliansHurt - 5 * stats.alarms - 10 * stats.skipped
    + 5 * stats.optional.length + (fast ? 10 : 0);
  score = Math.max(0, Math.min(100, score));
  let grade: Medal['grade'] = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  if (stats.skipped > 0 && (grade === 'A' || grade === 'B')) grade = 'C';
  const ghost = !!m.ghost && stats.detections === 0 && stats.skipped === 0;
  const tokens = grade === 'A' || stats.optional.length > 0 ? 1 : 0;
  return { score, grade, ghost, nonLethal: stats.kills === 0, fast, eye, tokens };
}
const RANK = { A: 4, B: 3, C: 2, D: 1 } as const;
/** Keeps the best of each: grade, medals ever earned, fastest time; counts plays. */
export function bestMedal(prev: Medal | undefined, m: Medal): Medal {
  if (!prev) return { ...m };
  return {
    grade: RANK[m.grade] > RANK[prev.grade] ? m.grade : prev.grade,
    ghost: prev.ghost || m.ghost, nonLethal: prev.nonLethal || m.nonLethal, fast: prev.fast || m.fast, eye: prev.eye || m.eye,
    bestSeconds: Math.min(prev.bestSeconds, m.bestSeconds), plays: prev.plays + m.plays,
  };
}
export const mergeMedal = (prev: Medal | undefined, g: Grade, seconds: number): Medal =>
  bestMedal(prev, { grade: g.grade, ghost: g.ghost, nonLethal: g.nonLethal, fast: g.fast, eye: g.eye, bestSeconds: seconds, plays: 1 });

// ---- Campaign order, availability, chapter unlocks ---------------------------------------------------

export type OrderedMission = MissionMeta & { chapter: number; order: number };
export function missionOrder(index: CampaignIndex): OrderedMission[] {
  const out: OrderedMission[] = [];
  for (const ch of index.chapters) for (const m of ch.missions) out.push({ ...m, chapter: ch.n, order: out.length });
  return out;
}
export const chapterOf = (index: CampaignIndex, mission: string) => index.chapters.find((c) => c.missions.some((m) => m.id === mission))?.n ?? 0;
/** Chapter 1 is open; chapter n opens when every mission of chapter n−1 is done. */
export function chapterUnlocked(index: CampaignIndex, p: Progress, n: number): boolean {
  if (n <= 1) return true;
  const prev = index.chapters.find((c) => c.n === n - 1);
  return !prev || prev.missions.every((m) => has(p.completed, m.id));
}
/** Game hour inside [from, to), wrapping past midnight ([22, 3] means 22:00–03:00). */
export const hoursOpen = (h: [number, number] | undefined, hour: number) =>
  !h ? true : h[0] <= h[1] ? hour >= h[0] && hour < h[1] : hour >= h[0] || hour < h[1];

export type Availability = { id: string; chapter: number; title: string; state: 'open' | 'later' | 'locked' | 'done'; opensAt?: number; giver?: string };
/**
 * Every mission with its state for the hub and chapter select: 'done', 'open' (prerequisites met, chapter
 * unlocked, flags gate passed, inside its hours), 'later' (only the hours are missing; opensAt is the hour),
 * or 'locked'. Prerequisites default to the previous mission in campaign order.
 */
export function availability(index: CampaignIndex, p: Progress, hour = 12): Availability[] {
  const all = missionOrder(index);
  return all.map((m, i) => {
    const base = { id: m.id, chapter: m.chapter, title: m.title, giver: m.giver };
    if (has(p.completed, m.id)) return { ...base, state: 'done' as const };
    const req = m.requires ?? (i > 0 ? [all[i - 1].id] : []);
    const ok = chapterUnlocked(index, p, m.chapter) && req.every((r) => has(p.completed, r)) && (!m.when || testProgress(m.when, p) === true);
    if (!ok) return { ...base, state: 'locked' as const };
    return hoursOpen(m.hours, hour) ? { ...base, state: 'open' as const } : { ...base, state: 'later' as const, opensAt: m.hours![0] };
  });
}
export const nextMissions = (index: CampaignIndex, p: Progress, hour = 12) => availability(index, p, hour).filter((a) => a.state === 'open' || a.state === 'later');
/** Share of the campaign done (0..1) for the slot summary 'Chương 3 · 47%'. */
export const percentDone = (index: CampaignIndex, p: Progress) => {
  const all = missionOrder(index);
  return all.length ? all.filter((m) => has(p.completed, m.id)).length / all.length : 0;
};

/** Remembers the progress at the first entry into chapter n (replay starts from it). Returns true if new. */
export function markChapterStart(p: Progress, n: number): boolean {
  p.chapter = Math.max(p.chapter, n);
  if (p.chapterStarts[n]) return false;
  const snap = cloneProgress({ ...p, chapterStarts: {}, medals: {} });
  p.chapterStarts[n] = snap;
  return true;
}
/**
 * A sandbox for 'Chơi lại': the chapter-start progress, every earlier mission marked done, plus what the
 * mission's `replay` block declares. Nothing from it reaches the main slot except medals (mergeReplay).
 */
export function replaySandbox(main: Progress, index: CampaignIndex, mission: string, def?: MissionDef): Progress {
  const ch = chapterOf(index, mission);
  const box = cloneProgress(main.chapterStarts[ch] ?? newProgress({ difficulty: main.difficulty }));
  box.chapterStarts = {}; box.medals = {}; box.difficulty = main.difficulty; box.chapter = Math.max(box.chapter, ch);
  for (const m of missionOrder(index)) { if (m.id === mission) break; addOnce(box.completed, m.id); }
  const r = def?.replay;
  if (r) {
    Object.assign(box.flags, r.flags ?? {});
    for (const [k, n] of Object.entries(r.items ?? {})) box.items[k] = Math.max(box.items[k] ?? 0, n);
    for (const e of r.evidence ?? []) addOnce(box.evidence, e);
    for (const a of r.abilities ?? []) addOnce(box.abilities, a);
  }
  return box;
}
/** Only medals, best times and play time flow from a replay back into the main progress. */
export function mergeReplay(main: Progress, box: Progress, mission: string, seconds: number): Progress {
  const m = box.medals[mission];
  if (m) main.medals[mission] = bestMedal(main.medals[mission], m);
  main.playSeconds += seconds;
  return main;
}

// ---- Lunar strip and money ---------------------------------------------------------------------------

const MONTHS = ['', 'GIÊNG', 'HAI', 'BA', 'TƯ', 'NĂM', 'SÁU', 'BẢY', 'TÁM', 'CHÍN', 'MƯỜI', 'MƯỜI MỘT', 'CHẠP'];
/** 'MÙNG 10 THÁNG TÁM' · 'CÒN 5 NGÀY TỚI RẰM' (the countdown runs through the eighth month only). */
export function lunarLabel(l: { month: number; day: number }): { date: string; countdown: string } {
  const m = MONTHS[l.month] ?? String(l.month), d = l.day;
  const date = d === 15 ? `RẰM THÁNG ${m}` : d <= 10 ? `MÙNG ${d} THÁNG ${m}` : `${d} THÁNG ${m}`;
  const left = l.month === 8 ? 15 - d : -1;
  const countdown = left > 1 ? `CÒN ${left} NGÀY TỚI RẰM` : left === 1 ? 'MAI LÀ RẰM' : left === 0 ? 'ĐÊM RẰM' : '';
  return { date, countdown };
}
/** Thousands of đồng (the game's cash unit) as '1.350.000đ'. */
export function formatDong(thousands: number): string {
  const v = Math.round(thousands * 1000), s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${v < 0 ? '-' : ''}${s}đ`;
}
