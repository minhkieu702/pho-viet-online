import { HIT_TTL_MS, MAX_PENDING_HITS, SYNC_INTERVAL_MS } from './multiplayer-protocol.ts';
import type { IncomingHit, PeerState, PlayerState, ServerMessage } from './multiplayer-protocol.ts';
import {
  ACTIVE_MS, SESSION_MS, MAX_PLAYERS, MAX_BODY_BYTES, COLORS, UUID, ClientError,
  finite, hashToken, incomingHit, payload, playerHit, playerName, playerState,
  randomHex, readPayload, reply, roomCode, sameOrigin, worldVersion,
} from './room-validation.ts';
import { roomError } from './room-service.ts';
// ---- zombie co-op (design.md §5, NET) ----
import { NO_SLOT, type RoomMode } from './zombie-protocol.ts';
import { roomMode, zombieVersion } from './zombie-validation.ts';
import { ZombieRelay, type RelayPlayer } from './zombie-relay.ts';
// ---- end zombie co-op ----

const CHECKPOINT_MS = 60_000;
const MAX_SESSIONS = 64;
const AUTH_TIMEOUT_MS = 5_000;
const RETRY_MS = 500;
const RECEIPT_TTL_MS = 20_000;
const MAX_RECEIPTS = 4096;
/** `slot` 0..7 belongs to active sessions only: an idle session gives it back and gets the lowest free one on its next auth (§9 A19). */
type SavedPlayer = { id: string; name: string; color: string; tokenHash: string; joinedAt: number; lastSeen: number; slot?: number };
/**
 * `world` is the layout version (lib/world-bounds.ts WORLD_VERSION) every player in the room builds; rooms saved before it existed are version 1.
 * Zombie rooms (mode 'zombie') also keep the client ZOMBIE_VERSION, friendly fire, the best wave and the host election (§9 A1).
 */
type SavedRoom = {
  code: string; createdAt: number; lastActivity: number; players: SavedPlayer[]; world?: number;
  mode?: RoomMode; zv?: number; ff?: boolean; best?: number; epoch?: number; hostId?: string | null;
};
type Player = SavedPlayer & { state?: PlayerState; updatedAt: number; vx: number; vz: number; connection?: Connection; damageWindow: number; damage: number };
type Connection = {
  socket: WebSocket; player?: Player; seq: number; closed: boolean; timer: ReturnType<typeof setTimeout>;
  rateStart: number; messages: number; queued: number; requestedRoom?: string;
  /** Authenticated sockets: a token bucket of MAX_MESSAGES_PER_S, refilled by server time (rateStart = last refill). */
  tokens?: number;
  /** The newest state that arrived during a backlog, applied once the queue reaches it. */
  latest?: Record<string, unknown>;
};
/**
 * An authenticated socket may average 250 messages a second and bank 3 s of them: when this actor's serialized queue
 * stalls (a slow machine, storage), the frames a player sent meanwhile arrive together and must not read as a flood.
 * While 32 or more of a socket's messages wait, its states are coalesced (the newest one is applied) and pings and
 * zneeds dropped; a zombie host's snapshots stay queued (dropped ones would read as a stalled host and hand the horde
 * over). Only a backlog of 256 closes the socket, with 1013 (try again later: the client reconnects), never 4403.
 */
const MAX_MESSAGES_PER_S = 250, MESSAGE_BURST = 750, QUEUE_SOFT = 32, QUEUE_HARD = 256;
const SUPERSEDED = new Set(['state', 'ping', 'zneed']);
type PendingHit = { id: string; target: string; hit: IncomingHit; expiresAt: number; sentAt: number };

/** One serialized room actor. D1 is deliberately absent from its movement path.
 * Sessions survive actor restarts; live positions are restored by clients' next sample.
 * Regular WebSockets keep active rooms alive. Idle rooms have no frame timer.
 */
export class RealtimeRoom implements DurableObject {
  private room?: SavedRoom;
  private players = new Map<string, Player>();
  private connections = new Set<Connection>();
  private receipts = new Map<string, number>();
  private hits = new Map<string, PendingHit>();
  private queue: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private tickPending = false;
  private dirty = false;
  private seq = 0;
  private persistedAt = 0;
  /** Zombie rooms only (lib/zombie-relay.ts). */
  private relay?: ZombieRelay;

