import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Settings as SettingsIcon,
  Minus,
  Square,
  X,
  Copy,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSearchStore } from '../../store/searchStore';
import { useToast } from '../common/Toast/useToast';
import AppLogo from '../common/AppLogo';

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const search = useSearchStore((s) => s.search);
  const storeKeyword = useSearchStore((s) => s.keyword);
  const { addToast } = useToast();
  const [query, setQuery] = useState(storeKeyword || '');
  const [maximized, setMaximized] = useState(false);
  const isElectron = Boolean(window.electronAPI?.isElectron);

  // 与全局搜索状态同步（避免顶栏/页面关键词不一致）
  useEffect(() => {
    setQuery(storeKeyword || '');
  }, [storeKeyword]);

  useEffect(() => {
    if (!window.electronAPI?.windowControls) return;
    void window.electronAPI.windowControls.isMaximized().then(setMaximized);
    return window.electronAPI.on('window-state', (payload) => {
      const p = payload as { maximized?: boolean };
      if (typeof p?.maximized === 'boolean') setMaximized(p.maximized);
    });
  }, []);

  // 进入搜索页时自动聚焦顶栏搜索框
  useEffect(() => {
    if (location.pathname === '/search') {
      const el = document.querySelector<HTMLInputElement>('.top-bar__search-input');
      el?.focus();
    }
  }, [location.pathname]);

  const submitSearch = async () => {
    const keyword = query.trim();
    if (!keyword) {
      navigate('/search');
      return;
    }
    if (location.pathname !== '/search') {
      navigate('/search');
    }
    await search(keyword, 1, addToast);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitSearch();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submitSearch();
    }
  };

  return (
    <header className="top-bar">
      <div className="top-bar__drag" aria-hidden />

      <div className="top-bar__left">
        <div className="top-bar__logo no-drag" onClick={() => navigate('/home')} title="首页">
          <AppLogo size={28} showWordmark wordmarkClassName="top-bar__logo-text" />
        </div>

        <div className="top-bar__nav-controls no-drag">
          <button className="btn--icon" onClick={() => window.history.back()} title="后退">
            <ChevronLeft size={18} />
          </button>
          <button className="btn--icon" onClick={() => window.history.forward()} title="前进">
            <ChevronRight size={18} />
          </button>
        </div>

        <form className="top-bar__search no-drag" onSubmit={onSubmit}>
          <Search className="top-bar__search-icon" size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (location.pathname !== '/search') navigate('/search');
            }}
            placeholder="搜索歌曲、歌手、专辑…（回车）"
            className="input top-bar__search-input"
            aria-label="全局搜索"
          />
        </form>
      </div>

      <div className="top-bar__right no-drag">
        <button className="btn--icon" title="设置" onClick={() => navigate('/settings')}>
          <SettingsIcon size={18} />
        </button>

        {isElectron && (
          <div className="top-bar__win-controls">
            <button
              type="button"
              className="top-bar__win-btn"
              title="最小化"
              onClick={() => void window.electronAPI?.windowControls?.minimize()}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              className="top-bar__win-btn"
              title={maximized ? '还原' : '最大化'}
              onClick={async () => {
                const next = await window.electronAPI?.windowControls?.maximize();
                if (typeof next === 'boolean') setMaximized(next);
              }}
            >
              {maximized ? <Copy size={12} /> : <Square size={12} />}
            </button>
            <button
              type="button"
              className="top-bar__win-btn top-bar__win-btn--close"
              title="关闭"
              onClick={() => void window.electronAPI?.windowControls?.close()}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
