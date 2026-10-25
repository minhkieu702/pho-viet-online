/**
 * The one spatial index for everything solid on the ground plane (plan decision 3): a hash of 16 m cells over
 * axis-aligned and oriented boxes, each with an optional height range, an owner tag and a reference back to the
 * caller's object. Queries allocate nothing, and a solid filed under several cells is seen once per query (visited
 * stamps). Pure TypeScript with no imports, so node tests, workers and the ragdoll solver can share it.
 *
 * Conventions: ground plane x/z, height y; yaw 0 faces +z (forward = (sin yaw, cos yaw), right = (cos yaw, -sin yaw)).
 * A solid without a height range is infinitely tall, like every legacy collider. clear/overlaps at a height y see the
 * solids with bottom <= y < top; casts treat the height range as a third slab; query/containing ignore heights (read
 * them with bottom/top). Narrow-phase tests are exact for both shapes.
 */

export type CollisionIndex = ReturnType<typeof createCollisionIndex>;
/** Owner tags in use. Chunk keys and dynamic owners (vehicles, roadblocks) take values from 16 up. */
export const OWNER = { legacy: 1, roof: 2 } as const;

const OBB = 1, HEIGHT = 2, LIVE = 4, WIDE = 8;
/** A solid is filed under every cell its box reaches within EPS, so float rounding at a cell border never loses it. */
const EPS = 1e-3;
/** Solids spanning more cells than this on an axis go on one list that every query checks. */
const WIDE_CELLS = 64;
const PARALLEL = 1e-9; // the legacy wallDistance threshold for a ray running along an axis
const MAX_TICK = 0xfffffff0;

type Typed = Float64Array | Int32Array | Uint8Array | Uint32Array;
function grown<T extends Typed>(a: T, n: number): T {
  const b = new (a.constructor as new (n: number) => T)(n);
  b.set(a);
  return b;
}

