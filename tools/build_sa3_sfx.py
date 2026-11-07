"""Zet de Sonic Advance 3-geluiden (rip van Mr Lange, "Sonic Sounds Complete") om naar de mp3's van de game.

De rip noemt de bestanden alleen naar hun nummer (SA3_116.wav). Welk nummer wat is komt uit de
SA3-decompilatie (github.com/SAT-R/sa3, include/constants/songs.h): SE_JUMP = 0x74 = 116, enz.

Gebruik: python3 tools/build_sa3_sfx.py "<map met SA3_*.wav>"   (heeft ffmpeg nodig)
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'audio', 'sfx')

# game-naam: (SA3-nummer, naam in de decompilatie, max lengte in s of None, fade-out in s, volume)
SOUNDS = {
    'whoosh':      (121, 'SE_TAILS__TAIL_HIT', None, 0, 1.0),        # korte zwiep (staartslag)
    'punch':       (533, 'SE_533 (Knuckles)', None, 0, 1.0),         # Knuckles' klap
    'spinrelease': (110, 'SE_SPIN_RELEASE', None, 0, 1.0),           # Spin Dash loslaten
    'dash':        (112, 'SE_112 (boost)', None, 0, 1.0),            # Sonic's boost / homing-sprint
    'tailsfly':    (120, 'SE_TAILS__FLYING', 1.4, 0.4, 0.9),         # Tails' propeller (stuk van de loop)
    'piko':        (129, 'SE_AMY__PIKO_PIKO_NEUTRAL_AIR', None, 0, 1.0),
    'amyspin':     (131, 'SE_AMY__DOWN_B', None, 0, 0.9),            # Amy's hamer-draai
    'cheese':      (528, 'SE_CREAM__CHEESE_ATTACK', None, 0, 1.0),
    'creamfly':    (227, 'SE_CREAM__FLYING', None, 0, 1.0),
    'shield':      (151, 'SE_SHIELD_ACTIVATE', None, 0, 1.0),
    'spikes':      (154, 'SE_SPIKES', None, 0, 1.0),
    'speedup':     (155, 'SE_SPEED_BOOSTER', 0.8, 0.3, 1.0),
    'charge':      (540, 'SE_TAG_ACTION_CHARGING', 1.6, 0.3, 1.0),   # opladen (Copter Octo, Shell Tank)
    'charged':     (539, 'SE_TAG_ACTION_CHARGED', None, 0, 0.8),
    'freeze':      (586, 'SE_ICE_SPIKE', None, 0, 1.0),
    'charslide':   (103, 'SE_CHARSELECT_SLIDE', None, 0, 1.0),
}


def build(src):
    for name, (num, what, maxdur, fade, vol) in SOUNDS.items():
        wav = os.path.join(src, f'SA3_{num}.wav')
        filters = [f'volume={vol}']
        if maxdur:
            filters.insert(0, f'atrim=0:{maxdur}')
            if fade:
                filters.append(f'afade=t=out:st={maxdur - fade}:d={fade}')
        out = os.path.join(OUT, f'{name}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', ','.join(filters),
                        '-ac', '1', '-ar', '44100', '-b:a', '80k', out], check=True)
        print(f'{name:12s} <- SA3_{num} ({what})')


if __name__ == '__main__':
    build(sys.argv[1])
