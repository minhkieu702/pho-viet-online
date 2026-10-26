import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Mark, Scene } from '../scene.ts';

/**
 * Chapter 6 cutscenes as data (schema and conventions: story/scene.ts). Lines are '@keys' of text/vi/ch06.ts;
 * 'set:xe-may-shop.<anchor>' marks are the off-map anchors declared in content/ch06.ts ANCHORS (with chapter 3's);
 * 'ch6.*' marks are the chapter's places. CS05 "Sen bị hái" is the bible's shot list (45 s; Phượng's first lines with
 * the abbot are overheard in play just before it). CS06 "Lửa ở tiệm xe" plays in three parts like CS04, as the bible
 * splits it around gameplay: 'cs06_lua_tiem_xe' (the shutter gap, the box, the wrench), 'cs06_lua_tiem_xe_mai' (the
 * roof-gap POV and Cường; after the rooftop play) and 'cs06_lua_tiem_xe_coi' (the whistle, the plate question; after
 * the smoke). The short scenes are the deck's jump gate (c6-m1, it shows the player the finale's jump), Cô Ba on the
 * back stairs, the pier, the iron box opened (its false bottom) and the prayer service (c6-m3).
 * Violence stays off screen: Ông Tư's two blows are heard through the smoke and the men are seen down after it,
 * Cường's blow is cut away from, Ông Tư dies of no visible wound; Quang is never struck in a scene (the punch, if the
 * player throws it, is gameplay). The pagoda sees ceremony and mourning only.
 */

const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; if?: Cond; t?: number; dur?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });
const shop = (anchor: string) => `set:xe-may-shop.${anchor}`;
const clean: Cond = { k: 'conscience', is: 'clean' };
const punched: Cond = { k: 'flag', name: 'punchedQuang' };

