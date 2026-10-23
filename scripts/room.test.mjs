// Run after `db:generate` with:
// node --experimental-transform-types --experimental-sqlite --test scripts/room.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleRoom } from "../lib/room-service.ts";

const migrationFolder = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(migrationFolder).filter((file) => file.endsWith(".sql")).sort();
assert.ok(migrations.length, "Generate the actual Drizzle migration before testing.");

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) sqlite.exec(readFileSync(`${migrationFolder}/${migration}`, "utf8"));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      const bound = {
        bind(...args) { values = args; return bound; },
        _execute() {
          if (/^\s*SELECT\b/i.test(sql)) {
            return { results: statement.all(...values), success: true, meta: { changes: 0 } };
          }
          const result = statement.run(...values);
          return { results: [], success: true, meta: { changes: Number(result.changes) } };
        },
        async run() { return bound._execute(); },
        async first() { return statement.get(...values) ?? null; },
      };
      return bound;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((statement) => statement._execute());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return { db, sqlite };
}

function request(body, headers = {}) {
  return new Request("https://example.test/api/room", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(db, body) {
  const response = await handleRoom(request(body), db);
  return { status: response.status, headers: response.headers, body: await response.json() };
}

const state = { x: 3, z: 5, angle: 0.2, riding: true, speed: 12, score: 75 };
const credentials = ({ room, id, token }) => ({ room, id, token });

test("create, join and synchronize real persisted peers without exposing private tokens", async (t) => {
  const { db, sqlite } = database();
  t.after(() => sqlite.close());
  const first = await call(db, { action: "create", name: "  Hùng  " });
  assert.equal(first.status, 201);
  assert.match(first.body.room, /^[A-Z0-9]{6}$/);
  assert.match(first.body.token, /^[0-9a-f]{64}$/);
  assert.deepEqual(first.body.peers, []);
  assert.match(first.headers.get("cache-control"), /no-store/);
  const row = sqlite.prepare("SELECT * FROM players WHERE id = ?").get(first.body.id);
  assert.equal(row.name, "Hùng");
  assert.notEqual(row.token_hash, first.body.token);
  assert.equal(row.token_hash.length, 64);

  const second = await call(db, { action: "join", name: "Lan", code: first.body.room.toLowerCase() });
  assert.equal(second.status, 200);
  assert.equal(second.body.peers.length, 1);
  assert.equal(second.body.peers[0].id, first.body.id);
  assert.equal(second.body.peers[0].token, undefined);
  assert.equal(second.body.peers[0].token_hash, undefined);

  assert.equal((await call(db, { action: "sync", ...credentials(second.body), state })).status, 200);
  const seen = await call(db, { action: "sync", ...credentials(first.body), state });
  assert.equal(seen.status, 200);
  const remote = seen.body.peers[0];
  assert.ok(Math.abs(remote.angle - state.angle) < 1e-10);
  assert.deepEqual({ ...remote, angle: state.angle }, { id: second.body.id, name: "Lan", color: second.body.color, ...state });
});

test("server rejects impersonation, malformed input, and oversize bodies; bounds submitted state", async (t) => {
  const { db, sqlite } = database();
  t.after(() => sqlite.close());
  const session = (await call(db, { action: "create", name: "Minh" })).body;
  const fake = { ...credentials(session), token: "0".repeat(64) };
  assert.equal((await call(db, { action: "sync", ...fake, state })).status, 401);
  await call(db, { action: "leave", ...fake });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM players").get().n, 1);

  const bounded = { ...state, x: 10000, z: -10000, speed: 999, score: 9999999 };
  assert.equal((await call(db, { action: "sync", ...credentials(session), state: bounded })).status, 200);
  const stored = sqlite.prepare("SELECT x, z, speed, score FROM players").get();
  assert.deepEqual({ ...stored }, { x: 85, z: -85, speed: 36, score: 1000000 });
  assert.equal((await call(db, { action: "sync", ...credentials(session), state: { ...state, x: "bad" } })).status, 400);
  assert.equal((await call(db, { action: "sync", ...credentials(session), state: { ...state, riding: 1 } })).status, 400);
  assert.equal((await call(db, { action: "create", name: "x".repeat(19) })).status, 400);
  assert.equal((await call(db, { action: "join", name: "Minh", code: "BAD" })).status, 400);
  assert.equal((await call(db, { action: "join", name: "Minh", code: "ZZZZZZ" })).status, 404);
  assert.equal((await handleRoom(request("{broken"), db)).status, 400);
  assert.equal((await handleRoom(request("[]"), db)).status, 400);
  assert.equal((await handleRoom(request(" ".repeat(4097)), db)).status, 413);
  assert.equal((await handleRoom(request({}, { "content-type": "text/plain" }), db)).status, 415);
  assert.equal((await call(undefined, { action: "create", name: "Minh" })).status, 503);

  assert.equal((await call(db, { action: "leave", ...credentials(session) })).status, 200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM players").get().n, 0);
});

test("eight-player cap remains valid when an inactive player tries to reclaim a replaced slot", async (t) => {
  const { db, sqlite } = database();
  t.after(() => sqlite.close());
  const host = (await call(db, { action: "create", name: "Chủ phòng" })).body;
  for (let i = 0; i < 7; i++) {
    assert.equal((await call(db, { action: "join", name: `Bạn ${i}`, code: host.room })).status, 200);
  }
  assert.equal((await call(db, { action: "join", name: "Người thứ chín", code: host.room })).status, 409);
  sqlite.prepare("UPDATE players SET last_seen = ? WHERE id = ?").run(Date.now() - 16000, host.id);
  const replacement = await call(db, { action: "join", name: "Người mới", code: host.room });
  assert.equal(replacement.status, 200);
  assert.equal(replacement.body.peers.length, 7);
  assert.equal(replacement.body.peers.some((peer) => peer.id === host.id), false);
  assert.equal((await call(db, { action: "sync", ...credentials(host), state })).status, 409);
  await call(db, { action: "leave", ...credentials(replacement.body) });
  assert.equal((await call(db, { action: "sync", ...credentials(host), state })).status, 200);
});

test("expired sessions cannot resume; creating a room cleans abandoned data", async (t) => {
  const { db, sqlite } = database();
  t.after(() => sqlite.close());
  const host = (await call(db, { action: "create", name: "Phiên cũ" })).body;
  const expired = Date.now() - 31 * 60000;
  sqlite.prepare("UPDATE players SET last_seen = ?").run(expired);
  sqlite.prepare("UPDATE rooms SET last_activity = ?").run(expired);
  assert.equal((await call(db, { action: "sync", ...credentials(host), state })).status, 401);
  assert.equal((await call(db, { action: "join", name: "Lan", code: host.room })).status, 404);
  assert.equal((await call(db, { action: "create", name: "Phòng mới" })).status, 201);
  assert.equal(sqlite.prepare("SELECT code FROM rooms WHERE code = ?").get(host.room), undefined);
  assert.equal(sqlite.prepare("SELECT id FROM players WHERE id = ?").get(host.id), undefined);
});
