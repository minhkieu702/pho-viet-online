/**
 * Story campaign schema for "PHỐ VIỆT: SEN TRONG BÙN" (pure types, no three.js/DOM). Content is data: chapters
 * hold missions, missions hold steps (beats); a step runs its `enter` actions, then waits for `done` while its
 * fail rules, branches, watchers and optional objectives are checked every tick. Conditions (`Cond`) observe;
 * actions (`Act`) change things. Kinds the runner evaluates itself (flags, vars, events, timers, evidence,
 * conscience…) never reach the engine; world conditions go to `StoryPort.test` and engine actions to
 * `StoryPort.exec` (see runner.ts). Text is a `TextRef`: Vietnamese literal, or '@key' looked up in the
 * chapter text tables, with `{name}` interpolation from mission vars then flags (`{name:dong}` formats
 * thousands of đồng as '1.350.000đ', `{@key}` inserts a text-table entry such as a brand name).
 * Places are `PlaceRef`s the engine resolves: a site 'id' or 'id.spot' (story/sites.ts sitePlaces(), the
 * places table), a name from a chapter's `places`, 'space/spawn' inside a walkable space, or {x, z}.
 * Brands come from the text tables ({@app} → ĐơnƠi, order codes {@code}-04xx, the ring {@ring}, {@bank}).
 */

export type Id = string;
export type TextRef = string;
export type Flag = boolean | number | string;
export type Op = '==' | '!=' | '<' | '<=' | '>' | '>=';
export type Difficulty = 'de' | 'thuong' | 'kho';
export type PlaceRef = string | { x: number; z: number; y?: number; yaw?: number };
/** Lifetime of things the engine spawns or the runner shows: removed when the step ends, the mission ends… */
export type Scope = 'step' | 'mission' | 'chapter' | 'hub';
export type RetryMode = 'checkpoint' | 'step' | 'mission';

// ---- Events the engine pushes into the runner (runner.event) ------------------------------------------

export type EventType =
  // interaction and detective work
  | 'interact' | 'photo' | 'record' | 'examine' | 'pickup' | 'deliver' | 'clue'
  // stealth (stealth.ts / director); cause and tag ride along for LƯƠNG TÂM
  | 'suspicious' | 'detected' | 'alarm' | 'bodyFound' | 'coverBlown' | 'takedown' | 'knockout' | 'kill'
  | 'restrain' | 'hurt' | 'gunfire' | 'noise'
  // helpers started by actions: tails, chases, eavesdrops, escorts, rides; 'climb' when a climb link (InteractSpec
  // kind 'climb', the spaces-lane ClimbLink of the same id) has carried the player to its far end (climbDone)
  | 'spotted' | 'lost' | 'arrived' | 'caught' | 'escaped' | 'eavesdrop' | 'rescued' | 'ride' | 'alight' | 'climb'
  // presentation results (also latched when a blocking action resolves)
  | 'dialogue' | 'cutscene' | 'call' | 'choice' | 'deduce' | 'board' | 'link' | 'interrogation' | 'overlay'
  // runner-made: timers, evidence, player down, spaces, generic script signals
  | 'timer' | 'evidence' | 'down' | 'space' | 'signal';

/**
 * A flat record so conditions can match any field: {type:'knockout', id:'guard-2', tag:'guard', cause:'choke'}.
 * While a cutscene holds the world (runner view().cinematic, StoryHooks.cinematic) the runner drops the perception
 * and helper events of CINE_MUTED (runner.ts): guards and tails are suspended under a cutscene, so a 'lost' or
 * 'spotted' that still arrives then can never fail the step.
 */
export type StoryEvent = { type: EventType; id?: string; tag?: string; [field: string]: Flag | undefined };

// ---- Conditions --------------------------------------------------------------------------------------

export type StatName = 'knockouts' | 'kills' | 'restrained' | 'civiliansHurt' | 'detections' | 'alarms' | 'retries' | 'skipped';

