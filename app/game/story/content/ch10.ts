import { defineChapter, defineMission, type Act, type BoardCard, type CastDef, type Cond, type EvidenceDef, type FailDef, type JournalDef, type Line, type QuestionDef, type WorldPolicy } from '../types.ts';
import type { ContractEntry, ContractKind } from '../contract.ts';
import { TEXT } from '../text/vi/ch10.ts';

/**
 * Chương 10 · ĐÊM RẰM (story-final.md ch.10 with story-decisions.md 9, 13, 14, 22 and §8 "c10-m4"): Rằm tháng Tám,
 * one continuous night. c10-m1 21:30: Vân's car across from Moonlight, the festival crowd past two Rắn Đen spotters,
 * Tám Hổ's open back gate, the bia hơi downpipe timed to the lion-dance drum rolls, the electrician on the roof, the
 * transformer at 22:00 (CS09: the strip dies sign by sign, the lanterns stay lit), Hổ Vàng's fake brawl, the plank,
 * the courtyard, the spa's back corridor and the service corridor to Moonlight's staff lift (Quang's keycard; CS09
 * cont.: down to B2). c10-m2 B2 (variant 'b2-dark', the night of the CS01 cold open): the cold room (the cold open
 * catches up: "Có ai trong này không?"), the CCTV office (operator, cameras off, the dispatch sheet "23:00 — XE LẠNH —
 * 12 KIỆN", the master keys), the charcoal lotuses to cell 4 (CS10, the reunion), then the escort of seventeen back
 * through the office, two guards returning (park the group in the side storeroom with B, take them down, B again),
 * up to the staff stairs; the generator restarts and Cường's voice comes over the intercom. c10-m3 the alarm-lit
 * dance floor: Cường and five men block the doors, Quang takes the bullet meant for Mai (cut to black, no gore; he
 * lives), Vân pins the five down, the three-phase unarmed duel (dodge and counter, the speaker stacks and the trolley,
 * the dark), CS11 with its two scene QTEs ("Lật người!", the chokehold count) and the only prompt "Còng tay" with the
 * pistol lying at Tín's hand, then the seventeen out onto the lantern-lit street: ĐÃ CỨU 28 (11 + 17, decision 13).
 * The dispatch sheet in the B2 office ("23:00 — XE LẠNH — 12 KIỆN") goes to Vân by radio at once; she has to come in at
 * the alarm, and the truck is gone from the back yard by the time she gets out (c10-m4).
 * c10-m4 23:40: Mai to the ambulance, two pings (the c7-m2 tracker heading for the port, Diễm's call about Su: she will
 * testify now), Vân's radio (the back yard was empty, the helicopter at 01:00), the deduction of where the tracker rides,
 * Mai calls Má, the farewell at the ambulance (Mai re-ties the red string, Tín gives back her lotus hairclip), Tám Hổ
 * brings the Dream from the pagoda: chained into c11-m1.
 * Non-lethal throughout (lethal: 'fail'; a chokehold slip never kills, flags.ts); interactive play never slows time:
 * slow motion lives only in freezeWorld cutscenes, and a scene QTE's window runs in real seconds.
 *
 * Places are story/sites.ts ids, chapter places ('ch10.*', PLACES below, candidates for sites.ts) or anchors of the
 * off-map spaces declared in ANCHORS ('moonlight-b2/desk'); texts are '@keys' of text/vi/ch10.ts; brands ({@app},
 * {@code}, {@ring}) come from text/vi/common.ts. Register in content/index.ts LOADERS: `10: () => import('./ch10.ts'),`.
 * Cast from earlier chapters: tin, quang, coba, tu, bana, mai, basau (ch.1), cuong (ch.2), van (ch.3), diem (ch.4),
 * thay-minh-tinh (ch.6), tam-ho and ho-vang (ch.9) as those chapters define them (scripts/story-ch10.test.mjs
 * stands in for chapters 6–9 while they are not built). Flag 'rescued' is the HUD counter ĐÃ CỨU (c7-m3 leaves 11).
 *
 * Engine ids used here are in story/contract.ts (festival, power, escort and its query are planned there) except
 * ENGINE_NEEDS below: the duel, play QTEs, ally suppression, the tracker blip, the Rằm and B2 arenas, the drum meter,
 * the duel signals, templates, acts, props and the cutscene vocabulary of the chapter.
 */

