/**
 * What zombie mode asks of the world (design.md §2.4, §3.3, A17, A25), built over game.ts' collision indexes, terrain
 * and the live road graph (today's LEGACY_ROADS, main's worldRoads() once it lands: pass `roads()`): fair spawn
 * spots (never close, never popping up in view), who sees what (the stalker), roof edges and alley mouths for
 * ambushes, and the giant mutants' movement world (MutantWorld): building footprints and terrain only, line casts,
 * roofs and walls to climb, smashable cars and wrecks, and an A* over the road nodes in both directions that skips
 * closed roads and roads too narrow for the mutant (never roads.route(), a one-way car router). MODE owns it.
 */
import * as THREE from 'three';
import type { CollisionIndex } from './map/collision';
import type { RoadGraph, RoadEdge } from './map/roads';
import { inViewCone, type SpawnHow } from './zombie-director.ts';
import { createMutantRouter, type MutantWorld } from './mutants';
import type { ZombieKind } from '../../lib/zombie-protocol.ts';

export type { MutantWorld } from './mutants';
export type WorldPlayer = { x: number; z: number; camYaw: number; up: boolean; local: boolean };
export type ZombieWorldDeps = {
  /** Walkable and free of solids. */
  clear(x: number, z: number, r: number): boolean;
  sight(x1: number, z1: number, x2: number, z2: number): boolean;
  ground(x: number, z: number): number;
  /** Terrain only: land a body of radius r can stand on (no deep water). */
  walkable(x: number, z: number, r: number): boolean;
  roofs: CollisionIndex;
  roads(): RoadGraph;
  /** This client's camera frustum (updated each frame by the caller). */
  frustum: THREE.Frustum;
  /** Smashable things near a point: fleet/parked cars and ruin wrecks (game.ts and apocalypse.ts). */
  smashables?(x: number, z: number, r: number, cb: (kind: 'car' | 'ruin', id: number, x: number, z: number) => void): void;
};

const v = new THREE.Vector3();
type Rect = { minX: number; minZ: number; maxX: number; maxZ: number };
type Box = { cx: number; cz: number; hx: number; hz: number; yaw: number };
/** A roof index entry's footprint: today's plots carry `full` (a rect), the wired districts' a `box` (oriented). */
function footprint(ref: unknown): { rect: Rect | null; box: Box | null } {
  const r = ref as { full?: Rect; box?: Box } | null;
  if (r?.full) return { rect: r.full, box: null };
  if (r?.box) return { rect: null, box: r.box };
  return { rect: null, box: null };
}

