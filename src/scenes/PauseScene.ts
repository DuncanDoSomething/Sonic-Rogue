import Phaser from 'phaser';
import { audio } from '../audio';

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
  private pointer!: Phaser.GameObjects.Triangle;

  constructor() { super('Pause'); }

  init(data: { from: string }) {
    this.from = data.from;
    this.row = 0;
    this.labels = [];
  }

  create() {
    this.add.rectangle(0, 0, W, H, 0x05060c, 0.7).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    const bw = 200, bh = 122, bx = (W - bw) / 2, by = 50;
    g.fillStyle(0x10131c, 0.97).fillRoundedRect(bx, by, bw, bh, 6);
    g.lineStyle(2, 0xc0392b).strokeRoundedRect(bx + 1, by + 1, bw - 2, bh - 2, 6);
    this.add.text(W / 2, by + 14, 'Paused', { fontFamily: FONT, fontSize: '8px', color: '#f2c230' }).setOrigin(0.5);

    ROWS.forEach((r, i) => {
      const t = this.add.text(bx + 50, by + 36 + i * 20, r.label, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
        .setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (this.row !== i) { this.row = i; audio.sfx('cursormove'); this.refresh(); } });
      t.on('pointerdown', () => { this.row = i; this.pick(); });
      this.labels.push(t);
    });
    this.add.text(W / 2, by + bh + 12, 'Z to pick, X / M to close', { fontFamily: FONT, fontSize: '8px', color: '#9aa4c4' })
      .setOrigin(0.5).setShadow(1, 1, '#000', 0);
    this.pointer = this.add.triangle(0, 0, 0, 0, 0, 8, 5, 4, 0xffffff).setOrigin(0, 0);

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
    this.pointer.setPosition(l.x - 11, l.y);
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
