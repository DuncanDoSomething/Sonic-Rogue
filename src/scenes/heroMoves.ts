// ---------------------------------------------------------------------------
// De eigen moves van het team, zonder Shadow (die staat in shadowMoves.ts):
// 1 Boost: Homing Attack, Copter Dive, Glide Attack, Chao Attack, Piko Hammer.
// 2-3 Boost: Spin Dash, Glove Punch, Knuckle Punch, Hammer Twirl en Chao Cheer.
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
  /** Vizier dat zich vastklikt op het doelwit (Homing Attack). */
  lockOn: (target: Sprite) => Promise<void>;
  /** Windringetje onder iemand die vliegt (Copter Dive). */
  rotorWash: (x: number, y: number) => void;
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
  audio.sfx('spinrelease', { volume: 0.9 });
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

// ================================================================ 1 Boost

/** Kleine opkikker na een stat-boost: gekleurde gloed en pijltjes omhoog rond de sprite. */
function powerUp(scene: Phaser.Scene, s: Sprite, color: number) {
  const glow = scene.add.circle(s.x, s.y - 22, 18, color, 0.35).setDepth(s.depth - 1).setBlendMode(ADD);
  scene.tweens.add({ targets: glow, scale: 2.2, alpha: 0, duration: 380, onComplete: () => glow.destroy() });
  for (let i = 0; i < 6; i++) {
    const l = scene.add.rectangle(s.x + rnd(-16, 16), s.y - rnd(0, 20), 2, rnd(6, 12), color, 0.9).setDepth(s.depth + 1).setBlendMode(ADD);
    scene.tweens.add({ targets: l, y: l.y - rnd(24, 40), alpha: 0, duration: rnd(300, 460), delay: i * 30, onComplete: () => l.destroy() });
  }
}

// ---------------------------------------------------------------- Sonic: Homing Attack
/** Opspringen, het vizier klikt vast, en als blauwe draaikolk in een rechte lijn op het doelwit. */
export async function homingAttack(c: HeroCtx) {
  const { scene, s, home, dir } = c;
  const tc = c.center(c.target);
  // 1. omhoog als bal
  s.play(c.p.anim('spin'));
  audio.sfx('jump', { volume: 0.8 });
  await tween(scene, { targets: s, y: home.y - 74, x: home.x + dir * 18, duration: 220, ease: 'Quad.easeOut' });
  // 2. vizier
  await c.lockOn(c.target);
  // 3. de Sonic Ballet-draaikolk, een lichtstreep erachter
  s.play('sonic_ballet');
  audio.sfx('dash', { volume: 0.8 });
  const from = { x: s.x, y: s.y - 16 };
  const hit = { x: tc.x - dir * (c.missed ? -30 : 10), y: tc.y + 16 };
  const trail = scene.time.addEvent({ delay: 14, loop: true, callback: () => c.ghost(s, 0x5aa8ff) });
  await tween(scene, { targets: s, x: hit.x, y: hit.y, duration: 120, ease: 'Linear' });
  trail.remove();
  const beam = scene.add.line(0, 0, from.x, from.y, s.x, s.y - 16, 0x9ad8ff, 0.9).setOrigin(0).setLineWidth(3).setDepth(s.depth - 1).setBlendMode(ADD);
  scene.tweens.add({ targets: beam, alpha: 0, duration: 260, onComplete: () => beam.destroy() });
  // 4. raak: blauwe zwaai-slash en een kringetje
  c.strike();
  if (!c.missed) {
    sbfx(scene, tc.x, tc.y, 'sbfx_airslash', 1.8, 19, dir > 0);
    shockwave(scene, tc.x, tc.y, 0x5aa8ff, 44, 240);
  }
  // 5. afketsen: uitrollen en een salto naar achteren, met SPD-gloed
  s.play('sonic_balletout');
  await tween(scene, { targets: s, x: s.x - dir * 50, y: Math.max(s.y - 46, c.bodyHeight(s) + 10), duration: 260, ease: 'Quad.easeOut' });
  if (!c.missed) powerUp(scene, s, 0x5aa8ff);
  s.play(c.p.anim('spin'));
  await tween(scene, { targets: s, x: home.x, y: home.y, duration: 300, ease: 'Quad.easeIn' });
  s.play(c.p.anim('idle'));
  c.dust(s.x, s.y, 4);
}

