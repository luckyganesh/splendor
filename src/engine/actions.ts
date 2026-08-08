import { WINNING_POINTS } from '../shared/constants.js';
import type { CardSource, PurchaseSource } from '../shared/protocol.js';
import type { Card, Color, TokenColor } from '../shared/types.js';
import type { InternalGameState, InternalPlayerState } from './setup.js';
import { eligibleNobles } from './nobles.js';
import {
  computePayment,
  validateReserve,
  validateTakeThreeDifferent,
  validateTakeTwoSame,
  wouldExceedTokenLimit,
} from './validation.js';

export type ErrorCode =
  | 'NOT_YOUR_TURN'
  | 'GAME_NOT_IN_PROGRESS'
  | 'INVALID_TOKEN_SELECTION'
  | 'PILE_TOO_LOW'
  | 'MAX_RESERVED_REACHED'
  | 'CARD_NOT_FOUND'
  | 'INSUFFICIENT_FUNDS'
  | 'PENDING_ACTION_UNRESOLVED'
  | 'ILLEGAL_PASS'
  | 'BAD_MESSAGE';

export type ActionResult =
  | { ok: true; state: InternalGameState }
  | { ok: false; code: ErrorCode; message: string };

function err(code: ErrorCode, message: string): ActionResult {
  return { ok: false, code, message };
}

export function playerPoints(player: InternalPlayerState): number {
  const cardPoints = player.purchasedCards.reduce((sum, c) => sum + c.points, 0);
  const noblePoints = player.nobles.length * 3;
  return cardPoints + noblePoints;
}

function getTier(state: InternalGameState, tier: 1 | 2 | 3) {
  const t = state.tiers.find((t) => t.tier === tier);
  if (!t) throw new Error(`Unknown tier ${tier}`);
  return t;
}

function refillFaceUpSlot(state: InternalGameState, tier: 1 | 2 | 3, slot: number) {
  const t = getTier(state, tier);
  t.faceUp[slot] = t.deck.length > 0 ? t.deck.shift()! : null;
}

function requireCurrentPlayer(state: InternalGameState, playerId: string): InternalPlayerState | ActionResult {
  if (state.phase !== 'in_progress') return err('GAME_NOT_IN_PROGRESS', 'Game is not in progress');
  if (state.pendingAction && state.pendingAction.playerId !== playerId) {
    return err('NOT_YOUR_TURN', 'Another player must resolve a pending action first');
  }
  const current = state.players[state.currentPlayerIndex];
  if (current.id !== playerId) return err('NOT_YOUR_TURN', 'It is not your turn');
  return current;
}

function isActionResult(x: unknown): x is ActionResult {
  return typeof x === 'object' && x !== null && 'ok' in x;
}

function checkPostTokenLimit(state: InternalGameState, player: InternalPlayerState): ActionResult {
  const excess = wouldExceedTokenLimit(player.tokens);
  if (excess > 0) {
    state.pendingAction = { type: 'must_discard', playerId: player.id, excess };
    return { ok: true, state };
  }
  return endTurn(state, player.id);
}

export function takeTokens(state: InternalGameState, playerId: string, colors: Color[]): ActionResult {
  if (state.pendingAction) return err('PENDING_ACTION_UNRESOLVED', 'Resolve the pending action first');
  const player = requireCurrentPlayer(state, playerId);
  if (isActionResult(player)) return player;

  const validation = validateTakeThreeDifferent(state, colors);
  if (!validation.ok) return err('INVALID_TOKEN_SELECTION', validation.reason);

  for (const c of colors) {
    state.bank[c] -= 1;
    player.tokens[c] += 1;
  }
  return checkPostTokenLimit(state, player);
}

export function takeTwoSame(state: InternalGameState, playerId: string, color: Color): ActionResult {
  if (state.pendingAction) return err('PENDING_ACTION_UNRESOLVED', 'Resolve the pending action first');
  const player = requireCurrentPlayer(state, playerId);
  if (isActionResult(player)) return player;

  const validation = validateTakeTwoSame(state, color);
  if (!validation.ok) return err('PILE_TOO_LOW', validation.reason);

  state.bank[color] -= 2;
  player.tokens[color] += 2;
  return checkPostTokenLimit(state, player);
}

