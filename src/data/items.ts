// ---------------------------------------------------------------------------
// Items voor de shop en je tas. Betere items komen vrij naarmate je verder komt
// (minWave), net als in PokéRogue.
// ---------------------------------------------------------------------------
import type { Fighter } from './fighters';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  /** prijs als veelvoud van baseValue(wave) (zie hieronder) */
  priceMult: number;
  /** de prijs op deze wave; wordt ingevuld door shopStock() */
  price?: number;
  minWave: number;
  /** aantal ring-icoontjes op de shop-knop (0 = chili dog-icoon via 1-up) */
  rings: number;
  /** Revive: werkt alleen op een KO-teamgenoot, met dit deel van zijn max-HP */
  revive?: number;
  use: (f: Fighter) => string;
}

/**
 * Geneest een vast aantal HP of een deel van de max-HP, wat het meeste is (zoals potions in PokéRogue).
 * Zo zijn heals vroeg in de run ook de moeite waard.
 */
export function heal(f: Fighter, flat: number, part: number) {
  const h = Math.min(f.maxHp - f.hp, Math.max(flat, Math.ceil(f.maxHp * part)));
  f.hp += h;
  return h;
}

/** Je tas heeft maar zoveel plekken (zoals potions in Slay the Spire), anders is healen te makkelijk. */
export const BAG_SIZE = 2;
/** Items uit je tas kosten geen beurt, maar je mag er maar zoveel per gevecht gebruiken. */
export const ITEMS_PER_FIGHT = 1;
export function bagCount(bag: Record<string, number>) {
  return Object.values(bag).reduce((n, v) => n + v, 0);
}

export const ITEMS: Record<string, ItemDef> = {
  healthRing: { id: 'healthRing', name: 'Health Ring', desc: 'Heals 25 HP or 25%', priceMult: 0.8, minWave: 1, rings: 1,
    use: f => `${f.name} recovered ${heal(f, 25, 0.25)} HP!` },
  superRing:  { id: 'superRing', name: 'Super Ring', desc: 'Heals 60 HP or 50%', priceMult: 1.8, minWave: 11, rings: 2,
    use: f => `${f.name} recovered ${heal(f, 60, 0.5)} HP!` },
  hyperRing:  { id: 'hyperRing', name: 'Hyper Ring', desc: 'Heals 120 HP or 75%', priceMult: 3, minWave: 21, rings: 3,
    use: f => `${f.name} recovered ${heal(f, 120, 0.75)} HP!` },
  chiliDog:   { id: 'chiliDog', name: 'Chili Dog', desc: 'Fully heals HP', priceMult: 5, minWave: 31, rings: 0,
    use: f => `Delicious! ${f.name} recovered ${heal(f, 0, 1)} HP!` },
  // duur, en pas vanaf wave 20: KO is normaal tot de volgende zone-boss
  revive:     { id: 'revive', name: 'Revive', desc: 'Revives a KO teammate with 50% HP', priceMult: 6, minWave: 20, rings: 0, revive: 0.5,
    use: f => { f.hp = Math.max(1, Math.ceil(f.maxHp * 0.5)); return `${f.name} is back in the fight with ${f.hp} HP!`; } },
};

// ---------------------------------------------------------------------------
// Geld, zoals in PokéRogue: één basisbedrag per wave, en zowel wat je verdient als wat
// dingen kosten is een veelvoud daarvan. Zo kunnen inkomen en prijzen nooit uit elkaar groeien.
// PokéRogue: (10 * wave + 175) ^ (1 + 0.005 * waveSet). Hier op onze schaal (minder rings per wave).
// ---------------------------------------------------------------------------
export function baseValue(wave: number) {
  const zone = Math.ceil(wave / 10) - 1;
  return Math.pow(2 * wave + 35, 1 + 0.005 * zone);
}
/** naar beneden afronden op 5 */
const round5 = (n: number) => Math.max(5, Math.floor(n / 5) * 5);

/** Rings voor het winnen van een wave (bosses x2, elites x1.5). */
export const WAVE_RINGS = 0.35;
export function waveRings(wave: number, kind: 'normal' | 'elite' | 'boss' = 'normal') {
  return round5(baseValue(wave) * WAVE_RINGS * (kind === 'boss' ? 2 : kind === 'elite' ? 1.5 : 1));
}
/** Rings uit een reward (Ring Monitor = 1, Eggman Monitor = 4). */
export function rewardRings(wave: number, mult: number) {
  return round5(baseValue(wave) * mult);
}
export function priceAt(item: ItemDef, wave: number) {
  return round5(baseValue(wave) * item.priceMult);
}
/** Reroll van de rewards: wordt elke keer dubbel zo duur. */
export function rerollCost(wave: number, rerolls: number) {
  return round5(baseValue(wave) * 0.5) * 2 ** rerolls;
}

/** Wat de shop verkoopt op deze wave (max 4, beste items rechts), met de prijs van deze zone. */
export function shopStock(wave: number): ItemDef[] {
  return Object.values(ITEMS).filter(i => wave >= i.minWave).slice(-4).map(i => ({ ...i, price: priceAt(i, wave) }));
}
