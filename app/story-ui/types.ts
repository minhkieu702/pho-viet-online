// View models for the story UI (app/story-ui/*). Pure types: no React, DOM or three.js imports.
// The director maps runner/engine state onto StoryUiView and turns StoryUiAction into engine.story calls
// (app/game/story/host.ts StoryApi: link, propose, hint, answer, closeBoard, present, press, bluff, newGame…).
// Ids and enums follow app/game/story/types.ts where both exist (Difficulty, Approach, EvidenceKind, title kinds).
// Fast-changing values (stealth pressure, noise, awareness, QTE mash, camera framing) can be pushed through
// createStoryStore() (store.ts) at frame rate instead of the 120 ms Hud JSON.

export type CastId = string;
/** A speaking character as the UI shows it. `name` already reflects story progress (cast.nameAt(flags)). */
export type Speaker = { id: CastId; name: string; color: string; role?: string };
/** Portrait data URLs by cast id, delivered once (onEvent 'portraits'); a missing entry falls back to initials. */
export type PortraitMap = Record<CastId, string>;

// ---------------------------------------------------------------- dialogue and cinema
/** Runner voices map as: say/shout/whisper → scene, think → inner, phone, radio, narrate. */
export type Channel = 'scene' | 'phone' | 'radio' | 'overheard' | 'inner' | 'tv' | 'sms' | 'bark' | 'note' | 'narrate';
/** One visible subtitle line (at most two are shown). `heard` 0..1 is the eavesdrop fraction for overheard lines. */
export type SubtitleLine = { id: string | number; who: CastId | null; name: string; color: string; ch: Channel; text: string; italic?: boolean; heard?: number; cut?: boolean };
export type GradeId = 'none' | 'warm' | 'cold' | 'night' | 'freeze' | 'flashback' | 'neon' | 'underwater' | 'alarm' | 'dawn';
/** 'place' is the runner's name for the location lower-third; both render the same. */
export type CardKind = 'chapter' | 'title' | 'time' | 'location' | 'place' | 'intro' | 'objective';
/** Cards: chapter (black, eyebrow 'CHƯƠNG HAI', lotus petals lit per finished chapter), title, time ('BA TUẦN TRƯỚC'),
 *  location lower-third, intro (freeze-frame character card; `color` underline, `sub` role line), objective toast. */
export type CardView = { seq: number; kind: CardKind; eyebrow?: string; title: string; sub?: string; petals?: number; color?: string };
/** scene: plain buttons; sms: reply bubbles under the incoming text (speaker + line); plate: licence plates
 *  ('59-X1 123.45' renders on two rows); bluff: a guard's question with speaker and line. */
export type ChoiceStyle = 'scene' | 'sms' | 'plate' | 'bluff';
export type ChoiceOptionView = string | { id: string; text: string };
/** `timer` seconds drains a bar; on timeout the runner applies its default (the UI only shows the bar).
 *  Options may carry ids (the runner's ChoicePanel); the 'choose' action then reports the id too. */
export type ChoiceView = { seq: number; prompt?: string; speaker?: Speaker; line?: string; options: ChoiceOptionView[]; style: ChoiceStyle; timer?: number; defaultIndex?: number; picked?: number | null };
/** E, SPACE and F, plus G (kick) and A/D/W/S for directional prompts (escort-boss-qte.md §3). */
export type QteKey = 'E' | 'SPACE' | 'F' | 'G' | 'A' | 'D' | 'W' | 'S';
/** `window` seconds for the shrinking ring; `mash` presses needed (count = presses so far). Failing only loops the beat. */
export type QteView = { seq: number; key: QteKey; label: string; window: number; mash?: number; count?: number; result?: 'hit' | 'miss' | null };
export type NoteKind = 'receipt' | 'ledger' | 'letter' | 'whiteboard';
/** Full-screen paper examine view. `hand` is the handwritten line (e.g. 'CỨU TỤI EM' in eyeliner). */
export type NoteView = { seq: number; kind: NoteKind; title: string; lines: string[]; hand?: string; caption?: string };
export type CinemaView = {
  mode: 'scene' | 'action' | 'card' | null;
  /** 1 = cinema bars (2.39:1), 0.5 = thin bars for action cams, 0 = none. Portrait phones get gradients instead. */
  bars: 0 | 0.5 | 1;
  grade?: GradeId;
  skippable: boolean; skipHint: boolean; skipHold: boolean;
  card: CardView | null; choice: ChoiceView | null; qte: QteView | null;
  split?: { left: string; right: string } | null;
  note: NoteView | null;
  paused: boolean;
};

