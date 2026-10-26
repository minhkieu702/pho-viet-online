import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Mark, Scene } from '../scene.ts';

/** Chapter 1 cutscenes as data (schema and conventions: story/scene.ts). Lines are '@keys' of text/vi/ch01.ts. */

const H = Math.PI / 2;
/** A point `off` metres from a mark (see Mark). */
const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; if?: Cond; t?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });

// ---- CS01 · Mở đầu (c1-m1, 70 s): cold open in B2, Tân Thuận at dawn, the coach into the city -------------------
const cs01: Scene = {
  id: 'cs01_mo_dau', mission: 'c1-m1', title: '@cs01.title', kind: 'cutscene', seconds: 70, skippable: true,
  stage: { at: 'ben-xe-an-hoa', radius: 40, crowd: 'hide', traffic: 'hold', police: 'pause', freezeWorld: true, env: { hours: 6, weather: 'rain', freezeClock: true } },
  sets: ['moonlight-b2', 'village-tan-thuan'],
  cast: {
    tin: 'tin', bana: 'bana', mai: 'mai', gac: 'gac', aoDen: 'tpl:debt-collector',
    dan: { template: 'villager', count: 3, area: 'set:village-tan-thuan.pond', size: [30, 20], poses: ['walk', 'squat'] },
  },
  shots: [
    { dur: 4, label: 'den', cam: { k: 'black' }, cues: [
      { k: 'letterbox', on: true }, { k: 'ambience', id: 'generator-drone' }, { k: 'sfx', id: 'compressor-hum' }, { k: 'sfx', id: 'lion-drums-muffled' }],
      note: 'Rằm night (c10): the strip is blacked out, a generator drones through the concrete and the lion-dance drums thud above, muffled; no rain, no club music' },
    { dur: 6, label: 'tron', cam: { k: 'shot', eye: at('tin.head', 0.05, 0.02, 0.45), look: 'tin.head', fov: 18, handheld: 0.4 }, cues: [
      { k: 'grade', id: 'cold' }, { k: 'place', who: 'tin', at: 'set:moonlight-b2.crates', pose: 'squat' }, { k: 'expr', who: 'tin', e: 'pain' },
      { k: 'fx', kind: 'breath-fog', at: 'tin.head' }], note: 'B2 dark variant, red emergency light; split lip (make-up only, no wound)' },
    { dur: 5, label: 'den-pin', cam: { k: 'shot', eye: at('set:moonlight-b2.aisle', 0, 0.2, 0), look: 'set:moonlight-b2.lotus', fov: 70 }, cues: [
      { k: 'slowmo', scale: 0.4, seconds: 5 }, { k: 'prop', id: 'den-pin', kind: 'fake-flashlight', attach: 'gac.handR' },
      { k: 'walk', who: 'gac', path: ['set:moonlight-b2.door', 'set:moonlight-b2.aisle'], pace: 'walk' },
      say('gac', 'cs01.gac', { t: 1.5 }), { k: 'prop', id: 'sen-than', kind: 'charcoal-lotus', at: 'set:moonlight-b2.lotus' }],
      note: 'the beam sweeps right to left and lights the charcoal lotus for a moment (B2 foreshadow); the guard stays off-frame above the boots' },
    { dur: 3, label: 'ba-tuan', cam: { k: 'black' }, cues: [{ k: 'sfx', id: 'smash-cut' }, { k: 'card', kind: 'time', text: '@cs01.card' }] },
    { dur: 8, label: 'dam-sen', cam: { k: 'crane', from: at('set:village-tan-thuan.pond', 0, 20, 12), to: at('set:village-tan-thuan.pond', 0, 3, 4), look: 'set:village-tan-thuan.stilt', fov: 50, ease: 'inOutSine' }, cues: [
      { k: 'grade', id: 'dawn' }, { k: 'music', id: 'theme-home' }, { k: 'fx', kind: 'mist', at: 'set:village-tan-thuan.pond' }, { k: 'sfx', id: 'rooster' },
      { k: 'ride', id: 'xuong', model: 'sampan', path: [at('set:village-tan-thuan.pond', -12, 0, 2), at('set:village-tan-thuan.pond', 12, 0, 3)], speed: 1.2 },
      { k: 'walk', who: 'bana', path: ['set:village-tan-thuan.steps', 'set:village-tan-thuan.door'], pace: 'walk' }] },
    { dur: 9, label: 'chi-do', cam: { k: 'move', from: at('set:village-tan-thuan.door', 0, 1.5, 3.2), to: at('set:village-tan-thuan.door', 0, 1.45, 2.2), look: [at('tin', 0, 1.2, 0), at('tin.handL', 0, 0, 0)], fov: 40, ease: 'inOutSine' }, cues: [
      { k: 'place', who: 'tin', at: 'set:village-tan-thuan.door', pose: 'stand' }, { k: 'place', who: 'bana', at: at('set:village-tan-thuan.door', 0.6, 0, 0.4) },
      { k: 'pair', clip: 'tie-bracelet', a: 'bana', b: 'tin' }, { k: 'prop', id: 'chi-do', kind: 'lotus-bracelet', attach: 'tin.handL' },
      say('bana', 'cs01.bana1', { t: 1 }), say('bana', 'cs01.bana2', { t: 4.5 }),
      { k: 'prop', id: 'phong-bi', kind: 'envelope', attach: 'bana.handR', t: 7.5 }],
      note: 'Má smooths the string with her thumb, then presses a folded envelope (1 triệu, never mentioned aloud) into his hand' },
    { dur: 8, label: 'ut-mai', cam: { k: 'ots', speaker: 'mai', listener: 'tin', side: 'right', fov: 40 }, cues: [
      { k: 'place', who: 'mai', at: at('set:village-tan-thuan.door', -1, 0, 0.8) }, { k: 'anim', who: 'mai', clip: 'bounce' },
      { k: 'prop', id: 'tra-sen', kind: 'lotus-tea-packet', attach: 'mai.handR' }, { k: 'pair', clip: 'handover', a: 'mai', b: 'tin' },
      say('mai', 'cs01.mai1'), say('mai', 'cs01.mai2', { t: 3.2 }), say('tin', 'cs01.tin1', { t: 6.4 })] },
    { dur: 7, label: 'giay-no', cam: { k: 'shot', eye: at('set:village-tan-thuan.door', 1.4, 1.5, 4.5), look: 'set:village-tan-thuan.notice', fov: 35 }, cues: [
      { k: 'pair', clip: 'hug', a: 'tin', b: 'mai' },
      { k: 'walk', who: 'aoDen', path: [at('set:village-tan-thuan.notice', 3, 0, 1), 'set:village-tan-thuan.notice'], pace: 'walk' },
      { k: 'prop', id: 'thong-bao', kind: 'debt-notice', at: 'set:village-tan-thuan.notice', text: '@cs01.notice', t: 2 },
      { k: 'walk', who: 'bana', path: ['set:village-tan-thuan.notice'], pace: 'walk', t: 4 }, { k: 'anim', who: 'bana', clip: 'tear-down-hide', t: 5.2 },
      { k: 'prop', id: 'thong-bao', kind: 'debt-notice', remove: true, t: 6 }],
      note: 'rack focus: Tín and Mai soft in the foreground, the door sharp; the man in black (a debt collector of the ring) pastes the golden-lotus notice, Má tears it down and hides it behind her back; Tín never turns round' },
    { dur: 10, label: 'xe-do', cam: { k: 'rail', points: [at('ride:xe-do', 1.2, 1.7, 2), at('ride:xe-do', 3, 2.5, 0), at('ride:xe-do', 10, 22, -8), at('thap-phuong-nam', -60, 120, -40)], look: ['tin.head', 'tin.head', 'ride:xe-do', at('thap-phuong-nam', 0, 200, 8)], fov: [40, 45, 55, 50], ease: 'inOutSine' }, cues: [
      { k: 'grade', id: 'dawn' }, { k: 'fx', kind: 'rain-on-lens' },
      { k: 'ride', id: 'xe-do', model: 'coach', path: [at('ben-xe-an-hoa.coach', 300, 0, 0), at('ben-xe-an-hoa.coach', 120, 0, 0)], speed: 14, paint: '#2c6e9b', passengers: ['tin'] },
      { k: 'anim', who: 'tin', clip: 'forehead-glass' }, { k: 'hide', mesh: 'ride:xe-do.window' }],
      note: 'P0: the coach enters along the riverside road from the east edge; the camera pulls back through the rain-streaked window and rises until THÁP PHƯƠNG NAM catches the sun. P1 upgrade: the same rail over CẦU KHÁNH HỘI (411, -108).' },
    { dur: 5, label: 'tua', cam: { k: 'shot', eye: at('thap-phuong-nam', -90, 110, -60), look: at('thap-phuong-nam', 0, 180, 0), fov: 55 }, cues: [
      { k: 'card', kind: 'title', text: '@cs01.titleCard' }] },
    { dur: 5, label: 'ben-xe', cam: { k: 'shot', eye: at('ben-xe-an-hoa', 1.5, 0.35, 1.2), look: at('ben-xe-an-hoa.coach', 0, 0.9, 0), fov: 60 }, cues: [
      { k: 'ride', id: 'xe-do', model: 'coach', path: ['ben-xe-an-hoa.coach'], speed: 0 }, { k: 'sfx', id: 'door-hiss' },
      { k: 'prop', id: 'bang-ben-xe', kind: 'sign', at: 'ben-xe-an-hoa.sign', text: '@cs01.sign' },
      { k: 'place', who: 'tin', at: 'ben-xe-an-hoa', pose: 'step-down' }, { k: 'prop', id: 'tui', kind: 'duffel', attach: 'tin.handR' },
      say('tin', 'cs01.tin2', { ch: 'inner', t: 2 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'canvas sneakers step into a puddle reflecting a shuttered neon sign' },
  ],
  handoff: { player: { at: 'ben-xe-an-hoa', yaw: H, vehicle: 'foot', outfit: 'tin-que' }, camera: 'blend', ms: 800 },
};

// ---- c1-m1 · the window of the attic --------------------------------------------------------------------------
const cuaSo: Scene = {
  id: 'c1m1-cua-so', mission: 'c1-m1', title: '@c1m1.cs.cuaSo', kind: 'cutscene', seconds: 11, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 20, crowd: 'keep', traffic: 'keep', police: 'keep' }, sets: ['attic'], cast: { tin: 'tin' },
  shots: [
    { dur: 3, cam: { k: 'shot', eye: at('set:attic.window', 0.5, 1.5, 1.2), look: 'set:attic.window', fov: 45 }, cues: [{ k: 'place', who: 'tin', at: 'set:attic.window' }, { k: 'anim', who: 'tin', clip: 'open-shutters' }, { k: 'sfx', id: 'shutter-wood' }],
      note: "inside the attic, behind Tín's shoulder as he pushes the shutters open" },
    { dur: 8, cam: { k: 'move', from: at('cafe-co-ba', 0, 8.6, -0.3), to: at('cafe-co-ba', 1.5, 9.4, -3), look: at('thap-phuong-nam', 0, 160, 0), fov: [48, 40], ease: 'inOutSine' }, cues: [
      { k: 'grade', id: 'warm' }, say('tin', 'c1m1.cs.cuaSo1', { ch: 'inner' }), say('tin', 'c1m1.cs.cuaSo2', { ch: 'inner', t: 3.4 })],
      note: 'on-map view from just outside the attic window (-30, 14.4, y 8.6; the facade is z 15.5) north over An Hòa to THÁP PHƯƠNG NAM' },
  ],
  handoff: { player: { at: 'set:attic.window', vehicle: 'foot' }, camera: 'cut' },
};

// ---- c1-m2 · Ông Tư's shop, the plate test, the snatched order ------------------------------------------------
const tiem: Scene = {
  id: 'c1m2-tiem', mission: 'c1-m2', title: '@c1m2.cs.tiem', kind: 'cutscene', seconds: 27, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 18, crowd: 'keep', traffic: 'keep', police: 'pause' },
  cast: { tin: 'tin', tu: 'tu', quang: 'quang' },
  shots: [
    { dur: 4, cam: { k: 'insert', target: 'tu.handR', fov: 22, dist: 0.5 }, cues: [
      { k: 'place', who: 'tu', at: 'xe-may-ong-tu.tarp', pose: 'squat' }, { k: 'prop', id: 'bugi', kind: 'spark-plug', attach: 'tu.handR' },
      { k: 'anim', who: 'tu', clip: 'turn-spark-plug', loop: true }, { k: 'sfx', id: 'wrench-tick' }, { k: 'music', id: 'theme-home' }],
      note: 'oily hands turning a spark plug over the battered maroon Dream' },
    { dur: 5, cam: { k: 'shot', eye: at('tu.head', 0.6, 0.1, 1.4), look: 'tu.head', fov: 35 }, cues: [
      { k: 'place', who: 'tin', at: at('xe-may-ong-tu.tarp', 1.6, 0, 1) }, { k: 'place', who: 'quang', at: at('xe-may-ong-tu.tarp', 2.5, 0, 0.6) },
      { k: 'look', who: 'tu', at: 'tin.head' }, say('tu', 'c1m2.cs.tiem1'), say('tin', 'c1m2.cs.tiem2', { t: 2.6 })] },
    { dur: 6, cam: { k: 'twoShot', a: 'tu', b: 'tin', fov: 42 }, cues: [
      { k: 'anim', who: 'tu', clip: 'pat-seat' }, say('tu', 'c1m2.cs.tiem3'), say('tu', 'c1m2.cs.tiem4', { t: 3.2 })] },
    { dur: 7, cam: { k: 'ots', speaker: 'tu', listener: 'tin', side: 'left', fov: 40 }, cues: [
      say('tin', 'c1m2.cs.tiem5'), say('tu', 'c1m2.cs.tiem6', { t: 1.8 }), say('tin', 'c1m2.cs.tiem7', { t: 5.6 })] },
    { dur: 5, cam: { k: 'shot', eye: at('tin.head', -0.4, 0.2, -0.7), look: at('xe-may-ong-tu.plateCar', 0, 1, 0), fov: 45 }, cues: [
      { k: 'anim', who: 'tin', clip: 'sit-stool' }, say('tu', 'c1m2.cs.tiem8')] },
  ],
  handoff: { player: { at: at('xe-may-ong-tu.tarp', 1.6, 0, 1), vehicle: 'foot' }, camera: 'cut' },
};
const bienSo: Scene = {
  id: 'c1m2-bien-so', mission: 'c1-m2', title: '@c1m2.cs.bienSo', kind: 'action', seconds: 6, skippable: false,
  stage: { at: 'xe-may-ong-tu.plateCar', radius: 30, crowd: 'keep', traffic: 'hold', police: 'pause' }, cast: { tin: 'tin', tu: 'tu' },
  shots: [
    { dur: 2, cam: { k: 'shot', eye: at('tin.head', 0, 0.05, 0.1), look: 'xe-may-ong-tu.plateCar', fov: 50 }, cues: [
      { k: 'ride', id: 'xe-trang', model: 'sedan', path: [at('xe-may-ong-tu.plateCar', 30, 0, 0), at('xe-may-ong-tu.plateCar', -40, 0, 0)], speed: 9, plate: '51F-386.27', paint: '#e8e8e4' }] },
    { dur: 2.5, cam: { k: 'follow', target: 'ride:xe-trang', offset: [0, 1.4, -6], fov: 40, lag: 0.3 }, note: 'the rear plate reads clearly for about 1.2 s, no insert: the test is noticing' },
    { dur: 1.5, cam: { k: 'shot', eye: at('tu.head', 0.4, 0.1, 1.2), look: 'tu.head', fov: 35 }, cues: [{ k: 'look', who: 'tu', at: 'tin.head' }] },
  ],
};
const matTot: Scene = {
  id: 'c1m2-mat-tot', mission: 'c1-m2', title: '@c1m2.cs.matTot', kind: 'cutscene', seconds: 12, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 18, crowd: 'keep', traffic: 'keep', police: 'pause' }, sets: ['xe-may-shop'], cast: { tin: 'tin', tu: 'tu' },
  shots: [
    { dur: 5, cam: { k: 'move', from: at('tu.head', 0.5, 0, 1.6), to: at('tu.head', 0.3, 0, 1), look: 'tu.head', fov: [36, 30] }, cues: [
      { k: 'anim', who: 'tu', clip: 'glasses-down' },
      say('tu', 'c1m2.cs.matTot1', { if: { k: 'flag', name: 'plateMissed', eq: false } }),
      say('tu', 'c1m2.cs.matTot1b', { if: { k: 'flag', name: 'plateMissed' } })] },
    { dur: 4, cam: { k: 'shot', eye: at('tu.head', 0.15, 0.05, 0.7), look: 'tu.head', fov: 26 }, cues: [say('tu', 'c1m2.cs.matTot2')] },
    { dur: 3, cam: { k: 'move', from: at('set:xe-may-shop.shelf', 1.6, 0.3, 1.2), to: at('set:xe-may-shop.shelf', 0.3, 0.2, 0.7), look: 'set:xe-may-shop.shelf', fov: 32 }, cues: [
      { k: 'prop', id: 'anh-up', kind: 'photo-frame-facedown', at: 'set:xe-may-shop.shelf' }],
      note: 'cut inside the shop set: the camera drifts past an old photo turned face-down on the shelf (paid off in c3-m3)' },
  ],
};
const quangGiat: Scene = {
  id: 'c1m2-quang-giat', mission: 'c1-m2', title: '@c1m2.cs.giat', kind: 'cutscene', seconds: 20, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 18, crowd: 'keep', traffic: 'keep', police: 'pause' }, cast: { tin: 'tin', quang: 'quang' },
  shots: [
    { dur: 3, cam: { k: 'insert', target: 'tin.handR', fov: 20, dist: 0.35 }, cues: [
      { k: 'phoneScreen', who: 'tin', text: '@c1m2.order.blank', sub: '@c1m2.cs.giatNhan' }, { k: 'sfx', id: 'app-ding' }] },
    { dur: 2, cam: { k: 'insert', target: 'tin.handR', fov: 18, dist: 0.3 }, cues: [{ k: 'phoneScreen', who: 'tin', text: '@c1m2.order.blank', sub: '@c1m2.cs.giatMat' }] },
    { dur: 3, cam: { k: 'shot', eye: at('quang.head', 0.3, 0, 1.6), look: 'quang.head', fov: 34 }, cues: [
      { k: 'place', who: 'quang', at: at('xe-may-ong-tu.tarp', 2.5, 0, 0.6), pose: 'sit-stool' }, { k: 'anim', who: 'quang', clip: 'wave-phone' }, { k: 'expr', who: 'quang', e: 'smile' },
      say('quang', 'c1m2.cs.giat1')] },
    { dur: 3, cam: { k: 'insert', target: 'quang.handR', fov: 18, dist: 0.3 }, cues: [{ k: 'phoneScreen', who: 'quang', text: '@c1m2.cs.giatList' }],
      note: 'his list: night orders {@code}-0401…0409, every one "Khách: (trống)"' },
    { dur: 5, cam: { k: 'ots', speaker: 'tin', listener: 'quang', side: 'right', fov: 38 }, cues: [say('tin', 'c1m2.cs.giat2'), say('quang', 'c1m2.cs.giat3', { t: 2.6 })] },
    { dur: 4, cam: { k: 'shot', eye: at('quang.head', 0.2, 0, 0.8), look: 'quang.head', fov: 26 }, cues: [
      say('quang', 'c1m2.cs.giat4'), { k: 'look', who: 'quang', at: at('xe-may-ong-tu.plateCar', -20, 1, 0) }],
      note: 'his eyes slide away' },
  ],
};

