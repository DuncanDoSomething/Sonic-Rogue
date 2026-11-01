// ---------------------------------------------------------------------------
// Rewards na elke wave: 3 monitors, elk met een zeldzaamheid (zoals in PokéRogue).
// Healen zit vooral in de shop (en kost rings); rewards zijn voor kracht, geld en tijdelijke buffs.
// ---------------------------------------------------------------------------
import { Fighter, MAX_BOOST, MOVE_CHIP_POWER } from './fighters';
import { rewardRings } from './items';

export type Tier = 'common' | 'uncommon' | 'rare' | 'superRare' | 'ultraRare';
export const TIERS: Tier[] = ['common', 'uncommon', 'rare', 'superRare', 'ultraRare'];
/** Kans per monitor. PokéRogue: 75 / 19 / 4.7 / 1.2 / 0.1; onze runs zijn korter, dus iets royaler. */
export const TIER_ODDS: Record<Tier, number> = { common: 0.65, uncommon: 0.23, rare: 0.09, superRare: 0.025, ultraRare: 0.005 };
export const TIER_NAME: Record<Tier, string> = { common: 'COMMON', uncommon: 'UNCOMMON', rare: 'RARE', superRare: 'SUPER RARE', ultraRare: 'ULTRA RARE' };
export const TIER_COLOR: Record<Tier, number> = { common: 0x9aa4c4, uncommon: 0x4ade5a, rare: 0x4aa8ff, superRare: 0xc06aff, ultraRare: 0xf2c230 };

/** Tijdelijke effecten van rewards. Geen van allen stapelt: zolang er een actief is, wordt hij niet aangeboden. */
export interface RunBuffs {
  /** Shield: de volgende klap op je team doet de helft */
  shieldHit: boolean;
  /** Shield+: aantal waves (vanaf de volgende) waarin alle schade gehalveerd is */
  shieldWaves: number;
  /** Invincibility: de eerste aanval in de volgende wave mist */
  dodgeNext: boolean;
  /** Invincibility+: in zoveel waves mist de eerste aanval */
  dodgeWaves: number;
  /** Magnet Shield: +50% rings uit zoveel waves */
  magnetWaves: number;
  /** Amy's Hammer: +20% crit-kans voor zoveel beurten */
  critTurns: number;
  /** Eggman Alarm: de volgende vijand is een elite, en daarna krijg je minstens uncommon rewards */
  eliteNext: boolean;
}
export const emptyBuffs = (): RunBuffs => ({
  shieldHit: false, shieldWaves: 0, dodgeNext: false, dodgeWaves: 0, magnetWaves: 0, critTurns: 0, eliteNext: false,
});
export const HAMMER_CRIT = 0.2;
export const MAGNET_BONUS = 0.5;
export const SHIELD_FACTOR = 0.5;

export interface RewardCtx {
  player: Fighter;
  party: Fighter[];
  wave: number;
  buffs: RunBuffs;
  /** volgende wave is een boss (dan geen Eggman Alarm) */
  nextIsBoss: boolean;
  gainRings: (n: number) => void;
}

export interface RewardDef {
  id: string;
  name: string;
  tier: Tier;
  desc: (c: RewardCtx) => string;
  /** frame in de ui-atlas of een losse afbeelding (mon_*, chaosdrive, ...); '{hero}' = id van je character */
  icon: string;
  /** '+' op het icoon (de sterkere versie van een monitor) */
  plus?: boolean;
  /** false = niet aanbieden (al actief, niemand heeft het nodig, ...) */
  available?: (c: RewardCtx) => boolean;
  /** 'pick' = je kiest een teamgenoot; die komt dan als `target` binnen */
  target?: 'pick';
  /** wie je mag kiezen bij target 'pick' */
  canTarget?: (f: Fighter) => boolean;
  apply: (c: RewardCtx, target?: Fighter) => string;
}

