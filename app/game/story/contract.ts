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
 * The campaign (chapters 1–11, wave-2 integration) is checked against CAMPAIGN_CONTRACT: ENGINE_CONTRACT plus the
 * cutscene clips, pair clips, fx and sfx of chapters 4–5 (SCENE_REQUESTS) and the scene vocabulary of chapters 6–11
 * (LATE_SCENE_REQUESTS) — scripts/story-campaign.test.mjs.
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
/**
 * The wave that must play each chapter for real (chapter 1 is the Wave 1 acceptance, c1-m2 end to end). Chapters 6–11
 * need the world lane (fire, festival, power), the police lane (forced stars, the manhunt) and the wave-4 vehicles work
 * (boats, the boat chase, the convoy, helicopters), so they play in wave 4; none of them waits on a `q` query of a lane
 * built later (the escort query of chapter 10 is the stealth lane's, wave 2).
 */
export const CHAPTER_WAVE: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4, 11: 4 };

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
    pursue: ['vehicles', "armed bikers chase {ids, target:'player', meter, unseen: seconds, armed?: 'pipe', spare?: ['pillion']} / {ids, stop:true}; drives the ids itself (a route given to them is ignored while pursuing); pushes 'caught' on contact, 'escaped' when shaken; `spare` keeps their swings off the pillion passenger (c9-m3)"],
    chase: ['vehicles', "chase controllers (chase-wanted.md §5): {id, controller, ride, …}; {k:'stop', id} ends it. counterTail (c3-m1) {start, fill, decay, escapeAfter, catchAt, giveUp, meter 'eye:<ride>'} pushes 'escaped' / 'caught' with the controller id; keepUp (c4-m2) {target, want, floor, ceil, window:{at, from, to}} raises 'rammed'; boatChase (c7-m3, §6) {player:{load, accel, top}, pursuers[], tug:{id, spot, block}, safe:{at, r}, police[], course} pushes 'caught' when the player's boat is pinned or boarded, a pier strike wrecks a pursuer (its crew clings on); pursuers (c9-m2) {rides[], use, armed, target, loseAfter, searchFor, maxRange, meter 'thoat:<ride>'} pushes 'escaped' / 'caught'; allyBlock (c9-m2, c9-m3) {at, after?, prop, crew[]} rolls the beer cart across an alley mouth once the player is through; convoy (c11-m1, §5.7) {ride, target, escorts:{front, rear}, bikers[], armed, want, ceil, crowdSpeed, leap:{lateral, longitudinal, hold}} pushes 'arrived' (the flank is held: the leap), 'lost' and 'escaped'; ally (c11-m1) {ride, mode 'follow' {back} | 'pit' {target, within}} drives Vân's car"],
    wanted: ['police', "story wanted mode (chase-wanted.md §7) {mode 'manhunt'|'cooldown', maxWanted, meter 'nhan-dien', posters 'on', checkpoints[{id, at (site), yaw, width, depth, cars, officers, mode 'screen'}]} (c9-m1 to c9-m3)"],
    escort: ['stealth', "escort groups (escort-boss-qte.md §1) {id, spec?: GroupSpec {id, followers[{id, look, age, hero?, cell?}], leader, order, spacing, hands, start {at, yaw} | {aboard: vehicle} | {cells: true}, safe?[], release}, cmd?: {k:'free'|'follow'|'wait'|'release'} | {k:'park', spot} | {k:'huddle', at} | {k:'board', vehicle}}; a spec with start {cells: true} (or inside a container) spawns its followers caged (§1.3): only 'free' opens them ('freed', then they follow), and 'follow' leaves a caged follower where it is (it only re-forms the line of followers already out); a spec for an existing group id is a no-op (restores rebuild it); with wait, 'board' resolves when everyone is aboard and 'release' when everyone is safe; pushes 'arrived' with the group id when the whole group reaches its release, 'rescued' per follower, 'caught' when one is recaptured; a lit or seen follower raises 'detected' (c7-m2, c7-m3, c10-m2, c10-m3, c11-m1)"],
    festival: ['world', "the Rằm festival (festival-blackout-heli.md §1) {id:'ram-thang-tam', on, river?: true (floating lanterns), troupes?[{id, at, yaw, program 'block', gap}] (the lion dance that closes a junction)} (c10-m1 to c11-m1)"],
    power: ['world', "per-region street power (festival-blackout-heli.md §2.3, world.setPower) {regions: [{id, rect: {minX, maxX, minZ, maxZ} (map/consts.ts Rect, never a bare array), level}]}; the region stays until reset('end') (c10-m1 to c10-m4: the strip dark). Street only: interiors switch their lights with space and stealth variants (§2.6), never with this op; a scene cue {k:'power', region} without a sweep counts as this op"],
    powerSweep: ['world', "the CS09 sign-by-sign blackout (festival-blackout-heli.md §2.4): the scene cue {k:'power', region, sweep: {axis, dark, from, to, step}} steps the dark edge through world.setPower and leaves the rect at the region's level (cs09_dem_ram_mat_dien); outside a scene {region, from, to, step} with wait: true. The mission's power op after the scene is the skip-safe steady state (ch. 10)"],
    heli: ['vehicles', "helicopter modes without a VehicleState (festival-blackout-heli.md §3) {id, mode 'park'|'spool'|'hover'|'stop', at?, livery?, yaw?, rotor?, on?, seconds?, height?, spot? (an actor or vehicle its searchlight holds)} (c6-m1 parked on the pad, c11-m2 and c11-m3 spool-up, hover, the task force)"],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    qte: ['ui', "a quick-time prompt (escort-boss-qte.md §3, story/qte.ts + QtePrompt.tsx) {id, context 'play'|'scene', kind 'press'|'hold'|'mash'|'alternate'|'band', keys, window (real seconds, time scale 1), target?, count? [@keys], anchor? {actor, joint?}, onFail 'continue'|'loop'|'soft-fail', lethal?: false, label @key}; with wait: true it blocks until it resolves 'ok' or 'miss' (a 'loop' QTE only resolves 'ok') and latches {type:'signal', id:'qte', result}; refuses to start while the director's time scale is not 1 (play: c6-m3 tackle and punch, c8-m2 tackle). Scene QTEs are scene.ts cues {k:'qte', …} compiled into the director's Wait: the scene holds its frame until the QTE resolves, the window stays real seconds under the scene's slow motion, 'loop' rewinds to the cue's shot label (CS11 'Lật người!' and the chokehold count, c11m1-ca-bin gun and wheel, CS12 grip and haul) (ch. 6, 8, 10, 11)"],
    riderMap: ['ui', "the {@app} 'Tài xế gần bạn' map on the phone (phone-detective-ui.md §3.7, chase-wanted.md §5.8 tracker blips): {id, title @key, focus site, find blip id, blips[{id, label @key, at}]}; wait: true blocks until the player taps the blip named by find and latches signal riderMap (c6-m3) (ch. 6)"],
    fire: ['world', "fire on a building by site {id, at, stage}: 1 rags alight at the shutter, 2 ablaze with a smoke column and firelight (raises visibility near it), 3 the burnt-out ruin (charred facade, half-down shutter, police tape) that stays while progress flag shopBurnt is set, until the epilogue's XE MÁY ÔNG TƯ (c6-m2, c6-m3) (ch. 6)"],
    monitor: ['ui', "live CCTV monitor wall (CctvView.monitors, phone-detective-ui.md §6.6) {id, title @key, feeds[{cam @key, at}], tag}: keys 1–4 switch feeds at 2 fps; a hostile framed for 1 s is tagged (outline through walls); blocks until closed (signal 'monitor'; c8-m2) (ch. 8)"],
    keypad: ['ui', "safe keypad overlay {id, digits, code, title @key, hint @key}: wrong codes beep and clear, never fail; blocks; resolves 'open' (right code) or 'closed' (Esc) (signal 'keypad', result; c8-m4) (ch. 8)"],
    gondola: ['spaces', "the window-cleaning cradle on a facade, a vertical moving slab (spaces-surfaces-levelkit.md §7.7) {id, at, foot, speed, sweep {every, width}}: S lowers, release stops; a torch sweeps the glass above, lit while moving → {type:'spotted', id}; the foot reached → {type:'arrived', id}; {k:'stop', id} ends it (c8-m4) (ch. 8)"],
    arm: ['core', "a story weapon in Tín's hands for the mission (story mode carries no free-roam weapons): {weapon:'pistol', ammo, from:'van'} (Vân's backup pistol, c9-m3; F fires, bullets book as kills in LƯƠNG TÂM); {weapon:null} hands it back (ch. 9)"],
    pillion: ['core', "a cast member on the Dream's pillion seat {cast} / {cast: null} (escort-boss-qte.md §1.10 host.setPillion: restyles game.ts's passenger; pursuers never swing at her; a crash knocks both down non-lethally and she re-mounts; c9-m3 Cô Ba, c11-m4 Mai) (ch. 9, 11)"],
    duel: ['core', "the Cường Sẹo boss duel (escort-boss-qte.md §2; story/melee.ts, boss-cuong.ts) {id, boss, hp, phases, phase, env[anchors], finishAt, phase3Limit, guns, reset?} / {id, stop:true}: melee lock (Space dodges, F attacks and counters, E shoves into the speaker stacks and the trolley), duel framing; raises signals 'duelPhase' {phase} and 'duelFinish'; down in the duel pushes 'down' (allowDown missions) (ch. 10)"],
    ally: ['stealth', 'ally suppression (escort-boss-qte.md §2.7) {id, suppress:{from, targets[], cover[]}} / {id, stop:true}: Vân holds the side door and pins the targets behind cover, firing at the cover only, never at a person (ch. 10)'],
    tracker: ['ui', 'the GPS tracker blip planted in c7-m2 on the minimap and the phone map (phone-detective-ui.md GPS blip): {id, route, on} moves along a sites.ts route (c10-m4), {id, ride, on} follows a story vehicle (c11-m1), {id, on: false} hides it (ch. 10, 11)'],
    deckJump: ['core', "start the existing deck jump from a deck spot {from, open: true (the canopy is already open: CS 'c11m2-cong-nhay' ends on it), toward}; the glide is the player's and ends with signal 'landed' (ch. 11)"],
    credits: ['ui', 'roll the end credits {lines: @keys (text with {name} and {@key}), music}; blocks until they end or are skipped (c11-m4) (ch. 11)'],
  },
  queries: {
    viewTurned: ['core', 'the orbit camera yaw has moved at least 0.6 rad (args.rad) since the step began (session, from view.yaw; c1-m1 tutorial)'],
    gateCamAway: ['stealth', 'planned: the KHO 7 gate camera is turned away (a timing window; no content yet)'],
    escort: ['stealth', "escort group state {id, all?: 'safe'|'aboard'|'follow'|'parked'|'huddle', count?}: every follower (or at least `count`) is in that state (c10-m2, c10-m3)"],
    lightsOut: ['world', 'planned: a power region is dark {area}'],
  },
  // Engine → runner {type:'signal', id}; content waits with {k:'on', ev:'signal', id} (a `do` op with wait latches its own op id).
  signals: {
    phoneWait: ['ui', 'the phone ĐỢI button was pressed (offerWait)'],
    ranRed: ['core', "the player ran a red light (checkRedLight in story mode: never a crime, one signal per violation; c1-m2 Cô Ba's texts)"],
    rammed: ['vehicles', 'the player hit the keepUp chase target (impulse > 1.5 m/s, chase-wanted.md §5.3); the target swerves (c4-m2)'],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    duelPhase: ['core', 'the duel crossed into a phase: {type:"signal", id:"duelPhase", phase: 2|3} (400 HP, thresholds 264 and 132) (ch. 10)'],
    duelFinish: ['core', 'the duel reached the finisher (≤ 15 % HP or 50 s into phase 3): {type:"signal", id:"duelFinish"} (ch. 10)'],
    landed: ['core', "a parachute glide ended (spaces-surfaces-levelkit.md §7.6): {type:'signal', id:'landed', pad: true on a landable roof slab (the TÀI CHÍNH pad), false anywhere else} (c11-m2) (ch. 11)"],
    heliLanded: ['vehicles', "a story helicopter came down on a pad after its tail rotor was shot out (festival-blackout-heli.md §3.5 'autorotate'): {type:'signal', id:'heliLanded', heli} (c11-m3) (ch. 11)"],
  },
  outfits: {
    'tin-que': ['core', 'Tín from the village: shirt, trousers, sandals, duffel strap'],
    'tin-shipper': ['core', 'Tín in the orange {@app} windbreaker, box pack and half helmet (walker, rider, seated and helmet copies)'],
    'tin-bandaged': ['core', 'Tín after the crash: scraped, left wrist bandaged in a sling, the windbreaker over his shoulders (c4-m3)'],
    'tin-wrist-wrap': ['core', 'Tín in the shipper windbreaker with his left wrist in a tight elastic wrap, no sling (chapter 5, the day after the hospital)'],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    'tin-whistle': ['core', "Tín in the shipper windbreaker with Ông Tư's old police whistle on a cord round his neck, wrist wrap off, soot on the sleeves (from c6-m2 on) (ch. 6)"],
    'tin-ao-tu': ['core', "Tín in Ông Tư's faded dark jacket over the T-shirt, Ông Tư's whistle on its cord (given in c7-m1; worn through chapter 10 and c11-m1; stealth visibility ×0.9) (ch. 7, 8, 9, 10, 11)"],
    'tin-waiter': ['core', "Tín in a catering waiter's black vest and white shirt over his jeans (c8-m3 gala) (ch. 8)"],
    'tin-ao-mua': ['core', "Lâm's old bat-wing raincoat over the orange shipper windbreaker and Lâm's full-face helmet, visor down (the manhunt disguise, c9-m1) (ch. 9)"],
    'tin-khuan-vac': ['core', "the keg porter: Tám Hổ's yellow-trimmed apron over a plain shirt and a cap pulled low (c9-m2) (ch. 9)"],
    'tin-huyen-thoai': ['core', "the 'Áo {@app} huyền thoại' outfit unlocked at the end: the orange windbreaker faded and patched, Ông Tư's whistle on its cord (c11-m4) (ch. 11)"],
  },
  models: {
    dream: ['core', "Tín's own underbone bike: the player's bike placed and restyled by the core (story id 'dream', never shown as a brand)"],
    coach: ['vehicles', 'the Mekong xe đò (vehicle-models coach body)'],
    'reefer-van': ['vehicles', 'refrigerated van, golden-lotus windscreen pass ("SV · XE ƯU TIÊN"), plate 51D-207.19 sprite'],
    scooter: ['vehicles', 'generic scooter for riders (Rắn Đen bikers)'],
    'suv-den': ['vehicles', 'the existing suv body, black paint, tinted windows, plate 51K-660.13 (c3-m1 counter-tail, the chase op drives it; ev-xe-den); the CS04 T-bone ride (no plate shown)'],
    'vios-van': ['vehicles', "Vân's old silver sedan (parked at KHO 7 in c3-m2; never named in text)"],
    'white-van': ['vehicles', 'white 16-seat passenger van: sliding door on the right, clear rear window, tinted sides, plate 51B-217.07 sprite, driver and passenger seats (c4-m2)'],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    'limo-den': ['vehicles', "Phượng's black limousine (sedan body, black with a thin gold line, tinted glass, plate 51A-868.68 sprite); her driver at the wheel; in cutscenes its rear window lowers halfway (c6-m1 tail, c6-m3 funeral) (ch. 6)"],
    speedboat: ['vehicles', "the hire speedboat (boats.ts 'speedboat' body) as a story vehicle the player drives ('ca-no'); a vehicle act with a route and no driver drifts it at the cruise speed (c7-m2: lights off, not a detection target) (ch. 7)"],
    'speedboat-dark': ['vehicles', 'enemy speedboat (chase-wanted.md §6.1): paint #1d2024, a gunman seated at the bow; driven by the boatChase controller (ch. 7)'],
    tug: ['vehicles', "the ring's tug (boatGeometry('fishing') ×1.3, wheelhouse, a fake-cone searchlight that tracks the player in the chase) (ch. 7)"],
    'police-boat': ['vehicles', "Thiếu tá Lộc's river-police boat: speedboat repaint dark blue #1f3f78 and white, light bar (ch. 7)"],
    'barge-container': ['vehicles', "boats.ts' traffic barge switched to anchored at its site in chapter 7 (lane suspended; hull obstacle for swimmers and boats through addHull), container-deck variant with the wheelhouse searchlight (ch. 7)"],
    'catering-van': ['vehicles', 'a white catering van with its rear doors open, racks of vests and glassware inside (the theatre service lane, c8-m3) (ch. 8)'],
    'ba-gac': ['vehicles', "Tám Hổ's keg ba gác (vehicle-models 'bagac' body) parked by the bia hơi's side wall, kegs in its bed (story-decisions.md §7) (ch. 9)"],
    ambulance: ['vehicles', 'city ambulance (white van body, red cross, light bar), parked with its rear doors open (ch. 10)'],
    'reefer-truck': ['vehicles', "Lực's refrigerated truck: box body with the golden-lotus decal, climbable rear ladder, padlocked rear doors (chase-wanted.md §5.7 FLEET 'truck' cargo 'box'; c11-m1) (ch. 11)"],
    'heli:sen-vang': ['vehicles', "Phượng's helicopter: the police heli model and flight code in the black-and-gold livery with the golden-lotus tail (festival-blackout-heli.md §3.2 LIVERIES.senVang; c11-m2, c11-m3) (ch. 11)"],
    'heli:task-force': ['vehicles', "the Ministry task force's helicopter, white and blue with a red pinstripe, searchlight; it holds its hover off the pad (LIVERIES.taskForce; c11-m3) (ch. 11)"],
  },
  templates: {
    watchdog: ['stealth', 'Mực and the chained yard dog (stealth-owned watchdog, not animals.ts)'],
    'ran-den': ['stealth', 'Rắn Đen thug (guard template; also a biker driver)'],
    'captive-teen': ['director', 'teenage victim extra; dignified poses only (POSES_DIGNIFIED)'],
    'captive-uniform': ['director', 'victim in a factory uniform being led (dignified poses only)'],
    'captive-child': ['director', 'child victim extra (dignified poses only; c7 container 07, c10 B2)'],
    'captive-adult': ['director', 'adult victim extra (dignified poses only; c7 container 07, c10 B2, c11-m1 the reefer truck)'],
    resident: ['director', 'a borrowed street-life resident (npcs.ts role) used as a customer or bystander'],
    worker: ['director', 'packing-line worker in a rubber apron (CS03)'],
    villager: ['director', 'Tân Thuận villager on the lotus-pond dykes (CS01)'],
    'ward-cop': ['director', 'ward police officer at the wheel of the patrol car (c2-m2)'],
    'van-driver': ['director', 'the reefer-van driver seen through the windscreen (c2-m2)'],
    'debt-collector': ['director', "the ring's debt collector in black who pastes the notice (CS01)"],
    secretary: ['stealth', 'the Ánh Dương secretary: a non-hostile watcher with a vision cone, never fights (director look "secretary"; c4-m1)'],
    clubber: ['director', 'dance-floor extra (Moonlight crowd, strobe cutscene; c5-m3)'],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    bodyguard: ['director', "Phượng's bodyguards in dark suits, earpieces: cutscene extras (c6-m1) and, in c8-m3, men who follow Tín out at a distance (running is failed by the script, not by a guard brain) (ch. 6, 8)"],
    'river-cop': ['director', 'river-police extra: dark-blue uniform, life vest (c7-m3 handover) (ch. 7)'],
    'desk-guard': ['stealth', "a building or bank desk guard: neutral, innocent, a vision cone over the lobby; asks the runner's authored question, never fights (c8-m1, c8-m4) (ch. 8)"],
    orderly: ['director', 'hospital orderly in scrubs, clogs and a hanging ID badge (innocent; the real ones of c8-m2) (ch. 8)'],
    'fake-orderly': ['stealth', "a Rắn Đen in orderly scrubs with the tells (leather shoes, no badge, a snake tattoo at the wrist); tag 'gurney' pushes an empty gurney along his patrol, tag 'syringe' waits at a door; guard brain (c8-m2) (ch. 8)"],
    nurse: ['director', "nurse at the nurses' station (innocent; c8-m2) (ch. 8)"],
    patient: ['director', 'ward patient in hospital pyjamas, in bed or sitting up; a witness who feeds the panic meter (c8-m2) (ch. 8)'],
    'floor-manager': ['stealth', 'the gala floor manager: a non-hostile watcher whose cone drains the waiter cover fast while the player stands idle (c8-m3) (ch. 8)'],
    'gala-guest': ['director', 'gala guest in evening clothes, a glass in hand (innocent; c8-m3, CS08 extras) (ch. 8)'],
    'cai-luong': ['director', 'cải lương performer in full stage costume (scene extras on the stage, CS08) (ch. 8)'],
    shipper: ['director', 'lunch-rush rider in an orange delivery windbreaker and half helmet (TTTM crowd, c9-m1; recognition shipperCrowd) (ch. 9)'],
    'ho-vang': ['director', "Hổ Vàng street-gang man in the yellow shirt (#d8a020): Tám Hổ's men at the alley mouths (c9-m2, c9-m3), the back gate, the fake brawl and the crowd (c10-m1) (ch. 9, 10)"],
    'lantern-kid': ['director', 'a child of the lantern parade with a star lantern on a stick (pose carry-lantern) (ch. 10)'],
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
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    'tiem-chay': ['stealth', "SỬA XE TƯ on fire, variant 'lua': the roofs of the ĐƯỜNG HOA SỮA row (tin is loud; bamboo scaffold; the PHỞ roof gap), the back alley and the burning shop space; Rắn Đen flashlights sweep the roofs from the street and the alley; firelight raises visibility near the shop; the fire's roar masks footsteps in the alley (×0.6); smoke ceiling 1.2 m in the shop (c6-m2) (ch. 6)"],
    'sa-lan-07': ['stealth', "the anchored barge SÀ LAN 07 (map overlay on the hull of SITES['sa-lan-07']): steel deck (surface 'metal', running clangs), six containers in two rows with 1 m side walks and cross gaps (dark gaps are hide spots for bodies; container doors are 'container' hide spots), the wheelhouse searchlight (SearchlightSpec, operator 'gac-den' on the roof, sweeps water and deck; a swimmer or a follower in the beam raises 'detected' {id:'den-pha'}; a moving swimmer is lit, a floating-still one in the rain is not), tyre fenders and the stern ladder; variant 'day' (c7-m1: guards watch a passing tourist boat, cones only with T) and 'night' (c7-m2: rain, flashlights, two chatting pairs that split on their patrol waits) (ch. 7)"],
    'phu-my': ['stealth', "CHUNG CƯ PHÚ MỸ: variant 'lobby' (public, shipper cover, the desk guard), variant 'stairs' (fire-stair landings: dark corners as escort hide spots, hitmen with flashlights and silenced pistols, guns 'loot') (c8-m1) (ch. 8)"],
    'benh-vien': ['stealth', "3rd-floor ward, variant 'day': wards public, linen room and stairwell staff-only (visitor cover); innocents in the bays fill the panic meter when they see violence (c8-m2) (ch. 8)"],
    'nha-hat': ['stealth', "the theatre, variant 'gala': foyer and hall public (waiter cover), kitchen staff, backstage and the catwalk restricted; the cải lương drum and cymbals are timed sound-cover windows (meter 'sound:san-khau') for moving on the loud steel catwalk; a heritage site: takedowns off, the catwalk guard is slipped past (c8-m3) (ch. 8)"],
    'ngan-hang': ['stealth', "NGÂN HÀNG KIM THÀNH: variant 'lobby' (shipper cover, the desk guard), variant 'floor20' (three sweeping CCTV cones, a photographed camera shows its cone for good; the glass corridor lit), variant 'floor20-dark' (the fuse box cut: the corridor light field at night ambient, cam3 at the corridor mouth dead, cam1 and cam2 on their own battery) (c8-m4) (ch. 8)"],
    'gac-co-ba': ['stealth', "the attic searched by two ward officers, variant 'search': the floor hollow is a 'floor-hollow' hide spot with hold-breath (X) while a searcher is within 3 m; no takedowns (c9-m1) (ch. 9)"],
    'bia-hoi': ['stealth', "the bia hơi's sidewalk tables, front storeroom and back gate, variant 'night': the porter cover, Lực's bodyguard watching the street, the drinkers as recognition witnesses (c9-m2) (ch. 9)"],
    'quan-co-ba': ['stealth', "CÀ PHÊ CÔ BA's ground floor in its 'raid' variant and the Chợ An Hòa lane: raiders in fake police vests with pipes, stalls as cover, Cô Ba escorted (B), Mực following her (c9-m3) (ch. 9)"],
    'ram-pho-dem': ['stealth', "the strip on Rằm night, variants 'lit' and 'dark': festival crowd zones (walking among the lantern crowds blends), the lion-dance drum rolls as sound cover (×0.25 within 25 m), the back alley, the downpipe and the north-row roofs (tin, loud), the transformer box (ch. 10)"],
    'moonlight-b2': ['stealth', "TẦNG HẦM B2, variant 'b2-dark': cold room (three flashlights, the walk-in freezer body hide), security office (cameras monitored until switched off), cell corridor, side storeroom SafeSpot, staff stairs; muffled drum cover ×0.5; recaptured followers are walked back to their cells (ch. 10)"],
    'thap-68': ['stealth', 'the 68th-floor deck of THÁP PHƯƠNG NAM: social cover only (shipper), no guards, the deck staff and moon-watchers are innocent (no takedown prompt; c11-m2) (ch. 11)'],
    'san-do': ['stealth', 'the TÀI CHÍNH roof pad: stair housing, AC units, fuel cart, the parked or hovering helicopter; rotor wash pushes and masks noise ×0.3 within 20 m (c11-m3) (ch. 11)'],
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
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    'cover:visitor': ['stealth', 'VỎ BỌC KHÁCH integrity 0..1: a tourist on a hired speedboat (c7-m1: stopping, circling or closing within 15 m of the barge fills it; 1 is blown) and a hospital visitor (c8-m2) (ch. 7, 8)'],
    'hull:ca-no': ['vehicles', "the player boat's hull health 0..1 in the boat chase (host hook H-7; at 0 the boat sinks and its state becomes 'wrecked') (ch. 7)"],
    'cover:waiter': ['stealth', 'waiter cover integrity 0..1 (c8-m3) (ch. 8)'],
    'panic:benh-vien': ['stealth', 'HOẢNG LOẠN 0..1: patients who see violence fill it; full sends the third impostor to Diễm early (c8-m2) (ch. 8)'],
    'sound:san-khau': ['stealth', "the show's sound-cover window 0..1, pulsing with each drum or cymbal hit (c8-m3) (ch. 8)"],
    breath: ['stealth', 'breath left while holding it in a hide spot 0..1 (X held, stealth-player-kit.md §5.2; c8-m4) (ch. 8)'],
    'nhan-dien': ['police', "the manhunt recognition meter 0..1 (chase-wanted.md §7.2): witnesses who see Tín's face fill it; rain, the raincoat with the full-face helmet, the porter cover and crowds slow it; full → a witness calls the police (1 star) (ch. 9)"],
    'thoat:suv-luc': ['vehicles', "getting away from Lực's black SUV 0..1 (the pursuers controller's unseen seconds / loseAfter; c9-m2) (ch. 9)"],
    'trong-lan': ['audio', 'the lion-dance drum cover at the player 0..1 (lion-dance.ts coverAt with distance falloff; 1 = a roll masks noise) (ch. 10)'],
    'escort:b2': ['stealth', 'followers of the B2 group with the player (count, max 17) (ch. 10)'],
  },
  abilities: {
    phone: ['ui', 'the phone (P)'], appOrders: ['ui', '{@app} orders on the phone'], crouch: ['stealth', 'Rón rén (X)'],
    soNo: ['ui', 'SỔ NỢ debt widget'], phoneCamera: ['ui', 'camera viewfinder (P with a photo objective)'], headlight: ['core', 'headlight toggle (L)'],
    floatStill: ['spaces', 'Nổi im: float still in dark water'], observe: ['stealth', 'Quan sát (hold T): guard cones, audio clues and tagged guards (unlocked in c3-m2)'],
    whistle: ['stealth', "Ông Tư's whistle (K): a lure that draws one guard to the sound (unlocked in c6-m2)"], faceCover: ['core', 'face cover (U) (unlocked in c5-m1)'],
    lean: ['stealth', 'lean and peek at a cover edge (A/D, stealth-player-kit.md §3.4; c3-m3)'], throw: ['stealth', 'throw a bolt, coin or bottle (G, §6.1; c3-m3)'],
    takedown: ['stealth', "takedown from behind: tap E Hạ nhanh, hold E Khóa cổ (§4); with countConscience:false it pushes {type:'takedown', id, cause:'fast'|'choke'|'slip'} and no 'knockout' (c3-m3)"],
    drag: ['stealth', 'drag a knocked-out body (hold E, §9.2; c3-m3)'],
    phoneSilent: ['ui', 'phone silent mode: rings become a 3 m vibration (phone-detective-ui.md §3; c3-m3)'], luongTam: ['ui', 'the LƯƠNG TÂM page of the pause menu (knockouts vs kills; c3-m3)'],
    clipCam: ['ui', "clip-on camera: CameraView mode 'clip', recording progress while the framing holds (q ≥ 0.5), paired with the eavesdrop meter (c5-m3)"],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    riderMap: ['ui', "the 'Tài xế gần bạn' map in the {@app} app (phone-detective-ui.md §3.7; c6-m3) (ch. 6)"],
    chapterSelect: ['ui', 'chapter select in the story menu once the campaign is over (c11-m4) (ch. 11)'],
    luatOngTu: ['ui', "the 'Luật của Ông Tư' badge on the LƯƠNG TÂM page: the campaign ended with a clean record (conscience tier 'clean': no kill and no innocent hurt, flags.ts conscienceTier) (c11-m4) (ch. 11)"],
  },
  props: {
    'photo-pinned': ['director', 'photo of Má and Mai pinned on the attic wall'], duffel: ['director', "Tín's duffel bag"],
    scooter: ['world', "Bà Sáu's scooter ('upright' | 'fallen')"], 'che-pots-spilled': ['world', 'spilled chè pots'],
    floodlight: ['world', 'gate floodlight (fake cone and decal, no THREE light)'],
    sign: ['world', "story sign prop by variant: 'cho-thue' (KHO CHO THUÊ on the KHO 7 gate; story-decisions §7 world requests; c3-m2)"],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    'le-chua': ['world', "CHÙA AN HÒA yard dressing by variant: 'phat-gao' (trestle tables with rice sacks, kneeling mats, the MÁI ẤM {@ringUpper} banner on two poles at the gate; c6-m1) | 'dam-tang' (altar with Ông Tư's portrait, white cloth, wreaths, incense: the prayer service of c6-m3) (ch. 6)"],
    'iron-box': ['director', "Ông Tư's 2014 iron box, dented green paint (on a desk, a roof edge, under a water tank, at the foot of a downpipe; cutscenes: in arms, 'open' variant, and 'false-bottom': the floor under the three documents lifted, a folded slip in Ông Tư's hand on top as text lines) (ch. 6)"],
    'xe-che': ['world', "Bà Sáu's chè cart with a tarp skirt, a 'tarp' hide spot under it (stealth-player-kit.md §5.1; c9-m1, helpedBaSau) (ch. 9)"],
    'pistol-floor': ['director', "the pistol Cường tossed away, lying on the dance floor by Tín's hand: a prop, never a pickup (ch. 10)"],
    'hanging-truck': ['world', "the reefer truck through the BẠCH ĐẰNG railing, cab over the water, box on the promenade, rear doors padlocked; variant 'tilt-0'…'tilt-3' as it slides (c11-m1) (ch. 11)"],
    'broken-railing': ['world', 'the torn section of the promenade railing at (219.3, -134.6) (c11-m1) (ch. 11)'],
  },
  carry: {
    duffel: ['core', 'duffel bag in hand'], 'order-banh-mi': ['core', 'delivery: bánh mì'], 'order-hoa': ['core', 'delivery: flowers'],
    'order-pho': ['core', 'delivery: phở'], 'order-mua': ['core', 'delivery in the rain'], 'tui-giay': ['core', 'the pharmacy paper bag'],
    'order-com': ['core', 'delivery: five boxed cơm tấm in a plastic bag (c4-m1)'], 'order-banh-kem': ['core', 'delivery: the big ice-cream cake for the DJ booth (no running; c5-m3)'],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    'bao-gao': ['core', 'a 10 kg rice sack on one shoulder: the volunteer cover at the pagoda (walk only; c6-m1) (ch. 6)'],
    'hop-sat': ['core', "Ông Tư's 2014 iron box in both arms: speed cap 2.6 m/s, no running, no climbing (stealth-player-kit.md §3.3; set down with E to climb; c6-m2) (ch. 6)"],
    'bich-cam': ['core', 'a plastic bag of oranges for a patient (visitor cover prop, not a carried object for the guards; c8-m2) (ch. 8)'],
    'khay-ly': ['core', "a waiter's tray of glasses (cover prop; 3.2 m/s cap; running drops it and breaks the cover; c8-m3) (ch. 8)"],
    'bom-bia': ['core', 'a 30-litre beer keg on the shoulder: speed capped at 2.2 m/s, part of the porter cover (stealth-player-kit.md §3.3) (ch. 9)'],
    'order-banh-trung-thu': ['core', 'delivery: twenty boxes of mooncakes in a tall stack (no running; c11-m2) (ch. 11)'],
  },
  poses: {
    'sit-stool': ['core', 'player sits on a stool'], sleep: ['core', 'player lies down to sleep'], limp: ['core', 'player limps: walk speed capped at 1.4 m/s, a limp cycle (used with lock run; c4-m3)'],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    kneel: ['core', 'player kneels on a mat with the worshippers, hands together: the kneel blends in a crowd (eavesdrop counts as hidden; c6-m1) (ch. 6)'],
    support: ['core', 'supported walk: Diễm on the right shoulder, 1.3 m/s, no run, crouch or climb (escort-boss-qte.md §1.10; c8-m1) (ch. 8)'],
  },
  acts: {
    sleep: ['director', 'asleep, or out cold on the floor after a chokehold (Cường in c10-m3, breathing, no injury shown)'], chained: ['stealth', 'chained dog idle'], 'arrange-flowers': ['director', 'florist at work'], 'cross-arms': ['director', 'arms crossed'],
    'fix-bike': ['director', 'Ông Tư at the bike'], 'hold-bags': ['director', 'holding shopping bags'], 'kettle-pour': ['director', 'pouring from a kettle'],
    ladle: ['director', 'ladling soup'], 'night-window': ['director', 'pharmacist at the night window'], 'pace-happy': ['director', 'pacing, pleased'],
    'phone-bored': ['director', 'bored on the phone'], serve: ['director', 'serving a customer'], 'sit-ground-rub-knee': ['director', 'sitting on the ground rubbing a knee'],
    'sit-stool-phone': ['director', 'on a stool with a phone'], 'stand-bow': ['director', 'a small bow'],
    'board-van': ['director', 'the led group climbs into the van one by one, heads down (dignified; c2-m2 photo window)'],
    'desk-head-down': ['director', 'at a desk, eyes on the paperwork, never looking up (c1-m2 receptionist)'],
    'answer-phone': ['director', 'turns her back to the room and talks on the desk phone (her cone faces the wall; c4-m1)'],
    'talk-phone': ['director', 'on a mobile call, pacing a little (the talk-phone clip as a loop; c4-m1)'],
    'dj-booth': ['director', 'DJ at the booth: one hand on the headphones, nodding to the beat (c5-m3)'],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    'light-incense': ['director', 'lights incense sticks at the urn and bows with them (Phượng, the abbot, Bin; c6-m1, c6-m3) (ch. 6)'],
    'kneel-pray': ['director', 'kneels on a mat, hands together, eyes down (worshippers, Vân; c6-m1) (ch. 6)'],
    chant: ['director', 'the abbot chants at the altar, tapping the wooden fish (c6-m3 funeral) (ch. 6)'],
    'pack-suitcase': ['director', 'stuffing clothes into an open suitcase, fast, looking at the door (c8-m1) (ch. 8)'],
    'syringe-ready': ['director', 'standing at a door, one hand on the handle, the other in a scrubs pocket (c8-m2) (ch. 8)'],
    speech: ['director', 'at a microphone on a stage, one hand raised to the room (c8-m3) (ch. 8)'],
    'toast-glass': ['director', 'seated at a table, raising a glass to the person beside him (c8-m3) (ch. 8)'],
    mingle: ['director', 'gala guests chatting in a loose group, glasses in hand (c8-m3) (ch. 8)'],
    'sip-tea': ['director', 'seated, sipping tea from a small cup, unhurried (c8-m3) (ch. 8)'],
    'wipe-brow': ['director', 'seated, dabbing the forehead with a damp handkerchief (c8-m3) (ch. 8)'],
    'eat-noodles': ['director', 'at a desk, head down over a bowl of phở, chopsticks (c8-m4) (ch. 8)'],
    'crack-peanuts': ['director', 'seated, cracking peanuts from a plate (Tám Hổ) (ch. 9)'],
    'drink-beer': ['director', 'seated at a plastic bia hơi table, a glass of beer, chatting (Lực, the drinkers, the drunk) (ch. 9)'],
    'sweep-leaves': ['director', 'sweeping leaves slowly with a bamboo broom (Thầy Minh Tịnh at the pagoda gate) (ch. 9)'],
    'wounded-lie': ['director', 'lying on the stairs, alive, eyes half open, a folded cardigan pressed to his side (no blood) (ch. 10)'],
    'cuffed-behind': ['director', 'kneeling with the wrists cuffed behind the back (escort-boss-qte.md §2.9) (ch. 10)'],
    stretcher: ['director', 'lying on an ambulance stretcher with an oxygen mask, alive (ch. 10)'],
    'watch-moon': ['director', 'a moon-watcher at the deck rail, phone raised at the full moon (c11-m2) (ch. 11)'],
    'load-crates': ['director', 'a bodyguard carrying a sealed crate to the helicopter door and back (c11-m3) (ch. 11)'],
    'hold-hand': ['director', "stands holding a child's hand by the stair housing: no pulling, no strike (c11-m3) (ch. 11)"],
    'hide-crouch': ['director', 'a child crouched behind cover, hands over her ears (dignified; c11-m3 Su) (ch. 11)'],
  },
  locks: { run: ['core', 'no running'], vehicle: ['core', 'no mounting vehicles'], fire: ['core', 'no weapons'], move: ['core', 'no movement'], phone: ['core', 'no phone'] },
  music: {
    'neon-night': ['audio', 'phố đèn neon bed'], pulse: ['audio', 'danger pulse'], tension: ['audio', 'low strings under CS03'],
    'theme-home': ['audio', 'the home theme (đàn bầu)'], 'theme-loss': ['audio', 'the home theme, slow and bare (dawn after KHO 7)'],
  },
  stings: {
    'pagoda-bell': ['audio', 'pagoda bell'], 'roller-door': ['audio', 'a van roller door slamming down'],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    'tug-horn': ['audio', "the tug's horn, long and low, across the river in the rain (ch. 7)"],
  },
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
  scenePoses: {
    ...Object.fromEntries(([
      'crouch', 'lie-flat', 'sit', 'sit-chair', 'sit-hug-knees', 'sit-on-bike', 'sit-stool', 'squat', 'stand', 'step-down', 'work-table', 'walk',
      'stand-head-down', 'walk-led', 'hold-hands', 'shield-younger', 'hum', 'dance',
    ] as const).map((id) => [id, ['director', 'held pose for a placed actor or an extras batch (captives: POSES_DIGNIFIED only; dance: the club floor, c5-m3)'] as const])),
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    kneel: ['director', 'kneeling on a mat or on the floor (worshippers; Tín beside Ông Tư in CS06) (ch. 6)'],
    'carry-lantern': ['director', 'a child holding a star lantern on a stick, arm forward and up (festival-blackout-heli.md §1.5) (ch. 10)'],
    'phone-up': ['director', 'holding a phone up, screen lit (the firefly phones of CS09) (ch. 10)'],
    'hands-up': ['director', 'both hands raised in surrender (CS11 the five men, CS12 the pilot) (ch. 10, 11)'],
  },
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
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    banner: ['director', 'a cloth banner on two poles with text lines (the MÁI ẤM banner, CS05) (ch. 6)'],
    'rice-sacks': ['director', 'stacked rice sacks on a trestle table (ch. 6)'],
    incense: ['director', 'lit incense sticks (held or in an urn) (ch. 6)'],
    'jade-bangle': ['director', "Phượng's jade bangle on her wrist (ch. 6, 11)"],
    wrench: ['director', 'a big wrench (ch. 6)'],
    whistle: ['director', "Ông Tư's old police whistle on its cord (round his neck, then on Tín's chest) (ch. 6, 7, 11)"],
    'coffee-cup': ['director', 'a glass of black coffee (ch. 6)'],
    portrait: ['director', 'a framed portrait photo with a caption line (the funeral altar, the epilogue portraits of Ông Tư and Hải) (ch. 6, 11)'],
    wreath: ['director', 'a white funeral wreath on a stand with a ribbon (text lines) (ch. 6)'],
    jacket: ['director', "Ông Tư's faded dark jacket, folded (handed over, then worn) (ch. 7)"],
    radio: ['director', 'a handheld police radio (ch. 7)'],
    'zip-ties': ['director', 'a bundle of black plastic zip ties (ch. 7)'],
    'gps-tracker': ['director', 'a matchbox-sized GPS tracker (ch. 7)'],
    padlock: ['director', "a container padlock (variant 'cut': the shackle snapped) (ch. 7)"],
    'bolt-cutters': ['director', 'long-handled bolt cutters (ch. 7, 11)'],
    'lotus-cardboard': ['director', 'a scrap of cardboard with a lotus drawn in charcoal (ch. 7)'],
    blanket: ['director', 'a grey emergency blanket, round the shoulders or folded (ch. 7, 10)'],
    'cup-hot': ['director', 'a paper cup of hot water, steaming in the rain (ch. 7)'],
    suitcase: ['director', 'an open suitcase with clothes stuffed in (ch. 8)'],
    'photo-frame': ['director', 'a framed photo (text caption) (ch. 8)'],
    'usb-drive': ['director', 'a small USB drive (ch. 8)'],
    'lotus-hairclip': ['director', "Mai's lotus-shaped plastic hairclip (ch. 8)"],
    'black-ledger': ['director', "Bảo's black-covered ledger (sổ chi) (ch. 8)"],
    gondola: ['director', 'the window-cleaning cradle on the bank facade, drawn for the scene (ch. 8)'],
    'tv-news': ['director', 'a TV showing a news bulletin (text lines: headline and strap, or a ticker) (ch. 8, 9, 11)'],
    gurney: ['director', 'an empty hospital gurney (ch. 8)'],
    'medical-tray': ['director', 'a steel tray with gauze and a covered dish (ch. 8)'],
    oranges: ['director', 'a plastic bag of oranges (ch. 8)'],
    floorboard: ['director', 'the loose attic floorboard over the hollow (lifted away) (ch. 9)'],
    'raincoat-helmet': ['director', 'a folded bat-wing raincoat and an old full-face helmet (ch. 9)'],
    'peanut-plate': ['director', 'a plate of peanuts and glasses of beer on a plastic table (ch. 9)'],
    'apron-cap': ['director', "a folded porter's apron with a cap on top (ch. 9)"],
    keycard: ['director', "Quang's black lift keycard printed with a golden lotus (ch. 9, 10)"],
    'bulletproof-vest': ['director', 'a police-issue bulletproof vest (ch. 9)'],
    'beer-cart': ['director', 'a street beer cart with crates, dragged across an alley mouth (ch. 9)'],
    'lift-display': ['director', "the lift's floor display (text: 1, B1, B2) (ch. 10)"],
    pistol: ['director', 'a small black pistol (prop only, never fired on screen) (ch. 10, 11)'],
    'broken-bottle': ['director', 'a broken bottle neck (ch. 10)'],
    'plastic-cuffs': ['director', 'a pair of plastic zip cuffs (ch. 10)'],
    mooncake: ['director', 'a lotus-seed mooncake in its paper wrapper (CS10 and the ambulance: a little dented; c11-m4 the one Mai kept) (ch. 10, 11)'],
    'folded-cardigan': ['director', "Mai's pale blue cardigan folded into a pad (ch. 10)"],
    stretcher: ['director', 'an ambulance stretcher (ch. 10)'],
    'so-goc-case': ['director', 'a hard black case holding the master ledger ("sổ gốc") (ch. 11)'],
    parachute: ['director', 'the deck-jump canopy and harness, opening (ch. 11)'],
    helmet: ['director', "Tín's cream half helmet with the lotus sticker (ch. 11)"],
    'beer-glass': ['director', 'a glass of draught beer (ch. 11)'],
    newspaper: ['director', 'a folded newspaper, its front-page headline readable (ch. 11)'],
    'golden-lotus-pin': ['director', 'a small golden-lotus lapel pin (ch. 11)'],
  },
  rideModels: {
    sedan: ['director', 'scripted car of the plate test (vehicle-models sedan body)'], police: ['director', 'ward patrol car'],
    forklift: ['director', 'KHO 7 forklift'], sampan: ['director', 'xuồng on the lotus pond'],
    // chapters 6–11 (content/ch06.ts … ch11.ts ENGINE_NEEDS)
    'lift-cab': ['director', 'the staff lift cab sinking down its shaft (CS09) (ch. 10)'],
    'reefer-truck': ['director', 'the reefer truck as a cutscene ride (CS c11m1-lan-can) (ch. 11)'],
    'heli:sen-vang': ['director', 'the black-and-gold helicopter as a cutscene ride (ch. 11)'],
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
 * CONTRACT_REQUESTS, content/ch05.ts ENGINE_NEEDS). They stay apart from ENGINE_CONTRACT's tables because
 * scripts/story-content.test.mjs checks that every clip, pair clip, fx and sfx id there is used by a cutscene it loads,
 * and it loads chapters 1–2 only (story-contract.test.mjs checks this table against chapters 1–5). The director compiles
 * every chapter against CAMPAIGN_CONTRACT, which merges the three tables.
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

