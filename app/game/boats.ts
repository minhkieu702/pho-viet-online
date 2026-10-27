import * as THREE from 'three';
import { TERRAIN, navigable, waterLevel, type Terrain } from './map/terrain';
import { LAND } from './map/consts';
import { SECONDS_PER_HOUR } from './clock';
import { BERTH_Z, LINE_SPECS, MOORINGS, STOP_SPECS, buildNetwork, createTransit, pathAhead, pathPoint, stopTitle, type LineSpec, type StopSpec, type TransitLine, type TransitNetwork, type Trip } from './transit';
import type { Entry, Registry } from './interact';
import { BODY_SCALE, FIGURE, HAND, bakeFigure, chestMatrix, deriveStyle, palettesOf, sideX, type FigureLook, type FigureStyle } from './figures';
import { ModelParts, vehicleMaterial, type Vec3 } from './vehicle-models';
import { plantFoot, reachGrip } from './vehicles';

/**
 * Boats on the river (map/terrain.ts water): sampans rowed by someone in a conical hat, the river bus (driven on its
 * timetable by buses.ts, berthing at the piers), a dinner-cruise boat strung with lights, sand barges, speedboats
 * and a fishing boat with eyes painted on its bow. Each keeps to its own lane (one direction per lane, so they never
 * meet head-on), bobs on the swell, leaves a wake, slows down for anyone in the water ahead and goes round far out
 * of sight of the player. Two sampans are moored for people to use (transit.ts MOORINGS): the đò at the An Hòa pier
 * and a fishing ghe off the promenade. One speedboat is kept for the player to hire at a rental dock.
 *
 * On the wired map (WIRING-PLAN §3) the river reaches further: the lanes run between the step's wrap windows (Quận 4:
 * east to the bend; Bình Thạnh: west to x -700) and swing clear of what stands in the water (the cargo ship moored in
 * the basin, Thủ Thiêm's piers on the far bank: every lane's sweep stays 3 m off a pier's end), lanes beside them
 * moving over in step. A boat that reaches the end of its window goes round only out of the player's sight, and
 * waits there otherwise. The second river bus line (W2) calls at the new piers (Bến Nhà Rồng, Bến Bình Thạnh, Bến Thủ
 * Thiêm, Bến Đò Thủ Thiêm) as well as An Hòa and Bạch Đằng; its riders board here (register). With Thủ Thiêm built
 * the đò ngang rows across from the An Hòa pier to Bến Đò Thủ Thiêm (THU_THIEM_EXTRA.ferry: 5.000đ, about two
 * minutes), carrying the player through the passenger API; river traffic slows for it as it does for swimmers.
 */
export type BoatKind = 'sampan' | 'waterbus' | 'barge' | 'cruise' | 'speedboat' | 'fishing';
/** Who is aboard a sampan: rowing it with a guest, rowing a fare (the guest's place left for them), sitting at the stern by the oar (the đò's boatman), fishing, or nobody. */
export type Crew = 'rower' | 'rowing' | 'boatman' | 'fisher' | 'none';
export type Boat = {
  kind: BoatKind;
  x: number; z: number; yaw: number;
  /** Signed speed along the heading (m/s). */
  speed: number;
  cruise: number; dir: number; lane: number; weave: number;
  /** Extra roll (the hire boat banks into its turns). */
  bank: number;
  /** Half beam and half length, for collisions. */
  half: [number, number];
  /** `docked`: a river bus alongside a pier; `moored`: tied up (or at anchor), facing `moor`. */
  mode: 'cruise' | 'docked' | 'anchored' | 'moored' | 'player' | 'idle';
  until: number; phase: number;
  group: THREE.Group;
  mesh: THREE.Mesh;
  wake: THREE.Mesh;
  /** Where the helmsman's hips go, in the boat's frame. */
  seat: [number, number, number];
  crew: Crew;
  /** A moored boat: its mooring (transit.ts MOORINGS id), heading, and how far it swings on its rope. */
  moor: { id: string; yaw: number; swing: number } | null;
  /** A river bus on its line: see WaterRun. */
  run: WaterRun | null;
};
/**
 * A river bus on line W1 (transit.ts): its timetable vehicle, the arc it has reached on the course, the call it is at or
 * heading for, the pier it lies alongside, whether its timetable has it in service, the trip, when it tied up, and
 * whether it is off to the depot (out of service, on along the course until out of sight).
 */
export type WaterRun = {
  key: string; s: number; visit: number; stop: string | null; service: boolean; trip: Trip | null; docked: number; depot: boolean; since: number; line?: TransitLine;
  /** Since when (update's time) it has stood still while cruising (-1: moving), and until when it goes on regardless of other river buses (the watchdog). */
  still?: number; free?: number;
};

const SPEC: Record<BoatKind, { length: number; beam: number }> = {
  sampan: { length: 6, beam: 1.5 }, waterbus: { length: 22, beam: 5 }, barge: { length: 30, beam: 7 },
  cruise: { length: 26, beam: 6.5 }, speedboat: { length: 6.5, beam: 2.2 }, fishing: { length: 10, beam: 3 },
};
/**
 * River traffic goes round out of the player's sight: a boat farther than this along the river from the player
 * reappears as far on the other side (the fog closes at 260 m), wherever the map's river reaches.
 */
const WRAP_REACH = 420;
/** The river's surface (map/terrain.ts), and the level to use off its water. */
const RIVER_LEVEL = TERRAIN.waters[0]?.level ?? -0.8;
/** The river bus line and its timetable (transit.ts W1); boats drive its course to it (buses.ts keeps the clock). */
const WATER_NET = buildNetwork(undefined, LINE_SPECS.filter((l) => l.mode === 'waterbus'), STOP_SPECS.filter((st) => st.mode === 'waterbus'));
export const WATER_LINE = WATER_NET.lines[0] ?? null;
function surface(x: number, z: number) { const y = waterLevel(x, z); return y > -1e6 ? y : RIVER_LEVEL; }
/**
 * Lanes across the river (design-real 7), from the promenade out to the far bank: sampans east, the river bus's
 * east and west runs (transit.ts W1 course), the cruise boat, speedboats both ways, the barge, sampans west and the
 * anchored fishing boats. The river bus berths alongside the pier ends at BERTH_Z (transit.ts).
 */
const LANES = { sampanEast: -160.5, cruise: -178.5, speedEast: -184, speedWest: -188.5, barge: -194, sampanWest: -199, anchored: -202 } as const;

// ---- The wired map's river (WIRING-PLAN §3 Boats) ----------------------------------------------------------

/** River buses berth alongside the Thủ Thiêm pier ends (z -195.6), as they do the south bank's (BERTH_Z). */
export const NORTH_BERTH_Z = -192.8;
const W2_IDS: Record<string, string> = {
  'ben-nha-rong': 'w2-nha-rong', 'ben-binh-thanh': 'w2-binh-thanh', 'ben-thu-thiem': 'w2-thu-thiem', 'ben-do-thu-thiem': 'w2-do-thu-thiem', 'an-hoa': 'w2-an-hoa', 'bach-dang': 'w2-bach-dang',
};
/**
 * The second river bus line on the wired map (design 1 §9's main line west and the Thủ Thiêm spur, one course): from
 * Bến Nhà Rồng west along the outer lane calling at the Thủ Thiêm piers, round at the west end (Bến Bình Thạnh, or An
 * Hòa before Bình Thạnh is built), then east along the inner lane calling at every south pier (Bình Thạnh, An Hòa,
 * Bạch Đằng, Nhà Rồng). Its stops at today's piers have their own ids (w2-an-hoa, w2-bach-dang): line W1 and its pier
 * prompts (buses.ts) stay as they are. Null on today's map (no new pier).
 */
export function waterbusW2(t: Pick<Terrain, 'docks'> = TERRAIN): { line: LineSpec; stops: StopSpec[] } | null {
  const fresh = t.docks.filter((d) => d.role === 'waterbus' && d.id >= 4);
  if (!fresh.some((d) => d.side === 'S')) return null;
  const legacy = t.docks.filter((d) => d.role === 'waterbus' && d.id < 4);
  const south = [...legacy, ...fresh.filter((d) => d.side === 'S')].sort((a, b) => a.x - b.x);
  const north = fresh.filter((d) => d.side === 'N').sort((a, b) => b.x - a.x);
  const stop = (d: (typeof south)[number], z: number): StopSpec => ({ id: W2_IDS[d.key] ?? `w2-${d.key}`, name: d.name, mode: 'waterbus', wait: { ...d.ring }, berth: { x: d.x, z } });
  const southStops = south.map((d) => stop(d, BERTH_Z)), northStops = north.map((d) => stop(d, NORTH_BERTH_Z));
  const term = southStops[southStops.length - 1];
  const west = south[0].name.replace(/^BẾN (ĐÒ )?/, ''), east = term.name.replace(/^BẾN /, '');
  return {
    stops: [...southStops, ...northStops],
    line: {
      id: 'W2', name: `TÀU BUÝT SÔNG ${west} – ${east}`, mode: 'waterbus',
      // From the terminus (the east end): the north calls going west, then the south calls coming back east.
      stops: [term.id, ...northStops.map((s) => s.id), ...southStops.slice(0, -1).map((s) => s.id)],
      course: w2Course(south.map((d) => d.x), north.map((d) => d.x)),
      cruise: 6, accel: 0.4, decel: 0.5, dwell: 25, layover: 30, turn: 2, fare: 15, capacity: 75, length: 22, hw: 2.5, door: 0,
      headways: [{ from: 6, to: 9, every: 150 }, { from: 9, to: 16, every: 180 }, { from: 16, to: 19, every: 150 }, { from: 19, to: 21.5, every: 180 }],
    },
  };
}
/**
 * W2's course (x,z pairs, closed, from the terminus berth heading east): a tight turn north between the terminus pier
 * and the cargo ship's bow, west along the outer lane with an S-curve in to each Thủ Thiêm berth and out again,
 * round at the west end into the westmost south berth, then east along the inner lane, in to each south berth.
 */
function w2Course(south: number[], north: number[], inner = -166, outer = -172) {
  const pts: number[] = [], term = south[south.length - 1], lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  pts.push(term, BERTH_Z);
  // Radius 6 round a centre 7 m east of the pier: the 22 m hull keeps 9 m off the ship's bow (x 479.5).
  const r1 = 6, c1x = term + 7, c1z = BERTH_Z - r1;
  for (let k = 1; k <= 8; k++) { const t = (Math.PI * k) / 8; pts.push(c1x + r1 * Math.sin(t), c1z + r1 * Math.cos(t)); }
  pts.push(c1x - 25, outer);
  for (const x of north) {
    // In along an S-curve; out straight until the stern is past the pier and the đò lying at its west face, then the curve.
    pts.push(x + 45, outer, x + 33, lerp(outer, NORTH_BERTH_Z, 0.15), x + 21, lerp(outer, NORTH_BERTH_Z, 0.85), x + 11, NORTH_BERTH_Z, x, NORTH_BERTH_Z);
    pts.push(x - 24, NORTH_BERTH_Z, x - 34, lerp(outer, NORTH_BERTH_Z, 0.85), x - 46, lerp(outer, NORTH_BERTH_Z, 0.15), x - 58, outer);
  }
  // Round at the west end (as transit.ts W1), west of the last north call's curve, into the westmost south berth.
  const a = south[0], ux = Math.min(a - 14, ...north.map((x) => x - 73)), r = (BERTH_Z - outer) / 2, cz = (BERTH_Z + outer) / 2;
  for (let k = 0; k <= 8; k++) { const t = Math.PI + (Math.PI * k) / 8; pts.push(ux + r * Math.sin(t), cz + r * Math.cos(t)); }
  south.forEach((x, i) => {
    pts.push(x, BERTH_Z);
    if (i + 1 === south.length) return;
    const nx = south[i + 1];
    // Out and in over 40-odd metres (a 22 m hull turning more sharply swings its stern across the outer run).
    pts.push(x + 8, BERTH_Z, x + 22, lerp(BERTH_Z, inner, 0.15), x + 36, lerp(inner, BERTH_Z, 0.15), x + 50, inner);
    pts.push(nx - 48, inner, nx - 34, lerp(inner, BERTH_Z, 0.15), nx - 18, lerp(BERTH_Z, inner, 0.15));
  });
  // The last point is the terminus berth again: the course closes on itself.
  return pts.slice(0, -2);
}

