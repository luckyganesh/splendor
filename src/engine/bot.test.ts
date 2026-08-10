import { describe, expect, it } from 'vitest';
import { applyGameplayMessage } from './actions.js';
import { decideBotAction } from './bot.js';
import { mulberry32 } from './rng.js';
import { createGame, type InternalGameState } from './setup.js';

function newGame(playerCount: number, seed = 42): InternalGameState {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
  }));
  return createGame('TEST', players, seed);
}

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

describe('decideBotAction — legality', () => {
  it('always returns a move that the engine accepts, across difficulties and seeds', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const playerCount of [2, 3, 4]) {
        for (let seed = 0; seed < 5; seed++) {
          const state = newGame(playerCount, seed * 1000 + 1);
          const rng = mulberry32(seed);
          const action = decideBotAction(state, 'p1', difficulty, rng);
          const clone = structuredClone(state);
          const result = applyGameplayMessage(clone, 'p1', action);
          expect(result.ok).toBe(true);
        }
      }
    }
  });

  it('falls back to pass when no legal move exists', () => {
    const state = newGame(2);
    for (const color of ['white', 'blue', 'green', 'red', 'black'] as const) state.bank[color] = 0;
    state.bank.gold = 0;
    for (const tier of state.tiers) {
      tier.faceUp = [null, null, null, null];
      tier.deck = [];
    }
    for (const difficulty of DIFFICULTIES) {
      const action = decideBotAction(state, 'p1', difficulty, mulberry32(1));
      expect(action).toEqual({ type: 'pass' });
    }
  });
});

describe('decideBotAction — pending discard', () => {
  it('discards exactly the required excess and the engine accepts it', () => {
    const state = newGame(4);
    const p1 = state.players[0];
    p1.tokens.white = 3;
    p1.tokens.blue = 3;
    p1.tokens.green = 3;
    p1.tokens.gold = 2;
    state.pendingAction = { type: 'must_discard', playerId: 'p1', excess: 3 };

    for (const difficulty of DIFFICULTIES) {
      const action = decideBotAction(state, 'p1', difficulty, mulberry32(7));
      expect(action.type).toBe('discard_tokens');
      if (action.type !== 'discard_tokens') continue;
      const total = Object.values(action.tokens).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBe(3);
      const clone = structuredClone(state);
      const result = applyGameplayMessage(clone, 'p1', action);
      expect(result.ok).toBe(true);
    }
  });

  it('medium/hard keep gold back as long as other tokens can cover the discard', () => {
    const state = newGame(4);
    const p1 = state.players[0];
    p1.tokens.white = 5;
    p1.tokens.gold = 3;
    state.pendingAction = { type: 'must_discard', playerId: 'p1', excess: 2 };

    for (const difficulty of ['medium', 'hard'] as const) {
      const action = decideBotAction(state, 'p1', difficulty, mulberry32(3));
      expect(action).toEqual({ type: 'discard_tokens', tokens: { white: 2 } });
    }
  });
});

describe('decideBotAction — pending noble choice', () => {
  it('picks one of the offered noble options and the engine accepts it', () => {
    const state = newGame(2);
    state.pendingAction = { type: 'must_choose_noble', playerId: 'p1', options: ['n1', 'n2'] };
    state.nobles = [
      { id: 'n1', points: 3, requirement: { white: 3 } },
      { id: 'n2', points: 3, requirement: { blue: 3 } },
    ];

    for (const difficulty of DIFFICULTIES) {
      const action = decideBotAction(state, 'p1', difficulty, mulberry32(9));
      expect(action.type).toBe('choose_noble');
      if (action.type !== 'choose_noble') continue;
      expect(['n1', 'n2']).toContain(action.nobleId);
      const clone = structuredClone(state);
      const result = applyGameplayMessage(clone, 'p1', action);
      expect(result.ok).toBe(true);
    }
  });
});

describe('decideBotAction — difficulty behavior', () => {
  it('medium and hard purchase an affordable, valuable card instead of just taking tokens', () => {
    const state = newGame(2);
    const p1 = state.players[0];
    const card = { id: 'juicy', tier: 1 as const, color: 'white' as const, points: 4, cost: { blue: 2 } };
    state.tiers[0].faceUp[0] = card;
    p1.tokens.blue = 2;

    for (const difficulty of ['medium', 'hard'] as const) {
      const action = decideBotAction(state, 'p1', difficulty, mulberry32(11));
      expect(action).toEqual({ type: 'purchase_card', source: { kind: 'faceup', tier: 1, slot: 0 } });
    }
  });

  it('hard prefers a face-up card an opponent is one resource away from affording', () => {
    const state = newGame(2);
    const p1 = state.players[0];
    const p2 = state.players[1];

    const contested = { id: 'contested', tier: 1 as const, color: 'white' as const, points: 1, cost: { blue: 3 } };
    const boring = { id: 'boring', tier: 1 as const, color: 'red' as const, points: 1, cost: { red: 3 } };
    state.tiers[0].faceUp[0] = contested;
    state.tiers[0].faceUp[1] = boring;

    // p1 can afford (reserve) either equally; p2 is one blue token away from buying `contested`.
    p2.tokens.blue = 2;
    p1.reservedCards = [];

    const action = decideBotAction(state, 'p1', 'hard', mulberry32(13));
    expect(action).toEqual({ type: 'reserve_card', source: { kind: 'faceup', tier: 1, slot: 0 } });
  });
});
