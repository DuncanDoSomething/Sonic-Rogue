"""Tails als gids in de tutorial en bij de tips, uit de Sonic Battle-portretten (tools/ref/story_portraits.png).

Gebruik: python3 tools/build_guide.py
Levert src/assets/menu/guide_tails.png (blij, duim omhoog) en guide_tails_serious.png (serieus, vuist) op.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sheet = Image.open(os.path.join(ROOT, 'tools', 'ref', 'story_portraits.png')).convert('RGBA')
for name, box in [('guide_tails', (15, 147, 75, 205)), ('guide_tails_serious', (142, 147, 211, 205))]:
    crop = sheet.crop(box)
    crop.crop(crop.getbbox()).save(os.path.join(ROOT, 'src', 'assets', 'menu', f'{name}.png'))
print('ok')
