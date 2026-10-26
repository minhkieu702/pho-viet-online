import { defineChapter, defineMission, type Act, type BoardCard, type CastDef, type Cond, type EvidenceDef, type FailDef, type JournalDef, type Line, type PlaceDef, type QuestionDef, type WorldPolicy } from '../types.ts';
import type { ContractEntry, ContractKind } from '../contract.ts';
import { SITES } from '../sites.ts';
import { TEXT } from '../text/vi/ch07.ts';

/**
 * Chương 7 · SÀ LAN SỐ 07 (story-final.md ch.7 with story-decisions.md 10, 13, 14 and §8 "c7-m1 / c7-m2"): the night
 * of mùng 10, the date on the KHO 7 whiteboard ("SL 07 — ĐÊM MÙNG 10 — 23:00", ch.2). c7-m1 in the afternoon: Cô Ba
 * folds Ông Tư's faded jacket into Tín's hands, an optional rope from the riverside market for a second way aboard,
 * then a tourist cruise in the speedboat Vân hired at BẾN DU THUYỀN past the anchored barge SÀ LAN {@ringUpper} 07:
 * three photos (bow, beam, wheelhouse) tag its six guards and the searchlight; at dusk on the jetty Vân says Lực has
 * suspended her, names Thiếu tá Lộc of the river police and hands over six zip ties and a GPS tracker — chained into
 * c7-m2 at 22:30 in the rain: out from BẾN AN HÒA, engine cut 50 m upstream, a swim beside the drifting boat through
 * the searchlight's blind zones, the boat tied at the stern ladder, up the tyre fenders (or the rope at the bow), deck
 * stealth on clanging steel (two chatting pairs, a stern post, the searchlight), the tracker in a golden-lotus fish
 * crate, the right container found by listening (hold T), the bolt cutters from the old deckhand's toolbox (he looks
 * away), CS07 inside container 07 (Hoa, Bé Tí and nine others; Mai sang them to sleep, then Cường took her "down where
 * the music thumps all night"), the escort of eleven across two lit gaps to the stern, everyone aboard as the tug's
 * horn sounds — chained into c7-m3: the slow-motion vault into the driver's seat, the boat chase (loaded boat, armed
 * speedboats, the tug's searchlight, river traffic; round the pier heads, across to the far bank and down to BẾN BẠCH
 * ĐẰNG), the handover to Lộc's river police, Lực's ward cars ("Nó là đầu mối vận chuyển ma túy!"), Vân standing in
 * his way, a short 1-star evasion along the promenade and a quiet end in the rain: "ĐÃ CỨU: 11".
 * Non-lethal throughout (lethal: 'fail'; a chokehold slip never kills, flags.ts; nobody on a rammed boat drowns).
 *
 * Places are story/sites.ts ids or this chapter's PLACES ('ch7.*'): the barge deck and the boat berths are derived
 * from the sites (SITES['sa-lan-07'] hull and spots, the docks' hire rings, the r-thuyen-ruot route), so a re-pick of
 * the hull (story-decisions.md 10, WAVE1-PLAN §1.3) moves every barge place with it. Texts are '@keys' of
 * text/vi/ch07.ts; brands ({@app}, {@code}, {@ring}, {@ringUpper}) come from text/vi/common.ts.
 * Register in content/index.ts LOADERS: `7: () => import('./ch07.ts'),`.
 * Cast from earlier chapters: tin, coba, quang (ch.1), hoa, beti, cuong, ran-den (ch.2), van, luc (ch.3). New here:
 * loc (Thiếu tá Lộc, river police; later chapters reuse this id), cs-nu, lai-sa-lan, the barge guards, ba-ban-day.
 *
 * Engine ids used here are in story/contract.ts, except ENGINE_NEEDS below (ids this chapter adds, with their lane):
 * the 'sa-lan-07' stealth arena, the boats (speedboat, speedboat-dark, tug, police-boat, barge-container), the
 * visitor-cover and hull meters, Ông Tư's jacket outfit, the river-cop extras, a tug-horn sting and the cutscene
 * clips, props, fx, sfx and ambience of the chapter. Group orders use the planned 'escort' op (escort-boss-qte.md §1),
 * the river chase the planned 'chase' op with the boatChase controller (chase-wanted.md §6.4); no step waits on an
 * engine query, only on events, the player's mode, vehicle state and meters.
 */

const H = Math.PI / 2, PI = Math.PI;
const NO_HUB: WorldPolicy['activities'] = { gunStore: false, bank: false, deck: false, boatRental: false, sideJobs: false, orders: false };
const say = (who: string, key: string, o: Omit<Line, 'who' | 'text'> = {}): Line => ({ who, text: `@${key}`, ...o });
const think = (key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say('tin', key, { voice: 'think', ...o });
const phone = (who: string, key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say(who, key, { voice: 'phone', ...o });
const radio = (key: string): Line => say('van', key, { voice: 'radio' });
const talk = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines });
const aside = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines, mode: 'ambient' });
const hint = (key: string, ms = 7000): Act => ({ k: 'hint', text: `@${key}`, ms });
const bark = (actor: string, key: string, shout = false): Act => ({ k: 'bark', actor, text: `@${key}`, shout });
const reach = (at: string, r = 3, mode?: 'foot' | 'boat' | 'swim' | 'bike', level?: string | null): Cond =>
  ({ k: 'reach', at, r, ...(mode ? { mode } : {}), ...(level !== undefined ? { level } : {}) });
const used = (id: string): Cond => ({ k: 'on', ev: 'interact', id });
const climbed = (id: string): Cond => ({ k: 'on', ev: 'climb', id });
const owned = (id: string): Cond => ({ k: 'evidence', id });
const after = (seconds: number): Cond => ({ k: 'after', seconds });
const flag = (name: string, eq?: boolean | string): Cond => (eq === undefined ? { k: 'flag', name } : { k: 'flag', name, eq });
const detected: Cond = { k: 'on', ev: 'detected' };
/** Teleport unless the player is already there on that surface `level` (null: the ground); see content/ch01.ts. */
const put = (at: string, r = 8, level: string | null = null): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level }, then: [], else: [{ k: 'teleport', at }] });
/** Back into the speedboat at `at` unless already in a boat there: the boat is moved there first, then the player. */
const board = (at: string, r = 8, yaw?: number): Act => ({ k: 'if', c: { k: 'reach', at, r, mode: 'boat' }, then: [], else: [
  { k: 'vehicle', id: 'ca-no', model: 'speedboat', at, ...(yaw !== undefined ? { yaw } : {}), state: 'park' }, { k: 'teleport', at, vehicle: 'ca-no' }] });
/** Seen by a guard or lit by the searchlight: back to the last checkpoint; after three tries the card offers 'Bỏ qua đoạn này'. */
const caught = (reason: string, skipTo?: string): FailDef => ({ when: detected, reason: `@${reason}`, allowSkipAfter: 3, ...(skipTo ? { skipTo } : {}) });
/** Stealth rules on the barge: takedowns, no guns, nobody dies (LƯƠNG TÂM), tagged guards outlined, crimes raise the ring's alarm. */
const RULES = { takedowns: true, guns: 'none', lethal: 'fail', failOn: [], showCones: 'tagged', countConscience: true, respawn: 'checkpoint', policeSuppressed: true };

// ---- Places: the barge deck and the berths, derived from story/sites.ts ----------------------------------------------

