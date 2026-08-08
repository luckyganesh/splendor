import type { GameStateView, TokenColor } from '../shared/types.js';
import { gemToken } from './gems.js';

const TOKEN_COLORS: TokenColor[] = ['white', 'blue', 'green', 'red', 'black', 'gold'];

export type TransitionEvent =
  | { kind: 'card-purchased'; tier: 1 | 2 | 3; slot: number; toPlayerId: string }
  | { kind: 'card-reserved-faceup'; tier: 1 | 2 | 3; slot: number; toPlayerId: string }
  | { kind: 'card-reserved-blind'; tier: 1 | 2 | 3; toPlayerId: string }
  | { kind: 'tokens'; color: TokenColor; amount: number; playerId: string; direction: 'take' | 'spend' };

/**
 * Diffs two consecutive GameStateViews to figure out what physically happened
 * (a card left slot X for player Y, N tokens of color Z moved to/from player Y).
 * Deliberately conservative: a turn is exactly one action, so if the diff looks
 * like more than one thing changed (e.g. a reconnect skipped several broadcasts),
 * we bail on the card animation rather than guess wrong.
 */
export function planTransitions(prev: GameStateView, next: GameStateView): TransitionEvent[] {
  const events: TransitionEvent[] = [];

  const prevTiers = new Map(prev.tiers.map((t) => [t.tier, t]));
  const changedSlots: { tier: 1 | 2 | 3; slot: number }[] = [];
  for (const nextTier of next.tiers) {
    const prevTier = prevTiers.get(nextTier.tier);
    if (!prevTier) continue;
    for (let slot = 0; slot < nextTier.faceUp.length; slot++) {
      const prevCard = prevTier.faceUp[slot];
      const nextCard = nextTier.faceUp[slot];
      if (prevCard && (!nextCard || nextCard.id !== prevCard.id)) {
        changedSlots.push({ tier: nextTier.tier, slot });
      }
    }
  }

  const purchasedGrowth = next.players
    .map((p) => {
      const prevP = prev.players.find((pp) => pp.id === p.id);
      return { playerId: p.id, grew: prevP ? p.purchasedCards.length - prevP.purchasedCards.length : 0 };
    })
    .filter((x) => x.grew > 0);

  const reservedGrowth = next.players
    .map((p) => {
      const prevP = prev.players.find((pp) => pp.id === p.id);
      return { playerId: p.id, grew: prevP ? p.reservedCards.length - prevP.reservedCards.length : 0 };
    })
    .filter((x) => x.grew > 0);

  if (changedSlots.length === 1 && purchasedGrowth.length + reservedGrowth.length === 1) {
    const { tier, slot } = changedSlots[0];
    if (purchasedGrowth.length === 1) {
      events.push({ kind: 'card-purchased', tier, slot, toPlayerId: purchasedGrowth[0].playerId });
    } else {
      events.push({ kind: 'card-reserved-faceup', tier, slot, toPlayerId: reservedGrowth[0].playerId });
    }
  } else if (changedSlots.length === 0 && reservedGrowth.length === 1 && purchasedGrowth.length === 0) {
    for (const nextTier of next.tiers) {
      const prevTier = prevTiers.get(nextTier.tier);
      if (prevTier && prevTier.remainingInDeck - nextTier.remainingInDeck === 1) {
        events.push({ kind: 'card-reserved-blind', tier: nextTier.tier, toPlayerId: reservedGrowth[0].playerId });
        break;
      }
    }
  }

  for (const color of TOKEN_COLORS) {
    const bankDelta = next.bank[color] - prev.bank[color];
    if (bankDelta === 0) continue;
    const playerDeltas = next.players
      .map((p) => {
        const prevP = prev.players.find((pp) => pp.id === p.id);
        return { playerId: p.id, delta: prevP ? p.tokens[color] - prevP.tokens[color] : 0 };
      })
      .filter((x) => x.delta !== 0);

    if (playerDeltas.length === 1 && playerDeltas[0].delta === -bankDelta) {
      const direction: 'take' | 'spend' = bankDelta > 0 ? 'spend' : 'take';
      events.push({ kind: 'tokens', color, amount: Math.abs(bankDelta), playerId: playerDeltas[0].playerId, direction });
    }
  }

  return events;
}

interface SlotSnapshot {
  rect: DOMRect;
  html: string;
}

export interface DomSnapshot {
  tierSlot: Map<string, SlotSnapshot>;
  tierBack: Map<number, SlotSnapshot>;
  bank: Map<TokenColor, DOMRect>;
  player: Map<string, DOMRect>;
}

/** Query the currently-rendered DOM for every element a transition might use as a
    source or destination. Call once before mutating state (captures the "old" look)
    and once after render() (captures the "new" look) — the same shape both times. */