function heal(f: Fighter, part: number) {
  const h = Math.min(f.maxHp - f.hp, Math.ceil(f.maxHp * part));
  f.hp += h;
  return h;
}
/** Precies één level erbij (de nieuwe max-HP komt er ook als HP bij). */
export function levelUp(f: Fighter) {
  const before = f.maxHp;
  f.level++;
  if (!f.fainted) f.hp += f.maxHp - before;
}

export const REWARDS: RewardDef[] = [
  // ---- common
  { id: 'boost', name: 'Speed Shoes', tier: 'common', icon: 'monitor_shoes', desc: () => 'Boost +1',
    available: c => c.player.boost < MAX_BOOST,
    apply: c => { c.player.gainBoost(1); return `${c.player.name}'s Boost went up!`; } },
  { id: 'rings', name: 'Ring Monitor', tier: 'common', icon: 'monitor_ring10', desc: c => `+${rewardRings(c.wave, 1)} rings`,
    apply: c => { const n = rewardRings(c.wave, 1); c.gainRings(n); return `Got ${n} rings!`; } },
  { id: 'shield', name: 'Shield', tier: 'common', icon: 'monitor_shield', desc: () => 'Next hit:\nhalf damage',
    available: c => !c.buffs.shieldHit,
    apply: c => { c.buffs.shieldHit = true; return 'A shield surrounds the team! The next hit does half damage.'; } },
  { id: 'magnet', name: 'Magnet Shield', tier: 'common', icon: 'monitor_thunder', desc: () => '+50% rings\nfor 3 waves',
    available: c => c.buffs.magnetWaves === 0,
    apply: c => { c.buffs.magnetWaves = 3; return 'Magnet Shield! +50% rings from the next 3 waves.'; } },
  // ---- uncommon
  { id: 'heal20', name: 'Ring Bundle', tier: 'uncommon', icon: 'monitor_ring5', desc: () => 'Heal 20% HP',
    available: c => c.player.hp < c.player.maxHp,
    apply: c => `${c.player.name} healed ${heal(c.player, 0.2)} HP!` },
  { id: 'boost2', name: 'Super Boost', tier: 'uncommon', icon: 'mon_sparkle', desc: () => 'Boost +2',
    available: c => c.player.boost < MAX_BOOST,
    apply: c => { c.player.gainBoost(2); return `${c.player.name}'s Boost shot up!`; } },
  { id: 'invincible', name: 'Invincibility', tier: 'uncommon', icon: 'monitor_power', desc: () => 'Dodge the\nnext attack',
    available: c => !c.buffs.dodgeNext && c.buffs.dodgeWaves === 0,
    apply: c => { c.buffs.dodgeNext = true; return 'Invincible! The first attack next wave will miss.'; } },
  { id: 'hammer', name: "Amy's Hammer", tier: 'uncommon', icon: 'mon_tornado', desc: () => '+20% crit\nfor 3 turns',
    available: c => c.buffs.critTurns === 0,
    apply: c => { c.buffs.critTurns = 3; return '+20% crit chance for your next 3 turns!'; } },
  { id: 'eggman', name: 'Eggman Monitor', tier: 'uncommon', icon: 'mon_eggman',
    desc: c => `+${rewardRings(c.wave, 4)} rings\nteam -50% HP`,
    available: c => c.party.some(f => !f.fainted && f.hp > 1),
    apply: c => {
      const n = rewardRings(c.wave, 4);
      c.gainRings(n);
      // niemand gaat er KO van: minimaal 1 HP
      c.party.filter(f => !f.fainted).forEach(f => { f.hp = Math.max(1, f.hp - Math.ceil(f.maxHp / 2)); });
      return `Eggman's trap! The team lost half their HP, but you grabbed ${n} rings.`;
    } },
  { id: 'chaosDrive', name: 'Chaos Drive', tier: 'uncommon', icon: 'chaosdrive', desc: () => '+1 level for\na teammate', target: 'pick',
    apply: (_c, t) => { levelUp(t!); return `${t!.name} grew to Lv.${t!.level}!`; } },
  // ---- rare
  { id: 'heal50', name: '1-Up', tier: 'rare', icon: 'oneup_{hero}', desc: () => 'Heal 50% HP',
    available: c => c.player.hp < c.player.maxHp,
    apply: c => `1-Up! ${c.player.name} healed ${heal(c.player, 0.5)} HP!` },
  { id: 'alarm', name: 'Eggman Alarm', tier: 'rare', icon: 'mon_alert', desc: () => 'Elite foe,\nbetter loot',
    available: c => !c.buffs.eliteNext && !c.nextIsBoss,
    apply: c => { c.buffs.eliteNext = true; return 'An elite badnik is coming! Beat it for uncommon or better rewards.'; } },
  { id: 'shard', name: 'Emerald Shard', tier: 'rare', icon: 'shard', desc: () => 'Whole team\n+1 level',
    apply: c => { c.party.forEach(levelUp); return 'A shard of the Master Emerald! The whole team grew a level.'; } },
  // ---- super rare
  { id: 'shield2', name: 'Shield', plus: true, tier: 'superRare', icon: 'monitor_shield', desc: () => 'Next wave:\nhalf damage',
    available: c => c.buffs.shieldWaves === 0,
    apply: c => { c.buffs.shieldWaves = 1; return 'Shield+! The team takes half damage next wave.'; } },
  { id: 'invincible2', name: 'Invincibility', plus: true, tier: 'superRare', icon: 'monitor_power', desc: () => 'Dodge 1st hit\nfor 3 waves',
    available: c => c.buffs.dodgeWaves === 0,
    apply: c => { c.buffs.dodgeNext = false; c.buffs.dodgeWaves = 3; return 'Invincible+! The first attack in each of the next 3 waves will miss.'; } },
  // ---- ultra rare
  { id: 'moveChip', name: 'Move Chip', tier: 'ultraRare', icon: 'movechip', desc: () => `Spin Attack\n+${MOVE_CHIP_POWER} power`, target: 'pick',
    available: c => c.party.some(f => !f.spinChip), canTarget: f => !f.spinChip,
    apply: (_c, t) => { t!.spinChip = true; return `${t!.name}'s Spin Attack got ${MOVE_CHIP_POWER} more power!`; } },
];

