/**
 * Co-op zombie netcode on the client (design.md §1.4–§1.10, §5.2, §9 A1–A9, A20). Pure TS, no three.js.
 *
 * The host encodes its zombies and mutants into little-endian binary snapshots (base64 inside JSON `zsnap`
 * frames): 10 Hz deltas with interest tiers by distance to the nearest player, and a keyframe at least every 2 s.
 * Every client keeps a *mirror* of the latest record of each zombie and mutant (so any client can be promoted to
 * host without losing the wave), plus a small sample ring per puppet, rendered ZOMBIE_DELAY_MS behind server time.
 * Events, hits and commands are queued with a 10 s TTL, numbers rounded, and packed into frames that never exceed
 * MAX_FRAME_BYTES (the room closes a socket on 4096 bytes). The game side (zombie-coop.ts) decides what happens;
 * this module only moves state.
 */
import { INTERPOLATION_DELAY_MS, createSnapshotClock } from './peer-interpolation.ts';
import {
  MAX_EVENTS, MAX_DIR_CHARS, MAX_FRAME_BYTES, MAX_HITS, MAX_MUTANTS, MAX_RUIN_CHANGES, MAX_SNAP_CHARS, MAX_SNAP_PARTS, MAX_ZOMBIE_GEN, MAX_ZOMBIES, NO_SLOT,
  POS_SCALE, ZOMBIE_DELAY_MS, ZOMBIE_DIR_MS, ZOMBIE_EXTRAPOLATE_MS, ZOMBIE_KEY_MS, ZOMBIE_SNAP_MS,
  type NetMutant, type NetZombie, type ZCommand, type ZDirector, type ZEvent, type ZHit, type ZombieClientMessage,
  type ZombieServerMessage,
} from '../../lib/zombie-protocol.ts';

/** The net id of the zombie in pool slot `slot` (0..127) at its `generation`-th use; generations wrap at MAX_ZOMBIE_GEN (§9 A8). */
export function zombieId(slot: number, generation: number) { return (slot & 127) | (generation % MAX_ZOMBIE_GEN) << 7; }
/** True for zombie net ids; mutant (MUTANT_ID_BASE + i), OMEN_ID and BLAST_ID are never zombies. */
export function isZombieId(id: number) { return Number.isInteger(id) && id >= 0 && id < MAX_ZOMBIE_GEN << 7; }

/**
 * Record units (§1.4): metres and radians; NetZombie.hp 0..1 of max; pace m/s; y metres above ground; target = slot | 16 for that
 * slot's dog (NO_SLOT none); prog a raw integer 0..7. NetMutant: hp/max absolute (u16), prog a raw integer 0..255, attack -1 = none.
 */
/** Delta record mask bits (§1.4); decoded keyframe records carry POSE | STATE | HP | KEY. */
export const ZM = { POSE: 1, STATE: 2, HP: 4, REMOVED: 8, NEW: 16, KEY: 32 } as const;
const FMT = 1;
const HEADER = 6;
const KEY_BYTES = 14;
const MUTANT_BYTES = 20;
/** Raw bytes per part: MAX_SNAP_CHARS base64 characters. */
const PART_BYTES = Math.floor(MAX_SNAP_CHARS / 4) * 3;
const TAU = Math.PI * 2;
const TIER_A = 50, TIER_B = 110;
const EXTRA_KEY_MS = 500;
const KEY_PART_TIMEOUT_MS = 500;
const NEED_MS = 1100;
const QUEUE_TTL_MS = 10_000;
/**
 * Combat and presentation events the host already resolved (hits, projectiles, clouds, shoves, roars) are worth sending
 * for this long only: after a socket gap a late `hit` would land with no reaction time. A tell lives as long as its
 * windup (its marker still warns); kills, spawns, waves, loot, smashes and quakes keep the 10 s TTL.
 */
const COMBAT_TTL_MS = 400;
const COMBAT = new Set<ZEvent['k']>(['hit', 'proj', 'cloud', 'shove', 'roar']);
const stale = (q: Queued<ZEvent>, now: number) => {
  const age = now - q.at, e = q.item;
  return e.k === 'tele' ? age > Math.max(COMBAT_TTL_MS, e.t * 1000) : COMBAT.has(e.k) && age > COMBAT_TTL_MS;
};
/** Phase order within a wave, for (wave, phase) comparisons of directors. */
const PHASE_ORDER: Record<string, number> = { prep: 0, wave: 1, rest: 2, over: 3 };
const dirOrder = (d: ZDirector) => d.wave * 4 + (PHASE_ORDER[d.phase] ?? 0);
const DIR_MIN_MS = 250;
const CMD_MIN_MS = 210;
const MAX_SAMPLES = 12;
const MAX_INCOMING = 512;
/** Envelope allowance when packing events/hits by bytes ({"type":"zev","epoch":…,"seq":…,"ev":[…]}). */
const ENVELOPE = 72;

// ---- quantisation ----
const int = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number.isFinite(v) ? v : 0)));
const qPos = (v: number) => int(v * POS_SCALE, -32767, 32767);
const qYaw = (v: number) => Math.round((Number.isFinite(v) ? v : 0) / TAU * 256) & 255;
const dYaw = (b: number) => (((b + 128) & 255) - 128) * TAU / 256;
const qHp = (v: number) => int(v * 255, 0, 255);
const qPace = (v: number) => int(v * 16, 0, 255);
const qY = (v: number) => int(v * 8, 0, 255);
/** NetZombie.target (slot | 16 for that slot's dog) and NetZombie.prog (a raw integer 0..7: windup/rise/lunge progress, the stalker's freeze pose). */
const packTarget = (target: number, prog: number) => (int(target, 0, 31) & 31) | int(prog, 0, 7) << 5;
const kindState = (z: NetZombie) => (int(z.kind, 0, 15) & 15) | (int(z.state, 0, 15) & 15) << 4;

