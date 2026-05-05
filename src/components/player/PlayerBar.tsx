import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
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
  const [isFavorite, setIsFavorite] = useState(false);

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

  const progressPercent = duration
    ? (progress / duration) * 100
    : currentSong
    ? (progress / (currentSong.duration || 1)) * 100
    : 0;
  const progressPercentClamped = Math.max(0, Math.min(100, progressPercent));
  const progressStyle = {
    "--progress-percent": `${progressPercentClamped}%`,
  } as CSSProperties;

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
        <div className="player-bar__cover-wrapper">
          {currentSong.coverUrl ? (
            <img
              className="player-bar__cover"
              src={currentSong.coverUrl}
              alt={currentSong.name}
            />
          ) : (
            <div className="player-bar__cover-placeholder">♪</div>
          )}
        </div>
        <div className="player-bar__song-info">
          <div className="player-bar__song-name" title={currentSong.name}>
            {currentSong.name}
          </div>
          <div className="player-bar__artist-name" title={currentSong.artist}>
            {currentSong.artist}
          </div>
        </div>
        <button
          className={`player-bar__favorite-btn${
            isFavorite ? " player-bar__favorite-btn--active" : ""
          }`}
          title={isFavorite ? "取消收藏" : "收藏"}
          onClick={() => setIsFavorite((v) => !v)}
        >
          {isFavorite ? "♥" : "♡"}
        </button>
      </div>

      {/* Center: Controls + Progress */}
      <div className="player-bar__center">
        <div className="player-bar__controls">
          <button
            className="player-bar__control-btn"
            onClick={() => prev()}
            title="上一首"
          >
            <span aria-hidden="true">⏮</span>
          </button>
          <button
            className="player-bar__play-btn"
            onClick={() => (isPlaying ? pause() : resume())}
            title={isPlaying ? "暂停" : "播放"}
          >
            <span aria-hidden="true">{isPlaying ? "⏸" : "▶"}</span>
          </button>
          <button
            className="player-bar__control-btn"
            onClick={() => next()}
            title="下一首"
          >
            <span aria-hidden="true">⏭</span>
          </button>
        </div>
        <div className="player-bar__progress-wrapper">
          <span className="player-bar__time">
            {formatTime(progress)}
          </span>
          <div className="player-bar__progress-track" style={progressStyle}>
            <div
              className="player-bar__progress-fill"
              style={{ width: `${progressPercentClamped}%` }}
            />
            <input
              className="player-bar__progress-input"
              type="range"
              min={0}
              max={duration || currentSong.duration || 0}
              step={0.1}
              value={progress}
              onChange={handleProgressChange}
            />
          </div>
          <span className="player-bar__time">
            {formatTime(duration || currentSong.duration)}
          </span>
        </div>
      </div>

      {/* Right: Extra controls */}
      <div className="player-bar__right">
        <button className="player-bar__extra-btn" title="歌词">
          <span aria-hidden="true">词</span>
        </button>

        <div className="player-bar__volume-wrapper">
          <button
            className="player-bar__extra-btn"
            title={volume === 0 ? "静音" : volume < 0.5 ? "音量" : "音量"}
            onClick={() => setVolume(volume === 0 ? 0.5 : 0)}
          >
            <span aria-hidden="true">{volume === 0 ? "静" : volume < 0.5 ? "中" : "高"}</span>
          </button>
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

        <button
          className="player-bar__quality-btn"
          onClick={handleQualityCycle}
          title="切换音质"
        >
          {QUALITY_LABELS[quality]}
        </button>

        <div className="player-bar__timer-wrapper">
          <button
            className={`player-bar__extra-btn${
              isActive ? " player-bar__extra-btn--active" : ""
            }`}
            onClick={() => setShowTimerMenu(!showTimerMenu)}
            title="睡眠定时器"
          >
            <span aria-hidden="true">月</span>
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
                  <button
                    className="player-bar__timer-custom-btn"
                    onClick={handleCustomTimer}
                  >
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
