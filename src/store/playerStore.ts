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
  warmSongs as desktopWarmSongs,
} from '../utils/desktop';
import { isElectronRuntime, listen as desktopListen } from '../utils/ipc';
import type { LyricLine, Song } from '../types';
import { audioEngine } from '../core/audioEngine';
import { PlaybackState, Quality, RepeatMode } from '../types';
import { isLocalSong, localSongPath, songKey } from '../utils/song';

const QUALITY_FALLBACK: Quality[] = [
  Quality.HiRes,
  Quality.FLAC,
  Quality.K320,
  Quality.K128,
];

function qualityChain(start: Quality): Quality[] {
  const idx = QUALITY_FALLBACK.indexOf(start);
  if (idx < 0) return [start, Quality.K320, Quality.K128];
  return QUALITY_FALLBACK.slice(idx);
}

function friendlyPlaybackMessage(message: string): string {
  const m = String(message || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  // 切歌取消：不提示错误
  if (/播放已切换|PLAY_SWITCHED|aborted/i.test(m)) {
    return '';
  }
  // 洛雪脚本吓人原文（六音等）→ 正常说明
  if (/数字专辑|无法获取播放链接|该渠道|GetMedia|无音源/i.test(m)) {
    return '当前渠道受限，已尝试其它音源。若仍失败请换一首';
  }
  if (/音源仍在初始化|请稍候|initializ/i.test(m)) {
    return '音源仍在初始化，请稍候几秒再播放';
  }
  if (/没有已开启|未开启音源|到设置页打开/i.test(m)) {
    return '取链失败。请确认设置里已开启「西瓜糖 QQ 解析」或至少一个洛雪音源';
  }
  if (/timeout|超时/i.test(m)) return '取链超时，请检查网络后重试';
  if (/vip|会员|付费|版权|受限|换源仍失败|暂时无法播放/i.test(m)) {
    return '该曲可能受版权或会员限制，已尝试换源仍失败';
  }
  if (/网络|ECONN|fetch failed|network/i.test(m)) return '网络异常，播放失败';
  if (/无法解析播放地址|取链失败|暂无可用/i.test(m)) {
    return '暂时无法获取播放地址，请换一首或稍后再试';
  }
  if (/解码|格式可能不受支持/i.test(m)) return '音频解码失败，链接可能已失效';
  if (/链接无效|付费\/下架|SRC_NOT_SUPPORTED/i.test(m)) {
    return '无法播放该音源（链接无效或歌曲受限）';
  }
  if (m.includes('|') || m.includes('；')) {
    return '暂时无法播放，请换一首或稍后再试';
  }
  return m.length > 100 ? `${m.slice(0, 100)}…` : m || '播放失败';
}

function updateMediaSession(song: Song | null, playing: boolean) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (!song) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.name || '未知歌曲',
      artist: song.artist || '未知艺人',
      album: song.album || '',
      artwork: song.coverUrl
        ? [
            { src: song.coverUrl, sizes: '300x300', type: 'image/jpeg' },
            { src: song.coverUrl, sizes: '96x96', type: 'image/jpeg' },
          ]
        : [],
    });
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  } catch {
    /* ignore */
  }
}

