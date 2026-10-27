import * as THREE from 'three';
import { SECONDS_PER_HOUR } from './clock';
import { groundHeight } from './map/terrain';
import { worldRoads } from './map/world-types';
import { nodeLight } from './signals';
import { playHorn } from './audio';
import {
  BUS_GEOMETRY as BG, MOORINGS, busCourse, busPose, createTransit, curvature, curveSpeed, demand, pathAhead, shelterOf, stopTitle, worldNetwork,
  type BusCourse, type TransitLine, type TransitStop, type Trip, type VehicleState,
} from './transit';
import { FLEET, fleetGeometry, fleetWheelGeometry, vehicleMaterial } from './vehicle-models';
import {
  ARM, BODY_SCALE, FIGURE, FigureBatch, HAND, TORSO, chestMatrix, deriveStyle, figureGeometry, figureMaterial, gait, limbMatrix, newGait, palettesOf,
  poseArm, sideX, swingCode, type ArmPose, type FigurePalettes, type FigureStyle,
} from './figures';
import { SAMPAN_SEAT, WATERBUS_SEAT, type Boat, type Boats } from './boats';
import type { Car, CarKind } from './vehicles';
import type { Entry, PromptView, Registry } from './interact';
import { vehicleLights } from './vehicle-lights';

/**
 * Public transport on the street and the river (design-real 7), on transit.ts's timetables:
 * - City buses of lines 03, 08 and 15: a 12 m body driven along its line (busCourse: the rear axle on the path, the
 *   nose swinging wide through turns) near the player, on rails (exactly where the timetable puts it) far away. A
 *   driven bus keeps to the lights and stop lines of signals.ts, slows for curves, waits for people and vehicles in
 *   its way, edges past anything standing in its lane when the other lane is clear, dwells at the shelters with its
 *   doors open while riders get off and on, and catches up when it runs late. Lane traffic sees it through
 *   vehicles.registerObstacle: queued behind and waited for while it drives, passed while it stands at a stop.
 * - The river bus (line W1): boats.ts drives its boats along their course to the timetable, alongside each pier.
 * - The moored đò at the An Hòa pier (sit in it, or be rowed to Bến Bạch Đằng) and the fishing ghe off the promenade.
 * The player waits, boards (paying the fare), rides as a passenger (game.ts boardPassenger; E rings the bell or
 * gets off at a stop) and reads the timetable at shelters and piers. Riders of their own wait at the stops, board
 * and get off; they come and go out of the player's sight.
 */

type View = { x: number; z: number; car: Car | null; riding: boolean; zombie: boolean; hours: number; day: number };
type Walking = { x: number; z: number; body?: boolean };
type RideView = { title: string; next: string; hint: string; stops: { name: string; eta: number }[] };
type Provider = { seat(): { x: number; y: number; z: number; yaw: number }; label: string; onLeave(): void; pose?: 'chair' | 'pillion' | 'hidden'; card?: () => RideView };
type Passengers = { board(p: Provider): void; leave(): void };
/** What the game lends transit: traffic, the river, money, putting the player down, the fade and the clock. */
export type TransitHost = {
  vehicles: {
    cars: Car[]; halfSize(kind: CarKind): [number, number];
    /** The vehicles that are entities this frame (vehicles.ts `live`: the fleet and the woken parked ones); `cars` when absent. */
    live?: readonly Car[];
    registerObstacle(id: string, x: number, z: number, hx: number, hz: number, yaw: number, follow?: boolean, speed?: number): void; clearObstacle(id: string): void;
  };
  boats: Boats;
  /** Takes a fare; false when the player cannot pay. */
  pay(amount: number): boolean;
  notify(text: string, ms?: number): void;
  /** Puts the player down at a spot (on land, a pier, or in the water) after getting off. */
  place(x: number, z: number, yaw: number): void;
  /** The screen dips to black for a moment (fast travel). */
  fade(): void;
  /** Moves the clock on by game hours (fast travel). */
  skip(hours: number): void;
  /** The ride game.ts has the player on now, to notice it ended some other way (a teleport, an arrest). */
  riding(): unknown;
  say?(key: string, text: string, at: () => { x: number; y: number; z: number } | null): void;
};

const SPH = SECONDS_PER_HOUR;
/** A bus is driven within LIVE_NEAR metres of the player and back on rails beyond LIVE_FAR (once out of sight). */
const LIVE_NEAR = 230, LIVE_FAR = 290;
/** Cruise, catch-up speed when late, acceleration, service and hard braking (m/s, m/s²). */
const CRUISE = 9, CATCH_UP = 11, ACCEL = 1.2, BRAKE = 1.5, HARD = 4.5;
/** Doors open for at least this long at a stop; they take DOOR_TIME to open or close. */
const MIN_DWELL = 5, DOOR_TIME = 1.0, MAX_EXTRA = 8;
/** Fares (thousand đồng): bus, river bus, and the đò to Bến Bạch Đằng. */
const FARE = { bus: 7, waterbus: 15, do: 15 } as const;
/** The đò's boatman is at his oar 05:00-21:00; the ghe's owner fishes from it 16:00-19:00. */
const BOATMAN = [5, 21], FISHING = [16, 19];
/** The đò ride to Bến Bạch Đằng: metres and the boatman's pace (the clock moves on by the time it takes). */
const DO_TRIP = { meters: 275, pace: 3 };
const MAX_WALKERS = 40;
const FRONT_DOOR = FLEET.bus.doors[0].at[2], MID_DOOR = FLEET.bus.doors[1].at[2];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const inHours = (h: number, [a, b]: number[]) => h >= a && h < b;
const fmtEta = (s: number) => (s < 50 ? `${Math.max(5, Math.round(s / 5) * 5)} giây` : `${Math.max(1, Math.round(s / 60))} phút`);

type LineRun = { line: TransitLine; course: BusCourse; meshes: THREE.InstancedMesh[]; counts: number[] };
type Phase = 'off' | 'run' | 'dwell' | 'layover' | 'depot';
type Bus = {
  key: string; run: LineRun; v: number;
  phase: Phase; live: boolean; trip: Trip | null; visit: number;
  /** Rear-axle arc on the course, speed, sideways offset (right of the course) and where it is steering to. */
  s: number; speed: number; lat: number; latT: number;
  /** Doors (0 shut .. 1 open) and where they are going. */
  doors: number; doorsWant: number;
  /** Earliest departure (game hours), when it docked (s), whether this is its last call before the depot. */
  leaveAt: number; dockedAt: number; last: boolean; approach: boolean;
  /** Seconds behind the timetable at its last departure. */
  late: number;
  /** Why it is held up, for how long, the last horn, and something standing in its way it is getting round. */
  wait: string; by: string; stuck: number; honkAt: number; still: number; passing: { x: number; z: number } | null;
  x: number; z: number; hx: number; hz: number; yaw: number; spin: number; steer: number;
  /** Riders still walking to its door, and still to get off. */
  boarding: number; alighting: number; alightAt: number;
  depotSince: number;
};
type Ob = { x: number; z: number; hx: number; hz: number; vx: number; vz: number; half: number; r: number; still: boolean; who: 'car' | 'walker' | 'player' | 'bus' | 'body'; bus?: Bus; car?: Car };

type Mode = 'come' | 'wait' | 'board' | 'leave';
type Walker = {
  style: FigureStyle; look: FigurePalettes; x: number; z: number; yaw: number; speed: number; pace: number; go: number; stride: number;
  mode: Mode; path: { x: number; z: number }[]; site: Site; slot: number; vehicle: string | null; delay: number; born: number; gone: boolean;
};
/** Where riders wait for a line: slots to stand in, where they come from and go to along the footway. */
type Site = { id: string; mode: 'bus' | 'waterbus'; x: number; slots: { x: number; z: number; yaw: number }[]; taken: (Walker | null)[]; from: { x: number; z: number }[]; next: number };

const SHIRTS = ['#e8d6a8', '#9fb4d6', '#f0f0ea', '#d18469', '#86a799', '#6f86a8', '#d4b164', '#c96f6f', '#bca5b7', '#7fa37a'];
const PANTS = ['#2f3a48', '#3f4d5c', '#536c69', '#6d5d4f', '#2b2f36', '#4a4038'];
const SKINS = ['#d3a179', '#c58f69', '#e0b48e', '#b98260'];
const ROLES = ['worker', 'student', 'retiree', 'worker', 'vendor'] as const;