/** Conditions the runner evaluates itself. */
export type CoreCond =
  | { k: 'all'; of: Cond[] } | { k: 'any'; of: Cond[] } | { k: 'not'; c: Cond } | { k: 'always' } | { k: 'never' }
  /** Progress flag: truthy by default; `eq` compares, `op` compares numbers. Missing flags read false/0. */
  | { k: 'flag'; name: string; eq?: Flag; op?: Op }
  /** Mission variable (reset per mission, restored with checkpoints). */
  | { k: 'var'; name: string; op: Op; value: Flag }
  | { k: 'evidence'; id: string } | { k: 'item'; id: string; n?: number } | { k: 'ability'; id: string }
  | { k: 'done'; mission: string } | { k: 'seen'; cutscene: string }
  | { k: 'solved'; board: string } | { k: 'deduced'; id: string; firstTry?: boolean }
  | { k: 'difficulty'; is: Difficulty }
  /** LƯƠNG TÂM and stealth counters for this mission (default) or the whole campaign. */
  | { k: 'stat'; name: StatName; op: Op; value: number; scope?: 'mission' | 'campaign' }
  /** Campaign conscience tier: 'clean' (no kills, nobody innocent hurt), 'stained' (1–3), 'lost' (4+). */
  | { k: 'conscience'; is: ConscienceTier }
  /** Seconds since the step started running (after its enter actions) / since the mission started. */
  | { k: 'after'; seconds: number } | { k: 'missionTime'; op: Op; seconds: number }
  /** `c` held true without a break for `seconds` (stake-outs, "stay in range"). Resets on step entry. */
  | { k: 'hold'; c: Cond; seconds: number }
  /** Latched events since the step began (default) or the mission began; at least `n` (default 1) matching. */
  | { k: 'on'; ev: EventType; id?: string; tag?: string; where?: Record<string, Flag>; n?: number; scope?: 'step' | 'mission' }
  /** All required subs of the current step are done. */
  | { k: 'subs' };

/** World conditions, answered by the engine through StoryPort.test (positions, actors, stealth, meters). */
export type WorldCond =
  /** `level`: the surface the player stands on (SpacePort.level(): 'roof', 'deck'…; null is the ground); omitted, any. */
  | { k: 'reach'; at: PlaceRef; r?: number; mode?: 'foot' | 'bike' | 'car' | 'vehicle' | 'boat' | 'swim' | 'any'; space?: string; level?: string | null }
  | { k: 'area'; area: string; inside?: boolean }
  | { k: 'mode'; is: 'foot' | 'bike' | 'car' | 'boat' | 'swim' | 'passenger' | 'seated' }
  | { k: 'space'; id: string | null }
  | { k: 'player'; prop: 'health' | 'wanted' | 'speed' | 'visibility' | 'noise'; op: Op; value: number }
  | { k: 'stance'; is: 'crouch' | 'stand' | 'hidden' | 'cover' }
  | { k: 'carrying'; item: string }
  | { k: 'down'; kind?: 'wasted' | 'busted' }
  | { k: 'hour'; from: number; to: number }
  | { k: 'actor'; id: string; state?: ActorState; at?: PlaceRef; r?: number; sees?: boolean; down?: boolean }
  | { k: 'vehicle'; id: string; state?: VehicleState; at?: PlaceRef; r?: number }
  | { k: 'near'; a: string; b: string; r: number }
  /** Engine meter by id (tail suspicion 'tail:van-51d', eavesdrop progress 'eavesdrop:vip', panic, breath…). */
  | { k: 'meter'; id: string; op: Op; value: number }
  | { k: 'alarm'; op: Op; level: number }
  /** Escape hatch for a director query that has no schema yet: {k:'q', name:'lightsOut', args:{area:'strip'}}. */
  | { k: 'q'; name: string; args?: Record<string, unknown> };

export type Cond = CoreCond | WorldCond;

export type ActorState = 'idle' | 'patrol' | 'goto' | 'follow' | 'escort' | 'drive' | 'act' | 'suspicious' | 'search'
  | 'alert' | 'combat' | 'flee' | 'surrender' | 'captive' | 'freed' | 'ko' | 'restrained' | 'carried' | 'dead' | 'arrived';
export type VehicleState = 'parked' | 'driving' | 'stopped' | 'fleeing' | 'arrived' | 'wrecked';
export type ConscienceTier = 'clean' | 'stained' | 'lost';

// ---- Actions -----------------------------------------------------------------------------------------

