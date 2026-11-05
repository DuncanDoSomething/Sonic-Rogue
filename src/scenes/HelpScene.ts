import Phaser from 'phaser';
import { audio } from '../audio';
import { EMERALD_EXP_BONUS, EXP_SHARE_STEPS, FIGHTERS, HEROES, MAX_BOOST, MAX_PARTY, MAX_STAGE, type PassiveDef, START_BOOST, TYPE_STRONG, TYPE_WEAK, ULTIMATE_LEVEL } from '../data/fighters';
import { EFFECTS, FIRST_RIVAL_WAVE, LATE_RIVAL_WAVE, MAIN_BOSS_BOOST, RIVAL_CHANCE, SHADOW_BOSS_CHANCE, ZONE_BOSS_HEAL, ZONES } from '../data/zones';
import { BAG_SIZE, ITEMS, ITEMS_PER_FIGHT } from '../data/items';
import { TIER_COLOR, TIER_NAME, TIERS } from '../data/rewards';
import { HUD, sonicPanel } from './hud';
import { richLine } from './richText';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';
/** tekens per regel in het rechtervak */
const COLS = 34;

/** Icoontje voor een regel: een plaatje (uit de ui-atlas of los) of een gekleurd blokje. */
interface Icon { row: number; key?: string; frame?: string; color?: number; scale?: number }
/** Een pagina: titel, regels tekst (regels met icoon beginnen met 4 spaties) en icoontjes. */
export interface Page { title: string; lines: string[]; icons?: Icon[] }
export interface Category { name: string; pages: Page[] }

/** Knipt een zin op in regels van max `n` tekens (op woorden). */
function wrap(text: string, n = COLS): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}

/** Passives met het hoofdje van het character voor de naam. */
function passivePage(title: string, ids: string[], extra: string[] = []): Page {
  const lines: string[] = [];
  const icons: Icon[] = [];
  for (const id of ids) {
    const pa = FIGHTERS[id].passive as PassiveDef | undefined;
    if (!pa) continue;
    icons.push({ row: lines.length, key: 'ui', frame: `head_${id}` });
    lines.push(`    ${pa.name.toUpperCase()}`, ...wrap(pa.desc));
  }
  return { title, lines: [...lines, ...extra], icons };
}

/**
 * Alle uitleg, per onderwerp. Getallen komen uit de data-bestanden, zodat het na een
 * balance-change altijd klopt. Regels zijn max 34 tekens.
 */
