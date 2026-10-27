/**
 * The cargo ship moored in the Khánh Hội basin (stamps.ts 'cargo-ship', QUAN_4_EXTRA.ship) as one layout that the
 * terrain (its deck and gangway are decks, its tyre fenders and pilot ladder are climbing points), the wiring (the
 * bridge house and container stacks are colliders) and the renderer (district-render.ts ship) all read, so what is
 * drawn is what can be walked. Pure data and maths (no three.js).
 *
 * The hull lies broadside to the wharf: its length along the ship's own x (yaw 0: along world x), its quay side at
 * +lz. The deck stands WATER_LEVEL + 4.2 (plus its 0.2 m plating); the bridge house is aft (2 m of deck either side
 * of it), the containers stand in two rows of stacks either side of the centre line, so a walkway about 3 m wide runs
 * along each side; the stack in line with the gangway is left out, so the gangway lands on open deck.
 */
import { WATER_LEVEL } from './consts.ts';

export type ShipSpec = {
  x: number; z: number; w: number; d: number; yaw: number; name: string;
  /** From its foot on the quay (a) to where it meets the hull's side (b). */
  gangway?: { ax: number; az: number; bx: number; bz: number };
  moor?: { lines: readonly { ax: number; az: number; bx: number; bz: number }[]; fenders: readonly { x: number; z: number }[]; ladder: { x: number; z: number; yaw: number } };
};
/** An oriented box on the ship: centre, half sizes along the ship's length (hx) and across it (hz), from y0 up h. */
export type ShipBox = { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; h: number; color: number };
/** A point a swimmer climbs out at (x, z), and where on the deck it puts them (toX, toZ). */
export type ShipClimb = { x: number; z: number; toX: number; toZ: number; name: string };
export type ShipLayout = {
  /** The deck's plating top, and its outline (x,z pairs): the whole hull inside the bulwarks, bow included. */
  top: number; deckY: number; deck: number[];
  /** The gangway's walkable ramp (x,z pairs) and its surface height along it; null without one. */
  gangway: { poly: number[]; ax: number; az: number; bx: number; bz: number; y0: number; y1: number } | null;
  house: ShipBox; stacks: ShipBox[];
  climbs: ShipClimb[];
  /** Railing runs along the deck's edges (x,z pairs each), open where the gangway lands. */
  rails: number[][];
  /** Local-to-world: a point at (lx, lz) of the ship's frame. */
  at(lx: number, lz: number): { x: number; z: number };
};
/** Height of the gangway's foot (street level on the quay). */
const QUAY_Y = 0.1;
/** A hashed 0..1 per stack (the stacks' heights and colours never depend on any other draw). */
function hash01(k: number) {
  let h = Math.imul(k ^ 0x9e3779b1, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function cargoShipLayout(s: ShipSpec): ShipLayout {
  const L = s.w, B = s.d, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  const at = (lx: number, lz: number) => ({ x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c });
  const local = (x: number, z: number) => ({ x: (x - s.x) * c - (z - s.z) * sn, z: (x - s.x) * sn + (z - s.z) * c });
  const deckY = WATER_LEVEL + 4.2, top = deckY + 0.2;
  const ring = (pts: [number, number][]) => pts.flatMap(([lx, lz]) => { const p = at(lx, lz); return [p.x, p.z]; });
  // The deck: the plating over the hull's box (its bow cone beyond L/2 - 3 is not walked).
  const deck = ring([[-L / 2 + 3, -B / 2 + 0.2], [L / 2 - 3, -B / 2 + 0.2], [L / 2 - 3, B / 2 - 0.2], [-L / 2 + 3, B / 2 - 0.2]]);
  const box = (lx: number, lz: number, w: number, d: number, y0: number, h: number, color: number): ShipBox => { const p = at(lx, lz); return { cx: p.x, cz: p.z, hx: w / 2, hz: d / 2, yaw: s.yaw, y0, h, color }; };
  const house = box(-L / 2 + 10, 0, 10, B - 4, top, 12, 0);
  const g = s.gangway ? local(s.gangway.bx, s.gangway.bz) : null;
  const stacks: ShipBox[] = [];
  let k = 0;
  for (let lx = -L / 2 + 20; lx < L / 2 - 10; lx += 6.3) {
    k++;
    // The gangway lands on open deck.
    if (g && Math.abs(lx - g.x) < 3.03 + 2.2) continue;
    for (const row of [-1, 1]) {
      const r = hash01(k * 7 + (row > 0 ? 3 : 0));
      const tiers = 1 + Math.floor(r * 3);
      stacks.push(box(lx, row * 2.45, 6.06, 4.78, top, tiers * 2.6, Math.floor(hash01(k * 13 + row + 5) * 64)));
    }
  }
  let gangway: ShipLayout['gangway'] = null;
  const climbs: ShipClimb[] = [];
  if (s.gangway) {
    const { ax, az, bx, bz } = s.gangway, len = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / len, uz = (bz - az) / len, px = -uz * 0.7, pz = ux * 0.7;
    // From 0.8 m back on the quay to 1.2 m in over the deck.
    const a0x = ax - ux * 0.8, a0z = az - uz * 0.8, b1x = bx + ux * 1.2, b1z = bz + uz * 1.2;
    gangway = { poly: [a0x + px, a0z + pz, b1x + px, b1z + pz, b1x - px, b1z - pz, a0x - px, a0z - pz], ax, az, bx, bz, y0: QUAY_Y, y1: top };
  }
  if (s.moor) {
    // Tyre fenders hang down the quay side; each is a way up onto the deck beside it (clear of the bridge house).
    s.moor.fenders.forEach((f, i) => {
      const lf = local(f.x, f.z), side = Math.sign(lf.z) || 1;
      const to = at(Math.max(-L / 2 + 3.8, Math.min(L / 2 - 3.8, lf.x)), side * (B / 2 - 1));
      climbs.push({ x: f.x, z: f.z, toX: to.x, toZ: to.z, name: `fender-${i}` });
    });
    const l = s.moor.ladder, ll = local(l.x, l.z), side = Math.sign(ll.z) || -1, to = at(ll.x, side * (B / 2 - 1));
    climbs.push({ x: l.x, z: l.z, toX: to.x, toZ: to.z, name: 'pilot-ladder' });
  }
  // Railings: both long sides (the quay side open at the gangway), the stern and the bow.
  const rails: number[][] = [];
  const quaySide = B / 2 - 0.3, riverSide = -B / 2 + 0.3;
  const gx = g && g.z > 0 ? g.x : null;
  if (gx === null) rails.push(ring([[-L / 2 + 3, quaySide], [L / 2 - 3, quaySide]]));
  else { rails.push(ring([[-L / 2 + 3, quaySide], [gx - 0.9, quaySide]])); rails.push(ring([[gx + 0.9, quaySide], [L / 2 - 3, quaySide]])); }
  rails.push(ring([[-L / 2 + 3, riverSide], [L / 2 - 3, riverSide]]));
  rails.push(ring([[-L / 2 + 3.1, riverSide], [-L / 2 + 3.1, quaySide]]));
  rails.push(ring([[L / 2 - 3.1, quaySide], [L / 2 - 3.1, riverSide]]));
  return { top, deckY, deck, gangway, house, stacks, climbs, rails, at };
}
/** The gangway's surface at a point along it: the quay's level at its foot rising evenly to the deck where it meets the hull. */
export function gangwayY(gw: NonNullable<ShipLayout['gangway']>, x: number, z: number) {
  const len = Math.hypot(gw.bx - gw.ax, gw.bz - gw.az) || 1, t = ((x - gw.ax) * (gw.bx - gw.ax) + (z - gw.az) * (gw.bz - gw.az)) / (len * len);
  return gw.y0 + (gw.y1 - gw.y0) * Math.max(0, Math.min(1, t));
}
