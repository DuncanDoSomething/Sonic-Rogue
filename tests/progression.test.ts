import { describe, expect, it } from 'vitest';
import { ITEMS, priceAt, shopStock } from '../src/data/items';
import { canHaveRival, isBossWave, zoneForWave, ZONES } from '../src/data/zones';
import { isUnlocked } from '../src/data/unlocks';
import { expShareAfter } from '../src/data/fighters';

describe('shop', () => {
  it('prijzen stijgen per zone', () => {
    expect(priceAt(ITEMS.healthRing, 1)).toBe(20);
    expect(priceAt(ITEMS.healthRing, 11)).toBeGreaterThan(20);
    expect(priceAt(ITEMS.healthRing, 41)).toBeGreaterThan(priceAt(ITEMS.healthRing, 11));
  });

  it('de shop gebruikt de prijs van de huidige zone', () => {
    const stock = shopStock(25);
    expect(stock.find(i => i.id === 'healthRing')?.price).toBe(priceAt(ITEMS.healthRing, 25));
  });
});

describe('zones en rivals', () => {
  it('wave 10 is een boss, wave 11 een nieuwe zone', () => {
    expect(isBossWave(10)).toBe(true);
    expect(zoneForWave(11).id).not.toBe(zoneForWave(10).id);
  });

  it('na de laatste zone begint de rij opnieuw', () => {
    expect(zoneForWave(ZONES.length * 10 + 1).id).toBe(ZONES[0].id);
  });

  it('rivals alleen op 15, 25, 35, ...', () => {
    expect([5, 14, 15, 20, 25, 35].map(canHaveRival)).toEqual([false, false, true, false, true, true]);
  });
});

describe('unlocks', () => {
  it('Sonic, Tails en Amy zijn speelbaar vanaf het begin, Knuckles en Cream niet', () => {
    expect(['sonic', 'tails', 'amy'].map(isUnlocked)).toEqual([true, true, true]);
    expect(['knuckles', 'cream'].map(isUnlocked)).toEqual([false, false]);
  });
});

describe('Exp Share', () => {
  it('0% tot wave 10, dan 50%, na wave 20 100%', () => {
    expect([1, 9, 10, 15, 19, 20, 55].map(expShareAfter)).toEqual([0, 0, 0.5, 0.5, 0.5, 0.8, 0.8]);
  });
});
