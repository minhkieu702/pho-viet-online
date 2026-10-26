import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Mark, Scene } from '../scene.ts';

/**
 * Chapter 9 cutscenes as data (schema and conventions: story/scene.ts). Lines are '@keys' of text/vi/ch09.ts;
 * 'set:<space>.<anchor>' marks are the off-map anchors of content/ch09.ts ANCHORS (the attic's are chapter 1's,
 * co-ba-ground's front/counter/kitchen chapter 5's). The chapter has no numbered CS: these are the short scenes the
 * bible lists for c9 (the morning montage, Cô Ba lifting the board, the envelope, Tám Hổ's apron, the bia hơi table,
 * the 48 hours, Quang at the back door, the pagoda gate) plus the beats that tie them (the vent found, the raid, Hổ
 * Vàng's block, the car before Rằm). Nobody is struck on screen: the raid shows banging on a shutter and a van, the
 * chases happen in play; Lâm's death is told, never shown; Má sinks into a neighbour's arms (a hug, no fall).
 */

const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; if?: Cond; t?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });
/** c6-m3 "Kéo nó dậy" (content/ch06.ts choice 'quangBen'). */
const keo: Cond = { k: 'flag', name: 'choice:quangBen', eq: 'keo-day' };
const killed: Cond = { k: 'stat', name: 'kills', op: '>', value: 0 };

// ---- c9-m1 · the morning bulletin: Má at the neighbour's TV, Cô Ba at the shutter, Tín hears the stairs (28 s) ------
const banTin: Scene = {
  id: 'c9m1-ban-tin', mission: 'c9-m1', title: '@c9m1.cs.banTin', kind: 'cutscene', seconds: 28, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 20, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 7.5, weather: 'rain', freezeClock: true } },
  sets: ['village-tan-thuan', 'co-ba-ground', 'attic'],
  cast: { tin: 'tin', bana: 'bana', hangXom: 'tpl:villager', anchor: 'phat-thanh-vien', coba: 'coba', ca: 'ca-phuong' },
  shots: [
    { dur: 6, label: 'tivi', cam: { k: 'insert', target: 'prop:tv', fov: 30, dist: 1.2 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'sfx', id: 'news-jingle' },
      { k: 'prop', id: 'tv', kind: 'tv-news', at: 'set:village-tan-thuan.neighbour', lines: ['@c9m1.cs.tvScreen', '@c9m1.cs.tvSub'] },
      say('anchor', 'c9m1.cs.tv1', { ch: 'tv', t: 0.6 }), say('anchor', 'c9m1.cs.tv2', { ch: 'tv', t: 3.6 })],
      note: 'the neighbour\'s TV in the stilt house across the dyke: Tín\'s student-ID photo under the caption' },
    { dur: 7, label: 'ma', cam: { k: 'shot', eye: at('set:village-tan-thuan.neighbour', 1.6, 1.4, 2.2), look: 'bana.head', fov: 38 }, cues: [
      { k: 'place', who: 'bana', at: at('set:village-tan-thuan.neighbour', 0.4, 0, 0.8), pose: 'stand' }, { k: 'place', who: 'hangXom', at: at('set:village-tan-thuan.neighbour', -0.4, 0, 1), pose: 'stand' },
      { k: 'expr', who: 'bana', e: 'shock', t: 0.2 }, say('bana', 'c9m1.cs.ma1', { t: 1.2 }),
      { k: 'pair', clip: 'hug', a: 'hangXom', b: 'bana', t: 3.6 }, { k: 'expr', who: 'bana', e: 'cry', t: 3.6 }, { k: 'place', who: 'bana', at: at('set:village-tan-thuan.neighbour', 0.4, 0, 0.8), pose: 'sit', t: 4.2 },
      say('bana', 'c9m1.cs.ma2', { t: 3.8 })],
      note: 'Má\'s knees give way; the neighbour catches her and lowers her onto a stool (no fall)' },
    { dur: 9, label: 'cua-quan', cam: { k: 'shot', eye: at('set:co-ba-ground.shutter', -2.2, 1.5, 2.8), look: 'coba.head', fov: 40 }, cues: [
      { k: 'fx', kind: 'awning-drip', at: 'set:co-ba-ground.shutter' },
      { k: 'place', who: 'coba', at: 'set:co-ba-ground.shutter', pose: 'stand' }, { k: 'place', who: 'ca', at: at('set:co-ba-ground.shutter', 0, 0, -1.2), pose: 'stand' },
      say('ca', 'c9m1.cs.ca1', { t: 0.4 }), { k: 'expr', who: 'coba', e: 'angry', t: 2.4 }, say('coba', 'c9m1.cs.coba1', { t: 2.8 }), say('coba', 'c9m1.cs.coba2', { t: 5.2 })],
      note: 'the shutter half down from last night; Cô Ba fills the gap with her apron and her kettle, two officers under the awning in the rain' },
    { dur: 6, label: 'gac', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.8), look: 'tin.head', fov: 30 }, cues: [
      { k: 'place', who: 'tin', at: 'set:attic.door', pose: 'stand' }, { k: 'sfx', id: 'boots-floor', t: 1 }, { k: 'expr', who: 'tin', e: 'shock', t: 1.2 },
      say('tin', 'c9m1.cs.tin1', { ch: 'inner', t: 1.6 }), { k: 'letterbox', on: false, t: 5.6 }],
      note: 'the attic: Tín with his ear to the door, boots on the back stairs below' },
  ],
  handoff: { player: { at: 'set:attic.door', vehicle: 'foot', space: 'attic' }, camera: 'blend', ms: 400 },
};

