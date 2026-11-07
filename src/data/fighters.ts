// ---------------------------------------------------------------------------
// Fighters, moves en rewards. Alles wat "balans" is staat hier, zodat je
// getallen kunt tweaken zonder de battle-code aan te raken.
// ---------------------------------------------------------------------------

/** Hoe een move er in beeld uitziet. Player-moves en badnik-moves hebben eigen stijlen. */
export type MoveAnim =
  | 'spin' | 'homing' | 'dash' | 'punch' | 'fly'   // team
  | 'glide' | 'hammer' | 'twirl' | 'heal' | 'chao' | 'ultimate'
  | 'spear' | 'chaos'                               // Shadow
  | 'missile' | 'bomb' | 'laugh'                    // Eggman
  | 'shoot' | 'tackle' | 'lash' | 'slam' | 'charge'; // badniks

// ---------------------------------------------------------------- types
/** Speed / Fly / Power, zoals de teams in Advance 3 en Heroes. Fly > Power > Speed > Fly. */
export type FighterType = 'speed' | 'fly' | 'power';
export const FIGHTER_TYPES: FighterType[] = ['speed', 'fly', 'power'];
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
export const EXP_SHARE_STEPS: Array<[number, number]> = [[10, 0.3], [20, 0.5]];
/** Deel van de EXP dat teamleden op de bank krijgen, als je wave `cleared` net gehaald hebt. */
/** Elke Chaos Emerald geeft het team op de bank zoveel extra EXP (bovenop de Exp. Share). */
export const EMERALD_EXP_BONUS = 0.05;
/** Deel van de EXP voor de bank: Exp. Share plus de emeralds (nooit meer dan 100%). */
export function benchExpRate(expShare: number, emeralds: number) {
  return Math.min(1, expShare + EMERALD_EXP_BONUS * emeralds);
}
export function expShareAfter(cleared: number) {
  return EXP_SHARE_STEPS.reduce((rate, [wave, r]) => (cleared >= wave ? r : rate), 0);
}

// ---------------------------------------------------------------- passives
export type PassiveId = 'speedster' | 'weakSpot' | 'flinch' | 'luckySwing' | 'chaoCare' | 'lifeform';
export interface PassiveDef { id: PassiveId; name: string; desc: string; }
export const PASSIVES: Record<PassiveId, PassiveDef> = {
  speedster:  { id: 'speedster', name: 'Sonic Speed', desc: '+1 SPD after every KO. The faster he is than the foe, the harder he hits (+25% per time as fast, up to +50%) and the more attacks he dodges (up to 35%).' },
  weakSpot:   { id: 'weakSpot', name: 'Weak Spot', desc: 'Stunned foes take 2x damage from Tails.' },
  flinch:     { id: 'flinch', name: 'Iron Fists', desc: 'His stat raises are doubled. Hits can make the foe flinch (20%). Once per zone he survives a KO with 1 HP, if he had more than half his HP.' },
  luckySwing: { id: 'luckySwing', name: 'Lucky Swing', desc: '+33% crit chance per ATK stage, and at ATK +6 her crits do 2x damage. She keeps her ATK raises when she switches out. Crits cost her 5% max HP (not with Hammer Twirl).' },
  chaoCare:   { id: 'chaoCare', name: 'Chao Care', desc: 'When a wave starts, the whole team heals 10% HP if Cream is on the field, or 5% if she is on the bench.' },
  lifeform:   { id: 'lifeform', name: 'Ultimate Lifeform', desc: 'Zone effects and stat drops don\'t affect him. Every KO he lands gives him 1 Boost.' },
};
export const FLINCH_CHANCE = 0.2;
/** Iron Fists: met 1 HP blijven staan werkt alleen als hij vóór de klap meer dan dit deel van zijn HP had. */
export const SASH_MIN_HP = 0.5;
/** Ultimate Lifeform (Shadow): zoveel Boost per KO die hij maakt. */
export const LIFEFORM_KO_BOOST = 1;
export const WEAK_SPOT_BONUS = 2;
/** Lucky Swing: elke crit kost Amy zoveel van haar max-HP (zoals een Life Orb). Ze houdt altijd 1 HP over. */
export const CRIT_RECOIL = 0.05;
export const CHAO_CARE_HEAL = 0.1;
/** Chao Care vanaf de bank: zwakker dan in het veld. */
export const CHAO_CARE_BENCH = 0.05;
export const BASE_CRIT = 0.0625;

// ---------------------------------------------------------------- badnik-eigenschappen
/**
 * Elke badnik speelt anders: een vaste eigenschap (trait) per soort. Moves met een bijeffect
 * (gif, bevriezen, Boost stelen) staan bij de moves zelf.
 */
