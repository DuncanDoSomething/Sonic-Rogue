// ---------------------------------------------------------------------------
// Balans-simulatie: een hele run zonder beeld, met dezelfde regels als BattleScene.ts.
// Alleen de logica (geen animaties, teksten of geluid). Verandert er iets aan de regels in de
// BattleScene, pas het dan hier ook aan; de getallen zelf komen uit src/data, dus tweaks daar
// gaan vanzelf mee.
//
// De keuzes van de speler (welke move, wie erin, welke reward) maakt een `Policy` (zie policy.ts).
// ---------------------------------------------------------------------------
import {
  BLESS_BONUS, BLESS_TURNS, BOOST_ON_HIT, BOSS_REVIVE_HP, CHAO_CARE_BENCH, CHAO_CARE_HEAL, CRIT_RECOIL, FIGHTER_TYPES, FLINCH_CHANCE,
  Fighter, FIGHTERS, HEROES, MAX_BOOST, MAX_PARTY, MOVES, MoveDef, RAMPAGE_CHANCE, RIVAL_HEROES, StageKey, ULT_CHAIN_MAX,
  benchExpRate, calcHit, emptyStages, expShareAfter, shieldCap,
} from '../src/data/fighters';
import {
  EMERALDS, MAIN_BOSS_BOOST, MAIN_BOSS_SHIELDS, SHADOW_BOSS_HP, ZONE_BOSS_HEAL, ZONE_BOSS_SHIELDS, ZoneEffect,
  enemyScaling, isBossWave, isEliteWave, isMainBossWave, mainBossFor, rivalChance, rivalLevelBonus, rollZoneOrder, zoneForWave,
} from '../src/data/zones';
import { BOSS_TIER_ODDS, HAMMER_CRIT, MAGNET_BONUS, RewardCtx, RewardDef, RunBuffs, SHIELD_FACTOR, TIER_ODDS, Tier, emptyBuffs, rollRewards } from '../src/data/rewards';
import { BAG_SIZE, ITEMS, ITEMS_PER_FIGHT, ItemDef, bagCount, shopStock, waveRings } from '../src/data/items';

export type Rng = () => number;
/** Kleine, snelle RNG met een seed, zodat een run te herhalen is. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rng: Rng, a: T[]) => a[Math.floor(rng() * a.length)];

/** Wat de speler deze beurt doet. */
export type Action =
  | { kind: 'move'; move: MoveDef; ally?: Fighter }
  | { kind: 'switch'; to: Fighter };

/** De beslissingen van de speler. */
export interface Policy {
  /** Gratis item gebruiken voor de beurt (1 per gevecht)? Geef het item en voor wie. */
  item(b: Battle): { id: string; target: Fighter } | undefined;
  action(b: Battle): Action;
  /** Wie erin na een KO. */
  next(b: Battle, alive: Fighter[]): Fighter;
  /** Gratis wissel voor de wave (Battle Style "Switch"): wie erin (of dezelfde). */
  preWave(b: Battle): Fighter;
  /** Welke reward (index) en voor wie. */
  reward(b: Battle, choices: RewardDef[]): { i: number; target?: Fighter };
  /** Shop na de rewards: welke items kopen en voor wie (undefined = in de tas). */
  shop(b: Battle, stock: ItemDef[]): Array<{ item: ItemDef; target?: Fighter }>;
  /** Rival verslagen en hij wil meedoen: wie gaat er weg (index), of -1 = niet. */
  recruit(b: Battle, newbie: Fighter): number;
}

