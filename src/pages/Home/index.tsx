import { usePlayerStore } from "../../store/playerStore";
import { usePlaylistStore } from "../../store/playlistStore";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PlaybackState } from "../../types";
import "./index.css";

export default function Home() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const playlists = usePlaylistStore((s) => s.playlists);
  const loadPlaylists = usePlaylistStore((s) => s.loadPlaylists);
  const navigate = useNavigate();

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const showLyric = currentSong && playbackState !== PlaybackState.Idle;

  const quickActions = [
    { label: "搜索音乐", icon: "🔍", action: () => navigate("/search") },
    { label: "本地音乐", icon: "💿", action: () => navigate("/local") },
    { label: "播放列表", icon: "🎵", action: () => navigate("/playlist") },
    { label: "下载管理", icon: "⬇️", action: () => navigate("/download") },
  ];

  return (
    <div className="home-page home-page--compact">
      <div className={`home-page__content${showLyric ? " home-page__content--with-lyric" : ""}`}>
        {!showLyric && (
          <>
            {/* 快捷入口 */}
            <section className="home-page__section home-page__section--featured">
              <div className="home-page__quick-actions">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    className="home-page__action-btn"
                    onClick={action.action}
                  >
                    <span className="home-page__action-icon">{action.icon}</span>
                    <span className="home-page__action-label">{action.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* 推荐歌单 */}
            <section className="home-page__section">
              <div className="home-page__section-header">
                <h3 className="home-page__section-title">我的歌单</h3>
                {playlists.length > 0 && (
                  <button 
                    className="home-page__view-all"
                    onClick={() => navigate("/playlist")}
                  >
                    查看全部
                  </button>
                )}
              </div>
              {playlists.length === 0 ? (
                <div className="home-page__empty-text">
                  <div className="home-page__empty-icon">🎵</div>
                  <div>暂无歌单</div>
                  <button 
                    className="home-page__create-btn"
                    onClick={() => navigate("/playlist")}
                  >
                    创建第一个歌单
                  </button>
                </div>
              ) : (
                <div className="home-page__grid">
                  {playlists.slice(0, 6).map((pl) => (
                    <div key={pl.id} className="home-compact-card" onClick={() => navigate("/playlist")}>
                      <div className="home-compact-card__cover">
                        <span className="home-compact-card__cover-icon">♪</span>
                      </div>
                      <div className="home-compact-card__meta">
                        <div className="home-compact-card__name" title={pl.name}>{pl.name}</div>
                        <div className="home-compact-card__sub">{pl.songCount} 首</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 最近播放 */}
            <section className="home-page__section">
              <h3 className="home-page__section-title">最近播放</h3>
              <div className="home-page__grid">
                <div className="home-compact-card home-compact-card--muted">
                  <div className="home-compact-card__cover">
                    <span className="home-compact-card__cover-icon">◌</span>
                  </div>
                  <div className="home-compact-card__meta">
                    <div className="home-compact-card__name">暂无播放记录</div>
                    <div className="home-compact-card__sub">播放歌曲后会在这里展示</div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {showLyric && (
        <div className="home-page__lyric-panel">
          <LyricDisplay lines={[]} />
        </div>
      )}
    </div>
  );
}
