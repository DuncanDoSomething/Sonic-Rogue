// ---------------------------------------------------------------------------
// De grote moves van het team (2-3 Boost): Spin Dash, Glove Punch, Knuckle Punch, Hammer Twirl en Chao Cheer.
// Net als shadowMoves.ts alleen beeld en geluid; de schade gaat via `strike()` uit de BattleScene.
// Sprites: de eigen atlas van elk character, plus 'sbmoves' (Sonic Battle-frames en effecten, tools/build_sb_moves.py).
// Elke animatie doet wat de naam van de move zegt: Knuckle Punch is een vuist, Glove Punch een boxhandschoen, enz.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { audio } from '../audio';
import { flame, hearts, shockwave, type UltCtx } from './ultimates';

const W = 480;
const H = 270;
const ADD = Phaser.BlendModes.ADD;
const rnd = Phaser.Math.Between;
const rndF = Phaser.Math.FloatBetween;

type Sprite = Phaser.GameObjects.Sprite;
/** Wat deze moves extra nodig hebben: mist hij, stofwolkjes en hoe hoog een character is. */
export interface HeroCtx extends UltCtx {
  missed: boolean;
  dust: (x: number, y: number, n: number) => void;
  bodyHeight: (s: Sprite) => number;
}

const tween = (scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig) =>
  new Promise<void>(r => scene.tweens.add({ ...cfg, onComplete: () => r() }));
const sleep = (scene: Phaser.Scene, ms: number) => new Promise<void>(r => scene.time.delayedCall(ms, () => r()));

/** Animatie afspelen en wachten tot hij klaar is (met vangnet). */
function playDone(scene: Phaser.Scene, s: Sprite, key: string, max = 1500) {
  return new Promise<void>(r => {
    let done = false;
    const fin = () => { if (!done) { done = true; r(); } };
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, fin);
    s.play(key);
    scene.time.delayedCall(max, fin);
  });
}

/** Wacht tot een animatie bij een bepaald frame is (bijv. het moment dat de vuist raakt). */
function playUntil(scene: Phaser.Scene, s: Sprite, key: string, frameSuffix: string, max = 1200) {
  return new Promise<void>(r => {
    let done = false;
    const fin = () => { if (done) return; done = true; s.off(Phaser.Animations.Events.ANIMATION_UPDATE, chk); r(); };
    const chk = (_a: unknown, f: Phaser.Animations.AnimationFrame) => { if (f.textureFrame.toString().endsWith(frameSuffix)) fin(); };
    s.on(Phaser.Animations.Events.ANIMATION_UPDATE, chk);
    s.play(key);
    scene.time.delayedCall(max, fin);
  });
}

/** Effect uit de sbmoves-atlas dat één keer afspeelt. */
function sbfx(scene: Phaser.Scene, x: number, y: number, anim: string, scale = 1, depth = 18, flip = false) {
  const sp = scene.add.sprite(x, y, 'sbmoves').setScale(scale).setDepth(depth).setFlipX(flip).play({ key: anim, repeat: 0 });
  sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
  scene.time.delayedCall(3000, () => { if (sp.active) sp.destroy(); });
  return sp;
}

/** Waar je staat als je het doelwit van dichtbij raakt (`gap` = afstand tot het midden). */
function closeIn(c: HeroCtx, gap: number) {
  const tc = c.center(c.target);
  return { x: tc.x - c.dir * (gap + (c.missed ? -18 : 0)), y: tc.y + c.bodyHeight(c.s) * 0.45, tc };
}

/** Snelheidslijnen over het hele scherm (achter de characters), in de looprichting. */
function speedLines(scene: Phaser.Scene, dir: number, ms: number, color = 0xffffff) {
  const ev = scene.time.addEvent({
    delay: 24, repeat: Math.floor(ms / 24), callback: () => {
      const y = rnd(30, H - 70), len = rnd(40, 110);
      const l = scene.add.rectangle(dir > 0 ? -len : W + len, y, len, rnd(1, 2), color, rndF(0.35, 0.7)).setDepth(3).setBlendMode(ADD);
      scene.tweens.add({ targets: l, x: dir > 0 ? W + len : -len, duration: rnd(160, 240), onComplete: () => l.destroy() });
    },
  });
  return () => ev.remove();
}

