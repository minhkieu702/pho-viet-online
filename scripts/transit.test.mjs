// node --experimental-transform-types --test scripts/transit.test.mjs
// Transit (critique step 13): bus lines 03/08/15 over today's road graph, the river bus and the planned ferry.
// Routes are connected loops on traffic edges that serve every stop from the curb side, timetables run
// forward and keep the headway rules, the riders' ledger respects capacity, and everything is deterministic.
// Imports pure modules (no three.js) except one cross-check against the fleet models; modules that import
// './x' without an extension (Vite style) are resolved by a hook that retries such specifiers as .ts.
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
const { LEGACY_ROADS: G, buildLegacyRoads } = await import('../app/game/map/roads-legacy.ts');
const { DOCKS, RIVER } = await import('../app/game/map/consts.ts');
const { SECONDS_PER_HOUR } = await import('../app/game/clock.ts');
const { buildNetwork, createTransit, pathPoint, LINE_SPECS, STOP_SPECS, BERTH_Z } = T;

const net = buildNetwork();
const BUS_LINES = ['03', '08', '15'];
const SHELTERS = ['ben-do', 'cong-an', 'truong-hoc', 'benh-vien'];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
/** Separating-axis test of two vehicles' footprints (half width hw, half length hl, heading hx,hz). */
function boxesOverlap(a, b, hw, hl) {
  const axes = [[a.hx, a.hz], [-a.hz, a.hx], [b.hx, b.hz], [-b.hz, b.hx]];
  const radius = (v, [ax, az]) => hl * Math.abs(v.hx * ax + v.hz * az) + hw * Math.abs(-v.hz * ax + v.hx * az);
  return axes.every((ax) => Math.abs((b.x - a.x) * ax[0] + (b.z - a.z) * ax[1]) < radius(a, ax) + radius(b, ax));
}
/** Node an edge leaves from / arrives at in a travel direction. */
const from = (e, dir) => (dir > 0 ? e.a : e.b), to = (e, dir) => (dir > 0 ? e.b : e.a);

test('the legacy network builds with no issues: 3 bus lines, the river bus, every shelter a stop', () => {
  assert.deepEqual(net.issues, []);
  assert.deepEqual(net.lines.map((l) => l.id), ['03', '08', '15', 'W1']);
  for (const id of SHELTERS) assert.ok(net.stops.has(id), id);
  // The planned ferry and its far landing stay out until asked for.
  assert.ok(!net.stops.has('do-an-hoa') && !net.stops.has('do-thu-thiem'));
  const all = buildNetwork(undefined, undefined, undefined, { planned: true });
  assert.deepEqual(all.issues, []);
  assert.deepEqual(all.lines.map((l) => l.id), ['03', '08', '15', 'W1', 'DN']);
});

test('shelters match the ones city.ts builds, and each stands beside a traffic edge served from the curb side', async () => {
  const { SCENERY } = await import('../app/game/city.ts');
  const specs = STOP_SPECS.filter((s) => s.mode === 'bus');
  assert.equal(specs.length, SCENERY.busStops.length);
  for (const b of SCENERY.busStops) {
    const spec = specs.find((s) => near(s.wait.x, b.x) && near(s.wait.z, b.z));
    assert.ok(spec, `shelter at ${b.x},${b.z} has a stop`);
    assert.ok(near(spec.yaw, b.yaw), `${spec.id} faces the road`);
  }
  for (const id of SHELTERS) {
    const st = net.stops.get(id), e = G.edges[st.edge];
    assert.ok(e.traffic && !e.closed && G.laneFor(e, st.dir, 'car'), `${id} is on a traffic edge`);
    // The bench is on the right of the serving direction, and the docked bus stands at the curb on that side.
    const seat = G.project(e, st.wait.x, st.wait.z), bus = G.project(e, st.x, st.z);
    assert.ok(seat.off * st.dir > 9, `${id}: shelter on the right of travel`);
    assert.ok(near(bus.off * st.dir, e.half - 1.25 - 0.75, 1e-6), `${id}: bus pulled in to the curb`);
    // Its front door (4.8 m ahead of the centre) is level with the bench.
    const door = { x: st.x + st.hx * 4.8, z: st.z + st.hz * 4.8 };
    assert.ok(Math.abs((door.x - st.wait.x) * st.hx + (door.z - st.wait.z) * st.hz) < 1e-6, `${id}: door at the shelter`);
    // The docked bus stays clear of the junctions at both ends of the block.
    for (const n of [G.nodes[e.a], G.nodes[e.b]]) assert.ok(Math.abs((n.x - st.x) * st.hx + (n.z - st.z) * st.hz) > 6 + n.radius, `${id}: clear of node ${n.id}`);
  }
});

