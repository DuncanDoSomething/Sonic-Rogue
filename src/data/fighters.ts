// ---------------------------------------------------------------------------
// Fighters, moves en rewards. Alles wat "balans" is staat hier, zodat je
// getallen kunt tweaken zonder de battle-code aan te raken.
// ---------------------------------------------------------------------------

/** Hoe een move er in beeld uitziet. Player-moves en badnik-moves hebben eigen stijlen. */
export type MoveAnim =
  | 'spin' | 'homing' | 'dash' | 'punch' | 'fly'   // team
  | 'glide' | 'hammer' | 'twirl' | 'heal' | 'ultimate'
  | 'spear' | 'chaos'                               // Shadow
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
/** Wie KO gaat, blijft KO tot de zone-boss verslagen is; dan staat hij weer op met dit deel van zijn HP. */
export const BOSS_REVIVE_HP = 0.5;
/**
 * Exp Share: na wave 10 krijgt de bank 50% van de EXP, na wave 20 80%.
 * Bewust nooit 100%: wie vecht, levelt het snelst.
 */
export const EXP_SHARE_STEPS: Array<[number, number]> = [[10, 0.5], [20, 0.8]];
/** Deel van de EXP dat teamleden op de bank krijgen, als je wave `cleared` net gehaald hebt. */
export function expShareAfter(cleared: number) {
  return EXP_SHARE_STEPS.reduce((rate, [wave, r]) => (cleared >= wave ? r : rate), 0);
}

// ---------------------------------------------------------------- passives
export type PassiveId = 'speedster' | 'weakSpot' | 'flinch' | 'luckySwing' | 'chaoCare' | 'rampage';
export interface PassiveDef { id: PassiveId; name: string; desc: string; }
export const PASSIVES: Record<PassiveId, PassiveDef> = {
  speedster:  { id: 'speedster', name: 'Sonic Speed', desc: '+1 SPD after every KO. Hits harder the faster he is than the foe (up to +75%).' },
  weakSpot:   { id: 'weakSpot', name: 'Weak Spot', desc: 'Stunned foes take 2x damage from Tails.' },
  flinch:     { id: 'flinch', name: 'Iron Fists', desc: 'His stat raises are doubled. Hits can make the foe flinch (20%). Once per zone he survives a KO with 1 HP.' },
  luckySwing: { id: 'luckySwing', name: 'Lucky Swing', desc: '+25% crit chance per ATK stage. Crits cost her 10% max HP (not with Hammer Twirl).' },
  chaoCare:   { id: 'chaoCare', name: 'Chao Care', desc: 'If Cream is on the field when a wave starts, the whole team heals 10% HP.' },
  rampage:    { id: 'rampage', name: 'Rampage', desc: 'Every time one of his moves becomes free again, his ATK and SPD rise by 1.' },
};
export const FLINCH_CHANCE = 0.2;
export const WEAK_SPOT_BONUS = 2;
/** Lucky Swing: elke crit kost Amy zoveel van haar max-HP (zoals een Life Orb). Ze houdt altijd 1 HP over. */
export const CRIT_RECOIL = 0.1;
export const CHAO_CARE_HEAL = 0.1;
export const BASE_CRIT = 0.0625;

// ---------------------------------------------------------------- Shadow
/** Chaos Spear: het doelwit krijgt zoveel extra schade, een paar beurten lang. */
export const PIERCE_BONUS = 1.5;
/** Super Shadow: zolang hij super is, krijgt Shadow zelf zoveel extra schade. */
export const SUPER_VULNERABLE = 1.33;
/** Zo vaak achter elkaar kan Super Shadow Barrage weer gratis worden door een KO. */
export const ULT_CHAIN_MAX = 3;

/** Sonic Speed: x1 bij gelijke snelheid, +25% per keer zo snel, max +75%. */
export const SPEED_BONUS_CAP = 1.75;
export function speedBonus(attacker: Fighter, target: Fighter) {
  if (attacker.def.passive?.id !== 'speedster') return 1;
  const ratio = attacker.spd / Math.max(1, target.spd);
  return Math.min(SPEED_BONUS_CAP, Math.max(1, 1 + 0.25 * (ratio - 1)));
}

