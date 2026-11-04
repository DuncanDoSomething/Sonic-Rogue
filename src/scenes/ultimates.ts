// ---------------------------------------------------------------------------
// Ultimates: een Persona-achtige cut-in en per character een eigen animatie.
// Alles hier is alleen beeld en geluid; de schade gebeurt via `strike()` uit de BattleScene.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { audio } from '../audio';
import type { Fighter } from '../data/fighters';
import { EMERALDS } from '../data/zones';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';
const ADD = Phaser.BlendModes.ADD;

type Sprite = Phaser.GameObjects.Sprite;

/** Wat een ultimate van de BattleScene nodig heeft. */
export interface UltCtx {
  scene: Phaser.Scene;
  /** sprite van wie de ultimate doet */
  s: Sprite;
  p: Fighter;
  target: Sprite;
  home: { x: number; y: number };
  /** 1 = valt naar rechts aan */
  dir: number;
  /** doet de schade (één keer) */
  strike: () => void;
  /** zet het doelwit terug op zijn plek (zweven weer aan) */
  restoreTarget: () => void;
  center: (s: Sprite) => { x: number; y: number };
  ghost: (s: Sprite, tint?: number) => void;
  burst: (x: number, y: number, color?: number, n?: number) => void;
  /** hoofdjes van het team in de HUD (Chao Blessing) */
  teamIcons?: Phaser.GameObjects.Image[];
  /** zone-effect weghalen (Chao Blessing): licht-golf over het scherm */
  clearsField?: boolean;
}

// ---------------------------------------------------------------- kleine helpers
const tween = (scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig) =>
  new Promise<void>(r => scene.tweens.add({ ...cfg, onComplete: () => r() }));
const sleep = (scene: Phaser.Scene, ms: number) => new Promise<void>(r => scene.time.delayedCall(ms, () => r()));
const rnd = Phaser.Math.Between;
const rndF = Phaser.Math.FloatBetween;

/** Effect-sprite dat één keer afspeelt en zichzelf opruimt. */
export function fxOnce(scene: Phaser.Scene, x: number, y: number, anim: string, scale = 1, depth = 16, flip = false) {
  // repeat 0: ook een loop-animatie (energiebal) speelt hier maar één keer
  const sp = scene.add.sprite(x, y, 'fx').setScale(scale).setDepth(depth).setFlipX(flip).play({ key: anim, repeat: 0 });
  sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
  scene.time.delayedCall(3000, () => { if (sp.active) sp.destroy(); }); // vangnet
  return sp;
}

/** Een animatie afspelen en wachten tot hij klaar is (met vangnet). */
function playDone(scene: Phaser.Scene, s: Sprite, key: string, max = 2000) {
  return new Promise<void>(r => {
    let done = false;
    const fin = () => { if (!done) { done = true; r(); } };
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, fin);
    s.play(key);
    scene.time.delayedCall(max, fin);
  });
}

/** Zigzag-bliksem van a naar b. */
function drawBolt(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, jitter = 10, width = 4, color = 0xfff27a) {
  const n = Math.max(4, Math.round(Phaser.Math.Distance.Between(x1, y1, x2, y2) / 14));
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const j = i === 0 || i === n ? 0 : rndF(-jitter, jitter);
    pts.push(new Phaser.Math.Vector2(x1 + (x2 - x1) * t + j, y1 + (y2 - y1) * t + rndF(-jitter, jitter) * 0.4));
  }
  g.lineStyle(width + 4, color, 0.35).strokePoints(pts);
  g.lineStyle(width, color, 1).strokePoints(pts);
  g.lineStyle(Math.max(1, width - 3), 0xffffff, 1).strokePoints(pts);
}

/** Hartjes die alle kanten op springen. */
export function hearts(scene: Phaser.Scene, x: number, y: number, n: number, color = 0xff6fb5) {
  for (let i = 0; i < n; i++) {
    const h = scene.add.image(x, y, 'heart').setTint(i % 3 ? color : 0xffffff).setDepth(17).setScale(rndF(1, 1.8));
    const a = rndF(0, Math.PI * 2), d = rndF(20, 60);
    scene.tweens.add({ targets: h, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 20, alpha: 0, angle: rnd(-40, 40),
      duration: rnd(500, 900), ease: 'Quad.easeOut', onComplete: () => h.destroy() });
  }
}

