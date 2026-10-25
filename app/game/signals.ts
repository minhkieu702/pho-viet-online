import { ROADS_X, ROADS_Z } from './city';
import { LEGACY_ROADS } from './map/roads-legacy';
import type { Crosswalk } from './map/roads';

/**
 * Traffic lights at the signalled nodes of the road graph. Each node runs its phases in turn (on today's grid
 * north-south traffic has the green first, then east-west), with an amber and a short all-red between; each
 * node is offset in its cycle by its position, so the lights roll down a street like a green wave. Pure
 * functions of the clock, so traffic, pedestrians and the lamps on the poles always agree.
 */
export type Light = 'green' | 'yellow' | 'red';
/** 'x' is traffic moving east-west (along x), 'z' north-south. */
export type TravelAxis = 'x' | 'z';

const GREEN = 13, AMBER = 3, CLEAR = 1;
const HALF = GREEN + AMBER + CLEAR;
/** The two-phase cycle (every junction on today's grid); a three-phase node takes 3 * HALF. */
export const CYCLE = HALF * 2;
/** Traffic waits with its front bumper at this distance from the junction centre (before the zebra crossing). */
export const STOP_LINE = 11.2;

/** The road graph whose signalled nodes these are. */
export const SIGNAL_ROADS = LEGACY_ROADS;
const nodes = SIGNAL_ROADS.nodes;
/** Origin of the green wave: today's north-west junction. */
const WAVE_X = -108, WAVE_Z = -108;

/** Where a node sits in the green wave: a function of position only, so a node anywhere gets a slot. */
export function phaseOffset(x: number, z: number) {
  return ((x - WAVE_X) / 54) * 5.5 + ((z - WAVE_Z) / 54) * 3.5;
}
const offsets = nodes.map((n) => phaseOffset(n.x, n.z));
const phasesOf = (node: number | undefined) => (node === undefined ? 2 : Math.max(2, nodes[node].phases));

/** Seconds into the green window of `group` (green while < GREEN) for a node with this offset and phase count. */
function slot(offset: number, phases: number, group: number, time: number) {
  const cycle = phases * HALF;
  const phase = (((time + offset) % cycle) + cycle) % cycle;
  return (phase + ((phases - group) % phases) * HALF) % cycle;
}
const lightOf = (t: number): Light => (t < GREEN ? 'green' : t < GREEN + AMBER ? 'yellow' : 'red');

/** The light facing traffic in signal group `group` at a node (the group of the arm or approach). */
export function nodeLight(node: number, group: number, time: number): Light {
  return lightOf(slot(offsets[node], phasesOf(node), group, time));
}
/** Seconds until `group` turns green at a node (0 while it is green). */
export function nodeGreenIn(node: number, group: number, time: number) {
  const t = slot(offsets[node], phasesOf(node), group, time);
  return t < GREEN ? 0 : phasesOf(node) * HALF - t;
}
/** Whether people may cross the arms of `group`: their traffic is held (red) and not about to be released. */
export function nodeWalkOk(node: number, group: number, time: number) {
  return nodeLight(node, group, time) === 'red' && nodeGreenIn(node, group, time) > 2;
}
/** walkOk for one crosswalk of the graph (phantom ones are held by north-south traffic, as before); no light, no wait. */
export function crosswalkOk(c: Crosswalk, time: number) {
  return nodes[c.node].control !== 'signal' || nodeWalkOk(c.node, c.group, time);
}
/** The light facing a signal approach (SIGNAL_ROADS.approaches, index for index with APPROACHES). */
export function approachLight(index: number, time: number) {
  const a = SIGNAL_ROADS.approaches[index];
  return nodeLight(a.node, a.group, time);
}

// ---- Grid-style wrappers for callers that still think in (road, junction) coordinates ----
const byPosition = new Map<number, Map<number, number>>();
for (const n of nodes) {
  if (n.control !== 'signal') continue;
  if (!byPosition.has(n.x)) byPosition.set(n.x, new Map());
  byPosition.get(n.x)!.set(n.z, n.id);
}
/** On today's grid the north-south arms are group 0 and the east-west arms group 1. */
const groupOf = (axis: TravelAxis) => (axis === 'z' ? 0 : 1);
/** slot() for the node at exactly (rx, rz); off the graph, the same formula from the position. */
function slotAt(rx: number, rz: number, axis: TravelAxis, time: number) {
  const node = byPosition.get(rx)?.get(rz);
  return slot(node === undefined ? phaseOffset(rx, rz) : offsets[node], phasesOf(node), groupOf(axis), time);
}

/** The light facing traffic travelling along `axis` at the junction (rx, rz). */
export function lightFor(rx: number, rz: number, axis: TravelAxis, time: number): Light {
  return lightOf(slotAt(rx, rz, axis, time));
}

/** Seconds until the light for `axis` turns green (0 when it is green). */
export function greenIn(rx: number, rz: number, axis: TravelAxis, time: number) {
  const t = slotAt(rx, rz, axis, time);
  return t < GREEN ? 0 : phasesOf(byPosition.get(rx)?.get(rz)) * HALF - t;
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
  const node = byPosition.get(rx)?.get(rz);
  if (node !== undefined) return nodeWalkOk(node, groupOf(held), time);
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
 * or the river (where no traffic comes from) have no signal. Derived from SIGNAL_ROADS.approaches, in its order
 * (junction by junction; at each, traffic arriving from the west, north, east, then south).
 */
export type Approach = { rx: number; rz: number; axis: TravelAxis; dir: 1 | -1; pole: { x: number; z: number } };
export const APPROACHES: Approach[] = SIGNAL_ROADS.approaches.map((a) => {
  const node = nodes[a.node], alongX = Math.abs(a.hx) > Math.abs(a.hz);
  return { rx: node.x, rz: node.z, axis: alongX ? 'x' : 'z', dir: (alongX ? a.hx : a.hz) > 0 ? 1 : -1, pole: { x: a.pole.x, z: a.pole.z } };
});
