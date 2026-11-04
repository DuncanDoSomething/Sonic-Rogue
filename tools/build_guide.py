"""Tails als gids in de tutorial: drie uitdrukkingen uit de Sonic Battle-portretten (tools/ref/story_portraits.png).

Gebruik: python3 tools/build_guide.py
Levert src/assets/menu/guide_tails_0.png (praten), _1 (wijzen) en _2 (juichen) op.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sheet = Image.open(os.path.join(ROOT, 'tools', 'ref', 'story_portraits.png')).convert('RGBA')
# rij TAILS: links, midden, rechts
for i, box in enumerate([(15, 147, 75, 205), (84, 150, 141, 205), (142, 147, 211, 205)]):
    crop = sheet.crop(box)
    crop.crop(crop.getbbox()).save(os.path.join(ROOT, 'src', 'assets', 'menu', f'guide_tails_{i}.png'))
print('ok')
