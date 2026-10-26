import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Extra, Mark, Scene } from '../scene.ts';

/**
 * Chapter 10 cutscenes as data (schema and conventions: story/scene.ts). Lines are '@keys' of text/vi/ch10.ts (and a few
 * of chapters 1 and 3 on purpose: the guard's "Có ai trong này không?" of the CS01 cold open, Tín's "Ừ. Anh hứa." to
 * Mai, Ông Tư's "Không giết ai."); 'set:<space>.<anchor>' marks are the off-map anchors declared in content/ch10.ts
 * ANCHORS (and chapters 1 and 5). The bible's CS09–CS11 are split where play happens between their shots:
 * CS09 = cs09_dem_ram_mat_dien (the strip dies sign by sign: a power cue with a sweep) + cs09_dem_ram_thang_may (the
 * lift), CS11 = three parts around the "Còng tay" prompt (cs11_dem_toi_nam holds the scene QTEs "Lật người!" and
 * "Khóa cổ" as cues: the frame waits on each, its window in real seconds) and the street (part D). Slow motion only in
 * freezeWorld scenes (c10m2-co-ai, c10m3-quang, cs11_dem_toi_nam).
 * Safety: Quang is shot as the frame cuts to black and lies alive on the stairs, no wound shown; Cường's blows happen
 * in play, never staged; the rescued only take dignified poses (Mai, free, also stands, kneels to help and hugs);
 * drug packets never appear.
 */

const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; if?: Cond; t?: number; dur?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });
const extras = (template: string, count: number, area: Mark, size: [number, number], poses: string[]): Extra => ({ template, count, area, size, poses });
const bought: Cond = { k: 'flag', name: 'boughtMooncake' };
const notBought: Cond = { k: 'not', c: bought };
const reply = (eq: string): Cond => ({ k: 'flag', name: 'choice:traLoiQuang', eq });
/** Mai's lotus hairclip, taken from Phượng's secretary's desk in c8-m3 (content/ch08.ts gives the item). */
const hasClip: Cond = { k: 'item', id: 'kep-toc-mai' };
const B2 = (a: string) => `set:moonlight-b2.${a}`;
const FL = (a: string) => `set:moonlight-floor.${a}`;
/** The strip's power region (festival-blackout-heli.md §2.4), the same rect as content/ch10.ts STRIP_DARK. */
const STRIP_RECT = { minX: 58, maxX: 100, minZ: 30, maxZ: 80 };
/**
 * CS11's scene QTEs (escort-boss-qte.md §3.4 c10m3-roll, c10m3-choke): the frame holds on the cue while the prompt is open,
 * the window runs in real seconds, a miss rewinds to the shot label; the choke is the band rule and can never kill.
 */
export const QTES = {
  roll: { k: 'qte', id: 'c10m3-roll', kind: 'press', keys: ['E'], label: '@c10m3.qte.lat', window: 1.2, target: 1, onFail: 'loop', loop: 'nua-giay', anchor: { actor: 'cuong', joint: 'head' } },
  choke: {
    k: 'qte', id: 'c10m3-choke', kind: 'band', keys: ['E'], label: '@c10m3.qte.khoa', window: 30, target: 3, onFail: 'loop', loop: 'lat', lethal: false,
    count: ['@c10m3.dem1', '@c10m3.dem2', '@c10m3.dem3'], anchor: { actor: 'cuong', joint: 'head' },
  },
} satisfies Record<string, Cue>;

// ---- CS09 · Đêm Rằm mất điện (c10-m1, 29 s): the strip dies sign by sign, the lanterns stay lit ----------------------
const cs09: Scene = {
  id: 'cs09_dem_ram_mat_dien', mission: 'c10-m1', title: '@cs09.title', kind: 'cutscene', seconds: 29, skippable: true,
  stage: { at: 'pho-dem', radius: 60, crowd: 'keep', traffic: 'hold', police: 'pause', env: { hours: 22, weather: 'clear', freezeClock: true } },
  cast: {
    tin: 'tin', van: 'van', duaNho: 'dua-nho',
    crowd: extras('resident', 30, 'pho-dem', [40, 10], ['stand', 'phone-up']),
    kids: extras('lantern-kid', 12, 'moonlight.crowd', [14, 6], ['carry-lantern']),
  },
  shots: [
    { dur: 8, label: 'drone', cam: { k: 'move', from: at('pho-dem', -27, 40, 0), to: at('pho-dem', 23, 40, 0), look: ['moonlight.lion', 'bia-hoi'], fov: 55, ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'neon' }, { k: 'ambience', id: 'festival-street' }],
      note: 'drone at 40 m gliding along the strip (z 54) from x 50 to x 100: neon blazing, star lanterns strung across the street, the lion dance in front of Moonlight, the full moon over the river behind THÁP PHƯƠNG NAM; only the drums (tùng tùng cắc)' },
    { dur: 5, label: 'cau-dao', cam: { k: 'insert', target: 'mai-pho-dem.transformer', fov: 35, dist: 0.9 }, cues: [
      { k: 'place', who: 'tin', at: 'mai-pho-dem.transformer', pose: 'crouch' },
      say('van', 'cs09.van', { ch: 'radio', t: 0.3 }), say('tin', 'cs09.tin', { t: 2.6 })],
      note: 'Tín\'s gloved hand on the breaker of the transformer box; on "Cắt đi" he throws it' },
    { dur: 10, label: 'tat-dan', cam: { k: 'shot', eye: at('pho-dem', -4, 38, 30), look: 'spa', fov: 55 }, cues: [
      { k: 'power', t: 0.3, region: { id: 'strip', rect: STRIP_RECT, level: 0 }, sweep: { axis: 'x', dark: 1, from: 100, to: 58, step: 0.6 } },
      { k: 'sfx', id: 'breaker-thunk', t: 0.3 }, { k: 'sfx', id: 'bass-cut', t: 5.4 }],
      note: 'the power cue steps the strip region\'s sweep edge from x 100 to x 58 (festival-blackout-heli.md §2.4: one venue column every 0.6 s, a thunk per step): BIA HƠI HÀ NỘI and NHÀ NGHỈ HOA HỒNG, KARAOKE ÁNH SAO and SPA & MASSAGE, BAR NEON and VŨ TRƯỜNG MOONLIGHT die right to left with an electric thunk; the club bass cuts mid-beat at the Moonlight step; the paper star lanterns and the lion\'s eyes keep burning. The strip stays dark into the next shot; the mission\'s power op after the scene is the skip-safe steady state' },
    { dur: 6, label: 'dom-dom', cam: { k: 'shot', eye: at('moonlight.lion', -3.5, 1.1, 5), look: at('moonlight.lion', 0, 1.2, 0), fov: 75 }, cues: [
      { k: 'place', who: 'duaNho', at: at('moonlight.lion', -1.6, 0, 2.6), pose: 'carry-lantern' }, { k: 'anim', who: 'duaNho', clip: 'cheer', t: 0.4 },
      { k: 'sfx', id: 'cheer-kids', t: 0.4 }, say('duaNho', 'cs09.duaNho', { t: 1 }), { k: 'letterbox', on: false, t: 5.6 }],
      note: 'street level: the lanterns and the lion\'s glowing eyes in the dark, children cheering, hundreds of phone screens lighting up like fireflies (extras phone-up)' },
  ],
  handoff: { player: { at: 'mai-pho-dem.transformer', vehicle: 'foot', crouch: true }, camera: 'blend', ms: 600 },
  notes: 'Bible CS09 shots 1–4. Played on the roof right after the hold-E cut; the lift (shots 5–7) is cs09_dem_ram_thang_may.',
};

