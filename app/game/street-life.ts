/**
 * Vietnamese street life, the pure part (no three.js): what people do on their spots (acts), what a spot is for
 * (life), the eateries' menus and hours, lines people say, seat bookings, splicing a slice into a daily schedule,
 * and the little state machines behind group scenes: cờ tướng turns, dưỡng sinh troupes moving in unison, đá cầu
 * with a real shuttlecock, kids chasing round a fountain, bia hơi toasts, sidewalk karaoke and couples by the river.
 * npcs.ts turns these into routes, poses and props; city.ts places the spots (LIFE).
 */

/** Little things people do on their spot. The first fourteen are everyday fidgets, the rest belong to street life. */
export type Act = 'none' | 'phone' | 'call' | 'stretch' | 'scratch' | 'wave' | 'fan' | 'sweep' | 'serve' | 'shout' | 'akimbo' | 'cross' | 'look' | 'pace'
  | 'eat' | 'sip' | 'read' | 'think' | 'move' | 'slap' | 'cheer' | 'clap' | 'toast' | 'drink' | 'sing' | 'exercise' | 'kick' | 'ready' | 'stoop'
  | 'offer' | 'incense' | 'ladle' | 'feed' | 'nap' | 'lean' | 'pay' | 'point';
/** What a spot in someone's day is for (Activity.life). */
export type Life = 'meal' | 'coffee' | 'tea' | 'beer' | 'chess' | 'kibitz' | 'exercise' | 'shuttle' | 'chase' | 'doorstep' | 'chores' | 'feed' | 'karaoke'
  | 'couple' | 'xeom' | 'hawk' | 'lottery' | 'cook' | 'guard';
/** What a roaming hawker sells. */
export type Goods = 'banhmi' | 'xoi' | 'fruit' | 'kem' | 'hotvitlon';
export type Dish = 'pho' | 'bun' | 'bunrieu' | 'hutieu' | 'banhcanh' | 'chao' | 'com' | 'banhxeo' | 'banhcuon' | 'banhmi' | 'xoi' | 'che' | 'cafe' | 'trasua' | 'bia';
/** Kinds of street-life groups (city.ts LIFE.groups). */
export type LifeKind = 'eatery' | 'beer' | 'chess' | 'exercise' | 'ring' | 'chase' | 'karaoke' | 'couple' | 'xeom';

// ---- Acts --------------------------------------------------------------------------------------------------

/** How long an act lasts (seconds, picked in the range). Acts a gathering drives get their times from it. */
export const ACT_TIME: Record<Act, [number, number]> = {
  none: [1, 3.5], phone: [5, 12], call: [6, 14], stretch: [2.2, 3], scratch: [1.5, 2.4], wave: [1.6, 2.4], fan: [4, 9],
  sweep: [6, 12], serve: [3, 7], shout: [1.8, 2.6], akimbo: [3, 6], cross: [4, 8], look: [2, 4], pace: [3, 6],
  eat: [6, 12], sip: [5, 9], read: [25, 50], think: [4, 8], move: [1.2, 1.2], slap: [1.2, 1.2], cheer: [2, 3], clap: [3, 6],
  toast: [2.2, 2.2], drink: [4, 8], sing: [8, 12], exercise: [8, 8], kick: [0.5, 0.5], ready: [2, 4], stoop: [1.2, 1.2],
  offer: [5, 9], incense: [8, 8], ladle: [5, 10], feed: [6, 12], nap: [60, 90], lean: [10, 25], pay: [3, 4], point: [2, 3],
};
/** What can be done sitting down. */
export const SEATED = new Set<Act>(['none', 'phone', 'call', 'scratch', 'fan', 'look', 'eat', 'sip', 'read', 'think', 'move', 'slap', 'toast', 'drink', 'clap', 'cheer', 'nap', 'lean', 'pay']);
/** Acts that keep both hands busy, so a dish on the table stays there. */
export const HOLDS_VESSEL = new Set<Act>(['eat', 'sip', 'toast', 'drink']);

// ---- Menus -------------------------------------------------------------------------------------------------

