import { describe, expect, it } from 'vitest';
import {
  Fighter, MAX_BOOST, MAX_STAGE, MOVES, START_BOOST, ULTIMATE_LEVEL,
  calcHit, stageMultiplier, typeMultiplier, TYPE_STRONG, TYPE_WEAK, speedPower, movePower,
  speedBonus, critChance, BASE_CRIT, stagesPower, STAGES_POWER_MAX, WEAK_SPOT_BONUS, FIGHTERS,
  PIERCE_BONUS, SUPER_VULNERABLE, HEROES, RIVAL_HEROES, ULT_CHAIN_MAX, LIFEFORM_KO_BOOST, dodgeChance, DODGE_CAP, DODGE_PER_RATIO, shieldCap, benchExpRate, BLESS_BONUS, CHAO_CARE_HEAL, chaoCareBench, isGuardian, GUARDIAN_SURVIVE_CHANCE, critMult, luckyExtraChance, luckyInfo, applyRival, RIVAL_SHIELDS, RIVAL_TRAITS, rivalOptions, ironWill, chaoRevival,
  shellHit, traitMove, chargeMult, CHARGE_MULT, spikeRecoil, poisonDamage, applyElite, regenTick, ELITE_REGEN_TOTAL, ELITE_IDS, PIGGY_MAX_DEF,
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

  it('Sonic Speed: +25% per keer zo snel, max +50%', () => {
    const sonic = new Fighter('sonic', 20), slow = new Fighter('turtle', 20);
    expect(speedBonus(sonic, sonic)).toBe(1);
    expect(speedBonus(sonic, slow)).toBeCloseTo(Math.min(1.5, 1 + 0.25 * (sonic.spd / slow.spd - 1)));
    for (let i = 0; i < 6; i++) sonic.raise('spd');
    expect(speedBonus(sonic, slow)).toBe(1.5);
    expect(speedBonus(new Fighter('tails', 20), slow)).toBe(1);   // alleen Sonic
  });

  it('Lucky Swing: +1 meer crit-kans, +2 altijd crit, +4 crits 2x, +6 kans op nog een aanval', () => {
    const amy = new Fighter('amy', 10);
    expect(critChance(amy)).toBe(BASE_CRIT);
    amy.raise('atk');
    expect(critChance(amy)).toBeCloseTo(BASE_CRIT + 0.33);
    amy.raise('atk');
    expect(critChance(amy)).toBe(1);
    expect(critMult(amy)).toBe(1.5);
    expect(luckyExtraChance(amy, MOVES.hammerSmash)).toBe(0);
    amy.raise('atk'); amy.raise('atk');
    expect(critMult(amy)).toBe(2);
    expect(luckyExtraChance(amy, MOVES.hammerSmash)).toBe(0);
    amy.raise('atk'); amy.raise('atk');
    expect(luckyExtraChance(amy, MOVES.hammerSmash)).toBe(0.3);
    expect(luckyExtraChance(amy, MOVES.tornadoHammer)).toBe(0);   // niet met haar ultimate
    expect(luckyExtraChance(new Fighter('knuckles', 10), MOVES.spinAttack)).toBe(0);
  });

  it('Lucky Swing-tabje: niks op +0, daarna crit-kans, 2x en de extra klap, met de volgende trede', () => {
    const amy = new Fighter('amy', 10);
    expect(luckyInfo(amy)).toBeNull();
    amy.raise('atk');
    expect(luckyInfo(amy)).toMatchObject({ atk: 1, mult: 1.5, extra: 0, next: { at: 2 } });
    amy.raise('atk'); amy.raise('atk'); amy.raise('atk');
    expect(luckyInfo(amy)).toMatchObject({ atk: 4, crit: 1, mult: 2, extra: 0, next: { at: 6 } });
    amy.raise('atk'); amy.raise('atk');
    expect(luckyInfo(amy)).toMatchObject({ atk: 6, extra: 0.3, next: null });
    expect(luckyInfo(new Fighter('sonic', 10))).toBeNull();
    const sonic = new Fighter('sonic', 10); for (let i = 0; i < 6; i++) sonic.raise('atk');
    expect(critChance(sonic)).toBe(BASE_CRIT);
    expect(critMult(sonic)).toBe(1.5);
  });

  it('een crit negeert een type-nadeel, maar een type-voordeel blijft', () => {
    const always = () => 0;   // raakt en crit altijd
    const knux = new Fighter('knuckles', 20);
    // zoek een doelwit waar knuckles slecht tegen is en een waar hij goed tegen is
    const weak = HEROES.map(id => new Fighter(id, 20)).find(t => typeMultiplier(knux.type, t.type) < 1)!;
    const strong = HEROES.map(id => new Fighter(id, 20)).find(t => typeMultiplier(knux.type, t.type) > 1)!;
    expect(calcHit(knux, weak, MOVES.spinAttack, always).effect).toBe(1);
    expect(calcHit(knux, weak, MOVES.spinAttack, () => 0.5).effect).toBeLessThan(1);   // geen crit: wel nadeel
    expect(calcHit(knux, strong, MOVES.spinAttack, always).effect).toBeGreaterThan(1);
  });

  it('elke passive hoort bij het juiste character', () => {
    expect(new Fighter('sonic', 5).def.passive?.id).toBe('speedster');
    expect(new Fighter('knuckles', 5).def.passive?.id).toBe('guardian');
    expect(new Fighter('amy', 5).def.passive?.id).toBe('luckySwing');
  });
});

