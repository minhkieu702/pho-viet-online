import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Extra, Mark, Scene } from '../scene.ts';

/**
 * Chapter 7 cutscenes as data (schema and conventions: story/scene.ts). Lines are '@keys' of text/vi/ch07.ts; marks
 * are story/sites.ts sites and spots, the chapter's own places ('ch7.cont-07', derived from the barge's hull in
 * content/ch07.ts PLACES), cast joints, and 'vehicle:<id>' for the boats the missions spawn (ca-no, tau-keo,
 * ca-no-loc-1). The numbered scene is the bible's CS07 (cs07_container_07, 45 s, eight shots); the others are the
 * chapter's short beats: Cô Ba and Ông Tư's jacket, Vân on the jetty, the slow-motion vault into the speedboat (a
 * freezeWorld scene, no QTE), the handover at BẾN BẠCH ĐẰNG and Lực's ward cars.
 * Dignity: the captives sit or stand in whitelist poses only, Hoa shields the little ones and later hugs Bé Tí (the
 * one pair allowed), nobody is struck; the bullets only tear the water; the eleven aboard the speedboat in the chase
 * scene are the escort group itself (seated low in the boat), never a second batch.
 */

const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; if?: Cond; t?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });
const captives = (template: string, count: number, area: Mark, size: [number, number], poses: string[]): Extra => ({ template, count, area, size, poses });

// ---- c7-m1 · Cô Ba and Ông Tư's jacket on the café porch (28 s) ----------------------------------------------------------
const ao: Scene = {
  id: 'c7m1-ao', mission: 'c7-m1', title: '@c7m1.cs.ao', kind: 'cutscene', seconds: 28, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 16, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 16.1, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', coba: 'coba' },
  shots: [
    { dur: 5, label: 'hien', cam: { k: 'shot', eye: at('cafe-co-ba.quangTable', 3.5, 1.6, -5), look: 'cafe-co-ba.quangTable', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' },
      { k: 'place', who: 'coba', at: 'cafe-co-ba.quangTable', pose: 'stand' }, { k: 'anim', who: 'coba', clip: 'wipe-glass' },
      { k: 'place', who: 'tin', at: at('cafe-co-ba.quangTable', -1.6, 0, -1.2), pose: 'stand' },
      { k: 'prop', id: 'coi', kind: 'whistle', attach: 'tin.chest' },
      say('coba', 'c7m1.cs.ao1', { t: 1.5 })],
      note: 'the porch in the slow afternoon, the café almost empty; Mực asleep on the back stairs out of frame' },
    { dur: 7, label: 'hai-nguoi', cam: { k: 'twoShot', a: 'coba', b: 'tin', fov: 40 }, cues: [
      say('coba', 'c7m1.cs.ao2', { t: 0.3 }), { k: 'prop', id: 'ao', kind: 'jacket', attach: 'coba.handR', t: 3.6 },
      say('coba', 'c7m1.cs.ao3', { t: 4.3 }), { k: 'pair', clip: 'handover', a: 'coba', b: 'tin', t: 5.2 }],
      note: 'from under the counter: a faded dark jacket, folded square, oil stains at the cuffs' },
    { dur: 6, label: 'ao', cam: { k: 'insert', target: 'tin.handR', fov: 22, dist: 0.4 }, cues: [
      { k: 'prop', id: 'ao', kind: 'jacket', attach: 'tin.handR', t: 0.4 }, say('coba', 'c7m1.cs.ao4', { t: 1 })],
      note: 'his hands close on the jacket; her hand stays on top of his a moment' },
    { dur: 6, label: 'coi', cam: { k: 'shot', eye: at('coba.head', 0.25, 0, 0.9), look: 'coba.head', fov: 28 }, cues: [
      { k: 'look', who: 'coba', at: 'tin.chest' }, { k: 'expr', who: 'coba', e: 'worried' },
      say('coba', 'c7m1.cs.ao5', { t: 0.8 }), say('coba', 'c7m1.cs.ao6', { t: 3.6 })],
      note: 'her eyes fall on Ông Tư\'s whistle on its cord; the gruff voice cracks on "Nghe chưa"' },
    { dur: 4, label: 'nghe', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.8), look: 'tin.head', fov: 30 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c7m1.cs.ao7', { t: 0.6 }), { k: 'letterbox', on: false, t: 3.6 }] },
  ],
  handoff: { player: { at: at('cafe-co-ba.quangTable', -1.6, 0, -1.2), vehicle: 'foot', outfit: 'tin-ao-tu' }, camera: 'blend', ms: 600 },
};