export type Voice = 'say' | 'shout' | 'whisper' | 'think' | 'phone' | 'radio' | 'narrate';
/** One line of dialogue; `if` lines are kept only when their condition holds (choice consequences). */
export type Line = { who: string; text: TextRef; if?: Cond; voice?: Voice; dur?: number; /** Display name, added by the runner from the cast. */ name?: string };
export type ChoiceOption = { id: string; text: TextRef; if?: Cond; set?: Record<string, Flag>; then?: Act[] };
/** Same union as app/story-ui ChoiceStyle. */
export type ChoiceStyle = 'scene' | 'sms' | 'plate' | 'bluff';
export type Behaviour =
  | { k: 'idle' } | { k: 'goto'; at: PlaceRef; run?: boolean } | { k: 'patrol'; route: string | PlaceRef[]; waits?: number[] }
  | { k: 'follow'; target: string; dist?: number } | { k: 'escort'; leader: string } | { k: 'guard'; post: PlaceRef; sweep?: number }
  | { k: 'act'; name: string } | { k: 'flee' } | { k: 'surrender' } | { k: 'captive' };
export type MarkerStyle = 'go' | 'talk' | 'subtle' | 'enemy' | 'none';
export type MarkerSpec = { id?: string; at: PlaceRef; label?: TextRef; style?: MarkerStyle; r?: number };
/**
 * A story entry for the interaction registry (interact.ts): the engine shows the prompt, runs the tap or the
 * hold (`hold` seconds) and pushes {type:'interact', id}. `once` (default true) removes it after use.
 * Story entries outrank street interactions (C5 "missions win"). `level` limits the prompt to a surface (a roof
 * prompt never shows on the ground below it; omitted, any level).
 * kind 'climb' is one registry entry for the spaces-lane ClimbLink with the same id (spaces-surfaces-levelkit.md
 * §3.3, §7.4): the link moves the player from `at` to `to` and pushes {type:'climb', id} at the end (climbDone);
 * steps wait for that event, never for a separate prompt. Until the level kit has the link, the session's stub
 * fades and teleports the player to `to` (with its level) and pushes the same event.
 */
export type InteractSpec = {
  id: string; at: PlaceRef; r?: number; prompt: TextRef; verb?: TextRef; hold?: number; once?: boolean;
  when?: 'foot' | 'ride' | 'any' | 'water'; kind?: 'talk' | 'use' | 'examine' | 'pick' | 'enter' | 'climb' | 'hide' | 'seat';
  crime?: 0 | 1 | 2 | 3; level?: string | null;
  /** kind 'climb': the far end of the link. */
  to?: PlaceRef;
};
export type SubDef = { id: string; text: TextRef; done: Cond; optional?: boolean };
/** HUD meter: value from the engine (`StoryPort.test` is not used; the director fills it) or from a numeric flag. */
export type MeterSpec = { id: string; label: TextRef; kind?: 'bar' | 'band' | 'count'; max?: number; flag?: string };

/** Actions the runner performs itself. */
export type CoreAct =
  | { k: 'wait'; seconds: number }
  | { k: 'waitFor'; c: Cond; timeout?: number }
  | { k: 'goto'; step: string }
  | { k: 'complete' }
  | { k: 'fail'; reason: TextRef; retry?: RetryMode }
  | { k: 'if'; c: Cond; then: Act[]; else?: Act[] }
  /** Run in the background (does not block); step-scoped unless started by a mission watcher. */
  | { k: 'parallel'; acts: Act[] }
  /** Seeded pick of one branch (deterministic per save). */
  | { k: 'oneOf'; acts: Act[][] }
  /** Ask the save layer for an autosave now (outside checkpoints). */
  | { k: 'save' }
  | { k: 'flag'; name: string; value?: Flag } | { k: 'inc'; name: string; by?: number }
  | { k: 'var'; name: string; value?: Flag; inc?: number }
  | { k: 'evidence'; id: string } | { k: 'journal'; id: string }
  | { k: 'give'; item: string; n?: number } | { k: 'take'; item: string; n?: number }
  | { k: 'unlock'; ability?: string; outfit?: string; label?: TextRef }
  | { k: 'cash'; n: number } | { k: 'score'; n: number } | { k: 'hintToken'; n: number }
  /** Move up to `n` (thousand đồng) from the story wallet into the SỔ NỢ debt. */
  | { k: 'payDebt'; n: number }
  | { k: 'lunar'; day: number; month?: number }
  | { k: 'objective'; text: TextRef; subs?: SubDef[] }
  | ({ k: 'marker'; id: string; scope?: Scope } & MarkerSpec) | { k: 'unmark'; id: string }
  | ({ k: 'interactable'; scope?: Scope } & InteractSpec) | { k: 'uninteract'; id: string }
  /** Countdown on the HUD. On expiry: fail with `fail`, else latch {type:'timer', id}. Paused during cinematics. */
  | { k: 'timer'; id: string; seconds: number; label?: TextRef; fail?: TextRef; scope?: Scope } | { k: 'stopTimer'; id: string }
  /** Sessions run by the runner and drawn by the story UI; they block until finished. */
  | { k: 'board'; id: string; until?: 'solved' | 'closed' }
  | { k: 'deduce'; id: string; q?: QuestionDef }
  | { k: 'interrogate'; id: string }
  /**
   * Choice panel (engine shows it, resolves with the option id); option `set`/`then` apply; `timeout` picks `default`.
   * `style` is how the story UI draws it (app/story-ui ChoiceStyle): plain buttons, SMS reply bubbles, licence
   * plates, or a guard's bluff question; default 'scene'.
   */
  | { k: 'choice'; id: string; prompt?: TextRef; options: ChoiceOption[]; timeout?: number; default?: string; style?: ChoiceStyle };

