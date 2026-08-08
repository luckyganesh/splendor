import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine.js';
import { createGame, repairNobleConsistency, type InternalGameState } from './setup.js';

function newGame(playerCount: number, seed = 42): InternalGameState {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
  }));
  return createGame('TEST', players, seed);
}

describe('setup', () => {
  it('gives correct token counts per player count', () => {
    expect(newGame(2).bank.white).toBe(4);
    expect(newGame(3).bank.white).toBe(5);
    expect(newGame(4).bank.white).toBe(7);
    expect(newGame(2).bank.gold).toBe(5);
  });

  it('gives correct noble counts per player count', () => {
    expect(newGame(2).nobles.length).toBe(3);
    expect(newGame(3).nobles.length).toBe(4);
    expect(newGame(4).nobles.length).toBe(5);
  });

  it('deals 4 face-up cards per tier and keeps the rest in the deck', () => {
    const state = newGame(4);
    for (const tier of state.tiers) {
      expect(tier.faceUp.length).toBe(4);
      expect(tier.faceUp.every((c) => c !== null)).toBe(true);
    }
    const totalCards =
      state.tiers.reduce((sum, t) => sum + t.faceUp.length + t.deck.length, 0);
    expect(totalCards).toBe(90);
  });
});

describe('take tokens', () => {
  it('allows taking 3 different colors', () => {
    const engine = new GameEngine(newGame(2));
    const result = engine.applyAction('p1', { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    expect(result.ok).toBe(true);
    const view = engine.currentView('p1');
    expect(view.players[0].tokens.white).toBe(1);
    expect(view.players[0].tokens.blue).toBe(1);
    expect(view.players[0].tokens.green).toBe(1);
    expect(view.bank.white).toBe(3);
    expect(view.currentPlayerIndex).toBe(1);
  });

  it('rejects duplicate colors', () => {
    const engine = new GameEngine(newGame(2));
    const result = engine.applyAction('p1', { type: 'take_tokens', colors: ['white', 'white', 'green'] });
    expect(result.ok).toBe(false);
  });

  it('rejects taking from an empty pile', () => {
    const state = newGame(2);
    state.bank.white = 0;
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    expect(result.ok).toBe(false);
  });

  it('rejects acting out of turn', () => {
    const engine = new GameEngine(newGame(2));
    const result = engine.applyAction('p2', { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_YOUR_TURN');
  });

  it('allows taking 2 of the same color only when pile has >= 4', () => {
    const state = newGame(2); // 2p bank per color = 4
    const engine = new GameEngine(state);
    const ok = engine.applyAction('p1', { type: 'take_two_same', color: 'white' });
    expect(ok.ok).toBe(true);

    const state2 = newGame(2);
    state2.bank.white = 3;
    const engine2 = new GameEngine(state2);
    const bad = engine2.applyAction('p1', { type: 'take_two_same', color: 'white' });
    expect(bad.ok).toBe(false);
  });

  it('requires a discard when tokens exceed 10', () => {
    const state = newGame(4); // 7 per color, plenty in bank
    const p1 = state.players[0];
    p1.tokens.white = 3;
    p1.tokens.blue = 3;
    p1.tokens.green = 3;
    state.bank.white -= 3;
    state.bank.blue -= 3;
    state.bank.green -= 3;
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', { type: 'take_tokens', colors: ['red', 'black', 'white'] });
    expect(result.ok).toBe(true);
    const view = engine.currentView('p1');
    expect(view.pendingAction).toEqual({ type: 'must_discard', playerId: 'p1', excess: 2 });
    expect(view.currentPlayerIndex).toBe(0); // turn has not advanced yet

    const blocked = engine.applyAction('p2', { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    expect(blocked.ok).toBe(false);

    const discard = engine.applyAction('p1', { type: 'discard_tokens', tokens: { white: 2 } });
    expect(discard.ok).toBe(true);
    const view2 = engine.currentView('p1');
    expect(view2.pendingAction).toBeNull();
    expect(view2.currentPlayerIndex).toBe(1);
  });
});

describe('reserve card', () => {
  it('reserves a face-up card, grants gold, and refills the slot', () => {
    const state = newGame(2);
    const originalCard = state.tiers[0].faceUp[0]!;
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', {
      type: 'reserve_card',
      source: { kind: 'faceup', tier: 1, slot: 0 },
    });
    expect(result.ok).toBe(true);
    const view = engine.currentView('p1');
    expect(view.players[0].reservedCards.length).toBe(1);
    expect(view.players[0].reservedCards[0].card?.id).toBe(originalCard.id);
    expect(view.players[0].tokens.gold).toBe(1);
    expect(view.bank.gold).toBe(4);
    expect(view.tiers[0].faceUp[0]).not.toBeNull();
    expect(view.tiers[0].faceUp[0]?.id).not.toBe(originalCard.id);
  });

  it('hides reserved cards from other players but shows the tier', () => {
    const state = newGame(2);
    const engine = new GameEngine(state);
    engine.applyAction('p1', { type: 'reserve_card', source: { kind: 'faceup', tier: 1, slot: 0 } });
    const opponentView = engine.currentView('p2');
    const reserved = opponentView.players[0].reservedCards[0];
    expect(reserved.hidden).toBe(true);
    expect(reserved.card).toBeNull();
    expect(reserved.tier).toBe(1);
  });

  it('does not grant gold when bank has none left', () => {
    const state = newGame(2);
    state.bank.gold = 0;
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', {
      type: 'reserve_card',
      source: { kind: 'faceup', tier: 1, slot: 0 },
    });
    expect(result.ok).toBe(true);
    expect(engine.currentView('p1').players[0].tokens.gold).toBe(0);
  });

  it('rejects a 4th reservation', () => {
    const state = newGame(2);
    const p1 = state.players[0];
    p1.reservedCards.push(state.tiers[0].deck[0], state.tiers[0].deck[1], state.tiers[0].deck[2]);
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', {
      type: 'reserve_card',
      source: { kind: 'faceup', tier: 1, slot: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MAX_RESERVED_REACHED');
  });

  it('supports reserving blind from a tier deck', () => {
    const state = newGame(2);
    const topOfDeck = state.tiers[2].deck[0];
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', { type: 'reserve_card', source: { kind: 'deck', tier: 3 } });
    expect(result.ok).toBe(true);
    expect(engine.currentView('p1').players[0].reservedCards[0].card?.id).toBe(topOfDeck.id);
  });
});

describe('purchase card', () => {
  it('pays with tokens, applies bonuses, and refills the face-up slot', () => {
    const state = newGame(2);
    // Pick a cheap tier-1 card the player can definitely afford by stocking tokens.
    const card = state.tiers[0].faceUp[0]!;
    const p1 = state.players[0];
    for (const [color, amount] of Object.entries(card.cost)) {
      p1.tokens[color as keyof typeof p1.tokens] = amount ?? 0;
    }
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', {
      type: 'purchase_card',
      source: { kind: 'faceup', tier: 1, slot: 0 },
    });
    expect(result.ok).toBe(true);
    const view = engine.currentView('p1');
    expect(view.players[0].purchasedCards.map((c) => c.id)).toContain(card.id);
    expect(view.players[0].bonuses[card.color]).toBe(1);
    expect(view.tiers[0].faceUp[0]?.id).not.toBe(card.id);
  });

  it('uses card bonuses to discount cost', () => {
    const state = newGame(2);
    const p1 = state.players[0];
    p1.bonuses.white = 5; // enough to cover any tier-1 white cost
    p1.bonuses.blue = 5;
    p1.bonuses.green = 5;
    p1.bonuses.red = 5;
    p1.bonuses.black = 5;
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', {
      type: 'purchase_card',
      source: { kind: 'faceup', tier: 1, slot: 0 },
    });
    expect(result.ok).toBe(true);
    expect(engine.currentView('p1').players[0].tokens.gold).toBe(0);
  });

  it('rejects purchase when funds are insufficient', () => {
    const state = newGame(2);
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', {
      type: 'purchase_card',
      source: { kind: 'faceup', tier: 1, slot: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('uses gold to cover shortfalls', () => {
    const state = newGame(2);
    const card = state.tiers[0].faceUp[0]!;
    const p1 = state.players[0];
    p1.tokens.gold = Object.values(card.cost).reduce((a, b) => a + (b ?? 0), 0);
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', {
      type: 'purchase_card',
      source: { kind: 'faceup', tier: 1, slot: 0 },
    });
    expect(result.ok).toBe(true);
    expect(engine.currentView('p1').players[0].tokens.gold).toBe(0);
  });

  it('can purchase from own reserve', () => {
    const state = newGame(2);
    const engine = new GameEngine(state);
    engine.applyAction('p1', { type: 'reserve_card', source: { kind: 'faceup', tier: 1, slot: 0 } });
    const internal = engine.getInternalState();
    const p1 = internal.players[0];
    const card = p1.reservedCards[0];
    for (const [color, amount] of Object.entries(card.cost)) {
      p1.tokens[color as keyof typeof p1.tokens] = amount ?? 0;
    }
    // advance turn back to p1 for the test's purposes by resetting index
    internal.currentPlayerIndex = 0;
    const result = engine.applyAction('p1', {
      type: 'purchase_card',
      source: { kind: 'reserved', cardId: card.id },
    });
    expect(result.ok).toBe(true);
    expect(engine.currentView('p1').players[0].reservedCards.length).toBe(0);
  });
});

