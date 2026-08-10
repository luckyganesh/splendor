import type { GameStateView, PlayerView, TierView } from '../shared/types.js';
import { type ActionResult, type GameplayMessage, applyGameplayMessage, playerPoints } from './actions.js';
import type { InternalGameState } from './setup.js';

export type { GameplayMessage } from './actions.js';

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
    const result = applyGameplayMessage(clone, playerId, message);
    if (result.ok) this.state = result.state;
    return result;
  }

  currentView(viewerPlayerId: string | null): GameStateView {
    const s = this.state;

    const players: PlayerView[] = s.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: true,
      isBot: false,
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