/**
 * Where each lane runs on the wired map: its window [west, east] (where the boats go round) and, where something
 * stands in the far-side water, its line z(x) sampled every LANE_STEP m. The near lane (sampans east) keeps to its line
 * and ends short of the canal mouth (the cargo ship and Bến Nhà Rồng's river bus turn are beyond). The far lanes (the
 * barge, sampans west, both speedboats, the cruise boat) pass north of the ship to the bend; a far-bank pier pushes
 * the nearest of them over (its sweep 3 m off the pier's end) and the lanes beyond it move with it, keeping today's
 * order and spacing, never into the river buses' outer run (z -174.5..-169.5) where it is. Where there is no room for
 * today's spacing the lanes squeeze up, and that stretch is a narrow: boats pass it one at a time (narrows).
 */
const LANE_STEP = 4;
type LanePlan = {
  west: number; east: number; x0: number; z: Map<number, Float64Array>;
  /** Per lane base: its own window when it differs (the near lane ends at the canal mouth). */
  windows: Map<number, [number, number]>;
  /** Stretches where the far lanes are squeezed together: one boat at a time. */
  narrows: [number, number][];
};
/** The far lanes from the far bank in, with their half sweeps (half beam plus weave). */
const FAR: { base: number; half: number }[] = [
  { base: LANES.sampanWest, half: 0.75 }, { base: LANES.barge, half: 3.5 }, { base: LANES.speedWest, half: 1.1 + 1.2 }, { base: LANES.speedEast, half: 1.1 + 1.2 }, { base: LANES.cruise, half: 3.25 },
];
/**
 * Where the river buses' hulls reach towards the far side along their courses (outer run and turns; not their curves in
 * to the far bank's piers, where the far lanes give way to them): the northmost hull corner over each LANE_STEP of x.
 */
function busSweep(courses: readonly { pts: readonly number[] }[], west: number, n: number) {
  const reach = new Float64Array(n).fill(Infinity), L = 11, B = 2.5;
  for (const c of courses) {
    const p = c.pts;
    for (let k = 0; k < p.length; k += 2) {
      const j = (k + 2) % p.length, dx = p[j] - p[k], dz = p[j + 1] - p[k + 1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const hx = dx / l, hz = dz / l;
      for (let s = 0; s <= l; s += 1) {
        const x = p[k] + hx * s, z = p[k + 1] + hz * s;
        if (z < -176 || Math.min(p[k + 1], p[j + 1]) < -176) continue;
        for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const cx = x + hx * L * a - hz * B * b, cz = z + hz * L * a + hx * B * b, i = Math.round((cx - west) / LANE_STEP);
          if (i >= 0 && i < n) reach[i] = Math.min(reach[i], cz);
        }
      }
    }
  }
  return reach;
}
export function lanePlan(t: Pick<Terrain, 'slices' | 'docks' | 'wetAt'> = TERRAIN, courses: readonly { pts: readonly number[] }[] = []): LanePlan | null {
  if (!t.slices.length) return null;
  const west = t.slices.includes('binh-thanh') ? -700 : LAND.minX - 260, east = t.slices.includes('quan-4') ? 700 : LAND.maxX + 260;
  const windows = new Map<number, [number, number]>();
  // The near lane stops short of the canal mouth: beyond it the cargo ship's hull and Bến Nhà Rồng's river bus berth.
  if (t.slices.includes('quan-4')) windows.set(LANES.sampanEast, [west, 425]);
  // Keep-outs: nothing's sweep north of zN (the far bank + 2 m; a far-bank pier's end + 3 m abreast of its berth).
  const n = Math.floor((east - west) / LANE_STEP) + 1, zN = new Float64Array(n), zS = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = west + i * LANE_STEP;
    let z = -160;
    while (z > -400 && t.wetAt(x, z - 0.5)) z -= 0.5;
    zN[i] = z + 2;
    // South of the far lanes: the near lane's sweep (3 m off it), and the river buses' hulls (0.6 m off them).
    zS[i] = LANES.sampanEast - 0.75 - 3;
  }
  const sweep = busSweep(courses, west, n);
  // (their outer run, 0.6 m off its hulls; where a turn swings a hull's end further over, the lanes there give way to it)
  for (let i = 0; i < n; i++) if (sweep[i] < Infinity) zS[i] = Math.min(zS[i], Math.max(sweep[i], -174.5) - 0.6);
  for (const d of t.docks) {
    if (d.side !== 'N') continue;
    const end = d.pier.maxZ + 3;
    for (let i = Math.max(0, Math.floor((d.berth.minX - 1 - west) / LANE_STEP)); i <= Math.min(n - 1, Math.ceil((d.berth.maxX + 1 - west) / LANE_STEP)); i++) zN[i] = Math.max(zN[i], end);
  }
  // Every keep-out held SPREAD samples either side (so the smoothing below has room to ease in and out of it), then
  // the lanes packed at every sample and eased with a moving average over ±SMOOTH samples: an average of ordered,
  // spaced placements is ordered and spaced, and inside a keep-out (SPREAD >= SMOOTH) it is the full placement.
  const SPREAD = 7, SMOOTH = 6;
  const nN = new Float64Array(n), nS = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let a = -Infinity, c = Infinity;
    for (let j = Math.max(0, i - SPREAD); j <= Math.min(n - 1, i + SPREAD); j++) { a = Math.max(a, zN[j]); c = Math.min(c, zS[j]); }
    nN[i] = a; nS[i] = c;
  }
  const last = FAR.length - 1, span = FAR[last].base - FAR[0].base;
  const raw = FAR.map(() => new Float64Array(n)), squeezed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const z = FAR.map((l) => l.base);
    // From the far side: nothing over its line, the lanes nearer in moved over in step.
    for (let k = 0; k <= last; k++) z[k] = Math.max(FAR[k].base, k ? z[k - 1] + (FAR[k].base - FAR[k - 1].base) : nN[i] + FAR[0].half);
    // Not into the river buses' run: too narrow for today's spacing, so squeeze the lanes between the two lines.
    if (z[last] + FAR[last].half > nS[i] + 1e-9) {
      const top = nN[i] + FAR[0].half, f = (nS[i] - FAR[last].half - top) / span;
      for (let k = 0; k <= last; k++) z[k] = top + (FAR[k].base - FAR[0].base) * f;
      // Squeezed by more than a tenth: hulls in neighbouring lanes would touch passing, so it is a narrow, which boats
      // pass one at a time down the middle of what is left of the channel.
      if (f < 0.9) {
        squeezed[i] = 1;
        for (let k = 0; k <= last; k++) z[k] = Math.min(Math.max((nN[i] + nS[i]) / 2, nN[i] + FAR[k].half), nS[i] - FAR[k].half);
      }
    }
    for (let k = 0; k <= last; k++) raw[k][i] = z[k];
  }
  const out = new Map<number, Float64Array>(), narrows: [number, number][] = [];
  if (raw.every((r, k) => r.every((v) => v === FAR[k].base))) return { west, east, x0: west, z: out, windows, narrows };
  FAR.forEach((l, k) => {
    const s = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, w = 0, moved = false;
      for (let j = Math.max(0, i - SMOOTH); j <= Math.min(n - 1, i + SMOOTH); j++) { const q = 1 + SMOOTH - Math.abs(j - i); sum += raw[k][j] * q; w += q; if (raw[k][j] !== l.base) moved = true; }
      // Exactly today's lane wherever nothing near pushes it.
      s[i] = moved ? sum / w : l.base;
    }
    out.set(l.base, s);
  });
  // The narrows: where the lanes are squeezed, and as far as the easing reaches either side.
  for (let i = 0; i < n; i++) {
    if (!squeezed[i]) continue;
    const x = west + i * LANE_STEP, prev = narrows[narrows.length - 1];
    if (prev && x - prev[1] <= LANE_STEP * 2) prev[1] = x; else narrows.push([x, x]);
  }
  return { west, east, x0: west, z: out, windows, narrows: narrows.map(([a, b]) => [a - SMOOTH * LANE_STEP, b + SMOOTH * LANE_STEP]) };
}
/** A lane's z at x on a plan (its base where nothing pushes it). */
export function laneAt(plan: LanePlan | null, base: number, x: number) {
  const s = plan?.z.get(base);
  if (!s) return base;
  const f = (x - plan!.x0) / LANE_STEP, i = Math.floor(f);
  if (i < 0) return s[0];
  if (i >= s.length - 1) return s[s.length - 1];
  return s[i] + (s[i + 1] - s[i]) * (f - i);
}
/** Bow benches on the river bus's foredeck, in front of the cabin: the passenger's seat, boat frame (seat top). */
export const WATERBUS_SEAT: Vec3 = [0.55, 1.3, 7.05];
/** A passenger's seat on a moored sampan: on the thwart in the bow, facing forward. */
export const SAMPAN_SEAT: Vec3 = [0.05, 0.6, 1.65];

