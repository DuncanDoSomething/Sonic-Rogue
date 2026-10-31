"""Sonic's idle uit een referentie-GIF (Advance 3-sprites, 8x vergroot, met de originele uitlijning en timing).

Gebruik: python3 tools/build_sonic_idle.py tools/ref/sonic_amy_idle.gif src/assets

Waarom niet uit de sheet: op de sheet staat elk frame los, zonder vaste positie. Uitlijnen op het midden
van de sprite liet zijn lichaam verspringen als zijn voet of hand bewoog. In de GIF staan de frames precies
zoals in de game, dus hier houden we hun onderlinge positie exact aan (geen uitlijning per frame).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageSequence
from scipy import ndimage

src, out_dir = sys.argv[1], sys.argv[2]
SCALE = 8
PAD = 2

gif = Image.open(src)
raw = [(np.array(f.convert('RGBA')), f.info.get('duration', 30)) for f in ImageSequence.Iterator(gif)]

# raster-offset: kleurgrenzen vallen op een vaste plek binnen elke 8x8-cel
def grid_offset(a, axis):
    d = np.any(np.diff(a[:, :, :3].astype(int), axis=axis) != 0, axis=2)
    pos = np.nonzero(d)[1 - axis] + 1
    return int(np.bincount(pos % SCALE, minlength=SCALE).argmax())

ox, oy = grid_offset(raw[0][0], 1), grid_offset(raw[0][0], 0)
small = [(a[oy + SCALE // 2::SCALE, ox + SCALE // 2::SCALE].copy(), d) for a, d in raw]

# Sonic staat links: alles links van de eerste lege kolom tussen hem en Amy (over alle frames)
alpha = np.stack([s[:, :, 3] > 0 for s, _ in small])
cols = alpha.any(axis=(0, 1))
filled = np.nonzero(cols)[0]
left = filled[0]
gap = next(x for x in range(left + 10, len(cols)) if not cols[x])
sonic = [(s[:, :gap], d) for s, d in small]

# dubbele frames achter elkaar samenvoegen (duur optellen)
frames = []
for s, d in sonic:
    if frames and np.array_equal(frames[-1][0], s):
        frames[-1][1] += d
    else:
        frames.append([s, d])
if len(frames) > 1 and np.array_equal(frames[0][0], frames[-1][0]):
    frames[0][1] += frames.pop()[1]

# gezamenlijke bbox: alle frames krijgen dezelfde uitsnede, dus dezelfde onderlinge positie
union = np.any(np.stack([f[0][:, :, 3] > 0 for f in frames]), axis=0)
ys, xs = np.nonzero(union)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
crops = [np.ascontiguousarray(f[0][y0:y1, x0:x1][:, ::-1]) for f in frames]  # spiegelen: de sheet kijkt naar links

# anker = midden van het lichaam in het eerste frame, zodat hij op dezelfde plek staat als in de andere animaties
first = crops[0][:, :, 3] > 0
lab, n = ndimage.label(first)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
bx = np.nonzero(lab == int(np.argmax(sizes)) + 1)[1]
anchor = (bx.min() + bx.max() + 1) / 2
w, h = crops[0].shape[1], crops[0].shape[0]
half = int(np.ceil(max(anchor, w - anchor)))
cw, ch = half * 2 + PAD * 2, h + PAD * 2
px = int(round(cw / 2 - anchor))

atlas = Image.new('RGBA', (cw * len(crops), ch), (0, 0, 0, 0))
data = {}
for i, c in enumerate(crops):
    atlas.alpha_composite(Image.fromarray(c), (i * cw + px, PAD))
    data[f'sonicidle_{i}'] = {'frame': {'x': i * cw, 'y': 0, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                              'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
atlas.save(os.path.join(out_dir, 'sonic_idle.png'))
json.dump({'frames': data, 'meta': {'image': 'sonic_idle.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'}},
          open(os.path.join(out_dir, 'sonic_idle.json'), 'w'), indent=1)
json.dump({'key': 'sonic_idle', 'frames': [{'frame': f'sonicidle_{i}', 'duration': int(d)} for i, (_, d) in enumerate(frames)]},
          open(os.path.join(out_dir, 'sonic_idle_anim.json'), 'w'), indent=1)
print('frames', len(frames), 'cell', cw, ch, 'loop ms', sum(d for _, d in frames))
