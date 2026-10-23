import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  createdAt: integer("created_at").notNull(),
  lastActivity: integer("last_activity").notNull(),
}, (table) => [index("rooms_activity_idx").on(table.lastActivity)]);

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  room: text("room").notNull().references(() => rooms.code, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  x: real("x").notNull().default(0),
  z: real("z").notNull().default(0),
  angle: real("angle").notNull().default(0),
  riding: integer("riding", { mode: "boolean" }).notNull().default(false),
  speed: real("speed").notNull().default(0),
  score: integer("score").notNull().default(0),
  joinedAt: integer("joined_at").notNull(),
  lastSeen: integer("last_seen").notNull(),
  // Combat state is client-reported; SQL defaults keep the migration additive for existing rows.
  health: integer("health").notNull().default(100),
  weapon: text("weapon", { enum: ["fists", "pistol", "shotgun", "smg"] }).notNull().default("fists"),
  vehicle: text("vehicle", { enum: ["foot", "scooter", "car", "police"] }).notNull().default("foot"),
  down: integer("down", { mode: "boolean" }).notNull().default(false),
  firing: integer("firing", { mode: "boolean" }).notNull().default(false),
  wanted: integer("wanted").notNull().default(0),
}, (table) => [
  index("players_room_seen_idx").on(table.room, table.lastSeen),
  index("players_seen_idx").on(table.lastSeen),
]);

// Short-lived relay of damage one player dealt to another; consumed on the target's next sync.
export const hits = sqliteTable("hits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  room: text("room").notNull(),
  target: text("target").notNull().references(() => players.id, { onDelete: "cascade" }),
  attacker: text("attacker").notNull(),
  damage: integer("damage").notNull(),
  dx: real("dx").notNull(),
  dz: real("dz").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("hits_target_idx").on(table.target),
  index("hits_created_idx").on(table.createdAt),
]);