/** Steentjes die wegvliegen (vuistslag op de grond / tegen het doelwit). */
function rocks(scene: Phaser.Scene, x: number, y: number, dir: number, n = 8) {
  for (let i = 0; i < n; i++) {
    const r = scene.add.rectangle(x, y, rnd(2, 5), rnd(2, 4), Phaser.Utils.Array.GetRandom([0xa88a58, 0x7a6038, 0xd8c08a])).setDepth(17);
    const vx = dir * rnd(40, 120), vy = -rnd(40, 110);
    scene.tweens.add({ targets: r, x: x + vx, duration: 520, ease: 'Linear' });
    scene.tweens.add({ targets: r, y: y + vy, duration: 260, ease: 'Quad.easeOut', yoyo: true, onComplete: () => r.destroy() });
    scene.tweens.add({ targets: r, angle: rnd(-360, 360), alpha: 0, duration: 520, delay: 200 });
  }
}

/** Terug naar huis met een salto (zoals de andere aanvallen). */
async function hopHome(c: HeroCtx) {
  const { scene, s, home } = c;
  s.play(c.p.anim('spin'));
  await tween(scene, { targets: s, x: (home.x + s.x) / 2, y: home.y - 60, duration: 240, ease: 'Quad.easeOut' });
  await tween(scene, { targets: s, x: home.x, y: home.y, duration: 220, ease: 'Quad.easeIn' });
  s.play(c.p.anim('idle'));
  c.dust(s.x, s.y, 4);
}

// ---------------------------------------------------------------- Sonic: Spin Dash
/** Op de plek oprollen en drie keer optoeren (steeds sneller, vonken en ringen), dan als een vuurbal dwars door het doelwit. */
export async function spinDash(c: HeroCtx) {
  const { scene, s, target, home, dir } = c;
  const cam = scene.cameras.main;
  const tc = c.center(target);
  s.play(c.p.anim('spin'));
  // 1. optoeren: elke rev een ring die naar binnen klapt, stof en vonken naar achteren
  for (let rev = 0; rev < 3; rev++) {
    s.anims.timeScale = 1.5 + rev;
    audio.sfx('spindash', { volume: 0.4 + rev * 0.15 });
    const ring = scene.add.circle(s.x, s.y - 14, 34 - rev * 4).setStrokeStyle(2, rev === 2 ? 0xffd23a : 0x8ad8ff, 0.9).setFillStyle(0, 0).setDepth(16).setBlendMode(ADD);
    scene.tweens.add({ targets: ring, scale: 0.2, alpha: 0, duration: 220, ease: 'Quad.easeIn', onComplete: () => ring.destroy() });
    for (let i = 0; i < 4 + rev * 2; i++) {
      const sp = scene.add.rectangle(s.x - dir * 8, s.y - rnd(2, 10), rnd(3, 6), 1, 0xffe27a, 1).setDepth(16).setBlendMode(ADD);
      scene.tweens.add({ targets: sp, x: sp.x - dir * rnd(20, 50), y: sp.y - rnd(0, 14), alpha: 0, duration: rnd(160, 260), onComplete: () => sp.destroy() });
    }
    c.dust(s.x - dir * 12, s.y, 2 + rev);
    await tween(scene, { targets: s, x: home.x - dir * (4 + rev * 2), duration: 45, yoyo: true, repeat: 1 });
  }
  s.anims.timeScale = 1;
  // 2. los! schokgolf, vuurstaart en snelheidslijnen
  shockwave(scene, s.x, s.y - 14, 0xffffff, 50, 260);
  cam.shake(120, 0.005);
  audio.sfx('whoosh', { volume: 0.9 });
  if (scene.anims.exists(c.p.anim('dashfire'))) s.play(c.p.anim('dashfire'));
  const stop = speedLines(scene, dir, 360);
  const trail = scene.time.addEvent({ delay: 18, loop: true, callback: () => c.ghost(s, 0xffd23a) });
  const hitX = tc.x - dir * 6, footY = tc.y + c.bodyHeight(s) * 0.45;
  await tween(scene, { targets: s, x: hitX, y: footY, duration: 170, ease: 'Expo.easeIn' });
  // 3. raak: een blauw-witte knal, en hij schiet er dwars doorheen
  if (!c.missed) {
    c.strike();
    cam.flash(90, 200, 230, 255);
    shockwave(scene, tc.x, tc.y, 0x8ad8ff, 70, 300);
    for (let i = 0; i < 6; i++) {
      const l = scene.add.rectangle(tc.x, tc.y, rnd(24, 44), 2, 0xffffff, 1).setDepth(19).setBlendMode(ADD).setRotation(rndF(-0.5, 0.5));
      scene.tweens.add({ targets: l, x: tc.x + dir * rnd(30, 60), scaleX: 0.2, alpha: 0, duration: 220, onComplete: () => l.destroy() });
    }
  }
  await tween(scene, { targets: s, x: hitX + dir * 70, alpha: 0.8, duration: 120, ease: 'Quad.easeOut' });
  trail.remove();
  stop();
  // 4. remmen, en met een boog terug
  s.setAlpha(1).play(c.p.anim('spin'));
  await tween(scene, { targets: s, x: (s.x + home.x) / 2, y: home.y - 80, duration: 280, ease: 'Quad.easeOut' });
  await tween(scene, { targets: s, x: home.x, y: home.y, duration: 240, ease: 'Quad.easeIn' });
  s.play(c.p.anim('idle'));
  c.dust(s.x, s.y, 4);
}

