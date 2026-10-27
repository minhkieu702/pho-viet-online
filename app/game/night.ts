import * as THREE from 'three';

/**
 * The night core (night plan §2, §4.1): one block of shared uniforms (`NIGHT`) that every night-lit material reads,
 * the clock logic behind it evaluated on the CPU once a frame (which opening-hour schedules are open now, how many
 * homes, offices and flats have their lights on), the light codes things carry, and the vertex-shader lookups.
 *
 * Rules (plan §2.1): no THREE light is ever added or removed and nothing compiles at runtime. Patched materials share
 * NIGHT's `{ value }` objects by reference (`Object.assign(shader.uniforms, NIGHT)`, or `{ ...NIGHT, ...own }` for a
 * ShaderMaterial; never UniformsUtils.merge, which clones them), and world.ts writes NIGHT once a frame (writeNight).
 * Every patch has its own explicit customProgramCacheKey.
 *
 * Light codes (one float per instance, `aLit`; plan §2.2):
 *   < 0          never lit (a building site, a dead building)
 *   0 ≤ c < 1    the street-lamp switch; `c` is the lamp's stagger seed (lampSeed)
 *   1 … 95       an opening-hours schedule (scheduleIndex): lit while it is open
 *   1000 + s     home rhythm with seed s ∈ [0, 1)       (HOME)
 *   2000 + s     office rhythm                          (OFFICE)
 *   3000 + s     flats and hotel rhythm                 (FLATS)
 *
 * Only three's math types are used, so node tests import this module.
 */

/** An opening span [open, close) in game hours; a close past 24 runs over midnight ([18, 25] is 18:00–01:00). */
export type Span = readonly [number, number];
/** Opening hours: counters.ts Hours. */
export type Schedule = readonly Span[];

/** Slots in the "open now" table: vec4[24] in GLSL. Slot 0 is never used (code 0 is the lamp switch). */
export const OPEN_SLOTS = 96;
export const HOME = 1000, OFFICE = 2000, FLATS = 3000;
/** Hours a light takes to come on after opening and to go off before closing (lights are out when the shutter drops). */
export const OPEN_RAMP = 0.1;
/** The opening ramp starts this far up, so a light is already on (> 0) at the very hour the counter opens. */
const RAMP_LEAD = 0.02;
/** How far lamp halos are drawn, by quality level (world.ts setDetail → writeNightDetail). */
export const HALO_FAR = [400, 400, 400, 180, 120, 80] as const;

/** The shared night uniforms. world.ts is the only writer (writeNight, writeNightDetail, writeNightFog). */
export const NIGHT = {
  /** atmosphere.night × power (0 in zombie mode): windows, shops, signs. */
  nightLevel: { value: 0 },
  /** atmosphere.lamps × power: the street-lamp switch. */
  nightLamps: { value: 0 },
  /** atmosphere.night, NOT × power: vehicle lights (the bike's own battery still works in zombie mode). */
  nightSky: { value: 0 },
  /** The game hour 0..24. */
  nightHour: { value: 12 },
  /** Seconds, wrapped (LED blink, cloth, TV flicker): world.ts's shaderTime can be this very object. */
  nightTime: { value: 0 },
  /** Ground wetness and rain 0..1 (atmosphere.rain). */
  nightWet: { value: 0 },
  nightRain: { value: 0 },
  /** The quality level 0..5 (world.setDetail). */
  nightDetail: { value: 0 },
  /** Metres: lamp halos fade out before this (HALO_FAR by level). */
  nightHaloFar: { value: 400 },
  /** Metres: shop, venue and stall light fades out before this (world.ts detailLimit). */
  nightShopFar: { value: 110 },
  /** The scene fog's near and far (after game.ts's glide adjustment). */
  nightFog: { value: new THREE.Vector2(120, 260) },
  /** Share of lights on now: x homes, y offices, z flats; w the TV share (CPU, updateNightTables). */
  nightRhythm: { value: new THREE.Vector4() },
  /**
   * The open level 0..1 of every schedule now (CPU, updateNightTables). A Float32Array, so three uploads it as it is
   * (an array of Vector4 would be flattened again in JS on every material switch). GLSL: uniform vec4 nightOpen[24].
   */
  nightOpen: { value: new Float32Array(OPEN_SLOTS) },
};
export type NightUniforms = typeof NIGHT;

