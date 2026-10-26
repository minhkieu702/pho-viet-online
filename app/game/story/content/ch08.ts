import {
  defineChapter, defineMission, type Act, type Behaviour, type BoardCard, type CastDef, type Cond, type EvidenceDef, type FailDef, type InterrogationDef,
  type JournalDef, type Line, type PlaceDef, type QuestionDef, type WorldPolicy,
} from '../types.ts';
import type { ContractEntry, ContractKind } from '../contract.ts';
import { TEXT } from '../text/vi/ch08.ts';

/**
 * Chương 8 · NGƯỜI ĐÀN BÀ TỪ THIỆN (story-final.md ch.8 with story-decisions.md 13, 14, 18 and the sites of
 * MISSION_SITES c8-m1…c8-m4). Mùng 11–13 tháng Tám, "Còn 3 ngày tới Rằm".
 * c8-m1 the night of mùng 11: a stake-out of VIỆC LÀM ÁNH DƯƠNG, Diễm tailed on foot and then on her scooter to CHUNG
 * CƯ PHÚ MỸ, the ĐơnƠi jacket past the lobby guard ("căn 1204", read off the mailboxes), the door on its chain, the
 * present-evidence interrogation (two lies broken with Ánh Dương's ledger and Mai's school bag, one truth met with Ông
 * Tư's 2014 file), her confession and the two ledgers told apart, the doorbell, three Rắn Đen with silencers, the fire
 * stairs as three landing fights with fade "stair skips" (Diễm hides on B; Tín may loot a pistol, and LƯƠNG TÂM
 * records what he does with it), her twisted ankle, the supported walk to Vân's car and Lộc at the hospital door.
 * c8-m2 noon of mùng 12: Lộc's call, Cô Ba's bag of oranges, the visitor cover on the 3rd-floor ward, the impostor
 * orderlies told by their tells (hold T, the nurses'-station monitor, a confirming photo each), quiet takedowns; a
 * frightened patient, a real orderly knocked down or a detection sends the third man to Diễm's door early; the 2 s
 * tackle; "Ai báo tin?" (Lực); Diễm gives up the gala. c8-m3 the gala: the waiter's vest from the catering van, the
 * tray through the hall ("Mời nước"), past the catwalk guard under the drum (a heritage site: no takedowns in the
 * theatre), the eavesdrop on Phượng and Bảo, CS08 in
 * three parts around the choice [Cầm phong bì] / [Đẩy phong bì lại] / [Im lặng] (a later scene reads it, the plot does
 * not), Mai's hairclip, the calm walk out. Chained into c8-m4 at 02:00: the security guard's phở order snatched on the
 * app, the bluff at the desk, the stairwell, floor 20 under sweeping cameras, the fuse box's 30 s blackout, the safe
 * (Ngân's birthday: 26-09-17), the black ledger and the copy USB, under the desk holding breath while Bảo phones Lực,
 * the lockdown, the window-cleaning gondola, the ride home and the morning TV: TRUY NÃ ĐẶC BIỆT.
 * Non-lethal by design: c8-m2–m4 fail on a death (lethal 'fail'; a chokehold slip never kills, flags.ts); c8-m1's
 * stairwell is the chapter's one firefight (lethal 'allow', stealth rules lethal 'warn'): a kill is recorded and Vân
 * answers it in the car.
 *
 * Places are story/sites.ts ids, the chapter PLACES below, or anchors of the spaces 'phu-my', 'hospital-ward',
 * 'nha-hat-gala', 'bank-floor20' and 'co-ba-ground' (ANCHORS; 'hospital-ward' also uses chapter 4's anchors). Texts are
 * '@keys' of text/vi/ch08.ts; brands ({@app}, {@code}, {@ring}, {@ringUpper}, {@bank}) come from text/vi/common.ts.
 * Register in content/index.ts LOADERS: `8: () => import('./ch08.ts'),`.
 * Cast from earlier chapters: tin, coba (ch.1), cuong (ch.2), van, luc (ch.3), diem (ch.4), and two this chapter
 * assumes from the chapters written beside it: 'phuong' (Lý Kim Phượng, ch.6 CS05) and 'loc' (Thiếu tá Lộc, ch.7).
 * Evidence from earlier chapters: ev-so-trang-1..3, ev-so-mai (ch.4), ev-cap-mai, ev-sen-than-spa, ev-clip-luc,
 * ev-so-do-b2 (ch.5), ev-luc-hoi (ch.3); and from ch.6 (c6-m3, the iron box) 'ev-ho-so-diem' (the 2014 missing-person
 * file) and 'ev-nguoi-giu-so-chi' (the note on Bảo). Outfit 'tin-ao-tu' is Ông Tư's jacket, which ch.7 gives.
 *
 * Engine ids used here are in story/contract.ts, its SCENE_REQUESTS and the requests of chapters 4–5, except
 * ENGINE_NEEDS below (ids this chapter adds, each with its lane).
 */

const H = Math.PI / 2, PI = Math.PI;
const NO_HUB: WorldPolicy['activities'] = { gunStore: false, bank: false, deck: false, boatRental: false, sideJobs: false, orders: false };
/** Story outfits, one line each so a rename by chapter 7 (Ông Tư's jacket) is one edit. */
const OUTFIT = { shipper: 'tin-shipper', jacket: 'tin-ao-tu', waiter: 'tin-waiter' } as const;
/** Everything Tín can do by chapter 8 (replays). */
const ABILITIES = ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill', 'observe', 'lean', 'throw', 'takedown', 'drag', 'phoneSilent', 'luongTam', 'faceCover', 'clipCam', 'whistle'];
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
const photoed = (id: string): Cond => ({ k: 'on', ev: 'photo', id });
const signal = (id: string, result?: string): Cond => (result === undefined ? { k: 'on', ev: 'signal', id } : { k: 'on', ev: 'signal', id, where: { result } });
const detected: Cond = { k: 'on', ev: 'detected' };
/** Teleport unless the player is already there on that surface `level` (null: the ground); see content/ch01.ts. */
const put = (at: string, vehicle?: string, r = 8, level: string | null = null): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });
/** A checkpoint inside an off-map space: enter it first when a skip lands here from outside (a restore re-enters it already). */
const inSpace = (space: string, link: string): Act => ({ k: 'if', c: { k: 'space', id: space }, then: [], else: [{ k: 'space', enter: space, link }] });
/** Seen by a guard of the arena: back to the last checkpoint; after three tries the card offers 'Bỏ qua đoạn này'. */
const caught = (reason: string, skipTo?: string): FailDef => ({ when: detected, reason: `@${reason}`, allowSkipAfter: 3, ...(skipTo ? { skipTo } : {}) });
/** A wrong answer to a desk guard's question: dip and ask again (no fail card). */
const wrongAnswer = (choice: string, right: string, reason: string): FailDef =>
  ({ when: { k: 'all', of: [{ k: 'on', ev: 'choice', id: choice }, { k: 'not', c: flag(`choice:${choice}`, right) }] }, reason: `@${reason}`, soft: true });

// ---- c8-m1 · Người tuyển dụng sa lưới -----------------------------------------------------------------------------

const PM = (a: string) => `phu-my/${a}`;
/** The lobby: shipper cover, the desk guard is an innocent watcher (no takedowns). */
const LOBBY: Act = {
  k: 'stealth', arena: 'phu-my', variant: 'lobby', cover: 'shipper',
  rules: { takedowns: false, guns: 'none', lethal: 'fail', failOn: [], showCones: 'always', countConscience: false, respawn: 'checkpoint' },
};
/** The fire stairs: the chapter's one firefight. Takedowns, a looted pistol if he wants one; a kill is booked, not failed. */
const STAIRS: Act = {
  k: 'stealth', arena: 'phu-my', variant: 'stairs', cover: null,
  rules: { takedowns: true, guns: 'loot', lethal: 'warn', failOn: [], showCones: 'observe', countConscience: true, respawn: 'checkpoint', policeSuppressed: true },
};
/** Diễm as the escort runtime's one VIP follower: B "Núp!" sends her into the landing's dark corner, B again brings her. */
const diemAt = (at: string): Act[] => [{ k: 'despawn', id: 'diem' }, { k: 'spawn', id: 'diem', cast: 'diem', at, team: 'ally', behaviour: { k: 'escort', leader: 'player' } }];
const hitman = (id: string, at: string, behaviour: Behaviour): Act =>
  ({ k: 'spawn', id, cast: 'sat-thu', template: 'ran-den', at, team: 'hostile', weapon: 'pistol', flashlight: true, tags: ['phu-my'], behaviour });
const killed: Cond = { k: 'stat', name: 'kills', op: '>', value: 0 };
/** A stair landing: a checkpoint behind the fade, one hitman, and Diễm at Tín's side to reach the flight down. */
const landing = (n: 9 | 5 | 1, man: Act, bk: string, down: string, extra: Act[] = []) => ({
  objective: `@c8m1.obj.tang${n}`, marker: { at: PM(down), label: '@c8m1.mk.xuong', style: 'go' as const }, hud: { light: true, noise: true },
  checkpoint: { label: `@c8m1.cp.tang${n}`, setup: [
    inSpace('phu-my', 'lobby'), put(PM(`stairs${n}`), undefined, 3), { k: 'player', outfit: OUTFIT.jacket, cover: null } as Act, STAIRS, ...diemAt(PM(`stairs${n}`)), man] },
  enter: [{ k: 'title', kind: 'place', text: `@c8m1.tang${n}` } as Act, { k: 'fade', to: 'clear', ms: 600 } as Act, ...extra, bark(bk, `c8m1.bark.st${n === 9 ? 1 : n === 5 ? 2 : 3}`, true)],
  done: { k: 'all', of: [reach(PM(down), 1.5), { k: 'near', a: 'diem', b: 'player', r: 4 }] } as Cond,
});

