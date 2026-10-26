import type { Cue, Mark, Scene } from '../scene.ts';

/**
 * Chapter 2 cutscenes as data (schema in story/scene.ts). CS03 "PHÓNG VÔ Ổ" is one on-map swoop: KHO 7 is a
 * hollow shell (story-decisions.md 2), so the camera rails from the roof through the skylight (its glass mesh
 * hidden) straight down onto the packing line, then tracks along it, and only then dollies to the cage (swoop →
 * packing → cage, as the bible orders it); no portal cut. KHO7_MARKS names the interior points the level kit must
 * build inside the shell, as offsets from the 'kho-7.hall' spot (580, -110).
 * Captives appear only as dignified extras (sitting, huddled, holding hands, shielding the younger ones); the
 * packets on the packing line are plain grey blocks kept in shadow. Nobody is struck.
 */

const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: 'scene' | 'phone' | 'radio' | 'inner'; as?: string; t?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });

/** Interior points of the KHO 7 shell (offsets from kho-7.hall; the footprint is x 560..600, z -132..-80, roof 11 m). */
export const KHO7_MARKS: Record<string, [number, number, number]> = {
  packing: [-8, 0, 6], packingHigh: [-10, 3, 2], forklift: [-2, 0, 10],
  cage: [10, 0, -10], cageLow: [6, 1.1, -6], cageDoor: [6.5, 0, -9], cageIn: [10, 0, -12],
  whiteboard: [14, 1.7, 14], office: [12, 0, 12], door: [2, 0, 30.8], aisle: [8, 0, 4], cuongStop: [6, 0, -4],
};
const k7 = (name: keyof typeof KHO7_MARKS): Mark => ({ at: 'kho-7.hall', off: KHO7_MARKS[name] });

