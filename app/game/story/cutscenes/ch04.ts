import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Mark, Scene } from '../scene.ts';

/**
 * Chapter 4 cutscenes as data (schema in story/scene.ts). CS04 "Anh Hai" is played in two halves, as the bible
 * scripts it ("[CS04 cont.] triggered mid-chase"): 'cs04_anh_hai' in the attic (the title reads 04:20; he stares at
 * the photos for half an hour, then the ledger line and Má's split-screen call at 04:51, out of the door at 04:58; sets attic and village) and 'cs04_anh_hai_xe' at the Nguyễn Huệ junction (the slow-motion
 * look through the rear window, Cường's smile, the T-bone). Together they cover story-decisions.md §3's sites and
 * sets for cs04 (the chase route itself is the gameplay between them). The crash cuts on the flash: no blood, no
 * impact frame on a body, Tín is thrown and lies still. Mai is seen only seated behind the glass or walking to the
 * van of her own will; nobody touches her.
 * The rides 'van-mai' and 'dream' take over the mission's story van and the player's bike for the scene (a ride
 * whose id names a live story vehicle moves that vehicle instead of spawning a copy: director request).
 */

const H = Math.PI / 2;
const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; t?: number; if?: Cond } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });
const office = (anchor: string) => `set:anh-duong-office.${anchor}`;
const ward = (anchor: string) => `set:hospital-ward.${anchor}`;
const J = 'nga-tu-216-54';

// ---- c4-m1 · the call through the door gap (27.5 s) ------------------------------------------------------------
const diemGoi: Scene = {
  id: 'c4m1-diem-goi', mission: 'c4-m1', title: '@c4m1.cs.diemGoi', kind: 'cutscene', seconds: 27.5, skippable: true,
  stage: { at: 'anh-duong', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 11.8, weather: 'clear', freezeClock: true } },
  sets: ['anh-duong-office'],
  cast: { tin: 'tin', diem: 'diem', thuKy: 'thu-ky' },
  shots: [
    { dur: 4, label: 'khe-cua', cam: { k: 'shot', eye: at(office('cooler'), 0.3, 1.55, 0), look: office('backOffice'), fov: 30 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'music', id: 'tension' },
      { k: 'place', who: 'tin', at: office('cooler'), pose: 'stand' }, { k: 'place', who: 'thuKy', at: office('desk'), pose: 'sit-chair' },
      { k: 'place', who: 'diem', at: office('backOffice'), pose: 'stand' }, { k: 'anim', who: 'diem', clip: 'talk-phone', loop: true },
      say('diem', 'c4m1.cs.d1', { ch: 'overheard', t: 0.5 })],
      note: 'POV from the water cooler through the half-open back-office door: Diễm pacing by the window, the pink phone with its charms at her ear' },
    { dur: 5, label: 'cay-but', cam: { k: 'shot', eye: at('diem.head', 0.5, 0.05, 1.1), look: 'diem.head', fov: 34 }, cues: [
      { k: 'prop', id: 'but', kind: 'pen', attach: 'diem.handR' }, { k: 'anim', who: 'diem', clip: 'twirl-pen', loop: true }, { k: 'expr', who: 'diem', e: 'smile' },
      say('diem', 'c4m1.cs.d2', { ch: 'overheard', t: 0.3 })],
      note: 'her voice as sweet as sugarcane; the pen turns between her fingers' },
    { dur: 4, label: 'to-roi', cam: { k: 'insert', target: office('clipboard'), fov: 24, dist: 0.6 }, cues: [
      { k: 'prop', id: 'kep-giay', kind: 'sign', variant: 'clipboard', at: office('clipboard'), text: '@c4m1.cs.loSheet' },
      say('diem', 'c4m1.cs.d3', { ch: 'overheard', t: 0.4 })],
      note: 'her free hand taps the clipboard: the loose sheet the player will photograph' },
    { dur: 5, label: 'tu-nguyen', cam: { k: 'shot', eye: at('diem.head', -0.6, 0.1, 1.4), look: 'diem.head', fov: 38 }, cues: [
      { k: 'look', who: 'diem', at: at(office('backOffice'), 0, 1.5, -3) }, say('diem', 'c4m1.cs.d4', { ch: 'overheard', t: 0.3 })],
      note: 'she says it to the window, smiling' },
    { dur: 4, label: 'tin', cam: { k: 'shot', eye: at('tin.head', 0.25, 0.05, 0.8), look: 'tin.head', fov: 28 }, cues: [
      { k: 'expr', who: 'tin', e: 'worried' }, say('tin', 'c4m1.cs.tin', { ch: 'inner', t: 0.3 })],
      note: 'Tín at the cooler with an empty paper cup; he does not connect the girl of sixteen to his sister yet' },
    { dur: 5.5, label: 'len-lau', cam: { k: 'move', from: at(office('desk'), 1.6, 1.5, 2.2), to: at(office('desk'), 0.6, 1.5, 2.6), look: [office('corridor'), office('stairs')], fov: 40, ease: 'inOutSine' }, cues: [
      { k: 'walk', who: 'diem', path: [office('backDoor'), office('corridor'), office('stairs')] }, { k: 'look', who: 'diem', at: 'thuKy.head', t: 0.2 },
      say('diem', 'c4m1.cs.d5', { t: 0.3 }), { k: 'anim', who: 'thuKy', clip: 'small-nod', t: 3.4 }, { k: 'letterbox', on: false, t: 5.1 }],
      note: 'handbag on her arm, she passes the desk and goes upstairs without a glance at the shipper' },
  ],
  handoff: { player: { at: office('cooler'), vehicle: 'foot' }, camera: 'blend', ms: 600 },
};

