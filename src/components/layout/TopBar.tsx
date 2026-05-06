import React from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Bell,
  Settings as SettingsIcon,
  Crown,
  History,
  LayoutGrid,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TopBar() {
  const navigate = useNavigate();

  return (
    <header className="top-bar">
      <div className="top-bar__left">
        {/* 品牌标识 */}
        <div className="top-bar__logo" onClick={() => navigate('/home')}>
          <LayoutGrid className="top-bar__logo-icon" />
          <span className="top-bar__logo-text">AurisLeft</span>
        </div>

        {/* 历史导航 */}
        <div className="top-bar__nav-controls">
          <button className="btn--icon" onClick={() => window.history.back()} title="后退">
            <ChevronLeft size={20} />
          </button>
          <button className="btn--icon" onClick={() => window.history.forward()} title="前进">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 全局搜索 */}
        <div className="top-bar__search">
          <Search className="top-bar__search-icon" size={16} />
          <input
            type="search"
            placeholder="搜索音乐、艺人、专辑..."
            className="input top-bar__search-input"
            onFocus={() => navigate('/search')}
          />
        </div>
      </div>

      <div className="top-bar__right">
        {/* 会员/权益入口 */}
        <button className="btn btn--subtle" style={{ color: 'var(--accent-orange)' }}>
          <Crown size={16} />
          <span>尊享会员</span>
        </button>

        {/* 功能入口 */}
        <div className="flex-center" style={{ gap: 'var(--space-xs)' }}>
          <button className="btn--icon" title="最近播放">
            <History size={20} />
          </button>
          <button className="btn--icon" title="通知中心">
            <Bell size={20} />
          </button>
          <button className="btn--icon" title="系统设置" onClick={() => navigate('/settings')}>
            <SettingsIcon size={20} />
          </button>
        </div>

        {/* 用户系统 */}
        <div className="top-bar__user">
          <div className="top-bar__avatar" />
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>领主将军阁下</span>
        </div>
      </div>
    </header>
  );
}
