import { defineChapter, defineMission, type Act, type Behaviour, type BoardCard, type CastDef, type Cond, type EvidenceDef, type JournalDef, type Line, type PlaceDef, type QuestionDef, type WorldPolicy } from '../types.ts';
import { TEXT } from '../text/vi/ch03.ts';

/**
 * Chương 3 · KHÔNG AI TIN (story-final.md ch.3 with story-decisions.md 2, 4, 8, 14 and §8 c3-m1..m3): c3-m1 the
 * report at CÔNG AN PHƯỜNG (the desk officer, Thiếu tá Lực's tea and his question, the phone choice, Vân at the
 * motorbike rack, Lực's call that the player sees and Tín does not) and the counter-tail: a black SUV follows Tín
 * home and he shakes it in the Chợ An Hòa lane, the park, a hẻm or a shop; c3-m2 KHO 7 scrubbed by day (P1, Quận 4)
 * with Vân: hold T to observe, four clues and the bear's ear, "Ai báo cho tụi nó?", and "Làm mắt cho chị không?";
 * c3-m3 Ông Tư's 2014 photo and the training course in the real alley behind SỬA XE TƯ (noise, shadow, peek, the
 * bolt, Hạ nhanh / Khóa cổ, the drag), the foot tail of Bin into the night market, the course grade A–D, the
 * burner (a cheap old smartphone with no accounts), the button camera and the rule: khóa cổ, đếm tới năm, không giết ai (LƯƠNG TÂM opens here).
 * Places are story/sites.ts ids, 'space/anchor' (ANCHORS) or this chapter's PLACES; texts are '@keys' of
 * text/vi/ch03.ts; brand constants come from text/vi/common.ts. Register in content/index.ts LOADERS:
 * `3: () => import('./ch03.ts'),`.
 *
 * Engine ids used here (story/contract.ts, plus the chapter-3 requests listed in scripts/story-ch03.test.mjs
 * CH03_REQUESTS): models 'suv-den' (the existing 'suv' body, black, tinted) and 'vios-van' (Vân's silver sedan),
 * 'dream'; `do` op 'chase' with controller 'counterTail' (chase-wanted.md §5.2: events 'escaped'/'caught' with
 * id = the controller id, meter 'eye:suv-den'); world prop 'sign' (variant 'cho-thue'); the KHO 7 shell variant
 * 'scrubbed' (space act); stealth arena 'hem-ong-tu' (the course; Bin is its one guard, countConscience off);
 * abilities 'observe', 'lean', 'throw', 'takedown', 'drag', 'phoneSilent', 'luongTam'; the tail act on foot
 * ('tail:bin'); items 'bolt', 'burner', 'clipCam'. In the training arena the kit pushes {type:'takedown', id,
 * cause: 'fast' | 'choke' | 'slip'} (the outcome) and no 'knockout', so practice never enters LƯƠNG TÂM.
 */

const H = Math.PI / 2, PI = Math.PI;
const NO_HUB: WorldPolicy['activities'] = { gunStore: false, bank: false, deck: false, boatRental: false, sideJobs: false, orders: false };
const say = (who: string, key: string, o: Omit<Line, 'who' | 'text'> = {}): Line => ({ who, text: `@${key}`, ...o });
const think = (key: string): Line => say('tin', key, { voice: 'think' });
const talk = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines });
const aside = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines, mode: 'ambient' });
const hint = (key: string, ms = 7000): Act => ({ k: 'hint', text: `@${key}`, ms });
const bark = (actor: string, key: string, shout = false): Act => ({ k: 'bark', actor, text: `@${key}`, shout });
const reach = (at: string, r = 3): Cond => ({ k: 'reach', at, r });
const used = (id: string): Cond => ({ k: 'on', ev: 'interact', id });
const owned = (id: string): Cond => ({ k: 'evidence', id });
const after = (seconds: number): Cond => ({ k: 'after', seconds });
const flag = (name: string, eq?: boolean | string): Cond => (eq === undefined ? { k: 'flag', name } : { k: 'flag', name, eq });
const isVar = (name: string, value: string | number | boolean): Cond => ({ k: 'var', name, op: '==', value });
/** Teleport unless the player is already there (null level: the ground); see content/ch01.ts. */
const put = (at: string, vehicle?: string, r = 8): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level: null }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });
/** An actor who may already be on stage walks to its new behaviour; after a restore (nobody there) it is spawned. */
const keep = (id: string, cast: string, at: string, b: Behaviour, o: { yaw?: number; team?: 'ally' | 'neutral' | 'hostile'; tags?: string[]; flashlight?: boolean } = {}): Act =>
  ({ k: 'if', c: { k: 'actor', id }, then: [{ k: 'behave', id, b }], else: [{ k: 'spawn', id, cast, at, team: o.team ?? 'ally', behaviour: b, ...(o.yaw !== undefined ? { yaw: o.yaw } : {}), ...(o.tags ? { tags: o.tags } : {}), ...(o.flashlight ? { flashlight: true } : {}) }] });
/** Off stage or in another space: replace the actor (used behind fades and space changes, never in view). */
const recast = (id: string, cast: string, at: string, b: Behaviour, o: { yaw?: number; team?: 'ally' | 'neutral' | 'hostile'; tags?: string[]; flashlight?: boolean } = {}): Act[] =>
  [{ k: 'despawn', id }, { k: 'spawn', id, cast, at, team: o.team ?? 'ally', behaviour: b, ...(o.yaw !== undefined ? { yaw: o.yaw } : {}), ...(o.tags ? { tags: o.tags } : {}), ...(o.flashlight ? { flashlight: true } : {}) }];

// ---- c3-m1 · Trình báo ------------------------------------------------------------------------------------------

