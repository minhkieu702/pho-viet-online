/**
 * Guard brain (story-system-stealth.md §4-7): awareness integration, the mode state machine, search coordination,
 * calling others, arena alarm levels with kẻng/radio and reinforcements, the radio net with its bluff, bodies found and
 * woken, CCTV, searchlights, watchdogs, fuse boxes, takedowns and the chokehold, and LƯƠNG TÂM bookkeeping. Pure
 * TypeScript with no three.js or DOM: guards.ts (Wave 2) renders the minds, moves them along the arena nav (or lets the
 * built-in straight-line mover do it) and turns the events into barks, sounds, ragdolls and HUD.
 *
 * Deterministic: every random choice comes from the injected rng and every timer from the t passed to update(); two
 * runs with the same seed, inputs and dt produce the same events. Hot paths allocate nothing (events are pooled records
 * that the caller reads between update() and clearEvents()).
 *
 * Never lethal by itself: takedowns, fists, throws and the chokehold knock out. Over-squeezing a chokehold is a slip
 * (noise and a light knockout that wakes early), not a death (story-plan.md Gaps, STEALTH vs CAMPAIGN RULE). Kills come
 * only from damage() with a lethal cause, and count in LƯƠNG TÂM only while rules.countConscience is set.
 *
 * Interop with the street-life systems on main: the host feeds civilians (npcs and the vé số / xe ôm / quán cóc roles)
 * to perception.setCrowd for crowd cover, offers takedown / loot / tie / drag / hide / kẻng / fuse interactions as
 * Interactable registry entries (hold-E for the crimes) that call the methods here, and the music beat clock opens
 * sound-cover windows on the noise bus.
 */
import {
  DIFFICULTY, HEARD, LETHAL, NOISE, NOISE_CLASS, NOISE_ID, TUNE as T, barkText,
  type AlarmLevel, type AlarmPoint, type BarkKey, type BrainEvent, type BrainEventKind, type CameraSpec, type DamageCause, type Detection,
  type Difficulty, type DogSpec, type GuardAct, type GuardKind, type GuardMode, type GuardSpec, type HideSpec, type PatrolNode, type SearchlightSpec, type Weapon,
} from './stealth-types.ts';
import {
  cameraViewer, createSight, createTarget, createViewer, spotAt,
  type LightField, type NoiseBus, type Perception, type Sight, type Target, type Viewer,
} from './stealth-perception.ts';

/** The player as the brain sees it: a perception Target plus what only the brain needs. */
export type PlayerState = Target & {
  /** In the arena and on foot (false while driving through, in a cutscene, or dead). */
  present: boolean;
  /** Id of the hide spot the player is inside, '' when none. */
  hiddenIn: string;
  /** Aiming a gun (for surrender) and where. */
  aiming: boolean; aimYaw: number;
  /** The social cover's errand target (the delivery door); NaN when none. */
  coverX: number; coverZ: number;
};
export const createPlayerState = (): PlayerState => ({ ...createTarget(), present: true, hiddenIn: '', aiming: false, aimYaw: 0, coverX: NaN, coverZ: NaN });

export type GuardJob = '' | 'wake' | 'fix' | 'radio' | 'fast';
export type BodyState = 'none' | 'down' | 'tied' | 'dead';
export type KnockoutKind = 'fast' | 'choke' | 'slip' | 'beaten';
export type GuardMind = {
  readonly id: string; name: string; kind: GuardKind; group: string; readonly index: number;
  x: number; y: number; z: number; yaw: number; headYaw: number; speed: number; health: number; maxHealth: number;
  /** Locomotion intent for the mover: go to (goalX, goalZ) at pace m/s, or stand and turn to faceYaw. */
  goalX: number; goalZ: number; hasGoal: boolean; pace: number; faceYaw: number; hasFace: boolean;
  mode: GuardMode; since: number; sub: number; subUntil: number; job: GuardJob; jobRef: string; jobAt: number;
  /** A mode change waiting out the 0.35-0.6 s human reaction delay. */
  pending: GuardMode | ''; pendAt: number; pendX: number; pendZ: number; pendEv: number;
  awareness: number; cautious: boolean; detected: boolean; calmFor: number; seenFor: number; lastSeenT: number; bumpOn: boolean; stimEv: number;
  /** Memory: last known player position. */
  hasLast: boolean; lastX: number; lastZ: number; lastT: number;
  /** The point this mode is about and how strong the evidence is (0 glimpse, 1 minor noise, 2 medium, 3 strong). */
  stimX: number; stimZ: number; evidence: number; distraction: boolean; called: boolean; checkSpot: number; forceSpot: number; lookUp: boolean;
  route: readonly PatrolNode[] | null; loop: 'loop' | 'pingpong'; routeI: number; routeDir: number; waiting: boolean; waitUntil: number;
  post: { x: number; z: number; yaw: number; sweep: number; act: GuardAct | null } | null;
  act: GuardAct | null; actUntil: number;
  weapon: Weapon; flashlight: 'off' | 'on' | 'night'; lit: boolean; lightSlot: number;
  radio: boolean; radioReply: string; radioLooted: boolean; knowsFace: boolean; chokeable: boolean; vision: number; hearing: number;
  stunnedUntil: number; deaf: boolean;
  viewer: Viewer; sight: Sight; perceiveAt: number; perceivedAt: number; bodyMeter: number;
  searchUntil: number; pts: Int8Array; ptsN: number; ptsI: number; hideChecks: number; wanderX: number; wanderZ: number;
  nextShot: number; nextStrike: number; nextTackle: number;
  bluffed: boolean; aimTested: boolean; aimLost: number;
  body: BodyState; hidden: boolean; hiddenIn: string; found: boolean; wakeAt: number; bodyL: number; bodyLAt: number;
  barkAt: number;
  /** A glance toward a sound: the head turns to lookYaw until lookUntil. */
  lookYaw: number; lookUntil: number;
};

/** Mode tiers: 0 unaware, 1 suspicious, 2 investigate/question, 3 search/hold, 4 alert family, 5 combat, 9 body. */
export const TIER: Readonly<Record<GuardMode, number>> = {
  patrol: 0, post: 0, scripted: 0, suspicious: 1, investigate: 2, question: 2, search: 3, hold: 3,
  alert: 4, radio: 4, raise: 4, flee: 4, surrender: 4, combat: 5, grabbed: 9, down: 9, tied: 9, dead: 9,
};
const SEATED = (a: GuardAct | null) => a === 'stool' || a === 'cards' || a === 'doze';
/** Acts that make a guard "distracted" for takedowns from the side (> 70° off his facing). */
const DISTRACTED = (a: GuardAct | null) => a !== null && a !== 'chat';
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const fin = (x: number) => (x === Infinity ? 1e300 : x === -Infinity ? -1e300 : x);

export type BrainRules = {
  takedowns: boolean; countConscience: boolean; lightsOutAlarm: boolean;
  /** Knocked-out guards wake by themselves after the TUNE wake times (tied ones never). */
  wake: boolean;
  reinforceDelay: number;
};
export type BrainOptions = {
  perception: Perception; noise: NoiseBus; light?: LightField | null;
  rng: () => number; difficulty?: Difficulty;
  /** Arena nav nodes: search candidates. Hide spots, kẻng/còi points, exits held at alarm 2. */
  nav?: readonly { x: number; z: number }[]; hides?: readonly HideSpec[]; alarms?: readonly AlarmPoint[]; exits?: readonly { x: number; z: number }[];
  reinforcements?: readonly { delay?: number; count: number; entry?: string }[];
  /** Radio net: a roll call every `every` s (first one at `first`), `grace` s to answer. */
  radio?: { every?: number; first?: number; grace?: number } | null;
  rules?: Partial<BrainRules>;
  /** Replaces the straight-line mover (guards.ts: A* on the arena nav, wall slide, separation). */
  mover?: ((g: GuardMind, dt: number) => void) | null;
  onEvent?: ((e: BrainEvent) => void) | null;
};

type CameraState = {
  id: string; spec: CameraSpec; yaw0: number; on: boolean; destroyed: boolean; loopUntil: number; meter: number; hits: number; blink: boolean;
  viewer: Viewer; sight: Sight; perceiveAt: number; perceivedAt: number;
};
type SearchlightState = { id: string; spec: SearchlightSpec; yaw: number; slot: number; frozen: boolean; inBeam: boolean };
type DogState = { id: string; x: number; z: number; yaw: number; barkAt: number; fedUntil: number };

export type GuardBrain = ReturnType<typeof createGuardBrain>;

