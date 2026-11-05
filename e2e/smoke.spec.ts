import { expect, test } from '@playwright/test';
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
    await setup(page, 's.enemy.hp = 9999;');   // Sonic is fast enough to one-shot a wave-1 foe now
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
    await setup(page, 's.player.hp = 1; s.enemy.hp = 9999; s.pickEnemyMove = () => ({ ...window.MOVES.bodyCheck, accuracy: 1000 }); s.runTurn({ ...s.player.moves.map((m) => window.MOVES[m])[0], accuracy: 0, priority: -9 });');
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

  test('Glove Punch stuns the foe for 2 turns, every time', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    const stun = () => page.evaluate(() => (window as any).game.scene.getScene('Battle').enemy.stun);
    for (let i = 0; i < 2; i++) {
      // Glove Punch eerst: 2 beurten verdoofd, de vijand slaat er meteen één over
      await setup(page, 's.enemy.stun = 0; s.player.boost = 6; s.enemy.hp = 9999; s.runTurn({ ...window.MOVES.glovePunch, priority: 9 });');
      await waitForMenu(page, 'command');
      expect(await stun()).toBe(1);
    }
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
    await setup(page, 's.party[2].hp = 1; s.enemy.hp = 9999; s.player.boost = 6; s.runTurn(window.MOVES.chaoCheer, s.party[2]);');
    await waitForMenu(page, 'command');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').party[2].hp)).toBeGreaterThan(1);
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
      s.player.hp = 10; s.player.boost = 6; s.player.stages.atk = 6; // 100% crit
      s.enemy.hp = 9999; s.enemy.stun = 5;                           // de vijand kan niks terugdoen
      s.runTurn(window.MOVES.hammerTwirl);
    });`);
    await expect.poll(async () => (await battle(page)).menu, { timeout: 20_000 }).not.toBe('command');
    await waitForMenu(page, 'command');
    const amy = await page.evaluate(() => { const b = (window as any).game.scene.getScene('Battle'); return { hp: b.player.hp, max: b.player.maxHp }; });
    expect(amy.hp).toBe(10 + Math.ceil(amy.max * 0.25));
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

  test('Shadow: Chaos Spear pierces, a KO makes Chaos Control free and sets off Rampage', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startBattleWith(page, ['shadow', 'tails']);
    const shadow = () => page.evaluate(() => {
      const s = (window as any).game.scene.getScene('Battle');
      const f = s.player;
      return { pierced: s.enemy.pierced, chaosFree: f.chaosFree, atk: f.stages.atk, spd: f.stages.spd, boost: f.boost, canChaos: f.canUse((window as any).MOVES.chaosControl) };
    });
    // Chaos Spear (kost 3): de vijand is 3 beurten pierced
    await setup(page, 's.enemy.hp = 9999; s.player.boost = 6;');
    await press(page, 'z', 'ArrowRight', 'z');
    await waitForMenu(page, 'command');
    const marked = await shadow();
    expect(marked.pierced).toBe(3);
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').enemy.hp)).toBe(9999);  // status-move: geen schade
    // Chaos Control maakt de KO: daarna is hij gratis, en Rampage geeft ATK en SPD +1 (50% kans: hier vast gezet)
    await setup(page, 's.enemy.hp = 1; s.player.boost = 6; s.rampageRoll = () => 0;');
    await press(page, 'z', 'ArrowLeft', 'ArrowDown', 'z');   // de cursor stond nog op Chaos Spear
    await waitForMenu(page, 'reward');
    const after = await shadow();
    expect(after.chaosFree).toBe(true);
    expect([after.atk, after.spd]).toEqual([1, 1]);
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
      return { id: s.enemy.def.id, segments: s.enemy.segments, max: s.enemy.maxHp };
    });
    expect(boss).toMatchObject({ id: 'eggman', segments: 5 });
    // een veel te sterke klap: stopt op de eerste grens (of een paar verder), maar nooit KO
    await setup(page, 's.player.level = 45; s.player.stages.atk = 2; s.pickEnemyMove = () => window.MOVES.eggLaugh;');
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
});
