import { describe, expect, it } from 'vitest';
import { Fighter, MAX_BOOST, MOVES, MOVE_CHIP_POWER, movePower } from '../src/data/fighters';
import { REWARDS, TIERS, TIER_ODDS, emptyBuffs, levelUp, rollRewards, rollTier, type RewardCtx } from '../src/data/rewards';
import { rewardRings } from '../src/data/items';

function ctx(over: Partial<RewardCtx> = {}): RewardCtx {
  const party = [new Fighter('sonic', 10), new Fighter('tails', 10), new Fighter('amy', 10)];
  let rings = 0;
  return { player: party[0], party, wave: 10, buffs: emptyBuffs(), nextIsBoss: false, gainRings: n => { rings += n; void rings; }, ...over };
}
const R = (id: string) => REWARDS.find(r => r.id === id)!;

describe('reward-tiers', () => {
  it('de kansen tellen op tot 100%', () => {
    expect(TIERS.reduce((n, t) => n + TIER_ODDS[t], 0)).toBeCloseTo(1, 5);
  });
  it('rollTier volgt de kansen (en de minimale tier)', () => {
    expect(rollTier(() => 0)).toBe('common');
    expect(rollTier(() => 0.999)).toBe('ultraRare');
    expect(rollTier(() => 0, 'uncommon')).toBe('uncommon');
  });
  it('geen 100%-heal meer; de 50%-heal is rare', () => {
    expect(REWARDS.some(r => /100%/.test(r.desc(ctx())))).toBe(false);
    expect(R('heal50').tier).toBe('rare');
    expect(R('heal20').tier).toBe('uncommon');
  });
  it('3 verschillende rewards, altijd gevuld', () => {
    for (let i = 0; i < 200; i++) {
      const out = rollRewards(ctx());
      expect(out).toHaveLength(3);
      expect(new Set(out).size).toBe(3);
    }
  });
  it('na een Eggman Alarm: alles minstens uncommon', () => {
    for (let i = 0; i < 200; i++) expect(rollRewards(ctx(), 3, Math.random, 'uncommon').every(r => r.tier !== 'common')).toBe(true);
  });
});

describe('rewards', () => {
  it('Boost: Speed Shoes +1, Super Boost +2, niet als de meter vol is', () => {
    const c = ctx(); c.player.boost = 2;
    R('boost').apply(c); expect(c.player.boost).toBe(3);
    R('boost2').apply(c); expect(c.player.boost).toBe(5);
    c.player.boost = MAX_BOOST;
    expect(R('boost').available!(c)).toBe(false);
  });
  it('heals verschijnen niet als je volle HP hebt', () => {
    expect(R('heal20').available!(ctx())).toBe(false);
  });
  it('buffs stapelen niet', () => {
    const c = ctx();
    R('shield').apply(c); expect(R('shield').available!(c)).toBe(false);
    R('magnet').apply(c); expect(c.buffs.magnetWaves).toBe(3); expect(R('magnet').available!(c)).toBe(false);
    R('invincible2').apply(c); expect(R('invincible').available!(c)).toBe(false);
  });
  it('Eggman Monitor: veel rings, team -50% HP maar niemand gaat KO', () => {
    let got = 0;
    const c = ctx({ gainRings: n => { got += n; } });
    c.party[1].hp = 3;
    R('eggman').apply(c);
    expect(got).toBe(rewardRings(10, 4));
    expect(c.party[0].hp).toBe(c.party[0].maxHp - Math.ceil(c.party[0].maxHp / 2));
    expect(c.party[1].hp).toBe(1);
  });
  it('Eggman Alarm komt niet voor een boss-wave', () => {
    expect(R('alarm').available!(ctx({ nextIsBoss: true }))).toBe(false);
  });
  it('Chaos Drive: +1 level voor wie je kiest; Emerald Shard: hele team', () => {
    const c = ctx();
    R('chaosDrive').apply(c, c.party[1]);
    expect(c.party.map(f => f.level)).toEqual([10, 11, 10]);
    R('shard').apply(c);
    expect(c.party.map(f => f.level)).toEqual([11, 12, 11]);
  });
  it('levelUp geeft de extra max-HP er ook bij als HP', () => {
    const f = new Fighter('knuckles', 10);
    const gap = f.maxHp - f.hp;
    levelUp(f);
    expect(f.maxHp - f.hp).toBe(gap);
  });
  it('Move Chip: Spin Attack +30, niet meer aangeboden als iedereen hem heeft', () => {
    const c = ctx();
    R('moveChip').apply(c, c.party[0]);
    expect(movePower(MOVES.spinAttack, c.party[0])).toBe(MOVES.spinAttack.power + MOVE_CHIP_POWER);
    expect(R('moveChip').canTarget!(c.party[0])).toBe(false);
    c.party.forEach(f => { f.spinChip = true; });
    expect(R('moveChip').available!(c)).toBe(false);
  });
});
