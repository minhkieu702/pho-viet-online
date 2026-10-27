import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Mark, Scene } from '../scene.ts';

/**
 * Chapter 11 cutscenes as data (schema and conventions: story/scene.ts). Lines are '@keys' of text/vi/ch11.ts;
 * 'set:<space>.<anchor>' marks are anchors of content/ch01.ts (village-tan-thuan), content/ch03.ts (cong-an-office)
 * and content/ch11.ts ANCHORS (courtroom, airport-lounge, cong-an-office.honor); 'ch11.*' marks are the chapter's
 * places; 'vehicle:<id>' marks are story vehicles the scene's mission spawns (the truck, the two helicopters);
 * 'ride:<id>' marks are ride cues of the same scene (a ride cue with a story vehicle's id moves that vehicle: the CS12
 * lurch). The cab fight's "Gạt súng!" / "Giành tay lái!" and CS12's "Giữ tay!" / "Kéo lên!" are scene QTEs (scene.ts
 * cue 'qte', escort-boss-qte.md §3.4 context 'scene'): the frame holds on the cue, a miss rewinds to its shot. CS12
 * (story-final.md cs12_giao_tan_tay, 70 s) is three short scenes: cs12_giao_tan_tay (ends on the catch and "Giữ tay!"),
 * cs12_giao_tan_tay_trao (the wrists, "Kéo lên!", the handover), cs12_binh_minh.
 * Safety: nobody is struck on screen and no shot is fired on screen (the cab fight and the rescue are QTEs, the
 * pistols are props); Lực is "dazed, a bruise at the temple", never bloodied; the twelve in the truck and Su keep
 * dignified poses only and are never animated with a clip; the empty truck slides into the river after the twelve are
 * out; the helicopters never crash; the moon is full and the lanterns float on the river (no sky lanterns).
 */

const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; if?: Cond; t?: number; dur?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });
/** The LƯƠNG TÂM tier, as content/ch11.ts reads it: a clean record, no kill but an innocent hurt, a kill. */
const noKills: Cond = { k: 'stat', name: 'kills', op: '==', value: 0, scope: 'campaign' };
const clean: Cond = { k: 'conscience', is: 'clean' };
const hurtOnly: Cond = { k: 'all', of: [noKills, { k: 'not', c: clean }] };
const killed: Cond = { k: 'not', c: noKills };
const TRUCK = 'vehicle:xe-lanh', PAD = 'san-thuong-tai-chinh.pad', EDGE = 'san-thuong-tai-chinh.edge', STAIRS = 'san-thuong-tai-chinh.stairs';
const RAIL = 'lan-can-bach-dang', CAB = 'lan-can-bach-dang.cab';