function bindMediaSessionHandlers() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler('play', () => {
      void usePlayerStore.getState().resume();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      void usePlayerStore.getState().pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      void usePlayerStore.getState().prev();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      void usePlayerStore.getState().next();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) {
        void usePlayerStore.getState().seek(details.seekTime);
      }
    });
  } catch {
    /* some handlers unsupported */
  }
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
/** 连点切歌：丢弃过期 play 结果 */
let playRequestToken = 0;
let lastResolveToastAt = 0;

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

  play: async (songInput: Song, quality?: Quality, toast?: ToastFn, autoSkipOnError = true) => {
    const token = ++playRequestToken;
    let song = songInput;
    const q = quality ?? get().quality;
    const { queue, currentIndex } = get();
    let idx = queue.findIndex((s) => songKey(s) === songKey(song));

    if (idx === -1 && queue.length === 0) {
      set({ queue: [song], currentIndex: 0 });
      idx = 0;
    } else if (idx === -1) {
      const insertAt =
        currentIndex >= 0 && currentIndex < queue.length ? currentIndex + 1 : queue.length;
      const nextQueue = [...queue];
      nextQueue.splice(insertAt, 0, song);
      set({ queue: nextQueue, currentIndex: insertAt });
      idx = insertAt;
    } else {
      set({ currentIndex: idx });
    }

    // 立刻停掉上一首，别等新链解析完才哑火
    try {
      audioEngine.stopForSwitch();
    } catch {
      /* ignore */
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
    updateMediaSession(song, false);

    try {
      let url: string | undefined;
      let usedQuality = q;

      if (isLocalSong(song)) {
        const filePath = localSongPath(song);
        const result = await desktopPlayLocalFile(filePath);
        if (token !== playRequestToken) return;
        url = result?.url;
      } else if (isElectronRuntime()) {
        // 解析超过 700ms 再提示，缓存秒开不弹「正在解析」
        let resolveToastTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
          resolveToastTimer = null;
          if (token !== playRequestToken) return;
          const now = Date.now();
          if (now - lastResolveToastAt > 1200) {
            lastResolveToastAt = now;
            toast?.('正在解析播放地址…', 'info');
          }
        }, 700);

        // 有 mid 时只打一枪 QQ，加快切歌；失败再降质
        const chain = qualityChain(q).slice(0, song.strMediaMid || song.platform === 'tx' ? 1 : 2);
        let lastErr: Error | null = null;
        let playMeta: { duration?: number; coverUrl?: string | null; album?: string } = {};
        try {
          for (const tryQ of chain) {
            if (token !== playRequestToken) return;
            try {
              const result = await desktopPlaySong(song, tryQ);
              if (token !== playRequestToken) return;
              // 主进程软取消：切歌时返回 cancelled，不当错误
              if (
                result &&
                typeof result === 'object' &&
                ((result as { cancelled?: boolean }).cancelled ||
                  (result as { code?: string }).code === 'PLAY_SWITCHED')
              ) {
                return;
              }
              if (result && typeof result === 'object' && 'url' in result && result.url) {
                url = (result as { url: string }).url;
                usedQuality = tryQ;
                const r = result as {
                  duration?: number;
                  coverUrl?: string | null;
                  album?: string;
                };
                playMeta = {
                  duration: r.duration,
                  coverUrl: r.coverUrl,
                  album: r.album,
                };
                break;
              }
              lastErr = new Error('无法解析播放地址');
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (/播放已切换|PLAY_SWITCHED/i.test(msg)) return;
              lastErr = err instanceof Error ? err : new Error(msg);
            }
          }
        } finally {
          if (resolveToastTimer) clearTimeout(resolveToastTimer);
        }
        if (!url && lastErr) throw lastErr;

        // 用解析结果补全列表里缺失的封面/时长
        if (playMeta.coverUrl || playMeta.duration || playMeta.album) {
          const enriched: Song = {
            ...song,
            coverUrl: playMeta.coverUrl || song.coverUrl,
            duration: playMeta.duration || song.duration,
            album: playMeta.album || song.album,
          };
          set({
            currentSong: enriched,
            duration: enriched.duration || get().duration,
          });
          song = enriched;
        }
      } else {
        url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      }

      if (token !== playRequestToken) return;

      if (!url) {
        throw new Error('无法解析播放地址');
      }

      if (usedQuality !== q) {
        set({ quality: usedQuality });
      }

      await audioEngine.play(url);
      if (token !== playRequestToken) return;

      audioEngine.setVolume(get().volume);
      failedAutoSkipSongKeys.clear();
      set({ playbackState: PlaybackState.Playing });
      updateMediaSession(get().currentSong || song, true);

      // 预热队列里接下来 2 首 → 切歌也尽量秒开
      try {
        const { queue, currentIndex } = get();
        const upcoming = queue.slice(currentIndex + 1, currentIndex + 3);
        if (upcoming.length && isElectronRuntime()) {
          void desktopWarmSongs(upcoming, usedQuality);
        }
      } catch {
        /* ignore */
      }
    } catch (err) {
      if (token !== playRequestToken) return;
      const raw = err instanceof Error ? err.message : String(err);
      if (/播放已切换|PLAY_SWITCHED|aborted/i.test(raw)) return;
      const message = friendlyPlaybackMessage(raw);
      if (!message) return;
      if (autoSkipOnError) {
        await get().handlePlaybackError(message, toast);
      } else {
        set({ playbackState: PlaybackState.Error, error: message });
        toast?.(`播放失败：${message}`, 'error');
        updateMediaSession(song, false);
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
      updateMediaSession(get().currentSong, false);
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
      updateMediaSession(currentSong, true);
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
      updateMediaSession(null, false);
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
      !message ||
      /interrupted by a new load request/i.test(message) ||
      /The play\(\) request was interrupted/i.test(message) ||
      /播放被中断/.test(message) ||
      /播放已切换|PLAY_SWITCHED|aborted/i.test(message)
    ) {
      return;
    }

    const friendly = friendlyPlaybackMessage(message);

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
    updateMediaSession(currentSong, false);

    // Config / readiness: don't auto-skip the whole queue
    const isConfigError = /没有已开启|初始化|设置页/.test(friendly);

    if (now - lastErrorToastAt > 1500) {
      lastErrorToastAt = now;
      toast?.(`播放失败：${friendly}`, 'error');
    }

    if (isConfigError) return;

    const { queue, currentIndex, quality } = get();

    // Same-song quality step-down once more before skip (stream decode failures)
    if (
      currentSong &&
      !failedAutoSkipSongKeys.has(songKey(currentSong)) &&
      /解码|链接无效|网络错误|无法播放|加载失败/.test(friendly)
    ) {
      const chain = qualityChain(quality);
      if (chain.length > 1) {
        const lower = chain[1];
        failedAutoSkipSongKeys.add(songKey(currentSong));
        toast?.(`尝试较低音质（${lower}）…`, 'info');
        await new Promise((r) => setTimeout(r, 200));
        if (gen !== errorHandleGeneration) return;
        await get().play(currentSong, lower, toast, true);
        return;
      }
    }

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
  bindMediaSessionHandlers();

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
