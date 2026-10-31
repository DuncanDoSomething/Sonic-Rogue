/**
 * Balans-simulatie: 2000 gevechten per character tegen de wave 10-boss (Shell Tank), zonder items.
 * Draaien met: npm run sim
 */
import { it } from 'vitest';
import { Fighter, MOVES, calcHit, BOOST_ON_HIT } from '../src/data/fighters';

function fight(hero: string, lvl: number, bossLvl: number) {
  const p = new Fighter(hero, lvl), e = new Fighter('turtle', bossLvl);
  e.typeOverride = p.type;
  for (let turn = 0; turn < 60; turn++) {
    const moves = p.def.moves.map(m => MOVES[m]);
    const heal = moves.find(m => m.heal && p.canUse(m));
    const strong = moves.filter(m => (m.cost ?? 0) > 0 && !m.heal && p.canUse(m)).sort((a, b) => b.power - a.power)[0];
    const pm = heal && p.hp < p.maxHp * 0.45 ? heal : strong && strong.power > 40 ? strong : MOVES.spinAttack;
    const em = MOVES[e.def.moves[Math.floor(Math.random() * e.def.moves.length)]];
    const order: Array<[Fighter, Fighter, typeof pm]> = p.spd >= e.spd ? [[p, e, pm], [e, p, em]] : [[e, p, em], [p, e, pm]];
    for (const [a, t, m] of order) {
      if (a.fainted || t.fainted) continue;
      if (a === p) p.spendBoost(m);
      if (m.heal) { a.hp = Math.min(a.maxHp, a.hp + Math.ceil(a.maxHp * m.heal)); continue; }
      const h = calcHit(a, t, m); t.hp = Math.max(0, t.hp - h.damage);
      if (t === p && !h.missed) p.gainBoost(BOOST_ON_HIT);
    }
    if (e.fainted) return p.hp / p.maxHp;
    if (p.fainted) return -1;
  }
  return -1;
}

it('boss sim', () => {
  for (const [label, bossLvl] of [['boss +2', 11], ['boss +1', 10]] as const) for (const h of ['sonic', 'tails', 'knuckles', 'cream', 'amy']) {
    let wins = 0, hpLeft = 0; const N = 2000;
    for (let i = 0; i < N; i++) { const r = fight(h, 11, bossLvl); if (r >= 0) { wins++; hpLeft += r; } }
    console.log(`${label} ${MOVES.flutterDive.power} ${h.padEnd(9)} win ${(100 * wins / N).toFixed(0)}%  hp left ${wins ? (100 * hpLeft / wins).toFixed(0) : 0}%`);
  }
});