const SL = SITES['sa-lan-07'], SP = SL.spots!;
const [X0, X1, Z0, Z1] = SL.area!;
const ZC = (Z0 + Z1) / 2, DECK_Y = SP.containers.y ?? 1.6;
/** The stern is the hull end the stern ladder hangs from; the near (An Hòa) side is the one the tyre fenders hang on. */
const AFT = Math.sign(SP.ladder.x - (X0 + X1) / 2) || -1, NEAR = Math.sign(SP.fenders.z - ZC) || 1;
const STERN_X = AFT < 0 ? X0 : X1, BOW_X = AFT < 0 ? X1 : X0, FWD = -AFT;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** A deck point s metres forward of the stern edge and w metres across the centre line toward the near side. */
const deck = (s: number, w: number, yaw?: number): PlaceDef => ({ x: r2(STERN_X + FWD * s), z: r2(ZC + NEAR * w), y: DECK_Y, level: 'deck', r: 0.45, ...(yaw !== undefined ? { yaw } : {}) });
const water = (x: number, z: number, yaw?: number): PlaceDef => ({ x: r2(x), z: r2(z), r: 1.2, ...(yaw !== undefined ? { yaw } : {}) });
/** A boat berth beside a pier: 3.6 m off its side, on the line of the hire ring (DOCKS ring, 2.5 m in from the pier head). */
const RING_Z = SITES['ben-an-hoa'].spots!.rental.z;
const berth = (site: string, side: -1 | 1, yaw = 0): PlaceDef => water(SITES[site].x + side * 3.6, RING_Z, yaw);
/** The chase loop's turn: the westmost point of r-thuyen-ruot, on the barge's own emptied lane. */
const ROUTE = SITES['r-thuyen-ruot'].route!;
const TURN_X = Math.min(...ROUTE.filter((_, i) => i % 2 === 0));
const WEST = -H, EAST = H;

/**
 * The chapter's named points ('ch7.*'), checked by scripts/story-ch07.test.mjs: deck points inside the hull, water
 * points on navigable water outside the hull and out of every cruising lane's sweep. The deck: the wheelhouse at the
 * stern (sa-lan-07.wheelhouse, s ≈ 4) with the searchlight on its roof, the open after-deck (s 6.5–9.5, swept by the
 * light: the second lit gap), six containers in two rows (s 9.5–29) with 1 m side walks and cross gaps between them
 * (the first lit gap at s ≈ 15.8 on the far walk), container 07 the middle one of the far row with its door on the far
 * walk, and a short bow deck.
 */
export const PLACES: Record<string, PlaceDef> = {
  'ch7.thang-lai': deck(0.9, 0, FWD > 0 ? WEST : EAST),
  'ch7.duoi-lai': deck(1.4, -2.7),
  'ch7.cabin-xa': deck(4, -2.95),
  'ch7.sau-cabin': deck(7.6, 0),
  'ch7.thung-ca': deck(7.2, 2.7),
  'ch7.hop-do-nghe': deck(8, -2.8),
  'ch7.lai-sa-lan': deck(8.8, -1.9),
  'ch7.boong-hong': deck(SP.fenders.x * FWD - STERN_X * FWD, 2.95),
  'ch7.qua-khe-1': deck(12.5, -2.95),
  'ch7.khe-1': deck(15.8, -2.95),
  'ch7.cont-07': deck(19, -2.95),
  'ch7.trong-cont': deck(19, -1.4),
  'ch7.giua-hong': deck(21, 2.95),
  'ch7.giua-xa': deck(24.5, -2.95),
  'ch7.mui': deck(29, 0),
  // water
  'ch7.mui-nuoc': water(BOW_X + FWD * 0.9, ZC + NEAR * 1.5),
  'ch7.vao-tuan': water(BOW_X + FWD * 40, ZC, FWD > 0 ? WEST : EAST),
  'ch7.xuong-1': water(BOW_X + FWD * 14, ZC + 1.5, -FWD * H),
  'ch7.xuong-2': water(BOW_X + FWD * 18, ZC - 1.5, -FWD * H),
  'ch7.xuong-3': water(BOW_X + FWD * 24, ZC, -FWD * H),
  'ch7.vong-tay': water(TURN_X, ZC, EAST),
  'ch7.duoi-1': water(TURN_X - 14, ZC + 1.5, EAST),
  'ch7.duoi-2': water(TURN_X - 20, ZC - 1.5, EAST),
  'ch7.ca-no-du-thuyen': berth('ben-du-thuyen', -1, PI),
  'ch7.ca-no-an-hoa': berth('ben-an-hoa', -1, PI),
  'ch7.ca-no-bach-dang': berth('ben-bach-dang', -1, 0),
  // the river police moor east of the pier, beyond the river-bus berth on its east side
  'ch7.loc-1': water(SITES['ben-bach-dang'].x + 7.2, RING_Z, PI),
  'ch7.loc-2': water(SITES['ben-bach-dang'].x + 10.8, RING_Z, PI),
};

// ---- Shared actors ---------------------------------------------------------------------------------------------------

/** The barge: boats.ts' traffic barge switched to anchored at its site, container-deck variant (chapter scope: one hull for the chapter). */
const BARGE: Act = { k: 'vehicle', id: 'sa-lan', model: 'barge-container', at: 'sa-lan-07', yaw: SL.yaw, state: 'park', scope: 'chapter' };
/** Six guards. Pair A meets on the near walk, pair B on the after-deck; the stern post; the searchlight man on the wheelhouse roof. */
const guards = (night: boolean): Act[] => {
  const g = (id: string, cast: string, at: string, behaviour: Extract<Act, { k: 'spawn' }>['behaviour']): Act =>
    ({ k: 'spawn', id, cast, template: 'ran-den', at, team: 'hostile', tags: night ? ['sl07', 'tagged'] : ['sl07'], flashlight: night, behaviour });
  return [
    g('gac-sl-1', 'gac-trum', 'ch7.giua-hong', { k: 'patrol', route: ['ch7.giua-hong', 'ch7.boong-hong'], waits: [12, 4] }),
    g('gac-sl-2', 'gac-xam', 'ch7.giua-hong', { k: 'patrol', route: ['ch7.giua-hong', 'ch7.mui'], waits: [12, 5] }),
    g('gac-sl-3', 'gac-sa-lan', 'ch7.sau-cabin', { k: 'patrol', route: ['ch7.sau-cabin', 'ch7.thung-ca'], waits: [10, 4] }),
    g('gac-sl-4', 'gac-sa-lan', 'ch7.sau-cabin', { k: 'patrol', route: ['ch7.sau-cabin', 'ch7.giua-xa', 'ch7.khe-1'], waits: [10, 4, 3] }),
    g('gac-lai', 'gac-sa-lan', 'ch7.duoi-lai', { k: 'guard', post: 'ch7.duoi-lai', sweep: 60 }),
    g('gac-den', 'gac-den', 'sa-lan-07.wheelhouse', { k: 'guard', post: 'sa-lan-07.wheelhouse', sweep: 120 }),
  ];
};
/** The old deckhand dozing by the engine hatch: an innocent (no takedown prompt; harming him fails the step). */
const DECKHAND: Act = { k: 'spawn', id: 'lai-sa-lan', cast: 'lai-sa-lan', at: 'ch7.lai-sa-lan', team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'sleep' } };
/** The eleven from container 07 (escort-boss-qte.md §1.3 GroupSpec): Hoa leads the line, the little ones in the middle. */
const FOLLOWERS = [
  { id: 'hoa', look: 'hoa', age: 'teen', hero: true }, { id: 'beti', look: 'beti', age: 'child', hero: true },
  ...['teen', 'teen', 'teen', 'teen', 'teen', 'child', 'child', 'adult', 'adult'].map((age, i) => ({ id: `nn-${i + 1}`, look: `captive-${age}`, age })),
];
const GROUP = { id: 'sl07', followers: FOLLOWERS, leader: 'player', order: 'kids-middle', spacing: 1.1, hands: true, start: { at: 'ch7.trong-cont', yaw: NEAR > 0 ? PI : 0 }, release: 'ben-bach-dang.handover' };
/** Group orders through the planned escort op: a spec is idempotent by id (it rebuilds a group a restore removed). */
const escort = (cmd: Record<string, unknown> | null, spec?: Record<string, unknown>, wait = false): Act =>
  ({ k: 'do', op: 'escort', args: { id: 'sl07', ...(spec ? { spec } : {}), ...(cmd ? { cmd } : {}) }, ...(wait ? { wait: true } : {}) });
