// ---------------------------------------------------------------------------
// Fighters, moves en rewards. Alles wat "balans" is staat hier, zodat je
// getallen kunt tweaken zonder de battle-code aan te raken.
// ---------------------------------------------------------------------------

/** Hoe een move er in beeld uitziet. Player-moves en badnik-moves hebben eigen stijlen. */
export type MoveAnim =
  | 'spin' | 'homing' | 'dash' | 'punch' | 'fly'   // team
  | 'glide' | 'hammer' | 'twirl' | 'heal' | 'ultimate'
  | 'shoot' | 'tackle' | 'lash' | 'slam';          // badniks

// ---------------------------------------------------------------- types
/** Speed / Fly / Power, zoals de teams in Advance 3 en Heroes. Fly > Power > Speed > Fly. */
export type FighterType = 'speed' | 'fly' | 'power';
export const TYPE_BEATS: Record<FighterType, FighterType> = { fly: 'power', power: 'speed', speed: 'fly' };
export const TYPE_STRONG = 1.5;   // aanvaller heeft voordeel
export const TYPE_WEAK = 0.67;    // aanvaller heeft nadeel
export function typeMultiplier(att?: FighterType, def?: FighterType) {
  if (!att || !def || att === def) return 1;
  return TYPE_BEATS[att] === def ? TYPE_STRONG : TYPE_BEATS[def] === att ? TYPE_WEAK : 1;
}

// ---------------------------------------------------------------- stat stages
/** ATK/DEF/SPD/ACC gaan in stappen van -6 t/m +6, net als in Pokémon. */
export type StageKey = 'atk' | 'def' | 'spd' | 'acc';
export type Stages = Record<StageKey, number>;
export const MAX_STAGE = 6;
export const STAGE_STEP = 0.25;
/** +1 = x1.25, +2 = x1.5 ... +6 = x2.5. Omlaag spiegelt: -1 = x0.8, -2 = x0.67 ... -6 = x0.4 (+1 en -1 heffen elkaar dus op). */
export function stageMultiplier(stage: number) {
  return stage >= 0 ? 1 + STAGE_STEP * stage : 1 / (1 + STAGE_STEP * -stage);
}
export const STAGE_NAMES: Record<StageKey, string> = { atk: 'attack', def: 'defense', spd: 'speed', acc: 'accuracy' };
export const emptyStages = (): Stages => ({ atk: 0, def: 0, spd: 0, acc: 0 });

// ---------------------------------------------------------------- boost
/** Boost-meter: sterke moves kosten Boost, Spin Attack en geraakt worden vullen hem weer. */
export const MAX_BOOST = 6;
export const START_BOOST = 3;
export const BOOST_ON_HIT = 1;          // als jij geraakt wordt
/** Vanaf dit level leert een character zijn ultimate (kost de hele meter). */
export const ULTIMATE_LEVEL = 30;

// ---------------------------------------------------------------- party
export const MAX_PARTY = 3;
/** Exp Share: na de boss van wave 10 krijgt de bank 50% van de EXP, na wave 20 100%. */
export const EXP_SHARE_STEPS: Array<[number, number]> = [[10, 0.5], [20, 1]];
/** Deel van de EXP dat teamleden op de bank krijgen, als je wave `cleared` net gehaald hebt. */
/** Catch-up EXP: wie achterloopt op de hoogste in het team krijgt +50% EXP per level verschil (max 3x). */
export const CATCH_UP_PER_LEVEL = 0.5;
export const CATCH_UP_MAX = 3;
export function catchUpMultiplier(f: { level: number }, party: Array<{ level: number }>) {
  const top = Math.max(f.level, ...party.map(p => p.level));
  return Math.min(CATCH_UP_MAX, 1 + CATCH_UP_PER_LEVEL * (top - f.level));
}
export function expShareAfter(cleared: number) {
  return EXP_SHARE_STEPS.reduce((rate, [wave, r]) => (cleared >= wave ? r : rate), 0);
}

// ---------------------------------------------------------------- passives
export type PassiveId = 'speedster' | 'flinch' | 'luckySwing';
export interface PassiveDef { id: PassiveId; name: string; desc: string; }
export const PASSIVES: Record<PassiveId, PassiveDef> = {
  speedster:  { id: 'speedster', name: 'Sonic Speed', desc: '+1 SPD after every KO. Hits harder the faster he is than the foe (+25% per 1x faster, up to +50%).' },
  flinch:     { id: 'flinch', name: 'Iron Fists', desc: 'Every hit has a 20% chance to make the foe flinch and lose its turn.' },
  luckySwing: { id: 'luckySwing', name: 'Lucky Swing', desc: '+25% crit chance for every ATK stage she has.' },
};
export const FLINCH_CHANCE = 0.2;
export const BASE_CRIT = 0.0625;

