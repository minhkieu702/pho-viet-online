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
const combatDefaults = { health: 100, weapon: "fists", vehicle: "foot", down: false, firing: false, wanted: 0 };
const credentials = ({ room, id, token }) => ({ room, id, token });
const sync = (db, session, extra = {}) => call(db, { action: "sync", ...credentials(session), state, ...extra });
const hit = (target, damage = 10, dx = 0, dz = 0) => ({ target, damage, dx, dz });
const hitCount = (sqlite) => sqlite.prepare("SELECT COUNT(*) AS n FROM hits").get().n;

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
  assert.deepEqual({ ...remote, angle: state.angle },
    { id: second.body.id, name: "Lan", color: second.body.color, ...state, ...combatDefaults, vehicle: "scooter" });
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

async function duel(db) {
  const attacker = (await call(db, { action: "create", name: "An" })).body;
  const target = (await call(db, { action: "join", name: "Bình", code: attacker.room })).body;
  return { attacker, target };
}

test("combat state round-trips, with defaults for old clients and bounds for bad values", async (t) => {
  const { db, sqlite } = database();
  t.after(() => sqlite.close());
  const { attacker, target } = await duel(db);
  assert.deepEqual({ ...target.peers[0], ...combatDefaults }, target.peers[0]);

  // Old clients omit every combat field; riding decides the default vehicle.
  await sync(db, target, { state: { ...state, riding: false } });
  let seen = (await sync(db, attacker)).body.peers[0];
  assert.deepEqual({ ...seen, ...combatDefaults }, seen);

  const combat = { health: 42.6, weapon: "smg", vehicle: "police", down: true, firing: true, wanted: 3 };
  assert.equal((await sync(db, target, { state: { ...state, ...combat } })).status, 200);
  seen = (await sync(db, attacker)).body.peers[0];
  assert.deepEqual({ health: seen.health, weapon: seen.weapon, vehicle: seen.vehicle, down: seen.down,
    firing: seen.firing, wanted: seen.wanted }, { ...combat, health: 43 });

  const invalid = { health: 500, weapon: "rocket", vehicle: "tank", down: "yes", firing: 1, wanted: 9 };
  assert.equal((await sync(db, target, { state: { ...state, ...invalid } })).status, 200);
  seen = (await sync(db, attacker)).body.peers[0];
  assert.deepEqual({ health: seen.health, weapon: seen.weapon, vehicle: seen.vehicle, down: seen.down,
    firing: seen.firing, wanted: seen.wanted }, { ...combatDefaults, health: 100, vehicle: "scooter", wanted: 5 });

  await sync(db, target, { state: { ...state, riding: false, health: -4, wanted: "3", vehicle: null } });
  const row = sqlite.prepare("SELECT health, weapon, vehicle, down, firing, wanted FROM players WHERE id = ?").get(target.id);
  assert.deepEqual({ ...row }, { health: 0, weapon: "fists", vehicle: "foot", down: 0, firing: 0, wanted: 0 });
});

test("a hit is delivered once to its target, oldest first, with the attacker's name", async (t) => {
  const { db, sqlite } = database();
  t.after(() => sqlite.close());
  const { attacker, target } = await duel(db);
  const sent = await sync(db, attacker, { hits: [hit(target.id, 25, 0.5, -2), hit(target.id, 7.4, -0.25, 0.75)] });
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.body.hits, []);
  assert.equal(hitCount(sqlite), 2);

  const received = await sync(db, target);
  assert.deepEqual(received.body.hits.map((row) => ({ ...row })), [
    { attacker: attacker.id, name: "An", damage: 25, dx: 0.5, dz: -1 },
    { attacker: attacker.id, name: "An", damage: 7, dx: -0.25, dz: 0.75 },
  ]);
  assert.deepEqual((await sync(db, target)).body.hits, []);
  assert.equal(hitCount(sqlite), 0);

  // A departed attacker becomes a stranger; a departed target takes its pending hits with it.
  await sync(db, attacker, { hits: [hit(target.id, 5)] });
  await call(db, { action: "leave", ...credentials(attacker) });
  assert.deepEqual((await sync(db, target)).body.hits.map((row) => ({ ...row })),
    [{ attacker: attacker.id, name: "Người lạ", damage: 5, dx: 0, dz: 0 }]);
  const third = (await call(db, { action: "join", name: "Cường", code: target.room })).body;
  await sync(db, third, { hits: [hit(target.id, 5)] });
  assert.equal(hitCount(sqlite), 1);
  await call(db, { action: "leave", ...credentials(target) });
  assert.equal(hitCount(sqlite), 0);
});

