import Phaser from 'phaser';
import { TEST_MODE } from '../data/testMode';
import { Mode7 } from './Mode7';
import { audio } from '../audio';
import { clearRun, loadRun } from '../data/save';
import { FIGHTERS } from '../data/fighters';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

/** Bij het skippen van de intro springt de title-muziek naar deze seconde (zoals in Advance 2). */
const TITLE_MUSIC_SKIP_TO = 14;

/** y van de lucht op het title screen (eind van de intro-kanteling) */
const SKY_END = -60;

type Phase = 'boot' | 'intro' | 'press' | 'menu' | 'continue' | 'leaving';

/** Na de eerste keer (geluid ontgrendeld) slaan we het "press any button"-scherm over. */
let booted = false;

/**
 * Intro + title screen, nagemaakt naar de opening van Sonic Advance 2:
 * 1. vlucht over de zee (Mode 7) terwijl de credit-kaarten verschijnen,
 * 2. de camera kantelt in één vloeiende beweging omhoog: eiland, zee en lucht bewegen samen,
 * 3. Sonic raast over het water, de camera schiet de lucht in, het logo valt erin.
 */
export class TitleScene extends Phaser.Scene {
  private phase: Phase = 'boot';
  private sky!: Phaser.GameObjects.Image;
  private sea?: Mode7;
  private logo!: Phaser.GameObjects.Container;
  private press!: Phaser.GameObjects.Image;
  private items: Array<{ off: Phaser.GameObjects.Image; on: Phaser.GameObjects.Image; act: () => void }> = [];
  private cursor = 0;
  private introTimers: Phaser.Time.TimerEvent[] = [];
  private introTweens: Phaser.Tweens.Tween[] = [];
  private bootLayer?: Phaser.GameObjects.Container;
  /** zon-gloed, lens flares en zeemeeuwen boven de zee */
  private seaFx?: Phaser.GameObjects.Container;
  private flares: Phaser.GameObjects.Image[] = [];
  private fxTime = 0;

  /** true als je via Save & Quit terugkomt: dan meteen naar het menu, zonder intro */
  private toMenu = false;

  constructor() { super('Title'); }

  init(data: { toMenu?: boolean }) { this.toMenu = !!data?.toMenu; }

  create() {
    this.phase = 'boot';
    this.horizonY = 46;
    this.items = [];
    this.cursor = 0;
    this.introTimers = [];
    this.introTweens = [];
    this.cameras.main.setBackgroundColor('#ffffff');

    // Lucht: 256x512 op 2x. De onderkant (eiland) komt straks precies op de horizon.
    this.sky = this.add.image(W / 2, 0, 'title_sky').setOrigin(0.5, 0).setScale(2).setVisible(false);
    this.sea = new Mode7(this, 'intro_water', W, H, 1);
    this.buildSeaFx();
    this.events.once('shutdown', () => { this.sea?.destroy(); this.sea = undefined; });

    this.buildLogo();
    this.press = this.add.image(W / 2, 214, 'label_press_start').setAlpha(0).setDepth(10);
    this.buildMenu();
    if (TEST_MODE) {
      this.add.text(W / 2, 4, 'TEST MODE: everyone unlocked, nothing is saved', { fontFamily: FONT, fontSize: '8px', color: '#ff6a5a', stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5, 0).setDepth(70);
    }

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e.key.toLowerCase()));
    this.input.on('pointerdown', () => { if (this.phase !== 'menu') this.advance(); });
    this.events.on('resume', () => this.input.keyboard!.resetKeys());

