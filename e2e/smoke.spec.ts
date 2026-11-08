import { expect, test, type Page } from '@playwright/test';
import { activeScenes, battle, fixReward, openGame, press, setup, startBattleWith, startRun, toCharacterSelect, trackErrors, waitForMenu } from './helpers';

test.describe('Sonic Rogue smoke tests', () => {
  test('the game boots without errors', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });

  test('intro, title screen and character select', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await toCharacterSelect(page);
    expect(await activeScenes(page)).not.toContain('Title');
    expect(errors).toEqual([]);
  });

  test('picking a team of three starts a run with that team', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    const s = await battle(page);
    expect(s.party).toEqual(['sonic', 'tails', 'amy']);
    expect(s.active).toBe('sonic');
    expect(s.wave).toBe(1);
  });

  test('a turn: Spin Attack builds Boost and the battle continues', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    // Sonic is fast enough to one-shot a wave-1 foe now; the foe always hits (no dodge, no Boost-stealing Shark Jet)
    await setup(page, "s.enemy.hp = 9999; s.dodgeRoll = () => 1; s.pickEnemyMove = () => ({ ...window.MOVES.bodyCheck, accuracy: 1000 });");
    const before = await battle(page);
    await press(page, 'z', 'z');                // Fight > Spin Attack
    await expect.poll(async () => (await battle(page)).menu).not.toBe('command');
    await waitForMenu(page, 'command');
    const after = await battle(page);
    expect(after.boost).toBeGreaterThan(before.boost);   // free move: +1 Boost (and +1 more if Sonic got hit)
    expect(errors).toEqual([]);
  });

  test('winning a wave: rewards, then the switch question before the next wave', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.enemy.hp = 1;');
    await press(page, 'z', 'ArrowRight', 'z');  // Fight > Homing Attack (never misses, goes first)
    await waitForMenu(page, 'reward');
    await fixReward(page);
    await press(page, 'z');                     // take a reward
    await waitForMenu(page, 'choice');          // "Will you switch characters?"
    expect((await battle(page)).wave).toBe(2);
    await press(page, 'ArrowDown', 'z');        // No
    await waitForMenu(page, 'command');
    expect((await battle(page)).active).toBe('sonic');
  });

  test('switching through Party costs a turn and swaps the active character', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await press(page, 'ArrowRight', 'z');       // Party
    await waitForMenu(page, 'choice');
    await press(page, 'z');                     // first one you can pick: Tails
    await waitForMenu(page, 'command');
    expect((await battle(page)).active).toBe('tails');
  });

  test('a KO sends in the next teammate instead of ending the run', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    // Sonic on 1 HP, the foe always hits first and Sonic's attack can't land
    // de vijand raakt altijd (anders is de test afhankelijk van zijn accuracy)
    // (en Sonic Speed ontwijkt niet)
    await setup(page, 's.player.hp = 1; s.enemy.hp = 9999; s.dodgeRoll = () => 1; s.pickEnemyMove = () => ({ ...window.MOVES.bodyCheck, accuracy: 1000 }); s.runTurn({ ...s.player.moves.map((m) => window.MOVES[m])[0], accuracy: 0, priority: -9 });');
    await waitForMenu(page, 'choice');          // "Who goes next?"
    await press(page, 'z');
    await waitForMenu(page, 'command');
    const s = await battle(page);
    expect(s.active).not.toBe('sonic');
    expect(s.party).toHaveLength(3);
  });

  test('regression: the ultimate can be selected with the arrow keys', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.player.level = 30; s.player.boost = 6;');
    await press(page, 'z', 'ArrowRight', 'ArrowDown');   // Fight > bottom-right slot
    expect((await battle(page)).cursorMove).toBe('lightSpeed');
  });

  test('regression: Light Speed Attack really gives Sonic SPD +3', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.player.level = 30; s.player.boost = 6; s.enemy.hp = 9999;');
    await press(page, 'z', 'ArrowRight', 'ArrowDown', 'z');
    await waitForMenu(page, 'command');
    const spd = await page.evaluate(() => (window as any).game.scene.getScene('Battle').player.stages.spd);
    expect(spd).toBe(3);
  });

  test('auto-save: after a reload you can continue from the same wave with the same team', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.enemy.hp = 1;');
    await press(page, 'z', 'ArrowRight', 'z');  // win wave 1
    await waitForMenu(page, 'reward');
    await fixReward(page);
    await press(page, 'z');
    await waitForMenu(page, 'choice');          // wave 2 started (and was saved)
    await page.reload();
    await expect.poll(() => activeScenes(page)).toContain('Title');
    await press(page, 'z');
    await page.waitForTimeout(400);
    await press(page, 'z', 'z', 'z');           // skip intro, menu, Game Start -> Continue prompt
    await press(page, 'z');                     // Continue
    await expect.poll(() => activeScenes(page)).toContain('Battle');
    await expect.poll(async () => (await battle(page)).wave).toBe(2);
    expect((await battle(page)).party).toEqual(['sonic', 'tails', 'amy']);
  });

  test('pause menu: Save & Quit goes to the title screen and the run can be continued', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    await waitForMenu(page, 'command');
    await press(page, 'm');
    await expect.poll(() => activeScenes(page)).toContain('Pause');
    await press(page, 'ArrowUp', 'z');          // Save & Quit (last row)
    await expect.poll(() => activeScenes(page)).toContain('Title');
    expect(await activeScenes(page)).not.toContain('Battle');
    await page.waitForTimeout(300);
    await press(page, 'z', 'z');                // title menu: Game Start, Continue
    await expect.poll(() => activeScenes(page)).toContain('Battle');
    await expect.poll(async () => (await battle(page)).wave).toBe(1);
    expect((await battle(page)).party).toEqual(['sonic', 'tails', 'amy']);
    expect(errors).toEqual([]);
  });

  test('Glove Punch stuns the foe for 2 turns, once per fight; Copter Dive keeps it stunned 1 turn longer', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    const foe = () => page.evaluate(() => { const e = (window as any).game.scene.getScene('Battle').enemy; return { stun: e.stun, spd: e.stages.spd }; });
    // Glove Punch eerst: 2 beurten verdoofd, de vijand slaat er meteen één over
    await setup(page, 's.enemy.stun = 0; s.player.boost = 6; s.enemy.hp = 9999; s.runTurn({ ...window.MOVES.glovePunch, priority: 9 });');
    await waitForMenu(page, 'command');
    expect((await foe()).stun).toBe(1);
    // Copter Dive op een verdoofde vijand: 1 beurt erbij (en hij slaat er weer één over)
    await setup(page, 's.player.boost = 6; s.runTurn(window.MOVES.copterDive);');
    await waitForMenu(page, 'command');
    expect((await foe()).stun).toBe(1);
    // nog een Glove Punch in hetzelfde gevecht: geen stun meer
    await setup(page, 's.enemy.stun = 0; s.player.boost = 6; s.runTurn({ ...window.MOVES.glovePunch, priority: 9 });');
    await waitForMenu(page, 'command');
    expect((await foe()).stun).toBe(0);
    // Copter Dive zonder stun: SPD -1 bij de vijand
    await setup(page, 's.player.boost = 6; s.runTurn(window.MOVES.copterDive);');
    await waitForMenu(page, 'command');
    expect((await foe()).spd).toBe(-1);
    expect(errors).toEqual([]);
  });

  test('C shows your stats, I shows the kits of your team', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await press(page, 'c');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').statsLayer.visible)).toBe(true);
    await press(page, 'c');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').statsLayer.visible)).toBe(false);
  });

  test('Chao Cheer heals the teammate you pick', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.party[2].hp = 1; s.party[2].boost = 0; s.enemy.hp = 9999; s.player.boost = 6; s.runTurn(window.MOVES.chaoCheer, s.party[2]);');
    await waitForMenu(page, 'command');
    const mate = await page.evaluate(() => { const m = (window as any).game.scene.getScene('Battle').party[2]; return { hp: m.hp, boost: m.boost }; });
    expect(mate.hp).toBeGreaterThan(1);
    expect(mate.boost).toBe(1);   // Chao Cheer geeft ook 1 Boost
  });

  test('character select: C shows what a character can do', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await toCharacterSelect(page);
    const open = () => page.evaluate(() => !!(window as any).game.scene.getScene('CharSelect').detail);
    await press(page, 'c');
    expect(await open()).toBe(true);
    await press(page, 'ArrowDown');
    expect(await open()).toBe(true);
    await press(page, 'x');
    expect(await open()).toBe(false);
    expect(await activeScenes(page)).toContain('CharSelect');
    expect(errors).toEqual([]);
  });

  test('every ultimate plays its cut-in and animation without errors', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    for (const id of ['sonic', 'tails', 'knuckles', 'amy', 'cream', 'shadow']) {
      await setup(page, `
        const F = s.player.constructor;
        const f = s.party.find(x => x.def.id === '${id}') ?? new F('${id}', 30);
        if (!s.party.includes(f)) s.party[2] = f;
        s.player = f; s.player.level = 30; s.player.boost = 6; s.player.hp = s.player.maxHp; s.enemy.hp = 99999;
        s.runTurn(window.MOVES[s.player.def.ultimate]);
      `);
      await expect.poll(async () => (await battle(page)).menu, { timeout: 30_000 }).not.toBe('command');
      await waitForMenu(page, 'command');
    }
    expect(errors).toEqual([]);
  });

  test('I mid-run opens the team kits; arrows switch teammates', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    await press(page, 'i');
    await expect.poll(() => activeScenes(page)).toContain('Team');
    const idx = () => page.evaluate(() => (window as any).game.scene.getScene('Team').index);
    expect(await idx()).toBe(0);
    await press(page, 'ArrowRight');
    expect(await idx()).toBe(1);
    await press(page, 'i');
    await expect.poll(() => activeScenes(page)).not.toContain('Team');
    await waitForMenu(page, 'command');
    expect(errors).toEqual([]);
  });

  test('KO teammates stay down until the zone boss is beaten', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.party[1].hp = 0; s.wave = 10; s.enemy.hp = 1;');
    await press(page, 'z', 'ArrowRight', 'z');  // Homing Attack wins the "boss" wave
    await waitForMenu(page, 'reward');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').party[1].hp)).toBeGreaterThan(0);
  });

  test('zone boss patches the team up to 50%; a main boss (wave 20) heals everyone fully with 3+ Boost', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    const team = () => page.evaluate(() => (window as any).game.scene.getScene('Battle').party.map((f: any) => ({ hp: f.hp, max: f.maxHp, boost: f.boost })));
    await setup(page, 's.party[1].hp = 1; s.wave = 10; s.enemy.hp = 1;');
    await press(page, 'z', 'ArrowRight', 'z');
    await waitForMenu(page, 'reward');
    let t = await team();
    expect(t[1].hp).toBe(Math.ceil(t[1].max / 2));
    // party view during rewards: I opens the team screen
    await press(page, 'i');
    await expect.poll(() => activeScenes(page)).toContain('Team');
    await press(page, 'x');
    await expect.poll(() => activeScenes(page)).not.toContain('Team');
    await fixReward(page);
    await press(page, 'z');
    await waitForMenu(page, 'choice');          // "Will you switch characters?"
    await press(page, 'ArrowDown', 'z');        // No
    await waitForMenu(page, 'command');
    await setup(page, 's.party[1].hp = 0; s.party[0].boost = 2; s.wave = 20; s.enemy.hp = 1;');
    await press(page, 'z', 'ArrowRight', 'z');
    await waitForMenu(page, 'reward');
    t = await team();
    expect(t.map(f => f.hp)).toEqual(t.map(f => f.max));
    expect(t.every(f => f.boost >= 3)).toBe(true);
  });

  test('a Revive from the bag brings a KO teammate back', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.party[1].hp = 0; s.bag.revive = 1; s.enemy.hp = 9999;');
    await press(page, 'ArrowDown', 'z');        // Items
    await waitForMenu(page, 'bag');
    await press(page, 'z');                     // Revive
    await waitForMenu(page, 'choice');
    await press(page, 'z');                     // the only KO teammate: Tails
    await waitForMenu(page, 'command');
    const s = await page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); return { hp: b.party[1].hp, max: b.party[1].maxHp, left: b.bag.revive }; });
    expect(s.hp).toBe(Math.ceil(s.max / 2));
    expect(s.left).toBe(0);
  });

  test('test mode (?test): everyone unlocked, hotkeys work, nothing is saved', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page, '/?test');
    await startRun(page);
    await press(page, '2');
    await waitForMenu(page, 'command');
    await press(page, '1');
    await expect.poll(async () => (await battle(page)).boost).toBe(6);
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').player.level)).toBe(30);
    expect(await page.evaluate(() => localStorage.getItem('sonicrogue_run'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('sonicrogue_unlocked'))).toBeNull();
    expect(errors).toEqual([]);
  });

  test('Amy below half HP: Tornado Hammer wins the wave but she goes down, and the next teammate steps in', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    await setup(page, `s.switchTo(s.party[2]).then(() => {
      s.player.level = 30; s.player.boost = 6; s.player.hp = Math.floor(s.player.maxHp * 0.4); s.enemy.hp = 1;
      s.runTurn(window.MOVES.tornadoHammer);
    });`);
    await waitForMenu(page, 'choice');            // "Who goes next?"
    await press(page, 'z');
    await waitForMenu(page, 'reward');
    const st = await page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); return { active: b.player.def.id, amyHp: b.party[2].hp }; });
    expect(st.amyHp).toBe(0);
    expect(st.active).not.toBe('amy');
    expect(errors).toEqual([]);
  });

  test('Amy: a crit with Hammer Twirl heals her and costs no HP', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    await setup(page, `s.switchTo(s.party[2]).then(() => {
      s.player.hp = 10; s.player.boost = 6; s.player.stages.atk = 2; // ATK +2: altijd crit
      s.enemy.hp = 9999; s.enemy.stun = 5;                           // de vijand kan niks terugdoen
      s.runTurn(window.MOVES.hammerTwirl);
    });`);
    await expect.poll(async () => (await battle(page)).menu, { timeout: 20_000 }).not.toBe('command');
    await waitForMenu(page, 'command');
    const amy = await page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); return { hp: b.player.hp, max: b.player.maxHp }; });
    expect(amy.hp).toBe(10 + Math.ceil(amy.max * 0.25));
    expect(errors).toEqual([]);
  });

  test('Amy at ATK +6: Lucky Swing can swing the same attack again, and each crit costs HP', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    await setup(page, `s.switchTo(s.party[2]).then(() => {
      s.player.hp = s.player.maxHp; s.player.stages.atk = 6;
      s.enemy.hp = 9999; s.enemy.stun = 5;
      s.extraRoll = () => 0;                                    // de extra klap komt altijd
      window.__swings = [];
      const orig = s.doAttack.bind(s);
      s.doAttack = (a, t, m, al, again) => { window.__swings.push([m.id, again]); return orig(a, t, m, al, again); };
      s.runTurn({ ...window.MOVES.spinAttack, accuracy: 1000 });
    });`);
    await expect.poll(async () => (await battle(page)).menu, { timeout: 20_000 }).not.toBe('command');
    await waitForMenu(page, 'command');
    const r = await page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); return { swings: (window as any).__swings, hp: b.player.hp, max: b.player.maxHp }; });
    expect(r.swings.map(([m, again]) => [m, again ?? false])).toEqual([['spinAttack', false], ['spinAttack', 'lucky']]);
    expect(r.hp).toBe(r.max - 2 * Math.ceil(r.max * 0.05));   // twee crits, twee keer 5%
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').pBox.speedTag.text)).toBe('CRIT 2x +30%');
    expect(errors).toEqual([]);
  });

  test('rewards: tiered monitors, a Chaos Drive asks who gets the level', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    await setup(page, 's.enemy.hp = 1;');
    await press(page, 'z', 'ArrowRight', 'z');
    await waitForMenu(page, 'reward');
    const tiers = await page.evaluate(() => (window as any).game.scene.getScene('Battle').rewardChoices.map((r: { tier: string }) => r.tier));
    expect(tiers).toHaveLength(3);
    await setup(page, "s.rewardChoices[s.cursor] = window.REWARDS.find(r => r.id === 'chaosDrive');");
    await press(page, 'z');
    await waitForMenu(page, 'choice');            // "Chaos Drive: for who?"
    await press(page, 'ArrowDown', 'z');          // Tails
    await waitForMenu(page, 'choice');            // then the switch question of wave 2
    const lv = await page.evaluate(() => (window as any).game.scene.getScene('Battle').party.map((f: { level: number }) => f.level));
    expect(lv).toEqual([5, 6, 5]);
    expect(errors).toEqual([]);
  });

  test('Shield halves the next hit, Invincibility makes the first attack miss', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    const hp = () => page.evaluate(() => (window as any).game.scene.getScene('Battle').player.hp);
    // Invincibility: de vijand slaat eerst en mist
    await setup(page, 's.dodgeFirst = true; s.enemy.hp = 9999; s.pickEnemyMove = () => ({ ...window.MOVES.bodyCheck, accuracy: 1000, priority: 9 }); s.runTurn({ ...window.MOVES.spinAttack, accuracy: 0 });');
    const before = await hp();
    await waitForMenu(page, 'command');
    expect(await hp()).toBe(before);
    // Shield: de volgende klap is half zo hard, daarna is het schild weg
    await setup(page, 's.buffs.shieldHit = true; s.runTurn({ ...window.MOVES.spinAttack, accuracy: 0 });');
    await waitForMenu(page, 'command');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').buffs.shieldHit)).toBe(false);
  });

  test('items are free but only 1 per fight; heals ask who', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.party[0].hp = 5; s.party[1].hp = 5; s.bag.healthRing = 2; s.enemy.hp = 9999;');
    const st = () => page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); return { hp: b.party.map((f: { hp: number }) => f.hp), bag: b.bag.healthRing, used: b.itemsUsed }; });
    await press(page, 'ArrowDown', 'z');        // Items
    await waitForMenu(page, 'bag');
    await press(page, 'z');                     // Health Ring
    await waitForMenu(page, 'choice');          // heal who? (two hurt teammates)
    await press(page, 'ArrowDown', 'z');        // Tails
    await waitForMenu(page, 'command');         // no enemy turn in between
    let s = await st();
    expect(s.hp[0]).toBe(5);
    expect(s.hp[1]).toBeGreaterThan(5);
    expect([s.bag, s.used]).toEqual([1, 1]);
    await press(page, 'ArrowDown', 'z');        // a second item: not allowed
    await waitForMenu(page, 'bag');
    await press(page, 'z');
    await waitForMenu(page, 'bag');
    s = await st();
    expect([s.bag, s.used]).toEqual([1, 1]);
  });

  test('Eggman Alarm: the next foe is an elite and shows the ELITE label', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.enemy.hp = 1;');
    await press(page, 'z', 'ArrowRight', 'z');
    await waitForMenu(page, 'reward');
    await setup(page, "s.rewardChoices[s.cursor] = window.REWARDS.find(r => r.id === 'alarm');");
    await press(page, 'z');
    await waitForMenu(page, 'choice');          // switch question of wave 2
    const b = await page.evaluate(() => { const s = (window as any).game.scene.getScene('Battle'); return { elite: s.elite, rank: s.enemyRank(), lv: s.enemy.level }; });
    expect(b).toEqual({ elite: true, rank: 'ELITE', lv: 6 });
  });

  test('a lost run deletes the save', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.party.forEach(f => { f.hp = 0; }); s.loseRun();');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sonicrogue_run'))).toBeNull();
  });

  test('help and settings open and close again', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await press(page, 'h');
    await expect.poll(() => activeScenes(page)).toContain('Help');
    await press(page, 'ArrowRight', 'ArrowRight', 'x');
    await expect.poll(() => activeScenes(page)).not.toContain('Help');
    await press(page, 'm');                     // pause menu > Settings
    await expect.poll(() => activeScenes(page)).toContain('Pause');
    await press(page, 'ArrowDown', 'z');
    await expect.poll(() => activeScenes(page)).toContain('Settings');
    expect(await page.evaluate(() => window.game.scene.isVisible('Pause'))).toBe(false); // regression: pause menu drew over Settings
    await press(page, 'x');
    await expect.poll(() => page.evaluate(() => window.game.scene.isVisible('Pause'))).toBe(true);
    await expect.poll(() => activeScenes(page)).not.toContain('Settings');
    await press(page, 'x');
    await expect.poll(() => activeScenes(page)).not.toContain('Pause');
    await waitForMenu(page, 'command');
  });

  test('How to Play on the title screen: topics, pages, and back to the menu', async ({ page }) => {
    await openGame(page);
    await press(page, 'z');
    await page.waitForTimeout(400);
    await press(page, 'z', 'z');                // skip intro, press start
    await press(page, 'ArrowDown', 'z');        // How to Play
    await expect.poll(() => activeScenes(page)).toContain('Help');
    const help = () => page.evaluate(() => { const h = (window as any).game.scene.getScene('Help'); return { cat: h.cat, page: h.page, entries: h.entries }; });
    expect((await help()).entries[0]).toBe('TUTORIAL');
    await press(page, 'ArrowDown', 'ArrowDown', 'ArrowRight'); // BATTLE, page 2
    expect(await help()).toMatchObject({ cat: 2, page: 1 });
    await press(page, 'x');
    await expect.poll(() => activeScenes(page)).not.toContain('Help');
    expect(await activeScenes(page)).toContain('Title');
  });

  test('tutorial with Tails: guided fight from How to Play, nothing saved', async ({ page }) => {
    await openGame(page);
    await press(page, 'z');
    await page.waitForTimeout(400);
    await press(page, 'z', 'z', 'ArrowDown', 'z');
    await expect.poll(() => activeScenes(page)).toContain('Help');
    await press(page, 'z');                     // TUTORIAL is selected: start
    await expect.poll(() => activeScenes(page)).toContain('Battle');
    // geen toeval in de begeleide fight (een extra Homing-klap kan de vijand te vroeg verslaan)
    await page.evaluate(() => { const s = (window as any).game.scene.getScene('Battle'); s.extraRoll = () => 1; s.dodgeRoll = () => 1; });
    const tut = () => page.evaluate(() => { const s = (window as any).game.scene.getScene('Battle'); return { step: s.tut?.index, shown: s.tut?.shown, talking: s.tut?.talking, menu: s.menu, active: s.player?.def.id }; });
    const atStep = async (step: number) => expect.poll(async () => { const t = await tut(); return t.shown ? t.step : -1; }, { timeout: 30_000 }).toBe(step);
    await atStep(0);
    await press(page, 'z', 'z', 'z');          // intro, HP/Boost, the foe
    await atStep(3);
    await press(page, 'ArrowRight', 'z');      // Party is not allowed yet
    expect((await tut()).menu).toBe('command');
    await press(page, 'ArrowLeft', 'z', 'z');  // Fight > Spin Attack
    await atStep(4);
    await press(page, 'z');
    await atStep(5);
    await press(page, 'z', 'ArrowRight', 'z'); // Fight > Homing Attack
    await atStep(6);
    await press(page, 'z');
    await atStep(7);
    await press(page, 'ArrowDown', 'z', 'z');  // Items > the heart
    await atStep(8);
    await press(page, 'ArrowUp', 'ArrowRight', 'z', 'z'); // Party > Tails
    await atStep(9);
    expect((await tut()).active).toBe('tails');
    await press(page, 'z');
    await atStep(10);
    await press(page, 'ArrowLeft', 'z', 'z');  // finish it
    await atStep(11);
    expect((await tut()).menu).toBe('reward');
    await press(page, 'z', 'z', 'z');          // rewards, shop, team
    await atStep(14);
    await press(page, 'z');                    // pick a reward
    await waitForMenu(page, 'choice');         // Start a run / Back to title
    await press(page, 'ArrowDown', 'z');
    await expect.poll(() => activeScenes(page)).toContain('Title');
    expect(await page.evaluate(() => localStorage.getItem('sonic-rogue-run'))).toBeNull();
  });

  test("Tails' tips: shown the first time, then remembered", async ({ page }) => {
    await openGame(page);
    // openGame zet de tips uit; dit init-script komt daarna en zet ze weer aan
    await page.addInitScript(() => {
      localStorage.setItem('sonic-rogue-settings', JSON.stringify({ textSpeed: 3, battleSpeed: 2, musicVolume: 0, sfxVolume: 0, battleStyle: 0, tips: 0 }));
    });
    await page.reload();
    await expect.poll(() => activeScenes(page)).toContain('Title');
    await startRun(page);
    await setup(page, 's.enemy.hp = 1;');
    await press(page, 'z', 'ArrowRight', 'z');  // Homing Attack wins
    await waitForMenu(page, 'reward');
    const tipOpen = () => page.evaluate(() => !!(window as any).game.scene.getScene('Battle').tipBox);
    await expect.poll(tipOpen).toBe(true);     // first reward screen: the shop tip
    await press(page, 'z');
    await expect.poll(tipOpen).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('sonicrogue_tips_seen'))).toContain('shop');
  });

  test('Shadow: Chaos Spear pierces, Chaos Control raises ATK/SPD, a KO makes it free and gives 1 Boost', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startBattleWith(page, ['shadow', 'tails']);
    const shadow = () => page.evaluate(() => {
      const s = (window as any).game.scene.getScene('Battle');
      const f = s.player;
      return { pierced: s.enemy.pierced, chaosFree: f.chaosFree, atk: f.stages.atk, spd: f.stages.spd, boost: f.boost, canChaos: f.canUse((window as any).MOVES.chaosControl) };
    });
    // Chaos Spear (kost 2): doet schade en de vijand is 3 beurten pierced
    await setup(page, 's.enemy.hp = 9999; s.player.boost = 6;');
    await press(page, 'z', 'ArrowRight', 'z');
    await waitForMenu(page, 'command');
    const marked = await shadow();
    expect(marked.pierced).toBe(3);
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').enemy.hp)).toBeLessThan(9999);
    // Chaos Control maakt de KO: ATK en SPD +1, daarna is hij gratis, en Ultimate Lifeform geeft 1 Boost (6 - 4 + 1 = 3)
    await setup(page, 's.enemy.hp = 1; s.player.boost = 6;');
    await press(page, 'z', 'ArrowLeft', 'ArrowDown', 'z');   // de cursor stond nog op Chaos Spear
    await waitForMenu(page, 'reward');
    const after = await shadow();
    expect(after.chaosFree).toBe(true);
    expect([after.atk, after.spd]).toEqual([1, 1]);
    expect(after.boost).toBe(3);
    await setup(page, 's.player.boost = 0;');
    expect((await shadow()).canChaos).toBe(true);
    expect(errors).toEqual([]);
  });

  test('Shadow: Super Barrage resets after a KO at most 2 times, then costs 6 Boost again', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startBattleWith(page, ['shadow', 'tails']);
    await setup(page, 's.player.level = 30; s.player.boost = 6;');
    const free: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      await setup(page, 's.enemy.hp = 1; s.runTurn(window.MOVES.superBarrage);');
      await waitForMenu(page, 'reward');
      free.push(await page.evaluate(() => (window as any).game.scene.getScene('Battle').player.ultFree));
      await fixReward(page);
      await press(page, 'z');                   // reward
      await waitForMenu(page, 'choice');
      await press(page, 'ArrowDown', 'z');      // niet wisselen
      await waitForMenu(page, 'command');
      await setup(page, 's.player.boost = 0;');  // alleen gratis kan hij hem nog gebruiken
    }
    expect(free).toEqual([true, true, false]);
    expect(await page.evaluate(() => {
      const s = (window as any).game.scene.getScene('Battle');
      return s.player.canUse((window as any).MOVES.superBarrage);
    })).toBe(false);
    expect(errors).toEqual([]);
  });

  test('wave 20 is Dr. Eggman (Shadow only rarely): a main boss with 5 shields, one hit breaks one shield', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    // Eggman in plaats van de zeldzame Shadow (wave 20 heeft nooit een rival)
    await setup(page, 's.wave = 19; s.enemy.hp = 1; s.mainBossRoll = () => 0.5;');
    await press(page, 'z', 'ArrowRight', 'z');  // Homing Attack
    await waitForMenu(page, 'reward');
    await fixReward(page);
    await press(page, 'z');
    await waitForMenu(page, 'choice');
    await press(page, 'ArrowDown', 'z');
    await waitForMenu(page, 'command');
    const boss = await page.evaluate(() => {
      const s = (window as any).game.scene.getScene('Battle');
      return { id: s.enemy.def.id, segments: s.enemy.segments, max: s.enemy.maxHp, type: s.enemy.type };
    });
    expect(boss).toMatchObject({ id: 'eggman', segments: 5 });
    expect(['speed', 'fly', 'power']).toContain(boss.type);   // Eggman krijgt een random type
    // een veel te sterke klap: stopt op de eerste grens (of een paar verder), maar nooit KO
    // (zonder de 50% extra Homing Attack, anders zijn het twee klappen)
    await setup(page, 's.player.level = 45; s.player.stages.atk = 2; s.extraRoll = () => 1; s.pickEnemyMove = () => window.MOVES.eggLaugh;');
    await press(page, 'z', 'z');                 // Fight > de move onder de cursor
    await waitForMenu(page, 'command');
    const hp = await page.evaluate(() => (window as any).game.scene.getScene('Battle').enemy.hp);
    expect(hp).toBeGreaterThan(0);
    const size = boss.max / 5;
    expect(Math.abs(hp / size - Math.round(hp / size))).toBeLessThan(0.05);   // precies op een grens
    expect(errors).toEqual([]);
  });

  test('you can toss an item from the bag on the reward screen', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, "s.enemy.hp = 1; s.bag = { healthRing: 1 };");
    await press(page, 'z', 'ArrowRight', 'z');
    await waitForMenu(page, 'reward');
    await press(page, 'c');                       // toss
    await waitForMenu(page, 'choice');
    await press(page, 'z');                       // Health Ring
    await waitForMenu(page, 'reward');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').bag)).toEqual({});
  });

  test('Shadow: the Super power lasts 3 turns, counted from the ultimate', async ({ page }) => {
    test.setTimeout(120_000);
    await openGame(page);
    await startBattleWith(page, ['shadow', 'tails']);
    const superTurns = () => page.evaluate(() => (window as any).game.scene.getScene('Battle').player.superTurns);
    await setup(page, 's.player.level = 30; s.player.boost = 6; s.player.hp = 9999; s.enemy.hp = 99999; s.runTurn(window.MOVES.superBarrage);');
    await expect.poll(async () => (await battle(page)).menu).not.toBe('command');
    await waitForMenu(page, 'command');
    expect(await superTurns()).toBe(2);
    for (const left of [1, 0]) {
      await setup(page, 's.runTurn(window.MOVES.spinAttack);');
      await expect.poll(async () => (await battle(page)).menu).not.toBe('command');
      await waitForMenu(page, 'command');
      expect(await superTurns()).toBe(left);
    }
  });

  test('Cream: Chao Attack lowers the foe ATK; Chao Blessing revives and powers up the team for 5 turns', async ({ page }) => {
    await openGame(page);
    await startBattleWith(page, ['cream', 'sonic', 'tails']);
    await setup(page, 's.enemy.hp = 9999; s.player.boost = 6; s.runTurn(window.MOVES.cheeseAttack);');
    await expect.poll(async () => (await battle(page)).menu).not.toBe('command');
    await waitForMenu(page, 'command');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').enemy.stages.atk)).toBe(-1);
    // Sonic is gevallen: de ultimate zet hem weer op 50% HP en geeft het team 5 beurten extra schade
    await setup(page, 's.party[1].hp = 0; s.player.boost = 6; s.player.evade = 5; s.runTurn(window.MOVES.chaoAttack);');
    await expect.poll(async () => (await battle(page)).menu).not.toBe('command');
    await waitForMenu(page, 'command');
    const after = await page.evaluate(() => { const s = (window as any).game.scene.getScene('Battle'); return { hp: s.party[1].hp, max: s.party[1].maxHp, bless: s.buffs.blessTurns }; });
    expect(after.hp).toBe(Math.ceil(after.max * 0.5));
    expect(after.bless).toBe(5);
    // elke beurt van je team telt er één af
    await setup(page, 's.player.evade = 5; s.runTurn(window.MOVES.spinAttack);');
    await expect.poll(async () => (await battle(page)).menu).not.toBe('command');
    await waitForMenu(page, 'command');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').buffs.blessTurns)).toBe(4);
  });

  test('hitting the foe does not give your character Boost (only getting hit does)', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    // de vijand mist gegarandeerd (evade), dus alleen de kosten van Homing Attack tellen
    await setup(page, 's.player.boost = 3; s.player.evade = 5; s.enemy.hp = 9999; s.runTurn(window.MOVES.homingAttack);');
    await expect.poll(async () => (await battle(page)).menu).not.toBe('command');
    await waitForMenu(page, 'command');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').player.boost)).toBe(2);
  });

  test('Chao Care also works from the bench, but weaker (5%)', async ({ page }) => {
    await openGame(page);
    await startBattleWith(page, ['sonic', 'cream']);
    await setup(page, 's.enemy.hp = 1; s.runTurn(window.MOVES.homingAttack);');
    await waitForMenu(page, 'reward');
    await fixReward(page);
    await press(page, 'z');
    await waitForMenu(page, 'choice');          // "Will you switch characters?"
    await setup(page, 's.party[0].hp = 10; s.party[1].hp = 10;');
    await press(page, 'ArrowDown', 'z');        // No: Sonic blijft, Cream zit op de bank
    await waitForMenu(page, 'command');
    const team = await page.evaluate(() => (window as any).game.scene.getScene('Battle').party.map((f: any) => ({ hp: f.hp, max: f.maxHp })));
    for (const f of team) expect(f.hp).toBe(10 + Math.ceil(f.max * 0.05));
  });

  test('everyone who fought in a wave gets the full EXP', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await press(page, 'ArrowRight', 'z');       // Party
    await waitForMenu(page, 'choice');
    await press(page, 'z');                     // Tails in, Sonic heeft al meegevochten
    await waitForMenu(page, 'command');
    const before = await page.evaluate(() => (window as any).game.scene.getScene('Battle').party.map((f: any) => f.level * 1000 + f.exp));
    await setup(page, 's.enemy.hp = 1; s.runTurn(window.MOVES.copterDive);');   // Tails: raakt altijd, gaat eerst
    await waitForMenu(page, 'reward');
    const after = await page.evaluate(() => (window as any).game.scene.getScene('Battle').party.map((f: any) => f.level * 1000 + f.exp));
    expect(after[0]).toBeGreaterThan(before[0]);   // Sonic (meegevochten)
    expect(after[1]).toBeGreaterThan(before[1]);   // Tails (in het veld)
    expect(after[2]).toBe(before[2]);              // Amy (bank, nog geen Exp. Share op wave 1)
  });
  // ------------------------------------------------------------- enemy-variatie
  /** Nieuwe wave tegen deze vijand (testmodus-haakje), en wachten tot je aan de beurt bent. */
  async function meet(page: Page, foe: string, extra = '') {
    await setup(page, `delete s.pickEnemyMove; s.forceFoe = '${foe}'; ${extra} s.wave = 12; s.menu = 'busy'; s.startWave();`);
    await waitForMenu(page, 'command');
  }
  async function turn(page: Page, js: string) {
    await setup(page, js);
    await expect.poll(async () => (await battle(page)).menu).not.toBe('command');
    await waitForMenu(page, 'command');
  }
  const foeState = (page: Page) => page.evaluate(() => {
    const b = (window as any).game.scene.getScene('Battle');
    return {
      foe: b.enemy.def.id, charged: b.enemy.charged, shell: b.enemy.shell, segments: b.enemy.segments, foeHp: b.enemy.hp,
      hp: b.player.hp, max: b.player.maxHp, boost: b.player.boost, poison: b.player.poison, frozen: b.player.frozen, stun: b.player.stun,
      badge: b.enemyBadge().text,
    };
  });
  const HIT = "{ ...window.MOVES.spinAttack, accuracy: 1000 }";

  test('badniks: Copter Octo charges up, Buzz Cannon poisons, Spike Mine pricks back', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startBattleWith(page, ['tails']);
    // Copter Octo: laadt op beurt 2 op ("!" erboven), de klap erna is dubbel en de lading is op
    await meet(page, 'octo');
    expect((await foeState(page)).badge).toBe('CHARGE');
    await turn(page, `s.enemy.hp = 9999; s.player.hp = 9999; s.enemy.foeTurns = 1; s.runTurn(${HIT});`);
    expect((await foeState(page)).charged).toBe(true);
    await turn(page, `s.pickEnemyMove = () => ({ ...window.MOVES.bodyCheck, accuracy: 1000 }); s.runTurn(${HIT});`);
    expect((await foeState(page)).charged).toBe(false);
    // Buzz Cannon: gif, 1/16 HP aan het eind van elke beurt
    await meet(page, 'bee');
    expect((await foeState(page)).badge).toBe('POISON');
    await turn(page, `s.enemy.hp = 9999; s.player.hp = 9999; s.pickEnemyMove = () => ({ ...window.MOVES.stingShot, accuracy: 1000 }); s.runTurn(${HIT});`);
    expect((await foeState(page)).poison).toBe(2);
    const before = await foeState(page);
    await turn(page, `s.pickEnemyMove = () => ({ ...window.MOVES.bodyCheck, accuracy: 0 }); s.runTurn(${HIT});`);
    const after = await foeState(page);
    expect(before.hp - after.hp).toBe(Math.max(1, Math.floor(after.max / 16)));
    expect(after.poison).toBe(1);
    // Spike Mine: wie hem raakt krijgt 1/8 van de schade terug
    await meet(page, 'mine');
    await turn(page, `s.enemy.hp = 9999; s.player.hp = 500; s.pickEnemyMove = () => ({ ...window.MOVES.spikeBurst, accuracy: 0 }); s.runTurn(${HIT});`);
    const m = await foeState(page);
    expect(500 - m.hp).toBe(Math.max(1, Math.floor((9999 - m.foeHp) / 8)));
    // gif en stat-verlagingen duren maar één gevecht
    await meet(page, 'frog');
    expect((await foeState(page)).poison).toBe(0);
    expect(errors).toEqual([]);
  });

  test('Homing Attack: 50% chance to home in again, without extra SPD', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startBattleWith(page, ['sonic']);
    await meet(page, 'frog');
    const COUNT = "s.__hits = 0; if (!s.__orig) { s.__orig = s.doAttack.bind(s); s.doAttack = (...a) => { if (a[0] === s.player) s.__hits++; return s.__orig(...a); }; }";
    const hits = () => page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); return { hits: b.__hits, spd: b.player.stages.spd }; });
    const HOMING = "{ ...window.MOVES.homingAttack, accuracy: 1000 }";
    const QUIET = "s.enemy.hp = 9999; s.player.hp = 9999; s.player.boost = 6; s.dodgeRoll = () => 1; s.pickEnemyMove = () => ({ ...window.MOVES.tongueLash, accuracy: 0 });";
    await turn(page, `${COUNT} ${QUIET} s.extraRoll = () => 0; s.runTurn(${HOMING});`);
    expect(await hits()).toEqual({ hits: 2, spd: 1 });
    await turn(page, `${COUNT} ${QUIET} s.extraRoll = () => 0.99; s.runTurn(${HOMING});`);
    expect(await hits()).toEqual({ hits: 1, spd: 2 });
    expect(errors).toEqual([]);
  });

  test('Sonic Speed dodge: DODGE! animation, no damage, Sonic lands back on his spot', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startBattleWith(page, ['sonic']);
    await meet(page, 'frog');
    const before = await page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); return { x: b.hero.x, y: b.hero.y }; });
    await turn(page, "s.enemy.hp = 9999; s.player.hp = 9999; s.dodgeRoll = () => 0; s.pickEnemyMove = () => ({ ...window.MOVES.bodyCheck, accuracy: 1000, priority: 5 }); s.runTurn({ ...window.MOVES.spinAttack, accuracy: 0 });");
    const after = await page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); return { x: b.hero.x, y: b.hero.y, hp: b.player.hp }; });
    expect(after).toEqual({ ...before, hp: 9999 });
    expect(errors).toEqual([]);
  });

  test('rivals: 2 shields, Tails ambushes you, Cream revives once and lowers your ATK', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startBattleWith(page, ['sonic']);
    const rival = async (id: string) => {
      await setup(page, `delete s.pickEnemyMove; s.forceRival = true; s.pickRival = () => '${id}'; s.wave = 15; s.menu = 'busy'; s.startWave();`);
      await waitForMenu(page, 'command');
    };
    const st = () => page.evaluate(() => {
      const b = (window as any).game.scene.getScene('Battle');
      return { foe: b.enemy.def.id, segments: b.enemy.segments, trait: b.enemy.rivalTrait, badge: b.enemyBadge().text, foeHp: b.enemy.hp, foeMax: b.enemy.maxHp,
        stun: b.player.stun, atk: b.player.stages.atk };
    });
    await rival('tails');
    expect(await st()).toMatchObject({ foe: 'tails', segments: 2, trait: 'ambush', badge: 'RIVAL', stun: 1 });
    await rival('cream');
    expect(await st()).toMatchObject({ foe: 'cream', trait: 'chaoRevival' });
    await turn(page, "s.enemy.hp = 1; s.player.hp = 9999; s.dodgeRoll = () => 1; s.pickEnemyMove = () => ({ ...window.MOVES.spinAttack, accuracy: 0 }); s.runTurn({ ...window.MOVES.spinAttack, accuracy: 1000, priority: 5 });");
    const after = await st();
    expect(after.foeHp).toBe(Math.ceil(after.foeMax / 2));
    expect(after.atk).toBe(-2);
    expect(errors).toEqual([]);
  });

  test('rival talk: a short chat with portraits before the fight and after the win', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startBattleWith(page, ['sonic']);
    await page.evaluate(() => { (window as any).settings.talk = 0; });   // gesprekjes aan (de andere tests zetten ze uit)
    const talking = () => page.evaluate(() => !!(window as any).game.scene.getScene('Battle').talkBox);
    await page.evaluate(() => { const s = (window as any).game.scene.getScene('Battle'); s.forceRival = true; s.pickRival = () => 'knuckles'; s.wave = 15; s.menu = 'busy'; s.startWave(); });
    await expect.poll(talking, { timeout: 20_000 }).toBe(true);
    // regels afmaken / volgende, tot het gesprek klaar is (hoeveel keer hangt af van het gesprek en de snelheid)
    for (let i = 0; i < 20 && await talking(); i++) await press(page, 'z');
    await waitForMenu(page, 'command');
    expect(await talking()).toBe(false);
    // winnen: Knuckles praat nog even (X slaat het over)
    await setup(page, 's.enemy.hp = 1; s.enemy.rivalUsed = true; s.dodgeRoll = () => 1;');
    await press(page, 'z', 'ArrowRight', 'z');   // Homing Attack
    await expect.poll(talking, { timeout: 20_000 }).toBe(true);
    await press(page, 'x');
    await expect.poll(talking).toBe(false);
    expect(errors).toEqual([]);
  });

  test('badniks: elites, Shark Jet, Snow Bot and Shell Tank', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await openGame(page);
    await startBattleWith(page, ['tails']);
    // elite met een random eigenschap op het label
    await meet(page, 'pig', "s.forceElite = 'armored';");
    expect(await foeState(page)).toMatchObject({ badge: 'ARMORED ELITE', segments: 2 });
    // Shark Jet: geen Boost voor de klap en hij steelt er een (Spin Attack +1, dus netto gelijk)
    await meet(page, 'sharkjet');
    await turn(page, `s.enemy.hp = 9999; s.player.hp = 9999; s.player.boost = 3; s.pickEnemyMove = () => ({ ...window.MOVES.sharkRam, accuracy: 1000 }); s.runTurn(${HIT});`);
    expect((await foeState(page)).boost).toBe(3);
    // Snow Bot: bevriest je (jij ging eerst, dus je mist de volgende beurt)
    await meet(page, 'snowman');
    await turn(page, `s.enemy.hp = 9999; s.player.hp = 9999; s.effectRoll = () => 0; s.pickEnemyMove = () => ({ ...window.MOVES.snowball, accuracy: 1000 }); s.runTurn({ ...window.MOVES.spinAttack, accuracy: 1000, priority: 5 });`);
    expect(await foeState(page)).toMatchObject({ frozen: true, stun: 1 });
    await turn(page, `s.pickEnemyMove = () => ({ ...window.MOVES.snowball, accuracy: 0 }); s.runTurn(${HIT});`);
    expect(await foeState(page)).toMatchObject({ frozen: false, stun: 0 });
    // Shell Tank: een schild breekt -> schelp + opgeladen Tank Slam (pas de beurt erna)
    await meet(page, 'turtle');
    await turn(page, `s.enemy.segments = 4; s.enemy.hp = s.enemy.maxHp; s.player.hp = 9999; s.pickEnemyMove = () => ({ ...window.MOVES.shellCannon, accuracy: 0 }); s.runTurn({ ...window.MOVES.spinAttack, accuracy: 1000, power: 900, priority: 5 });`);
    expect(await foeState(page)).toMatchObject({ shell: true, charged: true });
    expect(await page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); delete b.pickEnemyMove; return b.pickEnemyMove().id; })).toBe('tankSlam');
    expect(errors).toEqual([]);
  });
});