/** The tracker, the container and the bolt cutters change hands once, whatever path led to the padlock. */
const DECK_DONE: Act = { k: 'if', c: { k: 'not', c: flag('trackerPlanted') }, then: [
  { k: 'take', item: 'tracker' }, { k: 'flag', name: 'trackerPlanted' }, { k: 'evidence', id: 'ev-dinh-vi' }, { k: 'evidence', id: 'ev-cont-07' }, { k: 'give', item: 'boltCutters' }] };

// ---- c7-m1 · Trinh sát trên sông -------------------------------------------------------------------------------------

const c7m1 = defineMission({
  id: 'c7-m1', meta: { hours: [14, 18], giver: 'van' }, chain: 'c7-m2', lethal: 'fail',
  // the windbreaker with Ông Tư's whistle on its cord, as chapter 6 left him (Cô Ba sees the whistle before the jacket)
  start: { at: 'cafe-co-ba.pickup', yaw: 0, hour: 16, weather: 'clear', lunar: 10, outfit: 'tin-whistle' },
  world: { traffic: 'normal', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 16, freeze: true }, weather: { set: 'clear', lock: true }, exclusions: ['sa-lan-07'], activities: NO_HUB },
  setup: [
    { k: 'vehicle', id: 'dream', model: 'dream', at: 'cafe-co-ba.dream', yaw: 0, state: 'park' }, { k: 'do', op: 'bike', args: { id: 'dream', look: 'matte' } },
    BARGE, { k: 'vehicle', id: 'ca-no', model: 'speedboat', at: 'ch7.ca-no-du-thuyen', yaw: PI, state: 'park' },
  ],
  steps: [
    {
      id: 'chieu', minutes: 0.4,
      enter: [
        { k: 'title', kind: 'time', text: '@c7m1.title', sub: '@c7m1.titleSub' },
        aside('c7m1-dau', [think('c7m1.think.dau')]),
        { k: 'sms', from: 'van', text: '@c7m1.sms1', burner: true }, { k: 'sms', from: 'van', text: '@c7m1.sms2', burner: true },
      ],
    },
    {
      id: 'co-ba', minutes: 0.8, objective: '@c7m1.obj.coba', marker: { at: 'cafe-co-ba', label: '@c7m1.mk.coba', style: 'talk' },
      interact: [{ id: 'gap-co-ba', at: 'cafe-co-ba', r: 2.5, prompt: '@c7m1.int.coba', kind: 'talk', when: 'foot' }],
      enter: [{ k: 'spawn', id: 'coba', cast: 'coba', at: 'cafe-co-ba.quangTable', team: 'ally', behaviour: { k: 'act', name: 'kettle-pour' } }],
      done: used('gap-co-ba'),
      exit: [
        { k: 'cutscene', id: 'c7m1-ao' },
        { k: 'unlock', outfit: 'tin-ao-tu', label: '@c7m1.unlock.ao' }, { k: 'player', outfit: 'tin-ao-tu' },
        { k: 'journal', id: 'j-ao-ong-tu' }, { k: 'flag', name: 'wearsTuJacket' },
        { k: 'despawn', id: 'coba' },
      ],
    },
    {
      id: 'ra-ben', minutes: 1, objective: '@c7m1.obj.ben',
      marker: [{ id: 'mk-ben', at: 'ben-du-thuyen', label: '@c7m1.mk.ben', style: 'go' }, { id: 'mk-cho', at: 'cho-ven-song', label: '@c7m1.mk.cho', style: 'subtle' }],
      interact: [{ id: 'mua-day', at: 'cho-ven-song', r: 3, prompt: '@c7m1.int.day', kind: 'pick', when: 'foot' }],
      enter: [
        { k: 'spawn', id: 'ba-ban-day', cast: 'ba-ban-day', at: 'cho-ven-song', team: 'neutral', behaviour: { k: 'act', name: 'serve' } },
        hint('c7m1.hint.cho', 8000),
      ],
      watchers: [{ when: used('mua-day'), do: [
        bark('ba-ban-day', 'c7m1.bark.day'), { k: 'cash', n: -20 }, { k: 'give', item: 'day-thung' }, { k: 'toast', text: '@c7m1.toast.day' },
        { k: 'unmark', id: 'mk-cho' }, aside('c7m1-day', [think('c7m1.think.day')])] }],
      done: reach('ben-du-thuyen', 8),
      exit: [{ k: 'despawn', id: 'ba-ban-day' }],
    },
    {
      id: 'len-ca-no', minutes: 0.3, objective: '@c7m1.obj.len', marker: { at: 'ch7.ca-no-du-thuyen', label: '@c7m1.mk.caNo', style: 'go' },
      enter: [hint('c7m1.hint.len', 6000)],
      done: { k: 'mode', is: 'boat' },
    },
    {
      id: 'tuan-song', minutes: 1.4, objective: '@c7m1.obj.tuan', hud: { cover: true },
      checkpoint: { label: '@c7m1.cp.tuan', setup: [board('ch7.ca-no-du-thuyen', 8, PI)] },
      meters: [{ id: 'cover:visitor', label: '@c7m1.meter.cover', kind: 'bar', max: 1 }],
      subs: [
        { id: 'mui', text: '@c7m1.sub.mui', done: owned('ev-sl07-mui') },
        { id: 'hong', text: '@c7m1.sub.hong', done: owned('ev-sl07-hong') },
        { id: 'cabin', text: '@c7m1.sub.cabin', done: owned('ev-sl07-cabin') },
      ],
      marker: { at: 'sa-lan-07', label: '@c7m1.mk.saLan', style: 'subtle' },
      enter: [
        { k: 'stealth', arena: 'sa-lan-07', variant: 'day', rules: { ...RULES, takedowns: false, showCones: 'observe' }, cover: 'visitor' },
        ...guards(false), DECKHAND,
        { k: 'photoTarget', id: 'sl07-mui', subject: 'ch7.mui', evidence: 'ev-sl07-mui', minQuality: 0.6, scope: 'step' },
        { k: 'photoTarget', id: 'sl07-hong', subject: 'ch7.giua-hong', evidence: 'ev-sl07-hong', minQuality: 0.6, scope: 'step' },
        { k: 'photoTarget', id: 'sl07-cabin', subject: 'sa-lan-07.wheelhouse', evidence: 'ev-sl07-cabin', minQuality: 0.6, scope: 'step' },
        hint('c7m1.hint.tuan', 9000),
      ],
      watchers: [
        { when: after(10), do: [aside('c7m1-sa-lan', [think('c7m1.think.saLan')])] },
        { when: owned('ev-sl07-cabin'), do: [aside('c7m1-den', [think('c7m1.think.den')])] },
        { when: after(25), do: [hint('c7m1.hint.goc')] },
      ],
      fail: [{ when: { k: 'meter', id: 'cover:visitor', op: '>=', value: 1 }, reason: '@c7m1.fail.cover', soft: true }],
      retry: [{ k: 'vehicle', id: 'ca-no', at: 'ch7.vao-tuan', yaw: PLACES['ch7.vao-tuan'].yaw, state: 'park' }, { k: 'teleport', at: 'ch7.vao-tuan', vehicle: 'ca-no' }],
      exit: [
        { k: 'evidence', id: 'ev-sl07-gac' }, { k: 'flag', name: 'sl07Tagged' }, { k: 'toast', text: '@c7m1.toast.tag' },
        { k: 'stealth', arena: null, cover: null }, { k: 'despawn', tag: 'sl07' }, { k: 'despawn', id: 'lai-sa-lan' },
      ],
    },
    {
      id: 've-ben', minutes: 0.6, objective: '@c7m1.obj.ve', marker: { at: 'ch7.ca-no-du-thuyen', label: '@c7m1.mk.ben', style: 'go' },
      enter: [aside('c7m1-ve', [think('c7m1.think.ve')])],
      done: reach('ch7.ca-no-du-thuyen', 8, 'boat'),
      exit: [
        { k: 'fade', to: 'black', ms: 700 }, { k: 'time', hour: 17.8 },
        { k: 'vehicle', id: 'ca-no', at: 'ch7.ca-no-du-thuyen', yaw: PI, state: 'park' }, { k: 'teleport', at: 'ben-du-thuyen.jetty' },
        { k: 'fade', to: 'clear', ms: 700 },
        { k: 'cutscene', id: 'c7m1-van' },
        { k: 'give', item: 'zipTie', n: 6 }, { k: 'give', item: 'tracker' }, { k: 'toast', text: '@c7m1.toast.do' },
        { k: 'journal', id: 'j-van-dinh-chi' }, { k: 'journal', id: 'j-loc' }, { k: 'flag', name: 'vanSuspended' }, { k: 'flag', name: 'metLoc' },
      ],
    },
    {
      id: 'hoang-hon', minutes: 0.4,
      enter: [
        talk('c7m1-cuoi', [think('c7m1.think.cuoi1'), think('c7m1.think.cuoi2')]),
        { k: 'fade', to: 'black', ms: 1200 },
      ],
    },
  ],
  optional: [{ id: 'day-thung', text: '@c7m1.opt.day', when: { k: 'item', id: 'day-thung' } }],
  rewards: [{ k: 'flag', name: 'reconSL07' }],
  medals: { par: 330, clues: ['day-thung'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'floatStill', 'observe', 'takedown', 'drag', 'faceCover', 'whistle'], flags: { dreamMatte: true } },
});

