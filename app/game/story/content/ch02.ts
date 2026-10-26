import { defineChapter, defineMission, type Act, type BoardCard, type CastDef, type Cond, type EvidenceDef, type FailDef, type JournalDef, type Line, type QuestionDef, type WorldPolicy } from '../types.ts';
import { TEXT } from '../text/vi/ch02.ts';

/**
 * Chương 2 · ĐƠN HÀNG LÚC NỬA ĐÊM (story-final.md ch.2 with story-decisions.md 2, 3, 14, 20): c2-m1 the blank
 * order to room 7, Hoa's note and the reefer van; c2-m2 the stake-out in the motel's back alley and the
 * headlight-off tail over Cầu Khánh Hội to KHO 7 (Quận 4, P1); c2-m3 into the yard, onto the tin roof, the
 * PHÓNG VÔ Ổ swoop (CS03) and the escape — (a) down the north-west downpipe into the river, "Nổi im" in the
 * lee of the cargo ship, swim to the Bến Nghé bank, or (b) down the wall slot onto the Dream and lose three
 * Rắn Đen scooters in the hẻm of Vĩnh Khánh — ending at dawn on the Bến Nghé bank. The three missions chain.
 * Places are story/sites.ts ids, 'motel-upstairs/<anchor>' (ANCHORS) or the one chapter place below; texts are
 * '@keys' of text/vi/ch02.ts; brand constants ({@app}) come from text/vi/common.ts. Register in
 * content/index.ts LOADERS: `2: () => import('./ch02.ts'),`.
 *
 * Engine ids used here (story/contract.ts): vehicles 'reefer-van' (truck reefer variant with the golden-lotus
 * "SV · XE ƯU TIÊN" pass and the 51D-207.19 plate), 'scooter'; templates 'ran-den', 'watchdog', 'captive-teen',
 * 'captive-uniform'; stealth arenas 'nha-nghi' (social cover), 'hem-nha-nghi', 'kho-7'; meters 'cover:shipper',
 * 'tail:van-51d', 'thoat:ran-den'; `do` ops 'appOrder', 'offerWait' (phone ĐỢI button → signal 'phoneWait'),
 * 'stealthAlarm', 'danger' (heartbeat HUD and red vignette), 'pursue' (hostile scooters chasing the player; it
 * drives them, so they get no route), 'gps' (guide line along a route site). Climbs are InteractSpecs of kind
 * 'climb' whose id is the level kit's ClimbLink id; steps wait for its {type:'climb'} event.
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
/** Teleport unless the player is already there on that surface `level` (null: the ground; see content/ch01.ts). */
const put = (at: string, vehicle?: string, r = 8, level: string | null = null): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });
/** A climb link has carried the player to its far end (InteractSpec kind 'climb'). */
const climbed = (id: string): Cond => ({ k: 'on', ev: 'climb', id });
const detected: Cond = { k: 'on', ev: 'detected' };
const hideVar = (v: string): Cond => ({ k: 'var', name: 'hide', op: '==', value: v });
/** Back to the hide the player chose (stake-out retries). */
const backToHide: Act = { k: 'if', c: hideVar('tre'), then: [{ k: 'teleport', at: 'hem-sau-nha-nghi.hideBamboo' }], else: [
  { k: 'if', c: hideVar('hem'), then: [{ k: 'teleport', at: 'hem-sau-nha-nghi.hideHem' }], else: [{ k: 'teleport', at: 'hem-sau-nha-nghi.hideCrates' }] }] };

// ---- c2-m1 · Phòng số 7 ---------------------------------------------------------------------------------------

