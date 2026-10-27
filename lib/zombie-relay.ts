/**
 * Zombie-room logic of the room Durable Object (design.md §1.6, §1.7, §9 A1–A6, A18–A20): routing and validation of
 * the z* messages, the cross-epoch kill guard, the caches a (re)connecting player gets, rate limits, and host
 * election/migration. realtime-room.ts only calls the hooks; this class never touches sockets or storage itself.
 * Every relayed frame is serialized once and the same string goes to each recipient.
 */
import type { ServerMessage } from './multiplayer-protocol.ts';
import {
  HIT_BUDGET_PER_S, HOST_GRACE_MS, HOST_MIN_TERM_MS, HOST_STALL_MS, NO_SLOT,
  type ZombieServerMessage, type ZPhase,
} from './zombie-protocol.ts';
import { ClientError } from './room-validation.ts';
import { clampDirector, createKillGuard, noteKill, zombieMessage } from './zombie-validation.ts';

/** What the relay needs to know about a session (realtime-room builds these views). */
export type RelayPlayer = {
  id: string; slot: number; joinedAt: number; connected: boolean;
  /** Server time of the last accepted `state` (0 = none yet). */
  lastState: number;
  /** The player's state carries zombie fields (its zombie mode is running): preferred, and required when anyone has it, as host. */
  ready?: boolean;
};
export type RelayIO = {
  /** A message (or an already serialized one) to one player's live connection; a no-op when it has none. */
  send(player: RelayPlayer, message: ServerMessage | string): void;
  /** Every session the room holds, connected or not. */
  players(): Iterable<RelayPlayer>;
  now(): number;
  /** Persist the election and the room record (SavedRoom.epoch/hostId/best, §9 A1). */
  save?(state: { epoch: number; hostId: string | null; best: number }): void;
  close?(player: RelayPlayer, code: number, reason: string): void;
};
export type RelayOptions = { ff?: boolean; epoch?: number; hostId?: string | null; best?: number; restored?: boolean };
type Why = Extract<ZombieServerMessage, { type: 'zrole' }>['why'];
type RateKey = 'zsnap' | 'zev' | 'zdir' | 'zhit' | 'zcmd' | 'zneed';

/** Messages per second per connection (§1.6; a snapshot counts once with all its parts, §9 A20). */
export const RELAY_LIMITS: Record<RateKey, number> = { zsnap: 15, zev: 30, zdir: 5, zhit: 25, zcmd: 5, zneed: 1 };
/**
 * Seconds of each limit a quiet connection banks (a token bucket): frames the room's serialized queue releases at once
 * after a hitch (they arrived 1-3 s late, by server time) pass; only a sustained flood is dropped. A zneed is only
 * ever repeated (the client asks again after 1.1 s): no bank.
 */
export const RELAY_BURST_S: Record<RateKey, number> = { zsnap: 3, zev: 3, zdir: 3, zhit: 3, zcmd: 3, zneed: 1 };
const RATE_KEYS = Object.keys(RELAY_LIMITS) as RateKey[];
const CANDIDATE_MS = 2000;
const MAX_CACHED_DELTAS = 24;
const MAX_CACHED_BYTES = 96 * 1024;
const KILLS_COUNTED_PER_S = 60;
const BEST_STEP_MS = 10_000;
const LAG_RTT_MS = 350, LAG_RTT_FOR_MS = 5000, GOOD_RTT_MS = 200;
const LAG_SNAP_MS = 300, LAG_SNAP_WINDOW_MS = 4000;
/** Under SLOW_FPS a host is slow; under CRAWL_FPS its 0.1 s step clamp slows the whole horde (handed over without the minimum term). */
const SLOW_FPS = 24, MIN_FPS = 30, CRAWL_FPS = 10;
const NOT_HOST = 'Không phải máy chủ của bầy zombie.';

