import type { Card, Color, GameStateView, TokenColor } from '../../shared/types.js';
import { cardAssetUrl } from '../cardAssets.js';
import { COLOR_META } from '../colors.js';
import { gemIconSvg } from '../gems.js';
import { confirmCancelButtons, type PendingCardAction } from '../pendingCardAction.js';

function cardHtml(
  card: Card,
  tier: number,
  slot: number,
  canBuy: boolean,
  pending: PendingCardAction | null,
): string {
  const meta = COLOR_META[card.color];
  const pendingHere =
    pending !== null &&
    (pending.kind === 'reserve-faceup' || pending.kind === 'purchase-faceup') &&
    pending.tier === tier &&
    pending.slot === slot;
  const anyPending = pending !== null;

  const actionsHtml = pendingHere
    ? confirmCancelButtons()
    : `
      <div class="card-actions">
        <button data-action="reserve-faceup" data-tier="${tier}" data-slot="${slot}" ${anyPending ? 'disabled' : ''}>Reserve</button>
        <button data-action="purchase-faceup" data-tier="${tier}" data-slot="${slot}" ${canBuy && !anyPending ? '' : 'disabled'}>Buy</button>
      </div>`;

  return `
    <div class="card card-asset">
      <img class="card-art" src="${cardAssetUrl(card.id)}" alt="${meta.label} development card" />
      <div class="card-asset-actions">${actionsHtml}</div>
    </div>`;
}

function emptySlotHtml(): string {
  return `<div class="card card-empty"></div>`;
}

function cardBackHtml(tier: 1 | 2 | 3, remaining: number, pending: PendingCardAction | null): string {
  const pendingHere = pending !== null && pending.kind === 'reserve-deck' && pending.tier === tier;
  const anyPending = pending !== null;
  const clickable = remaining > 0 && !anyPending;
  return `
    <div class="card card-back ${remaining === 0 ? 'card-empty' : ''}" ${
      clickable ? `data-action="reserve-deck" data-tier="${tier}"` : ''
    }>
      <span class="deck-count">${remaining}</span>
      <span class="deck-label">T${tier}</span>
      ${pendingHere ? confirmCancelButtons() : ''}
    </div>`;
}

export function renderTiers(
  state: GameStateView,
  canAfford: (card: Card) => boolean,
  pending: PendingCardAction | null,
): string {
  const rows = [...state.tiers]
    .sort((a, b) => b.tier - a.tier)
    .map((t) => {
      const cards = t.faceUp
        .map((card, slot) =>
          card ? cardHtml(card, t.tier, slot, canAfford(card), pending) : emptySlotHtml(),
        )
        .join('');
      return `<div class="tier-row" data-tier="${t.tier}">
        ${cardBackHtml(t.tier, t.remainingInDeck, pending)}
        ${cards}
      </div>`;
    })
    .join('');
  return `<div class="tiers">${rows}</div>`;
}

export function renderBank(
  bank: Record<TokenColor, number>,
  selectable: boolean,
  selected: Color[],
  pendingTakeTwo: Color | null,
  actionSlotHtml: string,
): string {
  const colors: TokenColor[] = ['white', 'blue', 'green', 'red', 'black', 'gold'];
  const anyPendingTakeTwo = pendingTakeTwo !== null;
  const piles = colors
    .map((color) => {
      const meta = COLOR_META[color];
      const count = bank[color];
      const isSelected = (selected as TokenColor[]).includes(color);
      const isPendingHere = pendingTakeTwo === color;
      const canSelectDistinct = selectable && !anyPendingTakeTwo && color !== 'gold' && count > 0;
      const canTakeTwo = selectable && !anyPendingTakeTwo && color !== 'gold' && count >= 4;
      return `
        <div class="pile ${isSelected || isPendingHere ? 'pile-selected' : ''}">
          <button
            class="gem-token gem-token-lg gem-token-button"
            data-action="${canSelectDistinct ? 'toggle-color' : ''}"
            data-color="${color}"
            ${canSelectDistinct ? '' : 'disabled'}
            title="${meta.label}"
          >${gemIconSvg(color)}<span class="gem-count">${count}</span></button>
          <div class="pile-label">${meta.label}</div>
          ${
            color === 'gold'
              ? `<span class="mini mini-placeholder" aria-hidden="true">take 2</span>`
              : `<button class="mini" data-action="take-two-same" data-color="${color}" ${canTakeTwo ? '' : 'disabled'}>take 2</button>`
          }
        </div>`;
    })
    .join('');
  return `
    <div class="bank">
      <div class="bank-piles">${piles}</div>
      <div class="bank-actions">${actionSlotHtml}</div>
    </div>`;
}
