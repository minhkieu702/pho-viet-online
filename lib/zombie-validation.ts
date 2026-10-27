/**
 * Pure validators for zombie rooms (design.md §1.2, §1.6, §5.2), shared by the relay (lib/zombie-relay.ts),
 * lib/room-validation.ts and the tests. Untrusted input in, bounded copies out: shapes that cannot be repaired throw
 * ClientError (a non-fatal socket error), while single bad events, hits or numbers are dropped or clamped so one off
 * value never rejects a whole batch (§9 A3).
 */
import { ClientError, clamp, finite, payload } from './room-validation.ts';
import { PEER_BOUNDS } from './world-bounds.ts';
import {
  ATTACKS, BLAST_ID, DOG_MODES, HIT_KINDS, MAX_DIR_CHARS, MAX_EVENT_DAMAGE, MAX_EVENTS, MAX_HIT_DAMAGE, MAX_HITS,
  MAX_MUTANTS, MAX_RUIN_CHANGES, MAX_SNAP_CHARS, MAX_SNAP_PARTS, MUTANT_KINDS, NO_SLOT, RUIN_THROWN, WEAPON_CODES, ZONES,
  ZOMBIE_KINDS,
} from './zombie-protocol.ts';
import type {
  AttackId, DogNet, MutantKind, RoomMode, ZCommand, ZDirector, ZEvent, ZHit, ZombieClientMessage, ZombieKind,
  ZombiePlayerFields, ZPhase,
} from './zombie-protocol.ts';

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const PHASES: readonly ZPhase[] = ['prep', 'wave', 'rest', 'over'];
const SPAWN_HOW = ['rise', 'door', 'drop', 'alley', 'burst', 'brood', 'emerge'] as const;
const WAVE_P = ['start', 'clear', 'boss', 'over', 'restart'] as const;
const MARKS = ['help', 'danger', 'go'] as const;
const PROJ = ['spit', 'bile', 'throw'] as const;
const ALL_KINDS: readonly string[] = [...ZOMBIE_KINDS, ...MUTANT_KINDS];
const TAU = Math.PI * 2;

/** Room mode on create; anything but 'zombie' that is present is an error, absent is a city room (old clients). */
export function roomMode(value: unknown): RoomMode {
  if (value === undefined || value === 'city') return 'city';
  if (value === 'zombie') return 'zombie';
  throw new ClientError('Chế độ phòng không hợp lệ. Hãy tải lại trang.');
}
/** The client's ZOMBIE_VERSION; absent → null (old clients, city rooms). */
export function zombieVersion(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_000_000) throw new ClientError('Phiên bản chế độ Zombie không hợp lệ. Hãy tải lại trang.');
  return value;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const wrapAngle = (a: number) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const px = (v: number) => r2(clamp(v, PEER_BOUNDS.minX, PEER_BOUNDS.maxX));
const pz = (v: number) => r2(clamp(v, PEER_BOUNDS.minZ, PEER_BOUNDS.maxZ));

function dogNet(value: unknown): DogNet | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if (![d.x, d.z, d.a].every(finite)) return null;
  return {
    x: px(d.x as number), z: pz(d.z as number), a: r3(wrapAngle(d.a as number)),
    m: int(d.m, 0, DOG_MODES.length - 1) ? d.m : 0, h: finite(d.h) ? Math.round(clamp(d.h, 0, 100)) : 100,
    t: int(d.t, -1, 0xffff) ? d.t : -1, c: int(d.c, 0, 15) ? d.c : 0,
  };
}
/** The zombie-room fields of a PlayerState: a bounded copy; unknown or malformed values are dropped, never thrown on. */
export function zombiePlayerFields(state: Record<string, unknown>): ZombiePlayerFields {
  const out: ZombiePlayerFields = {};
  if (state.zd === 0 || state.zd === 1 || state.zd === 2) out.zd = state.zd;
  if (finite(state.bleed)) out.bleed = Math.round(clamp(state.bleed, 0, 120) * 10) / 10;
  if (int(state.rv, -1, 15)) out.rv = state.rv;
  if (finite(state.rvp)) out.rvp = r2(clamp(state.rvp, 0, 1));
  if (finite(state.cam)) out.cam = r3(wrapAngle(state.cam));
  if (state.quiet === true) out.quiet = true;
  if (state.dog === null) out.dog = null;
  else if (state.dog !== undefined) out.dog = dogNet(state.dog);
  return out;
}