/** Vlammetje dat opstijgt en uitdooft. */
function flame(scene: Phaser.Scene, x: number, y: number, big = 1) {
  const c = scene.add.circle(x, y, rndF(2, 4.5) * big, Phaser.Utils.Array.GetRandom([0xffe14a, 0xff9a1a, 0xff5a1a, 0xe8243a]), 0.9)
    .setDepth(15).setBlendMode(ADD);
  scene.tweens.add({ targets: c, y: y - rnd(18, 40), x: x + rnd(-6, 6), scale: 0.2, alpha: 0, duration: rnd(320, 520), onComplete: () => c.destroy() });
}

/** Schokgolf: uitdijende ring. */
export function shockwave(scene: Phaser.Scene, x: number, y: number, color = 0xffffff, size = 90, ms = 450) {
  const ring = scene.add.circle(x, y, 8).setStrokeStyle(4, color, 1).setDepth(17).setFillStyle(0, 0);
  scene.tweens.add({ targets: ring, scale: size / 8, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
}

/** Grote tekst die even opploft (bijv. "CRITICAL!"). */
export async function bigText(scene: Phaser.Scene, x: number, y: number, text: string, color: string) {
  const t = scene.add.text(x, y, text, { fontFamily: FONT, fontSize: '16px', color, stroke: '#000000', strokeThickness: 5 })
    .setOrigin(0.5).setDepth(40).setScale(0).setAngle(-8);
  await tween(scene, { targets: t, scale: 1.2, duration: 160, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 700, delay: 350, onComplete: () => t.destroy() });
}

// ---------------------------------------------------------------- cut-in (Persona 5-stijl)
const CUTIN: Record<string, { color: number; focus: [number, number]; voice: string }> = {
  sonic:    { color: 0x1e5bff, focus: [0.5, 0.47], voice: 'sonicyeah' },
  tails:    { color: 0xff9a1a, focus: [0.64, 0.36], voice: 'tailsyeah' },
  knuckles: { color: 0xe8243a, focus: [0.55, 0.3], voice: 'knucklescool' },
  amy:      { color: 0xff5fa8, focus: [0.6, 0.42], voice: 'amyyeah' },
  cream:    { color: 0xf29a3a, focus: [0.56, 0.42], voice: 'creamyeah' },
  // Shadow: Super Shadow-artwork (geen stem-clip)
  shadow:   { color: 0xd81c2c, focus: [0.5, 0.45], voice: '' },
};

/**
 * Het scherm scheurt open in een schuine band met gerafelde randen; daarin schuift de artwork van het
 * character voorbij, met de naam van de ultimate eronder. Daarna een witte flits en terug naar het gevecht.
 */
export async function cutIn(scene: Phaser.Scene, id: string, title: string) {
  // de cut-in speelt altijd op normale snelheid, ook op Battle Speed 2x/3x
  const speed = { tweens: scene.tweens.timeScale, time: scene.time.timeScale };
  scene.tweens.timeScale = 1;
  scene.time.timeScale = 1;
  try { await playCutIn(scene, id, title); } finally {
    scene.tweens.timeScale = speed.tweens;
    scene.time.timeScale = speed.time;
  }
}

async function playCutIn(scene: Phaser.Scene, id: string, title: string) {
  const cfg = CUTIN[id] ?? CUTIN.sonic;
  const D = 60;
  const cx = W / 2, cy = H / 2 - 10;
  const ang = Phaser.Math.DegToRad(-10);
  const HALF = 48;            // halve hoogte van de band
  const SPAN = 330;           // halve lengte
  const N = 30;
  const jitTop = Array.from({ length: N + 1 }, () => rndF(-1, 1));
  const jitBot = Array.from({ length: N + 1 }, () => rndF(-1, 1));
  const made: Phaser.GameObjects.GameObject[] = [];
  const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => { made.push(o); return o; };

  const dim = keep(scene.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setDepth(D));

  // snelheidslijnen achter de band
  const lines = keep(scene.add.container(cx, cy).setDepth(D + 1).setRotation(ang));
  for (let i = 0; i < 16; i++) {
    const r = scene.add.rectangle(rnd(-SPAN, SPAN), rnd(-130, 130), rnd(40, 140), rnd(1, 3), 0xffffff, rndF(0.25, 0.7));
    lines.add(r);
    scene.tweens.add({ targets: r, x: r.x - 700, duration: rnd(260, 420), repeat: -1, onRepeat: () => { r.x = SPAN + rnd(0, 120); } });
  }
  lines.setAlpha(0);

  // band-lagen: wit (rand), zwart, kleur-accent
  const gWhite = keep(scene.add.graphics({ x: cx, y: cy }).setDepth(D + 2).setRotation(ang));
  const gBlack = keep(scene.add.graphics({ x: cx, y: cy }).setDepth(D + 3).setRotation(ang));
  const mask = scene.make.graphics({ x: cx, y: cy }, false).setRotation(ang);

  const shape = (g: Phaser.GameObjects.Graphics, h: number, rough: number, color: number, alpha = 1) => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= N; i++) pts.push({ x: -SPAN + (2 * SPAN * i) / N, y: -h + jitTop[i] * rough });
    for (let i = N; i >= 0; i--) pts.push({ x: -SPAN + (2 * SPAN * i) / N, y: h + jitBot[i] * rough });
    g.fillStyle(color, alpha).fillPoints(pts, true);
  };
  const draw = (t: number) => {
    const h = HALF * t;
    gWhite.clear(); gBlack.clear(); mask.clear();
    if (h <= 0.5) return;
    shape(gWhite, h + 7, 6, 0xffffff);
    shape(gBlack, h, 3, 0x0b0b12);
    // kleur-accent rechts in de band (zoals het rood in Persona 5)
    gBlack.fillStyle(cfg.color, 1).fillPoints([
      { x: 70, y: -h }, { x: SPAN, y: -h }, { x: SPAN, y: h }, { x: 130, y: h },
    ], true);
    gBlack.fillStyle(0xffffff, 0.9).fillPoints([
      { x: 58, y: -h }, { x: 66, y: -h }, { x: 126, y: h }, { x: 118, y: h },
    ], true);
    shape(mask, h - 2, 3, 0xffffff);
  };

  // artwork, gemaskeerd door de band
  const art = keep(scene.add.image(cx + 60, cy + 4, `cutin_${id}`).setDepth(D + 4)
    .setOrigin(cfg.focus[0], cfg.focus[1]).setScale(2.4));
  art.setMask(mask.createGeometryMask());

  // naam van de ultimate onder de band, met een schaduw in de kleur van het character
  const name = keep(scene.add.text(W + 10, cy + HALF + 22, title.toUpperCase(), {
    fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 6,
  }).setOrigin(1, 0.5).setDepth(D + 6).setRotation(ang));
  const nameShadow = keep(scene.add.text(name.x + 3, name.y + 3, title.toUpperCase(), {
    fontFamily: FONT, fontSize: '16px', color: Phaser.Display.Color.IntegerToColor(cfg.color).rgba,
  }).setOrigin(1, 0.5).setDepth(D + 5).setRotation(ang));

  // --- open scheuren
  audio.sfx('spindash', { volume: 0.9 });
  scene.tweens.add({ targets: dim, fillAlpha: 0.6, duration: 160 });
  scene.tweens.add({ targets: lines, alpha: 1, duration: 200 });
  const prog = { t: 0 };
  await tween(scene, { targets: prog, t: 1, duration: 200, ease: 'Back.easeOut', onUpdate: () => draw(prog.t) });
  audio.voice(cfg.voice as Parameters<typeof audio.voice>[0]);
  scene.cameras.main.shake(140, 0.006);
  scene.tweens.add({ targets: [name, nameShadow], x: (o: Phaser.GameObjects.Text) => (o === name ? W - 24 : W - 21), duration: 260, ease: 'Cubic.easeOut' });
  // artwork schuift langzaam door de band
  scene.tweens.add({ targets: art, x: cx - 10, duration: 1100, ease: 'Sine.easeOut' });
  await sleep(scene, 1050);

  // --- dicht, witte flits
  audio.sfx('confirm2', { volume: 0.8 });
  await tween(scene, { targets: prog, t: 0, duration: 140, ease: 'Cubic.easeIn', onUpdate: () => draw(prog.t) });
  scene.cameras.main.flash(220, 255, 255, 255);
  made.forEach(o => o.destroy());
  mask.destroy();
}

