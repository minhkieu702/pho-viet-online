import type {
  ActorState, Behaviour, CastDef, EngineAct, ExecAct, ExecCtx, Line, Op, PlaceRef, Scope, StoryEvent, StoryOut, StoryPort, StoryView, VehicleState,
  WorldCond, WorldPolicy,
} from './types.ts';
import type { StoryUiAction } from '../../story-ui/types.ts';

/**
 * The story ↔ engine bridge (Wave 1 owner implements StoryHost inside createGame; nothing here imports three.js
 * or the DOM). The runner talks to a StoryPort; createStoryPort() below builds that port from a StoryHost, so
 * every engine action and world condition has exactly one place where it maps onto the game. Blocking work
 * takes a `done` callback (the adapter turns it into runner.resolve). Story interactions are entries of the
 * interaction registry (interact.ts, base priority above street entries), story extras use the street-life
 * roles (vé số, xe ôm, giữ xe, quán cóc) through ActorPort templates, and bus/waterbus/xe ôm scenes use the
 * transit passenger API through TransitPort.
 */

export type Vec = { x: number; z: number; y?: number };
export type Pose = { x: number; z: number; y: number; yaw: number };
export type Rect = { x0: number; z0: number; x1: number; z1: number };
export type PlayerMode = 'foot' | 'bike' | 'car' | 'boat' | 'swim' | 'passenger' | 'seated' | 'parachute';
export type Done = (result?: unknown) => void;

/** Clock and weather (clock.ts, atmosphere.ts). */
export interface TimePort {
  hour(): number;
  setHour(h: number): void;
  /**
   * 0 freezes the clock during a mission, 1 is normal; released by reset('end'). While the hours are locked the
   * transit timetables (buses.ts, transit.ts) run on a separate transit clock that keeps advancing at real dt /
   * SECONDS_PER_HOUR, so a bus or waterbus the story boards still departs (WAVE1-PLAN W1-C).
   */
  setClockRate(rate: number): void;
  setWeather(set: string, o?: { lock?: boolean; now?: boolean }): void;
  /** Cutscene-only slow motion (gameplay timers run on wall clock, so interactive play is never scaled). */
  setTimeScale(k: number): void;
}
/** Map queries and the open-world policy (traffic, crowd, police, gangs, activities, exclusions). */
export interface WorldPort {
  /** A PlaceRef as a world pose (places table, 'space/spawn', world marks), null when unknown; `level` for a roof or deck spot. */
  resolve(at: PlaceRef): (Pose & { space?: string; level?: string }) | null;
  /** Named areas for exclusions and leashes. */
  area(id: string): Rect | null;
  groundAt(x: number, z: number, yHint?: number): number;
  sight(a: Vec, b: Vec): boolean;
  districtAt(x: number, z: number): string;
  /** Mission policy patch; null restores the hub default (and releases clock/weather locks). */
  setPolicy(p: WorldPolicy | null): void;
  /** Story props (idempotent by id). */
  prop(spec: Extract<EngineAct, { k: 'prop' }>): void;
  /** Fire, smoke, power cuts and other set states without a schema yet. */
  op?(name: string, args: Record<string, unknown> | undefined, done: Done): boolean;
}
/** Walkable spaces: on-map compounds and off-map rooms with their own clear/ground/sight/bounds and camera. */
export interface SpacePort {
  enter(id: string, link: string | undefined, done: Done): void;
  leave(to: PlaceRef | true, done: Done): void;
  setVariant(space: string, variant: string): void;
  current(): string | null;
  /** Surface level (roof, deck, catwalk) the player stands on, null on the ground. */
  level(): string | null;
}
export type SpaceProvider = { clear(x: number, z: number, r: number): boolean; ground(x: number, z: number, yHint?: number): number; sight(a: Vec, b: Vec): boolean; bounds(): Rect; camera?: CameraProfile };

