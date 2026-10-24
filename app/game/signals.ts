import { ROADS_X, ROADS_Z } from './city';

/**
 * Traffic lights at every junction. North-south traffic has the green first, then east-west, with an amber and
 * a short all-red between; each junction is offset in its cycle so the lights roll down a street like a green
 * wave. Pure functions of the clock, so traffic, pedestrians and the lamps on the poles always agree.
 */
export type Light = 'green' | 'yellow' | 'red';
/** 'x' is traffic moving east-west (along x), 'z' north-south. */
export type TravelAxis = 'x' | 'z';

const GREEN = 13, AMBER = 3, CLEAR = 1;
const HALF = GREEN + AMBER + CLEAR;
export const CYCLE = HALF * 2;
/** Traffic waits with its front bumper at this distance from the junction centre (before the zebra crossing). */
export const STOP_LINE = 11.2;

function phase(rx: number, rz: number, time: number) {
  const offset = ((rx - ROADS_X[0]) / 54) * 5.5 + ((rz - ROADS_Z[0]) / 54) * 3.5;
  return (((time + offset) % CYCLE) + CYCLE) % CYCLE;
}

/** The light facing traffic travelling along `axis` at the junction (rx, rz). */
export function lightFor(rx: number, rz: number, axis: TravelAxis, time: number): Light {
  const t = (phase(rx, rz, time) + (axis === 'z' ? 0 : HALF)) % CYCLE;
  return t < GREEN ? 'green' : t < GREEN + AMBER ? 'yellow' : 'red';
}

/** Seconds until the light for `axis` turns green (0 when it is green). */
export function greenIn(rx: number, rz: number, axis: TravelAxis, time: number) {
  const t = (phase(rx, rz, time) + (axis === 'z' ? 0 : HALF)) % CYCLE;
  return t < GREEN ? 0 : CYCLE - t;
}

/**
 * Whether someone may step onto the crosswalk from (ax, az) to (bx, bz): the road it crosses must have its
 * traffic held (red), and not just about to be released.
 */
export function walkOk(ax: number, az: number, bx: number, bz: number, time: number) {
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const rx = nearest(ROADS_X, mx), rz = nearest(ROADS_Z, mz);
  // Walking along x crosses a north-south road, so north-south traffic must be stopped (and the other way round).
  const held: TravelAxis = alongX ? 'z' : 'x';
  return lightFor(rx, rz, held, time) === 'red' && greenIn(rx, rz, held, time) > 2;
}

export function nearest(list: number[], v: number) {
  let best = list[0];
  for (const r of list) if (Math.abs(r - v) < Math.abs(best - v)) best = r;
  return best;
}

/**
 * Every signalled approach: the junction, the axis and direction traffic arrives along, and where its pole
 * stands (the near right-hand corner, between the curb and the walking line). Approaches from beyond the fences
 * or the river (where no traffic comes from) have no signal.
 */
export type Approach = { rx: number; rz: number; axis: TravelAxis; dir: 1 | -1; pole: { x: number; z: number } };
export const APPROACHES: Approach[] = [];
for (const rx of ROADS_X) {
  for (const rz of ROADS_Z) {
    for (const dir of [1, -1] as const) {
      if (!(dir > 0 ? rx === ROADS_X[0] : rx === ROADS_X[ROADS_X.length - 1])) {
        APPROACHES.push({ rx, rz, axis: 'x', dir, pole: { x: rx - dir * 11.6, z: rz + dir * 7.7 } });
      }
      if (!(dir > 0 ? rz === ROADS_Z[0] : rz === ROADS_Z[ROADS_Z.length - 1])) {
        APPROACHES.push({ rx, rz, axis: 'z', dir, pole: { x: rx - dir * 7.7, z: rz - dir * 11.6 } });
      }
    }
  }
}
