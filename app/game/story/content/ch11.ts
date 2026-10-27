import { defineChapter, defineMission, type Act, type CastDef, type Cond, type EvidenceDef, type FailDef, type JournalDef, type Line, type PlaceDef, type WorldPolicy } from '../types.ts';
import type { ContractEntry, ContractKind } from '../contract.ts';
import { TEXT } from '../text/vi/ch11.ts';

/**
 * Chương 11 · GIAO TẬN TAY (story-final.md ch.11 with story-decisions.md 11, 12, 13, 14, 17, 23 and §8 "c11-m1 … c11-m4";
 * festival-blackout-heli.md's authenticity amendment: floating river lanterns and star lanterns, never sky lanterns).
 * c11-m1 23:50 on Rằm night: from Moonlight's empty loading bay, the convoy (Lực's reefer truck, two black SUVs, four
 * armed Rắn Đen bikers) crawling through the lantern crowds on the boulevard; kicks from the Dream, Vân's car takes the
 * rear SUV, the lion-dance troupe closes the junction where Mai was lost (c4-m2) behind the truck; alongside the truck, the
 * leap and the cab fight with Lực (scene QTEs) where the player drew level, the truck through the railing 29 m east of BẾN BẠCH ĐẰNG (decision 17), the padlock cut and
 * twelve people led to Thiếu tá Lộc's river police before the truck slides (60 s), Vân arrests Lực (ĐÃ CỨU: 40).
 * c11-m2 00:20: TÒA THÁP TÀI CHÍNH shut, a real {@app} order of mooncakes up THÁP PHƯƠNG NAM next door, the scanner,
 * the deck (six people at most, two innocent deck staff, decision 12), the twenty-second window, the dive from the
 * east gate onto the flat roof pad (51 m east, 64 m down, decision 11); a missed landing fails forward through the west
 * service door into the harder branch. c11-m3 00:40 on the pad: the guard holding Su taken from behind, Su hidden by
 * the AC units, two bodyguards in the rotor wash (or, on the harder branch, the hovering aircraft's tail rotor shot
 * out), CS12 in three parts with the "Giữ tay" / "Kéo lên" scene QTEs: Phượng caught at the open north edge, the
 * task-force aircraft holding its hover, Vân, the colonel and Kiều Anh up the stair housing, the master ledger handed
 * over live (ĐÃ CỨU: 41), dawn and Mai's call. c11-m4 three weeks later: the news and the trial, Má's debt notice on the
 * lotus pond, the rebuilt Dream from Quang under the XE MÁY ÔNG TƯ sign, a free ride with Mai on the pillion (her
 * chatter; Cô Ba's table; optional Bà Sáu, Vân and Bống, Diễm and Su), the mooncake she saved at BẾN XE AN HÒA and her
 * own choice, the sunset pier, "Đơn hàng mới", the last lines by the LƯƠNG TÂM tier (clean / no kill but an innocent
 * hurt / a kill), the "Luật của Ông Tư" badge for a clean record, the credits and the stinger. The four missions chain.
 *
 * LƯƠNG TÂM: c11-m1 and c11-m3 allow lethal force (open combat; every kill is booked and changes the epilogue), c11-m2
 * fails on any harm to the innocent deck staff and moon-watchers (lethal 'fail'); kicks, takedowns and the cab fight are
 * non-lethal; nobody dies in a cutscene: Lực and Phượng end in cuffs, the empty truck slides into the river after the
 * twelve are out, the helicopters never crash (festival-blackout-heli.md §3.5). Victims are never animated with clips,
 * only placed in dignified poses; the child Su is never struck, aimed at or dragged.
 *
 * Places are story/sites.ts ids, the chapter places below (PLACES, checked on today's map by scripts/story-ch11.test.mjs)
 * or anchors of the spaces declared in ANCHORS; texts are '@keys' of text/vi/ch11.ts; brands ({@app}, {@code}, {@ring},
 * {@ringUpper}, {@bank}, {@fiction}) come from text/vi/common.ts.
 * Register in content/index.ts LOADERS: `11: () => import('./ch11.ts'),`.
 * Cast from earlier chapters: tin, quang, coba, tu, bana, mai, basau, app (ch.1), hoa, beti, cuong, ran-den (ch.2), van,
 * luc (ch.3), diem (ch.4); and, assumed from the chapters written in parallel (scripts/story-ch11.test.mjs stands in
 * for them until they land): phuong (ch.6), loc (ch.7), bao (ch.8), tam-ho, kieu-anh, dai-ta (ch.9). This chapter
 * introduces su, bong, ve-si, phi-cong, quan-ly, nv-dai, khach-ngam, bao-ve-thap, mc-tin-tuc and ong-gia.
 * Progress it reads: flag helpedBaSau (ch.1), the campaign LƯƠNG TÂM record; it writes the numeric flag `rescued`
 * (absolute: 40, then 41) that chapters 7 and 10 set to 11 and 28.
 *
 * Engine ids used here are in story/contract.ts (or its SCENE_REQUESTS), except ENGINE_NEEDS below (with their lane).
 */

const H = Math.PI / 2, PI = Math.PI;
const NO_HUB: WorldPolicy['activities'] = { gunStore: false, bank: false, deck: false, boatRental: false, sideJobs: false, orders: false };
const say = (who: string, key: string, o: Omit<Line, 'who' | 'text'> = {}): Line => ({ who, text: `@${key}`, ...o });
const think = (key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say('tin', key, { voice: 'think', ...o });
const radio = (who: string, key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say(who, key, { voice: 'radio', ...o });
const talk = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines });
const aside = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines, mode: 'ambient' });
const hint = (key: string, ms = 7000): Act => ({ k: 'hint', text: `@${key}`, ms });
const bark = (actor: string, key: string, shout = false): Act => ({ k: 'bark', actor, text: `@${key}`, shout });
const toast = (key: string): Act => ({ k: 'toast', text: `@${key}` });
const reach = (at: string, r = 3): Cond => ({ k: 'reach', at, r });
const used = (id: string, scope?: 'mission'): Cond => ({ k: 'on', ev: 'interact', id, ...(scope ? { scope } : {}) });
const owned = (id: string): Cond => ({ k: 'evidence', id });
const after = (seconds: number): Cond => ({ k: 'after', seconds });
const flag = (name: string, eq?: boolean | string): Cond => (eq === undefined ? { k: 'flag', name } : { k: 'flag', name, eq });
const chose = (choice: string, option: string): Cond => ({ k: 'flag', name: `choice:${choice}`, eq: option });
const down = (id: string): Cond => ({ k: 'actor', id, down: true });
const signal = (id: string, where?: Record<string, boolean>): Cond => ({ k: 'on', ev: 'signal', id, ...(where ? { where } : {}) });
const detected: Cond = { k: 'on', ev: 'detected' };
/**
 * LƯƠNG TÂM in the epilogue reads one rule, the campaign tier (flags.ts conscienceTier: kills plus innocents hurt), as
 * CS06 and c10-m3 do: a clean record earns the "Luật của Ông Tư" badge and the mentors' full praise; no kill but an
 * innocent hurt gets its own lines (no badge); a kill gets the kind lines for a broken rule.
 */
const noKills: Cond = { k: 'stat', name: 'kills', op: '==', value: 0, scope: 'campaign' };
const clean: Cond = { k: 'conscience', is: 'clean' };
const hurtOnly: Cond = { k: 'all', of: [noKills, { k: 'not', c: clean }] };
const killed: Cond = { k: 'not', c: noKills };
/** Teleport unless the player is already there (on any surface unless `level` is given); see content/ch01.ts. */
const put = (at: string, vehicle?: string, r = 8): Act =>
  ({ k: 'if', c: { k: 'reach', at, r }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });
/** Seen by a guard of the arena: back to the last checkpoint; after three tries the card offers 'Bỏ qua đoạn này'. */
const caught = (reason: string, skipTo?: string): FailDef => ({ when: detected, reason: `@${reason}`, allowSkipAfter: 3, ...(skipTo ? { skipTo } : {}) });
// The cab fight's "Gạt súng!" / "Giành tay lái!" and CS12's "Giữ tay!" / "Kéo lên!" are scene QTEs (escort-boss-qte.md
// §3.4 context 'scene'): cues inside c11m1-ca-bin, cs12_giao_tan_tay and cs12_giao_tan_tay_trao (cutscenes/ch11.ts).
/** HUD counter "ĐÃ CỨU: n" from the numeric flag `rescued` (11 after ch.7, 28 after ch.10, 40 and 41 here). */
const SAVED_METER = { id: 'da-cuu', label: '@c11m1.meter.cuu', kind: 'count' as const, flag: 'rescued' };
/** Rằm night: lanterns, crowds and the floating river lanterns (festival-blackout-heli.md §1; the op is planned in contract.ts). */
const FESTIVAL: Act = { k: 'do', op: 'festival', args: { id: 'ram-thang-tam', on: true, river: true } };

// ---- c11-m1 · Xe đông lạnh ---------------------------------------------------------------------------------------

/** The truck's way north up the boulevard, then east toward the port (story-decisions.md 17); the cab fight ends it at the railing. */
const TRUCK_ROUTE = ['ch11.xe-lanh', 'nga-tu-216-54', 'ch11.chu-t', 'ch11.duong-cang'];
/**
 * The convoy's truck is step-scoped: it lives through 'duoi', whose exit plays the leap and the cab fight on it wherever
 * the player drew level (the scenes frame 'vehicle:xe-lanh'), and the step's reset removes it before the railing,
 * where the hanging-truck prop takes over. A skip to 'nhay' stops a fresh one at a fixed leap point near the T.
 */
