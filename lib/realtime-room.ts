import { HIT_TTL_MS, MAX_PENDING_HITS, SYNC_INTERVAL_MS } from './multiplayer-protocol.ts';
import type { IncomingHit, PeerState, PlayerState, ServerMessage } from './multiplayer-protocol.ts';
import {
  ACTIVE_MS, SESSION_MS, MAX_PLAYERS, MAX_BODY_BYTES, COLORS, UUID, ClientError,
  finite, hashToken, incomingHit, payload, playerHit, playerName, playerState,
  randomHex, readPayload, reply, roomCode, sameOrigin, worldVersion,
} from './room-validation.ts';
import { roomError } from './room-service.ts';

const CHECKPOINT_MS = 60_000;
const MAX_SESSIONS = 64;
const AUTH_TIMEOUT_MS = 5_000;
const RETRY_MS = 500;
const RECEIPT_TTL_MS = 20_000;
const MAX_RECEIPTS = 4096;
type SavedPlayer = { id: string; name: string; color: string; tokenHash: string; joinedAt: number; lastSeen: number };
/** `world` is the layout version (lib/world-bounds.ts WORLD_VERSION) every player in the room builds; rooms saved before it existed are version 1. */
type SavedRoom = { code: string; createdAt: number; lastActivity: number; players: SavedPlayer[]; world?: number };
type Player = SavedPlayer & { state?: PlayerState; updatedAt: number; vx: number; vz: number; connection?: Connection; damageWindow: number; damage: number };
type Connection = {
  socket: WebSocket; player?: Player; seq: number; closed: boolean; timer: ReturnType<typeof setTimeout>;
  rateStart: number; messages: number; queued: number; requestedRoom?: string;
};
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

  constructor(private ctx: DurableObjectState) {
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<SavedRoom>('room');
      if (saved) {
        this.room = saved;
        for (const player of saved.players) this.players.set(player.id, { ...player, updatedAt: 0, vx: 0, vz: 0, damageWindow: 0, damage: 0 });
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
            if (this.room && this.room.lastActivity > now - SESSION_MS) throw new ClientError('Mã phòng đã tồn tại.', 409);
            this.reset();
            this.room = { code, createdAt: now, lastActivity: now, players: [], world };
          } else {
            this.requireRoom(now, code);
            if (world !== (this.room!.world ?? 1)) throw new ClientError('Phòng này dùng bản đồ phiên bản khác. Hãy tải lại trang.', 409);
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
          this.players.set(id, player);
          this.room!.lastActivity = now;
          await this.persist(now);
          return reply({ room: code, id, token, color: player.color, peers: this.peers(id), serverTime: now }, body.action === 'create' ? 201 : 200);
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
      if (received - connection.rateStart >= 1000) { connection.rateStart = received; connection.messages = 0; }
      if (++connection.messages > 250 || connection.queued >= 32) { this.close(connection, 4403, 'Gửi dữ liệu quá nhanh.'); return; }
      if (typeof event.data !== 'string') { this.close(connection, 1003, 'Chỉ hỗ trợ JSON.'); return; }
      if (new TextEncoder().encode(event.data).byteLength > MAX_BODY_BYTES) { this.close(connection, 1009, 'Dữ liệu quá lớn.'); return; }
      let message: Record<string, unknown>;
      try { message = payload(JSON.parse(event.data)); }
      catch { this.close(connection, 4403, 'JSON không hợp lệ.'); return; }
      connection.queued++;
      void this.run(() => this.message(connection, message)).catch(error => {
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
      this.send(connection, { type: 'ready', id: player.id, serverTime: now });
      this.dirty = true;
      this.broadcast(now);
      this.deliverHits(now, player.id, true);
      this.startTimer();
      return;
    }
    const player = connection.player;
    player.lastSeen = now;
    this.room!.lastActivity = now;
    if (message.type === 'state') {
      if (!Number.isSafeInteger(message.seq) || (message.seq as number) <= 0) throw new ClientError('Số thứ tự trạng thái không hợp lệ.');
      if ((message.seq as number) <= connection.seq) return;
      const state = playerState(message.state);
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
    } else if (message.type === 'hit') {
      this.receiveHit(connection, message, now);
    } else if (message.type === 'hitAck') {
      if (typeof message.id === 'string' && this.hits.get(message.id)?.target === player.id) this.hits.delete(message.id);
    } else throw new ClientError('Bản tin không hợp lệ.');
  }

  private receiveHit(connection: Connection, message: Record<string, unknown>, now: number) {
    const player = connection.player!;
    if (typeof message.id !== 'string' || !UUID.test(message.id)) throw new ClientError('Mã đòn đánh không hợp lệ.');
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
      .map(player => ({ ...player.state!, id: player.id, name: player.name, color: player.color, updatedAt: player.updatedAt, vx: player.vx, vz: player.vz }));
  }
  private broadcast(now: number) {
    if (!this.dirty) return;
    this.dirty = false;
    const seq = ++this.seq;
    for (const connection of this.connections) if (connection.player) this.send(connection, { type: 'snapshot', seq, serverTime: now, peers: this.peers(connection.player.id) });
  }
  private send(connection: Connection, message: ServerMessage) {
    if (connection.closed) return;
    try { connection.socket.send(JSON.stringify(message)); }
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
  }
  private async persist(now: number) {
    if (!this.room) return;
    this.room.players = [...this.players.values()].map(({ id, name, color, tokenHash, joinedAt, lastSeen }) => ({ id, name, color, tokenHash, joinedAt, lastSeen }));
    await this.ctx.storage.put('room', this.room);
    // No recurring idle wakeups: online rooms checkpoint from their frame timer.
    await this.ctx.storage.setAlarm(this.room.lastActivity + SESSION_MS);
    this.persistedAt = now;
  }
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
