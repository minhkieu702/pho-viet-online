import { defineChapter, defineMission, type Act, type Behaviour, type BoardCard, type CastDef, type Cond, type EvidenceDef, type JournalDef, type Line, type MeterSpec, type PlaceDef, type QuestionDef, type StepDef, type WorldPolicy } from '../types.ts';
import type { ContractEntry, ContractKind } from '../contract.ts';
import { TEXT } from '../text/vi/ch09.ts';

/**
 * Chương 9 · TRUY NÃ (story-final.md ch.9 with story-decisions.md 6–9, 13, 14, 22 and §8 "c9-m1 / c9-m2 / c9-m3"):
 * mùng 13–14, 'MAI LÀ RẰM'. The morning after the TV bulletin (c8-m4's last scene) Tín hides in the hollow under the
 * attic floor while two ward officers search, Cô Ba tells him about Lâm and gives him Lâm's raincoat and full-face
 * helmet, and c9-m1 crosses the city in the story wanted mode (posters, three checkpoints on ĐƯỜNG AN HÒA, the
 * recognition meter that rain, the raincoat and crowds slow down; Bà Sáu's tarp when `helpedBaSau`, else the longer
 * back-alley detour) to the lunch-rush shippers at TRUNG TÂM THƯƠNG MẠI, down the ramp into Vân's car and her
 * mother's tube house (Phượng's envelope burns there if Tín took it in c8-m3; the call to Má). c9-m2 the next evening: Tám Hổ's
 * keg-porter cover, three kegs to the new front storeroom, the clip camera in the high vent over Lực's sidewalk table,
 * the drunk's bluff, Lực's own words ("Thấy là bắn. Khỏi ra tòa."), the bodyguard finds the vent: a foot chase over
 * the courtyard wall to the Dream, Lực's black SUV, Hổ Vàng's beer cart across the motel alley mouth; at the
 * safehouse the "who can stop the truck" deduction, the 48 hours, the vest and Vân's backup pistol (a choice).
 * Chained into c9-m3 at 23:30: Quang at the back door with the B2 keycard, a bowl of hủ tiếu, the raid of men in fake
 * police vests, Cô Ba out through the kitchen and the market lane (open combat allowed with the pistol; non-lethal
 * keeps LƯƠNG TÂM), Hổ Vàng block the lane's east mouth, Cô Ba on the pillion, two bikers and the scooter kicks, the
 * abbot's "chỉ có lá rụng" at the pagoda gate (no fighting at the pagoda), and the three of them in Vân's car.
 *
 * Places are story/sites.ts ids, this chapter's PLACES ('ch9.*', checked on the map by scripts/story-ch09.test.mjs) or
 * anchors of the off-map spaces declared in ANCHORS (and chapter 1's attic anchors, chapter 5's co-ba-ground ones).
 * Texts are '@keys' of text/vi/ch09.ts; brands ({@app}, {@ring}) come from text/vi/common.ts.
 * Register in content/index.ts LOADERS: `9: () => import('./ch09.ts'),`.
 * Cast from earlier chapters: tin, quang, coba, bana, basau (ch.1), cuong (ch.2), van, luc (ch.3); the abbot
 * 'thay-minh-tinh' comes from chapter 6 (c6-m1, director-actors-extras.md §7.1; the test stands in for him while
 * content/ch06.ts is not registered). Chapter 9 introduces Tám Hổ ('tam-ho') and his men ('ho-vang'), the journalist Kiều Anh
 * ('kieu-anh', on the phone) and the task-force colonel ('dai-ta'), whom chapters 10–11 speak with.
 * Choices chapter 9 reads from chapters 6 and 8 (story-final.md "persistent flags"): `choice:quangBen` ('keo-day' after
 * "Kéo nó dậy" in c6-m3, else 'bo-di') and `choice:phongBi` ('cam' after "Cầm phong bì" in c8-m3); see UPSTREAM_FLAGS.
 *
 * Engine ids used here are in story/contract.ts (and SCENE_REQUESTS for 'hand-on-shoulder'), except ENGINE_NEEDS
 * below: the story weapon and pillion ops, the recognition and SUV meters, three outfits, the keg, three arenas, the
 * ba gác, the shipper and Hổ Vàng templates, the chè cart, three acts and the cutscene clips, props and sounds. The planned ops
 * 'wanted' (police) and 'chase' (vehicles) get their first content here (chase-wanted.md §5.4, §5.6, §7).
 */

const H = Math.PI / 2;
const NO_HUB: WorldPolicy['activities'] = { gunStore: false, bank: false, deck: false, boatRental: false, sideJobs: false, orders: false };
const say = (who: string, key: string, o: Omit<Line, 'who' | 'text'> = {}): Line => ({ who, text: `@${key}`, ...o });
const think = (key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say('tin', key, { voice: 'think', ...o });
const phone = (who: string, key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say(who, key, { voice: 'phone', ...o });
const talk = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines });
const aside = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines, mode: 'ambient' });
const hint = (key: string, ms = 7000): Act => ({ k: 'hint', text: `@${key}`, ms });
const bark = (actor: string, key: string, shout = false): Act => ({ k: 'bark', actor, text: `@${key}`, shout });
const reach = (at: string, r = 3): Cond => ({ k: 'reach', at, r });
const used = (id: string): Cond => ({ k: 'on', ev: 'interact', id });
const climbed = (id: string): Cond => ({ k: 'on', ev: 'climb', id });
const owned = (id: string): Cond => ({ k: 'evidence', id });
const after = (seconds: number): Cond => ({ k: 'after', seconds });
const flag = (name: string, eq?: boolean | string): Cond => (eq === undefined ? { k: 'flag', name } : { k: 'flag', name, eq });
const detected: Cond = { k: 'on', ev: 'detected' };
/** Teleport unless the player is already there on that surface `level` (null: the ground); see content/ch01.ts. */
const put = (at: string, vehicle?: string, r = 8, level: string | null = null): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });
/** Like `put`, but staying put when the player is near any of `places` (a step two routes can reach). */
const putNear = (places: string[], r: number): Act =>
  ({ k: 'if', c: { k: 'any', of: places.map((at): Cond => ({ k: 'reach', at, r, level: null })) }, then: [], else: [{ k: 'teleport', at: places[0] }] });
/** A checkpoint inside an off-map space: enter it first when a skip lands here from outside (a restore re-enters it already). */
const inSpace = (space: string, link: string): Act => ({ k: 'if', c: { k: 'space', id: space }, then: [], else: [{ k: 'space', enter: space, link }] });
/** Stealth rules of the chapter: takedowns allowed, no guns, nobody dies (LƯƠNG TÂM), crimes raise the ring's alarm. */
const RULES = { takedowns: true, guns: 'none', lethal: 'fail', failOn: [], showCones: 'observe', countConscience: true, respawn: 'checkpoint', policeSuppressed: true };

// ---- the manhunt (chase-wanted.md §7) -------------------------------------------------------------------------

/** The three checkpoints of the bible on ĐƯỜNG AN HÒA (z 0): screening zones at the junctions (§7.4). */
const CHECKPOINTS = [
  { id: 'chot-buu-dien', at: 'cp-54-0', yaw: 0, width: 14, depth: 10, cars: 1, officers: 3, mode: 'screen' },
  { id: 'chot-benh-vien', at: 'cp-108-0', yaw: 0, width: 14, depth: 10, cars: 1, officers: 2, mode: 'screen' },
  { id: 'chot-quan-1', at: 'cp-162-0', yaw: 0, width: 14, depth: 10, cars: 2, officers: 4, mode: 'screen' },
];
const RECOGNITION = 'nhan-dien';
/** c8-m3: Tín took Phượng's envelope ("Cầm phong bì"); it burns over Vân's gas ring in c9-m1. */
const tookEnvelope = flag('choice:phongBi', 'cam');
/** Manhunt with the checkpoints (c9-m1), without them (c9-m2: posters and witnesses only), then the cooldown (c9-m3). */
const wanted = (mode: 'manhunt' | 'cooldown', checkpoints: typeof CHECKPOINTS = []): Act =>
  ({ k: 'do', op: 'wanted', args: { mode, maxWanted: 1, meter: RECOGNITION, posters: 'on', checkpoints } });
const meterNhan = (key: string): MeterSpec => ({ id: RECOGNITION, label: `@${key}`, kind: 'bar', max: 1 });
const starred: Cond = { k: 'player', prop: 'wanted', op: '>=', value: 1 };
const noStar: Cond = { k: 'player', prop: 'wanted', op: '<', value: 1 };
/** A witness called the police (a full meter): shake them off before the meeting; repeats every 20 s while starred. */
const calledWatch = { when: starred, do: [hint('c9m1.hint.goi', 8000)], cooldown: 20 };

// ---- c9-m1 · Cả thành phố tìm tôi ----------------------------------------------------------------------------

/** Two ward officers on foot walking west along the sidewalk past Bà Sáu's cart (the second one two seconds behind). */
const PATROL: Act[] = (['tt-1', 'tt-2'] as const).map((id, i): Act => ({
  k: 'spawn', id, cast: 'ca-phuong', template: 'ward-cop', at: 'ch9.tuan-tra-a', team: 'neutral', tags: ['cop', 'tuan-tra', 'innocent'],
  behaviour: { k: 'patrol', route: ['ch9.tuan-tra-a', 'ch9.tuan-tra-b'], waits: [i * 2, 30] },
}));
/** The lunch rush at the mall: a dozen riders in the same orange windbreaker ("Shipper nào nhìn cũng giống nhau"). */
const SHIPPERS = Array.from({ length: 12 }, (_, i) => `sh-${i + 1}`);
const RAINCOAT: Act = { k: 'player', outfit: 'tin-ao-mua' };