// ---- CS02 · Phòng số 7 (c2-m1, 40 s) ---------------------------------------------------------------------------
const cs02: Scene = {
  id: 'cs02_phong_so_7', mission: 'c2-m1', title: '@cs02.title', kind: 'cutscene', seconds: 40, skippable: true,
  stage: { at: 'hem-sau-nha-nghi', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', freezeWorld: true, env: { hours: 0.1, weather: 'cloudy', freezeClock: true } },
  sets: ['motel-upstairs'],
  cast: {
    tin: 'tin', hoa: 'hoa', khanDo: 'khan-do', dem: 'tpl:ran-den',
    phong: { template: 'captive-teen', count: 4, area: 'set:motel-upstairs.room7In', size: [3, 2.5], poses: ['sit', 'stand-head-down', 'sit-hug-knees'] },
  },
  shots: [
    { dur: 5.5, label: 'hanh-lang', cam: { k: 'move', from: at('set:motel-upstairs.corridor', 0.4, 0.6, -2.5), to: at('set:motel-upstairs.room7', 0.4, 0.7, -1.6), look: 'set:motel-upstairs.room7', fov: 65, ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'neon' }, { k: 'fx', kind: 'neon-flicker', at: 'set:motel-upstairs.corridor' }, { k: 'sfx', id: 'club-through-wall' },
      { k: 'walk', who: 'tin', path: ['set:motel-upstairs.corridor', 'set:motel-upstairs.room7'] }, { k: 'prop', id: 'tui-giay', kind: 'stapled-paper-bag', attach: 'tin.handR' },
      { k: 'sfx', id: 'knock-2', t: 4.1 }, say('tin', 'cs02.tin1', { t: 4.4 })] },
    { dur: 4, label: 'cua', cam: { k: 'shot', eye: at('set:motel-upstairs.room7', 0, 1.5, 1.1), look: at('set:motel-upstairs.room7', 0, 1.3, 0), fov: 40 }, cues: [
      { k: 'sfx', id: 'door-chain' }, { k: 'anim', who: 'khanDo', clip: 'snatch' }, { k: 'prop', id: 'tui-giay', kind: 'stapled-paper-bag', attach: 'khanDo.handR', t: 1.6 },
      say('khanDo', 'cs02.khanDo1', { t: 1.2 })], note: 'the door opens 15 cm on its chain; a hand with a red bandana tied at the wrist snatches the bag' },
    { dur: 7, label: 'khe-cua', cam: { k: 'move', from: at('set:motel-upstairs.room7', 0, 1.5, 0.35), to: at('set:motel-upstairs.room7', 0, 1.5, -0.15), look: 'set:motel-upstairs.room7In', fov: 25 }, cues: [
      { k: 'place', who: 'hoa', at: at('set:motel-upstairs.room7In', -0.8, 0, 0.4), pose: 'sit' },
      { k: 'place', who: 'dem', at: at('set:motel-upstairs.room7In', 1.2, 0, -0.6), pose: 'sit-chair' }, { k: 'anim', who: 'dem', clip: 'count-cards', loop: true },
      { k: 'prop', id: 'cccd', kind: 'id-cards-envelope', attach: 'dem.handL' }, { k: 'prop', id: 'tv', kind: 'tv-cai-luong', at: at('set:motel-upstairs.room7In', 1.6, 1.2, -1.2) },
      { k: 'sfx', id: 'cai-luong-tv' }],
      note: 'POV through the gap: four teenage girls and a boy on plastic stools with their backpacks, silent; a man counts ID cards (CCCD) into an envelope. Labour-trafficking framing only.' },
    { dur: 8, label: 'tien-bo', cam: { k: 'twoShot', a: 'hoa', b: 'tin', fov: 34 }, cues: [
      { k: 'slowmo', scale: 0.35, seconds: 8 }, { k: 'walk', who: 'hoa', path: [at('set:motel-upstairs.room7', 0, 0, -0.4)] }, { k: 'look', who: 'hoa', at: 'tin.head' },
      { k: 'pair', clip: 'handover', a: 'hoa', b: 'tin' }, say('hoa', 'cs02.hoa1', { as: '@cast.coBe', t: 1.5 })],
      note: 'the order was prepaid; she slips him a few small notes "as a tip", the receipt folded inside them, her eyes locked on his' },
    { dur: 4, label: 'hoa-don', cam: { k: 'insert', target: 'tin.handR', fov: 15, dist: 0.25 }, cues: [
      { k: 'prop', id: 'hoa-don', kind: 'receipt-eyeliner', attach: 'tin.handR', lines: ['@cs02.note1', '@cs02.note2'] }] },
    { dur: 2.5, label: 'dong-cua', cam: { k: 'shot', eye: at('set:motel-upstairs.room7', 0, 1.5, 1.1), look: at('set:motel-upstairs.room7', 0, 1.3, 0), fov: 40, handheld: 0.9 }, cues: [
      { k: 'sfx', id: 'door-slam' }, { k: 'fx', kind: 'camera-jolt' }, say('khanDo', 'cs02.khanDo2', { t: 0.4 })] },
    { dur: 9, label: 'hem', cam: { k: 'crane', from: at('hem-sau-nha-nghi.lamp', -3, 7, 3), to: at('tin.head', 0.3, 0.1, 0.7), look: 'tin.handR', fov: [50, 32], ease: 'inOutSine' }, cues: [
      { k: 'place', who: 'tin', at: 'hem-sau-nha-nghi.lamp', pose: 'stand' }, { k: 'anim', who: 'tin', clip: 'unfold-paper' },
      say('tin', 'cs02.think1', { ch: 'inner', t: 0.6 }), say('tin', 'cs02.think1', { ch: 'inner', t: 3.2 }),
      { k: 'anim', who: 'tin', clip: 'look-watch', t: 4.2 }, { k: 'phoneScreen', who: 'tin', text: '@cs02.watch', t: 4.2 },
      say('tin', 'cs02.think2', { ch: 'inner', t: 5 }), { k: 'letterbox', on: false, t: 8.6 }],
      note: 'the streetlamp of the motel back door (88.6, 80.2); the thought comes twice, then he looks at the watch, then at the lotus seed on his wrist' },
  ],
  handoff: { player: { at: 'hem-sau-nha-nghi.lamp', vehicle: 'foot' }, camera: 'blend', ms: 700 },
};