const H = Math.PI / 2;
const NO_HUB: WorldPolicy['activities'] = { gunStore: false, bank: false, deck: false, boatRental: false, sideJobs: false, orders: false };
const say = (who: string, key: string, o: Omit<Line, 'who' | 'text'> = {}): Line => ({ who, text: `@${key}`, ...o });
const think = (key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say('tin', key, { voice: 'think', ...o });
const phone = (who: string, key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say(who, key, { voice: 'phone', ...o });
const radio = (who: string, key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say(who, key, { voice: 'radio', ...o });
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
const ko = (id: string): Cond => ({ k: 'on', ev: 'knockout', id });
const detected: Cond = { k: 'on', ev: 'detected' };
/** Teleport unless the player is already there on that surface `level` (null: the ground); see content/ch01.ts. */
const put = (at: string, vehicle?: string, r = 8, level: string | null = null): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });
/** A checkpoint inside an off-map space: enter it first when a skip lands here from outside (a restore re-enters it already). */
const inSpace = (space: string, link: string): Act => ({ k: 'if', c: { k: 'space', id: space }, then: [], else: [{ k: 'space', enter: space, link }] });
/** Seen by a guard of the arena: back to the last checkpoint; after three tries the card offers 'Bỏ qua đoạn này'. */
const caught = (reason: string, skipTo?: string): FailDef => ({ when: detected, reason: `@${reason}`, allowSkipAfter: 3, ...(skipTo ? { skipTo } : {}) });
/** Stealth rules of the chapter: takedowns, no guns, nobody dies (LƯƠNG TÂM), crimes raise the ring's alarm; a cut of the power is the festival's, not an alarm. */
const RULES = { takedowns: true, guns: 'none', lethal: 'fail', failOn: [], showCones: 'observe', countConscience: true, respawn: 'checkpoint', policeSuppressed: true, lightsOutAlarm: false };

// ---- the night: festival, the strip's power, the escort group, the duel, the QTEs ------------------------------

/** Rằm tháng Tám festival state (festival-blackout-heli.md §1): lanterns, parades, stalls, the lion-dance troupe at moonlight.lion. */
const FESTIVAL: Act = { k: 'do', op: 'festival', args: { id: 'ram-thang-tam', on: true } };
/**
 * The strip's power region, dark (festival-blackout-heli.md §2.3–2.4: x 58..100, z 30..80; lanterns and the lion's eyes
 * stay lit); rect is a map/consts.ts Rect, the shape the CS09 power cue uses too (cutscenes/ch10.ts STRIP_RECT).
 */
const STRIP_DARK: Act = { k: 'do', op: 'power', args: { regions: [{ id: 'strip', rect: { minX: 58, maxX: 100, minZ: 30, maxZ: 80 }, level: 0 }] } };

type Follower = { id: string; look: string; age: 'child' | 'teen' | 'adult'; hero?: boolean; cell: string };
const f = (id: string, look: string, age: Follower['age'], cell: string, hero = false): Follower => ({ id, look, age, cell, ...(hero ? { hero } : {}) });
/**
 * The seventeen of B2 (escort-boss-qte.md §1.3 GroupSpec; `cell` per follower is this chapter's request): Mai and two
 * little girls in cell 4, fourteen more in cells 1–3. Mai is the leader-side hero follower who keeps the line together;
 * Bé Na is a hero follower too (she has a line). Children walk in the middle ("Đứa nhỏ đi giữa"), hands held.
 */
export const B2_FOLLOWERS: Follower[] = [
  f('mai', 'mai', 'teen', 'moonlight-b2/cellMai', true), f('be-na', 'be-na', 'child', 'moonlight-b2/cellMai', true), f('b2-c1', 'captive-child', 'child', 'moonlight-b2/cellMai'),
  f('b2-t1', 'captive-teen', 'teen', 'moonlight-b2/cell1'), f('b2-t2', 'captive-teen', 'teen', 'moonlight-b2/cell1'), f('b2-t3', 'captive-teen', 'teen', 'moonlight-b2/cell1'),
  f('b2-c2', 'captive-child', 'child', 'moonlight-b2/cell1'), f('b2-a1', 'captive-adult', 'adult', 'moonlight-b2/cell1'),
  f('b2-t4', 'captive-teen', 'teen', 'moonlight-b2/cell2'), f('b2-t5', 'captive-teen', 'teen', 'moonlight-b2/cell2'), f('b2-c3', 'captive-child', 'child', 'moonlight-b2/cell2'),
  f('b2-a2', 'captive-adult', 'adult', 'moonlight-b2/cell2'), f('b2-a3', 'captive-adult', 'adult', 'moonlight-b2/cell2'),
  f('b2-t6', 'captive-teen', 'teen', 'moonlight-b2/cell3'), f('b2-t7', 'captive-teen', 'teen', 'moonlight-b2/cell3'), f('b2-c4', 'captive-child', 'child', 'moonlight-b2/cell3'),
  f('b2-a4', 'captive-adult', 'adult', 'moonlight-b2/cell3'),
];
/**
 * GroupSpec of the B2 group; `from` places a group that is already free (a checkpoint restore, or the floor in c10-m3).
 * The release is inside Moonlight's front doors, in the same set as the group (escort trails never cross a space
 * transition, escort-boss-qte.md §1.5): the seventeen are safe before the player leaves the set for the street.
 */
const group = (from?: string) => ({
  id: 'b2', followers: B2_FOLLOWERS, leader: 'player', order: 'kids-middle', spacing: 0.9, hands: true,
  start: from ? { at: from, yaw: 0 } : { cells: true }, safe: ['moonlight-b2/storeroom'], release: 'moonlight-floor/front',
});
/**
 * Spawns the group (idempotent by id) and sends `cmd`; restores put it back already out at `from`. Spawned in its cells
 * the group is caged until {k:'free'} (escort-boss-qte.md §1.3, §1.6): 'follow' only re-forms a line already out.
 */
const escortSpawn = (from?: string, cmd: Record<string, unknown> = { k: 'follow' }): Act => ({ k: 'do', op: 'escort', args: { id: 'b2', spec: group(from), cmd } });
const escortCmd = (cmd: Record<string, unknown>): Act => ({ k: 'do', op: 'escort', args: { id: 'b2', cmd } });
/** Escort state (contract query 'escort'; `all` also takes 'follow', 'parked' and 'huddle', this chapter's request). */
const escort = (o: { all: 'follow' | 'parked' | 'huddle' | 'safe'; count?: number }): Cond => ({ k: 'q', name: 'escort', args: { id: 'b2', ...o } });
/** The whole group with the player: seventeen following. */
const ALL_FOLLOW = escort({ all: 'follow', count: B2_FOLLOWERS.length });

/** The Cường Sẹo duel (escort-boss-qte.md §2.4–2.5): 400 HP, phases at 100–66–33 %, the dance floor's objects. */
export const DUEL = {
  id: 'cuong', boss: 'cuong', hp: 400, phases: [1, 0.66, 0.33], finishAt: 0.15, phase3Limit: 50, guns: 'none',
  env: ['moonlight-floor/speakerL', 'moonlight-floor/speakerR', 'moonlight-floor/trolley', 'moonlight-floor/pillar', 'moonlight-floor/bar'],
} as const;
const duel = (phase: 1 | 2 | 3, reset = false): Act => ({ k: 'do', op: 'duel', args: { ...DUEL, phase, ...(reset ? { reset: true } : {}) } });
// The CS11 QTEs ("Lật người!", the chokehold count) are scene QTEs inside cs11_dem_toi_nam (cutscenes/ch10.ts QTES).
const phaseSignal = (phase: number): Cond => ({ k: 'on', ev: 'signal', id: 'duelPhase', where: { phase } });
/** Cường's five men behind the tables by the front doors, pinned by Vân (ally suppression, never a hit on a person). */
const MEN = ['dan-em-1', 'dan-em-2', 'dan-em-3', 'dan-em-4', 'dan-em-5'];
const COVER = ['moonlight-floor/cover1', 'moonlight-floor/cover2'];
const SUPPRESS: Act = { k: 'do', op: 'ally', args: { id: 'van', suppress: { from: 'moonlight-floor/sideDoor', targets: MEN, cover: COVER } } };
const men = (b: 'guard' | 'surrender'): Act[] => MEN.map((id, i) => ({
  k: 'spawn', id, cast: 'dan-em-cuong', template: 'ran-den', at: COVER[i % 2], team: 'hostile', tags: ['cuong'],
  behaviour: b === 'guard' ? { k: 'guard', post: COVER[i % 2], sweep: 40 } : { k: 'surrender' },
}) as Act);
const ROOM = { k: 'stealth', arena: 'moonlight', variant: 'alarm-lit', rules: { ...RULES, takedowns: false, showCones: 'never' } } as Act;

// ---- c10-m1 · Rước đèn và mất điện ------------------------------------------------------------------------------

/** The strip on Rằm night (festival crowd zones, the drum rolls as sound cover, the roofs): a stealth arena. */
const RAM = (variant: 'lit' | 'dark'): Act => ({ k: 'stealth', arena: 'ram-pho-dem', variant, rules: RULES });
const SPOTTERS: Act[] = [
  { k: 'spawn', id: 'canh-pho-1', cast: 'canh-pho', template: 'ran-den', at: 'moonlight.bouncer', team: 'hostile', tags: ['ram'], behaviour: { k: 'guard', post: 'moonlight.bouncer', sweep: 70 } },
  { k: 'spawn', id: 'canh-pho-2', cast: 'canh-pho', template: 'ran-den', at: 'bia-hoi.tinTable', team: 'hostile', tags: ['ram'], behaviour: { k: 'guard', post: 'bia-hoi.tinTable', sweep: 60 } },
];
const ELECTRICIAN = (b: 'patrol' | 'check'): Act => ({
  k: 'spawn', id: 'tho-dien', cast: 'tho-dien', template: 'ran-den', at: b === 'patrol' ? 'mai-pho-dem.transformer' : 'mai-pho-dem', team: 'hostile', flashlight: b === 'check', tags: ['ram'],
  behaviour: b === 'patrol' ? { k: 'patrol', route: ['mai-pho-dem.transformer', 'mai-pho-dem', 'mai-pho-dem.plank', 'mai-pho-dem'], waits: [7, 3, 4, 2] } : { k: 'goto', at: 'mai-pho-dem.transformer' },
});

const c10m1 = defineMission({
  id: 'c10-m1', meta: { hours: [21, 24], giver: 'van' }, chain: 'c10-m2', lethal: 'fail',
  start: { at: 'ch10.xeVan', yaw: Math.PI, hour: 21.5, weather: 'clear', lunar: 15, outfit: 'tin-ao-tu' },
  world: {
    traffic: 'light', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 21.5, freeze: true }, weather: { set: 'clear', lock: true },
    exclusions: ['san-sau-pho-dem'], activities: NO_HUB,
  },
  setup: [
    FESTIVAL,
    { k: 'vehicle', id: 'vios-van', model: 'vios-van', at: 'moonlight.vanCar', yaw: H, state: 'park' },
    { k: 'spawn', id: 'van', cast: 'van', at: 'moonlight.vanCar', team: 'ally', behaviour: { k: 'idle' } },
    { k: 'spawn', id: 'quang', cast: 'quang', at: 'moonlight.vanCar', team: 'ally', behaviour: { k: 'idle' } },
  ],
  steps: [
    {
      id: 'trong-xe', minutes: 0.6,
      enter: [
        { k: 'title', kind: 'time', text: '@c10m1.title', sub: '@c10m1.titleSub' },
        talk('c10m1-xe', [
          say('van', 'c10m1.v1'), say('quang', 'c10m1.q1'), say('quang', 'c10m1.q2'), say('tin', 'c10m1.t1'), say('quang', 'c10m1.q3'),
          say('van', 'c10m1.v2'), say('van', 'c10m1.v3'), say('tin', 'c10m1.t2'), say('quang', 'c10m1.q4')]),
        { k: 'sms', from: 'coba', text: '@c10m1.sms.coba' },
        aside('c10m1-trang', [think('c10m1.think.trang')]),
      ],
    },
    {
      id: 'qua-pho', minutes: 1, objective: '@c10m1.obj.pho', marker: { at: 'bia-hoi.backDoor', label: '@c10m1.mk.cuaSau', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c10m1.cp.pho', setup: [
        put('ch10.xeVan', undefined, 6), RAM('lit'), ...SPOTTERS,
        { k: 'spawn', id: 'co-banh', cast: 'co-banh', at: 'ch10.banh', team: 'neutral', behaviour: { k: 'act', name: 'serve' } }] },
      interact: [{ id: 'mua-banh', at: 'ch10.banh', r: 1.8, prompt: '@c10m1.int.banh', kind: 'talk', when: 'foot' }],
      enter: [hint('c10m1.hint.dong', 8000), aside('c10m1-lan', [think('c10m1.think.lan')])],
      watchers: [
        { when: after(10), do: [hint('c10m1.hint.mat')] },
        { when: reach('ch10.banh', 6), do: [bark('co-banh', 'c10m1.bark.banh')] },
      ],
      optional: [{ id: 'banh', text: '@c10m1.opt.banh', when: used('mua-banh'), reward: [
        { k: 'give', item: 'banh-nuong' }, { k: 'cash', n: -60 }, { k: 'flag', name: 'boughtMooncake' },
        { k: 'toast', text: '@c10m1.toast.banh' }, aside('c10m1-banh', [think('c10m1.think.banh')])] }],
      done: reach('bia-hoi.backDoor', 2.5),
      fail: [caught('c10m1.fail.nhanRa', 'mai-ton')],
      exit: [{ k: 'despawn', id: 'co-banh' }],
    },
    {
      id: 'cong-sau', minutes: 0.5, objective: '@c10m1.obj.ong', marker: { at: 'bia-hoi.pipe', label: '@c10m1.mk.ong', style: 'go' }, hud: { light: true, noise: true },
      meters: [{ id: 'trong-lan', label: '@c10m1.meter.trong', kind: 'bar', max: 1 }],
      interact: [{ id: 'leo-ong-ram', at: 'bia-hoi.pipe', to: 'mai-pho-dem', r: 1.6, prompt: '@c10m1.int.ong', kind: 'climb', when: 'foot' }],
      enter: [
        { k: 'spawn', id: 'ho-vang-cong', cast: 'ho-vang', template: 'ho-vang', at: 'bia-hoi.backDoor', team: 'ally', behaviour: { k: 'act', name: 'cross-arms' } },
        bark('ho-vang-cong', 'c10m1.bark.hoVang'), hint('c10m1.hint.trong', 8000),
      ],
      done: climbed('leo-ong-ram'),
      fail: [caught('c10m1.fail.lo')],
      exit: [{ k: 'despawn', id: 'ho-vang-cong' }],
    },
    {
      id: 'mai-ton', minutes: 0.6, objective: '@c10m1.obj.hop', marker: { at: 'mai-pho-dem.transformer', label: '@c10m1.mk.hop', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c10m1.cp.mai', setup: [put('mai-pho-dem', undefined, 4, 'roof'), RAM('lit'), ELECTRICIAN('patrol')] },
      meters: [{ id: 'trong-lan', label: '@c10m1.meter.trong', kind: 'bar', max: 1 }],
      enter: [hint('c10m1.hint.thoDien', 8000), aside('c10m1-tho', [think('c10m1.think.thoDien')])],
      done: { k: 'reach', at: 'mai-pho-dem.transformer', r: 1.8, level: 'roof' },
      fail: [caught('c10m1.fail.lo')],
    },
    {
      id: 'cho-hieu', minutes: 0.3, objective: '@c10m1.obj.cho', hud: { light: true, noise: true },
      enter: [{ k: 'call', id: 'c10m1-van-phut', from: 'van', ring: false, lines: [radio('van', 'c10m1.v4')] }],
      done: { k: 'hold', seconds: 4, c: { k: 'all', of: [{ k: 'stance', is: 'crouch' }, { k: 'reach', at: 'mai-pho-dem.transformer', r: 2.5, level: 'roof' }] } },
      fail: [caught('c10m1.fail.lo')],
      exit: [{ k: 'time', hour: 22 }, { k: 'call', id: 'c10m1-van-gio', from: 'van', ring: false, lines: [radio('van', 'c10m1.v5')] }],
    },
    {
      id: 'cat-dien', minutes: 0.7, objective: '@c10m1.obj.cat', hud: { light: true, noise: true },
      interact: [{ id: 'cat-dien', at: 'mai-pho-dem.transformer', r: 1.6, hold: 2, prompt: '@c10m1.int.cat', kind: 'use', when: 'foot', level: 'roof' }],
      enter: [hint('c10m1.hint.cat', 6000)],
      done: used('cat-dien'),
      fail: [caught('c10m1.fail.lo')],
      exit: [
        { k: 'cutscene', id: 'cs09_dem_ram_mat_dien' },
        STRIP_DARK, RAM('dark'), { k: 'flag', name: 'cutPower' }, { k: 'journal', id: 'j-dem-ram' }, { k: 'toast', text: '@c10m1.toast.dien' },
      ],
    },
    {
      id: 'qua-van', minutes: 0.5, objective: '@c10m1.obj.van', marker: { at: 'mai-pho-dem.plank', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c10m1.cp.van', setup: [
        put('mai-pho-dem.transformer', undefined, 4, 'roof'), STRIP_DARK, RAM('dark'), ELECTRICIAN('check'),
        { k: 'spawn', id: 'ho-vang-1', cast: 'ho-vang', template: 'ho-vang', at: 'moonlight.brawl', team: 'ally', behaviour: { k: 'act', name: 'cross-arms' } },
        { k: 'spawn', id: 'ho-vang-2', cast: 'ho-vang', template: 'ho-vang', at: 'moonlight.brawl', team: 'ally', behaviour: { k: 'act', name: 'cross-arms' } },
        ...SPOTTERS] },
      interact: [{ id: 'qua-van-ram', at: 'mai-pho-dem.plank', to: 'mai-pho-dem.spa', r: 1.8, prompt: '@c10m1.int.van', kind: 'climb', when: 'foot', level: 'roof' }],
      enter: [
        { k: 'call', id: 'c10m1-van-toi', from: 'van', ring: false, lines: [radio('van', 'c10m1.v6'), radio('van', 'c10m1.v7')] },
        bark('ho-vang-1', 'c10m1.bark.danh1', true), bark('ho-vang-2', 'c10m1.bark.danh2', true),
        { k: 'behave', id: 'canh-pho-1', b: { k: 'goto', at: 'moonlight.brawl', run: true } }, { k: 'behave', id: 'canh-pho-2', b: { k: 'goto', at: 'moonlight.brawl', run: true } },
        bark('canh-pho-2', 'c10m1.bark.canh', true), bark('tho-dien', 'c10m1.bark.thoDien'),
        aside('c10m1-toi', [think('c10m1.think.toi')]),
      ],
      done: climbed('qua-van-ram'),
      fail: [caught('c10m1.fail.lo')],
    },
    {
      id: 'xuong-san', minutes: 0.3, objective: '@c10m1.obj.xuong', marker: { at: 'san-sau-pho-dem.drop', style: 'go' }, hud: { light: true, noise: true },
      interact: [{ id: 'tuot-san-ram', at: 'mai-pho-dem.spa', to: 'san-sau-pho-dem.drop', r: 2, prompt: '@c10m1.int.xuong', kind: 'climb', when: 'foot', level: 'roof' }],
      done: climbed('tuot-san-ram'),
      fail: [caught('c10m1.fail.lo')],
    },
    {
      id: 'cua-spa', minutes: 0.3, objective: '@c10m1.obj.spa', marker: { at: 'san-sau-pho-dem.spaBack', style: 'subtle' }, hud: { light: true, noise: true },
      interact: [{ id: 'vao-spa-ram', at: 'san-sau-pho-dem.spaBack', r: 1.6, hold: 1.5, prompt: '@c10m1.int.spa', kind: 'enter', when: 'foot' }],
      done: used('vao-spa-ram'),
      fail: [caught('c10m1.fail.lo')],
      exit: [{ k: 'space', enter: 'spa-back', link: 'back' }],
    },
    {
      id: 'hanh-lang', minutes: 0.6, objective: '@c10m1.obj.hanhLang', marker: { at: 'spa-back/service', style: 'subtle' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c10m1.cp.hanhLang', setup: [
        inSpace('spa-back', 'back'), put('spa-back/back', undefined, 3), STRIP_DARK,
        { k: 'stealth', arena: 'spa-back', variant: 'ram', rules: RULES },
        { k: 'spawn', id: 'gac-spa-ram', cast: 'gac-spa', template: 'ran-den', at: 'spa-back/corridor', team: 'hostile', flashlight: true, tags: ['spa'],
          behaviour: { k: 'patrol', route: ['spa-back/corridor', 'spa-back/service', 'spa-back/office', 'spa-back/corridor'], waits: [3, 4, 2, 2] } }] },
      interact: [{ id: 'cua-dich-vu', at: 'spa-back/service', r: 1.5, prompt: '@c10m1.int.dichVu', kind: 'enter', when: 'foot' }],
      enter: [hint('c10m1.hint.denPin', 7000)],
      done: used('cua-dich-vu'),
      fail: [caught('c10m1.fail.spa')],
      exit: [{ k: 'despawn', id: 'gac-spa-ram' }, { k: 'space', enter: 'moonlight-vip', link: 'service' }],
    },
    {
      id: 'thang-may', minutes: 0.6, objective: '@c10m1.obj.thang', marker: { at: 'moonlight-vip/lift', label: '@c10m1.mk.thang', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c10m1.cp.thang', setup: [
        inSpace('moonlight-vip', 'service'), put('moonlight-vip/service', undefined, 3), STRIP_DARK,
        { k: 'stealth', arena: 'moonlight', variant: 'ram', rules: RULES },
        { k: 'spawn', id: 'gac-vip-ram', cast: 'gac-vip', template: 'ran-den', at: 'moonlight-vip/corridor', team: 'hostile', flashlight: true, tags: ['moonlight'],
          behaviour: { k: 'patrol', route: ['moonlight-vip/corridor', 'moonlight-vip/lift', 'moonlight-vip/corridor', 'moonlight-vip/stairs'], waits: [3, 3, 2, 4] } }] },
      interact: [{ id: 'quet-the', at: 'moonlight-vip/lift', r: 1.4, hold: 1, prompt: '@c10m1.int.the', kind: 'use', when: 'foot' }],
      enter: [aside('c10m1-thang', [think('c10m1.think.thang')])],
      done: used('quet-the'),
      fail: [caught('c10m1.fail.vip')],
      exit: [{ k: 'cutscene', id: 'cs09_dem_ram_thang_may' }, { k: 'despawn', id: 'gac-vip-ram' }, { k: 'stealth', arena: null }],
    },
  ],
  rewards: [{ k: 'flag', name: 'ramBlackout' }],
  medals: { par: 420, ghost: true, clues: ['banh'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], flags: { knowsB2: true } },
});