/** Sonic Speed: x1 bij gelijke snelheid, +25% per keer zo snel, max +50%. */
export function speedBonus(attacker: Fighter, target: Fighter) {
  if (attacker.def.passive?.id !== 'speedster') return 1;
  const ratio = attacker.spd / Math.max(1, target.spd);
  return Math.min(1.5, Math.max(1, 1 + 0.25 * (ratio - 1)));
}

/** Critical-kans: 1/16, plus Lucky Swing (Amy). */
export function critChance(attacker: Fighter) {
  const bonus = attacker.def.passive?.id === 'luckySwing' ? 0.25 * Math.max(0, attacker.stage('atk')) : 0;
  return Math.min(1, BASE_CRIT + bonus);
}

export interface MoveDef {
  id: string;
  name: string;
  power: number;
  accuracy: number; // 0-100
  priority: number; // hoger = gaat eerst, ongeacht speed
  anim: MoveAnim;
  desc: string;
  /** Kleur van het projectiel bij 'shoot'. */
  tint?: number;
  /** Geneest de gebruiker met dit deel van zijn max-HP in plaats van aan te vallen. */
  heal?: number;
  /** 'speed' = power hangt af van hoeveel sneller je bent dan het doelwit (zie speedPower). */
  scaling?: 'speed';
  /** Boost-kosten (0 = gratis). Gratis moves geven juist Boost: zie `boostGain`. */
  cost?: number;
  boostGain?: number;
  /** Stat stages die de gebruiker krijgt als de move raakt (bijv. Homing Attack: SPD +1). */
  selfStages?: Partial<Record<StageKey, number>>;
}