// ---- CS09 cont. · Xuống B2 (c10-m1, 16 s): the lift sinks under red emergency light -----------------------------------
const cs09b: Scene = {
  id: 'cs09_dem_ram_thang_may', mission: 'c10-m1', title: '@cs09.title2', kind: 'cutscene', seconds: 16, skippable: true,
  stage: { at: 'moonlight', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 22.2, weather: 'clear', freezeClock: true } },
  sets: ['moonlight-b2'],
  cast: { tin: 'tin' },
  shots: [
    { dur: 6, label: 'gieng', cam: { k: 'shot', eye: at(B2('liftShaft'), 0, 0.3, 0), look: at(B2('liftShaft'), 0, 14, 0.05), fov: 60 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'fx', kind: 'emergency-light', at: B2('liftShaft') },
      { k: 'ride', id: 'cabin', model: 'lift-cab', path: [at(B2('liftShaft'), 0, 14, 0), at(B2('liftShaft'), 0, 3, 0)], speed: 1.8 }, { k: 'sfx', id: 'lift-cable' }],
      note: 'the bottom of the shaft looking up: the cab sinks toward the camera under red emergency light' },
    { dur: 6, label: 'trong-thang', cam: { k: 'shot', eye: at('tin.head', 0.4, 0.05, 1.2), look: 'tin.head', fov: 45 }, cues: [
      { k: 'place', who: 'tin', at: B2('lift'), pose: 'stand' }, { k: 'prop', id: 'the', kind: 'keycard', attach: 'tin.handL' },
      { k: 'anim', who: 'tin', clip: 'touch-whistle', t: 0.4 },
      { k: 'prop', id: 'so-tang', kind: 'lift-display', at: at(B2('lift'), 0.5, 2.1, 0.6), text: '@cs09.tang1' },
      { k: 'prop', id: 'so-tang', kind: 'lift-display', at: at(B2('lift'), 0.5, 2.1, 0.6), text: '@cs09.tangB1', t: 1.8 },
      say('tin', 'cs09.tin2', { t: 2.4 }),
      { k: 'prop', id: 'so-tang', kind: 'lift-display', at: at(B2('lift'), 0.5, 2.1, 0.6), text: '@cs09.tangB2', t: 3.6 }],
      note: 'inside the cab: Tín touches Ông Tư\'s whistle and exhales, Quang\'s keycard in the other hand; the display ticks 1… B1… B2' },
    { dur: 4, label: 'cua-mo', cam: { k: 'shot', eye: at(B2('lift'), 0, 1.6, -0.4), look: B2('lotus'), fov: 55 }, cues: [
      { k: 'sfx', id: 'door-hiss' }, { k: 'ambience', id: 'generator-drone' }, { k: 'sfx', id: 'lion-drums-muffled', t: 0.8 },
      { k: 'prop', id: 'sen', kind: 'charcoal-lotus', at: B2('lotus') }, { k: 'letterbox', on: false, t: 3.6 }],
      note: 'the doors open on darkness and a generator\'s drone; a charcoal lotus on the opposite wall glows in the red light (the wall of the CS01 cold open)' },
  ],
  handoff: { player: { at: B2('lift'), vehicle: 'foot', crouch: true, space: 'moonlight-b2' }, camera: 'blend', ms: 500 },
};