// ---- c11-m1 · the leap from the Dream onto the truck's rear ladder (20 s, slow motion) -------------------------------
const nhay: Scene = {
  id: 'c11m1-nhay', mission: 'c11-m1', title: '@c11m1.cs.nhay', kind: 'cutscene', seconds: 20, skippable: true,
  stage: { at: TRUCK, radius: 40, crowd: 'keep', traffic: 'hold', police: 'pause', freezeWorld: true, env: { hours: 23.9, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', tu: 'tu' },
  shots: [
    { dur: 5, label: 'tren-yen', cam: { k: 'follow', target: 'tin', offset: [-2.2, 1.0, -3.5], fov: 55, lag: 0.2 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'ambience', id: 'festival-street' }, { k: 'slowmo', scale: 0.35, seconds: 12 },
      { k: 'ride', id: 'dream-cs', model: 'dream', path: [at(TRUCK, -1.6, 0, -0.5), at(TRUCK, -1.6, 0, 9)], speed: 15, driver: 'tin' },
      say('tu', 'c11m1.cs.nhay1', { ch: 'inner', t: 1.5 })],
      note: 'alongside the reefer truck at speed under the full moon; lantern strings flick overhead; the rear ladder a metre away; Ông Tư\'s voice from the dawn he gave back the bike (c5-m1)' },
    { dur: 4, label: 'dung-day', cam: { k: 'shot', eye: at(TRUCK, -3.5, 0.4, -2), look: 'tin.head', fov: 40 }, cues: [
      { k: 'place', who: 'tin', at: at('ride:dream-cs', 0, 1.1, 0), pose: 'stand' }, { k: 'expr', who: 'tin', e: 'determined' },
      say('tin', 'c11m1.cs.nhay2', { t: 1.2 })],
      note: 'he stands up on the seat of the bike Ông Tư rebuilt' },
    { dur: 4, label: 'nhay', cam: { k: 'move', from: at(TRUCK, -4, 1.5, -6), to: at(TRUCK, -3, 2.2, -3), look: 'tin', fov: 50, ease: 'inOutSine' }, cues: [
      { k: 'anim', who: 'tin', clip: 'leap' }, { k: 'sfx', id: 'wind-howl' }] },
    { dur: 3, label: 'xe-truot', cam: { k: 'shot', eye: at(TRUCK, -2, 1.2, -9), look: 'ride:dream-cs', fov: 45 }, cues: [
      { k: 'fx', kind: 'sparks', at: 'ride:dream-cs' }, { k: 'sfx', id: 'tire-screech' }],
      note: 'the empty Dream skids away in sparks; nobody else is on it' },
    { dur: 4, label: 'leo', cam: { k: 'follow', target: 'tin', offset: [-1.5, 1.2, -2.5], fov: 50 }, cues: [
      { k: 'place', who: 'tin', at: at(TRUCK, -1.3, 1.8, -3), pose: 'stand' }, { k: 'anim', who: 'tin', clip: 'climb-ladder' }, { k: 'letterbox', on: false, t: 3.6 }],
      note: 'he climbs along the box in the whipping wind toward the cab' },
  ],
};

// ---- c11-m1 · the cab: the window, Lực draws, "Gạt súng!", "Giành tay lái!" (15 s; scene QTEs, escort-boss-qte.md §3.4) --
const caBin: Scene = {
  id: 'c11m1-ca-bin', mission: 'c11-m1', title: '@c11m1.cs.caBin', kind: 'cutscene', seconds: 15, skippable: true,
  stage: { at: TRUCK, radius: 30, crowd: 'keep', traffic: 'hold', police: 'pause', env: { hours: 23.9, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', luc: 'luc' },
  shots: [
    { dur: 3, label: 'kinh', cam: { k: 'shot', eye: at(TRUCK, -2.6, 2.2, 3.2), look: at(TRUCK, -1.1, 1.9, 3.4), fov: 40 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'place', who: 'tin', at: at(TRUCK, -1.5, 1.9, 2.9), pose: 'crouch' }, { k: 'anim', who: 'tin', clip: 'smash-window', t: 0.6 },
      { k: 'fx', kind: 'glass-rain', at: at(TRUCK, -1.1, 1.9, 3.4), t: 0.8 }, { k: 'sfx', id: 'glass-smash', t: 0.8 }] },
    { dur: 5, label: 'luc', cam: { k: 'twoShot', a: 'luc', b: 'tin', fov: 38 }, cues: [
      { k: 'place', who: 'luc', at: at(TRUCK, -0.5, 1.5, 3.4), pose: 'sit' }, { k: 'expr', who: 'luc', e: 'angry' },
      { k: 'anim', who: 'luc', clip: 'draw-pistol', t: 0.8 }, { k: 'prop', id: 'sung-luc', kind: 'pistol', attach: 'luc.handR', t: 1 },
      say('luc', 'c11m1.cs.cb1', { t: 1.4 })],
      note: 'Lực steers with one hand and draws with the other; the kind-uncle smile is gone' },
    { dur: 3, label: 'sung', cam: { k: 'insert', target: 'prop:sung-luc', fov: 22, dist: 0.6 }, cues: [
      { k: 'qte', t: 0.5, id: 'c11m1-gun', kind: 'press', keys: ['F'], label: '@c11m1.qte.sung', window: 0.9, target: 1, onFail: 'loop', loop: 'luc', anchor: { actor: 'luc', joint: 'handR' } }],
      note: 'the muzzle comes up; the frame holds on "Gạt súng!" (a miss rewinds to Lực drawing)' },
    { dur: 4, label: 'tay-lai', cam: { k: 'twoShot', a: 'tin', b: 'luc', fov: 36 }, cues: [
      { k: 'prop', id: 'sung-luc', kind: 'pistol', at: at(TRUCK, -0.6, 0.9, 3.3) }, { k: 'place', who: 'tin', at: at(TRUCK, -0.9, 1.6, 3.2), pose: 'sit' },
      { k: 'qte', t: 0.6, id: 'c11m1-wheel', kind: 'alternate', keys: ['A', 'D'], label: '@c11m1.qte.tayLai', window: 4, target: 8, onFail: 'loop', loop: 'tay-lai', anchor: { actor: 'luc', joint: 'head' } }],
      note: 'the pistol knocked into the footwell, Tín half through the window with both hands on the wheel against Lực\'s: "Giành tay lái!"; the railing scene picks up on the wheel' },
  ],
  // a skip (or the end) leaves Tín on foot by the stopped cab; the railing scene follows at once and hands him the promenade
  handoff: { player: { at: at(TRUCK, -1.6, 0, 3), yaw: Math.PI, vehicle: 'foot' }, camera: 'cut' },
};

// ---- c11-m1 · through the railing; the cab hangs over the river; Vân throws the bolt cutters (32 s) ------------------
const lanCan: Scene = {
  id: 'c11m1-lan-can', mission: 'c11-m1', title: '@c11m1.cs.lanCan', kind: 'cutscene', seconds: 32, skippable: true,
  stage: { at: RAIL, radius: 45, crowd: 'hide', traffic: 'hold', police: 'pause', freezeWorld: true, env: { hours: 23.95, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', luc: 'luc', van: 'van' },
  shots: [
    { dur: 4, label: 'tay-lai', cam: { k: 'twoShot', a: 'tin', b: 'luc', fov: 36 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'ride', id: 'xe-cs', model: 'reefer-truck', path: [at('lan-can-bach-dang.run', 0, 0, 20), 'lan-can-bach-dang.run', RAIL, CAB], speed: 10, driver: 'luc', passengers: ['tin'] },
      { k: 'place', who: 'tin', at: at('ride:xe-cs', 0.4, 1.6, 3.2), pose: 'sit' }, { k: 'place', who: 'luc', at: at('ride:xe-cs', -0.4, 1.5, 3.3), pose: 'sit' },
      { k: 'sfx', id: 'horn-blare', t: 0.2 }, say('tin', 'c11m1.cs.lc1', { ch: 'scene', t: 0.3 })],
      note: 'both on the wheel; the pistol is in the footwell' },
    { dur: 4, label: 'hang', cam: { k: 'shot', eye: at('ride:xe-cs', 0.3, 1.7, 1.5), look: 'luc.head', fov: 32 }, cues: [
      { k: 'expr', who: 'luc', e: 'cold-smile' }, say('luc', 'c11m1.cs.lc2', { t: 0.4 })] },
    { dur: 4, label: 'nga-ba', cam: { k: 'shot', eye: at('lan-can-bach-dang.run', -12, 3, -4), look: 'ride:xe-cs', fov: 50 }, cues: [
      { k: 'sfx', id: 'tire-screech', t: 0.3 }, { k: 'sfx', id: 'horn-blare', t: 1 }],
      note: 'the truck misses its turn east, crosses the T and the promenade between the palms and the lamp post (story-decisions.md 17)' },
    { dur: 3, label: 'lan-can', cam: { k: 'shot', eye: at(RAIL, -8, 1.2, 4), look: RAIL, fov: 45 }, cues: [
      { k: 'slowmo', scale: 0.3, seconds: 3 }, { k: 'fx', kind: 'sparks', at: RAIL }, { k: 'sfx', id: 'railing-crash' },
      { k: 'prop', id: 'lan-can-cs', kind: 'broken-railing', at: RAIL, t: 0.8 }] },
    { dur: 4, label: 'treo', cam: { k: 'shot', eye: at(CAB, 5, -0.4, -7), look: CAB, fov: 40 }, cues: [
      { k: 'sfx', id: 'metal-groan' }, { k: 'fx', kind: 'river-lanterns', at: at(CAB, 0, -2, -6) }],
      note: 'the cab hangs over the black water, its nose dipping; floating lotus lanterns drift past below' },
    { dur: 6, label: 'bo-ra', cam: { k: 'follow', target: 'tin', offset: [2.5, 2.2, -3], fov: 50 }, cues: [
      { k: 'walk', who: 'tin', path: [at(RAIL, 0, 3, -2), at(RAIL, 0, 3, 1.5), 'ch11.cua-thung'], pace: 'sneak' },
      say('tin', 'c11m1.cs.lc3', { ch: 'inner', t: 1 })],
      note: 'he climbs out of the smashed window, along the box roof, and drops onto the promenade; Lực stays in the cab, dazed' },
    { dur: 7, label: 'kim', cam: { k: 'twoShot', a: 'van', b: 'tin', fov: 40 }, cues: [
      { k: 'walk', who: 'van', path: ['lan-can-bach-dang.run', at('ch11.cua-thung', 2.2, 0, 2)], pace: 'run' },
      say('van', 'c11m1.cs.lc4', { ch: 'scene', t: 0.4 }), { k: 'prop', id: 'kim', kind: 'bolt-cutters', attach: 'tin.handR', t: 2 },
      say('tin', 'c11m1.cs.lc5', { t: 2.4 }), say('van', 'c11m1.cs.lc6', { t: 4.2 }), { k: 'letterbox', on: false, t: 5.6 }],
      note: 'Vân\'s car brakes at the T; she runs in and throws him the bolt cutters from the trunk' },
  ],
  handoff: { player: { at: 'ch11.cua-thung', yaw: Math.PI, vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c11-m1 · the box doors open: twelve people (24 s) -------------------------------------------------------------
const BOX = at(RAIL, 0, 1.2, -1.6);
const moThung: Scene = {
  id: 'c11m1-mo-thung', mission: 'c11-m1', title: '@c11m1.cs.moThung', kind: 'cutscene', seconds: 24, skippable: true,
  stage: { at: RAIL, radius: 25, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 23.97, weather: 'clear', freezeClock: true } },
  cast: {
    tin: 'tin',
    nguoiLon: { template: 'captive-adult', count: 6, area: BOX, size: [2, 6.4], poses: ['sit-hug-knees', 'hold-hands'] },
    thieuNien: { template: 'captive-teen', count: 6, area: BOX, size: [2, 6.4], poses: ['sit-hug-knees', 'shield-younger'] },
  },
  shots: [
    { dur: 4, label: 'cua', cam: { k: 'shot', eye: at(RAIL, 0, 1.6, -2.4), look: 'ch11.cua-thung', fov: 60 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'fx', kind: 'freezer-mist', at: at(RAIL, 0, 1.2, 1.6) }, { k: 'sfx', id: 'metal-groan' },
      { k: 'place', who: 'tin', at: 'ch11.cua-thung', pose: 'stand' }, { k: 'prop', id: 'kim', kind: 'bolt-cutters', attach: 'tin.handR' }],
      note: 'from inside the box: the doors swing open on cold vapour, the lantern light falls in' },
    { dur: 5, label: 'mat', cam: { k: 'rail', points: [at(RAIL, -0.6, 1.5, 1.2), at(RAIL, -0.6, 1.5, -1), at(RAIL, -0.6, 1.5, -3)],
      look: [at(RAIL, 0.6, 1, 1.2), at(RAIL, 0.6, 1, -1), at(RAIL, 0.6, 1, -3)], fov: [40, 40, 40], ease: 'inOutSine' },
      note: 'twelve people pressed together for warmth under packing foam, adults and teenagers, the older ones shielding the younger; they lift their eyes to the light; nobody is shown hurt' },
    { dur: 6, label: 'shipper', cam: { k: 'shot', eye: at('tin.head', 0.25, 0.05, 0.8), look: 'tin.head', fov: 32 }, cues: [
      { k: 'place', who: 'tin', at: 'ch11.cua-thung', pose: 'crouch' }, say('tin', 'c11m1.cs.mt1', { t: 0.5 })] },
    { dur: 6, label: 'nam-tay', cam: { k: 'shot', eye: at(RAIL, 1.5, 1.4, -0.5), look: at(RAIL, 0, 1, -1.5), fov: 45 }, cues: [say('tin', 'c11m1.cs.mt2', { t: 0.4 })],
      note: 'Mai\'s words from B2 in his mouth; the first hands reach for each other' },
    { dur: 3, label: 'ut', cam: { k: 'insert', target: 'tin.handL', fov: 20, dist: 0.35 }, cues: [
      { k: 'prop', id: 'chi-do', kind: 'lotus-bracelet', attach: 'tin.handL' }, say('tin', 'c11m1.cs.mt3', { ch: 'inner', t: 0.4 }), { k: 'letterbox', on: false, t: 2.6 }],
      note: 'the red string Mai re-tied on his wrist two hours ago' },
  ],
  handoff: { player: { at: 'ch11.cua-thung', yaw: Math.PI, vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c11-m1 · Vân arrests Lực at the broken railing; rotors turn on TÀI CHÍNH (34 s) ----------------------------------
const batLuc: Scene = {
  id: 'c11m1-bat-luc', mission: 'c11-m1', title: '@c11m1.cs.batLuc', kind: 'cutscene', seconds: 34, skippable: true,
  stage: { at: RAIL, radius: 40, crowd: 'keep', traffic: 'hold', police: 'pause', env: { hours: 0.1, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', van: 'van', luc: 'luc', loc: 'loc' },
  shots: [
    { dur: 5, label: 'bo-ra', cam: { k: 'shot', eye: at('lan-can-bach-dang.arrest', 3, 1.6, 4), look: 'luc', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'walk', who: 'luc', path: [RAIL, 'lan-can-bach-dang.arrest'], pace: 'shuffle' }, { k: 'expr', who: 'luc', e: 'pain' }],
      note: 'Lực crawls out over the box roof and drops onto the promenade, dazed, his uniform torn, a bruise at his temple; no blood shown' },
    { dur: 5, label: 'chia-sung', cam: { k: 'ots', speaker: 'van', listener: 'luc', side: 'right', fov: 38 }, cues: [
      { k: 'place', who: 'van', at: at('lan-can-bach-dang.arrest', 0, 0, 2.5), pose: 'stand' }, { k: 'anim', who: 'van', clip: 'aim-pistol' },
      { k: 'prop', id: 'sung-van', kind: 'pistol', attach: 'van.handR' }, say('van', 'c11m1.cs.bl1', { t: 0.8 })] },
    { dur: 9, label: 'so-goc', cam: { k: 'shot', eye: at('luc.head', 0.2, 0, 1), look: 'luc.head', fov: 30 }, cues: [
      { k: 'expr', who: 'luc', e: 'cold-smile' }, say('luc', 'c11m1.cs.bl2', { t: 0.4 }), say('luc', 'c11m1.cs.bl3', { t: 3 })],
      note: 'he cackles: the black ledger is only money; the master ledger is people' },
    { dur: 5, label: 'cong', cam: { k: 'twoShot', a: 'van', b: 'luc', fov: 40 }, cues: [
      { k: 'pair', clip: 'cuff-wrists', a: 'van', b: 'luc', t: 0.5 },
      { k: 'prop', id: 'xe-truot', kind: 'hanging-truck', at: CAB, variant: 'slide' }, { k: 'sfx', id: 'metal-groan', t: 0.2 },
      { k: 'fx', kind: 'splash', at: CAB, t: 2 }, { k: 'sfx', id: 'splash', t: 2 },
      { k: 'place', who: 'loc', at: at(RAIL, -6, 0, 4), pose: 'stand' }, say('loc', 'c11m1.cs.bl4', { t: 3 })],
      note: 'behind them the empty truck groans and slides into the river; river police wrap the twelve in blankets on the pier' },
    { dur: 6, label: 'truc-thang', cam: { k: 'shot', eye: at(RAIL, 1, 1.6, 6), look: at(PAD, 0, 3, 0), fov: 16 }, cues: [
      { k: 'ride', id: 'heli-xa', model: 'heli:sen-vang', path: [PAD], speed: 0 }, { k: 'sfx', id: 'rotor', t: 0.5 },
      say('van', 'c11m1.cs.bl5', { t: 1.5 })],
      note: 'telephoto up the tower: 168 m above, on the roof of TÒA THÁP TÀI CHÍNH, rotors begin to turn under the full moon' },
    { dur: 4, label: 'em-di', cam: { k: 'shot', eye: at('tin.head', 0.2, 0, 0.8), look: 'tin.head', fov: 28 }, cues: [
      { k: 'place', who: 'tin', at: at('lan-can-bach-dang.arrest', -2, 0, 1), pose: 'stand' }, { k: 'expr', who: 'tin', e: 'determined' },
      say('tin', 'c11m1.cs.bl6', { t: 1 }), { k: 'letterbox', on: false, t: 3.6 }] },
  ],
  handoff: { player: { at: 'lan-can-bach-dang.run', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c11-m2 · the jump gate of the 68th-floor deck (23 s) ----------------------------------------------------------
const GATE = 'dai-quan-sat-68.gate';
const congNhay: Scene = {
  id: 'c11m2-cong-nhay', mission: 'c11-m2', title: '@c11m2.cs.congNhay', kind: 'cutscene', seconds: 23, skippable: true,
  stage: { at: 'dai-quan-sat-68', radius: 25, crowd: 'keep', traffic: 'keep', police: 'pause', freezeWorld: true, env: { hours: 0.55, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', van: 'van' },
  shots: [
    { dur: 5, label: 'trang', cam: { k: 'shot', eye: at(GATE, 9, 1.5, 7), look: 'tin.head', fov: 50 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'sfx', id: 'wind-howl' },
      { k: 'place', who: 'tin', at: GATE, pose: 'stand', yaw: Math.PI / 2 }, { k: 'fx', kind: 'river-lanterns', at: at(RAIL, 0, 0, -10) }],
      note: 'Tín in the orange jacket and helmet at the gate; the full moon huge over the river; floating lotus lanterns below; star lanterns on the balconies of An Hòa' },
    { dur: 5, label: 'vo-tuyen', cam: { k: 'shot', eye: at('tin.head', 0.3, 0.05, 0.9), look: 'tin.head', fov: 30 }, cues: [say('van', 'c11m2.cs.cn1', { ch: 'radio', t: 0.8 })] },
    { dur: 4, label: 'duong-tat', cam: { k: 'shot', eye: at('tin.head', -0.3, 0.05, 0.9), look: 'tin.head', fov: 30 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c11m2.cs.cn2', { t: 0.6 })] },
    { dur: 4, label: 'chay', cam: { k: 'follow', target: 'tin', offset: [-1.5, 1.4, -3], fov: 60 }, cues: [
      { k: 'walk', who: 'tin', path: [at(GATE, -2.5, 0, 0), at(GATE, 0.5, 0, 0)], pace: 'run' }, { k: 'slowmo', scale: 0.4, seconds: 2.5, t: 1.5 }],
      note: 'three strides and the dive over the east edge, 51 m east and 64 m down to the pad' },
    { dur: 5, label: 'mo-du', cam: { k: 'orbit', center: at(GATE, 7, -6, 0), radius: 3.5, height: 0.5, from: 0, to: 3.4, fov: 62 }, cues: [
      { k: 'prop', id: 'du', kind: 'parachute', attach: 'tin.chest', t: 0.8 }, { k: 'sfx', id: 'wind-howl', t: 0.8 }, { k: 'letterbox', on: false, t: 4.6 }],
      note: 'the canopy bursts open; the downtown lights in his visor; below, the lit H of the pad' },
  ],
  handoff: { player: { at: GATE, vehicle: 'foot' }, camera: 'blend', ms: 300 },
};

// ---- c11-m3 · CS12, first part: the case, the gun, the task force, the lurch, the catch (35 s) ------------------------
const cs12a: Scene = {
  id: 'cs12_giao_tan_tay', mission: 'c11-m3', title: '@c11m3.cs.a', kind: 'cutscene', seconds: 35, skippable: true,
  stage: { at: 'san-thuong-tai-chinh', radius: 40, crowd: 'hide', traffic: 'keep', police: 'pause', freezeWorld: true, env: { hours: 0.8, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', phuong: 'phuong', su: 'su', daiTa: 'dai-ta' },
  shots: [
    { dur: 6, label: 'quy-dao', cam: { k: 'orbit', center: PAD, radius: 30, height: 30, from: 0, to: 0.9, fov: 55 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'sfx', id: 'rotor' }, { k: 'fx', kind: 'rotor-wash', at: PAD },
      { k: 'fx', kind: 'river-lanterns', at: at(EDGE, 0, -168, -40) },
      { k: 'place', who: 'phuong', at: at(PAD, -1.5, 0, -3), pose: 'stand' }, { k: 'prop', id: 'so-goc', kind: 'so-goc-case', attach: 'phuong.handL' },
      { k: 'place', who: 'su', at: 'san-thuong-tai-chinh.ac', pose: 'sit-hug-knees' }, { k: 'place', who: 'tin', at: at(PAD, 0, 0, 5), pose: 'stand' }],
      note: 'full moon; Phượng\'s jade áo dài whips in the wash; Su peeks out from behind the AC units' },
    { dur: 8, label: 'gia', cam: { k: 'shot', eye: at('phuong.head', 0.3, 0, 1.6), look: 'phuong.head', fov: 40 }, cues: [
      { k: 'anim', who: 'phuong', clip: 'aim-pistol' }, { k: 'prop', id: 'sung-phuong', kind: 'pistol', attach: 'phuong.handR' }, { k: 'expr', who: 'phuong', e: 'cold-smile' },
      say('phuong', 'c11m3.cs.a1', { t: 0.4 }), say('phuong', 'c11m3.cs.a2', { t: 4 })] },
    { dur: 6, label: 'shipper', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 1.2), look: 'tin.head', fov: 40 }, cues: [
      { k: 'expr', who: 'tin', e: 'determined' }, { k: 'prop', id: 'coi', kind: 'whistle', attach: 'tin.chest' }, say('tin', 'c11m3.cs.a3', { t: 0.8 })],
      note: 'he does not raise a weapon; the wind tugs at the whistle' },
    { dur: 5, label: 'truc-thang-bo', cam: { k: 'shot', eye: at('tin', -0.6, 1.8, -1.5), look: 'vehicle:heli-tf', fov: 60 }, cues: [
      { k: 'fx', kind: 'searchlight', at: 'vehicle:heli-tf' }, { k: 'sfx', id: 'rotor' },
      say('daiTa', 'c11m3.cs.a4', { ch: 'radio', as: '@c11m3.cs.loa', t: 0.8 })],
      note: 'the task-force helicopter rises over the parapet and holds its hover, its searchlight pinning her aircraft' },
    { dur: 6, label: 'chao', cam: { k: 'shot', eye: at('vehicle:heli-sv', 6, 2, 6), look: 'vehicle:heli-sv', fov: 55 }, cues: [
      { k: 'slowmo', scale: 0.3, seconds: 6 }, { k: 'sfx', id: 'wind-howl' },
      { k: 'walk', who: 'phuong', path: [at(PAD, -1.5, 0, -3), at('vehicle:heli-sv', 1.2, 0, 0)], pace: 'walk' },
      // the lurch: the ride cue moves the mission's own aircraft (same id, no copy; see cutscenes/ch06.ts c6m3-dam-tang)
      { k: 'ride', id: 'heli-sv', model: 'heli:sen-vang', path: [PAD, at(PAD, -2.6, 0.9, 0.4), at(PAD, -1.2, 0.3, 0.2)], speed: 4, t: 2.4 },
      { k: 'place', who: 'phuong', at: at(EDGE, 0, 0, 1.5), pose: 'lie-flat', t: 3.5 }, { k: 'prop', id: 'so-goc', kind: 'so-goc-case', at: at(PAD, 1.5, 0, -5), t: 3.5 }],
      note: 'she climbs into the doorway; the panicking pilot lurches the aircraft sideways and up (the ride cue); she is thrown onto the pad and slides toward the open north edge; the case skids away' },
    { dur: 4, label: 'chup', cam: { k: 'shot', eye: at(EDGE, 0, -3, -2), look: EDGE, fov: 75 }, cues: [
      { k: 'place', who: 'tin', at: at(EDGE, 0, 0, 0.8), pose: 'lie-flat' }, { k: 'pair', clip: 'catch-wrist', a: 'tin', b: 'phuong', t: 0.6 }, { k: 'sfx', id: 'wind-howl' },
      { k: 'qte', t: 1.2, id: 'c11m3-grip', kind: 'hold', keys: ['E'], label: '@c11m3.qte.giu', window: 60, target: 2, onFail: 'loop', loop: 'chup', anchor: { actor: 'phuong', joint: 'handR' } }],
      note: 'from below the edge, 168 m of city light underneath: he dives flat and catches her wrist as she goes over; the frame holds on "Giữ tay!" (hold E 2 s inside a 60 s real window; letting go replays the catch)' },
  ],
};

// ---- c11-m3 · CS12, second part: why, the haul, the stair door, the handover (34 s) ----------------------------------
const cs12b: Scene = {
  id: 'cs12_giao_tan_tay_trao', mission: 'c11-m3', title: '@c11m3.cs.b', kind: 'cutscene', seconds: 34, skippable: true,
  stage: { at: 'san-thuong-tai-chinh', radius: 40, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 0.85, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', phuong: 'phuong', van: 'van', daiTa: 'dai-ta', kieuAnh: 'kieu-anh', phiCong: 'phi-cong' },
  shots: [
    { dur: 7, label: 'co-tay', cam: { k: 'insert', target: 'tin.handL', fov: 18, dist: 0.4 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'prop', id: 'vong', kind: 'jade-bangle', attach: 'phuong.handR' }, { k: 'prop', id: 'chi-do', kind: 'lotus-bracelet', attach: 'tin.handL' },
      say('phuong', 'c11m3.cs.b1', { t: 0.6 }), say('tin', 'c11m3.cs.b2', { t: 2.4 }), say('tin', 'c11m3.cs.b3', { t: 4.2 }),
      { k: 'qte', t: 6.6, id: 'c11m3-haul', kind: 'mash', keys: ['SPACE'], label: '@c11m3.qte.keo', window: 5, target: 10, onFail: 'loop', loop: 'co-tay', anchor: { actor: 'phuong', joint: 'handR' } }],
      note: 'a jade bangle against a red string with a lotus seed; the frame holds on "Kéo lên!" (5 s real window; a miss replays the close-up)' },
    { dur: 5, label: 'keo-len', cam: { k: 'shot', eye: at(PAD, 5, 1.5, 4), look: PAD, fov: 45 }, cues: [
      { k: 'place', who: 'phuong', at: PAD, pose: 'sit' }, { k: 'expr', who: 'phuong', e: 'shock' },
      { k: 'place', who: 'tin', at: at(PAD, 1.2, 0, 0.5), pose: 'crouch' },
      { k: 'place', who: 'phiCong', at: at('vehicle:heli-sv', 0.6, 1, 1.2), pose: 'sit' }, { k: 'place', who: 'phiCong', at: at('vehicle:heli-sv', 0.6, 1, 1.2), pose: 'hands-up', t: 2 }],
      note: 'he hauls her up; she collapses on the H; her helicopter settles back onto the pad and the pilot raises his hands' },
    { dur: 8, label: 'cua-thang', cam: { k: 'shot', eye: at(STAIRS, 4, 1.7, -4), look: STAIRS, fov: 50 }, cues: [
      { k: 'walk', who: 'van', path: [STAIRS, at(PAD, -3, 0, 2)], pace: 'walk' },
      { k: 'walk', who: 'daiTa', path: [STAIRS, at(PAD, -1.5, 0, 3.5)], pace: 'walk' },
      { k: 'walk', who: 'kieuAnh', path: [STAIRS, at(PAD, -4.5, 0, 3.5)], pace: 'walk' },
      { k: 'phoneScreen', who: 'kieuAnh', text: '@c11m3.cs.live', sub: '@c11m3.cs.liveSub', t: 1 },
      say('kieuAnh', 'c11m3.cs.b4', { t: 1 }), say('van', 'c11m3.cs.b5', { t: 5 })],
      note: 'the stair-housing door bursts open: the task force took the lobby while Tín held the roof; the helicopter above holds its hover, its light on the pad' },
    { dur: 8, label: 'giao', cam: { k: 'twoShot', a: 'tin', b: 'daiTa', fov: 40 }, cues: [
      { k: 'place', who: 'tin', at: at(PAD, -0.5, 0, 3.5), pose: 'stand' }, { k: 'prop', id: 'so-goc', kind: 'so-goc-case', attach: 'tin.handR' },
      say('tin', 'c11m3.cs.b6', { t: 0.8 }), say('tin', 'c11m3.cs.b7', { t: 2.6 }), { k: 'pair', clip: 'handover', a: 'tin', b: 'daiTa', t: 6 }],
      note: 'he limps over with the case; Kiều Anh\'s phone in the corner of the frame' },
    { dur: 6, label: 'chao-tay', cam: { k: 'shot', eye: at('daiTa.head', 0.3, 0, 1.4), look: 'daiTa.head', fov: 35 }, cues: [
      { k: 'anim', who: 'daiTa', clip: 'salute', t: 0.8 }, say('daiTa', 'c11m3.cs.b8', { t: 1 }), { k: 'letterbox', on: false, t: 5.6 }],
      note: 'the colonel takes the case and salutes the shipper' },
  ],
};

// ---- c11-m3 · CS12, third part: Su goes down to her mother; dawn; Mai on the phone (23 s) -----------------------------
const cs12c: Scene = {
  id: 'cs12_binh_minh', mission: 'c11-m3', title: '@c11m3.cs.c', kind: 'cutscene', seconds: 23, skippable: true,
  stage: { at: 'san-thuong-tai-chinh', radius: 40, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 0.9, weather: 'clear' } },
  cast: { tin: 'tin', van: 'van', su: 'su', mai: 'mai' },
  shots: [
    { dur: 6, label: 've-voi-me', cam: { k: 'twoShot', a: 'van', b: 'su', fov: 40 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'place', who: 'su', at: 'san-thuong-tai-chinh.ac', pose: 'stand' }, { k: 'place', who: 'van', at: at('san-thuong-tai-chinh.ac', -0.8, 0, -0.4), pose: 'crouch' },
      { k: 'pair', clip: 'hand-on-shoulder', a: 'van', b: 'su', t: 0.4 }, say('van', 'c11m3.cs.c1', { t: 0.6 }), say('su', 'c11m3.cs.c2', { t: 3.6 })],
      note: 'Vân puts her jacket round Su\'s shoulders' },
    { dur: 9, label: 'binh-minh', cam: { k: 'shot', eye: at(EDGE, -6, 2, 3), look: at(EDGE, 0, 0, -20), fov: 60 }, cues: [
      { k: 'place', who: 'tin', at: EDGE, pose: 'sit' }, { k: 'prop', id: 'mu', kind: 'helmet', at: at(EDGE, 0.6, 0, 0.3) }, { k: 'grade', id: 'dawn', t: 3 }],
      note: 'time-lapse: the moon sets behind THÁP PHƯƠNG NAM, dawn rises over the river, the lanterns have drifted out; Tín sits at the edge, helmet off' },
    { dur: 8, label: 'dien-thoai', cam: { k: 'shot', eye: at('tin.head', 0.4, 0.05, 1), look: 'tin.head', fov: 30 }, cues: [
      { k: 'anim', who: 'tin', clip: 'phone-call' }, say('mai', 'c11m3.cs.c3', { ch: 'phone', t: 0.8 }), say('tin', 'c11m3.cs.c4', { t: 4.4 }),
      { k: 'expr', who: 'tin', e: 'smile', t: 4.2 }, { k: 'letterbox', on: false, t: 7.6 }] },
  ],
};

// ---- c11-m4 · the news, the trial, the debt notice on the lotus pond (35 s) ------------------------------------------
const tinTuc: Scene = {
  id: 'c11m4-tin-tuc', mission: 'c11-m4', title: '@c11m4.cs.tinTuc', kind: 'cutscene', seconds: 35, skippable: true,
  stage: { at: 'bia-hoi', radius: 25, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 16.5, weather: 'clear', freezeClock: true } },
  sets: ['courtroom', 'village-tan-thuan'],
  cast: { tamHo: 'tam-ho', mc: 'mc-tin-tuc', phuong: 'phuong', luc: 'luc', bao: 'bao', cuong: 'cuong', tin: 'tin', diem: 'diem', su: 'su', bana: 'bana' },
  shots: [
    { dur: 5, label: 'tivi', cam: { k: 'insert', target: 'prop:tv', fov: 30, dist: 1.6 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' },
      { k: 'prop', id: 'tv', kind: 'tv-news', at: at('bia-hoi.lucTable', 0, 2.2, -1.6), lines: ['@c11m4.cs.tit1', '@c11m4.cs.tit2'] },
      say('mc', 'c11m4.cs.n1', { ch: 'tv', t: 0.4 })] },
    { dur: 4, label: 'tam-ho', cam: { k: 'shot', eye: at('bia-hoi.lucTable', 1.5, 1.3, 2), look: 'tamHo.head', fov: 38 }, cues: [
      { k: 'place', who: 'tamHo', at: 'bia-hoi.lucTable', pose: 'sit-stool' }, { k: 'anim', who: 'tamHo', clip: 'raise-glass', t: 0.4 },
      { k: 'prop', id: 'ly', kind: 'beer-glass', attach: 'tamHo.handR' }, say('tamHo', 'c11m4.cs.n2', { t: 0.5 })],
      note: 'Tám Hổ at Lực\'s old table under the awning, cracking peanuts, raises his glass at the TV' },
    { dur: 6, label: 'toa', cam: { k: 'shot', eye: at('set:courtroom.dock', 0, 1.6, 6), look: 'set:courtroom.dock', fov: 45 }, cues: [
      { k: 'place', who: 'phuong', at: at('set:courtroom.dock', -1.8, 0, 0), pose: 'stand' }, { k: 'place', who: 'luc', at: at('set:courtroom.dock', -0.6, 0, 0), pose: 'stand' },
      { k: 'place', who: 'bao', at: at('set:courtroom.dock', 0.6, 0, 0), pose: 'stand' }, { k: 'place', who: 'cuong', at: at('set:courtroom.dock', 1.8, 0, 0), pose: 'stand' },
      say('mc', 'c11m4.cs.n3', { ch: 'tv', t: 0.6 })],
      note: 'Phượng, Lực, Bảo and Cường in the dock' },
    { dur: 4, label: 'gat-dau', cam: { k: 'shot', eye: at('phuong.head', 0.2, 0, 1.4), look: 'phuong.head', fov: 30 }, cues: [
      { k: 'place', who: 'tin', at: 'set:courtroom.gallery', pose: 'sit' }, { k: 'look', who: 'phuong', at: 'tin.head' },
      { k: 'anim', who: 'phuong', clip: 'small-nod', t: 2 }],
      note: 'Phượng finds Tín in the gallery and nods, very slightly' },
    { dur: 6, label: 'lam-chung', cam: { k: 'shot', eye: at('set:courtroom.witness', 1, 1.5, 2), look: 'diem.head', fov: 35 }, cues: [
      { k: 'place', who: 'diem', at: 'set:courtroom.witness', pose: 'stand' }, say('diem', 'c11m4.cs.n4', { t: 0.4 }), say('diem', 'c11m4.cs.n5', { t: 3.4 })] },
    { dur: 3, label: 'om-con', cam: { k: 'shot', eye: at('set:courtroom.corridor', 2, 1.5, 3), look: 'set:courtroom.corridor', fov: 40 }, cues: [
      { k: 'place', who: 'diem', at: 'set:courtroom.corridor', pose: 'stand' }, { k: 'place', who: 'su', at: at('set:courtroom.corridor', 0.4, 0, 0.4), pose: 'stand' },
      { k: 'pair', clip: 'hug', a: 'diem', b: 'su' }],
      note: 'in the corridor Diễm kneels and holds Su' },
    { dur: 7, label: 'ao-sen', cam: { k: 'crane', from: at('set:village-tan-thuan.pond', 0, 8, 6), to: at('set:village-tan-thuan.steps', 1.5, 1.4, 2), look: 'set:village-tan-thuan.steps', fov: [55, 40], ease: 'inOutSine' }, cues: [
      { k: 'place', who: 'bana', at: 'set:village-tan-thuan.steps', pose: 'squat' }, { k: 'prop', id: 'giay-no', kind: 'debt-notice', attach: 'bana.handR' },
      { k: 'anim', who: 'bana', clip: 'tear-notice', t: 1.5 }, say('bana', 'c11m4.cs.n6', { ch: 'scene', t: 3 }),
      { k: 'prop', id: 'giay-no', kind: 'debt-notice', remove: true, t: 3.5 }, { k: 'prop', id: 'giay-troi', kind: 'debt-notice', at: 'set:village-tan-thuan.pond', t: 3.6 },
      { k: 'letterbox', on: false, t: 6.6 }],
      note: 'Tân Thuận in the afternoon: Má tears up the debt notice and lets the pieces drift onto the lotus pond' },
  ],
};

// ---- c11-m4 · home: Hoa and Bé Tí off the coach to their mothers; Vân at the honour wall; Lực's bare wrist (28 s) ----
const veNha: Scene = {
  id: 'c11m4-ve-nha', mission: 'c11-m4', title: '@c11m4.cs.veNha', kind: 'cutscene', seconds: 28, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 20, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 16.5, weather: 'clear', freezeClock: true } },
  sets: ['village-tan-thuan', 'cong-an-office'],
  cast: {
    hoa: 'hoa', beti: 'beti', maHoa: 'tpl:villager', maTi: 'tpl:villager', van: 'van', luc: 'luc',
    dongHuong: { template: 'villager', count: 6, area: 'set:village-tan-thuan.bridge', size: [8, 4], poses: ['stand', 'walk'] },
  },
  shots: [
    { dur: 6, label: 'xe-do', cam: { k: 'shot', eye: at('set:village-tan-thuan.bridge', -8, 2, 6), look: 'set:village-tan-thuan.bridge', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' },
      { k: 'ride', id: 'xe-do-que', model: 'coach', path: [at('set:village-tan-thuan.bridge', -10, 0, 0), 'set:village-tan-thuan.bridge'], speed: 4 },
      { k: 'sfx', id: 'door-hiss', t: 3.5 }, { k: 'prop', id: 'gau', kind: 'torn-bear', attach: 'beti.handL' },
      { k: 'walk', who: 'hoa', path: [at('set:village-tan-thuan.bridge', 0, 0, 1.5), at('set:village-tan-thuan.bridge', 0, 0, 4)], t: 4 },
      { k: 'walk', who: 'beti', path: [at('set:village-tan-thuan.bridge', 0.6, 0, 1.5), at('set:village-tan-thuan.bridge', 1.2, 0, 4)], t: 4.3 }],
      note: 'a coach stops by the bridge in the Mekong; Hoa and Bé Tí step down, his bear under his arm; the neighbours come running' },
    { dur: 6, label: 'ma-oi', cam: { k: 'shot', eye: at('set:village-tan-thuan.bridge', 2.5, 1.5, 6), look: 'hoa.head', fov: 38 }, cues: [
      { k: 'place', who: 'maHoa', at: at('set:village-tan-thuan.bridge', 0.6, 0, 4.6), pose: 'stand' }, { k: 'expr', who: 'hoa', e: 'cry' },
      say('hoa', 'c11m4.cs.v1', { t: 0.8 }), { k: 'pair', clip: 'hug', a: 'hoa', b: 'maHoa', t: 1 }] },
    { dur: 4, label: 'be-ti', cam: { k: 'shot', eye: at('set:village-tan-thuan.bridge', 3, 1, 3.4), look: 'beti.head', fov: 36 }, cues: [
      { k: 'place', who: 'maTi', at: at('set:village-tan-thuan.bridge', 1.6, 0, 4.4), pose: 'stand' }, { k: 'pair', clip: 'hug', a: 'maTi', b: 'beti', t: 0.6 },
      { k: 'prop', id: 'gau', kind: 'torn-bear', attach: 'beti.handL', if: { k: 'not', c: { k: 'evidence', id: 'ev-tai-gau' } } },
      { k: 'prop', id: 'gau', kind: 'torn-bear', variant: 'mended', attach: 'beti.handL', if: { k: 'evidence', id: 'ev-tai-gau' } }],
      note: 'Bé Tí\'s mother runs from the bank and drops to her knees to hold him (the female officer on the pier called her, c7-m3); the bear squashed between them, its ear sewn back on if Tín gave it back on the pier' },
    { dur: 7, label: 'chao', cam: { k: 'shot', eye: at('set:cong-an-office.honor', 1.5, 1.6, 3), look: 'set:cong-an-office.honor', fov: 40 }, cues: [
      { k: 'prop', id: 'anh-tu', kind: 'portrait', at: at('set:cong-an-office.honor', -0.5, 1.6, 0), lines: ['@c11m4.cs.anhTu'] },
      { k: 'prop', id: 'anh-hai', kind: 'portrait', at: at('set:cong-an-office.honor', 0.5, 1.6, 0), lines: ['@c11m4.cs.anhHai'] },
      { k: 'place', who: 'van', at: at('set:cong-an-office.honor', 0, 0, 1.6), pose: 'stand' }, { k: 'anim', who: 'van', clip: 'salute', t: 1 },
      say('van', 'c11m4.cs.v2', { t: 3 })],
      note: 'Vân, reinstated, new rank on her shoulder boards, salutes the portraits of Ông Tư and Hải' },
    { dur: 5, label: 'phong-giam', cam: { k: 'insert', target: 'luc.handL', fov: 22, dist: 0.5 }, cues: [
      { k: 'place', who: 'luc', at: 'set:cong-an-office.cell', pose: 'sit' }, { k: 'letterbox', on: false, t: 4.6 }],
      note: 'down the corridor, in the holding cell of his own station, Lực on the bench; on his bare wrist, the pale band where the gold watch used to be' },
  ],
};

// ---- c11-m4 · the new sign: XE MÁY ÔNG TƯ; Quang's trial; Quang hands back the Dream (34 s) ---------------------------
const bangHieu: Scene = {
  id: 'c11m4-bang-hieu', mission: 'c11-m4', title: '@c11m4.cs.bangHieu', kind: 'cutscene', seconds: 34, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 18, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 16.6, weather: 'clear', freezeClock: true } },
  cast: { quang: 'quang', tin: 'tin', mai: 'mai' },
  shots: [
    { dur: 5, label: 'bang', cam: { k: 'shot', eye: at('xe-may-ong-tu', 0, 1.7, 7), look: at('xe-may-ong-tu', 0, 3.2, 0), fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' },
      { k: 'prop', id: 'bang', kind: 'sign', at: at('xe-may-ong-tu', 0, 3.2, -0.3), lines: ['@c11m4.cs.bang1', '@c11m4.cs.bang2'] },
      { k: 'place', who: 'quang', at: at('xe-may-ong-tu', 0.8, 0, 0.6), pose: 'stand' }, { k: 'anim', who: 'quang', clip: 'paint-sign' },
      { k: 'place', who: 'tin', at: at('xe-may-ong-tu', -1.4, 0, 3.5), pose: 'stand' }, { k: 'place', who: 'mai', at: 'ch11.mai-tiem', pose: 'stand' }],
      note: 'Quang, his right arm in a sling, paints the last letters one-handed on the rebuilt shop' },
    { dur: 6, label: 'chu-tu', cam: { k: 'twoShot', a: 'quang', b: 'tin', fov: 38 }, cues: [say('quang', 'c11m4.cs.q1', { t: 0.4 }), say('tin', 'c11m4.cs.t1', { t: 3.4 })] },
    { dur: 7, label: 'khong-lay-tien', cam: { k: 'shot', eye: at('quang.head', 0.3, 0, 1.1), look: 'quang.head', fov: 32 }, cues: [
      { k: 'expr', who: 'quang', e: 'smile' }, say('quang', 'c11m4.cs.q2', { t: 0.6 }), { k: 'expr', who: 'quang', e: 'cry', t: 4 }],
      note: 'he laughs, then has to look away' },
    { dur: 5, label: 'ra-toa', cam: { k: 'twoShot', a: 'quang', b: 'tin', fov: 36 }, cues: [
      { k: 'expr', who: 'quang', e: 'determined' }, say('quang', 'c11m4.cs.q4', { t: 0.4 }), say('tin', 'c11m4.cs.t2', { t: 3.2 })],
      note: 'Quang\'s own case: he told the investigators everything (the deliveries, the night he gave up Ông Tư) and stands trial next month; Tín will be in the gallery' },
    { dur: 6, label: 'xe', cam: { k: 'shot', eye: at('xe-may-ong-tu.tarp', 2, 1.2, 2.5), look: 'xe-may-ong-tu.tarp', fov: 42 }, cues: [
      { k: 'prop', id: 'tam-bat', kind: 'tarp', at: 'xe-may-ong-tu.tarp' }, { k: 'anim', who: 'quang', clip: 'pull-tarp', t: 0.4 }, { k: 'sfx', id: 'tarp-rustle', t: 0.5 },
      { k: 'prop', id: 'tam-bat', kind: 'tarp', remove: true, t: 1.2 }, say('quang', 'c11m4.cs.q3', { t: 1.6 }), { k: 'sfx', id: 'engine-purr', t: 4.5 }],
      note: 'the Dream, rebuilt again, matte black, the way Ông Tư did it' },
    { dur: 5, label: 'mai', cam: { k: 'shot', eye: at('mai.head', 0.3, 0.05, 1.2), look: 'mai.head', fov: 34 }, cues: [
      { k: 'expr', who: 'mai', e: 'smile' }, say('mai', 'c11m4.cs.m1', { t: 0.6 }), { k: 'letterbox', on: false, t: 4.6 }] },
  ],
  handoff: { player: { at: 'xe-may-ong-tu.tarp', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c11-m4 · BẾN XE AN HÒA: the lotus-seed mooncake she kept (27 s) ---------------------------------------------------
const banh: Scene = {
  id: 'c11m4-banh', mission: 'c11-m4', title: '@c11m4.cs.banh', kind: 'cutscene', seconds: 27, skippable: true,
  stage: { at: 'ben-xe-an-hoa', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 17.4, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', mai: 'mai' },
  shots: [
    { dur: 5, label: 'ghe', cam: { k: 'shot', eye: at('ben-xe-an-hoa', 0, 1.4, 4), look: 'ben-xe-an-hoa', fov: 42 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' },
      { k: 'place', who: 'tin', at: at('ben-xe-an-hoa', -0.4, 0, 0), pose: 'sit' }, { k: 'place', who: 'mai', at: at('ben-xe-an-hoa', 0.4, 0, 0), pose: 'sit' },
      { k: 'prop', id: 'banh', kind: 'mooncake', attach: 'mai.handR' }, say('mai', 'c11m4.cs.b1', { t: 0.5 })],
      note: 'the riverside shelter at golden hour, the coach idling; Mai unwraps a lotus-seed mooncake from waxed paper' },
    { dur: 5, label: 'cung', cam: { k: 'twoShot', a: 'mai', b: 'tin', fov: 36 }, cues: [
      { k: 'expr', who: 'mai', e: 'smile' }, say('mai', 'c11m4.cs.b2', { t: 0.6 }), { k: 'pair', clip: 'handover', a: 'mai', b: 'tin', t: 2 },
      { k: 'prop', id: 'banh', kind: 'mooncake', attach: 'tin.handR', t: 2.4 }] },
    { dur: 6, label: 'ngon', cam: { k: 'shot', eye: at('tin.head', 0.3, 0, 1), look: 'tin.head', fov: 30 }, cues: [{ k: 'expr', who: 'tin', e: 'smile' }, say('tin', 'c11m4.cs.b3', { t: 1.4 })] },
    { dur: 7, label: 'giu-loi', cam: { k: 'shot', eye: at('mai.head', 0.25, 0, 1), look: 'mai.head', fov: 32 }, cues: [say('mai', 'c11m4.cs.b4', { t: 0.6 })] },
    { dur: 4, label: 'chi-do', cam: { k: 'insert', target: 'tin.handL', fov: 20, dist: 0.35 }, cues: [
      { k: 'prop', id: 'chi-do', kind: 'lotus-bracelet', attach: 'tin.handL' }, { k: 'letterbox', on: false, t: 3.6 }],
      note: 'the red string she re-tied on Rằm night' },
  ],
  handoff: { player: { at: 'ben-xe-an-hoa', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c11-m4 · the sunset pier: the plate, Ông Tư's last line, the helmet, the headline, HẾT (35 s) --------------------
const SUNSET = 'ben-an-hoa.sunset';
const hoangHon: Scene = {
  id: 'c11m4-hoang-hon', mission: 'c11-m4', title: '@c11m4.cs.hoangHon', kind: 'cutscene', seconds: 35, skippable: true,
  stage: { at: 'ben-an-hoa', radius: 25, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 17.95, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', tu: 'tu' },
  shots: [
    { dur: 4, label: 'cuoi-ben', cam: { k: 'shot', eye: at(SUNSET, -6, 2.5, 6), look: SUNSET, fov: 50 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'ambience', id: 'river-evening' }, { k: 'music', id: 'theme-home' },
      { k: 'place', who: 'tin', at: SUNSET, pose: 'stand' }, { k: 'prop', id: 'coi', kind: 'whistle', attach: 'tin.chest' }],
      note: 'sunset on the river; Tín at the end of the pier, Ông Tư\'s whistle on his chest' },
    { dur: 6, label: 'bien-so', cam: { k: 'shot', eye: at('tin.head', 0.35, 0.05, 1), look: 'tin.head', fov: 30 }, cues: [
      { k: 'ride', id: 'xe-ngang', model: 'scooter', path: [at('ben-an-hoa', -25, 0, 38.4), at('ben-an-hoa', 25, 0, 38.4)], speed: 9, plate: '59-X1 268.15' },
      { k: 'look', who: 'tin', at: 'ride:xe-ngang', t: 1 }, say('tu', 'c11m4.cs.h1', { ch: 'inner', t: 1.6 })],
      note: 'a scooter passes on the riverside road behind him; the question from the shop and from the fire' },
    { dur: 6, label: 'nho', cam: { k: 'shot', eye: at('tin.head', -0.3, 0.05, 0.9), look: 'tin.head', fov: 28 }, cues: [
      { k: 'expr', who: 'tin', e: 'smile' }, say('tin', 'c11m4.cs.h2', { t: 0.4 }), say('tin', 'c11m4.cs.h3', { t: 3.4 })] },
    { dur: 8, label: 'luat', cam: { k: 'shot', eye: at(SUNSET, 1.2, 1.6, -2.5), look: 'tin.head', fov: 35 }, cues: [
      say('tin', 'c11m4.cs.h4', { t: 0.6, if: clean }), say('tin', 'c11m4.cs.h4c', { t: 0.6, if: hurtOnly }), say('tin', 'c11m4.cs.h4b', { t: 0.6, if: killed }),
      say('tu', 'c11m4.cs.h5', { ch: 'inner', t: 5.2, if: clean }), say('tu', 'c11m4.cs.h5c', { ch: 'inner', t: 5.2, if: hurtOnly }),
      say('tu', 'c11m4.cs.h5b', { ch: 'inner', t: 5.2, if: killed })],
      note: 'LƯƠNG TÂM by the campaign tier: the rule kept clean, kept with an innocent hurt, or broken; Ông Tư\'s last line is kind every time' },
    { dur: 4, label: 'mu', cam: { k: 'shot', eye: at(SUNSET, 1.5, 1.2, 1.5), look: 'tin.chest', fov: 35 }, cues: [
      { k: 'anim', who: 'tin', clip: 'buckle-helmet', t: 0.5 }, { k: 'prop', id: 'mu', kind: 'helmet', attach: 'tin.head', t: 1.6 },
      { k: 'prop', id: 'bao', kind: 'newspaper', at: at(SUNSET, 0.8, 0.5, 1.2), lines: ['@c11m4.cs.bao'] }],
      note: 'the phone chimes; he smiles and buckles his helmet' },
    { dur: 3, label: 'bao', cam: { k: 'insert', target: 'prop:bao', fov: 24, dist: 0.6 }, note: 'on the bollard, Kiều Anh\'s front page flutters in the evening wind' },
    { dur: 4, label: 'len-cao', cam: { k: 'crane', from: at(SUNSET, 0, 2, 4), to: at(SUNSET, 0, 40, 30), look: SUNSET, fov: [50, 60], ease: 'inOutSine' }, cues: [
      { k: 'card', kind: 'title', text: '@c11m4.cs.het', t: 1.5 }],
      note: 'the camera rises as the city lights come on' },
  ],
};

// ---- c11-m4 · post-credits stinger: an airport lounge (12 s) ---------------------------------------------------------
const hauTruyen: Scene = {
  id: 'c11m4-hau-truyen', mission: 'c11-m4', title: '@c11m4.cs.hauTruyen', kind: 'cutscene', seconds: 12, skippable: true,
  stage: { at: 'ben-an-hoa', radius: 10, crowd: 'keep', traffic: 'keep', police: 'pause' },
  sets: ['airport-lounge'],
  cast: { ongGia: 'ong-gia' },
  shots: [
    { dur: 4, label: 'phong-cho', cam: { k: 'shot', eye: at('set:airport-lounge.window', 0, 1.5, 2), look: 'set:airport-lounge.seat', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' },
      { k: 'place', who: 'ongGia', at: 'set:airport-lounge.seat', pose: 'sit-chair' }, { k: 'prop', id: 'ghim', kind: 'golden-lotus-pin', attach: 'ongGia.chest' }],
      note: 'an old man in a good suit, a small golden-lotus pin on his lapel; his face stays in shadow' },
    { dur: 6, label: 'goi', cam: { k: 'shot', eye: at('ongGia.head', 0.3, 0, 1.2), look: 'ongGia.head', fov: 32 }, cues: [
      { k: 'anim', who: 'ongGia', clip: 'phone-call' }, say('ongGia', 'c11m4.cs.s1', { t: 0.6 }), say('ongGia', 'c11m4.cs.s2', { t: 3 })] },
    { dur: 2, label: 'den', cam: { k: 'black' }, cues: [{ k: 'sfx', id: 'smash-cut' }, { k: 'letterbox', on: false, t: 1.6 }] },
  ],
};

export const CUTSCENES: Scene[] = [nhay, caBin, lanCan, moThung, batLuc, congNhay, cs12a, cs12b, cs12c, tinTuc, veNha, bangHieu, banh, hoangHon, hauTruyen];