/** When each dish is served (hours, may wrap past midnight). */
export const MENU: Record<Dish, [number, number][]> = {
  pho: [[6, 13.5], [16.5, 21.5]], chao: [[6, 10], [17, 21]], banhcanh: [[6, 10], [16.5, 21]],
  bun: [[10.5, 14], [17, 22.5]], bunrieu: [[6, 13.5]], hutieu: [[16.5, 1]],
  com: [[10.5, 14], [17, 22.5]], banhxeo: [[14.5, 22.5]], banhcuon: [[6, 10.5]], banhmi: [[5.5, 9.5], [15.5, 20]],
  xoi: [[5.5, 9.5]], che: [[13.5, 22]], cafe: [[6, 22.5]], trasua: [[9, 22]], bia: [[16, 23.5]],
};
/** Dishes that turn into a nhậu (beer and snacks) table in the evening, and from when. */
export const NHAU: Partial<Record<Dish, number>> = { bun: 18, com: 18, banhxeo: 18 };
/** The dish an eatery serves, from its name. */
export function dishOf(name: string): Dish | null {
  const n = name.toUpperCase();
  const table: [string, Dish][] = [['PHỞ', 'pho'], ['BÚN CHẢ', 'bun'], ['BÚN RIÊU', 'bunrieu'], ['HỦ TIẾU', 'hutieu'], ['BÁNH CANH', 'banhcanh'], ['CHÁO', 'chao'],
    ['QUÁN CƠM', 'com'], ['NHÀ HÀNG', 'com'], ['BÁNH XÈO', 'banhxeo'], ['BÁNH CUỐN', 'banhcuon'], ['BÁNH MÌ', 'banhmi'], ['XÔI', 'xoi'], ['CHÈ', 'che'],
    ['CÀ PHÊ', 'cafe'], ['TRÀ SỮA', 'trasua'], ['BIA HƠI', 'bia'], ['NƯỚC MÍA', 'trasua']];
  for (const [key, dish] of table) if (n.includes(key)) return dish;
  return null;
}
/** Whether `hour` falls in any of the spans (which may wrap past midnight). */
export const inHours = (spans: readonly [number, number][], hour: number) => spans.some(([a, b]) => (a <= b ? hour >= a && hour < b : hour >= a || hour < b));
/** Whether an eatery serving `dish` has its stools out at `hour` (uncovered ones stack them in the rain). */
export function openAt(dish: Dish | null, hour: number, raining = false, covered = true) {
  if (!dish) return true;
  return inHours(MENU[dish], hour) && (!raining || covered);
}
/** Whether something open during `spans` (null: always) is open over the whole of [start, end). */
export function openOver(spans: readonly [number, number][] | null, start: number, end: number) {
  if (!spans) return true;
  const len = (end - start + 24) % 24;
  for (let t = 0; t <= len; t += 0.25) if (!inHours(spans, (start + Math.min(t, len - 0.01) + 24) % 24)) return false;
  return true;
}
/** What is on the table or in the hand at an eatery: a bowl of noodles, a plate, a glass of coffee, tea or beer. */
export type Vessel = 'bowl' | 'plate' | 'coffee' | 'tea' | 'beer' | 'cup';
export function vesselOf(dish: Dish | null, life: Life | undefined, hour: number): Vessel {
  if (life === 'beer' || dish === 'bia' || (dish && NHAU[dish] !== undefined && hour >= NHAU[dish]!)) return 'beer';
  if (life === 'tea') return 'tea';
  if (dish === 'cafe' || life === 'coffee') return 'coffee';
  if (dish === 'trasua' || dish === 'che') return 'cup';
  if (dish === 'com' || dish === 'banhxeo' || dish === 'banhcuon' || dish === 'xoi' || dish === 'banhmi') return 'plate';
  return 'bowl';
}

// ---- What people do on their spot ---------------------------------------------------------------------------

export type ActContext = { male: boolean; sitting: boolean; friendly: boolean; hour: number; dish: Dish | null };
type Table = [Act, number][];
/** Weighted acts for a life (seated people keep only SEATED ones). */
export function lifeActs(life: Life, c: ActContext): Table {
  switch (life) {
    case 'meal': return c.dish === 'cafe' || c.dish === 'trasua' ? lifeActs('coffee', c) : [['eat', 6], ['none', 2], ['look', 1], ['phone', 1], ['sip', 1]];
    case 'coffee': return [['sip', 4], ['read', c.male ? 3 : 0], ['phone', 2], ['look', 2], ['fan', 1], ['none', 2]];
    case 'tea': return [['sip', 4], ['phone', 2], ['look', 2], ['fan', 1], ['none', 2]];
    case 'beer': return [['drink', 4], ['eat', 1], ['clap', 1], ['look', 1], ['call', 1], ['none', 1]];
    case 'doorstep': return [['fan', 3], ['look', 3], ['none', 3], ['phone', 1], ['wave', c.friendly ? 3 : 0]];
    case 'chores': return [['sweep', 4], ['stretch', 1], ['none', 1], ['look', 1]];
    case 'xeom': return c.hour >= 12.5 && c.hour < 14 ? [['nap', 1]] : [['phone', 3], ['look', 3], ['none', 2], ['call', 1]];
    case 'cook': return [['ladle', 5], ['serve', 3], ['fan', 1], ['shout', 1], ['look', 1]];
    case 'feed': return [['feed', 6], ['look', 2], ['none', 1]];
    case 'kibitz': return [['cross', 3], ['point', 2], ['akimbo', 1], ['scratch', 1]];
    case 'chess': return [['think', 2], ['none', 2], ['look', 1], ['scratch', 1]];
    case 'hawk': return [['serve', 3], ['shout', 3], ['fan', 2], ['look', 1]];
    case 'lottery': return [['offer', 5], ['look', 2], ['fan', 1]];
    case 'couple': return [['lean', 6], ['look', 2], ['phone', 1]];
    case 'karaoke': return [['clap', 3], ['drink', 2], ['cheer', 1], ['none', 2]];
    case 'guard': return c.hour >= 12 && c.hour < 13.5 ? [['nap', 1]] : [['fan', 3], ['look', 3], ['phone', 2], ['none', 2]];
    case 'exercise': return [['stretch', 2], ['none', 2], ['look', 1]];
    case 'shuttle': case 'chase': return [['ready', 2], ['look', 1], ['none', 1]];
    default: return [['none', 1]];
  }
}

