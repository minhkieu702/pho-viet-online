import type { Cond, TextRef } from '../types.ts';
import type { Channel, Cue, Mark, Scene } from '../scene.ts';
import { KHO7_MARKS } from './ch02.ts';

/**
 * Chapter 3 cutscenes as data (schema and conventions: story/scene.ts). Lines are '@keys' of text/vi/ch03.ts.
 * c3-m1: Lực meets Tín at the bench, his office (tea, the certificate, the gold watch), the choice's two outcomes
 * as `if` cues on the same beats, Vân at the motorbike rack, and Lực's call the player sees and Tín does not (it
 * ends on the black SUV across the street). c3-m2: the "CHO THUÊ" gate, Vân in the empty hall ("Mười hai tiếng")
 * and her wallet photo of Bống ("Làm mắt cho chị không?"). c3-m3: Ông Tư at night, the 2014 photo turned over in
 * the back room, and the rule at the night market. KHO 7's interior points come from cutscenes/ch02.ts KHO7_MARKS
 * (the scrubbed day variant of the same shell). Nobody is struck; the empty cage holds only scratches.
 */

const at = (m: string, x: number, y: number, z: number): Mark => ({ at: m, off: [x, y, z] });
const say = (who: string, key: string, o: { ch?: Channel; as?: TextRef; if?: Cond; t?: number } = {}): Cue => ({ k: 'say', who, text: `@${key}`, ...o });
const k7 = (name: keyof typeof KHO7_MARKS, dx = 0, dz = 0): Mark => ({ at: 'kho-7.hall', off: [KHO7_MARKS[name][0] + dx, KHO7_MARKS[name][1], KHO7_MARKS[name][2] + dz] });
const choice = (eq: string): Cond => ({ k: 'flag', name: 'choice:dienThoai', eq });
const hang = (g: string): Cond => ({ k: 'var', name: 'hang', op: '==', value: g });
const OFFICE = 'set:cong-an-office';