// ---- c2-m2 · 03:00, the patrol car, the gate of KHO 7 --------------------------------------------------------
const hide = (h: string): Cue[] => [
  { k: 'place', who: 'tin', at: `hem-sau-nha-nghi.${h}`, pose: 'crouch', if: { k: 'var', name: 'hide', op: '==', value: h === 'hideCrates' ? 'ket' : h === 'hideBamboo' ? 'tre' : 'hem' } },
];
/**
 * Played in the enter of c2-m2 'dua-len-xe': the group already stands at the van's tail (the step spawns them
 * there), so the scene is only the look and the nod; the photo window and the climb-in are gameplay, and the
 * roller door is the step's exit sting. The 03:00 bell rang once, as the stake-out's exit sting.
 */
const baGio: Scene = {
  id: 'c2m2-ba-gio', mission: 'c2-m2', title: '@c2m2.cs.baGio', kind: 'cutscene', seconds: 15, skippable: true,
  stage: { at: 'hem-sau-nha-nghi', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 3, weather: 'cloudy', freezeClock: true } },
  cast: {
    tin: 'tin', hoa: 'hoa', gacDua: 'gac',
    nhom: { template: 'captive-teen', count: 3, area: 'hem-sau-nha-nghi.vanTail', size: [2, 2], poses: ['stand-head-down'] },
  },
  shots: [
    { dur: 4, cam: { k: 'shot', eye: at('hem-sau-nha-nghi', -10, 9, 2), look: 'hem-sau-nha-nghi.van', fov: 50 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, ...hide('hideCrates'), ...hide('hideBamboo'), ...hide('hideHem'),
      { k: 'place', who: 'hoa', at: 'hem-sau-nha-nghi.vanTail', pose: 'stand-head-down' }, { k: 'place', who: 'gacDua', at: 'hem-sau-nha-nghi.lamp', pose: 'stand' },
      say('gacDua', 'c2m2.cs.gac1', { t: 1.2 })],
      note: 'the young people stand at the van\'s open tail, heads down; one still wears a school uniform' },
    { dur: 4, cam: { k: 'shot', eye: at('hoa.head', 0.2, 0, 0.9), look: 'hoa.head', fov: 30 }, cues: [{ k: 'look', who: 'hoa', at: 'tin.head' }, { k: 'expr', who: 'hoa', e: 'worried' }],
      note: 'Hoa looks back, searching the dark' },
    { dur: 3, cam: { k: 'shot', eye: at('tin.head', 0.15, 0.05, 0.6), look: 'tin.head', fov: 26 }, cues: [{ k: 'anim', who: 'tin', clip: 'small-nod' }] },
    { dur: 4, cam: { k: 'shot', eye: at('hoa.head', 0.1, 0, 0.6), look: 'hoa.head', fov: 22 }, cues: [
      { k: 'expr', who: 'hoa', e: 'determined' }, say('tin', 'c2m2.cs.think1', { ch: 'inner', t: 0.4 }), { k: 'letterbox', on: false, t: 3.6 }], note: 'she sees it' },
  ],
};
/**
 * The red-light beat, started by a step watcher in the middle of the tail: the runner holds the step (timers,
 * fail rules, the tail's lose clock) while it plays, and the handoff puts the player back on the Dream 30 m behind
 * the van at its cruise speed, so the tail resumes where the scene found it.
 */
