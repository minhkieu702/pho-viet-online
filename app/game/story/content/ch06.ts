import {
  defineChapter, defineMission, type Act, type BoardCard, type BoardDef, type CastDef, type Cond, type EvidenceDef, type FailDef, type JournalDef, type Line,
  type PlaceDef, type QuestionDef, type WorldPolicy,
} from '../types.ts';
import type { ContractEntry, ContractKind } from '../contract.ts';
import { BOARD_CARDS as CH2_CARDS } from './ch02.ts';
import { BOARD_CARDS as CH3_CARDS } from './ch03.ts';
import { BOARD_CARDS as CH4_CARDS } from './ch04.ts';
import { BOARD_CARDS as CH5_CARDS } from './ch05.ts';
import { TEXT } from '../text/vi/ch06.ts';

/**
 * Chương 6 · KẺ PHẢN BỘI (story-final.md ch.6 with story-decisions.md 4, 11, 12, 14, 21, 22 and §8 "c6-m1 / c6-m2"):
 * c6-m1 the rice-donation morning at CHÙA AN HÒA (walk-and-talk with Vân carrying a rice sack, the memory card with
 * Lực's clip handed over inside it, kneeling among the worshippers to overhear Phượng and Thầy Minh Tịnh, CS05 "Sen bị
 * hái"), the low-pressure tail of her black car into Quận 1 and its ramp at TÒA THÁP TÀI CHÍNH, the 50.000đ ticket up
 * THÁP PHƯƠNG NAM to photograph her helicopter on the flat roof pad next door (decision 11; the jump gate is seen, the
 * finale seeded), the drive-by at CHUNG CƯ SÔNG XANH and "Tối nay qua lấy"; c6-m2 at SỬA XE TƯ (decision 4): the 2014
 * iron box (three documents), Quang's text to the tracked smartphone that every reply answers with the shop,
 * CS06 in three parts, the escape carrying the box over the real roofs (XE MÁY 7.3 m → bamboo scaffold → PHỞ 12.6 m →
 * the 1.8 m gap → BÁNH CUỐN 10.19 m → water tank → downpipe), the forced "Quay lại", two takedowns in the back alley,
 * the smoke (crouch to breathe), Ông Tư's whistle and his last plate question, the collapsing shop, the box recovered
 * and Lực's officers there before the fire brigade (two forced stars) — chained into c6-m3 at dawn: Cô Ba on the back
 * stairs, the {@app} "Tài xế gần bạn" map, the pier chase and the two QTEs (the punch may be held back), Quang's
 * confession and 'Bỏ đi' / 'Kéo nó dậy', the box opened on the pier (Diễm's 2014 missing-person file, Hải's notebook),
 * the board "Cái hộp năm 2014" and its question (where the barge anchors on the night of mùng 10), and the prayer
 * service (lễ cầu siêu: forensics still hold the body) at the pagoda with Phượng's wreath. Non-lethal throughout (lethal: 'fail'; a chokehold slip never kills, flags.ts);
 * the pagoda sees no combat (decision 22), Ông Tư's death and the blows of CS06 stay off screen.
 *
 * Places are story/sites.ts ids, this chapter's PLACES ('ch6.*', checked against today's map by
 * scripts/story-ch06.test.mjs) or anchors of the off-map spaces declared in ANCHORS ('xe-may-shop/cub'); texts are
 * '@keys' of text/vi/ch06.ts; brand constants ({@app}, {@ring}, {@ringUpper}, {@bank}) come from text/vi/common.ts.
 * Register in content/index.ts LOADERS: `6: () => import('./ch06.ts'),`.
 * Cast from earlier chapters: tin, quang, coba, tu (ch.1), cuong (ch.2), van, bin (ch.3). New here: phuong, thay-minh-tinh,
 * tai-xe-phuong (her driver and bodyguard), phat-tu, gac-lua, gac-hem, cong-an-phuong, chu-ca-no. Later chapters reuse these
 * ids and never redefine them.
 *
 * Engine ids used here are in story/contract.ts, plus ENGINE_NEEDS below (ids this chapter adds, with their lane): the
 * QTE, the phone's rider map and the fire op, the arena of the burning shop, Phượng's car, the whistle outfit, the
 * iron box and the rice sack, kneeling, the pagoda dressing and the cutscene clips, props, fx and sounds.
 */

const H = Math.PI / 2, PI = Math.PI;
const NO_HUB: WorldPolicy['activities'] = { gunStore: false, bank: false, deck: false, boatRental: false, sideJobs: false, orders: false };
const say = (who: string, key: string, o: Omit<Line, 'who' | 'text'> = {}): Line => ({ who, text: `@${key}`, ...o });
const think = (key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say('tin', key, { voice: 'think', ...o });
const phone = (who: string, key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say(who, key, { voice: 'phone', ...o });
const talk = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines });
const aside = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines, mode: 'ambient' });
const hint = (key: string, ms = 7000): Act => ({ k: 'hint', text: `@${key}`, ms });
const bark = (actor: string, key: string, shout = false): Act => ({ k: 'bark', actor, text: `@${key}`, shout });
const reach = (at: string, r = 3): Cond => ({ k: 'reach', at, r });
const used = (id: string): Cond => ({ k: 'on', ev: 'interact', id });
const climbed = (id: string): Cond => ({ k: 'on', ev: 'climb', id });
const owned = (id: string): Cond => ({ k: 'evidence', id });
const after = (seconds: number): Cond => ({ k: 'after', seconds });
const flag = (name: string, eq?: boolean | string): Cond => (eq === undefined ? { k: 'flag', name } : { k: 'flag', name, eq });
const ko = (id: string): Cond => ({ k: 'on', ev: 'knockout', id });
const detected: Cond = { k: 'on', ev: 'detected' };
/** Teleport unless the player is already there on that surface `level` (null: the ground); see content/ch01.ts. */
const put = (at: string, vehicle?: string, r = 8, level: string | null = null): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });
/** A checkpoint inside an off-map space: enter it first when a skip lands here from outside (a restore re-enters it already). */
const inSpace = (space: string, link: string): Act => ({ k: 'if', c: { k: 'space', id: space }, then: [], else: [{ k: 'space', enter: space, link }] });
/** Seen by a guard of the arena: back to the last checkpoint; after three tries the card offers 'Bỏ qua đoạn này'. */
const caught = (reason: string, skipTo?: string): FailDef => ({ when: detected, reason: `@${reason}`, allowSkipAfter: 3, ...(skipTo ? { skipTo } : {}) });
/** A step timer (StepDef.timer) running out: the fail card, with 'Bỏ qua đoạn này' after three tries. */
const timedOut = (step: string, reason: string): FailDef => ({ when: { k: 'on', ev: 'timer', id: step }, reason: `@${reason}`, allowSkipAfter: 3 });
/** Stealth rules of the chapter: takedowns allowed, no guns, nobody dies (LƯƠNG TÂM), crimes raise the ring's alarm. */
const RULES = { takedowns: true, guns: 'none', lethal: 'fail', failOn: [], showCones: 'observe', countConscience: true, respawn: 'checkpoint', policeSuppressed: true };
/** Abilities chapters 1–5 unlocked, for the replay sandboxes. */
const ABIL = ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'observe', 'throw', 'takedown', 'drag', 'faceCover', 'clipCam'];

// ---- c6-m1 · Cuộc hẹn ở chùa ------------------------------------------------------------------------------------

/** The black-and-gold helicopter parked on TÒA THÁP TÀI CHÍNH's roof pad (decision 11), rotor still, nose east. */
const HELI: Act = { k: 'do', op: 'heli', args: { id: 'heli-phuong', mode: 'park', at: 'san-thuong-tai-chinh.pad', livery: 'sen-vang', yaw: H, rotor: 0 } };
/** Phượng's black car at the pagoda gate (her driver at the wheel); `o` adds the route and state. */
const limo = (o: Partial<Extract<Act, { k: 'vehicle' }>> = {}): Act => ({ k: 'vehicle', id: 'xe-phuong', model: 'limo-den', at: 'chua-an-hoa.car', yaw: H, driver: 'tai-xe-phuong', state: 'park', ...o });
const TAIL: Act = { k: 'tail', target: 'xe-phuong', band: [15, 70], lose: { far: 110, seconds: 14 }, mirror: true };
/** Worshippers on the mats in front of the hall (borrowed residents). */
const WORSHIP: Act[] = [
  { k: 'spawn', id: 'phat-tu-1', cast: 'phat-tu', template: 'resident', at: 'chua-an-hoa.matW', team: 'neutral', behaviour: { k: 'act', name: 'kneel-pray' } },
  { k: 'spawn', id: 'phat-tu-2', cast: 'phat-tu', template: 'resident', at: 'chua-an-hoa.matE', team: 'neutral', behaviour: { k: 'act', name: 'kneel-pray' } },
];
/** Phượng, the abbot and her driver in the yard, Vân kneeling on the east mat (the eavesdrop checkpoint rebuilds them). */
const YARD: Act[] = [
  { k: 'spawn', id: 'van', cast: 'van', at: 'chua-an-hoa.matE', team: 'ally', behaviour: { k: 'act', name: 'kneel-pray' } },
  { k: 'spawn', id: 'phuong', cast: 'phuong', at: 'ch6.lu-huong', team: 'neutral', behaviour: { k: 'act', name: 'light-incense' } },
  { k: 'spawn', id: 'thay-minh-tinh', cast: 'thay-minh-tinh', at: 'ch6.thay', team: 'ally', behaviour: { k: 'act', name: 'light-incense' } },
  { k: 'spawn', id: 'tai-xe-phuong', cast: 'tai-xe-phuong', at: 'chua-an-hoa.gate', team: 'neutral', behaviour: { k: 'guard', post: 'chua-an-hoa.gate', sweep: 60 } },
  limo(),
];
const BANNER: Act = { k: 'photoTarget', id: 'bang-ron', subject: 'chua-an-hoa.gate', evidence: 'ev-bang-ron', minQuality: 0.5, scope: 'mission' };