/** Critical-kans: 1/16, plus Lucky Swing (Amy). */
export function critChance(attacker: Fighter) {
  const bonus = attacker.def.passive?.id === 'luckySwing' ? 0.25 * Math.max(0, attacker.stage('atk')) : 0;
  // Super Shadow: 100% crit zolang hij super is
  if (attacker.superTurns > 0) return 1;
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
  /**
   * 'speed' = power hangt af van hoeveel sneller je bent dan het doelwit (zie speedPower).
   * 'stages' = power stijgt met elke stat stage van de gebruiker, plus of min (zie stagesPower).
   */
  scaling?: 'speed' | 'stages';
  /** Boost-kosten (0 = gratis). Gratis moves geven juist Boost: zie `boostGain`. */
  cost?: number;
  boostGain?: number;
  /** Stat stages die de gebruiker krijgt als de move raakt (bijv. Homing Attack: SPD +1). */
  selfStages?: Partial<Record<StageKey, number>>;
  /** Doelwit kan 1..n beurten niets doen: [min, max]. */
  stun?: [number, number];
  /** Stun werkt maar één keer per gevecht (daarna doet de move alleen schade). */
  stunOnce?: boolean;
  /** De volgende n aanvallen op de gebruiker missen gegarandeerd. */
  evade?: number;
  /** Altijd een critical hit. */
  alwaysCrit?: boolean;
  /** Staat de crit-kans al op 100%, dan is de power dubbel (Tornado Hammer). */
  critDouble?: boolean;
  /** Chaos Spear: het doelwit krijgt n beurten lang PIERCE_BONUS extra schade. */
  pierce?: number;
  /** Super Shadow: n beurten lang 100% crit, maar ook SUPER_VULNERABLE extra schade krijgen. */
  superTurns?: number;
  /** Wordt weer gratis na een KO (Chaos Control: elke KO; de ultimate: als hij zelf de KO maakt). */
  resets?: 'anyKo' | 'ownKo';
  /** Genees-move die je ook op een teamgenoot kunt gebruiken (je kiest wie). */
  ally?: boolean;
  /** Geneest het hele team met dit deel van hun max-HP (en doet geen schade). */
  teamHeal?: number;
  /** Haalt het zone-effect weg tot de zone-boss verslagen is. */
  clearField?: boolean;
  /** Na gebruik verliest de gebruiker dit deel van zijn max-HP (kan hem KO slaan). */
  recoil?: number;
  /** Na gebruik zijn alle stat stages van de gebruiker weer 0 (Maximum Heat). */
  spendStages?: boolean;
  /** Geneest de gebruiker met dit deel van zijn max-HP als de move raakt (Hammer Twirl). */
  selfHeal?: number;
}

