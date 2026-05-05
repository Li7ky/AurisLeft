import { NavLink } from "react-router-dom";
import { useLocation } from "react-router-dom";
import SearchBar from "../search/SearchBar";
import PlayerBar from "../player/PlayerBar";
import "./AppLayout.css";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/home") {
      return location.pathname === "/" || location.pathname === "/home";
    }
    return location.pathname === path;
  };

  const isPlaylistPage = location.pathname === "/playlist";

  return (
    <div className="app-layout">
      <header className="app-layout__header">
        <span className="app-layout__title">Music Player</span>
        <nav className="app-layout__nav">
          <NavLink
            to="/home"
            className={`app-layout__nav-link${isActive("/home") ? " app-layout__nav-link--active" : ""}`}
          >
            首页
          </NavLink>
          <NavLink
            to="/search"
            className={`app-layout__nav-link${isActive("/search") ? " app-layout__nav-link--active" : ""}`}
          >
            搜索
          </NavLink>
          <NavLink
            to="/playlist"
            className={`app-layout__nav-link${isActive("/playlist") ? " app-layout__nav-link--active" : ""}`}
          >
            歌单
          </NavLink>
          <NavLink
            to="/local"
            className={`app-layout__nav-link${isActive("/local") ? " app-layout__nav-link--active" : ""}`}
          >
            本地音乐
          </NavLink>
          <NavLink
            to="/download"
            className={`app-layout__nav-link${isActive("/download") ? " app-layout__nav-link--active" : ""}`}
          >
            下载管理
          </NavLink>
          <NavLink
            to="/settings"
            className={`app-layout__nav-link${isActive("/settings") ? " app-layout__nav-link--active" : ""}`}
          >
            设置
          </NavLink>
        </nav>
        <div className="app-layout__spacer" />
        <SearchBar />
      </header>

      <div className="app-layout__body">
        <main className={`app-layout__content${isPlaylistPage ? " app-layout__content--full" : ""}`}>
          {children}
        </main>
      </div>

      <PlayerBar />
    </div>
  );
}
