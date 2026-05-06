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
    set({ keyword, page: p, loading: true, error: null });
    try {
      const result: SearchResult = await searchMusic(keyword, p);
      const prevResults = get().results;
      const sourceMap = new Map<string, Song[]>(prevResults);
      if (p === 1) {
        sourceMap.clear();
      }
      for (const song of result.songs) {
        const existing = sourceMap.get(song.source) ?? [];
        sourceMap.set(song.source, [...existing, song]);
      }
      set({
        results: sourceMap,
        hasMore: result.songs.length > 0,
        loading: false,
      });
    } catch (err) {
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