// ---------------------------------------------------------------- objective card, meters, lunar strip
export type MeterKind = 'suspicion' | 'tail' | 'eavesdrop' | 'detection' | 'pressure' | 'carry' | 'breath' | 'progress' | 'debt';
/** value 0..1. `band` marks the good zone (tail distance band, choke band). `text` replaces the percentage. */
export type MeterView = { id: string; kind: MeterKind; label: string; value: number; band?: [number, number]; text?: string };
export type LunarView = {
  month: number; day: number; /** target day in month 8, default 15 (Rằm) */ target?: number;
  /** override days left (lunar months are 29 or 30 days) */ daysLeft?: number;
  /** ready-made strings (the runner's view.lunar.date / .countdown) replace the computed ones */ label?: string; countdown?: string;
};
export type ObjectiveView = {
  chapter: number; chapterTitle: string; mission: string; objective: string;
  /** the runner's view.subs map straight onto this */ checklist: { id?: string; text: string; done: boolean; optional?: boolean }[];
  timer?: { seconds: number; label: string; urgent?: boolean } | null;
  meters: MeterView[]; lunar: LunarView | null;
  tally?: { knockouts: number; kills: number } | null;
  /** 'Vỏ bọc shipper' and similar chips. */
  chips?: string[];
};

// ---------------------------------------------------------------- stealth
export type Stance = 'stand' | 'crouch' | 'hidden' | 'float' | 'dive' | 'drag' | 'carry';
export type Detection = 'hidden' | 'suspected' | 'searching' | 'detected' | 'combat';
export type GuardState = 'unaware' | 'suspicious' | 'search' | 'alert' | 'down' | 'tied';
/** One guard pip. `dir` is the bearing from the camera forward, radians clockwise (0 = ahead). */
export type GuardPip = { id: string; awareness: number; state: GuardState; dir: number; dist: number; tagged?: boolean };
/** prompt: 'Nhấn E để hạ nhanh (giữ E: khóa cổ)'; hold/loot/drag/pick: a hold ring (progress 0..1);
 *  choke: pressure needle in `band`, count 0..5 ('Một… hai… ba… bốn… năm'), warn 'over' (Nhẹ thôi! — never lethal) or 'slip'. */
export type TakedownView = { phase: 'prompt' | 'hold' | 'choke' | 'drag' | 'loot' | 'pick'; label: string; progress: number; pressure?: number; band?: [number, number]; count?: number; warn?: 'over' | 'slip' | null };
/** `zone` uses the stealth-types.ts ZoneKind ids. */
export type CoverView = { kind: 'shipper' | 'waiter' | 'porter' | 'visitor'; label: string; integrity: number; zone: 'public' | 'staff' | 'restricted' | 'hostile' };
/** The stealth inventory of stealth-player-kit.md §6 (radio, keycard and key stand for every radio:{guard}, keycard:{id}, key:{id}). */
export type StealthItemId = 'bolt' | 'coin' | 'bottle' | 'food' | 'zipTie' | 'whistle' | 'burner' | 'radio' | 'keycard' | 'key' | 'boltCutters' | 'tracker' | 'bug' | 'clipCam';
export type StealthView = {
  stance: Stance; /** 0 dark .. 1 lit */ light: number; /** current noise radius, metres */ noise: number; noiseMax: number;
  detection: Detection; alarm: 0 | 1 | 2 | 3; /** seconds until reinforcements */ reinforce?: number | null;
  guards: GuardPip[]; takedown: TakedownView | null; cover: CoverView | null;
  items: { id: StealthItemId; count: number }[];
  /** 'Bộ đàm gọi sau 0:42' (seconds) */ radioIn?: number | null; /** 0..1 while diving */ breath?: number | null;
  knockouts: number; kills: number;
  /** increments on each detection for the red edge flash */ flash?: number;
};

