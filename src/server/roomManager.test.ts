import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeSnapshot, type RoomSnapshot } from './persistence/snapshot.js';
import { ROOM_EXPIRY_MS, RoomManager } from './roomManager.js';

function snapshot(roomCode: string, updatedAt: string): RoomSnapshot {
  return {
    schemaVersion: 1,
    roomCode,
    createdAt: updatedAt,
    updatedAt,
    hostPlayerId: 'p1',
    players: [{ id: 'p1', name: 'Alice', secretHash: 'x' }],
    engineState: null,
    chatLog: [],
  };
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'splendor-room-manager-test-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('RoomManager — expiry', () => {
  it('restores a recently-active room and prunes one idle for more than 8h', () => {
    writeSnapshot(dataDir, snapshot('FRESH', hoursAgo(1)));
    writeSnapshot(dataDir, snapshot('STALE', hoursAgo(9)));

    const manager = new RoomManager(dataDir);
    manager.loadPersistedRooms();

    expect(manager.getRoom('FRESH')).toBeDefined();
    expect(manager.getRoom('STALE')).toBeUndefined();
    expect(readdirSync(dataDir)).toEqual(['FRESH.json']);
  });

  it('keeps a room exactly at the boundary and prunes one just past it', () => {
    writeSnapshot(dataDir, snapshot('BOUNDARY', hoursAgo(ROOM_EXPIRY_MS / 3_600_000 - 0.01)));
    writeSnapshot(dataDir, snapshot('PAST', hoursAgo(ROOM_EXPIRY_MS / 3_600_000 + 0.01)));

    const manager = new RoomManager(dataDir);
    manager.loadPersistedRooms();

    expect(manager.getRoom('BOUNDARY')).toBeDefined();
    expect(manager.getRoom('PAST')).toBeUndefined();
  });

  it('sweeps an idle in-memory room and deletes its snapshot, but leaves connected rooms alone', () => {
    writeSnapshot(dataDir, snapshot('IDLE', hoursAgo(1)));
    writeSnapshot(dataDir, snapshot('BUSY', hoursAgo(1)));
    const manager = new RoomManager(dataDir);
    manager.loadPersistedRooms();

    const idleRoom = manager.getRoom('IDLE')!;
    const busyRoom = manager.getRoom('BUSY')!;
    idleRoom.updatedAt = hoursAgo(9);
    busyRoom.updatedAt = hoursAgo(9);
    busyRoom.players[0].socket = { send: () => {} } as any; // still connected despite stale timestamp

    (manager as unknown as { pruneExpiredRooms(): void }).pruneExpiredRooms();

    expect(manager.getRoom('IDLE')).toBeUndefined();
    expect(manager.getRoom('BUSY')).toBeDefined();
    expect(readdirSync(dataDir).sort()).toEqual(['BUSY.json']);
  });
});