const tuanTra: Scene = {
  id: 'c2m2-tuan-tra', mission: 'c2-m2', title: '@c2m2.cs.tuanTra', kind: 'action', seconds: 10, skippable: true,
  stage: { at: 'nga-tu-108-54', radius: 40, crowd: 'keep', traffic: 'hold', police: 'pause' }, cast: { tin: 'tin', canhSat: 'tpl:ward-cop', taiXe: 'tpl:van-driver' },
  shots: [
    { dur: 3, cam: { k: 'shot', eye: at('nga-tu-108-54', -6, 3, 22), look: at('nga-tu-108-54', 3, 1, 9), fov: 45 }, cues: [
      { k: 'ride', id: 'xe-tuan-tra', model: 'police', path: [at('nga-tu-108-54', 5.2, 0, 30), at('nga-tu-108-54', 5.2, 0, 9)], speed: 6, driver: 'canhSat' }] },
    { dur: 4, cam: { k: 'shot', eye: at('nga-tu-108-54', 3.6, 1.3, 7), look: at('nga-tu-108-54', 4, 1.2, 9), fov: 38 }, cues: [
      { k: 'anim', who: 'canhSat', clip: 'nod' }, { k: 'anim', who: 'taiXe', clip: 'wave-small', t: 1.2 }, { k: 'anim', who: 'canhSat', clip: 'wave-on', t: 2.4 }],
      note: 'through the windscreens: the ward officer nods at the van driver and waves it on through the red' },
    { dur: 3, cam: { k: 'shot', eye: at('tin.head', 0.3, 0.1, -0.8), look: at('nga-tu-108-54', 2, 1, 9), fov: 40 }, cues: [say('tin', 'c2m2.cs.think2', { ch: 'inner' })],
      note: 'Tín, headlight off, behind a taxi 30 m back' },
  ],
  handoff: { player: { at: { at: 'vehicle:van-51d', off: [0, 0, -30] }, vehicle: 'bike', speed: 'cruise' }, camera: 'blend', ms: 600 },
};
const congKho: Scene = {
  id: 'c2m2-cong-kho', mission: 'c2-m2', title: '@c2m2.cs.congKho', kind: 'cutscene', seconds: 16, skippable: true,
  stage: { at: 'kho-7.gate', radius: 45, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 3.4, weather: 'cloudy', freezeClock: true } }, cast: { tin: 'tin' },
  shots: [
    { dur: 4, cam: { k: 'shot', eye: at('kho-7.gate', -6, 1.2, 6), look: 'kho-7.gate', fov: 40 }, cues: [{ k: 'letterbox', on: true }, { k: 'sfx', id: 'gate-screech' }, { k: 'prop', id: 'cong', kind: 'iron-gate', at: 'kho-7.gate', variant: 'closing' }] },
    { dur: 4, cam: { k: 'shot', eye: at('khe-kho-7.mouth', 0.6, 0.4, 2), look: 'khe-kho-7', fov: 45 }, cues: [
      { k: 'place', who: 'tin', at: 'khe-kho-7', pose: 'lie-flat' }, { k: 'fx', kind: 'headlight-sweep', at: 'khe-kho-7.mouth' }],
      note: 'headlights sweep the slot where Tín lies flat beside the Dream' },
    { dur: 8, cam: { k: 'crane', from: at('kho-7.gate', -20, 2, 12), to: at('kho-7', -30, 34, 40), look: at('kho-7', 0, 6, -10), fov: 55, ease: 'inOutSine' }, cues: [
      { k: 'fx', kind: 'condenser-vapour', at: 'kho-7.reefers' }, { k: 'fx', kind: 'mist', at: 'tau-hang.lee' },
      { k: 'prop', id: 'sen-vang-phai', kind: 'faded-lotus-mural', at: at('kho-7', 0, 7, 26.8) },
      { k: 'card', kind: 'location', text: '@c2m2.cs.loc', sub: '@c2m2.cs.locSub', t: 3 }, { k: 'letterbox', on: false, t: 7.6 }],
      note: 'crane up: the rusted tin-roofed warehouse a company rents on the Quận 4 quay, condenser fans breathing cold vapour, mist on the water, the cargo ship moored behind, a faded golden lotus on the wall' },
  ],
  handoff: { player: { at: 'khe-kho-7', vehicle: 'foot', crouch: true }, camera: 'blend', ms: 600 },
};