type Info = {
  rtt: number | null; vis: boolean; fps: number; slowPings: number; readyAt: number;
  /** Token buckets (RELAY_BURST_S of each limit) and the frames denied in the current 1 s window (abuse after 5 windows over 2×). */
  tokens: Record<RateKey, number>; tokenAt: number; windowStart: number; denied: Record<RateKey, number>; abuse: Record<RateKey, number>; errorAt: number;
  snapSeq: number; snapOk: boolean; budget: number; budgetAt: number;
};
const zeroCounts = (): Record<RateKey, number> => ({ zsnap: 0, zev: 0, zdir: 0, zhit: 0, zcmd: 0, zneed: 0 });
const fullBuckets = (): Record<RateKey, number> => { const out = zeroCounts(); for (const key of RATE_KEYS) out[key] = RELAY_LIMITS[key] * RELAY_BURST_S[key]; return out; };

export class ZombieRelay {
  hostId: string | null;
  epoch: number;
  best: number;
  readonly ff: boolean;
  private infos = new Map<string, Info>();
  private electedAt: number;
  /** When the host's socket went away (grace running), or null. */
  private hostGoneAt: number | null = null;
  /** The creator has not connected yet (its first zrole says 'create'). */
  private created = false;
  private lastSnapAt: number;
  private snapTimes: number[] = [];
  private snapSeq = -1;
  private snapPart = -1;
  private lagSince: number | null = null;
  private guard = createKillGuard();
  private killWindow = 0;
  private killsInWindow = 0;
  private bestAt = -Infinity;
  private phase: ZPhase | null = null;
  private dirText: string | null = null;
  private keySeq = -1;
  private keyParts: string[] = [];
  private deltas: string[] = [];
  private deltaBytes = 0;

  constructor(private io: RelayIO, options: RelayOptions = {}) {
    const now = io.now();
    this.ff = options.ff === true;
    this.epoch = options.epoch ?? 0;
    this.hostId = options.hostId ?? null;
    this.best = options.best ?? 0;
    this.electedAt = this.lastSnapAt = now;
    // A restored actor lost every socket: the saved host gets the usual grace to come back and keep the role.
    if (options.restored && this.hostId) this.hostGoneAt = now;
    // ...and the kill baseline (never saved): the first zdir after the restart sets it, instead of clamping a running
    // host's 512 kills to the 0 kill events this actor has seen.
    if (options.restored) this.guard.unknown = true;
  }

  /** PvP hits are acknowledged and dropped (friendly fire off). */
  dropPvp(): boolean { return !this.ff; }

  /** The room was just created: the creator hosts epoch 1 and gets the usual grace to connect after the HTTP response. */
  onCreate(creator: RelayPlayer) {
    const now = this.io.now();
    this.epoch = 1; this.hostId = creator.id; this.electedAt = this.lastSnapAt = now; this.hostGoneAt = now; this.created = true;
    this.save();
  }

  /** A player authenticated (after `ready`): the caches, then its role (§1.6: caches before zrole, §9 A2). */
  onReady(player: RelayPlayer) {
    const now = this.io.now();
    const info = this.info(player.id);
    info.readyAt = now; info.windowStart = info.tokenAt = now; info.tokens = fullBuckets(); info.denied = zeroCounts(); info.abuse = zeroCounts();
    info.snapSeq = -1; info.slowPings = 0; info.vis = true;
    if (this.dirText) this.io.send(player, this.dirText);
    for (const text of this.keyParts) this.io.send(player, text);
    for (const text of this.deltas) this.io.send(player, text);
    if (this.hostId === player.id) {
      // The host is back within its grace (a dropped socket, the creator's first connection, a restarted actor): same epoch.
      const why: Why = this.created ? 'create' : 'restore';
      this.created = false;
      if (this.hostGoneAt !== null) { this.hostGoneAt = null; this.lastSnapAt = now; this.broadcastRole(why); }
      else this.io.send(player, this.role(why));
      return;
    }
    const host = this.hostId ? this.find(this.hostId) : undefined;
    if (host && !host.connected && this.hostGoneAt === null) this.hostGoneAt = now;
    if (!host || (!host.connected && now - this.hostGoneAt! >= HOST_GRACE_MS)) {
      // Nobody hosts (an empty room, or the grace ran out while nobody was here): this player is a candidate now.
      this.elect(now, this.hostId ? 'left' : 'join', this.hostId ?? undefined);
      return;
    }
    this.io.send(player, this.role('join'));
    this.need(player.slot);
  }

