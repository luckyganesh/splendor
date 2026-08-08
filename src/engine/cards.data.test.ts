import { describe, expect, it } from 'vitest';
import { COLORS } from '../shared/types.js';
import { CARDS, NOBLES } from './cards.data.js';

describe('cards.data integrity', () => {
  it('has exactly 90 cards', () => {
    expect(CARDS.length).toBe(90);
  });

  it('has unique card ids', () => {
    const ids = new Set(CARDS.map((c) => c.id));
    expect(ids.size).toBe(CARDS.length);
  });

  it('has the correct tier counts (40/30/20)', () => {
    const byTier = { 1: 0, 2: 0, 3: 0 };
    for (const c of CARDS) byTier[c.tier]++;
    expect(byTier[1]).toBe(40);
    expect(byTier[2]).toBe(30);
    expect(byTier[3]).toBe(20);
  });

  it('has 8/6/4 cards per color per tier', () => {
    for (const tier of [1, 2, 3] as const) {
      for (const color of COLORS) {
        const count = CARDS.filter((c) => c.tier === tier && c.color === color).length;
        const expected = tier === 1 ? 8 : tier === 2 ? 6 : 4;
        expect(count, `tier ${tier} ${color}`).toBe(expected);
      }
    }
  });

  it('every card has a non-empty cost', () => {
    for (const c of CARDS) {
      const total = Object.values(c.cost).reduce((a, b) => a + (b ?? 0), 0);
      expect(total, c.id).toBeGreaterThan(0);
    }
  });

  it('every card has non-negative integer points', () => {
    for (const c of CARDS) {
      expect(Number.isInteger(c.points)).toBe(true);
      expect(c.points).toBeGreaterThanOrEqual(0);
    }
  });

  it('has exactly 10 nobles, each worth 3 points, with unique ids', () => {
    expect(NOBLES.length).toBe(10);
    expect(new Set(NOBLES.map((n) => n.id)).size).toBe(10);
    for (const n of NOBLES) expect(n.points).toBe(3);
  });

  it('every noble requirement is non-empty', () => {
    for (const n of NOBLES) {
      const total = Object.values(n.requirement).reduce((a, b) => a + (b ?? 0), 0);
      expect(total, n.id).toBeGreaterThan(0);
    }
  });
});