// ---- base64 (browsers, Workers and Node alike; no string spreading) ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INV = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64_INV[B64.charCodeAt(i)] = i;
function toBase64(bytes: Uint8Array, length = bytes.length): string {
  let out = '';
  let i = 0;
  for (; i + 2 < length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63];
  }
  if (i < length) {
    const n = bytes[i] << 16 | (i + 1 < length ? bytes[i + 1] << 8 : 0);
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < length ? B64[n >> 6 & 63] : '=') + '=';
  }
  return out;
}
function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new Error('base64 length');
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(text.length / 4 * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const c = text.charCodeAt(i + j);
      const v = c === 61 ? 0 : c < 128 ? B64_INV[c] : -1;
      if (v < 0) throw new Error('base64 character');
      n = n << 6 | v;
    }
    if (o < out.length) out[o++] = n >> 16 & 255;
    if (o < out.length) out[o++] = n >> 8 & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ---- codec ----
function writeKeyFields(v: DataView, o: number, z: NetZombie) {
  v.setUint8(o, kindState(z)); v.setUint8(o + 1, int(z.look, 0, 255));
  v.setInt16(o + 2, qPos(z.x), true); v.setInt16(o + 4, qPos(z.z), true);
  v.setUint8(o + 6, qYaw(z.yaw)); v.setUint8(o + 7, qHp(z.hp)); v.setUint8(o + 8, qPace(z.pace));
  v.setUint8(o + 9, int(z.flags, 0, 255)); v.setUint8(o + 10, packTarget(z.target, z.prog)); v.setUint8(o + 11, qY(z.y));
  return o + 12;
}
function readKeyFields(v: DataView, o: number, z: NetZombie) {
  const ks = v.getUint8(o);
  z.kind = ks & 15; z.state = ks >> 4; z.look = v.getUint8(o + 1);
  z.x = v.getInt16(o + 2, true) / POS_SCALE; z.z = v.getInt16(o + 4, true) / POS_SCALE;
  z.yaw = dYaw(v.getUint8(o + 6)); z.hp = v.getUint8(o + 7) / 255; z.pace = v.getUint8(o + 8) / 16;
  z.flags = v.getUint8(o + 9);
  const tp = v.getUint8(o + 10);
  z.target = tp & 31; z.prog = tp >> 5; z.y = v.getUint8(o + 11) / 8;
  return o + 12;
}
function writeMutant(v: DataView, o: number, m: NetMutant) {
  v.setUint8(o, int(m.i, 0, 255)); v.setUint8(o + 1, int(m.kind, 0, 255)); v.setUint8(o + 2, int(m.phase, 0, 255));
  v.setUint8(o + 3, m.attack >= 0 ? int(m.attack, 0, 254) : 255);
  v.setInt16(o + 4, qPos(m.x), true); v.setInt16(o + 6, qPos(m.z), true); v.setInt16(o + 8, qPos(m.y), true);
  v.setUint8(o + 10, qYaw(m.yaw)); v.setUint8(o + 11, int(m.prog, 0, 255));
  v.setUint16(o + 12, int(m.hp, 0, 65535), true); v.setUint16(o + 14, int(m.max, 0, 65535), true);
  v.setUint8(o + 16, int(m.weak, 0, 255)); v.setUint8(o + 17, int(m.target, 0, 255)); v.setUint8(o + 18, int(m.flags, 0, 255)); v.setUint8(o + 19, 0);
  return o + MUTANT_BYTES;
}
function readMutant(v: DataView, o: number): NetMutant {
  const attack = v.getUint8(o + 3);
  return {
    i: v.getUint8(o), kind: v.getUint8(o + 1), phase: v.getUint8(o + 2), attack: attack === 255 ? -1 : attack,
    x: v.getInt16(o + 4, true) / POS_SCALE, z: v.getInt16(o + 6, true) / POS_SCALE, y: v.getInt16(o + 8, true) / POS_SCALE,
    yaw: dYaw(v.getUint8(o + 10)), prog: v.getUint8(o + 11), hp: v.getUint16(o + 12, true), max: v.getUint16(o + 14, true),
    weak: v.getUint8(o + 16), target: v.getUint8(o + 17), flags: v.getUint8(o + 18),
  };
}
const poseKey = (z: NetZombie) => qPos(z.x) * 65536 * 65536 + (qPos(z.z) + 32768) * 65536 + qYaw(z.yaw) * 256 + qPace(z.pace);
const stateKey = (z: NetZombie) => ((kindState(z) * 256 + int(z.flags, 0, 255)) * 256 + packTarget(z.target, z.prog)) * 256 + qY(z.y);
const blank = (): NetZombie => ({ id: 0, kind: 0, state: 0, look: 0, x: 0, z: 0, y: 0, yaw: 0, hp: 1, pace: 0, flags: 0, target: NO_SLOT, prog: 0 });
const copyZombie = (src: NetZombie, dst: NetZombie = blank()) => {
  dst.id = src.id; dst.kind = src.kind; dst.state = src.state; dst.look = src.look; dst.x = src.x; dst.z = src.z; dst.y = src.y; dst.yaw = src.yaw;
  dst.hp = src.hp; dst.pace = src.pace; dst.flags = src.flags; dst.target = src.target; dst.prog = src.prog;
  return dst;
};

const scratch = new Uint8Array(16 * 1024);
const scratchView = new DataView(scratch.buffer);
type Encoded = { parts: string[]; included: NetZombie[]; removed: number[] };
/**
 * Encode one snapshot. Keyframes carry every active zombie (state ≠ 0); deltas carry NEW zombies (not in `prev`), REMOVED ones (in
 * `prev`, not active now; implied when a NEW record takes the same slot), and changed fields of the zombies `tierOf` selects.
 * Mutants (all of them, every snapshot) ride in part 0. Records are split into ≤ MAX_SNAP_PARTS parts of ≤ MAX_SNAP_CHARS.
 */
