// ---------------------------------------------------------------------------
// Overzicht van een character: type, passive, moves en ultimate.
// Gebruikt in character select (C) en midden in een run (C in het gevecht, dan met live stats).
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { FIGHTERS, Fighter, MAX_BOOST, MOVES, SPEED_POWER, ULTIMATE_LEVEL, type MoveDef, type StageKey } from '../data/fighters';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

export interface InfoOptions {
  /** het echte character uit je team: dan ook level, HP, stats en stages */
  fighter?: Fighter;
  /** nog op slot: alleen "???" */
  locked?: boolean;
  /** tabjes met hoofdjes bovenin (je team), `index` is de geselecteerde */
  tabs?: { ids: string[]; index: number; fainted?: boolean[] };
  footer: string;
  onClose: () => void;
}

export function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}

/** "PWR 55", "PWR 50-150", "HEAL 30%" ... */
export function powerLabel(m: MoveDef) {
  if (m.teamHeal) return `HEAL ${Math.round(m.teamHeal * 100)}%`;
  if (m.heal) return `HEAL ${Math.round(m.heal * 100)}%`;
  if (m.scaling === 'speed') return `PWR ${SPEED_POWER[SPEED_POWER.length - 1][1]}-${SPEED_POWER[0][1]}`;
  if (m.scaling === 'stages') return `PWR ${m.power}+`;
  return `PWR ${m.power}`;
}

/** "+1 BOOST" voor gratis moves, anders wat hij kost. */
export function costLabel(m: MoveDef) {
  if (!m.cost) return `+${m.boostGain ?? 0} BOOST`;
  return m.cost >= MAX_BOOST ? 'ALL BOOST' : `${m.cost} BOOST`;
}

/** Bouwt het hele overzicht als één container (bovenop alles). */
export function buildCharacterInfo(scene: Phaser.Scene, id: string, o: InfoOptions): Phaser.GameObjects.Container {
  const def = FIGHTERS[id];
  const c = scene.add.container(0, 0).setDepth(50);
  const bx = 10, by = 8, bw = W - 20, bh = H - 16;
  c.add(scene.add.rectangle(0, 0, W, H, 0x05060c, 0.6).setOrigin(0).setInteractive().on('pointerdown', o.onClose));
  const g = scene.add.graphics();
  g.fillStyle(0x10131c, 0.97).fillRoundedRect(bx, by, bw, bh, 6);
  g.lineStyle(2, 0xf2c230).strokeRoundedRect(bx + 1, by + 1, bw - 2, bh - 2, 6);
  c.add(g);
  const txt = (x: number, y: number, t: string, color = '#ffffff') => {
    const tt = scene.add.text(x, y, t, { fontFamily: FONT, fontSize: '8px', color });
    c.add(tt);
    return tt;
  };
  const right = (x: number, y: number, t: string, color = '#9aa4c4') =>
    c.add(scene.add.text(x, y, t, { fontFamily: FONT, fontSize: '8px', color }).setOrigin(1, 0));

  if (!def || o.locked) {
    txt(bx + 14, by + 14, '???', '#e8443a');
    txt(bx + 14, by + 32, 'Beat this character as a rival to', '#cfd6ee');
    txt(bx + 14, by + 44, 'find out what they can do.', '#cfd6ee');
    txt(bx + 14, by + bh - 16, o.footer, '#9aa4c4');
    return c;
  }

  const x = bx + 14;
  let y = by + 12;
  const f = o.fighter;

  // tabjes: hoofdjes van je team rechtsboven
  if (o.tabs) {
    o.tabs.ids.forEach((tid, i) => {
      const hx = bx + bw - 14 - (o.tabs!.ids.length - i) * 22;
      const sel = i === o.tabs!.index;
      if (sel) c.add(scene.add.rectangle(hx - 2, y - 4, 20, 18, 0xf2c230, 0.9).setOrigin(0));
      c.add(scene.add.image(hx, y - 2, 'ui', `head_${tid}`).setOrigin(0).setAlpha(o.tabs!.fainted?.[i] ? 0.35 : 1));
    });
  }

  txt(x, y, def.name.toUpperCase() + (f ? `  Lv.${f.level}` : ''), '#f2c230');
  txt(x + (f ? 150 : 110), y, `${def.type.toUpperCase()} type`, '#9aa4c4');
  y += 16;

  if (f) {
    // live stats, met stages zoals in PokéRogue (+2, -1)
    const st = (k: StageKey) => { const v = f.stage(k); return v === 0 ? '' : `(${v > 0 ? '+' : ''}${v})`; };
    const ko = f.fainted;
    txt(x, y, ko ? `HP 0/${f.maxHp}  KO` : `HP ${f.hp}/${f.maxHp}`, ko ? '#e8443a' : '#7cf07c');
    txt(x + 120, y, `BOOST ${f.boost}/${MAX_BOOST}`, '#8ad8ff');
    txt(x + 250, y, `EXP ${f.exp}/${f.expToNext}`, '#9aa4c4');
    y += 11;
    txt(x, y, `ATK ${f.atk}${st('atk')}   DEF ${f.dfn}${st('def')}   SPD ${f.spd}${st('spd')}${f.stage('acc') ? `   ACC ${st('acc')}` : ''}`, '#ffffff');
    y += 15;
  }

  if (def.passive) {
    txt(x, y, `PASSIVE  ${def.passive.name}`, '#7cf07c');
    y += 11;
    for (const line of wrap(def.passive.desc, 54)) { txt(x, y, line, '#cfd6ee'); y += 10; }
    y += 5;
  }
  const moves = [...def.moves, ...(def.ultimate ? [def.ultimate] : [])];
  for (const mid of moves) {
    const m = MOVES[mid];
    const ult = mid === def.ultimate;
    const learned = !ult || !f || f.level >= ULTIMATE_LEVEL;
    txt(x, y, m.name, ult ? (learned ? '#f2c230' : '#8a7a40') : '#ffffff');
    right(bx + bw - 14, y, `${powerLabel(m)}  ${costLabel(m)}${ult ? `  Lv.${ULTIMATE_LEVEL}` : ''}`, learned ? '#9aa4c4' : '#5a6070');
    y += 11;
    const desc = m.desc.replace(/ Uses all Boost\.$/, '');
    for (const line of wrap(desc, 54)) { txt(x, y, line, learned ? '#cfd6ee' : '#6b7493'); y += 10; }
    y += 4;
  }
  txt(x, by + bh - 16, o.footer, '#9aa4c4');
  return c;
}
