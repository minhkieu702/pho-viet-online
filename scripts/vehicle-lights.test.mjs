// node --experimental-transform-types --test scripts/vehicle-lights.test.mjs
// Vehicle lights at night (vehicle-lights.ts, night plan §7): the lamp tables sit on the models' own lamps, nothing is
// written by day, every vehicle gets its beam, spill and glints at night (motorbikes one head lamp, cruisers their
// flashing bar), out of view and past the fog nothing, zombie mode lights only the player's own vehicle, the fast
// presets drop beams, brake lamps brighten, boats show navigation lights (a sampan only with somebody aboard), and
// the buffer never overflows.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import * as THREE from 'three';

const tsFallback = (specifier) => /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier);
if (module.registerHooks) {
  module.registerHooks({
    resolve(specifier, context, next) {
      try { return next(specifier, context); } catch (e) {
        if (e?.code === 'ERR_MODULE_NOT_FOUND' && tsFallback(specifier)) return next(`${specifier}.ts`, context);
        throw e;
      }
    },
  });
} else {
  module.register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) {
    try { return await n(s, c); } catch (e) {
      if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) return n(s + '.ts', c);
      throw e;
    }
  }`)}`);
}

const VL = await import('../app/game/vehicle-lights.ts');
const VM = await import('../app/game/vehicle-models.ts');
const { vehicleLights: lights, ROAD_LAMPS, BOAT_LIGHTS, CAPACITY, OWN, SIREN_A } = VL;

const near = (actual, expected, eps, what) => assert.ok(Math.abs(actual - expected) <= eps, `${what}: ${actual} (want ${expected} ± ${eps})`);

// ---- The lamp tables against the models -------------------------------------------------------------------------

/** Centroid of a model's lamp vertices (finish glow 1) in one colour, on the +x side (or all of them), in front or behind. */
function lampAt(geometry, hex, side, front) {
  const p = geometry.getAttribute('position'), c = geometry.getAttribute('color'), f = geometry.getAttribute('finish');
  const want = new THREE.Color(hex);
  let n = 0, x = 0, y = 0, z = 0;
  for (let i = 0; i < p.count; i++) {
    if (f.getZ(i) !== 1) continue;
    if (Math.abs(c.getX(i) - want.r) > 1e-4 || Math.abs(c.getY(i) - want.g) > 1e-4 || Math.abs(c.getZ(i) - want.b) > 1e-4) continue;
    if (side && p.getX(i) <= 0.05) continue;
    if ((p.getZ(i) > 0) !== front) continue;
    n++; x += p.getX(i); y += p.getY(i); z += p.getZ(i);
  }
  return n ? [x / n, y / n, z / n] : null;
}
const HEAD_LAMP = '#fff4d6', TAIL_LAMP = '#e0392f';

test('every style\'s lamps sit on its model\'s head and tail lamps', () => {
  const models = {
    ...Object.fromEntries(['sedan', 'hatch', 'suv', 'taxi', 'pickup', 'police'].map((s) => [s, VM.carGeometry(s)])),
    ...Object.fromEntries(['scooter', 'cub', 'vespa', 'sport'].map((s) => [s, VM.motoGeometry(s)])),
    bus: VM.fleetGeometry('bus', { route: '03' }),
  };
  for (const [style, g] of Object.entries(models)) {
    const L = ROAD_LAMPS[style], twin = L.twin;
    const head = lampAt(g, HEAD_LAMP, twin, true), tail = lampAt(g, TAIL_LAMP, twin, false);
    assert.ok(head && tail, `${style}: found its lamps`);
    for (let k = 0; k < 3; k++) {
      near(L.head[k], head[k], 0.06, `${style} head lamp ${'xyz'[k]}`);
      near(L.tail[k], tail[k], 0.06, `${style} tail lamp ${'xyz'[k]}`);
    }
  }
  // The police light bar where vehicles.ts puts its boxes.
  const roof = VM.carSpec('police');
  assert.deepEqual([...ROAD_LAMPS.police.bar].map((v) => Math.round(v * 100) / 100), [0.26, Math.round((roof.roof + 0.13) * 100) / 100, Math.round(roof.roofMid * 100) / 100]);
});

// ---- A frame in a test scene ----------------------------------------------------------------------------------

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x222b3b, 120, 260);
scene.add(lights.mesh);
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 900);
camera.position.set(0, 22, -38);
camera.lookAt(0, 0, 10);
camera.updateMatrixWorld();
camera.updateProjectionMatrix();
let clock = 100;
const frame = (o = {}) => { clock += 1 / 60; lights.begin({ camera, night: 1, power: 1, wet: 0, level: 0, time: clock, ...o }); };
const matrix = (x, z, yaw, lean = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, -0.04, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, lean, 'YXZ')), new THREE.Vector3(1, 1, 1));
const attr = (name) => lights.mesh.geometry.getAttribute(name);
/** The instances written this frame: kind and colour. */
const written = () => {
  const A = attr('vlA'), D = attr('vlD'), out = [];
  for (let i = 0; i < lights.count; i++) out.push({ kind: A.getW(i), x: A.getX(i), y: A.getY(i), z: A.getZ(i), rgb: [D.getX(i), D.getY(i), D.getZ(i)] });
  return out;
};
const kinds = () => written().map((w) => ['beam', 'spill', 'glint', 'streak'][w.kind]).sort().join(',');