// ---- CS05 · Sen bị hái: the pagoda yard, Phượng and the lotus (45 s) -------------------------------------------
const cs05: Scene = {
  id: 'cs05_sen_bi_hai', mission: 'c6-m1', title: '@cs05.title', kind: 'cutscene', seconds: 45, skippable: true,
  stage: { at: 'chua-an-hoa', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 8.6, weather: 'clear', freezeClock: true } },
  cast: {
    tin: 'tin', phuong: 'phuong', thay: 'thay-minh-tinh', taiXe: 'tai-xe-phuong', van: 'van',
    phatTu: { template: 'resident', count: 12, area: at('chua-an-hoa', -1.6, 0, -2.2), size: [11, 3], poses: ['kneel'] },
    veSi: { template: 'bodyguard', count: 2, area: 'chua-an-hoa.gate', size: [3, 1.5], poses: ['stand'] },
  },
  shots: [
    { dur: 6, label: 'khoi-nhang', cam: { k: 'crane', from: at('ch6.lu-huong', -2, 12, -7), to: at('ch6.lu-huong', -1.5, 3.2, -5), look: 'ch6.lu-huong', fov: [55, 48], ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'fx', kind: 'incense-smoke', at: 'ch6.lu-huong' }, { k: 'sfx', id: 'mo-go' }, { k: 'sfx', id: 'chanting', t: 0.5 },
      { k: 'prop', id: 'bang-ron', kind: 'banner', at: at('chua-an-hoa.gate', 0, 2.6, 1), text: '@cs05.banner' },
      { k: 'prop', id: 'bao-gao', kind: 'rice-sacks', at: at('chua-an-hoa.matE', 2.5, 0, -1.5) },
      { k: 'place', who: 'tin', at: 'chua-an-hoa.matW', pose: 'kneel' }, { k: 'place', who: 'van', at: 'chua-an-hoa.matE', pose: 'kneel' },
      { k: 'place', who: 'phuong', at: 'ch6.lu-huong', pose: 'stand' }, { k: 'place', who: 'thay', at: 'ch6.thay', pose: 'stand' },
      { k: 'place', who: 'taiXe', at: 'chua-an-hoa.gate', pose: 'stand' }],
      note: 'crane down through incense smoke: rice sacks under the MÁI ẤM banner, worshippers kneeling on the mats, the wooden fish and the chanting' },
    { dur: 6, label: 'thap-nhang', cam: { k: 'shot', eye: at('ch6.lu-huong', 1.2, 1.6, -3.2), look: 'phuong.head', fov: 40 }, cues: [
      { k: 'anim', who: 'phuong', clip: 'light-incense' }, { k: 'prop', id: 'nhang', kind: 'incense', attach: 'phuong.handR' },
      say('phuong', 'cs05.p1', { t: 0.4 }), say('thay', 'cs05.thay1', { t: 3.4 })],
      note: 'Phượng in a jade áo dài bows with Thầy Minh Tịnh and raises three sticks of incense; the abbot does not smile' },
    { dur: 5, label: 'dep', cam: { k: 'move', from: at('ch6.lu-huong', 0.6, 0.3, -1), to: at('chua-an-hoa.matW', 1.4, 1.5, -1.8), look: ['phuong.pelvis', 'tin.head'], fov: 45 }, cues: [
      { k: 'walk', who: 'phuong', path: ['ch6.lu-huong', at('chua-an-hoa.matW', 0.7, 0, -0.9)], pace: 'walk' },
      { k: 'card', kind: 'intro', who: 'phuong', text: '@cs05.introName', sub: '@cs05.introRole', t: 1.2 }, { k: 'look', who: 'tin', at: 'phuong.head', t: 2.6 }],
      note: 'track on her slippers along the paving, tilting up to find the orange jacket among the kneeling crowd' },
    { dur: 8, label: 'tuyen-tai-xe', cam: { k: 'twoShot', a: 'phuong', b: 'tin', fov: 40 }, cues: [
      { k: 'place', who: 'tin', at: 'chua-an-hoa.matW', pose: 'stand' },
      { k: 'prop', id: 'danh-thiep', kind: 'business-card', attach: 'phuong.handR', lines: ['@cs05.card1', '@cs05.card2'], t: 0.2 },
      say('phuong', 'cs05.p2', { t: 0.4 }), say('phuong', 'cs05.p3', { t: 3.0 }),
      { k: 'pair', clip: 'handover', a: 'phuong', b: 'tin', t: 2.6 }, { k: 'prop', id: 'danh-thiep', kind: 'business-card', attach: 'tin.handR', lines: ['@cs05.card1', '@cs05.card2'], t: 3.4 }],
      note: 'slow push-in; she hands him a card printed with a golden lotus' },
    { dur: 5, label: 'vong-tay', cam: { k: 'insert', target: 'tin.handL', fov: 25, dist: 0.4 }, cues: [
      { k: 'prop', id: 'vong-sen', kind: 'lotus-bracelet', attach: 'tin.handL' }, { k: 'prop', id: 'vong-ngoc', kind: 'jade-bangle', attach: 'phuong.handR' },
      { k: 'look', who: 'phuong', at: 'tin.handL' }, say('phuong', 'cs05.p4', { t: 0.3 }), say('phuong', 'cs05.p5', { t: 1.6 })],
      note: 'her gaze falls on the red string and the lotus seed; her jade bangle beside it' },
    { dur: 8, label: 'sua-co-ao', cam: { k: 'move', from: at('phuong.head', 0.15, 0, 1.1), to: at('phuong.head', 0.1, 0, 0.8), look: 'phuong.head', fov: 28, ease: 'inOutSine' }, cues: [
      { k: 'pair', clip: 'fix-collar', a: 'phuong', b: 'tin', t: 0.2 }, { k: 'expr', who: 'phuong', e: 'smile' },
      say('phuong', 'cs05.p6', { t: 0.6 }), say('phuong', 'cs05.p7', { t: 4.4 })],
      note: 'very slow push-in: she straightens his collar with both hands, smiling, and never raises her voice' },
    { dur: 4, label: 'nghien-rang', cam: { k: 'shot', eye: at('tin.head', -0.2, 0, 0.8), look: 'tin.head', fov: 28 }, cues: [{ k: 'expr', who: 'tin', e: 'angry' }],
      note: 'he does not move; his jaw tightens' },
    { dur: 3, label: 'quay-lung', cam: { k: 'shot', eye: at('ch6.lu-huong', -4, 8, -9), look: 'chua-an-hoa.gate', fov: 60 }, cues: [
      { k: 'walk', who: 'phuong', path: [at('chua-an-hoa.matW', 0.7, 0, -0.9), 'chua-an-hoa.gate'], pace: 'walk' },
      { k: 'walk', who: 'taiXe', path: ['chua-an-hoa.gate', at('chua-an-hoa.gate', 0, 0, -3)], pace: 'walk' },
      say('phuong', 'cs05.p8', { t: 0.2 }), { k: 'letterbox', on: false, t: 2.6 }],
      note: 'high wide: she walks away into the smoke without turning round; the bodyguards close in behind her' },
  ],
  handoff: { player: { at: 'chua-an-hoa.matW', vehicle: 'foot' }, camera: 'blend', ms: 600 },
};

