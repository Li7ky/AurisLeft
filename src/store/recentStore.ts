import { create } from 'zustand';
import type { Song } from '../types';
import { invoke } from '../utils/ipc';

interface RecentState {
  recent: Song[];
  loading: boolean;
  loadRecent: () => Promise<void>;
  clearRecent: () => Promise<void>;
}

export const useRecentStore = create<RecentState>((set) => ({
  recent: [],
  loading: false,

  loadRecent: async () => {
    set({ loading: true });
    try {
      const recent = await invoke<Song[]>('list_recent_plays', { limit: 40 });
      set({ recent: recent || [], loading: false });
    } catch {
      set({ recent: [], loading: false });
    }
  },

  clearRecent: async () => {
    await invoke('clear_recent_plays');
    set({ recent: [] });
  },
}));
