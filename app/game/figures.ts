import * as THREE from 'three';
import { figureGeometry, type Detail, type FigurePiece } from './anatomy.ts';
import { FIGURE, REST, applyRig, rigGLSL, sideX, swingCode, type FigureKind } from './pose.ts';
import { palettesOf, type FigurePalettes, type FigureStyle } from './wardrobe.ts';

export * from './pose.ts';
export * from './anatomy.ts';
export * from './wardrobe.ts';

/**
 * Articulated people for every crowd (residents, police, zombies, vehicle occupants, ragdolls) and the hero
 * figures of the player, peers and interior people.
 *
 * A person is five instances of four shared meshes: body (torso, head, face, hair, hats, clothing), left
 * arm, right arm (with held items) and two legs. Elbows, wrists, fingers, knees, ankles, toes, the head,
 * the chest, skirts and ponytails bend in the vertex shader (pose.ts), so a whole crowd is still one draw
 * call per mesh. Each instance carries a packed look (six 24-bit colours and two part masks, wardrobe.ts)
 * and a pose vec4. Never add instanceColor, morph targets or uv to these meshes: they use 12 of the 16
 * guaranteed vertex attribute slots.
 */

// ---- Material -------------------------------------------------------------------------------------------

/** Palette unpacking and part masks (vertex shader). */
const PALETTE_GLSL = /* glsl */`
attribute vec3 tag;
attribute vec4 look0;
attribute vec4 look1;
varying float vFigGloss;
vec3 figColor(float slot) {
  float v = slot < 0.5 ? look0.x : slot < 1.5 ? look0.y : slot < 2.5 ? look0.z : slot < 3.5 ? look0.w : slot < 4.5 ? look1.x : slot < 5.5 ? look1.y : 16777215.0;
  float r = floor(v / 65536.0), g = floor(mod(v, 65536.0) / 256.0), b = mod(v, 256.0);
  vec3 c = vec3(r, g, b) / 255.0;
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
bool figBit(int part) {
  if (part == 0) return true;
  int word = part > 24 ? int(look1.w + 0.5) : int(look1.z + 0.5);
  return ((word >> ((part - 1) % 24)) & 1) == 1;
}
bool figHidden() { int t = int(tag.y + 0.5); return !figBit(t % 64) || !figBit(t / 64); }
`;

/**
 * The shared look of every figure mesh of one kind ('body', 'arm', 'leg' or 'rigid' for umbrellas and
 * props). All materials of a kind compile to one program (pre-warm with renderer.compile).
 */
export function figureMaterial(kind: FigureKind = 'rigid', params: THREE.MeshStandardMaterialParameters = {}) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02, ...params });
  material.userData.figureKind = kind;
  const rigged = kind !== 'rigid';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${rigGLSL(kind)}\n${PALETTE_GLSL}`)
      .replace('#include <color_vertex>', 'vColor = color * figColor(tag.x);\n\tvFigGloss = tag.z;')
      .replace('#include <beginnormal_vertex>', rigged
        ? `#include <beginnormal_vertex>\n\tvec3 figP = position;\n\tfloat figSide = ${kind === 'arm' ? '(rig.z < 0.0 ? -1.0 : 1.0)' : '1.0'};\n\tfigP.x *= figSide;\n\tfigPose(figP);\n\tobjectNormal.x *= figSide; objectNormal = figRig * objectNormal; objectNormal.x *= figSide;`
        : '#include <beginnormal_vertex>')
      .replace('#include <begin_vertex>', rigged
        ? 'vec3 transformed = figRig * figP + figShift;\n\ttransformed.x *= figSide;\n\tif (figHidden()) transformed = vec3(0.0);'
        : 'vec3 transformed = vec3(position);\n\tif (figHidden()) transformed = vec3(0.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFigGloss;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * mix(1.0, 0.45, vFigGloss);');
  };
  material.customProgramCacheKey = () => `figure-${kind}`;
  return material;
}

// ---- Instanced batches ------------------------------------------------------------------------------------

/** Per-instance attributes a figure mesh owns; everything else on its geometry is shared with the cached build. */
const INSTANCED = ['look0', 'look1', 'pose'];

