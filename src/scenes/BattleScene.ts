import Phaser from 'phaser';
import { BOOST_ON_HIT, FIGHTERS, Fighter, HEROES, MAX_BOOST, MOVES, MoveDef, REWARDS, RewardDef, StageKey, ULTIMATE_LEVEL, calcHit, BOSS_REVIVE_HP, CHAO_CARE_HEAL, CRIT_RECOIL, emptyStages, expShareAfter, FLINCH_CHANCE, MAX_PARTY, movePower, stageMultiplier, typeMultiplier } from '../data/fighters';
import { EMERALDS, isBossWave, isEliteWave, canHaveRival, RIVAL_CHANCE, waveInZone, zoneForWave } from '../data/zones';
import { isUnlocked, unlock } from '../data/unlocks';
import { clearRun, fighterFromSave, fighterToSave, saveRun, type RunSave } from '../data/save';
import type { ZoneEffect } from '../data/zones';

/** true = bosses krijgen jouw type. Met een party van 3 kun je wisselen, dus nu uit. */
const BOSS_TYPE_NEUTRAL = false;
import { Backdrop } from './Backdrop';
import { BAG_SIZE, ITEMS, ItemDef, bagCount, shopStock } from '../data/items';
import { battleTimeScale, charDelay, holdFactor, settings } from '../data/settings';
import { addHelpButton, addMenuButton } from './ui';
import { audio, MusicKey } from '../audio';
import { bigText, chaoBlessing, cutIn, fxOnce, hearts, playUltimate, shockwave, type UltCtx } from './ultimates';
import { TEST_KEYS, TEST_MODE } from '../data/testMode';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';
const PANEL_Y = 222;

const PLAYER_POS = { x: 118, y: 208 };
const ENEMY_POS = { x: 352, y: 132 };

type MenuState = 'busy' | 'command' | 'fight' | 'bag' | 'reward' | 'buyprompt' | 'gameover' | 'choice';

/** Een regel in een keuze-lijstje (ja/nee, wie wissel je in, ...). */
interface ChoiceRow { label: string; right?: string; head?: string; disabled?: boolean; }

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
  portrait?: Phaser.GameObjects.Image;
  segments?: Phaser.GameObjects.Graphics;
}

export class BattleScene extends Phaser.Scene {
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
  /** testmodus: sneltoetsen-paneel en "volgende wave is een rival" */
  private testPanel?: Phaser.GameObjects.Container;
  private forceRival = false;
  /** Chao Blessing: het zone-effect blijft weg tot de zone-boss verslagen is */
  private fieldCleared = false;
  private fieldEffect?: ZoneEffect;
  private fieldText!: Phaser.GameObjects.Text;
  private fieldLayer?: Phaser.GameObjects.Container;
  private statsLayer!: Phaser.GameObjects.Container;
  private statsRows: Phaser.GameObjects.Text[] = [];
  /** rivals die je deze run al bent tegengekomen */
  private rivalsMet: string[] = [];
  private rings = 0;
  private emeralds = 0;
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
  private ringText!: Phaser.GameObjects.Text;
  private ringIcon!: Phaser.GameObjects.Sprite;

  private menu: MenuState = 'busy';
  private cursor = 0;
  private cmdLayer!: Phaser.GameObjects.Container;
  private cmdItems: Phaser.GameObjects.Text[] = [];
  private fightLayer!: Phaser.GameObjects.Container;
  private fightItems: Phaser.GameObjects.Text[] = [];
  private fightGlows: Phaser.GameObjects.Shape[] = [];
  private moveInfo!: Phaser.GameObjects.Text;
  private pointer!: Phaser.GameObjects.Triangle;
  private rewardLayer?: Phaser.GameObjects.Container;
  private rewardCards: Phaser.GameObjects.Container[] = [];
  private rewardChoices: RewardDef[] = [];
  /** in het reward-scherm: 0 = rij met gratis rewards, 1 = shop-rij */
  private rewardRow = 0;
  private rerolls = 0;
  /** HP-status rechtsonder tijdens het reward/shop-scherm */
  private statusPanel?: Phaser.GameObjects.Container;
  /** "Use now / Keep in bag" na het kopen van een heal-item */
  private prompt?: Phaser.GameObjects.Container;
  private promptItem?: ItemDef;
  private promptChoice = 0;
  private shopButtons: Phaser.GameObjects.Container[] = [];
  private shopItems: ItemDef[] = [];

  /** je tas: item-id -> aantal */
  private bag: Record<string, number> = {};
  private bagLayer!: Phaser.GameObjects.Container;
  private bagItems: Phaser.GameObjects.Text[] = [];
  private bagIds: string[] = [];
  private bagInfo!: Phaser.GameObjects.Text;

  /** stats-paneel (C in het hoofdmenu) */

  /** move-info (C) */
  private infoLayer!: Phaser.GameObjects.Container;
  private infoTitle!: Phaser.GameObjects.Text;
  private infoBody!: Phaser.GameObjects.Text;

  constructor() { super('Battle'); }

  init(data: { party?: string[]; starter?: string; save?: RunSave }) {
    this.saved = data.save;
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
    if (this.hero && this.foe) { this.updateStatusFx(dt); this.updateIdle(dt); }
  }

