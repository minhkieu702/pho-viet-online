/**
 * The stealth vocabulary shared by stealth-perception.ts (sight, light, hearing) and guard-brain.ts (awareness, modes,
 * alarms, radio, bodies): the tuning tables of story-system-stealth.md §3-5 and §13, the noise table, the difficulty
 * presets, the default Southern (Sài Gòn) barks and a seeded rng. Pure: no imports, no three.js, no DOM.
 *
 * Conventions follow map/collision.ts: ground plane x/z, height y, yaw 0 faces +z (forward = (sin yaw, cos yaw)).
 * Times are seconds on the caller's clock; nothing here reads Date or Math.random.
 *
 * Binding deviation from the delivered design (story-plan.md Gaps, "STEALTH vs CAMPAIGN RULE"): over-squeezing a
 * chokehold never kills. A slip makes noise and leaves a light knockout that wakes early; only guns, blasts,
 * vehicles, falls and drowning kill, and only those reach the LƯƠNG TÂM kill count.
 */

export type Difficulty = 'de' | 'thuong' | 'kho';
export type Stance = 'stand' | 'crouch';
export type Surface = 'concrete' | 'tile' | 'grass' | 'gravel' | 'puddle' | 'tin' | 'metal' | 'wood' | 'carpet' | 'water';
/**
 * Concealment beyond geometry and light: open; inside a lidded hide spot (dumpster, locker, container, freezer,
 * wardrobe, a vehicle boot); inside a soft one (bamboo, under a pier, tarp: seen only from very close); crouched by a
 * dark parked car; swimming; floating still ('Nổi im'); diving.
 */
export type Concealment = 'open' | 'spot' | 'soft' | 'car' | 'swim' | 'float' | 'dive';
export type ZoneKind = 'public' | 'staff' | 'restricted' | 'hostile';
export type CoverKind = 'shipper' | 'waiter' | 'porter' | 'visitor';
export type GuardKind = 'thug' | 'gunman' | 'bouncer' | 'worker' | 'crew' | 'orderly' | 'cop' | 'boss';
export type GuardAct = 'smoke' | 'phone' | 'stool' | 'doze' | 'cards' | 'river' | 'yawn' | 'chat' | 'count-cash';
export type Weapon = 'none' | 'pipe' | 'pistol' | 'shotgun';
/**
 * Brain modes. Unaware: patrol, post (an idle act is the `act` field, not a mode), scripted. Aware, rising:
 * suspicious, investigate / question, search / hold (an exit at alarm 2), alert (the shout) / radio / raise (the kẻng),
 * combat; flee and surrender are the unarmed answers. Bodies: grabbed (in a takedown), down, tied, dead.
 */
export type GuardMode =
  | 'patrol' | 'post' | 'scripted' | 'suspicious' | 'investigate' | 'question' | 'search' | 'hold'
  | 'alert' | 'radio' | 'raise' | 'combat' | 'flee' | 'surrender' | 'grabbed' | 'down' | 'tied' | 'dead';
export type Detection = 'hidden' | 'suspected' | 'searching' | 'detected' | 'combat';
export type AlarmLevel = 0 | 1 | 2 | 3;
/** Causes of damage. The first four are non-lethal: a guard at 0 health is knocked out, never killed. */
export type DamageCause = 'fist' | 'takedown' | 'throw' | 'choke' | 'bullet' | 'blast' | 'vehicle' | 'fall' | 'drown';
export const LETHAL: Readonly<Record<DamageCause, boolean>> = {
  fist: false, takedown: false, throw: false, choke: false, bullet: true, blast: true, vehicle: true, fall: true, drown: true,
};

export const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------
// Tuning (§3-5). Thường difficulty; DIFFICULTY scales detection, noise, search time and reinforcements.
// ---------------------------------------------------------------------------------------------------------

