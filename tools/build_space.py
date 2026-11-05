"""Ruimte-achtergronden voor de main bosses: X-Zone (Sonic Advance) en XX (Sonic Advance 2).

Gebruik: python3 tools/build_space.py "<map 'Sonic rogue sprites'>" src/assets

Bronnen (ripped by Παρατηρητής): stage backgrounds/7087.png (X-Zone) en 134189.png (XX).
Elke achtergrond bestaat uit twee strips: sterren bovenaan en de aarde (X-Zone) of wolken (XX) eronder.
"""
import os, sys
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
BG = os.path.join(SRC, 'stage backgrounds')
STRIPS = {
    'xzone_top': ('7087.png', (24, 226, 320, 286)),
    'xzone_bottom': ('7087.png', (24, 294, 320, 418)),
    'xx_top': ('134189.png', (24, 194, 280, 290)),
    'xx_bottom': ('134189.png', (24, 298, 280, 378)),
}
for key, (name, box) in STRIPS.items():
    Image.open(os.path.join(BG, name)).convert('RGBA').crop(box).save(os.path.join(OUT, 'bg', f'{key}.png'))
    print(key, box)