// ---- c10-m2 · Tầng hầm B2 ----------------------------------------------------------------------------------------

const B2 = (variant = 'b2-dark'): Act => ({ k: 'stealth', arena: 'moonlight-b2', variant, rules: RULES });
const B2_SET: Act = { k: 'space', variant: { id: 'moonlight-b2', v: 'b2-dark' } };
const COLD_GUARDS: Act[] = [
  { k: 'spawn', id: 'gac-b2-1', cast: 'gac-b2', template: 'ran-den', at: 'moonlight-b2/door', team: 'hostile', flashlight: true, tags: ['b2'],
    behaviour: { k: 'patrol', route: ['moonlight-b2/door', 'moonlight-b2/aisle', 'moonlight-b2/crates', 'moonlight-b2/aisle'], waits: [3, 2, 4, 2] } },
  { k: 'spawn', id: 'gac-b2-2', cast: 'gac-b2', template: 'ran-den', at: 'moonlight-b2/packing', team: 'hostile', flashlight: true, tags: ['b2'], behaviour: { k: 'guard', post: 'moonlight-b2/packing', sweep: 60 } },
  { k: 'spawn', id: 'gac-b2-3', cast: 'gac-b2', template: 'ran-den', at: 'moonlight-b2/coldRoom', team: 'hostile', flashlight: true, tags: ['b2'],
    behaviour: { k: 'patrol', route: ['moonlight-b2/coldRoom', 'moonlight-b2/freezer', 'moonlight-b2/officeDoor', 'moonlight-b2/coldRoom'], waits: [2, 3, 3, 2] } },
];
const OPERATOR: Act = { k: 'spawn', id: 'gac-camera', cast: 'gac-camera', template: 'ran-den', at: 'moonlight-b2/desk', team: 'hostile', tags: ['b2'], behaviour: { k: 'act', name: 'desk-head-down' } };
const CELL_GUARD: Act = { k: 'spawn', id: 'gac-lim', cast: 'gac-lim', template: 'ran-den', at: 'moonlight-b2/corridor', team: 'hostile', flashlight: true, tags: ['b2'],
  behaviour: { k: 'patrol', route: ['moonlight-b2/corridor', 'moonlight-b2/lotus2', 'moonlight-b2/cell3', 'moonlight-b2/lotus2'], waits: [4, 2, 3, 2] } };