// ---- c4-m1 · walked to the door (23 s) --------------------------------------------------------------------------
const tienRa: Scene = {
  id: 'c4m1-tien-ra', mission: 'c4-m1', title: '@c4m1.cs.tienRa', kind: 'cutscene', seconds: 23, skippable: true,
  stage: { at: 'anh-duong', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 12.1, weather: 'clear', freezeClock: true } },
  sets: ['anh-duong-office'],
  cast: { tin: 'tin', diem: 'diem', thuKy: 'thu-ky' },
  shots: [
    { dur: 4, label: 'xuong-lau', cam: { k: 'shot', eye: at(office('desk'), 1.5, 1.5, 2), look: 'diem.head', fov: 40 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' },
      { k: 'place', who: 'tin', at: office('cooler'), pose: 'stand' }, { k: 'place', who: 'thuKy', at: office('desk'), pose: 'sit-chair' },
      { k: 'walk', who: 'diem', path: [office('stairs'), office('desk')] }, { k: 'expr', who: 'diem', e: 'smile' },
      say('diem', 'c4m1.cs.t1', { t: 1.2 })] },
    { dur: 5, label: 'tra-tien', cam: { k: 'twoShot', a: 'diem', b: 'tin', fov: 40 }, cues: [
      { k: 'pair', clip: 'handover', a: 'diem', b: 'tin', t: 0.6 }, say('diem', 'c4m1.cs.t2', { t: 0.3 }), say('tin', 'c4m1.cs.t3', { t: 3.2 })],
      note: 'two hundred-thousand notes and a fifty; she will not take change' },
    { dur: 6, label: 'vai', cam: { k: 'ots', speaker: 'diem', listener: 'tin', side: 'left', fov: 38 }, cues: [
      { k: 'walk', who: 'tin', path: [office('entry')] }, { k: 'walk', who: 'diem', path: [at(office('entry'), 0.8, 0, 0.6)] },
      { k: 'pair', clip: 'hand-on-shoulder', a: 'diem', b: 'tin', t: 1.5 },
      say('diem', 'c4m1.cs.t4', { t: 1.6 }), say('diem', 'c4m1.cs.t5', { t: 4.4 })],
      note: 'at the glass door she brushes his shoulder' },
    { dur: 3, label: 'cuoi-guong', cam: { k: 'shot', eye: at('tin.head', 0.2, 0.05, 0.7), look: 'tin.head', fov: 28 }, cues: [
      { k: 'expr', who: 'tin', e: 'smile' }, say('tin', 'c4m1.cs.t6', { t: 0.6 })], note: 'a forced smile' },
    { dur: 5, label: 'tat-cuoi', cam: { k: 'shot', eye: at('diem.head', 0.3, 0, 1.1), look: 'diem.head', fov: 30 }, cues: [
      { k: 'walk', who: 'tin', path: [office('front')], t: 0.2 }, { k: 'expr', who: 'diem', e: 'neutral', t: 2.6 },
      { k: 'look', who: 'diem', at: office('photoBoard'), t: 3.2 }, { k: 'letterbox', on: false, t: 4.6 }],
      note: 'the camera stays on Diễm as he leaves: her smile switches off; she turns to the photo board. No line.' },
  ],
  handoff: { player: { at: 'anh-duong', yaw: Math.PI, vehicle: 'foot' }, camera: 'blend', ms: 600 },
};

