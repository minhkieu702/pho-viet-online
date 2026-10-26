import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Mark, Scene } from '../scene.ts';

/**
 * Chapter 5 cutscenes as data (schema and conventions: story/scene.ts). Lines are '@keys' of text/vi/ch05.ts;
 * 'set:<space>.<anchor>' marks are the off-map anchors declared in content/ch05.ts ANCHORS. The chapter has no
 * numbered CS: these are the short in-mission scenes the bible lists for c5 (story-system-cinematics.md: c5m1-dream,
 * c5m1-vip, c5m1-breathe, c5m2-bag, c5m2-plan, c5m3-mirror, c5m3-strobe) plus the alley replay of the clip.
 * Nobody is struck on screen: the takedown happens in gameplay, the scene only checks that the man breathes; the
 * drug packets stay plain grey blocks; Mai never appears, only her bag and her lotus tea.
 */

const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; if?: Cond; t?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });

// ---- c5-m1 · dawn at SỬA XE TƯ: the matte-black rebuild and the bug (32 s) ----------------------------------------
const dream: Scene = {
  id: 'c5m1-dream', mission: 'c5-m1', title: '@c5m1.cs.dream', kind: 'cutscene', seconds: 32, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 18, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 5.1, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', tu: 'tu' },
  shots: [
    { dur: 5, label: 'tam-bat', cam: { k: 'shot', eye: at('xe-may-ong-tu.tarp', -3.2, 1.5, 3.4), look: 'xe-may-ong-tu.tarp', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'dawn' }, { k: 'sfx', id: 'rooster' },
      { k: 'prop', id: 'tam-bat', kind: 'tarp', at: 'xe-may-ong-tu.tarp' },
      { k: 'place', who: 'tu', at: at('xe-may-ong-tu.tarp', 0.9, 0, 0.3), pose: 'stand' }, { k: 'place', who: 'tin', at: at('xe-may-ong-tu.tarp', -1.6, 0, 1.5), pose: 'stand' },
      say('tu', 'c5m1.cs.dream1', { t: 1 })],
      note: 'first light on the sidewalk; Tín arrives on foot (his bike was wrecked in c4-m2); a shape under a canvas tarp' },
    { dur: 4, label: 'giat', cam: { k: 'move', from: at('xe-may-ong-tu.tarp', 1.8, 0.9, 1.8), to: at('xe-may-ong-tu.tarp', 1.2, 0.7, 1.2), look: 'xe-may-ong-tu.tarp', fov: 35, ease: 'outCubic' }, cues: [
      { k: 'anim', who: 'tu', clip: 'pull-tarp' }, { k: 'sfx', id: 'tarp-rustle', t: 0.4 }, { k: 'prop', id: 'tam-bat', kind: 'tarp', remove: true, t: 1.2 }],
      note: 'one sweep: the tarp flies off' },
    { dur: 7, label: 'xe-moi', cam: { k: 'orbit', center: 'vehicle:dream', radius: 2.4, height: 0.8, from: 0.3, to: 1.7, fov: 40 }, cues: [
      say('tu', 'c5m1.cs.dream2', { t: 0.5 }), { k: 'sfx', id: 'engine-purr', t: 2.4 }, say('tu', 'c5m1.cs.dream3', { t: 3.6 })],
      note: 'the battered bike is now matte black, stickers scraped off, the engine barely a purr; Ông Tư flicks the hidden headlight switch' },
    { dur: 9, label: 'dan', cam: { k: 'twoShot', a: 'tu', b: 'tin', fov: 38 }, cues: [
      say('tu', 'c5m1.cs.dream4', { t: 0.6 }), { k: 'expr', who: 'tin', e: 'determined', t: 2.8 }, say('tin', 'c5m1.cs.dream5', { t: 3.6 }),
      { k: 'look', who: 'tu', at: 'tin.handL', t: 5.2 }, say('tu', 'c5m1.cs.dreamTay', { t: 5.6 })],
      note: 'Ông Tư\'s eyes drop to the elastic wrap on Tín\'s left wrist (the crash was the morning before)' },
    { dur: 7, label: 'con-rep', cam: { k: 'insert', target: 'tu.handR', fov: 22, dist: 0.4 }, cues: [
      { k: 'prop', id: 'con-rep', kind: 'audio-bug', attach: 'tu.handR' }, { k: 'pair', clip: 'handover', a: 'tu', b: 'tin', t: 0.4 },
      say('tu', 'c5m1.cs.dream6', { t: 0.6 }), { k: 'prop', id: 'con-rep', kind: 'audio-bug', attach: 'tin.handR', t: 2.2 },
      say('tu', 'c5m1.cs.dream7', { t: 3.8 }), { k: 'letterbox', on: false, t: 6.6 }],
      note: 'a matchbox-sized bug from his trinh sát years, the paint worn off' },
  ],
  handoff: { player: { at: 'xe-may-ong-tu', vehicle: 'foot' }, camera: 'blend', ms: 600 },
};

