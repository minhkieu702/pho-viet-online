import type { BoardCard, BoardDef, BoardProgress, HypothesisDef, Progress, QuestionDef, TextRef } from './types.ts';

/**
 * BẢNG MANH MỐI, the deduction board (pure). One persistent board grows chapter by chapter: each BoardDef adds
 * cards (evidence ids, shown once owned, or free nodes such as a question), the correct red strings between
 * them, and hypotheses the player proves by picking the cards that support them. A correct string snaps and is
 * kept forever; a wrong one costs a hint token (never below zero) and is not kept, so the board can never fail
 * or lock. After `freeAfter` wrong tries in a row the next hint is free. When every string (and every
 * hypothesis) of a board is in place it is solved and its question (QuestionDef) opens: multiple choice, a
 * wrong answer costs `cost` tokens, the question stays open until answered right.
 */

export type Owned = (evidence: string) => boolean;
export type Tokens = Pick<Progress, 'board' | 'hintTokens' | 'deductions'>;
export type Tx = (ref: TextRef) => string;
const same: Tx = (s) => s;

/** Undirected string key, the form stored in progress.board.links. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const cardOf = (def: BoardDef, id: string) => def.cards.find((c) => c.id === id);
/** A card is on the board once its evidence is owned; `needs: null` cards are always there. */
export const cardVisible = (c: BoardCard, owned: Owned) => (c.needs === null ? true : owned(c.needs ?? c.id));
const spend = (s: Tokens, n: number) => { const c = Math.max(0, Math.min(n, s.hintTokens)); s.hintTokens -= c; return c; };

export function isSolved(def: BoardDef, b: BoardProgress) {
  return def.links.every(([x, y]) => b.links.includes(pairKey(x, y))) && (def.hypotheses ?? []).every((h) => b.proven.includes(`${def.id}:${h.id}`));
}
function settle(def: BoardDef, s: Tokens) {
  if (!s.board.solved.includes(def.id) && isSolved(def, s.board)) { s.board.solved.push(def.id); return true; }
  return false;
}
const miss = (s: Tokens) => { s.board.wrong++; s.board.streak++; };

export type LinkResult = { result: 'correct' | 'wrong' | 'known' | 'locked' | 'self'; a: string; b: string; cost: number; solved: boolean };
/** Draws a string from card a to card b. */
export function linkCards(def: BoardDef, s: Tokens, a: string, b: string, owned: Owned): LinkResult {
  const out = (result: LinkResult['result'], cost = 0, solved = false): LinkResult => ({ result, a, b, cost, solved });
  if (a === b) return out('self');
  const ca = cardOf(def, a), cb = cardOf(def, b);
  if (!ca || !cb || !cardVisible(ca, owned) || !cardVisible(cb, owned)) return out('locked');
  const key = pairKey(a, b);
  if (s.board.links.includes(key)) return out('known');
  if (def.links.some(([x, y]) => pairKey(x, y) === key)) {
    s.board.links.push(key); s.board.streak = 0;
    return out('correct', 0, settle(def, s));
  }
  miss(s);
  return out('wrong', spend(s, 1));
}

export type ProposeResult = { result: 'proven' | 'wrong' | 'known' | 'incomplete' | 'unknown'; id: string; cost: number; missing: number; against: string[]; extra: string[]; solved: boolean };
/**
 * Proposes a hypothesis backed by the picked cards. Proven when every needed card is picked and none of the
 * cards that contradict it; extra unrelated cards are reported but tolerated. 'incomplete' (no cost) means a
 * needed card is not even owned yet.
 */
export function propose(def: BoardDef, s: Tokens, hyp: string, picked: string[], owned: Owned): ProposeResult {
  const h = def.hypotheses?.find((x) => x.id === hyp);
  const base = { id: hyp, cost: 0, missing: 0, against: [] as string[], extra: [] as string[], solved: false };
  if (!h) return { ...base, result: 'unknown' };
  const key = `${def.id}:${h.id}`;
  if (s.board.proven.includes(key)) return { ...base, result: 'known' };
  if (!h.needs.every(owned)) return { ...base, result: 'incomplete', missing: h.needs.filter((n) => !owned(n)).length };
  const pick = [...new Set(picked.filter(owned))];
  const missing = h.needs.filter((n) => !pick.includes(n)).length, against = pick.filter((p) => h.against?.includes(p));
  const extra = pick.filter((p) => !h.needs.includes(p) && !against.includes(p));
  if (missing === 0 && against.length === 0) {
    s.board.proven.push(key); s.board.streak = 0;
    return { ...base, result: 'proven', extra, solved: settle(def, s) };
  }
  miss(s);
  return { ...base, result: 'wrong', cost: spend(s, 1), missing, against, extra };
}