function encode(z: readonly NetZombie[], zc: number, m: readonly NetMutant[], mc: number, key: boolean, prev: ReadonlyMap<number, NetZombie> | null, tierOf: (z: NetZombie) => boolean): Encoded {
  const ends: number[] = [];
  const included: NetZombie[] = [];
  const removed: number[] = [];
  let o = 0;
  const active = new Set<number>();
  const newSlots = new Set<number>();
  for (let i = 0; i < zc; i++) {
    const r = z[i];
    if (!r || r.state === 0) continue;
    active.add(r.id);
    if (o + KEY_BYTES + 1 > scratch.length) break;
    const before = prev?.get(r.id);
    if (key) {
      scratchView.setUint16(o, r.id & 0xffff, true);
      o = writeKeyFields(scratchView, o + 2, r);
    } else if (!before) {
      newSlots.add(r.id & 127);
      scratchView.setUint16(o, r.id & 0xffff, true); scratchView.setUint8(o + 2, ZM.NEW);
      o = writeKeyFields(scratchView, o + 3, r);
    } else {
      if (!tierOf(r)) continue;
      const mask = (poseKey(r) !== poseKey(before) ? ZM.POSE : 0) | (stateKey(r) !== stateKey(before) ? ZM.STATE : 0) | (qHp(r.hp) !== qHp(before.hp) ? ZM.HP : 0);
      if (!mask) continue;
      scratchView.setUint16(o, r.id & 0xffff, true); scratchView.setUint8(o + 2, mask);
      o += 3;
      if (mask & ZM.POSE) { scratchView.setInt16(o, qPos(r.x), true); scratchView.setInt16(o + 2, qPos(r.z), true); scratchView.setUint8(o + 4, qYaw(r.yaw)); scratchView.setUint8(o + 5, qPace(r.pace)); o += 6; }
      if (mask & ZM.STATE) { scratchView.setUint8(o, kindState(r)); scratchView.setUint8(o + 1, int(r.flags, 0, 255)); scratchView.setUint8(o + 2, packTarget(r.target, r.prog)); scratchView.setUint8(o + 3, qY(r.y)); o += 4; }
      if (mask & ZM.HP) scratchView.setUint8(o++, qHp(r.hp));
    }
    ends.push(o);
    included.push(r);
  }
  if (!key && prev) for (const id of prev.keys()) {
    if (active.has(id)) continue;
    removed.push(id);
    if (newSlots.has(id & 127) || o + 3 > scratch.length) continue;
    scratchView.setUint16(o, id & 0xffff, true); scratchView.setUint8(o + 2, ZM.REMOVED);
    o += 3;
    ends.push(o);
  }
  const mutantBytes = Math.min(mc, MAX_MUTANTS) * MUTANT_BYTES;
  const parts: string[] = [];
  let start = 0, record = 0;
  do {
    const room = PART_BYTES - HEADER - (parts.length === 0 ? mutantBytes : 0);
    let count = 0, end = start;
    while (record < ends.length && ends[record] - start <= room) { end = ends[record++]; count++; }
    const first = parts.length === 0;
    const bytes = new Uint8Array(HEADER + (first ? mutantBytes : 0) + end - start);
    const v = new DataView(bytes.buffer);
    v.setUint8(0, FMT); v.setUint8(1, (key ? 1 : 0) | (first ? 2 : 0)); v.setUint16(2, count, true); v.setUint8(4, first ? mutantBytes / MUTANT_BYTES : 0); v.setUint8(5, 0);
    let w = HEADER;
    if (first) for (let i = 0; i < mutantBytes / MUTANT_BYTES; i++) w = writeMutant(v, w, m[i]);
    bytes.set(scratch.subarray(start, end), w);
    parts.push(toBase64(bytes));
    start = end;
  } while (record < ends.length && parts.length < MAX_SNAP_PARTS);
  // Records beyond 4 parts (impossible with 128 zombies) wait for the next keyframe; never claim them sent.
  if (record < ends.length) { included.length = Math.min(included.length, record); removed.length = 0; }
  return { parts, included, removed };
}

/** Encode a snapshot (§1.4). `prev` = what each client last received per id (null: everything is NEW); `tierOf` = include this zombie's changes now. */
export function encodeSnapshot(z: readonly NetZombie[], zc: number, m: readonly NetMutant[], mc: number, key: boolean, prev: ReadonlyMap<number, NetZombie> | null, tierOf: (z: NetZombie) => boolean): string[] {
  return encode(z, zc, m, mc, key, prev ?? (key ? null : new Map()), tierOf).parts;
}

/**
 * Decode one snapshot part. Delta records carry only the fields their `mask` names (others are 0); keyframe records have
 * mask POSE|STATE|HP|KEY, NEW records POSE|STATE|HP|NEW. `mutants` is null when this part carries no mutant list.
 */
export function decodeSnapshot(b64: string): { key: boolean; zombies: (NetZombie & { mask: number })[]; mutants: NetMutant[]; hasMutants: boolean } {
  const bytes = fromBase64(b64);
  if (bytes.length < HEADER || bytes[0] !== FMT) throw new Error('snapshot format');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const key = (bytes[1] & 1) === 1, hasMutants = (bytes[1] & 2) === 2;
  const count = v.getUint16(2, true), mc = bytes[4];
  let o = HEADER;
  const need = (n: number) => { if (o + n > bytes.length) throw new Error('snapshot truncated'); };
  const mutants: NetMutant[] = [];
  for (let i = 0; i < mc; i++) { need(MUTANT_BYTES); mutants.push(readMutant(v, o)); o += MUTANT_BYTES; }
  const zombies: (NetZombie & { mask: number })[] = [];
  for (let i = 0; i < count; i++) {
    const z = { ...blank(), mask: 0 };
    need(2); z.id = v.getUint16(o, true); o += 2;
    if (key) { need(12); o = readKeyFields(v, o, z); z.mask = ZM.POSE | ZM.STATE | ZM.HP | ZM.KEY; zombies.push(z); continue; }
    need(1); const mask = bytes[o++];
    if (mask & ZM.REMOVED) { z.mask = ZM.REMOVED; zombies.push(z); continue; }
    if (mask & ZM.NEW) { need(12); o = readKeyFields(v, o, z); z.mask = ZM.POSE | ZM.STATE | ZM.HP | ZM.NEW; zombies.push(z); continue; }
    if (mask & ZM.POSE) { need(6); z.x = v.getInt16(o, true) / POS_SCALE; z.z = v.getInt16(o + 2, true) / POS_SCALE; z.yaw = dYaw(bytes[o + 4]); z.pace = bytes[o + 5] / 16; o += 6; }
    if (mask & ZM.STATE) { need(4); const ks = bytes[o]; z.kind = ks & 15; z.state = ks >> 4; z.flags = bytes[o + 1]; z.target = bytes[o + 2] & 31; z.prog = bytes[o + 2] >> 5; z.y = bytes[o + 3] / 8; o += 4; }
    if (mask & ZM.HP) { need(1); z.hp = bytes[o++] / 255; }
    z.mask = mask & (ZM.POSE | ZM.STATE | ZM.HP);
    zombies.push(z);
  }
  return { key, zombies, mutants, hasMutants };
}