// ---- CS03 · PHÓNG VÔ Ổ (c2-m3, 53 s) ----------------------------------------------------------------------------
const cs03: Scene = {
  id: 'cs03_phong_vo_o', mission: 'c2-m3', title: '@cs03.title', kind: 'cutscene', seconds: 53, skippable: true,
  stage: { at: 'kho-7', radius: 60, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 3.6, weather: 'cloudy', freezeClock: true } },
  cast: {
    tin: 'tin', cuong: 'cuong', hoa: 'hoa', beti: 'beti', gac: 'gac', congNhan: 'cong-nhan',
    long: { template: 'captive-teen', count: 16, area: k7('cage'), size: [6, 5], poses: ['sit-hug-knees', 'sit', 'shield-younger', 'hum'] },
    thoXe: { template: 'worker', count: 5, area: k7('packing'), size: [8, 3], poses: ['work-table'] },
  },
  shots: [
    { dur: 4, label: 'kinh', cam: { k: 'shot', eye: at('tin.head', -0.35, 0.25, -0.6), look: 'kho-7.skylight', fov: 55 }, cues: [
      { k: 'letterbox', on: true }, { k: 'music', id: 'tension' }, { k: 'place', who: 'tin', at: 'kho-7.skylight', pose: 'squat' },
      { k: 'anim', who: 'tin', clip: 'wipe-glass' }, { k: 'fx', kind: 'breath-fog', at: 'kho-7.skylight' }, { k: 'sfx', id: 'compressor-hum' }, { k: 'ambience', id: 'condenser-fans' }] },
    { dur: 6, label: 'phong', cam: { k: 'rail', points: [at('kho-7.skylight', 0, 0.6, 0.3), at('kho-7.skylight', 0, -1, 0), k7('packingHigh'), at('kho-7.hall', -14, 3, 4)], look: [at('kho-7.skylight', 0, -6, 0), k7('packing'), k7('packing'), k7('packing')], fov: [55, 70, 70, 50], ease: 'inOutCubic' }, cues: [
      { k: 'hide', mesh: 'kho-7.skylight-glass' }, { k: 'sfx', id: 'swoop' }, { k: 'grade', id: 'cold' }, { k: 'fx', kind: 'freezer-mist', at: 'kho-7.hall' },
      { k: 'prop', id: 'den-ong', kind: 'swinging-tubes', at: at('kho-7.hall', 0, 7, 0) }],
      note: 'ONE continuous move: through the skylight (glass hidden), past swinging fluorescent tubes and hanging chains, down from 11 m to 3 m into white freezing mist, landing softly on the packing line where the next track takes over; the cage is not seen yet' },
    { dur: 6, label: 'day-chuyen', cam: { k: 'move', from: at('kho-7.hall', -14, 3, 4), to: at('kho-7.hall', -2, 3, 4), look: k7('packing'), fov: 50 }, cues: [
      { k: 'ride', id: 'xe-nang', model: 'forklift', path: [k7('forklift'), at('kho-7.hall', -12, 0, 10)], speed: 1.5 }, { k: 'sfx', id: 'forklift-beep' },
      { k: 'prop', id: 'tui-cam', kind: 'orange-delivery-bags', at: k7('packing') }, { k: 'prop', id: 'goi-xam', kind: 'grey-blocks', at: k7('packing') },
      { k: 'place', who: 'congNhan', at: k7('packing'), pose: 'work-table' }, say('congNhan', 'cs03.cn1', { t: 1.5 })],
      note: 'workers in rubber aprons slit frozen fish and slip sealed packets (grey blocks, kept in shadow, no detail) into orange bags identical to the app\'s' },
    { dur: 7.5, label: 'long', cam: { k: 'move', from: at('kho-7.hall', 4, 1.6, -4), to: at('kho-7.hall', 14, 1.6, -4), look: k7('cage'), fov: 40 }, cues: [
      { k: 'prop', id: 'long-sat', kind: 'chain-link-cage', at: k7('cage') }, { k: 'place', who: 'beti', at: k7('cageIn'), pose: 'sit-hug-knees' },
      { k: 'prop', id: 'gau', kind: 'torn-bear', attach: 'beti.handL' }, { k: 'sfx', id: 'humming-girl' },
      { k: 'pair', clip: 'lead-by-arm', a: 'gac', b: 'hoa', t: 3 }, { k: 'walk', who: 'hoa', path: [k7('cageDoor'), k7('cageIn')], t: 3 },
      { k: 'anim', who: 'hoa', clip: 'hug-smaller', t: 6.2 }],
      note: 'about twenty young people on cardboard under thin blankets; Bé Tí clutches a torn bear; Hoa is led in and at once hugs a smaller girl. Nobody is struck.' },
    { dur: 10, label: 'cuong', cam: { k: 'shot', eye: at('kho-7.hall', 2, 1.6, 6), look: k7('cuongStop'), fov: 55 }, cues: [
      say('congNhan', 'cs03.cn2', { t: 0.3 }), { k: 'walk', who: 'cuong', path: [k7('aisle'), k7('cuongStop')] }, { k: 'sfx', id: 'flipflop-wet' },
      { k: 'card', kind: 'intro', who: 'cuong', text: '@cs03.introName', sub: '@cs03.introRole', t: 0.8 }, { k: 'anim', who: 'cuong', clip: 'flick-cigarette', t: 2.5 },
      say('cuong', 'cs03.cuong1', { t: 2.2 }), say('cuong', 'cs03.cuong2', { t: 5.8 })],
      note: 'a worker calls out his name as he comes down the aisle toward the cage: the only place Tín hears it' },
    { dur: 6, label: 'ca-dau', cam: { k: 'twoShot', a: 'cuong', b: 'gac', fov: 45 }, cues: [
      { k: 'place', who: 'gac', at: k7('cageDoor'), pose: 'stand' }, { k: 'anim', who: 'gac', clip: 'rattle-cage' }, say('gac', 'cs03.gac1', { t: 0.2 }),
      { k: 'anim', who: 'cuong', clip: 'cuff-head', t: 2.4 }, say('cuong', 'cs03.cuong3', { t: 2.8 })],
      note: 'the guard rattles the chain link and jeers at the crying children; Cường cuffs the back of his head (the flicker c10-m3 pays off)' },
    { dur: 4, label: 'dien-thoai', cam: { k: 'shot', eye: at('cuong.head', 0.2, 0, 0.9), look: 'cuong.head', fov: 30 }, cues: [
      { k: 'sfx', id: 'phone-vibrate' }, { k: 'anim', who: 'cuong', clip: 'talk-phone' }, { k: 'expr', who: 'cuong', e: 'neutral' }, say('cuong', 'cs03.cuong4', { ch: 'phone', t: 1 })],
      note: 'his voice softens' },
    { dur: 3, label: 'bang-trang', cam: { k: 'snapZoom', target: k7('whiteboard'), from: 70, to: 12 }, cues: [
      { k: 'prop', id: 'bang', kind: 'whiteboard', at: k7('whiteboard'), lines: ['@cs03.board'] }] },
    { dur: 4, label: 'chuong', cam: { k: 'rail', points: [at('kho-7.hall', 4, 6, 0), at('kho-7.skylight', 0, -1, 0), at('tin.head', 0, 0.05, 0.35)], look: [at('kho-7.skylight', 0, 0, 0), 'tin.head', 'tin.head'], fov: [60, 40, 12], ease: 'outExpo' }, cues: [
      { k: 'hide', mesh: 'kho-7.skylight-glass', on: false, t: 2 }, { k: 'phoneScreen', who: 'tin', text: '@cs03.ring', t: 2.4 }, { k: 'sfx', id: 'ringtone-loud', t: 2.4 }],
      note: 'the camera rockets back up through the skylight and lands on an extreme close-up of Tín\'s pupils, the phone lighting his face' },
    { dur: 2.5, label: 'tren-mai', cam: { k: 'shot', eye: at('kho-7.hall', -2, 0.3, -2), look: 'kho-7.skylight', fov: 70 }, cues: [
      { k: 'anim', who: 'gac', clip: 'flashlight-up' }, { k: 'prop', id: 'den-pin', kind: 'fake-flashlight', attach: 'gac.handR' },
      say('gac', 'cs03.gac2', { t: 0.2 }), { k: 'letterbox', on: false, t: 2.3 }] },
  ],
  handoff: { player: { at: 'kho-7.skylight', vehicle: 'foot', crouch: true }, camera: 'cut' },
  notes: 'Signature shot. Hand-off is a smash cut into the escape with a heartbeat and the alarm already raised.',
};