const c2m1 = defineMission({
  id: 'c2-m1', meta: { hours: [22, 2], giver: 'quang' }, chain: 'c2-m2',
  start: { at: 'cafe-co-ba.dream', yaw: 0, vehicle: 'dream', hour: 23.67, weather: 'cloudy', lunar: 1, outfit: 'tin-shipper' },
  world: { traffic: 'night', crowd: 'night', police: 'story', gangs: 'calm', clock: { hour: 23.67, freeze: true }, weather: { set: 'cloudy', lock: true }, activities: NO_HUB },
  setup: [
    { k: 'spawn', id: 'duoc-si', cast: 'duoc-si', at: 'nha-thuoc', team: 'neutral', behaviour: { k: 'act', name: 'night-window' } },
    { k: 'spawn', id: 'bao-ve', cast: 'bao-ve', at: 'moonlight.bouncer', team: 'neutral', behaviour: { k: 'act', name: 'cross-arms' } },
    { k: 'vehicle', id: 'van-51d', model: 'reefer-van', at: 'hem-sau-nha-nghi.van', yaw: H, state: 'park' },
  ],
  steps: [
    {
      id: 'mot-tuan-sau', minutes: 0.6,
      enter: [
        { k: 'title', kind: 'time', text: '@c2m1.title', sub: '@c2m1.titleSub' },
        { k: 'sms', from: 'quang', text: '@c2m1.sms1' }, { k: 'sms', from: 'quang', text: '@c2m1.sms2' },
        { k: 'toast', text: '@c2m1.toast.don' },
        { k: 'do', op: 'appOrder', args: { id: 'don-0413', state: 'active', title: '@c2m1.order', from: 'nha-thuoc', to: 'motel-hoa-hong', fee: 150, customer: '@c2m1.order.khach' } },
        { k: 'choice', id: 'nhanDonQuang', prompt: '@c2m1.q.quang', timeout: 15, default: 'ok', options: [{ id: 'ok', text: '@c2m1.opt.ok' }, { id: 'lo', text: '@c2m1.opt.lo' }] },
        { k: 'if', c: { k: 'flag', name: 'choice:nhanDonQuang', eq: 'lo' }, then: [{ k: 'sms', from: 'quang', text: '@c2m1.sms.lo' }], else: [{ k: 'sms', from: 'quang', text: '@c2m1.sms.ok' }] },
        aside('c2m1-phi', [think('c2m1.think.phi')]),
      ],
    },
    {
      id: 'nha-thuoc', minutes: 0.8, objective: '@c2m1.obj.thuoc', marker: { at: 'nha-thuoc', label: '@c2m1.mk.thuoc', style: 'go' },
      interact: [{ id: 'lay-tui', at: 'nha-thuoc', r: 2.5, prompt: '@c2m1.int.lay', kind: 'pick', when: 'foot' }],
      done: used('lay-tui'),
      exit: [
        talk('c2m1-thuoc', [say('duoc-si', 'c2m1.ds1'), say('duoc-si', 'c2m1.ds2'), say('tin', 'c2m1.tin1')]),
        { k: 'player', carry: 'tui-giay' }, aside('c2m1-tui', [think('c2m1.think.tui')]),
      ],
    },
    {
      id: 'pho-dem', minutes: 1, objective: '@c2m1.obj.phoDem', marker: { at: 'motel-hoa-hong', label: '@c2m1.mk.nhaNghi', style: 'go' },
      enter: [{ k: 'music', id: 'neon-night', level: 0.6 }],
      watchers: [{ when: reach('pho-dem', 30), do: [aside('c2m1-pho', [say('crowd', 'c2m1.crowd1'), say('bao-ve', 'c2m1.baoVe1'), think('c2m1.think.pho')])] }],
      done: reach('motel-hoa-hong', 5),
    },
    {
      id: 'vao-nha-nghi', minutes: 0.3, objective: '@c2m1.obj.vao',
      checkpoint: { label: '@c2m1.cp.nhaNghi', setup: [
        put('motel-hoa-hong'), { k: 'player', carry: 'tui-giay' },
        { k: 'stealth', arena: 'nha-nghi', rules: { takedowns: false, guns: 'none', failOn: [], showCones: 'tagged', countConscience: false, respawn: 'checkpoint' }, cover: 'shipper' },
        { k: 'spawn', id: 'le-tan', cast: 'le-tan', at: 'motel-upstairs/desk', team: 'neutral', behaviour: { k: 'act', name: 'phone-bored' } },
        { k: 'spawn', id: 'gac-hl', cast: 'gac', template: 'ran-den', at: 'motel-upstairs/corridor', team: 'hostile', behaviour: { k: 'guard', post: 'motel-upstairs/corridor', sweep: 20 } },
        { k: 'spawn', id: 'khan-do', cast: 'khan-do', template: 'ran-den', at: 'motel-upstairs/room7In', team: 'hostile', behaviour: { k: 'idle' } }] },
      interact: [{ id: 'vao', at: 'motel-hoa-hong', r: 2.2, prompt: '@c2m1.int.vao', kind: 'enter', when: 'foot' }],
      done: used('vao'),
      exit: [{ k: 'space', enter: 'motel-upstairs', link: 'front' }],
    },
    {
      id: 'hanh-lang', minutes: 1, objective: '@c2m1.obj.hanhLang', hud: { cover: true },
      meters: [{ id: 'cover:shipper', label: '@c2m1.meter.cover', kind: 'bar', max: 1 }],
      subs: [
        { id: 'qua-quay', text: '@c2m1.sub.quaQuay', done: reach('motel-upstairs/stairs', 2) },
        { id: 'tim-phong', text: '@c2m1.sub.timPhong', done: reach('motel-upstairs/room7', 1.6) },
      ],
      interact: [{ id: 'go-cua', at: 'motel-upstairs/room7', r: 1.5, prompt: '@c2m1.int.goCua', kind: 'use', when: 'foot' }],
      enter: [aside('c2m1-le-tan', [say('le-tan', 'c2m1.leTan1')]), hint('c2m1.hint.voBoc', 7000)],
      watchers: [
        { when: after(8), do: [hint('c2m1.hint.voBoc2', 7000)] },
        { id: 'nghi', when: { k: 'meter', id: 'cover:shipper', op: '>=', value: 0.6 }, once: false, cooldown: 12, do: [bark('gac-hl', 'c2m1.bark.gac')] },
      ],
      done: { k: 'all', of: [{ k: 'subs' }, used('go-cua')] },
      fail: [{ when: { k: 'meter', id: 'cover:shipper', op: '>=', value: 1 }, reason: '@c2m1.fail.cover', soft: true }],
      retry: [{ k: 'teleport', at: 'motel-upstairs/entry' }, { k: 'player', cover: 'shipper' }],
    },
    {
      id: 'phong-7', minutes: 0.7,
      enter: [
        { k: 'cutscene', id: 'cs02_phong_so_7' },
        { k: 'player', carry: null, cover: null }, { k: 'stealth', arena: null },
        { k: 'space', leave: 'hem-sau-nha-nghi.lamp' },
        { k: 'do', op: 'appOrder', args: { id: 'don-0413', state: 'done' } }, { k: 'cash', n: 150 }, { k: 'flag', name: 'hoaNote' },
      ],
    },
    {
      id: 'to-giay', minutes: 0.4, objective: '@c2m1.obj.giay',
      checkpoint: { label: '@c2m1.cp.hem', setup: [put('hem-sau-nha-nghi.lamp', undefined, 6)] },
      enter: [{ k: 'clue', id: 'giay-hoa', at: 'hem-sau-nha-nghi.lamp', r: 3, evidence: 'ev-giay-hoa', examine: 'note:hoa-receipt' }, hint('c2m1.hint.giay')],
      done: owned('ev-giay-hoa'),
      exit: [{ k: 'journal', id: 'j-co-be' }, { k: 'journal', id: 'j-phong-7' }],
    },
    {
      id: 'xe-lanh', minutes: 1, objective: '@c2m1.obj.xe', marker: { at: 'hem-sau-nha-nghi.van', style: 'subtle' },
      subs: [
        { id: 'bien-so', text: '@c2m1.sub.bienSo', done: owned('ev-bien-so') },
        { id: 'the', text: '@c2m1.sub.the', done: owned('ev-the-sen-vang') },
      ],
      enter: [
        { k: 'unlock', ability: 'phoneCamera', label: '@c2m1.unlock.camera' },
        { k: 'photoTarget', id: 'bien-so', subject: 'van-51d', evidence: 'ev-bien-so', minQuality: 0.6 },
        { k: 'photoTarget', id: 'the-sen-vang', subject: 'hem-sau-nha-nghi.vanNose', evidence: 'ev-the-sen-vang', minQuality: 0.6 },
        { k: 'clue', id: 'nuoc-da', at: 'hem-sau-nha-nghi.vanTail', r: 2, evidence: 'ev-nuoc-da', examine: 'object:reefer-drip' },
        hint('c2m1.hint.camera', 8000),
      ],
      watchers: [{ when: after(10), do: [hint('c2m1.hint.nuocDa')] }],
      optional: [{ id: 'nuoc-da', text: '@c2m1.opt.nuocDa', when: owned('ev-nuoc-da') }],
      exit: [
        { k: 'spawn', id: 'canh-cua', cast: 'canh-cua', template: 'ran-den', at: 'hem-sau-nha-nghi.backDoor', team: 'hostile', behaviour: { k: 'idle' } },
        bark('canh-cua', 'c2m1.bark.bien', true),
        talk('c2m1-cuoi', [think('c2m1.think.cuoi1'), think('c2m1.think.cuoi2')]),
      ],
    },
  ],
  medals: { par: 330, ghost: true, clues: ['nuoc-da'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch'] },
});

// ---- c2-m2 · Bám đuôi lúc ba giờ ------------------------------------------------------------------------------

const seen: Cond = { k: 'actor', id: 'canh-cua', sees: true };
/** The people loaded into the van at 03:00: [id, template, cast]. */
const LOADING: [string, string | null, string | null][] = [['hoa', null, 'hoa'], ['nn-1', 'captive-uniform', null], ['nn-2', 'captive-teen', null], ['nn-3', 'captive-teen', null]];
const c2m2 = defineMission({
  id: 'c2-m2', meta: { hours: [0, 4], giver: 'tin' }, chain: 'c2-m3',
  start: { at: 'ch2.hem-dream', yaw: H, vehicle: 'dream', hour: 0.3, weather: 'cloudy', lunar: 1, outfit: 'tin-shipper' },
  world: { traffic: 'night', crowd: 'night', police: 'story', gangs: 'calm', clock: { hour: 0.3, freeze: true }, weather: { set: 'cloudy', lock: true }, exclusions: ['hem-sau-nha-nghi'], activities: NO_HUB },
  setup: [{ k: 'vehicle', id: 'van-51d', model: 'reefer-van', at: 'hem-sau-nha-nghi.van', yaw: H, state: 'park' }],
  steps: [
    { id: 'nua-dem', minutes: 0.1, enter: [{ k: 'title', kind: 'time', text: '@c2m2.title', sub: '@c2m2.titleSub' }] },
    {
      id: 'chon-cho-nap', minutes: 0.8, objective: '@c2m2.obj.nap', hud: { light: true, noise: true },
      checkpoint: { label: '@c2m2.cp.canh', setup: [
        put('ch2.hem-dream'),
        { k: 'spawn', id: 'canh-cua', cast: 'canh-cua', template: 'ran-den', at: 'hem-sau-nha-nghi.lookout', team: 'hostile', flashlight: true, behaviour: { k: 'guard', post: 'hem-sau-nha-nghi.lookout', sweep: 40 } },
        { k: 'stealth', arena: 'hem-nha-nghi', variant: 'night', rules: { takedowns: false, guns: 'none', failOn: [], showCones: 'always', countConscience: false, respawn: 'checkpoint' } }] },
      subs: [
        { id: 'cui', text: '@c2m2.sub.cui', done: { k: 'stance', is: 'crouch' } },
        { id: 'nap', text: '@c2m2.sub.nap', done: { k: 'any', of: [used('nap-ket-bia'), used('nap-bui-tre'), used('nap-khe-hem')] } },
      ],
      interact: [
        { id: 'nap-ket-bia', at: 'hem-sau-nha-nghi.hideCrates', r: 1.5, prompt: '@c2m2.int.ketBia', kind: 'hide', when: 'foot' },
        { id: 'nap-bui-tre', at: 'hem-sau-nha-nghi.hideBamboo', r: 1.5, prompt: '@c2m2.int.buiTre', kind: 'hide', when: 'foot' },
        { id: 'nap-khe-hem', at: 'hem-sau-nha-nghi.hideHem', r: 1.5, prompt: '@c2m2.int.kheHem', kind: 'hide', when: 'foot' },
      ],
      enter: [hint('c2m2.hint.nap', 7000), aside('c2m2-nap', [think('c2m2.think.nap')])],
      // exit acts always run (a watcher firing in the tick the step completes would be cancelled with the step)
      exit: [{ k: 'if', c: used('nap-bui-tre'), then: [{ k: 'var', name: 'hide', value: 'tre' }], else: [
        { k: 'if', c: used('nap-khe-hem'), then: [{ k: 'var', name: 'hide', value: 'hem' }], else: [{ k: 'var', name: 'hide', value: 'ket' }] }] }],
      fail: [{ when: seen, reason: '@c2m2.fail.thay', soft: true }],
      retry: [bark('canh-cua', 'c2m2.bark.ai', true), { k: 'teleport', at: 'ch2.hem-dream' }, { k: 'player', stance: 'stand' }],
    },
    {
      id: 'canh', minutes: 1.3, objective: '@c2m2.obj.canh', hud: { light: true, noise: true },
      subs: [{ id: 'mot-luot', text: '@c2m2.sub.motLuot', done: { k: 'hold', c: { k: 'stance', is: 'hidden' }, seconds: 15 } }],
      enter: [{ k: 'do', op: 'offerWait', args: { until: 3 } }, hint('c2m2.hint.doi', 8000)],
      watchers: [{ when: after(20), do: [aside('c2m2-canh', [think('c2m2.think.canh1'), think('c2m2.think.canh2')])] }],
      done: { k: 'all', of: [{ k: 'subs' }, { k: 'on', ev: 'signal', id: 'phoneWait' }] },
      fail: [{ when: seen, reason: '@c2m2.fail.thay', soft: true }],
      retry: [bark('canh-cua', 'c2m2.bark.ai', true), backToHide],
      exit: [{ k: 'time', hour: 3 }, { k: 'sting', id: 'pagoda-bell' }],
    },
    {
      // 03:00: the group already stands at the van's tail; the cutscene is only the look and the nod, then the
      // player gets the photo window while they climb in, and the roller door ends it (no rewind, one bell)
      id: 'dua-len-xe', minutes: 0.4, objective: '@c2m2.obj.nhin',
      enter: [
        ...LOADING.map(([id, template, cast]): Act => ({ k: 'spawn', id, ...(cast ? { cast } : {}), ...(template ? { template } : {}), at: 'hem-sau-nha-nghi.vanTail', team: 'victim', tags: ['victim', 'loading'], behaviour: { k: 'idle' } })),
        { k: 'spawn', id: 'gac-dua', cast: 'gac', template: 'ran-den', at: 'hem-sau-nha-nghi.lamp', team: 'hostile', tags: ['loading'], behaviour: { k: 'act', name: 'cross-arms' } },
        { k: 'cutscene', id: 'c2m2-ba-gio' },
        ...LOADING.map(([id]): Act => ({ k: 'behave', id, b: { k: 'act', name: 'board-van' } })),
        { k: 'photoTarget', id: 'dua-nguoi', subject: 'hem-sau-nha-nghi.vanTail', evidence: 'ev-anh-dua-nguoi', minQuality: 0.5, scope: 'step' },
        hint('c2m2.hint.chup'),
      ],
      optional: [{ id: 'chup-dua-nguoi', text: '@c2m2.opt.chup', when: owned('ev-anh-dua-nguoi') }],
      done: after(10),
      fail: [{ when: seen, reason: '@c2m2.fail.thay', soft: true }],
      retry: [{ k: 'despawn', tag: 'loading' }, backToHide],
      exit: [{ k: 'sting', id: 'roller-door' }, { k: 'despawn', tag: 'loading' }],
    },
    {
      id: 'bam-duoi', minutes: 3, objective: '@c2m2.obj.bam',
      checkpoint: { label: '@c2m2.cp.bamDuoi', setup: [
        { k: 'teleport', at: 'ch2.hem-dream', yaw: H, vehicle: 'dream' },
        { k: 'unlock', ability: 'headlight', label: '@c2m2.unlock.den' },
        { k: 'vehicle', id: 'van-51d', route: 'r-bam-duoi', cruise: 9, obeyLights: true, state: 'drive' },
        { k: 'tail', target: 'van-51d', band: [20, 60], lose: { far: 90, seconds: 10 }, mirror: true, headlight: true }] },
      meters: [{ id: 'tail:van-51d', label: '@c2m2.meter.tail', kind: 'band' }],
      enter: [hint('c2m2.hint.den', 7000)],
      watchers: [
        { when: after(8), do: [hint('c2m2.hint.band', 8000)] },
        { when: { k: 'vehicle', id: 'van-51d', at: 'nga-tu-108-54', r: 14 }, do: [{ k: 'cutscene', id: 'c2m2-tuan-tra' }, { k: 'evidence', id: 'ev-xe-tuan-tra' }] },
        { when: { k: 'vehicle', id: 'van-51d', at: 'cau-khanh-hoi', r: 25 }, do: [aside('c2m2-cau', [think('c2m2.think.cau')])] },
      ],
      done: { k: 'on', ev: 'arrived', id: 'van-51d' },
      fail: [
        { when: { k: 'on', ev: 'lost', id: 'van-51d' }, reason: '@c2m2.fail.mat', allowSkipAfter: 3 },
        { when: { k: 'on', ev: 'spotted', id: 'van-51d' }, reason: '@c2m2.fail.lo', allowSkipAfter: 3 },
      ],
    },
    {
      id: 'giau-xe', minutes: 0.8, objective: '@c2m2.obj.giau', marker: { at: 'khe-kho-7.mouth', label: '@c2m2.mk.khe', style: 'subtle' },
      interact: [{ id: 'giau-xe', at: 'khe-kho-7.mouth', r: 3, prompt: '@c2m2.int.giau', kind: 'hide', when: 'ride' }],
      enter: [{ k: 'stop', id: 'van-51d' }],
      done: used('giau-xe'),
      exit: [{ k: 'cutscene', id: 'c2m2-cong-kho' }, { k: 'evidence', id: 'ev-kho-7' }, { k: 'journal', id: 'j-kho-7' }],
    },
  ],
  rewards: [{ k: 'flag', name: 'sawKho7' }],
  medals: { par: 420, ghost: true, clues: ['chup-dua-nguoi'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera'], flags: { hoaNote: true }, evidence: ['ev-giay-hoa', 'ev-bien-so', 'ev-the-sen-vang'] },
});

// ---- c2-m3 · Cái kho bên sông ---------------------------------------------------------------------------------

/** Seen in the yard or on the roof: back to the last checkpoint; after three tries the card offers 'Bỏ qua đoạn này'. */
const caughtOut: FailDef = { when: detected, reason: '@c2m3.fail.lo', allowSkipAfter: 3 };
const BIKERS = ['xe-rd-1', 'xe-rd-2', 'xe-rd-3'];
const c2m3 = defineMission({
  id: 'c2-m3', meta: { hours: [3, 5], giver: 'tin' }, lethal: 'fail',
  start: { at: 'khe-kho-7', yaw: Math.PI, hour: 3.5, weather: 'cloudy', lunar: 1, outfit: 'tin-shipper' },
  world: { traffic: 'night', crowd: 'off', police: 'suppressed', gangs: 'calm', clock: { hour: 3.5, freeze: true }, weather: { set: 'cloudy', lock: true }, exclusions: ['kho-7'], activities: NO_HUB },
  setup: [
    { k: 'stealth', arena: 'kho-7', variant: 'night', rules: { takedowns: false, guns: 'none', lethal: 'fail', failOn: [], showCones: 'always', countConscience: true, respawn: 'checkpoint', policeSuppressed: true } },
    { k: 'spawn', id: 'gac-1', cast: 'gac-tuan', template: 'ran-den', at: 'kho-7.quay', team: 'hostile', flashlight: true, weapon: 'pistol', tags: ['kho-7'],
      behaviour: { k: 'patrol', route: ['kho-7.quay', 'kho-7.hatch', 'kho-7.crates', 'kho-7.hatch'], waits: [4, 2, 5, 2] } },
    { k: 'spawn', id: 'gac-2', cast: 'gac-teo', template: 'ran-den', at: 'kho-7.gate', team: 'hostile', flashlight: true, weapon: 'pistol', tags: ['kho-7'], behaviour: { k: 'guard', post: 'kho-7.gate', sweep: 30 } },
    { k: 'spawn', id: 'cho-kho', template: 'watchdog', at: 'kho-7.dog', team: 'hostile', behaviour: { k: 'act', name: 'chained' } },
    { k: 'prop', id: 'den-cong', kind: 'floodlight', at: 'kho-7.gate' },
  ],
  steps: [
    {
      id: 'vao-san', minutes: 1.3, objective: '@c2m3.obj.vao', hud: { light: true, noise: true },
      checkpoint: { label: '@c2m3.cp.rao', setup: [put('khe-kho-7.back', undefined, 10)] },
      subs: [
        { id: 'hang-rao', text: '@c2m3.sub.rao', done: climbed('leo-rao') },
        { id: 'thung-ca', text: '@c2m3.sub.thung', done: reach('kho-7.crates', 3) },
      ],
      interact: [{ id: 'leo-rao', at: 'kho-7.fence', to: 'kho-7.fenceIn', r: 1.8, prompt: '@c2m3.int.rao', kind: 'climb', when: 'foot' }],
      enter: [hint('c2m3.hint.vao', 7000), aside('c2m3-vao', [think('c2m3.think.vao')])],
      watchers: [{ when: after(8), do: [hint('c2m3.hint.cho', 7000)] }, { when: after(16), do: [hint('c2m3.hint.khongDanh', 7000)] }],
      fail: [caughtOut],
    },
    {
      id: 'cau-tau', minutes: 1.2, objective: '@c2m3.obj.cauTau', marker: { at: 'kho-7.reefers', style: 'subtle' }, hud: { light: true, noise: true },
      enter: [{ k: 'eavesdrop', id: 'gac-tan-gau', source: 'gac-1', r: 7, seconds: 10, requireHidden: true, lines: [
        say('gac-tuan', 'c2m3.nghe1', { voice: 'radio' }), say('gac-teo', 'c2m3.nghe2', { voice: 'radio' }),
        say('gac-tuan', 'c2m3.nghe3', { voice: 'radio' }), say('gac-teo', 'c2m3.nghe4', { voice: 'radio' })] }],
      optional: [{ id: 'nghe-gac', text: '@c2m3.opt.nghe', when: { k: 'on', ev: 'eavesdrop', id: 'gac-tan-gau' }, reward: [{ k: 'evidence', id: 'ev-gac-noi' }] }],
      done: reach('kho-7.reefers', 2.5),
      fail: [caughtOut],
    },
    {
      id: 'leo-mai', minutes: 0.4, objective: '@c2m3.obj.leo', marker: { at: 'kho-7.ladder', style: 'subtle' }, hud: { light: true, noise: true },
      interact: [{ id: 'leo-thang', at: 'kho-7.ladder', to: 'kho-7.roof', r: 1.8, prompt: '@c2m3.int.thang', kind: 'climb', when: 'foot' }],
      done: climbed('leo-thang'),
      fail: [caughtOut],
    },
    {
      id: 'tren-mai', minutes: 0.8, objective: '@c2m3.obj.mai', marker: { at: 'kho-7.skylight', style: 'subtle' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c2m3.cp.mai', setup: [put('kho-7.roof', undefined, 4, 'roof')] },
      interact: [{ id: 'nhin-xuong', at: 'kho-7.skylight', r: 1.5, prompt: '@c2m3.int.nhin', kind: 'examine', when: 'foot', level: 'roof' }],
      enter: [hint('c2m3.hint.mai', 7000)],
      done: used('nhin-xuong'),
      fail: [caughtOut],
    },
    {
      id: 'phong-vo-o', minutes: 1,
      enter: [
        { k: 'cutscene', id: 'cs03_phong_vo_o' },
        ...['ev-tui-cam', 'ev-long-sat', 'ev-cuong-noi', 'ev-cuong-seo', 'ev-chi-phuong', 'ev-bang-trang', 'ev-goi-nho'].map((id): Act => ({ k: 'evidence', id })),
        { k: 'journal', id: 'j-cuong' }, { k: 'flag', name: 'deadlineSL07' },
      ],
    },
    {
      id: 'thoat', minutes: 0.4, objective: '@c2m3.obj.thoat',
      checkpoint: { label: '@c2m3.cp.thoat', setup: [
        put('kho-7.skylight', undefined, 4, 'roof'),
        { k: 'do', op: 'stealthAlarm', args: { level: 2, reason: 'phone-ring' } }, { k: 'do', op: 'danger', args: { on: true } }, { k: 'music', id: 'pulse' }] },
      marker: [{ id: 'mk-song', at: 'kho-7.pipeTop', label: '@c2m3.mk.song', style: 'go' }, { id: 'mk-khe', at: 'kho-7.slotTop', label: '@c2m3.mk.khe', style: 'go' }],
      interact: [
        { id: 'tuot-ong', at: 'kho-7.pipeTop', to: 'kho-7.downpipe', r: 2.5, prompt: '@c2m3.int.ongNuoc', kind: 'climb', when: 'foot', level: 'roof' },
        { id: 'chui-khe', at: 'kho-7.slotTop', to: 'khe-kho-7.back', r: 2.5, prompt: '@c2m3.int.khe', kind: 'climb', when: 'foot', level: 'roof' },
      ],
      enter: [aside('c2m3-la', [say('gac-tuan', 'c2m3.la1', { voice: 'shout' }), say('gac-teo', 'c2m3.la2', { voice: 'shout' })]), hint('c2m3.hint.thoat')],
      branch: [
        { when: climbed('tuot-ong'), goto: 'song', do: [{ k: 'flag', name: 'escapeRoute', value: 'song' }] },
        { when: climbed('chui-khe'), goto: 'khe', do: [{ k: 'flag', name: 'escapeRoute', value: 'khe' }] },
      ],
      done: { k: 'never' },
    },
    {
      id: 'song', minutes: 1, objective: '@c2m3.obj.song',
      checkpoint: { label: '@c2m3.cp.song', setup: [
        put('kho-7.quay', undefined, 6), { k: 'flag', name: 'escapeRoute', value: 'song' },
        { k: 'do', op: 'stealthAlarm', args: { level: 2, reason: 'search-water' } }, { k: 'do', op: 'danger', args: { on: true } },
        { k: 'behave', id: 'gac-1', b: { k: 'patrol', route: ['kho-7.quay', 'tau-hang.gangway'], waits: [3, 3] } },
        { k: 'behave', id: 'gac-2', b: { k: 'goto', at: 'kho-7.downpipe', run: true } }] },
      subs: [
        { id: 'xuong-nuoc', text: '@c2m3.sub.xuongNuoc', done: { k: 'mode', is: 'swim' } },
        { id: 'noi-im', text: '@c2m3.sub.noiIm', done: { k: 'hold', seconds: 8, c: { k: 'all', of: [
          reach('tau-hang.fenders', 5), { k: 'mode', is: 'swim' }, { k: 'player', prop: 'speed', op: '<', value: 0.3 }] } } },
      ],
      marker: { at: 'tau-hang.fenders', label: '@c2m3.mk.lee', style: 'subtle' },
      enter: [{ k: 'unlock', ability: 'floatStill', label: '@c2m3.unlock.noiIm' }, hint('c2m3.hint.noiIm', 8000)],
      watchers: [
        { when: after(4), do: [bark('gac-1', 'c2m3.bark.song1', true)] }, { when: after(12), do: [bark('gac-2', 'c2m3.bark.song2')] },
        { when: { k: 'mode', is: 'swim' }, do: [aside('c2m3-tui-nuoc', [think('c2m3.think.tuiNuoc')])] },
      ],
      fail: [{ when: detected, reason: '@c2m3.fail.denPin', allowSkipAfter: 3, skipTo: 'boi-ve' }],
    },
    {
      id: 'boi-ve', minutes: 1.6, objective: '@c2m3.obj.boi', marker: { at: 'bo-ben-nghe.climb', label: '@c2m3.mk.bo', style: 'go' }, next: 'binh-minh',
      interact: [{ id: 'leo-bo', at: 'bo-ben-nghe.climb', to: 'bo-ben-nghe', r: 3, prompt: '@c2m3.int.leoBo', kind: 'climb', when: 'water' }],
      enter: [bark('gac-1', 'c2m3.bark.song3'), { k: 'do', op: 'stealthAlarm', args: { level: 0, reason: 'gave-up' } }, { k: 'do', op: 'gps', args: { route: 'r-boi-thoat' } }, aside('c2m3-boi', [think('c2m3.think.boi1')])],
      watchers: [{ when: after(25), do: [aside('c2m3-boi-2', [think('c2m3.think.boi2')])] }],
      done: climbed('leo-bo'),
    },
    {
      id: 'khe', minutes: 1.6, objective: '@c2m3.obj.cat',
      checkpoint: { label: '@c2m3.cp.khe', setup: [
        { k: 'flag', name: 'escapeRoute', value: 'khe' },
        { k: 'fade', to: 'black', ms: 300 }, { k: 'teleport', at: 'khe-kho-7', yaw: 0, vehicle: 'dream' }, { k: 'fade', to: 'clear', ms: 300 },
        { k: 'stealth', arena: null }, { k: 'do', op: 'danger', args: { on: true } },
        // one gateway spot each; 'pursue' drives them, so no route
        ...BIKERS.map((id, i): Act => ({ k: 'vehicle', id, model: 'scooter', at: `kho-7.bike${i + 1}`, yaw: 0, driver: 'ran-den', cruise: 12, state: 'drive' })),
        { k: 'do', op: 'pursue', args: { ids: BIKERS, target: 'player', meter: 'thoat:ran-den', unseen: 15 } }] },
      meters: [{ id: 'thoat:ran-den', label: '@c2m3.meter.thoat', kind: 'bar', max: 1 }],
      enter: [hint('c2m3.hint.cat', 8000), { k: 'do', op: 'gps', args: { route: 'r-thoat-q4' } }],
      watchers: [
        { when: after(4), do: [aside('c2m3-rd-1', [say('ran-den', 'c2m3.rd1', { voice: 'shout' })])] },
        { when: after(14), do: [aside('c2m3-rd-2', [say('ran-den', 'c2m3.rd2', { voice: 'shout' })])] },
      ],
      done: { k: 'meter', id: 'thoat:ran-den', op: '>=', value: 1 },
      fail: [{ when: { k: 'on', ev: 'caught' }, reason: '@c2m3.fail.bat', allowSkipAfter: 3, skipTo: 've-bo' }],
    },
    {
      id: 've-bo', minutes: 0.7, objective: '@c2m3.obj.veBo', marker: { at: 'bo-ben-nghe', label: '@c2m3.mk.bo', style: 'go' },
      enter: [...BIKERS.map((id): Act => ({ k: 'vehicle', id, state: 'flee' })), { k: 'do', op: 'pursue', args: { ids: BIKERS, stop: true } }, aside('c2m3-thoat', [think('c2m3.think.thoat')])],
      done: reach('bo-ben-nghe', 8),
    },
    {
      id: 'binh-minh', minutes: 1.2,
      checkpoint: { label: '@c2m3.cp.binhMinh', setup: [put('bo-ben-nghe', undefined, 12)] },
      enter: [
        { k: 'music', id: null }, { k: 'stealth', arena: null }, { k: 'do', op: 'danger', args: { on: false } },
        { k: 'fade', to: 'black', ms: 900 }, { k: 'time', hour: 5.6 }, { k: 'weather', set: 'clear', lock: true }, { k: 'fade', to: 'clear', ms: 900 },
        { k: 'cutscene', id: 'c2m3-binh-minh' },
        { k: 'call', id: 'c2m3-goi-quang', from: 'quang', ring: false, lines: [say('tin', 'c2m3.goi1', { voice: 'phone' }), say('quang', 'c2m3.goi2', { voice: 'phone' }), say('quang', 'c2m3.goi3', { voice: 'phone' })] },
        { k: 'choice', id: 'oDau', prompt: '@c2m3.q.oDau', timeout: 10, default: 'nha', options: [{ id: 'nha', text: '@c2m3.opt.nha' }, { id: 'hoi', text: '@c2m3.opt.hoi' }] },
        { k: 'call', id: 'c2m3-goi-quang-2', from: 'quang', ring: false, lines: [
          say('tin', 'c2m3.nha1', { voice: 'phone', if: { k: 'flag', name: 'choice:oDau', eq: 'nha' } }),
          say('quang', 'c2m3.nha2', { voice: 'phone', if: { k: 'flag', name: 'choice:oDau', eq: 'nha' } }),
          say('tin', 'c2m3.hoi1', { voice: 'phone', if: { k: 'flag', name: 'choice:oDau', eq: 'hoi' } }),
          say('quang', 'c2m3.hoi2', { voice: 'phone', if: { k: 'flag', name: 'choice:oDau', eq: 'hoi' } }),
          say('quang', 'c2m3.hoi3', { voice: 'phone', if: { k: 'flag', name: 'choice:oDau', eq: 'hoi' } }),
          say('tin', 'c2m3.hoi4', { voice: 'phone', if: { k: 'flag', name: 'choice:oDau', eq: 'hoi' } })] },
        talk('c2m3-sau-goi', [think('c2m3.think.quang')]),
        { k: 'deduce', id: 'sl07' },
        talk('c2m3-cuoi', [think('c2m3.think.cuoi1'), think('c2m3.think.cuoi2')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'sawDen' }],
  medals: { par: 480, clues: ['nghe-gac'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight'], flags: { hoaNote: true, sawKho7: true }, evidence: ['ev-giay-hoa', 'ev-bien-so', 'ev-the-sen-vang', 'ev-kho-7'] },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string = id): CastDef => ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look });
export const CAST: CastDef[] = [
  { ...person('hoa', '#ffe08a', 'H'), role: '@cast.hoa.role' }, person('beti', '#ffd3a8', 'Tí'), { ...person('cuong', '#ff6b5b', 'C'), role: '@cast.cuong.role' },
  person('duoc-si', '#b7c4b0', 'T', 'pharmacist'), person('le-tan', '#c9a7c7', 'L', 'receptionist'), person('khan-do', '#b23a3a', 'K', 'ran-den'),
  person('canh-cua', '#7a3b3b', 'C', 'ran-den'), person('gac-tuan', '#6f7480', 'T', 'ran-den'), person('gac-teo', '#6f7480', 'T', 'ran-den'),
  person('ran-den', '#3a3a40', 'R', 'ran-den'), person('bao-ve', '#55606e', 'B', 'bouncer'), person('cong-nhan', '#5f7f8f', 'C', 'worker'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 2, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-giay-hoa', 'document', 'giayHoa', 'receipt', ['hoa', 'room7']),
  ev('ev-bien-so', 'photo', 'bienSo', 'plate', ['van', 'plate'], '51D-207.19'),
  ev('ev-the-sen-vang', 'photo', 'theSV', 'lotus', ['van', 'sen-vang']),
  ev('ev-nuoc-da', 'object', 'nuocDa', 'drop', ['van']),
  ev('ev-anh-dua-nguoi', 'photo', 'duaNguoi', 'camera', ['van', 'victims']),
  ev('ev-xe-tuan-tra', 'testimony', 'tuanTra', 'police', ['police', 'van']),
  ev('ev-kho-7', 'place', 'kho7', 'warehouse', ['kho-7', 'sen-vang']),
  ev('ev-gac-noi', 'recording', 'gacNoi', 'ear', ['kho-7', 'barge']),
  ev('ev-bang-trang', 'photo', 'bangTrang', 'whiteboard', ['kho-7', 'barge', 'deadline'], 'SL 07'),
  ev('ev-cuong-noi', 'testimony', 'cuongNoi', 'quote', ['kho-7', 'barge', 'cuong']),
  ev('ev-chi-phuong', 'testimony', 'chiPhuong', 'phone', ['phuong', 'cuong']),
  ev('ev-long-sat', 'testimony', 'longSat', 'cage', ['kho-7', 'victims']),
  ev('ev-tui-cam', 'object', 'tuiCam', 'bag', ['kho-7', 'app', 'drugs']),
  ev('ev-cuong-seo', 'person', 'cuongSeo', 'person', ['cuong']),
  ev('ev-goi-nho', 'call-log', 'goiNho', 'phone', ['quang']),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [note('j-co-be', 'people', 'coBe'), note('j-phong-7', 'diary', 'phong7'), note('j-kho-7', 'places', 'kho7'), note('j-cuong', 'people', 'cuong'), note('j-sl07', 'notes', 'sl07')];
export const QUESTIONS: QuestionDef[] = [{
  id: 'sl07', prompt: '@c2m3.q.sl07', answer: 'salan', cost: 1, hint: '@c2m3.q.hint',
  options: [{ id: 'lo', text: '@c2m3.q.lo' }, { id: 'salan', text: '@c2m3.q.salan', needs: ['ev-cuong-noi', 'ev-bang-trang'] }, { id: 'xe', text: '@c2m3.q.xe' }],
  onCorrect: [{ k: 'flag', name: 'knowsBarge' }, { k: 'journal', id: 'j-sl07' }],
}];
/** Off-map anchors of this chapter (see content/ch01.ts ANCHORS). */
export const ANCHORS: Record<string, Record<string, string>> = {
  'motel-upstairs': {
    front: 'street door of NHÀ NGHỈ HOA HỒNG (entry link "front", skips the 18+ venue modal)', entry: 'just inside the front door',
    desk: 'reception desk (bored receptionist)', stairs: 'foot of the stairs up', corridor: 'upstairs corridor under red neon (guard post)',
    room7: 'in front of the door of room 7', room7In: 'inside room 7 (stools, TV, the man counting ID cards)', back: 'back door onto the alley (exit link)',
  },
};
/** The chapter's own named point (validated by the content test: inside its alley, clear of the hide spots). */
export const PLACES = { 'ch2.hem-dream': { x: 66, z: 82.3, yaw: H, r: 0.9 } };
/** Case-board cards this chapter contributes to BẢNG MANH MỐI, and the strings that tie them (for the ch.4 board). */
export const BOARD_CARDS: BoardCard[] = [
  { id: 'ev-giay-hoa', slot: 0 }, { id: 'ev-bien-so', slot: 1 }, { id: 'ev-the-sen-vang', slot: 2 }, { id: 'ev-xe-tuan-tra', slot: 3 },
  { id: 'ev-kho-7', slot: 4 }, { id: 'ev-bang-trang', slot: 5 }, { id: 'ev-cuong-noi', slot: 6 }, { id: 'ev-chi-phuong', slot: 7 },
  { id: 'ev-tui-cam', slot: 8 }, { id: 'ev-goi-nho', slot: 10 }, { id: 'ev-cuong-seo', slot: 12 },
];
export const BOARD_LINKS: [string, string][] = [
  ['ev-giay-hoa', 'ev-bien-so'], ['ev-bien-so', 'ev-the-sen-vang'], ['ev-bien-so', 'ev-xe-tuan-tra'], ['ev-the-sen-vang', 'ev-kho-7'],
  ['ev-kho-7', 'ev-bang-trang'], ['ev-bang-trang', 'ev-cuong-noi'], ['ev-cuong-noi', 'ev-cuong-seo'], ['ev-cuong-seo', 'ev-chi-phuong'],
  ['ev-kho-7', 'ev-tui-cam'], ['ev-tui-cam', 'ev-don-dem-quang'], ['ev-don-dem-quang', 'ev-goi-nho'],
];

export const chapter = defineChapter({
  chapter: 2,
  missions: [c2m1, c2m2, c2m3],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, questions: QUESTIONS, places: PLACES,
  text: TEXT,
});
