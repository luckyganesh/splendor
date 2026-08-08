import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/protocol.js';
import type { Room, GameplayMessage } from './room.js';
import { RoomManager } from './roomManager.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ConnState {
  room: Room | null;
  playerId: string | null;
}

function send(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function sendErrorCode(ws: WebSocket, code: import('../shared/protocol.js').ErrorCode, message: string) {
  send(ws, { type: 'error', code, message });
}

const GAMEPLAY_TYPES = new Set<GameplayMessage['type']>([
  'take_tokens',
  'take_two_same',
  'reserve_card',
  'purchase_card',
  'discard_tokens',
  'choose_noble',
  'pass',
]);

function isGameplayMessage(message: ClientMessage): message is GameplayMessage {
  return GAMEPLAY_TYPES.has(message.type as GameplayMessage['type']);
}

export function createWsServer(roomManager: RoomManager): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket & { isAlive?: boolean }, _req: IncomingMessage) => {
    const state: ConnState = { room: null, playerId: null };
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        sendErrorCode(ws, 'BAD_MESSAGE', 'Message was not valid JSON');
        return;
      }
      if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
        sendErrorCode(ws, 'BAD_MESSAGE', 'Message must have a string "type" field');
        return;
      }

      handleMessage(roomManager, ws, state, message);
    });

    ws.on('close', () => {
      if (state.room && state.playerId) {
        state.room.detachSocket(state.playerId);
        state.room.broadcast();
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const client = ws as WebSocket & { isAlive?: boolean };
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

function handleMessage(
  roomManager: RoomManager,
  ws: WebSocket,
  state: ConnState,
  message: ClientMessage,
) {
  switch (message.type) {
    case 'create_room': {
      const { room, playerId, secret } = roomManager.createRoom(message.hostName);
      room.attachSocket(playerId, ws);
      state.room = room;
      state.playerId = playerId;
      send(ws, { type: 'room_created', roomCode: room.roomCode, playerId, secret });
      send(ws, { type: 'chat_history', messages: room.chatLog });
      room.broadcast();
      return;
    }

    case 'join_room': {
      const room = roomManager.getRoom(message.roomCode);
      if (!room) return sendErrorCode(ws, 'ROOM_NOT_FOUND', 'No room with that code');
      const result = room.join(message.playerName);
      if (!result.ok) return sendErrorCode(ws, result.code, result.message);
      room.attachSocket(result.playerId, ws);
      state.room = room;
      state.playerId = result.playerId;
      send(ws, { type: 'joined', roomCode: room.roomCode, playerId: result.playerId, secret: result.secret });
      send(ws, { type: 'chat_history', messages: room.chatLog });
      room.broadcast();
      return;
    }

    case 'rejoin': {
      const room = roomManager.getRoom(message.roomCode);
      if (!room) return sendErrorCode(ws, 'ROOM_NOT_FOUND', 'No room with that code');
      const player = room.rejoin(message.playerId, message.secret);
      if (!player) return sendErrorCode(ws, 'REJOIN_FAILED', 'Could not verify your identity for that room');
      room.attachSocket(player.id, ws);
      state.room = room;
      state.playerId = player.id;
      send(ws, { type: 'joined', roomCode: room.roomCode, playerId: player.id, secret: message.secret });
      send(ws, { type: 'chat_history', messages: room.chatLog });
      room.broadcast();
      return;
    }

    case 'chat': {
      if (!state.room || !state.playerId) return sendErrorCode(ws, 'BAD_MESSAGE', 'Join a room first');
      if (typeof message.text !== 'string') return sendErrorCode(ws, 'BAD_MESSAGE', 'Chat text must be a string');
      const chatMessage = state.room.addChatMessage(state.playerId, message.text);
      if (chatMessage) state.room.broadcastChat(chatMessage);
      return;
    }

    case 'start_game': {
      if (!state.room || !state.playerId) return sendErrorCode(ws, 'BAD_MESSAGE', 'Join a room first');
      const error = state.room.startGame(state.playerId);
      if (error) return send(ws, error);
      state.room.broadcast();
      return;
    }

    case 'leave_room': {
      if (!state.room || !state.playerId) return;
      if (state.room.phase === 'lobby') {
        state.room.players = state.room.players.filter((p) => p.id !== state.playerId);
      } else {
        state.room.detachSocket(state.playerId);
      }
      const room = state.room;
      state.room = null;
      state.playerId = null;
      room.broadcast();
      return;
    }

    default: {
      if (!state.room || !state.playerId) return sendErrorCode(ws, 'BAD_MESSAGE', 'Join a room first');
      if (!isGameplayMessage(message)) return sendErrorCode(ws, 'BAD_MESSAGE', `Unknown message type`);
      const error = state.room.applyGameplayAction(state.playerId, message);
      if (error) return send(ws, error);
      state.room.broadcast();
      return;
    }
  }
}