  onPing(player: RelayPlayer, rtt: number | undefined, vis: boolean | undefined, fps?: number) {
    const now = this.io.now();
    const info = this.info(player.id);
    if (rtt !== undefined) info.rtt = info.rtt === null ? rtt : info.rtt * 0.7 + rtt * 0.3;
    if (vis !== undefined) info.vis = vis;
    if (fps !== undefined) { info.fps = fps; info.slowPings = fps < SLOW_FPS ? info.slowPings + 1 : 0; }
    if (player.id !== this.hostId) return;
    // A hidden tab stops requestAnimationFrame and with it the whole simulation: hand over at once (§9 A6).
    if (vis === false && this.candidates(now, player.id).some(p => this.info(p.id).vis)) this.elect(now, 'stall', player.id);
    else this.checkSlow(now);
  }

  /** The player's socket closed or errored (the session lives on): the host keeps its role for HOST_GRACE_MS. */
  onDetach(player: RelayPlayer) {
    if (player.id === this.hostId && this.hostGoneAt === null) this.hostGoneAt = this.io.now();
  }

  /** The session left the room for good (already removed from io.players()). */
  onLeave(player: RelayPlayer) {
    this.infos.delete(player.id);
    if (player.id === this.hostId) this.elect(this.io.now(), 'left', player.id);
  }

  /** Called from the room's 50 ms frame timer: grace expiry, stalls, slow and lagging hosts (§1.7). */
  tick(now: number) {
    if (!this.hostId) { if (this.candidates(now).length) this.elect(now, 'join'); return; }
    const host = this.find(this.hostId);
    if (!host || !host.connected) {
      if (this.hostGoneAt === null) this.hostGoneAt = now;
      if (now - this.hostGoneAt >= HOST_GRACE_MS) this.elect(now, 'left', this.hostId);
      return;
    }
    const others = this.candidates(now, host.id);
    if (!others.length) { this.lagSince = null; return; }
    // A re-elected host gets twice as long for its first snapshot (the zrole round trip and its promotion):
    // under a machine-wide hitch, 1.5 s each made the role bounce between players at every tick of the backlog.
    if (now - Math.max(this.lastSnapAt, this.electedAt) >= (this.snapSeq < 0 && this.epoch > 1 ? HOST_STALL_MS * 2 : HOST_STALL_MS)) {
      // Only to a player that can simulate: a hidden tab never publishes and would hand the role straight back at its next
      // ping (two hidden tabs swapped it every 3 s). With nobody visible the stalled host keeps it; a tab that shows qualifies.
      if (others.some(p => this.info(p.id).vis)) this.elect(now, 'stall', host.id);
      return;
    }
    if (this.checkSlow(now)) return;
    if (now - this.electedAt < HOST_MIN_TERM_MS) return;
    const rtt = this.info(host.id).rtt;
    this.lagSince = rtt !== null && rtt > LAG_RTT_MS ? this.lagSince ?? now : null;
    const fast = others.some(p => { const i = this.info(p.id); return i.vis && i.rtt !== null && i.rtt < GOOD_RTT_MS; });
    while (this.snapTimes.length && this.snapTimes[0] < now - LAG_SNAP_WINDOW_MS) this.snapTimes.shift();
    const choppy = now - this.electedAt >= LAG_SNAP_WINDOW_MS && this.snapTimes.length < LAG_SNAP_WINDOW_MS / LAG_SNAP_MS;
    if (fast && ((this.lagSince !== null && now - this.lagSince >= LAG_RTT_FOR_MS) || choppy)) this.elect(now, 'lag', host.id);
  }