export const TUNE = {
  // Sight (§3.1).
  eye: 1.62,
  sampleStand: [1.65, 1.2, 0.45] as readonly number[],
  sampleCrouch: [1.05, 0.75, 0.35] as readonly number[],
  sampleWeight: [0.4, 0.4, 0.2] as readonly number[],
  focal: 32 * DEG, peripheral: 70 * DEG, peripheralGain: 0.35,
  rangeDay: 26, rangeNight: 12,
  beamHalf: 16 * DEG, beamRange: 20, beamLight: 0.8,
  roofDy: 2.5, roofGain: 0.35, lookUp: 0.3,
  base: 60, nearLight: 0.6, nearLightD: 3, closeD: 4, closeGain: 1.6, distPow: 1.3,
  crouch: 0.55, still: 0.6, sneak: 0.8, walk: 1, run: 1.5, climb: 1.4, runSpeed: 5.5, stillSpeed: 0.3,
  crowdR: 2.5, crowdTwo: 0.55, crowdFour: 0.35, crowdMaxSpeed: 2, crowdRayR: 0.45, crowdRayGain: 0.6, crowdHeight: 1.7, crowdNear: 30,
  swim: 0.6, float: 0.3, diveNear: 2, softNear: 1.5, softGain: 0.3, car: 0.25, jacket: 0.9, softOccluder: 0.35, lean: 0.35,
  bodyRange: 0.7, bodyHeight: 0.3, bodyLightEvery: 0.5,
  // Awareness (§3.1, §4).
  stateUnaware: 1, stateSuspicious: 1.6, stateSearch: 2.2,
  grace: 2, decayUnaware: 10, decaySuspicious: 6, decaySearch: 3, cautiousDecay: 0.5, cautiousVision: 1.2, seatedVision: 0.7,
  suspicious: 25, investigate: 60, alert: 100, calm: 10, calmFor: 3, suspiciousGiveUp: 8, persistent: 1.5,
  instantD: 1.8, instantF: 0.5, bumpR: 1.2, bump: 40,
  reactMin: 0.35, reactMax: 0.6, standUp: 0.6,
  perceiveEvery: 0.1, perceiveNear: 0.05, perceiveNearD: 6,
  // Hearing reactions (§3.4).
  stepMin: 15, stepMax: 40, distractionCap: 59, lure: 20, prankWindow: 60, dogWindow: 30,
  // Movement (m/s) and timings (§4).
  pacePatrol: 1.3, paceInvestigate: 1.6, paceSearch: 2.2, paceRun: 4.6, paceCautious: 1.15, turnRate: 6,
  lookAround: 3, hideCheckP: 0.25, hideCheckCautiousP: 0.5, hideCheckNear: 6, lid: 1.2,
  searchTime: 35, searchCautious: 1.5, searchPoints: 6, searchNavR: 12, searchHideR: 10, searchHideP: 0.5, searchSeenP: 0.8,
  searchMaxHides: 2, searchLook: 1.5, buddyR: 12,
  alertShout: 0.6, radioCall: 2.5, radioLos: 0.5, raiseR: 25, raiseStrike: 2, lostSight: 8,
  gunMin: 7, gunMax: 12, gunHit: 0.3, gunDamage: 11, gunCooldown: 1.2, meleeReach: 1.4, meleeDamage: 7, meleeCooldown: 1.1,
  tackleR: 3.4, tackleSpeed: 5, tackleCooldown: 3, bossDamage: 18, bossHealth: 400,
  questionR: 2.2, questionTime: 5, questionLeave: 12, bluffCost: 30, loiter: 20, loiterR: 6, coverDrain: 8,
  surrenderR: 8, surrenderLeave: 10, surrenderDrop: 1,
  wakeTime: 4, healthDefault: 100,
  // Alarm (§4 arena levels) and radio net.
  alarm3Decay: 20, alarm2Decay: 90, alarm1Decay: 180, converge: 3, reinforceDelay: 30,
  radioEvery: 75, radioGrace: 12, radioGap: 4, radioReply: 1.5, radioBluff: 4,
  // CCTV, searchlight, dogs, fuses (§7, §4 watchdog).
  cameraFov: 50 * DEG, cameraRange: 16, cameraGain: 0.6, cameraDecay: 10, searchlightGain: 1.5,
  dogStand: 6, dogCrouch: 4, dogAny: 3, dogEvery: 1.2, dogFood: 20, fixTime: 45, lightsOutR: 25,
  // Takedowns and the chokehold (§5).
  takedownMin: 0.5, takedownMax: 1.7, takedownDy: 0.5, rearArc: 115 * DEG, distractedArc: 70 * DEG,
  chokeUp: 0.55, chokeDown: 0.7, chokeImpulse: [0.6, 1.1] as readonly number[], chokePush: -0.18, chokeFlail: 0.12,
  chokeCount: 0.75, chokeCounts: 5, chokeOver: 1.6, chokeOverForgive: 0.5, chokeUnder: 0.25, chokeUnderFor: 0.8, chokeNoiseEvery: 0.5,
  chokeEscapeDamage: 8,
  wakeFast: 120, wakeChoke: 180, wakeSlip: 30, wakeBeaten: 90,
} as const;