/** Wat we per run bijhouden voor de statistieken. */
export interface RunLog {
  party: string[];
  /** laatste wave die je haalde (de wave waarop je verloor) */
  reached: number;
  /** waar je op verloor: soort vijand */
  lostTo: string;
  lostKind: 'normal' | 'elite' | 'boss' | 'mainBoss' | 'rival' | 'none';
  /** per character: schade gedaan, KO's gemaakt, keren KO gegaan, beurten in het veld */
  per: Record<string, { dmg: number; kos: number; downs: number; turns: number; ults: number; level: number; moves: Record<string, number>; switches: number }>;
  /** gekozen rewards en gekochte items */
  picks: Record<string, number>;
  bought: Record<string, number>;
  itemsUsed: number;
  /** per wave-soort: gevechten en hoeveel HP-% het team gemiddeld verloor */
  fights: Record<string, { n: number; turns: number; hpLost: number }>;
  /** bosses: [wave, gewonnen?] */
  bosses: Array<{ wave: number; id: string; won: boolean; turns: number }>;
  rivals: Array<{ wave: number; id: string; won: boolean }>;
  /** level van je team (gemiddeld) per 10 waves, en het level van de vijand */
  levels: Array<{ wave: number; team: number; foe: number }>;
}

export class Battle {
  rng: Rng;
  party: Fighter[];
  player: Fighter;
  enemy!: Fighter;
  wave = 1;
  rings = 0;
  bag: Record<string, number> = {};
  buffs: RunBuffs = emptyBuffs();
  emeralds = 0;
  expShare = 0;
  zoneOrder: string[];
  fieldCleared = false;
  fieldEffect?: ZoneEffect;
  rivalsMet: string[] = [];
  // per wave
  rival = false;
  elite = false;
  charFoe = false;
  foeUltUsed = false;
  foeBless = 0;
  waveFighters = new Set<Fighter>();
  stunUsed = new Set<string>();
  itemsUsed = 0;
  waveShield = false;
  dodgeFirst = false;
  waveMagnet = false;
  alarmWave = false;
  minTier: Tier = 'common';
  flinched = new Set<Fighter>();
  turn = 0;
  log: RunLog;

  /** Experimenten met regels die niet in src/data staan (zie run.ts --exp). */
  static opts: { bossRandomType?: boolean; eggmanLevel?: number; noSash?: boolean } = {};

  constructor(partyIds: string[], private policy: Policy, seed: number, private maxWave = 200) {
    this.rng = seeded(seed);
    this.party = partyIds.map(id => new Fighter(id, 5));
    this.player = this.party[0];
    this.zoneOrder = rollZoneOrder(this.rng);
    this.log = {
      party: partyIds, reached: 0, lostTo: '', lostKind: 'none', per: {}, fights: {}, bosses: [], rivals: [], levels: [], picks: {}, bought: {}, itemsUsed: 0,
    };
    for (const f of this.party) this.stat(f);
  }

  private stat(f: Fighter) {
    return (this.log.per[f.def.id] ??= { dmg: 0, kos: 0, downs: 0, turns: 0, ults: 0, level: f.level, moves: {}, switches: 0 });
  }
  get isBoss() { return isBossWave(this.wave); }
  get kind(): RunLog['lostKind'] {
    if (this.rival) return 'rival';
    if (this.isBoss) return isMainBossWave(this.wave) ? 'mainBoss' : 'boss';
    return this.elite ? 'elite' : 'normal';
  }

  /** Speelt de hele run. */
  run(): RunLog {
    while (this.wave <= this.maxWave) {
      const won = this.playWave();
      if (!won) break;
      this.wave++;
    }
    this.log.reached = this.wave;
    for (const f of this.party) this.stat(f).level = f.level;
    return this.log;
  }

