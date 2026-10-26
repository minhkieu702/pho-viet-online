import { defineChapter, defineMission, type Act, type BoardCard, type CastDef, type Cond, type EvidenceDef, type FailDef, type JournalDef, type Line, type QuestionDef, type WorldPolicy } from '../types.ts';
import type { ContractEntry, ContractKind } from '../contract.ts';
import { TEXT } from '../text/vi/ch05.ts';

/**
 * Chương 5 · BÓNG TRONG ĐÈN NEON (story-final.md ch.5 with story-decisions.md 4, 7, 9, 14 and §8 "c5-m1 / c5-m2"):
 * c5-m1 dawn at SỬA XE TƯ (the matte-black rebuild, Ông Tư's bug), Cô Ba's porch camera on the café recorder (the
 * CCTV scrub: 03:36 a Rắn Đen rider grabs Quang, 03:41 Quang dials), the "Cuộc gọi đó để làm gì?" deduction, then
 * at night the tail of Quang (scooter → NHÀ THUỐC HẠNH → the strip's back alley → on foot, he knows Tín's face), a bluff
 * past the karaoke receptionist, the staff corridor under sound cover, the VIP door and the first real takedown
 * (drag him into the beer storeroom, check that he breathes) — chained into c5-m2 at 02:00: up the bia hơi downpipe,
 * over the tin roofs and the plank, down into the shared courtyard, the spa's closed back section (bug, floor plan,
 * pickpocketed key), Mai's school bag and her lotus tea in the storeroom, the red pen line to B2; and c5-m3 the next
 * night: the ice-cream cake through Moonlight's door, crowd social stealth, Cường on the VIP balcony, the staff lift,
 * the clip-on recording through the one-way mirror, Tèo of KHO 7 recognising Tín, the crowd (or a short brawl) and
 * out through the kitchen. Non-lethal throughout (lethal: 'fail'; a chokehold slip never kills, flags.ts).
 *
 * Places are story/sites.ts ids, or anchors of the off-map spaces declared in ANCHORS ('karaoke-back/vipDoor');
 * texts are '@keys' of text/vi/ch05.ts; brands ({@app}, {@code}, {@ring}) come from text/vi/common.ts.
 * Register in content/index.ts LOADERS: `5: () => import('./ch05.ts'),`.
 * Cast from earlier chapters: tin, quang, coba, tu (ch.1), cuong, gac-teo, bao-ve, duoc-si (ch.2), and Đại úy Vân
 * 'van' and Thiếu tá Lực 'luc', whom chapter 3 introduces (scripts/story-ch05.test.mjs stands in for them while
 * content/ch03.ts is not built).
 *
 * Engine ids used here are in story/contract.ts, except ENGINE_NEEDS below (ids this chapter adds, with their lane):
 * the café recorder op 'cctv', the arenas 'karaoke-back', 'spa-back' and 'moonlight', the clip-on camera, the cake
 * carry, a DJ act, the clubber extras and the cutscene clips, props and sounds of the chapter. The CCTV footage is
 * CCTV_C5M1 (an actor timeline for the detective lane's story/timeline.ts).
 */

const H = Math.PI / 2;
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
const detected: Cond = { k: 'on', ev: 'detected' };
/** Teleport unless the player is already there on that surface `level` (null: the ground); see content/ch01.ts. */
const put = (at: string, vehicle?: string, r = 8, level: string | null = null): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });
/** A checkpoint inside an off-map space: enter it first when a skip lands here from outside (a restore re-enters it already). */
const inSpace = (space: string, link: string): Act => ({ k: 'if', c: { k: 'space', id: space }, then: [], else: [{ k: 'space', enter: space, link }] });
/** Seen by a guard of the arena: back to the last checkpoint; after three tries the card offers 'Bỏ qua đoạn này'. */
const caught = (reason: string, skipTo?: string): FailDef => ({ when: detected, reason: `@${reason}`, allowSkipAfter: 3, ...(skipTo ? { skipTo } : {}) });
/** Stealth rules of the chapter: takedowns allowed, no guns, nobody dies (LƯƠNG TÂM), crimes raise the ring's alarm. */
const RULES = { takedowns: true, guns: 'none', lethal: 'fail', failOn: [], showCones: 'observe', countConscience: true, respawn: 'checkpoint', policeSuppressed: true };

// ---- c5-m1 · Đơn hàng không tên --------------------------------------------------------------------------------

/** The karaoke back section: arena, guards and the VIP room (rebuilt by each of its checkpoints). */
const KARAOKE: Act[] = [
  { k: 'stealth', arena: 'karaoke-back', variant: 'night', rules: RULES },
  { k: 'spawn', id: 'gac-k1', cast: 'gac-k1', template: 'ran-den', at: 'karaoke-back/corridor', team: 'hostile', tags: ['karaoke'],
    behaviour: { k: 'patrol', route: ['karaoke-back/corridor', 'karaoke-back/roomOpen1', 'karaoke-back/roomOpen2', 'karaoke-back/corridor'], waits: [3, 2, 4, 2] } },
  { k: 'spawn', id: 'gac-k2', cast: 'gac-k1', template: 'ran-den', at: 'karaoke-back/roomOpen2', team: 'hostile', tags: ['karaoke'], behaviour: { k: 'guard', post: 'karaoke-back/roomOpen2', sweep: 60 } },
  { k: 'spawn', id: 'gac-cua-sau', cast: 'gac-cua-sau', template: 'ran-den', at: 'karaoke-back/backExit', team: 'hostile', tags: ['karaoke'], behaviour: { k: 'guard', post: 'karaoke-back/backExit', sweep: 0 } },
  { k: 'spawn', id: 'quang-vip', cast: 'quang', at: 'karaoke-back/vipRoom', team: 'neutral', behaviour: { k: 'act', name: 'stand-bow' } },
  { k: 'spawn', id: 'chu-song', cast: 'chu-song', at: 'karaoke-back/vipTable', team: 'hostile', behaviour: { k: 'act', name: 'sit-stool-phone' } },
];
/** The café recorder: the c2-m3 night on CAM 01, two marks to find (phone-detective-ui.md §6). */
const CCTV_OPEN: Act = { k: 'do', op: 'cctv', wait: true, args: {
  id: 'cam-co-ba', timeline: 'cctv-c5m1', camera: 'cafe-co-ba.porchCam', title: '@c5m1.cctv.title', cam: '@c5m1.cctv.cam', goal: '@c5m1.cctv.goal', hint: '@c5m1.cctv.hint',
  start: 12600, duration: 900, fps: 2, rain: 0.25, needed: 2,
  marks: [{ t: 370, tol: 6, evidence: 'ev-cctv-0336' }, { t: 665, tol: 6, evidence: 'ev-cctv-0341' }] } };
const tailQuang = (target: string): Act => ({ k: 'tail', target, band: [15, 50], lose: { far: 80, seconds: 10 }, mirror: true, headlight: true });
const tailFails = (target: string): FailDef[] => [
  { when: { k: 'on', ev: 'lost', id: target }, reason: '@c5m1.fail.mat', allowSkipAfter: 3 },
  { when: { k: 'on', ev: 'spotted', id: target }, reason: '@c5m1.fail.lo', allowSkipAfter: 3 },
];
const vanSaid = (eq: string): Cond => flag('choice:keQuang', eq);

