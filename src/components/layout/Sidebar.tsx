import {
  Home,
  Library,
  Download,
  FileMusic,
  PlusSquare,
  Search,
} from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { usePlaylistStore } from '../../store/playlistStore';

export default function Sidebar() {
  const navigate = useNavigate();
  const playlists = usePlaylistStore((s) => s.playlists);
  const loadPlaylists = usePlaylistStore((s) => s.loadPlaylists);
  const setCurrentPlaylist = usePlaylistStore((s) => s.setCurrentPlaylist);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const openPlaylistRoot = () => {
    setCurrentPlaylist(null);
    navigate('/playlist');
  };

  return (
    <aside className="sidebar">
      {/* 发现音乐 */}
      <div className="sidebar__section">
        <h3 className="sidebar__title">在线内容</h3>
        <nav>
          <NavLink
            to="/home"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Home className="sidebar__nav-icon" />
            <span>首页推荐</span>
          </NavLink>
          <NavLink
            to="/search"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Search className="sidebar__nav-icon" />
            <span>搜索音乐</span>
          </NavLink>
        </nav>
      </div>

      {/* 我的音乐 */}
      <div className="sidebar__section">
        <h3 className="sidebar__title">我的音乐</h3>
        <nav>
          <NavLink
            to="/local"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <FileMusic className="sidebar__nav-icon" />
            <span>本地音乐</span>
          </NavLink>
          <NavLink
            to="/download"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Download className="sidebar__nav-icon" />
            <span>下载管理</span>
          </NavLink>
        </nav>
      </div>

      {/* 收藏歌单 */}
      <div className="sidebar__section" style={{ flex: 1, overflowY: 'auto' }}>
        <div
          className="flex-between"
          style={{ padding: '0 var(--space-md)', marginBottom: 'var(--space-sm)' }}
        >
          <h3 className="sidebar__title" style={{ padding: 0, margin: 0 }}>
            创建的歌单
          </h3>
          <button
            className="btn--icon"
            style={{ width: 20, height: 20 }}
            title="新建歌单"
            onClick={openPlaylistRoot}
          >
            <PlusSquare size={14} />
          </button>
        </div>
        <nav>
          <NavLink
            to="/playlist"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
            onClick={() => setCurrentPlaylist(null)}
          >
            <Library className="sidebar__nav-icon" />
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
              <Library className="sidebar__nav-icon" />
              <span className="truncate">{playlist.name}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
