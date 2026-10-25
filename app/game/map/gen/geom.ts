/**
 * Plane geometry for the district generator and its validator: oriented boxes (the game's yaw convention: forward
 * (sin yaw, cos yaw), right (cos yaw, -sin yaw), as collision.ts addBox), polygons and polylines as flat x,z
 * pairs. Pure maths, no allocation in the hot tests (box corners go into a reused scratch array).
 */

/** An oriented box: centre, half-size across (along right) and deep (along forward), and the yaw it faces. */
export type OBB = { cx: number; cz: number; hx: number; hz: number; yaw: number };
export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

export const r2 = (v: number) => Math.round(v * 100) / 100;
/**
 * Length of (x, z). Math.hypot is not specified to the last bit and differs between engines (Node and Chrome
 * disagreed on lot yaws); sqrt is correctly rounded everywhere, so generated layouts match across browsers.
 */
export const hyp = (x: number, z: number) => Math.sqrt(x * x + z * z);
/** Angles keep six decimals, so axis-aligned yaws stay axis-aligned to well under a millimetre. */
export const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
/** yaw of a direction (0 faces +z, PI/2 faces +x). */
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
/** Right of a heading as roads.ts measures it: (-hz, hx). */
export const rightOf = (hx: number, hz: number) => [-hz, hx] as const;

const C = new Float64Array(16);
/** Corners of a box into `out` (x,z pairs, 4 corners) starting at `at`. */
export function corners(b: OBB, out: Float64Array | number[] = C, at = 0) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  // right (c, -s) * hx, forward (s, c) * hz
  const rx = c * b.hx, rz = -s * b.hx, fx = s * b.hz, fz = c * b.hz;
  out[at] = b.cx - rx - fx; out[at + 1] = b.cz - rz - fz;
  out[at + 2] = b.cx + rx - fx; out[at + 3] = b.cz + rz - fz;
  out[at + 4] = b.cx + rx + fx; out[at + 5] = b.cz + rz + fz;
  out[at + 6] = b.cx - rx + fx; out[at + 7] = b.cz - rz + fz;
  return out;
}
export function boxOf(b: OBB): Box {
  const s = Math.abs(Math.sin(b.yaw)), c = Math.abs(Math.cos(b.yaw));
  const ex = c * b.hx + s * b.hz, ez = s * b.hx + c * b.hz;
  return { minX: b.cx - ex, maxX: b.cx + ex, minZ: b.cz - ez, maxZ: b.cz + ez };
}
/** Whether two boxes overlap by more than `tol` (touching boxes, shared party walls, do not). */
export function obbOverlap(a: OBB, b: OBB, tol = 0.02) {
  const dx = b.cx - a.cx, dz = b.cz - a.cz, reach = a.hx + a.hz + b.hx + b.hz;
  if (dx > reach || -dx > reach || dz > reach || -dz > reach) return false;
  // Separating axes: right (c, -s) and forward (s, c) of each box.
  for (let k = 0; k < 2; k++) {
    const yaw = k ? b.yaw : a.yaw, s = Math.sin(yaw), c = Math.cos(yaw);
    if (Math.abs(dx * c - dz * s) >= projHalf(a, c, -s) + projHalf(b, c, -s) - tol) return false;
    if (Math.abs(dx * s + dz * c) >= projHalf(a, s, c) + projHalf(b, s, c) - tol) return false;
  }
  return true;
}
/** Half the extent of a box projected on a unit axis. */
function projHalf(b: OBB, ux: number, uz: number) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  return Math.abs(c * ux - s * uz) * b.hx + Math.abs(s * ux + c * uz) * b.hz;
}
/** The box grown by `pad` on every side. */
export const grow = (b: OBB, pad: number): OBB => ({ cx: b.cx, cz: b.cz, hx: b.hx + pad, hz: b.hz + pad, yaw: b.yaw });
/** Whether a point lies in a box grown by `pad`. */
export function inOBB(b: OBB, x: number, z: number, pad = 0) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw), dx = x - b.cx, dz = z - b.cz;
  return Math.abs(dx * c - dz * s) <= b.hx + pad && Math.abs(dx * s + dz * c) <= b.hz + pad;
}
/** Distance from a point to a box (0 inside). */
export function obbPointDist(b: OBB, x: number, z: number) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw), dx = x - b.cx, dz = z - b.cz;
  const lx = Math.max(0, Math.abs(dx * c - dz * s) - b.hx), lz = Math.max(0, Math.abs(dx * s + dz * c) - b.hz);
  return hyp(lx, lz);
}

