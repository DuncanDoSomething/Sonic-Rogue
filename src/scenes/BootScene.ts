import Phaser from 'phaser';
import sonicPng from '../assets/sonic.png';
import sonicAtlas from '../assets/sonic.json';
import sonicAnims from '../assets/sonic_anims.json';
import tailsPng from '../assets/tails.png';
import tailsAtlas from '../assets/tails.json';
import tailsAnims from '../assets/tails_anims.json';
import knucklesPng from '../assets/knuckles.png';
import knucklesAtlas from '../assets/knuckles.json';
import knucklesAnims from '../assets/knuckles_anims.json';
import creamPng from '../assets/cream.png';
import creamAtlas from '../assets/cream.json';
import creamAnims from '../assets/cream_anims.json';
import amyPng from '../assets/amy.png';
import amyAtlas from '../assets/amy.json';
import amyAnims from '../assets/amy_anims.json';
import badniksPng from '../assets/badniks.png';
import badniksAtlas from '../assets/badniks.json';
import badnikAnims from '../assets/badnik_anims.json';
import uiPng from '../assets/ui/ui.png';
import uiAtlas from '../assets/ui/ui.json';
import emeraldsPng from '../assets/bg/emeralds.png';
import emeraldsAtlas from '../assets/bg/emeralds.json';
import fxPng from '../assets/fx.png';
import fxAtlas from '../assets/fx.json';
import fxAnims from '../assets/fx_anims.json';
import { EMERALDS } from '../data/zones';
import { preloadSounds } from '../audio';