export const MOVES: Record<string, MoveDef> = {
  // --- team
  spinAttack:   { id: 'spinAttack', name: 'Spin Attack', power: 40, accuracy: 95, priority: 0, anim: 'spin', boostGain: 1, desc: 'Curls into a ball and rolls into the foe.' },
  homingAttack: { id: 'homingAttack', name: 'Homing Attack', power: 30, accuracy: 100, priority: 1, anim: 'homing', cost: 1, selfStages: { spd: 1 }, desc: 'Locks on and strikes first. Never misses. Raises SPD by 1.' },
  spinDash:     { id: 'spinDash', name: 'Spin Dash', power: 70, scaling: 'speed', accuracy: 100, priority: 0, anim: 'dash', cost: 3, desc: 'Revs up and launches. The faster Sonic is than the foe, the harder it hits (50-150). Never misses.' },
  glovePunch:   { id: 'glovePunch', name: 'Glove Punch', power: 55, accuracy: 100, priority: 0, anim: 'punch', cost: 2, desc: 'A double punch with spring-loaded boxing gloves.' },
  glideAttack:  { id: 'glideAttack', name: 'Glide Attack', power: 45, accuracy: 100, priority: 0, anim: 'glide', cost: 2, desc: 'Glides in from above, fists first. Never misses.' },
  drillPunch:   { id: 'drillPunch', name: 'Knuckle Punch', power: 80, accuracy: 100, priority: 0, anim: 'punch', cost: 3, desc: 'A full-power punch from the strongest fists on Angel Island. Never misses.' },
  flutterDive:  { id: 'flutterDive', name: 'Flutter Dive', power: 30, accuracy: 100, priority: 1, anim: 'fly', cost: 1, desc: 'Flaps her ears, flies up and dives. Always strikes first.' },
  chaoCheer:    { id: 'chaoCheer', name: 'Chao Cheer', power: 0, accuracy: 100, priority: 0, anim: 'heal', heal: 0.3, cost: 3, desc: 'Cheers herself on and heals 30% of her max HP.' },
  hammerSmash:  { id: 'hammerSmash', name: 'Piko Hammer', power: 60, accuracy: 100, priority: 0, anim: 'hammer', cost: 2, desc: 'Swings her Piko Piko Hammer down on the foe.' },
  hammerTwirl:  { id: 'hammerTwirl', name: 'Hammer Twirl', power: 80, accuracy: 100, priority: 0, anim: 'twirl', cost: 3, desc: 'Spins around with her hammer out. Never misses.' },
  copterDive:   { id: 'copterDive', name: 'Copter Dive', power: 30, accuracy: 100, priority: 1, anim: 'fly', cost: 1, desc: 'Flies up with spinning tails and dives down. Always strikes first.' },
  // --- ultimates (kosten de hele Boost-meter, geleerd op ULTIMATE_LEVEL)
  lightSpeed:   { id: 'lightSpeed', name: 'Light Speed Atk', power: 130, accuracy: 100, priority: 1, anim: 'ultimate', cost: MAX_BOOST, desc: 'A chain of homing attacks faster than light. Uses all Boost.' },
  thunderShoot: { id: 'thunderShoot', name: 'Thunder Shoot', power: 130, accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, desc: 'Charges up and fires himself like a lightning bolt. Uses all Boost.' },
  maximumHeat:  { id: 'maximumHeat', name: 'Maximum Heat', power: 150, accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, desc: 'Burns with power and slams into the foe. Uses all Boost.' },
  chaoAttack:   { id: 'chaoAttack', name: 'Chao Attack', power: 120, accuracy: 100, priority: 1, anim: 'ultimate', cost: MAX_BOOST, desc: 'Cheese rushes the foe again and again. Uses all Boost.' },
  tornadoHammer:{ id: 'tornadoHammer', name: 'Tornado Hammer', power: 140, accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, desc: 'A spinning hammer storm that swallows the foe. Uses all Boost.' },
  // --- badniks
  stingShot:  { id: 'stingShot', name: 'Sting Shot', power: 38, accuracy: 92, priority: 0, anim: 'shoot', desc: '', tint: 0xffb340 },
  snowball:   { id: 'snowball', name: 'Snowball', power: 34, accuracy: 95, priority: 0, anim: 'shoot', desc: '', tint: 0xffffff },
  drillRam:   { id: 'drillRam', name: 'Drill Ram', power: 42, accuracy: 88, priority: 0, anim: 'tackle', desc: '' },
  bodyCheck:  { id: 'bodyCheck', name: 'Body Check', power: 32, accuracy: 95, priority: 0, anim: 'tackle', desc: '' },
  tongueLash: { id: 'tongueLash', name: 'Tongue Lash', power: 36, accuracy: 95, priority: 0, anim: 'lash', desc: '' },
  trumpetBlast:{ id: 'trumpetBlast', name: 'Trumpet Blast', power: 38, accuracy: 92, priority: 0, anim: 'shoot', desc: '', tint: 0xffe070 },
  spikeBurst: { id: 'spikeBurst', name: 'Spike Burst', power: 44, accuracy: 88, priority: 0, anim: 'lash', desc: '' },
  shellCannon:{ id: 'shellCannon', name: 'Shell Cannon', power: 40, accuracy: 92, priority: 0, anim: 'shoot', desc: '', tint: 0x6aa8ff },
  tankSlam:   { id: 'tankSlam', name: 'Tank Slam', power: 55, accuracy: 85, priority: 0, anim: 'slam', desc: '' },
};

export interface Stats { hp: number; atk: number; def: number; spd: number; }

export interface FighterDef {
  id: string;
  name: string;
  /** Texture-atlas en animatie-prefix, bijv. atlas 'badniks' + prefix 'frog' -> anim 'frog_idle'. */
  atlas: string;
  animPrefix: string;
  base: Stats;    // stats op level 1
  growth: Stats;  // erbij per level
  moves: string[];
  expYield: number;
  scale: number;
  /** true = sprite kijkt op de sheet naar rechts (moet dus geflipt worden aan vijandkant). */
  facesRight?: boolean;
  /** vliegers zweven iets boven hun platform */
  hover?: number;
  type: FighterType;
  /** ultimate-move (alleen speelbare characters) */
  ultimate?: string;
  /** vaste eigenschap van het character (werkt ook als hij een rival is) */
  passive?: PassiveDef;
}

