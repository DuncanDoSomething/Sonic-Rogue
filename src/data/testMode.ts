// ---------------------------------------------------------------------------
// Testmodus: open de game met ?test achter de URL (bijv. .../Sonic-Rogue/?test).
// Alle characters zijn vrij, je echte save en unlocks worden niet aangeraakt,
// en in een gevecht zijn er sneltoetsen (T toont ze).
// ---------------------------------------------------------------------------
function readFlag(): boolean {
  try { return new URLSearchParams(window.location.search).has('test'); } catch { return false; }
}

export const TEST_MODE = typeof window !== 'undefined' && readFlag();

/** Sneltoetsen in een gevecht (testmodus). */
export const TEST_KEYS: Array<[string, string]> = [
  ['1', 'Full Boost'],
  ['2', 'Team to Lv.30 (ultimates)'],
  ['3', 'Win this wave'],
  ['4', 'Heal + revive the team'],
  ['5', 'Jump to the zone boss'],
  ['6', 'Next wave is a rival'],
  ['7', 'KO the active character'],
  ['8', '+1000 rings'],
  ['9', 'Next zone'],
];