// ---------------------------------------------------------------- Sonic: Super Sonic, Light Speed Attack
async function superSonic(c: UltCtx) {
  const { scene, s, target, home } = c;
  const flip = s.flipX;
  const scale = s.scaleX;
  // Super Sonic-frames kijken op de sheet naar rechts, net als waar Sonic heen moet
  const faceRight = (right: boolean) => s.setFlipX(!right);

  // 1. Chaos Emeralds draaien om Sonic heen en schieten in hem
  s.play(c.p.anim('spin'));
  await tween(scene, { targets: s, x: home.x + 30, y: home.y - 30, duration: 260, ease: 'Quad.easeOut' });
  s.play('ss_transform').anims.pause(); // staat op frame 0: gewone Sonic
  faceRight(true);
  const ems = EMERALDS.map(col => scene.add.sprite(s.x, s.y, 'emeralds', `emerald_${col}_0`).setDepth(16).play(`emerald_${col}`));
  const orbit = { a: 0, r: 80 };
  audio.sfx('ringchime');
  await tween(scene, {
    targets: orbit, a: Math.PI * 4, r: 0, duration: 1300, ease: 'Sine.easeIn',
    onUpdate: () => ems.forEach((e, i) => {
      const a = orbit.a + (i / ems.length) * Math.PI * 2;
      e.setPosition(s.x + Math.cos(a) * orbit.r, s.y - 22 + Math.sin(a) * orbit.r * 0.6);
    }),
  });
  ems.forEach(e => e.destroy());

  // 2. transformatie: wit licht, dan goud
  scene.cameras.main.flash(350, 255, 255, 255);
  audio.sfx('explosion2', { volume: 0.6 });
  audio.sfx('ringchime', { volume: 0.8 });
  shockwave(scene, s.x, s.y - 22, 0xffe14a, 120, 600);
  await playDone(scene, s, 'ss_transform', 1200);
  s.play('ss_idle');
  const aura = scene.add.circle(s.x, s.y - 20, 26, 0xffd23a, 0.35).setDepth(s.depth - 1).setBlendMode(ADD);
  scene.tweens.add({ targets: aura, scale: 1.25, alpha: 0.15, duration: 300, yoyo: true, repeat: -1 });
  const sparks = scene.time.addEvent({ delay: 50, loop: true, callback: () => {
    const p = scene.add.image(s.x + rnd(-16, 16), s.y - rnd(0, 40), 'px').setTint(0xfff6a0).setDepth(17).setBlendMode(ADD);
    scene.tweens.add({ targets: p, y: p.y - 26, alpha: 0, duration: 400, onComplete: () => p.destroy() });
  } });
  await sleep(scene, 450);

  // 3. opladen
  s.play('ss_charge');
  aura.destroy();
  scene.cameras.main.shake(350, 0.006);
  audio.sfx('spindash');
  await sleep(scene, 380);

  // 4. Light Speed Attack: vier keer dwars door de vijand, steeds uit een andere hoek
  const tc = c.center(target);
  const passes: Array<[number, number, number, number]> = [
    [-60, tc.y + 10, W + 60, tc.y - 10],
    [W + 60, tc.y - 40, -60, tc.y + 30],
    [tc.x - 200, -40, tc.x + 160, H + 40],
    [tc.x + 200, -40, tc.x - 160, H + 40],
  ];
  s.play('ss_dash');
  for (const [x1, y1, x2, y2] of passes) {
    faceRight(x2 > x1);
    s.setPosition(x1, y1).setRotation(Math.atan2(y2 - y1, x2 - x1) + (x2 > x1 ? 0 : Math.PI));
    const trail = scene.time.addEvent({ delay: 16, loop: true, callback: () => c.ghost(s, 0xffd23a) });
    let hit = false;
    audio.sfx('spindash', { volume: 0.5 });
    await tween(scene, { targets: s, x: x2, y: y2, duration: 170, ease: 'Linear', onUpdate: () => {
      if (!hit && Phaser.Math.Distance.Between(s.x, s.y, tc.x, tc.y) < 40) {
        hit = true;
        fxOnce(scene, tc.x, tc.y, 'fx_wind', 1.6, 18, x2 < x1);
        c.burst(tc.x, tc.y, 0xffe14a, 10);
        target.setTintFill(0xffffff);
        scene.time.delayedCall(60, () => target.clearTint());
        scene.cameras.main.shake(90, 0.008);
        audio.sfx('enemyhit', { volume: 0.7 });
      }
    } });
    trail.remove();
  }

  // 5. laatste klap van boven, recht in de vijand
  s.setRotation(Math.PI / 2 * 0).setPosition(tc.x - 90, tc.y - 90);
  faceRight(true);
  s.setRotation(Math.PI / 4);
  const trail = scene.time.addEvent({ delay: 16, loop: true, callback: () => c.ghost(s, 0xffd23a) });
  await tween(scene, { targets: s, x: tc.x - 10, y: tc.y + 6, duration: 120, ease: 'Quad.easeIn' });
  trail.remove();
  c.strike();
  scene.cameras.main.flash(260, 255, 236, 140);
  scene.cameras.main.shake(380, 0.018);
  audio.sfx('bosshit');
  for (let i = 0; i < 3; i++) scene.time.delayedCall(i * 80, () => fxOnce(scene, tc.x + rnd(-18, 18), tc.y + rnd(-14, 14), 'fx_burst', 2, 18));
  fxOnce(scene, tc.x, tc.y, 'fx_slash', 2, 19);
  shockwave(scene, tc.x, tc.y, 0xffe14a, 110);
  await sleep(scene, 260);

  // 6. terug naar huis, weer gewone Sonic
  s.setRotation(0).play('ss_fly');
  faceRight(false);
  await tween(scene, { targets: s, x: home.x, y: home.y - 30, duration: 300, ease: 'Quad.easeOut' });
  sparks.remove();
  scene.cameras.main.flash(200, 255, 255, 255);
  s.setFlipX(flip).setScale(scale);
  s.play(c.p.anim('spin'));
  await tween(scene, { targets: s, y: home.y, duration: 200, ease: 'Bounce.easeOut' });
}