// ---- Hashes and codes --------------------------------------------------------------------------------------------

/** world.ts's hash (the same sine hash), 0..1: per-instance seeds use it so the CPU and the batches agree. */
export function nightHash(x: number, y: number, z = 0) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
/** A street lamp's stagger seed (0.001..0.999) from its head position; its pool and its head hash the same point. */
export function lampSeed(x: number, z: number) {
  return 0.001 + 0.998 * nightHash(Math.round(x * 2), 0, Math.round(z * 2));
}
/** A rhythm code (HOME, OFFICE or FLATS) with a per-window seed from its position. */
export function rhythmCode(base: number, x: number, y: number, z: number) {
  return base + 0.998 * nightHash(x + 17.3, y, z);
}
/** A sign's glow strength 0..1 and its schedule code 0..95 in one float (`signGlow`): 2·code + strength. */
export function packGlow(strength: number, code: number) {
  const c = Math.max(0, Math.min(OPEN_SLOTS - 1, Math.round(code)));
  return 2 * c + Math.max(0, Math.min(1, strength));
}
/** The inverse of packGlow (the sign shader does the same in GLSL). */
export function unpackGlow(glow: number) {
  const code = Math.floor(glow / 2 + 1e-6);
  return { code, strength: glow - 2 * code };
}

// ---- Opening hours ---------------------------------------------------------------------------------------------

/** Rounds to the minute (schedules are compared and deduplicated by minute). */
const minute = (h: number) => Math.round(h * 60) / 60;

/**
 * A schedule as disjoint arcs on the 24 h circle: each [a, b) with a in [0, 24) and a < b < a + 24, sorted, merged
 * where they overlap or touch (also across midnight). `null` means always open. Wrapped input ([17, 2]) runs over
 * midnight ([17, 26]).
 */
export function normalizeSchedule(hours: Schedule): [number, number][] | null {
  const arcs: [number, number][] = [];
  for (const [a0, b0] of hours) {
    let a = minute(a0), b = minute(b0);
    if (!(b > a)) b += 24;
    if (b - a >= 24) return null;
    const shift = Math.floor(a / 24) * 24;
    a -= shift; b -= shift;
    arcs.push([a, b]);
  }
  if (!arcs.length) return [];
  arcs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const merged: [number, number][] = [];
  for (const arc of arcs) {
    const last = merged[merged.length - 1];
    if (last && arc[0] <= last[1]) last[1] = Math.max(last[1], arc[1]);
    else merged.push([arc[0], arc[1]]);
  }
  // Across midnight: the last arc running into the first one (e.g. [17, 24] and [0, 2]).
  while (merged.length > 1) {
    const first = merged[0], last = merged[merged.length - 1];
    if (last[1] < first[0] + 24) break;
    merged.shift();
    last[1] = Math.max(last[1], first[1] + 24);
  }
  for (const [a, b] of merged) if (b - a >= 24) return null;
  return merged;
}
const scheduleKey = (arcs: [number, number][] | null) => (arcs ? arcs.map(([a, b]) => `${a}-${b}`).join(',') : 'always');

/** The open level 0..1 at hour `h` (0..24) of normalized arcs (see openLevel). */
function levelOf(arcs: [number, number][] | null, h: number, ramp = OPEN_RAMP) {
  if (!arcs) return 1;
  for (const [a, b] of arcs) {
    const t = h >= a ? h : h + 24;
    if (t >= b) continue;
    return Math.max(0, Math.min(1, (t - a + RAMP_LEAD) / (ramp + RAMP_LEAD), (b - t) / ramp));
  }
  return 0;
}

