import { useEffect } from 'react';
import { useLocalMusic } from '../../hooks/useLocalMusic';
import type { LocalSong } from '../../types';
import './index.css';

export default function LocalMusic() {
  const { localSongs, scanning, scanProgress, scanDirs, scan, play, addDir, removeDir, loadDirs } =
    useLocalMusic();

  useEffect(() => {
    loadDirs();
  }, [loadDirs]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="local-music">
      <div className="local-music__header">
        <h2 className="local-music__title">本地音乐</h2>
        <div className="local-music__actions">
          <button className="local-music__btn local-music__btn--primary" onClick={addDir}>
            添加文件夹
          </button>
          <button
            className="local-music__btn local-music__btn--scan"
            onClick={scan}
            disabled={scanning}
          >
            {scanning ? '扫描中...' : '扫描音乐'}
          </button>
        </div>
      </div>

      {scanDirs.length > 0 && (
        <div className="local-music__dirs">
          <h3>扫描目录</h3>
          <ul className="local-music__dir-list">
            {scanDirs.map((dir) => (
              <li key={dir} className="local-music__dir-item">
                <span className="local-music__dir-path">{dir}</span>
                <button
                  className="local-music__btn local-music__btn--small"
                  onClick={() => removeDir(dir)}
                >
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
        <div className="local-music__list">
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
              {localSongs.map((song, index) => (
                <LocalSongRow
                  key={song.filePath}
                  song={song}
                  index={index}
                  onPlay={play}
                  formatDuration={formatDuration}
                  formatFileSize={formatFileSize}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!scanning && localSongs.length === 0 && !scanDirs.length && (
        <div className="local-music__empty">
          <p>还没有添加音乐文件夹</p>
          <button className="local-music__btn local-music__btn--primary" onClick={addDir}>
            添加文件夹开始
          </button>
        </div>
      )}

      {!scanning && localSongs.length === 0 && scanDirs.length > 0 && scanProgress && (
        <div className="local-music__empty">
          <p>扫描目录中暂无找到音乐文件</p>
          <button className="local-music__btn local-music__btn--scan" onClick={scan}>
            重新扫描
          </button>
        </div>
      )}
    </div>
  );
}

function LocalSongRow({
  song,
  index,
  onPlay,
  formatDuration,
  formatFileSize,
}: {
  song: LocalSong;
  index: number;
  onPlay: (filePath: string) => void;
  formatDuration: (seconds: number) => string;
  formatFileSize: (bytes: number) => string;
}) {
  return (
    <tr className="local-music__row" onClick={() => onPlay(song.filePath)}>
      <td className="local-music__td local-music__td--title">
        <span className="local-music__index">{index + 1}</span>
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
      <td className="local-music__td">
        <button
          className="local-music__btn local-music__btn--play"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(song.filePath);
          }}
        >
          播放
        </button>
      </td>
    </tr>
  );
}
