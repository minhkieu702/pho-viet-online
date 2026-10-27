/** Shared wire contract. Session secrets travel only in the first socket message. */
// ---- zombie co-op (design.md §5, NET) ----
import type { RoomMode, ZombieClientMessage, ZombiePlayerFields, ZombieServerMessage } from './zombie-protocol.ts';
// ---- end zombie co-op ----
export const SYNC_INTERVAL_MS = 50;
export const HIT_TTL_MS = 10_000;
export const MAX_PENDING_HITS = 128;

export type Session = { room: string; id: string; token: string };
/** POST /api/room bodies. `world` is the client's WORLD_VERSION (lib/world-bounds.ts); clients that predate it send none (version 1). */
export type RoomRequest =
  | { action: 'create'; name: string; world?: number; mode?: RoomMode; zv?: number; ff?: boolean }
  | { action: 'join'; name: string; code: string; world?: number; zv?: number }
  | ({ action: 'leave' } & Session);
export type PlayerState = {
  x: number; z: number; angle: number; riding: boolean; speed: number; score: number;
  health?: number; weapon?: 'fists' | 'pistol' | 'shotgun' | 'smg' | 'grenade' | 'rpg';
  vehicle?: 'foot' | 'scooter' | 'car' | 'police' | 'boat' | 'swim';
  down?: boolean; firing?: boolean; wanted?: number;
} & ZombiePlayerFields;
export type PeerState = PlayerState & {
  id: string; name: string; color: string;
  updatedAt?: number; vx?: number; vz?: number;
  /** The player's slot 0..7 (stable while its session is active; zombie records and events use it). */
  slot?: number;
};
/** The create/join response. `mode` is the room's, never the client's choice; `host`/`epoch` describe the zombie host (null/0 in city rooms). */
export type RoomJoined = {
  room: string; id: string; token: string; color: string; peers: PeerState[]; serverTime: number;
  mode: RoomMode; slot: number; ff: boolean; host: string | null; epoch: number;
};
export type OutgoingHit = { target: string; damage: number; dx: number; dz: number };
export type IncomingHit = { attacker: string; name: string; damage: number; dx: number; dz: number };

export type ClientMessage =
  | { type: 'auth'; id: string; token: string }
  | { type: 'state'; seq: number; state: PlayerState }
  | { type: 'hit'; id: string; hit: OutgoingHit }
  | { type: 'hitAck'; id: string }
  /** rtt: the last measured round trip (ms); vis: the tab is visible; fps: frames per second over the last 2 s (host election). */
  | { type: 'ping'; sentAt: number; rtt?: number; vis?: boolean; fps?: number }
  | ZombieClientMessage;

export type ServerMessage =
  | { type: 'ready'; id: string; serverTime: number; mode?: RoomMode; slot?: number }
  | { type: 'snapshot'; seq: number; serverTime: number; peers: PeerState[] }
  | { type: 'hit'; id: string; hit: IncomingHit }
  | { type: 'hitAck'; id: string }
  | { type: 'pong'; sentAt: number; serverTime: number }
  | { type: 'error'; message: string; fatal: boolean }
  | ZombieServerMessage;
