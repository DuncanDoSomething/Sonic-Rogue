// ---------------------------------------------------------------------------
// Tails' tips: korte uitleg de eerste keer dat iets gebeurt (eerste zone-effect, eerste rival ...).
// Elke tip komt één keer; wat je al gezien hebt staat in localStorage. Uit te zetten in Settings.
// In de testmodus wordt niks bewaard, dus daar komen ze elke keer.
// ---------------------------------------------------------------------------
import { settings } from './settings';
import { TEST_MODE } from './testMode';

const KEY = 'sonicrogue_tips_seen';

export const TIPS = {
  zone: 'Zone effects change your stats while you stay in this zone. Press V to see everything that is active.',
  rival: 'A rival! Beat them to unlock them for good. Afterwards they can even join your team.',
  boss: 'A zone boss! Win and you get a Chaos Emerald, and your team gets patched up.',
  ko: 'Ouch! A teammate who goes down stays down until you beat the zone boss.',
  switch: 'Before every wave you can swap who fights, for free. You can turn this question off in Settings.',
  shop: 'Pick one free reward. Up top is the shop: rings buy hearts for your bag. Hover the bag to see what is inside.',
} as const;
export type TipId = keyof typeof TIPS;

let seen: Set<string> | null = null;
function load(): Set<string> {
  if (seen) return seen;
  seen = new Set();
  if (TEST_MODE) return seen;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) for (const id of JSON.parse(raw) as string[]) seen.add(id);
  } catch { /* geen opslag: dan komen ze opnieuw */ }
  return seen;
}

/** Moet deze tip nu komen? (aan in Settings en nog niet gezien) */
export function tipDue(id: TipId) { return settings.tips === 0 && !load().has(id); }

export function markTip(...ids: TipId[]) {
  const s = load();
  ids.forEach(id => s.add(id));
  if (TEST_MODE) return;
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* negeren */ }
}
