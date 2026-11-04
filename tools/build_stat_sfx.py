"""Stat omhoog / omlaag-geluidjes (eigen chiptune-sweeps, Pokémon-achtig): public/audio/sfx/statup.mp3 en statdown.mp3.

Gebruik: python3 tools/build_stat_sfx.py   (heeft ffmpeg nodig)
Vervang ze gerust door echte samples met dezelfde naam.
"""
import os, subprocess, tempfile, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RATE = 22050


def sweep(f0, f1, dur, duty=0.5, vol=0.28):
    t = np.arange(int(RATE * dur)) / RATE
    f = f0 * (f1 / f0) ** (t / dur)               # exponentiële glijtoon
    phase = np.cumsum(f) / RATE
    sq = np.where((phase % 1) < duty, 1.0, -1.0)
    env = np.minimum(1, t / 0.01) * np.minimum(1, (dur - t) / 0.03)
    return sq * env * vol


def save(name, sig):
    pcm = (np.clip(sig, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'x.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.tobytes())
        out = os.path.join(ROOT, 'public', 'audio', 'sfx', f'{name}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-b:a', '64k', out], check=True)


gap = np.zeros(int(RATE * 0.02))
# omhoog: drie snelle stijgende tonen, steeds hoger
up = np.concatenate([sweep(400 * 1.26 ** i, 800 * 1.26 ** i, 0.09, 0.25) for i in range(3)] + [gap])
# omlaag: twee dalende tonen, steeds lager
down = np.concatenate([sweep(700 / 1.26 ** i, 260 / 1.26 ** i, 0.13, 0.5) for i in range(2)] + [gap])
save('statup', up)
save('statdown', down)
print('ok')
