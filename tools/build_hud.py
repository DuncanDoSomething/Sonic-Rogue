"""In-fight HUD pieces from the Tiny Chao Garden UI sheet (Sonic Advance), tools/ref/chao_garden_ui.png.

Usage: python3 tools/build_hud.py

Writes to src/assets/menu (loaded automatically as images, key = file name):
  hud_digits.png       0-9 and x in the blue Chao Garden number font, 8x11 per glyph
                       (BootScene adds the frames '0'..'9' and 'x')
  hud_rings_label.png  the white "RINGS" lettering with a dark outline
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'ref', 'chao_garden_ui.png')
OUT = os.path.join(ROOT, 'src', 'assets', 'menu')

sheet = np.array(Image.open(SRC).convert('RGBA'))
KEY = (0, 248, 0)          # sheet background
FRAME = (0, 208, 0)        # green frame around the RINGS label
OUTLINE = (40, 16, 96, 255)


def clear(a, *colors):
    a = a.copy()
    for c in colors:
        a[(a[:, :, 0] == c[0]) & (a[:, :, 1] == c[1]) & (a[:, :, 2] == c[2])] = 0
    return a


# --- digits: x0123456789 on one row (y 502-513); '1' is narrower, so it gets centered in its cell
GLYPHS = [('0', 140, 147), ('1', 150, 155)] + [(str(d), 156 + (d - 2) * 8, 163 + (d - 2) * 8) for d in range(2, 10)] + [('x', 131, 139)]
CELL_W, CELL_H = 8, 11
digits = np.zeros((CELL_H, CELL_W * len(GLYPHS), 4), np.uint8)
for i, (_, x0, x1) in enumerate(GLYPHS):
    g = clear(sheet[502:513, x0:x1], KEY)
    ox = i * CELL_W + (CELL_W - g.shape[1]) // 2
    oy = (CELL_H - g.shape[0]) // 2
    digits[oy:oy + g.shape[0], ox:ox + g.shape[1]] = g
Image.fromarray(digits).save(os.path.join(OUT, 'hud_digits.png'))

# --- RINGS label (x 209-247, y 443-449) with a 1 px dark outline so it reads on any panel
lab = clear(sheet[443:449, 209:247], FRAME, KEY, (64, 16, 120))
h, w = lab.shape[:2]
out = np.zeros((h + 2, w + 2, 4), np.uint8)
mask = lab[:, :, 3] > 0
for dy in (-1, 0, 1):
    for dx in (-1, 0, 1):
        out[1 + dy:1 + dy + h, 1 + dx:1 + dx + w][mask] = OUTLINE
out[1:1 + h, 1:1 + w][mask] = lab[mask]
Image.fromarray(out).save(os.path.join(OUT, 'hud_rings_label.png'))
print('digits', digits.shape, 'label', out.shape)
