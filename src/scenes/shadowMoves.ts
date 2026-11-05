// ---------------------------------------------------------------------------
// Shadow: Chaos Spear, Chaos Control en zijn ultimate (Super Shadow: Super Barrage).
// Net als ultimates.ts alleen beeld en geluid; de schade gaat via `strike()` uit de BattleScene.
// Sprites: 'shadow' (Sonic Battle) en 'shadowfx' (effecten en Super Shadow), zie tools/build_shadow.py.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { audio } from '../audio';
import { EMERALDS } from '../data/zones';
import { bigText, shockwave, type UltCtx } from './ultimates';

const W = 480;
const H = 270;
const ADD = Phaser.BlendModes.ADD;
const rnd = Phaser.Math.Between;
const rndF = Phaser.Math.FloatBetween;
/** De chaos-speren liggen schuin op de sheet (linksboven naar rechtsonder). */
const SPEAR_AXIS = Phaser.Math.DegToRad(38);

type Sprite = Phaser.GameObjects.Sprite;
/** Shadow-moves: ook weten of de aanval mist, en of de ultimate een gratis vervolg is. */
export interface ShadowCtx extends UltCtx { missed?: boolean; quick?: boolean; }

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

/** Wacht tot een animatie bij een bepaald frame is (bijv. het moment van gooien). */
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

/** Effect uit de shadowfx-atlas dat één keer afspeelt. */
function fx(scene: Phaser.Scene, x: number, y: number, anim: string, scale = 1, depth = 18) {
  const sp = scene.add.sprite(x, y, 'shadowfx').setScale(scale).setDepth(depth).play({ key: anim, repeat: 0 });
  sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
  scene.time.delayedCall(3000, () => { if (sp.active) sp.destroy(); });
  return sp;
}

/** Een speer van (x1,y1) naar (x2,y2). Geeft een promise die klaar is als hij aankomt. */
function spear(scene: Phaser.Scene, x1: number, y1: number, x2: number, y2: number, anim: string, ms: number, scale = 1) {
  const sp = scene.add.sprite(x1, y1, 'shadowfx').play(anim).setDepth(17).setScale(scale)
    .setRotation(Math.atan2(y2 - y1, x2 - x1) - SPEAR_AXIS);
  return tween(scene, { targets: sp, x: x2, y: y2, duration: ms, ease: 'Quad.easeIn' }).then(() => sp.destroy());
}

/** Inslag van chaos-energie: roze/blauwe spat en een ring. */
function chaosHit(c: UltCtx, x: number, y: number, big = 1) {
  fx(c.scene, x, y, 'sh_spear_hit', 1.2 * big, 18);
  shockwave(c.scene, x, y, 0xff6ad8, 30 * big, 240);
  c.burst(x, y, 0xffa0f0, Math.round(6 * big));
}

// ---------------------------------------------------------------- Chaos Spear
export async function chaosSpear(c: ShadowCtx) {
  const { scene, s, target, dir } = c;
  const tc = c.center(target);
  // hand naar achteren: roze gloed in zijn hand
  const glow = scene.add.sprite(s.x - dir * 6, s.y - 46, 'shadowfx').play('sh_orb').setDepth(s.depth + 1).setScale(0.4).setBlendMode(ADD);
  scene.tweens.add({ targets: glow, scale: 0.9, duration: 360, ease: 'Quad.easeIn' });
  audio.sfx('spindash', { volume: 0.4 });
  await playUntil(scene, s, c.p.anim('throw'), '26_9');
  glow.destroy();
  // drie speren in een waaier, kort na elkaar
  audio.sfx('jump', { volume: 0.7 });
  const hx = s.x + dir * 20, hy = s.y - 44;
  const flights: Promise<void>[] = [];
  for (let i = 0; i < 3; i++) {
    const tx = c.missed ? tc.x + dir * 120 : tc.x + rnd(-6, 6);
    const ty = c.missed ? tc.y - 50 + i * 30 : tc.y + (i - 1) * 10;
    flights.push(sleep(scene, i * 90).then(async () => {
      audio.sfx('cursormove', { volume: 0.6 });
      await spear(scene, hx, hy + (i - 1) * 6, tx, ty, 'sh_spear', 210, 1.3);
      if (c.missed) return;
      if (i === 0) c.strike();
      chaosHit(c, tx, ty, i === 2 ? 1.3 : 0.9);
      target.setTintFill(i % 2 ? 0xff8ad8 : 0xffffff);
      scene.time.delayedCall(60, () => target.clearTint());
      scene.cameras.main.shake(90, 0.005);
    }));
  }
  await Promise.all(flights);
  // het merkteken: een roze rune die over het doelwit klapt
  if (!c.missed) {
    const rune = scene.add.sprite(tc.x, tc.y, 'shadowfx', 'sh_rune_pink_0').setDepth(18).setScale(2.2).setAlpha(0);
    audio.sfx('ringchime', { volume: 0.4 });
    await tween(scene, { targets: rune, scale: 0.9, alpha: 1, angle: 90, duration: 260, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: rune, alpha: 0, duration: 300, delay: 120, onComplete: () => rune.destroy() });
  }
  await sleep(scene, 200);
}

