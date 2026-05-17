import { usePlayerStore } from '../store/playerStore';
import { PlaybackState } from '../types';

/**
 * AurisLeft Audio Engine
 * 用于封装 HTML5 Audio 实例，并与 playerStore 进行状态同步。
 * 在无 Tauri 后端或播放网络流时使用此引擎。
 */
class AudioEngine {
  private static instance: AudioEngine;
  private audio: HTMLAudioElement;

  private constructor() {
    this.audio = new Audio();
    this.setupListeners();
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private setupListeners() {
    this.audio.addEventListener('timeupdate', () => {
      usePlayerStore.getState().updateProgress(this.audio.currentTime, this.audio.duration || 0);
    });

    this.audio.addEventListener('ended', () => {
      usePlayerStore.getState().next();
    });

    this.audio.addEventListener('playing', () => {
      usePlayerStore.getState().setPlaybackState(PlaybackState.Playing);
    });

    this.audio.addEventListener('pause', () => {
      // Only set to Paused if we're not seeking/loading
      const state = usePlayerStore.getState().playbackState;
      if (state === PlaybackState.Playing) {
        usePlayerStore.getState().setPlaybackState(PlaybackState.Paused);
      }
    });

    this.audio.addEventListener('error', () => {
      const message = this.audio.error?.message ?? 'HTML5 Audio playback failed';
      usePlayerStore.getState().handlePlaybackError(message);
    });
  }

  public async play(url: string) {
    if (!url) {
      // Empty URL means resume — don't change src
      if (this.audio.paused && this.audio.src) {
        await this.audio.play();
      }
      return;
    }
    try {
      const newSrc = new URL(url, window.location.origin).href;
      const currentSrc = this.audio.src;
      if (currentSrc !== newSrc) {
        this.audio.src = url;
        this.audio.load();
      }
    } catch {
      // Relative URL fallback
      if (this.audio.src !== url) {
        this.audio.src = url;
        this.audio.load();
      }
    }
    await this.audio.play();
  }

  public async resume() {
    if (this.audio.paused && this.audio.src) {
      await this.audio.play();
    }
  }

  public pause() {
    this.audio.pause();
  }

  public seek(time: number) {
    if (this.audio.duration && time >= 0 && time <= this.audio.duration) {
      this.audio.currentTime = time;
    }
  }

  public setVolume(volume: number) {
    if (volume >= 0 && volume <= 1) {
      this.audio.volume = volume;
    }
  }

  public get currentSrc() {
    return this.audio.src;
  }
}

export const audioEngine = AudioEngine.getInstance();