// ---- c9-m1 · the board lifts: Lâm (35 s) ----------------------------------------------------------------------------
const lam: Scene = {
  id: 'c9m1-lam', mission: 'c9-m1', title: '@c9m1.cs.lam', kind: 'cutscene', seconds: 35, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 20, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 7.8, weather: 'rain', freezeClock: true } },
  sets: ['attic'],
  cast: { tin: 'tin', coba: 'coba' },
  shots: [
    { dur: 4, label: 'van-go', cam: { k: 'shot', eye: at('set:attic.hollow', 0, 0.15, 0), look: at('set:attic.hollow', 0, 2, 0.01), fov: 55 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'prop', id: 'van', kind: 'floorboard', at: 'set:attic.hollow' },
      { k: 'place', who: 'coba', at: at('set:attic.hollow', 0.5, 0, 0.3), pose: 'squat' }, { k: 'prop', id: 'van', kind: 'floorboard', remove: true, t: 1 },
      say('coba', 'c9m1.cs.lam1', { t: 1.4 })],
      note: 'POV from the hollow: a slit of grey light, then the board lifts and Cô Ba\'s face fills it' },
    { dur: 5, label: 'ra', cam: { k: 'shot', eye: at('set:attic.hollow', 2, 1.2, 1.6), look: 'set:attic.hollow', fov: 42 }, cues: [
      { k: 'place', who: 'tin', at: at('set:attic.hollow', -0.4, 0, 0.2), pose: 'sit' }, { k: 'place', who: 'coba', at: at('set:attic.hollow', 0.6, 0, 0.3), pose: 'sit', t: 0.2 },
      say('tin', 'c9m1.cs.lam2', { t: 0.4 })] },
    { dur: 8, label: 'tron', cam: { k: 'shot', eye: at('coba.head', 0.4, 0, 1), look: 'coba.head', fov: 32 }, cues: [
      { k: 'look', who: 'coba', at: 'set:attic.hollow' }, say('coba', 'c9m1.cs.lam3', { t: 0.4 }), say('coba', 'c9m1.cs.lam4', { t: 4 })],
      note: 'she looks into the hollow, not at him' },
    { dur: 8, label: 'lam', cam: { k: 'shot', eye: at('coba.head', -0.25, 0, 0.75), look: 'coba.head', fov: 28 }, cues: [
      { k: 'expr', who: 'coba', e: 'cry', t: 1 }, say('coba', 'c9m1.cs.lam5', { t: 0.8 }), say('coba', 'c9m1.cs.lam6', { t: 4.6 })],
      note: 'no flashback: only her face, the rain on the window behind her' },
    { dur: 5, label: 'khong-de', cam: { k: 'twoShot', a: 'tin', b: 'coba', fov: 36 }, cues: [
      { k: 'expr', who: 'coba', e: 'determined', t: 0.2 }, say('coba', 'c9m1.cs.lam7', { t: 0.6 })] },
    { dur: 5, label: 'ao-mua', cam: { k: 'insert', target: 'prop:ao-mua', fov: 30, dist: 0.8 }, cues: [
      { k: 'prop', id: 'ao-mua', kind: 'raincoat-helmet', at: 'set:attic.desk' }, say('coba', 'c9m1.cs.lam8', { t: 0.4 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'a folded bat-wing raincoat and an old full-face helmet, a faded sticker on the visor' },
  ],
  handoff: { player: { at: 'set:attic.hollow', vehicle: 'foot', space: 'attic' }, camera: 'blend', ms: 500 },
};

// ---- c9-m1 · Vân's safehouse: the envelope over the gas ring (only if Tín took it in c8-m3) (16 s) --------------------
const phongBi: Scene = {
  id: 'c9m1-phong-bi', mission: 'c9-m1', title: '@c9m1.cs.phongBi', kind: 'cutscene', seconds: 16, skippable: true,
  stage: { at: 'nha-chi-van', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 12.7, weather: 'rain', freezeClock: true } },
  sets: ['van-safehouse'],
  cast: { tin: 'tin', van: 'van' },
  shots: [
    { dur: 5, label: 'bep-ga', cam: { k: 'insert', target: 'set:van-safehouse.gas', fov: 30, dist: 0.9 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'sfx', id: 'gas-click' }, { k: 'fx', kind: 'flame', at: 'set:van-safehouse.gas', t: 0.6 },
      { k: 'place', who: 'tin', at: at('set:van-safehouse.gas', 0, 0, 0.7), pose: 'stand' }, { k: 'prop', id: 'phong-bi', kind: 'envelope', attach: 'tin.handR' },
      say('van', 'c9m1.cs.pb1', { t: 2.4 })],
      note: 'Phượng\'s thick envelope, still sealed, held over the blue flame' },
    { dur: 6, label: 'tra-loi', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.9), look: 'tin.head', fov: 32 }, cues: [
      { k: 'place', who: 'van', at: at('set:van-safehouse.gas', 1.4, 0, 1.2), pose: 'stand' },
      say('tin', 'c9m1.cs.pb2', { t: 0.4 }), say('tin', 'c9m1.cs.pb3', { t: 2.6 })] },
    { dur: 5, label: 'chay', cam: { k: 'insert', target: 'prop:phong-bi', fov: 24, dist: 0.4 }, cues: [
      { k: 'prop', id: 'phong-bi', kind: 'envelope', at: 'set:van-safehouse.gas', t: 0.2 }, { k: 'letterbox', on: false, t: 4.6 }],
      note: 'the flame eats it all; neither of them moves' },
  ],
  handoff: { player: { at: 'set:van-safehouse.gas', vehicle: 'foot', space: 'van-safehouse' }, camera: 'blend', ms: 500 },
};