export function categories(): Category[] {
  const pct = (m: number) => `x${m}`;
  const effectZones = (name: string) => ZONES.filter(z => z.effect?.name === name).map(z => z.name).join(', ');
  const heartFor: Record<string, string> = { healthRing: 'heart_25', superRing: 'heart_50', hyperRing: 'heart_75', chiliDog: 'heart_100' };
  const healItems = Object.values(ITEMS).filter(it => heartFor[it.id]);
  return [
    {
      name: 'BASICS',
      pages: [{
        title: 'THE GOAL',
        lines: [
          `Beat wave after wave with a team`,
          `of up to ${MAX_PARTY}. One run, no second`,
          'chances: when your whole team is',
          'down, the run is over.',
          '',
          '    Every 10 waves a zone ends with',
          '    a boss. Beat it for a Chaos',
          '    Emerald. Collect all seven!',
          '',
          'After every wave you pick a free',
          'reward and can shop with rings.',
          'The run saves after every wave.',
        ],
        icons: [{ row: 5, key: 'emeralds', frame: 'emerald_green_0' }],
      }],
    },
    {
      name: 'BATTLE',
      pages: [
        {
          title: 'TURNS',
          lines: [
            'Pick FIGHT and a move. The faster',
            'fighter attacks first, unless a',
            'move always goes first (like',
            'Homing Attack).',
            '',
            'Moves can miss, and crits hit',
            'for 1.5x damage.',
            'STUNNED fighters skip turns.',
            'A FLINCH skips the next move.',
            '',
            'C: your stats   V: the field',
          ],
        },
        {
          title: 'TYPES',
          lines: [
            '    SPEED   Sonic',
            '    FLY     Tails, Cream',
            '    POWER   Knuckles, Amy',
            '',
            'FLY beats POWER',
            'POWER beats SPEED',
            'SPEED beats FLY',
            '',
            `Advantage: ${pct(TYPE_STRONG)} damage.`,
            `Disadvantage: ${pct(TYPE_WEAK)} damage.`,
          ],
          icons: [{ row: 0, key: 'type_speed' }, { row: 1, key: 'type_fly' }, { row: 2, key: 'type_power' }],
        },
        {
          title: 'STAT STAGES',
          lines: [
            'Some moves and passives change',
            'stats, like Homing Attack (SPD+1).',
            '',
            `Each stage is +25%, up to +${MAX_STAGE}`,
            '(x2.5). Going down: -1 = x0.8,',
            '-6 = x0.4, so +1 and -1 cancel.',
            '',
            'Switching out resets them, and',
            'they wear off after a zone boss.',
          ],
        },
      ],
    },
    {
      name: 'BOOST & MOVES',
      pages: [
        {
          title: 'BOOST',
          lines: [
            `The Boost meter holds ${MAX_BOOST}. You`,
            `start a run with ${START_BOOST}, and it stays`,
            'between waves.',
            '',
            'Spin Attack is free and gives +1',
            '(Shadow: +2). Getting hit: +1.',
            'Stronger moves cost 1 to 4 Boost',
            'and never miss (an ACC drop, like',
            'the clouds in Sky Canyon, still',
            'hurts).',
          ],
        },
        {
          title: 'ULTIMATES & INFO',
          lines: [
            `At Lv.${ULTIMATE_LEVEL} every character learns`,
            'an ultimate. It uses the whole',
            'Boost meter and always hits.',
            '',
            'In the FIGHT menu, press C for',
            'the full move info.',
            "Press I to read a character's",
            'passive, moves and ultimate.',
            '',
            'Green arrow next to a move: type',
            'advantage. Orange: disadvantage.',
          ],
        },
      ],
    },
    {
      name: 'TEAM',
      pages: [
        {
          title: 'SWITCHING',
          lines: [
            `Pick a team of up to ${MAX_PARTY}. The first`,
            'one starts the fight.',
            '',
            'Before each wave you may switch',
            'for free (Battle Style "Switch"',
            'in Settings).',
            'PARTY in battle also switches,',
            'but the foe gets a free turn.',
            '',
            'The party list shows the HP and',
            'Boost of every teammate.',
          ],
        },
        {
          title: 'KO & RECOVERY',
          lines: [
            'When someone goes down, send in',
            'the next. They stay down until',
            'you beat the zone boss.',
            '',
            `After a zone boss: everyone back`,
            `up to at least ${Math.round(ZONE_BOSS_HEAL * 100)}% HP.`,
            'After waves 20, 40, 60 and 80:',
            `full heal and ${MAIN_BOSS_BOOST}+ Boost each.`,
            '',
            '    From wave 20 the shop sells a',
            '    Revive (50% HP).',
          ],
          icons: [{ row: 9, key: 'ui', frame: 'head_sonic' }],
        },
        {
          title: 'EXP',
          lines: [
            'Everyone who fought in a wave',
            'gets the full EXP. So switch!',
            '',
            `Exp. Share: the bench gets ${EXP_SHARE_STEPS[0][1] * 100}%`,
            `EXP after wave ${EXP_SHARE_STEPS[0][0]}, ${EXP_SHARE_STEPS[1][1] * 100}% after ${EXP_SHARE_STEPS[1][0]}.`,
            '',
            `    Every Chaos Emerald adds +${Math.round(EMERALD_EXP_BONUS * 100)}%`,
            '    for the bench (all 7: +35%).',
          ],
          icons: [{ row: 6, key: 'emeralds', frame: 'emerald_green_0' }],
        },
        {
          title: 'RIVALS',
          lines: [
            'You start with Sonic, Tails and',
            `Amy. From wave ${FIRST_RIVAL_WAVE}, on waves`,
            `ending in 5, there is a ${Math.round(RIVAL_CHANCE * 100)}%`,
            `chance a rival shows up. After`,
            `wave ${LATE_RIVAL_WAVE} they can show up on`,
            'other waves too, a bit stronger.',
            '',
            'Beat a rival to unlock them. They',
            'can also join your team right',
            'away. Shadow is no rival: he is a',
            'rare boss.',
          ],
        },
      ],
    },
    {
      name: 'PASSIVES',
      pages: [
        passivePage('PASSIVES 1/2', HEROES.slice(0, 3)),
        passivePage('PASSIVES 2/2', HEROES.slice(3), ['', 'Press I to see everything a', 'character can do.']),
      ],
    },
    {
      name: 'REWARDS & SHOP',
      pages: [
        {
          title: 'REWARDS',
          lines: [
            'After every wave: pick 1 of 3',
            'free monitors. The border shows',
            'how rare it is:',
            '',
            ...TIERS.map(t => `    ${TIER_NAME[t]}`),
            '',
            'After a boss the odds go up.',
          ],
          icons: TIERS.map((t, i) => ({ row: 4 + i, color: TIER_COLOR[t] })),
        },
        {
          title: 'BUFFS',
          lines: [
            '    Shield: the next hit does half',
            '    Invincibility: dodge one hit',
            '    Magnet Shield: double rings',
            "    Amy's Hammer: more crits",
            '    Eggman Alarm: elite foe, better',
            '    loot',
            '',
            'Active buffs show on the left of',
            'the battle screen. Hover or tap',
            'them to see how long they last.',
          ],
          icons: [
            { row: 0, key: 'ui', frame: 'monitor_shield', scale: 0.55 }, { row: 1, key: 'ui', frame: 'monitor_power', scale: 0.55 },
            { row: 2, key: 'ui', frame: 'monitor_thunder', scale: 0.55 }, { row: 3, key: 'mon_tornado', scale: 0.55 },
            { row: 4, key: 'mon_alert', scale: 0.55 },
          ],
        },
        {
          title: 'SHOP & BAG',
          lines: [
            'Healing mostly comes from the',
            'shop. The fuller the heart, the',
            'more it heals:',
            ...healItems.map(it => `    ${it.desc}`),
            '',
            `Your bag holds ${BAG_SIZE} items. Using one`,
            `in battle is free, ${ITEMS_PER_FIGHT} per fight.`,
            'Prices and rings grow each wave.',
          ],
          icons: healItems.map((it, i) => ({ row: 3 + i, key: heartFor[it.id] })),
        },
      ],
    },
    {
      name: 'ZONES & BOSSES',
      pages: [
        {
          title: 'ZONE EFFECTS',
          lines: [
            'Some zones affect your team while',
            'you are there:',
            '',
            ...Object.values(EFFECTS).flatMap(e => [`${e.name}: ${e.desc}`, `  ${effectZones(e.name)}`]),
          ],
        },
        {
          title: 'ZONE ORDER & BOSSES',
          lines: [
            'Every run starts in Route 99 and',
            'Leaf Forest. After that the zones',
            'are shuffled, but the hardest',
            'ones always come last.',
            '',
            '    Every 10th wave is a boss. Beat',
            '    it for a Chaos Emerald and a',
            '    patch-up for your team.',
          ],
          icons: [{ row: 5, key: 'emeralds', frame: 'emerald_blue_0' }],
        },
        {
          title: 'MAIN BOSSES & SHIELDS',
          lines: [
            '    Every 20th wave: Dr. Eggman.',
            `    Rarely (${Math.round(SHADOW_BOSS_CHANCE * 100)}%) Shadow takes`,
            '    his place. Beat him to unlock',
            '    him.',
            '',
            'A boss HP bar is split into',
            'shields. One hit breaks only one',
            'shield: the damage stops at the',
            'line. Only a huge hit (2x a',
            'shield of damage left over)',
            'breaks two at once.',
          ],
          icons: [{ row: 0, key: 'ui', frame: 'head_eggman' }, { row: 1, key: 'ui', frame: 'head_shadow' }],
        },
      ],
    },
    {
      name: 'CONTROLS',
      pages: [{
        title: 'CONTROLS',
        lines: [
          'Arrows / WASD   move',
          'Z / Enter       confirm',
          'X / Esc         back',
          'C               stats, move info',
          'I               character kits',
          'V               field panel',
          'H               How to Play',
          'M               pause menu',
          '',
          'Mouse and touch work too. Hover',
          'or tap icons for more info.',
        ],
      }],
    },
  ];
}

