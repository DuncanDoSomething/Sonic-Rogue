// ---------------------------------------------------------------------------
// Instellingen die tussen sessies bewaard blijven (localStorage, per browser).
// ---------------------------------------------------------------------------

export const TEXT_SPEEDS = ['Slow', 'Normal', 'Fast', 'Instant'] as const;
export const BATTLE_SPEEDS = ['1x', '2x', '3x'] as const;
/** Switch = voor elke wave vragen of je wilt wisselen (gratis); Set = niet vragen. */
export const BATTLE_STYLES = ['Switch', 'Set'] as const;
/** volume 0-10, getoond als balkje */
/** Tails' tips de eerste keer dat iets gebeurt */
export const TIP_OPTIONS = ['On', 'Off'] as const;
export const VOLUMES = Array.from({ length: 11 }, (_, i) => (i === 0 ? 'Off' : '|'.repeat(i)));

export interface Settings { textSpeed: number; battleSpeed: number; musicVolume: number; sfxVolume: number; battleStyle: number; tips: number; }

const KEY = 'sonic-rogue-settings';
const DEFAULTS: Settings = { textSpeed: 1, battleSpeed: 0, musicVolume: 7, sfxVolume: 8, battleStyle: 0, tips: 0 };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* geen storage beschikbaar: defaults */ }
  return { ...DEFAULTS };
}

export const settings: Settings = load();
// oude opgeslagen waarde (toen 1.5x nog bestond) netjes binnen de lijst houden
settings.battleSpeed = Math.min(Math.max(settings.battleSpeed, 0), BATTLE_SPEEDS.length - 1);
settings.textSpeed = Math.min(Math.max(settings.textSpeed, 0), TEXT_SPEEDS.length - 1);

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* negeren */ }
}

/** ms per letter in het tekstvak */
export function charDelay() { return [40, 18, 6, 0][settings.textSpeed]; }
/** hoe lang een bericht blijft staan, als factor */
export function holdFactor() { return [1.3, 1, 0.6, 0.35][settings.textSpeed]; }
/** snelheid van aanvallen in de battle */
export function battleTimeScale() { return [1, 2, 3][settings.battleSpeed]; }