/** The master keys, once (picked from the rack, or granted by a skip past the office). */
const KEYS: Act = { k: 'if', c: { k: 'not', c: { k: 'item', id: 'chia-khoa-b2' } }, then: [{ k: 'give', item: 'chia-khoa-b2' }] };
/** What the security office gives, also when a skip lands past it (the cameras off, the keys, the dispatch sheet). */
const OFFICE_DONE: Act = { k: 'if', c: { k: 'not', c: flag('b2OfficeDone') }, then: [
  { k: 'flag', name: 'b2OfficeDone' }, { k: 'flag', name: 'b2CamerasOff' }, KEYS, { k: 'evidence', id: 'ev-so-xuat-b2' }] };
const RETURNING: Act[] = [
  { k: 'spawn', id: 'gac-ve-1', cast: 'gac-ve', template: 'ran-den', at: 'moonlight-b2/stairs', team: 'hostile', flashlight: true, tags: ['b2'], behaviour: { k: 'goto', at: 'moonlight-b2/officeDoor' } },
  { k: 'spawn', id: 'gac-ve-2', cast: 'gac-ve', template: 'ran-den', at: 'moonlight-b2/stairs', team: 'hostile', flashlight: true, tags: ['b2'], behaviour: { k: 'goto', at: 'moonlight-b2/coldRoom' } },
];
const recaptured: Cond = { k: 'on', ev: 'caught' };

