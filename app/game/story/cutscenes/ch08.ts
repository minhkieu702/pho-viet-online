import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Mark, Scene } from '../scene.ts';

/**
 * Chapter 8 cutscenes as data (schema and conventions: story/scene.ts). Lines are '@keys' of text/vi/ch08.ts; 'set:<space>.<anchor>'
 * marks are the off-map anchors declared in content/ch08.ts ANCHORS (hospital-ward also uses chapter 4's, co-ba-ground chapter 5's).
 * The numbered scene is CS08 "Giá của im lặng" (story-final.md, 60 s), played in three parts around the choice so each stays a short
 * in-engine scene: the catwalk (cs08_gia_cua_im_lang), the private box and Phượng's story (…_lo, it ends frozen on the envelope while
 * the choice panel is up) and the answer (…_dung, Phượng's reply reads the choice: 'choice:phongBi'). The other scenes are the short
 * in-mission beats of the bible's c8 cutscene notes: the door on its chain, Diễm's confession and the doorbell, the shoes on the ward,
 * Diễm in bed 3, under Bảo's desk, the gondola and the morning TV.
 * Safety: nobody is struck on screen (the stair fights, the takedowns and the tackle are gameplay); the silencer is threaded, never aimed;
 * Mai never appears, only her hairclip; Su only in a photo.
 */

const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; if?: Cond; t?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });
const PM = (a: string) => `set:phu-my.${a}`;
const HW = (a: string) => `set:hospital-ward.${a}`;
const NH = (a: string) => `set:nha-hat-gala.${a}`;
const BK = (a: string) => `set:bank-floor20.${a}`;
const CB = (a: string) => `set:co-ba-ground.${a}`;
const chose = (option: string): Cond => ({ k: 'flag', name: 'choice:phongBi', eq: option });

// ---- c8-m1 · the door of 1204 on its chain (19 s) -------------------------------------------------------------------
const cua: Scene = {
  id: 'c8m1-cua', mission: 'c8-m1', title: '@c8m1.cs.cua', kind: 'cutscene', seconds: 19, skippable: true,
  stage: { at: 'phu-my', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 21.6, weather: 'clear', freezeClock: true } },
  sets: ['phu-my'],
  cast: { tin: 'tin', diem: 'diem' },
  shots: [
    { dur: 4, label: 'go-cua', cam: { k: 'shot', eye: at(PM('door1204'), 1.4, 1.5, 2.2), look: PM('door1204'), fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'place', who: 'tin', at: at(PM('door1204'), 0, 0, 0.7), pose: 'stand' }, { k: 'sfx', id: 'knock', t: 0.3 }, say('tin', 'c8m1.cs.cua1', { t: 0.8 })],
      note: 'Tín in the orange jacket at 1204, the corridor empty behind him' },
    { dur: 5, label: 'day-xich', cam: { k: 'shot', eye: at(PM('door1204'), 0.3, 1.55, 0.9), look: 'diem.head', fov: 32 }, cues: [
      { k: 'place', who: 'diem', at: at(PM('door1204'), 0, 0, -0.6), pose: 'stand' }, { k: 'sfx', id: 'door-chain', t: 0.2 },
      { k: 'expr', who: 'diem', e: 'worried' }, say('diem', 'c8m1.cs.cua2', { t: 0.8 })],
      note: 'the door opens a hand-width on its chain: mascara-streaked face, sweatpants, the pink phone in her fist' },
    { dur: 6, label: 'anh-cua-mai', cam: { k: 'shot', eye: at('tin.head', 0.2, 0, 0.8), look: 'tin.head', fov: 30 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c8m1.cs.cua3', { t: 0.5 })] },
    { dur: 4, label: 'mo-xich', cam: { k: 'shot', eye: at('diem.head', 0, 0, 0.9), look: 'diem.head', fov: 28 }, cues: [
      { k: 'expr', who: 'diem', e: 'shock' }, { k: 'sfx', id: 'door-chain', t: 1 }, say('diem', 'c8m1.cs.cua4', { t: 1.3 }), { k: 'letterbox', on: false, t: 3.6 }],
      note: 'a long look; the chain slides off' },
  ],
  handoff: { player: { at: PM('apartment'), vehicle: 'foot', space: 'phu-my' }, camera: 'cut' },
};

