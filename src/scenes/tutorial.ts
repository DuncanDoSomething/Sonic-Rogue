// ---------------------------------------------------------------------------
// Tutorial: een oefengevecht met Tails als gids. Het script hieronder loopt stap voor stap;
// BattleScene meldt wat er gebeurt (event) en vraagt of een actie nu mag (allows).
// Praat-stappen wachten op Z of een klik; doe-stappen wachten tot jij het juiste doet.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { audio } from '../audio';
import { HUD, sonicPanel } from './hud';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

export interface TutorialStep {
  text: string;
  /** Tails kijkt serieus (waarschuwingen, de vijand); anders blij */
  serious?: boolean;
  /** wat er uitgelicht wordt (BattleScene.tutRect) */
  focus?: string;
  /** pas tonen als dit gebeurt (bijv. 'command' = je bent weer aan de beurt) */
  showOn?: string;
  /** wacht op dit event; zonder = praat-stap (Z of klik) */
  waitFor?: string;
  /** acties die mogen ('cmd:0', 'move:spinAttack', 'move:*', 'item:healthRing', 'reward:*') */
  allow?: string[];
  /** iets klaarzetten als de stap begint (BattleScene.tutPrep) */
  prep?: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { showOn: 'command', text: "Hey Sonic! Let's practice before the real thing. I'll walk you through a fight." },
  { focus: 'pBox', text: 'This is you: your HP, and below it the Boost meter. Boost powers your strongest moves.' },
  { focus: 'eBox', serious: true, text: "That's the foe. Bring its HP down to zero to win the wave." },
  { focus: 'move:spinAttack', text: "Pick FIGHT, then Spin Attack. It's free and gives you +1 Boost!", allow: ['cmd:0', 'move:spinAttack'], waitFor: 'move:spinAttack' },
  { showOn: 'command', focus: 'pBox', text: 'Nice! Your Boost went up. Getting hit gives +1 Boost too.' },
  { focus: 'move:homingAttack', text: 'Now Homing Attack. It costs 1 Boost, never misses and always goes first.', allow: ['cmd:0', 'move:homingAttack'], waitFor: 'move:homingAttack' },
  { showOn: 'command', prep: 'hurt', focus: 'bag', serious: true, text: "You took some hits. Your bag is up here: hover it to see what's inside." },
  { focus: 'item:healthRing', text: "Open ITEMS and use the heart. Items don't cost your turn, but you get one per fight.", allow: ['cmd:2', 'item:healthRing'], waitFor: 'item' },
  { showOn: 'command', focus: 'cmd:1', serious: true, text: 'Now switch to me! Open PARTY. Switching costs your turn, so the foe gets a free hit.', allow: ['cmd:1'], waitFor: 'switched' },
  { showOn: 'command', focus: 'heads', text: "I'm in! Your team is shown above your box. Press I anytime to read our moves." },
  { prep: 'finish', focus: 'move:any', serious: true, text: "Let's finish this: pick FIGHT and any attack!", allow: ['cmd:0', 'move:*'], waitFor: 'win' },
  { showOn: 'reward', focus: 'cards', text: 'We won! After every wave you pick one free reward. The border shows how rare it is.' },
  { focus: 'shop', text: 'Up top is the shop: spend rings on hearts for your bag, or reroll the rewards.' },
  { focus: 'team', text: 'Down here you see the HP and Boost of the whole team.' },
  { focus: 'cards', text: 'Pick a reward to finish the practice!', allow: ['reward:*'], waitFor: 'reward-picked' },
];

export interface TutorialHost {
  /** rechthoek van wat er uitgelicht moet worden, of niks */
  tutRect(focus: string): Phaser.Geom.Rectangle | undefined;
  tutPrep(what: string): void;
}

/** Tails met een tekstballon, een donkere laag met een gat op wat je moet zien, en de stap-logica. */
export class TutorialCoach {
  private index = 0;
  private shown = false;
  private layer: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Graphics;
  private frame: Phaser.GameObjects.Graphics;
  private bubble?: Phaser.GameObjects.Container;
  private blocker: Phaser.GameObjects.Zone;
  private lastRect = '';

