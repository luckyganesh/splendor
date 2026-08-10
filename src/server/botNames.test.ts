import { describe, expect, it } from 'vitest';
import { drawBotName } from './botNames.js';

describe('drawBotName', () => {
  it('draws a name from the difficulty pool when the bag and room are empty', () => {
    const { name, remainingBag } = drawBotName([], 'easy', new Set());
    expect(name).toBeTruthy();
    expect(name).not.toMatch(/^Easy Bot \d+$/);
    expect(remainingBag).not.toContain(name);
  });

  it('never redraws the same name back-to-back from the same bag', () => {
    const first = drawBotName([], 'hard', new Set());
    const second = drawBotName(first.remainingBag, 'hard', new Set());
    expect(second.name).not.toBe(first.name);
  });

  it('reshuffles and keeps dealing real names once a bag empties, instead of falling back', () => {
    let bag: string[] = [];
    const drawn = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { name, remainingBag } = drawBotName(bag, 'medium', new Set());
      drawn.add(name);
      bag = remainingBag;
    }
    // Every draw should be a real pool name — nobody is "seated" so the fallback
    // should never trigger no matter how many times the bag cycles.
    expect([...drawn].every((n) => !/^Medium Bot \d+$/.test(n))).toBe(true);
  });

  it('skips a name currently held by a seated player, even mid-bag', () => {
    const { name: heldName, remainingBag } = drawBotName([], 'easy', new Set());
    const { name } = drawBotName(remainingBag, 'easy', new Set([heldName.toLowerCase()]));
    expect(name.toLowerCase()).not.toBe(heldName.toLowerCase());
  });

  it('falls back to a numbered name only when every pool name is currently seated', () => {
    // Exhaust the room by seating literally everyone the pool knows about.
    const everyone = new Set<string>();
    let bag: string[] = [];
    for (let i = 0; i < 30; i++) {
      const { name, remainingBag } = drawBotName(bag, 'hard', everyone);
      everyone.add(name.toLowerCase());
      bag = remainingBag;
      if (/^Hard Bot \d+$/.test(name)) break;
    }
    const overflow = drawBotName(bag, 'hard', everyone);
    expect(overflow.name).toMatch(/^Hard Bot \d+$/);
  });
});
