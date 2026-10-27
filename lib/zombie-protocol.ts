/**
 * The co-op zombie wire contract, shared by the room Durable Object (lib/zombie-relay.ts), the client
 * (app/game/zombie-net.ts), the game modules and tests. Pure constants and types, no imports: safe in the Worker
 * and the SSR bundle. Bump ZOMBIE_VERSION with any change both sides must agree on (wire format, codes, rules,
 * planRuins output).
 */
/** 2: the ruins cover the wired districts (apocalypse-inputs.ts ruinInputsFromWorld), so the live plan and its hash changed. */
export const ZOMBIE_VERSION = 2;
export type RoomMode = 'city' | 'zombie';

export const ZOMBIE_SNAP_MS = 100;          // host snapshot cadence (10 Hz)
export const ZOMBIE_KEY_MS = 2000;          // a keyframe at least this often (and on zrole/zneed)
export const ZOMBIE_DIR_MS = 1000;          // director state at least this often (and on any phase/wave change)
export const ZOMBIE_DELAY_MS = 220;         // puppets render this far behind server time
export const ZOMBIE_EXTRAPOLATE_MS = 150;   // longest a puppet is extrapolated past its last sample
export const HOST_STALL_MS = 1500;          // no zsnap from the host for this long: elect another
export const HOST_GRACE_MS = 1200;          // a host whose socket dropped keeps the role this long
export const HOST_MIN_TERM_MS = 10_000;     // no lag-based re-election sooner than this after an election
export const MAX_ZOMBIES = 128;             // zombie net id = slot (7 bits) | generation << 7 (generation < MAX_ZOMBIE_GEN)
export const MAX_ZOMBIE_GEN = 500;          // generations wrap at 500, so zombie ids stay below 0xfa00 (never a mutant or special id)
export const MAX_MUTANTS = 4;               // mutant net id = MUTANT_ID_BASE + index
export const MUTANT_ID_BASE = 0xff00;
export const OMEN_ID = 0xfffd;              // ZEvent 'scream' w: a director scream with no zombie behind it (§6d)
export const BLAST_ID = 0xfffe;             // ZHit w: an area blast (sx, sz = centre, f = radius, d = damage at the centre)
export const NO_SLOT = 15;                  // 'no player' in 4-bit slot fields
export const MAX_FRAME_BYTES = 3800;        // every z* message a client sends, serialized (the DO closes a socket at 4096 bytes, code 1009)
export const MAX_SNAP_CHARS = 3600;         // base64 characters per zsnap part
export const MAX_SNAP_PARTS = 4;
export const MAX_EVENTS = 32;               // per zev, and never more than MAX_FRAME_BYTES serialized
export const MAX_HITS = 24;                 // per zhit, and never more than MAX_FRAME_BYTES serialized
export const MAX_DIR_CHARS = 2048;          // JSON.stringify(zdir.d)
export const MAX_RUIN_CHANGES = 48;         // zdir.ruins (packed numbers, see RUIN_THROWN)
export const RUIN_THROWN = 8;               // ruin change codes: 0..7 crushed and pushed toward k·45° (yaw), 8 picked up and thrown (gone)
export const POS_SCALE = 16;                // int16 positions in 1/16 m (±2048 m covers every planned district)
export const HIT_BUDGET_PER_S = 6000;       // base damage one player may send per second (all zhit messages)
export const MAX_EVENT_DAMAGE = 60;         // one zev 'hit'/'proj' on a player (also 60% of max health)