const c10m2 = defineMission({
  id: 'c10-m2', meta: { hours: [22, 24], giver: 'quang' }, chain: 'c10-m3', lethal: 'fail',
  start: { space: 'moonlight-b2', at: 'moonlight-b2/lift', hour: 22.25, weather: 'clear', lunar: 15, outfit: 'tin-ao-tu' },
  world: { traffic: 'light', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 22.25, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [FESTIVAL, STRIP_DARK, B2_SET],
  steps: [
    {
      id: 'cua-thang', minutes: 0.3,
      enter: [
        { k: 'title', kind: 'place', text: '@c10m2.title', sub: '@c10m2.titleSub' },
        aside('c10m2-xuong', [think('c10m2.think.xuong')]), hint('c10m2.hint.trong', 8000),
      ],
    },
    {
      id: 'kho-lanh', minutes: 1.6, objective: '@c10m2.obj.kho', hud: { light: true, noise: true },
      checkpoint: { label: '@c10m2.cp.kho', setup: [inSpace('moonlight-b2', 'lift'), put('moonlight-b2/lift', undefined, 3), B2(), ...COLD_GUARDS] },
      marker: [{ id: 'mk-thung', at: 'moonlight-b2/crates', label: '@c10m2.mk.thung', style: 'subtle' }, { id: 'mk-phong', at: 'moonlight-b2/officeDoor', style: 'subtle' }],
      subs: [
        { id: 'nup', text: '@c10m2.sub.nup', done: { k: 'on', ev: 'cutscene', id: 'c10m2-co-ai' } },
        { id: 'phong', text: '@c10m2.sub.phong', done: reach('moonlight-b2/officeDoor', 1.8) },
      ],
      enter: [hint('c10m2.hint.gac', 8000)],
      watchers: [
        // the cold open catches up: the guard comes through the cold-room door while Tín hides behind the crates
        { when: reach('moonlight-b2/crates', 2.5), do: [{ k: 'cutscene', id: 'c10m2-co-ai' }] },
        { when: { k: 'on', ev: 'knockout', tag: 'b2' }, do: [hint('c10m2.hint.tuDong')] },
      ],
      optional: [{ id: 'tu-dong', text: '@c10m2.opt.tuDong', when: { k: 'any', of: [
        { k: 'actor', id: 'gac-b2-1', at: 'moonlight-b2/freezer', r: 2, down: true },
        { k: 'actor', id: 'gac-b2-2', at: 'moonlight-b2/freezer', r: 2, down: true },
        { k: 'actor', id: 'gac-b2-3', at: 'moonlight-b2/freezer', r: 2, down: true }] } }],
      fail: [caught('c10m2.fail.lo', 'phong-camera')],
    },
    {
      id: 'phong-camera', minutes: 1.4, objective: '@c10m2.obj.phong', hud: { light: true, noise: true },
      checkpoint: { label: '@c10m2.cp.phong', setup: [inSpace('moonlight-b2', 'lift'), put('moonlight-b2/officeDoor', undefined, 3), B2(), OPERATOR] },
      subs: [
        { id: 'ha', text: '@c10m2.sub.ha', done: ko('gac-camera') },
        { id: 'tat', text: '@c10m2.sub.tat', done: used('tat-camera') },
        { id: 'so', text: '@c10m2.sub.so', done: owned('ev-so-xuat-b2') },
        { id: 'khoa', text: '@c10m2.sub.khoa', done: used('lay-khoa') },
      ],
      interact: [
        { id: 'tat-camera', at: 'moonlight-b2/desk', r: 1.4, hold: 2, prompt: '@c10m2.int.tat', kind: 'use', when: 'foot' },
        { id: 'lay-khoa', at: 'moonlight-b2/keys', r: 1.3, prompt: '@c10m2.int.khoa', kind: 'pick', when: 'foot' },
      ],
      enter: [
        { k: 'clue', id: 'so-xuat', at: 'moonlight-b2/log', r: 1.4, evidence: 'ev-so-xuat-b2', examine: 'object:dispatch-sheet', scope: 'step' },
        { k: 'photoTarget', id: 'man-hinh', subject: 'moonlight-b2/monitors', evidence: 'ev-man-hinh-b2', minQuality: 0.6, scope: 'step' },
        hint('c10m2.hint.camera', 8000),
      ],
      watchers: [
        { when: used('tat-camera'), do: [{ k: 'flag', name: 'b2CamerasOff' }, aside('c10m2-man', [think('c10m2.think.man1'), think('c10m2.think.man2')]), hint('c10m2.hint.man')] },
        // the twelve leave at 23:00 from Moonlight's own back yard: Vân is told at once (she has to come in at the alarm)
        { when: owned('ev-so-xuat-b2'), do: [aside('c10m2-so', [think('c10m2.think.so1'), radio('tin', 'c10m2.t.so'), radio('van', 'c10m2.v.so'), think('c10m2.think.so2')])] },
        { when: used('lay-khoa'), do: [KEYS, { k: 'toast', text: '@c10m2.toast.khoa' }] },
      ],
      optional: [{ id: 'man-hinh', text: '@c10m2.opt.man', when: owned('ev-man-hinh-b2') }],
      fail: [caught('c10m2.fail.lo', 'hanh-lang-sen')],
      exit: [OFFICE_DONE],
    },
    {
      id: 'hanh-lang-sen', minutes: 1.2, objective: '@c10m2.obj.sen', hud: { light: true, noise: true },
      checkpoint: { label: '@c10m2.cp.sen', setup: [inSpace('moonlight-b2', 'lift'), put('moonlight-b2/corridor', undefined, 3), B2(), CELL_GUARD] },
      marker: [{ id: 'mk-sen-1', at: 'moonlight-b2/lotus1', style: 'subtle' }],
      subs: [
        { id: 'sen1', text: '@c10m2.sub.sen1', done: owned('ev-sen-b2') },
        { id: 'sen2', text: '@c10m2.sub.sen2', done: reach('moonlight-b2/lotus2', 1.8) },
        { id: 'sen3', text: '@c10m2.sub.sen3', done: reach('moonlight-b2/lotus3', 1.8) },
        { id: 'cua', text: '@c10m2.sub.cua', done: used('mo-cua-mai') },
      ],
      interact: [{ id: 'mo-cua-mai', at: 'moonlight-b2/cellMai', r: 1.4, hold: 1.5, prompt: '@c10m2.int.cua', kind: 'use', when: 'foot' }],
      // a skip from the office lands here as if the office was done
      enter: [OFFICE_DONE, { k: 'clue', id: 'sen-1', at: 'moonlight-b2/lotus1', r: 1.6, evidence: 'ev-sen-b2', examine: 'object:charcoal-lotus', scope: 'step' }, hint('c10m2.hint.sen', 8000)],
      watchers: [
        { when: owned('ev-sen-b2'), do: [aside('c10m2-sen1', [think('c10m2.think.sen1')]), { k: 'marker', id: 'mk-sen-2', at: 'moonlight-b2/lotus2', style: 'subtle' }] },
        { when: reach('moonlight-b2/lotus2', 1.8), do: [{ k: 'marker', id: 'mk-sen-3', at: 'moonlight-b2/lotus3', style: 'subtle' }] },
        { when: reach('moonlight-b2/lotus3', 1.8), do: [aside('c10m2-sen3', [think('c10m2.think.sen3')])] },
      ],
      fail: [caught('c10m2.fail.lim', 'doan-tu')],
    },
    {
      id: 'doan-tu', minutes: 0.8,
      enter: [
        OFFICE_DONE, { k: 'evidence', id: 'ev-sen-b2' },
        { k: 'cutscene', id: 'cs10_doan_tu' },
        { k: 'flag', name: 'foundMai' }, { k: 'journal', id: 'j-gap-mai' }, { k: 'take', item: 'chia-khoa-b2' },
        // the master key opened the four cells in CS10: out of the cells ('free'), then into the line behind Tín
        escortSpawn(undefined, { k: 'free' }), escortCmd({ k: 'follow' }),
      ],
    },
    {
      id: 'dan-ra', minutes: 1, objective: '@c10m2.obj.dan', marker: { at: 'moonlight-b2/officeDoor', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c10m2.cp.dan', setup: [inSpace('moonlight-b2', 'lift'), put('moonlight-b2/cellMai', undefined, 3), B2(), CELL_GUARD, escortSpawn('moonlight-b2/cellMai')] },
      meters: [{ id: 'escort:b2', label: '@c10m2.meter.theo', kind: 'count', max: B2_FOLLOWERS.length }],
      enter: [hint('c10m2.hint.dan', 9000), aside('c10m2-mai-dan', [say('mai', 'c10m2.mai.dan', { voice: 'whisper' })])],
      watchers: [{ when: recaptured, cooldown: 8, do: [hint('c10m2.hint.batLai')] }],
      done: { k: 'all', of: [reach('moonlight-b2/officeDoor', 2.5), escort({ all: 'follow' })] },
      fail: [caught('c10m2.fail.gac')],
    },
    {
      id: 'hai-ten-gac', minutes: 1.4, objective: '@c10m2.obj.gac', marker: { at: 'moonlight-b2/storeroom', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c10m2.cp.gac', setup: [inSpace('moonlight-b2', 'lift'), put('moonlight-b2/officeDoor', undefined, 3), B2(), escortSpawn('moonlight-b2/officeDoor'), ...RETURNING] },
      meters: [{ id: 'escort:b2', label: '@c10m2.meter.theo', kind: 'count', max: B2_FOLLOWERS.length }],
      subs: [
        { id: 'kho', text: '@c10m2.sub.kho', done: escort({ all: 'parked' }) },
        { id: 'ha1', text: '@c10m2.sub.ha1', done: ko('gac-ve-1') },
        { id: 'ha2', text: '@c10m2.sub.ha2', done: ko('gac-ve-2') },
      ],
      enter: [bark('gac-ve-1', 'c10m2.bark.ve1'), hint('c10m2.hint.kho', 8000)],
      watchers: [
        { when: escort({ all: 'parked' }), do: [aside('c10m2-kho', [think('c10m2.think.kho')])] },
        { when: after(6), do: [bark('gac-ve-2', 'c10m2.bark.ve2')] },
        { when: recaptured, cooldown: 8, do: [hint('c10m2.hint.batLai')] },
      ],
      fail: [caught('c10m2.fail.gac', 'cau-thang')],
    },
    {
      id: 'cau-thang', minutes: 0.8, objective: '@c10m2.obj.cauThang', marker: { at: 'moonlight-b2/stairs', label: '@c10m2.mk.cauThang', style: 'go' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c10m2.cp.cauThang', setup: [inSpace('moonlight-b2', 'lift'), put('moonlight-b2/storeroom', undefined, 3), B2(), escortSpawn('moonlight-b2/storeroom', { k: 'park', spot: 'moonlight-b2/storeroom' })] },
      meters: [{ id: 'escort:b2', label: '@c10m2.meter.theo', kind: 'count', max: B2_FOLLOWERS.length }],
      enter: [hint('c10m2.hint.goi', 7000)],
      watchers: [{ when: recaptured, cooldown: 8, do: [hint('c10m2.hint.batLai')] }],
      done: { k: 'all', of: [reach('moonlight-b2/stairs', 2.5), ALL_FOLLOW] },
      fail: [caught('c10m2.fail.gac')],
      exit: [
        aside('c10m2-du', [say('mai', 'c10m2.mai.dem', { voice: 'whisper' })]),
        { k: 'cutscene', id: 'c10m2-may-phat' }, { k: 'stealth', arena: null }, { k: 'flag', name: 'b2Out' },
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'ledOutOfB2' }],
  medals: { par: 600, ghost: true, clues: ['man-hinh', 'tu-dong'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], flags: { cutPower: true, ramBlackout: true } },
});

// ---- c10-m3 · Cường Sẹo ------------------------------------------------------------------------------------------

/** The floor while the duel runs: Cường, the five men behind cover, Vân at the side door, Quang alive on the stairs, the group behind the bar. */
const FIGHT: Act[] = [
  ROOM,
  { k: 'spawn', id: 'cuong', cast: 'cuong', at: 'moonlight-floor/floor', team: 'hostile', behaviour: { k: 'guard', post: 'moonlight-floor/floor', sweep: 360 } },
  ...men('guard'),
  { k: 'spawn', id: 'van', cast: 'van', at: 'moonlight-floor/sideDoor', team: 'ally', behaviour: { k: 'guard', post: 'moonlight-floor/sideDoor', sweep: 30 } },
  { k: 'spawn', id: 'quang', cast: 'quang', at: 'moonlight-floor/staffStairs', team: 'ally', behaviour: { k: 'act', name: 'wounded-lie' } },
  escortSpawn('moonlight-floor/staffStairs', { k: 'huddle', at: 'moonlight-floor/behindBar' }),
  SUPPRESS,
];
const downed: Cond = { k: 'on', ev: 'down' };
/**
 * A duel phase is a checkpoint, and checkpoint setup also runs on the normal path: with Cường on the floor (the fight
 * already running) it does nothing, so crossing a threshold never moves the player or restarts the duel; on a restore
 * (mission things despawned first) or the first phase it builds the floor and starts the duel at phase n.
 */
const phaseSetup = (n: 1 | 2 | 3): Act[] => [{ k: 'if', c: { k: 'actor', id: 'cuong' }, then: [],
  else: [inSpace('moonlight-floor', 'staffStairs'), put('moonlight-floor/floor', undefined, 5), ...FIGHT, duel(n)] }];
const phaseStep = (n: 1 | 2 | 3, minutes: number, done: Cond, extra: Act[]) => ({
  id: `hiep-${n}`, minutes, objective: `@c10m3.obj.hiep${n}`,
  checkpoint: { label: `@c10m3.cp.hiep${n}`, setup: phaseSetup(n) },
  enter: extra,
  // down in the duel: no hospital, the phase starts again with Cường's HP at its threshold (escort-boss-qte.md §2.4)
  fail: [{ when: downed, reason: '@c10m3.fail.guc', soft: true }],
  retry: [put('moonlight-floor/floor', undefined, 5), duel(n, true), hint(`c10m3.hint.lai${n}`)],
  done,
});

const c10m3 = defineMission({
  id: 'c10-m3', meta: { hours: [22, 2], giver: 'mai' }, chain: 'c10-m4', lethal: 'fail', allowDown: true,
  start: { space: 'moonlight-floor', at: 'moonlight-floor/staffStairs', hour: 22.8, weather: 'clear', lunar: 15, outfit: 'tin-ao-tu' },
  world: { traffic: 'light', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 22.8, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [FESTIVAL, STRIP_DARK, { k: 'space', variant: { id: 'moonlight-floor', v: 'alarm-lit' } }],
  // down anywhere outside a duel phase: the card and the last checkpoint
  fail: [{ when: downed, reason: '@c10m3.fail.down' }],
  steps: [
    {
      id: 'len-san', minutes: 0.6, objective: '@c10m3.obj.san', marker: { at: 'moonlight-floor/floor', style: 'go' },
      enter: [
        ROOM, escortSpawn('moonlight-floor/staffStairs'), { k: 'music', id: 'pulse' },
        // Quang was to stay in the car (c10-m1): at the alarm he cannot; he is up on the VIP balcony when CS 'c10m3-quang' opens
        aside('c10m3-san', [think('c10m3.think.san'), radio('van', 'c10m3.van.quang')]),
      ],
      done: { k: 'all', of: [reach('moonlight-floor/floor', 3), escort({ all: 'follow' })] },
      exit: [{ k: 'cutscene', id: 'c10m3-quang' }, { k: 'flag', name: 'quangShot' }, { k: 'journal', id: 'j-quang-do-dan' }],
    },
    phaseStep(1, 1.2, phaseSignal(2), [
      hint('c10m3.hint.ne', 8000), aside('c10m3-van-ghim', [radio('van', 'c10m3.van.ghim')]),
    ]),
    {
      ...phaseStep(2, 1.1, phaseSignal(3), [
        hint('c10m3.hint.loa', 8000), bark('cuong', 'c10m3.cuong.hiep2', true),
      ]),
      watchers: [{ when: after(12), do: [aside('c10m3-van-cot', [say('van', 'c10m3.van.cot', { voice: 'shout' })])] }],
    },
    phaseStep(3, 1.1, { k: 'on', ev: 'signal', id: 'duelFinish' }, [
      hint('c10m3.hint.toi', 9000), bark('cuong', 'c10m3.cuong.hiep3'), aside('c10m3-toi', [think('c10m3.think.hiep3')]),
    ]),
    {
      // the finisher: CS11, with "Lật người!" and the chokehold count as scene QTEs inside it (the director's Wait; the
      // frame holds while a prompt is open, the windows run in real seconds under the scene's slow motion)
      id: 'guc', minutes: 0.8,
      enter: [
        { k: 'do', op: 'duel', args: { id: 'cuong', stop: true } },
        { k: 'cutscene', id: 'cs11_dem_toi_nam' },
        // the play state matches the scene's last frame: Cường out cold on the floor (no longer a fighter), his five men
        // give up to Vân's gun and her suppression ends; the pistol lies by Tín's hand
        { k: 'despawn', id: 'cuong' },
        { k: 'spawn', id: 'cuong', cast: 'cuong', at: 'moonlight-floor/floor', team: 'neutral', behaviour: { k: 'act', name: 'sleep' } },
        { k: 'do', op: 'ally', args: { id: 'van', stop: true } }, bark('van', 'c10m3.van.giaTay', true),
        ...MEN.map((id): Act => ({ k: 'behave', id, b: { k: 'surrender' } })),
        { k: 'prop', id: 'sung-san', kind: 'pistol-floor', at: 'moonlight-floor/floor' },
      ],
    },
    {
      // the only prompt is "Còng tay": the pistol is a prop, never a pickup, and fire is locked
      id: 'cong-tay', minutes: 0.4, objective: '@c10m3.obj.cong',
      interact: [{ id: 'cong-tay', at: 'moonlight-floor/floor', r: 1.6, hold: 1, prompt: '@c10m3.int.cong', kind: 'use', when: 'foot' }],
      enter: [{ k: 'player', lock: ['fire', 'run'] }],
      done: used('cong-tay'),
      exit: [
        { k: 'player', lock: null },
        { k: 'cutscene', id: 'cs11_dem_toi_nam_c' },
        { k: 'prop', id: 'sung-san', remove: true }, { k: 'flag', name: 'cuongCuffed' }, { k: 'journal', id: 'j-cuong-bi-cong' },
        { k: 'behave', id: 'cuong', b: { k: 'act', name: 'cuffed-behind' } }, { k: 'music', id: null },
      ],
    },
    {
      id: 'ra-cua', minutes: 0.8, objective: '@c10m3.obj.ra', marker: { at: 'moonlight-floor/front', label: '@c10m3.mk.cua', style: 'go' },
      checkpoint: { label: '@c10m3.cp.ra', setup: [
        inSpace('moonlight-floor', 'staffStairs'), put('moonlight-floor/floor', undefined, 5), ROOM, ...men('surrender'),
        { k: 'spawn', id: 'cuong', cast: 'cuong', at: 'moonlight-floor/floor', team: 'neutral', behaviour: { k: 'act', name: 'cuffed-behind' } },
        { k: 'spawn', id: 'van', cast: 'van', at: 'moonlight-floor/sideDoor', team: 'ally', behaviour: { k: 'guard', post: 'moonlight-floor/floor', sweep: 30 } },
        { k: 'spawn', id: 'quang', cast: 'quang', at: 'moonlight-floor/staffStairs', team: 'ally', behaviour: { k: 'act', name: 'wounded-lie' } }] },
      meters: [{ id: 'escort:b2', label: '@c10m2.meter.theo', kind: 'count', max: B2_FOLLOWERS.length }],
      enter: [escortCmd({ k: 'follow' }), aside('c10m3-ra', [say('mai', 'c10m3.mai.ra')])],
      done: { k: 'all', of: [reach('moonlight-floor/front', 2.5), ALL_FOLLOW] },
      exit: [
        // released inside the front doors, in the set they walk in ('rescued' per follower), before the set is left
        escortCmd({ k: 'release' }), { k: 'waitFor', c: escort({ all: 'safe', count: B2_FOLLOWERS.length }), timeout: 6 },
        { k: 'space', leave: 'moonlight.crowd' }, { k: 'stealth', arena: null },
        { k: 'cutscene', id: 'cs11_dem_toi_nam_d' },
        // 11 from the barge (c7-m3) + the 17 of B2, Mai included (story-decisions.md 13)
        { k: 'flag', name: 'rescued', value: 28 }, { k: 'flag', name: 'maiSafe' },
      ],
    },
    {
      id: 'ngoai-duong', minutes: 0.4,
      meters: [{ id: 'da-cuu', label: '@c10m3.meter.cuu', kind: 'count', flag: 'rescued' }],
      enter: [
        { k: 'toast', text: '@c10m3.toast.cuu' },
        talk('c10m3-van-cuoi', [
          say('van', 'c10m3.van.sach', { if: { k: 'conscience', is: 'clean' } }),
          say('van', 'c10m3.van.vet', { if: { k: 'not', c: { k: 'conscience', is: 'clean' } } }),
          say('van', 'c10m3.van.ket')]),
        aside('c10m3-cuoi', [think('c10m3.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'b2Freed' }],
  medals: { par: 480 },
  replay: {
    abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], flags: { cutPower: true, ramBlackout: true, foundMai: true, b2Out: true, rescued: 11 },
    evidence: ['ev-so-xuat-b2', 'ev-sen-b2'],
  },
});

// ---- c10-m4 · Còn hai đơn ----------------------------------------------------------------------------------------

const c10m4 = defineMission({
  id: 'c10-m4', meta: { hours: [23, 3], giver: 'diem' }, chain: 'c11-m1', lethal: 'fail',
  start: { at: 'moonlight.crowd', yaw: 0, hour: 23.67, weather: 'clear', lunar: 15, outfit: 'tin-ao-tu' },
  world: { traffic: 'light', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 23.67, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [
    FESTIVAL, STRIP_DARK,
    { k: 'vehicle', id: 'cap-cuu', model: 'ambulance', at: 'moonlight.ambulance', yaw: -H, state: 'park' },
    { k: 'spawn', id: 'quang', cast: 'quang', at: 'moonlight.ambulance', team: 'ally', behaviour: { k: 'act', name: 'stretcher' } },
    { k: 'spawn', id: 'cap-cuu', cast: 'cap-cuu', at: 'moonlight.ambulance', team: 'neutral', behaviour: { k: 'act', name: 'cross-arms' } },
    { k: 'vehicle', id: 'vios-van', model: 'vios-van', at: 'moonlight.vanCar', yaw: H, state: 'park' },
    { k: 'spawn', id: 'van', cast: 'van', at: 'moonlight.vanCar', team: 'ally', behaviour: { k: 'idle' } },
    { k: 'spawn', id: 'coba', cast: 'coba', at: 'moonlight.crowd', team: 'ally', behaviour: { k: 'act', name: 'kettle-pour' } },
  ],
  steps: [
    {
      id: 'ra-xe', minutes: 0.6, objective: '@c10m4.obj.xe', marker: { at: 'moonlight.ambulance', label: '@c10m4.mk.xe', style: 'go' },
      enter: [
        { k: 'title', kind: 'time', text: '@c10m4.title', sub: '@c10m4.titleSub' },
        { k: 'spawn', id: 'mai', cast: 'mai', at: 'moonlight.crowd', team: 'ally', behaviour: { k: 'follow', target: 'player', dist: 1.2 } },
        aside('c10m4-di', [say('mai', 'c10m4.mai.di')]),
      ],
      done: reach('moonlight.ambulance', 4),
    },
    {
      id: 'hai-don', minutes: 0.8,
      enter: [
        { k: 'toast', text: '@c10m4.toast.dinhVi' },
        { k: 'do', op: 'tracker', args: { id: 'dinh-vi-sa-lan', route: 'r-xe-dong-lanh', on: true } },
        { k: 'evidence', id: 'ev-dinh-vi-chay' },
        talk('c10m4-dinh-vi', [think('c10m4.think.dinhVi1'), think('c10m4.think.dinhVi2')]),
        { k: 'call', id: 'c10m4-diem', from: 'diem', ring: true, lines: [
          phone('diem', 'c10m4.d1'), phone('diem', 'c10m4.d2'), phone('tin', 'c10m4.t1'), phone('diem', 'c10m4.d3'), phone('diem', 'c10m4.d4'),
          // the witness the paper and the Ministry waited for (c9-m2: "Chị Diễm còn sợ"); c11-m2 pays it off
          phone('diem', 'c10m4.d5'), phone('diem', 'c10m4.d6'), phone('tin', 'c10m4.t2')] },
        { k: 'evidence', id: 'ev-su-bi-bat' }, { k: 'flag', name: 'suTaken' },
        { k: 'call', id: 'c10m4-van', from: 'van', ring: false, lines: [
          radio('van', 'c10m4.v1'), radio('van', 'c10m4.v1b'), radio('van', 'c10m4.v2'), radio('van', 'c10m4.v3'), radio('van', 'c10m4.v4')] },
        { k: 'evidence', id: 'ev-truc-thang-1h' }, { k: 'flag', name: 'heliAt1' },
        { k: 'deduce', id: 'muoiHaiNguoi' },
        talk('c10m4-hai-don', [think('c10m4.think.hai1'), think('c10m4.think.hai2'), radio('tin', 'c10m4.t3'), radio('van', 'c10m4.v5')]),
        { k: 'journal', id: 'j-hai-don' },
      ],
    },
    {
      id: 'goi-ma', minutes: 0.5,
      enter: [
        talk('c10m4-muon', [say('mai', 'c10m4.mai.muon')]),
        { k: 'call', id: 'c10m4-ma', from: 'bana', ring: false, lines: [
          phone('bana', 'c10m4.ma1'), say('mai', 'c10m4.mai1'), phone('bana', 'c10m4.ma2'), phone('bana', 'c10m4.ma3'), say('mai', 'c10m4.mai2'),
          phone('bana', 'c10m4.ma4'), say('tin', 'c10m4.t4'), phone('bana', 'c10m4.ma5'), say('tin', 'c10m4.t5')] },
      ],
    },
    {
      id: 'tam-biet', minutes: 0.4,
      enter: [
        { k: 'choice', id: 'traLoiQuang', prompt: '@c10m4.q.quang', timeout: 12, default: 'hen', options: [
          { id: 'hen', text: '@c10m4.opt.hen' }, { id: 'tha', text: '@c10m4.opt.tha' }, { id: 'nam', text: '@c10m4.opt.nam' }] },
        { k: 'cutscene', id: 'c10m4-xe-cap-cuu' },
        // Mai's lotus hairclip from Phượng's desk (c8-m3) is back in her braid (the ambulance scene)
        { k: 'if', c: { k: 'item', id: 'kep-toc-mai' }, then: [{ k: 'take', item: 'kep-toc-mai' }] },
        { k: 'vehicle', id: 'cap-cuu', state: 'flee' }, { k: 'despawn', id: 'quang' }, { k: 'despawn', id: 'cap-cuu' },
        // the dented mooncake from the street stall stays with Mai (she brings it home; c11-m4's 'the mooncake she kept')
        { k: 'if', c: { k: 'item', id: 'banh-nuong' }, then: [{ k: 'take', item: 'banh-nuong' }] },
      ],
    },
    {
      id: 'len-xe', minutes: 0.4, objective: '@c10m4.obj.len', marker: { at: 'ch10.dream', label: '@c10m4.mk.dream', style: 'go' },
      enter: [
        { k: 'vehicle', id: 'dream', model: 'dream', at: 'ch10.dream', yaw: -H, state: 'park' },
        { k: 'spawn', id: 'tam-ho', cast: 'tam-ho', at: 'bia-hoi', team: 'ally', behaviour: { k: 'act', name: 'cross-arms' } },
        talk('c10m4-tam-ho', [say('tam-ho', 'c10m4.th1'), say('tam-ho', 'c10m4.th2'), say('tin', 'c10m4.t6'), say('tam-ho', 'c10m4.th3')]),
      ],
      done: { k: 'reach', at: 'ch10.dream', r: 3, mode: 'bike' },
      exit: [{ k: 'despawn', id: 'mai' }, aside('c10m4-di-thoi', [think('c10m4.think.di')])],
    },
  ],
  rewards: [{ k: 'flag', name: 'twoOrders' }],
  medals: { par: 240 },
  replay: {
    abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'faceCover'], flags: { cuongCuffed: true, maiSafe: true, b2Freed: true, rescued: 28 },
    evidence: ['ev-so-xuat-b2'],
  },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string, role = false): CastDef =>
  ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look, ...(role ? { role: `@cast.${id}.role` } : {}) });
export const CAST: CastDef[] = [
  person('canh-pho', '#3a3a40', 'C', 'ran-den'), person('tho-dien', '#6a5d4a', 'T', 'ran-den'), 
  person('co-banh', '#c9a27a', 'B', 'vendor-woman'), person('gac-b2', '#5d6470', 'G', 'ran-den'), person('gac-camera', '#4f5560', 'G', 'ran-den'),
  person('gac-lim', '#6f7480', 'G', 'ran-den'), person('gac-ve', '#55606e', 'G', 'ran-den'), person('dan-em-cuong', '#2f3036', 'Đ', 'ran-den'),
  person('dua-nho', '#ffd27a', 'N', 'lantern-kid'), person('be-na', '#ffc2d1', 'Na', 'be-na', true), person('cap-cuu', '#e9eef2', 'C', 'paramedic'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.c10.${key}.t`, text: `@ev.c10.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 10, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-so-xuat-b2', 'document', 'soXuat', 'paper', ['b2', 'truck', 'luc'], '23:00'),
  ev('ev-man-hinh-b2', 'photo', 'manHinh', 'cctv', ['b2', 'mai']),
  ev('ev-sen-b2', 'object', 'senB2', 'lotus', ['b2', 'mai']),
  ev('ev-dinh-vi-chay', 'place', 'dinhVi', 'gps', ['truck', 'barge', 'port']),
  ev('ev-su-bi-bat', 'testimony', 'su', 'phone', ['su', 'diem', 'phuong']),
  ev('ev-truc-thang-1h', 'testimony', 'trucThang', 'heli', ['phuong', 'heli'], '01:00'),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.c10.${key}.t`, text: `@j.c10.${key}.x` });
export const JOURNAL: JournalDef[] = [
  note('j-dem-ram', 'diary', 'demRam'), note('j-gap-mai', 'diary', 'gapMai'), note('j-quang-do-dan', 'people', 'quang'),
  note('j-cuong-bi-cong', 'people', 'cuong'), note('j-hai-don', 'notes', 'haiDon'),
];
export const QUESTIONS: QuestionDef[] = [{
  id: 'muoiHaiNguoi', prompt: '@c10m4.q', answer: 'xe-lanh', cost: 1, hint: '@c10m4.q.hint',
  options: [
    { id: 'xe-lanh', text: '@c10m4.q.xe', needs: ['ev-so-xuat-b2', 'ev-dinh-vi-chay'] },
    { id: 'con-b2', text: '@c10m4.q.b2' }, { id: 'truc-thang', text: '@c10m4.q.heli' }],
  onCorrect: [{ k: 'flag', name: 'knowsTruck' }],
}];

/**
 * Chapter places (candidates for sites.ts, story-decisions.md §2 c10 rows): spots on today's map next to sites.ts ones
 * (the same sidewalk or lane as moonlight.brawl, moonlight.vanCar and moonlight.ambulance).
 */
export const PLACES = {
  'ch10.xeVan': { x: 60.5, z: 62.2, yaw: Math.PI, r: 0.45 },
  'ch10.banh': { x: 72, z: 46.8, yaw: Math.PI, r: 0.6 },
  'ch10.dream': { x: 86, z: 50.6, yaw: -H, r: 1 },
};

/**
 * Off-map space anchors this chapter places things at ('space/anchor' in scripts, 'set:space.anchor' in cutscenes):
 * a contract for the level kit (spaces-surfaces-levelkit.md §12). Chapter 1 declares moonlight-b2 crates, aisle, lotus
 * and door; chapter 5 the moonlight-floor, moonlight-vip and spa-back anchors this chapter also uses. Entry links:
 * moonlight-b2 'lift', moonlight-floor 'staffStairs', moonlight-vip 'service' (from spa-back 'service').
 */
export const ANCHORS: Record<string, Record<string, string>> = {
  'moonlight-b2': {
    lift: 'inside the staff lift at B2, the doors open onto the cold-room passage (entry link "lift")', liftShaft: 'bottom of the lift shaft under the cab (CS09 looks up)',
    coldRoom: 'middle of the packing/cold room: fish crates on pallets, red emergency light', packing: 'packing table under a dead tube light (guard post; sealed grey packets, never up close)',
    freezer: 'walk-in freezer door, frosted pane (body hide)', officeDoor: 'security office door between the cold room and the cell corridor',
    desk: 'the CCTV desk: four monitors, the operator\'s chair facing them', monitors: 'the wall of four monitors (photo target: cold room, passage, corridor, cells)',
    log: 'a dispatch sheet taped to the desk ("23:00 — XE LẠNH — 12 KIỆN")', keys: 'key rack by the office door: the master keys of the cells',
    corridor: 'entrance of the cell corridor', lotus1: 'charcoal lotus at the first turn', lotus2: 'charcoal lotus at the second turn, shakier', lotus3: 'charcoal lotus at the third turn, shakiest',
    cellMai: 'door of cell 4 (Mai and two little girls), the bars hide for the CS10 glide', cell1: 'cell 1 door (five)', cell2: 'cell 2 door (five)', cell3: 'cell 3 door (four)',
    storeroom: 'side storeroom off the passage between the office and the cold room (SafeSpot: "Cho mọi người núp ở đây")',
    stairs: 'foot of the staff stairs up to the dance floor (escortable)', generator: 'backup generator room door (the restart)', intercom: 'intercom speaker on the passage wall',
  },
  'moonlight-floor': {
    staffStairs: 'top of the staff stairs from B2, beside the bar (entry link "staffStairs")', sideDoor: 'side fire door Vân comes through (her suppression post)',
    cover1: 'overturned tables by the front doors (cover)', cover2: 'the cashier counter by the front doors (cover)',
    speakerL: 'speaker stack left of the DJ booth (duel: "Đẩy vô loa")', speakerR: 'speaker stack right of the DJ booth', trolley: 'drinks trolley by the bar (duel: "Đá xe đẩy")',
    pillar: 'mirrored pillar mid-floor (a charge into it stuns him)', behindBar: 'behind the bar counter: the group huddles here during the fight',
  },
  'moonlight-vip': { service: 'the service-corridor door from the spa\'s back section (entry link "service"; dark in the blackout)' },
  'spa-back': { service: 'end of the back corridor: the service corridor door through to Moonlight\'s back-of-house' },
};

/**
 * Case-board cards this chapter adds to BẢNG MANH MỐI (slots 70–75, a band clear of chapters 1–5's 0–33 and of the
 * slots chapters 6–9 took: 34–44, 46–51, 54–61, 90–95) and the strings tying them to chapters 2, 4 and 5.
 */
export const BOARD_CARDS: BoardCard[] = [
  { id: 'ev-so-xuat-b2', slot: 70 }, { id: 'ev-man-hinh-b2', slot: 71 }, { id: 'ev-sen-b2', slot: 72 },
  { id: 'ev-dinh-vi-chay', slot: 73 }, { id: 'ev-su-bi-bat', slot: 74 }, { id: 'ev-truc-thang-1h', slot: 75 },
];
export const BOARD_LINKS: [string, string][] = [
  ['ev-so-xuat-b2', 'ev-dinh-vi-chay'], ['ev-so-xuat-b2', 'ev-so-do-b2'], ['ev-so-xuat-b2', 'ev-luc-noi'], ['ev-so-xuat-b2', 'ev-man-hinh-b2'],
  ['ev-man-hinh-b2', 'ev-sen-b2'], ['ev-man-hinh-b2', 'ev-cap-mai'], ['ev-sen-b2', 'ev-sen-than-spa'],
  ['ev-su-bi-bat', 'ev-diem-goi'], ['ev-su-bi-bat', 'ev-truc-thang-1h'], ['ev-truc-thang-1h', 'ev-chi-phuong'], ['ev-truc-thang-1h', 'ev-dinh-vi-chay'],
];

/**
 * Engine ids this chapter uses beyond story/contract.ts (and its SCENE_REQUESTS), by contract kind, with the lane that
 * builds them (the integrator adds them to ENGINE_CONTRACT; scripts/story-ch10.test.mjs lints the chapter against the
 * contract plus these, and fails if one is unused).
 */
export const ENGINE_NEEDS: Partial<Record<ContractKind, Record<string, ContractEntry>>> = {
  ops: {
    duel: ['core', "the Cường Sẹo boss duel (escort-boss-qte.md §2; story/melee.ts, boss-cuong.ts) {id, boss, hp, phases, phase, env[anchors], finishAt, phase3Limit, guns, reset?} / {id, stop:true}: melee lock (Space dodges, F attacks and counters, E shoves into the speaker stacks and the trolley), duel framing; raises signals 'duelPhase' {phase} and 'duelFinish'; down in the duel pushes 'down' (allowDown missions)"],
    qte: ['ui', "a scene QTE (escort-boss-qte.md §3, context 'scene'): the scene.ts cue {k:'qte', id, kind press|hold|mash|band, keys, label @key, window (real seconds), target?, count?[@keys], anchor?, onFail 'loop', loop?: shot label, lethal?: false} compiled into the director's Wait (CS11 'Lật người!' and the chokehold count)"],
    powerSweep: ['world', "the CS09 sign-by-sign blackout as a scene cue {k:'power', region {id, rect, level}, sweep {axis, dark, from, to, step}} (festival-blackout-heli.md §2.4, world.setPower steps)"],
    ally: ['stealth', "ally suppression (escort-boss-qte.md §2.7) {id, suppress:{from, targets[], cover[]}} / {id, stop:true}: Vân holds the side door and pins the targets behind cover, firing at the cover only, never at a person"],
    tracker: ['ui', "the GPS tracker blip planted in c7-m2 (phone-detective-ui.md: GPS blip) on the minimap and the phone map, moving along a sites.ts route {id, route, on} / {id, on:false}"],
  },
  signals: {
    duelPhase: ['core', 'the duel crossed into a phase: {type:"signal", id:"duelPhase", phase: 2|3} (400 HP, thresholds 264 and 132)'],
    duelFinish: ['core', 'the duel reached the finisher (≤ 15 % HP or 50 s into phase 3): {type:"signal", id:"duelFinish"}'],
  },
  arenas: {
    'ram-pho-dem': ['stealth', "the strip on Rằm night, variants 'lit' and 'dark': festival crowd zones (walking among the lantern crowds blends), the lion-dance drum rolls as sound cover (×0.25 within 25 m), the back alley, the downpipe and the north-row roofs (tin, loud), the transformer box"],
    'moonlight-b2': ['stealth', "TẦNG HẦM B2, variant 'b2-dark': cold room (three flashlights, the walk-in freezer body hide), security office (cameras monitored until switched off), cell corridor, side storeroom SafeSpot, staff stairs; muffled drum cover ×0.5; recaptured followers are walked back to their cells"],
  },
  meters: {
    'trong-lan': ['audio', 'the lion-dance drum cover at the player 0..1 (lion-dance.ts coverAt with distance falloff; 1 = a roll masks noise)'],
    'escort:b2': ['stealth', 'followers of the B2 group with the player (count, max 17)'],
  },
  templates: {
    'ho-vang': ['director', 'Hổ Vàng street-gang man in the yellow shirt (#d8a020): Tám Hổ\'s men at the back gate, the fake brawl, the crowd'],
    'lantern-kid': ['director', 'a child of the lantern parade with a star lantern on a stick (pose carry-lantern)'],
  },
  acts: {
    'wounded-lie': ['director', 'lying on the stairs, alive, eyes half open, a folded cardigan pressed to his side (no blood)'],
    'cuffed-behind': ['director', 'kneeling with the wrists cuffed behind the back (escort-boss-qte.md §2.9)'],
    stretcher: ['director', 'lying on an ambulance stretcher with an oxygen mask, alive'],
  },
  outfits: { 'tin-ao-tu': ['core', "Tín in Ông Tư's faded dark jacket over the T-shirt, Ông Tư's whistle on its cord (chapter 7 asks for the same id; stealth visibility ×0.9)"] },
  props: { 'pistol-floor': ['director', 'the pistol Cường tossed away, lying on the dance floor by Tín\'s hand: a prop, never a pickup'] },
  models: { ambulance: ['vehicles', 'city ambulance (white van body, red cross, light bar), parked with its rear doors open'] },
  clips: {
    'touch-whistle': ['director', 'touches Ông Tư\'s whistle on its cord at his chest'],
    'wipe-tears': ['director', 'wipes her face with the back of a hand (a gentle clip for a rescued person)'],
    'aim-pistol': ['director', 'raises a pistol at arm\'s length'], 'leap-down': ['director', 'vaults a balcony rail and drops (lands out of frame)'],
    'toss-away': ['director', 'tosses an object away to the side'], 'crack-wrists': ['director', 'cracks his wrists and rolls his neck'],
    'raise-bottle': ['director', 'raises a broken bottle overhead and holds (no strike)'], cheer: ['director', 'children cheering, arms up'],
  },
  pairClips: {
    'forehead-touch': ['director', 'one kneels and touches his forehead to the other\'s'],
    cradle: ['director', 'kneeling, one holds the other\'s head and shoulders off the floor'],
    'pin-down': ['director', 'one kneels over the other, pinning his shoulders (no strike)'],
    chokehold: ['director', 'the non-lethal chokehold from behind; the other slowly goes limp (no strike)'],
    'cuff-wrists': ['director', 'one zip-cuffs the other\'s wrists behind his back'],
  },
  scenePoses: {
    'carry-lantern': ['director', 'a child holding a star lantern on a stick, arm forward and up (festival-blackout-heli.md §1.5)'],
    'phone-up': ['director', 'holding a phone up, screen lit (the firefly phones of CS09)'],
    'hands-up': ['director', 'surrendering, hands raised'],
  },
  sceneProps: {
    keycard: ['director', 'Quang\'s black lift keycard'], 'lift-display': ['director', 'the lift\'s floor display (text: 1, B1, B2)'],
    pistol: ['director', 'a black pistol (prop only)'], 'broken-bottle': ['director', 'a broken bottle neck'],
    'plastic-cuffs': ['director', 'a pair of plastic zip cuffs'], blanket: ['director', 'a folded blanket'], mooncake: ['director', 'a lotus-seed mooncake in its paper wrapper (CS10 and the ambulance: a little dented; c11-m4 asks for the same prop)'],
    'folded-cardigan': ['director', 'Mai\'s pale blue cardigan folded into a pad'], stretcher: ['director', 'an ambulance stretcher'],
  },
  rideModels: { 'lift-cab': ['director', 'the staff lift cab sinking down its shaft (CS09)'] },
  fx: {
    'emergency-light': ['director', 'red emergency light wash, slow pulse'], 'lights-on': ['director', 'tube lights flicking on one by one'],
    'alarm-light': ['director', 'rotating red alarm light'],
  },
  sfx: {
    'breaker-thunk': ['audio', 'a breaker thrown, then sign after sign dying with an electric thunk'], 'bass-cut': ['audio', 'the club bass cut off mid-beat'],
    'cheer-kids': ['audio', 'children cheering in the street'], 'lift-cable': ['audio', 'lift cables creaking'], 'gunshot-echo': ['audio', 'one pistol shot, echoing (over black)'],
    'pistol-clatter': ['audio', 'a pistol sliding across a tiled floor'], 'generator-start': ['audio', 'a diesel generator coughing into life'],
    'intercom-crackle': ['audio', 'an intercom clicking on'], 'alarm-klaxon': ['audio', 'an alarm klaxon'], 'cuffs-drop': ['audio', 'plastic cuffs landing on tiles'],
    'siren-far': ['audio', 'an ambulance siren pulling away'],
  },
  ambience: { 'festival-street': ['audio', 'Rằm night street: crowd, children, the lion-dance drums at a distance'] },
  meshes: { 'moonlight-b2.cell4-bars': ['spaces', 'the bars of cell 4, hidden for the CS10 glide'] },
};

export const chapter = defineChapter({
  chapter: 10,
  missions: [c10m1, c10m2, c10m3, c10m4],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, questions: QUESTIONS, places: PLACES,
  text: TEXT,
});