// ---- CS04 · Anh Hai, first half: the ledger line and Má's call (28 s) -------------------------------------------
const cs04: Scene = {
  id: 'cs04_anh_hai', mission: 'c4-m2', title: '@cs04.title', kind: 'cutscene', seconds: 28, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 12, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 4.84, weather: 'rain', freezeClock: true } },
  sets: ['attic', 'village-tan-thuan'],
  cast: { tin: 'tin', bana: 'bana' },
  shots: [
    { dur: 6, label: 'trang-ba', cam: { k: 'insert', target: 'tin.handR', fov: 20, dist: 0.3 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'place', who: 'tin', at: 'set:attic.desk', pose: 'sit' },
      { k: 'phoneScreen', who: 'tin', text: '@cs04.trang', t: 0.5 }],
      note: 'over the shoulder by the desk lamp, rain on the window: his finger zooms the ledger photo onto one line. No dialogue, only the rain.' },
    { dur: 3, label: 'chuong', cam: { k: 'shot', eye: at('tin.head', 0.25, 0.05, 0.75), look: 'tin.head', fov: 30 }, cues: [
      { k: 'expr', who: 'tin', e: 'shock' }, { k: 'sfx', id: 'phone-ring', t: 1 }, { k: 'phoneScreen', who: 'tin', text: '@cs04.goi', t: 1 }],
      note: 'the phone rings in his hand before he can breathe' },
    { dur: 12, label: 'ma', cam: { k: 'split', divider: 'diagonal', names: ['@cast.tin', '@cast.bana'],
      left: { k: 'shot', eye: at('tin.head', 0.3, 0, 1), look: 'tin.head', fov: 35 },
      right: { k: 'shot', eye: at('set:village-tan-thuan.stiltIn', 1.2, 1.4, 1.4), look: 'bana.head', fov: 38 } }, cues: [
      { k: 'place', who: 'bana', at: 'set:village-tan-thuan.stiltIn', pose: 'sit' }, { k: 'expr', who: 'bana', e: 'cry' },
      { k: 'prop', id: 'thu-mai', kind: 'envelope', attach: 'bana.handL' }, { k: 'anim', who: 'bana', clip: 'unfold-paper', t: 0.2 },
      say('bana', 'cs04.ma1', { ch: 'phone', t: 0.4 }), say('bana', 'cs04.ma2', { ch: 'phone', t: 3.6 }), say('bana', 'cs04.ma3', { ch: 'phone', t: 8.1 })],
      note: 'right: Má in the dark stilt house before dawn, Mai\'s letter in her lap; left: Tín standing up, pacing' },
    { dur: 7, label: 'di-lien', cam: { k: 'split', divider: 'diagonal', names: ['@cast.tin', '@cast.bana'],
      left: { k: 'shot', eye: at('tin.head', 0.2, 0, 0.7), look: 'tin.head', fov: 30 },
      right: { k: 'shot', eye: at('bana.head', 0.2, 0, 0.8), look: 'bana.head', fov: 30 } }, cues: [
      say('bana', 'cs04.ma4', { ch: 'phone', t: 0.3 }), { k: 'expr', who: 'tin', e: 'determined', t: 3 },
      say('tin', 'cs04.tin', { ch: 'phone', t: 3.8 }), { k: 'anim', who: 'tin', clip: 'look-watch', t: 5.8 }, { k: 'phoneScreen', who: 'tin', text: '@cs04.gio', t: 5.8 },
      { k: 'letterbox', on: false, t: 6.6 }],
      note: 'he grabs his helmet; the screen reads 04:58 and the ledger said 05:00: two minutes' },
  ],
  handoff: { player: { at: 'cafe-co-ba.pickup', yaw: -H, vehicle: 'bike' }, camera: 'cut' },
  notes: 'Half one of CS04 (bible shots 1–2). The split call runs longer than the bible\'s 8 s so Má\'s lines stay readable (≤ 17 characters a second); the two halves total 59 s.',
};

