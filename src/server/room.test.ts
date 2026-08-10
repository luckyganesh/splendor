import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Room — bot roster', () => {
  it('gives each bot a distinct flavor name drawn from its difficulty pool', () => {
    const { room, playerId: hostId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    expect(room.addBot(hostId, 'easy')).toBeNull();
    expect(room.addBot(hostId, 'easy')).toBeNull();
    expect(room.addBot(hostId, 'hard')).toBeNull();

    const bots = room.players.filter((p) => p.isBot);
    expect(bots.every((b) => b.socket === null)).toBe(true);
    expect(new Set(bots.map((b) => b.name)).size).toBe(3); // all distinct
    expect(bots[0].name).not.toBe('Easy Bot 1'); // flavor name, not the old generic label
  });

  it('never reuses a name already taken in the room, even across difficulties', () => {
    const { room, playerId: hostId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    room.addBot(hostId, 'easy');
    room.addBot(hostId, 'medium');
    room.addBot(hostId, 'hard');
    const names = room.players.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('does not hand out a removed bot\'s name to the next bot added', () => {
    const { room, playerId: hostId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    room.addBot(hostId, 'easy');
    const firstName = room.players.find((p) => p.isBot)!.name;
    room.removeBot(hostId, room.players.find((p) => p.isBot)!.id);

    room.addBot(hostId, 'easy');
    const secondName = room.players.find((p) => p.isBot)!.name;
    expect(secondName).not.toBe(firstName);
  });

  it('rejects a non-host trying to add or remove a bot', () => {
    const { room, playerId: hostId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    const bobJoin = room.join('Bob');
    const bobId = (bobJoin as { ok: true; playerId: string }).playerId;

    expect(room.addBot(bobId, 'easy')).toEqual({
      type: 'error',
      code: 'NOT_YOUR_TURN',
      message: 'Only the host can add bots',
    });

    room.addBot(hostId, 'easy');
    const botId = room.players.find((p) => p.isBot)!.id;
    expect(room.removeBot(bobId, botId)).toEqual({
      type: 'error',
      code: 'NOT_YOUR_TURN',
      message: 'Only the host can remove bots',
    });
  });

  it('refuses to add a bot once the room is full', () => {
    const { room, playerId: hostId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    room.addBot(hostId, 'easy');
    room.addBot(hostId, 'easy');
    room.addBot(hostId, 'easy');
    expect(room.players.length).toBe(4);
    expect(room.addBot(hostId, 'easy')).toEqual({ type: 'error', code: 'ROOM_FULL', message: 'Room is full' });
  });

  it('errors removing an id that is not a bot in this room', () => {
    const { room, playerId: hostId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    expect(room.removeBot(hostId, hostId)).toEqual({
      type: 'error',
      code: 'BOT_NOT_FOUND',
      message: 'No such bot in this room',
    });
    expect(room.removeBot(hostId, 'nonexistent')).toEqual({
      type: 'error',
      code: 'BOT_NOT_FOUND',
      message: 'No such bot in this room',
    });
  });

  it('lets a solo host start a game once a bot fills the second seat', () => {
    const { room, playerId: hostId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    room.addBot(hostId, 'medium');
    const error = room.startGame(hostId);
    expect(error).toBeNull();
    expect(room.phase).toBe('in_progress');
  });
});

describe('Room — bot turns', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-plays bot turns until it is the human player\'s turn again', () => {
    const { room, playerId: hostId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    room.addBot(hostId, 'easy');
    room.addBot(hostId, 'easy');
    room.startGame(hostId);
    room.scheduleBotTurnIfNeeded();

    const internal = () => room.engine!.getInternalState();
    expect(internal().currentPlayerIndex).toBe(0); // host goes first

    // Host takes a turn, then both bots should play automatically.
    room.applyGameplayAction(hostId, { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    room.scheduleBotTurnIfNeeded();
    expect(internal().currentPlayerIndex).toBe(1); // bot 1's turn, not yet run

    vi.runAllTimers();

    expect(internal().currentPlayerIndex).toBe(0); // back around to the host
    expect(internal().turnNumber).toBeGreaterThan(1);
  });

  it('does not schedule a bot turn while it is a human seat\'s turn', () => {
    const { room, playerId: hostId } = Room.createNew('ABCDE', 'Alice', new Date().toISOString());
    room.addBot(hostId, 'easy');
    room.startGame(hostId);
    room.scheduleBotTurnIfNeeded();
    expect(vi.getTimerCount()).toBe(0);
  });
});