export type TraitId = 'hardShell' | 'charger' | 'spikes' | 'piggyBank' | 'shellUp';
export interface TraitDef { id: TraitId; name: string; desc: string; }
export const TRAITS: Record<TraitId, TraitDef> = {
  hardShell: { id: 'hardShell', name: 'Hard Shell', desc: 'The first hit on it only does half damage.' },
  charger:   { id: 'charger', name: 'Charge', desc: 'Every few turns it charges up. Its next attack does double damage.' },
  spikes:    { id: 'spikes', name: 'Spikes', desc: 'Hitting it hurts: you take 1/8 of the damage you deal (it never KOs you).' },
  piggyBank: { id: 'piggyBank', name: 'Piggy Bank', desc: 'Its DEF rises every turn (up to +4), so hit it hard and fast. Drops double rings.' },
  shellUp:   { id: 'shellUp', name: 'Shell Up', desc: 'When a shield breaks it hides in its shell (next hit does half) and charges up a Tank Slam that does 1.5x damage.' },
};
/** Hard Shell / Shell Up: zoveel schade komt er door de schelp. */
export const SHELL_FACTOR = 0.5;
/** Spikes: de aanvaller krijgt dit deel van zijn schade terug. */
export const SPIKE_RECOIL = 1 / 8;
/** Charge: op beurt 2, 5, 8 ... laadt hij op; de aanval erna doet dubbele schade. */
export const CHARGE_EVERY = 3;
export const CHARGE_MULT = 2;
/** Opgeladen schade per eigenschap (Shell Tank's Tank Slam kan anders zijn dan Copter Octo). */
// Shell Tank laadt 3x op (bij elk schild), dus zijn Tank Slam is "maar" x1,5 (sim: x2 maakte de zone-boss te zwaar)
export const CHARGE_MULTS: Partial<Record<TraitId, number>> = { charger: CHARGE_MULT, shellUp: 1.5 };
export function chargeMult(f: Fighter) { return (f.def.trait && CHARGE_MULTS[f.def.trait]) || CHARGE_MULT; }
/** Gif (Sting Shot): elke beurt dit deel van je max-HP, zoveel beurten. */
export const POISON_FRAC = 1 / 16;

/** Elites krijgen een random extra eigenschap (staat op het label: "ARMORED ELITE"). */
export type EliteId = 'armored' | 'enraged' | 'regen' | 'swift';
export interface EliteDef { id: EliteId; name: string; desc: string; }
export const ELITE_TRAITS: Record<EliteId, EliteDef> = {
  armored: { id: 'armored', name: 'Armored', desc: 'Has 2 shields, like a boss.' },
  enraged: { id: 'enraged', name: 'Enraged', desc: 'Its ATK rises every turn.' },
  regen:   { id: 'regen', name: 'Regenerating', desc: 'Heals 8% of its HP every turn, up to half its HP in total.' },
  swift:   { id: 'swift', name: 'Swift', desc: 'Starts with SPD +2.' },
};
export const ELITE_IDS = Object.keys(ELITE_TRAITS) as EliteId[];
export const ELITE_REGEN = 0.08;
/** Regenerating geneest per gevecht nooit meer dan dit deel van zijn HP (anders kan een zwak team vast komen te zitten). */
export const ELITE_REGEN_TOTAL = 0.5;
/** Piggy Bank: DEF stijgt elke beurt, tot deze stage. */
export const PIGGY_MAX_DEF = 4;
export const ELITE_ARMOR_SHIELDS = 2;

// ---------------------------------------------------------------- Shadow
/** Chaos Spear: het doelwit krijgt zoveel extra schade, een paar beurten lang. */
export const PIERCE_BONUS = 1.5;
/** Chao Blessing (Cream's ultimate): +50% schade voor het hele team, de volgende 5 beurten. Gevallen teamgenoten staan op met 50% HP. */
export const BLESS_BONUS = 0.5;
export const BLESS_TURNS = 5;
export const BLESS_REVIVE = 0.5;
/** Super Barrage: zolang de Super-kracht duurt, krijgt Shadow zelf dubbele schade. */
export const SUPER_VULNERABLE = 2;
/** Zo vaak achter elkaar kan Super Shadow Barrage weer gratis worden door een KO. */
export const ULT_CHAIN_MAX = 2;

/** Sonic Speed: x1 bij gelijke snelheid, +25% per keer zo snel, max +50% (2x zo snel = +25%, 3x = +50%). */
export const SPEED_BONUS_PER_RATIO = 0.25;
export const SPEED_BONUS_CAP = 1.5;
/** (de sim zet deze om varianten te testen) */
export const PASSIVE_TUNING = { perRatio: SPEED_BONUS_PER_RATIO, cap: SPEED_BONUS_CAP };
export function speedBonus(attacker: Fighter, target: Fighter) {
  if (attacker.def.passive?.id !== 'speedster') return 1;
  const ratio = attacker.spd / Math.max(1, target.spd);
  return Math.min(PASSIVE_TUNING.cap, Math.max(1, 1 + PASSIVE_TUNING.perRatio * (ratio - 1)));
}

/**
 * Sonic Speed: hoe sneller Sonic is dan de aanvaller, hoe vaker hij ontwijkt.
 * 0% bij gelijke snelheid, +15% per keer zo snel, max 35% (dus 2x zo snel = 15%, 3x = 30%).
 */
export const DODGE_PER_RATIO = 0.15;
export const DODGE_CAP = 0.35;
export function dodgeChance(target: Fighter, attacker: Fighter) {
  if (target.def.passive?.id !== 'speedster') return 0;
  const ratio = target.spd / Math.max(1, attacker.spd);
  return Math.min(DODGE_CAP, Math.max(0, DODGE_PER_RATIO * (ratio - 1)));
}