const c5m1 = defineMission({
  id: 'c5-m1', meta: { hours: [4, 8], giver: 'tu' }, chain: 'c5-m2', lethal: 'fail',
  start: { at: 'xe-may-ong-tu', yaw: 0, hour: 5, weather: 'clear', lunar: 6, outfit: 'tin-wrist-wrap' },
  world: { traffic: 'light', crowd: 'thin', police: 'story', gangs: 'calm', clock: { hour: 5, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [
    { k: 'spawn', id: 'tu', cast: 'tu', at: 'xe-may-ong-tu', team: 'ally', behaviour: { k: 'act', name: 'fix-bike' } },
    { k: 'vehicle', id: 'dream', model: 'dream', at: 'xe-may-ong-tu.tarp', yaw: H, state: 'park' },
    { k: 'do', op: 'bike', args: { id: 'dream', look: 'matte' } },
  ],
  steps: [
    {
      id: 'binh-minh', minutes: 0.6,
      enter: [
        { k: 'title', kind: 'time', text: '@c5m1.title', sub: '@c5m1.titleSub' },
        { k: 'cutscene', id: 'c5m1-dream' },
        { k: 'flag', name: 'dreamMatte' }, { k: 'toast', text: '@c5m1.toast.xe' },
        { k: 'give', item: 'bug' }, { k: 'toast', text: '@c5m1.toast.rep' },
        { k: 'fade', to: 'black', ms: 900 }, { k: 'time', hour: 7 }, { k: 'world', policy: { traffic: 'normal', crowd: 'normal' } },
        { k: 'teleport', at: 'cafe-co-ba.pickup', yaw: 0, vehicle: 'dream' },
        { k: 'title', kind: 'time', text: '@c5m1.title2', sub: '@c5m1.title2Sub' },
        { k: 'fade', to: 'clear', ms: 900 },
      ],
    },
    {
      id: 'quan-co-ba', minutes: 0.5, objective: '@c5m1.obj.hoi', marker: { at: 'cafe-co-ba', label: '@c5m1.mk.coba', style: 'talk' },
      interact: [{ id: 'hoi-co-ba', at: 'cafe-co-ba', r: 2.5, prompt: '@c5m1.int.hoi', kind: 'talk', when: 'foot' }],
      enter: [
        { k: 'spawn', id: 'coba', cast: 'coba', at: 'cafe-co-ba', team: 'ally', behaviour: { k: 'act', name: 'kettle-pour' } },
        aside('c5m1-camera', [think('c5m1.think.camera')]),
      ],
      done: used('hoi-co-ba'),
      exit: [
        talk('c5m1-coba', [
          say('coba', 'c5m1.coba.sua', { if: flag('choice:caPhe', 'sua') }), say('coba', 'c5m1.coba.den', { if: { k: 'not', c: flag('choice:caPhe', 'sua') } }),
          say('tin', 'c5m1.tin1'), say('coba', 'c5m1.coba1'), say('coba', 'c5m1.coba2'), say('tin', 'c5m1.tin2'),
          say('coba', 'c5m1.coba3'), say('coba', 'c5m1.coba4'), say('tin', 'c5m1.tin3')]),
        { k: 'despawn', id: 'coba' }, { k: 'space', enter: 'co-ba-ground', link: 'front' },
      ],
    },
    {
      id: 'dau-ghi', minutes: 0.2, objective: '@c5m1.obj.dauGhi', marker: { at: 'co-ba-ground/recorder', style: 'subtle' },
      checkpoint: { label: '@c5m1.cp.dauGhi', setup: [
        inSpace('co-ba-ground', 'front'), put('co-ba-ground/kitchen', undefined, 6),
        { k: 'spawn', id: 'coba', cast: 'coba', at: 'co-ba-ground/counter', team: 'ally', behaviour: { k: 'act', name: 'kettle-pour' } }] },
      interact: [{ id: 'dau-ghi', at: 'co-ba-ground/recorder', r: 1.5, prompt: '@c5m1.int.dauGhi', kind: 'use', when: 'foot' }],
      done: used('dau-ghi'),
    },
    {
      // the overlay is modal (it holds the step's enter); closing it with a frame missing goes back to the recorder
      id: 'tua-bang', minutes: 0.9, objective: '@c5m1.obj.tua',
      subs: [
        { id: 'khung-1', text: '@c5m1.sub.f1', done: owned('ev-cctv-0336') },
        { id: 'khung-2', text: '@c5m1.sub.f2', done: owned('ev-cctv-0341') },
      ],
      enter: [hint('c5m1.hint.tua', 8000), CCTV_OPEN],
      branch: [{ when: { k: 'all', of: [{ k: 'on', ev: 'signal', id: 'cctv' }, after(1), { k: 'not', c: { k: 'subs' } }] }, goto: 'dau-ghi', do: [hint('c5m1.hint.lai')] }],
    },
    {
      id: 'suy-luan', minutes: 0.4,
      enter: [
        { k: 'deduce', id: 'cuocGoi' },
        talk('c5m1-goi', [think('c5m1.think.goi1'), think('c5m1.think.goi2'), think('c5m1.think.goi3')]),
        talk('c5m1-coba-2', [say('coba', 'c5m1.coba5'), say('tin', 'c5m1.tin4'), say('coba', 'c5m1.coba6')]),
        { k: 'journal', id: 'j-camera' },
      ],
    },
    {
      id: 'toi', minutes: 0.6, objective: '@c5m1.obj.quang', marker: { at: 'cafe-co-ba.quangTable', style: 'talk' },
      interact: [{ id: 'ngoi-quang', at: 'cafe-co-ba.quangTable', r: 2, prompt: '@c5m1.int.ngoi', kind: 'seat', when: 'foot' }],
      enter: [
        { k: 'fade', to: 'black', ms: 900 },
        { k: 'space', leave: 'cafe-co-ba' }, { k: 'despawn', id: 'coba' },
        { k: 'time', hour: 21.83 }, { k: 'world', policy: { traffic: 'night', crowd: 'night' } },
        { k: 'vehicle', id: 'dream', model: 'dream', at: 'cafe-co-ba.dream', yaw: 0, state: 'park' },
        { k: 'spawn', id: 'quang', cast: 'quang', at: 'cafe-co-ba.quangTable', team: 'ally', behaviour: { k: 'act', name: 'sit-stool-phone' } },
        { k: 'title', kind: 'time', text: '@c5m1.title3', sub: '@c5m1.title3Sub' },
        { k: 'fade', to: 'clear', ms: 900 },
      ],
      done: used('ngoi-quang'),
      exit: [
        { k: 'player', pose: 'sit-stool' },
        talk('c5m1-quang', [say('quang', 'c5m1.q1'), say('tin', 'c5m1.t1'), say('quang', 'c5m1.q2'), say('tin', 'c5m1.t2'), say('quang', 'c5m1.q3'), say('quang', 'c5m1.q4')]),
        { k: 'player', pose: null },
        { k: 'behave', id: 'quang', b: { k: 'goto', at: 'cafe-co-ba.pickup' } },
        aside('c5m1-nhin', [think('c5m1.think.quang')]),
      ],
    },
    {
      id: 'lay-xe', minutes: 0.2, objective: '@c5m1.obj.layXe', marker: { at: 'cafe-co-ba.dream', label: '@c5m1.mk.xe', style: 'go' },
      enter: [aside('c5m1-lay-xe', [think('c5m1.think.layXe')])],
      done: { k: 'reach', at: 'cafe-co-ba.dream', r: 3, mode: 'bike' },
      exit: [{ k: 'despawn', id: 'quang' }],
    },
    {
      id: 'bam-xe', minutes: 1, objective: '@c5m1.obj.bam',
      checkpoint: { label: '@c5m1.cp.bam', setup: [
        put('cafe-co-ba.dream', 'dream', 3), { k: 'despawn', id: 'quang' },
        { k: 'vehicle', id: 'xe-quang', model: 'scooter', at: 'cafe-co-ba.pickup', yaw: -H, driver: 'quang', route: ['nha-thuoc'], cruise: 8, obeyLights: true, state: 'drive' },
        tailQuang('xe-quang')] },
      meters: [{ id: 'tail:xe-quang', label: '@c5m1.meter.tail', kind: 'band' }],
      enter: [hint('c5m1.hint.bam', 8000)],
      watchers: [{ when: after(9), do: [hint('c5m1.hint.den')] }],
      done: { k: 'on', ev: 'arrived', id: 'xe-quang' },
      fail: tailFails('xe-quang'),
    },
    {
      id: 'nha-thuoc', minutes: 0.3, objective: '@c5m1.obj.thuoc', marker: { at: 'nha-thuoc', style: 'subtle' },
      enter: [
        { k: 'stop', id: 'xe-quang' }, { k: 'vehicle', id: 'xe-quang', state: 'park' },
        { k: 'spawn', id: 'quang', cast: 'quang', at: 'nha-thuoc', team: 'neutral', behaviour: { k: 'act', name: 'phone-bored' } },
        { k: 'spawn', id: 'duoc-si', cast: 'duoc-si', at: 'nha-thuoc', team: 'neutral', behaviour: { k: 'act', name: 'night-window' } },
        { k: 'photoTarget', id: 'tui-0431', subject: 'xe-quang', evidence: 'ev-tui-0431', minQuality: 0.6, scope: 'step' },
        hint('c5m1.hint.tui'), aside('c5m1-thuoc', [think('c5m1.think.thuoc')]),
      ],
      optional: [{ id: 'tui-0431', text: '@c5m1.opt.tui', when: owned('ev-tui-0431') }],
      done: after(12),
      fail: [{ when: { k: 'near', a: 'quang', b: 'player', r: 5 }, reason: '@c5m1.fail.gan', allowSkipAfter: 3 }],
      exit: [{ k: 'despawn', id: 'quang' }, { k: 'despawn', id: 'duoc-si' }],
    },
    {
      id: 'bam-xe-2', minutes: 0.7, objective: '@c5m1.obj.bam2',
      meters: [{ id: 'tail:xe-quang', label: '@c5m1.meter.tail', kind: 'band' }],
      enter: [{ k: 'vehicle', id: 'xe-quang', route: ['hem-sau-nha-nghi.exit'], cruise: 8, obeyLights: true, state: 'drive' }, tailQuang('xe-quang')],
      done: { k: 'on', ev: 'arrived', id: 'xe-quang' },
      fail: tailFails('xe-quang'),
      exit: [{ k: 'stop', id: 'xe-quang' }],
    },
    {
      id: 'di-bo', minutes: 0.5, objective: '@c5m1.obj.diBo', marker: { at: 'hem-sau-nha-nghi.exit', style: 'subtle' },
      checkpoint: { label: '@c5m1.cp.hem', setup: [
        put('hem-sau-nha-nghi.hideHem', undefined, 25),
        { k: 'vehicle', id: 'xe-quang', model: 'scooter', at: 'hem-sau-nha-nghi.exit', yaw: -H, state: 'park' },
        { k: 'spawn', id: 'quang', cast: 'quang', at: 'hem-sau-nha-nghi.exit', team: 'neutral', behaviour: { k: 'goto', at: 'hem-sau-nha-nghi.handoff' } },
        { k: 'spawn', id: 'gac-cua-sau', cast: 'gac-cua-sau', template: 'ran-den', at: 'hem-sau-nha-nghi.karaokeBack', team: 'hostile', behaviour: { k: 'act', name: 'cross-arms' } },
        { k: 'tail', target: 'quang', band: [8, 30], lose: { far: 45, seconds: 8 }, onFoot: true, knownFace: true }] },
      meters: [{ id: 'tail:quang', label: '@c5m1.meter.foot', kind: 'band' }],
      subs: [{ id: 'xuong-xe', text: '@c5m1.sub.xuongXe', done: { k: 'mode', is: 'foot' } }],
      enter: [{ k: 'unlock', ability: 'faceCover', label: '@c5m1.unlock.mat' }, hint('c5m1.hint.mat', 9000)],
      done: { k: 'all', of: [{ k: 'subs' }, { k: 'on', ev: 'arrived', id: 'quang' }] },
      fail: [
        { when: { k: 'on', ev: 'spotted', id: 'quang' }, reason: '@c5m1.fail.nhanRa', allowSkipAfter: 3 },
        { when: { k: 'on', ev: 'lost', id: 'quang' }, reason: '@c5m1.fail.matDiBo', allowSkipAfter: 3 },
      ],
    },
    {
      id: 'giao-tui', minutes: 0.2, objective: '@c5m1.obj.giao',
      enter: [
        { k: 'photoTarget', id: 'giao-tui', subject: 'hem-sau-nha-nghi.handoff', evidence: 'ev-anh-giao-tui', minQuality: 0.5, scope: 'step' },
        { k: 'behave', id: 'gac-cua-sau', b: { k: 'goto', at: 'hem-sau-nha-nghi.handoff' } },
        bark('gac-cua-sau', 'c5m1.bark.gac1'), hint('c5m1.hint.giao', 6000),
      ],
      watchers: [{ when: after(4), do: [bark('gac-cua-sau', 'c5m1.bark.gac2')] }],
      optional: [{ id: 'giao-tui', text: '@c5m1.opt.giao', when: owned('ev-anh-giao-tui') }],
      done: after(8),
      fail: [{ when: { k: 'on', ev: 'spotted', id: 'quang' }, reason: '@c5m1.fail.nhanRa', allowSkipAfter: 3 }],
      exit: [{ k: 'stop', id: 'quang' }, { k: 'despawn', id: 'quang' }, { k: 'despawn', id: 'gac-cua-sau' }, aside('c5m1-vo-trong', [think('c5m1.think.giao')])],
    },
    {
      id: 'cua-truoc', minutes: 0.3, objective: '@c5m1.obj.cuaTruoc', marker: { at: 'karaoke-anh-sao', label: '@c5m1.mk.karaoke', style: 'go' },
      interact: [{ id: 'vao-karaoke', at: 'karaoke-anh-sao', r: 2.2, prompt: '@c5m1.int.vao', kind: 'enter', when: 'foot' }],
      done: used('vao-karaoke'),
    },
    {
      // a bluff with stakes: a wrong answer gets him thrown out and the question comes again (no fail card)
      id: 'tiep-tan', minutes: 0.2,
      enter: [
        talk('c5m1-tt', [say('tiep-tan-ks', 'c5m1.tt1')]),
        { k: 'choice', id: 'tiepTan', prompt: '@c5m1.q.tt', style: 'bluff', options: [
          { id: 'phong', text: '@c5m1.opt.tt.phong', then: [talk('c5m1-tt-ok', [say('tiep-tan-ks', 'c5m1.tt.phong')])] },
          { id: 'quang', text: '@c5m1.opt.tt.quang', then: [talk('c5m1-tt-quang', [say('tiep-tan-ks', 'c5m1.tt.quang', { voice: 'shout' })])] },
          { id: 've-sinh', text: '@c5m1.opt.tt.vs', then: [talk('c5m1-tt-vs', [say('tiep-tan-ks', 'c5m1.tt.vs')])] }] },
      ],
      done: flag('choice:tiepTan', 'phong'),
      fail: [{ when: { k: 'all', of: [{ k: 'on', ev: 'choice', id: 'tiepTan' }, { k: 'not', c: flag('choice:tiepTan', 'phong') }] }, reason: '@c5m1.fail.tt', soft: true }],
      exit: [{ k: 'space', enter: 'karaoke-back', link: 'front' }],
    },
    {
      id: 'hanh-lang', minutes: 0.8, objective: '@c5m1.obj.hanhLang', marker: { at: 'karaoke-back/vipDoor', style: 'subtle' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c5m1.cp.hanhLang', setup: [inSpace('karaoke-back', 'front'), put('karaoke-back/front', undefined, 4), ...KARAOKE] },
      enter: [hint('c5m1.hint.am', 8000)],
      watchers: [{ when: after(9), do: [hint('c5m1.hint.gac')] }],
      done: reach('karaoke-back/vipDoor', 1.5),
      fail: [caught('c5m1.fail.hanhLang', 'nghe-len')],
    },
    {
      id: 'nghe-len', minutes: 0.5, objective: '@c5m1.obj.nghe', hud: { light: true, noise: true },
      checkpoint: { label: '@c5m1.cp.nghe', setup: [inSpace('karaoke-back', 'front'), put('karaoke-back/vipDoor', undefined, 3), ...KARAOKE] },
      meters: [{ id: 'eavesdrop:vip', label: '@c5m1.meter.nghe', kind: 'bar', max: 1 }],
      enter: [
        { k: 'eavesdrop', id: 'vip', source: 'chu-song', r: 3.5, seconds: 10, lines: [
          say('chu-song', 'c5m1.nghe1'), say('quang', 'c5m1.nghe2'), say('chu-song', 'c5m1.nghe3'), say('quang', 'c5m1.nghe4')] },
        hint('c5m1.hint.nghe'),
      ],
      done: { k: 'on', ev: 'eavesdrop', id: 'vip' },
      fail: [{ when: detected, reason: '@c5m1.fail.hanhLang' }],
      exit: [
        { k: 'cutscene', id: 'c5m1-vip' },
        { k: 'evidence', id: 'ev-quang-no' }, { k: 'evidence', id: 'ev-hang-don-dem' }, { k: 'journal', id: 'j-quang-no' }, { k: 'flag', name: 'knowsQuangDebt' },
      ],
    },
    {
      id: 'cua-sau', minutes: 0.7, objective: '@c5m1.obj.cuaSau', marker: { at: 'karaoke-back/backExit', style: 'enemy' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c5m1.cp.cuaSau', setup: [inSpace('karaoke-back', 'front'), put('karaoke-back/vipDoor', undefined, 3), ...KARAOKE] },
      subs: [
        { id: 'ha', text: '@c5m1.sub.ha', done: { k: 'on', ev: 'knockout', id: 'gac-cua-sau' } },
        { id: 'keo', text: '@c5m1.sub.keo', done: { k: 'actor', id: 'gac-cua-sau', at: 'karaoke-back/storeroom', r: 2.5 } },
      ],
      enter: [hint('c5m1.hint.ha', 9000)],
      watchers: [
        { when: after(8), do: [hint('c5m1.hint.nhe', 7000)] },
        { when: { k: 'on', ev: 'knockout', id: 'gac-cua-sau' }, do: [aside('c5m1-run', [think('c5m1.think.ha')]), hint('c5m1.hint.keo')] },
      ],
      fail: [caught('c5m1.fail.cuaSau', 'tho')],
    },
    { id: 'tho', minutes: 0.3, enter: [{ k: 'cutscene', id: 'c5m1-breathe' }, { k: 'journal', id: 'j-tay-run' }] },
    {
      id: 'cua-so', minutes: 0.2, objective: '@c5m1.obj.cuaSo', marker: { at: 'karaoke-back/window', style: 'go' },
      interact: [{ id: 'cua-so', at: 'karaoke-back/window', r: 1.5, prompt: '@c5m1.int.cuaSo', kind: 'use', when: 'foot' }],
      done: used('cua-so'),
      exit: [{ k: 'space', leave: 'hem-sau-nha-nghi.karaokeBack' }, { k: 'stealth', arena: null }],
    },
    {
      id: 'hem-dem', minutes: 0.6,
      enter: [
        talk('c5m1-hem', [think('c5m1.think.hem1')]),
        { k: 'call', id: 'c5m1-van', from: 'van', ring: true, burner: true, lines: [phone('van', 'c5m1.v1'), phone('tin', 'c5m1.t5'), phone('van', 'c5m1.v2')] },
        { k: 'choice', id: 'keQuang', prompt: '@c5m1.q.ke', timeout: 15, default: 'ke', options: [{ id: 'ke', text: '@c5m1.opt.ke' }, { id: 'giau', text: '@c5m1.opt.giau' }] },
        { k: 'call', id: 'c5m1-van-2', from: 'van', ring: false, burner: true, lines: [
          phone('tin', 'c5m1.ke1', { if: vanSaid('ke') }), phone('van', 'c5m1.ke2', { if: vanSaid('ke') }),
          phone('tin', 'c5m1.giau1', { if: vanSaid('giau') }), phone('van', 'c5m1.giau2', { if: vanSaid('giau') }),
          phone('van', 'c5m1.v3'), phone('van', 'c5m1.v4'), phone('tin', 'c5m1.t6'), phone('van', 'c5m1.v5')] },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'tailedQuang' }],
  medals: { par: 600, ghost: true, clues: ['tui-0431', 'giao-tui'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight'], evidence: ['ev-goi-nho', 'ev-don-dem-quang'] },
});

// ---- c5-m2 · Spa nửa đêm -------------------------------------------------------------------------------------

const SPA_GUARDS: Act[] = [
  { k: 'spawn', id: 'gac-spa-1', cast: 'gac-spa', template: 'ran-den', at: 'spa-back/corridor', team: 'hostile', flashlight: true, tags: ['spa'],
    behaviour: { k: 'patrol', route: ['spa-back/corridor', 'spa-back/pump', 'spa-back/office', 'spa-back/corridor'], waits: [4, 2, 3, 2] } },
  { k: 'spawn', id: 'gac-spa-2', cast: 'gac-spa', template: 'ran-den', at: 'spa-back/office', team: 'hostile', flashlight: true, tags: ['spa'], behaviour: { k: 'guard', post: 'spa-back/office', sweep: 50 } },
  { k: 'spawn', id: 'gac-ngu', cast: 'gac-ngu', template: 'ran-den', at: 'spa-back/dozer', team: 'hostile', tags: ['spa'], behaviour: { k: 'act', name: 'sleep' } },
];
const c5m2 = defineMission({
  id: 'c5-m2', meta: { hours: [1, 4], giver: 'van' }, lethal: 'fail',
  start: { at: 'bia-hoi.backDoor', yaw: Math.PI, hour: 1.83, weather: 'cloudy', lunar: 7, outfit: 'tin-wrist-wrap' },
  world: { traffic: 'night', crowd: 'night', police: 'story', gangs: 'calm', clock: { hour: 1.83, freeze: true }, weather: { set: 'cloudy', lock: true }, exclusions: ['san-sau-pho-dem'], activities: NO_HUB },
  setup: [
    { k: 'stealth', arena: 'spa-back', variant: 'night', rules: RULES },
    { k: 'spawn', id: 'gac-san', cast: 'gac-san', template: 'ran-den', at: 'san-sau-pho-dem.kitchen', team: 'hostile', tags: ['spa'], behaviour: { k: 'guard', post: 'san-sau-pho-dem.kitchen', sweep: 40 } },
  ],
  steps: [
    {
      id: 'hai-gio', minutes: 0.4,
      enter: [
        { k: 'title', kind: 'time', text: '@c5m2.title', sub: '@c5m2.titleSub' },
        { k: 'sms', from: 'van', text: '@c5m2.sms1', burner: true },
        aside('c5m2-dau', [think('c5m2.think.dau')]),
      ],
    },
    {
      id: 'leo-ong', minutes: 0.4, objective: '@c5m2.obj.ong', marker: { at: 'bia-hoi.pipe', label: '@c5m2.mk.ong', style: 'go' }, hud: { light: true, noise: true },
      interact: [{ id: 'leo-ong-bia', at: 'bia-hoi.pipe', to: 'mai-pho-dem', r: 1.6, prompt: '@c5m2.int.ong', kind: 'climb', when: 'foot' }],
      enter: [hint('c5m2.hint.leo')],
      done: climbed('leo-ong-bia'),
      fail: [caught('c5m2.fail.lo')],
    },
    {
      id: 'mai-ton', minutes: 0.8, objective: '@c5m2.obj.mai', marker: { at: 'mai-pho-dem.plank', label: '@c5m2.mk.van', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c5m2.cp.mai', setup: [put('mai-pho-dem', undefined, 6, 'roof')] },
      interact: [{ id: 'qua-van', at: 'mai-pho-dem.plank', to: 'mai-pho-dem.spa', r: 1.8, prompt: '@c5m2.int.van', kind: 'climb', when: 'foot', level: 'roof' }],
      enter: [hint('c5m2.hint.mai'), aside('c5m2-mai', [think('c5m2.think.mai')])],
      done: climbed('qua-van'),
      fail: [caught('c5m2.fail.lo')],
    },
    {
      id: 'xuong-san', minutes: 0.4, objective: '@c5m2.obj.xuong', marker: { at: 'san-sau-pho-dem.drop', label: '@c5m2.mk.san', style: 'go' }, hud: { light: true, noise: true },
      interact: [{ id: 'tuot-xuong-san', at: 'mai-pho-dem.spa', to: 'san-sau-pho-dem.drop', r: 2, prompt: '@c5m2.int.xuong', kind: 'climb', when: 'foot', level: 'roof' }],
      enter: [hint('c5m2.hint.thuoc')],
      done: climbed('tuot-xuong-san'),
      fail: [caught('c5m2.fail.lo')],
    },
    {
      id: 'cua-spa', minutes: 0.4, objective: '@c5m2.obj.cua', marker: { at: 'san-sau-pho-dem.spaBack', style: 'subtle' }, hud: { light: true, noise: true },
      interact: [{ id: 'vao-spa', at: 'san-sau-pho-dem.spaBack', r: 1.6, hold: 1.5, prompt: '@c5m2.int.cua', kind: 'enter', when: 'foot' }],
      done: used('vao-spa'),
      fail: [caught('c5m2.fail.lo')],
      exit: [{ k: 'space', enter: 'spa-back', link: 'back' }],
    },
    {
      id: 'khu-sau', minutes: 2.4, objective: '@c5m2.obj.khu', hud: { light: true, noise: true },
      checkpoint: { label: '@c5m2.cp.khu', setup: [inSpace('spa-back', 'back'), put('spa-back/back', undefined, 3), ...SPA_GUARDS] },
      subs: [
        { id: 'rep', text: '@c5m2.sub.rep', done: used('gan-rep') },
        { id: 'so-do', text: '@c5m2.sub.soDo', done: owned('ev-so-do-b2') },
        { id: 'chia-khoa', text: '@c5m2.sub.chiaKhoa', done: used('moc-chia-khoa') },
      ],
      interact: [
        { id: 'gan-rep', at: 'spa-back/desk', r: 1.4, hold: 2, prompt: '@c5m2.int.rep', kind: 'use', when: 'foot' },
        { id: 'moc-chia-khoa', at: 'spa-back/dozer', r: 1.3, hold: 1.5, prompt: '@c5m2.int.moc', kind: 'pick', when: 'foot' },
      ],
      enter: [
        { k: 'photoTarget', id: 'so-do', subject: 'spa-back/plan', evidence: 'ev-so-do-b2', minQuality: 0.6, scope: 'step' },
        hint('c5m2.hint.khu', 8000),
      ],
      watchers: [
        { when: after(10), do: [hint('c5m2.hint.xong')] },
        { when: used('gan-rep'), do: [aside('c5m2-rep', [think('c5m2.think.rep')])] },
        { when: owned('ev-so-do-b2'), do: [aside('c5m2-so-do', [think('c5m2.think.soDo')])] },
        { when: used('moc-chia-khoa'), do: [aside('c5m2-khoa', [think('c5m2.think.khoa')])] },
        { when: after(20), do: [hint('c5m2.hint.moc')] },
      ],
      // the bug and the key change hands here, once, whatever the order the subs were done in
      exit: [{ k: 'take', item: 'bug' }, { k: 'flag', name: 'bugPlanted' }, { k: 'give', item: 'chia-khoa-kho' }],
      fail: [caught('c5m2.fail.khu', 'kho-do')],
    },
    {
      id: 'kho-do', minutes: 0.6, objective: '@c5m2.obj.kho', marker: { at: 'spa-back/storeroom', style: 'go' }, hud: { light: true, noise: true },
      interact: [{ id: 'mo-kho', at: 'spa-back/storeroom', r: 1.4, prompt: '@c5m2.int.kho', kind: 'use', when: 'foot' }],
      // 'Bỏ qua đoạn này' after three detections in the back section lands here as if its objectives were done
      enter: [{ k: 'if', c: { k: 'not', c: flag('bugPlanted') }, then: [
        { k: 'take', item: 'bug' }, { k: 'flag', name: 'bugPlanted' }, { k: 'give', item: 'chia-khoa-kho' }, { k: 'evidence', id: 'ev-so-do-b2' }] }],
      done: used('mo-kho'),
      fail: [{ when: detected, reason: '@c5m2.fail.khu' }],
      exit: [
        { k: 'take', item: 'chia-khoa-kho' },
        { k: 'cutscene', id: 'c5m2-bag' },
        { k: 'evidence', id: 'ev-cap-mai' }, { k: 'journal', id: 'j-cap-mai' }, { k: 'flag', name: 'sawMaiBag' },
      ],
    },
    {
      id: 'so-do-b2', minutes: 0.6,
      enter: [
        { k: 'cutscene', id: 'c5m2-plan' },
        { k: 'deduce', id: 'maiODau' },
        talk('c5m2-b2', [think('c5m2.think.b1'), think('c5m2.think.b2')]),
      ],
    },
    {
      id: 'ra-khoi-spa', minutes: 0.5, objective: '@c5m2.obj.ra', marker: { at: 'spa-back/back', style: 'go' }, hud: { light: true, noise: true },
      enter: [{ k: 'clue', id: 'sen-than', at: 'spa-back/storeroomWall', r: 1.6, evidence: 'ev-sen-than-spa', examine: 'object:charcoal-lotus', scope: 'step' }],
      watchers: [{ when: after(3), do: [hint('c5m2.hint.sen', 6000)] }],
      optional: [{ id: 'sen-than', text: '@c5m2.opt.sen', when: owned('ev-sen-than-spa') }],
      done: reach('spa-back/back', 1.5),
      fail: [{ when: detected, reason: '@c5m2.fail.khu' }],
      exit: [{ k: 'space', leave: 'san-sau-pho-dem.spaBack' }],
    },
    {
      id: 'leo-ra', minutes: 0.5, objective: '@c5m2.obj.tuong', marker: { at: 'san-sau-pho-dem.drop', style: 'go' }, hud: { light: true, noise: true },
      interact: [{ id: 'leo-tuong', at: 'san-sau-pho-dem.drop', to: 'bia-hoi.backDoor', r: 1.8, prompt: '@c5m2.int.tuong', kind: 'climb', when: 'foot' }],
      done: climbed('leo-tuong'),
      fail: [caught('c5m2.fail.lo')],
    },
    {
      id: 'sau-quan-bia', minutes: 0.5,
      enter: [
        { k: 'stealth', arena: null },
        talk('c5m2-cuoi', [think('c5m2.think.cuoi1', { if: owned('ev-sen-than-spa') }), think('c5m2.think.cuoi2')]),
        { k: 'sms', from: 'van', text: '@c5m2.sms2', burner: true }, { k: 'sms', from: 'van', text: '@c5m2.sms3', burner: true },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'sawSpa' }],
  medals: { par: 420, ghost: true, clues: ['sen-than'] },
  replay: {
    abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], items: { bug: 1 }, flags: { dreamMatte: true, knowsQuangDebt: true },
    evidence: ['ev-cctv-0336', 'ev-cctv-0341', 'ev-quang-no', 'ev-hang-don-dem'],
  },
});

// ---- c5-m3 · Vũ trường Moonlight -------------------------------------------------------------------------------

/** Moonlight's arena (floor and VIP back-of-house), optionally with the shipper cover while the cake is in hand. */
const moonlight = (cover?: string | null): Act => ({ k: 'stealth', arena: 'moonlight', variant: 'party', rules: { ...RULES, showCones: 'tagged' }, ...(cover !== undefined ? { cover } : {}) });
const c5m3 = defineMission({
  id: 'c5-m3', meta: { hours: [22, 2], giver: 'van' }, lethal: 'fail',
  start: { at: 'bia-hoi', yaw: -H, hour: 23.5, weather: 'clear', lunar: 7, outfit: 'tin-wrist-wrap' },
  world: { traffic: 'night', crowd: 'night', police: 'story', gangs: 'calm', clock: { hour: 23.5, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [{ k: 'spawn', id: 'bao-ve', cast: 'bao-ve', at: 'moonlight.bouncer', team: 'neutral', behaviour: { k: 'act', name: 'cross-arms' } }],
  steps: [
    {
      id: 'dem-sau', minutes: 0.5,
      enter: [
        { k: 'title', kind: 'time', text: '@c5m3.title', sub: '@c5m3.titleSub' },
        { k: 'call', id: 'c5m3-van', from: 'van', ring: true, burner: true, lines: [phone('van', 'c5m3.v1'), phone('van', 'c5m3.v2'), phone('tin', 'c5m3.t1'), phone('van', 'c5m3.v3')] },
        { k: 'unlock', ability: 'clipCam', label: '@c5m3.unlock.clip' },
        { k: 'toast', text: '@c5m3.toast.don' },
        { k: 'do', op: 'appOrder', args: { id: 'don-0717', state: 'active', title: '@c5m3.order', from: 'pho-dem', to: 'moonlight', fee: 45 } },
        { k: 'player', carry: 'order-banh-kem', lock: ['run'] },
        aside('c5m3-banh', [think('c5m3.think.banh')]),
      ],
    },
    {
      id: 'cua-vu-truong', minutes: 0.4, objective: '@c5m3.obj.cua', marker: { at: 'moonlight', label: '@c5m3.mk.cua', style: 'go' },
      interact: [{ id: 'giao-banh', at: 'moonlight', r: 2.2, prompt: '@c5m3.int.cua', kind: 'enter', when: 'foot' }],
      done: used('giao-banh'),
      exit: [
        talk('c5m3-bao-ve', [say('bao-ve', 'c5m3.bv1'), say('tin', 'c5m3.t2'), say('bao-ve', 'c5m3.bv2')]),
        moonlight('shipper'),
        { k: 'space', enter: 'moonlight-floor', link: 'front' },
      ],
    },
    {
      id: 'san-nhay', minutes: 1.3, objective: '@c5m3.obj.san', hud: { light: true, noise: true, cover: true },
      checkpoint: { label: '@c5m3.cp.san', setup: [
        inSpace('moonlight-floor', 'front'), put('moonlight-floor/front', undefined, 4), { k: 'player', carry: 'order-banh-kem', lock: ['run'] }, moonlight('shipper'),
        { k: 'spawn', id: 'dj', cast: 'dj', at: 'moonlight-floor/dj', team: 'neutral', behaviour: { k: 'act', name: 'dj-booth' } },
        { k: 'spawn', id: 'cuong', cast: 'cuong', at: 'moonlight-floor/balcony', team: 'hostile', behaviour: { k: 'guard', post: 'moonlight-floor/balcony', sweep: 70 } },
        { k: 'spawn', id: 'gac-san-nhay', cast: 'gac-vip', template: 'ran-den', at: 'moonlight-floor/bar', team: 'hostile', tags: ['moonlight'],
          behaviour: { k: 'patrol', route: ['moonlight-floor/bar', 'moonlight-floor/floor', 'moonlight-floor/serviceStairs'], waits: [5, 3, 4] } }] },
      meters: [{ id: 'cover:shipper', label: '@c5m3.meter.cover', kind: 'bar', max: 1 }],
      subs: [
        { id: 'giao', text: '@c5m3.sub.giao', done: used('giao-dj') },
        { id: 'cuong', text: '@c5m3.sub.cuong', done: owned('ev-anh-cuong-moonlight') },
      ],
      interact: [{ id: 'giao-dj', at: 'moonlight-floor/dj', r: 1.6, prompt: '@c5m3.int.giao', kind: 'use', when: 'foot' }],
      enter: [
        { k: 'photoTarget', id: 'anh-cuong', subject: 'cuong', evidence: 'ev-anh-cuong-moonlight', minQuality: 0.5, scope: 'step' },
        hint('c5m3.hint.dong', 8000),
      ],
      watchers: [
        { when: used('giao-dj'), do: [bark('dj', 'c5m3.dj1'), { k: 'player', carry: null, lock: null }, hint('c5m3.hint.cuong')] },
        { when: owned('ev-anh-cuong-moonlight'), do: [aside('c5m3-cuong', [think('c5m3.think.cuong')])] },
      ],
      exit: [{ k: 'player', carry: null, lock: null }, { k: 'do', op: 'appOrder', args: { id: 'don-0717', state: 'done' } }, { k: 'cash', n: 45 }],
      fail: [{ when: { k: 'meter', id: 'cover:shipper', op: '>=', value: 1 }, reason: '@c5m3.fail.cover', soft: true }, caught('c5m3.fail.lo')],
      retry: [{ k: 'teleport', at: 'moonlight-floor/front' }, { k: 'player', carry: 'order-banh-kem', lock: ['run'], cover: 'shipper' }],
    },
    {
      id: 'sau-quay', minutes: 0.4, objective: '@c5m3.obj.quay', marker: { at: 'moonlight-floor/serviceStairs', label: '@c5m3.mk.quay', style: 'subtle' }, hud: { light: true, noise: true },
      interact: [{ id: 'cau-thang', at: 'moonlight-floor/serviceStairs', r: 1.5, prompt: '@c5m3.int.quay', kind: 'enter', when: 'foot' }],
      enter: [{ k: 'stealth', cover: null }, hint('c5m3.hint.quay')],
      done: used('cau-thang'),
      fail: [caught('c5m3.fail.lo')],
      exit: [{ k: 'despawn', id: 'cuong' }, { k: 'space', enter: 'moonlight-vip', link: 'stairs' }],
    },
    {
      id: 'lau-vip', minutes: 0.8, objective: '@c5m3.obj.vip', hud: { light: true, noise: true },
      checkpoint: { label: '@c5m3.cp.vip', setup: [
        inSpace('moonlight-vip', 'stairs'), put('moonlight-vip/stairs', undefined, 3), moonlight(), { k: 'player', carry: null, lock: null },
        { k: 'spawn', id: 'gac-vip', cast: 'gac-vip', template: 'ran-den', at: 'moonlight-vip/corridor', team: 'hostile', tags: ['moonlight'],
          behaviour: { k: 'patrol', route: ['moonlight-vip/corridor', 'moonlight-vip/lift', 'moonlight-vip/corridor'], waits: [4, 3, 2] } },
        { k: 'spawn', id: 'luc', cast: 'luc', at: 'moonlight-vip/lounge', team: 'neutral', behaviour: { k: 'act', name: 'sit-stool-phone' } },
        { k: 'spawn', id: 'cuong', cast: 'cuong', at: 'moonlight-vip/lounge', team: 'hostile', behaviour: { k: 'act', name: 'cross-arms' } }] },
      subs: [
        { id: 'thang', text: '@c5m3.sub.thang', done: used('xem-thang-may') },
        { id: 'guong', text: '@c5m3.sub.guong', done: used('nup-guong') },
      ],
      interact: [
        { id: 'xem-thang-may', at: 'moonlight-vip/lift', r: 1.5, prompt: '@c5m3.int.thang', kind: 'examine', when: 'foot' },
        { id: 'nup-guong', at: 'moonlight-vip/mirror', r: 1.4, prompt: '@c5m3.int.guong', kind: 'hide', when: 'foot' },
      ],
      enter: [{ k: 'photoTarget', id: 'doc-the', subject: 'moonlight-vip/lift', evidence: 'ev-dau-doc-the', minQuality: 0.6, scope: 'step' }],
      watchers: [{ when: used('xem-thang-may'), do: [{ k: 'toast', text: '@c5m3.toast.thang' }, aside('c5m3-thang', [think('c5m3.think.thang')])] }],
      optional: [{ id: 'doc-the', text: '@c5m3.opt.doc', when: owned('ev-dau-doc-the') }],
      exit: [{ k: 'evidence', id: 'ev-thang-may-b2' }],
      fail: [caught('c5m3.fail.lo', 'xuong-lau')],
    },
    {
      id: 'quay-luc', minutes: 1, objective: '@c5m3.obj.quayLuc', hud: { light: true, noise: true },
      meters: [{ id: 'eavesdrop:phong-guong', label: '@c5m3.meter.nghe', kind: 'bar', max: 1 }],
      subs: [
        { id: 'khung', text: '@c5m3.sub.khung', done: owned('ev-clip-luc') },
        { id: 'nghe', text: '@c5m3.sub.nghe', done: { k: 'on', ev: 'eavesdrop', id: 'phong-guong' } },
      ],
      enter: [
        { k: 'photoTarget', id: 'clip-luc', subject: 'luc', evidence: 'ev-clip-luc', minQuality: 0.5, scope: 'step' },
        { k: 'eavesdrop', id: 'phong-guong', source: 'luc', r: 6, seconds: 8, requireHidden: true, lines: [
          say('cuong', 'c5m3.n1'), say('luc', 'c5m3.n2'), say('cuong', 'c5m3.n3'), say('luc', 'c5m3.n4')] },
        hint('c5m3.hint.clip', 8000),
      ],
      fail: [caught('c5m3.fail.lo', 'xuong-lau')],
      exit: [{ k: 'cutscene', id: 'c5m3-mirror' }, { k: 'evidence', id: 'ev-luc-noi' }, { k: 'journal', id: 'j-luc-phong-bi' }, { k: 'flag', name: 'filmedLuc' }],
    },
    {
      id: 'xuong-lau', minutes: 0.3, objective: '@c5m3.obj.xuong', marker: { at: 'moonlight-vip/stairs', style: 'go' }, hud: { light: true, noise: true },
      interact: [{ id: 'cau-thang-xuong', at: 'moonlight-vip/stairs', r: 1.5, prompt: '@c5m3.int.xuong', kind: 'enter', when: 'foot' }],
      enter: [
        { k: 'if', c: { k: 'not', c: flag('filmedLuc') }, then: [
          { k: 'cutscene', id: 'c5m3-mirror' }, { k: 'evidence', id: 'ev-thang-may-b2' }, { k: 'evidence', id: 'ev-clip-luc' }, { k: 'evidence', id: 'ev-luc-noi' },
          { k: 'journal', id: 'j-luc-phong-bi' }, { k: 'flag', name: 'filmedLuc' }] },
        aside('c5m3-hai', [think('c5m3.think.hai')]),
      ],
      done: used('cau-thang-xuong'),
      fail: [caught('c5m3.fail.lo')],
      exit: [{ k: 'despawn', id: 'luc' }, { k: 'despawn', id: 'cuong' }, { k: 'space', enter: 'moonlight-floor', link: 'serviceStairs' }],
    },
    {
      // Tèo, the KHO 7 gate guard, knows his face: lose him among the dancers, or fight him if he gets a hand on Tín.
      // He starts across the floor at the front doors and searches the floor by sight on a patrol (the ran-den guard
      // brain turns towards what it sees); only if he does get within arm's reach does the escape become a brawl.
      id: 'bi-nhan-dien', minutes: 1, objective: '@c5m3.obj.nhan', next: 'bep', hud: { light: true, noise: true },
      checkpoint: { label: '@c5m3.cp.nhan', setup: [
        inSpace('moonlight-floor', 'serviceStairs'), put('moonlight-floor/serviceStairs', undefined, 3), moonlight(), { k: 'music', id: 'pulse' },
        { k: 'spawn', id: 'gac-teo', cast: 'gac-teo', template: 'ran-den', at: 'moonlight-floor/front', team: 'hostile', behaviour: { k: 'patrol', route: ['moonlight-floor/front', 'moonlight-floor/floor', 'moonlight-floor/crowd', 'moonlight-floor/bar'], waits: [2, 2, 3, 2] } },
        { k: 'spawn', id: 'cuong', cast: 'cuong', at: 'moonlight-floor/balcony', team: 'hostile', behaviour: { k: 'guard', post: 'moonlight-floor/balcony', sweep: 90 } }] },
      subs: [{ id: 'lan', text: '@c5m3.sub.lan', done: { k: 'hold', seconds: 8, c: { k: 'all', of: [
        reach('moonlight-floor/crowd', 6), { k: 'actor', id: 'gac-teo', sees: false }, { k: 'player', prop: 'visibility', op: '<', value: 0.4 }] } } }],
      enter: [bark('gac-teo', 'c5m3.bark.teo', true), aside('c5m3-teo', [think('c5m3.think.teo')]), hint('c5m3.hint.nhan', 8000)],
      watchers: [{ when: after(10), do: [bark('gac-teo', 'c5m3.bark.teo2', true)] }],
      branch: [{ when: { k: 'near', a: 'gac-teo', b: 'player', r: 1.6 }, goto: 'danh-nhau' }],
    },
    {
      id: 'danh-nhau', minutes: 0.6, objective: '@c5m3.obj.danh', next: 'bep',
      enter: [bark('gac-teo', 'c5m3.teo1', true), { k: 'behave', id: 'gac-teo', b: { k: 'follow', target: 'player', dist: 0.8 } }, hint('c5m3.hint.danh', 8000)],
      done: { k: 'on', ev: 'knockout', id: 'gac-teo' },
      exit: [aside('c5m3-danh', [think('c5m3.think.danh')])],
    },
    {
      id: 'bep', minutes: 0.4, objective: '@c5m3.obj.bep', marker: { at: 'moonlight-floor/kitchenDoor', label: '@c5m3.mk.bep', style: 'go' },
      interact: [{ id: 'cua-bep', at: 'moonlight-floor/kitchenDoor', r: 1.5, prompt: '@c5m3.int.bep', kind: 'enter', when: 'foot' }],
      enter: [{ k: 'cutscene', id: 'c5m3-strobe' }],
      done: used('cua-bep'),
      exit: [{ k: 'space', leave: 'san-sau-pho-dem.kitchen' }, { k: 'stealth', arena: null }, { k: 'music', id: null }],
    },
    {
      id: 'hem-bep', minutes: 0.6,
      enter: [
        { k: 'cutscene', id: 'c5m3-clip' },
        { k: 'call', id: 'c5m3-van-2', from: 'van', ring: false, burner: true, lines: [
          phone('tin', 'c5m3.t3'), phone('van', 'c5m3.v4'), phone('van', 'c5m3.v5'), phone('tin', 'c5m3.t4'), phone('van', 'c5m3.v6')] },
        talk('c5m3-cuoi', [think('c5m3.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'sawMoonlight' }],
  medals: { par: 420, ghost: true, clues: ['doc-the'] },
  replay: {
    abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], flags: { dreamMatte: true, bugPlanted: true, sawMaiBag: true, knowsB2: true },
    evidence: ['ev-quang-no', 'ev-so-do-b2', 'ev-cap-mai'],
  },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string): CastDef => ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look });
export const CAST: CastDef[] = [
  { ...person('chu-song', '#8c5a3c', 'S', 'bookie'), role: '@cast.chu-song.role' }, person('tiep-tan-ks', '#d39bc4', 'T', 'receptionist'),
  person('gac-k1', '#6f7480', 'G', 'ran-den'), person('gac-cua-sau', '#7a3b3b', 'G', 'ran-den'), person('gac-spa', '#5d6470', 'G', 'ran-den'),
  person('gac-ngu', '#6a6f7a', 'G', 'ran-den'), person('gac-san', '#4f5560', 'G', 'ran-den'), person('gac-vip', '#3e434c', 'G', 'bouncer'),
  person('dj', '#7b5cff', 'DJ', 'dj'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 5, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-cctv-0336', 'photo', 'cctv0336', 'cctv', ['quang', 'cctv', 'ran-den'], '03:36'),
  ev('ev-cctv-0341', 'photo', 'cctv0341', 'cctv', ['quang', 'cctv', 'call'], '03:41'),
  ev('ev-tui-0431', 'photo', 'tui0431', 'bag', ['quang', 'app', 'don04']),
  ev('ev-anh-giao-tui', 'photo', 'giaoTui', 'camera', ['quang', 'karaoke']),
  ev('ev-quang-no', 'testimony', 'quangNo', 'quote', ['quang', 'debt']),
  ev('ev-hang-don-dem', 'testimony', 'hangDem', 'bag', ['app', 'drugs', 'don04']),
  ev('ev-so-do-b2', 'photo', 'soDo', 'map', ['moonlight', 'b2'], 'B2'),
  ev('ev-cap-mai', 'object', 'capMai', 'bag', ['mai', 'spa']),
  ev('ev-sen-than-spa', 'object', 'senThan', 'lotus', ['mai', 'spa']),
  ev('ev-anh-cuong-moonlight', 'photo', 'cuongMoon', 'person', ['cuong', 'moonlight']),
  ev('ev-thang-may-b2', 'place', 'thangMay', 'elevator', ['moonlight', 'b2']),
  ev('ev-dau-doc-the', 'photo', 'docThe', 'card', ['moonlight', 'b2', 'sen-vang']),
  ev('ev-clip-luc', 'recording', 'clipLuc', 'video', ['luc', 'cuong', 'police']),
  ev('ev-luc-noi', 'testimony', 'lucNoi', 'quote', ['luc', 'barge', 'hai']),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [
  note('j-camera', 'notes', 'camera'), note('j-quang-no', 'people', 'quangNo'), note('j-tay-run', 'diary', 'tayRun'),
  note('j-cap-mai', 'diary', 'capMai'), note('j-b2', 'places', 'b2'), note('j-luc-phong-bi', 'notes', 'lucPhongBi'),
];
export const QUESTIONS: QuestionDef[] = [
  {
    id: 'cuocGoi', prompt: '@c5m1.q.goi', answer: 'nghe-chuong', cost: 1, hint: '@c5m1.q.goi.hint',
    options: [
      { id: 'nghe-chuong', text: '@c5m1.q.goi.nghe', needs: ['ev-cctv-0341', 'ev-goi-nho'] },
      { id: 'an-khuya', text: '@c5m1.q.goi.an' }, { id: 'goi-nham', text: '@c5m1.q.goi.nham' }],
    onCorrect: [{ k: 'flag', name: 'knowsQuangForced' }],
  },
  {
    id: 'maiODau', prompt: '@c5m2.q.mai', answer: 'b2', cost: 1, hint: '@c5m2.q.mai.hint',
    options: [
      { id: 'sa-lan', text: '@c5m2.q.mai.salan' }, { id: 'b2', text: '@c5m2.q.mai.b2', needs: ['ev-so-do-b2', 'ev-cap-mai'] },
      { id: 'nha-nghi', text: '@c5m2.q.mai.nhaNghi' }],
    onCorrect: [{ k: 'flag', name: 'knowsB2' }, { k: 'journal', id: 'j-b2' }],
  },
];

/**
 * Off-map space anchors this chapter places things at ('space/anchor' in scripts, 'set:space.anchor' in cutscenes):
 * a contract for the level kit (spaces-surfaces-levelkit.md §11), which builds each one. Entry links: co-ba-ground
 * 'front', karaoke-back 'front', spa-back 'back', moonlight-floor 'front' and 'serviceStairs', moonlight-vip 'stairs'.
 */
export const ANCHORS: Record<string, Record<string, string>> = {
  'co-ba-ground': {
    front: 'inside the street door of CÀ PHÊ CÔ BA, from the porch (entry link "front")', counter: 'the counter with the kettle and the cash tin (Cô Ba)',
    kitchen: 'kitchen at the back of the ground floor', recorder: 'the cheap CCTV recorder and its little monitor on the kitchen shelf (opens the CCTV overlay)',
  },
  'karaoke-back': {
    front: 'KARAOKE ÁNH SAO lobby behind the street door (entry link "front"; the receptionist desk)', corridor: 'staff corridor behind the rooms (guard patrol)',
    roomOpen1: 'a room with its door open, a family singing loud (sound cover)', roomOpen2: 'a second open room, an off-key bolero next to the VIP room (sound cover; guard post)',
    vipDoor: 'the VIP betting room door, left ajar a hand-width (eavesdrop spot, the camera of c5m1-vip)', vipRoom: 'inside the VIP room, in front of the big football screen',
    vipTable: 'the card table covered in cash (the bookie sits here)', backExit: 'the back door onto the alley, a guard posted facing out',
    storeroom: 'beer storeroom beside the back door: crates and kegs, a dark corner for a body', window: 'the storeroom\'s back window onto the alley (exit)',
  },
  'spa-back': {
    back: 'SPA & MASSAGE back door from the shared courtyard (entry link "back")', corridor: 'the closed back corridor, massage rooms dark',
    office: 'manager\'s office door (guard post)', desk: 'manager\'s desk: the bug goes under it', plan: 'floor plan of the three buildings pinned on the office wall, a red pen line to B2',
    pump: 'steam-room pump (arena interactable: switched on, 15 s of noise and a sound mask)', dozer: 'plastic chair by the storeroom: the dozing guard with the key on his belt',
    storeroom: 'locked storeroom door', storeroomWall: 'inside the storeroom: the piles of belongings and a corner wall with a small charcoal lotus',
  },
  'moonlight-floor': {
    front: 'inside the club\'s front doors (entry link "front")', floor: 'middle of the dance floor', crowd: 'the thickest part of the crowd (crowd cover zone)',
    dj: 'the DJ booth', bar: 'the bar counter', serviceStairs: 'service stairs behind the bar (link up to moonlight-vip; entry link "serviceStairs" coming down)',
    balcony: 'the VIP balcony rail above the bar as seen from the floor (Cường\'s post)', kitchenDoor: 'swing door behind the bar into the kitchen corridor and out to the courtyard',
  },
  'moonlight-vip': {
    stairs: 'top of the service stairs (entry link "stairs")', corridor: 'back-of-house corridor', lift: 'the staff lift door with its keycard reader (B2)',
    mirror: 'dark observation niche behind the one-way mirror (hide spot)', lounge: 'VIP lounge on the other side of the mirror: sofas, a low table',
  },
};
/** Case-board cards this chapter contributes to BẢNG MANH MỐI (with the ch.1–3 cards they tie to; slots clear of chapters 1–4: 19–22 and 28–33) and the strings between them. */
export const BOARD_CARDS: BoardCard[] = [
  // Chapter 3 holds slots 9 and 13–18 and chapter 4 23–27, so the six that stood on 13–18 go on the third ring, 28–33.
  { id: 'ev-cctv-0336', slot: 28 }, { id: 'ev-cctv-0341', slot: 29 }, { id: 'ev-quang-no', slot: 30 }, { id: 'ev-hang-don-dem', slot: 31 },
  { id: 'ev-so-do-b2', slot: 32 }, { id: 'ev-cap-mai', slot: 33 }, { id: 'ev-thang-may-b2', slot: 19 }, { id: 'ev-anh-cuong-moonlight', slot: 20 },
  { id: 'ev-clip-luc', slot: 21 }, { id: 'ev-luc-noi', slot: 22 },
];
export const BOARD_LINKS: [string, string][] = [
  ['ev-goi-nho', 'ev-cctv-0341'], ['ev-cctv-0341', 'ev-cctv-0336'], ['ev-cctv-0336', 'ev-quang-no'], ['ev-quang-no', 'ev-hang-don-dem'],
  ['ev-hang-don-dem', 'ev-don-dem-quang'], ['ev-quang-no', 'ev-anh-cuong-moonlight'], ['ev-anh-cuong-moonlight', 'ev-cuong-seo'],
  ['ev-anh-cuong-moonlight', 'ev-clip-luc'], ['ev-clip-luc', 'ev-luc-noi'], ['ev-luc-noi', 'ev-thang-may-b2'],
  ['ev-thang-may-b2', 'ev-so-do-b2'], ['ev-so-do-b2', 'ev-cap-mai'],
  // to chapter 3: Lực's "vụ thằng Hải" and Ông Tư's 2014 account; the man on the clip wears the gold watch
  ['ev-luc-noi', 'ev-tu-ke'], ['ev-clip-luc', 'ev-dong-ho-vang'],
];

/**
 * CCTV footage of the c2-m3 night on Cô Ba's porch camera (CAM 01, clip 03:30:00–03:45:00), as an actor timeline for
 * the detective lane (phone-detective-ui.md §6.2 ActorTimeline: t seconds into the clip, x/z on the map, yaw, pose,
 * an act at that key). The two marks of CCTV_OPEN fall on the collar grab (03:36:10) and the call (03:41:05). The
 * footage shows a collar grab only, never a blow (safety, §11).
 */
type CctvKey = { t: number; x: number; z: number; yaw: number; pose: string; act?: string; prop?: string | null };
export const CCTV_C5M1: { id: string; duration: number; tracks: { actor: string; look: string; keys: CctvKey[] }[]; events: { t: number; kind: string; label: string }[] } = {
  id: 'cctv-c5m1', duration: 900,
  tracks: [
    { actor: 'quang', look: 'quang', keys: [
      { t: 0, x: -36, z: 2, yaw: H, pose: 'hidden' }, { t: 190, x: -33.5, z: 6.6, yaw: 0, pose: 'walk' }, { t: 204, x: -30.6, z: 12.8, yaw: 0, pose: 'walk' },
      { t: 206, x: -30.6, z: 13, yaw: Math.PI, pose: 'sit', prop: 'phone' }, { t: 368, x: -30.6, z: 13, yaw: Math.PI, pose: 'stand', act: 'collar-grab' },
      { t: 380, x: -30.6, z: 13, yaw: Math.PI, pose: 'stand' }, { t: 660, x: -30.6, z: 13, yaw: Math.PI, pose: 'stand', act: 'call', prop: 'phone' },
      { t: 700, x: -30.6, z: 13, yaw: Math.PI, pose: 'stand' }, { t: 720, x: -30.6, z: 13, yaw: Math.PI, pose: 'sit', act: 'head-in-hands' },
      { t: 820, x: -30.6, z: 12.8, yaw: Math.PI, pose: 'walk' }, { t: 835, x: -33.5, z: 6.6, yaw: Math.PI, pose: 'walk' }, { t: 840, x: -36, z: 2, yaw: -H, pose: 'hidden' },
    ] },
    { actor: 'ran-den', look: 'ran-den', keys: [
      { t: 0, x: -24, z: 2, yaw: -H, pose: 'hidden' }, { t: 330, x: -27.2, z: 6.5, yaw: 0, pose: 'walk' }, { t: 345, x: -30.2, z: 12, yaw: 0, pose: 'walk' },
      { t: 368, x: -30.4, z: 12.4, yaw: 0, pose: 'stand', act: 'collar-grab' }, { t: 380, x: -30.4, z: 12.2, yaw: 0, pose: 'stand' },
      { t: 700, x: -30.2, z: 12, yaw: Math.PI, pose: 'walk' }, { t: 712, x: -27.2, z: 6.5, yaw: Math.PI, pose: 'walk' }, { t: 716, x: -24, z: 2, yaw: H, pose: 'hidden' },
    ] },
  ],
  events: [
    { t: 190, kind: 'arrive', label: '@c5m1.cctv.e1' }, { t: 370, kind: 'mark', label: '@c5m1.cctv.e2' },
    { t: 665, kind: 'mark', label: '@c5m1.cctv.e3' }, { t: 700, kind: 'leave', label: '@c5m1.cctv.e4' },
  ],
};

/**
 * Engine ids this chapter uses beyond story/contract.ts, by contract kind, with the lane that builds them (the
 * integrator adds them to ENGINE_CONTRACT; scripts/story-ch05.test.mjs lints the chapter against the contract
 * plus these, and fails if one is unused).
 */
export const ENGINE_NEEDS: Partial<Record<ContractKind, Record<string, ContractEntry>>> = {
  ops: { cctv: ['ui', "the café recorder overlay (CctvView) {id, timeline, camera, title, cam, goal, hint, start, duration, fps, rain, needed, marks[{t, tol, evidence}]}; blocks until closed; each found mark pushes {type:'overlay', id, evidence}"] },
  arenas: {
    'karaoke-back': ['stealth', 'KARAOKE ÁNH SAO staff corridor, beer storeroom (body room) and VIP room; open singing rooms are sound-cover zones (×0.35)'],
    'spa-back': ['stealth', 'the strip roofs (tin, loud), the shared courtyard and the spa back section; steam pump interactable (15 s noise, ×0.5 mask); the dozing guard is a pickpocket target'],
    moonlight: ['stealth', "Moonlight floor and VIP back-of-house, variant 'party': dance-floor crowd zone (walking slowly blends, running raises visibility), strobes"],
  },
  outfits: { 'tin-wrist-wrap': ['core', 'Tín in the shipper windbreaker with his left wrist in a tight elastic wrap, no sling (chapter 5, the day after the hospital)'] },
  abilities: { clipCam: ['ui', "clip-on camera: CameraView mode 'clip', recording progress while the framing holds (q ≥ 0.5), paired with the eavesdrop meter"] },
  carry: { 'order-banh-kem': ['core', 'delivery: the big ice-cream cake for the DJ booth (no running)'] },
  acts: { 'dj-booth': ['director', 'DJ at the booth: one hand on the headphones, nodding to the beat'] },
  templates: { clubber: ['director', 'dance-floor extra (Moonlight crowd, strobe cutscene)'] },
  clips: {
    'pull-tarp': ['director', 'Ông Tư pulls the tarp off the bike in one sweep'],
    'ear-to-chest': ['director', "Tín kneels and presses his ear to a knocked-out man's chest"],
    'press-to-face': ['director', 'kneeling, a small packet pressed to the face with both hands'],
  },
  scenePoses: { dance: ['director', 'dancing (extras batch on the club floor)'] },
  sceneProps: {
    tarp: ['director', 'a canvas tarp over a parked bike'], 'audio-bug': ['director', "Ông Tư's matchbox-sized listening bug"],
    'football-tv': ['director', 'big screen showing a football match'], 'cash-stacks': ['director', 'bundles of cash on a card table'],
    'belongings-pile': ['director', 'piles of sandals, backpacks and plastic bags (belongings of everyone who passed through)'],
    'school-bag': ['director', "Mai's blue cloth school bag, her name and class written inside the flap"], 'floor-plan': ['director', 'a floor plan pinned on a wall, a red pen line'],
  },
  fx: { strobe: ['director', 'club strobes and lasers sweeping the dance floor'] },
  sfx: {
    'tarp-rustle': ['audio', 'canvas tarp pulled off'], 'engine-purr': ['audio', 'the rebuilt bike idling, very quiet'],
    'bolero-offkey': ['audio', 'an off-key bolero howled in the next karaoke room'],
  },
};

export const chapter = defineChapter({
  chapter: 5,
  missions: [c5m1, c5m2, c5m3],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, questions: QUESTIONS,
  text: TEXT,
});
