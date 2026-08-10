import { describe, expect, it } from 'vitest';
import type { GameStateView } from '../shared/types.js';
import { planTransitions } from './transitions.js';

function card(id: string, color = 'white', points = 0) {
  return { id, tier: 1 as const, color: color as any, points, cost: {} };
}

function player(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    name: id,
    connected: true,
    isBot: false,
    tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
    bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
    purchasedCards: [],
    reservedCards: [],
    nobles: [],
    points: 0,
    ...overrides,
  };
}

function baseState(overrides: Partial<any> = {}) {
  return {
    roomCode: 'X',
    phase: 'in_progress',
    players: [player('p1'), player('p2')],
    currentPlayerIndex: 0,
    turnNumber: 1,
    bank: { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 },
    tiers: [
      { tier: 1, faceUp: [card('c1'), card('c2'), card('c3'), card('c4')], remainingInDeck: 36 },
      { tier: 2, faceUp: [null, null, null, null], remainingInDeck: 30 },
      { tier: 3, faceUp: [null, null, null, null], remainingInDeck: 20 },
    ],
    nobles: [],
    pendingAction: null,
    finalRoundTriggeredBy: null,
    winnerIds: null,
    ...overrides,
  } as GameStateView;
}

describe('planTransitions', () => {
  it('detects a card purchased from a face-up slot', () => {
    const prev = baseState();
    const next = baseState({
      tiers: [
        { tier: 1, faceUp: [card('c5'), card('c2'), card('c3'), card('c4')], remainingInDeck: 35 },
        prev.tiers[1],
        prev.tiers[2],
      ],
      players: [player('p1', { purchasedCards: [card('c1')] }), player('p2')],
    });
    expect(planTransitions(prev, next)).toEqual([{ kind: 'card-purchased', tier: 1, slot: 0, toPlayerId: 'p1' }]);
  });

  it('detects a card reserved from a face-up slot', () => {
    const prev = baseState();
    const next = baseState({
      tiers: [
        { tier: 1, faceUp: [prev.tiers[0].faceUp[0], null, card('c3'), card('c4')], remainingInDeck: 35 },
        prev.tiers[1],
        prev.tiers[2],
      ],
      players: [player('p1'), player('p2', { reservedCards: [{ card: card('c2'), hidden: false, tier: 1 }] })],
    });
    expect(planTransitions(prev, next)).toEqual([{ kind: 'card-reserved-faceup', tier: 1, slot: 1, toPlayerId: 'p2' }]);
  });

  it('detects a blind reserve from a tier deck', () => {
    const prev = baseState();
    const next = baseState({
      tiers: [
        prev.tiers[0],
        prev.tiers[1],
        { tier: 3, faceUp: [null, null, null, null], remainingInDeck: 19 },
      ],
      players: [player('p1', { reservedCards: [{ card: null, hidden: true, tier: 3 }] }), player('p2')],
    });
    expect(planTransitions(prev, next)).toEqual([{ kind: 'card-reserved-blind', tier: 3, toPlayerId: 'p1' }]);
  });

  it('detects taking 3 different tokens', () => {
    const prev = baseState();
    const next = baseState({
      bank: { white: 3, blue: 3, green: 3, red: 4, black: 4, gold: 5 },
      players: [
        player('p1', { tokens: { white: 1, blue: 1, green: 1, red: 0, black: 0, gold: 0 } }),
        player('p2'),
      ],
    });
    const events = planTransitions(prev, next);
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.kind === 'tokens' && e.direction === 'take' && e.playerId === 'p1')).toBe(true);
  });

  it('detects payment tokens flowing back to the bank on a purchase', () => {
    const prev = baseState({
      players: [player('p1', { tokens: { white: 2, blue: 1, green: 0, red: 0, black: 0, gold: 0 } }), player('p2')],
    });
    const next = baseState({
      bank: { white: 6, blue: 5, green: 4, red: 4, black: 4, gold: 5 },
      tiers: [
        { tier: 1, faceUp: [card('c5'), card('c2'), card('c3'), card('c4')], remainingInDeck: 35 },
        prev.tiers[1],
        prev.tiers[2],
      ],
      players: [
        player('p1', { tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }, purchasedCards: [card('c1')] }),
        player('p2'),
      ],
    });
    const events = planTransitions(prev, next);
    const tokenEvents = events.filter((e) => e.kind === 'tokens');
    expect(tokenEvents).toEqual(
      expect.arrayContaining([
        { kind: 'tokens', color: 'white', amount: 2, playerId: 'p1', direction: 'spend' },
        { kind: 'tokens', color: 'blue', amount: 1, playerId: 'p1', direction: 'spend' },
      ]),
    );
    expect(events).toContainEqual({ kind: 'card-purchased', tier: 1, slot: 0, toPlayerId: 'p1' });
  });

  it('skips card animation when the diff is ambiguous (multiple slots changed at once)', () => {
    const prev = baseState();
    const next = baseState({
      tiers: [
        { tier: 1, faceUp: [card('c5'), card('c6'), card('c3'), card('c4')], remainingInDeck: 34 },
        prev.tiers[1],
        prev.tiers[2],
      ],
      players: [player('p1', { purchasedCards: [card('c1'), card('c2')] }), player('p2')],
    });
    expect(planTransitions(prev, next).some((e) => e.kind.startsWith('card'))).toBe(false);
  });
});