// ---- c5-m1 · the VIP room through the door gap, the bolero drowns the words (31 s) --------------------------------
const vip: Scene = {
  id: 'c5m1-vip', mission: 'c5-m1', title: '@c5m1.cs.vip', kind: 'cutscene', seconds: 31, skippable: true,
  stage: { at: 'karaoke-anh-sao', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 22.6, weather: 'clear', freezeClock: true } },
  sets: ['karaoke-back'],
  cast: { tin: 'tin', quang: 'quang', chuSong: 'chu-song', gac: 'gac-cua-sau' },
  shots: [
    { dur: 4, label: 'khe-cua', cam: { k: 'shot', eye: at('set:karaoke-back.vipDoor', 0, 1.5, 0.35), look: 'set:karaoke-back.vipRoom', fov: 28 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'neon' }, { k: 'sfx', id: 'bolero-offkey' },
      { k: 'prop', id: 'tv-bong-da', kind: 'football-tv', at: at('set:karaoke-back.vipRoom', 0, 1.6, -2.4) },
      { k: 'prop', id: 'tien', kind: 'cash-stacks', at: 'set:karaoke-back.vipTable' },
      { k: 'place', who: 'chuSong', at: 'set:karaoke-back.vipTable', pose: 'sit-chair' }, { k: 'place', who: 'gac', at: at('set:karaoke-back.vipTable', 1.4, 0, -0.6), pose: 'stand' }],
      note: 'POV through the hand-width gap: football on a big screen, a card table covered in cash, smoke' },
    { dur: 7, label: 'quang', cam: { k: 'move', from: at('set:karaoke-back.vipDoor', 0.1, 1.5, 0.3), to: at('set:karaoke-back.vipDoor', 0.1, 1.45, 0.05), look: 'quang.head', fov: 24 }, cues: [
      { k: 'place', who: 'quang', at: at('set:karaoke-back.vipTable', 0, 0, 1.3), pose: 'stand-head-down', yaw: Math.PI }, { k: 'expr', who: 'quang', e: 'worried' },
      say('quang', 'c5m1.cs.vip1', { t: 0.5 }), say('chuSong', 'c5m1.cs.vip2', { t: 3.6 })],
      note: 'Quang stands before the seated bookie, head bowed, hands clasped' },
    { dur: 8, label: 'mot-cach', cam: { k: 'ots', speaker: 'chuSong', listener: 'quang', side: 'right', fov: 34 }, cues: [
      { k: 'anim', who: 'chuSong', clip: 'flick-cigarette', t: 0.2 }, say('chuSong', 'c5m1.cs.vip3', { t: 0.6 }), say('chuSong', 'c5m1.cs.vip4', { t: 3 })] },
    { dur: 6, label: 'bolero', cam: { k: 'shot', eye: at('tin.head', 0.35, 0.05, 0.7), look: 'tin.head', fov: 30 }, cues: [
      { k: 'place', who: 'tin', at: 'set:karaoke-back.vipDoor', pose: 'crouch' }, { k: 'sfx', id: 'bolero-offkey', t: 0.8 }, { k: 'expr', who: 'tin', e: 'shock', t: 1 },
      say('chuSong', 'c5m1.cs.vip5', { ch: 'overheard', t: 2.2 })],
      note: 'a howling bolero from the next room swells over the rest; only fragments get through to Tín' },
    { dur: 6, label: 'khong-biet', cam: { k: 'shot', eye: at('quang.head', 0.2, 0, 1), look: 'quang.head', fov: 28 }, cues: [
      { k: 'expr', who: 'quang', e: 'cry' }, say('quang', 'c5m1.cs.vip6', { t: 0.6 }),
      { k: 'prop', id: 'goi', kind: 'grey-blocks', at: 'set:karaoke-back.vipTable', t: 2 }, { k: 'prop', id: 'tui', kind: 'orange-delivery-bags', at: 'set:karaoke-back.vipTable', t: 2 },
      say('chuSong', 'c5m1.cs.vip7', { t: 3 }), { k: 'letterbox', on: false, t: 5.6 }],
      note: 'the bookie tips the orange bag Quang delivered onto the table: plain grey packets, counted with one finger, never shown up close' },
  ],
  handoff: { player: { at: 'set:karaoke-back.vipDoor', vehicle: 'foot', crouch: true, space: 'karaoke-back' }, camera: 'blend', ms: 500 },
};

