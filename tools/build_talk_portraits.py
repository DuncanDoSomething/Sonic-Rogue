"""Portretten voor de rival-dialogen, uit de Sonic Battle story-portretten van Bacon (tools/ref/story_portraits.png).

Elk character heeft een paar gezichten; MOODS zegt welk plaatje bij welke stemming hoort.
Gebruik: python3 tools/build_talk_portraits.py  ->  src/assets/menu/talk_<id>_<mood>.png
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sheet = Image.open(os.path.join(ROOT, 'tools', 'ref', 'story_portraits.png')).convert('RGBA')

# (y0, x0, y1, x1) per plaatje op de sheet
BOXES = {
    'sonic':    [(35, 0, 112, 92), (36, 96, 110, 169), (33, 173, 110, 254), (34, 260, 109, 339)],
    'tails':    [(145, 13, 207, 77), (148, 82, 207, 143), (145, 140, 207, 213)],
    'knuckles': [(246, 11, 318, 99), (246, 103, 318, 191), (246, 195, 318, 273)],
    'amy':      [(364, 1, 436, 74), (364, 76, 436, 135), (364, 142, 436, 201), (373, 208, 437, 273)],
    'cream':    [(481, 14, 546, 83), (481, 93, 546, 159), (481, 163, 546, 229)],
    'shadow':   [(598, 3, 675, 82), (598, 90, 675, 164), (590, 174, 675, 260)],
    # Eggman: armen omhoog (boos / opgewonden) en wijzend (normaal / smug); voor het gesprek op wave 90
    'eggman':   [(1098, 0, 1203, 110), (1098, 110, 1203, 215)],
}
# stemming -> plaatje
MOODS = {
    'sonic':    {'normal': 0, 'happy': 0, 'smug': 3, 'angry': 1, 'sad': 2},
    'tails':    {'normal': 0, 'happy': 0, 'smug': 0, 'angry': 2, 'sad': 1},
    'knuckles': {'normal': 0, 'happy': 0, 'smug': 0, 'angry': 1, 'sad': 2},
    'amy':      {'normal': 0, 'happy': 1, 'smug': 0, 'angry': 3, 'sad': 2},
    'cream':    {'normal': 1, 'happy': 0, 'smug': 0, 'angry': 1, 'sad': 2},
    'shadow':   {'normal': 0, 'happy': 0, 'smug': 0, 'angry': 2, 'sad': 1},
    'eggman':   {'normal': 1, 'happy': 0, 'smug': 1, 'angry': 0, 'sad': 0},
}
out = os.path.join(ROOT, 'src', 'assets', 'menu')
for who, boxes in BOXES.items():
    for mood, i in MOODS[who].items():
        y0, x0, y1, x1 = boxes[i]
        crop = sheet.crop((x0, y0, x1, y1))
        crop = crop.crop(crop.getbbox())
        crop.save(os.path.join(out, f'talk_{who}_{mood}.png'))
print('ok')