// ---- c7-m1 · Vân on the jetty at dusk: suspended, Lộc, the zip ties and the tracker (35 s) ------------------------------
const van: Scene = {
  id: 'c7m1-van', mission: 'c7-m1', title: '@c7m1.cs.van', kind: 'cutscene', seconds: 35, skippable: true,
  stage: { at: 'ben-du-thuyen', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 17.8, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', van: 'van' },
  shots: [
    { dur: 6, label: 'cau-tau', cam: { k: 'shot', eye: at('ben-du-thuyen.jetty', -8, 3, -10), look: 'ben-du-thuyen.jetty', fov: 48 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' },
      { k: 'place', who: 'van', at: 'ben-du-thuyen.jetty', pose: 'stand' }, { k: 'prop', id: 'bo-dam', kind: 'radio', attach: 'van.handR' },
      { k: 'anim', who: 'van', clip: 'radio-talk' }, { k: 'place', who: 'tin', at: at('ben-du-thuyen.jetty', -1.2, 0, -1.6), pose: 'stand' },
      say('van', 'c7m1.cs.van1', { t: 1 }), say('tin', 'c7m1.cs.tin1', { t: 4.4 })],
      note: 'sunset on the river; Vân in her worn leather jacket, a radio murmuring the river-police channel; far upstream, the barge a dark block' },
    { dur: 7, label: 'dinh-chi', cam: { k: 'twoShot', a: 'van', b: 'tin', fov: 38 }, cues: [
      { k: 'expr', who: 'van', e: 'determined' }, say('van', 'c7m1.cs.van2', { t: 0.4 }), say('van', 'c7m1.cs.van3', { t: 3.6 })],
      note: 'no uniform, no badge on her belt' },
    { dur: 8, label: 'loc', cam: { k: 'ots', speaker: 'van', listener: 'tin', side: 'left', fov: 34 }, cues: [
      say('van', 'c7m1.cs.van4', { t: 0.6 }), say('van', 'c7m1.cs.van5', { t: 4.6 })] },
    { dur: 8, label: 'do-nghe', cam: { k: 'insert', target: 'van.handR', fov: 24, dist: 0.5 }, cues: [
      { k: 'prop', id: 'day-rut', kind: 'zip-ties', attach: 'van.handR' }, say('van', 'c7m1.cs.van6', { t: 0.8 }),
      { k: 'pair', clip: 'handover', a: 'van', b: 'tin', t: 1.2 }, { k: 'prop', id: 'day-rut', kind: 'zip-ties', attach: 'tin.handL', t: 2.4 },
      { k: 'prop', id: 'dinh-vi', kind: 'gps-tracker', attach: 'van.handR', t: 4.4 }, say('van', 'c7m1.cs.van7', { t: 5.2 }),
      { k: 'prop', id: 'dinh-vi', kind: 'gps-tracker', attach: 'tin.handR', t: 7 }],
      note: 'a bundle of black zip ties, then a matchbox-sized tracker' },
    { dur: 6, label: 'hen', cam: { k: 'shot', eye: at('van.head', -0.3, 0, 1), look: 'van.head', fov: 30 }, cues: [
      say('van', 'c7m1.cs.van9', { t: 0.2 }), say('tin', 'c7m1.cs.tin2', { t: 1.9 }),
      { k: 'look', who: 'van', at: 'sa-lan-07', t: 3 }, say('van', 'c7m1.cs.van8', { t: 3.3 }), { k: 'letterbox', on: false, t: 5.6 }],
      note: 'his phone has lived in a waterproof pouch since the rains (ch.2); then she looks upstream at the barge, not at him' },
  ],
  handoff: { player: { at: at('ben-du-thuyen.jetty', -1.2, 0, -1.6), vehicle: 'foot' }, camera: 'blend', ms: 600 },
};

// ---- c7-m2 · CS07 container 07 (45 s, story-final.md cs07_container_07) --------------------------------------------------
const cs07: Scene = {
  id: 'cs07_container_07', mission: 'c7-m2', title: '@cs07.title', kind: 'cutscene', seconds: 45, skippable: true,
  stage: { at: 'sa-lan-07', radius: 30, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 22.8, weather: 'rain', freezeClock: true } },
  cast: {
    tin: 'tin', hoa: 'hoa', beti: 'beti',
    teens: captives('captive-teen', 5, 'ch7.trong-cont', [4.8, 1.6], ['sit-hug-knees', 'stand-head-down']),
    small: captives('captive-child', 2, at('ch7.trong-cont', 0.4, 0, 0.3), [1.6, 1], ['sit-hug-knees']),
    adults: captives('captive-adult', 2, at('ch7.trong-cont', -1.6, 0, 0), [1.6, 1.2], ['sit-hug-knees', 'shield-younger']),
  },
  shots: [
    { dur: 5, label: 'o-khoa', cam: { k: 'insert', target: at('ch7.cont-07', 0, 1.1, 0), fov: 35, dist: 0.6 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'ambience', id: 'rain-river' }, { k: 'sfx', id: 'searchlight-hum' },
      { k: 'place', who: 'tin', at: at('ch7.cont-07', 0, 0, -0.5), pose: 'crouch' },
      { k: 'prop', id: 'o-khoa', kind: 'padlock', at: at('ch7.cont-07', 0, 1.1, 0) }, { k: 'prop', id: 'kim', kind: 'bolt-cutters', attach: 'tin.handR' },
      { k: 'fx', kind: 'searchlight', at: 'sa-lan-07.wheelhouse', t: 1.5 }, { k: 'sfx', id: 'bolt-cut', t: 3.2 },
      { k: 'prop', id: 'o-khoa', kind: 'padlock', at: at('ch7.cont-07', 0, 1.1, 0), variant: 'cut', t: 3.4 }],
      note: 'rain on the padlock; the bolt cutters bite; the searchlight beam slides across Tín\'s back and moves on' },
    { dur: 5, label: 'mo-cua', cam: { k: 'shot', eye: at('ch7.trong-cont', 0, 1.2, 0), look: at('ch7.cont-07', 0, 1.2, 0), fov: 75 }, cues: [
      { k: 'sfx', id: 'gate-screech', t: 0.3 }, { k: 'sfx', id: 'child-cough', t: 2.6 },
      { k: 'prop', id: 'sen-tuong', kind: 'charcoal-lotus', at: at('ch7.trong-cont', 1.1, 1.3, 0.2) }],
      note: 'from inside, looking out: the door screeches open and a slit of rain and light widens over the eyes in the dark; a small charcoal lotus on the steel wall' },
    { dur: 4, label: 'gau', cam: { k: 'shot', eye: at('beti.head', 0.2, 0.05, 0.9), look: 'beti.head', fov: 35 }, cues: [
      { k: 'place', who: 'beti', at: at('ch7.trong-cont', 0.6, 0, 0.8), pose: 'sit-hug-knees' },
      { k: 'prop', id: 'gau', kind: 'torn-bear', attach: 'beti.handL' }, { k: 'expr', who: 'beti', e: 'eyes-closed' }],
      note: 'Bé Tí lifts his torn bear in front of his face (a held prop, no animation)' },
    { dur: 6, label: 'hoa', cam: { k: 'shot', eye: at('hoa.head', -0.4, 0, 1.5), look: 'hoa.head', fov: 45 }, cues: [
      { k: 'place', who: 'hoa', at: at('ch7.trong-cont', 0.2, 0, 1.4), pose: 'shield-younger' }, { k: 'expr', who: 'hoa', e: 'shock' },
      say('hoa', 'cs07.hoa1', { t: 1.4 }), { k: 'expr', who: 'hoa', e: 'cry', t: 3 }, say('tin', 'cs07.tin1', { t: 3.6 })],
      note: 'Hoa steps in front of the little ones with her arms out, then knows him: the shipper from room 7' },
    { dur: 8, label: 'ngang-tam', cam: { k: 'twoShot', a: 'tin', b: 'hoa', fov: 40 }, cues: [
      { k: 'place', who: 'tin', at: at('ch7.trong-cont', 0, 0, 2), pose: 'crouch' }, { k: 'look', who: 'tin', at: 'hoa.head' },
      say('tin', 'cs07.tin2', { t: 0.3 }), say('hoa', 'cs07.hoa2', { t: 2.6 }), say('hoa', 'cs07.hoa3', { t: 4.6 }), say('hoa', 'cs07.hoa4', { t: 6.8 })],
      note: 'Tín crouches to her eye level' },
    { dur: 5, label: 'nho', cam: { k: 'shot', eye: at('hoa.head', 0.2, 0, 0.8), look: 'hoa.head', fov: 30 }, cues: [
      { k: 'expr', who: 'hoa', e: 'worried' }, say('hoa', 'cs07.hoa5', { t: 0.4 })], note: 'she remembers' },
    { dur: 4, label: 'b2', cam: { k: 'shot', eye: at('tin.head', 0.25, 0, 0.7), look: 'tin.head', fov: 30 }, cues: [
      { k: 'sfx', id: 'club-through-wall', t: 0.4 }, { k: 'expr', who: 'tin', e: 'eyes-closed' }, say('tin', 'cs07.tin3', { ch: 'inner', t: 1.6 })],
      note: 'the rain fades and Moonlight\'s bass comes back in his head: thình... thình...' },
    { dur: 8, label: 'sen-than', cam: { k: 'insert', target: 'tin.handR', fov: 22, dist: 0.35 }, cues: [
      { k: 'prop', id: 'bia-sen', kind: 'lotus-cardboard', attach: 'hoa.handR' }, say('hoa', 'cs07.hoa6', { t: 0.6 }),
      { k: 'prop', id: 'bia-sen', kind: 'lotus-cardboard', attach: 'tin.handR', t: 1.6 }, say('hoa', 'cs07.hoa7', { t: 4 }), { k: 'letterbox', on: false, t: 7.6 }],
      note: 'Hoa presses a scrap of cardboard with a charcoal lotus into his palm' },
  ],
  handoff: { player: { at: 'ch7.cont-07', vehicle: 'foot', crouch: true }, camera: 'blend', ms: 500 },
};

