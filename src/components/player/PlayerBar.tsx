import { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  ListMusic,
  Mic2,
  Heart,
  Check,
  ListOrdered,
  Timer,
  AudioLines,
  MoreHorizontal,
} from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { useFavoriteStore } from '../../store/favoriteStore';
import { PlaybackState, Quality, RepeatMode } from '../../types';
import { useToast } from '../common/Toast/useToast';
import CoverImage from '../common/CoverImage';
import { startSleepTimer, cancelSleepTimer, getSleepTimerStatus } from '../../utils/tauri';
import './PlayerBar.css';

const QUALITY_OPTIONS: { q: Quality; label: string }[] = [
  { q: Quality.K128, label: '128K' },
  { q: Quality.K320, label: '320K' },
  { q: Quality.FLAC, label: 'FLAC' },
  { q: Quality.HiRes, label: 'Hi-Res' },
];

/** 循环三种模式：点图标打开菜单直接选，不用连点 */
const REPEAT_OPTIONS: {
  mode: RepeatMode;
  label: string;
  desc: string;
  icon: typeof Repeat;
}[] = [
  { mode: RepeatMode.None, label: '顺序播放', desc: '播完列表后停止', icon: ListOrdered },
  { mode: RepeatMode.All, label: '列表循环', desc: '列表播完后从头再来', icon: Repeat },
  { mode: RepeatMode.One, label: '单曲循环', desc: '只重复当前这一首', icon: Repeat1 },
];

