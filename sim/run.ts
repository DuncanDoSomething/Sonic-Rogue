// ---------------------------------------------------------------------------
// Balans-simulatie draaien: npm run sim  (of: npx vite-node sim/run.ts -- --runs 200)
// Speelt elke team-combinatie van 3 characters N keer en schrijft sim/results.json.
// ---------------------------------------------------------------------------
import { writeFileSync } from 'node:fs';
import { HEROES } from '../src/data/fighters';
import { Battle, RunLog } from './engine';
import { goodPlayer } from './policy';

const args = process.argv.slice(2);
const arg = (k: string, d: number) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
const RUNS = arg('runs', 150);
const MAX_WAVE = arg('max', 150);
const SEED = arg('seed', 1);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'sim/results.json';

function combos<T>(a: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return a.flatMap((x, i) => combos(a.slice(i + 1), k - 1).map(c => [x, ...c]));
}

// experimenten: --exp naam[,naam]  (verandert getallen alleen voor deze simulatie)
import { CHARGE_MULTS, FIGHTERS, MOVES, PASSIVE_TUNING } from '../src/data/fighters';
const EXPERIMENTS: Record<string, () => void> = {
  bossRandomType: () => { Battle.opts.bossRandomType = true; },
  // de "glass cannons" wat steviger
  bulk: () => {
    Object.assign(FIGHTERS.sonic.base, { hp: 21 }); Object.assign(FIGHTERS.sonic.growth, { hp: 2.7, def: 1.2 });
    Object.assign(FIGHTERS.amy.base, { hp: 25, def: 8 }); Object.assign(FIGHTERS.amy.growth, { hp: 3.3, def: 1.3 });
    Object.assign(FIGHTERS.shadow.base, { hp: 22 }); Object.assign(FIGHTERS.shadow.growth, { hp: 2.9 });
  },
  // Iron Fists al vanaf 25% HP (in plaats van 50%)
  sash25: () => { Battle.opts.sashMin = 0.25; },
  // Sonic ontwijkt vaker: 15% per keer zo snel, max 40%
  dodge15: () => { Battle.opts.dodge = [0.15, 0.4]; },
  // Sonic iets meer HP
  sonicHp: () => { Object.assign(FIGHTERS.sonic.base, { hp: 21 }); Object.assign(FIGHTERS.sonic.growth, { hp: 2.7, def: 1.2 }); },
  // Knuckles (Guardian): kans om een KO te overleven
  sash30: () => { Battle.opts.sashChance = 0.3; },
  b1: () => { Battle.opts.badnikHp = 1; Battle.opts.badnikAtk = 1; },
  b15: () => { Battle.opts.badnikHp = 1.5; Battle.opts.badnikAtk = 1.25; },
  b14: () => { Battle.opts.badnikHp = 1.4; Battle.opts.badnikAtk = 1.1; },
  b17: () => { Battle.opts.badnikHp = 1.7; Battle.opts.badnikAtk = 1.35; },
  h16: () => { Battle.opts.badnikHp = 1.6; Battle.opts.badnikAtk = 1; },
  h14a11: () => { Battle.opts.badnikHp = 1.4; Battle.opts.badnikAtk = 1.1; },
  b18: () => { Battle.opts.badnikHp = 1.8; Battle.opts.badnikAtk = 1.4; },
  b2: () => { Battle.opts.badnikHp = 2; Battle.opts.badnikAtk = 1.5; },
  sash70: () => { Battle.opts.sashChance = 0.7; },
  // Knuckles overleeft geen KO meer met 1 HP
  noSash: () => { Battle.opts.noSash = true; },
  // alleen Amy steviger
  amyBulk: () => { Object.assign(FIGHTERS.amy.base, { hp: 25, def: 8 }); Object.assign(FIGHTERS.amy.growth, { hp: 3.3, def: 1.3 }); },
  // Tornado Hammer kost een kwart in plaats van de helft van haar HP
  amyRecoil: () => { MOVES.tornadoHammer.recoil = 0.25; },
  // Glove Punch verdooft maar één keer per gevecht (Thunder Shoot blijft altijd verdoven)
  gloveOnce: () => { MOVES.glovePunch.stunOnce = true; },
  // Knuckles iets minder tanky
  knuxNerf: () => { Object.assign(FIGHTERS.knuckles.growth, { hp: 3.3, def: 1.4 }); },
  // Eggman minder HP-groei
  eggmanHp: () => { Object.assign(FIGHTERS.eggman.growth, { hp: 4.2 }); },
  // vergelijking: de badniks van vóór de enemy-variatie (geen traits, geen bijeffecten, geen elite-eigenschappen)
  oldFoes: () => {
    Battle.opts.noTraits = true; Battle.opts.noEliteTraits = true;
    Object.assign(MOVES.stingShot, { power: 38, poison: undefined });
    Object.assign(MOVES.snowball, { freezeChance: undefined });
    Object.assign(MOVES.tongueLash, { power: 36, targetStages: undefined });
    Object.assign(MOVES.trumpetBlast, { power: 38, targetStages: undefined });
    Object.assign(MOVES.sharkRam, { power: 42, accuracy: 88, drainBoost: undefined });
    Object.assign(MOVES.bellySlide, { priority: 0, selfStages: undefined });
  },
  // Shell Tank's opgeladen Tank Slam x2 in plaats van x1,5
  tank2: () => { CHARGE_MULTS.shellUp = 2; },
  // Shell Up zonder de schelp (alleen opladen)
  tankNoShell: () => { Battle.opts.tankNoShell = true; },
  // Sonic zoals vóór de Sonic-buff (passive +25%/max 75%, Homing 50 power en gratis bij KO, geen extra klap)
  oldSonic: () => {
    PASSIVE_TUNING.perRatio = 0.25; PASSIVE_TUNING.cap = 1.75;
    Object.assign(MOVES.homingAttack, { scaling: undefined, speedTable: undefined, extraHit: undefined, refundOnKo: true });
  },
  // de extra Homing Attack doet de helft
  halfExtra: () => { Battle.opts.extraMult = 0.5; },
  // de extra Homing Attack maar 30% kans
  extra30: () => { MOVES.homingAttack.extraHit = 0.3; },
  // rivals zoals vóór de rival-update (geen schilden, geen trucs, wel opnieuw dezelfde)
  oldRivals: () => { Battle.opts.oldRivals = true; },
  // rivals krijgen ook een elite-eigenschap
  rivalEnraged: () => { Battle.opts.rivalElite = 'enraged'; },
  rivalSwift: () => { Battle.opts.rivalElite = 'swift'; },
  rivalNoShields: () => { Battle.opts.rivalShields = 0; },
  rivalNoTraits: () => { Battle.opts.noRivalTraits = true; },
  noRivalLevel: () => { Battle.opts.noRivalLevel = true; },
  lateRivalHalf: () => { Battle.opts.lateRivalMult = 0.5; },
  lateRivalNone: () => { Battle.opts.lateRivalMult = 0; },
  // alleen de elite-eigenschappen uit
  noEliteTraits: () => { Battle.opts.noEliteTraits = true; },
};
const exps = args.includes('--exp') ? args[args.indexOf('--exp') + 1].split(',') : [];
for (const e of exps) { if (!EXPERIMENTS[e]) throw new Error(`onbekend experiment ${e}`); EXPERIMENTS[e](); }
void FIGHTERS; void MOVES;

