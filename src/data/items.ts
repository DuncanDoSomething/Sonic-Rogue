// ---------------------------------------------------------------------------
// Items voor de shop en je tas. Betere items komen vrij naarmate je verder komt
// (minWave), net als in PokéRogue.
// ---------------------------------------------------------------------------
import type { Fighter } from './fighters';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  minWave: number;
  /** aantal ring-icoontjes op de shop-knop (0 = chili dog-icoon via 1-up) */
  rings: number;
  /** Revive: werkt alleen op een KO-teamgenoot, met dit deel van zijn max-HP */
  revive?: number;
  use: (f: Fighter) => string;
}

/** Geneest een deel van de max-HP (procenten blijven de hele run even sterk, de prijs stijgt per zone). */
function heal(f: Fighter, part: number) {
  const h = Math.min(f.maxHp - f.hp, Math.ceil(f.maxHp * part));
  f.hp += h;
  return h;
}

/** Je tas heeft maar zoveel plekken (zoals potions in Slay the Spire), anders is healen te makkelijk. */
export const BAG_SIZE = 2;
export function bagCount(bag: Record<string, number>) {
  return Object.values(bag).reduce((n, v) => n + v, 0);
}

export const ITEMS: Record<string, ItemDef> = {
  healthRing: { id: 'healthRing', name: 'Health Ring', desc: 'Heals 25% HP', price: 30, minWave: 1, rings: 1,
    use: f => `${f.name} recovered ${heal(f, 0.25)} HP!` },
  superRing:  { id: 'superRing', name: 'Super Ring', desc: 'Heals 50% HP', price: 70, minWave: 11, rings: 2,
    use: f => `${f.name} recovered ${heal(f, 0.5)} HP!` },
  hyperRing:  { id: 'hyperRing', name: 'Hyper Ring', desc: 'Heals 75% HP', price: 130, minWave: 21, rings: 3,
    use: f => `${f.name} recovered ${heal(f, 0.75)} HP!` },
  chiliDog:   { id: 'chiliDog', name: 'Chili Dog', desc: 'Fully heals HP', price: 220, minWave: 31, rings: 0,
    use: f => `Delicious! ${f.name} recovered ${heal(f, 1)} HP!` },
  // duur, en pas vanaf wave 20: KO is normaal tot de volgende zone-boss
  revive:     { id: 'revive', name: 'Revive', desc: 'Revives a KO teammate with 50% HP', price: 250, minWave: 20, rings: 0, revive: 0.5,
    use: f => { f.hp = Math.max(1, Math.ceil(f.maxHp * 0.5)); return `${f.name} is back in the fight with ${f.hp} HP!`; } },
};

/** Prijzen stijgen per zone (net als in PokéRogue), anders kun je healing items oneindig stacken. */
export const PRICE_GROWTH_PER_ZONE = 1;
export function priceAt(item: ItemDef, wave: number) {
  const zone = Math.floor((wave - 1) / 10);
  return Math.round((item.price * (1 + PRICE_GROWTH_PER_ZONE * zone)) / 5) * 5;
}

/** Wat de shop verkoopt op deze wave (max 4, beste items rechts), met de prijs van deze zone. */
export function shopStock(wave: number): ItemDef[] {
  return Object.values(ITEMS).filter(i => wave >= i.minWave).slice(-4).map(i => ({ ...i, price: priceAt(i, wave) }));
}
