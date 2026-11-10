import Phaser from 'phaser';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

/** Alle credits. Kopjes in geel, namen in wit. Lege string = witregel. */
const CREDITS: Array<[string, string?]> = [
  ['SONIC ROGUE', 'title'],
  ['A fan game by Duncan'],
  ['Inspired by PokeRogue'],
  [''],
  ['SONIC THE HEDGEHOG', 'head'],
  ['All characters, sprites and music'],
  ['(c) SEGA / Sonic Team / Dimps'],
  [''],
  ['SPRITE RIPPERS', 'head'],
  ['Ren "Foxx" Ramos - Sonic, Tails,'],
  ['Knuckles, Cream, Amy, Cheese, Chao'],
  ['QuadFactor - Shadow, Sonic Battle'],
  ['team moves, effects and cut-in art'],
  ['Shadow Mastah - Super Shadow'],
  ['Bacon - Sonic Battle portraits'],
  ['SkyLights, Dinoshi 64 - Eggman'],
  ['SkyLights - Advance 3 badniks,'],
  ['Super Egg Robo Z'],
  ['EternalLight - Advance 3 ending art'],
  ['Fatazz (Turtle474) - Advance 2 badniks'],
  ['Paratiritis - zone backgrounds,'],
  ['X-Zone, XX'],
  ['Ice - Chaos Angel, Twinkle Snow'],
  ['Spitfya, Roj - Chao Garden, rings,'],
  ['monitors'],
  ['raidlandguy - title, menus, intro'],
  ['Random Talking Bush - char select'],
  ['EternalLight - char select'],
  ['Flare - stage + common objects'],
  ['Techokami - shields'],
  ['Gussprint - common objects'],
  [''],
  ['Hosted on The Spriters Resource'],
  [''],
  ['SOUND', 'head'],
  ['Mr Lange - Sonic Sounds Complete'],
  ['(Advance 3 sound rips)'],
  ['SAT-R - SA3 decompilation'],
  ['(which sound is which)'],
  [''],
  ['BUILT WITH', 'head'],
  ['Phaser 3 + TypeScript'],
  ['Code: Duncan and Claude'],
  [''],
  ['Non-commercial. Not affiliated', 'warn'],
  ['with SEGA.', 'warn'],
  [''],
  ['THANKS FOR PLAYING!', 'title'],
];

/** Credits-overlay: rolt langzaam omhoog, X/Esc of klik om te sluiten. Pijltjes scrollen. */
export class CreditsScene extends Phaser.Scene {
  private from = '';
  private list!: Phaser.GameObjects.Container;
  private listH = 0;

  constructor() { super('Credits'); }

  init(data: { from: string }) { this.from = data.from; }

  create() {
    this.add.rectangle(0, 0, W, H, 0x05060c, 1).setOrigin(0).setInteractive();
    this.list = this.add.container(0, H);
    let y = 0;
    for (const [text, kind] of CREDITS) {
      if (text) {
        const color = kind === 'title' ? '#ffd23a' : kind === 'head' ? '#f2c230' : kind === 'warn' ? '#e8443a' : '#ffffff';
        const t = this.add.text(W / 2, y, text, { fontFamily: FONT, fontSize: kind === 'title' ? '16px' : '8px', color }).setOrigin(0.5, 0);
        if (kind === 'head') t.setShadow(1, 1, '#000', 0);
        this.list.add(t);
        y += kind === 'title' ? 24 : 14;
      } else {
        y += 10;
      }
    }
    this.listH = y;
    // zachte rand boven en onder
    const fade = this.add.graphics();
    for (let i = 0; i < 20; i++) {
      fade.fillStyle(0x05060c, 1 - i / 20).fillRect(0, i, W, 1).fillRect(0, H - 1 - i, W, 1);
    }
    this.add.text(W - 8, H - 12, 'X: close', { fontFamily: FONT, fontSize: '8px', color: '#6b7493' }).setOrigin(1, 0);

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['x', 'escape', 'backspace', 'z', 'enter'].includes(k)) this.close();
      else if (['arrowup', 'w'].includes(k)) this.list.y = Math.min(H, this.list.y + 20);
      else if (['arrowdown', 's'].includes(k)) this.list.y = Math.max(-this.listH, this.list.y - 20);
    });
    this.input.on('pointerdown', () => this.close());
  }

  update(_t: number, dt: number) {
    this.list.y -= dt * 0.025;
    if (this.list.y < -this.listH) this.list.y = H;
  }

  private close() {
    this.input.keyboard!.removeAllListeners();
    this.input.removeAllListeners();
    this.scene.resume(this.from);
    this.scene.stop();
  }
}
