import Phaser from 'phaser';
import { settings } from './data/settings';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';
import { TitleScene } from './scenes/TitleScene';
import { CharSelectScene } from './scenes/CharSelectScene';
import { SettingsScene } from './scenes/SettingsScene';
import { PauseScene } from './scenes/PauseScene';
import { TeamScene } from './scenes/TeamScene';
import { CreditsScene } from './scenes/CreditsScene';
import { HelpScene } from './scenes/HelpScene';
import { audio } from './audio';
import { MOVES } from './data/fighters';
import { REWARDS } from './data/rewards';
import { resetUnlocks, unlock } from './data/unlocks';

async function start() {
  // Wacht op het pixel-font, anders tekent Phaser de eerste teksten met een fallback-font
  try { await document.fonts.load('8px "Press Start 2P"'); } catch { /* fallback is ok */ }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 480,
    height: 270,
    backgroundColor: '#10131c',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, TitleScene, CharSelectScene, BattleScene, SettingsScene, PauseScene, TeamScene, CreditsScene, HelpScene],
  });
  audio.init(game);
  // handig voor debuggen in de console: game.scene.getScene('Battle')
  Object.assign(window, { game, MOVES, REWARDS, resetUnlocks, unlock, settings });
}

start();
