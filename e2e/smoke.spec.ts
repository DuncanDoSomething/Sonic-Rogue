import { expect, test } from '@playwright/test';
import { activeScenes, battle, openGame, press, setup, startRun, toCharacterSelect, trackErrors, waitForMenu } from './helpers';

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
    await setup(page, 's.player.hp = 1; s.enemy.hp = 9999; s.runTurn({ ...s.player.moves.map((m) => window.MOVES[m])[0], accuracy: 0, priority: -9 });');
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

  test('auto-save: after a reload you can continue from the same wave with the same team', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await setup(page, 's.enemy.hp = 1;');
    await press(page, 'z', 'ArrowRight', 'z');  // win wave 1
    await waitForMenu(page, 'reward');
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

  test('Glove Punch stuns the foe, but only once per fight', async ({ page }) => {
    const errors = trackErrors(page);
    await openGame(page);
    await startRun(page);
    await setup(page, 's.player.boost = 6; s.enemy.hp = 9999; s.runTurn({ ...window.MOVES.glovePunch, priority: 9 });');
    await waitForMenu(page, 'command');
    const used = () => page.evaluate(() => (window as any).game.scene.getScene('Battle').stunUsed.has('p:glovePunch'));
    expect(await used()).toBe(true);
    await setup(page, 's.enemy.stun = 0; s.player.boost = 6; s.runTurn({ ...window.MOVES.glovePunch, priority: 9 });');
    await waitForMenu(page, 'command');
    expect(await page.evaluate(() => (window as any).game.scene.getScene('Battle').enemy.stun)).toBe(0);
    expect(errors).toEqual([]);
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
    for (const id of ['sonic', 'tails', 'knuckles', 'amy', 'cream']) {
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
});
