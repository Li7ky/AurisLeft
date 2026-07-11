import { useState, useEffect, useCallback } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { usePlaylistStore } from '../../store/playlistStore';
import { usePlayerStore } from '../../store/playerStore';
import { useToast } from '../common/Toast/useToast';
import type { Playlist, PlaylistSong } from '../../types';
import { Quality } from '../../types';
import { playlistSongToSong, songKey } from '../../utils/song';
import CoverImage from '../common/CoverImage';
import './PlaylistPanel.css';

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SongRowProps {
  song: PlaylistSong;
  index: number;
  onContextMenu: (e: React.MouseEvent, song: PlaylistSong) => void;
  moveRow: (fromIndex: number, toIndex: number) => void;
}

function SongRow({ song, index, onContextMenu, moveRow, allSongs }: SongRowProps & { allSongs: PlaylistSong[] }) {
  const playList = usePlayerStore((s) => s.playList);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const { addToast } = useToast();
  const mapped = playlistSongToSong(song);
  const isActive = currentSong ? songKey(currentSong) === songKey(mapped) : false;

  const [{ isDragging }, drag] = useDrag({
    type: 'playlist-song',
    item: { index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: 'playlist-song',
    hover: (draggedItem: { index: number }) => {
      if (draggedItem.index !== index) {
        moveRow(draggedItem.index, index);
        draggedItem.index = index;
      }
    },
  });

  const handlePlay = () => {
    const list = allSongs.map((s) => playlistSongToSong(s));
    void playList(list, index, Quality.K320, addToast);
  };

  return (
    <div
      ref={
        ((node: HTMLDivElement | null) => {
          drag(drop(node));
        }) as React.Ref<HTMLDivElement>
      }
      className={`playlist-row${isActive ? ' playlist-row--active' : ''}${isDragging ? ' playlist-row--dragging' : ''}`}
      onClick={handlePlay}
      onContextMenu={(e) => onContextMenu(e, song)}
    >
      <div className="playlist-row__index-wrap">
        <span className="playlist-row__index">{index + 1}</span>
        <button className="playlist-row__play-icon" aria-label="播放">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <polygon points="8 5 19 12 8 19" />
          </svg>
        </button>
      </div>
      <div className="playlist-row__title">
        <div className="playlist-row__cover">
          <CoverImage src={song.coverUrl} alt="" size={14} />
        </div>
        <div className="playlist-row__title-text">
          <div className="playlist-row__name" title={song.name}>
            {song.name}
          </div>
          <div className="playlist-row__artist" title={song.artist}>
            {song.artist}
          </div>
        </div>
      </div>
      <div className="playlist-row__album" title={song.album ?? '--'}>
        {song.album ?? '--'}
      </div>
      <div className="playlist-row__duration">{formatDuration(song.duration)}</div>
      <div className="playlist-row__actions">
        <button
          className="playlist-row__more-btn"
          aria-label="更多操作"
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e, song);
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <circle cx="12" cy="6" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="18" r="2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface AddToPlaylistDialogProps {
  song: PlaylistSong;
  onClose: () => void;
}

function AddToPlaylistDialog({ song, onClose }: AddToPlaylistDialogProps) {
  const playlists = usePlaylistStore((s) => s.playlists);
  const addSong = usePlaylistStore((s) => s.addSong);
  const { addToast } = useToast();
  const [searchText, setSearchText] = useState('');

  const filtered = playlists.filter((pl) =>
    pl.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleAdd = async (playlistId: number) => {
    await addSong(playlistId, {
      id: song.songId,
      name: song.name,
      artist: song.artist,
      album: song.album ?? '',
      duration: song.duration ?? 0,
      coverUrl: song.coverUrl,
      source: song.source,
      songId: song.songId,
      qualities: song.qualities ?? [Quality.K320],
    }, addToast);
    onClose();
  };

  return (
    <div className="playlist-panel__dialog-overlay" onClick={onClose}>
      <div className="playlist-panel__dialog" onClick={(e) => e.stopPropagation()}>
        <h4 className="playlist-panel__dialog-title">添加到播放列表</h4>
        <input
          type="text"
          placeholder="搜索播放列表..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="playlist-panel__dialog-input"
          autoFocus
        />
        <div className="playlist-panel__dialog-list">
          {filtered.map((pl) => (
            <button
              key={pl.id}
              className="playlist-panel__dialog-item"
              onClick={() => handleAdd(pl.id)}
            >
              <span>{pl.name}</span>
              <span className="playlist-panel__dialog-count">{pl.songCount}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="playlist-panel__dialog-empty">未找到匹配的播放列表</div>
          )}
        </div>
        <button className="playlist-panel__dialog-close" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}

interface PlaylistPanelProps {
  playlist: Playlist | null;
}

export default function PlaylistPanel({ playlist }: PlaylistPanelProps) {
  const songs = usePlaylistStore((s) => s.songs);
  const loading = usePlaylistStore((s) => s.loading);
  const removeSong = usePlaylistStore((s) => s.removeSong);
  const loadSongs = usePlaylistStore((s) => s.loadSongs);
  const reorderSongs = usePlaylistStore((s) => s.reorderSongs);
  const playList = usePlayerStore((s) => s.playList);
  const { addToast } = useToast();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    song: PlaylistSong;
  } | null>(null);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState<PlaylistSong | null>(null);

  useEffect(() => {
    if (playlist) {
      loadSongs(playlist.id, addToast);
    }
  }, [playlist, loadSongs, addToast]);

  const handleContextMenu = useCallback((e: React.MouseEvent, song: PlaylistSong) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  }, []);

  const handleRemove = async () => {
    if (contextMenu && playlist) {
      await removeSong(playlist.id, contextMenu.song.id, addToast);
      setContextMenu(null);
    }
  };

  const handleAddToPlaylist = () => {
    if (contextMenu) {
      setAddToPlaylistSong(contextMenu.song);
      setContextMenu(null);
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  const moveRow = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (playlist) {
        void reorderSongs(playlist.id, fromIndex, toIndex);
      }
    },
    [playlist, reorderSongs]
  );

  const handlePlayAll = () => {
    if (!songs.length) {
      addToast('歌单暂无歌曲，先去搜索页添加喜欢的音乐吧', 'info');
      return;
    }
    const list = songs.map((s) => playlistSongToSong(s));
    void playList(list, 0, Quality.K320, addToast);
  };

  if (!playlist) {
    return (
      <div className="playlist-panel" onClick={closeContextMenu}>
        <div className="playlist-panel__header">
          <div className="playlist-panel__header-info">
            <h1 className="playlist-panel__title">播放列表</h1>
            <p className="playlist-panel__subtitle">选择左侧的播放列表查看歌曲</p>
          </div>
        </div>
      </div>
    );
  }

  const createdDate = playlist.createdAt
    ? new Date(playlist.createdAt).toLocaleDateString('zh-CN')
    : '';

  return (
    <div className="playlist-panel" onClick={closeContextMenu}>
      <div className="playlist-panel__header">
        <div className="playlist-panel__header-cover">
          <CoverImage src={songs[0]?.coverUrl} alt="" size={40} />
        </div>
        <div className="playlist-panel__header-info">
          <span className="playlist-panel__label">播放列表</span>
          <h1 className="playlist-panel__title">{playlist.name}</h1>
          <div className="playlist-panel__meta">
            <span>{songs.length} 首歌曲</span>
            {createdDate && <span>· {createdDate}</span>}
          </div>
          <div className="playlist-panel__actions">
            <button className="btn btn--primary" onClick={handlePlayAll}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <polygon points="8 5 19 12 8 19" />
              </svg>
              播放全部
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => addToast('可在搜索页右键歌曲添加到歌单', 'info')}
            >
              添加歌曲
            </button>
          </div>
        </div>
      </div>

      <div className="playlist-panel__table-header">
        <div className="playlist-panel__th">#</div>
        <div className="playlist-panel__th">标题</div>
        <div className="playlist-panel__th">专辑</div>
        <div className="playlist-panel__th">时长</div>
        <div className="playlist-panel__th" />
      </div>

      {loading ? (
        <div className="playlist-panel__loading">加载中...</div>
      ) : songs.length === 0 ? (
        <div className="playlist-panel__empty">
          <div className="playlist-panel__empty-title">该歌单还是空的</div>
          <div className="playlist-panel__empty-desc">去搜索页发现歌曲，并通过歌曲菜单添加到这个歌单。</div>
        </div>
      ) : (
        <div className="playlist-panel__list">
          {songs.map((song, idx) => (
            <SongRow
              key={song.id}
              song={song}
              index={idx}
              allSongs={songs}
              onContextMenu={handleContextMenu}
              moveRow={moveRow}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <div
          className="playlist-panel__context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="playlist-panel__context-item" onClick={handleRemove}>
            移除
          </button>
          <button className="playlist-panel__context-item" onClick={handleAddToPlaylist}>
            添加到其他列表
          </button>
        </div>
      )}

      {addToPlaylistSong && (
        <AddToPlaylistDialog song={addToPlaylistSong} onClose={() => setAddToPlaylistSong(null)} />
      )}
    </div>
  );
}
