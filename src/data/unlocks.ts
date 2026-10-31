// ---------------------------------------------------------------------------
// Welke characters je hebt vrijgespeeld. Je begint met Sonic, Tails en Amy; de rest
// unlock je door ze als rival te verslaan. Wordt bewaard in localStorage.
// ---------------------------------------------------------------------------

import { TEST_MODE } from './testMode';

const KEY = 'sonicrogue_unlocked';
/** Speelbaar vanaf het begin; Knuckles en Cream unlock je als rival. */
const START = ['sonic', 'tails', 'amy'];

let cache: Set<string> | null = null;

function load(): Set<string> {
  if (cache) return cache;
  cache = new Set(START);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) for (const id of JSON.parse(raw) as string[]) cache.add(id);
  } catch { /* geen opslag beschikbaar: alleen de start-characters */ }
  return cache;
}

/** In de testmodus is iedereen vrij (zonder iets op te slaan). */
export function isUnlocked(id: string) { return TEST_MODE || load().has(id); }

/** Geeft true terug als het character nieuw is vrijgespeeld. */
export function unlock(id: string): boolean {
  if (TEST_MODE) return false;
  const s = load();
  if (s.has(id)) return false;
  s.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* negeren */ }
  return true;
}

/** Alles weer op slot (alleen voor testen, via de console: resetUnlocks()). */
export function resetUnlocks() {
  cache = new Set(START);
  try { localStorage.removeItem(KEY); } catch { /* negeren */ }
}