export const FIGHTERS: Record<string, FighterDef> = {
  // ------------------------------------------------------------- team
  sonic: {
    type: 'speed', ultimate: 'lightSpeed', passive: PASSIVES.speedster,
    id: 'sonic', name: 'Sonic', atlas: 'sonic', animPrefix: 'sonic', scale: 2,
    base: { hp: 24, atk: 12, def: 7, spd: 14 },
    growth: { hp: 3.2, atk: 2.0, def: 1.1, spd: 1.8 },
    moves: ['spinAttack', 'homingAttack', 'spinDash'],
    expYield: 20, // alleen als rival
  },
  tails: {
    type: 'fly', ultimate: 'thunderShoot',
    id: 'tails', name: 'Tails', atlas: 'tails', animPrefix: 'tails', scale: 2,
    base: { hp: 26, atk: 10, def: 8, spd: 16 },
    growth: { hp: 3.4, atk: 1.8, def: 1.3, spd: 1.9 },
    moves: ['spinAttack', 'copterDive', 'glovePunch'],
    expYield: 20, // alleen als rival
  },
  knuckles: {
    type: 'power', ultimate: 'maximumHeat', passive: PASSIVES.flinch,
    id: 'knuckles', name: 'Knuckles', atlas: 'knuckles', animPrefix: 'knuckles', scale: 2,
    base: { hp: 28, atk: 14, def: 9, spd: 9 },
    growth: { hp: 3.6, atk: 2.2, def: 1.4, spd: 1.3 },
    moves: ['spinAttack', 'glideAttack', 'drillPunch'],
    expYield: 20, // alleen als rival
  },
  cream: {
    type: 'fly', ultimate: 'chaoAttack',
    id: 'cream', name: 'Cream', atlas: 'cream', animPrefix: 'cream', scale: 2,
    base: { hp: 25, atk: 9, def: 8, spd: 15 },
    growth: { hp: 3.3, atk: 1.7, def: 1.2, spd: 1.8 },
    moves: ['spinAttack', 'flutterDive', 'chaoCheer'],
    expYield: 20, // alleen als rival
  },
  amy: {
    type: 'power', ultimate: 'tornadoHammer', passive: PASSIVES.luckySwing,
    id: 'amy', name: 'Amy', atlas: 'amy', animPrefix: 'amy', scale: 2,
    base: { hp: 25, atk: 13, def: 7, spd: 12 },
    growth: { hp: 3.2, atk: 2.1, def: 1.1, spd: 1.6 },
    moves: ['spinAttack', 'hammerSmash', 'hammerTwirl'],
    expYield: 20, // alleen als rival
  },
  // ------------------------------------------------------------- badniks
  beetle:   { type: 'fly', id: 'beetle', name: 'Buzz Beetle', atlas: 'badniks', animPrefix: 'beetle', scale: 1.6, facesRight: true, hover: 26,
    base: { hp: 13, atk: 7, def: 5, spd: 11 }, growth: { hp: 2.4, atk: 1.3, def: 0.9, spd: 1.3 }, moves: ['bodyCheck'], expYield: 8 },
  sharkjet: { type: 'speed', id: 'sharkjet', name: 'Shark Jet', atlas: 'badniks', animPrefix: 'sharkjet', scale: 1.5, hover: 30,
    base: { hp: 12, atk: 8, def: 5, spd: 13 }, growth: { hp: 2.3, atk: 1.4, def: 0.9, spd: 1.4 }, moves: ['drillRam'], expYield: 9 },
  octo:     { type: 'power', id: 'octo', name: 'Copter Octo', atlas: 'badniks', animPrefix: 'octo', scale: 1.5, hover: 22,
    base: { hp: 15, atk: 7, def: 6, spd: 7 }, growth: { hp: 2.6, atk: 1.3, def: 1.0, spd: 1.0 }, moves: ['drillRam', 'bodyCheck'], expYield: 9 },
  frog:     { type: 'speed', id: 'frog', name: 'Ribbit Bot', atlas: 'badniks', animPrefix: 'frog', scale: 1.8,
    base: { hp: 16, atk: 7, def: 7, spd: 6 }, growth: { hp: 2.8, atk: 1.3, def: 1.1, spd: 0.9 }, moves: ['tongueLash'], expYield: 9 },
  bee:      { type: 'fly', id: 'bee', name: 'Buzz Cannon', atlas: 'badniks', animPrefix: 'bee', scale: 1.5, hover: 18,
    base: { hp: 13, atk: 8, def: 5, spd: 10 }, growth: { hp: 2.4, atk: 1.4, def: 0.9, spd: 1.2 }, moves: ['stingShot'], expYield: 9 },
  snowman:  { type: 'power', id: 'snowman', name: 'Snow Bot', atlas: 'badniks', animPrefix: 'snowman', scale: 1.7, facesRight: true,
    base: { hp: 17, atk: 7, def: 6, spd: 5 }, growth: { hp: 2.8, atk: 1.3, def: 1.0, spd: 0.8 }, moves: ['snowball'], expYield: 9 },
  pig:      { type: 'power', id: 'pig', name: 'Piggy Bank', atlas: 'badniks', animPrefix: 'pig', scale: 1.8, facesRight: true,
    base: { hp: 19, atk: 8, def: 7, spd: 6 }, growth: { hp: 3.0, atk: 1.4, def: 1.1, spd: 0.8 }, moves: ['bodyCheck'], expYield: 10 },
  soldier:  { type: 'speed', id: 'soldier', name: 'Toy Trooper', atlas: 'badniks', animPrefix: 'soldier', scale: 1.7, facesRight: true,
    base: { hp: 15, atk: 9, def: 6, spd: 9 }, growth: { hp: 2.6, atk: 1.5, def: 1.0, spd: 1.2 }, moves: ['trumpetBlast'], expYield: 10 },
  penguin:  { type: 'speed', id: 'penguin', name: 'Top Hat Pengu', atlas: 'badniks', animPrefix: 'penguin', scale: 1.7,
    base: { hp: 16, atk: 8, def: 6, spd: 9 }, growth: { hp: 2.7, atk: 1.4, def: 1.0, spd: 1.2 }, moves: ['bodyCheck'], expYield: 10 },
  mine:     { type: 'power', id: 'mine', name: 'Spike Mine', atlas: 'badniks', animPrefix: 'mine', scale: 1.6, hover: 16,
    base: { hp: 14, atk: 9, def: 8, spd: 4 }, growth: { hp: 2.4, atk: 1.5, def: 1.3, spd: 0.7 }, moves: ['spikeBurst'], expYield: 10 },
  // ------------------------------------------------------------- boss
  turtle:   { type: 'power', id: 'turtle', name: 'Shell Tank', atlas: 'badniks', animPrefix: 'turtle', scale: 2.2,
    base: { hp: 30, atk: 9, def: 9, spd: 6 }, growth: { hp: 4.2, atk: 1.6, def: 1.3, spd: 0.9 }, moves: ['shellCannon', 'tankSlam'], expYield: 25 },
};

