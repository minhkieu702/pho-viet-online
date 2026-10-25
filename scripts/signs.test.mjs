// node --experimental-transform-types --test scripts/signs.test.mjs
// The glyph sign atlas's pure helpers (app/game/map/signs.ts): the distance field the shader draws sharp text
// from, checked against an analytic disc, and pen placement with canvas-style kerning. The atlas itself needs a
// 2D canvas and is checked in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { penPositions, signedDistance } from '../app/game/map/signs.ts';

test('signedDistance matches the exact distance to a disc edge', () => {
  const W = 64, H = 64, R = 14.3, cx = 31.7, cy = 32.4, spread = 6;
  // Coverage as the canvas would draw it: 8x8 supersampled, in one channel of a two-channel image.
  const cover = new Uint8Array(W * H * 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) a += Math.hypot(x + (sx + 0.5) / 8 - cx, y + (sy + 0.5) / 8 - cy) < R ? 1 : 0;
    cover[(y * W + x) * 2 + 1] = Math.round((a / 64) * 255);
  }
  const out = new Uint8Array(W * H * 2);
  signedDistance({ data: cover, stride: W, step: 2, channel: 1 }, { data: out, stride: W, step: 2, channel: 0 }, 0, 0, W, H, spread);
  let max = 0, sum = 0, n = 0, edgeSum = 0, edgeN = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - R;
    if (Math.abs(d) > spread - 1) continue;
    const err = Math.abs((127.5 - out[(y * W + x) * 2]) / (255 / (2 * spread)) - d);
    max = Math.max(max, err); sum += err; n++;
    if (Math.abs(d) < 1.5) { edgeSum += err; edgeN++; }
  }
  assert.ok(n > 800, `band holds ${n} px`);
  console.log(`  disc: ${n} px within ${spread - 1} px of the edge, mean error ${(sum / n).toFixed(3)} px (${(edgeSum / edgeN).toFixed(3)} near the edge), max ${max.toFixed(3)} px`);
  assert.ok(max < 0.6, `max error ${max.toFixed(3)} px`);
  assert.ok(sum / n < 0.35, `mean error ${(sum / n).toFixed(3)} px`);
  assert.ok(edgeSum / edgeN < 0.25, `mean error near the edge ${(edgeSum / edgeN).toFixed(3)} px`);
  // The coverage channel it read is untouched, and nothing outside the destination channel was written.
  for (let i = 0; i < W * H; i++) assert.equal(out[i * 2 + 1], 0);
  // Far inside and far outside saturate.
  assert.equal(out[(32 * W + 32) * 2], 255);
  assert.equal(out[0], 0);
});

test('penPositions places glyphs by pair advances, as canvas kerning measures them', () => {
  const adv = { A: 10, V: 9, B: 8, AV: 17, VB: 17, AB: 18 };
  const { pens, width } = penPositions(['A', 'V', 'B'], (s) => adv[s]);
  assert.deepEqual([...pens], [0, 8, 17]);
  assert.equal(width, 25);
  const one = penPositions(['A'], (s) => adv[s]);
  assert.deepEqual([...one.pens], [0]);
  assert.equal(one.width, 10);
});
