import { describe, expect, it } from 'vitest';
import { FINAL_PHASE_TYPES, Fighter, MOVES, enterFinalPhase, finalPhaseFor, shieldCap, traitMove } from '../src/data/fighters';
import { FINAL_BOSS_SHIELDS, FINAL_WAVE, isBossWave, isFinalWave } from '../src/data/zones';
import { buildSummary, formatRunTime } from '../src/data/summary';
import { FINAL_TALK, pickFinalTalk } from '../src/data/dialogue';
import { HEROES } from '../src/data/fighters';

describe('final boss: Super Egg Robo Z (wave 90)', () => {
  it('wave 90 is de laatste wave, en een boss-wave', () => {
    expect(FINAL_WAVE).toBe(90);
    expect(isFinalWave(90)).toBe(true);
    expect(isFinalWave(80)).toBe(false);
    expect(isBossWave(90)).toBe(true);
  });

  it('elke 2 kapotte schilden een fase verder (max fase 3)', () => {
    const n = FINAL_BOSS_SHIELDS, max = 600, seg = max / n;
    expect(finalPhaseFor(n, max, max)).toBe(1);
    expect(finalPhaseFor(n, max - seg, max)).toBe(1);
    expect(finalPhaseFor(n, max - 2 * seg, max)).toBe(2);
    expect(finalPhaseFor(n, max - 3 * seg, max)).toBe(2);
    expect(finalPhaseFor(n, max - 4 * seg, max)).toBe(3);
    expect(finalPhaseFor(n, 1, max)).toBe(3);
  });

  it('fase klopt ook als de schild-grens afgerond is (zoals shieldCap afrondt)', () => {
    const e = new Fighter('eggrobo', 60);
    e.segments = FINAL_BOSS_SHIELDS;
    e.hp = Math.ceil(e.maxHp * 4 / 6) + 1;
    const cap = shieldCap(e, 5);
    expect(cap.broken).toBe(1);
    expect(finalPhaseFor(FINAL_BOSS_SHIELDS, e.hp - cap.damage, e.maxHp)).toBe(2);
  });

  it('nieuwe fase: ander type en ATK +1; terug of dezelfde fase doet niks', () => {
    const e = new Fighter('eggrobo', 60);
    e.typeOverride = FINAL_PHASE_TYPES[0];
    expect(e.type).toBe('power');
    expect(enterFinalPhase(e, 1)).toBe(false);
    expect(enterFinalPhase(e, 2)).toBe(true);
    expect(e.type).toBe('speed');
    expect(e.stages.atk).toBe(1);
    expect(enterFinalPhase(e, 2)).toBe(false);
    expect(enterFinalPhase(e, 3)).toBe(true);
    expect(e.type).toBe('fly');
    expect(e.stages.atk).toBe(2);
    // fase 3: het kapotte hoofd
    expect(e.anim('idle')).toBe('eggrobo_broken');
  });

  it('kiest zijn aanvallen per fase, met de Missile Barrage vaker in fase 3', () => {
    const e = new Fighter('eggrobo', 60);
    const seq = (phase: number) => { e.phase = phase; return Array.from({ length: 6 }, (_, t) => { e.foeTurns = t; return traitMove(e)!.id; }); };
    expect(seq(1)).not.toContain('roboBarrage');
    expect(seq(2).filter(m => m === 'roboBarrage').length).toBe(2);
    expect(seq(3).filter(m => m === 'roboBarrage').length).toBe(3);
    for (const id of [...seq(1), ...seq(2), ...seq(3)]) expect(MOVES[id]).toBeDefined();
  });

  it('schilden: één klap breekt hooguit één schild', () => {
    const e = new Fighter('eggrobo', 60);
    e.segments = FINAL_BOSS_SHIELDS;
    const cap = shieldCap(e, e.maxHp);
    expect(cap.damage).toBeLessThan(e.maxHp);
    expect(e.hp - cap.damage).toBeGreaterThan(0);
  });
});

describe('Eggman op wave 90', () => {
  it('heeft een gesprekje voor elk speelbaar character, en Eggman begint', () => {
    for (const id of HEROES) {
      expect(FINAL_TALK[id]?.length, id).toBeGreaterThan(0);
      for (const ex of FINAL_TALK[id]) {
        expect(ex[0].who).toBe('rival');
        for (const l of ex) expect(l.text.length).toBeLessThanOrEqual(100);
      }
    }
    expect(pickFinalTalk('sonic', () => 0)).toBe(FINAL_TALK.sonic[0]);
    expect(pickFinalTalk('nobody')).toBeUndefined();
  });
});

describe('run summary', () => {
  it('neemt team, tas en run-statistieken over', () => {
    const a = new Fighter('sonic', 30), b = new Fighter('amy', 28);
    a.runDmg = 1234; a.runKos = 40; a.runDowns = 1; b.hp = 0;
    const s = buildSummary({ victory: false, wave: 57, rings: 321, emeralds: 3, bag: { healthRing: 2, revive: 0 }, timeMs: 3_725_000, defeatedBy: 'Foe Buzz Bomber', party: [a, b] });
    expect(s.bag).toEqual({ healthRing: 2 });
    expect(s.defeatedBy).toBe('Foe Buzz Bomber');
    expect(s.party[0]).toMatchObject({ id: 'sonic', level: 30, dmg: 1234, kos: 40, downs: 1, fainted: false });
    expect(s.party[1].fainted).toBe(true);
    expect(s.party[0].moves.length).toBeGreaterThanOrEqual(3);
    expect(formatRunTime(3_725_000)).toBe('1:02:05');
    expect(formatRunTime(65_000)).toBe('1:05');
    // gewonnen: geen "defeated by"
    expect(buildSummary({ victory: true, wave: 90, rings: 0, emeralds: 7, bag: {}, timeMs: 0, defeatedBy: 'x', party: [a] }).defeatedBy).toBeUndefined();
  });
});
