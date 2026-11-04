"""Bouwt alles voor Shadow: battle-atlas, effecten, Super Shadow, cut-in, portret, character select en icoontjes.

Gebruik: python3 tools/build_shadow.py "<map 'Sonic rogue sprites'>" src/assets

Bronnen:
- character sprites/Shadow/10045.png: Shadow uit Sonic Battle (ripped by QuadFactor), kijkt op de sheet naar RECHTS
- character sprites/Shadow/18232.png: Super Shadow battle style (Shadow Mastah, voor het Pixeltendo Sonic Battle Project)
- character sprites/10822.png: Sonic Battle story-portretten (Bacon), voor het character select-portret
- het Advance 3-life icon (head_shadow) is het Sonic-icoon in Shadow's kleuren

Alles wordt gespiegeld zodat het naar LINKS kijkt, net als de Advance 3-sprites van de rest (zie build_atlas.py).
Shadow heeft geen Advance 3-sprites: zijn character select-plaatjes (naamring, banner, naam) worden hier
in Advance 3-stijl nagemaakt.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
SHEET = os.path.join(SRC, 'character sprites', 'Shadow', '10045.png')
SUPER = os.path.join(SRC, 'character sprites', 'Shadow', '18232.png')
STORY = os.path.join(SRC, 'character sprites', '10822.png')
MENU = os.path.join(OUT, 'menu')

# ------------------------------------------------------------------ 1. sprites op de Sonic Battle-sheet vinden
sb = np.array(Image.open(SHEET).convert('RGBA'))
for c in [(0, 112, 112), (0, 72, 72)]:           # teal achtergrond en de donkere effect-vakjes
    sb[np.all(sb[:, :, :3] == c, axis=2)] = 0
alpha = sb[:, :, 3] > 0
lab, _ = ndimage.label(ndimage.binary_dilation(alpha, iterations=2))
boxes = []
for i, s in enumerate(ndimage.find_objects(lab)):
    real = alpha[s] & (lab[s] == i + 1)
    if real.sum() < 30:
        continue
    ys, xs = np.nonzero(real)
    boxes.append((s[1].start + xs.min(), s[0].start + ys.min(), s[1].start + xs.max() + 1, s[0].start + ys.max() + 1, i + 1))
boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
rows = []
for b in boxes:
    cy = (b[1] + b[3]) / 2
    if rows and abs(cy - rows[-1]['cy']) < 14:
        rows[-1]['b'].append(b)
        rows[-1]['cy'] = np.mean([(x[1] + x[3]) / 2 for x in rows[-1]['b']])
    else:
        rows.append({'cy': cy, 'b': [b]})
rows = [sorted(r['b'], key=lambda b: b[0]) for r in rows]


def anchor(img):
    """Midden van het grootste losse stuk (het lichaam), zodat vuur of stof de uitlijning niet verschuift."""
    a = np.array(img)
    body, nb = ndimage.label(a[:, :, 3] > 0)
    if nb == 0:
        return img.width / 2
    sizes = ndimage.sum(np.ones_like(body), body, range(1, nb + 1))
    bx = np.nonzero(body == int(np.argmax(sizes)) + 1)[1]
    return (bx.min() + bx.max() + 1) / 2


def crop(r, c):
    x0, y0, x1, y1, lid = rows[r][c]
    spr = sb[y0:y1, x0:x1].copy()
    spr[lab[y0:y1, x0:x1] != lid] = 0
    img = Image.fromarray(np.ascontiguousarray(spr[:, ::-1]))   # spiegelen: kijkt nu naar links
    img.info['anchor_x'] = anchor(img)
    return img


# ------------------------------------------------------------------ 2. battle-atlas (zelfde opzet als build_atlas.py)
ANIMS = {
    'idle':     {'frames': [(0, c) for c in range(6)], 'fps': 8, 'repeat': -1},
    # kijkt even naar zijn handschoen (Inhibitor Ring) en dan weer voor zich uit
    'wait':     {'frames': [(13, 0, 300), (13, 2, 160), (13, 3, 900), (13, 2, 160), (13, 0, 200)], 'repeat': 0},
    # salto (Sonic Battle-Shadow rolt niet op als een bal)
    'spin':     {'frames': [(7, 2), (7, 3), (7, 4), (7, 5)], 'fps': 20, 'repeat': -1},
    # skaten op zijn Air Shoes, met vuur onder de zolen
    'run':      {'frames': [(2, c) for c in range(5, 15)], 'fps': 18, 'repeat': -1},
    'hurt':     {'frames': [(39, 0), (39, 1)], 'fps': 8, 'repeat': 0},
    'ko':       {'frames': [(39, 1, 120), (41, 0, 120), (41, 1, 140), (43, 0, 140), (43, 2, 600)], 'repeat': 0},
    # draait zich om naar de camera: "Hmph."
    'victory':  {'frames': [(1, 0, 110), (1, 1, 110), (1, 2, 900)], 'repeat': 0},
    # combo voor Chaos Control
    'chop':     {'frames': [(14, c) for c in range(6)], 'fps': 20, 'repeat': 0},
    'kick':     {'frames': [(15, c) for c in range(8)], 'fps': 20, 'repeat': 0},
    'backkick': {'frames': [(16, c) for c in range(9)], 'fps': 20, 'repeat': 0},
    # wegteleporteren en weer verschijnen (Chaos Control)
    'tpout':    {'frames': [(29, 4), (29, 5), (29, 6), (29, 7)], 'fps': 16, 'repeat': 0},
    'tpin':     {'frames': [(29, 8), (29, 9), (29, 10), (29, 11)], 'fps': 16, 'repeat': 0},
    # handen bij elkaar, chaos-energie opladen
    'charge':   {'frames': [(29, c) for c in range(12, 21)], 'fps': 14, 'repeat': -1},
    # Chaos Spear: hand naar achteren, dan gooien
    'throw':    {'frames': [(26, 0, 70), (26, 1, 70), (26, 2, 70), (26, 3, 70), (26, 4, 120), (26, 9, 200), (26, 10, 160)], 'repeat': 0},
}

used = {}
for an in ANIMS.values():
    for f in an['frames']:
        used[f[:2]] = crop(*f[:2])

PAD = 2
half = max(max(i.info['anchor_x'], i.width - i.info['anchor_x']) for i in used.values())
cw = int(np.ceil(half)) * 2 + PAD * 2
ch = max(i.height for i in used.values()) + PAD * 2
cols = 8
keys = list(used.keys())
atlas = Image.new('RGBA', (cols * cw, ((len(keys) + cols - 1) // cols) * ch), (0, 0, 0, 0))
frames = {}
for idx, rc in enumerate(keys):
    spr = used[rc]
    cx, cy = (idx % cols) * cw, (idx // cols) * ch
    atlas.alpha_composite(spr, (cx + int(round(cw / 2 - spr.info['anchor_x'])), cy + ch - PAD - spr.height))
    frames[f'shadow_{rc[0]}_{rc[1]}'] = {'frame': {'x': cx, 'y': cy, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                                         'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
atlas.save(os.path.join(OUT, 'shadow.png'))
json.dump({'frames': frames, 'meta': {'image': 'shadow.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1',
           'credits': 'Shadow from Sonic Battle, ripped by QuadFactor'}}, open(os.path.join(OUT, 'shadow.json'), 'w'), indent=1)


def frame_entry(f):
    key = f'shadow_{f[0]}_{f[1]}'
    return {'frame': key, 'duration': f[2] - 1} if len(f) == 3 else key


json.dump({name: {'key': f'shadow_{name}', 'frames': [frame_entry(f) for f in an['frames']],
                  'frameRate': an.get('fps', 1000), 'repeat': an['repeat']} for name, an in ANIMS.items()},
          open(os.path.join(OUT, 'shadow_anims.json'), 'w'), indent=1)
print('shadow atlas', atlas.size, 'cell', cw, ch, 'frames', len(frames))

# ------------------------------------------------------------------ 3. effecten en Super Shadow (eigen atlas 'shadowfx')
ss = np.array(Image.open(SUPER).convert('RGBA'))
SS_BG = [(90, 56, 49), (192, 192, 192)]


def key_out(a, bgs):
    a = a.copy()
    for c in bgs:
        a[np.all(a[:, :, :3] == c, axis=2)] = 0
    return a


def tidy(a, min_px=6):
    """Losse spikkeltjes (stukjes van de vakjes-rand) weghalen."""
    lb, n = ndimage.label(a[:, :, 3] > 0)
    for i in range(1, n + 1):
        if (lb == i).sum() < min_px:
            a[lb == i] = 0
    return a


def box(a, rect, bgs, mirror=True):
    x0, y0, x1, y1 = rect
    sub = tidy(key_out(a[y0:y1, x0:x1], bgs))
    ys, xs = np.nonzero(sub[:, :, 3])
    sub = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(np.ascontiguousarray(sub[:, ::-1] if mirror else sub))


def sb_fx(r, c):
    """Effect van de Sonic Battle-sheet (niet spiegelen; richting regelt de code)."""
    x0, y0, x1, y1, lid = rows[r][c]
    spr = sb[y0:y1, x0:x1].copy()
    spr[lab[y0:y1, x0:x1] != lid] = 0
    return Image.fromarray(spr)


FX = {}
def fx(name, frames, fps, repeat=0, anchor='center'):
    FX[name] = {'frames': frames, 'fps': fps, 'repeat': repeat, 'anchor': anchor}

# Super Shadow (kijkt na spiegelen naar links, net als Shadow)
top = [(3, 6, 36, 44), (39, 18, 70, 44), (73, 15, 104, 44), (107, 11, 142, 44), (145, 6, 185, 48), (188, 12, 221, 44),
       (224, 13, 257, 44), (260, 8, 287, 44), (290, 10, 321, 48), (324, 8, 346, 44), (348, 2, 381, 45), (383, 4, 414, 43),
       (417, 4, 450, 43), (453, 4, 484, 43), (487, 4, 520, 43)]
T = [box(ss, r, SS_BG) for r in top]
fx('ssh_transform', [T[7], T[8], T[9], T[11], T[12], T[13], T[14]], 10, 0, 'bottom')
fx('ssh_idle', [box(ss, (280, 44, 307, 86), SS_BG), box(ss, (307, 44, 334, 86), SS_BG)], 5, -1, 'bottom')
fx('ssh_dash', [box(ss, (246, 318, 280, 341), SS_BG), box(ss, (283, 318, 317, 341), SS_BG)], 14, -1)
fx('ssh_combo', [box(ss, r, SS_BG) for r in [(282, 849, 317, 884), (320, 851, 348, 884), (350, 851, 385, 884),
                                             (388, 851, 418, 884), (421, 853, 452, 884), (455, 848, 485, 884)]], 18, 0, 'bottom')
# gouden chaos-speren van Super Shadow, en de Chaos Blast-explosie
fx('ssh_spear', [box(ss, r, SS_BG, False) for r in [(55, 667, 97, 699), (100, 665, 146, 699), (150, 660, 196, 700),
                                                    (201, 660, 248, 700), (251, 660, 299, 700)]], 20, -1)
fx('ssh_boom', [box(ss, r, SS_BG, False) for r in [(43, 984, 90, 1021), (94, 986, 137, 1021), (140, 958, 188, 1021),
                                                   (191, 958, 237, 1021), (240, 958, 284, 1021), (287, 958, 331, 1021)]], 12, 0, 'bottom')
# Chaos Spear (gewone Shadow): lans in de vlucht, dan uiteenspatten
fx('sh_spear', [sb_fx(28, c) for c in range(1, 7)], 20, -1)
fx('sh_spear_hit', [sb_fx(28, c) for c in range(6, 11)], 18, 0)
# chaos-runen (Roaming Chaos): blauw = Chaos Control, roze = het Pierced-merkteken
fx('sh_rune_blue', [sb_fx(38, 8)], 1, -1)
fx('sh_rune_pink', [sb_fx(38, 11)], 1, -1)
fx('sh_burst', [sb_fx(38, 12)], 1, -1)
fx('sh_orb', [sb_fx(38, 16), sb_fx(38, 18)], 6, -1)

PADF = 1
cells = []
for name, an in FX.items():
    fr = an['frames']
    fw = max(f.width for f in fr) + PADF * 2
    fh = max(f.height for f in fr) + PADF * 2
    for i, f in enumerate(fr):
        cells.append((f'{name}_{i}', f, fw, fh, an['anchor']))
WF = 512
x = y = row_h = 0
place = []
for key, f, fw, fh, anc in cells:
    if x + fw > WF:
        x, y, row_h = 0, y + row_h, 0
    place.append((key, f, x, y, fw, fh, anc))
    x += fw
    row_h = max(row_h, fh)
fxa = Image.new('RGBA', (WF, y + row_h), (0, 0, 0, 0))
fxframes = {}
for key, f, cx, cy, fw, fh, anc in place:
    px = cx + (fw - f.width) // 2
    py = cy + (fh - f.height) // 2 if anc == 'center' else cy + fh - PADF - f.height
    fxa.alpha_composite(f, (px, py))
    fxframes[key] = {'frame': {'x': cx, 'y': cy, 'w': fw, 'h': fh}, 'rotated': False, 'trimmed': False,
                     'spriteSourceSize': {'x': 0, 'y': 0, 'w': fw, 'h': fh}, 'sourceSize': {'w': fw, 'h': fh}}
fxa.save(os.path.join(OUT, 'shadowfx.png'))
json.dump({'frames': fxframes, 'meta': {'image': 'shadowfx.png', 'size': {'w': fxa.width, 'h': fxa.height}, 'scale': '1',
           'credits': 'Shadow effects from Sonic Battle (QuadFactor); Super Shadow by Shadow Mastah (Pixeltendo Sonic Battle Project)'}},
          open(os.path.join(OUT, 'shadowfx.json'), 'w'), indent=1)
json.dump({name: {'key': name, 'frames': [f'{name}_{i}' for i in range(len(an['frames']))],
                  'frameRate': an['fps'], 'repeat': an['repeat']} for name, an in FX.items()},
          open(os.path.join(OUT, 'shadowfx_anims.json'), 'w'), indent=1)
print('shadowfx atlas', fxa.size, {k: len(v['frames']) for k, v in FX.items()})

# ------------------------------------------------------------------ 4. cut-in: de Super Shadow-artwork
art = box(ss, (14, 866, 100, 952), SS_BG, False)
os.makedirs(os.path.join(OUT, 'cutin'), exist_ok=True)
art.save(os.path.join(OUT, 'cutin', 'shadow.png'))


def flood_clear(a, tol=10):
    """Achtergrond weg via flood fill vanaf de randen (wit mag binnen de sprite blijven, zoals handschoenen)."""
    bg = a[0, 0, :3].astype(int)
    near = (np.abs(a[:, :, :3].astype(int) - bg).sum(2) <= tol) & (a[:, :, 3] > 0)
    lb, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lb[0], lb[-1], lb[:, 0], lb[:, -1]]))) - {0}
    out = a.copy()
    out[np.isin(lb, list(edge))] = 0
    return out


def keep_largest(a):
    lb, n = ndimage.label(a[:, :, 3] > 0)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lb), lb, range(1, n + 1))
        a = a.copy()
        a[(lb != int(np.argmax(sizes)) + 1)] = 0
    return a


def trim(img):
    return img.crop(img.getbbox())

# ------------------------------------------------------------------ 5. portret naast de HP-box: Sonic Battle-storyportret, verkleind naar 40 px
story = np.array(Image.open(STORY).convert('RGBA'))
bust = trim(Image.fromarray(keep_largest(flood_clear(story[592:680, 4:94]))))
bust = bust.resize((round(bust.width * 40 / bust.height), 40), Image.BOX)
b = np.array(bust)
b[:, :, 3] = np.where(b[:, :, 3] > 110, 255, 0)
Image.fromarray(b).save(os.path.join(MENU, 'portrait_shadow.png'))

# ------------------------------------------------------------------ 6. character select (Advance 3-stijl)
cs_art = trim(Image.fromarray(flood_clear(story[592:680, 170:268])))
cs_art.save(os.path.join(MENU, 'cs_art_shadow.png'))

# naam in het kleine Advance 3-lettertype: zwart met grijze randjes op wit. H, D en W bestaan niet
# op de sheet en zijn in dezelfde stijl nagetekend (W = een omgekeerde M).
GLYPHS = {
    'S': ['+#####', '######', '##....', '#####+', '+#####', '...+##', '######', '#####+'],
    'H': ['##..##', '##..##', '##..##', '######', '######', '##..##', '##..##', '##..##'],
    'A': ['..###..', '..###..', '.+#.#+.', '.+#.#+.', '+#####+', '+#####+', '+##.##+', '+##.##+'],
    'D': ['#####+', '##++##', '##..##', '##..##', '##..##', '##..##', '##++##', '#####+'],
    'O': ['+####+', '##++##', '#+..+#', '#+..+#', '#+..+#', '#+..+#', '##++##', '+####+'],
    'W': ['##.#.##', '##.#.##', '##+#+##', '#######', '#######', '###+###', '###.###', '##+.+##'],
}
INK = {'#': (0, 0, 0, 255), '+': (104, 104, 104, 255), '.': (248, 248, 248, 255)}
word = 'SHADOW'
wid = sum(len(GLYPHS[ch][0]) for ch in word) + len(word) - 1 + 2
name = Image.new('RGBA', (wid, 10), (248, 248, 248, 255))
px = name.load()
x = 1
for ch in word:
    g = GLYPHS[ch]
    for yy, line in enumerate(g):
        for xx, c in enumerate(line):
            px[x + xx, 1 + yy] = INK[c]
    x += len(g[0]) + 1
for cx, cy in [(0, 0), (wid - 1, 0), (0, 9), (wid - 1, 9)]:
    px[cx, cy] = (0, 0, 0, 0)
name.save(os.path.join(MENU, 'cs_name_shadow.png'))

# banner: die van Knuckles, rood wordt zwart en rood (zijn stekels)
ban = np.array(Image.open(os.path.join(MENU, 'cs_banner_knuckles.png')).convert('RGBA'))
light, dark = np.all(ban[:, :, :3] == (248, 0, 0), axis=2), np.all(ban[:, :, :3] == (176, 0, 0), axis=2)
ban[light, :3] = (72, 72, 88)
ban[dark, :3] = (24, 24, 32)
# één rode streep door het midden
mid = ban.shape[0] // 2
for yy in (mid - 1, mid):
    row = light[yy] | dark[yy]
    ban[yy, row, :3] = (216, 24, 32)
Image.fromarray(ban).save(os.path.join(MENU, 'cs_banner_shadow.png'))

# naamring: drie keer SHADOW rond een cirkel, wit met een grijze rand (zoals de Advance 3-ringen)
FONT = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc', 18)
R = 39
S = 108
ring = Image.new('RGBA', (S, S), (0, 0, 0, 0))


def letter(ch):
    im = Image.new('L', (30, 30), 0)
    ImageDraw.Draw(im).text((15, 15), ch, font=FONT, fill=255, anchor='mm')
    m = np.array(im) > 110
    ys, xs = np.nonzero(m)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


glyph = {ch: letter(ch) for ch in set(word)}
widths = [glyph[ch].shape[1] for ch in word]
span = sum(widths) + (len(word) - 1) * 0.5            # lengte van het woord over de cirkel (px)
fill = np.zeros((S, S), bool)
for rep in range(3):
    start = rep * 120 - math.degrees(span / R) / 2     # gecentreerd rond 0/120/240 graden
    pos = 0.0
    for ch, w in zip(word, widths):
        g = glyph[ch]
        ang = math.radians(start + math.degrees((pos + w / 2) / R))
        im = Image.fromarray((g * 255).astype(np.uint8)).rotate(-math.degrees(ang), resample=Image.NEAREST, expand=True)
        m = np.array(im) > 0
        cx = S / 2 + math.sin(ang) * R
        cy = S / 2 - math.cos(ang) * R
        x0, y0 = int(round(cx - m.shape[1] / 2)), int(round(cy - m.shape[0] / 2))
        fill[y0:y0 + m.shape[0], x0:x0 + m.shape[1]] |= m
        pos += w + 0.5
outline = ndimage.binary_dilation(fill, iterations=2) & ~fill
rg = np.zeros((S, S, 4), np.uint8)
rg[outline] = (120, 120, 120, 255)
rg[fill] = (248, 248, 248, 255)
trim(Image.fromarray(rg)).save(os.path.join(MENU, 'cs_ring_shadow.png'))

# ------------------------------------------------------------------ 7. icoontjes in de ui-atlas: head_shadow en oneup_shadow
# Advance 3-life icon nagetekend: het Sonic-icoon met Shadow's kleuren (zwart met rode strepen)
ui_png, ui_json = os.path.join(OUT, 'ui', 'ui.png'), os.path.join(OUT, 'ui', 'ui.json')
ui = np.array(Image.open(ui_png).convert('RGBA'))
uj = json.load(open(ui_json))


def get(name):
    f = uj['frames'][name]['frame']
    return ui[f['y']:f['y'] + f['h'], f['x']:f['x'] + f['w']].copy()


head = get('head_sonic')
BLUE = np.all(head[:, :, :3] == (0, 33, 156), axis=2)
head[BLUE, :3] = (72, 72, 92)
# rode streep over de bovenkant van elke stekel
for (yy, xx) in [(4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (5, 7), (5, 8), (7, 2), (7, 3), (7, 4), (12, 2), (12, 3), (12, 4)]:
    if BLUE[yy, xx]:
        head[yy, xx, :3] = (216, 24, 32)
oneup = get('oneup_sonic')
# het icoon zit midden in de monitor: zoek het Sonic-icoon en vervang het
hs = get('head_sonic')
best = None
for yy in range(oneup.shape[0] - 15):
    for xx in range(oneup.shape[1] - 15):
        d = np.abs(oneup[yy:yy + 16, xx:xx + 16, :3].astype(int) - hs[:, :, :3].astype(int)).sum()
        if best is None or d < best[0]:
            best = (d, yy, xx)
_, oy, ox = best
inner = (hs[:, :, 3] > 0)
patch = oneup[oy:oy + 16, ox:ox + 16]
patch[inner] = head[inner]

# nieuwe rij onderaan de atlas (of dezelfde plek als ze er al staan)
add = {'head_shadow': head, 'oneup_shadow': oneup}
y_new = ui.shape[0]
if 'head_shadow' in uj['frames']:
    y_new = uj['frames']['head_shadow']['frame']['y']
need = y_new + max(v.shape[0] for v in add.values())
if need > ui.shape[0]:
    ui = np.concatenate([ui, np.zeros((need - ui.shape[0], ui.shape[1], 4), np.uint8)])
x = 0
for k, v in add.items():
    ui[y_new:y_new + v.shape[0], x:x + v.shape[1]] = v
    uj['frames'][k] = {'frame': {'x': x, 'y': y_new, 'w': v.shape[1], 'h': v.shape[0]}, 'rotated': False, 'trimmed': False,
                       'spriteSourceSize': {'x': 0, 'y': 0, 'w': v.shape[1], 'h': v.shape[0]},
                       'sourceSize': {'w': v.shape[1], 'h': v.shape[0]}}
    x += v.shape[1] + 2
uj['meta']['size'] = {'w': ui.shape[1], 'h': ui.shape[0]}
Image.fromarray(ui).save(ui_png)
json.dump(uj, open(ui_json, 'w'), indent=1)
print('menu + icons done')