// ---- c4-m2 · the coach stop at five (17 s) ------------------------------------------------------------------------
const benXe: Scene = {
  id: 'c4m2-ben-xe', mission: 'c4-m2', title: '@c4m2.cs.benXe', kind: 'cutscene', seconds: 17, skippable: true,
  stage: { at: 'ben-xe-an-hoa', radius: 40, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 5.0, weather: 'rain', freezeClock: true } },
  cast: { tin: 'tin', mai: 'mai', aoDen: 'tpl:debt-collector' },
  shots: [
    { dur: 5, label: 'ben', cam: { k: 'shot', eye: at('ben-xe-an-hoa', -14, 3.5, 10), look: 'vehicle:van-mai', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'dawn' }, { k: 'fx', kind: 'rain-on-lens' },
      { k: 'place', who: 'aoDen', at: at('vehicle:van-mai', 1.8, 0, -0.4), pose: 'stand' },
      { k: 'walk', who: 'mai', path: ['ben-xe-an-hoa', at('vehicle:van-mai', 1.9, 0, 0.6)], pace: 'walk' }],
      note: 'the xe đò idles at the shelter; Mai, braid and blue school bag, crosses to the white van; the man in black of CS01 holds the sliding door and an umbrella over her' },
    { dur: 3, label: 'toi', cam: { k: 'shot', eye: at('ben-xe-an-hoa', -24, 1.2, 9), look: at('ben-xe-an-hoa', -40, 1, 9.5), fov: 40 }, cues: [
      { k: 'ride', id: 'dream', model: 'dream', path: [at('ben-xe-an-hoa', -48, 0, 9.5), at('ben-xe-an-hoa', -28, 0, 9.5)], speed: 9, driver: 'tin' },
      say('tin', 'c4m2.cs.ut', { t: 1.2 })], note: 'Tín skids in at the far end, too far, the rain swallowing the shout' },
    { dur: 4, label: 'bim-toc', cam: { k: 'shot', eye: at('vehicle:van-mai', 3.5, 1.4, 1.2), look: 'mai.head', fov: 30 }, cues: [
      { k: 'walk', who: 'mai', path: [at('vehicle:van-mai', 0.6, 0, 0.6)], t: 0.5 }, { k: 'sfx', id: 'door-slam', t: 2.6 }],
      note: 'her braid and the lotus hairclip disappear into the van; the door slides shut. She never hears him.' },
    { dur: 2.5, label: 'bien-so', cam: { k: 'insert', target: at('vehicle:van-mai', 0, 0.55, -2.6), fov: 22, dist: 1.2 },
      note: 'the rear plate 51B-217.07 as the van starts to roll' },
    { dur: 2.5, label: 'nho', cam: { k: 'shot', eye: at('tin.head', 0.2, 0, 0.7), look: 'tin.head', fov: 26 }, cues: [
      say('tin', 'c4m2.cs.bienSo', { ch: 'inner', t: 0.3 }), { k: 'letterbox', on: false, t: 2.1 }], note: 'he twists the throttle' },
  ],
  handoff: { player: { at: 'ch4.ben-xe-dream', yaw: H, vehicle: 'bike' }, camera: 'blend', ms: 500 },
};

