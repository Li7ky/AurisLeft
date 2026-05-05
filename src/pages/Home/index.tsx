import { usePlayerStore } from "../../store/playerStore";
import { usePlaylistStore } from "../../store/playlistStore";
import { useEffect } from "react";
import LyricDisplay from "../../components/lyric/LyricDisplay";
import { PlaybackState } from "../../types";
import "./index.css";

export default function Home() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const playlists = usePlaylistStore((s) => s.playlists);
  const loadPlaylists = usePlaylistStore((s) => s.loadPlaylists);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const showLyric = currentSong && playbackState !== PlaybackState.Idle;

  return (
    <div className="home-page home-page--compact">
      <div className={`home-page__content${showLyric ? " home-page__content--with-lyric" : ""}`}>
        <h2 className="home-page__title">欢迎使用左耳</h2>

        {!showLyric && (
          <>
            <section className="home-page__section">
              <h3 className="home-page__section-title">推荐歌单</h3>
              {playlists.length === 0 ? (
                <div className="home-page__empty-text">暂无歌单</div>
              ) : (
                <div className="home-page__grid">
                  {playlists.map((pl) => (
                    <div key={pl.id} className="home-compact-card">
                      <div className="home-compact-card__icon">♪</div>
                      <div className="home-compact-card__meta">
                        <div className="home-compact-card__name" title={pl.name}>{pl.name}</div>
                        <div className="home-compact-card__sub">{pl.songCount} 首</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="home-page__section">
              <h3 className="home-page__section-title">最近播放</h3>
              <div className="home-page__grid">
                <div className="home-compact-card home-compact-card--muted">
                  <div className="home-compact-card__icon">◌</div>
                  <div className="home-compact-card__meta">
                    <div className="home-compact-card__name">暂无最近播放</div>
                    <div className="home-compact-card__sub">播放后会在这里展示</div>
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