export default function PlayerBar() {
  const toast = useToast();
  const {
    currentSong,
    playbackState,
    progress,
    duration,
    volume,
    shuffle,
    repeatMode,
    queue,
    showLyricPanel,
    showQueuePanel,
    pause,
    resume,
    seek,
    setVolume,
    next,
    prev,
    setShuffle,
    setRepeatMode,
    setQuality,
    quality,
    play,
    toggleLyricPanel,
    toggleQueuePanel,
  } = usePlayerStore();
  const loadFavorites = useFavoriteStore((s) => s.loadFavorites);
  const toggleFavorite = useFavoriteStore((s) => s.toggle);
  const favorites = useFavoriteStore((s) => s.favorites);
  const isFavorited = Boolean(
    currentSong &&
      favorites.some((f) => f.songId === currentSong.songId && f.source === currentSong.source)
  );

  const [repeatMenuOpen, setRepeatMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [morePanel, setMorePanel] = useState<'root' | 'quality' | 'timer'>('root');
  const [timerLeft, setTimerLeft] = useState(0);
  const repeatMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    if (!repeatMenuOpen && !moreMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (repeatMenuOpen && repeatMenuRef.current && !repeatMenuRef.current.contains(t)) {
        setRepeatMenuOpen(false);
      }
      if (moreMenuOpen && moreMenuRef.current && !moreMenuRef.current.contains(t)) {
        setMoreMenuOpen(false);
        setMorePanel('root');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRepeatMenuOpen(false);
        setMoreMenuOpen(false);
        setMorePanel('root');
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [repeatMenuOpen, moreMenuOpen]);

  useEffect(() => {
    const tick = () => {
      void getSleepTimerStatus()
        .then((s) => setTimerLeft(s.isActive ? s.remainingSeconds : 0))
        .catch(() => setTimerLeft(0));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const isPlaying = playbackState === PlaybackState.Playing;
  const isLoading = playbackState === PlaybackState.Loading;
  const hasCurrentSong = currentSong !== null;
  const progressPercent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (!hasCurrentSong) return;
    if (isPlaying) void pause(toast.addToast);
    else void resume(toast.addToast);
  };

  const pickRepeat = (mode: RepeatMode) => {
    setRepeatMode(mode);
    setRepeatMenuOpen(false);
    const label = REPEAT_OPTIONS.find((o) => o.mode === mode)?.label || '';
    toast.addToast(`已切换：${label}`, 'success');
  };

  const toggleShuffle = () => {
    const next = !shuffle;
    setShuffle(next);
    toast.addToast(next ? '已开启随机播放' : '已关闭随机播放', 'info');
  };

  // 按钮表面始终用「循环」图标，避免顺序模式变成列表图标显得缺控件
  const RepeatTriggerIcon = repeatMode === RepeatMode.One ? Repeat1 : Repeat;

  return (
    <footer className="player-bar">
      {/* 左：歌曲信息 */}
      <div className="player-bar__info">
        <button
          type="button"
          className={`player-bar__cover-wrapper${!hasCurrentSong ? ' is-empty' : ''}`}
          title={hasCurrentSong ? '打开歌词' : undefined}
          disabled={!hasCurrentSong}
          onClick={() => hasCurrentSong && toggleLyricPanel()}
        >
          <CoverImage
            src={currentSong?.coverUrl}
            alt={currentSong?.name || ''}
            className="player-bar__cover"
            size={22}
          />
        </button>

        <div className="player-bar__meta">
          <div className="player-bar__title-row">
            <span className="player-bar__title truncate">
              {currentSong?.name || '尚未播放'}
            </span>
            {hasCurrentSong && (
              <button
                type="button"
                className={`player-bar__icon-btn${isFavorited ? ' is-liked' : ''}`}
                title={isFavorited ? '取消收藏' : '收藏'}
                onClick={async () => {
                  if (!currentSong) return;
                  try {
                    const on = await toggleFavorite(currentSong);
                    toast.addToast(on ? '已加入收藏' : '已取消收藏', 'success');
                  } catch (e) {
                    toast.addToast(e instanceof Error ? e.message : String(e), 'error');
                  }
                }}
              >
                <Heart size={15} fill={isFavorited ? 'currentColor' : 'none'} />
              </button>
            )}
          </div>
          <div className="player-bar__subtitle truncate">
            {currentSong?.artist || '选择一首歌开始播放'}
          </div>
        </div>
      </div>

      {/* 中：控制 + 进度 */}
      <div className="player-bar__center">
        <div className="player-bar__transport">
          {/* 随机：一键开/关（不和循环菜单重复） */}
          <button
            type="button"
            className={`player-bar__icon-btn player-bar__hit${shuffle ? ' is-on' : ''}`}
            title={shuffle ? '关闭随机播放' : '开启随机播放'}
            onClick={toggleShuffle}
          >
            <Shuffle size={15} />
          </button>

          <button
            type="button"
            className="player-bar__icon-btn player-bar__hit"
            title="上一首"
            onClick={() => prev(toast.addToast)}
            disabled={!hasCurrentSong}
          >
            <SkipBack size={18} fill="currentColor" />
          </button>

          <button
            type="button"
            className={`player-bar__play${isLoading ? ' is-loading' : ''}`}
            onClick={handlePlayPause}
            title={isPlaying ? '暂停' : '播放'}
            disabled={!hasCurrentSong || isLoading}
          >
            {isPlaying ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>

          <button
            type="button"
            className="player-bar__icon-btn player-bar__hit"
            title="下一首"
            onClick={() => next(toast.addToast)}
            disabled={!hasCurrentSong}
          >
            <SkipForward size={18} fill="currentColor" />
          </button>

          {/* 循环：只在这里选三种模式 */}
          <div className="player-bar__menu-wrap" ref={repeatMenuRef}>
            <button
              type="button"
              className={`player-bar__icon-btn player-bar__hit${repeatMode !== RepeatMode.None ? ' is-on' : ''}${repeatMenuOpen ? ' is-menu-open' : ''}`}
              title={`循环：${REPEAT_OPTIONS.find((o) => o.mode === repeatMode)?.label || '顺序播放'}（点击选择）`}
              aria-haspopup="menu"
              aria-expanded={repeatMenuOpen}
              onClick={() => setRepeatMenuOpen((v) => !v)}
            >
              <RepeatTriggerIcon size={15} />
            </button>

            {repeatMenuOpen && (
              <div className="player-bar__menu" role="menu">
                <div className="player-bar__menu-title">循环模式</div>
                {REPEAT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = repeatMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className={`player-bar__menu-item${active ? ' is-active' : ''}`}
                      onClick={() => pickRepeat(opt.mode)}
                    >
                      <Icon size={16} className="player-bar__menu-icon" />
                      <span className="player-bar__menu-text">
                        <strong>{opt.label}</strong>
                        <small>{opt.desc}</small>
                      </span>
                      {active && <Check size={16} className="player-bar__menu-check" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="player-bar__progress">
          <span className="player-bar__time">{formatTime(hasCurrentSong ? progress : 0)}</span>
          <div className="player-bar__range">
            <div className="player-bar__range-bg" />
            <div
              className="player-bar__range-fill"
              style={{ width: `${hasCurrentSong ? progressPercent : 0}%` }}
            />
            <input
              type="range"
              min={0}
              max={Math.max(duration || 0, 0.1)}
              step={0.1}
              value={hasCurrentSong ? progress : 0}
              disabled={!hasCurrentSong}
              onChange={(e) => seek(Number(e.target.value), toast.addToast)}
              aria-label="播放进度"
            />
          </div>
          <span className="player-bar__time">{formatTime(hasCurrentSong ? duration : 0)}</span>
        </div>
      </div>

      {/* 右：更多 + 音量 + 队列（不再一排塞 5 个图标） */}
      <div className="player-bar__right">
        <div className="player-bar__menu-wrap" ref={moreMenuRef}>
          <button
            type="button"
            className={`player-bar__icon-btn player-bar__hit${moreMenuOpen || timerLeft > 0 || showLyricPanel ? ' is-on' : ''}`}
            title="更多（音质 / 定时 / 歌词）"
            onClick={() => {
              setRepeatMenuOpen(false);
              setMoreMenuOpen((v) => {
                if (v) setMorePanel('root');
                return !v;
              });
            }}
          >
            <MoreHorizontal size={18} />
            {timerLeft > 0 && (
              <span className="player-bar__timer-badge">{Math.ceil(timerLeft / 60)}</span>
            )}
          </button>

          {moreMenuOpen && (
            <div className="player-bar__menu player-bar__menu--right" role="menu">
              {morePanel === 'root' && (
                <>
                  <div className="player-bar__menu-title">更多</div>
                  <button
                    type="button"
                    className="player-bar__menu-item"
                    onClick={() => setMorePanel('quality')}
                  >
                    <AudioLines size={16} className="player-bar__menu-icon" />
                    <span className="player-bar__menu-text">
                      <strong>音质</strong>
                      <small>当前 {quality}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="player-bar__menu-item"
                    onClick={() => setMorePanel('timer')}
                  >
                    <Timer size={16} className="player-bar__menu-icon" />
                    <span className="player-bar__menu-text">
                      <strong>睡眠定时</strong>
                      <small>{timerLeft > 0 ? `剩余约 ${Math.ceil(timerLeft / 60)} 分钟` : '到时自动暂停'}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`player-bar__menu-item${showLyricPanel ? ' is-active' : ''}`}
                    disabled={!hasCurrentSong}
                    onClick={() => {
                      toggleLyricPanel();
                      setMoreMenuOpen(false);
                      setMorePanel('root');
                    }}
                  >
                    <Mic2 size={16} className="player-bar__menu-icon" />
                    <span className="player-bar__menu-text">
                      <strong>歌词</strong>
                      <small>{showLyricPanel ? '点击关闭歌词页' : '打开全屏歌词'}</small>
                    </span>
                    {showLyricPanel && <Check size={16} className="player-bar__menu-check" />}
                  </button>
                </>
              )}

              {morePanel === 'quality' && (
                <>
                  <button
                    type="button"
                    className="player-bar__menu-back"
                    onClick={() => setMorePanel('root')}
                  >
                    ← 返回
                  </button>
                  <div className="player-bar__menu-title">播放音质</div>
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.q}
                      type="button"
                      className={`player-bar__menu-item${quality === opt.q ? ' is-active' : ''}`}
                      onClick={() => {
                        setQuality(opt.q);
                        setMoreMenuOpen(false);
                        setMorePanel('root');
                        toast.addToast(`音质已设为 ${opt.label}`, 'success');
                        if (currentSong) {
                          void play(currentSong, opt.q, toast.addToast, false);
                        }
                      }}
                    >
                      <span className="player-bar__menu-text">
                        <strong>{opt.label}</strong>
                      </span>
                      {quality === opt.q && <Check size={16} className="player-bar__menu-check" />}
                    </button>
                  ))}
                </>
              )}

              {morePanel === 'timer' && (
                <>
                  <button
                    type="button"
                    className="player-bar__menu-back"
                    onClick={() => setMorePanel('root')}
                  >
                    ← 返回
                  </button>
                  <div className="player-bar__menu-title">睡眠定时</div>
                  {[15, 30, 45, 60, 90].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="player-bar__menu-item"
                      onClick={async () => {
                        await startSleepTimer(m);
                        setMoreMenuOpen(false);
                        setMorePanel('root');
                        toast.addToast(`将在 ${m} 分钟后暂停播放`, 'success');
                      }}
                    >
                      <span className="player-bar__menu-text">
                        <strong>{m} 分钟</strong>
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="player-bar__menu-item"
                    onClick={async () => {
                      await cancelSleepTimer();
                      setTimerLeft(0);
                      setMoreMenuOpen(false);
                      setMorePanel('root');
                      toast.addToast('已取消睡眠定时', 'info');
                    }}
                  >
                    <span className="player-bar__menu-text">
                      <strong>取消定时</strong>
                    </span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="player-bar__volume">
          <button
            type="button"
            className="player-bar__icon-btn player-bar__hit"
            title={volume === 0 ? '取消静音' : '静音'}
            onClick={() => setVolume(volume === 0 ? 0.8 : 0, toast.addToast)}
          >
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <div className="player-bar__range player-bar__range--volume">
            <div className="player-bar__range-bg" />
            <div className="player-bar__range-fill" style={{ width: `${volume * 100}%` }} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value), toast.addToast)}
              aria-label="音量"
            />
          </div>
        </div>

        <button
          type="button"
          className={`player-bar__icon-btn player-bar__hit player-bar__queue-btn${showQueuePanel ? ' is-on' : ''}`}
          title="播放队列"
          onClick={() => toggleQueuePanel()}
        >
          <ListMusic size={17} />
          {queue.length > 0 && <span className="player-bar__badge">{queue.length}</span>}
        </button>
      </div>
    </footer>
  );
}
