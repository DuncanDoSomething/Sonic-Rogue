import Phaser from 'phaser';
import { BOOST_ON_HIT, FIGHTERS, Fighter, HEROES, MAX_BOOST, MOVES, MoveDef, REWARDS, RewardDef, StageKey, ULTIMATE_LEVEL, calcHit, catchUpMultiplier, emptyStages, expShareAfter, FLINCH_CHANCE, MAX_PARTY, movePower, stageMultiplier, typeMultiplier } from '../data/fighters';
import { EMERALDS, isBossWave, isEliteWave, canHaveRival, RIVAL_CHANCE, waveInZone, zoneForWave } from '../data/zones';
import { isUnlocked, unlock } from '../data/unlocks';
import { clearRun, fighterFromSave, fighterToSave, saveRun, type RunSave } from '../data/save';
import type { ZoneEffect } from '../data/zones';

/** true = bosses krijgen jouw type. Met een party van 3 kun je wisselen, dus nu uit. */
const BOSS_TYPE_NEUTRAL = false;
import { Backdrop } from './Backdrop';
import { ITEMS, ItemDef, shopStock } from '../data/items';
import { battleTimeScale, charDelay, holdFactor, settings } from '../data/settings';
import { addHelpButton, addMenuButton } from './ui';
import { audio, MusicKey } from '../audio';

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
  private fieldEffect?: ZoneEffect;
  private fieldText!: Phaser.GameObjects.Text;
  private fieldLayer?: Phaser.GameObjects.Container;
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
  private statsLayer!: Phaser.GameObjects.Container;
  private statsRows: Phaser.GameObjects.Text[] = [];

  /** move-info (C) */
  private infoLayer!: Phaser.GameObjects.Container;
  private infoTitle!: Phaser.GameObjects.Text;
  private infoBody!: Phaser.GameObjects.Text;

  constructor() { super('Battle'); }

  init(data: { party?: string[]; starter?: string; save?: RunSave }) {
    this.saved = data.save;
    this.partyIds = data.party?.length ? data.party : [data.starter ?? 'sonic'];
    this.cmdItems = [];
    this.statsRows = [];
    this.fightItems = [];
    this.bagItems = [];
    this.rewardCards = [];
    this.shopButtons = [];
    this.rewardLayer = undefined;
    this.bag = {};
  }

  // ---------------------------------------------------------------- setup
  create() {
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
    this.cmdLayer.add(this.add.text(12, PANEL_Y + 37, 'C: stats  V: field', { fontFamily: FONT, fontSize: '8px', color: '#6b7493' }));
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

  /** C in het hoofdmenu: je stats, inclusief buffs uit rewards. */
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
    rows.forEach(([l, r], i) => { this.statsRows[i * 2].setText(l); this.statsRows[i * 2 + 1].setText(r); });
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
      this.lastMove = this.cursor; this.toggleMoveInfo(false); this.runTurn(MOVES[id]);
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
    this.menu = 'busy';
    this.pointer.setVisible(false);
    this.bag[id]--;
    const item = ITEMS[id];
    await this.say(`${this.player.name} used a ${item.name}!`, 150);
    const sp = this.add.sprite(this.hero.x, this.hero.y - 40, 'ui', 'sparkle_0').setDepth(25).setScale(2).play('sparkle');
    sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
    const text = item.use(this.player);
    audio.sfx('heal1');
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
      bag: { ...this.bag }, rivalsMet: [...this.rivalsMet],
      active: Math.max(0, this.party.indexOf(this.player)), party: this.party.map(fighterToSave),
    });
  }

  private async startWave() {
    this.autoSave();
    this.menu = 'busy';
    this.pointer.setVisible(false);
    this.cmdLayer.setVisible(false);
    this.msg.setVisible(true).setText('');
    // vijand-box pas tonen als de vijand er is; jouw box meteen gevuld
    this.eBox.root.setAlpha(0);
    this.setBox(this.pBox, this.player, false);
    const zone = zoneForWave(this.wave);
    const boss = isBossWave(this.wave);
    const rivalId = canHaveRival(this.wave) && Math.random() < RIVAL_CHANCE ? this.pickRival() : undefined;
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
    this.applyZoneEffect(zone.effect);
    audio.playMusic(boss || this.rival ? 'boss' : (zone.backdrop as MusicKey));
    this.waveText.setText(`${zone.name} - Wave ${this.wave}`);
    this.hero.play(this.player.anim('idle'));
    if (firstOfZone) await this.zoneBanner(zone.name, Math.floor((this.wave - 1) / 10) + 1);
    if (firstOfZone && zone.effect) await this.say(`${zone.effect.name}! ${zone.effect.desc}.`, 700);
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
    this.openCommand();
  }

  private startHover() {
    this.foeHover?.stop();
    this.foe.setPosition(this.foeHome.x, this.foeHome.y);
    if (this.enemy.def.hover) {
      this.foeHover = this.tweens.add({ targets: this.foe, y: this.foeHome.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private async runTurn(playerMove: MoveDef) {
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
      if (this.flinched.has(att)) {
        await this.say(`${att === this.player ? '' : this.rival ? 'Rival ' : 'Foe '}${att.name} flinched and couldn't move!`, 400);
        continue;
      }
      if (att === this.player) { this.player.spendBoost(move); this.setBox(this.pBox, this.player, false); }
      await this.doAttack(att, tgt, move);
    }
    this.flinched.clear();

    if (this.enemy.fainted) return this.winWave();
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(); return; }
    await this.endOfTurn();
    if (this.player.fainted) { if (await this.handleFaint()) this.openCommand(); return; }
    this.openCommand();
  }

  private async doAttack(att: Fighter, tgt: Fighter, move: MoveDef) {
    const isPlayer = att === this.player;
    await this.say(`${isPlayer ? '' : this.rival ? 'Rival ' : 'Foe '}${att.name} used ${move.name}!`, 150);
    if (move.heal) return this.doHeal(att, move);
    const hit = calcHit(att, tgt, move);
    let struck = false;
    const strike = () => {
      if (hit.missed || struck) return;
      struck = true;
      tgt.hp = Math.max(0, tgt.hp - hit.damage);
      const spr = isPlayer ? this.foe : this.hero;
      const c = this.center(spr);
      this.burst(c.x, c.y, hit.crit ? 0xf2c230 : 0xffffff, hit.crit ? 16 : 10);
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
    else {
      if (hit.crit) await this.say('A critical hit!', 350);
      if (hit.effect > 1) await this.say("It's super effective!", 350);
      else if (hit.effect < 1) await this.say("It's not very effective...", 350);
      if (!hit.crit && hit.effect === 1) await this.wait(250);
      // moves die je eigen stats verhogen (Homing Attack: SPD +1)
      for (const [k, v] of Object.entries(move.selfStages ?? {})) {
        if (!att.fainted) await this.say(att.raise(k as StageKey, v), 300);
      }
      // Iron Fists (Knuckles): kans dat het doelwit zijn beurt verliest
      if (att.def.passive?.id === 'flinch' && !tgt.fainted && Math.random() < FLINCH_CHANCE) this.flinched.add(tgt);
    }
  }

  /** Genees-move (Chao Cheer): juich-animatie, glinsters, HP erbij. */
  private async doHeal(att: Fighter, move: MoveDef) {
    const isPlayer = att === this.player;
    const spr = isPlayer ? this.hero : this.foe;
    this.setActionSpeed(spr);
    const anim = this.playOnce(spr, att.anim('cheer'));
    audio.sfx('heal1');
    const c = this.center(spr);
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 90, () => {
        const sp = this.add.sprite(c.x + Phaser.Math.Between(-18, 18), c.y + Phaser.Math.Between(-20, 14), 'ui', 'sparkle_0').setDepth(15);
        sp.play('sparkle');
        sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
      });
    }
    await anim;
    await this.wait(250);
    this.setActionSpeed(null);
    const h = Math.min(att.maxHp - att.hp, Math.ceil(att.maxHp * (move.heal ?? 0)));
    att.hp += h;
    if (h > 0) this.popNumber(spr.x, spr.y - spr.displayHeight - 4, `+${h}`, '#7cf07c');
    await this.setBox(isPlayer ? this.pBox : this.eBox, att, true);
    spr.play(att.anim('idle'));
    await this.say(h > 0 ? `${att.name} healed ${h} HP!` : `${att.name}'s HP is already full!`, 400);
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

    if (move.anim !== 'hammer' && move.anim !== 'ultimate') audio.sfx(move.anim === 'dash' ? 'spindash' : 'jump', { volume: move.anim === 'dash' ? 0.6 : 0.8 });
    if (move.anim === 'spin') {
      s.play(p.anim('spin'));
      await this.tween({ targets: s, y: home.y - 20, duration: 140, ease: 'Quad.easeOut' });
      await this.tween({ targets: s, x: tx, y: ty, duration: 260, ease: 'Quad.easeIn' });
    } else if (move.anim === 'homing') {
      s.play(p.anim('spin'));
      await this.tween({ targets: s, y: home.y - 70, x: home.x + dir * 20, duration: 220, ease: 'Quad.easeOut' });
      await this.wait(120);
      const trail = this.time.addEvent({ delay: 25, repeat: 6, callback: () => this.ghost(s) });
      await this.tween({ targets: s, x: tx, y: ty - 10, duration: 150, ease: 'Linear' });
      trail.remove();
    } else if (move.anim === 'dash') {
      // Spin Dash: opladen op de plek, dan lanceren
      s.play(p.anim('spin'));
      s.anims.timeScale *= 2;
      const dust = this.time.addEvent({ delay: 60, repeat: 9, callback: () => this.burst(s.x - dir * 14, s.y - 4, 0xd8dde8, 3) });
      await this.tween({ targets: s, x: home.x - dir * 6, duration: 50, yoyo: true, repeat: 5 });
      dust.remove();
      const trail = this.time.addEvent({ delay: 20, repeat: 10, callback: () => this.ghost(s) });
      await this.tween({ targets: s, x: tx, y: ty, duration: 200, ease: 'Expo.easeIn' });
      trail.remove();
      s.anims.timeScale /= 2;
    } else if (move.anim === 'punch') {
      // Glove/Knuckle Punch: in één ruk naar het doelwit, stoot op het einde van de animatie
      s.play(p.anim('spin'));
      await this.tween({ targets: s, x: tx - dir * 30, y: ty, duration: 300, ease: 'Quad.easeInOut' });
      s.play(p.anim('punch'));
      await this.tween({ targets: s, x: tx - dir * 6, duration: 160, ease: 'Back.easeOut' });
      await this.wait(120);
    } else if (move.anim === 'fly') {
      // Copter Dive / Flutter Dive: omhoog vliegen, boven het doelwit hangen, dan duiken
      s.play(p.anim('fly'));
      await this.tween({ targets: s, y: home.y - 70, duration: 300, ease: 'Sine.easeOut' });
      await this.tween({ targets: s, x: tx - dir * 10, y: Math.max(ty - 55, s.displayHeight + 4), duration: 320, ease: 'Sine.easeInOut' });
      s.play(p.anim('spin'));
      const trail = this.time.addEvent({ delay: 25, repeat: 6, callback: () => this.ghost(s) });
      await this.tween({ targets: s, x: tx, y: ty, duration: 140, ease: 'Quad.easeIn' });
      trail.remove();
    } else if (move.anim === 'glide') {
      // Glide Attack: hoog opspringen, dan met de vuisten vooruit schuin naar het doelwit zweven
      s.play(p.anim('spin'));
      await this.tween({ targets: s, x: home.x - dir * 10, y: home.y - 80, duration: 260, ease: 'Quad.easeOut' });
      s.play(p.anim('glide'));
      const trail = this.time.addEvent({ delay: 40, repeat: 8, callback: () => this.ghost(s) });
      await this.tween({ targets: s, x: tx - dir * 4, y: ty + 4, duration: 420, ease: 'Sine.easeIn' });
      trail.remove();
    } else if (move.anim === 'hammer') {
      // Piko Hammer: aanrollen, dan de hamer omhoog en neer; raak op het moment dat hij de grond raakt
      s.play(p.anim('spin'));
      audio.sfx('jump', { volume: 0.6 });
      await this.tween({ targets: s, x: tx - dir * 46, y: ty, duration: 300, ease: 'Quad.easeInOut' });
      await this.playUntilFrame(s, p.anim('hammer'), '10_6');
      this.cameras.main.shake(140, 0.006);
      strike();
      await this.wait(260);
    } else if (move.anim === 'ultimate') {
      // ultimate: opladen in goud licht, dan drie bliksemsnelle treffers
      this.cameras.main.flash(250, 255, 240, 160);
      audio.sfx('spindash', { volume: 0.8 });
      s.play(p.anim('spin'));
      const glow = this.time.addEvent({ delay: 60, repeat: 9, callback: () => s.setTintFill(s.isTinted ? 0xffffff : 0xffd23a) });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const sp = this.add.sprite(s.x + Math.cos(a) * 40, s.y - 20 + Math.sin(a) * 40, 'ui', 'sparkle_0').setDepth(15).setScale(2).play('sparkle');
        this.tweens.add({ targets: sp, x: s.x, y: s.y - 20, duration: 450, onComplete: () => sp.destroy() });
      }
      await this.tween({ targets: s, y: home.y - 30, duration: 600, ease: 'Sine.easeOut' });
      glow.remove();
      s.clearTint();
      for (let i = 0; i < 3; i++) {
        const trail = this.time.addEvent({ delay: 20, repeat: 8, callback: () => this.ghost(s) });
        await this.tween({ targets: s, x: tx + dir * (i - 1) * 10, y: ty - 20 * i, duration: 120, ease: 'Quad.easeIn' });
        trail.remove();
        strike();
        const c = this.center(target);
        this.burst(c.x, c.y, i === 2 ? 0xffd23a : 0xffffff, 12);
        this.cameras.main.shake(120, 0.008);
        if (i < 2) await this.tween({ targets: s, x: tx - dir * 50, y: ty - 50, duration: 140, ease: 'Quad.easeOut' });
      }
    } else if (move.anim === 'twirl') {
      // Hammer Twirl: ronddraaiend met de hamer op het doelwit af
      s.play(p.anim('twirl'));
      const trail = this.time.addEvent({ delay: 50, repeat: 10, callback: () => this.ghost(s) });
      await this.tween({ targets: s, x: home.x + dir * 10, duration: 200, ease: 'Sine.easeInOut' });
      await this.tween({ targets: s, x: tx - dir * 18, y: ty, duration: 380, ease: 'Quad.easeIn' });
      trail.remove();
    }

    strike();
    if (missed) {
      await this.tween({ targets: s, x: tx + dir * 70, alpha: 0.5, duration: 160 });
      s.setAlpha(1).setPosition(home.x - dir * 40, home.y - 40);
      s.play(p.anim('spin'));
      await this.tween({ targets: s, x: home.x, y: home.y, duration: 260, ease: 'Bounce.easeOut' });
    } else {
      // terugstuiteren in een boog
      s.play(p.anim('spin'));
      await this.tween({ targets: s, x: (home.x + tx) / 2, y: home.y - 60, duration: 260, ease: 'Quad.easeOut' });
      await this.tween({ targets: s, x: home.x, y: home.y, duration: 240, ease: 'Quad.easeIn' });
    }
    s.play(p.anim('idle'));
  }

  private ghost(s: Phaser.GameObjects.Sprite) {
    const g = this.add.sprite(s.x, s.y, s.texture.key, s.frame.name).setOrigin(0.5, 1).setScale(s.scaleX)
      .setFlipX(s.flipX).setTint(0x6aa8ff).setAlpha(0.5).setDepth(4);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  /** Aanvallen van badniks. De stijl staat in de move (shoot / tackle / lash / slam). */
  private async foeAttack(move: MoveDef, strike: () => void, missed: boolean) {
    const b = this.foe;
    const e = this.enemy;
    this.foeHover?.stop();
    const heroC = this.center(this.hero);
    const attackAnim = e.anim('attack');

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
    this.hero.play(this.player.anim('victory'));
    this.victoryVoice();
    if (isBossWave(this.wave)) audio.playJingle('victory', zoneForWave(this.wave + 1).backdrop as MusicKey);
    this.spillRings(c.x, c.y, gained);

    const baseExp = this.enemy.def.expYield + this.enemy.level * 3;
    // loopt hij achter op de rest van het team? dan extra EXP om bij te trekken
    const catchUp = catchUpMultiplier(this.player, this.party);
    const exp = Math.round(baseExp * catchUp);
    const before = { level: this.player.level, exp: this.player.exp };
    const ups = this.player.gainExp(exp);
    this.pBox.expAnimating = true;
    this.say(`${this.player.name} got ${exp} EXP${catchUp > 1 ? ' (catch-up)' : ''} and ${gained} rings!`, 0);
    await this.animateExp(before.level, before.exp);
    if (ups) await this.say(`${this.player.name} grew to Lv.${this.player.level}!`, 500);
    await this.teamExp(baseExp);
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
    if (isBossWave(this.wave) && this.emeralds < EMERALDS.length) await this.awardEmerald(c.x, c.y);
    if (this.rival && unlock(this.enemy.def.id)) await this.unlockBanner(this.enemy.def.id, this.enemy.name);
    if (this.rival) await this.offerRivalJoin(this.enemy.def.id, this.enemy.level);
    const share = expShareAfter(this.wave);
    if (share > this.expShare) {
      this.expShare = share;
      audio.sfx('confirm2');
      await this.say(`Got the Exp. Share! Your team on the bench now gets ${Math.round(share * 100)}% EXP.`, 900);
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
    await this.doAttack(this.enemy, this.player, this.pickEnemyMove());
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

  /** EXP voor wie op de bank zit (Exp Share), met catch-up voor wie achterloopt. KO-teamleden krijgen niks. */
  private async teamExp(exp: number) {
    if (this.expShare <= 0) return;
    const bench = this.party.filter(f => f !== this.player && !f.fainted);
    if (!bench.length) return;
    const gains = bench.map(f => Math.max(1, Math.round(exp * this.expShare * catchUpMultiplier(f, this.party))));
    await this.say(`Exp. Share: ${bench.map((f, i) => `${f.name} +${gains[i]}`).join(', ')} EXP`, 300);
    for (const [i, f] of bench.entries()) {
      const before = f.level;
      if (f.gainExp(gains[i])) await this.say(`${f.name} grew to Lv.${f.level}!`, 350);
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
    } else if (this.player.hp >= this.player.maxHp) {
      // volle HP: niks te healen, dus meteen de tas in
      this.bag[it.id] = (this.bag[it.id] ?? 0) + 1;
      this.msg.setText(`HP is full, so the ${it.name} went\nto your bag. (${this.bag[it.id]} in bag)`);
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
      this.msg.setText(`The ${it.name} went to your bag.\n(${this.bag[it.id]} in bag)`);
    }
  }

  private async pickReward(i: number) {
    this.menu = 'busy';
    const r = this.rewardChoices[i];
    let text = r.apply(this.player);
    if (r.id === 'oneup') {
      const downed = this.party.filter(f => f.fainted);
      downed.forEach(f => { f.hp = Math.ceil(f.maxHp / 2); });
      if (downed.length) text += ` ${downed.map(f => f.name).join(' and ')} got back up!`;
    }
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
