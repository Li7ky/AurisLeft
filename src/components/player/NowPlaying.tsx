import { X } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import LyricDisplay from '../lyric/LyricDisplay';
import CoverImage from '../common/CoverImage';
import './NowPlaying.css';

export default function NowPlaying() {
  const {
    currentSong,
    lyricLines,
    lyricLoading,
    showLyricPanel,
    setShowLyricPanel,
    playbackState,
  } = usePlayerStore();

  if (!showLyricPanel || !currentSong) return null;

  return (
    <div className="now-playing">
      <button
        className="now-playing__close btn--icon"
        onClick={() => setShowLyricPanel(false)}
        title="关闭歌词"
      >
        <X size={20} />
      </button>

      <div className="now-playing__art">
        <div className="now-playing__art-frame">
          <CoverImage src={currentSong.coverUrl} alt={currentSong.name} size={48} />
        </div>
        <div className="now-playing__meta">
          <h2 className="now-playing__title">{currentSong.name}</h2>
          <p className="now-playing__artist">{currentSong.artist}</p>
          <p className="now-playing__status">
            {playbackState === 'playing' ? '正在播放' : playbackState === 'paused' ? '已暂停' : playbackState}
          </p>
        </div>
      </div>

      <div className="now-playing__lyrics">
        {lyricLoading ? (
          <div className="now-playing__lyric-loading">歌词加载中…</div>
        ) : (
          <LyricDisplay lines={lyricLines} mode="fullscreen" />
        )}
      </div>
    </div>
  );
}