// ---- c6-m1 · the jump gate on the 68th-floor deck (12 s) --------------------------------------------------------
const congNhay: Scene = {
  id: 'c6m1-cong-nhay', mission: 'c6-m1', title: '@c6m1.cs.cong', kind: 'cutscene', seconds: 12, skippable: true,
  stage: { at: 'dai-quan-sat-68', radius: 12, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 9.6, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin' },
  shots: [
    { dur: 5, label: 'cong', cam: { k: 'shot', eye: at('dai-quan-sat-68.gate', -1.2, 1.6, 0.6), look: 'san-thuong-tai-chinh.pad', fov: 50 }, cues: [
      { k: 'letterbox', on: true }, { k: 'place', who: 'tin', at: 'dai-quan-sat-68.gate', pose: 'stand' },
      { k: 'prop', id: 'bien-cong', kind: 'sign', at: at('dai-quan-sat-68.gate', 0, 1.2, 0), text: '@c6m1.cs.bien' },
      say('tin', 'c6m1.cs.t1', { ch: 'inner', t: 0.6 })],
      note: 'over his shoulder at the closed jump gate on the east edge; 51 m east and 64 m down, the roof pad with the black-and-gold helicopter' },
    { dur: 7, label: 'nhin-xuong', cam: { k: 'move', from: at('dai-quan-sat-68.gate', 1.5, 0.5, 0), to: at('san-thuong-tai-chinh.pad', -10, 14, 0), look: 'san-thuong-tai-chinh.pad', fov: [50, 38], ease: 'inOutCubic' }, cues: [
      say('tin', 'c6m1.cs.t2', { ch: 'inner', t: 1.2 }), { k: 'letterbox', on: false, t: 6.6 }],
      note: 'the camera drops off the edge and glides down toward the pad: the finale\'s jump, seen once in daylight' },
  ],
  handoff: { player: { at: 'dai-quan-sat-68.photo', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- CS06 · part 1: the shutter gap, the box, the wrench (16 s) --------------------------------------------------
const cs06: Scene = {
  id: 'cs06_lua_tiem_xe', mission: 'c6-m2', title: '@cs06.title', kind: 'cutscene', seconds: 16, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 20, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 22.3, weather: 'clear', freezeClock: true } },
  sets: ['xe-may-shop'],
  cast: { tin: 'tin', tu: 'tu', thugs: { template: 'ran-den', count: 8, area: at('xe-may-ong-tu', 0, 0, 4.5), size: [10, 3], poses: ['stand'] } },
  shots: [
    { dur: 3, label: 'ngoai-cua', cam: { k: 'shot', eye: at('xe-may-ong-tu', 4, 0.5, 9), look: at('xe-may-ong-tu', 0, 1.4, 4), fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'sfx', id: 'moto-rev' }, { k: 'fx', kind: 'fire', at: at('xe-may-ong-tu', 1.2, 1.1, 4.5), t: 1.2 }],
      note: 'outside: eight Rắn Đen with pipes in front of the shutter, one lighting a rag in a bottle' },
    { dur: 3, label: 'khe-cua', cam: { k: 'shot', eye: at(shop('shutter'), 0.4, 1.5, -0.8), look: 'tu.head', fov: 40 }, cues: [
      { k: 'place', who: 'tu', at: shop('shutter'), pose: 'stand' }, { k: 'anim', who: 'tu', clip: 'glasses-down' }, say('tu', 'cs06.tu1', { t: 0.6 })],
      note: 'inside: he takes off his glasses at the gap under the shutter' },
    { dur: 6, label: 'om-hop', cam: { k: 'twoShot', a: 'tu', b: 'tin', fov: 40 }, cues: [
      { k: 'place', who: 'tin', at: at(shop('shutter'), -1, 0, -1.2), pose: 'stand' },
      { k: 'prop', id: 'hop', kind: 'iron-box', attach: 'tu.handR' }, say('tu', 'cs06.tu2', { t: 0.3 }),
      { k: 'pair', clip: 'handover', a: 'tu', b: 'tin', t: 0.8 }, { k: 'prop', id: 'hop', kind: 'iron-box', attach: 'tin.handR', t: 1.6 },
      say('tin', 'cs06.tin1', { t: 3.6 })],
      note: 'he pushes the iron box into Tín\'s arms' },
    { dur: 4, label: 'co-le', cam: { k: 'shot', eye: at('tu.head', 0.2, -0.1, 0.9), look: 'tu.handR', fov: 30 }, cues: [
      { k: 'prop', id: 'co-le', kind: 'wrench', attach: 'tu.handR' }, { k: 'anim', who: 'tu', clip: 'grip-wrench' },
      say('tu', 'cs06.tu3', { t: 0.3 }), { k: 'letterbox', on: false, t: 3.6 }],
      note: 'he lifts a big wrench from the bench and weighs it in his hand' },
  ],
  handoff: { player: { at: shop('loft'), vehicle: 'foot', space: 'xe-may-shop' }, camera: 'cut' },
};

// ---- CS06 · part 2: through the roof gap; Cường steps through the fire (12 s) ------------------------------------
const cs06Mai: Scene = {
  id: 'cs06_lua_tiem_xe_mai', mission: 'c6-m2', title: '@cs06.titleMai', kind: 'cutscene', seconds: 12, skippable: true,
  stage: { at: 'xe-may-roofs', radius: 20, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 22.4, weather: 'clear', freezeClock: true } },
  sets: ['xe-may-shop'],
  cast: { tin: 'tin', tu: 'tu', cuong: 'cuong', gac1: 'tpl:ran-den', gac2: 'tpl:ran-den' },
  shots: [
    { dur: 4, label: 'khe-mai', cam: { k: 'shot', eye: shop('roofGap'), look: shop('floor'), fov: 55 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'ambience', id: 'fire-crackle' },
      { k: 'fx', kind: 'fire', at: shop('front') }, { k: 'fx', kind: 'smoke', at: shop('floor') },
      { k: 'place', who: 'tu', at: shop('floor'), pose: 'stand' }, { k: 'anim', who: 'tu', clip: 'grip-wrench' },
      { k: 'walk', who: 'gac1', path: [shop('front'), at(shop('floor'), 0.8, 0, 0.6)], pace: 'run' },
      { k: 'walk', who: 'gac2', path: [at(shop('front'), 1, 0, 0.5), at(shop('floor'), -0.8, 0, 0.9)], pace: 'run', t: 0.3 },
      { k: 'fx', kind: 'smoke', at: shop('floor'), t: 2.6 }, { k: 'sfx', id: 'metal-clang', t: 3 }, { k: 'sfx', id: 'metal-clang', t: 3.5 }],
      note: 'POV through the gap in the shop roof: two men rush the old man; the smoke rolls over them and two clangs ring out' },
    { dur: 3, label: 'nam-xuong', cam: { k: 'shot', eye: shop('roofGap'), look: shop('floor'), fov: 55 }, cues: [
      { k: 'place', who: 'gac1', at: at(shop('floor'), 1.2, 0, 1), pose: 'lie-flat' }, { k: 'place', who: 'gac2', at: at(shop('floor'), -1, 0, 1.4), pose: 'lie-flat' },
      { k: 'expr', who: 'tu', e: 'determined' }],
      note: 'the smoke thins: both men are down, the sixty-four-year-old still on his feet, breathing hard' },
    { dur: 3, label: 'cuong', cam: { k: 'shot', eye: at(shop('front'), 2, 1.6, -2.5), look: 'cuong.head', fov: 45 }, cues: [
      { k: 'fx', kind: 'fire', at: shop('front') }, { k: 'place', who: 'cuong', at: shop('front'), pose: 'stand' },
      { k: 'walk', who: 'cuong', path: [shop('front'), at(shop('floor'), 0, 0, 1.5)], pace: 'walk' }, say('cuong', 'cs06.cuong1', { t: 0.3 })],
      note: 'Cường Sẹo steps through the flames in his flip-flops and shrugs off his jacket' },
    { dur: 2, label: 'ngoi-mai', cam: { k: 'insert', target: 'tin.handR', fov: 24, dist: 0.4 }, cues: [
      { k: 'place', who: 'tin', at: 'xe-may-roofs.pho', pose: 'crouch' }, { k: 'expr', who: 'tin', e: 'shock' }, { k: 'letterbox', on: false, t: 1.6 }],
      note: 'cut away before the blow: Tín\'s hand clenched on the roof tiles' },
  ],
  handoff: { player: { at: 'xe-may-roofs.pho', vehicle: 'foot' }, camera: 'blend', ms: 400 },
};

