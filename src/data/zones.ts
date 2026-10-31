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
  heat:     { name: 'HEAT', short: 'ATK-1  BURN', desc: 'ATK -1, burns 1/16 HP each turn', color: '#ff8a3a', stages: { atk: -1 }, burn: 1 / 16 },
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

/** Volgorde: Advance 3 en Advance 2 wisselen elkaar af, Sky Canyon als finale. */
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

export function zoneForWave(wave: number): ZoneDef {
  return ZONES[Math.floor((wave - 1) / WAVES_PER_ZONE) % ZONES.length];
}
export function waveInZone(wave: number) { return ((wave - 1) % WAVES_PER_ZONE) + 1; }
export function isBossWave(wave: number) { return waveInZone(wave) === WAVES_PER_ZONE; }
export function isEliteWave(wave: number) { return waveInZone(wave) === Math.ceil(WAVES_PER_ZONE / 2); }

/**
 * Rivals kunnen opduiken op wave 15, 25, 35, 45, 55 (en daarna elke wave die op 5 eindigt),
 * in plaats van de elite badnik. Niet gegarandeerd: RIVAL_CHANCE is de kans per keer.
 */
export const FIRST_RIVAL_WAVE = 15;
export const RIVAL_CHANCE = 0.5;
export function canHaveRival(wave: number) { return wave >= FIRST_RIVAL_WAVE && isEliteWave(wave); }
