import * as THREE from 'three';
import { seeThrough } from './see-through.ts';

/**
 * Zombie mode's presentation effects, each family ONE instanced draw that is hidden while empty:
 * - decals on the ground: telegraph markers (ring, landing circle, cone, charge line), acid and bile puddles, slam
 *   cracks, shock rings and scorches, all drawn by one shader from per-instance parameters;
 * - puffs: soft billboards for toxic clouds, mist, dust (from facades before a quake, from rubble) and the smoke
 *   columns over burning ruins;
 * - eyes: additive glints for every zombie and mutant (fog-free: eyes show in dark alleys before the bodies do),
 *   also used for the flickering lamp glows;
 * - growths: tumours, bone spurs and hair clumps on mutants and specials (lumpy icospheres reshaped per instance);
 * - glows: unlit pulsing weak spots, throat sacs and flying bile;
 * - props: riot shields, shippers' insulated boxes, dropped helmets and thrown chunks of wreck.
 * Every time (from, until, now) is in seconds on the caller's game clock (update's `now`).
 */
export type HorrorFx = ReturnType<typeof createHorrorFx>;
type MarkerKind = 'ring' | 'circle' | 'cone' | 'line';
type ProjectileKind = 'spit' | 'bile' | 'throw';
const DECAL = { ring: 0, circle: 1, cone: 2, line: 3, acid: 4, bile: 5, crack: 6, shock: 7, scorch: 8 } as const;
const MAX_DECALS = 64, MAX_PUFFS = 384, MAX_EYES = 512, MAX_GROWTHS = 96, MAX_GLOWS = 48, MAX_PROPS = 64, MAX_PROJECTILES = 24;
export const PROJECTILE_GRAVITY = 14;

const FOG_GLSL = /* glsl */`
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
vec3 hfFog(vec3 c, float depth) { return mix(c, uFogColor, smoothstep(uFogNear, uFogFar, depth)); }
`;