// ---- c10-m2 · the cold open catches up: behind the frosted fish crates (18 s) -----------------------------------------
const coAi: Scene = {
  id: 'c10m2-co-ai', mission: 'c10-m2', title: '@c10m2.cs.title', kind: 'cutscene', seconds: 18, skippable: true,
  stage: { at: 'moonlight', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', freezeWorld: true, env: { hours: 22.3, weather: 'clear', freezeClock: true } },
  sets: ['moonlight-b2'],
  cast: { tin: 'tin', gac: 'gac-b2' },
  shots: [
    { dur: 5, label: 'tron', cam: { k: 'shot', eye: at('tin.head', 0.05, 0.02, 0.45), look: 'tin.head', fov: 18, handheld: 0.4 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'place', who: 'tin', at: B2('crates'), pose: 'squat' }, { k: 'expr', who: 'tin', e: 'worried' },
      { k: 'fx', kind: 'breath-fog', at: 'tin.head' }, { k: 'ambience', id: 'generator-drone' }, { k: 'sfx', id: 'compressor-hum' }, { k: 'sfx', id: 'lion-drums-muffled', t: 1 }],
      note: 'the very frame of CS01 shot 2, three weeks on: now the player knows where this is' },
    { dur: 5, label: 'den-pin', cam: { k: 'shot', eye: at(B2('aisle'), 0, 0.2, 0), look: B2('lotus'), fov: 70 }, cues: [
      { k: 'slowmo', scale: 0.4, seconds: 5 }, { k: 'prop', id: 'den-pin', kind: 'fake-flashlight', attach: 'gac.handR' },
      { k: 'walk', who: 'gac', path: [B2('door'), B2('aisle')], pace: 'walk' }, say('gac', 'cs01.gac', { t: 1.5 }),
      { k: 'prop', id: 'sen-than', kind: 'charcoal-lotus', at: B2('lotus') }],
      note: 'the beam sweeps right to left and lights the charcoal lotus for a moment, exactly as in the cold open' },
    { dur: 4, label: 'chuot', cam: { k: 'shot', eye: at(B2('crates'), 1.4, 0.6, 1.4), look: B2('aisle'), fov: 40 }, cues: [
      { k: 'walk', who: 'gac', path: [B2('aisle'), B2('door')], pace: 'walk' }, say('gac', 'c10m2.cs.gac2', { t: 0.5 })],
      note: 'he shrugs and walks back out; the beam leaves the crates' },
    { dur: 4, label: 'ba-tuan', cam: { k: 'shot', eye: at('tin.head', 0.25, 0, 0.7), look: 'tin.head', fov: 28 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c10m2.cs.tho', { ch: 'inner', t: 0.3 }), { k: 'letterbox', on: false, t: 3.6 }] },
  ],
  handoff: { player: { at: B2('crates'), vehicle: 'foot', crouch: true, space: 'moonlight-b2' }, camera: 'blend', ms: 500 },
};

// ---- CS10 · Đoàn tụ (c10-m2, 45 s): the second swoop, mirroring CS03 ------------------------------------------------
const cs10: Scene = {
  id: 'cs10_doan_tu', mission: 'c10-m2', title: '@cs10.title', kind: 'cutscene', seconds: 45, skippable: true,
  stage: { at: 'moonlight', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 22.5, weather: 'clear', freezeClock: true } },
  sets: ['moonlight-b2'],
  cast: {
    tin: 'tin', mai: 'mai', beNa: 'be-na', be2: 'tpl:captive-child',
    teens: extras('captive-teen', 7, B2('cell1'), [10, 3], ['sit-hug-knees', 'stand-head-down', 'hold-hands']),
    kids: extras('captive-child', 3, B2('cell2'), [6, 3], ['sit-hug-knees', 'hold-hands']),
    adults: extras('captive-adult', 4, B2('cell3'), [6, 3], ['sit', 'hold-hands']),
  },
  shots: [
    { dur: 8, label: 'hanh-lang', cam: { k: 'rail', points: [at(B2('corridor'), 0, 1.2, 0), at(B2('lotus2'), 0, 1.2, 1.2), at(B2('lotus3'), 0, 1.2, 1.2)],
      look: [B2('lotus1'), B2('lotus2'), B2('lotus3')], fov: [70, 70, 70], ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'fx', kind: 'emergency-light', at: B2('corridor') }, { k: 'ambience', id: 'generator-drone' },
      { k: 'prop', id: 'sen-1', kind: 'charcoal-lotus', at: B2('lotus1') }, { k: 'prop', id: 'sen-2', kind: 'charcoal-lotus', at: B2('lotus2'), variant: 'shaky' },
      { k: 'prop', id: 'sen-3', kind: 'charcoal-lotus', at: B2('lotus3'), variant: 'shakier' }, { k: 'prop', id: 'den-pin', kind: 'fake-flashlight', attach: 'tin.handR' },
      { k: 'walk', who: 'tin', path: [B2('corridor'), B2('lotus2'), B2('lotus3')], pace: 'sneak' }, { k: 'sfx', id: 'humming-girl', t: 2 }],
      note: 'steadicam at 1.2 m down the cell corridor following Tín\'s flashlight: a charcoal lotus at every corner, each a little shakier; a lullaby, far off' },
    { dur: 6, label: 'qua-song', cam: { k: 'move', from: at(B2('cellMai'), 0, 1.4, 1.5), to: at(B2('cellMai'), 0, 1.1, -1.2), look: 'mai.head', fov: 45, ease: 'inOutSine' }, cues: [
      { k: 'hide', mesh: 'moonlight-b2.cell4-bars' },
      { k: 'place', who: 'mai', at: at(B2('cellMai'), 0, 0, -2.4), pose: 'hum' }, { k: 'place', who: 'beNa', at: at(B2('cellMai'), -0.5, 0, -2.2), pose: 'sit' },
      { k: 'place', who: 'be2', at: at(B2('cellMai'), 0.5, 0, -2.2), pose: 'sit' }, say('mai', 'cs10.mai1', { t: 1.2 })],
      note: 'the camera glides through the bars (mesh hidden) into the small room: Mai in the corner, two little girls leaning on her lap, she strokes their hair and sings' },
    { dur: 4, label: 'anh-hai', cam: { k: 'shot', eye: at('mai.head', 0.3, 0, 1.4), look: 'mai.head', fov: 40 }, cues: [
      { k: 'sfx', id: 'door-chain', t: 0.2 }, { k: 'look', who: 'mai', at: 'tin.head', t: 0.8 }, { k: 'expr', who: 'mai', e: 'shock', t: 0.8 },
      say('mai', 'cs10.mai2', { t: 1.5 })],
      note: 'reverse: the lock turns, the flashlight beam falls on her; she lifts a hand against the light' },
    { dur: 8, label: 'cham-tran', cam: { k: 'twoShot', a: 'tin', b: 'mai', fov: 28 }, cues: [
      { k: 'music', id: 'theme-home', fade: 1 }, { k: 'place', who: 'tin', at: at(B2('cellMai'), 0, 0, -1.9), pose: 'squat' },
      { k: 'pair', clip: 'forehead-touch', a: 'tin', b: 'mai', t: 0.6 }, { k: 'expr', who: 'mai', e: 'cry', t: 0.6 },
      say('mai', 'cs10.mai3', { t: 1 }), say('tin', 'cs10.tin1', { t: 5.2 })],
      note: 'an đàn bầu note swells; Tín kneels and touches his forehead to hers' },
    { dur: 6, label: 'banh', cam: { k: 'twoShot', a: 'tin', b: 'mai', fov: 35 }, cues: [
      { k: 'expr', who: 'mai', e: 'smile' }, say('mai', 'cs10.mai4', { t: 0.6 }),
      say('tin', 'cs10.tin2', { t: 4, if: notBought }), say('tin', 'cs10.tin2b', { t: 4, if: bought }),
      { k: 'prop', id: 'banh', kind: 'mooncake', attach: 'tin.handR', t: 4, if: bought }],
      note: 'she laughs through her tears; if he bought the lotus-seed mooncake on the street, he holds it out, a little dented' },
    { dur: 8, label: 'co-giao', cam: { k: 'shot', eye: at('mai', 0.8, 0.4, 2), look: 'mai.head', fov: 55 }, cues: [
      { k: 'place', who: 'mai', at: at(B2('cellMai'), 0, 0, -1.6), pose: 'stand' }, { k: 'anim', who: 'mai', clip: 'wipe-tears', t: 0.5 },
      { k: 'look', who: 'mai', at: B2('cell1'), t: 1.6 }, say('mai', 'cs10.mai5', { t: 2 }), say('mai', 'cs10.mai6', { t: 5.2 })],
      note: 'low heroic angle: she stands, wipes her face and speaks to the girls in the next cells in the voice of the teacher she wants to be; Tín turns the master key in the three other doors as she speaks' },
    { dur: 5, label: 'nam-tay', cam: { k: 'move', from: at('tin.head', 0.2, 0, 0.8), to: at(B2('corridor'), 0, 2.2, 3), look: ['tin.head', B2('corridor')], fov: [40, 60], ease: 'outCubic' }, cues: [
      { k: 'expr', who: 'tin', e: 'smile' }, say('tin', 'cs10.tin3', { t: 0.5 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'his first smile since the funeral; the pull-back shows the line of joined hands in the corridor, the children in the middle' },
  ],
  handoff: { player: { at: B2('cellMai'), vehicle: 'foot', space: 'moonlight-b2' }, camera: 'blend', ms: 600 },
};

// ---- c10-m2 · the generator restarts: lights, the intercom, the alarm (18 s) -----------------------------------------
const mayPhat: Scene = {
  id: 'c10m2-may-phat', mission: 'c10-m2', title: '@c10m2.cs.mayPhat', kind: 'cutscene', seconds: 18, skippable: true,
  stage: { at: 'moonlight', radius: 20, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 22.7, weather: 'clear', freezeClock: true } },
  sets: ['moonlight-b2'],
  cast: { tin: 'tin', mai: 'mai', beNa: 'be-na', cuong: 'cuong', line: extras('captive-teen', 6, at(B2('stairs'), 0, 0, 4), [3, 6], ['hold-hands', 'walk-led']) },
  shots: [
    { dur: 4, label: 'chan-thang', cam: { k: 'shot', eye: at(B2('stairs'), 1.5, 1.5, 2.5), look: B2('stairs'), fov: 50 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'fx', kind: 'emergency-light', at: B2('stairs') },
      { k: 'place', who: 'tin', at: B2('stairs'), pose: 'stand' }, { k: 'place', who: 'mai', at: at(B2('stairs'), 0.8, 0, 1.2), pose: 'hold-hands' },
      { k: 'place', who: 'beNa', at: at(B2('stairs'), 1.3, 0, 1.5), pose: 'hold-hands' }],
      note: 'the foot of the staff stairs, the line of joined hands behind Tín' },
    { dur: 4, label: 'may-phat', cam: { k: 'shot', eye: at(B2('generator'), 2, 1.6, 2), look: B2('generator'), fov: 45 }, cues: [
      { k: 'sfx', id: 'generator-start', t: 0.2 }, { k: 'fx', kind: 'lights-on', at: B2('coldRoom'), t: 1 }, { k: 'grade', id: 'cold', t: 1.2 },
      say('beNa', 'c10m2.cs.beNa', { t: 1.8 })],
      note: 'the backup generator of the lights coughs into life (the drone so far was the freezers\' own); the tube lights snap on one by one, white and cold' },
    { dur: 5, label: 'loa', cam: { k: 'insert', target: B2('intercom'), fov: 30, dist: 0.6 }, cues: [
      { k: 'sfx', id: 'intercom-crackle', t: 0.2 }, say('cuong', 'c10m2.cs.cuong1', { ch: 'radio', t: 0.6 })] },
    { dur: 5, label: 'bao-dong', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 0.9), look: 'tin.head', fov: 32 }, cues: [
      say('cuong', 'c10m2.cs.cuong2', { ch: 'radio', t: 0.3 }), { k: 'sfx', id: 'alarm-klaxon', t: 2 }, { k: 'fx', kind: 'alarm-light', at: B2('stairs'), t: 2 },
      { k: 'expr', who: 'tin', e: 'determined', t: 2.4 }, { k: 'letterbox', on: false, t: 4.6 }],
      note: 'the alarm: the play moves up the stairs into c10-m3' },
  ],
  handoff: { player: { at: B2('stairs'), vehicle: 'foot', space: 'moonlight-b2' }, camera: 'blend', ms: 500 },
};