  // ------------------------------------------------------------------ wave
  private startWave() {
    this.party.forEach(f => { f.stun = 0; f.evade = 0; f.pierced = 0; });
    this.stunUsed.clear();
    this.itemsUsed = 0;
    this.waveShield = this.buffs.shieldWaves > 0;
    if (this.waveShield) this.buffs.shieldWaves--;
    this.dodgeFirst = this.buffs.dodgeNext || this.buffs.dodgeWaves > 0;
    this.buffs.dodgeNext = false;
    if (this.buffs.dodgeWaves > 0) this.buffs.dodgeWaves--;
    this.waveMagnet = this.buffs.magnetWaves > 0;
    if (this.waveMagnet) this.buffs.magnetWaves--;
    this.alarmWave = this.buffs.eliteNext && !isBossWave(this.wave);
    this.buffs.eliteNext = false;
    const zone = zoneForWave(this.wave, this.zoneOrder);
    const boss = isBossWave(this.wave);
    const rivalId = this.rng() < rivalChance(this.wave) ? this.pickRival() : undefined;
    this.rival = !!rivalId;
    this.elite = (isEliteWave(this.wave) || this.alarmWave) && !this.rival && !boss;
    const mainBoss = boss && isMainBossWave(this.wave);
    const id = rivalId ?? (mainBoss ? mainBossFor(this.wave, this.party.map(f => f.def.id), this.rng) : boss ? zone.boss : pick(this.rng, zone.enemies));
    this.enemy = new Fighter(id, 4 + Math.floor(0.65 * (this.wave - 1)) + (boss || this.elite ? 2 : 0) + (rivalId ? rivalLevelBonus(this.wave) : 0));
    this.charFoe = HEROES.includes(id);
    if (!this.charFoe) { this.enemy.statMult = enemyScaling(this.wave); this.enemy.hp = this.enemy.maxHp; }
    this.waveFighters = new Set([this.player]);
    this.foeUltUsed = false;
    this.foeBless = 0;
    if (this.charFoe && boss) { this.enemy.hpMult = SHADOW_BOSS_HP; this.enemy.hp = this.enemy.maxHp; }
    if (boss) this.enemy.segments = mainBoss ? MAIN_BOSS_SHIELDS : ZONE_BOSS_SHIELDS;
    if (rivalId) this.rivalsMet.push(rivalId);
    if (id === 'eggman' || (boss && !mainBoss && Battle.opts.bossRandomType)) this.enemy.typeOverride = pick(this.rng, FIGHTER_TYPES);
    if (id === 'eggman' && Battle.opts.eggmanLevel) { this.enemy.level += Battle.opts.eggmanLevel; this.enemy.hp = this.enemy.maxHp; }
    this.applyZoneEffect(this.fieldCleared ? undefined : zone.effect);
    // Battle Style "Switch" (standaard): gratis wisselen voor elke wave behalve de eerste
    if (this.wave > 1 && this.party.filter(f => !f.fainted).length > 1) {
      const to = this.policy.preWave(this);
      if (to !== this.player && !to.fainted) this.switchTo(to);
    }
    this.chaoCare();
  }

  private applyZoneEffect(effect?: ZoneEffect) {
    for (const f of this.party) {
      f.field = emptyStages();
      for (const [k, v] of Object.entries(effect?.stages ?? {})) f.field[k as StageKey] = v;
    }
    this.fieldEffect = effect;
  }

  private chaoCare() {
    const cream = this.party.find(f => f.def.passive?.id === 'chaoCare' && !f.fainted);
    if (!cream) return;
    const heal = cream === this.player ? CHAO_CARE_HEAL : CHAO_CARE_BENCH;
    for (const f of this.party) if (!f.fainted && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + Math.ceil(f.maxHp * heal));
  }

  private pickRival() {
    const others = RIVAL_HEROES.filter(h => !this.party.some(f => f.def.id === h) && FIGHTERS[h]);
    if (!others.length) return undefined;
    const fresh = others.filter(h => !this.rivalsMet.includes(h));
    return pick(this.rng, fresh.length ? fresh : others);
  }

