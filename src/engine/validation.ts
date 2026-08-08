import { COLORS, type Color, type Cost, type TokenColor } from '../shared/types.js';
import { MAX_RESERVED_CARDS, MAX_TOKENS_IN_HAND } from '../shared/constants.js';
import type { InternalGameState, InternalPlayerState } from './setup.js';

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export const OK: ValidationResult = { ok: true };

export function fail(reason: string): ValidationResult {
  return { ok: false, reason };
}

export function totalTokens(tokens: Record<TokenColor, number>): number {
  return Object.values(tokens).reduce((a, b) => a + b, 0);
}

export function validateTakeThreeDifferent(
  state: InternalGameState,
  colors: Color[],
): ValidationResult {
  if (colors.length < 1 || colors.length > 3) return fail('Must select 1-3 colors');
  if (new Set(colors).size !== colors.length) return fail('Colors must be distinct');
  for (const c of colors) {
    if (!COLORS.includes(c)) return fail(`Invalid color: ${c}`);
    if (state.bank[c] < 1) return fail(`No ${c} tokens left in bank`);
  }
  return OK;
}

export function validateTakeTwoSame(state: InternalGameState, color: Color): ValidationResult {
  if (!COLORS.includes(color)) return fail(`Invalid color: ${color}`);
  if (state.bank[color] < 4) return fail(`${color} pile must have at least 4 tokens to take 2`);
  return OK;
}

export function validateReserve(player: InternalPlayerState): ValidationResult {
  if (player.reservedCards.length >= MAX_RESERVED_CARDS) {
    return fail('Already have 3 reserved cards');
  }
  return OK;
}

/**
 * Computes the deterministic token payment for a cost, given owned bonuses and tokens.
 * Returns null if the player cannot afford it.
 */
export function computePayment(
  cost: Cost,
  bonuses: Record<Color, number>,
  tokens: Record<TokenColor, number>,
): Partial<Record<TokenColor, number>> | null {
  const payment: Partial<Record<TokenColor, number>> = {};
  let goldNeeded = 0;
  for (const color of COLORS) {
    const required = Math.max(0, (cost[color] ?? 0) - bonuses[color]);
    if (required === 0) continue;
    const fromTokens = Math.min(required, tokens[color]);
    if (fromTokens > 0) payment[color] = fromTokens;
    const shortfall = required - fromTokens;
    goldNeeded += shortfall;
  }
  if (goldNeeded > tokens.gold) return null;
  if (goldNeeded > 0) payment.gold = goldNeeded;
  return payment;
}

export function wouldExceedTokenLimit(tokens: Record<TokenColor, number>): number {
  const total = totalTokens(tokens);
  return total > MAX_TOKENS_IN_HAND ? total - MAX_TOKENS_IN_HAND : 0;
}