/** Critical-kans: 1/16, plus Lucky Swing (Amy). */
/** Lucky Swing (Amy): crit-kans per ATK-stage, en bij ATK +6 doen haar crits zoveel schade. */
export const LUCKY_PER_STAGE = 0.33;
export const LUCKY_MAX_CRIT = 2;
export const CRIT_MULT = 1.5;
export function critMult(attacker: Fighter) {
  return attacker.def.passive?.id === 'luckySwing' && attacker.stage('atk') >= 6 ? LUCKY_MAX_CRIT : CRIT_MULT;
}
export function critChance(attacker: Fighter) {
  const bonus = attacker.def.passive?.id === 'luckySwing' ? LUCKY_PER_STAGE * Math.max(0, attacker.stage('atk')) : 0;
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
  /** Super Shadow: n beurten 100% crit en SUPER_VULNERABLE schade krijgen (de beurt van de ultimate telt mee). */
  superTurns?: number;
  /** Wordt weer gratis na een KO (Chaos Control: elke KO; de ultimate: als hij zelf de KO maakt). */
  resets?: 'anyKo' | 'ownKo';
  /** Genees-move die je ook op een teamgenoot kunt gebruiken (je kiest wie). */
  ally?: boolean;
  /** Geneest het hele team met dit deel van hun max-HP (en doet geen schade). */
  teamHeal?: number;
  /** Haalt het zone-effect weg tot de zone-boss verslagen is. */
  clearField?: boolean;
  /** Chao Blessing: gevallen teamgenoten staan weer op met dit deel van hun max-HP. */
  revive?: number;
  /** Chao Blessing: je team doet de volgende BLESS_TURNS beurten BLESS_BONUS meer schade. */
  blessing?: boolean;
  /** Chao Cheer: wie er geneest wordt krijgt ook zoveel Boost. */
  allyBoost?: number;
  /** Homing Attack: gratis (de Boost komt terug) als hij een gewone vijand KO slaat, niet een boss of rival. */
  refundOnKo?: boolean;
  /** Copter Dive: een verdoofd doelwit blijft zoveel beurten langer verdoofd (één keer per gevecht); anders SPD -1. */
  extendStun?: number;
  /** Stat stages die het doelwit krijgt als de move raakt (Chao Attack: ATK -1). */
  targetStages?: Partial<Record<StageKey, number>>;
  /** Na gebruik verliest de gebruiker dit deel van zijn max-HP (kan hem KO slaan). */
  recoil?: number;
  /** Na gebruik zijn alle stat stages van de gebruiker weer 0 (Maximum Heat). */
  spendStages?: boolean;
  /** Geneest de gebruiker met dit deel van zijn max-HP als de move raakt (Hammer Twirl). */
  selfHeal?: number;
  /** Kans dat targetStages gebeurt (standaard altijd). */
  targetChance?: number;
  /** Badnik: steelt zoveel Boost als hij raakt (en je krijgt geen Boost voor de klap). */
  drainBoost?: number;
  /** Badnik: vergiftigt het doelwit zoveel beurten (POISON_FRAC per beurt). */
  poison?: number;
  /** Badnik: kans om het doelwit 1 beurt te bevriezen (één keer per gevecht). */
  freezeChance?: number;
  /** Badnik: laadt op in plaats van aan te vallen; de volgende aanval doet CHARGE_MULT schade. */
  charge?: boolean;
  /** 'speed'-power met een eigen tabel (Homing Attack 40-80), anders SPEED_POWER. */
  speedTable?: Array<[number, number]>;
  /** Negeert de DEF-boosts van het doelwit (Spin Dash). */
  ignoreDefBoost?: boolean;
  /** Kans op nog een gratis klap met dezelfde move (Homing Attack), één keer per beurt. */
  extraHit?: number;
  /** Korte naam van het bijeffect, voor het label onder de vijand-box ("POISON"). */
  tag?: string;
}