describe('nobles', () => {
  it('auto-assigns a noble when exactly one becomes eligible after purchase', () => {
    const state = newGame(2);
    const p1 = state.players[0];
    const noble = { id: 'n1', points: 3 as const, requirement: { white: 3, blue: 2 } };
    state.nobles = [noble];
    // one gem short of the noble requirement in every required color
    p1.bonuses.white = 2;
    p1.bonuses.blue = 2;
    // a free card whose bonus color pushes white over the top
    const card = { id: 'test-card', tier: 1 as const, color: 'white' as const, points: 0, cost: {} };
    state.tiers[0].faceUp[0] = card;
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', {
      type: 'purchase_card',
      source: { kind: 'faceup', tier: 1, slot: 0 },
    });
    expect(result.ok).toBe(true);
    const view = engine.currentView('p1');
    expect(view.players[0].nobles.length).toBe(1);
    expect(view.players[0].nobles[0].id).toBe(noble.id);
    expect(view.nobles.find((n) => n.id === noble.id)?.claimedBy).toBe('p1');
  });

  it('requires an explicit choice when multiple nobles become eligible', () => {
    const state = newGame(2);
    const p1 = state.players[0];
    // craft two nobles requiring the same colors so both trip at once
    state.nobles = [
      { id: 'n1', points: 3, requirement: { white: 3 } },
      { id: 'n2', points: 3, requirement: { white: 3, blue: 1 } },
    ];
    p1.bonuses.white = 2;
    p1.bonuses.blue = 1;
    const card = { id: 'test-card', tier: 1 as const, color: 'white' as const, points: 0, cost: {} };
    state.tiers[0].faceUp[0] = card;
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', {
      type: 'purchase_card',
      source: { kind: 'faceup', tier: 1, slot: 0 },
    });
    expect(result.ok).toBe(true);
    const view = engine.currentView('p1');
    expect(view.pendingAction).toEqual({
      type: 'must_choose_noble',
      playerId: 'p1',
      options: ['n1', 'n2'],
    });
    expect(view.currentPlayerIndex).toBe(0); // turn hasn't advanced

    const choose = engine.applyAction('p1', { type: 'choose_noble', nobleId: 'n2' });
    expect(choose.ok).toBe(true);
    const view2 = engine.currentView('p1');
    expect(view2.players[0].nobles.map((n) => n.id)).toEqual(['n2']);
    expect(view2.nobles.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(view2.nobles.find((n) => n.id === 'n2')?.claimedBy).toBe('p1');
    expect(view2.nobles.find((n) => n.id === 'n1')?.claimedBy).toBeUndefined();
    expect(view2.currentPlayerIndex).toBe(1);
  });

  it('repairs old snapshots where a claimed noble was spliced out of the board list', () => {
    const state = newGame(2);
    const claimed = { id: 'n1', points: 3 as const, requirement: { white: 3 } };
    // simulate a pre-fix snapshot: noble removed from the board, held only by the player
    state.nobles = [{ id: 'n2', points: 3, requirement: { blue: 3 } }];
    state.players[0].nobles = [claimed];

    repairNobleConsistency(state);

    expect(state.nobles.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
    expect(state.nobles.find((n) => n.id === 'n1')?.claimedBy).toBe(state.players[0].id);
  });
});

