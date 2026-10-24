/** Shared wire contract. Session secrets travel only in the first socket message. */
export const SYNC_INTERVAL_MS = 50;
export const HIT_TTL_MS = 10_000;
export const MAX_PENDING_HITS = 128;

export type Session = { room: string; id: string; token: string };
export type PlayerState = {
  x: number; z: number; angle: number; riding: boolean; speed: number; score: number;
  health?: number; weapon?: 'fists' | 'pistol' | 'shotgun' | 'smg' | 'grenade' | 'rpg';
  vehicle?: 'foot' | 'scooter' | 'car' | 'police' | 'boat' | 'swim';
  down?: boolean; firing?: boolean; wanted?: number;
};
export type PeerState = PlayerState & {
  id: string; name: string; color: string;
  updatedAt?: number; vx?: number; vz?: number;
};
export type OutgoingHit = { target: string; damage: number; dx: number; dz: number };
export type IncomingHit = { attacker: string; name: string; damage: number; dx: number; dz: number };

export type ClientMessage =
  | { type: 'auth'; id: string; token: string }
  | { type: 'state'; seq: number; state: PlayerState }
  | { type: 'hit'; id: string; hit: OutgoingHit }
  | { type: 'hitAck'; id: string }
  | { type: 'ping'; sentAt: number };

export type ServerMessage =
  | { type: 'ready'; id: string; serverTime: number }
  | { type: 'snapshot'; seq: number; serverTime: number; peers: PeerState[] }
  | { type: 'hit'; id: string; hit: IncomingHit }
  | { type: 'hitAck'; id: string }
  | { type: 'pong'; sentAt: number; serverTime: number }
  | { type: 'error'; message: string; fatal: boolean };