export function createBuses(scene: THREE.Scene, host: TransitHost) {
  // The live map's network (map/world-types.ts): today's three lines, run on into the wired districts.
  const roads = worldRoads().roads;
  const network = worldNetwork();
  const transit = createTransit(network);
  const { material, lamps } = vehicleMaterial();
  const busLines = network.lines.filter((l) => l.mode === 'bus');
  const water = network.lines.find((l) => l.mode === 'waterbus') ?? null;
  const runs: LineRun[] = busLines.map((line) => {
    const fleet = Math.max(1, transit.fleet(line.id, 0));
    const meshes = [false, true].map((open) => {
      const mesh = new THREE.InstancedMesh(fleetGeometry('bus', { route: line.id, doorsOpen: open, paint: FLEET.bus.paint, wheels: false }), material, fleet + 1);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    });
    return { line, course: busCourse(line, roads), meshes, counts: [0, 0] };
  });
  const buses: Bus[] = runs.flatMap((run) => Array.from({ length: Math.max(1, transit.fleet(run.line.id, 0)) }, (_, v): Bus => ({
    key: `${run.line.id}-${v + 1}`, run, v, phase: 'off', live: false, trip: null, visit: 0, s: 0, speed: 0, lat: 0, latT: 0, doors: 0, doorsWant: 0,
    leaveAt: 0, dockedAt: 0, last: false, approach: false, late: 0, wait: '', by: '', stuck: 0, honkAt: 0, still: 0, passing: null,
    x: 0, z: 0, hx: 0, hz: 1, yaw: 0, spin: 0, steer: 0, boarding: 0, alighting: 0, alightAt: 0, depotSince: 0,
  })));
  const byKey = new Map(buses.map((b) => [b.key, b]));
  // Spinning wheels (front axle steering), one instanced draw per axle.
  const axles = FLEET.bus.axles;
  const wheels = axles.map((_, i) => {
    const mesh = new THREE.InstancedMesh(fleetWheelGeometry('bus', i), material, buses.length * 2);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });

  // ---- The clock and the timetable ----
  let t = NaN, lastT = NaN, time = 0, zombie = false;
  const fleet = new Map<string, VehicleState>();
  const maxWait = (line: TransitLine) => (3 * line.spec.layover) / SPH;
  /** The vehicle's next trip leaving its terminus at or after `after` (game hours). */
  function nextTrip(line: TransitLine, v: number, after: number): Trip | null {
    const d = Math.floor(after / 24);
    for (let day = d - 1; day <= d + 1; day++) for (const trip of transit.trips(line.id, day)) if (trip.vehicle === v && trip.depart >= after - 1e-6) return trip;
    return null;
  }
  const departOf = (line: TransitLine, trip: Trip, k: number) => (k === 0 ? trip.depart : trip.depart + line.visits[k].depart / SPH);

  // ---- Seeing: the player's camera (last frame's frustum) ----
  let frustum: THREE.Frustum | null = null;
  const sphere = new THREE.Sphere();
  const viewer = { x: 0, z: 0 };
  function seen(x: number, z: number, r = 3) {
    if (Math.hypot(x - viewer.x, z - viewer.z) > 320) return false;
    if (!frustum) return Math.hypot(x - viewer.x, z - viewer.z) < 150;
    return frustum.intersectsSphere(sphere.set(sphere.center.set(x, 1.5, z), r));
  }

  // ---- Where a bus is ----
  function place(bus: Bus) {
    const p = busPose(bus.run.course.path, bus.s, bus.lat);
    bus.x = p.x; bus.z = p.z; bus.hx = p.hx; bus.hz = p.hz; bus.yaw = p.yaw;
  }
  /** A point in a bus's frame (x to its left, z ahead of its centre) in the world. */
  const local = (bus: Bus, x: number, z: number) => ({ x: bus.x + bus.hz * x + bus.hx * z, z: bus.z - bus.hx * x + bus.hz * z });
  const docked = (bus: Bus) => (bus.phase === 'dwell' || bus.phase === 'layover') && bus.doors > 0.6;
  /** The stop a bus stands at (dwell, layover) or is heading for. */
  const stopOf = (bus: Bus) => bus.run.line.visits[bus.visit].stop;
  /** Puts a bus where its timetable says (on rails), or out of service. */
  function rails(bus: Bus) {
    const st = fleet.get(bus.key);
    if (!st || !st.trip) { bus.phase = 'off'; return; }
    const line = bus.run.line;
    Object.assign(bus, {
      phase: st.phase, trip: st.trip, visit: st.visit, s: bus.run.course.rearOf(st.s), speed: st.speed, lat: 0, latT: 0, passing: null,
      doors: st.phase === 'run' ? 0 : 1, doorsWant: st.phase === 'run' ? 0 : 1, last: false, approach: false, late: 0, wait: '', stuck: 0, still: 0,
      leaveAt: st.phase === 'run' ? 0 : departOf(line, st.trip, st.visit), dockedAt: time - MIN_DWELL,
    });
    place(bus);
  }
  /** A bus coming into service where the player can see: it drives in from a block back along its line instead. */
  function enter(bus: Bus) {
    const st = fleet.get(bus.key);
    if (!st || !st.trip) return;
    rails(bus);
    if ((st.phase === 'layover' && seen(bus.x, bus.z, 7)) || occupied(bus)) {
      const path = bus.run.course.path;
      bus.s = (bus.run.course.docks[0] - 90 + path.len) % path.len;
      Object.assign(bus, { phase: 'run', visit: 0, approach: st.phase === 'layover', doors: 0, doorsWant: 0, speed: 6, trip: st.trip });
      if (st.phase !== 'layover') { bus.s = bus.run.course.rearOf(st.s - 60); bus.visit = st.visit; }
      place(bus);
      // Still on top of something: try again next frame.
      if (occupied(bus)) bus.phase = 'off';
      else settle(bus);
    }
  }
  /** Taken over from its timetable on the move: slow enough to stop at a red light just ahead. */
  function settle(bus: Bus) {
    if (bus.phase !== 'run' && bus.phase !== 'depot') return;
    const path = bus.run.course.path;
    for (const sig of bus.run.course.signals) {
      const a = pathAhead(path, bus.s, sig.s);
      // The same braking curve drive() follows for a red light (1.8 m/s²), so it never runs the line it was placed before.
      if (a > 0.05 && a < 30 && nodeLight(sig.node, sig.group, time) !== 'green') bus.speed = Math.min(bus.speed, Math.sqrt(2 * 1.8 * Math.max(0, a - 0.3)));
    }
  }
  /** Whether a vehicle or another bus stands where this bus is. */
  function occupied(bus: Bus) {
    for (const c of host.vehicles.live ?? host.vehicles.cars) {
      if (c.mode === 'off' || Math.abs(c.x - bus.x) > 9 || Math.abs(c.z - bus.z) > 9) continue;
      const along = (c.x - bus.x) * bus.hx + (c.z - bus.z) * bus.hz, across = (c.x - bus.x) * -bus.hz + (c.z - bus.z) * bus.hx;
      if (Math.abs(along) < BG.NOSE + 2.5 && Math.abs(across) < BG.HW + 1.3) return true;
    }
    for (const b of buses) if (b !== bus && b.phase !== 'off' && Math.hypot(b.x - bus.x, b.z - bus.z) < 13) return true;
    return false;
  }

  // ---- Obstacles a driven bus looks for ----
  const obs: Ob[] = [];
  let playerOb: Ob | null = null;
  function gather(view: View, walking: readonly Walking[]) {
    obs.length = 0;
    for (const car of host.vehicles.live ?? host.vehicles.cars) {
      if (car.mode === 'off') continue;
      const [hw, hl] = host.vehicles.halfSize(car.kind);
      const lane = car.mode === 'lane' || car.mode === 'chase' || car.mode === 'leave' || car.mode === 'player';
      const hx = Math.sin(car.yaw), hz = Math.cos(car.yaw), v = car.mode === 'knocked' ? 0 : car.speed;
      obs.push({ x: car.x, z: car.z, hx, hz, vx: hx * v + car.vx, vz: hz * v + car.vz, half: Math.max(0, hl - hw), r: hw, still: !lane && Math.abs(car.speed) < 0.3 && Math.abs(car.vx) + Math.abs(car.vz) < 0.3, who: 'car', car });
    }
    for (const w of walking) obs.push({ x: w.x, z: w.z, hx: 0, hz: 1, vx: 0, vz: 0, half: 0, r: w.body ? 0.9 : 0.45, still: !!w.body, who: w.body ? 'body' : 'walker' });
    playerOb = null;
    if (!aboard && !view.car) {
      playerOb = { x: view.x, z: view.z, hx: 0, hz: 1, vx: 0, vz: 0, half: 0, r: view.riding ? 1.0 : 0.45, still: false, who: 'player' };
      obs.push(playerOb);
    }
    for (const b of buses) if (b.phase !== 'off') obs.push({ x: b.x, z: b.z, hx: b.hx, hz: b.hz, vx: b.hx * b.speed, vz: b.hz * b.speed, half: BG.NOSE - BG.HW, r: BG.HW, still: b.phase === 'dwell' || b.phase === 'layover', who: 'bus', bus: b });
  }
  const near: Ob[] = [];
  /** Distance from a point to an obstacle's footprint (a capsule along its heading), `tau` seconds from now. */
  function gap(o: Ob, x: number, z: number, tau = 0) {
    const dx = x - o.x - o.vx * tau, dz = z - o.z - o.vz * tau, u = clamp(dx * o.hx + dz * o.hz, -o.half, o.half);
    return Math.hypot(dx - o.hx * u, dz - o.hz * u) - o.r;
  }
  /** The first thing the nose would meet within `reach` metres of travel at offset `lat`, and how far it can go. */
  function corridor(bus: Bus, reach: number, lat: number) {
    const path = bus.run.course.path;
    let best: Ob | null = null, at = Infinity;
    near.length = 0;
    for (const o of obs) if (o.bus !== bus && Math.abs(o.x - bus.x) < reach + 16 && Math.abs(o.z - bus.z) < reach + 16) near.push(o);
    if (!near.length) return null;
    for (let d = 0.6; d <= reach && !best; d += 1.5) {
      const p = busPose(path, bus.s + d, lat), nx = p.x + p.hx * BG.NOSE, nz = p.z + p.hz * BG.NOSE;
      // Where things will be by the time the nose gets there (a moto cutting across), and where they are now.
      const tau = Math.min(1.2, d / Math.max(1, bus.speed));
      for (const o of near) {
        if (gap(o, nx, nz) < BG.HW + 0.35 || (o.vx !== 0 || o.vz !== 0 ? gap(o, nx, nz, tau) < BG.HW + 0.2 : false)) {
          // Only what lies ahead of the nose: something level with the cab or beside the body is not in the way.
          const ahead = (o.x - (bus.x + bus.hx * BG.NOSE)) * bus.hx + (o.z - (bus.z + bus.hz * BG.NOSE)) * bus.hz;
          if (ahead < -o.r - o.half - 0.5) continue;
          best = o; at = d; break;
        }
      }
    }
    return best ? { o: best, at } : null;
  }
  /** Room to get round something standing in the lane: the offset to drive at (left of the course), or null. */
  function passLine(bus: Bus, o: Ob) {
    const path = bus.run.course.path;
    // On a straight, with the obstacle out of the junctions.
    for (let d = -2; d <= 26; d += 2) if (Math.abs(curvature(path, bus.s + d)) > 0.02) return null;
    if (roads.junctionAt(o.x, o.z, 15)) return null;
    const p = busPose(path, bus.s), rx = -p.hz, rz = p.hx;
    const oLat = (o.x - p.x) * rx + (o.z - p.z) * rz, across = o.r + o.half * Math.abs(o.hx * rx + o.hz * rz);
    const need = oLat - across - BG.HW - 0.45;
    if (need > -0.2) return null;
    const road = roads.nearestEdge(p.x, p.z, 12);
    if (!road) return null;
    const right = road.off * (p.hx * road.hx + p.hz * road.hz >= 0 ? 1 : -1);
    if (right + need < -(road.edge.half - BG.HW - 0.3)) return null;
    // Nothing coming the other way in the lanes it would use, nothing alongside or close behind on that side.
    for (const c of host.vehicles.live ?? host.vehicles.cars) {
      if (c.mode !== 'lane' && c.mode !== 'player') continue;
      const along = (c.x - p.x) * p.hx + (c.z - p.z) * p.hz, side = (c.x - p.x) * rx + (c.z - p.z) * rz;
      if (side > -1.2 || side < need - BG.HW - 3.5) continue;
      if (Math.sin(c.yaw) * p.hx + Math.cos(c.yaw) * p.hz < -0.5 ? along > -8 && along < 75 : along > -18 && along < BG.NOSE + 3) return null;
    }
    return need;
  }

  /** Something beside the bus on the side it is moving over to (`side` +1 right, -1 left): wait for it to go by. */
  function flank(bus: Bus, side: number) {
    const rx = -bus.hz, rz = bus.hx;
    for (const o of obs) {
      if (o.bus === bus || Math.abs(o.x - bus.x) > 12 || Math.abs(o.z - bus.z) > 12) continue;
      const along = (o.x - bus.x) * bus.hx + (o.z - bus.z) * bus.hz, across = ((o.x - bus.x) * rx + (o.z - bus.z) * rz) * side;
      // Level with the body: its nose past the rear wheels (one further back waits for the bus) and its tail short of the nose.
      const reachFwd = along + Math.max(0, o.hx * bus.hx + o.hz * bus.hz) * (o.half + o.r) + o.r;
      if (reachFwd > -BG.REAR && along - o.half - o.r < BG.NOSE + 1 && across > BG.HW - 0.3 && across < BG.HW + o.r + 1.4) return true;
    }
    return false;
  }

  // ---- Driving ----
  function drive(bus: Bus, dt: number, view: View) {
    const run = bus.run, path = run.course.path;
    // Running late it makes up time: quicker the later it is (and a little quicker off the mark).
    let target = bus.late > 4 && bus.phase === 'run' ? CATCH_UP + Math.min(2, Math.max(0, (bus.late - 30) / 20)) : CRUISE, why = '', left = Infinity;
    if (bus.phase === 'run') {
      // Into the stop: brake to stand with the centre at the shelter.
      const d = pathAhead(path, bus.s, run.course.docks[bus.visit]);
      left = d > path.len - 1 ? 0 : d;
      if (left < 0.25 && bus.speed < 0.6) { arrive(bus, view); return; }
      target = Math.min(target, Math.sqrt(2 * BRAKE * Math.max(0, left - 0.1)) + 0.12);
    }
    // Curves ahead, by the braking distance.
    target = Math.min(target, curveSpeed(path, bus.s, bus.speed * bus.speed / (2 * BRAKE) + 6, 2));
    // The next stop line: red, or amber with room to stop.
    let sig = null, sigAt = Infinity;
    for (const p of run.course.signals) { const a = pathAhead(path, bus.s, p.s); if (a > 0.05 && a < path.len - 3 && a < sigAt) { sigAt = a; sig = p; } }
    if (sig && sigAt < 70) {
      const light = nodeLight(sig.node, sig.group, time);
      if (light === 'red' || (light === 'yellow' && sigAt > (bus.speed * bus.speed) / (2 * 2.5) + 1)) {
        const limit = Math.sqrt(2 * 1.8 * Math.max(0, sigAt - 0.3));
        if (limit < target) { target = limit; if (limit < 1) why = 'light'; }
      } else if (sigAt < 6) {
        // Green: into the junction only with room to clear it, never to stop across it behind a queue.
        const beyond = corridor(bus, sigAt + 34, bus.lat);
        if (beyond && beyond.at > sigAt + 1 && Math.hypot(beyond.o.vx, beyond.o.vz) < 1.2 && beyond.o.who !== 'walker' && beyond.o.who !== 'player') {
          const limit = Math.sqrt(2 * 1.8 * Math.max(0, sigAt - 0.3));
          if (limit < target) { target = limit; if (limit < 1) why = 'queue'; }
        }
      }
    }
    // People, vehicles and buses in the way.
    const reach = Math.max(10, (bus.speed * bus.speed) / (2 * 2.5) + 8);
    const hit = corridor(bus, reach, bus.lat);
    if (hit) {
      // Behind something moving the same way: at its pace, able to stop if it does.
      const vo = Math.max(0, hit.o.vx * bus.hx + hit.o.vz * bus.hz), limit = Math.sqrt(2 * 2.5 * Math.max(0, hit.at - 1.2) + vo * vo);
      if (limit < target) { target = limit; if (limit < 1.5 && !why) { why = hit.o.who; bus.by = hit.o.bus?.key ?? (hit.o.car ? `${hit.o.car.kind}${hit.o.car.index} ${hit.o.car.mode} ${hit.o.car.wait ?? ''}` : ''); } }
      // In behind another bus at this stop: open the doors here (the second berth), and get round it afterwards.
      const ahead = hit.o.bus, sameStop = !!ahead && bus.phase === 'run' && docked(ahead) && stopOf(ahead).id === stopOf(bus).id && left < 45;
      if (sameStop && hit.at < 3 && bus.speed < 0.4) { arrive(bus, view); return; }
      // Standing still in the lane (a crash, a parked car, a body, a bus at its stop): get round it once the other lane is clear.
      if (hit.o.still && !sameStop && bus.speed < 0.6 && hit.at < 14) {
        bus.still += dt;
        if (bus.still > 2 && bus.latT === 0) {
          const need = passLine(bus, hit.o);
          if (need !== null) { bus.latT = need; bus.passing = { x: hit.o.x, z: hit.o.z }; }
        }
      } else bus.still = 0;
    } else bus.still = 0;
    // Pulling out from the kerb (the course swings left ahead): not while something is alongside on that side.
    if (bus.speed < 4 && !bus.passing) {
      const ahead = busPose(path, bus.s + 10, bus.lat), sweep = (ahead.x - bus.x) * -bus.hz + (ahead.z - bus.z) * bus.hx;
      if (sweep < -0.4 && flank(bus, -1)) { target = 0; why ||= 'car'; }
    }
    if (bus.passing) {
      target = Math.min(target, 3.5);
      // Past it: the rear axle 3 m beyond it, back into the lane.
      const behind = (bus.passing.x - (bus.x - bus.hx * BG.REAR)) * bus.hx + (bus.passing.z - (bus.z - bus.hz * BG.REAR)) * bus.hz;
      if (behind < -3) { bus.passing = null; bus.latT = 0; }
    }
    if (bus.lat !== bus.latT && !flank(bus, Math.sign(bus.latT - bus.lat))) {
      const rate = (0.35 + 0.3 * bus.speed) * dt;
      bus.lat += clamp(bus.latT - bus.lat, -rate, rate);
    }
    if (Math.abs(bus.lat) > 0.3) target = Math.min(target, 3.5);
    bus.wait = why;
    const stopped = bus.speed < 0.3 && target < 0.5;
    bus.stuck = stopped && why !== 'light' ? bus.stuck + dt : 0;
    if (bus.stuck > 1.6 && (why === 'player' || why === 'car' || why === 'body') && time > bus.honkAt && Math.hypot(bus.x - view.x, bus.z - view.z) < 45) { bus.honkAt = time + 4; playHorn(bus.stuck > 6); }
    bus.speed = target < bus.speed ? Math.max(target, bus.speed - (target < bus.speed - 2 ? HARD : BRAKE * 1.6) * dt) : Math.min(target, bus.speed + (bus.late > 30 ? ACCEL * 1.25 : ACCEL) * dt);
    bus.s = (bus.s + bus.speed * dt) % path.len;
  }
  /** Docked at its next stop: the doors open; the end of a trip, a layover or the depot. */
  function arrive(bus: Bus, view: View) {
    const line = bus.run.line, trip = bus.trip!;
    bus.speed = 0;
    bus.dockedAt = time;
    bus.doorsWant = 1;
    // After 23:30 this is its last call.
    bus.last = t % 24 > 23.5 || t % 24 < 4.5;
    if (bus.visit === 0) {
      if (bus.approach) { bus.approach = false; bus.phase = 'layover'; bus.leaveAt = trip.depart; }
      else {
        // Back at the terminus: on with the next trip after a layover, or off to the depot.
        const next = nextTrip(line, bus.v, trip.end - 1e-6);
        if (next && next.depart - t <= maxWait(line) && !bus.last) { bus.trip = next; bus.phase = 'layover'; bus.leaveAt = next.depart; }
        else { bus.phase = 'dwell'; bus.last = true; bus.leaveAt = t; }
        alight(bus, 1 + Math.floor(rand() * 3));
      }
    } else {
      bus.phase = 'dwell';
      bus.leaveAt = bus.last ? t : departOf(line, trip, bus.visit);
      alight(bus, Math.floor(rand() * (1.4 + 2.2 * demand(view.hours % 24))));
    }
    callFor(bus);
  }
  /** Standing at a stop: doors, riders, then away (or to the depot). */
  function dwell(bus: Bus) {
    const waited = time - bus.dockedAt, line = bus.run.line;
    // Riders still on their way to the door are waited for a little (not when the bus is running late).
    const busy = (bus.boarding > 0 || bus.alighting > 0) && waited < MIN_DWELL + (bus.late > 15 ? 1 : MAX_EXTRA);
    // Early it holds for its time, unless another bus waits behind it to get on (then it goes, rather than block the stop).
    const blocking = t < bus.leaveAt && buses.some((b) => b !== bus && b.phase === 'run' && b.wait === 'bus' && b.by === bus.key && b.speed < 0.3);
    if (bus.doorsWant === 1 && waited >= (bus.late > 20 ? MIN_DWELL - 2 : MIN_DWELL) && (t >= bus.leaveAt || blocking) && !busy && !(aboard?.kind === 'bus' && aboard.bus === bus && aboard.leaving)) bus.doorsWant = 0;
    if (bus.doorsWant === 0 && bus.doors <= 0) {
      if (bus.last) { bus.phase = 'depot'; bus.depotSince = time; return; }
      bus.late = Math.max(0, (t - bus.leaveAt) * SPH);
      bus.phase = 'run';
      bus.visit = (bus.visit + 1) % line.visits.length;
    }
  }

  // ---- Riders (walkers) at the shelters and piers ----
  const sites = new Map<string, Site>();
  for (const st of network.stops.values()) {
    if (st.mode === 'bus') {
      const yaw = st.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw), ax = Math.cos(yaw), az = -Math.sin(yaw);
      const line = { x: st.wait.x + fx * 1.55, z: st.wait.z + fz * 1.55 };
      sites.set(st.id, {
        id: st.id, mode: 'bus', x: st.wait.x, taken: [], next: 0,
        slots: [-1.9, 1.9, -2.7, 2.7, -3.5, 3.5].map((k, i) => ({ x: st.wait.x + fx * (1.15 + 0.15 * (i % 2)) + ax * k, z: st.wait.z + fz * (1.15 + 0.15 * (i % 2)) + az * k, yaw: yaw + (i % 3 - 1) * 0.35 })),
        from: [-1, 1].map((s) => ({ x: line.x + ax * s * 32, z: line.z + az * s * 32 })),
      });
    } else if (st.mode === 'waterbus') {
      const x = st.wait.x;
      sites.set(st.id, {
        id: st.id, mode: 'waterbus', x, taken: [], next: 0,
        slots: [[-0.95, -149.4], [0.95, -149.2], [-0.95, -147.9], [0.95, -147.7], [-0.95, -146.4], [0.95, -146.2]].map(([dx, z], i) => ({ x: x + dx, z, yaw: Math.PI + (i % 2 ? 0.3 : -0.3) })),
        from: [-1, 1].map((s) => ({ x: x + s * 22, z: -129 })),
      });
    }
  }
  for (const s of sites.values()) s.taken = s.slots.map(() => null);
  const walkers: Walker[] = [];
  let seed = 4021;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  function newWalker(site: Site, x: number, z: number, mode: Mode, path: { x: number; z: number }[], slot = -1): Walker | null {
    if (walkers.length >= MAX_WALKERS) return null;
    const k = Math.floor(rand() * 1e6);
    const style = deriveStyle({ shirt: SHIRTS[k % SHIRTS.length], pants: PANTS[(k >> 4) % PANTS.length], skin: SKINS[(k >> 8) % SKINS.length] }, `rider${k}`, ROLES[(k >> 3) % ROLES.length]);
    style.torso &= ~TORSO.GANH;
    style.armR &= ~(ARM.BROOM | ARM.FAN | ARM.NON_LA | ARM.CUP);
    const w: Walker = {
      style, look: palettesOf(style), x, z, yaw: 0, speed: 0, pace: 1.15 + rand() * 0.3, go: 0, stride: rand() * 6,
      mode, path, site, slot, vehicle: null, delay: 0, born: time, gone: false,
    };
    if (slot >= 0) site.taken[slot] = w;
    walkers.push(w);
    return w;
  }
  const freeSlot = (site: Site) => site.taken.findIndex((w) => !w);
  /** How many riders a stop draws now: none out of service hours, more at the rush. */
  function wanted(site: Site, hour: number) {
    if (zombie) return 0;
    const open = site.mode === 'bus' ? hour >= 5 && hour < 22.8 : hour >= 6 && hour < 21.3;
    return open ? Math.min(site.slots.length, Math.round(demand(hour) * (site.mode === 'bus' ? 5.5 : 4))) : 0;
  }
  function tendSites(hour: number) {
    for (const site of sites.values()) {
      const waiting = site.taken.filter((w) => w && (w.mode === 'wait' || w.mode === 'come')).length, want = wanted(site, hour);
      if (waiting > want) {
        // Gave up waiting (service over): off along the footway.
        const w = site.taken.find((q) => q && q.mode === 'wait');
        if (w) leave(w, site.from[rand() < 0.5 ? 0 : 1]);
      } else if (waiting < want && time > site.next) {
        site.next = time + 3 + rand() * 6;
        const k = freeSlot(site);
        if (k < 0) continue;
        const from = site.from[rand() < 0.5 ? 0 : 1], s = site.slots[k];
        if (!seen(from.x, from.z, 1.5)) newWalker(site, from.x, from.z, 'come', site.mode === 'waterbus' ? [{ x: site.x + Math.sign(s.x - site.x) * 0.95, z: -136.2 }, { x: s.x, z: s.z }] : [{ x: s.x, z: s.z }], k);
        else if (!seen(s.x, s.z, 4)) { const w = newWalker(site, s.x, s.z, 'wait', [], k); if (w) w.yaw = s.yaw; }
      }
    }
  }
  function leave(w: Walker, to: { x: number; z: number }) {
    if (w.slot >= 0 && w.site.taken[w.slot] === w) w.site.taken[w.slot] = null;
    w.slot = -1;
    w.mode = 'leave';
    w.path = w.site.mode === 'waterbus' ? [{ x: w.site.x + (to.x < w.site.x ? -0.95 : 0.95), z: -136.4 }, to] : [to];
  }
  /** Where riders step in and out of a docked bus or river bus. */
  function doorOf(vehicle: string, mid = false): { x: number; z: number; inX: number; inZ: number } | null {
    const bus = byKey.get(vehicle);
    if (bus) {
      const out = local(bus, -(BG.HW + 0.5), mid ? MID_DOOR : FRONT_DOOR), inside = local(bus, -(BG.HW - 0.4), mid ? MID_DOOR : FRONT_DOOR);
      return { x: out.x, z: out.z, inX: inside.x, inZ: inside.z };
    }
    const wb = waterbusOf(vehicle);
    if (wb) return { x: wb.x + (mid ? 0.8 : -0.4), z: -151.6, inX: wb.x + (mid ? 0.8 : -0.4), inZ: -152.6 };
    return null;
  }
  /** A vehicle stands at a stop with its doors open: the riders waiting there walk to the door. */
  function callFor(bus: Bus) { const site = sites.get(stopOf(bus).id); if (site) call(site, bus.key); }
  function call(site: Site, vehicle: string) {
    let k = 0;
    for (const w of site.taken) {
      if (!w || (w.mode !== 'wait' && !(w.mode === 'come' && Math.hypot(w.x - site.slots[w.slot].x, w.z - site.slots[w.slot].z) < 8))) continue;
      const door = doorOf(vehicle);
      if (!door) return;
      site.taken[w.slot] = null;
      w.slot = -1;
      w.mode = 'board';
      w.vehicle = vehicle;
      w.delay = time + 1.1 + k++ * 0.9;
      w.path = [{ x: door.x, z: door.z }, { x: door.inX, z: door.inZ }];
    }
    const bus = byKey.get(vehicle);
    if (bus) bus.boarding = k;
  }
  function alight(bus: Bus, n: number) { bus.alighting = n; bus.alightAt = time + 1.1; }
  /** Riders getting off a bus at its stop, one every 0.8 s from the middle door, then away along the footway. */
  function alightNext(bus: Bus) {
    if (bus.alighting <= 0 || time < bus.alightAt || bus.doors < 0.9) return;
    bus.alighting--;
    bus.alightAt = time + 0.8;
    const site = sites.get(stopOf(bus).id), door = doorOf(bus.key, true);
    if (!site || !door) return;
    const w = newWalker(site, door.inX, door.inZ, 'leave', []);
    if (!w) return;
    const st = stopOf(bus), yaw = st.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const on = { x: door.x - fx * 1.9, z: door.z - fz * 1.9 }, dir = rand() < 0.5 ? -1 : 1;
    w.path = [{ x: door.x, z: door.z }, on, { x: on.x + Math.cos(yaw) * dir * 34, z: on.z - Math.sin(yaw) * dir * 34 }];
  }
  function stepWalkers(dt: number) {
    for (const w of walkers) {
      if (w.gone) continue;
      if ((w.mode === 'board' || w.mode === 'leave') && time < w.delay) { w.speed = 0; w.go = Math.max(0, w.go - dt * 8); continue; }
      const to = w.path[0];
      if (!to) {
        w.speed = 0;
        if (w.mode === 'come') { w.mode = 'wait'; if (w.slot >= 0) w.yaw = w.site.slots[w.slot].yaw; }
        else if (w.mode !== 'wait') w.gone = true;
      } else {
        const dx = to.x - w.x, dz = to.z - w.z, d = Math.hypot(dx, dz);
        if (d < 0.25) { w.path.shift(); if (w.mode === 'board' && w.path.length === 0) { w.gone = true; const b = byKey.get(w.vehicle ?? ''); if (b) b.boarding = Math.max(0, b.boarding - 1); } }
        else {
          w.speed = Math.min(w.pace, d * 2);
          w.x += (dx / d) * w.speed * dt; w.z += (dz / d) * w.speed * dt;
          const want = Math.atan2(dx, dz);
          w.yaw += Math.atan2(Math.sin(want - w.yaw), Math.cos(want - w.yaw)) * (1 - Math.exp(-dt * 10));
        }
        // Off out of sight once well away.
        if (w.mode === 'leave' && time - w.born > 6 && !seen(w.x, w.z, 1.5)) w.gone = true;
      }
      w.go = THREE.MathUtils.damp(w.go, w.speed > 0.05 ? Math.min(1, w.speed / 1.3) : 0, 8, dt);
      const amp = 0.48 * w.go, step = 2 * FIGURE.sole * BODY_SCALE * w.style.height * Math.sin(Math.max(0.2, amp));
      w.stride += (w.speed * dt * Math.PI) / step;
    }
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      if (!w.gone) continue;
      if (w.slot >= 0 && w.site.taken[w.slot] === w) w.site.taken[w.slot] = null;
      walkers.splice(i, 1);
    }
  }
  // Four instanced draws for every rider: body, arms and legs (the crowd's figure meshes, low detail).
  const materials = { body: figureMaterial('body'), arm: figureMaterial('arm'), leg: figureMaterial('leg') };
  const batches = {
    body: new FigureBatch(figureGeometry('body', 'lo'), materials.body, MAX_WALKERS), armL: new FigureBatch(figureGeometry('armL', 'lo'), materials.arm, MAX_WALKERS),
    armR: new FigureBatch(figureGeometry('armR', 'lo'), materials.arm, MAX_WALKERS), legs: new FigureBatch(figureGeometry('leg', 'lo'), materials.leg, MAX_WALKERS * 2),
  };
  for (const b of Object.values(batches)) { b.mesh.receiveShadow = true; scene.add(b.mesh); }
  const walk = newGait();
  const base = new THREE.Matrix4(), chest = new THREE.Matrix4(), armM = new THREE.Matrix4(), legM = new THREE.Matrix4();
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), size = new THREE.Vector3(), euler = new THREE.Euler(0, 0, 0, 'YZX');
  const bodyPose = [0, 0, 0, 0], armPose = [0, 0, 0, 0], legPose = [0, 0, 0, 0], arm = [0, 0, 0, 0, 0, 0, 0];
  function drawWalkers(timeNow: number) {
    for (const b of Object.values(batches)) b.begin();
    for (const w of walkers) {
      if (Math.hypot(w.x - viewer.x, w.z - viewer.z) > 140 || (frustum && !frustum.intersectsSphere(sphere.set(sphere.center.set(w.x, 1, w.z), 1.2)))) continue;
      const st = w.style, sx = BODY_SCALE * st.width, sy = BODY_SCALE * st.height;
      gait(w.stride, 0, w.go, walk);
      const idle = w.mode === 'wait' ? Math.sin(timeNow * 0.5 + w.stride) : 0;
      pos.set(w.x, groundHeight(w.x, w.z) + walk.bob * sy, w.z);
      base.compose(pos, quat.setFromEuler(euler.set(0.03 * w.go, w.yaw, idle * 0.02)), size.set(sx, sy, sx));
      bodyPose[0] = w.mode === 'wait' ? Math.sin(timeNow * 0.31 + w.stride) * 0.5 : 0; bodyPose[1] = 0; bodyPose[2] = walk.chest; bodyPose[3] = swingCode(0);
      batches.body.push(base, w.look.body, bodyPose);
      chestMatrix(base, walk.chest, chest);
      for (const side of [-1, 1] as const) {
        arm[0] = (side < 0 ? walk.armL : walk.armR) + 0.02; arm[1] = 0.07; arm[2] = 0; arm[3] = (side < 0 ? walk.elbowL : walk.elbowR) - 0.12; arm[4] = 0.1; arm[5] = 0.03; arm[6] = HAND.RELAXED;
        poseArm(chest, side, arm as unknown as ArmPose, armM, armPose, st.shoulderX);
        (side < 0 ? batches.armL : batches.armR).push(armM, side < 0 ? w.look.armL : w.look.armR, armPose);
        limbMatrix(base, sideX(side) * FIGURE.hipX, FIGURE.hipY, side < 0 ? walk.thighL : walk.thighR, 0, 0, legM);
        legPose[0] = (side < 0 ? walk.kneeL : walk.kneeR) + (w.mode === 'wait' ? Math.max(0, side * idle) * 0.1 : 0); legPose[1] = side < 0 ? walk.ankleL : walk.ankleR; legPose[2] = side < 0 ? walk.toeL : walk.toeR;
        batches.legs.push(legM, w.look.legs, legPose);
      }
    }
    for (const b of Object.values(batches)) b.end();
  }

  // ---- The river bus (line W1: boats.ts drives the boats along its course to the timetable) ----
  const waterbusOf = (key: string) => host.boats.waterbuses.find((b) => b.run?.key === key) ?? null;
  const wbDocked = new Map<string, string>();
  function stepWater() {
    wbDocked.clear();
    if (!water) return;
    for (const boat of host.boats.waterbuses) {
      const run = boat.run;
      if (!run || boat.mode !== 'docked' || !run.stop || zombie) continue;
      if (run.service && !wbDocked.has(run.stop)) wbDocked.set(run.stop, run.key);
      // Alongside a pier: the riders waiting there walk aboard, and some get off.
      const site = sites.get(run.stop), tag = `${run.key}:${run.docked}`;
      if (!site || calledAt.has(tag)) continue;
      calledAt.add(tag);
      if (calledAt.size > 64) calledAt.delete(calledAt.values().next().value!);
      if (run.service) call(site, run.key);
      const n = Math.floor(rand() * (1 + 2.5 * demand(t % 24)));
      for (let k = 0; k < n; k++) {
        const side = k % 2 ? -0.95 : 0.95, dir = rand() < 0.5 ? -1 : 1;
        const w = newWalker(site, site.x + side * 0.6 + k * 0.3, -152.4 - (k % 3) * 0.4, 'leave', [{ x: site.x + side, z: -150.6 }, { x: site.x + side, z: -136.4 }, { x: site.x + dir * 24, z: -129 }]);
        if (!w) break;
        w.delay = time + 1 + k * 0.9;
      }
    }
  }
  const calledAt = new Set<string>();

  // ---- The player as a passenger ----
  type BusRide = { kind: 'bus'; bus: Bus; ring: boolean; leaving: boolean; provider: Provider };
  type WaterRide = { kind: 'water'; key: string; boat: Boat; ring: boolean; provider: Provider };
  type BoatSit = { kind: 'sampan'; boat: Boat; trip: 'sit' | 'ferry'; since: number; provider: Provider };
  type Aboard = BusRide | WaterRide | BoatSit;
  let aboard: Aboard | null = null;
  let passengers: Passengers | null = null;
  function getOff(x: number, z: number, yaw: number) {
    const was = aboard;
    aboard = null;
    passengers?.leave();
    host.place(x, z, yaw);
    if (was?.kind === 'bus') was.leaving = false;
  }
  /** Off a bus at its stop: down the front steps onto the sidewalk. */
  function busOff(bus: Bus) {
    const st = stopOf(bus), yaw = st.yaw ?? 0, door = local(bus, -(BG.HW + 2.1), FRONT_DOOR);
    getOff(door.x, door.z, yaw + Math.PI);
    host.notify(`Xuống xe ở ${stopTitle(st.name)}.`, 2500);
  }
  function busEtas(bus: Bus) {
    const line = bus.run.line, path = bus.run.course.path, n = line.visits.length, out: { name: string; eta: number }[] = [];
    let eta = docked(bus) ? Math.max(0, (bus.leaveAt - t) * SPH, MIN_DWELL - (time - bus.dockedAt)) : 0, from = bus.s;
    const first = docked(bus) ? (bus.visit + 1) % n : bus.visit;
    for (let i = 0, k = first; i < Math.min(5, n); i++, k = (k + 1) % n) {
      const to = bus.run.course.docks[k];
      eta += pathAhead(path, from, to) / 7.2 + (i ? 8 : 0);
      from = to;
      out.push({ name: stopTitle(line.visits[k].stop.name), eta });
      if (k === 0 && i > 0) break;
    }
    return out;
  }
  function boardBus(bus: Bus) {
    if (!passengers) return;
    if (!host.pay(FARE.bus)) { host.notify(`Vé xe buýt ${FARE.bus}.000đ, bạn không đủ tiền.`, 2500); return; }
    const line = bus.run.line;
    const state: BusRide = {
      kind: 'bus', bus, ring: false, leaving: false,
      provider: {
        label: `Xe buýt ${line.id}`, pose: 'hidden',
        seat: () => ({ x: bus.x, y: groundHeight(bus.x, bus.z) + 1.2, z: bus.z, yaw: bus.yaw }),
        onLeave: () => {
          if (aboard !== state) return;
          if (docked(bus)) { busOff(bus); return; }
          if (!state.ring) { state.ring = true; host.notify(`Đã bấm chuông · xuống ở ${stopTitle(stopOf(bus).name)}.`, 2500); }
        },
        card: () => {
          const stops = busEtas(bus), here = docked(bus);
          return {
            title: `Xe buýt ${line.id} · ${stopTitle(line.name)}`, next: here ? `${stopTitle(stopOf(bus).name)} (đang dừng)` : stops[0]?.name ?? '',
            hint: here ? 'xuống xe ở trạm này' : state.ring ? 'đã bấm chuông, xe dừng ở trạm tới' : 'bấm chuông xin xuống ở trạm tới', stops: here ? stops : stops.slice(0, 5),
          };
        },
      },
    };
    aboard = state;
    bus.live = true;
    passengers.board(state.provider);
    host.notify(`Lên xe buýt ${line.id} · ${FARE.bus}.000đ · tới ${stopTitle(stopOf(bus).name)} và các trạm sau. Nhấn E để bấm chuông xuống.`, 3500);
  }
  function waterStops(boat: Boat) {
    const line = water!, run = boat.run!, out: { name: string; eta: number }[] = [], n = line.visits.length, path = line.path;
    let k = boat.mode === 'docked' ? (run.visit + 1) % n : run.visit, from = run.s;
    let eta = boat.mode === 'docked' && run.trip ? Math.max(0, ((run.visit === 0 ? run.trip.depart : run.trip.depart + line.visits[run.visit].depart / SPH) - t) * SPH) : 0;
    for (let i = 0; i < n; i++, k = (k + 1) % n) {
      eta += pathAhead(path, from, line.visits[k].s) / (line.spec.cruise * 0.85) + (i ? line.spec.dwell : 0);
      from = line.visits[k].s;
      out.push({ name: stopTitle(line.visits[k].stop.name), eta });
    }
    return out;
  }
  function boardWater(key: string, boat: Boat) {
    if (!passengers || !water) return;
    if (!host.pay(FARE.waterbus)) { host.notify(`Vé tàu buýt sông ${FARE.waterbus}.000đ, bạn không đủ tiền.`, 2500); return; }
    const state: WaterRide = {
      kind: 'water', key, boat, ring: false,
      provider: {
        label: 'Tàu buýt sông', pose: 'chair',
        seat: () => host.boats.worldPoint(boat, WATERBUS_SEAT),
        onLeave: () => {
          if (aboard !== state) return;
          if (boat.mode === 'docked' && boat.run?.stop) { waterOff(network.stops.get(boat.run.stop)!); return; }
          if (!state.ring) { state.ring = true; host.notify('Đã báo tài công · xuống ở bến tới.', 2500); }
        },
        card: () => {
          const stops = waterStops(boat), here = boat.mode === 'docked' && boat.run?.stop ? network.stops.get(boat.run.stop)! : null;
          return { title: `Tàu buýt sông · ${stopTitle(water.name.replace('TÀU BUÝT SÔNG ', ''))}`, next: here ? `${stopTitle(here.name)} (đang cập bến)` : stops[0]?.name ?? '', hint: here ? 'lên bến ở đây' : state.ring ? 'đã báo xuống ở bến tới' : 'báo xuống ở bến tới', stops };
        },
      },
    };
    aboard = state;
    passengers.board(state.provider);
    host.notify(`Lên tàu buýt sông · ${FARE.waterbus}.000đ · ngồi ghế mũi tàu. Nhấn E để báo xuống bến.`, 3500);
  }
  function waterOff(stop: TransitStop) {
    getOff(stop.wait.x, stop.wait.z + 0.6, 0);
    host.notify(`Lên ${stopTitle(stop.name)}.`, 2500);
  }
  const DO = MOORINGS.find((m) => m.kind === 'ferry')!, GHE = MOORINGS.find((m) => m.kind === 'fishing')!;
  const mooredBoat = (id: string) => host.boats.moored.find((b) => b.moor?.id === id) ?? null;
  function sitIn(boat: Boat, trip: 'sit' | 'ferry') {
    if (!passengers) return;
    const m = MOORINGS.find((q) => q.id === boat.moor?.id)!;
    const state: BoatSit = {
      kind: 'sampan', boat, trip, since: time,
      provider: {
        label: m.kind === 'ferry' ? 'Đò An Hòa' : 'Ghe câu', pose: 'chair',
        seat: () => host.boats.worldPoint(boat, SAMPAN_SEAT),
        onLeave: () => {
          if (aboard !== state) return;
          if (state.trip === 'ferry') { host.notify('Đò đang qua sông, ngồi yên nha!', 2000); return; }
          if (m.kind === 'ferry') getOff(-81.2, m.z, Math.PI / 2);
          else getOff(m.x + Math.cos(m.yaw) * 2.6, m.z - Math.sin(m.yaw) * 2.6, 0);
        },
        card: () => (state.trip === 'ferry'
          ? { title: 'Đò An Hòa → Bến Bạch Đằng', next: 'Bến Bạch Đằng', hint: 'ông lái đang chèo, chờ tới bến', stops: [{ name: 'Bến Bạch Đằng', eta: Math.max(0, 6 - (time - state.since)) + DO_TRIP.meters / DO_TRIP.pace }] }
          : { title: m.kind === 'ferry' ? 'Ngồi trên đò' : 'Ngồi trên ghe câu', next: '', hint: m.kind === 'ferry' ? 'đứng dậy lên bến' : 'nhảy xuống sông', stops: [] }),
      },
    };
    aboard = state;
    passengers.board(state.provider);
    if (trip === 'sit') host.notify(m.kind === 'ferry' ? 'Ngồi trên đò, nghe sóng vỗ mạn thuyền · E để lên bến.' : 'Leo lên ghe câu · E để xuống nước.', 3000);
  }
  /** The đò setting off for Bến Bạch Đằng: a few strokes away from the pier, then the crossing passes in a fade. */
  function stepFerry() {
    if (aboard?.kind !== 'sampan' || aboard.trip !== 'ferry') return;
    const boat = aboard.boat, gone = time - aboard.since;
    // Backing out stern first from the pier, then swinging round for the river.
    host.boats.cast(boat, { x: DO.x - Math.max(0, gone - 3) * 0.35, z: DO.z - Math.min(4.2, gone * 0.8), yaw: DO.yaw - Math.min(0.6, Math.max(0, gone - 2.5) * 0.25), speed: -0.8 }, time);
    if (gone < 6) return;
    host.fade();
    host.skip(DO_TRIP.meters / DO_TRIP.pace / SPH);
    getOff(189.6, -146.5, Math.PI);
    host.boats.cast(boat, null, time);
    host.notify('Đã tới Bến Bạch Đằng · cảm ơn chú lái đò!', 3000);
  }

  // ---- Prompts ----
  const dim = (id: string, verb: string, label = ''): PromptView => ({ id, key: '', verb, label, dim: true });
  /** The next few buses at a shelter (or river buses at a pier) as one line. */
  function timetable(stopId: string, n = 3) {
    if (!Number.isFinite(t)) return { first: null as null | { line: string; eta: number }, text: '' };
    const list = transit.arrivals(stopId, t, n).map((a) => {
      const bus = byKey.get(a.vehicle);
      const eta = a.eta + (bus && bus.live && bus.trip === a.trip ? bus.late : 0);
      return { line: a.line, eta, at: a.at };
    });
    const soon = list.filter((a) => a.eta < 300);
    const first = soon[0] ?? null;
    const text = soon.map((a) => (a.line === water?.id ? `tàu ${fmtEta(a.eta)}` : `${a.line} ${fmtEta(a.eta)}`)).join(' · ');
    return { first, text: text || `chuyến đầu ${String(Math.floor((list[0]?.at ?? 5) % 24)).padStart(2, '0')}:${String(Math.floor(((list[0]?.at ?? 5) % 1) * 60)).padStart(2, '0')}` };
  }
  function shelterEntry(stop: TransitStop): Entry {
    const at = shelterOf(stop), id = `transit:shelter:${stop.id}`;
    return {
      id, kind: 'transit', x: at.x, z: at.z, r: 3.2, priority: 54,
      prompt(c) {
        if (c.zombie) return dim(id, 'Xe buýt ngừng chạy', 'từ khi dịch bùng phát');
        const tt = timetable(stop.id), f = tt.first;
        if (!f || f.eta > 300) return { id, key: 'E', verb: 'Xem giờ xe buýt', label: `hết chuyến · ${tt.text}` };
        return { id, key: 'E', verb: 'Xem giờ xe buýt', label: `xe ${f.line} tới sau ~${fmtEta(f.eta)}` };
      },
      use(c) {
        const tt = timetable(stop.id, 4);
        c.notify(`${stopTitle(stop.name)} · tuyến ${transit.linesAt(stop.id).join(', ')} · ${tt.text}. Vé ${FARE.bus}.000đ, đứng chờ bên lề.`, 5000);
      },
    };
  }
  function pierEntry(stop: TransitStop): Entry {
    const id = `transit:pier:${stop.id}`;
    const other = water?.visits.find((v) => v.stop.id !== stop.id)?.stop;
    return {
      id, kind: 'transit', x: stop.wait.x, z: stop.wait.z, r: 4, priority: 72,
      prompt(c) {
        if (c.zombie) return dim(id, 'Tàu buýt sông ngừng chạy', 'bến bỏ hoang');
        const key = wbDocked.get(stop.id);
        if (key && !aboard) {
          if (c.wanted > 0) return dim(id, 'Lên tàu buýt sông', 'không chở người bị công an truy');
          if (c.cash < FARE.waterbus) return dim(id, 'Lên tàu buýt sông', `cần ${FARE.waterbus}.000đ`);
          return { id, key: 'E', verb: 'Lên tàu buýt sông', label: other ? `đi ${stopTitle(other.name)}` : '', price: FARE.waterbus };
        }
        const tt = timetable(stop.id, 2);
        return { id, key: 'E', verb: 'Xem giờ tàu buýt sông', label: tt.first ? `tàu tới sau ~${fmtEta(tt.first.eta)}` : tt.text };
      },
      use(c) {
        const key = wbDocked.get(stop.id), boat = key ? waterbusOf(key) : null;
        if (key && boat) { if (c.wanted === 0) boardWater(key, boat); return; }
        c.notify(`${stopTitle(stop.name)} · tàu buýt sông ${water ? stopTitle(water.name.replace('TÀU BUÝT SÔNG ', '')) : ''} · ${timetable(stop.id, 3).text}. Vé ${FARE.waterbus}.000đ.`, 5000);
      },
    };
  }
  function doEntry(): Entry {
    const id = `transit:boat:${DO.id}`;
    return {
      id, kind: 'boat', x: DO.x, z: DO.z, r: 3.5, when: 'any', priority: 66,
      prompt(c) {
        const boat = mooredBoat(DO.id);
        if (!boat || c.riding || c.inCar || aboard) return null;
        if (c.zombie) return { id, key: 'E', verb: 'Ngồi lên đò', label: 'đò không người lái' };
        // The boatman will not row someone the police are after across the river; sitting in the boat is still fine.
        if (inHours(c.hour, BOATMAN) && c.wanted > 0) return { id, key: 'E', verb: c.swimming ? 'Leo lên đò' : 'Ngồi lên đò', label: 'chú lái không chở người bị công an truy' };
        if (inHours(c.hour, BOATMAN)) return { id, key: 'E', verb: 'Đi đò', label: c.swimming ? 'leo lên đò' : `sang Bến Bạch Đằng ${FARE.do}.000đ · ngồi chơi` };
        return { id, key: 'E', verb: c.swimming ? 'Leo lên đò' : 'Ngồi lên đò', label: 'ông lái về nghỉ, 5:00 mới chèo' };
      },
      use(c) {
        const boat = mooredBoat(DO.id);
        if (!boat) return;
        if (c.zombie || c.swimming || !inHours(c.hour, BOATMAN) || c.wanted > 0) { sitIn(boat, 'sit'); return; }
        c.menu({
          id: '', kind: 'do', icon: 'boat', eyebrow: 'ĐÒ BẾN AN HÒA · CHÚ BA', title: 'Đi đâu con?',
          intro: 'Đò chèo tay qua bến Bạch Đằng, hay ngồi chơi trên đò ngắm sông. Mặc áo phao trên đò nha.',
          items: [
            { id: 'ride', name: 'Chở sang Bến Bạch Đằng', price: FARE.do, desc: `${DO_TRIP.meters} m · chừng ${Math.round(DO_TRIP.meters / DO_TRIP.pace / 60)} phút`, disabled: c.cash < FARE.do },
            { id: 'sit', name: 'Ngồi chơi trên đò', price: 0, desc: 'miễn phí, chú không lấy tiền' },
          ],
          foot: host.boats.ferry ? 'Đò ngang sang Thủ Thiêm cập mạn đông cầu tàu, 5.000đ một lượt.' : 'Đò ngang đi Thủ Thiêm sẽ có khi bến bên kia xây xong.', wallet: { cash: c.cash },
        }, (item) => {
          if (item === 'sit') { sitIn(boat, 'sit'); return 'Mời con ngồi.'; }
          if (item !== 'ride') return;
          if (!host.pay(FARE.do)) return `Cần ${FARE.do}.000đ.`;
          sitIn(boat, 'ferry');
          host.say?.('do-an-hoa', 'Ngồi vững nha con, chú chèo đây!', () => { const p = host.boats.worldPoint(boat, [0, 1.6, -1.9]); return { x: p.x, y: p.y, z: p.z }; });
          return 'Đò rời bến.';
        });
      },
    };
  }
  function gheEntry(): Entry {
    const id = `transit:boat:${GHE.id}`;
    return {
      id, kind: 'boat', x: GHE.x, z: GHE.z, r: 3.5, when: 'water', priority: 66,
      prompt(c) {
        if (aboard) return null;
        if (!c.zombie && inHours(c.hour, FISHING)) return dim(id, 'Ghe có người đang câu cá', 'đừng quấy rầy');
        return { id, key: 'E', verb: 'Leo lên ghe', label: 'ghe câu neo giữa sông' };
      },
      use(c) {
        const boat = mooredBoat(GHE.id);
        if (boat && (c.zombie || !inHours(c.hour, FISHING))) sitIn(boat, 'sit');
      },
    };
  }
  /** E at a bus standing at its stop: the front door. */
  const doorEntries = new Map<Bus, Entry>();
  function doorEntry(bus: Bus): Entry {
    let e = doorEntries.get(bus);
    if (!e) {
      const id = `transit:bus:${bus.key}`;
      e = {
        id, kind: 'transit', x: 0, z: 0, r: 4.5, priority: 80,
        prompt(c) {
          if (c.zombie || !docked(bus) || bus.last || aboard) return null;
          const line = bus.run.line, next = line.visits[(bus.visit + 1) % line.visits.length].stop;
          if (c.wanted > 0) return dim(id, `Lên xe buýt ${line.id}`, 'tài xế không cho người bị công an truy lên xe');
          if (c.cash < FARE.bus) return dim(id, `Lên xe buýt ${line.id}`, `cần ${FARE.bus}.000đ`);
          return { id, key: 'E', verb: `Lên xe buýt ${line.id}`, label: `${stopTitle(line.name)} · tới ${stopTitle(next.name)}`, price: FARE.bus };
        },
        use(c) { if (docked(bus) && !bus.last && !aboard && c.wanted === 0) boardBus(bus); },
      };
      doorEntries.set(bus, e);
    }
    const door = local(bus, -(BG.HW + 0.9), FRONT_DOOR);
    e.x = door.x; e.z = door.z;
    return e;
  }

  // ---- Drawing ----
  const busMatrix = new THREE.Matrix4(), wheelMatrix = new THREE.Matrix4(), part = new THREE.Matrix4(), turn = new THREE.Matrix4(), spinM = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), at3 = new THREE.Vector3(), q = new THREE.Quaternion();
  const busBound = new THREE.Sphere();
  function draw() {
    for (const run of runs) run.counts.fill(0);
    const nw = [0, 0];
    for (const bus of buses) {
      if (bus.phase === 'off' || zombie || Math.hypot(bus.x - viewer.x, bus.z - viewer.z) > 330) continue;
      // Only the buses the camera sees (body and wheels): a 12 m bus within a 7.5 m sphere round its middle.
      const gy = groundHeight(bus.x, bus.z);
      // Head lamps, beam, tail lamps at night (vehicle-lights.ts culls them itself: the beam reaches past this sphere).
      vehicleLights.place(bus, bus.x, gy, bus.z, bus.yaw, 0, 'bus', bus.speed);
      if (frustum && !frustum.intersectsSphere(busBound.set(busBound.center.set(bus.x, gy + 1.6, bus.z), 7.5))) continue;
      const open = bus.doors > 0.5 ? 1 : 0, run = bus.run, mesh = run.meshes[open];
      busMatrix.compose(at3.set(bus.x, gy - 0.02, bus.z), q.setFromAxisAngle(up, bus.yaw), one);
      mesh.setMatrixAt(run.counts[open]++, busMatrix);
      axles.forEach((a, i) => {
        for (let side = -1; side <= 1; side += 2) {
          part.makeTranslation((side * a.track) / 2, a.r, a.z);
          wheelMatrix.multiplyMatrices(busMatrix, part);
          if (a.steer) wheelMatrix.multiply(turn.makeRotationY(bus.steer));
          if (side < 0) wheelMatrix.multiply(turn.makeRotationY(Math.PI));
          wheelMatrix.multiply(spinM.makeRotationX(bus.spin * (side < 0 ? -1 : 1)));
          wheels[i].setMatrixAt(nw[i]++, wheelMatrix);
        }
      });
    }
    for (const run of runs) run.meshes.forEach((m, k) => { m.count = run.counts[k]; m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; });
    wheels.forEach((m, i) => { m.count = nw[i]; m.visible = nw[i] > 0; m.instanceMatrix.needsUpdate = true; });
  }

  let walking: readonly Walking[] = [];
  return {
    network, transit, buses, walkers,
    /** The game wires the registry and its passenger API in here: shelters, piers, the đò and ghe, bus doors. */
    register(registry: Registry, p: Passengers) {
      passengers = p;
      for (const stop of network.stops.values()) {
        if (stop.mode === 'bus') registry.add(shelterEntry(stop));
        else if (stop.mode === 'waterbus') registry.add(pierEntry(stop));
      }
      registry.add(doEntry());
      registry.add(gheEntry());
      registry.addProvider((x, z, _r, out) => {
        if (aboard || zombie) return;
        for (const bus of buses) if (docked(bus) && Math.abs(bus.x - x) < 14 && Math.abs(bus.z - z) < 14) out.push(doorEntry(bus));
      });
    },
    /**
     * One frame: the timetable at the game clock, buses driven near the player (on rails elsewhere), the river buses,
     * the đò and ghe crews, riders at the stops, the obstacles lane traffic sees, and the player's ride.
     */
    update(dt: number, now: number, view: View, crossing: readonly Walking[], viewFrustum: THREE.Frustum | null) {
      time = now;
      frustum = viewFrustum;
      viewer.x = view.x; viewer.z = view.z;
      walking = crossing;
      const nextT = view.day * 24 + view.hours;
      // A jump in the clock (sleep, fast travel, a debug hour): everything back to its timetable.
      const jumped = !Number.isFinite(lastT) || Math.abs(nextT - lastT - dt / SPH) > 0.03 || nextT < lastT;
      lastT = t = nextT;
      if (zombie !== view.zombie) { zombie = view.zombie; if (zombie) { for (const w of walkers) w.gone = true; } }
      fleet.clear();
      for (const st of transit.fleetAt(t)) fleet.set(st.key, st);
      host.boats.setFocus(view.x);
      host.boats.setClock(view.hours, view.day);
      host.boats.setService(!zombie);
      // A ride ended some other way (a teleport, being knocked down, arrested).
      if (aboard && host.riding() !== aboard.provider) {
        if (aboard.kind === 'sampan') host.boats.cast(aboard.boat, null, time);
        aboard = null;
      }
      gather(view, walking);
      for (const bus of buses) {
        const mine = aboard?.kind === 'bus' && aboard.bus === bus;
        if (zombie) { if (!mine) { bus.phase = 'off'; bus.live = false; } }
        else if (jumped && !mine) { bus.live = false; rails(bus); }
        else {
          const d = Math.hypot(bus.x - view.x, bus.z - view.z);
          if (bus.live) {
            if (!mine && d > LIVE_FAR && !seen(bus.x, bus.z, 7)) { bus.live = false; rails(bus); }
          } else if (mine || (d < LIVE_NEAR && (bus.phase === 'off' || !occupied(bus)))) {
            // Driven from here on: from where its timetable has it (once nothing stands there), or driving in if it
            // comes into service in sight.
            bus.live = true;
            if (bus.phase === 'off') enter(bus);
            else if (docked(bus)) callFor(bus);
            settle(bus);
          }
          if (!bus.live) rails(bus);
          else if (bus.phase === 'off') { if (fleet.has(bus.key)) enter(bus); }
          else if (bus.phase === 'run' || bus.phase === 'depot') {
            // Past the end of service (23:30-04:30) a bus still out runs straight back to the depot; the player's
            // bus first sets them down at its next stop.
            const h = t % 24;
            if (bus.phase === 'run' && !mine && (h > 23.5 || h < 4.5)) { bus.phase = 'depot'; bus.depotSince = time; }
            drive(bus, dt, view);
          }
          else dwell(bus);
          if (bus.live && bus.phase === 'depot') {
            // Out of service: carries on round its line until nobody sees it go.
            if (mine) busOff(bus);
            else if ((time - bus.depotSince > 8 && !seen(bus.x, bus.z, 7)) || time - bus.depotSince > 90) { bus.phase = 'off'; bus.trip = null; }
          }
        }
        bus.doors = clamp(bus.doors + (bus.doorsWant ? dt : -dt) / DOOR_TIME, 0, 1);
        if (bus.phase !== 'off') {
          place(bus);
          bus.spin += (bus.speed * dt) / axles[0].r;
          bus.steer = THREE.MathUtils.damp(bus.steer, -Math.atan(BG.WHEELBASE * curvature(bus.run.course.path, bus.s, 1.5)), 6, dt);
          alightNext(bus);
          // Lane traffic queues behind a bus on the move or at a light, and gets round one standing at a stop.
          // Passed standing at a stop with its doors open (its own berth or the second one behind another bus), or pulling in
          // to one or waiting to; followed while it drives.
          const toDock = pathAhead(bus.run.course.path, bus.s, bus.run.course.docks[bus.visit]);
          const atStop = bus.phase === 'dwell' || bus.phase === 'layover' || (bus.phase === 'run' && bus.speed < 3 && toDock < 40);
          // Pulling in to the kerb or out from it, the box covers the lane it is moving across.
          const next = busPose(bus.run.course.path, bus.s + 12, bus.latT), sweep = bus.phase === 'run' ? (next.x - bus.x) * -bus.hz + (next.z - bus.z) * bus.hx : 0;
          const wide = Math.abs(sweep) > 0.3 ? Math.min(2.2, Math.abs(sweep)) / 2 * Math.sign(sweep) : 0;
          host.vehicles.registerObstacle(`bus:${bus.key}`, bus.x - bus.hz * wide, bus.z + bus.hx * wide, BG.HW + Math.abs(wide), BG.NOSE, bus.yaw, !atStop, bus.speed);
        } else host.vehicles.clearObstacle(`bus:${bus.key}`);
        // The player's bus has docked where they rang for (or at the end of its run): off they get.
        if (mine && aboard?.kind === 'bus' && docked(bus) && time - bus.dockedAt > 1.2 && (aboard.ring || bus.last)) busOff(bus);
      }
      stepWater();
      if (aboard?.kind === 'water') {
        // Off at the pier the player asked for, or wherever it ties up for the last time.
        const boat = aboard.boat, run = boat.run!;
        if (boat.mode === 'docked' && run.stop && (aboard.ring || !run.service) && time - run.docked > 1.5) waterOff(network.stops.get(run.stop)!);
        else if (boat.mode === 'idle') waterOff(water!.visits[0].stop);
      }
      // The đò's boatman and the ghe's fisherman keep their hours.
      const hour = view.hours % 24, doBoat = mooredBoat(DO.id), ghe = mooredBoat(GHE.id);
      if (doBoat) host.boats.setCrew(doBoat, aboard?.kind === 'sampan' && aboard.trip === 'ferry' ? 'rowing' : !zombie && inHours(hour, BOATMAN) ? 'boatman' : 'none');
      if (ghe) host.boats.setCrew(ghe, !zombie && inHours(hour, FISHING) && !(aboard?.kind === 'sampan' && aboard.boat === ghe) ? 'fisher' : 'none');
      stepFerry();
      tendSites(hour);
      stepWalkers(dt);
      draw();
      drawWalkers(now);
    },
    /** Head lamps, tail lamps and destination boards glow at night. */
    setNight(night: number) { lamps.value = zombie ? 0.05 : 0.2 + night * 0.9; },
    /** Shadows for the game's blob pass: buses (centre, half width, half length, yaw) and riders. */
    forEachShadow(cb: (x: number, z: number, w: number, l: number, yaw: number) => void) {
      for (const bus of buses) if (bus.phase !== 'off' && !zombie && Math.hypot(bus.x - viewer.x, bus.z - viewer.z) < 160) cb(bus.x, bus.z, 2.9, 12.4, bus.yaw);
      for (const w of walkers) if (Math.hypot(w.x - viewer.x, w.z - viewer.z) < 90) cb(w.x, w.z, 0.8, 0.8, 0);
    },
    /** Buses as moving boxes for bodies on the street (ragdolls.sweep): centre, yaw, half sizes, height, velocity. */
    forEachBody(cb: (x: number, z: number, yaw: number, hw: number, hl: number, h: number, vx: number, vz: number) => void) {
      for (const bus of buses) if (bus.phase !== 'off' && bus.live && !zombie) cb(bus.x, bus.z, bus.yaw, BG.HW, BG.NOSE, 3.1, bus.hx * bus.speed, bus.hz * bus.speed);
    },
    /** For checks and the debug handle: every bus and river bus, and the player's ride. */
    stats() {
      return {
        t, aboard: aboard ? aboard.kind : null, walkers: walkers.length,
        buses: buses.map((b) => ({ key: b.key, phase: b.phase, live: b.live, x: +b.x.toFixed(1), z: +b.z.toFixed(1), yaw: +b.yaw.toFixed(3), steer: +b.steer.toFixed(2), speed: +b.speed.toFixed(2), visit: b.visit, stop: stopOf(b).id, doors: +b.doors.toFixed(2), late: +b.late.toFixed(1), wait: b.wait, by: b.by, lat: +b.lat.toFixed(2) })),
        waterbuses: host.boats.waterbuses.map((b) => ({ key: b.run?.key, mode: b.mode, x: +b.x.toFixed(1), z: +b.z.toFixed(1), speed: +b.speed.toFixed(2), stop: b.run?.stop, service: b.run?.service })),
        docked: Object.fromEntries(wbDocked),
      };
    },
    /** Debug: boards the bus or river bus standing nearest the player, without the walk to its door. */
    boardNearest(x: number, z: number) {
      let best: Bus | null = null;
      for (const b of buses) if (docked(b) && !b.last && (!best || Math.hypot(b.x - x, b.z - z) < Math.hypot(best.x - x, best.z - z))) best = b;
      if (best && Math.hypot(best.x - x, best.z - z) < 40) { boardBus(best); return best.key; }
      for (const [stop, key] of wbDocked) { const st = network.stops.get(stop)!; if (Math.hypot(st.wait.x - x, st.wait.z - z) < 40) { boardWater(key, waterbusOf(key)!); return key; } }
      return null;
    },
    dispose() {
      for (const run of runs) for (const m of run.meshes) { scene.remove(m); m.geometry.dispose(); m.dispose(); }
      for (const m of wheels) { scene.remove(m); m.geometry.dispose(); m.dispose(); }
      for (const b of Object.values(batches)) { scene.remove(b.mesh); b.dispose(); }
      for (const m of Object.values(materials)) m.dispose();
      for (const bus of buses) host.vehicles.clearObstacle(`bus:${bus.key}`);
      material.dispose();
    },
  };
}
export type Buses = ReturnType<typeof createBuses>;
