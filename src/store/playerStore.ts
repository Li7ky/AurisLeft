import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import {
  playSong as tauriPlaySong,
  pausePlayback as tauriPausePlayback,
  resumePlayback as tauriResumePlayback,
  stopPlayback as tauriStopPlayback,
  seekTo as tauriSeekTo,
  setVolume as tauriSetVolume,
} from '../utils/tauri';
import type { Song } from '../types';
import { audioEngine } from '../core/audioEngine';
import { PlaybackState, Quality, RepeatMode } from '../types';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

interface PlaybackProgressEvent {
  elapsed: number;
  total: number;
}

interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  currentIndex: number;
  playbackState: PlaybackState;
  progress: number;
  duration: number;
  volume: number;
  quality: Quality;
  shuffle: boolean;
  repeatMode: RepeatMode;
  error: string | null;
}

type ToastFn = ((message: string, type?: 'success' | 'error' | 'info') => void) | undefined;

interface PlayerActions {
  play: (song: Song, quality?: Quality, toast?: ToastFn, autoSkipOnError?: boolean) => Promise<void>;
  pause: (toast?: ToastFn) => Promise<void>;
  resume: (toast?: ToastFn) => Promise<void>;
  stop: () => Promise<void>;
  seek: (position: number, toast?: ToastFn) => Promise<void>;
  setVolume: (volume: number, toast?: ToastFn) => Promise<void>;
  next: (toast?: ToastFn) => Promise<void>;
  prev: (toast?: ToastFn) => Promise<void>;
  setQuality: (quality: Quality) => void;
  setShuffle: (shuffle: boolean) => void;
  setRepeatMode: (mode: RepeatMode) => void;
  addToQueue: (song: Song) => void;
  setQueue: (songs: Song[], startIndex?: number) => void;
  updateProgress: (progress: number, duration: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setError: (message: string | null) => void;
  handlePlaybackError: (message: string, toast?: ToastFn) => Promise<void>;
}

type PlayerStore = PlayerState & PlayerActions;

/** Fisher-Yates shuffle */
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function isTauriRuntime(): boolean {
  return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

const failedAutoSkipSongIds = new Set<string>();

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentSong: null,
  queue: [],
  currentIndex: -1,
  playbackState: PlaybackState.Idle,
  progress: 0,
  duration: 0,
  volume: 0.8,
  quality: Quality.K320,
  shuffle: false,
  repeatMode: RepeatMode.None,
  error: null,

  play: async (song: Song, quality?: Quality, toast?: ToastFn, autoSkipOnError = true) => {
    const q = quality ?? get().quality;
    set({ currentSong: song, playbackState: PlaybackState.Loading, progress: 0, duration: song.duration || 0, error: null });

    // Update currentIndex if song is in queue
    const { queue } = get();
    const idx = queue.findIndex((s) => s.id === song.id);
    if (idx !== -1) {
      set({ currentIndex: idx });
    }

    const isTauri = isTauriRuntime();

    try {
      if (isTauri) {
        await tauriPlaySong(song, q);
        await tauriSetVolume(get().volume);
      } else {
        const mockUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
        await audioEngine.play(mockUrl);
        audioEngine.setVolume(get().volume);
      }
      failedAutoSkipSongIds.clear();
      set({ playbackState: PlaybackState.Playing });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (autoSkipOnError) {
        await get().handlePlaybackError(message, toast);
      } else {
        set({ playbackState: PlaybackState.Error, error: message });
        toast?.(`播放失败：${message}`, 'error');
      }
    }
  },

  pause: async (toast?: ToastFn) => {
    const isTauri = isTauriRuntime();
    try {
      if (isTauri) {
        await tauriPausePlayback();
      } else {
        audioEngine.pause();
      }
      set({ playbackState: PlaybackState.Paused });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      toast?.(message, 'error');
    }
  },

  resume: async (toast?: ToastFn) => {
    const isTauri = isTauriRuntime();
    try {
      if (isTauri) {
        await tauriResumePlayback();
      } else {
        await audioEngine.resume();
      }
      set({ playbackState: PlaybackState.Playing });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      toast?.(message, 'error');
    }
  },

  stop: async () => {
    const isTauri = isTauriRuntime();
    try {
      if (isTauri) {
        await tauriStopPlayback();
      } else {
        audioEngine.pause();
        audioEngine.seek(0);
      }
      set({
        currentSong: null,
        playbackState: PlaybackState.Idle,
        progress: 0,
        duration: 0,
        error: null,
      });
    } catch {
      set({ playbackState: PlaybackState.Error });
    }
  },

  seek: async (position: number, toast?: ToastFn) => {
    const isTauri = isTauriRuntime();
    try {
      if (isTauri) {
        await tauriSeekTo(position);
      } else {
        audioEngine.seek(position);
      }
      set({ progress: position });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      toast?.(message, 'error');
    }
  },

  setVolume: async (volume: number, toast?: ToastFn) => {
    const isTauri = isTauriRuntime();
    try {
      if (isTauri) {
        await tauriSetVolume(volume);
      } else {
        audioEngine.setVolume(volume);
      }
      set({ volume });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      toast?.(message, 'error');
    }
  },

  next: async (toast?: ToastFn) => {
    try {
      const { queue, currentIndex, quality, repeatMode, shuffle } = get();
      if (queue.length === 0) return;

      const hasFailedSkips = failedAutoSkipSongIds.size > 0;
      let nextIndex: number;

      if (repeatMode === RepeatMode.One && !hasFailedSkips) {
        // Repeat current song on natural/manual next when no failed song needs skipping
        nextIndex = currentIndex;
      } else if (shuffle) {
        // Random next (avoid same song and already failed songs if possible)
        const candidates = queue
          .map((song, index) => ({ song, index }))
          .filter(({ song, index }) => index !== currentIndex && !failedAutoSkipSongIds.has(song.id));
        if (candidates.length === 0) {
          failedAutoSkipSongIds.clear();
          set({ playbackState: PlaybackState.Error, error: '没有可播放的下一首歌曲' });
          return;
        }
        nextIndex = candidates[Math.floor(Math.random() * candidates.length)].index;
      } else {
        nextIndex = currentIndex + 1;
        while (nextIndex < queue.length && failedAutoSkipSongIds.has(queue[nextIndex].id)) {
          nextIndex += 1;
        }
      }

      if (nextIndex >= queue.length) {
        if (repeatMode === RepeatMode.All) {
          nextIndex = 0; // Wrap around
          while (nextIndex < queue.length && failedAutoSkipSongIds.has(queue[nextIndex].id)) {
            nextIndex += 1;
          }
          if (nextIndex >= queue.length) {
            failedAutoSkipSongIds.clear();
            set({ playbackState: PlaybackState.Error, error: '所有歌曲均播放失败' });
            return;
          }
        } else {
          // End of queue, stop playback state without clearing selected song
          if (hasFailedSkips) {
            failedAutoSkipSongIds.clear();
            set({ playbackState: PlaybackState.Error, error: '没有可播放的下一首歌曲' });
          } else {
            set({ playbackState: PlaybackState.Idle, progress: 0 });
          }
          return;
        }
      }

      const nextSong = queue[nextIndex];
      set({ currentIndex: nextIndex });
      await get().play(nextSong, quality, toast, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ playbackState: PlaybackState.Error, error: message });
      toast?.(message, 'error');
    }
  },