  /** Eén wave spelen. true = gewonnen. */
  private playWave(): boolean {
    this.startWave();
    const kind = this.kind;
    const hpBefore = this.teamHpFrac();
    const foeId = this.enemy.def.id;
    let turns = 0;
    const MAX_TURNS = 200;
    while (turns++ < MAX_TURNS) {
      this.turn++;
      // gratis item voor de beurt
      if (this.itemsUsed < ITEMS_PER_FIGHT) {
        const use = this.policy.item(this);
        if (use && (this.bag[use.id] ?? 0) > 0) {
          this.bag[use.id]--;
          ITEMS[use.id].use(use.target);
          this.itemsUsed++;
          this.log.itemsUsed++;
        }
      }
      const a = this.policy.action(this);
      if (a.kind === 'switch') {
        this.stat(this.player).switches++;
        this.switchTo(a.to);
        this.act(this.enemy, this.player, this.pickEnemyMove());
        this.tickSuper();
        if (this.player.fainted && !this.handleFaint()) return this.lose(kind, foeId);
        this.endOfTurn();
        if (this.player.fainted && !this.handleFaint()) return this.lose(kind, foeId);
        continue;
      }
      this.runTurn(a.move, a.ally);
      if (this.enemy.fainted) {
        this.recordFight(kind, turns, hpBefore);
        if (this.isBoss) this.log.bosses.push({ wave: this.wave, id: foeId, won: true, turns });
        if (this.rival) this.log.rivals.push({ wave: this.wave, id: foeId, won: true });
        this.winWave();
        if (this.party.every(f => f.fainted)) return this.lose(kind, foeId);
        return true;
      }
      if (this.player.fainted && !this.handleFaint()) return this.lose(kind, foeId);
      this.endOfTurn();
      if (this.player.fainted && !this.handleFaint()) return this.lose(kind, foeId);
    }
    // te lang (zou niet moeten): telt als verloren
    this.log.lostTo = 'stalled';
    return this.lose(kind, `stalled:${foeId}`);
  }

  private teamHpFrac() {
    const alive = this.party;
    return alive.reduce((n, f) => n + Math.max(0, f.hp) / f.maxHp, 0) / alive.length;
  }
  private recordFight(kind: string, turns: number, hpBefore: number) {
    const s = (this.log.fights[kind] ??= { n: 0, turns: 0, hpLost: 0 });
    s.n++;
    s.turns += turns;
    s.hpLost += Math.max(0, hpBefore - this.teamHpFrac());
  }
  private lose(kind: RunLog['lostKind'], foe: string) {
    this.log.lostKind = kind;
    this.log.lostTo = foe;
    if (this.isBoss) this.log.bosses.push({ wave: this.wave, id: foe, won: false, turns: 0 });
    if (this.rival) this.log.rivals.push({ wave: this.wave, id: foe, won: false });
    return false;
  }

  // ------------------------------------------------------------------ beurt
  pickEnemyMove(): MoveDef {
    const e = this.enemy;
    if (this.charFoe && this.isBoss && e.def.ultimate && !this.foeUltUsed && e.hp < e.maxHp * 0.5) {
      this.foeUltUsed = true;
      return MOVES[e.def.ultimate];
    }
    const all = e.def.moves.map(m => MOVES[m]);
    const sensible = all.filter(m => !(m.pierce && this.player.pierced > 0) && !(m.id === 'eggLaugh' && e.stage('atk') >= 2));
    const moves = sensible.length ? sensible : all;
    const hurt = e.hp < e.maxHp * 0.5;
    const usable = moves.filter(m => !m.heal || hurt);
    return pick(this.rng, usable.length ? usable : moves);
  }

  private runTurn(playerMove: MoveDef, ally?: Fighter) {
    const enemyMove = this.pickEnemyMove();
    const playerFirst = playerMove.priority !== enemyMove.priority ? playerMove.priority > enemyMove.priority : this.player.spd >= this.enemy.spd;
    const order: Array<[Fighter, Fighter, MoveDef]> = playerFirst
      ? [[this.player, this.enemy, playerMove], [this.enemy, this.player, enemyMove]]
      : [[this.enemy, this.player, enemyMove], [this.player, this.enemy, playerMove]];
    this.flinched.clear();
    for (const [att, tgt, move] of order) {
      if (att.fainted || tgt.fainted) continue;
      this.act(att, tgt, move, att === this.player ? ally : undefined);
    }
    this.flinched.clear();
    this.tickSuper();
  }