// ---- c8-m1 · "Chị cũng từng là con Mai" (31 s) ------------------------------------------------------------------------
const loiKhai: Scene = {
  id: 'c8m1-loi-khai', mission: 'c8-m1', title: '@c8m1.cs.loiKhai', kind: 'cutscene', seconds: 31, skippable: true,
  stage: { at: 'phu-my', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 21.8, weather: 'clear', freezeClock: true } },
  sets: ['phu-my'],
  cast: { tin: 'tin', diem: 'diem' },
  shots: [
    { dur: 6, label: 'vali', cam: { k: 'shot', eye: at(PM('suitcase'), 2.2, 1.4, 2.4), look: PM('suitcase'), fov: 42 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'music', id: 'theme-loss', fade: 2 },
      { k: 'prop', id: 'vali', kind: 'suitcase', at: PM('suitcase') },
      { k: 'place', who: 'diem', at: PM('suitcase'), pose: 'sit' }, { k: 'place', who: 'tin', at: at(PM('suitcase'), 1.4, 0, 1.2), pose: 'stand' },
      { k: 'prop', id: 'khung', kind: 'photo-frame', attach: 'diem.handR', text: '@ev.beSu.t' }, { k: 'anim', who: 'diem', clip: 'hold-frame' },
      say('diem', 'c8m1.cs.lk1', { t: 0.6 })],
      note: 'a messy room, the open suitcase; she holds the framed photo of a gap-toothed girl of eight' },
    { dur: 5, label: 'y-nhu-mai', cam: { k: 'insert', target: 'prop:khung', fov: 24, dist: 0.5 }, cues: [
      say('diem', 'c8m1.cs.lk2', { t: 0.2 }), say('diem', 'c8m1.cs.lk3', { t: 2.6 })] },
    { dur: 7, label: 'be-su', cam: { k: 'move', from: at('diem.head', 0.25, 0, 1.1), to: at('diem.head', 0.15, 0, 0.75), look: 'diem.head', fov: 30, ease: 'inOutSine' }, cues: [
      { k: 'expr', who: 'diem', e: 'cry' }, say('diem', 'c8m1.cs.lk4', { t: 2.6 })] },
    { dur: 5, label: 'con-mai', cam: { k: 'shot', eye: at('diem.head', 0.1, 0, 0.55), look: 'diem.head', fov: 22 }, cues: [say('diem', 'c8m1.cs.lk5', { t: 2 })],
      note: 'through tears; she does not look at him' },
    { dur: 8, label: 'di-tim', cam: { k: 'twoShot', a: 'tin', b: 'diem', fov: 36 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c8m1.cs.lk6', { t: 0.6 }), { k: 'look', who: 'diem', at: 'tin.head', t: 3.4 },
      say('tin', 'c8m1.cs.lk7', { t: 5.4 }), { k: 'letterbox', on: false, t: 7.6 }],
      note: 'he crouches to her eye level, the 2014 missing-person file from Ông Tư\'s box in his hand; for the first time she looks at him' },
  ],
  handoff: { player: { at: PM('apartment'), vehicle: 'foot', space: 'phu-my' }, camera: 'blend', ms: 500 },
};

// ---- c8-m1 · the two ledgers, the doorbell, the peephole (20 s) ---------------------------------------------------------
const chuong: Scene = {
  id: 'c8m1-chuong-cua', mission: 'c8-m1', title: '@c8m1.cs.chuong', kind: 'cutscene', seconds: 20, skippable: true,
  stage: { at: 'phu-my', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 21.9, weather: 'clear', freezeClock: true } },
  sets: ['phu-my'],
  cast: { tin: 'tin', diem: 'diem', st1: 'sat-thu', st2: 'sat-thu', st3: 'sat-thu' },
  shots: [
    { dur: 7, label: 'hai-cuon-so', cam: { k: 'twoShot', a: 'diem', b: 'tin', fov: 38 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'music', id: null, fade: 1 },
      { k: 'place', who: 'diem', at: PM('suitcase'), pose: 'sit' }, { k: 'place', who: 'tin', at: at(PM('suitcase'), 1.2, 0, 1), pose: 'crouch' },
      say('diem', 'c8m1.cs.ch1', { t: 0.4 }), say('diem', 'c8m1.cs.ch2', { t: 4.6 })],
      note: 'she wipes her face with the back of her hand and tells it straight: the black ledger and the master ledger are not the same book' },
    { dur: 4, label: 'chuong', cam: { k: 'shot', eye: at(PM('apartment'), 2.6, 1.7, 2.6), look: PM('door1204'), fov: 50 }, cues: [
      { k: 'sfx', id: 'doorbell', t: 0.3 }, { k: 'expr', who: 'diem', e: 'shock', t: 0.5 }, { k: 'expr', who: 'tin', e: 'shock', t: 0.6 }],
      note: 'the doorbell; both freeze' },
    { dur: 5, label: 'mat-than', cam: { k: 'shot', eye: at(PM('door1204'), 0, 1.6, -0.1), look: at(PM('door1204'), 0, 1.5, 2.2), fov: 70 }, cues: [
      { k: 'place', who: 'tin', at: at(PM('door1204'), 0, 0, -0.4), pose: 'stand' }, { k: 'anim', who: 'tin', clip: 'peek-peephole' },
      { k: 'place', who: 'st1', at: at(PM('door1204'), -0.6, 0, 1.4), pose: 'stand' }, { k: 'place', who: 'st2', at: at(PM('door1204'), 0.5, 0, 1.6), pose: 'stand' },
      { k: 'place', who: 'st3', at: at(PM('door1204'), 0, 0, 2.3), pose: 'stand' }, { k: 'anim', who: 'st2', clip: 'screw-silencer', t: 0.8 }],
      note: 'POV through the peephole, fish-eye: three men in the corridor, one threading a silencer onto a pistol, never raised' },
    { dur: 4, label: 'cua-sau', cam: { k: 'shot', eye: at('tin.head', 0.25, 0, 0.6), look: 'tin.head', fov: 28 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c8m1.cs.ch3', { t: 0.4 }), { k: 'letterbox', on: false, t: 3.6 }],
      note: 'a whisper, turning from the door' },
  ],
  handoff: { player: { at: PM('apartment'), vehicle: 'foot', space: 'phu-my' }, camera: 'cut' },
};