  constructor(private scene: Phaser.Scene, private host: TutorialHost, private steps = TUTORIAL_STEPS) {
    this.layer = scene.add.container(0, 0).setDepth(60);
    this.dim = scene.add.graphics();
    this.frame = scene.add.graphics();
    this.layer.add([this.dim, this.frame]);
    scene.tweens.add({ targets: this.frame, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
    // praat-stappen: klik waar dan ook = verder (en niks eronder wordt aangeklikt)
    this.blocker = scene.add.zone(0, 0, W, H).setOrigin(0).setDepth(59).setInteractive();
    this.blocker.on('pointerdown', () => { if (this.talking) this.next(); });
    this.blocker.disableInteractive();
    this.enter();
  }

  get step(): TutorialStep | undefined { return this.steps[this.index]; }
  get done() { return this.index >= this.steps.length; }
  /** een praat-stap staat in beeld: alleen Z / klik (en M) doen iets */
  get talking() { return this.shown && !!this.step && !this.step.waitFor; }

  /** Mag deze actie nu? Na de laatste stap mag alles. */
  allows(action: string): boolean {
    const s = this.step;
    if (!s) return true;
    if (!this.shown || !s.waitFor) return false;
    return (s.allow ?? []).some(a => a === action || (a.endsWith(':*') && action.startsWith(a.slice(0, -1))));
  }

  /** BattleScene meldt wat er gebeurt. */
  event(name: string) {
    const s = this.step;
    if (!s) return;
    if (!this.shown && s.showOn === name) { this.show(); return; }
    if (this.shown && s.waitFor === name) this.next();
  }

  /** Verkeerde knop: Tails schudt even nee. */
  nudge() {
    if (!this.bubble) return;
    this.scene.tweens.add({ targets: this.bubble, x: this.bubble.x + 4, duration: 50, yoyo: true, repeat: 2 });
  }

  next() {
    if (this.talking) audio.sfx('confirm');
    this.index++;
    this.hide();
    this.enter();
  }

  private enter() {
    const s = this.step;
    if (!s) return;
    if (!s.showOn) this.show();
  }

  private show() {
    const s = this.step!;
    this.shown = true;
    if (s.prep) this.host.tutPrep(s.prep);
    this.lastRect = '';
    this.update();
    this.drawBubble(s.text, !s.waitFor, s.serious);
    if (!s.waitFor) this.blocker.setInteractive(); else this.blocker.disableInteractive();
  }

  private hide() {
    this.shown = false;
    this.bubble?.destroy();
    this.bubble = undefined;
    this.dim.clear();
    this.frame.clear();
    this.blocker.disableInteractive();
  }

  /** Elke frame: het uitgelichte stuk volgt de UI (Fight-menu open of dicht, keuzelijstje ...). */
  update() {
    if (!this.shown || !this.step) return;
    const r = this.step.focus ? this.host.tutRect(this.step.focus) : undefined;
    const key = r ? `${r.x},${r.y},${r.width},${r.height}` : 'none';
    if (key === this.lastRect) return;
    this.lastRect = key;
    this.dim.clear();
    this.frame.clear();
    if (!r) {
      this.dim.fillStyle(0x05060c, 0.3).fillRect(0, 0, W, H);
    } else {
      const p = 3, x = r.x - p, y = r.y - p, w = r.width + p * 2, h = r.height + p * 2;
      this.dim.fillStyle(0x05060c, 0.5);
      this.dim.fillRect(0, 0, W, Math.max(0, y)).fillRect(0, y + h, W, H - y - h)
        .fillRect(0, y, Math.max(0, x), h).fillRect(x + w, y, W - x - w, h);
      this.frame.lineStyle(2, HUD.gold).strokeRoundedRect(x, y, w, h, 4);
    }
    // ballon niet over het uitgelichte stuk
    if (this.bubble) this.bubble.y = this.bubbleY(r);
  }

  private bubbleY(r?: Phaser.Geom.Rectangle) {
    if (!r) return 70;
    const cy = r.y + r.height / 2;
    return cy < 120 ? Math.min(150, r.y + r.height + 14) : Math.max(4, r.y - 76);
  }

  /** Tekstballon met Tails links ernaast; bij praat-stappen een knipperende "Z". */
  private drawBubble(text: string, talk: boolean, serious = false) {
    this.bubble?.destroy();
    const bw = 300, x = 150;
    const c = this.scene.add.container(x, this.bubbleY(this.step?.focus ? this.host.tutRect(this.step.focus) : undefined)).setDepth(61);
    const t = this.scene.add.text(12, 10, text, { fontFamily: FONT, fontSize: '8px', color: HUD.ink, lineSpacing: 4, wordWrap: { width: bw - 34 } });
    const bh = Math.max(46, t.height + 22);
    const g = sonicPanel(this.scene.add.graphics(), 0, 0, bw, bh, 'cream');
    // puntje naar Tails
    g.fillStyle(HUD.outline).fillTriangle(-6, bh / 2, 1, bh / 2 - 6, 1, bh / 2 + 6);
    const tails = this.scene.add.image(-8, bh, serious ? 'guide_tails_serious' : 'guide_tails').setOrigin(1, 1);
    c.add([g, t, tails]);
    if (talk) {
      const z = this.scene.add.text(bw - 10, bh - 6, 'Z', { fontFamily: FONT, fontSize: '8px', color: HUD.ink }).setOrigin(1, 1);
      this.scene.tweens.add({ targets: z, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });
      c.add(z);
    }
    c.setAlpha(0);
    this.scene.tweens.add({ targets: c, alpha: 1, duration: 150 });
    this.bubble = c;
  }

  /** Slotwoord (zonder te wachten): de keuze erna doet BattleScene. */
  say(text: string) {
    this.index = this.steps.length;
    this.hide();
    this.shown = false;
    this.drawBubble(text, false);
    if (this.bubble) this.bubble.y = 40;
  }

  destroy() {
    this.layer.destroy();
    this.bubble?.destroy();
    this.blocker.destroy();
  }
}

/**
 * Losse tip van Tails (de eerste keer dat iets gebeurt): ballon bovenin, Z of klik sluit hem.
 * `done` is klaar als hij dicht is.
 */
export function tailsTip(scene: Phaser.Scene, text: string, serious = false) {
  const bw = 300, x = 150;
  const blocker = scene.add.zone(0, 0, W, H).setOrigin(0).setDepth(59).setInteractive();
  const c = scene.add.container(x, 66).setDepth(61);
  const t = scene.add.text(12, 10, text, { fontFamily: FONT, fontSize: '8px', color: HUD.ink, lineSpacing: 4, wordWrap: { width: bw - 34 } });
  const bh = Math.max(46, t.height + 22);
  const g = sonicPanel(scene.add.graphics(), 0, 0, bw, bh, 'cream');
  g.fillStyle(HUD.outline).fillTriangle(-6, bh / 2, 1, bh / 2 - 6, 1, bh / 2 + 6);
  const tag = scene.add.text(12, -4, 'TIP', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 });
  const z = scene.add.text(bw - 10, bh - 6, 'Z', { fontFamily: FONT, fontSize: '8px', color: HUD.ink }).setOrigin(1, 1);
  scene.tweens.add({ targets: z, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });
  c.add([g, t, tag, z, scene.add.image(-8, bh, serious ? 'guide_tails_serious' : 'guide_tails').setOrigin(1, 1)]);
  c.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 160, ease: 'Back.easeOut' });
  audio.sfx('confirm');
  let resolve!: () => void;
  const done = new Promise<void>(r => { resolve = r; });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    audio.sfx('back');
    blocker.destroy();
    scene.tweens.add({ targets: c, alpha: 0, duration: 120, onComplete: () => c.destroy() });
    resolve();
  };
  blocker.on('pointerdown', close);
  return { done, close };
}