// ---------------------------------------------------------------- Tails: Glove Punch
/** Een boxhandschoen uit een portaaltje trekken, aan zijn ketting rondzwaaien en vol op het doelwit laten knallen. */
export async function glovePunch(c: HeroCtx) {
  const { scene, s, dir } = c;
  const cam = scene.cameras.main;
  const pos = closeIn(c, 58);
  // 1. aanvliegen
  s.play('tails_sbdash');
  audio.sfx('jump', { volume: 0.6 });
  const trail = scene.time.addEvent({ delay: 40, loop: true, callback: () => c.ghost(s, 0xffb040) });
  await tween(scene, { targets: s, x: pos.x, y: pos.y, duration: 300, ease: 'Sine.easeInOut' });
  trail.remove();
  // 2. portaaltje open, handschoen eruit
  audio.sfx('ringchime', { volume: 0.5 });
  const sum = playDone(scene, s, 'tails_summon', 700);
  scene.time.delayedCall(180, () => { c.burst(s.x - dir * 14, s.y - 30, 0xff4a4a, 6); });
  await sum;
  // 3. rondzwaaien (twee rondjes, steeds sneller)
  s.play('tails_swing');
  for (let i = 0; i < 2; i++) {
    audio.sfx('whoosh', { volume: 0.6 + i * 0.2 });
    s.anims.timeScale = 1 + i * 0.5;
    const ring = scene.add.circle(s.x, s.y - 20, 28).setStrokeStyle(2, 0xff6a5a, 0.6).setFillStyle(0, 0).setDepth(s.depth - 1).setBlendMode(ADD);
    scene.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    await sleep(scene, 300 - i * 80);
  }
  s.anims.timeScale = 1;
  // 4. weg ermee! de grote zwaai raakt het doelwit
  audio.sfx('whoosh');
  await playUntil(scene, s, 'tails_fling', '16_1', 300);
  const hit = { x: pos.tc.x - dir * 4, y: pos.tc.y };
  if (!c.missed) {
    c.strike();
    audio.sfx('punch');
    cam.shake(200, 0.01);
    // handschoen-klap: rode ster en een "BOING"-ring (veerbelaste handschoen), sterretjes voor de stun
    const pow = scene.add.star(hit.x, hit.y, 8, 6, 18, 0xff3a3a).setDepth(19).setStrokeStyle(2, 0xffffff).setScale(0.3);
    scene.tweens.add({ targets: pow, scale: 1.4, alpha: 0, angle: 30, duration: 300, ease: 'Back.easeOut', onComplete: () => pow.destroy() });
    shockwave(scene, hit.x, hit.y, 0xff6a5a, 60, 280);
    for (let i = 0; i < 5; i++) {
      const st = scene.add.image(hit.x, hit.y, 'star').setTint(0xfff27a).setDepth(19).setScale(1.4);
      const a = -Math.PI / 2 + (i - 2) * 0.5;
      scene.tweens.add({ targets: st, x: hit.x + Math.cos(a) * 34, y: hit.y + Math.sin(a) * 34, angle: 180, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => st.destroy() });
    }
  } else {
    c.burst(hit.x + dir * 20, hit.y, 0xffffff, 6);
  }
  // 5. de handschoen springt terug het portaal in
  await new Promise<void>(r => { s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => r()); scene.time.delayedCall(900, () => r()); });
  await hopHome(c);
}