export function captureDomSnapshot(myPlayerId: string | null): DomSnapshot {
  const tierSlot = new Map<string, SlotSnapshot>();
  const tierBack = new Map<number, SlotSnapshot>();
  const bank = new Map<TokenColor, DOMRect>();
  const player = new Map<string, DOMRect>();

  document.querySelectorAll('.tier-row').forEach((row) => {
    const tier = Number(row.getAttribute('data-tier'));
    const back = row.querySelector('.card-back');
    if (back) tierBack.set(tier, { rect: back.getBoundingClientRect(), html: back.outerHTML });
    row.querySelectorAll(':scope > .card:not(.card-back)').forEach((card, slot) => {
      tierSlot.set(`${tier}-${slot}`, { rect: card.getBoundingClientRect(), html: card.outerHTML });
    });
  });

  for (const color of TOKEN_COLORS) {
    const btn = document.querySelector(`.bank button[data-color="${color}"]`);
    if (btn) bank.set(color, btn.getBoundingClientRect());
  }

  const myHeader = document.querySelector('#my-panel-dock .player-header');
  if (myPlayerId && myHeader) player.set(myPlayerId, myHeader.getBoundingClientRect());
  document.querySelectorAll('.opponent-tile[data-player-id]').forEach((tile) => {
    const id = tile.getAttribute('data-player-id')!;
    const header = tile.querySelector('.player-header') ?? tile;
    player.set(id, header.getBoundingClientRect());
  });

  return { tierSlot, tierBack, bank, player };
}

function playerRectFor(playerId: string, myPlayerId: string | null, fallback: DomSnapshot): DOMRect | null {
  const live =
    playerId === myPlayerId
      ? document.querySelector('#my-panel-dock .player-header')
      : document.querySelector(`.opponent-tile[data-player-id="${playerId}"] .player-header`);
  return live?.getBoundingClientRect() ?? fallback.player.get(playerId) ?? null;
}

// Keep in sync with the `transition` duration on `.fly-ghost` in style.css.
const FLY_DURATION_MS = 2400;
const TOKEN_STAGGER_MS = 350;

function flyGhost(from: DOMRect, to: DOMRect, innerHtml: string, extraClass: string) {
  const ghost = document.createElement('div');
  ghost.className = `fly-ghost ${extraClass}`;
  ghost.innerHTML = innerHtml;
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.3)`;
    ghost.style.opacity = '0';
  });
  setTimeout(() => ghost.remove(), FLY_DURATION_MS + 50);
}

function markPopIn(tier: number, slot: number) {
  requestAnimationFrame(() => {
    const row = document.querySelector(`.tier-row[data-tier="${tier}"]`);
    const cards = row?.querySelectorAll(':scope > .card:not(.card-back)');
    const el = cards?.[slot];
    if (!el) return;
    el.classList.add('card-pop-in');
    setTimeout(() => el.classList.remove('card-pop-in'), 500);
  });
}

/** Run after render() has already applied the new state to the DOM. `before` must
    have been captured (via captureDomSnapshot) right before that state was applied. */
export function runTransitions(events: TransitionEvent[], before: DomSnapshot, myPlayerId: string | null): void {
  for (const ev of events) {
    if (ev.kind === 'card-purchased' || ev.kind === 'card-reserved-faceup') {
      const src = before.tierSlot.get(`${ev.tier}-${ev.slot}`);
      const dest = playerRectFor(ev.toPlayerId, myPlayerId, before);
      if (src && dest) flyGhost(src.rect, dest, src.html, 'fly-ghost-card');
      markPopIn(ev.tier, ev.slot);
    } else if (ev.kind === 'card-reserved-blind') {
      const src = before.tierBack.get(ev.tier);
      const dest = playerRectFor(ev.toPlayerId, myPlayerId, before);
      if (src && dest) flyGhost(src.rect, dest, src.html, 'fly-ghost-card');
    } else if (ev.kind === 'tokens') {
      const bankRect = before.bank.get(ev.color);
      if (!bankRect) continue;
      const beforePlayerRect = before.player.get(ev.playerId);
      const afterPlayerRect = playerRectFor(ev.playerId, myPlayerId, before);
      const ghostCount = Math.min(ev.amount, 3);
      for (let i = 0; i < ghostCount; i++) {
        setTimeout(() => {
          if (ev.direction === 'take' && afterPlayerRect) {
            flyGhost(bankRect, afterPlayerRect, gemToken(ev.color, 'sm'), 'fly-ghost-token');
          } else if (ev.direction === 'spend' && beforePlayerRect) {
            flyGhost(beforePlayerRect, bankRect, gemToken(ev.color, 'sm'), 'fly-ghost-token');
          }
        }, i * TOKEN_STAGGER_MS);
      }
    }
  }
}