/** Lines of street life (said near the player; never real song lyrics). */
export const LIFE_LINES = {
  meal: ['Cho tô phở tái nha cô!', 'Một tô bún chả nha!', 'Đói quá, ăn sáng thôi!', 'Thêm chén nước mắm nha!', 'Ngon quá trời!', 'Cô ơi, tính tiền!'],
  coffee: ['Cho ly cà phê sữa đá!', 'Đen đá không đường nha!', 'Sáng nay đọc báo chưa?', 'Cà phê ở đây đậm ghê.'],
  tea: ['Cho ly trà đá!', 'Trà đá cho mát.', 'Chiều nay nóng quá ha.'],
  beer: ['Trăm phần trăm!', 'Cạn ly anh em!', 'Thêm thùng nữa đi!', 'Mồi đâu rồi em ơi?', 'Uống đi, nói hoài!'],
  toast: ['Một, hai, ba, dô!'],
  toastReply: ['Dô!', 'Dô dô!', 'Zô!'],
  check: ['Chiếu tướng!'],
  chess: ['Đi xe đi!', 'Nước này hay!', 'Coi chừng con mã!', 'Ăn pháo đi!', 'Từ từ, để tui tính coi…'],
  kibitz: ['Sao không ăn con mã?', 'Đi xe qua sông đi!', 'Nước này dở rồi!', 'Hay! Hay!', 'Ông này thua rồi.'],
  win: ['Thắng rồi! Ván nữa không?', 'Hết cờ rồi nha!'],
  lose: ['Thôi, thua rồi…', 'Ván nữa! Ván nữa!'],
  count: ['Một, hai, ba, bốn!', 'Năm, sáu, bảy, tám!', 'Hít vào… thở ra…', 'Đưa tay lên!'],
  shuttle: ['Đá đi!', 'Của mày!', 'Hay quá!'],
  miss: ['Hụt rồi!', 'Ui da!', 'Lại nữa!'],
  chase: ['Bắt được rồi!', 'Tới lượt mày!'],
  flee: ['Không bắt được đâu!', 'Chạy mau!'],
  sing: ['♪ La la la… ♪', '♪ Lá la la lá… ♪', '♪ La la… lá la ♪', '♪ Ư ư… la la la ♪'],
  audience: ['Hay quá!', 'Hát nữa đi!', 'Bài nữa đi anh!', 'Vỗ tay đi mọi người!'],
  xeom: ['Xe ôm không anh?', 'Đi đâu anh ơi?', 'Xe ôm đây!', 'Chở đi đâu cũng được nè!'],
  nap: ['Zzz…'],
  lottery: ['Vé số đây! Mua giùm con tờ vé số!', 'Vé số hôm nay đây!', 'Mua vé số đi chú!', 'Vé số đài thành phố đây!'],
  incense: ['Thần Tài phù hộ, mua may bán đắt!', 'Cầu cho buôn may bán đắt.'],
  doorstep: ['Ăn cơm chưa con?', 'Trời nóng quá…', 'Đi đâu đó con?', 'Chiều nay mát ghê.'],
  cook: ['Có liền!', 'Ngồi đi em!', 'Ăn gì con?', 'Thêm hành không?'],
  couple: ['Gió sông mát ghê.', 'Đẹp quá ha…'],
  feed: ['Ăn đi, ăn đi…', 'Tụi bây đói hả?'],
  guard: ['Để xe vô đây nè!', 'Vé xe đây!', 'Gửi xe không em?'],
  buy: {
    xoi: ['Cho gói xôi nha cô!', 'Xôi bắp bao nhiêu vậy?'],
    banhmi: ['Một ổ bánh mì thịt nha!', 'Cho ổ bánh mì, thêm ớt!'],
    fruit: ['Xoài bao nhiêu một ký?', 'Lựa giùm con mấy trái ngon!'],
    kem: ['Cho cây kem dừa!', 'Kem bao nhiêu một cây?'],
    hotvitlon: ['Cho hai hột vịt lộn!', 'Có rau răm không cô?'],
    lottery: ['Cho chú hai tờ!', 'Lấy một tờ đuôi 68!', 'Có số đẹp không con?'],
  } satisfies Record<Goods | 'lottery', string[]>,
  sell: ['Có liền!', 'Dạ, của anh đây!', 'Cảm ơn nha!'],
  sellLottery: ['Cảm ơn chú, chúc chú trúng số!', 'Dạ, chúc may mắn!'],
  stolen: ['Xe tôi đâu rồi?!', 'Ai lấy xe tôi vậy?!', 'Trộm xe! Trộm xe!'],
  hawk: {
    xoi: ['Xôi đây! Xôi nóng đây!', 'Ai ăn xôi không?'],
    banhmi: ['Bánh mì nóng giòn đây!', 'Bánh mì thịt đây!'],
    fruit: ['Trái cây tươi đây!', 'Xoài, ổi, mận đây!'],
    kem: ['Kem đây! Kem mát lạnh!', 'Ai ăn kem không?'],
    hotvitlon: ['Hột vịt lộn đây!', 'Ai hột vịt lộn hông?'],
  } satisfies Record<Goods, string[]>,
};

