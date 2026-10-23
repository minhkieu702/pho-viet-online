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
}, (table) => [
  index("players_room_seen_idx").on(table.room, table.lastSeen),
  index("players_seen_idx").on(table.lastSeen),
]);