/** Actions the engine performs (StoryPort.exec). Starred kinds block the queue until resolved. */
export type EngineAct =
  | { k: 'cutscene'; id: string } // *
  | { k: 'dialogue'; id: string; lines: Line[]; mode?: 'blocking' | 'ambient' } // * unless ambient
  | { k: 'call'; id: string; from: string; lines: Line[]; ring?: boolean; burner?: boolean; canDecline?: boolean } // *
  | { k: 'sms'; from: string; text: TextRef; burner?: boolean }
  | { k: 'bark'; actor: string; text: TextRef; shout?: boolean }
  | { k: 'title'; kind: 'chapter' | 'time' | 'place'; text: TextRef; sub?: TextRef; ms?: number } // *
  | { k: 'fade'; to: 'black' | 'clear' | 'dip'; ms?: number } // *
  | { k: 'hint'; text: TextRef; ms?: number } | { k: 'toast'; text: TextRef }
  | { k: 'sting'; id: string } | { k: 'music'; id: string | null; level?: number } | { k: 'letterbox'; on: boolean }
  | { k: 'teleport'; at: PlaceRef; yaw?: number; vehicle?: string } // *
  | { k: 'player'; outfit?: string; stance?: 'stand' | 'crouch'; lock?: string[] | null; pose?: string | null; carry?: string | null; headlight?: boolean; cover?: string | null }
  | { k: 'spawn'; id: string; cast?: string; template?: string; at: PlaceRef; yaw?: number; scope?: Scope; team?: 'ally' | 'neutral' | 'hostile' | 'victim'; behaviour?: Behaviour; tags?: string[]; weapon?: string; flashlight?: boolean }
  | { k: 'despawn'; id?: string; tag?: string }
  | { k: 'behave'; id: string; b: Behaviour }
  | { k: 'vehicle'; id: string; model?: string; at?: PlaceRef; yaw?: number; route?: string | PlaceRef[]; cruise?: number; obeyLights?: boolean; state?: 'park' | 'drive' | 'stop' | 'flee'; driver?: string; scope?: Scope }
  | { k: 'prop'; id: string; kind?: string; at?: PlaceRef; yaw?: number; variant?: string; remove?: boolean; scope?: Scope }
  /** Walkable spaces (sets, off-map rooms). enter/leave are blocking transitions. */
  | { k: 'space'; enter?: string; leave?: PlaceRef | true; link?: string; variant?: { id: string; v: string } } // * enter/leave
  | { k: 'world'; policy: WorldPolicy }
  | { k: 'time'; hour: number } | { k: 'weather'; set: string; lock?: boolean }
  | { k: 'police'; force?: number; reset?: boolean }
  | { k: 'photoTarget'; id: string; subject: string | PlaceRef; evidence?: string; minFrac?: number; minQuality?: number; scope?: Scope }
  | { k: 'clue'; id: string; at: PlaceRef; r?: number; evidence: string; examine?: string; scope?: Scope }
  /**
   * Vehicle or on-foot tail: engine meters 'tail:<target>' and events 'spotted'/'lost'/'arrived' with id = target.
   * The helper suspends its lose clock and its spotted test while a cutscene holds the world (StoryHooks.cinematic).
   */
  | { k: 'tail'; target: string; band: [number, number]; lose: { far: number; seconds: number }; mirror?: boolean; headlight?: boolean; onFoot?: boolean; knownFace?: boolean }
  /** Eavesdrop zone: meter 'eavesdrop:<id>', lines revealed by progress, event {type:'eavesdrop', id} when full. */
  | { k: 'eavesdrop'; id: string; source: string | PlaceRef; r: number; seconds: number; requireHidden?: boolean; lines: Line[] }
  /** Stealth arena and rules (story-system-stealth.md): load/unload, rules patch, social cover. */
  | { k: 'stealth'; arena?: string | null; variant?: string; rules?: Record<string, unknown>; cover?: string | null }
  /** Ride transit or a xe ôm through the passenger API; events 'ride'/'alight' with id = stop. */
  | { k: 'ride'; mode: 'bus' | 'waterbus' | 'ferry' | 'xeom'; line?: string; to?: PlaceRef; driver?: string }
  /** Stop a helper (tail, eavesdrop, photo target, clue) by id. */
  | { k: 'stop'; id: string }
  /** Escape hatch for engine operations without a schema yet; `wait` makes it blocking. */
  | { k: 'do'; op: string; args?: Record<string, unknown>; wait?: boolean };