    if (this.toMenu) { this.startIntro(); this.finishIntro(); this.toPress(); this.openMenu(); }
    else if (booted) this.startIntro();
    else this.showBoot();
  }

  update(_t: number, dt: number) {
    this.sea?.update(dt);
    this.updateSeaFx(dt);
    // één camera: zee, eiland/lucht, zon en meeuwen hangen allemaal aan dezelfde horizon
    if (this.sea) this.sea.horizon = this.horizonY;
    if (this.sky.visible) this.sky.y = this.horizonY - this.sky.displayHeight + 6;
  }

  // ---------------------------------------------------------------- boot
  /** Browsers spelen pas geluid na een klik of toets; dit scherm vangt die eerste klik. */
  private showBoot() {
    const c = this.add.container(0, 0).setDepth(60);
    c.add(this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0));
    const t = this.add.text(W / 2, H / 2, 'PRESS ANY BUTTON', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5);
    this.tweens.add({ targets: t, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });
    c.add(t);
    this.bootLayer = c;
  }

  private startIntro() {
    booted = true;
    this.bootLayer?.destroy();
    this.bootLayer = undefined;
    this.phase = 'intro';
    audio.playMusic('title', false); // speelt één keer, net als in Advance 2
    this.playCards();
  }

  // ---------------------------------------------------------------- intro
  /**
   * Zon links in beeld met een rij lens flares die er schuin vanaf lopen, plus zeemeeuwen
   * die langzaam overvliegen. Alles uit de Advance 2-intro (sheet 198005).
   */
  private buildSeaFx() {
    const c = this.add.container(0, 0).setDepth(2);
    this.bloom = this.add.image(0, 70, 'intro_bloom').setOrigin(0, 0.5).setScale(2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
    c.add(this.bloom);
    // volgorde langs de lijn: groot vlak bij de zon, kleine in het midden, middelgroot aan het eind
    this.flares = [0, 2, 4, 6, 1].map(i =>
      this.add.image(0, 0, `intro_flare_${i}`).setScale(1.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.45));
    c.add(this.flares);
    for (let i = 0; i < 4; i++) {
      const b = this.add.sprite(W + 30 + i * 70, 0, 'intro_bird_0').setScale(2).play({ key: 'intro_bird', startFrame: i % 2 });
      b.setData('base', Phaser.Math.Between(60, 120)).setData('speed', Phaser.Math.FloatBetween(0.025, 0.04)).setData('phase', i * 1.7);
      c.add(b);
    }
    this.fxTime = 0;
    this.seaFx = c;
    this.events.once('shutdown', () => { this.seaFx = undefined; this.flares = []; });
  }

  private updateSeaFx(dt: number) {
    const c = this.seaFx;
    if (!c || !c.active) return;
    this.fxTime += dt;
    c.y = this.horizonY - 46; // zakt mee als de camera omhoog kantelt
    // de flares liggen op een lijn van de zon naar rechtsonder en zwenken een beetje mee
    const sway = Math.sin(this.fxTime / 1400) * 18;
    const sx = 10, sy = 70, ex = W * 0.86, ey = H * 0.78 + sway;
    this.flares.forEach((f, i) => {
      const t = 0.18 + (i / (this.flares.length - 1)) * 0.82;
      f.setPosition(sx + (ex - sx) * t, sy + (ey - sy) * t);
    });
    for (const o of c.list) {
      if (!(o instanceof Phaser.GameObjects.Sprite)) continue;
      o.x -= dt * (o.getData('speed') as number);
      o.y = (o.getData('base') as number) + Math.sin(this.fxTime / 500 + (o.getData('phase') as number)) * 4;
      if (o.x < -30) { o.x = W + Phaser.Math.Between(20, 140); o.setData('base', Phaser.Math.Between(56, 130)); }
    }
  }

  private clearSeaFx() {
    this.seaFx?.destroy();
    this.seaFx = undefined;
    this.flares = [];
  }

  /** Kaart in Advance 2-stijl: klein donker kopje + grote blauwe titel, boven de zee. */
  private makeCard(small: string, big: string, extra?: string) {
    const c = this.add.container(0, 0).setDepth(50);
    c.add(this.add.text(W / 2, H / 2 - 30, small, {
      fontFamily: FONT, fontSize: '8px', color: '#2a2a2a', stroke: '#ffffff', strokeThickness: 4,
    }).setOrigin(0.5));
    c.add(this.add.text(W / 2, H / 2 + 4, big, {
      fontFamily: FONT, fontSize: '32px', color: '#0f3fb8', stroke: '#ffffff', strokeThickness: 8,
    }).setOrigin(0.5));
    if (extra) {
      c.add(this.add.text(W / 2, H / 2 + 38, extra, {
        fontFamily: FONT, fontSize: '8px', color: '#2a2a2a', stroke: '#ffffff', strokeThickness: 4,
      }).setOrigin(0.5));
    }
    return c;
  }

  /** Rechten-kaart, op een licht paneel zodat hij leesbaar blijft boven het water. */
  private makeRightsCard() {
    const c = this.add.container(0, 0).setDepth(50);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.85).fillRoundedRect(W / 2 - 170, 52, 340, 172, 8);
    c.add(g);
    const lines: Array<[string, string]> = [
      ['Sonic the Hedgehog and all characters', '#0a1450'],
      ['(c) SEGA / Sonic Team', '#0a1450'],
      ['', ''],
      ['Sprites from the Sonic Advance series,', '#3a4258'],
      ['ripped by the community at', '#3a4258'],
      ['The Spriters Resource. Thank you!', '#3a4258'],
      ['', ''],
      ['Non-commercial fan game.', '#c0392b'],
      ['Not affiliated with SEGA.', '#c0392b'],
    ];
    lines.forEach(([t, col], i) => c.add(this.add.text(W / 2, 74 + i * 16, t, { fontFamily: FONT, fontSize: '8px', color: col }).setOrigin(0.5)));
    return c;
  }

  /** Kaarten na elkaar boven de zee, daarna kantelt de camera naar het eiland. */
  private playCards() {
    const cards = [
      this.makeCard('INSPIRED BY', 'POKÉROGUE'),
      this.makeCard('A FAN GAME BY', 'MOE', 'thanks for playing!'),
      this.makeRightsCard(),
    ];
    const holds = [1600, 1600, 2600];
    cards.forEach(c => c.setAlpha(0));
    this.cameras.main.flash(500, 255, 255, 255);
    let t = 500;
    cards.forEach((c, i) => {
      this.introTimers.push(this.time.delayedCall(t, () => {
        this.introTweens.push(this.tweens.add({ targets: c, alpha: 1, duration: 300 }));
      }));
      t += 300 + holds[i];
      this.introTimers.push(this.time.delayedCall(t, () => {
        this.introTweens.push(this.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => c.destroy() }));
      }));
      t += 350;
    });
    this.introTimers.push(this.time.delayedCall(t, () => this.tiltToIsland()));
  }

  /**
   * Zoals in Advance 2: één doorlopende kanteling van de camera omhoog, die steeds sneller gaat.
   * Het eiland komt uit de nevel op de horizon, de zee zakt weg uit beeld en de lucht schuift
   * door tot het logo. Sonic en Tails rennen voorbij zolang er nog water onderin staat.
   */
  private tiltToIsland() {
    this.sky.setVisible(true).setAlpha(0);
    this.introTweens.push(this.tweens.add({ targets: this.sky, alpha: 1, duration: 500 }));
    // zon-gloed en flares vervagen; de meeuwen blijven en zakken mee met de wereld
    this.introTweens.push(this.tweens.add({ targets: [this.bloom, ...this.flares].filter(Boolean), alpha: 0, duration: 1400 }));
    const from = this.horizonY;
    const to = SKY_END + this.sky.displayHeight - 6; // lucht eindigt op SKY_END, zoals het title screen
    const pan = { t: 0 };
    this.introTweens.push(this.tweens.add({
      // langzaam beginnen, steeds sneller, en vlak voor het title screen zacht afremmen
      targets: pan, t: 1, duration: 4000, ease: (t: number) => t ** 4 * (5 - 4 * t),
      onUpdate: () => { this.horizonY = from + (to - from) * pan.t; },
      onComplete: () => this.showLogo(),
    }));
    this.introTimers.push(this.time.delayedCall(700, () => this.dashAcross()));
  }

  /** Sonic raast over het water met Tails erachteraan. */
  private dashAcross() {
    const sonic = this.add.sprite(-60, 258, 'sonic').setOrigin(0.5, 1).setScale(2).setFlipX(true).setDepth(5).play('sonic_run');
    const tails = this.add.sprite(-160, 214, 'tails').setOrigin(0.5, 1).setScale(2).setFlipX(true).setDepth(4).play('tails_fly');
    audio.sfx('spindash', { volume: 0.5 });
    const trail = this.time.addEvent({
      delay: 30, loop: true, callback: () => {
        const g = this.add.sprite(sonic.x, sonic.y, 'sonic', sonic.frame.name).setOrigin(0.5, 1).setScale(2).setFlipX(true)
          .setTint(0x6aa8ff).setAlpha(0.45).setDepth(4);
        this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
        // waterspetters achter Sonic
        const d = this.add.image(sonic.x - 20, sonic.y - 2, 'px').setTint(0xffffff).setDepth(4).setScale(Phaser.Math.Between(1, 2));
        this.tweens.add({ targets: d, x: d.x - 20, y: d.y - Phaser.Math.Between(6, 16), alpha: 0, duration: 300, onComplete: () => d.destroy() });
      },
    });
    this.introTimers.push(trail);
    this.introTweens.push(this.tweens.add({ targets: sonic, x: W + 80, duration: 900, ease: 'Linear' }));
    this.introTweens.push(this.tweens.add({ targets: tails, x: W + 80, y: 170, duration: 1400, delay: 200, ease: 'Sine.easeIn' }));
    for (let i = 0; i < 10; i++) {
      const y = Phaser.Math.Between(200, 262);
      const l = this.add.rectangle(W + 10, y, Phaser.Math.Between(40, 120), 2, 0xffffff, 0.8).setOrigin(0, 0.5).setDepth(3);
      this.introTweens.push(this.tweens.add({ targets: l, x: -140, duration: 380, delay: i * 60, onComplete: () => l.destroy() }));
    }
    this.introTimers.push(this.time.delayedCall(1000, () => { trail.remove(); sonic.destroy(); }));
    this.introTimers.push(this.time.delayedCall(1700, () => tails.destroy()));
  }

  /** waar de horizon nu staat (de camera-kanteling); de zee, lucht en effecten volgen deze */
  private horizonY = 46;
  private bloom?: Phaser.GameObjects.Image;

  private buildLogo() {
    const c = this.add.container(W / 2, -110).setDepth(8);
    // schuine blauwe vleugel achter het logo (eigen ontwerp, Advance-sfeer)
    const g = this.add.graphics();
    const wing = (dx: number, dy: number, color: number) => {
      g.fillStyle(color).fillPoints([
        { x: -150 + dx, y: -24 + dy }, { x: 120 + dx, y: -34 + dy }, { x: 176 + dx, y: -58 + dy },
        { x: 150 + dx, y: -14 + dy }, { x: 132 + dx, y: 26 + dy }, { x: -136 + dx, y: 30 + dy },
      ], true);
    };
    wing(4, 4, 0x0a1450);
    wing(0, 0, 0x1f4ad0);
    g.fillStyle(0x4a88ff).fillPoints([{ x: -140, y: -20 }, { x: 116, y: -29 }, { x: 150, y: -44 }, { x: 128, y: -18 }, { x: -134, y: -10 }], true);
    // Sonic en Tails (character select-art) naast het logo
    const tails = this.add.image(-150, 14, 'cs_art_tails').setScale(1.5).setFlipX(true);
    const sonic = this.add.image(150, 6, 'cs_art_sonic').setScale(1.75);
    const title = this.add.text(0, -6, 'SONIC', {
      fontFamily: FONT, fontSize: '32px', color: '#ffd23a', stroke: '#0a1450', strokeThickness: 8,
    }).setOrigin(0.5).setShadow(3, 3, '#c0392b', 0, true, false);
    const band = this.add.graphics();
    band.fillStyle(0x0a1450).fillPoints([{ x: -70, y: 16 }, { x: 82, y: 16 }, { x: 72, y: 42 }, { x: -80, y: 42 }], true);
    band.fillStyle(0xe8443a).fillPoints([{ x: -66, y: 19 }, { x: 77, y: 19 }, { x: 69, y: 39 }, { x: -75, y: 39 }], true);
    const rogue = this.add.text(0, 30, 'ROGUE', {
      fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#0a1450', strokeThickness: 4,
    }).setOrigin(0.5);
    c.add([g, tails, sonic, title, band, rogue]);
    this.logo = c;
  }

  private showLogo() {
    this.sea?.destroy();
    this.sea = undefined;
    this.clearSeaFx();
    this.introTweens.push(this.tweens.add({
      targets: this.logo, y: 100, duration: 700, ease: 'Bounce.easeOut',
      onComplete: () => {
        this.sparkle(this.logo.x - 110, this.logo.y - 20);
        this.sparkle(this.logo.x + 120, this.logo.y + 10);
        audio.sfx('ringcollect', { volume: 0.6 });
        this.toPress();
      },
    }));
  }

  private sparkle(x: number, y: number) {
    const s = this.add.sprite(x, y, 'ui', 'sparkle_0').setScale(2).setDepth(12).play('sparkle');
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  /** Intro overslaan: alles meteen in de eindstand. */
  private finishIntro() {
    // net als in Advance 2: de muziek springt mee naar het stuk van het title screen
    audio.seekMusic('title', TITLE_MUSIC_SKIP_TO);
    this.introTimers.forEach(t => t.remove());
    this.introTweens.forEach(t => t.stop());
    this.children.list
      .filter(o => o instanceof Phaser.GameObjects.Sprite || (o instanceof Phaser.GameObjects.Rectangle && (o as Phaser.GameObjects.Rectangle).depth === 3))
      .forEach(o => o.destroy());
    this.children.list.filter(o => (o as unknown as { depth: number }).depth === 50).forEach(o => o.destroy());
    this.clearSeaFx();
    this.sea?.destroy();
    this.sea = undefined;
    this.sky.setVisible(true).setAlpha(1);
    this.horizonY = SKY_END + this.sky.displayHeight - 6;
    this.logo.y = 100;
  }

  private toPress() {
    if (this.phase !== 'intro') return;
    this.phase = 'press';
    this.press.setAlpha(1);
    this.time.addEvent({ delay: 1800, loop: true, callback: () => this.sparkle(this.logo.x + Phaser.Math.Between(-130, 130), this.logo.y + Phaser.Math.Between(-24, 30)) });
  }

  // ---------------------------------------------------------------- menu
  private buildMenu() {
    const entries: Array<[string, () => void]> = [
      ['game_start', () => this.openContinue()],
      ['how_to_play', () => this.openHelp()],
      ['credits', () => this.openCredits()],
      ['options', () => this.openSettings()],
    ];
    entries.forEach(([key, act], i) => {
      const y = 192 + i * 16;
      const off = this.add.image(W / 2, y, `label_${key}`).setVisible(false).setDepth(10);
      const on = this.add.image(W / 2, y, `label_${key}_on`).setVisible(false).setDepth(10);
      for (const img of [off, on]) {
        img.setInteractive({ useHandCursor: true });
        img.on('pointerover', () => { if (this.phase === 'menu' && this.cursor !== i) { this.cursor = i; audio.sfx('cursormove'); this.refreshMenu(); } });
        img.on('pointerdown', () => { if (this.phase === 'menu') { this.cursor = i; act(); } });
      }
      this.items.push({ off, on, act });
    });
  }

  private openMenu() {
    this.phase = 'menu';
    audio.sfx('confirm');
    this.press.setVisible(false);
    this.refreshMenu();
  }

  private refreshMenu() {
    this.items.forEach((it, i) => { it.off.setVisible(i !== this.cursor); it.on.setVisible(i === this.cursor); });
  }

  private advance() {
    if (this.phase === 'boot') this.startIntro();
    else if (this.phase === 'intro') { this.finishIntro(); this.toPress(); }
    else if (this.phase === 'press') this.openMenu();
  }

  private onKey(k: string) {
    if (this.phase === 'leaving') return;
    if (this.phase === 'continue') {
      if (['arrowup', 'w', 'arrowdown', 's'].includes(k)) { this.contChoice = 1 - this.contChoice; audio.sfx('cursormove'); this.refreshContinue(); }
      else if (['z', 'enter', ' '].includes(k)) this.pickContinue(this.contChoice);
      else if (['x', 'escape', 'backspace'].includes(k)) this.closeContinue();
      return;
    }
    if (this.phase === 'boot') { this.startIntro(); return; }
    if (this.phase !== 'menu') {
      if (['z', 'enter', ' ', 'x', 'escape'].includes(k)) this.advance();
      return;
    }
    if (['arrowup', 'w', 'arrowdown', 's'].includes(k)) {
      this.cursor = Phaser.Math.Wrap(this.cursor + (['arrowup', 'w'].includes(k) ? -1 : 1), 0, this.items.length);
      audio.sfx('cursormove');
      this.refreshMenu();
    } else if (['z', 'enter', ' '].includes(k)) this.items[this.cursor].act();
    else if (k === 'm') this.openSettings();
  }

  // ---------------------------------------------------------------- continue
  private contLayer?: Phaser.GameObjects.Container;
  private contTexts: Phaser.GameObjects.Text[] = [];
  private contArrow?: Phaser.GameObjects.Triangle;
  private contChoice = 0;

  /** Game Start met een opgeslagen run: verder spelen of opnieuw beginnen. */
  private openContinue() {
    const sv = loadRun();
    if (!sv) { this.startGame(); return; }
    audio.sfx('confirm');
    this.phase = 'continue';
    this.contChoice = 0;
    const c = this.add.container(W / 2, 200).setDepth(40);
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.95).fillRoundedRect(-120, -26, 240, 62, 6);
    g.lineStyle(1, 0xf2c230).strokeRoundedRect(-119.5, -25.5, 239, 61, 6);
    const team = sv.party.map(f => FIGHTERS[f.id]?.name ?? f.id).join(', ');
    const t1 = this.add.text(-96, -16, `CONTINUE  (wave ${sv.wave})`, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' });
    const sub = this.add.text(-96, -4, team, { fontFamily: FONT, fontSize: '8px', color: '#9aa4c4' });
    const t2 = this.add.text(-96, 16, 'NEW RUN', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' });
    const arrow = this.add.triangle(-108, -16, 0, 0, 0, 8, 5, 4, 0xffd23a).setOrigin(0);
    [t1, t2].forEach((t, i) => t.setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.contChoice = i; this.refreshContinue(); })
      .on('pointerdown', () => this.pickContinue(i)));
    c.add([g, t1, sub, t2, arrow]);
    this.contLayer = c;
    this.contTexts = [t1, t2];
    this.contArrow = arrow;
    this.items.forEach(it => { it.off.setVisible(false); it.on.setVisible(false); });
    this.refreshContinue();
  }

  private refreshContinue() {
    this.contTexts.forEach((t, i) => t.setColor(i === this.contChoice ? '#ffd23a' : '#ffffff'));
    this.contArrow?.setY(this.contTexts[this.contChoice].y);
  }

  private closeContinue() {
    audio.sfx('back');
    this.contLayer?.destroy();
    this.contLayer = undefined;
    this.phase = 'menu';
    this.refreshMenu();
  }

  private pickContinue(i: number) {
    if (i === 0) {
      const sv = loadRun();
      this.phase = 'leaving';
      audio.sfx('confirm2');
      this.cameras.main.fadeOut(350, 255, 255, 255);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.input.keyboard!.removeAllListeners();
        this.input.removeAllListeners();
        this.scene.start('Battle', { save: sv });
      });
    } else {
      clearRun();
      this.contLayer?.destroy();
      this.contLayer = undefined;
      this.startGame();
    }
  }

  private startGame() {
    this.phase = 'leaving';
    audio.sfx('confirm2');
    this.sparkle(W / 2 - 60, 196);
    this.cameras.main.fadeOut(350, 255, 255, 255);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.input.keyboard!.removeAllListeners();
      this.input.removeAllListeners();
      this.scene.start('CharSelect');
    });
  }

  private openCredits() {
    audio.sfx('confirm');
    this.scene.pause();
    this.scene.launch('Credits', { from: this.scene.key });
  }

  /** How to Play, met bovenaan de tutorial (oefengevecht met Tails). */
  private openHelp() {
    audio.sfx('confirm');
    this.scene.pause();
    this.scene.launch('Help', { from: this.scene.key, tutorial: true });
  }

  private openSettings() {
    audio.sfx('confirm');
    this.scene.pause();
    this.scene.launch('Settings', { from: this.scene.key });
  }
}
