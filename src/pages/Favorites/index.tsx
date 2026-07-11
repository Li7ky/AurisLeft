import { useEffect } from 'react';
import { Heart, Play } from 'lucide-react';
import { useFavoriteStore } from '../../store/favoriteStore';
import { usePlayerStore } from '../../store/playerStore';
import { useToast } from '../../components/common/Toast/useToast';
import { Quality } from '../../types';
import { songKey } from '../../utils/song';
import './index.css';

export default function Favorites() {
  const { favorites, loadFavorites, toggle, loading } = useFavoriteStore();
  const playList = usePlayerStore((s) => s.playList);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const { addToast } = useToast();

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  const handlePlayAll = () => {
    if (!favorites.length) {
      addToast('收藏夹还是空的', 'info');
      return;
    }
    void playList(favorites, 0, Quality.K320, addToast);
  };

  return (
    <div className="favorites-page">
      <div className="favorites-page__header">
        <div>
          <h1 className="favorites-page__title">
            <Heart size={22} /> 我的收藏
          </h1>
          <p className="favorites-page__sub">{favorites.length} 首歌曲</p>
        </div>
        <button className="btn btn--primary" onClick={handlePlayAll} disabled={!favorites.length}>
          <Play size={16} fill="currentColor" />
          播放全部
        </button>
      </div>

      {loading ? (
        <div className="favorites-page__empty">加载中…</div>
      ) : favorites.length === 0 ? (
        <div className="favorites-page__empty">
          <p>还没有收藏歌曲</p>
          <span>在播放栏点红心，或搜索喜欢的歌后收藏</span>
        </div>
      ) : (
        <div className="favorites-page__list">
          {favorites.map((song, index) => {
            const active = currentSong && songKey(currentSong) === songKey(song);
            return (
              <div
                key={songKey(song)}
                className={`favorites-page__row${active ? ' is-active' : ''}`}
                onDoubleClick={() => void playList(favorites, index, Quality.K320, addToast)}
              >
                <span className="favorites-page__idx">{index + 1}</span>
                <div className="favorites-page__meta">
                  <strong className="truncate">{song.name}</strong>
                  <span className="truncate">{song.artist}</span>
                </div>
                <span className="favorites-page__album truncate">{song.album}</span>
                <button
                  className="btn--icon"
                  title="播放"
                  onClick={() => void playList(favorites, index, Quality.K320, addToast)}
                >
                  <Play size={14} />
                </button>
                <button
                  className="btn--icon is-liked"
                  title="取消收藏"
                  onClick={async () => {
                    await toggle(song);
                    addToast('已取消收藏', 'info');
                  }}
                >
                  <Heart size={14} fill="currentColor" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