// ---- c10-m3 · Quang (37 s): the bullet meant for Mai --------------------------------------------------------------
const quang: Scene = {
  id: 'c10m3-quang', mission: 'c10-m3', title: '@c10m3.cs.quang', kind: 'cutscene', seconds: 37, skippable: true,
  stage: { at: 'moonlight', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', freezeWorld: true, env: { hours: 22.8, weather: 'clear', freezeClock: true } },
  sets: ['moonlight-floor'],
  cast: {
    tin: 'tin', mai: 'mai', quang: 'quang', cuong: 'cuong', van: 'van',
    men: extras('ran-den', 5, FL('front'), [6, 2], ['stand']),
    line: extras('captive-teen', 8, at(FL('floor'), -3, 0, 2), [6, 3], ['hold-hands', 'walk-led']),
  },
  shots: [
    { dur: 4, label: 'chan-cua', cam: { k: 'shot', eye: at(FL('floor'), 0, 1.6, 4), look: FL('front'), fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'fx', kind: 'emergency-light', at: FL('floor') }, { k: 'fx', kind: 'strobe', at: FL('floor') },
      { k: 'place', who: 'cuong', at: at(FL('front'), 0, 0, -2), pose: 'stand' }, { k: 'place', who: 'tin', at: FL('floor'), pose: 'stand' },
      { k: 'place', who: 'mai', at: at(FL('floor'), -1, 0, 1), pose: 'hold-hands' }, say('cuong', 'c10m3.cs.q1', { t: 1 })],
      note: 'the empty, half-lit floor, strobes glitching; Cường and five men block the front doors' },
    { dur: 4.5, label: 'sung', cam: { k: 'ots', speaker: 'cuong', listener: 'tin', side: 'right', fov: 40 }, cues: [
      { k: 'prop', id: 'sung', kind: 'pistol', attach: 'cuong.handR' }, { k: 'anim', who: 'cuong', clip: 'aim-pistol', t: 0.5 },
      say('cuong', 'c10m3.cs.q2', { t: 1 })],
      note: 'he raises a pistol past Tín, toward the girl with the braid at the front of the line' },
    { dur: 2.5, label: 'ban-cong', cam: { k: 'shot', eye: at('quang.head', 0.2, -0.3, 1.5), look: 'quang.head', fov: 35 }, cues: [
      { k: 'place', who: 'quang', at: FL('balcony'), pose: 'stand' }, { k: 'expr', who: 'quang', e: 'angry' }, say('quang', 'c10m3.cs.q3', { t: 0.3 })],
      note: 'on the VIP balcony: Quang, face bruised, his right arm in a cast' },
    { dur: 5, label: 'lao-xuong', cam: { k: 'move', from: at(FL('balcony'), 3, 1, 4), to: at(FL('staffStairs'), 3, 1.2, 3), look: ['quang', FL('staffStairs')], fov: 50 }, cues: [
      { k: 'slowmo', scale: 0.3, seconds: 5 }, { k: 'anim', who: 'quang', clip: 'leap-down' },
      { k: 'walk', who: 'quang', path: [FL('balcony'), FL('staffStairs')], pace: 'run' },
      { k: 'place', who: 'mai', at: FL('staffStairs'), pose: 'shield-younger' }, { k: 'sfx', id: 'gunshot-echo', t: 4.4 }],
      note: 'slow motion: he vaults the rail and drops between the pistol and Mai; the shot rings out as the frame cuts (no impact shown)' },
    { dur: 1, label: 'den', cam: { k: 'black' } },
    { dur: 5.5, label: 'quang-nam', cam: { k: 'twoShot', a: 'tin', b: 'quang', fov: 32 }, cues: [
      { k: 'place', who: 'quang', at: FL('staffStairs'), pose: 'lie-flat' }, { k: 'place', who: 'tin', at: at(FL('staffStairs'), 0.5, 0, 0.3), pose: 'squat' },
      { k: 'pair', clip: 'cradle', a: 'tin', b: 'quang' }, { k: 'expr', who: 'quang', e: 'pain' }, say('quang', 'c10m3.cs.q4', { t: 1 })],
      note: 'Quang on the steps, alive; Tín holds his head off the step; Quang grins crookedly (no wound shown)' },
    { dur: 4, label: 'van-toi', cam: { k: 'shot', eye: at(FL('sideDoor'), 2, 1.6, 2), look: 'van.head', fov: 40 }, cues: [
      { k: 'walk', who: 'van', path: [FL('sideDoor'), at(FL('sideDoor'), 2, 0, 1.5)], pace: 'run' }, { k: 'prop', id: 'sung-van', kind: 'pistol', attach: 'van.handR' },
      say('van', 'c10m3.cs.q5', { t: 0.8 })],
      note: 'Vân bursts in through the side door, her pistol on Cường; the five men dive behind the tables' },
    { dur: 5, label: 'de-chat', cam: { k: 'shot', eye: at('mai.head', 0.4, 0.1, 1.2), look: 'mai.head', fov: 38 }, cues: [
      { k: 'place', who: 'mai', at: at(FL('staffStairs'), -0.5, 0, 0.3), pose: 'squat' }, { k: 'prop', id: 'ao-len', kind: 'folded-cardigan', attach: 'mai.handR' },
      say('van', 'c10m3.cs.q6', { t: 0.2 }), say('tin', 'c10m3.cs.q7', { t: 2.4 })],
      note: 'Mai kneels by Quang and presses her folded cardigan to his side, steady' },
    { dur: 5.5, label: 'nem-sung', cam: { k: 'shot', eye: at('cuong.head', 0.3, 0, 1.6), look: 'cuong.head', fov: 35 }, cues: [
      { k: 'anim', who: 'cuong', clip: 'toss-away', t: 0.3 }, { k: 'prop', id: 'sung', kind: 'pistol', remove: true, t: 0.6 }, { k: 'sfx', id: 'pistol-clatter', t: 0.7 },
      { k: 'anim', who: 'cuong', clip: 'crack-wrists', t: 1.4 }, { k: 'expr', who: 'cuong', e: 'cold-smile', t: 1.4 }, say('cuong', 'c10m3.cs.q8', { t: 1.5 }),
      { k: 'letterbox', on: false, t: 5.1 }],
      note: 'with Vân\'s gun on him he smiles, tosses his pistol away (it slides under the bar: the one that later lies by Tín\'s hand) and cracks his wrists; the duel is fists only' },
  ],
  handoff: { player: { at: FL('floor'), vehicle: 'foot', space: 'moonlight-floor' }, camera: 'blend', ms: 500 },
};

