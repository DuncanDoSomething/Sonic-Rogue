import Phaser from 'phaser';

/**
 * Nep-3D zee in de stijl van de GBA "Mode 7": elke beeldlijn onder de horizon tekent één
 * rij van de watertextuur, verder weg = kleiner en sneller. Wordt elke frame op een
 * canvas-texture getekend, zodat de pixels scherp blijven.
 */
export class Mode7 {
  readonly image: Phaser.GameObjects.Image;
  horizon = 46;
  scrollZ = 0;
  scrollX = 0;
  speed = 0.4;
  /** hoe diep de zee lijkt: groter = kleinere golven vooraan, meer golven tot de horizon */
  depth = 17000;
  /** hoe breed de golven zijn: groter = bredere golven (minder naast elkaar) */
  spread = 200;
  /** hoogte van de witte nevel boven het water (in pixels onder de horizon) */
  haze = 70;
  private canvas: Phaser.Textures.CanvasTexture;
  /** patronen per detail-niveau: niveau n is verticaal uitgemiddeld over 2^n rijen (tegen flikkerruis in de verte) */
  private patterns: CanvasPattern[] = [];
  private matrix = new DOMMatrix();
  private th: number;

  constructor(private scene: Phaser.Scene, key: string, private w: number, private h: number, depth = 0) {
    const tex = scene.textures.get(key).getSourceImage() as HTMLImageElement;
    this.th = tex.height;
    const ckey = `mode7_${key}`;
    if (scene.textures.exists(ckey)) scene.textures.remove(ckey);
    this.canvas = scene.textures.createCanvas(ckey, w, h)!;
    // eindeloos herhalend patroon: zo loopt het water echt in perspectief door tot de horizon
    const ctx = this.canvas.getContext();
    for (const lvl of Mode7.mipLevels(tex)) this.patterns.push(ctx.createPattern(lvl, 'repeat')!);
    this.image = scene.add.image(0, 0, ckey).setOrigin(0).setDepth(depth);
  }

  update(dt: number) {
    this.scrollZ = (this.scrollZ + dt * this.speed) % this.th;
    const ctx = this.canvas?.getContext();
    if (!ctx || !this.image.active) return; // scene is al afgesloten
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.w, this.h);
    const top = Math.max(0, Math.floor(this.horizon));
    if (top >= this.h) { this.canvas.refresh(); return; }
    const m = this.matrix;
    for (let y = top; y < this.h; y++) {
      const d = y - this.horizon + 1;            // afstand onder de horizon
      const z = this.depth / d;                  // diepte van deze lijn
      const v = Math.floor(this.scrollZ + z);    // welke rij van de textuur
      const sw = (z * this.w) / this.spread;     // zoveel textuur-pixels passen op deze lijn
      const k = this.w / sw;                     // schaal: scherm-pixels per textuur-pixel
      const sx = this.scrollX - sw / 2;          // textuur-x links in beeld (midden = verdwijnpunt)
      // patroon-coördinaten -> scherm: x' = (u - sx) * k, y' = t - v + y
      m.a = k; m.b = 0; m.c = 0; m.d = 1; m.e = -sx * k; m.f = y - v;
      // ver weg slaat elke beeldlijn veel textuur-rijen over: dan een uitgemiddelde versie,
      // zodat de golven overgaan in strepen naar het verdwijnpunt (zoals op de GBA) i.p.v. ruis
      const skip = this.depth / (d * d);
      const lvl = Math.max(0, Math.min(this.patterns.length - 1, Math.floor(Math.log2(Math.max(1, skip)))));
      const pat = this.patterns[lvl];
      pat.setTransform(m);
      ctx.fillStyle = pat;
      ctx.fillRect(0, y, this.w, 1);
    }
    // lichte nevel naar de horizon toe, zoals in de Advance 2-intro
    const g = ctx.createLinearGradient(0, this.horizon - 2, 0, this.horizon + this.haze);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(236,248,255,0.75)');
    g.addColorStop(1, 'rgba(220,240,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, this.horizon - 2, this.w, this.haze + 2);
    this.canvas.refresh();
  }

  /** Maakt verticaal uitgemiddelde kopieën van de textuur (niveau 0 = origineel). */
  private static mipLevels(tex: HTMLImageElement): HTMLCanvasElement[] {
    const w = tex.width, h = tex.height;
    const base = document.createElement('canvas');
    base.width = w; base.height = h;
    const bctx = base.getContext('2d')!;
    bctx.drawImage(tex, 0, 0);
    const src = bctx.getImageData(0, 0, w, h).data;
    const out = [base];
    for (let n = 1; n <= 5; n++) {
      const win = 1 << n;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cctx = c.getContext('2d')!;
      const img = cctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < win; i++) {
            const o = (((y + i) % h) * w + x) * 4;
            r += src[o]; g += src[o + 1]; b += src[o + 2];
          }
          const o = (y * w + x) * 4;
          img.data[o] = r / win; img.data[o + 1] = g / win; img.data[o + 2] = b / win; img.data[o + 3] = 255;
        }
      }
      cctx.putImageData(img, 0, 0);
      out.push(c);
    }
    return out;
  }

  destroy() {
    this.image.destroy();
    if (this.scene.textures.exists(this.canvas.key)) this.scene.textures.remove(this.canvas.key);
  }
}
