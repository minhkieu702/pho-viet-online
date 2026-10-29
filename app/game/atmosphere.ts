import * as THREE from 'three';
import { SECONDS_PER_HOUR, clockText, createClock } from './clock';

export type Weather = 'clear' | 'cloudy' | 'rain';
const WEATHER_LABEL: Record<Weather, string> = { clear: 'Nắng', cloudy: 'Nhiều mây', rain: 'Mưa' };

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Where the sun is at an hour: it rises at 6:00 in the east (+x), peaks at noon and sets at 18:00. */
function sunAt(hours: number, out: THREE.Vector3) {
  const angle = (hours - 6) / 12 * Math.PI;
  return out.set(Math.cos(angle) * 0.75, Math.sin(angle), 0.35).normalize();
}
const elevationScratch = new THREE.Vector3();
/** The sun's elevation (the y of its unit direction, -1..1) at an hour: the curves below all hang on it. */
export function sunElevation(hours: number) { return sunAt(hours, elevationScratch).y; }
/** 0 by day, 1 at night: windows, signs and shop light (17:37 → 18:23 on, 05:37 → 06:23 off). */
export const nightAt = (elevation: number) => 1 - smoothstep(-0.12, 0.12, elevation);
/** The street-lamp switch: 17:45 → 18:15 on, 05:45 → 06:15 off (each lamp at its own moment inside that ramp). */
export const lampsAt = (elevation: number) => 1 - smoothstep(-0.08, 0.08, elevation);
/** 0 at night, 1 by day: the sun's and the sky's strength. */
export const dayAt = (elevation: number) => smoothstep(-0.12, 0.25, elevation);

// Night light (the night plan §3): a neutral moonlit sky and a warm street bounce instead of the day's cream
// hemisphere, a brighter moon and a touch more exposure, so a night is a little brighter and still clearly night.
// Zombie mode keeps the old night exactly: every night change below is scaled by `calm` (1 - the zombie mood).
const DAY_SKY = new THREE.Color('#fff2d2'), DAY_GROUND = new THREE.Color('#789a8c');
const NIGHT_SKY = new THREE.Color('#d3d8e4'), NIGHT_GROUND = new THREE.Color('#8c7d68');
const MOON_OLD = new THREE.Color('#8fa6d8'), MOON = new THREE.Color('#a9bde6');
const NIGHT_HORIZON_OLD = new THREE.Color('#1c2433'), NIGHT_HORIZON = new THREE.Color('#222b3b');
const NIGHT_TINT_OLD = new THREE.Color('#2a3550'), NIGHT_TINT = new THREE.Color('#323e5a');
/** Sodium skyglow under cloud: a rainy or overcast city night is lit orange-brown from below, not darker. */
const SKYGLOW = new THREE.Color('#3d3533'), SKYGLOW_TINT = new THREE.Color('#4a3f3b');
/** Tone-mapping exposure by day (and indoors), and how much more a calm night gets. */
export const DAY_EXPOSURE = 1.14;
const NIGHT_EXPOSURE_GAIN = 0.06;
/** The hemisphere's strength by day, and at night (zombie night, calm night). */
const HEMI_DAY = 2.55, HEMI_NIGHT_ZOMBIE = 0.55, HEMI_NIGHT_GAIN = 0.3;
/** The sun's strength by day, and the moon's (zombie night, calm night). */
const SUN_DAY = 3.7, MOON_ZOMBIE = 0.35, MOON_GAIN = 0.15;
/** On localhost `?night=old` keeps the old, darker night (A/B benches and before/after shots); never in production. */
const OLD_NIGHT = (() => {
  try {
    const g = globalThis as { location?: { hostname: string; search: string } };
    return !!g.location && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(g.location.hostname) && new URLSearchParams(g.location.search).get('night') === 'old';
  } catch { return false; }
})();

/**
 * Time of day and weather: moves the sun, tints sky and fog, dims lights at night and in rain,
 * and draws rain as one shader-animated line batch that follows the camera (no per-drop CPU work).
 */
