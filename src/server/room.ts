import { randomBytes, createHash } from 'node:crypto';
import type { WebSocket } from 'ws';
import { MAX_PLAYERS, MIN_PLAYERS } from '../shared/constants.js';
import type { ClientMessage, ErrorCode, ServerMessage } from '../shared/protocol.js';
import type { ChatMessage, GameStateView, PlayerView } from '../shared/types.js';
import { GameEngine } from '../engine/engine.js';
import { createGame, repairNobleConsistency } from '../engine/setup.js';
import type { RoomSnapshot } from './persistence/snapshot.js';

const MAX_CHAT_HISTORY = 200;
const MAX_CHAT_MESSAGE_LENGTH = 500;

export interface RoomPlayer {
  id: string;
  name: string;
  secretHash: string;
  socket: WebSocket | null;
}

export type GameplayMessage = Extract<
  ClientMessage,
  {
    type:
      | 'take_tokens'
      | 'take_two_same'
      | 'reserve_card'
      | 'purchase_card'
      | 'discard_tokens'
      | 'choose_noble'
      | 'pass';
  }
>;

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function generateSecret(): string {
  return randomBytes(16).toString('hex');
}

function generatePlayerId(): string {
  return randomBytes(8).toString('hex');
}

export class Room {
  roomCode: string;
  hostPlayerId: string;
  players: RoomPlayer[] = [];
  engine: GameEngine | null = null;
  chatLog: ChatMessage[] = [];
  createdAt: string;
  updatedAt: string;
  onChange: (() => void) | null = null;

  constructor(roomCode: string, hostPlayerId: string, createdAt: string) {
    this.roomCode = roomCode;
    this.hostPlayerId = hostPlayerId;
    this.createdAt = createdAt;
    this.updatedAt = createdAt;
  }

  get phase(): 'lobby' | 'in_progress' | 'finished' {
    return this.engine ? this.engine.currentView(null).phase : 'lobby';
  }

  static createNew(roomCode: string, hostName: string, now: string): { room: Room; playerId: string; secret: string } {
    const playerId = generatePlayerId();
    const secret = generateSecret();
    const room = new Room(roomCode, playerId, now);
    room.players.push({ id: playerId, name: hostName, secretHash: hashSecret(secret), socket: null });
    return { room, playerId, secret };
  }