function head(raw: Record<string, unknown>, epoch: boolean) {
  if (epoch && !int(raw.epoch, 0, 2 ** 31)) throw new ClientError('Kỷ nguyên máy chủ zombie không hợp lệ.');
  if (!Number.isSafeInteger(raw.seq) || (raw.seq as number) < 0) throw new ClientError('Số thứ tự zombie không hợp lệ.');
  return { epoch: (raw.epoch as number) ?? 0, seq: raw.seq as number };
}

/**
 * One event, cleaned: unknown kinds, wrong types and non-finite numbers → null (dropped); positions into PEER_BOUNDS,
 * damage, radii and times clamped (§1.6). `slots` = bit mask of active player slots (bits 0..7).
 */
export function sanitizeEvent(raw: unknown, slots = 0xff): ZEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const num = (...keys: string[]) => keys.every(key => finite(e[key]));
  const mask = (v: unknown) => int(v, 0, 0xffff) ? v & (slots | slots << 8) : null;
  const slot = (v: unknown) => int(v, 0, NO_SLOT) && (v === NO_SLOT || (slots >> v & 1) === 1) ? v : NO_SLOT;
  const w = int(e.w, 0, 0xffff) ? e.w : -1;
  switch (e.k) {
    case 'tele': {
      if (w < 0 || !ATTACKS.includes(e.a as AttackId) || !num('x', 'z', 'yaw', 'r', 'arc', 't')) return null;
      const out: Extract<ZEvent, { k: 'tele' }> = {
        k: 'tele', w, a: e.a as AttackId, x: px(e.x as number), z: pz(e.z as number), yaw: r3(wrapAngle(e.yaw as number)),
        r: r2(clamp(e.r as number, 0, 30)), arc: r3(clamp(e.arc as number, 0, TAU)), t: r2(clamp(e.t as number, 0, 8)),
      };
      if (e.to !== undefined) { const to = mask(e.to); if (to !== null) out.to = to; }
      if (finite(e.tx) && finite(e.tz)) { out.tx = px(e.tx); out.tz = pz(e.tz); }
      return out;
    }
    case 'hit': {
      const to = mask(e.to);
      if (w < 0 || to === null || !ATTACKS.includes(e.a as AttackId) || !num('x', 'z', 'yaw', 'r', 'arc', 'dmg', 'kb')) return null;
      return {
        k: 'hit', w, a: e.a as AttackId, x: px(e.x as number), z: pz(e.z as number), yaw: r3(wrapAngle(e.yaw as number)),
        r: r2(clamp(e.r as number, 0, 30)), arc: r3(clamp(e.arc as number, 0, TAU)),
        dmg: r2(clamp(e.dmg as number, 0, MAX_EVENT_DAMAGE)), kb: r2(clamp(e.kb as number, 0, 30)), to,
      };
    }
    case 'proj':
      if (w < 0 || !int(e.id, 0, 2 ** 31) || !PROJ.includes(e.a as typeof PROJ[number]) || !num('x', 'y', 'z', 'vx', 'vy', 'vz', 'r', 'dmg')) return null;
      return {
        k: 'proj', id: e.id, w, a: e.a as typeof PROJ[number], x: px(e.x as number), y: r2(clamp(e.y as number, -10, 300)), z: pz(e.z as number),
        vx: r2(clamp(e.vx as number, -80, 80)), vy: r2(clamp(e.vy as number, -80, 80)), vz: r2(clamp(e.vz as number, -80, 80)),
        r: r2(clamp(e.r as number, 0, 12)), dmg: r2(clamp(e.dmg as number, 0, MAX_EVENT_DAMAGE)),
      };
    case 'cloud':
      if (!num('x', 'z', 'r', 's', 'dps')) return null;
      return { k: 'cloud', x: px(e.x as number), z: pz(e.z as number), r: r2(clamp(e.r as number, 0, 12)), s: r2(clamp(e.s as number, 0, 10)), dps: r2(clamp(e.dps as number, 0, 12)) };
    case 'kill': {
      if (w < 0 || !ALL_KINDS.includes(e.kind as string) || !int(e.wp, 0, WEAPON_CODES.length - 1) || !num('dx', 'dz', 'f')) return null;
      const out: Extract<ZEvent, { k: 'kill' }> = {
        k: 'kill', w, kind: e.kind as ZombieKind | MutantKind, by: slot(e.by), wp: e.wp,
        dx: r3(clamp(e.dx as number, -1, 1)), dz: r3(clamp(e.dz as number, -1, 1)), f: r2(clamp(e.f as number, 0, 60)),
      };
      if (e.head === 1) out.head = 1;
      if (e.weak === 1) out.weak = 1;
      return out;
    }
    case 'spawn':
      if (w < 0 || !SPAWN_HOW.includes(e.how as typeof SPAWN_HOW[number]) || !num('x', 'z')) return null;
      return { k: 'spawn', w, how: e.how as typeof SPAWN_HOW[number], x: px(e.x as number), z: pz(e.z as number) };
    case 'quake':
      if (!MUTANT_KINDS.includes(e.kind as MutantKind) || !num('x', 'z', 'r', 't')) return null;
      return { k: 'quake', x: px(e.x as number), z: pz(e.z as number), r: r2(clamp(e.r as number, 0, 80)), t: r2(clamp(e.t as number, 0, 8)), kind: e.kind as MutantKind };
    case 'roar': case 'scream':
      if (w < 0 || !num('x', 'z', 'r')) return null;
      return { k: e.k as 'roar' | 'scream', w, x: px(e.x as number), z: pz(e.z as number), r: r2(clamp(e.r as number, 0, 80)) };
    case 'smash':
      if (!Number.isSafeInteger(e.ruin) || (e.ruin as number) < 0 || !int(e.code, 0, RUIN_THROWN) || !num('x', 'z')) return null;
      return { k: 'smash', ruin: e.ruin as number, code: e.code, x: px(e.x as number), z: pz(e.z as number) };
    case 'shove':
      if (!num('x', 'z', 'r', 'f')) return null;
      return { k: 'shove', x: px(e.x as number), z: pz(e.z as number), r: r2(clamp(e.r as number, 0, 80)), f: r2(clamp(e.f as number, 0, 40)) };
    case 'wave':
      if (!int(e.n, 0, 100_000) || !WAVE_P.includes(e.p as typeof WAVE_P[number])) return null;
      return { k: 'wave', n: e.n, p: e.p as typeof WAVE_P[number] };
    case 'loot':
      if (!MUTANT_KINDS.includes(e.kind as MutantKind) || !num('x', 'z')) return null;
      return { k: 'loot', x: px(e.x as number), z: pz(e.z as number), kind: e.kind as MutantKind };
    case 'revived': {
      const by = slot(e.by), to = slot(e.to);
      if (by === NO_SLOT || to === NO_SLOT) return null;
      return e.dog === 1 ? { k: 'revived', by, to, dog: 1 } : { k: 'revived', by, to };
    }
    default: return null;
  }
}