  prev: async (toast?: ToastFn) => {
    try {
      const { queue, currentIndex, quality, repeatMode, progress } = get();
      if (queue.length === 0) return;

      // If more than 3 seconds in, restart current song
      if (progress > 3) {
        await get().seek(0, toast);
        return;
      }

      let prevIndex = currentIndex - 1;

      if (prevIndex < 0) {
        if (repeatMode === RepeatMode.All) {
          prevIndex = queue.length - 1; // Wrap around
        } else {
          prevIndex = 0; // Stay at first
        }
      }

      const prevSong = queue[prevIndex];
      set({ currentIndex: prevIndex });
      await get().play(prevSong, quality, toast);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  setQuality: (quality: Quality) => {
    set({ quality });
  },

  setShuffle: (shuffle: boolean) => {
    const { queue, currentIndex, currentSong } = get();
    if (shuffle) {
      // Build shuffled queue keeping current song at index 0
      const rest = queue.filter((_, i) => i !== currentIndex);
      const shuffled = [queue[currentIndex], ...shuffleArray(rest)];
      set({ queue: shuffled, currentIndex: 0, shuffle: true });
    } else {
      // Restore original order — find current song in original queue
      if (currentSong) {
        // Re-sort by original id order (best effort)
        const idx = queue.findIndex((s) => s.id === currentSong.id);
        set({ shuffle: false, currentIndex: idx >= 0 ? idx : 0 });
      } else {
        set({ shuffle: false });
      }
    }
  },

  setRepeatMode: (mode: RepeatMode) => {
    set({ repeatMode: mode });
  },

  addToQueue: (song: Song) => {
    const { queue } = get();
    if (!queue.find((s) => s.id === song.id)) {
      set({ queue: [...queue, song] });
    }
  },

  setQueue: (songs: Song[], startIndex = 0) => {
    set({
      queue: songs,
      currentIndex: startIndex,
      currentSong: songs[startIndex] ?? null,
    });
  },

  updateProgress: (progress: number, duration: number) => {
    set({ progress, duration });
  },

  setPlaybackState: (state: PlaybackState) => {
    set({ playbackState: state });
  },

  setError: (message: string | null) => {
    set({ error: message, playbackState: message ? PlaybackState.Error : get().playbackState });
  },

  handlePlaybackError: async (message: string, toast?: ToastFn) => {
    set({ playbackState: PlaybackState.Error, error: message });
    toast?.(`播放失败：${message}`, 'error');

    const { queue, currentIndex, currentSong } = get();
    if (queue.length > 1 && currentIndex >= 0 && currentSong) {
      failedAutoSkipSongIds.add(currentSong.id);
      await get().next(toast);
    }
  },
}));