const TRUCK = (at = 'ch11.xe-lanh', state: 'drive' | 'stop' = 'drive'): Act =>
  ({ k: 'vehicle', id: 'xe-lanh', model: 'reefer-truck', at, yaw: PI, route: TRUCK_ROUTE, cruise: 3, obeyLights: false, state, driver: 'luc', scope: 'step' });
/** The lion-dance troupe that closes NGÃ TƯ NGUYỄN HUỆ behind the truck (a 2.2 m gap: the Dream and the bikers squeeze through, cars do not). */
const LION_BLOCK: Act = { k: 'do', op: 'festival', args: { id: 'ram-thang-tam', on: true, river: true, troupes: [{ id: 'lan-nga-tu', at: 'nga-tu-216-54', yaw: 0, program: 'block', gap: 2.2 }] } };
/** The leap and the cab fight (scene QTEs inside c11m1-ca-bin), on the truck where it stands. */
const LEAP: Act[] = [
  { k: 'stop', id: 'doan-xe-lanh' }, { k: 'stop', id: 'xe-chi-van' }, { k: 'do', op: 'gps', args: { route: null } }, { k: 'do', op: 'tracker', args: { id: 'dinh-vi-sa-lan', on: false } },
  { k: 'vehicle', id: 'xe-lanh', state: 'stop' },
  { k: 'cutscene', id: 'c11m1-nhay' },
  { k: 'do', op: 'bike', args: { id: 'dream', look: 'wrecked' } }, { k: 'flag', name: 'dreamWreckedRam' },
  { k: 'cutscene', id: 'c11m1-ca-bin' },
];
const BIKERS = ['xe-may-1', 'xe-may-2', 'xe-may-3', 'xe-may-4'];
/**
 * The twelve from the truck as an escort group (escort-boss-qte.md §1.3 GroupSpec, the shape chapters 7 and 10 use): six
 * adults and six teenagers out of the box doors, holding hands down the promenade to Lộc's officers; the group pushes
 * 'arrived' with its id once everyone is at the release point.
 */
const TRUCK_GROUP = {
  id: 'nguoi-xe-lanh', leader: 'player', order: 'as-listed', spacing: 0.9, hands: true, start: { at: 'ch11.cua-thung', yaw: PI }, release: 'ben-bach-dang.handover',
  followers: Array.from({ length: 12 }, (_, i) => (i % 2 ? { id: `xl-${i + 1}`, look: 'captive-teen', age: 'teen' } : { id: `xl-${i + 1}`, look: 'captive-adult', age: 'adult' })),
};
/** The convoy (chase-wanted.md §5.7): the truck rubber-banded ahead, two SUVs in formation, four armed bikers; Vân's car follows. */
const CONVOY: Act[] = [
  TRUCK(),
  { k: 'vehicle', id: 'suv-truoc', model: 'suv-den', at: 'ch11.suv-truoc', yaw: PI, state: 'drive', driver: 'ran-den', scope: 'step' },
  { k: 'vehicle', id: 'suv-sau', model: 'suv-den', at: 'ch11.suv-sau', yaw: PI, state: 'drive', driver: 'ran-den', scope: 'step' },
  ...BIKERS.map((id): Act => ({ k: 'vehicle', id, model: 'scooter', at: `ch11.${id}`, yaw: PI, state: 'drive', driver: 'ran-den', scope: 'step' })),
  { k: 'vehicle', id: 'vios-van', model: 'vios-van', at: 'moonlight.vanCar', yaw: H, state: 'drive', driver: 'van', scope: 'step' },
  { k: 'do', op: 'chase', args: {
    id: 'doan-xe-lanh', controller: 'convoy', ride: 'xe-lanh', target: 'player', escorts: { front: 'suv-truoc', rear: 'suv-sau' }, bikers: BIKERS,
    armed: 'pistol', want: 35, ceil: 15, crowdSpeed: 6, leap: { lateral: [1.0, 2.2], longitudinal: [-2.5, 0.5], hold: 0.8 } } },
  // the c7-m2 tracker blip (chapter 10's op) now rides the truck itself
  { k: 'do', op: 'tracker', args: { id: 'dinh-vi-sa-lan', ride: 'xe-lanh', on: true } },
  { k: 'do', op: 'chase', args: { id: 'xe-chi-van', controller: 'ally', ride: 'vios-van', mode: 'follow', back: 18 } },
  // the troupe is not on the convoy's road yet (a 'block' troupe is in env.clear: the truck would stall at it); it
  // closes the junction once the truck is through (the step watcher), between the truck and the chasers
  { k: 'do', op: 'festival', args: { id: 'ram-thang-tam', on: true, river: true, troupes: [] } },
  { k: 'do', op: 'gps', args: { route: 'r-xe-dong-lanh' } },
  { k: 'music', id: 'pulse' },
];
/** The wreck on the promenade: the hanging truck (tilt stages 0–3) and the broken railing (decision 17). */
const TILT = (n: number): Act => ({ k: 'prop', id: 'xe-treo', kind: 'hanging-truck', at: 'lan-can-bach-dang.cab', yaw: PI, variant: `tilt-${n}` });
const WRECK: Act[] = [TILT(0), { k: 'prop', id: 'lan-can-gay', kind: 'broken-railing', at: 'lan-can-bach-dang' }];
const truckSlides: FailDef = { when: { k: 'on', ev: 'timer', id: 'xe-truot' }, reason: '@c11m1.fail.truot', allowSkipAfter: 3, skipTo: 'bat-luc' };

