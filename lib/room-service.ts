/** D1-backed room presence. Every stored player is authenticated by a private token. */
const ACTIVE_MS = 15_000;
const SESSION_MS = 30 * 60_000;
const MAX_PLAYERS = 8;
const MAX_BODY_BYTES = 4096;
const COLORS = ["#ffd15c", "#62dfc6", "#ff8d83", "#b6a0ff", "#72c8ff", "#ffad70", "#d4ec7e", "#f9a9de"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Payload = Record<string, unknown>;
type State = { x: number; z: number; angle: number; riding: boolean; speed: number; score: number };
type PlayerRow = Omit<State, "riding"> & { id: string; name: string; color: string; riding: number };

class ClientError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

async function readPayload(request: Request): Promise<Payload> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ClientError("Vui lòng gửi dữ liệu JSON.", 415);
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new ClientError("Dữ liệu gửi lên quá lớn.", 413);
  }
  if (!request.body) throw new ClientError("Dữ liệu phòng đang trống.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ClientError("Dữ liệu gửi lên quá lớn.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Payload;
  } catch { throw new ClientError("Dữ liệu JSON không hợp lệ."); }
}

function playerName(value: unknown): string {
  if (typeof value !== "string") throw new ClientError("Hãy nhập tên nhân vật.");
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!name || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(name)) {
    throw new ClientError("Tên nhân vật không hợp lệ.");
  }
  if ([...name].length > 18) throw new ClientError("Tên nhân vật tối đa 18 ký tự.");
  return name;
}

function roomCode(value: unknown): string {
  if (typeof value !== "string") throw new ClientError("Hãy nhập mã phòng gồm 6 ký tự.");
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new ClientError("Mã phòng gồm 6 chữ cái hoặc chữ số.");
  return code;
}

function numberIn(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ClientError("Trạng thái nhân vật không hợp lệ.");
  }
  return Math.min(max, Math.max(min, value));
}

function playerState(value: unknown): State {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ClientError("Thiếu trạng thái nhân vật.");
  }
  const state = value as Payload;
  if (typeof state.riding !== "boolean") throw new ClientError("Trạng thái phương tiện không hợp lệ.");
  const angle = numberIn(state.angle, -1_000_000, 1_000_000);
  return {
    x: numberIn(state.x, -85, 85),
    z: numberIn(state.z, -85, 85),
    angle: ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI,
    riding: state.riding,
    speed: numberIn(state.speed, -36, 36),
    score: Math.floor(numberIn(state.score, 0, 1_000_000)),
  };
}

function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newCode() {
  // 32-character alphabet gives an unbiased six-character cryptographic code.
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b & 31]).join("");
}

async function hashToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function credentials(body: Payload) {
  const room = roomCode(body.room);
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id) ||
      typeof body.token !== "string" || !/^[0-9a-f]{64}$/.test(body.token)) {
    throw new ClientError("Phiên chơi không hợp lệ. Hãy vào lại phòng.", 401);
  }
  return { room, id: body.id, tokenHash: await hashToken(body.token) };
}

function peerQuery(db: D1Database, room: string, id: string, now: number) {
  return db.prepare(`SELECT id, name, color, x, z, angle, riding, speed, score
    FROM players WHERE room = ? AND id <> ? AND last_seen >= ?
    ORDER BY joined_at, id LIMIT 8`).bind(room, id, now - ACTIVE_MS);
}

function peers(rows: unknown[]) {
  return (rows as PlayerRow[]).map((player) => ({ ...player, riding: Boolean(player.riding) }));
}

async function cleanExpired(db: D1Database, now: number) {
  // Bounded maintenance avoids a large delete transaction on a busy room request.
  await db.batch([
    db.prepare(`DELETE FROM players WHERE id IN
      (SELECT id FROM players WHERE last_seen < ? ORDER BY last_seen LIMIT 128)`).bind(now - SESSION_MS),
    db.prepare(`DELETE FROM rooms WHERE code IN
      (SELECT code FROM rooms WHERE last_activity < ?
       AND NOT EXISTS (SELECT 1 FROM players WHERE players.room = rooms.code)
       ORDER BY last_activity LIMIT 128)`).bind(now - SESSION_MS),
  ]);
}

