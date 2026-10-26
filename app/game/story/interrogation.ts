import type { InterrogationDef, StatementDef, TextRef } from './types.ts';

/**
 * Present-evidence interrogation table (pure), as in c8-m1 with Diễm. The subject makes statements one at a
 * time. A lie is settled by presenting a card that contradicts it ('accuse'); a true statement is settled by
 * showing understanding with the right card ('empathy'), and accusing someone who tells the truth hurts
 * (trust drops, the subject goes quiet). Pressing ("Nói rõ hơn đi") raises pressure and may give a line that
 * points at a card or opens a hidden statement. A bluff (claiming proof you do not show) works only on a lie
 * whose `bluff` threshold the pressure has reached; a called bluff costs a longer silence. Mistakes never
 * fail: they cost seconds of silence (`shutdown`), the clock is advanced by tickInterrogation. Settling every
 * statement ends the session with an outcome (trust, empathy, perfect) that later lines can read.
 */

export type Approach = 'accuse' | 'empathy';
export type Settle = 'card' | 'empathy' | 'bluff';
export type InterrogationState = {
  id: string;
  /** Statement ids in play order; hidden ones are inserted after the current one when a press unlocks them. */
  order: string[]; at: number;
  settled: Record<string, Settle>;
  pressure: number; trust: number; wrong: number; bluffs: number; called: number;
  presses: Record<string, number>;
  /** Seconds of silence left; the clock only moves through tickInterrogation. */
  silent: number; clock: number; done: boolean;
  log: { t: number; who: 'subject' | 'hero'; text: TextRef; card?: string }[];
};
export type ReplyResult = 'contradiction' | 'understood' | 'wrong' | 'hurt' | 'deflect' | 'pressed' | 'bluffed' | 'called' | 'silent' | 'missing' | 'done';
export type Reply = { result: ReplyResult; line: TextRef; silent: number; settled?: string; unlocked?: string; hint?: string; done: boolean };

/** Neutral stage directions used when a statement has no authored line. */
export const DEFAULT_LINES = {
  wrong: '(Im lặng, quay mặt đi.)', press: '(Ngập ngừng, không nói thêm.)', called: '(Không tin. Khoanh tay im lặng.)',
  silent: '(Vẫn im lặng.)', deflect: '(Gạt đi, không trả lời.)', hurt: '(Mắt đỏ hoe, không nói nữa.)',
} as const;
const PRESS_LIE = 0.15, PRESS_TRUE = 0.1, CONTRADICT = 0.25, CALM = 0.25, CALLED_RELIEF = 0.2;

export function startInterrogation(def: InterrogationDef): InterrogationState {
  return {
    id: def.id, order: def.statements.filter((s) => !s.hidden).map((s) => s.id), at: 0, settled: {},
    pressure: 0, trust: 0, wrong: 0, bluffs: 0, called: 0, presses: {}, silent: 0, clock: 0, done: def.statements.length === 0, log: [],
  };
}
const stmt = (def: InterrogationDef, id: string | undefined) => def.statements.find((s) => s.id === id);
/** The statement on the table, or null when finished. */
export const currentStatement = (def: InterrogationDef, s: InterrogationState): StatementDef | null => (s.done ? null : stmt(def, s.order[s.at]) ?? null);

export function tickInterrogation(s: InterrogationState, dt: number) {
  s.clock += dt;
  s.silent = Math.max(0, s.silent - dt);
}
function say(s: InterrogationState, text: TextRef, who: 'subject' | 'hero' = 'subject', card?: string) { s.log.push({ t: s.clock, who, text, card }); }
function quiet(s: InterrogationState, seconds: number) { s.silent = Math.max(s.silent, seconds); }
function advance(s: InterrogationState) {
  while (s.at < s.order.length && s.settled[s.order[s.at]]) s.at++;
  s.done = s.at >= s.order.length;
}
function settle(s: InterrogationState, st: StatementDef, how: Settle): Partial<Reply> {
  s.settled[st.id] = how;
  advance(s);
  return { settled: st.id };
}
const reply = (s: InterrogationState, result: ReplyResult, line: TextRef, extra: Partial<Reply> = {}): Reply =>
  ({ result, line, silent: s.silent, done: s.done, ...extra });
