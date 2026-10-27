/**
 * The big vehicles that stand at the districts' curbs all day: coaches in the coach bays of Bến xe Miền Đông's lane
 * (ĐƯỜNG BẾN XE: its car-sized bays hold coaches, not private cars) and container trucks in the loading bays along
 * the port's Đại lộ Nguyễn Tất Thành. One list that the renderer (district-render.ts draws them), the wiring
 * (world-map.ts makes them solid) and parking.ts (which leaves those bays to them) all read. Pure data and maths.
 */
import type { RoadGraph } from './roads.ts';

/** The coach lane through the old Bến xe Miền Đông (binh-thanh.ts 'ben-xe') and the port boulevard (quan-4.ts 'nguyen-tat-thanh'). */
export const COACH_ROAD = 'ĐƯỜNG BẾN XE', TRUCK_ROAD = 'ĐẠI LỘ NGUYỄN TẤT THÀNH';
/** A parked coach or truck: centre, heading (its nose along (sin yaw, cos yaw)), length and width, a seed for its livery. */
export type CurbBody = { kind: 'coach' | 'truck'; x: number; z: number; yaw: number; len: number; width: number; seed: number };
const SIZE = { coach: { len: 12, width: 2.45, step: 13.5 }, truck: { len: 16.5, width: 2.45, step: 19 } } as const;
const hash01 = (k: number) => { let h = Math.imul(k ^ 0x27d4eb2d, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca77); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

/** Every coach and truck standing in its bays on the live roads (the bays traffic already keeps out of). */
export function curbFleet(roads: RoadGraph): CurbBody[] {
  const out: CurbBody[] = [];
  for (const e of roads.edges) {
    const kind = e.name === COACH_ROAD ? 'coach' : e.name === TRUCK_ROAD ? 'truck' : null;
    if (!kind) continue;
    const S = SIZE[kind];
    for (const bay of e.bays) {
      if (kind === 'coach' ? bay.kind !== 'car' : bay.kind !== 'loading') continue;
      // Against the curb, inside the bay (its depth) as near as a 2.45 m body allows: clear of the lane beside it.
      const off = e.half - S.width / 2 - 0.05;
      for (let at = bay.s0 + S.len / 2 + 0.5, k = 0; at <= bay.s1 - S.len / 2 - 0.5 + 1e-6; at += S.step, k++) {
        const seed = Math.floor(hash01(e.id * 131 + bay.side * 17 + k) * 1e6);
        // Most of the port's bays have a truck in them; a coach bay is never empty by day.
        if (kind === 'truck' && seed % 10 < 3) continue;
        const p = roads.pointAt(e, at);
        out.push({ kind, x: p.x - p.hz * bay.side * off, z: p.z + p.hx * bay.side * off, yaw: Math.atan2(p.hx * bay.side, p.hz * bay.side), len: S.len, width: S.width, seed });
      }
    }
  }
  return out;
}
/** Whether a road edge's bays are left to the curb fleet (parking.ts puts no cars in them). */
export const curbFleetRoad = (name: string) => name === COACH_ROAD;