// ---- rounding for JSON frames (§1.3: positions 0.01 m, angles 0.001 rad, times 0.01 s) ----
const FINE = new Set(['yaw', 'arc', 'dx', 'dz']);
const WHOLE = new Set(['w', 'id', 'n', 'by', 'to', 'ruin', 'code', 'wp', 'zone', 'k', 'weak', 'i']);
function rounded<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v !== 'number') out[key] = v;
    else if (!Number.isFinite(v)) out[key] = 0;
    else out[key] = WHOLE.has(key) ? Math.round(v) : FINE.has(key) ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100;
  }
  return out as T;
}

/** The director as the room validates it: integers where it wants integers, the newest MAX_RUIN_CHANGES ruins, ≤ MAX_DIR_CHARS. */
function cleanDirector(d: ZDirector): ZDirector {
  const n = (v: number) => Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  const out: ZDirector = {
    wave: n(d.wave), phase: d.phase, until: Number.isFinite(d.until) ? Math.round(d.until) : 0,
    left: n(d.left), spawned: n(d.spawned), toSpawn: n(d.toSpawn), kills: n(d.kills), score: n(d.score), best: n(d.best),
    boss: d.boss.slice(0, 8),
    mutants: d.mutants.slice(0, MAX_MUTANTS).map(m => ({ i: n(m.i), k: m.k, hp: n(m.hp), max: Math.max(1, Math.min(65_000, n(m.max))), weak: n(m.weak) & 255 })),
    stats: d.stats.slice(0, 8).map(r => [n(r[0]), n(r[1]), n(r[2]), n(r[3]), n(r[4])] as [number, number, number, number, number]),
    ruins: d.ruins.slice(-MAX_RUIN_CHANGES).map(n), rng: (Number.isFinite(d.rng) ? d.rng : 0) >>> 0, n: Math.max(1, Math.min(8, n(d.n))),
  };
  while (JSON.stringify(out).length > MAX_DIR_CHARS && out.ruins.length) out.ruins.shift();
  return out;
}

/** `hold`: inserted by the client (the zombie stood still until just before the next sample). */
type Sample = { t: number; x: number; z: number; y: number; yaw: number; pace: number; state: number; flags: number; target: number; prog: number; hp: number; hold?: boolean };
/** `seeded`: drawn from this client's own simulation after a demotion; the new host's first record replaces it outright. */
type Puppet = { rec: NetZombie; samples: Sample[]; fresh: boolean; killed: boolean; seeded?: boolean };
type MutantSample = NetMutant & { t: number };
type Queued<T> = { item: T; at: number; len: number };
export type ZombieNetStats = {
  up: number; down: number; upRate: number; downRate: number; snaps: number; keys: number; puppets: number; mutants: number;
  lastSnapAge: number; epoch: number; host: boolean; hostSlot: number; reconnects: number; closes: Record<number, number>; queued: number;
};
export type ZombieNet = ReturnType<typeof createZombieNet>;