/** Difficulty presets (§13). band is the chokehold green band. */
export const DIFFICULTY: Readonly<Record<Difficulty, {
  detection: number; noise: number; band: readonly [number, number]; reinforce: number; search: number; hideCheck: number; radioGrace: number;
}>> = {
  de: { detection: 0.65, noise: 0.8, band: [0.35, 0.85], reinforce: 1.5, search: 0.7, hideCheck: 0, radioGrace: 12 },
  thuong: { detection: 1, noise: 1, band: [0.45, 0.75], reinforce: 1, search: 1, hideCheck: 0, radioGrace: 12 },
  kho: { detection: 1.35, noise: 1.15, band: [0.45, 0.75], reinforce: 1, search: 1, hideCheck: 0.15, radioGrace: 8 },
};

// ---------------------------------------------------------------------------------------------------------
// Noise (§3.4): radii in metres on Thường, surface multipliers, and what each kind means to a guard.
// ---------------------------------------------------------------------------------------------------------

export const NOISE = {
  crouch: 1.5, walk: 5, run: 11, land: 7, climb: 4,
  takedown: 6, struggle: 1.5, chokeEscape: 20, slip: 8, bodyDrop: 4, bodyLower: 1.5, drag: 2,
  punch: 8, gunshot: 60, bolt: 10, boltMetal: 14, bottle: 15, whistle: 14,
  door: 4, skylight: 22, shout: 25, carAlarm: 25, phone: 14, dreamIdle: 10, dream: 4, dog: 22, arena: 1e4,
} as const;

/** Walking speeds of the player kit (game.ts walk(): 4.2 walk, 6.8 with Shift; crouch-walk 1.9). */
export const SPEED = { crouch: 1.9, walk: 4.2, run: 6.8 } as const;

export const SURFACE_NOISE: Readonly<Record<Surface, number>> = {
  concrete: 1, tile: 1, grass: 0.8, gravel: 1.6, puddle: 1.8, tin: 2, metal: 1.5, wood: 1.2, carpet: 0.6, water: 1.3,
};

export const NOISE_KINDS = [
  'step', 'land', 'climb', 'drag', 'bodyDrop', 'takedown', 'struggle', 'slip', 'punch', 'fight', 'bolt', 'bottle', 'food',
  'phone', 'door', 'whistle', 'dog', 'skylight', 'carAlarm', 'shout', 'scream', 'gunshot', 'alarm', 'ambient',
] as const;
export type NoiseKind = (typeof NOISE_KINDS)[number];
export const NOISE_ID = Object.fromEntries(NOISE_KINDS.map((k, i) => [k, i])) as Readonly<Record<NoiseKind, number>>;

/**
 * Reaction classes. step: footsteps add awareness by proximity and turn the head. minor: suspicious, investigate the
 * spot (a takedown heard but not seen, a door). distraction: suspicious and investigate the impact point, never past
 * investigate, counted by the anti-exploit rule. lure: investigate the source (the whistle). thud: search at the
 * source. loud: combat-ready search; a gunshot raises alarm 2. alarm: the kẻng/còi. ignore: ambience.
 */
export const HEARD = { step: 0, minor: 1, distraction: 2, lure: 3, thud: 4, loud: 5, alarm: 6, dog: 7, ignore: 8 } as const;
export const NOISE_CLASS: readonly number[] = NOISE_KINDS.map((k) => ({
  step: HEARD.step, land: HEARD.step, climb: HEARD.step, drag: HEARD.step,
  bodyDrop: HEARD.thud, takedown: HEARD.minor, struggle: HEARD.minor, slip: HEARD.thud, punch: HEARD.thud, fight: HEARD.thud,
  bolt: HEARD.distraction, bottle: HEARD.distraction, food: HEARD.distraction, phone: HEARD.distraction, carAlarm: HEARD.distraction,
  door: HEARD.minor, whistle: HEARD.lure, dog: HEARD.dog, skylight: HEARD.thud,
  shout: HEARD.loud, scream: HEARD.loud, gunshot: HEARD.loud, alarm: HEARD.alarm, ambient: HEARD.ignore,
} as Record<NoiseKind, number>)[k]);

