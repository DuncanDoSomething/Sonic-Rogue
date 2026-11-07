// ---------------------------------------------------------------------------
// Rival-gesprekje in beeld, zoals in Sonic Battle: het scherm dimt, links staat jouw character en rechts
// de rival (portret uit Sonic Battle), en onderin een tekstvak met de naam van wie er praat.
// Z / klik = volgende regel (of de regel meteen afmaken), X = alles overslaan.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { audio } from '../audio';
import { charDelay } from '../data/settings';
import { FIGHTERS } from '../data/fighters';
import type { Exchange } from '../data/dialogue';
import { HUD, sonicPanel } from './hud';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';
const PANEL_Y = 204, PANEL_H = 58;
const PORTRAIT_SCALE = 1.4;

export interface TalkHandle { next(): void; skip(): void; done: Promise<void>; }

export function playTalk(scene: Phaser.Scene, lines: Exchange, allyId: string, rivalId: string): TalkHandle {
  const depth = 56;
  const parts: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { parts.push(o); return o; };

  // scherm iets dimmen en klikken opvangen
  const dim = add(scene.add.rectangle(0, 0, W, H, 0x000018, 0.55).setOrigin(0).setDepth(depth).setInteractive());
  dim.setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: 1, duration: 160 });

  // portretten: jij links (kijkt naar rechts), de rival rechts (gespiegeld)
  const portrait = (id: string, side: 'ally' | 'rival') => {
    const left = side === 'ally';
    const img = add(scene.add.image(left ? 24 : W - 24, PANEL_Y + 2, `talk_${id}_normal`).setOrigin(left ? 0 : 1, 1)
      .setScale(PORTRAIT_SCALE).setFlipX(!left).setDepth(depth + 1));
    img.x += left ? -60 : 60;
    scene.tweens.add({ targets: img, x: left ? 24 : W - 24, duration: 220, ease: 'Cubic.easeOut' });
    return img;
  };
  const ally = portrait(allyId, 'ally');
  const rival = portrait(rivalId, 'rival');

  // tekstvak met naam-tabje
  const g = add(scene.add.graphics().setDepth(depth + 2));
  sonicPanel(g, 8, PANEL_Y, W - 16, PANEL_H, 'cream');
  const tagBg = add(scene.add.graphics().setDepth(depth + 3));
  const tag = add(scene.add.text(0, PANEL_Y - 5, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#281060', strokeThickness: 3 }).setDepth(depth + 4));
  const text = add(scene.add.text(20, PANEL_Y + 12, '', { fontFamily: FONT, fontSize: '8px', color: HUD.ink, lineSpacing: 5, wordWrap: { width: W - 52 } }).setDepth(depth + 3));
  const z = add(scene.add.text(W - 18, PANEL_Y + PANEL_H - 8, 'Z', { fontFamily: FONT, fontSize: '8px', color: HUD.ink }).setOrigin(1, 1).setDepth(depth + 3));
  const skipHint = add(scene.add.text(20, PANEL_Y + PANEL_H - 8, 'X: skip', { fontFamily: FONT, fontSize: '8px', color: HUD.inkMuted }).setOrigin(0, 1).setDepth(depth + 3));
  scene.tweens.add({ targets: z, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });

  let i = -1;
  let typing = false;
  let full = '';
  let timer: Phaser.Time.TimerEvent | undefined;
  let finished = false;
  let resolve!: () => void;
  const done = new Promise<void>(r => { resolve = r; });

  const close = () => {
    if (finished) return;
    finished = true;
    timer?.remove();
    scene.tweens.add({
      targets: parts, alpha: 0, duration: 140,
      onComplete: () => { parts.forEach(p => p.destroy()); resolve(); },
    });
  };

  const show = () => {
    i++;
    if (i >= lines.length) return close();
    const line = lines[i];
    const isAlly = line.who === 'ally';
    const id = isAlly ? allyId : rivalId;
    const speaker = isAlly ? ally : rival, other = isAlly ? rival : ally;
    speaker.setTexture(`talk_${id}_${line.mood}`).clearTint().setDepth(depth + 1.5);
    other.setTint(0x6a6a7a).setDepth(depth + 1);
    // spreker wipt even op
    scene.tweens.add({ targets: speaker, y: PANEL_Y - 3, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    // naam-tabje aan de kant van wie praat
    const name = FIGHTERS[id].name.toUpperCase();
    tag.setText(name);
    const tx = isAlly ? 20 : W - 20 - tag.width;
    tag.setX(tx);
    tagBg.clear();
    tagBg.fillStyle(HUD.outline).fillRoundedRect(tx - 5, PANEL_Y - 8, tag.width + 10, 14, 4);
    tagBg.fillStyle(isAlly ? 0x2c3cc0 : 0xc02c4a).fillRoundedRect(tx - 4, PANEL_Y - 7, tag.width + 8, 12, 3);
    // tekst letter voor letter
    full = line.text;
    text.setText('');
    audio.sfx('cursormove', { volume: 0.5 });
    const d = charDelay();
    if (d === 0) { text.setText(full); typing = false; return; }
    typing = true;
    let n = 0;
    timer?.remove();
    timer = scene.time.addEvent({
      delay: d * scene.time.timeScale, repeat: full.length - 1,
      callback: () => { n++; text.setText(full.slice(0, n)); if (n >= full.length) typing = false; },
    });
  };

  const next = () => {
    if (finished) return;
    if (typing) { timer?.remove(); text.setText(full); typing = false; return; }
    show();
  };
  dim.on('pointerdown', next);
  skipHint.setInteractive({ useHandCursor: true }).on('pointerdown', () => close());
  scene.time.delayedCall(200, show);
  return { next, skip: close, done };
}