// ---- c1-m3 · the call from home, the attic at night --------------------------------------------------------------
const goiMa: Scene = {
  id: 'c1m3-goi-ma', mission: 'c1-m3', title: '@c1m3.cs.goiMa', kind: 'cutscene', seconds: 37, skippable: true,
  stage: { at: 'cafe-co-ba.pickup', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 18.4, weather: 'rain', freezeClock: true } },
  sets: ['village-tan-thuan'], cast: { tin: 'tin', bana: 'bana', mai: 'mai' },
  shots: [
    { dur: 4, cam: { k: 'shot', eye: at('cafe-co-ba.pickup', 2.2, 1.4, 1.5), look: 'tin.head', fov: 40 }, cues: [
      { k: 'place', who: 'tin', at: 'cafe-co-ba.pickup', pose: 'stand' }, { k: 'fx', kind: 'awning-drip', at: 'cafe-co-ba.pickup' },
      { k: 'phoneScreen', who: 'tin', text: '@c1m3.cs.goiMaRing' }, { k: 'sfx', id: 'phone-ring' }] },
    { dur: 10, cam: { k: 'split', divider: 'diagonal', names: ['@cast.tin', '@cast.bana'],
      left: { k: 'shot', eye: at('tin.head', 0.3, 0, 1), look: 'tin.head', fov: 35 },
      right: { k: 'shot', eye: at('set:village-tan-thuan.stiltIn', 1.2, 1.4, 1.4), look: 'bana.head', fov: 38 } }, cues: [
      { k: 'place', who: 'bana', at: 'set:village-tan-thuan.stiltIn', pose: 'sit' }, { k: 'fx', kind: 'roof-leak', at: 'set:village-tan-thuan.stiltIn' },
      say('bana', 'c1m3.cs.ma1', { ch: 'phone' }), say('bana', 'c1m3.cs.ma2', { ch: 'phone', t: 3 }), say('bana', 'c1m3.cs.ma2b', { ch: 'phone', t: 6.6 })] },
    { dur: 8, cam: { k: 'split', divider: 'diagonal', names: ['@cast.tin', '@cast.bana'],
      left: { k: 'shot', eye: at('tin.head', 0.2, 0, 0.7), look: 'tin.head', fov: 30 },
      right: { k: 'shot', eye: at('bana.head', 0.2, 0, 0.8), look: 'bana.head', fov: 30 } }, cues: [
      { k: 'expr', who: 'bana', e: 'worried' }, say('bana', 'c1m3.cs.ma3', { ch: 'phone' }), say('bana', 'c1m3.cs.ma4', { ch: 'phone', t: 3.3 })] },
    { dur: 6, cam: { k: 'shot', eye: at('tin.head', 0.1, 0, 0.6), look: 'tin.head', fov: 26, handheld: 0.3 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c1m3.cs.tin1', { ch: 'phone' }), say('tin', 'c1m3.cs.tin2', { ch: 'phone', t: 3 })] },
    { dur: 5, cam: { k: 'split', divider: 'vertical', names: ['@cast.tin', '@cast.mai'],
      left: { k: 'shot', eye: at('tin.head', 0.3, 0, 1), look: 'tin.head', fov: 35 },
      right: { k: 'shot', eye: at('mai.head', 0.3, 0, 0.9), look: 'mai.head', fov: 34 } }, cues: [
      { k: 'place', who: 'mai', at: at('set:village-tan-thuan.stiltIn', 0.7, 0, 0.3) }, { k: 'expr', who: 'mai', e: 'smile' },
      say('mai', 'c1m3.cs.mai1', { ch: 'phone' })] },
    { dur: 4, cam: { k: 'insert', target: 'tin.handL', fov: 24, dist: 0.4 }, cues: [{ k: 'prop', id: 'chi-do', kind: 'lotus-bracelet', attach: 'tin.handL' }],
      note: 'rain runs over the red string and the single lotus seed' },
  ],
  handoff: { player: { at: 'cafe-co-ba.pickup', vehicle: 'bike' }, camera: 'blend', ms: 600 },
};
const gacDem: Scene = {
  id: 'c1m3-gac-dem', mission: 'c1-m3', title: '@c1m3.cs.gacDem', kind: 'cutscene', seconds: 30, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 10, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 23.3, weather: 'rain', freezeClock: true } },
  sets: ['attic'], cast: { tin: 'tin', coba: 'coba' },
  shots: [
    { dur: 5, cam: { k: 'insert', target: 'set:attic.wall', fov: 30, dist: 0.8 }, cues: [
      { k: 'anim', who: 'tin', clip: 'chalk-write' }, { k: 'sfx', id: 'chalk' }, { k: 'prop', id: 'so-no', kind: 'chalk-text', at: 'set:attic.wall', text: '@c1m3.cs.chalk' }] },
    { dur: 4, cam: { k: 'shot', eye: at('set:attic.wall', -1.6, 1.3, 2.6), look: 'set:attic.wall', fov: 45 }, cues: [{ k: 'anim', who: 'tin', clip: 'sit-hug-knees' }] },
    { dur: 4, cam: { k: 'shot', eye: at('set:attic.door', 1.2, 1.5, 2.4), look: 'set:attic.door', fov: 40 }, cues: [
      { k: 'sfx', id: 'knock' }, { k: 'place', who: 'coba', at: 'set:attic.door' }, { k: 'prop', id: 'to-hu-tieu', kind: 'noodle-bowl', attach: 'coba.handR' },
      say('coba', 'c1m3.cs.coba1', { t: 1 })] },
    { dur: 6, cam: { k: 'twoShot', a: 'coba', b: 'tin', fov: 40 }, cues: [
      { k: 'pair', clip: 'handover', a: 'coba', b: 'tin' }, say('coba', 'c1m3.cs.coba2'), say('coba', 'c1m3.cs.coba3', { t: 2.6 })] },
    { dur: 4, cam: { k: 'shot', eye: at('coba.head', 0.3, 0, 1.1), look: 'coba.head', fov: 32 }, cues: [
      { k: 'look', who: 'coba', at: 'set:attic.wall' }, say('coba', 'c1m3.cs.coba4')] },
    { dur: 4, cam: { k: 'ots', speaker: 'tin', listener: 'coba', side: 'right', fov: 36 }, cues: [say('tin', 'c1m3.cs.tin3')] },
    { dur: 3, cam: { k: 'shot', eye: at('set:attic.door', 0, 1.6, 3), look: 'set:attic.door', fov: 45 }, cues: [
      { k: 'walk', who: 'coba', path: ['set:attic.door', 'set:attic.stairs'] }, { k: 'sfx', id: 'stairs-down' }, { k: 'music', id: 'theme-home', fade: 2 }],
      note: 'she says nothing and goes downstairs (paid off in ch.9)' },
  ],
  handoff: { player: { at: 'set:attic.wall', vehicle: 'foot' }, camera: 'cut' },
};

export const CUTSCENES: Scene[] = [cs01, cuaSo, tiem, bienSo, matTot, quangGiat, goiMa, gacDem];
