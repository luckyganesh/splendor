import type { Color, GameStateView, PlayerView, TokenColor } from '../../shared/types.js';
import { COLOR_META } from '../colors.js';
import { costHtml } from './board.js';
import { gemIconSvg, gemToken } from '../gems.js';
import { confirmCancelButtons, type PendingCardAction } from '../pendingCardAction.js';

function tokenBadges(tokens: Record<TokenColor, number>): string {
  const colors: TokenColor[] = ['white', 'blue', 'green', 'red', 'black', 'gold'];
  return colors
    .filter((c) => tokens[c] > 0)
    .map((c) => gemToken(c, 'md', tokens[c]))
    .join('');
}

function bonusBadges(bonuses: Record<Color, number>): string {
  const colors: Color[] = ['white', 'blue', 'green', 'red', 'black'];
  return colors
    .filter((c) => bonuses[c] > 0)
    .map((c) => gemToken(c, 'md', bonuses[c]))
    .join('');
}

function reservedCardHtml(
  reserved: PlayerView['reservedCards'][number],
  isMe: boolean,
  canBuy: boolean,
  pending: PendingCardAction | null,
): string {
  const sizeClass = isMe ? 'mini-card-mine' : '';
  if (reserved.hidden || !reserved.card) {
    return `<div class="mini-card ${sizeClass} card-back"><span class="deck-count">T${reserved.tier}</span></div>`;
  }
  const meta = COLOR_META[reserved.card.color];
  const pendingHere = pending !== null && pending.kind === 'purchase-reserved' && pending.cardId === reserved.card.id;
  const anyPending = pending !== null;
  return `
    <div class="mini-card ${sizeClass} pattern-${reserved.card.color}" style="background-color:var(--panel-2); border-left:4px solid ${meta.light}">
      <div class="mini-card-top">
        <span class="mini-points">${reserved.card.points > 0 ? reserved.card.points : ''}</span>
        <span class="gem-token gem-token-sm">${gemIconSvg(reserved.card.color)}</span>
      </div>
      ${isMe ? costHtml(reserved.card.cost) : ''}
      ${
        isMe
          ? pendingHere
            ? confirmCancelButtons()
            : `<button data-action="purchase-reserved" data-card-id="${reserved.card.id}" ${canBuy && !anyPending ? '' : 'disabled'}>Buy</button>`
          : ''
      }
    </div>`;
}

const MINI_CARD_MINE_WIDTH = 100;
const MINI_CARD_MINE_HEIGHT = 150;
const STACK_OFFSET_X = 44;
const STACK_OFFSET_Y = 52;

/** Stacked pile (not a wrapped grid): card 0 sits at (0,0), card 1 at (1,1)'s
    worth of offset, card 2 at (2,2), and so on — a diagonal cascade so each
    card peeks out both to the side and below the one before it. Hovering
    brings that card fully to the front. */
function renderReservedStack(cardsHtml: string[]): string {
  const width = MINI_CARD_MINE_WIDTH + Math.max(0, cardsHtml.length - 1) * STACK_OFFSET_X;
  const height = MINI_CARD_MINE_HEIGHT + Math.max(0, cardsHtml.length - 1) * STACK_OFFSET_Y;
  const items = cardsHtml
    .map(
      (html, i) =>
        `<div class="reserved-stack-item" style="left:${i * STACK_OFFSET_X}px; top:${i * STACK_OFFSET_Y}px; z-index:${i + 1}">${html}</div>`,
    )
    .join('');
  return `<div class="reserved-stack" style="width:${width}px; height:${height}px">${items}</div>`;
}

function infoSection(label: string, bodyHtml: string): string {
  return `
    <div class="info-section">
      <div class="info-label">${label}</div>
      <div class="info-body">${bodyHtml}</div>
    </div>`;
}

/** Compact tiles for everyone else at the table: bonuses/tokens on the left,
    reserved cards beside them on the right — a wide tile has room for both
    side by side, so nothing needs its own full-width stacked row. */
export function renderOpponents(state: GameStateView, myPlayerId: string | null): string {
  const tiles = state.players
    .filter((p) => p.id !== myPlayerId)
    .map((p) => {
      const idx = state.players.indexOf(p);
      const isCurrent = idx === state.currentPlayerIndex && state.phase === 'in_progress';
      return `
        <div class="opponent-tile ${isCurrent ? 'player-current' : ''}" data-player-id="${p.id}">
          <div class="player-header">
            <span class="conn-dot ${p.connected ? 'conn-on' : 'conn-off'}"></span>
            <span class="player-name">${escapeHtml(p.name)}</span>
            <span class="player-points">${p.points} pts</span>
          </div>
          <div class="opponent-body">
            <div class="opponent-info">
              ${infoSection('Bonuses', bonusBadges(p.bonuses) || '<span class="empty-hint">none yet</span>')}
              ${infoSection('Tokens', tokenBadges(p.tokens) || '<span class="empty-hint">none yet</span>')}
            </div>
            <div class="opponent-reserved-area">
              <div class="info-label">Reserved (${p.reservedCards.length})</div>
              <div class="player-reserved">
                ${
                  p.reservedCards.length > 0
                    ? p.reservedCards.map((r) => reservedCardHtml(r, false, false, null)).join('')
                    : '<span class="empty-hint">none yet</span>'
                }
              </div>
            </div>
          </div>
        </div>`;
    })
    .join('');
  return tiles;
}

/** Your own panel: fixed size, docked beside chat, always in the same spot. */
export function renderMyPanel(
  state: GameStateView,
  myPlayerId: string | null,
  canAffordReserved: (cardId: string) => boolean,
  pending: PendingCardAction | null,
): string {
  const me = state.players.find((p) => p.id === myPlayerId);
  if (!me) return '';
  const idx = state.players.indexOf(me);
  const isCurrent = idx === state.currentPlayerIndex && state.phase === 'in_progress';

  return `
    <div class="player-panel my-panel ${isCurrent ? 'player-current' : ''}">
      <div class="player-header">
        <span class="conn-dot conn-on"></span>
        <span class="player-name">${escapeHtml(me.name)} (you)</span>
        <span class="player-points">${me.points} pts</span>
        <button data-action="leave-room" class="secondary leave-room-link">Leave room</button>
      </div>
      ${infoSection('Bonuses', bonusBadges(me.bonuses) || '<span class="empty-hint">none yet</span>')}
      ${infoSection('Tokens', tokenBadges(me.tokens) || '<span class="empty-hint">none yet</span>')}
      ${
        me.reservedCards.length > 0
          ? infoSection(
              'Reserved',
              renderReservedStack(
                me.reservedCards.map((r) =>
                  reservedCardHtml(r, true, r.card ? canAffordReserved(r.card.id) : false, pending),
                ),
              ),
            )
          : ''
      }
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