/**
 * How open a schedule is at an hour, 0..1: 0 outside its hours; it ramps up over the first `ramp` hours after
 * opening (already above 0 at the opening minute) and down over the last `ramp` hours before closing, so a shop's
 * lights are off when game.ts's shutter drops. Away from the ramps, openLevel > 0 exactly when counters.isOpen.
 */
export function openLevel(hours: Schedule, hour: number, ramp = OPEN_RAMP) {
  return levelOf(normalizeSchedule(hours), ((hour % 24) + 24) % 24, ramp);
}

/** Registered schedules by slot (slot 0 unused) and their slots by key. */
const slots: { key: string; arcs: [number, number][] | null }[] = [{ key: '', arcs: null }];
const slotOf = new Map<string, number>();
let overflowWarned = false;
/** The hour the tables were last filled for (NaN: fill again). */
let lastTableHour = NaN, lastAllOpen = false;

/**
 * The slot 1..95 of a schedule (registered on first use; equal schedules share a slot). night-hours.ts registers
 * every schedule of the map at module init, so no tile build registers one mid-game. Past the table it returns 0
 * ("on with the night") with one warning; it never throws.
 */
export function scheduleIndex(hours: Schedule): number {
  const arcs = normalizeSchedule(hours);
  const key = scheduleKey(arcs);
  const known = slotOf.get(key);
  if (known !== undefined) return known;
  if (slots.length >= OPEN_SLOTS) {
    if (!overflowWarned) { overflowWarned = true; console.warn(`night.ts: more than ${OPEN_SLOTS - 1} opening-hour schedules; ${key} lights with the night`); }
    return 0;
  }
  const slot = slots.length;
  slots.push({ key, arcs });
  slotOf.set(key, slot);
  lastTableHour = NaN;
  return slot;
}
/** How many schedules are registered (tests: at most 90 with every slice wired). */
export const scheduleCount = () => slots.length - 1;
/** The normalized schedule in a slot (tests and tools). */
export const scheduleAt = (slot: number) => slots[slot]?.arcs;

// ---- Rhythms -----------------------------------------------------------------------------------------------------

const ss = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
/** Share of home windows lit at `t` (hours 12..36: past midnight is 24 + h). */
export function home(t: number) {
  let p = mix(0.35, 0.85, ss(17.5, 19, t));
  p = mix(p, 0.40, ss(21.5, 23.5, t)); p = mix(p, 0.15, ss(23.5, 25, t));
  p = mix(p, 0.08, ss(25, 25.5, t)); p = mix(p, 0.35, ss(28.5, 29.5, t));
  return mix(p, 0, ss(30, 30.5, t));
}
/** Share of office windows lit at `t`. */
export function office(t: number) {
  let p = mix(0.9, 0.55, ss(18, 20, t)); p = mix(p, 0.18, ss(20, 22.5, t));
  p = mix(p, 0.06, ss(22.5, 24, t)); return mix(p, 0.3, ss(29.5, 30.5, t));
}
/** Share of flat and hotel windows lit at `t`. */
export function flats(t: number) {
  let p = mix(0.5, 0.9, ss(17.5, 19.5, t)); p = mix(p, 0.55, ss(22, 24, t));
  p = mix(p, 0.2, ss(24, 26, t)); p = mix(p, 0.12, ss(26, 27, t));
  return mix(p, 0.4, ss(28.5, 29.5, t));
}
/** How much of the lit homes' share watches TV (blue flicker) at `t`. */
export const tv = (t: number) => ss(19, 19.5, t) * (1 - ss(23, 23.5, t));
/** The rhythm clock: the evening and the night after it run on, 12..36. */
export const rhythmClock = (hour: number) => { const h = ((hour % 24) + 24) % 24; return h < 12 ? h + 24 : h; };