// ---- CS04 · Anh Hai, second half: alongside, the look, the T-bone (31 s) ---------------------------------------
/** The van runs south (+z) in the southbound lanes of ĐẠI LỘ NGUYỄN HUỆ (x ≈ 213.5); the Dream rides on its right (west). */
const cs04b: Scene = {
  id: 'cs04_anh_hai_xe', mission: 'c4-m2', title: '@cs04b.title', kind: 'cutscene', seconds: 31, skippable: true,
  stage: { at: J, radius: 70, crowd: 'hide', traffic: 'hold', police: 'pause', freezeWorld: true, env: { hours: 5.05, weather: 'rain', freezeClock: true } },
  cast: { tin: 'tin', mai: 'mai', cuong: 'cuong' },
  shots: [
    { dur: 6, label: 'ngang-hong', cam: { k: 'follow', target: 'ride:dream', offset: [-1, 1.2, 0.3], fov: 50, lag: 0.2 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'dawn' }, { k: 'slowmo', scale: 0.3, seconds: 6 }, { k: 'music', id: null, fade: 1 },
      { k: 'ride', id: 'van-mai', model: 'white-van', path: [at(J, -2.5, 0, -42), at(J, -2.5, 0, -2)], speed: 16, plate: '51B-217.07', paint: '#f2f2ee', passengers: ['cuong', 'mai'] },
      { k: 'ride', id: 'dream', model: 'dream', path: [at(J, -4.6, 0, -44), at(J, -4.6, 0, -3.5)], speed: 16, driver: 'tin' }],
      note: 'a virtual car mount between the Dream and the van at 60 km/h, time at 0.3: only the wind. Cường takes the front passenger seat, Mai the rear seat by the back window.' },
    { dur: 5, label: 'kinh-sau', cam: { k: 'shot', eye: at('ride:van-mai', 0.3, 1.4, -3.2), look: 'mai.head', fov: 28 }, cues: [
      { k: 'look', who: 'mai', at: 'tin.head' }, { k: 'expr', who: 'mai', e: 'shock' }, { k: 'anim', who: 'mai', clip: 'palm-glass', t: 0.6 },
      say('mai', 'cs04b.mai', { t: 1.2 })],
      note: 'through the rear window: Mai turns, eyes wide, her palm flat on the glass; she mouths the words, no voice' },
    { dur: 4, label: 'ghe-truoc', cam: { k: 'move', from: at('ride:van-mai', 1.9, 1.5, -1.6), to: at('ride:van-mai', 1.9, 1.5, 1.4), look: 'cuong.head', fov: 35 }, cues: [
      { k: 'look', who: 'cuong', at: 'tin.head', t: 0.8 }, { k: 'expr', who: 'cuong', e: 'cold-smile', t: 1.6 }],
      note: 'pan forward along the van to the passenger seat: Cường Sẹo turns his head, looks straight at Tín and smiles' },
    { dur: 4, label: 'xe-den', cam: { k: 'shot', eye: at(J, -12, 2.2, 10), look: at(J, -4, 1, -2), fov: 75 }, cues: [
      { k: 'ride', id: 'suv-den', model: 'suv-den', path: [at(J, -46, 0, 1.6), at(J, -5, 0, 1.6)], speed: 22 },
      { k: 'sfx', id: 'horn-blare', t: 1 }, { k: 'sfx', id: 'tire-screech', t: 2.6 }],
      note: 'wide from the junction corner: a black SUV bursts through the red light from the west, straight at the Dream' },
    { dur: 6, label: 'va', cam: { k: 'rail', points: [at('ride:dream', -1.5, 1.2, 0), at('tin.head', 1.5, 0.3, 1), at('tin.head', 0.8, 0.2, -1.2)], look: ['tin.head', 'tin.head', 'tin.head'], fov: [60, 55, 45], roll: [0, 0.6, 1.4], ease: 'outCubic' }, cues: [
      { k: 'slowmo', scale: 0.2, seconds: 6 }, { k: 'sfx', id: 'smash-cut' }, { k: 'fx', kind: 'camera-jolt' }, { k: 'grade', id: 'cold', t: 0.3 },
      { k: 'fx', kind: 'glass-rain', at: 'tin', t: 0.2 }, { k: 'anim', who: 'tin', clip: 'thrown', t: 0.2 }, { k: 'sfx', id: 'heartbeat', t: 3 }],
      note: 'the cut lands on a white flash, after the hit: glass falls like slow rain, Tín is thrown, sky and street spin with the camera. No blood, no body impact frame; the sound drains to a heartbeat.' },
    { dur: 6, label: 'mat-hut', cam: { k: 'shot', eye: at(J, -6, 0.25, 4), look: at(J, -2.5, 0.8, 40), fov: 40 }, cues: [
      { k: 'place', who: 'tin', at: at(J, -6, 0, 4), pose: 'lie-flat' },
      { k: 'ride', id: 'van-mai', model: 'white-van', path: [at(J, -2.5, 0, 8), at(J, -2.5, 0, 70)], speed: 9, plate: '51B-217.07', paint: '#f2f2ee', passengers: ['cuong', 'mai'] },
      say('tin', 'cs04b.tin', { t: 1.5 }), { k: 'fade', to: 'black', ms: 2500, t: 3.2 }],
      note: 'ground-level POV, defocused: the van\'s tail lights dwindle south down Nguyễn Huệ, its horn fading. Black.' },
  ],
  notes: 'Half two of CS04 (bible shots 3–8). freezeWorld for the slow motion; no handoff: the mission completes on the black and c4-m3 opens in the hospital.',
};

