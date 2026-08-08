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
  it('reports ok with uptime and the current room count', () => {
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
    expect(body.rooms).toBe(2);
    expect(typeof body.uptimeSeconds).toBe('number');
  });
});
