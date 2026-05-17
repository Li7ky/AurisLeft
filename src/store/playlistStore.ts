import { create } from 'zustand';
import {
  createPlaylist,
  addToPlaylist,
  removeFromPlaylist,
  listPlaylists,
  deletePlaylist,
  getPlaylistSongs,
  reorderPlaylistSongs,
  importPlaylist,
  exportPlaylist,
} from '../utils/tauri';
import type { Playlist, PlaylistSong, Song } from '../types';

interface PlaylistState {
  playlists: Playlist[];
  currentPlaylist: Playlist | null;
  songs: PlaylistSong[];
  loading: boolean;
  error: string | null;
}

type ToastFn = ((message: string, type?: 'success' | 'error' | 'info') => void) | undefined;

interface PlaylistActions {
  createPlaylist: (name: string, toast?: ToastFn) => Promise<void>;
  addSong: (playlistId: number, song: Song, toast?: ToastFn) => Promise<void>;
  removeSong: (playlistId: number, playlistSongId: number, toast?: ToastFn) => Promise<void>;
  deletePlaylist: (playlistId: number, toast?: ToastFn) => Promise<void>;
  loadPlaylists: (toast?: ToastFn) => Promise<void>;
  setCurrentPlaylist: (playlist: Playlist | null) => void;
  loadSongs: (playlistId: number, toast?: ToastFn) => Promise<void>;
  importPlaylist: (filePath: string, format: string, toast?: ToastFn) => Promise<void>;
  exportPlaylist: (playlistId: number, toast?: ToastFn) => Promise<string>;
  reorderSongs: (playlistId: number, fromIndex: number, toIndex: number, toast?: ToastFn) => Promise<void>;
}

type PlaylistStore = PlaylistState & PlaylistActions;

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  playlists: [],
  currentPlaylist: null,
  songs: [],
  loading: false,
  error: null,

  createPlaylist: async (name: string, toast?: ToastFn) => {
    try {
      await createPlaylist(name);
      await get().loadPlaylists(toast);
      toast?.('歌单创建成功', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  addSong: async (playlistId: number, song: Song, toast?: ToastFn) => {
    try {
      await addToPlaylist(playlistId, song);
      const { currentPlaylist } = get();
      if (currentPlaylist && currentPlaylist.id === playlistId) {
        await get().loadSongs(playlistId, toast);
      }
      toast?.('歌曲已添加到歌单', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  removeSong: async (playlistId: number, playlistSongId: number, toast?: ToastFn) => {
    try {
      await removeFromPlaylist(playlistId, playlistSongId);
      const { currentPlaylist } = get();
      if (currentPlaylist && currentPlaylist.id === playlistId) {
        await get().loadSongs(playlistId, toast);
      }
      toast?.('歌曲已从歌单移除', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  deletePlaylist: async (playlistId: number, toast?: ToastFn) => {
    try {
      await deletePlaylist(playlistId);
      const { currentPlaylist } = get();
      if (currentPlaylist && currentPlaylist.id === playlistId) {
        set({ currentPlaylist: null, songs: [] });
      }
      await get().loadPlaylists(toast);
      toast?.('歌单已删除', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  loadPlaylists: async (toast?: ToastFn) => {
    set({ loading: true, error: null });
    try {
      const playlists = await listPlaylists();
      set({ playlists, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: message });
      toast?.(message, 'error');
    }
  },

  setCurrentPlaylist: (playlist: Playlist | null) => {
    set({ currentPlaylist: playlist, songs: playlist ? get().songs : [] });
  },

  loadSongs: async (playlistId: number, toast?: ToastFn) => {
    set({ loading: true, error: null });
    try {
      const songs = await getPlaylistSongs(playlistId);
      set({ songs, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: message });
      toast?.(message, 'error');
    }
  },

  importPlaylist: async (filePath: string, format: string, toast?: ToastFn) => {
    try {
      await importPlaylist(filePath, format);
      await get().loadPlaylists(toast);
      toast?.('歌单导入成功', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  exportPlaylist: async (playlistId: number, toast?: ToastFn) => {
    try {
      const path = await exportPlaylist(playlistId);
      toast?.('歌单导出成功', 'success');
      return path;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
      throw err;
    }
  },

  reorderSongs: async (playlistId: number, fromIndex: number, toIndex: number, toast?: ToastFn) => {
    const { songs } = get();
    if (fromIndex < 0 || fromIndex >= songs.length || toIndex < 0 || toIndex >= songs.length)
      return;

    const previousSongs = [...songs];
    const newSongs = [...songs];
    const [movedSong] = newSongs.splice(fromIndex, 1);
    newSongs.splice(toIndex, 0, movedSong);

    set({ songs: newSongs });

    try {
      await reorderPlaylistSongs(
        playlistId,
        newSongs.map((song) => song.id)
      );
      toast?.('歌曲顺序已调整', 'success');
    } catch (err) {
      set({ songs: previousSongs });
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },
}));