  /** One z* message from an authenticated player. Throws ClientError for malformed input (a non-fatal error frame). */
  onMessage(player: RelayPlayer, raw: Record<string, unknown>) {
    const now = this.io.now();
    const info = this.info(player.id);
    const type = raw.type as RateKey;
    if (!RATE_KEYS.includes(type)) throw new ClientError('Bản tin zombie không hợp lệ.');
    if (!this.allow(player, info, type, raw, now)) return;
    const msg = zombieMessage(raw, this.slotMask());
    switch (msg.type) {
      case 'zsnap': {
        if (!this.fromHost(player, info, msg.epoch, now)) return;
        if (msg.seq < this.snapSeq || (msg.seq === this.snapSeq && msg.part <= this.snapPart)) return;
        if (msg.seq !== this.snapSeq) this.snapTimes.push(now);
        if (this.snapTimes.length > 64) this.snapTimes.shift();
        this.snapSeq = msg.seq; this.snapPart = msg.part; this.lastSnapAt = now;
        const text = JSON.stringify({ type: 'zsnap', serverTime: now, epoch: msg.epoch, seq: msg.seq, key: msg.key, part: msg.part, parts: msg.parts, b: msg.b } satisfies ZombieServerMessage);
        if (msg.key) {
          if (msg.part === 0 || msg.seq !== this.keySeq) { this.keySeq = msg.seq; this.keyParts = []; this.deltas = []; this.deltaBytes = 0; }
          this.keyParts.push(text);
        } else {
          this.deltas.push(text); this.deltaBytes += text.length;
          while (this.deltas.length > MAX_CACHED_DELTAS || this.deltaBytes > MAX_CACHED_BYTES) this.deltaBytes -= this.deltas.shift()!.length;
        }
        this.toOthers(player.id, text);
        return;
      }
      case 'zdir': {
        if (!this.fromHost(player, info, msg.epoch, now)) return;
        const d = clampDirector(msg.d, this.guard);
        // The best wave is the highest one cleared (as the game's director counts it): a wave on, or lost, is not yet.
        const cleared = d.phase === 'rest' ? d.wave : Math.max(0, d.wave - 1);
        if (cleared > this.best && now - this.bestAt >= BEST_STEP_MS) { this.best = Math.min(cleared, this.best + 1); this.bestAt = now; this.save(); }
        d.best = this.best;
        this.phase = d.phase;
        this.dirText = JSON.stringify({ type: 'zdir', serverTime: now, epoch: msg.epoch, seq: msg.seq, d } satisfies ZombieServerMessage);
        this.toOthers(player.id, this.dirText);
        return;
      }
      case 'zev': {
        if (!this.fromHost(player, info, msg.epoch, now)) return;
        if (now - this.killWindow >= 1000) { this.killWindow = now; this.killsInWindow = 0; }
        for (const e of msg.ev) {
          // Kills above 60/s are relayed but not counted, so an RPG into a horde never freezes later zdirs (§9 A3).
          if (e.k === 'kill' && ++this.killsInWindow <= KILLS_COUNTED_PER_S) noteKill(this.guard, e.by);
          else if (e.k === 'wave' && e.p === 'restart') this.guard.restart = true;
        }
        if (msg.ev.length) this.toOthers(player.id, JSON.stringify({ type: 'zev', serverTime: now, epoch: msg.epoch, seq: msg.seq, ev: msg.ev } satisfies ZombieServerMessage));
        return;
      }
      case 'zhit': {
        if (player.id === this.hostId) { this.deny(player, info, 'Máy chủ không gửi đòn đánh zombie.', now); return; }
        info.budget = Math.min(HIT_BUDGET_PER_S, info.budget + Math.max(0, now - info.budgetAt) / 1000 * HIT_BUDGET_PER_S);
        info.budgetAt = now;
        const kept = msg.h.filter(h => { if (h.d > info.budget) return false; info.budget -= h.d; return true; });
        const host = this.hostId ? this.find(this.hostId) : undefined;
        if (kept.length && host?.connected) this.io.send(host, { type: 'zhit', serverTime: now, from: player.slot, h: kept });
        return;
      }
      case 'zcmd': {
        const c = msg.c;
        const text = JSON.stringify({ type: 'zcmd', serverTime: now, from: player.slot, c } satisfies ZombieServerMessage);
        const host = this.hostId ? this.find(this.hostId) : undefined;
        if (c.c === 'revive' || c.c === 'dogRevive') {
          const target = this.active().find(p => p.slot === c.to);
          if (!target || target.id === player.id) { this.deny(player, info, 'Không tìm thấy đồng đội cần cứu.', now); return; }
          this.io.send(target, text);
          if (host && host.id !== target.id && host.id !== player.id) this.io.send(host, text);
        } else if (c.c === 'mark') this.toOthers(player.id, text);
        else if (c.c === 'start') {
          // "Bắt đầu" on the waiting card: anyone may start the first wave while the room is still in prep.
          if (this.phase !== null && this.phase !== 'prep') { this.deny(player, info, 'Đợt đầu đã bắt đầu rồi.', now); return; }
          if (host && host.id !== player.id) this.io.send(host, text);
        } else {
          if (this.phase !== 'over') { this.deny(player, info, 'Chỉ chơi lại được khi cả đội đã gục.', now); return; }
          if (host && host.id !== player.id) this.io.send(host, text);
        }
        return;
      }
      case 'zneed': {
        if (player.id === this.hostId) return;
        const host = this.hostId ? this.find(this.hostId) : undefined;
        if (host?.connected) this.io.send(host, { type: 'zneed', from: player.slot });
        return;
      }
    }
  }

