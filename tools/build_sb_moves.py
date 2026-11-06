"""Sonic Battle-moves voor het team: Knuckle Punch, Glove Punch, Hammer Twirl en Chao Cheer (en hun effecten).

Gebruik: python3 tools/build_sb_moves.py "<map 'Sonic rogue sprites'>" src/assets

Bronnen (allemaal "from Sonic Battle, ripped by QuadFactor"):
- character sprites/Knuckles/10041.png: Megaton Hook, Dashing toward opponent, de vuur-explosie van Deep Impact
- character sprites/Tails/10040.png: Magic Hook (boxhandschoen aan een ketting), Dashing toward opponent
- character sprites/Amy/10042.png: Girl Tornado (Pink Typhoon) en de roze tornado
- character sprites/Cream/10043.png: Cream die Cheese roept, en Cheese zelf (verschijnen, vliegen, Chao Cannon)

De Sonic Battle-sprites zijn net zo groot als de Advance 3-sprites (Knuckles staat 35 px hoog, in Advance 3 33 px),
dus de hero-sprite kan halverwege een aanval gewoon deze frames afspelen.
Characters kijken op de sheets naar RECHTS; hier worden ze gespiegeld zodat ze naar LINKS kijken (zoals de rest).
Character-frames staan met hun voeten onderaan de cel (origin 0.5, 1), effecten in het midden (origin 0.5).
"""
import json, os, sys
from collections import Counter
import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
CS = os.path.join(SRC, 'character sprites')
BG = [(0, 72, 72), (0, 72, 74), (0, 91, 91), (0, 192, 192), (0, 184, 184), (76, 76, 76)]


class Sheet:
    """Vindt de sprites op een Sonic Battle-sheet en zet ze in rijen (zelfde aanpak als build_shadow.py)."""

    def __init__(self, path):
        a = np.array(Image.open(path).convert('RGBA'))
        cnt = Counter(map(tuple, a[:, :, :3].reshape(-1, 3)[::7]))
        for c in [cnt.most_common(1)[0][0]] + BG:
            a[np.all(a[:, :, :3] == c, axis=2)] = 0
        a[a[:, :, 3] < 10] = 0
        alpha = a[:, :, 3] > 0
        lab, _ = ndimage.label(ndimage.binary_dilation(alpha, iterations=2))
        boxes = []
        for i, s in enumerate(ndimage.find_objects(lab)):
            real = alpha[s] & (lab[s] == i + 1)
            if real.sum() < 30:
                continue
            ys, xs = np.nonzero(real)
            boxes.append((s[1].start + xs.min(), s[0].start + ys.min(), s[1].start + xs.max() + 1, s[0].start + ys.max() + 1, i + 1))
        boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
        rows = []
        for b in boxes:
            cy = (b[1] + b[3]) / 2
            if rows and abs(cy - rows[-1]['cy']) < 14:
                rows[-1]['b'].append(b)
                rows[-1]['cy'] = np.mean([(x[1] + x[3]) / 2 for x in rows[-1]['b']])
            else:
                rows.append({'cy': cy, 'b': [b]})
        self.rows = [sorted(r['b'], key=lambda b: b[0]) for r in rows]
        self.a, self.lab = a, lab

    def crop(self, r, c, mirror=True):
        x0, y0, x1, y1, lid = self.rows[r][c]
        spr = self.a[y0:y1, x0:x1].copy()
        spr[self.lab[y0:y1, x0:x1] != lid] = 0
        if mirror:
            spr = spr[:, ::-1]
        return Image.fromarray(np.ascontiguousarray(spr))


def body_x(img):
    """Midden van het grootste losse stuk (het lichaam), zodat een zwaai of handschoen de uitlijning niet verschuift."""
    a = np.array(img)
    body, nb = ndimage.label(a[:, :, 3] > 0)
    if nb == 0:
        return img.width / 2
    sizes = ndimage.sum(np.ones_like(body), body, range(1, nb + 1))
    bx = np.nonzero(body == int(np.argmax(sizes)) + 1)[1]
    return (bx.min() + bx.max() + 1) / 2


