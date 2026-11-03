// ---------------------------------------------------------------------------
// Sonic-stijl HUD voor het gevecht, naar de UI van de Tiny Chao Garden (Sonic Advance):
// paarse rand met een cyaan lijntje, blauwe of crème vulling, goud geblokte banden en
// het blauwe cijferfont. Plaatjes komen uit tools/build_hud.py.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';

export const HUD = {
  outline: 0x381078,
  cyan: 0x50f8f8,
  blueTop: 0x2c3cc0,
  blueBottom: 0x141a6c,
  cream: 0xf8f898,
  creamShade: 0xd8d868,
  peachA: 0xf8f0a0,
  peachB: 0xf8c890,
  gold: 0xf8d820,
  goldDark: 0xf8b000,
  pipEmpty: 0x0c1048,
  pip: 0x4ad8ff,
  pipFull: 0xffd23a,
  /** tekst op crème */
  ink: '#281060',
  inkMuted: '#9a9258',
  /** tekst op blauw */
  label: '#f8d820',
  muted: '#8a94e0',
};

export type PanelStyle = 'blue' | 'cream' | 'peach';

/**
 * Paneel met de Chao Garden-rand: paars, cyaan, paars, dan de vulling.
 * Blauw = info (witte tekst), crème = tekstvak (donkere tekst), peach = gestreept vakje.
 */
export function sonicPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, style: PanelStyle = 'blue', alpha = 1) {
  g.fillStyle(HUD.outline, alpha).fillRoundedRect(x, y, w, h, 4);
  g.fillStyle(HUD.cyan, alpha).fillRoundedRect(x + 1, y + 1, w - 2, h - 2, 3);
  g.fillStyle(HUD.outline, alpha).fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 2);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  if (style === 'blue') {
    g.fillGradientStyle(HUD.blueTop, HUD.blueTop, HUD.blueBottom, HUD.blueBottom, alpha).fillRect(ix, iy, iw, ih);
  } else if (style === 'cream') {
    // donkerder randje links/boven, net als het tekstvak in de sheet
    g.fillStyle(HUD.creamShade, alpha).fillRect(ix, iy, iw, ih);
    g.fillStyle(HUD.cream, alpha).fillRect(ix + 1, iy + 1, iw - 1, ih - 1);
  } else {
    for (let sy = 0; sy < ih; sy++) g.fillStyle(sy % 2 ? HUD.peachB : HUD.peachA, alpha).fillRect(ix, iy + sy, iw, 1);
  }
  return g;
}

/** Goud geblokte band (de finish-vlag van Sonic), `size` = grootte van een blokje. */
export function checkerBand(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, rows = 2, size = 3) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c * size < w; c++) {
      g.fillStyle((r + c) % 2 ? HUD.goldDark : HUD.gold).fillRect(x + c * size, y + r * size, Math.min(size, w - c * size), size);
    }
  }
  return g;
}

/** Getal in het blauwe Chao Garden-font, rechts uitgelijnd op x. */
export class Digits {
  readonly root: Phaser.GameObjects.Container;
  private imgs: Phaser.GameObjects.Image[] = [];
  constructor(private scene: Phaser.Scene, x: number, y: number, private slots: number, private prefix = false) {
    this.root = scene.add.container(x, y);
  }

  set(n: number) {
    const s = (this.prefix ? 'x' : '') + String(Math.max(0, Math.min(Math.floor(n), 10 ** this.slots - 1)));
    while (this.imgs.length < s.length) {
      const img = this.scene.add.image(0, 0, 'hud_digits', '0').setOrigin(1, 0);
      this.imgs.push(img);
      this.root.add(img);
    }
    this.imgs.forEach((img, i) => {
      const ch = s[s.length - 1 - i];
      img.setVisible(ch !== undefined);
      if (ch !== undefined) img.setFrame(ch).setX(-i * 8);
    });
    return this;
  }
}

/** Frames '0'..'9' en 'x' op hud_digits zetten (BootScene). */
export function addDigitFrames(scene: Phaser.Scene) {
  const t = scene.textures.get('hud_digits');
  if (!t || t.key === '__MISSING' || t.has('0')) return;
  '0123456789x'.split('').forEach((ch, i) => t.add(ch, 0, i * 8, 0, 8, 11));
}

/**
 * Ring-teller rechtsboven: draaiende ring, "RINGS" en het getal in een gestreept venster.
 * `setText` zodat hij net zo werkt als de oude tekst-teller.
 */
export class RingCounter {
  readonly root: Phaser.GameObjects.Container;
  readonly ring: Phaser.GameObjects.Sprite;
  private digits: Digits;
  private value = -1;
  static readonly W = 60;
  static readonly H = 32;
  static readonly DIGITS_Y = 15;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.root = scene.add.container(x, y).setDepth(20);
    const g = scene.add.graphics();
    sonicPanel(g, 0, 0, RingCounter.W, RingCounter.H, 'blue');
    sonicPanel(g, 4, 13, RingCounter.W - 8, 16, 'peach');
    this.root.add(g);
    this.root.add(scene.add.image(RingCounter.W / 2, 4, 'hud_rings_label').setOrigin(0.5, 0));
    this.digits = new Digits(scene, RingCounter.W - 9, RingCounter.DIGITS_Y, 5);
    this.root.add(this.digits.root);
    // draaiende ring links van het paneel (de rings uit een wave vliegen hierheen)
    this.ring = scene.add.sprite(x - 9, y + RingCounter.H / 2, 'ui', 'ring_0').setDepth(20).play('ring_spin');
  }

  setText(text: string) {
    const n = Number(text) || 0;
    if (n !== this.value && this.value >= 0) {
      // klein hupje bij elke verandering (altijd terug naar dezelfde plek)
      this.scene.tweens.killTweensOf(this.digits.root);
      this.digits.root.y = RingCounter.DIGITS_Y;
      this.scene.tweens.add({ targets: this.digits.root, y: RingCounter.DIGITS_Y - 2, duration: 60, yoyo: true });
    }
    this.value = n;
    this.digits.set(n);
    return this;
  }
}

/** Klein uitlegvakje (hover over een buff of item). */
export function tooltip(scene: Phaser.Scene, x: number, y: number, title: string, body: string, maxW = 200) {
  const FONT = '"Press Start 2P", monospace';
  const c = scene.add.container(x, y).setDepth(48);
  const t1 = scene.add.text(8, 7, title, { fontFamily: FONT, fontSize: '8px', color: HUD.label });
  const t2 = scene.add.text(8, 20, body, { fontFamily: FONT, fontSize: '8px', color: '#ffffff', lineSpacing: 3, wordWrap: { width: maxW - 16 } });
  const w = Math.min(maxW, Math.max(t1.width, t2.width) + 16), h = 26 + t2.height;
  const g = sonicPanel(scene.add.graphics(), 0, 0, w, h, 'blue', 0.97);
  c.add([g, t1, t2]);
  // binnen beeld houden
  const cam = scene.cameras.main;
  if (x + w > cam.width - 2) c.x = cam.width - 2 - w;
  if (y + h > cam.height - 2) c.y = cam.height - 2 - h;
  return c;
}