// ---- CS06 · part 3: the whistle and the plate question (37 s) ----------------------------------------------------
const cs06Coi: Scene = {
  id: 'cs06_lua_tiem_xe_coi', mission: 'c6-m2', title: '@cs06.titleCoi', kind: 'cutscene', seconds: 37, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 20, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 22.6, weather: 'clear', freezeClock: true } },
  sets: ['xe-may-shop'],
  cast: { tin: 'tin', tu: 'tu', cuong: 'cuong' },
  shots: [
    { dur: 8, label: 'ben-xe-cub', cam: { k: 'shot', eye: at(shop('cub'), 1.6, 0.4, 1.8), look: 'tu.head', fov: 55 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'ambience', id: 'fire-crackle' }, { k: 'music', id: null, fade: 2 },
      { k: 'fx', kind: 'smoke', at: shop('floor') }, { k: 'fx', kind: 'fire', at: shop('front') },
      { k: 'place', who: 'tu', at: shop('cub'), pose: 'sit' }, { k: 'expr', who: 'tu', e: 'pain' },
      { k: 'place', who: 'tin', at: at(shop('cub'), 0.6, 0, 0.7), pose: 'kneel' }, say('tin', 'cs06.tin2', { t: 1 })],
      note: 'low angle in orange smoke: Ông Tư sits against his old Cub, a hand pressed to his side (no wound shown); Tín drops to his knees' },
    { dur: 10, label: 'cai-coi', cam: { k: 'twoShot', a: 'tu', b: 'tin', fov: 28 }, cues: [
      { k: 'prop', id: 'coi', kind: 'whistle', attach: 'tu.handR', t: 0.2 }, { k: 'pair', clip: 'hang-whistle', a: 'tu', b: 'tin', t: 0.6 },
      say('tu', 'cs06.tu4', { t: 0.8 }), { k: 'prop', id: 'coi', kind: 'whistle', attach: 'tin.chest', t: 3 }, say('tu', 'cs06.tu5', { t: 3.9 }),
      // the LƯƠNG TÂM record so far changes his last word on the rule
      say('tu', 'cs06.tu6a', { t: 7, if: clean, dur: 3.4 }), say('tu', 'cs06.tu6b', { t: 7, if: { k: 'not', c: clean }, dur: 3.4 })],
      note: 'he lifts the old police whistle from his own neck and hangs it on Tín\'s' },
    { dur: 8, label: 'bien-so', cam: { k: 'shot', eye: at('tu.head', 0.1, 0, 0.55), look: 'tu.head', fov: 20 }, cues: [
      { k: 'expr', who: 'tu', e: 'smile' }, say('tu', 'cs06.tu7', { t: 0.5 }), { k: 'expr', who: 'tin', e: 'cry', t: 3.8 }, say('tin', 'cs06.tin3', { t: 4.2 })],
      note: 'he almost smiles: the plate test of the first morning, one last time' },
    { dur: 3, label: 'tay-buong', cam: { k: 'insert', target: 'tu.handR', fov: 25, dist: 0.4 }, cues: [
      { k: 'anim', who: 'tu', clip: 'hand-falls' }, { k: 'expr', who: 'tu', e: 'eyes-closed' }],
      note: 'the old hand slips from the whistle and comes to rest on the floor' },
    { dur: 5, label: 'cuong-cua', cam: { k: 'shot', eye: at('tin.head', -0.5, 0.4, -1.6), look: shop('front'), fov: 60 }, cues: [
      { k: 'place', who: 'cuong', at: shop('front'), pose: 'stand' }, { k: 'fx', kind: 'fire', at: shop('front') }, say('cuong', 'cs06.cuong2', { t: 0.8 })],
      note: 'wide from behind Tín: Cường\'s silhouette fills the burning doorway' },
    { dur: 3, label: 'xa-sap', cam: { k: 'shot', eye: at(shop('floor'), 3, 2, 3), look: shop('floor'), fov: 60, handheld: 1 }, cues: [
      { k: 'fx', kind: 'beam-fall', at: at(shop('floor'), 0, 2.5, 0.8) }, { k: 'sfx', id: 'beam-crash', t: 0.2 }, { k: 'fx', kind: 'camera-jolt', t: 0.3 },
      { k: 'letterbox', on: false, t: 2.6 }],
      note: 'a burning beam crashes down between them in a burst of sparks; back to gameplay' },
  ],
  handoff: { player: { at: shop('cub'), vehicle: 'foot', crouch: true, space: 'xe-may-shop', outfit: 'tin-whistle' }, camera: 'cut' },
};