function guard(def: InterrogationDef, s: InterrogationState): Reply | StatementDef {
  const st = currentStatement(def, s);
  if (!st) return reply(s, 'done', '');
  if (s.silent > 0) return reply(s, 'silent', DEFAULT_LINES.silent);
  return st;
}

/** Presents an owned card, accusing or showing understanding. */
export function present(def: InterrogationDef, s: InterrogationState, card: string, approach: Approach, owned: (id: string) => boolean): Reply {
  const st = guard(def, s);
  if (!('kind' in st)) return st;
  if (!owned(card)) return reply(s, 'missing', '');
  say(s, card, 'hero', card);
  const fits = st.cards.includes(card), shut = def.shutdown ?? 4;
  if (st.kind === 'true' && approach === 'accuse') {
    s.trust--; s.wrong++; quiet(s, shut); say(s, st.wrong ?? DEFAULT_LINES.hurt);
    return reply(s, 'hurt', st.wrong ?? DEFAULT_LINES.hurt);
  }
  if (st.kind === 'lie' && approach === 'empathy') { say(s, DEFAULT_LINES.deflect); return reply(s, 'deflect', DEFAULT_LINES.deflect); }
  if (!fits) {
    s.wrong++; quiet(s, shut); say(s, st.wrong ?? DEFAULT_LINES.wrong);
    return reply(s, 'wrong', st.wrong ?? DEFAULT_LINES.wrong);
  }
  if (st.kind === 'lie') s.pressure = Math.min(1, s.pressure + CONTRADICT);
  else { s.trust++; s.pressure = Math.max(0, s.pressure - CALM); }
  say(s, st.reply);
  const extra = settle(s, st, st.kind === 'lie' ? 'card' : 'empathy');
  return reply(s, st.kind === 'lie' ? 'contradiction' : 'understood', st.reply, extra);
}

/** Asks for more. Pressing someone who tells the truth past breaking point only hurts. */
export function press(def: InterrogationDef, s: InterrogationState): Reply {
  const st = guard(def, s);
  if (!('kind' in st)) return st;
  s.presses[st.id] = (s.presses[st.id] ?? 0) + 1;
  s.pressure = Math.min(1, s.pressure + (st.kind === 'lie' ? PRESS_LIE : PRESS_TRUE));
  if (st.kind === 'true' && s.pressure >= 1 - 1e-9) {
    s.trust--; s.pressure = 0.5; quiet(s, def.shutdown ?? 4); say(s, DEFAULT_LINES.hurt);
    return reply(s, 'hurt', DEFAULT_LINES.hurt);
  }
  const line = st.press?.text ?? DEFAULT_LINES.press;
  let unlocked: string | undefined;
  const u = st.press?.unlocks;
  if (u && stmt(def, u) && !s.order.includes(u)) { s.order.splice(s.at + 1, 0, u); unlocked = u; s.done = false; }
  say(s, line);
  return reply(s, 'pressed', line, { unlocked, hint: st.press?.hint });
}

/** Claims proof without showing it. */
export function bluff(def: InterrogationDef, s: InterrogationState): Reply {
  const st = guard(def, s);
  if (!('kind' in st)) return st;
  say(s, '…', 'hero');
  if (st.kind === 'true') {
    s.trust--; s.wrong++; quiet(s, def.shutdown ?? 4); say(s, st.wrong ?? DEFAULT_LINES.hurt);
    return reply(s, 'hurt', st.wrong ?? DEFAULT_LINES.hurt);
  }
  if (st.bluff !== undefined && s.pressure >= st.bluff) {
    s.bluffs++; say(s, st.reply);
    return reply(s, 'bluffed', st.reply, settle(s, st, 'bluff'));
  }
  s.called++; s.pressure = Math.max(0, s.pressure - CALLED_RELIEF); quiet(s, def.bluffShutdown ?? 8); say(s, DEFAULT_LINES.called);
  return reply(s, 'called', DEFAULT_LINES.called);
}