// ---------------------------------------------------------------- Tails: Thunder Shoot
async function thunderShoot(c: UltCtx) {
  const { scene, s, target, home, dir } = c;
  const tc = c.center(target);
  s.play(c.p.anim('fly'));
  await tween(scene, { targets: s, x: home.x + 20 * dir, y: home.y - 62, duration: 320, ease: 'Sine.easeOut' });

  // opladen: energiebal groeit, bliksem knettert om Tails heen
  const dark = scene.add.rectangle(0, 0, W, H, 0x05061a, 0).setOrigin(0).setDepth(12);
  scene.tweens.add({ targets: dark, fillAlpha: 0.45, duration: 250 });
  const ball = scene.add.sprite(s.x + 26 * dir, s.y - 22, 'fx').play('fx_energy').setDepth(16).setScale(0.4).setBlendMode(ADD);
  scene.tweens.add({ targets: ball, scale: 2.2, duration: 900, ease: 'Quad.easeIn' });
  const arcs = scene.add.graphics().setDepth(17).setBlendMode(ADD);
  const zap = scene.time.addEvent({ delay: 60, loop: true, callback: () => {
    arcs.clear();
    for (let i = 0; i < 3; i++) {
      const a = rndF(0, Math.PI * 2);
      drawBolt(arcs, s.x, s.y - 22, s.x + Math.cos(a) * rnd(24, 44), s.y - 22 + Math.sin(a) * rnd(20, 36), 6, 2);
    }
  } });
  audio.sfx('spindash', { volume: 0.9 });
  for (let i = 0; i < 6; i++) { scene.time.delayedCall(i * 150, () => s.setTintFill(i % 2 ? 0xffffff : 0xfff27a)); }
  await sleep(scene, 950);
  zap.remove();
  arcs.clear();
  s.clearTint();

  // Tails wordt zelf de bliksemschicht: flits, weg, en een knetterende schicht schiet naar de vijand
  const sx = s.x, sy = s.y - 22;
  s.setTintFill(0xffffff);
  scene.cameras.main.flash(120, 255, 250, 180);
  c.burst(sx, sy, 0xfff27a, 14);
  audio.sfx('explosion2', { volume: 0.7 });
  await sleep(scene, 60);
  s.setVisible(false).clearTint();
  ball.setPosition(sx, sy).setScale(1.4);
  const bolt = scene.add.graphics().setDepth(14).setBlendMode(ADD);
  const head = { t: 0 };
  await tween(scene, {
    targets: head, t: 1, duration: 170, ease: 'Quad.easeIn',
    onUpdate: () => {
      const hx = sx + (tc.x - sx) * head.t, hy = sy + (tc.y - sy) * head.t;
      ball.setPosition(hx, hy);
      bolt.clear();
      drawBolt(bolt, sx, sy, hx, hy, 12, 6);
    },
  });
  scene.tweens.add({ targets: bolt, alpha: 0, duration: 220, onComplete: () => bolt.destroy() });

  // inslag: drie bliksems uit de lucht
  c.strike();
  ball.destroy();
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics().setDepth(18).setBlendMode(ADD);
    drawBolt(g, tc.x + rnd(-30, 30), -10, tc.x + rnd(-6, 6), tc.y, 18, 5 - i);
    fxOnce(scene, tc.x, tc.y, 'fx_energy', 2.2 - i * 0.4, 17);
    c.burst(tc.x, tc.y, 0xfff27a, 12);
    target.setTintFill(i % 2 ? 0xfff27a : 0xffffff);
    scene.cameras.main.shake(140, 0.012);
    scene.cameras.main.flash(90, 255, 250, 200);
    audio.sfx('enemyhit', { volume: 0.8 });
    scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
    await sleep(scene, 150);
  }
  target.clearTint();
  scene.tweens.add({ targets: dark, fillAlpha: 0, duration: 250, onComplete: () => dark.destroy() });

  // terug: Tails verschijnt weer in de lucht met een glinstering en vliegt naar huis
  s.setPosition(home.x + 20 * dir, home.y - 62).setVisible(true).clearTint().setAlpha(0).play(c.p.anim('fly'));
  c.burst(s.x, s.y - 22, 0xfff27a, 10);
  await tween(scene, { targets: s, alpha: 1, duration: 160 });
  await tween(scene, { targets: s, x: home.x, y: home.y, duration: 320, ease: 'Sine.easeInOut' });
}