// ---- c9-m2 · Tám Hổ's back gate: the apron (24 s) -------------------------------------------------------------------
const tamHo: Scene = {
  id: 'c9m2-tam-ho', mission: 'c9-m2', title: '@c9m2.cs.tamHo', kind: 'cutscene', seconds: 24, skippable: true,
  stage: { at: 'bia-hoi.backDoor', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 19, weather: 'cloudy', freezeClock: true } },
  cast: { tin: 'tin', tamHo: 'tam-ho' },
  shots: [
    { dur: 5, label: 'cua-sau', cam: { k: 'shot', eye: at('bia-hoi.backDoor', 2.5, 1.6, -3), look: 'tamHo.head', fov: 40 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'place', who: 'tamHo', at: at('bia-hoi.backDoor', 0.6, 0, -0.8), pose: 'sit-stool' }, { k: 'prop', id: 'dau-phong', kind: 'peanut-plate', at: at('bia-hoi.backDoor', 0.9, 0.45, -1.2) },
      { k: 'anim', who: 'tamHo', clip: 'crack-peanuts', loop: true }, { k: 'place', who: 'tin', at: at('bia-hoi.backDoor', -0.8, 0, -1.6), pose: 'stand' },
      say('tamHo', 'c9m2.cs.th1', { t: 1 })],
      note: 'the back gate onto the alley; kegs, a yellow Hổ Vàng shirt, a gold tooth, peanut shells at his sandals' },
    { dur: 4, label: 'chi-van', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.9), look: 'tin.head', fov: 32 }, cues: [say('tin', 'c9m2.cs.tinTh', { t: 0.4 })] },
    { dur: 9, label: 'muoi-nam', cam: { k: 'ots', speaker: 'tamHo', listener: 'tin', side: 'right', fov: 36 }, cues: [
      { k: 'anim', who: 'tamHo', clip: 'crack-peanuts', t: 0.2 }, say('tamHo', 'c9m2.cs.th2', { t: 0.3 }), say('tamHo', 'c9m2.cs.th3', { t: 4.4 })] },
    { dur: 6, label: 'tap-de', cam: { k: 'twoShot', a: 'tamHo', b: 'tin', fov: 40 }, cues: [
      { k: 'prop', id: 'tap-de', kind: 'apron-cap', attach: 'tamHo.handR' }, { k: 'pair', clip: 'handover', a: 'tamHo', b: 'tin', t: 0.4 },
      { k: 'prop', id: 'tap-de', kind: 'apron-cap', attach: 'tin.handR', t: 1 }, say('tamHo', 'c9m2.cs.th4', { t: 1.2 }), { k: 'letterbox', on: false, t: 5.6 }],
      note: 'he pushes a porter\'s apron and a cap at Tín without getting up' },
  ],
  handoff: { player: { at: 'bia-hoi.backDoor', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c9-m2 · the table under the awning: Lực's own words (35 s) ------------------------------------------------------
const banNhau: Scene = {
  id: 'c9m2-ban-nhau', mission: 'c9-m2', title: '@c9m2.cs.banNhau', kind: 'cutscene', seconds: 35, skippable: true,
  stage: { at: 'bia-hoi', radius: 18, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 19.5, weather: 'cloudy', freezeClock: true } },
  cast: { tin: 'tin', luc: 'luc', xach: 'xach-tien', veSi: 've-si-luc' },
  shots: [
    { dur: 4, label: 'ban', cam: { k: 'shot', eye: at('bia-hoi.lucTable', -4, 2.4, 4.5), look: 'bia-hoi.lucTable', fov: 42 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'neon' },
      { k: 'place', who: 'luc', at: 'bia-hoi.lucTable', pose: 'sit-stool' }, { k: 'place', who: 'xach', at: at('bia-hoi.lucTable', 0.9, 0, 0.6), pose: 'sit-stool' },
      { k: 'place', who: 'veSi', at: at('bia-hoi.lucTable', -0.6, 0, -1.2), pose: 'stand' }, { k: 'prop', id: 'ban', kind: 'peanut-plate', at: 'bia-hoi.lucTable' },
      { k: 'prop', id: 'phong-bi', kind: 'envelope', attach: 'xach.handR' }, { k: 'pair', clip: 'handover', a: 'xach', b: 'luc', t: 0.8 },
      { k: 'prop', id: 'phong-bi', kind: 'envelope', attach: 'luc.chest', t: 1.8 }, { k: 'anim', who: 'luc', clip: 'sip', t: 2.6 }],
      note: 'a plastic table, a plate of peanuts, golden beer; Lực in a polo shirt tucks the envelope into his shirt' },
    { dur: 3, label: 'lo-gio', cam: { k: 'insert', target: at('bia-hoi.lucTable', 0, 3.2, -0.5), fov: 22, dist: 0.6 }, cues: [
      { k: 'prop', id: 'may-quay', kind: 'clip-camera', at: at('bia-hoi.lucTable', 0, 3.2, -0.5) }],
      note: 'between the slats of the vent above the awning, a tiny red dot' },
    { dur: 10, label: 'ram', cam: { k: 'ots', speaker: 'luc', listener: 'xach', side: 'left', fov: 34 }, cues: [
      say('luc', 'c9m2.cs.l1', { t: 0.4 }), say('luc', 'c9m2.cs.l2', { t: 2.9 }), say('luc', 'c9m2.cs.l3', { t: 5.8 })] },
    { dur: 6, label: 'ho-tong', cam: { k: 'shot', eye: at('luc.head', -0.3, 0, 1), look: 'luc.head', fov: 30 }, cues: [say('luc', 'c9m2.cs.l4', { t: 0.6 })],
      note: 'the kind-uncle smile; the gold watch on the wrist that holds the glass' },
    { dur: 7, label: 'shipper', cam: { k: 'twoShot', a: 'xach', b: 'luc', fov: 36 }, cues: [
      say('xach', 'c9m2.cs.x1', { t: 0.3 }), { k: 'anim', who: 'luc', clip: 'sip', t: 1.2 }, { k: 'expr', who: 'luc', e: 'cold-smile', t: 2.2 },
      say('luc', 'c9m2.cs.l5', { t: 2.4 }), say('luc', 'c9m2.cs.l6', { t: 4.4 })] },
    { dur: 5, label: 'tin', cam: { k: 'shot', eye: at('tin.head', 0.3, -0.05, 0.8), look: 'tin.head', fov: 28 }, cues: [
      { k: 'place', who: 'tin', at: 'bia-hoi.tinTable', pose: 'sit-stool' }, { k: 'expr', who: 'tin', e: 'determined', t: 1 },
      say('tin', 'c9m2.cs.tin1', { ch: 'inner', t: 2.6 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'six metres away, a porter\'s cap pulled low, the burner face down on the table, recording' },
  ],
  handoff: { player: { at: 'bia-hoi.tinTable', vehicle: 'foot' }, camera: 'blend', ms: 400 },
};

// ---- c9-m2 · the bodyguard finds the vent (13 s) ----------------------------------------------------------------------
const lo: Scene = {
  id: 'c9m2-lo', mission: 'c9-m2', title: '@c9m2.cs.lo', kind: 'cutscene', seconds: 13, skippable: true,
  stage: { at: 'bia-hoi', radius: 18, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 19.6, weather: 'cloudy', freezeClock: true } },
  cast: { tin: 'tin', luc: 'luc', veSi: 've-si-luc' },
  shots: [
    { dur: 4, label: 'nhap-nhay', cam: { k: 'shot', eye: at('veSi.head', 0.4, -0.3, 1.1), look: at('bia-hoi.lucTable', 0, 3.2, -0.5), fov: 34 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'neon' },
      { k: 'place', who: 'veSi', at: at('bia-hoi.lucTable', -0.6, 0, -1.2), pose: 'stand' }, { k: 'look', who: 'veSi', at: at('bia-hoi.lucTable', 0, 3.2, -0.5) },
      say('veSi', 'c9m2.cs.vs1', { t: 0.4 })] },
    { dur: 3, label: 'keo-ra', cam: { k: 'shot', eye: at('bia-hoi.lucTable', 1.5, 2.2, 1.5), look: at('bia-hoi.lucTable', 0, 3.2, -0.5), fov: 36 }, cues: [
      { k: 'prop', id: 'may-quay', kind: 'clip-camera', at: at('bia-hoi.lucTable', 0, 3.2, -0.5) }, { k: 'anim', who: 'veSi', clip: 'reach-up' },
      { k: 'prop', id: 'may-quay', kind: 'clip-camera', attach: 'veSi.handR', t: 1.4 }],
      note: 'a stool, an arm up into the slats: Ông Tư\'s button camera comes out on its wire' },
    { dur: 4, label: 'luc-nhin', cam: { k: 'shot', eye: at('luc.head', 0.2, 0, 0.9), look: 'luc.head', fov: 28 }, cues: [
      { k: 'place', who: 'luc', at: 'bia-hoi.lucTable', pose: 'sit-stool' }, { k: 'look', who: 'luc', at: 'tin.head', t: 0.6 }, say('luc', 'c9m2.cs.l7', { t: 1.2 }),
      { k: 'expr', who: 'luc', e: 'cold-smile', t: 1.4 }],
      note: 'his eyes go table to table and stop on a porter\'s cap' },
    { dur: 2, label: 'chay', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.8), look: 'tin.head', fov: 30 }, cues: [
      { k: 'place', who: 'tin', at: 'bia-hoi.tinTable', pose: 'stand' }, { k: 'expr', who: 'tin', e: 'shock' }, say('veSi', 'c9m2.cs.vs2', { t: 0.2 }),
      { k: 'letterbox', on: false, t: 1.6 }] },
  ],
  handoff: { player: { at: 'bia-hoi.tinTable', vehicle: 'foot' }, camera: 'cut' },
};

