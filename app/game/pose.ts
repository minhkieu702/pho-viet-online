import * as THREE from 'three';

/**
 * The skeleton every person shares and the in-shader rig that bends it.
 *
 * Each limb is ONE instance of an instanced mesh. Joints below the limb's root (elbow, forearm twist,
 * wrist, fingers, knee, ankle, toes, head, chest, skirts and ponytails) are bent in the vertex shader:
 * every vertex carries a `rig` vec4 (joint weights, finger id, phalanx level) and every instance a
 * `pose` vec4 (joint angles and a packed hand code). The shader applies rest-space rotations from the
 * most distal joint to the most proximal, which is exactly forward kinematics; vertices near a hinge
 * turn by angle x weight, so elbows and knees bend as one continuous skin.
 *
 * The GLSL below is generated from the same TS tables as the CPU mirror `figurePose`, so props held in a
 * hand (umbrellas, guns) and IK-posed riders land exactly where the GPU draws the fingers.
 */

/**
 * Skeleton in crowd model units (u): feet at y = 0, facing +z. A person facing +z has their RIGHT at -x, so code
 * side +1 ('R', the hand that holds things) is at -x and side -1 ('L') at +x: see sideX(). 1 u = 0.82 m at BODY_SCALE.
 */
export const FIGURE = {
  hipX: 0.1, hipY: 1.04, thigh: 0.45, shin: 0.51, ankleY: 0.08, /** hip joint to sole */ sole: 1.04, /** ankle to ball of foot along +z */ ball: 0.17,
  /** chest-twist pivot */ waistY: 1.22, /** skirt / áo dài tà pivot */ panelY: 1.14, shoulderX: 0.2, /** narrower female shoulders */ shoulderXF: 0.182, shoulderY: 1.64,
  upperArm: 0.33, foreArm: 0.3, hand: 0.21,
  neckY: 1.75, headPivotY: 1.81, headY: 1.935, headR: 0.135, /** hip joint above the seat it sits on */ seatClear: 0.085,
} as const;
/** World scale of the crowd model: a 1.71 m adult. */
export const BODY_SCALE = 0.82;

/** The x sign of a side: people face +z, so their right (code side +1) is at -x and their left (-1) at +x. */
export const sideX = (side: number) => -side;

const UA = FIGURE.upperArm, FA = FIGURE.foreArm, WRIST = -(UA + FA);
const TH = FIGURE.thigh, ANKLE = -(FIGURE.thigh + FIGURE.shin);
/** Joint positions in limb space (limbs hang along -y from their root). */
export const JOINT = { elbow: -UA, wrist: WRIST, knee: -TH, ankle: ANKLE, toe: [0, -FIGURE.sole + 0.02, FIGURE.ball] as const } as const;
/** Pivot of ponytails and long hair (body space): the tie at the back of the head. */
export const HAIR_PIVOT = [0, FIGURE.headY + 0.15 * FIGURE.headR, -0.92 * FIGURE.headR] as const;
/**
 * Skirts, áo dài tà and aprons (secondary group 1) turn about a line at panelY in the plane of their own panel
 * (pivotZ in front, -pivotZ behind). Laid forward past the lap (seated, or a raised knee on a body lying down)
 * the cloth folds back down where it passes the knee: foldFront below the pivot for the front, foldBack for a
 * back panel tucked under the thighs.
 */
export const CLOTH = { pivotZ: 0.12, foldFront: 0.36, foldBack: 0.62 } as const;

// ---- Hand layout (the unmirrored build: a left hand at +x, wrist at the origin, palm facing -x, thumb toward +z) ----

/** Fingers index..little: [z, knuckle (MCP) y below the wrist, length, radius, splay]. Phalanges split PHALANX. */
export const FINGERS: readonly (readonly [number, number, number, number, number])[] = [
  [0.034, -0.1, 0.085, 0.0105, -0.12],
  [0.011, -0.104, 0.097, 0.011, -0.03],
  [-0.012, -0.1, 0.09, 0.0105, 0.05],
  [-0.033, -0.092, 0.07, 0.0092, 0.14],
];
export const PHALANX = [0.45, 0.3, 0.25] as const;
/** Full-curl angles of the MCP, PIP and DIP joints (a tight fist). */
export const FINGER_BEND = [1.6, 1.9, 1.2] as const;
/** Finger joint pivots sit this far toward the palm from the finger's axis. */
export const FINGER_X = -0.002;
const thumbDir = new THREE.Vector3(-0.35, -0.85, 0.38).normalize();
/** Thumb: base (thenar), direction (lying along the index when relaxed), segment lengths, radius, full-curl angles CMC/MCP/IP. */
export const THUMB = {
  base: [-0.012, -0.022, 0.03] as const,
  dir: [thumbDir.x, thumbDir.y, thumbDir.z] as const,
  seg: [0.045, 0.037, 0.032] as const,
  r: 0.0125,
  bend: [0.9, 0.8, 1.0] as const,
  /** The open hand (thumb code 0) swings the thumb this far (x bend) away from the palm; 0.25 lies along the index. */
  spread: 0.3,
};
const thumbAxis = new THREE.Vector3().crossVectors(thumbDir, new THREE.Vector3(-1, 0, 0)).normalize();
export const THUMB_AXIS = [thumbAxis.x, thumbAxis.y, thumbAxis.z] as const;