// ---- c7-m3 · the tug's searchlight, "Bắn!", the vault into the driver's seat (22 s, freezeWorld) -------------------------
const nhay: Scene = {
  id: 'c7m3-nhay', mission: 'c7-m3', title: '@c7m3.cs.nhay', kind: 'action', seconds: 22, skippable: true,
  stage: { at: 'sa-lan-07', radius: 60, crowd: 'hide', traffic: 'hold', police: 'pause', freezeWorld: true, env: { hours: 22.95, weather: 'rain', freezeClock: true } },
  cast: { tin: 'tin', cuong: 'cuong', gunmen: { template: 'ran-den', count: 3, area: at('vehicle:tau-keo', 0, 1.5, 3), size: [3, 2], poses: ['stand'] } },
  shots: [
    { dur: 4, label: 'trang', cam: { k: 'shot', eye: at('ch7.thang-lai', 0, 1.7, 0), look: 'vehicle:tau-keo', fov: 50 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'ambience', id: 'rain-river' }, { k: 'music', id: 'pulse' },
      { k: 'place', who: 'tin', at: 'ch7.thang-lai', pose: 'crouch' }, { k: 'fx', kind: 'searchlight', at: 'vehicle:tau-keo' }, { k: 'fx', kind: 'rain-on-lens', t: 1 }],
      note: 'the tug\'s searchlight swings onto the stern and whites everything out' },
    { dur: 5, label: 'cuong', cam: { k: 'shot', eye: at('vehicle:tau-keo', 1.5, 1.2, 9), look: 'cuong.head', fov: 32 }, cues: [
      { k: 'place', who: 'cuong', at: at('vehicle:tau-keo', 0, 2.2, 5), pose: 'stand' }, { k: 'expr', who: 'cuong', e: 'angry' },
      say('cuong', 'c7m3.cs.nhay1', { t: 0.8 }), { k: 'sfx', id: 'gunfire-burst', t: 3 }],
      note: 'Cường at the tug\'s bow, rain lashing sideways' },
    { dur: 7, label: 'nhay', cam: { k: 'move', from: at('ch7.thang-lai', 3, 2.5, 4), to: at('sa-lan-07.ladder', 2, 1.2, 3), look: 'tin', fov: [40, 34], ease: 'inOutSine' }, cues: [
      { k: 'slowmo', scale: 0.3, seconds: 6 }, { k: 'anim', who: 'tin', clip: 'vault-rail', t: 0.2 },
      { k: 'fx', kind: 'bullet-splash', at: at('vehicle:ca-no', 2, 0, 4), t: 1 }, say('tin', 'c7m3.cs.nhay2', { t: 1.2 }),
      { k: 'fx', kind: 'bullet-splash', at: at('vehicle:ca-no', -2, 0, 6), t: 2.2 },
      { k: 'place', who: 'tin', at: at('vehicle:ca-no', 0, 0.6, -1.2), pose: 'sit', t: 3.5 }],
      note: 'slow motion: Tín vaults the barge railing into the driver\'s seat as the kids already aboard duck low; bullets tear the water into white columns behind the boat' },
    { dur: 3, label: 'ga', cam: { k: 'insert', target: at('vehicle:ca-no', 0.3, 0.9, -0.8), fov: 24, dist: 0.4 }, cues: [{ k: 'sfx', id: 'engine-roar', t: 0.3 }],
      note: 'his hand slams the throttle forward' },
    { dur: 3, label: 'chom-mui', cam: { k: 'shot', eye: at('vehicle:ca-no', -6, 1, 8), look: 'vehicle:ca-no', fov: 45 }, cues: [
      { k: 'fx', kind: 'bullet-splash', at: at('vehicle:ca-no', 1, 0, -6), t: 0.2 }, { k: 'letterbox', on: false, t: 2.6 }],
      note: 'the bow rears and the boat tears away from the barge' },
  ],
  handoff: { player: { at: 'vehicle:ca-no', vehicle: 'boat' }, camera: 'blend', ms: 400 },
};