// ---- c6-m3 · dawn on Cô Ba's back stairs (26 s) ------------------------------------------------------------------
const bacThang: Scene = {
  id: 'c6m3-bac-thang', mission: 'c6-m3', title: '@c6m3.cs.bacThang', kind: 'cutscene', seconds: 26, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 14, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 5.2, weather: 'cloudy', freezeClock: true } },
  cast: { tin: 'tin', coba: 'coba' },
  shots: [
    { dur: 6, label: 'bac-thang', cam: { k: 'shot', eye: at('cafe-co-ba.backStairs', -5, 3.5, 4), look: 'tin.head', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'dawn' }, { k: 'fx', kind: 'mist', at: 'cho-an-hoa' }, { k: 'sfx', id: 'rooster', t: 1 },
      { k: 'place', who: 'tin', at: 'cafe-co-ba.backStairs', pose: 'sit' }, { k: 'prop', id: 'coi', kind: 'whistle', attach: 'tin.handR' }],
      note: 'first light over the market lane; Tín on the back stairs, soot on his face, the whistle in his fist; he has not slept' },
    { dur: 7, label: 'co-ba', cam: { k: 'shot', eye: at('cafe-co-ba.backStairs', 2, 1.4, 2.5), look: 'coba.head', fov: 40 }, cues: [
      { k: 'walk', who: 'coba', path: ['cafe-co-ba.backDoor', at('cafe-co-ba.backStairs', 0.7, 0, 0)], pace: 'shuffle' },
      { k: 'prop', id: 'ly', kind: 'coffee-cup', attach: 'coba.handR' }, say('coba', 'c6m3.cs.coba1', { t: 3 })],
      note: 'Cô Ba comes out of the back door in her apron with a glass of black coffee' },
    { dur: 7, label: 'ngoi-canh', cam: { k: 'twoShot', a: 'coba', b: 'tin', fov: 38 }, cues: [
      { k: 'place', who: 'coba', at: at('cafe-co-ba.backStairs', 0.7, 0, 0), pose: 'sit' }, { k: 'pair', clip: 'handover', a: 'coba', b: 'tin', t: 0.3 },
      { k: 'prop', id: 'ly', kind: 'coffee-cup', attach: 'tin.handR', t: 1 }, say('coba', 'c6m3.cs.coba2', { t: 0.6 }),
      { k: 'pair', clip: 'hand-on-shoulder', a: 'coba', b: 'tin', t: 3.8 }, say('coba', 'c6m3.cs.coba3', { t: 4.2 })],
      note: 'she sits beside him and puts a hand on his back' },
    { dur: 6, label: 'tin-nhan', cam: { k: 'insert', target: 'tin.handR', fov: 20, dist: 0.3 }, cues: [
      { k: 'phoneScreen', who: 'tin', text: '@c6m3.cs.smsQuang' }, say('tin', 'c6m3.cs.tin1', { ch: 'inner', t: 1 }),
      { k: 'expr', who: 'tin', e: 'determined', t: 3.6 }, say('tin', 'c6m3.cs.tin2', { ch: 'inner', t: 4 }), { k: 'letterbox', on: false, t: 5.6 }],
      note: 'the smartphone: the last message of the night, from Quang' },
  ],
  handoff: { player: { at: 'cafe-co-ba.backStairs', vehicle: 'foot' }, camera: 'blend', ms: 600 },
};