/** Tier trekken; `min` = minimaal deze tier (na een Eggman Alarm). */
export function rollTier(rng: () => number = Math.random, min: Tier = 'common'): Tier {
  const allowed = TIERS.slice(TIERS.indexOf(min));
  const total = allowed.reduce((n, t) => n + TIER_ODDS[t], 0);
  let r = rng() * total;
  for (const t of allowed) { r -= TIER_ODDS[t]; if (r < 0) return t; }
  return allowed[allowed.length - 1];
}

/**
 * 3 verschillende rewards. Per kaart een tier; is er in die tier niks beschikbaar, dan een tier lager
 * (en anders hoger), zodat je nooit een lege kaart krijgt.
 */
export function rollRewards(c: RewardCtx, n = 3, rng: () => number = Math.random, min: Tier = 'common'): RewardDef[] {
  const out: RewardDef[] = [];
  const free = (t: Tier) => REWARDS.filter(r => r.tier === t && !out.includes(r) && (r.available?.(c) ?? true));
  for (let i = 0; i < n; i++) {
    const t = rollTier(rng, min);
    const idx = TIERS.indexOf(t);
    const order = [...TIERS.slice(0, idx + 1).reverse(), ...TIERS.slice(idx + 1)].filter(x => TIERS.indexOf(x) >= TIERS.indexOf(min));
    const fallback = [...order, ...TIERS.filter(x => !order.includes(x))];
    for (const tier of fallback) {
      const pool = free(tier);
      if (pool.length) { out.push(pool[Math.floor(rng() * pool.length)]); break; }
    }
  }
  return out;
}
