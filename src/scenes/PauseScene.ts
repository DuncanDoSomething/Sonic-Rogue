import Phaser from 'phaser';
import { audio } from '../audio';
import { HUD, checkerBand, sonicPanel } from './hud';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

type Action = 'resume' | 'settings' | 'help' | 'quit';
const ROWS: Array<{ label: string; act: Action }> = [
  { label: 'Resume', act: 'resume' },
  { label: 'Settings', act: 'settings' },
  { label: 'How to Play', act: 'help' },
  { label: 'Save & Quit', act: 'quit' },
];

/**
 * Pauzemenu achter het knopje met de drie streepjes (of M) in een gevecht.
 * Settings en Help openen hier bovenop; Save & Quit gaat terug naar het title screen.
 */
export class PauseScene extends Phaser.Scene {
  private from = '';
  private row = 0;
  private labels: Phaser.GameObjects.Text[] = [];
  /** andere tekst voor Save & Quit (de tutorial slaat niks op) */
  private quitLabel?: string;
  private bx = 0;
  private bw = 0;
  private pointer!: Phaser.GameObjects.Sprite;
  private highlight!: Phaser.GameObjects.Graphics;

  constructor() { super('Pause'); }

  init(data: { from: string; quitLabel?: string }) {
    this.from = data.from;
    this.quitLabel = data.quitLabel;
    this.row = 0;
    this.labels = [];
  }

  create() {
    this.add.rectangle(0, 0, W, H, 0x05060c, 0.7).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    const bw = 180, bh = 152, bx = (W - bw) / 2, by = 46;
    // Chao Garden-paneel, met de titel boven een geblokte finish-band
    sonicPanel(g, bx, by, bw, bh, 'blue', 0.97);
    this.add.text(W / 2, by + 15, 'PAUSED', { fontFamily: FONT, fontSize: '8px', color: HUD.label })
      .setOrigin(0.5).setShadow(1, 1, '#000', 0);
    checkerBand(g, bx + 3, by + 26, bw - 6);
    this.highlight = this.add.graphics();

    ROWS.forEach((r, i) => {
      const label = r.act === 'quit' && this.quitLabel ? this.quitLabel : r.label;
      const t = this.add.text(bx + 42, by + 44 + i * 20, label, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
        .setShadow(1, 1, '#000', 0).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (this.row !== i) { this.row = i; audio.sfx('cursormove'); this.refresh(); } });
      t.on('pointerdown', () => { this.row = i; this.pick(); });
      this.labels.push(t);
    });
    // uitleg onderin het paneel (eronder viel hij weg tegen het gevecht)
    this.add.text(W / 2, by + bh - 14, 'Z to pick, X / M to close', { fontFamily: FONT, fontSize: '8px', color: HUD.muted })
      .setOrigin(0.5).setShadow(1, 1, '#000', 0);
    // cursor: de draaiende ring, net als in het gevecht
    this.pointer = this.add.sprite(0, 0, 'ui', 'ring_0').setOrigin(0, 0).setScale(0.5).play('ring_spin');
    this.bx = bx; this.bw = bw;

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'w'].includes(k)) { this.row = Phaser.Math.Wrap(this.row - 1, 0, ROWS.length); audio.sfx('cursormove'); this.refresh(); }
      else if (['arrowdown', 's'].includes(k)) { this.row = Phaser.Math.Wrap(this.row + 1, 0, ROWS.length); audio.sfx('cursormove'); this.refresh(); }
      else if (['z', 'enter', ' '].includes(k)) this.pick();
      else if (['x', 'escape', 'm', 'backspace'].includes(k)) this.close();
    });
    // terug uit Settings/Help: toetsen resetten en instellingen doorgeven aan het gevecht
    this.events.on('resume', () => { this.scene.setVisible(true); this.input.keyboard!.resetKeys(); });
    this.events.on('settings-changed', () => this.scene.get(this.from).events.emit('settings-changed'));
    this.refresh();
  }

  private refresh() {
    const l = this.labels[this.row];
    this.pointer.setPosition(l.x - 13, l.y);
    // gekozen regel: donkere balk erachter en gouden tekst
    this.highlight.clear().fillStyle(HUD.pipEmpty, 0.6).fillRect(this.bx + 8, l.y - 4, this.bw - 16, 16);
    this.labels.forEach((t, i) => t.setColor(i === this.row ? HUD.label : '#ffffff'));
  }

  private pick() {
    const act = ROWS[this.row].act;
    if (act === 'resume') { this.close(); return; }
    audio.sfx('confirm');
    if (act === 'settings' || act === 'help') {
      // pauzemenu verbergen zolang Settings/Help open is (anders tekent het er doorheen)
      this.scene.pause();
      this.scene.setVisible(false);
      this.scene.launch(act === 'settings' ? 'Settings' : 'Help', { from: this.scene.key });
      return;
    }
    // Save & Quit: de run staat al opgeslagen (auto-save), dus alleen terug naar het title screen
    this.input.keyboard!.removeAllListeners();
    audio.stopMusic(400);
    const black = this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0).setAlpha(0).setDepth(100);
    this.tweens.add({
      targets: black, alpha: 1, duration: 300,
      onComplete: () => {
        this.scene.stop(this.from);
        this.scene.start('Title', { toMenu: true });
      },
    });
  }

  private close() {
    audio.sfx('back');
    this.input.keyboard!.removeAllListeners();
    this.scene.resume(this.from);
    this.scene.stop();
  }
}