  /** Test/debug view of the relay's state. */
  debug() {
    return { hostId: this.hostId, epoch: this.epoch, best: this.best, hostGoneAt: this.hostGoneAt, phase: this.phase,
      cached: { dir: this.dirText !== null, key: this.keyParts.length, deltas: this.deltas.length }, kills: { ...this.guard, slots: [...this.guard.slots] } };
  }

  // ---- internals ----
  private info(id: string): Info {
    let info = this.infos.get(id);
    if (!info) {
      const now = this.io.now();
      info = { rtt: null, vis: true, fps: 60, slowPings: 0, readyAt: -Infinity, tokens: fullBuckets(), tokenAt: now, windowStart: now, denied: zeroCounts(), abuse: zeroCounts(),
        errorAt: -Infinity, snapSeq: -1, snapOk: true, budget: HIT_BUDGET_PER_S, budgetAt: now };
      this.infos.set(id, info);
    }
    return info;
  }
  private find(id: string): RelayPlayer | undefined { for (const p of this.io.players()) if (p.id === id) return p; return undefined; }
  private active(): RelayPlayer[] { return [...this.io.players()].filter(p => p.connected); }
  private slotMask() { let mask = 0; for (const p of this.active()) if (p.slot >= 0 && p.slot < 8) mask |= 1 << p.slot; return mask; }
  /** Connected players that sent state (or authenticated) in the last 2 s; only zombie-ready ones when anyone is ready. */
  private candidates(now: number, exclude?: string): RelayPlayer[] {
    const recent = this.active().filter(p => now - p.lastState <= CANDIDATE_MS || now - this.info(p.id).readyAt <= CANDIDATE_MS);
    const anyReady = recent.some(p => p.ready);
    const list = recent.filter(p => p.id !== exclude && (!anyReady || p.ready));
    const key = (p: RelayPlayer) => { const i = this.info(p.id); return [i.vis ? 0 : 1, i.fps >= MIN_FPS ? 0 : 1, i.rtt ?? 1000, p.joinedAt, p.slot]; };
    return list.map(p => ({ p, k: key(p) })).sort((a, b) => { for (let i = 0; i < 5; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; return 0; }).map(e => e.p);
  }
  /**
   * A slow host (two pings under SLOW_FPS) hands over after its minimum term to a visible player running at least 1.5×
   * its frame rate (and MIN_FPS): a 5 fps host whose best teammate runs 35 fps is replaced, not kept for want of a 40 fps
   * one. Under CRAWL_FPS the host's 0.1 s step clamp already slows every zombie in the room, so it goes without the term.
   */
  private checkSlow(now: number): boolean {
    if (!this.hostId) return false;
    const host = this.info(this.hostId);
    if (host.slowPings < 2 || (host.fps >= CRAWL_FPS && now - this.electedAt < HOST_MIN_TERM_MS)) return false;
    const need = Math.max(MIN_FPS, host.fps * 1.5);
    if (!this.candidates(now, this.hostId).some(p => { const i = this.info(p.id); return i.vis && i.fps >= need; })) return false;
    this.elect(now, 'lag', this.hostId);
    return true;
  }
  /** Elect the best candidate (never `exclude`); none → no host until the next player authenticates. */
  private elect(now: number, why: Why, exclude?: string) {
    const pick = this.candidates(now, exclude)[0];
    this.created = false;
    if (!pick) {
      if (this.hostId !== null) { this.hostId = null; this.hostGoneAt = null; this.save(); }
      return;
    }
    this.epoch++; this.hostId = pick.id; this.electedAt = this.lastSnapAt = now; this.hostGoneAt = null;
    this.snapSeq = this.snapPart = -1; this.snapTimes = []; this.lagSince = null;
    for (const info of this.infos.values()) { info.slowPings = 0; info.tokens = fullBuckets(); info.tokenAt = now; info.denied = zeroCounts(); info.abuse = zeroCounts(); info.windowStart = now; info.snapSeq = -1; }
    this.save();
    this.broadcastRole(why);
    this.io.send(pick, { type: 'zneed', from: NO_SLOT });
  }
  private role(why: Why): string {
    const host = this.hostId ? this.find(this.hostId) : undefined;
    return JSON.stringify({ type: 'zrole', host: this.hostId ?? '', slot: host?.slot ?? NO_SLOT, epoch: this.epoch, why } satisfies ZombieServerMessage);
  }
  private broadcastRole(why: Why) { const text = this.role(why); for (const p of this.active()) this.io.send(p, text); }
  private need(from: number) {
    const host = this.hostId ? this.find(this.hostId) : undefined;
    if (host?.connected) this.io.send(host, { type: 'zneed', from });
  }
  private toOthers(id: string, text: string) { for (const p of this.active()) if (p.id !== id) this.io.send(p, text); }
  private save() { this.io.save?.({ epoch: this.epoch, hostId: this.hostId, best: this.best }); }
  /** Host-only messages: a stale epoch is dropped silently (a demoted host mid-handover); a non-host gets one error per second. */
  private fromHost(player: RelayPlayer, info: Info, epoch: number, now: number): boolean {
    if (epoch < this.epoch) return false;
    if (epoch > this.epoch) { this.deny(player, info, 'Kỷ nguyên máy chủ zombie không hợp lệ.', now); return false; }
    if (player.id !== this.hostId) { this.deny(player, info, NOT_HOST, now); return false; }
    return true;
  }
  private deny(player: RelayPlayer, info: Info, message: string, now: number) {
    if (now - info.errorAt < 1000) return;
    info.errorAt = now;
    this.io.send(player, { type: 'error', message, fatal: false });
  }
  /**
   * Per-connection rate limits, as token buckets refilled at RELAY_LIMITS by server time and holding RELAY_BURST_S of
   * them: over → dropped (one error per second); more than 2× the limit dropped in each of 5 windows in a row (a
   * sustained flood above 3×) → closed 4403. A backlog after a hitch rides on the tokens its silence banked.
   */
  private allow(player: RelayPlayer, info: Info, type: RateKey, raw: Record<string, unknown>, now: number): boolean {
    const elapsed = Math.max(0, now - info.tokenAt) / 1000;
    info.tokenAt = now;
    for (const key of RATE_KEYS) info.tokens[key] = Math.min(RELAY_LIMITS[key] * RELAY_BURST_S[key], info.tokens[key] + elapsed * RELAY_LIMITS[key]);
    if (now - info.windowStart >= 1000) {
      const quiet = now - info.windowStart >= 2000;
      for (const key of RATE_KEYS) info.abuse[key] = !quiet && info.denied[key] > 2 * RELAY_LIMITS[key] ? info.abuse[key] + 1 : 0;
      info.windowStart = now; info.denied = zeroCounts();
      if (RATE_KEYS.some(key => info.abuse[key] >= 5)) { this.io.close?.(player, 4403, 'Gửi dữ liệu quá nhanh.'); return false; }
    }
    // All parts of one snapshot count once and share one verdict.
    if (type === 'zsnap' && raw.seq === info.snapSeq) return info.snapOk;
    const ok = info.tokens[type] >= 1;
    if (ok) info.tokens[type] -= 1; else info.denied[type]++;
    if (type === 'zsnap') { info.snapSeq = raw.seq as number; info.snapOk = ok; }
    if (!ok) this.deny(player, info, 'Gửi dữ liệu zombie quá nhanh.', now);
    return ok;
  }
}