// ---------------------------------------------------------------- Knuckles: Maximum Heat
async function maximumHeat(c: UltCtx) {
  const { scene, s, target, home, dir } = c;
  const tc = c.center(target);
  // hoe meer stat stages, hoe heter
  const stages = (['atk', 'def', 'spd', 'acc'] as const).reduce((n, k) => n + Math.abs(c.p.stage(k)), 0);
  const heat = 1 + Math.min(1, stages / 8);

  // opladen: vlammen om Knuckles heen, rood gloeien
  s.play(c.p.anim('idle'));
  const fire = scene.time.addEvent({ delay: Math.round(26 / heat), loop: true, callback: () => flame(scene, s.x + rnd(-16, 16), s.y - rnd(0, 34), heat) });
  const glow = scene.time.addEvent({ delay: 90, loop: true, callback: () => (s.isTinted ? s.clearTint() : s.setTint(0xff8a5a)) });
  audio.sfx('spindash');
  scene.cameras.main.shake(800, 0.004);
  await tween(scene, { targets: s, x: home.x - 8 * dir, duration: 60, yoyo: true, repeat: 6 });
  shockwave(scene, s.x, s.y - 20, 0xff8a1a, 70, 350);
  await sleep(scene, 200);

  // omhoog, het scherm uit
  s.play(c.p.anim('spin'));
  audio.sfx('jump');
  await tween(scene, { targets: s, y: -60, duration: 240, ease: 'Quad.easeIn' });
  glow.remove();
  await sleep(scene, 250);

  // als een meteoor naar beneden op de vijand
  s.setTint(0xff7a2a).setPosition(tc.x - 150 * dir, -50);
  const trail = scene.time.addEvent({ delay: 16, loop: true, callback: () => { c.ghost(s, 0xff5a1a); flame(scene, s.x, s.y - 16, 1.6); } });
  audio.sfx('spindash');
  await tween(scene, { targets: s, x: tc.x - 8 * dir, y: tc.y + s.displayHeight * 0.4, duration: 300, ease: 'Quad.easeIn' });
  trail.remove();
  fire.remove();

  // inslag: explosies, rotsen, schokgolf
  c.strike();
  s.clearTint();
  scene.cameras.main.flash(300, 255, 170, 80);
  scene.cameras.main.shake(500, 0.02);
  audio.sfx('bigexplosion');
  const n = 4 + Math.min(6, stages);
  for (let i = 0; i < n; i++) {
    scene.time.delayedCall(i * 70, () => fxOnce(scene, tc.x + rnd(-34, 34), tc.y + rnd(-26, 20), 'fx_burst', rndF(1.6, 2.6), 18));
  }
  shockwave(scene, tc.x, tc.y + 10, 0xff8a1a, 140, 500);
  for (let i = 0; i < 12; i++) {
    const r = scene.add.rectangle(tc.x, tc.y + 10, rnd(3, 6), rnd(3, 6), Phaser.Utils.Array.GetRandom([0x8a5a2a, 0x6a4020, 0xb07a40])).setDepth(17);
    const vx = rnd(-120, 120), up = rnd(40, 90);
    scene.tweens.add({ targets: r, x: r.x + vx, duration: 650, ease: 'Linear' });
    scene.tweens.add({ targets: r, y: r.y - up, duration: 260, ease: 'Quad.easeOut', yoyo: true, hold: 0, onComplete: () => r.destroy() });
    scene.tweens.add({ targets: r, angle: rnd(-360, 360), duration: 650 });
  }
  await sleep(scene, 420);
  await tween(scene, { targets: s, x: (home.x + tc.x) / 2, y: home.y - 70, duration: 260, ease: 'Quad.easeOut' });
  await tween(scene, { targets: s, x: home.x, y: home.y, duration: 240, ease: 'Quad.easeIn' });
}