export const MOVES: Record<string, MoveDef> = {
  // --- team
  spinAttack:   { id: 'spinAttack', name: 'Spin Attack', power: 40, accuracy: 95, priority: 0, anim: 'spin', boostGain: 1, desc: 'Curls into a ball and rolls into the foe.' },
  homingAttack: { id: 'homingAttack', name: 'Homing Attack', power: 50, scaling: 'speed', speedTable: [[4, 80], [3, 70], [2, 60], [1, 50], [0, 40]], accuracy: 100, priority: 1, anim: 'homing', cost: 1, selfStages: { spd: 1 }, extraHit: 0.5, desc: 'Locks on and strikes first. Raises SPD by 1. Hits harder the faster Sonic is (40-80). 50% chance to home in for a second hit.' },
  spinDash:     { id: 'spinDash', name: 'Spin Dash', power: 70, scaling: 'speed', accuracy: 100, priority: 0, anim: 'dash', cost: 2, ignoreDefBoost: true, desc: 'Revs up and launches. The faster Sonic is than the foe, the harder it hits (50-150). Ignores the foe\'s DEF boosts.' },
  glovePunch:   { id: 'glovePunch', name: 'Glove Punch', power: 70, accuracy: 100, priority: 0, anim: 'punch', cost: 3, stun: [2, 2], stunOnce: true, desc: 'Pulls a boxing glove out of thin air, swings it on its chain and lets it fly. Stuns the foe for 2 turns (once per fight).' },
  glideAttack:  { id: 'glideAttack', name: 'Glide Attack', power: 45, accuracy: 100, priority: 0, anim: 'glide', cost: 1, selfStages: { atk: 1, def: -1 }, desc: 'Glides in fists first. Raises ATK by 1, lowers DEF by 1.' },
  drillPunch:   { id: 'drillPunch', name: 'Knuckle Punch', power: 80, accuracy: 100, priority: 1, anim: 'punch', cost: 3, desc: 'Rushes in and throws a burning Megaton Hook, the strongest fist on Angel Island. Always strikes first.' },
  cheeseAttack: { id: 'cheeseAttack', name: 'Chao Attack', power: 45, accuracy: 100, priority: 0, anim: 'chao', cost: 1, targetStages: { atk: -1 }, desc: 'Cream sends Cheese flying into the foe as a ball of energy. Lowers the foe\'s ATK by 1.' },
  chaoCheer:    { id: 'chaoCheer', name: 'Chao Cheer', power: 0, accuracy: 100, priority: 0, anim: 'heal', heal: 0.3, allyBoost: 1, ally: true, cost: 2, desc: 'Heals 30% max HP and gives 1 Boost. Use it on Cream or on a teammate.' },
  hammerSmash:  { id: 'hammerSmash', name: 'Piko Hammer', power: 60, accuracy: 100, priority: 0, anim: 'hammer', cost: 1, selfStages: { atk: 1 }, desc: 'Swings her Piko Piko Hammer down on the foe. Raises ATK by 1.' },
  hammerTwirl:  { id: 'hammerTwirl', name: 'Hammer Twirl', power: 80, accuracy: 100, priority: 0, anim: 'twirl', cost: 2, selfHeal: 0.25, desc: 'Spins around with her hammer out and heals 25% of her max HP.' },
  chaosSpear:   { id: 'chaosSpear', name: 'Chaos Spear', power: 50, accuracy: 100, priority: 0, anim: 'spear', cost: 2, pierce: 3, desc: 'Chaos spears hit and mark the foe: it takes 50% more damage from your team for 3 turns.' },
  chaosControl: { id: 'chaosControl', name: 'Chaos Control', power: 100, accuracy: 100, priority: 0, anim: 'chaos', cost: 4, resets: 'anyKo', selfStages: { atk: 1, spd: 1 }, desc: 'Stops time and strikes freely. Raises ATK and SPD by 1. Becomes free once after every KO Shadow lands.' },
  copterDive:   { id: 'copterDive', name: 'Copter Dive', power: 50, accuracy: 100, priority: 1, anim: 'fly', cost: 1, extendStun: 1, desc: 'Drills down on the foe and always strikes first. A stunned foe stays stunned 1 turn longer (once per fight); otherwise lowers its SPD by 1.' },
  // --- ultimates (kosten de hele Boost-meter, geleerd op ULTIMATE_LEVEL)
  lightSpeed:   { id: 'lightSpeed', name: 'Light Speed Atk', power: 150, accuracy: 100, priority: 1, anim: 'ultimate', cost: MAX_BOOST, evade: 2, selfStages: { spd: 3 }, desc: 'Homing attacks faster than light. Raises SPD by 3, and the foe misses its next 2 attacks on Sonic.' },
  thunderShoot: { id: 'thunderShoot', name: 'Thunder Shoot', power: 80, accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, stun: [3, 3], desc: 'Fires himself like a lightning bolt and stuns the foe for 3 turns.' },
  maximumHeat:  { id: 'maximumHeat', name: 'Maximum Heat', power: 100, scaling: 'stages', accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, spendStages: true, desc: 'A meteor dive. +25 power for every stat stage Knuckles has, up or down; uses them all up.' },
  chaoAttack:   { id: 'chaoAttack', name: 'Chao Blessing', power: 0, accuracy: 100, priority: 1, anim: 'heal', teamHeal: 1, revive: BLESS_REVIVE, blessing: true, clearField: true, cost: MAX_BOOST,
    desc: 'Cheese and friends heal the team to full HP, revive fallen teammates with 50% HP and clear the zone effect. Your team then does 50% more damage for 5 turns.' },
  tornadoHammer:{ id: 'tornadoHammer', name: 'Tornado Hammer', power: 120, accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, alwaysCrit: true, critDouble: true, recoil: 0.5, desc: 'A hammer storm. Always crits; doubles at 100% crit chance. Costs Amy 50% max HP (KO if below half).' },
  superBarrage: { id: 'superBarrage', name: 'Super Barrage', power: 100, accuracy: 100, priority: 0, anim: 'ultimate', cost: MAX_BOOST, alwaysCrit: true, superTurns: 3, resets: 'ownKo', desc: 'Goes Super and unloads a barrage. Always crits. For 3 turns: 100% crit, but he takes double damage (a chain does not refresh it). A KO makes it free again (max 2x).' },
  // --- Eggman (main boss)
  eggMissile: { id: 'eggMissile', name: 'Egg Missile', power: 40, accuracy: 95, priority: 0, anim: 'missile', desc: '' },
  eggBomb:    { id: 'eggBomb', name: 'Egg Bomb', power: 60, accuracy: 85, priority: 0, anim: 'bomb', desc: '' },
  eggLaugh:   { id: 'eggLaugh', name: 'Evil Laugh', power: 0, accuracy: 100, priority: 0, anim: 'laugh', selfStages: { atk: 1 }, desc: '' },
  // --- badniks
  stingShot:  { id: 'stingShot', tag: 'POISON', name: 'Sting Shot', power: 34, accuracy: 92, priority: 0, anim: 'shoot', poison: 3, desc: 'Poisons: 1/16 HP per turn for 3 turns.', tint: 0xb06aff },
  snowball:   { id: 'snowball', tag: 'FREEZE', name: 'Snowball', power: 34, accuracy: 95, priority: 0, anim: 'shoot', freezeChance: 0.25, desc: '25% chance to freeze you for 1 turn (once per fight).', tint: 0xffffff },
  drillRam:   { id: 'drillRam', name: 'Drill Ram', power: 42, accuracy: 88, priority: 0, anim: 'tackle', desc: '' },
  sharkRam:   { id: 'sharkRam', tag: 'BOOST DRAIN', name: 'Drill Ram', power: 38, accuracy: 90, priority: 0, anim: 'tackle', drainBoost: 1, desc: 'Steals 1 Boost (and you get no Boost for the hit).' },
  bodyCheck:  { id: 'bodyCheck', name: 'Body Check', power: 32, accuracy: 95, priority: 0, anim: 'tackle', desc: '' },
  bellySlide: { id: 'bellySlide', tag: 'FIRST STRIKE', name: 'Belly Slide', power: 32, accuracy: 95, priority: 1, anim: 'tackle', selfStages: { spd: 1 }, desc: 'Always goes first. Raises its SPD by 1.' },
  chargeUp:   { id: 'chargeUp', name: 'Charge Up', power: 0, accuracy: 100, priority: 0, anim: 'charge', charge: true, desc: 'Its next attack does double damage.' },
  tongueLash: { id: 'tongueLash', tag: 'ATK DOWN', name: 'Tongue Lash', power: 34, accuracy: 95, priority: 0, anim: 'lash', targetStages: { atk: -1 }, desc: 'Lowers your ATK by 1 (until the fight ends).' },
  trumpetBlast:{ id: 'trumpetBlast', tag: 'ACC DOWN', name: 'Trumpet Blast', power: 36, accuracy: 92, priority: 0, anim: 'shoot', targetStages: { acc: -1 }, targetChance: 0.5, desc: '50% chance to lower your ACC by 1 (until the fight ends).', tint: 0xffe070 },
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
  /** vaste eigenschap van een badnik (zie TRAITS) */
  trait?: TraitId;
}

