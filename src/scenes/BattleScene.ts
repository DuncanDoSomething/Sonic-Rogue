import Phaser from 'phaser';
import { BLESS_BONUS, BLESS_TURNS, BOOST_ON_HIT, FIGHTER_TYPES, EMERALD_EXP_BONUS, benchExpRate, PIERCE_BONUS, LIFEFORM_KO_BOOST, SASH_MIN_HP, dodgeChance, speedBonus, luckyInfo, RIVAL_SHIELDS, RIVAL_TRAITS, RIVAL_REVIVE_ATK, applyRival, chaoRevival, ironWill, rivalOptions, ULT_CHAIN_MAX, shieldCap, FIGHTERS, Fighter, HEROES, RIVAL_HEROES, MAX_BOOST, MOVES, MoveDef, StageKey, ULTIMATE_LEVEL, calcHit, BOSS_REVIVE_HP, CHAO_CARE_BENCH, CHAO_CARE_HEAL, CRIT_RECOIL, emptyStages, expShareAfter, FLINCH_CHANCE, MAX_PARTY, movePower, stageMultiplier, typeMultiplier, chargeMult, luckyExtraChance, ELITE_IDS, PIGGY_MAX_DEF, regenTick, ELITE_TRAITS, SHELL_FACTOR, applyElite, poisonDamage, shellHit, spikeRecoil, traitMove } from '../data/fighters';
import { DEFAULT_ZONE_ORDER, EMERALDS, MAIN_BOSS_BOOST, MAIN_BOSS_SHIELDS, SHADOW_BOSS_HP, ZONE_BOSS_HEAL, ZONE_BOSS_SHIELDS, ZONES, mainBossFor, enemyScaling, isBossWave, isEliteWave, isMainBossWave, rivalChance, rivalLevelBonus, rollZoneOrder, waveInZone, zoneForWave } from '../data/zones';
import { isUnlocked, unlock } from '../data/unlocks';
import { clearRun, fighterFromSave, fighterToSave, saveRun, type RunSave } from '../data/save';
import type { ZoneEffect } from '../data/zones';

/** true = bosses krijgen jouw type. Met een party van 3 kun je wisselen, dus nu uit. */
const BOSS_TYPE_NEUTRAL = false;
import { Backdrop } from './Backdrop';
import { BAG_SIZE, ITEMS, ITEMS_PER_FIGHT, ItemDef, bagCount, rerollCost, shopStock, waveRings } from '../data/items';
import { BOSS_TIER_ODDS, HAMMER_CRIT, MAGNET_BONUS, REWARDS, SHIELD_FACTOR, TIER_COLOR, TIER_ODDS, TIER_NAME, emptyBuffs, rollRewards, type RewardCtx, type RewardDef, type RunBuffs, type Tier } from '../data/rewards';
import { battleTimeScale, charDelay, holdFactor, settings } from '../data/settings';
import { addHelpButton, addMenuButton } from './ui';
import { HUD, RingCounter, checkerBand, sonicPanel, tooltip } from './hud';
import { richText } from './richText';
import { audio, MusicKey } from '../audio';
import { chaoAttack, chaoCheer, chaoFriends, copterDive, glideAttack, glovePunch, hammerTwirl, homingAttack, knucklePunch, pikoHammer, spinDash, type HeroCtx } from './heroMoves';
import { pickTalk } from '../data/dialogue';
import { playTalk, type TalkHandle } from './talk';
import { bigText, chaoBlessing, cutIn, fxOnce, hearts, playUltimate, shockwave, type UltCtx } from './ultimates';
import { chaosControl, chaosSpear, superShadow } from './shadowMoves';
import { TEST_KEYS, TEST_MODE } from '../data/testMode';
import { TutorialCoach, tailsTip, type TutorialHost } from './tutorial';
import { SERIOUS_TIPS, TIPS, markTip, tipDue, type TipId } from '../data/tips';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';
const PANEL_Y = 222;
/** y van de HP-balk in de info-boxen */
const BOX_BAR_Y = 21;
/** shop-band in het reward-scherm (rechts ervan staan de ring-teller en de tas) */
const SHOP_X = 16;
const SHOP_W = 360;
/** midden van de shop-vakjes */
const SHOP_TILE_Y = 63;

const PLAYER_POS = { x: 118, y: 208 };
/** textures van de speelbare characters (zie bodyHeight) */
const CHARACTER_TEXTURES = new Set(['sonic', 'tails', 'knuckles', 'amy', 'cream', 'shadow', 'shadowfx', 'knucklesball', 'shadowball', 'sonicidle', 'amyidle', 'tailssit', 'amyvictory', 'sonicbosswin', 'sbmoves']);
/** lichaamshoogte van een character in sprite-pixels */
const CHARACTER_BODY = 38;
/** Moves met een eigen animatie (heroMoves.ts): move-id -> [van wie, animatie]. */
const HERO_MOVES: Record<string, [string, (c: HeroCtx) => Promise<void>]> = {
  homingAttack: ['sonic', homingAttack],
  copterDive: ['tails', copterDive],
  glideAttack: ['knuckles', glideAttack],
  hammerSmash: ['amy', pikoHammer],
  cheeseAttack: ['cream', chaoAttack],
  spinDash: ['sonic', spinDash],
  glovePunch: ['tails', glovePunch],
  drillPunch: ['knuckles', knucklePunch],
  hammerTwirl: ['amy', hammerTwirl],
};
const ENEMY_POS = { x: 352, y: 132 };

type MenuState = 'busy' | 'command' | 'fight' | 'bag' | 'reward' | 'gameover' | 'choice';

/** Een regel in een keuze-lijstje (ja/nee, wie wissel je in, ...). */
interface ChoiceRow { label: string; right?: string; head?: string; disabled?: boolean; /** Boost-meter van een teamgenoot */ boost?: number; }

interface InfoBox {
  root: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  level: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  barW: number;
  hpText?: Phaser.GameObjects.Text;
  exp?: Phaser.GameObjects.Rectangle;
  shownHp: number;
  /** level waarvoor de EXP-balk nu getekend is; zolang de animatie loopt blijft setBox eraf */
  expAnimating?: boolean;
  typeIcon: Phaser.GameObjects.Image;
  boostPips?: Phaser.GameObjects.Rectangle[];
  badge?: Phaser.GameObjects.Text;
  badgeBg?: Phaser.GameObjects.Graphics;
  /** jouw kant: tabje boven de box met Sonic Speed's schadebonus van dit moment */
  speedTag?: Phaser.GameObjects.Text;
  speedTagBg?: Phaser.GameObjects.Graphics;
  portrait?: Phaser.GameObjects.Image;
  segments?: Phaser.GameObjects.Graphics;
}

export class BattleScene extends Phaser.Scene implements TutorialHost {
  private partyIds: string[] = ['sonic'];
  /** je team (max 3); `player` is wie er nu vecht */
  private party: Fighter[] = [];
  /** deel van de EXP voor de bank (0 tot wave 10, dan 50%, na wave 20 100%) */
  private expShare = 0;
  private choiceLayer?: Phaser.GameObjects.Container;
  private choiceRows: ChoiceRow[] = [];
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private choiceCancel = true;
  private choiceResolve?: (i: number) => void;
  private partyHeads: Phaser.GameObjects.Image[] = [];
  private player!: Fighter;
  private enemy!: Fighter;
  private wave = 1;
  /** true als de huidige wave een rival-gevecht is (een ander character in plaats van een badnik) */
  private rival = false;
  /** save waarmee deze run verder gaat (Continue op het title screen) */
  private saved?: RunSave;
  /** wie deze beurt geflinched is (Knuckles' Iron Fists) */
  private flinched = new Set<Fighter>();
  /** moves met `stunOnce` die deze wave al verdoofd hebben (per kant: 'p:glovePunch' / 'e:glovePunch') */
  private stunUsed = new Set<string>();
  /** extra crit-kans voor de aanval die nu loopt (Amy's Hammer) */
  private critBonus = 0;
  /** testmodus: sneltoetsen-paneel en "volgende wave is een rival" */
  private testPanel?: Phaser.GameObjects.Container;
  private forceRival = false;
  /** Chao Blessing: het zone-effect blijft weg tot de zone-boss verslagen is */
  private fieldCleared = false;
  /** tijdelijke effecten van rewards (Shield, Magnet, ...), worden mee opgeslagen */
  private buffs: RunBuffs = emptyBuffs();
  /** deze wave: alle schade op je team gehalveerd (Shield+) */
  private waveShield = false;
  /** deze wave: de eerste aanval op je team mist (Invincibility) */
  private dodgeFirst = false;
  /** deze wave: +50% rings (Magnet Shield) */
  private waveMagnet = false;
  /** deze wave is een Eggman Alarm-elite: daarna minstens uncommon rewards */
  private alarmWave = false;
  /** items uit de tas gebruikt in dit gevecht */
  private itemsUsed = 0;
  /** de vijand van deze wave is een elite (+2 levels, meer rings) */
  private elite = false;
  /** minimale tier voor de rewards van nu */
  private minTier: Tier = 'common';
  private fieldEffect?: ZoneEffect;
  private fieldText!: Phaser.GameObjects.Text;
  private fieldLayer?: Phaser.GameObjects.Container;
  private statsLayer!: Phaser.GameObjects.Container;
  private statsRows: Phaser.GameObjects.Text[] = [];
  /** rivals die je deze run al bent tegengekomen */
  private rivalsMet: string[] = [];
  private rings = 0;
  private emeralds = 0;
  /** zone-volgorde van deze run (Route 99, Leaf Forest, dan geschud per poule) */
  private zoneOrder: string[] = DEFAULT_ZONE_ORDER;
  private backdrop!: Backdrop;
  private platformGfx!: Phaser.GameObjects.Graphics;
  private emeraldSlots: Phaser.GameObjects.Sprite[] = [];
  private decorTimer?: Phaser.Time.TimerEvent;
  private shieldFx?: Phaser.GameObjects.Sprite;
  /** index van de laatst gebruikte move, zodat Fight daar weer opent */
  private lastMove = 0;

  private hero!: Phaser.GameObjects.Sprite;
  private foe!: Phaser.GameObjects.Sprite;
  private foeHome = { x: ENEMY_POS.x, y: ENEMY_POS.y };
  private foeHover?: Phaser.Tweens.Tween;

  private pBox!: InfoBox;
  private eBox!: InfoBox;
  private msg!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private ringText!: RingCounter;
  private ringIcon!: Phaser.GameObjects.Sprite;
  /** buff-icoontjes links in beeld en de tas rechtsboven (met uitleg bij hover) */
  private buffIcons: Phaser.GameObjects.Container[] = [];
  private bagTray?: Phaser.GameObjects.Container;
  private hudTip?: Phaser.GameObjects.Container;
  private hudSig = '';
  /** oefengevecht met Tails als gids (vanaf How to Play op het titelscherm) */
  private tutorialMode = false;
  private tut?: TutorialCoach;
  /** tutorial: de vijand kan pas vallen als Tails zegt dat je hem mag afmaken */
  private tutGuard = false;
  /** open tip van Tails (Z of klik sluit hem) */
  private tipBox?: { close(): void };
  /** rival-gesprekje dat nu in beeld is */
  private talkBox?: TalkHandle;

  private menu: MenuState = 'busy';
  private cursor = 0;
  private cmdLayer!: Phaser.GameObjects.Container;
  private cmdItems: Phaser.GameObjects.Text[] = [];
  private fightLayer!: Phaser.GameObjects.Container;
  private fightItems: Phaser.GameObjects.Text[] = [];
  private fightGlows: Phaser.GameObjects.Shape[] = [];
  private moveInfo!: Phaser.GameObjects.Text;
  private pointer!: Phaser.GameObjects.Sprite;
  private rewardLayer?: Phaser.GameObjects.Container;
  private rewardCards: Phaser.GameObjects.Container[] = [];
  private rewardChoices: RewardDef[] = [];
  /** in het reward-scherm: 0 = rij met gratis rewards, 1 = shop-rij */
  private rewardRow = 0;
  private rerolls = 0;
  /** HP-status rechtsonder tijdens het reward/shop-scherm */
  private statusPanel?: Phaser.GameObjects.Container;
  /** "Use now / Keep in bag" na het kopen van een heal-item */
  private shopButtons: Phaser.GameObjects.Container[] = [];
  private shopItems: ItemDef[] = [];

  /** je tas: item-id -> aantal */
  private bag: Record<string, number> = {};
  private bagLayer!: Phaser.GameObjects.Container;
  private bagItems: Phaser.GameObjects.Container[] = [];
  private bagIds: string[] = [];
  private bagInfo!: Phaser.GameObjects.Text;

  /** stats-paneel (C in het hoofdmenu) */

  /** move-info (C) */
  private infoLayer!: Phaser.GameObjects.Container;
  private infoBg!: Phaser.GameObjects.Graphics;
  private infoTitle!: Phaser.GameObjects.Text;
  /** uitleg van de move, in kleur (zie richText) */
  private infoBody!: Phaser.GameObjects.Container;

  constructor() { super('Battle'); }

  init(data: { party?: string[]; starter?: string; save?: RunSave; tutorial?: boolean }) {
    this.saved = data.save;
    this.tutorialMode = !!data.tutorial;
    this.partyIds = data.party?.length ? data.party : [data.starter ?? 'sonic'];
    this.cmdItems = [];
    this.fightItems = [];
    this.bagItems = [];
    this.rewardCards = [];
    this.shopButtons = [];
    this.rewardLayer = undefined;
    this.bag = {};
  }

  // ---------------------------------------------------------------- setup
  update(_t: number, dt: number) {
    if (this.hero && this.foe) { this.updateStatusFx(dt); this.updateIdle(dt); this.refreshHudExtras(); this.tut?.update(); }
  }

