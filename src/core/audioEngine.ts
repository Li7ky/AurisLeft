import { usePlayerStore } from '../store/playerStore';
import { PlaybackState } from '../types';

/**
 * Zuoer Audio Engine
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
      usePlayerStore.getState().setPlaybackState(PlaybackState.Paused);
    });

    this.audio.addEventListener('error', (e) => {
      console.error('AudioEngine Error:', e);
      usePlayerStore.getState().setPlaybackState(PlaybackState.Error);
    });
  }

  public async play(url: string) {
    if (this.audio.src !== url) {
      this.audio.src = url;
      this.audio.load();
    }
    await this.audio.play();
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
}

export const audioEngine = AudioEngine.getInstance();