test('a stop on a road without traffic, or a line asked to use one, is reported', () => {
  // A shelter on the stub west of the first junction, which runs into the fence and carries no traffic.
  const stub = { id: 'stub', name: 'STUB', mode: 'bus', wait: { x: -125, z: 9.95 }, yaw: Math.PI };
  const bad = buildNetwork(G, [{ ...LINE_SPECS[0], id: 'X', stops: ['ben-do', 'stub'] }], [...STOP_SPECS.filter((s) => s.mode === 'bus'), stub]);
  assert.ok(bad.issues.some((m) => m.startsWith('stop stub:') && m.includes('carries no traffic')), bad.issues.join('\n'));
  assert.ok(bad.issues.some((m) => m.startsWith('line X:')), bad.issues.join('\n'));
  assert.equal(bad.lines.length, 0);
  // A via point just past the terminus would send the bus off the wrong way: caught.
  const wrong = buildNetwork(G, [{ ...LINE_SPECS[0], id: 'Y', via: { 0: [{ x: -60, z: -111 }] } }]);
  assert.ok(wrong.issues.some((m) => m.startsWith('line Y:')), wrong.issues.join('\n'));
});

test('bus routes are closed, connected loops on traffic edges with no U-turns', () => {
  for (const id of BUS_LINES) {
    const line = net.lines.find((l) => l.id === id);
    const plan = line.plan.map((p) => ({ e: G.edges[p.edge], dir: p.dir }));
    assert.ok(plan.length >= 8, `${id} plan`);
    plan.forEach((p, i) => {
      const q = plan[(i + 1) % plan.length];
      assert.ok(p.e.traffic && !p.e.closed && G.laneFor(p.e, p.dir, 'car'), `${id}: edge ${p.e.id} carries traffic`);
      assert.equal(to(p.e, p.dir), from(q.e, q.dir), `${id}: edge ${p.e.id} joins edge ${q.e.id}`);
      assert.ok(!(p.e === q.e && p.dir !== q.dir), `${id}: no U-turn on edge ${p.e.id}`);
    });
    // The drawn path is closed and never strays from the asphalt: within the carriageway of some edge.
    const pts = line.path.pts;
    assert.ok(near(pts[0], pts[pts.length - 2]) && near(pts[1], pts[pts.length - 1]), `${id}: path closed`);
    for (let s = 0; s < line.path.len; s += 1.5) {
      const p = pathPoint(line.path, s);
      assert.ok(G.edgeAt(p.x, p.z, -0.5), `${id}: path on asphalt at s=${s.toFixed(1)} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
    // Right-hand traffic: away from the stops the bus keeps to the car lane right of the centre line.
    for (let s = 0; s < line.path.len; s += 7) {
      const p = pathPoint(line.path, s), hit = G.nearestEdge(p.x, p.z, 10);
      if (G.junctionAt(p.x, p.z, hit.edge.half + 3)) continue;
      const dir = p.hx * hit.hx + p.hz * hit.hz > 0 ? 1 : -1;
      assert.ok(hit.off * dir > 2.5 && hit.off * dir < 5.6, `${id}: right of the centre line at s=${s} (off ${(hit.off * dir).toFixed(2)})`);
    }
  }
});

test('every line calls at all four shelters in loop order, heading the way that serves them; each has its own terminus', () => {
  for (const id of BUS_LINES) {
    // The four An Hòa shelters in loop order; 08 and 15 also call at Bến Bạch Đằng downtown, between the hospital and the đò.
    const line = net.lines.find((l) => l.id === id), all = line.visits.map((v) => v.stop.id), ids = all.filter((s) => SHELTERS.includes(s)), k = ids.indexOf('ben-do');
    assert.deepEqual([...ids.slice(k), ...ids.slice(0, k)], SHELTERS, id);
    if (id !== '03') assert.equal(all[(all.indexOf('ben-do') + all.length - 1) % all.length], 'bach-dang', `${id} calls at Bến Bạch Đằng before the đò`);
    let prev = -1;
    for (const v of line.visits) {
      assert.ok(v.s > prev, `${id}: stops in path order`);
      prev = v.s;
      const p = pathPoint(line.path, v.s);
      assert.ok(Math.hypot(p.x - v.stop.x, p.z - v.stop.z) < 1e-6, `${id}: ${v.stop.id} on the path`);
      assert.ok(p.hx * v.stop.hx + p.hz * v.stop.hz > 0.999, `${id}: ${v.stop.id} served heading its way`);
    }
    // Every stop reaches every other one on this line, and the sign at each shelter lists all three lines.
    const tr = createTransit(net);
    for (const a of SHELTERS) for (const b of SHELTERS) if (a !== b) assert.ok(tr.rideTime(id, a, b) > 0, `${id}: ${a} -> ${b}`);
  }
  const tr = createTransit(net);
  for (const id of SHELTERS) assert.deepEqual(tr.linesAt(id), BUS_LINES);
  assert.equal(new Set(net.lines.filter((l) => l.mode === 'bus').map((l) => l.visits[0].stop.id)).size, 3);
});

test('the river bus calls only at the two docks without speedboat hire, berthed off the pier end, in open water', () => {
  const wb = net.lines.find((l) => l.id === 'W1');
  const docks = DOCKS.filter((d) => !d.rental);
  assert.deepEqual(wb.visits.map((v) => v.stop.berth.x).sort((a, b) => a - b), docks.map((d) => d.x).sort((a, b) => a - b));
  for (const v of wb.visits) {
    const dock = docks.find((d) => d.x === v.stop.berth.x);
    assert.deepEqual(v.stop.wait, dock.ring);
    assert.equal(v.stop.z, BERTH_Z);
    assert.ok(BERTH_Z + 2.5 < dock.pier.minZ, 'hull clears the pier end');
    assert.ok(Math.abs(v.stop.hx) > 0.999, 'berthed along the pier end');
  }
  for (let s = 0; s < wb.path.len; s += 2) {
    const p = pathPoint(wb.path, s);
    assert.ok(p.x - 11 > RIVER.minX && p.x + 11 < RIVER.maxX && p.z - 2.5 > RIVER.minZ && p.z + 2.5 <= docks[0].pier.minZ + 1e-9, `W1 in the river at s=${s}`);
  }
  // The planned ferry keeps clear of a river bus docked at the An Hòa pier end.
  const dn = buildNetwork(undefined, undefined, undefined, { planned: true }).lines.find((l) => l.id === 'DN');
  const hull = { minX: -80 - 11, maxX: -80 + 11, minZ: BERTH_Z - 2.5, maxZ: BERTH_Z + 2.5 };
  for (let s = 0; s < dn.path.len; s += 0.5) {
    const p = pathPoint(dn.path, s);
    assert.ok(!(p.x > hull.minX - 0.75 && p.x < hull.maxX + 0.75 && p.z > hull.minZ - 0.75 && p.z < hull.maxZ + 0.75), `ferry clear of the berthed river bus at s=${s}`);
  }
});

test('timetables run forward and keep the headway rules: none 23:00-05:00, denser at rush hours', () => {
  const tr = createTransit(net);
  for (const line of net.lines) {
    const spec = line.spec, runH = line.run / SECONDS_PER_HOUR;
    for (const day of [0, 1, 7]) {
      const trips = tr.trips(line.id, day);
      assert.ok(trips.length >= 4, `${line.id} runs`);
      const open = Math.min(...spec.headways.map((b) => b.from)), close = Math.max(...spec.headways.map((b) => b.to));
      trips.forEach((trip, i) => {
        assert.ok(trip.depart >= day * 24 + open - 1e-9 && trip.end <= day * 24 + close + 1e-9, `${line.id} trip ${i} within service`);
        assert.ok(near(trip.end - trip.depart, runH, 1e-9));
        if (i) {
          // The gap is the headway of the band the earlier trip left in.
          const h = trips[i - 1].depart - day * 24, band = spec.headways.find((b) => h >= b.from - 1e-9 && h < b.to - 1e-9);
          assert.ok(near((trip.depart - trips[i - 1].depart) * 60, band.every, 1e-6), `${line.id} headway at ${h.toFixed(2)}`);
        }
      });
      if (line.mode === 'bus') for (const trip of trips) assert.ok(trip.depart % 24 >= 5 && trip.end % 24 <= 23 && trip.end - day * 24 <= 23, `${line.id}: no bus 23:00-05:00`);
    }
    // Calls within a trip are strictly in time order.
    line.visits.forEach((v, k) => {
      assert.ok(v.depart >= v.arrive);
      if (k) assert.ok(v.arrive > line.visits[k - 1].depart, `${line.id} visit ${k}`);
    });
    assert.ok(line.run > line.visits[line.visits.length - 1].depart);
    if (line.mode === 'bus') {
      assert.ok(tr.headway(line.id, 7.5) < tr.headway(line.id, 12), `${line.id}: morning rush denser`);
      const late = tr.headway(line.id, 21);
      assert.ok(late === null || tr.headway(line.id, 17.5) < late, `${line.id}: evening rush denser`);
      for (const h of [23, 23.5, 0, 2, 4.99]) assert.equal(tr.headway(line.id, h), null, `${line.id}: no service at ${h}`);
    }
    // headway() promises only what the timetable runs: a band it gives a headway for has a departure still to come,
    // and once a band's last trip has left (or none fits in it) there is no headway.
    const day0 = tr.trips(line.id, 0);
    for (const band of spec.headways) {
      for (let h = band.from; h < band.to; h += 0.25) {
        const left = day0.some((t) => t.depart >= h - 1e-9 && t.depart < band.to);
        assert.equal(tr.headway(line.id, h) !== null, left, `${line.id}: headway at ${h} vs departures left in its band`);
      }
      if (tr.headway(line.id, band.from) !== null) assert.ok(day0.some((t) => t.depart >= band.from && t.depart < band.to), `${line.id}: a departure in ${band.from}-${band.to}`);
    }
  }
  // Arrivals are sorted, in the future, and nothing docks at a shelter between 23:00 and 05:00.
  for (const stop of SHELTERS) {
    for (const t of [0.5, 4, 6.2, 8, 12.3, 17.9, 22.95, 47.2]) {
      const list = tr.arrivals(stop, t, 6);
      assert.equal(list.length, 6);
      list.forEach((a, i) => {
        assert.ok(a.leaves > t && a.at <= a.leaves);
        if (i) assert.ok(a.leaves >= list[i - 1].leaves);
        const h = a.at % 24;
        assert.ok(h >= 5 && h < 23, `${stop}: ${a.line} at ${h.toFixed(2)}`);
        assert.ok(near(a.eta, Math.max(0, (a.at - t) * SECONDS_PER_HOUR), 1e-6));
      });
    }
  }
  // Late at night the next bus is the first of the morning.
  assert.ok(near(tr.arrivals('ben-do', 23.5, 1)[0].at, 24 + 5));
  // Today's map has room for 3 buses per line at most, and 2 river buses as now.
  for (const id of BUS_LINES) assert.ok(tr.fleet(id) <= 3, `${id} fleet ${tr.fleet(id)}`);
  assert.equal(tr.fleet('W1'), 2);
});

test('vehicles on rails: positions follow the path, dwell at stops, never run off the timetable', () => {
  const tr = createTransit(net);
  for (const line of net.lines) {
    let seen = 0;
    for (let t = 4.5; t < 23.5; t += 0.07) {
      const vs = tr.vehicles(line.id, t);
      for (const v of vs) {
        seen++;
        const p = pathPoint(line.path, v.s);
        assert.ok(Math.hypot(p.x - v.x, p.z - v.z) < 1e-6);
        assert.ok(v.speed >= 0 && v.speed <= line.spec.cruise + 1e-6, `${v.key} speed ${v.speed}`);
        assert.ok(v.load >= 0 && v.load <= line.spec.capacity);
        // Standing at its stop: at the berth, or queued behind another bus there.
        if (v.phase !== 'run') assert.ok((((line.visits[v.visit].s - v.s) % line.path.len) + line.path.len) % line.path.len < 3 * (line.spec.length + 2) && v.speed === 0, `${v.key} at its stop`);
        if (v.phase === 'run') assert.ok(v.trip.depart <= t && t < v.trip.end);
        if (line.mode === 'bus') assert.ok(t % 24 >= 5 - line.spec.layover / SECONDS_PER_HOUR - 1e-9 && t % 24 < 23);
      }
      // Two vehicles of a line never overlap (oriented boxes of their hull or body).
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) assert.ok(!boxesOverlap(vs[i], vs[j], line.spec.hw, line.spec.length / 2), `${line.id} ${vs[i].key}/${vs[j].key} overlap at ${t.toFixed(2)}`);
    }
    assert.ok(seen > 100, `${line.id} vehicles seen`);
  }
  // Across lines too: buses of 03, 08 and 15 share all four shelters and the terminus.
  for (let t = 4.5; t < 23.5; t += 1 / 120) {
    const vs = tr.fleetAt(t).filter((v) => v.line !== 'W1');
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) assert.ok(!boxesOverlap(vs[i], vs[j], 1.25, 6), `${vs[i].key}/${vs[j].key} overlap at ${t.toFixed(4)} (${vs[i].phase} s=${vs[i].s.toFixed(1)}, ${vs[j].phase} s=${vs[j].s.toFixed(1)})`);
  }
  // A trip moves forward monotonically between its calls.
  const line = net.lines[0], trip = tr.trips('03', 0)[3];
  let last = -1;
  for (let t = trip.depart; t < trip.end; t += 0.01) {
    const v = tr.vehicles('03', t).find((x) => x.trip === trip);
    const s = v.phase === 'layover' ? 0 : v.s;
    assert.ok(s >= last - 1e-6, `03 forward at ${t}`);
    last = s;
  }
  assert.ok(last > line.path.len * 0.95);
});

test('boarding: waiting riders fill a docked bus up to its capacity, the rest wait for the next', () => {
  const tr = createTransit(net);
  const t0 = 11.9;
  tr.update(t0);
  const next = tr.arrivals('cong-an', t0, 2);
  const want = 70;
  for (let i = 0; i < want; i++) tr.wait(`npc${i}`, 'cong-an', { to: 'truong-hoc' }, t0);
  const events = tr.update(next[0].at + 1e-6);
  const boarded = events.filter((e) => e.type === 'board'), refused = events.filter((e) => e.type === 'full');
  const bus = net.lines.find((l) => l.id === next[0].line);
  assert.ok(boarded.length > 0 && boarded.length < want, `boarded ${boarded.length}`);
  assert.equal(boarded.length + refused.length, want);
  assert.ok(boarded.every((e) => e.vehicle === next[0].vehicle && e.fare === bus.spec.fare));
  // First come, first served.
  assert.deepEqual(boarded.map((e) => e.rider), Array.from({ length: boarded.length }, (_, i) => `npc${i}`));
  const docked = tr.vehicle(next[0].vehicle, next[0].at + 1e-4);
  assert.equal(docked.load, bus.spec.capacity, 'the bus left full');
  // The full bus refuses the player at the door; the next bus takes them.
  assert.deepEqual(tr.board('player', next[0].vehicle, next[0].at + 1e-4), { ok: false, reason: 'full' });
  // Riders get off at their destination.
  const ride = tr.update(next[0].leaves + 1.5);
  const off = ride.filter((e) => e.type === 'alight' && e.vehicle === next[0].vehicle);
  assert.equal(off.length, boarded.length);
  assert.ok(off.every((e) => e.stop === 'truong-hoc' && e.reason === 'dest'));
  const at = net.lines.find((l) => l.id === next[0].line).visits.findIndex((v) => v.stop.id === 'truong-hoc');
  // At a line's own terminus the call is the end of the trip.
  assert.ok(off.every((e) => near(e.t, at === 0 ? next[0].trip.end : next[0].trip.depart + bus.visits[at].arrive / SECONDS_PER_HOUR, 1e-9)));
  // Nobody is left behind for long: everyone boards some later bus.
  tr.update(next[0].leaves + 8);
  assert.equal(tr.riders().filter((r) => r.state === 'waiting').length, 0);
});

test('the player boards only a docked vehicle, pays the fare once, rings the bell and fast-travels', () => {
  const tr = createTransit(net);
  tr.update(9);
  const a = tr.arrivals('ben-do', 9, 1)[0];
  const moving = tr.vehicles(a.line, 9).find((v) => v.phase === 'run');
  if (moving) assert.deepEqual(tr.board('player', moving.key, 9), { ok: false, reason: 'not-docked' });
  assert.deepEqual(tr.board('player', 'ZZ-1', 9), { ok: false, reason: 'unknown' });
  const docked = tr.docked('ben-do', a.at - 1e-6);
  assert.ok(docked.some((v) => v.key === a.vehicle), 'waiting at the terminus with doors open');
  const got = tr.board('player', a.vehicle, a.at - 1e-6);
  assert.equal(got.ok, true);
  assert.equal(got.fare, 7);
  assert.equal(got.stop, 'ben-do');
  assert.deepEqual(tr.board('player', a.vehicle, a.at), { ok: false, reason: 'aboard' });
  // A monthly pass (vé tháng) rides free.
  const b = tr.board('student', a.vehicle, a.at - 1e-6, { pass: true });
  assert.equal(b.ok && b.fare, 0);
  // Moving: cannot step off; the bell gets the player off at the next stop.
  assert.equal(tr.alight('player', a.at + 0.05), null);
  assert.equal(tr.ring('player'), true);
  const ev = tr.update(a.at + 1);
  const off = ev.find((e) => e.rider === 'player' && e.type === 'alight');
  assert.ok(off && off.stop === 'cong-an' && off.reason === 'bell');
  assert.equal(tr.rider('player'), null);
  // Fast travel: aboard again, ride to the next stop; the vehicle gets there at the scheduled arrival.
  const c = tr.arrivals('cong-an', a.at + 1, 1)[0];
  tr.update(c.at + 1e-6);
  assert.equal(tr.board('player', c.vehicle, c.at + 1e-6).ok, true);
  const line = net.lines.find((l) => l.id === c.line), k = (c.visit + 1) % line.visits.length, dest = line.visits[k].stop.id;
  const when = tr.rideTo('player', dest, c.at + 1e-6);
  assert.ok(near(when, k === 0 ? c.trip.end : c.trip.depart + line.visits[k].arrive / SECONDS_PER_HOUR, 1e-9));
  const end = tr.update(when);
  assert.ok(end.some((e) => e.rider === 'player' && e.type === 'alight' && e.stop === dest && e.reason === 'dest' && near(e.t, when, 1e-9)));
});

test('riding past a terminus: on with the same bus, or a change to the next departure, as rideTo says', () => {
  for (const id of BUS_LINES) {
    const line = net.lines.find((l) => l.id === id), n = line.visits.length, last = line.visits[n - 1].stop.id, past = line.visits[1].stop.id;
    for (const t0 of [7, 11, 16, 19.2]) {
      const tr = createTransit(net);
      tr.update(t0);
      const a = tr.arrivals(last, t0, 3).find((x) => x.line === id);
      if (!a) continue;
      tr.update(a.at + 1e-6);
      assert.equal(tr.board('p', a.vehicle, a.at + 1e-6).ok, true);
      const when = tr.rideTo('p', past, a.at + 1e-6);
      if (when === null) { assert.ok(a.trip.end > 23 - 4, 'only the last trips of the day go nowhere'); continue; }
      const ev = tr.update(when).filter((e) => e.rider === 'p');
      const off = ev.at(-1);
      assert.ok(off.type === 'alight' && off.stop === past && off.reason === 'dest' && near(off.t, when, 1e-9), `${id} from ${t0}: ${JSON.stringify(ev.map((e) => [e.type, e.stop, e.reason]))}`);
      const changed = ev.filter((e) => e.type === 'alight' && e.reason === 'end');
      if (changed.length) assert.ok(ev.some((e) => e.type === 'board' && e.t >= changed[0].t), 'changed buses at the terminus');
    }
  }
});

test('at the end of service everyone still aboard gets off at the terminus', () => {
  const tr = createTransit(net);
  const last = tr.trips('03', 0).at(-1);
  tr.update(last.depart - 0.01);
  tr.wait('late', 'ben-do', { lines: ['03'] });
  const ev = tr.update(last.end + 0.01);
  const on = ev.find((e) => e.type === 'board' && e.rider === 'late');
  assert.ok(on && on.vehicle === `03-${last.vehicle + 1}`);
  const off = ev.find((e) => e.type === 'alight' && e.rider === 'late');
  assert.ok(off && off.reason === 'end' && off.stop === 'ben-do' && near(off.t, last.end, 1e-9));
});

test('a long time skip (sleeping, a day passing) still runs every call in between', () => {
  const step = createTransit(net), skip = createTransit(net);
  for (const tr of [step, skip]) { tr.update(5.5); tr.wait('npc', 'cong-an', { to: 'benh-vien' }, 5.5); }
  const a = [];
  for (let t = 5.5; t <= 31; t += 0.25) a.push(...step.update(t));
  const b = skip.update(31);
  const key = (e) => [e.type, e.t.toFixed(9), e.vehicle, e.stop, e.rider ?? ''].join(' ');
  assert.deepEqual(b.map(key), a.map(key));
  assert.ok(b.some((e) => e.type === 'alight' && e.rider === 'npc' && e.stop === 'benh-vien'));
  assert.ok(b.filter((e) => e.type === 'depart' && e.stop === 'ben-do').length > 20, 'a whole day of departures');
});

test('deterministic: the same graph builds the same network, and the same calls give the same events', () => {
  const snap = (n) => JSON.stringify(n.lines.map((l) => ({ id: l.id, pts: l.path.pts.map((v) => +v.toFixed(9)), visits: l.visits.map((v) => [v.stop.id, +v.s.toFixed(9), +v.arrive.toFixed(9), +v.depart.toFixed(9)]), run: +l.run.toFixed(9), plan: l.plan })));
  assert.equal(snap(buildNetwork()), snap(buildNetwork(buildLegacyRoads())));
  const run = () => {
    const tr = createTransit(buildNetwork());
    tr.update(6);
    for (let i = 0; i < 40; i++) tr.wait(i, SHELTERS[i % 4], { to: SHELTERS[(i + 2) % 4] }, 6);
    const out = [];
    for (let t = 6; t < 23.5; t += 0.37) out.push(...tr.update(t).map((e) => [e.type, +e.t.toFixed(9), e.line, e.vehicle, e.stop, e.rider ?? '']));
    return { out, trips: BUS_LINES.map((id) => tr.trips(id, 3)), loads: tr.vehicles('03', 17.6).map((v) => v.load) };
  };
  assert.deepEqual(run(), run());
  // A different seed changes only the background crowd.
  const a = createTransit(net, { seed: 1 }), b = createTransit(net, { seed: 2 });
  assert.deepEqual(a.trips('08', 0), b.trips('08', 0));
  assert.notDeepEqual(a.vehicles('03', 17.6).map((v) => v.load), b.vehicles('03', 17.6).map((v) => v.load));
});

test('the timetable scales with the clock: a slower clock needs fewer vehicles', () => {
  const fast = createTransit(net), slow = createTransit(net, { secondsPerHour: SECONDS_PER_HOUR * 3 });
  for (const id of BUS_LINES) {
    assert.ok(slow.fleet(id) <= fast.fleet(id));
    assert.ok(slow.trips(id, 0).length >= fast.trips(id, 0).length, 'more trips fit into the service day');
  }
});

test('the docked bus door matches the city bus model', async () => {
  const { FLEET } = await import('../app/game/vehicle-models.ts');
  const bus = FLEET.bus;
  for (const id of BUS_LINES) {
    const spec = LINE_SPECS.find((l) => l.id === id);
    assert.equal(spec.door, bus.doors[0].at[2], 'front door ahead of the centre');
    assert.equal(spec.hw, bus.hw);
    assert.equal(spec.length, bus.length);
  }
  // Doors open on the curb side (-x, the right in right-hand traffic).
  assert.ok(bus.doors.every((d) => d.side === -1 && d.at[0] < 0));
  assert.ok(bus.driver.hip[0] > 0, 'driver on the left');
});
