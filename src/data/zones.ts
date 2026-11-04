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
  { id: 'leafforest', name: 'Leaf Forest', backdrop: 'leafforest', enemies: ['frog', 'bee', 'beetle'], boss: 'turtle' },
  { id: 'sunset', name: 'Sunset Hill', backdrop: 'sunset', enemies: ['frog', 'bee', 'beetle'], boss: 'turtle' },
  { id: 'hotcrater', name: 'Hot Crater', backdrop: 'hotcrater', enemies: ['mine', 'octo', 'beetle'], boss: 'turtle', effect: EFFECTS.heat },
  { id: 'toy', name: 'Toy Kingdom', backdrop: 'toy', enemies: ['pig', 'soldier', 'beetle'], boss: 'turtle', effect: EFFECTS.joy },
  { id: 'musicplant', name: 'Music Plant', backdrop: 'musicplant', enemies: ['soldier', 'bee', 'pig'], boss: 'turtle', effect: EFFECTS.joy },
  { id: 'twinkle', name: 'Twinkle Snow', backdrop: 'twinkle', enemies: ['penguin', 'snowman', 'mine'], boss: 'turtle', effect: EFFECTS.freezing },
  { id: 'iceparadise', name: 'Ice Paradise', backdrop: 'iceparadise', enemies: ['penguin', 'snowman', 'sharkjet'], boss: 'turtle', effect: EFFECTS.freezing },
  { id: 'skycanyon', name: 'Sky Canyon', backdrop: 'skycanyon', enemies: ['sharkjet', 'bee', 'octo'], boss: 'turtle', effect: EFFECTS.clouds },
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
/** Na een zone-boss (wave 10, 30, 50, 70) gaat iedereen onder deze HP er naartoe. */
export const ZONE_BOSS_HEAL = 0.5;
/** Na een main boss staat iedereen op minstens zoveel Boost. */
export const MAIN_BOSS_BOOST = 3;

/**
 * Rivals kunnen opduiken op wave 15, 25, 35, 45, 55 (en daarna elke wave die op 5 eindigt),
 * in plaats van de elite badnik. Niet gegarandeerd: RIVAL_CHANCE is de kans per keer.
 */
export const FIRST_RIVAL_WAVE = 15;
export const RIVAL_CHANCE = 0.5;
export function canHaveRival(wave: number) { return wave >= FIRST_RIVAL_WAVE && isEliteWave(wave); }
