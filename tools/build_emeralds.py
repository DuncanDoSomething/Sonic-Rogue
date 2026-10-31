"""Haalt de 7 Chaos Emeralds (elk 8 glim-frames) uit de Chao Garden sheet.
Gebruik: python3 build_emeralds.py chao_garden.png out_dir"""
import sys, os, json, numpy as np
from PIL import Image
from collections import Counter
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA'))[762:1002, 334:594].copy()
bgs = [c for c, _ in Counter(map(tuple, a[:, :, :3].reshape(-1, 3))).most_common(3)]
m = np.ones(a.shape[:2], bool)
for c in bgs:
    m &= np.any(a[:, :, :3] != c, axis=2)
lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=1))
objs = []
for i, s in enumerate(ndimage.find_objects(lab)):
    part = m[s] & (lab[s] == i + 1)
    if part.sum() < 40:
        continue
    spr = a[s].copy(); spr[~part] = 0
    objs.append(((s[0].start + s[0].stop) / 2, s[1].start, spr))
objs.sort(key=lambda o: (int(o[0] // 34.4), o[1]))
assert len(objs) == 56, len(objs)
cw = max(o[2].shape[1] for o in objs); ch = max(o[2].shape[0] for o in objs)
atlas = Image.new('RGBA', (cw * 8, ch * 7), (0, 0, 0, 0))
frames = {}
names = ['red', 'blue', 'yellow', 'green', 'white', 'cyan', 'purple']
for k, (_, _, spr) in enumerate(objs):
    r, c = divmod(k, 8)
    im = Image.fromarray(spr)
    x, y = c * cw + (cw - im.width) // 2, r * ch + (ch - im.height) // 2
    atlas.alpha_composite(im, (x, y))
    frames[f'emerald_{names[r]}_{c}'] = {'frame': {'x': c * cw, 'y': r * ch, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                                         'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
os.makedirs(out, exist_ok=True)
atlas.save(os.path.join(out, 'emeralds.png'))
json.dump({'frames': frames, 'meta': {'image': 'emeralds.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1',
           'credits': 'Sonic Advance 3 Chao Garden, ripped by Spitfya and Roj'}}, open(os.path.join(out, 'emeralds.json'), 'w'), indent=1)
print('emeralds', atlas.size, 'cell', cw, ch)
