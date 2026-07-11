import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { usePlaylistStore } from '../../store/playlistStore';
import { useRecentStore } from '../../store/recentStore';
import { PlaybackState, Quality } from '../../types';
import LyricDisplay from '../../components/lyric/LyricDisplay';
import { MediaCard } from '../../components/common/MediaCard';
import AppLogo from '../../components/common/AppLogo';
import CoverImage from '../../components/common/CoverImage';
import { getNkiQqStatus } from '../../utils/desktop';
import { useToast } from '../../components/common/Toast/useToast';
import './index.css';

const shortcuts = [
  {
    id: 'search',
    title: '搜索音乐',
    subtitle: '搜索曲库并播放',
    path: '/search',
    icon: Search,
  },
  {
    id: 'local',
    title: '本地音乐',
    subtitle: '扫描并播放本地文件',
    path: '/local',
    icon: FileMusic,
  },
  {
    id: 'favorites',
    title: '我的收藏',
    subtitle: '红心收藏的歌曲',
    path: '/favorites',
    icon: Heart,
  },
  {
    id: 'playlist',
    title: '我的歌单',
    subtitle: '创建与管理歌单',
    path: '/playlist',
    icon: Library,
  },
  {
    id: 'download',
    title: '下载管理',
    subtitle: '查看下载进度',
    path: '/download',
    icon: Download,
  },
  {
    id: 'settings',
    title: '设置',
    subtitle: '音源、主题与音质',
    path: '/settings',
    icon: Settings,
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { currentSong, playbackState, lyricLines, lyricLoading, showLyricPanel } =
    usePlayerStore();
  const { playlists, loadPlaylists } = usePlaylistStore();
  const queue = usePlayerStore((s) => s.queue);
  const playList = usePlayerStore((s) => s.playList);
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

  const isPlayingSomething =
    currentSong &&
    (playbackState === PlaybackState.Playing ||
      playbackState === PlaybackState.Paused ||
      playbackState === PlaybackState.Loading);

  const showInlineLyric = Boolean(isPlayingSomething && !showLyricPanel);

  return (
    <div className="home-page">
      {qqReady === false && (
        <div className="home-page__banner home-page__banner--warn">
          <Sparkles size={16} />
          <div>
            <strong>QQ 解析未启用</strong>
            <p>请到设置页开启「西瓜糖 QQ 解析」并配置密钥，否则在线取链可能失败。</p>
          </div>
          <button className="btn btn--primary" onClick={() => navigate('/settings')}>
            去设置
          </button>
        </div>
      )}

      {qqReady === true && (
        <div className="home-page__banner">
          <Sparkles size={16} />
          <div>
            <strong>西瓜糖 QQ 解析已就绪</strong>
            <p>可直接搜索试听；付费曲优先走 QQ 解析。</p>
          </div>
          <button className="btn btn--primary" onClick={() => navigate('/search')}>
            去搜索
          </button>
        </div>
      )}

      <div className="home-page__hero">
        <div className="home-page__hero-copy">
          <div className="home-page__brand">
            <AppLogo size={36} />
            <p className="home-page__eyebrow">桌面音乐播放器</p>
          </div>
          <h1 className="home-page__heading">安静听歌，少一点打扰</h1>
          <p className="home-page__desc">
            已内置可用音源：搜索 → 点歌 → 收藏。本地音乐支持标签识别与队列连播。
          </p>
          <div className="home-page__hero-actions">
            <button className="btn btn--primary" onClick={() => navigate('/search')}>
              <Search size={16} />
              去搜索
            </button>
            <button className="btn btn--ghost" onClick={() => navigate('/settings')}>
              <Settings size={16} />
              音源设置
            </button>
          </div>
        </div>

        <div className="home-page__now">
          {currentSong ? (
            <>
              <div className="home-page__now-cover">
                <CoverImage src={currentSong.coverUrl} alt={currentSong.name} size={36} />
              </div>
              <div className="home-page__now-meta">
                <span className="home-page__now-label">
                  {playbackState === PlaybackState.Playing ? '正在播放' : '当前曲目'}
                </span>
                <strong className="truncate">{currentSong.name}</strong>
                <span className="truncate">{currentSong.artist}</span>
                <span className="home-page__now-queue">
                  <ListMusic size={13} /> 队列 {queue.length} 首
                </span>
              </div>
            </>
          ) : (
            <div className="home-page__now-empty">
              <Music2 size={28} />
              <p>还没有在播的歌曲</p>
              <span>从搜索、收藏或本地音乐开始</span>
            </div>
          )}
        </div>
      </div>

      <section className="home-page__section">
        <div className="home-page__section-head">
          <h2>快速入口</h2>
        </div>
        <div className="home-page__shortcuts">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className="home-page__shortcut"
                onClick={() => navigate(item.path)}
              >
                <span className="home-page__shortcut-icon">
                  <Icon size={18} />
                </span>
                <span className="home-page__shortcut-text">
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="home-page__section">
        <div className="home-page__section-head">
          <h2>
            <History size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            最近播放
          </h2>
          {recent.length > 0 && (
            <button
              className="home-page__link"
              onClick={() => void clearRecent().then(() => addToast('已清空最近播放', 'info'))}
            >
              清空
            </button>
          )}
        </div>
        {recent.length > 0 ? (
          <div className="home-page__recent">
            {recent.slice(0, 12).map((song, index) => (
              <button
                key={`${song.source}-${song.songId}-${index}`}
                type="button"
                className="home-page__recent-item"
                onClick={() => void playList(recent, index, Quality.K320, addToast)}
              >
                <div className="home-page__recent-cover">
                  <CoverImage src={song.coverUrl} alt={song.name} size={18} />
                </div>
                <span className="truncate">{song.name}</span>
                <small className="truncate">{song.artist}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="home-page__empty-card home-page__empty-card--compact">
            <p>听过的歌会出现在这里</p>
          </div>
        )}
      </section>

      <section className="home-page__section">
        <div className="home-page__section-head">
          <h2>我的歌单</h2>
          <button className="home-page__link" onClick={() => navigate('/playlist')}>
            查看全部
          </button>
        </div>
        {playlists.length > 0 ? (
          <div className="home-page__grid">
            {playlists.slice(0, 8).map((pl) => (
              <MediaCard
                key={pl.id}
                id={String(pl.id)}
                title={pl.name}
                subtitle={`${pl.songCount} 首歌曲`}
                onClick={() => navigate(`/playlist/${pl.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="home-page__empty-card">
            <p>还没有歌单</p>
            <button className="btn btn--primary" onClick={() => navigate('/playlist')}>
              去创建
            </button>
          </div>
        )}
      </section>

      {showInlineLyric && (
        <section className="home-page__section home-page__lyric-section">
          <div className="home-page__section-head">
            <h2>歌词</h2>
            <button
              className="home-page__link"
              onClick={() => usePlayerStore.getState().setShowLyricPanel(true)}
            >
              全屏歌词
            </button>
          </div>
          <div className="home-page__lyric-box">
            {lyricLoading ? (
              <div className="home-page__lyric-loading">歌词加载中…</div>
            ) : (
              <LyricDisplay lines={lyricLines} mode="inline" />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