  /**
   * Joining with a name that already belongs to a currently-disconnected
   * player reclaims that seat instead of erroring — this is what lets
   * someone who lost their connection (crashed browser, different device
   * with no localStorage identity) get back into an in-progress game using
   * only the room code and their name. A name still connected elsewhere
   * can't be hijacked this way.
   */
  join(playerName: string): { ok: true; playerId: string; secret: string } | { ok: false; code: ErrorCode; message: string } {
    const existing = this.players.find((p) => p.name.toLowerCase() === playerName.toLowerCase());
    if (existing) {
      if (existing.socket) {
        return { ok: false, code: 'NAME_TAKEN', message: 'That name is already connected in this room' };
      }
      const secret = generateSecret();
      existing.secretHash = hashSecret(secret);
      return { ok: true, playerId: existing.id, secret };
    }
    if (this.phase !== 'lobby') return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'This game has already started' };
    if (this.players.length >= MAX_PLAYERS) return { ok: false, code: 'ROOM_FULL', message: 'Room is full' };
    const playerId = generatePlayerId();
    const secret = generateSecret();
    this.players.push({ id: playerId, name: playerName, secretHash: hashSecret(secret), socket: null });
    return { ok: true, playerId, secret };
  }

  rejoin(playerId: string, secret: string): RoomPlayer | null {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return null;
    if (player.secretHash !== hashSecret(secret)) return null;
    return player;
  }

  attachSocket(playerId: string, ws: WebSocket) {
    const player = this.players.find((p) => p.id === playerId);
    if (player) player.socket = ws;
  }

  detachSocket(playerId: string) {
    const player = this.players.find((p) => p.id === playerId);
    if (player && player.socket) player.socket = null;
  }

  startGame(requestingPlayerId: string): ServerMessage | null {
    if (this.phase !== 'lobby') return { type: 'error', code: 'GAME_ALREADY_STARTED', message: 'Game already started' };
    if (requestingPlayerId !== this.hostPlayerId) {
      return { type: 'error', code: 'NOT_YOUR_TURN', message: 'Only the host can start the game' };
    }
    if (this.players.length < MIN_PLAYERS || this.players.length > MAX_PLAYERS) {
      return { type: 'error', code: 'NOT_ENOUGH_PLAYERS', message: `Need ${MIN_PLAYERS}-${MAX_PLAYERS} players to start` };
    }
    const state = createGame(
      this.roomCode,
      this.players.map((p) => ({ id: p.id, name: p.name })),
    );
    this.engine = new GameEngine(state);
    return null;
  }

  applyGameplayAction(playerId: string, message: GameplayMessage): ServerMessage | null {
    if (!this.engine) return { type: 'error', code: 'GAME_NOT_IN_PROGRESS', message: 'Game has not started yet' };
    const result = this.engine.applyAction(playerId, message);
    if (!result.ok) return { type: 'error', code: result.code, message: result.message };
    return null;
  }

  currentView(viewerPlayerId: string | null): GameStateView {
    if (this.engine) return this.engine.currentView(viewerPlayerId);
    return this.lobbyView();
  }

  private lobbyView(): GameStateView {
    const players: PlayerView[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.socket !== null,
      tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
      bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
      purchasedCards: [],
      reservedCards: [],
      nobles: [],
      points: 0,
    }));
    return {
      roomCode: this.roomCode,
      phase: 'lobby',
      players,
      currentPlayerIndex: 0,
      turnNumber: 0,
      bank: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
      tiers: [
        { tier: 1, faceUp: [null, null, null, null], remainingInDeck: 0 },
        { tier: 2, faceUp: [null, null, null, null], remainingInDeck: 0 },
        { tier: 3, faceUp: [null, null, null, null], remainingInDeck: 0 },
      ],
      nobles: [],
      pendingAction: null,
      finalRoundTriggeredBy: null,
      winnerIds: null,
    };
  }

  broadcast() {
    for (const player of this.players) {
      if (!player.socket) continue;
      const view = this.currentView(player.id);
      const withConnected: GameStateView = {
        ...view,
        players: view.players.map((pv) => ({
          ...pv,
          connected: this.players.find((p) => p.id === pv.id)?.socket !== null,
        })),
      };
      const message: ServerMessage = { type: 'state', state: withConnected };
      player.socket.send(JSON.stringify(message));
    }
    this.updatedAt = new Date().toISOString();
    this.onChange?.();
  }

  sendTo(playerId: string, message: ServerMessage) {
    const player = this.players.find((p) => p.id === playerId);
    player?.socket?.send(JSON.stringify(message));
  }

  addChatMessage(playerId: string, text: string): ChatMessage | null {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return null;
    const trimmed = text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
    if (!trimmed) return null;

    const message: ChatMessage = {
      id: randomBytes(6).toString('hex'),
      playerId: player.id,
      playerName: player.name,
      text: trimmed,
      ts: new Date().toISOString(),
    };
    this.chatLog.push(message);
    if (this.chatLog.length > MAX_CHAT_HISTORY) this.chatLog.shift();
    return message;
  }

  broadcastChat(message: ChatMessage) {
    const payload: ServerMessage = { type: 'chat', message };
    for (const player of this.players) {
      player.socket?.send(JSON.stringify(payload));
    }
    this.updatedAt = new Date().toISOString();
    this.onChange?.();
  }

  toSnapshot(): RoomSnapshot {
    return {
      schemaVersion: 1,
      roomCode: this.roomCode,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      hostPlayerId: this.hostPlayerId,
      players: this.players.map((p) => ({ id: p.id, name: p.name, secretHash: p.secretHash })),
      engineState: this.engine ? this.engine.getInternalState() : null,
      chatLog: this.chatLog,
    };
  }

  static fromSnapshot(snapshot: RoomSnapshot): Room {
    const room = new Room(snapshot.roomCode, snapshot.hostPlayerId, snapshot.createdAt);
    room.updatedAt = snapshot.updatedAt;
    room.players = snapshot.players.map((p) => ({ ...p, socket: null }));
    if (snapshot.engineState) repairNobleConsistency(snapshot.engineState);
    room.engine = snapshot.engineState ? new GameEngine(snapshot.engineState) : null;
    room.chatLog = Array.isArray(snapshot.chatLog) ? snapshot.chatLog : [];
    return room;
  }
}