/** One hit on a zombie/mutant from a non-host, bounded; null = dropped. */
export function sanitizeHit(raw: unknown): ZHit | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const h = raw as Record<string, unknown>;
  if (!int(h.w, 0, 0xffff) || !int(h.k, 0, HIT_KINDS.length - 1) || !int(h.zone, 0, ZONES.length - 1) || !int(h.wp, 0, WEAPON_CODES.length - 1)) return null;
  if (![h.d, h.dx, h.dz, h.f, h.sx, h.sz].every(finite) || (h.d as number) <= 0) return null;
  const blast = h.w === BLAST_ID;
  if (blast && (h.k !== HIT_KINDS.indexOf('blast') || (h.f as number) > 8 || (h.f as number) < 0)) return null;
  const out: ZHit = {
    w: h.w, d: r2(Math.min(h.d as number, MAX_HIT_DAMAGE[h.k])), zone: h.zone, k: h.k, wp: h.wp,
    dx: r3(clamp(h.dx as number, -1, 1)), dz: r3(clamp(h.dz as number, -1, 1)), f: r2(clamp(h.f as number, 0, blast ? 8 : 60)),
    sx: px(h.sx as number), sz: pz(h.sz as number),
  };
  if (finite(h.hold)) out.hold = r2(clamp(h.hold, 0, 1.5));
  if (int(h.weak, 0, 255)) out.weak = h.weak;
  return out;
}

