/**
 * Shop signs and house-number plates as geometry: each board is a thin box whose border the shader paints, and the
 * text is instanced glyph quads sampling one runtime glyph atlas (RG8: a distance field and coverage, mipmapped), so
 * sign memory stays small and flat however many signs the map grows. The layout reproduces the old canvas cells,
 * stretched over the board: 1024x256 per sign (title 900 94px at y 107, at most 930 wide; subtitle 500 31px at y 194,
 * at most 900; a 7px border on the rectangle inset 16px) and 128x64 per plate. Free-standing signs also read correctly
 * from behind (the old double-sided quads showed mirrored text there). Built once, in the browser (needs a 2D canvas).
 */
import * as THREE from 'three';
import { NIGHT, NIGHT_GLSL } from '../night.ts';

/**
 * The CSS weights the old canvas cells used: titles and plate numbers 900 (Arial Black on Windows), plate labels 700,
 * subtitles 500 (Arial Regular). Glyphs a face lacks fall back exactly as they did on canvas.
 */
type Face = '900' | '700' | '500';
const FAMILY = 'Arial, sans-serif';
/**
 * Atlas glyph size per face (px), close to the size each face is used at (titles 94 and plate numbers 30, subtitles
 * 31, plate labels 13): small text drawn from a much larger raster reads too bold once its coverage is minified.
 * Plate labels keep 24, enough for stacked marks (the circumflex and acute of Ố) to survive the distance field.
 */
const FACE_PX: Record<Face, number> = { 900: 48, 500: 32, 700: 24 };
/** The distance-field range each side of an outline, the empty margin around the ink, cell gap (atlas px). */
const SPREAD = 6, PAD = SPREAD + 1, GAP = 2;
const ATLAS_W = 2048;
/** Longest stretch of distance-field work per timer callback (ms). */
const SLICE_MS = 6;

/** A line of text in cell pixels: centred on (cx, cy) ('middle' baseline), squeezed to maxWidth like canvas fillText. */
type Run = { text: string; face: Face; size: number; cx: number; cy: number; maxWidth: number; color: string };
type Board = {
  x: number; y: number; z: number; yaw: number; w: number; h: number; depth: number;
  cellW: number; cellH: number; runs: Run[]; background: string; border: string;
  /** The border stroke is centred on this cell rectangle (x, y, w, h), which is centred in the cell; `line` px wide. */
  frame: [number, number, number, number]; line: number;
  glow: number; twoSided: boolean;
};
/** The atlas cell around the ink relative to the pen at the 'middle' baseline (px, y down). */
type Glyph = { ink: boolean; x0: number; y0: number; x1: number; y1: number; u0: number; v0: number; u1: number; v1: number };

/** Characters as displayed (NFC code points). */
const chars = (text: string) => Array.from(text.normalize('NFC'));

/** Pen x of each character: advances plus pair kerning, as canvas lays text out; and the total width. */
export function penPositions(list: string[], advance: (s: string) => number) {
  const pens: number[] = [];
  let pen = 0;
  for (let i = 0; i < list.length; i++) {
    if (i > 0) pen += advance(list[i - 1] + list[i]) - advance(list[i]);
    pens.push(pen);
  }
  return { pens, width: list.length ? pen + advance(list[list.length - 1]) : 0 };
}

const INF = 1e20;
/** Scratch grids and rows for the distance transform, grown on demand. */
const scratchFor = (cells: number, line: number) => ({
  outer: new Float32Array(cells), inner: new Float32Array(cells),
  f: new Float32Array(line), g: new Float32Array(line), z: new Float32Array(line + 1), v: new Uint16Array(line), ink: new Uint8Array(line),
});
let scratch = scratchFor(0, 0);
/**
 * One pass of the exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher) along a row or column:
 * the lower envelope of the parabolas f(r) + (q - r)^2.
 */