export type PlayerState = Pose & {
  speed: number; mode: PlayerMode; vehicle: string | null; health: number; wanted: number; crouched: boolean; hidden: boolean;
  /** 0..1 how visible the player is (stealth), noise radius in metres this frame. */
  visibility: number; noise: number; carrying: string | null; down: 'wasted' | 'busted' | null; level: string | null; space: string | null;
};
export interface PlayerPort {
  state(): PlayerState;
  /**
   * Puts the player at a place (on its level: a roof spot lands on the roof). Without `yaw` the place's own yaw is
   * used. With `vehicle` the bike is placed at the place itself, which must be clear for a bike (r 1.0, sites.ts
   * curb spots), facing along the street.
   */
  teleport(at: PlaceRef, o: { yaw?: number; vehicle?: string }, done: Done): void;
  /** null unlocks; masks such as 'move', 'run', 'fire', 'vehicle', 'phone'. */
  lockInput(mask: string[] | null): void;
  setStance(s: 'stand' | 'crouch'): void;
  setPose(p: string | null): void;
  setCarry(item: string | null): void;
  /** Rebuilds the walker, rider, seated and helmet copies with a wardrobe outfit. */
  setOutfit(id: string): void;
  setHeadlight(on: boolean): void;
  /** Social cover ('shipper', 'waiter', 'porter', 'visitor') or null. */
  setCover(kind: string | null): void;
}
/** Named story actors (figures.ts heroes) and template extras (guards, victims, street-life roles). */
export type ActorSpec = Extract<EngineAct, { k: 'spawn' }> & { name?: string; look?: CastDef['look'] };
export type ActorView = { x: number; z: number; yaw: number; state: ActorState; down: boolean; seesPlayer: boolean; awareness: number };
export interface ActorPort {
  spawn(spec: ActorSpec): void;
  despawn(o: { id?: string; tag?: string }): void;
  behave(id: string, b: Behaviour): void;
  get(id: string): ActorView | null;
  bark(id: string, text: string, o?: { shout?: boolean }): void;
}
export type VehicleView = { x: number; z: number; yaw: number; speed: number; state: VehicleState };
export interface VehiclePort {
  /** Spawn (model/at given) or command (route/state) a scripted story vehicle or boat, idempotent by id. */
  set(spec: Extract<EngineAct, { k: 'vehicle' }>): void;
  get(id: string): VehicleView | null;
}
export type CameraShot = { eye: Vec & { y: number }; look: Vec & { y: number }; fov?: number; roll?: number };
export type CameraProfile = { dist: [number, number]; pitch: [number, number]; fov?: number };
export interface CameraPort { override(shot: CameraShot | null): void; profile(p: CameraProfile | null): void; shake(amount: number): void }
/** Cinematics director (story-system-cinematics.md): scenes, dialogue, calls, cards, fades, choices. */
export interface CinePort {
  /** `seen`: offer the skip at once; `restoring`: behind a checkpoint fade, skip straight to the end state. */
  play(id: string, o: { seen: boolean; restoring: boolean }, done: Done): void;
  dialogue(id: string, lines: Line[], mode: 'blocking' | 'ambient', done: Done): void;
  call(spec: Extract<EngineAct, { k: 'call' }>, done: Done): void;
  sms(from: string, text: string, burner: boolean): void;
  title(kind: 'chapter' | 'time' | 'place', text: string, sub: string | undefined, ms: number, done: Done): void;
  fade(to: 'black' | 'clear' | 'dip', ms: number, done: Done): void;
  choice(panel: Extract<ExecAct, { k: 'choice' }>, done: Done): void;
  letterbox(on: boolean): void;
  /** Cancels whatever `done` is still pending for this handle-less request (step change, fail). */
  cancel(): void;
}
export interface UiPort {
  emit(e: StoryOut): void;
  hint(text: string, ms?: number): void;
  toast(text: string): void;
}
export interface AudioPort { sting(id: string): void; music(id: string | null, level?: number): void }
/**
 * Story entries in the interaction registry (interact.ts): prompt chip, tap or hold E, crimes need a hold; `level`
 * shows the prompt only on that surface. kind 'climb' is the level kit's ClimbLink of the same id (one entry, not
 * two): the climb ends with runner.event({type:'climb', id}); until the kit has the link the session's stub fades,
 * teleports to `to` and pushes the same event.
 */
