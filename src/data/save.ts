// ---------------------------------------------------------------------------
// Auto-save: aan het begin van elke wave wordt de run opgeslagen in localStorage.
// Bij Game Start kun je dan verder waar je was. Game over = save weg.
// ---------------------------------------------------------------------------
import { Fighter, type Stages } from './fighters';

const KEY = 'sonicrogue_run';
const VERSION = 1;

export interface SavedFighter { id: string; level: number; exp: number; hp: number; boost: number; stages: Stages; }

export interface RunSave {
  v: number;
  wave: number;
  rings: number;
  emeralds: number;
  expShare: number;
  bag: Record<string, number>;
  rivalsMet: string[];
  /** index in `party` van wie er vecht */
  active: number;
  party: SavedFighter[];
}

export function fighterToSave(f: Fighter): SavedFighter {
  return { id: f.def.id, level: f.level, exp: f.exp, hp: f.hp, boost: f.boost, stages: { ...f.stages } };
}

export function fighterFromSave(s: SavedFighter): Fighter {
  const f = new Fighter(s.id, s.level);
  f.exp = s.exp;
  f.hp = Math.max(0, Math.min(f.maxHp, s.hp));
  f.boost = s.boost;
  f.stages = { ...f.stages, ...s.stages };
  return f;
}

/** Leest de save; bij een kapotte of oude save komt er niks terug (dan begin je gewoon opnieuw). */
export function loadRun(): RunSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RunSave;
    if (s.v !== VERSION || !Array.isArray(s.party) || !s.party.length) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveRun(s: Omit<RunSave, 'v'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s })); } catch { /* geen opslag: dan maar niet */ }
}

export function clearRun() {
  try { localStorage.removeItem(KEY); } catch { /* negeren */ }
}