  /**
   * Idle in lagen, zoals Advance 2/3: eerst gewoon staan, na een paar seconden ongeduldig (voet tikken,
   * schaduwboksen...), en als je nog langer wacht gaan ze zitten of liggen. Zodra er iets gebeurt staan ze weer.
   */
  private idleState = new Map<Phaser.GameObjects.Sprite, { t: number; stage: number }>();
  private updateIdle(dt: number) {
    const waiting = this.menu === 'command' || this.menu === 'fight' || this.menu === 'bag';
    const pairs: Array<[Phaser.GameObjects.Sprite, Fighter | undefined]> = [[this.hero, this.player]];
    if (this.charFoe) pairs.push([this.foe, this.enemy]);
    for (const [spr, f] of pairs) {
      if (!f || f.fainted) continue;
      const st = this.idleState.get(spr) ?? { t: 0, stage: 0 };
      this.idleState.set(spr, st);
      const key = spr.anims.currentAnim?.key;
      const idle = f.anim('idle'), wait = f.anim('wait'), sit = f.anim('sit'), nap = f.anim('nap');
      const inIdle = key === idle || key === wait || key === sit || key === nap;
      if (!waiting || !inIdle) {
        // actie begint terwijl hij zit/ligt: meteen weer opstaan
        if (!waiting && (key === sit || key === nap)) spr.play(idle);
        st.t = 0; st.stage = 0;
        continue;
      }
      st.t += dt;
      if (st.stage === 0 && st.t > 4500 && !this.anims.exists(wait)) {
        st.stage = 1; // geen ongeduld-animatie (Sonic): meteen door naar zitten/liggen later
      } else if (st.stage === 0 && st.t > 4500 && key === idle) {
        st.stage = 1;
        spr.play(wait);
        spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { if (spr.anims.currentAnim?.key === wait) spr.play(idle); });
      } else if (st.stage === 1 && st.t > 14000 && this.anims.exists(sit) && key === idle) {
        st.stage = 2;
        spr.play(sit);
        spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { if (spr.anims.currentAnim?.key === sit) spr.play(this.anims.exists(nap) ? nap : idle); });
      }
    }
  }

  create() {
    this.statusFx = new Map();
    this.pierceFx = new Map();
    this.idleState = new Map();
    this.wave = 1;
    this.rings = 0;
    this.emeralds = 0;
    this.emeraldSlots = [];
    this.shieldFx = undefined;
    this.decorTimer = undefined;
    this.lastMove = 0;
    this.rival = false;
    this.rivalsMet = [];
    this.buffIcons = [];
    this.bagTray = undefined;
    this.hudTip = undefined;
    this.hudSig = '';
    this.events.on('update', () => {
      // de bubbel volgt je character, ook tijdens aanvallen
      if (this.shieldFx) this.shieldFx.setPosition(this.hero.x, this.center(this.hero).y).setVisible(this.hero.visible);
    });
    this.party = this.partyIds.map(id => new Fighter(id, 5));
    this.player = this.party[0];
    this.expShare = 0;
    this.fieldCleared = false;
    this.buffs = emptyBuffs();
    this.alarmWave = false;
    this.statsRows = [];
    this.zoneOrder = rollZoneOrder();
    const sv = this.saved;
    if (sv) {
      this.party = sv.party.map(fighterFromSave);
      this.player = this.party[sv.active] ?? this.party.find(f => !f.fainted) ?? this.party[0];
      this.wave = sv.wave;
      this.rings = sv.rings;
      this.emeralds = sv.emeralds;
      this.expShare = expShareAfter(sv.wave - 1);
      this.bag = { ...sv.bag };
      this.rivalsMet = [...sv.rivalsMet];
      this.fieldCleared = !!sv.fieldCleared;
      this.buffs = { ...emptyBuffs(), ...(sv.buffs ?? {}) };
      // oude saves hebben nog geen zone-volgorde: dan de vaste
      const ok = sv.zoneOrder?.length && sv.zoneOrder.every(id => ZONES.some(z => z.id === id));
      this.zoneOrder = ok ? sv.zoneOrder! : DEFAULT_ZONE_ORDER;
    }
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.backdrop = new Backdrop(this, PANEL_Y, 0);
    this.platformGfx = this.add.graphics().setDepth(1);

    // sprites op de sheets kijken naar links; jouw kant kijkt naar rechts
    this.hero = this.add.sprite(PLAYER_POS.x, PLAYER_POS.y, this.player.def.atlas)
      .setOrigin(0.5, 1).setScale(this.player.def.scale).setFlipX(true).setDepth(5);
    this.hero.play(this.player.anim('idle'));

    this.foe = this.add.sprite(W + 80, ENEMY_POS.y, 'badniks').setOrigin(0.5, 1).setDepth(4);

    this.drawHud();
    this.drawPanel();
    this.bindInput();
    this.tut = undefined;
    if (this.tutorialMode) {
      // vaste oefen-setup: een heart in de tas, en niks wordt opgeslagen
      this.bag = { healthRing: 1 };
      this.tutGuard = true;
      this.tut = new TutorialCoach(this, this);
    }
    this.testPanel = undefined;
    if (TEST_MODE) this.drawTestBadge();

    // verdiende Chaos Emeralds uit een save meteen tonen
    for (let i = 0; i < this.emeralds; i++) this.emeraldSlots[i].clearTint().setAlpha(1).play(`emerald_${EMERALDS[i]}`);
    this.startWave();
  }

  /**
   * Battle speed geldt alleen tijdens een aanval: tweens, timers en de animatie van de
   * aanvaller. Idle-animaties, de ring en de rest van de HUD blijven op normale snelheid.
   */
  private setActionSpeed(attacker: Phaser.GameObjects.Sprite | null) {
    const t = attacker ? battleTimeScale() : 1;
    this.tweens.timeScale = t;
    this.time.timeScale = t;
    this.hero.anims.timeScale = attacker === this.hero ? t : 1;
    this.foe.anims.timeScale = attacker === this.foe ? t : 1;
    if (this.foeHover) this.foeHover.timeScale = 1 / t; // zweven blijft rustig
  }

  /** Pauzemenu (drie streepjes / M): Resume, Settings, How to Play, Save & Quit. */
  private openPause() {
    this.scene.pause();
    this.scene.launch('Pause', { from: this.scene.key, quitLabel: this.tutorialMode ? 'Quit Tutorial' : undefined });
  }

  /** Platforms in de kleuren van de huidige zone. */
  private drawPlatforms() {
    const st = this.backdrop.platform;
    const g = this.platformGfx.clear();
    for (const [p, w, h] of [[PLAYER_POS, 140, 22], [ENEMY_POS, 112, 16]] as const) {
      g.fillStyle(st.shadow, 0.45).fillEllipse(p.x, p.y + 3, w + 10, h + 6);
      g.fillStyle(st.side).fillEllipse(p.x, p.y, w, h);
      g.fillStyle(st.top).fillEllipse(p.x, p.y - 3, w - 8, h - 7);
    }
  }

  /** Wissel naar de achtergrond van deze wave (zone of boss). */
  private setBackdrop(key: string, fadeMs: number) {
    this.backdrop.show(key, fadeMs);
    this.drawPlatforms();
    this.setDecor(key);
  }

  /** Zone-decoratie: in Toy Kingdom zweven er ballonnen omhoog op de achtergrond. */
  private setDecor(key: string) {
    this.decorTimer?.remove();
    this.decorTimer = undefined;
    if (key !== 'toy') return;
    const spawn = () => {
      const c = Phaser.Utils.Array.GetRandom(['blue', 'yellow', 'red', 'green']);
      const b = this.add.sprite(Phaser.Math.Between(20, W - 20), PANEL_Y + 40, `fx_balloon_${c}_0`).setDepth(0.5).setAlpha(0.9).play(`balloon_${c}`);
      this.tweens.add({ targets: b, y: -60, duration: Phaser.Math.Between(7000, 10000), onComplete: () => b.destroy() });
      this.tweens.add({ targets: b, x: b.x + Phaser.Math.Between(-30, 30), duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    };
    spawn();
    this.decorTimer = this.time.addEvent({ delay: 2600, loop: true, callback: spawn });
  }

  /** Groene shield-bubbel om je character zolang er een Shield (reward) actief is. */
  private updateShield() {
    const on = !!this.player && !this.player.fainted && (this.waveShield || this.buffs.shieldHit);
    if (on && !this.shieldFx) {
      this.shieldFx = this.add.sprite(this.hero.x, this.hero.y, 'fx_shield_0').setScale(2).setAlpha(0.7).setBlendMode(Phaser.BlendModes.ADD).setDepth(6).play('shield');
    } else if (!on && this.shieldFx) {
      this.shieldFx.destroy();
      this.shieldFx = undefined;
    }
  }

  /** Actieve reward-effecten, voor de icoontjes links in beeld. */
  private activeBuffs(): Array<{ key: string; icon: string; name: string; desc: string; count?: number; tint?: number }> {
    const b = this.buffs;
    const out: Array<{ key: string; icon: string; name: string; desc: string; count?: number; tint?: number }> = [];
    const n = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
    if (this.waveShield) out.push({ key: 'shieldW', icon: 'monitor_shield', name: 'Shield+', desc: 'All damage to your team is halved this wave.' });
    if (b.shieldWaves) out.push({ key: 'shieldN', icon: 'monitor_shield', name: 'Shield+', desc: `Half damage in the next ${n(b.shieldWaves, 'wave')}.`, count: b.shieldWaves });
    if (b.shieldHit) out.push({ key: 'shield', icon: 'monitor_shield', name: 'Shield', desc: 'The next hit on your team does half damage.' });
    if (this.dodgeFirst) out.push({ key: 'dodge', icon: 'monitor_power', name: 'Invincibility', desc: 'The first attack on your team this wave misses.' });
    const dodge = b.dodgeWaves || (b.dodgeNext ? 1 : 0);
    if (dodge) out.push({ key: 'dodgeN', icon: 'monitor_power', name: 'Invincibility', desc: `The first attack in the next ${n(dodge, 'wave')} misses.`, count: dodge });
    const magnet = b.magnetWaves + (this.waveMagnet ? 1 : 0);
    if (magnet) out.push({ key: 'magnet', icon: 'monitor_thunder', name: 'Magnet Shield', desc: `Double rings for ${n(magnet, 'more wave')}${this.waveMagnet ? ', this one included' : ''}.`, count: magnet });
    if (b.critTurns) out.push({ key: 'crit', icon: 'mon_tornado', name: "Amy's Hammer", desc: `+${Math.round(HAMMER_CRIT * 100)}% crit chance for your next ${n(b.critTurns, 'turn')}.`, count: b.critTurns });
    if (this.alarmWave) out.push({ key: 'alarm', icon: 'mon_alert', name: 'Eggman Alarm', desc: 'This foe is an elite. Beat it for uncommon-or-better rewards.' });
    if (b.eliteNext) out.push({ key: 'alarmN', icon: 'mon_alert', name: 'Eggman Alarm', desc: 'The next foe is an elite. Beat it for uncommon-or-better rewards.' });
    const p = this.player;
    if (p?.superTurns > 0) out.push({ key: 'super', icon: 'shadowfx:ssh_idle_0', name: 'Super power', desc: `100% crit, but ${p.name} takes double damage. ${n(p.superTurns, 'turn')} left, this one included.`, count: p.superTurns });
    if (p?.chaosFree && p.moves.includes('chaosControl')) out.push({ key: 'chaosFree', icon: 'emeralds:emerald_green_0', name: 'Chaos Control', desc: 'Free to use: costs no Boost.' });
    if (p?.ultFree && p.def.ultimate && p.moves.includes(p.def.ultimate)) out.push({ key: 'ultFree', icon: 'shadowfx:ssh_spear_2', name: MOVES[p.def.ultimate].name, desc: `Free to use: costs no Boost (${p.ultChain}/${ULT_CHAIN_MAX} in a row).` });
    if (this.enemy?.pierced > 0) out.push({ key: 'pierced', icon: 'shadowfx:sh_rune_pink_0', name: 'Pierced', desc: `The foe takes ${Math.round((PIERCE_BONUS - 1) * 100)}% more damage. ${n(this.enemy.pierced, 'turn')} left.`, count: this.enemy.pierced });
    if (b.blessTurns) out.push({ key: 'blessing', icon: 'sbmoves:sbfx_cheese_fly_0', name: 'Chao Blessing', desc: `Your team does ${Math.round(BLESS_BONUS * 100)}% more damage for ${n(b.blessTurns, 'more turn')}.`, count: b.blessTurns });
    if (this.foeBless) out.push({ key: 'foeBless', icon: 'sbmoves:sbfx_cheese_fly_0', name: 'Chao Blessing (foe)', desc: `The foe does ${Math.round(BLESS_BONUS * 100)}% more damage for ${n(this.foeBless, 'more turn')}.`, count: this.foeBless });
    if (this.fieldCleared && zoneForWave(this.wave, this.zoneOrder).effect) out.push({ key: 'bless', icon: 'head_cream', name: 'Chao Blessing', desc: 'The zone effect is gone until the zone boss.' });
    // badnik-effecten op jou
    if (p?.poison > 0 && !p.fainted) out.push({ key: 'poison', icon: 'badniks:bee_idle_0', tint: 0xc07aff, name: 'Poisoned', desc: `${p.name} loses ${poisonDamage(p)} HP at the end of every turn. ${n(p.poison, 'turn')} left.`, count: p.poison });
    if (p?.frozen && p.stun > 0) out.push({ key: 'frozen', icon: 'badniks:snowman_idle_0', tint: 0x9ad8ff, name: 'Frozen', desc: `${p.name} is frozen and skips the next turn.` });
    const e = this.enemy;
    if (e && !e.fainted && e.charged) out.push({ key: 'charged', icon: `${e.def.atlas}:${e.def.animPrefix}_idle_0`, tint: 0xff9a3a, name: 'Charged up!', desc: `The foe's next attack does ${chargeMult(e)}x damage. Dodge it, switch, or finish it first!` });
    if (e && !e.fainted && e.shell) out.push({ key: 'shell', icon: `${e.def.atlas}:${e.def.animPrefix}_idle_0`, tint: 0x8ad8ff, name: 'Shell', desc: `The next hit on the foe only does ${Math.round(SHELL_FACTOR * 100)}% damage.` });
    return out;
  }

  /** Plaatje uit de ui-atlas of een los plaatje (mon_*). */
  private hudIcon(key: string) {
    if (key.includes(':')) { const [tex, frame] = key.split(':'); return this.add.image(0, 0, tex, frame); }
    return this.textures.exists(key) ? this.add.image(0, 0, key) : this.add.image(0, 0, 'ui', key);
  }

  private showHudTip(x: number, y: number, title: string, body: string, right = false) {
    this.hudTip?.destroy();
    this.hudTip = tooltip(this, x, y, title, body, 190, right);
  }
  /** Tas-uitleg: een regel per item met het icoon, het aantal en wat het doet. `rx` = rechterkant. */
  private showBagTip(rx: number, ty: number, items: string[], used: boolean) {
    this.hideHudTip();
    const w = 190;
    const c = this.add.container(0, ty).setDepth(48);
    const parts: Phaser.GameObjects.GameObject[] = [this.add.text(8, 7, 'BAG', { fontFamily: FONT, fontSize: '8px', color: HUD.label })];
    let y = 20;
    const text = (x: number, t: string, color = '#ffffff') => {
      const o = this.add.text(x, y, t, { fontFamily: FONT, fontSize: '8px', color, lineSpacing: 3, wordWrap: { width: w - x - 8 } });
      parts.push(o);
      return o;
    };
    if (!items.length) {
      y += text(8, `Empty. Buy items in the shop after a wave (max ${BAG_SIZE}).`).height + 4;
    }
    for (const id of new Set(items)) {
      const icon = this.shopIcon(id, false)[0] as Phaser.GameObjects.Image;
      icon.setPosition(16, y + 4).setScale(Math.min(1, 15 / icon.width, 14 / icon.height));
      parts.push(icon);
      if (this.bag[id] > 1) parts.push(this.add.text(25, y + 11, `${this.bag[id]}`, { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 }).setOrigin(1, 1));
      y += Math.max(14, text(32, ITEMS[id].desc).height) + 6;
    }
    if (items.length) y += text(8, used ? 'You already used an item this fight.' : `Free action, ${ITEMS_PER_FIGHT} per fight.`, HUD.muted).height + 4;
    if (items.length && this.menu === 'reward') y += text(8, 'Click or press C to toss one.', HUD.muted).height + 4;
    const h = y + 4;
    c.add([sonicPanel(this.add.graphics(), 0, 0, w, h, 'blue', 0.97), ...parts]);
    c.x = Math.max(2, rx - w);
    this.hudTip = c;
  }

  private hideHudTip() { this.hudTip?.destroy(); this.hudTip = undefined; }

  /** Hover (of tik) = uitleg. `right`: tx is de rechterkant van het vakje (voor dingen rechts in beeld). */
  private hoverTip(obj: Phaser.GameObjects.GameObject, tx: number, ty: number, title: string, body: () => string, onTap?: () => void, right = false) {
    obj.on('pointerover', () => this.showHudTip(tx, ty, title, body(), right));
    obj.on('pointerout', () => this.hideHudTip());
    obj.on('pointerdown', () => { if (onTap) onTap(); else if (this.hudTip) this.hideHudTip(); else this.showHudTip(tx, ty, title, body(), right); });
  }

  /**
   * Buff-icoontjes links in beeld en je tas rechtsboven. Wordt elke frame gecheckt,
   * maar alleen opnieuw gebouwd als er echt iets veranderd is.
   */
  private refreshHudExtras() {
    const buffs = this.activeBuffs();
    const sig = JSON.stringify([buffs.map(b => b.key + (b.count ?? '')), this.bag, this.itemsUsed]);
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    this.hideHudTip();

    this.buffIcons.forEach(c => c.destroy());
    this.buffIcons = buffs.map((b, i) => {
      const c = this.add.container(16, 76 + i * 25).setDepth(20);
      const g = sonicPanel(this.add.graphics(), -11, -11, 22, 22, 'blue', 0.92);
      const icon = this.hudIcon(b.icon);
      icon.setScale(Math.min(16 / icon.width, 17 / icon.height));
      if (b.tint) icon.setTint(b.tint);
      c.add([g, icon]);
      if (b.count && b.count > 1) {
        c.add(this.add.text(10, 11, `${b.count}`, { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 }).setOrigin(1, 1));
      }
      c.setSize(22, 22).setInteractive({ useHandCursor: true });
      this.hoverTip(c, 30, c.y - 11, b.name, () => b.desc);
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut', delay: i * 40 });
      return c;
    });

    // tas: elk item een eigen vakje (BAG_SIZE), grijs als je dit gevecht al een item gebruikte
    this.bagTray?.destroy();
    const tx = W - 24 - RingCounter.W, ty = 17 + RingCounter.H + 4;
    const tray = this.add.container(tx, ty).setDepth(42);
    tray.add(sonicPanel(this.add.graphics(), 0, 0, RingCounter.W, 24, 'blue', 0.92));
    const items = Object.keys(ITEMS).flatMap(id => Array(this.bag[id] ?? 0).fill(id) as string[]);
    const used = this.itemsUsed >= ITEMS_PER_FIGHT;
    for (let i = 0; i < BAG_SIZE; i++) {
      const sx = RingCounter.W / 2 - 13 + i * 26;
      tray.add(this.add.rectangle(sx, 12, 20, 16, HUD.pipEmpty, 0.85).setStrokeStyle(1, HUD.outline));
      const id = items[i];
      if (!id) continue;
      const icon = this.shopIcon(id, false)[0] as Phaser.GameObjects.Image;
      icon.setPosition(sx, 12).setScale(Math.min(1, 15 / icon.width, 14 / icon.height)).setAlpha(used ? 0.35 : 1);
      tray.add(icon);
    }
    const hit = this.add.zone(0, 0, RingCounter.W, 24).setOrigin(0).setInteractive({ useHandCursor: true });
    tray.add(hit);
    // uitleg links van de tas: per item het icoontje met wat het doet (de namen zeggen weinig)
    const show = () => this.showBagTip(tx - 3, ty, items, used);
    hit.on('pointerover', show);
    hit.on('pointerout', () => this.hideHudTip());
    hit.on('pointerdown', () => {
      if (this.menu === 'command') { this.hideHudTip(); audio.sfx('confirm'); this.openBag(); }
      else if (this.menu === 'reward' && items.length) { this.hideHudTip(); void this.tossItem(); }
      else if (this.hudTip) this.hideHudTip(); else show();
    });
    this.bagTray = tray;
  }

  private makeInfoBox(x: number, y: number, w: number, isPlayer: boolean): InfoBox {
    const root = this.add.container(x, y).setDepth(20);
    // hoog genoeg dat het type-icoontje (16 px) binnen de rand past
    const h = isPlayer ? 45 : 32;
    let portrait: Phaser.GameObjects.Image | undefined;
    const g = this.add.graphics();
    sonicPanel(g, 0, 0, w, h, 'blue', 0.94);
    const barX = 34, barY = BOX_BAR_Y, barW = w - barX - 8;
    g.fillStyle(HUD.outline).fillRect(barX - 2, barY - 2, barW + 4, 8);
    g.fillStyle(HUD.pipEmpty).fillRect(barX - 1, barY - 1, barW + 2, 6);
    root.add(g);
    root.add(this.add.text(10, barY - 1, 'HP', { fontFamily: FONT, fontSize: '8px', color: HUD.label }));
    const bar = this.add.rectangle(barX, barY, barW, 4, 0x4ade5a).setOrigin(0, 0);
    const name = this.add.text(8, 7, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' });
    // jouw kant krijgt het character-icoontje links naast de box
    if (isPlayer) {
      // Advance 3-portret links naast de box, onderkant gelijk
      portrait = this.add.image(-4, h, `portrait_${this.player.def.id}`).setOrigin(1, 1);
      root.add(portrait);
    }
    const level = this.add.text(w - 8, 7, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(1, 0);
    const typeIcon = this.add.image(0, 4, 'type_speed').setOrigin(0, 0);
    root.add([bar, name, level, typeIcon]);
    const box: InfoBox = { root, name, level, bar, barW, shownHp: 0, typeIcon, portrait };
    if (!isPlayer) {
      // net als in PokéRogue: BOSS-label naast het level, en de HP-balk in stukken
      box.badgeBg = this.add.graphics();
      box.badge = this.add.text(w - 10, h + 2, '', { fontFamily: FONT, fontSize: '8px', color: '#ff7a2a' }).setOrigin(1, 0);
      box.segments = this.add.graphics();
      root.add([box.badgeBg, box.badge, box.segments]);
      // hover/tik op het label: wat deze vijand speciaal maakt
      box.badge.setInteractive({ useHandCursor: true });
      const show = () => {
        const info = this.enemyBadge();
        if (info.tip) this.showHudTip(root.x + w - 6, root.y + h + 16, info.tipTitle, info.tip, true);
      };
      box.badge.on('pointerover', show);
      box.badge.on('pointerout', () => this.hideHudTip());
      box.badge.on('pointerdown', () => { if (this.hudTip) this.hideHudTip(); else show(); });
    }
    if (isPlayer) {
      // Passive-tabje boven de box, alleen als het iets doet: Sonic Speed (extra schade) en Lucky Swing (Amy's crits)
      box.speedTagBg = this.add.graphics();
      box.speedTag = this.add.text(w - 10, -11, '', { fontFamily: FONT, fontSize: '8px', color: '#6ad8ff' }).setOrigin(1, 0);
      root.add([box.speedTagBg, box.speedTag]);
      box.speedTag.setInteractive({ useHandCursor: true });
      const showSpeed = () => {
        const p = this.player, e = this.enemy;
        if (!p || !e) return;
        const l = luckyInfo(p);
        if (l) {
          const parts = [`${Math.round(l.crit * 100)}% crit chance`];
          if (l.mult > 1.5) parts.push(`crits do ${l.mult}x`);
          if (l.extra) parts.push(`${Math.round(l.extra * 100)}% chance to swing again`);
          const next = l.next ? ` At ATK +${l.next.at}: ${l.next.what}.` : '';
          this.showHudTip(root.x + w - 6, root.y - 72, 'LUCKY SWING', `ATK +${l.atk}: ${parts.join(', ')}.${next}`, true);
          return;
        }
        if (p.def.passive?.id !== 'speedster') return;
        const dmg = Math.round((speedBonus(p, e) - 1) * 100), dodge = Math.round(dodgeChance(p, e) * 100);
        this.showHudTip(root.x + w - 6, root.y - 72, 'SONIC SPEED',
          `${p.name} is ${(p.spd / Math.max(1, e.spd)).toFixed(1)}x as fast as ${e.name}: +${dmg}% damage and ${dodge}% dodge chance.`, true);
      };
      box.speedTag.on('pointerover', showSpeed);
      box.speedTag.on('pointerout', () => this.hideHudTip());
      box.speedTag.on('pointerdown', () => { if (this.hudTip) this.hideHudTip(); else showSpeed(); });
      // Boost-meter: 6 blokjes onder de HP-balk
      root.add(this.add.text(8, 30, 'BOOST', { fontFamily: FONT, fontSize: '8px', color: '#6ad8ff' }));
      box.boostPips = Array.from({ length: MAX_BOOST }, (_, i) => this.add.rectangle(52 + i * 9, 31, 7, 6, HUD.pipEmpty).setOrigin(0).setStrokeStyle(1, HUD.outline));
      root.add(box.boostPips);
      box.hpText = this.add.text(w - 8, 30, '', { fontFamily: FONT, fontSize: '8px', color: '#cfd6ee' }).setOrigin(1, 0);
      g.fillStyle(HUD.pipEmpty).fillRect(8, 39, w - 16, 2);
      box.exp = this.add.rectangle(8, 39, 0, 2, HUD.cyan).setOrigin(0, 0);
      root.add([box.hpText, box.exp]);
    }
    return box;
  }

  private drawHud() {
    this.eBox = this.makeInfoBox(10, 26, 170, false);
    this.pBox = this.makeInfoBox(W - 186, 171, 178, true);
    // zone-effect rechts boven je box, zodat het nooit over de hoofdjes van je team valt
    this.fieldText = this.add.text(W - 8, 160, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 })
      .setOrigin(1, 0).setDepth(20);
    // je team als kleine hoofdjes boven het portret (donker = KO)
    this.partyHeads = this.party.map(() => this.add.image(0, 154, 'ui', 'head_sonic').setOrigin(0, 0).setDepth(20));
    addMenuButton(this, W - 12, 10, () => this.openPause()).setDepth(21);
    addHelpButton(this, W - 12, 30, () => this.openHelp()).setDepth(21);
    this.waveText = this.add.text(W - 24, 5, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 })
      .setOrigin(1, 0).setDepth(20);
    // ring-teller in Sonic-stijl; boven het reward-scherm zodat je ziet wat je kunt kopen
    this.ringText = new RingCounter(this, W - 24 - RingCounter.W, 17);
    this.ringText.root.setDepth(42);
    this.ringIcon = this.ringText.ring.setDepth(42);
    // hover: het precieze aantal (de teller kort grote getallen af: 12K, 3.4M)
    const ringHit = this.add.zone(W - 24 - RingCounter.W, 17, RingCounter.W, RingCounter.H).setOrigin(0).setDepth(43).setInteractive();
    // uitleg direct links van de teller
    this.hoverTip(ringHit, W - 24 - RingCounter.W - 3, 17, 'RINGS', () => this.rings.toLocaleString('en-US'), undefined, true);
    // Chaos Emerald-slots: donker tot je ze verdient (1 per zone-boss)
    EMERALDS.forEach((c, i) => {
      const e = this.add.sprite(18 + i * 22, 13, 'emeralds', `emerald_${c}_0`).setDepth(20);
      e.setTint(0x30344a).setAlpha(0.75);
      this.emeraldSlots.push(e);
    });
    // hover: wat de emeralds doen (extra EXP voor de bank)
    const emHit = this.add.zone(6, 2, EMERALDS.length * 22 + 2, 22).setOrigin(0).setDepth(43).setInteractive();
    this.hoverTip(emHit, 8, 26, 'CHAOS EMERALDS', () =>
      `${this.emeralds}/${EMERALDS.length}. Each one gives your bench +${Math.round(EMERALD_EXP_BONUS * 100)}% EXP. ` +
      `Bench EXP now: ${Math.round(benchExpRate(this.expShare, this.emeralds) * 100)}%.`);
    this.ringText.setText(`${this.rings}`);
  }

  private drawPanel() {
    // onderbalk: goud geblokte rand (finish-vlag), blauw, en een crème tekstvak zoals in de Chao Garden
    const g = this.add.graphics().setDepth(30);
    this.panelBase(g);
    sonicPanel(g, 4, PANEL_Y + 8, 288, H - PANEL_Y - 10, 'cream');
    // drie regels passen precies in het tekstvak (lange rewards en shop-uitleg)
    this.msg = this.add.text(12, PANEL_Y + 12, '', {
      fontFamily: FONT, fontSize: '8px', color: HUD.ink, lineSpacing: 3, wordWrap: { width: 272 },
    }).setDepth(31);

    // Command-menu (Fight / Party / Items / Run)
    this.cmdLayer = this.add.container(0, 0).setDepth(31).setVisible(false);
    const cg = this.add.graphics();
    sonicPanel(cg, 296, PANEL_Y + 8, 178, H - PANEL_Y - 10, 'blue');
    this.cmdLayer.add(cg);
    ['Fight', 'Party', 'Items', 'Run'].forEach((label, i) => {
      const t = this.add.text(318 + (i % 2) * 80, PANEL_Y + 15 + Math.floor(i / 2) * 15, label,
        { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (this.menu === 'command') { this.cursor = i; this.refreshCursor(); } });
      t.on('pointerdown', () => { if (this.menu === 'command') { this.cursor = i; this.confirm(); } });
      this.cmdItems.push(t);
      this.cmdLayer.add(t);
    });

    // Fight-menu (moves + info)
    this.fightLayer = this.add.container(0, 0).setDepth(32).setVisible(false);
    const fg = this.add.graphics();
    this.panelBase(fg);
    sonicPanel(fg, 4, PANEL_Y + 8, 330, H - PANEL_Y - 10, 'cream');
    sonicPanel(fg, 338, PANEL_Y + 8, 136, H - PANEL_Y - 10, 'blue');
    this.fightLayer.add(fg);
    this.moveInfo = this.add.text(346, PANEL_Y + 12, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', lineSpacing: 3 });
    this.fightLayer.add(this.moveInfo);

    // tik op het info-vak = move-info (zelfde als C)
    const infoHit = this.add.zone(338, PANEL_Y + 8, 136, H - PANEL_Y - 10).setOrigin(0).setInteractive({ useHandCursor: true });
    infoHit.on('pointerdown', () => { if (this.menu === 'fight') this.toggleMoveInfo(); });
    this.fightLayer.add([infoHit, this.add.text(346, PANEL_Y + 35, 'C: info', { fontFamily: FONT, fontSize: '8px', color: HUD.muted })]);

    // Move-info paneel boven het menu
    this.infoLayer = this.add.container(0, 0).setDepth(34).setVisible(false);
    // het vak groeit mee met de tekst (zie updateMoveInfo)
    this.infoBg = this.add.graphics();
    this.infoTitle = this.add.text(18, PANEL_Y - 66, '', { fontFamily: FONT, fontSize: '8px', color: '#f2c230' });
    this.infoBody = this.add.container(18, PANEL_Y - 50);
    this.infoLayer.add([this.infoBg, this.infoTitle, this.infoBody]);

    // Stats-paneel (C in het hoofdmenu, of tik op je HP-box)
    this.statsLayer = this.add.container(0, 0).setDepth(34).setVisible(false);
    const sg = this.add.graphics();
    sonicPanel(sg, 8, PANEL_Y - 126, 250, 122, 'blue', 0.97);
    this.statsLayer.add(sg);
    for (let i = 0; i < 8; i++) {
      const t = this.add.text(18, PANEL_Y - 118 + i * 14, '', { fontFamily: FONT, fontSize: '8px', color: i === 0 ? '#f2c230' : '#ffffff' });
      const b = this.add.text(248, PANEL_Y - 118 + i * 14, '', { fontFamily: FONT, fontSize: '8px', color: '#4ade5a' }).setOrigin(1, 0);
      this.statsRows.push(t, b);
      this.statsLayer.add([t, b]);
    }
    this.cmdLayer.add(this.add.text(12, PANEL_Y + 30, 'C stats  I info  V field', { fontFamily: FONT, fontSize: '8px', color: HUD.inkMuted }));
    const statsHit = this.add.zone(this.pBox.root.x, this.pBox.root.y, 178, 45).setOrigin(0).setDepth(21).setInteractive({ useHandCursor: true });
    statsHit.on('pointerdown', () => { if (this.menu === 'command') this.toggleStats(); });

    // Tas (Items)
    this.bagLayer = this.add.container(0, 0).setDepth(32).setVisible(false);
    const bg = this.add.graphics();
    this.panelBase(bg);
    sonicPanel(bg, 4, PANEL_Y + 8, 330, H - PANEL_Y - 10, 'cream');
    sonicPanel(bg, 338, PANEL_Y + 8, 136, H - PANEL_Y - 10, 'blue');
    this.bagInfo = this.add.text(346, PANEL_Y + 13, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', lineSpacing: 3, wordWrap: { width: 124 } });
    // weggooien: C, of klik op "C toss"
    const toss = this.add.text(324, PANEL_Y + 25, 'Z use  C toss', { fontFamily: FONT, fontSize: '8px', color: HUD.inkMuted })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    toss.on('pointerdown', () => { if (this.menu === 'bag') void this.tossItem(); });
    this.bagLayer.add([bg, this.bagInfo, toss]);

    // cursor: een draaiend ringetje
    this.pointer = this.add.sprite(0, 0, 'ui', 'ring_0').setOrigin(0, 0).setScale(0.5).setDepth(35).play('ring_spin');
  }

  /** Blauwe onderbalk met de goud geblokte rand erboven. */
  private panelBase(g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(HUD.blueTop, HUD.blueTop, HUD.blueBottom, HUD.blueBottom, 1).fillRect(0, PANEL_Y, W, H - PANEL_Y);
    checkerBand(g, 0, PANEL_Y, W, 2, 3);
    g.fillStyle(HUD.outline).fillRect(0, PANEL_Y + 6, W, 1);
  }

  /** Tas (Items): elk item als icoontje in een vakje; uitleg van wat je kiest staat rechts. */
  private buildBagItems() {
    this.bagItems.forEach(t => t.destroy());
    this.bagItems = [];
    this.bagIds = Object.keys(ITEMS).filter(id => (this.bag[id] ?? 0) > 0);
    this.bagIds.forEach((id, i) => {
      // container op de plek van de cursor (links), het vakje zelf er net rechts van
      const c = this.add.container(26 + i * 48, PANEL_Y + 21);
      const slot = this.add.graphics();
      slot.fillStyle(HUD.outline).fillRoundedRect(0, -4, 26, 20, 3);
      slot.fillStyle(HUD.pipEmpty).fillRoundedRect(1, -3, 24, 18, 2);
      const icon = this.shopIcon(id, false)[0] as Phaser.GameObjects.Image;
      icon.setPosition(13, 6);
      // aantal alleen als je er meer dan één van hebt
      const count = this.add.text(25, 15, this.bag[id] > 1 ? `${this.bag[id]}` : '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 }).setOrigin(1, 1);
      const hit = this.add.zone(-12, -4, 40, 20).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { if (this.menu === 'bag') { this.cursor = i; this.refreshCursor(); } });
      hit.on('pointerdown', () => { if (this.menu === 'bag') { this.cursor = i; this.confirm(); } });
      c.add([slot, icon, count, hit]);
      this.bagItems.push(c);
      this.bagLayer.add(c);
    });
  }

  /** C in het hoofdmenu: je stats en stat changes. */
  private toggleStats(force?: boolean) {
    const show = force ?? !this.statsLayer.visible;
    this.statsLayer.setVisible(show && this.menu === 'command');
    if (!this.statsLayer.visible) return;
    const p = this.player;
    // stage zoals in PokéRogue: +2, -1 (inclusief het zone-effect)
    const st = (k: StageKey) => { const v = p.stage(k); return v === 0 ? '' : `${v > 0 ? '+' : ''}${v}`; };
    const rows: Array<[string, string]> = [
      [`${p.name}  Lv.${p.level}  ${p.type.toUpperCase()}`, ''],
      [`HP   ${p.hp}/${p.maxHp}`, `BOOST ${p.boost}/${MAX_BOOST}`],
      [`ATK  ${p.atk}`, st('atk')],
      [`DEF  ${p.dfn}`, st('def')],
      [`SPD  ${p.spd}`, st('spd') + (p.stage('acc') ? `  ACC ${st('acc')}` : '')],
      [`EXP  ${p.exp}/${p.expToNext}`, `Bench ${Math.round(benchExpRate(this.expShare, this.emeralds) * 100)}%`],
      [`Rings ${this.rings}   Emeralds ${this.emeralds}/7`, ''],
      [p.def.passive ? `Passive: ${p.def.passive.name}` : 'Passive: -', ''],
    ];
    rows.forEach(([l, r], i) => {
      this.statsRows[i * 2].setText(l);
      // omlaag in oranje, omhoog in groen
      this.statsRows[i * 2 + 1].setText(r).setColor(r.trim().startsWith('-') || r.includes('ACC -') ? '#ff9a3a' : '#4ade5a');
    });
  }

  /** I in het hoofdmenu: de kit van je team (passive, moves, ultimate). Pijltjes wisselen van teamgenoot. */
  private openTeam() {
    this.toggleStats(false);
    audio.sfx('confirm');
    this.scene.pause();
    this.scene.launch('Team', { from: this.scene.key, party: this.party, index: this.party.indexOf(this.player) });
  }

  /** C in het Fight-menu: uitleg over de move waar je op staat. */
  private toggleMoveInfo(force?: boolean) {
    const show = force ?? !this.infoLayer.visible;
    this.infoLayer.setVisible(show && this.menu === 'fight');
    if (this.infoLayer.visible) this.updateMoveInfo();
  }

  private updateMoveInfo() {
    const m = MOVES[this.player.moves[this.cursor]];
    if (!m) return;
    this.infoTitle.setText(m.name);
    const p = this.player;
    const cost = p.isFree(m) ? '   FREE' : m.cost ? `   Boost ${m.cost}` : p.gainOf(m) ? `   Boost +${p.gainOf(m)}` : '';
    const stats = m.teamHeal ? `Heals the team ${Math.round(m.teamHeal * 100)}% HP${cost}`
      : m.heal ? `Heals ${Math.round(m.heal * 100)}% HP${cost}`
      : m.power === 0 ? `Status move   Never misses${cost}`
      : `Power ${movePower(m, this.player, this.enemy)}   Acc ${m.accuracy}%${m.priority > 0 ? '   First' : ''}${cost}`;
    // getallen goud, stats cyaan, wat de move doet groen, nadelen oranje
    this.infoBody.removeAll(true);
    const lineH = 13;
    const lines = richText(this, 0, 0, `${stats}\n${m.desc}`, 40, lineH, '#ffffff', this.infoBody);
    // vak net zo hoog als de tekst nodig heeft; de onderkant blijft boven het menu staan
    const w = 342, h = 30 + lines * lineH - 5, x = 8, y = PANEL_Y - 4 - h;
    this.infoBg.clear();
    sonicPanel(this.infoBg, x, y, w, h, 'blue', 0.97);
    this.infoTitle.setPosition(x + 10, y + 8);
    this.infoBody.setPosition(x + 10, y + 24);
  }

  private buildFightItems() {
    this.fightItems.forEach(t => t.destroy());
    this.fightItems = [];
    this.fightGlows.forEach(g => g.destroy());
    this.fightGlows = [];
    const ids = [...this.player.moves];
    while (ids.length < 4) ids.push('');
    ids.forEach((id, i) => {
      // te weinig Boost = grijs; de ultimate is goud
      const m = id ? MOVES[id] : undefined;
      // gratis (Shadow na een KO) = groen
      const color = !m ? HUD.inkMuted : !this.player.canUse(m) ? HUD.inkMuted : this.player.isFree(m) ? '#108a30' : m.anim === 'ultimate' ? '#d04000' : HUD.ink;
      const t = this.add.text(26 + (i % 2) * 150, PANEL_Y + 15 + Math.floor(i / 2) * 15, m ? m.name : '-',
        { fontFamily: FONT, fontSize: '8px', color });
      // groene gloed = type-voordeel tegen deze vijand, oranje = nadeel (zoals in PokéRogue)
      const eff = m && !m.heal && m.power > 0 ? typeMultiplier(this.player.type, this.enemy.type) : 1;
      if (eff !== 1 && this.player.canUse(m!)) {
        // groen pijltje omhoog = type-voordeel, oranje omlaag = nadeel
        const ax = t.x + t.width + 5, ay = t.y + 4;
        const arrow = eff > 1
          ? this.add.triangle(ax, ay, 0, 6, 8, 6, 4, 0, 0x3cd85a).setOrigin(0, 0.5)
          : this.add.triangle(ax, ay, 0, 0, 8, 0, 4, 6, 0xff8a2a).setOrigin(0, 0.5);
        arrow.setStrokeStyle(1, HUD.outline);
        this.fightGlows.push(arrow);
        this.fightLayer.add(arrow);
      }
      if (id) {
        t.setInteractive({ useHandCursor: true });
        t.on('pointerover', () => { if (this.menu === 'fight') { this.cursor = i; this.refreshCursor(); } });
        t.on('pointerdown', () => { if (this.menu === 'fight') { this.cursor = i; this.confirm(); } });
      }
      this.fightItems.push(t);
      this.fightLayer.add(t);
    });
  }

  // ---------------------------------------------------------------- input
  private bindInput() {
    const kb = this.input.keyboard!;
    kb.removeAllListeners();
    kb.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // tip van Tails open: Z / X sluit hem, verder niks
      if (this.talkBox) {
        if (['z', 'enter', ' '].includes(k)) this.talkBox.next();
        else if (['x', 'escape', 'backspace'].includes(k)) this.talkBox.skip();
        return;
      }
      if (this.tipBox) {
        if (['z', 'enter', ' ', 'x', 'escape', 'backspace'].includes(k)) this.tipBox.close();
        return;
      }
      // tutorial: als Tails praat, gaat Z verder (M opent het pauzemenu, verder niks)
      if (this.tut?.talking) {
        if (['z', 'enter', ' '].includes(k)) this.tut.next();
        else if (k === 'm') this.openPause();
        return;
      }
      if (TEST_MODE && this.testKey(k)) return;
      if (this.menu === 'choice') {
        if (['arrowup', 'w', 'arrowleft', 'a'].includes(k)) this.moveChoice(-1);
        else if (['arrowdown', 's', 'arrowright', 'd'].includes(k)) this.moveChoice(1);
        else if (['z', 'enter', ' '].includes(k)) this.pickChoice(this.cursor);
        else if (['x', 'escape', 'backspace'].includes(k) && this.choiceCancel) this.endChoice(-1);
        return;
      }
      if (['arrowleft', 'a'].includes(k)) this.moveCursor(-1, 0);
      else if (['arrowright', 'd'].includes(k)) this.moveCursor(1, 0);
      else if (['arrowup', 'w'].includes(k)) this.moveCursor(0, -1);
      else if (['arrowdown', 's'].includes(k)) this.moveCursor(0, 1);
      else if (['z', 'enter', ' '].includes(k)) this.confirm();
      else if (['x', 'escape', 'backspace'].includes(k)) this.back();
      else if (k === 'c' && this.menu === 'fight') this.toggleMoveInfo();
      else if (k === 'c' && this.menu === 'command') this.toggleStats();
      else if (k === 'c' && (this.menu === 'bag' || this.menu === 'reward')) void this.tossItem();
      else if (k === 'i' && (this.menu === 'command' || this.menu === 'reward')) this.openTeam();
      else if (k === 'v' && (this.menu === 'command' || this.menu === 'fight')) this.toggleField();
      else if (k === 'h') this.openHelp();
      else if (k === 'm') this.openPause();
    });
  }

  private moveCursor(dx: number, dy: number) {
    const before = `${this.cursor}/${this.rewardRow}`;
    this.moveCursorInner(dx, dy);
    if (`${this.cursor}/${this.rewardRow}` !== before) audio.sfx('cursormove');
  }

  private moveCursorInner(dx: number, dy: number) {
    if (this.menu === 'command' || this.menu === 'fight' || this.menu === 'bag') {
      let col = this.cursor % 2, row = Math.floor(this.cursor / 2);
      col = Phaser.Math.Clamp(col + dx, 0, 1);
      row = Phaser.Math.Clamp(row + dy, 0, 1);
      const next = row * 2 + col;
      if (this.menu === 'fight' && !this.player.moves[next]) return; // moves = de 3 vaste + de ultimate
      if (this.menu === 'bag' && next >= this.bagIds.length) return;
      this.cursor = next;
      this.refreshCursor();
    } else if (this.menu === 'reward') {
      if (dy !== 0 && this.shopButtons.length) {
        this.rewardRow = dy < 0 ? 1 : 0; // shop staat boven de rewards
        const n = this.rewardRow === 0 ? this.rewardCards.length : this.shopButtons.length;
        this.cursor = Math.min(this.cursor, n - 1);
      } else if (dx !== 0) {
        const n = this.rewardRow === 0 ? this.rewardCards.length : this.shopButtons.length;
        this.cursor = Phaser.Math.Wrap(this.cursor + dx, 0, n);
      }
      this.refreshCursor();
    }
  }

  private refreshCursor() {
    this.pointer.setVisible(this.menu === 'command' || this.menu === 'fight' || (this.menu === 'bag' && this.bagIds.length > 0));
    if (this.menu === 'command') {
      const t = this.cmdItems[this.cursor];
      this.pointer.setPosition(t.x - 11, t.y);
    } else if (this.menu === 'fight') {
      const t = this.fightItems[this.cursor];
      this.pointer.setPosition(t.x - 11, t.y);
      const m = MOVES[this.player.moves[this.cursor]];
      const p = this.player;
      const boost = p.isFree(m) ? 'FREE!' : m.cost ? `BOOST ${m.cost}` : p.gainOf(m) ? `BOOST +${p.gainOf(m)}` : 'BOOST 0';
      const acc = Math.min(100, Math.round(m.accuracy * stageMultiplier(this.player.stage('acc'))));
      this.moveInfo.setText(m.heal ? `HEAL ${Math.round(m.heal * 100)}%\n${boost}` : m.power === 0 ? `STATUS\n${boost}` : `PWR ${movePower(m, this.player, this.enemy)} ACC ${acc}\n${boost}`);
      this.moveInfo.setColor(this.player.canUse(m) ? '#ffffff' : '#ff7a6a');
      if (this.infoLayer.visible) this.updateMoveInfo();
    } else if (this.menu === 'bag') {
      if (!this.bagIds.length) { this.bagInfo.setText('Bag is empty.\nVisit the shop!'); return; }
      const t = this.bagItems[this.cursor];
      this.pointer.setPosition(t.x - 11, t.y + 2);
      const it = ITEMS[this.bagIds[this.cursor]];
      this.bagInfo.setText(it.desc);
    } else if (this.menu === 'reward') {
      this.rewardCards.forEach((c, i) => {
        const sel = this.rewardRow === 0 && i === this.cursor;
        c.y = sel ? 163 : 166;
        (c.getByName('sel') as Phaser.GameObjects.Graphics).setVisible(sel);
      });
      this.shopButtons.forEach((b, i) => {
        const sel = this.rewardRow === 1 && i === this.cursor;
        (b.getByName('sel') as Phaser.GameObjects.Graphics).setVisible(sel);
        b.y = sel ? SHOP_TILE_Y - 2 : SHOP_TILE_Y;
      });
      if (this.rewardRow === 0) {
        const r = this.rewardChoices[this.cursor];
        this.msg.setText(`${TIER_NAME[r.tier]}  ${r.name}${r.plus ? '+' : ''}: ${r.desc(this.rewardCtx()).replace('\n', ' ')}\nFree! Pick one.   I: view team`);
      } else if (this.cursor < this.shopItems.length) {
        const it = this.shopItems[this.cursor];
        this.msg.setText(`${it.name}: ${it.desc}\nCost ${it.price} rings. In bag: ${this.bag[it.id] ?? 0}`);
      } else {
        this.msg.setText(`Reroll: new free rewards\nCost ${this.rerollCost()} rings.`);
      }
    }
  }

  /** Tutorial: mag deze actie nu? Zo niet, dan schudt Tails nee. Buiten de tutorial mag alles. */
  private tutOk(action: string) {
    if (!this.tut || this.tut.allows(action)) return true;
    audio.sfx('errorclick');
    this.tut.nudge();
    return false;
  }

  private confirm() {
    if (this.menu === 'command' && !this.tutOk(`cmd:${this.cursor}`)) return;
    if (this.menu === 'fight' && this.player.moves[this.cursor] && !this.tutOk(`move:${this.player.moves[this.cursor]}`)) return;
    if (this.menu === 'command' || this.menu === 'fight' || this.menu === 'bag') audio.sfx('confirm');
    if (this.menu === 'command') {
      if (this.cursor === 0) this.openFight();
      else if (this.cursor === 1) this.switchInBattle();
      else if (this.cursor === 2) this.openBag();
      else this.flash(`${this.player.name} doesn't run from a fight!`);
    } else if (this.menu === 'fight') {
      const id = this.player.moves[this.cursor];
      if (!id) return;
      if (!this.player.canUse(MOVES[id])) {
        audio.sfx('errorclick');
        this.cameras.main.shake(80, 0.002);
        return;
      }
      this.lastMove = this.cursor; this.toggleMoveInfo(false);
      const move = MOVES[id];
      if (move.ally && this.party.filter(f => !f.fainted).length > 1) this.pickHealTarget(move);
      else this.runTurn(move);
    } else if (this.menu === 'bag') {
      const id = this.bagIds[this.cursor];
      if (id) this.useItem(id);
    } else if (this.menu === 'reward') {
      if (this.rewardRow === 0) this.pickReward(this.cursor);
      else this.buyItem(this.cursor);
    } else if (this.menu === 'gameover') {
      this.toStarter();
    }
  }

  private back() {
    if (['fight', 'bag'].includes(this.menu) || this.statsLayer.visible) audio.sfx('back');
    if (this.fieldLayer) { this.toggleField(false); return; }
    if (this.menu === 'command' && this.statsLayer.visible) this.toggleStats(false);
    else if (this.menu === 'fight' && this.infoLayer.visible) this.toggleMoveInfo(false);
    else if (this.menu === 'fight') this.openCommand(0);
    else if (this.menu === 'bag') this.openCommand(2);
  }

  private openCommand(cursor = 0) {
    this.menu = 'command';
    this.cursor = cursor;
    this.fightLayer.setVisible(false);
    this.bagLayer.setVisible(false);
    this.infoLayer.setVisible(false);
    this.statsLayer.setVisible(false);
    this.cmdLayer.setVisible(true);
    this.msg.setVisible(true).setText(`What will ${this.player.name} do?`);
    this.refreshCursor();
    this.tut?.event('command');
  }

  private openFight() {
    this.statsLayer.setVisible(false);
    this.menu = 'fight';
    // cursor begint op de laatst gebruikte move (gereset na een boss)
    this.cursor = this.player.moves[this.lastMove] ? this.lastMove : 0;
    this.buildFightItems();
    this.fightLayer.setVisible(true);
    this.msg.setVisible(false);
    this.refreshCursor();
  }

  private openBag() {
    this.statsLayer.setVisible(false);
    this.menu = 'bag';
    this.cursor = 0;
    this.buildBagItems();
    this.bagLayer.setVisible(true);
    this.cmdLayer.setVisible(false);
    this.msg.setVisible(false);
    this.refreshCursor();
  }

  /**
   * Item uit je tas: kost geen beurt (zoals potions in Slay the Spire), maar je mag er maar
   * ITEMS_PER_FIGHT per gevecht gebruiken. Heals kies je zelf voor wie.
   */
  /**
   * Een item weggooien (C in de tas, of in het reward-scherm). In de tas het item onder de cursor,
   * in het reward-scherm kies je welk. Daarna terug naar waar je was.
   */
  private async tossItem() {
    const from = this.menu;
    const ids = Object.keys(ITEMS).filter(id => (this.bag[id] ?? 0) > 0);
    if (!ids.length) { audio.sfx('errorclick'); return; }
    if (from === 'bag') this.bagLayer.setVisible(false);
    let id: string | undefined;
    if (from === 'bag') {
      const cur = this.bagIds[this.cursor];
      const yes = await this.choose(`Toss the ${ITEMS[cur].name}?`, [{ label: 'Toss it' }, { label: 'Keep it' }], true);
      if (yes === 0) id = cur;
    } else {
      const rows = ids.map(i => ({ label: ITEMS[i].name, right: this.bag[i] > 1 ? `x${this.bag[i]}` : '' }));
      const pick = await this.choose('Toss which item?', [...rows, { label: 'Keep them' }], true);
      if (pick >= 0 && pick < ids.length) id = ids[pick];
    }
    if (id) {
      this.bag[id]--;
      if (this.bag[id] <= 0) delete this.bag[id];
      audio.sfx('back');
    }
    if (from === 'bag') {
      this.openBag();
      if (id) this.bagInfo.setText(`Tossed the ${ITEMS[id].name}.`);
    } else {
      this.menu = 'reward';
      this.refreshCursor();
      if (id) this.msg.setText(`Tossed the ${ITEMS[id].name}.\n(${bagCount(this.bag)}/${BAG_SIZE} in bag)`);
    }
  }

  private async useItem(id: string) {
    if (!this.tutOk(`item:${id}`)) return;
    const item = ITEMS[id];
    let target = this.player;
    if (this.itemsUsed >= ITEMS_PER_FIGHT) {
      this.bagLayer.setVisible(false);
      this.menu = 'busy';
      this.pointer.setVisible(false);
      await this.say(`You already used an item this fight!`, 900);
      this.openBag();
      return;
    }
    if (!item.revive) {
      const can = (f: Fighter) => !f.fainted && f.hp < f.maxHp;
      this.bagLayer.setVisible(false);
      if (!this.party.some(can)) {
        this.menu = 'busy';
        this.pointer.setVisible(false);
        await this.say('Everyone is at full HP!', 900);
        this.openBag();
        return;
      }
      if (this.party.filter(can).length > 1 || !can(this.player)) {
        const i = await this.pickHealTarget2(`${item.name}: heal who?`, true);
        if (i < 0) { this.openBag(); return; }
        target = this.party[i];
      }
    }
    if (item.revive) {
      this.bagLayer.setVisible(false);
      if (!this.party.some(f => f.fainted)) {
        this.menu = 'busy';
        this.pointer.setVisible(false);
        await this.say('Nobody on your team is down right now!', 900);
        this.openBag();
        return;
      }
      const i = await this.pickReviveTarget('Revive who?', true);
      if (i < 0) { this.openBag(); return; }
      target = this.party[i];
    }
    this.menu = 'busy';
    this.pointer.setVisible(false);
    this.bag[id]--;
    await this.say(`${this.player.name} used a ${item.name}!`, 150);
    if (target === this.player) {
      const sp = this.add.sprite(this.hero.x, this.hero.y - 40, 'ui', 'sparkle_0').setDepth(25).setScale(2).play('sparkle');
      sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
    }
    const text = item.use(target);
    this.itemsUsed++;
    this.tut?.event('item');
    audio.sfx('heal1');
    this.refreshPartyHeads();
    await this.setBox(this.pBox, this.player, true);
    await this.say(text, 350);
    this.openCommand(2);
  }

  /** Teamgenoot kiezen om te genezen (KO of al vol = grijs). `extra` = bijv. "Keep in bag". */
  private pickHealTarget2(title: string, cancel: boolean, extra?: ChoiceRow): Promise<number> {
    const rows = this.party.map(f => this.partyRow(f, f.fainted || f.hp >= f.maxHp));
    if (extra) rows.push(extra);
    return this.choose(title, rows, cancel);
  }

  private async flash(text: string) {
    this.menu = 'busy';
    this.pointer.setVisible(false);
    await this.say(text, 1100);
    this.openCommand(this.cursor);
  }

  private toStarter() {
    this.menu = 'busy';
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('CharSelect'));
  }

  // ---------------------------------------------------------------- helpers
  private wait(ms: number) { return new Promise<void>(r => this.time.delayedCall(ms, () => r())); }

  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig) {
    return new Promise<void>(r => this.tweens.add({ ...cfg, onComplete: () => r() }));
  }

  /** Speelt een animatie één keer af en wacht tot hij klaar is (als hij bestaat). */
  private playOnce(spr: Phaser.GameObjects.Sprite, key: string) {
    if (!this.anims.exists(key)) return Promise.resolve();
    return new Promise<void>(r => {
      let done = false;
      const finish = () => { if (!done) { done = true; r(); } };
      spr.play(key);
      spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, finish);
      // vangnet: als iets anders de animatie onderbreekt, niet eeuwig blijven wachten
      const anim = this.anims.get(key);
      this.time.delayedCall((anim.frames.length / anim.frameRate) * 1000 + 250, finish);
    });
  }

  private async say(text: string, hold = 650) {
    this.cmdLayer.setVisible(false);
    this.fightLayer.setVisible(false);
    this.bagLayer.setVisible(false);
    this.infoLayer.setVisible(false);
    this.statsLayer.setVisible(false);
    this.msg.setVisible(true).setText('');
    // tekstsnelheid staat los van de battle-snelheid: echte tijd, niet this.time
    const d = charDelay();
    if (d === 0) this.msg.setText(text);
    else for (let i = 1; i <= text.length; i++) {
      this.msg.setText(text.slice(0, i));
      await this.realWait(d);
    }
    await this.realWait(hold * holdFactor());
  }

  /** wacht in echte tijd (niet versneld door battle speed), maar staat stil bij pauze */
  private realWait(ms: number) {
    return new Promise<void>(r => this.time.delayedCall(ms * this.time.timeScale, () => r()));
  }

  private hpColor(frac: number) { return frac > 0.5 ? 0x4ade5a : frac > 0.2 ? 0xf2c230 : 0xe8443a; }

  private setBox(box: InfoBox, f: Fighter, animate: boolean) {
    box.name.setText(f.name);
    if (box === this.pBox) this.refreshPartyHeads();
    box.typeIcon.setTexture(`type_${f.type}`).setX(box.name.x + box.name.width + 4);
    if (box.badge) {
      const info = this.enemyBadge();
      box.badge.setText(info.text).setColor(info.color);
      // tabje onder de box, rechts uitgelijnd
      box.badgeBg!.clear();
      if (info.text) {
        const bw = box.badge.width + 8;
        box.badgeBg!.fillStyle(HUD.outline, 0.95).fillRoundedRect(box.badge.x - bw + 4, box.badge.y - 2, bw, 12, 3);
        box.badgeBg!.fillStyle(HUD.blueBottom, 0.95).fillRect(box.badge.x - bw + 5, box.badge.y - 1, bw - 2, 10);
        box.badgeBg!.lineStyle(1, Phaser.Display.Color.HexStringToColor(info.color).color).strokeRect(box.badge.x - bw + 5.5, box.badge.y - 0.5, bw - 3, 9);
      }
      // boss-balk in stukken: elk stuk is een schild (zie shieldCap)
      box.segments!.clear();
      if (f.segments > 1) {
        box.segments!.fillStyle(HUD.outline);
        for (let i = 1; i < f.segments; i++) box.segments!.fillRect(34 + (box.barW * i) / f.segments - 1, BOX_BAR_Y, 2, 4);
      }
    }
    box.boostPips?.forEach((pip, i) => pip.setFillStyle(i < f.boost ? (f.boost >= MAX_BOOST ? HUD.pipFull : HUD.pip) : HUD.pipEmpty));
    if (!box.expAnimating) box.level.setText(`Lv.${f.level}`);
    const target = Math.max(0, f.hp);
    const apply = (hp: number) => {
      const frac = hp / f.maxHp;
      box.bar.width = Math.max(0, box.barW * frac);
      box.bar.fillColor = this.hpColor(frac);
      box.hpText?.setText(`${Math.ceil(hp)}/${f.maxHp}`);
    };
    if (box.exp && !box.expAnimating) box.exp.width = this.expWidth(f.exp / f.expToNext);
    if (!animate) { box.shownHp = target; apply(target); return Promise.resolve(); }
    const from = { v: box.shownHp };
    box.shownHp = target;
    return this.tween({ targets: from, v: target, duration: 450, ease: 'Sine.easeOut', onUpdate: () => apply(from.v) });
  }

  private expWidth(frac: number) { return Math.max(0, Math.min(1, frac)) * (this.pBox.barW + 26); }

  /**
   * EXP-balk loopt vloeiend vol, zoals in Pokémon. Bij een level-up loopt hij helemaal vol,
   * flitst, het level telt op en de balk begint weer bij 0 voor het volgende stuk.
   */
  private async animateExp(fromLevel: number, fromExp: number) {
    const p = this.player;
    const box = this.pBox;
    const bar = box.exp!;
    const need = (lvl: number) => 6 + lvl * 5; // zelfde formule als Fighter.expToNext
    let lvl = fromLevel;
    bar.width = this.expWidth(fromExp / need(lvl));
    while (lvl < p.level) {
      await this.tween({ targets: bar, width: this.expWidth(1), duration: 500, ease: 'Linear' });
      lvl++;
      box.level.setText(`Lv.${lvl}`);
      if (lvl === fromLevel + 1) audio.sfx('levelup', { volume: 0.8 });
      // level-up flits op de box + glinster
      bar.fillColor = 0xffffff;
      this.tweens.add({ targets: box.level, scale: 1.4, duration: 120, yoyo: true });
      const sp = this.add.sprite(box.root.x + box.barW, box.root.y + 8, 'ui', 'sparkle_0').setDepth(25).setScale(2).play('sparkle');
      sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
      // nieuwe max-HP direct tonen
      this.setBox(box, p, true);
      await this.wait(160);
      bar.fillColor = HUD.cyan;
      bar.width = 0;
    }
    const finalW = this.expWidth(p.exp / p.expToNext);
    const dur = Math.max(150, 500 * (finalW - bar.width) / this.expWidth(1));
    await this.tween({ targets: bar, width: finalW, duration: dur, ease: 'Linear' });
    box.expAnimating = false;
    this.setBox(box, p, false);
  }

  private burst(x: number, y: number, color = 0xffffff, n = 10) {
    for (let i = 0; i < n; i++) {
      const p = this.add.image(x, y, 'px').setTint(color).setDepth(15);
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const d = 14 + Math.random() * 18;
      this.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 380, onComplete: () => p.destroy() });
    }
  }

  private popNumber(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: '8px', color }).setOrigin(0.5).setDepth(25).setShadow(1, 1, '#000', 0);
    this.tweens.add({ targets: t, y: y - 18, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  /** Grote "MISS" die even opspringt naast het doelwit en dan vervaagt. */
  private popMiss(x: number, y: number) {
    const t = this.add.text(x, y, 'MISS', {
      fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#0a1450', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(25).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, y: y - 10, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: y - 22, delay: 750, duration: 350, onComplete: () => t.destroy() });
  }

  /**
   * Sonic ontwijkt: op het moment van de klap schiet hij als blauwe bal schuin naar achteren, met nabeelden,
   * een witte flits op de plek waar hij stond en snelheidsstrepen. Daarna landt hij weer op zijn plek.
   */
  private async dodgeFx(spr: Phaser.GameObjects.Sprite, f: Fighter, away: number) {
    const x0 = spr.x, y0 = spr.y, sx = spr.scaleX, sy = spr.scaleY;
    const c = this.center(spr);
    audio.sfx('dash', { volume: 0.7 });
    // witte flits van zijn silhouet, die uitdijt (hier stond hij net nog)
    const flash = this.add.sprite(x0, y0, spr.texture.key, spr.frame.name).setOrigin(0.5, 1).setScale(sx, sy)
      .setFlipX(spr.flipX).setTintFill(0xffffff).setAlpha(0.9).setDepth(spr.depth + 1);
    this.tweens.add({ targets: flash, alpha: 0, scaleX: sx * 1.35, scaleY: sy * 1.2, duration: 280, ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
    shockwave(this, c.x, c.y, 0x6ad8ff, 30, 240);
    // snelheidsstrepen die de andere kant op flitsen
    for (let i = 0; i < 7; i++) {
      const y = c.y + Phaser.Math.Between(-30, 26);
      const len = Phaser.Math.Between(28, 64);
      const line = this.add.image(x0 - away * 10, y, 'px').setOrigin(away > 0 ? 1 : 0, 0.5).setDisplaySize(len, i % 3 ? 1 : 2)
        .setTint(i % 2 ? 0xffffff : 0x8af0ff).setAlpha(0.9).setDepth(spr.depth - 1).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: line, x: line.x + away * Phaser.Math.Between(50, 90), alpha: 0, duration: 220, delay: i * 18, ease: 'Quad.easeOut', onComplete: () => line.destroy() });
    }
    // nabeelden langs zijn pad
    const trail = this.time.addEvent({ delay: 22, repeat: 14, callback: () => this.ghost(spr, Math.random() < 0.5 ? 0x6ad8ff : 0x3a6aff) });
    if (this.anims.exists(f.anim('spin'))) spr.play(f.anim('spin'));
    // DODGE!
    const t = this.add.text(x0 - away * 4, y0 - this.bodyHeight(spr) - 6, 'DODGE!', {
      fontFamily: FONT, fontSize: '16px', color: '#8af0ff', stroke: '#0a1450', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(25).setScale(0.3).setAngle(-6 * away);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 16, delay: 700, duration: 350, onComplete: () => t.destroy() });
    // wegschieten (schuin naar achteren en omhoog), even hangen met een glinster, terug en landen
    await this.tween({ targets: spr, x: x0 + away * 46, y: y0 - 34, duration: 120, ease: 'Quad.easeOut' });
    const apex = this.center(spr);
    for (let i = 0; i < 4; i++) {
      const st = this.add.image(apex.x, apex.y, 'star').setTint(0xcff6ff).setDepth(spr.depth + 1).setBlendMode(Phaser.BlendModes.ADD).setScale(1.2);
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this.tweens.add({ targets: st, x: apex.x + Math.cos(a) * 18, y: apex.y + Math.sin(a) * 18, scale: 0.2, alpha: 0, duration: 260, onComplete: () => st.destroy() });
    }
    await this.wait(110);
    await this.tween({ targets: spr, x: x0, y: y0, duration: 190, ease: 'Quad.easeIn' });
    trail.remove();
    spr.setPosition(x0, y0);
    if (!f.fainted) spr.play(f.anim('idle'));
    this.land(spr, sx);
  }

  private hitFlash(target: Phaser.GameObjects.Sprite) {
    return this.tween({ targets: target, alpha: 0.2, duration: 60, yoyo: true, repeat: 2 });
  }

  /** Midden van een sprite (origin zit onderaan). */
  /**
   * Hoe hoog iemand er echt uitziet. Character-atlassen hebben vaste cellen zo hoog als het grootste frame
   * (Knuckles' vuurpunch), dus displayHeight is daar te veel: dan rekenen we met een vaste lichaamshoogte.
   */
  private bodyHeight(s: Phaser.GameObjects.Sprite) {
    return CHARACTER_TEXTURES.has(s.texture.key) ? CHARACTER_BODY * s.scaleY : s.displayHeight;
  }
  private center(s: Phaser.GameObjects.Sprite) {
    return { x: s.x, y: s.y - (CHARACTER_TEXTURES.has(s.texture.key) ? this.bodyHeight(s) * 0.45 : s.displayHeight * 0.4) };
  }

  // ---------------------------------------------------------------- flow
  /** Auto-save: de run zoals hij nu is, zodat je na het sluiten verder kunt bij deze wave. */
  private autoSave(wave = this.wave) {
    if (this.tutorialMode) return; // oefenen telt niet
    saveRun({
      wave, rings: this.rings, emeralds: this.emeralds, expShare: this.expShare,
      bag: { ...this.bag }, rivalsMet: [...this.rivalsMet], fieldCleared: this.fieldCleared, buffs: { ...this.buffs }, zoneOrder: [...this.zoneOrder],
      active: Math.max(0, this.party.indexOf(this.player)), party: this.party.map(fighterToSave),
    });
  }

  private async startWave() {
    this.autoSave();
    this.menu = 'busy';
    // gif, ijs en stat-verlagingen van badniks duren maar één gevecht
    this.party.forEach(f => {
      f.stun = 0; f.evade = 0; f.pierced = 0; f.poison = 0; f.frozen = false;
      for (const k of Object.keys(f.stages) as StageKey[]) f.stages[k] = Math.max(0, f.stages[k]);
    });
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
    this.updateShield();
    this.pointer.setVisible(false);
    this.cmdLayer.setVisible(false);
    this.msg.setVisible(true).setText('');
    // vijand-box pas tonen als de vijand er is; jouw box meteen gevuld
    this.eBox.root.setAlpha(0);
    this.setBox(this.pBox, this.player, false);
    const zone = zoneForWave(this.wave, this.zoneOrder);
    const boss = isBossWave(this.wave);
    // rivals: vaak op waves die op 5 eindigen, en later soms ook op een gewone wave
    const rivalId = !this.forceFoe && (this.forceRival || (!this.tutorialMode && Math.random() < rivalChance(this.wave))) ? this.pickRival() : undefined;
    this.forceRival = false;
    this.rival = !!rivalId;
    const elite = ((isEliteWave(this.wave) || this.alarmWave) && !this.rival && !boss) || !!this.forceElite;
    this.elite = elite;
    // main boss (wave 20, 40, ...): Eggman of Shadow; zone-boss: die van de zone
    const mainBoss = boss && isMainBossWave(this.wave) && !this.tutorialMode;
    const id = this.forceFoe ?? (this.tutorialMode ? 'beetle' : undefined) ?? rivalId ?? (mainBoss ? mainBossFor(this.wave, this.party.map(f => f.def.id), this.mainBossRoll) : boss ? zone.boss : Phaser.Utils.Array.GetRandom(zone.enemies));
    // vijanden stijgen ~0,65 level per wave; jij blijft dan net iets voor (bosses/elites +2, rivals op gelijk niveau)
    this.enemy = new Fighter(id, this.tutorialMode ? 3 : 4 + Math.floor(0.65 * (this.wave - 1)) + (boss || elite ? 2 : 0) + (rivalId ? rivalLevelBonus(this.wave) : 0));
    this.charFoe = HEROES.includes(id);
    // badniks en bosses worden per zone sterker (rivals en boss-Shadow hebben al character-stats)
    if (!this.charFoe && !this.tutorialMode) { this.enemy.statMult = enemyScaling(this.wave); this.enemy.hp = this.enemy.maxHp; }
    // wie deze wave meevecht, krijgt de volle EXP
    this.waveFighters = new Set([this.player]);
    this.foeUltUsed = false;
    this.foeBless = 0;
    // boss-Shadow: meer HP; bosses krijgen schilden (stukken HP-balk)
    if (this.charFoe && boss) { this.enemy.hpMult = SHADOW_BOSS_HP; this.enemy.hp = this.enemy.maxHp; }
    if (boss && !this.tutorialMode) this.enemy.segments = mainBoss ? MAIN_BOSS_SHIELDS : ZONE_BOSS_SHIELDS;
    // elites krijgen een random extra eigenschap (Armored, Enraged, Regenerating, Swift)
    if (elite) applyElite(this.enemy, this.forceElite ?? Phaser.Utils.Array.GetRandom(ELITE_IDS));
    this.forceFoe = undefined;
    this.forceElite = undefined;
    if (rivalId) { this.rivalsMet.push(rivalId); applyRival(this.enemy); }
    // zone-bosses zijn type-neutraal zolang je maar 1 character hebt (anders is een boss voor sommigen onmogelijk)
    if (boss && BOSS_TYPE_NEUTRAL) this.enemy.typeOverride = this.player.type;
    // Eggman bouwt zijn Egg Mobile elke keer anders: een random type (anders is één type altijd sterk tegen hem)
    if (id === 'eggman') this.enemy.typeOverride = Phaser.Utils.Array.GetRandom(FIGHTER_TYPES);

    // nieuwe zone: achtergrond wisselen + zone-titel; boss-wave: Chaos Angel
    const firstOfZone = waveInZone(this.wave) === 1;
    // main bosses in de ruimte: X-Zone (wave 20, 60) en XX (wave 40, 80, en altijd bij Shadow)
    const space = id === 'shadow' || this.wave % 40 === 0 ? 'xx' : 'xzone';
    this.setBackdrop(mainBoss ? space : boss ? 'chaosangel' : zone.backdrop, this.wave === 1 ? 0 : 600);
    this.applyZoneEffect(this.fieldCleared ? undefined : zone.effect);
    audio.playMusic(id === 'eggman' ? 'eggman' : boss || this.rival ? 'boss' : (zone.backdrop as MusicKey));
    this.waveText.setText(`${zone.name} - Wave ${this.wave}`);
    this.hero.play(this.player.anim('idle'));
    if (firstOfZone) await this.zoneBanner(zone.name, Math.floor((this.wave - 1) / 10) + 1);
    if (firstOfZone && zone.effect && !this.fieldCleared) {
      await this.say(`${zone.effect.name}! ${zone.effect.desc}.`, 700);
      await this.tip('zone');
    }
    const d = this.enemy.def;
    this.waveText.setText(this.tutorialMode ? 'TUTORIAL  -  M: quit' : `${zone.name} - Wave ${this.wave}`);
    this.ringText.setText(`${this.rings}`);

    this.foeHover?.stop();
    this.foeHome = { x: ENEMY_POS.x, y: ENEMY_POS.y - (d.hover ?? 0) };
    this.foe.setTexture(d.atlas).setAlpha(1).setAngle(0).clearTint().setScale(d.scale)
      .setFlipX(!!d.facesRight).setPosition(W + 80, this.foeHome.y).setVisible(true);
    this.foe.play(this.enemy.anim('idle'));
    this.eBox.root.setAlpha(0);
    this.setBox(this.eBox, this.enemy, false);
    this.setBox(this.pBox, this.player, false);
    this.hero.play(this.player.anim('idle'));

    await this.tween({ targets: this.foe, x: this.foeHome.x, duration: 700, ease: 'Cubic.easeOut' });
    this.startHover();
    this.tweens.add({ targets: this.eBox.root, alpha: 1, duration: 250 });
    if (boss) this.cameras.main.shake(300, 0.006);
    if (this.rival) { await this.rivalBanner(); await this.rivalTalk('intro'); }
    else if (mainBoss) await this.rivalBanner('BOSS!');
    if (id === 'shadow' && boss) audio.voice('shadowlaugh');
    else if (id === 'eggman') audio.voice('eggmanlaugh');
    const rt = this.rival && this.enemy.rivalTrait ? RIVAL_TRAITS[this.enemy.def.id] : undefined;
    await this.say(this.rival ? `Rival ${this.enemy.name} wants to battle!`
      : id === 'shadow' && boss ? 'Shadow blocks the way! "Show me what you\'ve got."'
      : id === 'eggman' ? `Dr. Eggman appeared in a ${this.enemy.type.toUpperCase()} type Egg Mobile! "Hohoho! You won't get past me!"`
      : boss ? `Watch out! ${this.enemy.name} appeared!` : elite ? `A strong ${this.enemy.name} appeared! It's ${ELITE_TRAITS[this.enemy.elite!].name.toLowerCase()}!` : `A wild ${this.enemy.name} appeared!`, 500);
    if (rt) await this.say(`${rt.name}! ${rt.desc}`, 600);
    // Battle Style "Switch": voor elke wave (behalve de eerste) gratis wisselen
    if (this.rival) await this.tip('rival');
    else if (boss) await this.tip('boss');
    if (this.wave > 1 && settings.battleStyle === 0 && this.party.filter(f => !f.fainted).length > 1) {
      await this.tip('switch');
      const yes = await this.choose(`Will you switch\ncharacters?`, [{ label: 'Yes' }, { label: 'No' }], true);
      if (yes === 0) {
        const i = await this.pickTeammate('Who goes in?', true);
        if (i >= 0) await this.switchTo(this.party[i]);
      }
    }
    await this.chaoCare();
    // rival-trucs aan het begin: Head Start (Sonic valt meteen aan), Ambush (Tails verdooft je)
    if (this.rival && this.enemy.rivalTrait === 'headStart') {
      await this.say(`Rival ${this.enemy.name} is too fast! He attacks before you can move!`, 400);
      const move = this.pickEnemyMove();
      this.enemy.chargeReady = this.enemy.charged;
      await this.act(this.enemy, this.player, move);
      if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(); return; }
    } else if (this.rival && this.enemy.rivalTrait === 'ambush') {
      this.player.stun = Math.max(this.player.stun, 1);
      this.hitFlash(this.hero);
      audio.sfx('enemyhit', { volume: 0.5 });
      await this.say(`Rival ${this.enemy.name} ambushed you! ${this.player.name} is stunned!`, 450);
    }
    this.openCommand();
  }

  /** Chao Care (Cream): als de wave begint geneest het hele team 10% (Cream in het veld) of 5% (Cream op de bank). */
  private async chaoCare() {
    const cream = this.party.find(f => f.def.passive?.id === 'chaoCare' && !f.fainted);
    if (!cream) return;
    const onField = cream === this.player;
    const hurt = this.party.filter(f => !f.fainted && f.hp < f.maxHp);
    if (!hurt.length) return;
    const heal = onField ? CHAO_CARE_HEAL : CHAO_CARE_BENCH;
    for (const f of hurt) f.hp = Math.min(f.maxHp, f.hp + Math.ceil(f.maxHp * heal));
    audio.sfx('heal1');
    this.sparkles(this.hero);
    this.refreshPartyHeads();
    if (!onField) {
      // vanaf de bank: Cream's hoofdje in de HUD licht groen op
      const icon = this.partyHeads[this.party.indexOf(cream)];
      if (icon) {
        icon.setTintFill(0x7cf07c);
        hearts(this, icon.x + 8, icon.y + 4, 3, 0x7cf07c);
        this.time.delayedCall(260, () => icon.clearTint());
      }
    }
    await this.setBox(this.pBox, this.player, true);
    await this.say(onField ? 'Chao Care! The team healed a little.' : `Chao Care! Cream cheered from the bench: the team healed ${Math.round(heal * 100)}%.`, 400);
  }

  private startHover() {
    this.foeHover?.stop();
    this.foe.setPosition(this.foeHome.x, this.foeHome.y);
    if (this.enemy.def.hover) {
      this.foeHover = this.tweens.add({ targets: this.foe, y: this.foeHome.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  /** Status-effecten in beeld: sterretjes bij een stun, een gouden schim zolang Light Speed werkt. */
  private statusFx = new Map<Phaser.GameObjects.Sprite, Phaser.GameObjects.Image[]>();
  private pierceFx = new Map<Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite>();
  private statusClock = 0;
  private frozenFx = new Set<Phaser.GameObjects.Sprite>();
  /** Intentie-icoontje boven een opgeladen vijand ("!" in een oranje bolletje). */
  private intentFx?: Phaser.GameObjects.Container;
  private updateStatusFx(dt: number) {
    this.updateIntent();
    this.updateSpeedTag();
    this.statusClock += dt;
    const pairs: Array<[Phaser.GameObjects.Sprite, Fighter | undefined]> = [[this.hero, this.player], [this.foe, this.enemy]];
    for (const [spr, f] of pairs) {
      if (!spr) continue;
      const stunned = !!f && f.stun > 0 && !f.fainted && spr.visible;
      let stars = this.statusFx.get(spr);
      if (stunned && !stars) {
        stars = [0, 1, 2].map(() => this.add.image(0, 0, 'star').setTint(0xfff27a).setDepth(19));
        this.statusFx.set(spr, stars);
      } else if (!stunned && stars) {
        stars.forEach(st => st.destroy());
        this.statusFx.delete(spr);
        stars = undefined;
      }
      // bevroren: ijsblauw in plaats van gele sterretjes, en de sprite zelf ook blauw
      const frozen = stunned && !!f?.frozen;
      if (frozen !== this.frozenFx.has(spr)) {
        if (frozen) { this.frozenFx.add(spr); spr.setTint(0x9ad8ff); } else { this.frozenFx.delete(spr); spr.clearTint(); }
      }
      if (stars) {
        stars.forEach(st => st.setTint(frozen ? 0xcff0ff : 0xfff27a));
        const top = spr.y - this.bodyHeight(spr) - 4;
        stars.forEach((st, i) => {
          const a = this.statusClock / 260 + (i / 3) * Math.PI * 2;
          st.setPosition(spr.x + Math.cos(a) * 14, top + Math.sin(a) * 4).setDepth(Math.sin(a) > 0 ? 19 : spr.depth - 1);
        });
      }
      if (f && f.evade > 0 && !f.fainted && Math.floor(this.statusClock / 140) !== Math.floor((this.statusClock - dt) / 140)) {
        this.ghost(spr, 0xffd23a);
      }
      // Chaos Spear: roze rune die langzaam om het doelwit draait
      const pierced = !!f && f.pierced > 0 && !f.fainted && spr.visible;
      let rune = this.pierceFx.get(spr);
      if (pierced && !rune) {
        rune = this.add.sprite(0, 0, 'shadowfx', 'sh_rune_pink_0').setScale(0.8);
        this.pierceFx.set(spr, rune);
      } else if (!pierced && rune) {
        rune.destroy();
        this.pierceFx.delete(spr);
        rune = undefined;
      }
      if (rune) {
        const c = this.center(spr);
        rune.setPosition(c.x, c.y).setAngle(this.statusClock / 20).setDepth(spr.depth + 1)
          .setAlpha(0.6 + 0.25 * Math.sin(this.statusClock / 200));
      }
      // Super Shadow: gouden schimmen en vonkjes
      if (f && f.superTurns > 0 && !f.fainted && spr.visible && Math.floor(this.statusClock / 160) !== Math.floor((this.statusClock - dt) / 160)) {
        const p = this.add.image(spr.x + Phaser.Math.Between(-14, 14), spr.y - Phaser.Math.Between(4, 40), 'px').setTint(0xfff6a0).setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: p, y: p.y - 22, alpha: 0, duration: 420, onComplete: () => p.destroy() });
      }
    }
  }

  // ---------------------------------------------------------------- testmodus (?test in de URL)
  /** Label linksonder in beeld zodat je altijd ziet dat je in de testmodus zit. */
  private drawTestBadge() {
    this.add.text(W / 2, 4, 'TEST MODE  -  T: keys', { fontFamily: FONT, fontSize: '8px', color: '#ff6a5a', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 0).setDepth(40);
  }

  /** Sneltoetsen. Geeft true terug als de toets door de testmodus is afgehandeld. */
  private testKey(k: string): boolean {
    if (k === 't') {
      if (this.testPanel) { this.testPanel.destroy(); this.testPanel = undefined; return true; }
      const c = this.add.container(8, 40).setDepth(45);
      const g = this.add.graphics();
      g.fillStyle(0x10131c, 0.95).fillRoundedRect(0, 0, 220, 14 + TEST_KEYS.length * 11, 4);
      g.lineStyle(1, 0xff6a5a).strokeRoundedRect(0.5, 0.5, 219, 13 + TEST_KEYS.length * 11, 4);
      c.add(g);
      TEST_KEYS.forEach(([key, what], i) => c.add(this.add.text(8, 7 + i * 11, `${key}  ${what}`, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })));
      this.testPanel = c;
      return true;
    }
    if (!/^[1-9]$/.test(k)) return false;
    if (this.menu !== 'command') return true; // alleen als je een actie kiest, anders loopt er iets door elkaar
    const done = (text: string) => { this.setBox(this.pBox, this.player, false); this.refreshPartyHeads(); void this.flash(`TEST: ${text}`); };
    const jump = (wave: number) => {
      this.menu = 'busy';
      this.foeHover?.stop();
      this.wave = wave;
      void this.startWave();
    };
    switch (k) {
      case '1': this.party.forEach(f => { f.boost = MAX_BOOST; }); done('full Boost.'); break;
      case '2':
        this.party.forEach(f => { if (f.level < ULTIMATE_LEVEL) { f.level = ULTIMATE_LEVEL; f.exp = 0; } if (!f.fainted) f.hp = f.maxHp; });
        done(`team is Lv.${ULTIMATE_LEVEL}, ultimates unlocked.`);
        break;
      case '3': this.menu = 'busy'; this.enemy.hp = 0; this.setBox(this.eBox, this.enemy, false); void this.winWave(); break;
      case '4': this.party.forEach(f => { f.hp = f.maxHp; }); done('team healed and revived.'); break;
      case '5': if (isBossWave(this.wave)) void this.flash('TEST: this is already the boss.'); else jump(Math.ceil(this.wave / 10) * 10); break;
      case '6': this.forceRival = true; void this.flash('TEST: the next wave is a rival.'); break;
      case '7':
        this.menu = 'busy';
        this.player.hp = 0;
        this.setBox(this.pBox, this.player, false);
        void this.handleFaint().then(ok => { if (ok) this.openCommand(); });
        break;
      case '8': this.rings += 1000; this.ringText.setText(`${this.rings}`); done('+1000 rings.'); break;
      case '9': jump(Math.ceil(this.wave / 10) * 10 + 1); break;
    }
    return true;
  }

  /** Naam zoals hij in berichten staat: "Tails", "Foe Buzz Beetle", "Rival Knuckles". */
  private who(f: Fighter) { return `${f === this.player ? '' : this.rival ? 'Rival ' : this.charFoe || f.def.id === 'eggman' ? '' : 'Foe '}${f.name}`; }

  /** Eén actie: eerst kijken of hij verdoofd is of flinchte, anders aanvallen. */
  private async act(att: Fighter, tgt: Fighter, move: MoveDef, ally?: Fighter) {
    if (att.stun > 0) {
      att.stun--;
      this.hitFlash(att === this.player ? this.hero : this.foe);
      const frozen = att.frozen;
      if (att.stun === 0) att.frozen = false;
      await this.say(frozen ? `${this.who(att)} is frozen solid and can't move!` : `${this.who(att)} is stunned and can't move!`, 400);
      return;
    }
    if (this.flinched.has(att)) {
      await this.say(`${this.who(att)} flinched and couldn't move!`, 400);
      return;
    }
    // gratis gebruikt (Chaos Control / Super Barrage na een KO)? Dan geen cut-in bij een kettingreactie
    this.freeUse = att.isFree(move);
    if (att === this.player) { this.player.spendBoost(move); this.setBox(this.pBox, this.player, false); }
    const hammer = att === this.player && this.buffs.critTurns > 0;
    if (hammer) this.buffs.critTurns--;
    this.critBonus = hammer ? HAMMER_CRIT : 0;
    // Chao Blessing: elke beurt van die kant telt (ook de move die het niet gebruikt)
    const blessed = att === this.player ? this.buffs.blessTurns > 0 : this.foeBless > 0;
    if (att === this.player && blessed) this.buffs.blessTurns--;
    else if (blessed) this.foeBless--;
    this.dmgBonus = blessed ? 1 + BLESS_BONUS : 1;
    // Charge: de opgeladen aanval doet dubbele schade (ook als hij mist is de lading op)
    this.chargedHit = att !== this.player && att.charged && att.chargeReady && move.power > 0;
    if (this.chargedHit) { att.charged = false; this.dmgBonus *= chargeMult(att); }
    this.lastLanded = false;
    await this.doAttack(att, tgt, move, ally);
    // Homing Attack: kans op nog een klap (één keer per beurt, zonder extra SPD)
    if (move.extraHit && this.lastLanded && !att.fainted && !tgt.fainted && this.extraRoll() < move.extraHit) {
      await this.doAttack(att, tgt, { ...move, selfStages: undefined, extraHit: undefined }, ally, true);
    }
    // Lucky Swing (Amy) bij ATK +6: kans dat ze dezelfde aanval nog een keer doet
    else if (this.lastLanded && !att.fainted && !tgt.fainted && this.extraRoll() < luckyExtraChance(att, move)) {
      await this.doAttack(att, tgt, { ...move, selfStages: undefined }, ally, 'lucky');
    }
    // Chao Revival (rival-Cream): één keer terug, en jouw team ATK -2
    if (tgt === this.enemy && this.rival && chaoRevival(tgt)) await this.rivalRevive();
  }

  private async rivalRevive() {
    const e = this.enemy;
    await this.wait(300);
    await cutIn(this, e.def.id, 'Chao Blessing');
    audio.sfx('heal1');
    const c = this.center(this.foe);
    hearts(this, c.x, c.y - 10, 10, 0xffa8d8);
    this.burst(c.x, c.y, 0xffd2ef, 16);
    this.foe.setAlpha(1).play(e.anim('idle'));
    this.popNumber(this.foe.x, this.foe.y - this.bodyHeight(this.foe) - 4, `+${e.hp}`, '#7cf07c');
    await this.setBox(this.eBox, e, true);
    await this.say(`The Chao revived Rival ${e.name}!`, 450);
    for (const f of this.party) if (!f.fainted && f !== this.player) f.raise('atk', RIVAL_REVIVE_ATK);
    if (!this.player.fainted) await this.changeStage(this.player, 'atk', RIVAL_REVIVE_ATK, 'Chao Revival! ');
  }
  /** De laatste aanval raakte (voor de extra Homing Attack). */
  private lastLanded = false;
  /** Dobbelsteen voor de extra Homing Attack en Lucky Swing (de tests zetten hem vast). */
  private extraRoll = () => Math.random();

  /** De vijand is een character (rival, of Shadow als boss): KO-pose, character-aanvallen, idles. */
  private charFoe = false;
  /** Boss-Shadow heeft zijn ultimate deze wave al gebruikt. */
  private foeUltUsed = false;

  /** Chao Blessing van een rival-Cream: zoveel beurten doet de vijand meer schade. */
  private foeBless = 0;
  /** Schade-vermenigvuldiger voor de aanval van deze beurt (Chao Blessing, Charge). */
  private dmgBonus = 1;
  /** De aanval van deze beurt is opgeladen (Charge). */
  private chargedHit = false;

  /** Dobbelstenen voor de keuze van de main boss en Sonic's ontwijken (de tests zetten ze vast). */
  private mainBossRoll = () => Math.random();
  private dodgeRoll = () => Math.random();
  /** Testmodus/tests: deze vijand (en elite-eigenschap) op de volgende wave. */
  private forceFoe?: string;
  private forceElite?: typeof ELITE_IDS[number];
  /** Dobbelsteen voor bijeffecten van badnik-moves (bevriezen, Trumpet Blast). */
  private effectRoll = () => Math.random();

  /** Wie er deze wave in het veld stond (krijgen allemaal de volle EXP, zoals in Pokémon). */
  private waveFighters = new Set<Fighter>();

  /** De move die nu bezig is was gratis (Shadow). */
  private freeUse = false;

  private async runTurn(playerMove: MoveDef, ally?: Fighter) {
    this.tut?.event(`move:${playerMove.id}`);
    this.toggleField(false);
    this.menu = 'busy';
    this.pointer.setVisible(false);
    const enemyMove = this.pickEnemyMove();
    this.enemy.chargeReady = this.enemy.charged;
    const playerFirst = playerMove.priority !== enemyMove.priority
      ? playerMove.priority > enemyMove.priority
      : this.player.spd >= this.enemy.spd;

    const order: Array<[Fighter, Fighter, MoveDef]> = playerFirst
      ? [[this.player, this.enemy, playerMove], [this.enemy, this.player, enemyMove]]
      : [[this.enemy, this.player, enemyMove], [this.player, this.enemy, playerMove]];

    this.flinched.clear();
    for (const [att, tgt, move] of order) {
      if (att.fainted || tgt.fainted) continue;
      await this.act(att, tgt, move, att === this.player ? ally : undefined);
    }
    this.flinched.clear();
    await this.tickSuper();

    if (this.enemy.fainted) return this.winWave();
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(); return; }
    await this.endOfTurn();
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(); return; }
    this.openCommand();
  }

  private async doAttack(att: Fighter, tgt: Fighter, move: MoveDef, ally?: Fighter, again: boolean | 'lucky' = false) {
    const isPlayer = att === this.player;
    await this.say(again === 'lucky' ? `Lucky Swing! ${this.who(att)} swung again!` : again ? `${this.who(att)} homed in again!` : `${this.who(att)} used ${move.name}!`, 150);
    if (move.heal || move.teamHeal) return this.doHeal(att, move, ally ?? att);
    if (move.charge) return this.doCharge(att);
    let hit = calcHit(att, tgt, move, Math.random, isPlayer ? this.critBonus : 0, this.dmgBonus);
    // status-move (Chaos Spear): raakt altijd en doet geen schade, alleen het effect
    const status = move.power === 0;
    if (status) hit = { damage: 0, crit: false, missed: false, effect: 1 };
    let hungOn = false;
    let ironWilled = false;
    // rewards: Invincibility (eerste aanval mist) en Shield (halve schade) beschermen je team
    let guard = '';
    if (!isPlayer && !hit.missed && this.party.includes(tgt)) {
      if (this.dodgeFirst) {
        this.dodgeFirst = false;
        hit = { ...hit, missed: true, damage: 0, crit: false };
        guard = 'Invincibility!';
      } else if (this.waveShield || this.buffs.shieldHit) {
        hit = { ...hit, damage: Math.max(1, Math.ceil(hit.damage * SHIELD_FACTOR)) };
        guard = this.waveShield ? 'The shield took half the damage!' : 'The shield took half the damage and broke!';
        if (!this.waveShield) this.buffs.shieldHit = false;
      }
    }
    // Light Speed Attack: de volgende aanvallen op Sonic missen gegarandeerd
    let dodged = false;
    if (tgt.evade > 0) { tgt.evade--; hit = { ...hit, missed: true, damage: 0, crit: false }; dodged = true; }
    // Sonic Speed: hoe sneller Sonic is dan de aanvaller, hoe vaker hij ontwijkt (ultimates raken altijd)
    else if (!hit.missed && !status && (move.cost ?? 0) < MAX_BOOST && this.dodgeRoll() < dodgeChance(tgt, att)) {
      hit = { ...hit, missed: true, damage: 0, crit: false };
      guard = 'Sonic Speed!';
      dodged = true;
    }
    if (guard.startsWith('The shield')) audio.sfx('shield', { volume: 0.6 });
    // ontwijken: op het moment van de klap schiet hij weg (zie dodgeFx)
    let dodgeAnim: Promise<void> | undefined;
    const dodgeSpr = isPlayer ? this.foe : this.hero;
    let struck = false;
    let shieldsBroken = 0;
    let shellCracked = false;
    let dealt = 0;
    const strike = () => {
      if (hit.missed && dodged && !dodgeAnim) dodgeAnim = this.dodgeFx(dodgeSpr, tgt, isPlayer ? 1 : -1);
      if (hit.missed || struck) return;
      struck = true;
      if (status) { this.hitFlash(isPlayer ? this.foe : this.hero); return; }
      // Hard Shell / Shell Up: de schelp vangt de helft op
      const shell = shellHit(tgt, hit.damage);
      if (shell.cracked) { hit = { ...hit, damage: shell.damage }; shellCracked = true; }
      // boss-schilden: één schild per klap (tenzij de klap heel hard is)
      const cap = shieldCap(tgt, hit.damage);
      if (cap.damage !== hit.damage || cap.broken) { hit = { ...hit, damage: cap.damage }; shieldsBroken = cap.broken; }
      const hpBefore = tgt.hp;
      tgt.hp = Math.max(0, tgt.hp - hit.damage);
      dealt = hpBefore - tgt.hp;
      // Iron Fists: één keer per zone met 1 HP blijven staan, als hij vóór de klap meer dan de helft had
      if (tgt.hp === 0 && tgt.def.passive?.id === 'flinch' && !tgt.sashUsed && hpBefore > tgt.maxHp * SASH_MIN_HP) { tgt.hp = 1; tgt.sashUsed = true; hungOn = true; }
      // Iron Will (rival-Knuckles): één keer op 1 HP, hoeveel HP hij ook had
      if (ironWill(tgt)) { hungOn = true; ironWilled = true; }
      // tutorial: niemand van je team gaat neer, en de vijand pas bij de laatste stap
      if (this.tutorialMode && tgt.hp === 0 && (this.party.includes(tgt) || this.tutGuard)) tgt.hp = 1;
      const spr = isPlayer ? this.foe : this.hero;
      const c = this.center(spr);
      this.burst(c.x, c.y, hit.crit ? 0xf2c230 : 0xffffff, hit.crit ? 16 : 10);
      if (move.id !== att.def.ultimate) {
        this.impactFx(att, c.x, c.y, hit.crit, isPlayer ? 1 : -1);
        this.knockback(spr, isPlayer ? 1 : -1, hit.crit);
      }
      this.hitStop(hit.crit ? 120 : 55);
      // CRITICAL! boven het doelwit (Tornado Hammer doet dat zelf al)
      if (hit.crit && !move.alwaysCrit) void bigText(this, c.x, c.y - 40, 'CRITICAL!', isPlayer ? '#ffd23a' : '#ff6a5a');
      this.popNumber(spr.x, spr.y - this.bodyHeight(spr) - 4, `-${hit.damage}`, hit.crit ? '#f2c230' : '#ffffff');
      this.cameras.main.shake(hit.crit ? 220 : 120, hit.crit ? 0.008 : 0.004);
      if (isPlayer) {
        audio.sfx(isBossWave(this.wave) ? 'bosshit' : 'enemyhit', { volume: 0.8 });
        if (tgt.def.id === 'eggman' && Math.random() < 0.4) audio.voice('eggmanow', 0.8);
      } else {
        audio.sfx('hurtrings', { volume: 0.7 });
        // Shark Jet's Drill Ram: geen Boost voor de klap (hij steelt er juist een, zie hieronder)
        if (!move.drainBoost) this.player.gainBoost(BOOST_ON_HIT);
      }
      this.hitFlash(spr);
      if (shieldsBroken) this.shieldBreakFx(isPlayer ? this.eBox : this.pBox, tgt, shieldsBroken);
      if (!isPlayer) this.hero.play(this.player.anim('hurt'));
      else if (this.charFoe || this.anims.exists(this.enemy.anim('hurt'))) this.foe.play(this.enemy.anim('hurt'));
      this.setBox(isPlayer ? this.eBox : this.pBox, tgt, true);
      if (guard) { this.burst(c.x, c.y, 0x7cf07c, 12); this.updateShield(); }
    };

    this.setActionSpeed(isPlayer ? this.hero : this.foe);
    // Super Barrage die gratis is na een KO: geen cut-in, hij is nog super en gaat meteen door
    if (move.id === att.def.ultimate && (isPlayer || this.charFoe) && !(this.freeUse && move.resets)) await cutIn(this, att.def.id, move.name);
    if (isPlayer) await this.charAttack(this.hero, this.player, this.foe, PLAYER_POS, 1, move, strike, hit.missed);
    else if (this.charFoe) await this.charAttack(this.foe, this.enemy, this.hero, this.foeHome, -1, move, strike, hit.missed);
    else await this.foeAttack(move, strike, hit.missed);

    if (!isPlayer && !hit.missed) { await this.wait(350); if (!this.player.fainted) this.hero.play(this.player.anim('idle')); }
    if (isPlayer && (this.charFoe || this.anims.exists(this.enemy.anim('hurt'))) && !hit.missed) { await this.wait(350); if (!this.enemy.fainted) this.foe.play(this.enemy.anim('idle')); }
    this.setActionSpeed(null);
    if (hit.missed) {
      // MISS naast het doelwit, in plaats van een geluid; ontweken = DODGE! (en wachten tot hij terug is)
      const spr = isPlayer ? this.foe : this.hero;
      if (dodged) {
        dodgeAnim ??= this.dodgeFx(dodgeSpr, tgt, isPlayer ? 1 : -1);
        await dodgeAnim;
      } else this.popMiss(spr.x + (isPlayer ? -30 : 34), spr.y - this.bodyHeight(spr) * 0.7);
      await this.say(guard ? `${guard} ${tgt.name} avoided the attack!` : `${tgt.name} avoided the attack!`, 400);
    }
    if (shellCracked) await this.say(`${this.who(tgt)}'s shell took half the damage!`, 350);
    if (this.chargedHit && !hit.missed) await this.say(chargeMult(att) >= 2 ? 'The charged attack hit twice as hard!' : 'The charged attack hit extra hard!', 350);
    else if (this.chargedHit) await this.say(`${this.who(att)} wasted its charge!`, 350);
    if (shieldsBroken) {
      audio.sfx('monitorbreak', { volume: 0.7 });
      await this.say(shieldsBroken > 1 ? `${shieldsBroken} of ${this.who(tgt)}'s shields broke at once!` : `${this.who(tgt)}'s shield broke!`, 400);
      // Shell Up (Shell Tank): kruipt in zijn schelp en laadt Tank Slam op
      if (tgt.def.trait === 'shellUp' && !tgt.fainted) {
        tgt.shell = true;
        tgt.charged = true;
        this.chargeFx(isPlayer ? this.foe : this.hero);
        await this.say(`${this.who(tgt)} hid in its shell and is charging up a Tank Slam!`, 500);
      }
    }
    // Spikes (Spike Mine): wie hem raakt prikt zichzelf (nooit KO)
    const spikes = isPlayer ? spikeRecoil(tgt, att, dealt) : 0;
    if (spikes > 0) {
      att.hp -= spikes;
      audio.sfx('spikes', { volume: 0.7 });
      this.hitFlash(this.hero);
      this.popNumber(this.hero.x, this.hero.y - this.bodyHeight(this.hero) - 4, `-${spikes}`, '#ff9a9a');
      await this.setBox(this.pBox, att, true);
      await this.say(`${att.name} got hurt by the spikes! (-${spikes})`, 350);
    }
    if (move.spendStages && Object.values(att.stages).some(v => v !== 0)) {
      att.stages = { atk: 0, def: 0, spd: 0, acc: 0 };
      this.statArrows(isPlayer ? this.hero : this.foe, false);
      await this.say(`${att.name} burned up all his stat changes!`, 400);
    }
    if (move.recoil && !att.fainted) {
      const cost = Math.ceil(att.maxHp * move.recoil);
      att.hp = Math.max(0, att.hp - cost);
      const spr = isPlayer ? this.hero : this.foe;
      this.hitFlash(spr);
      await this.setBox(isPlayer ? this.pBox : this.eBox, att, true);
      if (att.fainted) {
        spr.play(att.anim('ko'));
        await this.say(`${att.name} gave it everything and went down!`, 600);
      } else {
        await this.say(`${att.name} lost ${cost} HP from the effort!`, 400);
      }
    }
    // Light Speed Attack geeft Sonic zijn ontwijk-beurten, ook als hij zelf mist
    if (move.evade && !att.fainted) {
      att.evade = move.evade;
      await this.say(`${att.name} is moving too fast to be hit!`, 400);
    }
    // geraakt: crit/effectiviteit, en daarna de bijeffecten van de move (dit hing per ongeluk aan de
    // evade-check hierboven, waardoor Light Speed zijn SPD +3 nooit gaf)
    if (!hit.missed) {
      this.lastLanded = !status;
      if (hit.crit) await this.say('A critical hit!', 350);
      if (hit.effect > 1) await this.say("It's super effective!", 350);
      else if (hit.effect < 1) await this.say("It's not very effective...", 350);
      if (!hit.crit && hit.effect === 1 && !status) await this.wait(250);
      // moves die de gebruiker genezen als ze raken (Hammer Twirl)
      if (move.selfHeal && !att.fainted && att.hp < att.maxHp) {
        const h = Math.min(att.maxHp - att.hp, Math.ceil(att.maxHp * move.selfHeal));
        att.hp += h;
        const spr = isPlayer ? this.hero : this.foe;
        hearts(this, spr.x, spr.y - this.bodyHeight(spr) * 0.6, 6, 0x7cf07c);
        this.popNumber(spr.x, spr.y - this.bodyHeight(spr) - 4, `+${h}`, '#7cf07c');
        await this.setBox(isPlayer ? this.pBox : this.eBox, att, true);
        await this.say(`${this.who(att)} recovered ${h} HP!`, 300);
      }
      // moves die je eigen stats verhogen (Homing Attack: SPD +1)
      for (const [k, v] of Object.entries(move.selfStages ?? {})) {
        if (!att.fainted) await this.changeStage(att, k as StageKey, v);
      }
      // moves die de stats van het doelwit verlagen (Chao Attack: ATK -1); sommige maar met een kans (Trumpet Blast)
      if (!move.targetChance || this.effectRoll() < move.targetChance) {
        for (const [k, v] of Object.entries(move.targetStages ?? {})) {
          if (!tgt.fainted) await this.changeStage(tgt, k as StageKey, v);
        }
      }
      // Shark Jet: steelt Boost
      if (move.drainBoost && !tgt.fainted && tgt.boost > 0 && this.party.includes(tgt)) {
        const n = Math.min(tgt.boost, move.drainBoost);
        tgt.boost -= n;
        this.setBox(this.pBox, tgt, false);
        audio.sfx('statdown', { volume: 0.6 });
        await this.say(`${this.who(att)} drained ${n} Boost from ${tgt.name}!`, 400);
      }
      // Buzz Cannon: gif
      if (move.poison && !tgt.fainted) {
        const fresh = tgt.poison <= 0;
        tgt.poison = move.poison;
        this.burst(this.center(this.hero).x, this.center(this.hero).y, 0xb06aff, 8);
        await this.say(fresh ? `${tgt.name} was poisoned!` : `${tgt.name}'s poison was refreshed!`, 400);
      }
      // Snow Bot: kans om te bevriezen (één keer per gevecht)
      if (move.freezeChance && !tgt.fainted && !this.stunUsed.has('e:freeze') && this.effectRoll() < move.freezeChance) {
        this.stunUsed.add('e:freeze');
        tgt.stun = Math.max(tgt.stun, 1);
        tgt.frozen = true;
        this.burst(this.center(this.hero).x, this.center(this.hero).y, 0xcff0ff, 12);
        audio.sfx('freeze', { volume: 0.8 });
        await this.say(`${tgt.name} was frozen solid!`, 450);
      }
      if (guard) await this.say(guard, 350);
      if (hungOn) await this.say(`${this.who(tgt)} hung on with 1 HP! (${ironWilled ? 'Iron Will' : 'Iron Fists'})`, 500);
      // Lucky Swing (Amy): elke crit kost haar 5% max-HP, maar ze gaat er zelf nooit van KO
      if (hit.crit && att.def.passive?.id === 'luckySwing' && !move.recoil && !move.selfHeal && !att.fainted) {
        const cost = Math.min(att.hp - 1, Math.ceil(att.maxHp * CRIT_RECOIL));
        if (cost > 0) {
          att.hp -= cost;
          this.hitFlash(isPlayer ? this.hero : this.foe);
          await this.setBox(isPlayer ? this.pBox : this.eBox, att, true);
          await this.say(`${this.who(att)} lost ${cost} HP from the swing!`, 300);
        }
      }
      // Iron Fists (Knuckles): kans dat het doelwit zijn beurt verliest
      if (att.def.passive?.id === 'flinch' && !tgt.fainted && Math.random() < FLINCH_CHANCE) this.flinched.add(tgt);
      // verdoven (Glove Punch één keer per gevecht, Thunder Shoot altijd)
      // een vijand (rival-Tails) verdooft je maar één keer per gevecht, anders kom je er nooit meer tussen
      const stunKey = isPlayer ? `p:${move.id}` : 'e:any';
      const once = move.stunOnce || !isPlayer;
      if (move.stun && !tgt.fainted && !(once && this.stunUsed.has(stunKey))) {
        if (once) this.stunUsed.add(stunKey);
        tgt.stun = Math.max(tgt.stun, Phaser.Math.Between(move.stun[0], move.stun[1]));
        audio.sfx('enemyhit', { volume: 0.5 });
        await this.say(`${this.who(tgt)} is stunned!`, 400);
      }
      // Copter Dive: een verdoofd doelwit blijft 1 beurt langer verdoofd (één keer per gevecht), anders SPD -1
      if (move.extendStun && !tgt.fainted) {
        const extKey = isPlayer ? 'p:extend' : 'e:extend';
        if (tgt.stun > 0 && !this.stunUsed.has(extKey)) {
          this.stunUsed.add(extKey);
          tgt.stun += move.extendStun;
          await this.say(`${this.who(tgt)} stays stunned ${move.extendStun} turn longer!`, 400);
        } else {
          await this.changeStage(tgt, 'spd', -1);
        }
      }
      // Homing Attack: een gewone vijand KO = de Boost komt terug
      if (move.refundOnKo && tgt.fainted && isPlayer && !isBossWave(this.wave) && !this.rival && (move.cost ?? 0) > 0) {
        att.gainBoost(move.cost ?? 0);
        this.setBox(this.pBox, att, false);
        await this.say(`${move.name} was free! (KO)`, 350);
      }
      // Chaos Spear: het doelwit krijgt een paar beurten meer schade
      if (move.pierce && !tgt.fainted) {
        tgt.pierced = move.pierce;
        tgt.freshTurns.add('pierced');
        await this.say(`${this.who(tgt)} is pierced! It takes ${Math.round((PIERCE_BONUS - 1) * 100)}% more damage for ${move.pierce} turns.`, 450);
      }
    }
    // Super Barrage: Shadow blijft een paar beurten super (ook als hij mist)
    // Super-kracht: telt vanaf de eerste ultimate; een ketting erachteraan verlengt hem niet
    if (move.superTurns && !att.fainted && att.superTurns > 0) {
      await this.say(`Super power: ${att.superTurns === 1 ? 'this is the last turn' : `${att.superTurns} turns left (no refresh)`}.`, 350);
    } else if (move.superTurns && !att.fainted) {
      att.superTurns = move.superTurns;
      await this.say(`${att.name} has Super power! 100% crit, but he takes double damage for ${move.superTurns} turns (this one included).`, 450);
    }
    await this.shadowAfter(att, tgt, move, isPlayer);
  }

  /**
   * Shadow na zijn aanval: een KO maakt Chaos Control weer gratis (en Super Barrage, als die de KO maakte,
   * tot ULT_CHAIN_MAX keer achter elkaar). Ultimate Lifeform: elke KO geeft hem ook 1 Boost.
   */
  private async shadowAfter(att: Fighter, tgt: Fighter, move: MoveDef, isPlayer: boolean) {
    const ult = move.id === att.def.ultimate;
    const ko = tgt.fainted && !att.fainted;
    // de ketting telt vanaf de laatste keer dat hij de ultimate met Boost betaalde: max ULT_CHAIN_MAX keer gratis,
    // daarna weer 6 Boost (een andere move ertussen zet de teller niet terug)
    if (ult && !this.freeUse) att.ultChain = 0;
    if (!ko) return;
    const resets: string[] = [];
    if (att.moves.includes('chaosControl') && !att.chaosFree) {
      att.chaosFree = true;
      resets.push('Chaos Control');
    }
    if (ult && move.resets === 'ownKo' && !att.ultFree && att.ultChain < ULT_CHAIN_MAX) {
      att.ultFree = true;
      att.ultChain++;
      resets.push(`${move.name}|${att.ultChain}/${ULT_CHAIN_MAX}`);
    }
    const lifeform = att.def.passive?.id === 'lifeform' && att.boost < MAX_BOOST;
    if (!resets.length && !lifeform) return;
    const spr = isPlayer ? this.hero : this.foe;
    const c = this.center(spr);
    shockwave(this, c.x, c.y, 0xff3a4a, 46, 320);
    audio.sfx('ringchime', { volume: 0.6 });
    // een rival betaalt geen Boost, dus de berichten alleen voor je eigen Shadow
    if (!isPlayer) return;
    for (const r of resets) {
      const [name, chain] = r.split('|');
      await this.say(`${name} is free again!${chain ? ` (${chain})` : ''}`, 400);
    }
    if (lifeform) {
      att.gainBoost(LIFEFORM_KO_BOOST);
      this.setBox(this.pBox, att, false);
      await this.say(`Ultimate Lifeform! ${att.name} gained ${LIFEFORM_KO_BOOST} Boost.`, 350);
    }
  }

  /** Boss-schild breekt: scherfjes uit de HP-balk bij de grens waar de klap stopte. */
  private shieldBreakFx(box: InfoBox, f: Fighter, n: number) {
    const x = box.root.x + 34 + (box.barW * Math.max(0, f.hp)) / f.maxHp;
    const y = box.root.y + BOX_BAR_Y + 2;
    const flash = this.add.rectangle(x, y, 10, 10, 0xffffff, 0.9).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scaleX: 4, scaleY: 2, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    for (let i = 0; i < 8 + n * 4; i++) {
      const sh = this.add.rectangle(x, y, Phaser.Math.Between(2, 4), Phaser.Math.Between(2, 4), Phaser.Utils.Array.GetRandom([0x8ad8ff, 0xffffff, 0x50f8f8]))
        .setDepth(45).setAngle(Phaser.Math.Between(0, 90));
      this.tweens.add({ targets: sh, x: x + Phaser.Math.Between(-30, 30), y: y + Phaser.Math.Between(-24, 18), angle: sh.angle + 180, alpha: 0,
        duration: Phaser.Math.Between(300, 520), ease: 'Quad.easeOut', onComplete: () => sh.destroy() });
    }
  }

  /** Glinsters rond een sprite (genezen). */
  private sparkles(spr: Phaser.GameObjects.Sprite) {
    const c = this.center(spr);
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 90, () => {
        const sp = this.add.sprite(c.x + Phaser.Math.Between(-18, 18), c.y + Phaser.Math.Between(-20, 14), 'ui', 'sparkle_0').setDepth(15);
        sp.play('sparkle');
        sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
      });
    }
  }

  /**
   * Genees-moves: juich-animatie, glinsters, HP erbij.
   * Chao Cheer geneest `target` (Cream zelf of een teamgenoot), Chao Blessing het hele team.
   */
  private async doHeal(att: Fighter, move: MoveDef, target: Fighter) {
    const isPlayer = att === this.player;
    const spr = isPlayer ? this.hero : this.foe;
    this.setActionSpeed(spr);
    if (isPlayer && move.teamHeal) {
      await cutIn(this, att.def.id, move.name);
      // Cheese' vriendjes rennen erbij (en weer weg als de zegen klaar is)
      const leave = chaoFriends(this, spr);
      await chaoBlessing({ ...this.ultCtx(spr, att, this.foe, PLAYER_POS, 1, () => undefined), clearsField: !!(move.clearField && this.fieldEffect) });
      await leave();
    } else if (att.def.id === 'cream') {
      // Chao Cheer: Cheese cirkelt om wie er geneest wordt (op de bank: om zijn hoofdje in de HUD)
      const icon = isPlayer && target !== att ? this.partyHeads[this.party.indexOf(target)] : undefined;
      const to = icon ? { x: icon.x + 8, y: icon.y + 8 } : this.center(spr);
      await chaoCheer({ scene: this, s: spr, dir: isPlayer ? 1 : -1, burst: (x, y, color, n) => this.burst(x, y, color, n) }, to, !!icon);
      if (icon) { icon.setTintFill(0x7cf07c); this.time.delayedCall(160, () => this.refreshPartyHeads()); }
    } else {
      const anim = this.playOnce(spr, att.anim('cheer'));
      audio.sfx('heal1');
      this.sparkles(spr);
      // Cheese vliegt naar wie er geneest wordt (op de bank: naar zijn hoofdje in de HUD)
      const cheese = this.add.sprite(spr.x + 18, spr.y - 46, 'fx').setDepth(26).setScale(1.6).play('cheese_fly');
      const icon = isPlayer && target !== att ? this.partyHeads[this.party.indexOf(target)] : undefined;
      const to = icon ? { x: icon.x + 8, y: icon.y + 8 } : { x: spr.x, y: spr.y - this.bodyHeight(spr) - 10 };
      cheese.setFlipX(to.x < cheese.x);
      await this.tween({ targets: cheese, x: to.x, y: to.y, duration: 380, ease: 'Sine.easeInOut' });
      hearts(this, to.x, to.y, 6, 0x7cf07c);
      this.burst(to.x, to.y, 0x7cf07c, 8);
      if (icon) { icon.setTintFill(0x7cf07c); this.time.delayedCall(160, () => this.refreshPartyHeads()); }
      await anim;
      this.tweens.add({ targets: cheese, alpha: 0, y: cheese.y - 16, duration: 250, onComplete: () => cheese.destroy() });
      await this.wait(150);
    }
    this.setActionSpeed(null);
    spr.play(att.anim('idle'));

    if (move.teamHeal) {
      const team = isPlayer ? this.party.filter(f => !f.fainted) : [att];
      // eerst de gevallen teamgenoten weer op de been (Chao Blessing)
      const down = isPlayer && move.revive ? this.party.filter(f => f.fainted) : [];
      let total = 0;
      for (const f of team) {
        const h = Math.min(f.maxHp - f.hp, Math.ceil(f.maxHp * move.teamHeal));
        f.hp += h;
        total += h;
      }
      for (const f of down) f.hp = Math.max(1, Math.ceil(f.maxHp * move.revive!));
      if (total > 0) this.popNumber(spr.x, spr.y - this.bodyHeight(spr) - 4, `+${total}`, '#7cf07c');
      await this.setBox(isPlayer ? this.pBox : this.eBox, att, true);
      await this.say(isPlayer ? 'The whole team is back to full HP!' : `${this.who(att)} is back to full HP!`, 500);
      if (down.length) {
        this.refreshPartyHeads();
        await this.say(`${down.map(f => f.name).join(' and ')} ${down.length > 1 ? 'are' : 'is'} back on ${down.length > 1 ? 'their' : 'the'} feet with ${Math.round(move.revive! * 100)}% HP!`, 500);
      }
      if (move.blessing) {
        if (isPlayer) this.buffs.blessTurns = BLESS_TURNS; else this.foeBless = BLESS_TURNS;
        await this.say(`The Chao cheer ${isPlayer ? 'your team' : this.who(att)} on: ${Math.round(BLESS_BONUS * 100)}% more damage for ${BLESS_TURNS} turns!`, 500);
      }
      if (move.clearField && isPlayer && this.fieldEffect) {
        const name = this.fieldEffect.name;
        this.applyZoneEffect(undefined);
        this.fieldCleared = true;
        await this.say(`The ${name.toLowerCase()} is gone for the rest of this zone!`, 500);
      }
      return;
    }

    const h = Math.min(target.maxHp - target.hp, Math.ceil(target.maxHp * (move.heal ?? 0)));
    target.hp += h;
    if (h > 0 && target === att) this.popNumber(spr.x, spr.y - this.bodyHeight(spr) - 4, `+${h}`, '#7cf07c');
    if (target === att) await this.setBox(isPlayer ? this.pBox : this.eBox, att, true);
    await this.say(h > 0 ? `${target.name} healed ${h} HP!` : `${target.name}'s HP is already full!`, 400);
    // Chao Cheer: ook een beetje Boost (zit hij al vol, dan niets)
    if (move.allyBoost && target.boost < MAX_BOOST) {
      target.gainBoost(move.allyBoost);
      if (target === this.player) this.setBox(this.pBox, this.player, false);
      await this.say(`${target.name} gained ${move.allyBoost} Boost!`, 350);
    }
  }

  /** Speelt een animatie en roept `onFrame` aan zodra een bepaald frame in beeld komt (bijv. de klap van de hamer). */
  private playUntilFrame(spr: Phaser.GameObjects.Sprite, key: string, frameSuffix: string) {
    return new Promise<void>(r => {
      let done = false;
      const finish = () => { if (done) return; done = true; spr.off(Phaser.Animations.Events.ANIMATION_UPDATE, check); r(); };
      const check = (_a: unknown, f: Phaser.Animations.AnimationFrame) => { if (f.textureFrame.toString().endsWith(frameSuffix)) finish(); };
      spr.on(Phaser.Animations.Events.ANIMATION_UPDATE, check);
      spr.play(key);
      this.time.delayedCall(1500, finish); // vangnet
    });
  }

  /**
   * Aanvallen van een character (jij, of een rival aan de overkant). `dir` is de looprichting:
   * +1 = van links naar rechts (jouw kant), -1 = van rechts naar links (rival).
   */
  private async charAttack(s: Phaser.GameObjects.Sprite, p: Fighter, target: Phaser.GameObjects.Sprite,
    home: { x: number; y: number }, dir: number, move: MoveDef, strike: () => void, missed: boolean) {
    // mik op het midden van het doelwit (vliegers hangen hoger dan grond-badniks)
    const fc = this.center(target);
    const tx = fc.x - dir * target.displayWidth * 0.3 + dir * (missed ? 14 : 0);
    const ty = fc.y + this.bodyHeight(s) * 0.45;

    let finisher: (() => Promise<void>) | undefined;
    const base = p.def.scale;
    const run = this.anims.exists(p.anim('run')) ? p.anim('run') : p.anim('spin');
    // aanloop: eerst even door de knieën (niet bij de ultimate en de Spin Dash, die hebben hun eigen opbouw)
    // de grote moves van het team hebben hun eigen animatie (heroMoves.ts); die zetten de sprite zelf weer thuis
    const signature = HERO_MOVES[move.id];
    if (signature && p.def.id === signature[0]) {
      await signature[1]({ ...this.ultCtx(s, p, target, home, dir, strike), missed, dust: (x, y, n) => this.dust(x, y, n), bodyHeight: spr => this.bodyHeight(spr),
        lockOn: t => this.lockOn(t), rotorWash: (x, y) => this.rotorWash(x, y) });
      s.play(p.anim('idle'));
      return;
    }
    const ranged = move.anim === 'spear' || move.anim === 'chaos';
    if (move.anim !== 'ultimate' && move.anim !== 'dash' && !ranged) await this.anticipate(s, base);
    if (move.anim !== 'hammer' && move.anim !== 'ultimate' && !ranged) audio.sfx(move.anim === 'dash' ? 'spindash' : 'jump', { volume: move.anim === 'dash' ? 0.6 : 0.8 });
    if (move.anim === 'spin') {
      s.play(p.anim('spin'));
      await this.tween({ targets: s, y: home.y - 20, duration: 140, ease: 'Quad.easeOut' });
      await this.tween({ targets: s, x: tx, y: ty, duration: 260, ease: 'Quad.easeIn' });
    } else if (move.anim === 'homing') {
      // Homing Attack: omhoog, vizier klikt vast op het doelwit, dan in een rechte lijn erop af
      s.play(p.anim('spin'));
      await this.tween({ targets: s, y: home.y - 70, x: home.x + dir * 20, duration: 220, ease: 'Quad.easeOut' });
      await this.lockOn(target);
      const trail = this.time.addEvent({ delay: 16, repeat: 10, callback: () => this.ghost(s) });
      await this.tween({ targets: s, x: tx, y: ty - 10, duration: 130, ease: 'Linear' });
      trail.remove();
      if (!missed && this.anims.exists(p.anim('spinkick'))) finisher = async () => {
        // na de klap nog een gouden draaitrap
        await this.playOnce(s, p.anim('spinkick'));
      };
    } else if (move.anim === 'dash') {
      // Spin Dash: opladen op de plek, dan lanceren
      s.play(p.anim('spin'));
      s.anims.timeScale *= 2;
      const dust = this.time.addEvent({ delay: 60, repeat: 9, callback: () => this.burst(s.x - dir * 14, s.y - 4, 0xd8dde8, 3) });
      await this.tween({ targets: s, x: home.x - dir * 6, duration: 50, yoyo: true, repeat: 5 });
      dust.remove();
      s.anims.timeScale /= 2;
      shockwave(this, s.x, s.y - 14, 0xffffff, 40, 250);
      this.cameras.main.shake(100, 0.004);
      if (this.anims.exists(p.anim('dashfire'))) s.play(p.anim('dashfire'));
      const trail = this.time.addEvent({ delay: 20, repeat: 10, callback: () => this.ghost(s, 0xffd23a) });
      await this.tween({ targets: s, x: tx, y: ty, duration: 200, ease: 'Expo.easeIn' });
      trail.remove();
      s.play(p.anim('spin'));
    } else if (move.anim === 'punch' && move.id === 'drillPunch' && this.anims.exists(p.anim('heavypunch'))) {
      // Knuckle Punch: even opladen (rood gloeien), dan met een vuurstoot uit de vuist op het doelwit af
      s.play(p.anim('idle'));
      for (let i = 0; i < 4; i++) this.time.delayedCall(i * 70, () => (i % 2 ? s.clearTint() : s.setTint(0xff8a5a)));
      this.burst(s.x, s.y - 20, 0xff8a1a, 8);
      await this.wait(300);
      s.clearTint();
      const trail = this.time.addEvent({ delay: 25, repeat: 10, callback: () => this.ghost(s, 0xff5a1a) });
      const hitAt = this.playUntilFrame(s, p.anim('heavypunch'), '9_9');
      await this.tween({ targets: s, x: tx - dir * 10, y: ty, duration: 260, ease: 'Quad.easeIn' });
      await hitAt;
      trail.remove();
      fxOnce(this, tx + dir * 10, ty - 20, 'fx_burst', 1.6, 17);
      shockwave(this, tx + dir * 10, ty - 20, 0xff8a1a, 60, 300);
    } else if (move.anim === 'punch') {
      // Glove Punch: naar het doelwit rennen, dan de stoot
      s.play(run);
      const dustRun = this.time.addEvent({ delay: 90, repeat: 3, callback: () => this.dust(s.x - dir * 8, s.y, 1) });
      await this.tween({ targets: s, x: tx - dir * 30, y: ty, duration: 300, ease: 'Sine.easeIn' });
      dustRun.remove();
      s.play(p.anim('punch'));
      await this.tween({ targets: s, x: tx - dir * 6, duration: 160, ease: 'Back.easeOut' });
      await this.wait(120);
    } else if (move.anim === 'fly' && this.anims.exists(p.anim('drill'))) {
      // Copter Dive (Tails): als raket omhoog met zijn staarten als propeller, dan als boor op het doelwit
      s.play(p.anim('rise'));
      audio.sfx('spindash', { volume: 0.5 });
      const wash = this.time.addEvent({ delay: 70, loop: true, callback: () => this.rotorWash(s.x, s.y) });
      await this.tween({ targets: s, x: home.x + dir * 24, y: home.y - 80, duration: 300, ease: 'Quad.easeOut' });
      await this.tween({ targets: s, x: tx - dir * 4, y: Math.max(ty - 60, s.displayHeight + 6), duration: 300, ease: 'Sine.easeInOut' });
      wash.remove();
      // omdraaien: de bal blijft op dezelfde hoogte, de staarten gaan naar boven
      s.play(p.anim('drill'));
      s.y -= 48;
      shockwave(this, s.x, s.y - 18, 0xffffff, 28, 200);
      audio.sfx('jump', { volume: 0.7 });
      await this.wait(110);
      const trail = this.time.addEvent({ delay: 18, repeat: 10, callback: () => { this.ghost(s, 0xffb040); this.windLine(s); } });
      await this.tween({ targets: s, x: tx, y: ty + 4, duration: 140, ease: 'Quad.easeIn' });
      trail.remove();
      if (!missed) shockwave(this, tx, ty - 10, 0xffb040, 50, 260);
    } else if (move.anim === 'fly') {
      // Copter Dive / Flutter Dive: omhoog vliegen, boven het doelwit hangen, dan duiken
      s.play(p.anim('fly'));
      await this.tween({ targets: s, y: home.y - 70, duration: 300, ease: 'Sine.easeOut' });
      await this.tween({ targets: s, x: tx - dir * 10, y: Math.max(ty - 55, s.displayHeight + 4), duration: 320, ease: 'Sine.easeInOut' });
      s.play(this.anims.exists(p.anim('spindisc')) ? p.anim('spindisc') : p.anim('spin'));
      const trail = this.time.addEvent({ delay: 25, repeat: 6, callback: () => this.ghost(s, p.def.id === 'cream' ? 0xffb070 : 0x6aa8ff) });
      await this.tween({ targets: s, x: tx, y: ty, duration: 140, ease: 'Quad.easeIn' });
      trail.remove();
    } else if (move.anim === 'glide') {
      // Glide Attack: hoog opspringen, dan met de vuisten vooruit schuin naar het doelwit zweven
      s.play(p.anim('spin'));
      await this.tween({ targets: s, x: home.x - dir * 10, y: home.y - 80, duration: 260, ease: 'Quad.easeOut' });
      s.play(p.anim('glide'));
      const trail = this.time.addEvent({ delay: 40, repeat: 8, callback: () => { this.ghost(s, 0xff7a7a); this.windLine(s); } });
      await this.tween({ targets: s, x: tx - dir * 4, y: ty + 4, duration: 420, ease: 'Sine.easeIn' });
      trail.remove();
    } else if (move.anim === 'hammer') {
      // Piko Hammer: naar het doelwit rennen, dan de hamer omhoog en neer; raak op het moment dat hij de grond raakt
      s.play(run);
      const dustRun = this.time.addEvent({ delay: 90, repeat: 3, callback: () => this.dust(s.x - dir * 8, s.y, 1) });
      await this.tween({ targets: s, x: tx - dir * 46, y: ty, duration: 320, ease: 'Sine.easeIn' });
      dustRun.remove();
      await this.playUntilFrame(s, p.anim('hammer'), '10_6');
      this.cameras.main.shake(160, 0.008);
      shockwave(this, tx, ty, 0xff8fc8, 70, 320);
      this.dust(tx, ty, 8);
      strike();
      await this.wait(260);
    } else if (move.anim === 'spear' || move.anim === 'chaos') {
      // Shadow: Chaos Spear (van een afstand) en Chaos Control (de tijd stilzetten); die zetten hem zelf weer thuis
      const ctx = { ...this.ultCtx(s, p, target, home, dir, strike), missed };
      await (move.anim === 'spear' ? chaosSpear(ctx) : chaosControl(ctx));
      s.play(p.anim('idle'));
      return;
    } else if (move.anim === 'ultimate' && p.def.id === 'shadow') {
      // Super Barrage; gratis na een KO = korte versie (hij is nog super)
      await superShadow({ ...this.ultCtx(s, p, target, home, dir, strike), missed, quick: this.freeUse });
      s.play(p.anim('idle')); // na de ultimate weer gewoon Shadow
      return;
    } else if (move.anim === 'ultimate') {
      // eigen animatie per character (ultimates.ts); die zet de sprite zelf weer thuis
      await playUltimate(this.ultCtx(s, p, target, home, dir, strike));
      s.play(p.anim('idle'));
      return;
    } else if (move.anim === 'twirl') {
      // Hammer Twirl: als draaiende schijf met hartjes op het doelwit af, dan de hamer rond
      s.play(this.anims.exists(p.anim('spindisc')) ? p.anim('spindisc') : p.anim('twirl'));
      const trail = this.time.addEvent({ delay: 40, repeat: 12, callback: () => { this.ghost(s, 0xff8fc8); if (Math.random() < 0.5) hearts(this, s.x, s.y - 16, 1); } });
      await this.tween({ targets: s, x: home.x + dir * 10, y: home.y - 30, duration: 200, ease: 'Sine.easeOut' });
      await this.tween({ targets: s, x: tx - dir * 18, y: ty, duration: 340, ease: 'Quad.easeIn' });
      s.play(p.anim('twirl'));
      await this.wait(160);
      trail.remove();
    }

    strike();
    if (finisher) await finisher();
    if (missed) {
      await this.tween({ targets: s, x: tx + dir * 70, alpha: 0.5, duration: 160 });
      s.setAlpha(1).setPosition(home.x - dir * 40, home.y - 40);
      s.play(p.anim('spin'));
      await this.tween({ targets: s, x: home.x, y: home.y, duration: 260, ease: 'Quad.easeIn' });
    } else {
      // terug met een salto in een boog (zoals in Sonic Battle / Sonic RPG)
      s.play(p.anim('spin'));
      await this.tween({ targets: s, x: (home.x + tx) / 2, y: home.y - 60, duration: 260, ease: 'Quad.easeOut' });
      await this.tween({ targets: s, x: home.x, y: home.y, duration: 240, ease: 'Quad.easeIn' });
    }
    s.play(p.anim('idle'));
    this.land(s, base);
  }

  /** Alles wat een ultimate-animatie van dit gevecht nodig heeft. */
  private ultCtx(s: Phaser.GameObjects.Sprite, p: Fighter, target: Phaser.GameObjects.Sprite,
    home: { x: number; y: number }, dir: number, strike: () => void): UltCtx {
    return {
      scene: this, s, p, target, home, dir, strike,
      restoreTarget: () => { if (target === this.foe) this.startHover(); },
      center: spr => this.center(spr),
      ghost: (spr, tint) => this.ghost(spr, tint),
      burst: (x, y, color, n) => this.burst(x, y, color, n),
      teamIcons: this.partyHeads,
    };
  }

  /** Homing Attack-vizier: vier hoekjes die op het doelwit dichtklappen. */
  private async lockOn(target: Phaser.GameObjects.Sprite) {
    const c = this.center(target);
    const g = this.add.graphics().setDepth(30);
    const draw = (r: number, color: number) => {
      g.clear().lineStyle(2, color);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.beginPath();
        g.moveTo(c.x + sx * r, c.y + sy * (r - 7));
        g.lineTo(c.x + sx * r, c.y + sy * r);
        g.lineTo(c.x + sx * (r - 7), c.y + sy * r);
        g.strokePath();
      }
    };
    const st = { r: 40 };
    audio.sfx('cursormove');
    await this.tween({ targets: st, r: 18, duration: 160, ease: 'Quad.easeIn', onUpdate: () => draw(st.r, 0xff4a4a) });
    draw(18, 0x7cf07c);
    audio.sfx('confirm', { volume: 0.5 });
    await this.wait(90);
    g.destroy();
  }

  /** Luchtstroom onder Tails' propeller: platte ringetjes die uitdijen en vervagen. */
  private rotorWash(x: number, y: number) {
    const r = this.add.ellipse(x, y + 2, 14, 4).setStrokeStyle(1, 0xffffff, 0.8).setDepth(4);
    this.tweens.add({ targets: r, scaleX: 2.4, scaleY: 1.6, y: y + 12, alpha: 0, duration: 260, onComplete: () => r.destroy() });
  }

  /** Dun wit windstreepje achter iemand die snel beweegt. */
  private windLine(s: Phaser.GameObjects.Sprite) {
    const l = this.add.rectangle(s.x - 10, s.y - Phaser.Math.Between(6, 30), Phaser.Math.Between(14, 26), 1, 0xffffff, 0.8).setDepth(4);
    this.tweens.add({ targets: l, x: l.x - 30, alpha: 0, duration: 220, onComplete: () => l.destroy() });
  }

  /** Stofwolkjes op de grond (hamerklap). */
  private dust(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const d = this.add.circle(x, y, Phaser.Math.Between(3, 6), 0xe8e0d0, 0.8).setDepth(15);
      const side = i % 2 ? 1 : -1;
      this.tweens.add({ targets: d, x: x + side * Phaser.Math.Between(16, 40), y: y - Phaser.Math.Between(0, 12), scale: 0.3, alpha: 0,
        duration: Phaser.Math.Between(300, 500), ease: 'Quad.easeOut', onComplete: () => d.destroy() });
    }
  }

  /** Doelwit schuift even weg door de klap en veert terug. */
  private knockback(spr: Phaser.GameObjects.Sprite, dir: number, crit: boolean) {
    const x0 = spr.x;
    this.tweens.add({ targets: spr, x: x0 + dir * (crit ? 16 : 9), duration: 70, ease: 'Quad.easeOut', yoyo: true, hold: 40,
      onComplete: () => spr.setX(x0) });
  }

  /** Aanloop: even door de knieën (squash) voor een sprong of sprint. */
  private async anticipate(s: Phaser.GameObjects.Sprite, base: number) {
    await this.tween({ targets: s, scaleX: base * 1.12, scaleY: base * 0.84, duration: 70, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: s, scaleX: base * 0.94, scaleY: base * 1.08, duration: 80, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => s.setScale(base) });
  }

  /** Landen: stofje en een kleine squash. */
  private land(s: Phaser.GameObjects.Sprite, base: number) {
    this.dust(s.x, s.y, 4);
    this.tweens.add({ targets: s, scaleX: base * 1.1, scaleY: base * 0.88, duration: 60, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => s.setScale(base) });
  }

  /** Korte bevriezing bij een treffer, zodat klappen zwaarder voelen. */
  private hitStop(ms: number) {
    this.tweens.pauseAll();
    this.hero.anims.pause();
    this.foe.anims.pause();
    window.setTimeout(() => {
      this.tweens.resumeAll();
      if (this.hero.anims.isPaused) this.hero.anims.resume();
      if (this.foe.anims.isPaused) this.foe.anims.resume();
    }, ms);
  }

  /** Inslag-effect dat bij het character past (Sonic Battle-effecten). */
  private impactFx(att: Fighter, x: number, y: number, crit: boolean, dir: number) {
    const once = (anim: string, scale: number, flip = false, depth = 16) => {
      const sp = this.add.sprite(x, y, 'fx').setScale(scale).setDepth(depth).setFlipX(flip).play({ key: anim, repeat: 0 });
      sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
      return sp;
    };
    const id = att.def.id;
    if (id === 'sonic') once('fx_wind', crit ? 1.3 : 0.9, dir < 0);
    else if (id === 'knuckles') once('fx_burst', crit ? 1.6 : 1.1);
    else if (id === 'tails') {
      const sp = this.add.sprite(x, y, 'fx').setScale(0.6).setDepth(16).setBlendMode(Phaser.BlendModes.ADD).play('fx_energy');
      this.tweens.add({ targets: sp, scale: crit ? 1.8 : 1.3, alpha: 0, duration: 260, onComplete: () => sp.destroy() });
    } else if (id === 'amy') {
      for (let i = 0; i < (crit ? 8 : 4); i++) {
        const h = this.add.image(x, y, 'heart').setTint(i % 2 ? 0xff6fb5 : 0xffffff).setDepth(17);
        const a = Math.random() * Math.PI * 2;
        this.tweens.add({ targets: h, x: x + Math.cos(a) * 26, y: y + Math.sin(a) * 22 - 10, alpha: 0, duration: 520, onComplete: () => h.destroy() });
      }
    } else if (id === 'shadow') {
      const sp = this.add.sprite(x, y, 'shadowfx').setScale(crit ? 1.3 : 0.9).setDepth(16).play({ key: 'sh_spear_hit', repeat: 0 });
      sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
    } else if (id === 'cream') {
      const ring = this.add.circle(x, y, 6).setStrokeStyle(2, 0x8ad8ff).setDepth(16);
      this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    }
    if (crit) once('fx_slash', 1.4, dir < 0, 17);
  }

  private ghost(s: Phaser.GameObjects.Sprite, tint = 0x6aa8ff) {
    const g = this.add.sprite(s.x, s.y, s.texture.key, s.frame.name).setOrigin(0.5, 1).setScale(s.scaleX)
      .setFlipX(s.flipX).setRotation(s.rotation).setTint(tint).setAlpha(0.5).setDepth(4);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  /** Eggman: raketten uit de Egg Mobile, bommen van boven, of lachen (ATK +1). */
  private async eggmanAttack(move: MoveDef, strike: () => void, missed: boolean) {
    const b = this.foe;
    const heroC = this.center(this.hero);
    if (move.anim === 'laugh') {
      this.playOnce(b, 'eggman_attack');
      audio.voice('eggmanlaugh');
      void bigText(this, b.x, b.y - b.displayHeight - 10, 'HOHOHO!', '#ff6a5a');
      await this.tween({ targets: b, y: b.y - 6, duration: 120, yoyo: true, repeat: 2 });
      strike();
      return;
    }
    if (move.anim === 'missile') {
      audio.voice(Math.random() < 0.5 ? 'eggmantake' : 'eggmanhows');
      // even naar voren draaien (koplamp), dan drie raketten in een boog
      await this.playOnce(b, 'eggman_turn');
      const sx = b.x - 20, sy = b.y - b.displayHeight * 0.45;
      const flights: Promise<void>[] = [];
      for (let i = 0; i < 3; i++) {
        flights.push(new Promise<void>(done => this.time.delayedCall(i * 140, () => {
          const m = this.add.sprite(sx, sy, 'eggman', 'eggman_missile_0').setScale(2).setDepth(15);
          audio.sfx('jump', { volume: 0.4 });
          const tx = missed ? heroC.x - 70 : heroC.x + Phaser.Math.Between(-8, 8);
          const ty = missed ? heroC.y - 50 : heroC.y + Phaser.Math.Between(-10, 10);
          const arc = { t: 0 };
          const lift = 40 + i * 14;
          this.tweens.add({
            targets: arc, t: 1, duration: 420, ease: 'Sine.easeIn',
            onUpdate: () => {
              const x = sx + (tx - sx) * arc.t, y = sy + (ty - sy) * arc.t - Math.sin(arc.t * Math.PI) * lift;
              m.setRotation(Math.atan2(y - m.y, x - m.x)).setPosition(x, y);
            },
            onComplete: () => {
              m.destroy();
              const puff = this.add.sprite(tx, ty, 'eggman').setScale(2).setDepth(16).play('eggman_puff');
              puff.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => puff.destroy());
              if (i === 0) strike(); else if (!missed) this.burst(tx, ty, 0xffa040, 6);
              done();
            },
          });
        })));
      }
      if (missed) this.tween({ targets: this.hero, y: PLAYER_POS.y - 34, duration: 180, yoyo: true, ease: 'Quad.easeOut' });
      await Promise.all(flights);
      await this.wait(200);
      return;
    }
    // bommen: over de held vliegen en drie bommen laten vallen
    audio.voice(Math.random() < 0.5 ? 'eggmanhows' : 'eggmantake');
    b.play('eggman_idle');
    await this.tween({ targets: b, x: heroC.x + 20, y: 96, duration: 520, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 3; i++) {
      const bomb = this.add.sprite(b.x + (i - 1) * 16, b.y - 4, 'eggman').setScale(2).setDepth(15).play('eggman_bomb');
      const tx = missed ? heroC.x + 60 + i * 10 : heroC.x + (i - 1) * 12;
      audio.sfx('cursormove', { volume: 0.5 });
      this.tweens.add({ targets: bomb, x: tx, y: PLAYER_POS.y - 6, duration: 360, ease: 'Quad.easeIn', onComplete: () => {
        bomb.destroy();
        const boom = this.add.sprite(tx, PLAYER_POS.y + 4, 'badniks').setOrigin(0.5, 1).setScale(1.4).setDepth(16).play('explosion');
        boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy());
        audio.sfx('explosion', { volume: 0.5 });
        this.cameras.main.shake(120, 0.006);
        if (i === 1) strike();
      } });
      await this.wait(150);
    }
    if (missed) this.tween({ targets: this.hero, x: PLAYER_POS.x - 30, duration: 160, yoyo: true });
    await this.wait(420);
    await this.tween({ targets: b, x: this.foeHome.x, y: this.foeHome.y, duration: 480, ease: 'Sine.easeInOut' });
  }

  /** Aanvallen van badniks. De stijl staat in de move (shoot / tackle / lash / slam). */
  private async foeAttack(move: MoveDef, strike: () => void, missed: boolean) {
    const b = this.foe;
    const e = this.enemy;
    this.foeHover?.stop();
    const heroC = this.center(this.hero);
    const attackAnim = e.anim('attack');
    await this.anticipate(b, e.def.scale); // ook badniks nemen even aanloop

    if (move.anim === 'missile' || move.anim === 'bomb' || move.anim === 'laugh') {
      await this.eggmanAttack(move, strike, missed);
    } else if (move.anim === 'shoot') {
      const anim = this.playOnce(b, attackAnim);
      await this.wait(this.anims.exists(attackAnim) ? 250 : 0);
      await this.tween({ targets: b, x: b.x + 6, duration: 90, yoyo: true });
      const sx = b.x - b.displayWidth * 0.4, sy = b.y - b.displayHeight * 0.5;
      const shots = 3;
      for (let i = 0; i < shots; i++) {
        const sp = this.add.image(sx, sy, 'spark').setTint(move.tint ?? 0xfff6b0).setDepth(14);
        this.tweens.add({
          targets: sp, x: missed ? heroC.x - 60 : heroC.x, y: heroC.y + (missed ? -40 : 0), duration: 280, delay: i * 90,
          onComplete: () => {
            sp.destroy();
            if (i === 0) strike();
            else if (!missed) this.burst(heroC.x, heroC.y, move.tint ?? 0xfff6b0, 5);
          },
        });
      }
      if (missed) this.tween({ targets: this.hero, y: PLAYER_POS.y - 34, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
      await this.wait(shots * 90 + 300);
      await anim;
    } else if (move.anim === 'tackle') {
      // terugtrekken, dan dwars door de held heen razen
      this.playOnce(b, attackAnim);
      await this.tween({ targets: b, x: b.x + 14, duration: 160, ease: 'Quad.easeOut' });
      await this.tween({ targets: b, x: heroC.x + 20, y: PLAYER_POS.y - 10, duration: 240, ease: 'Quad.easeIn' });
      strike();
      if (missed) await this.tween({ targets: this.hero, y: PLAYER_POS.y - 36, duration: 150, yoyo: true });
      await this.tween({ targets: b, x: this.foeHome.x, y: this.foeHome.y, duration: 380, ease: 'Quad.easeOut' });
    } else if (move.anim === 'lash') {
      // dichterbij springen, tong uit, raak op het einde
      await this.tween({ targets: b, x: b.x - 90, y: b.y + 40, duration: 260, ease: 'Quad.easeOut' });
      await this.playOnce(b, attackAnim);
      strike();
      if (missed) await this.tween({ targets: this.hero, x: PLAYER_POS.x - 24, duration: 120, yoyo: true });
      await this.wait(150);
      b.play(e.anim('idle'));
      await this.tween({ targets: b, x: this.foeHome.x, y: this.foeHome.y, duration: 300, ease: 'Quad.easeOut' });
    } else {
      // slam: opspringen en op de held landen
      this.playOnce(b, attackAnim);
      await this.tween({ targets: b, y: b.y - 34, duration: 220, ease: 'Quad.easeOut' });
      await this.tween({ targets: b, x: PLAYER_POS.x + 40, y: PLAYER_POS.y, duration: 280, ease: 'Quad.easeIn' });
      strike();
      this.cameras.main.shake(160, 0.006);
      if (missed) this.tween({ targets: this.hero, y: PLAYER_POS.y - 30, duration: 150, yoyo: true });
      await this.tween({ targets: b, x: this.foeHome.x, y: this.foeHome.y, duration: 400, ease: 'Quad.easeOut' });
    }
    b.play(e.anim('idle'), true);
    this.startHover();
  }

  private async winWave() {
    this.tut?.event('win');
    this.foeHover?.stop();
    if (this.charFoe) return this.winRival();
    if (this.enemy.def.id === 'eggman') return this.winEggman();
    const c = this.center(this.foe);
    const boom = this.add.sprite(c.x, c.y + 10, 'badniks').setOrigin(0.5, 1).setScale(this.enemy.def.scale * 1.1).setDepth(16);
    boom.play('explosion');
    // badnik kapot: de "poof" uit de Advance-games (boss: grote explosie)
    audio.sfx(isBossWave(this.wave) ? 'bigexplosion' : 'monitorbreak');
    boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy());
    this.burst(c.x, c.y, 0xf2c230, 18);
    this.tween({ targets: this.eBox.root, alpha: 0, duration: 300 });
    this.time.delayedCall(120, () => this.foe.setVisible(false));
    await this.wait(450);
    await this.say(`Foe ${this.enemy.name} was destroyed!`, 300);
    await this.finishWin(c);
  }

  /** Eggman verslagen: explosies op de Egg Mobile, en dan tolt hij het scherm uit. */
  private async winEggman() {
    const c = this.center(this.foe);
    this.foe.play('eggman_spin');
    audio.voice('eggmandefeat');
    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(i * 120, () => {
        const boom = this.add.sprite(c.x + Phaser.Math.Between(-30, 30), c.y + Phaser.Math.Between(-20, 30), 'badniks').setOrigin(0.5, 1).setScale(1.6).setDepth(16).play('explosion');
        boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy());
        audio.sfx('explosion', { volume: 0.5 });
      });
    }
    this.cameras.main.shake(500, 0.01);
    this.tween({ targets: this.eBox.root, alpha: 0, duration: 300 });
    await this.wait(650);
    audio.sfx('bigexplosion');
    await this.tween({ targets: this.foe, x: W + 80, y: -60, angle: 540, duration: 700, ease: 'Quad.easeIn' });
    this.foe.setVisible(false).setAngle(0);
    await this.say('Dr. Eggman fled! "I\'ll get you next time!"', 500);
    await this.finishWin(c);
  }

  /** Rival verslagen: geen explosie maar de KO-pose, en daarna wordt het character vrijgespeeld. */
  private async winRival() {
    const c = this.center(this.foe);
    this.foe.play(this.enemy.anim('ko'));
    this.burst(c.x, c.y, 0xffffff, 12);
    audio.sfx('bosshit', { volume: 0.7 });
    this.tween({ targets: this.eBox.root, alpha: 0, duration: 300 });
    await this.wait(600);
    await this.rivalTalk('defeat');
    await this.say(this.rival ? `Rival ${this.enemy.name} was defeated!` : `${this.enemy.name} was defeated!`, 300);
    await this.tween({ targets: this.foe, alpha: 0, x: this.foe.x + 40, duration: 400 });
    this.foe.setVisible(false).setAlpha(1);
    await this.finishWin(c);
  }

  private async finishWin(c: { x: number; y: number }) {
    // Sonic Speed: na elke KO SPD +1
    if (this.player.def.passive?.id === 'speedster' && !this.player.fainted) {
      audio.sfx('speedup', { volume: 0.5 });
      await this.changeStage(this.player, 'spd', 1, 'Sonic Speed! ');
    }
    const kind = isBossWave(this.wave) ? 'boss' : this.elite ? 'elite' : 'normal';
    // Eggman Alarm gehaald: de rewards hierna zijn minstens uncommon
    this.minTier = this.alarmWave && !this.rival ? 'uncommon' : 'common';
    // Piggy Bank: dubbele rings
    const piggy = this.enemy.def.trait === 'piggyBank' ? 2 : 1;
    const gained = Math.round(waveRings(this.wave, kind) * piggy * (this.waveMagnet ? 1 + MAGNET_BONUS : 1));
    // na een boss: een eigen, grotere overwinning als die er is (Sonic: breakdance en duim omhoog)
    const bossWin = this.player.anim('bosswin');
    if (!this.player.fainted) this.hero.play(isBossWave(this.wave) && this.anims.exists(bossWin) ? bossWin : this.player.anim('victory'));
    this.victoryVoice();
    if (isBossWave(this.wave)) audio.playJingle('victory', zoneForWave(this.wave + 1, this.zoneOrder).backdrop as MusicKey);
    this.spillRings(c.x, c.y, gained);

    const exp = this.enemy.def.expYield + this.enemy.level * 3;
    const before = { level: this.player.level, exp: this.player.exp };
    const ups = this.player.gainExp(exp);
    this.pBox.expAnimating = true;
    this.say(`${this.player.name} got ${exp} EXP and ${gained} rings!`, 0);
    await this.animateExp(before.level, before.exp);
    if (ups) await this.say(`${this.player.name} grew to Lv.${this.player.level}!`, 500);
    await this.teamExp(exp);
    const ult = this.player.def.ultimate;
    if (ult && before.level < ULTIMATE_LEVEL && this.player.level >= ULTIMATE_LEVEL) {
      audio.sfx('confirm2');
      this.cameras.main.flash(300, 255, 230, 120);
      await this.say(`${this.player.name} learned the ultimate ${MOVES[ult].name}! It uses a full Boost meter.`, 1100);
    }
    else await this.realWait(300);

    if (isBossWave(this.wave)) {
      this.lastMove = 0;
      if (this.party.some(f => Object.values(f.stages).some(v => v !== 0))) {
        this.party.forEach(f => { f.stages = emptyStages(); });
        await this.say(this.party.length > 1 ? `The team's stat changes wore off.` : `${this.player.name}'s stat changes wore off.`, 400);
      }
    }
    if (isBossWave(this.wave)) {
      // nieuwe zone: zone-effect terug, Iron Fists weer beschikbaar
      this.fieldCleared = false;
      this.party.forEach(f => { f.sashUsed = false; });
      await this.bossRecovery();
    }
    if (isBossWave(this.wave) && this.emeralds < EMERALDS.length) await this.awardEmerald(c.x, c.y);
    // rival of boss-Shadow verslagen: vrijgespeeld, en hij wil meteen meedoen
    const recruit = this.charFoe && !this.party.some(f => f.def.id === this.enemy.def.id);
    if (this.charFoe && unlock(this.enemy.def.id)) await this.unlockBanner(this.enemy.def.id, this.enemy.name);
    if (recruit) await this.offerRivalJoin(this.enemy.def.id, this.enemy.level);
    const share = expShareAfter(this.wave);
    if (share > this.expShare) {
      this.expShare = share;
      audio.sfx('confirm2');
      await this.say(`Got the Exp. Share! Your team on the bench now gets ${Math.round(benchExpRate(share, this.emeralds) * 100)}% EXP` +
        `${this.emeralds ? ' (with the Chaos Emeralds)' : ''}.`, 900);
    }
    // zelf KO gegaan bij het winnen (Tornado Hammer)? Dan eerst iemand anders erin, of game over
    if (this.player.fainted) {
      const alive = this.party.filter(f => !f.fainted);
      if (!alive.length) { await this.loseRun(); return; }
      const next = alive.length > 1 ? this.party[await this.pickTeammate('Who goes next?', false)] : alive[0];
      await this.switchTo(next);
    }
    // wave gewonnen: opslaan alsof de volgende wave al begonnen is (Save & Quit tijdens de rewards houdt de winst)
    this.autoSave(this.wave + 1);
    await this.waitForVictoryPose();
    this.openRewards();
  }

  /**
   * De overwinnings-animatie helemaal laten uitspelen voordat de rewards komen
   * (behalve op Battle Speed 3x: dan gaat het meteen door). Max een paar seconden, voor de zekerheid.
   */
  private async waitForVictoryPose() {
    if (settings.battleSpeed >= 2 || this.player.fainted) return;
    const anim = this.hero.anims;
    const key = anim.currentAnim?.key;
    if (!key || !anim.isPlaying || (key !== this.player.anim('victory') && key !== this.player.anim('bosswin'))) return;
    await new Promise<void>(resolve => {
      const done = () => { timer.remove(); resolve(); };
      const timer = this.time.delayedCall(4500, () => { this.hero.off(Phaser.Animations.Events.ANIMATION_COMPLETE, done); resolve(); });
      this.hero.once(Phaser.Animations.Events.ANIMATION_COMPLETE, done);
    });
    await this.realWait(250); // laatste pose even laten staan
  }

  /**
   * Na een boss. Main boss (20, 40, 60, 80): het hele team weer vol, ook wie KO was, en minstens
   * MAIN_BOSS_BOOST Boost. Zone-boss (10, 30, 50, 70): KO's staan op en wie onder de 50% zit gaat naar 50%.
   */
  private async bossRecovery() {
    const names = (fs: Fighter[]) => fs.map(f => f.name).join(' and ');
    const wasDown = this.player.fainted;
    if (isMainBossWave(this.wave)) {
      const needs = this.party.some(f => f.hp < f.maxHp || f.boost < MAIN_BOSS_BOOST);
      this.party.forEach(f => { f.hp = f.maxHp; f.boost = Math.max(f.boost, MAIN_BOSS_BOOST); });
      if (!needs) return;
      if (wasDown) this.hero.play(this.player.anim('idle'));
      this.refreshPartyHeads();
      audio.sfx('heal1');
      this.sparkles(this.hero);
      await this.setBox(this.pBox, this.player, true);
      await this.say(this.party.length > 1 ? `The team is fully healed, with ${MAIN_BOSS_BOOST}+ Boost each!` : `${this.player.name} is fully healed, with ${MAIN_BOSS_BOOST}+ Boost!`, 600);
      return;
    }
    const down = this.party.filter(f => f.fainted);
    const low = this.party.filter(f => !f.fainted && f.hp < f.maxHp * ZONE_BOSS_HEAL);
    for (const f of down) f.hp = Math.max(1, Math.ceil(f.maxHp * BOSS_REVIVE_HP));
    for (const f of low) f.hp = Math.max(f.hp, Math.ceil(f.maxHp * ZONE_BOSS_HEAL));
    if (!down.length && !low.length) return;
    if (wasDown) this.hero.play(this.player.anim('idle'));
    this.refreshPartyHeads();
    audio.sfx('heal1');
    if (low.includes(this.player) || down.includes(this.player)) await this.setBox(this.pBox, this.player, true);
    if (down.length) await this.say(`${names(down)} got back up with ${Math.round(BOSS_REVIVE_HP * 100)}% HP!`, 500);
    if (low.length) await this.say(`${names(low)} ${low.length > 1 ? 'were' : 'was'} patched up to ${Math.round(ZONE_BOSS_HEAL * 100)}% HP!`, 500);
  }

  /** Stat stage veranderen, met pijltjes en een geluidje als hij echt verandert (net als in Pokémon). */
  private async changeStage(f: Fighter, k: StageKey, by: number, prefix = '') {
    const before = f.stages[k];
    const text = f.raise(k, by);
    const after = f.stages[k];
    if (after !== before) this.statArrows(f === this.player ? this.hero : this.foe, after > before);
    await this.say(prefix + text, 300);
  }

  /**
   * Pijltjes over een character: goud en omhoog als een stat stijgt, blauw en omlaag als hij daalt.
   * Golfjes van vijf pijltjes die opkomen en vervagen.
   */
  private statArrows(spr: Phaser.GameObjects.Sprite, up: boolean) {
    audio.sfx(up ? 'statup' : 'statdown', { volume: 0.6 });
    const body = this.bodyHeight(spr);
    const color = up ? 0xffbe3c : 0x5a8cff;
    const offsets = [-16, 0, 16, -8, 8];
    for (let wave = 0; wave < 2; wave++) {
      offsets.forEach((ox, i) => {
        const g = this.add.graphics().setDepth(19);
        // pijl van 12x11 met de donkerpaarse rand van de HUD
        const pts = up
          ? [0, 0, 6, 6, 3, 6, 3, 11, -3, 11, -3, 6, -6, 6]
          : [0, 11, 6, 5, 3, 5, 3, 0, -3, 0, -3, 5, -6, 5];
        const poly: Phaser.Math.Vector2[] = [];
        for (let j = 0; j < pts.length; j += 2) poly.push(new Phaser.Math.Vector2(pts[j], pts[j + 1]));
        g.fillStyle(color).fillPoints(poly, true);
        g.lineStyle(1, HUD.outline).strokePoints(poly, true);
        // omhoog: van de voeten tot boven het hoofd; omlaag: vanaf net boven het hoofd tot het middel
        const y0 = up ? spr.y - 14 : spr.y - body - 6;
        const y1 = up ? spr.y - body - 14 : spr.y - body * 0.35;
        g.setPosition(spr.x + ox, y0 + (up ? 1 : -1) * (i % 3) * 5).setAlpha(0);
        this.tweens.add({ targets: g, y: y1, duration: 520, delay: wave * 260 + i * 60, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: g, alpha: { from: 1, to: 0 }, duration: 520, delay: wave * 260 + i * 60, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
      });
    }
  }

  /** Rings springen uit de kapotte badnik en vliegen naar de teller rechtsboven. */
  private spillRings(x: number, y: number, amount: number) {
    const n = Math.min(10, Math.max(4, Math.round(amount / 5)));
    const per = amount / n;
    let added = 0;
    for (let i = 0; i < n; i++) {
      const r = this.add.sprite(x, y, 'ui', 'ring_0').setDepth(24).play({ key: 'ring_spin', startFrame: i % 4 });
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.2;
      const ox = x + Math.cos(a) * (24 + Math.random() * 14), oy = y + Math.sin(a) * (24 + Math.random() * 14);
      this.tweens.chain({
        targets: r,
        tweens: [
          { x: ox, y: oy, duration: 260, ease: 'Quad.easeOut', delay: i * 40 },
          { x: this.ringIcon.x, y: this.ringIcon.y, duration: 420, ease: 'Cubic.easeIn', delay: 120 },
        ],
        onComplete: () => {
          const sp = this.add.sprite(r.x, r.y, 'ui', 'sparkle_0').setDepth(25).play('sparkle');
          sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
          r.destroy();
          added++;
          this.rings += added === n ? amount - Math.round(per) * (n - 1) : Math.round(per);
          audio.sfx('ringcollect', { volume: 0.5, throttle: 70 });
          this.ringText.setText(`${this.rings}`);
        },
      });
    }
  }

  /** Emerald verschijnt waar de boss ontplofte en vliegt naar zijn slot in de HUD. */
  private async awardEmerald(x: number, y: number) {
    const color = EMERALDS[this.emeralds];
    const slot = this.emeraldSlots[this.emeralds];
    this.emeralds++;
    const e = this.add.sprite(x, y, 'emeralds').setDepth(26).setScale(0);
    e.play(`emerald_${color}`);
    await this.tween({ targets: e, scale: 3, y: y - 20, duration: 400, ease: 'Back.easeOut' });
    audio.sfx('confirm2', { volume: 0.7 });
    this.burst(e.x, e.y, 0xffffff, 16);
    await this.say(`${this.player.name} got the ${color[0].toUpperCase() + color.slice(1)} Chaos Emerald!`, 300);
    await this.tween({ targets: e, x: slot.x, y: slot.y, scale: 1, duration: 500, ease: 'Cubic.easeInOut' });
    e.destroy();
    slot.clearTint().setAlpha(1).play(`emerald_${color}`);
    this.burst(slot.x, slot.y, 0xffffff, 8);
    audio.sfx('ringchime');
    const rate = Math.round(benchExpRate(this.expShare, this.emeralds) * 100);
    await this.say(`The Chaos Emerald shares its power: bench EXP +${Math.round(EMERALD_EXP_BONUS * 100)}% (now ${rate}%)!`, 450);
    if (this.emeralds === EMERALDS.length) await this.say('All 7 Chaos Emeralds collected!', 600);
  }

  /** Zone-titel die erin schuift aan het begin van een zone. */
  // ---------------------------------------------------------------- party
  /** Kleine hoofdjes van je team boven het portret; de actieve is fel, KO is donker. */
  private refreshPartyHeads() {
    const x0 = W - 186 - 54;
    this.partyHeads.forEach((img, i) => {
      const f = this.party[i];
      img.setVisible(!!f && this.party.length > 1);
      if (!f) return;
      img.setFrame(`head_${f.def.id}`).setX(x0 + i * 18);
      if (f.fainted) img.setTint(0x30344a).setAlpha(0.8);
      else img.clearTint().setAlpha(f === this.player ? 1 : 0.6);
      if (this.rewardLayer) img.setAlpha(0); // reward-scherm: het team staat rechtsonder
    });
  }

  /** Regel voor een teamgenoot in een keuze-lijstje: hoofdje, level, Boost en HP. */
  private partyRow(f: Fighter, disabled: boolean): ChoiceRow {
    return { label: `${f.name} Lv.${f.level}`, right: f.fainted ? 'KO' : `${f.hp}/${f.maxHp}`, head: `head_${f.def.id}`, disabled, boost: f.boost };
  }

  /** Zes blokjes Boost (vol = goud), zoals in je info-box. */
  private boostPips(x: number, y: number, boost: number, dim = false, step = 6) {
    const g = this.add.graphics().setAlpha(dim ? 0.45 : 1);
    for (let i = 0; i < MAX_BOOST; i++) {
      g.fillStyle(HUD.outline).fillRect(x + i * step, y, step - 1, 6);
      g.fillStyle(i < boost ? (boost >= MAX_BOOST ? HUD.pipFull : HUD.pip) : HUD.pipEmpty).fillRect(x + i * step + 1, y + 1, step - 3, 4);
    }
    return g;
  }

  /** Keuze-lijstje rechts boven het tekstvak. Geeft de gekozen index terug, of -1 bij X (als dat mag). */
  private choose(title: string, rows: ChoiceRow[], cancel: boolean, center = false): Promise<number> {
    this.endChoice();
    this.cmdLayer.setVisible(false);
    this.fightLayer.setVisible(false);
    this.pointer.setVisible(false);
    this.msg.setVisible(true).setText(title);
    this.menu = 'choice';
    this.choiceRows = rows;
    this.choiceCancel = cancel;
    const rowH = rows.some(r => r.head) ? 20 : 15;
    const boost = rows.some(r => r.boost !== undefined);
    // breed genoeg voor de langste regel (8 px per letter + cursor en rand)
    const longest = Math.max(...rows.map(r => r.label.length)) * 8 + 32;
    const w = boost ? 262 : rows.some(r => r.head) ? 210 : Math.max(90, longest), h = rows.length * rowH + 12;
    // `center`: midden in beeld (einde van de tutorial), anders rechts boven het tekstvak
    const x = center ? Math.round((W - w) / 2) : W - w - 8, y = center ? Math.round((PANEL_Y - h) / 2) + 24 : PANEL_Y - h - 4;
    const c = this.add.container(0, 0).setDepth(46);
    const g = this.add.graphics();
    sonicPanel(g, x, y, w, h, 'blue', 0.97);
    c.add(g);
    this.choiceTexts = rows.map((r, i) => {
      const ry = y + 6 + i * rowH + (rowH - 8) / 2;
      let tx = x + 18;
      if (r.head) { c.add(this.add.image(tx, ry + 4, 'ui', r.head).setOrigin(0, 0.5).setAlpha(r.disabled ? 0.4 : 1)); tx += 20; }
      const t = this.add.text(tx, ry, r.label, { fontFamily: FONT, fontSize: '8px', color: r.disabled ? HUD.muted : '#ffffff' })
        .setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (this.menu === 'choice' && !r.disabled) { this.cursor = i; this.refreshChoice(); } });
      t.on('pointerdown', () => { if (this.menu === 'choice') this.pickChoice(i); });
      c.add(t);
      if (r.right) c.add(this.add.text(x + w - 10, ry, r.right, { fontFamily: FONT, fontSize: '8px', color: r.disabled ? HUD.muted : '#cfd6ee' }).setOrigin(1, 0));
      // Boost-meter van die teamgenoot (6 blokjes) tussen naam en HP
      if (r.boost !== undefined) c.add(this.boostPips(x + w - 108, ry + 1, r.boost, r.disabled));
      return t;
    });
    this.choiceLayer = c;
    this.cursor = Math.max(0, rows.findIndex(r => !r.disabled));
    this.refreshChoice();
    return new Promise(res => { this.choiceResolve = res; });
  }

  private refreshChoice() {
    const t = this.choiceTexts[this.cursor];
    if (!t) return;
    this.pointer.setVisible(true).setDepth(47).setPosition(t.x - (this.choiceRows[this.cursor].head ? 31 : 11), t.y);
  }

  private moveChoice(d: number) {
    const n = this.choiceRows.length;
    let i = this.cursor;
    for (let step = 0; step < n; step++) {
      i = Phaser.Math.Wrap(i + d, 0, n);
      if (!this.choiceRows[i].disabled) break;
    }
    if (i !== this.cursor) { this.cursor = i; audio.sfx('cursormove'); this.refreshChoice(); }
  }

  private pickChoice(i: number) {
    if (this.choiceRows[i]?.disabled) { audio.sfx('errorclick'); return; }
    audio.sfx('confirm');
    this.endChoice(i);
  }

  private endChoice(result?: number) {
    this.choiceLayer?.destroy();
    this.choiceLayer = undefined;
    this.pointer.setDepth(35);
    const res = this.choiceResolve;
    this.choiceResolve = undefined;
    if (this.menu === 'choice') this.menu = 'busy';
    if (res && result !== undefined) res(result);
  }

  /** Lijstje van je team. `allowActive` = ook wie er nu staat kiezen (bijv. bij inruilen). */
  /** Revive: kies een KO-teamgenoot (de anderen staan grijs). `extra` = bijv. "Keep in bag". */
  private pickReviveTarget(title: string, cancel: boolean, extra?: ChoiceRow): Promise<number> {
    const rows = this.party.map(f => this.partyRow(f, !f.fainted));
    if (extra) rows.push(extra);
    return this.choose(title, rows, cancel);
  }

  /** Heal gekocht in de shop: meteen op een teamgenoot naar keuze, of in de tas. */
  private async healFromShop(it: ItemDef) {
    if (!this.party.some(f => !f.fainted && f.hp < f.maxHp)) {
      this.bag[it.id] = (this.bag[it.id] ?? 0) + 1;
      this.msg.setText(`Everyone is at full HP, so the ${it.name}\nwent to your bag. (${bagCount(this.bag)}/${BAG_SIZE})`);
      return;
    }
    const full = bagCount(this.bag) >= BAG_SIZE;
    const i = await this.pickHealTarget2(`${it.name}: heal who?`, false, { label: full ? 'Bag is full' : 'Keep in bag', disabled: full });
    this.menu = 'reward';
    this.refreshCursor();
    if (i < this.party.length) {
      const text = it.use(this.party[i]);
      audio.sfx('heal1');
      this.showStatusPanel();
      this.refreshPartyHeads();
      this.msg.setText(text);
    } else {
      this.bag[it.id] = (this.bag[it.id] ?? 0) + 1;
      this.msg.setText(`The ${it.name} went to your bag.\n(${bagCount(this.bag)}/${BAG_SIZE} in bag)`);
    }
  }

  /** Revive gekocht in de shop: meteen iemand terughalen, of in de tas. */
  private async reviveFromShop(it: ItemDef) {
    if (!this.party.some(f => f.fainted)) {
      this.bag[it.id] = (this.bag[it.id] ?? 0) + 1;
      this.msg.setText(`Nobody is down, so the Revive went\nto your bag. (${bagCount(this.bag)}/${BAG_SIZE})`);
      return;
    }
    const full = bagCount(this.bag) >= BAG_SIZE;
    const i = await this.pickReviveTarget('Revive who?', false, { label: full ? 'Bag is full' : 'Keep in bag', disabled: full });
    this.menu = 'reward';
    this.refreshCursor(); // eerst de cursor (die zet de reward-uitleg neer), dan ons bericht
    if (i < this.party.length) {
      const text = it.use(this.party[i]);
      audio.sfx('heal1');
      this.refreshPartyHeads();
      this.msg.setText(text);
    } else {
      this.bag[it.id] = (this.bag[it.id] ?? 0) + 1;
      this.msg.setText(`The Revive went to your bag.\n(${bagCount(this.bag)}/${BAG_SIZE} in bag)`);
    }
  }

  /** Chao Cheer: kies wie er geneest wordt (Cream zelf of iemand op de bank). */
  private async pickHealTarget(move: MoveDef) {
    const rows = this.party.map(f => this.partyRow(f, f.fainted));
    const i = await this.choose(`Heal who?`, rows, true);
    if (i < 0) { this.openFight(); return; }
    this.runTurn(move, this.party[i]);
  }

  private pickTeammate(title: string, cancel: boolean, allowActive = false, extra?: ChoiceRow): Promise<number> {
    const rows = this.party.map(f => this.partyRow(f, !allowActive && (f.fainted || f === this.player)));
    if (extra) rows.push(extra);
    return this.choose(title, rows, cancel);
  }

  /** Iemand anders in het veld zetten. Stat stages van wie eruit gaat worden gereset (zoals in Pokémon). */
  private async switchTo(next: Fighter, resetStages = true) {
    this.waveFighters.add(next);
    const prev = this.player;
    if (prev === next) return;
    // Lucky Swing (Amy): ze houdt haar ATK-verhogingen als ze wisselt (niet als ze KO is)
    if (resetStages) prev.stages = { ...emptyStages(), atk: prev.def.passive?.id === 'luckySwing' && !prev.fainted ? prev.stages.atk : 0 };
    prev.stun = 0;
    prev.frozen = false;
    if (!prev.fainted) {
      await this.say(`Come back, ${prev.name}!`, 150);
      await this.tween({ targets: this.hero, x: -60, alpha: 0, duration: 220, ease: 'Quad.easeIn' });
    } else {
      await this.tween({ targets: this.hero, alpha: 0, duration: 250 });
    }
    this.player = next;
    this.lastMove = 0;
    this.hero.setTexture(next.def.atlas).setScale(next.def.scale).setFlipX(true).clearTint()
      .setPosition(-60, PLAYER_POS.y).setAlpha(1).play(next.anim('idle'));
    this.pBox.portrait?.setTexture(`portrait_${next.def.id}`);
    this.setBox(this.pBox, next, false);
    audio.voice(`call_${next.def.id}` as Parameters<typeof audio.voice>[0], 0.8);
    await this.tween({ targets: this.hero, x: PLAYER_POS.x, duration: 260, ease: 'Quad.easeOut' });
    await this.say(`Go, ${next.name}!`, 300);
  }

  /** Party in het menu: wisselen midden in een gevecht kost je beurt (de vijand valt gratis aan). */
  private async switchInBattle() {
    if (this.party.length < 2) { this.flash(`${this.player.name} is your only teammate... for now.`); return; }
    if (!this.party.some(f => !f.fainted && f !== this.player)) { this.flash('Nobody else can fight right now!'); return; }
    const i = await this.pickTeammate('Switch to who?\n(the foe gets a free turn)', true);
    if (i < 0) { this.openCommand(1); return; }
    await this.switchTo(this.party[i]);
    this.tut?.event('switched');
    const move = this.pickEnemyMove();
    this.enemy.chargeReady = this.enemy.charged;
    await this.act(this.enemy, this.player, move);
    await this.tickSuper();
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(1); return; }
    await this.endOfTurn();
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(1); return; }
    this.openCommand(1);
  }

  /** Je character is KO: volgende kiezen, of game over als niemand meer kan. */
  private async handleFaint(): Promise<boolean> {
    this.hero.play(this.player.anim('ko'));
    this.refreshPartyHeads();
    const alive = this.party.filter(f => !f.fainted);
    if (!alive.length) { await this.loseRun(); return false; }
    await this.say(`${this.player.name} is down!`, 400);
    await this.tip('ko');
    let next = alive[0];
    if (alive.length > 1) next = this.party[await this.pickTeammate('Who goes next?', false)];
    await this.switchTo(next);
    return true;
  }

  /** EXP voor wie op de bank zit (Exp Share). KO-teamleden krijgen niks. */
  private async teamExp(exp: number) {
    // wie deze wave ook heeft meegevochten (en nog staat) krijgt de volle EXP; de bank een deel (Exp. Share)
    const fought = this.party.filter(f => f !== this.player && !f.fainted && this.waveFighters.has(f));
    const bench = this.party.filter(f => f !== this.player && !f.fainted && !this.waveFighters.has(f));
    // Exp. Share plus 5% per Chaos Emerald
    const rate = benchExpRate(this.expShare, this.emeralds);
    const share = Math.max(1, Math.floor(exp * rate));
    if (fought.length) await this.say(`${fought.map(f => f.name).join(' and ')} also got ${exp} EXP for fighting!`, 300);
    if (bench.length && rate > 0) await this.say(`The bench got ${share} EXP (Exp. Share${this.emeralds ? ' and Chaos Emeralds' : ''})!`, 300);
    const gains: Array<[Fighter, number]> = [...fought.map(f => [f, exp] as [Fighter, number]), ...(rate > 0 ? bench.map(f => [f, share] as [Fighter, number]) : [])];
    if (!gains.length) return;
    for (const [f, amount] of gains) {
      const before = f.level;
      if (f.gainExp(amount)) await this.say(`${f.name} grew to Lv.${f.level}!`, 350);
      const ult = f.def.ultimate;
      if (ult && before < ULTIMATE_LEVEL && f.level >= ULTIMATE_LEVEL) {
        await this.say(`${f.name} learned the ultimate ${MOVES[ult].name}!`, 700);
      }
    }
    this.refreshPartyHeads();
  }

  /** Na een gewonnen rival-gevecht: wil hij bij je team? Bij een vol team kies je wie er weggaat. */
  private async offerRivalJoin(id: string, level: number) {
    const name = FIGHTERS[id].name;
    const yes = await this.choose(`${name} wants to join\nyour team!`, [{ label: 'Welcome!' }, { label: 'Not now' }], false);
    if (yes !== 0) { await this.say(`${name} went on their way.`, 400); return; }
    const newbie = new Fighter(id, level);
    newbie.field = { ...this.player.field };
    if (this.party.length < MAX_PARTY) {
      this.party.push(newbie);
      this.partyHeads.push(this.add.image(0, 154, 'ui', `head_${id}`).setOrigin(0, 0).setDepth(20));
    } else {
      const i = await this.pickTeammate(`Your team is full.\nWho leaves the team?`, false, true, { label: 'Never mind' });
      if (i >= this.party.length) { await this.say(`${name} went on their way.`, 400); return; }
      const gone = this.party[i];
      this.party[i] = newbie;
      if (gone === this.player) {
        this.player = newbie;
        this.hero.setTexture(newbie.def.atlas).setScale(newbie.def.scale).play(newbie.anim('idle'));
        this.pBox.portrait?.setTexture(`portrait_${id}`);
        this.setBox(this.pBox, newbie, false);
      }
      await this.say(`Bye, ${gone.name}! Thanks for everything.`, 400);
    }
    this.refreshPartyHeads();
    audio.voice(`call_${id}` as Parameters<typeof audio.voice>[0], 0.8);
    await this.say(`${name} joined the team!`, 500);
  }

  /**
   * Label onder de vijand-box: BOSS / RIVAL / "ARMORED ELITE", of de eigenschap van een gewone badnik ("HARD SHELL").
   * Hover of tik = uitleg.
   */
  enemyBadge(): { text: string; color: string; tipTitle: string; tip: string } {
    const e = this.enemy;
    const rank = this.enemyRank();
    const colors: Record<string, string> = { BOSS: '#ff7a2a', ELITE: '#c08aff', RIVAL: '#ff4a5a' };
    if (!e) return { text: '', color: '#ffffff', tipTitle: '', tip: '' };
    const trait = e.trait;
    const elite = e.elite ? ELITE_TRAITS[e.elite] : undefined;
    const lines: string[] = [];
    if (elite) lines.push(`${elite.name} elite: ${elite.desc}`);
    if (trait) lines.push(`${trait.name}: ${trait.desc}`);
    const rt = this.rival && e.rivalTrait ? RIVAL_TRAITS[e.def.id] : undefined;
    if (rt) lines.push(`${rt.name}: ${rt.desc}`);
    if (this.rival) lines.push(`Rivals have ${RIVAL_SHIELDS} shields.`);
    const special = e.def.moves.map(m => MOVES[m]).filter(m => m.desc && !this.charFoe && e.def.id !== 'eggman');
    for (const m of special) lines.push(`${m.name}: ${m.desc}`);
    const tip = lines.join('\n');
    if (rank === 'ELITE' && elite) return { text: `${elite.name.toUpperCase()} ELITE`, color: colors.ELITE, tipTitle: e.name.toUpperCase(), tip };
    if (rank) return { text: rank, color: colors[rank], tipTitle: e.name.toUpperCase(), tip };
    if (trait) return { text: trait.name.toUpperCase(), color: '#8ad8ff', tipTitle: e.name.toUpperCase(), tip };
    const tag = special.find(m => m.tag)?.tag;
    if (tag) return { text: tag, color: '#8ad8ff', tipTitle: e.name.toUpperCase(), tip };
    return { text: '', color: '#ffffff', tipTitle: '', tip };
  }

  /** Wat voor vijand dit is, voor het label op de HP-box. */
  private enemyRank(): '' | 'BOSS' | 'ELITE' | 'RIVAL' {
    if (this.rival) return 'RIVAL';
    if (isBossWave(this.wave)) return 'BOSS';
    if (this.elite) return 'ELITE';
    return '';
  }

  private openHelp() {
    if (this.menu === 'busy') return;
    this.scene.pause();
    this.scene.launch('Help', { from: this.scene.key });
  }

  /** V: alles wat er nu op het veld speelt (zone-effect, stages, type-matchup), zoals in PokéRogue. */
  private toggleField(force?: boolean) {
    const show = force ?? !this.fieldLayer?.visible;
    this.fieldLayer?.destroy();
    this.fieldLayer = undefined;
    if (!show) return;
    this.statsLayer.setVisible(false);
    this.infoLayer.setVisible(false);
    const c = this.add.container(0, 0).setDepth(34);
    const x = 8, y = PANEL_Y - 142, w = 300, h = 138;
    const g = sonicPanel(this.add.graphics(), x, y, w, h, 'blue', 0.97);
    c.add(g);
    const txt = (tx: number, ty: number, s: string, color = '#ffffff') => {
      const t = this.add.text(tx, ty, s, { fontFamily: FONT, fontSize: '8px', color });
      c.add(t);
      return t;
    };
    const zone = zoneForWave(this.wave, this.zoneOrder);
    txt(x + 10, y + 8, 'FIELD', HUD.label);
    txt(x + w - 10, y + 8, isBossWave(this.wave) ? 'BOSS' : this.rival ? 'RIVAL' : '', '#e8443a').setOrigin(1, 0);
    const eff = this.fieldEffect;
    txt(x + 10, y + 22, eff ? `${zone.name}: ${eff.name}` : `${zone.name}: no effect`, eff?.color ?? '#9aa4c4');
    if (eff) txt(x + 10, y + 34, eff.desc, '#cfd6ee');
    const stages = (f: Fighter) => (['atk', 'def', 'spd', 'acc'] as StageKey[])
      .map(k => { const v = f.stage(k); return v ? `${k.toUpperCase()}${v > 0 ? '+' : ''}${v}` : ''; })
      .filter(Boolean).join(' ') || 'no changes';
    const row = (ry: number, f: Fighter, label: string) => {
      c.add(this.add.image(x + 16, ry + 4, `type_${f.type}`));
      txt(x + 28, ry, `${label} ${f.name}`, '#f2c230');
      txt(x + 28, ry + 11, stages(f), '#ffffff');
    };
    row(y + 50, this.player, 'YOU');
    txt(x + w - 10, y + 50, `BOOST ${this.player.boost}/${MAX_BOOST}`, '#4ad8ff').setOrigin(1, 0);
    row(y + 78, this.enemy, 'FOE');
    const badge = this.enemyBadge();
    if (badge.text) txt(x + w - 10, y + 78, badge.text, badge.color).setOrigin(1, 0);
    const m = typeMultiplier(this.player.type, this.enemy.type);
    const vs = `${this.player.type.toUpperCase()} vs ${this.enemy.type.toUpperCase()}: `;
    txt(x + 10, y + 106, vs + (m > 1 ? 'type advantage!' : m < 1 ? 'type disadvantage!' : 'neutral'),
      m > 1 ? '#3cff6a' : m < 1 ? '#ff9a2a' : '#9aa4c4');
    txt(x + 10, y + 120, `BUFFS: ${this.buffSummary() || 'none'}`, '#c06aff');
    this.fieldLayer = c;
  }

  /** Zone-effect op je character zetten (of weghalen) + label boven je info-box. */
  private applyZoneEffect(effect?: ZoneEffect) {
    for (const f of this.party) {
      f.field = emptyStages();
      for (const [k, v] of Object.entries(effect?.stages ?? {})) f.field[k as StageKey] = v;
    }
    this.fieldEffect = effect;
    this.fieldText.setText(effect ? `${effect.name}  ${effect.short}` : '').setColor(effect?.color ?? '#ffffff');
  }

  /** Na elke ronde (ook als de wave gewonnen is): de Super-kracht loopt een beurt af. */
  private async tickSuper() {
    for (const f of [this.player, this.enemy]) {
      if (!f || f.superTurns <= 0) continue;
      f.superTurns--;
      if (f.superTurns === 0 && !f.fainted) await this.say(`${this.who(f)}'s Super power wore off.`, 350);
    }
  }

  /** Einde van een beurt: zone-schade (Hot Crater). */
  private async endOfTurn() {
    // Chaos Spear en Super Shadow lopen af
    for (const f of [this.player, this.enemy]) {
      if (!f || f.fainted) continue;
      for (const k of f.tickTurns()) {
        if (k === 'pierced') await this.say(`${this.who(f)} is no longer pierced.`, 350);
      }
    }
    await this.foeEndOfTurn();
    // gif (Buzz Cannon)
    const p = this.player;
    if (p.poison > 0 && !p.fainted) {
      const dmg = Math.min(p.hp, poisonDamage(p));
      p.hp -= dmg;
      p.poison--;
      this.hitFlash(this.hero);
      this.burst(this.hero.x, this.hero.y - 20, 0xb06aff, 6);
      this.popNumber(this.hero.x, this.hero.y - this.bodyHeight(this.hero) - 4, `-${dmg}`, '#c07aff');
      await this.setBox(this.pBox, p, true);
      await this.say(p.poison > 0 ? `${p.name} is hurt by poison!` : `${p.name} is hurt by poison! The poison wore off.`, 300);
      if (p.fainted) return;
    }
    const burn = this.fieldEffect?.burn;
    // Ultimate Lifeform (Shadow): de hitte doet hem niks
    if (!burn || this.player.fainted || this.player.def.passive?.id === 'lifeform') return;
    const dmg = Math.max(1, Math.floor(this.player.maxHp * burn));
    this.player.hp = Math.max(0, this.player.hp - dmg);
    this.hitFlash(this.hero);
    this.burst(this.hero.x, this.hero.y - 20, 0xff8a3a, 6);
    this.popNumber(this.hero.x, this.hero.y - this.bodyHeight(this.hero) - 4, `-${dmg}`, '#ff8a3a');
    await this.setBox(this.pBox, this.player, true);
    await this.say(`${this.player.name} is hurt by the heat!`, 300);
  }

  /** Einde van de beurt voor de vijand: Piggy Bank (DEF +1), Enraged (ATK +1), Regenerating (8% HP). */
  private async foeEndOfTurn() {
    const e = this.enemy;
    if (!e || e.fainted) return;
    if (e.def.trait === 'piggyBank' && e.stages.def < PIGGY_MAX_DEF) await this.changeStage(e, 'def', 1, 'Piggy Bank! ');
    if (e.elite === 'enraged' && e.stage('atk') < 6) await this.changeStage(e, 'atk', 1, 'Enraged! ');
    const h = regenTick(e);
    if (h > 0) {
      hearts(this, this.foe.x, this.foe.y - this.bodyHeight(this.foe) * 0.6, 4, 0x7cf07c);
      this.popNumber(this.foe.x, this.foe.y - this.bodyHeight(this.foe) - 4, `+${h}`, '#7cf07c');
      await this.setBox(this.eBox, e, true);
      await this.say(`${this.who(e)} regenerated ${h} HP!`, 300);
    }
  }

  /** Kies een rival: liefst iemand die nog op slot zit en die je deze run nog niet tegenkwam. */
  private pickRival(): string | undefined {
    const others = RIVAL_HEROES.filter(h => !this.party.some(f => f.def.id === h) && FIGHTERS[h]);
    if (!others.length) return undefined;
    return Phaser.Utils.Array.GetRandom(rivalOptions(others, this.rivalsMet, h => !isUnlocked(h)));
  }

  /** Vijand kiest een move. Een genees-move alleen als hij echt geraakt is. */
  private pickEnemyMove(): MoveDef {
    const e = this.enemy;
    // boss-Shadow: één keer per gevecht Super Barrage, zodra hij onder de helft zit
    if (this.charFoe && isBossWave(this.wave) && e.def.ultimate && !this.foeUltUsed && e.hp < e.maxHp * 0.5) {
      this.foeUltUsed = true;
      return MOVES[e.def.ultimate];
    }
    // geen Chaos Spear als je al pierced bent; Eggman lacht alleen tot zijn ATK +2 is
    // badnik-ritme: Copter Octo laadt op, Shell Tank slaat na het opladen met Tank Slam
    return traitMove(e, () => {
      const all = e.def.moves.map(m => MOVES[m]);
      const sensible = all.filter(m => !(m.pierce && this.player.pierced > 0) && !(m.id === 'eggLaugh' && e.stage('atk') >= 2));
      const moves = sensible.length ? sensible : all;
      const hurt = this.enemy.hp < this.enemy.maxHp * 0.5;
      const usable = moves.filter(m => !m.heal || hurt);
      return Phaser.Utils.Array.GetRandom(usable.length ? usable : moves);
    });
  }

  /** Copter Octo laadt op: gloed, vonkjes die naar hem toe trekken, en het "!" erboven. */
  private async doCharge(att: Fighter) {
    const spr = att === this.player ? this.hero : this.foe;
    this.chargeFx(spr);
    att.charged = true;
    await this.wait(450);
    await this.say(`${this.who(att)} is charging up! Its next attack does ${chargeMult(att)}x damage!`, 500);
  }

  private chargeFx(spr: Phaser.GameObjects.Sprite) {
    audio.sfx('spindash', { volume: 0.6 });
    const c = this.center(spr);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const p = this.add.image(c.x + Math.cos(a) * 46, c.y + Math.sin(a) * 46, 'px').setScale(3).setTint(i % 2 ? 0xffd23a : 0xff8a3a)
        .setDepth(spr.depth + 1).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: p, x: c.x, y: c.y, alpha: 0.2, duration: 380, delay: i * 18, ease: 'Quad.easeIn', onComplete: () => p.destroy() });
    }
    this.tweens.add({ targets: spr, x: spr.x + 3, duration: 40, yoyo: true, repeat: 5 });
    this.time.delayedCall(380, () => shockwave(this, c.x, c.y, 0xff9a3a, 38, 260));
  }

  /**
   * Passive-tabje boven de HP-box, bijgewerkt zodra er iets verandert:
   * Sonic Speed "SPEED +38%", Lucky Swing "CRIT 39%" / "CRIT 100%" / "CRIT 2x" / "CRIT 2x +30%".
   */
  private speedTagText = '';
  private updateSpeedTag() {
    const tag = this.pBox?.speedTag;
    if (!tag) return;
    const p = this.player, e = this.enemy;
    const live = !!p && !!e && !e.fainted && !!this.foe?.visible;
    let text = '', color = 0x6ad8ff;
    const l = live ? luckyInfo(p!) : null;
    if (l) {
      text = l.mult > 1.5 ? `CRIT ${l.mult}x${l.extra ? ` +${Math.round(l.extra * 100)}%` : ''}` : `CRIT ${Math.round(l.crit * 100)}%`;
      color = 0xff8ac8;
    } else if (live && p!.def.passive?.id === 'speedster') {
      const bonus = Math.round((speedBonus(p!, e!) - 1) * 100);
      if (bonus > 0) text = `SPEED +${bonus}%`;
    }
    if (text === this.speedTagText) return;
    this.speedTagText = text;
    tag.setText(text).setColor(`#${color.toString(16)}`);
    const g = this.pBox.speedTagBg!;
    g.clear();
    if (!text) return;
    const bw = tag.width + 8;
    g.fillStyle(HUD.outline, 0.95).fillRoundedRect(tag.x - bw + 4, tag.y - 2, bw, 12, 3);
    g.fillStyle(HUD.blueBottom, 0.95).fillRect(tag.x - bw + 5, tag.y - 1, bw - 2, 10);
    g.lineStyle(1, color).strokeRect(tag.x - bw + 5.5, tag.y - 0.5, bw - 3, 9);
  }

  /** "!" boven een opgeladen vijand, zodat je ziet dat er een dubbele klap aankomt. */
  private updateIntent() {
    const e = this.enemy;
    const show = !!e && e.charged && !e.fainted && this.foe?.visible;
    if (!show) { this.intentFx?.destroy(); this.intentFx = undefined; return; }
    if (!this.intentFx) {
      const g = this.add.graphics();
      g.fillStyle(HUD.outline).fillCircle(0, 0, 9);
      g.fillStyle(0xff7a2a).fillCircle(0, 0, 7.5);
      g.fillStyle(0xffd23a).fillCircle(-2, -2, 3);
      const t = this.add.text(0, 0, '!', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#5a1800', strokeThickness: 3 }).setOrigin(0.5).setScale(1.5);
      this.intentFx = this.add.container(0, 0, [g, t]).setDepth(21).setName('intent');
    }
    const top = this.foe.y - this.bodyHeight(this.foe) - 12;
    this.intentFx.setPosition(this.foe.x, top + Math.sin(this.statusClock / 160) * 3).setScale(1 + 0.08 * Math.sin(this.statusClock / 90));
    // af en toe een oranje schim: hij staat te trillen van de energie
    if (Math.floor(this.statusClock / 220) !== Math.floor((this.statusClock - 16) / 220)) this.ghost(this.foe, 0xff9a3a);
  }

  /** "RIVAL!"-balk met het hoofdje van de rival (schuift van rechts in beeld). */
  private async rivalBanner(label = 'RIVAL!') {
    const c = this.add.container(W + 10, 84).setDepth(45);
    const g = this.add.graphics();
    g.fillGradientStyle(0x9a1830, 0x9a1830, 0x3a0818, 0x3a0818, 0.95).fillRect(0, 0, 250, 46);
    checkerBand(g, 0, 0, 250, 1, 4);
    checkerBand(g, 0, 42, 250, 1, 4);
    g.fillStyle(HUD.outline).fillRect(0, 4, 250, 1).fillRect(0, 41, 250, 1);
    const head = this.add.image(18, 23, 'ui', `head_${this.enemy.def.id}`).setScale(2).setOrigin(0, 0.5);
    const t1 = this.add.text(62, 10, label, { fontFamily: FONT, fontSize: '8px', color: '#e8443a' }).setScale(2);
    const t2 = this.add.text(62, 30, this.enemy.name.toUpperCase(), { fontFamily: FONT, fontSize: '8px', color: '#ffffff' });
    c.add([g, head, t1, t2]);
    audio.sfx('confirm', { volume: 0.7 });
    await this.tween({ targets: c, x: W - 250, duration: 350, ease: 'Cubic.easeOut' });
    await this.wait(1100);
    await this.tween({ targets: c, x: W + 10, duration: 300, ease: 'Cubic.easeIn' });
    c.destroy();
  }

  /** Nieuw character vrijgespeeld: hoofdje + tekst + "Alright!" van het character. */
  private async unlockBanner(id: string, name: string) {
    const c = this.add.container(W / 2, 100).setDepth(46).setScale(0);
    const g = sonicPanel(this.add.graphics(), -120, -34, 240, 68, 'blue', 0.96);
    const head = this.add.image(-92, 0, 'ui', `head_${id}`).setScale(3);
    const t1 = this.add.text(-62, -14, name.toUpperCase(), { fontFamily: FONT, fontSize: '8px', color: '#ffd23a' }).setScale(2);
    const t2 = this.add.text(-62, 12, 'is now playable!', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' });
    c.add([g, head, t1, t2]);
    audio.sfx('confirm2', { volume: 0.8 });
    await this.tween({ targets: c, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.burst(W / 2, 100, 0xf2c230, 16);
    audio.sfx('ringchime');
    const lines: Record<string, string> = { sonic: 'sonicalright', tails: 'tailsalright', knuckles: 'knucklesalright', cream: 'creamalright', amy: 'amywohoo', shadow: 'shadowhuh' };
    if (lines[id]) this.time.delayedCall(250, () => audio.voice(lines[id] as Parameters<typeof audio.voice>[0]));
    await this.say(`${name} is now unlocked!`, 900);
    await this.tween({ targets: c, scale: 0, duration: 250, ease: 'Back.easeIn' });
    c.destroy();
  }

  private async zoneBanner(name: string, act: number) {
    const c = this.add.container(-260, 84).setDepth(45);
    const g = this.add.graphics();
    g.fillGradientStyle(HUD.blueTop, HUD.blueTop, HUD.blueBottom, HUD.blueBottom, 0.95).fillRect(0, 0, 250, 46);
    checkerBand(g, 0, 0, 250, 1, 4);
    checkerBand(g, 0, 42, 250, 1, 4);
    g.fillStyle(HUD.outline).fillRect(0, 4, 250, 1).fillRect(0, 41, 250, 1);
    const t1 = this.add.text(16, 12, name.toUpperCase(), { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setScale(2);
    const t2 = this.add.text(234, 30, `ZONE ${act}`, { fontFamily: FONT, fontSize: '8px', color: HUD.label }).setOrigin(1, 0);
    // tekst op 2x is te groot voor lange namen: schalen naar wat past
    if (t1.displayWidth > 218) t1.setScale(1);
    c.add([g, t1, t2]);
    await this.tween({ targets: c, x: 0, duration: 350, ease: 'Cubic.easeOut' });
    await this.wait(1100);
    await this.tween({ targets: c, x: -260, duration: 300, ease: 'Cubic.easeIn' });
    c.destroy();
  }

  /** "Alright!" / "Yeah!" van je character bij de victory-pose. */
  private victoryVoice() {
    const boss = isBossWave(this.wave);
    const lines: Record<string, string[]> = {
      sonic: ['sonicalright', 'sonicyeah'], tails: boss ? ['tailsbosswin'] : ['tailsalright', 'tailsyeah'],
      knuckles: ['knucklesalright', 'knucklescool'], cream: boss ? ['creambosswin'] : ['creamalright', 'creamyeah'],
      amy: boss ? ['amybosswin'] : ['amywohoo', 'amyyeah'],
      // na een boss: "Didn't even break a sweat."
      shadow: boss ? ['shadowsweat'] : ['shadowhmph', 'shadowhuh'],
    };
    const opts = lines[this.player.def.id];
    if (opts) audio.voice(Phaser.Utils.Array.GetRandom(opts) as Parameters<typeof audio.voice>[0]);
  }

  private async loseRun() {
    clearRun();
    audio.stopMusic(1200);
    await this.say(this.party.length > 1 ? 'The whole team is down!' : `${this.player.name} is down!`, 400);
    await this.say(`Run over at wave ${this.wave}.\nPress Z / tap to retry.`, 0);
    this.menu = 'gameover';
    this.input.once('pointerdown', () => { if (this.menu === 'gameover') this.toStarter(); });
  }

  // ---------------------------------------------------------------- rewards + shop
  /**
   * Reward-scherm in PokéRogue-stijl: bovenaan 3 gratis item monitors, daaronder de shop
   * met items voor je tas en een Reroll-knop. Uitleg staat in het tekstvak onderin.
   */
  private openRewards() {
    this.menu = 'reward';
    this.cursor = 1;
    this.rewardRow = 0;
    this.rerolls = 0;
    const layer = this.add.container(0, 0).setDepth(40);
    layer.add(this.add.rectangle(0, 0, W, PANEL_Y, 0x05060c, 0.6).setOrigin(0));
    // shop-band bovenaan (zoals in PokéRogue), rewards eronder
    // shop links naast de ring-teller en de tas (die blijven bovenop staan)
    const g = this.add.graphics();
    sonicPanel(g, SHOP_X, 26, SHOP_W, 74, 'blue', 0.9);
    layer.add(g);
    // SHOP staand in een eigen kolom links, zodat de items de hele hoogte hebben
    layer.add(this.add.text(SHOP_X + 17, 63, 'S\nH\nO\nP', { fontFamily: FONT, fontSize: '8px', color: HUD.label, align: 'center', lineSpacing: 4 }).setOrigin(0.5));
    layer.add(this.add.text(W / 2, 103, 'Choose a reward', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0).setShadow(1, 1, '#000', 0));
    this.rewardLayer = layer;
    // je info-box, het zone-label en de hoofdjes maken plaats voor het team-paneel
    this.tweens.add({ targets: [this.pBox.root, this.fieldText, ...this.partyHeads], alpha: 0, duration: 200 });
    this.showStatusPanel();
    this.buildShopRow();
    // tutorial: vaste, simpele rewards
    const R = (rid: string) => REWARDS.find(r => r.id === rid)!;
    this.buildRewardRow(this.tutorialMode ? [R('rings'), R('boost'), R('shield')] : undefined);
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 200 });
    this.refreshCursor();
    this.tut?.event('reward');
    void this.tip('shop');
  }

  /** Korte lijst van actieve reward-effecten (voor het field-paneel). */
  private buffSummary() {
    const b = this.buffs, out: string[] = [];
    if (this.waveShield) out.push('Shield+');
    if (b.shieldWaves) out.push(`Shield+ next`);
    if (b.shieldHit) out.push('Shield');
    if (this.dodgeFirst) out.push('Invincible');
    if (b.dodgeWaves || b.dodgeNext) out.push(`Invincible x${b.dodgeWaves || 1}`);
    if (this.waveMagnet || b.magnetWaves) out.push(`Magnet x${b.magnetWaves + (this.waveMagnet ? 1 : 0)}`);
    if (b.critTurns) out.push(`Crit x${b.critTurns}`);
    if (b.blessTurns) out.push(`Blessing x${b.blessTurns}`);
    if (this.alarmWave || b.eliteNext) out.push('Alarm');
    return out.join(', ');
  }

  /** Wat een reward van het gevecht nodig heeft. */
  private rewardCtx(): RewardCtx {
    return {
      player: this.player, party: this.party, wave: this.wave, buffs: this.buffs,
      nextIsBoss: isBossWave(this.wave + 1),
      gainRings: n => { this.rings += n; this.ringText.setText(`${this.rings}`); },
    };
  }

  /** Icoon van een reward: een frame uit de ui-atlas, een losse monitor (mon_*) of een gemaakt plaatje. */
  private rewardIcon(r: RewardDef, y: number): Phaser.GameObjects.Image {
    const key = r.icon.replace('{hero}', this.player.def.id);
    if (key === 'shard') return this.add.image(0, y + 2, 'emeralds', 'emerald_green_0').setScale(1.6);
    if (this.textures.exists(key)) return this.add.image(0, y, key);
    return this.add.image(0, y, 'ui', key);
  }

  /** `forced` = vaste rewards (voor tests en screenshots), anders 3 willekeurige. */
  private buildRewardRow(forced?: RewardDef[]) {
    this.rewardCards.forEach(c => c.destroy());
    this.rewardChoices = forced ?? rollRewards(this.rewardCtx(), 3, Math.random, this.minTier, isBossWave(this.wave) ? BOSS_TIER_ODDS : TIER_ODDS);
    this.rewardCards = this.rewardChoices.map((r, i) => {
      const c = this.add.container(W / 2 + (i - 1) * 132, 166);
      const col = TIER_COLOR[r.tier];
      // Chao Garden-paneel met het randlijntje in de kleur van de tier
      const g = sonicPanel(this.add.graphics(), -58, -44, 116, 88, 'blue', 1, col);
      const sel = this.add.graphics().lineStyle(2, 0xffffff).strokeRoundedRect(-61, -47, 122, 94, 7).setVisible(false).setName('sel');
      const name = this.add.text(0, 6, r.name + (r.plus ? '+' : ''), { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0);
      const desc = this.add.text(0, 18, r.desc(this.rewardCtx()), { fontFamily: FONT, fontSize: '8px', color: '#cfd6ee', align: 'center', wordWrap: { width: 108 }, lineSpacing: 2 }).setOrigin(0.5, 0);
      const mon = this.rewardIcon(r, -14).setName('mon');
      // tier als tabje bovenop de kaart, op volle grootte (kleiner wordt het pixelfont onleesbaar)
      const tier = this.add.text(0, -44, TIER_NAME[r.tier], { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 }).setOrigin(0.5);
      const tab = this.add.graphics();
      const tw = tier.width + 6;
      tab.fillStyle(HUD.outline).fillRoundedRect(-tw / 2 - 1, -51, tw + 2, 14, 4);
      tab.fillStyle(col).fillRoundedRect(-tw / 2, -50, tw, 12, 3);
      this.tweens.add({ targets: mon, y: mon.y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 180 });
      c.add([g, sel, name, desc, mon, tab, tier]);
      if (r.plus) c.add(this.add.text(12, -26, '+', { fontFamily: FONT, fontSize: '8px', color: '#ffd23a', stroke: '#000000', strokeThickness: 3 }));
      // zeldzaam: zachte glans in de kleur van de tier
      if (r.tier !== 'common') {
        const glow = this.add.rectangle(0, 0, 110, 82, col, 0.06);
        c.addAt(glow, 1);
        this.tweens.add({ targets: glow, alpha: 0.3, duration: 900, yoyo: true, repeat: -1 });
      }
      c.setSize(116, 88).setInteractive({ useHandCursor: true });
      c.on('pointerover', () => { if (this.menu === 'reward') { this.rewardRow = 0; this.cursor = i; this.refreshCursor(); } });
      c.on('pointerdown', () => { if (this.menu === 'reward') this.pickReward(i); });
      this.rewardLayer!.add(c);
      return c;
    });
  }

  /** Icoon voor een shop-item, getekend met sprites uit de ui-atlas. */
  private shopIcon(id: string, big = true): Phaser.GameObjects.GameObject[] {
    // heals: hoe voller het hartje, hoe meer het geneest
    const heart: Record<string, number> = { healthRing: 25, superRing: 50, hyperRing: 75, chiliDog: 100 };
    if (heart[id]) {
      const h = this.add.image(0, 0, `heart_${heart[id]}`);
      if (!big) return [h];
      h.setScale(2);
      this.tweens.add({ targets: h, scale: 2.15, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: heart[id] * 4 });
      return [h];
    }
    if (id === 'revive') {
      // hoofdje van wie er KO is (of van je actieve character)
      const who = this.party.find(f => f.fainted) ?? this.player;
      return [this.add.image(0, 0, 'ui', `head_${who.def.id}`).setScale(big ? 1.5 : 1)];
    }
    // reroll
    return [this.add.sprite(0, 0, 'ui', 'monitor_random').setScale(1)];
  }

  /**
   * Shop: elk item in een eigen vakje (ook met 5 items blijft het rustig), prijs eronder.
   * Het geselecteerde vakje krijgt een gouden rand en komt iets omhoog.
   */
  private buildShopRow() {
    this.shopButtons.forEach(b => b.destroy());
    this.shopItems = shopStock(this.wave);
    const slots = [...this.shopItems.map(i => i.id), 'reroll'];
    const tw = 58, th = 62, gap = 7;
    const left = SHOP_X + 36, right = SHOP_X + SHOP_W - 6;
    const x0 = (left + right) / 2 - ((slots.length - 1) * (tw + gap)) / 2;
    this.shopButtons = slots.map((id, i) => {
      const b = this.add.container(x0 + i * (tw + gap), SHOP_TILE_Y);
      const bg = this.add.graphics();
      bg.fillStyle(HUD.outline).fillRoundedRect(-tw / 2, -th / 2, tw, th, 4);
      bg.fillStyle(id === 'reroll' ? 0x2a2070 : HUD.pipEmpty, 0.9).fillRoundedRect(-tw / 2 + 1, -th / 2 + 1, tw - 2, th - 2, 3);
      const sel = this.add.graphics().setName('sel').setVisible(false);
      sel.fillStyle(HUD.blueTop, 0.6).fillRoundedRect(-tw / 2 + 1, -th / 2 + 1, tw - 2, th - 2, 3);
      sel.lineStyle(2, HUD.gold).strokeRoundedRect(-tw / 2, -th / 2, tw, th, 4);
      const price = this.add.text(0, 17, '', { fontFamily: FONT, fontSize: '8px', color: '#f2c230' });
      // klein ring-icoontje voor de prijs
      const coin = this.add.sprite(0, 21, 'ui', 'ring_0').setScale(0.5);
      price.setName('price'); coin.setName('coin');
      const icon = this.shopIcon(id);
      icon.forEach(o => (o as Phaser.GameObjects.Image).setY(-8));
      b.add([bg, sel, price, coin, ...icon]);
      b.setSize(tw, th).setInteractive({ useHandCursor: true });
      b.on('pointerover', () => { if (this.menu === 'reward') { this.rewardRow = 1; this.cursor = i; this.refreshCursor(); } });
      b.on('pointerdown', () => { if (this.menu === 'reward') { this.rewardRow = 1; this.cursor = i; this.buyItem(i); } });
      this.rewardLayer!.add(b);
      return b;
    });
    this.updatePrices();
  }

  private rerollCost() { return rerollCost(this.wave, this.rerolls); }

  /** prijzen bijwerken: rood als je het niet kunt betalen; ring-icoontje links van het getal */
  private updatePrices() {
    this.shopButtons.forEach((b, i) => {
      const cost = i < this.shopItems.length ? this.shopItems[i].price ?? 0 : this.rerollCost();
      const price = b.getByName('price') as Phaser.GameObjects.Text;
      const coin = b.getByName('coin') as Phaser.GameObjects.Sprite;
      price.setText(`${cost}`).setColor(this.rings >= cost ? '#f2c230' : '#e8443a');
      // ring-icoon + getal samen gecentreerd onder het item
      const total = 8 + 3 + price.width;
      coin.x = -total / 2 + 4;
      price.x = coin.x + 7;
    });
  }

  /** Item kopen of rerollen. Je blijft in het reward-scherm, dus je kunt meer kopen. */
  private buyItem(i: number) {
    if (!this.tutOk(`shop:${i}`)) return;
    const isReroll = i === this.shopItems.length;
    const it = this.shopItems[i];
    const cost = isReroll ? this.rerollCost() : it?.price;
    if (cost === undefined) return;
    const btn = this.shopButtons[i];
    // niks om nu op te gebruiken en de tas is vol: dan niet kopen
    if (!isReroll && bagCount(this.bag) >= BAG_SIZE) {
      const nowUseless = it.revive ? !this.party.some(f => f.fainted) : !this.party.some(f => !f.fainted && f.hp < f.maxHp);
      if (nowUseless) {
        this.msg.setText(`Your bag is full (${BAG_SIZE}/${BAG_SIZE}) and nobody\nneeds a ${it.name} right now.`);
        audio.sfx('errorclick');
        this.tweens.add({ targets: btn, x: btn.x + 3, duration: 40, yoyo: true, repeat: 2 });
        return;
      }
    }
    if (this.rings < cost) {
      this.msg.setText(`Not enough rings!\nYou have ${this.rings}, this costs ${cost}.`);
      audio.sfx('errorclick');
      this.tweens.add({ targets: btn, x: btn.x + 3, duration: 40, yoyo: true, repeat: 2 });
      return;
    }
    this.rings -= cost;
    audio.sfx('ringchime', { volume: 0.8 });
    this.ringText.setText(`${this.rings}`);
    const sp = this.add.sprite(btn.x, btn.y, 'ui', 'sparkle_0').setDepth(42).setScale(2).play('sparkle');
    sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
    if (isReroll) {
      this.rerolls++;
      this.buildRewardRow();
      this.msg.setText(`New rewards rolled in!\nNext reroll costs ${this.rerollCost()} rings.`);
    } else if (it.revive) {
      void this.reviveFromShop(it);
    } else {
      void this.healFromShop(it);
    }
    this.updatePrices();
    if (isReroll) this.refreshCursor();
  }

  /**
   * Je hele team rechtsonder tijdens rewards en shop: hoofdje, HP en Boost per teamgenoot,
   * zodat je ziet wie een heal of Boost kan gebruiken. Tik erop (of I) voor de hele kit.
   */
  private showStatusPanel() {
    this.statusPanel?.destroy();
    const w = 180, h = H - PANEL_Y - 10;
    const c = this.add.container(W - w - 6, PANEL_Y + 8).setDepth(41);
    c.add(sonicPanel(this.add.graphics(), 0, 0, w, h, 'blue'));
    // een kolom per teamgenoot: hoofdje op ware grootte, HP-balk en Boost ernaast, HP eronder
    const cw = Math.floor((w - 6) / this.party.length);
    this.party.forEach((f, i) => {
      const x = 3 + i * cw;
      const head = this.add.image(x + 3, 4, 'ui', `head_${f.def.id}`).setOrigin(0);
      if (f.fainted) head.setTint(0x30344a);
      const bx = x + 22, barW = cw - 26, frac = Math.max(0, f.hp / f.maxHp);
      const g = this.add.graphics();
      g.fillStyle(HUD.outline).fillRect(bx - 1, 5, barW + 2, 6);
      g.fillStyle(HUD.pipEmpty).fillRect(bx, 6, barW, 4);
      g.fillStyle(this.hpColor(frac)).fillRect(bx, 6, Math.round(barW * frac), 4);
      // scheidingslijntje tussen de kolommen
      if (i > 0) g.fillStyle(HUD.outline).fillRect(x - 1, 5, 1, h - 10);
      const hp = this.add.text(x + cw / 2, 23, f.fainted ? 'KO' : `${f.hp}/${f.maxHp}`,
        { fontFamily: FONT, fontSize: '8px', color: f.fainted ? '#ff7a6a' : f === this.player ? '#ffffff' : '#cfd6ee' }).setOrigin(0.5, 0);
      c.add([head, g, hp, this.boostPips(bx, 13, f.boost, f.fainted, barW < 36 ? 5 : 6)]);
    });
    const hit = this.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => { if (this.menu === 'reward') this.openTeam(); });
    c.add(hit);
    this.statusPanel = c;
  }

  private async pickReward(i: number) {
    if (!this.tutOk(`reward:${i}`)) return;
    this.menu = 'busy';
    const r = this.rewardChoices[i];
    let target: Fighter | undefined;
    if (r.target === 'pick') {
      const rows = this.party.map(f => this.partyRow(f, !(r.canTarget?.(f) ?? true)));
      const pick = await this.choose(`${r.name}${r.plus ? '+' : ''}: for who?`, rows, true);
      if (pick < 0) { this.menu = 'reward'; this.refreshCursor(); return; }
      this.menu = 'busy';
      target = this.party[pick];
    }
    const text = r.apply(this.rewardCtx(), target);
    this.tut?.event('reward-picked');
    this.minTier = 'common';
    this.refreshPartyHeads();
    // monitor kapot: rookwolk + glinsters, net als in de game
    const card = this.rewardCards[i];
    const mon = card.getByName('mon') as Phaser.GameObjects.Image;
    const wx = card.x + mon.x, wy = card.y + mon.y;
    mon.setVisible(false);
    const smoke = this.add.sprite(wx, wy, 'ui', 'smoke_0').setDepth(41).play('smoke');
    audio.sfx('monitorbreak', { volume: 0.8 });
    const sp = this.add.sprite(wx, wy - 4, 'ui', 'sparkle_0').setDepth(42).setScale(2).play('sparkle');
    this.cameras.main.shake(80, 0.003);
    await this.wait(380);
    smoke.destroy(); sp.destroy();
    await this.tween({ targets: this.rewardLayer, alpha: 0, duration: 200 });
    this.rewardLayer?.destroy();
    this.rewardLayer = undefined;
    this.rewardCards = [];
    this.shopButtons = [];
    this.statusPanel?.destroy();
    this.statusPanel = undefined;
    this.tweens.add({ targets: [this.pBox.root, this.fieldText], alpha: 1, duration: 200 });
    this.refreshPartyHeads();
    this.setBox(this.pBox, this.player, true);
    await this.say(text, 600);
    if (this.tutorialMode) { await this.finishTutorial(); return; }
    this.wave++;
    this.startWave();
  }

  // ---------------------------------------------------------------- tutorial
  /** Tip van Tails de eerste keer dat iets gebeurt (niet in de tutorial zelf, en uit te zetten in Settings). */
  /** Rival-gesprekje (voor het gevecht of als hij verslagen is), met jouw character dat in het veld staat. */
  private async rivalTalk(when: 'intro' | 'defeat') {
    if (!this.rival || settings.talk !== 0 || this.tutorialMode) return;
    const lines = pickTalk(this.enemy.def.id, this.player.def.id, when);
    if (!lines) return;
    this.talkBox = playTalk(this, lines, this.player.def.id, this.enemy.def.id);
    await this.talkBox.done;
    this.talkBox = undefined;
  }

  private async tip(id: TipId) {
    if (this.tutorialMode || !tipDue(id)) return;
    markTip(id);
    const t = tailsTip(this, TIPS[id], SERIOUS_TIPS.includes(id));
    this.tipBox = t;
    await t.done;
    this.tipBox = undefined;
  }

  /** Slot van de tutorial: Tails zegt gedag, dan een echte run starten of terug naar het titelscherm. */
  private async finishTutorial() {
    audio.sfx('confirm2');
    this.tut?.say("That's it, you're ready for a real run! Good luck out there, Sonic!");
    markTip('shop'); // de shop heb je nu al gezien
    const pick = await this.choose('Practice complete!', [{ label: 'Start a run' }, { label: 'Back to title' }], false, true);
    this.tut?.destroy();
    this.tut = undefined;
    this.menu = 'busy';
    this.cameras.main.fadeOut(300, 255, 255, 255);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.input.keyboard!.removeAllListeners();
      if (pick === 0) this.scene.start('CharSelect');
      else this.scene.start('Title', { toMenu: true });
    });
  }

  /** Wat Tails uitlicht, als rechthoek in beeld. Volgt de UI: Fight-menu open of dicht, keuzelijstje ... */
  tutRect(focus: string): Phaser.Geom.Rectangle | undefined {
    const R = (x: number, y: number, w: number, h: number) => new Phaser.Geom.Rectangle(x, y, w, h);
    const textRect = (t?: Phaser.GameObjects.Text) => (t ? R(t.x - 14, t.y - 3, t.width + 18, 14) : undefined);
    const [kind, arg] = focus.split(':');
    if (this.menu === 'choice' && this.choiceLayer && (kind === 'cmd' || kind === 'move' || kind === 'item')) {
      const b = this.choiceLayer.getBounds();
      return R(b.x, b.y, b.width, b.height);
    }
    switch (kind) {
      case 'pBox': return R(this.pBox.root.x, this.pBox.root.y, 178, 45);
      case 'eBox': return R(this.eBox.root.x, this.eBox.root.y, 170, 32);
      case 'bag': return R(W - 24 - RingCounter.W, 17 + RingCounter.H + 4, RingCounter.W, 24);
      case 'heads': return R(W - 186 - 54, 154, 54, 16);
      case 'cards': return R(W / 2 - 132 - 61, 113, 132 * 2 + 122, 100);
      case 'shop': return R(SHOP_X, 26, SHOP_W, 74);
      case 'team': return R(W - 186, PANEL_Y + 8, 180, H - PANEL_Y - 10);
      case 'cmd': return textRect(this.cmdItems[Number(arg)]);
      case 'move': {
        if (this.menu !== 'fight') return textRect(this.cmdItems[0]);
        if (arg === 'any') return R(4, PANEL_Y + 8, 330, H - PANEL_Y - 10);
        return textRect(this.fightItems[this.player.moves.indexOf(arg)]);
      }
      case 'item': {
        if (this.menu !== 'bag') return textRect(this.cmdItems[2]);
        const c = this.bagItems[this.bagIds.indexOf(arg)];
        return c ? R(c.x - 14, c.y - 6, 44, 24) : undefined;
      }
    }
    return undefined;
  }

  /** Klaarzetten voor een stap: 'hurt' = Sonic heeft schade (voor de heart), 'finish' = de vijand mag vallen. */
  tutPrep(what: string) {
    if (what === 'hurt' && this.player.hp > this.player.maxHp * 0.6) {
      this.player.hp = Math.ceil(this.player.maxHp * 0.5);
      this.setBox(this.pBox, this.player, true);
    }
    if (what === 'finish') {
      this.tutGuard = false;
      this.enemy.hp = Math.min(this.enemy.hp, 1);
      this.setBox(this.eBox, this.enemy, true);
    }
  }
}
