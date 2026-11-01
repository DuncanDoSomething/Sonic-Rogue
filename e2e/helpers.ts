import { expect, type Page } from '@playwright/test';

/**
 * Sonic Rogue renders everything on a canvas, so there are no DOM elements to click.
 * The tests drive the game with the keyboard (like a player) and read the game state
 * through `window.game`, which main.ts exposes. No pixel or screenshot comparisons,
 * so the tests survive UI changes.
 */

export interface BattleState {
  menu: string;
  wave: number;
  active: string;
  party: string[];
  playerHp: number;
  boost: number;
  enemyHp: number;
  enemyMaxHp: number;
  cursorMove: string;
}

/** Collects page errors and failed same-origin requests, so a test can assert that there were none. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', r => {
    // external fonts may be blocked on some networks; the game falls back to a monospace font
    if (r.url().startsWith('http://localhost')) errors.push(`requestfailed: ${r.url()}`);
  });
  return errors;
}

/** Fast text and battle speed, so the tests don't wait on animations. */
export async function openGame(page: Page, path = '/') {
  await page.addInitScript(() => {
    localStorage.setItem('sonic-rogue-settings', JSON.stringify({ textSpeed: 3, battleSpeed: 2, musicVolume: 0, sfxVolume: 0, battleStyle: 0 }));
  });
  await page.goto(path);
  await expect.poll(() => activeScenes(page)).toContain('Title');
}

export function activeScenes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { game?: { scene: { getScenes(active: boolean): Array<{ scene: { key: string } }> } } }).game;
    return g ? g.scene.getScenes(true).map(s => s.scene.key) : [];
  });
}

export function battle(page: Page): Promise<BattleState> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).game.scene.getScene('Battle');
    return {
      menu: s.menu,
      wave: s.wave,
      active: s.player?.def.id,
      party: (s.party ?? []).map((f: { def: { id: string } }) => f.def.id),
      playerHp: s.player?.hp,
      boost: s.player?.boost,
      enemyHp: s.enemy?.hp,
      enemyMaxHp: s.enemy?.maxHp,
      cursorMove: s.player?.moves[s.cursor],
    };
  });
}

export async function press(page: Page, ...keys: string[]) {
  for (const k of keys) {
    await page.keyboard.press(k);
    await page.waitForTimeout(120);
  }
}

/** Waits until the battle menu is in the given state (e.g. 'command' = your turn). */
export async function waitForMenu(page: Page, menu: string) {
  await expect.poll(async () => (await battle(page)).menu, { timeout: 30_000 }).toBe(menu);
}

/** From a fresh page: boot screen, skip the intro, title menu, Game Start. */
export async function toCharacterSelect(page: Page) {
  await press(page, 'z');                       // "press any button" (unlocks audio)
  await page.waitForTimeout(400);
  await press(page, 'z');                       // skip the intro
  await press(page, 'z');                       // press start -> menu
  await press(page, 'z');                       // Game Start
  await expect.poll(() => activeScenes(page)).toContain('CharSelect');
}

/** Picks Sonic, Tails and Amy (the three starters) and waits for your first turn. */
export async function startRun(page: Page) {
  await toCharacterSelect(page);
  await page.waitForTimeout(400);
  await press(page, 'z');                       // Sonic
  await press(page, 'ArrowDown', 'z');          // Tails
  await press(page, 'ArrowUp', 'ArrowUp', 'z'); // Amy (the list wraps around)
  await expect.poll(() => activeScenes(page)).toContain('Battle');
  await waitForMenu(page, 'command');
}

/** Zet de reward onder de cursor vast op een Ring Monitor, zodat Z geen keuzemenu (Chaos Drive) opent. */
export function fixReward(page: Page) {
  return setup(page, "s.rewardChoices[s.cursor] = window.REWARDS.find(r => r.id === 'rings');");
}

/** Test setup shortcut: puts the game into a specific state through the game object. */
export function setup(page: Page, fn: string) {
  return page.evaluate(code => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).game.scene.getScene('Battle');
    new Function('s', code)(s);
  }, fn);
}
