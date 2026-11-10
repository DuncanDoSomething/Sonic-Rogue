// ---------------------------------------------------------------------------
// Ending na wave 90 (Super Egg Robo Z verslagen): de groepsfoto uit de Sonic Advance 3-ending,
// een kort gesprekje tussen je teamleden, de vier plaatjes uit de ending als filmstrip,
// CONGRATULATIONS, en dan de run summary. X / Esc slaat alles over.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { audio } from '../audio';
import { HEROES } from '../data/fighters';
import type { Exchange, Mood } from '../data/dialogue';
import type { RunSummary } from '../data/summary';
import { playTalk, type TalkHandle } from './talk';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

/** Eerste regel: wie vooraan staat viert de overwinning. */
const CHEER: Record<string, [Mood, string]> = {
  sonic: ['happy', "That's the last of Eggman's toys! Super Egg Robo Z is scrap metal now."],
  tails: ['happy', 'We did it! Super Egg Robo Z is nothing but spare parts now!'],
  knuckles: ['smug', "Hmph. Eggman's biggest robot, and it still couldn't take a punch."],
  amy: ['happy', 'We did it! Eggman\'s ultimate weapon, smashed to pieces!'],
  cream: ['happy', 'We won! Cheese, we really won!'],
  shadow: ['smug', "The doctor's ultimate weapon... It wasn't ultimate enough."],
};
/** Antwoord van een teamgenoot. */
const REPLY: Record<string, [Mood, string]> = {
  sonic: ['smug', "Couldn't have done it without you. Now... who's up for a run?"],
  tails: ['happy', "Let's head home. I bet Eggman's already drawing up a new plan, though!"],
  knuckles: ['normal', "Don't get too comfortable. Eggman always comes back."],
  amy: ['happy', "Let's celebrate! I'll bake a cake for everyone!"],
  cream: ['happy', 'Thank you all so much! Let\'s have a picnic together!'],
  shadow: ['normal', "...You fought well. Don't let it go to your head."],
};
/** Slotzin van wie begon. */
const CLOSE: Record<string, [Mood, string]> = {
  sonic: ['happy', 'Then what are we waiting for? Last one home is a rotten egg!'],
  tails: ['happy', "And whatever he builds next, we'll be ready for it!"],
  knuckles: ['smug', "Heh. Let him come. I'll be waiting."],
  amy: ['happy', 'Come on, everyone! Let\'s go home!'],
  cream: ['happy', 'Come on, Cheese! Let\'s go home!'],
  shadow: ['normal', "Hmph. Until next time, Doctor."],
};

export class EndingScene extends Phaser.Scene {
  private sum!: RunSummary;
  private done = false;
  private talk?: TalkHandle;

  constructor() { super('Ending'); }

  init(data: RunSummary) { this.sum = data; this.done = false; this.talk = undefined; }

  create() {
    this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0);
    audio.playMusic('victory');
    // groepsfoto: langzaam van boven naar beneden pannen
    const art = this.add.image(W / 2, 0, 'ending_group').setOrigin(0.5, 0);
    art.setScale(W / art.width);
    art.setAlpha(0);
    const pan = art.displayHeight - H;
    this.tweens.add({ targets: art, alpha: 1, duration: 900 });
    this.tweens.add({ targets: art, y: -pan, duration: 7000, ease: 'Sine.easeInOut' });
    this.cameras.main.fadeIn(600, 255, 255, 255);

    const skip = this.add.text(W - 8, 6, 'X: skip', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 }).setOrigin(1, 0).setDepth(70);
    skip.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.finish());
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (['x', 'X', 'Escape', 'Backspace'].includes(e.key)) this.finish();
      else if (['z', 'Z', 'Enter', ' '].includes(e.key)) this.talk?.next();
    });

    void this.run(art);
  }

  private wait(ms: number) { return new Promise<void>(r => this.time.delayedCall(ms, () => r())); }

  private async run(art: Phaser.GameObjects.Image) {
    await this.wait(1600);
    if (this.done) return;
    // gesprekje: de eerste twee van je team (alleen? dan komt er een vriend langs)
    const ids = this.sum.party.map(f => f.id).filter(id => CHEER[id]);
    const a = ids[0] ?? 'sonic';
    const b = ids[1] ?? (a === 'sonic' ? 'tails' : 'sonic');
    const lines: Exchange = [
      { who: 'ally', mood: CHEER[a][0], text: CHEER[a][1] },
      { who: 'rival', mood: REPLY[b][0], text: REPLY[b][1] },
      { who: 'ally', mood: CLOSE[a][0], text: CLOSE[a][1] },
    ];
    if (HEROES.includes(a) && HEROES.includes(b)) {
      this.talk = playTalk(this, lines, a, b, true);
      await this.talk.done;
      this.talk = undefined;
    }
    if (this.done) return;

    // filmstrip met de vier plaatjes uit de ending, van rechts naar links
    this.tweens.add({ targets: art, alpha: 0.35, duration: 500 });
    const scale = 1.5, pw = 160 * scale, gap = 10;
    const strip = this.add.container(W, H / 2 - 32 * scale);
    for (let i = 0; i < 4; i++) {
      const x = i * (pw + gap);
      const frame = this.add.rectangle(x - 3, -3, pw + 6, 64 * scale + 6, 0xffffff).setOrigin(0);
      strip.add([frame, this.add.image(x, 0, `ending_panel_${i}`).setOrigin(0).setScale(scale)]);
    }
    const len = 4 * (pw + gap);
    await new Promise<void>(r => this.tweens.add({ targets: strip, x: -len, duration: 9000, ease: 'Linear', onComplete: () => r() }));
    if (this.done) return;

    // CONGRATULATIONS!
    this.tweens.add({ targets: art, alpha: 1, duration: 600 });
    const congrats = this.add.image(W / 2, -20, 'ending_congrats').setScale(2).setDepth(60);
    audio.sfx('confirm2');
    await new Promise<void>(r => this.tweens.add({ targets: congrats, y: 40, duration: 700, ease: 'Bounce.easeOut', onComplete: () => r() }));
    for (let i = 0; i < 14; i++) {
      const s = this.add.image(W / 2 + Phaser.Math.Between(-170, 170), 40 + Phaser.Math.Between(-16, 16), 'spark').setDepth(61).setTint(0xffd23a);
      this.tweens.add({ targets: s, alpha: 0, scale: 2, duration: 700, delay: i * 60, onComplete: () => s.destroy() });
    }
    const hint = this.add.text(W / 2, H - 14, 'Press Z', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
    await new Promise<void>(r => {
      this.input.keyboard?.once('keydown-Z', () => r());
      this.input.once('pointerdown', () => r());
    });
    this.finish();
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    this.talk?.skip();
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Summary', this.sum));
  }
}
