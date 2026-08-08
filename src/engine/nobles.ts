import { COLORS, type ColorCount, type Noble } from '../shared/types.js';

export function nobleIsSatisfiedBy(noble: Noble, bonuses: ColorCount): boolean {
  return COLORS.every((color) => bonuses[color] >= (noble.requirement[color] ?? 0));
}

export function eligibleNobles(nobles: Noble[], bonuses: ColorCount): Noble[] {
  return nobles.filter((n) => !n.claimedBy && nobleIsSatisfiedBy(n, bonuses));
}
