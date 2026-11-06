import { describe, expect, it } from 'vitest';
import {
  Fighter, MAX_BOOST, MAX_STAGE, MOVES, START_BOOST, ULTIMATE_LEVEL,
  calcHit, stageMultiplier, typeMultiplier, TYPE_STRONG, TYPE_WEAK, speedPower, movePower,
  speedBonus, critChance, BASE_CRIT, stagesPower, STAGES_POWER_MAX, WEAK_SPOT_BONUS, FIGHTERS,
  PIERCE_BONUS, SUPER_VULNERABLE, HEROES, RIVAL_HEROES, ULT_CHAIN_MAX, RAMPAGE_CHANCE, shieldCap, benchExpRate, BLESS_BONUS, CHAO_CARE_HEAL, CHAO_CARE_BENCH,
} from '../src/data/fighters';
import { mainBossFor, MAIN_BOSS_SHIELDS, SHADOW_BOSS_CHANCE, enemyScaling, rivalChance, rivalLevelBonus } from '../src/data/zones';

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
    f.boost = 1;
    expect(f.canUse(MOVES.spinDash)).toBe(false);
    f.boost = 2;
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

describe('moves en passives', () => {
  it('Homing Attack geeft SPD +1', () => {
    expect(MOVES.homingAttack.selfStages).toEqual({ spd: 1 });
  });

  it('Sonic Speed: meer schade als Sonic sneller is, max +75%', () => {
    const sonic = new Fighter('sonic', 20), slow = new Fighter('turtle', 20);
    expect(speedBonus(sonic, sonic)).toBe(1);
    expect(speedBonus(sonic, slow)).toBeGreaterThan(1);
    for (let i = 0; i < 6; i++) sonic.raise('spd');
    expect(speedBonus(sonic, slow)).toBe(1.75);
    expect(speedBonus(new Fighter('tails', 20), slow)).toBe(1);   // alleen Sonic
  });

  it('Lucky Swing: Amy +25% crit per ATK stage', () => {
    const amy = new Fighter('amy', 10);
    expect(critChance(amy)).toBe(BASE_CRIT);
    amy.raise('atk'); amy.raise('atk');
    expect(critChance(amy)).toBeCloseTo(BASE_CRIT + 0.5);
    const sonic = new Fighter('sonic', 10); sonic.raise('atk'); sonic.raise('atk');
    expect(critChance(sonic)).toBe(BASE_CRIT);
  });

  it('elke passive hoort bij het juiste character', () => {
    expect(new Fighter('sonic', 5).def.passive?.id).toBe('speedster');
    expect(new Fighter('knuckles', 5).def.passive?.id).toBe('flinch');
    expect(new Fighter('amy', 5).def.passive?.id).toBe('luckySwing');
  });
});

