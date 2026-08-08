import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RoomManager } from './roomManager.js';

export function createHealthHandler(roomManager: RoomManager) {
  return function handleHealth(_req: IncomingMessage, res: ServerResponse) {
    const body = JSON.stringify({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      rooms: roomManager.allRooms().length,
    });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  };
}
