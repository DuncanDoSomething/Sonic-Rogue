import { describe, expect, it, beforeEach } from 'vitest';
import { Fighter } from '../src/data/fighters';
import { clearRun, fighterFromSave, fighterToSave, loadRun, saveRun } from '../src/data/save';

// Vitest draait in Node: een simpele localStorage om de save te testen
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
});

describe('auto-save', () => {
  beforeEach(() => store.clear());

  it('een character komt precies zo terug als hij was opgeslagen', () => {
    const f = new Fighter('amy', 17);
    f.hp = 12; f.exp = 40; f.boost = 5; f.raise('atk');
    const back = fighterFromSave(fighterToSave(f));
    expect([back.def.id, back.level, back.hp, back.exp, back.boost, back.stages.atk]).toEqual(['amy', 17, 12, 40, 5, 1]);
  });

  it('run-statistieken (voor de run summary) blijven bewaard', () => {
    const f = new Fighter('tails', 12);
    f.runDmg = 900; f.runKos = 14; f.runDowns = 2;
    const back = fighterFromSave(fighterToSave(f));
    expect([back.runDmg, back.runKos, back.runDowns]).toEqual([900, 14, 2]);
  });

  it('Iron Fists (al gebruikt deze zone) blijft bewaard', () => {
    const k = new Fighter('knuckles', 20);
    k.sashUsed = true;
    expect(fighterFromSave(fighterToSave(k)).sashUsed).toBe(true);
    expect(fighterFromSave(fighterToSave(new Fighter('knuckles', 20))).sashUsed).toBe(false);
  });

  it('opslaan, laden en wissen', () => {
    expect(loadRun()).toBeNull();
    saveRun({ wave: 23, rings: 140, emeralds: 2, expShare: 0.5, bag: { healthRing: 2 }, rivalsMet: ['knuckles'], active: 1,
      party: [new Fighter('sonic', 20), new Fighter('tails', 19)].map(fighterToSave) });
    const s = loadRun()!;
    expect([s.wave, s.rings, s.emeralds, s.active, s.party.length]).toEqual([23, 140, 2, 1, 2]);
    clearRun();
    expect(loadRun()).toBeNull();
  });

  it('een kapotte save wordt genegeerd in plaats van te crashen', () => {
    store.set('sonicrogue_run', '{kapot');
    expect(loadRun()).toBeNull();
  });
});
