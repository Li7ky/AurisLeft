import { create } from 'zustand';
import {
  playSong as desktopPlaySong,
  pausePlayback as desktopPausePlayback,
  resumePlayback as desktopResumePlayback,
  stopPlayback as desktopStopPlayback,
  seekTo as desktopSeekTo,
  setVolume as desktopSetVolume,
  playLocalFile as desktopPlayLocalFile,
  fetchLyric as desktopFetchLyric,
  getLxStatus,
} from '../utils/desktop';
import { isElectronRuntime, listen as desktopListen } from '../utils/ipc';
import type { LyricLine, Song } from '../types';
import { audioEngine } from '../core/audioEngine';
import { PlaybackState, Quality, RepeatMode } from '../types';
import { isLocalSong, songKey } from '../utils/song';

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
  lyricLines: LyricLine[];
  lyricLoading: boolean;
  showLyricPanel: boolean;
  showQueuePanel: boolean;
}

type ToastFn = ((message: string, type?: 'success' | 'error' | 'info') => void) | undefined;

interface PlayerActions {
  hydrateFromSettings: (prefs: {
    volume: number;
    quality: Quality;
    shuffle: boolean;
    repeatMode: RepeatMode;
  }) => void;
  play: (song: Song, quality?: Quality, toast?: ToastFn, autoSkipOnError?: boolean) => Promise<void>;
  playList: (
    songs: Song[],
    startIndex?: number,
    quality?: Quality,
    toast?: ToastFn
  ) => Promise<void>;
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
  removeFromQueue: (index: number) => Promise<void>;
  clearQueue: () => void;
  setQueue: (songs: Song[], startIndex?: number) => void;
  updateProgress: (progress: number, duration: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setError: (message: string | null) => void;
  handlePlaybackError: (message: string, toast?: ToastFn) => Promise<void>;
  fadeOutAndPause: () => Promise<void>;
  loadLyrics: (song: Song) => Promise<void>;
  setShowLyricPanel: (show: boolean) => void;
  setShowQueuePanel: (show: boolean) => void;
  toggleLyricPanel: () => void;
  toggleQueuePanel: () => void;
}

type PlayerStore = PlayerState & PlayerActions;

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Failed tracks keyed by songKey (source::songId) */
const failedAutoSkipSongKeys = new Set<string>();
let lyricRequestToken = 0;
let lastErrorToastAt = 0;
let lastErrorHandleKey = '';
let lastErrorHandleAt = 0;
let errorHandleGeneration = 0;
let fadingOut = false;

async function persistPlayerPrefs(partial: {
  volume?: number;
  shuffle?: boolean;
  repeatMode?: RepeatMode;
  defaultQuality?: Quality;
}) {
  try {
    const { useSettingsStore } = await import('./settingsStore');
    await useSettingsStore.getState().persistPlayerPrefs(partial);
  } catch {
    /* ignore */
  }
}

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
  lyricLines: [],
  lyricLoading: false,
  showLyricPanel: false,
  showQueuePanel: false,

  hydrateFromSettings: ({ volume, quality, shuffle, repeatMode }) => {
    set({ volume, quality, shuffle, repeatMode });
    audioEngine.setVolume(volume);
  },

