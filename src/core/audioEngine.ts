import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { PlaybackState, RepeatMode } from '../types';

/**
 * HTML5 Audio engine for Electron renderer.
 * Uses a generation counter to ignore stale play()/error events when user switches tracks quickly.
 */
class AudioEngine {
  private static instance: AudioEngine;
  private audio: HTMLAudioElement;
  private generation = 0;
  private playToken = 0;
  /** When true, the current play() call owns error reporting */
  private playPromiseActive = false;

  private constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = null;
    // 不带 referrer，减少 CDN 校验失败（主进程 aurisstream 会补 Referer）
    try {
      this.audio.setAttribute('referrerpolicy', 'no-referrer');
    } catch {
      /* ignore */
    }
    this.setupListeners();
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public getGeneration() {
    return this.generation;
  }

  private mediaErrorMessage(): string {
    const err = this.audio.error;
    if (!err) return '音频播放失败';
    switch (err.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        return '播放被中断';
      case MediaError.MEDIA_ERR_NETWORK:
        return '网络错误，音频加载失败';
      case MediaError.MEDIA_ERR_DECODE:
        return '音频解码失败，格式可能不受支持';
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        return '无法播放该音源（链接无效或为付费/下架歌曲）';
      default:
        return err.message || '音频播放失败';
    }
  }

  private setupListeners() {
    this.audio.addEventListener('timeupdate', () => {
      usePlayerStore.getState().updateProgress(this.audio.currentTime, this.audio.duration || 0);
    });

    this.audio.addEventListener('ended', () => {
      const { repeatMode } = usePlayerStore.getState();
      const autoPlayNext = useSettingsStore.getState().autoPlayNext;

      if (repeatMode === RepeatMode.One) {
        void usePlayerStore.getState().next();
        return;
      }
      if (!autoPlayNext) {
        usePlayerStore.getState().setPlaybackState(PlaybackState.Paused);
        return;
      }
      void usePlayerStore.getState().next();
    });

    this.audio.addEventListener('playing', () => {
      usePlayerStore.getState().setPlaybackState(PlaybackState.Playing);
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
        usePlayerStore
          .getState()
          .updateProgress(this.audio.currentTime, this.audio.duration);
      }
    });

    this.audio.addEventListener('pause', () => {
      const state = usePlayerStore.getState().playbackState;
      if (state === PlaybackState.Playing) {
        usePlayerStore.getState().setPlaybackState(PlaybackState.Paused);
      }
    });

    this.audio.addEventListener('error', () => {
      // Ignore errors from aborted/replaced loads
      if (this.audio.error?.code === MediaError.MEDIA_ERR_ABORTED) return;
      // play() promise path will report the same failure — avoid double auto-skip
      if (this.playPromiseActive) return;
      const message = this.mediaErrorMessage();
      void usePlayerStore.getState().handlePlaybackError(message);
    });
  }

  public async play(url: string) {
    if (!url) {
      if (this.audio.paused && this.audio.src) {
        await this.audio.play();
      }
      return;
    }

    const token = ++this.playToken;
    this.generation += 1;
    this.playPromiseActive = true;

    // Stop current playback cleanly before switching
    try {
      this.audio.pause();
    } catch {
      /* ignore */
    }

    this.audio.removeAttribute('src');
    this.audio.load();

    this.audio.src = url;
    this.audio.load();

    // Wait until we can play, or fail with a clear error
    try {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error(this.mediaErrorMessage()));
        };
        const cleanup = () => {
          this.audio.removeEventListener('canplay', onReady);
          this.audio.removeEventListener('error', onError);
        };
        this.audio.addEventListener('canplay', onReady, { once: true });
        this.audio.addEventListener('error', onError, { once: true });

        // Timeout — some streams never fire canplay
        window.setTimeout(() => {
          if (token !== this.playToken) return;
          cleanup();
          // try play anyway
          resolve();
        }, 8000);
      });

      if (token !== this.playToken) {
        return;
      }

      try {
        await this.audio.play();
      } catch (err) {
        if (token !== this.playToken) return;
        const name = err instanceof Error ? err.name : '';
        const message = err instanceof Error ? err.message : String(err);
        // User switched tracks mid-play — ignore AbortError / interrupted
        if (
          name === 'AbortError' ||
          /interrupted by a new load request/i.test(message) ||
          /The play\(\) request was interrupted/i.test(message)
        ) {
          return;
        }
        throw new Error(message.replace(/https?:\/\/\S+/g, '').trim() || '播放失败');
      }
    } finally {
      if (token === this.playToken) {
        this.playPromiseActive = false;
      }
    }
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
    if (Number.isFinite(time) && time >= 0) {
      try {
        this.audio.currentTime = time;
      } catch {
        /* ignore */
      }
    }
  }

  public setVolume(volume: number) {
    if (volume >= 0 && volume <= 1) {
      this.audio.volume = volume;
    }
  }

  public getVolume() {
    return this.audio.volume;
  }

  /**
   * Gradual fade then pause (sleep timer). Restores engine volume to target after pause.
   */
  public async fadeOutAndPause(durationMs = 2000, restoreVolume = 0.8) {
    const start = this.audio.volume;
    const steps = 20;
    const stepMs = Math.max(40, Math.floor(durationMs / steps));
    for (let i = 1; i <= steps; i++) {
      this.audio.volume = Math.max(0, start * (1 - i / steps));
      await new Promise((r) => setTimeout(r, stepMs));
    }
    this.audio.pause();
    this.audio.volume = Math.min(1, Math.max(0, restoreVolume));
  }

  public get currentSrc() {
    return this.audio.src;
  }
}

export const audioEngine = AudioEngine.getInstance();