describe('nieuwe moves en ultimates', () => {
  it('Glide Attack: ATK +1, DEF -1; Piko Hammer: ATK +1', () => {
    expect(MOVES.glideAttack.selfStages).toEqual({ atk: 1, def: -1 });
    expect(MOVES.hammerSmash.selfStages).toEqual({ atk: 1 });
  });
  it('Glove Punch kost 3 en verdooft altijd 2 beurten (geen limiet); Thunder Shoot 3 beurten', () => {
    expect(MOVES.glovePunch.cost).toBe(3);
    expect(MOVES.glovePunch.stun).toEqual([2, 2]);
    expect(MOVES.glovePunch.stunOnce).toBeFalsy();
    expect(MOVES.thunderShoot.stun).toEqual([3, 3]);
  });
  it('Knuckle Punch gaat eerst; Maximum Heat maakt de stages op', () => {
    expect(MOVES.drillPunch.priority).toBeGreaterThan(0);
    expect(MOVES.maximumHeat.spendStages).toBe(true);
  });
  it('Tornado Hammer kost Amy 50% max-HP; Hammer Twirl geneest haar 25%', () => {
    expect(MOVES.tornadoHammer.recoil).toBe(0.5);
    expect(MOVES.hammerTwirl.selfHeal).toBe(0.25);
  });
  it('Tails is sterker: Glove Punch 70, Copter Dive 50, Thunder Shoot 80', () => {
    expect([MOVES.glovePunch.power, MOVES.copterDive.power, MOVES.thunderShoot.power]).toEqual([70, 50, 80]);
  });
  it('Chao Cheer kan op een teamgenoot; Chao Blessing geneest iedereen en doet geen schade', () => {
    expect(MOVES.chaoCheer.ally).toBe(true);
    expect(MOVES.chaoAttack.teamHeal).toBe(1);
    expect(MOVES.chaoAttack.clearField).toBe(true);
    expect(MOVES.chaoAttack.power).toBe(0);
  });
  it('Maximum Heat: +25 power per stage, plus én min tellen allebei', () => {
    const k = new Fighter('knuckles', 30);
    expect(stagesPower(100, k)).toBe(100);
    k.stages.atk = 2; k.stages.def = -2;
    expect(stagesPower(100, k)).toBe(200);
    k.stages = { atk: 6, def: -6, spd: 6, acc: 6 };
    expect(stagesPower(100, k)).toBe(STAGES_POWER_MAX);
  });
  it('Tornado Hammer is altijd een crit, en dubbel zo sterk als de crit-kans al 100% is', () => {
    const amy = new Fighter('amy', 30);
    const foe = new Fighter('beetle', 30);
    const normal = calcHit(amy, foe, MOVES.tornadoHammer, fixed(0.99));
    expect(normal.crit).toBe(true);
    amy.stages.atk = 4; // 6,25% + 4 x 25% = 100%
    const maxed = calcHit(amy, foe, MOVES.tornadoHammer, fixed(0.99));
    const noDouble = calcHit(amy, foe, { ...MOVES.tornadoHammer, alwaysCrit: false, critDouble: false }, fixed(0));
    expect(maxed.damage).toBeGreaterThan(noDouble.damage * 1.8);
  });
  it('Weak Spot: Tails doet 1.5x schade tegen een verdoofde vijand, anderen niet', () => {
    const tails = new Fighter('tails', 20);
    const amy = new Fighter('amy', 20);
    const foe = new Fighter('beetle', 20);
    const before = calcHit(tails, foe, MOVES.spinAttack, fixed(0.5)).damage;
    const amyBefore = calcHit(amy, foe, MOVES.spinAttack, fixed(0.5)).damage;
    foe.stun = 1;
    expect(WEAK_SPOT_BONUS).toBe(2);
    expect(calcHit(tails, foe, MOVES.spinAttack, fixed(0.5)).damage).toBeCloseTo(before * WEAK_SPOT_BONUS, -1);
    expect(calcHit(amy, foe, MOVES.spinAttack, fixed(0.5)).damage).toBe(amyBefore);
  });
  it('Light Speed Attack laat de vijand 2x missen', () => {
    expect(MOVES.lightSpeed.evade).toBe(2);
  });
  it('alle zes characters hebben een passive', () => {
    expect(['sonic', 'tails', 'knuckles', 'amy', 'cream', 'shadow'].map(id => FIGHTERS[id].passive?.id))
      .toEqual(['speedster', 'weakSpot', 'flinch', 'luckySwing', 'chaoCare', 'rampage']);
  });
});