const caught: Cond = { k: 'on', ev: 'caught', id: 'duoi-suv' };
const c3m1 = defineMission({
  id: 'c3-m1', meta: { hours: [7, 12], giver: 'tin' },
  start: { at: 'cafe-co-ba.dream', yaw: PI, vehicle: 'dream', hour: 8.67, weather: 'clear', lunar: 2, outfit: 'tin-shipper' },
  world: { traffic: 'normal', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 8.67, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  // the black SUV waits across the street from the station from the start (an observant player sees it on arrival)
  setup: [
    { k: 'vehicle', id: 'suv-den', model: 'suv-den', at: 'ch3.suv-cho', yaw: PI, state: 'park' },
    { k: 'photoTarget', id: 'xe-den', subject: 'suv-den', evidence: 'ev-xe-den', minQuality: 0.6, scope: 'mission' },
  ],
  optional: [{ id: 'xe-den', text: '@c3m1.opt.xeDen', when: owned('ev-xe-den') }],
  steps: [
    {
      id: 'sang-mung-hai', minutes: 0.4,
      enter: [
        { k: 'title', kind: 'time', text: '@c3m1.title', sub: '@c3m1.titleSub' },
        { k: 'spawn', id: 'coba', cast: 'coba', at: 'cafe-co-ba.backDoor', team: 'ally', behaviour: { k: 'act', name: 'kettle-pour' } },
        talk('c3m1-coba', [say('coba', 'c3m1.coba1'), say('tin', 'c3m1.tin1'), say('coba', 'c3m1.coba2'), say('tin', 'c3m1.tin2'), say('coba', 'c3m1.coba3')]),
        aside('c3m1-di', [think('c3m1.think.di')]),
      ],
    },
    {
      id: 'toi-don', minutes: 0.7, objective: '@c3m1.obj.don', marker: { at: 'cong-an-phuong', label: '@c3m1.mk.don', style: 'go' },
      watchers: [{ when: after(10), do: [aside('c3m1-duong', [think('c3m1.think.duong')])] }],
      done: reach('cong-an-phuong', 8),
    },
    {
      id: 'vao-don', minutes: 0.3, objective: '@c3m1.obj.vao',
      checkpoint: { label: '@c3m1.cp.don', setup: [put('cong-an-phuong'), { k: 'spawn', id: 'truc-ban', cast: 'truc-ban', at: 'cong-an-office/desk', team: 'neutral', behaviour: { k: 'act', name: 'phone-bored' } }] },
      interact: [{ id: 'vao-don', at: 'cong-an-phuong', r: 2.2, prompt: '@c3m1.int.vao', kind: 'enter', when: 'foot' }],
      done: used('vao-don'),
      // inside, the bike is tidied onto the rack spot (a bike-clear curb spot) so the later restores agree with it
      exit: [{ k: 'space', enter: 'cong-an-office', link: 'front' }, { k: 'vehicle', id: 'dream', model: 'dream', at: 'ch3.ca-dream', yaw: 0, state: 'park' }],
    },
    {
      id: 'quay', minutes: 0.4, objective: '@c3m1.obj.quay', marker: { at: 'cong-an-office/desk', style: 'talk' },
      interact: [{ id: 'hoi-truc-ban', at: 'cong-an-office/desk', r: 1.8, prompt: '@c3m1.int.hoi', kind: 'talk' }],
      done: used('hoi-truc-ban'),
      exit: [talk('c3m1-quay', [say('truc-ban', 'c3m1.tb1'), say('tin', 'c3m1.tin3'), say('truc-ban', 'c3m1.tb2'), say('tin', 'c3m1.tin4'), say('truc-ban', 'c3m1.tb3')])],
    },
    {
      id: 'ghe-cho', minutes: 0.6, objective: '@c3m1.obj.ghe', marker: { at: 'cong-an-office/bench', style: 'subtle' },
      interact: [{ id: 'ngoi-cho', at: 'cong-an-office/bench', r: 1.6, prompt: '@c3m1.int.ngoi', kind: 'seat' }],
      enter: [{ k: 'clue', id: 'tv', at: 'cong-an-office/tv', r: 2.5, evidence: 'ev-tv-mai-am', examine: 'object:tv-news', scope: 'step' }],
      watchers: [{ when: reach('cong-an-office/tv', 4), do: [aside('c3m1-tv', [say('tv', 'c3m1.tv1'), think('c3m1.think.tv')])] }],
      optional: [{ id: 'tv', text: '@c3m1.opt.tv', when: owned('ev-tv-mai-am') }],
      done: used('ngoi-cho'),
      exit: [
        { k: 'player', pose: 'sit-stool' }, talk('c3m1-doi', [think('c3m1.think.doi')]),
        { k: 'spawn', id: 'luc', cast: 'luc', at: 'cong-an-office/corridor', team: 'neutral', behaviour: { k: 'idle' } },
        { k: 'cutscene', id: 'c3m1-luc-moi' }, { k: 'player', pose: null },
      ],
    },
    {
      id: 'theo-luc', minutes: 0.4, objective: '@c3m1.obj.theo', marker: { at: 'cong-an-office/office', label: '@c3m1.mk.phong', style: 'go' },
      enter: [{ k: 'behave', id: 'luc', b: { k: 'goto', at: 'cong-an-office/luc' } }],
      done: reach('cong-an-office/office', 1.8),
    },
    {
      id: 'phong-luc', minutes: 1.1,
      enter: [
        { k: 'cutscene', id: 'c3m1-phong-luc' },
        { k: 'choice', id: 'dienThoai', prompt: '@c3m1.q.dienThoai', options: [
          { id: 'chi', text: '@c3m1.opt.chi' }, { id: 'dua', text: '@c3m1.opt.dua', set: { handedPhoneToLuc: true } }] },
        { k: 'cutscene', id: 'c3m1-luc-hoi' },
        { k: 'evidence', id: 'ev-dong-ho-vang' }, { k: 'evidence', id: 'ev-luc-hoi' }, { k: 'journal', id: 'j-luc' },
        { k: 'if', c: flag('handedPhoneToLuc'), then: [{ k: 'toast', text: '@c3m1.toast.xoa' }, aside('c3m1-xoa', [think('c3m1.think.xoa')])] },
      ],
      exit: [{ k: 'space', leave: 'cong-an-phuong' }],
    },
    {
      id: 'ra-xe', minutes: 0.5, objective: '@c3m1.obj.raXe', marker: { at: 'cong-an-phuong.rack', label: '@c3m1.mk.xe', style: 'go' },
      checkpoint: { label: '@c3m1.cp.raXe', setup: [put('cong-an-phuong', undefined, 8), { k: 'vehicle', id: 'dream', model: 'dream', at: 'ch3.ca-dream', yaw: 0, state: 'park' }] },
      done: reach('cong-an-phuong.rack', 3),
      exit: [
        { k: 'cutscene', id: 'c3m1-van' }, { k: 'evidence', id: 'ev-danh-thiep-van' }, { k: 'journal', id: 'j-van' },
        // dramatic irony: the player sees Lực's call, Tín does not (no evidence, no journal)
        { k: 'cutscene', id: 'c3m1-luc-goi' },
      ],
    },
    {
      id: 've-nha', minutes: 0.4, objective: '@c3m1.obj.veNha', marker: { at: 'cafe-co-ba.dream', label: '@c3m1.mk.nha', style: 'go' },
      checkpoint: { label: '@c3m1.cp.duoi', setup: [
        put('ch3.ca-dream', 'dream', 3),
        { k: 'do', op: 'chase', args: { id: 'duoi-suv', controller: 'counterTail', ride: 'suv-den', start: 'ch3.suv-cho', fill: 0.25, decay: 0.12, escapeAfter: 15, catchAt: 1, giveUp: 'ch3.suv-bo', meter: 'eye:suv-den' } }] },
      meters: [{ id: 'eye:suv-den', label: '@c3m1.meter.eye', kind: 'bar', max: 1 }],
      done: { k: 'any', of: [{ k: 'hold', c: { k: 'mode', is: 'bike' }, seconds: 6 }, after(20)] },
      exit: [aside('c3m1-suv', [think('c3m1.think.suv')]), hint('c3m1.hint.duoi', 6000)],
      fail: [{ when: caught, reason: '@c3m1.fail.bat', allowSkipAfter: 3, skipTo: 'thoat-duoi' }],
    },
    {
      id: 'cat-duoi', minutes: 1.2, objective: '@c3m1.obj.cat',
      marker: [{ id: 'mk-cho', at: 'cho-an-hoa', label: '@c3m1.mk.cho', style: 'subtle' }, { id: 'mk-cong-vien', at: 'cong-vien-an-hoa', label: '@c3m1.mk.congVien', style: 'subtle' }],
      meters: [{ id: 'eye:suv-den', label: '@c3m1.meter.eye', kind: 'bar', max: 1 }],
      enter: [hint('c3m1.hint.cat', 8000)],
      watchers: [
        { when: after(25), do: [hint('c3m1.hint.cat2')] },
        { when: reach('cho-an-hoa', 14), do: [aside('c3m1-cho', [think('c3m1.think.cho')])] },
        { when: reach('cong-vien-an-hoa', 18), do: [aside('c3m1-cong-vien', [think('c3m1.think.congVien')])] },
      ],
      // mission scope: shaking it off already on the way out of the station counts; a skip after three catches lands on the ride home
      done: { k: 'on', ev: 'escaped', id: 'duoi-suv', scope: 'mission' },
      fail: [{ when: caught, reason: '@c3m1.fail.bat', allowSkipAfter: 3, skipTo: 'thoat-duoi' }],
    },
    {
      id: 'thoat-duoi', minutes: 0.6, objective: '@c3m1.obj.ve', marker: { at: 'cafe-co-ba.dream', label: '@c3m1.mk.nha', style: 'go' },
      enter: [{ k: 'stop', id: 'duoi-suv' }, { k: 'vehicle', id: 'suv-den', state: 'flee' }, aside('c3m1-thoat', [think('c3m1.think.thoat')])],
      done: reach('cafe-co-ba.dream', 4),
    },
    {
      id: 'danh-thiep', minutes: 0.5,
      enter: [
        talk('c3m1-the', [think('c3m1.think.the1'), think('c3m1.think.the2')]),
        { k: 'choice', id: 'nhanVan', prompt: '@c3m1.q.nhan', style: 'sms', timeout: 20, default: 'that', options: [{ id: 'that', text: '@c3m1.opt.that' }, { id: 'tin', text: '@c3m1.opt.tin' }] },
        { k: 'if', c: flag('choice:nhanVan', 'tin'), then: [{ k: 'sms', from: 'van', text: '@c3m1.sms.tin' }] },
        { k: 'sms', from: 'van', text: '@c3m1.sms.hen' }, { k: 'sms', from: 'van', text: '@c3m1.sms.xoa' },
        talk('c3m1-cuoi', [think('c3m1.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'reportedToLuc' }],
  medals: { par: 390, clues: ['tv', 'xe-den'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill'], flags: { sawDen: true, knowsBarge: true } },
});

// ---- c3-m2 · Kho trống ------------------------------------------------------------------------------------------

/** The four things the cleaners missed (subs) and the optional fifth: [sub id, place, evidence, examine id, Vân's line]. */
const CLUES: [string, string, string, string, Line[]][] = [
  ['long', 'ch3.k7-long', 'ev-vach-long', 'object:cage-scratches', [say('van', 'c3m2.van.long'), say('tin', 'c3m2.tin.long')]],
  ['tui', 'ch3.k7-day-chuyen', 'ev-tui-0417', 'object:torn-bag', [say('van', 'c3m2.van.tui')]],
  ['phuy', 'ch3.k7-thung-phuy', 'ev-hoa-don-anh-duong', 'document:burnt-receipt', [say('van', 'c3m2.van.phuy')]],
  ['cua-hau', 'kho-7.hatch', 'ev-vet-keo', 'object:drag-marks', [say('van', 'c3m2.van.vet')]],
];
const SUB_TEXT: Record<string, string> = { long: '@c3m2.sub.long', tui: '@c3m2.sub.tui', phuy: '@c3m2.sub.phuy', 'cua-hau': '@c3m2.sub.cuaHau' };
const c3m2 = defineMission({
  id: 'c3-m2', meta: { hours: [13, 18], giver: 'van' },
  start: { at: 'kho-7.gate', yaw: PI, hour: 15.5, weather: 'cloudy', lunar: 3, outfit: 'tin-shipper' },
  world: { traffic: 'light', crowd: 'thin', police: 'story', gangs: 'calm', clock: { hour: 15.5, freeze: true }, weather: { set: 'cloudy', lock: true }, exclusions: ['kho-7'], activities: NO_HUB },
  setup: [
    { k: 'space', variant: { id: 'kho-7', v: 'scrubbed' } },
    { k: 'prop', id: 'bang-cho-thue', kind: 'sign', variant: 'cho-thue', at: 'kho-7.gate' },
    { k: 'vehicle', id: 'dream', model: 'dream', at: 'kho-7.bike3', yaw: 0, state: 'park' },
    { k: 'vehicle', id: 'xe-van', model: 'vios-van', at: 'ch3.k7-xe-van', yaw: -H, state: 'park' },
    { k: 'spawn', id: 'van', cast: 'van', at: 'ch3.k7-van', team: 'ally', behaviour: { k: 'follow', target: 'player', dist: 2 } },
  ],
  steps: [
    {
      id: 'cong-kho', minutes: 0.6,
      enter: [
        { k: 'title', kind: 'time', text: '@c3m2.title', sub: '@c3m2.titleSub' },
        { k: 'cutscene', id: 'c3m2-cho-thue' },
        // the choice in Lực's office: a wiped phone comes back from the nightly backup (phone-detective-ui.md 3.9)
        talk('c3m2-anh', [
          say('van', 'c3m2.van.xoa1', { if: flag('handedPhoneToLuc') }), say('tin', 'c3m2.tin.xoa1', { if: flag('handedPhoneToLuc') }),
          say('van', 'c3m2.van.xoa2', { if: flag('handedPhoneToLuc') }), say('tin', 'c3m2.tin.xoa2', { if: flag('handedPhoneToLuc') }),
          say('van', 'c3m2.van.xoa3', { if: flag('handedPhoneToLuc') }),
          say('van', 'c3m2.van.anh1', { if: { k: 'not', c: flag('handedPhoneToLuc') } }), say('tin', 'c3m2.tin.anh1', { if: { k: 'not', c: flag('handedPhoneToLuc') } })]),
        { k: 'if', c: flag('handedPhoneToLuc'), then: [{ k: 'flag', name: 'photosRestored' }, { k: 'toast', text: '@c3m2.toast.khoiPhuc' }] },
      ],
    },
    {
      id: 'vao-kho', minutes: 0.4, objective: '@c3m2.obj.vao', marker: { at: 'kho-7', label: '@c3m2.mk.kho', style: 'go' },
      enter: [aside('c3m2-vao', [say('van', 'c3m2.van.vao')])],
      done: reach('kho-7.hall', 10),
      exit: [{ k: 'evidence', id: 'ev-kho-trong' }, { k: 'journal', id: 'j-kho-trong' }],
    },
    {
      id: 'quan-sat', minutes: 2, objective: '@c3m2.obj.quanSat',
      checkpoint: { label: '@c3m2.cp.kho', setup: [put('kho-7.hall', undefined, 14), keep('van', 'van', 'kho-7.hall', { k: 'follow', target: 'player', dist: 2 })] },
      subs: CLUES.map(([id, , ev]) => ({ id, text: SUB_TEXT[id], done: owned(ev) })),
      enter: [
        { k: 'unlock', ability: 'observe', label: '@c3m2.unlock.quanSat' }, hint('c3m2.hint.quanSat', 9000),
        aside('c3m2-tim', [say('van', 'c3m2.van.tim')]),
        ...CLUES.map(([id, at, evidence, examine]): Act => ({ k: 'clue', id, at, r: 4, evidence, examine })),
        { k: 'clue', id: 'tai-gau', at: 'ch3.k7-long-luoi', r: 3, evidence: 'ev-tai-gau', examine: 'object:bear-ear' },
      ],
      watchers: [
        ...CLUES.map(([id, , ev, , lines]) => ({ id: `thay-${id}`, when: owned(ev), do: [aside(`c3m2-${id}`, lines)] })),
        { id: 'gau', when: owned('ev-tai-gau'), do: [aside('c3m2-gau', [say('tin', 'c3m2.tin.gau')])] },
        { when: after(25), do: [hint('c3m2.hint.xoay')] },
        { when: after(50), do: [bark('van', 'c3m2.bark.lucGoi')] },
      ],
      optional: [{ id: 'tai-gau', text: '@c3m2.opt.taiGau', when: owned('ev-tai-gau') }],
    },
    {
      id: 'ai-bao', minutes: 0.7,
      enter: [talk('c3m2-hoi', [say('van', 'c3m2.van.hoi1'), say('van', 'c3m2.van.hoi2')]), { k: 'deduce', id: 'aiBao' }],
    },
    {
      id: 'lam-mat', minutes: 1.2,
      enter: [
        { k: 'cutscene', id: 'c3m2-muoi-hai-tieng' }, { k: 'cutscene', id: 'c3m2-lam-mat' },
        { k: 'choice', id: 'lamMat', prompt: '@c3m2.q.lamMat', timeout: 15, default: 'lam', options: [{ id: 'lam', text: '@c3m2.opt.lam' }, { id: 'so', text: '@c3m2.opt.so' }] },
        talk('c3m2-tra-loi', [
          say('tin', 'c3m2.tin.lam', { if: flag('choice:lamMat', 'lam') }), say('van', 'c3m2.van.lam', { if: flag('choice:lamMat', 'lam') }),
          say('tin', 'c3m2.tin.so', { if: flag('choice:lamMat', 'so') }), say('van', 'c3m2.van.so', { if: flag('choice:lamMat', 'so') }),
          say('van', 'c3m2.van.cuoi'), think('c3m2.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'vanAlly' }],
  medals: { par: 300, clues: ['tai-gau'] },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill'], flags: { reportedToLuc: true }, evidence: ['ev-luc-hoi', 'ev-danh-thiep-van'] },
});

// ---- c3-m3 · Ông thầy sửa xe ------------------------------------------------------------------------------------

const BIN = { team: 'hostile' as const, tags: ['training'], flashlight: true };
const binSees: Cond = { k: 'actor', id: 'bin', sees: true };
/** The course arena: one guard (Bin), takedowns on, nothing booked in LƯƠNG TÂM, a chokehold never kills. */
const COURSE: Act = { k: 'stealth', arena: 'hem-ong-tu', variant: 'night', rules: { takedowns: true, guns: 'none', lethal: 'fail', failOn: [], showCones: 'always', countConscience: false, respawn: 'checkpoint', wake: true } };
/** What Bin does around the corner (seeded per save) and the answer it makes right. */
const PEEK: [string, string][] = [['dienThoai', 'phone-bored'], ['khoanhTay', 'cross-arms'], ['ngoi', 'sit-stool-phone']];
const takedownBy = (cause: string): Cond => ({ k: 'on', ev: 'takedown', id: 'bin', where: { cause } });
/**
 * Ông Tư's grade for the course: one point per replayed beat (stats.retries: soft fails and checkpoint retries) and
 * one per mistake that is not a fail (mission var 'loi': a wrong answer at the corner, a chokehold squeezed into a
 * slip). 0 → A, 1 → B, 2–3 → C, more or a skipped section → D. Mirrored into the flag 'courseGrade' for later lines.
 */
function gradeActs(): Act[] {
  const set = (g: string): Act[] => [{ k: 'var', name: 'hang', value: g }, { k: 'flag', name: 'courseGrade', value: g }];
  const out: Act[] = [...set('D')];
  for (let r = 0; r <= 3; r++) for (let l = 0; l <= 3 - r; l++) {
    const s = r + l;
    out.push({ k: 'if', c: { k: 'all', of: [{ k: 'stat', name: 'retries', op: '==', value: r }, isVar('loi', l)] }, then: set(s === 0 ? 'A' : s === 1 ? 'B' : 'C') });
  }
  out.push({ k: 'if', c: { k: 'stat', name: 'skipped', op: '>=', value: 1 }, then: set('D') });
  return out;
}
const c3m3 = defineMission({
  id: 'c3-m3', meta: { hours: [19, 23], giver: 'tu' }, lethal: 'fail',
  start: { at: 'cafe-co-ba.dream', yaw: PI, vehicle: 'dream', hour: 20, weather: 'clear', lunar: 3, outfit: 'tin-shipper' },
  world: { traffic: 'night', crowd: 'night', police: 'story', gangs: 'calm', clock: { hour: 20, freeze: true }, weather: { set: 'clear', lock: true }, exclusions: ['xe-may-alley'], activities: NO_HUB },
  steps: [
    {
      id: 'dem-toi', minutes: 0.4,
      enter: [
        { k: 'title', kind: 'time', text: '@c3m3.title', sub: '@c3m3.titleSub' },
        { k: 'spawn', id: 'tu', cast: 'tu', at: 'xe-may-ong-tu', team: 'ally', behaviour: { k: 'act', name: 'fix-bike' } },
        { k: 'sms', from: 'tu', text: '@c3m3.sms.tu' }, aside('c3m3-di', [think('c3m3.think.di')]),
      ],
    },
    {
      id: 'toi-tiem', minutes: 0.6, objective: '@c3m3.obj.tiem', marker: { at: 'xe-may-ong-tu', label: '@c3m3.mk.tiem', style: 'go' },
      interact: [{ id: 'gap-tu', at: 'xe-may-ong-tu', r: 2.5, prompt: '@c3m3.int.gap', kind: 'talk', when: 'foot' }],
      done: used('gap-tu'),
      exit: [{ k: 'cutscene', id: 'c3m3-tiem-dem' }],
    },
    {
      id: 'phong-sau', minutes: 1.2, objective: '@c3m3.obj.phongSau', marker: { at: 'xe-may-shop/backRoom', label: '@c3m3.mk.phongSau', style: 'go' },
      enter: [
        { k: 'space', enter: 'xe-may-shop', link: 'front' },
        ...recast('tu', 'tu', 'xe-may-shop/bench', { k: 'goto', at: 'xe-may-shop/backRoom' }),
      ],
      done: reach('xe-may-shop/backRoom', 1.8),
      exit: [
        { k: 'cutscene', id: 'c3m3-tam-anh' },
        { k: 'choice', id: 'hoc', prompt: '@c3m3.q.hoc', options: [{ id: 'hoc', text: '@c3m3.opt.hoc' }, { id: 'cuu', text: '@c3m3.opt.cuu' }] },
        talk('c3m3-hoc', [
          say('tin', 'c3m3.tin.hoc', { if: flag('choice:hoc', 'hoc') }), say('tu', 'c3m3.tu.hoc', { if: flag('choice:hoc', 'hoc') }),
          say('tin', 'c3m3.tin.cuu', { if: flag('choice:hoc', 'cuu') }), say('tu', 'c3m3.tu.cuu', { if: flag('choice:hoc', 'cuu') })]),
        { k: 'evidence', id: 'ev-anh-2014' }, { k: 'evidence', id: 'ev-tu-ke' },
        { k: 'journal', id: 'j-hai' }, { k: 'journal', id: 'j-tu-trinh-sat' }, { k: 'flag', name: 'knowsTu2014' },
      ],
    },
    {
      // (a) noise: crouch over gravel and through the puddles to the bamboo, Bin listening on his stool
      id: 'tieng-dong', minutes: 0.9, objective: '@c3m3.obj.tiengDong', marker: { at: 'xe-may-alley.bamboo', label: '@c3m3.mk.tre', style: 'subtle' }, hud: { light: true, noise: true },
      checkpoint: { label: '@c3m3.cp.bai', setup: [
        { k: 'space', leave: 'xe-may-alley.start' }, COURSE,
        ...recast('tu', 'tu', 'xe-may-ong-tu.backDoor', { k: 'act', name: 'cross-arms' }),
        ...recast('bin', 'bin', 'ch3.bin-ghe', { k: 'act', name: 'sit-stool-phone' }, { ...BIN, yaw: -H })] },
      subs: [
        { id: 'cui', text: '@c3m3.sub.cui', done: { k: 'stance', is: 'crouch' } },
        { id: 'soi', text: '@c3m3.sub.soi', done: { k: 'hold', c: { k: 'all', of: [reach('xe-may-alley.gravel', 1.6), { k: 'stance', is: 'crouch' }] }, seconds: 0.5 } },
        { id: 'vung', text: '@c3m3.sub.vung', done: { k: 'hold', c: { k: 'all', of: [reach('xe-may-alley.puddle', 1.6), { k: 'stance', is: 'crouch' }] }, seconds: 0.5 } },
      ],
      enter: [talk('c3m3-bai', [say('tu', 'c3m3.tu.bai1'), say('bin', 'c3m3.bin.bai1'), say('tu', 'c3m3.tu.bai2')]), hint('c3m3.hint.tiengDong')],
      watchers: [{ when: reach('xe-may-alley.gravel', 2.2), do: [bark('tu', 'c3m3.bark.soi')] }],
      done: { k: 'all', of: [{ k: 'subs' }, reach('xe-may-alley.bamboo', 1.8)] },
      fail: [{ when: { k: 'actor', id: 'bin', state: 'suspicious' }, reason: '@c3m3.fail.nghe', soft: true }],
      retry: [bark('bin', 'c3m3.bark.nghe', true), { k: 'teleport', at: 'xe-may-alley.start' }, { k: 'behave', id: 'bin', b: { k: 'act', name: 'sit-stool-phone' } }, { k: 'player', stance: 'stand' }],
    },
    {
      // (b) shadow: Bin stands and sweeps his flashlight; stay in the dark nook while it passes
      id: 'bong-toi', minutes: 0.6, objective: '@c3m3.obj.bongToi', marker: { at: 'ch3.bong-toi', label: '@c3m3.mk.toi', style: 'subtle' }, hud: { light: true, noise: true },
      subs: [{ id: 'toi', text: '@c3m3.sub.toi', done: { k: 'hold', c: { k: 'all', of: [reach('ch3.bong-toi', 2), { k: 'player', prop: 'visibility', op: '<', value: 0.35 }] }, seconds: 4 } }],
      enter: [talk('c3m3-toi', [say('tu', 'c3m3.tu.toi1'), say('tu', 'c3m3.tu.toi2')]), { k: 'behave', id: 'bin', b: { k: 'guard', post: 'ch3.bin-ghe', sweep: 50 } }],
      fail: [{ when: binSees, reason: '@c3m3.fail.thay', soft: true }],
      retry: [bark('bin', 'c3m3.bark.thay', true), { k: 'teleport', at: 'xe-may-alley.bamboo' }],
    },
    {
      // (c) peek: Bin waits round the corner on the sidewalk; press to the corner, lean, and say what he is doing
      id: 'nhin-goc', minutes: 0.7, objective: '@c3m3.obj.goc', marker: { at: 'ch3.goc-tiem', label: '@c3m3.mk.goc', style: 'subtle' }, hud: { light: true, noise: true },
      subs: [{ id: 'goc', text: '@c3m3.sub.goc', done: { k: 'hold', c: { k: 'all', of: [reach('ch3.goc-tiem', 1.2), { k: 'stance', is: 'cover' }] }, seconds: 1.5 } }],
      enter: [
        { k: 'oneOf', acts: PEEK.map(([v]) => [{ k: 'var', name: 'binDo', value: v }]) },
        { k: 'behave', id: 'bin', b: { k: 'goto', at: 'ch3.bin-goc' } },
        { k: 'unlock', ability: 'lean', label: '@c3m3.unlock.nghieng' },
        talk('c3m3-goc', [say('tu', 'c3m3.tu.goc1'), say('tu', 'c3m3.tu.goc2')]), hint('c3m3.hint.goc'),
      ],
      watchers: [{ when: { k: 'actor', id: 'bin', at: 'ch3.bin-goc', r: 1.5 }, do: PEEK.map(([v, act]): Act => ({ k: 'if', c: isVar('binDo', v), then: [{ k: 'behave', id: 'bin', b: { k: 'act', name: act } }] })) }],
      fail: [{ when: binSees, reason: '@c3m3.fail.lo', soft: true }],
      retry: [{ k: 'teleport', at: 'xe-may-alley.start' }],
      exit: [
        { k: 'choice', id: 'binLamGi', prompt: '@c3m3.q.binLamGi', options: PEEK.map(([v]) => ({
          id: v, text: `@c3m3.opt.${v}`, then: [{ k: 'if', c: isVar('binDo', v), then: [{ k: 'var', name: 'peekOk', value: true }], else: [{ k: 'var', name: 'loi', inc: 1 }] }] as Act[] })) },
        talk('c3m3-goc-ket', [say('tu', 'c3m3.tu.dung', { if: isVar('peekOk', true) }), say('tu', 'c3m3.tu.sai', { if: { k: 'not', c: isVar('peekOk', true) } })]),
      ],
    },
    {
      // (d) distract: a bolt thrown behind Bin pulls him off his post
      id: 'nem', minutes: 0.6, objective: '@c3m3.obj.nem', hud: { light: true, noise: true },
      checkpoint: { label: '@c3m3.cp.nem', setup: [
        put('xe-may-alley.start', undefined, 14), COURSE,
        keep('tu', 'tu', 'xe-may-ong-tu.backDoor', { k: 'act', name: 'cross-arms' }),
        keep('bin', 'bin', 'xe-may-alley.drop', { k: 'guard', post: 'xe-may-alley.drop', sweep: 30 }, { ...BIN, yaw: H }),
        { k: 'give', item: 'bolt', n: 5 }] },
      enter: [
        { k: 'unlock', ability: 'throw', label: '@c3m3.unlock.nem' }, { k: 'toast', text: '@c3m3.toast.buLong' },
        talk('c3m3-nem', [say('tu', 'c3m3.tu.nem1'), say('tu', 'c3m3.tu.nem2')]), hint('c3m3.hint.nem'),
      ],
      done: { k: 'any', of: [{ k: 'actor', id: 'bin', state: 'suspicious' }, { k: 'actor', id: 'bin', state: 'search' }] },
      fail: [{ when: binSees, reason: '@c3m3.fail.thay', soft: true }],
      retry: [bark('bin', 'c3m3.bark.thay', true), { k: 'teleport', at: 'xe-may-alley.start' }, { k: 'behave', id: 'bin', b: { k: 'guard', post: 'xe-may-alley.drop', sweep: 30 } }],
    },
    {
      // (e) the takedown from behind while he looks for the bolt: tap E Hạ nhanh, hold E Khóa cổ
      id: 'ha-guc', minutes: 0.8, objective: '@c3m3.obj.ha', hud: { light: true, noise: true },
      enter: [{ k: 'unlock', ability: 'takedown', label: '@c3m3.unlock.ha' }, aside('c3m3-ha', [say('tu', 'c3m3.tu.ha1', { voice: 'whisper' })]), hint('c3m3.hint.ha', 8000)],
      watchers: [
        { when: after(8), do: [hint('c3m3.hint.khoa', 8000)] },
        { id: 'slip', when: takedownBy('slip'), do: [{ k: 'var', name: 'loi', inc: 1 }, aside('c3m3-slip', [say('tu', 'c3m3.tu.slip', { voice: 'shout' })])] },
        { id: 'fast', when: takedownBy('fast'), do: [aside('c3m3-fast', [say('tu', 'c3m3.tu.fast')])] },
        { id: 'choke', when: takedownBy('choke'), do: [aside('c3m3-choke', [say('tu', 'c3m3.tu.choke')])] },
      ],
      done: { k: 'on', ev: 'takedown', id: 'bin' },
      fail: [{ when: binSees, reason: '@c3m3.fail.thay', soft: true }],
      retry: [{ k: 'teleport', at: 'xe-may-alley.start' }, ...recast('bin', 'bin', 'xe-may-alley.drop', { k: 'guard', post: 'xe-may-alley.drop', sweep: 30 }, { ...BIN, yaw: H })],
    },
    {
      // (f) the drag into the bamboo, then a dip to the start of the foot tail
      id: 'keo', minutes: 0.5, objective: '@c3m3.obj.keo', marker: { at: 'xe-may-alley.bamboo', label: '@c3m3.mk.tre', style: 'go' },
      enter: [{ k: 'unlock', ability: 'drag', label: '@c3m3.unlock.keo' }, hint('c3m3.hint.keo')],
      done: { k: 'actor', id: 'bin', at: 'xe-may-alley.bamboo', r: 2.2 },
      exit: [talk('c3m3-keo', [say('bin', 'c3m3.bin.ha'), say('tu', 'c3m3.tu.keo')]), { k: 'fade', to: 'black', ms: 600 }],
    },
    {
      id: 'bam-bin', minutes: 2, objective: '@c3m3.obj.bam',
      checkpoint: { label: '@c3m3.cp.cho', setup: [
        { k: 'stealth', arena: null }, { k: 'teleport', at: 'xe-may-alley.start' },
        ...recast('tu', 'tu', 'xe-may-ong-tu.backDoor', { k: 'act', name: 'cross-arms' }),
        ...recast('bin', 'bin', 'xe-may-alley.eastMouth', { k: 'idle' }, { team: 'neutral', tags: ['training'] })] },
      meters: [{ id: 'tail:bin', label: '@c3m3.meter.tail', kind: 'band' }],
      interact: [
        { id: 'xem-hang', at: 'cho-an-hoa.stall', r: 1.6, prompt: '@c3m3.int.xem', kind: 'use', when: 'foot', once: false },
        { id: 'ngoi-ghe', at: 'cho-an-hoa.stool', r: 1.4, prompt: '@c3m3.int.ngoi', kind: 'seat', when: 'foot', once: false },
      ],
      enter: [
        { k: 'fade', to: 'clear', ms: 600 },
        talk('c3m3-bam', [say('tu', 'c3m3.tu.bam1'), say('tu', 'c3m3.tu.bam2'), say('bin', 'c3m3.bin.bam')]),
        { k: 'behave', id: 'tu', b: { k: 'goto', at: 'xe-may-ong-tu' } },
        { k: 'behave', id: 'bin', b: { k: 'patrol', route: 'r-bin' } },
        { k: 'tail', target: 'bin', band: [5, 25], lose: { far: 35, seconds: 8 }, onFoot: true, knownFace: true },
        hint('c3m3.hint.bam', 8000),
      ],
      watchers: [
        { when: after(10), do: [hint('c3m3.hint.lan', 8000)] },
        { when: reach('cho-an-hoa', 20), do: [aside('c3m3-cho', [think('c3m3.think.cho')])] },
      ],
      done: { k: 'on', ev: 'arrived', id: 'bin' },
      fail: [
        { when: { k: 'on', ev: 'spotted', id: 'bin' }, reason: '@c3m3.fail.bamThay', allowSkipAfter: 3 },
        { when: { k: 'on', ev: 'lost', id: 'bin' }, reason: '@c3m3.fail.mat', allowSkipAfter: 3 },
      ],
    },
    {
      id: 'luat', minutes: 1.2,
      checkpoint: { label: '@c3m3.cp.luat', setup: [
        put('cho-an-hoa.stool', undefined, 12), { k: 'stop', id: 'bin' },
        ...recast('tu', 'tu', 'cho-an-hoa.stall', { k: 'act', name: 'cross-arms' }),
        ...recast('bin', 'bin', 'cho-an-hoa.stool', { k: 'act', name: 'sit-stool-phone' }, { team: 'neutral', tags: ['training'] })] },
      enter: [
        ...gradeActs(),
        { k: 'cutscene', id: 'c3m3-luat' },
        { k: 'toast', text: '@c3m3.toast.hang' },
        { k: 'give', item: 'burner' }, { k: 'give', item: 'clipCam' }, { k: 'toast', text: '@c3m3.toast.do' },
        { k: 'unlock', ability: 'phoneSilent', label: '@c3m3.unlock.imLang' },
        { k: 'unlock', ability: 'luongTam', label: '@c3m3.unlock.luongTam' }, hint('c3m3.hint.luongTam', 9000),
        { k: 'journal', id: 'j-luat' },
        aside('c3m3-cuoi', [think('c3m3.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'flag', name: 'trainedByTu' }],
  medals: { par: 540, ghost: true },
  replay: { abilities: ['phone', 'appOrders', 'crouch', 'phoneCamera', 'headlight', 'soNo', 'floatStill', 'observe'], flags: { reportedToLuc: true, vanAlly: true } },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string = id, role = false): CastDef =>
  ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look, ...(role ? { role: `@cast.${id}.role` } : {}) });
/**
 * Bin is Ông Tư's nephew, 19, a fit martial-arts student who has trained since he was small (cast.bin.role says so on
 * screen, and Ông Tư in c3-m3): the director's look 'bin' is a young adult, never a child model. The course's
 * chokehold is taught on a sparring partner who knows the drill, not on a kid.
 */
export const CAST: CastDef[] = [
  person('van', '#8fb3d9', 'V', 'van', true), person('luc', '#c9a35a', 'L', 'luc', true), person('bin', '#9ad0b0', 'B', 'bin', true),
  person('truc-ban', '#9aa58f', 'T', 'ward-cop'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[], big?: string): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: big ? { icon, big } : { icon }, chapter: 3, tags });
export const EVIDENCE: EvidenceDef[] = [
  ev('ev-danh-thiep-van', 'document', 'danhThiep', 'card', ['van', 'police']),
  ev('ev-luc-hoi', 'testimony', 'lucHoi', 'quote', ['luc', 'police']),
  ev('ev-dong-ho-vang', 'object', 'dongHo', 'watch', ['luc', 'money']),
  ev('ev-xe-den', 'photo', 'xeDen', 'car', ['luc', 'tail'], '51K-660.13'),
  ev('ev-tv-mai-am', 'object', 'tv', 'lotus', ['phuong', 'charity']),
  ev('ev-kho-trong', 'place', 'khoTrong', 'warehouse', ['kho-7', 'police']),
  ev('ev-vach-long', 'object', 'vachLong', 'cage', ['kho-7', 'victims', 'hoa']),
  ev('ev-tui-0417', 'object', 'tui0417', 'bag', ['kho-7', 'app', 'don04']),
  ev('ev-hoa-don-anh-duong', 'document', 'hoaDon', 'receipt', ['kho-7', 'anh-duong']),
  ev('ev-vet-keo', 'object', 'vetKeo', 'tracks', ['kho-7', 'barge']),
  ev('ev-tai-gau', 'object', 'taiGau', 'bear', ['kho-7', 'victims', 'beti']),
  ev('ev-anh-2014', 'photo', 'anh2014', 'photo', ['tu', 'hai', '2014']),
  ev('ev-tu-ke', 'testimony', 'tuKe', 'quote', ['tu', 'luc', '2014']),
];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [
  note('j-luc', 'people', 'luc'), note('j-van', 'people', 'van'), note('j-kho-trong', 'places', 'khoTrong'), note('j-ai-bao', 'notes', 'aiBao'),
  note('j-hai', 'people', 'hai'), note('j-tu-trinh-sat', 'people', 'tuTrinhSat'), note('j-luat', 'notes', 'luat'),
];
export const QUESTIONS: QuestionDef[] = [{
  id: 'aiBao', prompt: '@c3m2.q.aiBao', answer: 'cong-an', cost: 1, hint: '@c3m2.q.hint',
  options: [
    { id: 'quang', text: '@c3m2.q.quang', needs: ['ev-goi-nho'] },
    { id: 'cong-an', text: '@c3m2.q.congAn', needs: ['ev-luc-hoi', 'ev-kho-trong'] },
    { id: 'ba-che', text: '@c3m2.q.baChe' },
  ],
  onCorrect: [{ k: 'flag', name: 'suspectsPolice' }, { k: 'journal', id: 'j-ai-bao' }],
}];
/**
 * Off-map anchors this chapter places things at (merged with the other chapters' anchors of the same space): a
 * contract for the level kit, which builds each one.
 */
export const ANCHORS: Record<string, Record<string, string>> = {
  'cong-an-office': {
    front: 'street door of CÔNG AN PHƯỜNG (entry link "front")', desk: 'front desk with the duty officer behind a glass partition',
    bench: 'waiting bench along the wall (seat)', tv: 'old TV on a wall bracket over the bench, news channel (clue: the charity report)',
    corridor: 'corridor behind the desk to the offices', office: "doorway of the deputy chief's office",
    luc: "Lực's desk: lacquered tea set, framed 'Chiến sĩ thi đua' certificate, his chair", guest: 'guest chair across the desk',
    blinds: 'window with venetian blinds over the street (the motorbike rack and the far curb below)', cell: 'holding cell at the end of the corridor (epilogue)',
  },
  'xe-may-shop': {
    front: 'street door of SỬA XE TƯ (entry link "front")', bench: 'workbench in the shop, parts drawers, the old Cub on its stand',
    backRoom: 'back room behind the shop: a desk under one bulb, the drawer with the 2014 photo', back: 'back door onto the alley course (exit link)',
  },
};
/**
 * The chapter's own named points, validated by scripts/story-ch03.test.mjs against today's map and the Quận 4 build:
 * road ones on the asphalt in the lane of their heading, ground ones on land, off the asphalt and clear, and the
 * KHO 7 interior ones inside the hollow shell (hall + cutscenes/ch02.ts KHO7_MARKS where the cutscene placed them).
 */
export const PLACES: Record<string, PlaceDef> = {
  'ch3.ca-dream': { x: -117.6, z: -35, yaw: 0, r: 1 },
  'ch3.suv-cho': { x: -103.4, z: -22, yaw: PI, r: 1.3 },
  'ch3.suv-bo': { x: -103.4, z: -100, yaw: PI, r: 1.3 },
  'ch3.k7-xe-van': { x: 588, z: -67.3, yaw: -H, r: 1.2 },
  'ch3.k7-van': { x: 586, z: -70.4, r: 0.45 },
  'ch3.k7-long': { x: 590, z: -120, r: 0.45 },
  'ch3.k7-long-luoi': { x: 586.5, z: -119, r: 0.45 },
  'ch3.k7-day-chuyen': { x: 572, z: -104, r: 0.45 },
  'ch3.k7-thung-phuy': { x: 589, z: -101, r: 0.45 },
  'ch3.bin-ghe': { x: -95, z: -81.5, yaw: -H, r: 0.45 },
  'ch3.bong-toi': { x: -78, z: -84.2, r: 0.45 },
  'ch3.goc-tiem': { x: -63.2, z: -78.3, r: 0.45 },
  'ch3.bin-goc': { x: -62.2, z: -73.5, yaw: PI, r: 0.45 },
};
/** Case-board cards this chapter adds to BẢNG MANH MỐI (free lotus slots after chapters 1–2) and their strings. */
export const BOARD_CARDS: BoardCard[] = [
  { id: 'ev-tui-0417', slot: 9 }, { id: 'ev-hoa-don-anh-duong', slot: 13 }, { id: 'ev-luc-hoi', slot: 14 }, { id: 'ev-kho-trong', slot: 15 },
  { id: 'ev-vach-long', slot: 16 }, { id: 'ev-tu-ke', slot: 17 }, { id: 'ev-dong-ho-vang', slot: 18 },
];
export const BOARD_LINKS: [string, string][] = [
  ['ev-kho-7', 'ev-kho-trong'], ['ev-kho-trong', 'ev-luc-hoi'], ['ev-luc-hoi', 'ev-xe-tuan-tra'], ['ev-luc-hoi', 'ev-dong-ho-vang'], ['ev-luc-hoi', 'ev-tu-ke'],
  ['ev-tui-cam', 'ev-tui-0417'], ['ev-tui-0417', 'ev-don-dem-quang'], ['ev-vach-long', 'ev-giay-hoa'], ['ev-vach-long', 'ev-hoa-don-anh-duong'],
];

export const chapter = defineChapter({
  chapter: 3,
  missions: [c3m1, c3m2, c3m3],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST, questions: QUESTIONS, places: PLACES,
  text: TEXT,
});