// ---- Bookings ----------------------------------------------------------------------------------------------

const span = (a: number, b: number) => (b - a + 24) % 24;
/** Whether two circular hour intervals [a0, a1) and [b0, b1) overlap. */
export function overlaps(a0: number, a1: number, b0: number, b1: number) {
  const la = span(a0, a1) || 24, lb = span(b0, b1) || 24;
  return span(a0, b0) < la || span(b0, a0) < lb;
}
/** Who sits or stands where and when: capacity one per seat or stand. */
export function createBookings() {
  const booked = new Map<number, [number, number][]>();
  return {
    book(poi: number, start: number, end: number) {
      const list = booked.get(poi) ?? [];
      if (list.some(([a, b]) => overlaps(a, b, start, end))) return false;
      list.push([start, end]);
      booked.set(poi, list);
      return true;
    },
    free(poi: number, start: number, end = start + 0.01) { return !(booked.get(poi) ?? []).some(([a, b]) => overlaps(a, b, start, end)); },
    count() { let n = 0; for (const l of booked.values()) n += l.length; return n; },
    entries() { return booked; },
  };
}

// ---- Schedules ---------------------------------------------------------------------------------------------

/** The shortest slice a schedule keeps (hours). */
export const MIN_SLICE = 0.25;
/**
 * Puts `slice` into a schedule (a contiguous ring of activities covering 24 h): activities it covers go, one it lies
 * inside splits, ones it overlaps are trimmed; leftovers shorter than MIN_SLICE are absorbed into the slice.
 * Returns false and changes nothing when the result would not be a valid ring.
 */
export function spliceSlice<T extends { start: number; end: number }>(schedule: T[], slice: T): boolean {
  const s0 = ((slice.start % 24) + 24) % 24, L = span(s0, slice.end);
  if (L < MIN_SLICE - 1e-9) return false;
  // Work in hours after the slice's start: the slice is [0, L) (and [24, 24 + L) once round the clock).
  let lo = 0, hi = L;
  const kept: { a: T; p0: number; p1: number }[] = [];
  for (const a of schedule) {
    const a0 = span(s0, a.start), la = schedule.length === 1 ? 24 : span(a.start, a.end);
    for (const [o0, o1] of [[L, 24], [24 + L, 48]]) {
      const p0 = Math.max(a0, o0), p1 = Math.min(a0 + la, o1);
      if (p1 - p0 > 1e-9) kept.push({ a, p0, p1 });
    }
  }
  // Leftovers too short to keep go to the slice when they touch it.
  const out: T[] = [];
  for (const k of kept) {
    if (k.p1 - k.p0 >= MIN_SLICE - 1e-9) {
      const start = (s0 + k.p0) % 24, end = (s0 + k.p1) % 24;
      out.push(Math.abs(start - k.a.start) < 1e-9 && Math.abs(end - k.a.end) < 1e-9 ? k.a : { ...k.a, start, end });
    } else if (Math.abs(k.p1 - 24) < 1e-9 || Math.abs(k.p1 - 48) < 1e-9) lo = Math.min(lo, k.p0 - (k.p1 > 24 ? 48 : 24));
    else if (Math.abs(k.p0 - L) < 1e-9 || Math.abs(k.p0 - 24 - L) < 1e-9) hi = Math.max(hi, k.p1 - (k.p0 > 24 ? 24 : 0));
    else return false;
  }
  out.push({ ...slice, start: (s0 + lo + 24) % 24, end: (s0 + hi) % 24 });
  out.sort((a, b) => a.start - b.start);
  if (!validRing(out)) return false;
  schedule.length = 0;
  schedule.push(...out);
  return true;
}
/** A schedule covers the day exactly once, each activity ending where the next begins, none too short. */
export function validRing(list: readonly { start: number; end: number }[]) {
  if (!list.length) return false;
  let total = 0;
  const sorted = [...list].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], b = sorted[(i + 1) % sorted.length];
    const len = span(a.start, a.end) || (sorted.length === 1 ? 24 : 0);
    if (len < MIN_SLICE - 1e-6) return false;
    total += len;
    if (Math.abs(span(a.end, b.start)) > 1e-6 && Math.abs(span(a.end, b.start) - 24) > 1e-6) return false;
  }
  return Math.abs(total - 24) < 1e-6;
}

