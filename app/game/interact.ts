/**
 * The interaction registry (design-real §1-2): everything the player can use with E is an entry here, and the one
 * the prompt shows is the one E uses.
 *  C1 the prompt is the action: focus is computed once per frame (best()), the HUD shows its prompt and E runs it.
 *  C2 crimes need a hold: an entry with `hold` seconds acts when the hold completes, never on a tap.
 *  C3 closed things still answer: a dim prompt without a key ("Đóng cửa · mở lại 6:00"), and E does nothing.
 *  C4 what cannot work has no entry (and no prompt).
 *  C5 missions win: game.ts asks the mission ring and side-job offers before the registry.
 * Static entries sit in a 16 m spatial hash; providers add dynamic ones (vehicles, people, boats, buses) near the
 * player each frame. Pure: no three.js, no DOM (scripts/interact-audit.test.mjs imports auditEntries()).
 */
import { PLACES, type FacadeKind } from './counters';
import { SPOTS } from './parking';
import * as transit from './transit';

export type { FacadeKind } from './counters';
export type InteractKind = FacadeKind | 'person' | 'push' | 'bin';
/** What the prompt chip shows: [key] verb · label · price, red with an eye for a watched crime. */
export type PromptView = {
  id: string; key: 'E' | 'Giữ E' | ''; verb: string; label: string; price?: number;
  crime?: 0 | 1 | 2 | 3; seen?: boolean; progress?: number; dim?: boolean;
};
export type MenuItem = { id: string; name: string; price: number; desc: string; disabled?: boolean; tag?: string };
/** A counter's menu as the panel draws it (page.tsx CounterPanel); `choose(menu.id, item.id)` buys. */
export type MenuView = {
  id: string; kind: string; icon: string; eyebrow: string; title: string; intro: string; items: MenuItem[]; foot: string;
  wallet: { cash: number; bank?: number }; haggle?: boolean; tickets?: string[]; seated?: boolean;
};
/** The player and the world this frame, for prompts and uses. */
export type Ctx = {
  x: number; z: number; heading: number; onFoot: boolean; riding: boolean; inCar: boolean; swimming: boolean;
  hour: number; day: number; zombie: boolean; wanted: number; cash: number; bank: number; armed: boolean;
  /** Seconds (performance.now() / 1000). */
  time: number;
  /** People who would see something happen at (x, z) within r (line of sight). */
  witnesses(x: number, z: number, r: number): number;
  notify(text: string, ms?: number): void;
  /** Opens a menu on the counter panel; `choose` runs when an item is picked (a string return is shown to the player). */
  menu(view: MenuView, choose?: (itemId: string) => string | void): void;
};
export type Entry = {
  id: string; kind: InteractKind; x: number; z: number; r: number;
  /** Base score; BASE[kind] when omitted. */
  priority?: number;
  /** Most the player's heading may differ from the direction to the entry (rad); omitted = any. Within 1.2 m always. */
  arc?: number;
  /** Who can use it: on foot (default), riding, either, or swimming. */
  when?: 'foot' | 'ride' | 'any' | 'water';
  /** Hold E this long; use() runs when the hold completes (C2). */
  hold?: number;
  crime?: boolean | 0 | 1 | 2 | 3;
  prompt(ctx: Ctx): PromptView | null;
  use(ctx: Ctx): void;
  /** A hold was abandoned (released, moved off, aimed, knocked down, a menu opened). */
  cancel?(ctx: Ctx): void;
};
export type Provider = (x: number, z: number, r: number, out: Entry[]) => void;
export type Focus = { entry: Entry; view: PromptView; score: number };
export type Registry = ReturnType<typeof createRegistry>;

/** Base priorities (design-real §2): own vehicles first, then transit, counters and doors, people, ATMs, seats, theft, push, bins. */
export const BASE: Record<InteractKind, number> = {
  vehicle: 40, transit: 68, counter: 60, door: 60, person: 58, atm: 55, seat: 50, push: 35, bin: 30, boat: 60,
};
/** Own bike or car (vehicle entries pass this as their priority). */
export const OWN_VEHICLE = 70;
/** Nothing is answered farther than this, whatever an entry's radius. */
const REACH = 8;
const crimeOf = (e: Entry) => (e.crime === true ? 1 : e.crime || 0);

