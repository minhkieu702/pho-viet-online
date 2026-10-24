import * as THREE from 'three';

export type Weather = 'clear' | 'cloudy' | 'rain';
const WEATHER_LABEL: Record<Weather, string> = { clear: 'Nắng', cloudy: 'Nhiều mây', rain: 'Mưa' };
// One in-game day lasts 24 real minutes: an hour of game time per real minute.
const SECONDS_PER_HOUR = 60;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Time of day and weather: moves the sun, tints sky and fog, dims lights at night and in rain,
 * and draws rain as one shader-animated line batch that follows the camera (no per-drop CPU work).
 */
export function createAtmosphere(scene: THREE.Scene, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, startHour = 7.5) {
  let hours = startHour;
  let weather: Weather = 'clear';
  // Real seconds until the weather changes again.
  let weatherTimer = (2 + Math.random() * 3) * SECONDS_PER_HOUR;
  let rain = 0;
  let cover = 0.15;
  // Zombie mode's mood: a smoky, sickly haze, a weaker sun, and never a clear sky.
  let apocalypse = false;
  let mood = 0;
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

  const dayHorizon = new THREE.Color('#dce7e6'), duskHorizon = new THREE.Color('#e9b48a'), nightHorizon = new THREE.Color('#1c2433'), rainHorizon = new THREE.Color('#9aa3a6');
  const daySun = new THREE.Color('#ffe5be'), duskSun = new THREE.Color('#ff9a5a'), moon = new THREE.Color('#8fa6d8');
  const dayTint = new THREE.Color('#ffffff'), duskTint = new THREE.Color('#f2b08a'), nightTint = new THREE.Color('#2a3550'), rainTint = new THREE.Color('#9aa2a8');

  return {
    get hours() { return hours; },
    get weather() { return weather; },
    get rain() { return rain; },
    get night() { return 1 - smoothstep(-0.12, 0.12, sunDirection.y); },
    sunDirection,
    tint,
    get cover() { return cover; },
    label() {
      const h = Math.floor(hours) % 24, m = Math.floor((hours % 1) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${WEATHER_LABEL[weather]}`;
    },
    setWeather(next: Weather) { weather = next; weatherTimer = (2 + Math.random() * 4) * SECONDS_PER_HOUR; },
    setHours(next: number) { hours = ((next % 24) + 24) % 24; },
    setApocalypse(on: boolean) {
      apocalypse = on;
      if (on && weather === 'clear') weather = 'cloudy';
    },
    /** Advances the clock; returns true when the sun moved enough that the static shadow map should be redrawn. */
    update(dt: number, time: number, focus: THREE.Vector3, spread = 60) {
      hours = (hours + dt / SECONDS_PER_HOUR) % 24;
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
      // Sun rises at 6:00 in the east (+x), peaks at noon, sets at 18:00.
      const angle = (hours - 6) / 12 * Math.PI;
      sunDirection.set(Math.cos(angle) * 0.75, Math.sin(angle), 0.35).normalize();
      const elevation = sunDirection.y;
      const day = smoothstep(-0.12, 0.25, elevation);
      const dusk = Math.max(0, 1 - Math.abs(elevation - 0.08) / 0.22) * (1 - rain * 0.7);
      const night = 1 - smoothstep(-0.12, 0.12, elevation);
      // Below the horizon the directional light becomes a dim bluish moon from the opposite side.
      if (elevation > -0.05) sun.position.copy(sunDirection).multiplyScalar(100);
      else sun.position.set(-sunDirection.x, 0.6, -sunDirection.z).normalize().multiplyScalar(100);
      sun.color.copy(daySun).lerp(duskSun, dusk).lerp(moon, night);
      mood += ((apocalypse ? 1 : 0) - mood) * Math.min(1, dt * 0.6);
      sun.color.lerp(emberSun, mood * 0.45);
      sun.intensity = (0.35 + 3.35 * day) * (1 - rain * 0.55) * (1 - cover * 0.25) * (1 - mood * 0.3);
      hemi.intensity = (0.55 + 2.0 * day) * (1 - rain * 0.35) * (1 - mood * 0.25);
      horizon.copy(dayHorizon).lerp(duskHorizon, dusk).lerp(nightHorizon, night).lerp(rainHorizon, rain * (1 - night * 0.7));
      background.copy(horizon);
      fog.color.copy(horizon);
      if (mood > 0.001) {
        horizon.lerp(night > 0.5 ? hazeNight : haze, mood * 0.7);
        background.copy(horizon);
        fog.color.copy(horizon);
      }
      fog.near = (120 - rain * 70) * (1 - mood * 0.6);
      fog.far = (260 - rain * 110) * (1 - mood * 0.35);
      tint.copy(dayTint).lerp(duskTint, dusk).lerp(nightTint, night).lerp(rainTint, rain * (1 - night * 0.6)).lerp(hazeTint, mood * 0.45 * (1 - night));
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
