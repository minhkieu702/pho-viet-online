import { LAND, ROADS_X, ROADS_Z, SIDEWALK, STREETS_H, STREETS_V } from './consts';
import { createRoadGraph, type EdgeSpec, type Footway, type NodeSpec, type Phantom } from './roads';

/**
 * Today's street grid as a road graph, rebuilt exactly from city.ts: a signalled junction at every
 * (ROADS_X, ROADS_Z) crossing (the north-south roads end in a T at the riverside road), fence ends where roads
 * meet the west, east and south fences, R1 edges between them (the stubs into a fence carry no traffic), and
 * the walking network's two legacy quirks kept as data: the promenade footways north of the riverside road and
 * the 9 phantom crosswalks over the missing north arms of the riverside T junctions.
 */

/** Street names, the table city.ts gives to the houses along each road (east-west roads by z, north-south by x). */
export const STREETS_EW = STREETS_H;
export const STREETS_NS = STREETS_V;

export function buildLegacyRoads() {
  const nodes: NodeSpec[] = [];
  const edges: EdgeSpec[] = [];
  // Junctions first, in the order the old signal table walked them (x outer, z inner): node id = i * nz + j.
  const junction = (i: number, j: number) => i * ROADS_Z.length + j;
  for (const x of ROADS_X) for (const z of ROADS_Z) nodes.push({ x, z, control: 'signal' });
  const fence = (x: number, z: number) => nodes.push({ x, z, control: 'fence-end' }) - 1;
  const lastX = ROADS_X.length - 1, lastZ = ROADS_Z.length - 1;
  // East-west roads run fence to fence; edges point east (+x).
  ROADS_Z.forEach((z, j) => {
    const name = STREETS_EW.get(z) ?? 'ĐƯỜNG AN HÒA';
    edges.push({ a: fence(LAND.minX, z), b: junction(0, j), name, traffic: false });
    for (let i = 0; i < lastX; i++) edges.push({ a: junction(i, j), b: junction(i + 1, j), name });
    edges.push({ a: junction(lastX, j), b: fence(LAND.maxX, z), name, traffic: false });
  });
  // North-south roads start at the riverside T and run to the south fence; edges point south (+z).
  ROADS_X.forEach((x, i) => {
    const name = STREETS_NS.get(x) ?? 'ĐƯỜNG AN HÒA';
    for (let j = 0; j < lastZ; j++) edges.push({ a: junction(i, j), b: junction(i, j + 1), name });
    edges.push({ a: junction(i, lastZ), b: fence(x, LAND.maxZ), name, traffic: false });
  });
  // The old walking lines ran the full map: north of the riverside road they cross a road that is not there
  // (phantom crosswalks) and continue down to the promenade (footways).
  const phantoms: Phantom[] = ROADS_X.map((_, i) => ({ node: junction(i, 0), hx: 0, hz: -1, walk: SIDEWALK }));
  const footways: Footway[] = ROADS_X.flatMap((x) => [-1, 1].map((side) => {
    const line = x + side * SIDEWALK;
    return { ax: line, az: LAND.minZ + 1, bx: line, bz: ROADS_Z[0] - SIDEWALK };
  }));
  return createRoadGraph({ nodes, edges, phantoms, footways });
}

/** Today's road graph, built once (64 nodes, 95 edges). */
export const LEGACY_ROADS = buildLegacyRoads();