  private act(att: Fighter, tgt: Fighter, move: MoveDef, ally?: Fighter) {
    if (att === this.player) this.stat(att).turns++;
    if (att.stun > 0) { att.stun--; return; }
    if (this.flinched.has(att)) return;
    const freeUse = att.isFree(move);
    if (att === this.player) {
      const mv = this.stat(att).moves;
      mv[move.id] = (mv[move.id] ?? 0) + 1;
      this.player.spendBoost(move);
      if (move.id === att.def.ultimate) this.stat(att).ults++;
    }
    const hammer = att === this.player && this.buffs.critTurns > 0;
    if (hammer) this.buffs.critTurns--;
    const critBonus = hammer ? HAMMER_CRIT : 0;
    const blessed = att === this.player ? this.buffs.blessTurns > 0 : this.foeBless > 0;
    if (att === this.player && blessed) this.buffs.blessTurns--;
    else if (blessed) this.foeBless--;
    this.doAttack(att, tgt, move, ally, critBonus, blessed ? 1 + BLESS_BONUS : 1, freeUse);
  }

  private doAttack(att: Fighter, tgt: Fighter, move: MoveDef, ally: Fighter | undefined, critBonus: number, dmgBonus: number, freeUse: boolean) {
    const isPlayer = att === this.player;
    if (move.heal || move.teamHeal) return this.doHeal(att, move, ally ?? att);
    let hit = calcHit(att, tgt, move, this.rng, isPlayer ? critBonus : 0, dmgBonus);
    const status = move.power === 0;
    if (status) hit = { damage: 0, crit: false, missed: false, effect: 1 };
    if (!isPlayer && !hit.missed && this.party.includes(tgt)) {
      if (this.dodgeFirst) {
        this.dodgeFirst = false;
        hit = { ...hit, missed: true, damage: 0, crit: false };
      } else if (this.waveShield || this.buffs.shieldHit) {
        hit = { ...hit, damage: Math.max(1, Math.ceil(hit.damage * SHIELD_FACTOR)) };
        if (!this.waveShield) this.buffs.shieldHit = false;
      }
    }
    if (tgt.evade > 0) { tgt.evade--; hit = { ...hit, missed: true, damage: 0, crit: false }; }
    // strike
    if (!hit.missed && !status) {
      const cap = shieldCap(tgt, hit.damage);
      hit = { ...hit, damage: cap.damage };
      const before = tgt.hp;
      tgt.hp = Math.max(0, tgt.hp - hit.damage);
      if (tgt.hp === 0 && tgt.def.passive?.id === 'flinch' && !tgt.sashUsed && !Battle.opts.noSash) { tgt.hp = 1; tgt.sashUsed = true; }
      if (isPlayer) {
        this.stat(att).dmg += before - tgt.hp;
        if (tgt.fainted) this.stat(att).kos++;
      } else {
        this.player.gainBoost(BOOST_ON_HIT);
        if (tgt.fainted) this.stat(tgt).downs++;
      }
    }
    if (move.spendStages) att.stages = emptyStages();
    if (move.recoil && !att.fainted) {
      att.hp = Math.max(0, att.hp - Math.ceil(att.maxHp * move.recoil));
      if (att.fainted && isPlayer) this.stat(att).downs++;
    }
    if (move.evade && !att.fainted) att.evade = move.evade;
    if (!hit.missed) {
      if (move.selfHeal && !att.fainted && att.hp < att.maxHp) att.hp += Math.min(att.maxHp - att.hp, Math.ceil(att.maxHp * move.selfHeal));
      for (const [k, v] of Object.entries(move.selfStages ?? {})) if (!att.fainted) att.raise(k as StageKey, v);
      for (const [k, v] of Object.entries(move.targetStages ?? {})) if (!tgt.fainted) tgt.raise(k as StageKey, v);
      if (hit.crit && att.def.passive?.id === 'luckySwing' && !move.recoil && !move.selfHeal && !att.fainted) {
        const cost = Math.min(att.hp - 1, Math.ceil(att.maxHp * CRIT_RECOIL));
        if (cost > 0) att.hp -= cost;
      }
      if (att.def.passive?.id === 'flinch' && !tgt.fainted && this.rng() < FLINCH_CHANCE) this.flinched.add(tgt);
      const stunKey = isPlayer ? `p:${move.id}` : 'e:any';
      const once = move.stunOnce || !isPlayer;
      if (move.stun && !tgt.fainted && !(once && this.stunUsed.has(stunKey))) {
        if (once) this.stunUsed.add(stunKey);
        tgt.stun = Math.max(tgt.stun, move.stun[0] + Math.floor(this.rng() * (move.stun[1] - move.stun[0] + 1)));
      }
      if (move.pierce && !tgt.fainted) { tgt.pierced = move.pierce; tgt.freshTurns.add('pierced'); }
    }
    if (move.superTurns && !att.fainted && att.superTurns <= 0) att.superTurns = move.superTurns;
    this.shadowAfter(att, tgt, move, freeUse);
  }