export type Act = CoreAct | EngineAct;
/** The choice panel as the engine receives it (texts resolved, options filtered by `if`). */
export type ChoicePanel = { k: 'choice'; id: string; prompt: string; options: { id: string; text: string }[]; timeout?: number; style: ChoiceStyle };
/** Everything StoryPort.exec can receive. */
export type ExecAct = EngineAct | ChoicePanel;

// ---- Missions, steps, chapters -----------------------------------------------------------------------

export type FailDef = {
  when: Cond; reason: TextRef;
  /** Soft: no fail card; dip, run the step's `retry` acts and re-enter the step (tutorial beats). */
  soft?: boolean;
  retry?: RetryMode;
  /** After this many fails of the same step the fail card offers 'Bỏ qua đoạn này'. */
  allowSkipAfter?: number;
  skipTo?: string;
};
export type BranchDef = { when: Cond; goto: string; do?: Act[] };
export type Watcher = { id?: string; when: Cond; do: Act[]; once?: boolean; cooldown?: number };
export type OptionalDef = { id: string; text: TextRef; when: Cond; reward?: Act[] };

export type StepDef = {
  id: string;
  objective?: TextRef; subs?: SubDef[];
  marker?: MarkerSpec | MarkerSpec[];
  interact?: InteractSpec[];
  /**
   * A checkpoint: the runner snapshots its state on entry, then runs `setup` and `enter`. Retrying restores the
   * snapshot after the engine despawns mission things, so `setup` must rebuild everything the following steps
   * need (spawns are idempotent by id) up to the next checkpoint.
   */
  checkpoint?: boolean | { label?: TextRef; setup?: Act[] };
  enter?: Act[];
  /** Acts before re-entering after a soft fail or a step retry (put the player back, calm the dog). */
  retry?: Act[];
  /** Completion. Missing: all required subs when there are subs, else as soon as `enter` finishes. */
  done?: Cond;
  fail?: FailDef[]; branch?: BranchDef[]; watchers?: Watcher[]; optional?: OptionalDef[];
  /** Next step id or 'end'; default the next step in order (the last step ends the mission). */
  next?: string;
  exit?: Act[];
  /** Sugar for a step-scoped timer that starts when the step runs. */
  timer?: { seconds: number; label?: TextRef; fail?: TextRef };
  meters?: MeterSpec[];
  hud?: { light?: boolean; noise?: boolean; cover?: boolean };
  world?: WorldPolicy;
  skipTo?: string;
  minutes?: number;
};