export type Hint =
  | { kind: 'link'; a: string; b: string; cost: number; solved: boolean }
  | { kind: 'card'; hyp: string; card: string; cost: number }
  | { kind: 'missing'; card: string; cost: 0 }
  | { kind: 'question'; cost: 0 }
  | { kind: 'none' | 'no-tokens'; cost: 0 };
/**
 * Spends a token (free after `freeAfter` wrong tries in a row) on the first useful step in authoring order:
 * a correct string between owned cards is drawn for the player; else one card of an open hypothesis is
 * pointed at; else the evidence still to be found is named (free); else the question is up next.
 */
export function boardHint(def: BoardDef, s: Tokens, owned: Owned, freeAfter = 3): Hint {
  const free = s.board.streak >= freeAfter;
  const pay = () => { if (free) { s.board.streak = 0; return 0; } return spend(s, 1); };
  const visible = (id: string) => { const c = cardOf(def, id); return !!c && cardVisible(c, owned); };
  const open = def.links.find(([x, y]) => !s.board.links.includes(pairKey(x, y)) && visible(x) && visible(y));
  const hyp = def.hypotheses?.find((h) => !s.board.proven.includes(`${def.id}:${h.id}`) && h.needs.every(owned));
  if ((open || hyp) && !free && s.hintTokens <= 0) return { kind: 'no-tokens', cost: 0 };
  if (open) {
    const [a, b] = open, key = pairKey(a, b), cost = pay();
    s.board.links.push(key); s.board.hinted.push(key);
    return { kind: 'link', a, b, cost, solved: settle(def, s) };
  }
  if (hyp) {
    const card = hyp.needs.find((n) => !s.board.hinted.includes(`${def.id}:${hyp.id}:${n}`)) ?? hyp.needs[0];
    s.board.hinted.push(`${def.id}:${hyp.id}:${card}`);
    return { kind: 'card', hyp: hyp.id, card, cost: pay() };
  }
  const lack = def.links.flat().map((id) => cardOf(def, id)).find((c) => c && !cardVisible(c, owned))
    ?? def.hypotheses?.flatMap((h) => h.needs).filter((n) => !owned(n)).map((n) => ({ id: n, needs: n } as BoardCard))[0];
  if (lack) return { kind: 'missing', card: lack.needs ?? lack.id, cost: 0 };
  if (def.question && isSolved(def, s.board)) return { kind: 'question', cost: 0 };
  return { kind: 'none', cost: 0 };
}

export type BoardView = {
  id: string; title: string; solved: boolean; done: number; total: number; ratio: number; tokens: number;
  cards: { id: string; label: string; slot: number; visible: boolean }[];
  links: { a: string; b: string; hinted: boolean }[];
  hypotheses: { id: string; text: string; state: 'locked' | 'open' | 'proven' }[];
  question: string | null;
};
/** What the BẢNG MANH MỐI overlay draws: visible cards in lotus slots, the strings in place, progress ratio. */
export function boardView(def: BoardDef, s: Tokens, owned: Owned, tx: Tx = same): BoardView {
  const keys = new Set(def.links.map(([x, y]) => pairKey(x, y)));
  const links = s.board.links.filter((k) => keys.has(k)).map((k) => { const [a, b] = k.split('|'); return { a, b, hinted: s.board.hinted.includes(k) }; });
  const hyp = (h: HypothesisDef) => (s.board.proven.includes(`${def.id}:${h.id}`) ? 'proven' : h.needs.every(owned) ? 'open' : 'locked') as 'locked' | 'open' | 'proven';
  const total = def.links.length + (def.hypotheses?.length ?? 0);
  const done = links.length + (def.hypotheses ?? []).filter((h) => hyp(h) === 'proven').length;
  return {
    id: def.id, title: tx(def.title), solved: s.board.solved.includes(def.id), done, total, ratio: total ? done / total : 1, tokens: s.hintTokens,
    cards: def.cards.map((c, i) => ({ id: c.id, label: tx(c.label ?? c.id), slot: c.slot ?? i, visible: cardVisible(c, owned) })),
    links, hypotheses: (def.hypotheses ?? []).map((h) => ({ id: h.id, text: tx(h.text), state: hyp(h) })), question: def.question ?? null,
  };
}