// ---------------------------------------------------------------- Amy: Tornado Hammer
async function tornadoHammer(c: UltCtx) {
  const { scene, s, target, home, dir } = c;
  const tc = c.center(target);
  if (!scene.anims.exists('fx_tornado_loop')) {
    scene.anims.create({ key: 'fx_tornado_loop', frames: [3, 4, 5, 6, 7, 8, 9].map(i => ({ key: 'fx', frame: `fx_tornado_${i}` })), frameRate: 18, repeat: -1 });
  }
  // ronddraaien tot er een tornado ontstaat
  s.play(c.p.anim('twirl'));
  const tor = scene.add.sprite(s.x, s.y + 6, 'fx').setOrigin(0.5, 1).setDepth(s.depth + 1).setScale(0.6).setAlpha(0.9).play('fx_tornado_loop');
  scene.tweens.add({ targets: tor, scale: 2.4, duration: 600, ease: 'Back.easeOut' });
  const love = scene.time.addEvent({ delay: 120, loop: true, callback: () => hearts(scene, tor.x, tor.y - 50, 2) });
  audio.sfx('spindash');
  await sleep(scene, 600);

  // de tornado rijdt naar de vijand en tilt hem op
  const ty0 = target.y;
  scene.tweens.add({ targets: tor, x: tc.x, duration: 420, ease: 'Sine.easeInOut' });
  await tween(scene, { targets: s, x: tc.x - 26 * dir, duration: 420, ease: 'Sine.easeInOut' });
  const spinT = scene.tweens.add({ targets: target, angle: 360, duration: 360, repeat: -1 });
  await Promise.all([
    tween(scene, { targets: target, y: ty0 - 70, duration: 520, ease: 'Sine.easeOut' }),
    tween(scene, { targets: s, x: tc.x - 6 * dir, y: ty0 - 110 + s.displayHeight, duration: 520, ease: 'Sine.easeOut' }),
  ]);
  love.remove();
  scene.tweens.add({ targets: tor, alpha: 0, scale: 3, duration: 300, onComplete: () => tor.destroy() });

  // hamer van boven: één reuzenklap
  spinT.stop();
  target.setAngle(0);
  const hammer = new Promise<void>(r => {
    let done = false;
    const fin = () => { if (!done) { done = true; s.off(Phaser.Animations.Events.ANIMATION_UPDATE, chk); r(); } };
    const chk = (_a: unknown, f: Phaser.Animations.AnimationFrame) => { if (f.textureFrame.toString().endsWith('10_5')) fin(); };
    s.on(Phaser.Animations.Events.ANIMATION_UPDATE, chk);
    s.play(c.p.anim('hammer'));
    scene.time.delayedCall(1200, fin);
  });
  await hammer;
  await Promise.all([
    tween(scene, { targets: target, y: ty0 + 6, duration: 110, ease: 'Quad.easeIn' }),
    tween(scene, { targets: s, y: ty0 - 40 + s.displayHeight, duration: 110, ease: 'Quad.easeIn' }),
  ]);
  c.strike();
  scene.cameras.main.flash(250, 255, 170, 220);
  scene.cameras.main.shake(450, 0.02);
  audio.sfx('bosshit');
  audio.sfx('explosion', { volume: 0.6 });
  shockwave(scene, tc.x, ty0, 0xff6fb5, 130, 500);
  shockwave(scene, tc.x, ty0, 0xffffff, 80, 380);
  hearts(scene, tc.x, tc.y, 16);
  fxOnce(scene, tc.x, tc.y, 'fx_burst', 2.2, 18);
  void bigText(scene, tc.x, tc.y - 50, 'CRITICAL!', '#ff8fc8');
  await tween(scene, { targets: target, y: ty0, duration: 160, ease: 'Bounce.easeOut' });
  c.restoreTarget();
  await sleep(scene, 350);
  s.play(c.p.anim('spin'));
  await tween(scene, { targets: s, x: (home.x + tc.x) / 2, y: home.y - 70, duration: 260, ease: 'Quad.easeOut' });
  await tween(scene, { targets: s, x: home.x, y: home.y, duration: 240, ease: 'Quad.easeIn' });
}

