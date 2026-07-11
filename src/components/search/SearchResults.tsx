import { useState } from 'react';
import { ListPlus, Download, ListEnd, Play, Pause, Heart } from 'lucide-react';
import { useSearchStore } from '../../store/searchStore';
import { usePlayerStore } from '../../store/playerStore';
import { useFavoriteStore } from '../../store/favoriteStore';
import { useToast } from '../common/Toast/useToast';
import { useDownloadStore } from '../../store/downloadStore';
import { PlaybackState, Quality } from '../../types';
import type { Song } from '../../types';
import { songKey } from '../../utils/song';
import CoverImage from '../common/CoverImage';
import AddToPlaylistDialog from '../common/AddToPlaylistDialog';
import './SearchResults.css';

function formatDuration(sec: number) {
  if (!sec || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SongRow({ song, index, allSongs }: { song: Song; index: number; allSongs: Song[] }) {
  const playList = usePlayerStore((s) => s.playList);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const quality = usePlayerStore((s) => s.quality);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const favorites = useFavoriteStore((s) => s.favorites);
  const toggleFavorite = useFavoriteStore((s) => s.toggle);
  const toast = useToast();
  const addTask = useDownloadStore((s) => s.addTask);
  const [playlistSong, setPlaylistSong] = useState<Song | null>(null);

  const isActive = currentSong ? songKey(currentSong) === songKey(song) : false;
  const isPlaying = isActive && playbackState === PlaybackState.Playing;
  const isPaused = isActive && playbackState === PlaybackState.Paused;
  const isLiked = favorites.some(
    (f) => f.songId === song.songId && f.source === song.source
  );
  // Prefer player quality (settings-synced); never fall back to qualities[0] (often 128k)
  const playQuality =
    quality ||
    (song.qualities?.includes(Quality.K320) ? Quality.K320 : song.qualities?.[0]) ||
    Quality.K320;
  const maybeVip = song.playableHint === 'maybe_vip' || song.fee === 1 || song.fee === 4;

  const handlePlay = () => {
    // Active track: toggle pause / resume instead of restarting the whole list
    if (isActive && isPlaying) {
      void pause(toast.addToast);
      return;
    }
    if (isActive && isPaused) {
      void resume(toast.addToast);
      return;
    }
    if (maybeVip) {
      toast.addToast('该曲可能为付费/版权限制，尝试播放中…', 'info');
    }
    void playList(allSongs, index, playQuality, toast.addToast);
  };

  return (
    <>
      <div
        className={`song-row${isActive ? ' song-row--active' : ''}${maybeVip ? ' song-row--vip' : ''}`}
        onDoubleClick={handlePlay}
      >
        <div className="song-row__index">{index + 1}</div>

        <div className="song-row__cover" onClick={handlePlay}>
          <CoverImage src={song.coverUrl} alt="" size={16} />
        </div>

        <div className="song-row__main" onClick={handlePlay}>
          <div className="song-row__title-line">
            <span className="song-row__name truncate" title={song.name}>
              {song.name}
            </span>
            {maybeVip && <span className="song-row__vip">会员</span>}
          </div>
          <span className="song-row__artist truncate" title={song.artist}>
            {song.artist}
          </span>
        </div>

        <div className="song-row__album truncate" title={song.album}>
          {song.album || '—'}
        </div>

        <div className="song-row__duration">{formatDuration(song.duration)}</div>

        {/* 操作始终可见、带文字 */}
        <div className="song-row__actions">
          <button
            type="button"
            className={`song-row__btn song-row__btn--play${isPlaying ? ' is-playing' : ''}`}
            title={isPlaying ? '暂停' : isPaused ? '继续' : '播放'}
            onClick={(e) => {
              e.stopPropagation();
              handlePlay();
            }}
          >
            {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            <span>{isPlaying ? '暂停' : isPaused ? '继续' : '播放'}</span>
          </button>
          <button
            type="button"
            className={`song-row__btn${isLiked ? ' is-liked' : ''}`}
            title={isLiked ? '取消收藏' : '收藏'}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const on = await toggleFavorite(song);
                toast.addToast(on ? '已加入收藏' : '已取消收藏', 'success');
              } catch (err) {
                toast.addToast(err instanceof Error ? err.message : String(err), 'error');
              }
            }}
          >
            <Heart size={13} fill={isLiked ? 'currentColor' : 'none'} />
            <span>收藏</span>
          </button>
          <button
            type="button"
            className="song-row__btn"
            title="加入队列"
            onClick={(e) => {
              e.stopPropagation();
              addToQueue(song);
              toast.addToast('已加入队列', 'success');
            }}
          >
            <ListEnd size={13} />
            <span>队列</span>
          </button>
          <button
            type="button"
            className="song-row__btn"
            title="下载"
            onClick={(e) => {
              e.stopPropagation();
              void addTask(song, quality).then(() => toast.addToast('已加入下载', 'success'));
            }}
          >
            <Download size={13} />
            <span>下载</span>
          </button>
          <button
            type="button"
            className="song-row__btn"
            title="添加到歌单"
            onClick={(e) => {
              e.stopPropagation();
              setPlaylistSong(song);
            }}
          >
            <ListPlus size={13} />
            <span>歌单</span>
          </button>
        </div>
      </div>

      <AddToPlaylistDialog
        open={Boolean(playlistSong)}
        song={playlistSong}
        onClose={() => setPlaylistSong(null)}
      />
    </>
  );
}

function Skeleton() {
  return (
    <div className="song-list">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="song-row song-row--skeleton">
          <div className="song-row__skel song-row__skel--idx" />
          <div className="song-row__skel song-row__skel--cover" />
          <div className="song-row__skel song-row__skel--main" />
          <div className="song-row__skel song-row__skel--album" />
        </div>
      ))}
    </div>
  );
}

export default function SearchResults() {
  const results = useSearchStore((s) => s.results);
  const loading = useSearchStore((s) => s.loading);
  const keyword = useSearchStore((s) => s.keyword);

  if (loading) {
    return (
      <div className="search-results">
        <Skeleton />
      </div>
    );
  }

  if (!keyword) return null;

  // 多平台结果已在 store 合并去重，这里只展示扁平列表（不显示平台）
  const allSongs = Array.from(results.values()).flat();
  if (allSongs.length === 0) {
    return <div className="search-results__empty">未找到相关结果</div>;
  }

  return (
    <div className="search-results">
      <div className="song-list__head">
        <span className="song-list__h-idx">#</span>
        <span className="song-list__h-cover" />
        <span className="song-list__h-title">标题</span>
        <span className="song-list__h-album">专辑</span>
        <span className="song-list__h-dur">时长</span>
        <span className="song-list__h-act">操作</span>
      </div>
      <div className="song-list">
        {allSongs.map((song, index) => (
          <SongRow key={songKey(song)} song={song} index={index} allSongs={allSongs} />
        ))}
      </div>
    </div>
  );
}