// ---- c2-m3 · dawn on the Bến Nghé bank -------------------------------------------------------------------------
const binhMinh: Scene = {
  id: 'c2m3-binh-minh', mission: 'c2-m3', title: '@c2m3.cs.binhMinh', kind: 'cutscene', seconds: 18, skippable: true,
  stage: { at: 'bo-ben-nghe', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 5.6, weather: 'clear', freezeClock: true } }, cast: { tin: 'tin' },
  shots: [
    { dur: 5, cam: { k: 'crane', from: at('bo-ben-nghe', -8, 9, -6), to: at('bo-ben-nghe', -2, 1.6, -2.5), look: 'tin.head', fov: [55, 40] }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'dawn' }, { k: 'music', id: 'theme-loss' },
      { k: 'place', who: 'tin', at: 'bo-ben-nghe', pose: 'sit-hug-knees', if: { k: 'flag', name: 'escapeRoute', eq: 'song' } },
      { k: 'fx', kind: 'dripping-wet', at: 'tin', if: { k: 'flag', name: 'escapeRoute', eq: 'song' } },
      { k: 'place', who: 'tin', at: 'bo-ben-nghe', pose: 'sit-on-bike', if: { k: 'flag', name: 'escapeRoute', eq: 'khe' } },
      { k: 'anim', who: 'tin', clip: 'tremble' }],
      note: 'soaked and shaking after the swim (route a) or shaking astride the Dream (route b)' },
    { dur: 5, cam: { k: 'insert', target: 'tin.handR', fov: 20, dist: 0.3 }, cues: [{ k: 'phoneScreen', who: 'tin', text: '@c2m3.cs.album', sub: '@c2m3.cs.mo' }],
      note: 'he takes the phone out of its waterproof pouch and scrolls his photos: all blurred' },
    { dur: 4, cam: { k: 'insert', target: 'tin.handR', fov: 16, dist: 0.25 }, cues: [{ k: 'phoneScreen', who: 'tin', text: '@cs03.board' }, say('tin', 'c2m3.cs.think1', { ch: 'inner', t: 1 })],
      note: 'except the whiteboard' },
    { dur: 4, cam: { k: 'shot', eye: at('tin.head', 0.25, 0, 0.8), look: 'tin.head', fov: 30 }, cues: [
      { k: 'phoneScreen', who: 'tin', text: '@c2m3.cs.goiNho' }, { k: 'anim', who: 'tin', clip: 'phone-call' }, { k: 'letterbox', on: false, t: 3.6 }] },
  ],
};

export const CUTSCENES: Scene[] = [cs02, baGio, tuanTra, congKho, cs03, binhMinh];