// ---- c7-m2 · Đêm mùng mười -------------------------------------------------------------------------------------------

const c7m2 = defineMission({
  id: 'c7-m2', meta: { hours: [22, 1], giver: 'van' }, chain: 'c7-m3', lethal: 'fail',
  start: { at: 'ben-an-hoa.rental', yaw: PI, hour: 22.5, weather: 'rain', lunar: 10, outfit: 'tin-ao-tu' },
  world: { traffic: 'night', crowd: 'thin', police: 'suppressed', gangs: 'calm', clock: { hour: 22.5, freeze: true }, weather: { set: 'rain', lock: true }, exclusions: ['sa-lan-07'], activities: NO_HUB },
  setup: [
    BARGE, { k: 'vehicle', id: 'ca-no', model: 'speedboat', at: 'ch7.ca-no-an-hoa', yaw: PI, state: 'park' },
    { k: 'stealth', arena: 'sa-lan-07', variant: 'night', rules: RULES },
    ...guards(true), DECKHAND,
  ],
  steps: [
    {
      id: 'mua-dem', minutes: 0.5,
      enter: [
        { k: 'title', kind: 'time', text: '@c7m2.title', sub: '@c7m2.titleSub' },
        { k: 'call', id: 'c7m2-van', from: 'van', ring: true, burner: true, lines: [phone('van', 'c7m2.v1'), phone('van', 'c7m2.v2'), phone('tin', 'c7m2.t1'), phone('van', 'c7m2.v3')] },
        aside('c7m2-mua', [think('c7m2.think.mua')]),
      ],
    },
    {
      id: 'len-ca-no', minutes: 0.2, objective: '@c7m2.obj.len', marker: { at: 'ch7.ca-no-an-hoa', label: '@c7m2.mk.caNo', style: 'go' },
      done: { k: 'mode', is: 'boat' },
    },
    {
      id: 'ra-giua-song', minutes: 0.6, objective: '@c7m2.obj.ra', marker: { at: 'sa-lan-07.cut', label: '@c7m2.mk.cut', style: 'go' },
      checkpoint: { label: '@c7m2.cp.ra', setup: [board('ch7.ca-no-an-hoa', 8, PI)] },
      enter: [hint('c7m2.hint.den', 8000)],
      watchers: [{ when: after(12), do: [aside('c7m2-sa-lan', [think('c7m2.think.saLan')])] }],
      done: reach('sa-lan-07.cut', 6, 'boat'),
      fail: [caught('c7m2.fail.den')],
    },
    {
      id: 'tat-may', minutes: 0.3, objective: '@c7m2.obj.tat',
      interact: [{ id: 'tat-may', at: 'sa-lan-07.cut', r: 7, prompt: '@c7m2.int.tat', kind: 'use', when: 'ride' }],
      done: used('tat-may'),
      exit: [{ k: 'vehicle', id: 'ca-no', state: 'stop' }, aside('c7m2-tat', [think('c7m2.think.tat')])],
    },
    {
      id: 'xuong-nuoc', minutes: 0.2, objective: '@c7m2.obj.xuong',
      enter: [hint('c7m2.hint.xuong', 6000)],
      done: { k: 'mode', is: 'swim' },
    },
    {
      // the boat drifts down on the current beside him (lights off, a dark hull in the rain: not a detection target)
      id: 'boi', minutes: 1, objective: '@c7m2.obj.boi', marker: { at: 'sa-lan-07.ladder', label: '@c7m2.mk.thang', style: 'subtle' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c7m2.cp.boi', setup: [{ k: 'if', c: reach('sa-lan-07.cut', 10, 'swim'), then: [], else: [
        { k: 'vehicle', id: 'ca-no', at: 'sa-lan-07.cut', yaw: FWD * H, state: 'stop' }, { k: 'teleport', at: 'sa-lan-07.cut' }] }] },
      enter: [{ k: 'vehicle', id: 'ca-no', route: ['sa-lan-07.ladder'], cruise: 0.9, state: 'drive' }, hint('c7m2.hint.noiIm', 9000)],
      watchers: [
        { when: after(6), do: [aside('c7m2-boi', [think('c7m2.think.boi')])] },
        { when: after(18), do: [hint('c7m2.hint.mu', 7000)] },
      ],
      done: reach('sa-lan-07.ladder', 3, 'swim'),
      fail: [caught('c7m2.fail.den')],
    },
    {
      id: 'buoc-ca-no', minutes: 0.2, objective: '@c7m2.obj.buoc',
      interact: [{ id: 'buoc-ca-no', at: 'sa-lan-07.ladder', r: 2.5, prompt: '@c7m2.int.buoc', kind: 'use', when: 'water' }],
      done: used('buoc-ca-no'),
      exit: [{ k: 'vehicle', id: 'ca-no', at: 'sa-lan-07.ladder', yaw: FWD * H, state: 'park' }, aside('c7m2-buoc', [think('c7m2.think.buoc')])],
      fail: [caught('c7m2.fail.den')],
    },
    {
      id: 'leo-len', minutes: 0.5, objective: '@c7m2.obj.leo', hud: { light: true, noise: true },
      marker: { at: 'sa-lan-07.fenders', label: '@c7m2.mk.lop', style: 'go' },
      interact: [{ id: 'leo-lop', at: 'sa-lan-07.fenders', to: 'ch7.boong-hong', r: 2, prompt: '@c7m2.int.lop', kind: 'climb', when: 'water' }],
      enter: [
        { k: 'if', c: { k: 'item', id: 'day-thung' }, then: [
          { k: 'interactable', id: 'leo-day', at: 'ch7.mui-nuoc', to: 'ch7.mui', r: 2, prompt: '@c7m2.int.day', kind: 'climb', when: 'water', scope: 'step' },
          { k: 'marker', id: 'mk-day', at: 'ch7.mui-nuoc', label: '@c7m2.mk.day', style: 'subtle', scope: 'step' },
          hint('c7m2.hint.day', 7000)] },
      ],
      done: { k: 'any', of: [climbed('leo-lop'), climbed('leo-day')] },
      exit: [{ k: 'if', c: { k: 'on', ev: 'climb', id: 'leo-day' }, then: [{ k: 'take', item: 'day-thung' }] }],
      fail: [caught('c7m2.fail.den')],
    },
    {
      id: 'tren-boong', minutes: 2.6, objective: '@c7m2.obj.boong', hud: { light: true, noise: true },
      checkpoint: { label: '@c7m2.cp.boong', setup: [
        put('ch7.boong-hong', 4, 'deck'), { k: 'vehicle', id: 'ca-no', at: 'sa-lan-07.ladder', yaw: FWD * H, state: 'park' }] },
      subs: [
        { id: 'dinh-vi', text: '@c7m2.sub.dinhVi', done: used('gan-dinh-vi') },
        { id: 'nghe', text: '@c7m2.sub.nghe', done: owned('ev-cont-07') },
        { id: 'kim', text: '@c7m2.sub.kim', done: used('lay-kim') },
      ],
      interact: [
        { id: 'gan-dinh-vi', at: 'ch7.thung-ca', r: 1.4, hold: 2, prompt: '@c7m2.int.dinhVi', kind: 'use', when: 'foot', level: 'deck' },
        { id: 'lay-kim', at: 'ch7.hop-do-nghe', r: 1.3, hold: 1.2, prompt: '@c7m2.int.kim', kind: 'pick', when: 'foot', level: 'deck' },
      ],
      enter: [
        { k: 'clue', id: 'tieng-ho', at: 'ch7.cont-07', r: 2.2, evidence: 'ev-cont-07', scope: 'step' },
        { k: 'eavesdrop', id: 'cap-gac', source: 'gac-sl-1', r: 6, seconds: 10, requireHidden: true, lines: [
          say('gac-trum', 'c7m2.nghe1'), say('gac-xam', 'c7m2.nghe2'), say('gac-trum', 'c7m2.nghe3'), say('gac-xam', 'c7m2.nghe4')] },
        hint('c7m2.hint.boong', 9000),
      ],
      watchers: [
        { when: after(10), do: [hint('c7m2.hint.troi', 8000)] },
        { when: after(22), do: [hint('c7m2.hint.giau', 7000)] },
        { when: used('gan-dinh-vi'), do: [aside('c7m2-dinh-vi', [think('c7m2.think.dinhVi')])] },
        { when: owned('ev-cont-07'), do: [aside('c7m2-ho', [think('c7m2.think.ho')])] },
        { when: used('lay-kim'), do: [bark('lai-sa-lan', 'c7m2.bark.lai'), aside('c7m2-lai', [think('c7m2.think.lai')])] },
      ],
      optional: [{ id: 'nghe-gac', text: '@c7m2.opt.nghe', when: { k: 'on', ev: 'eavesdrop', id: 'cap-gac' }, reward: [{ k: 'evidence', id: 'ev-gac-sa-lan' }] }],
      // the tracker, the container and the bolt cutters change hands here, once, whatever order the subs were done in
      exit: [DECK_DONE],
      fail: [
        { when: { k: 'on', ev: 'knockout', id: 'lai-sa-lan' }, reason: '@c7m2.fail.lai' },
        caught('c7m2.fail.boong', 'cat-khoa'),
      ],
    },
    {
      id: 'cat-khoa', minutes: 0.8, objective: '@c7m2.obj.khoa', marker: { at: 'ch7.cont-07', label: '@c7m2.mk.cont', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c7m2.cp.khoa', setup: [
        put('ch7.qua-khe-1', 4, 'deck'), { k: 'vehicle', id: 'ca-no', at: 'sa-lan-07.ladder', yaw: FWD * H, state: 'park' }] },
      interact: [{ id: 'cat-khoa', at: 'ch7.cont-07', r: 1.4, hold: 2, prompt: '@c7m2.int.khoa', kind: 'use', when: 'foot', level: 'deck' }],
      // 'Bỏ qua đoạn này' after three detections on deck lands here as if the deck objectives were done
      enter: [DECK_DONE],
      done: used('cat-khoa'),
      fail: [caught('c7m2.fail.boong')],
      exit: [
        { k: 'take', item: 'boltCutters' },
        { k: 'cutscene', id: 'cs07_container_07' },
        { k: 'evidence', id: 'ev-loi-hoa' }, { k: 'evidence', id: 'ev-sen-than-hoa' }, { k: 'journal', id: 'j-hoa-mai' }, { k: 'flag', name: 'hoaToldB2' },
      ],
    },
    {
      id: 'dan-nguoi', minutes: 2, objective: '@c7m2.obj.dan', hud: { light: true, noise: true },
      checkpoint: { label: '@c7m2.cp.dan', setup: [
        put('ch7.cont-07', 3, 'deck'), { k: 'vehicle', id: 'ca-no', at: 'sa-lan-07.ladder', yaw: FWD * H, state: 'park' },
        escort({ k: 'free' }, GROUP)] },
      subs: [
        { id: 'khe-1', text: '@c7m2.sub.khe1', done: reach('ch7.qua-khe-1', 1.8, 'foot', 'deck') },
        { id: 'khe-2', text: '@c7m2.sub.khe2', done: reach('ch7.cabin-xa', 1.8, 'foot', 'deck') },
      ],
      marker: { at: 'ch7.thang-lai', label: '@c7m2.mk.lai', style: 'go' },
      enter: [hint('c7m2.hint.dan', 9000), aside('c7m2-hoa-1', [say('hoa', 'c7m2.hoa1', { voice: 'whisper' })])],
      watchers: [
        { when: after(9), do: [hint('c7m2.hint.khe', 8000)] },
        { when: { k: 'all', of: [after(4), reach('ch7.qua-khe-1', 2.5, 'foot', 'deck')] }, do: [aside('c7m2-hoa-2', [say('hoa', 'c7m2.hoa2', { voice: 'whisper' })])] },
      ],
      done: { k: 'all', of: [{ k: 'subs' }, reach('ch7.thang-lai', 1.8, 'foot', 'deck')] },
      fail: [{ when: detected, reason: '@c7m2.fail.doan', allowSkipAfter: 3, skipTo: 'xuong-ca-no' }],
    },
    {
      id: 'xuong-ca-no', minutes: 0.5, objective: '@c7m2.obj.xuongCaNo', hud: { light: true, noise: true },
      checkpoint: { label: '@c7m2.cp.xuong', setup: [
        put('ch7.thang-lai', 3, 'deck'), { k: 'vehicle', id: 'ca-no', at: 'sa-lan-07.ladder', yaw: FWD * H, state: 'park' },
        escort({ k: 'follow' }, { ...GROUP, start: { at: 'ch7.cabin-xa', yaw: AFT < 0 ? WEST : EAST } })] },
      interact: [{ id: 'cho-xuong', at: 'ch7.thang-lai', r: 1.8, prompt: '@c7m2.int.xuong', kind: 'use', when: 'foot', level: 'deck' }],
      enter: [hint('c7m2.hint.xuongCaNo', 6000)],
      done: used('cho-xuong'),
      fail: [caught('c7m2.fail.doan')],
      exit: [escort({ k: 'board', vehicle: 'ca-no' }, undefined, true), aside('c7m2-len-het', [say('hoa', 'c7m2.hoa3', { voice: 'whisper' })])],
    },
    {
      id: 'tau-keo', minutes: 0.4,
      enter: [
        { k: 'vehicle', id: 'tau-keo', model: 'tug', at: 'sa-lan-07.tug', yaw: -FWD * H, driver: 'ran-den', route: ['ch7.xuong-1'], cruise: 3, state: 'drive' },
        { k: 'sting', id: 'tug-horn' }, { k: 'do', op: 'stealthAlarm', args: { level: 3, reason: 'tug' } }, { k: 'do', op: 'danger', args: { on: true } },
        { k: 'music', id: 'pulse' }, bark('gac-den', 'c7m2.bark.den', true),
        talk('c7m2-tau-keo', [think('c7m2.think.tauKeo')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'freedSL07' }],
  medals: { par: 600, ghost: true, clues: ['nghe-gac'] },
  replay: {
    abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'floatStill', 'observe', 'takedown', 'drag', 'faceCover', 'whistle'],
    items: { zipTie: 6, tracker: 1 }, flags: { sl07Tagged: true, wearsTuJacket: true, vanSuspended: true }, evidence: ['ev-sl07-mui', 'ev-sl07-hong', 'ev-sl07-cabin'],
  },
});