export type StoryInteract = {
  id: string; x: number; z: number; r: number; prompt: string; verb?: string; hold?: number; crime?: 0 | 1 | 2 | 3;
  when: 'foot' | 'ride' | 'any' | 'water'; kind?: string; space?: string; level?: string | null; to?: PlaceRef;
  use(): void;
};
export interface InteractPort { add(i: StoryInteract): void; remove(id: string): void }
export interface PolicePort { force(stars: number): void; reset(): void }
/** Stealth arena API subset (story-system-stealth.md). */
export interface StealthPort {
  loadArena(id: string, o?: { variant?: string }): void;
  unloadArena(): void;
  setRules(r: Record<string, unknown>): void;
  alarmLevel(): number;
}
/**
 * Passenger API (transit.ts ledger): bus and waterbus rides, xe ôm hails. Events 'ride'/'alight' go to the runner.
 * Bus and waterbus timetables follow the transit clock while a mission locks the hours (TimePort.setClockRate);
 * TransitHost.skip maps onto that clock in story mode. A story xe ôm is main's fade ride (openXeOm's dip → teleport →
 * sendAway) with the destination from `spec.to` and no atmosphere.setHours while the hours are locked.
 */
export interface TransitPort { ride(spec: Extract<EngineAct, { k: 'ride' }>, done: Done): void }
/**
 * Director helpers: tails, eavesdrops, photo targets, clue spots (meters such as 'tail:van-51d'). While a cutscene
 * holds the world (StoryHooks.cinematic) a tail suspends its lose clock and its spotted test.
 */
export interface HelperPort {
  start(spec: Extract<EngineAct, { k: 'tail' | 'eavesdrop' | 'photoTarget' | 'clue' }>): void;
  stop(id: string): void;
  meter(id: string): number | undefined;
  /**
   * The {k:'q'} queries of story/contract.ts (an unknown name answers false). Core ones the W1 session answers
   * itself: viewTurned (camera yaw moved ≥ args.rad ?? 0.6 rad since the step began, from view.yaw).
   */
  query?(name: string, args: Record<string, unknown> | undefined): boolean;
}

export interface StoryHost {
  time: TimePort; world: WorldPort; spaces: SpacePort; player: PlayerPort; actors: ActorPort; vehicles: VehiclePort;
  camera: CameraPort; cine: CinePort; ui: UiPort; audio: AudioPort; interact: InteractPort; police: PolicePort; helpers: HelperPort;
  stealth?: StealthPort; transit?: TransitPort;
  /** Despawns things of a scope (actors, vehicles, props, helpers, interactables) and resets mission state. */
  clear(scope: Scope | 'checkpoint'): void;
}

/** What game.ts calls each frame and from its hooks (story-plan Wave 1: one-line null-safe calls). */
export interface StoryHooks {
  update(dt: number, now: number): void;
  /**
   * A cutscene holds the world (runner view().cinematic: the main queue or any watcher's queue waits on a cutscene,
   * or a presentation act or session is up). game.ts: no player input, police frozen, gangs calm, player
   * invulnerable, prompt chip hidden; tails and guards suspended.
   */
  cinematic(): boolean;
  /** Cutscene slow motion; 1 during play (only inside a stage.freezeWorld scene). */
  timeScale(): number;
  /** Keys before the game's own handling (dialogue advance, hold-to-skip, X/G/T/P/L/B); true when consumed. */
  input(key: string, pressed: boolean): boolean;
  cameraShot(): CameraShot | null;
  /** Story owns wasted/busted while a mission runs (checkpoint instead of hospital/police respawn). */
  ownsDown(): boolean;
  playerDown(kind: 'wasted' | 'busted'): void;
  /** respawn()/release() in story mode: no fee, no hospital or police teleport; the fail card or a scripted wake-up follows. */
  afterDown(now: number): void;
  /**
   * Game → story events that are not interactions: {type:'signal', id:'ranRed'} from checkRedLight, the wasted /
   * busted details, transit board/alight ('ride'/'alight', id = stop), climbDone ('climb', id = link).
   */
  event(e: StoryEvent): void;
  /** The live mission policy (activities, exclusions, leash) game.ts gates on; null outside a mission. */
  policy(): WorldPolicy | null;
  hud(): StoryView | null;
  prompt(): string | null;
  /** Where traffic and crowds should centre while the player is inside an off-map space. */
  worldFocus(x: number, z: number): Vec;
  dispose(): void;
}

