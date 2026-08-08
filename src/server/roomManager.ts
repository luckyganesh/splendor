import { deleteSnapshot, loadAllSnapshots, writeSnapshot } from './persistence/snapshot.js';
import { Room } from './room.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid ambiguity
const CODE_LENGTH = 5;

// Rooms nobody has touched (moved, chatted, joined) in this long are considered
// abandoned. Measured from last activity, not creation, so a long-running active
// game is never cut off mid-play.
export const ROOM_EXPIRY_MS = 8 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private dataDir: string;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  loadPersistedRooms() {
    const snapshots = loadAllSnapshots(this.dataDir);
    const now = Date.now();
    let restored = 0;
    let pruned = 0;
    for (const snapshot of snapshots) {
      if (now - new Date(snapshot.updatedAt).getTime() > ROOM_EXPIRY_MS) {
        deleteSnapshot(this.dataDir, snapshot.roomCode);
        pruned++;
        continue;
      }
      const room = Room.fromSnapshot(snapshot);
      this.registerRoom(room);
      restored++;
    }
    if (restored > 0) console.log(`Restored ${restored} room(s) from ${this.dataDir}`);
    if (pruned > 0) console.log(`Pruned ${pruned} expired room(s) (inactive >8h) from ${this.dataDir}`);
  }

  /** Periodically evicts rooms that have gone idle for ROOM_EXPIRY_MS, so a
      long-running server doesn't accumulate abandoned rooms in memory or on
      disk between restarts. Never evicts a room with a currently-connected
      player, however stale its last activity looks. */
  startExpirySweep(intervalMs = SWEEP_INTERVAL_MS) {
    this.sweepTimer = setInterval(() => this.pruneExpiredRooms(), intervalMs);
    this.sweepTimer.unref?.();
  }

  stopExpirySweep() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  private pruneExpiredRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - new Date(room.updatedAt).getTime() <= ROOM_EXPIRY_MS) continue;
      if (room.players.some((p) => p.socket !== null)) continue;
      this.rooms.delete(code);
      deleteSnapshot(this.dataDir, code);
      console.log(`Pruned expired room ${code} (inactive >8h)`);
    }
  }

  private generateCode(): string {
    let code: string;
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(
        '',
      );
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostName: string): { room: Room; playerId: string; secret: string } {
    const code = this.generateCode();
    const { room, playerId, secret } = Room.createNew(code, hostName, new Date().toISOString());
    this.registerRoom(room);
    return { room, playerId, secret };
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  registerRoom(room: Room) {
    room.onChange = () => this.onRoomChange(room);
    this.rooms.set(room.roomCode, room);
  }

  allRooms(): Room[] {
    return [...this.rooms.values()];
  }

  private onRoomChange(room: Room) {
    writeSnapshot(this.dataDir, room.toSnapshot());
  }
}
