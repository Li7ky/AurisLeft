import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  FileMusic,
  Library,
  Settings,
  Download,
  Music2,
  ListMusic,
  Heart,
  Sparkles,
  History,
  Play,
} from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { usePlaylistStore } from '../../store/playlistStore';
import { useRecentStore } from '../../store/recentStore';
import { PlaybackState, Quality } from '../../types';
import LyricDisplay from '../../components/lyric/LyricDisplay';
import { MediaCard } from '../../components/common/MediaCard';
import CoverImage from '../../components/common/CoverImage';
import { getNkiQqStatus } from '../../utils/desktop';
import { useToast } from '../../components/common/Toast/useToast';
import './index.css';

const shortcuts = [
  { id: 'search', title: '搜索', subtitle: '曲库点歌', path: '/search', icon: Search },
  { id: 'local', title: '本地', subtitle: '扫描文件夹', path: '/local', icon: FileMusic },
  { id: 'favorites', title: '收藏', subtitle: '红心歌曲', path: '/favorites', icon: Heart },
  { id: 'playlist', title: '歌单', subtitle: '整理曲目', path: '/playlist', icon: Library },
  { id: 'download', title: '下载', subtitle: '任务进度', path: '/download', icon: Download },
  { id: 'settings', title: '设置', subtitle: '音源主题', path: '/settings', icon: Settings },
];

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default function Home() {
  const navigate = useNavigate();
  const { currentSong, playbackState, lyricLines, lyricLoading, showLyricPanel } =
    usePlayerStore();
  const { playlists, loadPlaylists } = usePlaylistStore();
  const queue = usePlayerStore((s) => s.queue);
  const playList = usePlayerStore((s) => s.playList);
  const toggleLyricPanel = usePlayerStore((s) => s.toggleLyricPanel);
  const recent = useRecentStore((s) => s.recent);
  const loadRecent = useRecentStore((s) => s.loadRecent);
  const clearRecent = useRecentStore((s) => s.clearRecent);
  const { addToast } = useToast();
  const [qqReady, setQqReady] = useState<boolean | null>(null);

  useEffect(() => {
    loadPlaylists();
    void loadRecent();
    getNkiQqStatus()
      .then((s) => setQqReady(Boolean(s.enabled && s.hasKey)))
      .catch(() => setQqReady(false));
  }, [loadPlaylists, loadRecent]);

  const greeting = useMemo(() => greetingByHour(), []);

  const isPlayingSomething =
    currentSong &&
    (playbackState === PlaybackState.Playing ||
      playbackState === PlaybackState.Paused ||
      playbackState === PlaybackState.Loading);

  const showInlineLyric = Boolean(isPlayingSomething && !showLyricPanel);

  return (
    <div className="home-page">
      {/* 仅异常时提示，成功态不占版面 */}
      {qqReady === false && (
        <div className="home-page__banner home-page__banner--warn">
          <Sparkles size={16} />
          <div>
            <strong>QQ 解析未启用</strong>
            <p>到设置开启内置 QQ 解析，在线取链才稳定。</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => navigate('/settings')}>
            去设置
          </button>
        </div>
      )}

      <header className="home-page__header">
        <div>
          <h1 className="home-page__greeting">{greeting}</h1>
          <p className="home-page__lede">搜索点歌，或从本地与收藏继续听</p>
        </div>
        <button type="button" className="home-page__cta" onClick={() => navigate('/search')}>
          <Search size={16} />
          搜索音乐
        </button>
      </header>

      {/* 正在播放：横向大磁贴，非再套一层 hero 卡片 */}
      {currentSong && (
        <button
          type="button"
          className="home-page__now-tile"
          onClick={() => toggleLyricPanel()}
          title="打开播放详情"
        >
          <div className="home-page__now-tile-cover">
            <CoverImage src={currentSong.coverUrl} alt={currentSong.name} size={36} />
          </div>
          <div className="home-page__now-tile-meta">
            <span className="home-page__now-tile-label">
              {playbackState === PlaybackState.Playing ? '正在播放' : '已暂停'}
            </span>
            <strong className="truncate">{currentSong.name}</strong>
            <span className="truncate">{currentSong.artist}</span>
          </div>
          <div className="home-page__now-tile-extra">
            <ListMusic size={14} />
            <span>{queue.length} 首队列</span>
          </div>
        </button>
      )}

      <section className="home-page__section">
        <div className="home-page__section-head">
          <h2>快速入口</h2>
        </div>
        <div className="home-page__tiles">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="home-page__tile"
                onClick={() => navigate(item.path)}
              >
                <span className="home-page__tile-icon">
                  <Icon size={18} />
                </span>
                <span className="home-page__tile-text">
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="home-page__section">
        <div className="home-page__section-head">
          <h2>
            <History size={18} />
            最近播放
          </h2>
          {recent.length > 0 && (
            <button
              type="button"
              className="home-page__link"
              onClick={() => {
                void clearRecent().then(() => addToast('已清空最近播放', 'info'));
              }}
            >
              清空
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="home-page__empty">
            <Music2 size={28} />
            <strong>还没有播放记录</strong>
            <p>去搜索一首歌，或打开本地音乐开始听</p>
            <button type="button" className="btn btn--primary" onClick={() => navigate('/search')}>
              <Play size={14} />
              去搜索
            </button>
          </div>
        ) : (
          <div className="home-page__recent">
            {recent.slice(0, 12).map((song) => (
              <button
                key={`${song.source}-${song.songId}`}
                type="button"
                className="home-page__recent-item"
                onClick={() => void playList([song], 0, Quality.K320)}
              >
                <div className="home-page__recent-cover">
                  <CoverImage src={song.coverUrl} alt={song.name} size={20} />
                </div>
                <span className="truncate">{song.name}</span>
                <small className="truncate">{song.artist}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      {playlists.length > 0 && (
        <section className="home-page__section">
          <div className="home-page__section-head">
            <h2>我的歌单</h2>
            <button type="button" className="home-page__link" onClick={() => navigate('/playlist')}>
              查看全部
            </button>
          </div>
          <div className="home-page__grid">
            {playlists.slice(0, 8).map((pl) => (
              <MediaCard
                key={pl.id}
                id={String(pl.id)}
                title={pl.name}
                subtitle={`${pl.songCount} 首`}
                onClick={() => navigate(`/playlist/${pl.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {showInlineLyric && (
        <section className="home-page__section home-page__lyric-section">
          <div className="home-page__section-head">
            <h2>歌词</h2>
          </div>
          <div className="home-page__lyric-box">
            {lyricLoading ? (
              <div className="home-page__lyric-loading">加载歌词…</div>
            ) : (
              <LyricDisplay lines={lyricLines} mode="inline" />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
