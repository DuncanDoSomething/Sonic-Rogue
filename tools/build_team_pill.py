"""Bouwt de "PICK YOUR TEAM"-pil voor character select, in dezelfde stijl als de
"SELECT A CHARACTER"-pil uit Sonic Advance 2.

De letters komen uit de namen op dezelfde sheet ("SONIC THE HEDGEHOG", ...): dat is hetzelfde
font, maar zwart op licht. Omgekeerd (255 - grijs) zijn het precies de witte letters van de pil.

Gebruik: python3 build_team_pill.py <7106.png (Advance 2 character select)> <out_dir> ["TEKST"]
"""
import os, sys
import numpy as np
from PIL import Image

sheet = np.array(Image.open(sys.argv[1]).convert('RGB')).astype(int)
out = sys.argv[2]
text = sys.argv[3] if len(sys.argv) > 3 else 'PICK YOUR TEAM'
BG = (192, 192, 255)

# regels met namen: (y0, y1, tekst); letters worden op lege kolommen gesplitst
NAMES = ['SONIC THE HEDGEHOG', 'MILES "TAILS" PROWER', 'KNUCKLES THE ECHIDNA', 'CREAM THE RABBIT', 'AMY ROSE']
area = sheet[0:72, 110:290]
core_rows = np.any(np.all(area < 100, axis=2), axis=1)
bands, y = [], 0
while y < len(core_rows):
    if not core_rows[y]: y += 1; continue
    s = y
    while y < len(core_rows) and core_rows[y]: y += 1
    bands.append((s - 1, y + 1))
assert len(bands) == len(NAMES), bands
glyphs = {}
for (y0, y1), line in zip(bands, NAMES):
    strip = sheet[y0:y1, 110:290]
    # de omlijning van letters raakt elkaar; splits op de donkere kern (en neem 1 pixel omlijning mee)
    empty = ~np.any(np.all(strip < 100, axis=2), axis=0)
    runs, x = [], 0
    while x < len(empty):
        if empty[x]: x += 1; continue
        s = x
        while x < len(empty) and not empty[x]: x += 1
        runs.append((s, x))
    letters = [c for c in line if c != ' ']
    if len(runs) != len(letters):
        # twee letters die elkaar raken ("TH" in KNUCKLES THE ECHIDNA): alleen de letters ervoor gebruiken
        merged = next(i for i, (s, e) in enumerate(runs) if e - s > 9)
        runs, letters = runs[:merged], letters[:merged]
    for (s, e), c in zip(runs, letters):
        glyphs.setdefault(c, strip[:, max(0, s - 1):e + 1])

missing = [c for c in text if c != ' ' and c not in glyphs]
assert not missing, f'geen letter voor {missing}'

# pil: kapjes van het origineel, zwart midden ertussen
pill = sheet[30:52, 290:440]
cap = 7            # rand + rondje links (daarna begint de oude tekst)
left = pill[:, :cap]
mid = pill[:, 29:30]  # een kolom met alleen zwart tussen de randen
GAP, SPACE = -1, 5  # de omlijning van buurletters overlapt, net als in het origineel
widths = [SPACE if c == ' ' else glyphs[c].shape[1] for c in text]
text_w = sum(widths) + GAP * (len(text) - 1)
inner = text_w + 4
img = np.concatenate([left] + [mid] * inner + [left[:, ::-1]], axis=1).copy()
# tekst: omgekeerde letters, alleen waar de letter lichter is dan de zwarte pil
x = cap + 2
ty = 8
for c, w in zip(text, widths):
    if c != ' ':
        g = glyphs[c]
        inv = 255 - g
        mask = ~np.all(g == BG, axis=2)
        region = img[ty:ty + g.shape[0], x:x + w]
        region[mask] = np.maximum(region[mask], inv[mask])
    x += w + GAP
# achtergrond van de sheet transparant
rgba = np.dstack([img, np.where(np.all(img == BG, axis=2), 0, 255)]).astype(np.uint8)
os.makedirs(out, exist_ok=True)
Image.fromarray(rgba).save(os.path.join(out, 'cs_team_pill.png'))
print('cs_team_pill', rgba.shape[1], 'x', rgba.shape[0])