export function reserveCard(state: InternalGameState, playerId: string, source: CardSource): ActionResult {
  if (state.pendingAction) return err('PENDING_ACTION_UNRESOLVED', 'Resolve the pending action first');
  const player = requireCurrentPlayer(state, playerId);
  if (isActionResult(player)) return player;

  const reserveValidation = validateReserve(player);
  if (!reserveValidation.ok) return err('MAX_RESERVED_REACHED', reserveValidation.reason);

  let card: Card;
  if (source.kind === 'faceup') {
    const t = getTier(state, source.tier);
    const found = t.faceUp[source.slot];
    if (!found) return err('CARD_NOT_FOUND', 'That face-up slot is empty');
    card = found;
    refillFaceUpSlot(state, source.tier, source.slot);
  } else {
    const t = getTier(state, source.tier);
    if (t.deck.length === 0) return err('CARD_NOT_FOUND', `Tier ${source.tier} deck is empty`);
    card = t.deck.shift()!;
  }

  player.reservedCards.push(card);
  if (state.bank.gold > 0) {
    state.bank.gold -= 1;
    player.tokens.gold += 1;
  }

  return checkPostTokenLimit(state, player);
}

export function purchaseCard(state: InternalGameState, playerId: string, source: PurchaseSource): ActionResult {
  if (state.pendingAction) return err('PENDING_ACTION_UNRESOLVED', 'Resolve the pending action first');
  const player = requireCurrentPlayer(state, playerId);
  if (isActionResult(player)) return player;

  let card: Card;
  let onPurchased: () => void;

  if (source.kind === 'faceup') {
    const t = getTier(state, source.tier);
    const found = t.faceUp[source.slot];
    if (!found) return err('CARD_NOT_FOUND', 'That face-up slot is empty');
    card = found;
    onPurchased = () => refillFaceUpSlot(state, source.tier, source.slot);
  } else {
    const idx = player.reservedCards.findIndex((c) => c.id === source.cardId);
    if (idx === -1) return err('CARD_NOT_FOUND', 'You do not have that card reserved');
    card = player.reservedCards[idx];
    onPurchased = () => {
      player.reservedCards.splice(idx, 1);
    };
  }

  const payment = computePayment(card.cost, player.bonuses, player.tokens);
  if (!payment) return err('INSUFFICIENT_FUNDS', 'Cannot afford this card');

  for (const [color, amount] of Object.entries(payment) as [TokenColor, number][]) {
    player.tokens[color] -= amount;
    state.bank[color] += amount;
  }

  onPurchased();
  player.purchasedCards.push(card);
  player.bonuses[card.color] += 1;

  const eligible = eligibleNobles(state.nobles, player.bonuses);
  if (eligible.length === 1) {
    assignNoble(state, player, eligible[0].id);
  } else if (eligible.length > 1) {
    state.pendingAction = {
      type: 'must_choose_noble',
      playerId: player.id,
      options: eligible.map((n) => n.id),
    };
    return { ok: true, state };
  }

  return endTurn(state, player.id);
}

function assignNoble(state: InternalGameState, player: InternalPlayerState, nobleId: string) {
  const noble = state.nobles.find((n) => n.id === nobleId);
  if (!noble || noble.claimedBy) return;
  noble.claimedBy = player.id;
  player.nobles.push(noble);
}