function edt1d(grid: Float32Array, offset: number, stride: number, length: number) {
  const { f, g, z, v } = scratch;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = g[0] = grid[offset];
  let k = 0;
  for (let q = 1; q < length; q++) {
    const fq = grid[offset + q * stride], gq = fq + q * q;
    f[q] = fq;
    let s = (gq - g[k]) / (2 * (q - v[k]));
    while (s <= z[k]) { k--; s = (gq - g[k]) / (2 * (q - v[k])); }
    k++;
    v[k] = q;
    g[k] = gq;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, j = 0; q < length; q++) {
    while (z[j + 1] < q) j++;
    const r = v[j], d = q - r;
    grid[offset + q * stride] = f[r] + d * d;
  }
}

/** Pixels in a byte buffer: `step` bytes a pixel, `stride` pixels a row, the value in byte `channel`. */
export type Pixels = { data: { [i: number]: number }; stride: number; step: number; channel: number };
/**
 * Signed distance field of the coverage (0..255) in `src` over the rectangle (x, y, w, h), written to the same
 * rectangle of `dst` with the outline at 127.5 and ±`spread` px at 0 and 255. Partly covered pixels put the outline
 * inside the pixel, so edges stay sub-pixel accurate.
 */
export function signedDistance(src: Pixels, dst: Pixels, x: number, y: number, w: number, h: number, spread: number) {
  const n = w * h, size = Math.max(w, h) + 1;
  if (scratch.outer.length < n || scratch.f.length < size) scratch = scratchFor(Math.max(n, scratch.outer.length), Math.max(size, scratch.f.length));
  const { outer, inner, ink } = scratch;
  ink.fill(0, 0, w);
  for (let j = 0; j < h; j++) {
    let at = ((y + j) * src.stride + x) * src.step + src.channel, k = j * w;
    for (let i = 0; i < w; i++, at += src.step, k++) {
      const a = src.data[at];
      if (a === 0) { outer[k] = INF; inner[k] = 0; continue; }
      ink[i] = 1;
      if (a === 255) { outer[k] = 0; inner[k] = INF; } else {
        const t = a / 255 - 0.5;
        outer[k] = t < 0 ? t * t : 0;
        inner[k] = t > 0 ? t * t : 0;
      }
    }
  }
  // Columns without ink stay all-INF (outer) or all-zero (inner) through the column pass.
  for (let i = 0; i < w; i++) if (ink[i]) { edt1d(outer, i, w, h); edt1d(inner, i, w, h); }
  for (let j = 0; j < h; j++) { edt1d(outer, j * w, 1, w); edt1d(inner, j * w, 1, w); }
  const scale = 255 / (2 * spread);
  for (let j = 0; j < h; j++) {
    let o = ((y + j) * dst.stride + x) * dst.step + dst.channel, k = j * w;
    for (let i = 0; i < w; i++, o += dst.step, k++) {
      const v = 127.5 - (Math.sqrt(outer[k]) - Math.sqrt(inner[k])) * scale;
      dst.data[o] = v <= 0 ? 0 : v >= 255 ? 255 : v + 0.5;
    }
  }
}

/** Glyph quads stand this far in front of their board (more on big boards, seen from further away). */
const lift = (h: number) => 0.004 + 0.004 * h;

/**
 * Fills the distance field (channel 0 of `field`) cell by cell from the coverage (channel 1 of `cover`) in short
 * timer slices, then swaps it into the atlas. `cells` holds x, y, w, h per glyph. Drops every reference once done
 * (or once the atlas is disposed), so nothing from the build stays alive.
 */
function fieldInSlices(atlas: THREE.DataTexture, cover: Uint8Array, field: Uint8Array, cells: Int32Array, info: { fieldMs: number }) {
  let source: Pixels | null = { data: cover, stride: ATLAS_W, step: 2, channel: 1 };
  let target: Pixels | null = { data: field, stride: ATLAS_W, step: 2, channel: 0 };
  let next = 0, ms = 0;
  const stop = () => { source = target = null; atlas.removeEventListener('dispose', stop); };
  atlas.addEventListener('dispose', stop);
  const slice = () => {
    if (!source || !target) return;
    const t0 = performance.now();
    for (; next < cells.length && performance.now() - t0 < SLICE_MS; next += 4) signedDistance(source, target, cells[next], cells[next + 1], cells[next + 2], cells[next + 3], SPREAD);
    ms += performance.now() - t0;
    if (next < cells.length) { setTimeout(slice, 0); return; }
    atlas.image.data = target.data as Uint8Array;
    atlas.needsUpdate = true;
    info.fieldMs = ms;
    stop();
  };
  setTimeout(slice, 0);
}

