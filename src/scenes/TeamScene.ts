import Phaser from 'phaser';
import { audio } from '../audio';
import type { Fighter } from '../data/fighters';
import { buildCharacterInfo } from './characterInfo';

/**
 * I midden in een run: de kit van je team (passive, moves, ultimate).
 * Pijltjes wisselen tussen teamgenoten, I / X sluit.
 */
export class TeamScene extends Phaser.Scene {
  private from = '';
  private party: Fighter[] = [];
  private index = 0;
  private view?: Phaser.GameObjects.Container;

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
      if (['arrowleft', 'arrowup', 'a', 'w'].includes(k)) this.step(-1);
      else if (['arrowright', 'arrowdown', 'd', 's'].includes(k)) this.step(1);
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
    this.view?.destroy();
    const f = this.party[this.index];
    this.view = buildCharacterInfo(this, f.def.id, {
      fighter: f,
      tabs: { ids: this.party.map(p => p.def.id), index: this.index, fainted: this.party.map(p => p.fainted) },
      footer: this.party.length > 1 ? 'I / X close    Arrows: teammates' : 'I / X close',
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