// ---- c9-m2 · Vân's safehouse: forty-eight hours (31 s) ---------------------------------------------------------------
const bonMuoiTam: Scene = {
  id: 'c9m2-48-gio', mission: 'c9-m2', title: '@c9m2.cs.gio', kind: 'cutscene', seconds: 31, skippable: true,
  stage: { at: 'nha-chi-van', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 22.2, weather: 'cloudy', freezeClock: true } },
  sets: ['van-safehouse'],
  cast: { tin: 'tin', van: 'van', daiTa: 'dai-ta' },
  shots: [
    { dur: 7, label: 'gui', cam: { k: 'shot', eye: at('set:van-safehouse.table', 1.6, 1.3, 1.4), look: 'van.head', fov: 38 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'place', who: 'van', at: 'set:van-safehouse.table', pose: 'sit-chair' }, { k: 'place', who: 'tin', at: at('set:van-safehouse.table', -1.2, 0, 0.6), pose: 'sit-chair' },
      { k: 'prop', id: 'dien-thoai', kind: 'cheap-phone', attach: 'van.handR' },
      say('van', 'c9m2.cs.v1', { t: 0.5 }), say('van', 'c9m2.cs.v2', { t: 3.6 })],
      note: 'her mother\'s front room: an altar, a ceiling fan, the clip and the ledger photos going out' },
    { dur: 8, label: 'chuong', cam: { k: 'shot', eye: at('van.head', 0.3, 0, 0.9), look: 'van.head', fov: 30 }, cues: [
      { k: 'sfx', id: 'phone-ring', t: 0.3 }, { k: 'anim', who: 'van', clip: 'phone-call', t: 1 },
      say('daiTa', 'c9m2.cs.dt1', { ch: 'phone', t: 1.8 }), say('daiTa', 'c9m2.cs.dt2', { ch: 'phone', t: 4.2 })],
      note: 'the colonel of the Ministry task force on the line; only his voice' },
    { dur: 6, label: 'dem-mai', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.9), look: 'tin.head', fov: 30 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c9m2.cs.t1', { t: 0.6 })] },
    { dur: 4, label: 'im-lang', cam: { k: 'twoShot', a: 'van', b: 'tin', fov: 40 }, cues: [{ k: 'expr', who: 'van', e: 'neutral' }],
      note: 'silence; the fan turns' },
    { dur: 6, label: 'ao-giap', cam: { k: 'shot', eye: at('set:van-safehouse.cupboard', 1.5, 1.4, 1.5), look: 'set:van-safehouse.cupboard', fov: 40 }, cues: [
      { k: 'place', who: 'van', at: at('set:van-safehouse.cupboard', 0, 0, 0.6), pose: 'stand' }, { k: 'anim', who: 'van', clip: 'open-cupboard', t: 0.6 },
      { k: 'prop', id: 'ao-giap', kind: 'bulletproof-vest', attach: 'van.handR', t: 2.6 }, { k: 'letterbox', on: false, t: 5.6 }],
      note: 'Vân opens the cupboard and takes out a bulletproof vest' },
  ],
  handoff: { player: { at: 'set:van-safehouse.table', vehicle: 'foot', space: 'van-safehouse' }, camera: 'blend', ms: 500 },
};

