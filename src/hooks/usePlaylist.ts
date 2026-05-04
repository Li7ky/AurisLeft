import { useEffect } from "react";
import { usePlaylistStore } from "../store/playlistStore";
import type { Playlist } from "../types";

interface UsePlaylistReturn {
  playlists: Playlist[];
  loading: boolean;
}

export function usePlaylist(): UsePlaylistReturn {
  const playlists = usePlaylistStore((s) => s.playlists);
  const loading = usePlaylistStore((s) => s.loading);
  const loadPlaylists = usePlaylistStore((s) => s.loadPlaylists);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  return { playlists, loading };
}
