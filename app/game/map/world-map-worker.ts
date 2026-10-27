/**
 * P1 map generation off the main thread (WIRING-PLAN §2 Generation): buildP1 for the wired slices, the stack welded at
 * their seams and the live road input (links out, phantom crosswalks back). Pure (no three.js, no DOM): world-map.ts
 * runs it in this module worker at load, in parallel with city.ts, and falls back to running generateMap on the main
 * thread one slice per task (no Worker, a worker error, node tests). The payload is plain data (structured clone);
 * graphs are rebuilt from their inputs on the other side (createRoadGraph is a few ms).
 *
 * Module-worker check on vinext / Vite 8 + @cloudflare/vite-plugin: world-map.ts constructs it with
 * `new Worker(new URL('./world-map-worker.ts', import.meta.url), { type: 'module' })`, which Vite serves as an ES
 * module in dev and bundles as its own chunk in the client build (the SSR build never reaches it: page.tsx imports the
 * game only on the client).
 */
import { LEGACY_ROADS } from './roads-legacy.ts';
import { buildDistrict, type DistrictData } from './build-district.ts';
import { readdress } from './addresses.ts';
import { linkGraph, linksOf, liveInput, stackSlices, type Origin, type StackSlice, type Trim } from './stack.ts';
import { P1_LAYOUTS, P1_LINKS, linksAmong, seamsAmong } from './p1.ts';
import type { RoadInput } from './roads.ts';
import type { Issue } from './gen/validate.ts';

/** A slice as the main thread gets it: the generator's data without its per-slice road graph (rebuilt on demand). */
export type SliceData = Omit<DistrictData, 'graph'>;
export type MapSlice = { key: string; links: string[]; data: SliceData };
/** What generation hands back: the slices (wiring order), the live road input with who built each node and edge, the stack's trims and issues. */
export type MapPayload = {
  count: number; keys: string[]; idBase: number;
  slices: MapSlice[];
  live: { input: RoadInput; edgeOf: (Origin & { art: string })[]; nodeOf: Origin[] };
  trimmed: Trim[]; issues: Issue[];
  welds: { seam: string; node: number; cut: number }[];
  roundabouts: { node: number; radius: number; slice: string }[];
  /** Generation time (ms) and where it ran. */
  ms: number; where: 'worker' | 'main' | 'node';
};
export type MapRequest = { count: number; idBase: number };

/** An infinite collider top on the wire (JSON has no Infinity). */
export const TOP_INFINITE = 1e9;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Builds the first `count` P1 slices (wiring order) with building ids from `idBase` (today's BUILDINGS.length), as
 * p1.ts buildP1 does, but slice by slice so a caller on the main thread can yield between them (`pause` resolves
 * when the next slice may start).
 */
export async function generateMap(req: MapRequest, where: MapPayload['where'], pause?: () => Promise<void>): Promise<MapPayload> {
  const t0 = now();
  const layouts = P1_LAYOUTS.slice(0, Math.max(0, Math.min(P1_LAYOUTS.length, req.count)));
  let idBase = req.idBase;
  const slices: StackSlice[] = [];
  for (const layout of layouts) {
    if (pause && slices.length) await pause();
    const links = linksOf(layout, P1_LINKS);
    const data = buildDistrict(layout, linkGraph(LEGACY_ROADS, links), { idBase });
    idBase += data.buildings.length;
    slices.push({ key: layout.key, layout, data, links: links.map((l) => l.id) });
  }
  if (pause && slices.length) await pause();
  readdress(slices);
  const stack = stackSlices(LEGACY_ROADS, linksAmong(layouts), slices, seamsAmong(slices.map((s) => s.key)));
  const live = liveInput(stack, LEGACY_ROADS);
  return {
    count: layouts.length, keys: layouts.map((l) => l.key), idBase: req.idBase,
    // Without the per-slice road graph (functions do not cross to the main thread; the live graph is rebuilt there).
    slices: slices.map((s) => ({ key: s.key, links: s.links ?? [], data: Object.fromEntries(Object.entries(s.data).filter(([k]) => k !== 'graph')) as SliceData })),
    live: { input: live.input, edgeOf: live.edgeOf, nodeOf: live.nodeOf },
    trimmed: stack.trimmed, issues: stack.issues, welds: stack.welds, roundabouts: stack.roundabouts,
    ms: Math.round(now() - t0), where,
  };
}

// Inside a module worker: answer one request, as JSON text in a transferred buffer (one string to parse beats
// structured-cloning some 200k small objects on the main thread).
type WorkerScope = { onmessage: ((e: MessageEvent<MapRequest>) => void) | null; postMessage(m: unknown, transfer?: Transferable[]): void };
const scope = globalThis as unknown as WorkerScope & { WorkerGlobalScope?: unknown; document?: unknown };
if (typeof scope.WorkerGlobalScope !== 'undefined' && typeof scope.document === 'undefined') {
  scope.onmessage = (e) => {
    generateMap(e.data, 'worker').then(
      (payload) => {
        // JSON has no Infinity: untopped colliders (lamps, poles…) travel as TOP_INFINITE (world-map-start.ts restores them).
        for (const sl of payload.slices) for (const c of sl.data.colliders) if (c.top === Infinity) c.top = TOP_INFINITE;
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        scope.postMessage({ ok: true, bytes: bytes.buffer }, [bytes.buffer]);
      },
      (err: unknown) => scope.postMessage({ ok: false, error: String((err as Error)?.stack ?? err) }),
    );
  };
}