// ---------------------------------------------------------------- phone
export type PhoneApp = 'home' | 'calls' | 'sms' | 'contacts' | 'camera' | 'orders' | 'photos';
export type CallView = { state: 'ringing' | 'outgoing' | 'talking' | 'ended'; who: CastId; name: string; color?: string; secs: number; burner?: boolean; canDecline?: boolean; /** reply choice inside a call */ replies?: string[] | null };
export type SmsMessage = { id: string; from: 'me' | 'them' | 'system'; text: string; time: string };
export type SmsThread = { id: string; who: CastId; name: string; color?: string; messages: SmsMessage[]; unread: number; replies?: string[] | null; typing?: boolean };
export type Contact = { id: CastId; name: string; note?: string; color?: string; callable: boolean; burner?: boolean };
export type CallLogEntry = { id: string; who: CastId; name: string; time: string; dir: 'in' | 'out' | 'missed'; evidence?: boolean };
/** Screen rect 0..1 of a photo target projected by the director; state explains why it is not yet a good shot. */
export type ViewfinderTarget = { id: string; x: number; y: number; w: number; h: number; label?: string; state: 'ok' | 'far' | 'blur' | 'blocked' | 'edge' };
export type CameraView = { mode: 'photo' | 'clip'; zoom: number; zoomMin: number; zoomMax: number; /** 0..1 expected shot quality (0.6+ succeeds) */ quality: number; hint?: string | null; targets: ViewfinderTarget[]; shots: number; /** increments per shutter */ flash?: number; record?: { label: string; progress: number } | null };
export type OrderCard = { id: string; title: string; from: string; to: string; fee: number; distance: string; eta?: string; customer?: string; code?: string; state: 'offer' | 'active' | 'done' | 'taken' };
export type PhotoView = { id: string; caption: string; time: string; evidence?: boolean; src?: string };
export type PhoneView = {
  open: boolean; app: PhoneApp; skin: 'smart' | 'burner';
  clock: string; battery: number; signal: number;
  /** fictional delivery app name (the content text table's brand constant) */ appName: string;
  call: CallView | null; recents: CallLogEntry[];
  threads: SmsThread[]; thread: string | null;
  contacts: Contact[]; camera: CameraView | null;
  orders: OrderCard[]; rating?: number; photos: PhotoView[];
  debt?: { paid: number; total: number } | null;
};

// ---------------------------------------------------------------- journal, evidence, board, deductions
/** Superset of the runner's EvidenceKind ('testimony', 'recording', 'call-log' come from there). */
export type EvidenceKind = 'photo' | 'document' | 'object' | 'plate' | 'audio' | 'video' | 'note' | 'person' | 'place' | 'call' | 'testimony' | 'recording' | 'call-log';
export type EvidenceCard = { id: string; title: string; sub?: string; kind: EvidenceKind; chapter: number; text: string; art?: string; isNew?: boolean };
export type DossierStatus = 'family' | 'ally' | 'suspect' | 'victim' | 'witness' | 'unknown' | 'arrested' | 'missing' | 'deceased';
export type Dossier = { id: CastId; name: string; role: string; color: string; status: DossierStatus; lines: string[]; age?: number };
export type PlaceEntry = { id: string; name: string; district: string; note: string; chapter: number; visited: boolean };
export type DiaryEntry = { chapter: number; title: string; lunar?: string; text: string };
/** Bóng ma = Medal.ghost, Lương tâm = nonLethal, Thần tốc = fast, Mắt cú = eye (medalIds() in format.ts). */
export type MedalId = 'bong-ma' | 'luong-tam' | 'than-toc' | 'mat-cu';
export type Grade = 'A' | 'B' | 'C' | 'D';
export type MissionRecord = { id: string; title: string; chapter: number; grade?: Grade; medals: MedalId[]; best?: number; knockouts: number; kills: number; detections: number };
export type ConscienceView = { knockouts: number; kills: number; detections: number; alarms: number; records: MissionRecord[] };
export type JournalTab = 'clues' | 'people' | 'places' | 'diary' | 'conscience';
export type JournalView = { tab: JournalTab; evidence: EvidenceCard[]; people: Dossier[]; places: PlaceEntry[]; diary: DiaryEntry[]; conscience: ConscienceView; questions: string[]; hintTokens: number; canOpenBoard: boolean };

/** Position: `slot` (the runner's lotus-template slot, LOTUS_SLOTS in format.ts) or explicit x, y in 0..1; rot in degrees.
 *  visible:false = evidence not found yet: the card shows as a blank pinned note and cannot be linked. */
