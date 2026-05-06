import { useState, useCallback } from 'react';
import {
  scanLocalMusic,
  playLocalFile,
  addLocalMusicDir,
  removeLocalMusicDir,
  listLocalMusicDirs,
} from '../utils/tauri';
import type { LocalSong } from '../types';

export function useLocalMusic() {
  const [localSongs, setLocalSongs] = useState<LocalSong[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>('');
  const [scanDirs, setScanDirs] = useState<string[]>([]);

  const scan = useCallback(async () => {
    setScanning(true);
    setScanProgress('正在扫描本地音乐...');
    try {
      const songs = await scanLocalMusic();
      setLocalSongs(songs);
      setScanProgress(`扫描完成，找到 ${songs.length} 首歌曲`);
    } catch (error) {
      setScanProgress(`扫描失败: ${error}`);
    } finally {
      setScanning(false);
    }
  }, []);

  const play = useCallback(async (filePath: string) => {
    await playLocalFile(filePath);
  }, []);

  const loadDirs = useCallback(async () => {
    try {
      const dirs = await listLocalMusicDirs();
      setScanDirs(dirs);
    } catch {
      setScanDirs([]);
    }
  }, []);

  const addDir = useCallback(async () => {
    const dirPath = window.prompt('请输入音乐文件夹路径：');
    if (dirPath && dirPath.trim()) {
      await addLocalMusicDir(dirPath.trim());
      await loadDirs();
    }
  }, [loadDirs]);

  const removeDir = useCallback(
    async (dirPath: string) => {
      await removeLocalMusicDir(dirPath);
      await loadDirs();
    },
    [loadDirs]
  );

  const addToPlaylist = useCallback(async (_playlistId: number, _song: LocalSong) => {
    throw new Error('addToPlaylist 暂未实现');
  }, []);

  return {
    localSongs,
    scanning,
    scanProgress,
    scanDirs,
    scan,
    play,
    addDir,
    removeDir,
    loadDirs,
    addToPlaylist,
  };
}
