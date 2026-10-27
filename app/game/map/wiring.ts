/**
 * Which P1 slices the live map wires (WIRING-PLAN §3, steps 14–18): the one place that says so. The map
 * (world-map-start.ts, world-map.ts), the HUD tables (districts.ts), the people (district-life.ts) and the tests all
 * read it, so they can never disagree. Pure constants: page.tsx and the SSR bundle may import it (no generation).
 *
 * The step itself is lib/world-bounds.ts WIRED_SLICES (the server's bounds and WORLD_VERSION follow it); on localhost
 * `?wired=0..5` (in node PVO_WIRED=0..5) overrides it for testing a later or earlier step.
 */
import { P1_SLICE_COUNT, WIRED_SLICES } from '../../../lib/world-bounds.ts';

/** The P1 slices in wiring order (p1.ts P1_LAYOUTS; districts.test checks the keys). */
export const P1_ORDER = ['quan-4', 'binh-thanh', 'quan-3', 'quan-1-south', 'thu-thiem'] as const;
export type SliceKey = (typeof P1_ORDER)[number];
if (P1_ORDER.length !== P1_SLICE_COUNT) throw new Error(`wiring: ${P1_ORDER.length} P1 slices, lib/world-bounds.ts counts ${P1_SLICE_COUNT}`);

/** The wiring step's slice count: 1 = step 14 (Quận 4) … 5 = step 18 (Thủ Thiêm). */
export const P1_WIRED = WIRED_SLICES;

/** P1_WIRED, or on localhost `?wired=0..5` (node: PVO_WIRED=0..5) for testing. */
function wiredCount(): number {
  let n = P1_WIRED;
  try {
    const g = globalThis as { location?: { hostname: string; search: string }; process?: { env?: Record<string, string | undefined> } };
    const local = !!g.location && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(g.location.hostname);
    const q = local ? new URLSearchParams(g.location!.search).get('wired') : g.location ? null : g.process?.env?.PVO_WIRED;
    if (q != null && /^[0-5]$/.test(q)) n = Number(q);
  } catch { /* no override */ }
  return Math.max(0, Math.min(P1_ORDER.length, n));
}
/** How many slices this client wires (P1_WIRED unless overridden for testing). */
export const WIRED_COUNT = wiredCount();
/** The wired slices, in wiring order. */
export const WIRED_KEYS: readonly SliceKey[] = P1_ORDER.slice(0, WIRED_COUNT);
const WIRED_SET: ReadonlySet<string> = new Set(WIRED_KEYS);
/** Whether a slice is wired. */
export const isWired = (key: string) => WIRED_SET.has(key);