export function createHorrorFx(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  const root = new THREE.Group();
  root.name = 'horror-fx';
  scene.add(root);
  const disposables: { dispose(): void }[] = [];
  let base = NaN, lastNow = NaN;
  const rel = (t: number) => t - base;
  /** The latest clock reading (for calls that carry only an end time). */
  const nowOr = (fallback: number) => (Number.isNaN(lastNow) ? fallback : lastNow);
  const fogUniforms = { uFogColor: { value: new THREE.Color('#888888') }, uFogNear: { value: 100 }, uFogFar: { value: 400 } };
  /** Frames advance in update(); a list cleared by begin() only once per frame, so several systems can push into it. */
  let frame = 1;
  const color = new THREE.Color();

  // ---- Decals ---------------------------------------------------------------------------------------------
  const decalGeometry = new THREE.InstancedBufferGeometry();
  decalGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  decalGeometry.setIndex([0, 2, 1, 0, 3, 2]);
  const dA = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const dB = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const dC = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const dP = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  decalGeometry.setAttribute('dA', dA); decalGeometry.setAttribute('dB', dB); decalGeometry.setAttribute('dC', dC); decalGeometry.setAttribute('dP', dP);
  decalGeometry.instanceCount = 0;
  const decalMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { uTime: { value: 0 }, ...fogUniforms },
    vertexShader: /* glsl */`
      attribute vec4 dA; attribute vec4 dB; attribute vec4 dC; attribute vec4 dP;
      varying vec2 vL; varying vec4 vA; varying vec4 vB; varying vec4 vC; varying float vDepth;
      void main() {
        // dP: centre (x, y, z) and the half size of the quad; dA: kind, radius, yaw, arc.
        vec3 w = vec3(dP.x + position.x * dP.w, dP.y, dP.z + position.z * dP.w);
        float c = cos(dA.z), s = sin(dA.z);
        vec2 d = w.xz - dP.xz;
        // Local frame: +y along the facing (sin yaw, cos yaw), +x to its right.
        vL = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
        vA = dA; vB = dB; vC = dC;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      ${FOG_GLSL}
      varying vec2 vL; varying vec4 vA; varying vec4 vB; varying vec4 vC; varying float vDepth;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float kind = vA.x, r = vA.y, arc = vA.w;
        float t0 = vB.x, t1 = vB.y, fadeIn = vB.z;
        float d = length(vL), ang = abs(atan(vL.x, vL.y));
        float p = clamp((uTime - t0) / max(0.001, t1 - t0), 0.0, 1.0);
        float life = clamp((uTime - t0) / max(0.001, fadeIn), 0.0, 1.0) * (1.0 - clamp((uTime - t1) / 0.3, 0.0, 1.0));
        float a = 0.0;
        float edge = 1.0 - smoothstep(0.0, 0.18, abs(d - r));
        if (kind < 0.5) {            // ring: an edge that pulses faster as impact nears, and a fill growing inward
          a = edge * (0.55 + 0.35 * sin(uTime * (6.0 + 18.0 * p))) + step(d, r) * 0.22 * step(r * (1.0 - p), d);
        } else if (kind < 1.5) {     // landing circle: dark centre, bright rim, fill growing from the centre
          a = edge * 0.85 + step(d, r) * (0.18 + 0.4 * step(d, r * p));
        } else if (kind < 2.5) {     // cone of half-angle arc/2
          float inside = step(d, r) * step(ang, arc * 0.5);
          float rim = inside * (1.0 - smoothstep(0.0, 0.2, min(r - d, (arc * 0.5 - ang) * max(d, 0.5))));
          a = inside * 0.2 + rim * 0.7 + inside * step(d, r * p) * 0.25;
        } else if (kind < 3.5) {     // charge line: from the centre along +y, length r, half width arc
          float inside = step(0.0, vL.y) * step(vL.y, r) * step(abs(vL.x), arc);
          float chevron = step(0.5, fract((vL.y - abs(vL.x) * 0.8) * 0.35 - uTime * 1.5));
          a = inside * (0.2 + 0.35 * chevron + 0.25 * step(vL.y, r * p)) + inside * (1.0 - smoothstep(0.0, 0.15, arc - abs(vL.x))) * 0.6;
        } else if (kind < 5.5) {     // acid (4) or bile (5) puddle: a lumpy blob that bubbles
          float n = noise(vL * 1.6 + vec2(kind * 3.0)) * 0.45 + noise(vL * 5.0 + uTime * 0.4) * 0.15;
          a = smoothstep(r, r * 0.6, d + n * r * 0.5) * 0.8 * (0.85 + 0.15 * sin(uTime * 3.0 + d * 4.0));
        } else if (kind < 6.5) {     // crack: jagged dark radial lines and a ring of broken asphalt
          float spokes = abs(sin(atan(vL.x, vL.y) * 7.0 + noise(vL * 1.2) * 4.0));
          a = step(d, r) * (1.0 - smoothstep(0.02, 0.12, spokes)) * (1.0 - d / max(r, 0.01)) * 0.9 + edge * 0.35;
        } else if (kind < 7.5) {     // shock: a ring racing outward
          float rr = r * p;
          a = (1.0 - smoothstep(0.0, 0.5 + r * 0.05, abs(d - rr))) * (1.0 - p);
        } else {                     // scorch
          a = smoothstep(r, r * 0.3, d + noise(vL * 2.0) * r * 0.3) * 0.7;
        }
        a *= life * vC.a;
        if (a < 0.01) discard;
        gl_FragColor = vec4(hfFog(vC.rgb, vDepth), a);
      }`,
  });
  const decals = new THREE.Mesh(decalGeometry, decalMaterial);
  decals.frustumCulled = false;
  decals.renderOrder = 3;
  decals.visible = false;
  root.add(decals);
  disposables.push(decalGeometry, decalMaterial);
  type Decal = { id: number; kind: number; x: number; y: number; z: number; r: number; yaw: number; arc: number; from: number; until: number; fadeIn: number; color: THREE.Color; alpha: number };
  const live: Decal[] = [];
  let decalId = 0, decalsDirty = false;
  function addDecal(kind: number, x: number, z: number, r: number, yaw: number, arc: number, from: number, until: number, fadeIn: number, rgb: THREE.ColorRepresentation, alpha = 1) {
    if (Number.isNaN(base)) base = from;
    if (live.length >= MAX_DECALS) {
      // Drop the one ending first (never a marker whose impact is still to come, if anything else can go).
      let worst = 0;
      for (let i = 1; i < live.length; i++) if (live[i].kind > 3 && (live[worst].kind <= 3 || live[i].until < live[worst].until)) worst = i;
      live.splice(worst, 1);
    }
    const d: Decal = { id: ++decalId, kind, x, y: ground(x, z) + 0.035, z, r, yaw, arc, from, until, fadeIn, color: new THREE.Color(rgb), alpha };
    live.push(d);
    decalsDirty = true;
    return d.id;
  }
  function writeDecals() {
    decalsDirty = false;
    const A = dA.array as Float32Array, Bv = dB.array as Float32Array, C = dC.array as Float32Array, P = dP.array as Float32Array;
    live.forEach((d, i) => {
      const half = d.kind === DECAL.line ? d.r + d.arc + 0.5 : d.r + 0.6;
      const o = i * 4;
      A[o] = d.kind; A[o + 1] = d.r; A[o + 2] = d.yaw; A[o + 3] = d.arc;
      Bv[o] = rel(d.from); Bv[o + 1] = rel(d.until); Bv[o + 2] = d.fadeIn; Bv[o + 3] = 0;
      C[o] = d.color.r; C[o + 1] = d.color.g; C[o + 2] = d.color.b; C[o + 3] = d.alpha;
      P[o] = d.x; P[o + 1] = d.y; P[o + 2] = d.z; P[o + 3] = half;
    });
    for (const a of [dA, dB, dC, dP]) a.needsUpdate = true;
    decalGeometry.instanceCount = live.length;
    decals.visible = live.length > 0;
  }

  // ---- Puffs (billboards) --------------------------------------------------------------------------------------
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const puffGeometry = quad.clone() as THREE.InstancedBufferGeometry;
  const pP = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const pC = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  puffGeometry.setAttribute('pP', pP); puffGeometry.setAttribute('pC', pC);
  puffGeometry.instanceCount = 0;
  const puffMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ...fogUniforms },
    vertexShader: /* glsl */`
      attribute vec4 pP; attribute vec4 pC;
      varying vec2 vUv; varying vec4 vC; varying float vDepth; varying float vSeed;
      void main() {
        vec4 mv = modelViewMatrix * vec4(pP.xyz, 1.0);
        mv.xy += position.xy * pP.w;
        vUv = position.xy * 2.0; vC = pC; vDepth = -mv.z; vSeed = fract(pP.x * 0.37 + pP.z * 0.71);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${FOG_GLSL}
      varying vec2 vUv; varying vec4 vC; varying float vDepth; varying float vSeed;
      void main() {
        float d = length(vUv);
        float lump = 0.85 + 0.15 * sin(atan(vUv.y, vUv.x) * 5.0 + vSeed * 20.0);
        float a = smoothstep(1.0, 0.25, d / lump) * vC.a;
        if (a < 0.01) discard;
        gl_FragColor = vec4(hfFog(vC.rgb, vDepth), a);
      }`,
  });
  const puffs = new THREE.Mesh(puffGeometry, puffMaterial);
  puffs.frustumCulled = false;
  puffs.renderOrder = 4;
  puffs.visible = false;
  root.add(puffs);
  disposables.push(puffGeometry, puffMaterial, quad);
  // Per puff: x, y, z, vx, vy, vz, size, grow, born, life, r, g, b, alpha, churn (CPU state).
  const PF = 15;
  const puffState = new Float32Array(MAX_PUFFS * PF);
  let puffCount = 0;
  function puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, grow: number, born: number, life: number, rgb: THREE.Color, alpha: number, churn = 0) {
    if (Number.isNaN(base)) base = born;
    let i = puffCount;
    if (puffCount >= MAX_PUFFS) {
      // Replace the oldest.
      let oldest = 0;
      for (let k = 1; k < MAX_PUFFS; k++) if (puffState[k * PF + 8] < puffState[oldest * PF + 8]) oldest = k;
      i = oldest;
    } else puffCount++;
    puffState.set([x, y, z, vx, vy, vz, size, grow, rel(born), life, rgb.r, rgb.g, rgb.b, alpha, churn], i * PF);
  }

  // ---- Eyes (additive glints and lamp glows) ---------------------------------------------------------------------
  const eyeGeometry = quad.clone() as THREE.InstancedBufferGeometry;
  const eP = new THREE.InstancedBufferAttribute(new Float32Array(MAX_EYES * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const eC = new THREE.InstancedBufferAttribute(new Float32Array(MAX_EYES * 4), 4).setUsage(THREE.DynamicDrawUsage);
  eyeGeometry.setAttribute('eP', eP); eyeGeometry.setAttribute('eC', eC);
  eyeGeometry.instanceCount = 0;
  const eyeMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 eP; attribute vec4 eC;
      varying vec2 vUv; varying vec4 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(eP.xyz, 1.0);
        // Pulled a little toward the camera (in front of the face it sits on), never smaller than ~2 px.
        mv.xyz += normalize(-mv.xyz) * 0.12;
        float size = max(eP.w, -mv.z * 0.005);
        mv.xy += position.xy * size;
        vUv = position.xy * 2.0; vC = eC;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec4 vC;
      void main() {
        float d = length(vUv);
        float a = (smoothstep(1.0, 0.0, d) * 0.55 + smoothstep(0.35, 0.0, d)) * vC.a;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC.rgb * a, a);
      }`,
  });
  const eyes = new THREE.Mesh(eyeGeometry, eyeMaterial);
  eyes.frustumCulled = false;
  eyes.renderOrder = 6;
  eyes.visible = false;
  root.add(eyes);
  disposables.push(eyeGeometry, eyeMaterial);
  const eyeList = { n: 0, began: 0 };

  // ---- Growths, glows and props (lit or unlit instanced meshes, reshaped per instance) ------------------------------
  function shaped(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, glsl: string) {
    const shape = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('hfShape', shape);
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float hfShape;')
        .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);\n${glsl}`);
    };
    material.customProgramCacheKey = () => `horror-${capacity}-${glsl.length}`;
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, color.set('#ffffff'));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    root.add(mesh);
    disposables.push(geometry, material);
    return { mesh, shape, n: 0, began: 0 };
  }
  // Growths: 0 a lumpy tumour, 1 a bone spur along +y, 2 a hair clump hanging along -y.
  const growths = shaped(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), MAX_GROWTHS, /* glsl */`
    if (hfShape < 0.5) transformed *= 1.0 + 0.2 * sin(position.x * 7.0 + position.y * 5.0) * sin(position.z * 6.0 - position.y * 4.0);
    else if (hfShape < 1.5) { float t = position.y * 0.5 + 0.5; transformed.xz *= (1.0 - t) * 0.5 + 0.06; transformed.y = position.y * 1.7 + 0.7; }
    else { float t = 0.5 - position.y * 0.5; transformed.xz *= 0.42 * (1.0 - 0.55 * t); transformed.y = position.y * 2.6 - 1.5; transformed.x += 0.25 * t * t; }`);
  // A giant's growths fade with its body when it blocks the camera (see-through.ts).
  seeThrough(growths.mesh.material as THREE.MeshStandardMaterial);
  const glows = shaped(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }), MAX_GLOWS, /* glsl */`
    transformed *= 1.0 + 0.08 * sin(position.y * 9.0 + position.x * 5.0);`);
  // Props: 0 an insulated box, 1 a riot shield (a slab curved around the arm), 2 a helmet, 3 a jagged chunk of wreck.
  const props = shaped(new THREE.BoxGeometry(1, 1, 1, 4, 4, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }), MAX_PROPS, /* glsl */`
    if (hfShape > 0.5 && hfShape < 1.5) { transformed.z -= 1.6 * position.x * position.x; transformed.xy *= vec2(1.0, 1.0 - 0.15 * abs(position.x)); }
    else if (hfShape > 1.5 && hfShape < 2.5) { vec3 p = normalize(position + vec3(0.0, 0.25, 0.0)) * 0.55; p.y = max(p.y, -0.05); transformed = p; }
    else if (hfShape > 2.5) { transformed *= 0.8 + 0.35 * fract(sin(dot(position, vec3(12.9, 78.2, 37.7))) * 43758.5); }`);
  type Pushable = typeof growths;
  const beginList = (l: { n: number; began: number }) => { if (l.began !== frame) { l.began = frame; l.n = 0; } };
  function commit(l: Pushable) {
    l.mesh.count = l.n;
    l.mesh.visible = l.n > 0;
    if (l.n > 0) {
      l.mesh.instanceMatrix.clearUpdateRanges(); l.mesh.instanceMatrix.addUpdateRange(0, l.n * 16); l.mesh.instanceMatrix.needsUpdate = true;
      l.mesh.instanceColor!.needsUpdate = true;
      l.shape.needsUpdate = true;
    }
  }
  function pushShaped(l: Pushable, m: THREE.Matrix4, rgb: number, shape: number, k = 1) {
    beginList(l);
    if (l.n >= l.mesh.instanceMatrix.count) return;
    l.mesh.setMatrixAt(l.n, m);
    color.setHex(rgb);
    if (k !== 1) color.multiplyScalar(k);
    l.mesh.setColorAt(l.n, color);
    (l.shape.array as Float32Array)[l.n] = shape;
    l.n++;
  }

  // ---- Projectiles ---------------------------------------------------------------------------------------------
  type Projectile = { id: number; kind: ProjectileKind; x: number; y: number; z: number; vx: number; vy: number; vz: number; t0: number; t: number; lx: number; lz: number; trail: number };
  const flying: Projectile[] = [];
  const seenProjectiles: number[] = [];
  /** Where a ballistic throw (gravity PROJECTILE_GRAVITY) from (x, y, z) at velocity v lands: flight time and point. */
  function landing(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    let t = 0, px = x, pz = z;
    for (let k = 0; k < 400; k++) {
      const nt = t + 0.02, ny = y + vy * nt - 0.5 * PROJECTILE_GRAVITY * nt * nt;
      px = x + vx * nt; pz = z + vz * nt;
      if (ny <= ground(px, pz)) {
        // Refine between t and nt.
        let lo = t, hi = nt;
        for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (y + vy * m - 0.5 * PROJECTILE_GRAVITY * m * m <= ground(x + vx * m, z + vz * m)) hi = m; else lo = m; }
        return { t: hi, x: x + vx * hi, z: z + vz * hi };
      }
      t = nt;
    }
    return { t, x: px, z: pz };
  }

  // ---- Smoke columns and lamp flicker ------------------------------------------------------------------------------
  let columns: { x: number; z: number; h: number; next: number }[] = [];
  const camPos = new THREE.Vector3();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpE = new THREE.Euler();
  const C = {
    acid: new THREE.Color('#8fd14a'), bile: new THREE.Color('#b8c23a'), toxic: new THREE.Color('#9cc35a'), mist: new THREE.Color('#b9c7a8'),
    dust: new THREE.Color('#8f8574'), smoke: new THREE.Color('#3b3936'), spit: 0x9fe04a, bileGlow: 0xd2d84a, chunk: 0x5a544c, lamp: new THREE.Color('#ffc97a'),
  };
  const noise1 = (x: number) => { const i = Math.floor(x), f = x - i, h = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }; return h(i) + (h(i + 1) - h(i)) * f * f * (3 - 2 * f); };

  const fx = {
    /**
     * A telegraph marker on the ground: 'ring' (slams, bursts), 'circle' (landing spots), 'cone' (`arc` = the full
     * angle, along yaw), 'line' (a charge: length r along yaw, `arc` = half width). It fills toward `until` (the
     * impact) and fades just after. Returns an id for clearMarker().
     */
    marker(kind: MarkerKind, x: number, z: number, r: number, yaw: number, arc: number, from: number, until: number, rgb: THREE.ColorRepresentation = '#ff5a2a') {
      return addDecal(DECAL[kind], x, z, r, yaw, arc, from, until, 0.12, rgb, 1);
    },
    clearMarker(id: number) {
      const i = live.findIndex((d) => d.id === id);
      if (i >= 0) { live.splice(i, 1); decalsDirty = true; }
    },
    /** A bubbling acid or bile puddle until `until` (cosmetic; damage is the caller's). */
    puddle(x: number, z: number, r: number, until: number, kind: 'acid' | 'bile') {
      const now = nowOr(until - 6);
      return addDecal(kind === 'acid' ? DECAL.acid : DECAL.bile, x, z, r, 0, 0, now, until, 0.35, kind === 'acid' ? C.acid : C.bile, 0.85);
    },
    /** A toxic cloud or a mist bank of radius r until `until`: soft puffs that churn in place, then thin out. */
    cloud(x: number, z: number, r: number, until: number, kind: 'toxic' | 'mist') {
      const now = nowOr(until - 6);
      const n = Math.min(16, Math.max(5, Math.round(r * 1.6)));
      const rgb = kind === 'toxic' ? C.toxic : C.mist;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.sin(k * 7.1), d = r * Math.sqrt((k + 0.5) / n) * 0.85;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        puff(px, ground(px, pz) + 0.6 + (k % 3) * 0.5, pz, Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, r * 0.55 + 1.2, 0.08, now, Math.max(0.5, until - now), rgb, kind === 'toxic' ? 0.5 : 0.35, 1);
      }
    },
    /** A slam's crack in the asphalt (stays 8 s) with a shock ring. */
    crack(x: number, z: number, r: number, now: number) {
      addDecal(DECAL.crack, x, z, r, now * 1.7, 0, now, now + 8, 0.05, '#1c1714', 0.9);
      fx.shock(x, z, r, now);
    },
    /** Dust: rising from rubble (and falling from facades near players before a quake): `amount` puffs. */
    dust(x: number, z: number, now: number, amount: number) {
      const y = ground(x, z);
      for (let k = 0; k < Math.min(40, amount); k++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * 1.5;
        puff(x + Math.cos(a) * d, y + 0.3 + Math.random() * 2.2, z + Math.sin(a) * d, Math.cos(a) * 0.6, 0.4 + Math.random() * 0.6, Math.sin(a) * 0.6, 0.6 + Math.random() * 0.8, 0.5, now, 1.6 + Math.random() * 1.4, C.dust, 0.55);
      }
    },
    /** A shock ring racing outward to r over half a second. */
    shock(x: number, z: number, r: number, now: number) { addDecal(DECAL.shock, x, z, r, 0, 0, now, now + 0.55, 0.01, '#d8c8a8', 0.8); },
    /** A scorch mark (burnt ground under a burst). */
    scorch(x: number, z: number, r: number, now: number, until = now + 30) { addDecal(DECAL.scorch, x, z, r, 0, 0, now, until, 0.2, '#161310', 0.8); },
    /**
     * Launches a projectile (spit or bile: a glowing blob; throw: a tumbling chunk of wreck) and returns where and
     * when (seconds of flight) it lands; a repeated id is ignored. On landing it leaves a puddle (spit/bile) or dust.
     */
    projectile(id: number, kind: ProjectileKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, now: number) {
      if (Number.isNaN(base)) base = now;
      const land = landing(x, y, z, vx, vy, vz);
      if (seenProjectiles.includes(id)) return land;
      seenProjectiles.push(id);
      if (seenProjectiles.length > 64) seenProjectiles.shift();
      if (flying.length >= MAX_PROJECTILES) flying.shift();
      flying.push({ id, kind, x, y, z, vx, vy, vz, t0: now, t: land.t, lx: land.x, lz: land.z, trail: 0 });
      return land;
    },
    eyes: {
      begin() { beginList(eyeList); },
      /** One glint (rgb packed, strength 0..1+; size in metres, 0.085 for an eye). */
      push(x: number, y: number, z: number, rgb: number, strength: number, size = 0.085) {
        beginList(eyeList);
        if (eyeList.n >= MAX_EYES || strength <= 0.01) return;
        const o = eyeList.n * 4, P = eP.array as Float32Array, Cc = eC.array as Float32Array;
        color.setHex(rgb);
        P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = size;
        Cc[o] = color.r; Cc[o + 1] = color.g; Cc[o + 2] = color.b; Cc[o + 3] = strength;
        eyeList.n++;
      },
      end() { eyeGeometry.instanceCount = eyeList.n; eyes.visible = eyeList.n > 0; eP.needsUpdate = true; eC.needsUpdate = true; },
    },
    growths: {
      begin() { beginList(growths); },
      push(m: THREE.Matrix4, rgb: number, shape: number) { pushShaped(growths, m, rgb, shape); },
      end() { commit(growths); },
    },
    glows: {
      begin() { beginList(glows); },
      /** A glowing blob; `pulse` 0..1 brightens it (colours above 1 are not tone mapped). */
      push(m: THREE.Matrix4, rgb: number, pulse: number) { pushShaped(glows, m, rgb, 0, 0.55 + 0.95 * pulse); },
      end() { commit(glows); },
    },
    props: {
      begin() { beginList(props); },
      /** 0 insulated box, 1 riot shield, 2 helmet, 3 chunk of wreck; the matrix scales a unit box. */
      push(m: THREE.Matrix4, rgb: number, shape: number) { pushShaped(props, m, rgb, shape); },
      end() { commit(props); },
    },
    /** Smoke columns over burning ruins (replaces the list; h = how high they rise). */
    setColumns(list: readonly { x: number; z: number; h: number }[]) { columns = list.map((c, i) => ({ ...c, next: i * 0.13 })); },
    /**
     * Flickering lamp glows near (focusX, focusZ) at night: `level` 0 a faint unsteady hum, 1 heavy flicker with
     * dropouts (a stalker near, a quake building); `blackout` puts them all out (a roar).
     */
    flicker(lamps: readonly { x: number; y: number; z: number }[], focusX: number, focusZ: number, night: number, level: number, now: number, blackout = false) {
      if (night < 0.2 || blackout) return;
      let i = 0;
      for (const l of lamps) {
        i++;
        const dx = l.x - focusX, dz = l.z - focusZ;
        if (dx * dx + dz * dz > 55 * 55) continue;
        const n = noise1(now * (3 + 9 * level) + i * 13.7);
        const drop = noise1(now * 0.7 + i * 3.1) < 0.12 + 0.3 * level ? 0.05 : 1;
        const k = night * drop * (0.75 + 0.25 * n - 0.5 * level * (n < 0.35 ? 1 : 0));
        if (k > 0.03) fx.eyes.push(l.x, l.y, l.z, C.lamp.getHex(), k * 0.8, 0.9);
      }
    },
    update(now: number, dt: number, camera: THREE.Camera) {
      if (Number.isNaN(base)) base = now;
      lastNow = now;
      const t = rel(now);
      decalMaterial.uniforms.uTime.value = t;
      const fog = scene.fog as THREE.Fog | null;
      if (fog && 'near' in fog) { fogUniforms.uFogColor.value.copy(fog.color); fogUniforms.uFogNear.value = fog.near; fogUniforms.uFogFar.value = fog.far; }
      // Decals past their end (+ fade) go.
      for (let i = live.length - 1; i >= 0; i--) if (now > live[i].until + 0.35) { live.splice(i, 1); decalsDirty = true; }
      if (decalsDirty) writeDecals();
      // Projectiles: fly, trail, land.
      camera.getWorldPosition(camPos);
      for (let i = flying.length - 1; i >= 0; i--) {
        const p = flying[i], age = now - p.t0;
        if (age >= p.t) {
          flying.splice(i, 1);
          if (p.kind === 'throw') { fx.dust(p.lx, p.lz, now, 18); fx.shock(p.lx, p.lz, 3, now); }
          else fx.puddle(p.lx, p.lz, p.kind === 'spit' ? 1.8 : 3, now + (p.kind === 'spit' ? 5 : 6), p.kind === 'spit' ? 'acid' : 'bile');
          continue;
        }
        const x = p.x + p.vx * age, y = p.y + p.vy * age - 0.5 * PROJECTILE_GRAVITY * age * age, z = p.z + p.vz * age;
        if (p.kind === 'throw') {
          tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(age * 3.1, age * 2.3, age * 1.7)), tmpS.set(1.9, 0.9, 1.4));
          pushShaped(props, tmpM, C.chunk, 3);
        } else {
          const r = p.kind === 'spit' ? 0.22 : 0.4;
          tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(r, r, r));
          pushShaped(glows, tmpM, p.kind === 'spit' ? C.spit : C.bileGlow, 0, 1.4);
          if ((p.trail += dt) > 0.05) { p.trail = 0; puff(x, y, z, 0, 0.2, 0, r * 2.2, 0.6, now, 0.5, p.kind === 'spit' ? C.acid : C.bile, 0.35); }
        }
      }
      // Smoke columns within view distance.
      for (const c of columns) {
        const dx = c.x - camPos.x, dz = c.z - camPos.z;
        if (dx * dx + dz * dz > 320 * 320 || t < c.next) continue;
        c.next = t + 0.45 + Math.random() * 0.3;
        const y = ground(c.x, c.z);
        puff(c.x + (Math.random() - 0.5) * 1.5, y + 1, c.z + (Math.random() - 0.5) * 1.5, 0.35 + (Math.random() - 0.5) * 0.4, Math.min(4, c.h / 6), 0.2, 2.2, 0.9, now, 7 + Math.random() * 3, C.smoke, 0.5);
      }
      // Puffs: drift, grow, fade; dead ones swap with the last.
      const P = pP.array as Float32Array, Cc = pC.array as Float32Array;
      let n = 0;
      for (let i = 0; i < puffCount; i++) {
        const s = i * PF, age = t - puffState[s + 8], life = puffState[s + 9];
        if (age >= life) {
          puffCount--;
          if (i !== puffCount) { puffState.copyWithin(s, puffCount * PF, puffCount * PF + PF); i--; }
          continue;
        }
        const churn = puffState[s + 14];
        puffState[s] += (puffState[s + 3] + churn * 0.3 * Math.sin(t * 0.9 + i)) * dt;
        puffState[s + 1] += puffState[s + 4] * dt;
        puffState[s + 2] += (puffState[s + 5] + churn * 0.3 * Math.cos(t * 0.8 + i * 1.3)) * dt;
        const size = puffState[s + 6] * (1 + puffState[s + 7] * age);
        const fade = Math.min(1, age / 0.35, (life - age) / Math.min(1.2, life * 0.4));
        const o = n * 4;
        P[o] = puffState[s]; P[o + 1] = puffState[s + 1]; P[o + 2] = puffState[s + 2]; P[o + 3] = size;
        Cc[o] = puffState[s + 10]; Cc[o + 1] = puffState[s + 11]; Cc[o + 2] = puffState[s + 12]; Cc[o + 3] = puffState[s + 13] * Math.max(0, fade);
        n++;
      }
      puffGeometry.instanceCount = n;
      puffs.visible = n > 0;
      if (n > 0) { pP.needsUpdate = true; pC.needsUpdate = true; }
      // Lists nobody pushed into this frame are emptied; every list is committed.
      if (eyeList.began !== frame) eyeList.n = 0;
      fx.eyes.end();
      for (const l of [growths, glows, props]) { if (l.began !== frame) l.n = 0; commit(l); }
      frame++;
    },
    stats() {
      const meshes = [decals, puffs, eyes, growths.mesh, glows.mesh, props.mesh];
      return { calls: meshes.filter((m) => m.visible).length, instances: live.length + puffGeometry.instanceCount + eyeList.n + growths.n + glows.n + props.n, projectiles: flying.length };
    },
    /** Clears everything (leaving zombie mode). */
    clear() {
      live.length = 0; decalsDirty = true; puffCount = 0; flying.length = 0; columns = [];
      eyeList.n = 0; growths.n = glows.n = props.n = 0;
      writeDecals(); fx.eyes.end(); for (const l of [growths, glows, props]) commit(l);
      puffGeometry.instanceCount = 0; puffs.visible = false;
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d.dispose();
    },
  };
  return fx;
}
