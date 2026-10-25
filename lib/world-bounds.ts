/**
 * The world's extent and layout version, shared by the game client (terrain bounds) and the server (peer
 * validation, room joins). Pure constants with no imports, safe in the Worker and the SSR bundle.
 */
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Everything a player can reach today (city.ts PLAY): An Hòa and downtown inside the fences, and the river to the far wall. */
export const WORLD_BOUNDS: Bounds = { minX: -138, maxX: 352, minZ: -203.6, maxZ: 137.5 };
/** Peer positions the server accepts: the world bounds with at least 2 m of slack on every side. */
export const PEER_BOUNDS: Bounds = { minX: -140, maxX: 355, minZ: -206, maxZ: 140 };
/**
 * The layout clients build. Bump it with any change two players must agree on (new land, moved roads or
 * buildings); clients send it when they create or join a room, so a room never mixes layouts.
 */
export const WORLD_VERSION = 1;
