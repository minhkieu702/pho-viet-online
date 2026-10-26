/**
 * The engine-side vocabulary story content may use (W0 integration). Every id a chapter script or a cutscene hands
 * to the engine by name — `do` ops, `q` queries, signals the engine raises, outfits, vehicle models, extras
 * templates, stealth arenas and rules, social covers, meters, abilities, prop kinds, carried items, player poses,
 * actor acts, input locks, music, stings and weather sets, and the cutscene vocabulary (clips, pair clips, scene
 * poses, scene props, ride models, fx, sfx, grades, hidden meshes, ambience beds) — is listed here with the lane that
 * implements it (story-plan.md Ownership; Wave 1 plan E:/pvo-work/story/WAVE1-PLAN.md).
 * `lintContent(index, chapters, { engine: ENGINE_CONTRACT })` rejects any other id in a mission script, and the
 * story-content test checks every cutscene against the scene kinds (scene.ts sceneVocab), so a typo or an
 * unimplemented op cannot pass silently (a `do` act is a no-op when the engine lacks it). Adding an id: one line
 * here, owned by the lane that builds it. Pure data: no three.js, no DOM.
 */

export type Lane = 'core' | 'director' | 'spaces' | 'stealth' | 'vehicles' | 'police' | 'world' | 'ui' | 'audio';
/** [lane, what the engine does with it]; "planned" entries come from the Wave 0 specs and have no content yet. */
export type ContractEntry = readonly [Lane, string];
export type ContractKind = 'ops' | 'queries' | 'signals' | 'outfits' | 'models' | 'templates' | 'arenas' | 'stealthRules' | 'covers' | 'meters'
  | 'abilities' | 'props' | 'carry' | 'poses' | 'acts' | 'locks' | 'music' | 'stings' | 'weather'
  // cutscene vocabulary (story/scene.ts cues), compiled by the director
  | 'clips' | 'pairClips' | 'scenePoses' | 'sceneProps' | 'rideModels' | 'fx' | 'sfx' | 'grades' | 'meshes' | 'ambience';
export type EngineContract = Record<ContractKind, Readonly<Record<string, ContractEntry>>>;
/** Meter families the helpers publish by themselves: `tail:<target>` (tail act), `eavesdrop:<id>` (eavesdrop act). */
export const METER_PREFIXES = ['tail:', 'eavesdrop:'] as const;
/**
 * The wave in which each lane's engine work lands (WAVE1-PLAN.md §2, §5). Until then the W1 session stubs it: a
 * stubbed `q` query answers false, so content a chapter must play in an earlier wave may only wait on queries of
 * lanes already built by then (story-content test).
 */
export const LANE_WAVE: Readonly<Record<Lane, number>> = { core: 1, ui: 2, director: 2, spaces: 2, stealth: 2, vehicles: 2, audio: 2, world: 4, police: 4 };
/** The wave that must play each chapter for real (chapter 1 is the Wave 1 acceptance, c1-m2 end to end). */
export const CHAPTER_WAVE: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 2 };

