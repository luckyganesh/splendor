import type { ActivityEntry, BotDifficulty, ChatMessage, Color, GameStateView, TokenColor } from './types.js';

export type CardSource =
  | { kind: 'faceup'; tier: 1 | 2 | 3; slot: number }
  | { kind: 'deck'; tier: 1 | 2 | 3 };

export type PurchaseSource =
  | { kind: 'faceup'; tier: 1 | 2 | 3; slot: number }
  | { kind: 'reserved'; cardId: string };

export type ClientMessage =
  | { type: 'create_room'; hostName: string }
  | { type: 'join_room'; roomCode: string; playerName: string }
  | { type: 'rejoin'; roomCode: string; playerId: string; secret: string }
  | { type: 'start_game' }
  | { type: 'add_bot'; difficulty: BotDifficulty }
  | { type: 'remove_bot'; playerId: string }
  | { type: 'take_tokens'; colors: Color[] }
  | { type: 'take_two_same'; color: Color }
  | { type: 'reserve_card'; source: CardSource }
  | { type: 'purchase_card'; source: PurchaseSource }
  | { type: 'discard_tokens'; tokens: Partial<Record<TokenColor, number>> }
  | { type: 'choose_noble'; nobleId: string }
  | { type: 'pass' }
  | { type: 'leave_room' }
  | { type: 'chat'; text: string };

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NAME_TAKEN'
  | 'GAME_ALREADY_STARTED'
  | 'GAME_NOT_IN_PROGRESS'
  | 'NOT_YOUR_TURN'
  | 'NOT_ENOUGH_PLAYERS'
  | 'BOT_NOT_FOUND'
  | 'REJOIN_FAILED'
  | 'INVALID_TOKEN_SELECTION'
  | 'PILE_TOO_LOW'
  | 'MAX_RESERVED_REACHED'
  | 'CARD_NOT_FOUND'
  | 'INSUFFICIENT_FUNDS'
  | 'PENDING_ACTION_UNRESOLVED'
  | 'ILLEGAL_PASS'
  | 'BAD_MESSAGE';

export type ServerMessage =
  | { type: 'room_created'; roomCode: string; playerId: string; secret: string }
  | { type: 'joined'; roomCode: string; playerId: string; secret: string }
  | { type: 'state'; state: GameStateView }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'chat_history'; messages: ChatMessage[] }
  | { type: 'activity'; entry: ActivityEntry }
  | { type: 'activity_history'; entries: ActivityEntry[] };
