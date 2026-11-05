"""Spin-bal voor Knuckles en Shadow: Sonic's Advance 3-bal in hun kleuren.

Gebruik: python3 tools/build_balls.py src/assets

Knuckles' Advance 3-sheet heeft geen echte bal (zijn spin is een salto) en Shadow komt uit Sonic Battle
(daar rolt hij niet op). Zo rollen ze allebei net als de rest. De animatie heet 'knuckles_spin' en
'shadow_spin' en vervangt die uit hun eigen atlas (zie GIF_IDLES in BootScene).
"""
import json, os, sys
import numpy as np
from PIL import Image

OUT = sys.argv[1]
sonic = np.array(Image.open(os.path.join(OUT, 'sonic.png')).convert('RGBA'))
sj = json.load(open(os.path.join(OUT, 'sonic.json')))['frames']
sa = json.load(open(os.path.join(OUT, 'sonic_anims.json')))['spin']

LIGHT, MID, DARK = (0, 64, 232), (0, 32, 152), (0, 0, 96)
SHOE, SHOE_LIGHT = (168, 0, 0), (248, 32, 32)

PALETTES = {
    # rood lichaam, groen-witte schoenen
    'knuckles': {LIGHT: (248, 40, 24), MID: (184, 0, 8), DARK: (104, 0, 16), SHOE: (0, 136, 56), SHOE_LIGHT: (72, 216, 104)},
    # zwart-grijs lichaam met rode strepen (zie hieronder), rood-witte schoenen blijven
    'shadow': {LIGHT: (88, 88, 112), MID: (48, 48, 64), DARK: (20, 20, 32)},
}
STRIPE = (224, 24, 32)

for char, pal in PALETTES.items():
    frames = []
    for name in sa['frames']:
        r = sj[name]['frame']
        a = sonic[r['y']:r['y'] + r['h'], r['x']:r['x'] + r['w']].copy()
        src = a.copy()
        for c_from, c_to in pal.items():
            a[np.all(src[:, :, :3] == c_from, axis=2), :3] = c_to
        if char == 'shadow':
            # Shadow's rode strepen: de lichte rand van de bal (de stekels die je ziet draaien)
            light = np.all(src[:, :, :3] == LIGHT, axis=2)
            ys, xs = np.nonzero(src[:, :, 3])
            cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
            yy, xx = np.indices(light.shape)
            # alleen lichte pixels aan de buitenkant van de bal (niet in het midden)
            rim = light & (np.hypot(yy - cy, xx - cx) > (ys.max() - ys.min()) * 0.32)
            a[rim, :3] = STRIPE
        frames.append(a)
    h, w = frames[0].shape[:2]
    sheet = np.concatenate(frames, axis=1)
    tex = f'{char}ball'
    Image.fromarray(sheet).save(os.path.join(OUT, f'{char}_ball.png'))
    json.dump({'frames': {f'{tex}_{i}': {'frame': {'x': i * w, 'y': 0, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
                                         'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}}
                          for i in range(len(frames))},
               'meta': {'image': f'{char}_ball.png', 'size': {'w': sheet.shape[1], 'h': h}, 'scale': '1'}},
              open(os.path.join(OUT, f'{char}_ball.json'), 'w'), indent=1)
    step = round(1000 / sa['frameRate'])
    json.dump({'key': f'{char}_spin', 'texture': tex, 'repeat': -1,
               'frames': [{'frame': f'{tex}_{i}', 'duration': step} for i in range(len(frames))]},
              open(os.path.join(OUT, f'{char}_ball_anim.json'), 'w'), indent=1)
    print(char, sheet.shape)
