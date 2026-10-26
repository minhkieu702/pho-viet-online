/**
 * What buying something does to the player (design-real §3), shared by every counter, venue, hotel and ATM:
 * health, a tipsy spell, points, time passing, lying low, short buffs (a full stomach, a cool drink, a strong
 * coffee), bike fixes, a new look, bank transfers and lottery tickets. Pure: game.ts supplies an EffectHost and
 * applyEffect() calls it, so the rules can be checked without three.js. Prices are in thousands of đồng.
 */
export type ServiceEffect = {
  /** Health restored, or `full` for all of it. */
  heal?: number; full?: boolean;
  /** Seconds of being tipsy (the camera sways, walking wanders a little). */
  drunk?: number;
  score?: number;
  /** Hours that pass, or the hour to wake at the next morning. */
  hours?: number; wakeAt?: number;
  /** Police lose track of you if you are wanted at most this many stars. */
  hide?: number;
};
/** 'no': a full stomach (slow healing up to 100), 'mat': cooled down (walk 10% faster), 'tinh': wide awake (sobers up). */
export type BuffId = 'no' | 'mat' | 'tinh';
export type Effect = ServiceEffect & {
  buff?: { id: BuffId; seconds: number };
  /** Bike work: a puncture, a full repair (bikes.ts repairCost), or fresh oil (+15% health). */
  fix?: 'tyre' | 'repair' | 'oil';
  /** A haircut or new clothes: also a disguise for a low wanted level when no officer is watching. */
  look?: 'hair' | 'shirt';
  /** Lottery tickets bought (vé số). */
  lottery?: number;
  /** Takeaway cup or wrapper left in the hand, for the next bin. */
  litter?: number;
  /** A thing to carry for a story or a gift (a gold ring, a fish for the market job). */
  item?: string;
};
export type Service = { id: string; name: string; price: number; description: string; effect: Effect };

/** What applyEffect needs from the game. `now` is in seconds of the game's timeline (performance.now() / 1000). */
export type EffectHost = {
  now: number;
  health: number; maxHealth: number;
  setHealth(value: number): void;
  drunk(seconds: number): void;
  sober(): void;
  score(points: number): void;
  hours: number;
  setHours(hours: number): void;
  wanted: number;
  /** Clears the wanted level; with `watched`, only if no officer has eyes on the player (false: nothing changed). */
  loseTail(watched: boolean): boolean;
  buff(id: BuffId, seconds: number): void;
  /** Bike work; returns the Vietnamese result, or an error starting with '!' (nothing was done). */
  fix(kind: NonNullable<Effect['fix']>): string;
  look(kind: NonNullable<Effect['look']>): void;
  lottery(count: number): void;
  litter(count: number): void;
  item(name: string): void;
};

export const BUFF_LABEL: Record<BuffId, string> = { no: 'no bụng', mat: 'mát người', tinh: 'tỉnh táo' };

/**
 * Applies an effect and returns the parts of the receipt ("+35 máu", "no bụng 2 phút"...). `eatIn`: eaten at a
 * stool or table on the spot, which heals 30% more (ăn tại chỗ).
 */
export function applyEffect(e: Effect, host: EffectHost, eatIn = false): string[] {
  const parts: string[] = [];
  if (e.full) { host.setHealth(host.maxHealth); parts.push('hồi đầy máu'); }
  else if (e.heal) {
    const heal = Math.round(e.heal * (eatIn ? 1.3 : 1));
    host.setHealth(Math.min(host.maxHealth, host.health + heal));
    parts.push(`+${heal} máu${eatIn ? ' (ăn tại chỗ)' : ''}`);
  }
  if (e.buff) {
    host.buff(e.buff.id, e.buff.seconds);
    if (e.buff.id === 'tinh') host.sober();
    parts.push(`${BUFF_LABEL[e.buff.id]} ${duration(e.buff.seconds)}`);
  }
  if (e.drunk) { host.drunk(e.drunk); parts.push('hơi say'); }
  if (e.score) { host.score(e.score); parts.push(`+${e.score} điểm`); }
  if (e.hours) host.setHours(host.hours + e.hours);
  if (e.wakeAt !== undefined) host.setHours(e.wakeAt);
  if (e.hide !== undefined && host.wanted > 0 && host.wanted <= e.hide && host.loseTail(false)) parts.push('cảnh sát đã mất dấu bạn');
  if (e.fix) parts.push(host.fix(e.fix));
  if (e.look) {
    host.look(e.look);
    parts.push(e.look === 'hair' ? 'kiểu tóc mới' : 'áo mới');
    if (host.wanted > 0 && host.wanted <= 2 && host.loseTail(true)) parts.push('cảnh sát không nhận ra bạn nữa');
  }
  if (e.lottery) { host.lottery(e.lottery); parts.push(`${e.lottery} tờ vé số`); }
  if (e.litter) host.litter(e.litter);
  if (e.item) { host.item(e.item); parts.push(`nhận ${e.item}`); }
  return parts.filter(Boolean);
}

function duration(seconds: number) {
  return seconds >= 60 ? `${Math.round(seconds / 60)} phút` : `${seconds} giây`;
}

/**
 * Natural healing (design-real §3, the balance change that makes food matter): +1/s up to 60 in the city
 * (70 sitting down), a full stomach adds +1/s up to 100; zombie mode keeps the old +2/s up to 100.
 * Returns health per second at the current health.
 */
export function regenRate(health: number, opts: { zombie: boolean; full: boolean; seated: boolean }) {
  if (opts.zombie) return health < 100 ? 2 : 0;
  const cap = opts.seated ? 70 : 60;
  return (health < cap ? 1 : 0) + (opts.full && health < 100 ? 1 : 0);
}

/** Walking speed factor from buffs (a cool drink in the heat). */
export const footSpeed = (cool: boolean) => (cool ? 1.1 : 1);

// ---- Lottery (xổ số kiến thiết miền Nam: one draw a day at 16:15) --------------------------------------------

export const DRAW_HOUR = 16.25;
/** Most tickets a player can hold. */
export const MAX_TICKETS = 10;
export type Ticket = { number: string; day: number };

function hash32(n: number, salt: number) {
  let h = Math.imul(n ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/** The winning six digits of a game day's draw (deterministic, so every player in a room agrees). */
export function drawNumber(day: number) {
  return String(hash32(day + 1, 1615) % 1_000_000).padStart(6, '0');
}
/** The draw a ticket bought now takes part in: today's if it is before 16:15, otherwise tomorrow's. */
export function drawDay(day: number, hour: number) {
  return hour < DRAW_HOUR ? day : day + 1;
}
/** Prize in thousands of đồng (the best match only): last 2 digits 100, last 3 1.000, last 4 10.000, all six 50.000. */
export function prizeFor(ticket: string, winning: string) {
  if (ticket === winning) return 50_000;
  for (const [n, prize] of [[4, 10_000], [3, 1_000], [2, 100]] as const) if (ticket.slice(-n) === winning.slice(-n)) return prize;
  return 0;
}
/** A fresh ticket number from a random source. */
export function ticketNumber(random: () => number) {
  return String(Math.floor(random() * 1_000_000)).padStart(6, '0');
}

// ---- Haggling (trả giá) at market stalls and with xe ôm drivers ---------------------------------------------

export type Haggle = 'cheaper' | 'same' | 'refused';
/** 55%: 20% off; 30%: no change; 15%: the vendor will not sell to you for a minute. */
export function haggle(random: () => number): Haggle {
  const r = random();
  return r < 0.55 ? 'cheaper' : r < 0.85 ? 'same' : 'refused';
}
export const HAGGLE_OFF = 0.8;