export const ENGINE_CONTRACT: EngineContract = {
  ops: {
    appOrder: ['ui', 'order card on the {@app} phone app {id (engine id, never shown), state offer|active|done|taken, title @key (the text carries {@code}), from/to site ids, fee (nghìn đồng), customer @key}; @keys resolved with runner.text'],
    bike: ['core', "the player's own bike look {id:'dream', look:'battered'|'revived'|'wrecked' (c4-m2 crash)|'matte' (c5-m1 rebuild: the tail gets the quiet ×0.7 bonus)}"],
    gps: ['core', 'guide line on the minimap and street along a sites.ts route {route, reverse?: true (run it backwards, c4-m2)}; {route:null} clears it'],
    photoExamine: ['ui', 'phone photo viewer on an evidence photo {photo, hotspot, label @key}; zoom ≥ ×2 over the hotspot and E resolves it (wait: true; phone-detective-ui.md §3.5; c4-m2)'],
    cctv: ['ui', "the café recorder overlay (CctvView) {id, timeline, camera, title, cam, goal, hint, start, duration, fps, rain, needed, marks[{t, tol, evidence}]}; blocks until closed; each found mark pushes {type:'overlay', id, evidence} (story/timeline.ts, cctv-render.ts; c5-m1)"],
    offerWait: ['ui', "phone ĐỢI button until {until: hour}; pressing it raises signal 'phoneWait' and the core fades the clock forward"],
    stealthAlarm: ['stealth', 'force the arena alarm {level 0–3, reason} (StealthPort gains alarm(level) in Wave 2)'],
    danger: ['ui', 'heartbeat HUD and red edge vignette {on}'],
    pursue: ['vehicles', "armed bikers chase {ids, target:'player', meter, unseen: seconds} / {ids, stop:true}; drives the ids itself (a route given to them is ignored while pursuing); pushes 'caught' on contact, 'escaped' when shaken"],
    chase: ['vehicles', "planned (chase-wanted.md §5): {id, controller tailTarget|counterTail|keepUp|pursuers|convoy|ally|allyBlock|boatChase, ride, …}; counterTail (c3-m1) {start, fill, decay, escapeAfter, catchAt, giveUp, meter 'eye:<ride>'} pushes 'escaped' / 'caught' with the controller id; keepUp (c4-m2) {target, want, floor, ceil, window:{at, from, to}} raises 'rammed'; {k:'stop', id} ends it"],
    wanted: ['police', 'planned (chase-wanted.md §7): story wanted mode {mode, maxWanted, recognition, checkpoints, posters}'],
    escort: ['stealth', 'planned (escort-boss-qte.md §1): group orders {id, spec?, cmd?}'],
    festival: ['world', "planned (festival-blackout-heli.md §1): {id:'ram-thang-tam', on}"],
    power: ['world', 'planned (festival-blackout-heli.md §2): per-region power {regions}'],
    powerSweep: ['world', 'planned (festival-blackout-heli.md §2.3): the CS09 sign-by-sign blackout'],
    heli: ['vehicles', 'planned (festival-blackout-heli.md §3): helicopter modes without a VehicleState (orbit, follow, land, autorotate)'],
  },
  queries: {
    viewTurned: ['core', 'the orbit camera yaw has moved at least 0.6 rad (args.rad) since the step began (session, from view.yaw; c1-m1 tutorial)'],
    gateCamAway: ['stealth', 'planned: the KHO 7 gate camera is turned away (a timing window; no content yet)'],
    escort: ['stealth', "planned: escort group state {id, all?: 'safe'|'aboard', count?}"],
    lightsOut: ['world', 'planned: a power region is dark {area}'],
  },
  // Engine → runner {type:'signal', id}; content waits with {k:'on', ev:'signal', id} (a `do` op with wait latches its own op id).
  signals: {
    phoneWait: ['ui', 'the phone ĐỢI button was pressed (offerWait)'],
    ranRed: ['core', "the player ran a red light (checkRedLight in story mode: never a crime, one signal per violation; c1-m2 Cô Ba's texts)"],
    rammed: ['vehicles', 'the player hit the keepUp chase target (impulse > 1.5 m/s, chase-wanted.md §5.3); the target swerves (c4-m2)'],
  },
  outfits: {
    'tin-que': ['core', 'Tín from the village: shirt, trousers, sandals, duffel strap'],
    'tin-shipper': ['core', 'Tín in the orange {@app} windbreaker, box pack and half helmet (walker, rider, seated and helmet copies)'],
    'tin-bandaged': ['core', 'Tín after the crash: scraped, left wrist bandaged in a sling, the windbreaker over his shoulders (c4-m3)'],
    'tin-wrist-wrap': ['core', 'Tín in the shipper windbreaker with his left wrist in a tight elastic wrap, no sling (chapter 5, the day after the hospital)'],
  },
  models: {
    dream: ['core', "Tín's own underbone bike: the player's bike placed and restyled by the core (story id 'dream', never shown as a brand)"],
    coach: ['vehicles', 'the Mekong xe đò (vehicle-models coach body)'],
    'reefer-van': ['vehicles', 'refrigerated van, golden-lotus windscreen pass ("SV · XE ƯU TIÊN"), plate 51D-207.19 sprite'],
    scooter: ['vehicles', 'generic scooter for riders (Rắn Đen bikers)'],
    'suv-den': ['vehicles', 'the existing suv body, black paint, tinted windows, plate 51K-660.13 (c3-m1 counter-tail, the chase op drives it; ev-xe-den); the CS04 T-bone ride (no plate shown)'],
    'vios-van': ['vehicles', "Vân's old silver sedan (parked at KHO 7 in c3-m2; never named in text)"],
    'white-van': ['vehicles', 'white 16-seat passenger van: sliding door on the right, clear rear window, tinted sides, plate 51B-217.07 sprite, driver and passenger seats (c4-m2)'],
  },
  templates: {
    watchdog: ['stealth', 'Mực and the chained yard dog (stealth-owned watchdog, not animals.ts)'],
    'ran-den': ['stealth', 'Rắn Đen thug (guard template; also a biker driver)'],
    'captive-teen': ['director', 'teenage victim extra; dignified poses only (POSES_DIGNIFIED)'],
    'captive-uniform': ['director', 'victim in a factory uniform being led (dignified poses only)'],
    'captive-child': ['director', 'planned: child victim extra (dignified poses only)'],
    'captive-adult': ['director', 'planned: adult victim extra (dignified poses only)'],
    resident: ['director', 'a borrowed street-life resident (npcs.ts role) used as a customer or bystander'],
    worker: ['director', 'packing-line worker in a rubber apron (CS03)'],
    villager: ['director', 'Tân Thuận villager on the lotus-pond dykes (CS01)'],
    'ward-cop': ['director', 'ward police officer at the wheel of the patrol car (c2-m2)'],
    'van-driver': ['director', 'the reefer-van driver seen through the windscreen (c2-m2)'],
    'debt-collector': ['director', "the ring's debt collector in black who pastes the notice (CS01)"],
    secretary: ['stealth', 'the Ánh Dương secretary: a non-hostile watcher with a vision cone, never fights (director look "secretary"; c4-m1)'],
    clubber: ['director', 'dance-floor extra (Moonlight crowd, strobe cutscene; c5-m3)'],
  },
  arenas: {
    'co-ba-back': ['stealth', "Cô Ba's back yard and stairs (c1-m3 crouch tutorial past Mực)"],
    'nha-nghi': ['stealth', 'motel corridor with the shipper cover (c2-m1)'],
    'hem-nha-nghi': ['stealth', 'the back alley behind the motel (c2-m2 stake-out)'],
    'kho-7': ['stealth', 'KHO 7 compound and hollow shell, Quận 4 (c2-m3)'],
    'hem-ong-tu': ['stealth', 'the training course in the alley behind SỬA XE TƯ: gravel, puddles, a wall lamp, the dark nook, bamboo hide, the shop corner; Bin is its one guard (c3-m3)'],
    'anh-duong': ['stealth', "Ánh Dương office: waiting room (public), corridor (staff), back office (restricted); shipper cover; the secretary's desk cone covers the corridor and the arena turns off the brain's own QUESTION for her (c4-m1)"],
    'karaoke-back': ['stealth', 'KARAOKE ÁNH SAO staff corridor, beer storeroom (body room) and VIP room; open singing rooms are sound-cover zones (×0.35) (c5-m1)'],
    'spa-back': ['stealth', 'the strip roofs (tin, loud), the shared courtyard and the spa back section; steam pump interactable (15 s noise, ×0.5 mask); the dozing guard is a pickpocket target (c5-m2)'],
    moonlight: ['stealth', "Moonlight floor and VIP back-of-house, variant 'party': dance-floor crowd zone (walking slowly blends, running raises visibility), strobes (c5-m3)"],
  },
  // ArenaRules of story-system-stealth.md §11 (stealth.ts facade); guard-brain.ts reads takedowns, countConscience, lightsOutAlarm, wake.
  stealthRules: {
    takedowns: ['stealth', 'takedowns allowed'], chokeOnly: ['stealth', 'only the chokehold takedown'], guns: ['stealth', "player guns: 'none' | 'loot' | 'any'"],
    lethal: ['stealth', "'allow' | 'warn' | 'fail' (a chokehold never kills either way)"], failOn: ['stealth', "FailCondition[] (e.g. 'captivesMoved')"],
    showCones: ['stealth', "'always' | 'observe' | 'tagged' | 'never'"], detection: ['stealth', 'detection gain multiplier'], noise: ['stealth', 'noise multiplier'],
    countConscience: ['stealth', 'book LƯƠNG TÂM inside the arena'], respawn: ['stealth', "'checkpoint' | 'none'"], policeSuppressed: ['police', 'crimes inside raise the ring alarm, not the police'],
    lightsOutAlarm: ['stealth', 'guard-brain rule: a power cut raises alarm 1'], wake: ['stealth', 'guard-brain rule: knocked-out guards wake'],
  },
  covers: {
    shipper: ['stealth', 'VỎ BỌC SHIPPER (meter cover:shipper)'], waiter: ['stealth', 'VỎ BỌC PHỤC VỤ'],
    porter: ['stealth', 'VỎ BỌC KHUÂN VÁC'], visitor: ['stealth', 'VỎ BỌC KHÁCH'],
  },
  meters: {
    'cover:shipper': ['stealth', 'social cover integrity 0..1 (c2-m1)'],
    'thoat:ran-den': ['vehicles', 'getting away from the pursuing bikers 0..1 (c2-m3 route b)'],
    'eye:suv-den': ['vehicles', "the counter-tail eye meter 0..1 (chase-wanted.md §5.2 publishes 'eye:<ride>'; c3-m1)"],
  },
  abilities: {
    phone: ['ui', 'the phone (P)'], appOrders: ['ui', '{@app} orders on the phone'], crouch: ['stealth', 'Rón rén (X)'],
    soNo: ['ui', 'SỔ NỢ debt widget'], phoneCamera: ['ui', 'camera viewfinder (P with a photo objective)'], headlight: ['core', 'headlight toggle (L)'],
    floatStill: ['spaces', 'Nổi im: float still in dark water'], observe: ['stealth', 'planned: Quan sát (hold T)'],
    whistle: ['stealth', "planned: Ông Tư's whistle (K)"], faceCover: ['core', 'planned: face cover (U)'],
    lean: ['stealth', 'lean and peek at a cover edge (A/D, stealth-player-kit.md §3.4; c3-m3)'], throw: ['stealth', 'throw a bolt, coin or bottle (G, §6.1; c3-m3)'],
    takedown: ['stealth', "takedown from behind: tap E Hạ nhanh, hold E Khóa cổ (§4); with countConscience:false it pushes {type:'takedown', id, cause:'fast'|'choke'|'slip'} and no 'knockout' (c3-m3)"],
    drag: ['stealth', 'drag a knocked-out body (hold E, §9.2; c3-m3)'],
    phoneSilent: ['ui', 'phone silent mode: rings become a 3 m vibration (phone-detective-ui.md §3; c3-m3)'], luongTam: ['ui', 'the LƯƠNG TÂM page of the pause menu (knockouts vs kills; c3-m3)'],
    clipCam: ['ui', "clip-on camera: CameraView mode 'clip', recording progress while the framing holds (q ≥ 0.5), paired with the eavesdrop meter (c5-m3)"],
  },
  props: {
    'photo-pinned': ['director', 'photo of Má and Mai pinned on the attic wall'], duffel: ['director', "Tín's duffel bag"],
    scooter: ['world', "Bà Sáu's scooter ('upright' | 'fallen')"], 'che-pots-spilled': ['world', 'spilled chè pots'],
    floodlight: ['world', 'gate floodlight (fake cone and decal, no THREE light)'],
    sign: ['world', "story sign prop by variant: 'cho-thue' (KHO CHO THUÊ on the KHO 7 gate; story-decisions §7 world requests; c3-m2)"],
  },
  carry: {
    duffel: ['core', 'duffel bag in hand'], 'order-banh-mi': ['core', 'delivery: bánh mì'], 'order-hoa': ['core', 'delivery: flowers'],
    'order-pho': ['core', 'delivery: phở'], 'order-mua': ['core', 'delivery in the rain'], 'tui-giay': ['core', 'the pharmacy paper bag'],
    'order-com': ['core', 'delivery: five boxed cơm tấm in a plastic bag (c4-m1)'], 'order-banh-kem': ['core', 'delivery: the big ice-cream cake for the DJ booth (no running; c5-m3)'],
  },
  poses: { 'sit-stool': ['core', 'player sits on a stool'], sleep: ['core', 'player lies down to sleep'], limp: ['core', 'player limps: walk speed capped at 1.4 m/s, a limp cycle (used with lock run; c4-m3)'] },
  acts: {
    sleep: ['director', 'asleep'], chained: ['stealth', 'chained dog idle'], 'arrange-flowers': ['director', 'florist at work'], 'cross-arms': ['director', 'arms crossed'],
    'fix-bike': ['director', 'Ông Tư at the bike'], 'hold-bags': ['director', 'holding shopping bags'], 'kettle-pour': ['director', 'pouring from a kettle'],
    ladle: ['director', 'ladling soup'], 'night-window': ['director', 'pharmacist at the night window'], 'pace-happy': ['director', 'pacing, pleased'],
    'phone-bored': ['director', 'bored on the phone'], serve: ['director', 'serving a customer'], 'sit-ground-rub-knee': ['director', 'sitting on the ground rubbing a knee'],
    'sit-stool-phone': ['director', 'on a stool with a phone'], 'stand-bow': ['director', 'a small bow'],
    'board-van': ['director', 'the led group climbs into the van one by one, heads down (dignified; c2-m2 photo window)'],
    'desk-head-down': ['director', 'at a desk, eyes on the paperwork, never looking up (c1-m2 receptionist)'],
    'answer-phone': ['director', 'turns her back to the room and talks on the desk phone (her cone faces the wall; c4-m1)'],
    'talk-phone': ['director', 'on a mobile call, pacing a little (the talk-phone clip as a loop; c4-m1)'],
    'dj-booth': ['director', 'DJ at the booth: one hand on the headphones, nodding to the beat (c5-m3)'],
  },
  locks: { run: ['core', 'no running'], vehicle: ['core', 'no mounting vehicles'], fire: ['core', 'no weapons'], move: ['core', 'no movement'], phone: ['core', 'no phone'] },
  music: {
    'neon-night': ['audio', 'phố đèn neon bed'], pulse: ['audio', 'danger pulse'], tension: ['audio', 'low strings under CS03'],
    'theme-home': ['audio', 'the home theme (đàn bầu)'], 'theme-loss': ['audio', 'the home theme, slow and bare (dawn after KHO 7)'],
  },
  stings: { 'pagoda-bell': ['audio', 'pagoda bell'], 'roller-door': ['audio', 'a van roller door slamming down'] },
  weather: { clear: ['core', 'clear'], cloudy: ['core', 'cloudy'], rain: ['core', 'rain'] },

  // ---- cutscene vocabulary (scene.ts) ----
  clips: Object.fromEntries(([
    'bounce', 'chalk-write', 'count-cards', 'cuff-head', 'flashlight-up', 'flick-cigarette', 'forehead-glass', 'glasses-down', 'hug-smaller', 'look-watch', 'nod',
    'open-shutters', 'pat-seat', 'phone-call', 'rattle-cage', 'sit-hug-knees', 'sit-stool', 'small-nod', 'snatch', 'talk-phone', 'tear-down-hide', 'tremble',
    'turn-spark-plug', 'unfold-paper', 'wave-on', 'wave-phone', 'wave-small', 'wipe-glass',
  ] as const).map((id) => [id, ['director', 'one-actor scene clip (director-actors-extras.md §5 clip library)'] as const])),
  pairClips: {
    'tie-bracelet': ['director', 'Má ties the red string on Tín\'s wrist'], handover: ['director', 'one hands a small object to the other'],
    hug: ['director', 'a hug'], 'lead-by-arm': ['director', 'a guard leads a captive by the upper arm (no strike, no drag)'],
  },
  scenePoses: Object.fromEntries(([
    'crouch', 'lie-flat', 'sit', 'sit-chair', 'sit-hug-knees', 'sit-on-bike', 'sit-stool', 'squat', 'stand', 'step-down', 'work-table', 'walk',
    'stand-head-down', 'walk-led', 'hold-hands', 'shield-younger', 'hum', 'dance',
  ] as const).map((id) => [id, ['director', 'held pose for a placed actor or an extras batch (captives: POSES_DIGNIFIED only; dance: the club floor, c5-m3)'] as const])),
  sceneProps: {
    ...Object.fromEntries(([
      'chain-link-cage', 'chalk-text', 'charcoal-lotus', 'debt-notice', 'envelope', 'faded-lotus-mural', 'fake-flashlight', 'grey-blocks', 'id-cards-envelope', 'iron-gate',
      'lotus-bracelet', 'lotus-tea-packet', 'noodle-bowl', 'orange-delivery-bags', 'photo-frame-facedown', 'receipt-eyeliner', 'sign', 'spark-plug', 'stapled-paper-bag',
      'swinging-tubes', 'torn-bear', 'tv-cai-luong', 'whiteboard',
    ] as const).map((id) => [id, ['director', 'cutscene-only prop (drug packets stay plain grey blocks)'] as const])),
    // chapter 3
    'tea-set': ['director', "Lực's lacquered tea set (variant 'pouring')"], 'window-blinds': ['director', "venetian blinds in Lực's office (variant 'closing')"],
    'business-card': ['director', "Vân's card with text lines"], 'gold-watch': ['director', "the gold watch on Lực's wrist"],
    'wallet-photo': ['director', "Vân's open wallet with the photo of Bống (text caption)"], 'old-photo': ['director', 'the 2014 photo face up: two young policemen beside a jeep (text caption)'],
    'cheap-phone': ['director', 'the burner: a cheap old smartphone with a cracked screen, taped at the corner, no accounts'], 'clip-camera': ['director', 'button-sized clip-on camera'],
    // chapter 4
    pen: ['director', 'cutscene-only prop: a ballpoint pen'], apple: ['director', 'cutscene-only prop: an apple and a paring knife'],
    'case-board': ['director', 'cutscene-only prop: the attic wall with pinned cards and red strings in a lotus shape'],
    // chapter 5
    tarp: ['director', 'a canvas tarp over a parked bike'], 'audio-bug': ['director', "Ông Tư's matchbox-sized listening bug"],
    'football-tv': ['director', 'big screen showing a football match'], 'cash-stacks': ['director', 'bundles of cash on a card table'],
    'belongings-pile': ['director', 'piles of sandals, backpacks and plastic bags (belongings of everyone who passed through)'],
    'school-bag': ['director', "Mai's blue cloth school bag, her name and class written inside the flap"], 'floor-plan': ['director', 'a floor plan pinned on a wall, a red pen line'],
  },
  rideModels: {
    sedan: ['director', 'scripted car of the plate test (vehicle-models sedan body)'], police: ['director', 'ward patrol car'],
    forklift: ['director', 'KHO 7 forklift'], sampan: ['director', 'xuồng on the lotus pond'],
  },
  fx: Object.fromEntries(([
    'awning-drip', 'breath-fog', 'camera-jolt', 'condenser-vapour', 'dripping-wet', 'freezer-mist', 'headlight-sweep', 'mist', 'neon-flicker', 'rain-on-lens', 'roof-leak',
  ] as const).map((id) => [id, ['director', 'scene particle or screen effect (story-system-cinematics.md)'] as const])),
  sfx: Object.fromEntries(([
    'app-ding', 'cai-luong-tv', 'chalk', 'club-through-wall', 'compressor-hum', 'door-chain', 'door-hiss', 'door-slam', 'flipflop-wet', 'forklift-beep', 'gate-screech',
    'humming-girl', 'knock', 'knock-2', 'lion-drums-muffled', 'phone-ring', 'phone-vibrate', 'ringtone-loud', 'rooster', 'shutter-wood', 'smash-cut',
    'stairs-down', 'swoop', 'wrench-tick',
  ] as const).map((id) => [id, ['audio', 'one-shot scene sound'] as const])),
  grades: {
    cold: ['ui', 'gradeFilter cold'], dawn: ['ui', 'gradeFilter dawn'], neon: ['ui', 'gradeFilter neon'], night: ['ui', 'gradeFilter night'], warm: ['ui', 'gradeFilter warm'],
  },
  meshes: {
    'kho-7.skylight-glass': ['world', 'the KHO 7 skylight pane, hidden for the CS03 swoop'],
    'ride:xe-do.window': ['director', "the coach window Tín leans on, hidden for the CS01 pull-back"],
  },
  ambience: {
    'generator-drone': ['audio', 'a generator droning through concrete (B2 during the Rằm blackout)'],
    'condenser-fans': ['audio', 'reefer condenser fans breathing over a tin roof (KHO 7)'],
  },
};