export function discardTokens(
  state: InternalGameState,
  playerId: string,
  discard: Partial<Record<TokenColor, number>>,
): ActionResult {
  if (!state.pendingAction || state.pendingAction.type !== 'must_discard') {
    return err('PENDING_ACTION_UNRESOLVED', 'No discard is pending');
  }
  if (state.pendingAction.playerId !== playerId) return err('NOT_YOUR_TURN', 'Not your discard to resolve');

  const player = state.players.find((p) => p.id === playerId)!;
  const requested = Object.values(discard).reduce((a, b) => a + (b ?? 0), 0);
  if (requested !== state.pendingAction.excess) {
    return err('INVALID_TOKEN_SELECTION', `Must discard exactly ${state.pendingAction.excess} token(s)`);
  }
  for (const [color, amount] of Object.entries(discard) as [TokenColor, number][]) {
    if (amount < 0 || player.tokens[color] < amount) {
      return err('INVALID_TOKEN_SELECTION', `Not enough ${color} tokens to discard`);
    }
  }

  for (const [color, amount] of Object.entries(discard) as [TokenColor, number][]) {
    player.tokens[color] -= amount;
    state.bank[color] += amount;
  }

  state.pendingAction = null;
  return endTurn(state, playerId);
}

export function chooseNoble(state: InternalGameState, playerId: string, nobleId: string): ActionResult {
  if (!state.pendingAction || state.pendingAction.type !== 'must_choose_noble') {
    return err('PENDING_ACTION_UNRESOLVED', 'No noble choice is pending');
  }
  if (state.pendingAction.playerId !== playerId) return err('NOT_YOUR_TURN', 'Not your noble to choose');
  if (!state.pendingAction.options.includes(nobleId)) {
    return err('CARD_NOT_FOUND', 'That noble is not one of your options');
  }

  const player = state.players.find((p) => p.id === playerId)!;
  assignNoble(state, player, nobleId);
  state.pendingAction = null;
  return endTurn(state, playerId);
}

export function hasAnyLegalMove(state: InternalGameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;

  const availableColors = (['white', 'blue', 'green', 'red', 'black'] as Color[]).filter(
    (c) => state.bank[c] > 0,
  );
  if (availableColors.length > 0) return true;
  if ((['white', 'blue', 'green', 'red', 'black'] as Color[]).some((c) => state.bank[c] >= 4)) return true;

  if (player.reservedCards.length < 3) {
    const anyFaceUp = state.tiers.some((t) => t.faceUp.some((c) => c !== null));
    const anyDeck = state.tiers.some((t) => t.deck.length > 0);
    if (anyFaceUp || anyDeck) return true;
  }

  for (const t of state.tiers) {
    for (const card of t.faceUp) {
      if (card && computePayment(card.cost, player.bonuses, player.tokens)) return true;
    }
  }
  for (const card of player.reservedCards) {
    if (computePayment(card.cost, player.bonuses, player.tokens)) return true;
  }

  return false;
}

export function pass(state: InternalGameState, playerId: string): ActionResult {
  if (state.pendingAction) return err('PENDING_ACTION_UNRESOLVED', 'Resolve the pending action first');
  const player = requireCurrentPlayer(state, playerId);
  if (isActionResult(player)) return player;

  if (hasAnyLegalMove(state, playerId)) {
    return err('ILLEGAL_PASS', 'You have a legal move available and cannot pass');
  }

  return endTurn(state, playerId);
}

function endTurn(state: InternalGameState, actingPlayerId: string): ActionResult {
  const actingPlayer = state.players.find((p) => p.id === actingPlayerId)!;
  const actingIndex = state.players.indexOf(actingPlayer);

  if (state.finalRoundTriggeredBy === null && playerPoints(actingPlayer) >= WINNING_POINTS) {
    state.finalRoundTriggeredBy = actingPlayer.id;
    state.finalRoundEndsAtPlayerIndex = actingIndex;
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;

  if (state.finalRoundTriggeredBy !== null && nextIndex === state.finalRoundEndsAtPlayerIndex) {
    state.phase = 'finished';
    state.winnerIds = computeWinners(state);
    return { ok: true, state };
  }

  state.currentPlayerIndex = nextIndex;
  state.turnNumber += 1;
  return { ok: true, state };
}

function computeWinners(state: InternalGameState): string[] {
  const maxPoints = Math.max(...state.players.map((p) => playerPoints(p)));
  const contenders = state.players.filter((p) => playerPoints(p) === maxPoints);
  const minCards = Math.min(...contenders.map((p) => p.purchasedCards.length));
  return contenders.filter((p) => p.purchasedCards.length === minCards).map((p) => p.id);
}