/**
 * Where held things sit, in the unmirrored hand's space relative to the wrist (right hands mirror x, socket()):
 * GRIP is the channel of a closed fist (a rod through it runs along +z, out past the thumb), PALM the
 * middle of the palm (normal -x), PINCH between thumb and index tips.
 */
export const HAND_SOCKET = {
  GRIP: [-0.022, -0.078, 0.008] as const,
  PALM: [-0.03, -0.065, 0] as const,
  PINCH: [-0.018, -0.15, 0.03] as const,
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Packs a hand shape (0 open .. 1 closed) into pose.w: middle/ring/little curl, index curl, thumb curl. */
export function handCode(curl: number, index = curl, thumb = curl) {
  return Math.round(clamp01(curl) * 63) + 64 * Math.round(clamp01(index) * 63) + 4096 * Math.round(clamp01(thumb) * 63);
}
/** The three curls of a hand code, 0..1. */
export function handCurls(code: number): [number, number, number] {
  const c = Math.max(0, Math.round(code));
  return [(c % 64) / 63, (Math.floor(c / 64) % 64) / 63, Math.floor(c / 4096) / 63];
}
/** Blends two hand codes component-wise (t = 0 gives a, 1 gives b). */
export function mixHand(a: number, b: number, t: number) {
  const A = Math.max(0, Math.round(a)), B = Math.max(0, Math.round(b));
  const ca = (A % 64) / 63, ia = (Math.floor(A / 64) % 64) / 63, ta = Math.floor(A / 4096) / 63;
  const cb = (B % 64) / 63, ib = (Math.floor(B / 64) % 64) / 63, tb = Math.floor(B / 4096) / 63;
  return handCode(ca + (cb - ca) * t, ia + (ib - ia) * t, ta + (tb - ta) * t);
}
/** Named hand shapes. Spread is automatic: open fingers splay, curled fingers close together. */
export const HAND = {
  RELAXED: handCode(0.3, 0.25, 0.2),
  OPEN: handCode(0, 0, 0),
  FIST: handCode(1, 1, 1),
  GRIP: handCode(0.85, 0.85, 0.7),
  TRIGGER: handCode(0.9, 0.35, 0.75),
  PHONE: handCode(0.65, 0.6, 0.35),
  POINT: handCode(1, 0, 0.8),
  CLAW: handCode(0.55, 0.55, 0.3),
  CUP: handCode(0.6, 0.55, 0.5),
} as const;

/** Resolution of the secondary swings: +-2 rad in 127 steps (0.9 degrees). */
const SWING_STEP = 2 / 127;
/**
 * The body's secondary swings share its pose.w: the front and the back of skirts, áo dài tà and aprons (group 1;
 * + turns the front forward and the back backward) and ponytails or long hair (group 2), so a seated áo dài lays
 * its front tà on the lap while the back one is tucked under and the ponytail hangs. Each angle is clamped to +-2 rad in SWING_STEP steps: front + 256 back + 65536 hair is an
 * integer below 2^23, exact in a float. `hair` and `back` default to `skirt`.
 */
export function swingCode(skirt: number, hair = skirt, back = skirt) {
  const q = (a: number) => Math.round((a < -2 ? -2 : a > 2 ? 2 : a) / SWING_STEP);
  return q(skirt) + 256 * q(back) + 65536 * q(hair);
}
/** The [front, hair, back] angles of a swing code. */
export function swingAngles(code: number): [number, number, number] {
  const hair = Math.round(code / 65536), rest = code - 65536 * hair, back = Math.round(rest / 256);
  return [(rest - 256 * back) * SWING_STEP, hair * SWING_STEP, back * SWING_STEP];
}

/** Rest poses: arms relaxed, every joint straight. */
export const REST = {
  body: [0, 0, 0, 0] as const,
  arm: [0, 0, 0, HAND.RELAXED] as const,
  leg: [0, 0, 0, 0] as const,
  rigid: [0, 0, 0, 0] as const,
};

/** Material kinds of figure meshes; each is one shader program shared by every system. */
export type FigureKind = 'body' | 'arm' | 'leg' | 'rigid';

// ---- GLSL, generated from the tables above ------------------------------------------------------------

const f = (x: number) => { const s = (Math.abs(x) < 1e-12 ? 0 : x).toFixed(6); return s.includes('.') ? s : `${s}.0`; };
const v3 = (p: readonly number[]) => `vec3(${f(p[0])}, ${f(p[1])}, ${f(p[2])})`;
const thumbBase = [THUMB.base[0], THUMB.base[1] + WRIST, THUMB.base[2]];
const along = (k: number) => thumbBase.map((b, i) => b + THUMB.dir[i] * k);

/**
 * Vertex-shader source for one figure kind: attribute declarations plus `figPose(p0)`, which leaves the
 * rest-space rotation in `figRig` and the translation in `figShift`. Inject after `#include <common>`.
 */
export function rigGLSL(kind: FigureKind) {
  const head = /* glsl */`
attribute vec4 rig;
attribute vec4 pose;
mat3 figRig; vec3 figShift;
mat3 figAxis(vec3 a, float t) { float c = cos(t), s = sin(t), k = 1.0 - c;
  return mat3(c + a.x*a.x*k, a.y*a.x*k + a.z*s, a.z*a.x*k - a.y*s,  a.x*a.y*k - a.z*s, c + a.y*a.y*k, a.z*a.y*k + a.x*s,  a.x*a.z*k + a.y*s, a.y*a.z*k - a.x*s, c + a.z*a.z*k); }
void figTurn(vec3 axis, float angle, vec3 pivot) { if (angle == 0.0) return; mat3 r = figAxis(axis, angle); figRig = r * figRig; figShift = r * (figShift - pivot) + pivot; }
// The same without the shortcut for a zero angle: the D3D shader compiler (ANGLE on Windows) miscompiles the cloth's
// two turns about pivots that depend on the vertex when the early return is there (the panels flew off sideways).
void figTurnAlways(vec3 axis, float angle, vec3 pivot) { mat3 r = figAxis(axis, angle); figRig = r * figRig; figShift = r * (figShift - pivot) + pivot; }
`;
  if (kind === 'rigid') return '';
  if (kind === 'body') return head + /* glsl */`
void figPose(vec3 p0) {
  figRig = mat3(1.0); figShift = vec3(0.0);
  float chest = rig.y;
  if (rig.w > 0.5) {
    // pose.w = front + 256 back + 65536 hair, in SWING_STEP steps (swingCode).
    float hair = floor(pose.w / 65536.0 + 0.5), rest = pose.w - 65536.0 * hair, back = floor(rest / 256.0 + 0.5);
    if (rig.w < 1.5) {
      // Cloth: rig.y is the side (+1 front .. -1 back), rig.z the weight down the panel. Sides take the mean of the
      // front and back turns; laid forward over the lap the panel turns as a whole and folds down at the knee.
      float front = -(rest - 256.0 * back) * ${f(SWING_STEP)}, behind = back * ${f(SWING_STEP)}, s = rig.y;
      float a = mix(0.5 * (front + behind), s >= 0.0 ? front : behind, abs(s));
      // (smoothstep edges must ascend in GLSL: falling steps are written 1 - smoothstep.)
      float w = mix(rig.z, 1.0 - smoothstep(${f(FIGURE.panelY - 0.08)}, ${f(FIGURE.panelY)}, p0.y), smoothstep(0.9, 1.2, abs(a)));
      float knee = ${f(FIGURE.panelY)} - mix(${f(CLOTH.foldBack)}, ${f(CLOTH.foldFront)}, 0.5 + 0.5 * s);
      float fold = -a * 0.85 * smoothstep(1.0, 1.25, -a) * (1.0 - smoothstep(knee - 0.025, knee + 0.025, p0.y));
      figTurnAlways(vec3(1.0, 0.0, 0.0), fold, vec3(0.0, knee, ${f(CLOTH.pivotZ)} * s));
      figTurnAlways(vec3(1.0, 0.0, 0.0), a * w, vec3(0.0, ${f(FIGURE.panelY)}, ${f(CLOTH.pivotZ)} * s));
      chest = 0.0;
    } else figTurn(vec3(1.0, 0.0, 0.0), hair * ${f(SWING_STEP)} * rig.z, ${v3(HAIR_PIVOT)});
  }
  figTurn(vec3(1.0, 0.0, 0.0), pose.y * rig.x, vec3(0.0, ${f(FIGURE.headPivotY)}, 0.0));
  figTurn(vec3(0.0, 1.0, 0.0), pose.x * rig.x, vec3(0.0, ${f(FIGURE.headPivotY)}, 0.0));
  figTurn(vec3(0.0, 1.0, 0.0), pose.z * chest, vec3(0.0, ${f(FIGURE.waistY)}, 0.0));
}
`;
  if (kind === 'leg') return head + /* glsl */`
void figPose(vec3 p0) {
  figRig = mat3(1.0); figShift = vec3(0.0);
  figTurn(vec3(1.0, 0.0, 0.0), -pose.z * rig.z, ${v3(JOINT.toe)});
  figTurn(vec3(1.0, 0.0, 0.0), pose.y * rig.y, vec3(0.0, ${f(ANKLE)}, 0.0));
  figTurn(vec3(1.0, 0.0, 0.0), pose.x * rig.x, vec3(0.0, ${f(-TH)}, 0.0));
}
`;
  const fingers = FINGERS.map(([z, mcp, len, , splay]) => `vec4(${f(z)}, ${f(mcp + WRIST)}, ${f(len)}, ${f(splay)})`).join(', ');
  return head + /* glsl */`
const vec4 FIG_FINGER[4] = vec4[4](${fingers});
void figPose(vec3 p0) {
  figRig = mat3(1.0); figShift = vec3(0.0);
  float code = floor(pose.w + 0.5);
  float curl = mod(code, 64.0) / 63.0;
  float indexCurl = mod(floor(code / 64.0), 64.0) / 63.0;
  float thumb = floor(code / 4096.0) / 63.0;
  int finger = int(abs(rig.z) + 0.5) - 1;
  float level = rig.w;
  if (finger >= 2) {
    vec4 F = FIG_FINGER[finger - 2];
    float c = finger == 2 ? indexCurl : curl;
    float pip = F.y - F.z * ${f(PHALANX[0])};
    float dip = pip - F.z * ${f(PHALANX[1])};
    figTurn(vec3(0.0, 0.0, -1.0), c * ${f(FINGER_BEND[2])} * clamp(level - 2.0, 0.0, 1.0), vec3(${f(FINGER_X)}, dip, F.x));
    figTurn(vec3(0.0, 0.0, -1.0), c * ${f(FINGER_BEND[1])} * clamp(level - 1.0, 0.0, 1.0), vec3(${f(FINGER_X)}, pip, F.x));
    figTurn(vec3(0.0, 0.0, -1.0), c * ${f(FINGER_BEND[0])} * clamp(level, 0.0, 1.0), vec3(${f(FINGER_X)}, F.y, F.x));
    figTurn(vec3(1.0, 0.0, 0.0), F.w * (1.0 - c) * clamp(level, 0.0, 1.0), vec3(${f(FINGER_X)}, F.y, F.x));
  } else if (finger == 1) {
    vec3 axis = ${v3(THUMB_AXIS)};
    figTurn(axis, thumb * ${f(THUMB.bend[2])} * clamp(level - 2.0, 0.0, 1.0), ${v3(along(THUMB.seg[0] + THUMB.seg[1]))});
    figTurn(axis, thumb * ${f(THUMB.bend[1])} * clamp(level - 1.0, 0.0, 1.0), ${v3(along(THUMB.seg[0]))});
    figTurn(axis, (thumb * ${f(1 + THUMB.spread)} - ${f(THUMB.spread)}) * ${f(THUMB.bend[0])} * clamp(level, 0.0, 1.0), ${v3(thumbBase)});
  }
  figTurn(vec3(0.0, 0.0, -1.0), pose.z * rig.y, vec3(0.0, ${f(WRIST)}, 0.0));
  float twist = max(clamp((${f(-UA)} - p0.y) / ${f(FA)}, 0.0, 1.0), rig.y) * rig.x;
  figTurn(vec3(0.0, -1.0, 0.0), pose.y * twist, vec3(0.0));
  figTurn(vec3(1.0, 0.0, 0.0), pose.x * rig.x, vec3(0.0, ${f(-UA)}, 0.0));
}
`;
}

// ---- CPU mirror -----------------------------------------------------------------------------------------

/** A 3x3 matrix (column-major, like GLSL) and a translation: p' = M p + S. */
export type RigTransform = { m: Float64Array; s: Float64Array };
export const rigTransform = (): RigTransform => ({ m: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), s: new Float64Array(3) });