// ---- CS11 · Đếm tới năm (c10-m3, 32 s): the pin, Mai's scream, the half-second, "Lật người!", the count, the pistol --
const cs11: Scene = {
  id: 'cs11_dem_toi_nam', mission: 'c10-m3', title: '@cs11.title', kind: 'cutscene', seconds: 32, skippable: true,
  stage: { at: 'moonlight', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', freezeWorld: true, env: { hours: 23, weather: 'clear', freezeClock: true } },
  sets: ['moonlight-floor'],
  cast: { tin: 'tin', cuong: 'cuong', mai: 'mai', beNa: 'be-na', be2: 'tpl:captive-child', van: 'van', tu: 'tu' },
  shots: [
    { dur: 5, label: 'ghim', cam: { k: 'shot', eye: at(FL('floor'), 0.8, 0.15, 1.2), look: 'cuong.head', fov: 75 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'fx', kind: 'emergency-light', at: FL('floor') },
      { k: 'place', who: 'tin', at: FL('floor'), pose: 'lie-flat' }, { k: 'place', who: 'cuong', at: at(FL('floor'), 0.3, 0, 0.2), pose: 'crouch' },
      { k: 'pair', clip: 'pin-down', a: 'cuong', b: 'tin' }, { k: 'prop', id: 'chai', kind: 'broken-bottle', attach: 'cuong.handR' },
      { k: 'anim', who: 'cuong', clip: 'raise-bottle', t: 0.8 }, say('cuong', 'cs11.cuong1', { t: 1.4 })],
      note: 'floor-level low angle, strobes dead, red emergency light: Cường has Tín pinned and raises a broken bottle (no strike)' },
    { dur: 4, label: 'tieng-het', cam: { k: 'shot', eye: at('mai.head', 0.3, 0, 1.6), look: 'mai.head', fov: 45 }, cues: [
      { k: 'place', who: 'mai', at: FL('staffStairs'), pose: 'shield-younger' }, { k: 'place', who: 'beNa', at: at(FL('staffStairs'), -0.5, 0, 0.4), pose: 'sit-hug-knees' },
      { k: 'place', who: 'be2', at: at(FL('staffStairs'), 0.5, 0, 0.4), pose: 'sit-hug-knees' }, say('mai', 'cs11.mai1', { t: 0.3 })],
      note: 'on the staff stairs Mai, holding two children back, screams at him' },
    { dur: 4, label: 'nua-giay', cam: { k: 'shot', eye: at('cuong.head', 0, 0.05, 0.35), look: 'cuong.head', fov: 15 }, cues: [
      { k: 'slowmo', scale: 0.25, seconds: 4 }, { k: 'expr', who: 'cuong', e: 'shock' }, { k: 'sfx', id: 'heartbeat' }, { ...QTES.roll, t: 3.4 }],
      note: 'extreme close-up on his eyes: he hesitates for half a second. The frame holds on "Lật người!" (scene QTE, real seconds); a miss replays the half-second' },
    { dur: 5, label: 'lat', cam: { k: 'twoShot', a: 'tin', b: 'cuong', fov: 35 }, cues: [
      { k: 'place', who: 'tin', at: FL('floor'), pose: 'sit' }, { k: 'place', who: 'cuong', at: at(FL('floor'), 0.4, 0, 0.3), pose: 'sit' },
      { k: 'pair', clip: 'chokehold', a: 'tin', b: 'cuong' }, { ...QTES.choke, t: 0.6 }],
      note: 'bible CS11 shot 4: Tín rolls him over and locks the chokehold; the band QTE counts "Một… hai… ba…" on the frame (it cannot kill)' },
    { dur: 5, label: 'ngu', cam: { k: 'move', from: at('tin.head', 0.5, 0, 1.2), to: at('tin.head', 0.35, 0, 0.85), look: 'tin.head', fov: 35, ease: 'inOutSine' }, cues: [
      say('tin', 'cs11.tin1', { t: 0.4 }), say('tu', 'c3m3.cs.tu19', { ch: 'inner', t: 2.8 }),
      { k: 'place', who: 'cuong', at: at(FL('floor'), 0.4, 0, 0.3), pose: 'lie-flat', t: 3.6 }],
      note: 'slow push-in: the count ends, his struggling slows and he goes limp, breathing; Ông Tư\'s rule in Tín\'s head (voice only)' },
    { dur: 6, label: 'khau-sung', cam: { k: 'insert', target: 'prop:sung', fov: 30, dist: 0.9 }, cues: [
      { k: 'prop', id: 'sung', kind: 'pistol', at: at(FL('floor'), -0.6, 0, 0.5) }, { k: 'look', who: 'tin', at: 'prop:sung', t: 0.5 },
      { k: 'prop', id: 'cong', kind: 'plastic-cuffs', at: at(FL('floor'), -0.3, 0, 0.7), t: 3.2 }, { k: 'sfx', id: 'cuffs-drop', t: 3.2 },
      say('van', 'cs11.van1', { t: 4 })],
      note: 'the pistol Cường tossed away lies beside Tín\'s hand. He looks at it. A pair of plastic cuffs lands next to it' },
    { dur: 3, label: 'chon', cam: { k: 'shot', eye: at('tin.head', 0.25, 0, 0.75), look: 'tin.head', fov: 28 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined', t: 0.3 }, { k: 'look', who: 'tin', at: 'van', t: 1.2 }, { k: 'letterbox', on: false, t: 2.6 }],
      note: 'the only prompt that follows is "Còng tay"; the pistol is a prop, never a pickup' },
  ],
  handoff: { player: { at: FL('floor'), vehicle: 'foot', space: 'moonlight-floor' }, camera: 'blend', ms: 400 },
};

// ---- CS11 part C (8 s): the cuffs ---------------------------------------------------------------------------------
const cs11c: Scene = {
  id: 'cs11_dem_toi_nam_c', mission: 'c10-m3', title: '@cs11.titleC', kind: 'cutscene', seconds: 8, skippable: true,
  stage: { at: 'moonlight', radius: 25, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 23, weather: 'clear', freezeClock: true } },
  sets: ['moonlight-floor'],
  cast: { tin: 'tin', cuong: 'cuong', men: extras('ran-den', 5, FL('front'), [6, 2], ['hands-up']) },
  shots: [
    { dur: 6, label: 'cong', cam: { k: 'shot', eye: at('tin.head', 1.2, 0.1, 1.8), look: 'tin.head', fov: 40 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'place', who: 'tin', at: FL('floor'), pose: 'squat' },
      { k: 'place', who: 'cuong', at: at(FL('floor'), 0.4, 0, 0.3), pose: 'lie-flat' }, { k: 'pair', clip: 'cuff-wrists', a: 'tin', b: 'cuong', t: 0.4 },
      say('tin', 'cs11.tin2', { t: 1 })],
      note: 'Tín cuffs Cường\'s wrists behind his back' },
    { dur: 2, label: 'gio-tay', cam: { k: 'shot', eye: at(FL('floor'), 0, 2.4, 5), look: FL('front'), fov: 50 }, cues: [{ k: 'letterbox', on: false, t: 1.6 }],
      note: 'behind the tables the five men still hold their hands up (they gave up when Cường went limp); Vân\'s gun on them' },
  ],
  handoff: { player: { at: FL('floor'), vehicle: 'foot', space: 'moonlight-floor' }, camera: 'blend', ms: 400 },
};

