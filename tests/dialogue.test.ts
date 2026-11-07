import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { RIVAL_TALK, pickTalk } from '../src/data/dialogue';
import { HEROES, RIVAL_HEROES } from '../src/data/fighters';

describe('rival-dialogen', () => {
  it('elke rival heeft een gesprekje met elk character dat je kunt hebben (voor en na het gevecht)', () => {
    for (const rival of RIVAL_HEROES) {
      for (const ally of HEROES.filter(h => h !== rival)) {
        const t = RIVAL_TALK[rival]?.[ally];
        expect(t?.intro.length, `${rival} vs ${ally} intro`).toBeGreaterThan(0);
        expect(t?.defeat.length, `${rival} vs ${ally} defeat`).toBeGreaterThan(0);
      }
    }
  });

  it('regels passen in het tekstvak en elk portret bestaat', () => {
    for (const [rival, allies] of Object.entries(RIVAL_TALK)) {
      for (const [ally, t] of Object.entries(allies)) {
        for (const ex of [...t.intro, ...t.defeat]) {
          expect(ex.some(l => l.who === 'rival') && ex.some(l => l.who === 'ally'), `${rival}/${ally}: twee kanten`).toBe(true);
          for (const l of ex) {
            expect(l.text.length, l.text).toBeLessThanOrEqual(100);
            const id = l.who === 'rival' ? rival : ally;
            expect(existsSync(`src/assets/menu/talk_${id}_${l.mood}.png`), `talk_${id}_${l.mood}`).toBe(true);
          }
        }
      }
    }
  });

  it('pickTalk kiest een variant en geeft niks als er geen tekst is', () => {
    expect(pickTalk('knuckles', 'sonic', 'intro', () => 0)).toBe(RIVAL_TALK.knuckles.sonic.intro[0]);
    expect(pickTalk('knuckles', 'sonic', 'intro', () => 0.99)).toBe(RIVAL_TALK.knuckles.sonic.intro[1]);
    expect(pickTalk('shadow', 'sonic', 'intro')).toBeUndefined();
  });
});