const c9m1 = defineMission({
  id: 'c9-m1', meta: { hours: [6, 11], giver: 'coba' }, lethal: 'fail',
  start: { space: 'attic', at: 'attic/desk', hour: 7.5, weather: 'rain', lunar: 13, outfit: 'tin-ao-tu' },
  world: { traffic: 'normal', crowd: 'normal', police: 'story', maxWanted: 1, gangs: 'calm', clock: { hour: 7.5, freeze: true }, weather: { set: 'rain', lock: true }, activities: NO_HUB },
  setup: [wanted('manhunt', CHECKPOINTS)],
  steps: [
    {
      id: 'buoi-sang', minutes: 0.6,
      enter: [
        { k: 'title', kind: 'time', text: '@c9m1.title', sub: '@c9m1.titleSub' },
        { k: 'cutscene', id: 'c9m1-ban-tin' },
        { k: 'evidence', id: 'ev-ban-tin' }, { k: 'journal', id: 'j-truy-na' },
      ],
    },
    {
      // Cô Ba stalls the officers with coffee: fifteen seconds to get under the floor
      id: 'chui-san', minutes: 0.3, objective: '@c9m1.obj.chui', marker: { at: 'attic/hollow', style: 'go' },
      checkpoint: { label: '@c9m1.cp.chui', setup: [
        inSpace('attic', 'stairs'), put('attic/door', undefined, 3), { k: 'player', outfit: 'tin-ao-tu', stance: 'stand' },
        { k: 'stealth', arena: 'gac-co-ba', variant: 'search', rules: { takedowns: false, guns: 'none', lethal: 'fail', showCones: 'always', countConscience: true, respawn: 'checkpoint' } }] },
      interact: [{ id: 'hoc-san', at: 'attic/hollow', r: 1.4, prompt: '@c9m1.int.chui', kind: 'hide', when: 'foot' }],
      timer: { seconds: 15, label: '@c9m1.timer.chui', fail: '@c9m1.fail.cham' },
      enter: [hint('c9m1.hint.chui', 8000)],
      done: used('hoc-san'),
    },
    {
      id: 'nin-tho', minutes: 0.6, objective: '@c9m1.obj.nin', hud: { light: true, noise: true },
      enter: [
        { k: 'spawn', id: 'ca-1', cast: 'ca-phuong', template: 'ward-cop', at: 'attic/stairs', team: 'neutral', tags: ['cop', 'innocent'],
          behaviour: { k: 'patrol', route: ['attic/door', 'attic/mattress', 'attic/hollow', 'attic/window'], waits: [2, 3, 4, 3] } },
        { k: 'spawn', id: 'ca-2', cast: 'ca-phuong', template: 'ward-cop', at: 'attic/stairs', team: 'neutral', tags: ['cop', 'innocent'],
          behaviour: { k: 'patrol', route: ['attic/door', 'attic/wall', 'attic/desk', 'attic/hollow'], waits: [1, 4, 3, 2] } },
        hint('c9m1.hint.nin', 9000), aside('c9m1-duoi-san', [think('c9m1.think.duoiSan')]),
      ],
      watchers: [
        { when: after(2), do: [bark('ca-1', 'c9m1.bark.ca1')] }, { when: after(6), do: [bark('ca-2', 'c9m1.bark.ca2')] },
        { when: after(11), do: [bark('ca-1', 'c9m1.bark.ca3')] }, { when: after(16), do: [bark('ca-2', 'c9m1.bark.ca4')] },
      ],
      done: { k: 'hold', seconds: 18, c: { k: 'stance', is: 'hidden' } },
      fail: [{ when: detected, reason: '@c9m1.fail.lo', allowSkipAfter: 3, skipTo: 'co-ba' }],
      exit: [{ k: 'despawn', tag: 'cop' }, { k: 'stealth', arena: null }],
    },
    {
      id: 'co-ba', minutes: 0.9,
      enter: [
        // also the landing of 'Bỏ qua đoạn này' after three searches: the officers are gone either way
        { k: 'despawn', tag: 'cop' }, { k: 'stealth', arena: null },
        { k: 'cutscene', id: 'c9m1-lam' }, { k: 'journal', id: 'j-lam-co-ba' }, { k: 'flag', name: 'knowsLam' },
        talk('c9m1-coba', [say('tin', 'c9m1.tin1'), say('coba', 'c9m1.coba1'), say('coba', 'c9m1.coba2'), say('coba', 'c9m1.coba3')]),
        RAINCOAT, { k: 'toast', text: '@c9m1.toast.ao' },
        { k: 'sms', from: 'van', text: '@c9m1.sms1', burner: true }, { k: 'sms', from: 'van', text: '@c9m1.sms2', burner: true },
        { k: 'fade', to: 'black', ms: 900 }, { k: 'time', hour: 11.33 },
        { k: 'space', leave: 'cafe-co-ba.backDoor' },
        { k: 'title', kind: 'time', text: '@c9m1.title3', sub: '@c9m1.title3Sub' },
        { k: 'fade', to: 'clear', ms: 900 },
        aside('c9m1-di', [think('c9m1.think.di')]),
      ],
    },
    {
      id: 'cho-sang', minutes: 0.6, objective: '@c9m1.obj.cho', marker: { at: 'cho-an-hoa.eastMouth', label: '@c9m1.mk.cho', style: 'go' },
      checkpoint: { label: '@c9m1.cp.cho', setup: [put('cafe-co-ba.backDoor', undefined, 4), RAINCOAT] },
      meters: [meterNhan('c9m1.meter.nhan')],
      enter: [hint('c9m1.hint.nhan', 9000), aside('c9m1-cho', [think('c9m1.think.cho')])],
      watchers: [{ when: after(8), do: [hint('c9m1.hint.u')] }, calledWatch],
      // without Bà Sáu's help the route is longer: the back alleys around the junction
      branch: [{ when: { k: 'all', of: [reach('cho-an-hoa.eastMouth', 4), { k: 'not', c: flag('helpedBaSau') }] }, goto: 'vong-hem' }],
      done: reach('cho-an-hoa.eastMouth', 4),
    },
    {
      id: 'xe-che', minutes: 0.7, objective: '@c9m1.obj.xeChe', marker: { at: 'xe-che-c9', label: '@c9m1.mk.xeChe', style: 'talk' }, next: 'qua-chot',
      checkpoint: { label: '@c9m1.cp.xeChe', setup: [put('cho-an-hoa.eastMouth', undefined, 30), RAINCOAT] },
      meters: [meterNhan('c9m1.meter.nhan')],
      interact: [{ id: 'nup-tarp', at: 'xe-che-c9', r: 1.6, prompt: '@c9m1.int.tarp', kind: 'hide', when: 'foot' }],
      enter: [
        { k: 'prop', id: 'xe-che', kind: 'xe-che', at: 'xe-che-c9', yaw: 0, scope: 'mission' },
        { k: 'spawn', id: 'basau', cast: 'basau', at: 'xe-che-c9', team: 'ally', tags: ['civilian'], behaviour: { k: 'act', name: 'serve' } },
        ...PATROL, bark('basau', 'c9m1.bark.basau1', true), hint('c9m1.hint.tarp', 8000),
      ],
      watchers: [{ when: used('nup-tarp'), do: [
        aside('c9m1-tarp', [think('c9m1.think.tarp')]), { k: 'wait', seconds: 3 }, bark('tt-2', 'c9m1.bark.tt2'), { k: 'wait', seconds: 2.5 },
        bark('basau', 'c9m1.bark.basau2'), { k: 'wait', seconds: 3 }, bark('tt-1', 'c9m1.bark.tt1')] }],
      done: { k: 'all', of: [used('nup-tarp'), { k: 'actor', id: 'tt-1', at: 'ch9.tuan-tra-b', r: 3 }] },
      fail: [{ when: starred, reason: '@c9m1.fail.tuanTra' }],
      exit: [
        talk('c9m1-ba-sau', [say('basau', 'c9m1.bs1'), say('basau', 'c9m1.bs2'), say('tin', 'c9m1.t.bs'), say('basau', 'c9m1.bs3')]),
        { k: 'journal', id: 'j-ba-sau-che' }, { k: 'despawn', tag: 'tuan-tra' },
      ],
    },
    {
      id: 'vong-hem', minutes: 0.7, objective: '@c9m1.obj.vong', marker: { at: 'ch9.hem-vong', label: '@c9m1.mk.hem', style: 'go' }, next: 'qua-chot',
      meters: [meterNhan('c9m1.meter.nhan')],
      enter: [...PATROL, aside('c9m1-vong', [think('c9m1.think.vong')])],
      watchers: [calledWatch],
      done: reach('ch9.hem-vong', 5),
      fail: [{ when: starred, reason: '@c9m1.fail.tuanTra' }],
      exit: [{ k: 'despawn', tag: 'tuan-tra' }],
    },
    {
      id: 'qua-chot', minutes: 1.1, objective: '@c9m1.obj.chot',
      checkpoint: { label: '@c9m1.cp.chot', setup: [putNear(['ch9.hem-vong', 'xe-che-c9'], 25), RAINCOAT, { k: 'despawn', tag: 'tuan-tra' }] },
      marker: [
        { id: 'mk-54', at: 'cp-54-0', label: '@c9m1.mk.chot', style: 'enemy' }, { id: 'mk-108', at: 'cp-108-0', label: '@c9m1.mk.chot', style: 'enemy' },
        { id: 'mk-huong', at: 'ch9.giua-hem', label: '@c9m1.mk.huong', style: 'go' },
      ],
      meters: [meterNhan('c9m1.meter.nhan')],
      enter: [hint('c9m1.hint.chot', 9000)],
      watchers: [{ when: after(14), do: [aside('c9m1-poster', [think('c9m1.think.poster')])] }, calledWatch],
      // any way through: the back alley, the main road past the screens, or straight on to the mall
      done: { k: 'any', of: [reach('ch9.giua-hem', 8), reach('ch9.giua-an-hoa', 10), reach('tttm.shippers', 10)] },
    },
    {
      id: 'vao-quan-1', minutes: 0.8, objective: '@c9m1.obj.q1',
      checkpoint: { label: '@c9m1.cp.q1', setup: [putNear(['ch9.giua-hem', 'ch9.giua-an-hoa', 'tttm.shippers'], 25), RAINCOAT] },
      marker: [{ id: 'mk-162', at: 'cp-162-0', label: '@c9m1.mk.chot3', style: 'enemy' }, { id: 'mk-tttm', at: 'tttm.shippers', label: '@c9m1.mk.tttm', style: 'go' }],
      meters: [meterNhan('c9m1.meter.nhan')],
      enter: [aside('c9m1-q1', [think('c9m1.think.q1')])],
      watchers: [calledWatch],
      done: { k: 'all', of: [reach('tttm.shippers', 8), noStar] },
    },
    {
      id: 'dam-shipper', minutes: 0.6, objective: '@c9m1.obj.shipper',
      subs: [
        { id: 'coi-ao', text: '@c9m1.sub.coiAo', done: used('coi-ao-mua') },
        { id: 'dung', text: '@c9m1.sub.dung', done: { k: 'hold', seconds: 5, c: reach('tttm.shippers', 3) } },
      ],
      interact: [{ id: 'coi-ao-mua', at: 'tttm.shippers', r: 2.5, prompt: '@c9m1.int.coiAo', kind: 'use', when: 'foot' }],
      enter: [
        ...SHIPPERS.map((id): Act => ({ k: 'spawn', id, cast: 'shipper-trua', template: 'shipper', at: 'tttm.shippers', team: 'neutral', tags: ['shipper', 'civilian'], behaviour: { k: 'act', name: 'phone-bored' } })),
        { k: 'sms', from: 'van', text: '@c9m1.sms3', burner: true },
      ],
      watchers: [
        { when: used('coi-ao-mua'), do: [{ k: 'player', outfit: 'tin-shipper' }, aside('c9m1-shipper', [think('c9m1.think.shipper')])] },
        { when: after(4), do: [bark('sh-3', 'c9m1.bark.sh1')] },
      ],
      exit: [bark('sh-1', 'c9m1.bark.sh2', true)],
    },
    {
      id: 'xuong-ham', minutes: 0.4, objective: '@c9m1.obj.ham', marker: { at: 'tttm.ramp', label: '@c9m1.mk.ham', style: 'go' },
      enter: [...SHIPPERS.map((id): Act => ({ k: 'behave', id, b: { k: 'goto', at: 'tttm.ramp' } })), aside('c9m1-ham', [think('c9m1.think.ham')])],
      done: reach('tttm.ramp', 4),
      exit: [
        { k: 'fade', to: 'black', ms: 900 }, { k: 'despawn', tag: 'shipper' }, { k: 'do', op: 'wanted', args: { mode: 'cooldown', maxWanted: 1, meter: RECOGNITION } },
        { k: 'time', hour: 12.67 }, { k: 'teleport', at: 'nha-chi-van' }, { k: 'space', enter: 'van-safehouse', link: 'front' },
        { k: 'title', kind: 'time', text: '@c9m1.title2', sub: '@c9m1.title2Sub' }, { k: 'fade', to: 'clear', ms: 900 },
      ],
    },
    {
      id: 'nha-van', minutes: 0.9,
      enter: [
        { k: 'spawn', id: 'van', cast: 'van', at: 'van-safehouse/table', team: 'ally', behaviour: { k: 'act', name: 'sit-stool-phone' } },
        { k: 'if', c: tookEnvelope, then: [{ k: 'cutscene', id: 'c9m1-phong-bi' }, { k: 'flag', name: 'envelopeBurnt' }] },
        talk('c9m1-van', [say('van', 'c9m1.v1'), say('van', 'c9m1.v2'), say('van', 'c9m1.v3'), say('van', 'c9m1.v4'), say('tin', 'c9m1.t1'), say('van', 'c9m1.v5'), say('van', 'c9m1.v6')]),
        { k: 'call', id: 'c9m1-ma', from: 'bana', ring: false, lines: [phone('bana', 'c9m1.ma1')] },
        { k: 'choice', id: 'noiVoiMa', prompt: '@c9m1.q.ma', options: [{ id: 'tin', text: '@c9m1.opt.tin' }, { id: 'hua', text: '@c9m1.opt.hua' }] },
        { k: 'call', id: 'c9m1-ma-2', from: 'bana', ring: false, lines: [
          phone('tin', 'c9m1.t.tin', { if: flag('choice:noiVoiMa', 'tin') }), phone('bana', 'c9m1.ma.tin', { if: flag('choice:noiVoiMa', 'tin') }),
          phone('tin', 'c9m1.t.hua', { if: flag('choice:noiVoiMa', 'hua') }), phone('bana', 'c9m1.ma.hua', { if: flag('choice:noiVoiMa', 'hua') }),
          phone('bana', 'c9m1.ma2'), phone('tin', 'c9m1.t2'), phone('bana', 'c9m1.ma3')] },
        talk('c9m1-cuoi', [think('c9m1.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'knowsBiaHoi' }],
  medals: { par: 480, ghost: true },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'] },
});

// ---- c9-m2 · Bia hơi và đoạn ghi âm --------------------------------------------------------------------------

const PORTER: Act = { k: 'player', outfit: 'tin-khuan-vac' };
const PORTER_COVER: Act = { k: 'stealth', arena: 'bia-hoi', variant: 'night', rules: RULES, cover: 'porter' };
/** Lực's table: Lực, the bagman, the bodyguard behind them, the black SUV at the curb (rebuilt by each checkpoint). */
const LUC_TABLE: Act[] = [
  { k: 'spawn', id: 'luc', cast: 'luc', at: 'bia-hoi.lucTable', team: 'neutral', tags: ['ban-luc'], behaviour: { k: 'act', name: 'drink-beer' } },
  { k: 'spawn', id: 'xach-tien', cast: 'xach-tien', template: 'ran-den', at: 'bia-hoi.lucTable', team: 'neutral', tags: ['ban-luc'], behaviour: { k: 'act', name: 'drink-beer' } },
  { k: 'spawn', id: 've-si-luc', cast: 've-si-luc', template: 'ran-den', at: 'bia-hoi.lucTable', team: 'hostile', tags: ['ban-luc'], behaviour: { k: 'guard', post: 'bia-hoi.lucTable', sweep: 60 } },
  { k: 'vehicle', id: 'suv-luc', model: 'suv-den', at: 'ch9.suv-luc', yaw: 0, state: 'park' },
];
const kegMark = (n: number) => [{ id: `mk-bagac-${n}`, at: 'bia-hoi.kegs', label: '@c9m2.mk.bagac', style: 'go' as const }, { id: `mk-kho-${n}`, at: 'bia-hoi', label: '@c9m2.mk.kho', style: 'subtle' as const }];
/** One keg from the ba gác to the storeroom door: pick it up (the drop point appears then), carry it slowly, set it down. */
const keg = (n: 1 | 2 | 3): StepDef => ({
  id: `bom-${n}`, minutes: n === 1 ? 0.5 : 0.4, objective: `@c9m2.obj.bom${n}`, marker: kegMark(n), hud: { cover: true },
  ...(n === 1 ? { checkpoint: { label: '@c9m2.cp.bom', setup: [put('bia-hoi.backDoor', undefined, 14), PORTER, PORTER_COVER, { k: 'player', carry: null, lock: null }] } } : {}),
  meters: [meterNhan('c9m2.meter.nhan')],
  subs: [{ id: 'lay', text: '@c9m2.sub.lay', done: used(`lay-bom-${n}`) }, { id: 'de', text: '@c9m2.sub.de', done: used(`de-bom-${n}`) }],
  interact: [{ id: `lay-bom-${n}`, at: 'bia-hoi.kegs', r: 1.8, hold: 1, prompt: '@c9m2.int.lay', kind: 'pick', when: 'foot' }],
  enter: n === 1 ? [hint('c9m2.hint.bom', 8000)] : [],
  watchers: [
    { when: used(`lay-bom-${n}`), do: [
      { k: 'player', carry: 'bom-bia', lock: ['run'] },
      { k: 'interactable', id: `de-bom-${n}`, at: 'bia-hoi', r: 2.2, prompt: '@c9m2.int.de', kind: 'use', when: 'foot' },
      ...(n === 1 ? [aside('c9m2-bom', [think('c9m2.think.bom')])] : n === 2 ? [bark('nhau-1', 'c9m2.bark.nhau1', true)] : [bark('nhau-2', 'c9m2.bark.nhau2')])] },
  ],
  exit: [{ k: 'player', carry: null, lock: null }, ...(n === 3 ? [{ k: 'space', enter: 'bia-hoi-storeroom', link: 'front' } as Act] : [])],
});

const c9m2 = defineMission({
  id: 'c9-m2', meta: { hours: [18, 21], giver: 'van' }, chain: 'c9-m3', lethal: 'fail',
  start: { at: 'bia-hoi.backDoor', yaw: Math.PI, hour: 19, weather: 'cloudy', lunar: 14, outfit: 'tin-ao-tu' },
  world: { traffic: 'night', crowd: 'night', police: 'story', maxWanted: 1, gangs: 'calm', clock: { hour: 19, freeze: true }, weather: { set: 'cloudy', lock: true }, activities: NO_HUB },
  setup: [
    wanted('manhunt'),
    { k: 'spawn', id: 'tam-ho', cast: 'tam-ho', at: 'bia-hoi', team: 'ally', tags: ['ho-vang'], behaviour: { k: 'act', name: 'crack-peanuts' } },
    { k: 'spawn', id: 'nhau-1', cast: 'khach-nhau', template: 'resident', at: 'bia-hoi.drunkTable', team: 'neutral', tags: ['civilian'], behaviour: { k: 'act', name: 'drink-beer' } },
    { k: 'spawn', id: 'nhau-2', cast: 'khach-nhau', template: 'resident', at: 'bia-hoi.drunkTable', team: 'neutral', tags: ['civilian'], behaviour: { k: 'act', name: 'drink-beer' } },
    { k: 'spawn', id: 'ong-say', cast: 'ong-say', template: 'resident', at: 'bia-hoi.drunkTable', team: 'neutral', tags: ['civilian'], behaviour: { k: 'act', name: 'drink-beer' } },
    { k: 'vehicle', id: 'ba-gac', model: 'ba-gac', at: 'bia-hoi.kegs', yaw: 0, state: 'park' },
    // Tám Hổ's boys brought the bike from Cô Ba's lane and changed its plate: it waits where the foot chase will end
    { k: 'vehicle', id: 'dream', model: 'dream', at: 'ch9.dream-hem', yaw: 0, state: 'park' },
  ],
  steps: [
    {
      id: 'gap-tam-ho', minutes: 0.6,
      enter: [
        { k: 'title', kind: 'time', text: '@c9m2.title', sub: '@c9m2.titleSub' },
        { k: 'cutscene', id: 'c9m2-tam-ho' },
        PORTER, PORTER_COVER, { k: 'toast', text: '@c9m2.toast.vo' },
        talk('c9m2-tam-ho', [say('tam-ho', 'c9m2.th5'), say('tam-ho', 'c9m2.th6'), say('tam-ho', 'c9m2.th7'), say('tin', 'c9m2.t1'), say('tam-ho', 'c9m2.th8')]),
        { k: 'journal', id: 'j-tam-ho' }, { k: 'flag', name: 'tamHoAlly' },
      ],
    },
    keg(1), keg(2), keg(3),
    {
      id: 'gan-cam', minutes: 1, objective: '@c9m2.obj.kho', hud: { light: true, noise: true },
      checkpoint: { label: '@c9m2.cp.kho', setup: [inSpace('bia-hoi-storeroom', 'front'), put('bia-hoi-storeroom/kegs', undefined, 3), PORTER, { k: 'player', carry: null, lock: null }] },
      timer: { seconds: 75, label: '@c9m2.timer.luc', fail: '@c9m2.fail.tre' },
      subs: [
        { id: 'leo', text: '@c9m2.sub.leo', done: climbed('leo-ke') },
        { id: 'gan', text: '@c9m2.sub.gan', done: used('gan-cam') },
        { id: 'xuong', text: '@c9m2.sub.xuong', done: climbed('xuong-ke') },
      ],
      interact: [
        { id: 'leo-ke', at: 'bia-hoi-storeroom/shelf', to: 'bia-hoi-storeroom/vent', r: 1.4, prompt: '@c9m2.int.leo', kind: 'climb', when: 'foot' },
        { id: 'gan-cam', at: 'bia-hoi-storeroom/vent', r: 1.2, hold: 2, prompt: '@c9m2.int.gan', kind: 'use', when: 'foot', level: 'shelf' },
        { id: 'xuong-ke', at: 'bia-hoi-storeroom/vent', to: 'bia-hoi-storeroom/shelf', r: 1.4, prompt: '@c9m2.int.xuong', kind: 'climb', when: 'foot', level: 'shelf' },
      ],
      enter: [hint('c9m2.hint.kho', 8000)],
      watchers: [
        { when: used('gan-cam'), do: [aside('c9m2-gan', [think('c9m2.think.gan')])] },
        { when: after(45), do: [aside('c9m2-hoi', [say('tam-ho', 'c9m2.th9', { voice: 'shout' })])] },
      ],
      exit: [{ k: 'flag', name: 'ventCam' }, { k: 'space', leave: 'bia-hoi' }],
    },
    {
      id: 'ra-ban', minutes: 0.4, objective: '@c9m2.obj.ban', marker: { at: 'bia-hoi.tinTable', label: '@c9m2.mk.ban', style: 'go' }, hud: { cover: true },
      interact: [{ id: 'ngoi-ban', at: 'bia-hoi.tinTable', r: 1.6, prompt: '@c9m2.int.ban', kind: 'seat', when: 'foot' }],
      enter: [...LUC_TABLE, aside('c9m2-ban', [think('c9m2.think.ban')])],
      done: used('ngoi-ban'),
      fail: [{ when: { k: 'near', a: 'luc', b: 'player', r: 3 }, reason: '@c9m2.fail.gan' }],
      exit: [{ k: 'player', pose: 'sit-stool' }],
    },
    {
      // the drunk squints over: a bluff with stakes (a loud answer turns the whole bar round: replay the table)
      id: 'nghe-luc', minutes: 1.3, objective: '@c9m2.obj.nghe', hud: { cover: true },
      checkpoint: { label: '@c9m2.cp.nghe', setup: [put('bia-hoi.tinTable', undefined, 2), PORTER, PORTER_COVER, { k: 'flag', name: 'ventCam' }, ...LUC_TABLE, { k: 'player', pose: 'sit-stool' }] },
      meters: [{ id: 'eavesdrop:ban-luc', label: '@c9m2.meter.nghe', kind: 'bar', max: 1 }, meterNhan('c9m2.meter.nhan')],
      enter: [
        { k: 'eavesdrop', id: 'ban-luc', source: 'luc', r: 7, seconds: 14, lines: [
          say('xach-tien', 'c9m2.n1'), say('luc', 'c9m2.n2'), say('xach-tien', 'c9m2.n3'), say('luc', 'c9m2.n4')] },
        { k: 'photoTarget', id: 'bien-suv', subject: 'suv-luc', evidence: 'ev-bien-suv', minQuality: 0.6, scope: 'step' },
        hint('c9m2.hint.nghe', 8000),
      ],
      watchers: [
        { id: 'say', when: after(5), do: [
          { k: 'behave', id: 'ong-say', b: { k: 'goto', at: 'bia-hoi.tinTable' } }, bark('ong-say', 'c9m2.bark.say1'), { k: 'wait', seconds: 2 },
          talk('c9m2-say', [say('ong-say', 'c9m2.say2', { voice: 'shout' })]),
          { k: 'choice', id: 'bluffSay', prompt: '@c9m2.q.say', style: 'bluff', options: [
            { id: 'giong', text: '@c9m2.opt.giong', then: [talk('c9m2-say-giong', [say('ong-say', 'c9m2.say.giong')])] },
            { id: 'bia', text: '@c9m2.opt.bia', then: [{ k: 'cash', n: -20 }, talk('c9m2-say-bia', [say('ong-say', 'c9m2.say.bia')])] },
            { id: 'cai', text: '@c9m2.opt.cai', then: [talk('c9m2-say-cai', [say('ong-say', 'c9m2.say.cai', { voice: 'shout' })])] }] },
          { k: 'behave', id: 'ong-say', b: { k: 'goto', at: 'bia-hoi.drunkTable' } }] },
        { when: after(10), do: [hint('c9m2.hint.xe')] },
        { when: owned('ev-bien-suv'), do: [aside('c9m2-xe', [think('c9m2.think.xe')])] },
      ],
      optional: [{ id: 'bien-suv', text: '@c9m2.opt.xe', when: owned('ev-bien-suv') }],
      done: { k: 'all', of: [{ k: 'on', ev: 'eavesdrop', id: 'ban-luc' }, { k: 'on', ev: 'choice', id: 'bluffSay' }] },
      fail: [
        { when: { k: 'near', a: 'luc', b: 'player', r: 3 }, reason: '@c9m2.fail.gan' },
        { when: { k: 'all', of: [{ k: 'on', ev: 'choice', id: 'bluffSay' }, flag('choice:bluffSay', 'cai')] }, reason: '@c9m2.fail.say', soft: true },
      ],
      retry: [{ k: 'behave', id: 'ong-say', b: { k: 'goto', at: 'bia-hoi.drunkTable' } }, { k: 'player', pose: 'sit-stool' }],
      exit: [
        { k: 'cutscene', id: 'c9m2-ban-nhau' },
        { k: 'evidence', id: 'ev-ghi-am-luc' }, { k: 'evidence', id: 'ev-luc-ram' }, { k: 'journal', id: 'j-ghi-am' },
        { k: 'flag', name: 'recordedLuc' }, { k: 'flag', name: 'knowsRamPlan' },
        { k: 'cutscene', id: 'c9m2-lo' }, { k: 'player', pose: null },
      ],
    },
    {
      // the bodyguard found the vent: over the courtyard wall, through the loading-bay gate, onto the bike
      id: 'chay-bo', minutes: 0.9, objective: '@c9m2.obj.chay', hud: { light: true, noise: true },
      checkpoint: { label: '@c9m2.cp.chay', setup: [
        put('bia-hoi.tinTable', undefined, 4), { k: 'player', pose: null, carry: null, lock: null }, PORTER,
        { k: 'stealth', arena: 'bia-hoi', variant: 'night', rules: RULES, cover: null }, { k: 'despawn', tag: 'ban-luc' },
        { k: 'spawn', id: 've-si-luc', cast: 've-si-luc', template: 'ran-den', at: 'bia-hoi.lucTable', team: 'hostile', tags: ['ban-luc'], behaviour: { k: 'follow', target: 'player', dist: 0.8 } },
        { k: 'vehicle', id: 'suv-luc', model: 'suv-den', at: 'ch9.suv-luc', yaw: 0, state: 'park' },
        { k: 'do', op: 'danger', args: { on: true } }, { k: 'music', id: 'pulse' }] },
      marker: [{ id: 'mk-cua', at: 'bia-hoi.backDoor', label: '@c9m2.mk.cua', style: 'go' }, { id: 'mk-xe', at: 'ch9.dream-hem', label: '@c9m2.mk.xe', style: 'go' }],
      subs: [
        { id: 'tuong', text: '@c9m2.sub.tuong', done: climbed('vao-san') },
        { id: 'cong', text: '@c9m2.sub.cong', done: used('cong-sau') },
        { id: 'xe', text: '@c9m2.sub.xe', done: { k: 'reach', at: 'ch9.dream-hem', r: 2.5, mode: 'bike' } },
      ],
      interact: [
        { id: 'vao-san', at: 'bia-hoi.backDoor', to: 'san-sau-pho-dem.drop', r: 1.8, prompt: '@c9m2.int.tuong', kind: 'climb', when: 'foot' },
        { id: 'cong-sau', at: 'san-sau-pho-dem.loadingBay', r: 1.8, prompt: '@c9m2.int.cong', kind: 'enter', when: 'foot' },
      ],
      enter: [hint('c9m2.hint.chay', 8000), bark('ve-si-luc', 'c9m2.bark.vs3', true)],
      watchers: [{ when: climbed('vao-san'), do: [aside('c9m2-san', [think('c9m2.think.san')])] }],
      fail: [{ when: { k: 'near', a: 've-si-luc', b: 'player', r: 1.2 }, reason: '@c9m2.fail.tom', allowSkipAfter: 3 }],
      exit: [{ k: 'despawn', id: 've-si-luc' }],
    },
    {
      id: 'chay-xe', minutes: 1.1, objective: '@c9m2.obj.xe', marker: { at: 'hem-sau-nha-nghi.exit', label: '@c9m2.mk.hem', style: 'go' }, skipTo: 'mat-dau',
      checkpoint: { label: '@c9m2.cp.xe', setup: [
        put('ch9.dream-hem', 'dream', 3), { k: 'player', pose: null, carry: null, lock: null }, PORTER, { k: 'stealth', arena: null },
        { k: 'vehicle', id: 'suv-luc', model: 'suv-den', at: 'ch9.suv-luc', yaw: 0, state: 'drive' },
        { k: 'do', op: 'chase', args: { id: 'duoi-luc', controller: 'pursuers', rides: ['suv-luc'], use: 'car', armed: 'none', target: 'player', loseAfter: 15, searchFor: 20, maxRange: 140, meter: 'thoat:suv-luc' } },
        ...(['hv-1', 'hv-2'] as const).map((id): Act => ({ k: 'spawn', id, cast: 'ho-vang', template: 'ho-vang', at: 'hem-sau-nha-nghi.exit', team: 'ally', tags: ['ho-vang'], behaviour: { k: 'act', name: 'cross-arms' } })),
        { k: 'do', op: 'chase', args: { id: 'xe-bia', controller: 'allyBlock', at: 'hem-sau-nha-nghi.exit', after: 'player', prop: 'xe-bia', crew: ['hv-1', 'hv-2'] } },
        { k: 'do', op: 'danger', args: { on: true } }, { k: 'music', id: 'pulse' }] },
      meters: [{ id: 'thoat:suv-luc', label: '@c9m2.meter.thoat', kind: 'bar', max: 1 }],
      enter: [hint('c9m2.hint.hem', 8000)],
      watchers: [{ when: reach('hem-sau-nha-nghi.exit', 6), do: [bark('hv-1', 'c9m2.bark.hv1', true), { k: 'wait', seconds: 1.5 }, bark('hv-2', 'c9m2.bark.hv2', true)] }],
      done: { k: 'on', ev: 'escaped', id: 'duoi-luc' },
      fail: [{ when: { k: 'on', ev: 'caught', id: 'duoi-luc' }, reason: '@c9m2.fail.bat', allowSkipAfter: 3 }],
      exit: [aside('c9m2-thoat', [think('c9m2.think.thoat')])],
    },
    {
      id: 'mat-dau', minutes: 0.5, objective: '@c9m2.obj.ve', marker: { at: 'nha-chi-van', label: '@c9m2.mk.ve', style: 'go' },
      enter: [
        { k: 'stop', id: 'duoi-luc' }, { k: 'stop', id: 'xe-bia' }, { k: 'do', op: 'danger', args: { on: false } }, { k: 'music', id: null },
        aside('c9m2-mat', [think('c9m2.think.mat'), think('c9m2.think.mat2')]),
      ],
      done: { k: 'reach', at: 'nha-chi-van', r: 6, mode: 'bike' },
      exit: [
        { k: 'fade', to: 'black', ms: 900 }, { k: 'despawn', tag: 'ho-vang' }, { k: 'time', hour: 22.17 }, { k: 'space', enter: 'van-safehouse', link: 'front' },
        { k: 'title', kind: 'time', text: '@c9m2.title2', sub: '@c9m2.title2Sub' }, { k: 'fade', to: 'clear', ms: 900 },
      ],
    },
    {
      id: 'nha-van', minutes: 1.2,
      enter: [
        { k: 'player', outfit: 'tin-ao-tu' },
        { k: 'spawn', id: 'van', cast: 'van', at: 'van-safehouse/table', team: 'ally', behaviour: { k: 'act', name: 'sit-stool-phone' } },
        talk('c9m2-van', [say('van', 'c9m2.v1'), say('van', 'c9m2.v2')]),
        { k: 'deduce', id: 'ai-chan-xe' },
        talk('c9m2-chan', [say('tin', 'c9m2.t2'), say('van', 'c9m2.v3'), say('van', 'c9m2.v4')]),
        { k: 'cutscene', id: 'c9m2-48-gio' }, { k: 'journal', id: 'j-48-gio' },
        talk('c9m2-kieu-anh', [say('kieu-anh', 'c9m2.ka1', { voice: 'phone' }), say('kieu-anh', 'c9m2.ka2', { voice: 'phone' }), say('van', 'c9m2.v5')]),
        talk('c9m2-sung', [say('van', 'c9m2.v6'), say('van', 'c9m2.v7'), say('van', 'c9m2.v8')]),
        { k: 'choice', id: 'sungVan', prompt: '@c9m2.q.sung', options: [
          { id: 'cam', text: '@c9m2.opt.cam', then: [{ k: 'give', item: 'sung-van' }, talk('c9m2-sung-cam', [say('tin', 'c9m2.sung.cam1'), say('van', 'c9m2.sung.cam2')])] },
          { id: 'tra', text: '@c9m2.opt.tra', then: [talk('c9m2-sung-tra', [say('tin', 'c9m2.sung.tra1'), say('tin', 'c9m2.sung.tra2'), say('van', 'c9m2.sung.tra3')])] }] },
        talk('c9m2-cuoi', [think('c9m2.think.cuoi')]),
      ],
    },
  ],
  medals: { par: 540, ghost: true, clues: ['bien-suv'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover', 'clipCam'], flags: { knowsBiaHoi: true } },
});

// ---- c9-m3 · Quang trở về ------------------------------------------------------------------------------------

const armed = flag('choice:sungVan', 'cam');
/** The café ground floor ('raid' variant) and the market lane: guns only if Tín took Vân's pistol; a kill does not end the mission. */
const RAID: Act = { k: 'if', c: armed,
  then: [{ k: 'stealth', arena: 'quan-co-ba', variant: 'raid', rules: { ...RULES, guns: 'any', lethal: 'allow' } }],
  else: [{ k: 'stealth', arena: 'quan-co-ba', variant: 'raid', rules: { ...RULES, lethal: 'allow' } }] };
const raider = (id: string, at: string, b: Behaviour): Act =>
  ({ k: 'spawn', id, cast: 'rd-ao-gia', template: 'ran-den', at, team: 'hostile', tags: ['raid'], weapon: 'pipe', behaviour: b });
const BIKERS = ['xe-rd-1', 'xe-rd-2'];
const killed: Cond = { k: 'stat', name: 'kills', op: '>', value: 0 };

const c9m3 = defineMission({
  id: 'c9-m3', meta: { hours: [23, 2], giver: 'coba' }, lethal: 'allow',
  start: { at: 'ch9.dream-cho', yaw: H, vehicle: 'dream', hour: 23.5, weather: 'rain', lunar: 14, outfit: 'tin-ao-tu' },
  world: { traffic: 'night', crowd: 'night', police: 'story', maxWanted: 1, gangs: 'calm', clock: { hour: 23.5, freeze: true }, weather: { set: 'rain', lock: true }, activities: NO_HUB },
  setup: [
    wanted('cooldown'),
    { k: 'if', c: armed, then: [{ k: 'do', op: 'arm', args: { weapon: 'pistol', ammo: 12, from: 'van' } }] },
  ],
  steps: [
    {
      id: 've-quan', minutes: 0.5, objective: '@c9m3.obj.ve', marker: { at: 'cafe-co-ba.backDoor', label: '@c9m3.mk.cuaSau', style: 'go' },
      enter: [{ k: 'title', kind: 'time', text: '@c9m3.title', sub: '@c9m3.titleSub' }, aside('c9m3-ve', [think('c9m3.think.ve')])],
      done: { k: 'reach', at: 'cafe-co-ba.backDoor', r: 2.5, mode: 'foot' },
      exit: [
        { k: 'cutscene', id: 'c9m3-quang' },
        { k: 'give', item: 'the-b2' }, { k: 'evidence', id: 'ev-the-b2' }, { k: 'journal', id: 'j-quang-ve' }, { k: 'flag', name: 'quangBack' },
        { k: 'spawn', id: 'quang', cast: 'quang', at: 'cafe-co-ba.backStairs', team: 'ally', behaviour: { k: 'act', name: 'phone-bored' } },
      ],
    },
    {
      id: 'tam-biet', minutes: 0.6, objective: '@c9m3.obj.vao', marker: { at: 'cafe-co-ba.backDoor', style: 'subtle' },
      interact: [{ id: 'vao-quan', at: 'cafe-co-ba.backDoor', r: 2, prompt: '@c9m3.int.vao', kind: 'enter', when: 'foot' }],
      done: used('vao-quan'),
      exit: [
        { k: 'space', enter: 'co-ba-ground', link: 'backDoor' },
        { k: 'spawn', id: 'coba', cast: 'coba', at: 'co-ba-ground/table', team: 'ally', tags: ['ally'], behaviour: { k: 'act', name: 'kettle-pour' } },
        { k: 'player', pose: 'sit-stool' },
        talk('c9m3-coba', [say('coba', 'c9m3.coba1'), say('coba', 'c9m3.coba2'), say('quang', 'c9m3.q1'), say('tin', 'c9m3.t1'), say('coba', 'c9m3.coba3'), say('coba', 'c9m3.coba4')]),
        { k: 'player', pose: null }, { k: 'despawn', id: 'quang' },
        { k: 'cutscene', id: 'c9m3-dot-kich' },
      ],
    },
    {
      id: 'bep', minutes: 0.8, objective: '@c9m3.obj.bep', marker: { at: 'co-ba-ground/backDoor', label: '@c9m3.mk.cuaSau', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c9m3.cp.bep', setup: [
        inSpace('co-ba-ground', 'backDoor'), put('co-ba-ground/table', undefined, 3), { k: 'player', pose: null }, RAID,
        { k: 'spawn', id: 'coba', cast: 'coba', at: 'co-ba-ground/table', team: 'ally', tags: ['ally'], behaviour: { k: 'escort', leader: 'player' } },
        raider('rd-1', 'co-ba-ground/shutter', { k: 'patrol', route: ['co-ba-ground/shutter', 'co-ba-ground/counter', 'co-ba-ground/kitchen'], waits: [1, 2, 2] }),
        raider('rd-2', 'co-ba-ground/shutter', { k: 'guard', post: 'co-ba-ground/counter', sweep: 70 }),
        { k: 'do', op: 'danger', args: { on: true } }, { k: 'music', id: 'pulse' }] },
      interact: [{ id: 'ra-cua-sau', at: 'co-ba-ground/backDoor', r: 1.6, prompt: '@c9m3.int.cuaSau', kind: 'enter', when: 'foot' }],
      enter: [{ k: 'behave', id: 'coba', b: { k: 'escort', leader: 'player' } }, hint('c9m3.hint.bep', 8000), bark('rd-1', 'c9m3.bark.rd2', true)],
      done: { k: 'all', of: [used('ra-cua-sau'), { k: 'near', a: 'coba', b: 'player', r: 4 }] },
      fail: [{ when: { k: 'on', ev: 'caught', id: 'coba' }, reason: '@c9m3.fail.coba', allowSkipAfter: 3 }],
      exit: [{ k: 'despawn', tag: 'raid' }, { k: 'despawn', id: 'coba' }, { k: 'space', leave: 'cafe-co-ba.backDoor' }],
    },
    {
      id: 'hem-cho', minutes: 1.3, objective: '@c9m3.obj.hem', marker: { at: 'cho-an-hoa.eastMouth', label: '@c9m3.mk.dauHem', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c9m3.cp.hem', setup: [
        put('cafe-co-ba.backDoor', undefined, 4), RAID,
        { k: 'spawn', id: 'coba', cast: 'coba', at: 'cafe-co-ba.backDoor', team: 'ally', tags: ['ally'], behaviour: { k: 'escort', leader: 'player' } },
        { k: 'spawn', id: 'muc', template: 'watchdog', at: 'cafe-co-ba.backStairs', team: 'ally', tags: ['ally'], behaviour: { k: 'follow', target: 'coba', dist: 1.5 } },
        raider('rd-3', 'cho-an-hoa.westMouth', { k: 'patrol', route: ['cho-an-hoa.westMouth', 'cho-an-hoa.stall'], waits: [1, 3] }),
        raider('rd-4', 'cho-an-hoa.stool', { k: 'guard', post: 'cho-an-hoa.stool', sweep: 80 }),
        raider('rd-5', 'cho-an-hoa.stall', { k: 'patrol', route: ['cho-an-hoa.stall', 'cho-an-hoa.stool'], waits: [2, 2] }),
        { k: 'do', op: 'danger', args: { on: true } }, { k: 'music', id: 'pulse' }] },
      enter: [
        bark('muc', 'c9m3.bark.muc', true), aside('c9m3-muc', [say('coba', 'c9m3.coba5', { voice: 'shout' })]), hint('c9m3.hint.hem', 8000),
        { k: 'if', c: armed, then: [hint('c9m3.hint.sung', 8000)] },
        { k: 'clue', id: 'ao-gia', at: 'cho-an-hoa.stall', r: 1.6, evidence: 'ev-ao-gia', examine: 'object:police-vest', scope: 'step' },
      ],
      watchers: [
        { when: after(2), do: [bark('rd-3', 'c9m3.bark.rd3', true)] }, { when: after(9), do: [bark('rd-4', 'c9m3.bark.rd4', true)] },
        { when: after(14), do: [hint('c9m3.hint.ao', 6000)] },
        { when: owned('ev-ao-gia'), do: [aside('c9m3-ao', [think('c9m3.think.ao')])] },
        { when: killed, do: [aside('c9m3-giet', [think('c9m3.think.giet'), think('c9m3.think.giet2')])] },
      ],
      optional: [{ id: 'ao-gia', text: '@c9m3.opt.ao', when: owned('ev-ao-gia') }],
      done: { k: 'all', of: [reach('cho-an-hoa.eastMouth', 4), { k: 'near', a: 'coba', b: 'player', r: 5 }] },
      fail: [{ when: { k: 'on', ev: 'caught', id: 'coba' }, reason: '@c9m3.fail.coba', allowSkipAfter: 3 }],
      exit: [{ k: 'cutscene', id: 'c9m3-ho-vang' }, { k: 'despawn', tag: 'raid' }],
    },
    {
      id: 'len-xe', minutes: 0.3, objective: '@c9m3.obj.lenXe', marker: { at: 'ch9.dream-cho', label: '@c9m3.mk.xe', style: 'go' },
      interact: [{ id: 'cho-co-ba', at: 'ch9.dream-cho', r: 2, prompt: '@c9m3.int.cho', kind: 'use', when: 'foot' }],
      enter: [
        ...(['hv-3', 'hv-4'] as const).map((id): Act => ({ k: 'spawn', id, cast: 'ho-vang', template: 'ho-vang', at: 'cho-an-hoa.eastMouth', team: 'ally', tags: ['ho-vang'], behaviour: { k: 'act', name: 'cross-arms' } })),
        { k: 'do', op: 'chase', args: { id: 'chan-hem', controller: 'allyBlock', at: 'cho-an-hoa.eastMouth', prop: 'xe-bia', crew: ['hv-3', 'hv-4'] } },
        { k: 'do', op: 'danger', args: { on: false } },
      ],
      done: used('cho-co-ba'),
      exit: [
        talk('c9m3-muc-o-lai', [say('coba', 'c9m3.coba6'), say('ho-vang', 'c9m3.hv3'), say('coba', 'c9m3.coba7'), say('tin', 'c9m3.t2')]),
        { k: 'fade', to: 'black', ms: 400 }, { k: 'despawn', id: 'muc' }, { k: 'despawn', id: 'coba' },
        // the next checkpoint's setup puts Cô Ba on the pillion (and again after a restore)
        { k: 'teleport', at: 'ch9.dream-cho', vehicle: 'dream' }, { k: 'fade', to: 'clear', ms: 400 },
      ],
    },
    {
      id: 'chay-chua', minutes: 1.2, objective: '@c9m3.obj.chua', marker: { at: 'chua-an-hoa.car', label: '@c9m3.mk.chua', style: 'go' }, skipTo: 'cong-chua',
      checkpoint: { label: '@c9m3.cp.chua', setup: [
        put('ch9.dream-cho', 'dream', 3), { k: 'do', op: 'pillion', args: { cast: 'coba' } },
        ...BIKERS.map((id, i): Act => ({ k: 'vehicle', id, model: 'scooter', at: `ch9.rd-xe-${i + 1}`, yaw: 0, driver: 'rd-xe', cruise: 12, state: 'drive' })),
        { k: 'do', op: 'pursue', args: { ids: BIKERS, target: 'player', unseen: 40, armed: 'pipe', spare: ['pillion'] } },
        { k: 'do', op: 'danger', args: { on: true } }, { k: 'music', id: 'pulse' }] },
      enter: [hint('c9m3.hint.da', 9000), aside('c9m3-om', [say('coba', 'c9m3.coba8', { voice: 'shout' })])],
      watchers: [
        { when: after(3), do: [aside('c9m3-xe', [say('rd-xe', 'c9m3.xe1', { voice: 'shout' })])] },
        { when: after(12), do: [hint('c9m3.hint.chua', 6000)] },
      ],
      optional: [{ id: 'da-xe', text: '@c9m3.opt.da', when: { k: 'on', ev: 'knockout', where: { cause: 'kick' } } }],
      done: { k: 'reach', at: 'chua-an-hoa.car', r: 7, mode: 'bike' },
      fail: [{ when: { k: 'on', ev: 'caught' }, reason: '@c9m3.fail.chan', allowSkipAfter: 3 }],
      // the chase and the kicks end before the gate (story-decisions.md 22): the bikers stop on the road
      exit: [{ k: 'do', op: 'pursue', args: { ids: BIKERS, stop: true } }, ...BIKERS.map((id): Act => ({ k: 'vehicle', id, state: 'stop' })), { k: 'do', op: 'danger', args: { on: false } }, { k: 'music', id: null }],
    },
    {
      id: 'cong-chua', minutes: 0.6,
      enter: [
        { k: 'do', op: 'pursue', args: { ids: BIKERS, stop: true } }, { k: 'do', op: 'danger', args: { on: false } }, { k: 'music', id: null },
        { k: 'spawn', id: 'thay', cast: 'thay-minh-tinh', at: 'chua-an-hoa.broom', team: 'neutral', tags: ['civilian'], behaviour: { k: 'act', name: 'sweep-leaves' } },
        { k: 'do', op: 'pillion', args: { cast: null } },
        { k: 'cutscene', id: 'c9m3-la-rung' }, { k: 'sting', id: 'pagoda-bell' },
        { k: 'journal', id: 'j-la-rung' }, { k: 'flag', name: 'coBaAtPagoda' },
      ],
    },
    {
      id: 'tap-hop', minutes: 0.6, objective: '@c9m3.obj.tapHop', marker: { at: 'ch9.vios-chua', label: '@c9m3.mk.van', style: 'go' },
      interact: [{ id: 'len-xe-van', at: 'ch9.vios-chua', r: 2.5, prompt: '@c9m3.int.xe', kind: 'enter', when: 'foot' }],
      enter: [{ k: 'vehicle', id: 'vios-van', model: 'vios-van', at: 'ch9.vios-chua', yaw: H, state: 'park' }],
      done: used('len-xe-van'),
      exit: [
        { k: 'cutscene', id: 'c9m3-tap-hop' },
        { k: 'if', c: armed, then: [talk('c9m3-sung', [say('van', 'c9m3.v.sung'), say('tin', 'c9m3.t.sung')]), { k: 'do', op: 'arm', args: { weapon: null } }, { k: 'take', item: 'sung-van' }] },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'quangComing' }],
  medals: { par: 480, clues: ['ao-gia'] },
  replay: {
    abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover', 'clipCam'],
    flags: { recordedLuc: true, knowsRamPlan: true, tamHoAlly: true }, evidence: ['ev-ghi-am-luc', 'ev-luc-ram'],
  },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string, role = false): CastDef =>
  ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look, ...(role ? { role: `@cast.${id}.role` } : {}) });
export const CAST: CastDef[] = [
  person('tam-ho', '#d8a020', 'TH', 'tam-ho', true), person('ho-vang', '#e0b23a', 'H', 'ho-vang'), person('ong-say', '#a0866a', 'S', 'resident'),
  person('ve-si-luc', '#3e434c', 'V', 'bouncer'), person('xach-tien', '#5a4a3c', 'X', 'ran-den'), person('dai-ta', '#4f6b4a', 'ĐT', 'colonel', true),
  person('ca-phuong', '#6c7f5a', 'CA', 'ward-cop'), person('rd-ao-gia', '#5d6b52', 'R', 'ran-den-vest'), person('rd-xe', '#3a3a40', 'R', 'ran-den'),
  person('kieu-anh', '#c98a5a', 'KA', 'kieu-anh', true), person('phat-thanh-vien', '#8fa3c0', 'TV', 'news-anchor'), person('shipper-trua', '#e77641', 'S', 'shipper'), person('khach-nhau', '#b0a08a', 'K', 'resident'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 9, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-ban-tin', 'document', 'banTin', 'tv', ['tin', 'luc', 'frame']),
  ev('ev-ghi-am-luc', 'recording', 'ghiAm', 'video', ['luc', 'police', 'frame']),
  ev('ev-luc-ram', 'testimony', 'lucRam', 'quote', ['luc', 'b2', 'truck', 'ram']),
  ev('ev-bien-suv', 'photo', 'bienSuv', 'car', ['luc', 'tail'], '51K-660.13'),
  ev('ev-the-b2', 'object', 'theB2', 'card', ['quang', 'cuong', 'b2', 'moonlight']),
  ev('ev-ao-gia', 'object', 'aoGia', 'vest', ['ran-den', 'luc', 'raid']),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [
  note('j-truy-na', 'diary', 'truyNa'), note('j-lam-co-ba', 'people', 'lamCoBa'), note('j-ba-sau-che', 'diary', 'baSauChe'),
  note('j-tam-ho', 'people', 'tamHo'), note('j-ghi-am', 'notes', 'ghiAm'), note('j-48-gio', 'notes', '48gio'),
  note('j-quang-ve', 'people', 'quangVe'), note('j-la-rung', 'diary', 'laRung'),
];
export const QUESTIONS: QuestionDef[] = [{
  id: 'ai-chan-xe', prompt: '@c9m2.q.chan', answer: 'bo', cost: 1, hint: '@c9m2.q.chan.hint',
  options: [
    { id: 'phuong', text: '@c9m2.q.chan.phuong' }, { id: 'bo', text: '@c9m2.q.chan.bo', needs: ['ev-ghi-am-luc', 'ev-luc-ram'] },
    { id: 'bao', text: '@c9m2.q.chan.bao' }],
  onCorrect: [{ k: 'flag', name: 'knowsTaskForce' }],
}];

/**
 * The chapter's own named points (validated on the map by scripts/story-ch09.test.mjs: walkable, clear of colliders by
 * `r`, road spots on the asphalt of their lane, in An Hòa or Quận 1, clear of every sites.ts spot):
 * - tuan-tra-a/b: the foot patrol's beat on the south sidewalk of ĐƯỜNG AN HÒA, past Bà Sáu's cart (c9-m1);
 * - hem-vong: the mid-block back alley east of ĐƯỜNG TRUNG TÂM, the long way round the first checkpoint;
 * - giua-an-hoa / giua-hem: halfway to Quận 1, on the main road's sidewalk or in the north–south alley of the block;
 * - suv-luc: Lực's black SUV at the southbound curb of ĐƯỜNG BỆNH VIỆN beside the bia hơi tables;
 * - dream-hem: the bike, re-plated by Tám Hổ's boys, on the sidewalk where the strip's back alley meets ĐƯỜNG BƯU ĐIỆN;
 * - dream-cho: the bike parked at the east end of the Chợ An Hòa lane (c9-m3);
 * - rd-xe-1/2: the two bikers' start in the southbound lane of ĐƯỜNG TRUNG TÂM, behind the lane's east mouth;
 * - vios-chua: Vân's car in the eastbound curb lane of ĐƯỜNG CHỢ CŨ, west of the pagoda gate.
 */
export const PLACES: Record<string, PlaceDef> = {
  'ch9.tuan-tra-a': { x: 44, z: 9.5, yaw: -H }, 'ch9.tuan-tra-b': { x: 14, z: 9.5, yaw: -H },
  'ch9.hem-vong': { x: 30, z: 31 }, 'ch9.giua-an-hoa': { x: 135, z: 9.5 }, 'ch9.giua-hem': { x: 135, z: 30 },
  'ch9.suv-luc': { x: 102.6, z: 40, yaw: 0, r: 1 }, 'ch9.dream-hem': { x: 62, z: 30.5, yaw: 0, r: 0.9 },
  'ch9.dream-cho': { x: -15, z: 33.5, yaw: H, r: 0.9 },
  'ch9.rd-xe-1': { x: -3.5, z: 20, yaw: 0, r: 1 }, 'ch9.rd-xe-2': { x: -3.5, z: 12, yaw: 0, r: 1 },
  'ch9.vios-chua': { x: -45, z: 111.6, yaw: H, r: 1 },
};
/** Chapter places that stand on the carriageway on purpose (the rest are sidewalk or alley ground). */
export const ROAD_PLACES = ['ch9.suv-luc', 'ch9.rd-xe-1', 'ch9.rd-xe-2', 'ch9.vios-chua'];

/**
 * Off-map space anchors this chapter adds ('space/anchor' in scripts, 'set:space.anchor' in cutscenes): a contract for
 * the level kit (spaces-surfaces-levelkit.md §11). The attic's anchors are chapter 1's (door, desk, wall, window,
 * mattress, hollow, stairs); co-ba-ground's front, counter and kitchen are chapter 5's. Entry links: co-ba-ground
 * 'backDoor' (from the lane), van-safehouse 'front', bia-hoi-storeroom 'front'.
 */
export const ANCHORS: Record<string, Record<string, string>> = {
  'co-ba-ground': {
    shutter: 'inside the half-pulled street shutter (the officers at the door in c9m1, the raiders breaking in in c9-m3)',
    table: 'the low table by the counter where Tín eats Cô Ba\'s hủ tiếu',
    backDoor: 'the kitchen\'s back door onto the Chợ An Hòa lane (entry link "backDoor"; leaving puts the player at cafe-co-ba.backDoor)',
  },
  'village-tan-thuan': { neighbour: 'the neighbour\'s stilt house across the dyke: a TV on a cabinet, plastic stools, the neighbours (c9m1 montage)' },
  'van-safehouse': {
    front: 'inside the street door of "2 Phượng Vĩ" (entry link "front"; leaving puts the player at the door of nha-chi-van)',
    table: 'the low table in the front room: Vân\'s phone and laptop', gas: 'the gas ring in the back kitchen',
    cupboard: 'a tall wooden cupboard by the stairs (the vest, the backup pistol)',
  },
  'bia-hoi-storeroom': {
    front: 'the storeroom door from the bar (entry link "front"; leaving puts the player at the bia hơi door)',
    kegs: 'just inside the door, where the kegs are stacked', shelf: 'foot of the climbable steel shelving (climb link "leo-ke")',
    vent: 'the crawl slab at the high vent over Lực\'s sidewalk table, level "shelf" (climb link "xuong-ke" back down)',
  },
};
/** Climb links this chapter waits on (spaces lane ClimbLinks, one registry entry each; types.ts InteractSpec kind 'climb'). */
export const CLIMBS: Record<string, string> = {
  'leo-ke': 'bia-hoi-storeroom shelf → vent slab (level "shelf"), a 2.4 m mantle up the steel shelving',
  'xuong-ke': 'bia-hoi-storeroom vent slab → floor by the shelf',
  'vao-san': 'the bia hơi back gate → over the courtyard wall into SÂN SAU MOONLIGHT – SPA (the reverse of chapter 5\'s "leo-tuong")',
};

/**
 * Case-board cards this chapter contributes to BẢNG MANH MỐI and the strings that tie them to chapters 3 and 5. Slots
 * 90–95: chapters 1–5 hold 0–33 and chapters 6–8 and 10–11 are written in parallel, so chapter N keeps to the block
 * N·10 (story-ch09.test.mjs checks one card per slot across chapters 1–5 and 9).
 */
export const BOARD_CARDS: BoardCard[] = [
  { id: 'ev-ghi-am-luc', slot: 90 }, { id: 'ev-luc-ram', slot: 91 }, { id: 'ev-the-b2', slot: 92 },
  { id: 'ev-ban-tin', slot: 93 }, { id: 'ev-bien-suv', slot: 94 }, { id: 'ev-ao-gia', slot: 95 },
];
export const BOARD_LINKS: [string, string][] = [
  ['ev-ghi-am-luc', 'ev-luc-ram'], ['ev-ghi-am-luc', 'ev-ban-tin'], ['ev-ghi-am-luc', 'ev-bien-suv'], ['ev-ghi-am-luc', 'ev-ao-gia'],
  ['ev-luc-ram', 'ev-the-b2'],
  // to chapter 5: the mirror-room clip of the same man, the B2 lift, its lotus card reader and the red pen line
  ['ev-ghi-am-luc', 'ev-clip-luc'], ['ev-luc-ram', 'ev-thang-may-b2'], ['ev-the-b2', 'ev-thang-may-b2'], ['ev-the-b2', 'ev-dau-doc-the'], ['ev-luc-ram', 'ev-so-do-b2'],
  // to chapter 3: the black SUV that tailed Tín home from the station
  ['ev-bien-suv', 'ev-xe-den'],
];
/** Flags chapter 9 reads that chapters 6–8 set (story-final.md "persistent flags"), with the values it expects. */
export const UPSTREAM_FLAGS: Record<string, string> = {
  'choice:quangBen': "c6-m3 (content/ch06.ts choice 'quangBen'): 'keo-day' after \"Kéo nó dậy\", 'bo-di' after \"Bỏ đi\" (c9m3-quang: a hand on his shoulder, or he just takes the card)",
  'choice:phongBi': "c8-m3 (content/ch08.ts choice 'phongBi'): 'cam' after \"Cầm phong bì\" (c9m1-phong-bi: the envelope burns over the gas ring); 'day' and 'im' skip the scene",
};

/**
 * Engine ids this chapter uses beyond story/contract.ts (and SCENE_REQUESTS), by contract kind, with the lane that
 * builds them: the integrator adds them to ENGINE_CONTRACT; scripts/story-ch09.test.mjs lints the chapter against the
 * contract plus these, and fails if one is unused.
 */
export const ENGINE_NEEDS: Partial<Record<ContractKind, Record<string, ContractEntry>>> = {
  ops: {
    arm: ['core', "a story weapon in Tín's hands for the mission (story mode carries no free-roam weapons): {weapon:'pistol', ammo, from:'van'} (Vân's backup pistol, c9-m3; F fires, bullets book as kills in LƯƠNG TÂM); {weapon:null} hands it back"],
    pillion: ['core', "a cast member on the Dream's pillion seat {cast:'coba'} / {cast:null} (escort-boss-qte.md §1.10 host.setPillion: restyles game.ts's passenger; pursuers never swing at her; a crash knocks both down non-lethally and she re-mounts)"],
  },
  meters: {
    'nhan-dien': ['police', 'the manhunt recognition meter 0..1 (chase-wanted.md §7.2): witnesses who see Tín\'s face fill it; rain, the raincoat with the full-face helmet, the porter cover and crowds slow it; full → a witness calls the police (1 star)'],
    'thoat:suv-luc': ['vehicles', "getting away from Lực's black SUV 0..1 (the pursuers controller's unseen seconds / loseAfter; c9-m2)"],
  },
  outfits: {
    'tin-ao-tu': ['core', "Tín in Ông Tư's faded dark jacket over the university T-shirt, the police whistle on its cord (story outfit from c7-m1, −10% visibility); chapter 7 may have registered it under its own id"],
    'tin-ao-mua': ['core', 'Lâm\'s old bat-wing raincoat over the orange shipper windbreaker and Lâm\'s full-face helmet, visor down (the manhunt disguise, c9-m1)'],
    'tin-khuan-vac': ['core', 'the keg porter: Tám Hổ\'s yellow-trimmed apron over a plain shirt and a cap pulled low (c9-m2)'],
  },
  carry: { 'bom-bia': ['core', 'a 30-litre beer keg on the shoulder: speed capped at 2.2 m/s, part of the porter cover (stealth-player-kit.md §3.3)'] },
  arenas: {
    'gac-co-ba': ['stealth', "the attic searched by two ward officers, variant 'search': the floor hollow is a 'floor-hollow' hide spot with hold-breath (X) while a searcher is within 3 m; no takedowns (c9-m1)"],
    'bia-hoi': ['stealth', "the bia hơi's sidewalk tables, front storeroom and back gate, variant 'night': the porter cover, Lực's bodyguard watching the street, the drinkers as recognition witnesses (c9-m2)"],
    'quan-co-ba': ['stealth', "CÀ PHÊ CÔ BA's ground floor in its 'raid' variant and the Chợ An Hòa lane: raiders in fake police vests with pipes, stalls as cover, Cô Ba escorted (B), Mực following her (c9-m3)"],
  },
  models: { 'ba-gac': ['vehicles', "Tám Hổ's keg ba gác (vehicle-models 'bagac' body) parked by the bia hơi's side wall, kegs in its bed (story-decisions.md §7)"] },
  templates: {
    shipper: ['director', 'lunch-rush rider in an orange delivery windbreaker and half helmet (TTTM crowd, c9-m1; recognition shipperCrowd)'],
    'ho-vang': ['director', "Hổ Vàng street-gang man in the yellow shirt (#d8a020): Tám Hổ's men at the alley mouths (c9-m2, c9-m3; chapter 10 uses the same id)"],
  },
  props: { 'xe-che': ['world', "Bà Sáu's chè cart with a tarp skirt, a 'tarp' hide spot under it (stealth-player-kit.md §5.1; c9-m1, helpedBaSau)"] },
  acts: {
    'crack-peanuts': ['director', 'seated, cracking peanuts from a plate (Tám Hổ)'],
    'drink-beer': ['director', 'seated at a plastic bia hơi table, a glass of beer, chatting (Lực, the drinkers, the drunk)'],
    'sweep-leaves': ['director', 'sweeping leaves slowly with a bamboo broom (Thầy Minh Tịnh at the pagoda gate)'],
  },
  clips: {
    'crack-peanuts': ['director', 'one-actor scene clip: cracks a peanut between thumb and finger, flicks the shell away'],
    sip: ['director', 'one-actor scene clip: a slow sip from a glass, seated'],
    'reach-up': ['director', 'one-actor scene clip: stands on a stool and reaches up into a ceiling vent'],
    sweep: ['director', 'one-actor scene clip: unhurried strokes of a bamboo broom'],
    'open-cupboard': ['director', 'one-actor scene clip: opens a tall cupboard and takes something out with both hands'],
  },
  pairClips: { 'press-hand': ['director', "one takes the other's hand in both hands and presses it"] },
  sceneProps: {
    'tv-news': ['director', 'a TV showing a news bulletin (text lines: headline and strap; chapters 8 and 11 use the same prop)'],
    floorboard: ['director', 'the loose attic floorboard over the hollow (lifted away)'],
    'raincoat-helmet': ['director', 'a folded bat-wing raincoat and an old full-face helmet'],
    'peanut-plate': ['director', 'a plate of peanuts and glasses of beer on a plastic table'],
    'apron-cap': ['director', "a folded porter's apron with a cap on top"],
    keycard: ['director', 'a black keycard printed with a golden lotus'],
    'bulletproof-vest': ['director', 'a police-issue bulletproof vest'],
    'beer-cart': ['director', 'a street beer cart with crates, dragged across an alley mouth'],
  },
  fx: { flame: ['director', 'a small gas-ring flame eating a paper envelope'] },
  sfx: {
    'news-jingle': ['audio', 'a TV news jingle under the anchor\'s voice'], 'boots-floor': ['audio', 'boots on old floorboards overhead'],
    'shutter-bang': ['audio', 'fists banging on a roller shutter'], 'engine-rev': ['audio', 'two scooters revving at idle'],
    'gas-click': ['audio', 'a gas ring clicking alight'],
  },
};

export const chapter = defineChapter({
  chapter: 9,
  missions: [c9m1, c9m2, c9m3],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, questions: QUESTIONS, places: PLACES,
  text: TEXT,
});