export const FIGHTERS: Record<string, FighterDef> = {
  // ------------------------------------------------------------- team
  sonic: {
    type: 'speed', ultimate: 'lightSpeed', passive: PASSIVES.speedster,
    id: 'sonic', name: 'Sonic', atlas: 'sonic', animPrefix: 'sonic', scale: 2,
    // HP en SPD omgedraaid: Sonic is veruit de snelste, ook als basis-stat
    base: { hp: 21, atk: 12, def: 7, spd: 21 },
    growth: { hp: 2.7, atk: 2.0, def: 1.2, spd: 2.8 },
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
    moves: ['spinAttack', 'cheeseAttack', 'chaoCheer'],
    expYield: 20, // alleen als rival
  },
  amy: {
    type: 'power', ultimate: 'tornadoHammer', passive: PASSIVES.luckySwing,
    id: 'amy', name: 'Amy', atlas: 'amy', animPrefix: 'amy', scale: 2,
    // de harde hitter van het team: veel ATK, iets minder HP en SPD
    base: { hp: 25, atk: 15, def: 8, spd: 11 },
    growth: { hp: 3.3, atk: 2.5, def: 1.3, spd: 1.5 },
    moves: ['spinAttack', 'hammerSmash', 'hammerTwirl'],
    expYield: 20, // alleen als rival
  },
  shadow: {
    type: 'speed', ultimate: 'superBarrage', passive: PASSIVES.lifeform, spinGain: 2,
    id: 'shadow', name: 'Shadow', atlas: 'shadow', animPrefix: 'shadow', scale: 2,
    // net iets trager dan Sonic, en harder
    base: { hp: 20, atk: 14, def: 8, spd: 17 },
    growth: { hp: 2.6, atk: 2.2, def: 1.2, spd: 2.2 },
    moves: ['spinAttack', 'chaosSpear', 'chaosControl'],
    expYield: 20, // alleen als rival
  },
  // ------------------------------------------------------------- badniks
  beetle:   { type: 'fly', id: 'beetle', name: 'Buzz Beetle', atlas: 'badniks', animPrefix: 'beetle', scale: 1.6, facesRight: true, hover: 26,
    base: { hp: 13, atk: 7, def: 5, spd: 11 }, growth: { hp: 2.4, atk: 1.3, def: 0.9, spd: 1.3 }, moves: ['bodyCheck'], expYield: 8, trait: 'hardShell' },
  sharkjet: { type: 'speed', id: 'sharkjet', name: 'Shark Jet', atlas: 'badniks', animPrefix: 'sharkjet', scale: 1.5, hover: 30,
    base: { hp: 12, atk: 8, def: 5, spd: 13 }, growth: { hp: 2.3, atk: 1.4, def: 0.9, spd: 1.4 }, moves: ['sharkRam'], expYield: 9 },
  octo:     { type: 'power', id: 'octo', name: 'Copter Octo', atlas: 'badniks', animPrefix: 'octo', scale: 1.5, hover: 22,
    base: { hp: 15, atk: 7, def: 6, spd: 7 }, growth: { hp: 2.6, atk: 1.3, def: 1.0, spd: 1.0 }, moves: ['drillRam', 'bodyCheck'], expYield: 9, trait: 'charger' },
  frog:     { type: 'speed', id: 'frog', name: 'Ribbit Bot', atlas: 'badniks', animPrefix: 'frog', scale: 1.8,
    base: { hp: 16, atk: 7, def: 7, spd: 6 }, growth: { hp: 2.8, atk: 1.3, def: 1.1, spd: 0.9 }, moves: ['tongueLash'], expYield: 9 },
  bee:      { type: 'fly', id: 'bee', name: 'Buzz Cannon', atlas: 'badniks', animPrefix: 'bee', scale: 1.5, hover: 18,
    base: { hp: 13, atk: 8, def: 5, spd: 10 }, growth: { hp: 2.4, atk: 1.4, def: 0.9, spd: 1.2 }, moves: ['stingShot'], expYield: 9 },
  snowman:  { type: 'power', id: 'snowman', name: 'Snow Bot', atlas: 'badniks', animPrefix: 'snowman', scale: 1.7, facesRight: true,
    base: { hp: 17, atk: 7, def: 6, spd: 5 }, growth: { hp: 2.8, atk: 1.3, def: 1.0, spd: 0.8 }, moves: ['snowball'], expYield: 9 },
  pig:      { type: 'power', id: 'pig', name: 'Piggy Bank', atlas: 'badniks', animPrefix: 'pig', scale: 1.8, facesRight: true,
    base: { hp: 19, atk: 8, def: 7, spd: 6 }, growth: { hp: 3.0, atk: 1.4, def: 1.1, spd: 0.8 }, moves: ['bodyCheck'], expYield: 10, trait: 'piggyBank' },
  soldier:  { type: 'speed', id: 'soldier', name: 'Toy Trooper', atlas: 'badniks', animPrefix: 'soldier', scale: 1.7, facesRight: true,
    base: { hp: 15, atk: 9, def: 6, spd: 9 }, growth: { hp: 2.6, atk: 1.5, def: 1.0, spd: 1.2 }, moves: ['trumpetBlast'], expYield: 10 },
  penguin:  { type: 'speed', id: 'penguin', name: 'Top Hat Pengu', atlas: 'badniks', animPrefix: 'penguin', scale: 1.7,
    base: { hp: 16, atk: 8, def: 6, spd: 9 }, growth: { hp: 2.7, atk: 1.4, def: 1.0, spd: 1.2 }, moves: ['bellySlide'], expYield: 10 },
  mine:     { type: 'power', id: 'mine', name: 'Spike Mine', atlas: 'badniks', animPrefix: 'mine', scale: 1.6, hover: 16,
    base: { hp: 14, atk: 9, def: 8, spd: 4 }, growth: { hp: 2.4, atk: 1.5, def: 1.3, spd: 0.7 }, moves: ['spikeBurst'], expYield: 10, trait: 'spikes' },
  // ------------------------------------------------------------- boss
  // ------------------------------------------------------------- main bosses (wave 20, 40, 60, 80)
  eggman:   { type: 'power', id: 'eggman', name: 'Dr. Eggman', atlas: 'eggman', animPrefix: 'eggman', scale: 2, facesRight: true, hover: 26,
    base: { hp: 40, atk: 10, def: 10, spd: 6 }, growth: { hp: 5.0, atk: 1.7, def: 1.4, spd: 0.9 }, moves: ['eggMissile', 'eggBomb', 'eggLaugh'], expYield: 40 },
  turtle:   { type: 'power', id: 'turtle', name: 'Shell Tank', atlas: 'badniks', animPrefix: 'turtle', scale: 2.2,
    base: { hp: 30, atk: 9, def: 9, spd: 6 }, growth: { hp: 4.2, atk: 1.6, def: 1.3, spd: 0.9 }, moves: ['shellCannon', 'tankSlam'], expYield: 25, trait: 'shellUp' },
};

