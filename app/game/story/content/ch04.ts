import {
  defineChapter, defineMission, type Act, type Behaviour, type BoardCard, type BoardDef, type CastDef, type Cond, type EvidenceDef, type JournalDef, type Line,
  type QuestionDef, type SubDef, type WorldPolicy,
} from '../types.ts';
import type { ContractEntry, ContractKind } from '../contract.ts';
import { BOARD_CARDS as CH1_CARDS } from './ch01.ts';
import { BOARD_CARDS as CH2_CARDS, BOARD_LINKS as CH2_LINKS } from './ch02.ts';
import { BOARD_CARDS as CH3_CARDS, BOARD_LINKS as CH3_LINKS } from './ch03.ts';
import { TEXT } from '../text/vi/ch04.ts';

/**
 * Chương 4 · NGƯỜI TUYỂN DỤNG (story-final.md ch.4 with story-decisions.md 5, 14, 19, 22): c4-m1 a lunch order of
 * five cơm tấm is the shipper's cover into VIỆC LÀM ÁNH DƯƠNG (NHÀ SỐ 46 Chợ Cũ): eavesdrop on Diễm's call, then,
 * while Ông Tư keeps the secretary on the desk phone (Tín texts him from the burner), 25 s to photograph three
 * ledger pages; one bluff saves him, a second catch is a retry. c4-m2 at 04:20 the third page holds his sister's
 * name (CS04, first half, Má's split-screen call), a dawn race to BẾN XE AN HÒA, Mai's braid vanishing into the
 * white van, a keep-up chase with no ramming, and the designed failure: alongside at the Nguyễn Huệ junction the
 * slow-motion T-bone (CS04, second half). c4-m3 the hospital, the walk (or a xe ôm) home in the rain, Má's photo of
 * the debt notice, the first BẢNG MANH MỐI ("PHƯỢNG LÀ AI?" and the lead: Quang's {@code}-04 night orders) and
 * the chalk wall: '40.000.000' wiped, 'MAI' written, Ông Tư on the stairs. The three missions chain.
 * Places are story/sites.ts ids, the chapter places below, or anchors of the spaces 'anh-duong-office' and
 * 'hospital-ward' (ANCHORS) and of chapter 1's 'attic'; texts are '@keys' of text/vi/ch04.ts. Register in
 * content/index.ts LOADERS: `4: () => import('./ch04.ts'),`.
 *
 * Engine ids used here: from story/contract.ts the vehicles 'dream', 'coach', templates 'resident', 'watchdog',
 * the cover 'shipper', meters 'cover:shipper', 'eavesdrop:diem-goi', 'tail:van-mai', ops 'appOrder', 'gps' (args
 * gain `reverse`), 'bike' (look gains 'wrecked') and the planned 'chase' (controller 'keepUp', chase-wanted.md §5.3).
 * Everything else this chapter needs is listed in CONTRACT_REQUESTS below (one line each for story/contract.ts).
 * The case board places the cards of chapters 1–2 (their BOARD_CARDS / BOARD_LINKS) beside this chapter's.
 */

const H = Math.PI / 2;
const NO_HUB: WorldPolicy['activities'] = { gunStore: false, bank: false, deck: false, boatRental: false, sideJobs: false, orders: false };
const say = (who: string, key: string, o: Omit<Line, 'who' | 'text'> = {}): Line => ({ who, text: `@${key}`, ...o });
const think = (key: string): Line => say('tin', key, { voice: 'think' });
const talk = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines });
const aside = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines, mode: 'ambient' });
const hint = (key: string, ms = 6000): Act => ({ k: 'hint', text: `@${key}`, ms });
const bark = (actor: string, key: string, shout = false): Act => ({ k: 'bark', actor, text: `@${key}`, shout });
const reach = (at: string, r = 3): Cond => ({ k: 'reach', at, r });
const used = (id: string): Cond => ({ k: 'on', ev: 'interact', id });
const owned = (id: string): Cond => ({ k: 'evidence', id });
const after = (seconds: number): Cond => ({ k: 'after', seconds });
const chose = (choice: string, option: string): Cond => ({ k: 'flag', name: `choice:${choice}`, eq: option });
/** Teleport unless the player is already there on that surface `level` (null: the ground; see content/ch01.ts). */
const put = (at: string, vehicle?: string, r = 8, level: string | null = null): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });

// ---- c4-m1 · Cơm trưa cho văn phòng Ánh Dương ------------------------------------------------------------------

const OFFICE = (anchor: string) => `anh-duong-office/${anchor}`;
/** The secretary at the front desk: a non-hostile watcher whose cone covers the corridor to the back office. */
const SECRETARY_POST: Behaviour = { k: 'guard', post: OFFICE('desk'), sweep: 50 };
const SECRETARY: Act = { k: 'spawn', id: 'thu-ky', cast: 'thu-ky', template: 'secretary', at: OFFICE('desk'), team: 'neutral', tags: ['staff'], behaviour: SECRETARY_POST };
const DIEM: Act = { k: 'spawn', id: 'diem', cast: 'diem', at: OFFICE('backOffice'), team: 'neutral', tags: ['staff'], behaviour: { k: 'act', name: 'talk-phone' } };
const ARENA: Act = {
  k: 'stealth', arena: 'anh-duong', cover: 'shipper',
  rules: { takedowns: false, guns: 'none', lethal: 'fail', failOn: [], showCones: 'always', countConscience: false, respawn: 'checkpoint' },
};
/** Seen by the secretary in the corridor or the back office (the waiting room is public: being seen there is fine). */
const caught: Cond = { k: 'all', of: [{ k: 'actor', id: 'thu-ky', sees: true }, { k: 'any', of: [reach(OFFICE('backOffice'), 3.2), reach(OFFICE('corridor'), 1.8)] }] };
const bluffed: Cond = { k: 'var', name: 'bluffed', op: '==', value: true };
/** A second catch, with a 2 s grace after a step entry so the glance that was just bluffed cannot count twice. */
const caughtAgain: Cond = { k: 'all', of: [caught, bluffed, after(2)] };
const firstCatch: Cond = { k: 'all', of: [caught, { k: 'not', c: bluffed }] };
const PAGES: [string, string, string][] = [['so-trang-1', 'ledgerL', 'ev-so-trang-1'], ['so-trang-2', 'ledgerR', 'ev-so-trang-2'], ['so-trang-3', 'clipboard', 'ev-so-trang-3']];
const allPages: Cond = { k: 'all', of: PAGES.map(([, , ev]) => owned(ev)) };
const timeUp: Cond = { k: 'on', ev: 'timer', id: 'cua-so', scope: 'mission' };

