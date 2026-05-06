import { useState, useEffect } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { PlaybackState } from '../../types';
import { useToast } from '../common/Toast/useToast';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Shuffle,
  Volume2,
  ListMusic,
  Maximize2,
  Heart,
  PictureInPicture2,
  Mic2,
  Share2,
} from 'lucide-react';
import './PlayerBar.css';

export default function PlayerBar() {
  const toast = useToast();
  const {
    currentSong,
    playbackState,
    progress,
    duration,
    volume,
    pause,
    resume,
    seek,
    setVolume,
    next,
    prev,
  } = usePlayerStore();

  const isPlaying = playbackState === PlaybackState.Playing;
  const [isLiked, setIsLiked] = useState(false);

  // 格式化时间 00:00
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <footer className="player-bar">
      {/* 1. 歌曲信息 (左) */}
      <div className="player-bar__info">
        <div
          className="player-bar__cover-wrapper"
          onClick={() => {
            /* TODO: 展开歌词详情页 */
          }}
        >
          {currentSong?.coverUrl ? (
            <img src={currentSong.coverUrl} alt={currentSong.name} className="player-bar__cover" />
          ) : (
            <div className="player-bar__cover" />
          )}
          <div className="player-bar__cover-hover">
            <Maximize2 size={16} />
          </div>
        </div>
        <div className="player-bar__metadata">
          <div className="player-bar__song-title">
            <span className="truncate">{currentSong?.name || '未知曲目'}</span>
            <button
              className={`btn--icon ${isLiked ? 'player-bar__heart--active' : ''}`}
              onClick={() => setIsLiked(!isLiked)}
            >
              <Heart size={16} fill={isLiked ? 'var(--accent-magenta)' : 'none'} />
            </button>
          </div>
          <div className="player-bar__artist-name truncate">
            {currentSong?.artist || '未知艺人'}
            {currentSong?.album ? ` - ${currentSong.album}` : ''}
          </div>
        </div>
      </div>

      {/* 2. 播放控制 (中) */}
      <div className="player-bar__controls">
        <div className="player-bar__control-buttons">
          <button className="btn--icon btn--sm" title="随机播放">
            <Shuffle size={16} />
          </button>
          <button className="btn--icon" title="上一首" onClick={() => prev(toast.addToast)}>
            <SkipBack size={22} fill="currentColor" />
          </button>
          <button
            className="btn btn--primary player-bar__play-btn"
            onClick={() => (isPlaying ? pause(toast.addToast) : resume(toast.addToast))}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>
          <button className="btn--icon" title="下一首" onClick={() => next(toast.addToast)}>
            <SkipForward size={22} fill="currentColor" />
          </button>
          <button className="btn--icon btn--sm" title="循环播放">
            <Repeat size={16} />
          </button>
        </div>

        <div className="player-bar__progress-container">
          <span className="player-bar__time">{formatTime(progress)}</span>
          <div className="player-bar__slider-wrapper">
            <input
              type="range"
              className="player-bar__progress-slider"
              min={0}
              max={duration || 100}
              value={progress}
              onChange={(e) => seek(Number(e.target.value), toast.addToast)}
            />
            <div className="player-bar__progress-active" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="player-bar__time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 3. 功能增强 (右) */}
      <div className="player-bar__extra">
        <button className="btn--icon btn--sm" title="歌词">
          <Mic2 size={18} />
        </button>
        <button className="btn--icon btn--sm" title="画中画">
          <PictureInPicture2 size={18} />
        </button>
        <button className="btn--icon btn--sm" title="分享">
          <Share2 size={18} />
        </button>

        <div className="player-bar__volume-container">
          <Volume2 size={18} />
          <div className="player-bar__slider-wrapper" style={{ width: 80 }}>
            <input
              type="range"
              className="player-bar__volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value), toast.addToast)}
            />
            <div className="player-bar__progress-active" style={{ width: `${volume * 100}%` }} />
          </div>
        </div>

        <button className="btn--icon" title="播放列表">
          <ListMusic size={20} />
        </button>
      </div>
    </footer>
  );
}
