import { useState, useEffect } from "react";
import { usePlayerStore } from "../../store/playerStore";
import { useSleepTimer } from "../../hooks/useSleepTimer";
import { PlaybackState, Quality } from "../../types";
import "./PlayerBar.css";

const QUALITY_LABELS: Record<Quality, string> = {
  [Quality.K128]: "128K",
  [Quality.K320]: "320K",
  [Quality.FLAC]: "FLAC",
  [Quality.HiRes]: "Hi-Res",
};

const QUALITY_ORDER = [Quality.K128, Quality.K320, Quality.FLAC, Quality.HiRes];
const TIMER_OPTIONS = [5, 15, 30, 60];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlayerBar() {
  const {
    currentSong,
    playbackState,
    progress,
    duration,
    volume,
    quality,
    pause,
    resume,
    next,
    prev,
    seek,
    setVolume,
    setQuality,
  } = usePlayerStore();

  const { isActive, remaining, start, cancel } = useSleepTimer();
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");

  useEffect(() => {
    if (!showTimerMenu) {
      setShowCustomInput(false);
      setCustomMinutes("");
    }
  }, [showTimerMenu]);

  const handleTimerSelect = async (minutes: number) => {
    if (isActive && remaining === minutes * 60) {
      await cancel();
    } else {
      await start(minutes);
    }
    setShowTimerMenu(false);
  };

  const handleCustomTimer = async () => {
    const mins = parseInt(customMinutes, 10);
    if (!Number.isNaN(mins) && mins > 0) {
      if (isActive && remaining === mins * 60) {
        await cancel();
      } else {
        await start(mins);
      }
      setShowTimerMenu(false);
    }
  };

  const handleCancelTimer = async () => {
    await cancel();
    setShowTimerMenu(false);
  };

  const isPlaying = playbackState === PlaybackState.Playing;

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = Number(e.target.value);
    seek(pos);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value);
    setVolume(vol);
  };

  const handleQualityCycle = () => {
    if (!currentSong) return;
    const available = currentSong.qualities;
    const idx = QUALITY_ORDER.indexOf(quality);
    for (let i = 1; i <= QUALITY_ORDER.length; i++) {
      const nextQ = QUALITY_ORDER[(idx + i) % QUALITY_ORDER.length];
      if (available.includes(nextQ)) {
        setQuality(nextQ);
        return;
      }
    }
  };

  if (!currentSong) {
    return (
      <div className="player-bar">
        <div className="player-bar__left" />
        <div className="player-bar__center">
          <span className="player-bar__empty">未选择歌曲</span>
        </div>
        <div className="player-bar__right" />
      </div>
    );
  }

  return (
    <div className="player-bar">
      {/* Left: Song info */}
      <div className="player-bar__left">
        {currentSong.coverUrl ? (
          <img
            className="player-bar__cover"
            src={currentSong.coverUrl}
            alt={currentSong.name}
          />
        ) : (
          <div className="player-bar__cover-placeholder">♪</div>
        )}
        <div className="player-bar__song-info">
          <div className="player-bar__song-name" title={currentSong.name}>
            {currentSong.name}
          </div>
          <div className="player-bar__artist-name" title={currentSong.artist}>
            {currentSong.artist}
          </div>
        </div>
        <button className="player-bar__favorite-btn" title="收藏">
          ☆
        </button>
      </div>

      {/* Center: Controls + Progress */}
      <div className="player-bar__center">
        <div className="player-bar__controls">
          <button className="player-bar__control-btn" onClick={() => prev()} title="上一首">
            ⏮
          </button>
          <button
            className="player-bar__play-btn"
            onClick={() => (isPlaying ? pause() : resume())}
            title={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button className="player-bar__control-btn" onClick={() => next()} title="下一首">
            ⏭
          </button>
        </div>
        <div className="player-bar__progress-wrapper">
          <span className="player-bar__time">{formatTime(progress)}</span>
          <input
            className="player-bar__progress"
            type="range"
            min={0}
            max={duration || currentSong.duration || 0}
            step={0.1}
            value={progress}
            onChange={handleProgressChange}
          />
          <span className="player-bar__time">{formatTime(duration || currentSong.duration)}</span>
        </div>
      </div>

      {/* Right: Volume + Quality + Sleep Timer */}
      <div className="player-bar__right">
        <div className="player-bar__volume-wrapper">
          <span className="player-bar__volume-icon">
            {volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
          </span>
          <input
            className="player-bar__volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolumeChange}
          />
        </div>
        <button className="player-bar__quality-btn" onClick={handleQualityCycle} title="切换音质">
          {QUALITY_LABELS[quality]}
        </button>
        <div className="player-bar__timer-wrapper">
          <button
            className={`player-bar__timer-btn${isActive ? " player-bar__timer-btn--active" : ""}`}
            onClick={() => setShowTimerMenu(!showTimerMenu)}
            title="睡眠定时器"
          >
            🌙
          </button>
          {isActive && (
            <span className="player-bar__timer-remaining">
              {formatTime(remaining)}
            </span>
          )}
          {showTimerMenu && (
            <div className="player-bar__timer-menu">
              {isActive && (
                <button
                  className="player-bar__timer-menu-item player-bar__timer-menu-item--cancel"
                  onClick={handleCancelTimer}
                >
                  取消定时器
                </button>
              )}
              {TIMER_OPTIONS.map((mins) => (
                <button
                  key={mins}
                  className="player-bar__timer-menu-item"
                  onClick={() => handleTimerSelect(mins)}
                >
                  {mins} 分钟
                </button>
              ))}
              {!showCustomInput ? (
                <button
                  className="player-bar__timer-menu-item player-bar__timer-menu-item--custom"
                  onClick={() => setShowCustomInput(true)}
                >
                  自定义
                </button>
              ) : (
                <div className="player-bar__timer-custom">
                  <input
                    className="player-bar__timer-custom-input"
                    type="number"
                    min={1}
                    placeholder="分钟"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCustomTimer();
                    }}
                  />
                  <button className="player-bar__timer-custom-btn" onClick={handleCustomTimer}>
                    确定
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