// ---- The per-frame writer ----------------------------------------------------------------------------------------

/**
 * Fills the CPU tables for an hour: every schedule's open level (NIGHT.nightOpen) and the rhythms (NIGHT.nightRhythm).
 * `allOpen` (zombie mode) opens every schedule, so neon keeps its old dim glow there (plan A14). About 70 comparisons;
 * skipped while the hour has not moved.
 */
export function updateNightTables(hour: number, allOpen = false) {
  const h = ((hour % 24) + 24) % 24;
  if (h === lastTableHour && allOpen === lastAllOpen) return;
  lastTableHour = h; lastAllOpen = allOpen;
  const open = NIGHT.nightOpen.value;
  open[0] = 1;
  for (let i = 1; i < slots.length; i++) open[i] = allOpen ? 1 : levelOf(slots[i].arcs, h);
  const t = rhythmClock(h);
  NIGHT.nightRhythm.value.set(home(t), office(t), flats(t), tv(t));
}

/**
 * world.ts setAtmosphere's one call, every frame and before its "nothing changed" early return: the night level
 * (× power: no electricity in zombie mode), the lamp switch, the sky's own night, weather and the hour tables.
 */
export function writeNight(a: { night: number; lamps: number; power: number; hours: number; wet: number; rain: number }) {
  NIGHT.nightLevel.value = a.night * a.power;
  NIGHT.nightLamps.value = a.lamps * a.power;
  NIGHT.nightSky.value = a.night;
  NIGHT.nightHour.value = a.hours;
  NIGHT.nightWet.value = a.wet;
  NIGHT.nightRain.value = a.rain;
  updateNightTables(a.hours, a.power === 0);
}
/** world.ts setDetail: the quality level, halo distance by level, and where shop light stops (detailLimit). */
export function writeNightDetail(level: number, shopFar: number) {
  const lv = Math.max(0, Math.min(HALO_FAR.length - 1, Math.round(level)));
  NIGHT.nightDetail.value = lv;
  NIGHT.nightHaloFar.value = HALO_FAR[lv];
  NIGHT.nightShopFar.value = shopFar;
}
/** The scene fog's range (after game.ts's glide adjustment), for light decals that fade with the fog. */
export function writeNightFog(near: number, far: number) { NIGHT.nightFog.value.set(near, far); }

// ---- The lit factor: GLSL and its JS twin ------------------------------------------------------------------------

/**
 * Vertex-shader lookups. The includer declares `nightDayBase` first: `uniform float nightDayBase;` (patched roles,
 * per material) or `#define nightDayBase 0.0` (light decals, vehicle lights). nightLight(code) returns x the lit
 * factor 0..1, y the TV share, z whether the window has a cool-white tube.
 */
export const NIGHT_GLSL = /* glsl */ `
uniform float nightLevel; uniform float nightLamps; uniform float nightTime;
uniform vec4 nightRhythm; uniform vec4 nightOpen[${OPEN_SLOTS / 4}];
float nightOpenAt(float code) {
  int i = int(code + 0.5); vec4 v = nightOpen[i >> 2]; int k = i & 3;
  return k == 0 ? v.x : (k == 1 ? v.y : (k == 2 ? v.z : v.w));
}
vec3 nightLight(float code) {
  if (code < 0.0) return vec3(0.0);
  if (code < 1.0) return vec3(max(smoothstep(code * 0.6, code * 0.6 + 0.4, nightLamps), nightDayBase), 0.0, 0.0);
  if (code < ${OPEN_SLOTS}.0) return vec3(nightOpenAt(code) * mix(nightDayBase, 1.0, nightLevel), 0.0, 0.0);
  float s = fract(code), k = floor(code * 0.001);
  float p = k < 1.5 ? nightRhythm.x : (k < 2.5 ? nightRhythm.y : nightRhythm.z);
  float on = step(s, p) * nightLevel;
  float tv = (k < 1.5 || k > 2.5) ? step(fract(s * 7.13), 0.10) * nightRhythm.w : 0.0;
  float flick = 0.88 + 0.12 * sin(nightTime * 9.1 + s * 61.0) * sin(nightTime * 2.3 + s * 17.0);
  return vec3(on * mix(1.0, 0.7 * flick, tv), tv, step(fract(s * 3.7), 0.45));
}
`;

