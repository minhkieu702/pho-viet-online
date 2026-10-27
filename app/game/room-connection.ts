import {
  HIT_TTL_MS, MAX_PENDING_HITS, SYNC_INTERVAL_MS,
  type ClientMessage, type IncomingHit, type OutgoingHit, type PeerState,
  type PlayerState, type ServerMessage, type Session,
} from '../../lib/multiplayer-protocol.ts';
// ---- zombie co-op (design.md §5.2, NET) ----
import { MAX_FRAME_BYTES, type RoomMode, type ZombieClientMessage, type ZombieServerMessage } from '../../lib/zombie-protocol.ts';
/** Zombie frames are drained only while the socket's send buffer is below this (§5.2). */
const ZOMBIE_BUFFER_BYTES = 16 * 1024;
const utf8 = typeof TextEncoder === 'undefined' ? null : new TextEncoder();
const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
// ---- end zombie co-op ----

const MAX_BUFFERED_BYTES = 32 * 1024;
const RETRY_HIT_MS = 750;
const HEARTBEAT_MS = 2000;
const CONNECTION_TIMEOUT_MS = 10_000;
const FATAL_CLOSE_CODES = new Set([4001, 4401, 4403, 4404, 4409]);
// ---- zombie co-op (NET): a 4403 for the send rate follows a backlog in the room (its queue released late frames at
// once), not this client: reconnect with backoff instead of ending the session (malformed JSON stays fatal).
const RATE_REASON = 'Gửi dữ liệu quá nhanh.';
// ---- end zombie co-op ----

// A narrow socket interface also lets tests exercise reconnects without a server.
export interface RoomSocket {
  readyState: number;
  bufferedAmount: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason?: string }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RoomCallbacks = {
  getState(): PlayerState | undefined;
  takeHits(): OutgoingHit[];
  onPeers(peers: PeerState[], serverTime: number): void;
  onHits(hits: IncomingHit[]): void;
  onStatus(status: 'connected' | 'reconnecting'): void;
  onLatency(milliseconds: number): void;
  onFatal(message: string): void;
  // ---- zombie co-op (NET) ----
  /** Zombie frames to send this tick (≤ maxBytes in total, each ≤ MAX_FRAME_BYTES); drained every tick while the buffer is below 16 KB. */
  takeZombie?(maxBytes: number): ZombieClientMessage[];
  /** Every z* message from the room, in order (after `ready`). */
  onZombie?(message: ZombieServerMessage): void;
  /** Each `ready` (the first and every reconnect): the room's mode and this session's slot, which may change after a long idle. */
  onReady?(info: { mode?: RoomMode; slot?: number; serverTime: number; reconnect: boolean }): void;
  /** Frames per second over the last 2 s, reported with each ping (host election, §1.7). */
  fps?(): number;
  /** Server time of every ready/snapshot/pong, so clocks work even when no zombie frame arrives (a lone host). */
  onServerTime?(serverTime: number): void;
  /** A socket closed with this code (diagnostics: reconnects and 1009/4403 closes). */
  onClose?(code: number): void;
};

type Options = {
  createSocket?: (url: string) => RoomSocket;
  now?: () => number;
  makeId?: () => string;
  random?: () => number;
};
type PendingHit = { hit: OutgoingHit; createdAt: number; sentAt: number };