// ---- c5-m1 · the beer storeroom: he still breathes (19 s) ----------------------------------------------------------
const breathe: Scene = {
  id: 'c5m1-breathe', mission: 'c5-m1', title: '@c5m1.cs.tho', kind: 'cutscene', seconds: 19, skippable: true,
  stage: { at: 'karaoke-anh-sao', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 22.7, weather: 'clear', freezeClock: true } },
  sets: ['karaoke-back'],
  cast: { tin: 'tin', gac: 'gac-cua-sau', tu: 'tu' },
  shots: [
    { dur: 4, label: 'buong', cam: { k: 'shot', eye: at('set:karaoke-back.storeroom', 1.6, 1.3, 1.6), look: 'set:karaoke-back.storeroom', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'sfx', id: 'bolero-offkey' },
      { k: 'place', who: 'gac', at: 'set:karaoke-back.storeroom', pose: 'lie-flat' }, { k: 'place', who: 'tin', at: at('set:karaoke-back.storeroom', 0.6, 0, 0.3), pose: 'crouch' }],
      note: 'Tín lets the unconscious guard slump between the beer crates; the bolero muffled through the wall' },
    { dur: 5, label: 'nghe-tim', cam: { k: 'shot', eye: at('tin.head', 0.3, 0.1, 0.6), look: 'tin.head', fov: 26, handheld: 0.5 }, cues: [
      { k: 'anim', who: 'tin', clip: 'ear-to-chest' }, { k: 'expr', who: 'tin', e: 'shock' }, say('tin', 'c5m1.cs.tho1', { ch: 'inner', t: 1.5 })],
      note: 'panic: he presses his ear to the man\'s chest and holds his own breath' },
    { dur: 5, label: 'tay-run', cam: { k: 'insert', target: 'tin.handR', fov: 22, dist: 0.35 }, cues: [
      { k: 'anim', who: 'tin', clip: 'tremble' }, say('tin', 'c5m1.cs.tho2', { t: 0.5 })] },
    { dur: 5, label: 'ong-tu', cam: { k: 'shot', eye: at('tin.head', 0, 0.05, 0.75), look: 'tin.head', fov: 30 }, cues: [
      { k: 'expr', who: 'tin', e: 'eyes-closed' }, say('tu', 'c5m1.cs.tho3', { ch: 'inner', t: 0.6 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'Ông Tư\'s voice from the training night echoes (voice only)' },
  ],
  handoff: { player: { at: 'set:karaoke-back.storeroom', vehicle: 'foot', crouch: true, space: 'karaoke-back' }, camera: 'blend', ms: 500 },
};

// ---- c5-m2 · the spa storeroom: Mai's school bag and her lotus tea (31 s) -------------------------------------------
const bag: Scene = {
  id: 'c5m2-bag', mission: 'c5-m2', title: '@c5m2.cs.bag', kind: 'cutscene', seconds: 31, skippable: true,
  stage: { at: 'spa', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 2.3, weather: 'cloudy', freezeClock: true } },
  sets: ['spa-back'],
  cast: { tin: 'tin' },
  shots: [
    { dur: 5, label: 'kho', cam: { k: 'crane', from: at('set:spa-back.storeroomWall', 1.8, 2.6, 2.4), to: at('set:spa-back.storeroomWall', 1.2, 1.6, 1.8), look: 'set:spa-back.storeroomWall', fov: [50, 42], ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'music', id: null, fade: 1.5 }, { k: 'sfx', id: 'club-through-wall' },
      { k: 'prop', id: 'do-dac', kind: 'belongings-pile', at: 'set:spa-back.storeroomWall' },
      { k: 'place', who: 'tin', at: at('set:spa-back.storeroomWall', 1, 0, 1.2), pose: 'stand' }],
      note: 'dozens of sandals, backpacks and plastic bags piled up: the belongings of everyone who passed through. No music, only the club\'s bass through the wall' },
    { dur: 5, label: 'luc-loi', cam: { k: 'follow', target: 'tin', offset: [0.8, 1.4, -1.6], fov: 40, lag: 0.4 }, cues: [
      { k: 'walk', who: 'tin', path: [at('set:spa-back.storeroomWall', 0.6, 0, 0.8), at('set:spa-back.storeroomWall', 0.3, 0, 0.4)], pace: 'sneak' },
      say('tin', 'c5m2.cs.bag1', { ch: 'inner', t: 0.8 })] },
    { dur: 5, label: 'cai-cap', cam: { k: 'insert', target: 'prop:cap-mai', fov: 18, dist: 0.5 }, cues: [
      { k: 'prop', id: 'cap-mai', kind: 'school-bag', at: at('set:spa-back.storeroomWall', 0.3, 0.3, 0.2), lines: ['@c5m2.cs.capTen'] }],
      note: 'he freezes: a blue cloth school bag, "Đỗ Thị Mai — 10A2" written inside the flap in her round hand' },
    { dur: 6, label: 'tra-sen', cam: { k: 'insert', target: 'tin.handR', fov: 20, dist: 0.35 }, cues: [
      { k: 'prop', id: 'tra-sen', kind: 'lotus-tea-packet', attach: 'tin.handR', t: 0.8 }, say('tin', 'c5m2.cs.bag2', { t: 2 })],
      note: 'inside: a packet of lotus tea, the same as the one she pressed into his hands at the stilt house' },
    { dur: 7, label: 'quy', cam: { k: 'shot', eye: at('tin.head', 0.3, -0.1, 1), look: 'tin.head', fov: 30 }, cues: [
      { k: 'place', who: 'tin', at: at('set:spa-back.storeroomWall', 0.3, 0, 0.4), pose: 'squat' }, { k: 'anim', who: 'tin', clip: 'press-to-face' }, { k: 'expr', who: 'tin', e: 'cry' },
      say('tin', 'c5m2.cs.bag3', { t: 1.2 }), say('tin', 'c5m2.cs.bag4', { t: 4 })],
      note: 'he kneels and presses the packet to his face; a whisper' },
    { dur: 3, label: 'bass', cam: { k: 'shot', eye: at('set:spa-back.storeroomWall', 0.6, 0.2, 1.4), look: at('set:spa-back.storeroomWall', 0.3, 0.2, 0.4), fov: 35 }, cues: [
      { k: 'sfx', id: 'club-through-wall', t: 0.2 }, { k: 'letterbox', on: false, t: 2.6 }], note: 'the bass thuds again through the floor' },
  ],
  handoff: { player: { at: 'set:spa-back.storeroom', vehicle: 'foot', space: 'spa-back' }, camera: 'blend', ms: 500 },
};