// ---- c4-m3 · the hospital bay (27 s) --------------------------------------------------------------------------
const benhVien: Scene = {
  id: 'c4m3-benh-vien', mission: 'c4-m3', title: '@c4m3.cs.benhVien', kind: 'cutscene', seconds: 27, skippable: true,
  stage: { at: 'benh-vien', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 18.67, weather: 'rain', freezeClock: true } },
  sets: ['hospital-ward'],
  cast: { tin: 'tin', coba: 'coba', tu: 'tu', quang: 'quang' },
  shots: [
    { dur: 4, label: 'tran-nha', cam: { k: 'shot', eye: at(ward('bay3'), 0, 0.85, 0), look: at(ward('bay3'), 0, 3, 0.4), fov: 60 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'place', who: 'tin', at: ward('bay3'), pose: 'lie-flat' }],
      note: 'POV from the bed: a blurred ceiling light, rain against the window' },
    { dur: 6, label: 'trai-tao', cam: { k: 'shot', eye: at(ward('bay3Stool'), 1.2, 1.3, 1.4), look: 'coba.head', fov: 38 }, cues: [
      { k: 'place', who: 'coba', at: ward('bay3Stool'), pose: 'sit-stool' }, { k: 'anim', who: 'coba', clip: 'peel-apple', loop: true },
      { k: 'prop', id: 'tao', kind: 'apple', attach: 'coba.handL' }, say('coba', 'c4m3.bv.coba1', { t: 0.6 })] },
    { dur: 6, label: 'bien-so', cam: { k: 'twoShot', a: 'coba', b: 'tin', fov: 42 }, cues: [
      say('tin', 'c4m3.bv.tin1', { t: 0.3 }), say('tin', 'c4m3.bv.tin2', { t: 3.6 })],
      note: 'his left wrist bandaged, scrapes down one side; he says the plate before anything else' },
    { dur: 5, label: 'cua-so', cam: { k: 'shot', eye: at(ward('window'), -1.6, 1.6, 1.2), look: 'tu.head', fov: 35 }, cues: [
      { k: 'place', who: 'tu', at: ward('window'), pose: 'stand' }, { k: 'look', who: 'tu', at: at(ward('window'), 0, 1.6, -3) },
      say('tu', 'c4m3.bv.tu1', { t: 0.4 }), say('tu', 'c4m3.bv.tu2', { t: 2 })],
      note: 'Ông Tư leans by the window and does not turn round' },
    { dur: 6, label: 'hanh-lang', cam: { k: 'shot', eye: at(ward('bay3'), 0.4, 1.3, 0.2), look: ward('doorGlass'), fov: 32 }, cues: [
      { k: 'place', who: 'quang', at: ward('corridor'), pose: 'stand' }, { k: 'anim', who: 'quang', clip: 'talk-phone', loop: true },
      say('coba', 'c4m3.bv.coba2', { t: 0.2 }), { k: 'look', who: 'quang', at: 'tin.head', t: 2 },
      { k: 'walk', who: 'quang', path: [at(ward('corridor'), 6, 0, 0)], t: 3.6 }, { k: 'letterbox', on: false, t: 5.6 }],
      note: 'over Cô Ba\'s line: in the corridor, through the door glass, Quang on the phone glances in and turns away without entering. No subtitle for him; attentive players will notice.' },
  ],
  handoff: { player: { at: ward('bay3'), vehicle: 'foot', outfit: 'tin-bandaged' }, camera: 'blend', ms: 600 },
};

