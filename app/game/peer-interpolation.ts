import type { PeerState } from '../../lib/multiplayer-protocol.ts';

export const INTERPOLATION_DELAY_MS = 120;
export const MAX_EXTRAPOLATION_MS = 120;
const MAX_SAMPLES = 32;
const MAX_SAMPLE_GAP_MS = 1000;
const MAX_VELOCITY = 50;

export type PeerPose = { x: number; z: number; angle: number; speed: number; altitude: number };
type Sample = PeerPose & { time: number; vx: number; vz: number; down: boolean; vehicle: string; hero: string };

/** Map the server epoch onto the browser's monotonic clock, without using Date.now().
 * The least delayed recent arrival estimates the offset; slow corrections prevent
 * network jitter from moving the render clock backwards or abruptly jumping it.
 * One-way transit time is unknowable here, so it remains part of display latency.
 */
export function createSnapshotClock() {
  let offsets: number[] = [];
  let offset: number | undefined;
  let latestServerTime = -Infinity;
  let lastRenderTime = -Infinity;
  return {
    observe(serverTime: number, receivedAt: number): boolean {
      if (!Number.isFinite(serverTime) || !Number.isFinite(receivedAt) || serverTime <= latestServerTime) return false;
      latestServerTime = serverTime;
      offsets.push(receivedAt - serverTime);
      if (offsets.length > 64) offsets.shift();
      const best = Math.min(...offsets);
      offset = offset === undefined ? best : offset + Math.max(-5, Math.min(5, best - offset));
      return true;
    },
    renderTime(now: number): number {
      if (offset === undefined) return -Infinity;
      lastRenderTime = Math.max(lastRenderTime, now - offset - INTERPOLATION_DELAY_MS);
      return lastRenderTime;
    },
    reset() {
      offsets = [];
      offset = undefined;
      latestServerTime = lastRenderTime = -Infinity;
    },
  };
}

function pose(sample: Sample): PeerPose {
  return { x: sample.x, z: sample.z, angle: sample.angle, speed: sample.speed, altitude: sample.altitude };
}

/** A small per-peer history. Rendering is timestamp based, independent of frame
 * rate and of the local simulation's slow-motion weapon wheel.
 */
export function createPeerInterpolator() {
  let samples: Sample[] = [];
  return {
    push(peer: PeerState, serverTime: number): boolean {
      const time = Number.isFinite(peer.updatedAt) ? Math.min(peer.updatedAt!, serverTime) : serverTime;
      if (![time, peer.x, peer.z, peer.angle, peer.speed, peer.altitude ?? 0].every(Number.isFinite)) return false;
      const previous = samples.at(-1);
      if (previous && time <= previous.time) return false;
      const elapsed = previous ? (time - previous.time) / 1000 : 0;
      const dx = previous ? peer.x - previous.x : 0;
      const dz = previous ? peer.z - previous.z : 0;
      const distance = Math.hypot(dx, dz);
      const vehicle = peer.vehicle ?? (peer.riding ? 'scooter' : 'foot');
      const down = Boolean(peer.down);
      const hero = peer.hero ?? 'none';
      // Landing may retain altitude while flying is false. Incompatible modes
      // always use ground level, including older clients without power fields.
      const altitude = hero === 'ironman' && !peer.riding && vehicle === 'foot' && !down
        ? Math.min(8, Math.max(0, peer.altitude ?? 0)) : 0;
      const discontinuity = previous && (
        down !== previous.down || vehicle !== previous.vehicle || hero !== previous.hero ||
        time - previous.time > MAX_SAMPLE_GAP_MS ||
        distance > Math.max(8, elapsed * MAX_VELOCITY)
      );
      let vx = Number.isFinite(peer.vx) ? peer.vx! : elapsed ? dx / elapsed : 0;
      let vz = Number.isFinite(peer.vz) ? peer.vz! : elapsed ? dz / elapsed : 0;
      // A stationary report supersedes old velocity, including movement blocked
      // by a wall. Never extrapolate across a respawn or a vehicle change.
      if (down || discontinuity || previous && distance < 0.001) vx = vz = 0;
      const velocity = Math.hypot(vx, vz);
      if (velocity > MAX_VELOCITY) { vx *= MAX_VELOCITY / velocity; vz *= MAX_VELOCITY / velocity; }
      if (discontinuity) samples = [];
      samples.push({ time, x: peer.x, z: peer.z, angle: peer.angle, speed: peer.speed, altitude, vx, vz, vehicle, down, hero });
      if (samples.length > MAX_SAMPLES) samples.shift();
      return true;
    },
    sample(renderTime: number): PeerPose | null {
      if (!samples.length) return null;
      const first = samples[0];
      if (renderTime <= first.time) return pose(first);
      for (let i = 1; i < samples.length; i++) {
        const next = samples[i];
        if (renderTime > next.time) continue;
        const previous = samples[i - 1];
        const amount = (renderTime - previous.time) / (next.time - previous.time);
        const angle = Math.atan2(Math.sin(next.angle - previous.angle), Math.cos(next.angle - previous.angle));
        return {
          x: previous.x + (next.x - previous.x) * amount,
          z: previous.z + (next.z - previous.z) * amount,
          angle: previous.angle + angle * amount,
          speed: previous.speed + (next.speed - previous.speed) * amount,
          altitude: previous.altitude + (next.altitude - previous.altitude) * amount,
        };
      }
      const latest = samples[samples.length - 1];
      const age = renderTime - latest.time;
      const seconds = Math.min(MAX_EXTRAPOLATION_MS, age) / 1000;
      return {
        x: latest.x + latest.vx * seconds,
        z: latest.z + latest.vz * seconds,
        angle: latest.angle,
        // Never project upward/downward forever during packet loss.
        altitude: latest.altitude,
        speed: age >= MAX_EXTRAPOLATION_MS || Math.hypot(latest.vx, latest.vz) < 0.001 ? 0 : latest.speed,
      };
    },
    reset() { samples = []; },
  };
}