// ---- c5-m2 · the red pen line to B2 (14 s) -------------------------------------------------------------------------
const plan: Scene = {
  id: 'c5m2-plan', mission: 'c5-m2', title: '@c5m2.cs.plan', kind: 'cutscene', seconds: 14, skippable: true,
  stage: { at: 'spa', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 2.35, weather: 'cloudy', freezeClock: true } },
  sets: ['spa-back'],
  cast: { tin: 'tin' },
  shots: [
    { dur: 4, label: 'so-do', cam: { k: 'insert', target: 'prop:so-do', fov: 22, dist: 0.6 }, cues: [
      { k: 'letterbox', on: true }, { k: 'prop', id: 'so-do', kind: 'floor-plan', at: 'set:spa-back.plan', lines: ['@c5m2.cs.plan1', '@c5m2.cs.plan2'] }],
      note: 'the floor plan of the three buildings (the photo he took, as he remembers it)' },
    { dur: 5, label: 'but-do', cam: { k: 'rail', points: [at('set:spa-back.plan', -0.3, 0.25, 0.4), at('set:spa-back.plan', 0, 0.1, 0.35), at('set:spa-back.plan', 0.25, -0.2, 0.3)],
      look: [at('set:spa-back.plan', -0.3, 0.25, 0), at('set:spa-back.plan', 0, 0, 0), at('set:spa-back.plan', 0.25, -0.25, 0)], fov: [18, 16, 13], ease: 'inOutSine' }, cues: [
      { k: 'sfx', id: 'club-through-wall', t: 1.2 }],
      note: 'the camera follows the red pen line from Moonlight\'s staff lift down to "B2 — KHO"' },
    { dur: 5, label: 'duoi-chan', cam: { k: 'shot', eye: at('set:spa-back.storeroom', 0.4, 0.15, 1.2), look: at('set:spa-back.storeroom', 0, 0, 0), fov: 40 }, cues: [
      { k: 'place', who: 'tin', at: 'set:spa-back.storeroom', pose: 'stand' }, { k: 'sfx', id: 'club-through-wall', t: 0.5 }, { k: 'sfx', id: 'club-through-wall', t: 2.5 },
      say('tin', 'c5m2.cs.plan3', { ch: 'inner', t: 0.8 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'low angle on his shoes: the bass thuds, thình... thình..., right under his feet' },
  ],
};

// ---- c5-m3 · through the one-way mirror (29 s) ---------------------------------------------------------------------
const mirror: Scene = {
  id: 'c5m3-mirror', mission: 'c5-m3', title: '@c5m3.cs.guong', kind: 'cutscene', seconds: 29, skippable: true,
  stage: { at: 'moonlight', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 23.8, weather: 'clear', freezeClock: true } },
  sets: ['moonlight-vip'],
  cast: { tin: 'tin', luc: 'luc', cuong: 'cuong' },
  shots: [
    { dur: 4, label: 'guong', cam: { k: 'shot', eye: at('set:moonlight-vip.mirror', 0, 1.45, 0.3), look: 'set:moonlight-vip.lounge', fov: 36 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'neon' }, { k: 'sfx', id: 'club-through-wall' },
      { k: 'place', who: 'luc', at: 'set:moonlight-vip.lounge', pose: 'sit-chair' }, { k: 'place', who: 'cuong', at: at('set:moonlight-vip.lounge', 1.2, 0, 0.5), pose: 'stand' },
      { k: 'prop', id: 'phong-bi', kind: 'envelope', attach: 'cuong.handR' }],
      note: 'Tín\'s side of the glass is dark; on the other side a lounge, Lực in a polo shirt, the gold watch' },
    { dur: 6, label: 'phong-bi', cam: { k: 'twoShot', a: 'cuong', b: 'luc', fov: 40 }, cues: [
      { k: 'pair', clip: 'handover', a: 'cuong', b: 'luc' }, { k: 'prop', id: 'phong-bi', kind: 'envelope', attach: 'luc.handL', t: 1.4 },
      say('luc', 'c5m3.cs.m1', { t: 1.8 })], note: 'a thick envelope changes hands' },
    { dur: 7, label: 'sa-lan', cam: { k: 'ots', speaker: 'luc', listener: 'cuong', side: 'left', fov: 34 }, cues: [
      say('luc', 'c5m3.cs.m2', { t: 0.4 }), say('luc', 'c5m3.cs.m3', { t: 3 })] },
    { dur: 3, label: 'em-lo', cam: { k: 'shot', eye: at('cuong.head', 0.2, 0, 1), look: 'cuong.head', fov: 30 }, cues: [say('cuong', 'c5m3.cs.m4', { t: 0.5 })] },
    { dur: 6, label: 'hai', cam: { k: 'shot', eye: at('luc.head', -0.25, 0, 1), look: 'luc.head', fov: 28 }, cues: [
      { k: 'anim', who: 'luc', clip: 'look-watch' }, { k: 'expr', who: 'luc', e: 'cold-smile' }, say('luc', 'c5m3.cs.m5', { t: 0.6 }), say('luc', 'c5m3.cs.m6', { t: 3 })],
      note: 'the kind-uncle smile; he checks the gold watch as if it were nothing' },
    { dur: 3, label: 'tin', cam: { k: 'shot', eye: at('tin.head', 0.25, 0, 0.7), look: 'tin.head', fov: 26 }, cues: [
      { k: 'place', who: 'tin', at: 'set:moonlight-vip.mirror', pose: 'crouch' }, { k: 'expr', who: 'tin', e: 'shock' }, { k: 'letterbox', on: false, t: 2.6 }],
      note: 'behind the glass, the clip-on camera\'s tiny red dot on his chest' },
  ],
  handoff: { player: { at: 'set:moonlight-vip.mirror', vehicle: 'foot', crouch: true, space: 'moonlight-vip' }, camera: 'blend', ms: 500 },
};