/** Owns one room session; dispose cancels all sockets, retries and game callbacks. */
export function connectRoom(session: Session, baseUrl: string, callbacks: RoomCallbacks, options: Options = {}) {
  const now = options.now ?? (() => performance.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const random = options.random ?? Math.random;
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as RoomSocket);
  const url = new URL('/api/room/socket', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('room', session.room);
  const pending = new Map<string, PendingHit>();
  const received = new Map<string, number>();
  let socket: RoomSocket | null = null;
  let disposed = false;
  let ready = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let sequence = 0;
  let snapshotSequence = -1;
  let lastReceived = now();
  let lastPing = -Infinity;
  let pendingPing: number | null = null;
  let hitBudget = 8;
  let budgetTime = now();
  let readies = 0;
  let lastRtt: number | undefined;

  function send(message: ClientMessage) {
    if (!socket || socket.readyState !== 1 || socket.bufferedAmount > MAX_BUFFERED_BYTES) return false;
    try { socket.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  function sendText(text: string) {
    if (!socket || socket.readyState !== 1 || socket.bufferedAmount > MAX_BUFFERED_BYTES) return false;
    try { socket.send(text); return true; } catch { return false; }
  }

  function ping(time: number) {
    if (send({ type: 'ping', sentAt: time, rtt: lastRtt, vis: visible(), fps: callbacks.fps ? Math.round(callbacks.fps()) : undefined })) {
      lastPing = time;
      pendingPing = time;
    }
  }
  // A hidden tab stops the game loop at once: tell the room now, not at the next heartbeat (a hidden zombie host is replaced, §9 A6).
  const onVisibility = () => { if (!disposed && ready) ping(now()); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  function detach() {
    const old = socket;
    socket = null;
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try { old.close(1000, 'Session ended'); } catch { /* Already closed. */ }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearInterval(tick);
    clearTimeout(retry);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    detach();
    pending.clear();
    received.clear();
  }

  function fatal(message: string) {
    dispose();
    callbacks.onFatal(message);
  }

  function reconnect() {
    if (disposed || retry !== undefined) return;
    ready = false;
    detach();
    callbacks.onStatus('reconnecting');
    callbacks.onPeers([], 0);
    const delay = Math.min(10_000, 500 * 2 ** Math.min(failures++, 5)) + random() * 250;
    retry = setTimeout(() => { retry = undefined; open(); }, delay);
  }

  function onMessage(data: unknown) {
    if (typeof data !== 'string' || data.length > 64 * 1024) return;
    let message: ServerMessage;
    try { message = JSON.parse(data); } catch { return; }
    if (!message || typeof message !== 'object') return;
    lastReceived = now();
    if (message.type === 'error') {
      if (message.fatal) fatal(message.message || 'Phiên chơi đã hết hạn. Hãy vào lại phòng.');
      return;
    }
    if (message.type === 'ready') {
      if (message.id !== session.id || ready) return;
      ready = true;
      failures = 0;
      snapshotSequence = -1;
      lastPing = -Infinity;
      pendingPing = null;
      for (const hit of pending.values()) hit.sentAt = -Infinity;
      callbacks.onStatus('connected');
      if (Number.isFinite(message.serverTime)) callbacks.onServerTime?.(message.serverTime);
      callbacks.onReady?.({ mode: message.mode, slot: message.slot, serverTime: message.serverTime, reconnect: readies++ > 0 });
      return;
    }
    if (!ready) return;
    if (typeof message.type === 'string' && message.type.charCodeAt(0) === 122 /* z */) {
      callbacks.onZombie?.(message as ZombieServerMessage);
      return;
    }
    if (message.type === 'snapshot') {
      if (!Number.isSafeInteger(message.seq) || message.seq <= snapshotSequence ||
          !Number.isFinite(message.serverTime) || !Array.isArray(message.peers) || message.peers.length > 8) return;
      snapshotSequence = message.seq;
      callbacks.onServerTime?.(message.serverTime);
      callbacks.onPeers(message.peers, message.serverTime);
    } else if (message.type === 'pong') {
      if (Number.isFinite(message.serverTime)) callbacks.onServerTime?.(message.serverTime);
      if (message.sentAt === pendingPing) {
        lastRtt = Math.round(Math.max(0, now() - message.sentAt));
        callbacks.onLatency(lastRtt);
        pendingPing = null;
      }
    } else if (message.type === 'hitAck') {
      pending.delete(message.id);
    } else if (message.type === 'hit') {
      const hit = message.hit;
      if (typeof message.id !== 'string' || message.id.length > 128 || !hit ||
          typeof hit.attacker !== 'string' || typeof hit.name !== 'string' ||
          ![hit.damage, hit.dx, hit.dz].every(Number.isFinite)) return;
      if (!received.has(message.id)) {
        if (received.size >= 4096) received.delete(received.keys().next().value!);
        received.set(message.id, now());
        callbacks.onHits([hit]);
      }
      // A duplicate can mean the previous acknowledgement was lost.
      send({ type: 'hitAck', id: message.id });
    }
  }

  function open() {
    if (disposed) return;
    ready = false;
    lastReceived = now();
    try {
      const next = createSocket(url.href);
      socket = next;
      next.onopen = () => {
        if (socket === next && !disposed) send({ type: 'auth', id: session.id, token: session.token });
      };
      next.onmessage = event => { if (socket === next && !disposed) onMessage(event.data); };
      next.onclose = event => {
        if (socket !== next || disposed) return;
        callbacks.onClose?.(event.code);
        if (FATAL_CLOSE_CODES.has(event.code) && !(event.code === 4403 && event.reason === RATE_REASON)) {
          fatal(event.code === 4001 ? 'Phiên chơi đã được mở ở kết nối khác.' : 'Phiên chơi không còn khả dụng. Hãy vào lại phòng.');
        } else reconnect();
      };
      next.onerror = () => { if (socket === next && !disposed) reconnect(); };
    } catch { reconnect(); }
  }

  const tick = setInterval(() => {
    if (disposed) return;
    const time = now();
    hitBudget = Math.min(8, hitBudget + Math.max(0, time - budgetTime) * 0.02);
    budgetTime = time;
    for (const [id, hit] of pending) if (time - hit.createdAt >= HIT_TTL_MS) pending.delete(id);
    for (const [id, timeReceived] of received) if (time - timeReceived >= HIT_TTL_MS * 2) received.delete(id);
    // Keep the queue bounded even while offline and expire old actions instead of replaying them much later.
    for (const hit of callbacks.takeHits()) {
      if (pending.size >= MAX_PENDING_HITS) break;
      pending.set(makeId(), { hit, createdAt: time, sentAt: -Infinity });
    }
    if (socket && time - lastReceived >= CONNECTION_TIMEOUT_MS) { reconnect(); return; }
    if (!ready) return;
    const state = callbacks.getState();
    // Skip obsolete transforms under backpressure; the next tick sends the newest state.
    if (state) send({ type: 'state', seq: ++sequence, state });
    for (const [id, hit] of pending) {
      if (hitBudget < 1) break;
      if (time - hit.sentAt >= RETRY_HIT_MS && send({ type: 'hit', id, hit: hit.hit })) {
        hit.sentAt = time;
        hitBudget--;
      }
    }
    if (callbacks.takeZombie && socket && socket.bufferedAmount < ZOMBIE_BUFFER_BYTES) {
      // After `state`, in the same tick; zombie-net already split every frame by bytes (the room closes > 4096 with 1009).
      for (const message of callbacks.takeZombie(ZOMBIE_BUFFER_BYTES - socket.bufferedAmount)) {
        const text = JSON.stringify(message);
        if ((utf8 ? utf8.encode(text).byteLength : text.length) > MAX_FRAME_BYTES) continue;
        sendText(text);
      }
    }
    if (time - lastPing >= HEARTBEAT_MS) ping(time);
  }, SYNC_INTERVAL_MS);

  callbacks.onStatus('reconnecting');
  open();
  return { dispose };
}
