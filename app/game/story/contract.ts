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
export const CHAPTER_WAVE: Readonly<Record<number, number>> = { 1: 1, 2: 2 };

export const ENGINE_CONTRACT: EngineContract = {
  ops: {
    appOrder: ['ui', 'order card on the {@app} phone app {id (engine id, never shown), state offer|active|done|taken, title @key (the text carries {@code}), from/to site ids, fee (nghìn đồng), customer @key}; @keys resolved with runner.text'],
    bike: ['core', "the player's own bike look {id:'dream', look:'battered'|'revived'}"],
    gps: ['core', 'guide line on the minimap and street along a sites.ts route {route}; {route:null} clears it'],
    offerWait: ['ui', "phone ĐỢI button until {until: hour}; pressing it raises signal 'phoneWait' and the core fades the clock forward"],
    stealthAlarm: ['stealth', 'force the arena alarm {level 0–3, reason} (StealthPort gains alarm(level) in Wave 2)'],
    danger: ['ui', 'heartbeat HUD and red edge vignette {on}'],
    pursue: ['vehicles', "armed bikers chase {ids, target:'player', meter, unseen: seconds} / {ids, stop:true}; drives the ids itself (a route given to them is ignored while pursuing); pushes 'caught' on contact, 'escaped' when shaken"],
    chase: ['vehicles', 'planned (chase-wanted.md §5): {id, controller tailTarget|counterTail|keepUp|pursuers|convoy|ally|allyBlock|boatChase, ride, …}'],
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
  },
  outfits: {
    'tin-que': ['core', 'Tín from the village: shirt, trousers, sandals, duffel strap'],
    'tin-shipper': ['core', 'Tín in the orange {@app} windbreaker, box pack and half helmet (walker, rider, seated and helmet copies)'],
  },
  models: {
    dream: ['core', "Tín's own underbone bike: the player's bike placed and restyled by the core (story id 'dream', never shown as a brand)"],
    coach: ['vehicles', 'the Mekong xe đò (vehicle-models coach body)'],
    'reefer-van': ['vehicles', 'refrigerated van, golden-lotus windscreen pass ("SV · XE ƯU TIÊN"), plate 51D-207.19 sprite'],
    scooter: ['vehicles', 'generic scooter for riders (Rắn Đen bikers)'],
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
  },
  arenas: {
    'co-ba-back': ['stealth', "Cô Ba's back yard and stairs (c1-m3 crouch tutorial past Mực)"],
    'nha-nghi': ['stealth', 'motel corridor with the shipper cover (c2-m1)'],
    'hem-nha-nghi': ['stealth', 'the back alley behind the motel (c2-m2 stake-out)'],
    'kho-7': ['stealth', 'KHO 7 compound and hollow shell, Quận 4 (c2-m3)'],
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
  },
  abilities: {
    phone: ['ui', 'the phone (P)'], appOrders: ['ui', '{@app} orders on the phone'], crouch: ['stealth', 'Rón rén (X)'],
    soNo: ['ui', 'SỔ NỢ debt widget'], phoneCamera: ['ui', 'camera viewfinder (P with a photo objective)'], headlight: ['core', 'headlight toggle (L)'],
    floatStill: ['spaces', 'Nổi im: float still in dark water'], observe: ['stealth', 'planned: Quan sát (hold T)'],
    whistle: ['stealth', "planned: Ông Tư's whistle (K)"], faceCover: ['core', 'planned: face cover (U)'],
  },
  props: {
    'photo-pinned': ['director', 'photo of Má and Mai pinned on the attic wall'], duffel: ['director', "Tín's duffel bag"],
    scooter: ['world', "Bà Sáu's scooter ('upright' | 'fallen')"], 'che-pots-spilled': ['world', 'spilled chè pots'],
    floodlight: ['world', 'gate floodlight (fake cone and decal, no THREE light)'],
  },
  carry: {
    duffel: ['core', 'duffel bag in hand'], 'order-banh-mi': ['core', 'delivery: bánh mì'], 'order-hoa': ['core', 'delivery: flowers'],
    'order-pho': ['core', 'delivery: phở'], 'order-mua': ['core', 'delivery in the rain'], 'tui-giay': ['core', 'the pharmacy paper bag'],
  },
  poses: { 'sit-stool': ['core', 'player sits on a stool'], sleep: ['core', 'player lies down to sleep'] },
  acts: {
    sleep: ['director', 'asleep'], chained: ['stealth', 'chained dog idle'], 'arrange-flowers': ['director', 'florist at work'], 'cross-arms': ['director', 'arms crossed'],
    'fix-bike': ['director', 'Ông Tư at the bike'], 'hold-bags': ['director', 'holding shopping bags'], 'kettle-pour': ['director', 'pouring from a kettle'],
    ladle: ['director', 'ladling soup'], 'night-window': ['director', 'pharmacist at the night window'], 'pace-happy': ['director', 'pacing, pleased'],
    'phone-bored': ['director', 'bored on the phone'], serve: ['director', 'serving a customer'], 'sit-ground-rub-knee': ['director', 'sitting on the ground rubbing a knee'],
    'sit-stool-phone': ['director', 'on a stool with a phone'], 'stand-bow': ['director', 'a small bow'],
    'board-van': ['director', 'the led group climbs into the van one by one, heads down (dignified; c2-m2 photo window)'],
    'desk-head-down': ['director', 'at a desk, eyes on the paperwork, never looking up (c1-m2 receptionist)'],
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
    'stand-head-down', 'walk-led', 'hold-hands', 'shield-younger', 'hum',
  ] as const).map((id) => [id, ['director', 'held pose for a placed actor or an extras batch (captives: POSES_DIGNIFIED only)'] as const])),
  sceneProps: Object.fromEntries(([
    'chain-link-cage', 'chalk-text', 'charcoal-lotus', 'debt-notice', 'envelope', 'faded-lotus-mural', 'fake-flashlight', 'grey-blocks', 'id-cards-envelope', 'iron-gate',
    'lotus-bracelet', 'lotus-tea-packet', 'noodle-bowl', 'orange-delivery-bags', 'photo-frame-facedown', 'receipt-eyeliner', 'sign', 'spark-plug', 'stapled-paper-bag',
    'swinging-tubes', 'torn-bear', 'tv-cai-luong', 'whiteboard',
  ] as const).map((id) => [id, ['director', 'cutscene-only prop (drug packets stay plain grey blocks)'] as const])),
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