/**
 * A geometry that draws a source build's vertex buffers and index (shared, never copied), so every crowd and
 * hero mesh can hang its own instance attributes on it. Free it with releaseView().
 */
export function shareGeometry(source: THREE.BufferGeometry) {
  const view = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) if (!INSTANCED.includes(name)) view.setAttribute(name, attribute);
  view.setIndex(source.index);
  view.boundingSphere = source.boundingSphere;
  view.boundingBox = source.boundingBox;
  view.userData.sharedGeometry = true;
  return view;
}

/** Frees a view's own buffers (its instance attributes), never the shared ones. */
export function releaseView(view: THREE.BufferGeometry) {
  for (const name of Object.keys(view.attributes)) if (!INSTANCED.includes(name)) view.deleteAttribute(name);
  view.setIndex(null);
  view.dispose();
}

/**
 * An instanced figure mesh with per-instance look (look0/look1) and pose attributes. `push` packs visible
 * instances so hidden ones cost nothing; looks and poses are only re-uploaded when an instance changed, and
 * then only the range of instances that did (matrices: the used range). An empty batch is hidden.
 * The batch draws its own view of the geometry it is given, so any number of batches can share the cached
 * figureGeometry() builds; the instance data follows it across setGeometry() (levels of detail).
 */
export class FigureBatch {
  readonly mesh: THREE.InstancedMesh;
  readonly look0: THREE.InstancedBufferAttribute;
  readonly look1: THREE.InstancedBufferAttribute;
  readonly pose: THREE.InstancedBufferAttribute;
  readonly kind: FigureKind;
  private readonly rest: readonly number[];
  private readonly views = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  private n = 0;
  /** Dirty instance ranges [min, max] of the colours (look0), masks and accents (look1) and poses (min > max: clean). */
  private lookMin = 0; private lookMax: number;
  private maskMin = 0; private maskMax: number;
  private poseMin = 0; private poseMax: number;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, readonly capacity: number, kind?: FigureKind) {
    this.kind = kind ?? (material.userData.figureKind as FigureKind | undefined) ?? 'rigid';
    this.rest = REST[this.kind];
    const attribute = (fill: (i: number, k: number) => number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      for (let i = 0; i < capacity; i++) for (let k = 0; k < 4; k++) a.array[i * 4 + k] = fill(i, k);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.look0 = attribute(() => 16777215);
    this.look1 = attribute((_, k) => (k < 2 ? 16777215 : 0));
    this.pose = attribute((_, k) => this.rest[k]);
    this.mesh = new THREE.InstancedMesh(this.view(geometry), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.lookMax = this.maskMax = this.poseMax = capacity - 1;
  }

  private view(source: THREE.BufferGeometry) {
    let view = this.views.get(source);
    if (!view) {
      view = shareGeometry(source);
      view.setAttribute('look0', this.look0);
      view.setAttribute('look1', this.look1);
      view.setAttribute('pose', this.pose);
      this.views.set(source, view);
    }
    return view;
  }

  /** Switches to another level of detail (each view is built once, so switching back and forth allocates nothing). */
  setGeometry(geometry: THREE.BufferGeometry) {
    this.mesh.geometry = this.view(geometry);
  }

  begin() { this.n = 0; }

  /** Writes one instance: a transform, a packed look from `palette()` and a pose (REST when omitted). */
  set(index: number, transform: THREE.Matrix4, look: ArrayLike<number>, pose?: ArrayLike<number>) {
    this.mesh.setMatrixAt(index, transform);
    this.setLook(index, look);
    this.setPose(index, pose ?? this.rest);
  }

  setLook(index: number, look: ArrayLike<number>) {
    const a = this.look0.array as Float32Array, b = this.look1.array as Float32Array, o = index * 4;
    // A blink, a mouth or a held item only changes the masks (look1): the colours stay put.
    if (a[o] !== look[0] || a[o + 1] !== look[1] || a[o + 2] !== look[2] || a[o + 3] !== look[3]) {
      a[o] = look[0]; a[o + 1] = look[1]; a[o + 2] = look[2]; a[o + 3] = look[3];
      if (index < this.lookMin) this.lookMin = index;
      if (index > this.lookMax) this.lookMax = index;
    }
    if (b[o] !== look[4] || b[o + 1] !== look[5] || b[o + 2] !== look[6] || b[o + 3] !== look[7]) {
      b[o] = look[4]; b[o + 1] = look[5]; b[o + 2] = look[6]; b[o + 3] = look[7];
      if (index < this.maskMin) this.maskMin = index;
      if (index > this.maskMax) this.maskMax = index;
    }
  }

  setPose(index: number, pose: ArrayLike<number>) {
    const p = this.pose.array as Float32Array, o = index * 4;
    // Float32 storage: compare after rounding so an unchanged pose stays clean.
    const x = Math.fround(pose[0]), y = Math.fround(pose[1]), z = Math.fround(pose[2]), w = Math.fround(pose[3]);
    if (p[o] !== x || p[o + 1] !== y || p[o + 2] !== z || p[o + 3] !== w) {
      p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = w;
      if (index < this.poseMin) this.poseMin = index;
      if (index > this.poseMax) this.poseMax = index;
    }
  }

  push(transform: THREE.Matrix4, look: ArrayLike<number>, pose?: ArrayLike<number>) {
    if (this.n < this.capacity) this.set(this.n++, transform, look, pose);
  }

  /** Finishes a frame; `count` overrides the packed count when slots are fixed. */
  end(count = this.n) {
    const was = this.mesh.count;
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    // Ranges add up until the renderer uploads them (it clears them then), so a frame the mesh is not drawn in
    // loses nothing; a long backlog becomes one whole upload.
    const range = (attribute: THREE.BufferAttribute, start: number, length: number) => {
      if (attribute.updateRanges.length > 6) { attribute.clearUpdateRanges(); start = 0; length = attribute.array.length; }
      attribute.addUpdateRange(start, length);
      attribute.needsUpdate = true;
    };
    if (count > 0) range(this.mesh.instanceMatrix, 0, count * 16);
    else if (was === 0) return;
    if (this.lookMin <= this.lookMax) {
      range(this.look0, this.lookMin * 4, (this.lookMax - this.lookMin + 1) * 4);
      this.lookMin = this.capacity; this.lookMax = -1;
    }
    if (this.maskMin <= this.maskMax) {
      range(this.look1, this.maskMin * 4, (this.maskMax - this.maskMin + 1) * 4);
      this.maskMin = this.capacity; this.maskMax = -1;
    }
    if (this.poseMin <= this.poseMax) {
      range(this.pose, this.poseMin * 4, (this.poseMax - this.poseMin + 1) * 4);
      this.poseMin = this.capacity; this.poseMax = -1;
    }
  }

  /** Marks looks and poses for upload after writing their arrays directly. */
  touch() { this.lookMin = this.maskMin = this.poseMin = 0; this.lookMax = this.maskMax = this.poseMax = this.capacity - 1; }

  /** Frees the batch's views and instance buffers; a source geometry is freed too unless it is a shared build. */
  dispose() {
    for (const [source, view] of this.views) {
      releaseView(view);
      if (!source.userData.sharedGeometry) source.dispose();
    }
    this.views.clear();
    this.mesh.dispose();
  }
}

// ---- Seated poses -------------------------------------------------------------------------------------------

/**
 * How a rider sits a scooter, in moto-local metres (the model is real-world size: seat top 0.82 m, floorboard
 * 0.65 m, handlebar 1.12 m high at z 0.52, grips about 0.36 m out): figure scale, forward lean, and the grip,
 * foot, knee and elbow directions. vehicles.ts SEATS and game.ts seatOn build their IK targets on these.
 */
export type RiderPose = {
  scale: number; hipY: number; hipZ: number; lean: number;
  grip: number[]; foot: number[];
  /** Which way knees and elbows bend (x is mirrored per side). */
  knee: number[]; elbow: number[];
};
export const RIDER: RiderPose = {
  scale: 0.82, hipY: 0.9, hipZ: -0.22, lean: 0.34,
  grip: [0.36, 1.13, 0.5],
  foot: [0.2, 0.655, 0.2],
  knee: [0.9, 0.55, 0.25],
  elbow: [0.9, -0.45, -0.2],
};
/**
 * A car driver relative to their hip (the seat position is added by the caller): leaning back a little,
 * hands on the wheel, feet on the pedals. Hip .5 m + 1.04 u x .8 = 1.33 m stays under a 1.44 m roof.
 */
export const CAR_DRIVER: RiderPose = {
  scale: 0.8, hipY: 0, hipZ: 0, lean: -0.12,
  grip: [0.17, 0.4, 0.3],
  foot: [0.14, -0.36, 0.26],
  knee: [0.3, 0.7, 0.6],
  elbow: [0.9, -0.45, -0.2],
};

// ---- Hero figures (player, peers, interior people) ----------------------------------------------------------

const PIECE_KIND: Record<FigurePiece, FigureKind> = { body: 'body', armL: 'arm', armR: 'arm', leg: 'leg' };

/** One instance of a shared hero geometry: the attributes are the cache's, only look/pose are its own. */
function heroMesh(piece: FigurePiece, detail: Detail, material: THREE.Material) {
  const g = shareGeometry(figureGeometry(piece, detail));
  const own = (values: readonly number[]) => new THREE.InstancedBufferAttribute(new Float32Array(values), 4);
  g.setAttribute('look0', own([16777215, 16777215, 16777215, 16777215]));
  g.setAttribute('look1', own([16777215, 16777215, 0, 0]));
  g.setAttribute('pose', own(REST[PIECE_KIND[piece]]));
  const mesh = new THREE.InstancedMesh(g, material, 1);
  // Culled like any mesh (a shopkeeper down the street costs nothing), against the rest pose's sphere grown to
  // hold every bend the shader can give it.
  const rest = figureGeometry(piece, detail).boundingSphere;
  if (rest) mesh.boundingSphere = new THREE.Sphere(rest.center.clone(), rest.radius * 1.3 + 0.1);
  else mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.userData.sharedGeometry = true;
  return mesh;
}

export type HeroFigure = ReturnType<typeof createHeroFigure>;

/**
 * A single detailed person built from the shared hero geometry, with a joint hierarchy to animate:
 * group > body (hip) > chest (waist twist) > head (yaw 'YXZ' pitch) and armLeft/armRight (shoulders,
 * 'XZY': swing, abduct, roll) > elbowLeft/Right (x) > handLeft/Right (wrist, 'YZX': twist then flex);
 * group > limbLeft/limbRight (hips) > kneeLeft/Right > ankleLeft/Right. Units are FIGURE units (scale the
 * group). Set rotations, `grip` hand codes, `toe`, `secondary` and `hair`, then call sync() once per frame.
 * The right side hangs at -x (people face +z). Hand rotations are mirrored: handLeft.rotation.y = -twist,
 * .z = -flex; handRight (the mirrored build) uses +twist, +flex.
 */
export function createHeroFigure(style: FigureStyle, opts: { detail?: Detail } = {}) {
  let detail = opts.detail ?? 'hero';
  const materials = { body: figureMaterial('body'), arm: figureMaterial('arm'), leg: figureMaterial('leg') };
  const group = new THREE.Group();
  const body = new THREE.Group(), chest = new THREE.Group(), head = new THREE.Group(), pack = new THREE.Group();
  body.position.set(0, FIGURE.hipY, 0);
  chest.position.set(0, FIGURE.waistY - FIGURE.hipY, 0);
  head.position.set(0, FIGURE.headPivotY - FIGURE.waistY, 0);
  head.rotation.order = 'YXZ';
  pack.position.set(0, FIGURE.shoulderY + 0.1 - FIGURE.waistY, -0.16);
  group.add(body);
  body.add(chest);
  chest.add(head, pack);
  const arm = (side: 1 | -1) => {
    const shoulder = new THREE.Group(), elbow = new THREE.Group(), hand = new THREE.Group();
    shoulder.position.set(sideX(side) * style.shoulderX, FIGURE.shoulderY - FIGURE.waistY, 0);
    shoulder.rotation.order = 'XZY';
    elbow.position.set(0, -FIGURE.upperArm, 0);
    hand.position.set(0, -FIGURE.foreArm, 0);
    hand.rotation.order = 'YZX';
    shoulder.add(elbow);
    elbow.add(hand);
    chest.add(shoulder);
    return { shoulder, elbow, hand };
  };
  const leg = (side: 1 | -1) => {
    const hip = new THREE.Group(), knee = new THREE.Group(), ankle = new THREE.Group();
    hip.position.set(sideX(side) * FIGURE.hipX, FIGURE.hipY, 0);
    knee.position.set(0, -FIGURE.thigh, 0);
    ankle.position.set(0, -FIGURE.shin, 0);
    hip.add(knee);
    knee.add(ankle);
    group.add(hip);
    return { hip, knee, ankle };
  };
  const L = arm(-1), Rt = arm(1), LL = leg(-1), RL = leg(1);
  const meshes = { body: heroMesh('body', detail, materials.body), armL: heroMesh('armL', detail, materials.arm), armR: heroMesh('armR', detail, materials.arm), legL: heroMesh('leg', detail, materials.leg), legR: heroMesh('leg', detail, materials.leg) };
  meshes.body.position.y = -FIGURE.hipY;
  const mount = () => {
    body.add(meshes.body); L.shoulder.add(meshes.armL); Rt.shoulder.add(meshes.armR); LL.hip.add(meshes.legL); RL.hip.add(meshes.legR);
  };
  mount();
  let looks: FigurePalettes = palettesOf(style);
  const writeLook = (mesh: THREE.InstancedMesh, look: Float32Array) => {
    const a = mesh.geometry.getAttribute('look0') as THREE.InstancedBufferAttribute, b = mesh.geometry.getAttribute('look1') as THREE.InstancedBufferAttribute;
    const A = a.array as Float32Array, B = b.array as Float32Array;
    if (A[0] !== look[0] || A[1] !== look[1] || A[2] !== look[2] || A[3] !== look[3] || B[0] !== look[4] || B[1] !== look[5] || B[2] !== look[6] || B[3] !== look[7]) {
      A.set(look.subarray(0, 4)); B.set(look.subarray(4, 8));
      a.needsUpdate = true; b.needsUpdate = true;
    }
  };
  const writePose = (mesh: THREE.InstancedMesh, x: number, y: number, z: number, w: number) => {
    const p = mesh.geometry.getAttribute('pose') as THREE.InstancedBufferAttribute, P = p.array as Float32Array;
    const fx = Math.fround(x), fy = Math.fround(y), fz = Math.fround(z), fw = Math.fround(w);
    if (P[0] !== fx || P[1] !== fy || P[2] !== fz || P[3] !== fw) { P[0] = fx; P[1] = fy; P[2] = fz; P[3] = fw; p.needsUpdate = true; }
  };
  const hero = {
    group, body, chest, head, pack,
    limbLeft: LL.hip, limbRight: RL.hip, kneeLeft: LL.knee, kneeRight: RL.knee, ankleLeft: LL.ankle, ankleRight: RL.ankle,
    armLeft: L.shoulder, armRight: Rt.shoulder, elbowLeft: L.elbow, elbowRight: Rt.elbow, handLeft: L.hand, handRight: Rt.hand,
    /** Hand codes (HAND.*) of each hand. */
    grip: { left: REST.arm[3] as number, right: REST.arm[3] as number },
    /** Toe bend at the ball of each foot (+ = toes up). */
    toe: { left: 0, right: 0 },
    /** Skirt / áo dài tà / apron swing angle (+ flares the front forward). */
    secondary: 0,
    /** Ponytail / long hair swing angle (+ lifts it backward). */
    hair: 0,
    style,
    /** The packed looks; edit masks with setBits() and call sync(). */
    get looks() { return looks; },
    meshes,
    /** Copies joint rotations, hand codes and looks into the shader attributes. */
    sync() {
      writePose(meshes.body, head.rotation.y, head.rotation.x, chest.rotation.y, swingCode(hero.secondary, hero.hair));
      writePose(meshes.armL, L.elbow.rotation.x, -L.hand.rotation.y, -L.hand.rotation.z, hero.grip.left);
      writePose(meshes.armR, Rt.elbow.rotation.x, Rt.hand.rotation.y, Rt.hand.rotation.z, hero.grip.right);
      writePose(meshes.legL, LL.knee.rotation.x, LL.ankle.rotation.x, hero.toe.left, 0);
      writePose(meshes.legR, RL.knee.rotation.x, RL.ankle.rotation.x, hero.toe.right, 0);
      writeLook(meshes.body, looks.body); writeLook(meshes.armL, looks.armL); writeLook(meshes.armR, looks.armR);
      writeLook(meshes.legL, looks.legs); writeLook(meshes.legR, looks.legs);
    },
    /** Dresses the figure anew (keeps joints). */
    restyle(next: FigureStyle) {
      hero.style = next;
      looks = palettesOf(next);
      L.shoulder.position.x = sideX(-1) * next.shoulderX; Rt.shoulder.position.x = sideX(1) * next.shoulderX;
      hero.sync();
    },
    setDetail(next: Detail) {
      if (next === detail) return;
      detail = next;
      for (const [key, mesh] of Object.entries(meshes) as [keyof typeof meshes, THREE.InstancedMesh][]) {
        const piece: FigurePiece = key === 'legL' || key === 'legR' ? 'leg' : key;
        const fresh = heroMesh(piece, detail, mesh.material as THREE.Material);
        for (const name of ['look0', 'look1', 'pose']) fresh.geometry.setAttribute(name, mesh.geometry.getAttribute(name));
        fresh.position.copy(mesh.position);
        mesh.parent?.remove(mesh);
        // The look and pose buffers moved to the fresh mesh: free only the old view itself.
        for (const name of ['look0', 'look1', 'pose']) mesh.geometry.deleteAttribute(name);
        releaseView(mesh.geometry);
        mesh.dispose();
        meshes[key] = fresh;
      }
      mount();
    },
    /** Frees this figure's own buffers and materials (never the shared geometry attributes). */
    dispose() {
      for (const mesh of Object.values(meshes)) { releaseView(mesh.geometry); mesh.dispose(); }
      for (const m of Object.values(materials)) m.dispose();
    },
  };
  hero.sync();
  return hero;
}

// ---- Baked figures -------------------------------------------------------------------------------------------

export type BakePart = { piece: FigurePiece; detail?: Detail; matrix: THREE.Matrix4; look: ArrayLike<number>; pose?: ArrayLike<number> };

/**
 * Bakes posed pieces into one plain vertex-coloured geometry (for a MeshStandardMaterial with
 * vertexColors): hidden parts are dropped, the rig and palette are applied on the CPU. For static people
 * such as boat rowers.
 */
export function bakeFigure(parts: BakePart[]) {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), color = new THREE.Color();
  for (const part of parts) {
    const g = figureGeometry(part.piece, part.detail ?? 'lo');
    const kind = PIECE_KIND[part.piece];
    const pose = part.pose ?? REST[kind];
    const P = g.getAttribute('position'), C = g.getAttribute('color'), T = g.getAttribute('tag'), Rg = g.getAttribute('rig');
    const look = part.look;
    const bit = (index: number) => {
      if (index === 0) return true;
      const word = index > 24 ? look[7] : look[6];
      return ((word >> ((index - 1) % 24)) & 1) === 1;
    };
    const slotColor = (slot: number) => {
      if (slot > 5.5) return color.setRGB(1, 1, 1);
      const v = look[Math.round(slot)];
      return color.setRGB(Math.floor(v / 65536) / 255, Math.floor((v % 65536) / 256) / 255, (v % 256) / 255, THREE.SRGBColorSpace);
    };
    const map = new Int32Array(P.count).fill(-1);
    const rig = [0, 0, 0, 0];
    for (let i = 0; i < P.count; i++) {
      const t = Math.round(T.getY(i));
      if (!bit(t % 64) || !bit(Math.floor(t / 64))) continue;
      rig[0] = Rg.getX(i); rig[1] = Rg.getY(i); rig[2] = Rg.getZ(i); rig[3] = Rg.getW(i);
      applyRig(kind, rig, pose, p.set(P.getX(i), P.getY(i), P.getZ(i)), p).applyMatrix4(part.matrix);
      map[i] = pos.length / 3;
      pos.push(p.x, p.y, p.z);
      const c = slotColor(T.getX(i));
      col.push(c.r * C.getX(i), c.g * C.getY(i), c.b * C.getZ(i));
    }
    const index = g.index!.array;
    for (let i = 0; i < index.length; i += 3) {
      const a = map[index[i]], b = map[index[i + 1]], c = map[index[i + 2]];
      if (a >= 0 && b >= 0 && c >= 0) idx.push(a, b, c);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}