const c11m1 = defineMission({
  id: 'c11-m1', meta: { hours: [23, 2], giver: 'van' }, chain: 'c11-m2', lethal: 'allow',
  start: { at: 'san-sau-pho-dem.loadingBay', yaw: PI, vehicle: 'dream', hour: 23.83, weather: 'clear', lunar: 15, outfit: 'tin-ao-tu' },
  world: { traffic: 'light', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 23.83, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [FESTIVAL],
  steps: [
    {
      id: 'dem-ram', minutes: 0.6,
      enter: [
        { k: 'title', kind: 'time', text: '@c11m1.title', sub: '@c11m1.titleSub' },
        aside('c11m1-bai', [think('c11m1.think.bai')]),
        { k: 'call', id: 'c11m1-van', from: 'van', ring: false, lines: [
          radio('van', 'c11m1.v1'), radio('tin', 'c11m1.t1'), radio('van', 'c11m1.v2'), radio('van', 'c11m1.v3'),
          radio('tin', 'c11m1.t2'), radio('van', 'c11m1.v4'), radio('van', 'c11m1.v5'), radio('tin', 'c11m1.t3')] },
      ],
    },
    {
      // the chase; the leap and the cab fight are its exit, on the truck where the player drew level with it (next: the railing)
      id: 'duoi', minutes: 3.2, objective: '@c11m1.obj.duoi', meters: [SAVED_METER], next: 'lan-can',
      checkpoint: { label: '@c11m1.cp.duoi', setup: [put('san-sau-pho-dem.loadingBay', 'dream', 4), ...CONVOY] },
      subs: [
        { id: 'kip', text: '@c11m1.sub.kip', done: { k: 'near', a: 'player', b: 'xe-lanh', r: 35 } },
        { id: 'hong', text: '@c11m1.sub.hong', done: { k: 'on', ev: 'arrived', id: 'doan-xe-lanh' } },
      ],
      enter: [
        // the slip in the meltwater: where the truck was going, and by when (optional)
        { k: 'clue', id: 'phieu-xuat', at: 'san-sau-pho-dem.loadingBay', r: 2, evidence: 'ev-phieu-xuat', examine: 'object:delivery-slip', scope: 'step' },
        hint('c11m1.hint.phieu', 6000),
      ],
      optional: [
        { id: 'phieu-xuat', text: '@c11m1.opt.phieu', when: owned('ev-phieu-xuat'), reward: [aside('c11m1-phieu', [think('c11m1.think.phieu')])] },
        { id: 'da-ca-bon', text: '@c11m1.opt.daCaBon', when: { k: 'stat', name: 'knockouts', op: '>=', value: 4 } },
      ],
      watchers: [
        { when: { k: 'near', a: 'player', b: 'xe-lanh', r: 60 }, do: [hint('c11m1.hint.da', 8000)] },
        { when: { k: 'near', a: 'player', b: 'xe-lanh', r: 45 }, do: [
          { k: 'do', op: 'chase', args: { id: 'xe-chi-van', controller: 'ally', ride: 'vios-van', mode: 'pit', target: 'suv-sau', within: 20 } },
          aside('c11m1-pit', [radio('van', 'c11m1.v6')])] },
        { when: { k: 'vehicle', id: 'suv-sau', state: 'wrecked' }, do: [aside('c11m1-pit-2', [radio('van', 'c11m1.v7')])] },
        { when: { k: 'on', ev: 'knockout' }, do: [aside('c11m1-ko', [think('c11m1.think.ko')])] },
        { when: { k: 'on', ev: 'hurt', tag: 'civilian' }, do: [hint('c11m1.hint.nguoi', 6000)] },
        { when: reach('nga-tu-216-54', 40), do: [aside('c11m1-nga-tu', [think('c11m1.think.ngaTu')])] },
        // the truck is through NGÃ TƯ NGUYỄN HUỆ: the lion dance closes it behind it (the junction where Mai was lost, c4-m2)
        { when: { k: 'vehicle', id: 'xe-lanh', at: 'ch11.qua-lan', r: 6 }, do: [LION_BLOCK, hint('c11m1.hint.lan', 7000)] },
      ],
      fail: [
        { when: { k: 'on', ev: 'lost', id: 'doan-xe-lanh' }, reason: '@c11m1.fail.mat', allowSkipAfter: 3, skipTo: 'nhay' },
        { when: { k: 'on', ev: 'escaped', id: 'doan-xe-lanh' }, reason: '@c11m1.fail.thoat', allowSkipAfter: 3, skipTo: 'nhay' },
      ],
      exit: LEAP,
    },
    {
      // reached only by 'Bỏ qua đoạn này' after three lost chases (or its own restore): a stopped truck at a fixed leap
      // point short of the T, the Dream alongside, then the same leap and cab fight as the chase's exit
      id: 'nhay', minutes: 0.4,
      checkpoint: { label: '@c11m1.cp.nhay', setup: [TRUCK('ch11.nhay', 'stop'), put('ch11.nhay-ben', 'dream', 3)] },
      enter: LEAP,
    },
    {
      id: 'lan-can', minutes: 0.5,
      enter: [{ k: 'cutscene', id: 'c11m1-lan-can' }, { k: 'music', id: 'tension' }],
    },
    {
      id: 'cat-khoa', minutes: 0.6, objective: '@c11m1.obj.catKhoa', marker: { at: 'ch11.cua-thung', label: '@c11m1.mk.cua', style: 'go' }, meters: [SAVED_METER],
      checkpoint: { label: '@c11m1.cp.catKhoa', setup: [
        put('ch11.cua-thung', undefined, 6), ...WRECK, { k: 'give', item: 'kim-cong-luc' },
        { k: 'spawn', id: 'van', cast: 'van', at: 'lan-can-bach-dang.arrest', team: 'ally', behaviour: { k: 'guard', post: 'lan-can-bach-dang.arrest', sweep: 0 } },
        { k: 'spawn', id: 'loc', cast: 'loc', at: 'ben-bach-dang.handover', team: 'ally', behaviour: { k: 'act', name: 'cross-arms' } }] },
      interact: [{ id: 'cat-khoa', at: 'ch11.cua-thung', r: 1.6, hold: 2.5, prompt: '@c11m1.int.catKhoa', kind: 'use', when: 'foot' }],
      enter: [
        { k: 'timer', id: 'xe-truot', seconds: 60, label: '@c11m1.timer', scope: 'mission' },
        { k: 'do', op: 'danger', args: { on: true } }, hint('c11m1.hint.catKhoa', 7000),
      ],
      watchers: [{ when: after(18), do: [TILT(1), bark('van', 'c11m1.bark.truot', true)] }],
      done: used('cat-khoa'),
      fail: [truckSlides],
      exit: [{ k: 'take', item: 'kim-cong-luc' }, { k: 'cutscene', id: 'c11m1-mo-thung' }],
    },
    {
      id: 'dan-nguoi', minutes: 1, objective: '@c11m1.obj.dan', marker: { at: 'ben-bach-dang.handover', label: '@c11m1.mk.loc', style: 'go' }, meters: [SAVED_METER],
      enter: [
        { k: 'do', op: 'escort', args: { id: 'nguoi-xe-lanh', spec: TRUCK_GROUP, cmd: { k: 'follow' } } },
        hint('c11m1.hint.dan', 8000),
      ],
      watchers: [
        { when: after(12), do: [TILT(2), bark('loc', 'c11m1.bark.loc', true)] },
        { when: after(26), do: [TILT(3), aside('c11m1-ken', [think('c11m1.think.ken')])] },
      ],
      done: { k: 'on', ev: 'arrived', id: 'nguoi-xe-lanh' },
      fail: [truckSlides],
      exit: [
        { k: 'stopTimer', id: 'xe-truot' }, { k: 'do', op: 'danger', args: { on: false } },
        { k: 'flag', name: 'rescued', value: 40 }, { k: 'flag', name: 'truckRescue' }, { k: 'journal', id: 'j-xe-lanh' },
      ],
    },
    {
      id: 'bat-luc', minutes: 0.7,
      enter: [
        // a skip after three slides lands here: the twelve are out all the same
        { k: 'if', c: { k: 'not', c: flag('truckRescue') }, then: [
          { k: 'stopTimer', id: 'xe-truot' }, { k: 'take', item: 'kim-cong-luc' }, { k: 'do', op: 'danger', args: { on: false } },
          { k: 'flag', name: 'rescued', value: 40 }, { k: 'flag', name: 'truckRescue' }, { k: 'journal', id: 'j-xe-lanh' }] },
        { k: 'cutscene', id: 'c11m1-bat-luc' },
        { k: 'prop', id: 'xe-treo', remove: true },
        { k: 'evidence', id: 'ev-luc-khai' }, toast('c11m1.toast.cuu'), { k: 'music', id: null },
        aside('c11m1-cuoi', [think('c11m1.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'lucArrested' }],
  medals: { par: 420, clues: ['phieu-xuat'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], flags: { rescued: 28 } },
});

// ---- c11-m2 · Tầng 68 --------------------------------------------------------------------------------------------

const DECK = (at: string) => `dai-quan-sat-68.${at}`;
/** The deck as a social arena: the shipper cover, nobody to take down, innocents only (stealth-player-kit.md §2 'innocent'). */
const DECK_ARENA: Act = {
  k: 'stealth', arena: 'thap-68', cover: 'shipper',
  rules: { takedowns: false, guns: 'none', lethal: 'fail', failOn: [], showCones: 'never', countConscience: true, respawn: 'checkpoint' },
};
/** Six people at most (decision 12): the café manager, two deck staff at the east gate, three moon-watchers. */
const DECK_PEOPLE: Act[] = [
  { k: 'spawn', id: 'quan-ly', cast: 'quan-ly', at: DECK('cafe'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'serve' } },
  { k: 'spawn', id: 'nv-dai-1', cast: 'nv-dai', at: DECK('gate'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'cross-arms' } },
  { k: 'spawn', id: 'nv-dai-2', cast: 'nv-dai', at: DECK('photo'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'guard', post: DECK('gate'), sweep: 60 } },
  { k: 'spawn', id: 'khach-1', cast: 'khach-ngam', at: 'ch11.ngam-1', team: 'neutral', tags: ['bystander'], behaviour: { k: 'act', name: 'watch-moon' } },
  { k: 'spawn', id: 'khach-2', cast: 'khach-ngam', at: 'ch11.ngam-2', team: 'neutral', tags: ['bystander'], behaviour: { k: 'act', name: 'watch-moon' } },
  { k: 'spawn', id: 'khach-3', cast: 'khach-ngam', at: DECK('rack'), team: 'neutral', tags: ['bystander'], behaviour: { k: 'act', name: 'watch-moon' } },
];
const harmed = (tag: string): Cond => ({ k: 'any', of: [{ k: 'on', ev: 'hurt', tag }, { k: 'on', ev: 'knockout', tag }, { k: 'on', ev: 'kill', tag }] });
const innocents: FailDef = { when: { k: 'any', of: [harmed('innocent'), harmed('bystander')] }, reason: '@c11m2.fail.voToi' };
/** Phượng's black-and-gold helicopter on the H, nose east (decision 11): parked ('park') or holding a low hover ('stop'). */
const HELI = (state: 'park' | 'stop'): Act => ({ k: 'vehicle', id: 'heli-sv', model: 'heli:sen-vang', at: 'san-thuong-tai-chinh.pad', yaw: H, state });

const c11m2 = defineMission({
  id: 'c11-m2', meta: { hours: [0, 3], giver: 'van' }, chain: 'c11-m3', lethal: 'fail', lethalReason: '@c11m2.fail.voToi',
  start: { at: 'tai-chinh', yaw: 0, hour: 0.33, weather: 'clear', lunar: 15, outfit: 'tin-shipper' },
  world: { traffic: 'light', crowd: 'thin', police: 'story', gangs: 'calm', clock: { hour: 0.33, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [FESTIVAL, HELI('park')],
  steps: [
    {
      id: 'chan-thap', minutes: 0.8,
      enter: [
        { k: 'title', kind: 'time', text: '@c11m2.title', sub: '@c11m2.titleSub' },
        { k: 'call', id: 'c11m2-van', from: 'van', ring: false, lines: [
          // chapter 9's two locks open: Diễm testifies (her c10-m4 call), Kiều Anh publishes, the task force stops waiting 48 hours
          radio('van', 'c11m2.v1'), radio('van', 'c11m2.v2'), radio('van', 'c11m2.v3'), radio('van', 'c11m2.v3b'), radio('tin', 'c11m2.t1'), radio('van', 'c11m2.v4')] },
        aside('c11m2-thap', [think('c11m2.think.thap')]),
        { k: 'do', op: 'appOrder', args: { id: 'don-0815', state: 'offer', title: '@c11m2.order', from: 'thap-phuong-nam', to: 'dai-quan-sat-68', fee: 40, customer: '@c11m2.order.khach' } },
        toast('c11m2.toast.don'),
        { k: 'call', id: 'c11m2-van-2', from: 'van', ring: false, lines: [radio('tin', 'c11m2.t2'), radio('van', 'c11m2.v5'), radio('tin', 'c11m2.t3')] },
        { k: 'do', op: 'appOrder', args: { id: 'don-0815', state: 'active' } },
        // Ông Tư's dark jacket off, the orange windbreaker on: the shipper nobody looks at is the way in
        { k: 'player', outfit: 'tin-shipper' }, aside('c11m2-ao', [think('c11m2.think.ao')]),
      ],
    },
    {
      id: 'lay-banh', minutes: 0.8, objective: '@c11m2.obj.lay', marker: { at: 'thap-phuong-nam', label: '@c11m2.mk.sanh', style: 'go' },
      checkpoint: { label: '@c11m2.cp.lay', setup: [
        put('tai-chinh', undefined, 70),
        { k: 'spawn', id: 'bao-ve-thap', cast: 'bao-ve-thap', at: 'thap-phuong-nam', team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'desk-head-down' } }] },
      interact: [{ id: 'lay-banh', at: 'thap-phuong-nam', r: 2.5, prompt: '@c11m2.int.lay', kind: 'pick', when: 'foot' }],
      done: used('lay-banh'),
      exit: [
        { k: 'player', carry: 'order-banh-trung-thu', lock: ['run'] },
        talk('c11m2-soi', [say('bao-ve-thap', 'c11m2.bv1'), say('tin', 'c11m2.t4'), say('bao-ve-thap', 'c11m2.bv2'), say('bao-ve-thap', 'c11m2.bv3')]),
        aside('c11m2-soi-2', [think('c11m2.think.soi')]),
        { k: 'fade', to: 'black', ms: 900 }, { k: 'despawn', id: 'bao-ve-thap' },
        { k: 'teleport', at: DECK('rack') },
        { k: 'title', kind: 'place', text: '@c11m2.title2', sub: '@c11m2.title2Sub' },
        { k: 'fade', to: 'clear', ms: 900 },
      ],
    },
    {
      id: 'giao-banh', minutes: 1.2, objective: '@c11m2.obj.giao', marker: { at: DECK('cafe'), label: '@c11m2.mk.cafe', style: 'talk' },
      hud: { cover: true }, meters: [{ id: 'cover:shipper', label: '@c11m2.meter.cover', kind: 'bar', max: 1 }],
      checkpoint: { label: '@c11m2.cp.giao', setup: [put(DECK('rack'), undefined, 6), { k: 'player', carry: 'order-banh-trung-thu', lock: ['run'] }, DECK_ARENA, ...DECK_PEOPLE] },
      interact: [{ id: 'giao-banh', at: DECK('cafe'), r: 1.6, prompt: '@c11m2.int.giao', kind: 'use', when: 'foot' }],
      enter: [hint('c11m2.hint.cover', 8000), aside('c11m2-cong', [think('c11m2.think.cong')])],
      watchers: [
        { when: after(6), do: [hint('c11m2.hint.voToi', 7000)] },
        { when: reach(DECK('gate'), 1.6), do: [bark('nv-dai-1', 'c11m2.bark.nv')], cooldown: 10 },
      ],
      done: used('giao-banh'),
      fail: [innocents, { when: { k: 'meter', id: 'cover:shipper', op: '>=', value: 1 }, reason: '@c11m2.fail.lo', soft: true }],
      retry: [{ k: 'teleport', at: DECK('rack') }, { k: 'player', carry: 'order-banh-trung-thu', lock: ['run'], cover: 'shipper' }],
      exit: [
        { k: 'player', carry: null, lock: null },
        { k: 'do', op: 'appOrder', args: { id: 'don-0815', state: 'done' } }, { k: 'cash', n: 40 },
        talk('c11m2-ky', [say('quan-ly', 'c11m2.ql1'), say('quan-ly', 'c11m2.ql2'), say('nv-dai', 'c11m2.nv1')]),
      ],
    },
    {
      // twenty seconds while the two deck staff sign and carry the boxes in; the gate prompt appears once he has a rig
      id: 'cong-nhay', minutes: 1, objective: '@c11m2.obj.cong',
      timer: { seconds: 20, label: '@c11m2.timer.cuaSo' },
      subs: [
        { id: 'du', text: '@c11m2.sub.du', done: used('lay-du') },
        { id: 'cong', text: '@c11m2.sub.cong', done: used('nhay-du') },
      ],
      interact: [{ id: 'lay-du', at: DECK('rack'), r: 1.4, hold: 1, prompt: '@c11m2.int.du', kind: 'pick', when: 'foot' }],
      enter: [
        { k: 'behave', id: 'nv-dai-1', b: { k: 'goto', at: DECK('cafe') } }, { k: 'behave', id: 'nv-dai-2', b: { k: 'goto', at: DECK('cafe') } },
        bark('quan-ly', 'c11m2.bark.ky'), hint('c11m2.hint.cong', 7000),
      ],
      watchers: [{ when: used('lay-du'), do: [
        { k: 'give', item: 'du' },
        { k: 'interactable', id: 'nhay-du', at: DECK('gate'), r: 1.4, prompt: '@c11m2.int.nhay', kind: 'use', when: 'foot' },
        { k: 'marker', id: 'cong', at: DECK('gate'), label: '@c11m2.mk.cong', style: 'go' }] }],
      fail: [innocents, { when: { k: 'on', ev: 'timer', id: 'cong-nhay' }, reason: '@c11m2.fail.quayLai', soft: true }],
      retry: [
        { k: 'teleport', at: DECK('cafe') },
        { k: 'behave', id: 'nv-dai-1', b: { k: 'act', name: 'cross-arms' } }, { k: 'behave', id: 'nv-dai-2', b: { k: 'guard', post: DECK('gate'), sweep: 60 } },
      ],
      exit: [
        { k: 'take', item: 'du' }, { k: 'stealth', arena: null },
        { k: 'cutscene', id: 'c11m2-cong-nhay' },
        { k: 'do', op: 'heli', args: { id: 'heli-sv', mode: 'spool', on: true, seconds: 40 } },
        { k: 'do', op: 'deckJump', args: { from: DECK('gate'), open: true, toward: 'san-thuong-tai-chinh.pad' } },
      ],
    },
    {
      id: 'luot', minutes: 1.2, objective: '@c11m2.obj.luot', marker: { at: 'san-thuong-tai-chinh.pad', label: '@c11m2.mk.vong', style: 'go', r: 8 }, next: 'end',
      enter: [hint('c11m2.hint.luot', 8000)],
      done: signal('landed', { pad: true }),
      branch: [{ when: signal('landed', { pad: false }), goto: 'truot' }],
      exit: [aside('c11m2-dap', [think('c11m2.think.dap')])],
    },
    {
      // fail-forward (story-decisions.md 11): the west service door, the freight lift, the harder branch of c11-m3
      id: 'truot', minutes: 1, objective: '@c11m2.obj.truot', marker: { at: 'tai-chinh.service', label: '@c11m2.mk.dichVu', style: 'go' }, next: 'end',
      checkpoint: { label: '@c11m2.cp.truot', setup: [put('tai-chinh.service', undefined, 90)] },
      timer: { seconds: 60, label: '@c11m2.timer.truot', fail: '@c11m2.fail.catCanh' },
      interact: [{ id: 'cua-dich-vu', at: 'tai-chinh.service', r: 2, prompt: '@c11m2.int.dichVu', kind: 'enter', when: 'foot' }],
      enter: [
        aside('c11m2-truot', [think('c11m2.think.truot')]),
        { k: 'call', id: 'c11m2-van-3', from: 'van', ring: false, lines: [radio('van', 'c11m2.v6'), radio('van', 'c11m2.v7')] },
        hint('c11m2.hint.truot', 6000),
      ],
      done: used('cua-dich-vu'),
      exit: [
        { k: 'flag', name: 'hoverBranch' },
        { k: 'do', op: 'heli', args: { id: 'heli-sv', mode: 'hover', at: 'san-thuong-tai-chinh.pad', height: 6 } },
        { k: 'fade', to: 'black', ms: 900 }, { k: 'teleport', at: 'san-thuong-tai-chinh.stairs' }, { k: 'fade', to: 'clear', ms: 900 },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'deckDelivered' }],
  medals: { par: 300 },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], flags: { rescued: 40, lucArrested: true } },
});

// ---- c11-m3 · Sân đỗ trực thăng ----------------------------------------------------------------------------------

const PAD = (at: string) => `san-thuong-tai-chinh.${at}`;
/** The roof pad as an arena: takedowns and looted pistols allowed, every kill booked; the rotor wash masks noise (§3.6). */
const PAD_ARENA: Act = {
  k: 'stealth', arena: 'san-do',
  rules: { takedowns: true, guns: 'loot', lethal: 'allow', failOn: [], showCones: 'observe', countConscience: true, respawn: 'checkpoint', policeSuppressed: true, noise: 0.3 },
};
const GUARDS: Act[] = [
  { k: 'spawn', id: 've-si-1', cast: 've-si', template: 'ran-den', at: 'ch11.ve-si-1', team: 'hostile', weapon: 'pistol', tags: ['ve-si'], behaviour: { k: 'act', name: 'load-crates' } },
  { k: 'spawn', id: 've-si-2', cast: 've-si', template: 'ran-den', at: 'ch11.ve-si-2', team: 'hostile', weapon: 'pistol', tags: ['ve-si'], behaviour: { k: 'act', name: 'load-crates' } },
];
/** Stage 2 (rebuilt on a restore; on the main path the two loaders already stand there and only turn to fight). */
const FIGHT: Act[] = [
  ...GUARDS,
  { k: 'spawn', id: 'su', cast: 'su', at: PAD('ac'), team: 'victim', tags: ['victim'], behaviour: { k: 'act', name: 'hide-crouch' } },
  { k: 'behave', id: 've-si-1', b: { k: 'guard', post: PAD('fuel'), sweep: 90 } },
  { k: 'behave', id: 've-si-2', b: { k: 'guard', post: PAD('pad'), sweep: 90 } },
];
const ALARM: Act[] = [{ k: 'do', op: 'stealthAlarm', args: { level: 3, reason: 'shipper' } }, { k: 'music', id: 'pulse' }];
const twoGuards = [
  { id: 'v1', text: '@c11m3.sub.v1', done: down('ve-si-1') },
  { id: 'v2', text: '@c11m3.sub.v2', done: down('ve-si-2') },
];

const c11m3 = defineMission({
  id: 'c11-m3', meta: { hours: [0, 3], giver: 'van' }, chain: 'c11-m4', lethal: 'allow',
  start: { hour: 0.67, weather: 'clear', lunar: 15, outfit: 'tin-shipper' },
  world: { traffic: 'light', crowd: 'thin', police: 'story', gangs: 'calm', clock: { hour: 0.67, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [
    PAD_ARENA, FESTIVAL,
    { k: 'if', c: flag('hoverBranch'),
      then: [HELI('stop'), { k: 'do', op: 'heli', args: { id: 'heli-sv', mode: 'hover', at: PAD('pad'), height: 6 } }],
      else: [HELI('park'), { k: 'do', op: 'heli', args: { id: 'heli-sv', mode: 'spool', on: true, rotor: 0.6 } }] },
  ],
  steps: [
    {
      id: 'giu-su', minutes: 2, objective: '@c11m3.obj.su', hud: { light: true, noise: true },
      checkpoint: { label: '@c11m3.cp.su', setup: [
        { k: 'if', c: flag('hoverBranch'), then: [put(PAD('stairs'), undefined, 3)], else: [put(PAD('pad'), undefined, 9)] },
        ...GUARDS,
        { k: 'spawn', id: 've-si-3', cast: 've-si', template: 'ran-den', at: 'ch11.ve-si-3', team: 'hostile', weapon: 'pistol', tags: ['ve-si'], behaviour: { k: 'act', name: 'hold-hand' } },
        { k: 'spawn', id: 'su', cast: 'su', at: 'ch11.su', team: 'victim', tags: ['victim'], behaviour: { k: 'captive' } }] },
      enter: [
        { k: 'title', kind: 'time', text: '@c11m3.title', sub: '@c11m3.titleSub' },
        aside('c11m3-dau', [think('c11m3.think.dau')]), hint('c11m3.hint.gio', 9000),
      ],
      watchers: [{ when: after(12), do: [hint('c11m3.hint.sau', 7000)] }],
      done: down('ve-si-3'),
      fail: [caught('c11m3.fail.lo', 'nup')],
    },
    {
      // a checkpoint too, so that 'Bỏ qua đoạn này' after three detections still hides Su before the fight
      id: 'nup', minutes: 0.4,
      checkpoint: { label: '@c11m3.cp.nup', setup: [
        { k: 'spawn', id: 'su', cast: 'su', at: 'ch11.su', team: 'victim', tags: ['victim'], behaviour: { k: 'captive' } }] },
      branch: [{ when: flag('hoverBranch'), goto: 'danh-treo' }],
      enter: [
        talk('c11m3-su', [say('tin', 'c11m3.t1', { voice: 'whisper' }), say('su', 'c11m3.su1'), say('tin', 'c11m3.t2'), say('su', 'c11m3.su2'), say('tin', 'c11m3.t3')]),
        { k: 'behave', id: 'su', b: { k: 'goto', at: PAD('ac') } },
      ],
    },
    {
      id: 'danh', minutes: 1.6, objective: '@c11m3.obj.danh', next: 'doi-mat', hud: { light: true, noise: true },
      checkpoint: { label: '@c11m3.cp.danh', setup: [put(PAD('pad'), undefined, 12), ...FIGHT] },
      subs: twoGuards,
      enter: [...ALARM, bark('ve-si-1', 'c11m3.bark.vs1', true), hint('c11m3.hint.danh', 8000)],
      watchers: [{ when: after(6), do: [bark('ve-si-2', 'c11m3.bark.vs2', true)] }],
    },
    {
      // the harder branch: the aircraft already hovers six metres over the pad; shoot the tail rotor to bring it down
      id: 'danh-treo', minutes: 1.6, objective: '@c11m3.obj.treo', next: 'doi-mat', hud: { light: true, noise: true },
      checkpoint: { label: '@c11m3.cp.danh', setup: [put(PAD('stairs'), undefined, 12), ...FIGHT] },
      timer: { seconds: 120, label: '@c11m3.timer.treo', fail: '@c11m3.fail.bay' },
      subs: [...twoGuards, { id: 'duoi', text: '@c11m3.sub.duoi', done: signal('heliLanded') }],
      enter: [...ALARM, bark('ve-si-1', 'c11m3.bark.vs1', true), hint('c11m3.hint.duoi', 9000)],
      watchers: [
        { when: after(6), do: [bark('ve-si-2', 'c11m3.bark.vs2', true)] },
        { when: signal('heliLanded'), do: [aside('c11m3-dap', [think('c11m3.think.dap')])] },
      ],
    },
    {
      // CS12 in three parts; the "Giữ tay" hold closes the first (the catch at the edge) and the "Kéo lên" mash ends the
      // wrists' close-up in the second: scene QTEs, the frame holds on them and a miss rewinds (she cannot fall: 'loop')
      id: 'doi-mat', minutes: 2.2,
      enter: [
        { k: 'music', id: 'tension' },
        { k: 'vehicle', id: 'heli-tf', model: 'heli:task-force', at: PAD('taskForce'), yaw: -H, state: 'stop' },
        { k: 'do', op: 'heli', args: { id: 'heli-tf', mode: 'hover', at: PAD('taskForce'), spot: 'heli-sv' } },
        { k: 'cutscene', id: 'cs12_giao_tan_tay' },
        { k: 'cutscene', id: 'cs12_giao_tan_tay_trao' },
        { k: 'flag', name: 'rescued', value: 41 }, { k: 'evidence', id: 'ev-so-goc' }, { k: 'journal', id: 'j-giao-tan-tay' }, toast('c11m3.toast.cuu'),
        { k: 'cutscene', id: 'cs12_binh_minh' },
        { k: 'stealth', arena: null }, { k: 'music', id: null },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'giaoTanTay' }],
  medals: { par: 420 },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], flags: { rescued: 40, lucArrested: true, deckDelivered: true } },
});

// ---- c11-m4 · Mùa sen --------------------------------------------------------------------------------------------

/** Cô Ba's last lines follow the LƯƠNG TÂM tier (flags.ts conscienceTier). */
const tier = (is: 'clean' | 'stained' | 'lost'): Cond => ({ k: 'conscience', is });
const STOPS: Act[] = [
  { k: 'spawn', id: 'coba', cast: 'coba', at: 'cafe-co-ba', team: 'ally', behaviour: { k: 'act', name: 'kettle-pour' } },
  { k: 'spawn', id: 'basau', cast: 'basau', at: 'che-ba-sau', team: 'neutral', behaviour: { k: 'act', name: 'ladle' } },
  { k: 'spawn', id: 'van', cast: 'van', at: 'truong-tieu-hoc.gate', team: 'ally', behaviour: { k: 'act', name: 'cross-arms' } },
  { k: 'spawn', id: 'bong', cast: 'bong', at: 'ch11.bong', team: 'neutral', behaviour: { k: 'act', name: 'pace-happy' } },
  { k: 'spawn', id: 'diem', cast: 'diem', at: 'cong-vien-thanh-pho', team: 'neutral', behaviour: { k: 'act', name: 'hold-bags' } },
  { k: 'spawn', id: 'su', cast: 'su', at: 'ch11.su-cv', team: 'neutral', behaviour: { k: 'act', name: 'pace-happy' } },
];

const c11m4 = defineMission({
  id: 'c11-m4', meta: { hours: [15, 19], giver: 'quang' },
  start: { at: 'xe-may-ong-tu', yaw: 0, hour: 16.5, weather: 'clear', outfit: 'tin-shipper' },
  world: { traffic: 'normal', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 16.5, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [
    { k: 'lunar', day: 6, month: 9 },
    { k: 'prop', id: 'bang-ong-tu', kind: 'sign', variant: 'xe-may-ong-tu', at: 'xe-may-ong-tu', yaw: 0 },
    { k: 'prop', id: 'bang-co-ba', kind: 'sign', variant: 'co-ba-mo-lai', at: 'cafe-co-ba', yaw: PI },
    { k: 'vehicle', id: 'dream', model: 'dream', at: 'xe-may-ong-tu.tarp', yaw: H, state: 'park' },
    { k: 'do', op: 'bike', args: { id: 'dream', look: 'matte' } },
  ],
  steps: [
    {
      id: 'ba-tuan-sau', minutes: 1,
      enter: [
        { k: 'title', kind: 'chapter', text: '@c11m4.title', sub: '@c11m4.titleSub' },
        { k: 'cutscene', id: 'c11m4-tin-tuc' },
        { k: 'flag', name: 'debtVoid' }, toast('c11m4.toast.soNo'),
        { k: 'cutscene', id: 'c11m4-ve-nha' },
      ],
    },
    {
      id: 'tiem-moi', minutes: 0.5, objective: '@c11m4.obj.quang', marker: { at: 'xe-may-ong-tu', label: '@c11m4.mk.quang', style: 'talk' },
      checkpoint: { label: '@c11m4.cp.tiem', setup: [
        put('xe-may-ong-tu', undefined, 10),
        { k: 'spawn', id: 'quang', cast: 'quang', at: 'xe-may-ong-tu', team: 'ally', behaviour: { k: 'act', name: 'fix-bike' } },
        { k: 'spawn', id: 'mai', cast: 'mai', at: 'ch11.mai-tiem', team: 'ally', behaviour: { k: 'act', name: 'pace-happy' } }] },
      interact: [{ id: 'noi-quang', at: 'xe-may-ong-tu', r: 2.5, prompt: '@c11m4.int.quang', kind: 'talk', when: 'foot' }],
      done: used('noi-quang'),
      exit: [{ k: 'cutscene', id: 'c11m4-bang-hieu' }],
    },
    {
      id: 'len-xe', minutes: 0.2, objective: '@c11m4.obj.lenXe', marker: { at: 'xe-may-ong-tu.tarp', label: '@c11m4.mk.xe', style: 'go' },
      done: { k: 'reach', at: 'xe-may-ong-tu.tarp', r: 3, mode: 'bike' },
      exit: [
        { k: 'despawn', id: 'mai' }, { k: 'do', op: 'pillion', args: { cast: 'mai' } },
        aside('c11m4-len', [say('mai', 'c11m4.mai.cham'), say('quang', 'c11m4.quang.chao', { voice: 'shout' })]),
      ],
    },
    {
      // a free ride with Mai on the pillion: Cô Ba's table first (her "Nhớ về ăn cơm" of c9-m3), the other stops optional
      id: 'dao-pho', minutes: 1.2, objective: '@c11m4.obj.daoPho',
      checkpoint: { label: '@c11m4.cp.dao', setup: [put('xe-may-ong-tu.tarp', 'dream', 6), { k: 'do', op: 'pillion', args: { cast: 'mai' } }] },
      marker: [
        { id: 'mk-co-ba', at: 'cafe-co-ba', label: '@c11m4.mk.coBa', style: 'talk' }, { id: 'mk-ba-sau', at: 'che-ba-sau', label: '@c11m4.mk.baSau', style: 'subtle' },
        { id: 'mk-truong', at: 'truong-tieu-hoc.gate', label: '@c11m4.mk.truong', style: 'subtle' }, { id: 'mk-cv', at: 'cong-vien-thanh-pho', label: '@c11m4.mk.congVien', style: 'subtle' }],
      subs: [{ id: 'co-ba', text: '@c11m4.sub.coBa', done: used('ghe-co-ba', 'mission') }],
      interact: [
        { id: 'ghe-co-ba', at: 'cafe-co-ba', r: 3, prompt: '@c11m4.int.ghe', kind: 'talk', when: 'any' },
        { id: 'ghe-ba-sau', at: 'che-ba-sau', r: 3, prompt: '@c11m4.int.ghe', kind: 'talk', when: 'any' },
        { id: 'ghe-truong', at: 'truong-tieu-hoc.gate', r: 3, prompt: '@c11m4.int.ghe', kind: 'talk', when: 'any' },
        { id: 'ghe-cong-vien', at: 'cong-vien-thanh-pho', r: 4, prompt: '@c11m4.int.ghe', kind: 'talk', when: 'any' },
      ],
      enter: [...STOPS, hint('c11m4.hint.dao', 8000)],
      watchers: [
        { when: used('ghe-co-ba'), do: [
          talk('c11m4-co-ba', [
            say('coba', 'c11m4.coba1'),
            say('coba', 'c11m4.coba.sach', { if: tier('clean') }), say('coba', 'c11m4.coba.vet', { if: tier('stained') }), say('coba', 'c11m4.coba.nang', { if: tier('lost') }),
            say('mai', 'c11m4.mai.coba'), say('coba', 'c11m4.coba2'), say('coba', 'c11m4.coba3')]),
          { k: 'unmark', id: 'mk-co-ba' }, { k: 'objective', text: '@c11m4.obj.benXe' },
          { k: 'marker', id: 'mk-ben-xe', at: 'ben-xe-an-hoa', label: '@c11m4.mk.benXe', style: 'go' }] },
        { when: used('ghe-ba-sau'), do: [
          talk('c11m4-ba-sau', [say('basau', 'c11m4.basau.nho', { if: flag('helpedBaSau') }), say('basau', 'c11m4.basau.la', { if: { k: 'not', c: flag('helpedBaSau') } }), say('mai', 'c11m4.mai.che')]),
          { k: 'unmark', id: 'mk-ba-sau' }] },
        { when: used('ghe-truong'), do: [
          talk('c11m4-truong', [
            say('van', 'c11m4.van1'), say('van', 'c11m4.van.sach', { if: clean }), say('van', 'c11m4.van.dau', { if: hurtOnly }), say('van', 'c11m4.van.giet', { if: killed }),
            say('bong', 'c11m4.bong1'), say('tin', 'c11m4.t.bong'), say('van', 'c11m4.van2')]),
          { k: 'unmark', id: 'mk-truong' }] },
        { when: used('ghe-cong-vien'), do: [
          talk('c11m4-cong-vien', [say('su', 'c11m4.su1'), say('diem', 'c11m4.diem1'), say('diem', 'c11m4.diem2'), say('mai', 'c11m4.mai.diem1'), say('mai', 'c11m4.mai.diem2')]),
          { k: 'unmark', id: 'mk-cv' }] },
        // Mai's passenger chatter as they pass the places of the story
        { when: reach('pho-dem', 30), do: [aside('c11m4-pho-dem', [say('mai', 'c11m4.mai.phoDem'), say('tin', 'c11m4.t.phoDem')])] },
        { when: reach('cafe-co-ba.backStairs', 14), do: [aside('c11m4-gac', [say('mai', 'c11m4.mai.gac')])] },
        { when: reach('chua-an-hoa', 25), do: [aside('c11m4-chua', [say('mai', 'c11m4.mai.chua'), say('tin', 'c11m4.t.chua')])] },
        { when: reach('truong-tieu-hoc', 25), do: [aside('c11m4-day', [say('mai', 'c11m4.mai.day')])] },
        { when: { k: 'all', of: [reach('ben-xe-an-hoa', 20), { k: 'not', c: used('ghe-co-ba', 'mission') }] }, do: [aside('c11m4-truoc', [say('mai', 'c11m4.mai.truoc')])], cooldown: 20 },
      ],
      optional: [
        { id: 'ghe-ba-sau', text: '@c11m4.opt.baSau', when: used('ghe-ba-sau', 'mission') },
        { id: 'ghe-truong', text: '@c11m4.opt.truong', when: used('ghe-truong', 'mission') },
        { id: 'ghe-cong-vien', text: '@c11m4.opt.congVien', when: used('ghe-cong-vien', 'mission') },
      ],
      done: { k: 'all', of: [{ k: 'subs' }, reach('ben-xe-an-hoa', 12)] },
      exit: [{ k: 'despawn', id: 'coba' }, { k: 'despawn', id: 'basau' }, { k: 'despawn', id: 'van' }, { k: 'despawn', id: 'bong' }, { k: 'despawn', id: 'diem' }, { k: 'despawn', id: 'su' }],
    },
    {
      // BẾN XE AN HÒA: the mooncake she kept, and her own choice (cosmetic; both roads lead to the pier)
      id: 'ben-xe', minutes: 0.8,
      enter: [
        { k: 'do', op: 'pillion', args: { cast: null } },
        { k: 'vehicle', id: 'xe-do', model: 'coach', at: 'ben-xe-an-hoa.coach', yaw: -H, state: 'park' },
        { k: 'spawn', id: 'mai', cast: 'mai', at: 'ben-xe-an-hoa', team: 'ally', behaviour: { k: 'idle' } },
        { k: 'cutscene', id: 'c11m4-banh' },
        { k: 'choice', id: 'maiChon', prompt: '@c11m4.q.mai', options: [
          { id: 've-que', text: '@c11m4.opt.veQue' }, { id: 'o-lai', text: '@c11m4.opt.oLai' }] },
        talk('c11m4-chon', [
          say('mai', 'c11m4.mai.veQue1', { if: chose('maiChon', 've-que') }), say('mai', 'c11m4.mai.veQue2', { if: chose('maiChon', 've-que') }),
          say('tin', 'c11m4.t.veQue', { if: chose('maiChon', 've-que') }),
          say('mai', 'c11m4.mai.oLai1', { if: chose('maiChon', 'o-lai') }), say('mai', 'c11m4.mai.oLai2', { if: chose('maiChon', 'o-lai') }),
          say('tin', 'c11m4.t.oLai', { if: chose('maiChon', 'o-lai') })]),
        { k: 'if', c: chose('maiChon', 've-que'),
          then: [{ k: 'behave', id: 'mai', b: { k: 'goto', at: 'ben-xe-an-hoa.coach' } }, { k: 'wait', seconds: 3 }, { k: 'despawn', id: 'mai' },
            { k: 'vehicle', id: 'xe-do', route: ['ch11.xe-do-di'], cruise: 8, state: 'drive' }],
          else: [{ k: 'behave', id: 'mai', b: { k: 'goto', at: 'cafe-co-ba' } }] },
        aside('c11m4-di', [think('c11m4.think.di')]),
      ],
    },
    {
      id: 'ra-ben', minutes: 0.4, objective: '@c11m4.obj.ben', marker: { at: 'ben-an-hoa.sunset', label: '@c11m4.mk.ben', style: 'go' },
      checkpoint: { label: '@c11m4.cp.ben', setup: [put('ben-xe-an-hoa', undefined, 25), { k: 'do', op: 'pillion', args: { cast: null } }] },
      enter: [{ k: 'time', hour: 17.9 }, { k: 'music', id: 'theme-home', level: 0.6 }],
      done: { k: 'reach', at: 'ben-an-hoa.sunset', r: 3, mode: 'foot' },
      exit: [aside('c11m4-coi', [think('c11m4.think.coi')])],
    },
    {
      id: 'don-moi', minutes: 0.2,
      enter: [
        { k: 'do', op: 'appOrder', args: { id: 'don-moi', state: 'offer', title: '@c11m4.order', from: 'ben-an-hoa', to: 'ben-an-hoa', fee: 0, customer: '@c11m4.order.khach' } },
        { k: 'sms', from: 'app', text: '@c11m4.sms.don' },
        { k: 'choice', id: 'donMoi', prompt: '@c11m4.q.don', style: 'sms', options: [{ id: 'nhan', text: '@c11m4.opt.nhan' }, { id: 'de-sau', text: '@c11m4.opt.deSau' }] },
      ],
      branch: [{ when: { k: 'on', ev: 'choice', id: 'donMoi', where: { option: 'de-sau' } }, goto: 'ngoi-them' }],
      done: { k: 'all', of: [{ k: 'on', ev: 'choice', id: 'donMoi' }, chose('donMoi', 'nhan')] },
      next: 'het',
    },
    {
      id: 'ngoi-them', minutes: 0.3, next: 'don-moi',
      enter: [talk('c11m4-ngoi', [think('c11m4.think.ngoi1'), think('c11m4.think.ngoi2'), think('c11m4.think.ngoi3')]), { k: 'wait', seconds: 4 }],
    },
    {
      // the last lines, the badge, the credits, the stinger, and the city opens
      id: 'het', minutes: 0.9,
      enter: [
        { k: 'do', op: 'appOrder', args: { id: 'don-moi', state: 'active' } },
        { k: 'cutscene', id: 'c11m4-hoang-hon' },
        // the badge for a clean record only (the same tier as CS06, Vân after B2 and Cô Ba)
        { k: 'if', c: clean, then: [
          { k: 'title', kind: 'chapter', text: '@c11m4.badge', sub: '@c11m4.badgeSub' },
          { k: 'unlock', ability: 'luatOngTu', label: '@c11m4.unlock.luat' }, { k: 'flag', name: 'luatOngTu' }] },
        { k: 'do', op: 'credits', wait: true, args: { music: 'theme-home', lines: [
          '@c11m4.cr.tieuDe', '@c11m4.cr.bao', '@c11m4.cr.cuu', '@c11m4.cr.soGoc', '@c11m4.cr.hu', '@c11m4.cr.111', '@c11m4.cr.so', '@c11m4.cr.camOn'] } },
        { k: 'cutscene', id: 'c11m4-hau-truyen' },
        { k: 'unlock', outfit: 'tin-huyen-thoai', label: '@c11m4.unlock.ao' },
        { k: 'unlock', ability: 'chapterSelect', label: '@c11m4.unlock.chuong' },
        { k: 'flag', name: 'titleShipperBongDem' }, toast('c11m4.toast.danhHieu'), toast('c11m4.toast.tuDo'),
        { k: 'music', id: null },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'campaignDone' }],
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], flags: { rescued: 41, lucArrested: true, giaoTanTay: true } },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string = id, role = false): CastDef =>
  ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look, ...(role ? { role: `@cast.${id}.role` } : {}) });
export const CAST: CastDef[] = [
  person('su', '#ffb3c7', 'Su', 'su', true), person('bong', '#ffd27a', 'B', 'bong', true),
  person('ve-si', '#2f3338', 'V', 'bodyguard'), person('phi-cong', '#4a5160', 'P', 'pilot'),
  person('quan-ly', '#c9a27a', 'Q', 'cafe-manager'), person('nv-dai', '#7fa6c9', 'N', 'deck-staff'), person('khach-ngam', '#a0a7b0', 'K', 'resident'),
  person('bao-ve-thap', '#55606e', 'B', 'security-guard'), person('mc-tin-tuc', '#6c8fbf', 'TV', 'news-anchor'),
  { ...person('ong-gia', '#8a6d2f', '?', 'old-man-lotus-pin'), role: '@cast.ong-gia.role' },
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 11, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-phieu-xuat', 'document', 'phieuXuat', 'receipt', ['truck', 'ship', 'moonlight'], '02:00'),
  ev('ev-luc-khai', 'testimony', 'lucKhai', 'quote', ['luc', 'so-goc', 'phuong']),
  ev('ev-so-goc', 'document', 'soGoc', 'ledger', ['phuong', 'so-goc'], '61'),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [note('j-xe-lanh', 'diary', 'xeLanh'), note('j-giao-tan-tay', 'diary', 'giaoTanTay')];

/**
 * The chapter's own named points, checked on today's map by scripts/story-ch11.test.mjs: the convoy's column in the
 * boulevard's northbound lanes (x 218.6) with the bikers behind, the T where it should turn east and the far end of
 * that leg, the reefer box's rear doors on the promenade (the cab hangs at lan-can-bach-dang.cab), two moon-watchers
 * on the 68th-floor deck, the bodyguards and Su on the roof pad, Mai by Ông Tư's shop, Bống at the school gate, Su in
 * the park, and where the coach leaves the map westbound.
 */
export const PLACES: Record<string, PlaceDef> = {
  'ch11.xe-lanh': { x: 218.6, z: 40, yaw: PI, r: 1.5 },
  'ch11.suv-truoc': { x: 218.6, z: 28, yaw: PI, r: 1.2 },
  'ch11.suv-sau': { x: 218.6, z: 52, yaw: PI, r: 1.2 },
  'ch11.xe-may-1': { x: 217.4, z: 62, yaw: PI, r: 1 },
  'ch11.xe-may-2': { x: 219.8, z: 62, yaw: PI, r: 1 },
  'ch11.xe-may-3': { x: 217.4, z: 68, yaw: PI, r: 1 },
  'ch11.xe-may-4': { x: 219.8, z: 68, yaw: PI, r: 1 },
  'ch11.chu-t': { x: 218.6, z: -104.6, yaw: H, r: 1.5 },
  // the truck 10 m past NGÃ TƯ NGUYỄN HUỆ: the lion dance closes the junction behind it
  'ch11.qua-lan': { x: 218.6, z: -64, yaw: PI, r: 1.5 },
  // the skip's fixed leap point, 12 m short of the T, and the Dream alongside the truck's left flank
  'ch11.nhay': { x: 218.6, z: -92, yaw: PI, r: 1.5 },
  'ch11.nhay-ben': { x: 216.6, z: -91.4, yaw: PI, r: 1 },
  'ch11.duong-cang': { x: 320, z: -104.6, yaw: H, r: 1.5 },
  'ch11.cua-thung': { x: 219.3, z: -130.6, yaw: PI },
  'ch11.ngam-1': { x: 186.6, z: -84.7, y: 232.2 },
  'ch11.ngam-2': { x: 191.6, z: -79.4, y: 232.2 },
  'ch11.ve-si-1': { x: 246.5, z: -88.5, y: 168 },
  'ch11.ve-si-2': { x: 249.5, z: -89.5, y: 168 },
  'ch11.ve-si-3': { x: 235.6, z: -79.4, y: 168 },
  'ch11.su': { x: 236.6, z: -79.4, y: 168 },
  'ch11.mai-tiem': { x: -64.2, z: -63.4 },
  'ch11.bong': { x: 28.4, z: 118.8 },
  'ch11.su-cv': { x: 241.3, z: 74.4 },
  'ch11.xe-do-di': { x: -130, z: -113.4, yaw: -H, r: 1.5 },
};

/**
 * Off-map anchors this chapter adds ('set:space.anchor' in cutscenes; see content/ch01.ts ANCHORS): the two
 * cutscene-only sets of the epilogue and one wall of the ward station (chapter 3 declared the rest of it).
 */
export const ANCHORS: Record<string, Record<string, string>> = {
  courtroom: {
    dock: 'the dock: four accused standing in a row behind a wooden rail, two officers behind them',
    gallery: 'the public gallery benches facing the dock (Tín in the second row)',
    witness: 'the witness stand facing the bench, a microphone on a short stalk (Diễm)',
    corridor: 'the courthouse corridor outside the hall: tall windows, a wooden bench (Diễm and Su)',
  },
  'airport-lounge': {
    seat: 'a leather armchair by the window, a low table with a cup of tea (the old man)',
    window: 'the lounge window over the night apron, a departure board reflected in the glass',
  },
  'cong-an-office': {
    honor: 'the station honour wall beside the flag: framed portraits of Lê Văn Tư (young, in uniform) and his partner Hải, a vase of white chrysanthemums',
  },
};

/**
 * Engine ids this chapter uses beyond story/contract.ts (ENGINE_CONTRACT and SCENE_REQUESTS), by contract kind, with the
 * lane that builds them (the integrator adds them to ENGINE_CONTRACT; scripts/story-ch11.test.mjs lints the chapter
 * against the contract plus these, and fails if one is unused or missing).
 */
export const ENGINE_NEEDS: Partial<Record<ContractKind, Record<string, ContractEntry>>> = {
  ops: {
    qte: ['ui', "scene QTEs of the escort-boss-qte.md §3.4 catalogue as scene.ts cues {k:'qte', id, kind press|hold|mash|alternate, keys, label @key, window (real seconds), target, onFail 'loop', loop?: shot label}: the director's Wait, the frame holds until it succeeds (story/qte.ts + QtePrompt.tsx; c11m1-gun, c11m1-wheel in c11m1-ca-bin, c11m3-grip, c11m3-haul in CS12)"],
    deckJump: ['core', "start the existing deck jump from a deck spot {from, open: true (the canopy is already open: CS 'c11m2-cong-nhay' ends on it), toward}; the glide is the player's and ends with signal 'landed'"],
    pillion: ['core', "a story passenger on the Dream's pillion seat {cast | null} (escort-boss-qte.md §1.10 host.setPillion; c11-m4 Mai, and c9-m3 Cô Ba)"],
    credits: ['ui', 'roll the end credits {lines: @keys (text with {name} and {@key}), music}; blocks until they end or are skipped (c11-m4)'],
    tracker: ['ui', "the c7-m2 GPS tracker blip on the minimap and the phone map (chapter 10 requests it with a route): {id, ride} follows a story vehicle, {id, on:false} hides it (c11-m1)"],
  },
  signals: {
    landed: ['core', "a parachute glide ended (spaces-surfaces-levelkit.md §7.6): {type:'signal', id:'landed', pad: true on a landable roof slab (the TÀI CHÍNH pad), false anywhere else} (c11-m2)"],
    heliLanded: ['vehicles', "a story helicopter came down on a pad after its tail rotor was shot out (festival-blackout-heli.md §3.5 'autorotate'): {type:'signal', id:'heliLanded', heli} (c11-m3)"],
  },
  models: {
    'reefer-truck': ['vehicles', "Lực's refrigerated truck: box body with the golden-lotus decal, climbable rear ladder, padlocked rear doors (chase-wanted.md §5.7 FLEET 'truck' cargo 'box'; c11-m1)"],
    'heli:sen-vang': ['vehicles', "Phượng's helicopter: the police heli model and flight code in the black-and-gold livery with the golden-lotus tail (festival-blackout-heli.md §3.2 LIVERIES.senVang; c11-m2, c11-m3)"],
    'heli:task-force': ['vehicles', "the Ministry task force's helicopter, white and blue with a red pinstripe, searchlight; it holds its hover off the pad (LIVERIES.taskForce; c11-m3)"],
  },
  arenas: {
    'thap-68': ['stealth', 'the 68th-floor deck of THÁP PHƯƠNG NAM: social cover only (shipper), no guards, the deck staff and moon-watchers are innocent (no takedown prompt; c11-m2)'],
    'san-do': ['stealth', 'the TÀI CHÍNH roof pad: stair housing, AC units, fuel cart, the parked or hovering helicopter; rotor wash pushes and masks noise ×0.3 within 20 m (c11-m3)'],
  },
  outfits: {
    'tin-ao-tu': ['core', "Tín in Ông Tư's faded dark jacket (story outfit from chapter 7, -10% visibility; chapters 7–10 request it too; c11-m1)"],
    'tin-huyen-thoai': ['core', "the 'Áo {@app} huyền thoại' outfit unlocked at the end: the orange windbreaker faded and patched, Ông Tư's whistle on its cord (c11-m4)"],
  },
  abilities: {
    chapterSelect: ['ui', 'chapter select in the story menu once the campaign is over (c11-m4)'],
    luatOngTu: ['ui', "the 'Luật của Ông Tư' badge on the LƯƠNG TÂM page: the campaign ended with a clean record (tier 'clean': no kill, no innocent hurt) (c11-m4)"],
  },
  carry: { 'order-banh-trung-thu': ['core', 'delivery: twenty boxes of mooncakes in a tall stack (no running; c11-m2)'] },
  props: {
    'hanging-truck': ['world', "the reefer truck through the BẠCH ĐẰNG railing, cab over the water, box on the promenade, rear doors padlocked; variant 'tilt-0'…'tilt-3' as it slides (c11-m1)"],
    'broken-railing': ['world', 'the torn section of the promenade railing at (219.3, -134.6) (c11-m1)'],
  },
  acts: {
    'watch-moon': ['director', 'a moon-watcher at the deck rail, phone raised at the full moon (c11-m2)'],
    'load-crates': ['director', 'a bodyguard carrying a sealed crate to the helicopter door and back (c11-m3)'],
    'hold-hand': ['director', "stands holding a child's hand by the stair housing: no pulling, no strike (c11-m3)"],
    'hide-crouch': ['director', 'a child crouched behind cover, hands over her ears (dignified; c11-m3 Su)'],
  },
  clips: {
    leap: ['director', "Tín's leap from the bike seat to the truck's rear ladder (slow motion; c11-m1)"],
    'climb-ladder': ['director', 'climbs a ladder or along a box body hand over hand (c11-m1)'],
    'smash-window': ['director', 'an elbow through a side window (glass only; c11-m1)'],
    'draw-pistol': ['director', 'draws a pistol from the waistband one-handed (c11-m1 Lực)'],
    'aim-pistol': ['director', 'holds a small pistol levelled, never fired on screen (c11-m1 Vân, CS12 Phượng)'],
    salute: ['director', 'a police salute (CS12 colonel, the epilogue Vân)'],
    'raise-glass': ['director', 'raises a glass of beer toward a TV (the epilogue Tám Hổ)'],
    'tear-notice': ['director', 'tears a paper notice in two, then again, and lets it go (the epilogue Bà Năm)'],
    'paint-sign': ['director', 'paints the last letters of a shop sign with one arm, the other in a sling (the epilogue Quang)'],
    'buckle-helmet': ['director', 'puts on a half helmet and buckles the strap (the final shot)'],
  },
  pairClips: {
    'catch-wrist': ['director', 'one dives flat and catches the other\'s wrist over an edge; both hold (CS12, then the QTE)'],
    'cuff-wrists': ['director', "cuffs the other's wrists behind the back, no force shown (chapter 10 requests it for Cường; c11-m1 Vân and Lực)"],
  },
  sceneProps: {
    pistol: ['director', 'a small handgun (prop only, never fired on screen)'], 'bolt-cutters': ['director', 'long-handled bolt cutters'],
    'so-goc-case': ['director', 'a hard black case holding the master ledger ("sổ gốc")'], 'jade-bangle': ['director', "Phượng's jade bangle"],
    parachute: ['director', 'the deck-jump canopy and harness, opening'], helmet: ['director', "Tín's cream half helmet with the lotus sticker"],
    whistle: ['director', "Ông Tư's old police whistle on its cord"], mooncake: ['director', 'a homemade lotus-seed mooncake in waxed paper'],
    'tv-news': ['director', 'a wall TV showing the evening news, headline lines and a ticker'], 'beer-glass': ['director', 'a glass of draught beer'],
    portrait: ['director', 'a framed portrait photo with a caption line'], newspaper: ['director', 'a folded newspaper, its front-page headline readable'],
    'golden-lotus-pin': ['director', 'a small golden-lotus lapel pin'],
  },
  rideModels: {
    'reefer-truck': ['director', "the reefer truck as a cutscene ride (CS c11m1-lan-can)"],
    'heli:sen-vang': ['director', 'the black-and-gold helicopter as a cutscene ride'],
  },
  fx: {
    sparks: ['director', 'sparks from steel dragged on asphalt or a railing'], 'rotor-wash': ['director', 'papers, dust and lantern light whirled out from under a rotor'],
    searchlight: ['director', 'a helicopter searchlight cone (fake cone, no THREE light)'], splash: ['director', 'a heavy splash on the river'],
    'river-lanterns': ['director', 'floating paper lotus lanterns (đèn hoa đăng) drifting on the river (festival-blackout-heli.md §1.4)'],
  },
  sfx: {
    rotor: ['audio', 'helicopter rotor roar'], 'wind-howl': ['audio', 'high wind over a rooftop'], 'metal-groan': ['audio', 'a truck body groaning as it shifts'],
    'railing-crash': ['audio', 'a truck tearing through a steel railing'], splash: ['audio', 'a heavy splash'], 'glass-smash': ['audio', 'a side window shattering'],
  },
  scenePoses: { 'hands-up': ['director', 'both hands raised in surrender (chapter 10 requests it too; CS12 the pilot)'] },
  ambience: {
    'festival-street': ['audio', 'Rằm night in the street: chatter, children, distant lion-dance drums (chapter 10 requests it too)'],
    'river-evening': ['audio', 'the river at sunset: water on the pier piles, a far boat horn'],
  },
};

export const chapter = defineChapter({
  chapter: 11,
  missions: [c11m1, c11m2, c11m3, c11m4],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, places: PLACES,
  text: TEXT,
});
