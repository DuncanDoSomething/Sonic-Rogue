// ---------------------------------------------------------------------------
// Een "redelijk goede speler" voor de simulatie. Geen perfecte AI: hij kijkt één beurt vooruit,
// weegt schade tegen Boost-kosten af, wisselt op type-voordeel en healt op tijd.
// Een echte speler kan beter (of slechter); kijk dus vooral naar VERSCHILLEN tussen characters en
// naar wat er verandert als je een getal aanpast, niet naar de precieze waves.
// ---------------------------------------------------------------------------
import { Fighter, MAX_BOOST, MOVES, MoveDef, ULTIMATE_LEVEL, calcHit, critChance, dodgeChance, shieldCap, typeMultiplier } from '../src/data/fighters';
import { isBossWave } from '../src/data/zones';
import type { RewardDef } from '../src/data/rewards';
import type { ItemDef } from '../src/data/items';
import type { Action, Battle, Policy } from './engine';

/** rng-reeks voor calcHit: nooit missen, geen crit, gemiddelde roll */
function fixedRng() {
  const seq = [0, 0.999, 0.5];
  let i = 0;
  return () => seq[i++ % 3];
}

/** Verwachte schade van een move (gemiste kans en crits meegerekend), na boss-schilden. */
export function expDamage(att: Fighter, tgt: Fighter, m: MoveDef, b?: Battle): number {
  if (m.power === 0 && !m.scaling) return 0;
  const mult = b && att === b.player && b.buffs.blessTurns > 0 ? 1.5 : 1;
  const hit = calcHit(att, tgt, m, fixedRng(), 0, mult);
  const crit = m.alwaysCrit ? 1 : critChance(att);
  const acc = (m.cost ?? 0) >= MAX_BOOST ? 1 : Math.min(1, m.accuracy / 100);
  const raw = hit.damage * (m.alwaysCrit ? 1.5 : 1 + 0.5 * crit) * acc;
  return shieldCap(tgt, Math.floor(raw)).damage;
}
/** Schade zonder crit en met de laagste roll: haalt hij het zeker? */
function minDamage(att: Fighter, tgt: Fighter, m: MoveDef, b: Battle): number {
  if (m.power === 0 && !m.scaling) return 0;
  const seq = [0, 0.999, 0];
  let i = 0;
  const mult = att === b.player && b.buffs.blessTurns > 0 ? 1.5 : 1;
  const hit = calcHit(att, tgt, m, () => seq[i++ % 3], 0, mult);
  const dmg = hit.damage * (m.alwaysCrit ? 1.5 : 1);
  return shieldCap(tgt, Math.floor(dmg)).damage;
}

const hpFrac = (f: Fighter) => Math.max(0, f.hp) / f.maxHp;
const hard = (b: Battle) => b.isBoss || b.elite || b.rival;

/** Gemiddelde schade die de vijand per beurt op `f` doet. */
function foeDamage(b: Battle, f: Fighter) {
  const moves = b.enemy.def.moves.map(m => MOVES[m]).filter(m => m.power > 0);
  if (!moves.length) return 0;
  return (moves.reduce((n, m) => n + expDamage(b.enemy, f, m), 0) / moves.length) * (1 - dodgeChance(f, b.enemy));
}

/** Hoe goed past `f` tegen deze vijand (hoger = beter). */
function matchup(b: Battle, f: Fighter) {
  if (f.fainted) return -99;
  const off = typeMultiplier(f.type, b.enemy.type);
  const def = typeMultiplier(b.enemy.type, f.type);
  const best = Math.max(...f.moves.map(id => expDamage(f, b.enemy, MOVES[id])));
  const ttk = b.enemy.hp / Math.max(1, best);             // beurten om te winnen
  const ttd = f.hp / Math.max(1, foeDamage(b, f));        // beurten tot KO
  return Math.min(3, ttd / Math.max(1, ttk)) + hpFrac(f) * 0.5 + (off - 1) * 0.3 - (def - 1) * 0.3;
}