const c6m1 = defineMission({
  id: 'c6-m1', meta: { hours: [7, 10], giver: 'van' }, lethal: 'fail',
  start: { at: 'chua-an-hoa.gate', yaw: 0, hour: 8, weather: 'clear', lunar: 8, outfit: 'tin-wrist-wrap' },
  world: { traffic: 'normal', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 8, freeze: true }, weather: { set: 'clear', lock: true }, exclusions: ['chua-an-hoa'], activities: NO_HUB },
  setup: [
    { k: 'prop', id: 'le-phat-gao', kind: 'le-chua', at: 'chua-an-hoa', variant: 'phat-gao' },
    HELI,
    { k: 'vehicle', id: 'dream', model: 'dream', at: 'ch6.dream-chua', yaw: H, state: 'park' },
  ],
  steps: [
    {
      id: 'sang', minutes: 0.2,
      enter: [
        { k: 'title', kind: 'time', text: '@c6m1.title', sub: '@c6m1.titleSub' },
        ...WORSHIP,
        { k: 'spawn', id: 'van', cast: 'van', at: 'chua-an-hoa.gate', team: 'ally', behaviour: { k: 'idle' } },
        aside('c6m1-dau', [think('c6m1.think.dau')]),
      ],
    },
    {
      // walk-and-talk: Vân only talks while Tín keeps up (the director pauses her lines beyond 8 m)
      id: 'di-cung-van', minutes: 0.7, objective: '@c6m1.obj.van',
      subs: [{ id: 'sat', text: '@c6m1.sub.sat', done: { k: 'hold', seconds: 12, c: { k: 'near', a: 'van', b: 'player', r: 4 } } }],
      enter: [
        { k: 'player', carry: 'bao-gao', lock: ['run'] },
        { k: 'behave', id: 'van', b: { k: 'patrol', route: ['chua-an-hoa.gate', 'chua-an-hoa.matW', 'chua-an-hoa.matE'], waits: [2, 3, 3] } },
        BANNER, hint('c6m1.hint.sat', 8000),
        aside('c6m1-di', [say('van', 'c6m1.v1'), say('van', 'c6m1.v2'), say('tin', 'c6m1.t1'), say('van', 'c6m1.v3'), say('van', 'c6m1.v4'), say('van', 'c6m1.v5')]),
      ],
    },
    {
      id: 'dua-the', minutes: 0.3, objective: '@c6m1.obj.dua', marker: { at: 'chua-an-hoa.matE', label: '@c6m1.mk.van', style: 'talk' },
      interact: [{ id: 'dua-the', at: 'chua-an-hoa.matE', r: 1.8, prompt: '@c6m1.int.dua', kind: 'use', when: 'foot' }],
      enter: [{ k: 'behave', id: 'van', b: { k: 'goto', at: 'chua-an-hoa.matE' } }],
      done: used('dua-the'),
      exit: [
        { k: 'player', carry: null, lock: null }, { k: 'flag', name: 'gaveClipToVan' }, { k: 'time', hour: 8.6 },
        { k: 'behave', id: 'van', b: { k: 'act', name: 'kneel-pray' } },
        limo(),
        { k: 'spawn', id: 'phuong', cast: 'phuong', at: 'chua-an-hoa.gate', team: 'neutral', behaviour: { k: 'goto', at: 'ch6.lu-huong' } },
        { k: 'spawn', id: 'tai-xe-phuong', cast: 'tai-xe-phuong', at: 'chua-an-hoa.gate', team: 'neutral', behaviour: { k: 'guard', post: 'chua-an-hoa.gate', sweep: 60 } },
        { k: 'spawn', id: 'thay-minh-tinh', cast: 'thay-minh-tinh', at: 'ch6.thay', team: 'ally', behaviour: { k: 'act', name: 'light-incense' } },
        talk('c6m1-ba-ta', [say('van', 'c6m1.v6'), say('van', 'c6m1.v7'), say('tin', 'c6m1.t2'), say('van', 'c6m1.v8')]),
        aside('c6m1-chi-phuong', [think('c6m1.think.phuong')]),
      ],
    },
    {
      // the worshippers are the cover: kneeling on a mat is "hidden" for the eavesdrop; walking up to her is noticed
      id: 'nghe-len', minutes: 0.7, objective: '@c6m1.obj.nghe',
      checkpoint: { label: '@c6m1.cp.nghe', setup: [put('chua-an-hoa.gate', undefined, 14), { k: 'time', hour: 8.6 }, { k: 'player', carry: null, lock: null }, ...WORSHIP, ...YARD, BANNER] },
      subs: [
        { id: 'quy', text: '@c6m1.sub.quy', done: used('quy-chieu') },
        { id: 'nghe', text: '@c6m1.sub.nghe', done: { k: 'on', ev: 'eavesdrop', id: 'phuong-thay' } },
      ],
      interact: [{ id: 'quy-chieu', at: 'chua-an-hoa.matW', r: 1.6, prompt: '@c6m1.int.quy', kind: 'seat', when: 'foot' }],
      meters: [{ id: 'eavesdrop:phuong-thay', label: '@c6m1.meter.nghe', kind: 'bar', max: 1 }],
      enter: [
        { k: 'behave', id: 'phuong', b: { k: 'act', name: 'light-incense' } },
        { k: 'eavesdrop', id: 'phuong-thay', source: 'phuong', r: 6, seconds: 10, requireHidden: true, lines: [
          say('phuong', 'c6m1.n1'), say('thay-minh-tinh', 'c6m1.n2'), say('phuong', 'c6m1.n3'), say('thay-minh-tinh', 'c6m1.n4'), say('phuong', 'c6m1.n5')] },
        hint('c6m1.hint.quy', 8000),
      ],
      watchers: [{ when: used('quy-chieu'), do: [{ k: 'player', pose: 'kneel' }] }],
      fail: [{ when: { k: 'near', a: 'phuong', b: 'player', r: 2 }, reason: '@c6m1.fail.gan', soft: true }],
      retry: [{ k: 'player', pose: null }, { k: 'teleport', at: 'chua-an-hoa.gate' }],
      exit: [
        { k: 'cutscene', id: 'cs05_sen_bi_hai' }, { k: 'player', pose: null },
        { k: 'evidence', id: 'ev-phuong-chua' }, { k: 'evidence', id: 'ev-danh-thiep-phuong' }, { k: 'journal', id: 'j-phuong' }, { k: 'flag', name: 'metPhuong' },
        { k: 'despawn', id: 'phuong' }, { k: 'despawn', id: 'tai-xe-phuong' },
        talk('c6m1-ma', [think('c6m1.think.ma1'), think('c6m1.think.ma2')]),
      ],
    },
    {
      id: 'len-xe', minutes: 0.2, objective: '@c6m1.obj.xe', marker: { at: 'ch6.dream-chua', label: '@c6m1.mk.xe', style: 'go' },
      enter: [aside('c6m1-van-di', [say('van', 'c6m1.v9')])],
      done: { k: 'reach', at: 'ch6.dream-chua', r: 3, mode: 'bike' },
      exit: [{ k: 'despawn', id: 'van' }],
    },
    {
      id: 'bam-xe', minutes: 0.9, objective: '@c6m1.obj.bam',
      checkpoint: { label: '@c6m1.cp.bam', setup: [put('ch6.dream-chua', 'dream', 3), limo({ route: 'r-limo', cruise: 7, obeyLights: true, state: 'drive' }), TAIL] },
      meters: [{ id: 'tail:xe-phuong', label: '@c6m1.meter.tail', kind: 'band' }],
      enter: [hint('c6m1.hint.bam', 8000)],
      watchers: [{ when: after(8), do: [{ k: 'call', id: 'c6m1-bien-so', from: 'van', ring: true, burner: true, lines: [phone('van', 'c6m1.v10'), phone('tin', 'c6m1.t3'), phone('van', 'c6m1.v11')] }] }],
      done: { k: 'on', ev: 'arrived', id: 'xe-phuong' },
      fail: [
        { when: { k: 'on', ev: 'lost', id: 'xe-phuong' }, reason: '@c6m1.fail.mat', allowSkipAfter: 3 },
        { when: { k: 'on', ev: 'spotted', id: 'xe-phuong' }, reason: '@c6m1.fail.lo', allowSkipAfter: 3 },
      ],
    },
    {
      // the shutter rises slowly: the car waits at the ramp mouth; if the photo is missed, Tín remembers the plate
      id: 'vao-ham', minutes: 0.3, objective: '@c6m1.obj.ham', marker: { at: 'tai-chinh.ramp', style: 'subtle' },
      enter: [
        { k: 'stop', id: 'xe-phuong' },
        { k: 'vehicle', id: 'xe-phuong', route: ['tai-chinh.ramp'], cruise: 3, state: 'drive' },
        { k: 'photoTarget', id: 'xe-ham', subject: 'xe-phuong', evidence: 'ev-xe-phuong', minQuality: 0.5, scope: 'step' },
        hint('c6m1.hint.ham'),
      ],
      watchers: [{ when: after(20), do: [{ k: 'if', c: { k: 'not', c: owned('ev-xe-phuong') }, then: [{ k: 'evidence', id: 'ev-xe-phuong' }, aside('c6m1-nho', [think('c6m1.think.ham')])] }] }],
      done: owned('ev-xe-phuong'),
    },
    {
      id: 'goi-van', minutes: 0.2,
      enter: [{ k: 'call', id: 'c6m1-toa-thap', from: 'van', ring: true, burner: true, lines: [phone('van', 'c6m1.v12'), phone('van', 'c6m1.v13'), phone('tin', 'c6m1.t4'), phone('van', 'c6m1.v14')] }],
    },
    {
      id: 'thap', minutes: 0.3, objective: '@c6m1.obj.thap', marker: { at: 'thap-phuong-nam', label: '@c6m1.mk.thap', style: 'go' },
      interact: [{ id: 'mua-ve', at: 'thap-phuong-nam', r: 2.5, prompt: '@c6m1.int.ve', kind: 'use', when: 'foot' }],
      done: used('mua-ve'),
      exit: [
        { k: 'cash', n: -50 }, { k: 'toast', text: '@c6m1.toast.ve' },
        { k: 'fade', to: 'black', ms: 700 }, { k: 'time', hour: 9.6 }, { k: 'teleport', at: 'dai-quan-sat-68' },
        { k: 'title', kind: 'place', text: '@c6m1.titleDai', sub: '@c6m1.titleDaiSub' }, { k: 'fade', to: 'clear', ms: 700 },
      ],
    },
    {
      // decision 11: the helicopter cannot be seen from the street (the parapet hides it); from the 68th floor it can
      id: 'dai', minutes: 0.5, objective: '@c6m1.obj.dai', marker: { at: 'dai-quan-sat-68.photo', style: 'go' },
      checkpoint: { label: '@c6m1.cp.dai', setup: [
        put('dai-quan-sat-68', undefined, 6), { k: 'time', hour: 9.6 },
        // 'Bỏ qua đoạn này' after a lost tail lands here: the plate is in Tín's memory all the same
        { k: 'if', c: { k: 'not', c: owned('ev-xe-phuong') }, then: [{ k: 'evidence', id: 'ev-xe-phuong' }] }] },
      enter: [{ k: 'photoTarget', id: 'truc-thang', subject: 'san-thuong-tai-chinh.pad', evidence: 'ev-truc-thang', minQuality: 0.5, scope: 'step' }, hint('c6m1.hint.dai', 8000)],
      done: owned('ev-truc-thang'),
      exit: [aside('c6m1-truc-thang', [think('c6m1.think.trucThang')]), { k: 'cutscene', id: 'c6m1-cong-nhay' }],
    },
    {
      id: 'xuong', minutes: 0.5, objective: '@c6m1.obj.songXanh', marker: { at: 'song-xanh', label: '@c6m1.mk.songXanh', style: 'go' },
      enter: [
        { k: 'fade', to: 'black', ms: 700 }, { k: 'teleport', at: 'ch6.dream-q1', vehicle: 'dream' }, { k: 'fade', to: 'clear', ms: 700 },
        { k: 'sms', from: 'van', text: '@c6m1.sms.nha', burner: true },
      ],
      done: { k: 'reach', at: 'song-xanh', r: 18, mode: 'bike' },
    },
    {
      id: 'song-xanh', minutes: 0.3,
      enter: [
        talk('c6m1-nha', [think('c6m1.think.nha1'), think('c6m1.think.nha2')]),
        { k: 'call', id: 'c6m1-dong-tien', from: 'van', ring: true, burner: true, lines: [
          phone('van', 'c6m1.v15'), phone('van', 'c6m1.v16'), phone('tin', 'c6m1.t5'), phone('van', 'c6m1.v17'), phone('tin', 'c6m1.t6'), phone('van', 'c6m1.v18')] },
      ],
    },
  ],
  optional: [{ id: 'bang-ron', text: '@c6m1.opt.bang', when: owned('ev-bang-ron') }],
  rewards: [{ k: 'flag', name: 'tailedPhuong' }],
  medals: { par: 330, clues: ['bang-ron'] },
  replay: { abilities: ABIL },
});

