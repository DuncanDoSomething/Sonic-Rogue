import { describe, expect, it } from 'vitest';
import { Battle } from '../sim/engine';
import { goodPlayer } from '../sim/policy';

// De balans-simulatie (sim/) moet blijven werken als er moves of characters veranderen.
describe('balans-simulatie', () => {
  it('speelt een paar korte runs zonder te crashen, en is herhaalbaar met dezelfde seed', () => {
    for (const team of [['sonic', 'tails', 'amy'], ['knuckles', 'cream', 'shadow']]) {
      const a = new Battle(team, goodPlayer, 7, 25).run();
      const b = new Battle(team, goodPlayer, 7, 25).run();
      expect(a.reached).toBeGreaterThan(1);
      expect(a.reached).toBe(b.reached);
      expect(Object.keys(a.per)).toEqual(expect.arrayContaining(team));
    }
  });
});
