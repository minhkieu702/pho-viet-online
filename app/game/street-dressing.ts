import * as THREE from 'three';
import type { ClothCell, DecalCell } from './kit';

/**
 * Street dressing that does not fit the instanced primitives of world.ts: sagging cable bundles, cloth that waves
 * (flags, laundry), rising smoke, and the decal atlas (grilles, railings, cages, AC faces, shutters, altars, goods)
 * merged into a few quad meshes. Everything that moves does it in the vertex shader from one time uniform, so the
 * city costs no per-frame CPU.
 */

const TILE = 160;
const tileKey = (x: number, z: number) => `${Math.floor((x + 80) / TILE)}:${Math.floor((z + 80) / TILE)}`;

// ---- Cables ---------------------------------------------------------------------------------------------------
// Every catenary is a ribbon of SEG segments that the vertex shader turns to face the camera and never lets get
// thinner than about a pixel. One geometry and one draw call per layer.
const SEG = 8;
export type Cable = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; sag: number; width: number; color: THREE.Color };
export type CableUniforms = { time: { value: number }; sway: { value: number }; shade: { value: number } };

export function cableUniforms(): CableUniforms {
  return { time: { value: 0 }, sway: { value: 1 }, shade: { value: 1 } };
}

export function buildCables(list: Cable[], shared: CableUniforms) {
  const n = list.length * (SEG + 1) * 2;
  const position = new Float32Array(n * 3), dir = new Float32Array(n * 3), side = new Float32Array(n * 2), color = new Float32Array(n * 3);
  const index: number[] = [];
  let v = 0;
  const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3();
  const at = (c: Cable, t: number, out: THREE.Vector3) => out.set(c.ax + (c.bx - c.ax) * t, c.ay + (c.by - c.ay) * t - c.sag * 4 * t * (1 - t), c.az + (c.bz - c.az) * t);
  for (const c of list) {
    const base = v;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      at(c, t, p);
      at(c, Math.min(1, t + 0.02), q).sub(at(c, Math.max(0, t - 0.02), r)).normalize();
      for (const s of [-1, 1]) {
        position.set([p.x, p.y, p.z], v * 3);
        dir.set([q.x, q.y, q.z], v * 3);
        side.set([s * c.width, 4 * t * (1 - t)], v * 2);
        color.set([c.color.r, c.color.g, c.color.b], v * 3);
        v++;
      }
      if (i < SEG) { const k = base + i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: shared.time, sway: shared.sway, shade: shared.shade, pixel: { value: (2 * Math.tan(THREE.MathUtils.degToRad(21))) / 800 } };
  const material = new THREE.ShaderMaterial({
    uniforms, fog: true, vertexColors: true, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aDir; attribute vec2 aSide;
      uniform float time; uniform float sway; uniform float pixel;
      varying vec3 vColor;
      #include <fog_pars_vertex>
      void main() {
        vColor = color;
        vec3 pos = position;
        pos.xz += vec2(0.6, 0.8) * sin(time * 1.1 + dot(position.xz, vec2(0.13, 0.17))) * 0.05 * sway * aSide.y;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vec3 t = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz);
        vec3 across = normalize(cross(t, normalize(mvPosition.xyz)));
        // At least a pixel wide far off; thinned right in front of the camera, where a cable would cross the view as a band.
        float w = max(abs(aSide.x) * smoothstep(0.5, 4.0, -mvPosition.z), -mvPosition.z * pixel * 1.1);
        mvPosition.xyz += across * sign(aSide.x) * w * 0.5;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float shade;
      varying vec3 vColor;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(vColor * shade, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  material.customProgramCacheKey = () => 'street-cables';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Street cables';
  return { mesh, material, geometry };
}

// ---- Cloth ----------------------------------------------------------------------------------------------------
// Flags and laundry as instanced quads waving in the vertex shader, pinned along one edge. aRect picks the atlas
// cell; aMode.x 0 = pinned at the left edge (a flag), 1 = pinned along the top (laundry); aMode.y the amplitude.
export type ClothItem = { x: number; y: number; z: number; w: number; h: number; yaw: number; cell: ClothCell; mode: 0 | 1; color: THREE.Color; amp: number };

export function clothMaterial(atlas: THREE.Texture, time: { value: number }) {
  const material = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.clothTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nattribute vec2 aMode;\nuniform float clothTime;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aRect.xy + uv * aRect.zw;\n#endif')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float clothPhase = dot(instanceMatrix[3].xz, vec2(0.37, 0.71));
        float clothW = aMode.x < 0.5 ? uv.x : 1.0 - uv.y;
        float clothA = aMode.y;
        float clothArg = clothTime * (aMode.x < 0.5 ? 4.2 : 2.3) + (aMode.x < 0.5 ? uv.x * 7.0 : uv.y * 3.0) + clothPhase;
        float clothDz = clothW * clothA * sin(clothArg) + clothW * clothA * 0.35 * sin(clothArg * 2.3 + uv.y * 5.0);
        float clothSlope = clothA * (aMode.x < 0.5 ? (sin(clothArg) + clothW * 7.0 * cos(clothArg)) : 0.0);
        objectNormal = normalize(vec3(-clothSlope, 0.0, 1.0));`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += clothDz;\ntransformed.y -= aMode.x < 0.5 ? clothW * clothW * 0.06 : 0.0;');
  };
  material.customProgramCacheKey = () => 'cloth-wave';
  return material;
}

export function buildCloth(items: ClothItem[], material: THREE.Material, cells: readonly (readonly [number, number, number, number])[], name: string) {
  const geometry = new THREE.PlaneGeometry(1, 1, 4, 2);
  const rect = new Float32Array(Math.max(1, items.length) * 4), mode = new Float32Array(Math.max(1, items.length) * 2);
  items.forEach((it, i) => { rect.set(cells[it.cell], i * 4); mode.set([it.mode, it.amp], i * 2); });
  geometry.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));
  geometry.setAttribute('aMode', new THREE.InstancedBufferAttribute(mode, 2));
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = name;
  const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pp = new THREE.Vector3();
  items.forEach((it, i) => {
    e.set(0, it.yaw, 0);
    mesh.setMatrixAt(i, m.compose(pp.set(it.x, it.y, it.z), qn.setFromEuler(e), s.set(it.w, it.h, 1)));
    mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  return { mesh, geometry };
}

/**
 * The cloth atlas (512 x 256): the national flag (red with the yellow five-pointed star), white silhouettes of a
 * shirt, trousers, a towel, an áo dài and a bedsheet (tinted per instance), the Buddhist flag and a bunting pennant.
 * Cells are [u0, v0, du, dv] with v up.
 */
export function clothAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const star = (cx: number, cy: number, R: number) => {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? R * 0.382 : R, a = -Math.PI / 2 + (k * Math.PI) / 5; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.closePath();
    ctx.fill();
  };
  // Flag 192 x 128 (3:2).
  ctx.fillStyle = '#da251d'; ctx.fillRect(0, 0, 192, 128);
  ctx.fillStyle = '#ffde00'; star(96, 66, 40);
  ctx.fillStyle = '#ffffff';
  // Shirt (192..320 x 0..128).
  ctx.beginPath(); ctx.moveTo(226, 8); ctx.lineTo(286, 8); ctx.lineTo(316, 34); ctx.lineTo(300, 52); ctx.lineTo(288, 44); ctx.lineTo(288, 124); ctx.lineTo(224, 124); ctx.lineTo(224, 44); ctx.lineTo(212, 52); ctx.lineTo(196, 34); ctx.closePath(); ctx.fill();
  // Trousers (320..448).
  ctx.beginPath(); ctx.moveTo(350, 4); ctx.lineTo(418, 4); ctx.lineTo(428, 124); ctx.lineTo(392, 124); ctx.lineTo(384, 46); ctx.lineTo(376, 124); ctx.lineTo(340, 124); ctx.closePath(); ctx.fill();
  // Towel (448..512), with a darker stripe.
  ctx.fillRect(452, 6, 56, 116);
  ctx.fillStyle = '#d9d9d9'; ctx.fillRect(452, 100, 56, 8);
  ctx.fillStyle = '#ffffff';
  // Áo dài (0..96 x 128..256) on a hanger: square shoulders, long sleeves hanging, the panels flaring to the hem.
  ctx.beginPath(); ctx.moveTo(40, 130); ctx.lineTo(56, 130); ctx.lineTo(90, 137); ctx.lineTo(90, 204); ctx.lineTo(78, 204); ctx.lineTo(74, 152);
  ctx.lineTo(80, 254); ctx.lineTo(16, 254); ctx.lineTo(22, 152); ctx.lineTo(18, 204); ctx.lineTo(6, 204); ctx.lineTo(6, 137); ctx.closePath(); ctx.fill();
  // Buddhist flag (96..288 x 128..256): five vertical bands, then the five colours stacked.
  const bands = ['#0f4fa8', '#f2c12e', '#c8322a', '#f4f1e8', '#f08c2a'];
  bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(96 + i * 32, 128, 32, 128); });
  bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(256, 128 + i * 25.6, 32, 25.6); });
  // Bedsheet (288..416) with a pale border.
  ctx.fillStyle = '#ffffff'; ctx.fillRect(292, 132, 120, 120);
  ctx.fillStyle = '#e4e4e4'; for (let k = 0; k < 6; k++) ctx.fillRect(300 + k * 19, 140, 8, 104);
  // Pennant (416..512): a triangle.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(420, 132); ctx.lineTo(508, 132); ctx.lineTo(464, 252); ctx.closePath(); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const cell = (x: number, y: number, w: number, h: number) => [x / 512, 1 - (y + h) / 256, w / 512, h / 256] as const;
  // In CLOTH order: flag, shirt, trousers, towel, áo dài, Buddhist flag, sheet, pennant.
  const cells = [cell(0, 0, 192, 128), cell(192, 0, 128, 128), cell(320, 0, 128, 128), cell(448, 0, 64, 128), cell(0, 128, 96, 128), cell(96, 128, 192, 128), cell(288, 128, 128, 128), cell(416, 128, 96, 128)] as const;
  return { texture, cells };
}

// ---- Smoke ----------------------------------------------------------------------------------------------------
// Billboards rising from fixed emitters (grills, steaming pots, incense), animated in the vertex shader; one draw
// call, faded out beyond 55-85 m so the overdraw stays small.
export type Emitter = { x: number; y: number; z: number; kind: 'grill' | 'incense' | 'steam' };
export function buildSmoke(emitters: Emitter[], time: { value: number }) {
  const per = { grill: 6, incense: 3, steam: 4 } as const;
  const look = { grill: [0.55, 2.6, 3.2, 0.4], incense: [0.16, 1.5, 4.5, 0.3], steam: [0.4, 1.4, 2.2, 0.32] } as const;
  const origin: number[] = [], params: number[] = [], tint: number[] = [];
  let s = 4711;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const e of emitters) {
    const n = per[e.kind], [size, rise, life, alpha] = look[e.kind];
    for (let k = 0; k < n; k++) {
      origin.push(e.x, e.y, e.z);
      params.push(k / n + rnd() * 0.1, size, rise, life);
      const g = e.kind === 'grill' ? 0.78 : e.kind === 'incense' ? 0.86 : 0.95;
      tint.push(g, g, g * 0.98, alpha);
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(new Float32Array(origin), 3));
  geometry.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(params), 4));
  geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(tint), 4));
  geometry.instanceCount = origin.length / 3;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
  const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time, wind: { value: new THREE.Vector2(0.35, 0.2) }, light: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec3 aOrigin; attribute vec4 aParams; attribute vec4 aTint;
      uniform float time; uniform vec2 wind;
      varying vec2 vUv; varying vec4 vTint;
      #include <fog_pars_vertex>
      void main() {
        float age = fract(time / aParams.w + aParams.x);
        vec3 c = aOrigin + vec3(wind.x * age * aParams.z + sin(age * 7.0 + aParams.x * 40.0) * 0.12 * age, age * aParams.z, wind.y * age * aParams.z);
        float size = aParams.y * (0.35 + age * 1.5);
        vec4 mvPosition = viewMatrix * vec4(c, 1.0);
        mvPosition.xy += position.xy * size;
        float dist = -mvPosition.z;
        vTint = vec4(aTint.rgb, aTint.a * smoothstep(0.0, 0.12, age) * (1.0 - age) * (1.0 - smoothstep(55.0, 85.0, dist)));
        vUv = position.xy + 0.5;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float light;
      varying vec2 vUv; varying vec4 vTint;
      #include <fog_pars_fragment>
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.25, 1.0, r)) * vTint.a;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vTint.rgb * light, a);
        #include <fog_fragment>
      }`,
  });
  material.customProgramCacheKey = () => 'street-smoke';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Smoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, material, geometry, light: uniforms.light };
}

// ---- Decals ---------------------------------------------------------------------------------------------------
const DECAL_COLS = 8, DECAL_ROWS = 3, CELL = 256;

/**
 * The decal atlas (2048 x 768, 24 cells of 256 px, see kit.ts DECAL): wrought iron with alpha (accordion gate, window
 * grilles, balcony railings, bông gió breeze blocks, a birdcage), AC fronts, solar tubes, snack strips, the lottery
 * board, Thần Tài and family altars, pole stickers, the danger sign, corrugated tôn, a wooden door, a roller shutter,
 * shelves of goods, a drinks fridge, a menu board, gạch bông tiles, a row of electricity meters and a torn poster.
 * Iron and tôn are drawn pale so the instance colour tints them.
 */
export function decalAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = DECAL_COLS * CELL; canvas.height = DECAL_ROWS * CELL;
  const ctx = canvas.getContext('2d')!;
  let s = 2718;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cellAt = (i: number, draw: () => void) => {
    ctx.save();
    ctx.translate((i % DECAL_COLS) * CELL, Math.floor(i / DECAL_COLS) * CELL);
    ctx.beginPath(); ctx.rect(0, 0, CELL, CELL); ctx.clip();
    draw();
    ctx.restore();
  };
  const iron = '#f0f0f0';
  const line = (x0: number, y0: number, x1: number, y1: number, w: number, c = iron) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  const rect = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const frameBox = (w = 10) => { ctx.strokeStyle = iron; ctx.lineWidth = w; ctx.strokeRect(w / 2, w / 2, CELL - w, CELL - w); };
  const scroll = (cx: number, cy: number, r: number, flip: number) => {
    ctx.strokeStyle = iron; ctx.lineWidth = 5; ctx.beginPath();
    for (let t = 0; t <= 1.001; t += 0.05) { const a = t * Math.PI * 1.7, rr = r * (1 - t * 0.7); ctx.lineTo(cx + Math.cos(a) * rr * flip, cy - Math.sin(a) * rr); }
    ctx.stroke();
  };
  // 0 Accordion gate (cửa xếp): vertical flats and a scissor lattice.
  cellAt(0, () => {
    for (let x = 6; x < CELL; x += 21) line(x, 0, x, CELL, 6);
    for (let y = 0; y < CELL; y += 42) for (let x = 6; x < CELL - 10; x += 21) { line(x, y, x + 21, y + 21, 3); line(x + 21, y + 21, x, y + 42, 3); }
    line(0, 4, CELL, 4, 8); line(0, CELL - 4, CELL, CELL - 4, 8);
  });
  // 1 Window grille: bars with S-scrolls between them.
  cellAt(1, () => {
    frameBox(12);
    for (let x = 32; x < CELL - 16; x += 32) line(x, 8, x, CELL - 8, 6);
    line(8, CELL / 2, CELL - 8, CELL / 2, 6);
    for (let x = 16; x < CELL - 32; x += 32) { scroll(x + 8, CELL / 2 - 14, 12, 1); scroll(x + 24, CELL / 2 + 14, 12, -1); }
  });
  // 2 Diamond lattice grille.
  cellAt(2, () => {
    frameBox(12);
    for (let k = -CELL; k < CELL * 2; k += 36) { line(k, 0, k + CELL, CELL, 5); line(k + CELL, 0, k, CELL, 5); }
    frameBox(12);
  });
  // 3 Balcony railing: rails, bars, a band of rings.
  cellAt(3, () => {
    line(0, 10, CELL, 10, 14); line(0, CELL - 8, CELL, CELL - 8, 10); line(0, CELL * 0.62, CELL, CELL * 0.62, 6);
    for (let x = 8; x < CELL; x += 24) line(x, 16, x, CELL - 10, 5);
    ctx.strokeStyle = iron; ctx.lineWidth = 5;
    for (let x = 20; x < CELL; x += 48) { ctx.beginPath(); ctx.arc(x, CELL * 0.32, 18, 0, Math.PI * 2); ctx.stroke(); }
  });
  // 4 Plain balcony bars.
  cellAt(4, () => {
    line(0, 10, CELL, 10, 16); line(0, CELL - 8, CELL, CELL - 8, 10);
    for (let x = 10; x < CELL; x += 20) line(x, 16, x, CELL - 10, 6);
  });
  // 5 Bông gió breeze blocks: a grid of pierced tiles.
  cellAt(5, () => {
    rect(0, 0, CELL, CELL, '#f2f2f2');
    ctx.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 64 + 32, cy = y * 64 + 32;
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(cx + dx * 18, cy + dy * 6); ctx.lineTo(cx + dx * 28, cy + dy * 28); ctx.lineTo(cx + dx * 6, cy + dy * 18); ctx.closePath(); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  // 6 AC unit front: casing, fan grille, a brand-less badge.
  cellAt(6, () => {
    rect(0, 0, CELL, CELL, '#e9eae6');
    rect(0, CELL - 18, CELL, 18, '#cfd1cc');
    ctx.fillStyle = '#9fa39f'; ctx.beginPath(); ctx.arc(150, 128, 92, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6f736f'; ctx.lineWidth = 4;
    for (let r = 20; r < 92; r += 12) { ctx.beginPath(); ctx.arc(150, 128, r, 0, Math.PI * 2); ctx.stroke(); }
    line(58, 128, 242, 128, 4, '#6f736f'); line(150, 36, 150, 220, 4, '#6f736f');
    rect(16, 30, 28, 190, '#d7d9d4');
    for (let y = 40; y < 210; y += 12) rect(18, y, 24, 5, '#b9bcb7');
  });
  // 7 Solar water heater tubes.
  cellAt(7, () => {
    rect(0, 0, CELL, CELL, '#c9ccc8');
    for (let x = 6; x < CELL; x += 20) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, '#0f1a2c'); g.addColorStop(0.45, '#4c6a8e'); g.addColorStop(1, '#0c1522');
      ctx.fillStyle = g; ctx.fillRect(x, 10, 16, CELL - 20);
    }
  });
  // 8 Snack strips hanging in a shop front (alpha between the strips).
  cellAt(8, () => {
    const cols = ['#e5484d', '#f5c84a', '#3f8fc9', '#5e9a5a', '#f08c3a', '#c57bb6', '#f4f1e8'];
    for (let x = 4; x < CELL; x += 32) {
      for (let y = 0; y < CELL; y += 30) {
        rect(x, y + 2, 26, 26, cols[Math.floor(rnd() * cols.length)]);
        rect(x + 4, y + 9, 18, 6, 'rgba(255,255,255,0.75)');
      }
      rect(x + 12, 0, 2, CELL, '#555555');
    }
  });
  // 9 Lottery board: rows of tickets clipped to a frame.
  cellAt(9, () => {
    rect(0, 0, CELL, CELL, '#2f5d8a');
    for (let y = 10; y < CELL - 20; y += 40) for (let x = 10; x < CELL - 20; x += 30) {
      rect(x, y, 26, 34, ['#f6e7b0', '#d9f0d0', '#f8d0d0', '#d6e6f8'][Math.floor(rnd() * 4)]);
      rect(x + 3, y + 6, 20, 4, '#c8322a'); rect(x + 3, y + 16, 14, 3, '#555'); rect(x + 3, y + 23, 18, 3, '#555');
    }
  });
  // 10 Thần Tài / Ông Địa altar front: red cabinet, gold trim, two figures, fruit and an incense pot.
  cellAt(10, () => {
    rect(0, 0, CELL, CELL, '#a3201a');
    ctx.strokeStyle = '#e8b53a'; ctx.lineWidth = 10; ctx.strokeRect(14, 14, CELL - 28, CELL - 28);
    rect(30, 30, CELL - 60, 120, '#5a0f0b');
    for (const [x, c] of [[90, '#f3c27a'], [166, '#e8a050']] as const) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, 82, 24, 0, Math.PI * 2); ctx.fill(); rect(x - 26, 100, 52, 46, '#d8402c'); }
    rect(40, 160, CELL - 80, 14, '#e8b53a');
    for (const [x, c] of [[70, '#f5c84a'], [100, '#e5484d'], [190, '#5e9a5a']] as const) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, 196, 16, 0, Math.PI * 2); ctx.fill(); }
    rect(130, 186, 32, 34, '#c8a24a');
  });
  // 11 Family altar on the back wall: dark shelf, framed photos, red-gold panels, lamps.
  cellAt(11, () => {
    rect(0, 0, CELL, CELL, '#e9e1cf');
    rect(20, 20, CELL - 40, 140, '#8a1f17');
    ctx.strokeStyle = '#e8b53a'; ctx.lineWidth = 6; ctx.strokeRect(26, 26, CELL - 52, 128);
    for (const x of [62, 112, 162]) { rect(x, 50, 34, 44, '#3a2a1e'); rect(x + 5, 55, 24, 34, '#c9b8a0'); }
    rect(20, 160, CELL - 40, 30, '#5a3a22');
    for (const x of [50, 206]) { rect(x - 6, 120, 12, 36, '#f2d36b'); }
    rect(110, 128, 36, 30, '#c8a24a');
    rect(30, 190, CELL - 60, 66, '#6a4428');
  });
  // 12 Stickers on a pole: overlapping paper rectangles with scribbled lines (alpha around them).
  cellAt(12, () => {
    for (let k = 0; k < 9; k++) {
      const x = rnd() * 180, y = rnd() * 200, w = 50 + rnd() * 60, h = 30 + rnd() * 40;
      rect(x, y, w, h, ['#f6f2e4', '#f7e36b', '#f2b8c6', '#cfe8f2', '#ffffff'][k % 5]);
      for (let l = 0; l < 3; l++) rect(x + 6, y + 8 + l * 9, w * (0.4 + rnd() * 0.4), 4, ['#c8322a', '#1d4f9c', '#222'][l]);
    }
  });
  // 13 Danger sign: a yellow triangle with a bolt and NGUY HIỂM.
  cellAt(13, () => {
    ctx.fillStyle = '#f2c12e'; ctx.strokeStyle = '#111'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(128, 14); ctx.lineTo(242, 196); ctx.lineTo(14, 196); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(138, 62); ctx.lineTo(104, 136); ctx.lineTo(128, 136); ctx.lineTo(116, 182); ctx.lineTo(156, 112); ctx.lineTo(132, 112); ctx.closePath(); ctx.fill();
    rect(14, 204, 228, 44, '#ffffff');
    ctx.fillStyle = '#c8322a'; ctx.font = '900 34px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('NGUY HIỂM', 128, 227, 220);
  });
  // 14 Corrugated tôn sheet (pale; tinted blue, rust or grey).
  cellAt(14, () => {
    for (let x = 0; x < CELL; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.5, '#f4f4f4'); g.addColorStop(1, '#a8a8a8');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 16, CELL);
    }
    for (let k = 0; k < 14; k++) rect(rnd() * CELL, rnd() * CELL, 6 + rnd() * 20, 30 + rnd() * 90, 'rgba(120,80,50,0.18)');
  });
  // 15 Wooden double door with raised panels.
  cellAt(15, () => {
    rect(0, 0, CELL, CELL, '#6e4a2c');
    for (const x of [14, 134]) for (const y of [14, 98, 182]) { rect(x, y, 108, 70, '#80583a'); rect(x + 8, y + 8, 92, 54, '#6a4529'); }
    rect(124, 0, 8, CELL, '#4a301c'); rect(112, 120, 8, 24, '#d8b25a'); rect(136, 120, 8, 24, '#d8b25a');
  });
  // 16 Birdcage (alpha): a domed cage of bars with a bird.
  cellAt(16, () => {
    ctx.strokeStyle = '#e8d8b0'; ctx.lineWidth = 4;
    for (let k = -4; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(128 + k * 20, 230); ctx.quadraticCurveTo(128 + k * 22, 40, 128, 30); ctx.stroke(); }
    line(40, 230, 216, 230, 10, '#a0784a'); line(128, 30, 128, 6, 4, '#a0784a');
    ctx.fillStyle = '#e5a93a'; ctx.beginPath(); ctx.ellipse(120, 160, 22, 14, -0.3, 0, Math.PI * 2); ctx.fill();
  });
  // 17 Roller shutter (cửa cuốn) ribs, pale for tinting.
  cellAt(17, () => {
    for (let y = 0; y < CELL; y += 16) { rect(0, y, CELL, 16, '#dfe2e3'); rect(0, y, CELL, 3, '#9ea4a6'); rect(0, y + 4, CELL, 2, '#f7f8f8'); }
    rect(0, CELL - 14, CELL, 14, '#8d9395'); rect(110, CELL - 30, 36, 10, '#5f6567');
  });
  // 18 Shelves of goods: rows of bottles, packets, boxes.
  cellAt(18, () => {
    rect(0, 0, CELL, CELL, '#c9b998');
    for (let y = 0; y < 4; y++) {
      const top = 8 + y * 62;
      rect(0, top + 52, CELL, 8, '#7a5a3f');
      for (let x = 4; x < CELL - 10;) {
        const w = 10 + rnd() * 22, h = 22 + rnd() * 28;
        rect(x, top + 52 - h, w, h, ['#e5484d', '#f5c84a', '#3f8fc9', '#5e9a5a', '#f08c3a', '#f4f1e8', '#7a4fa0', '#2f2f2f'][Math.floor(rnd() * 8)]);
        x += w + 2;
      }
    }
  });
  // 19 Drinks fridge: a glass door with rows of cans and bottles, a lit header.
  cellAt(19, () => {
    rect(0, 0, CELL, CELL, '#d8dcdc');
    rect(0, 0, CELL, 34, '#c8322a');
    rect(16, 44, CELL - 32, CELL - 60, '#26343c');
    for (let y = 56; y < CELL - 30; y += 44) for (let x = 24; x < CELL - 30; x += 18) rect(x, y, 12, 32, ['#e5484d', '#5e9a5a', '#f5c84a', '#e9eef0', '#3f8fc9'][Math.floor(rnd() * 5)]);
  });
  // 20 Menu board (bảng thực đơn): THỰC ĐƠN over scribbled lines and prices.
  cellAt(20, () => {
    rect(0, 0, CELL, CELL, '#f4ead0');
    ctx.strokeStyle = '#c8322a'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, CELL - 12, CELL - 12);
    ctx.fillStyle = '#c8322a'; ctx.font = '900 40px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('THỰC ĐƠN', 128, 40, 220);
    for (let y = 78; y < CELL - 20; y += 30) { rect(20, y, 110 + rnd() * 40, 8, '#1d4f9c'); rect(196, y, 36, 8, '#c8322a'); }
  });
  // 21 Gạch bông: patterned cement tiles.
  cellAt(21, () => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 64 + 32, cy = y * 64 + 32;
      rect(cx - 32, cy - 32, 64, 64, '#efe6d4');
      ctx.fillStyle = '#2f6f7a'; ctx.beginPath(); ctx.moveTo(cx, cy - 26); ctx.lineTo(cx + 26, cy); ctx.lineTo(cx, cy + 26); ctx.lineTo(cx - 26, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8322a'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
      for (const [dx, dy] of [[-32, -32], [32, -32], [32, 32], [-32, 32]]) { ctx.fillStyle = '#d9a441'; ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 12, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  // 22 Electricity meters: a row of grey boxes with dials and a tangle of wires below (alpha around).
  cellAt(22, () => {
    for (let k = 0; k < 4; k++) {
      const x = 8 + k * 62;
      rect(x, 40, 54, 90, '#c9cdcf'); rect(x + 8, 52, 38, 30, '#e9ece8'); rect(x + 14, 60, 26, 8, '#222');
      for (let w = 0; w < 3; w++) line(x + 14 + w * 12, 130, x + 6 + w * 20 + rnd() * 20, 250, 3, '#1b1b1b');
    }
  });
  // 23 Torn posters and flyers pasted on a wall (rao vặt).
  cellAt(23, () => {
    for (let k = 0; k < 7; k++) {
      const x = rnd() * 170, y = rnd() * 170, w = 60 + rnd() * 50, h = 50 + rnd() * 60;
      rect(x, y, w, h, ['#f4f1e4', '#f2e46b', '#d9edf2', '#f6cfd8'][k % 4]);
      rect(x + 6, y + 6, w - 12, 10, ['#c8322a', '#1d4f9c'][k % 2]);
      for (let l = 0; l < 4; l++) rect(x + 6, y + 24 + l * 9, (w - 12) * (0.5 + rnd() * 0.5), 4, '#333');
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/** `glow` 0..1: how much the quad lights up after dark (goods and altars inside a lit shop front). */
export type DecalQuad = { cell: DecalCell; x: number; y: number; z: number; w: number; h: number; yaw: number; pitch: number; color: THREE.Color; glow: number };

/**
 * Merges decal quads into one geometry (with `split`, one per 160 m tile for frustum culling): positions, normals,
 * atlas UVs and vertex colours. A quad faces `yaw` (the same convention as world.ts frames: +z at yaw 0) and leans back by
 * `pitch` (pi/2 lies flat, facing up).
 */
export function buildDecals(quads: DecalQuad[], material: THREE.Material, name: string, split = false) {
  const buckets = new Map<string, DecalQuad[]>();
  for (const q of quads) {
    const key = split ? tileKey(q.x, q.z) : 'all';
    let list = buckets.get(key);
    if (!list) { list = []; buckets.set(key, list); }
    list.push(q);
  }
  const meshes: THREE.Mesh[] = [], geometries: THREE.BufferGeometry[] = [];
  const inset = 0.5 / (DECAL_COLS * CELL);
  for (const list of buckets.values()) {
    const position = new Float32Array(list.length * 12), normal = new Float32Array(list.length * 12), uv = new Float32Array(list.length * 8), color = new Float32Array(list.length * 12), glow = new Float32Array(list.length * 4);
    const index = new Uint32Array(list.length * 6);
    list.forEach((q, i) => {
      const sy = Math.sin(q.yaw), cy = Math.cos(q.yaw), sp = Math.sin(q.pitch), cp = Math.cos(q.pitch);
      const rx = cy, rz = -sy;
      const ux = -sy * sp, uy = cp, uz = -cy * sp;
      const nx = sy * cp, ny = sp, nz = cy * cp;
      const hw = q.w / 2, hh = q.h / 2;
      const col = q.cell % DECAL_COLS, row = Math.floor(q.cell / DECAL_COLS);
      const u0 = col / DECAL_COLS + inset, u1 = (col + 1) / DECAL_COLS - inset;
      const v1 = 1 - row / DECAL_ROWS - inset, v0 = 1 - (row + 1) / DECAL_ROWS + inset;
      const corners = [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]];
      corners.forEach(([a, b, u, v], k) => {
        const o = i * 4 + k;
        position.set([q.x + rx * a * hw + ux * b * hh, q.y + uy * b * hh, q.z + rz * a * hw + uz * b * hh], o * 3);
        normal.set([nx, ny, nz], o * 3);
        uv.set([u, v], o * 2);
        color.set([q.color.r, q.color.g, q.color.b], o * 3);
        glow[o] = q.glow;
      });
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    meshes.push(mesh);
    geometries.push(geometry);
  }
  return { meshes, geometries };
}