def head_x(img, frac=0.4):
    """Midden van het bovenste stuk (hoofd): blijft stil staan terwijl armen, zwaaien en handschoenen eromheen bewegen."""
    a = np.array(img)[:, :, 3] > 0
    ys, xs = np.nonzero(a)
    top = ys.min()
    sel = ys < top + (ys.max() - top) * frac
    return (xs[sel].min() + xs[sel].max() + 1) / 2


sheets = {k: Sheet(os.path.join(CS, p)) for k, p in
          {'knuckles': 'Knuckles/10041.png', 'tails': 'Tails/10040.png', 'amy': 'Amy/10042.png', 'cream': 'Cream/10043.png'}.items()}

# (rij, kolom[, ms]) op de sheet. Kolommen tellen zoals tools-overzicht (losse sprites van links naar rechts).
CHAR_ANIMS = {
    # Knuckle Punch: aanlopen, arm als een windmolen rond laten draaien, dan de Megaton Hook
    'knuckles_sbdash':    ('knuckles', [(19, 3), (19, 4)], 14, -1),
    'knuckles_megaton':   ('knuckles', [(15, 0, 60), (15, 1, 60), (15, 2, 80)], None, 0),
    'knuckles_windmill':  ('knuckles', [(15, c) for c in range(3, 10)], 24, -1),
    'knuckles_hook':      ('knuckles', [(15, 10, 50), (15, 11, 50), (15, 12, 140), (15, 13, 320)], None, 0),
    # Glove Punch: aanvliegen, handschoen uit een portaal trekken, aan de ketting rondzwaaien en weggooien
    'tails_sbdash':       ('tails', [(20, c) for c in (4, 5, 6, 7)], 16, -1),
    'tails_summon':       ('tails', [(15, 1, 50), (15, 2, 50), (15, 3, 60), (15, 4, 60), (15, 5, 60), (15, 6, 120)], None, 0),
    'tails_swing':        ('tails', [(15, c) for c in range(7, 14)] + [(16, 0)], 22, -1),
    'tails_fling':        ('tails', [(16, 1, 110), (16, 2, 70), (16, 3, 70), (16, 4, 60), (16, 5, 60), (16, 6, 60), (16, 7, 60),
                                     (16, 8, 60), (16, 9, 80), (16, 10, 200)], None, 0),
    # Hammer Twirl: de Girl Tornado (frames 4-7 draaien rond), uitlopen met de hamer op de grond
    'amy_twirlstart':     ('amy', [(21, 0, 60), (21, 1, 60), (21, 2, 60), (21, 3, 60)], None, 0),
    'amy_twirlloop':      ('amy', [(21, c) for c in (4, 5, 6, 7)], 22, -1),
    'amy_twirlend':       ('amy', [(21, 8, 60), (21, 9, 70), (21, 10, 80), (21, 11, 90), (21, 12, 160), (21, 13, 90), (21, 14, 200)], None, 0),
    # Chao Cheer: Cream wijst Cheese de weg
    'cream_call':         ('cream', [(15, 1, 60), (15, 2, 100), (15, 3, 80), (15, 4, 80), (15, 5, 80), (15, 6, 80), (15, 7, 80),
                                     (15, 8, 80), (15, 9, 80), (15, 10, 80), (15, 11, 80)], None, 0),
    'cream_point':        ('cream', [(15, 12, 90), (15, 13, 300)], None, 0),
}
FX_ANIMS = {
    'sbfx_kboom':        ('knuckles', [(31, c) for c in range(0, 12)], 22, 0, False),
    'sbfx_pinktornado':  ('amy', [(23, c) for c in range(0, 15)], 18, 0, False),
    'sbfx_cheese_in':    ('cream', [(34, c) for c in range(0, 4)], 14, 0, True),
    'sbfx_cheese_fly':   ('cream', [(41, c) for c in range(0, 7)], 12, -1, True),
    'sbfx_chaocannon':   ('cream', [(42, c) for c in range(1, 9)], 16, 0, True),
}
# handmatige correctie van het anker (pixels, + = naar rechts in de gespiegelde frames)
OFFSETS = {}

