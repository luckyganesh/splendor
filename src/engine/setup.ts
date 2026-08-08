import {
  FACE_UP_SLOTS_PER_TIER,
  GOLD_TOKENS,
  NOBLES_IN_PLAY_BY_PLAYER_COUNT,
  TOKENS_PER_COLOR_BY_PLAYER_COUNT,
} from '../shared/constants.js';
import { COLORS, type Card, type ColorCount, type Noble, type TokenCount } from '../shared/types.js';
import { CARDS, NOBLES } from './cards.data.js';
import { mulberry32, shuffle, type Rng } from './rng.js';

export interface InternalPlayerState {
  id: string;
  name: string;
  tokens: TokenCount;
  bonuses: ColorCount;
  purchasedCards: Card[];
  reservedCards: Card[];
  nobles: Noble[];
}

export interface TierState {
  tier: 1 | 2 | 3;
  deck: Card[];
  faceUp: (Card | null)[];
}

export interface InternalGameState {
  roomCode: string;
  phase: 'lobby' | 'in_progress' | 'finished';
  players: InternalPlayerState[];
  currentPlayerIndex: number;
  turnNumber: number;
  bank: TokenCount;
  tiers: TierState[];
  nobles: Noble[];
  pendingAction:
    | { type: 'must_discard'; playerId: string; excess: number }
    | { type: 'must_choose_noble'; playerId: string; options: string[] }
    | null;
  finalRoundTriggeredBy: string | null;
  finalRoundEndsAtPlayerIndex: number | null;
  winnerIds: string[] | null;
}

function emptyTokenCount(): TokenCount {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
}

function emptyColorCount(): ColorCount {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0 };
}

export function createPlayer(id: string, name: string): InternalPlayerState {
  return {
    id,
    name,
    tokens: emptyTokenCount(),
    bonuses: emptyColorCount(),
    purchasedCards: [],
    reservedCards: [],
    nobles: [],
  };
}

export function createGame(
  roomCode: string,
  players: { id: string; name: string }[],
  seed?: number,
): InternalGameState {
  const playerCount = players.length;
  const tokensPerColor = TOKENS_PER_COLOR_BY_PLAYER_COUNT[playerCount];
  const nobleCount = NOBLES_IN_PLAY_BY_PLAYER_COUNT[playerCount];
  if (tokensPerColor === undefined || nobleCount === undefined) {
    throw new Error(`Unsupported player count: ${playerCount}`);
  }

  const rng: Rng = mulberry32(seed ?? Date.now());

  const bank = emptyTokenCount();
  for (const color of COLORS) bank[color] = tokensPerColor;
  bank.gold = GOLD_TOKENS;

  const tiers: TierState[] = ([1, 2, 3] as const).map((tier) => {
    const tierCards = shuffle(
      CARDS.filter((c) => c.tier === tier),
      rng,
    );
    const faceUp = tierCards.slice(0, FACE_UP_SLOTS_PER_TIER);
    const deck = tierCards.slice(FACE_UP_SLOTS_PER_TIER);
    return { tier, deck, faceUp };
  });

  const nobles = shuffle(NOBLES, rng).slice(0, nobleCount);

  return {
    roomCode,
    phase: 'in_progress',
    players: players.map((p) => createPlayer(p.id, p.name)),
    currentPlayerIndex: 0,
    turnNumber: 1,
    bank,
    tiers,
    nobles,
    pendingAction: null,
    finalRoundTriggeredBy: null,
    finalRoundEndsAtPlayerIndex: null,
    winnerIds: null,
  };
}

/**
 * Snapshots written before nobles stayed on the board (claimedBy marker
 * instead of being spliced out) have already-claimed nobles missing from
 * `state.nobles` entirely. Restore them (with claimedBy set) so old saves
 * render correctly under the current client.
 */
export function repairNobleConsistency(state: InternalGameState): void {
  const boardById = new Map(state.nobles.map((n) => [n.id, n]));
  for (const player of state.players) {
    for (const noble of player.nobles) {
      const onBoard = boardById.get(noble.id);
      if (onBoard) {
        onBoard.claimedBy ??= player.id;
      } else {
        noble.claimedBy ??= player.id;
        state.nobles.push(noble);
        boardById.set(noble.id, noble);
      }
    }
  }
}
