import { ClientError, MAX_BODY_BYTES, newCode, readPayload, reply, roomCode, sameOrigin } from './room-validation.ts';

/** Finish small rejected uploads before returning their response. In unbundled
 * Workers, an unread HTTP body can stall the next WebSocket upgrade on the
 * development proxy. Do not let an oversized or stalled upload delay rejection.
 */
async function discardRejectedBody(request: Request): Promise<void> {
  if (!request.body || request.bodyUsed || request.body.locked) return;
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const timeout = setTimeout(cancel, 250);
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { cancel(); return; }
    }
  } catch { /* Keep the original origin rejection if the upload fails. */ }
  finally { clearTimeout(timeout); reader.releaseLock(); }
}

/** The namespace owns room routing; movement never passes through D1. */
export async function handleRoom(request: Request, rooms?: DurableObjectNamespace): Promise<Response> {
  try {
    try { sameOrigin(request); }
    catch (error) {
      await discardRejectedBody(request);
      throw error;
    }
    const body = await readPayload(request);
    if (!['create', 'join', 'leave'].includes(String(body.action))) {
      throw new ClientError('Thao tác phòng không hợp lệ. Hãy tải lại trò chơi.');
    }
    if (!rooms) throw new ClientError('Máy chủ nhiều người chơi chưa sẵn sàng.', 503);
    const creating = body.action === 'create';
    for (let attempt = 0; attempt < (creating ? 5 : 1); attempt++) {
      const code = creating ? newCode() : roomCode(body.action === 'join' ? body.code : body.room);
      const response = await rooms.get(rooms.idFromName(code)).fetch(new Request('https://room.internal/lifecycle', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, room: code }),
      }));
      if (creating && response.status === 409) continue;
      // Durable Object fetch responses have immutable headers in workerd.
      // Vinext adds its own response headers, so give it a mutable HTTP copy.
      return new Response(response.body, {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    }
    throw new ClientError('Chưa tạo được mã phòng. Vui lòng thử lại.', 503);
  } catch (error) { return roomError(error); }
}

export async function handleRoomSocket(request: Request, rooms?: DurableObjectNamespace): Promise<Response> {
  try {
    sameOrigin(request);
    if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new ClientError('Cần kết nối WebSocket.', 426);
    if (!rooms) throw new ClientError('Máy chủ nhiều người chơi chưa sẵn sàng.', 503);
    const code = roomCode(new URL(request.url).searchParams.get('room'));
    return await rooms.get(rooms.idFromName(code)).fetch(request);
  } catch (error) { return roomError(error); }
}

export function roomError(error: unknown): Response {
  if (error instanceof ClientError) return reply({ error: error.message }, error.status);
  // Never log requests, credentials, or exceptions that might contain submitted data.
  console.error('Room operation failed.');
  return reply({ error: 'Máy chủ đang bận. Vui lòng thử lại sau ít giây.' }, 503);
}
