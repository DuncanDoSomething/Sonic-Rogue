"""Nieuwe menu-labels in de Advance 2-letter, opgebouwd uit de bestaande labels in src/assets/menu.

Gebruik: python3 tools/build_labels.py

De labels uit build_menu.py hebben niet alle letters. Ontbrekende letters worden gemaakt:
W = de M ondersteboven, H en L getekend als vorm met dezelfde dikte, rand en kleuren per rij.
Levert label_how_to_play(_on).png op.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'menu')
BLACK = np.array([0, 0, 0, 255], np.uint8)


def glyphs(img):
    """Splitst een label in letters op kolommen zonder vulkleur (alleen zwarte rand)."""
    a = np.array(img)
    fill = (a[:, :, 3] > 0) & (a[:, :, :3].sum(2) > 200)
    cols = fill.any(0)
    segs, s = [], None
    for x in range(len(cols) + 1):
        v = x < len(cols) and cols[x]
        if v and s is None:
            s = x
        if not v and s is not None:
            segs.append((max(0, s - 1), min(a.shape[1], x + 1)))
            s = None
    return [a[:, x0:x1] for x0, x1 in segs]


def label(name, suffix):
    return glyphs(Image.open(os.path.join(OUT, f'label_{name}{suffix}.png')).convert('RGBA'))


def draw(mask, ref):
    """Letter uit een vorm (# = vulling, 8 rijen), met 1 px zwarte rand en de vulkleur per rij van `ref`."""
    rows = [r for r in mask.strip('\n').split('\n')]
    h, w = len(rows) + 2, max(len(r) for r in rows) + 2
    fill = np.zeros((h, w), bool)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            fill[y + 1, x + 1] = ch == '#'
    out = np.zeros((h, w, 4), np.uint8)
    edge = np.zeros_like(fill)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            edge |= np.roll(np.roll(fill, dy, 0), dx, 1)
    out[edge & ~fill] = BLACK
    for y in range(h):
        # meest voorkomende vulkleur in die rij van de referentieletter
        rr = ref[min(y, ref.shape[0] - 1)]
        cols = [tuple(p) for p in rr if p[3] > 0 and int(p[:3].sum()) > 200]
        color = max(set(cols), key=cols.count) if cols else (255, 255, 255, 255)
        out[y][fill[y]] = color
    return out


H = """
###.....###
###.....###
###.....###
###########
###########
###.....###
###.....###
###.....###
"""
L = """
###
###
###
###
###
###
##########
##########
"""


def compose(word, suffix):
    ta = label('time_attack', suffix)   # T I M E A T T A C K
    op = label('options', suffix)       # O P T I O N S
    gs = label('game_start', suffix)    # G A M E S T A R T
    letters = {
        'H': draw(H, ta[3]), 'L': draw(L, ta[3]),
        'O': op[0], 'W': np.ascontiguousarray(ta[2][::-1]), 'T': ta[0], 'P': op[1], 'A': ta[4], 'Y': None,
    }
    # Y: de V-vorm van de M-inkeping is te klein, dus ook getekend
    letters['Y'] = draw("""
###.....###
###.....###
####...####
.#########.
...#####...
....###....
....###....
....###....
""", ta[3])
    pieces = [None if ch == ' ' else letters[ch] for ch in word]
    h = max(p.shape[0] for p in pieces if p is not None)
    w = sum((p.shape[1] - 1) if p is not None else 6 for p in pieces) + 1
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x = 0
    for p in pieces:
        if p is None:
            x += 6
            continue
        im.alpha_composite(Image.fromarray(p), (x, h - p.shape[0]))
        x += p.shape[1] - 1
    return im


for suffix in ['', '_on']:
    compose('HOW TO PLAY', suffix).save(os.path.join(OUT, f'label_how_to_play{suffix}.png'))
print('ok')
