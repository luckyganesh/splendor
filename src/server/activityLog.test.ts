import { describe, expect, it } from 'vitest';
import { createGame } from '../engine/setup.js';
import { describeGameFinished, describeGameplayAction } from './activityLog.js';

function newGame() {
  return createGame('TEST', [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ]);
}

describe('describeGameplayAction', () => {
  it('describes taking three different tokens', () => {
    const text = describeGameplayAction('Alice', { type: 'take_tokens', colors: ['white', 'blue', 'green'] }, newGame(), 'p1');
    expect(text).toBe('Alice took White, Blue, and Green tokens.');
  });

  it('describes taking a single token', () => {
    const text = describeGameplayAction('Alice', { type: 'take_tokens', colors: ['white'] }, newGame(), 'p1');
    expect(text).toBe('Alice took White token.');
  });

  it('describes taking two of the same color', () => {
    const text = describeGameplayAction('Bob', { type: 'take_two_same', color: 'black' }, newGame(), 'p2');
    expect(text).toBe('Bob took 2 Black tokens.');
  });

  it('describes a face-up reservation without revealing the card', () => {
    const text = describeGameplayAction(
      'Alice',
      { type: 'reserve_card', source: { kind: 'faceup', tier: 2, slot: 1 } },
      newGame(),
      'p1',
    );
    expect(text).toBe('Alice reserved a Tier 2 card.');
  });

  it('describes a blind deck reservation', () => {
    const text = describeGameplayAction(
      'Alice',
      { type: 'reserve_card', source: { kind: 'deck', tier: 3 } },
      newGame(),
      'p1',
    );
    expect(text).toBe('Alice reserved a card blind from the Tier 3 deck.');
  });

  it('describes a purchase with the card\'s real tier/color/points, since purchases are public', () => {
    const state = newGame();
    state.players[0].purchasedCards.push({ id: 'c1', tier: 2, color: 'red', points: 3, cost: {} });
    const text = describeGameplayAction(
      'Alice',
      { type: 'purchase_card', source: { kind: 'faceup', tier: 2, slot: 0 } },
      state,
      'p1',
    );
    expect(text).toBe('Alice purchased a Tier 2 Red card worth 3 points.');
  });

  it('omits the points phrase for a 0-point purchase', () => {
    const state = newGame();
    state.players[0].purchasedCards.push({ id: 'c1', tier: 1, color: 'white', points: 0, cost: {} });
    const text = describeGameplayAction(
      'Alice',
      { type: 'purchase_card', source: { kind: 'faceup', tier: 1, slot: 0 } },
      state,
      'p1',
    );
    expect(text).toBe('Alice purchased a Tier 1 White card.');
  });

  it('describes a discard', () => {
    const text = describeGameplayAction('Alice', { type: 'discard_tokens', tokens: { white: 1, blue: 1 } }, newGame(), 'p1');
    expect(text).toBe('Alice discarded 2 tokens.');
  });

  it('describes a noble visit', () => {
    const text = describeGameplayAction('Alice', { type: 'choose_noble', nobleId: 'n1' }, newGame(), 'p1');
    expect(text).toBe('Alice was visited by a noble (+3 points).');
  });

  it('describes a pass', () => {
    const text = describeGameplayAction('Bob', { type: 'pass' }, newGame(), 'p2');
    expect(text).toBe('Bob passed.');
  });
});

describe('describeGameFinished', () => {
  it('announces a single winner', () => {
    expect(describeGameFinished(['Alice'])).toBe('Alice won the game!');
  });

  it('announces a tie', () => {
    expect(describeGameFinished(['Alice', 'Bob'])).toBe('Alice and Bob tied for the win!');
  });
});
