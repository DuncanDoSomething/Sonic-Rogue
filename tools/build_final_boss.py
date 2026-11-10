"""Eindbaas (Super Egg Robo Z, Sonic Advance 2, rip van SkyLights) en de eind-plaatjes (Sonic Advance 3, rip van EternalLight).

Gebruik: python3 tools/build_final_boss.py <7135.png> <7156.png>
Maakt:
  src/assets/eggrobo.png/.json/_anims.json  robot + hoofdjes (normaal, geraakt, kapot) en raketten
  src/assets/bg/space_final.png             de aarde vanuit de ruimte (achtergrond van het laatste gevecht)
  src/assets/menu/ending_*.png              groepsfoto (kleur en sepia), 4 panelen en CONGRATULATIONS!!
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'src', 'assets')
robo_path, end_path = sys.argv[1:3]


def keyed(img, colors, tol=0):
    a = np.array(img.convert('RGBA')).astype(int)
    m = np.zeros(a.shape[:2], bool)
    for c in colors:
        m |= np.all(np.abs(a[:, :, :3] - np.array(c)) <= tol, axis=2)
    a[m, 3] = 0
    return Image.fromarray(a.astype('uint8'))


robo = keyed(Image.open(robo_path), [(255, 255, 255)])
# de rip is heel groot (135 px op een scherm van 270): netjes verkleinen (Lanczos, harde alpha-rand)
SCALE = 0.78
def shrink(img):
    out = img.resize((round(img.width * SCALE), round(img.height * SCALE)), Image.LANCZOS)
    a = np.array(out)
    a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
    return Image.fromarray(a)

body = robo.crop((145, 1, 229, 124))
HEADS = {'idle': (249, 10, 291, 46), 'hurt': (247, 48, 289, 85), 'broken': (248, 88, 291, 126)}
HEAD_AT = (20, -12)   # waar het hoofd op de romp zit (met de hand gepast)
W, H = body.width, body.height - HEAD_AT[1]
frames, sheet_parts = {}, []
for name, box in HEADS.items():
    f = Image.new('RGBA', (W, H))
    f.alpha_composite(body, (0, -HEAD_AT[1]))
    f.alpha_composite(robo.crop(box), (HEAD_AT[0], 0))
    sheet_parts.append((f'eggrobo_{name}_0', shrink(f)))
MISSILES = [(12, 77, 55, 105), (77, 77, 120, 105), (10, 116, 56, 146), (75, 116, 121, 146)]
for i, box in enumerate(MISSILES):
    sheet_parts.append((f'eggrobo_missile_{i}', shrink(robo.crop(box))))
sw = sum(p.width for _, p in sheet_parts) + len(sheet_parts) * 2
sh = max(p.height for _, p in sheet_parts)
sheet = Image.new('RGBA', (sw, sh))
x = 0
for name, p in sheet_parts:
    sheet.alpha_composite(p, (x, 0))
    frames[name] = {'frame': {'x': x, 'y': 0, 'w': p.width, 'h': p.height}, 'rotated': False, 'trimmed': False,
                    'spriteSourceSize': {'x': 0, 'y': 0, 'w': p.width, 'h': p.height}, 'sourceSize': {'w': p.width, 'h': p.height}}
    x += p.width + 2
sheet.save(os.path.join(A, 'eggrobo.png'))
# los hoofdje voor de BOSS-banner en de run summary
robo.crop(HEADS['idle']).save(os.path.join(A, 'menu', 'head_eggrobo.png'))
json.dump({'frames': frames, 'meta': {'image': 'eggrobo.png', 'size': {'w': sw, 'h': sh}, 'scale': '1',
           'credits': 'Super Egg Robo Z (Sonic Advance 2) ripped by SkyLights'}}, open(os.path.join(A, 'eggrobo.json'), 'w'), indent=1)
anims = {n: {'key': f'eggrobo_{n}', 'frames': [f'eggrobo_{n}_0'], 'frameRate': 1, 'repeat': -1} for n in HEADS}
anims['missile'] = {'key': 'eggrobo_missile', 'frames': [f'eggrobo_missile_{i}' for i in range(len(MISSILES))], 'frameRate': 12, 'repeat': -1}
json.dump(anims, open(os.path.join(A, 'eggrobo_anims.json'), 'w'), indent=1)
Image.open(robo_path).convert('RGB').crop((10, 225, 266, 385)).save(os.path.join(A, 'bg', 'space_final.png'))

end = Image.open(end_path).convert('RGB')
M = os.path.join(A, 'menu')
end.crop((8, 176, 248, 336)).save(os.path.join(M, 'ending_group.png'))
end.crop((256, 176, 496, 336)).save(os.path.join(M, 'ending_sepia.png'))
for i, x0 in enumerate([8, 176, 344, 512]):
    end.crop((x0, 344, x0 + 160, 408)).save(os.path.join(M, f'ending_panel_{i}.png'))
keyed(end.crop((504, 592, 680, 608)), [(0, 184, 168)], tol=24).save(os.path.join(M, 'ending_congrats.png'))
print('ok', sw, sh, W, H)