// ---------------------------------------------------------------- Knuckles: Knuckle Punch
/** Vuisten laden op (vuur), op het doelwit afstormen, arm als een windmolen en dan de Megaton Hook: een vuist die explodeert. */
export async function knucklePunch(c: HeroCtx) {
  const { scene, s, dir } = c;
  const cam = scene.cameras.main;
  const pos = closeIn(c, 44);
  // 1. opladen: rood gloeien, vlammetjes stijgen op
  const charge = playDone(scene, s, 'knuckles_megaton', 400);
  audio.sfx('spindash', { volume: 0.4 });
  const fire = scene.time.addEvent({ delay: 30, repeat: 8, callback: () => flame(scene, s.x + rnd(-10, 10), s.y - rnd(4, 30)) });
  s.setTint(0xffa080);
  await charge;
  s.clearTint();
  fire.remove();
  // 2. erop af (Knuckle Punch gaat altijd als eerste: snel)
  s.play('knuckles_sbdash');
  audio.sfx('jump', { volume: 0.6 });
  const trail = scene.time.addEvent({ delay: 22, loop: true, callback: () => c.ghost(s, 0xff5a1a) });
  const dustRun = scene.time.addEvent({ delay: 60, repeat: 3, callback: () => c.dust(s.x - dir * 8, s.y, 1) });
  await tween(scene, { targets: s, x: pos.x, y: pos.y, duration: 200, ease: 'Expo.easeIn' });
  dustRun.remove();
  trail.remove();
  // 3. arm rond als een windmolen, met een vuurkring
  s.play('knuckles_windmill');
  audio.sfx('whoosh', { volume: 0.9 });
  const swirl = scene.time.addEvent({
    delay: 20, repeat: 12, callback: () => {
      const a = scene.time.now / 40;
      flame(scene, s.x + Math.cos(a) * 18, s.y - 20 + Math.sin(a) * 12, 0.8);
    },
  });
  await sleep(scene, 290);
  swirl.remove();
  // 4. de klap: explosie op de vuist, rotsen, flits
  await playUntil(scene, s, 'knuckles_hook', '15_12', 300);
  const fist = { x: s.x + dir * 30, y: s.y - c.bodyHeight(s) * 0.5 };
  c.strike();
  audio.sfx('punch');
  audio.sfx('explosion', { volume: 0.6 });
  sbfx(scene, fist.x + dir * 10, fist.y, 'sbfx_kboom', 1.8, 19, dir < 0);
  if (!c.missed) {
    cam.flash(120, 255, 200, 120);
    cam.shake(260, 0.014);
    shockwave(scene, fist.x, fist.y, 0xff8a1a, 80, 320);
    rocks(scene, fist.x, fist.y + 10, dir, 10);
    for (let i = 0; i < 10; i++) flame(scene, fist.x + rnd(-12, 12), fist.y + rnd(-10, 10), 1.3);
  }
  await sleep(scene, 340);
  await hopHome(c);
}