test('nothing by day: no instance written, the mesh hidden', () => {
  lights.reset();
  lights.begin({ camera, night: 0, power: 1, wet: 0, level: 0, time: clock });
  lights.vehicle({}, matrix(0, 10, 0), 'sedan', 8);
  lights.place({}, 3, 0, 10, 0, 0, 'scooter', 8);
  lights.end();
  assert.equal(lights.count, 0);
  assert.equal(lights.mesh.visible, false);
});

test('at night a car, a motorbike, a bus and a cruiser light up in one mesh', () => {
  lights.reset();
  frame();
  lights.vehicle({}, matrix(0, 10, 0), 'sedan', 8);
  assert.equal(kinds(), 'beam,glint,glint,glint,glint,spill', 'car: beam, tail spill, two head and two tail glints');
  frame();
  lights.vehicle({}, matrix(3, 10, 0, 0.3), 'scooter', 8);
  assert.equal(kinds(), 'beam,glint,glint', 'motorbike: one head lamp, one tail lamp');
  frame();
  lights.place({}, -4, 0, 20, Math.PI, 0, 'bus', 8);
  assert.equal(kinds(), 'beam,glint,glint,glint,glint,spill');
  frame();
  lights.vehicle({}, matrix(0, 15, 0), 'police', 0, SIREN_A);
  const w = written();
  assert.equal(w.filter((i) => i.kind === 1).length, 2, 'tail spill and the red/blue wash');
  assert.equal(w.filter((i) => i.kind === 2).length, 6, 'four lamps and the two halves of the light bar');
  lights.end();
  assert.equal(lights.mesh.visible, true);
  assert.equal(lights.mesh.count, w.length);
  const ranges = lights.mesh.geometry.getAttribute('vlA').data.updateRanges;
  assert.deepEqual(ranges, [{ start: 0, count: w.length * 16 }], 'only the frame\'s part goes to the GPU');
  for (const i of written()) for (const v of [i.x, i.y, i.z, ...i.rgb]) assert.ok(Number.isFinite(v), 'finite data');
});

test('the beam starts at the bumper and follows the heading; glints sit at the lamps (a leaning bike\'s too)', () => {
  lights.reset();
  frame();
  lights.vehicle({}, matrix(0, 10, Math.PI / 2), 'sedan', 8);
  const beam = written().find((w) => w.kind === 0);
  near(beam.x, ROAD_LAMPS.sedan.head[2], 1e-4, 'beam x: the nose, heading +x');
  near(beam.z, 10, 1e-4, 'beam z');
  near(beam.y, 0.05, 0.02, 'beam on the road');
  const B = attr('vlB');
  near(B.getX(0), 1, 1e-6, 'heading x'); near(B.getY(0), 0, 1e-6, 'heading z');
  frame();
  const lean = 0.4;
  lights.vehicle({}, matrix(0, 10, 0, lean), 'scooter', 8);
  const head = written().filter((w) => w.kind === 2).find((w) => w.z > 10);
  const h = ROAD_LAMPS.scooter.head;
  // A lean is a roll about the bike's own z axis: the lamp swings sideways and down.
  near(head.x, -Math.sin(lean) * h[1], 0.02, 'leaning lamp x');
  near(head.y, Math.cos(lean) * h[1] - 0.04, 0.02, 'leaning lamp y');
});

test('out of view, behind the camera or past the fog: nothing', () => {
  lights.reset();
  frame();
  lights.vehicle({}, matrix(0, -80, 0), 'sedan', 8);
  lights.vehicle({}, matrix(0, 330, 0), 'sedan', 8);
  lights.vehicle({}, matrix(200, 10, 0), 'sedan', 8);
  assert.equal(lights.count, 0);
  // The beam reaches into view though the body does not: the lamps are written.
  frame();
  lights.vehicle({}, matrix(0, -25, 0), 'sedan', 8);
  assert.ok(lights.count > 0, 'a car just behind the camera\'s view whose beam is in it');
});

test('zombie mode: the city is dark, the player\'s own bike and boat still light up', () => {
  lights.reset();
  frame({ power: 0 });
  lights.vehicle({}, matrix(0, 10, 0), 'sedan', 8);
  const cruise = new THREE.Group();
  cruise.position.set(0, -0.8, 30);
  lights.boat(cruise, 'cruise', 'none');
  assert.equal(lights.count, 0);
  lights.place({}, 0, 0, 10, 0, 0, 'cub', 8, OWN);
  assert.equal(kinds(), 'beam,glint,glint');
  // The player's beam reaches further than traffic's.
  assert.ok(attr('vlB').getZ(0) > ROAD_LAMPS.cub.beam[0] * 1.2, 'own beam longer');
  frame({ power: 0 });
  const hired = new THREE.Group();
  hired.position.set(2, -0.8, 30);
  lights.boat(hired, 'speedboat', 'none', OWN);
  assert.ok(written().some((i) => i.kind === 0) && written().some((i) => i.kind === 2), 'the hire boat the player drives: its lights and searchlight');
});