/**
 * How to Play: links de onderwerpen, rechts de pagina's. Omhoog/omlaag = onderwerp,
 * links/rechts = bladeren, X sluit. Vanaf het titelscherm staat bovenaan ook de Tutorial.
 */
export class HelpScene extends Phaser.Scene {
  private from = '';
  private cat = 0;
  private page = 0;
  private tutorial = false;
  private layer!: Phaser.GameObjects.Container;
  private listTexts: Phaser.GameObjects.Text[] = [];
  private cursor!: Phaser.GameObjects.Sprite;
  private cats: Category[] = [];

  constructor() { super('Help'); }

  init(data: { from: string; tutorial?: boolean }) {
    this.from = data.from;
    this.tutorial = !!data.tutorial;
    this.cat = 0;
    this.page = 0;
    this.listTexts = [];
  }

  /** Onderwerpen in de lijst; met de tutorial erbij staat die bovenaan. */
  private get entries(): string[] { return [...(this.tutorial ? ['TUTORIAL'] : []), ...this.cats.map(c => c.name)]; }
  private get isTutorial() { return this.tutorial && this.cat === 0; }
  private get category(): Category | undefined { return this.cats[this.cat - (this.tutorial ? 1 : 0)]; }

  create() {
    this.cats = categories();
    this.add.rectangle(0, 0, W, H, 0x05060c, 0.75).setOrigin(0).setInteractive();
    const bx = 14, by = 12, bw = W - 28, bh = H - 24;
    const g = sonicPanel(this.add.graphics(), bx, by, bw, bh, 'blue', 0.97);
    g.fillStyle(HUD.outline).fillRect(160, by + 8, 1, bh - 30);
    this.add.text(26, by + 12, 'HOW TO PLAY', { fontFamily: FONT, fontSize: '8px', color: HUD.label });

    this.entries.forEach((name, i) => {
      const t = this.add.text(40, by + 34 + i * 17, name, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => { if (this.cat === i && this.isTutorial) this.startTutorial(); else this.select(i); });
      this.listTexts.push(t);
    });
    this.cursor = this.add.sprite(26, 0, 'ui', 'ring_0').setOrigin(0, 0).setScale(0.5).play('ring_spin');
    this.layer = this.add.container(0, 0);

    this.add.text(26, by + bh - 16, 'Up/Down topic  Left/Right page  X close', { fontFamily: FONT, fontSize: '8px', color: HUD.muted });

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'w'].includes(k)) this.select(Phaser.Math.Wrap(this.cat - 1, 0, this.entries.length));
      else if (['arrowdown', 's'].includes(k)) this.select(Phaser.Math.Wrap(this.cat + 1, 0, this.entries.length));
      else if (['arrowleft', 'a'].includes(k)) this.turn(-1);
      else if (['arrowright', 'd'].includes(k)) this.turn(1);
      else if (['z', 'enter', ' '].includes(k)) { if (this.isTutorial) this.startTutorial(); else this.turn(1); }
      else if (['x', 'escape', 'backspace', 'h'].includes(k)) this.close();
    });
    this.draw();
  }

  private select(i: number) {
    if (i === this.cat) return;
    this.cat = i;
    this.page = 0;
    audio.sfx('cursormove');
    this.draw();
  }

  private turn(d: number) {
    const n = this.category?.pages.length ?? 1;
    if (n < 2) return;
    this.page = Phaser.Math.Wrap(this.page + d, 0, n);
    audio.sfx('cursormove');
    this.draw();
  }

  private draw() {
    this.listTexts.forEach((t, i) => t.setColor(i === this.cat ? HUD.label : this.tutorial && i === 0 ? '#7cf07c' : '#ffffff'));
    this.cursor.setY(this.listTexts[this.cat].y);
    this.layer.removeAll(true);
    const x0 = 174, y0 = 24;
    const txt = (x: number, y: number, s: string, color = '#ffffff') => {
      const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: '8px', color });
      this.layer.add(t);
      return t;
    };
    if (this.isTutorial) {
      // Tails stelt zich voor
      this.layer.add(this.add.image(x0 + 4, y0 + 22, 'guide_tails').setOrigin(0, 0));
      txt(x0, y0, 'PRACTICE WITH TAILS', HUD.label);
      wrap('Hey! I\'m Tails. Let\'s practice a fight together: attacking, Boost, items, switching and rewards. It takes about two minutes and nothing is saved.', 26)
        .forEach((l, i) => txt(x0 + 74, y0 + 22 + i * 13, l));
      const btn = this.add.container(x0 + 140, y0 + 176);
      const bg = sonicPanel(this.add.graphics(), -60, -11, 120, 22, 'cream');
      const label = this.add.text(0, 0, 'Z: START', { fontFamily: FONT, fontSize: '8px', color: HUD.ink }).setOrigin(0.5);
      btn.add([bg, label]).setSize(120, 22).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.startTutorial());
      this.tweens.add({ targets: btn, scale: 1.05, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.layer.add(btn);
      return;
    }
    const cat = this.category!;
    const p = cat.pages[this.page];
    txt(x0, y0, p.title, HUD.label);
    if (cat.pages.length > 1) {
      // bladeren: < 1/3 >, ook klikbaar
      const right = W - 26;
      const next = txt(right, y0, '>', HUD.muted).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      const count = txt(right - 14, y0, `${this.page + 1}/${cat.pages.length}`, HUD.muted).setOrigin(1, 0);
      const prev = txt(count.x - count.width - 8, y0, '<', HUD.muted).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      next.on('pointerdown', () => this.turn(1));
      prev.on('pointerdown', () => this.turn(-1));
    }
    const step = Math.min(14, Math.floor(184 / Math.max(1, p.lines.length)));
    // getallen, stats en effecten in kleur, zodat het geen muur van tekst is
    p.lines.forEach((line, i) => richLine(this, x0, y0 + 20 + i * step, line, '#ffffff', this.layer));
    for (const ic of p.icons ?? []) {
      const y = y0 + 24 + ic.row * step;
      if (ic.color !== undefined) {
        const r = this.add.rectangle(x0 + 6, y, 10, 8, ic.color).setStrokeStyle(1, HUD.outline);
        this.layer.add(r);
        continue;
      }
      const img = ic.frame ? this.add.image(x0 + 6, y, ic.key!, ic.frame) : this.add.image(x0 + 6, y, ic.key!);
      img.setScale(ic.scale ?? Math.min(1, 16 / img.width, 16 / img.height));
      this.layer.add(img);
    }
  }

  /** Tutorial starten: alles achter ons dicht en een oefengevecht met Tails als gids. */
  private startTutorial() {
    audio.sfx('confirm2');
    this.input.keyboard!.removeAllListeners();
    const from = this.scene.get(this.from);
    from.input.keyboard?.removeAllListeners();
    from.input.removeAllListeners();
    this.scene.stop(this.from);
    this.scene.start('Battle', { party: ['sonic', 'tails'], tutorial: true });
  }

  private close() {
    audio.sfx('back');
    this.input.keyboard!.removeAllListeners();
    this.scene.resume(this.from);
    this.scene.stop();
  }
}