function turn(t: RigTransform, ax: number, ay: number, az: number, angle: number, px: number, py: number, pz: number) {
  if (angle === 0) return;
  const c = Math.cos(angle), s = Math.sin(angle), k = 1 - c;
  const r00 = c + ax * ax * k, r10 = ay * ax * k + az * s, r20 = az * ax * k - ay * s;
  const r01 = ax * ay * k - az * s, r11 = c + ay * ay * k, r21 = az * ay * k + ax * s;
  const r02 = ax * az * k + ay * s, r12 = ay * az * k - ax * s, r22 = c + az * az * k;
  const M = t.m, S = t.s;
  for (let col = 0; col < 9; col += 3) {
    const m0 = M[col], m1 = M[col + 1], m2 = M[col + 2];
    M[col] = r00 * m0 + r01 * m1 + r02 * m2;
    M[col + 1] = r10 * m0 + r11 * m1 + r12 * m2;
    M[col + 2] = r20 * m0 + r21 * m1 + r22 * m2;
  }
  const sx = S[0] - px, sy = S[1] - py, sz = S[2] - pz;
  S[0] = r00 * sx + r01 * sy + r02 * sz + px;
  S[1] = r10 * sx + r11 * sy + r12 * sz + py;
  S[2] = r20 * sx + r21 * sy + r22 * sz + pz;
}
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
/** GLSL smoothstep (edges may be reversed). */
const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/**
 * CPU mirror of the shader's `figPose`: the rest-space rotation and shift for a vertex with `rig` at rest
 * position `p0` (already un-mirrored for left arms), under an instance `pose`.
 */