// ---------------------------------------------------------------- Amy: Hammer Twirl
/** Rondtollen met de hamer in een roze tornado, het doelwit een paar keer raken, en met hartjes weer opknappen. */
export async function hammerTwirl(c: HeroCtx) {
  const { scene, s, dir } = c;
  const cam = scene.cameras.main;
  const pos = closeIn(c, 32);
  // 1. hamer tevoorschijn
  await playDone(scene, s, 'amy_twirlstart', 400);
  // 2. tollen en in een roze tornado op het doelwit af
  s.play('amy_twirlloop');
  const tornado = scene.add.sprite(s.x + dir * 8, s.y - 34, 'sbmoves').setDepth(s.depth - 0.5).setScale(1.3).setAlpha(0.9).play({ key: 'sbfx_pinktornado', repeat: 0 });
  tornado.anims.pause();
  // de tornado blijft steeds in de groeifase (frames 3-6) zolang ze tolt
  let tf = 3;
  const spin = scene.time.addEvent({
    delay: 50, loop: true, callback: () => {
      tf = tf >= 6 ? 3 : tf + 1;
      tornado.setFrame(`sbfx_pinktornado_${tf}`).setPosition(s.x + dir * 8, s.y - 34);
      if (Math.random() < 0.35) hearts(scene, s.x + rnd(-10, 10), s.y - rnd(10, 30), 1);
    },
  });
  const whooshes = scene.time.addEvent({ delay: 170, repeat: 4, callback: () => audio.sfx('whoosh', { volume: 0.5 }) });
  await tween(scene, { targets: s, x: pos.x, y: pos.y, duration: 480, ease: 'Sine.easeIn' });
  // 3. drie klappen terwijl ze tolt (de schade gaat bij de eerste)
  for (let i = 0; i < 3; i++) {
    if (!c.missed) {
      if (i === 0) c.strike();
      const hx = pos.tc.x + rnd(-10, 10), hy = pos.tc.y + rnd(-14, 10);
      c.burst(hx, hy, i % 2 ? 0xffffff : 0xff8fc8, 6);
      shockwave(scene, hx, hy, 0xff8fc8, 28, 200);
      c.target.setTintFill(0xffc0e0);
      scene.time.delayedCall(50, () => c.target.clearTint());
      cam.shake(70, 0.004);
    }
    audio.sfx(i === 0 ? 'punch' : 'enemyhit', { volume: 0.6 });
    await sleep(scene, 120);
  }
  whooshes.remove();
  spin.remove();
  // tornado waait uit (laatste frames)
  tornado.anims.resume();
  tornado.play({ key: 'sbfx_pinktornado', repeat: 0, startFrame: 9 });
  tornado.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => tornado.destroy());
  scene.time.delayedCall(1500, () => { if (tornado.active) tornado.destroy(); });
  // 4. uitlopen: de hamer klapt op de grond
  const end = playDone(scene, s, 'amy_twirlend', 900);
  await sleep(scene, 200);
  cam.shake(140, 0.008);
  c.dust(s.x + dir * 24, s.y, 6);
  shockwave(scene, s.x + dir * 24, s.y - 4, 0xff8fc8, 50, 260);
  await end;
  // 5. weer op krachten: hartjes en een roze gloed (de heling zelf doet de BattleScene)
  if (!c.missed) {
    audio.sfx('heal1', { volume: 0.7 });
    hearts(scene, s.x, s.y - 26, 10);
    const glow = scene.add.circle(s.x, s.y - 20, 20, 0xff8fc8, 0.5).setDepth(s.depth - 1).setBlendMode(ADD);
    scene.tweens.add({ targets: glow, scale: 2, alpha: 0, duration: 420, onComplete: () => glow.destroy() });
  }
  await hopHome(c);
}

// ---------------------------------------------------------------- Cream: Chao Cheer
/**
 * Cream roept Cheese, die met een glimmend spoor rond wie er geneest wordt cirkelt en dan een groene lichtzuil laat neerdalen.
 * `to` = waar de heling heen gaat (Cream zelf, of het hoofdje van een teamgenoot in de HUD). `small` = een hoofdje in de HUD.
 */