/** engine.story.* for page.tsx and the story UI. */
export interface StoryApi {
  newGame(slot: number, o: { difficulty: 'de' | 'thuong' | 'kho' }): Promise<void>;
  load(slot: number): Promise<boolean>;
  replay(mission: string): Promise<boolean>;
  quit(): void; retry(): boolean; skipSection(): boolean; saveNow(): void;
  link(a: string, b: string): unknown; propose(hyp: string, cards: string[]): unknown; hint(): unknown; answer(option: string): unknown; closeBoard(): boolean;
  present(card: string, approach: 'accuse' | 'empathy'): unknown; press(): unknown; bluff(): unknown;
  /** Every StoryLayer input (page.tsx: onAction={a => game.current?.story?.ui(a)}); the session maps it onto the calls above. */
  ui(action: StoryUiAction): unknown;
}

// ---- StoryPort over a StoryHost ----------------------------------------------------------------------

const cmp = (a: number, op: Op, b: number) => (op === '==' ? a === b : op === '!=' ? a !== b : op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b);
const MODE: Record<string, PlayerMode[]> = { foot: ['foot'], bike: ['bike'], car: ['car'], vehicle: ['bike', 'car', 'boat'], boat: ['boat'], swim: ['swim'] };

/**
 * Builds the runner's port from a host. `resolve` is runner.resolve; blocking engine work calls it through
 * `done`. Pending `done`s cancelled by the runner are ignored when they fire late.
 */
