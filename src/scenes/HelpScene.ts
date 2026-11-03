import Phaser from 'phaser';
import { audio } from '../audio';
import { EXP_SHARE_STEPS, FIGHTERS, HEROES, MAX_BOOST, MAX_PARTY, MAX_STAGE, type PassiveDef, START_BOOST, TYPE_STRONG, TYPE_WEAK, ULTIMATE_LEVEL } from '../data/fighters';
import { EFFECTS, FIRST_RIVAL_WAVE, RIVAL_CHANCE } from '../data/zones';
import { BAG_SIZE } from '../data/items';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

/** Een pagina: titel, regels tekst en optioneel icoontjes die naast bepaalde regels staan. */
interface Page { title: string; lines: string[]; icons?: Array<[number, string]>; }

/** Knipt een zin op in regels van max `n` tekens (op woorden). */
function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}

/** Per character: "SONIC SPEED  Sonic" en de uitleg eronder. */
function passiveLines(ids: string[]): string[] {
  return ids.flatMap(id => {
    const pa = FIGHTERS[id].passive as PassiveDef | undefined;
    return pa ? [`${pa.name.toUpperCase()}  (${FIGHTERS[id].name})`, ...wrap(pa.desc, 38)] : [];
  });
}

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
        'I: character kits   M: settings',
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
        'Stronger moves cost 1 to 3 Boost and',
        'have 100% accuracy (an ACC drop, like',
        'the clouds in Sky Canyon, still hurts).',
        `At Lv.${ULTIMATE_LEVEL} you learn an ultimate`,
        'that uses the whole meter. Ultimates',
        'always hit.',
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
        'Some moves and passives change stats,',
        'like Homing Attack (SPD +1).',
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
      title: 'PASSIVES (1/2)',
      lines: passiveLines(HEROES.slice(0, 3)),
    },
    {
      title: 'PASSIVES (2/2)',
      lines: [
        ...passiveLines(HEROES.slice(3)),
        '',
        'STUNNED fighters skip their turn.',
        'Press I (battle or character select)',
        'to see everything a character can do.',
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
        'Before each wave you may switch for',
        'free (Battle Style "Switch").',
        'Party in battle: switch, but the foe',
        'gets a free turn. Switching resets',
        'stat stages. KO = send in the next;',
        'they stay down until the zone boss.',
        'After a zone boss: everyone gets back',
        'up to at least 50% HP. Waves 20, 40,',
        '60, 80: full heal and 3+ Boost.',
        `Exp. Share: bench gets ${EXP_SHARE_STEPS[0][1] * 100}% EXP after`,
        `wave ${EXP_SHARE_STEPS[0][0]}, ${EXP_SHARE_STEPS[1][1] * 100}% after wave ${EXP_SHARE_STEPS[1][0]}.`,
      ],
    },
    {
      title: 'REWARDS & SHOP',
      lines: [
        'After every wave: pick 1 of 3 free',
        'monitors. The border shows how rare',
        'it is: grey common, green uncommon,',
        'blue rare, purple super, gold ultra.',
        'Healing mostly comes from the shop.',
        'Rings and prices grow every wave.',
        `Your bag holds ${BAG_SIZE} items. Using one in`,
        'battle is free, but only 1 per fight.',
        'From wave 20: Revive (50% HP).',
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
    // lange pagina's: regels iets dichter op elkaar, zodat alles boven de knoppen onderaan past
    const step = Math.min(15, Math.floor(160 / Math.max(1, p.lines.length)));
    p.lines.forEach((line, i) => {
      this.layer.add(this.add.text(bx + 18, by + 34 + i * step, line, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }));
    });
    for (const [row, key] of p.icons ?? []) {
      this.layer.add(this.add.image(bx + 26, by + 38 + row * step, key).setOrigin(0.5));
    }
  }

  private close() {
    audio.sfx('back');
    this.input.keyboard!.removeAllListeners();
    this.scene.resume(this.from);
    this.scene.stop();
  }
}