/**
 * Cutscene clips, pair clips, fx, sfx, ambience beds and hidden meshes of chapters 6–11 (content/ch06.ts … ch11.ts
 * ENGINE_NEEDS), owned by their lanes like SCENE_REQUESTS. story-content.test.mjs checks every clip, pair clip, fx, sfx,
 * grade, mesh and ambience id of ENGINE_CONTRACT against the cutscenes of chapters 1–2 and story-contract.test.mjs checks
 * SCENE_REQUESTS against chapters 1–5, so the later chapters' scene vocabulary lives here; story-campaign.test.mjs checks
 * all three tables against the cutscenes of chapters 1–11 (every id used, none listed twice, one lane each).
 */
export const LATE_SCENE_REQUESTS: Readonly<Partial<Record<ContractKind, Readonly<Record<string, ContractEntry>>>>> = {
  clips: {
    'light-incense': ['director', 'lights three incense sticks from a candle and raises them to the forehead (ch. 6)'],
    'grip-wrench': ['director', 'lifts a big wrench from the bench and weighs it in his hand (Ông Tư, CS06) (ch. 6)'],
    'hand-falls': ['director', "a seated man's hand slips from his chest and comes to rest on the floor (CS06; no wound) (ch. 6)"],
    salute: ['director', 'a police salute (Vân in plain clothes at the funeral, the CS12 colonel, Vân to the portraits in the epilogue) (ch. 6, 11)'],
    'set-down': ['director', 'bends and sets a large object down on the ground (the funeral wreath) (ch. 6)'],
    'knock-mo': ['director', 'taps the wooden fish (mõ) in time while chanting (ch. 6)'],
    'vault-rail': ['director', 'a hand on the rail, a vault over it and down into a seat below (slow motion in CS c7m3-nhay) (ch. 7)'],
    'point-at': ['director', 'an arm raised, pointing straight at someone (ch. 7)'],
    'radio-talk': ['director', 'a handheld radio raised to the mouth, thumb on the talk button (ch. 7)'],
    'hold-frame': ['director', 'one-actor scene clip: holds a framed photo in both hands and looks at it (c8-m1) (ch. 8)'],
    'peek-peephole': ['director', 'one-actor scene clip: leans to a door and looks through the peephole (c8-m1) (ch. 8)'],
    'screw-silencer': ['director', 'one-actor scene clip: threads a silencer onto a pistol barrel, eyes on the door (no aim, no shot; c8-m1) (ch. 8)'],
    'sip-tea': ['director', 'one-actor scene clip: lifts a small cup and sips (CS08) (ch. 8)'],
    'slide-envelope': ['director', 'one-actor scene clip: slides an envelope across a table with two fingers (CS08) (ch. 8)'],
    'phone-to-ear': ['director', 'one-actor scene clip: paces with a mobile pressed to the ear (c8-m4) (ch. 8)'],
    'cover-mouth': ['director', 'one-actor scene clip: crouched, a hand pressed over his own mouth (c8-m4) (ch. 8)'],
    'switch-off-tv': ['director', 'one-actor scene clip: reaches up and switches off a wall TV (c8-m4) (ch. 8)'],
    'pull-shutter': ['director', 'one-actor scene clip: pulls a roller shutter halfway down with a hook (c8-m4) (ch. 8)'],
    'crack-peanuts': ['director', 'one-actor scene clip: cracks a peanut between thumb and finger, flicks the shell away (ch. 9)'],
    sip: ['director', 'one-actor scene clip: a slow sip from a glass, seated (ch. 9)'],
    'reach-up': ['director', 'one-actor scene clip: stands on a stool and reaches up into a ceiling vent (ch. 9)'],
    sweep: ['director', 'one-actor scene clip: unhurried strokes of a bamboo broom (ch. 9)'],
    'open-cupboard': ['director', 'one-actor scene clip: opens a tall cupboard and takes something out with both hands (ch. 9)'],
    'touch-whistle': ['director', "touches Ông Tư's whistle on its cord at his chest (ch. 10)"],
    'wipe-tears': ['director', 'wipes her face with the back of a hand (a gentle clip for a rescued person) (ch. 10)'],
    'aim-pistol': ['director', "raises a pistol at arm's length, never fired on screen (CS11 Cường, c11-m1 Vân, CS12 Phượng) (ch. 10, 11)"],
    'leap-down': ['director', 'vaults a balcony rail and drops (lands out of frame) (ch. 10)'],
    'toss-away': ['director', 'tosses an object away to the side (ch. 10)'],
    'crack-wrists': ['director', 'cracks his wrists and rolls his neck (ch. 10)'],
    'raise-bottle': ['director', 'raises a broken bottle overhead and holds (no strike) (ch. 10)'],
    cheer: ['director', 'children cheering, arms up (ch. 10)'],
    leap: ['director', "Tín's leap from the bike seat to the truck's rear ladder (slow motion; c11-m1) (ch. 11)"],
    'climb-ladder': ['director', 'climbs a ladder or along a box body hand over hand (c11-m1) (ch. 11)'],
    'smash-window': ['director', 'an elbow through a side window (glass only; c11-m1) (ch. 11)'],
    'draw-pistol': ['director', 'draws a pistol from the waistband one-handed (c11-m1 Lực) (ch. 11)'],
    'raise-glass': ['director', 'raises a glass of beer toward a TV (the epilogue Tám Hổ) (ch. 11)'],
    'tear-notice': ['director', 'tears a paper notice in two, then again, and lets it go (the epilogue Bà Năm) (ch. 11)'],
    'paint-sign': ['director', 'paints the last letters of a shop sign with one arm, the other in a sling (the epilogue Quang) (ch. 11)'],
    'buckle-helmet': ['director', 'puts on a half helmet and buckles the strap (the final shot) (ch. 11)'],
  },
  pairClips: {
    'fix-collar': ['director', "one straightens the other's collar with both hands (Phượng, CS05) (ch. 6)"],
    'hang-whistle': ['director', "one lifts a whistle on a cord from his own neck and hangs it on the other's (Ông Tư, CS06) (ch. 6)"],
    'press-hand': ['director', "one takes the other's hand in both hands and presses it (ch. 9)"],
    'forehead-touch': ['director', "one kneels and touches his forehead to the other's (ch. 10)"],
    cradle: ['director', "kneeling, one holds the other's head and shoulders off the floor (ch. 10)"],
    'pin-down': ['director', 'one kneels over the other, pinning his shoulders (no strike) (ch. 10)'],
    chokehold: ['director', 'the non-lethal chokehold from behind; the other slowly goes limp (no strike) (ch. 10)'],
    'cuff-wrists': ['director', "one cuffs the other's wrists behind his back, no force shown (CS11 Cường, c11-m1 Lực) (ch. 10, 11)"],
    'catch-wrist': ['director', "one dives flat and catches the other's wrist over an edge; both hold (CS12, then the QTE) (ch. 11)"],
  },
  fx: {
    'incense-smoke': ['director', 'drifting incense smoke (ch. 6)'],
    fire: ['director', 'flames (a lit rag, a burning shutter, a room on fire; no person burns) (ch. 6)'],
    smoke: ['director', 'thick grey-orange smoke rolling under a ceiling (ch. 6)'],
    'beam-fall': ['director', 'a burning roof beam crashing down in a burst of sparks (ch. 6)'],
    searchlight: ['director', "a searchlight cone (additive fake cone, no THREE light): the barge wheelhouse's over rain, water and deck (CS07), a helicopter's (CS12) (ch. 7, 11)"],
    'bullet-splash': ['director', 'white water columns where bullets hit the river (no hit on anyone; slow motion) (ch. 7)'],
    'police-lights': ['director', 'red and blue light bars sweeping wet surfaces (ch. 7)'],
    'torch-sweep': ['director', 'a torch beam sweeping across glass from inside a building (c8-m4) (ch. 8)'],
    flame: ['director', 'a small gas-ring flame eating a paper envelope (ch. 9)'],
    'emergency-light': ['director', 'red emergency light wash, slow pulse (ch. 10)'],
    'lights-on': ['director', 'tube lights flicking on one by one (ch. 10)'],
    'alarm-light': ['director', 'rotating red alarm light (ch. 10)'],
    sparks: ['director', 'sparks from steel dragged on asphalt or a railing (ch. 11)'],
    'rotor-wash': ['director', 'papers, dust and lantern light whirled out from under a rotor (ch. 11)'],
    splash: ['director', 'a heavy splash on the river (ch. 11)'],
    'river-lanterns': ['director', 'floating paper lotus lanterns (đèn hoa đăng) drifting on the river (festival-blackout-heli.md §1.4) (ch. 11)'],
  },
  sfx: {
    'mo-go': ['audio', 'a wooden fish tapped in a pagoda (ch. 6)'],
    chanting: ['audio', 'a monk chanting (ch. 6)'],
    'moto-rev': ['audio', 'several motorbikes revving outside a shutter (ch. 6)'],
    'metal-clang': ['audio', 'a wrench striking metal (ch. 6)'],
    'beam-crash': ['audio', 'a burning beam crashing down (ch. 6)'],
    'lid-creak': ['audio', 'the lid of an iron box creaking open (ch. 6)'],
    'bolt-cut': ['audio', 'bolt cutters snapping a padlock (ch. 7)'],
    'searchlight-hum': ['audio', 'the searchlight motor whirring in the rain (ch. 7)'],
    'child-cough': ['audio', "a child's muffled cough behind steel (ch. 7)"],
    'gunfire-burst': ['audio', 'bursts of gunfire across the water (never a hit on screen) (ch. 7)'],
    'engine-roar': ['audio', 'an outboard opened to full throttle (ch. 7)'],
    'siren-short': ['audio', "a ward car's siren whoop (ch. 7)"],
    doorbell: ['audio', 'an apartment doorbell (ch. 8)'],
    'cai-luong-live': ['audio', 'a live cải lương orchestra: đàn, trống, chập chõa (ch. 8)'],
    'wind-howl': ['audio', 'wind howling around a high-rise facade or over a rooftop (ch. 8, 11)'],
    'footsteps-leather': ['audio', 'leather shoes pacing on carpet (ch. 8)'],
    'tv-off': ['audio', 'a CRT-style click as a TV switches off (ch. 8)'],
    'news-jingle': ['audio', "a TV news jingle under the anchor's voice (ch. 9)"],
    'boots-floor': ['audio', 'boots on old floorboards overhead (ch. 9)'],
    'shutter-bang': ['audio', 'fists banging on a roller shutter (ch. 9)'],
    'engine-rev': ['audio', 'two scooters revving at idle (ch. 9)'],
    'gas-click': ['audio', 'a gas ring clicking alight (ch. 9)'],
    'breaker-thunk': ['audio', 'a breaker thrown, then sign after sign dying with an electric thunk (ch. 10)'],
    'bass-cut': ['audio', 'the club bass cut off mid-beat (ch. 10)'],
    'cheer-kids': ['audio', 'children cheering in the street (ch. 10)'],
    'lift-cable': ['audio', 'lift cables creaking (ch. 10)'],
    'gunshot-echo': ['audio', 'one pistol shot, echoing (over black) (ch. 10)'],
    'pistol-clatter': ['audio', 'a pistol sliding across a tiled floor (ch. 10)'],
    'generator-start': ['audio', 'a diesel generator coughing into life (ch. 10)'],
    'intercom-crackle': ['audio', 'an intercom clicking on (ch. 10)'],
    'alarm-klaxon': ['audio', 'an alarm klaxon (ch. 10)'],
    'cuffs-drop': ['audio', 'plastic cuffs landing on tiles (ch. 10)'],
    'siren-far': ['audio', 'an ambulance siren pulling away (ch. 10)'],
    rotor: ['audio', 'helicopter rotor roar (ch. 11)'],
    'metal-groan': ['audio', 'a truck body groaning as it shifts (ch. 11)'],
    'railing-crash': ['audio', 'a truck tearing through a steel railing (ch. 11)'],
    splash: ['audio', 'a heavy splash (ch. 11)'],
    'glass-smash': ['audio', 'a side window shattering (ch. 11)'],
  },
  ambience: {
    'fire-crackle': ['audio', 'a shop burning: crackle, roar, falling debris (ch. 6)'],
    'rain-river': ['audio', 'heavy rain on the river and on a steel deck (ch. 7)'],
    'festival-street': ['audio', 'Rằm night in the street: chatter, children, the lion-dance drums at a distance (ch. 10, 11)'],
    'river-evening': ['audio', 'the river at sunset: water on the pier piles, a far boat horn (ch. 11)'],
  },
  meshes: {
    'moonlight-b2.cell4-bars': ['spaces', 'the bars of cell 4, hidden for the CS10 glide (ch. 10)'],
  },
};

/** The whole vocabulary the director compiles against and lintContent checks the campaign with (chapters 1–11). */
export const CAMPAIGN_CONTRACT: EngineContract = Object.fromEntries(Object.entries(ENGINE_CONTRACT).map(([kind, ids]) =>
  [kind, { ...ids, ...SCENE_REQUESTS[kind as ContractKind], ...LATE_SCENE_REQUESTS[kind as ContractKind] }])) as EngineContract;