// ---- c7-m3 · Ca nô đuổi bắt ------------------------------------------------------------------------------------------

const PURSUERS = ['xuong-1', 'xuong-2', 'xuong-3'];
/** The river chase (chase-wanted.md §6.4 BoatChase): loaded boat, three armed dark speedboats, the tug's searchlight, the safe circle. */
const CHASE: Act = { k: 'do', op: 'chase', args: {
  id: 'duoi-song', controller: 'boatChase', ride: 'ca-no', player: { load: 11, accel: 0.7, top: 0.85 }, pursuers: PURSUERS,
  tug: { id: 'tau-keo', spot: true, block: 'sa-lan-07.tug' }, safe: { at: 'ben-bach-dang', r: 40 }, police: ['ca-no-loc-1', 'ca-no-loc-2'], course: 'r-thuyen-ruot' } };
/** Pursuers back at `spots` with the chase running, unless they are still out there (a restore removed them). */
const pursuers = (spots: string[]): Act => ({ k: 'if', c: { k: 'vehicle', id: 'xuong-1' }, then: [], else: [
  ...PURSUERS.map((id, i): Act => ({ k: 'vehicle', id, model: 'speedboat-dark', at: spots[i % spots.length], yaw: PLACES[spots[i % spots.length]].yaw, driver: 'ran-den', state: 'drive' })),
  CHASE] });