export function createAtmosphere(scene: THREE.Scene, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, startHour = 7.5) {
  const clock = createClock(startHour);
  let weather: Weather = 'clear';
  // Real seconds until the weather changes again.
  let weatherTimer = (2 + Math.random() * 3) * SECONDS_PER_HOUR;
  let rain = 0;
  let cover = 0.15;
  // Zombie mode's mood: a smoky, sickly haze, a weaker sun, and never a clear sky.
  let apocalypse = false;
  let mood = 0;
  // ---- zombie co-op (design.md §5, MUTANTS): the dread director's fog (night fog, boss haze) ----
  let dreadNear: number | null = null, dreadFar: number | null = null;
  // ---- end zombie co-op ----
  const haze = new THREE.Color('#8d8c78'), hazeNight = new THREE.Color('#2a2c27'), emberSun = new THREE.Color('#ffb27a'), hazeTint = new THREE.Color('#b8a988');
  let lastShadowDir = new THREE.Vector3();
  const sunDirection = new THREE.Vector3(-0.45, 0.8, 0.25).normalize();
  const tint = new THREE.Color();
  const horizon = new THREE.Color();
  const fog = scene.fog as THREE.Fog;
  const background = scene.background as THREE.Color;

  // Drops live in a unit cube that the shader stretches to a box around the camera's focus; the box
  // grows with the zoom so rain always fills the view, and fades out toward its edges.
  const DROPS = 7000;
  const positions = new Float32Array(DROPS * 6);
  const ends = new Float32Array(DROPS * 2);
  for (let i = 0; i < DROPS; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    positions.set([x, y, z, x, y, z], i * 6);
    ends[i * 2 + 1] = 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('end', new THREE.BufferAttribute(ends, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, focus: { value: new THREE.Vector3() }, amount: { value: 0 }, wind: { value: new THREE.Vector2(1.2, 0.6) }, box: { value: 60 }, height: { value: 30 } },
    vertexShader: `
      attribute float end;
      uniform float time; uniform vec3 focus; uniform vec2 wind; uniform float box; uniform float height;
      varying float vEnd; varying float vFade;
      void main() {
        vec3 p = position * vec3(box, height, box);
        p.y = mod(p.y - time * 22.0, height);
        p.xz = mod(p.xz + wind * (height - p.y) * 0.05 - focus.xz + box * 0.5, box) + focus.xz - box * 0.5;
        vec2 offset = abs(p.xz - focus.xz) / (box * 0.5);
        vFade = 1.0 - smoothstep(0.7, 1.0, max(offset.x, offset.y));
        p.y += focus.y - height * 0.25;
        // The second vertex of each drop trails upward; longer streaks when seen from further away.
        float streak = 0.75 * clamp(box / 60.0, 1.0, 2.5);
        p += vec3(-wind.x * 0.05, streak, -wind.y * 0.05) * end;
        vEnd = end;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float amount; varying float vEnd; varying float vFade;
      void main() { gl_FragColor = vec4(0.78, 0.84, 0.9, amount * vFade * (0.55 - vEnd * 0.4)); }`,
  });
  const drops = new THREE.LineSegments(geometry, material);
  drops.frustumCulled = false;
  drops.visible = false;
  scene.add(drops);

  const dayHorizon = new THREE.Color('#dce7e6'), duskHorizon = new THREE.Color('#e9b48a'), nightHorizon = new THREE.Color(), rainHorizon = new THREE.Color('#9aa3a6');
  const daySun = new THREE.Color('#ffe5be'), duskSun = new THREE.Color('#ff9a5a'), moon = new THREE.Color();
  const dayTint = new THREE.Color('#ffffff'), duskTint = new THREE.Color('#f2b08a'), nightTint = new THREE.Color(), rainTint = new THREE.Color('#9aa2a8');
  let exposure = DAY_EXPOSURE;

  return {
    get hours() { return clock.hours; },
    clock,
    get weather() { return weather; },
    get rain() { return rain; },
    get night() { return nightAt(sunDirection.y); },
    /** The street-lamp switch 0..1 (on a little after windows and shops, off a little before them). */
    get lamps() { return lampsAt(sunDirection.y); },
    /** Tone-mapping exposure for the street (game.ts applies it; indoors keep DAY_EXPOSURE). */
    get exposure() { return exposure; },
    /** The sun's elevation at an hour (the pure function the day, night and lamp curves use). */
    sunAt: sunElevation,
    sunDirection,
    tint,
    get cover() { return cover; },
    /** The HUD's clock line ("21:05 · Trời quang"): a clear night is "Trời quang", not "Nắng" (sunshine). */
    label() { return `${clockText(clock.hours)} · ${weather === 'clear' && nightAt(sunDirection.y) > 0.5 ? 'Trời quang' : WEATHER_LABEL[weather]}`; },
    setWeather(next: Weather) { weather = next; weatherTimer = (2 + Math.random() * 4) * SECONDS_PER_HOUR; },
    setHours(next: number) { clock.set(next); },
    // ---- zombie co-op (design.md §5, MUTANTS) ----
    /** Fog from dread.ts: when set, fog near/far become min(own, dread); null gives the weather's fog back. */
    setDread(fogNear: number | null, fogFar: number | null) { dreadNear = fogNear; dreadFar = fogFar; },
    // ---- end zombie co-op ----
    setApocalypse(on: boolean) {
      apocalypse = on;
      if (on && weather === 'clear') weather = 'cloudy';
    },
    /** Advances the clock; returns true when the sun moved enough that the static shadow map should be redrawn. */
    update(dt: number, time: number, focus: THREE.Vector3, spread = 60) {
      const hours = clock.advance(dt);
      weatherTimer -= dt;
      if (weatherTimer <= 0) {
        const roll = Math.random();
        weather = apocalypse ? (roll < 0.65 ? 'cloudy' : 'rain') : roll < 0.45 ? 'clear' : roll < 0.72 ? 'cloudy' : 'rain';
        weatherTimer = (2 + Math.random() * 4) * SECONDS_PER_HOUR;
      }
      const wantRain = weather === 'rain' ? 1 : 0;
      rain += (wantRain - rain) * Math.min(1, dt * 0.25);
      const wantCover = weather === 'clear' ? 0.15 : weather === 'cloudy' ? 0.65 : 0.95;
      cover += (wantCover - cover) * Math.min(1, dt * 0.2);
      sunAt(hours, sunDirection);
      const elevation = sunDirection.y;
      const day = dayAt(elevation);
      const dusk = Math.max(0, 1 - Math.abs(elevation - 0.08) / 0.22) * (1 - rain * 0.7);
      const night = nightAt(elevation);
      mood += ((apocalypse ? 1 : 0) - mood) * Math.min(1, dt * 0.6);
      // Every change to the night is scaled by `calm`, so zombie mode's dark nights stay as they were.
      const calm = OLD_NIGHT ? 0 : 1 - mood;
      // Below the horizon the directional light becomes a bluish moon from the opposite side.
      if (elevation > -0.05) sun.position.copy(sunDirection).multiplyScalar(100);
      else sun.position.set(-sunDirection.x, 0.6, -sunDirection.z).normalize().multiplyScalar(100);
      moon.copy(MOON_OLD).lerp(MOON, calm);
      sun.color.copy(daySun).lerp(duskSun, dusk).lerp(moon, night);
      sun.color.lerp(emberSun, mood * 0.45);
      const moonI = MOON_ZOMBIE + MOON_GAIN * calm;
      sun.intensity = (moonI + (SUN_DAY - moonI) * day) * (1 - rain * 0.55) * (1 - cover * 0.25) * (1 - mood * 0.3);
      // The hemisphere turns from the day's cream sky to a neutral moonlit one over a warm street bounce. A rainy
      // night loses less than a rainy day: the city lights its own clouds.
      hemi.color.copy(DAY_SKY).lerp(NIGHT_SKY, night * calm);
      hemi.groundColor.copy(DAY_GROUND).lerp(NIGHT_GROUND, night * calm);
      const hemiNight = HEMI_NIGHT_ZOMBIE + HEMI_NIGHT_GAIN * calm;
      hemi.intensity = (hemiNight + (HEMI_DAY - hemiNight) * day) * (1 - rain * 0.35 * (1 - 0.6 * night * calm)) * (1 - mood * 0.25);
      nightHorizon.copy(NIGHT_HORIZON_OLD).lerp(NIGHT_HORIZON, calm);
      horizon.copy(dayHorizon).lerp(duskHorizon, dusk).lerp(nightHorizon, night).lerp(rainHorizon, rain * (1 - night * 0.7));
      // Under cloud the night sky glows sodium orange-brown (before the background and the fog take the colour).
      horizon.lerp(SKYGLOW, night * cover * 0.55 * calm);
      background.copy(horizon);
      fog.color.copy(horizon);
      if (mood > 0.001) {
        horizon.lerp(night > 0.5 ? hazeNight : haze, mood * 0.7);
        background.copy(horizon);
        fog.color.copy(horizon);
      }
      fog.near = (120 - rain * 70) * (1 - mood * 0.6);
      fog.far = (260 - rain * 110) * (1 - mood * 0.35);
      // ---- zombie co-op (design.md §5, MUTANTS) ----
      if (dreadNear !== null) fog.near = Math.min(fog.near, dreadNear);
      if (dreadFar !== null) fog.far = Math.max(fog.near + 1, Math.min(fog.far, dreadFar));
      // ---- end zombie co-op ----
      nightTint.copy(NIGHT_TINT_OLD).lerp(NIGHT_TINT, calm);
      tint.copy(dayTint).lerp(duskTint, dusk).lerp(nightTint, night).lerp(rainTint, rain * (1 - night * 0.6))
        .lerp(SKYGLOW_TINT, night * cover * 0.5 * calm).lerp(hazeTint, mood * 0.45 * (1 - night));
      exposure = DAY_EXPOSURE + NIGHT_EXPOSURE_GAIN * night * calm;
      material.uniforms.time.value = time;
      material.uniforms.amount.value = rain;
      material.uniforms.focus.value.copy(focus);
      material.uniforms.box.value = spread;
      material.uniforms.height.value = Math.max(30, spread * 0.45);
      drops.visible = rain > 0.03;
      const moved = sunDirection.angleTo(lastShadowDir) > 0.035;
      if (moved) lastShadowDir = sunDirection.clone();
      return moved;
    },
    dispose() {
      scene.remove(drops);
      geometry.dispose();
      material.dispose();
    },
  };
}
