import Phaser from 'phaser';
import { settings } from './data/settings';

// ---------------------------------------------------------------------------
// Geluid. Muziek streamt via <audio> (snel starten, niet alles vooraf decoderen);
// korte geluiden (SFX en stemmen) gaan via Phaser en worden in de BootScene geladen.
// Alle bestanden staan in public/audio/ en worden met een relatief pad geladen.
// ---------------------------------------------------------------------------

const BASE = 'audio/';

/** Muziek per scherm/zone. Ontbrekende tracks vallen terug op 'fallback'. */
export const MUSIC = {
  title: 'music/title.mp3',
  charselect: 'music/charselect.mp3',
  charselect2: 'music/charselect2.mp3',
  route99: 'music/route99.mp3',
  sunset: 'music/sunset.mp3',
  toy: 'music/toy.mp3',
  twinkle: 'music/twinkle.mp3',
  leafforest: 'music/leafforest.mp3',
  hotcrater: 'music/hotcrater.mp3',
  musicplant: 'music/musicplant.mp3',
  iceparadise: 'music/iceparadise.mp3',
  skycanyon: 'music/skycanyon.mp3',
  boss: 'music/boss.mp3',
  eggman: 'music/eggman.mp3',
  victory: 'music/victory.mp3',
} as const;
export type MusicKey = keyof typeof MUSIC;

export const SFX_FILES = [
  'back', 'bigexplosion', 'bosshit', 'confirm', 'confirm2', 'cursormove', 'enemyhit', 'errorclick',
  'explosion', 'explosion2', 'heal1', 'hurtrings', 'jump', 'levelup', 'monitorbreak', 'ringchime',
  'ringcollect', 'spindash', 'statup', 'statdown',
] as const;
export type SfxKey = typeof SFX_FILES[number];

export const VOICE_FILES = [
  'sonicalright', 'sonicyeah', 'tailsalright', 'tailsyeah', 'knucklesalright', 'knucklescool',
  'creamalright', 'creamyeah', 'amywohoo', 'amyyeah', 'eggmanow',
  'call_sonic', 'call_tails', 'call_knuckles', 'call_cream', 'call_amy',
] as const;

/** Laadt alle korte geluiden in de BootScene. */
export function preloadSounds(scene: Phaser.Scene) {
  for (const k of SFX_FILES) scene.load.audio(`sfx_${k}`, `${BASE}sfx/${k}.mp3`);
  for (const k of VOICE_FILES) scene.load.audio(`voice_${k}`, `${BASE}voice/${k}.mp3`);
}

class AudioManager {
  private game?: Phaser.Game;
  private music?: HTMLAudioElement;
  private musicKey?: MusicKey;
  private fadeTimer?: number;
  private pending = false;
  private lastPlayed: Record<string, number> = {};
  private jingle?: HTMLAudioElement;

  init(game: Phaser.Game) {
    this.game = game;
    // eerste klik/toets: muziek die nog niet mocht starten alsnog starten
    const unlock = () => { if (this.pending) this.music?.play().then(() => { this.pending = false; }).catch(() => {}); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private get musicVol() { return settings.musicVolume / 10 * 0.6; }
  private get sfxVol() { return settings.sfxVolume / 10; }

  /** Start een track (met korte crossfade). Zelfde track = niks doen. */
  playMusic(key: MusicKey, loop = true) {
    if (this.musicKey === key && this.music && (!this.music.paused || this.pending)) return;
    this.stopJingle();
    this.stopMusic(250);
    const el = new Audio(BASE + MUSIC[key]);
    el.loop = loop;
    el.volume = 0;
    this.music = el;
    this.musicKey = key;
    el.play().catch(() => { this.pending = true; });
    this.fadeTo(el, this.musicVol, 300);
  }

  stopMusic(fadeMs = 300) {
    const el = this.music;
    if (!el) return;
    this.music = undefined;
    this.musicKey = undefined;
    this.fadeTo(el, 0, fadeMs, () => { el.pause(); el.src = ''; });
  }

  /** Jingle (bijv. victory) en daarna de vorige track weer verder. */
  playJingle(key: MusicKey, then?: MusicKey) {
    const resume = then ?? this.musicKey;
    this.stopMusic(150);
    this.stopJingle();
    const el = new Audio(BASE + MUSIC[key]);
    el.volume = this.musicVol;
    this.jingle = el;
    el.play().catch(() => {});
    el.onended = () => {
      if (this.jingle === el) this.jingle = undefined;
      // alleen verder spelen als er intussen niet al een nieuwe track is gestart
      if (resume && !this.music) this.playMusic(resume);
    };
  }

  private stopJingle() {
    if (!this.jingle) return;
    this.jingle.pause();
    this.jingle.src = '';
    this.jingle = undefined;
  }

  /** Springt in de lopende track naar `seconds` (alleen vooruit), bijv. bij het skippen van de intro. */
  seekMusic(key: MusicKey, seconds: number) {
    const el = this.music;
    if (!el || this.musicKey !== key) return;
    const go = () => { if (el.currentTime < seconds) el.currentTime = Math.min(seconds, (el.duration || seconds) - 0.1); };
    if (el.readyState >= 1) go();
    else el.addEventListener('loadedmetadata', go, { once: true });
  }

  /** Volume van de lopende muziek bijwerken (na Settings). */
  refreshVolume() {
    if (this.fadeTimer) window.clearInterval(this.fadeTimer);
    if (this.music) this.music.volume = this.musicVol;
    if (this.jingle) this.jingle.volume = this.musicVol;
  }

  private fadeTo(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
    if (this.fadeTimer && el === this.music) window.clearInterval(this.fadeTimer);
    const from = el.volume;
    const steps = Math.max(1, Math.round(ms / 30));
    let i = 0;
    const t = window.setInterval(() => {
      i++;
      el.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) { window.clearInterval(t); done?.(); }
    }, 30);
    if (el === this.music) this.fadeTimer = t;
  }

  /** Kort geluid. `throttle` voorkomt dat hetzelfde geluid tientallen keren tegelijk speelt. */
  sfx(key: SfxKey, opts: { volume?: number; rate?: number; throttle?: number } = {}) {
    this.playKey(`sfx_${key}`, opts);
  }

  /** Stemmen onderbreken elkaar (snel door het select-scherm scrollen = geen koor). */
  voice(key: typeof VOICE_FILES[number], volume = 1) {
    const k = `voice_${key}`;
    if (!this.game || !this.game.cache.audio.exists(k) || this.sfxVol <= 0) return;
    try {
      this.lastVoice?.stop();
      this.lastVoice?.destroy();
      this.lastVoice = this.game.sound.add(k, { volume: volume * this.sfxVol });
      this.lastVoice.play();
    } catch { /* negeren */ }
  }
  private lastVoice?: Phaser.Sound.BaseSound;

  private playKey(key: string, opts: { volume?: number; rate?: number; throttle?: number }) {
    if (!this.game || !this.game.cache.audio.exists(key) || this.sfxVol <= 0) return;
    const now = performance.now();
    if (opts.throttle && now - (this.lastPlayed[key] ?? 0) < opts.throttle) return;
    this.lastPlayed[key] = now;
    try {
      this.game.sound.play(key, { volume: (opts.volume ?? 1) * this.sfxVol, rate: opts.rate ?? 1 });
    } catch { /* geluid mag nooit de game laten crashen */ }
  }
}

export const audio = new AudioManager();