export function createRegistry(cell = 16) {
  const hash = new Map<number, Entry[]>();
  const byId = new Map<string, { entry: Entry; key: number }>();
  const providers = new Set<Provider>();
  const keyOf = (x: number, z: number) => (Math.floor(x / cell) + 4096) * 8192 + (Math.floor(z / cell) + 4096);
  function add(entry: Entry) {
    remove(entry.id);
    const key = keyOf(entry.x, entry.z);
    let list = hash.get(key);
    if (!list) hash.set(key, (list = []));
    list.push(entry);
    byId.set(entry.id, { entry, key });
  }
  function remove(id: string) {
    const found = byId.get(id);
    if (!found) return;
    const list = hash.get(found.key)!;
    list.splice(list.indexOf(found.entry), 1);
    byId.delete(id);
  }
  const candidates: Entry[] = [];
  let current: Focus | null = null;
  let challenger: { id: string; since: number } | null = null;
  /** Everything within reach of (x, z): static entries from the hash cells around it, then the providers'. */
  function gather(x: number, z: number) {
    candidates.length = 0;
    const span = Math.ceil(REACH / cell);
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
      const list = hash.get((cx + i + 4096) * 8192 + (cz + j + 4096));
      if (list) for (const e of list) candidates.push(e);
    }
    for (const p of providers) p(x, z, REACH, candidates);
    return candidates;
  }
  function allowed(e: Entry, ctx: Ctx) {
    const when = e.when ?? 'foot';
    return when === 'any' || (when === 'foot' ? ctx.onFoot : when === 'ride' ? ctx.riding : ctx.swimming);
  }
  /** Score of an entry for the player, or -Infinity if it does not qualify. */
  function score(e: Entry, ctx: Ctx) {
    const dx = e.x - ctx.x, dz = e.z - ctx.z, d = Math.hypot(dx, dz);
    if (d > e.r || d > REACH || !allowed(e, ctx)) return -Infinity;
    if (e.arc !== undefined && d >= 1.2) {
      const gap = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - ctx.heading), Math.cos(Math.atan2(dx, dz) - ctx.heading)));
      if (gap > e.arc) return -Infinity;
    }
    return (e.priority ?? BASE[e.kind]) - 6 * d - (crimeOf(e) ? 10 : 0);
  }
  return {
    add, remove,
    /** Moves a static entry (a cart pushed away, a boat at another pier). */
    move(id: string, x: number, z: number) {
      const found = byId.get(id);
      if (!found) return;
      remove(id);
      found.entry.x = x; found.entry.z = z;
      add(found.entry);
    },
    get(id: string) { return byId.get(id)?.entry ?? null; },
    /** Adds a source of dynamic entries near the player; returns a function that removes it. */
    addProvider(fn: Provider) { providers.add(fn); return () => { providers.delete(fn); }; },
    /** The entry the player would use now, with hysteresis: a challenger must beat the focus by 4 for 0.25 s. */
    best(ctx: Ctx): Focus | null {
      let top: Focus | null = null, closed: Focus | null = null, kept: Focus | null = null, atDoor: Focus | null = null;
      for (const e of gather(ctx.x, ctx.z)) {
        const sc = score(e, ctx);
        if (sc === -Infinity) continue;
        const view = e.prompt(ctx);
        if (!view) continue;
        const f = { entry: e, view, score: sc };
        if (current && e.id === current.entry.id) kept = f;
        // A closed counter answers (C3), but anything that works wins over it.
        if (view.dim) {
          if (!closed || sc > closed.score) closed = f;
          // Standing right at a closed shop's own door or counter.
          if ((e.kind === 'counter' || e.kind === 'door') && Math.hypot(e.x - ctx.x, e.z - ctx.z) < 1.5 && (!atDoor || sc > atDoor.score)) atDoor = f;
        } else if (!top || sc > top.score) top = f;
      }
      // At a closed shop's door its hours are the answer: a crime nearby (the shop's own parked bikes) never displaces them.
      if (top && atDoor && crimeOf(top.entry)) top = atDoor;
      if (top && kept?.view.dim && kept !== top) kept = null;
      top ??= closed;
      if (!top) { current = null; challenger = null; return null; }
      if (kept && top.entry.id !== kept.entry.id) {
        if (top.score < kept.score + 4) { top = kept; challenger = null; }
        else {
          if (!challenger || challenger.id !== top.entry.id) challenger = { id: top.entry.id, since: ctx.time };
          if (ctx.time - challenger.since < 0.25) top = kept; else challenger = null;
        }
      } else challenger = null;
      current = top;
      return top;
    },
    /** Forgets the focus (after a teleport, entering a vehicle...). */
    reset() { current = null; challenger = null; },
    get size() { return byId.size; },
  };
}

/**
 * The static entries game.ts registers (counters, doors, seats, ATMs, the hire boats), for the interact audit:
 * a facade is handled when an entry covering its kind lies within r of it.
 */
export type AuditEntry = { id: string; covers: FacadeKind[]; x: number; z: number; r: number };
export function auditEntries(): AuditEntry[] {
  const out: AuditEntry[] = PLACES.filter((p) => p.covers.length).map((p) => ({ id: `${p.kind}:${p.key}:${p.id}`, covers: p.covers, x: p.x, z: p.z, r: p.r }));
  // Parked bikes and cars stand on parking.ts spots; game.ts's curb provider answers each one at run time
  // (vehicles.curbNear: ride your own, hold E to steal anyone else's, nothing while somebody sits on it).
  for (const s of SPOTS) out.push({ id: `vehicle:curb:${s.id}`, covers: ['vehicle'], x: s.x, z: s.z, r: s.vehicle === 'moto' ? 1.2 : 2.6 });
  // Bus stops and piers: the transit owner registers their entries at run time (registry.add or a provider, via
  // the register() hook game.ts calls on vehicles, npcs and boats) and lists the same places as pure data here.
  for (const e of (transit as unknown as { AUDIT_ENTRIES?: AuditEntry[] }).AUDIT_ENTRIES ?? []) out.push(e);
  return out;
}
