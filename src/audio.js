'use strict';

const AUDIO_FILES = {
  tap: 'assets/audio/tap.wav',
  place: 'assets/audio/place.wav',
  pack: 'assets/audio/pack.wav',
  combo: 'assets/audio/combo.wav',
  rare: 'assets/audio/rare.wav',
  win: 'assets/audio/win.wav',
  fail: 'assets/audio/fail.wav'
};

class AudioManager {
  constructor(platform, preferences) {
    this.platform = platform;
    this.soundEnabled = preferences.soundEnabled !== false;
    this.musicEnabled = preferences.musicEnabled !== false;
    this.effects = {};
    this.bgm = null;
    this.unlocked = false;
    this._prepare();
  }

  _prepare() {
    Object.keys(AUDIO_FILES).forEach((name) => {
      const audio = this.platform.createInnerAudioContext();
      if (!audio) return;
      audio.src = AUDIO_FILES[name];
      audio.volume = name === 'tap' ? 0.35 : 0.62;
      audio.obeyMuteSwitch = false;
      this.effects[name] = audio;
    });

    this.bgm = this.platform.createInnerAudioContext();
    if (this.bgm) {
      this.bgm.src = 'assets/audio/bgm.wav';
      this.bgm.loop = true;
      this.bgm.volume = 0.17;
      this.bgm.obeyMuteSwitch = false;
    }
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.musicEnabled) this.playMusic();
  }

  play(name) {
    if (!this.soundEnabled) return;
    const audio = this.effects[name];
    if (!audio) return;
    try {
      audio.stop();
      audio.seek(0);
      audio.play();
    } catch (_) {}
  }

  playMusic() {
    if (!this.musicEnabled || !this.bgm || !this.unlocked) return;
    try { this.bgm.play(); } catch (_) {}
  }

  pauseMusic() {
    if (!this.bgm) return;
    try { this.bgm.pause(); } catch (_) {}
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = Boolean(enabled);
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = Boolean(enabled);
    if (this.musicEnabled) this.playMusic();
    else this.pauseMusic();
  }
}

module.exports = {
  AudioManager
};