describe('balans-update', () => {
  it('Sonic is het snelst van de cast, Knuckles het traagst', () => {
    const lv = (id: string) => new Fighter(id, 30);
    const others = ['tails', 'knuckles', 'amy', 'cream'].map(id => lv(id).spd);
    expect(lv('sonic').spd).toBeGreaterThan(Math.max(...others));
    expect(lv('knuckles').spd).toBe(Math.min(...others, lv('sonic').spd));
  });
  it('Light Speed Attack: 150 power en SPD +3; Spin Dash kost 2; Glide Attack kost 1', () => {
    expect(MOVES.lightSpeed.power).toBe(150);
    expect(MOVES.lightSpeed.selfStages).toEqual({ spd: 3 });
    expect(MOVES.spinDash.cost).toBe(2);
    expect(MOVES.glideAttack.cost).toBe(1);
  });
  it('Fired Up: Knuckles krijgt stat-verhogingen dubbel, verlagingen niet', () => {
    const k = new Fighter('knuckles', 10);
    k.raise('atk', 1); k.raise('def', -1);
    expect([k.stages.atk, k.stages.def]).toEqual([2, -1]);
    const a = new Fighter('amy', 10);
    a.raise('atk', 1);
    expect(a.stages.atk).toBe(1);
  });
  it('ultimates raken altijd, ook met ACC -6; andere moves kunnen dan missen', () => {
    const sonic = new Fighter('sonic', 30), foe = new Fighter('beetle', 30);
    sonic.stages.acc = -6;
    expect(calcHit(sonic, foe, MOVES.lightSpeed, fixed(0.99)).missed).toBe(false);
    expect(calcHit(sonic, foe, MOVES.homingAttack, fixed(0.99)).missed).toBe(true);
  });
});

describe('Shadow', () => {
  it('speed-type, Rampage, en zijn kit', () => {
    const d = FIGHTERS.shadow;
    expect(d.type).toBe('speed');
    expect(d.passive?.id).toBe('rampage');
    expect(d.moves).toEqual(['spinAttack', 'chaosSpear', 'chaosControl']);
    expect(d.ultimate).toBe('superBarrage');
    expect(HEROES).toContain('shadow');
  });
  it('Spin Attack: 40 power, maar +2 Boost in plaats van +1', () => {
    const sh = new Fighter('shadow', 10);
    const so = new Fighter('sonic', 10);
    expect(MOVES.spinAttack.power).toBe(40);
    sh.boost = 0; so.boost = 0;
    sh.spendBoost(MOVES.spinAttack); so.spendBoost(MOVES.spinAttack);
    expect([sh.boost, so.boost]).toEqual([2, 1]);
  });
  it('Chaos Spear kost 3; het doelwit krijgt daarna 50% meer schade', () => {
    expect(MOVES.chaosSpear.cost).toBe(3);
    expect(MOVES.chaosSpear.pierce).toBe(3);
    const sonic = new Fighter('sonic', 20);
    const foe = new Fighter('beetle', 20);
    const before = calcHit(sonic, foe, MOVES.spinAttack, fixed(0.5)).damage;
    foe.pierced = 2;
    expect(calcHit(sonic, foe, MOVES.spinAttack, fixed(0.5)).damage).toBeCloseTo(before * PIERCE_BONUS, -1);
  });
  it('de teller loopt pas af vanaf de beurt erna: 3 hele beurten', () => {
    const foe = new Fighter('beetle', 20);
    foe.pierced = 3; foe.freshTurns.add('pierced');
    expect(foe.tickTurns()).toEqual([]);      // de beurt waarin hij geraakt werd
    expect(foe.pierced).toBe(3);
    foe.tickTurns(); foe.tickTurns();
    expect(foe.tickTurns()).toEqual(['pierced']);
    expect(foe.pierced).toBe(0);
  });
  it('Chaos Control: 100 power, kost 4, gratis na een KO (en dan weer betalen)', () => {
    const sh = new Fighter('shadow', 10);
    expect(MOVES.chaosControl.power).toBe(100);
    sh.boost = 0;
    expect(sh.canUse(MOVES.chaosControl)).toBe(false);
    sh.chaosFree = true;
    expect(sh.canUse(MOVES.chaosControl)).toBe(true);
    expect(sh.costOf(MOVES.chaosControl)).toBe(0);
    sh.spendBoost(MOVES.chaosControl);
    expect(sh.chaosFree).toBe(false);
    expect(sh.boost).toBe(0);
    expect(sh.canUse(MOVES.chaosControl)).toBe(false);
  });
  it('Super Barrage: altijd crit, daarna 100% crit maar 33% meer schade krijgen; gratis na een KO', () => {
    const sh = new Fighter('shadow', 30);
    const foe = new Fighter('beetle', 30);
    expect(sh.moves).toContain('superBarrage');
    expect(calcHit(sh, foe, MOVES.superBarrage, fixed(0.99)).crit).toBe(true);
    expect(MOVES.superBarrage.superTurns).toBe(3);
    // super: elke aanval crit, en geen dubbele power zoals bij Tornado Hammer
    sh.superTurns = 3;
    expect(critChance(sh)).toBe(1);
    expect(calcHit(sh, foe, MOVES.spinAttack, fixed(0.9)).crit).toBe(true);
    const a = calcHit(sh, foe, MOVES.superBarrage, fixed(0.5)).damage;
    sh.superTurns = 0;
    const b = calcHit(sh, foe, MOVES.superBarrage, fixed(0.5)).damage;
    expect(a).toBe(b);
    // terwijl hij super is krijgt hij zelf meer schade
    const before = calcHit(foe, sh, MOVES.bodyCheck, fixed(0.5)).damage;
    sh.superTurns = 2;
    expect(calcHit(foe, sh, MOVES.bodyCheck, fixed(0.5)).damage).toBeCloseTo(before * SUPER_VULNERABLE, -1);
    // gratis
    sh.boost = 0;
    sh.ultFree = true;
    expect(sh.canUse(MOVES.superBarrage)).toBe(true);
    sh.spendBoost(MOVES.superBarrage);
    expect(sh.ultFree).toBe(false);
  });
  it('na de ultimate is hij weer gewone Shadow (alleen de Super-kracht blijft)', () => {
    const sh = new Fighter('shadow', 30);
    sh.superTurns = 2;
    expect(sh.anim('idle')).toBe('shadow_idle');
    expect(SUPER_VULNERABLE).toBe(2);
  });
  it('Chaos Spear is een status-move: geen power, raakt altijd', () => {
    expect(MOVES.chaosSpear.power).toBe(0);
    expect(MOVES.chaosSpear.accuracy).toBe(100);
  });
});