/**
 * Emissive follows each instance's colour (`tint`) times its glow (the material's intensity is the night level). The
 * glow float packs a strength 0..1 and an opening-hours schedule 0..95 (night.ts packGlow: 2·code + strength): the sign
 * of a shop goes nearly dark (a tenth) while its shop is closed; code 0 glows with the night as before.
 */
function glowing(material: THREE.MeshStandardMaterial, key: string, tint: string, extra: (shader: THREE.WebGLProgramParametersWithUniforms) => void) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, NIGHT);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float signGlow;\nvarying float vSignGlow;\n#define nightDayBase 0.0\n${NIGHT_GLSL}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
	{
		float signCode = floor(signGlow * 0.5 + 1e-4), signStrength = signGlow - 2.0 * signCode;
		vSignGlow = signStrength * (signCode < 0.5 ? 1.0 : mix(0.1, 1.0, nightOpenAt(signCode)));
	}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSignGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= ${tint} * vSignGlow;`);
    extra(shader);
  };
  material.customProgramCacheKey = () => `${key}|night`;
  return material;
}
function boardShader(shader: THREE.WebGLProgramParametersWithUniforms) {
  const shared = 'varying vec3 vSignBorder;\nvarying vec4 vSignFrame;\nvarying vec2 vSignUv;\nvarying float vSignFace;';
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nattribute vec3 signBorder;\nattribute vec4 signFrame;\n${shared}`)
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvSignBorder = signBorder;\n\tvSignFrame = signFrame;\n\tvSignUv = uv;\n\tvSignFace = abs(normal.z);');
  // The border stroke: inside the frame rectangle grown by the half-width, outside it shrunk by the same, with
  // per-axis pixel coverage (thin far-away strokes fade instead of breaking up); front and back faces only.
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${shared}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
	vec2 signAt = abs(vSignUv - 0.5), signPixel = max(fwidth(vSignUv), vec2(1e-6)), signEdge = 0.5 - vSignFrame.xy;
	vec2 signOuter = clamp((signEdge + vSignFrame.zw - signAt) / signPixel + 0.5, 0.0, 1.0);
	vec2 signInner = clamp((signEdge - vSignFrame.zw - signAt) / signPixel + 0.5, 0.0, 1.0);
	float signStroke = (signOuter.x * signOuter.y - signInner.x * signInner.y) * step(0.5, vSignFace);
	diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * vSignBorder, signStroke);`);
}
function glyphShader(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 glyphUv;\nattribute float glyphBack;\nvarying float vGlyphBack;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvAlphaMapUv = mix(glyphUv.xy, glyphUv.zw, uv);\n\tvGlyphBack = glyphBack;');
  // Magnified: the distance field's outline, antialiased over about a screen pixel. Minified (two atlas texels
  // a pixel and more): the mipmapped coverage, so thin strokes in small text stay as solid as canvas text. That
  // coverage shows as the old canvas cells' mipmaps did, averaged in linear light over the board (vGlyphBack: its
  // luminance) rather than as a straight blend of the encoded colours, which reads bolder on light boards. Light
  // text on dark boards keeps the straight blend: lit and glowing, it saturates and already matched.
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vGlyphBack;')
    .replace('#include <alphamap_fragment>', `vec2 glyph = texture2D(alphaMap, vAlphaMapUv).rg;
	float glyphEdge = clamp(length(vec2(dFdx(glyph.r), dFdy(glyph.r))) * 0.6, 0.02, 0.5);
	vec2 glyphTexel = vAlphaMapUv * vec2(textureSize(alphaMap, 0));
	float glyphMinify = smoothstep(1.0, 2.0, max(length(dFdx(glyphTexel)), length(dFdy(glyphTexel))));
	float glyphInk = dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722)), glyphTo = pow(glyphInk, 0.4545), glyphFrom = pow(vGlyphBack, 0.4545);
	float glyphCover = glyphTo > glyphFrom - 0.02 ? glyph.g : clamp((pow(mix(vGlyphBack, glyphInk, glyph.g), 0.4545) - glyphFrom) / (glyphTo - glyphFrom), 0.0, 1.0);
	diffuseColor.a *= mix(smoothstep(0.5 - glyphEdge, 0.5 + glyphEdge, glyph.r), glyphCover, glyphMinify);
	if (diffuseColor.a < 0.004) discard;`);
}

/** Instance data, written straight into the typed arrays the meshes upload. */
type Batch = { n: number; m: Float32Array; c: Float32Array; glow: Float32Array; uv?: Float32Array; back?: Float32Array; border?: Float32Array; frame?: Float32Array };
const batch = (count: number, extra: 'uv' | 'frame'): Batch => ({
  n: 0, m: new Float32Array(count * 16), c: new Float32Array(count * 3), glow: new Float32Array(count),
  ...(extra === 'uv' ? { uv: new Float32Array(count * 4), back: new Float32Array(count) } : { border: new Float32Array(count * 3), frame: new Float32Array(count * 4) }),
});
/** Instance matrix: turned by yaw (cosine c, sine s) about y, scaled along the board's own axes, centred at (x, y, z). */
function put(b: Batch, x: number, y: number, z: number, c: number, s: number, sx: number, sy: number, sz: number, color: THREE.Color, glow: number) {
  const i = b.n++, m = b.m, o = i * 16;
  m[o] = c * sx; m[o + 2] = -s * sx; m[o + 5] = sy; m[o + 8] = s * sz; m[o + 10] = c * sz;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
  b.c[i * 3] = color.r; b.c[i * 3 + 1] = color.g; b.c[i * 3 + 2] = color.b;
  b.glow[i] = glow;
  return i;
}
function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, b: Batch, name: string) {
  geometry.setAttribute('signGlow', new THREE.InstancedBufferAttribute(b.glow, 1));
  if (b.uv) geometry.setAttribute('glyphUv', new THREE.InstancedBufferAttribute(b.uv, 4));
  if (b.back) geometry.setAttribute('glyphBack', new THREE.InstancedBufferAttribute(b.back, 1));
  if (b.border) geometry.setAttribute('signBorder', new THREE.InstancedBufferAttribute(b.border, 3));
  if (b.frame) geometry.setAttribute('signFrame', new THREE.InstancedBufferAttribute(b.frame, 4));
  const mesh = new THREE.InstancedMesh(geometry, material, b.n);
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(b.m, 16);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(b.c, 3);
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

/** A run laid out: its characters, their pen positions and its width, in run pixels. */
type Laid = { list: string[]; pens: number[]; width: number };
const runKey = (r: Run) => `${r.face} ${r.size}|${r.text}`;
/**
 * Measures every glyph the boards use (inked ones get an atlas cell: ink box plus PAD, origin at the pen, in atlas
 * pixels of their face), lays out every distinct run at its own size, and draws the inked glyphs into a two-channel
 * coverage image. The canvas is freed before returning.
 */
function measureAndDraw(boards: Board[]) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let font = '';
  const setFace = (f: Face, size: number) => {
    const next = `${f} ${size}px ${FAMILY}`;
    if (next === font) return;
    font = next;
    ctx.font = next;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
  };
  const glyphs: Record<Face, Map<string, Glyph>> = { 900: new Map(), 700: new Map(), 500: new Map() };
  const order: { face: Face; ch: string; g: Glyph }[] = [];
  for (const b of boards) for (const r of b.runs) for (const ch of chars(r.text)) {
    if (glyphs[r.face].has(ch)) continue;
    setFace(r.face, FACE_PX[r.face]);
    const m = ctx.measureText(ch);
    const g: Glyph = {
      ink: ch.trim() !== '' && m.actualBoundingBoxRight + m.actualBoundingBoxLeft > 0,
      x0: Math.floor(-m.actualBoundingBoxLeft) - PAD, x1: Math.ceil(m.actualBoundingBoxRight) + PAD,
      y0: Math.floor(-m.actualBoundingBoxAscent) - PAD, y1: Math.ceil(m.actualBoundingBoxDescent) + PAD,
      u0: 0, v0: 0, u1: 0, v1: 0,
    };
    glyphs[r.face].set(ch, g);
    if (g.ink) order.push({ face: r.face, ch, g });
  }
  // Layout: advances and pair kerning measured at each run's own size (as the old canvas cells laid text out),
  // every distinct run once, one font at a time.
  const distinct = new Map<string, Run>();
  for (const b of boards) for (const r of b.runs) distinct.set(runKey(r), r);
  const widths = new Map<string, number>(), runs = new Map<string, Laid>();
  for (const [key, r] of [...distinct].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    setFace(r.face, r.size);
    const prefix = key.slice(0, key.indexOf('|') + 1), list = chars(r.text);
    runs.set(key, { list, ...penPositions(list, (text) => {
      let w = widths.get(prefix + text);
      if (w === undefined) { w = ctx.measureText(text).width; widths.set(prefix + text, w); }
      return w;
    }) });
  }
  // Shelf packing, tallest first.
  order.sort((a, b) => (b.g.y1 - b.g.y0) - (a.g.y1 - a.g.y0));
  const cells = new Int32Array(order.length * 4);
  let px = 0, py = 0, rowH = 0;
  order.forEach(({ g }, i) => {
    const w = g.x1 - g.x0, h = g.y1 - g.y0;
    if (px + w > ATLAS_W) { px = 0; py += rowH + GAP; rowH = 0; }
    cells.set([px, py, w, h], i * 4);
    px += w + GAP;
    rowH = Math.max(rowH, h);
  });
  const used = Math.max(1, py + rowH);
  let height = 64;
  while (height < used) height *= 2;
  if (height > 2048) console.warn(`sign glyph atlas grew to ${ATLAS_W}x${height}`);
  // Plain fills: each face keeps the weight canvas draws it with.
  canvas.width = ATLAS_W;
  canvas.height = used;
  font = '';
  ctx.fillStyle = '#ffffff';
  order.forEach(({ face: f, ch, g }, i) => {
    const x = cells[i * 4], y = cells[i * 4 + 1];
    setFace(f, FACE_PX[f]);
    ctx.fillText(ch, x - g.x0, y - g.y0);
    // Data row 0 is v = 0, so the quad's top edge (uv.y = 1) samples the cell's top row.
    g.u0 = x / ATLAS_W;
    g.u1 = (x + cells[i * 4 + 2]) / ATLAS_W;
    g.v0 = (y + cells[i * 4 + 3]) / height;
    g.v1 = y / height;
  });
  const rgba = ctx.getImageData(0, 0, ATLAS_W, used).data;
  canvas.width = canvas.height = 0;
  // Two channels: R a distance field for crisp edges up close, G plain coverage, mipmapped, for small text far
  // away. R starts as coverage too (the shader's 0.5 threshold reads it as a sharp outline); the distance field
  // is computed in short slices after the build and then swapped in.
  const cover = new Uint8Array(ATLAS_W * height * 2);
  for (let i = 0, n = ATLAS_W * used; i < n; i++) cover[i * 2] = cover[i * 2 + 1] = rgba[i * 4 + 3];
  return { glyphs, runs, cells, cover, height, count: order.length };
}

export function createSigns() {
  const boards: Board[] = [];
  return {
    /**
     * A sign board, as world.ts' sign(): title and subtitle in `color` on `background`, with a border in `color`; `glow`
     * its night glow (a strength, or one packed with a schedule: night.ts packGlow).
     */
    sign(text: string, subtitle: string, color: string, x: number, y: number, z: number, w: number, h: number, yaw = 0, background = '#f3e4c7', glow = 0.5) {
      boards.push({
        x, y, z, yaw, w, h, depth: 0.03, cellW: 1024, cellH: 256, background, border: color, frame: [16, 16, 992, 224], line: 7, glow, twoSided: true,
        runs: [
          { text, face: '900', size: 94, cx: 512, cy: 107, maxWidth: 930, color },
          { text: subtitle, face: '500', size: 31, cx: 512, cy: 194, maxWidth: 900, color },
        ],
      });
    },
    /**
     * Small street signs, `w` x `h` m facing `yaw`; lines split at '|'. 'box' a light box (one bold line, framed),
     * 'vertical' a tall light box with the words stacked, 'plate' a street-name plate, 'banner' a cloth banner across
     * the road, all readable from both faces; 'paint' an ad painted on a wall (no board, one face).
     */
    tag(style: 'box' | 'vertical' | 'plate' | 'banner' | 'paint', text: string, color: string, background: string, x: number, y: number, z: number, w: number, h: number, yaw = 0, glow = 0) {
      const vertical = style === 'vertical';
      const lines = vertical ? text.split(/[ |]+/) : text.split('|');
      const cellW = vertical ? 128 : Math.max(128, Math.round((128 * w) / h)), cellH = vertical ? Math.max(128, Math.round((128 * h) / w)) : 128;
      const pad = style === 'paint' ? 4 : 10, inner = cellH - pad * 2;
      const step = inner / lines.length, size = Math.min(step * 0.78, vertical ? cellW * 0.5 : 84);
      boards.push({
        x, y, z, yaw, w, h, depth: style === 'paint' ? 0.004 : style === 'banner' ? 0.01 : 0.04, cellW, cellH, background, border: style === 'paint' ? background : color,
        frame: [pad / 2, pad / 2, cellW - pad, cellH - pad], line: style === 'paint' ? 0 : 4, glow, twoSided: style !== 'paint',
        // A stacked word shrinks to fit the box's width rather than being squeezed; other second lines are smaller.
        runs: lines.map((t, i) => ({
          text: t, face: '900' as const, cx: cellW / 2, cy: pad + step * (i + 0.5), maxWidth: cellW - pad * 3, color,
          size: vertical ? Math.min(size, (cellW - pad * 3) / (0.7 * Array.from(t).length)) : i > 0 && style !== 'banner' ? size * 0.7 : size,
        })),
      });
    },
    /** A blue house-number plate (0.5 x 0.25 m) facing `yaw`. */
    plate(n: number, x: number, y: number, z: number, yaw: number) {
      boards.push({
        x, y, z, yaw, w: 0.5, h: 0.25, depth: 0.02, cellW: 128, cellH: 64, background: '#1d4f9c', border: '#ffffff', frame: [5, 5, 118, 54], line: 4, glow: 0.25, twoSided: false,
        runs: [
          { text: 'SỐ NHÀ', face: '700', size: 13, cx: 64, cy: 17, maxWidth: Infinity, color: '#ffffff' },
          { text: String(n), face: '900', size: 30, cx: 64, cy: 41, maxWidth: 108, color: '#ffffff' },
        ],
      });
    },
    /**
     * Builds the glyph atlas (every glyph the boards use, in the face they use it) and two instanced meshes: the
     * boards (boxes) and the glyph quads. Both glow in each instance's colour times its glow: set the night level as
     * the materials' emissiveIntensity. Only the atlas, the meshes and their typed arrays outlive the build.
     */
    build() {
      const started = performance.now();
      /** Build statistics; fieldMs (the sliced distance-field time) arrives once the field is done. */
      const info = { boards: boards.length, glyphs: 0, quads: 0, boxes: 0, atlas: [ATLAS_W, 0], ms: 0, fieldMs: 0 };
      const { glyphs, runs, cells, cover, height, count } = measureAndDraw(boards);
      Object.assign(info, { glyphs: count, atlas: [ATLAS_W, height] });
      const atlas = new THREE.DataTexture(cover, ATLAS_W, height, THREE.RGFormat, THREE.UnsignedByteType);
      atlas.name = 'Sign glyphs';
      atlas.minFilter = THREE.LinearMipmapLinearFilter;
      atlas.magFilter = THREE.LinearFilter;
      atlas.generateMipmaps = true;
      atlas.anisotropy = 4;
      atlas.unpackAlignment = 2;
      atlas.needsUpdate = true;
      fieldInSlices(atlas, cover, cover.slice(), cells, info);

      let quadCount = 0;
      for (const b of boards) for (const r of b.runs) for (const ch of runs.get(runKey(r))!.list) if (glyphs[r.face].get(ch)!.ink) quadCount += b.twoSided ? 2 : 1;
      const boxes = batch(boards.length, 'frame'), quads = batch(quadCount, 'uv');
      const colors = new Map<string, THREE.Color>();
      const rgb = (hex: string) => { let v = colors.get(hex); if (!v) { v = new THREE.Color(hex); colors.set(hex, v); } return v; };
      for (const b of boards) {
        const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
        const cellX = (v: number) => (v / b.cellW - 0.5) * b.w, cellY = (v: number) => (0.5 - v / b.cellH) * b.h;
        // The board: a box whose front face is where the old quad was. Its border is painted by the shader on both
        // faces (antialiased like the old texture), from the frame inset and stroke half-width as fractions of the cell.
        const i = put(boxes, b.x - (b.depth / 2) * s, b.y, b.z - (b.depth / 2) * c, c, s, b.w, b.h, b.depth, rgb(b.background), b.glow);
        const border = rgb(b.border), half = b.line / 2;
        boxes.border!.set([border.r, border.g, border.b], i * 3);
        boxes.frame!.set([b.frame[0] / b.cellW, b.frame[1] / b.cellH, half / b.cellW, half / b.cellH], i * 4);
        // Glyphs on the front and, for free-standing signs, on the back (laid out in the turned-around frame).
        const front = lift(b.h), back = -b.depth - front, paper = rgb(b.background), luma = 0.2126 * paper.r + 0.7152 * paper.g + 0.0722 * paper.b;
        const glyph = (at: number, g: Glyph) => { quads.uv!.set([g.u0, g.v0, g.u1, g.v1], at * 4); quads.back![at] = luma; };
        for (const r of b.runs) {
          const { list, pens, width } = runs.get(runKey(r))!, color = rgb(r.color);
          const k = r.size / FACE_PX[r.face], squeeze = width > r.maxWidth ? r.maxWidth / width : 1;
          const left = r.cx - (width * squeeze) / 2;
          list.forEach((ch, n) => {
            const g = glyphs[r.face].get(ch)!;
            if (!g.ink) return;
            const X0 = left + (pens[n] + g.x0 * k) * squeeze, X1 = left + (pens[n] + g.x1 * k) * squeeze;
            const lx = cellX((X0 + X1) / 2), ly = cellY(r.cy + ((g.y0 + g.y1) / 2) * k);
            const w = ((X1 - X0) / b.cellW) * b.w, h = (((g.y1 - g.y0) * k) / b.cellH) * b.h;
            glyph(put(quads, b.x + lx * c + front * s, b.y + ly, b.z - lx * s + front * c, c, s, w, h, 1, color, b.glow), g);
            if (b.twoSided) glyph(put(quads, b.x - lx * c + back * s, b.y + ly, b.z + lx * s + back * c, -c, -s, w, h, 1, color, b.glow), g);
          });
        }
      }

      const boardMaterial = glowing(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, emissive: '#ffffff', emissiveIntensity: 0 }), 'sign-boards', 'mix(vColor, vSignBorder, signStroke)', boardShader);
      // The atlas rides in alphaMap (bound and counted like any map), sampled in each instance's own glyph cell.
      const glyphMaterial = glowing(new THREE.MeshStandardMaterial({
        color: '#ffffff', roughness: 0.95, emissive: '#ffffff', emissiveIntensity: 0, alphaMap: atlas,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
      }), 'sign-glyphs', 'vColor', glyphShader);
      const boxGeometry = new THREE.BoxGeometry(1, 1, 1), quadGeometry = new THREE.PlaneGeometry(1, 1);
      Object.assign(info, { quads: quads.n, boxes: boxes.n });
      const meshes = [instanced(boxGeometry, boardMaterial, boxes, 'Sign boards'), instanced(quadGeometry, glyphMaterial, quads, 'Sign glyphs')];
      info.ms = performance.now() - started;
      // Debug tools read the statistics off the scene.
      meshes[1].userData.signs = info;
      return { meshes, textures: [atlas], materials: [boardMaterial, glyphMaterial], geometries: [boxGeometry, quadGeometry], info };
    },
  };
}