const SIZE = arg('size', 3);
const teams = combos(HEROES, SIZE);
const logs: RunLog[] = [];
const t0 = Date.now();
let seed = SEED * 100000;
for (const team of teams) {
  for (let r = 0; r < RUNS; r++) {
    // de volgorde telt (wie begint): elke run een andere starter
    const order = [...team.slice(r % team.length), ...team.slice(0, r % team.length)];
    logs.push(new Battle(order, goodPlayer, seed++, MAX_WAVE).run());
  }
}
const secs = (Date.now() - t0) / 1000;

// ------------------------------------------------------------------ samenvatten
const mean = (a: number[]) => (a.length ? a.reduce((n, v) => n + v, 0) / a.length : 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const key = (t: string[]) => [...t].sort().join('+');

const byTeam = new Map<string, RunLog[]>();
for (const l of logs) { const k = key(l.party); (byTeam.get(k) ?? byTeam.set(k, []).get(k)!).push(l); }
const teamRows = [...byTeam.entries()].map(([k, ls]) => ({
  team: k,
  runs: ls.length,
  mean: Math.round(mean(ls.map(l => l.reached)) * 10) / 10,
  median: median(ls.map(l => l.reached)),
  past20: pct(ls.filter(l => l.reached > 20).length, ls.length),
  past40: pct(ls.filter(l => l.reached > 40).length, ls.length),
  past60: pct(ls.filter(l => l.reached > 60).length, ls.length),
  past80: pct(ls.filter(l => l.reached > 80).length, ls.length),
  capped: pct(ls.filter(l => l.reached > MAX_WAVE).length, ls.length),
})).sort((a, b) => b.mean - a.mean);

const heroRows = HEROES.map(h => {
  const withH = logs.filter(l => l.party.includes(h));
  const without = logs.filter(l => !l.party.includes(h));
  const per = withH.map(l => l.per[h]).filter(Boolean);
  const totalDmg = withH.map(l => Object.values(l.per).reduce((n, p) => n + p.dmg, 0));
  return {
    hero: h,
    teamMean: Math.round(mean(withH.map(l => l.reached)) * 10) / 10,
    /** hoeveel waves verder teams met hem komen dan teams zonder hem */
    impact: Math.round((mean(withH.map(l => l.reached)) - mean(without.map(l => l.reached))) * 10) / 10,
    dmgShare: pct(per.reduce((n, p) => n + p.dmg, 0), totalDmg.reduce((n, v) => n + v, 0)),
    turnShare: pct(per.reduce((n, p) => n + p.turns, 0), withH.reduce((n, l) => n + Object.values(l.per).reduce((m, p) => m + p.turns, 0), 0)),
    dmgPerTurn: Math.round(mean(per.map(p => p.dmg / Math.max(1, p.turns))) * 10) / 10,
    kosPerRun: Math.round(mean(per.map(p => p.kos)) * 10) / 10,
    downsPerRun: Math.round(mean(per.map(p => p.downs)) * 100) / 100,
    ultsPerRun: Math.round(mean(per.map(p => p.ults)) * 10) / 10,
    endLevel: Math.round(mean(per.map(p => p.level))),
  };
}).sort((a, b) => b.impact - a.impact);

// waar gaan runs dood: per 10 waves, en soort vijand
const deathBuckets: Record<string, number> = {};
const deathKinds: Record<string, number> = {};
const deathFoes: Record<string, number> = {};
for (const l of logs) {
  if (l.reached > MAX_WAVE) continue;
  const b = `${Math.floor((l.reached - 1) / 10) * 10 + 1}-${Math.floor((l.reached - 1) / 10) * 10 + 10}`;
  deathBuckets[b] = (deathBuckets[b] ?? 0) + 1;
  deathKinds[l.lostKind] = (deathKinds[l.lostKind] ?? 0) + 1;
  deathFoes[l.lostTo] = (deathFoes[l.lostTo] ?? 0) + 1;
}
// hoeveel runs halen wave X (overlevingscurve)
const survival = Array.from({ length: Math.ceil(MAX_WAVE / 5) + 1 }, (_, i) => i * 5).map(w => ({ wave: w, pct: pct(logs.filter(l => l.reached > w).length, logs.length) }));

// bosses: winkans per wave
const bossMap = new Map<string, { n: number; won: number; turns: number[] }>();
for (const l of logs) for (const b of l.bosses) {
  const k = `${b.wave} ${b.id}`;
  const s = bossMap.get(k) ?? bossMap.set(k, { n: 0, won: 0, turns: [] }).get(k)!;
  s.n++; if (b.won) { s.won++; s.turns.push(b.turns); }
}
const bossRows = [...bossMap.entries()].map(([k, s]) => ({ boss: k, fights: s.n, winPct: pct(s.won, s.n), turns: Math.round(mean(s.turns) * 10) / 10 }))
  .sort((a, b) => parseInt(a.boss) - parseInt(b.boss) || a.boss.localeCompare(b.boss));

const rivalMap = new Map<string, { n: number; won: number }>();
for (const l of logs) for (const r of l.rivals) {
  const s = rivalMap.get(r.id) ?? rivalMap.set(r.id, { n: 0, won: 0 }).get(r.id)!;
  s.n++; if (r.won) s.won++;
}
const rivalRows = [...rivalMap.entries()].map(([id, s]) => ({ rival: id, fights: s.n, winPct: pct(s.won, s.n) }));

// gevechten: beurten en HP-verlies per soort
const fightRows = ['normal', 'elite', 'rival', 'boss', 'mainBoss'].map(k => {
  const fs = logs.map(l => l.fights[k]).filter(Boolean);
  const n = fs.reduce((a, f) => a + f.n, 0);
  return { kind: k, fights: n, turns: Math.round((fs.reduce((a, f) => a + f.turns, 0) / Math.max(1, n)) * 10) / 10, hpLostPct: pct(fs.reduce((a, f) => a + f.hpLost, 0), n) };
});

// levels: team vs vijand
const levelMap = new Map<number, { team: number[]; foe: number[] }>();
for (const l of logs) for (const v of l.levels) {
  const s = levelMap.get(v.wave) ?? levelMap.set(v.wave, { team: [], foe: [] }).get(v.wave)!;
  s.team.push(v.team); s.foe.push(v.foe);
}
const levelRows = [...levelMap.entries()].sort((a, b) => a[0] - b[0]).map(([w, s]) => ({ wave: w, team: Math.round(mean(s.team) * 10) / 10, foe: Math.round(mean(s.foe) * 10) / 10, runs: s.team.length }));

// welke moves gebruikt elk character (aandeel van zijn beurten)
const moveUse = Object.fromEntries(HEROES.map(h => {
  const tot: Record<string, number> = {};
  for (const l of logs) for (const [m, n] of Object.entries(l.per[h]?.moves ?? {})) tot[m] = (tot[m] ?? 0) + n;
  const sum = Object.values(tot).reduce((a, v) => a + v, 0);
  return [h, Object.fromEntries(Object.entries(tot).map(([m, n]) => [m, pct(n, sum)]))];
}));
const sumUp = (f: (l: RunLog) => Record<string, number>) => {
  const t: Record<string, number> = {};
  for (const l of logs) for (const [k, n] of Object.entries(f(l))) t[k] = (t[k] ?? 0) + n;
  return Object.fromEntries(Object.entries(t).map(([k, n]) => [k, Math.round((n / logs.length) * 100) / 100]));
};
const economy = { picksPerRun: sumUp(l => l.picks), boughtPerRun: sumUp(l => l.bought), itemsUsedPerRun: Math.round(mean(logs.map(l => l.itemsUsed)) * 10) / 10 };

// main bosses: winkans per character in het team
const eggmanByHero = Object.fromEntries(HEROES.map(h => {
  const fights = logs.filter(l => l.party.includes(h)).flatMap(l => l.bosses.filter(b => b.id === 'eggman'));
  const byWave = (w: number) => { const f = fights.filter(b => b.wave === w); return pct(f.filter(b => b.won).length, f.length); };
  return [h, { all: pct(fights.filter(b => b.won).length, fights.length), w20: byWave(20), w40: byWave(40), w60: byWave(60), w80: byWave(80) }];
}));

const result = {
  meta: { experiments: exps, runs: logs.length, perTeam: RUNS, teams: teams.length, maxWave: MAX_WAVE, seconds: secs, date: new Date().toISOString() },
  overall: {
    mean: Math.round(mean(logs.map(l => l.reached)) * 10) / 10,
    median: median(logs.map(l => l.reached)),
    capped: pct(logs.filter(l => l.reached > MAX_WAVE).length, logs.length),
  },
  survival, moveUse, economy, eggmanByHero, teams: teamRows, heroes: heroRows, deathBuckets, deathKinds, deathFoes, bosses: bossRows, rivals: rivalRows, fights: fightRows, levels: levelRows,
};
writeFileSync(OUT, JSON.stringify(result, null, 1));

console.log(`${logs.length} runs in ${secs.toFixed(1)}s  ->  ${OUT}`);
console.log(`gemiddeld wave ${result.overall.mean}, mediaan ${result.overall.median}, ${result.overall.capped}% haalt wave ${MAX_WAVE}`);
console.table(heroRows);
console.table(teamRows.slice(0, 6));
console.table(teamRows.slice(-6));
console.table(bossRows);
console.table(fightRows);
console.table(levelRows);
console.log('moves', moveUse);
console.log('economie', economy);
console.log('dood per wave-blok', deathBuckets);
console.log('dood door', deathKinds, deathFoes);
