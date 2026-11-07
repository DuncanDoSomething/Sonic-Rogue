import Phaser from 'phaser';
import { BOSS_HEROES, FIGHTERS, Fighter, MAX_PARTY, MOVES } from '../data/fighters';
import { buildCharacterInfo } from './characterInfo';
import { addMenuButton } from './ui';
import { HUD, sonicPanel } from './hud';
import { audio } from '../audio';
import { isUnlocked } from '../data/unlocks';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

/** Volgorde in het select-scherm. Alleen Sonic is open; de rest unlock je door ze als rival te verslaan. */
const ROSTER = ['sonic', 'tails', 'knuckles', 'cream', 'amy', 'shadow'];
const PANEL_W = 200;
const ART = { x: 100, y: 150 };
/** Rijen: eerste y en stap (6 characters passen net boven het info-paneel). */
const ROW_Y = 42, ROW_STEP = 25;


/** Character select in Sonic Advance 3-stijl: zand-paneel, draaiende naamring, groot portret. */
export class CharSelectScene extends Phaser.Scene {
  private cursor = 0;
  private leaving = false;
  private ring!: Phaser.GameObjects.Image;
  private art!: Phaser.GameObjects.Image;
  private rows: Phaser.GameObjects.Container[] = [];
  private arrow!: Phaser.GameObjects.Sprite;
  private info!: Phaser.GameObjects.Container;
  /** gekozen team, in volgorde (de eerste begint) */
  private picked: string[] = [];
  private badges: Phaser.GameObjects.Text[] = [];
  /** team-balkje linksboven: een vakje per plek, met het hoofdje van wie erin zit */
  private slots: Array<{ x: number; y: number; num: Phaser.GameObjects.Text; head: Phaser.GameObjects.Image }> = [];
  /** knipperende rand om het volgende lege vakje */
  private slotGlow!: Phaser.GameObjects.Graphics;
  /** C: overzicht van alles wat het character kan (passive, moves, ultimate) */
  private detail?: Phaser.GameObjects.Container;

  constructor() { super('CharSelect'); }

  private unlocked(id: string) { return !!FIGHTERS[id] && isUnlocked(id); }

