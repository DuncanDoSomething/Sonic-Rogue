// ---------------------------------------------------------------------------
// Run summary, zoals in PokéRogue: links de run (gewonnen / game over, wave, tijd, rings,
// emeralds, tas), rechts een kaart per teamlid met stats, moves en wat ze deze run deden.
// Na een game over en na de overwinning (na de ending). Z / klik = terug naar het titelscherm.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { audio } from '../audio';
import { ITEMS } from '../data/items';
import { EMERALDS } from '../data/zones';
import { formatRunTime, type RunSummary, type SummaryFighter } from '../data/summary';
import { HUD, sonicPanel } from './hud';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';
const LEFT_W = 150;
const CARD_X = 8 + LEFT_W + 6;
const CARD_W = W - CARD_X - 8;
const CARD_H = 80;

export class SummaryScene extends Phaser.Scene {
  private data_!: RunSummary;
  private leaving = false;

  constructor() { super('Summary'); }

  init(data: RunSummary) { this.data_ = data; this.leaving = false; }

  create() {
    const d = this.data_;
    // achtergrond: de ending-art (gewonnen) of de sepia-versie (game over), gedimd
    const bg = this.add.image(W / 2, H / 2, d.victory ? 'ending_group' : 'ending_sepia');
    bg.setScale(Math.max(W / bg.width, H / bg.height));
    this.add.rectangle(0, 0, W, H, 0x05060c, d.victory ? 0.45 : 0.6).setOrigin(0);
    this.cameras.main.fadeIn(400, 0, 0, 0);
    if (d.victory) audio.playMusic('victory');
    else audio.stopMusic(600);

    this.buildLeft(d);
    d.party.forEach((f, i) => this.buildCard(f, 8 + i * (CARD_H + 4), i));

    const hint = this.add.text(8 + LEFT_W / 2, H - 20, 'Z: title screen', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 1);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });

    // even wachten zodat een Z die nog van het gevecht komt het scherm niet meteen wegklikt
    this.time.delayedCall(600, () => {
      this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (['z', 'Z', 'Enter', ' ', 'x', 'X', 'Escape'].includes(e.key)) this.leave(); });
      this.input.on('pointerdown', () => this.leave());
    });
  }

  private buildLeft(d: RunSummary) {
    const g = this.add.graphics();
    sonicPanel(g, 8, 8, LEFT_W, H - 16, 'blue', 0.94);
    const x = 18;
    let y = 18;
    this.add.text(8 + LEFT_W / 2, y, d.victory ? 'VICTORY!' : 'GAME OVER', { fontFamily: FONT, fontSize: '8px', color: d.victory ? '#ffd23a' : '#ff6a5a' })
      .setOrigin(0.5, 0).setScale(1.5);
    y += 20;
    this.add.text(8 + LEFT_W / 2, y, `${d.mode.toUpperCase()} MODE${d.test ? ' (TEST)' : ''}`, { fontFamily: FONT, fontSize: '8px', color: HUD.muted }).setOrigin(0.5, 0);
    y += 18;
    const row = (label: string, value: string, color = '#ffffff') => {
      this.add.text(x, y, label, { fontFamily: FONT, fontSize: '8px', color: HUD.label });
      const v = this.add.text(8 + LEFT_W - 10, y, value, { fontFamily: FONT, fontSize: '8px', color }).setOrigin(1, 0);
      y += 14;
      return v;
    };
    row('Wave', `${d.wave}`);
    row('Time', formatRunTime(d.timeMs));
    // rings met het draaiende ringetje
    const ry = y;
    const rv = row('Rings', `${d.rings}`, '#f2c230');
    this.add.sprite(rv.x - rv.width - 9, ry + 4, 'ui', 'ring_0').play('ring_spin');
    if (d.defeatedBy) {
      this.add.text(x, y, 'Defeated by', { fontFamily: FONT, fontSize: '8px', color: HUD.label });
      y += 12;
      this.add.text(x, y, d.defeatedBy, { fontFamily: FONT, fontSize: '8px', color: '#ff9a8a', wordWrap: { width: LEFT_W - 20 } });
      y += 16;
    }
    y += 4;
    this.add.text(x, y, 'Chaos Emeralds', { fontFamily: FONT, fontSize: '8px', color: HUD.label });
    y += 14;
    EMERALDS.forEach((c, i) => {
      const e = this.add.sprite(x + 8 + i * 18, y + 6, 'emeralds', `emerald_${c}_0`);
      if (i >= d.emeralds) e.setTint(0x202040).setAlpha(0.5);
      else e.play(`emerald_${c}`);
    });
    y += 22;
    this.add.text(x, y, 'Items', { fontFamily: FONT, fontSize: '8px', color: HUD.label });
    y += 14;
    const ids = Object.keys(ITEMS).filter(id => (d.bag[id] ?? 0) > 0);
    if (!ids.length) this.add.text(x, y, 'None', { fontFamily: FONT, fontSize: '8px', color: HUD.muted });
    ids.forEach((id, i) => {
      const ix = x + 10 + (i % 5) * 26, iy = y + 8 + Math.floor(i / 5) * 24;
      const slot = this.add.graphics();
      slot.fillStyle(HUD.outline).fillRoundedRect(ix - 11, iy - 9, 22, 20, 3);
      slot.fillStyle(HUD.pipEmpty).fillRoundedRect(ix - 10, iy - 8, 20, 18, 2);
      const icon = this.itemIcon(id, d);
      icon.setPosition(ix, iy + 1).setScale(Math.min(1, 15 / icon.width, 14 / icon.height));
      if (d.bag[id] > 1) this.add.text(ix + 11, iy + 11, `${d.bag[id]}`, { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 }).setOrigin(1, 1);
    });
  }

  private itemIcon(id: string, d: RunSummary): Phaser.GameObjects.Image {
    const heart: Record<string, number> = { healthRing: 25, superRing: 50, hyperRing: 75, chiliDog: 100 };
    if (heart[id]) return this.add.image(0, 0, `heart_${heart[id]}`);
    if (id === 'revive') return this.add.image(0, 0, 'ui', `head_${d.party[0]?.id ?? 'sonic'}`);
    return this.add.image(0, 0, 'ui', 'monitor_random');
  }

  private buildCard(f: SummaryFighter, y: number, i: number) {
    const c = this.add.container(W + 20, y);
    const g = this.add.graphics();
    sonicPanel(g, 0, 0, CARD_W, CARD_H, 'blue', 0.94);
    const t = (x: number, ty: number, text: string, color = '#ffffff') => this.add.text(x, ty, text, { fontFamily: FONT, fontSize: '8px', color });
    const head = this.add.image(10, 14, 'ui', `head_${f.id}`).setOrigin(0, 0.5).setAlpha(f.fainted ? 0.45 : 1);
    const name = t(34, 7, f.name.toUpperCase(), f.fainted ? '#9aa0c8' : '#ffffff');
    const type = this.add.image(34 + name.width + 6, 11, `type_${f.type}`).setOrigin(0, 0.5);
    const lv = t(CARD_W - 10, 7, `Lv.${f.level}`, HUD.label).setOrigin(1, 0);
    const passive = t(34, 19, f.passive ?? '', HUD.muted);
    const stats = t(10, 32, `HP ${f.hp}/${f.maxHp}  ATK ${f.atk}  DEF ${f.def}  SPD ${f.spd}`);
    const moves = f.moves.map((m, k) => t(10 + (k % 2) * 150, 44 + Math.floor(k / 2) * 10, m, '#cfe8ff'));
    const run = t(10, 66, `DMG ${f.dmg}   KOs ${f.kos}   DOWNS ${f.downs}`, '#f2c230');
    c.add([g, head, name, type, lv, passive, stats, ...moves, run]);
    if (f.fainted) c.add(t(CARD_W - 10, 19, 'KO', '#ff6a5a').setOrigin(1, 0));
    this.tweens.add({ targets: c, x: CARD_X, duration: 380, delay: 150 + i * 110, ease: 'Cubic.easeOut' });
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    audio.sfx('confirm', { volume: 0.7 });
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title', { toMenu: true }));
  }
}
