import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { usePlaylistStore } from '../../store/playlistStore';
import { PlaybackState } from '../../types';
import LyricDisplay from '../../components/lyric/LyricDisplay';
import { Section } from '../../components/common/Section';
import { MediaCard } from '../../components/common/MediaCard';
import './index.css';

export default function Home() {
  const { currentSong, playbackState } = usePlayerStore();
  const { playlists, loadPlaylists } = usePlaylistStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const showLyric = currentSong && playbackState !== PlaybackState.Idle;

  // 测试用 Mock 数据
  const recentPlays = [
    { id: '1', title: '七里香', subtitle: '周杰伦', type: 'album' as const },
    { id: '2', title: '1989', subtitle: 'Taylor Swift', type: 'album' as const },
    { id: '3', title: 'This Is Jay Chou', subtitle: 'Playlist', type: 'playlist' as const },
    { id: '4', title: '林俊杰', subtitle: 'Artist', type: 'artist' as const },
    { id: '5', title: 'Lover', subtitle: 'Taylor Swift', type: 'album' as const },
    { id: '6', title: 'G.E.M.', subtitle: 'Artist', type: 'artist' as const },
  ];

  return (
    <div className="home-page">
      <div className={`home-page__content ${showLyric ? 'home-page__content--with-lyric' : ''}`}>
        {!showLyric ? (
          <div className="home-page__sections">
            <Section title="我的歌单" onViewAll={() => navigate('/playlist')}>
              {playlists.length > 0 ? (
                playlists.slice(0, 6).map((pl) => (
                  <MediaCard
                    key={pl.id}
                    id={String(pl.id)}
                    title={pl.name}
                    subtitle={`${pl.songCount} 首歌曲`}
                    onClick={() => navigate(`/playlist/${pl.id}`)}
                  />
                ))
              ) : (
                <div className="home-page__empty">
                  <p>暂无歌单，去创建一个吧</p>
                  <button className="btn btn--primary" onClick={() => navigate('/playlist')}>
                    创建歌单
                  </button>
                </div>
              )}
            </Section>

            <Section title="最近播放">
              {recentPlays.map((item) => (
                <MediaCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  type={item.type}
                />
              ))}
            </Section>
            
            <Section title="为您推荐">
              <MediaCard
                id="rec-1"
                title="每日新歌推荐"
                subtitle="根据您的口味为您推荐"
                type="playlist"
              />
              <MediaCard
                id="rec-2"
                title="华语流行"
                subtitle="Playlist"
                type="playlist"
              />
              <MediaCard
                id="rec-3"
                title="专注工作"
                subtitle="白噪音与轻音乐"
                type="playlist"
              />
            </Section>
          </div>
        ) : (
          <div className="home-page__lyric-container">
            <LyricDisplay lines={[]} />
          </div>
        )}
      </div>
    </div>
  );
}
