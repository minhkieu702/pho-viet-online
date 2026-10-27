// node --experimental-transform-types --test scripts/buses.test.mjs
// Buses, the river bus and the moored boats (buses.ts, boats.ts, transit.ts's driving helpers): the 12 m body's course
// round every line stays on the asphalt and docks at the shelters, stop lines are found, the audit's transit entries
// cover the shelters and piers, the moorings lie in open water, and a few minutes of the live city: buses dock with
// their doors open, keep to the lights and their timetable, lane traffic queues behind them, the river bus berths.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';

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

const T = await import('../app/game/transit.ts');
const { LEGACY_ROADS: G } = await import('../app/game/map/roads-legacy.ts');
const { BUS_GEOMETRY: B, buildNetwork, busCourse, busPose, curvature, curveSpeed, pathAhead, pathPoint, signalPoints, shelterOf, shelterSign, stopTitle, AUDIT_ENTRIES, MOORINGS, STOP_SPECS, BERTH_Z } = T;
const net = buildNetwork();
const busLines = net.lines.filter((l) => l.mode === 'bus');
const onAsphalt = (x, z) => !!G.edgeAt(x, z, 0) || !!G.junctionAt(x, z);

test('each line\'s bus course keeps the whole 12 m body on the asphalt and docks it at every shelter', () => {
  for (const line of busLines) {
    const c = busCourse(line);
    assert.ok(Math.hypot(c.path.pts[0] - c.path.pts.at(-2), c.path.pts[1] - c.path.pts.at(-1)) < 1e-6, `${line.id}: course closed`);
    for (let s = 0; s < c.path.len; s += 0.5) {
      const p = busPose(c.path, s);
      for (const [u, v] of [[B.NOSE, B.HW], [B.NOSE, -B.HW], [-B.NOSE, B.HW], [-B.NOSE, -B.HW], [-B.REAR, B.HW], [-B.REAR, -B.HW], [0, B.HW], [0, -B.HW]]) {
        const x = p.x + p.hx * u - p.hz * v, z = p.z + p.hz * u + p.hx * v;
        assert.ok(onAsphalt(x, z), `${line.id}: body corner ${u},${v} off the asphalt at s=${s} (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
    // Docked: the centre at the stop, heading the way that serves it (front door level with the bench).
    line.visits.forEach((v, k) => {
      const p = busPose(c.path, c.docks[k]);
      assert.ok(Math.hypot(p.x - v.stop.x, p.z - v.stop.z) < 0.05, `${line.id}: docked at ${v.stop.id}`);
      assert.ok(p.hx * v.stop.hx + p.hz * v.stop.hz > 0.999, `${line.id}: facing the way at ${v.stop.id}`);
    });
    // The timetable's arc lengths map onto the course: a bus on rails at a stop stands where a driven one docks.
    line.visits.forEach((v, k) => assert.ok(Math.min(pathAhead(c.path, c.rearOf(v.s), c.docks[k]), pathAhead(c.path, c.docks[k], c.rearOf(v.s))) < 0.6, `${line.id}: rails and course agree at ${v.stop.id}`));
    // Left corners: the rear axle cuts inside (the guide is the front axle there); right corners: the rear is the guide.
    assert.ok(Math.max(...c.guide) === B.WHEELBASE && Math.min(...c.guide) === 0);
  }
});

test('stop lines: one for every signalled approach a line takes, met by the nose in path order', () => {
  for (const line of busLines) {
    const c = busCourse(line);
    const approaches = line.plan.filter((p) => { const e = G.edges[p.edge], n = p.dir > 0 ? e.b : e.a; return G.approaches.some((a) => a.node === n && a.edge === e.id && a.dir === p.dir); });
    assert.equal(c.signals.length, approaches.length, `${line.id}: stop lines`);
    assert.equal(signalPoints(line).length, approaches.length);
    c.signals.forEach((sig, i) => {
      if (i) assert.ok(sig.s > c.signals[i - 1].s);
      // The nose of a bus whose rear axle is at sig.s stands at the stop line: setback from the node centre.
      const p = busPose(c.path, sig.s), nose = { x: p.x + p.hx * B.NOSE, z: p.z + p.hz * B.NOSE }, n = G.nodes[sig.node];
      const along = (n.x - nose.x) * p.hx + (n.z - nose.z) * p.hz;
      assert.ok(along > 10.5 && along <= 11.6, `${line.id}: nose ${along.toFixed(2)} m from node ${sig.node}`);
    });
  }
});

test('curvature is positive turning right and corners slow the bus', () => {
  // East (+x) then south (+z): a right turn in game coordinates (x east, z south).
  const right = { pts: [0, 0, 10, 0, 10, 10], cum: [0, 10, 20], len: 20 };
  assert.ok(curvature(right, 10, 2) > 0);
  const left = { pts: [0, 0, 10, 0, 10, -10], cum: [0, 10, 20], len: 20 };
  assert.ok(curvature(left, 10, 2) < 0);
  const line = busLines[0], c = busCourse(line);
  let slow = Infinity, fast = 0;
  for (let s = 0; s < c.path.len; s += 3) { const v = curveSpeed(c.path, s, 0); slow = Math.min(slow, v); fast = Math.max(fast, v); }
  assert.ok(slow < 5 && fast === Infinity, `corner speeds ${slow.toFixed(1)}..${fast}`);
});

test('transit answers every shelter sign and waterbus pier the audit counts, and the signs list only lines that call', async () => {
  const { SCENERY } = await import('../app/game/city.ts');
  const shelters = SCENERY.props.filter((p) => p.kind === 'shelter');
  assert.equal(shelters.length, STOP_SPECS.filter((s) => s.mode === 'bus' && !s.planned).length);
  for (const p of shelters) assert.ok(AUDIT_ENTRIES.some((e) => e.covers.includes('transit') && Math.hypot(e.x - p.x, e.z - p.z) <= e.r), `shelter at ${p.x},${p.z}`);
  for (const d of SCENERY.docks.filter((q) => !q.rental)) assert.ok(AUDIT_ENTRIES.some((e) => e.covers.includes('transit') && Math.hypot(e.x - d.ring.x, e.z - d.ring.z) <= e.r), `pier ${d.name}`);
  for (const spec of STOP_SPECS.filter((s) => s.mode === 'bus')) {
    const at = shelterOf(spec), b = SCENERY.busStops.find((q) => Math.hypot(q.x - spec.wait.x, q.z - spec.wait.z) < 0.01);
    assert.ok(b && shelters.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < 0.01), `${spec.id}: shelter found from the bench`);
    const calling = busLines.filter((l) => l.visits.some((v) => v.stop.id === spec.id)).map((l) => l.id);
    assert.equal(shelterSign(net, spec.id), `TUYẾN ${calling.join(' • ')}`);
  }
  // Every line calls at the four An Hòa shelters ("TUYẾN 03 • 08 • 15"); 08 and 15 also at Bến Bạch Đằng (world.ts prints both).
  for (const spec of STOP_SPECS.filter((s) => s.mode === 'bus')) assert.equal(shelterSign(net, spec.id), spec.id === 'bach-dang' ? 'TUYẾN 08 • 15' : 'TUYẾN 03 • 08 • 15');
  assert.equal(stopTitle('BẾN ĐÒ AN HÒA'), 'Bến Đò An Hòa');
  assert.equal(stopTitle('TÀU BUÝT SÔNG BẠCH ĐẰNG – AN HÒA'), 'Tàu Buýt Sông Bạch Đằng – An Hòa');
});

test('the moored đò and ghe lie in open water, clear of the piers, the berths and the river bus course', async () => {
  const { TERRAIN } = await import('../app/game/map/terrain.ts');
  const wb = net.lines.find((l) => l.mode === 'waterbus');
  for (const m of MOORINGS) {
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    for (const k of [-3, 0, 3]) assert.ok(TERRAIN.navigable(m.x + fx * k, m.z + fz * k, 0.75), `${m.id} in open water`);
    for (let s = 0; s < wb.path.len; s += 1) { const p = pathPoint(wb.path, s); assert.ok(Math.hypot(p.x - m.x, p.z - m.z) > 6.5, `${m.id} clear of the river bus at s=${s}`); }
    assert.ok(m.z > BERTH_Z + 2.5 + 0.75 + 1, `${m.id} clear of a berthed river bus`);
  }
});

test('a few minutes of the live city: buses dock with their doors open, keep to the lights, the river bus berths', async () => {
  const THREE = await import('three');
  const { COLLIDERS, LAND, inRect } = await import('../app/game/city.ts');
  const { createVehicles, contact } = await import('../app/game/vehicles.ts');
  const { createBoats } = await import('../app/game/boats.ts');
  const { createBuses } = await import('../app/game/buses.ts');
  const { nodeLight } = await import('../app/game/signals.ts');
  const clear = (x, z, r) => {
    if (!inRect(LAND, x, z, r)) return false;
    for (const c of COLLIDERS) { const nx = Math.max(c.minX, Math.min(c.maxX, x)), nz = Math.max(c.minZ, Math.min(c.maxZ, z)); if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) return false; }
    return true;
  };
  const scene = new THREE.Scene(), vehicles = createVehicles(scene, clear), boats = createBoats(scene);
  let ride = null, placed = null, cash = 100;
  const buses = createBuses(scene, { vehicles, boats, pay: (k) => (cash >= k ? ((cash -= k), true) : false), notify: () => {}, place: (x, z) => { placed = { x, z }; }, fade: () => {}, skip: () => {}, riding: () => ride });
  buses.register({ add() {}, addProvider() { return () => {}; }, remove() {} }, { board: (p) => { ride = p; }, leave: () => { ride = null; } });
  const player = { x: -116, z: -18, car: null };
  let hours = 7.6, t = 0, docked = 0, redRuns = 0, rearEnds = 0, deepest = 0, piers = new Set(), boarded = null;
  const prev = new Map();
  const dt = 1 / 30;
  for (let i = 0; i < 240 / dt; i++) {
    t += dt; hours += dt / 60;
    if (i === Math.round(120 / dt)) { player.x = -80; player.z = -147; }
    boats.update(dt, t, null);
    vehicles.update(dt, t, player, []);
    buses.update(dt, t, { x: player.x, z: player.z, car: null, riding: false, zombie: false, hours, day: 0 }, [], null);
    for (const bus of buses.buses) {
      if (!bus.live || bus.phase === 'off') continue;
      if ((bus.phase === 'dwell' || bus.phase === 'layover') && bus.doors === 1 && bus.run.line.visits[bus.visit].stop.id === 'cong-an') docked++;
      for (const sig of bus.run.course.signals) {
        const a = pathAhead(bus.run.course.path, bus.s, sig.s), key = `${bus.key}:${sig.s}`, was = prev.get(key);
        if (was !== undefined && was < 6 && a > bus.run.course.path.len - 6 && nodeLight(sig.node, sig.group, t) === 'red' && nodeLight(sig.node, sig.group, t - 1.5) === 'red') redRuns++;
        prev.set(key, a);
      }
      if (i % 6) continue;
      // Lane traffic following a bus keeps off its tail.
      for (const c of vehicles.cars) {
        if (c.mode !== 'lane' || Math.abs(c.x - bus.x) > 9 || Math.abs(c.z - bus.z) > 9 || Math.sin(c.yaw) * bus.hx + Math.cos(c.yaw) * bus.hz < 0.9) continue;
        // Following along a street (out of the junctions, where turning traffic cuts in behind a bus).
        const behind = (c.x - bus.x) * bus.hx + (c.z - bus.z) * bus.hz < -B.NOSE && !G.junctionAt(c.x, c.z, 16) && !G.junctionAt(bus.x, bus.z, 16);
        const [hw, hl] = vehicles.halfSize(c.kind), ct = contact({ x: c.x, z: c.z, yaw: c.yaw, vx: 0, vz: 0, spin: 0, mass: 1, hw, hl }, { x: bus.x, z: bus.z, yaw: bus.yaw, vx: 0, vz: 0, spin: 0, mass: 1, hw: B.HW, hl: B.NOSE });
        if (behind && ct && ct.depth > 0.25) { rearEnds++; deepest = Math.max(deepest, ct.depth); }
      }
    }
    for (const b of boats.waterbuses) if (b.mode === 'docked' && b.run?.service) piers.add(b.run.stop);
    // Board the first bus that docks at the police shelter and ride it a stop.
    if (!boarded && i < 120 / dt) {
      boarded = buses.boardNearest(player.x, player.z);
      if (boarded) {
        const drawn = () => { let count = 0; scene.traverse((mesh) => { if (mesh.isInstancedMesh && mesh.visible) count += mesh.count; }); return count; };
        const visible = drawn(), snapshot = buses.stats(), passenger = ride;
        buses.setFirstPersonRideHidden(true);
        assert.equal(drawn(), visible - 5, 'first person hides the boarded bus body and four wheels only');
        assert.deepEqual(buses.stats(), snapshot, 'hiding the cabin does not change routes, timing or physics');
        assert.equal(ride, passenger, 'the passenger remains aboard');
        buses.setFirstPersonRideHidden(false);
        assert.equal(drawn(), visible, 'third person restores the boarded bus');
      }
    }
  }
  assert.ok(docked > 0, 'a bus stood at the CÔNG AN shelter with its doors open');
  assert.equal(redRuns, 0, 'no bus ran a red light');
  assert.equal(rearEnds, 0, `rear contacts ${rearEnds}, deepest ${deepest.toFixed(2)} m`);
  assert.deepEqual([...piers].sort(), ['wb-an-hoa', 'wb-bach-dang'], 'the river bus berthed at both piers');
  assert.ok(boarded, 'the player boarded a bus');
  assert.equal(cash, 100 - 7, 'the fare was paid once');
  void placed;
  buses.dispose(); boats.dispose(); vehicles.dispose();
});

test("on the wired map each bus line's rear axle follows its course and never jumps to another pass of the same street", async () => {
  // (last in the file: it installs the wired map for the rest of this process)
  await import('../app/game/map/world-map.ts');
  const { worldRoads } = await import('../app/game/map/world-types.ts');
  const lines = T.worldNetwork().lines.filter((l) => l.mode === 'bus');
  assert.ok(lines.length >= 3);
  for (const line of lines) {
    const t0 = performance.now(), c = busCourse(line, worldRoads().roads), ms = performance.now() - t0, n = Math.ceil(line.path.len);
    assert.ok(ms < 1500, `${line.id}: the course takes ${ms.toFixed(0)} ms`);
    let prev = c.rearOf(0);
    for (let i = 1; i < n; i++) {
      const r = c.rearOf(i);
      let step = r - prev;
      if (step < -c.path.len / 2) step += c.path.len;
      if (step > c.path.len / 2) step -= c.path.len;
      assert.ok(Math.abs(step) < 5, `${line.id}: the rear arc jumps ${step.toFixed(1)} m at line metre ${i}`);
      prev = r;
    }
  }
});
