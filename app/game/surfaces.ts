import * as THREE from 'three';

/**
 * Procedural surfaces for the instanced boxes and prisms of world.ts, painted in world space by the fragment shader
 * so they cost no extra geometry or draw calls: weathered render (raw concrete party walls, rain streaks under every
 * ledge, a damp foot), square tiles (sidewalk paving, gạch lá nem roof decks, wall cladding), barrel roof tiles with
 * moss at the eaves, and the glow of fluorescent tubes and blinking LED borders. Every patched material gets its own
 * program cache key (the cutaway wrapper in world.ts has the same source for every material).
 */

/**
 * One 256x256 tileable noise texture: R = four octaves of value noise (blotches), G = streak noise stretched along y,
 * B = grain. A DataTexture, so it needs no canvas.
 */
export function surfaceNoise() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  let s = 90210;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  /** Adds tileable value noise from an sx x sy lattice (smoothstep-interpolated over the texture) into out, weighted. */
  const layer = (sx: number, sy: number, out: Float32Array, weight: number) => {
    const lat = new Float32Array(sx * sy);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const X0 = new Int32Array(N), X1 = new Int32Array(N), UX = new Float32Array(N);
    for (let x = 0; x < N; x++) {
      const f = (x / N) * sx, i = Math.floor(f), t = f - i;
      X0[x] = i % sx; X1[x] = (i + 1) % sx; UX[x] = t * t * (3 - 2 * t);
    }
    for (let y = 0; y < N; y++) {
      const f = (y / N) * sy, j = Math.floor(f), t = f - j, uy = t * t * (3 - 2 * t);
      const r0 = (j % sy) * sx, r1 = ((j + 1) % sy) * sx, row = y * N;
      for (let x = 0; x < N; x++) {
        const ux = UX[x], a = lat[r0 + X0[x]], b = lat[r0 + X1[x]], c = lat[r1 + X0[x]], d = lat[r1 + X1[x]];
        out[row + x] += ((a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy) * weight;
      }
    }
  };
  const blotch = new Float32Array(N * N), streak = new Float32Array(N * N);
  [4, 8, 16, 32].forEach((k, i) => layer(k, k, blotch, 0.5 ** (i + 1) / 0.9375));
  layer(64, 4, streak, 0.65);
  layer(128, 8, streak, 0.35);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round(blotch[i] * 255);
    data[i * 4 + 1] = Math.round(Math.pow(streak[i], 2.2) * 255);
    data[i * 4 + 2] = Math.round(rnd() * 255);
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const VERT_COMMON = `#include <common>
varying vec3 vSurfPos;
varying vec3 vSurfLocalN;
varying vec3 vSurfWorldN;
varying vec3 vSurfScale;
varying float vSurfCenterY;`;
const VERT_BEGIN = `#include <begin_vertex>
{
  mat4 surfM = modelMatrix;
  #ifdef USE_INSTANCING
  surfM = modelMatrix * instanceMatrix;
  #endif
  vSurfPos = (surfM * vec4(transformed, 1.0)).xyz;
  vSurfLocalN = normal;
  vSurfWorldN = normalize(mat3(surfM) * normal);
  vSurfScale = vec3(length(surfM[0].xyz), length(surfM[1].xyz), length(surfM[2].xyz));
  vSurfCenterY = surfM[3].y;
}`;
const FRAG_COMMON = `#include <common>
uniform sampler2D surfNoise;
varying vec3 vSurfPos;
varying vec3 vSurfLocalN;
varying vec3 vSurfWorldN;
varying vec3 vSurfScale;
varying float vSurfCenterY;
float surfHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
/** Tile grout (0 inside a tile, 1 on a joint), antialiased with fwidth; .z is how much of the pattern survives distance. */
vec3 surfGrout(vec2 p) {
  vec2 f = fract(p), w = fwidth(p);
  vec2 g = smoothstep(vec2(0.0), w * 1.5 + 0.035, f) * smoothstep(vec2(1.0), 1.0 - w * 1.5 - 0.035, f);
  return vec3(1.0 - g.x * g.y, 0.0, clamp(1.0 - max(w.x, w.y) * 1.6, 0.0, 1.0));
}`;

/**
 * 0 compiles the patched materials without their patterns (plain instance colours, no extra varyings or texture
 * fetches) for the lowest quality levels; flip it, then set needsUpdate on the materials (world.ts setDetail). Both
 * variants have their own program cache key, so switching back and forth compiles each once.
 */
export const surfaceDetail = { value: 1 };

function patch(material: THREE.MeshStandardMaterial, key: string, noise: THREE.Texture, body: string) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (surfaceDetail.value < 0.5) return;
    shader.uniforms.surfNoise = { value: noise };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', VERT_COMMON).replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', FRAG_COMMON).replace('#include <color_fragment>', `#include <color_fragment>\n{\n${body}\n}`);
  };
  material.customProgramCacheKey = () => (surfaceDetail.value < 0.5 ? `${key}-flat` : key);
}

/**
 * Painted render: raw concrete on the party (side) walls, duller backs, blotches, rain streaks under the parapet and
 * every floor ledge (low frequency: finer streaks double up with shadow-map striping), a damp band at the foot.
 */