export const ZOMBIE_KINDS = ['walker', 'runner', 'brute', 'crawler', 'spitter', 'bloater', 'riot', 'shipper', 'screamer', 'hunter', 'stalker'] as const;
export type ZombieKind = (typeof ZOMBIE_KINDS)[number];
export const MUTANT_KINDS = ['colossus', 'leaper', 'matriarch'] as const;
export type MutantKind = (typeof MUTANT_KINDS)[number];
/** Zombie states on the wire (4 bits). */
export const ZSTATES = ['off', 'rise', 'wander', 'chase', 'stagger', 'down', 'windup', 'lunge', 'scream', 'frozen', 'drop', 'burst', 'held', 'crawl'] as const;
export type ZState = (typeof ZSTATES)[number];
/** Mutant phases on the wire. */
export const MPHASES = ['emerge', 'idle', 'walk', 'run', 'tele', 'attack', 'recover', 'stagger', 'climb', 'roof', 'leap', 'roar', 'dying', 'dead'] as const;
export type MPhase = (typeof MPHASES)[number];
/** Every attack that has a telegraph. */
export const ATTACKS = ['claw', 'bash', 'lunge', 'bite', 'spit', 'burst', 'scream', 'grab', 'swipe', 'slam', 'charge', 'throw', 'roar', 'pounce', 'slash', 'bile', 'brood', 'exhale', 'deathburst'] as const;
export type AttackId = (typeof ATTACKS)[number];
export const HIT_KINDS = ['bullet', 'pellet', 'melee', 'blast', 'vehicle', 'bite', 'fire'] as const;
export type ZHitKind = (typeof HIT_KINDS)[number];
/** Largest base damage one hit may carry, by HIT_KINDS index, before the host's zone/armour multipliers. */
export const MAX_HIT_DAMAGE = [34, 15, 34, 190, 220, 12, 10] as const;
export const ZONES = ['body', 'head', 'weak', 'limb'] as const;
export const WEAPON_CODES = ['fists', 'pistol', 'shotgun', 'smg', 'grenade', 'rpg', 'car', 'dog'] as const;
export const DOG_MODES = ['follow', 'stay', 'attack', 'bite', 'hurt', 'down', 'away', 'ride'] as const;
export type DogMode = (typeof DOG_MODES)[number];

/** A player's dog as the owner reports it (metres, radians; h = health percent 0..100; t = net id it bites or -1). */
export type DogNet = { x: number; z: number; a: number; m: number; h: number; t: number; c: number };
/** Fields PlayerState carries in zombie rooms only (all optional; city rooms never send them). */
export type ZombiePlayerFields = {
  /** 0 standing, 1 downed (revivable), 2 dead (spectating until the next rest). */
  zd?: 0 | 1 | 2;
  /** Seconds of bleed-out left while downed. */
  bleed?: number;
  /** Slot this player is reviving (-1 none) and the progress 0..1; 8 + slot for a teammate's dog. */
  rv?: number; rvp?: number;
  /** Camera yaw (radians), for 'seen' checks (stalker, spawn fairness). */
  cam?: number;
  /** Moving quietly (slow walk, no shot for 2 s): the blind hunter cannot hear this player beyond 3 m. */
  quiet?: boolean;
  dog?: DogNet | null;
};

export type ZPhase = 'prep' | 'wave' | 'rest' | 'over';
/** The wave director as the host broadcasts it (zdir.d). Times are server milliseconds. */
export type ZDirector = {
  wave: number; phase: ZPhase; until: number;
  left: number; spawned: number; toSpawn: number;
  kills: number; score: number; best: number;
  /** Mutants still to come this wave, and the ones alive (hp/max absolute; weak = intact weak-point bits). */
  boss: MutantKind[];
  mutants: { i: number; k: MutantKind; hp: number; max: number; weak: number }[];
  /** Per player: [slot, kills, damage dealt, downs, revives]. */
  stats: [number, number, number, number, number][];
  /** Ruin pieces changed by mutants, oldest first: ruinId * 16 + code (0..7 crushed toward k·45°, RUIN_THROWN gone). */
  ruins: number[];
  /** Director RNG state and the player count the wave was sized for (for host migration). */
  rng: number; n: number;
};

/**
 * w = net id of who acts (zombie id, or MUTANT_ID_BASE + index); to = bit mask of player slots (bits 0-7) and their dogs (bits 8-15).
 * Shapes: arc in radians is a cone/ring of radius r; for a = 'charge' the shape is a line from (x, z) along yaw, r long, arc = half width (m).
 * Every number is rounded before sending: positions 0.01 m, angles 0.001 rad, times 0.01 s.
 */