export function createCollisionIndex(cell = 16) {
  // Solids as structure of arrays; ids are handed out in insertion order and reused through a free list.
  let cap = 0, used = 0, live = 0;
  let minX = new Float64Array(0), minZ = new Float64Array(0), maxX = new Float64Array(0), maxZ = new Float64Array(0);
  let lowY = new Float64Array(0), highY = new Float64Array(0);
  let cx = new Float64Array(0), cz = new Float64Array(0), hx = new Float64Array(0), hz = new Float64Array(0), cs = new Float64Array(0), sn = new Float64Array(0);
  let flags = new Uint8Array(0), owners = new Int32Array(0), stamp = new Uint32Array(0);
  let gx0 = new Int32Array(0), gz0 = new Int32Array(0), gx1 = new Int32Array(0), gz1 = new Int32Array(0);
  const refs: unknown[] = [], free: number[] = [], wide: number[] = [];
  let tick = 0;
  // Cells: an open-addressing table from cell key to list number, and one growable id list per cell.
  let slots = 0, mask = 0, shift = 0, slotKey = new Int32Array(0), slotList = new Int32Array(0);
  const lists: Int32Array[] = [];
  let lens = new Int32Array(0);
  // Extent of everything filed in cells (never shrinks), so a cast only walks cells that can hold something.
  let bMinX = Infinity, bMinZ = Infinity, bMaxX = -Infinity, bMaxZ = -Infinity;

  const keyOf = (ix: number, iz: number) => ((ix & 0xffff) << 16) | (iz & 0xffff);
  const hashOf = (key: number) => Math.imul(key, 0x9e3779b1) >>> shift;
  /** The list number of cell (ix, iz), or -1 when nothing was ever filed there. */
  function find(ix: number, iz: number) {
    if (!slots) return -1;
    const key = keyOf(ix, iz);
    for (let h = hashOf(key); ; h = (h + 1) & mask) {
      const l = slotList[h];
      if (l < 0 || slotKey[h] === key) return l;
    }
  }
  function rehash(n: number) {
    const oldKey = slotKey, oldList = slotList;
    slots = n; mask = n - 1; shift = Math.clz32(n - 1);
    slotKey = new Int32Array(n); slotList = new Int32Array(n).fill(-1);
    for (let i = 0; i < oldList.length; i++) {
      if (oldList[i] < 0) continue;
      let h = hashOf(oldKey[i]);
      while (slotList[h] >= 0) h = (h + 1) & mask;
      slotKey[h] = oldKey[i]; slotList[h] = oldList[i];
    }
  }
  function listAt(ix: number, iz: number) {
    if ((lists.length + 1) * 2 > slots) rehash(Math.max(64, slots * 2));
    const key = keyOf(ix, iz);
    let h = hashOf(key);
    for (; slotList[h] >= 0; h = (h + 1) & mask) if (slotKey[h] === key) return slotList[h];
    slotKey[h] = key; slotList[h] = lists.length;
    lists.push(new Int32Array(4));
    if (lens.length < lists.length) lens = grown(lens, lists.length * 2);
    return lists.length - 1;
  }

  function file(id: number) {
    const x0 = Math.floor((minX[id] - EPS) / cell), x1 = Math.floor((maxX[id] + EPS) / cell);
    const z0 = Math.floor((minZ[id] - EPS) / cell), z1 = Math.floor((maxZ[id] + EPS) / cell);
    gx0[id] = x0; gx1[id] = x1; gz0[id] = z0; gz1[id] = z1;
    if (x1 - x0 >= WIDE_CELLS || z1 - z0 >= WIDE_CELLS) { flags[id] |= WIDE; wide.push(id); return; }
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const l = listAt(ix, iz);
        if (lens[l] === lists[l].length) lists[l] = grown(lists[l], lens[l] * 2);
        lists[l][lens[l]++] = id;
      }
    }
    bMinX = Math.min(bMinX, minX[id]); bMaxX = Math.max(bMaxX, maxX[id]);
    bMinZ = Math.min(bMinZ, minZ[id]); bMaxZ = Math.max(bMaxZ, maxZ[id]);
  }
  function unfile(id: number) {
    if (flags[id] & WIDE) { wide.splice(wide.indexOf(id), 1); return; }
    for (let iz = gz0[id]; iz <= gz1[id]; iz++) {
      for (let ix = gx0[id]; ix <= gx1[id]; ix++) {
        const l = find(ix, iz), list = lists[l];
        for (let i = 0, n = lens[l]; i < n; i++) if (list[i] === id) { list[i] = list[n - 1]; lens[l] = n - 1; break; }
      }
    }
  }
  function alloc() {
    if (free.length) return free.pop()!;
    if (used === cap) {
      cap = Math.max(64, cap * 2);
      minX = grown(minX, cap); minZ = grown(minZ, cap); maxX = grown(maxX, cap); maxZ = grown(maxZ, cap);
      lowY = grown(lowY, cap); highY = grown(highY, cap);
      cx = grown(cx, cap); cz = grown(cz, cap); hx = grown(hx, cap); hz = grown(hz, cap); cs = grown(cs, cap); sn = grown(sn, cap);
      flags = grown(flags, cap); owners = grown(owners, cap); stamp = grown(stamp, cap);
      gx0 = grown(gx0, cap); gz0 = grown(gz0, cap); gx1 = grown(gx1, cap); gz1 = grown(gz1, cap);
    }
    return used++;
  }
  function settle(id: number, bottom: number, top: number, owner: number, ref: unknown, shape: number) {
    lowY[id] = bottom; highY[id] = top;
    flags[id] = LIVE | shape | (bottom > -Infinity || top < Infinity ? HEIGHT : 0);
    owners[id] = owner; refs[id] = ref; stamp[id] = 0;
    file(id);
    live++;
    return id;
  }
  /** Starts a query that may meet a solid in several cells. */
  function nextTick() {
    if (++tick > MAX_TICK) { stamp.fill(0); tick = 1; }
    return tick;
  }

  // ---- Per-solid tests: the arithmetic of the legacy linear scans, so the answers are bit-identical. ----

  /** A circle of radius² r2 at (x, z) touches the solid (strictly inside the radius). */
  function touches(id: number, x: number, z: number, r2: number) {
    let ex: number, ez: number;
    if (flags[id] & OBB) {
      const dx = x - cx[id], dz = z - cz[id], c = cs[id], s = sn[id];
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      ex = lx - Math.max(-hx[id], Math.min(hx[id], lx)); ez = lz - Math.max(-hz[id], Math.min(hz[id], lz));
    } else {
      ex = x - Math.max(minX[id], Math.min(maxX[id], x)); ez = z - Math.max(minZ[id], Math.min(maxZ[id], z));
    }
    return ex * ex + ez * ez < r2;
  }
  /** Whether the solid is present at height y (always, for one without a height range or when y is NaN). */
  const atHeight = (id: number, y: number) => !(flags[id] & HEIGHT) || y !== y || (y >= lowY[id] && y < highY[id]);
  /** The ray's entry parameter into the solid when it is in (0, best), else best. */
  function enterRay(id: number, ox: number, oz: number, dx: number, dz: number, oy: number, dy: number, best: number) {
    const f = flags[id];
    let px = ox, pz = oz, vx = dx, vz = dz, x0: number, x1: number, z0: number, z1: number;
    if (f & OBB) {
      const c = cs[id], s = sn[id], rx = ox - cx[id], rz = oz - cz[id];
      px = rx * c - rz * s; pz = rx * s + rz * c; vx = dx * c - dz * s; vz = dx * s + dz * c;
      x0 = -hx[id]; x1 = hx[id]; z0 = -hz[id]; z1 = hz[id];
    } else { x0 = minX[id]; x1 = maxX[id]; z0 = minZ[id]; z1 = maxZ[id]; }
    let enter = 0, exit = best;
    if (Math.abs(vx) < PARALLEL) { if (px < x0 || px > x1) return best; } else {
      let t1 = (x0 - px) / vx, t2 = (x1 - px) / vx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      enter = Math.max(enter, t1); exit = Math.min(exit, t2);
    }
    if (Math.abs(vz) < PARALLEL) { if (pz < z0 || pz > z1) return best; } else {
      let t1 = (z0 - pz) / vz, t2 = (z1 - pz) / vz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      enter = Math.max(enter, t1); exit = Math.min(exit, t2);
    }
    if (f & HEIGHT && oy === oy) {
      if (Math.abs(dy) < PARALLEL) { if (oy < lowY[id] || oy > highY[id]) return best; } else {
        let t1 = (lowY[id] - oy) / dy, t2 = (highY[id] - oy) / dy;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        enter = Math.max(enter, t1); exit = Math.min(exit, t2);
      }
    }
    return enter <= exit && enter > 0 && enter < best ? enter : best;
  }
  /** The solid grown by pad overlaps the open box (exact separating-axis test for an oriented box). */
  function overlapsBox(id: number, x0: number, z0: number, x1: number, z1: number, pad: number) {
    if (!(flags[id] & OBB)) return x1 > minX[id] - pad && x0 < maxX[id] + pad && z1 > minZ[id] - pad && z0 < maxZ[id] + pad;
    const c = cs[id], s = sn[id], ac = Math.abs(c), as = Math.abs(s), ax = hx[id] + pad, az = hz[id] + pad;
    const qx = (x1 - x0) / 2, qz = (z1 - z0) / 2, dx = (x0 + x1) / 2 - cx[id], dz = (z0 + z1) / 2 - cz[id];
    return Math.abs(dx) < qx + ac * ax + as * az && Math.abs(dz) < qz + as * ax + ac * az
      && Math.abs(dx * c - dz * s) < ax + qx * ac + qz * as && Math.abs(dx * s + dz * c) < az + qx * as + qz * ac;
  }
  /** (x, z) lies in the solid grown by pad, edges included (inRect with margin -pad). */
  function contains(id: number, x: number, z: number, pad: number) {
    if (flags[id] & OBB) {
      const dx = x - cx[id], dz = z - cz[id], c = cs[id], s = sn[id];
      return Math.abs(dx * c - dz * s) <= hx[id] + pad && Math.abs(dx * s + dz * c) <= hz[id] + pad;
    }
    return x >= minX[id] - pad && x <= maxX[id] + pad && z >= minZ[id] - pad && z <= maxZ[id] + pad;
  }

  const index = {
    cell,
    /** Live solids. */
    get size() { return live; },

    /** Adds an axis-aligned box; bottom/top default to an infinitely tall solid. Returns its id. */
    add(x0: number, z0: number, x1: number, z1: number, bottom = -Infinity, top = Infinity, owner = 0, ref: unknown = null) {
      const id = alloc();
      minX[id] = x0; minZ[id] = z0; maxX[id] = x1; maxZ[id] = z1;
      cx[id] = (x0 + x1) / 2; cz[id] = (z0 + z1) / 2; hx[id] = (x1 - x0) / 2; hz[id] = (z1 - z0) / 2; cs[id] = 1; sn[id] = 0;
      return settle(id, bottom, top, owner, ref, 0);
    },
    /** Adds an oriented box: centre (x, z), half sizes along its own right and forward axes, turned by yaw. */
    addBox(x: number, z: number, halfX: number, halfZ: number, yaw: number, bottom = -Infinity, top = Infinity, owner = 0, ref: unknown = null) {
      const id = alloc(), c = Math.cos(yaw), s = Math.sin(yaw);
      const ex = Math.abs(c) * halfX + Math.abs(s) * halfZ, ez = Math.abs(s) * halfX + Math.abs(c) * halfZ;
      cx[id] = x; cz[id] = z; hx[id] = halfX; hz[id] = halfZ; cs[id] = c; sn[id] = s;
      minX[id] = x - ex; maxX[id] = x + ex; minZ[id] = z - ez; maxZ[id] = z + ez;
      return settle(id, bottom, top, owner, ref, OBB);
    },
    /** Removes a solid; its id may be reused by a later add. */
    remove(id: number) {
      if (!(id >= 0 && id < used && flags[id] & LIVE)) return false;
      unfile(id);
      flags[id] = 0; refs[id] = null; free.push(id); live--;
      return true;
    },
    /** Removes every solid with this owner tag (a chunk, a vehicle, a district); returns how many. */
    removeOwner(owner: number) {
      let n = 0;
      for (let id = 0; id < used; id++) if (flags[id] & LIVE && owners[id] === owner && index.remove(id)) n++;
      return n;
    },
    owner: (id: number) => owners[id],
    ref: (id: number) => refs[id],
    bottom: (id: number) => lowY[id],
    top: (id: number) => highY[id],

    /** True when a circle of radius r at (x, z) touches no solid (at height y, when given). */
    clear(x: number, z: number, r: number, y = NaN) {
      const r2 = r * r, a = Math.abs(r);
      for (let i = 0; i < wide.length; i++) if (atHeight(wide[i], y) && touches(wide[i], x, z, r2)) return false;
      const ix0 = Math.floor((x - a) / cell), ix1 = Math.floor((x + a) / cell), iz0 = Math.floor((z - a) / cell), iz1 = Math.floor((z + a) / cell);
      if (ix0 === ix1 && iz0 === iz1) {
        // One cell (most calls): no solid can come up twice.
        const l = find(ix0, iz0);
        if (l < 0) return true;
        const list = lists[l];
        for (let i = 0, n = lens[l]; i < n; i++) if (atHeight(list[i], y) && touches(list[i], x, z, r2)) return false;
        return true;
      }
      const t = nextTick();
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const l = find(ix, iz);
          if (l < 0) continue;
          const list = lists[l];
          for (let i = 0, n = lens[l]; i < n; i++) {
            const id = list[i];
            if (stamp[id] === t) continue;
            stamp[id] = t;
            if (atHeight(id, y) && touches(id, x, z, r2)) return false;
          }
        }
      }
      return true;
    },
    /** True when some solid grown by pad overlaps the open box (at height y, when given). */
    overlaps(x0: number, z0: number, x1: number, z1: number, pad = 0, y = NaN) {
      for (let i = 0; i < wide.length; i++) if (atHeight(wide[i], y) && overlapsBox(wide[i], x0, z0, x1, z1, pad)) return true;
      const p = Math.abs(pad) * 1.5, t = nextTick(); // a pad grows an oriented box's bounds by up to pad * sqrt(2)
      for (let iz = Math.floor((z0 - p) / cell), iz1 = Math.floor((z1 + p) / cell); iz <= iz1; iz++) {
        for (let ix = Math.floor((x0 - p) / cell), ix1 = Math.floor((x1 + p) / cell); ix <= ix1; ix++) {
          const l = find(ix, iz);
          if (l < 0) continue;
          const list = lists[l];
          for (let i = 0, n = lens[l]; i < n; i++) {
            const id = list[i];
            if (stamp[id] === t) continue;
            stamp[id] = t;
            if (atHeight(id, y) && overlapsBox(id, x0, z0, x1, z1, pad)) return true;
          }
        }
      }
      return false;
    },
    /**
     * Broadphase: ids of the solids whose bounding boxes overlap the open box, each once, written to out[0..n).
     * Returns n; entries of out past n are stale (out is never shrunk, so a reused array allocates nothing).
     */
    query(x0: number, z0: number, x1: number, z1: number, out: number[]) {
      let n = 0;
      for (let i = 0; i < wide.length; i++) {
        const id = wide[i];
        if (maxX[id] > x0 && minX[id] < x1 && maxZ[id] > z0 && minZ[id] < z1) out[n++] = id;
      }
      const t = nextTick();
      for (let iz = Math.floor(z0 / cell), iz1 = Math.floor(z1 / cell); iz <= iz1; iz++) {
        for (let ix = Math.floor(x0 / cell), ix1 = Math.floor(x1 / cell); ix <= ix1; ix++) {
          const l = find(ix, iz);
          if (l < 0) continue;
          const list = lists[l];
          for (let i = 0, m = lens[l]; i < m; i++) {
            const id = list[i];
            if (stamp[id] === t) continue;
            stamp[id] = t;
            if (maxX[id] > x0 && minX[id] < x1 && maxZ[id] > z0 && minZ[id] < z1) out[n++] = id;
          }
        }
      }
      return n;
    },
    /** Ids of the solids whose footprint grown by pad contains (x, z), edges included, into out; returns the count. */
    containing(x: number, z: number, pad: number, out: number[]) {
      let n = 0;
      for (let i = 0; i < wide.length; i++) if (contains(wide[i], x, z, pad)) out[n++] = wide[i];
      const p = Math.abs(pad) * 1.5, ix0 = Math.floor((x - p) / cell), ix1 = Math.floor((x + p) / cell), iz0 = Math.floor((z - p) / cell), iz1 = Math.floor((z + p) / cell);
      const one = ix0 === ix1 && iz0 === iz1, t = one ? 0 : nextTick();
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const l = find(ix, iz);
          if (l < 0) continue;
          const list = lists[l];
          for (let i = 0, m = lens[l]; i < m; i++) {
            const id = list[i];
            if (!one) { if (stamp[id] === t) continue; stamp[id] = t; }
            if (contains(id, x, z, pad)) out[n++] = id;
          }
        }
      }
      return n;
    },
    /**
     * Parameter t along origin + t * dir (dir need not be unit) where the ray first enters a solid, or maxT when it
     * reaches maxT first. A solid the ray starts inside or on is passed through, as in the legacy wallDistance. With oy
     * (and dy) given, solids with a height range are hit only where the ray is within it. Cells are walked with a DDA.
     */
    cast(ox: number, oz: number, dx: number, dz: number, maxT: number, oy = NaN, dy = 0) {
      let best = maxT;
      for (let i = 0; i < wide.length; i++) best = enterRay(wide[i], ox, oz, dx, dz, oy, dy, best);
      if (bMinX > bMaxX) return best;
      // Clip to the filed extent (padded well past EPS); nothing outside it can be hit.
      let t0 = 0, t1 = best;
      const px = Math.abs(dx) >= PARALLEL, pz = Math.abs(dz) >= PARALLEL;
      if (!px) { if (ox < bMinX - 1 || ox > bMaxX + 1) return best; } else {
        const a = (bMinX - 1 - ox) / dx, b = (bMaxX + 1 - ox) / dx;
        t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
      }
      if (!pz) { if (oz < bMinZ - 1 || oz > bMaxZ + 1) return best; } else {
        const a = (bMinZ - 1 - oz) / dz, b = (bMaxZ + 1 - oz) / dz;
        t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
      }
      if (!(t0 <= t1)) return best;
      const sx = px ? (dx > 0 ? 1 : -1) : 0, sz = pz ? (dz > 0 ? 1 : -1) : 0;
      let ix = Math.floor((ox + dx * t0) / cell), iz = Math.floor((oz + dz * t0) / cell);
      // Amanatides-Woo: tx/tz are where the ray crosses into the next column/row, recomputed exactly each step.
      let tx = sx > 0 ? ((ix + 1) * cell - ox) / dx : sx < 0 ? (ix * cell - ox) / dx : Infinity;
      let tz = sz > 0 ? ((iz + 1) * cell - oz) / dz : sz < 0 ? (iz * cell - oz) / dz : Infinity;
      let steps = (sx ? Math.abs(Math.floor((ox + dx * t1) / cell) - ix) : 0) + (sz ? Math.abs(Math.floor((oz + dz * t1) / cell) - iz) : 0) + 4;
      const t = nextTick();
      for (;;) {
        const l = find(ix, iz);
        if (l >= 0) {
          const list = lists[l];
          for (let i = 0, n = lens[l]; i < n; i++) {
            const id = list[i];
            if (stamp[id] === t) continue;
            stamp[id] = t;
            best = enterRay(id, ox, oz, dx, dz, oy, dy, best);
          }
        }
        // Every entry point before the next border lies in a cell already walked.
        const next = Math.min(tx, tz);
        if (best <= next || !(next < t1) || --steps < 0) break;
        if (tx <= tz) { ix += sx; tx = ((sx > 0 ? ix + 1 : ix) * cell - ox) / dx; } else { iz += sz; tz = ((sz > 0 ? iz + 1 : iz) * cell - oz) / dz; }
      }
      return best;
    },
    /** Distance from (x0, z0) toward (x1, z1) to the first solid, or the segment length when nothing is in the way. */
    raycast(x0: number, z0: number, x1: number, z1: number, y = NaN) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (!(len > 0)) return 0;
      return index.cast(x0, z0, (x1 - x0) / len, (z1 - z0) / len, len, y, 0);
    },
    /** Hash shape, for tests and benches. */
    stats() {
      let refsFiled = 0, most = 0, cells = 0;
      for (let l = 0; l < lists.length; l++) { if (lens[l]) cells++; refsFiled += lens[l]; most = Math.max(most, lens[l]); }
      return { solids: live, cells, refs: refsFiled, most, wide: wide.length };
    },
  };
  return index;
}