export type BoardCard = { id: string; title: string; sub?: string; kind: EvidenceKind; slot?: number; x?: number; y?: number; rot?: number; art?: string; isNew?: boolean; visible?: boolean };
/** Links already accepted by the runner ('hint' = drawn by spending a token). Wrong links never appear here. */
export type BoardLink = { a: string; b: string; state: 'ok' | 'hint' };
/** The runner's questionView; `wrong` (option ids tried) is optional because the runner only counts tries. */
export type DeductionView = { id: string; prompt: string; options: { id: string; text: string }[]; wrong?: string[]; answered?: string | null };
/** A claim proven by picking cards (runner HypothesisDef): pick mode, then the 'propose' action. */
export type HypothesisView = { id: string; text: string; state: 'locked' | 'open' | 'proven' };
export type BoardView = {
  id: string; title: string; question?: string;
  cards: BoardCard[]; links: BoardLink[]; /** correct links needed to solve (runner boardView.total) */ needed: number;
  hintTokens: number; solved: boolean; readOnly: boolean;
  /** cards to shake after a wrong link or proposal (seq increments per rejection) */ shake?: { seq: number; ids: string[] } | null;
  hypotheses?: HypothesisView[];
  deduction: DeductionView | null;
};

// ---------------------------------------------------------------- CCTV and interrogation
export type CctvMarker = { id: string; t: number; label: string };
/** Footage plays locally in the UI (deterministic): the runner only checks `mark` actions and lists `found` markers. */
export type CctvView = { id: string; title: string; camera: string; place: string; /** footage start, seconds after midnight */ start: number; duration: number; fps?: number; goal: string; needed: number; found: CctvMarker[]; hint?: string | null; feedback?: { seq: number; ok: boolean; text: string } | null };
export type InterrogationStatement = { id: string; text: string; state: 'pending' | 'current' | 'broken' | 'true' };
/** `card` = title of the evidence the hero put on the table with this line (runner log entries carry the card id). */
export type InterrogationLine = { id: string; who: 'hero' | 'subject' | 'narration'; text: string; card?: string };
/** Same as the runner's Approach (interrogation.ts): a lie is settled by 'accuse', a truth by 'empathy'. */
export type Approach = 'accuse' | 'empathy';
export type InterrogationView = {
  /** subject.name in sentence case ('Chị Diễm'): it is used inside sentences; the card uppercases it. */
  id: string; subject: Speaker; place: string; topic: string;
  statements: InterrogationStatement[]; lines: InterrogationLine[];
  /** 0..1, the subject's guard (high = defensive) */ composure: number;
  /** runner pressure 0..1 (presses raise it; a bluff only works on a lie once it is high enough) */ pressure?: number;
  evidence: EvidenceCard[];
  /** 'Nói rõ hơn đi' (press) and the bluff button; omitted = shown */ canPress?: boolean; canBluff?: boolean;
  /** seconds the subject stays silent after a wrong card (a time cost, never a fail); seq restarts the countdown */ shut?: { seq: number; seconds: number } | null;
  feedback?: { seq: number; kind: 'good' | 'bad' | 'neutral'; text: string } | null;
  outcome?: 'talks' | null;
};

// ---------------------------------------------------------------- menu, chapter select, results, pause, toasts
/** Same ids as the runner's Difficulty. */
export type Difficulty = 'de' | 'thuong' | 'kho';
export type SlotView = { index: number; empty: boolean; label?: string; chapter?: number; percent?: number; playSeconds?: number; updated?: string; difficulty?: Difficulty };
export type ChapterMission = { id: string; title: string; minutes: number; state: 'locked' | 'open' | 'done'; grade?: Grade; medals: MedalId[]; best?: number };
export type ChapterEntry = { n: number; title: string; lunar: string; summary: string; state: 'locked' | 'open' | 'current' | 'done'; missions: ChapterMission[] };
export type StoryMenuView = { screen: 'main' | 'new' | 'chapters'; slots: SlotView[]; lastSlot: number | null; chapters: ChapterEntry[]; petals: number; contentNote: boolean; storageBlocked?: boolean };
export type ResultView = { kind: 'complete' | 'fail'; mission: string; reason?: string; seconds?: number; detections: number; knockouts: number; kills: number; grade?: Grade; medals: MedalId[]; reward?: number; clues: string[]; canRetry: boolean };
export type SubtitleSize = 'S' | 'M' | 'L';
export type StorySettings = {
  subtitleSize: SubtitleSize; /** 0..1 subtitle backdrop opacity */ subtitleBg: number; readSpeed: 'slow' | 'normal' | 'fast';
  actionCams: 'on' | 'less' | 'off'; reduceShake: boolean; reduceFlash: boolean;
  autoChoke: boolean; cones: 'always' | 'observe' | 'off'; noiseRing: boolean;
};
export type PauseView = { context: 'scene' | 'mission' | 'hub'; canRetry: boolean; canSkip: boolean };
export type ToastView = { seq: number; kind: 'evidence' | 'checkpoint' | 'journal' | 'info' | 'warn'; title: string; text?: string };
/** A story interaction prompt; same shape as the Interactable registry's PromptView (interact.ts) so they can share a chip. */
export type StoryPrompt = { id: string; key: 'E' | 'Giữ E' | ''; verb: string; label: string; progress?: number; dim?: boolean };