export type WorldPolicy = {
  traffic?: 'normal' | 'light' | 'night' | 'off'; crowd?: 'normal' | 'thin' | 'night' | 'off';
  police?: 'normal' | 'story' | 'suppressed' | { force: number }; maxWanted?: number; gangs?: 'normal' | 'calm';
  clock?: { hour?: number; freeze?: boolean; rate?: number }; weather?: { set?: string; lock?: boolean };
  /** Named areas (places table) where traffic spawns, NPC POIs and nav are blocked. */
  exclusions?: string[];
  activities?: Partial<Record<'gunStore' | 'bank' | 'deck' | 'boatRental' | 'sideJobs' | 'orders' | 'transit', boolean>>;
  leash?: { area: string; warnAt?: number; failAt?: number; reason?: TextRef };
};

export type MissionDef = {
  id: string;
  /** Overrides of the index metadata (content/index.ts is the source of truth for titles and order). */
  title?: TextRef;
  /** Hub metadata set from the chapter file (start hours, giver initial, prerequisites); merged into the catalog index. */
  meta?: Partial<Pick<MissionMeta, 'requires' | 'when' | 'hours' | 'giver'>>;
  /** Mission to start right after this one completes (continuous nights such as c2-m1 → c2-m2). */
  chain?: string;
  /** Fresh start only: where and when the mission begins. */
  start?: { at?: PlaceRef; yaw?: number; vehicle?: string; outfit?: string; hour?: number; weather?: string; lunar?: number; space?: string };
  world?: WorldPolicy;
  /** Acts on a fresh start and before every checkpoint restore (mission-wide spawns). Must not move the player. */
  setup?: Act[];
  steps: StepDef[];
  watchers?: Watcher[]; fail?: FailDef[]; optional?: OptionalDef[];
  /** Player down fails the mission ('Tín đã gục.' / 'Tín bị bắt.') unless allowed (hospital wake-up beats). */
  allowDown?: boolean;
  /** 'fail': any kill ends the mission. Non-lethal causes never count as kills (flags.ts). */
  lethal?: 'allow' | 'fail'; lethalReason?: TextRef;
  medals?: { par?: number; ghost?: boolean; clues?: string[] };
  /** Applied on completion (core acts; engine acts are passed through without blocking). */
  rewards?: Act[];
  /** What a standalone replay needs on top of the chapter-start progress. */
  replay?: { flags?: Record<string, Flag>; items?: Record<string, number>; evidence?: string[]; abilities?: string[] };
  cast?: string[]; spaces?: string[];
};

export type ChapterMeta = {
  n: number; id: string; title: string; summary?: string;
  lunar: { month: number; day: number };
  card?: { text: string; sub?: string };
  missions: MissionMeta[];
};
export type MissionMeta = {
  id: string; title: string; minutes: number;
  /** Prerequisite missions; default the previous mission in campaign order. */
  requires?: string[];
  /** Extra gate on progress flags. */
  when?: Cond;
  /** Start window in game hours [from, to) (wraps past midnight); outside it the blip says when it opens. */
  hours?: [number, number];
  giver?: string;
};
/**
 * `text`: campaign-wide constants every chapter inserts with {@key} (brands: {@app} → ĐơnƠi, {@code}, {@ring}, {@bank}); they load
 * with the index, so a catalog holding only chapter 5 still resolves them.
 */
export type CampaignIndex = { id: string; title: string; chapters: ChapterMeta[]; text?: Record<string, string> };

// ---- Catalog data (evidence, cast, boards, interrogations) --------------------------------------------

export type EvidenceKind = 'photo' | 'object' | 'document' | 'testimony' | 'recording' | 'call-log' | 'person' | 'place';
export type EvidenceDef = { id: string; title: TextRef; kind: EvidenceKind; text: TextRef; art?: { icon: string; big?: string }; chapter?: number; tags?: string[] };
export type JournalDef = { id: string; tab: 'people' | 'places' | 'diary' | 'notes'; title: TextRef; text: TextRef; if?: Cond };
export type CastDef = {
  id: string; name: TextRef; role?: TextRef;
  /** Wardrobe / figure preset id (figures.ts createHeroFigure, wardrobe.ts) or an inline spec the director reads. */
  look?: string | Record<string, unknown>;
  voice?: { pitch?: number; rate?: number }; portrait?: { bg: string; initials: string };
};
/** `level`: the walkable surface the place is on ('roof', 'deck'), absent on the ground (sites.ts Spot.level). */
export type PlaceDef = { x: number; z: number; y?: number; yaw?: number; space?: string; r?: number; level?: string };

