import type { GameplayMessage } from '../engine/engine.js';
import type { InternalGameState } from '../engine/setup.js';
import type { Color } from '../shared/types.js';

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function listColors(colors: Color[]): string {
  const labels = colors.map(capitalize);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/**
 * Turns a successfully-applied gameplay message into a human-readable log line.
 * `afterState` is the state *after* the action, used to look up details (like
 * which card was purchased) that aren't in the message itself. Deliberately never
 * names a reserved card's identity — that stays hidden from everyone but its
 * owner, same as everywhere else in the UI; purchases are public, so those get
 * full detail.
 */
export function describeGameplayAction(
  playerName: string,
  message: GameplayMessage,
  afterState: InternalGameState,
  playerId: string,
): string {
  switch (message.type) {
    case 'take_tokens': {
      const plural = message.colors.length > 1 ? 's' : '';
      return `${playerName} took ${listColors(message.colors)} token${plural}.`;
    }
    case 'take_two_same':
      return `${playerName} took 2 ${capitalize(message.color)} tokens.`;
    case 'reserve_card':
      return message.source.kind === 'faceup'
        ? `${playerName} reserved a Tier ${message.source.tier} card.`
        : `${playerName} reserved a card blind from the Tier ${message.source.tier} deck.`;
    case 'purchase_card': {
      const card = afterState.players.find((p) => p.id === playerId)?.purchasedCards.at(-1);
      if (!card) return `${playerName} purchased a card.`;
      const pointsPhrase = card.points > 0 ? ` worth ${card.points} point${card.points > 1 ? 's' : ''}` : '';
      return `${playerName} purchased a Tier ${card.tier} ${capitalize(card.color)} card${pointsPhrase}.`;
    }
    case 'discard_tokens': {
      const total = Object.values(message.tokens).reduce((a, b) => a + (b ?? 0), 0);
      return `${playerName} discarded ${total} token${total > 1 ? 's' : ''}.`;
    }
    case 'choose_noble':
      return `${playerName} was visited by a noble (+3 points).`;
    case 'pass':
      return `${playerName} passed.`;
  }
}

export function describeGameFinished(winnerNames: string[]): string {
  if (winnerNames.length === 1) return `${winnerNames[0]} won the game!`;
  return `${winnerNames.join(' and ')} tied for the win!`;
}