// ---- c7-m3 · BẾN BẠCH ĐẰNG: blankets, hot water, "Mình gọi cho má con nha", the bear's ear (35 s) -----------------------
/** The stuffed bear's ear Tín found on the KHO 7 fence in c3-m2 (optional clue): paid off on the pier. */
const hasEar: Cond = { k: 'evidence', id: 'ev-tai-gau' };
const ben: Scene = {
  id: 'c7m3-ben', mission: 'c7-m3', title: '@c7m3.cs.ben', kind: 'cutscene', seconds: 35, skippable: true,
  stage: { at: 'ben-bach-dang', radius: 30, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 23.2, weather: 'rain', freezeClock: true } },
  cast: {
    tin: 'tin', van: 'van', loc: 'loc', csnu: 'cs-nu', hoa: 'hoa', beti: 'beti',
    teens: captives('captive-teen', 5, 'ben-bach-dang.handover', [6, 3], ['sit', 'stand-head-down']),
    small: captives('captive-child', 2, at('ben-bach-dang.handover', -1.5, 0, 1), [2, 1.5], ['sit-hug-knees']),
    adults: captives('captive-adult', 2, at('ben-bach-dang.handover', 1.5, 0, 1), [2, 1.5], ['sit']),
    cops: { template: 'river-cop', count: 4, area: at('ben-bach-dang.handover', 0, 0, -3), size: [8, 3], poses: ['stand'] },
  },
  shots: [
    { dur: 5, label: 'xuong-ben', cam: { k: 'crane', from: at('ben-bach-dang', -12, 14, -14), to: at('ben-bach-dang', -6, 5, -8), look: 'ben-bach-dang.handover', fov: [55, 45], ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'ambience', id: 'rain-river' }, { k: 'music', id: null, fade: 1.5 },
      { k: 'fx', kind: 'police-lights', at: 'vehicle:ca-no-loc-1' },
      { k: 'prop', id: 'chan-1', kind: 'blanket', at: 'ben-bach-dang.handover' }, { k: 'prop', id: 'coc', kind: 'cup-hot', at: at('ben-bach-dang.handover', 0.8, 0.9, 0.4) }],
      note: 'the pier under the river police\'s blue lights; the speedboat moored; officers lift the children up from the boat and wrap them in grey blankets' },
    { dur: 6, label: 'loc', cam: { k: 'twoShot', a: 'loc', b: 'van', fov: 38 }, cues: [
      { k: 'place', who: 'loc', at: at('ben-bach-dang.handover', 1.2, 0, 0), pose: 'stand' }, { k: 'place', who: 'van', at: at('ben-bach-dang.handover', -0.4, 0, 0.6), pose: 'stand' },
      { k: 'prop', id: 'bo-dam', kind: 'radio', attach: 'loc.handR' }, { k: 'anim', who: 'loc', clip: 'radio-talk' },
      say('loc', 'c7m3.cs.ben1', { t: 1 }), { k: 'anim', who: 'van', clip: 'nod', t: 3.5 }],
      note: 'Lộc counts them himself, moustache dripping, life vest over the uniform' },
    { dur: 7, label: 'quy-xuong', cam: { k: 'shot', eye: at('ben-bach-dang.blankets', 1.4, 0.7, 1.2), look: 'beti.head', fov: 32 }, cues: [
      { k: 'place', who: 'beti', at: 'ben-bach-dang.blankets', pose: 'stand' }, { k: 'prop', id: 'chan-2', kind: 'blanket', attach: 'beti.chest' },
      { k: 'prop', id: 'gau', kind: 'torn-bear', attach: 'beti.handL' },
      { k: 'place', who: 'csnu', at: at('ben-bach-dang.blankets', 0, 0, -0.7), pose: 'crouch' }, { k: 'look', who: 'csnu', at: 'beti.head' },
      say('csnu', 'c7m3.cs.ben2', { t: 1.2 })],
      note: 'a female officer kneels to Bé Tí\'s eye level; he still holds the bear' },
    { dur: 3, label: 'tai-gau', cam: { k: 'insert', target: 'beti.handL', fov: 24, dist: 0.5 }, cues: [
      { k: 'place', who: 'tin', at: at('ben-bach-dang.blankets', -0.6, 0, -0.5), pose: 'crouch', if: hasEar },
      { k: 'prop', id: 'tai', kind: 'torn-bear', variant: 'ear', attach: 'tin.handR', if: hasEar }, say('tin', 'c7m3.cs.taiGau', { t: 0.5, if: hasEar }),
      { k: 'prop', id: 'tai', kind: 'torn-bear', variant: 'ear', attach: 'beti.handL', t: 2, if: hasEar }],
      note: 'the torn bear in his small wet hand; if Tín kept the ear from the scrubbed KHO 7 (c3-m2), he crouches and puts it in Tí\'s palm next to the bear' },
    { dur: 6, label: 'om', cam: { k: 'twoShot', a: 'hoa', b: 'beti', fov: 36 }, cues: [
      { k: 'place', who: 'hoa', at: at('ben-bach-dang.blankets', 0.5, 0, 0.3), pose: 'stand' }, { k: 'prop', id: 'chan-3', kind: 'blanket', attach: 'hoa.chest' },
      { k: 'pair', clip: 'hug', a: 'hoa', b: 'beti', t: 0.6 }, { k: 'expr', who: 'hoa', e: 'cry', t: 1.2 }],
      note: 'Hoa hugs Tí; for the first time tonight she cries' },
    { dur: 5, label: 'tin', cam: { k: 'shot', eye: at('tin.head', -0.3, 0, 0.9), look: 'tin.head', fov: 30 }, cues: [
      { k: 'place', who: 'tin', at: at('ben-bach-dang.handover', -2.5, 0, 2), pose: 'stand' }, { k: 'fx', kind: 'dripping-wet' },
      { k: 'expr', who: 'tin', e: 'smile' }, say('tin', 'c7m3.cs.ben3', { ch: 'inner', t: 0.8 })],
      note: 'soaked, in Ông Tư\'s jacket, at the edge of the light' },
    { dur: 3, label: 'den-do', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.8), look: 'tin.head', fov: 28 }, cues: [
      { k: 'fx', kind: 'police-lights', at: 'ben-bach-dang.lucCars', t: 0.4 }, { k: 'sfx', id: 'siren-short', t: 0.6 }, { k: 'expr', who: 'tin', e: 'worried', t: 0.8 },
      { k: 'letterbox', on: false, t: 2.6 }],
      note: 'red and blue sweep across his face from the road: these lights are not the river police\'s' },
  ],
  handoff: { player: { at: at('ben-bach-dang.handover', -2.5, 0, 2), vehicle: 'foot' }, camera: 'blend', ms: 400 },
};

