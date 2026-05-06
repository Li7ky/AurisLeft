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
import { PlaybackState, Quality } from '../types';

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
  error: string | null;
}

type ToastFn = ((message: string, type?: 'success' | 'error' | 'info') => void) | undefined;

interface PlayerActions {
  play: (song: Song, quality?: Quality, toast?: ToastFn) => Promise<void>;
  pause: (toast?: ToastFn) => Promise<void>;
  resume: (toast?: ToastFn) => Promise<void>;
  stop: () => Promise<void>;
  seek: (position: number, toast?: ToastFn) => Promise<void>;
  setVolume: (volume: number, toast?: ToastFn) => Promise<void>;
  next: (toast?: ToastFn) => Promise<void>;
  prev: (toast?: ToastFn) => Promise<void>;
  setQuality: (quality: Quality) => void;
  updateProgress: (progress: number, duration: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
}

type PlayerStore = PlayerState & PlayerActions;

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentSong: null,
  queue: [],
  currentIndex: -1,
  playbackState: PlaybackState.Idle,
  progress: 0,
  duration: 0,
  volume: 0.8,
  quality: Quality.K320,
  error: null,

  play: async (song: Song, quality?: Quality, toast?: ToastFn) => {
    const q = quality ?? get().quality;
    set({ currentSong: song, playbackState: PlaybackState.Loading, error: null });
    
    // Check if we are running in Tauri or Browser
    const isTauri = Boolean(window.__TAURI__);

    try {
      if (isTauri) {
        await tauriPlaySong(song, q);
      } else {
        // Mock Browser fallback using local asset or direct URL
        // In real app, we need to fetch the actual stream URL via Source
        const mockUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
        await audioEngine.play(mockUrl);
        audioEngine.setVolume(get().volume);
      }
      set({ playbackState: PlaybackState.Playing });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ playbackState: PlaybackState.Error, error: message });
      toast?.(message, 'error');
    }
  },

  pause: async (toast?: ToastFn) => {
    const isTauri = Boolean(window.__TAURI__);
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
    const isTauri = Boolean(window.__TAURI__);
    try {
      if (isTauri) {
        await tauriResumePlayback();
      } else {
        // audioEngine resumes by calling play() without changing src
        await audioEngine.play(''); 
      }
      set({ playbackState: PlaybackState.Playing });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      toast?.(message, 'error');
    }
  },

  stop: async () => {
    const isTauri = Boolean(window.__TAURI__);
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
    const isTauri = Boolean(window.__TAURI__);
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
    const isTauri = Boolean(window.__TAURI__);
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
      const { queue, currentIndex, quality } = get();
      const nextIndex = currentIndex + 1;
      if (nextIndex < queue.length) {
        const nextSong = queue[nextIndex];
        set({ currentIndex: nextIndex });
        await get().play(nextSong, quality, toast);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  prev: async (toast?: ToastFn) => {
    try {
      const { queue, currentIndex, quality } = get();
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        const prevSong = queue[prevIndex];
        set({ currentIndex: prevIndex });
        await get().play(prevSong, quality, toast);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  setQuality: (quality: Quality) => {
    set({ quality });
  },

  updateProgress: (progress: number, duration: number) => {
    set({ progress, duration });
  },

  setPlaybackState: (state: PlaybackState) => {
    set({ playbackState: state });
  },
}));

interface UnlistenFn {
  (): void;
}

let eventUnlisteners: UnlistenFn[] = [];

export function subscribePlayerEvents() {
  if (eventUnlisteners.length > 0) return;

  // Progress updates from backend
  listen<PlaybackProgressEvent>('playback-progress', (event) => {
    const { elapsed, total } = event.payload;
    usePlayerStore.getState().updateProgress(elapsed, total);
  }).then((unlisten) => {
    eventUnlisteners.push(unlisten);
  });

  // Playback ended -> auto play next song
  listen('playback-ended', () => {
    usePlayerStore.getState().next();
  }).then((unlisten) => {
    eventUnlisteners.push(unlisten);
  });

  // Tray / hotkey: Play/Pause
  listen('hotkey-play-pause', () => {
    const { playbackState, pause, resume } = usePlayerStore.getState();
    if (playbackState === PlaybackState.Playing) {
      pause();
    } else if (playbackState === PlaybackState.Paused) {
      resume();
    }
  }).then((unlisten) => {
    eventUnlisteners.push(unlisten);
  });

  // Tray / hotkey: Next
  listen('hotkey-next', () => {
    usePlayerStore.getState().next();
  }).then((unlisten) => {
    eventUnlisteners.push(unlisten);
  });

  // Tray / hotkey: Previous
  listen('hotkey-prev', () => {
    usePlayerStore.getState().prev();
  }).then((unlisten) => {
    eventUnlisteners.push(unlisten);
  });
}
