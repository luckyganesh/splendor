import { describe, expect, it } from 'vitest';
import { Room } from './room.js';

function fakeSocket() {
  return { send: () => {}, readyState: 1 } as any;
}

describe('Room.join — reconnect by name', () => {
  it('lets a brand-new name join while the room is in the lobby', () => {
    const { room } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    const result = room.join('Bob');
    expect(result.ok).toBe(true);
  });

  it('rejects a brand-new name once the game has started', () => {
    const { room } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    room.join('Bob');
    room.startGame(room.hostPlayerId);
    const result = room.join('Carol');
    expect(result).toEqual({ ok: false, code: 'GAME_ALREADY_STARTED', message: 'This game has already started' });
  });

  it('rejects a name that is still connected', () => {
    const { room, playerId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    room.attachSocket(playerId, fakeSocket());
    const result = room.join('Alice');
    expect(result).toEqual({ ok: false, code: 'NAME_TAKEN', message: 'That name is already connected in this room' });
  });

  it('reclaims a disconnected player\'s seat by name, even mid-game', () => {
    const { room, playerId: aliceId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    const bobJoin = room.join('Bob');
    expect(bobJoin.ok).toBe(true);
    const bobId = (bobJoin as { ok: true; playerId: string }).playerId;

    room.attachSocket(aliceId, fakeSocket());
    room.attachSocket(bobId, fakeSocket());
    room.startGame(aliceId);
    expect(room.phase).toBe('in_progress');

    // Bob loses connection (crashed browser / different device with no localStorage identity)
    room.detachSocket(bobId);

    const reconnect = room.join('Bob');
    expect(reconnect.ok).toBe(true);
    if (reconnect.ok) {
      expect(reconnect.playerId).toBe(bobId); // same seat, not a new player
      expect(reconnect.secret).toBeTruthy();
    }

    // The old secret no longer works, but the freshly issued one does.
    expect(room.rejoin(bobId, 'stale-secret-from-before')).toBeNull();
    if (reconnect.ok) {
      expect(room.rejoin(bobId, reconnect.secret)?.id).toBe(bobId);
    }
  });

  it('is case-insensitive when matching an existing name', () => {
    const { room, playerId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    room.detachSocket(playerId); // host starts disconnected in this scenario
    const result = room.join('ALICE');
    expect(result).toEqual(expect.objectContaining({ ok: true, playerId }));
  });
});