async function enterRoom(db: D1Database, body: Payload, now: number) {
  const name = playerName(body.name);
  const creating = body.action === "create";
  let room = creating ? newCode() : roomCode(body.code);
  const id = crypto.randomUUID();
  const token = randomHex();
  const tokenHash = await hashToken(token);
  const color = COLORS[crypto.getRandomValues(new Uint8Array(1))[0] % COLORS.length];

  if (creating) {
    await cleanExpired(db, now);
    let created = false;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      room = newCode();
      const result = await db.prepare(`INSERT OR IGNORE INTO rooms (code, created_at, last_activity)
        VALUES (?, ?, ?)`).bind(room, now, now).run();
      created = result.meta.changes > 0;
    }
    if (!created) throw new ClientError("Chưa tạo được mã phòng. Vui lòng thử lại.", 503);
  }

  // The INSERT and its capacity check are one SQLite statement, so simultaneous joins are safe.
  const inserted = await db.prepare(`INSERT INTO players
    (id, room, token_hash, name, color, joined_at, last_seen)
    SELECT ?, code, ?, ?, ?, ?, ? FROM rooms
    WHERE code = ? AND last_activity >= ?
    AND (SELECT COUNT(*) FROM players WHERE room = ? AND last_seen >= ?) < ?`)
    .bind(id, tokenHash, name, color, now, now, room, now - SESSION_MS, room, now - ACTIVE_MS, MAX_PLAYERS).run();

  if (!inserted.meta.changes) {
    const exists = await db.prepare("SELECT code FROM rooms WHERE code = ? AND last_activity >= ?")
      .bind(room, now - SESSION_MS).first();
    if (!exists) throw new ClientError("Không tìm thấy phòng hoặc phòng đã hết hạn.", 404);
    throw new ClientError("Phòng đã đủ 8 người. Hãy thử một phòng khác.", 409);
  }

  const results = await db.batch([
    db.prepare("UPDATE rooms SET last_activity = ? WHERE code = ?").bind(now, room),
    peerQuery(db, room, id, now),
  ]);
  return reply({ room, id, token, color, peers: peers(results[1].results), serverTime: now }, creating ? 201 : 200);
}

async function syncRoom(db: D1Database, body: Payload, now: number) {
  const { room, id, tokenHash } = await credentials(body);
  const state = playerState(body.state);
  // An inactive player may reclaim a slot only if room capacity is still available.
  const updated = await db.prepare(`UPDATE players SET x = ?, z = ?, angle = ?, riding = ?, speed = ?, score = ?, last_seen = ?
    WHERE id = ? AND room = ? AND token_hash = ? AND last_seen >= ?
    AND (last_seen >= ? OR
      (SELECT COUNT(*) FROM players AS active WHERE active.room = ? AND active.id <> ? AND active.last_seen >= ?) < ?)`)
    .bind(state.x, state.z, state.angle, Number(state.riding), state.speed, state.score, now,
      id, room, tokenHash, now - SESSION_MS, now - ACTIVE_MS, room, id, now - ACTIVE_MS, MAX_PLAYERS).run();
  if (!updated.meta.changes) {
    const valid = await db.prepare("SELECT id FROM players WHERE id = ? AND room = ? AND token_hash = ? AND last_seen >= ?")
      .bind(id, room, tokenHash, now - SESSION_MS).first();
    if (valid) throw new ClientError("Phòng đã đủ 8 người trong lúc bạn mất kết nối.", 409);
    throw new ClientError("Phiên chơi đã hết hạn. Hãy vào lại phòng.", 401);
  }
  const results = await db.batch([
    db.prepare("UPDATE rooms SET last_activity = ? WHERE code = ?").bind(now, room),
    peerQuery(db, room, id, now),
  ]);
  return reply({ peers: peers(results[1].results), serverTime: now });
}

export async function handleRoom(request: Request, db?: D1Database): Promise<Response> {
  try {
    const body = await readPayload(request);
    if (typeof body.action !== "string" || !["create", "join", "sync", "leave"].includes(body.action)) {
      throw new ClientError("Thao tác phòng không hợp lệ.");
    }
    if (!db) throw new ClientError("Máy chủ nhiều người chơi chưa sẵn sàng. Bạn vẫn có thể khám phá một mình.", 503);
    const now = Date.now();
    if (body.action === "create" || body.action === "join") return await enterRoom(db, body, now);
    if (body.action === "sync") return await syncRoom(db, body, now);
    const { room, id, tokenHash } = await credentials(body);
    // Leaving is idempotent, but no caller can delete another player's session.
    await db.prepare("DELETE FROM players WHERE id = ? AND room = ? AND token_hash = ?")
      .bind(id, room, tokenHash).run();
    return reply({ ok: true, serverTime: now });
  } catch (error) {
    if (error instanceof ClientError) return reply({ error: error.message }, error.status);
    console.error("Room service failed:", error instanceof Error ? error.message : "Unknown D1 error");
    return reply({ error: "Máy chủ đang bận. Vui lòng thử lại sau ít giây." }, 503);
  }
}
