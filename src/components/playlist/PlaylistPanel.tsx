import { useState, useEffect, useCallback } from "react";
import { useDrag, useDrop } from "react-dnd";
import { usePlaylistStore } from "../../store/playlistStore";
import { usePlayerStore } from "../../store/playerStore";
import type { Playlist, PlaylistSong } from "../../types";
import { Quality } from "../../types";
import "./PlaylistPanel.css";

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface SongRowProps {
  song: PlaylistSong;
  index: number;
  onContextMenu: (e: React.MouseEvent, song: PlaylistSong) => void;
  moveRow: (fromIndex: number, toIndex: number) => void;
}

function SongRow({ song, index, onContextMenu, moveRow }: SongRowProps) {
  const play = usePlayerStore((s) => s.play);

  const [{ isDragging }, drag] = useDrag({
    type: "playlist-song",
    item: { index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: "playlist-song",
    hover: (draggedItem: { index: number }) => {
      if (draggedItem.index !== index) {
        moveRow(draggedItem.index, index);
        draggedItem.index = index;
      }
    },
  });

  const handlePlay = () => {
    const quality = Quality.K320;
    play(
      {
        id: song.songId,
        name: song.name,
        artist: song.artist,
        album: song.album ?? "",
        duration: song.duration ?? 0,
        coverUrl: song.coverUrl,
        source: song.source,
        songId: song.songId,
        qualities: song.qualities ?? [quality],
      },
      quality
    );
  };

  return (
    <div
      ref={
        ((node: HTMLDivElement | null) => {
          drag(drop(node));
        }) as React.Ref<HTMLDivElement>
      }
      className={`playlist-panel__row${isDragging ? " playlist-panel__row--dragging" : ""}`}
      onClick={handlePlay}
      onContextMenu={(e) => onContextMenu(e, song)}
    >
      <div className="playlist-panel__index">{index + 1}</div>
      <div className="playlist-panel__name" title={song.name}>{song.name}</div>
      <div className="playlist-panel__artist" title={song.artist}>{song.artist}</div>
      <div className="playlist-panel__album" title={song.album ?? "--"}>{song.album ?? "--"}</div>
      <div className="playlist-panel__duration">{formatDuration(song.duration)}</div>
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
  const [searchText, setSearchText] = useState("");

  const filtered = playlists.filter((pl) => pl.name.toLowerCase().includes(searchText.toLowerCase()));

  const handleAdd = async (playlistId: number) => {
    await addSong(playlistId, {
      id: song.songId,
      name: song.name,
      artist: song.artist,
      album: song.album ?? "",
      duration: song.duration ?? 0,
      coverUrl: song.coverUrl,
      source: song.source,
      songId: song.songId,
      qualities: song.qualities ?? [Quality.K320],
    });
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
            <button key={pl.id} className="playlist-panel__dialog-item" onClick={() => handleAdd(pl.id)}>
              <span>{pl.name}</span>
              <span className="playlist-panel__dialog-count">{pl.songCount}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="playlist-panel__dialog-empty">未找到匹配的播放列表</div>
          )}
        </div>
        <button className="playlist-panel__dialog-close" onClick={onClose}>关闭</button>
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: PlaylistSong } | null>(null);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState<PlaylistSong | null>(null);

  useEffect(() => {
    if (playlist) {
      loadSongs(playlist.id);
    }
  }, [playlist, loadSongs]);

  const handleContextMenu = useCallback((e: React.MouseEvent, song: PlaylistSong) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  }, []);

  const handleRemove = async () => {
    if (contextMenu && playlist) {
      await removeSong(playlist.id, contextMenu.song.id);
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

  const moveRow = useCallback((fromIndex: number, toIndex: number) => {
    if (playlist) {
      reorderSongs(playlist.id, fromIndex, toIndex);
    }
  }, [playlist, reorderSongs]);

  if (!playlist) {
    return (
      <div className="playlist-panel" onClick={closeContextMenu}>
        <div className="playlist-panel__header">
          <h2 className="playlist-panel__title">收藏</h2>
        </div>
        <div className="playlist-panel__empty">选择左侧的播放列表查看歌曲</div>
      </div>
    );
  }

  return (
    <div className="playlist-panel" onClick={closeContextMenu}>
      <div className="playlist-panel__header">
        <h2 className="playlist-panel__title">{playlist.name}</h2>
        <span className="playlist-panel__count">{songs.length} 首歌曲</span>
      </div>

      <div className="playlist-panel__table-header">
        <div className="playlist-panel__th">#</div>
        <div className="playlist-panel__th">歌曲</div>
        <div className="playlist-panel__th">歌手</div>
        <div className="playlist-panel__th">专辑</div>
        <div className="playlist-panel__th">时长</div>
      </div>

      {loading ? (
        <div className="playlist-panel__loading">加载中...</div>
      ) : songs.length === 0 ? (
        <div className="playlist-panel__empty">该列表暂无歌曲</div>
      ) : (
        <div className="playlist-panel__list">
          {songs.map((song, idx) => (
            <SongRow key={song.id} song={song} index={idx} onContextMenu={handleContextMenu} moveRow={moveRow} />
          ))}
        </div>
      )}

      {contextMenu && (
        <div className="playlist-panel__context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button className="playlist-panel__context-item" onClick={handleRemove}>移除</button>
          <button className="playlist-panel__context-item" onClick={handleAddToPlaylist}>添加到其他列表</button>
        </div>
      )}

      {addToPlaylistSong && (
        <AddToPlaylistDialog song={addToPlaylistSong} onClose={() => setAddToPlaylistSong(null)} />
      )}
    </div>
  );
}
