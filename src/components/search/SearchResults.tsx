import { useSearchStore } from '../../store/searchStore';
import { usePlayerStore } from '../../store/playerStore';
import { useToast } from '../common/Toast/useToast';
import { useDownloadStore } from '../../store/downloadStore';
import { Quality } from '../../types';
import type { Song } from '../../types';
import './SearchResults.css';

function SongCard({ song }: { song: Song }) {
  const play = usePlayerStore((s) => s.play);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const toast = useToast();
  const addTask = useDownloadStore((s) => s.addTask);
  const isActive = currentSong?.id === song.id && currentSong?.source === song.source;
  const quality = song.qualities[0] ?? Quality.K320;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    play(song, quality, toast.addToast);
  };

  const handleCardClick = () => {
    play(song, quality, toast.addToast);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await addTask(song, quality);
    toast.addToast('已加入下载任务', 'success');
  };

  return (
    <div className={`song-card${isActive ? ' song-card--active' : ''}`} onClick={handleCardClick}>
      <div className="song-card__cover">
        {song.coverUrl ? (
          <img src={song.coverUrl} alt={song.name} />
        ) : (
          <div className="song-card__cover-placeholder" />
        )}
        <div className="song-card__cover-actions">
          <button className="song-card__play-button" onClick={handlePlay} aria-label="播放">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <polygon points="8 5 19 12 8 19" />
            </svg>
          </button>
          <button className="song-card__download-button" onClick={handleDownload} aria-label="下载">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="song-card__name" title={song.name}>
        {song.name}
      </div>
      <div className="song-card__artist" title={song.artist}>
        {song.artist}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="search-results__grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="song-card song-card--skeleton">
          <div className="song-card__cover song-card__cover--skeleton" />
          <div className="song-card__name song-card__name--skeleton" />
          <div className="song-card__artist song-card__artist--skeleton" />
        </div>
      ))}
    </div>
  );
}

export default function SearchResults() {
  const results = useSearchStore((s) => s.results);
  const loading = useSearchStore((s) => s.loading);
  const keyword = useSearchStore((s) => s.keyword);

  if (loading) {
    return (
      <div className="search-results">
        <Skeleton />
      </div>
    );
  }

  if (!keyword) {
    return <div className="search-results__empty">输入关键词开始搜索</div>;
  }

  const allSongs = Array.from(results.values()).flat();

  if (allSongs.length === 0) {
    return <div className="search-results__empty">未找到相关结果</div>;
  }

  return (
    <div className="search-results">
      <div className="search-results__grid">
        {allSongs.map((song) => (
          <SongCard key={song.id + song.source + song.songId} song={song} />
        ))}
      </div>
    </div>
  );
}
