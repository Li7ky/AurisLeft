import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, RefreshCw, Play, ListPlus } from 'lucide-react';
import { useLocalMusic } from '../../hooks/useLocalMusic';
import type { LocalSong, Song } from '../../types';
import { localSongToSong } from '../../utils/song';
import AddToPlaylistDialog from '../../components/common/AddToPlaylistDialog';
import CoverImage from '../../components/common/CoverImage';
import './index.css';

const ROW_H = 44;
const VIEWPORT = 480;

export default function LocalMusic() {
  const {
    localSongs,
    scanning,
    scanProgress,
    scanDirs,
    showDirDialog,
    dirInput,
    setDirInput,
    scan,
    play,
    openAddDirDialog,
    closeAddDirDialog,
    confirmAddDir,
    removeDir,
    loadDirs,
  } = useLocalMusic();

  const [scrollTop, setScrollTop] = useState(0);
  const [playlistSong, setPlaylistSong] = useState<Song | null>(null);

  useEffect(() => {
    loadDirs();
  }, [loadDirs]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePlayAll = () => {
    if (localSongs[0]) void play(localSongs[0].filePath, localSongs);
  };

  // simple virtual window for large libraries
  const { start, end, padTop, padBottom } = useMemo(() => {
    const total = localSongs.length;
    if (total <= 80) {
      return { start: 0, end: total, padTop: 0, padBottom: 0 };
    }
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - 8);
    const visible = Math.ceil(VIEWPORT / ROW_H) + 16;
    const endIdx = Math.min(total, startIdx + visible);
    return {
      start: startIdx,
      end: endIdx,
      padTop: startIdx * ROW_H,
      padBottom: Math.max(0, (total - endIdx) * ROW_H),
    };
  }, [localSongs.length, scrollTop]);

  const visibleSongs = localSongs.slice(start, end);

  return (
    <div className="local-music">
      <div className="local-music__header">
        <div>
          <h2 className="local-music__title">本地音乐</h2>
          <p className="local-music__subtitle">
            添加文件夹后扫描；可播放、连播，也可加入歌单。
          </p>
        </div>
        <div className="local-music__actions">
          <button className="local-music__btn local-music__btn--primary" onClick={() => void openAddDirDialog()}>
            <FolderPlus size={15} />
            添加文件夹
          </button>
          <button className="local-music__btn local-music__btn--scan" onClick={scan} disabled={scanning}>
            <RefreshCw size={15} className={scanning ? 'spin' : undefined} />
            {scanning ? '扫描中…' : '扫描音乐'}
          </button>
          {localSongs.length > 0 && (
            <button className="local-music__btn local-music__btn--play" onClick={handlePlayAll}>
              <Play size={15} fill="currentColor" />
              播放全部
            </button>
          )}
        </div>
      </div>

      {scanDirs.length > 0 && (
        <div className="local-music__dirs">
          <h3>扫描目录</h3>
          <ul className="local-music__dir-list">
            {scanDirs.map((dir) => (
              <li key={dir} className="local-music__dir-item">
                <span className="local-music__dir-path">{dir}</span>
                <button className="local-music__btn local-music__btn--small" onClick={() => removeDir(dir)}>
                  移除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {scanProgress && (
        <div className={`local-music__status${scanning ? ' local-music__status--scanning' : ''}`}>
          {scanProgress}
        </div>
      )}

      {localSongs.length > 0 && (
        <div
          className="local-music__list local-music__list--virtual"
          style={{ maxHeight: VIEWPORT }}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        >
          <table className="local-music__table">
            <thead>
              <tr>
                <th className="local-music__th local-music__th--title">歌曲</th>
                <th className="local-music__th">歌手</th>
                <th className="local-music__th">专辑</th>
                <th className="local-music__th">时长</th>
                <th className="local-music__th">格式</th>
                <th className="local-music__th">大小</th>
                <th className="local-music__th">操作</th>
              </tr>
            </thead>
            <tbody>
              {padTop > 0 && (
                <tr aria-hidden>
                  <td colSpan={7} style={{ height: padTop, padding: 0, border: 'none' }} />
                </tr>
              )}
              {visibleSongs.map((song, i) => (
                <LocalSongRow
                  key={song.filePath}
                  song={song}
                  index={start + i}
                  onPlay={(path) => void play(path, localSongs)}
                  onAddPlaylist={() => setPlaylistSong(localSongToSong(song))}
                  formatDuration={formatDuration}
                  formatFileSize={formatFileSize}
                />
              ))}
              {padBottom > 0 && (
                <tr aria-hidden>
                  <td colSpan={7} style={{ height: padBottom, padding: 0, border: 'none' }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!scanning && localSongs.length === 0 && !scanDirs.length && (
        <div className="local-music__empty">
          <p>还没有本地音乐</p>
          <p className="local-music__empty-hint">
            添加电脑上的歌曲文件夹（如「下载」或自定义目录），再扫描即可播放。
          </p>
          <button className="local-music__btn local-music__btn--primary" onClick={() => void openAddDirDialog()}>
            添加文件夹开始
          </button>
        </div>
      )}

      {!scanning && localSongs.length === 0 && scanDirs.length > 0 && (
        <div className="local-music__empty">
          <p>已添加 {scanDirs.length} 个目录，但还没有扫到歌曲</p>
          <p className="local-music__empty-hint">
            支持常见音频格式。确认文件夹里有 mp3 / flac / m4a 等文件后点扫描。
          </p>
          <div className="local-music__empty-actions">
            <button className="local-music__btn local-music__btn--scan" onClick={scan}>
              扫描音乐
            </button>
            <button
              className="local-music__btn local-music__btn--primary"
              onClick={() => void openAddDirDialog()}
            >
              再加一个文件夹
            </button>
          </div>
        </div>
      )}

      {showDirDialog && (
        <div className="local-music__dialog-overlay" onClick={closeAddDirDialog}>
          <div className="local-music__dialog" onClick={(e) => e.stopPropagation()}>
            <h3>添加本地音乐目录</h3>
            <p>请输入文件夹完整路径，例如：</p>
            <code>D:\Music</code>
            <input
              className="local-music__dialog-input"
              value={dirInput}
              onChange={(e) => setDirInput(e.target.value)}
              placeholder="音乐文件夹路径"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmAddDir();
              }}
            />
            <div className="local-music__dialog-actions">
              <button className="local-music__btn" onClick={closeAddDirDialog}>
                取消
              </button>
              <button
                className="local-music__btn local-music__btn--primary"
                onClick={() => void confirmAddDir()}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      <AddToPlaylistDialog
        open={Boolean(playlistSong)}
        song={playlistSong}
        onClose={() => setPlaylistSong(null)}
      />
    </div>
  );
}

function LocalSongRow({
  song,
  index,
  onPlay,
  onAddPlaylist,
  formatDuration,
  formatFileSize,
}: {
  song: LocalSong;
  index: number;
  onPlay: (filePath: string) => void;
  onAddPlaylist: () => void;
  formatDuration: (seconds: number) => string;
  formatFileSize: (bytes: number) => string;
}) {
  return (
    <tr className="local-music__row" onDoubleClick={() => onPlay(song.filePath)}>
      <td className="local-music__td local-music__td--title">
        <span className="local-music__index">{index + 1}</span>
        <CoverImage src={song.coverUrl} alt="" size={14} className="local-music__cover" />
        <span className="local-music__name" title={song.title}>
          {song.title}
        </span>
      </td>
      <td className="local-music__td" title={song.artist}>
        {song.artist}
      </td>
      <td className="local-music__td" title={song.album}>
        {song.album}
      </td>
      <td className="local-music__td">{formatDuration(song.duration)}</td>
      <td className="local-music__td">{song.format.toUpperCase()}</td>
      <td className="local-music__td">{formatFileSize(song.fileSize)}</td>
      <td className="local-music__td local-music__td--actions">
        <button
          className="local-music__btn local-music__btn--play"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(song.filePath);
          }}
        >
          播放
        </button>
        <button
          className="local-music__btn local-music__btn--small"
          title="加入歌单"
          onClick={(e) => {
            e.stopPropagation();
            onAddPlaylist();
          }}
        >
          <ListPlus size={14} />
        </button>
      </td>
    </tr>
  );
}
