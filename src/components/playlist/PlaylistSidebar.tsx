import { useState } from "react";
import { usePlaylistStore } from "../../store/playlistStore";
import type { Playlist } from "../../types";
import "./PlaylistSidebar.css";

interface PlaylistSidebarProps {
  onSelectPlaylist: (playlist: Playlist | null) => void;
  selectedPlaylist: Playlist | null;
}

export default function PlaylistSidebar({ onSelectPlaylist, selectedPlaylist }: PlaylistSidebarProps) {
  const playlists = usePlaylistStore((s) => s.playlists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playlist: Playlist } | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (name) {
      await createPlaylist(name);
      setNewName("");
      setShowNewInput(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCreate();
    } else if (e.key === "Escape") {
      setShowNewInput(false);
      setNewName("");
    }
  };

  const handleContextMenu = (e: React.MouseEvent, playlist: Playlist) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, playlist });
  };

  const handleDelete = async () => {
    if (contextMenu) {
      await deletePlaylist(contextMenu.playlist.id);
      if (selectedPlaylist?.id === contextMenu.playlist.id) {
        onSelectPlaylist(null);
      }
      setContextMenu(null);
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  return (
    <div className="playlist-sidebar" onClick={closeContextMenu}>
      <div className="playlist-sidebar__header">
        <h3 className="playlist-sidebar__title">播放列表</h3>
        <button className="playlist-sidebar__new-btn" onClick={() => setShowNewInput(true)}>
          +
        </button>
      </div>

      <div
        className={`playlist-sidebar__item${selectedPlaylist === null ? " playlist-sidebar__item--active" : ""}`}
        onClick={() => onSelectPlaylist(null)}
      >
        <span className="playlist-sidebar__icon">★</span>
        <span className="playlist-sidebar__name">收藏</span>
      </div>

      <div className="playlist-sidebar__list">
        {playlists.map((pl) => (
          <div
            key={pl.id}
            className={`playlist-sidebar__item${selectedPlaylist?.id === pl.id ? " playlist-sidebar__item--active" : ""}`}
            onClick={() => onSelectPlaylist(pl)}
            onContextMenu={(e) => handleContextMenu(e, pl)}
          >
            <span className="playlist-sidebar__name">{pl.name}</span>
            <span className="playlist-sidebar__count">{pl.songCount}</span>
          </div>
        ))}
      </div>

      {showNewInput && (
        <div className="playlist-sidebar__new-input">
          <input
            type="text"
            placeholder="播放列表名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <div className="playlist-sidebar__new-actions">
            <button className="playlist-sidebar__confirm-btn" onClick={handleCreate}>确定</button>
            <button onClick={() => { setShowNewInput(false); setNewName(""); }}>取消</button>
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="playlist-sidebar__context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button className="playlist-sidebar__context-item" onClick={handleDelete}>删除</button>
        </div>
      )}
    </div>
  );
}