test('presets: Tối thiểu keeps the glints only; wet roads mirror the lamps on the better ones', () => {
  lights.reset();
  frame({ level: 5 });
  lights.vehicle({}, matrix(0, 10, 0), 'sedan', 8);
  assert.equal(kinds(), 'glint,glint,glint,glint');
  frame({ level: 0, wet: 1 });
  lights.vehicle({}, matrix(0, 10, Math.PI), 'sedan', 8);
  assert.ok(written().some((w) => w.kind === 3), 'streaks on a wet road');
  frame({ level: 4, wet: 1 });
  lights.vehicle({}, matrix(0, 10, Math.PI), 'sedan', 8);
  assert.ok(!written().some((w) => w.kind === 3), 'none at Low');
});

test('brake lamps: brighter standing or slowing hard than cruising', () => {
  lights.reset();
  const car = {};
  const tailRed = () => Math.max(...written().filter((w) => w.kind === 2 && w.z < 10).map((w) => w.rgb[0]));
  frame(); lights.vehicle(car, matrix(0, 10, 0), 'sedan', 10);
  frame(); lights.vehicle(car, matrix(0, 10, 0), 'sedan', 10);
  const cruising = tailRed();
  frame(); lights.vehicle(car, matrix(0, 10, 0), 'sedan', 9.5);
  near(tailRed() / cruising, 1.8, 0.01, 'slowing 30 m/s² lights the brake lamps');
  for (let i = 0; i < 30; i++) { frame(); lights.vehicle(car, matrix(0, 10, 0), 'sedan', 10); }
  near(tailRed(), cruising, 1e-6, 'off again once it pulls away');
  frame(); lights.vehicle(car, matrix(0, 10, 0), 'sedan', 0);
  near(tailRed() / cruising, 1.8, 0.01, 'standing');
});

test('boats: navigation lights by kind, reflections on the river, a sampan dark with nobody aboard', () => {
  lights.reset();
  const boat = (x, z, yaw) => { const g = new THREE.Group(); g.position.set(x, -0.8, z); g.rotation.set(0, yaw, 0, 'YXZ'); return g; };
  frame();
  lights.boat(boat(0, 40, 0), 'waterbus', 'none');
  const w = written();
  assert.equal(w.filter((i) => i.kind === 2).length, BOAT_LIGHTS.waterbus.filter((b) => b.r > 0).length, 'one glint per lamp');
  assert.ok(w.some((i) => i.kind === 3 && Math.abs(i.y - -0.77) < 0.01), 'reflections lie on the water');
  // Red to port (+x, the boat's left), green to starboard.
  const red = w.find((i) => i.kind === 2 && i.rgb[0] > 0.5 && i.rgb[1] < 0.3), green = w.find((i) => i.kind === 2 && i.rgb[1] > 0.5 && i.rgb[0] < 0.3);
  assert.ok(red.x > 0 && green.x < 0, 'port red, starboard green');
  frame();
  lights.boat(boat(0, 40, 0), 'sampan', 'none');
  assert.equal(lights.count, 0, 'a moored sampan with nobody aboard');
  lights.boat(boat(0, 40, 0), 'sampan', 'rower');
  assert.equal(kinds(), 'glint,streak', 'the rower\'s lantern and its reflection');
  frame();
  lights.boat(boat(0, 30, 0), 'speedboat', 'none', OWN);
  assert.ok(written().some((i) => i.kind === 0), 'the hire boat\'s searchlight on the water');
});

test('the buffer never overflows', () => {
  lights.reset();
  frame();
  for (let i = 0; i < 400; i++) lights.vehicle({}, matrix((i % 20) - 10, 5 + Math.floor(i / 20), 0), 'sedan', 8);
  assert.equal(lights.count, CAPACITY);
  lights.end();
  assert.equal(lights.mesh.count, CAPACITY);
});

test('one screen-blended program under its own key', () => {
  const m = lights.mesh.material;
  assert.equal(m.customProgramCacheKey(), 'vehicle-lights');
  assert.equal(m.blending, THREE.CustomBlending);
  assert.equal(m.blendSrc, THREE.OneMinusDstColorFactor);
  assert.equal(m.blendDst, THREE.OneFactor);
  assert.equal(m.depthWrite, false);
  assert.equal(m.fog, true, 'fades with the scene\'s fog (three\'s own fog uniforms)');
  for (const name of ['vlA', 'vlB', 'vlC', 'vlD']) assert.ok(m.vertexShader.includes(`attribute vec4 ${name};`), name);
});
