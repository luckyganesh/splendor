export type Color = 'white' | 'blue' | 'green' | 'red' | 'black';
export type TokenColor = Color | 'gold';

export const COLORS: Color[] = ['white', 'blue', 'green', 'red', 'black'];
export const TOKEN_COLORS: TokenColor[] = [...COLORS, 'gold'];

export type Cost = Partial<Record<Color, number>>;
export type TokenCount = Record<TokenColor, number>;
export type ColorCount = Record<Color, number>;

export interface Card {
  id: string;
  tier: 1 | 2 | 3;
  color: Color;
  points: number;
  cost: Cost;
}

export interface Noble {
  id: string;
  points: 3;
  requirement: Cost;
  claimedBy?: string;
}

export interface ReservedCardView {
  card: Card | null;
  hidden: boolean;
  tier?: 1 | 2 | 3;
}

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  tokens: TokenCount;
  bonuses: ColorCount;
  purchasedCards: Card[];
  reservedCards: ReservedCardView[];
  nobles: Noble[];
  points: number;
}

export type PendingAction =
  | { type: 'must_discard'; playerId: string; excess: number }
  | { type: 'must_choose_noble'; playerId: string; options: string[] };

export interface TierView {
  tier: 1 | 2 | 3;
  faceUp: (Card | null)[];
  remainingInDeck: number;
}

export interface GameStateView {
  roomCode: string;
  phase: 'lobby' | 'in_progress' | 'finished';
  players: PlayerView[];
  currentPlayerIndex: number;
  turnNumber: number;
  bank: TokenCount;
  tiers: TierView[];
  nobles: Noble[];
  pendingAction: PendingAction | null;
  finalRoundTriggeredBy: string | null;
  winnerIds: string[] | null;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  ts: string;
}