export function createStoryPort(host: StoryHost, resolve: (handle: number, result?: unknown) => void): StoryPort {
  const live = new Set<number>();
  /** Starts blocking work; its `done` resolves the runner handle unless the runner cancelled it meanwhile. */
  const later = (h: number, start: (done: Done) => void) => {
    live.add(h);
    start((r) => { if (live.delete(h)) resolve(h, r); });
    return true;
  };
  const near = (x: number, z: number, at: PlaceRef, r: number) => { const p = host.world.resolve(at); return !!p && Math.hypot(p.x - x, p.z - z) <= r; };
  function test(c: WorldCond): boolean {
    const pl = host.player.state();
    switch (c.k) {
      case 'reach': {
        if (c.mode && c.mode !== 'any' && !MODE[c.mode]?.includes(pl.mode)) return false;
        if (c.space !== undefined && pl.space !== c.space) return false;
        if (c.level !== undefined && pl.level !== c.level) return false;
        return near(pl.x, pl.z, c.at, c.r ?? 3);
      }
      case 'area': { const a = host.world.area(c.area), inside = !!a && pl.x >= a.x0 && pl.x <= a.x1 && pl.z >= a.z0 && pl.z <= a.z1; return c.inside === false ? !inside : inside; }
      case 'mode': return pl.mode === c.is;
      case 'space': return pl.space === c.id;
      case 'player': return cmp(pl[c.prop], c.op, c.value);
      case 'stance': return c.is === 'crouch' ? pl.crouched : c.is === 'stand' ? !pl.crouched : c.is === 'hidden' ? pl.hidden : pl.hidden || pl.crouched;
      case 'carrying': return pl.carrying === c.item;
      case 'down': return !!pl.down && (!c.kind || pl.down === c.kind);
      case 'hour': { const h = host.time.hour(); return c.from <= c.to ? h >= c.from && h < c.to : h >= c.from || h < c.to; }
      case 'actor': {
        const a = host.actors.get(c.id);
        if (!a) return false;
        if (c.state && a.state !== c.state) return false;
        if (c.down !== undefined && a.down !== c.down) return false;
        if (c.sees !== undefined && a.seesPlayer !== c.sees) return false;
        return !c.at || near(a.x, a.z, c.at, c.r ?? 2);
      }
      case 'vehicle': { const v = host.vehicles.get(c.id); return !!v && (!c.state || v.state === c.state) && (!c.at || near(v.x, v.z, c.at, c.r ?? 6)); }
      case 'near': {
        const pos = (id: string) => (id === 'player' ? pl : host.actors.get(id) ?? host.vehicles.get(id));
        const a = pos(c.a), b = pos(c.b);
        return !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) <= c.r;
      }
      case 'meter': { const v = host.helpers.meter(c.id); return v !== undefined && cmp(v, c.op, c.value); }
      case 'alarm': return cmp(host.stealth?.alarmLevel() ?? 0, c.op, c.level);
      case 'q': return host.helpers.query?.(c.name, c.args) ?? false;
    }
  }
  function exec(a: ExecAct, h: number, ctx: ExecCtx): boolean {
    switch (a.k) {
      case 'cutscene': return later(h, (d) => host.cine.play(a.id, { seen: !!ctx.seen, restoring: ctx.restoring }, d));
      case 'dialogue': if (a.mode === 'ambient') { host.cine.dialogue(a.id, a.lines, 'ambient', () => undefined); return false; } return later(h, (d) => host.cine.dialogue(a.id, a.lines, 'blocking', d));
      case 'call': return later(h, (d) => host.cine.call(a, d));
      case 'choice': return later(h, (d) => host.cine.choice(a, d));
      case 'title': return later(h, (d) => host.cine.title(a.kind, a.text, a.sub, a.ms ?? 2400, d));
      case 'fade': return later(h, (d) => host.cine.fade(a.to, a.ms ?? 600, d));
      case 'teleport': return later(h, (d) => host.player.teleport(a.at, { yaw: a.yaw, vehicle: a.vehicle }, d));
      case 'space':
        if (a.variant) host.spaces.setVariant(a.variant.id, a.variant.v);
        if (a.enter) return later(h, (d) => host.spaces.enter(a.enter!, a.link, d));
        if (a.leave) return later(h, (d) => host.spaces.leave(a.leave!, d));
        return false;
      case 'do': if (!host.world.op) return false; if (!a.wait) { host.world.op(a.op, a.args, () => undefined); return false; } return later(h, (d) => { if (!host.world.op!(a.op, a.args, d)) d(); });
      case 'ride': if (!host.transit) return false; host.transit.ride(a, () => undefined); return false;
      case 'sms': host.cine.sms(a.from, a.text, !!a.burner); return false;
      case 'bark': host.actors.bark(a.actor, a.text, { shout: a.shout }); return false;
      case 'hint': host.ui.hint(a.text, a.ms); return false;
      case 'toast': host.ui.toast(a.text); return false;
      case 'sting': host.audio.sting(a.id); return false;
      case 'music': host.audio.music(a.id, a.level); return false;
      case 'letterbox': host.cine.letterbox(a.on); return false;
      case 'player':
        if (a.outfit) host.player.setOutfit(a.outfit);
        if (a.stance) host.player.setStance(a.stance);
        if (a.lock !== undefined) host.player.lockInput(a.lock);
        if (a.pose !== undefined) host.player.setPose(a.pose);
        if (a.carry !== undefined) host.player.setCarry(a.carry);
        if (a.headlight !== undefined) host.player.setHeadlight(a.headlight);
        if (a.cover !== undefined) host.player.setCover(a.cover);
        return false;
      case 'spawn': host.actors.spawn(a); return false;
      case 'despawn': host.actors.despawn({ id: a.id, tag: a.tag }); return false;
      case 'behave': host.actors.behave(a.id, a.b); return false;
      case 'vehicle': host.vehicles.set(a); return false;
      case 'prop': host.world.prop(a); return false;
      case 'world': host.world.setPolicy(a.policy); return false;
      case 'time': host.time.setHour(a.hour); return false;
      case 'weather': host.time.setWeather(a.set, { lock: a.lock, now: true }); return false;
      case 'police': if (a.reset) host.police.reset(); if (a.force !== undefined) host.police.force(a.force); return false;
      case 'photoTarget': case 'clue': case 'tail': case 'eavesdrop': host.helpers.start(a); return false;
      case 'stop': host.helpers.stop(a.id); return false;
      case 'stealth':
        if (a.arena === null) host.stealth?.unloadArena(); else if (a.arena) host.stealth?.loadArena(a.arena, { variant: a.variant });
        if (a.rules) host.stealth?.setRules(a.rules);
        if (a.cover !== undefined) host.player.setCover(a.cover);
        return false;
    }
  }
  return {
    test, exec,
    cancel(h) { if (live.delete(h)) host.cine.cancel(); },
    reset(scope) {
      for (const h of [...live]) live.delete(h);
      if (scope === 'end') { host.world.setPolicy(null); host.time.setClockRate(1); host.police.reset(); host.clear('mission'); }
      else host.clear(scope === 'step' ? 'step' : 'checkpoint');
    },
    emit: (e) => host.ui.emit(e),
  };
}
/** Convenience for the director: push engine events into a runner-like sink. */
export type EventSink = (e: StoryEvent) => void;
