"""Knipt effecten, Super Sonic en de grote artworks (voor de ultimate cut-in) uit de sheets.

Gebruik: python3 tools/build_fx.py "<map met 'character sprites'>" src/assets

Bronnen:
- Sonic Battle sheets (10039-10043, ripped by QuadFactor): artworks, effecten, Cheese
- Sonic Advance 3 Super Sonic (7150, ripped by Bonzai): transformatie en aura-dash

Elke animatie krijgt cellen van één vaste grootte (de grootste frame), met het frame in het midden
(of onderaan voor 'bottom'), zodat de animatie niet verspringt.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
TEAL = (0, 112, 112)

def sheet(path):
    return np.array(Image.open(os.path.join(SRC, path)).convert('RGBA'))

def key_out(a, bgs):
    a = a.copy()
    for c in bgs:
        a[np.all(a[:, :, :3] == c, axis=2)] = 0
    return a

def detect(a, region, bgs, gap=2, min_px=20):
    """Frames in één rij: losse stukjes die horizontaal overlappen of dicht bij elkaar liggen worden één frame."""
    x0, y0, x1, y1 = region
    sub = key_out(a[y0:y1, x0:x1], bgs)
    mask = sub[:, :, 3] > 0
    lab, n = ndimage.label(mask)
    parts = []
    for i, s in enumerate(ndimage.find_objects(lab)):
        if (lab[s] == i + 1).sum() < 3:
            continue
        parts.append([s[1].start, s[0].start, s[1].stop, s[0].stop])
    parts.sort()
    frames = []
    for p in parts:
        if frames and p[0] <= frames[-1][2] + gap:
            f = frames[-1]
            f[:] = [min(f[0], p[0]), min(f[1], p[1]), max(f[2], p[2]), max(f[3], p[3])]
        else:
            frames.append(p)
    out = []
    for f in frames:
        img = sub[f[1]:f[3], f[0]:f[2]]
        if (img[:, :, 3] > 0).sum() >= min_px:
            out.append(Image.fromarray(img))
    return out

def boxes(a, bxs, bgs):
    return [Image.fromarray(key_out(a[y0:y1, x0:x1], bgs)) for x0, y0, x1, y1 in bxs]

sonic, tails, knux = sheet('Sonic/10039.png'), sheet('Tails/10040.png'), sheet('Knuckles/10041.png')
amy, cream, sup = sheet('Amy/10042.png'), sheet('Cream/10043.png'), sheet('Super Sonic/7150.png')
GREY = tuple(int(v) for v in cream[1300, 400, :3])
SS_BG = [(0, 66, 254)]

# ---------------------------------------------------------------- animaties
ANIMS = {}
def anim(name, frames, fps, repeat=0, anchor='center'):
    ANIMS[name] = {'frames': frames, 'fps': fps, 'repeat': repeat, 'anchor': anchor}

# Super Sonic (Advance 3): Sonic -> wit -> goud, zweven, aura-dash naar rechts
ss_row0 = [(7, 8, 36, 48), (44, 10, 73, 50), (82, 7, 111, 50), (118, 8, 147, 50), (155, 9, 180, 50), (191, 10, 216, 50),
           (226, 9, 251, 49), (258, 8, 283, 49), (294, 11, 317, 48), (325, 11, 348, 48), (356, 13, 380, 48),
           (388, 14, 412, 49), (420, 14, 443, 51)]
ss = boxes(sup, ss_row0, SS_BG)
anim('ss_transform', [ss[0], ss[1], ss[2], ss[1], ss[2], ss[4], ss[5], ss[6], ss[7]], 12, 0, 'bottom')
anim('ss_idle', [ss[8], ss[9], ss[10], ss[11], ss[12], ss[11], ss[10], ss[9]], 10, -1, 'bottom')
anim('ss_charge', boxes(sup, [(120, 64, 156, 126), (167, 62, 203, 123), (211, 61, 247, 123), (256, 62, 290, 125)], SS_BG), 14, -1)
anim('ss_dash', boxes(sup, [(6, 177, 68, 213), (75, 177, 136, 213), (143, 176, 205, 212), (214, 178, 277, 212),
                            (283, 177, 344, 213), (349, 178, 411, 214)], SS_BG), 18, -1)
anim('ss_fly', boxes(sup, [(306, 79, 347, 103), (359, 78, 400, 102), (410, 80, 451, 103)], SS_BG), 14, -1)

# effecten (Sonic Battle)
anim('fx_burst', detect(knux, (5, 1425, 500, 1470), [TEAL, (0, 192, 192)]), 22)            # Knuckles: explosie
anim('fx_tornado', detect(amy, (8, 1052, 905, 1118), [TEAL], gap=4), 18)                    # Amy: roze tornado
anim('fx_energy', detect(tails, (12, 1338, 390, 1372), [TEAL, (0, 72, 72)]), 20, -1)        # Tails: energiebal
anim('fx_wind', detect(sonic, (50, 2062, 990, 2132), [(0, 72, 72)], gap=3), 24)             # Sonic: windstoot
anim('fx_slash', detect(sonic, (50, 2016, 760, 2056), [(0, 72, 72)], gap=3), 24)            # Sonic: lichtflits-streep
anim('cheese_appear', detect(cream, (5, 1284, 100, 1318), [GREY]), 12, 0)                   # Cheese verschijnt
anim('cheese_fly', detect(cream, (8, 1420, 225, 1445), [GREY]), 12, -1)                     # Cheese vliegt
anim('chao_whirl', detect(cream, (8, 1762, 600, 1830), [GREY], gap=4), 16, -1)              # Chao Revolution-wervel

# ---------------------------------------------------------------- atlas (cellen per animatie, shelf-packing)
PAD = 1
cells = []
for name, an in ANIMS.items():
    fr = an['frames']
    cw = max(f.width for f in fr) + PAD * 2
    ch = max(f.height for f in fr) + PAD * 2
    for i, f in enumerate(fr):
        cells.append((f'{name}_{i}', f, cw, ch, an['anchor']))

W = 1024
x = y = row_h = 0
place = []
for key, f, cw, ch, anchor in cells:
    if x + cw > W:
        x, y, row_h = 0, y + row_h, 0
    place.append((key, f, x, y, cw, ch, anchor))
    x += cw
    row_h = max(row_h, ch)
atlas = Image.new('RGBA', (W, y + row_h), (0, 0, 0, 0))
frames = {}
for key, f, cx, cy, cw, ch, anchor in place:
    px = cx + (cw - f.width) // 2
    py = cy + (ch - f.height) // 2 if anchor == 'center' else cy + ch - PAD - f.height
    atlas.alpha_composite(f, (px, py))
    frames[key] = {'frame': {'x': cx, 'y': cy, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                   'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
atlas.save(os.path.join(OUT, 'fx.png'))
json.dump({'frames': frames, 'meta': {'image': 'fx.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1',
           'credits': 'Sonic Battle sprites ripped by QuadFactor; Super Sonic (Sonic Advance 3) ripped by Bonzai'}},
          open(os.path.join(OUT, 'fx.json'), 'w'), indent=1)
json.dump({name: {'key': name, 'frames': [f'{name}_{i}' for i in range(len(an['frames']))],
                  'frameRate': an['fps'], 'repeat': an['repeat']} for name, an in ANIMS.items()},
          open(os.path.join(OUT, 'fx_anims.json'), 'w'), indent=1)

# ---------------------------------------------------------------- artworks voor de cut-in
ART = {
    'sonic': (sonic, (985, 1651, 1128, 1793)),
    'tails': (tails, (1110, 1676, 1235, 1819)),
    'knuckles': (knux, (994, 1844, 1137, 1987)),
    'amy': (amy, (991, 1397, 1128, 1540)),
    'cream': (cream, (964, 943, 1081, 1079)),
}
os.makedirs(os.path.join(OUT, 'cutin'), exist_ok=True)
for cid, (a, (x0, y0, x1, y1)) in ART.items():
    Image.fromarray(key_out(a[y0:y1, x0:x1], [TEAL])).save(os.path.join(OUT, 'cutin', f'{cid}.png'))

print('fx atlas', atlas.size, {k: len(v['frames']) for k, v in ANIMS.items()})