// ---- c8-m2 · shoes along the ward corridor (16 s) -----------------------------------------------------------------------
const giay: Scene = {
  id: 'c8m2-giay', mission: 'c8-m2', title: '@c8m2.cs.giay', kind: 'cutscene', seconds: 16, skippable: true,
  stage: { at: 'benh-vien', radius: 20, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 12.3, weather: 'cloudy', freezeClock: true } },
  sets: ['hospital-ward'],
  cast: { tin: 'tin', hl1: 'ho-ly', hl2: 'ho-ly', gia: 'gia-ho-ly', vis: 'tpl:resident' },
  shots: [
    { dur: 5, label: 'dep', cam: { k: 'move', from: at(HW('corridor'), -6, 0.25, 0.8), to: at(HW('corridor'), -2, 0.25, 0.8), look: [at(HW('corridor'), -4, 0.1, 0), at(HW('corridor'), 0, 0.1, 0)], fov: 50, ease: 'linear' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' },
      { k: 'place', who: 'vis', at: at(HW('corridor'), -5, 0, 0), pose: 'walk' }, { k: 'place', who: 'hl1', at: at(HW('corridor'), -3.5, 0, 0.3), pose: 'stand' },
      { k: 'place', who: 'hl2', at: at(HW('corridor'), -2, 0, -0.3), pose: 'walk' }, say('tin', 'c8m2.cs.giay1', { ch: 'inner', t: 1 })],
      note: 'low camera along the floor past feet: a visitor\'s sneakers, an orderly\'s clogs, clogs' },
    { dur: 4, label: 'giay-da', cam: { k: 'shot', eye: at(HW('corridor'), 0.4, 0.25, 1), look: { at: 'gia', off: [0, 0.1, 0] }, fov: 40 }, cues: [
      { k: 'place', who: 'gia', at: HW('corridor'), pose: 'stand' }, { k: 'prop', id: 'bang-ca', kind: 'gurney', at: at(HW('corridor'), 0.8, 0, 0) },
      say('tin', 'c8m2.cs.giay2', { ch: 'inner', t: 0.6 })],
      note: 'polished leather shoes under orderly scrubs, beside an empty gurney' },
    { dur: 4, label: 'co-tay', cam: { k: 'insert', target: 'gia.handR', fov: 22, dist: 0.4 }, cues: [
      { k: 'prop', id: 'khay', kind: 'medical-tray', attach: 'gia.handR' }, say('tin', 'c8m2.cs.giay3', { ch: 'inner', t: 0.5 })],
      note: 'the camera tilts up to a snake tattoo on the wrist holding a tray' },
    { dur: 3, label: 'mat-tin', cam: { k: 'insert', target: 'tin.head', fov: 18, dist: 0.35 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, { k: 'letterbox', on: false, t: 2.6 }], note: 'close on Tín\'s eyes' },
  ],
  handoff: { player: { at: HW('corridor'), vehicle: 'foot', space: 'hospital-ward' }, camera: 'blend', ms: 500 },
};

