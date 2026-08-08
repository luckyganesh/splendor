import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Room } from './room.js';
import type { RoomManager } from './roomManager.js';

// A turn in this game takes seconds, not minutes — a room that's "in_progress"
// but hasn't seen an action, join, or chat message in this long, or has nobody
// currently connected, is sitting open rather than actually being played.
const RECENTLY_ACTIVE_MS = 10 * 60 * 1000;

function isBeingPlayed(room: Room): boolean {
  if (room.phase !== 'in_progress') return false;
  if (Date.now() - new Date(room.updatedAt).getTime() > RECENTLY_ACTIVE_MS) return false;
  return room.players.some((p) => p.socket !== null);
}

export function createHealthHandler(roomManager: RoomManager) {
  return function handleHealth(_req: IncomingMessage, res: ServerResponse) {
    const rooms = roomManager.allRooms();
    const waiting = rooms.filter((r) => r.phase === 'lobby').length;
    const inProgress = rooms.filter((r) => r.phase === 'in_progress');
    const active = inProgress.filter((r) => isBeingPlayed(r)).length;
    const idle = inProgress.length - active;
    const completed = rooms.filter((r) => r.phase === 'finished').length;

    const body = JSON.stringify({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      rooms: {
        total: rooms.length,
        waiting,
        active,
        idle,
        completed,
      },
    });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  };
}
