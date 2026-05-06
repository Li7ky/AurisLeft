import React from 'react';
import {
  Home,
  Compass,
  Music2,
  Mic2,
  Video,
  Radio,
  Library,
  Heart,
  Download,
  Clock,
  FileMusic,
  PlusSquare,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
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
            to="/discover"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Compass className="sidebar__nav-icon" />
            <span>发现音乐</span>
          </NavLink>
          <NavLink
            to="/mv"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Video className="sidebar__nav-icon" />
            <span>精彩视频</span>
          </NavLink>
          <NavLink
            to="/fm"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Radio className="sidebar__nav-icon" />
            <span>FM 电台</span>
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
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
            }
          >
            <Clock className="sidebar__nav-icon" />
            <span>最近播放</span>
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
          <button className="btn--icon" style={{ width: 20, height: 20 }} title="新建歌单">
            <PlusSquare size={14} />
          </button>
        </div>
        <nav>
          <NavLink to="/playlist/fav" className="sidebar__nav-item">
            <Heart className="sidebar__nav-icon" style={{ color: 'var(--accent-magenta)' }} />
            <span>我喜欢的音乐</span>
          </NavLink>
          <NavLink to="/playlist/1" className="sidebar__nav-item">
            <Library className="sidebar__nav-icon" />
            <span className="truncate">驾驶燃曲 - 赛博朋克</span>
          </NavLink>
          <NavLink to="/playlist/2" className="sidebar__nav-item">
            <Library className="sidebar__nav-icon" />
            <span className="truncate">工作专注 - 低保真...</span>
          </NavLink>
          <NavLink to="/playlist/3" className="sidebar__nav-item">
            <Library className="sidebar__nav-icon" />
            <span className="truncate">周杰伦精选集</span>
          </NavLink>
        </nav>
      </div>
    </aside>
  );
}
