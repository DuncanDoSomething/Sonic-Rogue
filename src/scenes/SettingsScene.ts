import Phaser from 'phaser';
import { BATTLE_SPEEDS, BATTLE_STYLES, TEXT_SPEEDS, VOLUMES, saveSettings, settings } from '../data/settings';
import { audio } from '../audio';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

const ROWS = [
  { label: 'Text Speed', key: 'textSpeed' as const, options: TEXT_SPEEDS },
  { label: 'Battle Speed', key: 'battleSpeed' as const, options: BATTLE_SPEEDS },
  { label: 'Battle Style', key: 'battleStyle' as const, options: BATTLE_STYLES },
  { label: 'Music', key: 'musicVolume' as const, options: VOLUMES },
  { label: 'Sound FX', key: 'sfxVolume' as const, options: VOLUMES },
];

/** Settings-overlay. Wordt boven een andere scene gestart en pauzeert die zolang. */
export class SettingsScene extends Phaser.Scene {
  private from = '';
  private row = 0;
  private valueTexts: Phaser.GameObjects.Text[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private pointer!: Phaser.GameObjects.Triangle;

  constructor() { super('Settings'); }

  init(data: { from: string }) {
    this.from = data.from;
    this.row = 0;
    this.valueTexts = [];
    this.labels = [];
  }

  create() {
    this.add.rectangle(0, 0, W, H, 0x05060c, 0.7).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    const bx = 90, by = 40, bw = 300, bh = 180;
    g.fillStyle(0x10131c, 0.97).fillRoundedRect(bx, by, bw, bh, 6);
    g.lineStyle(2, 0xc0392b).strokeRoundedRect(bx + 1, by + 1, bw - 2, bh - 2, 6);
    this.add.text(W / 2, by + 14, 'Settings', { fontFamily: FONT, fontSize: '8px', color: '#f2c230' }).setOrigin(0.5);

    ROWS.forEach((r, i) => {
      const y = by + 40 + i * 26;
      const lab = this.add.text(bx + 24, y, r.label, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' });
      const left = this.add.text(bx + 160, y, '<', { fontFamily: FONT, fontSize: '8px', color: '#9aa4c4' }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      const val = this.add.text(bx + 216, y, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0);
      const right = this.add.text(bx + 272, y, '>', { fontFamily: FONT, fontSize: '8px', color: '#9aa4c4' }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      left.on('pointerdown', () => { this.row = i; this.change(-1); });
      right.on('pointerdown', () => { this.row = i; this.change(1); });
      lab.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.row = i; this.change(1); });
      this.labels.push(lab);
      this.valueTexts.push(val);
    });

    const close = this.add.text(W / 2, by + bh - 20, 'Close', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.add.text(W / 2, by + bh + 12, 'Arrows to change, X / M to close', { fontFamily: FONT, fontSize: '8px', color: '#9aa4c4' })
      .setOrigin(0.5).setShadow(1, 1, '#000', 0);
    this.pointer = this.add.triangle(0, 0, 0, 0, 0, 8, 5, 4, 0xffffff).setOrigin(0, 0);

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'w'].includes(k)) { this.row = Phaser.Math.Wrap(this.row - 1, 0, ROWS.length); audio.sfx('cursormove'); }
      else if (['arrowdown', 's'].includes(k)) { this.row = Phaser.Math.Wrap(this.row + 1, 0, ROWS.length); audio.sfx('cursormove'); }
      else if (['arrowleft', 'a'].includes(k)) this.change(-1);
      else if (['arrowright', 'd', 'z', 'enter', ' '].includes(k)) this.change(1);
      else if (['x', 'escape', 'm', 'backspace'].includes(k)) this.close();
      this.refresh();
    });
    this.refresh();
  }

  private change(dir: number) {
    const r = ROWS[this.row];
    if (r.key === 'musicVolume' || r.key === 'sfxVolume') {
      settings[r.key] = Phaser.Math.Clamp(settings[r.key] + dir, 0, r.options.length - 1);
    } else {
      settings[r.key] = Phaser.Math.Wrap(settings[r.key] + dir, 0, r.options.length);
    }
    saveSettings();
    audio.refreshVolume();
    if (r.key === 'sfxVolume') audio.sfx('ringcollect');
    else audio.sfx('cursormove');
    this.refresh();
  }

  private refresh() {
    ROWS.forEach((r, i) => this.valueTexts[i].setText(r.options[settings[r.key]]));
    const l = this.labels[this.row];
    this.pointer.setPosition(l.x - 11, l.y);
  }

  private close() {
    audio.sfx('back');
    this.input.keyboard!.removeAllListeners();
    this.scene.resume(this.from);
    this.scene.get(this.from).events.emit('settings-changed');
    this.scene.stop();
  }
}
