import { COLORS, TOKEN_COLORS, type BotDifficulty, type Color, type ColorCount, type Cost, type TokenColor, type TokenCount } from '../shared/types.js';
import { applyGameplayMessage, hasAnyLegalMove, playerPoints, type GameplayMessage } from './actions.js';
import type { Rng } from './rng.js';
import type { InternalGameState } from './setup.js';
import { computePayment } from './validation.js';

const MEDIUM_JITTER = 40;
const HARD_JITTER = 10;

function colorSubsets(colors: Color[]): Color[][] {
  const subsets: Color[][] = [];
  const n = colors.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset: Color[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(colors[i]);
    }
    if (subset.length <= 3) subsets.push(subset);
  }
  return subsets;
}

function enumerateCandidates(state: InternalGameState, playerId: string): GameplayMessage[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [{ type: 'pass' }];

  const candidates: GameplayMessage[] = [];

  const availableColors = COLORS.filter((c) => state.bank[c] > 0);
  for (const subset of colorSubsets(availableColors)) {
    candidates.push({ type: 'take_tokens', colors: subset });
  }

  for (const c of COLORS) {
    if (state.bank[c] >= 4) candidates.push({ type: 'take_two_same', color: c });
  }

  if (player.reservedCards.length < 3) {
    for (const tier of state.tiers) {
      tier.faceUp.forEach((card, slot) => {
        if (card) candidates.push({ type: 'reserve_card', source: { kind: 'faceup', tier: tier.tier, slot } });
      });
    }
  }

  for (const tier of state.tiers) {
    tier.faceUp.forEach((card, slot) => {
      if (card && computePayment(card.cost, player.bonuses, player.tokens)) {
        candidates.push({ type: 'purchase_card', source: { kind: 'faceup', tier: tier.tier, slot } });
      }
    });
  }
  for (const card of player.reservedCards) {
    if (computePayment(card.cost, player.bonuses, player.tokens)) {
      candidates.push({ type: 'purchase_card', source: { kind: 'reserved', cardId: card.id } });
    }
  }

  return candidates.length > 0 ? candidates : [{ type: 'pass' }];
}

function evaluate(state: InternalGameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId)!;
  let score = playerPoints(player) * 1000;
  score += Object.values(player.bonuses).reduce((a, b) => a + b, 0) * 15;
  score += player.reservedCards.length * 8;

  for (const noble of state.nobles) {
    if (noble.claimedBy) continue;
    const missing = COLORS.reduce((sum, c) => sum + Math.max(0, (noble.requirement[c] ?? 0) - player.bonuses[c]), 0);
    if (missing <= 3) score += (4 - missing) * 20;
  }

  const totalTokensHeld = Object.values(player.tokens).reduce((a, b) => a + b, 0);
  if (totalTokensHeld > 8) score -= (totalTokensHeld - 8) * 5;

  return score;
}

/** Remaining shortfall for a cost after spending owned color tokens and gold — 0 means affordable now. */
function shortfall(cost: Cost, bonuses: ColorCount, tokens: TokenCount): number {
  let goldNeeded = 0;
  for (const c of COLORS) {
    const required = Math.max(0, (cost[c] ?? 0) - bonuses[c]);
    const fromTokens = Math.min(required, tokens[c]);
    goldNeeded += required - fromTokens;
  }
  return Math.max(0, goldNeeded - tokens.gold);
}

/** Hard bots value grabbing/blocking a face-up card an opponent is one resource away from affording. */
function denialBonus(state: InternalGameState, playerId: string, candidate: GameplayMessage): number {
  let card: { points: number; tier: 1 | 2 | 3; cost: Cost } | null = null;
  if (
    (candidate.type === 'purchase_card' || candidate.type === 'reserve_card') &&
    candidate.source.kind === 'faceup'
  ) {
    const { tier, slot } = candidate.source;
    card = state.tiers.find((t) => t.tier === tier)?.faceUp[slot] ?? null;
  }
  if (!card) return 0;

  const opponents = state.players.filter((p) => p.id !== playerId);
  const contested = opponents.some((p) => shortfall(card!.cost, p.bonuses, p.tokens) <= 1);
  return contested ? (card.points + card.tier) * 120 : 0;
}

function decideDiscard(
  state: InternalGameState,
  playerId: string,
  excess: number,
  difficulty: BotDifficulty,
  rng: Rng,
): Partial<Record<TokenColor, number>> {
  const player = state.players.find((p) => p.id === playerId)!;
  const discard: Partial<Record<TokenColor, number>> = {};
  let remaining = excess;

  if (difficulty === 'easy') {
    while (remaining > 0) {
      const options = TOKEN_COLORS.filter((c) => player.tokens[c] - (discard[c] ?? 0) > 0);
      const pick = options[Math.floor(rng() * options.length)];
      discard[pick] = (discard[pick] ?? 0) + 1;
      remaining--;
    }
    return discard;
  }

  // Medium/hard: dump the most abundant colors first, keep gold back as long as possible.
  const priority: TokenColor[] = [...[...COLORS].sort((a, b) => player.tokens[b] - player.tokens[a]), 'gold'];
  for (const c of priority) {
    if (remaining <= 0) break;
    const take = Math.min(player.tokens[c], remaining);
    if (take > 0) {
      discard[c] = take;
      remaining -= take;
    }
  }
  return discard;
}

/**
 * Picks a bot's move for the current decision point (a discard, a noble choice, or a turn
 * action). Turn actions are chosen by simulating every legal candidate through the same
 * `applyGameplayMessage` dispatcher the real engine uses, then scoring the resulting state —
 * a 1-ply greedy heuristic, not a search. Difficulty controls how much that score matters:
 * easy ignores it (uniform random), medium follows it with noticeable jitter, hard follows it
 * closely and adds a bonus for contesting cards opponents are close to affording.
 */
export function decideBotAction(
  state: InternalGameState,
  playerId: string,
  difficulty: BotDifficulty,
  rng: Rng,
): GameplayMessage {
  const pending = state.pendingAction;
  if (pending && pending.playerId === playerId) {
    if (pending.type === 'must_discard') {
      return { type: 'discard_tokens', tokens: decideDiscard(state, playerId, pending.excess, difficulty, rng) };
    }
    return { type: 'choose_noble', nobleId: pending.options[0] };
  }

  if (!hasAnyLegalMove(state, playerId)) return { type: 'pass' };

  const candidates = enumerateCandidates(state, playerId);

  if (difficulty === 'easy') {
    return candidates[Math.floor(rng() * candidates.length)];
  }

  let best: GameplayMessage | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const clone = structuredClone(state);
    const result = applyGameplayMessage(clone, playerId, candidate);
    if (!result.ok) continue;

    let score = evaluate(result.state, playerId);
    if (difficulty === 'hard') score += denialBonus(state, playerId, candidate);
    score += rng() * (difficulty === 'hard' ? HARD_JITTER : MEDIUM_JITTER);

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best ?? { type: 'pass' };
}