// ---- c8-m2 · bed 3: the gala and Su (28 s) ----------------------------------------------------------------------------
const diem: Scene = {
  id: 'c8m2-diem', mission: 'c8-m2', title: '@c8m2.cs.diem', kind: 'cutscene', seconds: 28, skippable: true,
  stage: { at: 'benh-vien', radius: 20, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 12.6, weather: 'cloudy', freezeClock: true } },
  sets: ['hospital-ward'],
  cast: { tin: 'tin', diem: 'diem' },
  shots: [
    { dur: 5, label: 'giuong', cam: { k: 'shot', eye: at(HW('bay3'), 1.8, 1.5, 2), look: HW('bay3'), fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' },
      { k: 'place', who: 'diem', at: HW('bay3'), pose: 'sit' }, { k: 'place', who: 'tin', at: HW('bay3Stool'), pose: 'sit-stool' },
      { k: 'prop', id: 'cam', kind: 'oranges', at: at(HW('bay3'), 0.6, 0.8, 0.4) }, say('diem', 'c8m2.cs.d1', { t: 0.8 })],
      note: 'the bed Tín woke up in a week ago; the bag of oranges on the locker; Lộc\'s officer back in his chair outside the glass' },
    { dur: 6, label: 'da-tiec', cam: { k: 'ots', speaker: 'diem', listener: 'tin', side: 'right', fov: 34 }, cues: [say('diem', 'c8m2.cs.d2', { t: 0.3 })] },
    { dur: 5, label: 'so', cam: { k: 'shot', eye: at('diem.head', 0.2, 0, 0.9), look: 'diem.head', fov: 30 }, cues: [say('diem', 'c8m2.cs.d3', { t: 0.2 })] },
    { dur: 6, label: 'xin-loi', cam: { k: 'shot', eye: at('diem.head', 0.1, 0, 0.6), look: 'diem.head', fov: 22 }, cues: [
      { k: 'expr', who: 'diem', e: 'cry' }, say('diem', 'c8m2.cs.d4', { t: 0.6 })] },
    { dur: 6, label: 'hua', cam: { k: 'shot', eye: at('tin.head', 0.2, 0, 0.8), look: 'tin.head', fov: 30 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c8m2.cs.d5', { t: 0.4 }), { k: 'letterbox', on: false, t: 5.6 }] },
  ],
  handoff: { player: { at: HW('bay3Door'), vehicle: 'foot', space: 'hospital-ward' }, camera: 'blend', ms: 500 },
};

// ---- CS08 · Giá của im lặng, part 1: from the catwalk (31 s) -------------------------------------------------------------
const cs08: Scene = {
  id: 'cs08_gia_cua_im_lang', mission: 'c8-m3', title: '@cs08.title', kind: 'cutscene', seconds: 31, skippable: true,
  stage: { at: 'nha-hat', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 21.2, weather: 'clear', freezeClock: true } },
  sets: ['nha-hat-gala'],
  cast: {
    tin: 'tin', phuong: 'phuong', bao: 'bao', vs1: 've-si-tiec', vs2: 've-si-tiec',
    doan: { template: 'cai-luong', count: 5, area: NH('stage'), size: [8, 4], poses: ['stand'] },
  },
  shots: [
    { dur: 5, label: 'san-khau', cam: { k: 'shot', eye: at(NH('catwalkOverBox'), 0, 0.4, 0), look: NH('stage'), fov: 70 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'sfx', id: 'cai-luong-live' },
      { k: 'place', who: 'tin', at: NH('catwalkOverBox'), pose: 'crouch' }],
      note: 'top-down from the lighting catwalk over the cải lương stage, then a slow pan to the private box; the drum is clearly heard' },
    { dur: 8, label: 'usb', cam: { k: 'shot', eye: at(NH('catwalkOverBox'), 0, 0.1, 0), look: NH('box'), fov: 28 }, cues: [
      { k: 'place', who: 'phuong', at: NH('box'), pose: 'sit-chair' }, { k: 'place', who: 'bao', at: at(NH('box'), 0.9, 0, 0.3), pose: 'sit-chair' },
      { k: 'prop', id: 'usb', kind: 'usb-drive', attach: 'bao.handR' }, say('bao', 'cs08.bao1', { t: 0.5 }), { k: 'pair', clip: 'handover', a: 'bao', b: 'phuong', t: 1.5 },
      say('phuong', 'cs08.ph1', { t: 4.2 })],
      note: 'through the catwalk grille: Bảo, sweating, hands Phượng a USB drive' },
    { dur: 7, label: 'tau', cam: { k: 'move', from: at(NH('catwalkOverBox'), 0, 0.1, 0), to: at(NH('catwalkOverBox'), 0, -0.2, 0.3), look: 'phuong.head', fov: [28, 24] }, cues: [
      say('phuong', 'cs08.ph2', { t: 0.4 }), say('phuong', 'cs08.ph3', { t: 4.5 })] },
    { dur: 6, label: 'tren-dau', cam: { k: 'shot', eye: at(NH('catwalkOverBox'), 0, 0, 0.3), look: 'phuong.head', fov: 24 }, cues: [
      { k: 'anim', who: 'phuong', clip: 'sip-tea' }, say('phuong', 'cs08.ph4', { t: 0.8 }), say('phuong', 'cs08.ph5', { t: 4 })],
      note: 'she does not look up' },
    { dur: 5, label: 'moi-em', cam: { k: 'shot', eye: at('tin.head', 0.3, 0.1, 0.9), look: 'tin.head', fov: 40 }, cues: [
      { k: 'expr', who: 'tin', e: 'shock' },
      { k: 'place', who: 'vs1', at: at(NH('catwalkOverBox'), -1.2, 0, -0.8), pose: 'stand' }, { k: 'place', who: 'vs2', at: at(NH('catwalkOverBox'), -1.8, 0, -1.2), pose: 'stand' },
      say('vs1', 'cs08.vs1', { t: 1.4 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'two bodyguards\' polished shoes step onto the catwalk behind him' },
  ],
  handoff: { player: { at: NH('boxDoor'), vehicle: 'foot', space: 'nha-hat-gala' }, camera: 'cut' },
};

// ---- CS08 part 2: the private box, the offer, "Tôi chọn làm người mua" (33 s; ends frozen on the envelope) -------------
const cs08Lo: Scene = {
  id: 'cs08_gia_cua_im_lang_lo', mission: 'c8-m3', title: '@cs08.lo', kind: 'cutscene', seconds: 33, skippable: true,
  stage: { at: 'nha-hat', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 21.3, weather: 'clear', freezeClock: true } },
  sets: ['nha-hat-gala'],
  cast: { tin: 'tin', phuong: 'phuong', vs1: 've-si-tiec' },
  shots: [
    { dur: 5, label: 'lo', cam: { k: 'shot', eye: at(NH('box'), 2.4, 1.5, 2.2), look: NH('box'), fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'neon' }, { k: 'sfx', id: 'cai-luong-live' },
      { k: 'place', who: 'phuong', at: NH('box'), pose: 'sit-chair' }, { k: 'place', who: 'tin', at: at(NH('box'), 1.2, 0, 0.9), pose: 'sit-chair' },
      { k: 'place', who: 'vs1', at: at(NH('box'), -1.4, 0, 1.6), pose: 'stand' },
      { k: 'prop', id: 'am-tra', kind: 'tea-set', at: at(NH('box'), 0.6, 0.45, 0.4), variant: 'pouring' },
      { k: 'prop', id: 'phong-bi', kind: 'envelope', at: at(NH('box'), 0.7, 0.45, 0.5) },
      { k: 'prop', id: 'giay', kind: 'sign', variant: 'document', at: at(NH('box'), 0.5, 0.45, 0.55), text: '@cs08.giay' },
      { k: 'anim', who: 'phuong', clip: 'slide-envelope', t: 0.4 }, say('phuong', 'cs08.ph6', { t: 0.8 })],
      note: 'stage light bleeds red through the curtain; she pours tea and slides an envelope and a stamped paper across the table' },
    { dur: 6, label: 'phong-bi', cam: { k: 'insert', target: 'prop:phong-bi', fov: 24, dist: 0.5 }, cues: [
      say('phuong', 'cs08.ph7', { t: 0.3 }), say('phuong', 'cs08.ph8', { t: 4.6 })] },
    { dur: 11, label: 'muoi-bon', cam: { k: 'move', from: at('phuong.head', 0.3, 0, 1.3), to: at('phuong.head', 0.15, 0, 0.8), look: 'phuong.head', fov: 28, ease: 'inOutSine' }, cues: [
      say('phuong', 'cs08.ph9', { t: 1.2 }), say('phuong', 'cs08.ph10', { t: 6.2 })],
      note: 'evenly, never blinking; for once she says "tôi"' },
    { dur: 8, label: 'nguoi-mua', cam: { k: 'shot', eye: at('phuong.head', 0.08, 0, 0.5), look: 'phuong.head', fov: 20 }, cues: [say('phuong', 'cs08.ph11', { t: 1 })] },
    { dur: 3, label: 'ban', cam: { k: 'insert', target: 'prop:phong-bi', fov: 35, dist: 1.2 }, cues: [],
      note: 'freeze on the table: the choice panel opens over this frame' },
  ],
  handoff: { player: { at: NH('box'), vehicle: 'foot', space: 'nha-hat-gala' }, camera: 'cut' },
};