// ---- Questions ('Ai báo cho tụi nó?') -----------------------------------------------------------------

export type AnswerResult = { result: 'correct' | 'wrong' | 'known' | 'unknown'; cost: number; tries: number };
export function answerQuestion(q: QuestionDef, s: Tokens, option: string): AnswerResult {
  const d = (s.deductions[q.id] ??= { answer: '', tries: 0 });
  if (d.answer) return { result: 'known', cost: 0, tries: d.tries };
  if (!q.options.some((o) => o.id === option)) return { result: 'unknown', cost: 0, tries: d.tries };
  d.tries++;
  if (option === q.answer) { d.answer = option; return { result: 'correct', cost: 0, tries: d.tries }; }
  return { result: 'wrong', cost: spend(s, q.cost ?? 1), tries: d.tries };
}
/** Options the owned evidence supports (an option without `needs` is never "supported"). */
export const provable = (q: QuestionDef, owned: Owned) => q.options.filter((o) => o.needs?.length && o.needs.every(owned)).map((o) => o.id);
export function questionView(q: QuestionDef, s: Tokens, tx: Tx = same) {
  const d = s.deductions[q.id];
  return { id: q.id, prompt: tx(q.prompt), options: q.options.map((o) => ({ id: o.id, text: tx(o.text) })), answered: d?.answer || null, tries: d?.tries ?? 0, tokens: s.hintTokens };
}

// ---- Lint --------------------------------------------------------------------------------------------

/** Authoring problems: unknown or duplicate cards, bad or duplicate strings, stray cards, unknown evidence. */
export function lintBoard(def: BoardDef, evidence?: ReadonlySet<string>): string[] {
  const out: string[] = [], ids = new Set<string>(), keys = new Set<string>(), linked = new Set<string>();
  for (const c of def.cards) {
    if (ids.has(c.id)) out.push(`board ${def.id}: duplicate card ${c.id}`);
    ids.add(c.id);
    const ev = c.needs === null ? null : c.needs ?? c.id;
    if (ev && evidence && !evidence.has(ev)) out.push(`board ${def.id}: card ${c.id} needs unknown evidence ${ev}`);
  }
  for (const [a, b] of def.links) {
    if (a === b) out.push(`board ${def.id}: string from ${a} to itself`);
    for (const x of [a, b]) if (!ids.has(x)) out.push(`board ${def.id}: string uses unknown card ${x}`);
    const k = pairKey(a, b);
    if (keys.has(k)) out.push(`board ${def.id}: duplicate string ${k}`);
    keys.add(k); linked.add(a); linked.add(b);
  }
  for (const h of def.hypotheses ?? []) {
    if (!h.needs.length) out.push(`board ${def.id}: hypothesis ${h.id} needs no card`);
    for (const x of [...h.needs, ...(h.against ?? [])]) if (!ids.has(x) && !(evidence?.has(x))) out.push(`board ${def.id}: hypothesis ${h.id} uses unknown card ${x}`);
    for (const x of h.needs) linked.add(x);
  }
  for (const c of def.cards) if (!linked.has(c.id)) out.push(`board ${def.id}: card ${c.id} is on no string`);
  return out;
}
export function lintQuestion(q: QuestionDef, evidence?: ReadonlySet<string>): string[] {
  const out: string[] = [], ids = new Set<string>();
  if (q.options.length < 2) out.push(`question ${q.id}: fewer than 2 options`);
  for (const o of q.options) {
    if (ids.has(o.id)) out.push(`question ${q.id}: duplicate option ${o.id}`);
    ids.add(o.id);
    for (const n of o.needs ?? []) if (evidence && !evidence.has(n)) out.push(`question ${q.id}: option ${o.id} needs unknown evidence ${n}`);
  }
  if (!ids.has(q.answer)) out.push(`question ${q.id}: answer ${q.answer} is not an option`);
  return out;
}
