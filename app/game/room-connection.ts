import {
  HIT_TTL_MS, MAX_PENDING_HITS, SYNC_INTERVAL_MS,
  type ClientMessage, type IncomingHit, type OutgoingHit, type PeerState,
  type PlayerState, type ServerMessage, type Session,
} from '../../lib/multiplayer-protocol.ts';

const MAX_BUFFERED_BYTES = 32 * 1024;
const RETRY_HIT_MS = 750;
const HEARTBEAT_MS = 2000;
const CONNECTION_TIMEOUT_MS = 10_000;
const FATAL_CLOSE_CODES = new Set([4001, 4401, 4403, 4404, 4409]);

// A narrow socket interface also lets tests exercise reconnects without a server.
export interface RoomSocket {
  readyState: number;
  bufferedAmount: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
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

  function send(message: ClientMessage) {
    if (!socket || socket.readyState !== 1 || socket.bufferedAmount > MAX_BUFFERED_BYTES) return false;
    try { socket.send(JSON.stringify(message)); return true; } catch { return false; }
  }

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
      return;
    }
    if (!ready) return;
    if (message.type === 'snapshot') {
      if (!Number.isSafeInteger(message.seq) || message.seq <= snapshotSequence ||
          !Number.isFinite(message.serverTime) || !Array.isArray(message.peers) || message.peers.length > 8) return;
      snapshotSequence = message.seq;
      callbacks.onPeers(message.peers, message.serverTime);
    } else if (message.type === 'pong') {
      if (message.sentAt === pendingPing) {
        callbacks.onLatency(Math.round(Math.max(0, now() - message.sentAt)));
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
        if (FATAL_CLOSE_CODES.has(event.code)) {
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
    if (time - lastPing >= HEARTBEAT_MS && send({ type: 'ping', sentAt: time })) {
      lastPing = time;
      pendingPing = time;
    }
  }, SYNC_INTERVAL_MS);

  callbacks.onStatus('reconnecting');
  open();
  return { dispose };
}
