"""Snijdt de zone-achtergronden uit de sheets.
Gebruik: python3 build_bgs.py <map met de sheets> <out_dir>
Lagen met een 'key'-kleur krijgen die kleur als transparant (zo staan ze op de sheet)."""
import os, sys, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

def cut(sheet, rect, name, key=None, tol=0):
    im = Image.open(os.path.join(src, sheet)).convert('RGBA').crop(rect)
    if key:
        a = np.array(im)
        m = np.all(np.abs(a[:, :, :3].astype(int) - key) <= tol, axis=2)
        a[m] = 0
        im = Image.fromarray(a)
    im.save(os.path.join(out, name + '.png'))
    print(name, im.size)

LAYERS = [
    ('route99.png', (24, 213, 280, 469), 'route99_back', None),
    ('route99.png', (304, 213, 560, 725), 'route99_front', (13, 72, 7)),
    ('sunset.png', (24, 445, 264, 605), 'sunset_back', None),
    ('sunset.png', (24, 277, 264, 437), 'sunset_front', 'corner'),
    ('toy.png', (24, 213, 280, 373), 'toy_back', None),
    ('toy.png', (304, 213, 560, 469), 'toy_front', 'corner'),
] + [('chaosangel.png', r, f'chaosangel_{i}', None) for i, r in enumerate([
    (13, 390, 269, 646), (13, 688, 269, 944), (290, 688, 546, 944), (567, 688, 823, 944),
    (13, 990, 269, 1246), (290, 990, 546, 1246)], start=1)] + [
    ('twinkle.png', (4, 1029, 260, 1541), 'twinkle_back', None)] + [
    # 9 frames poollicht; ze passen precies op de bovenste 112 rijen van twinkle_back
    ('twinkle.png', (4, 3 + 114 * i, 260, 115 + 114 * i), f'twinkle_aurora_{i + 1}', None) for i in range(9)]

for sheet, rect, name, key in LAYERS:
    if key == 'corner':  # transparante kleur = linkerbovenhoek van de laag
        key = Image.open(os.path.join(src, sheet)).convert('RGB').getpixel(rect[:2])
    cut(sheet, rect, name, key)

# ---------------------------------------------------------------------------
# Sonic Advance 2-zones (sheets van Παρατηρητής). De sheets hebben de lagen in losse
# stroken met rode/groene randen ertussen; hier worden ze weer op elkaar gestapeld.
# ---------------------------------------------------------------------------
DARK_RED = (135, 16, 19)

def crop(sheet, rect, key=None):
    """key: één kleur of een lijst kleuren die transparant worden."""
    im = Image.open(os.path.join(src, sheet)).convert('RGBA').crop(rect)
    if key:
        a = np.array(im)
        for k in (key if isinstance(key, list) else [key]):
            a[np.all(a[:, :, :3] == k, axis=2)] = 0
        im = Image.fromarray(a)
    return im

def stack(sheet, x0, x1, bands, key=None):
    """Plakt horizontale banden (y0, y1) onder elkaar tot één laag."""
    parts = [crop(sheet, (x0, y0, x1, y1), key) for y0, y1 in bands]
    out_im = Image.new('RGBA', (x1 - x0, sum(p.height for p in parts)), (0, 0, 0, 0))
    y = 0
    for p in parts:
        out_im.alpha_composite(p, (0, y))
        y += p.height
    return out_im

def save_im(im, name):
    im.save(os.path.join(out, name + '.png'))
    print(name, im.size)

# Leaf Forest: lucht + geblokte heuvels, met een losse voorgrond-laag (donkerrood = transparant)
save_im(crop('back_15268.png', (24, 213, 280, 453)), 'leafforest_back')
save_im(crop('back_15268.png', (24, 501, 280, 701), DARK_RED), 'leafforest_front')

# Hot Crater: lucht, 8 losse parallax-rijen en de rotsstrook eronder
save_im(stack('back_7120.png', 24, 280, [(248, 360)] + [(368 + 9 * i, 369 + 9 * i) for i in range(8)] + [(440, 480)]),
        'hotcrater_back')

# Music Plant: onderste laag (lucht, instrumenten, kleurblokken) + bovenste laag (sterren, blokken) erover
mp_bands = [(213, 349), (357, 389), (397, 413), (421, 437), (445, 469), (477, 509)]
mp = stack('back_7121.png', 304, 560, mp_bands)
mp.alpha_composite(stack('back_7121.png', 24, 280, mp_bands, [DARK_RED, (186, 65, 70)]))
save_im(mp, 'musicplant_back')

# Ice Paradise: gewone kleuren + de lichtere "spotlight"-versie (wordt in de game door bundels gemaskeerd)
save_im(crop('back_130335.png', (24, 213, 280, 469)), 'iceparadise_back')
save_im(crop('back_130335.png', (304, 213, 560, 469)), 'iceparadise_spot')

# Sky Canyon: bergen + 7 wolkenstroken die elk op eigen snelheid naar links schuiven
save_im(crop('back_7117.png', (24, 194, 280, 290)), 'skycanyon_back')
for i, (y0, y1) in enumerate([(298, 302), (310, 314), (322, 330), (338, 346), (354, 362), (370, 386), (394, 434)]):
    save_im(crop('back_7117.png', (24, y0, 280, y1)), f'skycanyon_cloud_{i}')