/** HUD labels. */
export const LIGHT_LABEL = ['Trong bóng tối', 'Mờ tối', 'Bị lộ'] as const;
export const ALARM_LABEL = ['Yên ắng', 'Cảnh giác', 'BÁO ĐỘNG', 'TRUY SÁT'] as const;
export const DETECTION_LABEL: Readonly<Record<Detection, string>> = {
  hidden: 'Không ai thấy', suspected: 'Bị nghi ngờ', searching: 'Đang bị lùng sục', detected: 'BỊ PHÁT HIỆN', combat: 'Đang giao chiến',
};
export const ZONE_LABEL: Readonly<Record<ZoneKind, string>> = {
  public: 'Khu công cộng', staff: 'Khu nhân viên', restricted: 'Khu cấm', hostile: 'Địa bàn địch',
};
/** Social cover (§3.5): zone and act factors on the seen gain. Running, crouching or climbing in uniform draws eyes. */
export const COVER_ZONE: Readonly<Record<ZoneKind, number>> = { public: 0.15, staff: 0.4, restricted: 0.8, hostile: 1 };
export const COVER_ACT = { still: 1, walk: 1, run: 3, crouch: 5, climb: 8, nearBody: 10, max: 4 } as const;
export const COVER_LABEL: Readonly<Record<CoverKind, string>> = {
  shipper: 'VỎ BỌC SHIPPER', waiter: 'VỎ BỌC PHỤC VỤ', porter: 'VỎ BỌC KHUÂN VÁC', visitor: 'VỎ BỌC KHÁCH',
};

// ---------------------------------------------------------------------------------------------------------
// Barks: default pools; stealth-lines.ts may replace them. {tên} is the guard (or the downed guard) named.
// ---------------------------------------------------------------------------------------------------------

export const BARKS = {
  suspicious: ['Hửm?', 'Ai đó?', 'Tiếng gì vậy ta?', 'Ủa, cái gì vậy?'],
  investigate: ['Để tao ra coi thử.', 'Chỗ đó có gì vậy ta…', 'Ra đó coi sao.'],
  buddy: ['Ê, ra coi với tao.', 'Nghe gì không? Đi với tao coi.'],
  calm: ['Chắc con mèo.', 'Hoa mắt rồi.', 'Thôi, chắc gió.', 'Không có gì hết.'],
  search: ['Lục soát hết chỗ này cho tao!', 'Nó còn quanh đây thôi.', 'Soi kỹ mấy góc tối coi.'],
  searchEnd: ['Mất dấu rồi. Về chỗ, mở mắt ra.', 'Thôi, về chỗ đi. Để ý đó.'],
  alert: ['Có người! Đằng kia!', 'Đứng lại!', 'Ê! Ai đó, đứng lại!'],
  alertShipper: ['Thằng shipper kìa!', 'Shipper gì mà mò vô đây!'],
  radioAlert: ['A lô, a lô… có người lạ trong khu!', 'A lô! Có đứa lọt vô rồi!'],
  raise: ['Đánh kẻng! Đánh kẻng lên!', 'Gõ kẻng lên anh em ơi!'],
  lost: ['Nó chạy đâu rồi?', 'Mất tiêu rồi, kiếm đi!'],
  body: ['Ê! Thằng {tên} nằm đây nè!', 'Có đứa bị hạ! Có người lọt vô!'],
  wake: ['Dậy! Dậy coi!', 'Ê, tỉnh lại coi!'],
  woken: ['Ư… đứa nào… đánh lén tao…', 'Trời ơi… cái đầu…'],
  hideCheck: ['Để coi trong này có gì…', 'Coi thử trong này…'],
  hideCaught: ['A, chui vô đây hả!', 'Ra đây mày!'],
  hideSeen: ['Nó chui vô thùng rồi!'],
  choke: ['Ặc… buông…', 'Ư… ư…'],
  witness: ['Nó đánh thằng {tên} kìa!', 'Ê! Nó hạ thằng {tên} rồi!'],
  prank: ['Có đứa đang giỡn mặt tụi mình. Lục soát!'],
  question: ['Ê, mày làm gì ở đây?', 'Ê, đi đâu đó? Khu này không cho vô.'],
  bluffOk: ['Ờ, lẹ lên rồi đi ra.', 'Thôi đi đi, đừng có lảng vảng.'],
  bluffFail: ['Xạo hoài! Đứng lại!', 'Nói dóc! Tụi bây ơi!'],
  radioBase: ['Tổ hai, báo cáo.', '{tên}, nghe rõ trả lời.'],
  radioReply: ['Bình thường, anh.', 'Ổn hết anh.', 'Không có gì.', 'Yên re anh.'],
  radioMissed: ['{tên} không trả lời. Đứa nào ra chỗ nó coi thử.'],
  radioStranger: ['Giọng ai lạ vậy?'],
  alarmBase: ['Cả tổ để ý, có thể có người lạ.'],
  alarm2: ['Báo động! Chặn hết mấy cửa ra!'],
  reinforcements: ['Anh em tới liền, giữ nó lại!'],
  lightsOut: ['Ủa, cúp điện hả?'],
  fixed: ['Có điện lại rồi.'],
  flee: ['Có người lạ! Anh ơi!'],
  surrender: ['Đừng bắn! Tôi không làm gì hết!'],
} as const satisfies Record<string, readonly string[]>;
export type BarkKey = keyof typeof BARKS;
/** The text of a bark event: pool line `line`, with {tên} filled in. */
export const barkText = (key: BarkKey, line: number, name = '') => {
  const pool: readonly string[] = BARKS[key];
  return pool[((line % pool.length) + pool.length) % pool.length].replace('{tên}', name);
};

