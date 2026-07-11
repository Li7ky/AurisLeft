import { useEffect, useState } from 'react';
import { usePlaylistStore } from '../../store/playlistStore';
import { useToast } from './Toast/useToast';
import type { Song } from '../../types';
import './AddToPlaylistDialog.css';

interface Props {
  song: Song | null;
  open: boolean;
  onClose: () => void;
}

export default function AddToPlaylistDialog({ song, open, onClose }: Props) {
  const playlists = usePlaylistStore((s) => s.playlists);
  const loadPlaylists = usePlaylistStore((s) => s.loadPlaylists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const addSong = usePlaylistStore((s) => s.addSong);
  const { addToast } = useToast();
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (open) {
      void loadPlaylists();
      setFilter('');
      setCreating(false);
      setNewName('');
    }
  }, [open, loadPlaylists]);

  if (!open || !song) return null;

  const filtered = playlists.filter((p) =>
    p.name.toLowerCase().includes(filter.trim().toLowerCase())
  );

  const handleAdd = async (playlistId: number) => {
    await addSong(playlistId, song, addToast);
    onClose();
  };

  const handleCreateAndAdd = async () => {
    const name = newName.trim() || `${song.name} 相关`;
    await createPlaylist(name, addToast);
    await loadPlaylists();
    const list = usePlaylistStore.getState().playlists;
    const created = list.find((p) => p.name === name) || list[0];
    if (created) {
      await addSong(created.id, song, addToast);
    }
    onClose();
  };

  return (
    <div className="atp-overlay" onClick={onClose}>
      <div className="atp-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="atp-title">添加到歌单</h3>
        <p className="atp-song truncate">
          {song.name} · {song.artist}
        </p>
        <input
          className="atp-input"
          placeholder="筛选歌单…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />
        <div className="atp-list">
          {filtered.map((pl) => (
            <button key={pl.id} type="button" className="atp-item" onClick={() => void handleAdd(pl.id)}>
              <span className="truncate">{pl.name}</span>
              <span className="atp-count">{pl.songCount}</span>
            </button>
          ))}
          {filtered.length === 0 && !creating && (
            <div className="atp-empty">暂无匹配歌单</div>
          )}
        </div>
        {creating ? (
          <div className="atp-create-row">
            <input
              className="atp-input"
              placeholder="新歌单名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateAndAdd();
              }}
            />
            <button type="button" className="btn btn--primary" onClick={() => void handleCreateAndAdd()}>
              创建并添加
            </button>
          </div>
        ) : (
          <button type="button" className="atp-new" onClick={() => setCreating(true)}>
            + 新建歌单并添加
          </button>
        )}
        <button type="button" className="btn btn--ghost atp-close" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}