export function figurePose(kind: FigureKind, rig: ArrayLike<number>, pose: ArrayLike<number>, p0: ArrayLike<number>, out: RigTransform = rigTransform()) {
  out.m.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  out.s.fill(0);
  if (kind === 'rigid') return out;
  if (kind === 'body') {
    let chest = rig[1];
    if (rig[3] > 0.5) {
      const [front, hair, back] = swingAngles(pose[3]);
      if (rig[3] < 1.5) {
        const s = rig[1], F = -front, B = back;
        const a = 0.5 * (F + B) + ((s >= 0 ? F : B) - 0.5 * (F + B)) * Math.abs(s);
        const laid = smoothstep(0.9, 1.2, Math.abs(a)), w = rig[2] + (smoothstep(FIGURE.panelY, FIGURE.panelY - 0.08, p0[1]) - rig[2]) * laid;
        const knee = FIGURE.panelY - (CLOTH.foldBack + (CLOTH.foldFront - CLOTH.foldBack) * (0.5 + 0.5 * s));
        const fold = -a * 0.85 * smoothstep(1.0, 1.25, -a) * smoothstep(knee + 0.025, knee - 0.025, p0[1]);
        turn(out, 1, 0, 0, fold, 0, knee, CLOTH.pivotZ * s);
        turn(out, 1, 0, 0, a * w, 0, FIGURE.panelY, CLOTH.pivotZ * s);
        chest = 0;
      } else turn(out, 1, 0, 0, hair * rig[2], HAIR_PIVOT[0], HAIR_PIVOT[1], HAIR_PIVOT[2]);
    }
    turn(out, 1, 0, 0, pose[1] * rig[0], 0, FIGURE.headPivotY, 0);
    turn(out, 0, 1, 0, pose[0] * rig[0], 0, FIGURE.headPivotY, 0);
    turn(out, 0, 1, 0, pose[2] * chest, 0, FIGURE.waistY, 0);
    return out;
  }
  if (kind === 'leg') {
    turn(out, 1, 0, 0, -pose[2] * rig[2], JOINT.toe[0], JOINT.toe[1], JOINT.toe[2]);
    turn(out, 1, 0, 0, pose[1] * rig[1], 0, ANKLE, 0);
    turn(out, 1, 0, 0, pose[0] * rig[0], 0, -TH, 0);
    return out;
  }
  const [curl, indexCurl, thumb] = handCurls(Math.floor(pose[3] + 0.5));
  const finger = Math.floor(Math.abs(rig[2]) + 0.5) - 1;
  const level = rig[3];
  if (finger >= 2) {
    const [z, mcp0, len, , splay] = FINGERS[finger - 2];
    const mcp = mcp0 + WRIST;
    const c = finger === 2 ? indexCurl : curl;
    const pip = mcp - len * PHALANX[0], dip = pip - len * PHALANX[1];
    turn(out, 0, 0, -1, c * FINGER_BEND[2] * clamp(level - 2, 0, 1), FINGER_X, dip, z);
    turn(out, 0, 0, -1, c * FINGER_BEND[1] * clamp(level - 1, 0, 1), FINGER_X, pip, z);
    turn(out, 0, 0, -1, c * FINGER_BEND[0] * clamp(level, 0, 1), FINGER_X, mcp, z);
    turn(out, 1, 0, 0, splay * (1 - c) * clamp(level, 0, 1), FINGER_X, mcp, z);
  } else if (finger === 1) {
    const [ax, ay, az] = THUMB_AXIS;
    const ip = along(THUMB.seg[0] + THUMB.seg[1]), mp = along(THUMB.seg[0]);
    turn(out, ax, ay, az, thumb * THUMB.bend[2] * clamp(level - 2, 0, 1), ip[0], ip[1], ip[2]);
    turn(out, ax, ay, az, thumb * THUMB.bend[1] * clamp(level - 1, 0, 1), mp[0], mp[1], mp[2]);
    turn(out, ax, ay, az, (thumb * (1 + THUMB.spread) - THUMB.spread) * THUMB.bend[0] * clamp(level, 0, 1), thumbBase[0], thumbBase[1], thumbBase[2]);
  }
  turn(out, 0, 0, -1, pose[2] * rig[1], 0, WRIST, 0);
  const twist = Math.max(clamp((-UA - p0[1]) / FA, 0, 1), rig[1]) * rig[0];
  turn(out, 0, -1, 0, pose[1] * twist, 0, 0, 0);
  turn(out, 1, 0, 0, pose[0] * rig[0], 0, -UA, 0);
  return out;
}

