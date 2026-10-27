import type { IncomingHit, OutgoingHit, PlayerState } from './multiplayer-protocol.ts';
import { PEER_BOUNDS } from './world-bounds.ts';

export const ACTIVE_MS = 15_000;
export const SESSION_MS = 30 * 60_000;
export const MAX_PLAYERS = 8;
export const MAX_BODY_BYTES = 4096;
export const COLORS = ['#ffd15c', '#62dfc6', '#ff8d83', '#b6a0ff', '#72c8ff', '#ffad70', '#d4ec7e', '#f9a9de'];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Payload = Record<string, unknown>;
export class ClientError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function reply(body: unknown, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }); }
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ClientError('Nguồn kết nối không hợp lệ.', 403);
}
export function payload(value: unknown): Payload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientError('Dữ liệu JSON không hợp lệ.');
  return value as Payload;
}
export async function readPayload(request: Request): Promise<Payload> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new ClientError('Vui lòng gửi dữ liệu JSON.', 415);
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new ClientError('Dữ liệu gửi lên quá lớn.', 413);
  if (!request.body) throw new ClientError('Dữ liệu phòng đang trống.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new ClientError('Dữ liệu gửi lên quá lớn.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return payload(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
  catch { throw new ClientError('Dữ liệu JSON không hợp lệ.'); }
}
export function playerName(value: unknown): string {
  if (typeof value !== 'string') throw new ClientError('Hãy nhập tên nhân vật.');
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!name || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(name)) throw new ClientError('Tên nhân vật không hợp lệ.');
  if ([...name].length > 18) throw new ClientError('Tên nhân vật tối đa 18 ký tự.');
  return name;
}
export function roomCode(value: unknown): string {
  if (typeof value !== 'string') throw new ClientError('Hãy nhập mã phòng gồm 6 ký tự.');
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new ClientError('Mã phòng gồm 6 chữ cái hoặc chữ số.');
  return code;
}
export function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
export function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function numberIn(value: unknown, min: number, max: number) {
  if (!finite(value)) throw new ClientError('Trạng thái nhân vật không hợp lệ.');
  return clamp(value, min, max);
}
function integer(value: unknown, min: number, max: number, fallback: number) { return finite(value) ? Math.round(clamp(value, min, max)) : fallback; }
function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T { return options.includes(value as T) ? value as T : fallback; }
export function playerState(value: unknown): PlayerState {
  const state = payload(value);
  if (typeof state.riding !== 'boolean') throw new ClientError('Trạng thái phương tiện không hợp lệ.');
  const angle = numberIn(state.angle, -1_000_000, 1_000_000);
  const x = numberIn(state.x, PEER_BOUNDS.minX, PEER_BOUNDS.maxX), z = numberIn(state.z, PEER_BOUNDS.minZ, PEER_BOUNDS.maxZ);
  const hero = oneOf(state.hero, ['none', 'ironman', 'thor', 'hulk', 'captain'] as const, 'none');
  const vehicle = oneOf(state.vehicle, ['foot', 'scooter', 'car', 'police', 'boat', 'swim'] as const, state.riding ? 'scooter' : 'foot');
  const down = state.down === true;
  const canFly = hero === 'ironman' && !state.riding && vehicle === 'foot' && !down;
  const altitude = state.altitude === undefined ? 0 : numberIn(state.altitude, 0, 8);
  const powerSeq = state.powerSeq === undefined ? 0 : state.powerSeq;
  if (!Number.isSafeInteger(powerSeq) || (powerSeq as number) < 0) throw new ClientError('Số thứ tự sức mạnh không hợp lệ.');
  return {
    x, z,
    angle: ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI,
    riding: state.riding, speed: numberIn(state.speed, -36, 36), score: Math.floor(numberIn(state.score, 0, 1_000_000)),
    health: integer(state.health, 0, 100, 100), weapon: oneOf(state.weapon, ['fists', 'pistol', 'shotgun', 'smg', 'grenade', 'rpg'] as const, 'fists'),
    vehicle, down, firing: state.firing === true, wanted: integer(state.wanted, 0, 5, 0),
    hero, altitude: canFly ? altitude : 0, flying: canFly && state.flying === true,
    powerSeq: powerSeq as number,
    powerKind: oneOf(state.powerKind, ['none', 'ironman', 'thor', 'hulk', 'captain'] as const, 'none'),
    powerX: state.powerX === undefined ? x : numberIn(state.powerX, PEER_BOUNDS.minX, PEER_BOUNDS.maxX),
    powerY: state.powerY === undefined ? 1.1 : numberIn(state.powerY, -32, 48),
    powerZ: state.powerZ === undefined ? z : numberIn(state.powerZ, PEER_BOUNDS.minZ, PEER_BOUNDS.maxZ),
  };
}
/** The layout version a client sent on create or join (lib/world-bounds.ts WORLD_VERSION); clients from before it was sent build version 1. */
export function worldVersion(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_000_000) throw new ClientError('Phiên bản bản đồ không hợp lệ. Hãy tải lại trò chơi.');
  return value;
}
export function playerHit(value: unknown, attacker: string): OutgoingHit {
  const hit = payload(value);
  if (typeof hit.target !== 'string' || !UUID.test(hit.target) || hit.target === attacker || !finite(hit.damage) || !finite(hit.dx) || !finite(hit.dz)) throw new ClientError('Đòn đánh không hợp lệ.');
  return { target: hit.target, damage: Math.round(clamp(hit.damage, 1, 100)), dx: clamp(hit.dx, -1, 1), dz: clamp(hit.dz, -1, 1) };
}
export function incomingHit(hit: OutgoingHit, attacker: string, name: string): IncomingHit { return { attacker, name, damage: hit.damage, dx: hit.dx, dz: hit.dz }; }
export function randomHex() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
export function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => alphabet[b & 31]).join('');
}
export async function hashToken(token: unknown) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new ClientError('Phiên chơi không hợp lệ. Hãy vào lại phòng.', 401);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