  create() {
    this.cursor = 0;
    this.leaving = false;
    this.rows = [];
    this.picked = [];
    this.badges = [];
    this.slots = [];
    this.cameras.main.fadeIn(300, 255, 255, 255);
    // twee character select-tracks, elke keer willekeurig één (loopt door als hij al speelt)
    audio.playMusic(Math.random() < 0.5 ? 'charselect' : 'charselect2');

    // blauwe S-tegels (Advance 2) die schuin wegscrollen
    const tile = this.add.tileSprite(0, 0, W, H, 'cs_tile').setOrigin(0);
    this.tweens.add({ targets: tile, tilePositionX: 256, tilePositionY: 256, duration: 12000, repeat: -1 });

    // zand-paneel links met de zigzag-rand (Advance 3), scrollt langzaam omlaag
    const sand = this.add.tileSprite(0, 0, PANEL_W, H, 'cs_sand').setOrigin(0);
    sand.tilePositionX = 240 - PANEL_W;
    this.tweens.add({ targets: sand, tilePositionY: -160, duration: 6000, repeat: -1 });

    // naamring + portret
    this.ring = this.add.image(ART.x, ART.y - 22, 'cs_ring_sonic').setScale(2);
    this.tweens.add({ targets: this.ring, angle: 360, duration: 9000, repeat: -1 });
    this.art = this.add.image(ART.x, ART.y, 'cs_art_sonic').setScale(2).setOrigin(0.5, 0.75);
    this.tweens.add({ targets: this.art, y: ART.y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // titel: "PICK YOUR TEAM" in dezelfde pil-stijl als Advance 2's "SELECT A CHARACTER"
    this.add.image(W - 8, 16, 'cs_team_pill').setOrigin(1, 0.5);

    // rijen: banner + icoon + naam
    ROSTER.forEach((id, i) => {
      const open = this.unlocked(id);
      const y = ROW_Y + i * ROW_STEP;
      const c = this.add.container(W - 132, y);
      const banner = this.add.image(0, 0, open ? `cs_banner_${id}` : 'cs_banner_unknown').setScale(2).setOrigin(0, 0.5);
      const head = this.add.image(10, 0, 'ui', `head_${id}`).setOrigin(0, 0.5);
      if (!open) head.setTint(0x2a2f40);
      const name = this.add.image(34, 0, open ? `cs_name_${id}` : 'cs_name_unknown').setOrigin(0, 0.5);
      // nummer 1/2/3 als hij in je team zit
      const badge = this.add.text(112, 0, '', { fontFamily: FONT, fontSize: '8px', color: '#ffd23a', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
      this.badges.push(badge);
      c.add([banner, head, name, badge]);
      c.setSize(124, 32).setInteractive(new Phaser.Geom.Rectangle(0, -16, 124, 32), Phaser.Geom.Rectangle.Contains);
      c.on('pointerover', () => { if (!this.leaving && this.cursor !== i) { this.cursor = i; this.moved(); } });
      c.on('pointerdown', () => { if (!this.leaving) { this.cursor = i; this.confirm(); } });
      this.rows.push(c);
    });
    // cursor: draaiende ring, net als in het gevecht
    this.arrow = this.add.sprite(0, 0, 'ui', 'ring_0').setOrigin(0, 0.5).setScale(0.75).play('ring_spin');

    // info-paneel
    this.info = this.add.container(PANEL_W + 10, 184);

    this.add.text(PANEL_W + 10, H - 12, 'Z add to team  X undo  I info', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
      .setShadow(1, 1, '#000', 0);
    this.buildTeamTray();
    addMenuButton(this, W - 12, H - 12, () => this.openSettings());

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (this.leaving) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'w'].includes(k)) { this.cursor = Phaser.Math.Wrap(this.cursor - 1, 0, ROSTER.length); this.moved(); }
      else if (['arrowdown', 's'].includes(k)) { this.cursor = Phaser.Math.Wrap(this.cursor + 1, 0, ROSTER.length); this.moved(); }
      else if (k === 'c' || k === 'i') this.toggleDetail();
      else if (['x', 'escape', 'backspace'].includes(k) && this.detail) this.toggleDetail(false);
      else if (['z', 'enter', ' '].includes(k)) { this.toggleDetail(false); this.confirm(); }
      else if (['x', 'escape', 'backspace'].includes(k)) this.back();
      else if (k === 'm') this.openSettings();
    });
    this.refresh();
    this.refreshTeam();
  }

  private refresh() {
    const id = ROSTER[this.cursor];
    const open = this.unlocked(id);
    this.rows.forEach((r, i) => {
      const sel = i === this.cursor;
      this.tweens.killTweensOf(r);
      this.tweens.add({ targets: r, x: W - 132 - (sel ? 16 : 0), duration: 120 });
      r.setAlpha(sel ? 1 : 0.8);
    });
    const row = this.rows[this.cursor];
    this.arrow.setPosition(W - 160, row.y);

    this.ring.setTexture(open ? `cs_ring_${id}` : 'cs_ring_unknown');
    this.art.setTexture(`cs_art_${id}`);
    if (open) this.art.clearTint().setAlpha(1); else this.art.setTint(0x000000).setAlpha(0.85);
    // klein "pop"-effect bij wisselen
    this.art.setScale(1.8);
    this.tweens.add({ targets: this.art, scale: 2, duration: 140, ease: 'Back.easeOut' });

    this.info.removeAll(true);
    const g = sonicPanel(this.add.graphics(), 0, 0, W - PANEL_W - 20, 62, 'blue', 0.95);
    this.info.add(g);
    if (!open) {
      this.info.add(this.add.text(10, 10, 'LOCKED', { fontFamily: FONT, fontSize: '8px', color: '#e8443a' }));
      // Shadow is geen rival maar een zeldzame boss (soms in plaats van Eggman)
      const how = BOSS_HEROES.includes(id) ? 'A rare boss: he can\ntake Eggman\'s place.\nBeat him to recruit him!' : 'Beat them as a rival\n(wave 15, 25, 35...)\nto recruit them!';
      this.info.add(this.add.text(10, 24, how, { fontFamily: FONT, fontSize: '8px', color: '#cfd6ee', lineSpacing: 4 }));
      return;
    }
    const f = new Fighter(id, 5);
    const stats: Array<[string, number]> = [['HP', f.maxHp], ['ATK', f.atk], ['DEF', f.dfn], ['SPD', f.spd]];
    stats.forEach(([k, v], i) => {
      const y = 8 + i * 13;
      this.info.add(this.add.text(10, y, k, { fontFamily: FONT, fontSize: '8px', color: HUD.label }));
      // balk met een donker spoor erachter, zoals de HP-balk in het gevecht
      const bar = this.add.graphics();
      bar.fillStyle(HUD.outline).fillRect(43, y + 1, 82, 6);
      bar.fillStyle(HUD.pipEmpty).fillRect(44, y + 2, 80, 4);
      bar.fillStyle(HUD.cyan).fillRect(44, y + 2, Math.min(80, Math.round(v * 1.9)), 4);
      this.info.add(bar);
    });
    this.info.add(this.add.text(138, 8, f.def.moves.map(m => MOVES[m].name).join('\n'),
      { fontFamily: FONT, fontSize: '8px', color: '#ffffff', lineSpacing: 5 }));
    if (f.def.passive) this.info.add(this.add.text(138, 47, f.def.passive.name, { fontFamily: FONT, fontSize: '8px', color: '#f2c230' }));
  }

  /** cursor verplaatst: tikje + de narrator roept de naam (alleen unlocked characters) */
  private moved() {
    audio.sfx('cursormove');
    const id = ROSTER[this.cursor];
    if (this.unlocked(id)) audio.voice(`call_${id}` as Parameters<typeof audio.voice>[0], 0.8);
    this.refresh();
    if (this.detail) this.buildDetail();
  }

  /** Hoeveel je er moet kiezen: 3, of minder als je nog niet zoveel characters hebt. */
  private get teamSize() { return Math.min(MAX_PARTY, ROSTER.filter(id => this.unlocked(id)).length); }

  /**
   * Team-balkje: "TEAM" en een leeg vakje per plek (meestal 3), zodat je meteen ziet hoeveel je er kiest.
   * Het volgende lege vakje knippert; gekozen characters vliegen erin.
   */
  private buildTeamTray() {
    const n = this.teamSize;
    const SLOT = 20, GAP = 3, LABEL = 38;
    const w = 6 + LABEL + n * SLOT + (n - 1) * GAP + 6;
    const x0 = PANEL_W + 6, y0 = 4, h = 26;
    sonicPanel(this.add.graphics(), x0, y0, w, h, 'blue', 0.95);
    this.add.text(x0 + 8, y0 + h / 2, 'TEAM', { fontFamily: FONT, fontSize: '8px', color: HUD.label }).setOrigin(0, 0.5);
    const g = this.add.graphics();
    for (let i = 0; i < n; i++) {
      const x = x0 + 6 + LABEL + i * (SLOT + GAP), y = y0 + 3;
      g.fillStyle(HUD.outline).fillRoundedRect(x, y, SLOT, SLOT, 3);
      g.fillStyle(HUD.pipEmpty).fillRoundedRect(x + 1, y + 1, SLOT - 2, SLOT - 2, 2);
      const num = this.add.text(x + SLOT / 2, y + SLOT / 2 + 1, `${i + 1}`, { fontFamily: FONT, fontSize: '8px', color: HUD.muted }).setOrigin(0.5);
      const head = this.add.image(x + SLOT / 2, y + SLOT / 2, 'ui', 'head_sonic').setVisible(false);
      this.slots.push({ x: x + SLOT / 2, y: y + SLOT / 2, num, head });
    }
    // uitleg eronder
    const what = n === 1 ? 'Pick your character.' : `Pick ${n} characters.\nThe 1st one starts.`;
    this.add.text(x0 + 4, y0 + h + 6, what, { fontFamily: FONT, fontSize: '8px', color: '#ffffff', lineSpacing: 4, stroke: '#141a6c', strokeThickness: 3 });
    this.slotGlow = this.add.graphics();
    this.tweens.add({ targets: this.slotGlow, alpha: 0.25, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private refreshTeam() {
    this.badges.forEach((b, i) => { const n = this.picked.indexOf(ROSTER[i]); b.setText(n >= 0 ? `${n + 1}` : ''); });
    this.slots.forEach((sl, i) => {
      const id = this.picked[i];
      sl.head.setVisible(!!id);
      if (id) sl.head.setFrame(`head_${id}`);
      sl.num.setVisible(!id);
    });
    this.slotGlow.clear();
    const next = this.slots[this.picked.length];
    if (next) this.slotGlow.lineStyle(2, HUD.gold).strokeRoundedRect(next.x - 11, next.y - 11, 22, 22, 4);
  }

  /** Het hoofdje vliegt van de rij naar zijn vakje. */
  private flyToSlot(id: string, slot: number) {
    const sl = this.slots[slot];
    const row = this.rows[ROSTER.indexOf(id)];
    if (!sl || !row) return;
    sl.head.setVisible(false);
    const fly = this.add.image(row.x + 18, row.y, 'ui', `head_${id}`).setDepth(5).setScale(1.5);
    this.tweens.add({
      targets: fly, x: sl.x, y: sl.y, scale: 1, duration: 260, ease: 'Cubic.easeInOut',
      onComplete: () => {
        fly.destroy();
        if (this.picked[slot] !== id) return;
        sl.head.setVisible(true).setScale(1.5);
        this.tweens.add({ targets: sl.head, scale: 1, duration: 160, ease: 'Back.easeOut' });
      },
    });
  }

  /** Z: character in je team zetten (of eruit halen). Is het team vol, dan begint de run. */
  private confirm() {
    const id = ROSTER[this.cursor];
    if (!this.unlocked(id)) {
      this.cameras.main.shake(120, 0.004);
      audio.sfx('errorclick');
      return;
    }
    const at = this.picked.indexOf(id);
    if (at >= 0) { this.picked.splice(at, 1); audio.sfx('back'); this.refreshTeam(); return; }
    this.picked.push(id);
    this.refreshTeam();
    this.flyToSlot(id, this.picked.length - 1);
    if (this.picked.length < this.teamSize) {
      audio.sfx('confirm');
      const lines: Record<string, string> = { sonic: 'sonicalright', tails: 'tailsalright', knuckles: 'knucklesalright', cream: 'creamalright', amy: 'amywohoo', shadow: 'shadowhuh' };
      if (lines[id]) audio.voice(lines[id] as Parameters<typeof audio.voice>[0]);
      this.tweens.add({ targets: this.art, y: ART.y - 12, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
      return;
    }
    this.leaving = true;
    audio.sfx('confirm2');
    // "Alright!" (Amy: "Woohoo!") zoals in Advance 2
    const lines: Record<string, string> = { sonic: 'sonicalright', tails: 'tailsalright', knuckles: 'knucklesalright', cream: 'creamalright', amy: 'amywohoo', shadow: 'shadowhah' };
    if (lines[id]) this.time.delayedCall(120, () => audio.voice(lines[id] as Parameters<typeof audio.voice>[0]));
    // ring wordt "OK" en draait snel, portret springt
    this.ring.setTexture('cs_ring_ok');
    this.tweens.add({ targets: this.ring, angle: this.ring.angle + 720, duration: 700, ease: 'Cubic.easeIn' });
    this.tweens.add({ targets: this.art, y: ART.y - 24, duration: 180, yoyo: true, ease: 'Quad.easeOut' });
    const s = this.add.sprite(ART.x, ART.y - 60, 'ui', 'sparkle_0').setScale(3).play('sparkle');
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
    this.time.delayedCall(550, () => {
      this.cameras.main.fadeOut(300, 255, 255, 255);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.input.keyboard!.removeAllListeners();
        this.scene.start('Battle', { party: [...this.picked] });
      });
    });
  }

  private back() {
    if (this.picked.length) { this.picked.pop(); audio.sfx('back'); this.refreshTeam(); return; }
    this.leaving = true;
    audio.sfx('back');
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.input.keyboard!.removeAllListeners();
      this.scene.start('Title');
    });
  }

  /** C: het overzicht open/dicht. */
  private toggleDetail(show = !this.detail) {
    if (!show) {
      if (this.detail) audio.sfx('back');
      this.detail?.destroy();
      this.detail = undefined;
      return;
    }
    audio.sfx('confirm');
    this.buildDetail();
  }

  /** Passive, moves en ultimate van het character waar de cursor op staat. */
  private buildDetail() {
    this.detail?.destroy();
    const id = ROSTER[this.cursor];
    this.detail = buildCharacterInfo(this, id, {
      locked: !this.unlocked(id),
      footer: 'I / X close    Up / Down other characters',
      onClose: () => this.toggleDetail(false),
    });
  }

  private openSettings() {
    this.scene.pause();
    this.scene.launch('Settings', { from: this.scene.key });
  }
}