const scratchRig = rigTransform();
/** Where a rest-space vertex ends up under a pose, exactly as the shader places it (left arms mirrored by rig.z). */
export function applyRig(kind: FigureKind, rig: ArrayLike<number>, pose: ArrayLike<number>, p: THREE.Vector3, out = new THREE.Vector3()) {
  const side = kind === 'arm' && rig[2] < 0 ? -1 : 1;
  const x = p.x * side, y = p.y, z = p.z;
  const { m, s } = figurePose(kind, rig, pose, [x, y, z], scratchRig);
  return out.set((m[0] * x + m[3] * y + m[6] * z + s[0]) * side, m[1] * x + m[4] * y + m[7] * z + s[1], m[2] * x + m[5] * y + m[8] * z + s[2]);
}

// ---- Placing limbs ------------------------------------------------------------------------------------

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'XZY'), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

/**
 * A limb's instance matrix: `parent` (body base or chest matrix) times its pivot (px, py) and the Euler
 * rotation (swing about x, abduct about z, roll about y; order 'XZY'). Swing < 0 is forward; for a limb on
 * the +x side (the person's left) abduct > 0 is outward and roll > 0 turns the elbow crease outward; mirror
 * both with sideX() for the other side. Roll is humeral rotation.
 */
export function limbMatrix(parent: THREE.Matrix4, px: number, py: number, swing: number, abduct: number, roll: number, out = new THREE.Matrix4(), pz = 0) {
  // Euler components are (x, y, z): swing about x, roll about y, abduct about z; 'XZY' applies roll first.
  _m.compose(_v.set(px, py, pz), _q.setFromEuler(_e.set(swing, roll, abduct, 'XZY')), _one);
  return out.multiplyMatrices(parent, _m);
}

/** The chest's matrix: `base` twisted by `twist` about the waist. Arms hang from it so they follow the shader's chest twist. */
export function chestMatrix(base: THREE.Matrix4, twist: number, out = new THREE.Matrix4()) {
  // T(0, waistY) Ry T(0, -waistY) is just Ry: a turn about the vertical axis leaves the pivot's height alone.
  return twist === 0 ? out.copy(base) : out.multiplyMatrices(base, _m.makeRotationY(twist));
}

/**
 * An arm tuple: [swing, abduct, roll, elbow, twist, flex, hand]. Abduct and roll are written with outward = +
 * and mirrored per side by `poseArm` (sideX), so one tuple poses either side.
 * Elbow < 0 flexes (forearm forward), twist > 0 pronates, flex > 0 bends the wrist toward the palm.
 */
export type ArmPose = readonly [number, number, number, number, number, number, number];

