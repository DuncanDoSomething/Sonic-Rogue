// ---------------------------------------------------------------------------
// Welke characters je hebt vrijgespeeld. Je begint met Sonic, Tails en Amy; de rest
// unlock je door ze als rival te verslaan. Wordt bewaard in localStorage.
// ---------------------------------------------------------------------------

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

export function isUnlocked(id: string) { return load().has(id); }

/** Geeft true terug als het character nieuw is vrijgespeeld. */
export function unlock(id: string): boolean {
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
