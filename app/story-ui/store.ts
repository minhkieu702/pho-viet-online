// A tiny external store for the story UI, so the engine can push fast values (stealth pressure, noise, awareness,
// camera framing, QTE mash) at frame rate without going through the 120 ms Hud JSON. Pure: no React or DOM.
// React side: useStoryView(store) in StoryLayer.tsx (useSyncExternalStore).
import type { StorySettings, StoryUiView } from './types';

export type StoryStore<T extends object = StoryUiView> = {
  get(): T;
  /** Shallow-merges a patch; listeners run only when some top-level value changed (by reference). */
  set(patch: Partial<T> | ((state: T) => Partial<T>)): void;
  replace(state: T): void;
  subscribe(listener: () => void): () => void;
};

export function createStoryStore<T extends object>(initial: T): StoryStore<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const emit = () => { for (const fn of [...listeners]) fn(); };
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k in p) if (!Object.is((p as T)[k], state[k])) { changed = true; break; }
      if (!changed) return;
      state = { ...state, ...p };
      emit();
    },
    replace(next) { if (next !== state) { state = next; emit(); } },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

export const DEFAULT_SETTINGS: StorySettings = { subtitleSize: 'M', subtitleBg: 0.35, readSpeed: 'normal', actionCams: 'on', reduceShake: false, reduceFlash: false, autoChoke: false, cones: 'observe', noiseRing: true };
const SETTINGS_KEY = 'pvo-story-settings';

/** Settings persisted per browser (try/catch: storage may be blocked); unknown or bad fields fall back to defaults. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null | undefined): StorySettings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    const v = raw ? JSON.parse(raw) as Partial<StorySettings> : {};
    const d = DEFAULT_SETTINGS, pick = <K extends keyof StorySettings>(k: K, ok: (x: unknown) => boolean) => (ok(v[k]) ? v[k] as StorySettings[K] : d[k]);
    const bool = (x: unknown) => typeof x === 'boolean';
    return {
      subtitleSize: pick('subtitleSize', (x) => x === 'S' || x === 'M' || x === 'L'),
      subtitleBg: pick('subtitleBg', (x) => typeof x === 'number' && x >= 0 && x <= 1),
      readSpeed: pick('readSpeed', (x) => x === 'slow' || x === 'normal' || x === 'fast'),
      actionCams: pick('actionCams', (x) => x === 'on' || x === 'less' || x === 'off'),
      reduceShake: pick('reduceShake', bool), reduceFlash: pick('reduceFlash', bool), autoChoke: pick('autoChoke', bool),
      cones: pick('cones', (x) => x === 'always' || x === 'observe' || x === 'off'), noiseRing: pick('noiseRing', bool),
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(storage: Pick<Storage, 'setItem'> | null | undefined, settings: StorySettings) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}

export function emptyStoryUiView(settings: StorySettings = DEFAULT_SETTINGS): StoryUiView {
  return { cine: null, talk: [], objective: null, prompt: null, stealth: null, phone: null, journal: null, board: null, cctv: null, interrogation: null, menu: null, pause: null, result: null, toasts: [], touch: null, settings };
}
