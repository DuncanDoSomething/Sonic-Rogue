"""Snijdt Sonic-frames uit de Sonic Advance 3 sheet en bouwt een Phaser atlas.

Gebruik: python3 build_atlas.py <character> sheet.png out_dir
Bijv.:   python3 build_atlas.py tails tails_sheet.png src/assets
Elk frame komt in een cel van vaste grootte, onderaan gecentreerd (voeten op dezelfde lijn),
zodat animaties niet wiebelen. Frames kijken naar LINKS (zo staan ze op de sheet).
"""
import json, sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

char, sheet_path, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out_dir, exist_ok=True)
im = Image.open(sheet_path).convert('RGBA')
a = np.array(im)
alpha = a[:, :, 3] > 0

# --- 1. sprites detecteren (connected components, 2px dilatie zodat losse pixels bij hun sprite horen)
lab, n = ndimage.label(ndimage.binary_dilation(alpha, iterations=2))
boxes = []
for i, s in enumerate(ndimage.find_objects(lab)):
    real = alpha[s] & (lab[s] == i + 1)
    if real.sum() < 30:
        continue
    ys, xs = np.nonzero(real)
    boxes.append((s[1].start + xs.min(), s[0].start + ys.min(),
                  s[1].start + xs.max() + 1, s[0].start + ys.max() + 1, i + 1))

# --- 2. groeperen in rijen op basis van verticaal midden
boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
rows = []
for b in boxes:
    cy = (b[1] + b[3]) / 2
    if rows and abs(cy - rows[-1]['cy']) < 14:
        rows[-1]['b'].append(b)
        rows[-1]['cy'] = np.mean([(x[1] + x[3]) / 2 for x in rows[-1]['b']])
    else:
        rows.append({'cy': cy, 'b': [b]})
rows = [sorted(r['b'], key=lambda b: b[0]) for r in rows]

