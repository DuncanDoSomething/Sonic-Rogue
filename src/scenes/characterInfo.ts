// ---------------------------------------------------------------------------
// Overzicht van een character: type, passive, moves en ultimate.
// Gebruikt in character select (C of I) en midden in een run (I in het gevecht, met tabjes voor je team).
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { sonicPanel } from './hud';
import { richLine } from './richText';
import { BOSS_HEROES, FIGHTERS, Fighter, MAX_BOOST, MOVES, SPEED_POWER, ULTIMATE_LEVEL, type MoveDef } from '../data/fighters';

const W = 480;
const H = 270;
const FONT = '"Press Start 2P", monospace';

export interface InfoOptions {
  /** het echte character uit je team: dan ook zijn level (en of hij KO is) */
  fighter?: Fighter;
  /** nog op slot: alleen "???" */
  locked?: boolean;
  /** tabjes met hoofdjes bovenin (je team), `index` is de geselecteerde */
  tabs?: { ids: string[]; index: number; fainted?: boolean[] };
  footer: string;
  onClose: () => void;
  /** welke regel geselecteerd is (passive, moves, ultimate); blijft staan als je van teammate wisselt */
  row?: number;
}

/** Het overzicht, plus pijltjes omhoog/omlaag door de regels. */
export type InfoView = Phaser.GameObjects.Container & { row: number; moveRow(d: number): void };

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
  if (m.power === 0) return 'STATUS';
  if (m.scaling === 'speed') { const t = m.speedTable ?? SPEED_POWER; return `PWR ${t[t.length - 1][1]}-${t[0][1]}`; }
  if (m.scaling === 'stages' || m.scaling === 'atk') return `PWR ${m.power}+`;
  return `PWR ${m.power}`;
}

/** "+1 BOOST" voor gratis moves, anders wat hij kost. */
export function costLabel(m: MoveDef, spinGain?: number) {
  if (!m.cost) return `+${m.id === 'spinAttack' && spinGain ? spinGain : m.boostGain ?? 0} BOOST`;
  return m.cost >= MAX_BOOST ? 'ALL BOOST' : `${m.cost} BOOST`;
}

/**
 * Bouwt het overzicht als één container (bovenop alles): een kort lijstje met de passive, de moves en de
 * ultimate, en onderin de volledige uitleg van de regel waar je cursor (of muis) op staat.
 */