export function createZombieWorld(deps: ZombieWorldDeps) {
  let players: WorldPlayer[] = [];
  const ids: number[] = [];

  /** This client's camera sees (x, y, z) and its player has a line of sight to it (A25). */
  function seenLocal(x: number, z: number, y: number) {
    const me = players.find((p) => p.local);
    if (!deps.frustum.containsPoint(v.set(x, y, z))) return false;
    if (!me) return true;
    const d = Math.hypot(x - me.x, z - me.z);
    return d < 70 && (d < 2 || deps.sight(me.x, me.z, x, z));
  }
  /** Some standing player sees it: this client by its frustum, the others by their camera yaw (PlayerState.cam). */
  function seen(x: number, z: number, y: number) {
    for (const p of players) {
      if (!p.up) continue;
      if (p.local ? seenLocal(x, z, y) : inViewCone(p.x, p.z, p.camYaw, x, z) && deps.sight(p.x, p.z, x, z)) return true;
    }
    return false;
  }
  function seenByAny(x: number, z: number, y: number, range: number) {
    for (const p of players) {
      if (!p.up) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > range) continue;
      if (p.local ? seenLocal(x, z, y) : inViewCone(p.x, p.z, p.camYaw, x, z) && deps.sight(p.x, p.z, x, z)) return true;
    }
    return false;
  }
  /** §2.4: ≥ 12 m from every player (a roof drop ≥ 10 m), never in view closer than 18 m (rising is its own tell); a stalker only out of view. */
  function spawnOk(x: number, z: number, how: SpawnHow, kind: ZombieKind) {
    if (!deps.walkable(x, z, 0.4)) return false;
    const min = how === 'drop' ? 10 : 12;
    for (const p of players) if (Math.hypot(x - p.x, z - p.z) < min) return false;
    if (kind === 'stalker') return !seen(x, z, deps.ground(x, z) + 1.5);
    if (how !== 'rise' && seenByAny(x, z, deps.ground(x, z) + 1.2, 18)) return false;
    return true;
  }

  /** The highest roof over (x, z), or null on open ground. */
  function roofAt(x: number, z: number) {
    const n = deps.roofs.containing(x, z, 0, ids);
    let top: number | null = null;
    for (let i = 0; i < n; i++) { const t = deps.roofs.top(ids[i]); if (Number.isFinite(t) && (top === null || t > top)) top = t; }
    return top;
  }
  /** The nearest building wall within r: the closest point on its footprint, the outward normal there, the roof height. */
  function wallNear(x: number, z: number, r: number) {
    const n = deps.roofs.query(x - r, z - r, x + r, z + r, ids);
    let best: { x: number; z: number; nx: number; nz: number; top: number } | null = null, bd = r;
    for (let i = 0; i < n; i++) {
      const { rect, box } = footprint(deps.roofs.ref(ids[i]));
      const top = deps.roofs.top(ids[i]);
      let px = 0, pz = 0, nx = 0, nz = 0;
      if (rect) {
        const cx = Math.max(rect.minX, Math.min(rect.maxX, x)), cz = Math.max(rect.minZ, Math.min(rect.maxZ, z));
        const inside = cx === x && cz === z;
        if (inside) {
          // Inside: the nearest side.
          const dl = x - rect.minX, dr = rect.maxX - x, dt = z - rect.minZ, db = rect.maxZ - z, m = Math.min(dl, dr, dt, db);
          if (m === dl) { px = rect.minX; pz = z; nx = -1; } else if (m === dr) { px = rect.maxX; pz = z; nx = 1; } else if (m === dt) { px = x; pz = rect.minZ; nz = -1; } else { px = x; pz = rect.maxZ; nz = 1; }
        } else { px = cx; pz = cz; const l = Math.hypot(x - cx, z - cz) || 1; nx = (x - cx) / l; nz = (z - cz) / l; }
      } else if (box) {
        const c = Math.cos(box.yaw), s = Math.sin(box.yaw), dx = x - box.cx, dz = z - box.cz;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const qx = Math.max(-box.hx, Math.min(box.hx, lx)), qz = Math.max(-box.hz, Math.min(box.hz, lz));
        let ox = lx - qx, oz = lz - qz;
        if (ox === 0 && oz === 0) { if (box.hx - Math.abs(lx) < box.hz - Math.abs(lz)) ox = Math.sign(lx) || 1; else oz = Math.sign(lz) || 1; }
        const ol = Math.hypot(ox, oz) || 1;
        px = box.cx + qx * c + qz * s; pz = box.cz - qx * s + qz * c;
        nx = (ox * c + oz * s) / ol; nz = (-ox * s + oz * c) / ol;
      } else continue;
      const d = Math.hypot(px - x, pz - z);
      if (d <= bd) { bd = d; best = { x: px, z: pz, nx, nz, top: Number.isFinite(top) ? top : 6 }; }
    }
    return best;
  }

  /**
   * An ambush spot near (px, pz): for a roof drop, a facade 12-24 m away (the zombie stands on its roof edge, y =
   * the roof height up to 14 m, over the sidewalk it lands on); for an alley burst, a point on a hẻm or a narrow road
   * 14-30 m away that no player can see. Null when none was found (the caller falls back to the street spots).
   */
  function ambush(px: number, pz: number, how: 'drop' | 'alley') {
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = Math.random() * Math.PI * 2;
      if (how === 'drop') {
        const r = 12 + Math.random() * 12, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
        const wall = wallNear(x, z, 10);
        if (!wall || wall.top < 3.5) continue;
        const sx = wall.x + wall.nx * 0.9, sz = wall.z + wall.nz * 0.9;
        if (!deps.clear(sx, sz, 0.4) || Math.hypot(sx - px, sz - pz) < 10) continue;
        return { x: sx, z: sz, y: Math.min(14, wall.top) };
      }
      const roads = deps.roads();
      const near = roads.edgesNear(px, pz, 32, (e: RoadEdge) => !e.closed && (e.cls === 'hem' || e.half < 4.6));
      const list = near.length ? near : roads.edgesNear(px, pz, 32);
      if (!list.length) return null;
      const e = list[Math.floor(Math.random() * list.length)].edge;
      const p = roads.pointAt(e, Math.random() * e.len), side = e.walk > 0 ? (Math.random() < 0.5 ? -1 : 1) * e.walk : 0;
      const x = p.x - p.hz * side, z = p.z + p.hx * side, d = Math.hypot(x - px, z - pz);
      if (d < 14 || d > 34 || !deps.clear(x, z, 0.4) || seen(x, z, deps.ground(x, z) + 1.2)) continue;
      return { x, z, y: 0 };
    }
    return null;
  }

  // ---- the mutants' routes: mutants.ts' A* over the live road graph (both directions, fitting roads only) ----
  let graphFor: RoadGraph | null = null;
  let router: ReturnType<typeof createMutantRouter> | null = null;
  function route(fx: number, fz: number, tx: number, tz: number, radius = 1.6) {
    const g = deps.roads();
    if (g !== graphFor || !router) { graphFor = g; router = createMutantRouter(g); }
    return router.route(fx, fz, tx, tz, radius);
  }
  /** Terrain and building footprints only (never props, vehicles or wrecks: those are smashed). */
  function hard(x: number, z: number, r: number) {
    if (!deps.walkable(x, z, Math.min(r, 1))) return true;
    return !deps.roofs.clear(x, z, r);
  }
  const mutantWorld: MutantWorld = {
    ground: (x, z) => deps.ground(x, z),
    hard,
    castHard(x1, z1, x2, z2, r) {
      const d = Math.hypot(x2 - x1, z2 - z1);
      if (d < 0.01) return !hard(x2, z2, r);
      if (deps.roofs.cast(x1, z1, (x2 - x1) / d, (z2 - z1) / d, d) < d - 0.05) return false;
      for (let s = r; s < d; s += Math.max(1, r)) if (hard(x1 + ((x2 - x1) / d) * s, z1 + ((z2 - z1) / d) * s, r * 0.9)) return false;
      return true;
    },
    sight: (x1, z1, x2, z2) => deps.sight(x1, z1, x2, z2),
    roofAt,
    wallNear,
    route,
    smashables: (x, z, r, cb) => deps.smashables?.(x, z, r, cb),
    seenBy: (x, z, y) => seen(x, z, y),
  };

  return {
    /** Who is playing this frame (positions, camera yaw, standing), this client's own player marked local. */
    setPlayers(list: WorldPlayer[]) { players = list; },
    get players() { return players; },
    spawnOk, seen, seenLocal, ambush, roofAt, wallNear, route,
    mutantWorld,
  };
}
export type ZombieWorldApi = ReturnType<typeof createZombieWorld>;