// ---- c4-m3 · MAI on the chalk wall (30 s) ----------------------------------------------------------------------
const chuMai: Scene = {
  id: 'c4m3-chu-mai', mission: 'c4-m3', title: '@c4m3.cs.chuMai', kind: 'cutscene', seconds: 30, skippable: true,
  stage: { at: 'cafe-co-ba', radius: 10, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 20, weather: 'rain', freezeClock: true } },
  sets: ['attic'],
  cast: { tin: 'tin', tu: 'tu' },
  shots: [
    { dur: 5, label: 'buc-tuong', cam: { k: 'shot', eye: at('set:attic.wall', -1.4, 1.4, 2.4), look: 'set:attic.wall', fov: 50 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'music', id: 'theme-loss' },
      { k: 'prop', id: 'bang', kind: 'case-board', at: 'set:attic.wall' },
      { k: 'prop', id: 'so-no', kind: 'chalk-text', at: at('set:attic.wall', 0, 1.5, 0), text: '@c4m3.cs.so' },
      { k: 'place', who: 'tin', at: 'set:attic.wall', pose: 'stand' }],
      note: 'the red strings close in a lotus shape around the old chalk figure' },
    { dur: 5, label: 'xoa', cam: { k: 'insert', target: at('set:attic.wall', 0, 1.5, 0), fov: 28, dist: 1 }, cues: [
      { k: 'anim', who: 'tin', clip: 'wipe-glass' }, { k: 'prop', id: 'so-no', kind: 'chalk-text', remove: true, t: 3.2 }],
      note: 'he wipes 40.000.000 off with his good hand (the same wiping arm as CS03\'s glass)' },
    { dur: 6, label: 'chu-mai', cam: { k: 'shot', eye: at('set:attic.wall', 0.8, 1.3, 2.8), look: at('set:attic.wall', 0, 1.6, 0), fov: 40 }, cues: [
      { k: 'anim', who: 'tin', clip: 'chalk-write' }, { k: 'sfx', id: 'chalk', t: 0.4 },
      { k: 'prop', id: 'chu-mai', kind: 'chalk-text', at: at('set:attic.wall', 0, 1.6, 0), text: '@c4m3.cs.mai', variant: 'huge', t: 2.5 }],
      note: 'huge: MAI, in the middle of the board' },
    { dur: 6, label: 'ong-tu', cam: { k: 'shot', eye: at('set:attic.door', 1.1, 1.5, 2.2), look: 'tu.head', fov: 38 }, cues: [
      { k: 'place', who: 'tu', at: 'set:attic.door', pose: 'stand' }, say('tu', 'c4m3.cs.tu1', { t: 0.4 }), say('tu', 'c4m3.cs.tu2', { t: 3.8 })],
      note: 'Ông Tư in the doorway at the top of the stairs, rain behind him' },
    { dur: 4, label: 'khong-quay', cam: { k: 'shot', eye: at('tin.head', 0.15, 0.05, 0.6), look: 'tin.head', fov: 26 }, cues: [say('tin', 'c4m3.cs.tin1', { t: 0.6 })],
      note: 'Tín does not turn round' },
    { dur: 4, label: 'nam-gio', cam: { k: 'shot', eye: at('tu.head', 0.2, 0, 0.9), look: 'tu.head', fov: 30 }, cues: [
      say('tu', 'c4m3.cs.tu3', { t: 0.4 }), { k: 'walk', who: 'tu', path: ['set:attic.stairs'], t: 2.6 }, { k: 'sfx', id: 'stairs-down', t: 2.8 },
      { k: 'letterbox', on: false, t: 3.6 }] },
  ],
  handoff: { player: { at: 'set:attic.wall', vehicle: 'foot' }, camera: 'cut' },
};

export const CUTSCENES: Scene[] = [diemGoi, tienRa, cs04, benXe, cs04b, benhVien, chuMai];
