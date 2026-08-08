import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RoomManager } from './roomManager.js';

export function createHealthHandler(roomManager: RoomManager) {
  return function handleHealth(_req: IncomingMessage, res: ServerResponse) {
    const rooms = roomManager.allRooms();
    const waiting = rooms.filter((r) => r.phase === 'lobby').length;
    const active = rooms.filter((r) => r.phase === 'in_progress').length;
    const completed = rooms.filter((r) => r.phase === 'finished').length;

    const body = JSON.stringify({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      rooms: {
        total: rooms.length,
        waiting,
        active,
        completed,
      },
    });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  };
}