/** Writes an arm's instance matrix (from the chest matrix) and its shader pose for `side` (+1 right, at -x; -1 left). */
export function poseArm(chest: THREE.Matrix4, side: 1 | -1, a: ArmPose, outMatrix: THREE.Matrix4, outPose: Float32Array | number[], shoulderX: number = FIGURE.shoulderX) {
  const sx = sideX(side);
  limbMatrix(chest, sx * shoulderX, FIGURE.shoulderY, a[0], sx * a[1], sx * a[2], outMatrix);
  outPose[0] = a[3]; outPose[1] = a[4]; outPose[2] = a[5]; outPose[3] = a[6];
  return outMatrix;
}

/** Blends two arm tuples (hand codes blend per finger). */
export function mixArm(a: ArmPose, b: ArmPose, t: number, out: number[] = new Array(7)): ArmPose {
  for (let k = 0; k < 6; k++) out[k] = a[k] + (b[k] - a[k]) * t;
  out[6] = a[6] === b[6] ? a[6] : mixHand(a[6], b[6], t);
  return out as unknown as ArmPose;
}

/**
 * Arm poses checked on the pose sheet (written for the right arm; `poseArm` mirrors them per side).
 * Consumers can blend from RELAXED with `mixArm` as an act eases in.
 */
export const ARM_POSES = {
  RELAXED: [0.02, 0.06, 0, -0.12, 0.1, 0, HAND.RELAXED],
  /** Reading a phone held in front of the chest. */
  PHONE: [-0.45, 0.05, -0.2, -1.95, 0.9, 0.35, HAND.PHONE],
  /** Phone at the ear. */
  CALL: [-1.61, 0.19, -0.38, -2.52, -1.03, -0.73, HAND.PHONE],
  STRETCH: [-2.9, 0.15, 0, -0.2, -0.3, -0.2, HAND.OPEN],
  SCRATCH: [-3.03, 0.43, -1.36, -1.81, 0.3, 0, HAND.CLAW],
  WAVE: [-0.3, 2.4, 0, -0.5, -1.2, 0, HAND.OPEN],
  FAN: [-0.34, 1.15, -0.64, -2.45, -1.4, -0.09, HAND.GRIP],
  SERVE: [-0.5, 0.05, 0, -1.4, -1.2, 0, HAND.OPEN],
  SHOUT: [-0.6, -0.3, -0.5, -2.4, 0.6, 0.2, HAND.CUP],
  AKIMBO: [0.18, 0.74, -1.17, -1.68, 1.2, 0.4, handCode(0.6)],
  CROSS: [-0.29, -0.12, -1.19, -1.79, 0.8, 0, HAND.RELAXED],
  POINT: [-1.5, 0, 0, -0.05, 0, 0, HAND.POINT],
  CHAT: [-0.3, 0.05, 0, -1.4, 0.9, 0, HAND.OPEN],
  /** The elbow down at the side, the fist up in front of the shoulder: the shaft passes beside the head, not the face. */
  UMBRELLA: [0.23, 0, 0.19, -2.1, -0.15, 0, HAND.GRIP],
  SURRENDER: [-2.85, 0.35, 0, -0.35, -0.3, 0, HAND.OPEN],
  GUARD: [-1.25, -0.15, 0.3, -1.9, 0.6, 0, HAND.FIST],
  SIT: [-0.5, 0.1, 0, -0.85, 0.6, 0.25, HAND.RELAXED],
  AIM: [-1.41, -0.2, -0.07, -0.06, -0.01, -0.23, HAND.TRIGGER],
  AIM_SUPPORT: [-1.4, -0.29, -0.57, 0, 0, -0.09, HAND.GRIP],
  RIFLE: [-0.14, 0.61, -0.88, -2.25, -0.52, -0.9, HAND.TRIGGER],
  RIFLE_SUPPORT: [-0.99, -0.05, -0.88, -0.78, -1.41, 0.32, HAND.GRIP],
  ESCORT: [-1, 0.3, 0, -0.6, 0.9, 0, HAND.GRIP],
  REACH: [-1.45, 0.12, 0, -0.25, 0.9, -0.5, HAND.CLAW],
  /** The right hand on a gánh pole 0.22 u ahead of the shoulder, elbow down (solved for the female shoulder). */
  GANH: [-0.55, 0.36, -0.11, -2.42, -0.8, 0, HAND.GRIP],
} satisfies Record<string, ArmPose>;

// ---- Walking --------------------------------------------------------------------------------------------

/** Joint angles of a walk or run cycle (FIGURE conventions: thigh < 0 forward, knee > 0 flexed, ankle > 0 toes down). */
export type Gait = {
  thighL: number; thighR: number; kneeL: number; kneeR: number; ankleL: number; ankleR: number; toeL: number; toeR: number;
  armL: number; armR: number; elbowL: number; elbowR: number;
  /** Chest counter-twist about the waist: the shoulder of the swinging-forward arm comes forward, against the legs. */
  chest: number;
  /** Vertical bob of the body in FIGURE units (add to y). */
  bob: number;
};
export const newGait = (): Gait => ({ thighL: 0, thighR: 0, kneeL: 0, kneeR: 0, ankleL: 0, ankleR: 0, toeL: 0, toeR: 0, armL: 0, armR: 0, elbowL: 0, elbowR: 0, chest: 0, bob: 0 });

/**
 * One frame of a gait: `phase` is the stride angle (radians, one cycle per two steps), `run` 0 walk .. 1
 * sprint, `go` 0 standing .. 1 full stride. Left leg forward when sin(phase) < 0.
 */