interface UnlistenFn {
  (): void;
}

let eventUnlisteners: UnlistenFn[] = [];
let subscribing = false;

export function subscribePlayerEvents(): Promise<() => void> {
  if (subscribing || eventUnlisteners.length > 0) {
    return Promise.resolve(() => {});
  }
  subscribing = true;

  const unlistenPromises: Promise<UnlistenFn>[] = [];

  // Progress updates from backend
  unlistenPromises.push(
    listen<PlaybackProgressEvent>('playback-progress', (event) => {
      const { elapsed, total } = event.payload;
      usePlayerStore.getState().updateProgress(elapsed, total);
    })
  );

  // Playback ended -> auto play next song
  unlistenPromises.push(
    listen('playback-ended', () => {
      usePlayerStore.getState().next();
    })
  );

  // Tray / hotkey: Play/Pause
  unlistenPromises.push(
    listen('hotkey-play-pause', () => {
      const { playbackState, pause, resume, currentSong } = usePlayerStore.getState();
      if (playbackState === PlaybackState.Playing) {
        pause();
      } else if (playbackState === PlaybackState.Paused) {
        resume();
      } else if (currentSong) {
        resume();
      }
    })
  );

  // Tray / hotkey: Next
  unlistenPromises.push(
    listen('hotkey-next', () => {
      usePlayerStore.getState().next();
    })
  );

  // Tray / hotkey: Previous
  unlistenPromises.push(
    listen('hotkey-prev', () => {
      usePlayerStore.getState().prev();
    })
  );

  // Return cleanup function
  return Promise.all(unlistenPromises).then((unlistens) => {
    eventUnlisteners = unlistens;
    subscribing = false;
    return () => {
      eventUnlisteners.forEach((fn) => fn());
      eventUnlisteners = [];
      subscribing = false;
    };
  });
}