// ---- Gatherings --------------------------------------------------------------------------------------------

/** One group as the state machines see it: its kind, slot count (seats first), and per-slot table for eateries. */
export type GatherSpec = { id: number; kind: LifeKind; slots: number; seats: number; table: number[]; cx: number; cz: number; radius: number };
/** What a member does now: an act from..until, and a parameter (exercise move, lean side, chase run). */
export type Cue = { act: Act; from: number; until: number; param: number };
/** A flight of the shuttlecock between two slots; after a miss it lies (dropped) at the kicker's feet until picked up. */
export type Shuttle = { from: number; to: number; launch: number; land: number; apex: number; miss: number; spin: number; dropped: boolean };
type Group = {
  spec: GatherSpec; members: Int32Array; count: number;
  /** Members drinking (bia hơi, a nhậu table): only they raise their glasses. */
  drinks: Uint8Array;
  t0: number; turn: number; moveAt: number; moves: number; total: number; slap: boolean; endAt: number; winner: number; pointAt: number; pointer: number;
  shuttle: Shuttle | null;
  it: number; angle: Float64Array; freezeUntil: number;
  toastAt: Float64Array; replyAt: Float64Array; replier: Int32Array;
  songFrom: number; songUntil: number; cheerUntil: number; lineAt: number;
};
export type Hooks = {
  /** A line said by a member (npcs.ts decides whether anyone hears it). */
  say(npc: number, text: string, shout: boolean): void;
};
/**
 * Group scenes (one state machine per group): members join a slot on arrival and leave when they go (or are swept
 * out when they no longer stand there). actFor() is what a member does now; null leaves it to the life table.
 */