export type ZEvent =
  | { k: 'tele'; w: number; a: AttackId; x: number; z: number; yaw: number; r: number; arc: number; t: number; to?: number; tx?: number; tz?: number }
  | { k: 'hit'; w: number; a: AttackId; x: number; z: number; yaw: number; r: number; arc: number; dmg: number; kb: number; to: number }
  | { k: 'proj'; id: number; w: number; a: 'spit' | 'bile' | 'throw'; x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; dmg: number }
  | { k: 'cloud'; x: number; z: number; r: number; s: number; dps: number }
  | { k: 'kill'; w: number; kind: ZombieKind | MutantKind; by: number; wp: number; head?: 1; weak?: 1; dx: number; dz: number; f: number }
  | { k: 'spawn'; w: number; how: 'rise' | 'door' | 'drop' | 'alley' | 'burst' | 'brood' | 'emerge'; x: number; z: number }
  | { k: 'quake'; x: number; z: number; r: number; t: number; kind: MutantKind }
  | { k: 'roar'; w: number; x: number; z: number; r: number }
  | { k: 'scream'; w: number; x: number; z: number; r: number }
  | { k: 'smash'; ruin: number; code: number; x: number; z: number }
  | { k: 'shove'; x: number; z: number; r: number; f: number }
  | { k: 'wave'; n: number; p: 'start' | 'clear' | 'boss' | 'over' | 'restart' }
  | { k: 'loot'; x: number; z: number; kind: MutantKind }
  | { k: 'revived'; by: number; to: number; dog?: 1 };

/**
 * A hit on a zombie/mutant puppet: base damage (before zone/armour), zone, kind, weapon, unit push direction, force, shooter position.
 * w = BLAST_ID is an area blast (grenade, rocket, car explosion): k = 'blast', (sx, sz) the centre, f the radius, d the damage at the
 * centre; the host applies it to its own simulation (one hit, never one per zombie).
 */
export type ZHit = { w: number; d: number; zone: number; k: number; wp: number; dx: number; dz: number; f: number; sx: number; sz: number; hold?: number; weak?: number };
export type ZCommand =
  | { c: 'revive'; to: number }
  | { c: 'dogRevive'; to: number }
  | { c: 'mark'; x: number; z: number; m: 'help' | 'danger' | 'go' }
  | { c: 'restart' }
  /** "Bắt đầu" on the online waiting card: the first wave starts in 3 s (only while the room is in prep). */
  | { c: 'start' };

export type ZombieClientMessage =
  | { type: 'zsnap'; epoch: number; seq: number; key: boolean; part: number; parts: number; b: string }
  | { type: 'zdir'; epoch: number; seq: number; d: ZDirector }
  | { type: 'zev'; epoch: number; seq: number; ev: ZEvent[] }
  | { type: 'zhit'; seq: number; h: ZHit[] }
  | { type: 'zcmd'; seq: number; c: ZCommand }
  | { type: 'zneed' };
export type ZombieServerMessage =
  | { type: 'zrole'; host: string; slot: number; epoch: number; why: 'create' | 'join' | 'left' | 'stall' | 'lag' | 'restore' }
  | { type: 'zsnap'; serverTime: number; epoch: number; seq: number; key: boolean; part: number; parts: number; b: string }
  | { type: 'zdir'; serverTime: number; epoch: number; seq: number; d: ZDirector }
  | { type: 'zev'; serverTime: number; epoch: number; seq: number; ev: ZEvent[] }
  | { type: 'zhit'; serverTime: number; from: number; h: ZHit[] }
  | { type: 'zcmd'; serverTime: number; from: number; c: ZCommand }
  | { type: 'zneed'; from: number };

/** Decoded snapshot records (app/game/zombie-net.ts encodes/decodes them; zombies.ts and mutants.ts fill/apply them). */
export type NetZombie = {
  id: number; kind: number; state: number; look: number; x: number; z: number; y: number; yaw: number;
  /** 0..1 */ hp: number; pace: number; flags: number; target: number; prog: number;
};
export type NetMutant = {
  i: number; kind: number; phase: number; attack: number; x: number; z: number; y: number; yaw: number; prog: number;
  hp: number; max: number; weak: number; target: number; flags: number;
};
/** NetZombie.flags bits. */
export const ZF = { ACT: 1, SUB0: 2, SUB1: 4, BARE: 8, BROKEN: 16, HELD: 32, ROOF: 64, GLOW: 128 } as const;
/** NetMutant.flags bits. */
export const MF = { WALL: 1, AIR: 2, ENRAGED: 4, STAGGER: 8, EXPOSED: 16 } as const;