test("hits on self, other rooms, inactive or unknown players and malformed hits are ignored", async (t) => {
  const { db, sqlite } = database();
  t.after(() => sqlite.close());
  const { attacker, target } = await duel(db);
  const outsider = (await call(db, { action: "create", name: "Dũng" })).body;
  const idle = (await call(db, { action: "join", name: "Hoa", code: attacker.room })).body;
  sqlite.prepare("UPDATE players SET last_seen = ? WHERE id = ?").run(Date.now() - 16000, idle.id);

  const ignored = [hit(attacker.id), hit(outsider.id), hit(idle.id), hit(crypto.randomUUID())];
  assert.equal((await sync(db, attacker, { hits: ignored })).status, 200);
  for (const hits of ["nope", { target: target.id }, 42, null,
    [null, 5, "x", [target.id], { target: target.id }, { ...hit(target.id), damage: "10" },
      { ...hit(target.id), dx: null }, { ...hit(target.id), target: target.id.toUpperCase() }, hit(123)]]) {
    assert.equal((await sync(db, attacker, { hits })).status, 200);
  }
  assert.equal(hitCount(sqlite), 0);
  assert.deepEqual((await sync(db, outsider)).body.hits, []);
  assert.deepEqual((await sync(db, target)).body.hits, []);
});

test("hit damage is clamped, capped at 200 per sync, limited to 8 entries and 20 deliveries", async (t) => {
  const { db, sqlite } = database();
  t.after(() => sqlite.close());
  const { attacker, target } = await duel(db);
  const damages = async () => (await sync(db, target)).body.hits.map((row) => row.damage);

  await sync(db, attacker, { hits: [hit(target.id, -5, 9, -9), hit(target.id, 0.2), hit(target.id, 250)] });
  const clamped = (await sync(db, target)).body.hits;
  assert.deepEqual(clamped.map((row) => [row.damage, row.dx, row.dz]), [[1, 1, -1], [1, 0, 0], [100, 0, 0]]);

  await sync(db, attacker, { hits: [hit(target.id, 150), hit(target.id, 70), hit(target.id, 60), hit(target.id, 9)] });
  assert.deepEqual(await damages(), [100, 70, 30]);

  await sync(db, attacker, { hits: Array.from({ length: 12 }, () => hit(target.id, 3)) });
  assert.deepEqual(await damages(), Array(8).fill(3));

  for (let i = 0; i < 3; i++) await sync(db, attacker, { hits: Array.from({ length: 8 }, () => hit(target.id, 1)) });
  assert.equal((await damages()).length, 20);
  assert.equal((await damages()).length, 4);
  assert.equal(hitCount(sqlite), 0);

  // A full eight-hit sync from a newer client stays well inside the body limit.
  const longest = { ...state, x: -84.12345678901234, z: 84.12345678901234, angle: -3.141592653589793,
    speed: -35.98765432109876, score: 999999, health: 99, weapon: "shotgun", vehicle: "police",
    down: false, firing: true, wanted: 5 };
  const full = Array.from({ length: 8 }, () => hit(target.id, 25, -0.7071067811865476, 0.7071067811865476));
  const body = { action: "sync", ...credentials(attacker), state: longest, hits: full };
  assert.ok(JSON.stringify(body).length < 2048, `sync body is ${JSON.stringify(body).length} bytes`);
  assert.equal((await call(db, body)).status, 200);
  assert.deepEqual(await damages(), Array(8).fill(25));
});

test("stale hits expire after ten seconds and are cleaned up opportunistically", async (t) => {
  const { db, sqlite } = database();
  t.after(() => sqlite.close());
  const { attacker, target } = await duel(db);
  await sync(db, attacker, { hits: [hit(target.id, 11), hit(target.id, 12)] });
  sqlite.prepare("UPDATE hits SET created_at = ? WHERE damage = 11").run(Date.now() - 11000);
  assert.deepEqual((await sync(db, target)).body.hits.map((row) => row.damage), [12]);
  assert.equal(hitCount(sqlite), 0);

  await sync(db, target, { hits: [hit(attacker.id, 13)] });
  sqlite.prepare("UPDATE hits SET created_at = ?").run(Date.now() - 11000);
  await sync(db, target);
  assert.equal(hitCount(sqlite), 0);
});