const chaseFails: FailDef[] = [
  { when: { k: 'vehicle', id: 'ca-no', state: 'wrecked' }, reason: '@c7m3.fail.chim', allowSkipAfter: 3 },
  { when: { k: 'on', ev: 'caught', id: 'duoi-song' }, reason: '@c7m3.fail.bat', allowSkipAfter: 3 },
];
const c7m3 = defineMission({
  id: 'c7-m3', meta: { hours: [22, 2], giver: 'van' }, lethal: 'fail',
  start: { at: 'ch7.thang-lai', yaw: AFT < 0 ? WEST : EAST, hour: 22.9, weather: 'rain', lunar: 10, outfit: 'tin-ao-tu' },
  world: { traffic: 'night', crowd: 'thin', police: 'story', maxWanted: 1, gangs: 'calm', clock: { hour: 22.9, freeze: true }, weather: { set: 'rain', lock: true }, exclusions: ['sa-lan-07'], activities: NO_HUB },
  setup: [
    BARGE, { k: 'stealth', arena: null }, { k: 'player', lock: ['fire'] },
    { k: 'vehicle', id: 'ca-no', model: 'speedboat', at: 'sa-lan-07.ladder', yaw: FWD * H, state: 'park' },
    escort(null, { ...GROUP, start: { aboard: 'ca-no' } }),
    { k: 'vehicle', id: 'tau-keo', model: 'tug', at: 'sa-lan-07.tug', yaw: -FWD * H, driver: 'ran-den', state: 'stop' },
    { k: 'vehicle', id: 'ca-no-loc-1', model: 'police-boat', at: 'ch7.loc-1', yaw: PI, state: 'park' },
    { k: 'vehicle', id: 'ca-no-loc-2', model: 'police-boat', at: 'ch7.loc-2', yaw: PI, state: 'park' },
  ],
  steps: [
    { id: 'nhay', minutes: 0.5, enter: [{ k: 'cutscene', id: 'c7m3-nhay' }, { k: 'music', id: 'pulse' }, { k: 'do', op: 'danger', args: { on: true } }] },
    {
      id: 'chay-tay', minutes: 1.8, objective: '@c7m3.obj.tay', marker: { at: 'ch7.vong-tay', label: '@c7m3.mk.vong', style: 'go' },
      checkpoint: { label: '@c7m3.cp.chay', setup: [board('sa-lan-07.ladder', 8, FWD * H), pursuers(['ch7.xuong-1', 'ch7.xuong-2', 'ch7.xuong-3']),
        { k: 'music', id: 'pulse' }, { k: 'do', op: 'danger', args: { on: true } }] },
      meters: [{ id: 'hull:ca-no', label: '@c7m3.meter.vo', kind: 'bar', max: 1 }],
      enter: [{ k: 'do', op: 'gps', args: { route: 'r-thuyen-ruot' } }, hint('c7m3.hint.nang', 8000), aside('c7m3-r1', [radio('c7m3.r1')])],
      watchers: [
        { when: reach('ben-an-hoa', 45, 'boat'), do: [aside('c7m3-r2', [radio('c7m3.r2')]), hint('c7m3.hint.coc', 8000)] },
        { when: after(20), do: [aside('c7m3-tre', [say('hoa', 'c7m3.hoa1', { voice: 'shout' })])] },
      ],
      done: reach('ch7.vong-tay', 18, 'boat'),
      fail: chaseFails,
    },
    {
      id: 'chay-dong', minutes: 2, objective: '@c7m3.obj.dong', marker: { at: 'ben-bach-dang', label: '@c7m3.mk.ben', style: 'go' },
      checkpoint: { label: '@c7m3.cp.xuoi', setup: [board('ch7.vong-tay', 20, EAST), pursuers(['ch7.duoi-1', 'ch7.duoi-2']),
        { k: 'do', op: 'gps', args: { route: 'r-thuyen-ruot' } }, { k: 'music', id: 'pulse' }, { k: 'do', op: 'danger', args: { on: true } }] },
      meters: [{ id: 'hull:ca-no', label: '@c7m3.meter.vo', kind: 'bar', max: 1 }],
      enter: [aside('c7m3-r3', [radio('c7m3.r3')]), hint('c7m3.hint.bo', 7000)],
      watchers: [
        { when: reach('sa-lan-07', 45, 'boat'), do: [aside('c7m3-sa-lan', [think('c7m3.think.saLan')])] },
        { when: reach('ben-bach-dang', 90, 'boat'), do: [aside('c7m3-r4', [radio('c7m3.r4')])] },
      ],
      done: reach('ben-bach-dang', 40, 'boat'),
      fail: chaseFails,
      exit: [
        { k: 'stop', id: 'duoi-song' }, ...PURSUERS.map((id): Act => ({ k: 'vehicle', id, state: 'flee' })), { k: 'vehicle', id: 'tau-keo', state: 'flee' },
        { k: 'do', op: 'gps', args: { route: null } },
      ],
    },
    {
      id: 'ben', minutes: 1,
      checkpoint: { label: '@c7m3.cp.ben', setup: [
        { k: 'fade', to: 'black', ms: 600 }, { k: 'vehicle', id: 'ca-no', at: 'ch7.ca-no-bach-dang', yaw: 0, state: 'park' }, { k: 'teleport', at: 'ben-bach-dang.handover' }] },
      enter: [
        { k: 'music', id: null }, { k: 'do', op: 'danger', args: { on: false } }, { k: 'fade', to: 'clear', ms: 600 },
        { k: 'cutscene', id: 'c7m3-ben' },
        escort({ k: 'release' }, undefined, true), { k: 'flag', name: 'rescued', value: 11 },
        { k: 'cutscene', id: 'c7m3-luc' },
        { k: 'evidence', id: 'ev-luc-toi-ben' }, { k: 'journal', id: 'j-da-cuu' }, { k: 'flag', name: 'lucFramedTin' },
      ],
    },
    {
      id: 'tron', minutes: 1, objective: '@c7m3.obj.tron',
      checkpoint: { label: '@c7m3.cp.tron', setup: [put('ben-bach-dang.blankets', 6), escort({ k: 'release' }), { k: 'flag', name: 'rescued', value: 11 }] },
      meters: [{ id: 'da-cuu', label: '@c7m3.meter.daCuu', kind: 'count', flag: 'rescued' }],
      enter: [{ k: 'police', force: 1 }, { k: 'do', op: 'danger', args: { on: true } }, hint('c7m3.hint.tron', 8000)],
      watchers: [{ when: after(8), do: [aside('c7m3-tron', [think('c7m3.think.tron')])] }],
      // the forced star lands first; the evasion counts once the stars are gone for 2 s (never in the first seconds)
      done: { k: 'all', of: [after(5), { k: 'hold', seconds: 2, c: { k: 'player', prop: 'wanted', op: '<=', value: 0 } }] },
      exit: [{ k: 'police', reset: true }, { k: 'do', op: 'danger', args: { on: false } }],
    },
    {
      id: 'dem-mua', minutes: 0.7,
      enter: [
        { k: 'music', id: 'theme-home', level: 0.6 },
        { k: 'call', id: 'c7m3-van', from: 'van', ring: true, burner: true, lines: [
          phone('van', 'c7m3.v1'), phone('van', 'c7m3.v2'), phone('tin', 'c7m3.t1'), phone('van', 'c7m3.v3'), phone('van', 'c7m3.v4'), phone('van', 'c7m3.v5')] },
        { k: 'deduce', id: 'aiBaoLuc' },
        talk('c7m3-luc-song', [think('c7m3.think.luc')]),
        { k: 'sms', from: 'coba', text: '@c7m3.sms.coba' },
        { k: 'choice', id: 'coBaSms', prompt: '@c7m3.q.coba', style: 'sms', timeout: 20, default: 'nguyen', options: [
          { id: 'lien', text: '@c7m3.opt.lien', then: [{ k: 'sms', from: 'coba', text: '@c7m3.sms.lien' }] },
          { id: 'nguyen', text: '@c7m3.opt.nguyen', then: [{ k: 'sms', from: 'coba', text: '@c7m3.sms.nguyen' }] }] },
        talk('c7m3-cuoi', [think('c7m3.think.cuoi1'), think('c7m3.think.cuoi2', { if: flag('hoaToldB2') }), think('c7m3.think.cuoi3')]),
      ],
    },
  ],
  optional: [{ id: 'dam-coc', text: '@c7m3.opt.coc', when: { k: 'any', of: PURSUERS.map((id): Cond => ({ k: 'vehicle', id, state: 'wrecked' })) },
    reward: [aside('c7m3-coc', [think('c7m3.think.coc')])] }],
  rewards: [{ k: 'flag', name: 'rescuedSL07' }],
  medals: { par: 450, clues: ['dam-coc'] },
  replay: {
    abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'floatStill', 'observe', 'takedown', 'drag', 'faceCover', 'whistle'],
    flags: { sl07Tagged: true, wearsTuJacket: true, vanSuspended: true, trackerPlanted: true, hoaToldB2: true }, evidence: ['ev-loi-hoa', 'ev-sen-than-hoa', 'ev-dinh-vi'],
  },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string): CastDef => ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look });