// ---- c9-m3 · the back door in the rain: the B2 keycard (34 s) --------------------------------------------------------
const quang: Scene = {
  id: 'c9m3-quang', mission: 'c9-m3', title: '@c9m3.cs.quang', kind: 'cutscene', seconds: 34, skippable: true,
  stage: { at: 'cafe-co-ba.backDoor', radius: 15, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 23.5, weather: 'rain', freezeClock: true } },
  cast: { tin: 'tin', quang: 'quang' },
  shots: [
    { dur: 5, label: 'mua', cam: { k: 'shot', eye: at('cafe-co-ba.backDoor', -3.5, 1.8, 4), look: 'quang.head', fov: 42 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'fx', kind: 'awning-drip', at: 'cafe-co-ba.backDoor' },
      { k: 'place', who: 'quang', at: at('cafe-co-ba.backDoor', 0.6, 0, 0.6), pose: 'stand' }, { k: 'expr', who: 'quang', e: 'pain' },
      { k: 'place', who: 'tin', at: at('cafe-co-ba.backDoor', -1.2, 0, 2.4), pose: 'stand' }, say('quang', 'c9m3.cs.q1', { t: 2.4 })],
      note: 'Quang under the back stairs out of the rain: face bruised and swollen, right arm in a cast (the director dresses him "beaten" from chapter 9)' },
    { dur: 7, label: 'the', cam: { k: 'insert', target: 'quang.handL', fov: 24, dist: 0.5 }, cues: [
      { k: 'prop', id: 'the', kind: 'keycard', attach: 'quang.handL' }, say('quang', 'c9m3.cs.q2', { t: 0.4 }), say('quang', 'c9m3.cs.q3', { t: 3.2 })],
      note: 'a black keycard with a golden lotus, held out in his good hand' },
    { dur: 6, label: 'dem-mai', cam: { k: 'shot', eye: at('quang.head', 0.3, 0, 0.9), look: 'quang.head', fov: 30 }, cues: [say('quang', 'c9m3.cs.q4', { t: 0.4 })] },
    { dur: 4, label: 'nhin', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.9), look: 'tin.head', fov: 30 }, cues: [{ k: 'look', who: 'tin', at: 'prop:the' }],
      note: 'Tín looks at the card and does not take it' },
    { dur: 7, label: 'di-cung', cam: { k: 'shot', eye: at('quang.head', -0.25, 0, 0.8), look: 'quang.head', fov: 28 }, cues: [
      { k: 'expr', who: 'quang', e: 'cry', t: 0.4 }, say('quang', 'c9m3.cs.q5', { t: 0.5 }), say('quang', 'c9m3.cs.q6', { t: 3.8 })] },
    { dur: 5, label: 'tra-loi', cam: { k: 'twoShot', a: 'tin', b: 'quang', fov: 38 }, cues: [
      { k: 'pair', clip: 'hand-on-shoulder', a: 'tin', b: 'quang', t: 0.3, if: keo },
      say('tin', 'c9m3.cs.tKeo', { t: 1.2, if: keo }), say('quang', 'c9m3.cs.qBo', { t: 1.2, if: { k: 'not', c: keo } }),
      { k: 'pair', clip: 'handover', a: 'quang', b: 'tin', t: 2.8 }, { k: 'prop', id: 'the', kind: 'keycard', attach: 'tin.handR', t: 3.2 },
      { k: 'letterbox', on: false, t: 4.6 }],
      note: 'after "Kéo nó dậy" (c6-m3) Tín puts a hand on his shoulder first; after "Bỏ đi" he only takes the card' },
  ],
  handoff: { player: { at: 'cafe-co-ba.backDoor', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c9-m3 · the raid: a van, vests and flip-flops; Quang draws half of them off (23 s) ------------------------------
const dotKich: Scene = {
  id: 'c9m3-dot-kich', mission: 'c9-m3', title: '@c9m3.cs.dotKich', kind: 'cutscene', seconds: 23, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 25, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 23.7, weather: 'rain', freezeClock: true } },
  sets: ['co-ba-ground'],
  cast: {
    tin: 'tin', coba: 'coba', quang: 'quang', rd: 'rd-ao-gia',
    raiders: { template: 'ran-den', count: 4, area: 'cafe-co-ba.raidVan', size: [6, 3], poses: ['stand'] },
  },
  shots: [
    { dur: 4, label: 'den-pha', cam: { k: 'shot', eye: at('set:co-ba-ground.table', 1.5, 1.3, 1.8), look: 'set:co-ba-ground.shutter', fov: 40 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'fx', kind: 'headlight-sweep', at: 'set:co-ba-ground.shutter', t: 0.4 },
      { k: 'place', who: 'tin', at: 'set:co-ba-ground.table', pose: 'sit-stool' }, { k: 'place', who: 'coba', at: at('set:co-ba-ground.table', 0.8, 0, -0.6), pose: 'stand' },
      { k: 'prop', id: 'to', kind: 'noodle-bowl', at: 'set:co-ba-ground.table' }, say('quang', 'c9m3.cs.q7', { t: 1.2 })],
      note: 'headlights sweep through the gaps of the shutter; Quang\'s shout from the back door' },
    { dur: 6, label: 'xe-toi', cam: { k: 'shot', eye: at('cafe-co-ba.raidVan', -6, 2, -4), look: 'cafe-co-ba.raidVan', fov: 44 }, cues: [
      { k: 'ride', id: 'xe-dot-kich', model: 'white-van', path: [at('cafe-co-ba.raidVan', -25, 0, 0), 'cafe-co-ba.raidVan'], speed: 9 },
      { k: 'sfx', id: 'flipflop-wet', t: 2 }, { k: 'place', who: 'rd', at: at('cafe-co-ba.raidVan', 2, 0, 3), pose: 'stand', t: 2 },
      say('rd', 'c9m3.cs.rd1', { t: 2.4 }), { k: 'sfx', id: 'shutter-bang', t: 3.4 }],
      note: 'a white van, men in police vests over black tank tops jump down into the rain, in flip-flops' },
    { dur: 5, label: 'dep-kep', cam: { k: 'shot', eye: at('coba.head', 0.3, 0, 0.9), look: 'coba.head', fov: 30 }, cues: [
      { k: 'expr', who: 'coba', e: 'angry' }, say('coba', 'c9m3.cs.coba1', { t: 0.5 }), { k: 'sfx', id: 'shutter-bang', t: 2.6 }] },
    { dur: 5, label: 'du', cam: { k: 'shot', eye: at('cafe-co-ba.backDoor', 2.5, 1.5, 3), look: 'quang.head', fov: 38 }, cues: [
      { k: 'place', who: 'quang', at: at('cafe-co-ba.backDoor', -2, 0, 1), pose: 'stand' }, say('quang', 'c9m3.cs.q8', { t: 0.4 }), { k: 'sfx', id: 'engine-rev', t: 2 },
      { k: 'ride', id: 'xe-quang', model: 'scooter', path: [at('cafe-co-ba.backDoor', -2, 0, 1), 'cho-an-hoa.westMouth'], speed: 8, driver: 'quang', t: 2.2 }],
      note: 'one-armed, Quang kicks his scooter alive and roars off west down the lane, honking; half of them run after him' },
    { dur: 3, label: 'cua-sau', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.8), look: 'tin.head', fov: 32 }, cues: [
      { k: 'place', who: 'tin', at: 'set:co-ba-ground.table', pose: 'stand' }, { k: 'expr', who: 'tin', e: 'determined' }, { k: 'letterbox', on: false, t: 2.6 }] },
  ],
  handoff: { player: { at: 'set:co-ba-ground.table', vehicle: 'foot', space: 'co-ba-ground' }, camera: 'blend', ms: 400 },
};