// ---- c3-m1 · the bench, Lực's office, the rack, the call ---------------------------------------------------------
const lucMoi: Scene = {
  id: 'c3m1-luc-moi', mission: 'c3-m1', title: '@c3m1.cs.moi', kind: 'cutscene', seconds: 12.5, skippable: true,
  stage: { at: 'cong-an-phuong', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 9.2, weather: 'clear', freezeClock: true } },
  sets: ['cong-an-office'], cast: { tin: 'tin', luc: 'luc', trucBan: 'truc-ban' },
  shots: [
    { dur: 4, cam: { k: 'shot', eye: at(`${OFFICE}.bench`, 1.6, 1.3, 1.8), look: `${OFFICE}.corridor`, fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'place', who: 'tin', at: `${OFFICE}.bench`, pose: 'sit' }, { k: 'place', who: 'trucBan', at: `${OFFICE}.desk`, pose: 'sit-chair' },
      { k: 'walk', who: 'luc', path: [`${OFFICE}.corridor`, `${OFFICE}.desk`] }, say('trucBan', 'c3m1.cs.tb', { t: 0.8 })],
      note: 'Lực comes down the corridor with a thermos of tea; the duty officer sits up and mentions the boy without looking at him' },
    { dur: 4, cam: { k: 'twoShot', a: 'luc', b: 'tin', fov: 40 }, cues: [{ k: 'look', who: 'luc', at: 'tin.head' }, { k: 'expr', who: 'luc', e: 'smile' }, say('luc', 'c3m1.cs.luc1', { t: 1.4 })] },
    { dur: 4.5, cam: { k: 'ots', speaker: 'luc', listener: 'tin', side: 'right', fov: 38 }, cues: [say('luc', 'c3m1.cs.luc2', { t: 0.3 }), { k: 'letterbox', on: false, t: 4.2 }],
      note: 'the kind-uncle smile; he gestures down the corridor' },
  ],
  handoff: { player: { at: `${OFFICE}.bench`, vehicle: 'foot' }, camera: 'blend', ms: 500 },
};
const phongLuc: Scene = {
  id: 'c3m1-phong-luc', mission: 'c3-m1', title: '@c3m1.cs.phong', kind: 'cutscene', seconds: 28, skippable: true,
  stage: { at: 'cong-an-phuong', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 9.3, weather: 'clear', freezeClock: true } },
  sets: ['cong-an-office'], cast: { tin: 'tin', luc: 'luc' },
  shots: [
    { dur: 5, label: 'phong', cam: { k: 'move', from: at(`${OFFICE}.office`, 0, 1.6, 1.5), to: at(`${OFFICE}.luc`, -1.5, 1.5, 2), look: `${OFFICE}.luc`, fov: 45, ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'music', id: 'tension' },
      { k: 'place', who: 'luc', at: `${OFFICE}.luc`, pose: 'sit-chair' }, { k: 'place', who: 'tin', at: `${OFFICE}.guest`, pose: 'sit-chair' },
      { k: 'prop', id: 'tra', kind: 'tea-set', at: `${OFFICE}.luc` }, { k: 'prop', id: 'bang-khen', kind: 'sign', variant: 'frame', at: at(`${OFFICE}.luc`, 0, 1.8, -1.2), text: '@c3m1.cs.bangKhen' },
      { k: 'anim', who: 'luc', clip: 'pat-seat' }, say('luc', 'c3m1.cs.luc3', { t: 1.2 })],
      note: 'a lacquered tea set and a framed "Chiến sĩ thi đua" certificate; warm light, a fan turning' },
    { dur: 4, label: 'tra', cam: { k: 'insert', target: 'prop:tra', fov: 30, dist: 0.6 }, cues: [{ k: 'prop', id: 'tra', kind: 'tea-set', at: `${OFFICE}.luc`, variant: 'pouring' }, say('luc', 'c3m1.cs.luc4', { t: 0.6 })],
      note: 'he pours two small cups, unhurried' },
    { dur: 6, cam: { k: 'ots', speaker: 'tin', listener: 'luc', side: 'left', fov: 38 }, cues: [{ k: 'expr', who: 'tin', e: 'worried' }, say('tin', 'c3m1.cs.tin1', { t: 0.4 })] },
    { dur: 4, cam: { k: 'twoShot', a: 'tin', b: 'luc', fov: 40 }, cues: [say('tin', 'c3m1.cs.tin2')] },
    { dur: 4, cam: { k: 'shot', eye: at('tin.head', 0.3, 0.05, 0.9), look: 'tin.head', fov: 32 }, cues: [say('tin', 'c3m1.cs.tin2b')] },
    { dur: 5, cam: { k: 'shot', eye: at('luc.head', 0.25, 0.05, 1), look: 'luc.head', fov: 30 }, cues: [{ k: 'look', who: 'luc', at: 'tin.head' }, say('luc', 'c3m1.cs.luc5', { t: 0.8 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'he holds out his hand, palm up' },
  ],
  handoff: { player: { at: `${OFFICE}.guest`, vehicle: 'foot' }, camera: 'cut' },
};
/** After the choice: the two outcomes run on the same beats (if cues), then the watch, the praise and the question. */
const lucHoi: Scene = {
  id: 'c3m1-luc-hoi', mission: 'c3-m1', title: '@c3m1.cs.hoi', kind: 'cutscene', seconds: 32.5, skippable: true,
  stage: { at: 'cong-an-phuong', radius: 15, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 9.4, weather: 'clear', freezeClock: true } },
  sets: ['cong-an-office'], cast: { tin: 'tin', luc: 'luc' },
  shots: [
    { dur: 5, cam: { k: 'insert', target: 'tin.handR', fov: 24, dist: 0.45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'phoneScreen', who: 'tin', text: '@c3m1.cs.anh', if: choice('chi') }, say('luc', 'c3m1.cs.chi1', { t: 1.5, if: choice('chi') }),
      { k: 'pair', clip: 'handover', a: 'tin', b: 'luc', if: choice('dua') }, say('luc', 'c3m1.cs.dua1', { t: 1.5, if: choice('dua') })],
      note: 'chi: Tín keeps the phone and shows the whiteboard photo; Lực leans in and his eyes narrow for a beat. dua: Lực takes the phone and thumbs through it' },
    { dur: 5, cam: { k: 'twoShot', a: 'luc', b: 'tin', fov: 40 }, cues: [
      say('luc', 'c3m1.cs.chi2', { if: choice('chi') }), say('luc', 'c3m1.cs.dua2', { if: choice('dua') }),
      { k: 'pair', clip: 'handover', a: 'luc', b: 'tin', t: 2.5, if: choice('dua') }, { k: 'phoneScreen', who: 'tin', text: '@c3m1.cs.trong', t: 3.5, if: choice('dua') }],
      note: 'dua: he hands it back with a shrug; the gallery is empty' },
    { dur: 4, label: 'dong-ho', cam: { k: 'insert', target: 'luc.handL', fov: 22, dist: 0.4 }, cues: [
      { k: 'anim', who: 'luc', clip: 'look-watch' }, { k: 'prop', id: 'dong-ho', kind: 'gold-watch', attach: 'luc.handL' }, say('tin', 'c3m1.cs.think1', { ch: 'inner', t: 0.4 })],
      note: 'close-up of his wrist: a gold watch far too expensive for a ward officer' },
    { dur: 5, cam: { k: 'shot', eye: at('luc.head', 0.3, 0.05, 1.1), look: 'luc.head', fov: 32 }, cues: [{ k: 'expr', who: 'luc', e: 'smile' }, say('luc', 'c3m1.cs.luc6', { t: 1 })] },
    { dur: 5, cam: { k: 'shot', eye: at('luc.head', 0.15, 0.05, 0.75), look: 'luc.head', fov: 26 }, cues: [{ k: 'expr', who: 'luc', e: 'cold-smile' }, say('luc', 'c3m1.cs.luc7', { t: 0.5 })] },
    { dur: 3.5, cam: { k: 'shot', eye: at('tin.head', 0.2, 0, 0.7), look: 'tin.head', fov: 28 }, cues: [say('tin', 'c3m1.cs.tin3', { t: 0.3 })] },
    { dur: 5, cam: { k: 'twoShot', a: 'luc', b: 'tin', fov: 42 }, cues: [say('luc', 'c3m1.cs.luc8', { t: 0.2 }), { k: 'letterbox', on: false, t: 4.6 }] },
  ],
  handoff: { player: { at: `${OFFICE}.office`, vehicle: 'foot' }, camera: 'blend', ms: 600 },
};
const vanXe: Scene = {
  id: 'c3m1-van', mission: 'c3-m1', title: '@c3m1.cs.van', kind: 'cutscene', seconds: 22.5, skippable: true,
  stage: { at: 'cong-an-phuong.rack', radius: 20, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 9.6, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', van: 'van', luc: 'luc' },
  shots: [
    { dur: 4, cam: { k: 'shot', eye: at('cong-an-phuong.rack', 3, 1.6, -3), look: 'cong-an-phuong.rack', fov: 45 }, cues: [
      { k: 'letterbox', on: true }, { k: 'place', who: 'tin', at: 'cong-an-phuong.rack', pose: 'stand' },
      { k: 'place', who: 'van', at: at('cong-an-phuong.rack', 1.2, 0, 0.8), pose: 'stand' }, { k: 'anim', who: 'van', clip: 'flick-cigarette' }],
      note: 'Vân in a worn leather jacket grinds out a cigarette by the bikes' },
    { dur: 4, cam: { k: 'ots', speaker: 'van', listener: 'tin', side: 'left', fov: 38 }, cues: [say('van', 'c3m1.cs.van1', { t: 0.3 })] },
    { dur: 3.5, cam: { k: 'shot', eye: at('tin.head', 0.25, 0.05, 0.8), look: 'tin.head', fov: 30 }, cues: [say('tin', 'c3m1.cs.tin4', { t: 0.3 })] },
    { dur: 3, cam: { k: 'shot', eye: at('cong-an-phuong.rack', 0.5, 1.5, -1.5), look: 'cong-an-phuong', fov: 40 }, cues: [
      { k: 'place', who: 'luc', at: 'cong-an-phuong', pose: 'stand' }, say('luc', 'c3m1.cs.luc9', { t: 0.2 })], note: 'Lực in the station doorway, smiling, calling her in' },
    { dur: 4, cam: { k: 'twoShot', a: 'van', b: 'tin', fov: 36 }, cues: [
      { k: 'pair', clip: 'handover', a: 'van', b: 'tin' }, { k: 'prop', id: 'danh-thiep', kind: 'business-card', attach: 'tin.chest' },
      say('van', 'c3m1.cs.van2', { t: 0.6 }), { k: 'walk', who: 'van', path: ['cong-an-phuong'], t: 2.5 }],
      note: 'as she passes she slips a card into his jacket pocket without looking at him' },
    { dur: 4, cam: { k: 'insert', target: 'tin.handR', fov: 18, dist: 0.3 }, cues: [
      { k: 'prop', id: 'danh-thiep', kind: 'business-card', attach: 'tin.handR', lines: ['@c3m1.cs.danhThiep', '@c3m1.cs.danhThiepSub'] }, { k: 'letterbox', on: false, t: 3.6 }] },
  ],
  handoff: { player: { at: 'cong-an-phuong.rack', vehicle: 'foot' }, camera: 'blend', ms: 600 },
};
/** Dramatic irony: the player sees the call, Tín does not. It ends on the SUV the counter-tail will start. */
const lucGoi: Scene = {
  id: 'c3m1-luc-goi', mission: 'c3-m1', title: '@c3m1.cs.goi', kind: 'cutscene', seconds: 24.5, skippable: true,
  stage: { at: 'cong-an-phuong', radius: 30, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 9.6, weather: 'clear', freezeClock: true } },
  sets: ['cong-an-office'], cast: { luc: 'luc' },
  shots: [
    { dur: 4, cam: { k: 'shot', eye: at(`${OFFICE}.blinds`, -2, 1.6, 2.5), look: `${OFFICE}.blinds`, fov: 40 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'place', who: 'luc', at: `${OFFICE}.blinds`, pose: 'stand' },
      { k: 'prop', id: 'rem', kind: 'window-blinds', at: `${OFFICE}.blinds`, variant: 'closing' }],
      note: 'through the slats: Tín by the bikes below; Lực closes the blinds' },
    { dur: 5, cam: { k: 'shot', eye: at('luc.head', 0.4, 0.05, 1.2), look: 'luc.head', fov: 34 }, cues: [{ k: 'anim', who: 'luc', clip: 'phone-call' }, { k: 'expr', who: 'luc', e: 'neutral' }, say('luc', 'c3m1.cs.luc10', { t: 0.6 })] },
    { dur: 4, cam: { k: 'shot', eye: at('luc.head', 0.2, 0.02, 0.8), look: 'luc.head', fov: 28 }, cues: [say('luc', 'c3m1.cs.luc11', { t: 0.5 })] },
    { dur: 5.5, cam: { k: 'shot', eye: at('luc.head', -0.3, 0.05, 0.9), look: 'luc.head', fov: 30 }, cues: [say('luc', 'c3m1.cs.luc12', { t: 0.3 })], note: 'no smile now' },
    { dur: 6, cam: { k: 'shot', eye: at('ch3.suv-cho', -9, 2.2, 7), look: 'vehicle:suv-den', fov: 38 }, cues: [say('luc', 'c3m1.cs.luc13', { t: 0.4 }), { k: 'letterbox', on: false, t: 5.6 }],
      note: 'across the street the black SUV with tinted windows starts its engine; his voice carries over the shot' },
  ],
  handoff: { player: { at: 'cong-an-phuong.rack', vehicle: 'foot' }, camera: 'blend', ms: 600 },
};

