"""Geluidjes voor de moves: een swoosh (zwaai/draai) en een harde klap: public/audio/sfx/whoosh.mp3 en punch.mp3.

Gebruik: python3 tools/build_move_sfx.py   (heeft ffmpeg nodig)
Zelfgemaakt met ruis en een lage toon (geen samples). Vervang ze gerust door echte geluiden met dezelfde naam.
"""
import os, subprocess, tempfile, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RATE = 22050
rng = np.random.default_rng(7)


def save(name, sig):
    sig = sig / max(1e-6, np.abs(sig).max()) * 0.8
    pcm = (np.clip(sig, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'x.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.tobytes())
        out = os.path.join(ROOT, 'public', 'audio', 'sfx', f'{name}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-b:a', '64k', out], check=True)


def lowpass(x, cutoff):
    """Eenvoudig één-pool laagdoorlaatfilter met een cutoff die per sample mag verschuiven."""
    cutoff = np.broadcast_to(cutoff, x.shape)
    a = 1 - np.exp(-2 * np.pi * cutoff / RATE)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


# swoosh: ruis waarvan de klank omhoog en weer omlaag zwiept, zacht in en uit
dur = 0.28
t = np.arange(int(RATE * dur)) / RATE
shape = np.sin(np.pi * t / dur) ** 2
whoosh = lowpass(rng.standard_normal(len(t)), 300 + 2600 * shape) * shape
save('whoosh', whoosh)

# klap: korte tik (ruis) bovenop een lage dreun die snel zakt
dur = 0.32
t = np.arange(int(RATE * dur)) / RATE
thump = np.sin(2 * np.pi * np.cumsum(140 * np.exp(-t * 9) + 45) / RATE) * np.exp(-t * 11)
crack = lowpass(rng.standard_normal(len(t)), 3500) * np.exp(-t * 45)
save('punch', thump * 0.9 + crack * 0.7)
print('ok')