// ---- CS08 part 3: the answer, the stand, the hairclip (29 s) ---------------------------------------------------------
const cs08Dung: Scene = {
  id: 'cs08_gia_cua_im_lang_dung', mission: 'c8-m3', title: '@cs08b.title', kind: 'cutscene', seconds: 29, skippable: true,
  stage: { at: 'nha-hat', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 21.35, weather: 'clear', freezeClock: true } },
  sets: ['nha-hat-gala'],
  cast: { tin: 'tin', phuong: 'phuong', thuKy: 'thu-ky-phuong' },
  shots: [
    { dur: 6, label: 'tra-loi', cam: { k: 'shot', eye: at('phuong.head', 0.2, 0, 0.9), look: 'phuong.head', fov: 30 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'neon' },
      { k: 'place', who: 'phuong', at: NH('box'), pose: 'sit-chair' }, { k: 'place', who: 'tin', at: at(NH('box'), 1.2, 0, 0.9), pose: 'sit-chair' },
      { k: 'prop', id: 'am-tra', kind: 'tea-set', at: at(NH('box'), 0.6, 0.45, 0.4) },
      { k: 'prop', id: 'phong-bi', kind: 'envelope', attach: 'tin.handL', if: chose('cam') },
      { k: 'prop', id: 'phong-bi', kind: 'envelope', at: at(NH('box'), 0.7, 0.45, 0.5), if: { k: 'not', c: chose('cam') } },
      { k: 'expr', who: 'phuong', e: 'cold-smile' },
      say('phuong', 'cs08b.cam', { t: 0.4, if: chose('cam') }), say('phuong', 'cs08b.day', { t: 0.4, if: chose('day') }), say('phuong', 'cs08b.im', { t: 0.4, if: chose('im') })],
      note: 'her answer reads his: the envelope in his hand (he keeps it; chapter 9 burns it), pushed back with two fingers, or left where it lay' },
    { dur: 6, label: 'dung-day', cam: { k: 'shot', eye: at('tin', 0.6, 0.5, 1.6), look: 'tin.head', fov: 45 }, cues: [
      { k: 'place', who: 'tin', at: at(NH('box'), 1.2, 0, 0.9), pose: 'stand', t: 0.2 }, say('tin', 'cs08b.tin1', { t: 0.4 })],
      note: 'low angle as he stands; Ông Tư\'s whistle catches the red light' },
    { dur: 5, label: 'lam-bun', cam: { k: 'shot', eye: at('tin.head', 0.2, 0, 0.7), look: 'tin.head', fov: 28 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'cs08b.tin2', { t: 0.3 })] },
    { dur: 6, label: 'mot-dem', cam: { k: 'shot', eye: at('phuong.head', 0.15, 0, 0.7), look: 'phuong.head', fov: 30 }, cues: [say('phuong', 'cs08b.ph1', { t: 0.6 })],
      note: 'a faint smile' },
    { dur: 6, label: 'kep-toc', cam: { k: 'insert', target: 'prop:kep-toc', fov: 22, dist: 0.45 }, cues: [
      { k: 'place', who: 'thuKy', at: NH('secretaryDesk'), pose: 'sit-chair' },
      { k: 'prop', id: 'chuong-trinh', kind: 'sign', variant: 'programme', at: at(NH('secretaryDesk'), 0, 0.78, 0), text: '@cs08b.chuongTrinh' },
      { k: 'prop', id: 'kep-toc', kind: 'lotus-hairclip', at: at(NH('secretaryDesk'), 0.05, 0.8, 0) }, { k: 'music', id: 'theme-loss', fade: 1, t: 0.5 },
      { k: 'letterbox', on: false, t: 5.6 }],
      note: 'on the secretary\'s desk as he passes: Mai\'s lotus-shaped hairclip on a folded gala programme. His hand freezes beside it, then closes round it' },
  ],
  handoff: { player: { at: NH('boxDoor'), vehicle: 'foot', space: 'nha-hat-gala' }, camera: 'blend', ms: 500 },
};

