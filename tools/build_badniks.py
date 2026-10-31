"""Snijdt badniks + explosie uit de enemy-sheets en bouwt één Phaser atlas.

Gebruik: python3 build_badniks.py <advance3_enemies.png> <advance2_enemies.png> <out_dir>

Elke animatie is een 'strip': een rechthoek (x0, y0, x1, y1) op de sheet. Binnen die
rechthoek wordt de achtergrond weggehaald (alleen achtergrond die met de rand verbonden is,
zodat witte highlights in sprites blijven) en worden de losse sprites van links naar rechts
als frames gepakt. Frames krijgen per vijand dezelfde celgrootte, onderaan gecentreerd.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

adv3_path, adv2_path, out_dir = sys.argv[1:4]
SHEETS = {'adv3': np.array(Image.open(adv3_path).convert('RGBA')),
          'adv2': np.array(Image.open(adv2_path).convert('RGBA'))}
BG = {'adv3': [(255, 255, 255)], 'adv2': [(88, 200, 80)]}

# id -> {anim: (sheet, rect, keep)}; keep = welke frames (indexen) te gebruiken, None = alle
ENEMIES = {
    'beetle':   {'idle':   ('adv3', (38, 2, 132, 34), None)},
    'sharkjet': {'idle':   ('adv3', (238, 30, 600, 58), [0, 1, 2]),
                 'attack': ('adv3', (238, 30, 600, 58), [3, 4, 5, 6])},
    'octo':     {'idle':   ('adv3', (245, 140, 492, 190), [0, 1, 2, 3, 4]),
                 'attack': ('adv3', (245, 140, 492, 190), [5, 6, 7])},
    'frog':     {'idle':   ('adv3', (38, 290, 104, 330), None),
                 'attack': ('adv3', (88, 323, 258, 358), None)},
    'bee':      {'idle':   ('adv3', (66, 492, 266, 534), [0, 1, 2, 3]),
                 'attack': ('adv3', (62, 455, 280, 492), None)},
    'snowman':  {'idle':   ('adv3', (598, 54, 640, 88), None),
                 'attack': ('adv3', (640, 54, 922, 88), None)},
    'pig':      {'idle':   ('adv3', (298, 326, 478, 356), None)},
    'soldier':  {'idle':   ('adv3', (298, 358, 478, 394), None),
                 'attack': ('adv3', (298, 396, 478, 432), [0, 1, 2, 3, 4, 5])},
    'penguin':  {'idle':   ('adv3', (628, 14, 752, 54), None)},
    'mine':     {'idle':   ('adv3', (792, 93, 922, 122), None),
                 'attack': ('adv3', (790, 124, 925, 163), None)},
    'turtle':   {'idle':   ('adv2', (10, 222, 182, 268), None),
                 'attack': ('adv2', (182, 222, 228, 268), None)},
    # losse rechthoeken: deze frames staan te dicht op elkaar om automatisch te splitsen
    'explosion': {'idle':  ('adv3', [(310, 440, 342, 482), (342, 440, 374, 482), (375, 440, 408, 482),
                                     (409, 440, 441, 482), (443, 440, 474, 482)], None)},
}


def strip_frames(sheet, rect):
    if isinstance(rect, list):  # lijst van losse frame-rechthoeken
        return [f for r in rect for f in strip_frames(sheet, r)[:1]]
    x0, y0, x1, y1 = rect
    a = SHEETS[sheet][y0:y1, x0:x1].copy()
    rgb = a[:, :, :3]
    is_bg_color = np.zeros(rgb.shape[:2], bool)
    for c in BG[sheet]:
        is_bg_color |= np.all(rgb == c, axis=2)
    is_bg_color |= a[:, :, 3] == 0
    # achtergrond = bg-kleur die met de rand van de strip verbonden is
    lab, _ = ndimage.label(is_bg_color)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    a[bg] = 0
    fg = a[:, :, 3] > 0
    # kaderlijnen van de sheet weghalen (lange dunne stukken)
    lab2, _ = ndimage.label(fg)
    for i, s in enumerate(ndimage.find_objects(lab2)):
        h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
        if (w <= 2 and h > 15) or (h <= 2 and w > 15):
            fg[s][lab2[s] == i + 1] = False
    # losse snippers (<15 px) van naburige sprites weghalen
    lab3, n3 = ndimage.label(fg)
    if n3:
        sizes3 = ndimage.sum(fg, lab3, range(1, n3 + 1))
        for i, sz in enumerate(sizes3):
            if sz < 15:
                fg[lab3 == i + 1] = False
    a[~fg] = 0
    # frames splitsen op lege kolommen (vuurtjes/propellers onder een sprite blijven zo bij die sprite)
    cols = fg.any(axis=0)
    frames, start = [], None
    for x in range(len(cols) + 1):
        filled = x < len(cols) and cols[x]
        if filled and start is None:
            start = x
        elif not filled and start is not None:
            part = fg[:, start:x]
            if part.sum() >= 60 and x - start >= 8:
                ys = np.nonzero(part.any(axis=1))[0]
                frames.append((start, Image.fromarray(a[ys.min():ys.max() + 1, start:x])))
            start = None
    frames.sort(key=lambda f: f[0])
    return [f[1] for f in frames]


os.makedirs(out_dir, exist_ok=True)
images, anims, sizes = [], {}, {}
for eid, an in ENEMIES.items():
    for name, (sheet, rect, keep) in an.items():
        fr = strip_frames(sheet, rect)
        if keep is not None:
            fr = [fr[i] for i in keep]
        anims[f'{eid}_{name}'] = []
        for i, im in enumerate(fr):
            key = f'{eid}_{name}_{i}'
            images.append((eid, key, im))
            anims[f'{eid}_{name}'].append(key)
        print(f'{eid}_{name}: {len(fr)} frames', [im.size for im in fr])

# celgrootte per vijand
for eid in ENEMIES:
    ims = [im for e, _, im in images if e == eid]
    sizes[eid] = (max(i.width for i in ims) + 2, max(i.height for i in ims) + 2)

# simpel shelf-packen
ATLAS_W = 512
x = y = row_h = 0
placed = []
for eid, key, im in images:
    cw, ch = sizes[eid]
    if x + cw > ATLAS_W:
        x, y, row_h = 0, y + row_h, 0
    placed.append((key, x, y, cw, ch, im))
    x += cw
    row_h = max(row_h, ch)
atlas = Image.new('RGBA', (ATLAS_W, y + row_h), (0, 0, 0, 0))
frames = {}
for key, px, py, cw, ch, im in placed:
    atlas.alpha_composite(im, (px + (cw - im.width) // 2, py + ch - 1 - im.height))
    frames[key] = {'frame': {'x': px, 'y': py, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                   'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
atlas.save(os.path.join(out_dir, 'badniks.png'))
json.dump({'frames': frames, 'meta': {'image': 'badniks.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1',
           'credits': 'Sonic Advance 3 enemies ripped by SkyLights; Sonic Advance 2 enemies ripped by Fatazz (Turtle474)'}},
          open(os.path.join(out_dir, 'badniks.json'), 'w'), indent=1)
json.dump(anims, open(os.path.join(out_dir, 'badnik_anims.json'), 'w'), indent=1)
print('atlas', atlas.size)