describe('end game', () => {
  it('triggers final round at 15 points and lets every player finish, then picks a winner', () => {
    const state = newGame(3);
    const p1 = state.players[0];
    p1.purchasedCards.push({ id: 'big', tier: 3, color: 'white', points: 15, cost: {} });
    const engine = new GameEngine(state);

    const r1 = engine.applyAction('p1', { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    expect(r1.ok).toBe(true);
    let view = engine.currentView(null);
    expect(view.finalRoundTriggeredBy).toBe('p1');
    expect(view.phase).toBe('in_progress');
    expect(view.currentPlayerIndex).toBe(1);

    const r2 = engine.applyAction('p2', { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    expect(r2.ok).toBe(true);
    view = engine.currentView(null);
    expect(view.phase).toBe('in_progress');
    expect(view.currentPlayerIndex).toBe(2);

    const r3 = engine.applyAction('p3', { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    expect(r3.ok).toBe(true);
    view = engine.currentView(null);
    expect(view.phase).toBe('finished');
    expect(view.winnerIds).toEqual(['p1']);
  });

  it('breaks ties by fewest development cards', () => {
    const state = newGame(2);
    state.players[0].purchasedCards.push(
      { id: 'a', tier: 3, color: 'white', points: 15, cost: {} },
      { id: 'b', tier: 1, color: 'blue', points: 0, cost: {} },
    );
    state.players[1].purchasedCards.push({ id: 'c', tier: 3, color: 'white', points: 15, cost: {} });
    const engine = new GameEngine(state);
    engine.applyAction('p1', { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    engine.applyAction('p2', { type: 'take_tokens', colors: ['white', 'blue', 'green'] });
    const view = engine.currentView(null);
    expect(view.phase).toBe('finished');
    expect(view.winnerIds).toEqual(['p2']);
  });
});

describe('pass', () => {
  it('rejects passing when a legal move exists', () => {
    const engine = new GameEngine(newGame(2));
    const result = engine.applyAction('p1', { type: 'pass' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ILLEGAL_PASS');
  });

  it('allows passing when no legal move exists', () => {
    const state = newGame(2);
    for (const color of ['white', 'blue', 'green', 'red', 'black'] as const) state.bank[color] = 0;
    state.bank.gold = 0;
    for (const tier of state.tiers) {
      tier.faceUp = [null, null, null, null];
      tier.deck = [];
    }
    const engine = new GameEngine(state);
    const result = engine.applyAction('p1', { type: 'pass' });
    expect(result.ok).toBe(true);
    expect(engine.currentView('p1').currentPlayerIndex).toBe(1);
  });
});