// ---- c8-m4 · under Bảo's desk (24 s) ------------------------------------------------------------------------------------
const gamBan: Scene = {
  id: 'c8m4-gam-ban', mission: 'c8-m4', title: '@c8m4.cs.gamBan', kind: 'cutscene', seconds: 24, skippable: true,
  stage: { at: 'ngan-hang', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 2.5, weather: 'clear', freezeClock: true } },
  sets: ['bank-floor20'],
  cast: { tin: 'tin', bao: 'bao' },
  shots: [
    { dur: 4, label: 'giay-da', cam: { k: 'shot', eye: at(BK('bossDesk'), 0, 0.35, 0.2), look: at(BK('bossDesk'), 1.6, 0.15, 1.4), fov: 62 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'place', who: 'tin', at: BK('bossDesk'), pose: 'crouch' }, { k: 'place', who: 'bao', at: at(BK('bossDesk'), 2.2, 0, 1.6), pose: 'walk' },
      { k: 'sfx', id: 'footsteps-leather', t: 0.3 }, { k: 'walk', who: 'bao', path: [at(BK('bossDesk'), 1.2, 0, 1.4), at(BK('bossDesk'), 2.4, 0, 0.8)], pace: 'walk', t: 0.5 }],
      note: 'low POV from under the desk: Bảo\'s leather shoes pace the carpet' },
    { dur: 6, label: 'goi', cam: { k: 'shot', eye: at(BK('bossDesk'), 0, 0.35, 0.2), look: at(BK('bossDesk'), 2, 0.4, 1.2), fov: 55 }, cues: [
      { k: 'anim', who: 'bao', clip: 'phone-to-ear' }, say('bao', 'c8m4.cs.bao1', { ch: 'phone', t: 0.4 }), say('bao', 'c8m4.cs.bao2', { ch: 'phone', t: 4.2 })] },
    { dur: 6, label: 'nin', cam: { k: 'shot', eye: at('tin.head', 0.25, 0, 0.6), look: 'tin.head', fov: 26 }, cues: [
      { k: 'anim', who: 'tin', clip: 'cover-mouth' }, { k: 'prop', id: 'so-chi', kind: 'black-ledger', attach: 'tin.handL' }, { k: 'sfx', id: 'heartbeat', t: 0.5 },
      say('bao', 'c8m4.cs.bao3', { ch: 'phone', t: 1.4 })],
      note: 'Tín holds his breath, one hand over his mouth, the black ledger gripped in the other' },
    { dur: 5, label: 'mat', cam: { k: 'insert', target: 'tin.head', fov: 18, dist: 0.3 }, cues: [
      { k: 'expr', who: 'tin', e: 'angry' }, say('bao', 'c8m4.cs.bao4', { ch: 'phone', t: 1.2 })], note: 'the old man he is said to have killed' },
    { dur: 3, label: 'quay-di', cam: { k: 'shot', eye: at(BK('bossDesk'), 0, 0.35, 0.2), look: at(BK('bossDesk'), -1.2, 0.2, 2), fov: 60 }, cues: [
      { k: 'walk', who: 'bao', path: [at(BK('bossDesk'), -1.5, 0, 2.2)], pace: 'walk' }, { k: 'letterbox', on: false, t: 2.6 }],
      note: 'the shoes turn toward the safe' },
  ],
  handoff: { player: { at: BK('bossDesk'), vehicle: 'foot', crouch: true, space: 'bank-floor20' }, camera: 'blend', ms: 400 },
};