// ---------------------------------------------------------------- Cream: Chao Blessing (geen schade)
export async function chaoBlessing(c: Omit<UltCtx, 'target' | 'strike' | 'restoreTarget'>) {
  const { scene, s } = c;
  s.play(c.p.anim('cheer'));
  // Cheese komt erbij en vliegt rondjes
  const cheese = scene.add.sprite(s.x + 24, s.y - 46, 'fx').setDepth(17).setScale(2);
  await playDone(scene, cheese, 'cheese_appear', 700);
  cheese.play('cheese_fly');
  const orbit = { a: 0 };
  scene.tweens.add({ targets: orbit, a: Math.PI * 4, duration: 1600, ease: 'Sine.easeInOut', onUpdate: () => {
    cheese.setPosition(s.x + Math.cos(orbit.a) * 40, s.y - 30 + Math.sin(orbit.a) * 16);
    cheese.setFlipX(Math.sin(orbit.a) > 0);
    cheese.setDepth(Math.sin(orbit.a) > 0 ? s.depth + 1 : s.depth - 1);
  } });

  // Chao-wervel en een lichtzuil
  const whirl = scene.add.sprite(s.x, s.y + 4, 'fx').setOrigin(0.5, 1).setDepth(s.depth - 1).setScale(0.5).setAlpha(0.85).play('chao_whirl');
  scene.tweens.add({ targets: whirl, scale: 2, duration: 500, ease: 'Back.easeOut' });
  const pillar = scene.add.rectangle(s.x, s.y, 60, H * 2, 0xfff6c0, 0.5).setOrigin(0.5, 1).setDepth(s.depth - 2).setBlendMode(ADD).setScale(0, 1);
  scene.tweens.add({ targets: pillar, scaleX: 1, duration: 300, ease: 'Sine.easeOut' });
  audio.sfx('heal1');
  audio.sfx('ringchime', { volume: 0.7 });

  // hartjes en glinsters regenen op het team
  const rain = scene.time.addEvent({ delay: 40, loop: true, callback: () => {
    const x = rnd(10, W / 2), h = scene.add.image(x, -6, Math.random() < 0.5 ? 'heart' : 'px')
      .setTint(Phaser.Utils.Array.GetRandom([0xff8fc8, 0x7cf07c, 0xfff6a0, 0x8ad8ff])).setDepth(17).setBlendMode(ADD);
    scene.tweens.add({ targets: h, y: rnd(120, 220), alpha: 0, duration: rnd(700, 1100), onComplete: () => h.destroy() });
  } });
  (c.teamIcons ?? []).forEach((icon, i) => {
    scene.time.delayedCall(300 + i * 160, () => {
      icon.setTintFill(0x7cf07c);
      scene.tweens.add({ targets: icon, y: icon.y - 6, duration: 140, yoyo: true, onComplete: () => icon.clearTint() });
      c.burst(icon.x + icon.displayWidth / 2, icon.y + icon.displayHeight / 2, 0x7cf07c, 6);
    });
  });
  await sleep(scene, 1300);

  // zone-effect weg: een golf licht over het hele scherm
  if (c.clearsField) {
    const sweep = scene.add.rectangle(-80, 0, 80, H, 0xffffff, 0.6).setOrigin(0).setDepth(30).setBlendMode(ADD);
    await tween(scene, { targets: sweep, x: W, duration: 420, ease: 'Sine.easeInOut' });
    sweep.destroy();
  }
  rain.remove();
  scene.tweens.add({ targets: [whirl, pillar], alpha: 0, duration: 300, onComplete: () => { whirl.destroy(); pillar.destroy(); } });
  await tween(scene, { targets: cheese, alpha: 0, y: cheese.y - 20, duration: 300 });
  cheese.destroy();
  s.play(c.p.anim('idle'));
}

/** De juiste ultimate-animatie voor dit character (Cream's Chao Blessing loopt via chaoBlessing). */
export async function playUltimate(c: UltCtx) {
  switch (c.p.def.id) {
    case 'sonic': return superSonic(c);
    case 'tails': return thunderShoot(c);
    case 'knuckles': return maximumHeat(c);
    case 'amy': return tornadoHammer(c);
    default: c.strike();
  }
}
