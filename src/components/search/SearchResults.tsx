import { useSearchStore } from "../../store/searchStore";
import { usePlayerStore } from "../../store/playerStore";
import { Quality } from "../../types";
import type { Song } from "../../types";
import "./SearchResults.css";

function formatDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SongRow({ song }: { song: Song }) {
  const play = usePlayerStore((s) => s.play);

  const handlePlay = () => {
    play(song, song.qualities.includes(song.qualities[0]) ? song.qualities[0] : Quality.K320);
  };

  return (
    <div className="search-results__row" onClick={handlePlay}>
      {song.coverUrl ? (
        <img className="search-results__cover" src={song.coverUrl} alt="" />
      ) : (
        <div className="search-results__cover" />
      )}
      <div className="search-results__name" title={song.name}>{song.name}</div>
      <div className="search-results__artist" title={song.artist}>{song.artist}</div>
      <div className="search-results__album" title={song.album || ""}>{song.album || "--"}</div>
      <div className="search-results__duration">{formatDuration(song.duration)}</div>
      <div className="search-results__play-icon">▶</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="search-results__skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="search-results__skeleton-row" />
      ))}
    </div>
  );
}

export default function SearchResults() {
  const results = useSearchStore((s) => s.results);
  const loading = useSearchStore((s) => s.loading);
  const keyword = useSearchStore((s) => s.keyword);

  if (loading) {
    return <div className="search-results"><Skeleton /></div>;
  }

  if (!keyword) {
    return <div className="search-results__empty">输入关键词开始搜索</div>;
  }

  if (results.size === 0) {
    return <div className="search-results__empty">未找到相关结果</div>;
  }

  return (
    <div className="search-results">
      {Array.from(results.entries()).map(([source, songs]) => (
        <div key={source} className="search-results__group">
          <div className="search-results__source">{source}</div>
          <div className="search-results__list">
            {songs.map((song) => (
              <SongRow key={song.id + song.source + song.songId} song={song} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