export function gait(phase: number, run: number, go: number, out: Gait = newGait()) {
  const amp = (0.48 + 0.34 * run) * go, kneeAmp = 0.55 + 1.05 * run, armK = 0.8 + 0.3 * run, bend = (0.18 + 1.15 * run) * go;
  // One leg at its own phase p: the thigh is forward when sin(p) < 0 and swings forward while cos(p) < 0. Toes
  // up at heel strike, pointed at push-off; the toes bend up at the ball just before the foot leaves.
  for (let side = 0; side < 2; side++) {
    const p = phase + side * Math.PI, s = Math.sin(p), c = Math.cos(p);
    const heel = Math.max(0, -s), push = Math.max(0, Math.sin(p - 0.45));
    const thigh = s * amp, knee = (Math.max(0, -c) * kneeAmp + 0.12 * run) * go + 0.04;
    const ankle = (-0.25 * heel * heel + 0.35 * push * push * push) * go, toe = 0.5 * Math.max(0, Math.sin(p + 0.15)) ** 6 * go;
    if (side === 0) { out.thighL = thigh; out.kneeL = knee; out.ankleL = ankle; out.toeL = toe; }
    else { out.thighR = thigh; out.kneeR = knee; out.ankleR = ankle; out.toeR = toe; }
  }
  out.armL = -out.thighL * armK;
  out.armR = -out.thighR * armK;
  out.elbowL = -bend - Math.max(0, -out.armL) * 0.35;
  out.elbowR = -bend - Math.max(0, -out.armR) * 0.35;
  // Left leg forward (sin < 0) brings the right shoulder (at -x) forward: a positive turn about +y.
  out.chest = -Math.sin(phase) * (0.06 + 0.1 * run) * go;
  out.bob = (0.012 + 0.03 * run) * go * Math.cos(2 * phase);
  return out;
}

// ---- Inverse kinematics ---------------------------------------------------------------------------------

/** Two-bone joint (elbow or knee) between `a` and `b` for segment lengths l1, l2, bent toward `hint`. */
export function joint(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, hint: THREE.Vector3, out = new THREE.Vector3()) {
  const d = _v.subVectors(b, a);
  const dist = Math.max(1e-6, d.length());
  d.divideScalar(dist);
  if (dist >= l1 + l2) return out.copy(a).addScaledVector(d, l1);
  const p = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - p * p));
  const nx = hint.x - d.x * hint.dot(d), ny = hint.y - d.y * hint.dot(d), nz = hint.z - d.z * hint.dot(d);
  const nl = Math.hypot(nx, ny, nz) || 1;
  return out.set(a.x + d.x * p + (nx / nl) * h, a.y + d.y * p + (ny / nl) * h, a.z + d.z * p + (nz / nl) * h);
}

const fx = new THREE.Vector3(), fy = new THREE.Vector3(), fz = new THREE.Vector3(), seg2 = new THREE.Vector3();
/**
 * A limb frame from three points (root a, middle joint b, end c), for ragdolls and IK: y' runs from b back
 * to a and the limb bends in its y'z' plane (forearm toward +z', shin toward -z'). `hint` is the direction
 * the end segment would bend toward (forearm forward, shin backward) and is used only when the limb is straight.
 * Writes T(a) R S(sx, sy, sz) into `out` and returns the bend angle (elbow < 0, knee > 0).
 */
export function limbFrame(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, knee: boolean, hint: THREE.Vector3, out: THREE.Matrix4, sx = 1, sy = sx, sz = sx) {
  fy.subVectors(a, b).normalize();
  seg2.subVectors(c, b);
  const l2 = seg2.length() || 1;
  const cosBend = clamp(-fy.dot(seg2) / l2, -1, 1);
  fz.copy(seg2).addScaledVector(fy, -fy.dot(seg2));
  if (fz.lengthSq() < 1e-10 * l2 * l2) fz.copy(hint).addScaledVector(fy, -fy.dot(hint));
  fz.normalize();
  if (knee) fz.negate();
  fx.crossVectors(fy, fz);
  out.makeBasis(fx.multiplyScalar(sx), fy.multiplyScalar(sy), fz.multiplyScalar(sz)).setPosition(a);
  const bend = Math.acos(cosBend);
  return knee ? bend : -bend;
}

const ikElbow = new THREE.Vector3(), ikHint = new THREE.Vector3(), ikFrame = new THREE.Matrix4(), ikEuler = new THREE.Euler();
/**
 * Two-bone IK in the parent's space: angles for limbMatrix (swing, abduct, roll) and the middle joint's bend
 * so a limb rooted at `root` reaches `target`. `hint` points where the elbow / knee should go.
 */
export function twoBoneIK(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, hint: THREE.Vector3, knee = false) {
  joint(root, target, l1, l2, hint, ikElbow);
  // The end segment bends away from the side the middle joint sticks out to; that is the fallback when straight.
  const bend = limbFrame(root, ikElbow, target, knee, ikHint.copy(hint).negate(), ikFrame);
  ikEuler.setFromRotationMatrix(ikFrame, 'XZY');
  return { swing: ikEuler.x, abduct: ikEuler.z, roll: ikEuler.y, bend };
}

// ---- Forward kinematics of the hand -------------------------------------------------------------------

/**
 * The wrist frame in arm space under an arm pose [elbow, twist, flex] (exactly what the shader does to a
 * rigid item at the wrist). Right arms (`side` +1, at -x) are built mirrored, so their frame is the mirror
 * image: pass sockets with x mirrored (`socket()`).
 */