// ---- c9-m3 · the lane's east mouth: Hổ Vàng close it (12 s) ---------------------------------------------------------
const hoVang: Scene = {
  id: 'c9m3-ho-vang', mission: 'c9-m3', title: '@c9m3.cs.hoVang', kind: 'cutscene', seconds: 12, skippable: true,
  stage: { at: 'cho-an-hoa.eastMouth', radius: 15, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 23.8, weather: 'rain', freezeClock: true } },
  cast: { tin: 'tin', coba: 'coba', hv: 'ho-vang', rd: 'rd-ao-gia' },
  shots: [
    { dur: 5, label: 'chan', cam: { k: 'shot', eye: at('cho-an-hoa.eastMouth', 3, 1.6, -2), look: 'hv.head', fov: 40 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'place', who: 'tin', at: at('cho-an-hoa.eastMouth', 3, 0, 0.5), pose: 'stand' }, { k: 'place', who: 'coba', at: at('cho-an-hoa.eastMouth', 3.4, 0, 1.2), pose: 'stand' },
      { k: 'place', who: 'hv', at: at('cho-an-hoa.eastMouth', 1, 0, 0), pose: 'stand', yaw: -Math.PI / 2 }, { k: 'prop', id: 'xe-bia', kind: 'beer-cart', at: at('cho-an-hoa.eastMouth', -1.5, 0, 0) },
      { k: 'place', who: 'rd', at: at('cho-an-hoa.eastMouth', -6, 0, 0), pose: 'stand' }, say('hv', 'c9m3.cs.hv1', { t: 1 })],
      note: 'yellow shirts step out of the dark behind Tín and Cô Ba and drag a beer cart across the mouth of the lane' },
    { dur: 4, label: 'chu-tam', cam: { k: 'shot', eye: at('hv.head', 0.3, 0, 1), look: 'hv.head', fov: 32 }, cues: [say('hv', 'c9m3.cs.hv2', { t: 0.4 })] },
    { dur: 3, label: 'lui', cam: { k: 'shot', eye: at('rd.head', 0.3, 0, 1.2), look: 'rd.head', fov: 34 }, cues: [say('rd', 'c9m3.cs.rd2', { t: 0.3 }), { k: 'letterbox', on: false, t: 2.6 }],
      note: 'the raiders count the yellow shirts and back off' },
  ],
  handoff: { player: { at: 'cho-an-hoa.eastMouth', vehicle: 'foot' }, camera: 'blend', ms: 400 },
};