// ---- c6-m3 · the pier in the morning mist (28 s) -----------------------------------------------------------------
const benSong: Scene = {
  id: 'c6m3-ben-song', mission: 'c6-m3', title: '@c6m3.cs.benSong', kind: 'cutscene', seconds: 28, skippable: true,
  stage: { at: 'ben-an-hoa', radius: 18, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 5.5, weather: 'cloudy', freezeClock: true } },
  cast: { tin: 'tin', quang: 'quang' },
  shots: [
    { dur: 5, label: 'suong', cam: { k: 'shot', eye: at('ben-an-hoa', -4, 2.5, 5), look: 'quang.head', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'fx', kind: 'mist', at: 'ben-an-hoa' },
      { k: 'place', who: 'quang', at: 'ben-an-hoa', pose: 'sit' }, { k: 'place', who: 'tin', at: at('ben-an-hoa', 0, 0, 0.9), pose: 'crouch' },
      { k: 'expr', who: 'quang', e: 'cry' }, say('quang', 'c6m3.cs.q0a', { t: 1, if: punched }), say('quang', 'c6m3.cs.q0b', { t: 1, if: { k: 'not', c: punched } })],
      note: 'the planks in the mist: Quang down on the boards, Tín over him with both fists in his shirt; Quang does not fight back' },
    { dur: 10, label: 'thu-nhan', cam: { k: 'shot', eye: at('quang.head', 0.2, 0, 0.9), look: 'quang.head', fov: 30 }, cues: [
      say('quang', 'c6m3.cs.q1', { t: 0.3 }), say('quang', 'c6m3.cs.q2', { t: 3.4 }), say('quang', 'c6m3.cs.q3', { t: 6.6 })],
      note: 'he cries like a child; the gold chain, the cracked phone, nothing of the loud boy from the village' },
    { dur: 8, label: 'ong-tu', cam: { k: 'shot', eye: at('tin.head', -0.2, 0, 0.9), look: 'tin.head', fov: 30 }, cues: [
      { k: 'expr', who: 'tin', e: 'cry' }, say('tin', 'c6m3.cs.t1', { t: 0.5 }), say('tin', 'c6m3.cs.t2', { t: 4.4 })],
      note: 'Tín\'s voice breaks' },
    { dur: 5, label: 'buong', cam: { k: 'shot', eye: at('ben-an-hoa', 3, 1.6, 3), look: 'tin.head', fov: 40 }, cues: [
      { k: 'place', who: 'tin', at: at('ben-an-hoa', 0.5, 0, 1.4), pose: 'stand' }, say('tin', 'c6m3.cs.t3', { t: 0.6 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'he lets go and stands up' },
  ],
  handoff: { player: { at: at('ben-an-hoa', 0.5, 0, 1.6), vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c6-m3 · the iron box opened at the end of the pier (20 s) ---------------------------------------------------
const moHop: Scene = {
  id: 'c6m3-mo-hop', mission: 'c6-m3', title: '@c6m3.cs.moHop', kind: 'cutscene', seconds: 20, skippable: true,
  stage: { at: 'ben-an-hoa', radius: 12, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 5.8, weather: 'cloudy', freezeClock: true } },
  cast: { tin: 'tin' },
  shots: [
    { dur: 5, label: 'cuoi-ben', cam: { k: 'shot', eye: at('ben-an-hoa.sunset', -3, 1.8, -4), look: 'tin.head', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'dawn' }, { k: 'fx', kind: 'mist', at: 'ben-an-hoa' },
      { k: 'place', who: 'tin', at: 'ben-an-hoa.sunset', pose: 'sit' }, { k: 'prop', id: 'hop', kind: 'iron-box', at: at('ben-an-hoa.sunset', 0.6, 0, 0.2) }],
      note: 'the end of the pier, feet over the water; the sun comes up through the mist; a speedboat\'s wake fading downstream' },
    { dur: 6, label: 'nap-hop', cam: { k: 'insert', target: 'prop:hop', fov: 22, dist: 0.6 }, cues: [
      { k: 'sfx', id: 'lid-creak', t: 0.3 }, { k: 'prop', id: 'hop', kind: 'iron-box', variant: 'open', at: at('ben-an-hoa.sunset', 0.6, 0, 0.2), t: 0.4 },
      { k: 'prop', id: 'hop', kind: 'iron-box', variant: 'false-bottom', at: at('ben-an-hoa.sunset', 0.6, 0, 0.2), lines: ['@c6m3.cs.nap1', '@c6m3.cs.nap2'], t: 2.6 }],
      note: 'the lid opens on the three documents Ông Tư laid out with him last night; under them the tin floor gives: a false bottom he never showed, and on top of what lies there a folded slip in his hand, written years ago' },
    { dur: 5, label: 'chu-ong', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.8), look: 'tin.head', fov: 28 }, cues: [
      { k: 'expr', who: 'tin', e: 'cry' }, say('tin', 'c6m3.cs.t4', { ch: 'inner', t: 0.6 })] },
    { dur: 4, label: 'giay-to', cam: { k: 'insert', target: 'prop:giay', fov: 24, dist: 0.5 }, cues: [
      { k: 'prop', id: 'giay', kind: 'old-photo', at: at('ben-an-hoa.sunset', 0.6, 0.15, 0.2) }, { k: 'letterbox', on: false, t: 3.6 }],
      note: 'what lies under the slip, in the false bottom: a thin file and a pocket notebook' },
  ],
  handoff: { player: { at: 'ben-an-hoa.sunset', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c6-m3 · the prayer service (lễ cầu siêu) at CHÙA AN HÒA and the wreath (44 s) -----------------------------
const damTang: Scene = {
  id: 'c6m3-dam-tang', mission: 'c6-m3', title: '@c6m3.cs.damTang', kind: 'cutscene', seconds: 44, skippable: true,
  stage: { at: 'chua-an-hoa', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 15.6, weather: 'cloudy', freezeClock: true } },
  cast: {
    tin: 'tin', coba: 'coba', van: 'van', thay: 'thay-minh-tinh', bin: 'bin', taiXe: 'tai-xe-phuong', phuong: 'phuong',
    nguoiDi: { template: 'resident', count: 10, area: at('chua-an-hoa', -1.6, 0, -3), size: [10, 3], poses: ['stand-head-down'] },
  },
  shots: [
    { dur: 6, label: 'ban-tho', cam: { k: 'crane', from: at('chua-an-hoa', 0, 3.5, -4), to: at('chua-an-hoa', 0, 1.7, -2.2), look: at('chua-an-hoa', 0, 1.4, 0.5), fov: [45, 35] }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' },
      { k: 'prop', id: 'di-anh', kind: 'portrait', at: at('chua-an-hoa', 0, 1.3, 0.6), lines: ['@c6m3.cs.anhTho', '@c6m3.cs.huongTho'] },
      { k: 'prop', id: 'nhang', kind: 'incense', at: 'ch6.lu-huong' }, { k: 'fx', kind: 'incense-smoke', at: 'ch6.lu-huong' }, { k: 'sfx', id: 'mo-go' }],
      note: 'a portrait of a young Lê Văn Tư in police uniform on the altar, white cloth, wreaths, incense' },
    { dur: 6, label: 'thay', cam: { k: 'shot', eye: at('thay.head', 0.4, 0, 1.2), look: 'thay.head', fov: 35 }, cues: [
      { k: 'place', who: 'thay', at: at('chua-an-hoa', 1.4, 0, -0.6), pose: 'stand' }, { k: 'anim', who: 'thay', clip: 'knock-mo', loop: true },
      { k: 'sfx', id: 'chanting' }, say('thay', 'c6m3.cs.thay1', { t: 1 })],
      note: 'Thầy Minh Tịnh chants with the wooden fish; he never hurries' },
    { dur: 6, label: 'tang-quyen', cam: { k: 'shot', eye: at('ch6.lu-huong', 2.5, 1.6, 3), look: at('ch6.lu-huong', -1, 1.4, -0.5), fov: 42 }, cues: [
      { k: 'place', who: 'coba', at: 'chua-an-hoa.matW', pose: 'stand-head-down' }, { k: 'expr', who: 'coba', e: 'cry' },
      { k: 'place', who: 'van', at: 'chua-an-hoa.matE', pose: 'stand' }, { k: 'anim', who: 'van', clip: 'salute', t: 2.2 },
      { k: 'place', who: 'bin', at: 'ch6.thay', pose: 'stand-head-down' }, { k: 'place', who: 'tin', at: 'ch6.lu-huong', pose: 'stand' }],
      note: 'Cô Ba weeps into her hand; Vân, in plain clothes, salutes; Bin wears the white mourning band of the family' },
    { dur: 6, label: 'bin', cam: { k: 'twoShot', a: 'bin', b: 'tin', fov: 38 }, cues: [say('bin', 'c6m3.cs.bin1', { t: 0.6 })],
      note: 'Ông Tư\'s grand-nephew, nineteen, trying not to cry' },
    { dur: 6, label: 'xe-den', cam: { k: 'shot', eye: at('chua-an-hoa.gate', 4, 1.6, 4), look: 'vehicle:xe-phuong', fov: 40 }, cues: [
      { k: 'place', who: 'taiXe', at: at('vehicle:xe-phuong', 1.6, 0, 0), pose: 'stand' },
      { k: 'prop', id: 'vong-hoa', kind: 'wreath', attach: 'taiXe.handR', lines: ['@c6m3.cs.vongHoa'] },
      { k: 'walk', who: 'taiXe', path: [at('vehicle:xe-phuong', 1.6, 0, 0), 'chua-an-hoa.gate'], pace: 'walk', t: 0.5 },
      { k: 'anim', who: 'taiXe', clip: 'set-down', t: 3.6 }, { k: 'prop', id: 'vong-hoa', kind: 'wreath', at: at('chua-an-hoa.gate', 0.6, 0, 0.5), lines: ['@c6m3.cs.vongHoa'], t: 4.4 }],
      note: 'at the gate a black car waits; Phượng\'s driver sets down a white wreath with the ribbon "Thành kính phân ưu"' },
    { dur: 5, label: 'cua-kinh', cam: { k: 'insert', target: at('vehicle:xe-phuong', -0.8, 1.1, -0.4), fov: 26, dist: 1.2 }, cues: [
      { k: 'place', who: 'phuong', at: at('vehicle:xe-phuong', -0.6, 0.4, -0.4), pose: 'sit' }, { k: 'prop', id: 'vong-ngoc', kind: 'jade-bangle', attach: 'phuong.handL' },
      { k: 'look', who: 'phuong', at: 'tin.head' }],
      note: 'the rear window lowers halfway: a jade bangle on a hand resting on the sill; nothing else of her' },
    { dur: 5, label: 'nhin', cam: { k: 'shot', eye: at('tin.head', 0.2, 0, 0.8), look: 'tin.head', fov: 28 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, { k: 'prop', id: 'coi', kind: 'whistle', attach: 'tin.chest' }, say('tin', 'c6m3.cs.t5', { ch: 'inner', t: 1.4 })],
      note: 'Tín stares into the tinted glass, the whistle on his chest, until it rises' },
    { dur: 4, label: 'xe-di', cam: { k: 'shot', eye: at('chua-an-hoa.gate', -2, 1.5, 3), look: 'vehicle:xe-phuong', fov: 45 }, cues: [
      { k: 'ride', id: 'xe-phuong', model: 'limo-den', path: ['chua-an-hoa.car', at('chua-an-hoa.car', 22, 0, -2)], speed: 4 }, { k: 'letterbox', on: false, t: 3.6 }],
      note: 'the window rises and the car pulls away; the wreath stays at the gate' },
  ],
  notes: "The car is the mission's story vehicle 'xe-phuong' (parked at chua-an-hoa.car, facing east); the ride cue moves it instead of spawning a copy.",
};

export const CUTSCENES: Scene[] = [cs05, congNhay, cs06, cs06Mai, cs06Coi, bacThang, benSong, moHop, damTang];
