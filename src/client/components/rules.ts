import {
  GOLD_TOKENS,
  MAX_PLAYERS,
  MAX_RESERVED_CARDS,
  MAX_TOKENS_IN_HAND,
  MIN_PLAYERS,
  NOBLES_IN_PLAY_BY_PLAYER_COUNT,
  TOKENS_PER_COLOR_BY_PLAYER_COUNT,
  WINNING_POINTS,
} from '../../shared/constants.js';
import { gemToken } from '../gems.js';

export function renderRulesButton(): string {
  return `<button data-action="open-rules" class="rules-button" title="How to play">📖 Rules</button>`;
}

export function renderRulesModal(open: boolean): string {
  if (!open) return '';

  const tokenCounts = Object.entries(TOKENS_PER_COLOR_BY_PLAYER_COUNT)
    .map(([n, c]) => `${n}p: ${c} each`)
    .join(' · ');
  const nobleCounts = Object.entries(NOBLES_IN_PLAY_BY_PLAYER_COUNT)
    .map(([n, c]) => `${n}p: ${c}`)
    .join(' · ');
  const gold = gemToken('gold', 'sm');

  return `
    <div class="modal-backdrop">
      <div class="modal modal-rules">
        <div class="rules-header">
          <h3>📖 How to Play Splendor</h3>
          <button data-action="close-rules" class="rules-close" aria-label="Close rules">✕</button>
        </div>
        <div class="rules-body">
          <section>
            <h4>🎯 Goal</h4>
            <p>Be the first to reach <strong>${WINNING_POINTS} points</strong> by collecting gem cards and attracting nobles to your court.</p>
          </section>

          <section>
            <h4>🎮 Setup</h4>
            <p>${MIN_PLAYERS}–${MAX_PLAYERS} players. The token bank and noble count scale with how many are seated:</p>
            <p>🪙 Tokens per color — ${tokenCounts} (${gold} gold is always ${GOLD_TOKENS})</p>
            <p>👑 Nobles in play — ${nobleCounts}</p>
          </section>

          <section>
            <h4>💎 The gems</h4>
            <p>
              ${gemToken('white', 'sm')} Diamond ·
              ${gemToken('blue', 'sm')} Sapphire ·
              ${gemToken('green', 'sm')} Emerald ·
              ${gemToken('red', 'sm')} Ruby ·
              ${gemToken('black', 'sm')} Onyx
              — plus ${gold} Gold, a wild token that stands in for any color when paying.
            </p>
          </section>

          <section>
            <h4>🎲 On your turn, do exactly ONE of these</h4>
            <ul>
              <li>🌈 <strong>Take 3 tokens</strong> of three different colors.</li>
              <li>✌️ <strong>Take 2 tokens</strong> of the same color — only if that pile still has 4 or more.</li>
              <li>🔖 <strong>Reserve a card</strong> — face-up, or blind from the top of a deck. You get a ${gold} gold token if any are left in the bank. Max ${MAX_RESERVED_CARDS} reserved cards at a time.</li>
              <li>🛒 <strong>Purchase a card</strong> — face-up or from your own reserve. Pay with tokens plus your card bonuses; ${gold} gold covers any shortfall.</li>
            </ul>
          </section>

          <section>
            <h4>🃏 Cards &amp; bonuses</h4>
            <p>Cards come in 3 tiers — tier 1 is cheap and low-value, tier 3 is expensive and worth the most points. Every card you buy grants a permanent bonus of its color, discounting the cost of every future card of that color.</p>
          </section>

          <section>
            <h4>👑 Nobles</h4>
            <p>Each noble wants a specific combination of bonuses. The moment your bonuses qualify, a noble visits you automatically — worth 3 points, no tokens spent, at most one visit per turn.</p>
          </section>

          <section>
            <h4>⚠️ Token limit</h4>
            <p>Holding more than ${MAX_TOKENS_IN_HAND} tokens at the end of your turn? You'll be asked to discard back down to ${MAX_TOKENS_IN_HAND}.</p>
          </section>

          <section>
            <h4>🏆 Winning</h4>
            <p>The instant someone hits ${WINNING_POINTS}+ points, the game plays out the rest of that round so every player gets equal turns — then the highest score wins. Ties are broken in favor of whoever bought <em>fewer</em> development cards.</p>
          </section>
        </div>
      </div>
    </div>`;
}