export function patchWall(material: THREE.MeshStandardMaterial, noise: THREE.Texture) {
  patch(material, 'surf-wall', noise, `
  vec3 N = normalize(vSurfWorldN);
  float side = step(0.5, abs(vSurfLocalN.x));
  float back = step(0.5, -vSurfLocalN.z);
  float wall = 1.0 - step(0.5, abs(N.y));
  vec2 T = normalize(vec2(-N.z, N.x) + vec2(1e-4));
  float u = dot(vSurfPos.xz, T);
  float y = vSurfPos.y;
  float top = vSurfCenterY + 0.5 * vSurfScale.y, bottom = vSurfCenterY - 0.5 * vSurfScale.y;
  vec4 big = texture2D(surfNoise, vec2(u, y) * 0.09);
  vec4 fine = texture2D(surfNoise, vec2(u, y) * 0.85);
  vec3 c = diffuseColor.rgb;
  vec3 concrete = vec3(0.63, 0.62, 0.58) * (0.82 + 0.34 * big.r);
  c = mix(c, concrete, side * 0.82 * wall);
  c = mix(c, c * vec3(0.92, 0.92, 0.94), back * 0.7 * wall);
  c *= 0.92 + 0.14 * big.r;
  float streak = texture2D(surfNoise, vec2(u * 0.06, y * 0.02)).g;
  float underTop = clamp(1.0 - (top - y) / 3.2, 0.0, 1.0);
  float underLedge = smoothstep(0.62, 1.0, fract((y - 0.2) / 3.2)) * step(1.0, y - bottom);
  c *= 1.0 - 0.38 * streak * (0.75 * underTop + 0.45 * underLedge) * wall;
  float damp = (1.0 - smoothstep(0.0, 0.85, y - bottom)) * wall;
  c = mix(c, c * vec3(0.74, 0.79, 0.70), damp * 0.55);
  c *= 0.95 + 0.1 * fine.b;
  diffuseColor.rgb = c;`);
}

/**
 * Square tiles: on upward faces 0.4 m near the ground (sidewalks, shop floors) and 0.3 m higher up (roof decks); with
 * `vertical`, a 0.3 x 0.6 m grid on the walls too (cladding, a tiled dado). The pattern fades out with distance.
 */
export function patchTiles(material: THREE.MeshStandardMaterial, noise: THREE.Texture, key: string, vertical: boolean) {
  patch(material, key, noise, `
  vec3 N = normalize(vSurfWorldN);
  float up = step(0.5, N.y);
  vec2 T = normalize(vec2(-N.z, N.x) + vec2(1e-4));
  vec2 p = up > 0.5 ? vSurfPos.xz / (vSurfPos.y < 2.0 ? 0.4 : 0.3) : vec2(dot(vSurfPos.xz, T) / 0.3, vSurfPos.y / 0.6);
  vec3 g = surfGrout(p);
  float h = surfHash(floor(p));
  vec3 c = diffuseColor.rgb * (0.9 + 0.2 * h) * (0.9 + 0.2 * texture2D(surfNoise, vSurfPos.xz * 0.045 + vSurfPos.y * 0.03).r);
  c = mix(c, c * 0.6, g.x * g.z);
  float on = max(up, ${vertical ? '1.0 - step(0.5, abs(N.y))' : '0.0'});
  diffuseColor.rgb = mix(diffuseColor.rgb, c, on);`);
}

/** Barrel-tile roofs (gable and hip prisms): columns along the ridge, overlapping rows down the slope, moss at the eaves. */
export function patchRoofTiles(material: THREE.MeshStandardMaterial, noise: THREE.Texture) {
  patch(material, 'surf-roof', noise, `
  vec2 T = normalize(vec2(-vSurfWorldN.z, vSurfWorldN.x) + vec2(1e-4));
  float u = dot(vSurfPos.xz, T);
  float y = vSurfPos.y;
  float bottom = vSurfCenterY - 0.5 * vSurfScale.y;
  vec2 q = vec2(u / 0.26, y / 0.13);
  vec2 cell = floor(q), f = fract(q);
  vec2 w = fwidth(q);
  float fade = clamp(1.0 - max(w.x, w.y) * 1.2, 0.0, 1.0);
  float barrel = 0.8 + 0.2 * sin(f.x * 6.2832);
  float lap = mix(1.0, 0.72, smoothstep(0.75, 1.0, f.y));
  vec3 c = diffuseColor.rgb * (0.88 + 0.22 * surfHash(cell));
  c *= mix(1.0, barrel * lap, fade);
  float moss = (1.0 - smoothstep(0.0, 0.7, y - bottom)) * texture2D(surfNoise, vec2(u, y) * 0.2).r;
  c = mix(c, c * vec3(0.6, 0.66, 0.5), moss * 0.7);
  c *= 0.9 + 0.2 * texture2D(surfNoise, vec2(u, y) * 0.06).r;
  diffuseColor.rgb = c;`);
}

/**
 * Glow in the instance colour (a fluorescent tube, an LED strip). With `blink`, LED borders step on and off in
 * blocks of about 2 m, each block on its own beat, driven by the shared time uniform.
 */
export function patchGlow(material: THREE.MeshStandardMaterial, key: string, blink?: { value: number }) {
  material.onBeforeCompile = (shader) => {
    if (blink) {
      shader.uniforms.ledTime = blink;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLedPos;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          mat4 ledM = modelMatrix;
          #ifdef USE_INSTANCING
          ledM = modelMatrix * instanceMatrix;
          #endif
          vLedPos = (ledM * vec4(transformed, 1.0)).xyz;
        }`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${blink ? '\nuniform float ledTime;\nvarying vec3 vLedPos;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance *= vColor;${blink ? `
      totalEmissiveRadiance *= 0.35 + 0.65 * step(0.5, fract(ledTime * 0.8 + fract(sin(dot(floor(vLedPos.xz * 0.5) + floor(vLedPos.y * 0.5), vec2(12.9898, 78.233))) * 43758.5453)));` : ''}`);
  };
  material.customProgramCacheKey = () => key;
}