export function createGatherings(specs: readonly GatherSpec[], seed = 5501) {
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const groups: Group[] = specs.map((spec) => ({
    spec, members: new Int32Array(spec.slots).fill(-1), count: 0, drinks: new Uint8Array(spec.slots),
    t0: -1, turn: 0, moveAt: 0, moves: 0, total: 0, slap: false, endAt: -1, winner: 0, pointAt: 0, pointer: -1,
    shuttle: null,
    it: -1, angle: new Float64Array(spec.slots), freezeUntil: 0,
    toastAt: new Float64Array(Math.max(1, ...spec.table.map((t) => t + 1))), replyAt: new Float64Array(Math.max(1, ...spec.table.map((t) => t + 1))).fill(-1),
    replier: new Int32Array(Math.max(1, ...spec.table.map((t) => t + 1))).fill(-1),
    songFrom: 0, songUntil: 0, cheerUntil: 0, lineAt: 0,
  }));
  const where = new Map<number, { g: number; slot: number }>();
  const others = (g: Group, slot: number, from = 0, to = g.members.length) => { const out: number[] = []; for (let k = from; k < to; k++) if (k !== slot && g.members[k] >= 0) out.push(k); return out; };
  /** Drinkers at table t of an eatery (only they toast), and the slot of the k-th of them. */
  const drinkers = (g: Group, t: number) => { let n = 0; for (let k = 0; k < g.spec.seats; k++) if (g.members[k] >= 0 && g.drinks[k] && g.spec.table[k] === t) n++; return n; };
  const drinker = (g: Group, t: number, i: number) => { for (let k = 0; k < g.spec.seats; k++) if (g.members[k] >= 0 && g.drinks[k] && g.spec.table[k] === t && i-- === 0) return k; return 0; };
  const seated = (g: Group) => g.spec.kind === 'chess' ? (g.members[0] >= 0 && g.members[1] >= 0) : false;

  function reset(g: Group, time: number) {
    const k = g.spec.kind;
    if (k === 'chess') { g.turn = rand() < 0.5 ? 0 : 1; g.moveAt = time + 3 + rand() * 4; g.moves = 0; g.total = 20 + Math.floor(rand() * 15); g.endAt = -1; g.pointAt = time + 8; }
    if (k === 'exercise') g.t0 = time;
    if (k === 'ring') g.shuttle = null;
    if (k === 'chase') { g.it = -1; g.freezeUntil = time + 1.5; }
    if (k === 'beer' || k === 'eatery') for (let t = 0; t < g.toastAt.length; t++) g.toastAt[t] = time + 8 + rand() * 20;
    if (k === 'karaoke') { g.songFrom = time + 2; g.songUntil = g.songFrom + 45 + rand() * 25; g.cheerUntil = 0; }
  }

  function join(gi: number, slot: number, npc: number, time: number, drinks = false) {
    const g = groups[gi];
    if (!g || slot < 0 || slot >= g.members.length) return false;
    leave(npc);
    if (g.members[slot] >= 0 && g.members[slot] !== npc) return false;
    g.members[slot] = npc;
    g.drinks[slot] = drinks ? 1 : 0;
    where.set(npc, { g: gi, slot });
    if (g.count++ === 0) reset(g, time);
    if (g.spec.kind === 'chase') g.angle[slot] = Math.atan2(Math.sin(slot * 1.7 + time), Math.cos(slot * 1.7 + time));
    if (g.spec.kind === 'chess' && seated(g)) reset(g, time);
    return true;
  }
  function leave(npc: number) {
    const w = where.get(npc);
    if (!w) return;
    where.delete(npc);
    const g = groups[w.g];
    if (g.members[w.slot] === npc) { g.members[w.slot] = -1; g.count--; }
    if (g.spec.kind === 'chase' && g.it === w.slot) g.it = -1;
    if (g.spec.kind === 'ring' && g.shuttle && (g.shuttle.from === w.slot || g.shuttle.to === w.slot)) g.shuttle = null;
  }

  /** Starts the shuttle's next flight from `from` (a slot) to someone else (or back up, juggling alone). */
  function launch(g: Group, from: number, at: number, dropAngle?: number) {
    const rest = others(g, from);
    const solo = !rest.length;
    const to = solo ? from : pick(rest);
    const dur = solo ? 0.9 : 0.9 + rand() * 0.4;
    g.shuttle = { from, to, launch: at, land: at + dur, apex: solo ? 1.2 : 2.2 + rand() * 1.0, miss: !solo && rand() < 0.12 ? 1 : 0, spin: dropAngle ?? rand() * 6, dropped: dropAngle !== undefined };
  }

  function tick(time: number, hooks: Hooks) {
    for (const g of groups) {
      if (g.count <= 0) continue;
      const kind = g.spec.kind;
      const m = g.members;
      if (kind === 'chess') {
        if (!seated(g)) continue;
        if (g.endAt >= 0) { if (time > g.endAt + 6) reset(g, time); continue; }
        if (time >= g.moveAt + 1.2) {
          // The move is made: the piece is down, the turn passes.
          g.moves++;
          if (g.slap) hooks.say(m[g.turn], LIFE_LINES.check[0], true);
          else if (rand() < 0.25) hooks.say(m[g.turn], pick(LIFE_LINES.chess), false);
          if (g.moves >= g.total) {
            g.endAt = time; g.winner = g.slap ? g.turn : rand() < 0.5 ? 0 : 1;
            hooks.say(m[g.winner], pick(LIFE_LINES.win), false);
            hooks.say(m[1 - g.winner], pick(LIFE_LINES.lose), false);
            continue;
          }
          g.turn ^= 1;
          g.moveAt = time + 4 + rand() * 7;
          g.slap = rand() < 0.12;
          if (g.moves % 3 === 0) {
            const watchers = others(g, -1, 2);
            if (watchers.length) { g.pointer = pick(watchers); g.pointAt = time + 0.6; hooks.say(m[g.pointer], pick(LIFE_LINES.kibitz), false); }
          }
        }
      } else if (kind === 'exercise') {
        // The leader counts only for a troupe (three or more); alone, they just stretch quietly.
        const lead = leader(g);
        if (lead >= 0 && g.count >= 3 && time >= g.lineAt) { g.lineAt = time + 4; hooks.say(m[lead], LIFE_LINES.count[Math.floor((time - g.t0) / 4) % LIFE_LINES.count.length], false); }
      } else if (kind === 'ring') {
        const sh = g.shuttle;
        if (!sh || m[sh.from] < 0 || m[sh.to] < 0) {
          const any = others(g, -1);
          if (any.length) launch(g, pick(any), time + 0.6);
          continue;
        }
        if (time >= sh.land) {
          if (sh.miss) { hooks.say(m[sh.to], pick(LIFE_LINES.miss), false); launch(g, sh.to, time + 1.6, sh.spin); }
          else { launch(g, sh.to, time); if (rand() < 0.08) hooks.say(m[sh.from], pick(LIFE_LINES.shuttle), false); }
        }
      } else if (kind === 'chase') {
        if (g.count < 2) continue;
        if (g.it < 0 || m[g.it] < 0) { g.it = pick(others(g, -1)); g.freezeUntil = time + 1.5; }
      } else if (kind === 'beer' || kind === 'eatery') {
        for (let t = 0; t < g.toastAt.length; t++) {
          const due = time >= g.toastAt[t] && time < g.toastAt[t] + 0.1 && g.replyAt[t] < 0;
          if (!due && g.replyAt[t] < 0) { if (time > g.toastAt[t] + 2.2) g.toastAt[t] = time + 25 + rand() * 20; continue; }
          const n = drinkers(g, t);
          if (n < 2) { g.toastAt[t] = time + 20 + rand() * 20; g.replyAt[t] = -1; continue; }
          if (due) {
            // One raises the glass and counts, another answers.
            const c = Math.floor(rand() * n), r = Math.floor(rand() * (n - 1));
            hooks.say(m[drinker(g, t, c)], LIFE_LINES.toast[0], true);
            g.replier[t] = drinker(g, t, r >= c ? r + 1 : r);
            g.replyAt[t] = g.toastAt[t] + 1.5;
          }
          if (g.replyAt[t] >= 0 && time >= g.replyAt[t]) {
            if (m[g.replier[t]] >= 0) hooks.say(m[g.replier[t]], pick(LIFE_LINES.toastReply), true);
            g.replyAt[t] = -1;
          }
          if (time > g.toastAt[t] + 2.2) g.toastAt[t] = time + 25 + rand() * 20;
        }
      } else if (kind === 'karaoke') {
        const stage = g.spec.seats;
        if (m[stage] < 0) continue;
        if (time >= g.songUntil) {
          g.cheerUntil = time + 2.5;
          const fans = others(g, stage);
          if (fans.length) hooks.say(m[pick(fans)], pick(LIFE_LINES.audience), true);
          g.songFrom = time + 5 + rand() * 4;
          g.songUntil = g.songFrom + 45 + rand() * 25;
        } else if (time >= g.songFrom && time >= g.lineAt) {
          g.lineAt = time + 5 + rand() * 3;
          hooks.say(m[stage], pick(LIFE_LINES.sing), true);
        }
      }
    }
  }

  const cue: Cue = { act: 'none', from: 0, until: 0, param: 0 };
  const set = (act: Act, from: number, until: number, param = 0) => { cue.act = act; cue.from = from; cue.until = until; cue.param = param; return cue; };
  function leader(g: Group) { for (let k = 0; k < g.members.length; k++) if (g.members[k] >= 0) return k; return -1; }

  /** What a member does now (a shared object, copy it), or null to fall back on the life table. */
  function actFor(npc: number, time: number): Cue | null {
    const w = where.get(npc);
    if (!w) return null;
    const g = groups[w.g], slot = w.slot, kind = g.spec.kind;
    if (kind === 'chess') {
      if (slot >= 2) return slot === g.pointer && time >= g.pointAt && time < g.pointAt + 2.5 ? set('point', g.pointAt, g.pointAt + 2.5) : null;
      if (!seated(g)) return null;
      if (g.endAt >= 0) return slot === g.winner ? set('cheer', g.endAt, g.endAt + 2.5) : set('scratch', g.endAt, g.endAt + 2.4);
      if (slot !== g.turn) return set('none', g.moveAt - 6, g.moveAt + 1.2);
      if (time >= g.moveAt) return set(g.slap ? 'slap' : 'move', g.moveAt, g.moveAt + 1.2);
      return set('think', g.moveAt - 6, g.moveAt);
    }
    if (kind === 'exercise') {
      if (g.count < 3) return null;
      const n = Math.floor((time - g.t0) / 8);
      const from = g.t0 + n * 8;
      return set('exercise', from, from + 8, ((n % 6) + 6) % 6);
    }
    if (kind === 'ring') {
      const sh = g.shuttle;
      if (!sh) return set('ready', time - 1, time + 1);
      // A miss: the one who let it drop stoops to pick it up, then serves again.
      if (slot === sh.from && sh.dropped && time >= sh.launch - 1.6 && time < sh.launch - 0.4) return set('stoop', sh.launch - 1.6, sh.launch - 0.4);
      if (slot === sh.from && time >= sh.launch - 0.25 && time < sh.launch + 0.25) return set('kick', sh.launch - 0.25, sh.launch + 0.25);
      return set('ready', time - 1, time + 1);
    }
    if (kind === 'chase') return set('ready', time - 1, time + 1, slot === g.it ? 1 : 0);
    if (kind === 'beer' || kind === 'eatery') {
      const t = g.spec.table[slot] ?? 0;
      if (slot < g.spec.seats && g.drinks[slot] && time >= g.toastAt[t] && time < g.toastAt[t] + 2.2 && drinkers(g, t) >= 2) return set('toast', g.toastAt[t], g.toastAt[t] + 2.2);
      return null;
    }
    if (kind === 'karaoke') {
      const stage = g.spec.seats;
      if (slot === stage) return time >= g.songFrom && time < g.songUntil ? set('sing', g.songFrom, g.songUntil) : null;
      return time < g.cheerUntil ? set('cheer', g.cheerUntil - 2.5, g.cheerUntil) : null;
    }
    if (kind === 'couple') return set('lean', time - 5, time + 5, slot % 2 ? -1 : 1);
    return null;
  }

  /** Where a chase member runs on the track this frame (angle about the centre), moving them and handling tags. */
  function chase(npc: number, time: number, dt: number, hooks: Hooks) {
    const w = where.get(npc);
    if (!w) return null;
    const g = groups[w.g];
    if (g.spec.kind !== 'chase' || g.count < 2 || g.it < 0) return null;
    const slot = w.slot, r = g.spec.radius;
    const frozen = time < g.freezeUntil;
    const a = g.angle[slot];
    let speed = 0;
    if (slot === g.it) {
      if (!frozen) {
        let best = -1, gap = Infinity;
        for (let k = 0; k < g.members.length; k++) {
          if (k === slot || g.members[k] < 0) continue;
          const d = Math.atan2(Math.sin(g.angle[k] - a), Math.cos(g.angle[k] - a));
          if (Math.abs(d) < Math.abs(gap)) { gap = d; best = k; }
        }
        if (best >= 0) {
          speed = Math.sign(gap) * 3.0;
          if (Math.abs(gap) * r < 0.7) {
            // Tagged: the other one is it now, after a moment to get away.
            g.it = best; g.freezeUntil = time + 1.5;
            hooks.say(npc, LIFE_LINES.chase[0], true);
            speed = 0;
          }
        }
      }
    } else {
      const d = Math.atan2(Math.sin(a - g.angle[g.it]), Math.cos(a - g.angle[g.it]));
      // Run away round the fountain, faster when close.
      speed = (Math.abs(d) * r < 4 ? 2.8 : 1.4) * (d >= 0 ? 1 : -1) * (frozen && slot !== g.it ? 0.7 : 1);
    }
    g.angle[slot] = a + (speed * dt) / r;
    return { angle: g.angle[slot], speed, it: slot === g.it };
  }

  return {
    join, leave,
    member(npc: number) { return where.get(npc) ?? null; },
    members(gi: number) { return groups[gi]?.members ?? null; },
    tick, actFor, chase,
    /** The shuttlecock of each ring in flight: the slots it flies between and its arc (npcs.ts places it between the kickers' feet). */
    shuttles(cb: (gi: number, sh: Shuttle, fromNpc: number, toNpc: number) => void) {
      groups.forEach((g, gi) => { if (g.spec.kind === 'ring' && g.shuttle && g.members[g.shuttle.from] >= 0 && g.members[g.shuttle.to] >= 0) cb(gi, g.shuttle, g.members[g.shuttle.from], g.members[g.shuttle.to]); });
    },
    /** Chess: whose turn it is, the move under way and the moves made (for the piece in hand). */
    chess(gi: number) { const g = groups[gi]; return g && g.spec.kind === 'chess' ? { turn: g.turn, moveAt: g.moveAt, moves: g.moves, over: g.endAt >= 0 } : null; },
    /** Drops members the check says are no longer there (gone, or moved off the group's spot). */
    sweep(valid: (npc: number, g: number) => boolean) {
      for (const [npc, w] of [...where]) if (!valid(npc, w.g)) leave(npc);
    },
    /** Every member is in exactly one slot of one group (for checks). */
    consistent() {
      let n = 0;
      for (const [npc, w] of where) { if (groups[w.g].members[w.slot] !== npc) return false; n++; }
      return n === groups.reduce((sum, g) => sum + g.count, 0);
    },
  };
}
export type Gatherings = ReturnType<typeof createGatherings>;