// ---- c7-m3 · Lực's ward cars; Vân steps in front of Tín; ĐÃ CỨU: 11 (30 s) --------------------------------------------
const luc: Scene = {
  id: 'c7m3-luc', mission: 'c7-m3', title: '@c7m3.cs.luc', kind: 'cutscene', seconds: 30, skippable: true,
  stage: { at: 'ben-bach-dang', radius: 40, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 23.25, weather: 'rain', freezeClock: true } },
  cast: { tin: 'tin', van: 'van', loc: 'loc', luc: 'luc', cops: { template: 'ward-cop', count: 3, area: at('ben-bach-dang.lucCars', -3, 0, -4), size: [6, 3], poses: ['stand'] } },
  shots: [
    { dur: 5, label: 'xe-toi', cam: { k: 'shot', eye: at('ben-bach-dang.blankets', -3, 1.6, 3), look: 'ben-bach-dang.lucCars', fov: 42 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'ride', id: 'xe-phuong-1', model: 'police', path: [at('ben-bach-dang.lucCars', 40, 0, 0), 'ben-bach-dang.lucCars'], speed: 10 },
      { k: 'ride', id: 'xe-phuong-2', model: 'police', path: [at('ben-bach-dang.lucCars', 52, 0, 0), at('ben-bach-dang.lucCars', 8, 0, 0)], speed: 10 },
      { k: 'fx', kind: 'police-lights', at: 'ben-bach-dang.lucCars' }, { k: 'sfx', id: 'siren-short', t: 0.5 }],
      note: 'two ward cars brake hard on the riverside road; doors open' },
    { dur: 6, label: 'chi-mat', cam: { k: 'shot', eye: at('luc.head', 0.4, 0, 1.6), look: 'luc.head', fov: 30 }, cues: [
      { k: 'place', who: 'luc', at: at('ben-bach-dang.lucCars', -2, 0, -6), pose: 'stand' },
      { k: 'walk', who: 'luc', path: [at('ben-bach-dang.lucCars', -2, 0, -6), at('ben-bach-dang.blankets', 5, 0, 4)] },
      { k: 'expr', who: 'luc', e: 'angry' }, { k: 'anim', who: 'luc', clip: 'point-at', t: 1.6 },
      say('luc', 'c7m3.cs.luc1', { t: 1.8 }), say('luc', 'c7m3.cs.luc2', { t: 3.6 })],
      note: 'Lực in his pressed uniform, rain on the gold watch; he points straight at Tín' },
    { dur: 6, label: 'chan', cam: { k: 'twoShot', a: 'van', b: 'luc', fov: 36 }, cues: [
      { k: 'place', who: 'tin', at: 'ben-bach-dang.blankets', pose: 'stand' },
      { k: 'walk', who: 'van', path: [at('ben-bach-dang.blankets', -1.5, 0, 1), at('ben-bach-dang.blankets', 1.2, 0, 0.6)] },
      { k: 'expr', who: 'van', e: 'determined', t: 1 }, say('van', 'c7m3.cs.luc3', { t: 1.4 })],
      note: 'Vân steps between them, unarmed, suspended, not moving an inch' },
    { dur: 5, label: 'loc', cam: { k: 'ots', speaker: 'loc', listener: 'luc', side: 'right', fov: 34 }, cues: [
      { k: 'walk', who: 'loc', path: [at('ben-bach-dang.blankets', 0, 0, -2), at('ben-bach-dang.blankets', 1.8, 0, 0)] },
      say('loc', 'c7m3.cs.luc4', { t: 0.8 })],
      note: 'Lộc comes to stand beside her; behind him the river police line up along the pier' },
    { dur: 5, label: 'cuoi-nhech', cam: { k: 'shot', eye: at('luc.head', -0.25, 0, 1), look: 'luc.head', fov: 28 }, cues: [
      { k: 'expr', who: 'luc', e: 'cold-smile' }, say('luc', 'c7m3.cs.luc5', { t: 0.8 })],
      note: 'the kind-uncle smile comes back; it is worse than the shouting' },
    { dur: 3, label: 'lui', cam: { k: 'shot', eye: at('tin.head', 0.5, 0.1, 2.2), look: 'tin.head', fov: 40 }, cues: [
      { k: 'walk', who: 'tin', path: ['ben-bach-dang.blankets', at('ben-bach-dang.blankets', -6, 0, 3)], pace: 'sneak' },
      { k: 'card', kind: 'title', text: '@c7m3.cs.daCuu', t: 0.8 }, { k: 'letterbox', on: false, t: 2.6 }],
      note: 'Tín backs into the dark under the trees while every eye is on Vân' },
  ],
  handoff: { player: { at: 'ben-bach-dang.blankets', vehicle: 'foot' }, camera: 'blend', ms: 400 },
};

export const CUTSCENES: Scene[] = [ao, van, cs07, nhay, ben, luc];
