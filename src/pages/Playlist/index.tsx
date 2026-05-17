import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PlaylistSidebar from '../../components/playlist/PlaylistSidebar';
import PlaylistPanel from '../../components/playlist/PlaylistPanel';
import { usePlaylistStore } from '../../store/playlistStore';
import { useToast } from '../../components/common/Toast/useToast';
import './index.css';

export default function Playlist() {
  const { id } = useParams();
  const navigate = useNavigate();
  const playlists = usePlaylistStore((s) => s.playlists);
  const currentPlaylist = usePlaylistStore((s) => s.currentPlaylist);
  const loadPlaylists = usePlaylistStore((s) => s.loadPlaylists);
  const setCurrentPlaylist = usePlaylistStore((s) => s.setCurrentPlaylist);
  const { addToast } = useToast();

  useEffect(() => {
    loadPlaylists(addToast);
  }, [loadPlaylists, addToast]);

  const routePlaylist = useMemo(() => {
    const playlistId = Number(id);
    if (!Number.isFinite(playlistId)) return null;
    return playlists.find((playlist) => playlist.id === playlistId) ?? null;
  }, [id, playlists]);

  useEffect(() => {
    setCurrentPlaylist(routePlaylist);
  }, [routePlaylist, setCurrentPlaylist]);

  const handleSelectPlaylist = (playlist: typeof currentPlaylist) => {
    setCurrentPlaylist(playlist);
    if (playlist) {
      navigate(`/playlist/${playlist.id}`);
    } else {
      navigate('/playlist');
    }
  };

  return (
    <div className="playlist-page">
      <div className="playlist-page__sidebar">
        <PlaylistSidebar
          onSelectPlaylist={handleSelectPlaylist}
          selectedPlaylist={currentPlaylist}
        />
      </div>
      <div className="playlist-page__content">
        <PlaylistPanel playlist={currentPlaylist} />
      </div>
    </div>
  );
}
