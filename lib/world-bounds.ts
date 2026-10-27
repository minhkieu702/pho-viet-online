/**
 * The world's extent and layout version, shared by the game client (terrain bounds) and the server (peer
 * validation, room joins). Pure constants with no imports, safe in the Worker and the SSR bundle.
 *
 * The live map grows by wiring the P1 slices one at a time (WIRING-PLAN §3, steps 14–18: Quận 4, Bình Thạnh, Quận 3,
 * Quận 1 south, Thủ Thiêm). Everything here is a function of how many are wired: WIRED_SLICES is the one constant the
 * integrator steps (app/game/map/world-map-start.ts P1_WIRED must equal it); the bounds and WORLD_VERSION follow.
 * These boxes are the network sanity bounds only: the player is clamped to the land (app/game/map/terrain.ts).
 */
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** How many P1 slices the live map wires (0: today's map; 1 step 14 … 5 step 18). */
export const WIRED_SLICES = 5;
/** The most there are (p1.ts P1_LAYOUTS). */
export const P1_SLICE_COUNT = 5;

/**
 * Per wired count: what a player can reach (WORLD) and the peer positions the server accepts (PEER, the world with at
 * least 2 m of slack on every side).
 * 0 today (city.ts PLAY): An Hòa and downtown inside the fences, and the river to the far wall.
 * 1 step 14, Quận 4 and the Bến Nghé strip: east to the bend's quay (x 700), south to Kênh Tẻ (z 445).
 * 2 step 15, Bình Thạnh east: west to Nơ Trang Long's hoarding (x -720).
 * 3 step 16 Quận 3 and 4 step 17 Quận 1 south: inside that box already.
 * 5 step 18, the Thủ Thiêm strip: north to Tố Hữu's hoarding (z -440).
 */
const STEPS: readonly { world: Bounds; peer: Bounds }[] = [
  { world: { minX: -138, maxX: 352, minZ: -203.6, maxZ: 137.5 }, peer: { minX: -140, maxX: 355, minZ: -206, maxZ: 140 } },
  { world: { minX: -138, maxX: 700, minZ: -203.6, maxZ: 445 }, peer: { minX: -140, maxX: 703, minZ: -206, maxZ: 448 } },
  { world: { minX: -720, maxX: 700, minZ: -203.6, maxZ: 445 }, peer: { minX: -723, maxX: 703, minZ: -206, maxZ: 448 } },
  { world: { minX: -720, maxX: 700, minZ: -203.6, maxZ: 445 }, peer: { minX: -723, maxX: 703, minZ: -206, maxZ: 448 } },
  { world: { minX: -720, maxX: 700, minZ: -203.6, maxZ: 445 }, peer: { minX: -723, maxX: 703, minZ: -206, maxZ: 448 } },
  { world: { minX: -720, maxX: 700, minZ: -440, maxZ: 445 }, peer: { minX: -723, maxX: 703, minZ: -443, maxZ: 448 } },
];
const step = (wired: number) => STEPS[Math.max(0, Math.min(STEPS.length - 1, Math.floor(wired)))];
/** The world box with `wired` P1 slices live. */
export const worldBoundsFor = (wired: number): Bounds => ({ ...step(wired).world });
/** The peer box the server accepts with `wired` P1 slices live. */
export const peerBoundsFor = (wired: number): Bounds => ({ ...step(wired).peer });
/** The layout version with `wired` P1 slices live: today's map is 1, each wiring step adds one (step 14 is 2 … step 18 is 6). */
export const worldVersionFor = (wired: number) => 1 + Math.max(0, Math.min(P1_SLICE_COUNT, Math.floor(wired)));

/** Everything a player can reach with WIRED_SLICES live. */
export const WORLD_BOUNDS: Bounds = worldBoundsFor(WIRED_SLICES);
/** Peer positions the server accepts: the world bounds with at least 2 m of slack on every side. */
export const PEER_BOUNDS: Bounds = peerBoundsFor(WIRED_SLICES);
/**
 * The layout clients build. It changes with any change two players must agree on (new land, moved roads or
 * buildings): here, every wiring step. Clients send it when they create or join a room, so a room never mixes layouts.
 */
export const WORLD_VERSION = worldVersionFor(WIRED_SLICES);
