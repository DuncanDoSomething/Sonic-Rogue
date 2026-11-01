"""Extra item-monitors voor de rewards (Sonic Advance 3, ripped by Spitfya).

Gebruik: python3 tools/build_monitors.py <243037.png> src/assets/menu
Slaat elke monitor op als losse afbeelding mon_<naam>.png (key = bestandsnaam, net als de andere menu-plaatjes).
De gewone monitors (rings, shield, thunder...) zitten al in de UI-atlas (tools/build_ui.py).
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA'))
ROWS = {
    # blauwe monitors: wervelwind, maan, pijlen, glinster, uitroepteken
    (190, 226): ['tornado', 'moon', 'swap', 'sparkle', 'alert'],
    # rode (slechte) monitors; de laatste is Eggman
    (226, 262): ['bad2', 'bad3', 'badswirl', 'badmoon', 'eggman'],
}
for (y0, y1), names in ROWS.items():
    sub = a[y0:y1, 0:200]
    lab, _ = ndimage.label(sub[:, :, 3] > 0)
    boxes = sorted((s[1].start, s[0].start, s[1].stop, s[0].stop) for s in ndimage.find_objects(lab)
                   if (s[1].stop - s[1].start) >= 20 and (s[0].stop - s[0].start) >= 20)
    for name, (x0, by0, x1, by1) in zip(names, boxes):
        c = sub[by0:by1, x0:x1].copy()
        key = c[0, 0, :3].copy()                      # groen vakje -> transparant
        c[np.all(c[:, :, :3] == key, axis=2)] = 0
        im = Image.fromarray(c)
        im = im.crop(im.getbbox())
        im.save(os.path.join(out, f'mon_{name}.png'))
        print(name, im.size)