// ---- c6-m2 · Lửa ở tiệm xe ----------------------------------------------------------------------------------------

/** Fire on SỬA XE TƯ: 1 the shutter alight, 2 the shop ablaze with a smoke column, 3 the burnt-out ruin. */
const fire = (stage: number): Act => ({ k: 'do', op: 'fire', args: { id: 'tiem-tu', at: 'xe-may-ong-tu', stage } });
/** The iron box set down somewhere (a prop of one id that moves). */
const boxAt = (at: string): Act[] => [{ k: 'prop', id: 'hop', remove: true }, { k: 'prop', id: 'hop', kind: 'iron-box', at }];
const BOX_GONE: Act = { k: 'prop', id: 'hop', remove: true };
const CARRY_BOX: Act = { k: 'player', carry: 'hop-sat', lock: ['run'] };
const HANDS_FREE: Act = { k: 'player', carry: null, lock: null };
const ROOF = 'roof';
/** The arena of the burning shop and the Rắn Đen with flashlights sweeping the roofs from the street and the alley. */
const ROOF_GUARDS: Act[] = [
  { k: 'stealth', arena: 'tiem-chay', variant: 'lua', rules: RULES },
  { k: 'spawn', id: 'gac-lua-1', cast: 'gac-lua', template: 'ran-den', at: 'xe-may-ong-tu', team: 'hostile', flashlight: true, tags: ['lua'], behaviour: { k: 'guard', post: 'xe-may-ong-tu', sweep: 80 } },
  { k: 'spawn', id: 'gac-lua-2', cast: 'gac-lua', template: 'ran-den', at: 'xe-may-alley.eastMouth', team: 'hostile', flashlight: true, tags: ['lua'],
    behaviour: { k: 'patrol', route: ['xe-may-alley.eastMouth', 'xe-may-alley.start', 'xe-may-alley.gravel'], waits: [3, 2, 3] } },
  { k: 'spawn', id: 'gac-lua-3', cast: 'gac-lua', template: 'ran-den', at: 'banh-mi.curb', team: 'hostile', flashlight: true, tags: ['lua'], behaviour: { k: 'guard', post: 'banh-mi.curb', sweep: 60 } },
];
/** The back alley after the drop: one Rắn Đen at the front, two at the back door (the takedowns). */
const ALLEY_GUARDS: Act[] = [
  { k: 'stealth', arena: 'tiem-chay', variant: 'lua', rules: RULES },
  { k: 'despawn', tag: 'lua' },
  { k: 'spawn', id: 'gac-lua-1', cast: 'gac-lua', template: 'ran-den', at: 'xe-may-ong-tu', team: 'hostile', flashlight: true, tags: ['lua'], behaviour: { k: 'guard', post: 'xe-may-ong-tu', sweep: 80 } },
  { k: 'spawn', id: 'gac-hem-1', cast: 'gac-hem', template: 'ran-den', at: 'xe-may-alley.start', team: 'hostile', tags: ['hem'], behaviour: { k: 'act', name: 'cross-arms' } },
  { k: 'spawn', id: 'gac-hem-2', cast: 'gac-hem', template: 'ran-den', at: 'xe-may-alley.gravel', team: 'hostile', flashlight: true, tags: ['hem'],
    behaviour: { k: 'patrol', route: ['xe-may-alley.gravel', 'xe-may-alley.puddle', 'xe-may-alley.bamboo'], waits: [3, 2, 4] } },
];
const BURNING: Act = { k: 'space', variant: { id: 'xe-may-shop', v: 'burning' } };
const STEALTH_HUD = { light: true, noise: true };
const interactable = (id: string, at: string, prompt: string, o: Partial<Extract<Act, { k: 'interactable' }>> = {}): Act =>
  ({ k: 'interactable', id, at, prompt: `@${prompt}`, r: 1.6, kind: 'use', when: 'foot', scope: 'step', ...o });