# --- 3. welke frames horen bij welke animatie ("rij.kolom" op de sheet)
CHARACTERS = {
    'sonic': {
        # 'idle' komt uit tools/build_idle_gif.py (referentie-GIF met de echte uitlijning en timing).
        # Als je lang niks doet gaat hij liggen met een "..."-wolkje (zoals in Advance 2/3).
        'sit':     {'frames': [(1, 6, 140), (1, 7, 140), (1, 8, 160), (1, 9, 160), (1, 10, 200), (1, 11, 200), (1, 12, 200), (1, 13, 300)], 'repeat': 0},
        'nap':     {'frames': [(1, 13, 900), (1, 14, 500), (1, 15, 1100)], 'repeat': -1},
        'spin':    {'frames': [(5, 3), (5, 4), (5, 5), (5, 6)], 'fps': 20, 'repeat': -1},
        'run':     {'frames': [(3, c) for c in range(12, 20)], 'fps': 20, 'repeat': -1},
        'hurt':    {'frames': [(9, 1), (9, 2)], 'fps': 8, 'repeat': 0},
        # weggeslagen, neerploffen en duizelig blijven zitten
        'ko':      {'frames': [(15, 12, 160), (15, 16, 120), (15, 17, 160), (15, 18, 400)], 'repeat': 0},
        # vuist omhoog, dan wijzen met vingertje-wiebel; eindigt op de wijs-pose
        'victory': {'frames': [(14, 8, 110), (14, 9, 110), (14, 10, 110), (14, 11, 380),
                               (14, 12, 120), (14, 13, 120), (14, 12, 120), (14, 13, 120)], 'repeat': 0},
        # Spin Dash-lancering: bal met vuurstaart
        'dashfire': {'frames': [(7, 17), (7, 19)], 'fps': 16, 'repeat': -1},
        # gouden draaitrap (na de Homing Attack)
        'spinkick': {'frames': [(16, c) for c in range(16, 22)] + [(17, 0), (17, 1)], 'fps': 18, 'repeat': 0},
    },
    'tails': {
        # staart-zwiep is een cyclus van 8 frames; 14-15 zijn varianten die de loop laten haperen
        'idle':    {'frames': [(0, c) for c in range(0, 8)], 'fps': 10, 'repeat': -1},
        'spin':    {'frames': [(14, 7), (14, 8), (14, 9), (14, 10)], 'fps': 20, 'repeat': -1},
        'fly':     {'frames': [(19, 0), (19, 1), (19, 2), (19, 3)], 'fps': 16, 'repeat': -1},
        'punch':   {'frames': [(20, c) for c in range(6, 12)], 'fps': 14, 'repeat': 0},
        'hurt':    {'frames': [(25, 0), (25, 1)], 'fps': 8, 'repeat': 0},
        'ko':      {'frames': [(25, 0), (26, 17), (26, 18), (27, 0), (27, 1)], 'fps': 6, 'repeat': 0},
        # duim omhoog, dan saluut met een grijns; eindigt op 1.1
        'victory': {'frames': [(0, 16, 120), (0, 17, 260), (0, 18, 140), (0, 19, 140), (1, 0, 140), (1, 1, 200)], 'repeat': 0},
        'wait':    {'frames': [(0, 16, 160), (0, 18, 200), (0, 19, 400), (1, 0, 200), (1, 1, 400), (0, 19, 160), (0, 16, 160)], 'repeat': 0},
        # gaat op zijn staarten liggen
        'sit':     {'frames': [(1, 2, 160), (1, 3, 200), (1, 4, 260)], 'repeat': 0},
        'nap':     {'frames': [(1, c) for c in range(5, 15)], 'fps': 7, 'repeat': -1},
        'run':     {'frames': [(2, c) for c in range(11, 19)], 'fps': 18, 'repeat': -1},
        # Copter Dive: als raket omhoog (staarten eronder), dan als propellerbal omlaag boren
        'rise':    {'frames': [(14, c) for c in range(19, 25)] + [(15, 0), (15, 1)], 'fps': 22, 'repeat': -1},
        'drill':   {'frames': [(15, c) for c in range(2, 10)], 'fps': 24, 'repeat': -1},
    },
    'knuckles': {
        'idle':    {'frames': [(0, c) for c in range(2, 9)], 'fps': 8, 'repeat': -1},
        'spin':    {'frames': [(18, 19), (18, 20), (18, 21), (18, 22)], 'fps': 20, 'repeat': -1},
        'glide':   {'frames': [(3, 20), (3, 21), (3, 22), (3, 23), (3, 24)], 'fps': 14, 'repeat': -1},
        'punch':   {'frames': [(1, 13, 90), (1, 14, 90), (1, 15, 140), (1, 16, 90), (1, 17, 120)], 'repeat': 0},
        'hurt':    {'frames': [(22, 0)], 'fps': 8, 'repeat': 0},
        # duizelig, dan voorover plat op de grond
        'ko':      {'frames': [(22, 0, 200), (31, 7, 120), (31, 8, 120), (31, 9, 140), (31, 12, 500)], 'repeat': 0},
        # vuist balanceren, dan duim omhoog met glimmer
        'victory': {'frames': [(26, 17, 120), (26, 18, 120), (26, 19, 160), (26, 20, 600)], 'repeat': 0},
        # schaduwboksen, en daarna even gaan zitten
        'wait':    {'frames': [(1, c) for c in range(4, 13)], 'fps': 14, 'repeat': 1},
        'sit':     {'frames': [(1, 19, 160), (1, 20, 160), (1, 21, 200), (1, 22, 260)], 'repeat': 0},
        'nap':     {'frames': [(2, c) for c in range(0, 8)], 'fps': 6, 'repeat': -1},
        'run':     {'frames': [(3, c) for c in range(17, 25)], 'fps': 18, 'repeat': -1},
        # Knuckle Punch: vuist vooruit met een vuurstoot
        'heavypunch': {'frames': [(9, c) for c in range(5, 13)], 'fps': 16, 'repeat': 0},
    },
    'cream': {
        # staan, knipperen, oortje laten wiebelen
        'idle':    {'frames': [(0, 0, 1400), (0, 10, 110), (0, 0, 900), (0, 5, 180), (0, 6, 260), (0, 5, 180)], 'repeat': -1},
        'spin':    {'frames': [(6, c) for c in range(14, 22)], 'fps': 20, 'repeat': -1},
        'fly':     {'frames': [(18, 5), (18, 6), (18, 7), (18, 6)], 'fps': 14, 'repeat': -1},
        'cheer':   {'frames': [(20, 9, 120), (20, 10, 120), (20, 11, 120), (20, 12, 160), (20, 13, 500)], 'repeat': 0},
        'hurt':    {'frames': [(25, 3)], 'fps': 8, 'repeat': 0},
        # achterover geslagen, dan plat op de grond
        'ko':      {'frames': [(25, 3, 160), (25, 8, 160), (25, 9, 160), (25, 10, 160), (25, 11, 400)], 'repeat': 0},
        # V-teken met knipoog
        'victory': {'frames': [(15, 17, 160), (15, 18, 140), (15, 19, 140), (15, 20, 600)], 'repeat': 0},
        'wait':    {'frames': [(0, c) for c in range(4, 13)], 'fps': 8, 'repeat': 0},
        # gaat zitten en dommelt in (stipjes)
        'sit':     {'frames': [(1, 21, 160), (1, 22, 200), (1, 23, 260)], 'repeat': 0},
        'nap':     {'frames': [(1, c) for c in range(24, 29)], 'fps': 4, 'repeat': -1},
        'run':     {'frames': [(3, c) for c in range(16, 24)], 'fps': 18, 'repeat': -1},
        # draaiende schijf (Flutter Dive)
        'spindisc': {'frames': [(8, c) for c in range(10, 16)], 'fps': 18, 'repeat': -1},
    },
    'amy': {
        # 'idle' komt uit tools/build_idle_gif.py (referentie-GIF, met hartjes)
        'spin':    {'frames': [(5, 21), (5, 22), (5, 23), (5, 24)], 'fps': 20, 'repeat': -1},
        'hammer':  {'frames': [(10, 0, 90), (10, 1, 70), (10, 2, 70), (10, 3, 70), (10, 4, 70), (10, 5, 90),
                               (10, 6, 70), (10, 7, 70), (10, 8, 90), (10, 9, 160)], 'repeat': 0},
        'twirl':   {'frames': [(17, 6), (17, 7), (17, 8), (17, 9), (17, 10), (17, 11)], 'fps': 18, 'repeat': -1},
        'hurt':    {'frames': [(28, 8)], 'fps': 8, 'repeat': 0},
        'ko':      {'frames': [(28, 8), (22, 0)], 'fps': 4, 'repeat': 0},
        'victory': {'frames': [(40, 0, 140), (40, 1, 140), (40, 2, 140), (40, 3, 140), (40, 4, 600)], 'repeat': 0},
        'wait':    {'frames': [(0, c) for c in range(13, 20)], 'fps': 8, 'repeat': 0},
        # hurkt neer en wacht
        'sit':     {'frames': [(0, 20, 160), (0, 21, 180), (0, 22, 240)], 'repeat': 0},
        'nap':     {'frames': [(0, 23, 600), (0, 24, 500), (0, 25, 800), (0, 24, 500)], 'repeat': -1},
        'run':     {'frames': [(3, c) for c in range(22, 30)], 'fps': 18, 'repeat': -1},
        # roze/gouden draaischijf (Hammer Twirl)
        'spindisc': {'frames': [(6, 24), (6, 25), (6, 26), (6, 27), (7, 0), (7, 1)], 'fps': 18, 'repeat': -1},
    },
}
# handmatige anker-correctie (pixels, + = naar rechts) voor frames waar een hamer o.i.d. het lichaam scheef trekt
OFFSETS = {
    'knuckles': {(1, 14): -7, (1, 15): -7, (1, 16): -5, (9, 5): 3, (9, 10): 4},
    'amy': {(10, 0): 3, (10, 1): 8, (10, 2): 8, (10, 3): 8, (10, 4): 7, (10, 6): -7, (10, 7): -7, (10, 8): -7, (10, 9): -7,
            (17, 6): -12, (17, 8): 11, (17, 9): 10, (17, 11): -4},
}.get(char, {})
# frames die op de sheet aan een buur-sprite vastplakken: alleen de eerste N pixels (van links) houden
CLIP = {
    'sonic': {(15, 18): 32},
    'knuckles': {(1, 22): 32},
}.get(char, {})
ANIMS = CHARACTERS[char]
# gemaakte frames: (rij, nep-kolom) -> bron-frame. Het bovenlichaam zakt 1 pixel (ademhalen).
SYNTH = {}.get(char, {})

