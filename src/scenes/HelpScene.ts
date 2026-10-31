import Phaser from 'phaser';
import { audio } from '../audio';
import { EXP_SHARE_STEPS, MAX_BOOST, MAX_PARTY, MAX_STAGE, START_BOOST, TYPE_STRONG, TYPE_WEAK, ULTIMATE_LEVEL } from '../data/fighters';
import { EFFECTS, FIRST_RIVAL_WAVE, RIVAL_CHANCE } from '../data/zones';
import { PRICE_GROWTH_PER_ZONE } from '../data/items';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

/** Een pagina: titel, regels tekst en optioneel icoontjes die naast bepaalde regels staan. */
interface Page { title: string; lines: string[]; icons?: Array<[number, string]>; }

/** Alle uitleg op één plek. Getallen komen uit de data-bestanden, zodat het altijd klopt. */
function pages(): Page[] {
  const pct = (m: number) => `x${m}`;
  return [
    {
      title: 'BATTLES',
      lines: [
        'Pick a move in Fight. The faster',
        'fighter attacks first, unless a move',
        'says "1ST" (it always goes first).',
        '',
        'Every 10 waves a zone ends with a',
        'boss. Beat it for a Chaos Emerald.',
        '',
        'C: your stats   V: field effects',
        'M: settings',
      ],
    },
    {
      title: 'BOOST',
      lines: [
        `The Boost meter holds ${MAX_BOOST}. You start`,
        `a run with ${START_BOOST}. It stays between waves.`,
        '',
        'Spin Attack is free and gives +1.',
        'Getting hit gives +1.',
        'Stronger moves cost 1 to 3 Boost,',
        'and moves that cost Boost never miss.',
        '',
        `At Lv.${ULTIMATE_LEVEL} you learn an ultimate`,
        'that uses the whole meter.',
      ],
    },
    {
      title: 'TYPES',
      lines: [
        '     SPEED   Sonic',
        '     FLY     Tails, Cream',
        '     POWER   Knuckles, Amy',
        '',
        'FLY beats POWER',
        'POWER beats SPEED',
        'SPEED beats FLY',
        '',
        `Advantage ${pct(TYPE_STRONG)} damage, disadvantage ${pct(TYPE_WEAK)}.`,
        'Green arrow up = advantage, orange down = not.',
      ],
      icons: [[0, 'type_speed'], [1, 'type_fly'], [2, 'type_power']],
    },
    {
      title: 'STAT STAGES',
      lines: [
        'Power Up, Speed Shoes and Shield give',
        'ATK, SPD or DEF +1.',
        '',
        `Each stage is +25%, up to +${MAX_STAGE} (x2.5).`,
        'Going down: -1 = x0.8, -6 = x0.4,',
        'so +1 and -1 cancel out.',
        '',
        'Your stages reset after every',
        'zone boss.',
      ],
    },
    {
      title: 'ZONE EFFECTS',
      lines: [
        'Some zones affect you while you',
        'are there:',
        '',
        ...Object.values(EFFECTS).map(e => `${e.name}: ${e.desc}`),
        '',
        'Hot Crater = Heat, Toy Kingdom and',
        'Music Plant = Joy, Twinkle Snow and',
        'Ice Paradise = Freezing,',
        'Sky Canyon = Clouds.',
      ],
    },
    {
      title: 'RIVALS',
      lines: [
        'You start with Sonic, Tails and Amy.',
        '',
        `From wave ${FIRST_RIVAL_WAVE}, on every wave ending`,
        `in 5 there is a ${Math.round(RIVAL_CHANCE * 100)}% chance a rival`,
        'shows up instead of a strong badnik.',
        '',
        'Beat a rival to unlock them for good.',
        'They can also join your team right',
        'away (swap someone out if it is full).',
      ],
    },
    {
      title: 'YOUR TEAM',
      lines: [
        `Pick a team of up to ${MAX_PARTY}. The first one`,
        'starts the fight.',
        '',
        'Before each wave you may switch for',
        'free (Battle Style "Switch").',
        'Party in battle: switch, but the foe',
        'gets a free turn. Switching resets',
        'stat stages. KO = send in the next.',
        `Exp. Share: the bench gets ${EXP_SHARE_STEPS[0][1] * 100}% EXP`,
        `after wave ${EXP_SHARE_STEPS[0][0]}, ${EXP_SHARE_STEPS[1][1] * 100}% after wave ${EXP_SHARE_STEPS[1][0]}.`,
      ],
    },
    {
      title: 'REWARDS & SHOP',
      lines: [
        'After every wave: pick 1 of 3 item',
        'monitors, and spend rings in the shop.',
        '',
        'Better healing items unlock as you',
        'get further. Prices go up',
        `${Math.round(PRICE_GROWTH_PER_ZONE * 100)}% every zone.`,
        '',
        'Use items in battle with Items.',
        'Using an item costs your turn.',
      ],
    },
  ];
}