  constructor(private ctx: DurableObjectState) {
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<SavedRoom>('room');
      if (saved) {
        this.room = saved;
        for (const player of saved.players) this.players.set(player.id, { ...player, updatedAt: 0, vx: 0, vz: 0, damageWindow: 0, damage: 0 });
        if (saved.mode === 'zombie') this.relay = this.zombieRelay(true);
      }
      this.persistedAt = Date.now();
    });
  }

  private run<T>(work: () => Promise<T> | T): Promise<T> {
    const task = this.queue.then(() => this.ready).then(work);
    this.queue = task.catch(() => {});
    return task;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        sameOrigin(request);
        return await this.run(() => this.upgrade(request));
      }
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/lifecycle') return reply({ error: 'Không tìm thấy.' }, 404);
      const body = await readPayload(request);
      return await this.run(async () => {
        const now = Date.now();
        this.prune(now);
        const code = roomCode(body.room);
        if (body.action === 'create' || body.action === 'join') {
          const name = playerName(body.name), world = worldVersion(body.world);
          if (body.action === 'create') {
            const mode = roomMode(body.mode), zv = zombieVersion(body.zv);
            if (mode === 'zombie' && zv === null) throw new ClientError('Phiên bản chế độ Zombie không hợp lệ. Hãy tải lại trang.');
            if (this.room && this.room.lastActivity > now - SESSION_MS) throw new ClientError('Mã phòng đã tồn tại.', 409);
            this.reset();
            this.room = { code, createdAt: now, lastActivity: now, players: [], world };
            if (mode === 'zombie') {
              Object.assign(this.room, { mode, zv: zv!, ff: body.ff === true, best: 0, epoch: 0, hostId: null });
              this.relay = this.zombieRelay(false);
            }
          } else {
            this.requireRoom(now, code);
            if (world !== (this.room!.world ?? 1)) throw new ClientError('Phòng này dùng bản đồ phiên bản khác. Hãy tải lại trang.', 409);
            if (this.room!.mode === 'zombie' && zombieVersion(body.zv) !== this.room!.zv) throw new ClientError('Phòng Zombie này dùng phiên bản khác. Hãy tải lại trang.', 409);
          }
          if (this.activeCount(now) >= MAX_PLAYERS) throw new ClientError('Phòng đã đủ 8 người. Hãy thử một phòng khác.', 409);
          const token = randomHex();
          const id = crypto.randomUUID();
          const player: Player = {
            id, name, tokenHash: await hashToken(token), joinedAt: now, lastSeen: now,
            color: COLORS[crypto.getRandomValues(new Uint8Array(1))[0] % COLORS.length],
            updatedAt: 0, vx: 0, vz: 0, damageWindow: 0, damage: 0,
          };
          this.trimSessions(now);
          player.slot = this.freeSlot(now, id);
          this.players.set(id, player);
          this.room!.lastActivity = now;
          if (body.action === 'create') this.relay?.onCreate(this.relayView(player));
          await this.persist(now);
          const zombie = { mode: this.room!.mode ?? 'city', slot: player.slot, ff: this.room!.ff === true, host: this.relay?.hostId ?? null, epoch: this.relay?.epoch ?? 0 };
          return reply({ room: code, id, token, color: player.color, peers: this.peers(id), serverTime: now, ...zombie }, body.action === 'create' ? 201 : 200);
        }
        if (body.action !== 'leave') throw new ClientError('Thao tác phòng không hợp lệ.');
        const tokenHash = await hashToken(body.token);
        if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new ClientError('Phiên chơi không hợp lệ.', 401);
        if (this.room && this.room.code !== code) throw new ClientError('Không tìm thấy phòng.', 404);
        const player = this.players.get(body.id);
        if (player) {
          if (player.tokenHash !== tokenHash) throw new ClientError('Phiên chơi không hợp lệ.', 401);
          if (player.connection) this.close(player.connection, 4401, 'Đã rời phòng.');
          this.players.delete(player.id);
          for (const [id, hit] of this.hits) if (hit.target === player.id) this.hits.delete(id);
          this.relay?.onLeave(this.relayView(player));
          this.dirty = true;
          await this.persist(now);
          this.broadcast(now);
        }
        return reply({ ok: true, serverTime: now });
      });
    } catch (error) { return roomError(error); }
  }

  private requireRoom(now: number, code?: string) {
    if (!this.room || this.room.lastActivity <= now - SESSION_MS || (code && code !== this.room.code)) throw new ClientError('Không tìm thấy phòng hoặc phòng đã hết hạn.', 404);
  }
  private activeCount(now: number) { return [...this.players.values()].filter(player => player.lastSeen > now - ACTIVE_MS).length; }

  private upgrade(request: Request) {
    const now = Date.now();
    this.prune(now);
    const requestedRoom = roomCode(new URL(request.url).searchParams.get('room'));
    if (this.connections.size >= 24) throw new ClientError('Có quá nhiều kết nối đang chờ.', 429);
    const pair = new WebSocketPair();
    const socket = pair[1];
    socket.accept();
    const connection: Connection = {
      socket, seq: 0, closed: false, rateStart: now, messages: 0, queued: 0, requestedRoom,
      timer: setTimeout(() => { void this.run(() => this.close(connection, 4401, 'Hết thời gian xác thực.')); }, AUTH_TIMEOUT_MS),
    };
    this.connections.add(connection);
    socket.addEventListener('message', event => {
      if (connection.closed) return;
      const received = Date.now();
      const authed = !!connection.player;
      if (authed) {
        connection.tokens = Math.min(MESSAGE_BURST, (connection.tokens ?? MESSAGE_BURST) + Math.max(0, received - connection.rateStart) * MAX_MESSAGES_PER_S / 1000) - 1;
        connection.rateStart = received;
        if (connection.tokens < 0) { this.close(connection, 4403, 'Gửi dữ liệu quá nhanh.'); return; }
        if (connection.queued >= QUEUE_HARD) { this.close(connection, 1013, 'Máy chủ đang quá tải, đang kết nối lại.'); return; }
      } else {
        if (received - connection.rateStart >= 1000) { connection.rateStart = received; connection.messages = 0; }
        if (++connection.messages > MAX_MESSAGES_PER_S || connection.queued >= QUEUE_SOFT) { this.close(connection, 4403, 'Gửi dữ liệu quá nhanh.'); return; }
      }
      if (typeof event.data !== 'string') { this.close(connection, 1003, 'Chỉ hỗ trợ JSON.'); return; }
      if (new TextEncoder().encode(event.data).byteLength > MAX_BODY_BYTES) { this.close(connection, 1009, 'Dữ liệu quá lớn.'); return; }
      let message: Record<string, unknown>;
      try { message = payload(JSON.parse(event.data)); }
      catch { this.close(connection, 4403, 'JSON không hợp lệ.'); return; }
      let work = () => this.message(connection, message);
      // A backlog: the newest state replaces this one anyway (coalesced: the newest one waiting is applied once the
      // queue reaches it); a ping or zneed is simply sent again.
      if (authed && connection.queued >= QUEUE_SOFT && SUPERSEDED.has(message.type as string)) {
        if (message.type !== 'state') return;
        const waiting = connection.latest !== undefined;
        connection.latest = message;
        if (waiting) return;
        work = async () => { const latest = connection.latest; connection.latest = undefined; if (latest) await this.message(connection, latest); };
      }
      connection.queued++;
      void this.run(work).catch(error => {
        if (error instanceof ClientError) this.send(connection, { type: 'error', message: error.message, fatal: false });
        else this.close(connection, 1011, 'Máy chủ đang kết nối lại.');
      }).finally(() => { connection.queued--; });
    });
    const disconnect = () => { void this.run(async () => {
      if (!connection.closed && connection.player?.connection === connection) {
        connection.player.lastSeen = Date.now();
        if (this.room) this.room.lastActivity = Date.now();
      }
      this.detach(connection);
      // A final checkpoint also makes a long-idle room recoverable after eviction.
      if (![...this.connections].some(item => item.player)) await this.persist(Date.now());
    }).catch(() => {}); };
    socket.addEventListener('close', event => {
      // Complete the close handshake even on Workers compatibility dates that
      // do not automatically reply to the peer's close frame.
      try { socket.close(event.code === 1005 ? 1000 : event.code, event.reason); } catch { /* Already closed. */ }
      disconnect();
    });
    socket.addEventListener('error', disconnect);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private async message(connection: Connection, message: Record<string, unknown>) {
    if (connection.closed) return;
    const now = Date.now();
    if (!connection.player) {
      if (message.type !== 'auth' || typeof message.id !== 'string' || !UUID.test(message.id)) { this.close(connection, 4401, 'Cần xác thực phiên chơi.'); return; }
      let tokenHash: string;
      try { tokenHash = await hashToken(message.token); }
      catch { this.close(connection, 4401, 'Phiên chơi không hợp lệ.'); return; }
      if (connection.closed) return;
      this.prune(now);
      // Browsers cannot inspect a rejected upgrade's HTTP status. Report an
      // expired room as a terminal socket close instead of a reconnect loop.
      try { this.requireRoom(now, connection.requestedRoom); } catch { this.close(connection, 4404, 'Phòng đã hết hạn.'); return; }
      const player = this.players.get(message.id);
      if (!player || player.tokenHash !== tokenHash || player.lastSeen <= now - SESSION_MS) { this.close(connection, 4401, 'Phiên chơi đã hết hạn. Hãy vào lại phòng.'); return; }
      if (player.lastSeen <= now - ACTIVE_MS && this.activeCount(now) >= MAX_PLAYERS) { this.close(connection, 4409, 'Phòng đã đủ 8 người khi bạn mất kết nối.'); return; }
      if (player.connection) this.close(player.connection, 4001, 'Phiên chơi đã được mở ở kết nối khác.');
      clearTimeout(connection.timer);
      connection.player = player;
      player.connection = connection;
      player.lastSeen = now;
      // Never extrapolate an old position across a reconnection gap.
      player.vx = 0; player.vz = 0;
      this.room!.lastActivity = now;
      if (player.slot === undefined || [...this.players.values()].some(other => other !== player && other.slot === player.slot && this.isActive(other, now))) player.slot = this.freeSlot(now, player.id);
      this.send(connection, { type: 'ready', id: player.id, serverTime: now, mode: this.room!.mode ?? 'city', slot: player.slot });
      this.dirty = true;
      this.broadcast(now);
      this.deliverHits(now, player.id, true);
      this.relay?.onReady(this.relayView(player));
      this.startTimer();
      return;
    }
    const player = connection.player;
    player.lastSeen = now;
    this.room!.lastActivity = now;
    if (message.type === 'state') {
      if (!Number.isSafeInteger(message.seq) || (message.seq as number) <= 0) throw new ClientError('Số thứ tự trạng thái không hợp lệ.');
      if ((message.seq as number) <= connection.seq) return;
      const state = playerState(message.state, this.room!.mode ?? 'city');
      const dt = (now - player.updatedAt) / 1000;
      const old = player.state;
      const distance = old ? Math.hypot(state.x - old.x, state.z - old.z) : Infinity;
      const validVelocity = old && dt >= 0.015 && dt <= 0.5 && distance <= 40 * dt + 1;
      let vx = validVelocity ? (state.x - old!.x) / dt : 0;
      let vz = validVelocity ? (state.z - old!.z) / dt : 0;
      const speed = Math.hypot(vx, vz);
      if (speed > 36) { vx *= 36 / speed; vz *= 36 / speed; }
      player.state = state; player.updatedAt = now; player.vx = vx; player.vz = vz;
      connection.seq = message.seq as number;
      this.dirty = true;
    } else if (message.type === 'ping') {
      if (!finite(message.sentAt)) throw new ClientError('Thời gian ping không hợp lệ.');
      this.send(connection, { type: 'pong', sentAt: message.sentAt, serverTime: now });
      const { rtt, vis, fps } = message;
      this.relay?.onPing(this.relayView(player), finite(rtt) && rtt >= 0 && rtt <= 60_000 ? rtt : undefined,
        typeof vis === 'boolean' ? vis : undefined, finite(fps) && fps >= 0 && fps <= 1000 ? fps : undefined);
    } else if (message.type === 'hit') {
      this.receiveHit(connection, message, now);
    } else if (typeof message.type === 'string' && message.type.startsWith('z')) {
      if (!this.relay) throw new ClientError('Phòng này không chơi chế độ Zombie.');
      this.relay.onMessage(this.relayView(player), message);
    } else if (message.type === 'hitAck') {
      if (typeof message.id === 'string' && this.hits.get(message.id)?.target === player.id) this.hits.delete(message.id);
    } else throw new ClientError('Bản tin không hợp lệ.');
  }

  private receiveHit(connection: Connection, message: Record<string, unknown>, now: number) {
    const player = connection.player!;
    if (typeof message.id !== 'string' || !UUID.test(message.id)) throw new ClientError('Mã đòn đánh không hợp lệ.');
    // Zombie rooms without friendly fire: acknowledged so the sender stops retrying, never delivered (§1.11).
    if (this.relay?.dropPvp()) { this.send(connection, { type: 'hitAck', id: message.id }); return; }
    const id = `${player.id}:${message.id}`;
    this.pruneHits(now);
    if (this.receipts.has(id)) { this.send(connection, { type: 'hitAck', id: message.id }); return; }
    const hit = playerHit(message.hit, player.id);
    const target = this.players.get(hit.target);
    if (this.receipts.size >= MAX_RECEIPTS) throw new ClientError('Đang xử lý nhiều đòn đánh, vui lòng chờ.');
    // Acknowledge obsolete targets so they do not remain in the sender's retry queue.
    if (!target || !target.state || target.lastSeen <= now - ACTIVE_MS) {
      this.receipts.set(id, now + RECEIPT_TTL_MS);
      this.send(connection, { type: 'hitAck', id: message.id }); return;
    }
    if (this.hits.size >= MAX_PENDING_HITS) throw new ClientError('Đang xử lý nhiều đòn đánh, vui lòng chờ.');
    if (now - player.damageWindow >= 1000) { player.damageWindow = now; player.damage = 0; }
    if (player.damage + hit.damage > 400) throw new ClientError('Gửi đòn đánh quá nhanh.');
    player.damage += hit.damage;
    this.receipts.set(id, now + RECEIPT_TTL_MS);
    this.hits.set(id, { id, target: target.id, hit: incomingHit(hit, player.id, player.name), expiresAt: now + HIT_TTL_MS, sentAt: 0 });
    this.send(connection, { type: 'hitAck', id: message.id });
    this.deliverHits(now, target.id);
  }

  private peers(exclude: string): PeerState[] {
    return [...this.players.values()].filter(player => player.id !== exclude && player.connection && !player.connection.closed && player.state)
      .map(player => ({ ...player.state!, id: player.id, name: player.name, color: player.color, updatedAt: player.updatedAt,
        vx: Math.round(player.vx * 100) / 100, vz: Math.round(player.vz * 100) / 100, slot: player.slot }));
  }
  private broadcast(now: number) {
    if (!this.dirty) return;
    this.dirty = false;
    const seq = ++this.seq;
    for (const connection of this.connections) if (connection.player) this.send(connection, { type: 'snapshot', seq, serverTime: now, peers: this.peers(connection.player.id) });
  }
  private send(connection: Connection, message: ServerMessage | string) {
    if (connection.closed) return;
    // Relayed zombie frames arrive already serialized: one JSON.stringify for every recipient (§9 A18).
    try { connection.socket.send(typeof message === 'string' ? message : JSON.stringify(message)); }
    catch { this.close(connection, 1011, 'Kết nối bị gián đoạn.'); }
  }
  private close(connection: Connection, code: number, reason: string) {
    if (connection.closed) return;
    this.detach(connection);
    try { connection.socket.close(code, reason); } catch { /* Socket already closed. */ }
  }
  private detach(connection: Connection) {
    if (connection.closed) return;
    connection.closed = true;
    clearTimeout(connection.timer);
    this.connections.delete(connection);
    const player = connection.player;
    if (player?.connection === connection) {
      player.connection = undefined;
      player.vx = 0; player.vz = 0;
      this.dirty = true;
      this.relay?.onDetach(this.relayView(player));
    }
    if (![...this.connections].some(item => item.player) && this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }
  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.tickPending) return;
      this.tickPending = true;
      void this.run(async () => {
        const now = Date.now();
        this.prune(now);
        this.broadcast(now);
        this.deliverHits(now);
        this.relay?.tick(now);
        if (now - this.persistedAt >= CHECKPOINT_MS) await this.persist(now);
      }).catch(() => {}).finally(() => { this.tickPending = false; });
    }, SYNC_INTERVAL_MS);
  }
  private deliverHits(now: number, target?: string, force = false) {
    this.pruneHits(now);
    for (const pending of this.hits.values()) {
      if (target && pending.target !== target) continue;
      const connection = this.players.get(pending.target)?.connection;
      if (connection && (force || now - pending.sentAt >= RETRY_MS)) {
        this.send(connection, { type: 'hit', id: pending.id, hit: pending.hit });
        pending.sentAt = now;
      }
    }
  }
  private pruneHits(now: number) {
    for (const [id, expiresAt] of this.receipts) if (expiresAt <= now) this.receipts.delete(id);
    for (const [id, pending] of this.hits) if (pending.expiresAt <= now) this.hits.delete(id);
  }
  private prune(now: number) {
    for (const player of this.players.values()) {
      if (player.connection && player.lastSeen <= now - ACTIVE_MS) this.close(player.connection, 4000, 'Mất nhịp kết nối.');
      if (player.lastSeen <= now - SESSION_MS) this.players.delete(player.id);
    }
    this.pruneHits(now);
  }
  private trimSessions(now: number) {
    const inactive = [...this.players.values()].filter(player => !player.connection && player.lastSeen <= now - ACTIVE_MS).sort((a, b) => a.lastSeen - b.lastSeen);
    while (this.players.size >= MAX_SESSIONS && inactive.length) this.players.delete(inactive.shift()!.id);
  }
  private reset() {
    for (const connection of this.connections) this.close(connection, 4404, 'Phòng đã hết hạn.');
    this.players.clear(); this.receipts.clear(); this.hits.clear();
    this.relay = undefined;
  }
  private async persist(now: number) {
    if (!this.room) return;
    this.room.players = [...this.players.values()].map(({ id, name, color, tokenHash, joinedAt, lastSeen, slot }) => ({ id, name, color, tokenHash, joinedAt, lastSeen, slot }));
    await this.ctx.storage.put('room', this.room);
    // No recurring idle wakeups: online rooms checkpoint from their frame timer.
    await this.ctx.storage.setAlarm(this.room.lastActivity + SESSION_MS);
    this.persistedAt = now;
  }
  // ---- zombie co-op (design.md §1.6, NET) ----
  private isActive(player: Player, now: number) { return player.lastSeen > now - ACTIVE_MS || Boolean(player.connection && !player.connection.closed); }
  /** The lowest slot no other active session holds (the 8-player cap keeps one free). */
  private freeSlot(now: number, self: string) {
    const taken = new Set<number>();
    for (const player of this.players.values()) if (player.id !== self && player.slot !== undefined && this.isActive(player, now)) taken.add(player.slot);
    for (let slot = 0; slot < MAX_PLAYERS; slot++) if (!taken.has(slot)) return slot;
    return 0;
  }
  private relayView(player: Player): RelayPlayer {
    return { id: player.id, slot: player.slot ?? NO_SLOT, joinedAt: player.joinedAt, connected: Boolean(player.connection && !player.connection.closed),
      lastState: player.updatedAt, ready: player.state?.zd !== undefined };
  }
  private zombieRelay(restored: boolean) {
    const room = this.room!;
    return new ZombieRelay({
      now: () => Date.now(),
      players: () => [...this.players.values()].map(player => this.relayView(player)),
      send: (player, message) => { const connection = this.players.get(player.id)?.connection; if (connection) this.send(connection, message); },
      close: (player, code, reason) => { const connection = this.players.get(player.id)?.connection; if (connection) this.close(connection, code, reason); },
      save: state => {
        if (this.room !== room) return;
        Object.assign(room, state);
        // Elections are rare; the write is not awaited (the actor's output gate still orders it before later replies).
        void this.persist(Date.now()).catch(() => {});
      },
    }, { ff: room.ff, epoch: room.epoch, hostId: room.hostId, best: room.best, restored });
  }
  // ---- end zombie co-op ----

  async alarm() {
    await this.run(async () => {
      const now = Date.now();
      this.prune(now);
      if (!this.room || this.room.lastActivity <= now - SESSION_MS) {
        this.reset(); this.room = undefined;
        await this.ctx.storage.deleteAll();
      } else {
        await this.persist(now);
        this.broadcast(now);
      }
    });
  }
}