// ---------------------------------------------------------------------------------------------------------
// Events: one pooled mutable record shape for everything the brain reports. Copy what you keep.
// ---------------------------------------------------------------------------------------------------------

export type BrainEventKind =
  | 'suspicious' | 'investigate' | 'calm' | 'search' | 'searchEnd' | 'detected' | 'alarm' | 'bark'
  | 'radioCall' | 'radioReply' | 'radioBluff' | 'radioBluffResult' | 'radioMissed'
  | 'bodyFound' | 'woken' | 'hideCheck' | 'hideCaught' | 'question' | 'questioned' | 'coverBroken'
  | 'reinforcements' | 'lockExits' | 'shot' | 'strike' | 'tackle' | 'takedown' | 'knockout' | 'kill' | 'slip' | 'escape'
  | 'witness' | 'distracted' | 'prank' | 'surrender' | 'cameraSpotted' | 'lightsOut' | 'fixed' | 'dogBark';
export type BrainEvent = {
  kind: BrainEventKind; t: number;
  /** The acting guard (or camera, dog) id; '' for the arena. */
  guard: string;
  /** A second id: the downed guard, hide spot, camera, light group; or the name used in a bark's {tên}. */
  other: string;
  x: number; z: number;
  /** Alarm level, bark line, struggle count… depending on kind. */
  level: number;
  /** Damage, deadline, seconds… depending on kind. */
  value: number;
  bark: BarkKey | ''; ok: boolean;
};

// ---------------------------------------------------------------------------------------------------------
// Seeded rng (mulberry32) whose state can be saved with a checkpoint.
// ---------------------------------------------------------------------------------------------------------

export type Rng = (() => number) & { state: number };
export function createRng(seed = 1): Rng {
  const rng = (() => {
    let t = (rng.state = (rng.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  rng.state = seed | 0;
  return rng;
}

// ---------------------------------------------------------------------------------------------------------
// Arena data the brain consumes (a subset of the design's ArenaDef; arenas.ts builds these from props).
// ---------------------------------------------------------------------------------------------------------

export type Rect = { minX: number; minZ: number; maxX: number; maxZ: number };
export type PatrolNode = { x: number; z: number; y?: number; wait?: readonly [number, number]; look?: number; act?: GuardAct };
export type HideSpec = { id: string; x: number; z: number; acceptsBody?: boolean; soft?: boolean };
export type AlarmPoint = { id: string; x: number; z: number; kind?: 'keng' | 'coi' | 'bell' };
export type ZoneSpec = Rect & { kind: ZoneKind; crowd?: boolean; label?: string };
/** A soft occluder (bamboo, laundry, steam, smoke): rays through it are multiplied by factor, never fully blocked. */
export type SoftOccluder = Rect & { bottom: number; top: number; factor?: number };
export type GuardSpec = {
  id: string; name?: string; kind?: GuardKind; group?: string;
  at: { x: number; z: number; y?: number; yaw?: number };
  route?: readonly PatrolNode[]; loop?: 'loop' | 'pingpong';
  post?: { x: number; z: number; yaw: number; sweep?: number; act?: GuardAct };
  weapon?: Weapon; flashlight?: boolean | 'night'; radio?: boolean; radioReply?: string;
  knowsFace?: boolean; chokeable?: boolean; health?: number; vision?: number; hearing?: number;
};
export type CameraSpec = {
  id: string; x: number; y: number; z: number; yaw: number; sweep?: number; period?: number; fov?: number; range?: number;
  /** A guard id or the security 'room'; an unmonitored camera only blinks. */
  monitoredBy: string; group?: string;
};
export type SearchlightSpec = {
  id: string; x: number; y: number; z: number; yaw: number; pitch?: number; sweep?: number; period?: number;
  angle?: number; range?: number; operator: string; k?: number;
};
export type DogSpec = { id: string; x: number; z: number; yaw?: number };
