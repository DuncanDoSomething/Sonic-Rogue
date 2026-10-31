"""Bouwt de menu/intro-assets (title screen, character select) uit de sheets in de sprite-map.

Gebruik: python3 build_menu.py <map met sheets> <out_dir>

cut(): snijdt een rechthoek, maakt alle kleuren die op de rand van die rechthoek voorkomen
(de achtergrond- en vakjeskleuren van de sheet) transparant, en trimt de lege randen.
Extra kleuren die weg moeten kun je met `remove` meegeven.
"""
import json, os, sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
_cache = {}


def sheet(name):
    if name not in _cache:
        _cache[name] = np.array(Image.open(os.path.join(src, name)).convert('RGBA'))
    return _cache[name]


def cut(name, rect, remove=(), keep_border=False, trim=True):
    x0, y0, x1, y1 = rect
    a = sheet(name)[y0:y1, x0:x1].copy()
    cols = set()
    if not keep_border:
        border = np.concatenate([a[0, :, :3], a[-1, :, :3], a[:, 0, :3], a[:, -1, :3]])
        cols |= set(map(tuple, border))
    cols |= set(remove)
    for c in cols:
        a[np.all(a[:, :, :3] == c, axis=2)] = 0
    a[a[:, :, 3] == 0] = 0
    im = Image.fromarray(a)
    if trim:
        bb = im.getbbox()
        if bb:
            im = im.crop(bb)
    return im


def save(im, key):
    im.save(os.path.join(out, key + '.png'))
    print(key, im.size)


A2 = 'char_198004.png'   # Sonic Advance 2 title + main menu
CS = 'char_7151.png'     # Sonic Advance 3 character select
CS2 = 'char_7106.png'    # Sonic Advance 2 character select
LB = (0, 111, 191)       # lichtblauw vlak achter de A2-labels
CUT = (147, 187, 236)    # lichtblauwe uitsnij-kleur rond de A3 character-select sprites
GREEN = (58, 111, 51)    # groene vakjes op de A3 select-sheet
DB = (0, 74, 127)        # donkerblauwe balk achter de A2-labels

# ---- title screen (Advance 2)
save(cut(A2, (24, 120, 280, 632), keep_border=True, trim=False), 'title_sky')
save(cut(A2, (590, 215, 770, 248), remove=[LB, DB], keep_border=True), 'label_press_start')
for i, nm in enumerate(['game_start', 'time_attack', 'options']):
    y = 745 + i * 18
    save(cut(A2, (600, y, 740, y + 18), remove=[LB, DB], keep_border=True), f'label_{nm}')
    save(cut(A2, (600, y + 72, 740, y + 90), remove=[LB, DB], keep_border=True), f'label_{nm}_on')

# ---- character select (Advance 3)
save(cut(CS, (0, 1, 240, 161), keep_border=True, trim=False), 'cs_sand')
save(cut(CS, (240, 0, 360, 160), keep_border=True, trim=False), 'cs_green')
names = ['sonic', 'tails', 'knuckles', 'cream', 'amy', 'unknown', 'ok']
for i, nm in enumerate(names):
    x = i * 129
    save(cut(CS, (x + 2, 164, x + 127, 289)), f'cs_ring_{nm}')
for i, nm in enumerate(['sonic', 'tails', 'knuckles', 'cream', 'amy', 'unknown']):
    y = 12 + i * 25
    save(cut(CS, (362, y, 426, y + 24), remove=[CUT]), f'cs_banner_{nm}')
    save(cut(CS, (428, y, 492, y + 24), remove=[CUT, GREEN]), f'cs_name_{nm}')

# portretten: per cel de groene vakjes- en lichtblauwe uitsnijkleur weg
def portrait(cx, cy):
    x, y = cx * 129, 692 + cy * 140
    return cut(CS, (x + 2, y + 2, x + 127, y + 126), remove=[CUT])

for nm, (cx, cy) in {'sonic': (0, 0), 'tails': (2, 0), 'knuckles': (5, 0), 'cream': (0, 1), 'amy': (6, 1)}.items():
    save(portrait(cx, cy), f'cs_art_{nm}')

# ---- character select (Advance 2): blauwe S-tegel en "SELECT A CHARACTER"-pil
save(cut(CS2, (187, 343, 443, 599), keep_border=True, trim=False), 'cs_tile')
save(cut(CS2, (290, 30, 438, 52), remove=[(192, 192, 255)], keep_border=True), 'cs_select_pill')

# ---- effecten voor de battle
SH = 'comm_7153.png'
for i in range(6):
    save(cut(SH, (i * 49 + 1, 51, i * 49 + 46, 96), trim=False), f'fx_shield_{i}')
BAL = 'stag_574677.png'
for r, color in enumerate(['blue', 'yellow', 'red', 'green']):
    for i in range(4):
        x, y = 404 + i * 34, 32 + r * 50
        save(cut(BAL, (x, y, x + 32, y + 48), trim=False), f'fx_balloon_{color}_{i}')
save(cut(A2, (575, 939, 755, 951), remove=[LB, DB], keep_border=True), 'label_tiny_chao_garden')
save(cut(A2, (575, 1011, 755, 1023), remove=[LB, DB], keep_border=True), 'label_tiny_chao_garden_on')


