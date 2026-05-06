import React, { useState } from 'react';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(35);
  const [volume, setVolume] = useState(80);
  const [isLiked, setIsLiked] = useState(false);

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
          <div className="player-bar__cover" />
          <div className="player-bar__cover-hover">
            <Maximize2 size={16} />
          </div>
        </div>
        <div className="player-bar__metadata">
          <div className="player-bar__song-title">
            <span className="truncate">七里香 (Common Jasmine Orange)</span>
            <button
              className={`btn--icon ${isLiked ? 'player-bar__heart--active' : ''}`}
              onClick={() => setIsLiked(!isLiked)}
            >
              <Heart size={16} fill={isLiked ? 'var(--accent-magenta)' : 'none'} />
            </button>
          </div>
          <div className="player-bar__artist-name truncate">周杰伦 - 七里香</div>
        </div>
      </div>

      {/* 2. 播放控制 (中) */}
      <div className="player-bar__controls">
        <div className="player-bar__control-buttons">
          <button className="btn--icon btn--sm" title="随机播放">
            <Shuffle size={16} />
          </button>
          <button className="btn--icon" title="上一首">
            <SkipBack size={22} fill="currentColor" />
          </button>
          <button
            className="btn btn--primary player-bar__play-btn"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>
          <button className="btn--icon" title="下一首">
            <SkipForward size={22} fill="currentColor" />
          </button>
          <button className="btn--icon btn--sm" title="循环播放">
            <Repeat size={16} />
          </button>
        </div>

        <div className="player-bar__progress-container">
          <span className="player-bar__time">01:24</span>
          <div className="player-bar__slider-wrapper">
            <input
              type="range"
              className="player-bar__progress-slider"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
            />
            <div className="player-bar__progress-active" style={{ width: `${progress}%` }} />
          </div>
          <span className="player-bar__time">04:47</span>
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
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
            <div className="player-bar__progress-active" style={{ width: `${volume}%` }} />
          </div>
        </div>

        <button className="btn--icon" title="播放列表">
          <ListMusic size={20} />
        </button>
      </div>
    </footer>
  );
}