export function createGuardBrain(opts: BrainOptions) {
  const P = opts.perception, bus = opts.noise, light = opts.light ?? null, rng = opts.rng;
  // A createRng() rng carries its state: snapshots save and restore it.
  const seeded = rng as unknown as { state?: number };
  let diff = DIFFICULTY[opts.difficulty ?? 'thuong'];
  P.env.noise = diff.noise;
  const rules: BrainRules = { takedowns: true, countConscience: true, lightsOutAlarm: true, wake: true, reinforceDelay: T.reinforceDelay, ...opts.rules };
  const nav = opts.nav ?? [], hides = opts.hides ?? [], exits = opts.exits ?? [], reinf = opts.reinforcements ?? [];
  const alarms = (opts.alarms ?? []).map((a) => ({ ...a, disabled: false }));
  const guards: GuardMind[] = [];
  const byId = new Map<string, GuardMind>();
  const cameras: CameraState[] = [], searchlights: SearchlightState[] = [], dogs: DogState[] = [];
  const events: BrainEvent[] = [];
  let eventCount = 0;
  const S = {
    t: 0, paused: false, alarm: 0 as AlarmLevel, alarmAt: 0, contactT: -Infinity, sightT: -Infinity,
    reinforceAt: Infinity, reinforceI: 0, hasLast: false, lastX: 0, lastZ: 0, noiseRead: bus.seq,
    coverOk: true, coverIntegrity: 100, loiterT: 0, hiddenPrev: '', roomManned: true,
  };
  const stats = { knockouts: 0, kills: 0, detections: 0, alarms: 0, bodiesFound: 0, slips: 0 };
  const pranks = new Float64Array(3).fill(-Infinity), dogRing = new Float64Array(3).fill(-Infinity);
  let prankI = 0, dogI = 0;
  const cuts = new Map<string, { x: number; z: number; noticed: boolean }>();
  const net = {
    on: !!opts.radio, every: opts.radio?.every ?? T.radioEvery, grace: opts.radio?.grace ?? diff.radioGrace,
    nextRound: opts.radio?.first ?? opts.radio?.every ?? T.radioEvery, i: -1, phase: 0, at: 0, deadline: 0, bluffAsked: false, answer: 0,
  };
  // Shared search points: up to 6 per plan, each owned by at most one guard.
  const PTS = T.searchPoints;
  const pts = {
    x: new Float64Array(PTS), z: new Float64Array(PTS), score: new Float64Array(PTS), hide: new Int16Array(PTS),
    owner: new Int16Array(PTS), done: new Uint8Array(PTS), n: 0, cx: 0, cz: 0, valid: false,
  };
  const near3 = new Int16Array(T.converge), near3d = new Float64Array(T.converge);
  let player: PlayerState = createPlayerState();
  player.present = false;

  // ---------------------------------------------------------------------------------------------------
  // Events and barks.
  // ---------------------------------------------------------------------------------------------------

  function emit(kind: BrainEventKind, guard = '', other = '', x = 0, z = 0, level = 0, value = 0, ok = false, bark: BarkKey | '' = '') {
    let e = events[eventCount];
    if (!e) events.push((e = { kind, t: 0, guard: '', other: '', x: 0, z: 0, level: 0, value: 0, bark: '', ok: false }));
    e.kind = kind; e.t = S.t; e.guard = guard; e.other = other; e.x = x; e.z = z; e.level = level; e.value = value; e.ok = ok; e.bark = bark;
    eventCount++;
    if (opts.onEvent) opts.onEvent(e);
    return e;
  }
  /** A bark from a guard (rate-limited to one per 1.2 s unless forced) or, with g null, from the base radio voice. */
  function bark(g: GuardMind | null, key: BarkKey, name = '', force = false) {
    if (g) {
      if (!force && S.t < g.barkAt) return;
      g.barkAt = S.t + 1.2;
    }
    emit('bark', g ? g.id : '', name, g ? g.x : 0, g ? g.z : 0, Math.floor(rng() * 64), 0, false, key);
  }

  // ---------------------------------------------------------------------------------------------------
  // Guards.
  // ---------------------------------------------------------------------------------------------------

  function addGuard(spec: GuardSpec) {
    const index = guards.length;
    const g: GuardMind = {
      id: spec.id, name: spec.name ?? spec.id, kind: spec.kind ?? 'thug', group: spec.group ?? '', index,
      x: spec.at.x, y: spec.at.y ?? 0, z: spec.at.z, yaw: spec.at.yaw ?? 0, headYaw: 0, speed: 0,
      health: spec.health ?? (spec.kind === 'boss' ? T.bossHealth : T.healthDefault), maxHealth: 0,
      goalX: spec.at.x, goalZ: spec.at.z, hasGoal: false, pace: 0, faceYaw: spec.at.yaw ?? 0, hasFace: false,
      mode: 'post', since: S.t, sub: 0, subUntil: 0, job: '', jobRef: '', jobAt: 0,
      pending: '', pendAt: 0, pendX: 0, pendZ: 0, pendEv: 0,
      awareness: 0, cautious: false, detected: false, calmFor: 0, seenFor: 0, lastSeenT: -Infinity, bumpOn: false, stimEv: 0,
      hasLast: false, lastX: 0, lastZ: 0, lastT: -Infinity,
      stimX: 0, stimZ: 0, evidence: 0, distraction: false, called: false, checkSpot: -1, forceSpot: -1, lookUp: false,
      route: spec.route && spec.route.length ? spec.route : null, loop: spec.loop ?? 'loop', routeI: 0, routeDir: 1, waiting: false, waitUntil: 0,
      post: spec.post ? { x: spec.post.x, z: spec.post.z, yaw: spec.post.yaw, sweep: spec.post.sweep ?? 40 * (Math.PI / 180), act: spec.post.act ?? null } : null,
      act: null, actUntil: Infinity,
      weapon: spec.weapon ?? 'none', flashlight: spec.flashlight === true ? 'on' : spec.flashlight === 'night' ? 'night' : 'off', lit: false, lightSlot: -1,
      radio: !!spec.radio, radioReply: spec.radioReply ?? barkText('radioReply', index), radioLooted: false,
      knowsFace: !!spec.knowsFace, chokeable: spec.chokeable ?? spec.kind !== 'boss', vision: spec.vision ?? 1, hearing: spec.hearing ?? 1,
      stunnedUntil: -Infinity, deaf: false,
      viewer: createViewer(), sight: createSight(), perceiveAt: S.t + (index % 6) / 60, perceivedAt: S.t, bodyMeter: 0,
      searchUntil: 0, pts: new Int8Array(4), ptsN: 0, ptsI: 0, hideChecks: 0, wanderX: 0, wanderZ: 0,
      nextShot: 0, nextStrike: 0, nextTackle: 0,
      bluffed: false, aimTested: false, aimLost: 0,
      body: 'none', hidden: false, hiddenIn: '', found: false, wakeAt: Infinity, bodyL: 0, bodyLAt: -Infinity,
      barkAt: 0, lookYaw: 0, lookUntil: -Infinity,
    };
    g.maxHealth = g.health;
    g.mode = g.route ? 'patrol' : 'post';
    if (!g.route && !g.post) g.post = { x: g.x, z: g.z, yaw: g.yaw, sweep: 40 * (Math.PI / 180), act: null };
    if (g.flashlight !== 'off' && light) g.lightSlot = light.alloc();
    guards.push(g);
    byId.set(g.id, g);
    return g;
  }
  const conscious = (g: GuardMind) => TIER[g.mode] < 9;
  const dist2 = (g: GuardMind, x: number, z: number) => (g.x - x) * (g.x - x) + (g.z - z) * (g.z - z);
  function goTo(g: GuardMind, x: number, z: number, pace: number) { g.goalX = x; g.goalZ = z; g.hasGoal = true; g.pace = pace; g.hasFace = false; }
  function stop(g: GuardMind) { g.hasGoal = false; g.pace = 0; }
  function face(g: GuardMind, x: number, z: number) {
    if ((x - g.x) * (x - g.x) + (z - g.z) * (z - g.z) > 1e-6) g.faceYaw = Math.atan2(x - g.x, z - g.z);
    g.hasFace = true;
  }
  const arrived = (g: GuardMind) => !g.hasGoal || dist2(g, g.goalX, g.goalZ) <= 0.45 * 0.45;
  const pace = (g: GuardMind, base: number) => base * (g.cautious ? T.paceCautious : 1);
  function remember(g: GuardMind, x: number, z: number) {
    g.hasLast = true; g.lastX = x; g.lastZ = z; g.lastT = S.t;
    S.hasLast = true; S.lastX = x; S.lastZ = z;
  }

  /** Asks for a mode change after the reaction delay (instant skips it). Lower or equal tiers only retarget. */
  function request(g: GuardMind, mode: GuardMode, x: number, z: number, ev: number, instant = false) {
    const tier = TIER[g.mode];
    if (tier >= 9 || g.mode === 'scripted') return;
    const want = TIER[mode];
    if (g.pending) {
      const pt = TIER[g.pending];
      if (pt > want) return;
      if (pt === want) {
        g.pendX = x; g.pendZ = z;
        if (ev > g.pendEv) g.pendEv = ev;
        if (instant) g.pendAt = Math.min(g.pendAt, S.t);
        return;
      }
    }
    if (want < tier || (want === tier && (mode === g.mode || tier >= 3))) { retarget(g, x, z, ev); return; }
    // An upgrade keeps the reaction already under way (he was already turning).
    const at = instant ? S.t : S.t + T.reactMin + (T.reactMax - T.reactMin) * rng() + (SEATED(g.act) ? T.standUp : 0);
    g.pendAt = g.pending ? Math.min(g.pendAt, at) : at;
    g.pending = mode; g.pendX = x; g.pendZ = z; g.pendEv = ev;
  }
  /** New information for a guard already at (or above) this level of interest. */
  function retarget(g: GuardMind, x: number, z: number, ev: number) {
    if (ev > g.evidence) g.evidence = ev;
    switch (g.mode) {
      case 'suspicious': g.stimX = x; g.stimZ = z; face(g, x, z); break;
      case 'investigate': if (g.sub <= 1 && !g.job) { g.stimX = x; g.stimZ = z; g.sub = 0; goTo(g, x, z, pace(g, T.paceInvestigate)); } break;
      case 'search':
        if ((x - pts.cx) * (x - pts.cx) + (z - pts.cz) * (z - pts.cz) > 64) startSearch(g, x, z);
        else g.searchUntil = Math.max(g.searchUntil, S.t + searchTime(g) * 0.5);
        break;
      default: break;
    }
  }

  function enter(g: GuardMind, mode: GuardMode, x: number, z: number, ev: number) {
    releasePoints(g);
    g.mode = mode; g.since = S.t; g.sub = 0; g.subUntil = 0; g.pending = '';
    g.stimX = x; g.stimZ = z; g.evidence = ev; g.lookUp = false; g.calmFor = 0; g.seenFor = 0;
    if (TIER[mode] > 0) { g.act = null; g.waiting = false; }
    switch (mode) {
      case 'suspicious':
        stop(g); face(g, x, z);
        bark(g, 'suspicious'); emit('suspicious', g.id, '', x, z, 0, g.awareness);
        break;
      case 'investigate': {
        goTo(g, x, z, g.job === 'wake' ? T.paceRun : pace(g, T.paceInvestigate));
        if (g.job !== 'wake') bark(g, 'investigate');
        emit('investigate', g.id, g.job, x, z, ev);
        if (g.distraction) { g.distraction = false; if (countPrank(g)) return; }
        if (ev >= 2 && !g.called && !g.job) callBuddy(g, x, z, ev);
        break;
      }
      case 'question': goTo(g, player.x, player.z, T.paceInvestigate); break;
      case 'search': startSearch(g, x, z); bark(g, 'search'); emit('search', g.id, '', x, z, ev); break;
      case 'hold': goTo(g, x, z, T.paceRun); break;
      case 'alert': {
        g.awareness = 100; stop(g); face(g, x, z);
        if (!g.detected) { g.detected = true; stats.detections++; }
        S.contactT = S.t;
        emit('detected', g.id, '', x, z, S.alarm);
        bark(g, player.coverOn && player.cover === 'shipper' ? 'alertShipper' : 'alert', '', true);
        bus.emit('shout', g.x, g.z, NOISE.shout, S.t, g.y + 1.6, g.id, x, z);
        break;
      }
      case 'radio': stop(g); g.subUntil = S.t + T.radioCall; bark(g, 'radioAlert', '', true); break;
      case 'raise': { const k = alarmPoint(g); if (k >= 0) goTo(g, alarms[k].x, alarms[k].z, T.paceRun); g.sub = k; bark(g, 'raise', '', true); break; }
      // TRUY SÁT is a fight in an alarmed arena; a lone guard without radio or kẻng just fights.
      case 'combat': if (S.alarm === 2) { S.sightT = S.t; setAlarm(3, 'combat'); } g.lastSeenT = Math.max(g.lastSeenT, S.t); break;
      case 'flee': { fleeTarget(g); bark(g, 'flee', '', true); break; }
      case 'surrender': stop(g); face(g, player.x, player.z); g.aimLost = 0; bark(g, 'surrender', '', true); emit('surrender', g.id, '', g.x, g.z); break;
      default: break;
    }
  }
  /** Back to the route or post. */
  function calm(g: GuardMind, cautious: boolean, key: BarkKey | '' = 'calm') {
    releasePoints(g);
    g.mode = g.route ? 'patrol' : 'post'; g.since = S.t; g.sub = 0; g.pending = ''; g.job = ''; g.jobRef = '';
    g.detected = false; g.distraction = false; g.called = false; g.evidence = 0; g.stimEv = 0; g.forceSpot = -1; g.checkSpot = -1;
    g.waiting = false; g.lookUp = false; g.headYaw = 0;
    if (g.awareness > T.suspicious - 1) g.awareness = T.suspicious - 1;
    if (cautious) g.cautious = true;
    if (!g.route && !g.post) g.post = { x: g.x, z: g.z, yaw: g.yaw, sweep: 40 * (Math.PI / 180), act: null };
    if (key) bark(g, key);
    emit('calm', g.id, '', g.x, g.z, cautious ? 1 : 0);
  }

  function callBuddy(g: GuardMind, x: number, z: number, ev: number) {
    let best: GuardMind | null = null, bd = T.buddyR * T.buddyR;
    for (let i = 0; i < guards.length; i++) {
      const o = guards[i];
      if (o === g || TIER[o.mode] !== 0 || o.mode === 'scripted' || o.group !== g.group || o.pending) continue;
      const d = dist2(o, g.x, g.z);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    bark(g, 'buddy');
    best.called = true;
    request(best, 'investigate', x + 1.5 * Math.sin(g.yaw + 1.6), z + 1.5 * Math.cos(g.yaw + 1.6), ev);
  }

  /** The anti-exploit rule: the third distraction investigated within 60 s turns into a search and alarm 1. */
  function countPrank(g: GuardMind) {
    pranks[prankI] = S.t; prankI = (prankI + 1) % 3;
    let n = 0;
    for (let i = 0; i < 3; i++) if (S.t - pranks[i] <= T.prankWindow) n++;
    if (n < 3) return false;
    pranks.fill(-Infinity);
    bark(g, 'prank', '', true);
    emit('prank', g.id, '', g.stimX, g.stimZ);
    raiseAlarm(1, 'prank');
    enter(g, 'search', g.stimX, g.stimZ, 3);
    return true;
  }

  function alarmPoint(g: GuardMind) {
    let best = -1, bd = T.raiseR * T.raiseR;
    for (let i = 0; i < alarms.length; i++) {
      if (alarms[i].disabled) continue;
      const d = dist2(g, alarms[i].x, alarms[i].z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /** Workers and surrendered guards run to the nearest armed conscious guard or alarm point. */
  function fleeTarget(g: GuardMind) {
    let bx = g.x, bz = g.z, bd = Infinity;
    for (let i = 0; i < guards.length; i++) {
      const o = guards[i];
      if (o === g || !conscious(o) || o.weapon === 'none' || o.mode === 'surrender' || o.mode === 'flee') continue;
      const d = dist2(o, g.x, g.z);
      if (d < bd) { bd = d; bx = o.x; bz = o.z; }
    }
    for (let i = 0; i < alarms.length; i++) {
      const d = dist2(g, alarms[i].x, alarms[i].z);
      if (d < bd) { bd = d; bx = alarms[i].x; bz = alarms[i].z; }
    }
    if (bd === Infinity) { bx = g.x - 12 * Math.sin(g.faceYaw); bz = g.z - 12 * Math.cos(g.faceYaw); }
    goTo(g, bx, bz, T.paceRun);
  }

  // ---------------------------------------------------------------------------------------------------
  // Search coordination.
  // ---------------------------------------------------------------------------------------------------

  const searchTime = (g: GuardMind) => T.searchTime * (g.cautious ? T.searchCautious : 1) * diff.search;
  function insertPoint(score: number, x: number, z: number, hide: number) {
    let i = pts.n;
    if (i === PTS) { if (score >= pts.score[PTS - 1]) return; i = PTS - 1; } else pts.n++;
    while (i > 0 && pts.score[i - 1] > score) {
      pts.score[i] = pts.score[i - 1]; pts.x[i] = pts.x[i - 1]; pts.z[i] = pts.z[i - 1]; pts.hide[i] = pts.hide[i - 1];
      i--;
    }
    pts.score[i] = score; pts.x[i] = x; pts.z[i] = z; pts.hide[i] = hide;
  }
  /** Up to 6 points around (x, z): nav nodes within 12 m (near and dark first) and hide spots within 10 m; without nav,
   * a ring at 4 and 8 m keeping the points in clear view of the centre. Every searching guard re-picks from the plan. */
  function plan(x: number, z: number) {
    pts.n = 0; pts.cx = x; pts.cz = z; pts.valid = true;
    for (let i = 0; i < nav.length; i++) {
      const dx = nav[i].x - x, dz = nav[i].z - z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > T.searchNavR) continue;
      insertPoint(d - 4 * (1 - Math.min(1, P.lightAt(nav[i].x, 1, nav[i].z))), nav[i].x, nav[i].z, -1);
    }
    for (let i = 0; i < hides.length; i++) {
      const dx = hides[i].x - x, dz = hides[i].z - z, d = Math.sqrt(dx * dx + dz * dz);
      if (d <= T.searchHideR) insertPoint(d - 2, hides[i].x, hides[i].z, i);
    }
    if (!nav.length) {
      for (let k = 0; k < 16; k++) {
        const r = k < 8 ? 4 : 8, a = (k * Math.PI) / 4 + (k < 8 ? 0 : Math.PI / 8), px = x + r * Math.sin(a), pz = z + r * Math.cos(a);
        if (P.rayClear(x, 1, z, px, 1, pz) > 0) insertPoint(r + rng(), px, pz, -1);
      }
    }
    for (let i = 0; i < pts.n; i++) { pts.owner[i] = -1; pts.done[i] = 0; }
    for (let i = 0; i < guards.length; i++) if (guards[i].mode === 'search') { guards[i].ptsN = 0; guards[i].ptsI = 0; }
  }
  /** Gives g up to two unowned points, nearest to it first; returns how many. */
  function assign(g: GuardMind) {
    g.ptsN = 0; g.ptsI = 0;
    while (g.ptsN < 2) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < pts.n; i++) {
        if (pts.owner[i] >= 0 || pts.done[i]) continue;
        const d = dist2(g, pts.x[i], pts.z[i]);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) break;
      pts.owner[best] = g.index;
      g.pts[g.ptsN++] = best;
    }
    return g.ptsN;
  }
  function releasePoints(g: GuardMind) {
    for (let i = g.ptsI; i < g.ptsN; i++) { const p = g.pts[i]; if (pts.owner[p] === g.index) pts.owner[p] = -1; }
    g.ptsN = 0; g.ptsI = 0;
  }
  function startSearch(g: GuardMind, x: number, z: number) {
    releasePoints(g);
    let active = false;
    for (let i = 0; i < guards.length; i++) if (guards[i] !== g && guards[i].mode === 'search') active = true;
    if (!pts.valid || !active || (x - pts.cx) * (x - pts.cx) + (z - pts.cz) * (z - pts.cz) > 64) plan(x, z);
    g.searchUntil = S.t + searchTime(g);
    g.hideChecks = 0; g.sub = 0; g.stimX = x; g.stimZ = z;
    assign(g);
  }

  // ---------------------------------------------------------------------------------------------------
  // Hide spots.
  // ---------------------------------------------------------------------------------------------------

  function nearestHide(x: number, z: number, r: number) {
    let best = -1, bd = r * r;
    for (let i = 0; i < hides.length; i++) {
      const d = (hides[i].x - x) * (hides[i].x - x) + (hides[i].z - z) * (hides[i].z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function beginCheck(g: GuardMind, h: number) {
    stop(g); face(g, hides[h].x, hides[h].z);
    g.checkSpot = h; g.sub = 3; g.subUntil = S.t + T.lid; g.hideChecks++;
    bark(g, 'hideCheck');
    emit('hideCheck', g.id, hides[h].id, hides[h].x, hides[h].z, 0, g.subUntil);
  }
  /** End of the lid window: the player inside is caught; a body hidden inside is found. */
  function resolveCheck(g: GuardMind) {
    const h = g.checkSpot;
    g.checkSpot = -1;
    if (h < 0) return false;
    const spot = hides[h];
    if (player.present && player.hiddenIn === spot.id) {
      bark(g, 'hideCaught', '', true);
      emit('hideCaught', g.id, spot.id, spot.x, spot.z);
      remember(g, spot.x, spot.z);
      enter(g, 'alert', spot.x, spot.z, 3);
      return true;
    }
    for (let i = 0; i < guards.length; i++) {
      const b = guards[i];
      if (b.body !== 'none' && b.hidden && b.hiddenIn === spot.id && !b.found) { b.hidden = false; bodyFound(g, b); return true; }
    }
    return false;
  }

  // ---------------------------------------------------------------------------------------------------
  // Alarm.
  // ---------------------------------------------------------------------------------------------------

  function setAlarm(level: AlarmLevel, reason: string) {
    S.alarm = level; S.alarmAt = S.t;
    emit('alarm', '', reason, S.lastX, S.lastZ, level);
  }
  /** Raises the arena alarm (never lowers it); returns whether the level rose. */
  function raiseAlarm(level: AlarmLevel, reason: string) {
    S.contactT = S.t;
    if (level <= S.alarm) return false;
    const prev = S.alarm;
    stats.alarms++;
    setAlarm(level, reason);
    if (prev < 1) {
      for (let i = 0; i < guards.length; i++) if (conscious(guards[i])) guards[i].cautious = true;
      bark(null, 'alarmBase');
    }
    if (level >= 2 && prev < 2) {
      bark(null, 'alarm2');
      emit('lockExits', '', reason, S.lastX, S.lastZ, level);
      converge();
      if (S.reinforceI < reinf.length) S.reinforceAt = S.t + (reinf[S.reinforceI].delay ?? rules.reinforceDelay) * diff.reinforce;
    }
    return true;
  }
  /** Alarm 2: the three guards nearest the last known position converge on it; the rest hold the exits. */
  function converge() {
    let n = 0;
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (!conscious(g) || TIER[g.mode] >= 4 || g.mode === 'scripted') continue;
      const d = dist2(g, S.lastX, S.lastZ);
      let j = n < T.converge ? n++ : T.converge;
      if (j === T.converge) { if (d >= near3d[T.converge - 1]) continue; j = T.converge - 1; }
      while (j > 0 && near3d[j - 1] > d) { near3d[j] = near3d[j - 1]; near3[j] = near3[j - 1]; j--; }
      near3d[j] = d; near3[j] = i;
    }
    for (let k = 0; k < n; k++) request(guards[near3[k]], 'search', S.lastX, S.lastZ, 3);
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (!conscious(g) || TIER[g.mode] >= 3 || g.mode === 'scripted' || g.pending) continue;
      let chosen = false;
      for (let k = 0; k < n; k++) if (near3[k] === i) chosen = true;
      if (chosen) continue;
      if (!exits.length) { request(g, 'search', S.lastX, S.lastZ, 3); continue; }
      let best = 0, bd = Infinity;
      for (let e = 0; e < exits.length; e++) { const d = dist2(g, exits[e].x, exits[e].z); if (d < bd) { bd = d; best = e; } }
      request(g, 'hold', exits[best].x, exits[best].z, 3);
    }
  }
  function alarmUpdate() {
    const t = S.t;
    // TRUY SÁT ends 20 s after the last sighting, BÁO ĐỘNG 90 s and Cảnh giác 180 s after the last contact.
    if (S.alarm === 3 && t - S.sightT > T.alarm3Decay) setAlarm(2, 'decay');
    else if (S.alarm === 2 && t - S.contactT > T.alarm2Decay) setAlarm(1, 'decay');
    else if (S.alarm === 1 && t - S.contactT > T.alarm1Decay) setAlarm(0, 'decay');
    if (t >= S.reinforceAt) {
      const r = reinf[S.reinforceI++];
      emit('reinforcements', '', r.entry ?? '', S.lastX, S.lastZ, S.reinforceI - 1, r.count);
      bark(null, 'reinforcements');
      S.reinforceAt = S.reinforceI < reinf.length && S.alarm >= 2 ? t + (reinf[S.reinforceI].delay ?? rules.reinforceDelay) * diff.reinforce : Infinity;
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Bodies.
  // ---------------------------------------------------------------------------------------------------

  function knockOut(g: GuardMind, how: KnockoutKind) {
    if (g.body !== 'none') return;
    releasePoints(g);
    g.mode = 'down'; g.body = 'down'; g.since = S.t; g.pending = ''; g.health = 0; g.found = false; g.hidden = false; g.hiddenIn = '';
    g.awareness = 0; g.job = ''; g.act = null; g.sight.gain = 0; stop(g);
    const wait = how === 'fast' ? T.wakeFast : how === 'choke' ? T.wakeChoke : how === 'slip' ? T.wakeSlip : T.wakeBeaten;
    g.wakeAt = rules.wake ? S.t + wait : Infinity;
    if (light && g.lightSlot >= 0) light.off(g.lightSlot);
    stats.knockouts++;
    emit('knockout', g.id, how, g.x, g.z, 0, g.wakeAt);
  }
  function kill(g: GuardMind, cause: DamageCause) {
    if (g.body === 'dead') return;
    releasePoints(g);
    g.mode = 'dead'; g.body = 'dead'; g.since = S.t; g.pending = ''; g.health = 0; g.wakeAt = Infinity; g.awareness = 0; g.sight.gain = 0; stop(g);
    if (light && g.lightSlot >= 0) light.off(g.lightSlot);
    if (rules.countConscience) stats.kills++;
    emit('kill', g.id, cause, g.x, g.z);
  }
  function wake(g: GuardMind, byFinder: boolean) {
    if (g.body !== 'down') return;
    g.body = 'none'; g.found = false; g.hidden = false; g.hiddenIn = ''; g.health = Math.max(1, Math.round(g.maxHealth * 0.5)); g.wakeAt = Infinity;
    g.mode = g.route ? 'patrol' : 'post'; g.cautious = true; g.awareness = 40; g.stunnedUntil = -Infinity;
    bark(g, 'woken', '', true);
    emit('woken', g.id, byFinder ? 'finder' : 'self', g.x, g.z);
    if (!byFinder && g.radio) raiseAlarm(1, 'woken');
    enter(g, 'search', g.x, g.z, 3);
  }
  function bodyFound(g: GuardMind, b: GuardMind) {
    b.found = true; g.bodyMeter = 0;
    stats.bodiesFound++;
    remember(g, b.x, b.z);
    bark(g, 'body', b.name, true);
    emit('bodyFound', g.id, b.id, b.x, b.z, b.body === 'dead' ? 2 : b.body === 'tied' ? 1 : 0);
    raiseAlarm(1, 'body');
    if (b.body === 'down') { g.job = 'wake'; g.jobRef = b.id; enter(g, 'investigate', b.x, b.z, 3); } else enter(g, 'search', b.x, b.z, 3);
  }
  function scanBodies(g: GuardMind, dt: number) {
    let best = 0, who: GuardMind | null = null;
    const v = g.viewer, reach = (v.range > 0 ? v.range : T.rangeDay) * T.bodyRange + 1;
    for (let i = 0; i < guards.length; i++) {
      const b = guards[i];
      if (b === g || b.body === 'none' || b.hidden || b.found || b.mode === 'grabbed') continue;
      if (dist2(g, b.x, b.z) > reach * reach) continue;
      if (S.t - b.bodyLAt >= T.bodyLightEvery) { b.bodyL = P.lightAt(b.x, b.y + 0.3, b.z); b.bodyLAt = S.t; }
      const gain = P.seeBody(v, b.x, b.y, b.z, b.bodyL);
      if (gain > best) { best = gain; who = b; }
    }
    if (who) {
      g.bodyMeter += best * diff.detection * (TIER[g.mode] >= 3 ? T.stateSearch : TIER[g.mode] >= 1 ? T.stateSuspicious : 1) * dt;
      if (g.bodyMeter >= 100) bodyFound(g, who);
    } else g.bodyMeter = Math.max(0, g.bodyMeter - 20 * dt);
  }

  // ---------------------------------------------------------------------------------------------------
  // Perception and awareness.
  // ---------------------------------------------------------------------------------------------------

  function syncViewer(g: GuardMind) {
    const v = g.viewer;
    v.x = g.x; v.y = g.y; v.z = g.z; v.yaw = g.yaw + g.headYaw;
    v.vision = g.act === 'doze' ? 0 : g.vision * (g.cautious ? T.cautiousVision : 1) * (SEATED(g.act) ? T.seatedVision : 1);
    v.beam = g.lit; v.beamYaw = v.yaw; v.lookUp = g.lookUp; v.knowsFace = g.knowsFace;
  }
  function perceive(g: GuardMind, bodies: boolean) {
    syncViewer(g);
    if (player.present && !g.deaf) P.see(g.viewer, player, g.sight);
    else g.sight.gain = 0;
    const dt = Math.min(0.5, S.t - g.perceivedAt);
    g.perceivedAt = S.t;
    if (bodies && !g.deaf) scanBodies(g, dt);
    g.perceiveAt = S.t + (g.sight.d < T.perceiveNearD ? T.perceiveNear : T.perceiveEvery);
  }
  function integrate(g: GuardMind, dt: number) {
    const s = g.sight, tier = TIER[g.mode];
    if (s.bump && !g.bumpOn && player.present) { g.awareness = Math.min(100, g.awareness + T.bump); remember(g, player.x, player.z); }
    g.bumpOn = s.bump;
    if (s.gain > 0 && player.present) {
      g.lastSeenT = S.t;
      remember(g, player.x, player.z);
      if (tier >= 3) S.contactT = S.t;
      if (tier >= 4) { g.awareness = 100; if (g.mode === 'combat') S.sightT = S.t; return; }
      if (g.mode === 'question') return;
      const mul = tier === 0 ? T.stateUnaware : tier <= 2 ? T.stateSuspicious : T.stateSearch;
      g.awareness = Math.min(100, g.awareness + s.gain * mul * diff.detection * dt);
      if (tier === 1) g.seenFor += dt;
      if (s.instant) request(g, 'alert', player.x, player.z, 3);
      return;
    }
    if (tier >= 4 || g.mode === 'question') return;
    if (tier === 0 && S.t - g.lastSeenT < T.grace) return;
    const rate = (tier === 0 ? T.decayUnaware : tier <= 2 ? T.decaySuspicious : T.decaySearch) * (g.cautious ? T.cautiousDecay : 1);
    g.awareness = Math.max(0, g.awareness - rate * dt);
  }
  function thresholds(g: GuardMind) {
    if (g.mode === 'scripted') {
      if (g.awareness >= T.alert && !g.detected) { g.detected = true; stats.detections++; emit('detected', g.id, 'scripted', g.lastX, g.lastZ, S.alarm); }
      return;
    }
    const tier = TIER[g.mode], a = g.awareness;
    if (tier >= 4) return;
    if (a >= T.alert) request(g, 'alert', g.lastX, g.lastZ, 3);
    else if (a >= T.investigate && tier < 2) escalate(g);
    else if (a >= T.suspicious && tier < 1) request(g, 'suspicious', g.lastX, g.lastZ, g.stimEv);
  }
  /** Awareness past 60 or a sighting that will not go away: go and look, or, at a uniform in a public, staff or
   * restricted zone, go and ask ('Ê, mày làm gì ở đây?'); a guard who was bluffed once is not asking twice. */
  function escalate(g: GuardMind) {
    if (player.coverOn && S.coverOk && player.zone !== 'hostile' && g.lastSeenT >= S.t - 0.5) request(g, g.bluffed ? 'alert' : 'question', player.x, player.z, 2);
    else request(g, 'investigate', g.lastX, g.lastZ, Math.max(2, g.stimEv));
  }

  // ---------------------------------------------------------------------------------------------------
  // Hearing.
  // ---------------------------------------------------------------------------------------------------

  function hearAll() {
    const end = bus.seq;
    let s = S.noiseRead;
    if (end - s > bus.cap) s = end - bus.cap;
    S.noiseRead = end;
    for (; s < end; s++) {
      const i = s % bus.cap, cls = NOISE_CLASS[bus.kind[i]];
      if (cls === HEARD.ignore) continue;
      const src = bus.source[i], sx = bus.x[i], sy = bus.y[i], sz = bus.z[i];
      let dogs3 = false;
      if (cls === HEARD.dog) {
        dogRing[dogI] = bus.t[i]; dogI = (dogI + 1) % 3;
        dogs3 = bus.t[i] - Math.min(dogRing[0], dogRing[1], dogRing[2]) <= T.dogWindow;
      }
      // Guards' own footsteps are background; the player's (and a follower's) are not.
      const guardSource = byId.has(src);
      if (cls === HEARD.step && guardSource) continue;
      for (let j = 0; j < guards.length; j++) {
        const g = guards[j];
        if (TIER[g.mode] >= 9 || g.deaf || src === g.id) continue;
        const eff = P.hearRadius(g.x, g.y + T.eye, g.z, g.hearing * (g.act === 'doze' ? 0.5 : 1), sx, sy, sz, bus.r[i], S.t);
        if (!eff) continue;
        const dx = g.x - sx, dz = g.z - sz, loud = 1 - Math.sqrt(dx * dx + dz * dz) / eff;
        onNoise(g, cls, bus.kind[i], sx, sz, bus.px[i], bus.pz[i], loud, dogs3, guardSource);
      }
    }
  }
  function onNoise(g: GuardMind, cls: number, kind: number, sx: number, sz: number, px: number, pz: number, loud: number, dogs3: boolean, fromGuard: boolean) {
    const tier = TIER[g.mode];
    if (g.mode === 'scripted') return;
    switch (cls) {
      case HEARD.step:
        // Footsteps alone never make an alert: the last 5 points need eyes.
        if (g.awareness < 95) g.awareness = Math.min(95, g.awareness + (T.stepMin + (T.stepMax - T.stepMin) * Math.max(0, loud)) * diff.detection);
        remember(g, sx, sz); g.stimEv = Math.max(g.stimEv, 1);
        if (tier <= 1) { g.lookYaw = Math.atan2(sx - g.x, sz - g.z); g.lookUntil = S.t + 1.5; }
        break;
      case HEARD.minor:
        if (tier > 2) break;
        if (g.awareness < T.suspicious + 5) g.awareness = T.suspicious + 5;
        g.stimEv = Math.max(g.stimEv, 1);
        request(g, 'suspicious', sx, sz, 1);
        break;
      case HEARD.distraction:
        if (tier > 1) break;
        g.awareness = Math.min(T.distractionCap, Math.max(g.awareness, T.suspicious + 5));
        g.distraction = true;
        request(g, 'suspicious', sx, sz, 1);
        emit('distracted', g.id, '', sx, sz, kind);
        break;
      case HEARD.lure:
        if (tier > 2) break;
        g.awareness = Math.min(T.distractionCap, Math.max(T.suspicious + 5, g.awareness + T.lure));
        remember(g, sx, sz);
        request(g, 'suspicious', sx, sz, 2);
        break;
      case HEARD.thud: if (tier < 4) request(g, 'search', sx, sz, 3); break;
      case HEARD.loud:
        if (tier >= 4) break;
        // A guard's shout points at what he saw; a gunshot or scream is its own place.
        remember(g, fromGuard ? px : sx, fromGuard ? pz : sz);
        if (g.awareness < T.investigate) g.awareness = T.investigate;
        request(g, 'search', fromGuard ? px : sx, fromGuard ? pz : sz, 3);
        if (kind === NOISE_ID.gunshot) raiseAlarm(2, 'gunshot');
        break;
      case HEARD.alarm: if (tier < 4) request(g, 'search', S.hasLast ? S.lastX : sx, S.hasLast ? S.lastZ : sz, 3); break;
      case HEARD.dog:
        if (tier > 2) break;
        if (dogs3) request(g, 'search', px, pz, 3);
        else { if (g.awareness < T.suspicious + 5) g.awareness = T.suspicious + 5; request(g, 'suspicious', px, pz, 1); }
        break;
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Mode updates.
  // ---------------------------------------------------------------------------------------------------

  function headSweep(g: GuardMind, amp: number, period: number) { g.headYaw = amp * Math.sin((2 * Math.PI * (S.t + g.index * 1.7)) / period); }
  function patrol(g: GuardMind) {
    const r = g.route!, node = r[g.routeI];
    if (g.act === 'phone') { stop(g); g.hasFace = true; return; }
    if (g.waiting) {
      stop(g);
      if (node.look != null) { g.faceYaw = node.look; g.hasFace = true; }
      g.act = node.act ?? null;
      if (!g.act) headSweep(g, 0.5, 5);
      if (S.t >= g.waitUntil) {
        g.waiting = false; g.act = null; g.headYaw = 0;
        if (g.loop === 'pingpong' && r.length > 1) {
          if (g.routeI + g.routeDir < 0 || g.routeI + g.routeDir >= r.length) g.routeDir = -g.routeDir;
          g.routeI += g.routeDir;
        } else g.routeI = (g.routeI + 1) % r.length;
        // A cautious guard pokes one hide spot near the start of every lap.
        if (g.routeI === 0 && g.cautious) {
          const h = nearestHide(g.x, g.z, T.searchHideR);
          if (h >= 0 && rng() < 0.5) { enter(g, 'investigate', hides[h].x, hides[h].z, 1); g.forceSpot = h; }
        }
      }
      return;
    }
    g.headYaw = 0;
    goTo(g, node.x, node.z, pace(g, T.pacePatrol));
    if (arrived(g)) {
      const w = node.wait;
      g.waiting = true; g.waitUntil = S.t + (w ? w[0] + (w[1] - w[0]) * rng() : 0.4 + 0.6 * rng());
      stop(g);
    }
  }
  function post(g: GuardMind) {
    const p = g.post!;
    if (dist2(g, p.x, p.z) > 0.5 * 0.5) { goTo(g, p.x, p.z, pace(g, T.pacePatrol)); g.headYaw = 0; return; }
    stop(g);
    if (g.act !== 'phone') { g.faceYaw = p.yaw; g.act = p.act; }
    g.hasFace = true;
    if (!g.act || g.act === 'phone' || g.act === 'smoke') headSweep(g, p.sweep, 8);
    else g.headYaw = 0;
  }
  function suspicious(g: GuardMind, dt: number) {
    stop(g); face(g, g.stimX, g.stimZ);
    g.headYaw *= 0.9;
    if (g.awareness < T.calm) g.calmFor += dt; else g.calmFor = 0;
    const age = S.t - g.since;
    if (g.pending && TIER[g.pending] >= 2) return;
    if (g.evidence >= 1 && age >= 1) { enter(g, 'investigate', g.stimX, g.stimZ, g.evidence); return; }
    if (g.seenFor >= T.persistent) { escalate(g); return; }
    if (g.calmFor >= T.calmFor || (age >= T.suspiciousGiveUp && g.awareness < T.suspicious)) calm(g, false);
  }
  function investigate(g: GuardMind) {
    switch (g.sub) {
      case 0:
        if (g.job === 'wake' || g.job === 'fix') goTo(g, g.stimX, g.stimZ, g.job === 'wake' ? T.paceRun : pace(g, T.paceInvestigate));
        if (arrived(g) || dist2(g, g.stimX, g.stimZ) < 1) {
          stop(g);
          if (g.job === 'wake') {
            const b = byId.get(g.jobRef);
            if (b && b.body === 'down') { g.sub = 4; g.subUntil = S.t + T.wakeTime; face(g, b.x, b.z); bark(g, 'wake', b.name, true); return; }
            g.job = ''; enter(g, 'search', g.stimX, g.stimZ, 3); return;
          }
          if (g.job === 'fix') { g.sub = 5; return; }
          g.sub = 1; g.subUntil = S.t + T.lookAround;
          g.lookUp = g.lit && rng() < T.lookUp;
        }
        break;
      case 1: {
        stop(g); headSweep(g, 1.05, 3);
        if (S.t < g.subUntil) break;
        g.headYaw = 0; g.lookUp = false;
        let h = g.forceSpot, p = h >= 0 ? T.searchSeenP : g.cautious ? T.hideCheckCautiousP : T.hideCheckP;
        if (h < 0) h = nearestHide(g.x, g.z, T.hideCheckNear);
        p += diff.hideCheck;
        if (h >= 0 && rng() < p) { g.sub = 2; g.checkSpot = h; goTo(g, hides[h].x, hides[h].z, pace(g, T.paceInvestigate)); break; }
        finishInvestigate(g);
        break;
      }
      case 2:
        if (arrived(g) || dist2(g, hides[g.checkSpot].x, hides[g.checkSpot].z) < 1.2 * 1.2) beginCheck(g, g.checkSpot);
        break;
      case 3:
        if (S.t >= g.subUntil) { if (!resolveCheck(g)) finishInvestigate(g); }
        break;
      case 4: {
        if (S.t < g.subUntil) break;
        const b = byId.get(g.jobRef);
        g.job = ''; g.jobRef = '';
        if (b) wake(b, true);
        enter(g, 'search', g.stimX, g.stimZ, 3);
        break;
      }
      case 5:
        stop(g);
        if (S.t >= g.jobAt) { powerRestore(g.jobRef); bark(g, 'fixed'); calm(g, true, ''); }
        break;
    }
  }
  function finishInvestigate(g: GuardMind) {
    g.forceSpot = -1;
    if (g.evidence >= 3) enter(g, 'search', g.stimX, g.stimZ, 3);
    else calm(g, g.evidence >= 2);
  }
  function search(g: GuardMind) {
    if (S.t >= g.searchUntil) {
      if (g.sub === 3) resolveCheck(g);
      if (g.mode !== 'search') return;
      bark(g, 'searchEnd', '', true); emit('searchEnd', g.id, '', g.x, g.z);
      calm(g, true, '');
      return;
    }
    switch (g.sub) {
      case 0: {
        if (g.ptsI >= g.ptsN && !assign(g)) {
          // Nothing left to share: wander near the centre.
          if (!g.hasGoal || arrived(g)) {
            const a = rng() * 2 * Math.PI, r = 3 + 5 * rng(), x = pts.cx + r * Math.sin(a), z = pts.cz + r * Math.cos(a);
            if (P.rayClear(pts.cx, 1, pts.cz, x, 1, z) > 0) { g.wanderX = x; g.wanderZ = z; goTo(g, x, z, pace(g, T.paceSearch)); }
            else goTo(g, pts.cx, pts.cz, pace(g, T.paceSearch));
          }
          break;
        }
        const p = g.pts[g.ptsI];
        goTo(g, pts.x[p], pts.z[p], pace(g, T.paceSearch));
        const h = pts.hide[p];
        const reach = h >= 0 ? 1.2 : 0.45;
        if (dist2(g, pts.x[p], pts.z[p]) <= reach * reach) {
          stop(g);
          pts.done[p] = 1;
          if (h >= 0 && g.hideChecks < T.searchMaxHides && rng() < (g.forceSpot === h ? T.searchSeenP : T.searchHideP) + diff.hideCheck) {
            g.ptsI++; beginCheck(g, h); break;
          }
          g.sub = 1; g.subUntil = S.t + T.searchLook; g.lookUp = g.lit && rng() < T.lookUp;
        }
        break;
      }
      case 1:
        stop(g); headSweep(g, 1.05, 2.5);
        if (S.t >= g.subUntil) { g.sub = 0; g.ptsI++; g.headYaw = 0; g.lookUp = false; }
        break;
      case 3:
        if (S.t >= g.subUntil) { if (!resolveCheck(g)) g.sub = 0; }
        break;
    }
  }
  function hold(g: GuardMind) {
    if (!arrived(g)) return;
    stop(g); headSweep(g, 1.1, 4);
    if (S.alarm < 2) calm(g, true, '');
  }
  function question(g: GuardMind) {
    if (!player.present || player.hiddenIn) { enter(g, 'investigate', g.lastX, g.lastZ, 2); return; }
    const d2 = dist2(g, player.x, player.z);
    if (!g.subUntil) {
      goTo(g, player.x, player.z, T.paceInvestigate);
      if (d2 <= T.questionR * T.questionR) {
        stop(g); face(g, player.x, player.z);
        g.subUntil = S.t + T.questionTime;
        bark(g, 'question', '', true);
        emit('question', g.id, '', g.x, g.z, g.bluffed ? 1 : 0, g.subUntil);
      } else if (S.t - g.since > 12) resolveQuestion(g, false);
      return;
    }
    face(g, player.x, player.z);
    if (S.t >= g.subUntil || d2 > T.questionLeave * T.questionLeave) resolveQuestion(g, false);
  }
  function resolveQuestion(g: GuardMind, ok: boolean) {
    ok = ok && !g.bluffed;
    emit('questioned', g.id, '', g.x, g.z, 0, 0, ok);
    if (ok) {
      g.bluffed = true; g.awareness = 20;
      S.coverIntegrity = Math.max(0, S.coverIntegrity - T.bluffCost);
      if (S.coverIntegrity <= 0) breakCover('bluffs');
      calm(g, false, 'bluffOk');
    } else {
      bark(g, 'bluffFail', '', true);
      remember(g, player.x, player.z);
      enter(g, 'alert', player.x, player.z, 3);
    }
  }
  function alertNext(g: GuardMind) {
    stop(g); face(g, g.lastX, g.lastZ);
    if (S.t - g.since < T.alertShout) return;
    if (g.kind === 'worker') { enter(g, 'flee', g.lastX, g.lastZ, 3); return; }
    if (g.radio && S.alarm < 2) { enter(g, 'radio', g.lastX, g.lastZ, 3); return; }
    if (S.alarm < 2 && alarmPoint(g) >= 0) { enter(g, 'raise', g.lastX, g.lastZ, 3); return; }
    enter(g, 'combat', g.lastX, g.lastZ, 3);
  }
  function radioCall(g: GuardMind) {
    stop(g); face(g, g.lastX, g.lastZ);
    if (S.t - g.lastSeenT > T.radioLos) { enter(g, 'combat', g.lastX, g.lastZ, 3); return; }
    if (S.t >= g.subUntil) { raiseAlarm(2, 'radio'); enter(g, 'combat', g.lastX, g.lastZ, 3); }
  }
  function raise(g: GuardMind) {
    const k = g.sub;
    if (k < 0 || k >= alarms.length || alarms[k].disabled) {
      enter(g, 'combat', g.lastX, g.lastZ, 3);
      return;
    }
    if (!g.subUntil) {
      if (!arrived(g)) return;
      stop(g); face(g, alarms[k].x, alarms[k].z);
      g.subUntil = S.t + T.raiseStrike;
      bus.emit('alarm', alarms[k].x, alarms[k].z, NOISE.arena, S.t, 1.5, g.id);
      return;
    }
    if (S.t >= g.subUntil) { raiseAlarm(2, 'keng'); enter(g, 'combat', g.lastX, g.lastZ, 3); }
  }
  function combat(g: GuardMind) {
    const seen = g.sight.gain > 0 && player.present;
    if (seen) { g.lastSeenT = S.t; S.sightT = S.t; S.contactT = S.t; if (S.alarm === 2) setAlarm(3, 'combat'); }
    if (S.t - g.lastSeenT > T.lostSight) {
      bark(g, 'lost', '', true);
      g.awareness = 70;
      enter(g, 'search', g.lastX, g.lastZ, 3);
      return;
    }
    const tx = seen ? player.x : g.lastX, tz = seen ? player.z : g.lastZ, d = Math.sqrt(dist2(g, tx, tz));
    const gun = g.weapon === 'pistol' || g.weapon === 'shotgun';
    if (gun) {
      if (d < T.gunMin && d > 1e-3) goTo(g, g.x - ((tx - g.x) / d) * 3, g.z - ((tz - g.z) / d) * 3, T.paceSearch);
      else if (d > T.gunMax || !seen) goTo(g, tx, tz, T.paceRun);
      else { stop(g); face(g, tx, tz); }
      if (seen && g.sight.f > 0.3 && S.t >= g.nextShot) {
        const hit = rng() < T.gunHit * (player.speed > T.tackleSpeed ? 0.7 : 1) * (player.stance === 'crouch' ? 0.85 : 1);
        g.nextShot = S.t + T.gunCooldown * (g.weapon === 'shotgun' ? 1.6 : 1);
        emit('shot', g.id, g.weapon, tx, tz, 0, g.weapon === 'shotgun' ? 2 * T.gunDamage : T.gunDamage, hit);
        bus.emit('gunshot', g.x, g.z, NOISE.gunshot, S.t, g.y + 1.4, g.id, tx, tz);
      }
      return;
    }
    goTo(g, tx, tz, T.paceRun);
    if (!seen) return;
    if (d < T.meleeReach) { stop(g); face(g, tx, tz); }
    if (d < T.meleeReach && S.t >= g.nextStrike) {
      g.nextStrike = S.t + T.meleeCooldown * (g.kind === 'boss' ? 1.3 : 1);
      emit('strike', g.id, g.weapon, tx, tz, g.kind === 'boss' ? 1 : 0, g.kind === 'boss' ? T.bossDamage : T.meleeDamage);
    } else if (g.kind !== 'boss' && d < T.tackleR && player.speed > T.tackleSpeed && S.t >= g.nextTackle) {
      g.nextTackle = S.t + T.tackleCooldown;
      emit('tackle', g.id, '', tx, tz);
    }
  }
  function flee(g: GuardMind) {
    if (!arrived(g)) return;
    stop(g);
    bark(g, 'flee', '', true);
    bus.emit('shout', g.x, g.z, NOISE.shout, S.t, g.y + 1.6, g.id, g.lastX, g.lastZ);
    raiseAlarm(1, 'witness');
    g.mode = 'post'; g.since = S.t; g.cautious = true; g.post = { x: g.x, z: g.z, yaw: g.yaw, sweep: 0.6, act: null };
  }
  function surrender(g: GuardMind, dt: number) {
    stop(g); face(g, player.x, player.z);
    g.aimLost = player.aiming && player.armed ? 0 : g.aimLost + dt;
    if (g.aimLost > T.surrenderDrop || dist2(g, player.x, player.z) > T.surrenderLeave * T.surrenderLeave) enter(g, 'flee', g.lastX, g.lastZ, 3);
  }
  function surrenderCheck(g: GuardMind) {
    if (!player.aiming || !player.armed || !player.present) { g.aimTested = false; return; }
    const tier = TIER[g.mode];
    if (g.aimTested || tier > 3 || g.mode === 'scripted' || g.kind === 'boss') return;
    const dx = g.x - player.x, dz = g.z - player.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > T.surrenderR || g.sight.cone < 1 || g.sight.f <= 0) return;
    if (Math.abs(wrap(Math.atan2(dx, dz) - player.aimYaw)) > 0.21) return;
    g.aimTested = true;
    remember(g, player.x, player.z);
    if (g.weapon !== 'none' && (g.kind === 'gunman' || rng() < 0.5)) { g.awareness = 100; enter(g, 'alert', player.x, player.z, 3); }
    else enter(g, 'surrender', player.x, player.z, 3);
  }

  function turn(g: GuardMind, yaw: number, dt: number) {
    const d = wrap(yaw - g.yaw), step = T.turnRate * dt;
    g.yaw = wrap(Math.abs(d) <= step ? yaw : g.yaw + Math.sign(d) * step);
  }
  /** Straight-line mover (tests, open yards); guards.ts supplies the nav-graph one. */
  function moveStraight(g: GuardMind, dt: number) {
    if (g.hasGoal && g.pace > 0) {
      const dx = g.goalX - g.x, dz = g.goalZ - g.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.3) {
        const step = Math.min(d, g.pace * dt);
        g.x += (dx / d) * step; g.z += (dz / d) * step; g.speed = g.pace;
        turn(g, Math.atan2(dx, dz), dt);
        return;
      }
    }
    g.speed = 0;
    if (g.hasFace) turn(g, g.faceYaw, dt);
  }
  const mover = opts.mover ?? moveStraight;

  function think(g: GuardMind, dt: number) {
    const t = S.t;
    if (TIER[g.mode] >= 9) {
      if (g.mode === 'grabbed' && g.job === 'fast' && t >= g.subUntil) { g.job = ''; knockOut(g, 'fast'); }
      else if (g.mode === 'down' && t >= g.wakeAt) wake(g, false);
      return;
    }
    if (g.act && t >= g.actUntil) { if (g.post && g.post.act === g.act) g.post.act = null; g.act = null; g.actUntil = Infinity; }
    if (t >= g.perceiveAt) perceive(g, g.mode !== 'scripted');
    if (!player.present) g.sight.gain = 0;
    integrate(g, dt);
    if (g.pending && t >= g.pendAt) enter(g, g.pending, g.pendX, g.pendZ, g.pendEv);
    thresholds(g);
    surrenderCheck(g);
    switch (g.mode) {
      case 'patrol': patrol(g); break;
      case 'post': post(g); break;
      case 'suspicious': suspicious(g, dt); break;
      case 'investigate': investigate(g); break;
      case 'question': question(g); break;
      case 'search': search(g); break;
      case 'hold': hold(g); break;
      case 'alert': alertNext(g); break;
      case 'radio': radioCall(g); break;
      case 'raise': raise(g); break;
      case 'combat': combat(g); break;
      case 'flee': flee(g); break;
      case 'surrender': surrender(g, dt); break;
      default: break;
    }
    if (g.mode !== 'surrender' && g.mode !== 'scripted' && TIER[g.mode] < 9) g.lit = g.flashlight === 'on' || (g.flashlight === 'night' && (P.env.night > 0.5 || S.alarm >= 1));
    else if (TIER[g.mode] >= 9) g.lit = false;
    if (t < g.lookUntil && TIER[g.mode] < 4) g.headYaw = Math.max(-1.3, Math.min(1.3, wrap(g.lookYaw - g.yaw)));
    mover(g, dt);
    if (light && g.lightSlot >= 0) {
      if (g.lit) light.spot(g.lightSlot, g.x, g.y + 1.3, g.z, g.yaw + g.headYaw, g.lookUp ? 0.5 : -0.12, T.beamHalf, T.beamRange, 0.9, true);
      else light.off(g.lightSlot);
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Cameras, searchlights, dogs, power.
  // ---------------------------------------------------------------------------------------------------

  function monitored(c: CameraState) {
    if (c.spec.monitoredBy === 'room') return S.roomManned;
    const g = byId.get(c.spec.monitoredBy);
    return !!g && conscious(g) && TIER[g.mode] <= 1;
  }
  function nearestFree(x: number, z: number, maxTier: number) {
    let best: GuardMind | null = null, bd = Infinity;
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (!conscious(g) || TIER[g.mode] > maxTier || g.mode === 'scripted' || g.job) continue;
      const d = dist2(g, x, z);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  function camerasUpdate() {
    for (let i = 0; i < cameras.length; i++) {
      const c = cameras[i];
      if (S.t < c.perceiveAt) continue;
      const dt = Math.min(0.5, S.t - c.perceivedAt);
      c.perceivedAt = S.t; c.perceiveAt = S.t + T.perceiveEvery;
      if (!c.on || S.t < c.loopUntil || !player.present) { c.meter = Math.max(0, c.meter - T.cameraDecay * dt); c.blink = false; continue; }
      const sp = c.spec, v = c.viewer;
      v.yaw = c.yaw0 + (sp.sweep ?? 0) * Math.sin((2 * Math.PI * S.t) / (sp.period ?? 10));
      P.see(v, player, c.sight);
      if (c.sight.gain > 0) c.meter += c.sight.gain * T.cameraGain * diff.detection * dt;
      else c.meter = Math.max(0, c.meter - T.cameraDecay * dt);
      c.blink = c.meter > 0;
      if (c.meter < 100) continue;
      c.meter = 0;
      if (!monitored(c)) continue;
      c.hits++;
      S.hasLast = true; S.lastX = player.x; S.lastZ = player.z;
      emit('cameraSpotted', c.id, sp.monitoredBy, player.x, player.z, c.hits);
      if (c.hits === 1) {
        raiseAlarm(1, 'camera');
        const g = nearestFree(player.x, player.z, 1);
        if (g) { remember(g, player.x, player.z); request(g, 'investigate', player.x, player.z, 3); }
      } else raiseAlarm(2, 'camera');
    }
  }
  function searchlightsUpdate(dt: number) {
    for (let i = 0; i < searchlights.length; i++) {
      const s = searchlights[i], sp = s.spec, op = byId.get(sp.operator), active = !!op && conscious(op);
      if (active) s.yaw = sp.yaw + (sp.sweep ?? 0) * Math.sin((2 * Math.PI * S.t) / (sp.period ?? 12));
      s.frozen = !active;
      const pitch = sp.pitch ?? -0.35, half = sp.angle ?? 0.14, range = sp.range ?? 45;
      if (light && s.slot >= 0) light.spot(s.slot, sp.x, sp.y, sp.z, s.yaw, pitch, half, range, sp.k ?? 1.2, true);
      s.inBeam = false;
      if (!active || !player.present || !(player.mult > 0)) continue;
      const cp = Math.cos(pitch);
      const c = spotAt(sp.x, sp.y, sp.z, Math.sin(s.yaw) * cp, Math.sin(pitch), Math.cos(s.yaw) * cp, Math.cos(half), range, 1, player.x, player.y + 1, player.z);
      if (!(c > 0.05)) continue;
      const f = P.rayClear(sp.x, sp.y, sp.z, player.x, player.y + 1, player.z);
      if (!(f > 0)) continue;
      s.inBeam = true;
      const o = op!;
      if (TIER[o.mode] >= 4) { o.lastSeenT = S.t; remember(o, player.x, player.z); continue; }
      o.awareness = Math.min(100, o.awareness + T.base * T.searchlightGain * f * Math.min(1, c) * player.mult * diff.detection * dt);
      o.lastSeenT = S.t; remember(o, player.x, player.z);
    }
  }
  function dogsUpdate() {
    if (!player.present) return;
    for (let i = 0; i < dogs.length; i++) {
      const d = dogs[i];
      if (S.t < d.fedUntil || S.t < d.barkAt || player.concealment === 'spot' || player.concealment === 'dive') continue;
      const dx = player.x - d.x, dz = player.z - d.z, r = Math.sqrt(dx * dx + dz * dz);
      const near = r < T.dogAny || (r < (player.stance === 'crouch' ? T.dogCrouch : T.dogStand) && P.rayClear(d.x, 0.5, d.z, player.x, player.y + 0.5, player.z) > 0);
      if (!near) continue;
      d.barkAt = S.t + T.dogEvery;
      if (r > 1e-3) d.yaw = Math.atan2(dx, dz);
      emit('dogBark', d.id, '', player.x, player.z);
      bus.emit('dog', d.x, d.z, NOISE.dog, S.t, 0.5, d.id, player.x, player.z);
    }
  }
  function powerRestore(group: string, silent = false) {
    if (!cuts.has(group)) return;
    cuts.delete(group);
    if (light) light.setGroup(group, true);
    for (let i = 0; i < cameras.length; i++) if (cameras[i].spec.group === group && !cameras[i].destroyed) cameras[i].on = true;
    if (!silent) emit('fixed', '', group);
  }

  // ---------------------------------------------------------------------------------------------------
  // Radio net.
  // ---------------------------------------------------------------------------------------------------

  function nextRosterIndex(from: number) {
    for (let i = from; i < guards.length; i++) if (guards[i].radio) return i;
    return -1;
  }
  function radioNext() { net.i = nextRosterIndex(net.i + 1); net.phase = 0; net.at = S.t + T.radioGap; net.bluffAsked = false; net.answer = 0; }
  function radioMiss(g: GuardMind) {
    emit('radioMissed', g.id, '', g.x, g.z);
    bark(null, 'radioMissed', g.name);
    raiseAlarm(1, 'radio');
    const node = g.route ? g.route[g.routeI] : g.post;
    const x = node ? node.x : g.x, z = node ? node.z : g.z;
    const o = nearestFree(x, z, 1);
    if (o) { o.job = 'radio'; o.jobRef = g.id; request(o, 'investigate', x, z, 3); }
  }
  function radioUpdate() {
    if (!net.on) return;
    const t = S.t;
    if (net.i < 0) {
      if (t < net.nextRound) return;
      net.i = nextRosterIndex(0); net.phase = 0; net.at = t; net.bluffAsked = false; net.answer = 0;
      if (net.i < 0) { net.nextRound = t + net.every; return; }
    }
    if (net.i >= guards.length) { net.i = -1; net.nextRound = t + net.every; return; }
    const g = guards[net.i];
    if (net.phase === 0) {
      if (t < net.at) return;
      emit('radioCall', g.id, g.name, g.x, g.z);
      bark(null, 'radioBase', g.name);
      net.phase = 1; net.at = t + T.radioReply; net.deadline = t + net.grace;
      return;
    }
    if (conscious(g) && g.mode !== 'grabbed') {
      if (t < net.at) return;
      emit('radioReply', g.id, g.radioReply, g.x, g.z);
      radioNext();
    } else {
      if (g.radioLooted && !net.bluffAsked) { net.bluffAsked = true; emit('radioBluff', g.id, g.name, g.x, g.z, 0, t + T.radioBluff); }
      if (net.answer === 1) { emit('radioBluffResult', g.id, '', g.x, g.z, 0, 0, true); radioNext(); }
      else if (net.answer === 2) {
        emit('radioBluffResult', g.id, '', g.x, g.z, 0, 0, false);
        bark(null, 'radioStranger');
        raiseAlarm(1, 'radioBluff');
        const node = g.route ? g.route[g.routeI] : g.post, x = node ? node.x : g.x, z = node ? node.z : g.z;
        const o = nearestFree(x, z, 1);
        if (o) { o.job = 'radio'; o.jobRef = g.id; request(o, 'investigate', x, z, 3); }
        radioNext();
      } else if (t >= net.deadline) { radioMiss(g); radioNext(); }
    }
    if (net.i < 0) net.nextRound = t + net.every;
  }

  // ---------------------------------------------------------------------------------------------------
  // Social cover.
  // ---------------------------------------------------------------------------------------------------

  function breakCover(reason: string) {
    if (!S.coverOk) return;
    S.coverOk = false; S.coverIntegrity = 0;
    emit('coverBroken', '', reason, player.x, player.z);
  }
  function coverUpdate(dt: number) {
    if (!player.present || !player.cover || !S.coverOk) { S.loiterT = 0; return; }
    let seenBy: GuardMind | null = null;
    for (let i = 0; i < guards.length; i++) if (guards[i].sight.gain > 0 && TIER[guards[i].mode] <= 3) { seenBy = guards[i]; break; }
    if (seenBy && (player.armed || player.carrying)) { breakCover(player.armed ? 'weapon' : 'carrying'); return; }
    const odd = player.climbing || player.stance === 'crouch' || player.speed >= T.runSpeed;
    if (seenBy && odd) {
      S.coverIntegrity = Math.max(0, S.coverIntegrity - T.coverDrain * dt);
      if (S.coverIntegrity <= 0) { breakCover('acting'); return; }
    }
    const staff = player.zone === 'staff' || player.zone === 'restricted';
    const away = !(player.coverX === player.coverX) || (player.x - player.coverX) ** 2 + (player.z - player.coverZ) ** 2 > T.loiterR * T.loiterR;
    S.loiterT = staff && away ? S.loiterT + dt : Math.max(0, S.loiterT - dt);
    if (S.loiterT > T.loiter && seenBy && TIER[seenBy.mode] <= 1) {
      S.loiterT = 0;
      remember(seenBy, player.x, player.z);
      request(seenBy, seenBy.bluffed ? 'alert' : 'question', player.x, player.z, 2);
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Frame.
  // ---------------------------------------------------------------------------------------------------

  function update(dt: number, t: number, pl: PlayerState) {
    if (S.paused) { S.t = t; return eventCount; }
    S.t = t;
    player = pl;
    searchlightsUpdate(dt);
    // Flashlights were aimed at the end of last frame; the player's light includes them.
    P.prepare(pl, S.coverOk);
    if (pl.present && pl.hiddenIn && pl.hiddenIn !== S.hiddenPrev) {
      // Seen climbing in: 'Nó chui vô thùng rồi!' and a near-certain check of that spot.
      let h = -1;
      for (let k = 0; k < hides.length; k++) if (hides[k].id === pl.hiddenIn) h = k;
      for (let i = 0; h >= 0 && i < guards.length; i++) {
        const g = guards[i];
        if (!conscious(g) || t - g.lastSeenT > 0.35 || g.mode === 'scripted') continue;
        bark(g, 'hideSeen', '', true);
        remember(g, hides[h].x, hides[h].z);
        g.forceSpot = h;
        if (TIER[g.mode] < 4) request(g, 'investigate', hides[h].x, hides[h].z, 3);
      }
    }
    S.hiddenPrev = pl.present ? pl.hiddenIn : '';
    hearAll();
    for (let i = 0; i < guards.length; i++) think(guards[i], dt);
    camerasUpdate();
    dogsUpdate();
    radioUpdate();
    coverUpdate(dt);
    alarmUpdate();
    return eventCount;
  }

  // ---------------------------------------------------------------------------------------------------
  // Takedowns and the chokehold.
  // ---------------------------------------------------------------------------------------------------

  /** A takedown is possible: conscious, not alert/combat (radio and raise can still be cut short), not a boss unless
   * stunned; 0.5-1.7 m away on the same level; the player in the rear 130° arc, or > 70° off his facing while he is
   * busy with an act or a phone; or he has surrendered. */
  function canTakedown(g: GuardMind | null | undefined, px: number, py: number, pz: number) {
    if (!rules.takedowns || !g || TIER[g.mode] >= 9) return false;
    if (g.mode === 'alert' || g.mode === 'combat') return false;
    if (g.kind === 'boss' && !(g.stunnedUntil > S.t)) return false;
    const dx = px - g.x, dz = pz - g.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < T.takedownMin || d > T.takedownMax || Math.abs(py - g.y) >= T.takedownDy) return false;
    if (g.mode === 'surrender') return true;
    const c = (Math.sin(g.yaw) * dx + Math.cos(g.yaw) * dz) / d;
    const angle = Math.acos(Math.max(-1, Math.min(1, c)));
    return angle > (DISTRACTED(g.act) ? T.distractedArc : T.rearArc);
  }
  /** Starts a takedown: the guard is grabbed; any guard watching the player goes for the alert. A fast takedown knocks
   * out after the 0.75 s impact of its paired clip and makes a 6 m noise; a chokehold waits for choke(). */
  function takedown(g: GuardMind, kind: 'fast' | 'choke', px = player.x, pz = player.z) {
    if (TIER[g.mode] >= 9 || (kind === 'choke' && !g.chokeable)) return false;
    releasePoints(g);
    g.mode = 'grabbed'; g.since = S.t; g.pending = ''; g.job = kind === 'fast' ? 'fast' : ''; g.subUntil = S.t + 0.75; stop(g);
    emit('takedown', g.id, kind, g.x, g.z);
    for (let i = 0; i < guards.length; i++) {
      const o = guards[i];
      if (o === g || !conscious(o) || o.mode === 'scripted' || !(o.sight.gain > 0) || o.sight.cone <= 0) continue;
      remember(o, px, pz);
      bark(o, 'witness', g.name, true);
      emit('witness', o.id, g.id, px, pz);
      request(o, 'alert', px, pz, 3);
    }
    if (kind === 'fast') bus.emit('takedown', g.x, g.z, NOISE.takedown, S.t, g.y + 1, 'player');
    else bark(g, 'choke', '', true);
    return true;
  }
  /** One frame of a chokehold on g (the controller from createChoke); emits struggle noise and resolves the outcome. */
  function choke(g: GuardMind, ch: Choke, dt: number, holding: boolean) {
    if (g.mode !== 'grabbed') return 'escape' as ChokeOutcome;
    const out = ch.step(dt, holding);
    if (ch.noise) bus.emit('struggle', g.x, g.z, NOISE.struggle, S.t, g.y + 1, 'player');
    if (out !== 'hold') resolveChoke(g, out);
    return out;
  }
  function resolveChoke(g: GuardMind, out: ChokeOutcome) {
    if (g.mode !== 'grabbed') return;
    if (out === 'ko') { knockOut(g, 'choke'); return; }
    if (out === 'slip') {
      stats.slips++;
      emit('slip', g.id, '', g.x, g.z);
      bus.emit('slip', g.x, g.z, NOISE.slip, S.t, g.y + 1, 'player');
      knockOut(g, 'slip');
      return;
    }
    if (out === 'escape') {
      g.mode = g.route ? 'patrol' : 'post'; g.health = Math.max(1, g.health);
      emit('escape', g.id, '', g.x, g.z, 0, T.chokeEscapeDamage);
      bus.emit('shout', g.x, g.z, NOISE.chokeEscape, S.t, g.y + 1.6, g.id, player.x, player.z);
      remember(g, player.x, player.z);
      enter(g, 'alert', player.x, player.z, 3);
    }
  }
  /** Damage with a cause: non-lethal causes knock out at 0 health (and only they ever touch a downed body softly);
   * lethal ones kill and count in LƯƠNG TÂM. A conscious guard who is hurt and survives goes for the alert. */
  function damage(g: GuardMind, amount: number, cause: DamageCause) {
    if (g.body === 'dead') return;
    const lethal = LETHAL[cause];
    if (g.body !== 'none') { if (lethal) kill(g, cause); return; }
    g.health -= amount;
    if (g.health <= 0) { if (g.mode === 'grabbed') g.mode = 'post'; if (lethal) kill(g, cause); else knockOut(g, 'beaten'); return; }
    if (cause === 'throw' && TIER[g.mode] < 4) { g.stunnedUntil = S.t + 1; request(g, 'search', player.x, player.z, 3); return; }
    if (TIER[g.mode] < 4 && g.mode !== 'grabbed') { remember(g, player.x, player.z); request(g, 'alert', player.x, player.z, 3, true); }
  }

  // ---------------------------------------------------------------------------------------------------
  // Snapshot.
  // ---------------------------------------------------------------------------------------------------

  function snapshot() {
    return {
      v: 1, t: S.t, alarm: S.alarm, alarmAt: fin(S.alarmAt), contactT: fin(S.contactT), sightT: fin(S.sightT),
      reinforceAt: fin(S.reinforceAt), reinforceI: S.reinforceI, hasLast: S.hasLast, lastX: S.lastX, lastZ: S.lastZ,
      coverOk: S.coverOk, coverIntegrity: S.coverIntegrity, loiterT: S.loiterT, roomManned: S.roomManned,
      stats: { ...stats }, pranks: Array.from(pranks, fin), dogRing: Array.from(dogRing, fin),
      net: { nextRound: fin(net.nextRound), i: net.i, every: net.every, grace: net.grace },
      cuts: Array.from(cuts, ([group, c]) => ({ group, x: c.x, z: c.z })),
      alarmsDisabled: alarms.filter((a) => a.disabled).map((a) => a.id),
      rng: typeof seeded.state === 'number' ? seeded.state : null,
      guards: guards.map((g) => ({
        id: g.id, x: g.x, y: g.y, z: g.z, yaw: g.yaw, mode: g.mode === 'grabbed' ? 'down' : g.mode, since: fin(g.since),
        awareness: g.awareness, cautious: g.cautious, detected: g.detected, health: g.health, body: g.body, hidden: g.hidden, hiddenIn: g.hiddenIn,
        found: g.found, wakeAt: fin(g.wakeAt), routeI: g.routeI, routeDir: g.routeDir, bluffed: g.bluffed, radioLooted: g.radioLooted,
        hasLast: g.hasLast, lastX: g.lastX, lastZ: g.lastZ, stimX: g.stimX, stimZ: g.stimZ, evidence: g.evidence, searchUntil: fin(g.searchUntil),
        job: g.job === 'fast' ? '' : g.job, jobRef: g.jobRef, jobAt: fin(g.jobAt), act: g.act, actUntil: fin(g.actUntil), radio: g.radio,
      })),
      cameras: cameras.map((c) => ({ id: c.id, on: c.on, destroyed: c.destroyed, loopUntil: fin(c.loopUntil), hits: c.hits, yaw0: c.yaw0 })),
      dogs: dogs.map((d) => ({ id: d.id, fedUntil: fin(d.fedUntil) })),
    };
  }
  type Snapshot = ReturnType<typeof snapshot>;
  function restore(s: Snapshot) {
    S.t = s.t; S.alarm = s.alarm as AlarmLevel; S.alarmAt = s.alarmAt; S.contactT = s.contactT; S.sightT = s.sightT;
    S.reinforceAt = s.reinforceAt; S.reinforceI = s.reinforceI; S.hasLast = s.hasLast; S.lastX = s.lastX; S.lastZ = s.lastZ;
    S.coverOk = s.coverOk; S.coverIntegrity = s.coverIntegrity; S.loiterT = s.loiterT; S.roomManned = s.roomManned;
    S.noiseRead = bus.seq; S.hiddenPrev = '';
    Object.assign(stats, s.stats);
    for (let i = 0; i < 3; i++) { pranks[i] = s.pranks[i]; dogRing[i] = s.dogRing[i]; }
    net.nextRound = s.net.nextRound; net.i = s.net.i; net.every = s.net.every; net.grace = s.net.grace;
    net.phase = 0; net.at = S.t; net.bluffAsked = false; net.answer = 0;
    for (const [group] of cuts) powerRestore(group, true);
    for (const c of s.cuts) powerCut(c.group, c.x, c.z, false);
    for (const a of alarms) a.disabled = s.alarmsDisabled.includes(a.id);
    if (s.rng !== null && typeof seeded.state === 'number') seeded.state = s.rng;
    pts.valid = false;
    for (const r of s.guards) {
      const g = byId.get(r.id);
      if (!g) continue;
      releasePoints(g);
      g.x = r.x; g.y = r.y; g.z = r.z; g.yaw = r.yaw; g.mode = r.mode as GuardMode; g.since = r.since; g.sub = 0; g.subUntil = 0; g.pending = '';
      g.awareness = r.awareness; g.cautious = r.cautious; g.detected = r.detected; g.health = r.health; g.body = r.body as BodyState;
      g.hidden = r.hidden; g.hiddenIn = r.hiddenIn; g.found = r.found; g.wakeAt = r.wakeAt; g.routeI = r.routeI; g.routeDir = r.routeDir;
      g.bluffed = r.bluffed; g.radioLooted = r.radioLooted; g.hasLast = r.hasLast; g.lastX = r.lastX; g.lastZ = r.lastZ;
      g.stimX = r.stimX; g.stimZ = r.stimZ; g.evidence = r.evidence; g.searchUntil = r.searchUntil; g.job = r.job as GuardJob; g.jobRef = r.jobRef;
      g.jobAt = r.jobAt; g.act = r.act as GuardAct | null; g.actUntil = r.actUntil; g.radio = r.radio;
      g.waiting = false; g.hasGoal = false; g.headYaw = 0; g.sight.gain = 0; g.bodyMeter = 0; g.checkSpot = -1; g.forceSpot = -1;
      g.lastSeenT = -Infinity; g.perceiveAt = S.t + (g.index % 6) / 60; g.perceivedAt = S.t;
      if (g.mode === 'question') g.mode = 'investigate';
      if (g.mode === 'investigate' || g.mode === 'hold') goTo(g, g.stimX, g.stimZ, T.paceInvestigate);
    }
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (g.mode !== 'search') continue;
      const until = g.searchUntil;
      startSearch(g, g.stimX, g.stimZ);
      g.searchUntil = until;
    }
    for (const r of s.cameras) { const c = cameras.find((q) => q.id === r.id); if (c) { c.on = r.on; c.destroyed = r.destroyed; c.loopUntil = r.loopUntil; c.hits = r.hits; c.yaw0 = r.yaw0; c.meter = 0; } }
    for (const r of s.dogs) { const d = dogs.find((q) => q.id === r.id); if (d) d.fedUntil = r.fedUntil; }
  }

  function powerCut(group: string, x: number, z: number, notice = true) {
    if (cuts.has(group)) return false;
    cuts.set(group, { x, z, noticed: false });
    if (light) light.setGroup(group, false);
    for (let i = 0; i < cameras.length; i++) if (cameras[i].spec.group === group) cameras[i].on = false;
    if (!notice) return true;
    let witness: GuardMind | null = null, bd = T.lightsOutR * T.lightsOutR;
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (!conscious(g) || g.mode === 'scripted') continue;
      const d = dist2(g, x, z);
      if (d < bd) { bd = d; witness = g; }
    }
    if (!witness) return true;
    cuts.get(group)!.noticed = true;
    bark(witness, 'lightsOut', '', true);
    emit('lightsOut', witness.id, group, x, z);
    if (rules.lightsOutAlarm) raiseAlarm(1, 'lightsOut');
    const fixer = nearestFree(x, z, 1);
    if (fixer) { fixer.job = 'fix'; fixer.jobRef = group; fixer.jobAt = S.t + T.fixTime; request(fixer, 'investigate', x, z, 1); }
    return true;
  }

  // ---------------------------------------------------------------------------------------------------
  // API.
  // ---------------------------------------------------------------------------------------------------

  const brain = {
    guards: guards as readonly GuardMind[], stats, rules, events: events as readonly BrainEvent[],
    get eventCount() { return eventCount; },
    clearEvents() { eventCount = 0; },
    get alarm() { return S.alarm; },
    /** The LƯƠNG TÂM record of this arena: ghost = never detected, untouched = no knockouts and no bodies found. */
    conscience() { return { ...stats, ghost: stats.detections === 0, untouched: stats.knockouts === 0 && stats.bodiesFound === 0 }; },
    get coverIntegrity() { return S.coverIntegrity; },
    get coverOk() { return S.coverOk; },
    get lastKnown() { return S.hasLast ? { x: S.lastX, z: S.lastZ } : null; },
    get time() { return S.t; },
    setDifficulty(d: Difficulty) { diff = DIFFICULTY[d]; P.env.noise = diff.noise; net.grace = opts.radio?.grace ?? diff.radioGrace; },
    get difficulty() { return diff; },
    pause(on: boolean) { S.paused = on; },
    update,
    addGuard,
    guard: (id: string) => byId.get(id) ?? null,
    /** Removes a guard from play (despawned, or handed to a cutscene for good). */
    remove(id: string) {
      const g = byId.get(id);
      if (!g) return;
      releasePoints(g);
      if (light && g.lightSlot >= 0) light.release(g.lightSlot);
      g.mode = 'dead'; g.body = 'dead'; g.hidden = true; g.found = true; g.radio = false;
    },
    request, enter, calm, raiseAlarm,
    alarmLevel: () => S.alarm,
    /** Reinforcements arrive in this many seconds, or -1. */
    reinforceIn: () => (S.reinforceAt === Infinity ? -1 : Math.max(0, S.reinforceAt - S.t)),
    detection(): Detection {
      let best = 0;
      for (let i = 0; i < guards.length; i++) {
        const g = guards[i], tier = TIER[g.mode];
        if (tier >= 9 || g.mode === 'scripted') continue;
        const k = tier === 5 ? 4 : tier === 4 ? 3 : tier === 3 ? 2 : tier >= 1 ? 1 : 0;
        if (k > best) best = k;
      }
      return best === 4 ? 'combat' : best === 3 ? 'detected' : best === 2 ? 'searching' : best === 1 ? 'suspected' : 'hidden';
    },
    /** Highest awareness of a conscious guard (heartbeat, chevron colours). */
    strongest() {
      let a = 0;
      for (let i = 0; i < guards.length; i++) if (TIER[guards[i].mode] < 9 && guards[i].awareness > a) a = guards[i].awareness;
      return a;
    },
    // Commands for missions (GuardHandle in stealth.ts).
    goTo, face, stop,
    setRoute(g: GuardMind, route: readonly PatrolNode[] | null, loop: 'loop' | 'pingpong' = 'loop') { g.route = route && route.length ? route : null; g.loop = loop; g.routeI = 0; g.routeDir = 1; g.waiting = false; if (TIER[g.mode] === 0 && g.mode !== 'scripted') g.mode = g.route ? 'patrol' : 'post'; },
    setPost(g: GuardMind, p: GuardSpec['post'] | null) { g.post = p ? { x: p.x, z: p.z, yaw: p.yaw, sweep: p.sweep ?? 40 * (Math.PI / 180), act: p.act ?? null } : null; if (TIER[g.mode] === 0 && g.mode !== 'scripted' && !g.route && !g.post) g.post = { x: g.x, z: g.z, yaw: g.yaw, sweep: 0.7, act: null }; },
    /** An idle act for `seconds` (Infinity: until changed); only unaware guards keep acts. */
    act(g: GuardMind, a: GuardAct | null, seconds = Infinity) { g.act = a; g.actUntil = a ? S.t + seconds : Infinity; if (g.post && !g.route) g.post.act = a; },
    /** The burner-phone distraction: he answers, stands still facing away for `seconds`. */
    callPhone(g: GuardMind, seconds = 9) {
      if (TIER[g.mode] !== 0 || g.mode === 'scripted') return false;
      g.act = 'phone'; g.actUntil = S.t + seconds;
      g.faceYaw = player.present ? Math.atan2(g.x - player.x, g.z - player.z) : g.yaw; g.hasFace = true;
      bus.emit('phone', g.x, g.z, NOISE.phone * 0.3, S.t, g.y + 1, g.id);
      return true;
    },
    /** Scripted mode: the brain stops driving him (perception keeps filling awareness and reports 'detected'). */
    script(g: GuardMind, on: boolean) {
      if (on) { releasePoints(g); g.mode = 'scripted'; g.pending = ''; stop(g); }
      else if (g.mode === 'scripted') calm(g, false, '');
    },
    deaf(g: GuardMind, on: boolean) { g.deaf = on; },
    /** Puts him on alert toward (x, z) (default: the player). */
    alert(g: GuardMind, x = player.x, z = player.z) { remember(g, x, z); g.awareness = 100; request(g, 'alert', x, z, 3, true); },
    canTakedown, takedown, choke, resolveChoke, knockOut, damage, kill,
    /** Ties a downed guard (zip ties): he never wakes. */
    tie(g: GuardMind) { if (g.body !== 'down') return false; g.body = 'tied'; g.mode = 'tied'; g.wakeAt = Infinity; return true; },
    /** Loots a body; returns whether a radio was taken (enables the radio bluff for his roll call). */
    loot(g: GuardMind) { if (g.body === 'none') return false; const had = g.radio && !g.radioLooted; if (had) g.radioLooted = true; return had; },
    /** Moves a body (drag, ragdoll settle); clears 'hidden'. */
    moveBody(g: GuardMind, x: number, y: number, z: number) { if (g.body === 'none') return; g.x = x; g.y = y; g.z = z; g.hidden = false; g.hiddenIn = ''; g.bodyLAt = -Infinity; },
    /** Hides a body in a spot that accepts bodies: undiscoverable unless that spot is checked. */
    hideBody(g: GuardMind, spotId: string) { if (g.body === 'none') return false; g.hidden = true; g.hiddenIn = spotId; return true; },
    /** Wakes a downed guard now (scripts). */
    wake(g: GuardMind) { wake(g, false); },
    /** The spot a guard is checking (the 1.2 s lid window: the ambush prompt), or ''. */
    checking(g: GuardMind) { return g.sub === 3 && g.checkSpot >= 0 && (g.mode === 'search' || g.mode === 'investigate') ? hides[g.checkSpot].id : ''; },
    /** Answer to the open QUESTION from guard g: a fitting option keeps the cover once per guard. */
    answer(g: GuardMind, ok: boolean) { if (g.mode !== 'question' || !g.subUntil) return false; resolveQuestion(g, ok); return true; },
    /** Resets the social cover (a new disguise or errand). */
    resetCover() { S.coverOk = true; S.coverIntegrity = 100; S.loiterT = 0; },
    breakCover,
    /** The radio roll call reply for a silent guard whose radio the player holds: the overheard line passes, any other
     * line gives 'Giọng ai lạ vậy?' and alarm 1, null is silence (missed after the grace). */
    answerRadio(id: string, line: string | null) {
      if (!net.on || net.i < 0 || net.phase !== 1 || guards[net.i].id !== id || !net.bluffAsked) return false;
      net.answer = line === null ? 0 : line === guards[net.i].radioReply ? 1 : 2;
      return true;
    },
    /** Seconds until guard id's next roll call ('Bộ đàm gọi sau 0:42'), or -1 without a radio net. */
    radioCountdown(id: string) {
      const g = byId.get(id);
      if (!net.on || !g || !g.radio) return -1;
      const per = T.radioGap + T.radioReply;
      if (net.i >= 0 && net.i <= g.index) {
        let k = 0;
        for (let i = net.i; i < g.index; i++) if (guards[i].radio) k++;
        return Math.max(0, (net.phase === 0 ? net.at - S.t : 0) + k * per);
      }
      let k = 0;
      for (let i = 0; i < g.index; i++) if (guards[i].radio) k++;
      return Math.max(0, net.nextRound - S.t) + k * per;
    },
    // Arena devices.
    addCamera(spec: CameraSpec) {
      const v = cameraViewer(createViewer(), spec.fov ?? T.cameraFov, spec.range ?? T.cameraRange);
      v.x = spec.x; v.y = spec.y; v.z = spec.z; v.yaw = spec.yaw; v.vision = 1;
      const c: CameraState = { id: spec.id, spec, yaw0: spec.yaw, on: true, destroyed: false, loopUntil: -Infinity, meter: 0, hits: 0, blink: false, viewer: v, sight: createSight(), perceiveAt: S.t, perceivedAt: S.t };
      cameras.push(c);
      return c;
    },
    camera: (id: string) => cameras.find((c) => c.id === id) ?? null,
    /** The 'Ghi đè' loop hack: cameras see nothing until t + seconds. */
    loopCameras(seconds: number) { for (let i = 0; i < cameras.length; i++) cameras[i].loopUntil = S.t + seconds; },
    /** A shot-out camera: off for good, a 60 m noise and alarm 1. */
    destroyCamera(id: string) {
      const c = cameras.find((q) => q.id === id);
      if (!c || !c.on) return false;
      c.on = false; c.destroyed = true;
      bus.emit('gunshot', c.spec.x, c.spec.z, NOISE.gunshot, S.t, c.spec.y, 'player');
      raiseAlarm(1, 'camera');
      return true;
    },
    setRoomManned(on: boolean) { S.roomManned = on; },
    addSearchlight(spec: SearchlightSpec) {
      const s: SearchlightState = { id: spec.id, spec, yaw: spec.yaw, slot: light ? light.alloc() : -1, frozen: false, inBeam: false };
      searchlights.push(s);
      return s;
    },
    searchlight: (id: string) => searchlights.find((s) => s.id === id) ?? null,
    addDog(spec: DogSpec) { const d: DogState = { id: spec.id, x: spec.x, z: spec.z, yaw: spec.yaw ?? 0, barkAt: 0, fedUntil: -Infinity }; dogs.push(d); return d; },
    /** Thrown xíu mại: the dog eats for 20 s. Dogs are never harmed by stealth tools. */
    feedDog(id: string) { const d = dogs.find((q) => q.id === id); if (d) d.fedUntil = S.t + T.dogFood; return !!d; },
    /** A fuse box: its light group and cameras go dark; a guard who notices barks, raises alarm 1 (rules) and sends the
     * nearest free guard to fix it in 45 s. */
    powerCut,
    powerRestore,
    /** 'Nhấn E để tháo dùi kẻng': that alarm point can no longer be struck. */
    disableAlarmPoint(id: string) { const a = alarms.find((q) => q.id === id); if (a) a.disabled = true; return !!a; },
    /** How visible target tg (prepared with perception.prepare) is to guard g right now: the sight gain per second. */
    sees(g: GuardMind, tg: Target, out: Sight = createSight()) { if (!conscious(g)) { out.gain = 0; return out; } syncViewer(g); return P.see(g.viewer, tg, out); },
    snapshot,
    restore,
  };
  return brain;
}

// ---------------------------------------------------------------------------------------------------------
// The chokehold minigame (§5 KHÓA CỔ), pure.
// ---------------------------------------------------------------------------------------------------------

export type ChokeOutcome = 'hold' | 'ko' | 'escape' | 'slip';
export type Choke = ReturnType<typeof createChoke>;
/**
 * Pressure p in [0, 1]: holding E raises it 0.55/s, letting go drops it 0.7/s; the guard's struggle pushes it -0.18
 * (pushing free) or +0.12 (flailing) every 0.6-1.1 s, weaker as he fades. Every 0.75 s inside the green band counts
 * one ("Một… hai… ba… bốn… năm"); five counts and he goes limp ('ko'). Below 0.25 for 0.8 s he escapes. Above the band
 * 'Nhẹ thôi!' flashes and strain builds (forgiven at 0.5/s when back in the band); 1.6 s of strain is a slip: he
 * thrashes and goes down hard with an 8 m noise and wakes early. Never a death. `auto` ('Khóa cổ tự động') holds the
 * band centre while E is held.
 */
export function createChoke(rng: () => number, band: readonly [number, number] = [0.45, 0.75], auto = false) {
  const c = {
    p: 0.3, count: 0, inBand: 0, over: 0, under: 0, time: 0, nextImpulse: 0, noiseAt: T.chokeNoiseEvery,
    lo: band[0], hi: band[1], auto, outcome: 'hold' as ChokeOutcome,
    /** Squeezing above the band this frame ('Nhẹ thôi!'). */
    tooHard: false,
    /** A struggle noise is due this frame. */
    noise: false,
    /** Seconds spent in band and over it (the c3-m3 grade). */
    bandTime: 0, overTime: 0,
    step(dt: number, holding: boolean): ChokeOutcome {
      c.noise = false;
      if (c.outcome !== 'hold') return c.outcome;
      c.time += dt;
      if (c.auto && holding) {
        const mid = (c.lo + c.hi) / 2;
        c.p += Math.max(-1.5 * dt, Math.min(1.5 * dt, mid - c.p));
      } else c.p += (holding ? T.chokeUp : -T.chokeDown) * dt;
      if (c.time >= c.nextImpulse) {
        const amp = Math.max(0.2, (T.chokeCounts - c.count) / T.chokeCounts), r = rng();
        if (!(c.auto && holding)) c.p += (r < 0.55 ? T.chokePush : T.chokeFlail) * amp;
        c.nextImpulse = c.time + T.chokeImpulse[0] + (T.chokeImpulse[1] - T.chokeImpulse[0]) * rng();
      }
      c.p = Math.max(0, Math.min(1, c.p));
      c.tooHard = c.p > c.hi;
      if (c.p >= c.lo && c.p <= c.hi) {
        c.inBand += dt; c.bandTime += dt;
        while (c.inBand >= T.chokeCount) { c.inBand -= T.chokeCount; c.count++; }
        if (c.count >= T.chokeCounts) return (c.outcome = 'ko');
      }
      if (c.tooHard) {
        c.over += dt; c.overTime += dt;
        if (c.over >= T.chokeOver) return (c.outcome = 'slip');
      } else c.over = Math.max(0, c.over - T.chokeOverForgive * dt);
      if (c.p < T.chokeUnder) { c.under += dt; if (c.under >= T.chokeUnderFor) return (c.outcome = 'escape'); } else c.under = 0;
      if (c.time >= c.noiseAt) { c.noiseAt += T.chokeNoiseEvery; c.noise = true; }
      return 'hold';
    },
  };
  c.nextImpulse = T.chokeImpulse[0] + (T.chokeImpulse[1] - T.chokeImpulse[0]) * rng();
  return c;
}