// ---------------------------------------------------------------- touch
/** Engine key names as setInput() receives them; the story key map is story-decisions.md §4 (P phone and camera,
 *  K whistle, U face cover, M or J journal; Tab stays the free-roam bag and is not a story key). */
export type StoryKey = 'e' | 'x' | 'g' | 't' | 'p' | 'l' | 'b' | 'k' | 'u' | 'm' | 'j' | ' ';
export type TouchButton = { key: StoryKey; label: string; hold?: boolean; active?: boolean; disabled?: boolean; progress?: number };

// ---------------------------------------------------------------- the whole layer
/** Everything StoryLayer draws. (Not the runner's compact StoryView in app/game/story/types.ts; that one feeds this.) */
export type StoryUiView = {
  cine: CinemaView | null; talk: SubtitleLine[];
  objective: ObjectiveView | null; prompt: StoryPrompt | null; stealth: StealthView | null;
  phone: PhoneView | null; journal: JournalView | null; board: BoardView | null;
  cctv: CctvView | null; interrogation: InterrogationView | null;
  menu: StoryMenuView | null; pause: PauseView | null; result: ResultView | null;
  toasts: ToastView[]; touch: TouchButton[] | null; settings: StorySettings;
};

export type StoryUiAction =
  | { type: 'advance' }
  | { type: 'skipHold'; down: boolean }
  | { type: 'choose'; seq: number; index: number; id?: string }
  | { type: 'qte'; seq: number; down: boolean }
  | { type: 'closeNote'; seq: number }
  | { type: 'pause'; item: 'open' | 'resume' | 'skipScene' | 'journal' | 'board' | 'retry' | 'quit' }
  | { type: 'settings'; patch: Partial<StorySettings> }
  | { type: 'phone'; op: 'open' | 'close' | 'answer' | 'decline' | 'hangup' | 'shutter' }
  | { type: 'phone'; op: 'app'; app: PhoneApp }
  | { type: 'phone'; op: 'thread'; thread: string | null }
  | { type: 'phone'; op: 'reply'; thread: string; index: number }
  | { type: 'phone'; op: 'callReply'; index: number }
  | { type: 'phone'; op: 'call'; contact: CastId }
  | { type: 'phone'; op: 'zoom'; value: number }
  | { type: 'phone'; op: 'order'; order: string; accept: boolean }
  | { type: 'journal'; op: 'close' | 'board' }
  | { type: 'journal'; op: 'tab'; tab: JournalTab }
  | { type: 'board'; op: 'link'; a: string; b: string }
  | { type: 'board'; op: 'propose'; hyp: string; cards: string[] }
  | { type: 'board'; op: 'hint' | 'close' }
  | { type: 'board'; op: 'deduce'; id: string; option: string }
  | { type: 'cctv'; op: 'mark'; t: number; zoom: { x: number; y: number } | null }
  | { type: 'cctv'; op: 'close' }
  | { type: 'interrogation'; op: 'present'; evidence: string; approach: Approach }
  | { type: 'interrogation'; op: 'press' | 'bluff' | 'close' }
  | { type: 'menu'; op: 'continue' | 'close' | 'acceptNote' }
  | { type: 'menu'; op: 'screen'; screen: StoryMenuView['screen'] }
  | { type: 'menu'; op: 'new'; slot: number; difficulty: Difficulty }
  | { type: 'menu'; op: 'replay'; mission: string }
  | { type: 'menu'; op: 'replayChapter'; chapter: number }
  | { type: 'result'; op: 'continue' | 'retry' | 'quit' }
  | { type: 'toast'; seq: number }
  | { type: 'key'; key: StoryKey; down: boolean };
