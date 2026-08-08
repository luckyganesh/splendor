import type { ClientMessage } from '../shared/protocol.js';
import type { GameStateView, PlayerView, TierView } from '../shared/types.js';
import {
  type ActionResult,
  chooseNoble,
  discardTokens,
  pass,
  playerPoints,
  purchaseCard,
  reserveCard,
  takeTokens,
  takeTwoSame,
} from './actions.js';
import type { InternalGameState } from './setup.js';

type GameplayMessage = Extract<
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

export class GameEngine {
  private state: InternalGameState;

  constructor(state: InternalGameState) {
    this.state = state;
  }

  getInternalState(): InternalGameState {
    return this.state;
  }

  applyAction(playerId: string, message: GameplayMessage): ActionResult {
    const clone = structuredClone(this.state);
    let result: ActionResult;

    switch (message.type) {
      case 'take_tokens':
        result = takeTokens(clone, playerId, message.colors);
        break;
      case 'take_two_same':
        result = takeTwoSame(clone, playerId, message.color);
        break;
      case 'reserve_card':
        result = reserveCard(clone, playerId, message.source);
        break;
      case 'purchase_card':
        result = purchaseCard(clone, playerId, message.source);
        break;
      case 'discard_tokens':
        result = discardTokens(clone, playerId, message.tokens);
        break;
      case 'choose_noble':
        result = chooseNoble(clone, playerId, message.nobleId);
        break;
      case 'pass':
        result = pass(clone, playerId);
        break;
    }

    if (result.ok) this.state = result.state;
    return result;
  }

  currentView(viewerPlayerId: string | null): GameStateView {
    const s = this.state;

    const players: PlayerView[] = s.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: true,
      tokens: { ...p.tokens },
      bonuses: { ...p.bonuses },
      purchasedCards: p.purchasedCards,
      reservedCards: p.reservedCards.map((card) => ({
        card: p.id === viewerPlayerId ? card : null,
        hidden: p.id !== viewerPlayerId,
        tier: card.tier,
      })),
      nobles: p.nobles,
      points: playerPoints(p),
    }));

    const tiers: TierView[] = s.tiers.map((t) => ({
      tier: t.tier,
      faceUp: [...t.faceUp],
      remainingInDeck: t.deck.length,
    }));

    return {
      roomCode: s.roomCode,
      phase: s.phase,
      players,
      currentPlayerIndex: s.currentPlayerIndex,
      turnNumber: s.turnNumber,
      bank: { ...s.bank },
      tiers,
      nobles: s.nobles,
      pendingAction: s.pendingAction,
      finalRoundTriggeredBy: s.finalRoundTriggeredBy,
      winnerIds: s.winnerIds,
    };
  }
}