  private shadowAfter(att: Fighter, tgt: Fighter, move: MoveDef, freeUse: boolean) {
    const ult = move.id === att.def.ultimate;
    const ko = tgt.fainted && !att.fainted;
    if (ult && !freeUse) att.ultChain = 0;
    if (!ko) return;
    let resets = 0;
    if (att.moves.includes('chaosControl') && !att.chaosFree) { att.chaosFree = true; resets++; }
    if (ult && move.resets === 'ownKo' && !att.ultFree && att.ultChain < ULT_CHAIN_MAX) { att.ultFree = true; att.ultChain++; resets++; }
    for (let i = 0; i < resets; i++) {
      if (att.def.passive?.id === 'rampage' && this.rng() < RAMPAGE_CHANCE) { att.raise('atk', 1); att.raise('spd', 1); }
    }
  }

  private doHeal(att: Fighter, move: MoveDef, target: Fighter) {
    const isPlayer = att === this.player;
    if (move.teamHeal) {
      const team = isPlayer ? this.party.filter(f => !f.fainted) : [att];
      const down = isPlayer && move.revive ? this.party.filter(f => f.fainted) : [];
      for (const f of team) f.hp += Math.min(f.maxHp - f.hp, Math.ceil(f.maxHp * move.teamHeal));
      for (const f of down) f.hp = Math.max(1, Math.ceil(f.maxHp * move.revive!));
      if (move.blessing) { if (isPlayer) this.buffs.blessTurns = BLESS_TURNS; else this.foeBless = BLESS_TURNS; }
      if (move.clearField && isPlayer && this.fieldEffect) { this.applyZoneEffect(undefined); this.fieldCleared = true; }
      return;
    }
    target.hp += Math.min(target.maxHp - target.hp, Math.ceil(target.maxHp * (move.heal ?? 0)));
    if (move.allyBoost && target.boost < MAX_BOOST) target.gainBoost(move.allyBoost);
  }

  private tickSuper() {
    for (const f of [this.player, this.enemy]) if (f && f.superTurns > 0) f.superTurns--;
  }

  private endOfTurn() {
    for (const f of [this.player, this.enemy]) if (f && !f.fainted) f.tickTurns();
    const burn = this.fieldEffect?.burn;
    if (!burn || this.player.fainted) return;
    this.player.hp = Math.max(0, this.player.hp - Math.max(1, Math.floor(this.player.maxHp * burn)));
    if (this.player.fainted) this.stat(this.player).downs++;
  }

  switchTo(next: Fighter, resetStages = true) {
    this.waveFighters.add(next);
    const prev = this.player;
    if (prev === next) return;
    if (resetStages) prev.stages = emptyStages();
    prev.stun = 0;
    this.player = next;
  }

  private handleFaint(): boolean {
    const alive = this.party.filter(f => !f.fainted);
    if (!alive.length) return false;
    this.switchTo(alive.length > 1 ? this.policy.next(this, alive) : alive[0]);
    return true;
  }

