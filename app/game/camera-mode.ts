export type CameraMode = 'third-person' | 'first-person';
export type CameraContext = { running: boolean; interior: boolean; counter: boolean; down: boolean };
export type EyeKind = 'foot' | 'swim' | 'car' | 'scooter' | 'boat' | 'passenger' | 'seat' | 'glide';
export const EYE_HEIGHT: Record<EyeKind, number> = { foot: 1.55, swim: 0.26, car: 0.72, scooter: 0.92, boat: 1.65, passenger: 0.88, seat: 0.88, glide: 1.5 };
export function firstPersonAllowed(mode: CameraMode, context: CameraContext) {
  return mode === 'first-person' && context.running && !context.interior && !context.counter && !context.down;
}
export function cameraDirection(yaw: number, pitch: number) {
  const p = Math.max(-1.3, Math.min(1.3, pitch));
  return { x: Math.sin(yaw) * Math.cos(p), y: Math.sin(p), z: Math.cos(yaw) * Math.cos(p) };
}
export function firstPersonPose(anchor: { x: number; y: number; z: number; kind: EyeKind }, yaw: number, pitch: number) {
  return { eye: { x: anchor.x, y: anchor.y + EYE_HEIGHT[anchor.kind], z: anchor.z }, direction: cameraDirection(yaw, pitch) };
}
export function createCameraMode() {
  let mode: CameraMode = 'third-person', yaw = 0, pitch = 0;
  let carrier: string | null = null, carrierYaw = 0;
  return {
    get mode() { return mode; }, get yaw() { return yaw; }, get pitch() { return pitch; },
    toggle(heading: number) { mode = mode === 'third-person' ? 'first-person' : 'third-person'; if (mode === 'first-person') { yaw = heading; pitch = 0; carrier = null; } return mode; },
    rotate(dx: number, dy: number) { if (![dx, dy].every(Number.isFinite)) return; yaw -= dx * 0.0038; pitch = Math.max(-1.3, Math.min(1.3, pitch - dy * 0.0033)); },
    reset(heading: number) { yaw = heading; pitch = 0; carrier = null; },
    /** Vehicle turning carries the head with it; a drag remains a relative look around the cabin. */
    followCarrier(id: string | null, heading: number) {
      if (id !== carrier) { carrier = id; carrierYaw = heading; return; }
      if (id) yaw += Math.atan2(Math.sin(heading - carrierYaw), Math.cos(heading - carrierYaw));
      carrierYaw = heading;
    },
  };
}
