import { create } from 'zustand';
import { searchMusic } from '../utils/tauri';
import type { Song, SearchResult } from '../types';
import { Quality } from '../types';

interface SearchState {
  keyword: string;
  results: Map<string, Song[]>;
  loading: boolean;
  page: number;
  hasMore: boolean;
  selectedQuality: Quality;
  error: string | null;
}

type ToastFn = ((message: string, type?: 'success' | 'error' | 'info') => void) | undefined;

interface SearchActions {
  search: (keyword: string, page?: number, toast?: ToastFn) => Promise<void>;
  setPage: (page: number, toast?: ToastFn) => void;
  setSelectedQuality: (quality: Quality) => void;
  clearResults: () => void;
}

type SearchStore = SearchState & SearchActions;

let searchRequestId = 0;

/** 同名同歌手去重，优先可播性更好的平台结果 */
function dedupeSongs(songs: Song[]): Song[] {
  const platformScore = (s: Song) => {
    const p = s.platform || s.source || '';
    // 酷我/酷狗通常完整曲更多
    if (p === 'kw') return 0;
    if (p === 'kg') return 1;
    if (p === 'tx') return 2;
    if (p === 'wy') return 3;
    return 4;
  };
  const rank = (s: Song) => {
    let score = platformScore(s);
    if (s.playableHint === 'maybe_vip') score += 10;
    if (!s.coverUrl) score += 2;
    if (!s.duration) score += 1;
    return score;
  };

  const map = new Map<string, Song>();
  for (const song of songs) {
    const key = `${(song.name || '').trim().toLowerCase()}::${(song.artist || '')
      .trim()
      .toLowerCase()}`;
    if (!key || key === '::') {
      // 无法去重时直接保留
      map.set(songKeyFallback(song), song);
      continue;
    }
    const prev = map.get(key);
    if (!prev || rank(song) < rank(prev)) {
      map.set(key, song);
    }
  }
  return Array.from(map.values());
}

function songKeyFallback(song: Song) {
  return `${song.source}:${song.songId}:${song.name}`;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  keyword: '',
  results: new Map(),
  loading: false,
  page: 1,
  hasMore: true,
  selectedQuality: Quality.K320,
  error: null,

  search: async (keyword: string, page?: number, toast?: ToastFn) => {
    const p = page ?? 1;
    const requestId = ++searchRequestId;
    set({ keyword, page: p, loading: true, error: null });
    try {
      const result: SearchResult = await searchMusic(keyword, p);
      if (requestId !== searchRequestId) return;

      // 多平台合并去重：同名同歌手只保留一条（优先非会员、有封面、时长更完整）
      const merged = dedupeSongs(result.songs);
      // 统一放进一个列表键，UI 不按平台分组
      const sourceMap = new Map<string, Song[]>();
      sourceMap.set('all', merged);
      set({
        results: sourceMap,
        hasMore: result.songs.length > 0,
        loading: false,
      });
    } catch (err) {
      if (requestId !== searchRequestId) return;
      const message = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: message });
      toast?.(message, 'error');
    }
  },

  setPage: (page: number, toast?: ToastFn) => {
    set({ page });
    const { keyword } = get();
    if (keyword) {
      get().search(keyword, page, toast);
    }
  },

  setSelectedQuality: (quality: Quality) => {
    set({ selectedQuality: quality });
  },

  clearResults: () => {
    set({ keyword: '', results: new Map(), page: 1, hasMore: true, error: null });
  },
}));