// ---- c3-m2 · KHO 7 by day -----------------------------------------------------------------------------------------
const choThue: Scene = {
  id: 'c3m2-cho-thue', mission: 'c3-m2', title: '@c3m2.cs.choThue', kind: 'cutscene', seconds: 18, skippable: true,
  stage: { at: 'kho-7.gate', radius: 30, crowd: 'hide', traffic: 'keep', police: 'pause', env: { hours: 15.5, weather: 'cloudy', freezeClock: true } },
  cast: { tin: 'tin', van: 'van' },
  shots: [
    { dur: 5, cam: { k: 'crane', from: at('kho-7.gate', 8, 6, 12), to: at('kho-7.gate', 3, 1.8, 6), look: 'kho-7.gate', fov: [50, 40], ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'prop', id: 'bang', kind: 'sign', at: 'kho-7.gate', text: '@c3m2.cs.sign' },
      { k: 'place', who: 'van', at: 'ch3.k7-van', pose: 'stand' }, { k: 'look', who: 'van', at: 'kho-7.gate' }, { k: 'place', who: 'tin', at: 'kho-7.gate', pose: 'stand' }],
      note: 'the iron gate stands open under a hand-painted "KHO CHO THUÊ" board; Vân, off duty, leans on her silver car' },
    { dur: 4, cam: { k: 'ots', speaker: 'van', listener: 'tin', side: 'right', fov: 38 }, cues: [say('van', 'c3m2.cs.van1', { t: 0.3 })] },
    { dur: 4, cam: { k: 'shot', eye: at('tin.head', 0.25, 0.05, 0.8), look: 'tin.head', fov: 30 }, cues: [say('tin', 'c3m2.cs.tin1', { t: 0.3 })] },
    { dur: 5, cam: { k: 'twoShot', a: 'van', b: 'tin', fov: 40 }, cues: [say('van', 'c3m2.cs.van2', { t: 0.2 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'behind them the yard is hosed clean; the reefers and the crate stacks are gone' },
  ],
  handoff: { player: { at: 'kho-7.gate', vehicle: 'foot' }, camera: 'blend', ms: 600 },
};
const muoiHaiTieng: Scene = {
  id: 'c3m2-muoi-hai-tieng', mission: 'c3-m2', title: '@c3m2.cs.muoiHai', kind: 'cutscene', seconds: 32, skippable: true,
  stage: { at: 'kho-7', radius: 60, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 15.8, weather: 'cloudy', freezeClock: true } },
  cast: { tin: 'tin', van: 'van' },
  shots: [
    { dur: 5, cam: { k: 'crane', from: at('kho-7.hall', -10, 8, 10), to: at('kho-7.hall', 2, 2, 0), look: k7('cage'), fov: [60, 45], ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'cold' }, { k: 'fx', kind: 'roof-leak', at: at('kho-7.hall', 4, 0, -6) },
      { k: 'prop', id: 'long', kind: 'chain-link-cage', at: k7('cage'), variant: 'empty' },
      { k: 'place', who: 'van', at: k7('cageDoor'), pose: 'stand' }, { k: 'place', who: 'tin', at: k7('cageDoor', -2.5, 4), pose: 'stand' }],
      note: 'the empty hall, the floor still wet with bleach, water dripping from the roof into the open cage' },
    { dur: 6, cam: { k: 'shot', eye: at('van.head', 0.3, 0.05, 1.1), look: 'van.head', fov: 32 }, cues: [say('van', 'c3m2.cs.van3', { t: 0.5 })] },
    { dur: 4, cam: { k: 'shot', eye: at('van.head', -0.2, 0.05, 0.9), look: 'van.head', fov: 30 }, cues: [say('van', 'c3m2.cs.van4')] },
    { dur: 4, cam: { k: 'shot', eye: at('tin.head', 0.2, 0.05, 0.8), look: 'tin.head', fov: 30 }, cues: [{ k: 'expr', who: 'tin', e: 'shock' }, say('tin', 'c3m2.cs.tin2', { t: 0.5 })] },
    { dur: 3, cam: { k: 'twoShot', a: 'van', b: 'tin', fov: 44 }, cues: [say('van', 'c3m2.cs.van5', { t: 1.5 })], note: 'a silence first; only the drip' },
    { dur: 5, cam: { k: 'shot', eye: at('van.head', 0.25, 0.05, 0.85), look: 'van.head', fov: 28 }, cues: [{ k: 'expr', who: 'van', e: 'determined' }, say('van', 'c3m2.cs.van6', { t: 0.6 })] },
    { dur: 5, cam: { k: 'shot', eye: at('van.head', 0.12, 0.03, 0.6), look: 'van.head', fov: 24 }, cues: [say('van', 'c3m2.cs.van7', { t: 0.5 }), { k: 'letterbox', on: false, t: 4.6 }] },
  ],
  handoff: { player: { at: k7('cageDoor', -2.5, 4), vehicle: 'foot' }, camera: 'cut' },
};
const lamMat: Scene = {
  id: 'c3m2-lam-mat', mission: 'c3-m2', title: '@c3m2.cs.lamMat', kind: 'cutscene', seconds: 25.5, skippable: true,
  stage: { at: 'kho-7', radius: 60, crowd: 'hide', traffic: 'hold', police: 'pause', env: { hours: 15.8, weather: 'cloudy', freezeClock: true } },
  cast: { tin: 'tin', van: 'van' },
  shots: [
    { dur: 5, cam: { k: 'insert', target: 'van.handR', fov: 22, dist: 0.4 }, cues: [
      { k: 'letterbox', on: true }, { k: 'prop', id: 'vi', kind: 'wallet-photo', attach: 'van.handR', text: '@c3m2.cs.bong' }, say('van', 'c3m2.cs.van8', { t: 1 })],
      note: 'she opens her wallet to a photo of her daughter Bống in An Hòa primary uniform' },
    { dur: 6, cam: { k: 'shot', eye: at('van.head', 0.3, 0.05, 1), look: 'van.head', fov: 30 }, cues: [{ k: 'expr', who: 'van', e: 'neutral' }, say('van', 'c3m2.cs.van9', { t: 0.3 })] },
    { dur: 4, cam: { k: 'shot', eye: at('van.head', -0.25, 0.05, 0.9), look: 'van.head', fov: 30 }, cues: [say('van', 'c3m2.cs.van10', { t: 0.4 })] },
    { dur: 5.5, cam: { k: 'twoShot', a: 'van', b: 'tin', fov: 40 }, cues: [say('van', 'c3m2.cs.van11', { t: 0.3 })] },
    { dur: 5, cam: { k: 'ots', speaker: 'van', listener: 'tin', side: 'left', fov: 34 }, cues: [say('van', 'c3m2.cs.van12', { t: 0.8 }), { k: 'letterbox', on: false, t: 4.6 }],
      note: 'she holds out her hand' },
  ],
  handoff: { player: { at: k7('cageDoor', -2.5, 4), vehicle: 'foot' }, camera: 'blend', ms: 500 },
};

