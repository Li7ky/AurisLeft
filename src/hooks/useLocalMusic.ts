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
    const dirPath = window.prompt(
      '当前未安装 Tauri 文件夹选择插件，请手动输入音乐文件夹的完整路径（例如 D:/Music）：'
    );
    const trimmedPath = dirPath?.trim();

    if (dirPath === null) {
      return;
    }

    if (!trimmedPath) {
      setScanProgress('添加目录失败：路径不能为空');
      return;
    }

    try {
      await addLocalMusicDir(trimmedPath);
      await loadDirs();
      setScanProgress(`已添加本地音乐目录：${trimmedPath}`);
    } catch (error) {
      setScanProgress(`添加目录失败，请确认路径存在且可访问：${error}`);
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
