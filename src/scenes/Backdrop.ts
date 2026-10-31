import Phaser from 'phaser';

// ---------------------------------------------------------------------------
// Zone-achtergronden. Alles op 2x schaal, net als de sprites (GBA-pixels x2).
// Elke backdrop bouwt zijn lagen in een container; wisselen gaat met een fade.
// ---------------------------------------------------------------------------

const W = 480;
const S = 2;

export interface PlatformStyle { top: number; side: number; shadow: number; }

interface BuiltBackdrop { container: Phaser.GameObjects.Container; stop: () => void; }

type Builder = (scene: Phaser.Scene, h: number) => BuiltBackdrop;

/** Hulpje: getegelde laag op 2x. offY/offX zijn in bron-pixels. */
function tiled(scene: Phaser.Scene, key: string, h: number, offY = 0) {
  const t = scene.add.tileSprite(0, 0, W, h, key).setOrigin(0).setTileScale(S);
  t.tilePositionY = offY;
  return t;
}

export const BACKDROPS: Record<string, { build: Builder; platform: PlatformStyle }> = {
  route99: {
    platform: { top: 0xc8d8ff, side: 0x7d8fd8, shadow: 0x2a2f80 },
    build: (scene, h) => {
      const back = tiled(scene, 'route99_back', h, 58);
      // wolken en skyline schuiven langzaam (de laag loopt naadloos door)
      const tw = scene.tweens.add({ targets: back, tilePositionX: 256, duration: 60000, repeat: -1 });
      return { container: scene.add.container(0, 0, [back]), stop: () => tw.stop() };
    },
  },
  sunset: {
    platform: { top: 0x9ad04a, side: 0x5f8a2a, shadow: 0x5a2010 },
    build: (scene) => {
      // Laat de zonsondergang zien met de grond eronder. De losse palmbomen-laag
      // (sunset_front) staat in assets, maar op 2x bedekte hij de hele battle.
      const back = scene.add.image(0, -20 * S, 'sunset_back').setOrigin(0).setScale(S);
      return { container: scene.add.container(0, 0, [back]), stop: () => {} };
    },
  },
  toy: {
    platform: { top: 0xffe070, side: 0xe08a2a, shadow: 0x7a3060 },
    build: (scene, h) => {
      const back = scene.add.image(-16, -30 * S, 'toy_back').setOrigin(0).setScale(S);
      // de ballen zweven eindeloos omhoog en wiegen een beetje heen en weer
      const balls = tiled(scene, 'toy_front', h, 0).setAlpha(0.8);
      const up = scene.tweens.add({ targets: balls, tilePositionY: 256, duration: 18000, repeat: -1 });
      const sway = scene.tweens.add({ targets: balls, tilePositionX: 12, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      return { container: scene.add.container(0, 0, [back, balls]), stop: () => { up.stop(); sway.stop(); } };
    },
  },
  twinkle: {
    platform: { top: 0xf4f8ff, side: 0x9ab8f0, shadow: 0x3a3a9a },
    build: (scene) => {
      const y = -66 * S;
      const back = scene.add.image(0, y, 'twinkle_back').setOrigin(0).setScale(S);
      // 9 frames poollicht over de bovenste 112 rijen, heen en weer afgespeeld
      const aurora = scene.add.image(0, y, 'twinkle_aurora_1').setOrigin(0).setScale(S);
      const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 3, 2];
      let i = 0;
      const timer = scene.time.addEvent({ delay: 160, loop: true, callback: () => aurora.setTexture(`twinkle_aurora_${order[++i % order.length]}`) });
      return { container: scene.add.container(0, 0, [back, aurora]), stop: () => timer.remove() };
    },
  },
  // ---------------------------------------------------------------- Sonic Advance 2
  leafforest: {
    platform: { top: 0xa8e070, side: 0x5a9a3a, shadow: 0x24507a },
    build: (scene, h) => {
      const back = tiled(scene, 'leafforest_back', h, 20);
      // de geblokte voorgrond schuift langzamer heen en weer dan de wolken (parallax)
      const front = scene.add.tileSprite(0, 140, W, 200 * S, 'leafforest_front').setOrigin(0).setTileScale(S);
      const clouds = scene.tweens.add({ targets: back, tilePositionX: 256, duration: 70000, repeat: -1 });
      const drift = scene.tweens.add({ targets: front, tilePositionX: 40, duration: 9000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      return { container: scene.add.container(0, 0, [back, front]), stop: () => { clouds.stop(); drift.stop(); } };
    },
  },
  hotcrater: {
    platform: { top: 0xc0b8b0, side: 0x6a625a, shadow: 0x3a1a10 },
    build: (scene, h) => {
      // onderkant van de laag in beeld: nevelige bergen en de rotsen
      const back = tiled(scene, 'hotcrater_back', h, 160 - h / S);
      const tw = scene.tweens.add({ targets: back, tilePositionX: 256, duration: 50000, repeat: -1 });
      return { container: scene.add.container(0, 0, [back]), stop: () => tw.stop() };
    },
  },
  musicplant: {
    platform: { top: 0xffe6f4, side: 0xe070b0, shadow: 0x8a2a6a },
    build: (scene, h) => {
      // sterren, de reuze-instrumenten en de gekleurde blokken eronder
      const back = tiled(scene, 'musicplant_back', h, 90);
      const tw = scene.tweens.add({ targets: back, tilePositionX: 256, duration: 60000, repeat: -1 });
      return { container: scene.add.container(0, 0, [back]), stop: () => tw.stop() };
    },
  },
  iceparadise: {
    platform: { top: 0xeaf6ff, side: 0x7ab0e8, shadow: 0x10206a },
    build: (scene, h) => {
      const off = 70;
      const back = tiled(scene, 'iceparadise_back', h, off);
      // zoeklichten: de lichtere versie van de achtergrond, alleen zichtbaar binnen twee zwaaiende bundels
      const spot = tiled(scene, 'iceparadise_spot', h, off);
      const beams = scene.make.graphics({ x: 0, y: 0 }, false);
      spot.setMask(beams.createGeometryMask());
      let t = 0;
      const draw = () => {
        t += 16;
        beams.clear().fillStyle(0xffffff);
        for (const [ox, base, ph] of [[60, -0.35, 0], [W - 60, 0.35, 2.1]] as const) {
          const a = base + Math.sin(t / 2600 + ph) * 0.45;      // hoek van de bundel
          const len = 420, spread = 0.09;
          beams.fillTriangle(ox, h, ox + Math.sin(a - spread) * len, h - Math.cos(a - spread) * len,
            ox + Math.sin(a + spread) * len, h - Math.cos(a + spread) * len);
        }
      };
      draw();
      const timer = scene.time.addEvent({ delay: 16, loop: true, callback: draw });
      return { container: scene.add.container(0, 0, [back, spot]), stop: () => { timer.remove(); beams.destroy(); } };
    },
  },
  skycanyon: {
    platform: { top: 0xf2dcae, side: 0xb88a50, shadow: 0x5a4a8a },
    build: (scene) => {
      const top = -40 * S; // bovenste stuk lucht valt weg, bergen en wolken in beeld
      const parts: Phaser.GameObjects.GameObject[] = [];
      const tweens: Phaser.Tweens.Tween[] = [];
      const back = scene.add.tileSprite(0, top, W, 96 * S, 'skycanyon_back').setOrigin(0).setTileScale(S);
      parts.push(back);
      tweens.push(scene.tweens.add({ targets: back, tilePositionX: 256, duration: 120000, repeat: -1 }));
      // 7 wolkenstroken eronder; hoe lager, hoe sneller ze naar links schuiven
      const heights = [4, 4, 8, 8, 8, 16, 40];
      let y = top + 96 * S;
      heights.forEach((hh, i) => {
        const c = scene.add.tileSprite(0, y, W, hh * S, `skycanyon_cloud_${i}`).setOrigin(0).setTileScale(S);
        tweens.push(scene.tweens.add({ targets: c, tilePositionX: 256, duration: 40000 / (i + 1), repeat: -1 }));
        parts.push(c);
        y += hh * S;
      });
      return { container: scene.add.container(0, 0, parts), stop: () => tweens.forEach(t => t.stop()) };
    },
  },
  chaosangel: {
    platform: { top: 0xf2e8ff, side: 0xa58ad8, shadow: 0x3a2a6a },
    build: (scene) => {
      const img = scene.add.image(-16, -40 * S, 'chaosangel_1').setOrigin(0).setScale(S);
      // flits-volgorde van de ripper: onderste wolken, pauze, bovenste wolken (2 fases), pauze
      const seq = [3, 2, 3, 4, 1, 3, 4, 1, 4, 1, 4, 1, 0,
                   6, 1, 5, 6, 1, 6, 1, 6, 1, 0,
                   6, 5, 6, 1, 6, 1, 6, 1, 6, 1, 0];
      let i = 0;
      let timer: Phaser.Time.TimerEvent;
      const step = () => {
        const f = seq[i++ % seq.length];
        img.setTexture(`chaosangel_${f || 1}`);
        timer = scene.time.delayedCall(f === 0 ? 1400 : 90, step);
      };
      step();
      return { container: scene.add.container(0, 0, [img]), stop: () => timer.remove() };
    },
  },
};

export class Backdrop {
  private current?: BuiltBackdrop;
  key = '';

  constructor(private scene: Phaser.Scene, private height: number, private depth = 0) {}

  get platform(): PlatformStyle { return BACKDROPS[this.key].platform; }

  show(key: string, fadeMs = 0) {
    if (key === this.key) return;
    this.key = key;
    const old = this.current;
    const next = BACKDROPS[key].build(this.scene, this.height);
    next.container.setDepth(this.depth);
    this.current = next;
    if (old) {
      old.container.setDepth(this.depth + 0.5);
      this.scene.tweens.add({
        targets: old.container, alpha: 0, duration: fadeMs || 1,
        onComplete: () => { old.stop(); old.container.destroy(); },
      });
    }
  }
}
