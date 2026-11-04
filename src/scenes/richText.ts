// ---------------------------------------------------------------------------
// Uitlegtekst met kleur: getallen in goud, stats in cyaan, wat een move/passive doet in groen
// en nadelen in oranje. Zo zie je bij de eerste blik wat iets doet, in plaats van een muur tekst.
// Werkt per regel: woorden met dezelfde kleur worden één tekst-object.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';

const FONT = '"Press Start 2P", monospace';

export const RICH = {
  num: '#ffd23a',
  stat: '#6ad8ff',
  good: '#7cf07c',
  bad: '#ff9a5a',
};

const STATS = new Set(['atk', 'def', 'spd', 'acc', 'hp', 'boost', 'power', 'pwr']);
const GOOD = new Set([
  'stun', 'stuns', 'stunned', 'flinch', 'flinches', 'crit', 'crits', 'critical', 'heal', 'heals', 'healed',
  'raises', 'dodge', 'dodges', 'survives', 'first', 'miss', 'misses', 'doubled', 'doubles', 'harder',
]);
const BAD = new Set(['lowers', 'costs', 'cost', 'recoil']);
/** woord ervoor dat ook groen wordt: "never misses", "always hits", "strikes first" */
const LEADS = new Set(['never', 'always', 'strikes', 'goes']);
const NUMBER = /^[+\-x]?\d+(\.\d+)?(%|x)?$/i;

/** Kleur per woord (zonder leestekens), of undefined = de basiskleur. */
export function wordColors(words: string[]): Array<string | undefined> {
  const core = (w: string) => w.replace(/^[^\w+\-]+/, '').replace(/[^\w%]+$/, '').toLowerCase();
  const out = words.map(w => {
    const c = core(w);
    if (!c) return undefined;
    if (NUMBER.test(c)) return RICH.num;
    if (STATS.has(c)) return RICH.stat;
    if (GOOD.has(c)) return RICH.good;
    if (BAD.has(c)) return RICH.bad;
    return undefined;
  });
  // "Never misses", "Always strikes first": het woord ervoor hoort erbij
  for (let i = words.length - 2; i >= 0; i--) {
    if (LEADS.has(core(words[i])) && out[i + 1] === RICH.good) out[i] = RICH.good;
  }
  // extra spaties (lege woorden) horen bij het woord ervoor (vooraan: bij het eerste woord),
  // zodat er nooit een tekst-object met alleen spaties is (die meet geen breedte)
  const first = words.findIndex(w => w !== '');
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== '') continue;
    out[i] = i < first ? out[first] : out[i - 1];
  }
  return out;
}

/** Knipt een zin op in regels van max `n` tekens (op woorden). Extra spaties blijven staan. */
export function wrapChars(text: string, n: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line: string | null = null;
    for (const w of para.split(' ')) {
      const next: string = line === null ? w : `${line} ${w}`;
      if (next.length > n && line !== null && line.trim() !== '') { out.push(line); line = w; } else line = next;
    }
    out.push(line ?? '');
  }
  return out;
}

/**
 * Eén regel met kleuren, als tekst-objecten naast elkaar (in `parent` als die er is).
 * Geeft de objecten terug.
 */
export function richLine(scene: Phaser.Scene, x: number, y: number, line: string, base: string, parent?: Phaser.GameObjects.Container) {
  const words = line.split(' ');
  const colors = wordColors(words);
  const objs: Phaser.GameObjects.Text[] = [];
  let i = 0, cx = x;
  while (i < words.length) {
    const color = colors[i] ?? base;
    let j = i;
    while (j + 1 < words.length && (colors[j + 1] ?? base) === color) j++;
    const last = j === words.length - 1;
    const t = scene.add.text(cx, y, words.slice(i, j + 1).join(' ') + (last ? '' : ' '), { fontFamily: FONT, fontSize: '8px', color });
    objs.push(t);
    parent?.add(t);
    cx += t.width;
    i = j + 1;
  }
  return objs;
}

/** Een heel stuk tekst, gewrapt op `cols` tekens. Geeft het aantal regels terug. */
export function richText(scene: Phaser.Scene, x: number, y: number, text: string, cols: number, lineH: number, base: string, parent?: Phaser.GameObjects.Container) {
  const lines = wrapChars(text, cols);
  lines.forEach((l, i) => richLine(scene, x, y + i * lineH, l, base, parent));
  return lines.length;
}