// ---- c9-m3 · the pagoda gate: only fallen leaves (34 s) --------------------------------------------------------------
const laRung: Scene = {
  id: 'c9m3-la-rung', mission: 'c9-m3', title: '@c9m3.cs.laRung', kind: 'cutscene', seconds: 34, skippable: true,
  stage: { at: 'chua-an-hoa.gate', radius: 25, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 23.95, weather: 'rain', freezeClock: true } },
  cast: { tin: 'tin', coba: 'coba', thay: 'thay-minh-tinh', bk: 'rd-xe' },
  shots: [
    { dur: 6, label: 'cong', cam: { k: 'crane', from: at('chua-an-hoa.gate', 0, 9, -6), to: at('chua-an-hoa.gate', 0, 3, -5), look: 'chua-an-hoa.gate', fov: [55, 45], ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'music', id: null, fade: 1 }, { k: 'sfx', id: 'lion-drums-muffled', t: 0.5 },
      { k: 'place', who: 'thay', at: 'chua-an-hoa.broom', pose: 'stand' }, { k: 'anim', who: 'thay', clip: 'sweep', loop: true },
      { k: 'walk', who: 'tin', path: ['chua-an-hoa.car', at('chua-an-hoa.gate', 0.5, 0, 5)], pace: 'run' },
      { k: 'walk', who: 'coba', path: ['chua-an-hoa.car', at('chua-an-hoa.gate', 0, 0, 5.5)], pace: 'walk' }],
      note: 'the bike left at the curb; Tín helps Cô Ba through the three-way gate while the abbot sweeps; somewhere children practise lion-dance drums for tomorrow' },
    { dur: 6, label: 'xe-toi', cam: { k: 'shot', eye: at('chua-an-hoa.car', -5, 1.5, -2), look: 'chua-an-hoa.car', fov: 42 }, cues: [
      { k: 'ride', id: 'bk-1', model: 'scooter', path: [at('chua-an-hoa.car', -40, 0, -2), at('chua-an-hoa.car', -2, 0, 0)], speed: 9, driver: 'bk' },
      { k: 'ride', id: 'bk-2', model: 'scooter', path: [at('chua-an-hoa.car', -44, 0, 1), at('chua-an-hoa.car', -4, 0, 2)], speed: 9 },
      { k: 'sfx', id: 'engine-rev', t: 3 }, say('bk', 'c9m3.cs.bk1', { t: 3.4 })],
      note: 'two more bikers of the raid pull up at the gate, engines revving; they stop at the road (no fighting at the pagoda)' },
    { dur: 8, label: 'quet', cam: { k: 'shot', eye: at('thay.head', 0.4, 0, 1.2), look: 'thay.head', fov: 32 }, cues: [
      { k: 'anim', who: 'thay', clip: 'sweep', loop: true }, { k: 'expr', who: 'thay', e: 'neutral' },
      say('thay', 'c9m3.cs.tmt1', { t: 1.4 }), say('bk', 'c9m3.cs.bk2', { t: 6.2 })],
      note: 'he does not look up from the leaves' },
    { dur: 4, label: 'di', cam: { k: 'shot', eye: at('chua-an-hoa.gate', 1, 1.6, 2), look: 'chua-an-hoa.car', fov: 44 }, cues: [
      { k: 'ride', id: 'bk-1', model: 'scooter', path: [at('chua-an-hoa.car', -2, 0, 0), at('chua-an-hoa.car', 30, 0, 0)], speed: 10, driver: 'bk' },
      { k: 'ride', id: 'bk-2', model: 'scooter', path: [at('chua-an-hoa.car', -4, 0, 2), at('chua-an-hoa.car', 28, 0, 2)], speed: 10 }, { k: 'sfx', id: 'engine-rev' }] },
    { dur: 6, label: 'nam-tay', cam: { k: 'shot', eye: at('chua-an-hoa.gate', 2, 1.4, 7), look: 'coba.head', fov: 34 }, cues: [
      { k: 'place', who: 'coba', at: at('chua-an-hoa.gate', 0.5, 0, 6), pose: 'stand' }, { k: 'place', who: 'tin', at: at('chua-an-hoa.gate', 1.1, 0, 6.2), pose: 'stand' },
      { k: 'pair', clip: 'press-hand', a: 'coba', b: 'tin', t: 0.6 }, say('coba', 'c9m3.cs.coba2', { t: 1.2 })],
      note: 'behind the stupa, Cô Ba presses Tín\'s hand between both of hers' },
    { dur: 4, label: 'di-di', cam: { k: 'shot', eye: at('thay.head', -0.3, 0, 1.1), look: 'thay.head', fov: 32 }, cues: [
      say('thay', 'c9m3.cs.tmt2', { t: 0.4 }), { k: 'letterbox', on: false, t: 3.6 }] },
  ],
  handoff: { player: { at: 'chua-an-hoa.gate', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c9-m3 · Vân's car before Rằm (33 s) -----------------------------------------------------------------------------
const tapHop: Scene = {
  id: 'c9m3-tap-hop', mission: 'c9-m3', title: '@c9m3.cs.tapHop', kind: 'cutscene', seconds: 33, skippable: true,
  stage: { at: 'chua-an-hoa', radius: 25, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 23.98, weather: 'rain', freezeClock: true } },
  cast: { tin: 'tin', van: 'van', quang: 'quang' },
  shots: [
    { dur: 5, label: 'xe', cam: { k: 'shot', eye: at('vehicle:vios-van', -3, 1.6, 5), look: 'vehicle:vios-van', fov: 42 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'place', who: 'van', at: at('vehicle:vios-van', -0.4, 0.5, 0.3), pose: 'sit-chair' }, { k: 'place', who: 'tin', at: at('vehicle:vios-van', 0.4, 0.5, 0.3), pose: 'sit-chair' },
      { k: 'place', who: 'quang', at: at('vehicle:vios-van', 0.4, 0.5, -0.9), pose: 'sit-chair' }, say('van', 'c9m3.cs.v1', { t: 1 })],
      note: 'Vân\'s old silver sedan, wipers going; Quang in the back seat with his cast on his knee' },
    { dur: 5, label: 'quang', cam: { k: 'shot', eye: at('quang.head', 0.3, 0, 0.8), look: 'quang.head', fov: 34 }, cues: [
      { k: 'expr', who: 'quang', e: 'smile' }, say('quang', 'c9m3.cs.q9', { t: 1.2 })] },
    { dur: 6, label: 'chi-van', cam: { k: 'shot', eye: at('van.head', 0.3, 0, 0.8), look: 'van.head', fov: 32 }, cues: [
      say('van', 'c9m3.cs.vSach', { t: 0.6, if: { k: 'not', c: killed } }), say('van', 'c9m3.cs.vGiet', { t: 0.6, if: killed })],
      note: 'Vân knows how the lane went from Tám Hổ\'s boys: one line for a night without a death, another for a night with one' },
    { dur: 7, label: 'trang', cam: { k: 'shot', eye: at('tin.head', 0.2, 0.05, 0.6), look: at('vehicle:vios-van', 0, 8, 30), fov: 40 }, cues: [
      say('tin', 'c9m3.cs.t1', { t: 0.6 }), say('tin', 'c9m3.cs.t2', { t: 4.4 })],
      note: 'through the windscreen, between the clouds, a moon one night short of full' },
    { dur: 5, label: 'u', cam: { k: 'shot', eye: at('quang.head', -0.2, 0, 0.8), look: 'quang.head', fov: 32 }, cues: [
      { k: 'expr', who: 'quang', e: 'cry', t: 0.4 }, say('quang', 'c9m3.cs.q10', { t: 1 })] },
    { dur: 5, label: 'ngu-di', cam: { k: 'shot', eye: at('vehicle:vios-van', 4, 2.2, -6), look: 'vehicle:vios-van', fov: 46 }, cues: [
      say('van', 'c9m3.cs.v2', { t: 0.8 }), { k: 'letterbox', on: false, t: 4.6 }] },
  ],
  handoff: { player: { at: 'ch9.vios-chua', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

export const CUTSCENES: Scene[] = [banTin, lam, phongBi, tamHo, banNhau, lo, bonMuoiTam, quang, dotKich, hoVang, laRung, tapHop];