describe('nieuwe moves en ultimates', () => {
  it('Glide Attack: ATK +1, DEF -1; Piko Hammer: ATK +1', () => {
    expect(MOVES.glideAttack.selfStages).toEqual({ atk: 1, def: -1 });
    expect(MOVES.hammerSmash.selfStages).toEqual({ atk: 1 });
  });
  it('Glove Punch kost 3 en verdooft 2 beurten, één keer per gevecht; Thunder Shoot 3 beurten', () => {
    expect(MOVES.glovePunch.cost).toBe(3);
    expect(MOVES.glovePunch.stun).toEqual([2, 2]);
    expect(MOVES.glovePunch.stunOnce).toBe(true);   // een boss elke keer opnieuw verdoven was te sterk
    expect(MOVES.thunderShoot.stun).toEqual([3, 3]);
  });
  it('Knuckle Punch gaat eerst; Maximum Heat laadt op en de duik maakt zijn ATK op', () => {
    expect(MOVES.drillPunch.priority).toBeGreaterThan(0);
    expect(MOVES.maximumHeat.windup).toBe('heatDive');
    expect(MOVES.heatDive.spendAtk).toBe(true);
    expect(MOVES.heatDive.sure).toBe(true);
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
      .toEqual(['speedster', 'weakSpot', 'guardian', 'luckySwing', 'chaoCare', 'lifeform']);
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
  it('Fired Up: rival-Knuckles (oude set) krijgt stat-verhogingen dubbel, verlagingen niet', () => {
    const k = new Fighter('knuckles', 10);
    applyRival(k);
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
  it('speed-type, Ultimate Lifeform, en zijn kit', () => {
    const d = FIGHTERS.shadow;
    expect(d.type).toBe('speed');
    expect(d.passive?.id).toBe('lifeform');
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
  it('Chaos Spear kost 2; het doelwit krijgt daarna 50% meer schade', () => {
    expect(MOVES.chaosSpear.cost).toBe(2);
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
  it('Chaos Spear doet ook schade (50 power) en raakt altijd; Chaos Control geeft ATK en SPD +1', () => {
    expect(MOVES.chaosSpear.power).toBe(50);
    expect(MOVES.chaosSpear.accuracy).toBe(100);
    expect(MOVES.chaosControl.selfStages).toEqual({ atk: 1, spd: 1 });
  });
  it('Ultimate Lifeform: geen zone-effecten en geen stat-verlagingen', () => {
    const sh = new Fighter('shadow', 20);
    sh.field.spd = -1;
    expect(sh.stage('spd')).toBe(0);
    sh.raise('atk', -1);
    expect(sh.stages.atk).toBe(0);
    sh.raise('atk', 1);
    expect(sh.stages.atk).toBe(1);
    const so = new Fighter('sonic', 20);
    so.field.spd = -1;
    expect(so.stage('spd')).toBe(-1);
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
  it('rivals: 75% op waves die op 5 eindigen, nooit op gewone waves of een boss, op jouw level', () => {
    expect([10, 14, 15, 16, 25, 31, 35, 40].map(rivalChance)).toEqual([0, 0, 0.75, 0, 0.75, 0, 0.75, 0]);
    expect([15, 30, 49, 50].map(rivalLevelBonus)).toEqual([0, 0, 0, 0]);
  });
  it('Ultimate Lifeform geeft 1 Boost per KO', () => {
    expect(LIFEFORM_KO_BOOST).toBe(1);
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

describe('Knuckles: Guardian', () => {
  it('speler-Knuckles heeft Guard en Guardian; als rival houdt hij zijn oude set', () => {
    const k = new Fighter('knuckles', 10);
    expect(k.def.moves).toEqual(['spinAttack', 'guard', 'drillPunch']);
    expect(isGuardian(k)).toBe(true);
    const r = new Fighter('knuckles', 10);
    applyRival(r);
    expect(r.def.moves).toContain('glideAttack');
    expect(r.def.passive?.id).toBe('flinch');
    expect(FIGHTERS.knuckles.passive?.id).toBe('guardian');   // de rival verandert de speler-versie niet
  });
  it('Guard kan niet twee keer achter elkaar; de counter is zwak, na Guard sterk', () => {
    const k = new Fighter('knuckles', 10);
    k.boost = 6;
    expect(k.canUse(MOVES.guard)).toBe(true);
    k.lastMove = 'guard';
    expect(k.canUse(MOVES.guard)).toBe(false);
    expect(MOVES.counterPunch.power).toBeLessThan(MOVES.guardCounter.power);
    expect(GUARDIAN_SURVIVE_CHANCE).toBe(0.5);
  });
  it('Maximum Heat-duik: +25 power per ATK-stage', () => {
    const k = new Fighter('knuckles', 10);
    expect(movePower(MOVES.heatDive, k)).toBe(100);
    k.raise('atk', 4);
    expect(movePower(MOVES.heatDive, k)).toBe(200);
  });
});

describe('Cream: Chao Care', () => {
  it('5% in het veld, vanaf de bank willekeurig 1% tot 5%', () => {
    expect(CHAO_CARE_HEAL).toBe(0.05);
    expect(chaoCareBench(() => 0)).toBe(0.01);
    expect(chaoCareBench(() => 0.999)).toBe(0.05);
    expect(chaoCareBench(() => 0.5)).toBe(0.03);
  });
});

describe('nieuwe kits (balance-ronde 2)', () => {
  it('Sonic Speed: ontwijken loopt op met hoe snel hij is, max 35%', () => {
    const sonic = new Fighter('sonic', 20), foe = new Fighter('frog', 20);
    expect(dodgeChance(new Fighter('tails', 20), foe)).toBe(0);    // alleen Sonic
    const ratio = sonic.spd / foe.spd;
    expect(dodgeChance(sonic, foe)).toBeCloseTo(Math.min(DODGE_CAP, DODGE_PER_RATIO * (ratio - 1)));
    sonic.stages.spd = 6;
    expect(dodgeChance(sonic, foe)).toBe(DODGE_CAP);
    const fast = new Fighter('sonic', 5); fast.stages.spd = -6;
    expect(dodgeChance(fast, new Fighter('sharkjet', 30))).toBe(0);  // trager: nooit
  });
  it('Homing Attack: 40-80 op snelheid, SPD +1, 50% kans op een tweede klap; Copter Dive verlengt een stun', () => {
    const sonic = new Fighter('sonic', 20);
    expect(movePower(MOVES.homingAttack, sonic, new Fighter('sonic', 20))).toBe(50);     // even snel
    expect(movePower(MOVES.homingAttack, sonic, new Fighter('turtle', 20))).toBe(70);    // 3x zo snel
    expect(speedPower(10, 20, MOVES.homingAttack.speedTable)).toBe(40);
    expect(speedPower(99, 20, MOVES.homingAttack.speedTable)).toBe(80);
    expect(MOVES.homingAttack.selfStages).toEqual({ spd: 1 });
    expect(MOVES.homingAttack.extraHit).toBe(0.5);
    expect(MOVES.homingAttack.refundOnKo).toBeUndefined();
    expect(MOVES.copterDive.extendStun).toBe(1);
  });
  it('Amy: meer HP en DEF', () => {
    expect(FIGHTERS.amy.base).toMatchObject({ hp: 25, def: 8 });
    expect(FIGHTERS.amy.growth).toMatchObject({ hp: 3.3, def: 1.3 });
  });
});

describe('badnik-eigenschappen (enemy-variatie)', () => {
  it('elke badnik is anders: een eigenschap of een move met een bijeffect', () => {
    const badniks = ['beetle', 'sharkjet', 'octo', 'frog', 'bee', 'snowman', 'pig', 'soldier', 'penguin', 'mine', 'turtle'];
    for (const id of badniks) {
      const d = FIGHTERS[id];
      const special = d.trait || d.moves.some(m => MOVES[m].tag);
      expect(special, id).toBeTruthy();
    }
  });

  it('Hard Shell: alleen de eerste klap gaat voor de helft door', () => {
    const b = new Fighter('beetle', 10);
    expect(b.shell).toBe(true);
    expect(shellHit(b, 41)).toEqual({ damage: 21, cracked: true });
    expect(shellHit(b, 41)).toEqual({ damage: 41, cracked: false });
    expect(new Fighter('frog', 10).shell).toBe(false);
  });

  it('Charge: Copter Octo laadt op beurt 2, 5, 8 op en nooit twee keer achter elkaar', () => {
    const o = new Fighter('octo', 10);
    const normal = () => MOVES.bodyCheck;
    const picks: string[] = [];
    for (let t = 1; t <= 8; t++) {
      const m = traitMove(o, normal);
      picks.push(m.id);
      if (m.charge) o.charged = true; else o.charged = false;
    }
    expect(picks).toEqual(['bodyCheck', 'chargeUp', 'bodyCheck', 'bodyCheck', 'chargeUp', 'bodyCheck', 'bodyCheck', 'chargeUp']);
    // al opgeladen (bijv. omdat hij verdoofd was): dan eerst gewoon aanvallen
    const o2 = new Fighter('octo', 10); o2.foeTurns = 1; o2.charged = true;
    expect(traitMove(o2, normal).id).toBe('bodyCheck');
    expect(chargeMult(o)).toBe(CHARGE_MULT);
  });

  it('Shell Up: na het opladen slaat Shell Tank met Tank Slam (x1,5)', () => {
    const t = new Fighter('turtle', 20);
    t.charged = true;
    expect(traitMove(t, () => MOVES.shellCannon).id).toBe('tankSlam');
    expect(chargeMult(t)).toBe(1.5);
  });

  it('Spikes: 1/8 van je schade terug, maar nooit KO', () => {
    const mine = new Fighter('mine', 10), sonic = new Fighter('sonic', 10);
    expect(spikeRecoil(mine, sonic, 80)).toBe(10);
    expect(spikeRecoil(mine, sonic, 3)).toBe(1);
    sonic.hp = 1;
    expect(spikeRecoil(mine, sonic, 80)).toBe(0);
    expect(spikeRecoil(new Fighter('frog', 10), new Fighter('sonic', 10), 80)).toBe(0);
  });

  it('gif doet 1/16 van je max-HP', () => {
    const s = new Fighter('knuckles', 20);
    expect(poisonDamage(s)).toBe(Math.floor(s.maxHp / 16));
    expect(MOVES.stingShot.poison).toBe(3);
  });

  it('elites: Armored 2 schilden, Swift SPD +2, Regenerating max de helft van zijn HP', () => {
    const a = new Fighter('pig', 15); applyElite(a, 'armored');
    expect(a.segments).toBe(2);
    const s = new Fighter('pig', 15); applyElite(s, 'swift');
    expect(s.stage('spd')).toBe(2);
    const r = new Fighter('pig', 15); applyElite(r, 'regen');
    r.hp = 1;
    let healed = 0;
    for (let i = 0; i < 20; i++) healed += regenTick(r);
    expect(healed).toBe(Math.floor(r.maxHp * ELITE_REGEN_TOTAL));
    expect(regenTick(new Fighter('pig', 15))).toBe(0);
    expect(ELITE_IDS).toHaveLength(4);
  });

  it('Shark Jet steelt Boost, Top Hat Pengu gaat altijd eerst', () => {
    expect(MOVES[FIGHTERS.sharkjet.moves[0]].drainBoost).toBe(1);
    expect(MOVES[FIGHTERS.penguin.moves[0]].priority).toBe(1);
    expect(FIGHTERS.pig.trait).toBe('piggyBank');
    expect(PIGGY_MAX_DEF).toBe(4);
  });
});

describe('Spin Dash negeert DEF-boosts', () => {
  it('een vijand met DEF +6 krijgt even veel schade als zonder, DEF-verlagingen tellen wel', () => {
    const rng = () => 0.5;
    const sonic = new Fighter('sonic', 20);
    const plain = new Fighter('pig', 20), boosted = new Fighter('pig', 20), lowered = new Fighter('pig', 20);
    for (let i = 0; i < 6; i++) boosted.raise('def');
    lowered.raise('def', -2);
    const dmg = (t: Fighter, m = MOVES.spinDash) => calcHit(sonic, t, { ...m, accuracy: 1000 }, rng).damage;
    expect(dmg(boosted)).toBe(dmg(plain));
    expect(dmg(lowered)).toBeGreaterThan(dmg(plain));
    // een gewone move merkt de DEF-boost wel
    expect(dmg(boosted, MOVES.spinAttack)).toBeLessThan(dmg(plain, MOVES.spinAttack));
  });
});

describe('rivals', () => {
  it('2 schilden en een eigen truc per character', () => {
    for (const id of ['sonic', 'tails', 'knuckles', 'cream', 'amy']) {
      const r = new Fighter(id, 20);
      applyRival(r);
      expect(r.segments, id).toBe(RIVAL_SHIELDS);
      expect(r.rivalTrait, id).toBe(RIVAL_TRAITS[id].id);
    }
    const amy = new Fighter('amy', 20); applyRival(amy);
    expect(amy.stage('atk')).toBe(1);
  });

  it('nooit twee keer achter elkaar dezelfde rival', () => {
    const others = ['tails', 'knuckles', 'cream'];
    expect(rivalOptions(others, ['tails', 'knuckles', 'cream'], () => false)).not.toContain('cream');
    expect(rivalOptions(others, ['knuckles'], () => false)).toEqual(['tails', 'cream']);
    expect(rivalOptions(['tails'], ['tails'], () => false)).toEqual(['tails']);   // geen keus
    expect(rivalOptions(others, [], id => id === 'cream')).toEqual(['cream']);    // op slot gaat voor
  });

  it('Iron Will: één keer op 1 HP, ook als hij bijna leeg was; daarna niet meer', () => {
    const k = new Fighter('knuckles', 20); applyRival(k);
    k.hp = 0;
    expect(ironWill(k)).toBe(true);
    expect(k.hp).toBe(1);
    k.hp = 0;
    expect(ironWill(k)).toBe(false);
    expect(k.sashUsed).toBe(true);   // geen extra Iron Fists
  });

  it('Chao Revival: één keer terug met de helft van haar HP', () => {
    const c = new Fighter('cream', 20); applyRival(c);
    c.hp = 0;
    expect(chaoRevival(c)).toBe(true);
    expect(c.hp).toBe(Math.ceil(c.maxHp / 2));
    c.hp = 0;
    expect(chaoRevival(c)).toBe(false);
    const normal = new Fighter('cream', 20); normal.hp = 0;
    expect(chaoRevival(normal)).toBe(false);   // alleen als rival
  });
});