  play: async (song: Song, quality?: Quality, toast?: ToastFn, autoSkipOnError = true) => {
    const q = quality ?? get().quality;
    const { queue, currentIndex } = get();
    let idx = queue.findIndex((s) => songKey(s) === songKey(song));

    if (idx === -1 && queue.length === 0) {
      // Empty queue → single-song queue
      set({ queue: [song], currentIndex: 0 });
      idx = 0;
    } else if (idx === -1) {
      // Not in queue: insert after current (preserve existing queue)
      const insertAt =
        currentIndex >= 0 && currentIndex < queue.length ? currentIndex + 1 : queue.length;
      const nextQueue = [...queue];
      nextQueue.splice(insertAt, 0, song);
      set({ queue: nextQueue, currentIndex: insertAt });
      idx = insertAt;
    } else {
      set({ currentIndex: idx });
    }

    set({
      currentSong: song,
      playbackState: PlaybackState.Loading,
      progress: 0,
      duration: song.duration || 0,
      error: null,
      lyricLines: [],
    });

    void get().loadLyrics(song);

    try {
      let url: string | undefined;

      if (isLocalSong(song)) {
        const result = await desktopPlayLocalFile(song.songId);
        url = result?.url;
      } else if (isElectronRuntime()) {
        try {
          const lx = await getLxStatus();
          if (lx.initializing) {
            toast?.('正在初始化音源，请稍候…', 'info');
          }
        } catch {
          /* ignore status probe */
        }
        if (song.playableHint === 'maybe_vip') {
          toast?.('该曲在此平台可能受限，将自动尝试其它平台换源…', 'info');
        }
        const result = await desktopPlaySong(song, q);
        if (result && typeof result === 'object' && 'url' in result) {
          url = (result as { url: string }).url;
        }
      } else {
        // 纯浏览器预览（无 Electron 后端）
        url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      }

      if (!url) {
        throw new Error('无法解析播放地址');
      }

      await audioEngine.play(url);
      audioEngine.setVolume(get().volume);
      failedAutoSkipSongKeys.clear();
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

  playList: async (songs, startIndex = 0, quality, toast) => {
    if (!songs.length) {
      toast?.('播放列表为空', 'info');
      return;
    }
    const safeIndex = Math.max(0, Math.min(startIndex, songs.length - 1));
    set({ queue: songs, currentIndex: safeIndex });
    await get().play(songs[safeIndex], quality, toast, true);
  },

  pause: async (toast?: ToastFn) => {
    try {
      audioEngine.pause();
      void desktopPausePlayback().catch(() => undefined);
      set({ playbackState: PlaybackState.Paused });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      toast?.(message, 'error');
    }
  },

  resume: async (toast?: ToastFn) => {
    const { currentSong, playbackState } = get();
    try {
      if (playbackState === PlaybackState.Idle && currentSong) {
        await get().play(currentSong, get().quality, toast, false);
        return;
      }
      await audioEngine.resume();
      void desktopResumePlayback().catch(() => undefined);
      set({ playbackState: PlaybackState.Playing });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      toast?.(message, 'error');
    }
  },

  stop: async () => {
    try {
      audioEngine.pause();
      audioEngine.seek(0);
      void desktopStopPlayback().catch(() => undefined);
      set({
        currentSong: null,
        playbackState: PlaybackState.Idle,
        progress: 0,
        duration: 0,
        error: null,
        lyricLines: [],
      });
    } catch {
      set({ playbackState: PlaybackState.Error });
    }
  },

  seek: async (position: number, toast?: ToastFn) => {
    try {
      audioEngine.seek(position);
      void desktopSeekTo(position).catch(() => undefined);
      set({ progress: position });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      toast?.(message, 'error');
    }
  },

  setVolume: async (volume: number, toast?: ToastFn) => {
    try {
      const v = Math.min(1, Math.max(0, volume));
      audioEngine.setVolume(v);
      void desktopSetVolume(v).catch(() => undefined);
      set({ volume: v });
      void persistPlayerPrefs({ volume: v });
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

      const hasFailedSkips = failedAutoSkipSongKeys.size > 0;
      let nextIndex: number;

      if (repeatMode === RepeatMode.One && !hasFailedSkips) {
        nextIndex = currentIndex;
      } else if (shuffle) {
        const candidates = queue
          .map((song, index) => ({ song, index }))
          .filter(
            ({ song, index }) =>
              index !== currentIndex && !failedAutoSkipSongKeys.has(songKey(song))
          );
        if (candidates.length === 0) {
          failedAutoSkipSongKeys.clear();
          set({ playbackState: PlaybackState.Error, error: '没有可播放的下一首歌曲' });
          return;
        }
        nextIndex = candidates[Math.floor(Math.random() * candidates.length)].index;
      } else {
        nextIndex = currentIndex + 1;
        while (
          nextIndex < queue.length &&
          failedAutoSkipSongKeys.has(songKey(queue[nextIndex]))
        ) {
          nextIndex += 1;
        }
      }

      if (nextIndex >= queue.length) {
        if (repeatMode === RepeatMode.All) {
          nextIndex = 0;
          while (
            nextIndex < queue.length &&
            failedAutoSkipSongKeys.has(songKey(queue[nextIndex]))
          ) {
            nextIndex += 1;
          }
          if (nextIndex >= queue.length) {
            failedAutoSkipSongKeys.clear();
            set({ playbackState: PlaybackState.Error, error: '所有歌曲均播放失败' });
            return;
          }
        } else {
          if (hasFailedSkips) {
            failedAutoSkipSongKeys.clear();
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

      if (progress > 3) {
        await get().seek(0, toast);
        return;
      }

      let prevIndex = currentIndex - 1;

      if (prevIndex < 0) {
        if (repeatMode === RepeatMode.All) {
          prevIndex = queue.length - 1;
        } else {
          prevIndex = 0;
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
    void persistPlayerPrefs({ defaultQuality: quality });
  },

  setShuffle: (shuffle: boolean) => {
    const { queue, currentIndex, currentSong } = get();
    if (shuffle) {
      if (queue.length === 0 || currentIndex < 0) {
        set({ shuffle: true });
        void persistPlayerPrefs({ shuffle: true });
        return;
      }
      const rest = queue.filter((_, i) => i !== currentIndex);
      const shuffled = [queue[currentIndex], ...shuffleArray(rest)];
      set({ queue: shuffled, currentIndex: 0, shuffle: true });
    } else if (currentSong) {
      const idx = queue.findIndex((s) => songKey(s) === songKey(currentSong));
      set({ shuffle: false, currentIndex: idx >= 0 ? idx : 0 });
    } else {
      set({ shuffle: false });
    }
    void persistPlayerPrefs({ shuffle });
  },

  setRepeatMode: (mode: RepeatMode) => {
    set({ repeatMode: mode });
    void persistPlayerPrefs({ repeatMode: mode });
  },

  addToQueue: (song: Song) => {
    const { queue } = get();
    if (!queue.find((s) => songKey(s) === songKey(song))) {
      set({ queue: [...queue, song] });
    }
  },

  removeFromQueue: async (index: number) => {
    const { queue, currentIndex, quality, playbackState } = get();
    if (index < 0 || index >= queue.length) return;

    const removingCurrent = index === currentIndex;
    const wasPlaying =
      playbackState === PlaybackState.Playing || playbackState === PlaybackState.Loading;
    const nextQueue = queue.filter((_, i) => i !== index);

    if (nextQueue.length === 0) {
      await get().stop();
      set({ queue: [], currentIndex: -1, currentSong: null });
      return;
    }

    let nextIndex = currentIndex;
    if (index < currentIndex) nextIndex = currentIndex - 1;
    else if (index === currentIndex) nextIndex = Math.min(index, nextQueue.length - 1);

    const nextSong = nextQueue[nextIndex];
    set({
      queue: nextQueue,
      currentIndex: nextIndex,
      currentSong: nextSong,
    });

    if (removingCurrent) {
      if (wasPlaying) {
        await get().play(nextSong, quality, undefined, true);
      } else {
        // Not actively playing — just update selection without starting
        set({
          progress: 0,
          duration: nextSong.duration || 0,
          lyricLines: [],
        });
        void get().loadLyrics(nextSong);
      }
    }
  },

  clearQueue: () => {
    const { currentSong } = get();
    set({
      queue: currentSong ? [currentSong] : [],
      currentIndex: currentSong ? 0 : -1,
    });
  },

  setQueue: (songs: Song[], startIndex = 0) => {
    set({
      queue: songs,
      currentIndex: startIndex,
      currentSong: songs[startIndex] ?? null,
    });
  },

  updateProgress: (progress: number, duration: number) => {
    set({ progress, duration: duration > 0 ? duration : get().duration });
  },

  setPlaybackState: (state: PlaybackState) => {
    set({ playbackState: state });
  },

  setError: (message: string | null) => {
    set({ error: message, playbackState: message ? PlaybackState.Error : get().playbackState });
  },

  handlePlaybackError: async (message: string, toast?: ToastFn) => {
    // Ignore noisy race errors from rapid track switching
    if (
      /interrupted by a new load request/i.test(message) ||
      /The play\(\) request was interrupted/i.test(message) ||
      /播放被中断/.test(message)
    ) {
      return;
    }

    const friendly = message
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const { currentSong } = get();
    const dedupeKey = `${currentSong ? songKey(currentSong) : 'none'}::${friendly}`;
    const now = Date.now();
    if (dedupeKey === lastErrorHandleKey && now - lastErrorHandleAt < 900) {
      return;
    }
    lastErrorHandleKey = dedupeKey;
    lastErrorHandleAt = now;

    const gen = ++errorHandleGeneration;

    set({ playbackState: PlaybackState.Error, error: friendly });

    if (now - lastErrorToastAt > 1500) {
      lastErrorToastAt = now;
      toast?.(`播放失败：${friendly}`, 'error');
    }

    const { queue, currentIndex } = get();
    // Don't auto-skip through an entire VIP list — only try a few times
    if (
      queue.length > 1 &&
      currentIndex >= 0 &&
      currentSong &&
      failedAutoSkipSongKeys.size < 3
    ) {
      failedAutoSkipSongKeys.add(songKey(currentSong));
      await new Promise((r) => setTimeout(r, 300));
      if (gen !== errorHandleGeneration) return;
      if (get().currentSong && songKey(get().currentSong!) === songKey(currentSong)) {
        await get().next(toast);
      }
    }
  },

  fadeOutAndPause: async () => {
    if (fadingOut) return;
    fadingOut = true;
    const restore = get().volume;
    try {
      await audioEngine.fadeOutAndPause(2000, restore);
      void desktopPausePlayback().catch(() => undefined);
      set({ playbackState: PlaybackState.Paused });
    } catch {
      await get().pause();
    } finally {
      fadingOut = false;
    }
  },

  loadLyrics: async (song: Song) => {
    const token = ++lyricRequestToken;

    set({ lyricLoading: true });
    try {
      if (!isElectronRuntime()) {
        set({ lyricLines: [], lyricLoading: false });
        return;
      }
      // Local songs: try sibling .lrc via main process
      const lyric = await desktopFetchLyric(song.songId, song.source);
      if (token !== lyricRequestToken) return;
      set({ lyricLines: lyric.lines ?? [], lyricLoading: false });
    } catch {
      if (token !== lyricRequestToken) return;
      set({ lyricLines: [], lyricLoading: false });
    }
  },

  setShowLyricPanel: (show: boolean) => set({ showLyricPanel: show }),
  setShowQueuePanel: (show: boolean) => set({ showQueuePanel: show }),
  toggleLyricPanel: () =>
    set((s) => ({ showLyricPanel: !s.showLyricPanel, showQueuePanel: false })),
  toggleQueuePanel: () =>
    set((s) => ({ showQueuePanel: !s.showQueuePanel, showLyricPanel: false })),
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

  const unlistens: UnlistenFn[] = [];

  unlistens.push(
    desktopListen('hotkey-play-pause', () => {
      const { playbackState, pause, resume, currentSong } = usePlayerStore.getState();
      if (playbackState === PlaybackState.Playing) {
        void pause();
      } else if (playbackState === PlaybackState.Paused) {
        void resume();
      } else if (currentSong) {
        void resume();
      }
    })
  );

  unlistens.push(
    desktopListen('hotkey-next', () => {
      void usePlayerStore.getState().next();
    })
  );

  unlistens.push(
    desktopListen('hotkey-prev', () => {
      void usePlayerStore.getState().prev();
    })
  );

  unlistens.push(
    desktopListen('sleep-timer-fired', () => {
      void usePlayerStore.getState().fadeOutAndPause();
    })
  );

  eventUnlisteners = unlistens;
  subscribing = false;
  return Promise.resolve(() => {
    eventUnlisteners.forEach((fn) => fn());
    eventUnlisteners = [];
    subscribing = false;
  });
}