/** Alle speelbare characters (en dus ook mogelijke rivals). */
export const HEROES = ['sonic', 'tails', 'knuckles', 'cream', 'amy'];

export class Fighter {
  readonly def: FighterDef;
  level: number;
  hp = 0;
  exp = 0;
  /** Stat stages uit rewards (-6..+6). Worden gereset na een zone-boss. */
  stages: Stages = emptyStages();
  /** Tijdelijke stages van de zone (bijv. Twinkle Snow: SPD -1). Telt op bij `stages`. */
  field: Stages = emptyStages();
  boost = START_BOOST;

  constructor(id: string, level: number) {
    this.def = FIGHTERS[id];
    this.level = level;
    this.hp = this.maxHp;
  }

  get name() { return this.def.name; }
  anim(name: string) { return `${this.def.animPrefix}_${name}`; }
  private stat(k: keyof Stats) { return Math.floor(this.def.base[k] + this.def.growth[k] * (this.level - 1)); }
  get maxHp() { return this.stat('hp'); }
  /** Totale stage (rewards + zone), begrensd op -6..+6. */
  stage(k: StageKey) { return Math.max(-MAX_STAGE, Math.min(MAX_STAGE, this.stages[k] + this.field[k])); }
  get atk() { return Math.floor(this.stat('atk') * stageMultiplier(this.stage('atk'))); }
  get dfn() { return Math.floor(this.stat('def') * stageMultiplier(this.stage('def'))); }
  get spd() { return Math.floor(this.stat('spd') * stageMultiplier(this.stage('spd'))); }
  /** Normaal het type uit de def; een boss kan tijdelijk een ander type krijgen (zie BOSS_TYPE_NEUTRAL). */
  typeOverride?: FighterType;
  get type() { return this.typeOverride ?? this.def.type; }
  /** Moves die je nu kunt kiezen: de vaste 3, plus de ultimate vanaf ULTIMATE_LEVEL. */
  get moves(): string[] {
    return this.def.ultimate && this.level >= ULTIMATE_LEVEL ? [...this.def.moves, this.def.ultimate] : this.def.moves;
  }
  canUse(m: MoveDef) { return (m.cost ?? 0) <= this.boost; }
  spendBoost(m: MoveDef) { this.boost = Math.max(0, Math.min(MAX_BOOST, this.boost - (m.cost ?? 0) + (m.boostGain ?? 0))); }
  gainBoost(n: number) { this.boost = Math.min(MAX_BOOST, this.boost + n); }
  /** Verhoogt/verlaagt een stage. Geeft het bericht terug (of dat hij al op max/min zit). */
  raise(k: StageKey, by = 1): string {
    const before = this.stages[k];
    this.stages[k] = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, before + by));
    if (this.stages[k] === before) return `${this.name}'s ${STAGE_NAMES[k]} won't go any ${by > 0 ? 'higher' : 'lower'}!`;
    return `${this.name}'s ${STAGE_NAMES[k]} ${by > 0 ? 'rose' : 'fell'}${Math.abs(by) > 1 ? ' sharply' : ''}!`;
  }
  get fainted() { return this.hp <= 0; }
  get expToNext() { return 6 + this.level * 5; }

  /** Geeft het aantal level-ups terug. */
  gainExp(amount: number): number {
    let ups = 0;
    this.exp += amount;
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      const before = this.maxHp;
      this.level++;
      this.hp += this.maxHp - before; // nieuwe max-HP komt er ook als HP bij
      ups++;
    }
    return ups;
  }
}

