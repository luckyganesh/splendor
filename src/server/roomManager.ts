import { loadAllSnapshots, writeSnapshot } from './persistence/snapshot.js';
import { Room } from './room.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid ambiguity
const CODE_LENGTH = 5;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  loadPersistedRooms() {
    const snapshots = loadAllSnapshots(this.dataDir);
    for (const snapshot of snapshots) {
      const room = Room.fromSnapshot(snapshot);
      this.registerRoom(room);
    }
    if (snapshots.length > 0) {
      console.log(`Restored ${snapshots.length} room(s) from ${this.dataDir}`);
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