/** A card on BẢNG MANH MỐI: an evidence id (shown once owned) or a free node such as a question or a person. */
export type BoardCard = { id: string; needs?: string | null; label?: TextRef; slot?: number };
/** A claim proven by picking cards: all of `needs`, none of `against`. */
export type HypothesisDef = { id: string; text: TextRef; needs: string[]; against?: string[]; hint?: TextRef };
export type BoardDef = {
  id: string; title: TextRef; cards: BoardCard[];
  /** The correct strings (undirected). */
  links: [string, string][];
  hypotheses?: HypothesisDef[];
  /** Question opened when every link is in place (QuestionDef id). */
  question?: string;
  /** Applied once when solved (flags, journal, evidence…). */
  reveals?: Act[];
};
export type QuestionDef = {
  id: string; prompt: TextRef;
  options: { id: string; text: TextRef; needs?: string[] }[];
  answer: string;
  /** Hint tokens a wrong answer costs (default 1; 0 for gentle quizzes). Never a fail. */
  cost?: number;
  hint?: TextRef; onCorrect?: Act[];
};
export type StatementDef = {
  id: string; text: TextRef;
  /** 'lie': settle by presenting a contradicting card. 'true': settle with understanding (empathy), never accusation. */
  kind: 'lie' | 'true';
  /** Cards that settle it (contradiction for a lie, understanding for a truth). */
  cards: string[];
  /** The subject's answer once settled. */
  reply: TextRef;
  /** Line on a wrong card or a wrong approach. */
  wrong?: TextRef;
  /** Pressing ("Nói rõ hơn đi") adds a line, may point at a card or unlock a hidden statement. */
  press?: { text: TextRef; hint?: string; unlocks?: string };
  /** A bluff settles this lie once pressure ≥ this (0..1). Omitted: bluffs fail here. */
  bluff?: number;
  hidden?: boolean;
  set?: Record<string, Flag>;
};
export type InterrogationDef = {
  id: string; subject: string; title?: TextRef;
  statements: StatementDef[];
  /** Seconds the subject goes silent after a wrong card (default 4) or a called bluff (default 8). */
  shutdown?: number; bluffShutdown?: number;
  /** Applied when every statement is settled (flags, evidence, journal…). */
  done?: Act[];
};

/** What a chapter content module exports as `chapter` (content/chNN.ts). */
export type ChapterModule = {
  chapter: number; missions: MissionDef[];
  evidence?: EvidenceDef[]; journal?: JournalDef[]; cast?: CastDef[]; places?: Record<string, PlaceDef>;
  boards?: BoardDef[]; questions?: QuestionDef[]; interrogations?: InterrogationDef[];
  /** '@key' text table and `{@key}` constants (brand names live here so a rename is one line). */
  text?: Record<string, string>;
};
/** Merged, loaded content (runner.ts buildCatalog). */
export type Catalog = {
  index: CampaignIndex;
  missions: Map<string, MissionDef>; meta: Map<string, MissionMeta & { chapter: number; order: number }>;
  evidence: Map<string, EvidenceDef>; journal: Map<string, JournalDef>; cast: Map<string, CastDef>;
  places: Map<string, PlaceDef>; boards: Map<string, BoardDef>; questions: Map<string, QuestionDef>;
  interrogations: Map<string, InterrogationDef>; text: Map<string, string>;
};

// ---- Long-lived progress (saved) ---------------------------------------------------------------------

export type Conscience = { knockouts: number; kills: number; restrained: number; civiliansHurt: number; byCause: Record<string, number> };
export type MissionStats = Conscience & { detections: number; alarms: number; retries: number; skipped: number; seconds: number; optional: string[] };
export type Medal = { grade: 'A' | 'B' | 'C' | 'D'; ghost: boolean; nonLethal: boolean; fast: boolean; eye: boolean; bestSeconds: number; plays: number };
export type BoardProgress = { links: string[]; solved: string[]; proven: string[]; hinted: string[]; wrong: number; streak: number };
export type Progress = {
  completed: string[]; medals: Record<string, Medal>;
  flags: Record<string, Flag>; evidence: string[]; journal: string[];
  items: Record<string, number>; abilities: string[]; outfits: string[];
  cash: number; score: number; hintTokens: number;
  conscience: Conscience;
  board: BoardProgress;
  deductions: Record<string, { answer: string; tries: number }>;
  interrogations: Record<string, { wrong: number; bluffs: number; empathy: number; trust: number }>;
  seen: string[];
  lunar: { month: number; day: number };
  /** Highest chapter reached and the progress at the start of each chapter (for replay). */
  chapter: number; chapterStarts: Record<string, Progress>;
  debt: { paid: number; total: number };
  playSeconds: number; difficulty: Difficulty;
};

