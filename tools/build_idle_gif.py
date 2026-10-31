"""Idle-animatie van een character uit een referentie-GIF (Advance 3-sprites, 8x vergroot, met de
originele uitlijning en timing).

Gebruik: python3 tools/build_idle_gif.py <character> <gif> <out_dir> [--mirror]
Bijv.:   python3 tools/build_idle_gif.py sonic tools/ref/sonic_idle.gif src/assets --mirror
         python3 tools/build_idle_gif.py amy tools/ref/amy_idle.gif src/assets

--mirror: de GIF kijkt naar rechts; de sheets (en dus de game) gaan uit van links.

Waarom niet uit de sheet: daar staat elk frame los, zonder vaste positie, en uitlijnen per frame liet het
lichaam verspringen als een voet of hand bewoog. In de GIF staan de frames zoals in de game, dus hier blijft
hun onderlinge positie exact behouden. Levert <char>_idle.png/.json en <char>_idle_anim.json op.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageSequence
from scipy import ndimage

char, src, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
mirror = '--mirror' in sys.argv
SCALE = 8
PAD = 2

gif = Image.open(src)
raw = [(np.array(f.convert('RGBA')), f.info.get('duration', 90)) for f in ImageSequence.Iterator(gif)]


def grid_offset(a, axis):
    """Kleurgrenzen vallen op een vaste plek binnen elke 8x8-cel."""
    d = np.any(np.diff(a.astype(int), axis=axis) != 0, axis=2)
    pos = np.nonzero(d)[1 - axis] + 1
    return int(np.bincount(pos % SCALE, minlength=SCALE).argmax())


ox, oy = grid_offset(raw[0][0], 1), grid_offset(raw[0][0], 0)
frames = []
for a, d in raw:
    s = a[oy + SCALE // 2::SCALE, ox + SCALE // 2::SCALE].copy()
    if frames and np.array_equal(frames[-1][0], s):
        frames[-1][1] += d          # dubbel frame: duur optellen
    else:
        frames.append([s, d])

# één uitsnede voor alle frames, zodat hun onderlinge positie gelijk blijft
union = np.any(np.stack([f[0][:, :, 3] > 0 for f in frames]), axis=0)
ys, xs = np.nonzero(union)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
crops = [f[0][y0:y1, x0:x1] for f in frames]
if mirror:
    crops = [np.ascontiguousarray(c[:, ::-1]) for c in crops]

# anker = midden van het lichaam in het eerste frame (net als bij de andere animaties)
lab, n = ndimage.label(crops[0][:, :, 3] > 0)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
bx = np.nonzero(lab == int(np.argmax(sizes)) + 1)[1]
anchor = (bx.min() + bx.max() + 1) / 2
w, h = crops[0].shape[1], crops[0].shape[0]
half = int(np.ceil(max(anchor, w - anchor)))
cw, ch = half * 2 + PAD * 2, h + PAD * 2
px = int(round(cw / 2 - anchor))

key = f'{char}idle'
atlas = Image.new('RGBA', (cw * len(crops), ch), (0, 0, 0, 0))
data = {}
for i, c in enumerate(crops):
    atlas.alpha_composite(Image.fromarray(c), (i * cw + px, PAD))
    data[f'{key}_{i}'] = {'frame': {'x': i * cw, 'y': 0, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                          'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
atlas.save(os.path.join(out_dir, f'{char}_idle.png'))
json.dump({'frames': data, 'meta': {'image': f'{char}_idle.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'}},
          open(os.path.join(out_dir, f'{char}_idle.json'), 'w'), indent=1)
json.dump({'key': f'{char}_idle', 'texture': key,
           'frames': [{'frame': f'{key}_{i}', 'duration': int(d)} for i, (_, d) in enumerate(frames)]},
          open(os.path.join(out_dir, f'{char}_idle_anim.json'), 'w'), indent=1)
print(char, 'frames', len(frames), 'cell', cw, ch, 'loop ms', sum(d for _, d in frames))