/** One room's zombie netcode endpoint. `now` is the local monotonic clock (performance.now by default). */
export function createZombieNet(opts: { selfSlot: number; now?: () => number; selfId?: string }) {
  const clockNow = opts.now ?? (() => performance.now());
  let selfSlot = opts.selfSlot;
  let selfId = opts.selfId ?? '';
  type RoleChange = 'promoted' | 'demoted' | 'same';
  /** A zrole handled inside receive(), waiting for onRole()/takeRole() to report its transition once. */
  let pendingRole: { key: string; result: RoleChange } | null = null;
  let isHost = false, epoch = 0, hostSlot = NO_SLOT;
  const serverClock = createSnapshotClock();
  let observed = false;
  // client mirror
  const puppets = new Map<number, Puppet>();
  const mutantSamples = new Map<number, MutantSample[]>();
  const seededMutants = new Set<number>();
  let director: ZDirector | null = null;
  /** The epoch whose host the mirrored director came from (a demoted host's own last one: the epoch it hosted). */
  let dirEpoch = -1;
  let killsSince = 0, spawnsSince = 0;
  let rxEpoch = -1, rxSeq = -1, rxPart = -1;
  let keyRx: { epoch: number; seq: number; parts: number; got: Set<number>; ids: Set<number>; at: number } | null = null;
  let lastSnapRx = -Infinity;
  const incoming: ZEvent[] = [];
  const hitsIn: { from: number; h: ZHit }[] = [];
  const commandsIn: { from: number; c: ZCommand }[] = [];
  // host side
  const exportZ: NetZombie[] = [];
  let exportZc = 0;
  const exportM: NetMutant[] = [];
  let exportMc = 0;
  let exportPlayers: { x: number; z: number }[] = [];
  let exportAt = -Infinity, exportPending = false;
  const sent = new Map<number, NetZombie>();
  let snapSeq = 0, dirSeq = 0, evSeq = 0, outSeq = 0, deltaIndex = 0;
  let lastSnapSent = -Infinity, lastKeyAt = -Infinity, keyWanted = true;
  let dirLatest: ZDirector | null = null, dirDirty = false, dirSentAt = -Infinity, dirWave = -1, dirPhase = '';
  // outgoing queues
  const events: Queued<ZEvent>[] = [];
  const hitsOut: Queued<ZHit>[] = [];
  const commandsOut: Queued<ZCommand>[] = [];
  let needWanted = false, needAt = -Infinity, cmdAt = -Infinity;
  // stats
  let up = 0, down = 0, snaps = 0, keys = 0, readies = 0;
  const closes: Record<number, number> = {};
  const rate = { up: 0, down: 0, at: clockNow(), upRate: 0, downRate: 0 };

  const serverNow = () => {
    const now = clockNow();
    if (!observed) return Date.now();
    return serverClock.renderTime(now) + INTERPOLATION_DELAY_MS;
  };
  const observe = (serverTime: number, receivedAt = clockNow()) => {
    if (Number.isFinite(serverTime) && serverClock.observe(serverTime, receivedAt)) observed = true;
  };
  const expire = <T>(queue: Queued<T>[], now: number) => { while (queue.length && now - queue[0].at > QUEUE_TTL_MS) queue.shift(); };
  const want = () => { needWanted = true; };

  // ---- receiving ----
  function pushSample(p: Puppet, t: number) {
    const r = p.rec;
    const s: Sample = { t, x: r.x, z: r.z, y: r.y, yaw: r.yaw, pace: r.pace, state: r.state, flags: r.flags, target: r.target, prog: r.prog, hp: r.hp };
    const last = p.samples[p.samples.length - 1];
    if (last && t < last.t) return;
    if (last && t === last.t) { p.samples[p.samples.length - 1] = s; return; }
    // A zombie that stood still (or pushed against a wall: pace without progress) sent nothing: it was at its old spot until
    // just before this sample. Far tiers that are simply sent less often moved about pace × gap, and keep the long segment.
    if (last && t - last.t > ZOMBIE_SNAP_MS * 1.5) {
      const speed = Math.hypot(s.x - last.x, s.z - last.z) / ((t - last.t) / 1000);
      if (last.pace < 0.1 || speed < last.pace * 0.5) p.samples.push({ ...last, t: t - ZOMBIE_SNAP_MS, hold: true });
    }
    p.samples.push(s);
    while (p.samples.length > MAX_SAMPLES) p.samples.shift();
  }
  function applyRecord(r: NetZombie & { mask: number }, t: number, keyIds: Set<number> | null) {
    if (r.mask & ZM.REMOVED) { puppets.delete(r.id); return; }
    let p = puppets.get(r.id);
    if (r.mask & (ZM.NEW | ZM.KEY)) {
      keyIds?.add(r.id);
      if (!p || (r.mask & ZM.NEW)) {
        // A new generation in this slot: the old occupant is gone; snap, never interpolate from it.
        for (const id of puppets.keys()) if ((id & 127) === (r.id & 127) && id !== r.id) puppets.delete(id);
        p = { rec: copyZombie(r), samples: [], fresh: true, killed: false };
        puppets.set(r.id, p);
      } else copyZombie(r, p.rec);
      if (p.seeded) { p.samples.length = 0; p.seeded = false; }
      pushSample(p, t);
      return;
    }
    if (!p) { want(); return; }
    if (p.killed) return;
    if (p.seeded) { p.samples.length = 0; p.seeded = false; }
    const rec = p.rec;
    if (r.mask & ZM.POSE) { rec.x = r.x; rec.z = r.z; rec.yaw = r.yaw; rec.pace = r.pace; }
    if (r.mask & ZM.STATE) { rec.kind = r.kind; rec.state = r.state; rec.flags = r.flags; rec.target = r.target; rec.prog = r.prog; rec.y = r.y; }
    if (r.mask & ZM.HP) rec.hp = r.hp;
    pushSample(p, t);
  }
  function applySnap(m: Extract<ZombieServerMessage, { type: 'zsnap' }>) {
    if (m.epoch === rxEpoch && (m.seq < rxSeq || (m.seq === rxSeq && m.part <= rxPart))) return;
    rxEpoch = m.epoch; rxSeq = m.seq; rxPart = m.part;
    let snap: ReturnType<typeof decodeSnapshot>;
    try { snap = decodeSnapshot(m.b); } catch { want(); return; }
    down += m.b.length + 90; rate.down += m.b.length + 90;
    snaps++;
    if (snap.key) keys++;
    lastSnapRx = clockNow();
    let ids: Set<number> | null = null;
    if (snap.key) {
      if (!keyRx || keyRx.seq !== m.seq || keyRx.epoch !== m.epoch) keyRx = { epoch: m.epoch, seq: m.seq, parts: m.parts, got: new Set(), ids: new Set(), at: lastSnapRx };
      keyRx.got.add(m.part);
      ids = keyRx.ids;
    }
    for (const r of snap.zombies) applyRecord(r, m.serverTime, ids);
    if (snap.hasMutants) {
      const seen = new Set<number>();
      for (const mu of snap.mutants) {
        seen.add(mu.i);
        let ring = mutantSamples.get(mu.i);
        if (!ring || seededMutants.delete(mu.i)) mutantSamples.set(mu.i, ring = []);
        const last = ring[ring.length - 1];
        if (last && m.serverTime < last.t) continue;
        if (last && m.serverTime === last.t) ring.pop();
        ring.push({ ...mu, t: m.serverTime });
        while (ring.length > MAX_SAMPLES) ring.shift();
      }
      for (const i of [...mutantSamples.keys()]) if (!seen.has(i)) mutantSamples.delete(i);
    }
    // "Absent from the keyframe = removed", once every part of it is here.
    if (keyRx && snap.key && keyRx.got.size >= keyRx.parts) {
      for (const id of [...puppets.keys()]) if (!keyRx.ids.has(id)) puppets.delete(id);
      keyRx = null;
    }
  }

  function receive(m: ZombieServerMessage) {
    if (!m || typeof m !== 'object') return;
    if ('serverTime' in m) observe(m.serverTime);
    // A host frame of a newer epoch while we think we host: another player was elected and its zrole never reached us
    // (a hitch or a dropped socket). Step down at once rather than simulate a second horde nobody sees.
    if (isHost && (m.type === 'zsnap' || m.type === 'zdir' || m.type === 'zev') && Number.isSafeInteger(m.epoch) && m.epoch > epoch) {
      applyRole({ type: 'zrole', host: '#superseded', slot: NO_SLOT, epoch: m.epoch, why: 'stall' }, selfId); // a host id no player has
    }
    switch (m.type) {
      case 'zrole': if (selfId) pendingRole = { key: roleKey(m), result: applyRole(m, selfId) }; return;
      case 'zsnap':
        if (isHost || !Number.isSafeInteger(m.epoch) || m.epoch < epoch) return;
        if (m.epoch > epoch) epoch = m.epoch;
        applySnap(m);
        return;
      case 'zdir':
        if (isHost || !Number.isSafeInteger(m.epoch) || m.epoch < epoch || !m.d) return;
        if (m.epoch > epoch) epoch = m.epoch;
        // One host's director only moves forward within a run: a zdir behind the mirror from the same epoch is a
        // replayed or reordered one. A new run (after 'over', or with fewer kills: a restart this client missed) passes.
        if (director && m.epoch === dirEpoch && dirOrder(m.d) < dirOrder(director) && director.phase !== 'over' && m.d.kills >= director.kills) return;
        director = m.d; dirEpoch = m.epoch; killsSince = 0; spawnsSince = 0;
        down += 300; rate.down += 300;
        return;
      case 'zev':
        if (isHost || !Number.isSafeInteger(m.epoch) || m.epoch < epoch || !Array.isArray(m.ev)) return;
        if (m.epoch > epoch) epoch = m.epoch;
        for (const e of m.ev) {
          if (e.k === 'kill') { killsSince++; const p = puppets.get(e.w); if (p) p.killed = true; }
          else if (e.k === 'spawn' && (e.how === 'rise' || e.how === 'door' || e.how === 'drop' || e.how === 'alley')) spawnsSince++;
          incoming.push(e);
        }
        if (incoming.length > MAX_INCOMING) incoming.splice(0, incoming.length - MAX_INCOMING);
        down += m.ev.length * 70; rate.down += m.ev.length * 70;
        return;
      case 'zhit':
        if (!isHost || !Array.isArray(m.h)) return;
        for (const h of m.h) hitsIn.push({ from: m.from, h });
        if (hitsIn.length > MAX_INCOMING) hitsIn.splice(0, hitsIn.length - MAX_INCOMING);
        return;
      case 'zcmd':
        commandsIn.push({ from: m.from, c: m.c });
        if (commandsIn.length > 64) commandsIn.shift();
        return;
      case 'zneed':
        if (isHost) keyWanted = true;
        return;
    }
  }

  type Role = Extract<ZombieServerMessage, { type: 'zrole' }>;
  const roleKey = (m: Role) => `${m.epoch}:${m.host}:${m.slot}:${m.why}`;
  /**
   * Apply a zrole and report the transition. Safe to call for a zrole receive() already applied: the transition is
   * reported exactly once, by whichever of onRole()/takeRole() asks first.
   */
  function onRole(m: Role, id: string): RoleChange {
    if (pendingRole && pendingRole.key === roleKey(m)) { const result = pendingRole.result; pendingRole = null; return result; }
    pendingRole = null;
    return applyRole(m, id);
  }
  function applyRole(m: Role, id: string): RoleChange {
    selfId = id;
    const was = isHost, hosted = epoch;
    // The zrole epoch is authoritative, even lower than ours (a restarted room that lost an unpersisted epoch, §9 A1).
    epoch = m.epoch; hostSlot = m.slot;
    isHost = m.host === id;
    if (isHost) {
      // A fresh baseline: the next snapshot is a keyframe, the director goes out at once.
      keyWanted = true; lastKeyAt = -Infinity; sent.clear(); dirDirty = true; dirSentAt = -Infinity;
    }
    if (!was && isHost) {
      // Hits queued as a client hit our own simulation now.
      for (const q of hitsOut.splice(0)) hitsIn.push({ from: selfSlot, h: q.item });
    }
    if (was && !isHost) {
      // Demoted: the director this host last published becomes the mirror (the HUD keeps its wave, and a re-election
      // before the new host's first zdir resumes it instead of a stale client-side one or nothing at all: wave 1).
      if (dirLatest) { director = cleanDirector(dirLatest); dirEpoch = hosted; killsSince = 0; spawnsSince = 0; }
      // Never send the old simulation's frames; draw it as puppets until the new host's keyframe.
      events.length = 0; exportPending = false; dirLatest = null; dirDirty = false; sent.clear();
      // Seeded samples sit at render time; the new host's records replace them whatever their server time (§1.7).
      const t = serverNow() - ZOMBIE_DELAY_MS;
      puppets.clear(); mutantSamples.clear(); seededMutants.clear();
      for (let i = 0; i < exportZc; i++) {
        const r = exportZ[i];
        if (r.state === 0) continue;
        const p: Puppet = { rec: copyZombie(r), samples: [], fresh: true, killed: false, seeded: true };
        pushSample(p, t);
        puppets.set(r.id, p);
      }
      for (let i = 0; i < exportMc; i++) { mutantSamples.set(exportM[i].i, [{ ...exportM[i], t }]); seededMutants.add(exportM[i].i); }
      rxEpoch = -1; rxSeq = rxPart = -1; keyRx = null;
    }
    return was === isHost ? 'same' : isHost ? 'promoted' : 'demoted';
  }

  // ---- sampling puppets ----
  const out = blank();
  function samplePuppets(renderTime: number, each: (z: NetZombie, fresh: boolean) => void) {
    for (const [id, p] of puppets) {
      if (p.killed || !p.samples.length) continue;
      sampleInto(p.samples, renderTime, out);
      out.id = id; out.kind = p.rec.kind; out.look = p.rec.look;
      const fresh = p.fresh;
      p.fresh = false;
      each(out, fresh);
    }
  }
  function sampleInto(s: Sample[], time: number, o: NetZombie) {
    const n = s.length;
    let a = s[0], b = s[0], amount = 0;
    if (time > s[0].t) {
      let i = 1;
      while (i < n && s[i].t < time) i++;
      if (i < n) { a = s[i - 1]; b = s[i]; amount = (time - a.t) / Math.max(1, b.t - a.t); }
      else {
        // Past the newest sample: extrapolate with the observed motion of the last two samples, never faster than the reported
        // pace, for up to their spacing (150 ms near, up to 1 s for far tiers sent once a second), then hold.
        const last = s[n - 1], before = n > 1 ? s[n - 2] : null;
        const gap = before ? last.t - before.t : ZOMBIE_SNAP_MS;
        // The spacing this zombie is sent at: the longer of the last two gaps (a keyframe can cut a far tier's second short), but
        // never a gap that ends in a hold (that was standing still, not sparse sending).
        const older = n > 2 && !before!.hold ? before!.t - s[n - 3].t : 0;
        const limit = Math.min(1000, Math.max(ZOMBIE_EXTRAPOLATE_MS, gap, older));
        const dt = Math.min(time - last.t, limit) / 1000;
        let vx = 0, vz = 0;
        if (before && last.pace >= 0.05 && gap > 0 && gap <= 1200) {
          vx = (last.x - before.x) / (gap / 1000); vz = (last.z - before.z) / (gap / 1000);
          const speed = Math.hypot(vx, vz), cap = last.pace * 1.1;
          if (speed > cap) { vx *= cap / speed; vz *= cap / speed; }
        }
        Object.assign(o, { x: last.x + vx * dt, z: last.z + vz * dt, y: last.y, yaw: last.yaw, pace: last.pace, state: last.state, flags: last.flags, target: last.target, prog: last.prog, hp: last.hp });
        return o;
      }
    }
    const turn = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    o.x = a.x + (b.x - a.x) * amount; o.z = a.z + (b.z - a.z) * amount; o.y = a.y + (b.y - a.y) * amount;
    o.yaw = a.yaw + turn * amount; o.pace = a.pace + (b.pace - a.pace) * amount;
    // Discrete fields step at their own sample time.
    const step = amount >= 1 ? b : a;
    o.state = step.state; o.flags = step.flags; o.target = step.target; o.prog = step.prog; o.hp = step.hp;
    return o;
  }
  function sampleMutants(renderTime: number, each: (m: NetMutant) => void) {
    for (const ring of mutantSamples.values()) {
      if (!ring.length) continue;
      let a = ring[0], b = ring[0], amount = 0;
      if (renderTime > ring[0].t) {
        let i = 1;
        while (i < ring.length && ring[i].t < renderTime) i++;
        if (i < ring.length) { a = ring[i - 1]; b = ring[i]; amount = (renderTime - a.t) / Math.max(1, b.t - a.t); }
        else a = b = ring[ring.length - 1];
      }
      const turn = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
      const step = amount >= 1 ? b : a;
      each({ ...step, x: a.x + (b.x - a.x) * amount, z: a.z + (b.z - a.z) * amount, y: a.y + (b.y - a.y) * amount, yaw: a.yaw + turn * amount });
    }
  }

  // ---- host publishing ----
  function publish(z: readonly NetZombie[], zc: number, m: readonly NetMutant[], mc: number, players: readonly { x: number; z: number }[], now: number) {
    if (!isHost || now - exportAt < ZOMBIE_SNAP_MS / 2) return;
    exportAt = now; exportPending = true;
    exportZc = Math.min(zc, MAX_ZOMBIES * 2);
    for (let i = 0; i < exportZc; i++) exportZ[i] = copyZombie(z[i], exportZ[i]);
    exportMc = Math.min(mc, MAX_MUTANTS);
    for (let i = 0; i < exportMc; i++) exportM[i] = { ...m[i] };
    exportPlayers = players.map(p => ({ x: p.x, z: p.z }));
  }
  /** Host: the director's latest state (kept by reference and serialized when sent: at ≥ 1 Hz, and within 250 ms of a wave/phase change or `force`). */
  function publishDirector(d: ZDirector, force = false) {
    if (!isHost) return;
    if (force || d.wave !== dirWave || d.phase !== dirPhase) dirDirty = true;
    dirLatest = d;
  }
  function event(e: ZEvent) {
    if (!isHost) return;
    const item = rounded(e);
    events.push({ item, at: clockNow(), len: JSON.stringify(item).length + 1 });
    if (events.length > 2048) events.shift();
  }
  function hit(h: ZHit) {
    const item = rounded(h);
    if (isHost) { hitsIn.push({ from: selfSlot, h: item }); return; }
    hitsOut.push({ item, at: clockNow(), len: JSON.stringify(item).length + 1 });
    if (hitsOut.length > 512) hitsOut.shift();
  }
  function command(c: ZCommand) {
    if (isHost && c.c === 'restart') { commandsIn.push({ from: selfSlot, c }); return; }
    const item = rounded(c);
    commandsOut.push({ item, at: clockNow(), len: JSON.stringify(item).length });
  }

  function encodeDue(now: number): { frames: Extract<ZombieClientMessage, { type: 'zsnap' }>[]; commit(): void } | null {
    if (!isHost || !exportPending || now - lastSnapSent < ZOMBIE_SNAP_MS - 8) return null;
    const key = keyWanted ? now - lastKeyAt >= EXTRA_KEY_MS : now - lastKeyAt >= ZOMBIE_KEY_MS;
    const index = deltaIndex;
    const tierOf = (r: NetZombie) => {
      let best = Infinity;
      for (const p of exportPlayers) { const d = (p.x - r.x) ** 2 + (p.z - r.z) ** 2; if (d < best) best = d; }
      if (best < TIER_A * TIER_A) return true;
      return best < TIER_B * TIER_B ? (index + r.id) % 2 === 0 : (index + r.id) % 10 === 0;
    };
    const enc = encode(exportZ, exportZc, exportM, exportMc, key, key ? null : sent, tierOf);
    const seq = snapSeq + 1;
    return {
      frames: enc.parts.map((b, part) => ({ type: 'zsnap' as const, epoch, seq, key, part, parts: enc.parts.length, b })),
      commit() {
        snapSeq = seq;
        if (key) { sent.clear(); lastKeyAt = now; keyWanted = false; keys++; }
        for (const id of enc.removed) sent.delete(id);
        for (const r of enc.included) sent.set(r.id, copyZombie(r, sent.get(r.id)));
        lastSnapSent = now; exportPending = false; deltaIndex++; snaps++;
      },
    };
  }

  /** Frames to send now: at most one zhit, zcmd, zneed, zev, snapshot (all its parts) and zdir, ≤ maxBytes in total (§9 A5, A20). */
  function takeOutgoing(maxBytes: number): ZombieClientMessage[] {
    const now = clockNow();
    const outList: ZombieClientMessage[] = [];
    let budget = maxBytes;
    const add = (m: ZombieClientMessage, len = JSON.stringify(m).length) => {
      if (len > MAX_FRAME_BYTES || len > budget) return false;
      outList.push(m); budget -= len; up += len; rate.up += len; return true;
    };
    expire(hitsOut, now); expire(commandsOut, now); expire(events, now);
    if (isHost && events.length && now - events[0].at > COMBAT_TTL_MS) for (let i = events.length - 1; i >= 0; i--) if (stale(events[i], now)) events.splice(i, 1);
    if (hitsOut.length && !isHost) {
      let n = 0, len = ENVELOPE;
      const cap = Math.min(MAX_FRAME_BYTES, budget);
      while (n < hitsOut.length && n < MAX_HITS && len + hitsOut[n].len <= cap) len += hitsOut[n++].len;
      if (n && add({ type: 'zhit', seq: outSeq + 1, h: hitsOut.slice(0, n).map(q => q.item) }, len)) { outSeq++; hitsOut.splice(0, n); }
    }
    if (commandsOut.length && now - cmdAt >= CMD_MIN_MS && add({ type: 'zcmd', seq: outSeq + 1, c: commandsOut[0].item })) { outSeq++; commandsOut.shift(); cmdAt = now; }
    if (!isHost && keyRx && now - keyRx.at > KEY_PART_TIMEOUT_MS) { keyRx = null; want(); }
    if (needWanted && !isHost && now - needAt >= NEED_MS && add({ type: 'zneed' })) { needWanted = false; needAt = now; }
    if (!isHost) return outList;
    if (events.length) {
      let n = 0, len = ENVELOPE;
      const cap = Math.min(MAX_FRAME_BYTES, budget);
      while (n < events.length && n < MAX_EVENTS && len + events[n].len <= cap) len += events[n++].len;
      if (n && add({ type: 'zev', epoch, seq: evSeq + 1, ev: events.slice(0, n).map(q => q.item) }, len)) { evSeq++; events.splice(0, n); }
    }
    const snap = encodeDue(now);
    if (snap) {
      // All parts of a snapshot go in the same tick (the room counts them as one), or none do and the next export supersedes them.
      const lens = snap.frames.map(p => JSON.stringify(p).length);
      if (lens.every(l => l <= MAX_FRAME_BYTES) && lens.reduce((a, b) => a + b, 0) <= budget) {
        for (let i = 0; i < lens.length; i++) add(snap.frames[i], lens[i]);
        snap.commit();
      }
    }
    if (dirLatest && now - dirSentAt >= DIR_MIN_MS && (dirDirty || now - dirSentAt >= ZOMBIE_DIR_MS)) {
      const d = cleanDirector(dirLatest);
      if (add({ type: 'zdir', epoch, seq: dirSeq + 1, d })) { dirSeq++; dirSentAt = now; dirDirty = false; dirWave = d.wave; dirPhase = d.phase; }
    }
    return outList;
  }

  function promote() {
    const zombies: NetZombie[] = [];
    for (const p of puppets.values()) if (!p.killed) zombies.push(copyZombie(p.rec));
    const mutants: NetMutant[] = [];
    for (const ring of mutantSamples.values()) if (ring.length) { const { t, ...m } = ring[ring.length - 1]; void t; mutants.push(m); }
    return { zombies, mutants, director, killsSince, spawnsSince };
  }

  function stats(): ZombieNetStats {
    const now = clockNow();
    const span = (now - rate.at) / 1000;
    if (span >= 2) { rate.upRate = Math.round(rate.up / span); rate.downRate = Math.round(rate.down / span); rate.up = rate.down = 0; rate.at = now; }
    let mutants = 0;
    for (const ring of mutantSamples.values()) if (ring.length) mutants++;
    return {
      up, down, upRate: rate.upRate, downRate: rate.downRate, snaps, keys, puppets: puppets.size, mutants,
      lastSnapAge: Math.round(now - (isHost ? lastSnapSent : lastSnapRx)), epoch, host: isHost, hostSlot,
      reconnects: Math.max(0, readies - 1), closes: { ...closes }, queued: events.length + hitsOut.length + commandsOut.length,
    };
  }

  return {
    get isHost() { return isHost; },
    get epoch() { return epoch; },
    get hostSlot() { return hostSlot; },
    get selfSlot() { return selfSlot; },
    onRole,
    /** The transition of a zrole that receive() applied, once (for callers that route every message through receive()). */
    takeRole(): RoleChange | null { const result = pendingRole?.result ?? null; pendingRole = null; return result; },
    /** The room's `ready` (first or reconnect): resets only the incoming snapshot order — never the mirror (§1.8, §9 A2). */
    onReady(info?: { slot?: number; serverTime?: number }) {
      readies++;
      rxEpoch = -1; rxSeq = rxPart = -1; keyRx = null;
      if (info?.slot !== undefined && info.slot >= 0 && info.slot < 8) selfSlot = info.slot;
      if (info?.serverTime !== undefined) observe(info.serverTime);
    },
    /** Feed any server time the room sends (ready, peer snapshots, pongs). */
    observe,
    noteClose(code: number) { closes[code] = (closes[code] ?? 0) + 1; },
    serverNow,
    /** Server time puppets are drawn at: ZOMBIE_DELAY_MS behind (the snapshot clock already holds back INTERPOLATION_DELAY_MS). */
    renderTime() { return observed ? serverClock.renderTime(clockNow()) - (ZOMBIE_DELAY_MS - INTERPOLATION_DELAY_MS) : Date.now() - ZOMBIE_DELAY_MS; },
    /** Host: a snapshot is due (skip exporting records otherwise). */
    due(now: number) { return isHost && now - exportAt >= ZOMBIE_SNAP_MS / 2; },
    publish, publishDirector, event,
    takeHits() { return hitsIn.splice(0); },
    takeCommands() { return commandsIn.splice(0); },
    hit, command, receive, samplePuppets, sampleMutants,
    takeEvents() { return incoming.splice(0); },
    director() { return isHost ? dirLatest : director; },
    promote,
    takeOutgoing,
    /** Leaving the room or zombie mode: forget everything. */
    reset() {
      isHost = false; epoch = 0; hostSlot = NO_SLOT;
      puppets.clear(); mutantSamples.clear(); seededMutants.clear(); director = null; dirEpoch = -1; killsSince = spawnsSince = 0;
      rxEpoch = -1; rxSeq = rxPart = -1; keyRx = null; lastSnapRx = -Infinity;
      incoming.length = hitsIn.length = commandsIn.length = 0;
      exportZc = exportMc = 0; exportPending = false; exportAt = -Infinity; sent.clear();
      lastSnapSent = lastKeyAt = -Infinity; keyWanted = true; dirLatest = null; dirDirty = false; dirSentAt = -Infinity; dirWave = -1; dirPhase = '';
      events.length = hitsOut.length = commandsOut.length = 0; needWanted = false;
      serverClock.reset(); observed = false;
    },
    stats,
  };
}