// ---- Runner I/O --------------------------------------------------------------------------------------

export type ExecCtx = { mission: string; step: string; restoring: boolean; seen?: boolean };
/**
 * What the runner needs from the engine (the director implements it on top of host.ts).
 * - test: answer a WorldCond now.
 * - exec: perform an EngineAct or show a ChoicePanel (texts already resolved, dialogue lines filtered, `name`
 *   added from the cast). For a blocking act return true and later call runner.resolve(handle, result) (it may
 *   be called from inside exec); return false/void when it is already done. Spawns are idempotent by id.
 *   Choice panels resolve with the option id; calls may resolve with 'declined'.
 * - cancel: a pending blocking act was abandoned (step change, fail, restore, choice timeout).
 * - reset: despawn things of that scope: 'step' (step ended), 'checkpoint'/'mission' (before a restore or a
 *   fresh start: everything mission-scoped, police reset, fade), 'end' (mission over: hub policy back,
 *   clock/weather locks released).
 * - emit: UI events for the story HUD and overlays.
 */
export interface StoryPort {
  test(c: WorldCond): boolean;
  exec(a: ExecAct, handle: number, ctx: ExecCtx): boolean | void;
  cancel?(handle: number): void;
  reset(scope: 'step' | 'checkpoint' | 'mission' | 'end'): void;
  emit(e: StoryOut): void;
}

export type Grade = { score: number; grade: Medal['grade']; ghost: boolean; nonLethal: boolean; fast: boolean; eye: boolean; tokens: number };
export type StoryOut =
  | { type: 'mission'; id: string; title: string; chapter: number; restoring: boolean }
  | { type: 'objective'; text: string }
  | { type: 'checkpoint'; step: string; label: string }
  | { type: 'save'; reason: 'checkpoint' | 'complete' | 'manual' }
  | { type: 'evidence'; id: string; title: string }
  | { type: 'journal'; id: string; title: string }
  | { type: 'unlock'; ability?: string; outfit?: string; label: string }
  | { type: 'optional'; id: string; text: string }
  | { type: 'fail'; reason: string; soft: boolean; canSkip: boolean }
  | { type: 'complete'; id: string; stats: MissionStats; result: Grade; replay: boolean; chain: string | null; chapterUnlocked: number | null }
  | { type: 'chapter'; n: number; title: string; card?: { text: string; sub?: string } }
  | { type: 'session'; kind: 'board' | 'deduce' | 'interrogate'; id: string; open: boolean; view: unknown }
  | { type: 'toast'; text: string };

export type ViewTimer = { id: string; label: string; left: number };
/** Compact HUD state (Hud.story is built from it). `rev` changes whenever anything here changes. */
export type StoryView = {
  rev: number; mission: string | null; title: string; chapter: number; step: string | null;
  phase: 'idle' | 'enter' | 'run' | 'exit' | 'failed' | 'done';
  cinematic: boolean; objective: string;
  subs: { id: string; text: string; done: boolean; optional: boolean }[];
  markers: (MarkerSpec & { id: string; label?: string })[];
  interacts: (InteractSpec & { prompt: string })[];
  timers: ViewTimer[];
  meters: { id: string; label: string; kind: 'bar' | 'band' | 'count'; max?: number; value?: number }[];
  hud: { light: boolean; noise: boolean; cover: boolean };
  failure: { reason: string; canSkip: boolean } | null;
  lunar: { date: string; countdown: string };
  conscience: { knockouts: number; kills: number };
};

// ---- Authoring helpers (identity functions that keep literal types checked) ---------------------------

export const defineMission = (m: MissionDef) => m;
export const defineChapter = (c: ChapterModule) => c;