export const MOVES: Record<string, MoveDef> = {
  // --- team
  spinAttack:   { id: 'spinAttack', name: 'Spin Attack', power: 40, accuracy: 95, priority: 0, anim: 'spin', boostGain: 1, desc: 'Curls into a ball and rolls into the foe.' },
  homingAttack: { id: 'homingAttack', name: 'Homing Attack', power: 30, accuracy: 100, priority: 1, anim: 'homing', cost: 1, selfStages: { spd: 1 }, desc: 'Locks on and strikes first. Raises SPD by 1.' },
  spinDash:     { id: 'spinDash', name: 'Spin Dash', power: 70, scaling: 'speed', accuracy: 100, priority: 0, anim: 'dash', cost: 2, desc: 'Revs up and launches. The faster Sonic is than the foe, the harder it hits (50-150).' },
  glovePunch:   { id: 'glovePunch', name: 'Glove Punch', power: 70, accuracy: 100, priority: 0, anim: 'punch', cost: 3, stun: [2, 2], desc: 'Spring-loaded boxing gloves. Stuns the foe for 2 turns.' },
  glideAttack:  { id: 'glideAttack', name: 'Glide Attack', power: 45, accuracy: 100, priority: 0, anim: 'glide', cost: 1, selfStages: { atk: 1, def: -1 }, desc: 'Glides in fists first. Raises ATK by 1, lowers DEF by 1.' },
  drillPunch:   { id: 'drillPunch', name: 'Knuckle Punch', power: 80, accuracy: 100, priority: 1, anim: 'punch', cost: 3, desc: 'A full-power punch from the strongest fists on Angel Island. Always strikes first.' },
  flutterDive:  { id: 'flutterDive', name: 'Flutter Dive', power: 30, accuracy: 100, priority: 1, anim: 'fly', cost: 1, desc: 'Flaps her ears, flies up and dives. Always strikes first.' },
  chaoCheer:    { id: 'chaoCheer', name: 'Chao Cheer', power: 0, accuracy: 100, priority: 0, anim: 'heal', heal: 0.3, ally: true, cost: 3, desc: 'Heals 30% max HP. Use it on Cream or on a teammate.' },
  hammerSmash:  { id: 'hammerSmash', name: 'Piko Hammer', power: 60, accuracy: 100, priority: 0, anim: 'hammer', cost: 2, selfStages: { atk: 1 }, desc: 'Swings her Piko Piko Hammer down on the foe. Raises ATK by 1.' },
  hammerTwirl:  { id: 'hammerTwirl', name: 'Hammer Twirl', power: 80, accuracy: 100, priority: 0, anim: 'twirl', cost: 3, selfHeal: 0.25, desc: 'Spins around with her hammer out and heals 25% of her max HP.' },
  chaosSpear:   { id: 'chaosSpear', name: 'Chaos Spear', power: 50, accuracy: 100, priority: 0, anim: 'spear', cost: 3, pierce: 3, desc: 'Hurls spears of chaos energy. The foe takes 50% more damage for 3 turns.' },
  chaosControl: { id: 'chaosControl', name: 'Chaos Control', power: 100, accuracy: 100, priority: 0, anim: 'chaos', cost: 4, resets: 'anyKo', desc: 'Stops time and strikes freely. Becomes free once after every KO Shadow lands.' },
  copterDive:   { id: 'copterDive', name: 'Copter Dive', power: 50, accuracy: 100, priority: 1, anim: 'fly', cost: 1, desc: 'Rises on spinning tails, flips over and drills down on the foe. Always strikes first.' },
  // --- ultimates (kosten de hele Boost-meter, geleerd op ULTIMATE_LEVEL)
  lightSpeed:   { id: 'lightSpeed', name: 'Light Speed Atk', power: 150, accuracy: 100, priority: 1, anim: 'ultimate', cost: MAX_BOOST, evade: 2, selfStages: { spd: 3 }, desc: 'Homing attacks faster than light. Raises SPD by 3, and the foe misses its next 2 attacks on Sonic.' },
  thunderShoot: { id: 'thunderShoot', name: 'Thunder Shoot', power: 80, accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, stun: [3, 3], desc: 'Fires himself like a lightning bolt and stuns the foe for 3 turns.' },
  maximumHeat:  { id: 'maximumHeat', name: 'Maximum Heat', power: 100, scaling: 'stages', accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, spendStages: true, desc: 'A meteor dive. +25 power for every stat stage Knuckles has, up or down; uses them all up.' },
  chaoAttack:   { id: 'chaoAttack', name: 'Chao Blessing', power: 0, accuracy: 100, priority: 1, anim: 'heal', teamHeal: 1, clearField: true, cost: MAX_BOOST, desc: 'Cheese and friends heal the whole team to full HP and clear the zone effect. No damage.' },
  tornadoHammer:{ id: 'tornadoHammer', name: 'Tornado Hammer', power: 120, accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, alwaysCrit: true, critDouble: true, recoil: 0.5, desc: 'A hammer storm. Always crits; doubles at 100% crit chance. Costs Amy 50% max HP (KO if below half).' },
  superBarrage: { id: 'superBarrage', name: 'Super Barrage', power: 100, accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, alwaysCrit: true, superTurns: 3, resets: 'ownKo', desc: 'Goes Super and unloads a barrage. Always crits, then 100% crit for 3 turns, but he takes 33% more damage. A KO makes it free again (3x in a row).' },
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
  /** Boost die Spin Attack hem geeft (standaard de boostGain van de move, 1) */
  spinGain?: number;
}