  // ------------------------------------------------------------------ gewonnen
  private winWave() {
    if (this.player.def.passive?.id === 'speedster' && !this.player.fainted) this.player.raise('spd', 1);
    const kind = isBossWave(this.wave) ? 'boss' : this.elite ? 'elite' : 'normal';
    this.minTier = this.alarmWave && !this.rival ? 'uncommon' : 'common';
    this.rings += Math.round(waveRings(this.wave, kind) * (this.waveMagnet ? 1 + MAGNET_BONUS : 1));
    const exp = this.enemy.def.expYield + this.enemy.level * 3;
    this.player.gainExp(exp);
    this.teamExp(exp);
    if (isBossWave(this.wave)) {
      this.party.forEach(f => { f.stages = emptyStages(); f.sashUsed = false; });
      this.fieldCleared = false;
      this.bossRecovery();
      if (this.emeralds < EMERALDS.length) this.emeralds++;
    }
    if (this.charFoe && !this.party.some(f => f.def.id === this.enemy.def.id)) {
      const newbie = new Fighter(this.enemy.def.id, this.enemy.level);
      newbie.field = { ...this.player.field };
      if (this.party.length < MAX_PARTY) { this.party.push(newbie); this.stat(newbie); }
      else {
        const out = this.policy.recruit(this, newbie);
        if (out >= 0) {
          const gone = this.party[out];
          this.party[out] = newbie;
          this.stat(newbie);
          this.stat(gone).level = gone.level;
          if (gone === this.player) this.player = newbie;
        }
      }
    }
    const share = expShareAfter(this.wave);
    if (share > this.expShare) this.expShare = share;
    if (this.player.fainted) {
      const alive = this.party.filter(f => !f.fainted);
      if (!alive.length) return;
      this.switchTo(alive.length > 1 ? this.policy.next(this, alive) : alive[0]);
    }
    if (this.wave % 10 === 0) {
      const alive = this.party;
      this.log.levels.push({ wave: this.wave, team: alive.reduce((n, f) => n + f.level, 0) / alive.length, foe: this.enemy.level });
    }
    this.rewards();
  }

  private teamExp(exp: number) {
    const fought = this.party.filter(f => f !== this.player && !f.fainted && this.waveFighters.has(f));
    const bench = this.party.filter(f => f !== this.player && !f.fainted && !this.waveFighters.has(f));
    const rate = benchExpRate(this.expShare, this.emeralds);
    const share = Math.max(1, Math.floor(exp * rate));
    for (const f of fought) f.gainExp(exp);
    if (rate > 0) for (const f of bench) f.gainExp(share);
  }

  private bossRecovery() {
    if (isMainBossWave(this.wave)) {
      this.party.forEach(f => { f.hp = f.maxHp; f.boost = Math.max(f.boost, MAIN_BOSS_BOOST); });
      return;
    }
    for (const f of this.party) {
      if (f.fainted) f.hp = Math.max(1, Math.ceil(f.maxHp * BOSS_REVIVE_HP));
      else if (f.hp < f.maxHp * ZONE_BOSS_HEAL) f.hp = Math.max(f.hp, Math.ceil(f.maxHp * ZONE_BOSS_HEAL));
    }
  }

  rewardCtx(): RewardCtx {
    return {
      player: this.player, party: this.party, wave: this.wave, buffs: this.buffs,
      nextIsBoss: isBossWave(this.wave + 1), gainRings: n => { this.rings += n; },
    };
  }

  private rewards() {
    const choices = rollRewards(this.rewardCtx(), 3, this.rng, this.minTier, isBossWave(this.wave) ? BOSS_TIER_ODDS : TIER_ODDS);
    // eerst de shop (zoals een speler meestal doet: healen voor je kiest), dan de reward
    for (const { item, target } of this.policy.shop(this, shopStock(this.wave))) {
      if (this.rings < item.price!) continue;
      if (!target && bagCount(this.bag) >= BAG_SIZE) continue;
      this.rings -= item.price!;
      this.log.bought[item.id] = (this.log.bought[item.id] ?? 0) + 1;
      if (target) item.use(target);
      else this.bag[item.id] = (this.bag[item.id] ?? 0) + 1;
    }
    const { i, target } = this.policy.reward(this, choices);
    choices[i].apply(this.rewardCtx(), target);
    this.log.picks[choices[i].id] = (this.log.picks[choices[i].id] ?? 0) + 1;
    this.minTier = 'common';
  }
}