// ---- c5-m3 · top-down over the strobes; Cường searches and loses him (16 s) -----------------------------------------
const strobe: Scene = {
  id: 'c5m3-strobe', mission: 'c5-m3', title: '@c5m3.cs.strobe', kind: 'cutscene', seconds: 16, skippable: true,
  stage: { at: 'moonlight', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 23.9, weather: 'clear', freezeClock: true } },
  sets: ['moonlight-floor'],
  cast: {
    tin: 'tin', cuong: 'cuong',
    dancers: { template: 'clubber', count: 40, area: 'set:moonlight-floor.crowd', size: [14, 10], poses: ['dance'] },
  },
  shots: [
    { dur: 6, label: 'tu-tren', cam: { k: 'move', from: at('set:moonlight-floor.crowd', 0, 14, 0), to: at('set:moonlight-floor.crowd', 2.5, 13, 0), look: [at('set:moonlight-floor.crowd', 0, 0, 0.01), at('set:moonlight-floor.crowd', 2.5, 0, 0.01)], fov: 60 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'neon' }, { k: 'fx', kind: 'strobe', at: 'set:moonlight-floor.crowd' }, { k: 'music', id: 'neon-night' },
      { k: 'walk', who: 'tin', path: [at('set:moonlight-floor.crowd', -3, 0, 1), 'set:moonlight-floor.crowd', at('set:moonlight-floor.crowd', 3, 0, -1)], pace: 'sneak' }],
      note: 'ceiling camera: strobes flash over a sea of dancers, one orange jacket threading against the current, hood up' },
    { dur: 6, label: 'ban-cong', cam: { k: 'shot', eye: at('cuong.head', 0.3, 0.05, 1.3), look: 'cuong.head', fov: 30 }, cues: [
      { k: 'place', who: 'cuong', at: 'set:moonlight-floor.balcony', pose: 'stand' }, { k: 'look', who: 'cuong', at: 'set:moonlight-floor.crowd', t: 0.4 },
      { k: 'look', who: 'cuong', at: 'set:moonlight-floor.kitchenDoor', t: 3 }, { k: 'expr', who: 'cuong', e: 'angry', t: 4 }],
      note: 'on the balcony Cường Sẹo slowly turns his head, searching' },
    { dur: 4, label: 'mat-dau', cam: { k: 'shot', eye: at('set:moonlight-floor.balcony', 0, 1.6, 0), look: 'set:moonlight-floor.crowd', fov: 42 }, cues: [
      { k: 'fx', kind: 'strobe', at: 'set:moonlight-floor.crowd' }, { k: 'letterbox', on: false, t: 3.6 }],
      note: 'his POV: the crowd closes over the spot; the orange jacket is gone' },
  ],
  handoff: { player: { at: 'set:moonlight-floor.kitchenDoor', vehicle: 'foot', space: 'moonlight-floor' }, camera: 'blend', ms: 500 },
};