export const FIGHTERS: Record<string, FighterDef> = {
  // ------------------------------------------------------------- team
  sonic: {
    type: 'speed', ultimate: 'lightSpeed', passive: PASSIVES.speedster,
    id: 'sonic', name: 'Sonic', atlas: 'sonic', animPrefix: 'sonic', scale: 2,
    // HP en SPD omgedraaid: Sonic is veruit de snelste, ook als basis-stat
    base: { hp: 18, atk: 12, def: 7, spd: 21 },
    growth: { hp: 2.3, atk: 2.0, def: 1.1, spd: 2.8 },
    moves: ['spinAttack', 'homingAttack', 'spinDash'],
    expYield: 20, // alleen als rival
  },
  tails: {
    type: 'fly', ultimate: 'thunderShoot', passive: PASSIVES.weakSpot,
    id: 'tails', name: 'Tails', atlas: 'tails', animPrefix: 'tails', scale: 2,
    base: { hp: 26, atk: 10, def: 8, spd: 16 },
    growth: { hp: 3.4, atk: 1.8, def: 1.3, spd: 1.9 },
    moves: ['spinAttack', 'copterDive', 'glovePunch'],
    expYield: 20, // alleen als rival
  },
  knuckles: {
    type: 'power', ultimate: 'maximumHeat', passive: PASSIVES.flinch,
    id: 'knuckles', name: 'Knuckles', atlas: 'knuckles', animPrefix: 'knuckles', scale: 2,
    base: { hp: 28, atk: 15, def: 10, spd: 7 },
    growth: { hp: 3.6, atk: 2.4, def: 1.6, spd: 1.1 },
    moves: ['spinAttack', 'glideAttack', 'drillPunch'],
    expYield: 20, // alleen als rival
  },
  cream: {
    type: 'fly', ultimate: 'chaoAttack', passive: PASSIVES.chaoCare,
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
  shadow: {
    type: 'speed', ultimate: 'superBarrage', passive: PASSIVES.rampage, spinGain: 2,
    id: 'shadow', name: 'Shadow', atlas: 'shadow', animPrefix: 'shadow', scale: 2,
    // net iets trager dan Sonic, en harder
    base: { hp: 20, atk: 14, def: 8, spd: 17 },
    growth: { hp: 2.6, atk: 2.2, def: 1.2, spd: 2.2 },
    moves: ['spinAttack', 'chaosSpear', 'chaosControl'],
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
export const HEROES = ['sonic', 'tails', 'knuckles', 'cream', 'amy', 'shadow'];

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
  /** Aantal beurten dat hij nog verdoofd is (Glove Punch, Thunder Shoot). */
  stun = 0;
  /** Aantal aanvallen op hem die nog gegarandeerd missen (Light Speed Attack). */
  evade = 0;
  /** Iron Fists (Knuckles): al een keer met 1 HP blijven staan deze zone. */
  sashUsed = false;
  /** Move Chip (reward): Spin Attack heeft +MOVE_CHIP_POWER power. */
  spinChip = false;
  /** Shadow: Chaos Control is gratis (na een KO). */
  chaosFree = false;
  /** Shadow: de ultimate is gratis (hij maakte er een KO mee), en hoe vaak achter elkaar. */
  ultFree = false;
  ultChain = 0;
  /** Chaos Spear: beurten dat hij PIERCE_BONUS extra schade krijgt. */
  pierced = 0;
  /** Super Shadow: beurten met 100% crit en SUPER_VULNERABLE extra schade. */
  superTurns = 0;
  /** net gezet: de teller loopt pas vanaf de volgende beurt (zo krijg je echt n hele beurten) */
  freshTurns = new Set<'pierced' | 'superTurns'>();

  constructor(id: string, level: number) {
    this.def = FIGHTERS[id];
    this.level = level;
    this.hp = this.maxHp;
  }

  get name() { return this.def.name; }
  anim(name: string) {
    // Super Shadow: zolang hij super is, staat hij als Super Shadow te zweven
    if (this.superTurns > 0 && this.def.id === 'shadow' && (name === 'idle' || name === 'wait')) return 'ssh_idle';
    return `${this.def.animPrefix}_${name}`;
  }
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
  /** Is deze move nu gratis (Chaos Control na een KO, Super Shadow na een KO met de ultimate)? */
  isFree(m: MoveDef) {
    return (m.id === 'chaosControl' && this.chaosFree) || (m.id === this.def.ultimate && this.ultFree);
  }
  /** Wat de move nu kost (0 als hij gratis is). */
  costOf(m: MoveDef) { return this.isFree(m) ? 0 : m.cost ?? 0; }
  /** Boost die de move oplevert (Shadow's Spin Attack: +2). */
  gainOf(m: MoveDef) { return m.id === 'spinAttack' && this.def.spinGain ? this.def.spinGain : m.boostGain ?? 0; }
  canUse(m: MoveDef) { return this.costOf(m) <= this.boost; }
  spendBoost(m: MoveDef) {
    const cost = this.costOf(m);
    // een gratis move is daarna weer gewoon te betalen
    if (this.isFree(m)) { if (m.id === 'chaosControl') this.chaosFree = false; else this.ultFree = false; }
    this.boost = Math.max(0, Math.min(MAX_BOOST, this.boost - cost + this.gainOf(m)));
  }
  /** Einde van een beurt: tellers van Chaos Spear en Super Shadow aflopen. Geeft terug wat er net afliep. */
  tickTurns(): Array<'pierced' | 'superTurns'> {
    const ended: Array<'pierced' | 'superTurns'> = [];
    for (const k of ['pierced', 'superTurns'] as const) {
      if (this.freshTurns.has(k)) { this.freshTurns.delete(k); continue; }
      if (this[k] > 0) { this[k]--; if (this[k] === 0) ended.push(k); }
    }
    return ended;
  }
  gainBoost(n: number) { this.boost = Math.min(MAX_BOOST, this.boost + n); }
  /** Verhoogt/verlaagt een stage. Geeft het bericht terug (of dat hij al op max/min zit). */
  raise(k: StageKey, by = 1): string {
    // Fired Up (Knuckles): stat-verhogingen tellen dubbel
    if (by > 0 && this.def.passive?.id === 'flinch') by *= 2;
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
/** Maximum Heat: +25 power per stat stage, of die nu omhoog of omlaag staat (max 300). */
export const STAGES_POWER_STEP = 25;
export const STAGES_POWER_MAX = 300;
export function stagesPower(base: number, user: Fighter) {
  const total = (['atk', 'def', 'spd', 'acc'] as StageKey[]).reduce((n, k) => n + Math.abs(user.stage(k)), 0);
  return Math.min(STAGES_POWER_MAX, base + STAGES_POWER_STEP * total);
}
/** De echte power van een move tegen dit doelwit. */
export const MOVE_CHIP_POWER = 30;
export function movePower(m: MoveDef, user: Fighter, target?: Fighter) {
  if (m.scaling === 'speed' && target) return speedPower(user.spd, target.spd);
  if (m.scaling === 'stages') return stagesPower(m.power, user);
  if (m.id === 'spinAttack' && user.spinChip) return m.power + MOVE_CHIP_POWER;
  return m.power;
}

export interface HitResult { damage: number; crit: boolean; missed: boolean; effect: number; }

/** Pokémon-achtige damage-formule, versimpeld. */
export function calcHit(attacker: Fighter, target: Fighter, move: MoveDef, rng: () => number = Math.random, bonusCrit = 0): HitResult {
  const effect = typeMultiplier(attacker.type, target.type);
  // ultimates (hele Boost-meter) raken altijd, ook met een ACC-verlaging; andere moves niet
  const ultimate = (move.cost ?? 0) >= MAX_BOOST;
  const accuracy = move.accuracy * stageMultiplier(attacker.stage('acc'));
  if (!ultimate && rng() * 100 >= accuracy) return { damage: 0, crit: false, missed: true, effect };
  const chance = Math.min(1, critChance(attacker) + bonusCrit);
  const crit = rng() < chance || !!move.alwaysCrit;
  // Tornado Hammer: crit-kans al op 100%? Dan dubbele power
  const power = movePower(move, attacker, target) * (move.critDouble && chance >= 1 ? 2 : 1);
  const base = (((2 * attacker.level) / 5 + 2) * power * (attacker.atk / target.dfn)) / 50 + 2;
  const roll = 0.85 + rng() * 0.15;
  // Weak Spot (Tails): verdoofde vijanden krijgen extra schade
  const weakSpot = attacker.def.passive?.id === 'weakSpot' && target.stun > 0 ? WEAK_SPOT_BONUS : 1;
  // Chaos Spear en Super Shadow: het doelwit krijgt meer schade
  const exposed = (target.pierced > 0 ? PIERCE_BONUS : 1) * (target.superTurns > 0 ? SUPER_VULNERABLE : 1);
  const dmg = base * roll * effect * speedBonus(attacker, target) * weakSpot * exposed * (crit ? 1.5 : 1);
  return { damage: Math.max(1, Math.floor(dmg)), crit, missed: false, effect };
}

// Rewards staan in rewards.ts.