const smoothstep = (a: number, b: number, x: number) => ss(a, b, x);
const fract = (x: number) => x - Math.floor(x);
const step = (edge: number, x: number) => (x < edge ? 0 : 1);
/** The JS twin of GLSL nightLight (tests): [lit, tv, cool]. */
export function nightLightJs(code: number, o: { level: number; lamps: number; dayBase?: number; time?: number; rhythm?: THREE.Vector4; open?: Float32Array }): [number, number, number] {
  const dayBase = o.dayBase ?? 0, rhythm = o.rhythm ?? NIGHT.nightRhythm.value, open = o.open ?? NIGHT.nightOpen.value, time = o.time ?? 0;
  if (code < 0) return [0, 0, 0];
  if (code < 1) return [Math.max(smoothstep(code * 0.6, code * 0.6 + 0.4, o.lamps), dayBase), 0, 0];
  if (code < OPEN_SLOTS) return [open[Math.floor(code + 0.5)] * mix(dayBase, 1, o.level), 0, 0];
  const s = fract(code), k = Math.floor(code * 0.001);
  const p = k < 1.5 ? rhythm.x : k < 2.5 ? rhythm.y : rhythm.z;
  const on = step(s, p) * o.level;
  const tvShare = k < 1.5 || k > 2.5 ? step(fract(s * 7.13), 0.1) * rhythm.w : 0;
  const flick = 0.88 + 0.12 * Math.sin(time * 9.1 + s * 61) * Math.sin(time * 2.3 + s * 17);
  return [on * mix(1, 0.7 * flick, tvShare), tvShare, step(fract(s * 3.7), 0.45)];
}

// ---- Material patches ----------------------------------------------------------------------------------------------

/** The fragment block of patchNight: replaces `#include <aomap_fragment>`, after every role's own emissive edits. */
const NIGHT_ROLE_FRAGMENT = /* glsl */ `{
  vec3 nightE = totalEmissiveRadiance;
  #ifdef USE_COLOR
  nightE = mix(nightE, nightE * vColor.rgb, nightTint);
  #endif
  float nightY = dot(nightE, vec3(0.2126, 0.7152, 0.0722));
  nightE = mix(nightE, vec3(0.80, 0.88, 1.00) * nightY * 1.15, vNightL.z * nightCool);
  nightE = mix(nightE, vec3(0.42, 0.58, 1.00) * nightY * 1.30, vNightL.y);
  totalEmissiveRadiance = nightE * vNightL.x;
}
#include <aomap_fragment>`;

/** Every program key a night.ts patch declares (tests snapshot this list so no two patches share a key). */
export const NIGHT_PROGRAM_KEYS = ['night-role', 'night-tube', 'night-led', 'night-neon', 'far-windows'] as const;
export type NightProgramKey = (typeof NIGHT_PROGRAM_KEYS)[number];

/** A patched material's own night uniforms (three keeps uniforms per material even when the program is shared). */
export type NightOwn = { nightTint: { value: number }; nightCool: { value: number }; nightDayBase: { value: number } };

/** A material's explicitly set program key (own property), to chain under; three's default (the source text) is not used. */
function ownKey(material: THREE.Material): (() => string) | null {
  return Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey.bind(material) : null;
}