def crop(r, c):
    if (r, c) in SYNTH:
        img = crop(*SYNTH[(r, c)])
        px = np.array(img)
        cut = int(px.shape[0] * 0.55)          # alles boven de heupen
        out = px.copy()
        out[1:cut + 1] = px[0:cut]
        out[0] = 0
        res = Image.fromarray(out)
        res.info['anchor_x'] = img.info['anchor_x']
        return res
    x0, y0, x1, y1, lid = rows[r][c]
    spr = a[y0:y1, x0:x1].copy()
    spr[lab[y0:y1, x0:x1] != lid] = 0  # alleen pixels van dit sprite-component
    if (r, c) in CLIP:
        spr = spr[:, :CLIP[(r, c)]].copy()
    # anker = midden van het grootste losse stuk (het lichaam), zodat stofwolkjes de uitlijning niet verschuiven
    body_lab, nb = ndimage.label(spr[:, :, 3] > 0)
    sizes = ndimage.sum(np.ones_like(body_lab), body_lab, range(1, nb + 1))
    bx = np.nonzero(body_lab == (int(np.argmax(sizes)) + 1))[1]
    img = Image.fromarray(spr)
    img.info['anchor_x'] = (bx.min() + bx.max() + 1) / 2 - OFFSETS.get((r, c), 0)
    return img

