import { create } from 'zustand';
import type { Song } from '../types';
import { listFavorites, toggleFavorite as apiToggle } from '../utils/desktop';
import { songKey } from '../utils/song';

interface FavoriteState {
  favorites: Song[];
  loading: boolean;
  loadFavorites: () => Promise<void>;
  toggle: (song: Song) => Promise<boolean>;
  isFavorited: (song: Song | null) => boolean;
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  favorites: [],
  loading: false,

  loadFavorites: async () => {
    set({ loading: true });
    try {
      const favorites = await listFavorites();
      set({ favorites, loading: false });
    } catch {
      set({ favorites: [], loading: false });
    }
  },

  toggle: async (song: Song) => {
    const result = await apiToggle(song);
    await get().loadFavorites();
    return result.favorited;
  },

  isFavorited: (song: Song | null) => {
    if (!song) return false;
    return get().favorites.some((f) => songKey(f) === songKey(song));
  },
}));