function command(raw: unknown): ZCommand {
  const c = payload(raw);
  if ((c.c === 'revive' || c.c === 'dogRevive') && int(c.to, 0, 7)) return { c: c.c, to: c.to };
  if (c.c === 'mark' && finite(c.x) && finite(c.z) && MARKS.includes(c.m as typeof MARKS[number])) return { c: 'mark', x: px(c.x), z: pz(c.z), m: c.m as typeof MARKS[number] };
  if (c.c === 'restart') return { c: 'restart' };
  if (c.c === 'start') return { c: 'start' };
  throw new ClientError('Lệnh zombie không hợp lệ.');
}

const badDirector = () => new ClientError('Trạng thái đợt zombie không hợp lệ.');
/** The host's director state, rebuilt key by key (unknown keys dropped); a wrong shape throws. Counters are clamped later by the relay. */
export function directorShape(raw: unknown): ZDirector {
  const d = payload(raw);
  const count = (v: unknown) => { if (!finite(v) || v < 0) throw badDirector(); return Math.min(Math.round(v), 10_000_000); };
  if (!int(d.wave, 0, 100_000) || !PHASES.includes(d.phase as ZPhase) || !finite(d.until)) throw badDirector();
  if (!Array.isArray(d.boss) || d.boss.length > 8 || !d.boss.every(k => MUTANT_KINDS.includes(k))) throw badDirector();
  if (!Array.isArray(d.mutants) || d.mutants.length > MAX_MUTANTS || !Array.isArray(d.stats) || d.stats.length > 8 || !Array.isArray(d.ruins) || d.ruins.length > MAX_RUIN_CHANGES) throw badDirector();
  const mutants = d.mutants.map(raw => {
    const m = payload(raw);
    if (!int(m.i, 0, MAX_MUTANTS - 1) || !MUTANT_KINDS.includes(m.k as MutantKind) || !finite(m.hp) || !finite(m.max) || !int(m.weak, 0, 255)) throw badDirector();
    const max = Math.round(clamp(m.max, 1, 65_000));
    return { i: m.i, k: m.k as MutantKind, hp: Math.round(clamp(m.hp, 0, max)), max, weak: m.weak };
  });
  const stats = d.stats.map(row => {
    if (!Array.isArray(row) || row.length !== 5 || !int(row[0], 0, 7)) throw badDirector();
    return [row[0], count(row[1]), count(row[2]), count(row[3]), count(row[4])] as [number, number, number, number, number];
  });
  if (!d.ruins.every(v => Number.isSafeInteger(v) && v >= 0 && v % 16 <= RUIN_THROWN)) throw badDirector();
  if (!int(d.rng, 0, 0xffffffff) || !int(d.n, 1, 8)) throw badDirector();
  return {
    wave: d.wave, phase: d.phase as ZPhase, until: Math.round(d.until), left: count(d.left), spawned: count(d.spawned), toSpawn: count(d.toSpawn),
    kills: count(d.kills), score: count(d.score), best: count(d.best), boss: d.boss as MutantKind[], mutants, stats,
    ruins: d.ruins as number[], rng: d.rng, n: d.n,
  };
}

/**
 * Shape and bounds of a client z* message (§1.6). `slots` = bit mask of active slots, used to mask event targets.
 * zev and zhit come back with their bad entries dropped (possibly empty); everything else throws ClientError.
 */