# ------------------------------------------------------------------ frames knippen
chars, fxs = {}, {}
for key, (char, frames, _, _) in CHAR_ANIMS.items():
    for f in frames:
        rc = f[:2]
        if (char, rc) not in chars:
            img = sheets[char].crop(*rc)
            chars[(char, rc)] = (img, head_x(img) + OFFSETS.get((char, rc), 0))
for key, (char, frames, _, _, mirror) in FX_ANIMS.items():
    for f in frames:
        fxs[(char, f)] = sheets[char].crop(*f, mirror=mirror)

# per character één celgrootte (voeten onderaan, lichaam in het midden); effecten per animatie
PAD = 2
cells = []   # (name, img, cw, ch, ox, oy)
for char in sheets:
    group = [(rc, v) for (c, rc), v in chars.items() if c == char]
    if not group:
        continue
    half = max(max(ax, img.width - ax) for _, (img, ax) in group)
    cw, ch = int(np.ceil(half)) * 2 + PAD * 2, max(img.height for _, (img, _) in group) + PAD * 2
    for rc, (img, ax) in group:
        cells.append((f'sb_{char}_{rc[0]}_{rc[1]}', img, cw, ch, int(round(cw / 2 - ax)), ch - PAD - img.height))
for key, (char, frames, _, _, _) in FX_ANIMS.items():
    imgs = [fxs[(char, f)] for f in frames]
    cw, ch = max(i.width for i in imgs) + PAD * 2, max(i.height for i in imgs) + PAD * 2
    for i, (f, img) in enumerate(zip(frames, imgs)):
        cells.append((f'{key}_{i}', img, cw, ch, (cw - img.width) // 2, (ch - img.height) // 2))

# ------------------------------------------------------------------ inpakken (planken van links naar rechts)
WIDTH = 1024
x = y = shelf = 0
placed = []
for name, img, cw, ch, ox, oy in sorted(cells, key=lambda c: -c[3]):
    if x + cw > WIDTH:
        x, y, shelf = 0, y + shelf, 0
    placed.append((name, img, x, y, cw, ch, ox, oy))
    x += cw
    shelf = max(shelf, ch)
atlas = Image.new('RGBA', (WIDTH, y + shelf), (0, 0, 0, 0))
frames = {}
for name, img, x, y, cw, ch, ox, oy in placed:
    atlas.alpha_composite(img, (x + ox, y + oy))
    frames[name] = {'frame': {'x': x, 'y': y, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                    'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
atlas.save(os.path.join(OUT, 'sbmoves.png'))
json.dump({'frames': frames, 'meta': {'image': 'sbmoves.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1',
           'credits': 'Knuckles, Tails, Amy, Cream and Cheese from Sonic Battle, ripped by QuadFactor'}},
          open(os.path.join(OUT, 'sbmoves.json'), 'w'), indent=1)

anims = {}
for key, (char, fr, fps, rep) in CHAR_ANIMS.items():
    names = [f'sb_{char}_{f[0]}_{f[1]}' for f in fr]
    if fps is None:
        anims[key] = {'key': key, 'frames': [{'frame': n, 'duration': f[2]} for n, f in zip(names, fr)], 'frameRate': 1000, 'repeat': rep}
    else:
        anims[key] = {'key': key, 'frames': names, 'frameRate': fps, 'repeat': rep}
for key, (char, fr, fps, rep, _) in FX_ANIMS.items():
    anims[key] = {'key': key, 'frames': [f'{key}_{i}' for i in range(len(fr))], 'frameRate': fps, 'repeat': rep}
json.dump(anims, open(os.path.join(OUT, 'sbmoves_anims.json'), 'w'), indent=1)
print('sbmoves atlas', atlas.size, len(frames), 'frames')