/** Distance from (x, z) to segment a-b. */
export function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
  return hyp(x - ax - vx * t, z - az - vz * t);
}
/** Where segments p and q cross: [t, u] along each (0..1), or null (parallel or apart). */
export function segCross(px: number, pz: number, p2x: number, p2z: number, qx: number, qz: number, q2x: number, q2z: number, eps = 1e-9): [number, number] | null {
  const rx = p2x - px, rz = p2z - pz, sx = q2x - qx, sz = q2z - qz, d = rx * sz - rz * sx;
  if (Math.abs(d) < eps) return null;
  const t = ((qx - px) * sz - (qz - pz) * sx) / d, u = ((qx - px) * rz - (qz - pz) * rx) / d;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [t, u] : null;
}
/** Distance between segments a-b and c-d (0 when they cross). */
export function segSegDist(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  if (segCross(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
  return Math.min(segDist(ax, az, cx, cz, dx, dz), segDist(bx, bz, cx, cz, dx, dz), segDist(cx, cz, ax, az, bx, bz), segDist(dx, dz, ax, az, bx, bz));
}
/** Distance from a box to segment a-b (0 when they touch). */
export function obbSegDist(b: OBB, ax: number, az: number, bx: number, bz: number) {
  if (inOBB(b, ax, az) || inOBB(b, bx, bz)) return 0;
  const k = corners(b);
  let d = Infinity;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    d = Math.min(d, segSegDist(k[i * 2], k[i * 2 + 1], k[j * 2], k[j * 2 + 1], ax, az, bx, bz));
    if (d === 0) return 0;
  }
  return d;
}
/** Distance from a box to a polyline (x,z pairs). */
export function obbPolylineDist(b: OBB, pts: readonly number[]) {
  let d = Infinity;
  for (let k = 0; k + 3 < pts.length; k += 2) d = Math.min(d, obbSegDist(b, pts[k], pts[k + 1], pts[k + 2], pts[k + 3]));
  return d;
}

/** Signed area (x,z shoelace; positive for the faces blocks.ts walks, whose inside is on the right of each side). */
export function polyArea(poly: readonly number[]) {
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i += 2) { const j = (i + 2) % n; a += poly[i] * poly[j + 1] - poly[j] * poly[i + 1]; }
  return a / 2;
}
/** Crossing-number point-in-polygon. */
export function inPoly(poly: readonly number[], x: number, z: number) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = poly[i], zi = poly[i + 1], xj = poly[j], zj = poly[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** Distance from a point to a polygon's outline. */
export function polyEdgeDist(poly: readonly number[], x: number, z: number) {
  let d = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i += 2) { const j = (i + 2) % n; d = Math.min(d, segDist(x, z, poly[i], poly[i + 1], poly[j], poly[j + 1])); }
  return d;
}
/** Whether a box lies inside a polygon with `margin` to spare. */
export function obbInPoly(b: OBB, poly: readonly number[], margin = 0) {
  const k = corners(b);
  for (let i = 0; i < 8; i += 2) if (!inPoly(poly, k[i], k[i + 1]) || (margin > 0 && polyEdgeDist(poly, k[i], k[i + 1]) < margin)) return false;
  const n = poly.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    // A polygon vertex inside the box or an outline crossing a box side: a reflex corner bites into it.
    if (inOBB(b, poly[i], poly[i + 1], -1e-6)) return false;
    for (let c = 0; c < 4; c++) {
      const d = (c + 1) % 4, hit = segCross(k[c * 2], k[c * 2 + 1], k[d * 2], k[d * 2 + 1], poly[i], poly[i + 1], poly[j], poly[j + 1]);
      if (hit && hit[0] > 1e-6 && hit[0] < 1 - 1e-6 && hit[1] > 1e-6 && hit[1] < 1 - 1e-6) return false;
    }
  }
  return true;
}
/** Whether a box and a polygon share any area (beyond `tol`). */
export function obbPolyOverlap(b: OBB, poly: readonly number[], tol = 0.02) {
  const inner = grow(b, -tol);
  const k = corners(inner);
  for (let i = 0; i < 8; i += 2) if (inPoly(poly, k[i], k[i + 1])) return true;
  if (inPoly(poly, inner.cx, inner.cz)) return true;
  const n = poly.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    if (inOBB(inner, poly[i], poly[i + 1])) return true;
    if (obbSegDist(inner, poly[i], poly[i + 1], poly[j], poly[j + 1]) === 0) return true;
  }
  return false;
}

