import { create } from 'zustand';
import { searchMusic } from '../utils/desktop';
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

/** 同名同歌手去重：QQ(tx) 优先（与西瓜糖取链一致），减少「会员却播不了」错觉 */
function dedupeSongs(songs: Song[]): Song[] {
  const platformScore = (s: Song) => {
    const p = s.platform || s.source || '';
    // 播放走 QQ 解析 → 列表优先保留 QQ 条目（带 mid）
    if (p === 'tx') return 0;
    if (p === 'kw') return 1;
    if (p === 'kg') return 2;
    if (p === 'wy') return 3;
    return 4;
  };
  const isRemixLike = (s: Song) =>
    /remix|翻唱|dj|cover|伴奏|纯音乐|片段|montagem|live/i.test(
      `${s.name || ''} ${s.artist || ''}`
    );
  const rank = (s: Song) => {
    let score = platformScore(s);
    if (s.playableHint === 'maybe_vip') score += 2;
    if (isRemixLike(s)) score += 12;
    // 缺封面/时长/专辑的条目大幅靠后，避免盖住官方搜索的完整结果
    if (!s.coverUrl) score += 20;
    if (!s.duration) score += 12;
    if (!s.album) score += 4;
    if (s.duration > 0 && s.duration < 60) score += 5;
    // 有 QQ mid 的优先（和西瓜糖取链一致）
    if (s.strMediaMid || (s.platform === 'tx' && s.songId)) score -= 3;
    if (s.coverUrl && s.duration) score -= 5;
    return score;
  };

  const map = new Map<string, Song>();
  for (const song of songs) {
    const key = `${(song.name || '').trim().toLowerCase()}::${(song.artist || '')
      .trim()
      .toLowerCase()}`;
    if (!key || key === '::') {
      map.set(songKeyFallback(song), song);
      continue;
    }
    const prev = map.get(key);
    if (!prev || rank(song) < rank(prev)) {
      map.set(key, song);
    }
  }
  // 稳定一点：QQ 结果靠前
  return Array.from(map.values()).sort((a, b) => rank(a) - rank(b));
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

      const merged = dedupeSongs(result.songs);
      const sourceMap = new Map<string, Song[]>();
      sourceMap.set('all', merged);
      const hasMore =
        typeof result.hasMore === 'boolean'
          ? result.hasMore
          : result.songs.length >= (result.perPage || 30) * 0.7;
      set({
        results: sourceMap,
        hasMore: merged.length === 0 ? false : hasMore,
        loading: false,
      });
      if (!merged.length) {
        toast?.('没有搜到相关歌曲，换个关键词试试', 'info');
      }
    } catch (err) {
      if (requestId !== searchRequestId) return;
      const message = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: message, hasMore: false });
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