// ---- c3-m3 · the shop at night, the photo, the rule -----------------------------------------------------------
const SHOP = 'set:xe-may-shop';
const tiemDem: Scene = {
  id: 'c3m3-tiem-dem', mission: 'c3-m3', title: '@c3m3.cs.tiem', kind: 'cutscene', seconds: 29, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 18, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 20.1, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', tu: 'tu' },
  shots: [
    { dur: 4, cam: { k: 'insert', target: 'tu.handR', fov: 22, dist: 0.5 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'place', who: 'tu', at: 'xe-may-ong-tu', pose: 'squat' },
      { k: 'prop', id: 'bugi', kind: 'spark-plug', attach: 'tu.handR' }, { k: 'anim', who: 'tu', clip: 'turn-spark-plug', loop: true }, { k: 'sfx', id: 'wrench-tick' },
      say('tu', 'c3m3.cs.tu1', { t: 0.8 })], note: 'one bulb over the shutter, the old Cub on its stand' },
    { dur: 4.5, cam: { k: 'shot', eye: at('tu.head', 0.5, 0.1, 1.3), look: 'tu.head', fov: 34 }, cues: [
      { k: 'place', who: 'tin', at: at('xe-may-ong-tu', 1.5, 0, 1), pose: 'sit-stool' }, { k: 'look', who: 'tu', at: 'tin.head' },
      say('tu', 'c3m3.cs.tu2a', { t: 0.4, if: { k: 'flag', name: 'escapeRoute', eq: 'khe' } }),
      say('tu', 'c3m3.cs.tu2b', { t: 0.4, if: { k: 'not', c: { k: 'flag', name: 'escapeRoute', eq: 'khe' } } })],
      note: 'after the slot escape the bike is scraped down one side; after the swim it is his face that shows it' },
    { dur: 5, cam: { k: 'ots', speaker: 'tin', listener: 'tu', side: 'right', fov: 38 }, cues: [say('tin', 'c3m3.cs.tin1', { t: 0.6 })] },
    { dur: 3.5, cam: { k: 'shot', eye: at('tu.head', 0.3, 0.05, 1), look: 'tu.head', fov: 30 }, cues: [say('tu', 'c3m3.cs.tu3', { t: 0.2 })] },
    { dur: 4, cam: { k: 'insert', target: 'tin.handR', fov: 18, dist: 0.3 }, cues: [{ k: 'phoneScreen', who: 'tin', text: '@c3m3.cs.the' }],
      note: 'the photo of the windscreen pass: the golden lotus' },
    { dur: 5, cam: { k: 'shot', eye: at('tu.head', 0.15, 0.03, 0.6), look: 'tu.head', fov: 24 }, cues: [
      { k: 'anim', who: 'tu', clip: 'glasses-down' }, { k: 'expr', who: 'tu', e: 'shock' }, say('tu', 'c3m3.cs.tu4', { t: 1.2 })], note: 'a long silence before he speaks' },
    { dur: 3, cam: { k: 'twoShot', a: 'tu', b: 'tin', fov: 40 }, cues: [say('tu', 'c3m3.cs.tu5', { t: 0.4 }), { k: 'letterbox', on: false, t: 2.6 }] },
  ],
  handoff: { player: { at: 'xe-may-ong-tu', vehicle: 'foot' }, camera: 'blend', ms: 500 },
};
const tamAnh: Scene = {
  id: 'c3m3-tam-anh', mission: 'c3-m3', title: '@c3m3.cs.tamAnh', kind: 'cutscene', seconds: 48, skippable: true,
  stage: { at: 'xe-may-ong-tu', radius: 18, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 20.3, weather: 'clear', freezeClock: true } },
  sets: ['xe-may-shop'], cast: { tin: 'tin', tu: 'tu' },
  shots: [
    { dur: 4, cam: { k: 'move', from: at(`${SHOP}.shelf`, 1.4, 0.3, 1.1), to: at(`${SHOP}.shelf`, 0.3, 0.2, 0.6), look: `${SHOP}.shelf`, fov: 32 }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'warm' }, { k: 'music', id: 'theme-loss' },
      { k: 'prop', id: 'anh-up', kind: 'photo-frame-facedown', at: `${SHOP}.shelf` }, { k: 'prop', id: 'anh-up', kind: 'photo-frame-facedown', remove: true, t: 3.2 }],
      note: 'the face-down frame from c1-m2; his hand takes it off the shelf' },
    { dur: 5, cam: { k: 'insert', target: 'tu.handR', fov: 20, dist: 0.45 }, cues: [
      { k: 'place', who: 'tu', at: `${SHOP}.backRoom`, pose: 'sit-chair' }, { k: 'place', who: 'tin', at: at(`${SHOP}.backRoom`, 1, 0, 1.2), pose: 'stand' },
      { k: 'prop', id: 'anh', kind: 'old-photo', attach: 'tu.handR', lines: ['@c3m3.cs.anh'] }],
      note: 'turned over under the bulb: two young policemen grin beside a jeep' },
    { dur: 4, cam: { k: 'shot', eye: at('tu.head', 0.3, 0.05, 1.1), look: 'tu.head', fov: 32 }, cues: [say('tu', 'c3m3.cs.tu6', { t: 0.5 })] },
    { dur: 6, cam: { k: 'twoShot', a: 'tu', b: 'tin', fov: 40 }, cues: [say('tu', 'c3m3.cs.tu7', { t: 0.3 })] },
    { dur: 5, cam: { k: 'shot', eye: at('tu.head', 0.2, 0.05, 0.85), look: 'tu.head', fov: 28 }, cues: [{ k: 'expr', who: 'tu', e: 'eyes-closed' }, say('tu', 'c3m3.cs.tu8', { t: 0.5 })] },
    { dur: 5, cam: { k: 'shot', eye: at('tu.head', -0.25, 0.05, 0.9), look: 'tu.head', fov: 30 }, cues: [{ k: 'expr', who: 'tu', e: 'neutral' }, say('tu', 'c3m3.cs.tu9', { t: 0.3 })] },
    { dur: 4.5, cam: { k: 'shot', eye: at('tu.head', 0.12, 0.03, 0.6), look: 'tu.head', fov: 24 }, cues: [{ k: 'expr', who: 'tu', e: 'angry' }, say('tu', 'c3m3.cs.tu10', { t: 0.2 })] },
    { dur: 3.5, cam: { k: 'shot', eye: at('tin.head', 0.2, 0.05, 0.7), look: 'tin.head', fov: 28 }, cues: [{ k: 'expr', who: 'tin', e: 'shock' }, say('tin', 'c3m3.cs.tin2', { t: 0.3 })] },
    { dur: 4, cam: { k: 'ots', speaker: 'tu', listener: 'tin', side: 'left', fov: 36 }, cues: [say('tu', 'c3m3.cs.tu11', { t: 0.3 })] },
    { dur: 3, cam: { k: 'insert', target: 'tu.handR', fov: 24, dist: 0.5 }, cues: [{ k: 'prop', id: 'anh', kind: 'old-photo', remove: true, t: 1 }, say('tu', 'c3m3.cs.tu12', { t: 0.5 })],
      note: 'the photo goes back into the drawer; the drawer shuts' },
    { dur: 4, cam: { k: 'shot', eye: at('tu.head', 0.15, 0.03, 0.65), look: 'tu.head', fov: 24 }, cues: [{ k: 'expr', who: 'tu', e: 'determined' }, say('tu', 'c3m3.cs.tu13', { t: 0.4 }), { k: 'letterbox', on: false, t: 3.6 }] },
  ],
  handoff: { player: { at: `${SHOP}.backRoom`, vehicle: 'foot' }, camera: 'blend', ms: 500 },
};
const luat: Scene = {
  id: 'c3m3-luat', mission: 'c3-m3', title: '@c3m3.cs.luat', kind: 'cutscene', seconds: 50, skippable: true,
  stage: { at: 'cho-an-hoa', radius: 20, crowd: 'keep', traffic: 'keep', police: 'pause', env: { hours: 20.6, weather: 'clear', freezeClock: true } },
  cast: { tin: 'tin', tu: 'tu', bin: 'bin' },
  shots: [
    { dur: 4, cam: { k: 'crane', from: at('cho-an-hoa', -8, 6, -4), to: at('cho-an-hoa.stool', -2, 1.6, -3), look: 'cho-an-hoa.stool', fov: [55, 42], ease: 'inOutSine' }, cues: [
      { k: 'letterbox', on: true }, { k: 'grade', id: 'night' }, { k: 'music', id: 'theme-home' },
      { k: 'place', who: 'bin', at: 'cho-an-hoa.stool', pose: 'sit-stool' }, { k: 'place', who: 'tu', at: 'cho-an-hoa.stall', pose: 'stand' },
      { k: 'place', who: 'tin', at: at('cho-an-hoa.stool', -1.2, 0, -1), pose: 'stand' }],
      note: 'the night market: smoke from a grill, a quán cóc with low stools; Ông Tư got there first on his Cub' },
    { dur: 4, cam: { k: 'twoShot', a: 'bin', b: 'tin', fov: 40 }, cues: [{ k: 'expr', who: 'bin', e: 'smile' }, say('bin', 'c3m3.cs.bin1', { t: 0.3, if: { k: 'any', of: [hang('A'), hang('B')] } }),
      say('bin', 'c3m3.cs.bin1b', { t: 0.3, if: { k: 'any', of: [hang('C'), hang('D')] } })],
      note: 'Bin only missed Tín on the tail when the course went well (A, B); after a C or D he caught him (or Tín skipped it)' },
    { dur: 5, cam: { k: 'shot', eye: at('tu.head', 0.3, 0.05, 1.1), look: 'tu.head', fov: 32 }, cues: [
      say('tu', 'c3m3.cs.hangA', { t: 0.8, if: hang('A') }), say('tu', 'c3m3.cs.hangB', { t: 0.8, if: hang('B') }),
      say('tu', 'c3m3.cs.hangC', { t: 0.8, if: hang('C') }), say('tu', 'c3m3.cs.hangD', { t: 0.8, if: hang('D') })],
      note: 'the grade of the course, A to D' },
    { dur: 6, cam: { k: 'insert', target: 'tu.handR', fov: 22, dist: 0.5 }, cues: [
      { k: 'prop', id: 'may-cui', kind: 'cheap-phone', attach: 'tu.handR' }, { k: 'pair', clip: 'handover', a: 'tu', b: 'tin', t: 3 }, say('tu', 'c3m3.cs.tu14', { t: 0.2 })],
      note: 'a cheap old smartphone, cracked screen, taped at the corner: no accounts on it (the burner; chapter 4 calls it the máy cùi)' },
    { dur: 4, cam: { k: 'twoShot', a: 'tu', b: 'tin', fov: 40 }, cues: [say('tu', 'c3m3.cs.tu15', { t: 0.2 })] },
    { dur: 6, cam: { k: 'insert', target: 'tu.handR', fov: 18, dist: 0.35 }, cues: [
      { k: 'prop', id: 'nut-ao', kind: 'clip-camera', attach: 'tu.handR' }, { k: 'pair', clip: 'handover', a: 'tu', b: 'tin', t: 3.5 }, say('tu', 'c3m3.cs.tu16', { t: 0.3 })],
      note: 'a button-sized clip-on camera that passes for a shirt button' },
    { dur: 5, cam: { k: 'shot', eye: at('tu.head', 0.25, 0.05, 0.9), look: 'tu.head', fov: 30 }, cues: [say('tu', 'c3m3.cs.tu17', { t: 0.2 })], note: 'the ring on the warehouse roof, remembered' },
    { dur: 5, cam: { k: 'shot', eye: at('tu.head', 0.12, 0.03, 0.6), look: 'tu.head', fov: 22 }, cues: [{ k: 'music', id: null, fade: 1.5 }, { k: 'expr', who: 'tu', e: 'determined' }, say('tu', 'c3m3.cs.tu18', { t: 0.5 })],
      note: 'stern; the market noise falls away' },
    { dur: 3, cam: { k: 'shot', eye: at('tu.head', 0.08, 0.02, 0.5), look: 'tu.head', fov: 20 }, cues: [say('tu', 'c3m3.cs.tu19', { t: 0.3 })] },
    { dur: 4.5, cam: { k: 'twoShot', a: 'tu', b: 'tin', fov: 34 }, cues: [say('tu', 'c3m3.cs.tu20', { t: 0.3 })] },
    { dur: 3.5, cam: { k: 'shot', eye: at('tin.head', 0.2, 0.05, 0.7), look: 'tin.head', fov: 28 }, cues: [{ k: 'expr', who: 'tin', e: 'determined' }, say('tin', 'c3m3.cs.tin3', { t: 0.4 }), { k: 'letterbox', on: false, t: 3.2 }] },
  ],
  handoff: { player: { at: at('cho-an-hoa.stool', -1.2, 0, -1), vehicle: 'foot' }, camera: 'blend', ms: 600 },
};

export const CUTSCENES: Scene[] = [lucMoi, phongLuc, lucHoi, vanXe, lucGoi, choThue, muoiHaiTieng, lamMat, tiemDem, tamAnh, luat];