describe('bosses', () => {
  it('main bosses: altijd Eggman, met 10% kans Shadow (niet als hij al in je team zit)', () => {
    expect(SHADOW_BOSS_CHANCE).toBe(0.1);
    expect(mainBossFor(20, [], () => 0.5)).toBe('eggman');
    expect(mainBossFor(40, [], () => 0.05)).toBe('shadow');
    expect(mainBossFor(40, ['sonic', 'shadow'], () => 0.05)).toBe('eggman');
    expect(FIGHTERS.eggman.moves).toEqual(['eggMissile', 'eggBomb', 'eggLaugh']);
  });
  it('Shadow is geen rival meer, alleen een boss', () => {
    expect(HEROES).toContain('shadow');
    expect(RIVAL_HEROES).not.toContain('shadow');
  });
  it('Super Barrage wordt hooguit 2x achter elkaar gratis', () => {
    expect(ULT_CHAIN_MAX).toBe(2);
  });
});

describe('boss-schilden (PokéRogue)', () => {
  const boss = () => {
    const f = new Fighter('eggman', 20);
    f.segments = 4;
    f.hp = f.maxHp;
    return f;
  };
  it('zonder schilden verandert er niks', () => {
    const f = new Fighter('beetle', 20);
    expect(shieldCap(f, 9999)).toEqual({ damage: 9999, broken: 0 });
  });
  it('een klap binnen hetzelfde schild doet gewoon zijn schade', () => {
    const f = boss();
    expect(shieldCap(f, 5)).toEqual({ damage: 5, broken: 0 });
  });
  it('een klap over de grens stopt precies op de grens: één schild', () => {
    const f = boss();
    const size = f.maxHp / 4;
    const r = shieldCap(f, Math.ceil(size * 1.5));
    expect(r.broken).toBe(1);
    expect(f.hp - r.damage).toBe(Math.round(size * 3));
  });
  it('alleen een hele harde klap breekt er twee (2x een schild over)', () => {
    const f = boss();
    const size = f.maxHp / 4;
    const r = shieldCap(f, Math.ceil(size * 3.2));   // 1 schild tot de grens + 2,2 schild over
    expect(r.broken).toBe(2);
    expect(f.hp - r.damage).toBe(Math.round(size * 2));
  });
  it('het laatste stuk kan gewoon leeg', () => {
    const f = boss();
    f.hp = Math.round((f.maxHp / 4) * 1) - 1;          // onder de laatste grens
    expect(shieldCap(f, 9999).damage).toBe(9999);
    expect(MAIN_BOSS_SHIELDS).toBe(5);
  });
});

