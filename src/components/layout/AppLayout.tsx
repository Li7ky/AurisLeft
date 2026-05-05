import { NavLink } from "react-router-dom";
import { useLocation } from "react-router-dom";
import PlayerBar from "../player/PlayerBar";
import "./AppLayout.css";

const NAV_ITEMS = [
  { to: "/home", label: "首页", icon: "🏠" },
  { to: "/search", label: "搜索", icon: "🔍" },
  { to: "/local", label: "本地音乐", icon: "💿" },
  { to: "/playlist", label: "播放列表", icon: "🎵" },
  { to: "/download", label: "下载管理", icon: "⬇️" },
  { to: "/settings", label: "设置", icon: "⚙️" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/home") {
      return location.pathname === "/" || location.pathname === "/home";
    }
    return location.pathname === path;
  };

  return (
    <div className="app-layout">
      <aside className="app-layout__sidebar">
        <div className="app-layout__sidebar-top">
          <div className="app-layout__logo">
            <span className="app-layout__logo-icon">🎧</span>
            <span className="app-layout__logo-text">Music Player</span>
          </div>
          <nav className="app-layout__nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={`app-layout__nav-link${
                  isActive(item.to) ? " app-layout__nav-link--active" : ""
                }`}
              >
                <span className="app-layout__nav-icon">{item.icon}</span>
                <span className="app-layout__nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="app-layout__sidebar-bottom">
          <div className="app-layout__user">v0.1.0</div>
        </div>
      </aside>

      <div className="app-layout__main">
        <main className="app-layout__content">{children}</main>
      </div>

      <PlayerBar />
    </div>
  );
}