export function buildCharacterInfo(scene: Phaser.Scene, id: string, o: InfoOptions): InfoView {
  const def = FIGHTERS[id];
  const c = scene.add.container(0, 0).setDepth(50) as InfoView;
  c.row = 0;
  c.moveRow = () => {};
  const bx = 10, by = 8, bw = W - 20, bh = H - 16;
  c.add(scene.add.rectangle(0, 0, W, H, 0x05060c, 0.6).setOrigin(0).setInteractive().on('pointerdown', o.onClose));
  const g = sonicPanel(scene.add.graphics(), bx, by, bw, bh, 'blue', 0.97);
  c.add(g);
  const txt = (x: number, y: number, t: string, color = '#ffffff', into: Phaser.GameObjects.Container = c) => {
    const tt = scene.add.text(x, y, t, { fontFamily: FONT, fontSize: '8px', color });
    into.add(tt);
    return tt;
  };

  if (!def || o.locked) {
    txt(bx + 14, by + 14, '???', '#e8443a');
    const asBoss = BOSS_HEROES.includes(id);
    txt(bx + 14, by + 32, asBoss ? 'Beat this character as a boss to' : 'Beat this character as a rival to', '#cfd6ee');
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

  // hoofdje voor de naam, zodat je meteen ziet van wie deze kit is
  c.add(scene.add.image(x, y + 4, 'ui', `head_${id}`).setOrigin(0, 0.5).setAlpha(f?.fainted ? 0.5 : 1));
  txt(x + 22, y, def.name.toUpperCase() + (f ? `  Lv.${f.level}` : ''), '#f2c230');
  txt(x + 22 + (f ? 150 : 110), y, `${def.type.toUpperCase()} type`, '#9aa4c4');
  y += 18;
  if (f?.fainted) { txt(x, y - 6, 'KO - back after the zone boss', '#e8443a'); y += 8; }

  // de regels: passive, moves, ultimate
  type Row = { tag: string; tagColor: string; name: string; nameColor: string; meta: string; metaColor: string; desc: string; learned: boolean };
  const rows: Row[] = [];
  if (def.passive) rows.push({ tag: 'PASSIVE', tagColor: '#7cf07c', name: def.passive.name, nameColor: '#ffffff', meta: '', metaColor: '#9aa4c4', desc: def.passive.desc, learned: true });
  for (const mid of def.moves) {
    const m = MOVES[mid];
    rows.push({ tag: 'MOVE', tagColor: '#8ab4ff', name: m.name, nameColor: '#ffffff', meta: `${powerLabel(m)}  ${costLabel(m, def.spinGain)}`, metaColor: '#9aa4c4', desc: m.desc, learned: true });
  }
  if (def.ultimate) {
    const m = MOVES[def.ultimate];
    const learned = !f || f.level >= ULTIMATE_LEVEL;
    rows.push({ tag: 'ULTIMATE', tagColor: learned ? '#f2c230' : '#8a7a40', name: m.name, nameColor: learned ? '#f2c230' : '#8a7a40',
      meta: `${powerLabel(m)}  ${costLabel(m, def.spinGain)}  Lv.${ULTIMATE_LEVEL}`, metaColor: learned ? '#9aa4c4' : '#5a6070',
      desc: m.desc.replace(/ Uses all Boost\.$/, '') + (learned ? '' : ` Learned at level ${ULTIMATE_LEVEL}.`), learned });
  }

  const ROW_H = 17, rowX = bx + 8, rowW = bw - 16;
  const highlight = scene.add.graphics();
  c.add(highlight);
  const rowsTop = y;
  rows.forEach((r, i) => {
    const ry = rowsTop + i * ROW_H;
    txt(x + 6, ry + 4, r.tag, r.tagColor);
    txt(x + 84, ry + 4, r.name, r.nameColor);
    if (r.meta) c.add(scene.add.text(bx + bw - 14, ry + 4, r.meta, { fontFamily: FONT, fontSize: '8px', color: r.metaColor }).setOrigin(1, 0));
    const hit = scene.add.zone(rowX, ry, rowW, ROW_H).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => select(i));
    hit.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); select(i); });
    c.add(hit);
  });

  // onderin: de volledige uitleg van de geselecteerde regel
  const dy = rowsTop + rows.length * ROW_H + 8;
  const detailBg = scene.add.graphics();
  detailBg.fillStyle(0x0a1240, 0.85).fillRoundedRect(rowX, dy, rowW, by + bh - 22 - dy, 4);
  detailBg.lineStyle(1, 0x3a4aa0, 1).strokeRoundedRect(rowX + 0.5, dy + 0.5, rowW - 1, by + bh - 22 - dy - 1, 4);
  c.add(detailBg);
  const detail = scene.add.container(0, 0);
  c.add(detail);

  const select = (i: number) => {
    if (!rows.length) return;
    c.row = Phaser.Math.Wrap(i, 0, rows.length);
    const r = rows[c.row];
    const ry = rowsTop + c.row * ROW_H;
    highlight.clear();
    highlight.fillStyle(0xf2c230, 0.18).fillRoundedRect(rowX, ry, rowW, ROW_H - 1, 3);
    highlight.lineStyle(1, 0xf2c230, 0.9).strokeRoundedRect(rowX + 0.5, ry + 0.5, rowW - 1, ROW_H - 2, 3);
    detail.removeAll(true);
    let ty = dy + 8;
    txt(x, ty, r.name, r.nameColor, detail);
    if (r.meta) detail.add(scene.add.text(bx + bw - 14, ty, r.meta, { fontFamily: FONT, fontSize: '8px', color: r.metaColor }).setOrigin(1, 0));
    ty += 14;
    // nog niet geleerd: grijs zonder kleuren; anders getallen, stats en effecten in kleur
    for (const line of wrap(r.desc, 54)) {
      if (r.learned) richLine(scene, x, ty, line, '#cfd6ee', detail); else txt(x, ty, line, '#6b7493', detail);
      ty += 11;
    }
  };
  c.moveRow = (d: number) => select(c.row + d);
  select(Math.min(o.row ?? 0, rows.length - 1));

  txt(x, by + bh - 16, o.footer, '#9aa4c4');
  return c;
}
