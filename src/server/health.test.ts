import { describe, expect, it } from 'vitest';
import { createHealthHandler } from './health.js';
import { RoomManager } from './roomManager.js';

function fakeResponse() {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(code: number, headers: Record<string, string>) {
      res.statusCode = code;
      res.headers = headers;
    },
    end(chunk: string) {
      res.body = chunk;
    },
  };
  return res;
}

describe('health handler', () => {
  it('reports ok with uptime and the total room count', () => {
    const manager = new RoomManager('/tmp/does-not-matter');
    manager.createRoom('Alice');
    manager.createRoom('Bob');

    const handler = createHealthHandler(manager);
    const res = fakeResponse();
    handler({} as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.rooms.total).toBe(2);
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('only counts an in-progress room as "active" if it has a connected player and recent activity', () => {
    const manager = new RoomManager('/tmp/does-not-matter');

    manager.createRoom('Alice'); // left in the lobby, never started

    const { room: playedRoom, playerId: bobId } = manager.createRoom('Bob');
    playedRoom.join('Carol');
    playedRoom.startGame(bobId);
    playedRoom.attachSocket(bobId, { send: () => {} } as any); // genuinely being played right now

    const { room: abandonedRoom, playerId: daveId } = manager.createRoom('Dave');
    abandonedRoom.join('Eve');
    abandonedRoom.startGame(daveId);
    // nobody connected, and/or nobody has touched it in a while — in_progress but idle

    const { room: staleRoom, playerId: frankId } = manager.createRoom('Frank');
    staleRoom.join('Grace');
    staleRoom.startGame(frankId);
    staleRoom.attachSocket(frankId, { send: () => {} } as any);
    staleRoom.updatedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString(); // connected, but stale

    const { room: finishedRoom, playerId: heidiId } = manager.createRoom('Heidi');
    finishedRoom.join('Ivan');
    finishedRoom.startGame(heidiId);
    finishedRoom.engine!.getInternalState().phase = 'finished';

    const handler = createHealthHandler(manager);
    const res = fakeResponse();
    handler({} as any, res);

    const body = JSON.parse(res.body);
    expect(body.rooms).toEqual({ total: 5, waiting: 1, active: 1, idle: 2, completed: 1 });
  });
});