  /**
   * Idle in lagen, zoals Advance 2/3: eerst gewoon staan, na een paar seconden ongeduldig (voet tikken,
   * schaduwboksen...), en als je nog langer wacht gaan ze zitten of liggen. Zodra er iets gebeurt staan ze weer.
   */
  private idleState = new Map<Phaser.GameObjects.Sprite, { t: number; stage: number }>();
  private updateIdle(dt: number) {
    const waiting = this.menu === 'command' || this.menu === 'fight' || this.menu === 'bag';
    const pairs: Array<[Phaser.GameObjects.Sprite, Fighter | undefined]> = [[this.hero, this.player]];
    if (this.rival) pairs.push([this.foe, this.enemy]);
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
      if (st.stage === 0 && st.t > 4500 && this.anims.exists(wait) && key === idle) {
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
    this.events.on('update', () => {
      // de bubbel volgt je character, ook tijdens aanvallen
      if (this.shieldFx) this.shieldFx.setPosition(this.hero.x, this.hero.y - this.hero.displayHeight * 0.42).setVisible(this.hero.visible);
    });
    this.party = this.partyIds.map(id => new Fighter(id, 5));
    this.player = this.party[0];
    this.expShare = 0;
    this.fieldCleared = false;
    this.statsRows = [];
    const sv = this.saved;
    if (sv) {
      this.party = sv.party.map(fighterFromSave);
      this.player = this.party[sv.active] ?? this.party.find(f => !f.fainted) ?? this.party[0];
      this.wave = sv.wave;
      this.rings = sv.rings;
      this.emeralds = sv.emeralds;
      this.expShare = sv.expShare;
      this.bag = { ...sv.bag };
      this.rivalsMet = [...sv.rivalsMet];
      this.fieldCleared = !!sv.fieldCleared;
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
    this.scene.launch('Pause', { from: this.scene.key });
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

  /** Groene shield-bubbel om je character zolang je een DEF-buff hebt. */
  private updateShield() {
    const on = this.player.stages.def > 0;
    if (on && !this.shieldFx) {
      this.shieldFx = this.add.sprite(this.hero.x, this.hero.y, 'fx_shield_0').setScale(2).setAlpha(0.7).setBlendMode(Phaser.BlendModes.ADD).setDepth(6).play('shield');
    } else if (!on && this.shieldFx) {
      this.shieldFx.destroy();
      this.shieldFx = undefined;
    }
  }

  private makeInfoBox(x: number, y: number, w: number, isPlayer: boolean): InfoBox {
    const root = this.add.container(x, y).setDepth(20);
    const h = isPlayer ? 40 : 28;
    let portrait: Phaser.GameObjects.Image | undefined;
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.92).fillRoundedRect(0, 0, w, h, 4);
    g.lineStyle(1, 0x5a6690).strokeRoundedRect(0.5, 0.5, w - 1, h - 1, 4);
    const barX = 34, barY = 17, barW = w - barX - 8;
    g.fillStyle(0x2a2f40).fillRect(barX - 1, barY - 1, barW + 2, 6);
    root.add(g);
    root.add(this.add.text(10, barY - 1, 'HP', { fontFamily: FONT, fontSize: '8px', color: '#f2c230' }));
    const bar = this.add.rectangle(barX, barY, barW, 4, 0x4ade5a).setOrigin(0, 0);
    const name = this.add.text(8, 5, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' });
    // jouw kant krijgt het character-icoontje links naast de box
    if (isPlayer) {
      // Advance 3-portret links naast de box, precies even hoog (40 px)
      portrait = this.add.image(-4, 0, `portrait_${this.player.def.id}`).setOrigin(1, 0);
      root.add(portrait);
    }
    const level = this.add.text(w - 8, 5, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(1, 0);
    const typeIcon = this.add.image(0, 8, 'type_speed').setOrigin(0, 0.5);
    root.add([bar, name, level, typeIcon]);
    const box: InfoBox = { root, name, level, bar, barW, shownHp: 0, typeIcon, portrait };
    if (!isPlayer) {
      // net als in PokéRogue: BOSS-label naast het level, en de HP-balk in stukken
      box.badgeBg = this.add.graphics();
      box.badge = this.add.text(w - 10, h + 2, '', { fontFamily: FONT, fontSize: '8px', color: '#ff7a2a' }).setOrigin(1, 0);
      box.segments = this.add.graphics();
      root.add([box.badgeBg, box.badge, box.segments]);
    }
    if (isPlayer) {
      // Boost-meter: 6 blokjes onder de HP-balk
      root.add(this.add.text(8, 25, 'BOOST', { fontFamily: FONT, fontSize: '8px', color: '#6ad8ff' }));
      box.boostPips = Array.from({ length: MAX_BOOST }, (_, i) => this.add.rectangle(52 + i * 9, 26, 7, 6, 0x2a2f40).setOrigin(0));
      root.add(box.boostPips);
      box.hpText = this.add.text(w - 8, 25, '', { fontFamily: FONT, fontSize: '8px', color: '#cfd6ee' }).setOrigin(1, 0);
      g.fillStyle(0x2a2f40).fillRect(8, 35, w - 16, 2);
      box.exp = this.add.rectangle(8, 35, 0, 2, 0x4aa8ff).setOrigin(0, 0);
      root.add([box.hpText, box.exp]);
    }
    return box;
  }

  private drawHud() {
    this.eBox = this.makeInfoBox(10, 26, 170, false);
    this.pBox = this.makeInfoBox(W - 186, 172, 178, true);
    this.fieldText = this.add.text(W - 186, 161, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
      .setDepth(20).setShadow(1, 1, '#000', 0);
    // je team als kleine hoofdjes boven het portret (donker = KO)
    this.partyHeads = this.party.map(() => this.add.image(0, 154, 'ui', 'head_sonic').setOrigin(0, 0).setDepth(20));
    addMenuButton(this, W - 12, 10, () => this.openPause()).setDepth(21);
    addHelpButton(this, W - 12, 30, () => this.openHelp()).setDepth(21);
    this.waveText = this.add.text(W - 24, 6, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
      .setOrigin(1, 0).setDepth(20).setShadow(1, 1, '#000', 0);
    this.ringIcon = this.add.sprite(W - 72, 22, 'ui', 'ring_0').setDepth(20).play('ring_spin');
    // Chaos Emerald-slots: donker tot je ze verdient (1 per zone-boss)
    EMERALDS.forEach((c, i) => {
      const e = this.add.sprite(18 + i * 22, 13, 'emeralds', `emerald_${c}_0`).setDepth(20);
      e.setTint(0x30344a).setAlpha(0.75);
      this.emeraldSlots.push(e);
    });
    this.ringText = this.add.text(W - 62, 18, '0', { fontFamily: FONT, fontSize: '8px', color: '#f2c230' })
      .setDepth(20).setShadow(1, 1, '#000', 0);
  }

  private drawPanel() {
    const g = this.add.graphics().setDepth(30);
    g.fillStyle(0x23252f).fillRect(0, PANEL_Y, W, H - PANEL_Y);
    g.fillStyle(0xc0392b).fillRect(0, PANEL_Y, W, 3);
    g.fillStyle(0x7d1f17).fillRect(0, PANEL_Y + 3, W, 1);
    this.msg = this.add.text(12, PANEL_Y + 11, '', {
      fontFamily: FONT, fontSize: '8px', color: '#ffffff', lineSpacing: 6, wordWrap: { width: 270 },
    }).setDepth(31);

    // Command-menu (Fight / Party / Items / Run)
    this.cmdLayer = this.add.container(0, 0).setDepth(31).setVisible(false);
    const cg = this.add.graphics();
    cg.fillStyle(0x2f3240).fillRect(296, PANEL_Y + 6, 178, H - PANEL_Y - 10);
    cg.lineStyle(2, 0xc0392b).strokeRect(297, PANEL_Y + 7, 176, H - PANEL_Y - 12);
    this.cmdLayer.add(cg);
    ['Fight', 'Party', 'Items', 'Run'].forEach((label, i) => {
      const t = this.add.text(318 + (i % 2) * 80, PANEL_Y + 14 + Math.floor(i / 2) * 16, label,
        { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (this.menu === 'command') { this.cursor = i; this.refreshCursor(); } });
      t.on('pointerdown', () => { if (this.menu === 'command') { this.cursor = i; this.confirm(); } });
      this.cmdItems.push(t);
      this.cmdLayer.add(t);
    });

    // Fight-menu (moves + info)
    this.fightLayer = this.add.container(0, 0).setDepth(32).setVisible(false);
    const fg = this.add.graphics();
    fg.fillStyle(0x23252f).fillRect(0, PANEL_Y + 4, W, H - PANEL_Y - 4);
    fg.fillStyle(0x2f3240).fillRect(338, PANEL_Y + 6, 136, H - PANEL_Y - 10);
    this.fightLayer.add(fg);
    this.moveInfo = this.add.text(346, PANEL_Y + 10, '', { fontFamily: FONT, fontSize: '8px', color: '#cfd6ee', lineSpacing: 3 });
    this.fightLayer.add(this.moveInfo);

    // tik op het info-vak = move-info (zelfde als C)
    const infoHit = this.add.zone(338, PANEL_Y + 6, 136, H - PANEL_Y - 10).setOrigin(0).setInteractive({ useHandCursor: true });
    infoHit.on('pointerdown', () => { if (this.menu === 'fight') this.toggleMoveInfo(); });
    this.fightLayer.add([infoHit, this.add.text(346, PANEL_Y + 32, 'C: info', { fontFamily: FONT, fontSize: '8px', color: '#6b7493' })]);

    // Move-info paneel boven het menu
    this.infoLayer = this.add.container(0, 0).setDepth(34).setVisible(false);
    const ig = this.add.graphics();
    ig.fillStyle(0x10131c, 0.96).fillRoundedRect(8, PANEL_Y - 74, 322, 70, 5);
    ig.lineStyle(1, 0xf2c230).strokeRoundedRect(8.5, PANEL_Y - 73.5, 321, 69, 5);
    this.infoTitle = this.add.text(18, PANEL_Y - 66, '', { fontFamily: FONT, fontSize: '8px', color: '#f2c230' });
    this.infoBody = this.add.text(18, PANEL_Y - 50, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', lineSpacing: 5, wordWrap: { width: 302 } });
    this.infoLayer.add([ig, this.infoTitle, this.infoBody]);

    // Stats-paneel (C in het hoofdmenu, of tik op je HP-box)
    this.statsLayer = this.add.container(0, 0).setDepth(34).setVisible(false);
    const sg = this.add.graphics();
    sg.fillStyle(0x10131c, 0.96).fillRoundedRect(8, PANEL_Y - 126, 250, 122, 5);
    sg.lineStyle(1, 0xf2c230).strokeRoundedRect(8.5, PANEL_Y - 125.5, 249, 121, 5);
    this.statsLayer.add(sg);
    for (let i = 0; i < 8; i++) {
      const t = this.add.text(18, PANEL_Y - 118 + i * 14, '', { fontFamily: FONT, fontSize: '8px', color: i === 0 ? '#f2c230' : '#ffffff' });
      const b = this.add.text(248, PANEL_Y - 118 + i * 14, '', { fontFamily: FONT, fontSize: '8px', color: '#4ade5a' }).setOrigin(1, 0);
      this.statsRows.push(t, b);
      this.statsLayer.add([t, b]);
    }
    this.cmdLayer.add(this.add.text(12, PANEL_Y + 37, 'C stats  I info  V field', { fontFamily: FONT, fontSize: '8px', color: '#6b7493' }));
    const statsHit = this.add.zone(this.pBox.root.x, this.pBox.root.y, 178, 40).setOrigin(0).setDepth(21).setInteractive({ useHandCursor: true });
    statsHit.on('pointerdown', () => { if (this.menu === 'command') this.toggleStats(); });

    // Tas (Items)
    this.bagLayer = this.add.container(0, 0).setDepth(32).setVisible(false);
    const bg = this.add.graphics();
    bg.fillStyle(0x23252f).fillRect(0, PANEL_Y + 4, W, H - PANEL_Y - 4);
    bg.fillStyle(0x2f3240).fillRect(338, PANEL_Y + 6, 136, H - PANEL_Y - 10);
    this.bagInfo = this.add.text(346, PANEL_Y + 12, '', { fontFamily: FONT, fontSize: '8px', color: '#cfd6ee', lineSpacing: 6, wordWrap: { width: 124 } });
    this.bagLayer.add([bg, this.bagInfo]);

    this.pointer = this.add.triangle(0, 0, 0, 0, 0, 8, 5, 4, 0xffffff).setOrigin(0, 0).setDepth(35);
  }

  private buildBagItems() {
    this.bagItems.forEach(t => t.destroy());
    this.bagItems = [];
    this.bagIds = Object.keys(ITEMS).filter(id => (this.bag[id] ?? 0) > 0);
    this.bagIds.forEach((id, i) => {
      const t = this.add.text(26 + (i % 2) * 150, PANEL_Y + 14 + Math.floor(i / 2) * 16, `${ITEMS[id].name} x${this.bag[id]}`,
        { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (this.menu === 'bag') { this.cursor = i; this.refreshCursor(); } });
      t.on('pointerdown', () => { if (this.menu === 'bag') { this.cursor = i; this.confirm(); } });
      this.bagItems.push(t);
      this.bagLayer.add(t);
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
      [`EXP  ${p.exp}/${p.expToNext}`, ''],
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
    const cost = m.cost ? `   Boost ${m.cost}` : m.boostGain ? `   Boost +${m.boostGain}` : '';
    this.infoBody.setText(m.heal ? `Heals ${Math.round(m.heal * 100)}% HP${cost}\n${m.desc}` : `Power ${movePower(m, this.player, this.enemy)}   Acc ${m.accuracy}%${m.priority > 0 ? '   First' : ''}${cost}\n${m.desc}`);
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
      const color = !m ? '#5a6070' : !this.player.canUse(m) ? '#6b7493' : m.anim === 'ultimate' ? '#ffd23a' : '#ffffff';
      const t = this.add.text(26 + (i % 2) * 150, PANEL_Y + 14 + Math.floor(i / 2) * 16, m ? m.name : '-',
        { fontFamily: FONT, fontSize: '8px', color });
      // groene gloed = type-voordeel tegen deze vijand, oranje = nadeel (zoals in PokéRogue)
      const eff = m && !m.heal ? typeMultiplier(this.player.type, this.enemy.type) : 1;
      if (eff !== 1 && this.player.canUse(m!)) {
        // groen pijltje omhoog = type-voordeel, oranje omlaag = nadeel
        const ax = t.x + t.width + 5, ay = t.y + 4;
        const arrow = eff > 1
          ? this.add.triangle(ax, ay, 0, 6, 8, 6, 4, 0, 0x3cd85a).setOrigin(0, 0.5)
          : this.add.triangle(ax, ay, 0, 0, 8, 0, 4, 6, 0xff8a2a).setOrigin(0, 0.5);
        arrow.setStrokeStyle(1, 0x10131c);
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
      if (TEST_MODE && this.testKey(k)) return;
      if (this.menu === 'choice') {
        if (['arrowup', 'w', 'arrowleft', 'a'].includes(k)) this.moveChoice(-1);
        else if (['arrowdown', 's', 'arrowright', 'd'].includes(k)) this.moveChoice(1);
        else if (['z', 'enter', ' '].includes(k)) this.pickChoice(this.cursor);
        else if (['x', 'escape', 'backspace'].includes(k) && this.choiceCancel) this.endChoice(-1);
        return;
      }
      if (this.menu === 'buyprompt') {
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) {
          this.promptChoice = 1 - this.promptChoice;
          this.refreshPrompt();
        } else if (['z', 'enter', ' '].includes(k)) this.resolvePrompt(this.promptChoice === 0);
        else if (['x', 'escape', 'backspace'].includes(k)) this.resolvePrompt(false);
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
      else if (k === 'i' && this.menu === 'command') this.openTeam();
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
      const boost = m.cost ? `BOOST ${m.cost}` : m.boostGain ? `BOOST +${m.boostGain}` : 'BOOST 0';
      const acc = Math.min(100, Math.round(m.accuracy * stageMultiplier(this.player.stage('acc'))));
      this.moveInfo.setText(m.heal ? `HEAL ${Math.round(m.heal * 100)}%\n${boost}` : `PWR ${movePower(m, this.player, this.enemy)} ACC ${acc}\n${boost}`);
      this.moveInfo.setColor(this.player.canUse(m) ? '#cfd6ee' : '#e8443a');
      if (this.infoLayer.visible) this.updateMoveInfo();
    } else if (this.menu === 'bag') {
      if (!this.bagIds.length) { this.bagInfo.setText('Your bag is empty. Buy items in the shop after a wave.'); return; }
      const t = this.bagItems[this.cursor];
      this.pointer.setPosition(t.x - 11, t.y);
      this.bagInfo.setText(ITEMS[this.bagIds[this.cursor]].desc);
    } else if (this.menu === 'reward') {
      this.rewardCards.forEach((c, i) => {
        const sel = this.rewardRow === 0 && i === this.cursor;
        c.y = sel ? 159 : 162;
        (c.getAt(1) as Phaser.GameObjects.Graphics).setVisible(sel);
      });
      this.shopButtons.forEach((b, i) => {
        (b.getByName('arrow') as Phaser.GameObjects.Triangle).setVisible(this.rewardRow === 1 && i === this.cursor);
      });
      if (this.rewardRow === 0) {
        const r = this.rewardChoices[this.cursor];
        this.msg.setText(`${r.name}: ${r.desc}\nFree! Pick one to continue.`);
      } else if (this.cursor < this.shopItems.length) {
        const it = this.shopItems[this.cursor];
        this.msg.setText(`${it.name}: ${it.desc}\nCost ${it.price} rings. In bag: ${this.bag[it.id] ?? 0}`);
      } else {
        this.msg.setText(`Reroll: new free rewards\nCost ${this.rerollCost()} rings.`);
      }
    }
  }

  private confirm() {
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
    this.msg.setVisible(true).setText(`What will\n${this.player.name} do?`);
    this.refreshCursor();
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

  /** Item gebruiken kost je beurt: daarna valt de vijand aan. */
  private async useItem(id: string) {
    const item = ITEMS[id];
    let target = this.player;
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
    audio.sfx('heal1');
    this.refreshPartyHeads();
    await this.setBox(this.pBox, this.player, true);
    await this.say(text, 350);
    const enemyMove = this.pickEnemyMove();
    await this.doAttack(this.enemy, this.player, enemyMove);
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(2); return; }
    await this.endOfTurn();
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(2); return; }
    this.openCommand(2);
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
      const kind = box === this.eBox ? this.enemyRank() : '';
      const colors: Record<string, string> = { BOSS: '#ff7a2a', ELITE: '#c08aff', RIVAL: '#ff4a5a' };
      box.badge.setText(kind).setColor(colors[kind] ?? '#ffffff');
      // tabje onder de box, rechts uitgelijnd
      box.badgeBg!.clear();
      if (kind) {
        const bw = box.badge.width + 8;
        box.badgeBg!.fillStyle(0x10131c, 0.92).fillRoundedRect(box.badge.x - bw + 4, box.badge.y - 2, bw, 12, 3);
        box.badgeBg!.lineStyle(1, Phaser.Display.Color.HexStringToColor(colors[kind]).color).strokeRoundedRect(box.badge.x - bw + 4.5, box.badge.y - 1.5, bw - 1, 11, 3);
      }
      // boss-balk in 4 stukken
      box.segments!.clear();
      if (kind === 'BOSS') {
        box.segments!.fillStyle(0x10131c);
        for (let i = 1; i < 4; i++) box.segments!.fillRect(34 + (box.barW * i) / 4 - 1, 17, 2, 4);
      }
    }
    box.boostPips?.forEach((pip, i) => pip.setFillStyle(i < f.boost ? (f.boost >= MAX_BOOST ? 0xffd23a : 0x4ad8ff) : 0x2a2f40));
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
      bar.fillColor = 0x4aa8ff;
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

  private hitFlash(target: Phaser.GameObjects.Sprite) {
    return this.tween({ targets: target, alpha: 0.2, duration: 60, yoyo: true, repeat: 2 });
  }

  /** Midden van een sprite (origin zit onderaan). */
  private center(s: Phaser.GameObjects.Sprite) { return { x: s.x, y: s.y - s.displayHeight * 0.4 }; }

  // ---------------------------------------------------------------- flow
  /** Auto-save: de run zoals hij nu is, zodat je na het sluiten verder kunt bij deze wave. */
  private autoSave(wave = this.wave) {
    saveRun({
      wave, rings: this.rings, emeralds: this.emeralds, expShare: this.expShare,
      bag: { ...this.bag }, rivalsMet: [...this.rivalsMet], fieldCleared: this.fieldCleared,
      active: Math.max(0, this.party.indexOf(this.player)), party: this.party.map(fighterToSave),
    });
  }

  private async startWave() {
    this.autoSave();
    this.menu = 'busy';
    this.party.forEach(f => { f.stun = 0; f.evade = 0; });
    this.stunUsed.clear();
    this.pointer.setVisible(false);
    this.cmdLayer.setVisible(false);
    this.msg.setVisible(true).setText('');
    // vijand-box pas tonen als de vijand er is; jouw box meteen gevuld
    this.eBox.root.setAlpha(0);
    this.setBox(this.pBox, this.player, false);
    const zone = zoneForWave(this.wave);
    const boss = isBossWave(this.wave);
    const rivalId = this.forceRival || (canHaveRival(this.wave) && Math.random() < RIVAL_CHANCE) ? this.pickRival() : undefined;
    this.forceRival = false;
    this.rival = !!rivalId;
    const elite = isEliteWave(this.wave) && !this.rival;
    const id = rivalId ?? (boss ? zone.boss : Phaser.Utils.Array.GetRandom(zone.enemies));
    // vijanden stijgen ~0,65 level per wave; jij blijft dan net iets voor (bosses/elites +2, rivals op gelijk niveau)
    this.enemy = new Fighter(id, 4 + Math.floor(0.65 * (this.wave - 1)) + (boss || elite ? 2 : 0));
    if (rivalId) this.rivalsMet.push(rivalId);
    // zone-bosses zijn type-neutraal zolang je maar 1 character hebt (anders is een boss voor sommigen onmogelijk)
    if (boss && BOSS_TYPE_NEUTRAL) this.enemy.typeOverride = this.player.type;

    // nieuwe zone: achtergrond wisselen + zone-titel; boss-wave: Chaos Angel
    const firstOfZone = waveInZone(this.wave) === 1;
    this.setBackdrop(boss ? 'chaosangel' : zone.backdrop, this.wave === 1 ? 0 : 600);
    this.applyZoneEffect(this.fieldCleared ? undefined : zone.effect);
    audio.playMusic(boss || this.rival ? 'boss' : (zone.backdrop as MusicKey));
    this.waveText.setText(`${zone.name} - Wave ${this.wave}`);
    this.hero.play(this.player.anim('idle'));
    if (firstOfZone) await this.zoneBanner(zone.name, Math.floor((this.wave - 1) / 10) + 1);
    if (firstOfZone && zone.effect && !this.fieldCleared) await this.say(`${zone.effect.name}! ${zone.effect.desc}.`, 700);
    const d = this.enemy.def;
    this.waveText.setText(`${zone.name} - Wave ${this.wave}`);
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
    if (this.rival) await this.rivalBanner();
    await this.say(this.rival ? `Rival ${this.enemy.name} wants to battle!` : boss ? `Watch out! ${this.enemy.name} appeared!` : elite ? `A strong ${this.enemy.name} appeared!` : `A wild ${this.enemy.name} appeared!`, 500);
    // Battle Style "Switch": voor elke wave (behalve de eerste) gratis wisselen
    if (this.wave > 1 && settings.battleStyle === 0 && this.party.filter(f => !f.fainted).length > 1) {
      const yes = await this.choose(`Will you switch\ncharacters?`, [{ label: 'Yes' }, { label: 'No' }], true);
      if (yes === 0) {
        const i = await this.pickTeammate('Who goes in?', true);
        if (i >= 0) await this.switchTo(this.party[i]);
      }
    }
    await this.chaoCare();
    this.openCommand();
  }

  /** Chao Care (Cream): staat ze in het veld als de wave begint, dan geneest het hele team 10%. */
  private async chaoCare() {
    if (this.player.def.passive?.id !== 'chaoCare' || this.player.fainted) return;
    const hurt = this.party.filter(f => !f.fainted && f.hp < f.maxHp);
    if (!hurt.length) return;
    for (const f of hurt) f.hp = Math.min(f.maxHp, f.hp + Math.ceil(f.maxHp * CHAO_CARE_HEAL));
    audio.sfx('heal1');
    this.sparkles(this.hero);
    await this.setBox(this.pBox, this.player, true);
    await this.say(`Chao Care! The team healed a little.`, 400);
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
  private statusClock = 0;
  private updateStatusFx(dt: number) {
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
      if (stars) {
        const top = spr.y - spr.displayHeight - 4;
        stars.forEach((st, i) => {
          const a = this.statusClock / 260 + (i / 3) * Math.PI * 2;
          st.setPosition(spr.x + Math.cos(a) * 14, top + Math.sin(a) * 4).setDepth(Math.sin(a) > 0 ? 19 : spr.depth - 1);
        });
      }
      if (f && f.evade > 0 && !f.fainted && Math.floor(this.statusClock / 140) !== Math.floor((this.statusClock - dt) / 140)) {
        this.ghost(spr, 0xffd23a);
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
  private who(f: Fighter) { return `${f === this.player ? '' : this.rival ? 'Rival ' : 'Foe '}${f.name}`; }

  /** Eén actie: eerst kijken of hij verdoofd is of flinchte, anders aanvallen. */
  private async act(att: Fighter, tgt: Fighter, move: MoveDef, ally?: Fighter) {
    if (att.stun > 0) {
      att.stun--;
      this.hitFlash(att === this.player ? this.hero : this.foe);
      await this.say(`${this.who(att)} is stunned and can't move!`, 400);
      return;
    }
    if (this.flinched.has(att)) {
      await this.say(`${this.who(att)} flinched and couldn't move!`, 400);
      return;
    }
    if (att === this.player) { this.player.spendBoost(move); this.setBox(this.pBox, this.player, false); }
    await this.doAttack(att, tgt, move, ally);
  }

  private async runTurn(playerMove: MoveDef, ally?: Fighter) {
    this.toggleField(false);
    this.menu = 'busy';
    this.pointer.setVisible(false);
    const enemyMove = this.pickEnemyMove();
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

    if (this.enemy.fainted) return this.winWave();
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(); return; }
    await this.endOfTurn();
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(); return; }
    this.openCommand();
  }

  private async doAttack(att: Fighter, tgt: Fighter, move: MoveDef, ally?: Fighter) {
    const isPlayer = att === this.player;
    await this.say(`${this.who(att)} used ${move.name}!`, 150);
    if (move.heal || move.teamHeal) return this.doHeal(att, move, ally ?? att);
    let hit = calcHit(att, tgt, move);
    let hungOn = false;
    // Light Speed Attack: de volgende aanvallen op Sonic missen gegarandeerd
    if (tgt.evade > 0) { tgt.evade--; hit = { ...hit, missed: true, damage: 0, crit: false }; }
    let struck = false;
    const strike = () => {
      if (hit.missed || struck) return;
      struck = true;
      tgt.hp = Math.max(0, tgt.hp - hit.damage);
      if (tgt.hp === 0 && tgt.def.passive?.id === 'flinch' && !tgt.sashUsed) { tgt.hp = 1; tgt.sashUsed = true; hungOn = true; }
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
      this.popNumber(spr.x, spr.y - spr.displayHeight - 4, `-${hit.damage}`, hit.crit ? '#f2c230' : '#ffffff');
      this.cameras.main.shake(hit.crit ? 220 : 120, hit.crit ? 0.008 : 0.004);
      if (isPlayer) audio.sfx(isBossWave(this.wave) ? 'bosshit' : 'enemyhit', { volume: 0.8 });
      else { audio.sfx('hurtrings', { volume: 0.7 }); this.player.gainBoost(BOOST_ON_HIT); }
      this.hitFlash(spr);
      if (!isPlayer) this.hero.play(this.player.anim('hurt'));
      else if (this.rival) this.foe.play(this.enemy.anim('hurt'));
      this.setBox(isPlayer ? this.eBox : this.pBox, tgt, true);
    };

    this.setActionSpeed(isPlayer ? this.hero : this.foe);
    if (isPlayer && move.id === att.def.ultimate) await cutIn(this, att.def.id, move.name);
    if (isPlayer) await this.charAttack(this.hero, this.player, this.foe, PLAYER_POS, 1, move, strike, hit.missed);
    else if (this.rival) await this.charAttack(this.foe, this.enemy, this.hero, this.foeHome, -1, move, strike, hit.missed);
    else await this.foeAttack(move, strike, hit.missed);

    if (!isPlayer && !hit.missed) { await this.wait(350); if (!this.player.fainted) this.hero.play(this.player.anim('idle')); }
    if (isPlayer && this.rival && !hit.missed) { await this.wait(350); if (!this.enemy.fainted) this.foe.play(this.enemy.anim('idle')); }
    this.setActionSpeed(null);
    if (hit.missed) {
      // MISS naast het doelwit, in plaats van een geluid
      const spr = isPlayer ? this.foe : this.hero;
      this.popMiss(spr.x + (isPlayer ? -30 : 34), spr.y - spr.displayHeight * 0.7);
      await this.say(`${tgt.name} avoided the attack!`, 400);
    }
    if (move.spendStages && Object.values(att.stages).some(v => v !== 0)) {
      att.stages = { atk: 0, def: 0, spd: 0, acc: 0 };
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
    else {
      if (hit.crit) await this.say('A critical hit!', 350);
      if (hit.effect > 1) await this.say("It's super effective!", 350);
      else if (hit.effect < 1) await this.say("It's not very effective...", 350);
      if (!hit.crit && hit.effect === 1) await this.wait(250);
      // moves die de gebruiker genezen als ze raken (Hammer Twirl)
      if (move.selfHeal && !att.fainted && att.hp < att.maxHp) {
        const h = Math.min(att.maxHp - att.hp, Math.ceil(att.maxHp * move.selfHeal));
        att.hp += h;
        const spr = isPlayer ? this.hero : this.foe;
        hearts(this, spr.x, spr.y - spr.displayHeight * 0.6, 6, 0x7cf07c);
        this.popNumber(spr.x, spr.y - spr.displayHeight - 4, `+${h}`, '#7cf07c');
        await this.setBox(isPlayer ? this.pBox : this.eBox, att, true);
        await this.say(`${this.who(att)} recovered ${h} HP!`, 300);
      }
      // moves die je eigen stats verhogen (Homing Attack: SPD +1)
      for (const [k, v] of Object.entries(move.selfStages ?? {})) {
        if (!att.fainted) await this.say(att.raise(k as StageKey, v), 300);
      }
      if (hungOn) await this.say(`${this.who(tgt)} hung on with 1 HP! (Iron Fists)`, 500);
      // Lucky Swing (Amy): elke crit kost haar 10% max-HP, maar ze gaat er zelf nooit van KO
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
      const stunKey = `${isPlayer ? 'p' : 'e'}:${move.id}`;
      if (move.stun && !tgt.fainted && !(move.stunOnce && this.stunUsed.has(stunKey))) {
        if (move.stunOnce) this.stunUsed.add(stunKey);
        tgt.stun = Math.max(tgt.stun, Phaser.Math.Between(move.stun[0], move.stun[1]));
        audio.sfx('enemyhit', { volume: 0.5 });
        await this.say(`${this.who(tgt)} is stunned!`, 400);
      }
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
      await chaoBlessing({ ...this.ultCtx(spr, att, this.foe, PLAYER_POS, 1, () => undefined), clearsField: !!(move.clearField && this.fieldEffect) });
    } else {
      const anim = this.playOnce(spr, att.anim('cheer'));
      audio.sfx('heal1');
      this.sparkles(spr);
      // Cheese vliegt naar wie er geneest wordt (op de bank: naar zijn hoofdje in de HUD)
      const cheese = this.add.sprite(spr.x + 18, spr.y - 46, 'fx').setDepth(26).setScale(1.6).play('cheese_fly');
      const icon = isPlayer && target !== att ? this.partyHeads[this.party.indexOf(target)] : undefined;
      const to = icon ? { x: icon.x + 8, y: icon.y + 8 } : { x: spr.x, y: spr.y - spr.displayHeight - 10 };
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
      let total = 0;
      for (const f of team) {
        const h = Math.min(f.maxHp - f.hp, Math.ceil(f.maxHp * move.teamHeal));
        f.hp += h;
        total += h;
      }
      if (total > 0) this.popNumber(spr.x, spr.y - spr.displayHeight - 4, `+${total}`, '#7cf07c');
      await this.setBox(isPlayer ? this.pBox : this.eBox, att, true);
      await this.say(isPlayer ? 'The whole team is back to full HP!' : `${this.who(att)} is back to full HP!`, 500);
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
    if (h > 0 && target === att) this.popNumber(spr.x, spr.y - spr.displayHeight - 4, `+${h}`, '#7cf07c');
    if (target === att) await this.setBox(isPlayer ? this.pBox : this.eBox, att, true);
    await this.say(h > 0 ? `${target.name} healed ${h} HP!` : `${target.name}'s HP is already full!`, 400);
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
    const ty = fc.y + s.displayHeight * 0.4;

    let finisher: (() => Promise<void>) | undefined;
    const base = p.def.scale;
    const run = this.anims.exists(p.anim('run')) ? p.anim('run') : p.anim('spin');
    // aanloop: eerst even door de knieën (niet bij de ultimate en de Spin Dash, die hebben hun eigen opbouw)
    if (move.anim !== 'ultimate' && move.anim !== 'dash') await this.anticipate(s, base);
    if (move.anim !== 'hammer' && move.anim !== 'ultimate') audio.sfx(move.anim === 'dash' ? 'spindash' : 'jump', { volume: move.anim === 'dash' ? 0.6 : 0.8 });
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

  /** Aanvallen van badniks. De stijl staat in de move (shoot / tackle / lash / slam). */
  private async foeAttack(move: MoveDef, strike: () => void, missed: boolean) {
    const b = this.foe;
    const e = this.enemy;
    this.foeHover?.stop();
    const heroC = this.center(this.hero);
    const attackAnim = e.anim('attack');
    await this.anticipate(b, e.def.scale); // ook badniks nemen even aanloop

    if (move.anim === 'shoot') {
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
    this.foeHover?.stop();
    if (this.rival) return this.winRival();
    const c = this.center(this.foe);
    const boom = this.add.sprite(c.x, c.y + 10, 'badniks').setOrigin(0.5, 1).setScale(this.enemy.def.scale * 1.1).setDepth(16);
    boom.play('explosion');
    audio.sfx(isBossWave(this.wave) ? 'bigexplosion' : 'explosion');
    boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy());
    this.burst(c.x, c.y, 0xf2c230, 18);
    this.tween({ targets: this.eBox.root, alpha: 0, duration: 300 });
    this.time.delayedCall(120, () => this.foe.setVisible(false));
    await this.wait(450);
    await this.say(`Foe ${this.enemy.name} was destroyed!`, 300);
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
    await this.say(`Rival ${this.enemy.name} was defeated!`, 300);
    await this.tween({ targets: this.foe, alpha: 0, x: this.foe.x + 40, duration: 400 });
    this.foe.setVisible(false).setAlpha(1);
    await this.finishWin(c);
  }

  private async finishWin(c: { x: number; y: number }) {
    // Sonic Speed: na elke KO SPD +1
    if (this.player.def.passive?.id === 'speedster' && !this.player.fainted) {
      await this.say(`Sonic Speed! ${this.player.raise('spd')}`, 300);
    }
    const gained = 10 + this.wave * 3;
    if (!this.player.fainted) this.hero.play(this.player.anim('victory'));
    this.victoryVoice();
    if (isBossWave(this.wave)) audio.playJingle('victory', zoneForWave(this.wave + 1).backdrop as MusicKey);
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
      const down = this.party.filter(f => f.fainted);
      for (const f of down) f.hp = Math.max(1, Math.ceil(f.maxHp * BOSS_REVIVE_HP));
      if (down.length) {
        this.refreshPartyHeads();
        audio.sfx('heal1');
        await this.say(`${down.map(f => f.name).join(' and ')} got back up with ${Math.round(BOSS_REVIVE_HP * 100)}% HP!`, 500);
      }
    }
    if (isBossWave(this.wave) && this.emeralds < EMERALDS.length) await this.awardEmerald(c.x, c.y);
    if (this.rival && unlock(this.enemy.def.id)) await this.unlockBanner(this.enemy.def.id, this.enemy.name);
    if (this.rival) await this.offerRivalJoin(this.enemy.def.id, this.enemy.level);
    const share = expShareAfter(this.wave);
    if (share > this.expShare) {
      this.expShare = share;
      audio.sfx('confirm2');
      await this.say(`Got the Exp. Share! Your team on the bench now gets ${Math.round(share * 100)}% EXP.`, 900);
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
    this.openRewards();
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
    });
  }

  /** Keuze-lijstje rechts boven het tekstvak. Geeft de gekozen index terug, of -1 bij X (als dat mag). */
  private choose(title: string, rows: ChoiceRow[], cancel: boolean): Promise<number> {
    this.endChoice();
    this.cmdLayer.setVisible(false);
    this.fightLayer.setVisible(false);
    this.pointer.setVisible(false);
    this.msg.setVisible(true).setText(title);
    this.menu = 'choice';
    this.choiceRows = rows;
    this.choiceCancel = cancel;
    const rowH = rows.some(r => r.head) ? 20 : 15;
    const w = rows.some(r => r.head) ? 210 : 90, h = rows.length * rowH + 12;
    const x = W - w - 8, y = PANEL_Y - h - 4;
    const c = this.add.container(0, 0).setDepth(46);
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.97).fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(1, 0xf2c230).strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, 5);
    c.add(g);
    this.choiceTexts = rows.map((r, i) => {
      const ry = y + 6 + i * rowH + (rowH - 8) / 2;
      let tx = x + 18;
      if (r.head) { c.add(this.add.image(tx, ry + 4, 'ui', r.head).setOrigin(0, 0.5).setAlpha(r.disabled ? 0.4 : 1)); tx += 20; }
      const t = this.add.text(tx, ry, r.label, { fontFamily: FONT, fontSize: '8px', color: r.disabled ? '#5a6070' : '#ffffff' })
        .setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (this.menu === 'choice' && !r.disabled) { this.cursor = i; this.refreshChoice(); } });
      t.on('pointerdown', () => { if (this.menu === 'choice') this.pickChoice(i); });
      c.add(t);
      if (r.right) c.add(this.add.text(x + w - 10, ry, r.right, { fontFamily: FONT, fontSize: '8px', color: r.disabled ? '#5a6070' : '#cfd6ee' }).setOrigin(1, 0));
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
    const rows: ChoiceRow[] = this.party.map(f => ({
      label: `${f.name} Lv.${f.level}`,
      right: f.fainted ? 'KO' : `${f.hp}/${f.maxHp}`,
      head: `head_${f.def.id}`,
      disabled: !f.fainted,
    }));
    if (extra) rows.push(extra);
    return this.choose(title, rows, cancel);
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
    const rows: ChoiceRow[] = this.party.map(f => ({
      label: `${f.name} Lv.${f.level}`,
      right: f.fainted ? 'KO' : `${f.hp}/${f.maxHp}`,
      head: `head_${f.def.id}`,
      disabled: f.fainted,
    }));
    const i = await this.choose(`Heal who?`, rows, true);
    if (i < 0) { this.openFight(); return; }
    this.runTurn(move, this.party[i]);
  }

  private pickTeammate(title: string, cancel: boolean, allowActive = false, extra?: ChoiceRow): Promise<number> {
    const rows: ChoiceRow[] = this.party.map(f => ({
      label: `${f.name} Lv.${f.level}`,
      right: f.fainted ? 'KO' : `${f.hp}/${f.maxHp}`,
      head: `head_${f.def.id}`,
      disabled: (!allowActive && (f.fainted || f === this.player)),
    }));
    if (extra) rows.push(extra);
    return this.choose(title, rows, cancel);
  }

  /** Iemand anders in het veld zetten. Stat stages van wie eruit gaat worden gereset (zoals in Pokémon). */
  private async switchTo(next: Fighter, resetStages = true) {
    const prev = this.player;
    if (prev === next) return;
    if (resetStages) prev.stages = emptyStages();
    prev.stun = 0;
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
    await this.act(this.enemy, this.player, this.pickEnemyMove());
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
    let next = alive[0];
    if (alive.length > 1) next = this.party[await this.pickTeammate('Who goes next?', false)];
    await this.switchTo(next);
    return true;
  }

  /** EXP voor wie op de bank zit (Exp Share). KO-teamleden krijgen niks. */
  private async teamExp(exp: number) {
    if (this.expShare <= 0) return;
    const bench = this.party.filter(f => f !== this.player && !f.fainted);
    if (!bench.length) return;
    const share = Math.max(1, Math.floor(exp * this.expShare));
    await this.say(`The team got ${share} EXP from the Exp. Share!`, 300);
    for (const f of bench) {
      const before = f.level;
      if (f.gainExp(share)) await this.say(`${f.name} grew to Lv.${f.level}!`, 350);
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

  /** Wat voor vijand dit is, voor het label op de HP-box. */
  private enemyRank(): '' | 'BOSS' | 'ELITE' | 'RIVAL' {
    if (this.rival) return 'RIVAL';
    if (isBossWave(this.wave)) return 'BOSS';
    if (isEliteWave(this.wave)) return 'ELITE';
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
    const x = 8, y = PANEL_Y - 128, w = 300, h = 124;
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.96).fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(1, 0x4aa8ff).strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, 5);
    c.add(g);
    const txt = (tx: number, ty: number, s: string, color = '#ffffff') => {
      const t = this.add.text(tx, ty, s, { fontFamily: FONT, fontSize: '8px', color });
      c.add(t);
      return t;
    };
    const zone = zoneForWave(this.wave);
    txt(x + 10, y + 8, 'FIELD', '#4aa8ff');
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
    const m = typeMultiplier(this.player.type, this.enemy.type);
    const vs = `${this.player.type.toUpperCase()} vs ${this.enemy.type.toUpperCase()}: `;
    txt(x + 10, y + 106, vs + (m > 1 ? 'type advantage!' : m < 1 ? 'type disadvantage!' : 'neutral'),
      m > 1 ? '#3cff6a' : m < 1 ? '#ff9a2a' : '#9aa4c4');
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

  /** Einde van een beurt: zone-schade (Hot Crater). */
  private async endOfTurn() {
    const burn = this.fieldEffect?.burn;
    if (!burn || this.player.fainted) return;
    const dmg = Math.max(1, Math.floor(this.player.maxHp * burn));
    this.player.hp = Math.max(0, this.player.hp - dmg);
    this.hitFlash(this.hero);
    this.burst(this.hero.x, this.hero.y - 20, 0xff8a3a, 6);
    this.popNumber(this.hero.x, this.hero.y - this.hero.displayHeight - 4, `-${dmg}`, '#ff8a3a');
    await this.setBox(this.pBox, this.player, true);
    await this.say(`${this.player.name} is hurt by the heat!`, 300);
  }

  /** Kies een rival: liefst iemand die nog op slot zit en die je deze run nog niet tegenkwam. */
  private pickRival(): string | undefined {
    const others = HEROES.filter(h => !this.party.some(f => f.def.id === h) && FIGHTERS[h]);
    if (!others.length) return undefined;
    const fresh = others.filter(h => !this.rivalsMet.includes(h));
    const locked = fresh.filter(h => !isUnlocked(h));
    return Phaser.Utils.Array.GetRandom(locked.length ? locked : fresh.length ? fresh : others);
  }

  /** Vijand kiest een move. Een genees-move alleen als hij echt geraakt is. */
  private pickEnemyMove(): MoveDef {
    const moves = this.enemy.def.moves.map(m => MOVES[m]);
    const hurt = this.enemy.hp < this.enemy.maxHp * 0.5;
    const usable = moves.filter(m => !m.heal || hurt);
    return Phaser.Utils.Array.GetRandom(usable.length ? usable : moves);
  }

  /** "RIVAL!"-balk met het hoofdje van de rival (schuift van rechts in beeld). */
  private async rivalBanner() {
    const c = this.add.container(W + 10, 84).setDepth(45);
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.92).fillRect(0, 0, 250, 46);
    g.fillStyle(0xf2c230).fillRect(0, 0, 250, 4);
    g.fillStyle(0xc0392b).fillRect(0, 42, 250, 4);
    const head = this.add.image(18, 23, 'ui', `head_${this.enemy.def.id}`).setScale(2).setOrigin(0, 0.5);
    const t1 = this.add.text(62, 10, 'RIVAL!', { fontFamily: FONT, fontSize: '8px', color: '#e8443a' }).setScale(2);
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
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.94).fillRoundedRect(-120, -34, 240, 68, 6);
    g.lineStyle(2, 0xf2c230).strokeRoundedRect(-120, -34, 240, 68, 6);
    const head = this.add.image(-92, 0, 'ui', `head_${id}`).setScale(3);
    const t1 = this.add.text(-62, -14, name.toUpperCase(), { fontFamily: FONT, fontSize: '8px', color: '#ffd23a' }).setScale(2);
    const t2 = this.add.text(-62, 12, 'is now playable!', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' });
    c.add([g, head, t1, t2]);
    audio.sfx('confirm2', { volume: 0.8 });
    await this.tween({ targets: c, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.burst(W / 2, 100, 0xf2c230, 16);
    audio.sfx('ringchime');
    const lines: Record<string, string> = { sonic: 'sonicalright', tails: 'tailsalright', knuckles: 'knucklesalright', cream: 'creamalright', amy: 'amywohoo' };
    if (lines[id]) this.time.delayedCall(250, () => audio.voice(lines[id] as Parameters<typeof audio.voice>[0]));
    await this.say(`${name} is now unlocked!`, 900);
    await this.tween({ targets: c, scale: 0, duration: 250, ease: 'Back.easeIn' });
    c.destroy();
  }

  private async zoneBanner(name: string, act: number) {
    const c = this.add.container(-260, 84).setDepth(45);
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.92).fillRect(0, 0, 250, 46);
    g.fillStyle(0xc0392b).fillRect(0, 0, 250, 4);
    g.fillStyle(0xf2c230).fillRect(0, 42, 250, 4);
    const t1 = this.add.text(16, 12, name.toUpperCase(), { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setScale(2);
    const t2 = this.add.text(234, 30, `ZONE ${act}`, { fontFamily: FONT, fontSize: '8px', color: '#f2c230' }).setOrigin(1, 0);
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
    const lines: Record<string, string[]> = {
      sonic: ['sonicalright', 'sonicyeah'], tails: ['tailsalright', 'tailsyeah'],
      knuckles: ['knucklesalright', 'knucklescool'], cream: ['creamalright', 'creamyeah'], amy: ['amywohoo', 'amyyeah'],
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
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.88).fillRoundedRect(20, 28, W - 40, 72, 6);
    g.lineStyle(1, 0x5a6690).strokeRoundedRect(20.5, 28.5, W - 41, 71, 6);
    layer.add(g);
    layer.add(this.add.text(30, 34, 'SHOP', { fontFamily: FONT, fontSize: '8px', color: '#9aa4c4' }));
    layer.add(this.add.text(W / 2, 103, 'Choose a reward', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0).setShadow(1, 1, '#000', 0));
    this.rewardLayer = layer;
    this.tweens.add({ targets: this.pBox.root, alpha: 0, duration: 200 });
    this.showStatusPanel();
    this.buildShopRow();
    this.buildRewardRow();
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 200 });
    this.refreshCursor();
  }

  /** gele pijl boven het geselecteerde item */
  private makeArrow(y: number) {
    const a = this.add.triangle(0, y, 0, 0, 10, 0, 5, 6, 0xf2c230).setVisible(false);
    this.tweens.add({ targets: a, y: y + 3, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return a;
  }

  private buildRewardRow() {
    this.rewardCards.forEach(c => c.destroy());
    const afterBoss = isBossWave(this.wave);
    this.rewardChoices = Phaser.Utils.Array.Shuffle(REWARDS.filter(r =>
      (r.available?.(this.player) ?? true) && !(afterBoss && r.stage))).slice(0, 3);
    // is er iemand KO? dan zit de 1-Up er altijd tussen
    if (this.party.some(f => f.fainted) && !this.rewardChoices.some(r => r.id === 'oneup')) {
      this.rewardChoices[2] = REWARDS.find(r => r.id === 'oneup')!;
    }
    this.rewardCards = this.rewardChoices.map((r, i) => {
      const c = this.add.container(W / 2 + (i - 1) * 132, 162);
      const g = this.add.graphics();
      g.fillStyle(0x181b26).fillRoundedRect(-58, -40, 116, 80, 6);
      g.lineStyle(1, 0x5a6690).strokeRoundedRect(-57.5, -39.5, 115, 79, 6);
      const sel = this.add.graphics().lineStyle(2, 0xf2c230).strokeRoundedRect(-60, -42, 120, 84, 7).setVisible(false);
      const name = this.add.text(0, 10, r.name, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0);
      const desc = this.add.text(0, 24, r.desc, { fontFamily: FONT, fontSize: '8px', color: '#9aa4c4' }).setOrigin(0.5, 0);
      const mon = this.add.image(0, -16, 'ui', r.icon.replace('{hero}', this.player.def.id));
      this.tweens.add({ targets: mon, y: -19, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 180 });
      c.add([g, sel, name, desc, mon]);
      c.setSize(116, 80).setInteractive({ useHandCursor: true });
      c.on('pointerover', () => { if (this.menu === 'reward') { this.rewardRow = 0; this.cursor = i; this.refreshCursor(); } });
      c.on('pointerdown', () => { if (this.menu === 'reward') this.pickReward(i); });
      this.rewardLayer!.add(c);
      return c;
    });
  }

  /** Icoon voor een shop-item, getekend met sprites uit de ui-atlas. */
  private shopIcon(id: string): Phaser.GameObjects.GameObject[] {
    if (id === 'healthRing') return [this.add.sprite(0, 0, 'ui', 'ring_0').setScale(2).play('ring_spin')];
    if (id === 'superRing') return [
      this.add.sprite(-9, 2, 'ui', 'ring_0').setScale(2).play({ key: 'ring_spin', startFrame: 2 }),
      this.add.sprite(9, -2, 'ui', 'ring_0').setScale(2).play('ring_spin')];
    if (id === 'hyperRing') return [this.add.sprite(0, 0, 'ui', 'bigring_0').play('bigring_spin')];
    if (id === 'chiliDog') return [this.add.image(0, 2, 'chilidog').setScale(2)];
    if (id === 'revive') {
      // hoofdje van wie er KO is (of van je actieve character)
      const who = this.party.find(f => f.fainted) ?? this.player;
      return [this.add.image(0, 0, 'ui', `head_${who.def.id}`).setScale(1.5)];
    }
    // reroll
    return [this.add.sprite(0, 0, 'ui', 'monitor_random').setScale(1)];
  }

  private buildShopRow() {
    this.shopButtons.forEach(b => b.destroy());
    this.shopItems = shopStock(this.wave);
    const slots = [...this.shopItems.map(i => i.id), 'reroll'];
    const step = 80;
    const x0 = W / 2 - ((slots.length - 1) * step) / 2;
    this.shopButtons = slots.map((id, i) => {
      const b = this.add.container(x0 + i * step, 56);
      const shadow = this.add.ellipse(0, 16, 34, 7, 0x000000, 0.4);
      const arrow = this.makeArrow(-32);
      const price = this.add.text(0, 25, '', { fontFamily: FONT, fontSize: '8px', color: '#f2c230' });
      // klein ring-icoontje voor de prijs (het grote item-icoon is ook een ring)
      const coin = this.add.sprite(0, 29, 'ui', 'ring_0').setScale(0.5);
      arrow.setName('arrow'); price.setName('price'); coin.setName('coin');
      b.add([shadow, price, coin, ...this.shopIcon(id), arrow]); // pijl bovenop het icoon
      b.setSize(70, 60).setInteractive({ useHandCursor: true });
      b.on('pointerover', () => { if (this.menu === 'reward') { this.rewardRow = 1; this.cursor = i; this.refreshCursor(); } });
      b.on('pointerdown', () => { if (this.menu === 'reward') { this.rewardRow = 1; this.cursor = i; this.buyItem(i); } });
      this.rewardLayer!.add(b);
      return b;
    });
    this.updatePrices();
  }

  private rerollCost() { return (10 + this.wave) * 2 ** this.rerolls; }

  /** prijzen bijwerken: rood als je het niet kunt betalen; ring-icoontje links van het getal */
  private updatePrices() {
    this.shopButtons.forEach((b, i) => {
      const cost = i < this.shopItems.length ? this.shopItems[i].price : this.rerollCost();
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
    const isReroll = i === this.shopItems.length;
    const it = this.shopItems[i];
    const cost = isReroll ? this.rerollCost() : it?.price;
    if (cost === undefined) return;
    const btn = this.shopButtons[i];
    // niks om nu op te gebruiken en de tas is vol: dan niet kopen
    if (!isReroll && bagCount(this.bag) >= BAG_SIZE) {
      const nowUseless = it.revive ? !this.party.some(f => f.fainted) : this.player.hp >= this.player.maxHp;
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
    } else if (this.player.hp >= this.player.maxHp) {
      // volle HP: niks te healen, dus meteen de tas in
      this.bag[it.id] = (this.bag[it.id] ?? 0) + 1;
      this.msg.setText(`HP is full, so the ${it.name} went\nto your bag. (${bagCount(this.bag)}/${BAG_SIZE})`);
    } else {
      this.openPrompt(it, btn);
    }
    this.updatePrices();
    if (isReroll) this.refreshCursor();
  }

  /** Klein status-paneel rechtsonder: icoon, level en HP, zodat je ziet of healen loont. */
  private showStatusPanel() {
    this.statusPanel?.destroy();
    const p = this.player;
    const c = this.add.container(298, PANEL_Y + 6).setDepth(41);
    const g = this.add.graphics();
    g.fillStyle(0x2f3240).fillRoundedRect(0, 0, 176, 40, 4);
    g.lineStyle(1, 0x5a6690).strokeRoundedRect(0.5, 0.5, 175, 39, 4);
    const barW = 112;
    g.fillStyle(0x2a2f40).fillRect(54, 21, barW + 2, 6);
    const frac = p.hp / p.maxHp;
    const bar = this.add.rectangle(55, 22, barW * frac, 4, this.hpColor(frac)).setOrigin(0);
    c.add([g,
      this.add.image(6, 6, 'ui', `head_${p.def.id}`).setOrigin(0),
      this.add.text(28, 6, `${p.name}`, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }),
      this.add.text(168, 6, `Lv.${p.level}`, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(1, 0),
      this.add.text(28, 20, 'HP', { fontFamily: FONT, fontSize: '8px', color: '#f2c230' }),
      bar,
      this.add.text(168, 29, `${p.hp}/${p.maxHp}`, { fontFamily: FONT, fontSize: '8px', color: '#cfd6ee' }).setOrigin(1, 0),
    ]);
    this.statusPanel = c;
  }

  /** Na het kopen van een heal-item: meteen gebruiken of bewaren. (Straks met party: aan wie?) */
  private openPrompt(it: ItemDef, btn: Phaser.GameObjects.Container) {
    this.menu = 'buyprompt';
    this.promptItem = it;
    this.promptChoice = 0;
    const c = this.add.container(Phaser.Math.Clamp(btn.x, 70, W - 70), btn.y + 52).setDepth(45);
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.98).fillRoundedRect(-62, -4, 124, 44, 5);
    g.lineStyle(1, 0xf2c230).strokeRoundedRect(-61.5, -3.5, 123, 43, 5);
    const use = this.add.text(-44, 6, 'Use now', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setInteractive({ useHandCursor: true });
    const keep = this.add.text(-44, 22, 'Keep in bag', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setInteractive({ useHandCursor: true });
    const arrow = this.add.triangle(-56, 6, 0, 0, 0, 8, 5, 4, 0xffffff).setOrigin(0);
    use.on('pointerover', () => { this.promptChoice = 0; this.refreshPrompt(); });
    keep.on('pointerover', () => { this.promptChoice = 1; this.refreshPrompt(); });
    use.on('pointerdown', () => this.resolvePrompt(true));
    keep.on('pointerdown', () => this.resolvePrompt(false));
    c.add([g, use, keep, arrow]);
    this.prompt = c;
    this.shopButtons.forEach(b => (b.getByName('arrow') as Phaser.GameObjects.Triangle).setVisible(false));
    this.refreshPrompt();
  }

  private refreshPrompt() {
    if (!this.prompt || !this.promptItem) return;
    (this.prompt.getAt(3) as Phaser.GameObjects.Triangle).y = this.promptChoice === 0 ? 6 : 22;
    const p = this.player;
    this.msg.setText(this.promptChoice === 0
      ? `Use the ${this.promptItem.name} now?\n${p.name}: ${p.hp}/${p.maxHp} HP`
      : `Put the ${this.promptItem.name} in your bag\nto use it during a battle.`);
  }

  private resolvePrompt(useNow: boolean) {
    const it = this.promptItem;
    if (!it) return;
    if (!useNow && bagCount(this.bag) >= BAG_SIZE) {
      this.msg.setText(`Your bag is full! (${BAG_SIZE}/${BAG_SIZE})\nUse it now instead.`);
      audio.sfx('errorclick');
      return;
    }
    this.prompt?.destroy();
    this.prompt = undefined;
    this.promptItem = undefined;
    this.menu = 'reward';
    if (useNow) {
      const text = it.use(this.player);
      audio.sfx('heal1');
      this.showStatusPanel();
      const sp = this.add.sprite(this.statusPanel!.x + 16, this.statusPanel!.y + 14, 'ui', 'sparkle_0').setDepth(46).setScale(2).play('sparkle');
      sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
      this.refreshCursor();
      this.msg.setText(text);
    } else {
      this.bag[it.id] = (this.bag[it.id] ?? 0) + 1;
      this.refreshCursor();
      this.msg.setText(`The ${it.name} went to your bag.\n(${bagCount(this.bag)}/${BAG_SIZE} in bag)`);
    }
  }

  private async pickReward(i: number) {
    this.menu = 'busy';
    const r = this.rewardChoices[i];
    const text = r.apply(this.player);
    // shield-bubbel staat los van DEF-buffs; updateShield() is klaar voor een latere shield-mechaniek
    // monitor kapot: rookwolk + glinsters, net als in de game
    const card = this.rewardCards[i];
    const mon = card.getAt(4) as Phaser.GameObjects.Image;
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
    this.tweens.add({ targets: this.pBox.root, alpha: 1, duration: 200 });
    this.setBox(this.pBox, this.player, true);
    await this.say(text, 600);
    this.wave++;
    this.startWave();
  }
}
