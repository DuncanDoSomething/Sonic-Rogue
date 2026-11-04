"""Tails als gids in de tutorial en bij de tips: het blije portret (duim omhoog) uit de
Sonic Battle-portretten (tools/ref/story_portraits.png).

Gebruik: python3 tools/build_guide.py
Levert src/assets/menu/guide_tails.png op.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sheet = Image.open(os.path.join(ROOT, 'tools', 'ref', 'story_portraits.png')).convert('RGBA')
crop = sheet.crop((15, 147, 75, 205))  # rij TAILS, links: duim omhoog
crop.crop(crop.getbbox()).save(os.path.join(ROOT, 'src', 'assets', 'menu', 'guide_tails.png'))
print('ok')
