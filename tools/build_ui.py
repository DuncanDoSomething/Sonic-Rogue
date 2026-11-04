"""Bouwt de UI-atlas: rings, sparkles, item monitors, monitor-rook en character-icoontjes.

Gebruik: python3 build_ui.py <rings.png> <monitors.png> <out_dir>

Op deze sheets staat elk frame in een gekleurd vakje (paars of groen) op een transparante
achtergrond. Het script vindt de vakjes per regio, en maakt binnen elk vakje de vakjeskleur
transparant.

Let op: tools/build_shadow.py zet daarna head_shadow en oneup_shadow onderaan deze atlas.
Draai dat script opnieuw als je dit script draait.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

rings_path, monitors_path, out = sys.argv[1:4]
SHEETS = {'rings': np.array(Image.open(rings_path).convert('RGBA')),
          'monitors': np.array(Image.open(monitors_path).convert('RGBA'))}


def cells(sheet, rect):
    """Alle vakjes (bbox) binnen rect, van links naar rechts."""
    x0, y0, x1, y1 = rect
    a = SHEETS[sheet][y0:y1, x0:x1]
    lab, _ = ndimage.label(a[:, :, 3] > 0)
    out = []
    for s in ndimage.find_objects(lab):
        h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
        if w >= 8 and h >= 8:
            out.append((x0 + s[1].start, y0 + s[0].start, x0 + s[1].stop, y0 + s[0].stop))
    return sorted(out)


def grid(x0, y0, w, h, n, step):
    return [(x0 + i * step, y0, x0 + i * step + w, y0 + h) for i in range(n)]


def frame(sheet, box):
    x0, y0, x1, y1 = box
    a = SHEETS[sheet][y0:y1, x0:x1].copy()
    key = a[0, 0, :3].copy()  # vakjeskleur (linkerbovenhoek)
    a[np.all(a[:, :, :3] == key, axis=2)] = 0
    a[a[:, :, 3] == 0] = 0
    ys, xs = np.nonzero(a[:, :, 3])
    return Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


GROUPS = {
    # naam: (sheet, regio of vaste vakjes, namen per frame)
    'ring':      ('rings', (14, 14, 92, 33), None),
    'sparkle':   ('rings', (14, 33, 92, 51), None),
    'bigring':   ('rings', (14, 62, 302, 114), None),
    'monitor':   ('monitors', (14, 124, 262, 159), ['ring5', 'ring10', 'random', 'shield', 'thunder', 'power', 'shoes']),
    'oneup':     ('monitors', (14, 159, 262, 193), ['sonic', 'tails', 'knuckles', 'amy', 'cream']),
    'smoke':     ('monitors', (14, 270, 262, 301), None),
    # icoontjes liggen tegen elkaar aan: vaste 16px-grid
    'head':      ('monitors', grid(16, 80, 16, 16, 5, 16), ['sonic', 'tails', 'knuckles', 'amy', 'cream']),
}

images = []
for g, (sheet, region, names) in GROUPS.items():
    boxes = region if isinstance(region, list) else cells(sheet, region)
    for i, b in enumerate(boxes):
        nm = f'{g}_{names[i]}' if names else f'{g}_{i}'
        images.append((nm, frame(sheet, b)))
    print(g, len(boxes))

# per groep gelijke celgrootte zodat animaties niet verspringen
from collections import defaultdict
size = defaultdict(lambda: (0, 0))
for nm, im in images:
    g = nm.split('_')[0]
    size[g] = (max(size[g][0], im.width), max(size[g][1], im.height))

W = 256
x = y = rh = 0
frames = {}
placed = []
for nm, im in images:
    cw, ch = size[nm.split('_')[0]]
    if x + cw > W:
        x, y, rh = 0, y + rh, 0
    placed.append((nm, x, y, cw, ch, im))
    frames[nm] = {'frame': {'x': x, 'y': y, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                  'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
    x += cw
    rh = max(rh, ch)
atlas = Image.new('RGBA', (W, y + rh), (0, 0, 0, 0))
for nm, px, py, cw, ch, im in placed:
    atlas.alpha_composite(im, (px + (cw - im.width) // 2, py + (ch - im.height) // 2))
os.makedirs(out, exist_ok=True)
atlas.save(os.path.join(out, 'ui.png'))
json.dump({'frames': frames, 'meta': {'image': 'ui.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1',
           'credits': 'Sonic Advance 3 rings and monitors, ripped by Spitfya'}}, open(os.path.join(out, 'ui.json'), 'w'), indent=1)
print('ui atlas', atlas.size)