/**
 * Lights a role material by each instance's light code (`aLit`): the lit factor multiplies its emissive (plan §4.1).
 * `tint` multiplies the emissive by the instance colour (lamp heads), `cool` gives 45 % of rhythm windows a cool-white
 * tube and the TV share its blue, `dayBase` keeps a role's daytime glow as it was (tube 0.1/2.3, led 0.25/2.05, neon
 * 0.45/2.35). The options are per-material uniforms, so lamp, lantern and glassLit compile one source under one key
 * ('night-role'). Chains the previous onBeforeCompile (call it after patchGlow, before world.ts's cutaway loop) and
 * the previous explicit key (`<previous>|<key>`). Every geometry drawn with the material must carry `aLit`.
 */
export function patchNight(material: THREE.MeshStandardMaterial, key: NightProgramKey, opts: { cool?: boolean; tint?: boolean; dayBase?: number } = {}): NightOwn {
  const own: NightOwn = { nightTint: { value: opts.tint ? 1 : 0 }, nightCool: { value: opts.cool ? 1 : 0 }, nightDayBase: { value: opts.dayBase ?? 0 } };
  const previous = material.onBeforeCompile;
  const previousKey = ownKey(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, NIGHT, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aLit;\nvarying vec3 vNightL;\nuniform float nightDayBase;\n${NIGHT_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNightL = nightLight(aLit);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNightL;\nuniform float nightTint;\nuniform float nightCool;')
      .replace('#include <aomap_fragment>', NIGHT_ROLE_FRAGMENT);
  };
  material.customProgramCacheKey = previousKey ? () => `${previousKey()}|${key}` : () => key;
  material.userData.night = own;
  return own;
}

/**
 * Far stand-ins get windows at night (plan §6.7): on walls above 3 m a 2.6 × 3.2 m grid with a window in the middle of
 * each cell, lit by the far batch's code (−1 never; HOME, OFFICE or FLATS by their rhythm). All inside
 * `if (nightLevel > 0.001)`, so the day pays nothing; off at quality level 5. Key 'far-windows'. Every geometry drawn
 * with the material must carry `aLit`.
 */
export function patchFarWindows(material: THREE.MeshStandardMaterial) {
  const previous = material.onBeforeCompile;
  const previousKey = ownKey(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, NIGHT);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit;\nvarying vec3 vFarPos;\nvarying vec3 vFarN;\nvarying float vFarCode;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  mat4 farM = modelMatrix;
  #ifdef USE_INSTANCING
  farM = modelMatrix * instanceMatrix;
  #endif
  vFarPos = (farM * vec4(transformed, 1.0)).xyz;
  vFarN = mat3(farM) * normal;
  vFarCode = aLit;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFarPos;\nvarying vec3 vFarN;\nvarying float vFarCode;\nuniform float nightLevel;\nuniform float nightDetail;\nuniform vec4 nightRhythm;')
      .replace('#include <aomap_fragment>', `if (nightLevel > 0.001 && nightDetail < 4.5 && vFarCode >= 0.0) {
  vec3 farN = normalize(vFarN);
  if (abs(farN.y) < 0.7 && vFarPos.y > 3.0) {
    vec2 farT = normalize(vec2(-farN.z, farN.x));
    vec2 farG = vec2(dot(vFarPos.xz, farT) / 2.6, vFarPos.y / 3.2);
    vec2 farF = fract(farG);
    float farWin = step(0.25, farF.x) * step(farF.x, 0.75) * step(0.25, farF.y) * step(farF.y, 0.75);
    float farFace = floor(atan(farN.z, farN.x) * 0.6366 + 0.5);
    float farSeed = fract(sin(dot(floor(farG) + farFace * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
    float farShare = vFarCode < 1500.0 ? nightRhythm.x : (vFarCode < 2500.0 ? nightRhythm.y : nightRhythm.z);
    totalEmissiveRadiance += step(farSeed, farShare) * nightLevel * farWin * vec3(1.0, 0.78, 0.5) * 0.9;
  }
}
#include <aomap_fragment>`);
  };
  material.customProgramCacheKey = previousKey ? () => `${previousKey()}|far-windows` : () => 'far-windows';
}