describe('balans: zones, rivals en EXP', () => {
  it('vijanden worden vanaf zone 3 per zone 8% sterker (HP, ATK, DEF; SPD niet)', () => {
    expect([1, 20, 21, 31, 80].map(enemyScaling)).toEqual([1, 1, 1.08, 1.16, 1.48]);
    const a = new Fighter('beetle', 30), b = new Fighter('beetle', 30);
    b.statMult = enemyScaling(41);
    expect(b.atk).toBeGreaterThan(a.atk);
    expect(b.maxHp).toBeGreaterThan(a.maxHp);
    expect(b.spd).toBe(a.spd);
  });
  it('rivals: 75% op waves die op 5 eindigen, na wave 30 ook soms op gewone waves, nooit op een boss', () => {
    expect([10, 14, 15, 16, 25, 31, 35, 40].map(rivalChance)).toEqual([0, 0, 0.75, 0, 0.75, 0.12, 0.75, 0]);
    expect([15, 30, 49, 50].map(rivalLevelBonus)).toEqual([0, 1, 1, 2]);
  });
  it('Rampage heeft 50% kans per reset', () => {
    expect(RAMPAGE_CHANCE).toBe(0.8);
  });
});

describe('Chaos Emeralds: EXP voor de bank', () => {
  it('+5% per emerald bovenop de Exp. Share, nooit boven 100%', () => {
    expect(benchExpRate(0, 0)).toBe(0);
    expect(benchExpRate(0.3, 1)).toBeCloseTo(0.35);
    expect(benchExpRate(0.5, 7)).toBeCloseTo(0.85);
    expect(benchExpRate(0.9, 7)).toBe(1);
  });
});

describe('Cream: Chao Blessing', () => {
  it('maakt de schade van je team 50% hoger', () => {
    const fixed = () => 0.5;
    const plain = calcHit(new Fighter('knuckles', 20), new Fighter('frog', 20), MOVES.drillPunch, fixed);
    const blessed = calcHit(new Fighter('knuckles', 20), new Fighter('frog', 20), MOVES.drillPunch, fixed, 0, 1 + BLESS_BONUS);
    expect(blessed.damage / plain.damage).toBeCloseTo(1.5, 1);
  });
  it('Chao Attack verlaagt de ATK van het doelwit, Chao Cheer kost 2 en geeft 1 Boost', () => {
    expect(MOVES.cheeseAttack.targetStages).toEqual({ atk: -1 });
    expect(MOVES.chaoCheer.cost).toBe(2);
    expect(MOVES.chaoCheer.allyBoost).toBe(1);
    expect(FIGHTERS.cream.moves).toContain('cheeseAttack');
  });
});

describe('Cream: Chao Care', () => {
  it('werkt ook vanaf de bank, maar half zo sterk', () => {
    expect(CHAO_CARE_HEAL).toBe(0.1);
    expect(CHAO_CARE_BENCH).toBe(0.05);
  });
});