def glyphs(img):
    """Splitst een label in letters op kolommen zonder vulkleur (alleen zwarte rand)."""
    a = np.array(img)
    fill = (a[:, :, 3] > 0) & (a[:, :, :3].sum(2) > 200)
    cols = fill.any(0)
    segs, s = [], None
    for x in range(len(cols) + 1):
        v = x < len(cols) and cols[x]
        if v and s is None:
            s = x
        if not v and s is not None:
            segs.append((max(0, s - 1), min(a.shape[1], x + 1)))
            s = None
    out_g = []
    for x0, x1 in segs:
        g = Image.fromarray(a[:, x0:x1])
        bb = g.getbbox()
        out_g.append(g.crop((0, bb[1], g.width, bb[3])) if bb else g)
    return out_g


def compose(word, sources, key):
    """Bouwt een nieuw label uit letters van bestaande labels, in dezelfde Advance 2-letter."""
    for suffix in ['', '_on']:
        pieces = []
        for ch in word:
            if ch == ' ':
                pieces.append(None)
                continue
            src, idx = sources[ch]
            pieces.append(glyphs(Image.open(os.path.join(out, f'label_{src}{suffix}.png')))[idx])
        h = max(p.height for p in pieces if p)
        w = sum((p.width - 1) if p else 6 for p in pieces) + 1
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        x = 0
        for p in pieces:
            if p is None:
                x += 6
                continue
            im.alpha_composite(p, (x, h - p.height))
            x += p.width - 1
        save(im, f'label_{key}{suffix}')

# CREDITS, opgebouwd uit letters van TIME ATTACK / GAME START / OPTIONS / TINY CHAO GARDEN
compose('CREDITS', {
    'C': ('time_attack', 8), 'R': ('game_start', 7), 'E': ('time_attack', 3),
    'D': ('tiny_chao_garden', 12), 'I': ('time_attack', 1), 'T': ('time_attack', 0), 'S': ('options', 6),
}, 'credits')

# ---- Advance 2-intro (198005): de echte zee-tegel, zon-gloed, lens flares en zeemeeuwen
INTRO = 'char_198005.png'
IDARK = (0, 74, 127)     # donkerblauwe vakjes achter de losse sprites
IPANEL = (0, 148, 255)   # lichtblauw paneel van de sheet
# zee: golfpatroon herhaalt elke 56 px horizontaal en 32 px verticaal -> 224x64 is naadloos
save(cut(INTRO, (24, 640, 248, 704), keep_border=True, trim=False), 'intro_water')
save(cut(INTRO, (300, 324, 540, 484), remove=[IDARK], keep_border=True), 'intro_bloom')
for i, rect in enumerate([(548, 324, 588, 364), (596, 324, 628, 356), (636, 324, 652, 340), (660, 324, 668, 332),
                          (676, 324, 684, 332), (692, 324, 716, 348), (724, 324, 740, 340)]):
    save(cut(INTRO, rect, remove=[IDARK, IPANEL], keep_border=True), f'intro_flare_{i}')
for i, x in enumerate([548, 580]):
    save(cut(INTRO, (x, 396, x + 24, 404), remove=[IDARK, IPANEL], keep_border=True), f'intro_bird_{i}')

# ---- type-icoontjes (Advance 3 monitor-iconen, Spitfya): schoen = Speed, wervelwind = Fly, vuur = Power
for name, (x, y) in {'speed': (114, 66), 'fly': (18, 98), 'power': (98, 66)}.items():
    save(cut('comm_243037.png', (x - 1, y - 1, x + 13, y + 13), keep_border=True, trim=False), f'type_{name}')  # met zwart randje

# ---- portretjes naast je HP-box (Advance 3 cutscene-portretten + losse Tails)
# Het hele portret, verkleind naar 40 px hoog (even hoog als de HP-box). BOX-filter houdt de lijnen
# het netst; daarna de randen weer hard maken (alpha 0 of 255) zodat het pixel-art blijft.
_ps = sheet('cut_7156.png')
_cells = {'sonic': (8, 16, 80, 80), 'knuckles': (584, 16, 656, 80), 'amy': (80, 96, 152, 160), 'cream': (160, 96, 232, 160)}
for _k in ['sonic', 'tails', 'knuckles', 'cream', 'amy']:
    if _k == 'tails':
        _im = Image.open(os.path.join(src, 'tails_port.png')).convert('RGBA')
    else:
        x0, y0, x1, y1 = _cells[_k]
        _a = _ps[y0:y1, x0:x1].copy()
        for _c in [(192, 192, 255), (0, 184, 168), (120, 104, 120)]:  # achtergrond, vakje, schaduw
            _a[np.all(_a[:, :, :3] == _c, axis=2)] = 0
        _im = Image.fromarray(_a)
    _im = _im.crop(_im.getbbox())
    _im = _im.resize((round(_im.width * 40 / _im.height), 40), Image.BOX)
    _a = np.array(_im)
    _a[:, :, 3] = np.where(_a[:, :, 3] > 110, 255, 0)
    save(Image.fromarray(_a), f'portrait_{_k}')