/**
 * Spin Dash-power op basis van snelheid, net als Electro Ball in Pokémon (r = jouw SPD / hun SPD),
 * een stap hoger omdat de move 3 Boost kost.
 */
export const SPEED_POWER: Array<[number, number]> = [[4, 150], [3, 120], [2, 90], [1, 70], [0, 50]];
export function speedPower(userSpd: number, targetSpd: number) {
  const r = userSpd / Math.max(1, targetSpd);
  return SPEED_POWER.find(([min]) => r >= min)![1];
}
/** De echte power van een move tegen dit doelwit. */
export function movePower(m: MoveDef, user: Fighter, target?: Fighter) {
  return m.scaling === 'speed' && target ? speedPower(user.spd, target.spd) : m.power;
}

export interface HitResult { damage: number; crit: boolean; missed: boolean; effect: number; }

/** Pokémon-achtige damage-formule, versimpeld. */
export function calcHit(attacker: Fighter, target: Fighter, move: MoveDef, rng: () => number = Math.random): HitResult {
  const effect = typeMultiplier(attacker.type, target.type);
  const accuracy = move.accuracy * stageMultiplier(attacker.stage('acc'));
  if (rng() * 100 >= accuracy) return { damage: 0, crit: false, missed: true, effect };
  const crit = rng() < critChance(attacker);
  const base = (((2 * attacker.level) / 5 + 2) * movePower(move, attacker, target) * (attacker.atk / target.dfn)) / 50 + 2;
  const roll = 0.85 + rng() * 0.15;
  const dmg = base * roll * effect * speedBonus(attacker, target) * (crit ? 1.5 : 1);
  return { damage: Math.max(1, Math.floor(dmg)), crit, missed: false, effect };
}

export interface RewardDef {
  id: string;
  name: string;
  desc: string;
  /** frame in de ui-atlas; '{hero}' wordt vervangen door de id van je character */
  icon: string;
  apply: (f: Fighter) => string; // geeft het bericht terug
  /** false = niet aanbieden (bijv. stat staat al op +6) */
  available?: (f: Fighter) => boolean;
  /** true = geeft een stat stage (niet aangeboden na een zone-boss, want die worden gereset) */
  stage?: boolean;
}

/** Geen stat-rewards meer: met een team van 3 waren die te zwak. Stats komen nu uit moves en passives. */
export const REWARDS: RewardDef[] = [
  { id: 'rings', name: 'Ring Bundle', desc: 'Heal 50% HP', icon: 'monitor_ring10',
    apply: f => { const h = Math.min(f.maxHp - f.hp, Math.ceil(f.maxHp / 2)); f.hp += h; return `${f.name} healed ${h} HP!`; } },
  { id: 'thunder', name: 'Boost Charge', desc: 'Boost +3', icon: 'monitor_thunder',
    apply: f => { f.gainBoost(3); return `${f.name}'s Boost was charged!`; } },
  { id: 'oneup', name: '1-Up', desc: 'Heal 100% HP', icon: 'oneup_{hero}',
    apply: f => { const h = f.maxHp - f.hp; f.hp = f.maxHp; return `1-Up! ${f.name} healed ${h} HP!`; } },
];
