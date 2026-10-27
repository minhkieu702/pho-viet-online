import * as THREE from 'three';
import { ModelParts, vehicleMaterial, type Vec3 } from './vehicle-models';
import { groundHeight } from './map/terrain';
import { inHours } from './street-life';
import type { LifeFurniture, LifeGroup } from './city';

/**
 * Street-life props, drawn as three batches: the street furniture (plastic stools, low tables, cờ tướng tables with
 * their boards, ông Địa altars, phở stands, a karaoke loudspeaker, stacks of stools for closing time) in one static
 * BatchedMesh; what people hold and carry (bowls and chopsticks, glasses of cà phê sữa đá, trà đá and bia hơi,
 * newspapers, lottery tickets, chess pieces, incense, a mic, a ladle, gánh poles and baskets, push carts, portable
 * stools, the đá cầu shuttlecock) in one dynamic BatchedMesh; and wisps of steam and incense smoke. None cast shadows.
 * Everything is real-world metres with y = 0 on the ground; furniture faces +z at yaw 0.
 */

const STOOL_TINTS = ['#d23c33', '#2f6fb5', '#3f9a5a', '#e8b53a', '#e07aa0'];
const TABLE_TOPS: [string, 'chrome' | 'plastic'][] = [['#c9ccd0', 'chrome'], ['#9c6b45', 'plastic'], ['#3a6fb5', 'plastic']];

// ---- Geometry ----------------------------------------------------------------------------------------------

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (top: number, bottom: number, h: number, seg = 8) => new THREE.CylinderGeometry(top, bottom, h, seg);
const ball = (w = 8, h = 5) => new THREE.SphereGeometry(1, w, h);
const lathe = (points: [number, number][], seg = 8) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const Y_UP = new THREE.Vector3(0, 1, 0), rodFrom = new THREE.Vector3(), rodTo = new THREE.Vector3();
/** A round rod of radius r from a to b (ModelParts.rod would scale the radius twice). */
function rod(p: ModelParts, a: Vec3, b: Vec3, r: number, o: { color?: THREE.ColorRepresentation; finish?: 'chrome' | 'metal' | 'rubber' | 'plastic' } = {}, seg = 6) {
  rodFrom.set(...a); rodTo.set(...b);
  const len = rodFrom.distanceTo(rodTo) || 1e-4;
  const m = new THREE.Matrix4().compose(rodFrom.clone().add(rodTo).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y_UP, rodTo.clone().sub(rodFrom).divideScalar(len)), new THREE.Vector3(r, len, r));
  return p.add(new THREE.CylinderGeometry(1, 1, 1, seg), { ...o, matrix: m });
}

