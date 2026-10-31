import Phaser from 'phaser';

/** Klein menu-knopje (drie streepjes) voor de settings. */
export function addMenuButton(scene: Phaser.Scene, x: number, y: number, onClick: () => void) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0x10131c, 0.85).fillRoundedRect(-8, -8, 16, 16, 3);
  g.lineStyle(1, 0x5a6690).strokeRoundedRect(-7.5, -7.5, 15, 15, 3);
  g.fillStyle(0xffffff);
  for (const yy of [-4, -1, 2]) g.fillRect(-4, yy, 8, 2);
  c.add(g);
  c.setSize(16, 16).setInteractive({ useHandCursor: true });
  c.on('pointerdown', onClick);
  return c;
}

/** Klein "?"-knopje voor de uitleg over de game. */
export function addHelpButton(scene: Phaser.Scene, x: number, y: number, onClick: () => void) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0x10131c, 0.85).fillRoundedRect(-8, -8, 16, 16, 3);
  g.lineStyle(1, 0x5a6690).strokeRoundedRect(-7.5, -7.5, 15, 15, 3);
  c.add(g);
  c.add(scene.add.text(1, 1, '?', { fontFamily: '"Press Start 2P", monospace', fontSize: '8px', color: '#ffffff' }).setOrigin(0.5));
  c.setSize(16, 16).setInteractive({ useHandCursor: true });
  c.on('pointerdown', onClick);
  return c;
}