const c8m1 = defineMission({
  id: 'c8-m1', meta: { hours: [20, 24], giver: 'van' }, lethal: 'allow',
  start: { at: 'ch8.rinh', yaw: 0, hour: 21, weather: 'clear', lunar: 11, outfit: OUTFIT.jacket },
  world: { traffic: 'night', crowd: 'night', police: 'story', gangs: 'calm', clock: { hour: 21, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [{ k: 'vehicle', id: 'dream', model: 'dream', at: 'ch8.dream-cho-cu', yaw: H, state: 'park' }],
  steps: [
    {
      id: 'rinh', minutes: 0.4, objective: '@c8m1.obj.cho', marker: { at: 'anh-duong', label: '@c8m1.mk.anhDuong', style: 'subtle' },
      enter: [
        { k: 'title', kind: 'time', text: '@c8m1.title', sub: '@c8m1.titleSub' },
        { k: 'sms', from: 'van', text: '@c8m1.sms.van', burner: true },
        aside('c8m1-ho-so', [think('c8m1.think.hoSo1'), think('c8m1.think.hoSo2')]),
      ],
      done: after(8),
    },
    {
      id: 'bam-bo', minutes: 0.6, objective: '@c8m1.obj.bamBo',
      checkpoint: { label: '@c8m1.cp.bamBo', setup: [
        put('ch8.rinh', undefined, 6),
        { k: 'spawn', id: 'diem', cast: 'diem', at: 'anh-duong', team: 'neutral', behaviour: { k: 'goto', at: 'ch8.xe-diem' } },
        { k: 'tail', target: 'diem', band: [8, 30], lose: { far: 40, seconds: 8 }, onFoot: true, knownFace: true }] },
      meters: [{ id: 'tail:diem', label: '@c8m1.meter.bo', kind: 'band' }],
      enter: [hint('c8m1.hint.bamBo', 8000)],
      watchers: [{ when: after(5), do: [aside('c8m1-so', [think('c8m1.think.so')])] }],
      done: { k: 'on', ev: 'arrived', id: 'diem' },
      fail: [
        { when: { k: 'on', ev: 'spotted', id: 'diem' }, reason: '@c8m1.fail.nhanRa', allowSkipAfter: 3 },
        { when: { k: 'on', ev: 'lost', id: 'diem' }, reason: '@c8m1.fail.matDau', allowSkipAfter: 3 },
      ],
      exit: [{ k: 'stop', id: 'diem' }],
    },
    {
      id: 'len-xe', minutes: 0.3, objective: '@c8m1.obj.lenXe', marker: { at: 'ch8.dream-cho-cu', label: '@c8m1.mk.xe', style: 'go' },
      enter: [{ k: 'despawn', id: 'diem' }, { k: 'vehicle', id: 'xe-diem', model: 'scooter', at: 'ch8.xe-diem', yaw: H, driver: 'diem', state: 'stop' }, aside('c8m1-len-xe', [think('c8m1.think.lenXe')])],
      done: { k: 'reach', at: 'ch8.dream-cho-cu', r: 3, mode: 'bike' },
    },
    {
      id: 'bam-xe', minutes: 1.2, objective: '@c8m1.obj.bamXe',
      checkpoint: { label: '@c8m1.cp.bamXe', setup: [
        put('ch8.dream-cho-cu', 'dream', 3), { k: 'despawn', id: 'diem' },
        { k: 'vehicle', id: 'xe-diem', model: 'scooter', at: 'ch8.xe-diem', yaw: H, driver: 'diem', route: ['phu-my.ramp'], cruise: 9, obeyLights: true, state: 'drive' },
        { k: 'tail', target: 'xe-diem', band: [15, 50], lose: { far: 80, seconds: 10 }, mirror: true, headlight: true }] },
      meters: [{ id: 'tail:xe-diem', label: '@c8m1.meter.xe', kind: 'band' }],
      enter: [hint('c8m1.hint.bamXe', 8000)],
      watchers: [{ when: after(25), do: [aside('c8m1-quan-1', [think('c8m1.think.quan1')])] }],
      done: { k: 'on', ev: 'arrived', id: 'xe-diem' },
      fail: [
        { when: { k: 'on', ev: 'lost', id: 'xe-diem' }, reason: '@c8m1.fail.matXe', allowSkipAfter: 3 },
        { when: { k: 'on', ev: 'spotted', id: 'xe-diem' }, reason: '@c8m1.fail.loXe', allowSkipAfter: 3 },
      ],
      // she rides down the car-park ramp; the shutter hides the scooter (story-decisions 18)
      exit: [{ k: 'stop', id: 'xe-diem' }, { k: 'vehicle', id: 'xe-diem', state: 'park' }],
    },
    {
      id: 'dau-xe', minutes: 0.4, objective: '@c8m1.obj.dauXe', marker: { at: 'ch8.dream-phu-my', label: '@c8m1.mk.phuMy', style: 'go' },
      enter: [{ k: 'call', id: 'c8m1-van', from: 'van', ring: false, burner: true, lines: [phone('tin', 'c8m1.t1'), phone('van', 'c8m1.v1'), phone('van', 'c8m1.v2'), phone('tin', 'c8m1.t2')] }],
      done: { k: 'all', of: [reach('ch8.dream-phu-my', 4), { k: 'mode', is: 'foot' }] },
      exit: [{ k: 'player', outfit: OUTFIT.shipper }, { k: 'toast', text: '@c8m1.toast.ao' }, aside('c8m1-ao', [think('c8m1.think.ao')])],
    },
    {
      id: 'vao-sanh', minutes: 0.2, objective: '@c8m1.obj.vao', marker: { at: 'phu-my', style: 'go' },
      interact: [{ id: 'vao-sanh', at: 'phu-my', r: 2.2, prompt: '@c8m1.int.vao', kind: 'enter', when: 'foot' }],
      done: used('vao-sanh'),
      exit: [{ k: 'space', enter: 'phu-my', link: 'lobby' }],
    },
    {
      id: 'hop-thu', minutes: 0.3, objective: '@c8m1.obj.hopThu', marker: { at: PM('mailboxes'), style: 'subtle' }, hud: { cover: true },
      checkpoint: { label: '@c8m1.cp.sanh', setup: [
        inSpace('phu-my', 'lobby'), put(PM('lobby'), undefined, 4), { k: 'player', outfit: OUTFIT.shipper, cover: 'shipper' }, LOBBY,
        { k: 'spawn', id: 'bao-ve-cc', cast: 'bao-ve-cc', template: 'desk-guard', at: PM('guardDesk'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'guard', post: PM('guardDesk'), sweep: 60 } }] },
      interact: [{ id: 'xem-hop-thu', at: PM('mailboxes'), r: 1.5, prompt: '@c8m1.int.hopThu', kind: 'examine', when: 'foot' }],
      done: used('xem-hop-thu'),
      exit: [aside('c8m1-hop-thu', [think('c8m1.think.hopThu')])],
    },
    {
      id: 'bao-ve', minutes: 0.2, objective: '@c8m1.obj.baoVe', marker: { at: PM('guardDesk'), style: 'talk' }, hud: { cover: true },
      interact: [{ id: 'noi-bao-ve', at: PM('guardDesk'), r: 2, prompt: '@c8m1.int.baoVe', kind: 'talk', when: 'foot' }],
      done: used('noi-bao-ve'),
    },
    {
      // the desk guard's question: a wrong answer gets Tín sent off and asked again (no fail card)
      id: 'hoi-phong', minutes: 0.2,
      enter: [
        talk('c8m1-bv', [say('bao-ve-cc', 'c8m1.bv1')]),
        { k: 'choice', id: 'baoVeCc', prompt: '@c8m1.q.bv', style: 'bluff', options: [
          { id: 'p1204', text: '@c8m1.opt.bv.1204' },
          { id: 'quen', text: '@c8m1.opt.bv.quen', then: [talk('c8m1-bv-quen', [say('bao-ve-cc', 'c8m1.bv.quen')])] },
          { id: 'goi', text: '@c8m1.opt.bv.goi', then: [talk('c8m1-bv-goi', [say('bao-ve-cc', 'c8m1.bv.goi')])] }] },
      ],
      done: flag('choice:baoVeCc', 'p1204'),
      fail: [wrongAnswer('baoVeCc', 'p1204', 'c8m1.fail.bv')],
      exit: [
        talk('c8m1-bv-ok', [say('bao-ve-cc', 'c8m1.bv.ok')]),
        { k: 'fade', to: 'black', ms: 700 }, { k: 'teleport', at: PM('corridor12') },
        { k: 'title', kind: 'place', text: '@c8m1.tang12' }, { k: 'fade', to: 'clear', ms: 700 },
      ],
    },
    {
      id: 'tang-12', minutes: 0.3, objective: '@c8m1.obj.cua', marker: { at: PM('door1204'), style: 'go' },
      interact: [{ id: 'go-cua', at: PM('door1204'), r: 1.6, prompt: '@c8m1.int.go', kind: 'talk', when: 'foot' }],
      done: used('go-cua'),
      exit: [{ k: 'cutscene', id: 'c8m1-cua' }, { k: 'stealth', cover: null }],
    },
    {
      id: 'can-ho', minutes: 0.4, objective: '@c8m1.obj.canHo', marker: { at: PM('suitcase'), style: 'talk' },
      checkpoint: { label: '@c8m1.cp.canHo', setup: [
        inSpace('phu-my', 'lobby'), put(PM('apartment'), undefined, 4), { k: 'player', outfit: OUTFIT.shipper, cover: null },
        { k: 'spawn', id: 'diem', cast: 'diem', at: PM('suitcase'), team: 'neutral', behaviour: { k: 'act', name: 'pack-suitcase' } }] },
      interact: [{ id: 'noi-diem', at: PM('suitcase'), r: 2, prompt: '@c8m1.int.noi', kind: 'talk', when: 'foot' }],
      enter: [
        { k: 'clue', id: 'khung-anh', at: PM('shelf'), r: 1.5, evidence: 'ev-anh-be-su', examine: 'object:photo-frame', scope: 'step' },
        aside('c8m1-vali', [think('c8m1.think.vali')]),
      ],
      optional: [{ id: 'khung-anh', text: '@c8m1.opt.khungAnh', when: owned('ev-anh-be-su'), reward: [aside('c8m1-be-su', [think('c8m1.think.khungAnh')])] }],
      done: used('noi-diem'),
    },
    {
      // two lies, one truth (interrogation.ts): a wrong card costs seconds of silence, never a fail
      id: 'chat-van', minutes: 1.1,
      enter: [
        // the 2014 file comes from chapter 6's iron box (c6-m3); Tín carries the box's papers, so a save without the card still has it
        { k: 'if', c: { k: 'not', c: owned('ev-ho-so-diem') }, then: [{ k: 'evidence', id: 'ev-ho-so-diem' }, { k: 'toast', text: '@c8m1.toast.hoSo' }] },
        hint('c8m1.hint.chatVan', 9000),
        { k: 'interrogate', id: 'diem-loi-khai' },
        { k: 'cutscene', id: 'c8m1-loi-khai' },
        { k: 'evidence', id: 'ev-loi-khai-diem' }, { k: 'journal', id: 'j-diem-2014' },
        { k: 'cutscene', id: 'c8m1-chuong-cua' },
        { k: 'journal', id: 'j-hai-cuon-so' },
        { k: 'flag', name: 'knowsSoChi' }, { k: 'flag', name: 'knowsSoGoc' }, { k: 'flag', name: 'knowsSu' },
      ],
    },
    {
      id: 'cua-sau', minutes: 0.3, objective: '@c8m1.obj.cuaSau', marker: { at: PM('serviceDoor'), label: '@c8m1.mk.cuaSau', style: 'go' },
      interact: [{ id: 'cua-thoat-hiem', at: PM('serviceDoor'), r: 1.5, prompt: '@c8m1.int.cuaSau', kind: 'enter', when: 'foot' }],
      enter: [{ k: 'behave', id: 'diem', b: { k: 'escort', leader: 'player' } }, hint('c8m1.hint.nup', 9000)],
      done: used('cua-thoat-hiem'),
      exit: [{ k: 'fade', to: 'black', ms: 600 }, { k: 'player', outfit: OUTFIT.jacket }, { k: 'toast', text: '@c8m1.toast.coiAo' }],
    },
    {
      id: 'tang-9', minutes: 0.6,
      ...landing(9, hitman('sat-thu-1', PM('stairs9Up'), { k: 'patrol', route: [PM('stairs9Up'), PM('stairs9'), PM('stairs9Up')], waits: [3, 2, 3] }), 'sat-thu-1', 'stairs9Down',
        [hint('c8m1.hint.luongTam', 9000)]),
      exit: [{ k: 'fade', to: 'black', ms: 600 }],
    },
    {
      id: 'tang-5', minutes: 0.6,
      ...landing(5, hitman('sat-thu-2', PM('stairs5Down'), { k: 'patrol', route: [PM('stairs5Down'), PM('stairs5'), PM('stairs5Down')], waits: [2, 3, 2] }), 'sat-thu-2', 'stairs5Down'),
      exit: [{ k: 'fade', to: 'black', ms: 600 }],
    },
    {
      id: 'tang-1', minutes: 0.6,
      ...landing(1, hitman('sat-thu-3', PM('carParkDoor'), { k: 'guard', post: PM('carParkDoor'), sweep: 40 }), 'sat-thu-3', 'carParkDoor'),
      // the last flight: she twists an ankle (scripted, escort-boss-qte.md §1.9)
      exit: [{ k: 'behave', id: 'diem', b: { k: 'act', name: 'sit-ground-rub-knee' } }, bark('diem', 'c8m1.bark.diemTrat'), aside('c8m1-trat', [think('c8m1.think.trat')])],
    },
    {
      id: 'diu', minutes: 0.5, objective: '@c8m1.obj.diu', marker: { at: PM('carPark'), label: '@c8m1.mk.xeVan', style: 'go' },
      interact: [{ id: 'diu-diem', at: PM('carParkDoor'), r: 2, hold: 1, prompt: '@c8m1.int.diu', kind: 'use', when: 'foot' }],
      enter: [
        { k: 'vehicle', id: 'xe-van', model: 'vios-van', at: PM('carPark'), yaw: H, state: 'park' },
        { k: 'spawn', id: 'van', cast: 'van', at: PM('carPark'), team: 'ally', behaviour: { k: 'idle' } },
      ],
      // the supported walk (escort-boss-qte.md §1.10): she leans on his shoulder, 1.3 m/s, no run
      watchers: [{ when: used('diu-diem'), do: [{ k: 'player', pose: 'support', lock: ['run'] }, { k: 'behave', id: 'diem', b: { k: 'follow', target: 'player', dist: 0.45 } }] }],
      done: { k: 'all', of: [used('diu-diem'), reach(PM('carPark'), 2.5)] },
      exit: [{ k: 'player', pose: null, lock: null }],
    },
    {
      id: 'xe-chi-van', minutes: 0.5,
      enter: [
        talk('c8m1-xe', [
          say('van', 'c8m1.v3'),
          say('van', 'c8m1.v4.chet', { if: killed }), say('van', 'c8m1.v5.chet', { if: killed }), say('van', 'c8m1.v4.sach', { if: { k: 'not', c: killed } }),
          say('diem', 'c8m1.diem.xe'), say('van', 'c8m1.v6')]),
        { k: 'fade', to: 'black', ms: 900 },
        { k: 'space', leave: 'benh-vien' }, { k: 'stealth', arena: null }, { k: 'despawn', id: 'diem' }, { k: 'despawn', id: 'van' },
        { k: 'time', hour: 23.67 },
        { k: 'spawn', id: 'loc', cast: 'loc', at: 'benh-vien', team: 'ally', behaviour: { k: 'act', name: 'cross-arms' } },
        { k: 'title', kind: 'time', text: '@c8m1.title2', sub: '@c8m1.title2Sub' },
        { k: 'fade', to: 'clear', ms: 900 },
        talk('c8m1-loc', [say('loc', 'c8m1.loc1'), say('loc', 'c8m1.loc2')]),
        aside('c8m1-cuoi', [think('c8m1.think.cuoi')]),
        { k: 'flag', name: 'diemSafe' },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'savedDiem' }],
  medals: { par: 540, ghost: true, clues: ['khung-anh'] },
  replay: { abilities: ABILITIES, evidence: ['ev-so-trang-1', 'ev-so-trang-2', 'ev-so-mai', 'ev-cap-mai', 'ev-ho-so-diem'] },
});

// ---- c8-m2 · Giờ thăm bệnh ---------------------------------------------------------------------------------------

const HW = (a: string) => `hospital-ward/${a}`;
/** The ward: visitor cover (wards public, the linen room and the stairwell staff-only); no guns at all. */
const WARD: Act = {
  k: 'stealth', arena: 'benh-vien', variant: 'day', cover: 'visitor',
  rules: { takedowns: true, guns: 'none', lethal: 'fail', failOn: [], showCones: 'observe', countConscience: true, respawn: 'checkpoint', policeSuppressed: true },
};
/** Everyone who belongs on the ward (tagged innocent: knocking one down is booked against LƯƠNG TÂM) and Diễm in bed 3. */
const WARD_PEOPLE: Act[] = [
  { k: 'spawn', id: 'y-ta', cast: 'y-ta', template: 'nurse', at: HW('nurseStation'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'desk-head-down' } },
  { k: 'spawn', id: 'ho-ly-1', cast: 'ho-ly', template: 'orderly', at: HW('bay1'), team: 'neutral', tags: ['innocent'],
    behaviour: { k: 'patrol', route: [HW('bay1'), HW('corridor'), HW('bay2')], waits: [6, 2, 5] } },
  { k: 'spawn', id: 'ho-ly-2', cast: 'ho-ly', template: 'orderly', at: HW('linen'), team: 'neutral', tags: ['innocent'],
    behaviour: { k: 'patrol', route: [HW('linen'), HW('nurseStation'), HW('stairLanding'), HW('nurseStation')], waits: [5, 3, 4, 2] } },
  { k: 'spawn', id: 'benh-nhan-1', cast: 'benh-nhan', template: 'patient', at: HW('bay1'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'sleep' } },
  { k: 'spawn', id: 'benh-nhan-2', cast: 'benh-nhan', template: 'patient', at: HW('bay2'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'sit-stool-phone' } },
  { k: 'spawn', id: 'diem', cast: 'diem', at: HW('bay3'), team: 'ally', behaviour: { k: 'act', name: 'sleep' } },
];
/** Two of the three impostors (the template draws their tells: leather shoes and an empty gurney; no badge and the snake tattoo). */
const IMPOSTORS: Act[] = [
  { k: 'spawn', id: 'gia-1', cast: 'gia-ho-ly', template: 'fake-orderly', at: HW('corridorEnd'), team: 'hostile', tags: ['impostor', 'gurney'],
    behaviour: { k: 'patrol', route: [HW('corridorEnd'), HW('corridor'), HW('curtain'), HW('corridor')], waits: [3, 2, 4, 2] } },
  { k: 'spawn', id: 'gia-2', cast: 'gia-ho-ly', template: 'fake-orderly', at: HW('linen'), team: 'hostile', tags: ['impostor', 'tattoo'], behaviour: { k: 'guard', post: HW('linen'), sweep: 40 } },
];
/** The nurses'-station monitor: four live feeds; an impostor framed for a second is tagged (phone-detective-ui.md §6.6). */
const MONITOR: Act = { k: 'do', op: 'monitor', wait: true, args: {
  id: 'quay-y-ta', title: '@c8m2.mon.title', tag: true,
  feeds: [{ cam: '@c8m2.mon.cam1', at: HW('corridor') }, { cam: '@c8m2.mon.cam2', at: HW('linen') }, { cam: '@c8m2.mon.cam3', at: HW('stairLanding') }, { cam: '@c8m2.mon.cam4', at: HW('bay3Door') }] } };
/** Patients panic, a real orderly goes down, or an impostor sees Tín: the third man moves on Diễm at once. */
const wentWrong: Cond = { k: 'any', of: [
  { k: 'meter', id: 'panic:benh-vien', op: '>=', value: 1 }, { k: 'on', ev: 'knockout', tag: 'innocent' }, detected] };
const early: Cond = { k: 'var', name: 'som', op: '==', value: true };

const c8m2 = defineMission({
  id: 'c8-m2', meta: { hours: [11, 14], giver: 'loc' }, lethal: 'fail',
  start: { at: 'cafe-co-ba.pickup', yaw: 0, vehicle: 'dream', hour: 12, weather: 'cloudy', lunar: 12, outfit: OUTFIT.jacket },
  world: { traffic: 'normal', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 12, freeze: true }, weather: { set: 'cloudy', lock: true }, activities: NO_HUB },
  // "Bệnh viện — không nổ súng": a shot anywhere in the mission fails it
  fail: [{ when: { k: 'on', ev: 'gunfire' }, reason: '@c8m2.fail.sung' }],
  steps: [
    {
      id: 'trua', minutes: 0.3,
      enter: [
        { k: 'title', kind: 'time', text: '@c8m2.title', sub: '@c8m2.titleSub' },
        { k: 'call', id: 'c8m2-loc', from: 'loc', ring: true, burner: true, lines: [
          phone('loc', 'c8m2.l1'), phone('loc', 'c8m2.l2'), phone('loc', 'c8m2.l3'), phone('loc', 'c8m2.l4'), phone('tin', 'c8m2.t1'), phone('loc', 'c8m2.l5')] },
      ],
    },
    {
      id: 'bich-cam', minutes: 0.3, objective: '@c8m2.obj.coba', marker: { at: 'cafe-co-ba', style: 'talk' },
      interact: [{ id: 'gap-co-ba', at: 'cafe-co-ba', r: 2.5, prompt: '@c8m2.int.coba', kind: 'talk', when: 'foot' }],
      enter: [{ k: 'spawn', id: 'coba', cast: 'coba', at: 'cafe-co-ba', team: 'ally', behaviour: { k: 'act', name: 'kettle-pour' } }],
      done: used('gap-co-ba'),
      exit: [talk('c8m2-coba', [say('coba', 'c8m2.coba1'), say('tin', 'c8m2.tin1'), say('coba', 'c8m2.coba2')]), { k: 'player', carry: 'bich-cam' }, { k: 'despawn', id: 'coba' }],
    },
    {
      id: 'toi-bv', minutes: 0.5, objective: '@c8m2.obj.toi', marker: { at: 'benh-vien', label: '@c8m2.mk.bv', style: 'go' },
      done: reach('benh-vien', 8),
    },
    {
      id: 'vao-bv', minutes: 0.2, objective: '@c8m2.obj.vao', marker: { at: 'benh-vien', style: 'go' },
      interact: [{ id: 'vao-bv', at: 'benh-vien', r: 2.2, prompt: '@c8m2.int.vao', kind: 'enter', when: 'foot' }],
      done: used('vao-bv'),
      exit: [{ k: 'space', enter: 'hospital-ward', link: 'stairs' }, { k: 'toast', text: '@c8m2.toast.voBoc' }],
    },
    {
      id: 'hanh-lang', minutes: 0.3,
      checkpoint: { label: '@c8m2.cp.hanhLang', setup: [
        inSpace('hospital-ward', 'stairs'), put(HW('corridor'), undefined, 6), { k: 'player', outfit: OUTFIT.jacket, carry: 'bich-cam', cover: 'visitor' }, WARD, ...WARD_PEOPLE, ...IMPOSTORS] },
      enter: [{ k: 'cutscene', id: 'c8m2-giay' }, aside('c8m2-giuong', [think('c8m2.think.giuong')])],
    },
    {
      id: 'tim-gia', minutes: 1.6, objective: '@c8m2.obj.tim', hud: { light: true, noise: true, cover: true },
      meters: [{ id: 'panic:benh-vien', label: '@c8m2.meter.hoang', kind: 'bar', max: 1 }, { id: 'cover:visitor', label: '@c8m2.meter.voBoc', kind: 'bar', max: 1 }],
      subs: [
        { id: 'man-hinh', text: '@c8m2.sub.manHinh', done: signal('monitor'), optional: true },
        { id: 'anh-1', text: '@c8m2.sub.anh1', done: owned('ev-gia-ho-ly-1') },
        { id: 'anh-2', text: '@c8m2.sub.anh2', done: owned('ev-gia-ho-ly-2') },
        { id: 'ha-1', text: '@c8m2.sub.ha1', done: { k: 'on', ev: 'knockout', id: 'gia-1' } },
        { id: 'ha-2', text: '@c8m2.sub.ha2', done: { k: 'on', ev: 'knockout', id: 'gia-2' } },
      ],
      interact: [{ id: 'xem-man-hinh', at: HW('nurseStation'), r: 1.6, prompt: '@c8m2.int.manHinh', kind: 'use', when: 'foot' }],
      enter: [
        { k: 'photoTarget', id: 'anh-gia-1', subject: 'gia-1', evidence: 'ev-gia-ho-ly-1', minQuality: 0.5, scope: 'step' },
        { k: 'photoTarget', id: 'anh-gia-2', subject: 'gia-2', evidence: 'ev-gia-ho-ly-2', minQuality: 0.5, scope: 'step' },
        hint('c8m2.hint.tim', 9000),
      ],
      watchers: [
        { when: used('xem-man-hinh'), do: [MONITOR, aside('c8m2-man-hinh', [think('c8m2.think.manHinh')])] },
        { when: after(10), do: [hint('c8m2.hint.anh')] },
        { when: owned('ev-gia-ho-ly-1'), do: [aside('c8m2-anh-1', [think('c8m2.think.anh1')])] },
        { when: owned('ev-gia-ho-ly-2'), do: [aside('c8m2-anh-2', [think('c8m2.think.anh2')])] },
        { when: after(20), do: [hint('c8m2.hint.ha')] },
        { when: after(35), do: [hint('c8m2.hint.ngoTay')] },
        // a watcher, not the branch: its var is set before the branch leaves, so the door's checkpoint keeps it
        { when: wentWrong, do: [{ k: 'var', name: 'som', value: true }] },
      ],
      optional: [{ id: 'man-hinh', text: '@c8m2.sub.manHinh', when: signal('monitor') }],
      branch: [{ when: wentWrong, goto: 'cua-phong', do: [
        // the branch's acts run in the next step: read the knockout from the mission's history
        { k: 'if', c: { k: 'on', ev: 'knockout', tag: 'innocent', scope: 'mission' }, then: [hint('c8m2.hint.voToi'), { k: 'toast', text: '@c8m2.toast.lo' }, { k: 'stealth', cover: null }] },
        bark('benh-nhan-2', 'c8m2.bark.la', true), aside('c8m2-som', [think('c8m2.think.som')])] }],
    },
    {
      id: 'cua-phong', minutes: 0.4, objective: '@c8m2.obj.cuaPhong', marker: { at: HW('bay3Door'), label: '@c8m2.mk.phong3', style: 'enemy' },
      checkpoint: { label: '@c8m2.cp.cuaPhong', setup: [
        inSpace('hospital-ward', 'stairs'), put(HW('corridor'), undefined, 8), { k: 'player', outfit: OUTFIT.jacket }, WARD, ...WARD_PEOPLE,
        { k: 'spawn', id: 'gia-3', cast: 'gia-ho-ly', template: 'fake-orderly', at: HW('bay3Door'), team: 'hostile', tags: ['impostor', 'syringe'], behaviour: { k: 'act', name: 'syringe-ready' } }] },
      enter: [
        // the first two: down and out of sight in the linen room and the stairwell, or, when things went wrong, gone down the stairs
        { k: 'despawn', tag: 'gurney' }, { k: 'despawn', tag: 'tattoo' },
        bark('gia-3', 'c8m2.bark.gia3'),
        { k: 'timer', id: 'cua-phong', seconds: 20, label: '@c8m2.timer', fail: '@c8m2.fail.tre', scope: 'step' },
      ],
      done: reach(HW('bay3Door'), 3),
    },
    {
      // escort-boss-qte.md §3.4 'c8m2-tackle': press E within 2 s; a miss restarts from the door
      id: 'lao-toi', minutes: 0.2,
      enter: [{ k: 'do', op: 'qte', wait: true, args: { id: 'c8m2-tackle', context: 'play', kind: 'press', keys: ['E'], label: '@c8m2.qte.lao', window: 2, anchor: { actor: 'gia-3' }, onFail: 'soft-fail' } }],
      done: signal('qte', 'ok'),
      fail: [{ when: signal('qte', 'miss'), reason: '@c8m2.fail.qte' }],
      exit: [{ k: 'behave', id: 'gia-3', b: { k: 'surrender' } }, { k: 'evidence', id: 'ev-ong-tiem' }],
    },
    {
      id: 'loc-toi', minutes: 0.8,
      enter: [
        { k: 'spawn', id: 'loc', cast: 'loc', at: HW('stairs'), team: 'ally', behaviour: { k: 'goto', at: HW('bay3Door'), run: true } },
        { k: 'spawn', id: 'cs-loc', cast: 'cs-loc', at: HW('stairs'), team: 'ally', behaviour: { k: 'goto', at: HW('bay3Door'), run: true } },
        talk('c8m2-loc', [say('loc', 'c8m2.loc1'), say('loc', 'c8m2.loc2.em', { if: { k: 'not', c: early } }), say('loc', 'c8m2.loc2.on', { if: early })]),
        { k: 'despawn', id: 'gia-3' },
        talk('c8m2-ai', [think('c8m2.think.ai')]),
        { k: 'deduce', id: 'aiBaoTin' },
        talk('c8m2-loc-3', [say('loc', 'c8m2.loc3')]),
        { k: 'cutscene', id: 'c8m2-diem' },
        { k: 'evidence', id: 'ev-da-tiec' }, { k: 'journal', id: 'j-ho-ly' },
        aside('c8m2-cuoi', [think('c8m2.think.cuoi')]),
        { k: 'flag', name: 'knowsGala' },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'savedDiemTwice' }],
  medals: { par: 360, ghost: true, clues: ['man-hinh'] },
  replay: { abilities: ABILITIES, flags: { diemTalked: true, diemSafe: true }, evidence: ['ev-loi-khai-diem', 'ev-luc-hoi', 'ev-clip-luc'] },
});

// ---- c8-m3 · Dạ tiệc ở Nhà Hát ------------------------------------------------------------------------------------

const NH = (a: string) => `nha-hat-gala/${a}`;
/**
 * NHÀ HÁT THÀNH PHỐ is a heritage building (content rules: no combat at heritage sites, as the pagoda and Nhà Rồng in
 * story-decisions.md 22): no takedowns anywhere in the theatre; the catwalk guard is slipped past or lured away.
 */
const GALA_RULES = { takedowns: false, guns: 'none', lethal: 'fail', failOn: [], showCones: 'tagged', countConscience: true, respawn: 'checkpoint', policeSuppressed: true };
/** The theatre: foyer and hall public for a waiter, kitchen staff, backstage and the catwalk restricted; the show's drum is sound cover. */
const gala = (cover?: string | null): Act => ({ k: 'stealth', arena: 'nha-hat', variant: 'gala', rules: GALA_RULES, ...(cover !== undefined ? { cover } : {}) });
const guest = (id: string, at: string): Act => ({ k: 'spawn', id, cast: 'khach-tiec', template: 'gala-guest', at, team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'mingle' } });
const HALL: Act[] = [
  { k: 'spawn', id: 'quan-ly-tiec', cast: 'quan-ly-tiec', template: 'floor-manager', at: NH('managerPost'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'guard', post: NH('managerPost'), sweep: 80 } },
  { k: 'spawn', id: 'phuong', cast: 'phuong', at: NH('stage'), team: 'neutral', behaviour: { k: 'act', name: 'speech' } },
  // the MC who introduces her from his lectern (he speaks in person in 'c8m3-dien-van')
  { k: 'spawn', id: 'mc-tiec', cast: 'mc-tiec', at: NH('mcStand'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'speech' } },
  { k: 'spawn', id: 'luc', cast: 'luc', at: NH('honorTable'), team: 'neutral', behaviour: { k: 'act', name: 'toast-glass' } },
  guest('khach-1', NH('guest1')), guest('khach-2', NH('guest2')), guest('khach-3', NH('guest3')),
];
/** Phượng leaves the stage for her box (a spawn never moves an actor already standing, so she is despawned first). */
const BOX: Act[] = [
  { k: 'despawn', id: 'phuong' },
  { k: 'spawn', id: 'phuong', cast: 'phuong', at: NH('box'), team: 'neutral', behaviour: { k: 'act', name: 'sip-tea' } },
  { k: 'spawn', id: 'bao', cast: 'bao', at: NH('box'), team: 'neutral', behaviour: { k: 'act', name: 'wipe-brow' } },
];
const tookIt = flag('choice:phongBi', 'cam');

const c8m3 = defineMission({
  id: 'c8-m3', meta: { hours: [18, 23], giver: 'diem' }, chain: 'c8-m4', lethal: 'fail',
  start: { at: 'nha-hat.serviceLane', yaw: PI, hour: 19.5, weather: 'clear', lunar: 12, outfit: OUTFIT.jacket },
  world: { traffic: 'night', crowd: 'night', police: 'story', gangs: 'calm', clock: { hour: 19.5, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  steps: [
    {
      id: 'hem-sau', minutes: 0.3,
      enter: [
        { k: 'title', kind: 'time', text: '@c8m3.title', sub: '@c8m3.titleSub' },
        { k: 'sms', from: 'van', text: '@c8m3.sms.van', burner: true },
        aside('c8m3-bang', [think('c8m3.think.bang')]),
      ],
    },
    {
      id: 'lay-ao', minutes: 0.5, objective: '@c8m3.obj.ao', marker: { at: 'nha-hat.cateringVan', label: '@c8m3.mk.xe', style: 'go' },
      checkpoint: { label: '@c8m3.cp.ao', setup: [
        put('nha-hat.serviceLane', undefined, 8), { k: 'player', outfit: OUTFIT.jacket },
        { k: 'vehicle', id: 'xe-tiec', model: 'catering-van', at: 'nha-hat.cateringVan', yaw: H, state: 'park' },
        { k: 'spawn', id: 'phu-bep', cast: 'phu-bep', at: 'nha-hat.serviceLane', team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'phone-bored' } }] },
      interact: [{ id: 'lay-ao', at: 'nha-hat.cateringVan', r: 1.8, hold: 1.5, prompt: '@c8m3.int.ao', kind: 'pick', when: 'foot' }],
      enter: [hint('c8m3.hint.ao')],
      done: used('lay-ao'),
      fail: [{ when: { k: 'all', of: [{ k: 'actor', id: 'phu-bep', sees: true }, reach('nha-hat.cateringVan', 3)] }, reason: '@c8m3.fail.thay', soft: true }],
      retry: [{ k: 'teleport', at: 'nha-hat.serviceLane' }],
      exit: [{ k: 'player', outfit: OUTFIT.waiter }, { k: 'toast', text: '@c8m3.toast.ao' }],
    },
    {
      id: 'cua-bep', minutes: 0.3, objective: '@c8m3.obj.bep', marker: { at: 'nha-hat.kitchen', label: '@c8m3.mk.bep', style: 'go' },
      interact: [{ id: 'vao-bep', at: 'nha-hat.kitchen', r: 2, prompt: '@c8m3.int.bep', kind: 'enter', when: 'foot' }],
      done: used('vao-bep'),
      exit: [{ k: 'despawn', id: 'phu-bep' }, gala('waiter'), { k: 'space', enter: 'nha-hat-gala', link: 'kitchen' }],
    },
    {
      id: 'bung-khay', minutes: 0.3, objective: '@c8m3.obj.khay', marker: { at: NH('pantry'), style: 'subtle' },
      interact: [{ id: 'lay-khay', at: NH('pantry'), r: 1.5, prompt: '@c8m3.int.khay', kind: 'pick', when: 'foot' }],
      enter: [
        { k: 'spawn', id: 'dau-bep', cast: 'dau-bep', at: NH('kitchen'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'serve' } },
        bark('dau-bep', 'c8m3.bark.bep', true),
      ],
      done: used('lay-khay'),
      exit: [{ k: 'player', carry: 'khay-ly' }],
    },
    {
      id: 'sanh-tiec', minutes: 1.3, objective: '@c8m3.obj.sanh', hud: { cover: true },
      checkpoint: { label: '@c8m3.cp.sanh', setup: [
        inSpace('nha-hat-gala', 'kitchen'), put(NH('foyer'), undefined, 4), { k: 'player', outfit: OUTFIT.waiter, carry: 'khay-ly', cover: 'waiter' }, gala('waiter'), ...HALL] },
      meters: [{ id: 'cover:waiter', label: '@c8m3.meter.voBoc', kind: 'bar', max: 1 }],
      subs: [
        { id: 'moi-1', text: '@c8m3.sub.moi1', done: used('moi-nuoc-1') },
        { id: 'moi-2', text: '@c8m3.sub.moi2', done: used('moi-nuoc-2') },
        { id: 'moi-3', text: '@c8m3.sub.moi3', done: used('moi-nuoc-3') },
        { id: 'hau-truong', text: '@c8m3.sub.hauTruong', done: reach(NH('backstageDoor'), 1.5) },
      ],
      interact: [
        { id: 'moi-nuoc-1', at: NH('guest1'), r: 1.8, prompt: '@c8m3.int.moi', kind: 'talk', when: 'foot' },
        { id: 'moi-nuoc-2', at: NH('guest2'), r: 1.8, prompt: '@c8m3.int.moi', kind: 'talk', when: 'foot' },
        { id: 'moi-nuoc-3', at: NH('guest3'), r: 1.8, prompt: '@c8m3.int.moi', kind: 'talk', when: 'foot' },
      ],
      enter: [
        { k: 'photoTarget', id: 'luc-tiec', subject: 'luc', evidence: 'ev-luc-da-tiec', minQuality: 0.5, scope: 'step' },
        hint('c8m3.hint.sanh', 8000),
        aside('c8m3-dien-van', [say('mc-tiec', 'c8m3.mc'), say('phuong', 'c8m3.ph1'), say('phuong', 'c8m3.ph2')]),
      ],
      watchers: [
        { when: after(9), do: [aside('c8m3-mai-nha', [think('c8m3.think.ph')])] },
        { when: after(15), do: [hint('c8m3.hint.quanLy')] },
        { when: used('moi-nuoc-1'), do: [bark('khach-1', 'c8m3.k1')] },
        { when: used('moi-nuoc-2'), do: [bark('khach-2', 'c8m3.k2')] },
        { when: used('moi-nuoc-3'), do: [bark('khach-3', 'c8m3.k3')] },
        { when: owned('ev-luc-da-tiec'), do: [aside('c8m3-luc', [think('c8m3.think.luc')])] },
      ],
      optional: [{ id: 'luc-tiec', text: '@c8m3.opt.luc', when: owned('ev-luc-da-tiec') }],
      fail: [{ when: { k: 'meter', id: 'cover:waiter', op: '>=', value: 1 }, reason: '@c8m3.fail.voBoc', soft: true }],
      retry: [{ k: 'teleport', at: NH('foyer') }, { k: 'player', carry: 'khay-ly', cover: 'waiter' }],
    },
    {
      id: 'len-gian', minutes: 0.4, objective: '@c8m3.obj.catwalk', marker: { at: NH('ladder'), label: '@c8m3.mk.thang', style: 'go' },
      interact: [{ id: 'leo-gian-den', at: NH('ladder'), to: NH('catwalk'), r: 1.5, prompt: '@c8m3.int.catwalk', kind: 'climb', when: 'foot' }],
      enter: [{ k: 'player', carry: null }, { k: 'stealth', cover: null }, { k: 'toast', text: '@c8m3.toast.khay' }],
      done: climbed('leo-gian-den'),
    },
    {
      id: 'gian-den', minutes: 1.0, objective: '@c8m3.obj.giao', hud: { light: true, noise: true },
      checkpoint: { label: '@c8m3.cp.catwalk', setup: [
        inSpace('nha-hat-gala', 'kitchen'), put(NH('catwalk'), undefined, 3, 'catwalk'), { k: 'player', outfit: OUTFIT.waiter, carry: null, cover: null }, gala(null),
        { k: 'spawn', id: 'ky-thuat', cast: 'ky-thuat', template: 'ran-den', at: NH('catwalkMid'), team: 'hostile', flashlight: true, tags: ['nha-hat', 'gian-den'],
          behaviour: { k: 'patrol', route: [NH('catwalkMid'), NH('catwalkOverBox'), NH('catwalkMid'), NH('catwalk')], waits: [4, 3, 2, 3] } }] },
      meters: [{ id: 'sound:san-khau', label: '@c8m3.meter.trong', kind: 'bar', max: 1 }],
      // no takedown in the theatre: past the catwalk man while he faces his lamps, on the drum's cover (or lured off with a throw)
      subs: [
        { id: 'lach', text: '@c8m3.sub.lach', done: { k: 'reach', at: NH('catwalkMid'), r: 1.5, level: 'catwalk' } },
        { id: 'toi', text: '@c8m3.sub.toi', done: { k: 'reach', at: NH('catwalkOverBox'), r: 1.2, level: 'catwalk' } },
      ],
      enter: [hint('c8m3.hint.trong', 9000)],
      watchers: [{ when: after(9), do: [hint('c8m3.hint.duoi')] }, { when: after(18), do: [hint('c8m3.hint.lach', 8000)] }],
      fail: [caught('c8m3.fail.lo', 'nghe-len')],
      // the act runs long: once Tín is past, the catwalk man climbs down for a smoke, out of the listening post's way
      exit: [bark('ky-thuat', 'c8m3.bark.kyThuat'), { k: 'behave', id: 'ky-thuat', b: { k: 'goto', at: NH('ladder') } }, { k: 'var', name: 'quaGianDen', value: true }],
    },
    {
      id: 'nghe-len', minutes: 1.4, objective: '@c8m3.obj.nghe', hud: { light: true, noise: true },
      checkpoint: { label: '@c8m3.cp.nghe', setup: [
        inSpace('nha-hat-gala', 'kitchen'), put(NH('catwalkOverBox'), undefined, 2, 'catwalk'), { k: 'player', outfit: OUTFIT.waiter, carry: null, cover: null }, gala(null), ...BOX] },
      meters: [{ id: 'eavesdrop:lo-rieng', label: '@c8m3.meter.nghe', kind: 'bar', max: 1 }],
      enter: [
        // he is gone down the ladder a few seconds later; after a skip past the catwalk he is simply gone
        { k: 'if', c: { k: 'var', name: 'quaGianDen', op: '==', value: true },
          then: [{ k: 'parallel', acts: [{ k: 'wait', seconds: 6 }, { k: 'despawn', tag: 'gian-den' }] }], else: [{ k: 'despawn', tag: 'gian-den' }] },
        { k: 'eavesdrop', id: 'lo-rieng', source: 'phuong', r: 7, seconds: 10, requireHidden: true, lines: [
          say('bao', 'c8m3.n1'), say('phuong', 'c8m3.n2'), say('bao', 'c8m3.n3'), say('phuong', 'c8m3.n4')] },
        hint('c8m3.hint.nghe'),
      ],
      done: { k: 'on', ev: 'eavesdrop', id: 'lo-rieng' },
      fail: [{ when: detected, reason: '@c8m3.fail.lo' }],
      exit: [
        { k: 'cutscene', id: 'cs08_gia_cua_im_lang' },
        { k: 'evidence', id: 'ev-phuong-ram' }, { k: 'journal', id: 'j-tau-ram' },
        { k: 'cutscene', id: 'cs08_gia_cua_im_lang_lo' },
        // the choice changes Phượng's answer now, Vân's call tonight and a line in a later chapter, never the plot; waiting is silence
        { k: 'choice', id: 'phongBi', prompt: '@cs08.q', timeout: 15, default: 'im', options: [
          { id: 'cam', text: '@cs08.opt.cam', set: { tookEnvelope: true }, then: [talk('cs08-cam', [think('cs08.think.cam')])] },
          { id: 'day', text: '@cs08.opt.day' }, { id: 'im', text: '@cs08.opt.im' }] },
        { k: 'cutscene', id: 'cs08_gia_cua_im_lang_dung' },
        { k: 'evidence', id: 'ev-kep-toc-mai' }, { k: 'give', item: 'kep-toc-mai' }, { k: 'journal', id: 'j-loi-moi' },
        { k: 'flag', name: 'refusedPhuong' }, { k: 'flag', name: 'knowsRamShip' },
      ],
    },
    {
      id: 'ra-ve', minutes: 0.8, objective: '@c8m3.obj.ra', marker: { at: NH('exit'), label: '@c8m3.mk.cua', style: 'go' },
      checkpoint: { label: '@c8m3.cp.ra', setup: [
        inSpace('nha-hat-gala', 'kitchen'), put(NH('boxDoor'), undefined, 3), { k: 'player', outfit: OUTFIT.waiter, carry: null, cover: null }, gala(null),
        { k: 'spawn', id: 'thu-ky-phuong', cast: 'thu-ky-phuong', at: NH('secretaryDesk'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'desk-head-down' } },
        { k: 'spawn', id: 've-si-1', cast: 've-si-tiec', template: 'bodyguard', at: NH('boxDoor'), team: 'hostile', tags: ['ve-si'], behaviour: { k: 'follow', target: 'player', dist: 6 } },
        { k: 'spawn', id: 've-si-2', cast: 've-si-tiec', template: 'bodyguard', at: NH('boxDoor'), team: 'hostile', tags: ['ve-si'], behaviour: { k: 'follow', target: 'player', dist: 8 } }] },
      interact: [{ id: 'ra-cua', at: NH('exit'), r: 2, prompt: '@c8m3.int.ra', kind: 'enter', when: 'foot' }],
      enter: [hint('c8m3.hint.ra'), aside('c8m3-kep', [think('c8m3.think.kep')])],
      done: used('ra-cua'),
      fail: [{ when: { k: 'player', prop: 'speed', op: '>', value: 5.5 }, reason: '@c8m3.fail.chay', soft: true }],
      retry: [{ k: 'teleport', at: NH('boxDoor') }],
      exit: [{ k: 'space', leave: 'nha-hat' }, { k: 'stealth', arena: null }, { k: 'despawn', tag: 've-si' }, { k: 'player', outfit: OUTFIT.jacket }],
    },
    {
      id: 'ngoai-pho', minutes: 0.5,
      enter: [
        { k: 'call', id: 'c8m3-van', from: 'van', ring: true, burner: true, lines: [
          phone('van', 'c8m3.v1'), phone('tin', 'c8m3.t1'),
          phone('tin', 'c8m3.t.cam', { if: tookIt }), phone('van', 'c8m3.v.cam', { if: tookIt }),
          phone('tin', 'c8m3.t2'), phone('van', 'c8m3.v2'), phone('van', 'c8m3.v3'), phone('tin', 'c8m3.t3'), phone('van', 'c8m3.v4'), phone('van', 'c8m3.v5')] },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'sawGala' }],
  medals: { par: 480, ghost: true, clues: ['luc-tiec'] },
  replay: { abilities: ABILITIES, flags: { diemTalked: true, diemSafe: true, knowsGala: true }, evidence: ['ev-loi-khai-diem', 'ev-da-tiec'] },
});

// ---- c8-m4 · Két sắt tầng 20 ---------------------------------------------------------------------------------------

const BK = (a: string) => `bank-floor20/${a}`;
/** Floor 20 holds no guards, only cameras: nothing to take down, everything to avoid. */
const bank = (variant: string, cover: string | null): Act => ({
  k: 'stealth', arena: 'ngan-hang', variant, cover,
  rules: { takedowns: false, guns: 'none', lethal: 'fail', failOn: [], showCones: 'observe', countConscience: true, respawn: 'checkpoint', policeSuppressed: true },
});
/**
 * The fuse box cuts the floor's lights for 30 s. Interior light is set-owned (festival-blackout-heli.md §2.6: interiors
 * never call the street's power op): the space variant darkens the set, the arena variant drops the corridor's light
 * field and the camera at its mouth. FLOOR_LIT puts both back (the timer runs out, or Bảo's office is reached).
 */
const FLOOR_DARK: Act[] = [{ k: 'space', variant: { id: 'bank-floor20', v: 'blackout' } }, bank('floor20-dark', null)];
const FLOOR_LIT: Act[] = [{ k: 'space', variant: { id: 'bank-floor20', v: 'lit' } }, bank('floor20', null)];
/** Bảo's safe: six digits, Ngân's birthday DD-MM-YY (the frame gives 2017, the calendar 26/9). Wrong codes beep; closing goes back. */
export const SAFE_CODE = '260917';
const KEYPAD: Act = { k: 'do', op: 'keypad', wait: true, args: { id: 'ket-bao', digits: 6, code: SAFE_CODE, title: '@c8m4.ket.title', hint: '@c8m4.ket.hint' } };
/** The west-facade gondola (spaces-surfaces-levelkit.md §7.7): S lowers, release stops; a torch sweeps the glass from floor 20. */
const GONDOLA: Act = { k: 'do', op: 'gondola', args: { id: 'gondola', at: 'ngan-hang.gondola', foot: 'ngan-hang.foot', speed: 1.5, sweep: { every: 7, width: 4 } } };

const c8m4 = defineMission({
  id: 'c8-m4', meta: { hours: [1, 4], giver: 'van' }, lethal: 'fail',
  start: { at: 'ch8.pho-dream', yaw: 0, vehicle: 'dream', hour: 1.95, weather: 'clear', lunar: 12, outfit: OUTFIT.shipper },
  world: { traffic: 'night', crowd: 'night', police: 'story', gangs: 'calm', clock: { hour: 1.95, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  steps: [
    {
      id: 'hai-gio', minutes: 0.3,
      enter: [
        { k: 'title', kind: 'time', text: '@c8m4.title', sub: '@c8m4.titleSub' },
        { k: 'spawn', id: 'chu-pho-dem', cast: 'chu-pho-dem', at: 'ch8.pho-khuya', team: 'neutral', behaviour: { k: 'act', name: 'ladle' } },
        { k: 'toast', text: '@c8m4.toast.don' },
        { k: 'do', op: 'appOrder', args: { id: 'don-0512', state: 'active', title: '@c8m4.order', from: 'ch8.pho-khuya', to: 'ngan-hang', fee: 30, customer: '@c8m4.order.khach' } },
        aside('c8m4-don', [think('c8m4.think.don')]),
      ],
    },
    {
      id: 'lay-pho', minutes: 0.3, objective: '@c8m4.obj.lay', marker: { at: 'ch8.pho-khuya', label: '@c8m4.mk.pho', style: 'go' },
      interact: [{ id: 'lay-pho', at: 'ch8.pho-khuya', r: 2.5, prompt: '@c8m4.int.lay', kind: 'pick', when: 'foot' }],
      done: used('lay-pho'),
      exit: [aside('c8m4-pho', [say('chu-pho-dem', 'c8m4.chupho')]), { k: 'player', carry: 'order-pho' }],
    },
    {
      id: 'giao-pho', minutes: 0.7, objective: '@c8m4.obj.giao', marker: { at: 'ngan-hang.dream', label: '@c8m4.mk.nh', style: 'go' },
      done: reach('ngan-hang.dream', 5),
    },
    {
      id: 'chuong', minutes: 0.2, objective: '@c8m4.obj.chuong', marker: { at: 'ngan-hang', style: 'go' },
      interact: [{ id: 'bam-chuong', at: 'ngan-hang', r: 2.2, prompt: '@c8m4.int.vao', kind: 'enter', when: 'foot' }],
      done: used('bam-chuong'),
      exit: [{ k: 'space', enter: 'bank-floor20', link: 'lobby' }],
    },
    {
      // the guard's question (stealth-player-kit.md §8.3 authored desk question): wrong answers dip and ask again
      id: 'sanh-nh', minutes: 0.3, hud: { cover: true },
      checkpoint: { label: '@c8m4.cp.sanh', setup: [
        inSpace('bank-floor20', 'lobby'), put(BK('lobby'), undefined, 4), { k: 'player', outfit: OUTFIT.shipper, carry: 'order-pho', cover: 'shipper' }, bank('lobby', 'shipper'),
        { k: 'spawn', id: 'bao-ve-nh', cast: 'bao-ve-nh', template: 'desk-guard', at: BK('guardDesk'), team: 'neutral', tags: ['innocent'], behaviour: { k: 'act', name: 'phone-bored' } }] },
      enter: [
        talk('c8m4-bv', [say('bao-ve-nh', 'c8m4.bv1')]),
        { k: 'choice', id: 'baoVeNh', prompt: '@c8m4.q.bv', style: 'bluff', options: [
          { id: 'anh', text: '@c8m4.opt.bv.anh' },
          { id: 'sep', text: '@c8m4.opt.bv.sep', then: [talk('c8m4-bv-sep', [say('bao-ve-nh', 'c8m4.bv.sep')])] },
          { id: 'dai', text: '@c8m4.opt.bv.dai', then: [talk('c8m4-bv-dai', [say('bao-ve-nh', 'c8m4.bv.dai')])] }] },
      ],
      done: flag('choice:baoVeNh', 'anh'),
      fail: [wrongAnswer('baoVeNh', 'anh', 'c8m4.fail.bv')],
      exit: [
        talk('c8m4-bv-ok', [say('bao-ve-nh', 'c8m4.bv.ok')]),
        { k: 'player', carry: null }, { k: 'do', op: 'appOrder', args: { id: 'don-0512', state: 'done' } }, { k: 'cash', n: 30 },
        { k: 'behave', id: 'bao-ve-nh', b: { k: 'act', name: 'eat-noodles' } },
      ],
    },
    {
      id: 'cau-thang', minutes: 0.4, objective: '@c8m4.obj.cauThang', marker: { at: BK('stairDoor'), label: '@c8m4.mk.cauThang', style: 'subtle' }, hud: { cover: true },
      meters: [{ id: 'cover:shipper', label: '@c8m4.meter.voBoc', kind: 'bar', max: 1 }],
      interact: [{ id: 'cua-cau-thang', at: BK('stairDoor'), r: 1.5, prompt: '@c8m4.int.cauThang', kind: 'enter', when: 'foot' }],
      enter: [hint('c8m4.hint.cauThang')],
      done: used('cua-cau-thang'),
      fail: [{ when: { k: 'all', of: [{ k: 'actor', id: 'bao-ve-nh', sees: true }, reach(BK('stairDoor'), 2.5)] }, reason: '@c8m4.fail.thay' }],
      exit: [{ k: 'fade', to: 'black', ms: 800 }, { k: 'player', outfit: OUTFIT.jacket, cover: null }, { k: 'toast', text: '@c8m4.toast.coiAo' }],
    },
    {
      id: 'tang-20', minutes: 0.9, objective: '@c8m4.obj.tang20', marker: { at: BK('fuseBox'), label: '@c8m4.mk.cauDao', style: 'subtle' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c8m4.cp.tang20', setup: [inSpace('bank-floor20', 'lobby'), put(BK('stairs20'), undefined, 3), { k: 'player', outfit: OUTFIT.jacket, carry: null, cover: null }, ...FLOOR_LIT] },
      enter: [
        { k: 'title', kind: 'place', text: '@c8m4.tang20' }, { k: 'fade', to: 'clear', ms: 800 },
        // a photographed camera shows its sweep for good (phone-detective-ui.md §3.2): no evidence, a lasting map
        { k: 'photoTarget', id: 'cam-1', subject: BK('cam1'), minQuality: 0.4, scope: 'step' },
        { k: 'photoTarget', id: 'cam-2', subject: BK('cam2'), minQuality: 0.4, scope: 'step' },
        { k: 'photoTarget', id: 'cam-3', subject: BK('cam3'), minQuality: 0.4, scope: 'step' },
        hint('c8m4.hint.cam', 9000),
      ],
      optional: [{ id: 'chup-cam', text: '@c8m4.opt.cam', when: { k: 'all', of: [photoed('cam-1'), photoed('cam-2'), photoed('cam-3')] } }],
      done: reach(BK('fuseBox'), 1.5),
      fail: [caught('c8m4.fail.cam')],
    },
    {
      id: 'cau-dao', minutes: 0.3, objective: '@c8m4.obj.cauDao', marker: { at: BK('fuseBox'), style: 'go' }, hud: { light: true, noise: true },
      interact: [{ id: 'cat-dien', at: BK('fuseBox'), r: 1.4, hold: 3, prompt: '@c8m4.int.cauDao', kind: 'use', when: 'foot' }],
      done: used('cat-dien'),
      fail: [caught('c8m4.fail.cam')],
      exit: FLOOR_DARK,
    },
    {
      id: 'hanh-lang', minutes: 0.4, objective: '@c8m4.obj.hanhLang', marker: { at: BK('bossDoor'), label: '@c8m4.mk.phong', style: 'go' }, hud: { light: true, noise: true },
      enter: [{ k: 'timer', id: 'cup-dien', seconds: 30, label: '@c8m4.timer.cupDien', scope: 'step' }],
      done: reach(BK('bossDoor'), 1.5),
      branch: [{ when: { k: 'on', ev: 'timer', id: 'cup-dien' }, goto: 'cau-dao', do: [...FLOOR_LIT, hint('c8m4.hint.lai')] }],
      fail: [caught('c8m4.fail.cam')],
    },
    {
      id: 'phong-bao', minutes: 0.6, objective: '@c8m4.obj.phong', hud: { light: true, noise: true },
      checkpoint: { label: '@c8m4.cp.phong', setup: [inSpace('bank-floor20', 'lobby'), put(BK('bossDoor'), undefined, 3), { k: 'player', outfit: OUTFIT.jacket, cover: null }, ...FLOOR_LIT] },
      subs: [
        { id: 'khung', text: '@c8m4.sub.khung', done: owned('ev-anh-be-ngan') },
        { id: 'lich', text: '@c8m4.sub.lich', done: owned('ev-lich-ban') },
      ],
      enter: [
        { k: 'clue', id: 'khung-anh-ngan', at: BK('frame'), r: 1.4, evidence: 'ev-anh-be-ngan', examine: 'object:photo-frame', scope: 'step' },
        { k: 'clue', id: 'lich-ban', at: BK('calendar'), r: 1.4, evidence: 'ev-lich-ban', examine: 'paper:desk-calendar', scope: 'step' },
      ],
      watchers: [
        { when: owned('ev-anh-be-ngan'), do: [aside('c8m4-khung', [think('c8m4.think.khung')])] },
        { when: owned('ev-lich-ban'), do: [aside('c8m4-lich', [think('c8m4.think.lich')])] },
      ],
      exit: [aside('c8m4-ma', [think('c8m4.think.ma')])],
    },
    {
      id: 'ket-sat', minutes: 0.2, objective: '@c8m4.obj.ket', marker: { at: BK('safe'), label: '@c8m4.mk.ket', style: 'go' },
      interact: [{ id: 'mo-ket', at: BK('safe'), r: 1.4, prompt: '@c8m4.int.ket', kind: 'use', when: 'foot' }],
      done: used('mo-ket'),
    },
    {
      id: 'bam-ma', minutes: 0.3,
      enter: [KEYPAD],
      done: signal('keypad', 'open'),
      branch: [{ when: signal('keypad', 'closed'), goto: 'ket-sat', do: [hint('c8m4.hint.ketLai')] }],
      exit: [
        { k: 'evidence', id: 'ev-so-chi' }, { k: 'evidence', id: 'ev-usb-bao' }, { k: 'give', item: 'so-chi' }, { k: 'give', item: 'usb-bao' },
        aside('c8m4-so', [think('c8m4.think.so'), think('c8m4.think.usb')]), { k: 'journal', id: 'j-so-chi' }, { k: 'flag', name: 'hasSoChi' },
      ],
    },
    {
      id: 'bao-vao', minutes: 0.3, objective: '@c8m4.obj.nup', marker: { at: BK('bossDesk'), style: 'go' },
      checkpoint: { label: '@c8m4.cp.bao', setup: [
        inSpace('bank-floor20', 'lobby'), put(BK('safe'), undefined, 3), { k: 'player', outfit: OUTFIT.jacket, cover: null }, ...FLOOR_LIT,
        { k: 'spawn', id: 'bao', cast: 'bao', at: BK('litCorridor'), team: 'neutral', behaviour: { k: 'goto', at: BK('bossDoor') } }] },
      interact: [{ id: 'nup-gam-ban', at: BK('bossDesk'), r: 1.4, prompt: '@c8m4.int.nup', kind: 'hide', when: 'foot' }],
      enter: [aside('c8m4-buoc', [think('c8m4.think.buoc')]), { k: 'timer', id: 'nup', seconds: 6, label: '@c8m4.timer.nup', fail: '@c8m4.fail.nup', scope: 'step' }],
      done: used('nup-gam-ban'),
    },
    {
      id: 'gam-ban', minutes: 0.4,
      enter: [{ k: 'cutscene', id: 'c8m4-gam-ban' }, { k: 'evidence', id: 'ev-bao-goi-luc' }, { k: 'flag', name: 'knowsFrame' }],
    },
    {
      // story-decisions §4: X held in a hide spot holds the breath (never Space)
      id: 'nin-tho', minutes: 0.4, objective: '@c8m4.obj.nin', hud: { light: true, noise: true },
      meters: [{ id: 'breath', label: '@c8m4.meter.tho', kind: 'bar', max: 1 }],
      enter: [{ k: 'behave', id: 'bao', b: { k: 'goto', at: BK('safe') } }, hint('c8m4.hint.nin', 8000)],
      done: { k: 'hold', seconds: 8, c: { k: 'stance', is: 'hidden' } },
      fail: [{ when: detected, reason: '@c8m4.fail.nin' }],
      exit: [
        bark('bao', 'c8m4.bao.mat', true),
        { k: 'behave', id: 'bao', b: { k: 'goto', at: BK('litCorridor'), run: true } },
        { k: 'do', op: 'stealthAlarm', args: { level: 2, reason: 'lockdown' } },
        { k: 'toast', text: '@c8m4.toast.khoa' },
      ],
    },
    {
      id: 'cua-so', minutes: 0.4, objective: '@c8m4.obj.cuaSo', marker: { at: BK('window'), label: '@c8m4.mk.cuaSo', style: 'go' },
      interact: [{ id: 'ra-gian', at: BK('window'), to: 'ngan-hang.gondola', r: 1.5, prompt: '@c8m4.int.cuaSo', kind: 'climb', when: 'foot' }],
      enter: [{ k: 'timer', id: 'bao-ve-len', seconds: 25, label: '@c8m4.timer.bv', fail: '@c8m4.fail.bv2', scope: 'step' }],
      done: climbed('ra-gian'),
      exit: [{ k: 'space', leave: 'ngan-hang.gondola' }, { k: 'stealth', arena: null }, { k: 'despawn', id: 'bao' }],
    },
    {
      id: 'gian-lau-kinh', minutes: 0.8, objective: '@c8m4.obj.gondola',
      checkpoint: { label: '@c8m4.cp.gondola', setup: [
        put('ngan-hang.gondola', undefined, 2), { k: 'player', outfit: OUTFIT.jacket, cover: null },
        { k: 'vehicle', id: 'dream', model: 'dream', at: 'ngan-hang.dream', yaw: 0, state: 'park' }] },
      enter: [{ k: 'cutscene', id: 'c8m4-gondola' }, GONDOLA, hint('c8m4.hint.gondola', 9000)],
      done: { k: 'on', ev: 'arrived', id: 'gondola' },
      fail: [{ when: { k: 'on', ev: 'spotted', id: 'gondola' }, reason: '@c8m4.fail.gondola' }],
      exit: [{ k: 'stop', id: 'gondola' }],
    },
    {
      id: 'len-xe', minutes: 0.3, objective: '@c8m4.obj.xe', marker: { at: 'ngan-hang.dream', label: '@c8m4.mk.xe', style: 'go' },
      done: { k: 'reach', at: 'ngan-hang.dream', r: 3, mode: 'bike' },
    },
    {
      id: 've-nha', minutes: 0.7, objective: '@c8m4.obj.ve', marker: { at: 'cafe-co-ba.dream', label: '@c8m4.mk.ve', style: 'go' },
      enter: [aside('c8m4-ve', [think('c8m4.think.ve')])],
      done: { k: 'reach', at: 'cafe-co-ba.dream', r: 4, mode: 'bike' },
    },
    {
      id: 'sang', minutes: 0.6,
      enter: [
        { k: 'fade', to: 'black', ms: 1200 },
        { k: 'lunar', day: 13 }, { k: 'time', hour: 7 }, { k: 'weather', set: 'rain', lock: true }, { k: 'world', policy: { traffic: 'normal', crowd: 'normal' } },
        { k: 'space', enter: 'co-ba-ground', link: 'front' },
        { k: 'title', kind: 'time', text: '@c8m4.title2', sub: '@c8m4.title2Sub' },
        { k: 'fade', to: 'clear', ms: 900 },
        { k: 'cutscene', id: 'c8m4-tivi' },
        { k: 'journal', id: 'j-ban-tin-sang' }, { k: 'flag', name: 'wanted' },
        // chapter 9 opens at the café's back door (c9-m1)
        { k: 'fade', to: 'black', ms: 900 }, { k: 'space', leave: 'cafe-co-ba.backDoor' }, { k: 'fade', to: 'clear', ms: 900 },
        aside('c8m4-cuoi', [think('c8m4.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'stoleSoChi' }],
  medals: { par: 600, ghost: true, clues: ['chup-cam'] },
  replay: { abilities: ABILITIES, flags: { diemTalked: true, refusedPhuong: true, knowsRamShip: true }, evidence: ['ev-loi-khai-diem', 'ev-phuong-ram'] },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string, role = false): CastDef =>
  ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look, ...(role ? { role: `@cast.${id}.role` } : {}) });
export const CAST: CastDef[] = [
  person('bao', '#b0a67a', 'B', 'banker', true), person('bao-ve-cc', '#5b6676', 'B', 'building-guard'), person('sat-thu', '#2f3036', 'R', 'ran-den'),
  person('ho-ly', '#8fc1b5', 'H', 'orderly'), person('gia-ho-ly', '#6f8f88', 'H', 'fake-orderly'), person('y-ta', '#a9d4e8', 'Y', 'nurse'),
  person('benh-nhan', '#c8c2b4', 'B', 'patient'), person('cs-loc', '#36507a', 'C', 'river-police'), person('phu-bep', '#d9d2c3', 'P', 'kitchen-hand'),
  person('dau-bep', '#ece6da', 'B', 'chef'), person('quan-ly-tiec', '#7d5b8f', 'Q', 'floor-manager'), person('khach-tiec', '#c9a96e', 'K', 'gala-guest'),
  person('ky-thuat', '#3b3f46', 'G', 'ran-den'), person('ve-si-tiec', '#25272c', 'V', 'bodyguard'), person('thu-ky-phuong', '#b98fa8', 'T', 'secretary'),
  person('mc-tiec', '#d6b25e', 'MC', 'mc'), person('bao-ve-nh', '#4d5b6a', 'B', 'bank-guard'), person('mc-sang', '#4e7fb8', 'TV', 'news-anchor'),
  person('khach-quan', '#a59a86', 'K', 'resident'), person('chu-pho-dem', '#b98a5e', 'P', 'vendor-man'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 8, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-anh-be-su', 'photo', 'beSu', 'frame', ['diem', 'su', 'mai-am']),
  ev('ev-loi-khai-diem', 'testimony', 'loiKhaiDiem', 'quote', ['diem', 'phuong', 'bao', 'so-chi', 'so-goc']),
  ev('ev-gia-ho-ly-1', 'photo', 'hoLyGia1', 'person', ['benh-vien', 'ran-den']),
  ev('ev-gia-ho-ly-2', 'photo', 'hoLyGia2', 'person', ['benh-vien', 'ran-den']),
  ev('ev-ong-tiem', 'object', 'ongTiem', 'syringe', ['benh-vien', 'diem']),
  ev('ev-da-tiec', 'testimony', 'daTiec', 'quote', ['diem', 'phuong', 'bao', 'nha-hat']),
  ev('ev-luc-da-tiec', 'photo', 'lucTiec', 'camera', ['luc', 'phuong', 'nha-hat']),
  ev('ev-phuong-ram', 'testimony', 'phuongRam', 'quote', ['phuong', 'b2', 'ram']),
  ev('ev-kep-toc-mai', 'object', 'kepToc', 'lotus', ['mai', 'phuong']),
  ev('ev-anh-be-ngan', 'object', 'beNgan', 'frame', ['bao', 'ket'], '2017'),
  ev('ev-lich-ban', 'document', 'lichBan', 'calendar', ['bao', 'ket'], '26/9'),
  ev('ev-so-chi', 'document', 'soChiDen', 'ledger', ['bao', 'so-chi', 'luc']),
  ev('ev-usb-bao', 'object', 'usbBao', 'usb', ['bao', 'so-chi']),
  ev('ev-bao-goi-luc', 'testimony', 'baoGoi', 'phone', ['bao', 'luc', 'tu']),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [
  note('j-diem-2014', 'people', 'diem2014'), note('j-hai-cuon-so', 'notes', 'haiCuonSo'), note('j-ho-ly', 'diary', 'hoLy'), note('j-ai-bao-tin', 'notes', 'aiBaoTin'),
  note('j-loi-moi', 'diary', 'loiMoi'), note('j-tau-ram', 'notes', 'tauRam'), note('j-so-chi', 'notes', 'soChi'), note('j-ban-tin-sang', 'diary', 'banTinSang'),
];
/**
 * c8-m1 (phone-detective-ui.md §8.1): two lies broken with a card ('accuse'), one truth met with understanding ('empathy').
 * Accusing the truth hurts her; a wrong card costs four seconds of silence. Every card is a main-path card of an earlier
 * chapter: Ánh Dương's ledger (ch.4, any page in her hand), Mai's bag (ch.5; the charcoal lotus also answers), Ông Tư's
 * 2014 file (ch.6).
 */
export const INTERROGATIONS: InterrogationDef[] = [{
  id: 'diem-loi-khai', subject: 'diem', title: '@c8m1.iv.title', shutdown: 4, bluffShutdown: 8,
  statements: [
    { id: 'van-phong', text: '@c8m1.iv.s1', kind: 'lie', cards: ['ev-so-trang-1', 'ev-so-trang-2', 'ev-so-trang-3', 'ev-so-mai'], reply: '@c8m1.iv.s1.reply', wrong: '@c8m1.iv.wrong',
      press: { text: '@c8m1.iv.s1.press', hint: 'ev-so-trang-2' }, bluff: 0.6 },
    { id: 'tu-nguyen', text: '@c8m1.iv.s2', kind: 'lie', cards: ['ev-cap-mai', 'ev-sen-than-spa'], reply: '@c8m1.iv.s2.reply', wrong: '@c8m1.iv.wrong',
      press: { text: '@c8m1.iv.s2.press', hint: 'ev-cap-mai' } },
    { id: 'khong-lua-chon', text: '@c8m1.iv.s3', kind: 'true', cards: ['ev-ho-so-diem'], reply: '@c8m1.iv.s3.reply', wrong: '@c8m1.iv.hurt',
      press: { text: '@c8m1.iv.s3.press', hint: 'ev-ho-so-diem' } },
  ],
  done: [{ k: 'flag', name: 'diemTalked' }],
}];
export const QUESTIONS: QuestionDef[] = [{
  id: 'aiBaoTin', prompt: '@c8m2.q.ai', answer: 'luc', cost: 1, hint: '@c8m2.q.ai.hint',
  options: [
    { id: 'luc', text: '@c8m2.q.ai.luc', needs: ['ev-luc-hoi', 'ev-clip-luc'] },
    { id: 'loc', text: '@c8m2.q.ai.loc' }, { id: 'quang', text: '@c8m2.q.ai.quang' }],
  onCorrect: [{ k: 'flag', name: 'knowsLucLeak' }, { k: 'journal', id: 'j-ai-bao-tin' }],
}];

/**
 * Off-map space anchors this chapter places things at ('space/anchor' in scripts, 'set:space.anchor' in cutscenes): a
 * contract for the level kit (spaces-surfaces-levelkit.md §11). Entry links: phu-my 'lobby', hospital-ward 'stairs'
 * (chapter 4's), nha-hat-gala 'kitchen', bank-floor20 'lobby', co-ba-ground 'front' (chapter 5's). Chapter 4 already
 * declares hospital-ward's stairs, corridor, doorGlass, bay3, bay3Stool and window; chapter 5 co-ba-ground's front,
 * counter, kitchen and recorder.
 */
export const ANCHORS: Record<string, Record<string, string>> = {
  'phu-my': {
    lobby: 'inside the street door of CHUNG CƯ PHÚ MỸ (entry link "lobby"; leaving puts the player on the sidewalk at the door)',
    mailboxes: 'the wall of steel mailboxes by the lifts: box 1204 is labelled "V.N. DIỄM"',
    guardDesk: 'the lobby guard desk facing the door and the lifts',
    corridor12: '12th-floor corridor at the lift doors (the lift ride itself is a fade)',
    door1204: 'the door of apartment 1204 seen from the corridor: a chain on the inside, a peephole',
    apartment: 'inside 1204: a small living room, lamps low, curtains drawn',
    suitcase: 'the open suitcase on the sofa, clothes stuffed in (Diễm packing to flee)',
    shelf: 'a shelf with a framed photo of Su (optional clue)',
    serviceDoor: 'the kitchen back door onto the service landing and the fire stairs',
    stairs9Up: 'fire stairs: the flight above the 9th-floor landing (a hitman comes down it)',
    stairs9: '9th-floor landing: a dark corner under the flight where Diễm can hide (B)',
    stairs9Down: 'the flight down from the 9th-floor landing (the fade to the 5th)',
    stairs5: '5th-floor landing: the fire door to the lift lobby and a dark corner',
    stairs5Down: 'the flight below the 5th-floor landing (a hitman comes up it; the fade to the ground floor)',
    stairs1: 'ground-floor landing of the fire stairs',
    carParkDoor: 'the fire door into the basement car park (a hitman posted in front of it)',
    carPark: "the car-park bay where Vân's silver sedan waits, engine running",
  },
  'hospital-ward': {
    nurseStation: "the nurses' station mid-corridor, its 4-camera monitor (opens the monitor overlay)",
    linen: 'the linen room (staff only): shelves of folded sheets, a laundry cart, no window',
    bay1: 'bay 1: an old man asleep behind a half-drawn curtain',
    bay2: 'bay 2: a patient sitting up, a visitor on a stool',
    curtain: 'between bays 1 and 2: a drawn curtain, a quiet corner out of sight',
    corridorEnd: 'the far end of the corridor by the service lift (the empty gurney turns here)',
    bay3Door: "outside the door of bay 3, Diễm's room (the officer's empty chair; the third man stands here)",
    stairLanding: 'half a floor down the stairwell, out of sight of the ward (staff only)',
  },
  'nha-hat-gala': {
    kitchen: 'the theatre kitchen inside the service door (entry link "kitchen"; leaving goes to the front door)',
    pantry: 'the pass where the waiters pick up trays of glasses',
    foyer: 'the foyer arch into the gala hall, the banner overhead',
    managerPost: "the floor manager's post by the pillar, a view of the whole hall",
    guest1: 'a table of guests near the foyer',
    guest2: 'a knot of guests standing mid-hall',
    guest3: 'guests at the foot of the stage',
    stage: 'the stage apron with the microphone (speeches; the cải lương troupe after)',
    mcStand: "the MC's lectern at the side of the stage apron (he introduces Phượng, then stands back)",
    honorTable: 'the table of honour below the stage',
    backstageDoor: 'the door behind the stage wing into backstage',
    ladder: 'the steel ladder up to the lighting catwalk (backstage)',
    catwalk: 'the lighting catwalk at its ladder end, 9 m over the stage (level "catwalk")',
    catwalkMid: 'mid-catwalk among the lamps (the technician-guard\'s post; level "catwalk")',
    catwalkOverBox: 'the catwalk end right above the private box: a grille to look down through (level "catwalk")',
    box: "Phượng's private box: two chairs, a low table, a tea set, red stage light through the curtain",
    boxDoor: 'the corridor outside the private box',
    secretaryDesk: "the secretary's desk in the box corridor (a gala programme on it)",
    exit: 'the theatre\'s front doors from inside (leaving puts the player at the door of NHÀ HÁT THÀNH PHỐ)',
  },
  'bank-floor20': {
    lobby: 'inside the street door of NGÂN HÀNG KIM THÀNH at night (entry link "lobby")',
    guardDesk: 'the night security desk facing the door, a small TV',
    stairDoor: 'the stairwell door behind the lift bank, out of the desk\'s straight view',
    stairs20: 'the stairwell door on floor 20 (the climb itself is a fade)',
    cam1: 'CCTV camera over the open-plan office rows, screens asleep (sweeping)', cam2: 'CCTV camera at the pantry corner (sweeping)', cam3: 'CCTV camera at the lit corridor mouth (sweeping)',
    fuseBox: 'the floor fuse box in the copy room (hold E to cut the floor lights)',
    litCorridor: 'the glass-walled corridor to the executive offices, brightly lit',
    bossDoor: "the door of Bảo's office at the end of the corridor",
    bossDesk: "Bảo's desk: room underneath to hide (under-desk hide spot)",
    frame: "a framed baby photo on Bảo's desk with an engraved plate (clue)",
    calendar: "the desk calendar beside the phone, September open (clue)",
    safe: 'the wall safe behind a cabinet door (keypad)',
    window: "the west window of Bảo's office, a hatch onto the window-cleaning gondola",
  },
  'co-ba-ground': {
    tv: 'the café TV on its wall bracket above the counter',
    tables: 'the low tables and plastic stools of the morning customers',
    shutter: 'the front roller shutter from inside (pulled halfway down)',
  },
};
/**
 * The chapter's own named points (checked on today's map by scripts/story-ch08.test.mjs): the stake-out across ĐƯỜNG
 * CHỢ CŨ from Ánh Dương and the Dream beside it, Diễm's scooter on the sidewalk east of the x -54 crossing, the Dream at
 * the curb of PHÚ MỸ, and the night phở shop (building 129, PHỞ HÀ NỘI) with the Dream on its sidewalk.
 */
export const PLACES: Record<string, PlaceDef> = {
  'ch8.rinh': { x: -72, z: 98.6, yaw: 0, r: 0.45 },
  'ch8.dream-cho-cu': { x: -75.5, z: 98.6, yaw: H, r: 0.9 },
  'ch8.xe-diem': { x: -40, z: 117.5, yaw: H, r: 0.9 },
  'ch8.dream-phu-my': { x: 291, z: 63.6, yaw: -H, r: 0.9 },
  'ch8.pho-khuya': { x: 150.3, z: -37.61, yaw: H, r: 0.3 },
  'ch8.pho-dream': { x: 153.5, z: -40, yaw: 0, r: 0.9 },
};
/**
 * Case-board cards this chapter contributes to a later BẢNG MANH MỐI and the strings that tie them to chapters 3–6.
 * Slots: chapters 1–5 hold 0–33; chapters 6 and 7 are expected on 34–43 and 44–53, so chapter 8 takes 54–61.
 */
export const BOARD_CARDS: BoardCard[] = [
  { id: 'ev-loi-khai-diem', slot: 54 }, { id: 'ev-da-tiec', slot: 55 }, { id: 'ev-phuong-ram', slot: 56 }, { id: 'ev-kep-toc-mai', slot: 57 },
  { id: 'ev-so-chi', slot: 58 }, { id: 'ev-usb-bao', slot: 59 }, { id: 'ev-bao-goi-luc', slot: 60 }, { id: 'ev-gia-ho-ly-2', slot: 61 },
];
export const BOARD_LINKS: [string, string][] = [
  ['ev-loi-khai-diem', 'ev-ho-so-diem'], ['ev-loi-khai-diem', 'ev-diem-goi'], ['ev-loi-khai-diem', 'ev-gia-ho-ly-2'], ['ev-gia-ho-ly-2', 'ev-da-tiec'],
  ['ev-da-tiec', 'ev-phuong-ram'], ['ev-phuong-ram', 'ev-so-do-b2'], ['ev-phuong-ram', 'ev-kep-toc-mai'], ['ev-kep-toc-mai', 'ev-cap-mai'],
  ['ev-loi-khai-diem', 'ev-so-chi'], ['ev-so-chi', 'ev-dong-ho-vang'], ['ev-so-chi', 'ev-usb-bao'], ['ev-so-chi', 'ev-bao-goi-luc'],
  ['ev-bao-goi-luc', 'ev-clip-luc'],
];

/**
 * Engine ids this chapter uses beyond story/contract.ts (ENGINE_CONTRACT, SCENE_REQUESTS) and the requests of chapters
 * 4–5 (content/ch04.ts CONTRACT_REQUESTS, content/ch05.ts ENGINE_NEEDS), by contract kind, with the lane that builds
 * each. The integrator adds them to ENGINE_CONTRACT; scripts/story-ch08.test.mjs lints the chapter against the contract
 * plus these and fails if one is unused or one is missing.
 */
export const ENGINE_NEEDS: Partial<Record<ContractKind, Record<string, ContractEntry>>> = {
  ops: {
    monitor: ['ui', "live CCTV monitor wall (CctvView.monitors, phone-detective-ui.md §6.6) {id, title @key, feeds[{cam @key, at}], tag}: keys 1–4 switch feeds at 2 fps; a hostile framed for 1 s is tagged (outline through walls); blocks until closed (signal 'monitor'; c8-m2)"],
    qte: ['ui', "play QTE (escort-boss-qte.md §3; the op chapter 6 also requests for c6-m3) {id, kind, keys, label @key, window, target?, anchor {actor}, onFail}; wait: true blocks until it resolves 'ok' or 'miss' and latches {type:'signal', id:'qte', result} (c8-m2 'c8m2-tackle': press E within 2 s)"],
    keypad: ['ui', "safe keypad overlay {id, digits, code, title @key, hint @key}: wrong codes beep and clear, never fail; blocks; resolves 'open' (right code) or 'closed' (Esc) (signal 'keypad', result; c8-m4)"],
    gondola: ['spaces', "the window-cleaning cradle on a facade, a vertical moving slab (spaces-surfaces-levelkit.md §7.7) {id, at, foot, speed, sweep {every, width}}: S lowers, release stops; a torch sweeps the glass above, lit while moving → {type:'spotted', id}; the foot reached → {type:'arrived', id}; {k:'stop', id} ends it (c8-m4)"],
  },
  outfits: {
    'tin-ao-tu': ['core', "Tín in Ông Tư's faded dark jacket over his T-shirt, the whistle on its cord (story outfit from chapter 7, −10% visibility)"],
    'tin-waiter': ['core', "Tín in a catering waiter's black vest and white shirt over his jeans (c8-m3 gala)"],
  },
  models: { 'catering-van': ['vehicles', 'a white catering van with its rear doors open, racks of vests and glassware inside (the theatre service lane, c8-m3)'] },
  templates: {
    'desk-guard': ['stealth', "a building or bank desk guard: neutral, innocent, a vision cone over the lobby; asks the runner's authored question, never fights (c8-m1, c8-m4)"],
    orderly: ['director', 'hospital orderly in scrubs, clogs and a hanging ID badge (innocent; the real ones of c8-m2)'],
    'fake-orderly': ['stealth', "a Rắn Đen in orderly scrubs with the tells (leather shoes, no badge, a snake tattoo at the wrist); tag 'gurney' pushes an empty gurney along his patrol, tag 'syringe' waits at a door; guard brain (c8-m2)"],
    nurse: ['director', "nurse at the nurses' station (innocent; c8-m2)"],
    patient: ['director', 'ward patient in hospital pyjamas, in bed or sitting up; a witness who feeds the panic meter (c8-m2)'],
    'floor-manager': ['stealth', 'the gala floor manager: a non-hostile watcher whose cone drains the waiter cover fast while the player stands idle (c8-m3)'],
    'gala-guest': ['director', 'gala guest in evening clothes, a glass in hand (innocent; c8-m3, CS08 extras)'],
    bodyguard: ['director', "Phượng's bodyguards in dark suits, earpieces (the template chapter 6 also requests): in c8-m3 they follow Tín out at a distance; running is failed by the script, not by a guard brain"],
    'cai-luong': ['director', 'cải lương performer in full stage costume (scene extras on the stage, CS08)'],
  },
  arenas: {
    'phu-my': ['stealth', "CHUNG CƯ PHÚ MỸ: variant 'lobby' (public, shipper cover, the desk guard), variant 'stairs' (fire-stair landings: dark corners as escort hide spots, hitmen with flashlights and silenced pistols, guns 'loot') (c8-m1)"],
    'benh-vien': ['stealth', "3rd-floor ward, variant 'day': wards public, linen room and stairwell staff-only (visitor cover); innocents in the bays fill the panic meter when they see violence (c8-m2)"],
    'nha-hat': ['stealth', "the theatre, variant 'gala': foyer and hall public (waiter cover), kitchen staff, backstage and the catwalk restricted; the cải lương drum and cymbals are timed sound-cover windows (meter 'sound:san-khau') for moving on the loud steel catwalk; a heritage site: takedowns off, the catwalk guard is slipped past (c8-m3)"],
    'ngan-hang': ['stealth', "NGÂN HÀNG KIM THÀNH: variant 'lobby' (shipper cover, the desk guard), variant 'floor20' (three sweeping CCTV cones, a photographed camera shows its cone for good; the glass corridor lit), variant 'floor20-dark' (the fuse box cut: the corridor light field at night ambient, cam3 at the corridor mouth dead) (c8-m4)"],
  },
  meters: {
    'cover:visitor': ['stealth', 'visitor cover integrity 0..1 (c8-m2)'],
    'cover:waiter': ['stealth', 'waiter cover integrity 0..1 (c8-m3)'],
    'panic:benh-vien': ['stealth', 'HOẢNG LOẠN 0..1: patients who see violence fill it; full sends the third impostor to Diễm early (c8-m2)'],
    'sound:san-khau': ['stealth', "the show's sound-cover window 0..1, pulsing with each drum or cymbal hit (c8-m3)"],
    breath: ['stealth', 'breath left while holding it in a hide spot 0..1 (X held, stealth-player-kit.md §5.2; c8-m4)'],
  },
  carry: {
    'bich-cam': ['core', 'a plastic bag of oranges for a patient (visitor cover prop, not a carried object for the guards; c8-m2)'],
    'khay-ly': ['core', "a waiter's tray of glasses (cover prop; 3.2 m/s cap; running drops it and breaks the cover; c8-m3)"],
  },
  poses: { support: ['core', 'supported walk: Diễm on the right shoulder, 1.3 m/s, no run, crouch or climb (escort-boss-qte.md §1.10; c8-m1)'] },
  acts: {
    'pack-suitcase': ['director', 'stuffing clothes into an open suitcase, fast, looking at the door (c8-m1)'],
    'syringe-ready': ['director', 'standing at a door, one hand on the handle, the other in a scrubs pocket (c8-m2)'],
    speech: ['director', 'at a microphone on a stage, one hand raised to the room (c8-m3)'],
    'toast-glass': ['director', 'seated at a table, raising a glass to the person beside him (c8-m3)'],
    mingle: ['director', 'gala guests chatting in a loose group, glasses in hand (c8-m3)'],
    'sip-tea': ['director', 'seated, sipping tea from a small cup, unhurried (c8-m3)'],
    'wipe-brow': ['director', 'seated, dabbing the forehead with a damp handkerchief (c8-m3)'],
    'eat-noodles': ['director', 'at a desk, head down over a bowl of phở, chopsticks (c8-m4)'],
  },
  clips: {
    'hold-frame': ['director', 'one-actor scene clip: holds a framed photo in both hands and looks at it (c8-m1)'],
    'peek-peephole': ['director', 'one-actor scene clip: leans to a door and looks through the peephole (c8-m1)'],
    'screw-silencer': ['director', 'one-actor scene clip: threads a silencer onto a pistol barrel, eyes on the door (no aim, no shot; c8-m1)'],
    'sip-tea': ['director', 'one-actor scene clip: lifts a small cup and sips (CS08)'],
    'slide-envelope': ['director', 'one-actor scene clip: slides an envelope across a table with two fingers (CS08)'],
    'phone-to-ear': ['director', 'one-actor scene clip: paces with a mobile pressed to the ear (c8-m4)'],
    'cover-mouth': ['director', 'one-actor scene clip: crouched, a hand pressed over his own mouth (c8-m4)'],
    'switch-off-tv': ['director', 'one-actor scene clip: reaches up and switches off a wall TV (c8-m4)'],
    'pull-shutter': ['director', 'one-actor scene clip: pulls a roller shutter halfway down with a hook (c8-m4)'],
  },
  sceneProps: {
    suitcase: ['director', 'an open suitcase with clothes stuffed in'], 'photo-frame': ['director', 'a framed photo (text caption)'],
    'usb-drive': ['director', 'a small USB drive'], 'lotus-hairclip': ['director', "Mai's lotus-shaped plastic hairclip"],
    'black-ledger': ['director', "Bảo's black-covered ledger (sổ chi)"], gondola: ['director', 'the window-cleaning cradle on the bank facade, drawn for the scene'],
    'tv-news': ['director', 'a TV showing a news bulletin (text lines: headline and strap)'], gurney: ['director', 'an empty hospital gurney'],
    'medical-tray': ['director', 'a steel tray with gauze and a covered dish'], oranges: ['director', 'a plastic bag of oranges'],
  },
  fx: { 'torch-sweep': ['director', 'a torch beam sweeping across glass from inside a building (c8-m4)'] },
  sfx: {
    doorbell: ['audio', 'an apartment doorbell'], 'cai-luong-live': ['audio', 'a live cải lương orchestra: đàn, trống, chập chõa'],
    'wind-howl': ['audio', 'wind howling around a high-rise facade'], 'footsteps-leather': ['audio', 'leather shoes pacing on carpet'],
    'tv-off': ['audio', 'a CRT-style click as a TV switches off'],
  },
};

export const chapter = defineChapter({
  chapter: 8,
  missions: [c8m1, c8m2, c8m3, c8m4],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, questions: QUESTIONS, interrogations: INTERROGATIONS, places: PLACES,
  text: TEXT,
});
