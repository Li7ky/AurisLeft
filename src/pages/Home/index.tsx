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
    <div style={{ display: "flex", gap: "12px", height: "100%" }}>
      <div style={{ flex: showLyric ? 1 : undefined, minWidth: 0 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
          欢迎使用 Music Player
        </h2>

        {!showLyric && (
          <>
            <section style={{ marginBottom: "20px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "10px", color: "var(--text-secondary)" }}>
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
                        borderRadius: "6px",
                        padding: "10px 14px",
                        minWidth: "120px",
                      }}
                    >
                      <div style={{ fontWeight: 500, fontSize: "13px" }}>{pl.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        {pl.songCount} 首
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "10px", color: "var(--text-secondary)" }}>
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
        <div style={{ flex: 1, minWidth: 0, background: "var(--surface)", borderRadius: "6px" }}>
          <LyricDisplay lines={[]} />
        </div>
      )}
    </div>
  );
}
