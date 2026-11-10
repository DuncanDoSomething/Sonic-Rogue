// ---------------------------------------------------------------------------
// Zones: elke zone duurt WAVES_PER_ZONE waves en heeft eigen badniks + achtergrond.
// De laatste wave van een zone is de zone-boss (Chaos Angel-achtergrond) en levert
// een Chaos Emerald op. Halverwege komt een sterkere "elite" badnik.
// ---------------------------------------------------------------------------

export const WAVES_PER_ZONE = 10;

import type { StageKey } from './fighters';

/** Zone-effect: geldt voor jouw character zolang je in de zone bent. */
export interface ZoneEffect {
  name: string;
  desc: string;
  color: string;
  /** korte versie voor het label boven je info-box */
  short: string;
  stages: Partial<Record<StageKey, number>>;
  /** schade per beurt als deel van je max-HP (1/16 = 0.0625) */
  burn?: number;
}

export const EFFECTS = {
  heat:     { name: 'HEAT', short: 'BURN', desc: 'Burns 1/16 HP each turn', color: '#ff8a3a', stages: {}, burn: 1 / 16 },
  joy:      { name: 'JOY', short: 'DEF-1', desc: 'Too much fun! DEF -1', color: '#ff7ad0', stages: { def: -1 } },
  freezing: { name: 'FREEZING', short: 'SPD-1', desc: 'Cold paws: SPD -1', color: '#9ad8ff', stages: { spd: -1 } },
  clouds:   { name: 'CLOUDS', short: 'ACC-1', desc: 'Hard to see: ACC -1', color: '#e8eef8', stages: { acc: -1 } },
} satisfies Record<string, ZoneEffect>;

export interface ZoneDef {
  id: string;
  name: string;
  backdrop: string;   // key in BACKDROPS (src/scenes/Backdrop.ts)
  enemies: string[];
  boss: string;
  effect?: ZoneEffect;
}

/** Alle zones in hun vaste volgorde (oude saves zonder `zoneOrder` gebruiken die nog). */
export const ZONES: ZoneDef[] = [
  { id: 'route99', name: 'Route 99', backdrop: 'route99', enemies: ['beetle', 'sharkjet', 'octo'], boss: 'turtle' },
  { id: 'leafforest', name: 'Leaf Forest', backdrop: 'leafforest', enemies: ['frog', 'bee', 'kiki'], boss: 'turtle' },
  { id: 'sunset', name: 'Sunset Hill', backdrop: 'sunset', enemies: ['frog', 'slot', 'mirror'], boss: 'turtle' },
  { id: 'hotcrater', name: 'Hot Crater', backdrop: 'hotcrater', enemies: ['mine', 'octo', 'kiki'], boss: 'turtle', effect: EFFECTS.heat },
  { id: 'toy', name: 'Toy Kingdom', backdrop: 'toy', enemies: ['pig', 'soldier', 'slot'], boss: 'turtle', effect: EFFECTS.joy },
  { id: 'musicplant', name: 'Music Plant', backdrop: 'musicplant', enemies: ['soldier', 'mirror', 'pig'], boss: 'turtle', effect: EFFECTS.joy },
  { id: 'twinkle', name: 'Twinkle Snow', backdrop: 'twinkle', enemies: ['penguin', 'snowman', 'mine'], boss: 'turtle', effect: EFFECTS.freezing },
  { id: 'iceparadise', name: 'Ice Paradise', backdrop: 'iceparadise', enemies: ['penguin', 'snowman', 'sharkjet'], boss: 'turtle', effect: EFFECTS.freezing },
  { id: 'skycanyon', name: 'Sky Canyon', backdrop: 'skycanyon', enemies: ['sharkjet', 'slot', 'octo'], boss: 'turtle', effect: EFFECTS.clouds },
];

export const EMERALDS = ['red', 'blue', 'yellow', 'green', 'white', 'cyan', 'purple'] as const;

/**
 * Zone-volgorde per run: Route 99 en Leaf Forest staan altijd vooraan, daarna wordt er geschud
 * binnen poules, zodat de zware zones aan het eind blijven. Een blok (array) blijft bij elkaar:
 * Music Plant en Toy Kingdom komen altijd direct na elkaar (in willekeurige volgorde).
 */
export const ZONE_START = ['route99', 'leafforest'];
export const ZONE_POOLS: Array<Array<string | string[]>> = [
  ['sunset', ['musicplant', 'toy']],   // midden
  ['twinkle', 'iceparadise'],          // midden-laat
  ['hotcrater', 'skycanyon'],          // eind
];
export const DEFAULT_ZONE_ORDER = ZONES.map(z => z.id);