export function armFK(pose: ArrayLike<number>, side: 1 | -1 = 1, out = new THREE.Matrix4()) {
  const t = figurePose('arm', [1, 1, side, 0], pose, [0, WRIST, 0], scratchRig);
  const m = t.m, s = t.s;
  // Rigid point p (hand space, origin at the wrist): arm = M (p + wrist) + S.
  const wx = 0, wy = WRIST, wz = 0;
  const tx = m[0] * wx + m[3] * wy + m[6] * wz + s[0], ty = m[1] * wx + m[4] * wy + m[7] * wz + s[1], tz = m[2] * wx + m[5] * wy + m[8] * wz + s[2];
  out.set(m[0], m[3], m[6], tx, m[1], m[4], m[7], ty, m[2], m[5], m[8], tz, 0, 0, 0, 1);
  if (sideX(side) < 0) {
    // Conjugate by the x mirror: S M S keeps it a proper rotation.
    const e = out.elements;
    e[1] = -e[1]; e[2] = -e[2]; e[4] = -e[4]; e[8] = -e[8]; e[12] = -e[12];
  }
  return out;
}

const _grip = new THREE.Matrix4(), _gripTurn = new THREE.Matrix4().makeRotationX(Math.PI / 2);
/**
 * Where a prop held in the fist goes: `arm` is the arm's instance matrix, `pose` its shader pose. The
 * prop's +y axis runs along the fist channel (out past the thumb), its origin at the GRIP socket; an
 * umbrella built shaft-up therefore stands in the hand.
 */
export function gripMatrix(arm: THREE.Matrix4, pose: ArrayLike<number>, side: 1 | -1 = 1, out = new THREE.Matrix4()) {
  const g = HAND_SOCKET.GRIP;
  armFK(pose, side, _grip);
  out.multiplyMatrices(arm, _grip).multiply(_m.makeTranslation(g[0] * sideX(side), g[1], g[2])).multiply(_gripTurn);
  return out;
}

/** A hand socket for `side` in its arm's space (the table is for an unmirrored +x arm; right arms mirror x). */
export function socket(name: keyof typeof HAND_SOCKET, side: 1 | -1 = 1, out = new THREE.Vector3()) {
  const p = HAND_SOCKET[name];
  return out.set(p[0] * sideX(side), p[1], p[2]);
}

// ---- Seats and ragdolls ---------------------------------------------------------------------------------

/** How far to lower a standing figure's root so its hips rest on a seat `seatTop` metres high. */
export function sitDrop(seatTop: number, height = 1, scale = BODY_SCALE) {
  return (FIGURE.hipY - FIGURE.seatClear) * scale * height - seatTop;
}

export type RagdollJoint =
  | 'head' | 'neck' | 'chest' | 'waist' | 'pelvis'
  | 'shL' | 'shR' | 'elL' | 'elR' | 'wrL' | 'wrR' | 'haL' | 'haR'
  | 'hipL' | 'hipR' | 'knL' | 'knR' | 'anL' | 'anR' | 'toL' | 'toR';

/**
 * Standing joint positions in FIGURE units (feet at y = 0, facing +z, L at +x): wrists, knuckles (ha),
 * ankles and balls of the feet (to). The ragdoll's rest pose and proportions come from here.
 */
export function ragdollPose(fem = false): Record<RagdollJoint, [number, number, number]> {
  const sx = fem ? FIGURE.shoulderXF : FIGURE.shoulderX, sy = FIGURE.shoulderY, hx = FIGURE.hipX, hy = FIGURE.hipY;
  const knuckle = WRIST + FINGERS[1][1];
  const pair = (x: number, y: number, z: number): [[number, number, number], [number, number, number]] => [[sideX(-1) * x, y, z], [sideX(1) * x, y, z]];
  const [shL, shR] = pair(sx, sy, 0), [elL, elR] = pair(sx, sy - UA, -0.005), [wrL, wrR] = pair(sx, sy + WRIST, 0.01);
  const [haL, haR] = pair(sx - 0.012, sy + knuckle, 0.012);
  const [hipL, hipR] = pair(hx, hy, 0), [knL, knR] = pair(hx, hy - TH, 0.008), [anL, anR] = pair(hx, FIGURE.ankleY, -0.005);
  const [toL, toR] = pair(hx + 0.008, 0.035, FIGURE.ball);
  return {
    head: [0, FIGURE.headY, 0.01], neck: [0, FIGURE.neckY, -0.015], chest: [0, 1.44, 0.03], waist: [0, FIGURE.waistY, -0.01], pelvis: [0, (hy + FIGURE.panelY) / 2, -0.01],
    shL, shR, elL, elR, wrL, wrR, haL, haR, hipL, hipR, knL, knR, anL, anR, toL, toR,
  };
}

/** Collision radii of those joints in FIGURE units, measured from the anatomy builders. */
export const RAGDOLL_RADII: Record<RagdollJoint, number> = {
  head: 0.13, neck: 0.05, chest: 0.15, waist: 0.14, pelvis: 0.15,
  shL: 0.065, shR: 0.065, elL: 0.048, elR: 0.048, wrL: 0.032, wrR: 0.032, haL: 0.04, haR: 0.04,
  hipL: 0.09, hipR: 0.09, knL: 0.06, knR: 0.06, anL: 0.035, anR: 0.035, toL: 0.035, toR: 0.035,
};