/** Alle speelbare characters (en dus ook mogelijke rivals). */
export const HEROES = ['sonic', 'tails', 'knuckles', 'cream', 'amy', 'shadow'];
/** Deze characters zijn geen rival maar een main boss: verslaan = vrijspelen (zie zones.ts, MAIN_BOSSES). */
export const BOSS_HEROES = ['shadow'];
export const RIVAL_HEROES = HEROES.filter(h => !BOSS_HEROES.includes(h));

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
  /** Super Barrage: 100% crit en SUPER_VULNERABLE schade krijgen, tot hij zo vaak geraakt is (hij is dan weer gewone Shadow). */
  superTurns = 0;
  /** Boss-schilden (zoals PokéRogue): de HP-balk is in zoveel stukken verdeeld (0 = geen schilden). */
  segments = 0;
  /** net gezet: de teller loopt pas vanaf de volgende beurt (zo krijg je echt n hele beurten) */
  freshTurns = new Set<'pierced'>();
  /** Hard Shell / Shell Up: de volgende klap doet SHELL_FACTOR schade. */
  shell = false;
  /** Charge (Copter Octo, Shell Tank): de volgende aanval doet CHARGE_MULT schade. */
  charged = false;
  /** Was hij al opgeladen toen hij zijn move van deze beurt koos? Alleen dan telt de lading (Shell Up laadt midden in een beurt op). */
  chargeReady = false;
  /** Hoeveel beurten deze vijand al gekozen heeft (voor het oplaad-ritme). */
  foeTurns = 0;
  /** Gif: nog zoveel beurten POISON_FRAC schade. */
  poison = 0;
  /** Bevroren (Snowball): is verdoofd, maar dan met ijs in plaats van sterretjes. */
  frozen = false;
  /** Elite-eigenschap (alleen elites). */
  elite?: EliteId;
  /** Regenerating: hoeveel HP hij dit gevecht nog mag genezen. */
  regenLeft = 0;
  /** Rival-eigenschap (alleen als rival), en of zijn eenmalige truc al gebruikt is. */
  rivalTrait?: RivalTraitId;
  rivalUsed = false;

  constructor(id: string, level: number) {
    this.def = FIGHTERS[id];
    this.level = level;
    this.hp = this.maxHp;
    this.shell = this.def.trait === 'hardShell';
  }
  get trait(): TraitDef | undefined { return this.def.trait ? TRAITS[this.def.trait] : undefined; }

  get name() { return this.def.name; }
  anim(name: string) { return `${this.def.animPrefix}_${name}`; }
  /** Vijanden worden per zone sterker (HP, ATK, DEF; niet SPD), zie enemyScaling in zones.ts. */
  statMult = 1;
  private stat(k: keyof Stats) {
    const v = this.def.base[k] + this.def.growth[k] * (this.level - 1);
    return Math.floor(k === 'spd' ? v : v * this.statMult);
  }
  /** Boss-versie van een character (Shadow): meer HP. */
  hpMult = 1;
  get maxHp() { return Math.floor(this.stat('hp') * this.hpMult); }
  /** Totale stage (rewards + zone), begrensd op -6..+6. */
  stage(k: StageKey) {
    // Ultimate Lifeform (Shadow): zone-effecten werken niet op hem
    const field = this.def.passive?.id === 'lifeform' ? 0 : this.field[k];
    return Math.max(-MAX_STAGE, Math.min(MAX_STAGE, this.stages[k] + field));
  }
  get atk() { return Math.floor(this.stat('atk') * stageMultiplier(this.stage('atk'))); }
  get dfn() { return Math.floor(this.stat('def') * stageMultiplier(this.stage('def'))); }
  /** DEF zonder boosts (verlagingen tellen wel): voor Spin Dash. */
  get dfnNoBoost() { return Math.floor(this.stat('def') * stageMultiplier(Math.min(0, this.stage('def')))); }
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
  /** Einde van een beurt: de teller van Chaos Spear loopt af. Geeft terug wat er net afliep. */
  tickTurns(): Array<'pierced'> {
    const ended: Array<'pierced'> = [];
    for (const k of ['pierced'] as const) {
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
    // Ultimate Lifeform (Shadow): niemand verlaagt zijn stats
    if (by < 0 && this.def.passive?.id === 'lifeform') return `${this.name}'s ${STAGE_NAMES[k]} can't be lowered! (Ultimate Lifeform)`;
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
export function speedPower(userSpd: number, targetSpd: number, table = SPEED_POWER) {
  const r = userSpd / Math.max(1, targetSpd);
  return table.find(([min]) => r >= min)![1];
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
  if (m.scaling === 'speed' && target) return speedPower(user.spd, target.spd, m.speedTable);
  if (m.scaling === 'stages') return stagesPower(m.power, user);
  if (m.id === 'spinAttack' && user.spinChip) return m.power + MOVE_CHIP_POWER;
  return m.power;
}

export interface HitResult { damage: number; crit: boolean; missed: boolean; effect: number; }

/** Pokémon-achtige damage-formule, versimpeld. */
export function calcHit(attacker: Fighter, target: Fighter, move: MoveDef, rng: () => number = Math.random, bonusCrit = 0, dmgMult = 1): HitResult {
  let effect = typeMultiplier(attacker.type, target.type);
  // ultimates (hele Boost-meter) raken altijd, ook met een ACC-verlaging; andere moves niet
  const ultimate = (move.cost ?? 0) >= MAX_BOOST;
  const accuracy = move.accuracy * stageMultiplier(attacker.stage('acc'));
  if (!ultimate && rng() * 100 >= accuracy) return { damage: 0, crit: false, missed: true, effect };
  const chance = Math.min(1, critChance(attacker) + bonusCrit);
  const crit = rng() < chance || !!move.alwaysCrit;
  // een crit negeert een type-nadeel (zoals in Dokkan): nooit "not very effective"
  if (crit && effect < 1) effect = 1;
  // Tornado Hammer: crit-kans al op 100%? Dan dubbele power
  const power = movePower(move, attacker, target) * (move.critDouble && chance >= 1 ? 2 : 1);
  // Spin Dash: negeert de DEF-boosts van het doelwit (DEF-verlagingen tellen wel)
  const dfn = move.ignoreDefBoost ? target.dfnNoBoost : target.dfn;
  const base = (((2 * attacker.level) / 5 + 2) * power * (attacker.atk / Math.max(1, dfn))) / 50 + 2;
  const roll = 0.85 + rng() * 0.15;
  // Weak Spot (Tails): verdoofde vijanden krijgen extra schade
  const weakSpot = attacker.def.passive?.id === 'weakSpot' && target.stun > 0 ? WEAK_SPOT_BONUS : 1;
  // Chaos Spear en Super Shadow: het doelwit krijgt meer schade
  const exposed = (target.pierced > 0 ? PIERCE_BONUS : 1) * (target.superTurns > 0 ? SUPER_VULNERABLE : 1);
  const dmg = base * roll * effect * speedBonus(attacker, target) * weakSpot * exposed * dmgMult * (crit ? critMult(attacker) : 1);
  return { damage: Math.max(1, Math.floor(dmg)), crit, missed: false, effect };
}

// Rewards staan in rewards.ts.

/**
 * Boss-schilden, zoals in PokéRogue: de HP-balk is verdeeld in `segments` stukken. Een klap die over een grens
 * gaat, stopt precies op die grens: zo breek je één schild per klap. Alleen een hele harde klap breekt er meer:
 * wat er over is moet minstens 2x een stuk zijn voor het tweede schild, 4x voor het derde, enzovoort.
 * Geeft de echte schade terug en hoeveel schilden er braken.
 */
export function shieldCap(target: Fighter, damage: number): { damage: number; broken: number } {
  const n = target.segments;
  if (n < 2 || damage <= 0) return { damage, broken: 0 };
  const size = target.maxHp / n;
  const thr = (k: number) => Math.round(size * k);
  // eerstvolgende grens onder de huidige HP
  let k0 = 0;
  for (let k = n - 1; k >= 1; k--) if (thr(k) < target.hp) { k0 = k; break; }
  if (k0 === 0 || target.hp - damage > thr(k0)) return { damage, broken: 0 };
  const extra = damage - (target.hp - thr(k0));
  let bypass = 0;
  while (bypass < k0 && extra >= Math.round(size * 2 ** (bypass + 1))) bypass++;
  const landAt = bypass >= k0 ? 0 : thr(k0 - bypass);
  return { damage: Math.min(damage, target.hp - landAt), broken: bypass + 1 };
}

// ---------------------------------------------------------------- badnik-regels (BattleScene én sim gebruiken deze)
/** Vijand kiest zijn move met het ritme van zijn eigenschap: Charge laadt op beurt 2, 5, 8 ... op; Shell Up slaat na het opladen met Tank Slam. */
export function traitMove(e: Fighter, normal: () => MoveDef): MoveDef {
  e.foeTurns++;
  if (e.def.trait === 'shellUp' && e.charged) return MOVES.tankSlam;
  if (e.def.trait === 'charger' && !e.charged && e.foeTurns % CHARGE_EVERY === 2) return MOVES.chargeUp;
  return normal();
}
/** Hard Shell / Shell Up: de klap gaat voor de helft door de schelp, en de schelp is weer weg. */
export function shellHit(target: Fighter, damage: number): { damage: number; cracked: boolean } {
  if (!target.shell || damage <= 0) return { damage, cracked: false };
  target.shell = false;
  return { damage: Math.max(1, Math.ceil(damage * SHELL_FACTOR)), cracked: true };
}
/** Spikes (Spike Mine): wie hem raakt krijgt een deel van de schade terug, maar gaat er nooit KO van. */
export function spikeRecoil(target: Fighter, attacker: Fighter, dealt: number) {
  if (target.def.trait !== 'spikes' || dealt <= 0 || attacker.fainted) return 0;
  return Math.max(0, Math.min(attacker.hp - 1, Math.max(1, Math.floor(dealt * SPIKE_RECOIL))));
}
export function poisonDamage(f: Fighter) { return Math.max(1, Math.floor(f.maxHp * POISON_FRAC)); }
/** Elite-eigenschap geven (bij de start van de wave). */
export function applyElite(e: Fighter, id: EliteId) {
  e.elite = id;
  if (id === 'armored') e.segments = Math.max(e.segments, ELITE_ARMOR_SHIELDS);
  if (id === 'swift') e.stages.spd = 2;
  if (id === 'regen') e.regenLeft = Math.floor(e.maxHp * ELITE_REGEN_TOTAL);
}
/** Regenerating: wat hij deze beurt geneest (en dat gaat van zijn tegoed af). */
export function regenTick(e: Fighter) {
  if (e.elite !== 'regen' || e.fainted || e.hp >= e.maxHp) return 0;
  const h = Math.min(e.maxHp - e.hp, Math.ceil(e.maxHp * ELITE_REGEN), e.regenLeft);
  e.regenLeft -= h;
  e.hp += h;
  return h;
}

// ---------------------------------------------------------------- rivals
/** Rivals zijn de uitdaging naast de bosses: 2 schilden en elk een eigen truc. */
export const RIVAL_SHIELDS = 2;
export type RivalTraitId = 'headStart' | 'ambush' | 'ironWill' | 'chaoRevival' | 'warmedUp';
export interface RivalTraitDef { id: RivalTraitId; name: string; desc: string; }
export const RIVAL_TRAITS: Record<string, RivalTraitDef> = {
  sonic:    { id: 'headStart', name: 'Head Start', desc: 'Too fast: gets a free attack on you before the fight starts.' },
  tails:    { id: 'ambush', name: 'Ambush', desc: 'Your fighter starts the fight stunned for 1 turn.' },
  knuckles: { id: 'ironWill', name: 'Iron Will', desc: 'Survives one KO hit with 1 HP, no matter how much HP he had.' },
  cream:    { id: 'chaoRevival', name: 'Chao Revival', desc: 'Revives once with Chao Blessing (50% HP). Your team gets ATK -2 when she does.' },
  amy:      { id: 'warmedUp', name: 'Warmed Up', desc: 'Starts the fight with ATK +1.' },
};
export const RIVAL_REVIVE_HP = 0.5;
export const RIVAL_REVIVE_ATK = -2;
/** Rival klaarzetten (bij de start van de wave): schilden en zijn eigenschap. */
export function applyRival(e: Fighter) {
  e.segments = Math.max(e.segments, RIVAL_SHIELDS);
  e.rivalTrait = RIVAL_TRAITS[e.def.id]?.id;
  if (e.rivalTrait === 'warmedUp') e.stages.atk = Math.max(e.stages.atk, 1);
  // Iron Will vervangt zijn gewone Iron Fists (anders overleeft hij twee keer)
  if (e.rivalTrait === 'ironWill') e.sashUsed = true;
}
/** Welke rival: liefst een nieuwe (en een die nog op slot zit), en nooit dezelfde twee keer achter elkaar. */
export function rivalOptions(others: string[], met: string[], isLocked: (id: string) => boolean): string[] {
  const last = met[met.length - 1];
  const notLast = others.filter(h => h !== last);
  const pool = notLast.length ? notLast : others;
  const fresh = pool.filter(h => !met.includes(h));
  const locked = fresh.filter(isLocked);
  return locked.length ? locked : fresh.length ? fresh : pool;
}
/** Iron Will (rival-Knuckles): een klap die hem KO zou slaan laat hem één keer op 1 HP staan. */
export function ironWill(target: Fighter) {
  if (target.rivalTrait !== 'ironWill' || target.rivalUsed || target.hp > 0) return false;
  target.rivalUsed = true;
  target.hp = 1;
  return true;
}
/** Chao Revival (rival-Cream): één keer terug met de helft van haar HP. */
export function chaoRevival(target: Fighter) {
  if (target.rivalTrait !== 'chaoRevival' || target.rivalUsed || !target.fainted) return false;
  target.rivalUsed = true;
  target.hp = Math.ceil(target.maxHp * RIVAL_REVIVE_HP);
  return true;
}