// ---- CS11 part D (22 s): the doors open onto the lantern-lit street -------------------------------------------------
const cs11d: Scene = {
  id: 'cs11_dem_toi_nam_d', mission: 'c10-m3', title: '@cs11.titleD', kind: 'cutscene', seconds: 22, skippable: true,
  stage: { at: 'pho-dem', radius: 40, crowd: 'keep', traffic: 'hold', police: 'pause', env: { hours: 23.1, weather: 'clear', freezeClock: true } },
  cast: {
    tin: 'tin', mai: 'mai', coba: 'coba', basau: 'basau', thay: 'thay-minh-tinh',
    neighbours: extras('resident', 24, 'moonlight.crowd', [16, 6], ['stand', 'phone-up']),
    hoVang: extras('ho-vang', 6, at('moonlight.crowd', 7, 0, 1), [6, 3], ['stand']),
    teens: extras('captive-teen', 7, at('moonlight', 0, 0, 3), [6, 4], ['walk-led', 'hold-hands']),
    kids: extras('captive-child', 4, at('moonlight', 1.5, 0, 4), [4, 3], ['hold-hands']),
    adults: extras('captive-adult', 4, at('moonlight', -1.5, 0, 4), [4, 3], ['walk-led']),
  },
  shots: [
    { dur: 11, label: 'cau-truc', cam: { k: 'crane', from: at('moonlight.crowd', 0, 3, 6), to: at('moonlight.crowd', 0, 15, 12), look: 'moonlight', fov: 60 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'music', id: 'theme-home', fade: 2 },
      { k: 'place', who: 'coba', at: at('moonlight.crowd', -1.5, 0, -1), pose: 'stand' }, { k: 'prop', id: 'mem', kind: 'blanket', attach: 'coba.handR' },
      { k: 'place', who: 'basau', at: at('moonlight.crowd', -2.6, 0, -0.6), pose: 'stand' }, { k: 'prop', id: 'banh', kind: 'mooncake', attach: 'basau.handR' },
      { k: 'place', who: 'thay', at: at('moonlight.crowd', 1.4, 0, -1), pose: 'stand' }, say('coba', 'cs11.coba1', { t: 7 })],
      note: 'from the street, crane up from 3 m to 15 m: Moonlight\'s doors swing open onto the lantern-lit street; the rescued step out, squinting; Cô Ba, the abbot, Bà Sáu, Tám Hổ\'s men and the neighbours wait with blankets, warm water and mooncakes. Nobody speaks but Cô Ba' },
    { dur: 6, label: 'om', cam: { k: 'twoShot', a: 'mai', b: 'tin', fov: 35 }, cues: [
      { k: 'place', who: 'tin', at: at('moonlight', 0, 0, 5), pose: 'stand' }, { k: 'place', who: 'mai', at: at('moonlight', 0.4, 0, 5.3), pose: 'stand' },
      { k: 'pair', clip: 'hug', a: 'mai', b: 'tin' }, { k: 'expr', who: 'mai', e: 'cry' }, { k: 'expr', who: 'tin', e: 'eyes-closed', t: 2 }],
      note: 'Mai holds Tín tight' },
    { dur: 5, label: 'mem-am', cam: { k: 'shot', eye: at('moonlight.crowd', 6, 2, 6), look: at('moonlight.crowd', 0, 1, 0), fov: 50 }, cues: [{ k: 'letterbox', on: false, t: 4.6 }],
      note: 'blankets go round the children\'s shoulders; Tám Hổ\'s men hand out cups of warm water; the counter ĐÃ CỨU: 28 follows in play' },
  ],
  handoff: { player: { at: 'moonlight.crowd', vehicle: 'foot' }, camera: 'blend', ms: 600 },
};