// alle losse plaatjes uit assets/bg en assets/menu (key = bestandsnaam zonder .png)
const BG_IMAGES = {
  ...import.meta.glob('../assets/bg/*.png', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../assets/menu/*.png', { eager: true, query: '?url', import: 'default' }),
} as Record<string, string>;
// grote artworks voor de ultimate cut-in (key = cutin_<id>)
const CUTINS = import.meta.glob('../assets/cutin/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

type AnimFrame = string | { frame: string; duration: number };
interface CharAnim { key: string; frames: AnimFrame[]; frameRate: number; repeat: number; }

const CHARACTERS: Array<[string, string, unknown, Record<string, CharAnim>]> = [
  ['sonic', sonicPng, sonicAtlas, sonicAnims as Record<string, CharAnim>],
  ['tails', tailsPng, tailsAtlas, tailsAnims as Record<string, CharAnim>],
  ['knuckles', knucklesPng, knucklesAtlas, knucklesAnims as Record<string, CharAnim>],
  ['cream', creamPng, creamAtlas, creamAnims as Record<string, CharAnim>],
  ['amy', amyPng, amyAtlas, amyAnims as Record<string, CharAnim>],
];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    // atlas JSON wordt direct als object meegegeven (geen extra request nodig)
    for (const [key, png, json] of CHARACTERS) this.load.atlas(key, png, json as string);
    this.load.atlas('badniks', badniksPng, badniksAtlas as unknown as string);
    this.load.atlas('emeralds', emeraldsPng, emeraldsAtlas as unknown as string);
    this.load.atlas('ui', uiPng, uiAtlas as unknown as string);
    this.load.atlas('fx', fxPng, fxAtlas as unknown as string);
    for (const [path, url] of Object.entries(CUTINS)) this.load.image(`cutin_${path.split('/').pop()!.replace('.png', '')}`, url);
    preloadSounds(this);
    for (const [path, url] of Object.entries(BG_IMAGES)) {
      const key = path.split('/').pop()!.replace('.png', '');
      if (key !== 'emeralds') this.load.image(key, url);
    }
  }

  create() {
    // Character-animaties: 'sonic_idle', 'tails_punch', ...
    for (const [key, , , anims] of CHARACTERS) {
      for (const a of Object.values(anims)) {
        this.anims.create({
          key: a.key,
          frames: a.frames.map(f => (typeof f === 'string' ? { key, frame: f } : { key, frame: f.frame, duration: f.duration })),
          frameRate: a.frameRate,
          repeat: a.repeat,
        });
      }
    }
    // Super Sonic en effecten: 'ss_dash', 'fx_burst', 'cheese_fly', ...
    for (const a of Object.values(fxAnims as Record<string, CharAnim>)) {
      this.anims.create({ key: a.key, frames: a.frames.map(f => ({ key: 'fx', frame: f as string })), frameRate: a.frameRate, repeat: a.repeat });
    }
    // Badnik-animaties: '<id>_idle' loopt, '<id>_attack' speelt één keer
    for (const [name, frames] of Object.entries(badnikAnims as Record<string, string[]>)) {
      const isIdle = name.endsWith('_idle') && !name.startsWith('explosion');
      this.anims.create({
        key: name.startsWith('explosion') ? 'explosion' : name,
        frames: frames.map(f => ({ key: 'badniks', frame: f })),
        frameRate: isIdle ? 8 : 12,
        repeat: isIdle ? -1 : 0,
      });
    }
    // Chaos Emeralds: korte glim, dan even rust
    for (const c of EMERALDS) {
      this.anims.create({
        key: `emerald_${c}`,
        frames: Array.from({ length: 8 }, (_, i) => ({ key: 'emeralds', frame: `emerald_${c}_${i}` })),
        frameRate: 12, repeat: -1, repeatDelay: 1600,
      });
    }
    // rings, glinsters en monitor-rook
    const strip = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: 'ui', frame: `${prefix}_${i}` }));
    this.anims.create({ key: 'ring_spin', frames: strip('ring', 4), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'sparkle', frames: strip('sparkle', 4), frameRate: 14, repeat: 0 });
    this.anims.create({ key: 'smoke', frames: strip('smoke', 4), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'bigring_spin', frames: strip('bigring', 7), frameRate: 10, repeat: -1 });
    // shield-bubbel en Toy Kingdom-ballonnen (losse plaatjes uit assets/menu)
    this.anims.create({ key: 'shield', frames: Array.from({ length: 6 }, (_, i) => ({ key: `fx_shield_${i}` })), frameRate: 12, repeat: -1 });
    // zeemeeuw uit de Advance 2-intro
    this.anims.create({ key: 'intro_bird', frames: [{ key: 'intro_bird_0' }, { key: 'intro_bird_1' }], frameRate: 5, repeat: -1 });
    for (const c of ['blue', 'yellow', 'red', 'green']) {
      this.anims.create({ key: `balloon_${c}`, frames: [0, 1, 2, 1].map(i => ({ key: `fx_balloon_${c}_${i}` })), frameRate: 4, repeat: -1 });
    }
    this.makeSmallTextures();
    this.scene.start('Title');
  }

  private makeSmallTextures() {
    const g = this.add.graphics();
    // ring-icoon
    g.lineStyle(2, 0xf2c230).strokeCircle(6, 6, 4);
    g.fillStyle(0xfff1a8).fillRect(3, 3, 2, 2);
    g.generateTexture('ring', 12, 12);
    g.clear();
    // chili dog (shop-icoon), 16x10 pixels, wordt op 2x getekend
    g.fillStyle(0x3a1a08).fillRoundedRect(0, 3, 16, 7, 3);
    g.fillStyle(0xe8b060).fillRoundedRect(1, 4, 14, 5, 2);
    g.fillStyle(0x3a1a08).fillRoundedRect(0, 1, 16, 5, 2);
    g.fillStyle(0xc0503a).fillRoundedRect(1, 2, 14, 3, 1);
    g.fillStyle(0x7a2010);
    for (const [x, y] of [[2, 1], [5, 0], [8, 1], [11, 0], [13, 1], [4, 2], [9, 2]]) g.fillRect(x, y, 2, 1);
    g.fillStyle(0xf2d030).fillRect(3, 3, 3, 1).fillRect(8, 3, 4, 1);
    g.generateTexture('chilidog', 16, 10);
    g.clear();
    // projectiel (wordt per move getint)
    g.fillStyle(0xffffff).fillCircle(5, 5, 5);
    g.fillStyle(0xffffff, 0.6).fillCircle(5, 5, 3);
    g.generateTexture('spark', 10, 10);
    g.clear();
    // wit pixel-deeltje
    g.fillStyle(0xffffff).fillRect(0, 0, 3, 3);
    g.generateTexture('px', 3, 3);
    g.clear();
    // bewegende achtergrondlijnen (PokéRogue-stijl)
    g.fillStyle(0xffffff, 0.05);
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 96 + ((y * 37) % 60), 2);
    g.generateTexture('streaks', 256, 64);
    g.clear();
    // hartje (Amy, Cream), 9x8
    g.fillStyle(0xffffff).fillCircle(2.5, 2.5, 2.5).fillCircle(6.5, 2.5, 2.5).fillTriangle(0, 3, 9, 3, 4.5, 8);
    g.generateTexture('heart', 9, 8);
    g.clear();
    // sterretje (stun), 7x7
    g.fillStyle(0xffffff).fillPoints([
      { x: 3.5, y: 0 }, { x: 4.5, y: 2.5 }, { x: 7, y: 2.7 }, { x: 5, y: 4.4 }, { x: 5.8, y: 7 },
      { x: 3.5, y: 5.6 }, { x: 1.2, y: 7 }, { x: 2, y: 4.4 }, { x: 0, y: 2.7 }, { x: 2.5, y: 2.5 },
    ], true);
    g.generateTexture('star', 7, 7);
    g.destroy();
  }
}