export function rollZoneOrder(rng: () => number = Math.random): string[] {
  const shuffle = <T>(a: T[]) => {
    const out = [...a];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return [...ZONE_START, ...ZONE_POOLS.flatMap(pool => shuffle(pool).flatMap(u => (Array.isArray(u) ? shuffle(u) : [u])))];
}

/** Zone van een wave. `order` = de volgorde van deze run (zie rollZoneOrder). */
export function zoneForWave(wave: number, order: string[] = DEFAULT_ZONE_ORDER): ZoneDef {
  const id = order[Math.floor((wave - 1) / WAVES_PER_ZONE) % order.length];
  return ZONES.find(z => z.id === id) ?? ZONES[0];
}
export function waveInZone(wave: number) { return ((wave - 1) % WAVES_PER_ZONE) + 1; }
export function isBossWave(wave: number) { return waveInZone(wave) === WAVES_PER_ZONE; }
export function isEliteWave(wave: number) { return waveInZone(wave) === Math.ceil(WAVES_PER_ZONE / 2); }
/** Elke tweede boss (wave 20, 40, 60, 80) is een main boss: daarna is het hele team weer fit. */
export function isMainBossWave(wave: number) { return isBossWave(wave) && wave % (WAVES_PER_ZONE * 2) === 0; }
/**
 * Main bosses: wave 20 en 60 Eggman, wave 40 en 80 Shadow (zit Shadow al in je team, dan Eggman).
 * Shadow verslaan speelt hem vrij.
 */
/**
 * Main bosses (wave 20, 40, 60, 80): altijd Eggman, behalve met een kleine kans Shadow,
 * als een legendary in Pokémon. Zit Shadow al in je team, dan is het gewoon Eggman.
 */
export const SHADOW_BOSS_CHANCE = 0.1;
export function mainBossFor(_wave: number, party: string[] = [], rng: () => number = Math.random): string {
  return !party.includes('shadow') && rng() < SHADOW_BOSS_CHANCE ? 'shadow' : 'eggman';
}
/** Vijanden (behalve rivals) worden vanaf de derde zone elke zone zoveel sterker (HP, ATK, DEF). */
export const ENEMY_ZONE_SCALING = 0.08;
/** Rings waarmee een run begint (een eerste item in de shop). */
export const START_RINGS = 100;
/**
 * Badniks (gewone waves en elites, geen bosses) hebben extra HP en ATK, zodat ze geen voer zijn.
 * Moe koos eerst "heel zwaar", toen 1,5x HP / 1,5x ATK, en nu 1,3x HP / 1,5x ATK (badniks doen echt schade, maar
 * zijn niet te taai), met Piggy Bank tot DEF +2. Sim, 1.000 runs per team:
 *   HP 1,5x ATK 1,5x -> gem. wave 54, mediaan 50, 6% haalt wave 90, 3,7 beurten, 8,3% HP per gevecht
 *   HP 1,3x ATK 1,5x -> gem. wave 62, mediaan 59, 10% haalt wave 90, 3,4 beurten, 7,7% HP per gevecht (gekozen)
 * De schalen uit de sim (150 runs per team, nov 2026, nog zonder Kiki/Mirror/Slot), voor als we willen bijstellen:
 *   HP 1x   ATK 1x    -> 3,2 beurten, 6,0% HP-verlies per gevecht, gem. wave 86
 *   HP 1,4x ATK 1,1x  -> 3,9 beurten, 7,5%, gem. wave 73 (midden)
 *   HP 1,6x ATK 1x    -> 4,3 beurten, 7,8%, gem. wave 69
 *   HP 1,5x ATK 1,25x -> 4,0 beurten, 7,9%, gem. wave 66 (zwaar)
 *   HP 2x   ATK 1,5x  -> 4,7 beurten, 9,2%, gem. wave 46 (heel zwaar)
 */
export const BADNIK_HP_MULT = 1.3;
export const BADNIK_ATK_MULT = 1.5;
export function enemyScaling(wave: number) {
  const zone = Math.floor((wave - 1) / WAVES_PER_ZONE);
  return 1 + ENEMY_ZONE_SCALING * Math.max(0, zone - 1);
}
/** Boss-Shadow heeft zoveel keer zijn normale HP. */
export const SHADOW_BOSS_HP = 2;
/** Boss-schilden (stukken HP-balk): zone-bosses en main bosses. */
export const ZONE_BOSS_SHIELDS = 4;
export const MAIN_BOSS_SHIELDS = 5;
/** Na een zone-boss (wave 10, 30, 50, 70) gaat iedereen onder deze HP er naartoe. */
export const ZONE_BOSS_HEAL = 0.5;
/** Na een main boss staat iedereen op minstens zoveel Boost. */
export const MAIN_BOSS_BOOST = 3;

/**
 * Rivals kunnen opduiken op wave 15, 25, 35, 45, 55 (elke wave die op 5 eindigt) in plaats van de elite,
 * met RIVAL_CHANCE. Sinds rivals schilden en een eigen truc hebben, komen ze niet meer op gewone waves
 * en staan ze niet meer boven je level (sim: anders zakte een gemiddelde run van wave 80 naar 57).
 */
export const FIRST_RIVAL_WAVE = 15;
export const RIVAL_CHANCE = 0.75;
export function canHaveRival(wave: number) { return wave >= FIRST_RIVAL_WAVE && isEliteWave(wave); }
export function rivalChance(wave: number) {
  if (isBossWave(wave) || wave < FIRST_RIVAL_WAVE) return 0;
  return isEliteWave(wave) ? RIVAL_CHANCE : 0;
}
/** Rivals staan op jouw niveau (de schilden maken ze al zwaarder). */
export function rivalLevelBonus(_wave: number) { return 0; }