// ---- c10-m4 · the ambulance: Quang's whisper, the red string, the hairclip (35 s) --------------------------------------
const xeCapCuu: Scene = {
  id: 'c10m4-xe-cap-cuu', mission: 'c10-m4', title: '@c10m4.cs.title', kind: 'cutscene', seconds: 35, skippable: true,
  stage: { at: 'moonlight.ambulance', radius: 20, crowd: 'keep', traffic: 'hold', police: 'pause', env: { hours: 23.7, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', mai: 'mai', quang: 'quang', capCuu: 'cap-cuu' },
  shots: [
    { dur: 5, label: 'bang-ca', cam: { k: 'shot', eye: at('vehicle:cap-cuu', -1.6, 1.4, -5), look: 'quang.head', fov: 40 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'prop', id: 'cang', kind: 'stretcher', at: at('vehicle:cap-cuu', 0, 0, -3.4) }, { k: 'place', who: 'quang', at: at('vehicle:cap-cuu', 0, 0.7, -3.4), pose: 'lie-flat' },
      { k: 'place', who: 'capCuu', at: at('vehicle:cap-cuu', 0.8, 0, -3.6), pose: 'stand' }, { k: 'place', who: 'tin', at: at('vehicle:cap-cuu', -0.8, 0, -3.6), pose: 'stand' },
      { k: 'place', who: 'mai', at: at('vehicle:cap-cuu', -1.4, 0, -4), pose: 'stand' }, say('capCuu', 'c10m4.cs.capCuu', { t: 0.6 })],
      note: 'the ambulance\'s rear doors open; Quang on the stretcher with an oxygen mask pushed down, his arm still in the cast' },
    { dur: 7, label: 'thi-tham', cam: { k: 'twoShot', a: 'quang', b: 'tin', fov: 30 }, cues: [
      { k: 'pair', clip: 'hand-on-shoulder', a: 'tin', b: 'quang', if: reply('nam') },
      say('quang', 'c10m4.cs.q1a', { t: 0.5, if: reply('hen') }), say('quang', 'c10m4.cs.q1b', { t: 0.5, if: reply('tha') }), say('quang', 'c10m4.cs.q1c', { t: 0.5, if: reply('nam') }),
      say('quang', 'c10m4.cs.q2', { t: 4.2 })],
      note: 'his whisper answers what Tín said (or the hand he held)' },
    { dur: 8, label: 'chi-do', cam: { k: 'insert', target: 'tin.handL', fov: 22, dist: 0.4 }, cues: [
      { k: 'pair', clip: 'tie-bracelet', a: 'mai', b: 'tin', t: 0.4 }, say('mai', 'c10m4.cs.mai1', { t: 0.8 }),
      { k: 'prop', id: 'chi-do', kind: 'lotus-bracelet', attach: 'tin.handL', t: 1 }, say('mai', 'c10m4.cs.mai2', { t: 4.2 })],
      note: 'Mai re-ties the red lotus-seed string on his wrist (it snapped in the fight), as Má did at the stilt house' },
    { dur: 5, label: 'kep-toc', cam: { k: 'shot', eye: at('mai.head', 0.35, 0.05, 1.1), look: 'mai.head', fov: 30 }, cues: [
      { k: 'prop', id: 'kep', kind: 'lotus-hairclip', attach: 'tin.handR', if: hasClip }, say('tin', 'c10m4.cs.kep', { t: 0.5, if: hasClip }),
      { k: 'prop', id: 'kep', kind: 'lotus-hairclip', attach: 'mai.head', t: 2.4, if: hasClip }, { k: 'expr', who: 'mai', e: 'smile', t: 2.8 }],
      note: 'the mirror of the red string: he clips the lotus hairclip from Phượng\'s desk (c8-m3) back into her braid; she touches it and smiles' },
    { dur: 6, label: 'hua', cam: { k: 'ots', speaker: 'mai', listener: 'tin', side: 'left', fov: 38 }, cues: [
      say('mai', 'c10m4.cs.mai3', { t: 0.4, if: notBought }), say('mai', 'c10m4.cs.mai3b', { t: 0.4, if: bought }),
      { k: 'prop', id: 'banh', kind: 'mooncake', attach: 'mai.handR', if: bought }, say('tin', 'cs01.tin1', { t: 4.9 })],
      note: 'the promise of the first morning, kept and made again' },
    { dur: 4, label: 'cua-dong', cam: { k: 'shot', eye: at('vehicle:cap-cuu', -3, 1.6, -9), look: 'vehicle:cap-cuu', fov: 45 }, cues: [
      { k: 'sfx', id: 'siren-far', t: 0.8 }, { k: 'letterbox', on: false, t: 3.6 }],
      note: 'the doors close on Quang; the ambulance pulls away into the lanterns (in play right after)' },
  ],
  handoff: { player: { at: { at: 'moonlight.ambulance', off: [0, 0, 2.2] }, vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

export const CUTSCENES: Scene[] = [cs09, cs09b, coAi, cs10, mayPhat, quang, cs11, cs11c, cs11d, xeCapCuu];