// ---- c8-m4 · twenty floors of glass (16 s) --------------------------------------------------------------------------------
const gondola: Scene = {
  id: 'c8m4-gondola', mission: 'c8-m4', title: '@c8m4.cs.gondola', kind: 'cutscene', seconds: 16, skippable: true,
  stage: { at: 'ngan-hang', radius: 60, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 2.6, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin' },
  shots: [
    { dur: 5, label: 'buoc-ra', cam: { k: 'shot', eye: at('ngan-hang.gondola', -3.5, 1.2, 2.5), look: 'ngan-hang.gondola', fov: 50 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'sfx', id: 'wind-howl' },
      { k: 'prop', id: 'gian', kind: 'gondola', at: 'ngan-hang.gondola' }, { k: 'place', who: 'tin', at: 'ngan-hang.gondola', pose: 'crouch' }],
      note: 'Tín steps out of the window hatch onto the cradle; the cable sways' },
    { dur: 7, label: 'keo-lui', cam: { k: 'move', from: at('ngan-hang.gondola', -4, 1, 2), to: at('ngan-hang.gondola', -55, 18, 38), look: 'ngan-hang.gondola', fov: [45, 62], ease: 'inOutSine' }, cues: [
      say('tin', 'c8m4.cs.g1', { ch: 'inner', t: 1 })],
      note: 'the camera pulls back from the 88 m glass face: Quận 1 glittering below, THÁP PHƯƠNG NAM\'s crown, the wind' },
    { dur: 4, label: 'den-pin', cam: { k: 'shot', eye: at('ngan-hang.gondola', -1.5, 0.6, 1.2), look: at('ngan-hang.gondola', 0, 2.4, 0), fov: 40 }, cues: [
      { k: 'fx', kind: 'torch-sweep', at: at('ngan-hang.gondola', 0, 2.4, 0.3) }, { k: 'expr', who: 'tin', e: 'shock' }, { k: 'letterbox', on: false, t: 3.6 }],
      note: 'on floor 20 a torch sweeps the glass just above his head' },
  ],
  handoff: { player: { at: 'ngan-hang.gondola', vehicle: 'foot', crouch: true }, camera: 'blend', ms: 400 },
};