export const CAST: CastDef[] = [
  { ...person('loc', '#2f4a7a', 'L', 'loc'), role: '@cast.loc.role' }, person('cs-nu', '#3d5f8f', 'C', 'river-cop'),
  person('lai-sa-lan', '#8a7a60', 'Ô', 'deckhand'), person('gac-sa-lan', '#4b4f58', 'G', 'ran-den'), person('gac-trum', '#3f4650', 'G', 'ran-den'),
  person('gac-xam', '#5a4b4b', 'G', 'ran-den'), person('gac-den', '#2e333b', 'Đ', 'ran-den'), person('ba-ban-day', '#b49a6a', 'B', 'vendor-woman'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 7, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-sl07-mui', 'photo', 'sl07Mui', 'camera', ['barge']),
  ev('ev-sl07-hong', 'photo', 'sl07Hong', 'camera', ['barge']),
  ev('ev-sl07-cabin', 'photo', 'sl07Cabin', 'camera', ['barge', 'searchlight']),
  ev('ev-sl07-gac', 'place', 'sl07Gac', 'boat', ['barge', 'sen-vang'], 'SL 07'),
  ev('ev-gac-sa-lan', 'recording', 'gacSaLan', 'ear', ['barge', 'luc', 'cuong']),
  ev('ev-dinh-vi', 'object', 'dinhVi', 'pin', ['barge', 'drugs', 'tracker']),
  ev('ev-cont-07', 'place', 'cont07', 'container', ['barge', 'victims']),
  ev('ev-loi-hoa', 'testimony', 'loiHoa', 'quote', ['hoa', 'mai', 'b2', 'cuong']),
  ev('ev-sen-than-hoa', 'object', 'senHoa', 'lotus', ['mai', 'hoa']),
  ev('ev-luc-toi-ben', 'testimony', 'lucBen', 'police', ['luc', 'police']),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [
  note('j-ao-ong-tu', 'diary', 'aoOngTu'), note('j-van-dinh-chi', 'notes', 'vanDinhChi'), note('j-loc', 'people', 'loc'),
  note('j-hoa-mai', 'people', 'hoaMai'), note('j-da-cuu', 'diary', 'daCuu'), note('j-luc-song', 'notes', 'lucSong'),
];
export const QUESTIONS: QuestionDef[] = [{
  id: 'aiBaoLuc', prompt: '@c7m3.q.luc', answer: 'cuong', cost: 1, hint: '@c7m3.q.luc.hint',
  options: [
    { id: 'cuong', text: '@c7m3.q.luc.cuong', needs: ['ev-luc-toi-ben', 'ev-luc-noi'] },
    { id: 'loc', text: '@c7m3.q.luc.loc' }, { id: 'quang', text: '@c7m3.q.luc.quang' }],
  onCorrect: [{ k: 'flag', name: 'knowsLucRiver' }, { k: 'journal', id: 'j-luc-song' }],
}];

/** Chapter 7 plays on the map: the barge deck is a map overlay of the spaces lane (no off-map space, no anchors). */
export const ANCHORS: Record<string, Record<string, string>> = {};
/**
 * Case-board cards this chapter adds to BẢNG MANH MỐI and the strings that tie them to chapters 2, 5 and this one.
 * Slots 46–51 (chapters 1–5 hold 0–33; 34–45 are left to chapter 6's iron box and the pagoda).
 */
export const BOARD_CARDS: BoardCard[] = [
  { id: 'ev-sl07-gac', slot: 46 }, { id: 'ev-dinh-vi', slot: 47 }, { id: 'ev-loi-hoa', slot: 48 }, { id: 'ev-sen-than-hoa', slot: 49 },
  { id: 'ev-luc-toi-ben', slot: 50 }, { id: 'ev-gac-sa-lan', slot: 51 },
];
export const BOARD_LINKS: [string, string][] = [
  // the whiteboard and Cường's words at KHO 7 (ch.2) were this barge
  ['ev-bang-trang', 'ev-sl07-gac'], ['ev-cuong-noi', 'ev-sl07-gac'],
  ['ev-sl07-gac', 'ev-dinh-vi'], ['ev-sl07-gac', 'ev-loi-hoa'], ['ev-sl07-gac', 'ev-gac-sa-lan'],
  // the girl of the eyeliner note (ch.2) speaks; Mai's lotuses (ch.5 spa) and the red pen line to B2 (ch.5)
  ['ev-loi-hoa', 'ev-giay-hoa'], ['ev-loi-hoa', 'ev-sen-than-hoa'], ['ev-sen-than-hoa', 'ev-sen-than-spa'], ['ev-loi-hoa', 'ev-so-do-b2'],
  // "Dời hết hàng ra sà lan" (ch.5 mirror room), the guards' "ông Lực bao", and Lực at the pier
  ['ev-luc-toi-ben', 'ev-luc-noi'], ['ev-gac-sa-lan', 'ev-luc-toi-ben'],
];

/**
 * Engine ids this chapter uses beyond story/contract.ts, by contract kind, with the lane that builds them (the
 * integrator adds them to ENGINE_CONTRACT; scripts/story-ch07.test.mjs lints the chapter against the contract plus
 * these, and fails if one is unused).
 */
export const ENGINE_NEEDS: Partial<Record<ContractKind, Record<string, ContractEntry>>> = {
  arenas: {
    'sa-lan-07': ['stealth', "the anchored barge SÀ LAN 07 (map overlay on the hull of SITES['sa-lan-07']): steel deck (surface 'metal', running clangs), six containers in two rows with 1 m side walks and cross gaps (dark gaps are hide spots for bodies; container doors are 'container' hide spots), the wheelhouse searchlight (SearchlightSpec, operator 'gac-den' on the roof, sweeps water and deck; a swimmer or a follower in the beam raises 'detected' {id:'den-pha'}; a moving swimmer is lit, a floating-still one in the rain is not), tyre fenders and the stern ladder; variant 'day' (c7-m1: guards watch a passing tourist boat, cones only with T) and 'night' (c7-m2: rain, flashlights, two chatting pairs that split on their patrol waits)"],
  },
  models: {
    speedboat: ['vehicles', "the hire speedboat (boats.ts 'speedboat' body) as a story vehicle the player drives ('ca-no'); a vehicle act with a route and no driver drifts it at the cruise speed (c7-m2: lights off, not a detection target)"],
    'speedboat-dark': ['vehicles', 'enemy speedboat (chase-wanted.md §6.1): paint #1d2024, a gunman seated at the bow; driven by the boatChase controller'],
    tug: ['vehicles', "the ring's tug (boatGeometry('fishing') ×1.3, wheelhouse, a fake-cone searchlight that tracks the player in the chase)"],
    'police-boat': ['vehicles', "Thiếu tá Lộc's river-police boat: speedboat repaint dark blue #1f3f78 and white, light bar"],
    'barge-container': ['vehicles', "boats.ts' traffic barge switched to anchored at its site in chapter 7 (lane suspended; hull obstacle for swimmers and boats through addHull), container-deck variant with the wheelhouse searchlight"],
  },
  outfits: { 'tin-ao-tu': ['core', "Tín in Ông Tư's faded dark jacket over the T-shirt, Ông Tư's whistle on its cord (from chapter 7; stealth visibility ×0.9)"] },
  meters: {
    'cover:visitor': ['stealth', 'VỎ BỌC KHÁCH as a tourist on a hired speedboat 0..1 (c7-m1): stopping, circling or closing within 15 m of the barge fills it; 1 is blown'],
    'hull:ca-no': ['vehicles', "the player boat's hull health 0..1 in the boat chase (host hook H-7; at 0 the boat sinks and its state becomes 'wrecked')"],
  },
  templates: { 'river-cop': ['director', 'river-police extra: dark-blue uniform, life vest (c7-m3 handover)'] },
  stings: { 'tug-horn': ['audio', "the tug's horn, long and low, across the river in the rain"] },
  clips: {
    'vault-rail': ['director', 'a hand on the rail, a vault over it and down into a seat below (slow motion in CS c7m3-nhay)'],
    'point-at': ['director', 'an arm raised, pointing straight at someone'],
    'radio-talk': ['director', 'a handheld radio raised to the mouth, thumb on the talk button'],
  },
  sceneProps: {
    jacket: ['director', "Ông Tư's faded dark jacket, folded (handed over, then worn)"], whistle: ['director', "Ông Tư's old police whistle on a cord, on Tín's chest"],
    radio: ['director', 'a handheld police radio'], 'zip-ties': ['director', 'a bundle of black plastic zip ties'], 'gps-tracker': ['director', 'a matchbox-sized GPS tracker'],
    padlock: ['director', "a container padlock (variant 'cut': the shackle snapped)"], 'bolt-cutters': ['director', 'long-handled bolt cutters'],
    'lotus-cardboard': ['director', 'a scrap of cardboard with a lotus drawn in charcoal'], blanket: ['director', 'a grey emergency blanket round the shoulders'],
    'cup-hot': ['director', 'a paper cup of hot water, steaming in the rain'],
  },
  fx: {
    searchlight: ['director', 'a rotating searchlight cone over rain, water and deck (additive fake cone)'],
    'bullet-splash': ['director', 'white water columns where bullets hit the river (no hit on anyone; slow motion)'],
    'police-lights': ['director', 'red and blue light bars sweeping wet surfaces'],
  },
  sfx: {
    'bolt-cut': ['audio', 'bolt cutters snapping a padlock'], 'searchlight-hum': ['audio', 'the searchlight motor whirring in the rain'],
    'child-cough': ['audio', "a child's muffled cough behind steel"], 'gunfire-burst': ['audio', 'bursts of gunfire across the water (never a hit on screen)'],
    'engine-roar': ['audio', 'an outboard opened to full throttle'], 'siren-short': ['audio', "a ward car's siren whoop"],
  },
  ambience: { 'rain-river': ['audio', 'heavy rain on the river and on a steel deck'] },
};

export const chapter = defineChapter({
  chapter: 7,
  missions: [c7m1, c7m2, c7m3],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, questions: QUESTIONS, places: PLACES,
  text: TEXT,
});