/** Top-view outline of a hull, bow towards +z once extruded (shape y maps to -z). */
function hullShape(length: number, beam: number, bow = 0.3, stern = 0.82) {
  const s = new THREE.Shape();
  const hb = beam / 2, hl = length / 2;
  s.moveTo(-hb * stern, hl);
  s.lineTo(hb * stern, hl);
  s.lineTo(hb, hl - length * 0.22);
  s.lineTo(hb, -hl + length * bow);
  s.quadraticCurveTo(hb * 0.82, -hl + length * 0.05, 0, -hl);
  s.quadraticCurveTo(-hb * 0.82, -hl + length * 0.05, -hb, -hl + length * bow);
  s.lineTo(-hb, hl - length * 0.22);
  s.closePath();
  return s;
}
function hull(parts: ModelParts, length: number, beam: number, height: number, y0: number, color: string, trim: string, bow = 0.3) {
  parts.add(new THREE.ExtrudeGeometry(hullShape(length, beam, bow), { depth: height, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), { at: [0, y0, 0], color, finish: 'paint' });
  // A gunwale round the top edge, a little proud of the hull: a ring, open over the deck.
  const rim = hullShape(length * 1.02, beam * 1.05, bow);
  rim.holes.push(hullShape(length * 0.93, beam * 0.84, bow));
  parts.add(new THREE.ExtrudeGeometry(rim, { depth: 0.14, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), { at: [0, y0 + height - 0.07, 0], color: trim, finish: 'paint' });
}
/** Deck planking in the hull's own outline (a box would poke out where the bow narrows). */
function deck(parts: ModelParts, length: number, beam: number, bow: number, y: number, thick: number, color: string) {
  parts.add(new THREE.ExtrudeGeometry(hullShape(length * 0.94, beam * 0.86, bow), { depth: thick, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), { at: [0, y, 0], color, finish: 'cloth' });
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg);

// ---- People aboard -------------------------------------------------------------------------------------------

/**
 * A person posed once and baked into the boat's geometry (they ride along with its bob and roll). Everything is
 * in the person's own frame: the deck they stand or sit on is y = 0, they face +z, the data's +x is their right (mirrored to -x when solved); `at`
 * and `yaw` put that frame on the boat. `hip` is for a build of height 1 (scaled by the person's height). Feet
 * are planted by IK; hands close on an oar (a point on the shaft and the shaft's direction through the fist) or
 * rest just beyond the knees.
 */
type Aboard = {
  style: FigureStyle;
  at: Vec3; yaw: number;
  hip: Vec3; lean: number; twist?: number; pitch?: number; look?: number;
  feet: [Vec3, Vec3]; knee: Vec3; elbow: Vec3;
  oar?: [[Vec3, Vec3], [Vec3, Vec3]];
};
/** vehicle-models' 'cloth' finish (roughness, metalness, lamp glow) for the baked people. */
const CLOTH: Vec3 = [0.85, 0, 0];

/** Solves and bakes one person (lo detail, vertex coloured, indexed). */
function bakedPerson(p: Aboard) {
  const s = BODY_SCALE, { width: w, height: h, shoulderX } = p.style;
  const body = new THREE.Matrix4().compose(new THREE.Vector3(...p.hip).multiplyScalar(h), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p.lean), new THREE.Vector3(s * w, s * h, s * w))
    .multiply(new THREE.Matrix4().makeTranslation(0, -FIGURE.hipY, 0));
  const inv = body.clone().invert();
  const chest = chestMatrix(body, p.twist ?? 0), chestInv = chest.clone().invert();
  // The data is written with the right side at +x; people face +z, so their right is at -x (sideX).
  const hint = (v: Vec3, side: number) => new THREE.Vector3(sideX(side) * v[0], v[1], v[2]);
  const legs = ([-1, 1] as const).map((side, k) => plantFoot(body, inv, side, new THREE.Vector3(-p.feet[k][0], p.feet[k][1], p.feet[k][2]), hint(p.knee, side)));
  const arms = ([-1, 1] as const).map((side, k) => {
    if (p.oar) {
      const [point, along] = p.oar[k];
      return reachGrip(chest, chestInv, side, shoulderX, new THREE.Vector3(...point), new THREE.Vector3(...along).normalize(), hint(p.elbow, side), HAND.GRIP, 0, null);
    }
    const knee = new THREE.Vector3(0, -FIGURE.thigh, 0).applyMatrix4(legs[k].matrix);
    return reachGrip(chest, chestInv, side, shoulderX, knee.add(new THREE.Vector3(sideX(side) * 0.02, 0.03, 0.09)), new THREE.Vector3(0, 0, 1), hint(p.elbow, side), HAND.RELAXED, 0.3, [0.6, 0]);
  });
  const place = new THREE.Matrix4().compose(new THREE.Vector3(...p.at), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(1, 1, 1));
  const on = (m: THREE.Matrix4) => m.clone().premultiply(place);
  const looks = palettesOf(p.style);
  return bakeFigure([
    { piece: 'body', matrix: on(body), look: looks.body, pose: [p.look ?? 0, p.pitch ?? 0, p.twist ?? 0, 0] },
    { piece: 'armL', matrix: on(arms[0].matrix), look: looks.armL, pose: arms[0].pose },
    { piece: 'armR', matrix: on(arms[1].matrix), look: looks.armR, pose: arms[1].pose },
    { piece: 'leg', matrix: on(legs[0].matrix), look: looks.legs, pose: legs[0].pose },
    { piece: 'leg', matrix: on(legs[1].matrix), look: looks.legs, pose: legs[1].pose },
  ]);
}

/** The boat (non-indexed ModelParts) and its people (indexed) as one indexed geometry for the vehicle material. */
function withPeople(boat: THREE.BufferGeometry, people: THREE.BufferGeometry[]) {
  const all = [boat, ...people];
  const total = all.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(total * 3), normal = new Float32Array(total * 3), color = new Float32Array(total * 3);
  const paint = new Float32Array(total), finish = new Float32Array(total * 3);
  const index: number[] = [];
  let at = 0;
  for (const g of all) {
    const n = g.getAttribute('position').count;
    position.set(g.getAttribute('position').array as Float32Array, at * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, at * 3);
    color.set(g.getAttribute('color').array as Float32Array, at * 3);
    if (g === boat) {
      paint.set(g.getAttribute('paint').array as Float32Array, at);
      finish.set(g.getAttribute('finish').array as Float32Array, at * 3);
      for (let i = 0; i < n; i++) index.push(at + i);
    } else {
      for (let i = 0; i < n; i++) finish.set(CLOTH, (at + i) * 3);
      for (const i of g.index!.array) index.push(at + i);
    }
    at += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.setAttribute('paint', new THREE.BufferAttribute(paint, 1));
  out.setAttribute('finish', new THREE.BufferAttribute(finish, 3));
  out.setIndex(index);
  out.computeBoundingSphere();
  return out;
}

/**
 * The sampan's rower stands at the stern working one long oar (chèo) that pivots on the stern post, both fists on
 * the shaft, in áo bà ba and nón lá. Returns the baked person and the oar's handle end, pivot and blade end
 * (boat frame) so the boat can draw the oar through the hands.
 */
function rower(deck: number, z: number) {
  const style = deriveStyle({ shirt: '#3f5a6a', pants: '#1d1b1a', skin: '#c58f69', hat: '#e8d9a8' }, 'sampan-rower', 'vendor', { fem: true });
  // Handle top in front of the chest on the right, through the pivot on the stern post and down into the river.
  const top = new THREE.Vector3(0.12, 1.06, 0.42), pivot = new THREE.Vector3(0.5, 0.2, -0.56);
  const shaft = pivot.clone().sub(top).normalize(), up = shaft.clone().negate();
  const at = (k: number) => top.clone().addScaledVector(shaft, k).toArray() as Vec3;
  const person = bakedPerson({
    style, at: [0, deck, z], yaw: 0,
    hip: [0, 0.8, 0], lean: 0.12, twist: 0.3, pitch: -0.02, look: 0.2,
    feet: [[-0.12, 0, 0.26], [0.14, 0, -0.24]], knee: [0.15, 0, 1], elbow: [0.6, -0.6, -0.5],
    oar: [[at(0.38), up.toArray() as Vec3], [at(0.05), up.toArray() as Vec3]],
  });
  const lift = new THREE.Vector3(0, deck, z);
  return { person, grip: top.clone().addScaledVector(shaft, -0.1).add(lift), pivot: pivot.clone().add(lift), blade: pivot.clone().addScaledVector(shaft, 0.95).add(lift) };
}

/** A passenger sitting on the deck with knees drawn up and hands on them, under a nón lá. */
function sitter(deck: number, at: Vec3, yaw: number, look: FigureLook = { shirt: '#b8463a', pants: '#2a2522', skin: '#d3a179', hat: '#e8d9a8' }, fem = true) {
  const style = deriveStyle(look, fem ? 'sampan-guest' : 'boatman', 'retiree', { fem });
  return bakedPerson({
    style, at: [at[0], deck + at[1], at[2]], yaw,
    hip: [0, FIGURE.seatClear * BODY_SCALE, 0], lean: -0.08, pitch: 0.1, look: -0.3,
    feet: [[-0.12, 0, 0.44], [0.12, 0, 0.46]], knee: [0.2, 1, 0.2], elbow: [0.5, -0.6, -0.4],
  });
}

/** A fisherman squatting on the deck the way people rest everywhere in Việt Nam, forearms on his knees. */
function squatter(deck: number, at: Vec3, yaw: number) {
  const style = deriveStyle({ shirt: '#86a799', pants: '#3a3f48', skin: '#b98260', hat: '#e8d9a8' }, 'fisher', 'vendor', { fem: false });
  return bakedPerson({
    style, at: [at[0], deck + at[1], at[2]], yaw,
    hip: [0, 0.33, -0.08], lean: 0.42, pitch: -0.3, look: 0.25,
    feet: [[-0.15, 0, 0.12], [0.15, 0, 0.14]], knee: [0.35, 0.6, 1], elbow: [0.4, -0.8, 0.2],
  });
}

/** A rod of radius r from a to b (ModelParts.rod scales its unit cylinder by r twice). */
const pole = (parts: ModelParts, a: Vec3, b: Vec3, r: number, color: string, finish: 'cloth' | 'metal' = 'cloth') => parts.add(new THREE.CylinderGeometry(1, 1, 1, 6), { color, finish, matrix: new THREE.Matrix4().compose(
  new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
  new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()),
  new THREE.Vector3(r, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), r)) });

function boatGeometry(kind: BoatKind, crew: Crew = 'rower') {
  const parts = new ModelParts();
  const { length: L, beam: B } = SPEC[kind];
  if (kind === 'sampan') {
    hull(parts, L, B, 0.58, -0.32, '#7a5536', '#5a3c26', 0.36);
    deck(parts, L, B, 0.36, 0.09, 0.06, '#8a6a46');
    // The arched bamboo canopy over the middle, and a thwart across the bow to sit on.
    parts.add(new THREE.CylinderGeometry(0.7, 0.7, 2.3, 10, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), { at: [0, 0.2, 0.2], color: '#b08a4e', finish: 'cloth' });
    parts.add(box(B * 0.62, 0.06, 0.32), { at: [0, SAMPAN_SEAT[1] - 0.03, SAMPAN_SEAT[2] - 0.05], color: '#8a6a46', finish: 'cloth' });
    for (const sx of [-1, 1]) parts.add(box(0.06, SAMPAN_SEAT[1] - 0.15, 0.06), { at: [sx * B * 0.26, (SAMPAN_SEAT[1] + 0.12) / 2, SAMPAN_SEAT[2] - 0.05], color: '#5a3c26', finish: 'cloth' });
    // The stern post the oar pivots on.
    parts.add(box(0.05, 0.36, 0.05), { at: [0.52, 0.1, -2.61], color: '#5a3c26', finish: 'cloth' });
    if (crew === 'rower' || crew === 'rowing') {
      // The rower's oar through both fists, pivoting on the post, its blade in the water; a guest in the bow.
      const row = rower(0.15, -2.05);
      parts.rod(row.grip.toArray() as Vec3, row.blade.toArray() as Vec3, 0.034, { color: '#8a6a46', finish: 'cloth' });
      parts.beam(row.blade.clone().lerp(row.pivot, 0.45).toArray() as Vec3, row.blade.toArray() as Vec3, 0.15, 0.03, { color: '#8a6a46', finish: 'cloth' });
      return withPeople(parts.build(), crew === 'rower' ? [row.person, sitter(0.15, [0.05, 0, 1.75], 0)] : [row.person]);
    }
    // Tied up: the oar shipped along the gunwale, its blade over the stern.
    pole(parts, [0.5, 0.3, 1.6], [0.55, 0.3, -3.2], 0.034, '#8a6a46');
    parts.beam([0.55, 0.3, -2.6], [0.56, 0.3, -3.35], 0.15, 0.03, { color: '#8a6a46', finish: 'cloth' });
    if (crew === 'boatman') {
      // The boatman waits for a fare at the stern, in áo bà ba and nón lá.
      return withPeople(parts.build(), [sitter(0.15, [-0.05, 0, -1.95], 0, { shirt: '#3a4a52', pants: '#1d1b1a', skin: '#b98260', hat: '#e8d9a8' }, false)]);
    }
    if (crew === 'fisher') {
      // The owner squats by the side with a bamboo rod over the water and its line down into it.
      pole(parts, [0.48, 0.62, -1.45], [2.9, 1.55, -1.1], 0.016, '#b89a5e');
      pole(parts, [2.9, 1.55, -1.1], [2.9, -0.4, -1.1], 0.003, '#e8e8e0');
      parts.add(box(0.36, 0.24, 0.28), { at: [-0.35, 0.27, -1.0], color: '#3d6f8f', finish: 'plastic' });
      return withPeople(parts.build(), [squatter(0.15, [0.15, 0, -1.6], Math.PI / 2)]);
    }
    return parts.build();
  } else if (kind === 'waterbus') {
    hull(parts, L, B, 1.5, -0.65, '#f2f1ec', '#1f5a8a', 0.26);
    parts.add(box(B * 0.98, 0.32, L * 0.62), { at: [0, 0.32, -0.6], color: '#1f5a8a', finish: 'paint' });
    parts.add(box(B - 0.7, 2.3, L * 0.62), { at: [0, 2.0, -0.6], color: '#f4f3ee', finish: 'paint' });
    for (const side of [-1, 1]) parts.add(box(0.06, 1.0, L * 0.58), { at: [side * (B / 2 - 0.33), 2.25, -0.6], color: '#2d4552', finish: 'glass' });
    parts.add(box(B - 0.7, 0.9, 0.06), { at: [0, 2.3, L * 0.31 - 0.6 + 0.03], color: '#2d4552', finish: 'glass' });
    parts.add(box(B - 0.3, 0.22, L * 0.66), { at: [0, 3.27, -0.6], color: '#1f5a8a', finish: 'paint' });
    for (let k = 0; k < 8; k++) parts.add(box(0.18, 0.08, 0.18), { at: [B / 2 - 0.2, 3.2, -L * 0.3 + k * L * 0.085], color: '#fff2c8', finish: 'lamp' });
    for (let k = 0; k < 8; k++) parts.add(box(0.18, 0.08, 0.18), { at: [-B / 2 + 0.2, 3.2, -L * 0.3 + k * L * 0.085], color: '#fff2c8', finish: 'lamp' });
    parts.rod([0, 3.4, -L * 0.36], [0, 5.2, -L * 0.36], 0.04, { color: '#cfd3d4', finish: 'metal' });
    parts.add(box(0.02, 0.5, 0.8), { at: [0, 4.9, -L * 0.36 - 0.4], color: '#c8322a', finish: 'cloth' });
    parts.add(box(0.5, 0.3, 0.3), { at: [0, 0.95, L / 2 - 0.9], color: '#fff4d6', finish: 'lamp' });
    // Two benches on the foredeck for riders who like the breeze, and a rail round the bow.
    for (const z of [WATERBUS_SEAT[2], WATERBUS_SEAT[2] + 1.25]) {
      const w = z > WATERBUS_SEAT[2] ? 2.2 : 2.9;
      parts.add(box(w, 0.07, 0.42), { at: [0, WATERBUS_SEAT[1] - 0.035, z - 0.02], color: '#2f6f9f', finish: 'paint' });
      parts.add(box(w, 0.36, 0.06), { at: [0, WATERBUS_SEAT[1] + 0.17, z - 0.24], color: '#2f6f9f', finish: 'paint' });
      for (const sx of [-1, 1]) parts.add(box(0.06, WATERBUS_SEAT[1] - 0.85, 0.06), { at: [sx * (w / 2 - 0.1), (WATERBUS_SEAT[1] + 0.85) / 2, z], color: '#cfd3d4', finish: 'metal' });
    }
    for (const sx of [-1, 1]) {
      pole(parts, [sx * (B / 2 - 0.3), 1.55, L * 0.31 - 0.4], [sx * 1.2, 1.55, L / 2 - 1.6], 0.035, '#cfd3d4', 'metal');
      pole(parts, [sx * 1.2, 1.55, L / 2 - 1.6], [0, 1.55, L / 2 - 0.5], 0.035, '#cfd3d4', 'metal');
      for (const z of [L * 0.31 - 0.4, L / 2 - 1.6]) pole(parts, [z > L * 0.4 ? sx * 1.2 : sx * (B / 2 - 0.3), 0.85, z], [z > L * 0.4 ? sx * 1.2 : sx * (B / 2 - 0.3), 1.55, z], 0.03, '#cfd3d4', 'metal');
    }
  } else if (kind === 'barge') {
    hull(parts, L, B, 1.4, -0.95, '#3c3a36', '#7a2f26', 0.14);
    parts.add(box(B - 0.6, 0.1, L * 0.7), { at: [0, 0.42, 1.5], color: '#4a4640', finish: 'metal' });
    // Two heaps of sand and the wheelhouse at the stern.
    parts.add(new THREE.ConeGeometry(2.8, 2.4, 6).scale(1, 1, 2.6), { at: [0, 1.6, 6], color: '#c9a55e', finish: 'cloth' });
    parts.add(new THREE.ConeGeometry(2.6, 2.0, 6).scale(1, 1, 2.2), { at: [0, 1.4, -4], color: '#bf9a52', finish: 'cloth' });
    parts.add(box(3.2, 2.6, 3.4), { at: [0, 1.75, -L / 2 + 2.6], color: '#e9e4d6', finish: 'paint' });
    parts.add(box(3.24, 0.8, 3.44), { at: [0, 2.4, -L / 2 + 2.6], color: '#2d4552', finish: 'glass' });
    parts.add(box(3.8, 0.2, 4), { at: [0, 3.15, -L / 2 + 2.6], color: '#7a2f26', finish: 'paint' });
    parts.add(box(0.3, 0.3, 0.3), { at: [0, 3.5, -L / 2 + 2.6], color: '#fff4d6', finish: 'lamp' });
  } else if (kind === 'cruise') {
    hull(parts, L, B, 1.7, -0.75, '#f6f2e6', '#c49a3a', 0.24);
    parts.add(box(B - 0.5, 2.4, L * 0.76), { at: [0, 2.15, -0.8], color: '#f3ead6', finish: 'paint' });
    for (const side of [-1, 1]) parts.add(box(0.06, 1.3, L * 0.72), { at: [side * (B / 2 - 0.23), 2.25, -0.8], color: '#ffd98a', finish: 'lamp' });
    parts.add(box(B - 0.2, 0.2, L * 0.8), { at: [0, 3.45, -0.8], color: '#8e2b20', finish: 'paint' });
    parts.add(box(B - 1.6, 2.0, L * 0.42), { at: [0, 4.55, -2.5], color: '#f3ead6', finish: 'paint' });
    for (const side of [-1, 1]) parts.add(box(0.06, 1.0, L * 0.38), { at: [side * (B / 2 - 0.83), 4.6, -2.5], color: '#ffd98a', finish: 'lamp' });
    parts.add(box(B - 1.2, 0.18, L * 0.46), { at: [0, 5.65, -2.5], color: '#8e2b20', finish: 'paint' });
    // Strings of bulbs from bow to stern over the top deck.
    for (let k = 0; k < 22; k++) {
      const t = k / 21;
      const zz = -L / 2 + 1 + t * (L - 2), yy = 6.1 + Math.sin(t * Math.PI) * 0.9;
      parts.add(new THREE.OctahedronGeometry(0.12, 0), { at: [0, yy, zz], color: ['#ffd25a', '#ff6a5a', '#7adfff', '#9dff7a'][k % 4], finish: 'lamp' });
    }
    parts.rod([0, 3.5, -L / 2 + 1], [0, 6.2, -L / 2 + 1], 0.05, { color: '#cfd3d4', finish: 'metal' });
    parts.rod([0, 3.5, L / 2 - 1.2], [0, 6.2, L / 2 - 1.2], 0.05, { color: '#cfd3d4', finish: 'metal' });
    parts.add(box(0.02, 0.6, 0.9), { at: [0, 6.0, L / 2 - 1.65], color: '#da251d', finish: 'cloth' });
  } else if (kind === 'speedboat') {
    hull(parts, L, B, 0.85, -0.38, '#f4f3ee', '#c8322a', 0.34);
    parts.add(box(B * 0.8, 0.08, L * 0.62), { at: [0, 0.38, -0.5], color: '#d8d2c2', finish: 'cloth' });
    parts.add(box(B * 0.92, 0.12, 0.1), { at: [0, 0.18, L * 0.2], color: '#c8322a', finish: 'paint' });
    // Windscreen, two seats, the wheel and an outboard motor.
    parts.add(box(B * 0.78, 0.5, 0.05), { at: [0, 0.75, 0.55], rot: [-0.45, 0, 0], color: '#5f7f8f', finish: 'glass' });
    for (const sx of [-0.45, 0.45]) {
      parts.add(box(0.62, 0.22, 0.62), { at: [sx, 0.52, -0.6], color: '#2f3a48', finish: 'cloth' });
      parts.add(box(0.62, 0.6, 0.14), { at: [sx, 0.85, -0.95], color: '#2f3a48', finish: 'cloth' });
    }
    parts.add(new THREE.TorusGeometry(0.17, 0.03, 5, 12), { at: [-0.45, 0.9, 0.18], rot: [-0.6, 0, 0], color: '#1d2024', finish: 'rubber', smooth: true });
    parts.add(box(0.5, 0.75, 0.42), { at: [0, 0.6, -L / 2 - 0.1], color: '#1d2024', finish: 'plastic' });
    parts.add(box(0.14, 0.9, 0.18), { at: [0, -0.2, -L / 2 - 0.15], color: '#2b2f33', finish: 'metal' });
    parts.add(box(0.28, 0.12, 0.2), { at: [0, 0.55, L / 2 - 0.5], color: '#fff4d6', finish: 'lamp' });
  } else {
    hull(parts, L, B, 1.1, -0.55, '#2f6fa8', '#c8322a', 0.3);
    deck(parts, L, B, 0.3, 0.46, 0.08, '#9a7a4e');
    parts.add(box(2.0, 1.7, 2.2), { at: [0, 1.4, -L / 2 + 2], color: '#e9e4d6', finish: 'paint' });
    parts.add(box(2.04, 0.6, 2.24), { at: [0, 1.75, -L / 2 + 2], color: '#2d4552', finish: 'glass' });
    parts.add(box(2.4, 0.16, 2.6), { at: [0, 2.3, -L / 2 + 2], color: '#c8322a', finish: 'paint' });
    parts.rod([0, 0.5, 1.2], [0, 5.5, 1.2], 0.07, { color: '#8a6a46', finish: 'cloth' });
    parts.rod([0, 4.8, 1.2], [0, 1.2, 4.4], 0.03, { color: '#cfd3d4', finish: 'metal' });
    parts.add(new THREE.SphereGeometry(0.9, 8, 5).scale(1.4, 0.5, 1), { at: [0, 0.75, 2.6], color: '#5d7a4a', finish: 'cloth' });
    // The painted eyes on both sides of the bow, as on boats from the central coast.
    for (const side of [-1, 1]) {
      parts.add(cyl(0.24, 0.04, 12).rotateZ(Math.PI / 2), { at: [side * (B / 2 - 0.62), 0.25, L / 2 - 1.55], color: '#f4f1e6', finish: 'paint' });
      parts.add(cyl(0.12, 0.05, 10).rotateZ(Math.PI / 2), { at: [side * (B / 2 - 0.6), 0.25, L / 2 - 1.5], color: '#1d1f22', finish: 'paint' });
    }
    // Squatting by the rail, looking out over the water.
    return withPeople(parts.build(), [squatter(0.54, [0.75, 0, 0.2], Math.PI / 2)]);
  }
  return parts.build();
}

/** A V of foam: two bright arms spreading from the stern and a churned middle, fading out behind. */
function wakeTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(64, 128);
  for (let y = 0; y < 128; y++) {
    const t = y / 127; // 0 at the stern, 1 far behind
    const spread = 0.18 + 0.8 * t, fade = Math.pow(1 - t, 1.6);
    for (let x = 0; x < 64; x++) {
      const u = Math.abs(x / 63 - 0.5) * 2;
      const arm = Math.exp(-(((u - spread) / 0.07) ** 2));
      const churn = u < spread ? 0.35 * (1 - u / spread) * Math.max(0, 1 - t * 1.6) : 0;
      const i = (y * 64 + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(Math.min(1, (arm * 0.85 + churn) * fade) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A single hire speedboat (another player's), sharing nothing with the river traffic. */
export function makeBoatMesh() {
  const mesh = new THREE.Mesh(boatGeometry('speedboat'), vehicleMaterial().material);
  mesh.castShadow = true;
  return mesh;
}

/**
 * What the boats need from the game to carry the player (the đò ngang, river bus W2): taking a fare, putting the
 * player down on a pier, a line in the HUD, a speech bubble. Without it (tests) nobody rides them.
 */
export type BoatHost = {
  pay(k: number): boolean;
  place(x: number, z: number, yaw: number): void;
  notify(text: string, ms?: number): void;
  say?(key: string, text: string, at: () => { x: number; y: number; z: number } | null): void;
};
type Provider = { seat(): { x: number; y: number; z: number; yaw: number }; label: string; onLeave(): void; pose?: 'chair' | 'pillion' | 'hidden'; card?: () => { title: string; next: string; hint: string; stops: { name: string; eta: number }[] } };
type Passengers = { board(p: Provider): void; leave(): void };
/** The đò ngang (THU_THIEM_EXTRA.ferry): fare in thousand đồng, rowing pace (m/s), seconds at each landing between crossings. */
export const FERRY = { fare: 5, pace: 0.55, dwell: 45, name: 'ĐÒ NGANG THỦ THIÊM' } as const;
const FARE_WATERBUS = 15;
const fmtEta = (s: number) => (s < 50 ? `${Math.max(5, Math.round(s / 5) * 5)} giây` : `${Math.max(1, Math.round(s / 60))} phút`);

export function createBoats(scene: THREE.Scene, host: BoatHost | null = null) {
  const { material, lamps } = vehicleMaterial();
  const wakeGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
  const wakeMaterial = new THREE.MeshBasicMaterial({ color: '#f2fbf8', transparent: true, opacity: 0.8, depthWrite: false, map: wakeTexture() });
  // Every boat's wake in one draw: each boat keeps its own wake object (position, size, visible) as before, and the
  // shown ones are copied into this batch at the end of update().
  const wakes = new THREE.InstancedMesh(wakeGeometry, wakeMaterial, 64);
  wakes.name = 'Boat wakes';
  wakes.renderOrder = 1;
  wakes.frustumCulled = false;
  wakes.count = 0;
  wakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(wakes);
  function syncWakes() {
    let n = 0;
    for (const b of boats) {
      if (!b.wake.visible || n >= 64) continue;
      b.wake.updateMatrix();
      wakes.setMatrixAt(n++, b.wake.matrix);
    }
    wakes.count = n;
    wakes.instanceMatrix.needsUpdate = true;
  }
  const geometries = new Map<string, THREE.BufferGeometry>();
  const geometryOf = (kind: BoatKind, crew: Crew) => {
    const key = kind === 'sampan' ? `${kind}:${crew}` : kind;
    let g = geometries.get(key);
    if (!g) { g = boatGeometry(kind, crew); geometries.set(key, g); }
    return g;
  };
  /**
   * The river buses' lines: W1 (transit.ts, today's two piers) and on the wired map W2 (the new piers). Built first:
   * the far lanes keep clear of their outer run.
   */
  const w2 = waterbusW2(TERRAIN);
  const waterNet: TransitNetwork = w2
    ? buildNetwork(undefined, [...LINE_SPECS.filter((l) => l.mode === 'waterbus'), w2.line], [...STOP_SPECS.filter((st) => st.mode === 'waterbus'), ...w2.stops])
    : WATER_NET;
  // The river as the live terrain has it when the boats are made (the wired map is installed before the game).
  const plan = lanePlan(TERRAIN, waterNet.lines.map((l) => l.path));
  const boats: Boat[] = [];
  function make(kind: BoatKind, x: number, lane: number, dir: number, cruise: number, mode: Boat['mode'] = 'cruise', weave = 0, crew: Crew = 'rower'): Boat {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometryOf(kind, crew), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const wake = new THREE.Mesh(wakeGeometry, wakeMaterial);
    wake.renderOrder = 1;
    scene.add(group);
    const { length, beam } = SPEC[kind];
    const boat: Boat = {
      kind, x, z: lane, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, speed: mode === 'cruise' ? cruise : 0, cruise, dir, lane, weave,
      half: [beam / 2, length / 2], mode, until: 0, phase: boats.length * 1.7, group, mesh, wake, seat: [-0.45, 0.42, -0.6], bank: 0, crew, moor: null, run: null,
    };
    boats.push(boat);
    return boat;
  }
  // One lane per boat, one direction per lane: from the promenade side out to the far bank.
  make('sampan', 40, LANES.sampanEast, 1, 1.8);
  make('cruise', 120, LANES.cruise, -1, 2.6);
  make('speedboat', -20, LANES.speedEast, 1, 11, 'cruise', 1.2);
  make('speedboat', 300, LANES.speedWest, -1, 10, 'cruise', 1.2);
  make('barge', -120, LANES.barge, 1, 3);
  make('sampan', 210, LANES.sampanWest, -1, 1.6);
  make('fishing', 150, LANES.anchored, -1, 0, 'anchored');
  make('fishing', -40, LANES.anchored, 1, 0, 'anchored');
  // Lane boats start on their lane as the wired map bends it.
  for (const b of boats) if (b.mode === 'cruise') b.z = laneAt(plan, b.lane, b.x);

  /** The river buses, one boat per timetable vehicle of each line, out of sight until their first trip. */
  const timetable = waterNet.lines.length ? createTransit(waterNet) : null;
  const W2_LINE = waterNet.lines.find((l) => l.id === 'W2') ?? null;
  const allBuses = waterNet.lines.flatMap((line) => Array.from({ length: Math.max(1, timetable!.fleet(line.id, 0)) }, (_, v) => {
    const b = make('waterbus', 0, -166, 1, line.spec.cruise, 'idle');
    b.group.visible = b.wake.visible = false;
    b.run = { key: `${line.id}-${v + 1}`, s: 0, visit: 0, stop: null, service: false, trip: null, docked: 0, depot: false, since: 0, line };
    return b;
  }));
  /** Line W1's boats (buses.ts drives its timetable prompts and riders from these), and W2's (ridden through register). */
  const waterbuses = allBuses.filter((b) => b.run!.line === WATER_LINE || b.run!.line!.id === 'W1');
  const w2Buses = allBuses.filter((b) => !waterbuses.includes(b));
  /** The game clock the river buses keep to (buses.ts sets it; until then it runs from 08:00). */
  let clockH = 8, clockDay = 0, clockSet = false, service = true;
  /** The moored đò and fishing ghe (transit.ts MOORINGS), empty until buses.ts puts their people aboard. */
  const moored = MOORINGS.map((m) => {
    const b = make('sampan', m.x, m.z, 1, 0, 'moored', 0, 'none');
    b.yaw = m.yaw;
    b.moor = { id: m.id, yaw: m.yaw, swing: m.kind === 'fishing' ? 0.12 : 0 };
    return b;
  });
  /** The speedboat the player hires; out of sight until it is. */
  const rental = make('speedboat', 0, -150, 1, 0, 'idle');
  rental.group.visible = false;
  rental.wake.visible = false;

  // ---- The đò ngang to Thủ Thiêm (when the far bank is built): a rowed sampan between the two ferry piers ----
  const southPier = TERRAIN.docks.find((d) => d.ferry && d.side === 'S') ?? null, northPier = TERRAIN.docks.find((d) => d.ferry && d.side === 'N') ?? null;
  type FerryState = {
    boat: Boat; at: 'S' | 'N' | 'crossing'; to: 'S' | 'N'; since: number; s: number; path: { pts: number[]; cum: number[]; len: number } | null;
    rider: Provider | null; leaveAt: number;
  };
  let ferry: FerryState | null = null;
  /** Its berths: alongside the An Hòa pier's east face (the moored đò lies on its west face), and the Thủ Thiêm pier's west face, bows to the far bank. */
  const berthS = southPier ? { x: southPier.pier.maxX + 1.1, z: -146.5, yaw: Math.PI } : null;
  const berthN = northPier ? { x: northPier.pier.minX - 1.2, z: -200.1, yaw: Math.PI } : null;
  if (berthS && berthN) {
    const b = make('sampan', berthS.x, berthS.z, 1, 0, 'moored', 0, 'boatman');
    b.yaw = berthS.yaw;
    ferry = { boat: b, at: 'S', to: 'N', since: 0, s: 0, path: null, rider: null, leaveAt: FERRY.dwell };
  }
  /** The crossing from one berth to the other, round the river buses' berths at the pier ends (x,z pairs with arc lengths). */
  function ferryPath(to: 'S' | 'N') {
    const s = berthS!, n = berthN!;
    // Out along the An Hòa pier's east face, across east of the river bus berth, then in along the Thủ Thiêm pier's west face.
    // (along z -149 east of the pier, 4 m clear of a river bus leaving the pier's end; down outside its curve out to the lanes)
    const across = [s.x, s.z, s.x, -148.8, s.x + 16.9, -149.2, s.x + 19.9, -156, s.x + 18.9, -168, s.x + 6.9, -180, n.x + 3.2, -186, n.x, -190, n.x, n.z];
    const pts = to === 'N' ? across : (() => { const back: number[] = []; for (let k = across.length - 2; k >= 0; k -= 2) back.push(across[k], across[k + 1]); return back; })();
    const cum = [0];
    for (let k = 2; k < pts.length; k += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function along(p: { pts: number[]; cum: number[]; len: number }, s: number) {
    s = Math.max(0, Math.min(p.len, s));
    let i = 0;
    while (i + 2 < p.cum.length && p.cum[i + 1] < s) i++;
    const k = i * 2, dx = p.pts[k + 2] - p.pts[k], dz = p.pts[k + 3] - p.pts[k + 1], l = p.cum[i + 1] - p.cum[i] || 1, t = (s - p.cum[i]) / l;
    return { x: p.pts[k] + dx * t, z: p.pts[k + 1] + dz * t, hx: dx / l, hz: dz / l };
  }

  const local = { x: 0, z: 0 };
  /** A point in a boat's frame (x to its right... its own +x, z towards the bow). */
  function toLocal(b: Boat, x: number, z: number) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
    local.x = dx * c - dz * s;
    local.z = dx * s + dz * c;
    return local;
  }
  function shown(b: Boat) { return b.mode !== 'idle'; }
  /** Where the river traffic is kept: round the player (buses.ts passes their position; the game the viewer's). */
  let focusX = (TERRAIN.bounds.minX + TERRAIN.bounds.maxX) / 2;
  const viewer = { x: focusX, z: 0, set: false };
  /** Farther than this from the viewer a boat may appear or vanish (the fog closes at 260 m). */
  const UNSEEN = 300;
  const unseen = (x: number, z: number) => !viewer.set || Math.hypot(x - viewer.x, z - viewer.z) > UNSEEN;
  /** Bob, roll and pitch on the swell, and the wake: a boat drawn where it is now. */
  function pose(b: Boat, time: number) {
    // Small boats bob more than big ones, and the bow lifts at speed.
    const size = Math.min(1, 6 / b.half[1]);
    const bob = Math.sin(time * 1.4 + b.phase) * 0.06 * (0.4 + size);
    const roll = Math.sin(time * 1.1 + b.phase * 1.3) * 0.035 * (0.3 + size);
    const pitch = Math.sin(time * 0.9 + b.phase) * 0.02 * size - (b.kind === 'speedboat' ? Math.min(0.09, Math.abs(b.speed) * 0.007) : 0);
    const level = surface(b.x, b.z);
    b.group.position.set(b.x, level + bob, b.z);
    b.group.rotation.set(pitch, b.yaw, roll + b.bank, 'YXZ');
    // A wake trailing behind, longer and fainter the faster the boat goes.
    const pace = Math.abs(b.speed);
    b.wake.visible = pace > 0.4 && b.group.visible;
    b.wake.position.set(b.x - Math.sin(b.yaw) * b.half[1] * Math.sign(b.speed || 1), level + 0.03, b.z - Math.cos(b.yaw) * b.half[1] * Math.sign(b.speed || 1));
    b.wake.rotation.y = b.yaw + (b.speed < 0 ? Math.PI : 0);
    b.wake.scale.set(b.half[0] * 2 * (1.3 + pace * 0.18), 1, 4 + pace * 2.2);
  }
  const at = new THREE.Vector3();
  function hide(b: Boat) { b.mode = 'idle'; b.speed = 0; b.group.visible = b.wake.visible = false; }
  /**
   * The narrows (plan.narrows): a far-lane boat passes one only when no other far-lane boat holds it, waiting short of
   * its entrance otherwise. Returns the speed it may go at.
   */
  const narrowHolder: (Boat | null)[] = plan ? plan.narrows.map(() => null) : [];
  const FAR_LANES = new Set<number>([LANES.sampanWest, LANES.barge, LANES.speedWest, LANES.speedEast, LANES.cruise]);
  /** A river bus in a narrow's far-side water (calling at a Thủ Thiêm pier) holds it: lane boats wait outside till it leaves. */
  const busIn = (o: Boat, k: number) => { const [a, c] = plan!.narrows[k]; return !!o.run && o.mode !== 'idle' && o.group.visible && o.z < -176 && o.x + o.half[1] > a && o.x - o.half[1] < c; };
  /** Whether a lane boat is in a narrow or coming up to it. */
  function nearNarrow(o: Boat, k: number) {
    const [a, c] = plan!.narrows[k], entry = o.dir > 0 ? a : c, to = (entry - o.x) * o.dir - o.half[1];
    return o.mode === 'cruise' && ((o.x + o.half[1] > a && o.x - o.half[1] < c) || (to >= 0 && to < 30));
  }
  function narrowRule(b: Boat) {
    if (!plan || !plan.narrows.length || !FAR_LANES.has(b.lane)) return Infinity;
    let cap = Infinity;
    const near = (o: Boat, k: number) => (o.run ? busIn(o, k) : nearNarrow(o, k));
    plan.narrows.forEach(([a, c], k) => {
      const inside = b.x + b.half[1] > a && b.x - b.half[1] < c, entry = b.dir > 0 ? a : c, toEntry = (entry - b.x) * b.dir - b.half[1];
      let h = narrowHolder[k];
      if (h && h !== b && !near(h, k)) h = narrowHolder[k] = null;
      if (inside) { if (!h) narrowHolder[k] = b; return; }
      if (h === b) { if (toEntry < 0 || toEntry > 30) narrowHolder[k] = null; return; }
      if (toEntry < 0 || toEntry > 30) return;
      if (h) cap = Math.min(cap, Math.sqrt(2 * 0.5 * Math.max(0, toEntry - 3)));
      else if (toEntry < 12) narrowHolder[k] = b;
    });
    return cap;
  }
  /** Boats that cross the lanes (river buses, the đò ngang) and the player's: lane traffic gives way to them. */
  const crossers: Boat[] = [];
  /** How slow `b` must go for what is ahead of it on its heading: a swimmer, or a boat whose hull is in its way. */
  function giveWay(b: Boat, swimmer: { x: number; z: number } | null, others: readonly Boat[]) {
    let target = Infinity;
    if (swimmer) {
      const p = toLocal(b, swimmer.x, swimmer.z);
      if (p.z > 0 && p.z < b.half[1] + 16 && Math.abs(p.x) < b.half[0] + 2.5) target = 0.3;
    }
    for (const o of others) {
      if (o === b || !shown(o) || !o.group.visible) continue;
      // The đò waiting for this boat to pass is not in its way.
      if (ferry && o === ferry.boat && b.run && inWay(o, b)) continue;
      if (inWay(b, o)) {
        // Two river buses each in the other's way (a head-on in a berth's S-curve): the later key gives way, the other creeps by.
        if (b.run && o.run && inWay(o, b) && b.run.key < o.run.key) { target = Math.min(target, 0.6); continue; }
        const p = toLocal(b, o.x, o.z);
        target = Math.min(target, p.z < b.half[1] + o.half[1] + 4 ? 0 : 0.3);
      }
    }
    return target;
  }
  /** Whether `o`'s hull lies ahead of `b` on its heading, close enough and overlapping its beam (boats in adjacent lanes pass). */
  function inWay(b: Boat, o: Boat) {
    const reach = b.half[1] + o.half[1] + 14;
    if (Math.abs(o.x - b.x) > reach || Math.abs(o.z - b.z) > reach) return false;
    const p = toLocal(b, o.x, o.z), side = Math.abs(Math.sin(o.yaw - b.yaw)), wide = o.half[0] * (1 - side) + o.half[1] * side;
    return p.z > 0 && p.z < reach && Math.abs(p.x) < b.half[0] + wide + 0.5;
  }
  /** How far along its course a river bus still has to go to the pier it is bound for (0 at it). */
  function toCall(o: Boat) {
    const run = o.run!, line = run.line ?? WATER_LINE!, d = pathAhead(line.path, run.s, line.visits[run.visit].s);
    return d > line.path.len - 0.5 ? 0 : d;
  }
  /**
   * Whether river bus `o` keeps `b` (toBerth from the pier `call`) off that pier: one lying alongside it, or one coming
   * in to the same pier ahead of it in the queue (nearer the berth, the lower key on a tie), or one leaving it that is
   * on the move. Never one that is itself waiting for `b` (the queue is a strict order), never one standing still on
   * its way elsewhere, never one the watchdog let go.
   */
  function holdsPier(b: Boat, toBerth: number, call: { x: number; z: number }, o: Boat, time: number) {
    if (o === b || o.mode === 'idle' || !o.run) return false;
    const d = Math.hypot(o.x - call.x, o.z - call.z);
    if (o.mode === 'docked') return d < 6;
    if (d >= 26 || (o.run.free ?? 0) > time) return false;
    const ol = o.run.line ?? WATER_LINE!, ov = ol.visits[o.run.visit];
    if (ov && Math.hypot(ov.stop.x - call.x, ov.stop.z - call.z) < 3) {
      const oTo = toCall(o);
      return oTo < toBerth - 0.5 || (Math.abs(oTo - toBerth) <= 0.5 && o.run.key < b.run!.key);
    }
    return Math.abs(o.speed) > 0.3;
  }
  /**
   * A river bus along its course: in to each pier and alongside it while its timetable stands there, away when the
   * timetable leaves, a little faster when running late, slowing for a swimmer or a boat ahead and holding off a pier
   * another river bus lies at. Far from the player it is where the timetable says; out of service it finishes at its
   * pier, then goes on to the depot out of sight.
   */
  function driveWater(b: Boat, dt: number, time: number, swimmer: { x: number; z: number } | null) {
    const run = b.run!, line = run.line ?? WATER_LINE!, path = line.path, n = line.visits.length, spec = line.spec;
    if (!service) { run.service = false; if (b.mode !== 'idle') hide(b); return; }
    const st = timetable!.vehicle(run.key, clockDay * 24 + clockH);
    const far = Math.abs(b.x - focusX) > 300 || b.mode === 'idle';
    run.service = !!st;
    if (st) { run.trip = st.trip; run.depot = false; }
    if (st && far) {
      // Where the timetable has it (unseen): on the course, or alongside the pier of its call. Another line's boat
      // lying at that pier already: it waits its turn 40 m short of it.
      const call = st.phase === 'run' ? null : line.visits[st.visit];
      const taken = call && allBuses.some((o) => o !== b && o.mode !== 'idle' && Math.hypot(o.x - call.stop.x, o.z - call.stop.z) < (o.mode === 'docked' ? 6 : 26));
      if (taken) {
        // Queued 40 m short of the pier, behind any other bus already waiting there (never two at one spot).
        let s = (call.s - 40 + path.len) % path.len;
        for (let rank = 1; rank < 6; rank++) {
          const q = pathPoint(path, s);
          if (!allBuses.some((o) => o !== b && o.mode !== 'idle' && Math.hypot(o.x - q.x, o.z - q.z) < 14)) break;
          s = (call.s - 40 - 30 * rank + path.len * 2) % path.len;
        }
        Object.assign(run, { s, visit: st.visit, stop: null, docked: time });
      } else Object.assign(run, { s: st.s, visit: st.visit, stop: call ? call.stop.id : null, docked: time });
      b.mode = call && !taken ? 'docked' : 'cruise';
      b.speed = taken ? 0 : st.speed;
      b.group.visible = true;
    } else if (!st && (b.mode === 'idle' || (far && b.mode !== 'docked') || (run.depot && (time - run.since > 120 || Math.abs(b.x - focusX) > 200)))) { hide(b); return; }
    else if (b.mode === 'docked') {
      b.speed = 0;
      // Away once its timetable has left this pier; out of service, off to the depot after a while.
      if (st ? st.visit !== run.visit : time - run.docked > 12) {
        b.mode = 'cruise';
        run.stop = null;
        run.visit = (run.visit + 1) % n;
        if (!st) { run.depot = true; run.since = time; }
      }
    } else if (b.mode === 'cruise') {
      const berth = line.visits[run.visit].s, d = pathAhead(path, run.s, berth), toBerth = d > path.len - 0.5 ? 0 : d;
      if (toBerth < 0.3 && b.speed < 0.6 && !run.depot) {
        Object.assign(run, { s: berth, stop: line.visits[run.visit].stop.id, docked: time });
        b.mode = 'docked';
        b.speed = 0;
      } else {
        // Keep to the timetable: behind it (or its call) a little faster.
        let behind = st ? pathAhead(path, run.s, st.phase === 'run' ? st.s : line.visits[st.visit].s) : 0;
        if (behind > path.len / 2) behind -= path.len;
        let target = spec.cruise * Math.min(1.3, Math.max(0.75, 1 + behind / 60));
        const free = (run.free ?? 0) > time;
        if (!run.depot) {
          target = Math.min(target, Math.sqrt(2 * spec.decel * Math.max(0, toBerth - 0.2)) + 0.15);
          // Another river bus alongside this pier (either line), or ahead in the queue for it: hold off until it leaves.
          const call = line.visits[run.visit].stop;
          if (!free && toBerth < 45 && allBuses.some((o) => holdsPier(b, toBerth, call, o, time))) target = Math.min(target, Math.sqrt(2 * spec.decel * Math.max(0, toBerth - 40)));
        }
        // A swimmer, the player's boat, the đò ngang or another river bus ahead (not one lying at the pier it is coming in to;
        // a bus the watchdog let go minds only the swimmer and the player's boat).
        target = Math.min(target, giveWay(b, swimmer, crossers.filter((o) => (o.mode !== 'docked' || toBerth > 45) && (!free || (!o.run && o !== ferry?.boat)))));
        // A narrow by a Thủ Thiêm pier: held by this bus while it is in it; a lane boat already passing it goes first.
        if (plan) plan.narrows.forEach((_, k) => {
          const h = narrowHolder[k];
          if (busIn(b, k)) { if (!h || (!h.run && !nearNarrow(h, k))) narrowHolder[k] = b; else if (h !== b && !h.run && inWay(b, h)) target = 0; }
          else if (h === b) narrowHolder[k] = null;
        });
        b.speed = THREE.MathUtils.damp(b.speed, target, target < b.speed ? 1.6 : 0.6, dt);
        run.s = (run.s + b.speed * dt) % path.len;
        // Watchdog: two river buses standing still within 30 m of each other for 20 s (a pile-up a clock jump left):
        // the lower key goes on regardless of the other buses for a while.
        if (Math.abs(b.speed) < 0.1 && !swimmerNear(b, swimmer)) {
          if ((run.still ?? -1) < 0) run.still = time;
          else if (time - run.still! > 20 && !free) {
            const other = allBuses.find((o) => o !== b && o.mode !== 'idle' && !!o.run && Math.hypot(o.x - b.x, o.z - b.z) < 30);
            if (other && run.key < other.run!.key) { run.free = time + 25; run.still = -1; }
          }
        } else run.still = -1;
      }
    }
    if (b.mode !== 'cruise') run.still = -1;
    const p = pathPoint(path, run.s);
    b.x = p.x; b.z = p.z; b.yaw = Math.atan2(p.hx, p.hz);
  }
  /** Whether the swimmer (the player in the water) is right by a boat: a bus stopped for them is not stuck. */
  function swimmerNear(b: Boat, swimmer: { x: number; z: number } | null) { return !!swimmer && Math.hypot(swimmer.x - b.x, swimmer.z - b.z) < b.half[1] + 18; }
  /** The đò ngang: rows a crossing every FERRY.dwell seconds at a landing (sooner with a fare aboard), giving way to the river buses. */
  function driveFerry(f: FerryState, dt: number, time: number) {
    const b = f.boat;
    if (!service) {
      // Gone with the rest of the river traffic (zombie mode): back at its An Hòa berth, nobody at the oar.
      if (f.at !== 'S' && !f.rider) Object.assign(f, { at: 'S', to: 'N', path: null, since: time });
    }
    if (f.at !== 'crossing') {
      const berth = f.at === 'S' ? berthS! : berthN!;
      b.x = berth.x; b.z = berth.z; b.speed = 0;
      b.yaw = angleTo(b.yaw, berth.yaw, dt * 0.8);
      const due = f.rider ? f.leaveAt : f.since + FERRY.dwell;
      if (service && time >= due) {
        const path = ferryPath(f.to);
        // Not out from under a river bus coming in to (or lying at) this pier's end.
        const near = f.at === 'S' ? southPier! : northPier!;
        // (a bus stuck standing there for a long while, not alongside, is not waited for)
        const busy = allBuses.some((o) => shown(o) && o.group.visible && Math.abs(o.x - near.x) < 30 && Math.abs(o.z - near.ring.z) < 12
          && (o.mode === 'docked' || Math.abs(o.speed) > 0.1 || (o.run?.still ?? -1) < 0 || time - o.run!.still! < 30));
        if (!busy) Object.assign(f, { at: 'crossing', path, s: 0, since: time });
      }
    } else {
      const path = f.path!, left = path.len - f.s;
      let target = Math.min(FERRY.pace, Math.sqrt(2 * 0.25 * Math.max(0, left - 0.1)) + 0.05);
      // Hold off any river bus ahead of the bow (it goes on: river buses give way to the đò only once it is in their path).
      if (allBuses.some((o) => shown(o) && o.group.visible && inWay(b, o))) target = 0;
      // Swing the bow round first when leaving a landing the other way.
      const heading = Math.atan2(along(path, f.s).hx, along(path, f.s).hz);
      if (Math.abs(Math.atan2(Math.sin(heading - b.yaw), Math.cos(heading - b.yaw))) > 0.6) target = Math.min(target, 0.08);
      b.speed = THREE.MathUtils.damp(b.speed, target, 1.2, dt);
      f.s = Math.min(path.len, f.s + b.speed * dt);
      const q = along(path, f.s);
      b.x = q.x; b.z = q.z;
      b.yaw = angleTo(b.yaw, heading, dt * 0.7);
      if (f.s >= path.len - 0.05) {
        const arrived = f.to;
        Object.assign(f, { at: arrived, to: arrived === 'N' ? 'S' : 'N', path: null, since: time, leaveAt: time + FERRY.dwell });
        b.speed = 0;
        if (f.rider) host?.notify(arrived === 'N' ? 'Tới Bến Đò Thủ Thiêm · nhấn E để lên bến.' : 'Về Bến Đò An Hòa · nhấn E để lên bến.', 3500);
      }
    }
    setCrew(b, f.at === 'crossing' ? 'rowing' : service ? 'boatman' : 'none');
  }
  function setCrew(b: Boat, crew: Crew) {
    if (b.crew === crew) return;
    b.crew = crew;
    b.mesh.geometry = geometryOf(b.kind, crew);
  }

  // ---- Riding W2 and the đò ngang (the passenger API) ----
  let passengers: Passengers | null = null;
  let aboard: { kind: 'w2'; boat: Boat; ring: boolean } | { kind: 'ferry' } | null = null;
  const w2Stops = W2_LINE ? W2_LINE.visits.map((v) => v.stop) : [];
  /** Stops of W2 at today's piers: line W1's prompts (buses.ts) answer there unless a W2 boat lies alongside. */
  const sharedStop = (id: string) => id === 'w2-an-hoa' || id === 'w2-bach-dang';
  function w2Docked(stopId: string) { return allBuses.find((b) => b.run?.line === W2_LINE && b.mode === 'docked' && b.run.stop === stopId && b.run.service) ?? null; }
  function w2Etas(boat: Boat) {
    const line = W2_LINE!, run = boat.run!, out: { name: string; eta: number }[] = [], n = line.visits.length, sph = SECONDS_PER_HOUR;
    let k = boat.mode === 'docked' ? (run.visit + 1) % n : run.visit, from = run.s;
    let eta = boat.mode === 'docked' && run.trip ? Math.max(0, ((run.visit === 0 ? run.trip.depart : run.trip.depart + line.visits[run.visit].depart / sph) - (clockDay * 24 + clockH)) * sph) : 0;
    for (let i = 0; i < Math.min(n, 6); i++, k = (k + 1) % n) {
      eta += pathAhead(line.path, from, line.visits[k].s) / (line.spec.cruise * 0.85) + (i ? line.spec.dwell : 0);
      from = line.visits[k].s;
      out.push({ name: stopTitle(line.visits[k].stop.name), eta });
    }
    return out;
  }
  function getOff(x: number, z: number, yaw: number, text: string) {
    aboard = null;
    passengers?.leave();
    host?.place(x, z, yaw);
    host?.notify(text, 2500);
  }
  function boardW2(boat: Boat) {
    if (!passengers || !host || !W2_LINE) return;
    if (!host.pay(FARE_WATERBUS)) { host.notify(`Vé tàu buýt sông ${FARE_WATERBUS}.000đ, bạn không đủ tiền.`, 2500); return; }
    const state = { kind: 'w2' as const, boat, ring: false };
    aboard = state;
    passengers.board({
      label: 'Tàu buýt sông', pose: 'chair',
      seat: () => worldPoint(boat, WATERBUS_SEAT),
      onLeave: () => {
        if (aboard !== state) return;
        const stop = boat.mode === 'docked' && boat.run?.stop ? w2Stops.find((s) => s.id === boat.run!.stop) : null;
        if (stop) { const north = stop.berth!.z < -170; getOff(stop.wait.x, stop.wait.z + (north ? -0.6 : 0.6), north ? Math.PI : 0, `Lên ${stopTitle(stop.name)}.`); return; }
        if (!state.ring) { state.ring = true; host.notify('Đã báo tài công · xuống ở bến tới.', 2500); }
      },
      card: () => {
        const stops = w2Etas(boat), here = boat.mode === 'docked' && boat.run?.stop ? w2Stops.find((s) => s.id === boat.run!.stop) : null;
        return { title: `Tàu buýt sông · ${stopTitle(W2_LINE.name.replace('TÀU BUÝT SÔNG ', ''))}`, next: here ? `${stopTitle(here.name)} (đang cập bến)` : stops[0]?.name ?? '', hint: here ? 'lên bến ở đây' : state.ring ? 'đã báo xuống ở bến tới' : 'báo xuống ở bến tới', stops };
      },
    });
    host.notify(`Lên tàu buýt sông · ${FARE_WATERBUS}.000đ · ngồi ghế mũi tàu. Nhấn E để báo xuống bến.`, 3500);
  }
  function boardFerry(time: number) {
    if (!passengers || !host || !ferry) return;
    if (!host.pay(FERRY.fare)) { host.notify(`Vé đò ${FERRY.fare}.000đ, bạn không đủ tiền.`, 2500); return; }
    const f = ferry, state = { kind: 'ferry' as const };
    aboard = state;
    f.rider = {
      label: 'Đò ngang', pose: 'chair',
      seat: () => worldPoint(f.boat, SAMPAN_SEAT),
      onLeave: () => {
        if (aboard !== state) return;
        if (f.at === 'crossing') { host.notify('Đò đang qua sông, ngồi yên nha!', 2000); return; }
        const pier = f.at === 'S' ? southPier! : northPier!, x = (pier.pier.minX + pier.pier.maxX) / 2, z = f.at === 'S' ? -146.5 : -200;
        f.rider = null;
        getOff(x, z, f.at === 'S' ? 0 : Math.PI, f.at === 'S' ? 'Lên Bến Đò An Hòa · cảm ơn chú lái đò!' : 'Lên Bến Đò Thủ Thiêm · cảm ơn chú lái đò!');
      },
      card: () => {
        const name = (side: 'S' | 'N') => (side === 'N' ? 'Bến Đò Thủ Thiêm' : 'Bến Đò An Hòa');
        if (f.at === 'crossing') return { title: `Đò ngang · ${f.to === 'N' ? 'An Hòa → Thủ Thiêm' : 'Thủ Thiêm → An Hòa'}`, next: name(f.to), hint: 'ông lái đang chèo, ngồi yên', stops: [{ name: name(f.to), eta: (f.path!.len - f.s) / FERRY.pace }] };
        // At a landing: get off here, or stay for the next crossing to the other side.
        return { title: `Đò ngang · ${name(f.at)}`, next: `${name(f.at)} (đò đang cập bến)`, hint: 'lên bến ở đây', stops: [{ name: name(f.to), eta: Math.max(0, f.leaveAt - clockSeconds) + ferryPath(f.to).len / FERRY.pace }] };
      },
    };
    passengers.board(f.rider);
    // The boatman pushes off a few seconds after a fare sits down.
    f.leaveAt = Math.min(f.leaveAt, time + 6);
    host.say?.('do-ngang', 'Ngồi vững nha, chú chèo đây!', () => { const p = worldPoint(f.boat, [0, 1.6, -1.9]); return { x: p.x, y: p.y, z: p.z }; });
    host.notify(`Lên đò ngang · ${FERRY.fare}.000đ · chừng hai phút qua sông.`, 3500);
  }
  let clockSeconds = 0;
  const dim = (id: string, verb: string, label = '') => ({ id, key: '' as const, verb, label, dim: true });
  /** Seconds until the đò is back at `side` (it is away: crossing, or at the other landing). */
  function ferryWait(side: 'S' | 'N') {
    const f = ferry!;
    if (f.at === side) return 0;
    return f.at === 'crossing'
      ? (f.path!.len - f.s) / FERRY.pace + (f.to === side ? 0 : FERRY.dwell + ferryPath(f.to === 'N' ? 'S' : 'N').len / FERRY.pace)
      : Math.max(0, f.leaveAt - clockSeconds) + ferryPath(side).len / FERRY.pace;
  }
  function ferryEntry(side: 'S' | 'N'): Entry {
    const id = `boats:do-ngang:${side}`, berth = side === 'S' ? berthS! : berthN!;
    return {
      id, kind: 'boat', x: side === 'S' ? berth.x - 1.6 : berth.x + 1.7, z: berth.z, r: 3, when: 'foot', priority: 74,
      prompt(c) {
        const f = ferry!;
        if (aboard) return null;
        if (c.zombie || !service) return dim(id, 'Đò ngang ngừng chạy', 'bến vắng tanh');
        // Away: when it is back is the answer at its own berth (E repeats it), ahead of the river bus timetable on the same pier.
        if (f.at !== side) return { id, key: 'E', verb: 'Đò ngang', label: `đang ${f.at === 'crossing' ? 'qua sông' : 'ở bờ bên kia'} · quay lại sau ~${fmtEta(ferryWait(side))}` };
        if (c.wanted > 0) return dim(id, 'Đi đò ngang', 'chú lái không chở người bị công an truy');
        if (c.cash < FERRY.fare) return dim(id, 'Đi đò ngang', `cần ${FERRY.fare}.000đ`);
        return { id, key: 'E', verb: 'Đi đò ngang', label: side === 'S' ? 'sang Bến Đò Thủ Thiêm' : 'về Bến Đò An Hòa', price: FERRY.fare };
      },
      use(c) {
        const f = ferry!;
        if (f.at !== side) { if (!c.zombie && service) host?.notify(`Đò ngang ${f.at === 'crossing' ? 'đang qua sông' : 'đang ở bờ bên kia'} · quay lại sau ~${fmtEta(ferryWait(side))}. Vé ${FERRY.fare}.000đ.`, 3500); return; }
        if (!aboard && !c.zombie && service && c.wanted === 0) boardFerry(clockSeconds);
      },
    };
  }
  function w2Entry(stop: (typeof w2Stops)[number]): Entry {
    const id = `boats:pier:${stop.id}`, shared = sharedStop(stop.id);
    const next = (from: string) => { const i = w2Stops.findIndex((s) => s.id === from); return w2Stops[(i + 1) % w2Stops.length]; };
    return {
      id, kind: 'transit', x: stop.wait.x, z: stop.wait.z, r: 4, priority: shared ? 78 : 72,
      prompt(c) {
        if (aboard) return null;
        if (c.zombie || !service) return shared ? null : dim(id, 'Tàu buýt sông ngừng chạy', 'bến bỏ hoang');
        const boat = w2Docked(stop.id);
        if (boat) {
          if (c.wanted > 0) return dim(id, 'Lên tàu buýt sông', 'không chở người bị công an truy');
          if (c.cash < FARE_WATERBUS) return dim(id, 'Lên tàu buýt sông', `cần ${FARE_WATERBUS}.000đ`);
          return { id, key: 'E', verb: 'Lên tàu buýt sông', label: `đi ${stopTitle(next(stop.id).name)}`, price: FARE_WATERBUS };
        }
        if (shared) return null;
        const list = timetable!.arrivals(stop.id, clockDay * 24 + clockH, 2);
        return { id, key: 'E', verb: 'Xem giờ tàu buýt sông', label: list[0] ? `tàu tới sau ~${fmtEta(list[0].eta)}` : 'hết chuyến hôm nay' };
      },
      use(c) {
        const boat = w2Docked(stop.id);
        if (boat) { if (c.wanted === 0) boardW2(boat); return; }
        const list = timetable!.arrivals(stop.id, clockDay * 24 + clockH, 3);
        host?.notify(`${stopTitle(stop.name)} · ${stopTitle(W2_LINE!.name.replace('TÀU BUÝT SÔNG ', 'tàu buýt sông '))} · ${list.map((a) => `tàu ${fmtEta(a.eta)}`).join(' · ') || 'hết chuyến hôm nay'}. Vé ${FARE_WATERBUS}.000đ.`, 5000);
      },
    };
  }
  function worldPoint(b: Boat, p: Vec3) {
    b.group.updateMatrixWorld();
    at.set(p[0], p[1], p[2]).applyMatrix4(b.group.matrixWorld);
    return { x: at.x, y: at.y, z: at.z, yaw: b.yaw };
  }

  return {
    boats,
    rental,
    waterbuses,
    /** Line W2's boats (the wired map's new piers; empty on today's map). */
    w2Buses,
    moored,
    /** The đò ngang to Thủ Thiêm (null before the far bank is built). */
    ferry: ferry?.boat ?? null,
    /** The river bus lines the boats run (W1, and W2 on the wired map), for buses.ts's timetables and prompts. */
    waterNet,
    /** The wired map's lane windows and lines (null on today's map), for checks and tools. */
    lanes: plan,
    /** The boat whose hull (grown by `radius`) covers a point, ignoring `except`. */
    hit(x: number, z: number, radius: number, except: Boat | null = null) {
      for (const b of boats) {
        if (b === except || !shown(b)) continue;
        if (Math.abs(x - b.x) > b.half[1] + radius + 1 || Math.abs(z - b.z) > b.half[1] + radius + 1) continue;
        const p = toLocal(b, x, z);
        if (Math.abs(p.x) < b.half[0] + radius && Math.abs(p.z) < b.half[1] + radius) return b;
      }
      return null;
    },
    /** Pushes a point (a swimmer) out of any hull it is inside; returns the boat that pushed, if any. */
    pushOut(point: { x: number; z: number }, radius: number, except: Boat | null = null) {
      for (const b of boats) {
        if (b === except || !shown(b)) continue;
        if (Math.abs(point.x - b.x) > b.half[1] + radius + 1 || Math.abs(point.z - b.z) > b.half[1] + radius + 1) continue;
        const p = toLocal(b, point.x, point.z);
        const ox = b.half[0] + radius - Math.abs(p.x), oz = b.half[1] + radius - Math.abs(p.z);
        if (ox <= 0 || oz <= 0) continue;
        // Out through the nearer side, back in world space.
        const lx = ox < oz ? Math.sign(p.x || 1) * ox : 0, lz = ox < oz ? 0 : Math.sign(p.z || 1) * oz;
        const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
        point.x += lx * c + lz * s;
        point.z += -lx * s + lz * c;
        return b;
      }
      return null;
    },
    /** Puts the hire boat in the water beside a dock, bow out to the river. */
    launch(x: number, z: number, yaw: number) {
      Object.assign(rental, { x, z, yaw, speed: 0, mode: 'player' as const });
      rental.group.visible = true;
      rental.wake.visible = true;
    },
    /** Takes the hire boat back (it drifts no more). */
    dock() { rental.mode = 'idle'; rental.group.visible = false; rental.wake.visible = false; },
    /** Where the river traffic goes round: kept within WRAP_REACH of this point along the river (the player). */
    setFocus(x: number) { focusX = x; },
    /** Where the player (the camera) is: a boat appears or vanishes only farther than UNSEEN from it. */
    setViewer(x: number, z: number) { viewer.x = x; viewer.z = z; viewer.set = true; },
    /** The game clock (hours of the day and day count) the river buses keep to. */
    setClock(hours: number, day: number) { clockH = hours; clockDay = day; clockSet = true; },
    /** The river bus runs (false: zombie mode, it is gone from the river). */
    setService(on: boolean) { service = on; },
    /** Who is aboard a moored sampan (the boatman, the fisherman, nobody). */
    setCrew,
    /** Takes a moored boat out on the water (the đò setting off with a fare), or back to its mooring (null). */
    cast(b: Boat, to: { x: number; z: number; yaw: number; speed: number } | null, time: number) {
      if (!b.moor) return;
      if (to) Object.assign(b, { x: to.x, z: to.z, yaw: to.yaw, speed: to.speed });
      else {
        const m = MOORINGS.find((q) => q.id === b.moor!.id)!;
        Object.assign(b, { x: m.x, z: m.z, yaw: m.yaw, speed: 0 });
      }
      pose(b, time);
    },
    /** A point in a boat's own frame (x left, y up from the waterline, z to the bow) where it is drawn now, and its heading. */
    worldPoint,
    /** The game wires the registry and its passenger API in here: the đò ngang's landings and W2's piers. */
    register(registry: Registry, p: Passengers) {
      passengers = p;
      if (ferry && host) { registry.add(ferryEntry('S')); registry.add(ferryEntry('N')); }
      if (W2_LINE && host) for (const stop of w2Stops) registry.add(w2Entry(stop));
    },
    /** `swimmer` is the player in the water (or in the hire boat): river traffic slows down for them. */
    update(dt: number, time: number, swimmer: { x: number; z: number } | null, viewAt: { x: number; z: number } | null = null) {
      clockSeconds = time;
      if (viewAt) { viewer.x = viewAt.x; viewer.z = viewAt.z; viewer.set = true; }
      if (!clockSet) { clockH += dt / SECONDS_PER_HOUR; if (clockH >= 24) { clockH -= 24; clockDay++; } }
      crossers.length = 0;
      for (const b of allBuses) if (shown(b)) crossers.push(b);
      if (ferry && ferry.at === 'crossing') crossers.push(ferry.boat);
      if (rental.mode === 'player') crossers.push(rental);
      for (const b of allBuses) driveWater(b, dt, time, swimmer);
      if (ferry) driveFerry(ferry, dt, time);
      for (const b of boats) {
        if (b.mode === 'idle' || b.run) { if (b.run && b.mode !== 'idle') pose(b, time); continue; }
        if (ferry && b === ferry.boat) { pose(b, time); continue; }
        if (b.mode === 'cruise') {
          // A lane boat holding a narrow goes on through it whatever river bus is ahead (the bus waits for it).
          const cap = narrowRule(b), holding = narrowHolder.includes(b);
          let target = Math.min(b.cruise, giveWay(b, swimmer, holding ? crossers.filter((o) => !o.run) : crossers), cap);
          // The end of the lane's window: go round out of sight, or wait there while the player can see it.
          const win = plan?.windows.get(b.lane), lo = Math.max(win?.[0] ?? plan?.west ?? -Infinity, focusX - WRAP_REACH), hi = Math.min(win?.[1] ?? plan?.east ?? Infinity, focusX + WRAP_REACH);
          const end = b.dir > 0 ? hi : lo, other = b.dir > 0 ? lo : hi, toEnd = (end - b.x) * b.dir;
          const canWrap = !plan || (unseen(end, laneAt(plan, b.lane, end)) && unseen(other, laneAt(plan, b.lane, other)));
          if (plan && !canWrap && toEnd < 40) target = Math.min(target, Math.sqrt(2 * 0.4 * Math.max(0, toEnd - 1)));
          b.speed = THREE.MathUtils.damp(b.speed, target, target < b.speed ? 1.6 : 0.6, dt);
          b.x += b.dir * b.speed * dt;
          // Round the far side of the river from the player, well out of sight (on the wired map only past the
          // window's end when neither end can be seen; until then it waits at the end).
          if (!plan) {
            if (b.x - focusX > WRAP_REACH) b.x -= 2 * WRAP_REACH;
            else if (b.x - focusX < -WRAP_REACH) b.x += 2 * WRAP_REACH;
          } else if ((b.dir > 0 ? b.x > hi : b.x < lo) && canWrap) b.x = other + Math.max(-2, Math.min(2, b.x - end));
          const lane = laneAt(plan, b.lane, b.x), slope = plan ? (laneAt(plan, b.lane, b.x + b.dir * 2) - laneAt(plan, b.lane, b.x - b.dir * 2)) / 4 : 0;
          b.z = lane + Math.sin(time * 0.35 + b.phase) * b.weave;
          // Heading follows the motion: along the lane, swinging a little with the weave and where the lane bends.
          b.yaw = Math.atan2(b.dir * Math.max(0.5, b.speed), Math.cos(time * 0.35 + b.phase) * b.weave * 0.35 + slope * Math.max(0.5, b.speed));
        } else if (b.mode === 'anchored') {
          // Swinging slowly on its anchor rope.
          // Riding to its anchor along the current, close in by the far wall (out of the far lane).
          b.yaw = (b.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(time * 0.07 + b.phase) * 0.03;
        } else if (b.mode === 'moored' && b.moor && b.speed === 0) b.yaw = b.moor.yaw + Math.sin(time * 0.09 + b.phase) * b.moor.swing;
        pose(b, time);
      }
      syncWakes();
    },
    /** Cabin windows, deck lights and bulbs glow after dark. */
    setNight(night: number) { lamps.value = 0.15 + night * 1.1; },
    /** Whether a point is open water a boat can be in (inside the buoys, clear of piers, steps and the moored ship). */
    water(x: number, z: number, margin: number) { return navigable(x, z, margin); },
    dispose() {
      for (const b of boats) scene.remove(b.group, b.wake);
      for (const g of geometries.values()) g.dispose();
      wakeGeometry.dispose();
      wakeMaterial.map?.dispose();
      wakeMaterial.dispose();
      material.dispose();
    },
  };
}
/** Turns `from` towards `to` (radians) by at most `step`. */
function angleTo(from: number, to: number, step: number) {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return Math.abs(d) <= step ? to : from + Math.sign(d) * step;
}
export type Boats = ReturnType<typeof createBoats>;