// ---- c8-m4 · the morning TV at Cô Ba's (28 s) -------------------------------------------------------------------------
const tivi: Scene = {
  id: 'c8m4-tivi', mission: 'c8-m4', title: '@c8m4.cs.tivi', kind: 'cutscene', seconds: 28, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 20, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 7, weather: 'rain', freezeClock: true } },
  sets: ['co-ba-ground'],
  cast: {
    coba: 'coba', tin: 'tin', khach: 'khach-quan', mc: 'mc-sang',
    quan: { template: 'resident', count: 4, area: CB('tables'), size: [4, 3], poses: ['sit-stool'] },
  },
  shots: [
    { dur: 5, label: 'tivi', cam: { k: 'shot', eye: at(CB('tables'), 1.5, 1.4, 2.5), look: CB('tv'), fov: 50 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'fx', kind: 'awning-drip' },
      { k: 'prop', id: 'tv', kind: 'tv-news', at: CB('tv'), lines: ['@c8m4.cs.tvTitle', '@c8m4.cs.tvSub'] },
      { k: 'place', who: 'coba', at: CB('counter'), pose: 'stand' }, { k: 'place', who: 'khach', at: CB('tables'), pose: 'sit-stool' },
      say('mc', 'c8m4.cs.tv1', { ch: 'tv', t: 0.6 })],
      note: 'rain off the awning; the morning regulars on their stools, the TV on its bracket' },
    { dur: 6, label: 'mat-tin', cam: { k: 'insert', target: 'prop:tv', fov: 30, dist: 1.2 }, cues: [say('mc', 'c8m4.cs.tv2', { ch: 'tv', t: 0.6 })],
      note: 'TRUY NÃ ĐẶC BIỆT: Tín\'s student ID photo fills the screen' },
    { dur: 5, label: 'nhin-nhau', cam: { k: 'shot', eye: at(CB('tables'), -1.5, 1.3, 1.5), look: 'khach.head', fov: 40 }, cues: [say('khach', 'c8m4.cs.k1', { t: 1.2 })],
      note: 'customers look at each other' },
    { dur: 5, label: 'tat-tivi', cam: { k: 'shot', eye: at('coba.head', 0.6, 0.1, 1.4), look: 'coba.head', fov: 36 }, cues: [
      { k: 'anim', who: 'coba', clip: 'switch-off-tv', t: 0.3 }, { k: 'sfx', id: 'tv-off', t: 1 }, { k: 'prop', id: 'tv', kind: 'tv-news', remove: true, t: 1.1 },
      say('coba', 'c8m4.cs.coba1', { t: 1.6 })],
      note: 'Cô Ba reaches up and switches the TV off without a word to anyone' },
    { dur: 7, label: 'cua-cuon', cam: { k: 'shot', eye: at(CB('kitchen'), 0.5, 2.2, 0.5), look: CB('shutter'), fov: 45 }, cues: [
      { k: 'place', who: 'tin', at: at(CB('kitchen'), 0.4, 1.2, 0.2), pose: 'stand' }, { k: 'anim', who: 'coba', clip: 'pull-shutter', t: 0.6 }, { k: 'sfx', id: 'shutter-wood', t: 1.2 },
      say('tin', 'c8m4.cs.tin1', { ch: 'inner', t: 1.6 }), { k: 'letterbox', on: false, t: 6.6 }],
      note: 'from the dark of the inside stairs, Tín watches her pull the shutter halfway down' },
  ],
  handoff: { player: { at: CB('kitchen'), vehicle: 'foot', space: 'co-ba-ground' }, camera: 'cut' },
};

export const CUTSCENES: Scene[] = [cua, loiKhai, chuong, giay, diem, cs08, cs08Lo, cs08Dung, gamBan, gondola, tivi];