/** Free nudge for the current statement: an owned card and approach that would settle it, or what to look for. */
export function interrogationHint(def: InterrogationDef, s: InterrogationState, owned: (id: string) => boolean): { card?: string; approach?: Approach; press?: boolean; lookFor?: string } {
  const st = currentStatement(def, s);
  if (!st) return {};
  const card = st.cards.find(owned);
  if (card) return { card, approach: st.kind === 'lie' ? 'accuse' : 'empathy' };
  return st.press ? { press: true, lookFor: st.press.hint } : { lookFor: st.cards[0] };
}

export type Outcome = { settled: number; wrong: number; bluffs: number; called: number; empathy: number; trust: number; perfect: boolean };
export function outcome(def: InterrogationDef, s: InterrogationState): Outcome {
  const v = Object.values(s.settled);
  return { settled: v.length, wrong: s.wrong, bluffs: s.bluffs, called: s.called, empathy: v.filter((x) => x === 'empathy').length, trust: s.trust, perfect: s.wrong === 0 && s.called === 0 };
}
/** Flags of every settled statement (merged in order). */
export function settledFlags(def: InterrogationDef, s: InterrogationState) {
  const out: Record<string, boolean | number | string> = {};
  for (const id of s.order) if (s.settled[id]) Object.assign(out, stmt(def, id)?.set ?? {});
  return out;
}

/** A statement on the tracker as the story UI draws it (app/story-ui InterrogationStatement): a lie settled by a
 *  card or a bluff is 'broken', a truth met with understanding is 'true'; hidden ones appear once a press unlocks them. */
export type StatementView = { id: string; text: string; state: 'pending' | 'current' | 'broken' | 'true' };
export function interrogationView(def: InterrogationDef, s: InterrogationState, tx: (r: TextRef) => string = (r) => r) {
  const st = currentStatement(def, s);
  const statements: StatementView[] = s.order.map((id, i) => {
    const how = s.settled[id];
    return { id, text: tx(stmt(def, id)?.text ?? ''), state: how === 'empathy' ? 'true' : how ? 'broken' : !s.done && i === s.at ? 'current' : 'pending' };
  });
  return {
    id: def.id, subject: def.subject, title: def.title ? tx(def.title) : '', statement: st ? { id: st.id, text: tx(st.text) } : null, statements,
    index: Math.min(s.at, s.order.length), count: s.order.length, pressure: s.pressure, trust: s.trust, silent: s.silent, done: s.done,
    log: s.log.slice(-8).map((l) => ({ who: l.who, text: l.card ? l.card : tx(l.text), card: l.card })),
  };
}

export function lintInterrogation(def: InterrogationDef, evidence?: ReadonlySet<string>): string[] {
  const out: string[] = [], ids = new Set(def.statements.map((s) => s.id));
  if (ids.size !== def.statements.length) out.push(`interrogation ${def.id}: duplicate statement id`);
  if (!def.statements.some((s) => !s.hidden)) out.push(`interrogation ${def.id}: no visible statement`);
  for (const s of def.statements) {
    if (!s.cards.length) out.push(`interrogation ${def.id}/${s.id}: no card settles it`);
    for (const c of s.cards) if (evidence && !evidence.has(c)) out.push(`interrogation ${def.id}/${s.id}: unknown evidence ${c}`);
    if (s.press?.unlocks && !ids.has(s.press.unlocks)) out.push(`interrogation ${def.id}/${s.id}: press unlocks unknown statement ${s.press.unlocks}`);
    if (s.hidden && !def.statements.some((o) => o.press?.unlocks === s.id)) out.push(`interrogation ${def.id}/${s.id}: hidden and never unlocked`);
    if (s.bluff !== undefined && s.kind === 'true') out.push(`interrogation ${def.id}/${s.id}: a true statement cannot be bluffed`);
  }
  return out;
}
