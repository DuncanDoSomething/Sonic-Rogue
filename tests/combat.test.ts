import { describe, expect, it } from 'vitest';
import {
  Fighter, MAX_BOOST, MAX_STAGE, MOVES, START_BOOST, ULTIMATE_LEVEL,
  calcHit, stageMultiplier, typeMultiplier, TYPE_STRONG, TYPE_WEAK, speedPower, movePower, REWARDS,
} from '../src/data/fighters';

/** Vaste "random": geeft steeds dezelfde waarde terug, zodat de uitkomst voorspelbaar is. */
const fixed = (v: number) => () => v;

describe('stat stages', () => {
  it('+1 tot +6 geeft 25% per stap', () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(1)).toBe(1.25);
    expect(stageMultiplier(2)).toBe(1.5);
    expect(stageMultiplier(3)).toBe(1.75);
    expect(stageMultiplier(6)).toBe(2.5);
  });

  it('omlaag spiegelt omhoog: -1 heft +1 precies op', () => {
    for (let n = 1; n <= 6; n++) expect(stageMultiplier(n) * stageMultiplier(-n)).toBeCloseTo(1);
    expect(stageMultiplier(-6)).toBeCloseTo(0.4);
  });

  it('stages gaan nooit voorbij +6 of -6', () => {
    const f = new Fighter('sonic', 10);
    for (let i = 0; i < 10; i++) f.raise('atk');
    expect(f.stages.atk).toBe(MAX_STAGE);
    expect(f.raise('atk')).toContain("won't go any higher");
    for (let i = 0; i < 20; i++) f.raise('atk', -1);
    expect(f.stages.atk).toBe(-MAX_STAGE);
  });

  it('zone-effect telt op bij de reward-stages', () => {
    const f = new Fighter('sonic', 10);
    const base = f.spd;
    f.raise('spd');
    f.field.spd = -1; // Twinkle Snow
    expect(f.stage('spd')).toBe(0);
    expect(f.spd).toBe(base);
  });
});

describe('types (Fly > Power > Speed > Fly)', () => {
  it('voordeel, nadeel en neutraal', () => {
    expect(typeMultiplier('fly', 'power')).toBe(TYPE_STRONG);
    expect(typeMultiplier('power', 'speed')).toBe(TYPE_STRONG);
    expect(typeMultiplier('speed', 'fly')).toBe(TYPE_STRONG);
    expect(typeMultiplier('power', 'fly')).toBe(TYPE_WEAK);
    expect(typeMultiplier('speed', 'speed')).toBe(1);
  });

  it('elk speelbaar character en elke badnik heeft een type', () => {
    for (const id of ['sonic', 'tails', 'knuckles', 'cream', 'amy', 'beetle', 'turtle']) {
      expect(['speed', 'fly', 'power']).toContain(new Fighter(id, 5).type);
    }
  });
});

describe('damage', () => {
  it('mist als de rol boven de accuracy ligt', () => {
    const r = calcHit(new Fighter('sonic', 10), new Fighter('frog', 10), MOVES.spinAttack, fixed(0.99));
    expect(r.missed).toBe(true);
    expect(r.damage).toBe(0);
  });

  it('moves die Boost kosten missen nooit (zonder ACC-debuff)', () => {
    for (const m of Object.values(MOVES).filter(m => (m.cost ?? 0) > 0)) expect(m.accuracy).toBe(100);
    expect(calcHit(new Fighter('sonic', 10), new Fighter('frog', 10), MOVES.spinDash, fixed(0.99)).missed).toBe(false);
  });

  it('type-voordeel doet meer schade dan neutraal', () => {
    const sonic = new Fighter('sonic', 10);
    const vsFly = calcHit(sonic, new Fighter('beetle', 10), MOVES.spinAttack, fixed(0.5));   // speed > fly
    const vsSpeed = calcHit(sonic, new Fighter('frog', 10), MOVES.spinAttack, fixed(0.5));   // neutraal
    expect(vsFly.effect).toBe(TYPE_STRONG);
    expect(vsSpeed.effect).toBe(1);
  });

  it('ATK +2 doet meer schade dan ATK 0', () => {
    const a = new Fighter('knuckles', 20);
    const target = new Fighter('pig', 20);
    const before = calcHit(a, target, MOVES.spinAttack, fixed(0.5)).damage;
    a.raise('atk'); a.raise('atk');
    expect(calcHit(a, target, MOVES.spinAttack, fixed(0.5)).damage).toBeGreaterThan(before);
  });

  it('ACC -1 (Sky Canyon) kan een anders zekere treffer laten missen', () => {
    const a = new Fighter('sonic', 10);
    a.field.acc = -1; // 95 * 0.8 = 76
    expect(calcHit(a, new Fighter('bee', 10), MOVES.spinAttack, fixed(0.85)).missed).toBe(true);
  });
});

describe('boost', () => {
  it('begint op START_BOOST en Spin Attack vult hem', () => {
    const f = new Fighter('sonic', 5);
    expect(f.boost).toBe(START_BOOST);
    f.spendBoost(MOVES.spinAttack);
    expect(f.boost).toBe(START_BOOST + 1);
  });

  it('sterke moves kosten Boost en kunnen niet zonder', () => {
    const f = new Fighter('sonic', 5);
    f.boost = 2;
    expect(f.canUse(MOVES.spinDash)).toBe(false);
    f.boost = 3;
    f.spendBoost(MOVES.spinDash);
    expect(f.boost).toBe(0);
  });

  it('nooit boven MAX_BOOST', () => {
    const f = new Fighter('tails', 5);
    for (let i = 0; i < 20; i++) f.gainBoost(1);
    expect(f.boost).toBe(MAX_BOOST);
  });

  it('ultimate pas vanaf ULTIMATE_LEVEL en kost de hele meter', () => {
    const f = new Fighter('amy', ULTIMATE_LEVEL - 1);
    expect(f.moves).toHaveLength(3);
    f.level = ULTIMATE_LEVEL;
    expect(f.moves).toContain('tornadoHammer');
    expect(MOVES.tornadoHammer.cost).toBe(MAX_BOOST);
  });
});

describe('Spin Dash schaalt met snelheid (Electro Ball)', () => {
  it('power per snelheids-verhouding', () => {
    expect(speedPower(10, 20)).toBe(50);   // trager
    expect(speedPower(20, 20)).toBe(70);   // even snel
    expect(speedPower(40, 20)).toBe(90);   // 2x
    expect(speedPower(60, 20)).toBe(120);  // 3x
    expect(speedPower(80, 20)).toBe(150);  // 4x of meer
  });

  it('Speed Shoes maken Spin Dash sterker', () => {
    const sonic = new Fighter('sonic', 11), boss = new Fighter('turtle', 11);
    const before = movePower(MOVES.spinDash, sonic, boss);
    for (let i = 0; i < 4; i++) sonic.raise('spd');
    expect(movePower(MOVES.spinDash, sonic, boss)).toBeGreaterThan(before);
  });

  it('andere moves houden hun vaste power', () => {
    expect(movePower(MOVES.spinAttack, new Fighter('sonic', 5), new Fighter('frog', 5))).toBe(MOVES.spinAttack.power);
  });
});

describe('rewards', () => {
  it('alle stat-rewards zijn gemarkeerd (zodat ze na een boss niet verschijnen)', () => {
    expect(REWARDS.filter(r => r.stage).map(r => r.id).sort()).toEqual(['gloves', 'shield', 'shoes']);
  });
});
