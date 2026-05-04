import { usePlayerStore } from "../../store/playerStore";
import { usePlaylistStore } from "../../store/playlistStore";
import { useEffect } from "react";
import LyricDisplay from "../../components/lyric/LyricDisplay";
import { PlaybackState } from "../../types";

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
    <div style={{ display: "flex", gap: "16px", height: "100%" }}>
      <div style={{ flex: showLyric ? 1 : undefined, minWidth: 0 }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
          欢迎使用 Music Player
        </h2>

        {!showLyric && (
          <>
            <section style={{ marginBottom: "24px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: "var(--text-secondary)" }}>
                我的歌单
              </h3>
              {playlists.length === 0 ? (
                <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>暂无歌单</div>
              ) : (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {playlists.map((pl) => (
                    <div
                      key={pl.id}
                      style={{
                        background: "var(--surface)",
                        borderRadius: "8px",
                        padding: "12px 16px",
                        minWidth: "120px",
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{pl.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {pl.songCount} 首
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: "var(--text-secondary)" }}>
                最近播放
              </h3>
              <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                暂无最近播放记录
              </div>
            </section>
          </>
        )}
      </div>

      {showLyric && (
        <div style={{ flex: 1, minWidth: 0, background: "var(--surface)", borderRadius: "8px" }}>
          <LyricDisplay lines={[]} />
        </div>
      )}
    </div>
  );
}
