import Phaser from 'phaser';
import { audio } from '../audio';
import type { Fighter } from '../data/fighters';
import { buildCharacterInfo, type InfoView } from './characterInfo';

/**
 * I midden in een run: de kit van je team (passive, moves, ultimate).
 * Pijltjes wisselen tussen teamgenoten, I / X sluit.
 */
export class TeamScene extends Phaser.Scene {
  private from = '';
  private party: Fighter[] = [];
  private index = 0;
  private view?: InfoView;

  constructor() { super('Team'); }

  init(data: { from: string; party: Fighter[]; index: number }) {
    this.from = data.from;
    this.party = data.party;
    this.index = Math.max(0, data.index);
  }

  create() {
    this.draw();
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'a'].includes(k)) this.step(-1);
      else if (['arrowright', 'd'].includes(k)) this.step(1);
      else if (['arrowup', 'w'].includes(k)) { audio.sfx('cursormove'); this.view?.moveRow(-1); }
      else if (['arrowdown', 's'].includes(k)) { audio.sfx('cursormove'); this.view?.moveRow(1); }
      else if (['i', 'c', 'x', 'escape', 'backspace', 'z', 'enter', ' '].includes(k)) this.close();
    });
  }

  private step(d: number) {
    if (this.party.length < 2) return;
    this.index = Phaser.Math.Wrap(this.index + d, 0, this.party.length);
    audio.sfx('cursormove');
    this.draw();
  }

  private draw() {
    const row = this.view?.row ?? 0;
    this.view?.destroy();
    const f = this.party[this.index];
    this.view = buildCharacterInfo(this, f.def.id, {
      row,
      fighter: f,
      tabs: { ids: this.party.map(p => p.def.id), index: this.index, fainted: this.party.map(p => p.fainted) },
      footer: this.party.length > 1 ? 'Up/Down: details  Left/Right: team  X: close' : 'Up/Down: details    X: close',
      onClose: () => this.close(),
    });
  }

  private close() {
    audio.sfx('back');
    this.input.keyboard!.removeAllListeners();
    this.scene.resume(this.from);
    this.scene.stop();
  }
}
