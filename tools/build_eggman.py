"""Eggman (in de Egg Mobile) als boss: atlas, animaties en zijn icoontje (achtergronden: build_space.py).

Gebruik: python3 tools/build_eggman.py "<map 'Sonic rogue sprites'>" src/assets

Bron: bosses/Eggman/10058.png, Eggman uit Sonic Battle (Death Egg-rip door SkyLights, verzameld door Dinoshi 64).
Elk frame staat in een vakje van 48x48 (projectielen 16x16) met een eigen vakjeskleur.
Eggman kijkt op de sheet naar rechts: in de game spiegelt de code hem (facesRight).
"""
import json, os, sys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
sheet = np.array(Image.open(os.path.join(SRC, 'bosses', 'Eggman', '10058.png')).convert('RGBA'))
BG = [(0, 91, 91), (64, 128, 128), (0, 72, 74)]


def cell(x, y, w=48, h=48):
    a = sheet[y:y + h, x:x + w].copy()
    for c in BG:
        a[np.all(a[:, :, :3] == c, axis=2)] = 0
    return a


ANIMS = {
    # Eggman zweeft: de Egg Mobile wiebelt een beetje (zelfde frame, 1 px op en neer doet de code)
    'idle':   ([cell(5, 16)], 1, -1),
    'attack': ([cell(5, 272), cell(58, 272), cell(5, 272), cell(58, 272)], 8, 0),     # lachen
    'turn':   ([cell(5, 80), cell(58, 80), cell(111, 80)], 10, 0),
    'hurt':   ([cell(5, 144)], 1, 0),
    'spin':   ([cell(5, 208), cell(58, 208), cell(111, 208), cell(164, 208)], 14, -1),  # zware klap: tolt rond
    'missile': ([cell(136, 336, 16, 16)], 1, -1),
    'puff':   ([cell(x, 336, 16, 16) for x in (5, 26, 47, 68, 89, 110)], 18, 0),
    'bomb':   ([cell(x, 400, 16, 16) for x in (5, 26, 48, 69, 90, 111, 132, 153)], 16, -1),
}

frames, anims = {}, {}
cw, ch = 48, 48
keys = [(n, i, f) for n, (fr, _, _) in ANIMS.items() for i, f in enumerate(fr)]
cols = 8
atlas = np.zeros((((len(keys) + cols - 1) // cols) * ch, cols * cw, 4), np.uint8)
for idx, (name, i, f) in enumerate(keys):
    x, y = (idx % cols) * cw, (idx // cols) * ch
    h, w = f.shape[:2]
    # 48x48-frames vullen de cel; projectielen in het midden
    ox, oy = x + (cw - w) // 2, y + (ch - h) // 2 if h < ch else y
    atlas[oy:oy + h, ox:ox + w] = f
    frames[f'eggman_{name}_{i}'] = {'frame': {'x': x, 'y': y, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                                    'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
for name, (fr, fps, rep) in ANIMS.items():
    anims[name] = {'key': f'eggman_{name}', 'frames': [f'eggman_{name}_{i}' for i in range(len(fr))], 'frameRate': fps, 'repeat': rep}
Image.fromarray(atlas).save(os.path.join(OUT, 'eggman.png'))
json.dump({'frames': frames, 'meta': {'image': 'eggman.png', 'size': {'w': atlas.shape[1], 'h': atlas.shape[0]}, 'scale': '1',
           'credits': 'Eggman from Sonic Battle: Death Egg rip by SkyLights, organized by Dinoshi 64'}},
          open(os.path.join(OUT, 'eggman.json'), 'w'), indent=1)
json.dump(anims, open(os.path.join(OUT, 'eggman_anims.json'), 'w'), indent=1)
print('eggman atlas', atlas.shape)

# icoontje (Sonic Battle-life icon) in de ui-atlas, voor de boss-balk
ui_png, ui_json = os.path.join(OUT, 'ui', 'ui.png'), os.path.join(OUT, 'ui', 'ui.json')
ui = np.array(Image.open(ui_png).convert('RGBA'))
uj = json.load(open(ui_json))
icon = cell(5, 432, 16, 16)
if 'head_eggman' in uj['frames']:
    f = uj['frames']['head_eggman']['frame']
    x, y = f['x'], f['y']
else:
    # rechts naast head_shadow / oneup_shadow (build_shadow.py)
    f = uj['frames']['oneup_shadow']['frame']
    x, y = f['x'] + f['w'] + 2, f['y']
ui[y:y + 16, x:x + 16] = icon
uj['frames']['head_eggman'] = {'frame': {'x': x, 'y': y, 'w': 16, 'h': 16}, 'rotated': False, 'trimmed': False,
                               'spriteSourceSize': {'x': 0, 'y': 0, 'w': 16, 'h': 16}, 'sourceSize': {'w': 16, 'h': 16}}
Image.fromarray(ui).save(ui_png)
json.dump(uj, open(ui_json, 'w'), indent=1)
print('head_eggman done')