/** A low plastic stool (ghế nhựa), seat top `top` m; white, tinted per instance. */
function stoolParts(p: ModelParts, top = 0.28, y0 = 0) {
  p.add(box(0.3, 0.025, 0.3), { at: [0, y0 + top - 0.0125, 0] });
  p.add(box(0.27, 0.05, 0.27), { at: [0, y0 + top - 0.05, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.beam([sx * 0.11, y0 + top - 0.07, sz * 0.11], [sx * 0.135, y0, sz * 0.135], 0.035, 0.035);
  return p;
}
function stoolGeometry() { return stoolParts(new ModelParts()).build(); }
/** Six stools stacked into a column, as they wait by the wall after closing. */
function stackGeometry() {
  const p = stoolParts(new ModelParts());
  for (let k = 1; k < 6; k++) {
    p.add(box(0.3, 0.025, 0.3), { at: [0, 0.28 - 0.0125 + k * 0.065, 0] });
    p.add(box(0.27, 0.045, 0.27), { at: [0, 0.28 - 0.045 + k * 0.065, 0] });
  }
  return p.build();
}
/** A plastic chair with a back (the giữ xe attendant's). */
function chairGeometry() {
  const p = stoolParts(new ModelParts(), 0.42);
  p.add(box(0.3, 0.3, 0.025), { at: [0, 0.6, -0.15], rot: [-0.12, 0, 0] });
  for (const sx of [-1, 1]) p.beam([sx * 0.13, 0.42, -0.14], [sx * 0.13, 0.75, -0.18], 0.03, 0.025);
  return p.build();
}
/** A low quán table: top 0.45 m, condiments and a chopstick holder on it. */
function tableGeometry(tint: number) {
  const [color, finish] = TABLE_TOPS[tint % TABLE_TOPS.length];
  const p = new ModelParts();
  p.add(box(0.62, 0.03, 0.62), { at: [0, 0.435, 0], color, finish });
  p.add(box(0.56, 0.05, 0.56), { at: [0, 0.395, 0], color, finish });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(p, [sx * 0.26, 0.38, sz * 0.26], [sx * 0.27, 0, sz * 0.27], 0.016, { color: '#9aa0a4', finish: 'metal' }, 5);
  p.add(cyl(0.035, 0.035, 0.12, 6), { at: [0.2, 0.51, 0.18], color: '#c9a76a' });
  for (const dx of [-0.012, 0.012]) rod(p, [0.2 + dx, 0.5, 0.18], [0.2 + dx * 2, 0.64, 0.18], 0.004, { color: '#e8d2a0' }, 3);
  p.add(cyl(0.024, 0.026, 0.13, 6), { at: [0.1, 0.515, 0.22], color: '#c0392b' });
  p.add(cyl(0.022, 0.024, 0.12, 6), { at: [0.04, 0.51, 0.22], color: '#8a5a2a', finish: 'glass' });
  p.add(box(0.11, 0.06, 0.08), { at: [-0.2, 0.48, 0.2], color: '#f2efe6' });
  return p.build();
}
/** A cờ tướng table: a low wooden table with the board (9 x 10 lines, the river) and pieces in mid-game. */
function chessGeometry() {
  const p = new ModelParts();
  p.add(box(0.56, 0.03, 0.56), { at: [0, 0.405, 0], color: '#8a5a36' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.beam([sx * 0.24, 0.39, sz * 0.24], [sx * 0.25, 0, sz * 0.25], 0.035, 0.035, { color: '#6a4428' });
  p.add(box(0.44, 0.008, 0.48), { at: [0, 0.424, 0], color: '#e6cf97' });
  const cell = 0.045, x0 = -4 * cell, z0 = -4.5 * cell, ink = '#5a3a1e';
  for (let f = 0; f < 9; f++) {
    const x = x0 + f * cell;
    if (f === 0 || f === 8) p.add(box(0.003, 0.002, 9 * cell), { at: [x, 0.429, 0], color: ink });
    else for (const [a, b] of [[0, 4], [5, 9]]) p.add(box(0.003, 0.002, (b - a) * cell), { at: [x, 0.429, z0 + ((a + b) / 2) * cell], color: ink });
  }
  for (let r = 0; r < 10; r++) p.add(box(8 * cell, 0.002, 0.003), { at: [0, 0.429, z0 + r * cell], color: ink });
  // Pieces where a game stands: red at +z, black at -z.
  const pieces: [number, number, boolean][] = [[0, 0, false], [4, 0, false], [8, 1, false], [2, 2, false], [6, 3, false], [1, 3, false], [4, 4, false],
    [4, 9, true], [0, 9, true], [7, 8, true], [2, 7, true], [5, 6, true], [3, 6, true], [6, 5, true]];
  for (const [f, r, red] of pieces) {
    p.add(cyl(0.019, 0.02, 0.012, 8), { at: [x0 + f * cell, 0.434, z0 + r * cell], color: '#efe2c2' });
    p.add(cyl(0.012, 0.012, 0.002, 8), { at: [x0 + f * cell, 0.441, z0 + r * cell], color: red ? '#b8261e' : '#222222' });
  }
  return p.build();
}
/** A floor altar to Thần Tài and ông Địa: a red cabinet with a gold roof, incense pot, sticks and fruit. */
function altarGeometry() {
  const p = new ModelParts();
  p.add(box(0.38, 0.34, 0.28), { at: [0, 0.17, 0], color: '#b8231c' });
  p.add(box(0.44, 0.05, 0.33), { at: [0, 0.365, 0], color: '#d9a63a', finish: 'chrome' });
  p.add(box(0.3, 0.04, 0.24), { at: [0, 0.41, 0], color: '#d9a63a', finish: 'chrome' });
  p.add(box(0.26, 0.2, 0.01), { at: [0, 0.2, 0.141], color: '#3a1410' });
  for (const sx of [-1, 1]) p.add(box(0.03, 0.3, 0.02), { at: [sx * 0.17, 0.17, 0.145], color: '#d9a63a', finish: 'chrome' });
  for (const sx of [-0.06, 0.06]) p.add(ball(6, 4), { at: [sx, 0.17, 0.12], scale: [0.03, 0.045, 0.02], color: '#e2b84a', finish: 'chrome' });
  p.add(cyl(0.04, 0.035, 0.05, 8), { at: [0, 0.025, 0.2], color: '#a07a3a', finish: 'metal' });
  for (const dx of [-0.012, 0, 0.012]) {
    rod(p, [dx, 0.05, 0.2], [dx * 2, 0.2, 0.2 + dx], 0.002, { color: '#a8251c' }, 3);
    p.add(box(0.006, 0.012, 0.006), { at: [dx * 2, 0.205, 0.2 + dx], color: '#ff8a3a', finish: 'lamp' });
  }
  for (const [x, c] of [[-0.11, '#f0a030'], [0.11, '#e05a3a']] as const) p.add(ball(5, 4), { at: [x, 0.03, 0.2], scale: 0.03, color: c });
  return p.build();
}
/** A phở stand against the wall: a cabinet with a glass case for noodles and herbs, and the big stock pot. */
function standGeometry() {
  const p = new ModelParts();
  p.add(box(0.95, 0.58, 0.5), { at: [0, 0.29, 0], color: '#e6dccb' });
  p.add(box(0.97, 0.05, 0.52), { at: [0, 0.6, 0], color: '#c9ccd0', finish: 'chrome' });
  p.add(box(0.93, 0.08, 0.01), { at: [0, 0.48, 0.255], color: '#c0392b' });
  p.add(box(0.45, 0.3, 0.42), { at: [-0.22, 0.775, 0], color: '#cfe3ea', finish: 'glass' });
  p.add(box(0.47, 0.02, 0.44), { at: [-0.22, 0.935, 0], color: '#c9ccd0', finish: 'chrome' });
  for (const [x, z, c] of [[-0.3, 0.05, '#f2efe0'], [-0.15, -0.05, '#7fb05a'], [-0.32, -0.1, '#e9e2c6']] as const) p.add(ball(5, 4), { at: [x, 0.66, z], scale: [0.07, 0.03, 0.06], color: c });
  p.add(cyl(0.22, 0.2, 0.32, 10), { at: [0.24, 0.785, 0], color: '#cfd3d6', finish: 'chrome', smooth: true });
  p.add(cyl(0.2, 0.2, 0.01, 10), { at: [0.24, 0.93, 0], color: '#a87a3a' });
  return p.build();
}
/** A karaoke trolley loudspeaker (loa kéo) with a glowing ring round the woofer. */
function speakerGeometry() {
  const p = new ModelParts();
  p.add(box(0.44, 0.72, 0.36), { at: [0, 0.42, 0], color: '#1d1f22' });
  p.add(cyl(0.15, 0.15, 0.02, 12), { at: [0, 0.38, 0.18], rot: [Math.PI / 2, 0, 0], color: '#3a3d40' });
  p.add(cyl(0.17, 0.17, 0.008, 12), { at: [0, 0.38, 0.182], rot: [Math.PI / 2, 0, 0], color: '#3fb6ff', finish: 'lamp' });
  p.add(cyl(0.05, 0.05, 0.02, 8), { at: [0, 0.64, 0.18], rot: [Math.PI / 2, 0, 0], color: '#3a3d40' });
  for (const sx of [-1, 1]) rod(p, [sx * 0.18, 0.78, -0.12], [sx * 0.18, 1.02, -0.12], 0.012, { color: '#8a9096', finish: 'metal' }, 4);
  rod(p, [-0.18, 1.02, -0.12], [0.18, 1.02, -0.12], 0.014, { color: '#8a9096', finish: 'metal' }, 4);
  for (const sx of [-1, 1]) p.add(cyl(0.05, 0.05, 0.03, 8), { at: [sx * 0.2, 0.05, -0.14], rot: [0, 0, Math.PI / 2], color: '#202020', finish: 'rubber' });
  return p.build();
}

// ---- Held and carried things ---------------------------------------------------------------------------------

/** Items for crowd props' put(); each is one geometry in the dynamic batch. */
export const HELD = {
  BOWL_PHO: 0, BOWL_BUN: 1, PLATE: 2, CHOPSTICKS: 3, COFFEE: 4, TEA: 5, BEER: 6, CUP: 7, PAPER: 8, TICKETS: 9, PIECE_RED: 10, PIECE_BLACK: 11,
  INCENSE: 12, MIC: 13, LADLE: 14, BAG: 15, MONEY: 16, BANHMI: 17, POLE: 18, BASKET_XOI: 19, BASKET_FRUIT: 20, BASKET_EGG: 21, STOOL: 22, CHAIR: 23,
  SHUTTLE: 24, CART_BANHMI: 25, CART_KEM: 26, BOARD: 27,
} as const;
export type Held = (typeof HELD)[keyof typeof HELD];

/** A noodle bowl (origin at its foot): white with a blue band, broth and herbs. */
function bowlGeometry(broth: string, garnish: string) {
  const p = new ModelParts();
  p.add(lathe([[0, 0], [0.035, 0], [0.04, 0.008], [0.075, 0.055], [0.088, 0.075], [0.082, 0.077], [0.07, 0.06], [0, 0.012]], 8), { color: '#f4f1ea', smooth: true });
  p.add(cyl(0.084, 0.08, 0.008, 8), { at: [0, 0.066, 0], color: '#3a6ab0' });
  p.add(cyl(0.072, 0.072, 0.004, 8), { at: [0, 0.064, 0], color: broth });
  for (const [x, z] of [[0.02, 0.01], [-0.025, 0.02], [0.005, -0.03]]) p.add(box(0.03, 0.006, 0.012), { at: [x, 0.068, z], rot: [0, x * 40, 0], color: garnish });
  return p.build();
}
function plateGeometry() {
  const p = new ModelParts();
  p.add(cyl(0.11, 0.09, 0.015, 10), { at: [0, 0.0075, 0], color: '#f4f1ea' });
  p.add(ball(6, 4), { at: [-0.02, 0.02, 0], scale: [0.06, 0.03, 0.05], color: '#fbf7ec' });
  p.add(box(0.07, 0.012, 0.04), { at: [0.045, 0.022, -0.01], rot: [0, 0.4, 0], color: '#9a5a2a' });
  p.add(cyl(0.022, 0.022, 0.006, 6), { at: [0.03, 0.022, 0.04], color: '#f2c24a' });
  return p.build();
}
/** A drinking glass (origin at its middle): `fill` up to `level`, with ice or a head of foam. */
function glassGeometry(r: number, h: number, fill: string, level: number, top: 'ice' | 'foam' | 'lid') {
  const p = new ModelParts();
  // The drink shows through the lower part; the glass above it is empty.
  p.add(cyl(r * 0.96, r * 0.86, h * level, 8), { at: [0, -h / 2 + (h * level) / 2, 0], color: fill, finish: 'glass' });
  p.add(cyl(r, r * 0.96, h * (1 - level), 8), { at: [0, -h / 2 + h * level + (h * (1 - level)) / 2, 0], color: '#e4eef2', finish: 'glass' });
  if (top === 'foam') p.add(cyl(r * 0.95, r * 0.95, 0.015, 8), { at: [0, -h / 2 + h * level + 0.008, 0], color: '#f6f0dc' });
  if (top === 'ice') for (const [x, z] of [[0.01, 0.005], [-0.01, -0.008]]) p.add(box(0.016, 0.016, 0.016), { at: [x, -h / 2 + h * level, z], rot: [0.3, x * 40, 0.2], color: '#eef6f8', finish: 'glass' });
  if (top === 'lid') {
    p.add(ball(8, 4), { at: [0, h / 2, 0], scale: [r, r * 0.6, r], color: '#e8eef0', finish: 'glass' });
    rod(p, [0.005, h / 2, 0], [0.012, h / 2 + 0.08, 0.004], 0.004, { color: '#e2493a' }, 4);
  }
  return p.build();
}
/** Chopsticks running along +y from the grip, the tips past the thumb. */
function chopsticksGeometry() {
  const p = new ModelParts();
  for (const dx of [-0.006, 0.006]) rod(p, [dx, -0.05, 0], [dx * 0.3, 0.2, 0.004], 0.0035, { color: '#d8b884' }, 4);
  return p.build();
}
/** A folded newspaper (origin at its centre, facing +z): print columns, a red masthead. */
function paperGeometry() {
  const p = new ModelParts();
  p.add(box(0.32, 0.42, 0.004), { color: '#e9e5da' });
  for (const side of [-1, 1]) {
    p.add(box(0.28, 0.04, 0.002), { at: [0, 0.17, side * 0.003], color: side > 0 ? '#b8261e' : '#2a2a2a' });
    for (let k = 0; k < 3; k++) p.add(box(0.08, 0.26, 0.002), { at: [-0.1 + k * 0.1, -0.03, side * 0.003], color: '#8f8b84' });
  }
  return p.build();
}
/** A sheaf of lottery tickets (origin at the clip), fanned upward. */
function ticketsGeometry() {
  const p = new ModelParts();
  const colors = ['#f2b8c6', '#b8d4f2', '#f2e2a0', '#b8e2c0', '#f2c8a0'];
  colors.forEach((c, k) => p.add(box(0.075, 0.15, 0.002), { at: [0, 0.07, k * 0.002], rot: [0, 0, (k - 2) * 0.12], color: c }));
  p.add(box(0.03, 0.02, 0.016), { at: [0, 0.0, 0.004], color: '#3a3a3a' });
  return p.build();
}
function pieceGeometry(red: boolean) {
  const p = new ModelParts();
  p.add(cyl(0.019, 0.02, 0.012, 8), { color: '#efe2c2' });
  p.add(cyl(0.012, 0.012, 0.002, 8), { at: [0, 0.007, 0], color: red ? '#b8261e' : '#222222' });
  return p.build();
}
/** Three incense sticks rising from the hands, the tips glowing. */
function incenseGeometry() {
  const p = new ModelParts();
  for (const dx of [-0.008, 0, 0.008]) {
    rod(p, [dx, -0.05, 0], [dx * 2.5, 0.3, dx], 0.0035, { color: '#b8302a' }, 3);
    p.add(box(0.008, 0.02, 0.008), { at: [dx * 2.5, 0.31, dx], color: '#ff7a2a', finish: 'lamp' });
  }
  return p.build();
}
function micGeometry() {
  const p = new ModelParts();
  p.add(cyl(0.017, 0.013, 0.16, 6), { at: [0, 0.02, 0], color: '#1c1c1e' });
  p.add(ball(8, 6), { at: [0, 0.12, 0], scale: 0.028, color: '#9a9ea2', finish: 'metal' });
  return p.build();
}
/** A ladle hanging down from the fist: the handle along -y, the cup at its end. */
function ladleGeometry() {
  const p = new ModelParts();
  rod(p, [0, 0.05, 0], [0, -0.38, 0.02], 0.007, { color: '#cfd3d6', finish: 'chrome' }, 4);
  p.add(lathe([[0, -0.05], [0.04, -0.045], [0.055, -0.02], [0.058, 0]], 8), { at: [0, -0.4, 0.02], color: '#cfd3d6', finish: 'chrome' });
  return p.build();
}
function bagGeometry() {
  const p = new ModelParts();
  p.add(ball(6, 5), { at: [0, -0.09, 0], scale: [0.07, 0.08, 0.05], color: '#f2f2ee' });
  rod(p, [0, 0.01, -0.02], [0, -0.03, 0.02], 0.004, { color: '#f2f2ee' }, 3);
  return p.build();
}
function moneyGeometry() {
  const p = new ModelParts();
  p.add(box(0.07, 0.14, 0.003), { at: [0, 0.05, 0], color: '#6aa87a' });
  return p.build();
}
function banhmiGeometry() {
  const p = new ModelParts();
  p.add(ball(8, 5), { scale: [0.035, 0.035, 0.11], color: '#d99a42' });
  return p.build();
}
/** A bamboo carrying pole (đòn gánh) along z, 1.7 m. */
function poleGeometry() {
  const p = new ModelParts();
  rod(p, [0, 0, -0.85], [0, 0, 0.85], 0.018, { color: '#c9a45c' }, 6);
  for (const z of [-0.5, 0, 0.5]) p.add(cyl(0.021, 0.021, 0.015, 6), { at: [0, 0, z], rot: [Math.PI / 2, 0, 0], color: '#a8874a' });
  return p.build();
}
/** A woven basket (thúng) on three cords, hanging from its origin (the knot on the pole); `goods` on top. */
function basketGeometry(goods: 'xoi' | 'fruit' | 'egg') {
  const p = new ModelParts();
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3;
    rod(p, [0, 0, 0], [Math.sin(a) * 0.22, -0.46, Math.cos(a) * 0.22], 0.004, { color: '#6a5a3a' }, 3);
  }
  p.add(lathe([[0, -0.62], [0.16, -0.62], [0.22, -0.56], [0.25, -0.46], [0.24, -0.45]], 10), { color: '#b08a4a', smooth: true });
  if (goods === 'xoi') {
    p.add(ball(8, 4), { at: [0, -0.47, 0], scale: [0.2, 0.07, 0.2], color: '#4f8a3a' });
    p.add(ball(6, 4), { at: [0.03, -0.42, 0.02], scale: [0.11, 0.05, 0.11], color: '#f6f0dc' });
    p.add(ball(6, 4), { at: [-0.07, -0.43, -0.05], scale: [0.07, 0.035, 0.07], color: '#e8c24a' });
  } else if (goods === 'fruit') {
    const fruit: [number, number, string][] = [[0.08, 0.05, '#e8c040'], [-0.06, 0.08, '#d84a7a'], [0.02, -0.08, '#7ab04a'], [-0.09, -0.04, '#e8c040'], [0.1, -0.07, '#f08a30'], [0, 0.01, '#d84a7a']];
    for (const [x, z, c] of fruit) p.add(ball(6, 4), { at: [x, -0.43, z], scale: [0.055, 0.05, 0.065], color: c });
  } else {
    p.add(cyl(0.15, 0.13, 0.16, 10), { at: [0, -0.4, 0], color: '#5a4030' });
    p.add(ball(8, 4), { at: [0, -0.32, 0], scale: [0.17, 0.05, 0.17], color: '#c9b48a' });
  }
  return p.build();
}
/** The đá cầu shuttlecock: rubber washers and a crown of feathers (origin at the base). */
function shuttleGeometry() {
  const p = new ModelParts();
  p.add(cyl(0.024, 0.026, 0.016, 8), { color: '#c0392b' });
  // A crown of four big feathers (white and blue, as on the real thing), so it reads in flight.
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    p.beam([Math.sin(a) * 0.008, 0.008, Math.cos(a) * 0.008], [Math.sin(a) * 0.05, 0.13, Math.cos(a) * 0.05], 0.045, 0.004, { color: k % 2 ? '#f4f1ea' : '#3a8fd0' });
  }
  return p.build();
}
/** A push cart along +z (pushed from its handle at -z): a glass case on a painted box, two wheels and a parasol. */
function cartGeometry(kind: 'banhmi' | 'kem') {
  const p = new ModelParts();
  const body = kind === 'banhmi' ? '#2f6fb5' : '#f2f0ea';
  p.add(box(0.55, 0.55, 0.85), { at: [0, 0.55, 0.05], color: body });
  for (const sx of [-1, 1]) p.add(cyl(0.2, 0.2, 0.05, 10), { at: [sx * 0.3, 0.2, 0.15], rot: [0, 0, Math.PI / 2], color: '#202020', finish: 'rubber' });
  rod(p, [-0.25, 0.78, -0.4], [-0.25, 0.92, -0.6], 0.012, { color: '#9aa0a4', finish: 'metal' }, 4);
  rod(p, [0.25, 0.78, -0.4], [0.25, 0.92, -0.6], 0.012, { color: '#9aa0a4', finish: 'metal' }, 4);
  rod(p, [-0.27, 0.92, -0.6], [0.27, 0.92, -0.6], 0.015, { color: '#2a2a2a' }, 5);
  rod(p, [0, 0.3, 0.5], [0, 0, 0.55], 0.015, { color: '#9aa0a4', finish: 'metal' }, 4);
  if (kind === 'banhmi') {
    p.add(box(0.5, 0.36, 0.8), { at: [0, 1.0, 0.05], color: '#d6e8ee', finish: 'glass' });
    p.add(box(0.56, 0.02, 0.86), { at: [0, 1.19, 0.05], color: '#e8d24a' });
    p.add(box(0.5, 0.1, 0.01), { at: [0, 0.75, 0.48], color: '#e8b53a' });
    for (const z of [-0.15, 0.05, 0.25]) p.add(ball(6, 4), { at: [0, 0.89, z], scale: [0.04, 0.035, 0.11], color: '#d99a42' });
  } else {
    p.add(box(0.5, 0.06, 0.78), { at: [0, 0.85, 0.05], color: '#3a8fd0' });
    p.add(box(0.46, 0.05, 0.12), { at: [0, 0.4, 0.5], color: '#e2493a' });
    rod(p, [0, 0.88, 0.1], [0, 1.85, 0.1], 0.012, { color: '#9aa0a4', finish: 'metal' }, 4);
    p.add(new THREE.ConeGeometry(0.75, 0.3, 10, 1, true), { at: [0, 1.9, 0.1], color: '#e85a4a', smooth: true });
    p.add(cyl(0.74, 0.74, 0.01, 10), { at: [0, 1.75, 0.1], color: '#f2e6c0' });
  }
  return p.build();
}

const ITEM_BUILDERS: (() => THREE.BufferGeometry)[] = [
  () => bowlGeometry('#d9b98a', '#5fa040'), () => bowlGeometry('#d4693b', '#7ab04a'), plateGeometry, chopsticksGeometry,
  () => glassGeometry(0.032, 0.095, '#4a2c1a', 0.8, 'ice'), () => glassGeometry(0.037, 0.11, '#c9a25a', 0.85, 'ice'), () => glassGeometry(0.042, 0.125, '#e0a630', 0.82, 'foam'),
  () => glassGeometry(0.04, 0.13, '#cfa880', 0.8, 'lid'), paperGeometry, ticketsGeometry, () => pieceGeometry(true), () => pieceGeometry(false),
  incenseGeometry, micGeometry, ladleGeometry, bagGeometry, moneyGeometry, banhmiGeometry, poleGeometry,
  () => basketGeometry('xoi'), () => basketGeometry('fruit'), () => basketGeometry('egg'), stoolGeometry, chairGeometry, shuttleGeometry,
  () => cartGeometry('banhmi'), () => cartGeometry('kem'), chessGeometry,
];

const material = (() => { let m: ReturnType<typeof vehicleMaterial> | null = null; return () => (m ??= vehicleMaterial()); })();

function batchOf(geometries: THREE.BufferGeometry[], instances: number) {
  const vertices = geometries.reduce((sum, g) => sum + g.getAttribute('position').count, 0);
  const mesh = new THREE.BatchedMesh(instances, vertices, 0, material().material);
  const ids = geometries.map((g) => mesh.addGeometry(g));
  for (const g of geometries) g.dispose();
  mesh.sortObjects = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return { mesh, ids };
}
const WHITE = new THREE.Color('#ffffff');
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpC = new THREE.Color();

/** Lamps (incense tips, the speaker ring) glow more at night: 0 day .. 1 night. */
export function setPropGlow(night: number) { material().lamps.value = 0.25 + 1.4 * night; }

/**
 * What the crowd holds and carries, refilled every frame: begin(), put() each item with its world matrix (or
 * place() with a position and turn), end(). Items beyond `range` metres of the focus are skipped.
 */
export function createCrowdProps(scene: THREE.Scene, capacity = 320) {
  const { mesh, ids } = batchOf(ITEM_BUILDERS.map((b) => b()), capacity);
  // The batch moves every frame: each item is culled on its own instead.
  mesh.frustumCulled = false;
  scene.add(mesh);
  for (let i = 0; i < capacity; i++) { mesh.addInstance(ids[0]); mesh.setVisibleAt(i, false); }
  let n = 0, last = 0, range = Infinity, fx = 0, fz = 0;
  const tints: (THREE.Color | null)[] = new Array(capacity).fill(null);
  return {
    mesh,
    begin(focusX: number, focusZ: number) { n = 0; fx = focusX; fz = focusZ; },
    /** Whether something at (x, z) is close enough to the focus to be drawn. */
    near(x: number, z: number) { return Math.abs(x - fx) < range && Math.abs(z - fz) < range; },
    put(item: Held, matrix: THREE.Matrix4, tint?: THREE.Color) {
      if (n >= capacity) return;
      mesh.setGeometryIdAt(n, ids[item]);
      mesh.setMatrixAt(n, matrix);
      // Only re-tint a slot when its colour changes (the colour texture uploads whole).
      const c = tint ?? WHITE;
      if (tints[n] !== c) { tints[n] = c; mesh.setColorAt(n, c); }
      mesh.setVisibleAt(n, true);
      n++;
    },
    /** An item at a point, turned by yaw (then pitch about its x and roll about z). */
    place(item: Held, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, scale = 1, tint?: THREE.Color) {
      this.put(item, tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(pitch, yaw, roll, 'YXZ')), tmpS.setScalar(scale)), tint);
    },
    end() {
      for (let i = n; i < last; i++) mesh.setVisibleAt(i, false);
      last = n;
    },
    count() { return n; },
    /** Quality level 0-5: props within 45 m from level 3, 30 m at 5. */
    setDetail(level: number) { range = level >= 5 ? 30 : level >= 3 ? 45 : Infinity; },
    dispose() { scene.remove(mesh); mesh.dispose(); },
  };
}
export type CrowdProps = ReturnType<typeof createCrowdProps>;

// ---- Street furniture ----------------------------------------------------------------------------------------

/**
 * The street furniture as one batch: stools and tables are out while their quán is open (and dry, unless under
 * an awning), a stack of stools by the wall otherwise. update() checks the hour twice a second.
 */
/**
 * A piece of street furniture: today's (city.ts LIFE.furniture), or a district quán's 'stool42' (the taller plastic
 * stool district-render.ts puts round a district eatery table, seat 0.42 m) for the stools district-life.ts adds.
 */
export type Furniture = Omit<LifeFurniture, 'kind'> & { kind: LifeFurniture['kind'] | 'stool42' };
export function createStreetFurniture(scene: THREE.Scene, furniture: readonly Furniture[], groups: readonly Pick<LifeGroup, 'hours' | 'covered'>[], ground: (x: number, z: number) => number = groundHeight) {
  const kinds = ['stool', 'stack', 'table0', 'table1', 'table2', 'chess', 'altar', 'stand', 'speaker', 'stool42'] as const;
  const builders: Record<(typeof kinds)[number], () => THREE.BufferGeometry> = {
    stool: stoolGeometry, stack: stackGeometry, table0: () => tableGeometry(0), table1: () => tableGeometry(1), table2: () => tableGeometry(2),
    chess: chessGeometry, altar: altarGeometry, stand: standGeometry, speaker: speakerGeometry, stool42: () => stoolParts(new ModelParts(), 0.42).build(),
  };
  const { mesh, ids } = batchOf(kinds.map((k) => builders[k]()), Math.max(1, furniture.length));
  const geometryOf = (f: Furniture) => ids[kinds.indexOf((f.kind === 'table' ? `table${f.tint % 3}` : f.kind) as (typeof kinds)[number])];
  furniture.forEach((f, i) => {
    mesh.addInstance(geometryOf(f));
    mesh.setMatrixAt(i, tmpM.compose(tmpP.set(f.x, ground(f.x, f.z), f.z), tmpQ.setFromEuler(tmpE.set(0, f.yaw, 0)), tmpS.set(1, 1, 1)));
    mesh.setColorAt(i, tmpC.set(f.kind === 'stool' || f.kind === 'stool42' || f.kind === 'stack' ? STOOL_TINTS[f.tint % STOOL_TINTS.length] : '#ffffff'));
  });
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  scene.add(mesh);
  const open = groups.map(() => true);
  let checkAt = -1, level = 0, ready = false;
  function apply() {
    furniture.forEach((f, i) => {
      const g = f.group >= 0 ? groups[f.group] : null;
      const out = !g || open[f.group];
      let show = f.kind === 'stack' ? !out : f.kind === 'stool' || f.kind === 'stool42' || f.kind === 'table' ? out : true;
      // Altars are only dressing; a chess board stays, or the players at it would play on thin air.
      if (level >= 5 && f.kind === 'altar') show = false;
      mesh.setVisibleAt(i, show);
    });
  }
  return {
    mesh,
    /** Whether a group's stools are out (open, and dry or covered). */
    isOpen(group: number) { return open[group] ?? true; },
    update(time: number, hour: number, raining: boolean) {
      if (ready && time < checkAt) return;
      checkAt = time + 0.5;
      let changed = !ready;
      groups.forEach((g, i) => {
        const now = g.hours ? inHours(g.hours, hour) && (!raining || g.covered) : true;
        if (now !== open[i]) { open[i] = now; changed = true; }
      });
      ready = true;
      if (changed) apply();
    },
    /** Checks the hour again at the next update (after the clock jumps). */
    recheck() { checkAt = -Infinity; },
    /** Quality level 0-5: altars are left out at 5. */
    setDetail(next: number) { if (next !== level) { level = next; if (ready) apply(); } },
    dispose() { scene.remove(mesh); mesh.dispose(); },
  };
}
export type StreetFurniture = ReturnType<typeof createStreetFurniture>;

// ---- Wisps -------------------------------------------------------------------------------------------------

/** Steam off the pots and smoke off the incense: soft billboards that rise, grow and fade. */
export function createWisps(scene: THREE.Scene, capacity = 48) {
  const size = 32, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
    const a = Math.max(0, 1 - d) ** 2;
    data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute('fade', fade);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, color: '#ffffff', opacity: 0.55 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fade;\nvarying float vFade;')
      .replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mvPosition.xy += position.xy * length(instanceMatrix[0].xyz);
  gl_Position = projectionMatrix * mvPosition;
  vFade = fade;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n\tdiffuseColor.a *= vFade;');
  };
  mat.customProgramCacheKey = () => 'street-wisps';
  const mesh = new THREE.InstancedMesh(geometry, mat, capacity);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 2;
  scene.add(mesh);
  type Wisp = { x: number; y: number; z: number; born: number; life: number; grow: number; dark: number };
  const wisps: Wisp[] = [];
  let on = true;
  return {
    mesh,
    emit(x: number, y: number, z: number, time: number, smoke = false) {
      if (!on) return;
      if (wisps.length >= capacity) wisps.shift();
      wisps.push({ x, y, z, born: time, life: smoke ? 3.2 : 2.4, grow: smoke ? 0.35 : 0.55, dark: smoke ? 0.85 : 1 });
    },
    update(time: number) {
      let n = 0;
      for (let i = wisps.length - 1; i >= 0; i--) if (time - wisps[i].born > wisps[i].life) wisps.splice(i, 1);
      for (const w of wisps) {
        const t = (time - w.born) / w.life;
        const s = 0.12 + w.grow * t;
        mesh.setMatrixAt(n, tmpM.compose(tmpP.set(w.x + Math.sin(time * 1.3 + w.born) * 0.06 * t, w.y + 0.5 * (time - w.born), w.z), tmpQ.identity(), tmpS.setScalar(s)));
        fade.array[n] = Math.min(1, t * 5) * (1 - t) * w.dark;
        n++;
      }
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      fade.needsUpdate = true;
    },
    setEnabled(next: boolean) { on = next; if (!next) { wisps.length = 0; mesh.count = 0; mesh.visible = false; } },
    dispose() { scene.remove(mesh); mesh.dispose(); geometry.dispose(); mat.dispose(); texture.dispose(); },
  };
}
export type Wisps = ReturnType<typeof createWisps>;

