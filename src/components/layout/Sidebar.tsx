import {
  Home,
  Library,
  Download,
  FileMusic,
  Plus,
  Search,
  Settings,
  Heart,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { usePlaylistStore } from '../../store/playlistStore';
import { useToast } from '../common/Toast/useToast';
import TextDialog from '../common/TextDialog';

export default function Sidebar() {
  const navigate = useNavigate();
  const playlists = usePlaylistStore((s) => s.playlists);
  const loadPlaylists = usePlaylistStore((s) => s.loadPlaylists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const setCurrentPlaylist = usePlaylistStore((s) => s.setCurrentPlaylist);
  const { addToast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const handleCreateConfirm = async (name: string) => {
    setCreateOpen(false);
    await createPlaylist(name, addToast);
    navigate('/playlist');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__brand-space" />

      <div className="sidebar__section">
        <h3 className="sidebar__title">浏览</h3>
        <nav>
          <NavLink
            to="/home"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Home className="sidebar__nav-icon" size={18} />
            <span>首页</span>
          </NavLink>
          <NavLink
            to="/search"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Search className="sidebar__nav-icon" size={18} />
            <span>搜索</span>
          </NavLink>
        </nav>
      </div>

      <div className="sidebar__section">
        <h3 className="sidebar__title">音乐库</h3>
        <nav>
          <NavLink
            to="/local"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <FileMusic className="sidebar__nav-icon" size={18} />
            <span>本地音乐</span>
          </NavLink>
          <NavLink
            to="/favorites"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Heart className="sidebar__nav-icon" size={18} />
            <span>我的收藏</span>
          </NavLink>
          <NavLink
            to="/download"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Download className="sidebar__nav-icon" size={18} />
            <span>下载管理</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Settings className="sidebar__nav-icon" size={18} />
            <span>设置</span>
          </NavLink>
        </nav>
      </div>

      <div className="sidebar__section sidebar__section--grow">
        <div className="sidebar__playlist-header">
          <h3 className="sidebar__title" style={{ margin: 0, padding: 0 }}>
            歌单
          </h3>
          <button
            className="btn--icon sidebar__add-btn"
            title="新建歌单"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} />
          </button>
        </div>
        <nav className="sidebar__playlist-nav">
          <NavLink
            to="/playlist"
            end
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
            onClick={() => setCurrentPlaylist(null)}
          >
            <Library className="sidebar__nav-icon" size={18} />
            <span className="truncate">全部歌单</span>
          </NavLink>
          {playlists.map((playlist) => (
            <NavLink
              key={playlist.id}
              to={`/playlist/${playlist.id}`}
              className={({ isActive }) =>
                `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
              }
              onClick={() => setCurrentPlaylist(playlist)}
            >
              <Library className="sidebar__nav-icon" size={18} />
              <span className="truncate">{playlist.name}</span>
              <span className="sidebar__count">{playlist.songCount}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <TextDialog
        open={createOpen}
        title="新建歌单"
        label="歌单名称"
        placeholder="例如：通勤精选"
        defaultValue={`我的歌单 ${playlists.length + 1}`}
        confirmText="创建"
        onConfirm={(v) => void handleCreateConfirm(v)}
        onCancel={() => setCreateOpen(false)}
      />
    </aside>
  );
}