// ---- c5-m3 · the courtyard behind the kitchen: the clip, replayed (14 s) --------------------------------------------
const clip: Scene = {
  id: 'c5m3-clip', mission: 'c5-m3', title: '@c5m3.cs.clip', kind: 'cutscene', seconds: 14, skippable: true,
  stage: { at: 'san-sau-pho-dem', radius: 15, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 23.95, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin' },
  shots: [
    { dur: 4, label: 'tho-doc', cam: { k: 'crane', from: at('san-sau-pho-dem.kitchen', -2, 5, -3), to: at('san-sau-pho-dem.kitchen', -1, 1.5, -2), look: 'tin.head', fov: [50, 40] }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'sfx', id: 'club-through-wall' },
      { k: 'place', who: 'tin', at: at('san-sau-pho-dem.kitchen', 0, 0, -0.8), pose: 'squat' }, { k: 'anim', who: 'tin', clip: 'tremble' }],
      note: 'gasping against the courtyard wall, the kitchen door swinging shut behind him' },
    { dur: 5, label: 'phat-lai', cam: { k: 'insert', target: 'tin.handR', fov: 18, dist: 0.3 }, cues: [{ k: 'phoneScreen', who: 'tin', text: '@c5m3.cs.clipScreen' }],
      note: 'he replays the clip on the burner (the cheap smartphone with the cracked screen, the button camera\'s card in it): Lực\'s face, clear, the envelope in his hand' },
    { dur: 5, label: 'ro-mat', cam: { k: 'shot', eye: at('tin.head', 0.25, 0, 0.8), look: 'tin.head', fov: 30 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c5m3.cs.clip1', { ch: 'inner', t: 0.6 }), { k: 'letterbox', on: false, t: 4.6 }] },
  ],
  handoff: { player: { at: 'san-sau-pho-dem.kitchen', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

export const CUTSCENES: Scene[] = [dream, vip, breathe, bag, plan, mirror, strobe, clip];
