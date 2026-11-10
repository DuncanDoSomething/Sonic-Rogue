// ---------------------------------------------------------------------------
// Run summary (zoals in PokéRogue): na een game over én na de overwinning op wave 90.
// Een momentopname van de run, los van de Fighter-objecten, zodat de Summary-scene
// niks van de BattleScene nodig heeft.
// ---------------------------------------------------------------------------
import { MOVES, type Fighter, type FighterType } from './fighters';

export interface SummaryFighter {
  id: string; name: string; type: FighterType; level: number; fainted: boolean;
  hp: number; maxHp: number; atk: number; def: number; spd: number;
  passive?: string; moves: string[];
  dmg: number; kos: number; downs: number;
}

export interface RunSummary {
  victory: boolean;
  mode: 'Classic';
  wave: number;
  rings: number;
  emeralds: number;
  bag: Record<string, number>;
  timeMs: number;
  /** wie je laatste character neerhaalde (alleen bij game over) */
  defeatedBy?: string;
  party: SummaryFighter[];
  test?: boolean;
}

export function buildSummary(r: { victory: boolean; wave: number; rings: number; emeralds: number; bag: Record<string, number>;
  timeMs: number; defeatedBy?: string; party: Fighter[]; test?: boolean }): RunSummary {
  return {
    victory: r.victory, mode: 'Classic', wave: r.wave, rings: r.rings, emeralds: r.emeralds,
    bag: Object.fromEntries(Object.entries(r.bag).filter(([, n]) => n > 0)),
    timeMs: Math.max(0, r.timeMs), defeatedBy: r.victory ? undefined : r.defeatedBy || undefined, test: r.test,
    party: r.party.map(f => ({
      id: f.def.id, name: f.name, type: f.def.type, level: f.level, fainted: f.fainted,
      hp: Math.max(0, f.hp), maxHp: f.maxHp,
      // stats zonder de tijdelijke stages van het laatste gevecht
      atk: f.stat('atk'), def: f.stat('def'), spd: f.stat('spd'),
      passive: f.def.passive?.name, moves: f.moves.map(m => MOVES[m]?.name ?? m),
      dmg: f.runDmg, kos: f.runKos, downs: f.runDowns,
    })),
  };
}

/** 1:05:09 of 12:34 */
export function formatRunTime(ms: number): string {
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