const c4m1 = defineMission({
  id: 'c4-m1', meta: { hours: [10, 14], giver: 'app' }, chain: 'c4-m2', lethal: 'fail',
  start: { at: 'cafe-co-ba.pickup', yaw: H, vehicle: 'dream', hour: 11.67, weather: 'clear', lunar: 4, outfit: 'tin-shipper' },
  world: { traffic: 'normal', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 11.67, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  // Ông Tư's call ends: she hangs up and turns back to the corridor (unless Tín made it back first: 'ra-ngoai' stops the timer)
  watchers: [{ id: 'cup-may', when: timeUp, do: [{ k: 'behave', id: 'thu-ky', b: SECRETARY_POST }, aside('c4m1-cup-may', [say('thu-ky', 'c4m1.cupMay')])] }],
  optional: [
    { id: 'bang-anh', text: '@c4m1.opt.bangAnh', when: owned('ev-bang-anh'), reward: [aside('c4m1-hoa', [think('c4m1.think.hoa1'), think('c4m1.think.hoa2')])] },
    { id: 'khung-hinh', text: '@c4m1.opt.khungHinh', when: owned('ev-khung-hinh'), reward: [aside('c4m1-su', [think('c4m1.think.su')])] },
  ],
  steps: [
    {
      id: 'trua', minutes: 0.3,
      enter: [
        { k: 'title', kind: 'time', text: '@c4m1.title', sub: '@c4m1.titleSub' },
        { k: 'toast', text: '@c4m1.toast.don' },
        { k: 'do', op: 'appOrder', args: { id: 'don-1446', state: 'active', title: '@c4m1.order', from: 'ch4.quan-com', to: 'anh-duong', fee: 25, customer: '@c4m1.order.khach' } },
        aside('c4m1-ten', [think('c4m1.think.ten1'), think('c4m1.think.ten2')]),
      ],
    },
    {
      id: 'lay-com', minutes: 0.9, objective: '@c4m1.obj.layCom', marker: { at: 'ch4.quan-com', label: '@c4m1.mk.quanCom', style: 'go' },
      interact: [{ id: 'lay-com', at: 'ch4.quan-com', r: 2.5, prompt: '@c4m1.int.lay', kind: 'pick', when: 'foot' }],
      enter: [{ k: 'spawn', id: 'co-com', cast: 'co-com', template: 'resident', at: 'ch4.quan-com', team: 'neutral', behaviour: { k: 'act', name: 'serve' } }],
      done: used('lay-com'),
      exit: [{ k: 'player', carry: 'order-com' }, aside('c4m1-com', [say('co-com', 'c4m1.com1'), say('tin', 'c4m1.com2'), say('co-com', 'c4m1.com3')])],
    },
    {
      id: 'toi-noi', minutes: 0.8, objective: '@c4m1.obj.toiNoi', marker: { at: 'anh-duong', label: '@c4m1.mk.anhDuong', style: 'go' },
      watchers: [{ when: reach('anh-duong', 25), do: [aside('c4m1-bang-hieu', [think('c4m1.think.bang1'), think('c4m1.think.bang2')])] }],
      done: reach('anh-duong', 6),
    },
    {
      id: 'vao', minutes: 0.3, objective: '@c4m1.obj.vao',
      checkpoint: { label: '@c4m1.cp.cua', setup: [put('anh-duong', undefined, 6), { k: 'player', carry: 'order-com' }, ARENA, SECRETARY, DIEM] },
      interact: [{ id: 'vao', at: 'anh-duong', r: 2.2, prompt: '@c4m1.int.vao', kind: 'enter', when: 'foot' }],
      done: used('vao'),
      exit: [{ k: 'space', enter: 'anh-duong-office', link: 'front' }],
    },
    {
      id: 'giao-com', minutes: 0.5, objective: '@c4m1.obj.giao', hud: { cover: true },
      meters: [{ id: 'cover:shipper', label: '@c4m1.meter.cover', kind: 'bar', max: 1 }],
      interact: [{ id: 'giao-com', at: OFFICE('desk'), r: 1.8, prompt: '@c4m1.int.giao', kind: 'use', when: 'foot' }],
      enter: [hint('c4m1.hint.voBoc', 7000)],
      done: used('giao-com'),
      // the order is handed over, the cover stays: a shipper waiting to be paid
      exit: [{ k: 'player', carry: null, cover: 'shipper' }, talk('c4m1-giao', [say('thu-ky', 'c4m1.tk1'), say('thu-ky', 'c4m1.tk2'), say('tin', 'c4m1.tin1')])],
    },
    {
      id: 'nghe-len', minutes: 1.3, objective: '@c4m1.obj.nghe', hud: { cover: true }, marker: { at: OFFICE('cooler'), label: '@c4m1.mk.binhNuoc', style: 'subtle' },
      meters: [{ id: 'eavesdrop:diem-goi', label: '@c4m1.meter.nghe', kind: 'bar', max: 1 }, { id: 'cover:shipper', label: '@c4m1.meter.cover', kind: 'bar', max: 1 }],
      subs: [{ id: 'nghe', text: '@c4m1.sub.nghe', done: { k: 'on', ev: 'eavesdrop', id: 'diem-goi' } }],
      enter: [
        { k: 'eavesdrop', id: 'diem-goi', source: 'diem', r: 4.5, seconds: 14, lines: [say('diem', 'c4m1.nghe1'), say('diem', 'c4m1.nghe2'), say('diem', 'c4m1.nghe3'), say('diem', 'c4m1.nghe4')] },
        { k: 'clue', id: 'bang-anh', at: OFFICE('photoBoard'), r: 1.6, evidence: 'ev-bang-anh', examine: 'board:anh-duong-photos', scope: 'mission' },
        hint('c4m1.hint.nghe', 8000),
      ],
      watchers: [
        { when: after(10), do: [hint('c4m1.hint.bangAnh', 7000)] },
        { id: 'nghi', when: { k: 'meter', id: 'cover:shipper', op: '>=', value: 0.6 }, once: false, cooldown: 12, do: [bark('thu-ky', 'c4m1.bark.ngoi')] },
      ],
      fail: [{ when: { k: 'meter', id: 'cover:shipper', op: '>=', value: 1 }, reason: '@c4m1.fail.voBoc', soft: true }],
      retry: [{ k: 'teleport', at: OFFICE('cooler') }, { k: 'player', cover: 'shipper' }],
    },
    {
      // CS: the damning half of the call through the door gap, then Diễm goes upstairs: the back office is empty
      id: 'diem-goi', minutes: 0.5,
      enter: [
        { k: 'cutscene', id: 'c4m1-diem-goi' }, { k: 'despawn', id: 'diem' },
        { k: 'evidence', id: 'ev-diem-goi' }, { k: 'journal', id: 'j-diem' },
        aside('c4m1-trong', [think('c4m1.think.trong')]),
      ],
    },
    {
      id: 'nhan-tu', minutes: 0.5, objective: '@c4m1.obj.nhan', hud: { cover: true }, marker: { at: OFFICE('flyer'), style: 'subtle' },
      checkpoint: { label: '@c4m1.cp.phongCho', setup: [put(OFFICE('flyer'), undefined, 2.5), ARENA, SECRETARY, { k: 'player', carry: null, cover: 'shipper' }] },
      interact: [{ id: 'nhan-tu', at: OFFICE('flyer'), r: 1.6, prompt: '@c4m1.int.nhan', kind: 'use', when: 'foot' }],
      enter: [hint('c4m1.hint.nhan', 8000)],
      done: used('nhan-tu'),
      exit: [
        { k: 'choice', id: 'nhanTu', prompt: '@c4m1.q.nhan', style: 'sms', options: [{ id: 'chau', text: '@c4m1.opt.chau' }, { id: 'nhanh', text: '@c4m1.opt.nhanh' }] },
        { k: 'if', c: chose('nhanTu', 'nhanh'), then: [{ k: 'sms', from: 'tu', text: '@c4m1.sms.tu2', burner: true }], else: [{ k: 'sms', from: 'tu', text: '@c4m1.sms.tu1', burner: true }] },
        { k: 'wait', seconds: 2 },
        // the desk phone rings: she turns her back to the corridor and talks to a "grandfather" for about 25 s
        { k: 'behave', id: 'thu-ky', b: { k: 'act', name: 'answer-phone' } },
        aside('c4m1-dien-thoai', [say('thu-ky', 'c4m1.dt1'), say('thu-ky', 'c4m1.dt2'), say('thu-ky', 'c4m1.dt3'), say('thu-ky', 'c4m1.dt4'), say('thu-ky', 'c4m1.dt5')]),
        { k: 'timer', id: 'cua-so', seconds: 25, label: '@c4m1.timer' },
        hint('c4m1.hint.cuaSo', 6000),
      ],
    },
    {
      id: 'chup-so', minutes: 0.8, next: 'ra-ngoai', objective: '@c4m1.obj.chup', hud: { cover: true, noise: true }, marker: { at: OFFICE('backOffice'), style: 'subtle' },
      subs: PAGES.map(([id, , ev], i): SubDef => ({ id, text: `@c4m1.sub.trang${i + 1}`, done: owned(ev) })),
      enter: [
        ...PAGES.map(([id, anchor, evidence]): Act => ({ k: 'photoTarget', id, subject: OFFICE(anchor), evidence, minQuality: 0.55 })),
        { k: 'clue', id: 'khung-hinh', at: OFFICE('frame'), r: 1.4, evidence: 'ev-khung-hinh', examine: 'object:diem-frame', scope: 'mission' },
      ],
      branch: [{ when: firstCatch, goto: 'bi-hoi' }],
      fail: [
        { when: caughtAgain, reason: '@c4m1.fail.lanHai' },
        { when: timeUp, reason: '@c4m1.fail.cupMay' },
      ],
      exit: [hint('c4m1.hint.raNgoai', 5000)],
    },
    {
      // caught once: the bluff (stealth-player-kit.md §8.3, authored here); a right answer sends her back to the phone
      id: 'bi-hoi', minutes: 0.2,
      enter: [
        { k: 'choice', id: 'biHoi', prompt: '@c4m1.q.biHoi', style: 'bluff', timeout: 5, default: 'im', options: [
          { id: 'wc', text: '@c4m1.opt.wc', then: [{ k: 'var', name: 'bluffed', value: true }] },
          { id: 'tien', text: '@c4m1.opt.tien', then: [{ k: 'fail', reason: '@c4m1.fail.chuiLo' }] },
          { id: 'im', text: '@c4m1.opt.im', then: [{ k: 'fail', reason: '@c4m1.fail.chuiLo' }] }] },
        talk('c4m1-bi-hoi', [say('thu-ky', 'c4m1.bh1'), say('tin', 'c4m1.bh2')]),
        { k: 'behave', id: 'thu-ky', b: { k: 'act', name: 'answer-phone' } },
        aside('c4m1-bi-hoi-2', [say('thu-ky', 'c4m1.bh3')]),
        { k: 'if', c: allPages, then: [{ k: 'goto', step: 'ra-ngoai' }], else: [{ k: 'goto', step: 'chup-so' }] },
      ],
    },
    {
      id: 'ra-ngoai', minutes: 0.3, objective: '@c4m1.obj.raNgoai', hud: { cover: true, noise: true }, marker: { at: OFFICE('cooler'), label: '@c4m1.mk.binhNuoc', style: 'go' },
      branch: [{ when: firstCatch, goto: 'bi-hoi' }],
      fail: [{ when: caughtAgain, reason: '@c4m1.fail.lanHai' }],
      done: reach(OFFICE('cooler'), 2.2),
      exit: [
        { k: 'if', c: timeUp, then: [], else: [{ k: 'stopTimer', id: 'cua-so' }, { k: 'behave', id: 'thu-ky', b: SECRETARY_POST }, aside('c4m1-cup-may-2', [say('thu-ky', 'c4m1.cupMay')])] },
        { k: 'flag', name: 'sawLedger' },
      ],
    },
    {
      id: 'tien-ra', minutes: 0.6,
      enter: [
        { k: 'cutscene', id: 'c4m1-tien-ra' },
        { k: 'stealth', arena: null }, { k: 'player', cover: null },
        { k: 'space', leave: 'anh-duong' },
        { k: 'do', op: 'appOrder', args: { id: 'don-1446', state: 'done' } }, { k: 'cash', n: 25 },
        { k: 'cash', n: 25 }, { k: 'toast', text: '@c4m1.toast.tip' },
        { k: 'journal', id: 'j-anh-duong' },
        talk('c4m1-cuoi', [think('c4m1.think.cuoi1'), think('c4m1.think.cuoi2')]),
        { k: 'sms', from: 'tu', text: '@c4m1.sms.tu3', burner: true },
      ],
    },
  ],
  medals: { par: 420, ghost: true, clues: ['bang-anh', 'khung-hinh'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight'], items: { burner: 1 } },
});

// ---- c4-m2 · Tấm ảnh trong sổ --------------------------------------------------------------------------------

/** The coach at the shelter and the white van that takes Mai (decision 19: it waits in the eastbound curb lane across from the coach). */
const COACH: Act = { k: 'vehicle', id: 'xe-do', model: 'coach', at: 'ben-xe-an-hoa.coach', yaw: -H, state: 'park' };
const VAN_PARKED: Act = { k: 'vehicle', id: 'van-mai', model: 'white-van', at: 'ben-xe-an-hoa.van', yaw: H, state: 'park' };
const c4m2 = defineMission({
  id: 'c4-m2', meta: { hours: [3, 6], giver: 'tin' }, chain: 'c4-m3',
  start: { space: 'attic', at: 'attic/mattress', hour: 4.33, weather: 'rain', lunar: 5, outfit: 'tin-shipper' },
  world: { traffic: 'light', crowd: 'thin', police: 'story', gangs: 'calm', clock: { hour: 4.33, freeze: true }, weather: { set: 'rain', lock: true }, activities: NO_HUB },
  // mission-wide, so a skipped race still finds them at the coach stop (c4m2-ben-xe frames vehicle:van-mai)
  setup: [COACH, VAN_PARKED],
  steps: [
    {
      id: 'bon-gio', minutes: 0.4, objective: '@c4m2.obj.anh',
      interact: [{ id: 'coi-anh', at: 'attic/desk', r: 1.5, prompt: '@c4m2.int.anh', kind: 'use' }],
      enter: [{ k: 'title', kind: 'time', text: '@c4m2.title', sub: '@c4m2.titleSub' }, aside('c4m2-thuc', [think('c4m2.think.thuc1'), think('c4m2.think.thuc2')])],
      done: used('coi-anh'),
    },
    {
      // the phone's photo viewer on page 3 (phone-detective-ui.md §3.5): zoom ≥ ×2 over Mai's line and press E
      id: 'trang-ba', minutes: 1.1, objective: '@c4m2.obj.trangBa',
      enter: [
        hint('c4m2.hint.zoom', 8000),
        { k: 'do', op: 'photoExamine', args: { photo: 'ev-so-trang-3', hotspot: 'mai', label: '@c4m2.examine' }, wait: true },
        { k: 'evidence', id: 'ev-so-mai' },
        { k: 'cutscene', id: 'cs04_anh_hai' },
        { k: 'journal', id: 'j-mai-di' },
        // out of the attic onto the Dream in front of the café (the cutscene's handoff), so the race checkpoint is on the map
        { k: 'space', leave: 'cafe-co-ba.pickup' },
      ],
    },
    {
      id: 'chay', minutes: 1.4, objective: '@c4m2.obj.chay', marker: { at: 'ben-xe-an-hoa', label: '@c4m2.mk.benXe', style: 'go' },
      checkpoint: { label: '@c4m2.cp.chay', setup: [
        { k: 'teleport', at: 'cafe-co-ba.pickup', yaw: -H, vehicle: 'dream' }, { k: 'time', hour: 4.97 }] },
      // from the café (-32, 7) as the bible has it: about 150 m of wet road (r-ve-nha run backwards), some 20 s on the Dream,
      // so the bible's 1:45 (written for a larger map) becomes 40 s: a race, not a stroll. The clock is frozen at 04:58
      // (Má called at 04:51, the phone read 04:58 as he left): two minutes to a 05:00 van, and he gets there seconds late
      timer: { seconds: 40, label: '@c4m2.timer' },
      enter: [{ k: 'do', op: 'gps', args: { route: 'r-ve-nha', reverse: true } }, { k: 'music', id: 'pulse' }, hint('c4m2.hint.duongUot', 6000)],
      watchers: [
        { when: after(12), do: [aside('c4m2-chay', [think('c4m2.think.chay1')])] },
        { when: reach('ben-xe-an-hoa', 45), do: [aside('c4m2-chay-2', [think('c4m2.think.chay2')])] },
      ],
      done: reach('ben-xe-an-hoa', 14),
      fail: [{ when: { k: 'on', ev: 'timer', id: 'chay' }, reason: '@c4m2.fail.tre', allowSkipAfter: 3, skipTo: 'ben-xe' }],
      exit: [{ k: 'do', op: 'gps', args: { route: null } }],
    },
    { id: 'ben-xe', minutes: 0.4, enter: [{ k: 'cutscene', id: 'c4m2-ben-xe' }] },
    {
      id: 'duoi-theo', minutes: 2, objective: '@c4m2.obj.duoi',
      checkpoint: { label: '@c4m2.cp.duoi', setup: [
        { k: 'teleport', at: 'ch4.ben-xe-dream', yaw: H, vehicle: 'dream' }, { k: 'time', hour: 5 },
        { k: 'vehicle', id: 'van-mai', model: 'white-van', at: 'ben-xe-an-hoa.van', yaw: H, route: 'r-xe-tai-trang', cruise: 13, obeyLights: false, state: 'drive' },
        // KeepUp: a rubber band that keeps the van catchable, runs ambers, never stops; alongside window 40–15 m before the junction
        { k: 'do', op: 'chase', args: { id: 'van-mai', controller: 'keepUp', ride: 'van-mai', target: 'player', want: 22, floor: 8, ceil: 15.5, window: { at: 'nga-tu-216-54', from: 40, to: 15 } } },
        { k: 'tail', target: 'van-mai', band: [8, 45], lose: { far: 110, seconds: 10 }, knownFace: true },
        { k: 'music', id: 'pulse' }] },
      meters: [{ id: 'tail:van-mai', label: '@c4m2.meter', kind: 'band' }],
      enter: [hint('c4m2.hint.khongTong', 7000)],
      watchers: [
        { when: after(5), do: [aside('c4m2-duoi-1', [think('c4m2.think.duoi1')])] },
        { when: { k: 'vehicle', id: 'van-mai', at: 'nga-tu-216-54', r: 70 }, do: [hint('c4m2.hint.apSat', 6000), aside('c4m2-duoi-2', [think('c4m2.think.duoi2')])] },
      ],
      // the designed failure: alongside in the junction window (or at least close when the van gets there) plays the crash
      done: { k: 'any', of: [
        { k: 'all', of: [{ k: 'vehicle', id: 'van-mai', at: 'nga-tu-216-54', r: 45 }, { k: 'near', a: 'player', b: 'van-mai', r: 4 }] },
        { k: 'all', of: [{ k: 'on', ev: 'arrived', id: 'van-mai' }, { k: 'near', a: 'player', b: 'van-mai', r: 30 }] }] },
      fail: [
        { when: { k: 'on', ev: 'signal', id: 'rammed' }, reason: '@c4m2.fail.tong', allowSkipAfter: 3, skipTo: 'tong-xe' },
        { when: { k: 'on', ev: 'lost', id: 'van-mai' }, reason: '@c4m2.fail.mat', allowSkipAfter: 3, skipTo: 'tong-xe' },
      ],
    },
    {
      id: 'tong-xe', minutes: 0.6,
      enter: [
        { k: 'cutscene', id: 'cs04_anh_hai_xe' },
        { k: 'stop', id: 'van-mai' }, { k: 'music', id: null },
        { k: 'do', op: 'bike', args: { id: 'dream', look: 'wrecked' } }, { k: 'flag', name: 'dreamWrecked' },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'maiTaken' }],
  medals: { par: 330 },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight'], flags: { sawLedger: true }, evidence: ['ev-diem-goi', 'ev-so-trang-1', 'ev-so-trang-2', 'ev-so-trang-3'] },
});

// ---- c4-m3 · Mưa trên gác xép --------------------------------------------------------------------------------

const HURT: Act = { k: 'player', outfit: 'tin-bandaged', lock: ['run', 'vehicle'], pose: 'limp' };
const c4m3 = defineMission({
  id: 'c4-m3', meta: { hours: [17, 23], giver: 'tin' },
  start: { space: 'hospital-ward', at: 'hospital-ward/bay3', hour: 18.67, weather: 'rain', lunar: 5, outfit: 'tin-bandaged' },
  world: { traffic: 'normal', crowd: 'thin', police: 'story', gangs: 'calm', clock: { hour: 18.67, freeze: true }, weather: { set: 'rain', lock: true }, activities: NO_HUB },
  steps: [
    {
      id: 'tinh-day', minutes: 0.7,
      enter: [
        { k: 'title', kind: 'time', text: '@c4m3.title', sub: '@c4m3.titleSub' },
        { k: 'cutscene', id: 'c4m3-benh-vien' },
        { k: 'evidence', id: 'ev-xe-trang' }, HURT,
        aside('c4m3-day', [think('c4m3.think.day')]),
      ],
    },
    {
      id: 'roi-vien', minutes: 0.4, objective: '@c4m3.obj.roiVien', marker: { at: 'hospital-ward/stairs', style: 'go' },
      interact: [{ id: 'cau-thang', at: 'hospital-ward/stairs', r: 1.6, prompt: '@c4m3.int.cauThang', kind: 'enter', when: 'foot' }],
      done: used('cau-thang'),
      exit: [{ k: 'space', leave: 'benh-vien' }],
    },
    {
      id: 've-nha', minutes: 0.2, next: 'di-bo',
      enter: [{ k: 'choice', id: 'veNha', prompt: '@c4m3.q.veNha', options: [{ id: 'bo', text: '@c4m3.opt.bo' }, { id: 'xeom', text: '@c4m3.opt.xeom' }] }],
      branch: [{ when: chose('veNha', 'xeom'), goto: 'xe-om' }],
    },
    {
      id: 'di-bo', minutes: 1.3, objective: '@c4m3.obj.diBo', marker: { at: 'cafe-co-ba.backStairs', label: '@c4m3.mk.nha', style: 'go' }, next: 'len-gac',
      checkpoint: { label: '@c4m3.cp.mua', setup: [put('benh-vien', undefined, 8), HURT] },
      watchers: [
        { when: after(10), do: [aside('c4m3-mua-1', [think('c4m3.think.mua1')])] },
        { when: after(30), do: [{ k: 'sms', from: 'coba', text: '@c4m3.sms.coba' }] },
        { when: after(50), do: [aside('c4m3-mua-2', [think('c4m3.think.mua2')])] },
      ],
      done: reach('cafe-co-ba.backStairs', 3),
    },
    {
      // the street-life xe ôm through the passenger API (story-decisions.md §7, benh-vien.xeom)
      id: 'xe-om', minutes: 1, objective: '@c4m3.obj.xeOm', marker: { at: 'benh-vien.xeom', label: '@c4m3.mk.xeOm', style: 'talk' }, next: 'len-gac',
      checkpoint: { label: '@c4m3.cp.xeOm', setup: [
        put('benh-vien', undefined, 8), HURT,
        { k: 'spawn', id: 'xe-om', cast: 'xe-om', template: 'resident', at: 'benh-vien.xeom', team: 'neutral', tags: ['civilian'], behaviour: { k: 'act', name: 'sit-stool-phone' } }] },
      interact: [{ id: 'goi-xe-om', at: 'benh-vien.xeom', r: 2, prompt: '@c4m3.int.xeOm', kind: 'talk', when: 'foot' }],
      subs: [
        { id: 'don', text: '@c4m3.sub.don', done: used('goi-xe-om') },
        { id: 've', text: '@c4m3.sub.ve', done: { k: 'on', ev: 'alight' } },
      ],
      watchers: [{ when: used('goi-xe-om'), do: [
        { k: 'cash', n: -20 }, { k: 'ride', mode: 'xeom', to: 'cafe-co-ba.backDoor', driver: 'xe-om' },
        aside('c4m3-xe-om', [say('xe-om', 'c4m3.xo1'), say('tin', 'c4m3.xo2'), say('xe-om', 'c4m3.xo3'), say('xe-om', 'c4m3.xo4')])] }],
    },
    {
      id: 'len-gac', minutes: 0.3, objective: '@c4m3.obj.lenGac', marker: { at: 'cafe-co-ba.backStairs', style: 'go' },
      checkpoint: { label: '@c4m3.cp.gac', setup: [
        put('cafe-co-ba.backStairs', undefined, 4), HURT,
        { k: 'spawn', id: 'muc', template: 'watchdog', at: 'cafe-co-ba.backStairs', team: 'neutral', behaviour: { k: 'act', name: 'sleep' } }] },
      interact: [{ id: 'len-gac', at: 'cafe-co-ba.backStairs', r: 1.8, prompt: '@c4m3.int.lenGac', kind: 'enter', when: 'foot' }],
      enter: [aside('c4m3-muc', [think('c4m3.think.muc')])],
      done: used('len-gac'),
      exit: [{ k: 'space', enter: 'attic', link: 'stairs' }, { k: 'player', pose: null }],
    },
    {
      id: 'giay-no', minutes: 0.4,
      enter: [
        aside('c4m3-tuong', [think('c4m3.think.tuong')]),
        { k: 'choice', id: 'nhanMa', prompt: '@c4m3.q.nhanMa', style: 'sms', options: [{ id: 'thang', text: '@c4m3.opt.thang' }, { id: 'nhe', text: '@c4m3.opt.nhe' }] },
        { k: 'if', c: chose('nhanMa', 'nhe'), then: [{ k: 'sms', from: 'bana', text: '@c4m3.sms.ma2' }], else: [{ k: 'sms', from: 'bana', text: '@c4m3.sms.ma1' }] },
        { k: 'sms', from: 'bana', text: '@c4m3.sms.ma3' },
        { k: 'evidence', id: 'ev-giay-no' },
      ],
    },
    {
      id: 'bang', minutes: 1.3, objective: '@c4m3.obj.bang', marker: { at: 'attic/wall', style: 'subtle' },
      checkpoint: { label: '@c4m3.cp.bang', setup: [put('attic/wall', undefined, 2.5), { k: 'player', outfit: 'tin-bandaged', lock: null, pose: null }] },
      interact: [{ id: 'bang', at: 'attic/wall', r: 1.6, prompt: '@c4m3.int.bang', kind: 'use' }],
      enter: [hint('c4m3.hint.bang', 9000)],
      done: used('bang'),
      // the board session, then its question (PHƯỢNG LÀ AI? → the lead), both blocking until done
      exit: [{ k: 'board', id: 'bang-ch4' }, talk('c4m3-sau-bang', [think('c4m3.think.quang1'), think('c4m3.think.quang2')])],
    },
    { id: 'chu-mai', minutes: 0.6, enter: [{ k: 'player', lock: null, pose: null }, { k: 'cutscene', id: 'c4m3-chu-mai' }, { k: 'journal', id: 'j-di-san' }] },
  ],
  rewards: [{ k: 'flag', name: 'hunter' }],
  medals: { par: 300 },
  replay: {
    abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight'], flags: { sawLedger: true, maiTaken: true, dreamWrecked: true },
    evidence: [...CH1_CARDS, ...CH2_CARDS, ...CH3_CARDS].map((c) => c.id).concat(['ev-diem-goi', 'ev-so-trang-1', 'ev-so-trang-2', 'ev-so-trang-3', 'ev-so-mai']),
  },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string = id, role = false): CastDef =>
  ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look, ...(role ? { role: `@cast.${id}.role` } : {}) });
export const CAST: CastDef[] = [
  person('diem', '#e88aa8', 'D', 'diem', true), person('thu-ky', '#9fb5c9', 'T', 'secretary'),
  person('co-com', '#c9a27a', 'C', 'vendor-woman'), person('xe-om', '#8f9a7a', 'X', 'xeom'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 4, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-bang-anh', 'photo', 'bangAnh', 'photos', ['anh-duong', 'hoa']),
  ev('ev-diem-goi', 'testimony', 'diemGoi', 'phone', ['anh-duong', 'diem', 'phuong', 'mai']),
  ev('ev-so-trang-1', 'photo', 'soTrang1', 'ledger', ['anh-duong', 'ledger', 'debt']),
  ev('ev-so-trang-2', 'photo', 'soTrang2', 'ledger', ['anh-duong', 'ledger', 'van', 'kho-7']),
  ev('ev-so-trang-3', 'photo', 'soTrang3', 'ledger', ['anh-duong', 'ledger']),
  ev('ev-khung-hinh', 'object', 'khungHinh', 'frame', ['diem', 'mai-am']),
  ev('ev-so-mai', 'document', 'soMai', 'ledger', ['anh-duong', 'ledger', 'mai']),
  ev('ev-xe-trang', 'testimony', 'xeTrang', 'plate', ['van', 'mai', 'cuong'], '51B-217.07'),
  ev('ev-giay-no', 'photo', 'giayNo', 'notice', ['debt', 'sen-vang']),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [
  note('j-anh-duong', 'places', 'anhDuong'), note('j-diem', 'people', 'diem'), note('j-mai-di', 'diary', 'maiDi'),
  note('j-phuong-la-ai', 'notes', 'phuongLaAi'), note('j-dau-moi', 'notes', 'dauMoi'), note('j-di-san', 'diary', 'diSan'),
];

/**
 * BẢNG MANH MỐI, the first board (c4-m3): the cards of chapters 1–3 in their lotus slots plus this chapter's five.
 * Chapters 1–3 fill the 19 slots of the lotus (chapter 3 takes 9 and 13–18; chapter 5 takes 19–22 and 28–33), so
 * these go on a third ring, slots 23–27: the story UI's lotus template needs at least 34 slots once chapter 5's
 * cards join a later board. The strings tie Ánh Dương's ledger to the van plate and KHO 7, Mai's line to the white
 * van, Cường and the debt notice, and Diễm's "chị Phượng" to Cường's; chapter 3's burnt Ánh Dương receipt (the lead
 * that brought Tín to Ánh Dương) ties to the ledger's van schedule. One hypothesis is proven by picking cards.
 * Solved, it opens the question (the lead to chapter 5), whose answer also rests on chapter 3's DO-0417 bag.
 */
export const BOARD_CARDS: BoardCard[] = [
  { id: 'ev-diem-goi', slot: 23 }, { id: 'ev-so-trang-2', slot: 24 }, { id: 'ev-so-mai', slot: 25 }, { id: 'ev-xe-trang', slot: 26 }, { id: 'ev-giay-no', slot: 27 },
];
export const BOARD_LINKS: [string, string][] = [
  ['ev-so-trang-2', 'ev-bien-so'], ['ev-so-trang-2', 'ev-kho-7'], ['ev-so-trang-2', 'ev-xe-trang'],
  ['ev-so-mai', 'ev-xe-trang'], ['ev-so-mai', 'ev-giay-no'], ['ev-so-mai', 'ev-diem-goi'],
  ['ev-xe-trang', 'ev-cuong-seo'], ['ev-diem-goi', 'ev-chi-phuong'], ['ev-giay-no', 'ev-the-sen-vang'],
];
export const BOARDS: BoardDef[] = [{
  id: 'bang-ch4', title: '@board.ch4.t',
  cards: [...CH1_CARDS, ...CH2_CARDS, ...CH3_CARDS, ...BOARD_CARDS],
  links: [...CH2_LINKS, ...CH3_LINKS, ['ev-hoa-don-anh-duong', 'ev-so-trang-2'], ...BOARD_LINKS],
  hypotheses: [{ id: 'no-thanh-nguoi', text: '@board.ch4.h1', needs: ['ev-giay-no', 'ev-so-mai', 'ev-diem-goi'], hint: '@board.ch4.h1.hint' }],
  question: 'dau-moi-phuong',
  reveals: [{ k: 'journal', id: 'j-phuong-la-ai' }, { k: 'flag', name: 'boardCh4' }],
}];
export const QUESTIONS: QuestionDef[] = [{
  id: 'dau-moi-phuong', prompt: '@c4m3.q.dauMoi', answer: 'quang', cost: 1, hint: '@c4m3.q.hint',
  options: [{ id: 'diem', text: '@c4m3.q.diem' }, { id: 'quang', text: '@c4m3.q.quang', needs: ['ev-don-dem-quang', 'ev-tui-cam', 'ev-tui-0417'] }, { id: 'cong-an', text: '@c4m3.q.congAn' }],
  onCorrect: [{ k: 'flag', name: 'leadQuang' }, { k: 'journal', id: 'j-dau-moi' }],
}];

/** Off-map anchors this chapter places things at (see content/ch01.ts ANCHORS): a contract for the level kit. */
export const ANCHORS: Record<string, Record<string, string>> = {
  'anh-duong-office': {
    front: 'street door of VIỆC LÀM ÁNH DƯƠNG, NHÀ SỐ 46 Chợ Cũ (entry link "front"; leaving puts the player on the sidewalk at the door)',
    entry: 'just inside the glass door, a bell above it', waiting: 'plastic chairs along the left wall of the waiting room',
    photoBoard: 'cork board of ID photos stamped "ĐÃ CÓ VIỆC" on the waiting-room wall (optional clue)',
    flyer: 'recruitment flyer with the front-desk number, taped above the water cooler',
    cooler: 'water cooler by the corridor mouth, within 4 m of the back-office door (eavesdrop and waiting spot)',
    desk: 'front desk facing the corridor: the secretary\'s post and the desk phone',
    corridor: 'short corridor from the desk to the back office and the stairs (staff zone)',
    stairs: 'foot of the stairs to the rooms upstairs (Diễm goes up; not walkable for the player)',
    backDoor: 'the half-open door of the back office', backOffice: 'the back office (restricted): Diễm\'s desk, a filing cabinet, a window',
    ledgerL: 'the open ledger on Diễm\'s desk: left page (July recruits)', ledgerR: 'the open ledger: right page (the van schedule)',
    clipboard: 'a clipboard on the desk with a loose sheet "LÔ MIỀN TÂY — THÁNG TÁM"',
    frame: 'a photo frame on the desk: Diễm and a little girl at MÁI ẤM (optional clue)',
  },
  'hospital-ward': {
    stairs: 'stairwell door at the end of the third-floor corridor (entry link "stairs"; leaving goes down to the street door)',
    corridor: 'third-floor corridor outside the bays', doorGlass: 'the glass panel in the door of bay 3, seen from the bed',
    bay3: 'bay 3: Tín\'s bed by the window, the curtain half drawn', bay3Stool: 'plastic stool beside the bed (Cô Ba)',
    window: 'the window of bay 3, rain on the glass (Ông Tư leans here)',
  },
};
/**
 * The chapter's own named points (validated on the map by scripts/story-ch04.test.mjs): the door of QUÁN CƠM DÌ SÁU
 * (building 79, the only "QUÁN CƠM DÌ SÁU · CƠM TẤM SƯỜN BÌ CHẢ" in An Hòa) and the Dream's restart in the eastbound curb lane 24 m
 * behind the van at BẾN XE AN HÒA (a road spot: the chase begins on the carriageway).
 */
export const PLACES = {
  'ch4.quan-com': { x: 27, z: 96.3, yaw: 0, r: 0.3 },
  'ch4.ben-xe-dream': { x: -90, z: -102.6, yaw: H, r: 1 },
};

/**
 * Engine ids this chapter needs beyond story/contract.ts, with the lane that builds each (WAVE1-PLAN §5): the
 * integrator adds them to ENGINE_CONTRACT one line each; scripts/story-ch04.test.mjs lints against the contract
 * plus these and fails on any id that is neither.
 */
export const CONTRACT_REQUESTS: Partial<Record<ContractKind, Record<string, ContractEntry>>> = {
  ops: { photoExamine: ['ui', 'phone photo viewer on an evidence photo {photo, hotspot, label @key}; zoom ≥ ×2 over the hotspot and E resolves it (wait: true; phone-detective-ui.md §3.5)'] },
  signals: { rammed: ['vehicles', 'the player hit the keepUp chase target (impulse > 1.5 m/s, chase-wanted.md §5.3); the target swerves'] },
  models: {
    'white-van': ['vehicles', 'white 16-seat passenger van: sliding door on the right, clear rear window, tinted sides, plate 51B-217.07 sprite, driver + passenger seats (c4-m2)'],
    'suv-den': ['vehicles', 'the existing suv body, black paint, tinted windows (shared with the chapter 3 request; here the CS04 T-bone ride, no plate shown)'],
  },
  templates: { secretary: ['stealth', 'the Ánh Dương secretary: a non-hostile watcher with a vision cone, never fights (director look "secretary")'] },
  arenas: { 'anh-duong': ['stealth', 'Ánh Dương office: waiting room (public), corridor (staff), back office (restricted); shipper cover; the secretary\'s desk cone covers the corridor (c4-m1)'] },
  carry: { 'order-com': ['core', 'delivery: five boxed cơm tấm in a plastic bag'] },
  acts: {
    'answer-phone': ['director', 'turns her back to the room and talks on the desk phone (her cone faces the wall)'],
    'talk-phone': ['director', 'on a mobile call, pacing a little (the talk-phone clip as a loop)'],
  },
  outfits: { 'tin-bandaged': ['core', 'Tín after the crash: scraped, left wrist bandaged in a sling, the windbreaker over his shoulders'] },
  poses: { limp: ['core', 'player limps: walk speed capped at 1.4 m/s, a limp cycle (used with lock run)'] },
  clips: {
    'twirl-pen': ['director', 'one-actor scene clip: twirls a pen while talking on the phone'],
    'palm-glass': ['director', 'one-actor scene clip: presses a palm flat on a window from inside a vehicle (seated)'],
    thrown: ['director', 'one-actor scene clip: thrown from a bike, a tumbling arc that ends lying (no impact frame, no injury shown)'],
    'peel-apple': ['director', 'one-actor scene clip: peels an apple with a small knife, seated'],
  },
  pairClips: { 'hand-on-shoulder': ['director', 'one brushes a hand over the other\'s shoulder (director spec §7.6 pair)'] },
  sceneProps: {
    pen: ['director', 'cutscene-only prop: a ballpoint pen'], apple: ['director', 'cutscene-only prop: an apple and a paring knife'],
    'case-board': ['director', 'cutscene-only prop: the attic wall with pinned cards and red strings in a lotus shape'],
  },
  fx: { 'glass-rain': ['director', 'scene particle: windscreen glass falling slowly like rain (slow motion)'] },
  sfx: {
    'horn-blare': ['audio', 'one-shot scene sound'], 'tire-screech': ['audio', 'one-shot scene sound'], heartbeat: ['audio', 'one-shot scene sound'],
  },
};

export const chapter = defineChapter({
  chapter: 4,
  missions: [c4m1, c4m2, c4m3],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, boards: BOARDS, questions: QUESTIONS, places: PLACES,
  text: TEXT,
});