/** Uitleg-overlay ("?" rechtsboven of H). Pijltjes bladeren, X sluit. */
export class HelpScene extends Phaser.Scene {
  private from = '';
  private page = 0;
  private layer!: Phaser.GameObjects.Container;

  constructor() { super('Help'); }

  init(data: { from: string }) { this.from = data.from; this.page = 0; }

  create() {
    this.add.rectangle(0, 0, W, H, 0x05060c, 0.75).setOrigin(0).setInteractive();
    const bx = 50, by = 22, bw = 380, bh = 220;
    const g = this.add.graphics();
    g.fillStyle(0x10131c, 0.97).fillRoundedRect(bx, by, bw, bh, 6);
    g.lineStyle(2, 0x4aa8ff).strokeRoundedRect(bx + 1, by + 1, bw - 2, bh - 2, 6);
    this.layer = this.add.container(0, 0);

    const prev = this.add.text(bx + 14, by + bh - 18, '< prev', { fontFamily: FONT, fontSize: '8px', color: '#9aa4c4' }).setInteractive({ useHandCursor: true });
    const next = this.add.text(bx + bw - 14, by + bh - 18, 'next >', { fontFamily: FONT, fontSize: '8px', color: '#9aa4c4' }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    const close = this.add.text(W / 2, by + bh - 18, 'Close', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    prev.on('pointerdown', () => this.turn(-1));
    next.on('pointerdown', () => this.turn(1));
    close.on('pointerdown', () => this.close());

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'a', 'arrowup', 'w'].includes(k)) this.turn(-1);
      else if (['arrowright', 'd', 'arrowdown', 's', 'z', 'enter', ' '].includes(k)) this.turn(1);
      else if (['x', 'escape', 'backspace', 'h'].includes(k)) this.close();
    });
    this.draw();
  }

  private turn(d: number) {
    const n = pages().length;
    this.page = Phaser.Math.Wrap(this.page + d, 0, n);
    audio.sfx('cursormove');
    this.draw();
  }

  private draw() {
    const all = pages();
    const p = all[this.page];
    const bx = 50, by = 22;
    this.layer.removeAll(true);
    this.layer.add(this.add.text(bx + 18, by + 14, p.title, { fontFamily: FONT, fontSize: '8px', color: '#f2c230' }));
    this.layer.add(this.add.text(bx + 362, by + 14, `${this.page + 1}/${all.length}`, { fontFamily: FONT, fontSize: '8px', color: '#6b7493' }).setOrigin(1, 0));
    p.lines.forEach((line, i) => {
      this.layer.add(this.add.text(bx + 18, by + 34 + i * 15, line, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }));
    });
    for (const [row, key] of p.icons ?? []) {
      this.layer.add(this.add.image(bx + 26, by + 38 + row * 15, key).setOrigin(0.5));
    }
  }

  private close() {
    audio.sfx('back');
    this.input.keyboard!.removeAllListeners();
    this.scene.resume(this.from);
    this.scene.stop();
  }
}