// ---------------------------------------------------------------- Chaos Control
export async function chaosControl(c: ShadowCtx) {
  const { scene, s, target, home, dir } = c;
  const tc = c.center(target);
  const cam = scene.cameras.main;

  // 1. Chaos Emerald omhoog
  s.play(c.p.anim('charge'));
  const em = scene.add.sprite(s.x + dir * 4, s.y - 30, 'emeralds', 'emerald_green_0').setDepth(s.depth + 1).setScale(1.2).play('emerald_green');
  audio.sfx('ringchime');
  await tween(scene, { targets: em, y: s.y - 62, duration: 300, ease: 'Quad.easeOut' });
  const halo = scene.add.circle(em.x, em.y, 10, 0x7cf07c, 0.5).setDepth(s.depth).setBlendMode(ADD);
  scene.tweens.add({ targets: halo, scale: 2.4, alpha: 0, duration: 420, repeat: 1 });
  void bigText(scene, W / 2, 50, 'CHAOS CONTROL!', '#7cf07c');
  audio.voice('shadowhah');
  await sleep(scene, 420);

  // 2. de tijd staat stil: alles donkerblauw, een klok-rune dijt uit, het doelwit bevriest
  cam.flash(160, 220, 255, 230);
  audio.sfx('explosion2', { volume: 0.5 });
  const still = scene.add.rectangle(0, 0, W, H, 0x0a1440, 0).setOrigin(0).setDepth(12);
  scene.tweens.add({ targets: still, fillAlpha: 0.55, duration: 180 });
  const clock = scene.add.sprite(em.x, em.y, 'shadowfx', 'sh_rune_blue_0').setDepth(13).setScale(0.3);
  scene.tweens.add({ targets: clock, scale: 6, alpha: 0, angle: 120, duration: 700, ease: 'Cubic.easeOut', onComplete: () => clock.destroy() });
  shockwave(scene, em.x, em.y, 0x8ad8ff, 160, 600);
  scene.tweens.killTweensOf(target);       // zweven stopt: de tijd staat stil
  target.anims.pause();
  target.setTint(0x8a98c8);
  scene.tweens.add({ targets: [em, halo], alpha: 0, duration: 200, onComplete: () => { em.destroy(); halo.destroy(); } });
  await sleep(scene, 250);

  // 3. wegflitsen en naast het doelwit verschijnen
  const depth0 = s.depth;
  s.setDepth(14);
  await playDone(scene, s, c.p.anim('tpout'), 400);
  // op de hoogte van het doelwit (vliegers hangen hoger): voeten gelijk met de onderkant van het doelwit
  const fy = target.y + 2;
  s.setPosition(tc.x - dir * 34, fy).setVisible(true);
  await playDone(scene, s, c.p.anim('tpin'), 400);

  // 4. combo terwijl de tijd stilstaat: de klappen worden "opgespaard" (wit sterretje, geen schade)
  const marks: Phaser.GameObjects.Image[] = [];
  const mark = () => {
    const m = scene.add.image(tc.x + rnd(-14, 14), tc.y + rnd(-16, 10), 'star').setDepth(19).setScale(1.6).setTint(0xfff6a0);
    marks.push(m);
    c.burst(m.x, m.y, 0xffffff, 3);
    audio.sfx('cursormove', { volume: 0.7 });
  };
  for (const [anim, at, shift] of [['chop', '14_2', 0], ['kick', '15_2', 8], ['backkick', '16_3', 14]] as const) {
    const trail = scene.time.addEvent({ delay: 40, loop: true, callback: () => c.ghost(s, 0xff4a5a) });
    s.x = tc.x - dir * (34 - shift);
    await playUntil(scene, s, c.p.anim(anim), at, 600);
    mark();
    await sleep(scene, 110);
    trail.remove();
  }
  // nog een paar keer heen en weer flitsen, met nagloeiende schimmen
  for (let i = 0; i < 3; i++) {
    const side = i % 2 ? -1 : 1;
    s.setPosition(tc.x + side * dir * rnd(26, 40), fy - rnd(0, 30));
    s.setFlipX(s.x < tc.x); // altijd naar het doelwit kijken (de frames kijken naar links)
    s.play(c.p.anim('kick'));
    c.ghost(s, 0xff4a5a);
    mark();
    await sleep(scene, 90);
  }
  s.setFlipX(dir > 0);

  // 5. terug naar huis, vingers knippen... en de tijd loopt weer
  await playDone(scene, s, c.p.anim('tpout'), 400);
  s.setPosition(home.x, home.y);
  await playDone(scene, s, c.p.anim('tpin'), 400);
  s.setDepth(depth0).play(c.p.anim('idle'));
  await sleep(scene, 150);
  scene.tweens.add({ targets: still, fillAlpha: 0, duration: 220, onComplete: () => still.destroy() });
  target.clearTint();
  target.anims.resume();
  marks.forEach(m => m.destroy());
  if (!c.missed) {
    c.strike();
    cam.flash(200, 255, 255, 255);
    cam.shake(300, 0.014);
    audio.sfx('bosshit');
    for (let i = 0; i < 5; i++) {
      scene.time.delayedCall(i * 60, () => chaosHit(c, tc.x + rnd(-20, 20), tc.y + rnd(-18, 14), rndF(0.8, 1.4)));
    }
    // korte lichtflits (één frame): uitdijen en weg, zodat er niks over het doelwit blijft hangen
    const flash = scene.add.sprite(tc.x, tc.y, 'shadowfx', 'sh_burst_0').setDepth(19).setScale(0.8);
    scene.tweens.add({ targets: flash, scale: 1.8, alpha: 0, duration: 280, ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
  }
  c.restoreTarget();
  await sleep(scene, 380);
}

// ---------------------------------------------------------------- Super Barrage (ultimate)
export async function superShadow(c: ShadowCtx) {
  const { scene, s, target, home, dir } = c;
  const tc = c.center(target);
  const cam = scene.cameras.main;
  const scale = s.scaleX;
  const depth0 = s.depth;
  const face = (right: boolean) => s.setFlipX(right);   // Super Shadow-frames kijken naar links
  const groundY = target.y + 2;                          // voeten op de hoogte van het doelwit

  // ------------------------------------------------ 1. transformatie
  if (!c.quick) {
    s.play(c.p.anim('charge'));
    const ems = EMERALDS.map(col => scene.add.sprite(s.x, s.y, 'emeralds', `emerald_${col}_0`).setDepth(16).play(`emerald_${col}`));
    const orbit = { a: 0, r: 90 };
    audio.sfx('ringchime');
    await tween(scene, {
      targets: orbit, a: Math.PI * 4, r: 0, duration: 1200, ease: 'Sine.easeIn',
      onUpdate: () => ems.forEach((e, i) => {
        const a = orbit.a + (i / ems.length) * Math.PI * 2;
        e.setPosition(s.x + Math.cos(a) * orbit.r, s.y - 24 + Math.sin(a) * orbit.r * 0.6);
      }),
    });
    ems.forEach(e => e.destroy());
    cam.flash(350, 255, 255, 255);
    audio.sfx('explosion2', { volume: 0.6 });
    shockwave(scene, s.x, s.y - 22, 0xffe14a, 130, 600);
    await playDone(scene, s, 'ssh_transform', 1000);
  } else {
    // gratis vervolg (na een KO): geen emeralds, een gouden flits en een snelle transformatie
    cam.flash(160, 255, 240, 160);
    audio.sfx('ringchime', { volume: 0.7 });
    shockwave(scene, s.x, s.y - 22, 0xffe14a, 80, 400);
    s.anims.timeScale = 2.5;
    await playDone(scene, s, 'ssh_transform', 600);
    s.anims.timeScale = 1;
  }
  // opladen naar voren: gouden aura en vonken
  face(dir > 0);
  s.play('ssh_power');
  const aura = scene.add.circle(s.x, s.y - 22, 26, 0xffd23a, 0.3).setDepth(s.depth - 1).setBlendMode(ADD);
  scene.tweens.add({ targets: aura, scale: 1.3, alpha: 0.1, duration: 260, yoyo: true, repeat: -1 });
  const sparks = scene.time.addEvent({ delay: 45, loop: true, callback: () => {
    const p = scene.add.image(s.x + rnd(-16, 16), s.y - rnd(0, 44), 'px').setTint(0xfff6a0).setDepth(17).setBlendMode(ADD);
    scene.tweens.add({ targets: p, y: p.y - 28, alpha: 0, duration: 420, onComplete: () => p.destroy() });
  } });
  cam.shake(300, 0.005);
  await sleep(scene, c.quick ? 250 : 500);
  aura.destroy();

  const dark = scene.add.rectangle(0, 0, W, H, 0x1a0608, 0).setOrigin(0).setDepth(11);
  scene.tweens.add({ targets: dark, fillAlpha: 0.5, duration: 200 });
  const flick = (x: number, y: number) => { c.burst(x, y, 0xffe14a, 6); shockwave(scene, x, y, 0xffe14a, 30, 200); };

  // ------------------------------------------------ 2. wegflitsen en vlak voor de vijand verschijnen
  await playDone(scene, s, 'ssh_tpout', 300);
  flick(s.x, s.y - 20);
  s.setPosition(tc.x - dir * 36, groundY);
  face(dir > 0);
  audio.sfx('spindash', { volume: 0.5 });
  await playDone(scene, s, 'ssh_tpin', 300);
  flick(s.x, s.y - 20);

  // ------------------------------------------------ 3. Chaos Nightmare: draaiende trappen met rode sporen
  const hitOnce = (big = 1) => {
    chaosHit(c, tc.x + rnd(-10, 10), tc.y + rnd(-14, 10), 0.8 * big);
    target.setTintFill(0xffffff);
    scene.time.delayedCall(50, () => target.clearTint());
    cam.shake(70, 0.006);
    audio.sfx('enemyhit', { volume: 0.4, throttle: 60 });
  };
  const trail = scene.time.addEvent({ delay: 30, loop: true, callback: () => c.ghost(s, 0xfff0a0) });
  const kicks = new Promise<void>(r => {
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => r());
    s.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: unknown, f: Phaser.Animations.AnimationFrame) => {
      if (s.anims.currentAnim?.key === 'ssh_nightmare' && f.index % 2 === 0) hitOnce();
    });
    s.play('ssh_nightmare');
    scene.time.delayedCall(1200, () => r());
  });
  scene.tweens.add({ targets: s, x: tc.x - dir * 22, duration: 300, ease: 'Sine.easeOut' });
  await kicks;
  s.off(Phaser.Animations.Events.ANIMATION_UPDATE);
  // stoten, snel achter elkaar
  await playDone(scene, s, 'ssh_punch', 600);
  hitOnce(1.3);
  trail.remove();

  // ------------------------------------------------ 4. omhoog flitsen: een regen van gouden chaos-speren
  await playDone(scene, s, 'ssh_tpout', 300);
  s.setPosition(tc.x - dir * 90, Math.max(70, tc.y - 70));
  await playDone(scene, s, 'ssh_tpin', 300);
  s.play('ssh_power');
  const shots: Promise<void>[] = [];
  const n = c.quick ? 6 : 12;
  for (let i = 0; i < n; i++) {
    shots.push(sleep(scene, i * 50).then(async () => {
      audio.sfx('cursormove', { volume: 0.5, throttle: 40 });
      const tx = tc.x + rnd(-18, 18), ty = tc.y + rnd(-20, 16);
      await spear(scene, s.x + dir * 14, s.y - 26 + rnd(-8, 8), tx, ty, 'ssh_spear', 160, 0.9);
      hitOnce(0.8);
    }));
  }
  await Promise.all(shots);

  // ------------------------------------------------ 5. Chaos... BLAST! vlak naast de vijand
  await playDone(scene, s, 'ssh_tpout', 300);
  s.setPosition(tc.x + dir * 4, groundY).setDepth(17);
  await playDone(scene, s, 'ssh_tpin', 300);
  void bigText(scene, W / 2, 46, 'CHAOS... BLAST!', '#ff5a3a');
  audio.sfx('spindash');
  const blast = new Promise<void>(r => {
    let fired = false;
    s.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: unknown, f: Phaser.Animations.AnimationFrame) => {
      // de koepel klapt open: dan pas de schade
      if (!fired && s.anims.currentAnim?.key === 'ssh_blast' && f.index >= 4) {
        fired = true;
        c.strike();
        cam.flash(320, 255, 140, 90);
        cam.shake(650, 0.024);
        audio.sfx('bigexplosion');
        shockwave(scene, tc.x, tc.y, 0xff5a3a, 180, 650);
        const boom = scene.add.sprite(tc.x, groundY + 8, 'shadowfx').setOrigin(0.5, 1).setScale(2.4).setDepth(16).play('ssh_boom');
        boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy());
      }
    });
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => r());
    s.anims.timeScale = 0.8;
    s.play('ssh_blast');
    scene.time.delayedCall(2000, () => r());
  });
  await blast;
  s.off(Phaser.Animations.Events.ANIMATION_UPDATE);
  s.anims.timeScale = 1;
  await sleep(scene, 250);

  // ------------------------------------------------ 6. terug naar huis en weer gewone Shadow
  scene.tweens.add({ targets: dark, fillAlpha: 0, duration: 250, onComplete: () => dark.destroy() });
  c.restoreTarget();
  await playDone(scene, s, 'ssh_tpout', 300);
  s.setPosition(home.x, home.y).setDepth(depth0);
  sparks.remove();
  face(dir > 0);
  cam.flash(200, 255, 255, 255);
  audio.sfx('confirm2', { volume: 0.5 });
  s.play(c.p.anim('idle'));
  s.setScale(scale);
}