/**
 * Cutscene clips, pair clips, fx and sfx of chapters 4–5, owned by their lanes like ENGINE_CONTRACT's (content/ch04.ts
 * CONTRACT_REQUESTS, content/ch05.ts ENGINE_NEEDS). They join ENGINE_CONTRACT's tables once the chapters register in
 * content/index.ts LOADERS: scripts/story-content.test.mjs checks that every clip, pair clip, fx and sfx id there is
 * used by a cutscene it loads, and it loads chapters 1–2 only. Until then the director compiles chapter 4–5 scenes
 * against ENGINE_CONTRACT plus this table.
 */
export const SCENE_REQUESTS: Readonly<Partial<Record<ContractKind, Readonly<Record<string, ContractEntry>>>>> = {
  clips: {
    'twirl-pen': ['director', 'one-actor scene clip: twirls a pen while talking on the phone (c4m1)'],
    'palm-glass': ['director', 'one-actor scene clip: presses a palm flat on a window from inside a vehicle (seated; CS04)'],
    thrown: ['director', 'one-actor scene clip: thrown from a bike, a tumbling arc that ends lying (no impact frame, no injury shown; CS04)'],
    'peel-apple': ['director', 'one-actor scene clip: peels an apple with a small knife, seated (c4m3)'],
    'pull-tarp': ['director', 'Ông Tư pulls the tarp off the bike in one sweep (c5m1)'],
    'ear-to-chest': ['director', "Tín kneels and presses his ear to a knocked-out man's chest (c5m1)"],
    'press-to-face': ['director', 'kneeling, a small packet pressed to the face with both hands (c5m2)'],
  },
  pairClips: { 'hand-on-shoulder': ['director', "one brushes a hand over the other's shoulder (director spec §7.6 pair; c4)"] },
  fx: {
    'glass-rain': ['director', 'scene particle: windscreen glass falling slowly like rain (slow motion; CS04)'],
    strobe: ['director', 'club strobes and lasers sweeping the dance floor (c5m3)'],
  },
  sfx: {
    'horn-blare': ['audio', 'one-shot scene sound (CS04)'], 'tire-screech': ['audio', 'one-shot scene sound (CS04)'], heartbeat: ['audio', 'one-shot scene sound (CS04)'],
    'tarp-rustle': ['audio', 'canvas tarp pulled off (c5m1)'], 'engine-purr': ['audio', 'the rebuilt bike idling, very quiet (c5m1)'],
    'bolero-offkey': ['audio', 'an off-key bolero howled in the next karaoke room (c5m1)'],
  },
};