export const goodPlayer: Policy = {
  item(b) {
    const p = b.player;
    const heals = ['chiliDog', 'hyperRing', 'superRing', 'healthRing'].filter(id => (b.bag[id] ?? 0) > 0);
    if ((b.bag.revive ?? 0) > 0 && hard(b)) {
      const down = b.party.find(f => f.fainted);
      if (down) return { id: 'revive', target: down };
    }
    if (heals.length && hpFrac(p) < 0.35 && foeDamage(b, p) >= p.hp * 0.6) return { id: heals[0], target: p };
    return undefined;
  },

  action(b): Action {
    const p = b.player, e = b.enemy;
    const usable = p.moves.map(id => MOVES[id]).filter(m => p.canUse(m));
    const dmg = new Map(usable.map(m => [m, expDamage(p, e, m, b)]));
    const best = Math.max(1, ...usable.filter(m => m.id !== p.def.ultimate).map(m => dmg.get(m)!));
    const turnsLeft = Math.max(1, e.hp / best);
    const foeHit = foeDamage(b, p);
    const foeFirst = e.spd > p.spd;
    const ult = p.def.ultimate ? MOVES[p.def.ultimate] : undefined;
    const canUlt = !!ult && p.level >= ULTIMATE_LEVEL && p.canUse(ult);

    // 1. Cream's Chao Blessing: iemand KO of het team flink geraakt
    if (canUlt && ult!.teamHeal) {
      const teamHp = b.party.reduce((n, f) => n + hpFrac(f), 0) / b.party.length;
      if (b.party.some(f => f.fainted) || teamHp < 0.55) return { kind: 'move', move: ult! };
    }
    // 2. kan ik hem nu zeker KO slaan? Dan de goedkoopste move die dat doet (eerst slaan als hij sneller is)
    const kos = usable.filter(m => !m.heal && !m.teamHeal && minDamage(p, e, m, b) >= e.hp)
      .filter(m => !(m.recoil && p.hp <= Math.ceil(p.maxHp * m.recoil)));
    if (kos.length) {
      const needFirst = foeFirst && foeHit >= p.hp;
      const ok = needFirst ? kos.filter(m => m.priority > 0) : kos;
      const list = ok.length ? ok : kos;
      const eff = (m: MoveDef) => (m.refundOnKo && !hard(b) ? 0 : p.costOf(m));
      list.sort((a, c) => eff(a) - eff(c) || c.priority - a.priority);
      return { kind: 'move', move: list[0] };
    }
    // 3. bijna KO en een gezonde teamgenoot: wisselen (KO blijft tot de zone-boss)
    const mates = b.party.filter(f => f !== p && !f.fainted);
    if (hpFrac(p) < 0.25 && foeHit >= p.hp && mates.length) {
      const to = mates.sort((a, c) => matchup(b, c) - matchup(b, a))[0];
      if (hpFrac(to) > 0.5) return { kind: 'switch', to };
    }
    // 4. Chao Cheer: Cream zelf, of een teamgenoot die het hard nodig heeft
    const cheer = usable.find(m => m.heal && m.ally);
    if (cheer) {
      if (hpFrac(p) < 0.4) return { kind: 'move', move: cheer, ally: p };
      const low = mates.filter(f => hpFrac(f) < 0.35).sort((a, c) => hpFrac(a) - hpFrac(c))[0];
      if (low && foeHit < p.hp * 0.5) return { kind: 'move', move: cheer, ally: low };
    }
    // 5. ultimate in een zwaar gevecht, of als het gevecht nog lang duurt
    if (canUlt && !ult!.teamHeal) {
      const safe = !ult!.recoil || p.hp > Math.ceil(p.maxHp * ult!.recoil) + foeHit;
      if (safe && (hard(b) || turnsLeft > 2.5) && (p.isFree(ult!) || dmg.get(ult!)! > best * 1.4 || ult!.stun)) return { kind: 'move', move: ult! };
    }
    // 6. de rest: schade + wat de move later oplevert - wat de Boost waard is
    const spin = dmg.get(MOVES.spinAttack) ?? best * 0.5;
    const boostValue = spin * (hard(b) ? 0.35 : 0.7);
    const later = Math.min(4, turnsLeft - 1);
    const score = (m: MoveDef) => {
      if (m.teamHeal || (m.heal && m.ally)) return -1e9;
      if (m.id === p.def.ultimate) return -1e9;
      let v = dmg.get(m)!;
      if (m.selfStages?.atk && p.stage('atk') < 4) v += best * 0.25 * (p.def.passive?.id === 'flinch' ? 2 : 1) * later;
      if (m.selfStages?.spd && p.def.id === 'sonic' && p.spd < e.spd * 4) v += best * 0.15 * later;
      if (m.selfStages?.def) v -= foeHit * 0.2 * later;
      if (m.pierce && e.pierced === 0) v += best * 0.5 * Math.min(3, later);
      if (m.stun && e.stun === 0) v += (foeHit * 2 + (p.def.passive?.id === 'weakSpot' ? best * Math.min(2, later) : 0));
      if (m.targetStages?.atk) v += foeHit * 0.2 * later;
      if (m.extendStun && e.stun > 0 && !b.stunUsed.has('p:extend')) v += foeHit + (p.def.passive?.id === 'weakSpot' ? best : 0);
      if (m.selfHeal) v += Math.min(p.maxHp - p.hp, p.maxHp * m.selfHeal) * 0.5;
      if (m.priority > 0 && foeFirst && foeHit >= p.hp) v += best;
      v -= p.costOf(m) * boostValue;
      v += p.gainOf(m) * boostValue;
      return v;
    };
    const choice = usable.filter(m => score(m) > -1e8).sort((a, c) => score(c) - score(a))[0] ?? MOVES.spinAttack;
    return { kind: 'move', move: choice };
  },

  next(b, alive) {
    return alive.sort((a, c) => matchup(b, c) - matchup(b, a))[0];
  },

  preWave(b) {
    const alive = b.party.filter(f => !f.fainted);
    const score = (f: Fighter) => matchup(b, f) + (f === b.player ? 0.15 : 0);
    return alive.sort((a, c) => score(c) - score(a))[0];
  },

  reward(b, choices: RewardDef[]) {
    const hurtest = b.party.filter(f => !f.fainted).sort((a, c) => hpFrac(a) - hpFrac(c))[0];
    const low = hurtest ? hpFrac(hurtest) : 1;
    const lowestLevel = [...b.party].sort((a, c) => a.level - c.level)[0];
    const teamHp = b.party.reduce((n, f) => n + hpFrac(f), 0) / b.party.length;
    const val = (r: RewardDef): number => {
      switch (r.id) {
        case 'heal50': return low < 0.5 ? 9.5 : low < 0.8 ? 5 : 1;
        case 'heal20': return low < 0.4 ? 8 : low < 0.7 ? 4 : 1;
        case 'shard': return 9;
        case 'moveChip': return 8;
        case 'chaosDrive': return 7;
        case 'invincible2': return 6;
        case 'shield2': return isBossWave(b.wave + 1) ? 7 : 5;
        case 'boost2': return b.player.boost <= 3 ? 5.5 : 3;
        case 'boost': return b.player.boost <= 3 ? 4 : 2;
        case 'hammer': return 4;
        case 'invincible': return 4;
        case 'rings': return 3.5;
        case 'shield': return 3;
        case 'magnet': return 3;
        case 'alarm': return teamHp > 0.8 ? 3 : 0;
        case 'eggman': return teamHp > 0.85 ? 2.5 : 0;
        default: return 1;
      }
    };
    let bestI = 0;
    choices.forEach((r, i) => { if (val(r) > val(choices[bestI])) bestI = i; });
    const r = choices[bestI];
    let target: Fighter | undefined;
    if (r.target === 'pick') {
      const ok = b.party.filter(f => r.canTarget?.(f) ?? true);
      if (r.id === 'chaosDrive') target = lowestLevel;
      else if (r.id === 'moveChip') target = ok.includes(b.player) ? b.player : ok[0];
      else target = ok.sort((a, c) => hpFrac(a) - hpFrac(c))[0];
      target ??= b.party[0];
    }
    return { i: bestI, target };
  },

  shop(b, stock: ItemDef[]) {
    const out: Array<{ item: ItemDef; target?: Fighter }> = [];
    let rings = b.rings;
    const heals = stock.filter(i => !i.revive).sort((a, c) => a.price! - c.price!);
    const revive = stock.find(i => i.revive);
    // KO's terughalen als je het kunt betalen (anders wacht je op de zone-boss)
    for (const f of b.party.filter(f => f.fainted)) {
      if (revive && rings >= revive.price! * 1.2) { out.push({ item: revive, target: f }); rings -= revive.price!; }
    }
    // wie onder de helft zit: het goedkoopste item dat hem weer boven 70% brengt
    for (const f of b.party.filter(f => !f.fainted && hpFrac(f) < 0.5).sort((a, c) => hpFrac(a) - hpFrac(c))) {
      const it = heals.find(i => i.price! <= rings && healsTo(i, f) >= 0.7) ?? [...heals].reverse().find(i => i.price! <= rings);
      if (it) { out.push({ item: it, target: f }); rings -= it.price!; }
    }
    // een reserve in de tas als er geld over is
    const bagged = Object.values(b.bag).reduce((n, v) => n + v, 0);
    if (bagged === 0 && heals.length) {
      const it = [...heals].reverse().find(i => i.price! * 2.5 <= rings);
      if (it) out.push({ item: it });
    }
    return out;
  },

  recruit() { return -1; },
};

/** Tot hoeveel % HP brengt dit item hem? */
function healsTo(i: ItemDef, f: Fighter) {
  const pct = i.id === 'chiliDog' ? 1 : i.id === 'hyperRing' ? 0.75 : i.id === 'superRing' ? 0.5 : 0.25;
  const flat = i.id === 'hyperRing' ? 120 : i.id === 'superRing' ? 60 : i.id === 'healthRing' ? 25 : 0;
  return Math.min(1, (f.hp + Math.max(flat, f.maxHp * pct)) / f.maxHp);
}

