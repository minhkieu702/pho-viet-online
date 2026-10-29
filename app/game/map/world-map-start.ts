/**
 * Starts P1 map generation as early as the module graph allows: world.ts imports this before city.ts, so the module
 * worker (world-map-worker.ts) builds the wired slices while the main thread is still evaluating city.ts (WIRING-PLAN
 * §2 Generation: "in parallel with city.ts"). world-map.ts awaits the result. No imports of the game's tables here.
 */
import type { MapPayload, MapRequest } from './world-map-worker.ts';
import { P1_ORDER, WIRED_COUNT } from './wiring.ts';

/** world-map-worker.ts TOP_INFINITE (a type-only import keeps the worker's module off the main thread until a fallback needs it). */
const TOP_INFINITE = 1e9;

// How many slices are wired is map/wiring.ts (lib/world-bounds.ts WIRED_SLICES, or `?wired=` on localhost).
export { P1_WIRED, WIRED_COUNT } from './wiring.ts';
/** Today's BUILDINGS.length (city.ts is frozen; world-map.ts checks it): district ids start here. */
export const ID_BASE = 164;

/** The P1 slices in wiring order (p1.ts P1_LAYOUTS; world-map.ts checks the count). */
export const P1_SLICES = P1_ORDER.length;

const g = globalThis as { window?: unknown; Worker?: typeof Worker; document?: unknown };
const browser = typeof g.window !== 'undefined' && typeof g.document !== 'undefined';

/**
 * Generation in the module worker; rejects on any failure (the caller falls back to the main thread). The worker is
 * Vite's `?worker` import: on this stack (vinext, the Cloudflare plugin) client modules see a placeholder
 * import.meta.url, so `new Worker(new URL(..., import.meta.url))` cannot find the script; the `?worker` wrapper uses a
 * root-relative URL in dev and the bundled asset's URL in a build.
 */
async function fromWorker(req: MapRequest): Promise<MapPayload> {
  // Vite's worker import (typed by the '*?worker' declaration in app/vite-env.d.ts)
  const imported = (await import('./world-map-worker.ts?worker')) as { default: new (options?: { name?: string }) => Worker };
  const MapWorker = imported.default;
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new MapWorker({ name: 'pvo-world-map' }); } catch (e) { reject(e); return; }
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('the map worker timed out')); }, 25000);
    worker.onmessage = (e: MessageEvent<{ ok: boolean; bytes?: ArrayBuffer; error?: string }>) => {
      clearTimeout(timer);
      worker.terminate();
      if (!e.data.ok || !e.data.bytes) { reject(new Error(e.data.error ?? 'no payload')); return; }
      try {
        const payload = JSON.parse(new TextDecoder().decode(e.data.bytes)) as MapPayload;
        for (const s of payload.slices) for (const c of s.data.colliders) if (c.top >= TOP_INFINITE) c.top = Infinity;
        resolve(payload);
      } catch (err) { reject(err); }
    };
    worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); e.preventDefault?.(); reject(new Error(e.message || 'the map worker failed to load')); };
    worker.postMessage(req);
  });
}

/** Generation for `idBase` (ID_BASE unless world-map.ts finds city.ts changed): worker first, then the main thread one slice per task, in node in-process. */
export async function generate(idBase = ID_BASE): Promise<MapPayload> {
  const req: MapRequest = { count: WIRED_COUNT, idBase };
  if (browser && typeof g.Worker === 'function' && req.count > 0) {
    try { return await fromWorker(req); } catch (e) { console.warn('world-map: generating on the main thread (the worker failed:', String((e as Error)?.message ?? e), ')'); }
  }
  const { generateMap } = await import('./world-map-worker.ts');
  return generateMap(req, browser ? 'main' : 'node', browser ? () => new Promise((r) => setTimeout(r, 0)) : undefined);
}

/** When generation started (performance.now()), and the generation itself, started now. */
export const MAP_STARTED = typeof performance !== 'undefined' ? performance.now() : 0;
export const MAP_PROMISE: Promise<MapPayload> = generate();