export function zombieMessage(raw: Record<string, unknown>, slots = 0xff): ZombieClientMessage {
  switch (raw.type) {
    case 'zsnap': {
      const { epoch, seq } = head(raw, true);
      const { key, part, parts, b } = raw;
      if (typeof key !== 'boolean' || !int(parts, 1, MAX_SNAP_PARTS) || !int(part, 0, parts - 1)) throw new ClientError('Phần ảnh chụp zombie không hợp lệ.');
      if (typeof b !== 'string' || b.length > MAX_SNAP_CHARS || b.length % 4 !== 0 || !BASE64.test(b)) throw new ClientError('Ảnh chụp zombie không hợp lệ.');
      return { type: 'zsnap', epoch, seq, key, part, parts, b };
    }
    case 'zdir': {
      const { epoch, seq } = head(raw, true);
      if (JSON.stringify(raw.d ?? null).length > MAX_DIR_CHARS) throw new ClientError('Trạng thái đợt zombie quá lớn.');
      return { type: 'zdir', epoch, seq, d: directorShape(raw.d) };
    }
    case 'zev': {
      const { epoch, seq } = head(raw, true);
      if (!Array.isArray(raw.ev) || raw.ev.length > MAX_EVENTS) throw new ClientError('Sự kiện zombie không hợp lệ.');
      const ev: ZEvent[] = [];
      for (const item of raw.ev) { const e = sanitizeEvent(item, slots); if (e) ev.push(e); }
      return { type: 'zev', epoch, seq, ev };
    }
    case 'zhit': {
      const { seq } = head(raw, false);
      if (!Array.isArray(raw.h) || raw.h.length > MAX_HITS) throw new ClientError('Đòn đánh zombie không hợp lệ.');
      const h: ZHit[] = [];
      for (const item of raw.h) { const hit = sanitizeHit(item); if (hit) h.push(hit); }
      return { type: 'zhit', seq, h };
    }
    case 'zcmd': return { type: 'zcmd', seq: head(raw, false).seq, c: command(raw.c) };
    case 'zneed': return { type: 'zneed' };
    default: throw new ClientError('Bản tin zombie không hợp lệ.');
  }
}

/** Cross-epoch kill baseline (§1.6, §9 A3): the last relayed totals and the kill events relayed since. */
export type KillGuard = {
  accepted: number; since: number;
  slots: Map<number, { accepted: number; since: number }>;
  /** A 'wave restart' event was relayed since the last zdir: counters may drop once. */
  restart: boolean;
  /** No baseline yet (a room actor restored from storage keeps none): the next zdir's counters are taken as they are. */
  unknown?: boolean;
};
export function createKillGuard(): KillGuard { return { accepted: 0, since: 0, slots: new Map(), restart: false }; }
/** Count one relayed kill event (call only while under the 60/s counting cap). */
export function noteKill(guard: KillGuard, by: number) {
  guard.since++;
  if (by >= 0 && by < 8) {
    const s = guard.slots.get(by) ?? { accepted: 0, since: 0 };
    s.since++;
    guard.slots.set(by, s);
  }
}
/**
 * Clamp a director's kill counters against the baseline and make it the new baseline (never rejects).
 * Totals stay within [accepted, accepted + since]; after a restart they may drop to anything ≤ accepted + since.
 */
export function clampDirector(d: ZDirector, guard: KillGuard): ZDirector {
  if (guard.unknown) {
    // The first zdir after an actor restart: its totals become the baseline (the running host counted them before).
    guard.unknown = false; guard.restart = false;
    guard.accepted = d.kills; guard.since = 0;
    guard.slots = new Map(d.stats.map(row => [row[0], { accepted: row[1], since: 0 }]));
    return d;
  }
  const clampOne = (value: number, accepted: number, since: number) => Math.min(guard.restart ? value : Math.max(value, accepted), accepted + since);
  d.kills = clampOne(d.kills, guard.accepted, guard.since);
  guard.accepted = d.kills; guard.since = 0;
  const seen = new Set<number>();
  for (const row of d.stats) {
    const s = guard.slots.get(row[0]) ?? { accepted: 0, since: 0 };
    row[1] = clampOne(row[1], s.accepted, s.since);
    guard.slots.set(row[0], { accepted: row[1], since: 0 });
    seen.add(row[0]);
  }
  if (guard.restart) for (const slot of [...guard.slots.keys()]) if (!seen.has(slot)) guard.slots.delete(slot);
  guard.restart = false;
  return d;
}
/** Contract shim (§5.2): true when `next` needs no clamping against the baseline. */
export function zdirSane(prev: ZDirector | null, next: ZDirector, killEvents: number, killsAtEpoch: number, perSlot: Map<number, number>): boolean {
  const base = prev?.kills ?? killsAtEpoch;
  if (next.kills < base || next.kills > base + killEvents) return false;
  for (const row of next.stats) {
    const old = prev?.stats.find(r => r[0] === row[0])?.[1] ?? 0;
    if (row[1] < old || row[1] > old + (perSlot.get(row[0]) ?? 0)) return false;
  }
  return true;
}