used = {}
for name, an in ANIMS.items():
    for f in an['frames']:
        used[f[:2]] = crop(*f[:2])

PAD = 2
half = max(max(i.info['anchor_x'], i.width - i.info['anchor_x']) for i in used.values())
cw = int(np.ceil(half)) * 2 + PAD * 2
ch = max(i.height for i in used.values()) + PAD * 2
cols = 8
keys = list(used.keys())
atlas = Image.new('RGBA', (cols * cw, ((len(keys) + cols - 1) // cols) * ch), (0, 0, 0, 0))
frames = {}
for idx, rc in enumerate(keys):
    spr = used[rc]
    cx, cy = (idx % cols) * cw, (idx // cols) * ch
    atlas.alpha_composite(spr, (cx + int(round(cw / 2 - spr.info['anchor_x'])), cy + ch - PAD - spr.height))
    frames[f'{char}_{rc[0]}_{rc[1]}'] = {
        'frame': {'x': cx, 'y': cy, 'w': cw, 'h': ch},
        'rotated': False, 'trimmed': False,
        'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch},
        'sourceSize': {'w': cw, 'h': ch},
    }

atlas.save(os.path.join(out_dir, f'{char}.png'))
json.dump({'frames': frames,
           'meta': {'image': f'{char}.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1',
                    'credits': 'Sonic Advance 3 sprites by Sega/Sonic Team, ripped by Ren "Foxx" Ramos'}},
          open(os.path.join(out_dir, f'{char}.json'), 'w'), indent=1)
def frame_entry(f):
    key = f'{char}_{f[0]}_{f[1]}'
    # met een eigen duur: frameRate 1000 maakt de basis-tijd 1 ms, de rest zit in 'duration'
    return {'frame': key, 'duration': f[2] - 1} if len(f) == 3 else key

json.dump({name: {'key': f'{char}_{name}',
                  'frames': [frame_entry(f) for f in an['frames']],
                  'frameRate': an.get('fps', 1000), 'repeat': an['repeat']}
           for name, an in ANIMS.items()},
          open(os.path.join(out_dir, f'{char}_anims.json'), 'w'), indent=1)
print('atlas', atlas.size, 'cell', cw, ch, 'frames', len(frames))