// ---------------------------------------------------------------- Tails: Copter Dive
/** Met de staarten als propeller omhoog, boven het doelwit omklappen en als boor naar beneden. */
export async function copterDive(c: HeroCtx) {
  const { scene, s, home, dir } = c;
  const tc = c.center(c.target);
  // 1. opstijgen met windringen onder hem
  s.play('tails_sbfly');
  audio.sfx('spindash', { volume: 0.5 });
  const wash = scene.time.addEvent({ delay: 60, loop: true, callback: () => c.rotorWash(s.x, s.y) });
  await tween(scene, { targets: s, x: home.x + dir * 20, y: home.y - 90, duration: 300, ease: 'Quad.easeOut' });
  const top = Math.max(tc.y - 74, c.bodyHeight(s) + 24);
  await tween(scene, { targets: s, x: tc.x - dir * 6, y: top, duration: 320, ease: 'Sine.easeInOut' });
  wash.remove();
  // 2. omklappen: een rondje en dan de boor
  s.play(scene.anims.exists(c.p.anim('drill')) ? c.p.anim('drill') : c.p.anim('spin'));
  audio.sfx('whoosh', { volume: 0.8 });
  await tween(scene, { targets: s, y: Math.max(s.y - 10, c.bodyHeight(s) + 14), duration: 110, ease: 'Quad.easeOut' });
  // 3. naar beneden als boor, met een wervel van windstreepjes eromheen
  let a = 0;
  const swirl = scene.time.addEvent({
    delay: 16, loop: true, callback: () => {
      a += 0.9;
      const l = scene.add.rectangle(s.x + Math.cos(a) * 14, s.y - 18 + Math.sin(a) * 4, 8, 1, 0xffffff, 0.9).setDepth(s.depth + (Math.sin(a) > 0 ? 1 : -1)).setBlendMode(ADD);
      scene.tweens.add({ targets: l, y: l.y - 16, alpha: 0, duration: 200, onComplete: () => l.destroy() });
    },
  });
  const trail = scene.time.addEvent({ delay: 24, loop: true, callback: () => c.ghost(s, 0xffd060) });
  await tween(scene, { targets: s, y: tc.y + c.bodyHeight(s) * 0.45 - (c.missed ? -10 : 6), x: tc.x - dir * (c.missed ? -24 : 4), duration: 170, ease: 'Quad.easeIn' });
  swirl.remove();
  trail.remove();
  // 4. raak: windring en een klap
  c.strike();
  if (!c.missed) {
    audio.sfx('punch', { volume: 0.7 });
    const ring = scene.add.ellipse(tc.x, tc.y + 10, 30, 10).setStrokeStyle(2, 0xffffff, 0.9).setDepth(18);
    scene.tweens.add({ targets: ring, scaleX: 3, scaleY: 2, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
    shockwave(scene, tc.x, tc.y, 0xffd060, 40, 240);
  }
  await hopHome(c);
}

// ---------------------------------------------------------------- Knuckles: Glide Attack
/** Opspringen en met de vuisten vooruit het doelwit in glijden (ATK omhoog, DEF omlaag: hij gooit alles erin). */
export async function glideAttack(c: HeroCtx) {
  const { scene, s, home, dir } = c;
  const tc = c.center(c.target);
  // 1. sprong
  audio.sfx('jump', { volume: 0.8 });
  const jump = playDone(scene, s, 'knuckles_sbjump', 400);
  await tween(scene, { targets: s, y: home.y - 64, x: home.x + dir * 12, duration: 260, ease: 'Quad.easeOut' });
  await jump;
  // 2. glijden: licht dalend, met windstreepjes langs zijn lijf
  s.play('knuckles_grind');
  audio.sfx('whoosh', { volume: 0.7 });
  const wind = scene.time.addEvent({
    delay: 26, loop: true, callback: () => {
      const l = scene.add.rectangle(s.x - dir * 10, s.y - rnd(8, 30), rnd(14, 28), 1, 0xffffff, 0.85).setDepth(s.depth - 1);
      scene.tweens.add({ targets: l, x: l.x - dir * 36, alpha: 0, duration: 200, onComplete: () => l.destroy() });
    },
  });
  const hitX = tc.x - dir * (c.missed ? -30 : 24);
  await tween(scene, { targets: s, x: hitX, y: tc.y + c.bodyHeight(s) * 0.3, duration: 340, ease: 'Sine.easeIn' });
  wind.remove();
  // 3. vuisten erin
  c.strike();
  if (!c.missed) {
    audio.sfx('punch');
    const fist = { x: s.x + dir * 22, y: s.y - c.bodyHeight(s) * 0.45 };
    const pow = scene.add.star(fist.x, fist.y, 6, 5, 16, 0xffffff).setDepth(19).setStrokeStyle(2, 0xff4a2a).setScale(0.3);
    scene.tweens.add({ targets: pow, scale: 1.3, alpha: 0, angle: 40, duration: 260, ease: 'Back.easeOut', onComplete: () => pow.destroy() });
    shockwave(scene, fist.x, fist.y, 0xff6a3a, 40, 220);
  }
  // 4. landen, ATK-gloed, terug
  await playDone(scene, s, 'knuckles_grindend', 400);
  if (!c.missed) powerUp(scene, s, 0xff5a3a);
  await hopHome(c);
}

// ---------------------------------------------------------------- Amy: Piko Hammer
/** Aanrennen, opspringen en de Piko Piko Hammer met volle kracht neer laten klappen. */
export async function pikoHammer(c: HeroCtx) {
  const { scene, s, dir } = c;
  const cam = scene.cameras.main;
  const pos = closeIn(c, 38);
  // 1. aanrennen
  s.play('amy_sbdash');
  const dustRun = scene.time.addEvent({ delay: 70, repeat: 4, callback: () => c.dust(s.x - dir * 8, s.y, 1) });
  await tween(scene, { targets: s, x: pos.x, y: pos.y, duration: 280, ease: 'Sine.easeIn' });
  dustRun.remove();
  // 2. hamer omhoog, sprongetje, en BONK
  audio.sfx('jump', { volume: 0.7 });
  const fall = playUntil(scene, s, 'amy_aircrush', '18_6', 700);
  await tween(scene, { targets: s, y: pos.y - 26, duration: 220, ease: 'Quad.easeOut' });
  audio.sfx('whoosh', { volume: 0.8 });
  await tween(scene, { targets: s, y: pos.y, duration: 120, ease: 'Quad.easeIn' });
  await fall;
  const head = { x: pos.tc.x - dir * 4, y: pos.tc.y - 6 };
  c.strike();
  if (!c.missed) {
    audio.sfx('punch');
    cam.shake(180, 0.01);
    shockwave(scene, head.x, head.y, 0xff8fc8, 56, 280);
    // sterretjes rond de kop van het doelwit, en een hartje dat ervan af springt
    for (let i = 0; i < 6; i++) {
      const st = scene.add.image(head.x, head.y, 'star').setTint(0xfff27a).setDepth(19).setScale(1.3);
      const a = (i / 6) * Math.PI * 2;
      scene.tweens.add({ targets: st, x: head.x + Math.cos(a) * 30, y: head.y + Math.sin(a) * 18 - 8, angle: 200, alpha: 0, duration: 480, ease: 'Quad.easeOut', onComplete: () => st.destroy() });
    }
    hearts(scene, head.x, head.y - 10, 3);
  }
  c.dust(s.x + dir * 22, s.y, 6);
  await new Promise<void>(r => { s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => r()); scene.time.delayedCall(500, () => r()); });
  if (!c.missed) powerUp(scene, s, 0xff5a8a);
  await hopHome(c);
}

// ---------------------------------------------------------------- Cream: Chao Attack
/** Cream wijst, Cheese rolt zich op tot een energiebal en knalt op het doelwit (ATK van het doelwit omlaag). */
export async function chaoAttack(c: HeroCtx) {
  const { scene, s, dir } = c;
  const tc = c.center(c.target);
  // 1. Cream wijst; Cheese verschijnt in een gloeiende bol naast haar
  s.play('cream_point');
  audio.sfx('creamfly', { volume: 0.7 });
  const start = { x: s.x + dir * 26, y: s.y - 40 };
  const orb = scene.add.sprite(start.x, start.y, 'sbmoves', 'sbfx_cheeseorb_0').setDepth(18).setScale(0.3).setAlpha(0.9).setBlendMode(ADD);
  await tween(scene, { targets: orb, scale: 1.4, duration: 160, ease: 'Back.easeOut' });
  const ball = scene.add.sprite(start.x, start.y, 'sbmoves').setDepth(19).setScale(2).setFlipX(dir > 0).play('sbfx_cheeseball');
  scene.tweens.add({ targets: orb, scale: 0.2, alpha: 0, duration: 180, onComplete: () => orb.destroy() });
  await sleep(scene, 160);
  // 2. de bal schiet in een boogje naar het doelwit, met een spoor van lichtblauwe glinsters
  audio.sfx('cheese', { volume: 0.9 });
  const end = { x: tc.x - dir * (c.missed ? -40 : 6), y: tc.y };
  const arc = { t: 0 };
  let last = 0;
  await tween(scene, {
    targets: arc, t: 1, duration: 300, ease: 'Sine.easeIn',
    onUpdate: () => {
      const t = arc.t;
      ball.setPosition(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t - Math.sin(t * Math.PI) * 30);
      if (scene.time.now - last > 18) {
        last = scene.time.now;
        const g = scene.add.image(ball.x, ball.y, 'star').setTint(0x8af0ff).setDepth(18).setBlendMode(ADD).setScale(1.1);
        scene.tweens.add({ targets: g, scale: 0.2, alpha: 0, duration: 300, onComplete: () => g.destroy() });
      }
    },
  });
  // 3. raak: een plens energie
  c.strike();
  if (!c.missed) {
    audio.sfx('punch', { volume: 0.7 });
    sbfx(scene, tc.x, tc.y, 'sbfx_chaosplash', 2, 20, dir < 0);
    shockwave(scene, tc.x, tc.y, 0x8af0ff, 44, 260);
  }
  // 4. Cheese komt bij, stuitert terug naar Cream en verdwijnt met een glinstering
  ball.play('sbfx_cheeseland').setFlipX(dir < 0);
  await tween(scene, { targets: ball, x: (ball.x + s.x) / 2, y: ball.y - 40, duration: 220, ease: 'Quad.easeOut' });
  await tween(scene, { targets: ball, x: s.x + dir * 16, y: s.y - 46, duration: 220, ease: 'Quad.easeIn' });
  c.burst(ball.x, ball.y, 0x8af0ff, 6);
  scene.tweens.add({ targets: ball, alpha: 0, scale: 1, duration: 200, onComplete: () => ball.destroy() });
  await sleep(scene, 120);
  s.play(c.p.anim('idle'));
}

// ---------------------------------------------------------------- Cream: de Chao-vriendjes van Chao Blessing
const CHAO_FRIENDS = ['blue', 'orange', 'red', 'pink'];
/** De Chao rennen van links het beeld in, springen blij rond Cream en rennen weer weg. Geeft een functie die ze laat vertrekken. */
export function chaoFriends(scene: Phaser.Scene, s: Sprite): () => Promise<void> {
  const chao = CHAO_FRIENDS.map((col, i) => {
    const spot = { x: s.x + (i - 1.5) * 26 + (i < 2 ? -18 : 18), y: s.y + (i % 2 ? 4 : -2) };
    const ch = scene.add.sprite(-20 - i * 18, spot.y, 'sbmoves').setOrigin(0.5, 1).setDepth(s.depth + (i % 2 ? 1 : -1)).setScale(2).setFlipX(true)
      .play(`sbfx_chao_${col}_run`);
    scene.tweens.add({
      targets: ch, x: spot.x, duration: 520 + i * 90, ease: 'Sine.easeOut',
      onComplete: () => {
        ch.play(`sbfx_chao_${col}_hop`);
        scene.tweens.add({ targets: ch, y: spot.y - 8, duration: 180, yoyo: true, repeat: 3, ease: 'Sine.easeOut' });
        hearts(scene, ch.x, ch.y - 20, 2);
      },
    });
    return ch;
  });
  return async () => {
    chao.forEach((ch, i) => {
      ch.play(`sbfx_chao_${CHAO_FRIENDS[i]}_run`).setFlipX(false);
      scene.tweens.add({ targets: ch, x: -30, duration: 600 + i * 60, ease: 'Sine.easeIn', onComplete: () => ch.destroy() });
    });
    await sleep(scene, 300);
  };
}