const c6m2 = defineMission({
  id: 'c6-m2', meta: { hours: [21, 23], giver: 'tu' }, chain: 'c6-m3', lethal: 'fail',
  start: { at: 'cafe-co-ba.dream', yaw: PI, vehicle: 'dream', hour: 21.75, weather: 'clear', lunar: 8, outfit: 'tin-wrist-wrap' },
  world: { traffic: 'night', crowd: 'night', police: 'story', maxWanted: 2, gangs: 'calm', clock: { hour: 21.75, freeze: true }, weather: { set: 'clear', lock: true }, exclusions: ['xe-may-alley'], activities: NO_HUB },
  steps: [
    {
      id: 'toi', minutes: 0.3,
      enter: [
        { k: 'title', kind: 'time', text: '@c6m2.title', sub: '@c6m2.titleSub' },
        { k: 'sms', from: 'tu', text: '@c6m2.sms.tu', burner: true },
        aside('c6m2-di', [think('c6m2.think.di')]),
      ],
    },
    {
      id: 'vao-hem', minutes: 0.4, objective: '@c6m2.obj.hem', marker: { at: 'ch6.dream-hem', label: '@c6m2.mk.hem', style: 'go' },
      done: { k: 'reach', at: 'ch6.dream-hem', r: 3, mode: 'bike' },
    },
    {
      id: 'cua-sau', minutes: 0.2, objective: '@c6m2.obj.cua', marker: { at: 'xe-may-ong-tu.backDoor', style: 'go' },
      interact: [{ id: 'go-cua', at: 'xe-may-ong-tu.backDoor', r: 1.8, prompt: '@c6m2.int.cua', kind: 'enter', when: 'foot' }],
      done: used('go-cua'),
      exit: [{ k: 'space', enter: 'xe-may-shop', link: 'back' }],
    },
    {
      id: 'hop-sat', minutes: 1, objective: '@c6m2.obj.hop',
      checkpoint: { label: '@c6m2.cp.hop', setup: [
        inSpace('xe-may-shop', 'back'), put('xe-may-shop/backRoom', undefined, 4),
        { k: 'spawn', id: 'tu', cast: 'tu', at: 'xe-may-shop/backRoom', team: 'ally', behaviour: { k: 'act', name: 'cross-arms' } }, ...boxAt('xe-may-shop/box')] },
      subs: [
        { id: 'anh', text: '@c6m2.sub.anh', done: owned('ev-anh-ba-lua') },
        { id: 'ban-do', text: '@c6m2.sub.banDo', done: owned('ev-ban-do-sa-lan') },
        { id: 'ghi-chu', text: '@c6m2.sub.ghiChu', done: owned('ev-nguoi-giu-so-chi') },
      ],
      enter: [
        talk('c6m2-mo-hop', [say('tu', 'c6m2.tu1'), say('tu', 'c6m2.tu2')]),
        { k: 'clue', id: 'anh-ba-lua', at: 'xe-may-shop/hopAnh', r: 1.4, evidence: 'ev-anh-ba-lua', examine: 'photo:anh-ba-lua', scope: 'step' },
        { k: 'clue', id: 'ban-do-sa-lan', at: 'xe-may-shop/hopBanDo', r: 1.4, evidence: 'ev-ban-do-sa-lan', examine: 'document:ban-do-sa-lan', scope: 'step' },
        { k: 'clue', id: 'so-chi', at: 'xe-may-shop/hopGhiChu', r: 1.4, evidence: 'ev-nguoi-giu-so-chi', examine: 'document:so-chi', scope: 'step' },
        hint('c6m2.hint.hop'),
      ],
      watchers: [
        { when: owned('ev-anh-ba-lua'), do: [aside('c6m2-anh', [say('tu', 'c6m2.tu.anh1'), say('tu', 'c6m2.tu.anh2'), say('tin', 'c6m2.tin.anh'), say('tu', 'c6m2.tu.anh3')])] },
        { when: owned('ev-ban-do-sa-lan'), do: [aside('c6m2-ban-do', [say('tu', 'c6m2.tu.bd1'), say('tu', 'c6m2.tu.bd2')])] },
        { when: owned('ev-nguoi-giu-so-chi'), do: [aside('c6m2-so-chi', [say('tu', 'c6m2.tu.gc1'), say('tu', 'c6m2.tu.gc2')])] },
      ],
    },
    {
      // the trap: the text reaches the smartphone (the one Ông Tư called the longest tail), and every reply names the shop
      id: 'tin-nhan', minutes: 0.5,
      enter: [
        { k: 'sms', from: 'quang', text: '@c6m2.sms.quang' },
        talk('c6m2-do-du', [
          think('c6m2.think.sms1'), think('c6m2.think.ke', { if: flag('choice:keQuang', 'ke') }), think('c6m2.think.giau', { if: flag('choice:keQuang', 'giau') }),
          think('c6m2.think.sms2')]),
        { k: 'choice', id: 'tinNhan', prompt: '@c6m2.q.tl', style: 'sms', options: [
          { id: 'noi', text: '@c6m2.opt.noi' }, { id: 'toi', text: '@c6m2.opt.toi' }, { id: 'gi', text: '@c6m2.opt.gi' }] },
        { k: 'sms', from: 'quang', text: '@c6m2.sms.quang2' },
        { k: 'evidence', id: 'ev-tin-nhan-quang' }, { k: 'flag', name: 'toldQuangWhere' },
        talk('c6m2-may-nao', [say('tu', 'c6m2.tu3'), say('tin', 'c6m2.tin1'), say('tu', 'c6m2.tu4'), say('tin', 'c6m2.tin2'), say('tu', 'c6m2.tu5')]),
      ],
    },
    {
      id: 'tui-no-toi', minutes: 0.3,
      enter: [{ k: 'time', hour: 22.3 }, { k: 'music', id: 'tension' }, { k: 'cutscene', id: 'cs06_lua_tiem_xe' }, BOX_GONE, fire(1), CARRY_BOX, hint('c6m2.hint.om', 8000)],
    },
    {
      id: 'day-hop', minutes: 0.2, objective: '@c6m2.obj.gac', marker: { at: 'xe-may-shop/loft', style: 'go' },
      checkpoint: { label: '@c6m2.cp.gac', setup: [
        inSpace('xe-may-shop', 'back'), put('xe-may-shop/loft', undefined, 3), { k: 'time', hour: 22.3 }, fire(1), BOX_GONE, CARRY_BOX,
        { k: 'spawn', id: 'tu', cast: 'tu', at: 'xe-may-shop/shutter', team: 'ally', behaviour: { k: 'act', name: 'cross-arms' } }] },
      interact: [{ id: 'day-hop', at: 'xe-may-shop/loft', r: 1.5, hold: 1, prompt: '@c6m2.int.dayHop', kind: 'use', when: 'foot' }],
      done: used('day-hop'),
      exit: [HANDS_FREE, ...boxAt('xe-may-roofs.loft')],
    },
    {
      id: 'len-mai', minutes: 0.2, objective: '@c6m2.obj.gac', marker: { at: 'xe-may-shop/loft', style: 'go' },
      interact: [{ id: 'len-mai', at: 'xe-may-shop/loft', r: 1.5, prompt: '@c6m2.int.lenMai', kind: 'use', when: 'foot' }],
      done: used('len-mai'),
      exit: [{ k: 'despawn', id: 'tu' }, { k: 'space', leave: 'xe-may-roofs.loft' }],
    },
    {
      id: 'om-hop', minutes: 0.2, objective: '@c6m2.obj.omHop', hud: STEALTH_HUD,
      checkpoint: { label: '@c6m2.cp.mai', setup: [put('xe-may-roofs.loft', undefined, 3, ROOF), HANDS_FREE, fire(1), ...boxAt('xe-may-roofs.loft'), ...ROOF_GUARDS] },
      interact: [{ id: 'om-hop', at: 'xe-may-roofs.loft', r: 1.4, prompt: '@c6m2.int.omHop', kind: 'pick', when: 'foot', level: ROOF }],
      enter: [aside('c6m2-lua', [think('c6m2.think.lua')]), bark('gac-lua-1', 'c6m2.bark.lua1', true)],
      done: used('om-hop'),
      // a skip lands on the roof-gap scene, never past it
      fail: [caught('c6m2.fail.lo', 'khe-mai')],
      exit: [BOX_GONE, CARRY_BOX],
    },
    {
      // the box must be set down to climb (stealth-player-kit.md §3.3): down at the scaffold, up the bamboo, hauled up after
      id: 'gian-tre', minutes: 0.9, objective: '@c6m2.obj.gian', hud: STEALTH_HUD,
      timer: { seconds: 150, label: '@c6m2.timer.lua' },
      subs: [
        { id: 'dat', text: '@c6m2.sub.dat', done: used('dat-hop') },
        { id: 'leo', text: '@c6m2.sub.leo', done: climbed('leo-gian-tre') },
        { id: 'keo', text: '@c6m2.sub.keo', done: used('keo-hop') },
      ],
      interact: [{ id: 'dat-hop', at: 'xe-may-roofs.climb', r: 1.4, prompt: '@c6m2.int.dat', kind: 'use', when: 'foot', level: ROOF }],
      enter: [hint('c6m2.hint.den', 8000), { k: 'photoTarget', id: 'xe-ran-den', subject: 'xe-may-ong-tu', evidence: 'ev-xe-ran-den', minQuality: 0.6, scope: 'step' }],
      watchers: [
        { when: used('dat-hop'), do: [HANDS_FREE, ...boxAt('xe-may-roofs.climb'),
          interactable('leo-gian-tre', 'xe-may-roofs.climb', 'c6m2.int.leo', { kind: 'climb', to: 'xe-may-roofs.pho', level: ROOF })] },
        { when: climbed('leo-gian-tre'), do: [interactable('keo-hop', 'xe-may-roofs.pho', 'c6m2.int.keo', { kind: 'pick', hold: 1.5, level: ROOF })] },
        { when: used('keo-hop'), do: [BOX_GONE, CARRY_BOX] },
        { when: after(12), do: [hint('c6m2.hint.ton'), bark('gac-lua-2', 'c6m2.bark.lua2', true)] },
        { when: after(4), do: [hint('c6m2.hint.xe', 6000)] },
      ],
      optional: [{ id: 'xe-ran-den', text: '@c6m2.opt.xe', when: owned('ev-xe-ran-den') }],
      fail: [caught('c6m2.fail.lo', 'khe-mai'), { ...timedOut('gian-tre', 'c6m2.fail.lua'), skipTo: 'khe-mai' }],
    },
    {
      // CS06 cont.: through the gap in the shop roof; then the one answer the chapter allows
      id: 'khe-mai', minutes: 0.3,
      enter: [
        { k: 'time', hour: 22.4 }, { k: 'cutscene', id: 'cs06_lua_tiem_xe_mai' }, fire(2),
        { k: 'choice', id: 'quayLai', prompt: '@c6m2.q.quay', options: [{ id: 'quay-lai', text: '@c6m2.opt.quay' }] },
        aside('c6m2-quay', [think('c6m2.think.quay')]),
      ],
    },
    {
      id: 'giau-hop', minutes: 0.7, objective: '@c6m2.obj.giau', hud: STEALTH_HUD,
      checkpoint: { label: '@c6m2.cp.quay', setup: [put('xe-may-roofs.pho', undefined, 3, ROOF), BOX_GONE, CARRY_BOX, fire(2), ...ROOF_GUARDS] },
      timer: { seconds: 90, label: '@c6m2.timer.lua' },
      subs: [
        { id: 'tha', text: '@c6m2.sub.tha', done: used('tha-hop') },
        { id: 'nhay', text: '@c6m2.sub.nhay', done: climbed('nhay-khe-mai') },
        { id: 'giau', text: '@c6m2.sub.giau', done: used('giau-hop') },
      ],
      interact: [{ id: 'tha-hop', at: 'xe-may-roofs.pho', r: 1.6, hold: 1.5, prompt: '@c6m2.int.tha', kind: 'use', when: 'foot', level: ROOF }],
      watchers: [
        { when: used('tha-hop'), do: [HANDS_FREE, ...boxAt('xe-may-roofs.banhCuon'),
          interactable('nhay-khe-mai', 'xe-may-roofs.pho', 'c6m2.int.nhay', { kind: 'climb', to: 'xe-may-roofs.banhCuon', level: ROOF })] },
        { when: climbed('nhay-khe-mai'), do: [interactable('giau-hop', 'xe-may-roofs.tank', 'c6m2.int.giau', { hold: 1.5, level: ROOF })] },
      ],
      fail: [caught('c6m2.fail.lo'), timedOut('giau-hop', 'c6m2.fail.lua')],
      exit: [...boxAt('xe-may-roofs.tank'), { k: 'flag', name: 'boxInTank' }],
    },
    {
      id: 'tuot-ong', minutes: 0.2, objective: '@c6m2.obj.ong', marker: { at: 'xe-may-alley.drop', style: 'go' }, hud: STEALTH_HUD,
      interact: [{ id: 'tuot-ong-bc', at: 'xe-may-roofs.tank', to: 'xe-may-alley.drop', r: 1.6, prompt: '@c6m2.int.ong', kind: 'climb', when: 'foot', level: ROOF }],
      done: climbed('tuot-ong-bc'),
      fail: [caught('c6m2.fail.lo')],
    },
    {
      id: 'hem-sau', minutes: 0.8, objective: '@c6m2.obj.hem2', hud: STEALTH_HUD,
      checkpoint: { label: '@c6m2.cp.hem', setup: [put('xe-may-alley.drop', undefined, 3), HANDS_FREE, fire(2), ...boxAt('xe-may-roofs.tank'), { k: 'flag', name: 'boxInTank' }, ...ALLEY_GUARDS] },
      subs: [
        { id: 'ha-1', text: '@c6m2.sub.ha1', done: ko('gac-hem-1') },
        { id: 'ha-2', text: '@c6m2.sub.ha2', done: ko('gac-hem-2') },
      ],
      enter: [hint('c6m2.hint.ha', 9000), bark('gac-hem-1', 'c6m2.bark.hem')],
      watchers: [{ when: { k: 'all', of: [ko('gac-hem-1'), ko('gac-hem-2')] }, do: [aside('c6m2-ha', [think('c6m2.think.ha')])] }],
      fail: [caught('c6m2.fail.hem')],
    },
    {
      id: 'cua-chay', minutes: 0.2, objective: '@c6m2.obj.vao', marker: { at: 'xe-may-ong-tu.backDoor', style: 'go' },
      interact: [{ id: 'vao-tiem', at: 'xe-may-ong-tu.backDoor', r: 1.6, prompt: '@c6m2.int.vao', kind: 'enter', when: 'foot' }],
      done: used('vao-tiem'),
      exit: [BURNING, { k: 'space', enter: 'xe-may-shop', link: 'back' }],
    },
    {
      // smoke ceiling at 1.2 m (stealth-player-kit.md §3.1): crouched, Tín breathes; standing drains health
      id: 'khoi', minutes: 0.5, objective: '@c6m2.obj.khoi', marker: { at: 'xe-may-shop/cub', label: '@c6m2.mk.tu', style: 'go' }, hud: { noise: true },
      checkpoint: { label: '@c6m2.cp.khoi', setup: [BURNING, inSpace('xe-may-shop', 'back'), put('xe-may-shop/back', undefined, 2), HANDS_FREE] },
      enter: [hint('c6m2.hint.khoi', 9000)],
      done: { k: 'all', of: [reach('xe-may-shop/cub', 1.6), { k: 'stance', is: 'crouch' }] },
      exit: [
        { k: 'music', id: null }, { k: 'time', hour: 22.6 }, { k: 'cutscene', id: 'cs06_lua_tiem_xe_coi' },
        // the whistle round his neck now; its ability card waits for a calm beat (after the prayer service, end of c6-m3)
        { k: 'player', outfit: 'tin-whistle' }, { k: 'give', item: 'whistle' },
        { k: 'flag', name: 'tuDied' }, { k: 'journal', id: 'j-tu-mat' }, { k: 'journal', id: 'j-coi' },
      ],
    },
    {
      id: 'sap', minutes: 0.4, objective: '@c6m2.obj.sap', marker: { at: 'xe-may-shop/back', style: 'go' },
      checkpoint: { label: '@c6m2.cp.sap', setup: [BURNING, inSpace('xe-may-shop', 'back'), put('xe-may-shop/cub', undefined, 2), { k: 'player', outfit: 'tin-whistle' }] },
      timer: { seconds: 30, label: '@c6m2.timer.sap' },
      done: reach('xe-may-shop/back', 1.5),
      fail: [timedOut('sap', 'c6m2.fail.sap')],
      exit: [{ k: 'space', leave: 'xe-may-alley.start' }, { k: 'stealth', arena: null }],
    },
    {
      // up the downpipe again, the box lowered on a washing line, down again: the box must not be left to the ring
      id: 'lay-hop', minutes: 0.8, objective: '@c6m2.obj.layHop', marker: { at: 'xe-may-alley.drop', style: 'go' },
      subs: [
        { id: 'leo', text: '@c6m2.sub.leoLai', done: climbed('leo-ong-bc') },
        { id: 'thong', text: '@c6m2.sub.thong', done: used('thong-hop') },
        { id: 'xuong', text: '@c6m2.sub.xuong', done: climbed('tuot-lai-bc') },
        { id: 'nhat', text: '@c6m2.sub.nhat', done: used('nhat-hop') },
      ],
      interact: [{ id: 'leo-ong-bc', at: 'xe-may-alley.drop', to: 'xe-may-roofs.tank', r: 1.6, prompt: '@c6m2.int.leoLai', kind: 'climb', when: 'foot' }],
      watchers: [
        { when: climbed('leo-ong-bc'), do: [interactable('thong-hop', 'xe-may-roofs.tank', 'c6m2.int.thong', { hold: 2, level: ROOF })] },
        { when: used('thong-hop'), do: [...boxAt('xe-may-alley.drop'),
          interactable('tuot-lai-bc', 'xe-may-roofs.tank', 'c6m2.int.xuong', { kind: 'climb', to: 'xe-may-alley.drop', level: ROOF })] },
        { when: climbed('tuot-lai-bc'), do: [interactable('nhat-hop', 'xe-may-alley.drop', 'c6m2.int.nhat', { kind: 'pick' })] },
        { when: used('nhat-hop'), do: [BOX_GONE, CARRY_BOX, aside('c6m2-hop', [think('c6m2.think.hop')])] },
      ],
    },
    {
      // Lực's officers, "suspiciously fast" (chase-wanted.md §7.6 forced stars, response 2 s)
      id: 'chay', minutes: 0.9, objective: '@c6m2.obj.chay', marker: { at: 'ch6.dream-hem', style: 'go' },
      checkpoint: { label: '@c6m2.cp.chay', setup: [
        put('xe-may-alley.drop', undefined, 4), BOX_GONE, CARRY_BOX, { k: 'player', outfit: 'tin-whistle' }, { k: 'stealth', arena: null }, fire(2),
        { k: 'spawn', id: 'cong-an-1', cast: 'cong-an-phuong', template: 'ward-cop', at: 'xe-may-alley.eastMouth', team: 'neutral', behaviour: { k: 'goto', at: 'xe-may-alley.start', run: true } }] },
      subs: [
        { id: 'cat', text: '@c6m2.sub.cat', done: used('cat-hop') },
        { id: 'xe', text: '@c6m2.sub.xe', done: { k: 'mode', is: 'bike' } },
      ],
      interact: [{ id: 'cat-hop', at: 'ch6.dream-hem', r: 1.8, prompt: '@c6m2.int.cat', kind: 'use', when: 'foot' }],
      enter: [
        { k: 'police', force: 2 }, bark('cong-an-1', 'c6m2.bark.ca', true),
        aside('c6m2-ca', [think('c6m2.think.ca1'), think('c6m2.think.ca2')]), { k: 'evidence', id: 'ev-cong-an-toi-som' },
        hint('c6m2.hint.chay', 8000),
      ],
      watchers: [{ when: used('cat-hop'), do: [HANDS_FREE, { k: 'give', item: 'hop-sat' }, { k: 'flag', name: 'hasIronBox' }] }],
      done: { k: 'all', of: [{ k: 'subs' }, after(6), { k: 'hold', seconds: 4, c: { k: 'player', prop: 'wanted', op: '<', value: 1 } }] },
      exit: [{ k: 'police', reset: true }, { k: 'music', id: null }],
    },
    {
      id: 'sau-dem', minutes: 0.4,
      enter: [
        { k: 'despawn', id: 'cong-an-1' }, { k: 'time', hour: 23.1 },
        { k: 'call', id: 'c6m2-van', from: 'van', ring: true, burner: true, lines: [
          phone('van', 'c6m2.v1'), phone('tin', 'c6m2.t1'), phone('van', 'c6m2.v2'), phone('van', 'c6m2.v3'), phone('van', 'c6m2.v4'), phone('tin', 'c6m2.t2'), phone('van', 'c6m2.v5')] },
        talk('c6m2-cuoi', [think('c6m2.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'shopBurnt' }],
  medals: { par: 600, ghost: true, clues: ['xe-ran-den'] },
  replay: { abilities: ABIL, flags: { metPhuong: true } },
});

// ---- c6-m3 · Bến sông lúc rạng đông -----------------------------------------------------------------------------

const QUANG_PIER: Act[] = [
  { k: 'spawn', id: 'quang', cast: 'quang', at: 'ch6.ben-dau', team: 'neutral', behaviour: { k: 'goto', at: 'ben-an-hoa.rental' } },
  { k: 'spawn', id: 'chu-ca-no', cast: 'chu-ca-no', template: 'resident', at: 'ben-an-hoa.sunset', team: 'neutral', behaviour: { k: 'act', name: 'phone-bored' } },
];
/** The play QTEs of escort-boss-qte.md §3.4 (resolve 'ok' or 'miss'; both continue, the content reads the result). */
const qte = (id: string, keys: string[], window: number, label: string): Act =>
  ({ k: 'do', op: 'qte', wait: true, args: { id, context: 'play', kind: 'press', keys, window, target: 1, anchor: { actor: 'quang' }, onFail: 'continue', label: `@${label}` } });
const punched: Cond = { k: 'on', ev: 'signal', id: 'qte', where: { result: 'ok' } };
/** The persistent flag 'quangGesture' (story-final.md mechanics; chapter 9 reads it): 'keo' after 'Kéo nó dậy', 'bo' after 'Bỏ đi'. */
const gesture = (eq: 'keo' | 'bo'): Cond => flag('quangGesture', eq);
/** The pagoda in mourning: the altar and wreaths, the abbot, Cô Ba, Vân, Bin, and the black car at the gate. */
const FUNERAL: Act[] = [
  { k: 'prop', id: 'le-tang', kind: 'le-chua', at: 'chua-an-hoa', variant: 'dam-tang' },
  { k: 'spawn', id: 'thay-minh-tinh', cast: 'thay-minh-tinh', at: 'chua-an-hoa', team: 'ally', behaviour: { k: 'act', name: 'chant' } },
  { k: 'spawn', id: 'coba', cast: 'coba', at: 'chua-an-hoa.matW', team: 'ally', behaviour: { k: 'act', name: 'stand-bow' } },
  { k: 'spawn', id: 'van', cast: 'van', at: 'chua-an-hoa.matE', team: 'ally', behaviour: { k: 'act', name: 'stand-bow' } },
  { k: 'spawn', id: 'bin', cast: 'bin', at: 'ch6.thay', team: 'ally', behaviour: { k: 'act', name: 'light-incense' } },
  { k: 'vehicle', id: 'xe-phuong', model: 'limo-den', at: 'chua-an-hoa.car', yaw: H, driver: 'tai-xe-phuong', state: 'park' },
];

const c6m3 = defineMission({
  id: 'c6-m3', meta: { hours: [4, 7], giver: 'coba' }, lethal: 'fail',
  start: { at: 'cafe-co-ba.backStairs', yaw: 0, hour: 5.15, weather: 'cloudy', lunar: 9, outfit: 'tin-whistle' },
  world: { traffic: 'light', crowd: 'thin', police: 'story', gangs: 'calm', clock: { hour: 5.15, freeze: true }, weather: { set: 'cloudy', lock: true }, activities: NO_HUB },
  setup: [{ k: 'vehicle', id: 'dream', model: 'dream', at: 'cafe-co-ba.dream', yaw: 0, state: 'park' }, fire(3)],
  steps: [
    {
      id: 'rang-dong', minutes: 0.6,
      enter: [{ k: 'title', kind: 'time', text: '@c6m3.title', sub: '@c6m3.titleSub' }, { k: 'music', id: 'theme-loss' }, { k: 'cutscene', id: 'c6m3-bac-thang' }],
    },
    {
      id: 'ban-do', minutes: 0.3, objective: '@c6m3.obj.map',
      enter: [
        { k: 'unlock', ability: 'riderMap', label: '@c6m3.unlock.map' }, hint('c6m3.hint.map'),
        { k: 'do', op: 'riderMap', wait: true, args: { id: 'tai-xe-gan', title: '@c6m3.map.title', focus: 'ben-an-hoa', find: 'quang', blips: [{ id: 'quang', label: '@c6m3.map.quang', at: 'ben-an-hoa.rental' }] } },
        aside('c6m3-ben', [think('c6m3.think.ben')]),
      ],
    },
    {
      id: 'ra-ben', minutes: 0.6, objective: '@c6m3.obj.ben', marker: { at: 'ben-an-hoa', label: '@c6m3.mk.ben', style: 'go' },
      checkpoint: { label: '@c6m3.cp.ben', setup: [put('cafe-co-ba.dream', 'dream', 3), { k: 'music', id: null }] },
      timer: { seconds: 90, label: '@c6m3.timer.ben' },
      done: reach('ben-an-hoa', 14),
      fail: [timedOut('ra-ben', 'c6m3.fail.tre')],
    },
    {
      id: 'duoi', minutes: 0.4, objective: '@c6m3.obj.duoi',
      checkpoint: { label: '@c6m3.cp.duoi', setup: [put('ch6.dream-ben', 'dream', 14), { k: 'time', hour: 5.45 }, ...QUANG_PIER] },
      enter: [bark('quang', 'c6m3.bark.q1', true), { k: 'behave', id: 'quang', b: { k: 'goto', at: 'ben-an-hoa.rental', run: true } }, hint('c6m3.hint.duoi')],
      done: { k: 'all', of: [{ k: 'mode', is: 'foot' }, { k: 'near', a: 'quang', b: 'player', r: 2.5 }] },
      // he stumbles more than he runs: reaching the boat only replays the beat
      fail: [{ when: { k: 'actor', id: 'quang', at: 'ben-an-hoa.rental', r: 1 }, reason: '@c6m3.fail.cano', soft: true }],
      retry: [{ k: 'teleport', at: 'ch6.bo-ke' }, { k: 'despawn', id: 'quang' }, QUANG_PIER[0]],
    },
    {
      id: 'vat', minutes: 0.3,
      enter: [
        qte('c6m3-tackle', ['E'], 1, 'c6m3.qte.vat'),
        { k: 'behave', id: 'quang', b: { k: 'act', name: 'sit-ground-rub-knee' } },
        talk('c6m3-buong', [say('quang', 'c6m3.q1')]),
      ],
    },
    {
      // the punch may be held back: the QTE's 'miss' is the fist stopping short; the scene and later chapters read it
      id: 'dam', minutes: 0.8,
      enter: [
        hint('c6m3.hint.dam', 5000),
        qte('c6m3-punch', ['F'], 1.5, 'c6m3.qte.dam'),
        { k: 'if', c: punched, then: [{ k: 'flag', name: 'punchedQuang', value: true }], else: [{ k: 'flag', name: 'punchedQuang', value: false }] },
        { k: 'cutscene', id: 'c6m3-ben-song' },
        { k: 'evidence', id: 'ev-quang-thu-nhan' },
        { k: 'choice', id: 'quangBen', prompt: '@c6m3.q.ben', options: [
          { id: 'bo-di', text: '@c6m3.opt.boDi', set: { quangGesture: 'bo' } }, { id: 'keo-day', text: '@c6m3.opt.keoDay', set: { quangGesture: 'keo' } }] },
        talk('c6m3-cu-chi', [
          say('tin', 'c6m3.keo1', { if: gesture('keo') }), say('quang', 'c6m3.keo2', { if: gesture('keo') }), say('tin', 'c6m3.keo3', { if: gesture('keo') }),
          think('c6m3.bo1', { if: gesture('bo') })]),
        { k: 'behave', id: 'quang', b: { k: 'goto', at: 'ben-an-hoa.rental' } }, bark('chu-ca-no', 'c6m3.bark.cano'),
        aside('c6m3-di', [think('c6m3.think.di')]),
        { k: 'journal', id: 'j-quang-ben' }, { k: 'flag', name: 'confrontedQuang' },
      ],
    },
    {
      id: 'mo-hop', minutes: 0.5, objective: '@c6m3.obj.hop', marker: { at: 'ben-an-hoa.sunset', label: '@c6m3.mk.hop', style: 'go' },
      interact: [{ id: 'mo-hop', at: 'ben-an-hoa.sunset', r: 1.6, prompt: '@c6m3.int.hop', kind: 'use', when: 'foot' }],
      done: used('mo-hop'),
      exit: [{ k: 'despawn', id: 'quang' }, { k: 'despawn', id: 'chu-ca-no' }, { k: 'time', hour: 5.8 }, { k: 'cutscene', id: 'c6m3-mo-hop' }],
    },
    {
      id: 'xem-hop', minutes: 0.4, objective: '@c6m3.obj.xem',
      subs: [{ id: 'ho-so', text: '@c6m3.sub.hoSo', done: owned('ev-ho-so-diem') }],
      enter: [
        { k: 'clue', id: 'ho-so-diem', at: 'ben-an-hoa.sunset', r: 1.6, evidence: 'ev-ho-so-diem', examine: 'document:ho-so-diem', scope: 'step' },
        { k: 'clue', id: 'so-tay-hai', at: 'ben-an-hoa.sunset', r: 1.6, evidence: 'ev-so-tay-hai', examine: 'object:so-tay-hai', scope: 'step' },
        hint('c6m3.hint.xem'),
      ],
      watchers: [
        { when: owned('ev-ho-so-diem'), do: [aside('c6m3-diem', [think('c6m3.think.diem1'), think('c6m3.think.diem2')])] },
        { when: owned('ev-so-tay-hai'), do: [aside('c6m3-hai', [think('c6m3.think.hai')])] },
      ],
      optional: [{ id: 'so-tay', text: '@c6m3.opt.soTay', when: owned('ev-so-tay-hai') }],
      exit: [{ k: 'journal', id: 'j-hop-sat' }],
    },
    { id: 'bang', minutes: 1, enter: [{ k: 'board', id: 'bang-hop-sat' }, talk('c6m3-sau-bang', [think('c6m3.think.bang')])] },
    {
      id: 'chieu', minutes: 0.2,
      enter: [
        { k: 'fade', to: 'black', ms: 1200 }, { k: 'time', hour: 15.5 }, { k: 'teleport', at: 'chua-an-hoa.gate', yaw: 0 },
        { k: 'title', kind: 'time', text: '@c6m3.title2', sub: '@c6m3.title2Sub' }, { k: 'fade', to: 'clear', ms: 1200 },
      ],
    },
    {
      id: 'dam-tang', minutes: 0.8, objective: '@c6m3.obj.nhang', marker: { at: 'ch6.lu-huong', label: '@c6m3.mk.nhang', style: 'go' },
      checkpoint: { label: '@c6m3.cp.nhang', setup: [put('chua-an-hoa.gate', undefined, 14), { k: 'time', hour: 15.5 }, ...FUNERAL] },
      interact: [{ id: 'thap-nhang', at: 'ch6.lu-huong', r: 1.8, hold: 2, prompt: '@c6m3.int.nhang', kind: 'use', when: 'foot' }],
      // seventeen hours after the fire the body is still with forensics: a prayer service (lễ cầu siêu), not the funeral
      enter: [{ k: 'music', id: 'theme-loss' }, aside('c6m3-cau-sieu', [say('van', 'c6m3.van.phapY', { voice: 'whisper' })])],
      done: used('thap-nhang'),
      exit: [
        { k: 'cutscene', id: 'c6m3-dam-tang' }, { k: 'flag', name: 'buriedTu' }, talk('c6m3-cuoi', [think('c6m3.think.cuoi')]),
        // Ông Tư's last gift becomes a tool only now, in the quiet after the service (not at his death in CS06)
        { k: 'unlock', ability: 'whistle', label: '@c6m2.unlock.coi' }, { k: 'music', id: null },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'openedIronBox' }],
  medals: { par: 420, clues: ['so-tay'] },
  replay: {
    abilities: [...ABIL, 'whistle'], items: { 'hop-sat': 1, whistle: 1 },
    flags: { metPhuong: true, toldQuangWhere: true, tuDied: true, hasIronBox: true, shopBurnt: true },
    evidence: ['ev-phuong-chua', 'ev-danh-thiep-phuong', 'ev-xe-phuong', 'ev-truc-thang', 'ev-tin-nhan-quang', 'ev-anh-ba-lua', 'ev-ban-do-sa-lan', 'ev-nguoi-giu-so-chi', 'ev-cong-an-toi-som'],
  },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string, role = false): CastDef =>
  ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look, ...(role ? { role: `@cast.${id}.role` } : {}) });
/** Phượng's look is the jade áo dài, pearl earrings, jade bangle and reading glasses on a gold chain of the bible. */
export const CAST: CastDef[] = [
  person('phuong', '#3f8f6b', 'P', 'phuong', true), person('thay-minh-tinh', '#b5835a', 'T', 'abbot', true), person('tai-xe-phuong', '#2f3238', 'V', 'bodyguard'),
  person('phat-tu', '#a59a8a', 'P', 'resident'), person('gac-lua', '#5a3a3a', 'R', 'ran-den'), person('gac-hem', '#6a4040', 'G', 'ran-den'),
  person('cong-an-phuong', '#6b7a52', 'C', 'ward-cop'), person('chu-ca-no', '#7f8f9a', 'C', 'boatman'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 6, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-phuong-chua', 'testimony', 'phuongChua', 'quote', ['phuong', 'chua']),
  ev('ev-danh-thiep-phuong', 'document', 'danhThiepPhuong', 'card', ['phuong', 'mai-am', 'sen-vang']),
  ev('ev-xe-phuong', 'photo', 'xePhuong', 'car', ['phuong', 'tai-chinh'], '51A-868.68'),
  ev('ev-truc-thang', 'photo', 'trucThang', 'helicopter', ['phuong', 'tai-chinh', 'sen-vang']),
  ev('ev-bang-ron', 'photo', 'bangRon', 'banner', ['phuong', 'mai-am', 'chua']),
  ev('ev-tin-nhan-quang', 'call-log', 'tinNhan', 'sms', ['quang', 'betrayal', 'tu']),
  ev('ev-anh-ba-lua', 'photo', 'anhBaLua', 'photo', ['phuong', 'ba-lua', '2014'], '2014'),
  ev('ev-ban-do-sa-lan', 'document', 'banDoSaLan', 'map', ['barge', 'hai', '2014']),
  ev('ev-nguoi-giu-so-chi', 'document', 'nguoiGiuSoChi', 'ledger', ['bao', 'bank', 'money']),
  ev('ev-xe-ran-den', 'photo', 'xeRanDen', 'plate', ['ran-den', 'fire']),
  ev('ev-cong-an-toi-som', 'testimony', 'congAnSom', 'police', ['luc', 'police', 'fire']),
  ev('ev-quang-thu-nhan', 'testimony', 'quangThuNhan', 'quote', ['quang', 'betrayal', 'mai']),
  ev('ev-ho-so-diem', 'document', 'hoSoDiem', 'file', ['diem', '2014', 'victims']),
  ev('ev-so-tay-hai', 'object', 'soTayHai', 'notebook', ['hai', '2014', 'kho-lanh']),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [
  note('j-phuong', 'people', 'phuong'), note('j-tu-mat', 'people', 'tuMat'), note('j-coi', 'notes', 'coi'),
  note('j-quang-ben', 'diary', 'quangBen'), note('j-hop-sat', 'notes', 'hopSat'), note('j-sa-lan-neo', 'places', 'saLanNeo'),
];
export const QUESTIONS: QuestionDef[] = [{
  id: 'sa-lan-neo', prompt: '@c6m3.q.neo', answer: 'giua-song', cost: 1, hint: '@c6m3.q.hint',
  options: [
    { id: 'giua-song', text: '@c6m3.q.giuaSong', needs: ['ev-ban-do-sa-lan', 'ev-bang-trang'] },
    { id: 'kho-7', text: '@c6m3.q.kho7' }, { id: 'bach-dang', text: '@c6m3.q.bachDang' }],
  onCorrect: [{ k: 'flag', name: 'knowsBargeSpot' }, { k: 'journal', id: 'j-sa-lan-neo' }],
}];

/**
 * The chapter's own named points, validated by scripts/story-ch06.test.mjs against today's map (bike spots clear at
 * r 1 on the sidewalk or in the alley, pier spots on the pier deck, the yard spots clear of the incense urn).
 */
export const PLACES: Record<string, PlaceDef> = {
  'ch6.dream-chua': { x: -33, z: 116.5, yaw: H, r: 1 },
  'ch6.lu-huong': { x: -26, z: 122, yaw: PI, r: 0.45 },
  'ch6.thay': { x: -24, z: 122, yaw: PI, r: 0.45 },
  'ch6.dream-q1': { x: 184, z: -99, yaw: H, r: 1 },
  'ch6.dream-hem': { x: -73, z: -82, yaw: -H, r: 1 },
  'ch6.dream-ben': { x: 0, z: -131, yaw: PI, r: 1 },
  'ch6.bo-ke': { x: 2, z: -131.5, yaw: PI, r: 0.45 },
  'ch6.ben-dau': { x: 2, z: -137, yaw: PI, r: 0.45 },
};

/**
 * Off-map space anchors this chapter places things at ('space/anchor' in scripts, 'set:space.anchor' in cutscenes),
 * merged with chapter 3's anchors of the same space (front, bench, backRoom, back): a contract for the level kit.
 * The 'burning' variant (c6-m2) fills the shop with fire and a smoke ceiling at 1.2 m; 'burnt' is the ruin.
 */
export const ANCHORS: Record<string, Record<string, string>> = {
  'xe-may-shop': {
    box: 'the iron box open on the back-room desk under the bulb', hopAnh: 'on the desk: the 2014 photo (Ba Lửa, a young woman behind him)',
    hopBanDo: 'on the desk: the hand-drawn map of the barge routes', hopGhiChu: 'on the desk: the slip of paper with a name in Ông Tư\'s hand',
    shutter: 'inside the front roller shutter, a hand-width gap at the bottom (Ông Tư peers out; CS06)',
    loft: 'foot of the ladder to the loft and the roof hatch (leads up to xe-may-roofs.loft)',
    cub: 'Ông Tư\'s old Cub on its stand by the workbench (CS06: he sits against it)',
    floor: 'the middle of the shop floor between the bench and the shutter', roofGap: 'the gap in the shop roof, 6 m above the floor (the POV from the PHỞ roof, CS06)',
  },
};

/**
 * Case-board cards this chapter adds to BẢNG MANH MỐI (lotus slots 34–44, after chapter 5's 28–33; chapter 7 starts at
 * 45) and the strings that tie them to chapters 2–5. The board of c6-m3 shows these with the earlier cards they touch.
 */
export const BOARD_CARDS: BoardCard[] = [
  { id: 'ev-phuong-chua', slot: 34 }, { id: 'ev-danh-thiep-phuong', slot: 35 }, { id: 'ev-xe-phuong', slot: 36 }, { id: 'ev-truc-thang', slot: 37 },
  { id: 'ev-tin-nhan-quang', slot: 38 }, { id: 'ev-anh-ba-lua', slot: 39 }, { id: 'ev-ban-do-sa-lan', slot: 40 }, { id: 'ev-nguoi-giu-so-chi', slot: 41 },
  { id: 'ev-cong-an-toi-som', slot: 42 }, { id: 'ev-quang-thu-nhan', slot: 43 }, { id: 'ev-ho-so-diem', slot: 44 },
];
export const BOARD_LINKS: [string, string][] = [
  // the philanthropist is "chị Phượng": her words, her card (the van pass's lotus), her car and her helicopter
  ['ev-phuong-chua', 'ev-chi-phuong'], ['ev-danh-thiep-phuong', 'ev-phuong-chua'], ['ev-danh-thiep-phuong', 'ev-the-sen-vang'],
  ['ev-xe-phuong', 'ev-phuong-chua'], ['ev-xe-phuong', 'ev-truc-thang'],
  // the 2014 box: the same woman behind Ba Lửa, Ông Tư's case, the recruiter who was once taken
  ['ev-anh-ba-lua', 'ev-phuong-chua'], ['ev-anh-ba-lua', 'ev-tu-ke'], ['ev-ho-so-diem', 'ev-anh-ba-lua'], ['ev-ho-so-diem', 'ev-diem-goi'],
  // the barge and the money: Hải's map, the whiteboard, Lực's orders, the envelope "from chị" and its ledger
  ['ev-ban-do-sa-lan', 'ev-bang-trang'], ['ev-ban-do-sa-lan', 'ev-luc-noi'], ['ev-luc-noi', 'ev-clip-luc'], ['ev-nguoi-giu-so-chi', 'ev-clip-luc'], ['ev-clip-luc', 'ev-chi-phuong'],
  // the night of the fire: the text, the debt, the confession, and the police who came first
  ['ev-tin-nhan-quang', 'ev-quang-no'], ['ev-quang-thu-nhan', 'ev-tin-nhan-quang'], ['ev-cong-an-toi-som', 'ev-tin-nhan-quang'],
  ['ev-cong-an-toi-som', 'ev-luc-hoi'], ['ev-cong-an-toi-som', 'ev-clip-luc'],
];
const EARLIER = [...CH2_CARDS, ...CH3_CARDS, ...CH4_CARDS, ...CH5_CARDS];
const linked = new Set(BOARD_LINKS.flat());
/** BẢNG MANH MỐI · Cái hộp năm 2014 (c6-m3): solved, it asks where the barge anchors on the night of mùng 10 (the lead to chapter 7). */
export const BOARDS: BoardDef[] = [{
  id: 'bang-hop-sat', title: '@board.ch6.t',
  cards: [...EARLIER.filter((c) => linked.has(c.id)), ...BOARD_CARDS],
  links: BOARD_LINKS,
  hypotheses: [{ id: 'phuong-cam-dau', text: '@board.ch6.h1', needs: ['ev-phuong-chua', 'ev-chi-phuong', 'ev-anh-ba-lua'], hint: '@board.ch6.h1.hint' }],
  question: 'sa-lan-neo',
  reveals: [{ k: 'flag', name: 'boardCh6' }, { k: 'flag', name: 'knowsPhuong' }],
}];

/**
 * Engine ids this chapter uses beyond story/contract.ts (and the chapter 4–5 SCENE_REQUESTS), by contract kind, with
 * the lane that builds them: the integrator adds them to ENGINE_CONTRACT; scripts/story-ch06.test.mjs lints the chapter
 * against the contract plus these, and fails if one is unused or already there under another lane.
 */
export const ENGINE_NEEDS: Partial<Record<ContractKind, Record<string, ContractEntry>>> = {
  ops: {
    qte: ['ui', "play QTE (escort-boss-qte.md §3; chapters 8 and 10 request the same op): {id, context 'play', kind 'press'|'hold'|'mash'|'alternate'|'band', keys, window, target, anchor {actor}, onFail 'continue'|'loop'|'soft-fail', label @key}; wait: true blocks until it resolves 'ok' or 'miss' and latches {type:'signal', id:'qte', result} (c6-m3 tackle, and the punch whose 'miss' is the fist held back)"],
    riderMap: ['ui', "the {@app} 'Tài xế gần bạn' map on the phone (phone-detective-ui.md §3.7, chase-wanted.md §5.8 tracker blips): {id, title @key, focus site, find blip id, blips[{id, label @key, at}]}; wait: true blocks until the player taps the blip named by find and latches signal riderMap (c6-m3)"],
    fire: ['world', "fire on a building by site {id, at, stage}: 1 rags alight at the shutter, 2 ablaze with a smoke column and firelight (raises visibility near it), 3 the burnt-out ruin (charred facade, half-down shutter, police tape) that stays while progress flag shopBurnt is set, until the epilogue's XE MÁY ÔNG TƯ (c6-m2, c6-m3)"],
  },
  arenas: {
    'tiem-chay': ['stealth', "SỬA XE TƯ on fire, variant 'lua': the roofs of the ĐƯỜNG HOA SỮA row (tin is loud; bamboo scaffold; the PHỞ roof gap), the back alley and the burning shop space; Rắn Đen flashlights sweep the roofs from the street and the alley; firelight raises visibility near the shop; the fire's roar masks footsteps in the alley (×0.6); smoke ceiling 1.2 m in the shop (c6-m2)"],
  },
  models: { 'limo-den': ['vehicles', "Phượng's black limousine (sedan body, black with a thin gold line, tinted glass, plate 51A-868.68 sprite); her driver at the wheel; in cutscenes its rear window lowers halfway (c6-m1 tail, c6-m3 funeral)"] },
  outfits: { 'tin-whistle': ['core', "Tín in the shipper windbreaker with Ông Tư's old police whistle on a cord round his neck, wrist wrap off, soot on the sleeves (from c6-m2 on)"] },
  abilities: { riderMap: ['ui', "the 'Tài xế gần bạn' map in the {@app} app (phone-detective-ui.md §3.7; c6-m3)"] },
  carry: {
    'bao-gao': ['core', 'a 10 kg rice sack on one shoulder: the volunteer cover at the pagoda (walk only; c6-m1)'],
    'hop-sat': ['core', "Ông Tư's 2014 iron box in both arms: speed cap 2.6 m/s, no running, no climbing (stealth-player-kit.md §3.3; set down with E to climb; c6-m2)"],
  },
  poses: { kneel: ['core', 'player kneels on a mat with the worshippers, hands together: the kneel blends in a crowd (eavesdrop counts as hidden; c6-m1)'] },
  acts: {
    'light-incense': ['director', 'lights incense sticks at the urn and bows with them (Phượng, the abbot, Bin; c6-m1, c6-m3)'],
    'kneel-pray': ['director', 'kneels on a mat, hands together, eyes down (worshippers, Vân; c6-m1)'],
    chant: ['director', 'the abbot chants at the altar, tapping the wooden fish (c6-m3 funeral)'],
  },
  props: {
    'le-chua': ['world', "CHÙA AN HÒA yard dressing by variant: 'phat-gao' (trestle tables with rice sacks, kneeling mats, the MÁI ẤM {@ringUpper} banner on two poles at the gate; c6-m1) | 'dam-tang' (altar with Ông Tư's portrait, white cloth, wreaths, incense; c6-m3)"],
    'iron-box': ['director', "Ông Tư's 2014 iron box, dented green paint (on a desk, a roof edge, under a water tank, at the foot of a downpipe; cutscenes: in arms, 'open' variant with the lid note as text lines)"],
  },
  templates: { bodyguard: ['director', "Phượng's bodyguards in dark suits, earpieces (cutscene extras; c6-m1)"] },
  clips: {
    'light-incense': ['director', 'lights three incense sticks from a candle and raises them to the forehead'],
    'grip-wrench': ['director', 'lifts a big wrench from the bench and weighs it in his hand (Ông Tư, CS06)'],
    'hand-falls': ['director', 'a seated man\'s hand slips from his chest and comes to rest on the floor (CS06; no wound)'],
    salute: ['director', 'a police salute in plain clothes (Vân at the funeral)'],
    'set-down': ['director', 'bends and sets a large object down on the ground (the funeral wreath)'],
    'knock-mo': ['director', 'taps the wooden fish (mõ) in time while chanting'],
  },
  pairClips: {
    'fix-collar': ['director', "one straightens the other's collar with both hands (Phượng, CS05)"],
    'hang-whistle': ['director', "one lifts a whistle on a cord from his own neck and hangs it on the other's (Ông Tư, CS06)"],
  },
  scenePoses: { kneel: ['director', 'kneeling on a mat or on the floor (worshippers; Tín beside Ông Tư in CS06)'] },
  sceneProps: {
    banner: ['director', 'a cloth banner on two poles with text lines (the MÁI ẤM banner, CS05)'], 'rice-sacks': ['director', 'stacked rice sacks on a trestle table'],
    incense: ['director', 'lit incense sticks (held or in an urn)'], 'jade-bangle': ['director', "Phượng's jade bangle on her wrist"],
    wrench: ['director', 'a big wrench'], whistle: ['director', "Ông Tư's old police whistle on a cord"], 'coffee-cup': ['director', 'a glass of black coffee'],
    portrait: ['director', 'a framed funeral portrait on an altar with text lines'], wreath: ['director', 'a white funeral wreath on a stand with a ribbon (text lines)'],
  },
  fx: {
    'incense-smoke': ['director', 'drifting incense smoke'], fire: ['director', 'flames (a lit rag, a burning shutter, a room on fire; no person burns)'],
    smoke: ['director', 'thick grey-orange smoke rolling under a ceiling'], 'beam-fall': ['director', 'a burning roof beam crashing down in a burst of sparks'],
  },
  sfx: {
    'mo-go': ['audio', 'a wooden fish tapped in a pagoda'], chanting: ['audio', 'a monk chanting'], 'moto-rev': ['audio', 'several motorbikes revving outside a shutter'],
    'metal-clang': ['audio', 'a wrench striking metal'], 'beam-crash': ['audio', 'a burning beam crashing down'], 'lid-creak': ['audio', 'the lid of an iron box creaking open'],
  },
  ambience: { 'fire-crackle': ['audio', 'a shop burning: crackle, roar, falling debris'] },
};

export const chapter = defineChapter({
  chapter: 6,
  missions: [c6m1, c6m2, c6m3],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, questions: QUESTIONS, boards: BOARDS, places: PLACES,
  text: TEXT,
});
