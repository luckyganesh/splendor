import type { Card, Color, GameStateView, PlayerView, TokenColor } from '../shared/types.js';
import { renderBank, renderTiers } from './components/board.js';
import { renderPassBar, renderTakeTwoConfirmBar, renderToast, renderTokenSelectionBar } from './components/interactions.js';
import { renderNobles } from './components/nobles.js';
import type { PendingCardAction } from './pendingCardAction.js';

export interface RenderContext {
  myPlayerId: string | null;
  tokenSelection: Color[];
  pendingCardAction: PendingCardAction | null;
  pendingTakeTwo: Color | null;
  error: { code: string; message: string } | null;
}

export function canAffordCost(
  cost: Card['cost'],
  bonuses: Record<Color, number>,
  tokens: Record<TokenColor, number>,
): boolean {
  let goldNeeded = 0;
  for (const color of ['white', 'blue', 'green', 'red', 'black'] as Color[]) {
    const required = Math.max(0, (cost[color] ?? 0) - bonuses[color]);
    const shortfall = Math.max(0, required - tokens[color]);
    goldNeeded += shortfall;
  }
  return goldNeeded <= tokens.gold;
}

// Mirrors the server's hasAnyLegalMove (src/engine/actions.ts) so the Pass button
// only ever appears in the genuine, near-impossible deadlock case, not every turn.
function hasLegalMove(state: GameStateView, me: PlayerView): boolean {
  const colors: Color[] = ['white', 'blue', 'green', 'red', 'black'];
  if (colors.some((c) => state.bank[c] > 0)) return true;
  if (me.reservedCards.length < 3) {
    const anyFaceUp = state.tiers.some((t) => t.faceUp.some((c) => c !== null));
    const anyDeck = state.tiers.some((t) => t.remainingInDeck > 0);
    if (anyFaceUp || anyDeck) return true;
  }
  for (const t of state.tiers) {
    for (const card of t.faceUp) {
      if (card && canAffordCost(card.cost, me.bonuses, me.tokens)) return true;
    }
  }
  for (const r of me.reservedCards) {
    if (r.card && canAffordCost(r.card.cost, me.bonuses, me.tokens)) return true;
  }
  return false;
}

const MEDALS = ['🥇', '🥈', '🥉'];

function winnerBanner(state: GameStateView): string {
  if (state.phase !== 'finished' || !state.winnerIds) return '';
  const winnerIds = state.winnerIds;
  const names = state.players.filter((p) => winnerIds.includes(p.id)).map((p) => p.name);
  const label = names.length > 1 ? `🤝 ${names.join(' & ')} tie for the win!` : `🏆 ${names[0]} wins!`;

  // Same ordering the server uses to break ties: points desc, then fewest dev cards.
  const ranked = [...state.players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.purchasedCards.length - b.purchasedCards.length;
  });

  const rows = ranked
    .map((p, i) => {
      const isWinner = winnerIds.includes(p.id);
      const cardPoints = p.purchasedCards.reduce((sum, c) => sum + c.points, 0);
      const noblePoints = p.points - cardPoints;
      return `
        <div class="winner-row ${isWinner ? 'winner-row-winner' : ''}">
          <span class="winner-medal">${MEDALS[i] ?? '🎖️'}</span>
          <span class="winner-name">${escapeHtml(p.name)}</span>
          <span class="winner-points">${p.points} pts</span>
          <span class="winner-detail">🃏 ${cardPoints} from cards · 👑 ${noblePoints} from nobles (${p.nobles.length})</span>
        </div>`;
    })
    .join('');

  return `
    <div class="modal-backdrop">
      <div class="modal modal-winner">
        <h3>🎉 Game over!</h3>
        <p class="winner-text">${label}</p>
        <div class="winner-stats">${rows}</div>
        <button data-action="leave-room" class="winner-leave">Back to lobby</button>
      </div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function renderGame(state: GameStateView, ctx: RenderContext): string {
  const me = state.players.find((p) => p.id === ctx.myPlayerId) ?? null;
  const myTurn =
    state.phase === 'in_progress' &&
    !state.pendingAction &&
    state.players[state.currentPlayerIndex]?.id === ctx.myPlayerId;

  const canAffordFaceUp = (card: Card) => (me ? canAffordCost(card.cost, me.bonuses, me.tokens) : false);

  const showTakeTwoConfirm = myTurn && ctx.pendingTakeTwo !== null;
  const showConfirmCancel = myTurn && !showTakeTwoConfirm && ctx.tokenSelection.length > 0;
  const showPass =
    myTurn && !showTakeTwoConfirm && ctx.tokenSelection.length === 0 && me !== null && !hasLegalMove(state, me);
  const bankActionHtml = showTakeTwoConfirm
    ? renderTakeTwoConfirmBar()
    : showConfirmCancel
      ? renderTokenSelectionBar(ctx.tokenSelection)
      : showPass
        ? renderPassBar()
        : '';

  return `
    ${winnerBanner(state)}
    <div class="turn-banner">${
      state.phase === 'finished'
        ? 'Game over'
        : myTurn
          ? "It's your turn"
          : `Waiting for ${state.players[state.currentPlayerIndex]?.name ?? '...'}`
    }</div>
    <div class="board-main">
      ${renderNobles(state.nobles, state.players)}
      ${renderTiers(state, canAffordFaceUp, ctx.pendingCardAction)}
      ${renderBank(state.bank, myTurn, ctx.tokenSelection, ctx.pendingTakeTwo, bankActionHtml)}
    </div>
    ${renderToast(ctx.error)}
  `;
}