/** Closest point of a polyline: arc length s, signed offset (+: right of travel, roads.ts), distance, tangent. */
export type PolyHit = { s: number; off: number; d: number; x: number; z: number; hx: number; hz: number };
export function polylineHit(pts: readonly number[], x: number, z: number): PolyHit {
  let best: PolyHit = { s: 0, off: 0, d: Infinity, x: pts[0], z: pts[1], hx: 1, hz: 0 };
  let run = 0;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const ax = pts[k], az = pts[k + 1], dx = pts[k + 2] - ax, dz = pts[k + 3] - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2) || 1;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const qx = ax + dx * t, qz = az + dz * t, d = hyp(x - qx, z - qz);
    if (d < best.d) {
      const hx = dx / l, hz = dz / l;
      best = { s: run + t * l, off: (x - qx) * -hz + (z - qz) * hx, d, x: qx, z: qz, hx, hz };
    }
    run += l;
  }
  return best;
}
export function polylineLength(pts: readonly number[]) {
  let l = 0;
  for (let k = 0; k + 3 < pts.length; k += 2) l += hyp(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]);
  return l;
}
/** Point and unit tangent at arc length s along a polyline (clamped). */
export function polylineAt(pts: readonly number[], s: number) {
  let run = 0;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const dx = pts[k + 2] - pts[k], dz = pts[k + 3] - pts[k + 1], l = hyp(dx, dz);
    if (s <= run + l || k + 4 >= pts.length) {
      const t = l > 0 ? Math.max(0, Math.min(1, (s - run) / l)) : 0;
      return { x: pts[k] + dx * t, z: pts[k + 1] + dz * t, hx: l > 0 ? dx / l : 1, hz: l > 0 ? dz / l : 0 };
    }
    run += l;
  }
  return { x: pts[0], z: pts[1], hx: 1, hz: 0 };
}
/** The part of a polyline between arc lengths s0 < s1. */
export function polylineSlice(pts: readonly number[], s0: number, s1: number) {
  const a = polylineAt(pts, s0), out = [a.x, a.z];
  let run = 0;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    run += hyp(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]);
    if (run > s0 + 1e-6 && run < s1 - 1e-6) out.push(pts[k + 2], pts[k + 3]);
  }
  const b = polylineAt(pts, s1);
  out.push(b.x, b.z);
  return out;
}
/** Arc-length intervals of a polyline inside a polygon (sorted, merged). */
export function polylineInside(pts: readonly number[], poly: readonly number[]): [number, number][] {
  const cuts: number[] = [0];
  let run = 0;
  const n = poly.length;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const l = hyp(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]);
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n, hit = segCross(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], poly[i], poly[i + 1], poly[j], poly[j + 1]);
      if (hit) cuts.push(run + hit[0] * l);
    }
    run += l;
  }
  cuts.push(run);
  cuts.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    if (cuts[i + 1] - cuts[i] < 1e-6) continue;
    const m = polylineAt(pts, (cuts[i] + cuts[i + 1]) / 2);
    if (!inPoly(poly, m.x, m.z)) continue;
    const last = out[out.length - 1];
    if (last && cuts[i] - last[1] < 1e-6) last[1] = cuts[i + 1]; else out.push([cuts[i], cuts[i + 1]]);
  }
  return out;
}

/**
 * A polygon (inside on the right of each side, as blocks.ts walks faces) moved in by `offs[i]` on side i (side i
 * runs from vertex i to i+1). Sides that collapse are dropped and the rest recomputed; returns the new outline and,
 * per new side, the index of the side it came from, or null when nothing is left.
 */
export function insetPolygon(poly: readonly number[], offs: readonly number[]): { poly: number[]; from: number[] } | null {
  let idx = offs.map((_, i) => i);
  for (let round = 0; round < 64 && idx.length >= 3; round++) {
    const n = idx.length, out: number[] = [];
    const dir = (i: number) => {
      const k = idx[i], a = k * 2, b = ((k + 1) % (poly.length / 2)) * 2;
      const dx = poly[b] - poly[a], dz = poly[b + 1] - poly[a + 1], l = hyp(dx, dz) || 1;
      return { x: poly[a], z: poly[a + 1], hx: dx / l, hz: dz / l, o: offs[k] };
    };
    const sides = idx.map((_, i) => dir(i));
    for (let i = 0; i < n; i++) {
      const p = sides[(i + n - 1) % n], q = sides[i];
      // Offset lines: point + right * o (right = (-hz, hx)).
      const px = p.x - p.hz * p.o, pz = p.z + p.hx * p.o, qx = q.x - q.hz * q.o, qz = q.z + q.hx * q.o;
      const cr = p.hx * q.hz - p.hz * q.hx;
      if (Math.abs(cr) < 0.02) {
        const o = Math.max(p.o, q.o);
        out.push(q.x - q.hz * o, q.z + q.hx * o);
      } else {
        const t = ((qx - px) * q.hz - (qz - pz) * q.hx) / cr;
        out.push(px + p.hx * t, pz + p.hz * t);
      }
    }
    // A side whose direction flipped has collapsed: drop it.
    const keep: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = out[j * 2] - out[i * 2], dz = out[j * 2 + 1] - out[i * 2 + 1];
      if (dx * sides[i].hx + dz * sides[i].hz > 0.05) keep.push(idx[i]);
    }
    if (keep.length === n) {
      if (polyArea(out) <= 0) return null;
      return { poly: out, from: idx };
    }
    idx = keep;
  }
  return null;
}
