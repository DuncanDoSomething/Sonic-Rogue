import Phaser from 'phaser';
import { BATTLE_SPEEDS, BATTLE_STYLES, TALK_OPTIONS, TEXT_SPEEDS, TIP_OPTIONS, VOLUMES, saveSettings, settings } from '../data/settings';
import { audio } from '../audio';
import { HUD, checkerBand, sonicPanel } from './hud';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

const ROWS = [
  { label: 'Text Speed', key: 'textSpeed' as const, options: TEXT_SPEEDS },
  { label: 'Battle Speed', key: 'battleSpeed' as const, options: BATTLE_SPEEDS },
  { label: 'Battle Style', key: 'battleStyle' as const, options: BATTLE_STYLES },
  { label: 'Tails Tips', key: 'tips' as const, options: TIP_OPTIONS },
  { label: 'Rival Talk', key: 'talk' as const, options: TALK_OPTIONS },
  { label: 'Music', key: 'musicVolume' as const, options: VOLUMES },
  { label: 'Sound FX', key: 'sfxVolume' as const, options: VOLUMES },
];

/** Settings-overlay. Wordt boven een andere scene gestart en pauzeert die zolang. */
export class SettingsScene extends Phaser.Scene {
  private from = '';
  private bx = 0;
  private bw = 0;
  private row = 0;
  private valueTexts: Phaser.GameObjects.Text[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private pointer!: Phaser.GameObjects.Sprite;
  private highlight!: Phaser.GameObjects.Graphics;
  private arrows: Phaser.GameObjects.Text[][] = [];

  constructor() { super('Settings'); }

  init(data: { from: string }) {
    this.from = data.from;
    this.row = 0;
    this.valueTexts = [];
    this.labels = [];
    this.arrows = [];
  }

  create() {
    this.add.rectangle(0, 0, W, H, 0x05060c, 0.7).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    const bx = 90, by = 12, bw = 300, bh = 244;
    // Chao Garden-paneel, met de titel boven een geblokte finish-band
    sonicPanel(g, bx, by, bw, bh, 'blue', 0.97);
    this.add.text(W / 2, by + 15, 'SETTINGS', { fontFamily: FONT, fontSize: '8px', color: HUD.label })
      .setOrigin(0.5).setShadow(1, 1, '#000', 0);
    checkerBand(g, bx + 3, by + 26, bw - 6);
    this.highlight = this.add.graphics();

    ROWS.forEach((r, i) => {
      const y = by + 44 + i * 22;
      // waarde in een donker venstertje, zoals de ring-teller
      g.fillStyle(HUD.outline).fillRoundedRect(bx + 168, y - 4, 96, 16, 3);
      g.fillStyle(HUD.pipEmpty).fillRoundedRect(bx + 169, y - 3, 94, 14, 2);
      const lab = this.add.text(bx + 28, y, r.label, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setShadow(1, 1, '#000', 0);
      const left = this.add.text(bx + 156, y, '<', { fontFamily: FONT, fontSize: '8px', color: HUD.muted }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      const val = this.add.text(bx + 216, y, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0);
      const right = this.add.text(bx + 276, y, '>', { fontFamily: FONT, fontSize: '8px', color: HUD.muted }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      left.on('pointerdown', () => { this.row = i; this.change(-1); });
      right.on('pointerdown', () => { this.row = i; this.change(1); });
      lab.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.row = i; this.change(1); });
      this.labels.push(lab);
      this.valueTexts.push(val);
      this.arrows.push([left, right]);
    });

    const close = this.add.text(W / 2, by + bh - 36, 'Close', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
      .setOrigin(0.5).setShadow(1, 1, '#000', 0).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    // uitleg onderin het paneel (eronder viel hij weg tegen het gevecht)
    this.add.text(W / 2, by + bh - 14, 'Arrows to change, X / M to close', { fontFamily: FONT, fontSize: '8px', color: HUD.muted })
      .setOrigin(0.5).setShadow(1, 1, '#000', 0);
    // cursor: de draaiende ring, net als in het gevecht
    this.pointer = this.add.sprite(0, 0, 'ui', 'ring_0').setOrigin(0, 0).setScale(0.5).play('ring_spin');
    this.bx = bx; this.bw = bw;

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
    this.pointer.setPosition(l.x - 13, l.y);
    // gekozen regel: donkere balk erachter, gouden label en waarde, cyaan pijltjes
    this.highlight.clear().fillStyle(HUD.pipEmpty, 0.6).fillRect(this.bx + 8, l.y - 5, this.bw - 16, 18);
    ROWS.forEach((_, i) => {
      const on = i === this.row;
      this.labels[i].setColor(on ? HUD.label : '#ffffff');
      this.valueTexts[i].setColor(on ? HUD.label : '#ffffff');
      this.arrows[i].forEach(a => a.setColor(on ? '#50f8f8' : HUD.muted));
    });
  }

  private close() {
    audio.sfx('back');
    this.input.keyboard!.removeAllListeners();
    this.scene.resume(this.from);
    this.scene.get(this.from).events.emit('settings-changed');
    this.scene.stop();
  }
}