export async function chaoCheer(c: Pick<HeroCtx, 'scene' | 's' | 'dir' | 'burst'>, to: { x: number; y: number }, small: boolean) {
  const { scene, s, dir } = c;
  // 1. Cream steekt haar vinger op: Cheese verschijnt in een flits
  const call = playDone(scene, s, 'cream_call', 1200);
  audio.sfx('ringchime', { volume: 0.6 });
  const start = { x: s.x + dir * 10, y: s.y - 96 };
  const cheese = scene.add.sprite(start.x, start.y, 'sbmoves').setDepth(26).setScale(2).setFlipX(dir > 0).play('sbfx_cheese_in');
  await new Promise<void>(r => { cheese.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => r()); scene.time.delayedCall(500, () => r()); });
  cheese.play('sbfx_cheese_fly');
  // 2. vliegen, dan anderhalf rondje om het doelwit, met een spoor van groene sterretjes
  const r = small ? 14 : 30;
  const cx = to.x, cy = to.y + (small ? 0 : 6);
  cheese.setFlipX(cx > cheese.x);
  await tween(scene, { targets: cheese, x: cx + r, y: cy, duration: 300, ease: 'Sine.easeInOut' });
  const loop = { t: 0 };
  let last = 0;
  await tween(scene, {
    targets: loop, t: 1, duration: 620, ease: 'Linear',
    onUpdate: () => {
      const a = loop.t * Math.PI * 3;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.45;
      cheese.setFlipX(Math.sin(a) < 0).setPosition(x, y).setDepth(Math.sin(a) > 0 ? 26 : 4);
      if (scene.time.now - last > 30) {
        last = scene.time.now;
        const st = scene.add.image(x, y, 'star').setTint(0x9cff9c).setDepth(25).setScale(small ? 0.8 : 1.1).setBlendMode(ADD);
        scene.tweens.add({ targets: st, y: y - 10, alpha: 0, scale: 0.2, duration: 500, onComplete: () => st.destroy() });
      }
    },
  });
  // 3. de heling: een lichtzuil van boven, plusjes en hartjes die opstijgen
  audio.sfx('heal1');
  const pillarH = small ? 40 : 110;
  const pillar = scene.add.rectangle(cx, cy + (small ? 10 : 30), small ? 16 : 34, pillarH, 0x2ac84a, 0.5).setOrigin(0.5, 1).setDepth(24).setBlendMode(ADD).setScale(0.2, 1);
  // heldere kern in het midden van de zuil
  const core = scene.add.rectangle(cx, pillar.y, small ? 4 : 10, pillarH, 0xe8ffe8, 0.8).setOrigin(0.5, 1).setDepth(24).setBlendMode(ADD).setScale(0.2, 1);
  scene.tweens.add({ targets: [pillar, core], scaleX: 1, duration: 140, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: core, alpha: 0, duration: 300, delay: 380, onComplete: () => core.destroy() });
  scene.tweens.add({ targets: pillar, alpha: 0, scaleX: 0.1, duration: 360, delay: 380, onComplete: () => pillar.destroy() });
  for (let i = 0; i < (small ? 5 : 10); i++) {
    scene.time.delayedCall(i * 45, () => {
      const p = scene.add.text(cx + rnd(-16, 16) * (small ? 0.5 : 1), cy + rnd(0, 20), '+', { fontFamily: 'monospace', fontSize: small ? '8px' : '12px', color: '#c8ffc8', stroke: '#1a6a1a', strokeThickness: 2 })
        .setOrigin(0.5).setDepth(27);
      scene.tweens.add({ targets: p, y: p.y - rnd(20, 40), alpha: 0, duration: 600, onComplete: () => p.destroy() });
    });
  }
  hearts(scene, cx, cy, small ? 3 : 6, 0x7cf07c);
  c.burst(cx, cy, 0x7cf07c, 8);
  await call;
  s.play('cream_point');
  // 4. Cheese zwaait en vliegt terug naar Cream
  cheese.setDepth(26).setFlipX(s.x > cheese.x);
  await tween(scene, { targets: cheese, x: s.x + dir * 10, y: s.y - 50, duration: 340, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: cheese, alpha: 0, scale: 0.6, duration: 200, onComplete: () => cheese.destroy() });
  await sleep(scene, 120);
}
