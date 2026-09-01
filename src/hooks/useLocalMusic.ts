import { useState, useCallback, useEffect, useRef } from 'react';
import {
  scanLocalMusic,
  addLocalMusicDir,
  removeLocalMusicDir,
  listLocalMusicDirs,
  selectDirectory,
} from '../utils/desktop';
import type { LocalSong } from '../types';
import { localSongToSong } from '../utils/song';
import { usePlayerStore } from '../store/playerStore';

export function useLocalMusic() {
  const [localSongs, setLocalSongs] = useState<LocalSong[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>('');
  const [scanDirs, setScanDirs] = useState<string[]>([]);
  const [showDirDialog, setShowDirDialog] = useState(false);
  const [dirInput, setDirInput] = useState('');

  // 卸载保护:扫描是异步 IPC,组件卸载后不再 setState
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setScanProgress('正在扫描本地音乐…');
    try {
      const songs = await scanLocalMusic();
      if (!mountedRef.current) return;
      setLocalSongs(songs);
      setScanProgress(`扫描完成，找到 ${songs.length} 首歌曲`);
    } catch (error) {
      if (!mountedRef.current) return;
      setScanProgress(`扫描失败: ${error}`);
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  }, []);

  const play = useCallback(async (filePath: string, songs = localSongs) => {
    const list = songs.map(localSongToSong);
    const index = list.findIndex((s) => s.songId === filePath);
    await usePlayerStore.getState().playList(list, index >= 0 ? index : 0);
  }, [localSongs]);

  const loadDirs = useCallback(async () => {
    try {
      const dirs = await listLocalMusicDirs();
      setScanDirs(dirs);
    } catch {
      setScanDirs([]);
    }
  }, []);

  const openAddDirDialog = useCallback(async () => {
    try {
      const picked = await selectDirectory();
      if (picked) {
        await addLocalMusicDir(picked);
        await loadDirs();
        setScanProgress(`已添加本地音乐目录：${picked}`);
        return;
      }
    } catch {
      /* fall through to manual input */
    }
    setDirInput('');
    setShowDirDialog(true);
  }, [loadDirs]);

  const closeAddDirDialog = useCallback(() => {
    setShowDirDialog(false);
    setDirInput('');
  }, []);

  const confirmAddDir = useCallback(async () => {
    const trimmedPath = dirInput.trim();
    if (!trimmedPath) {
      setScanProgress('添加目录失败：路径不能为空');
      return;
    }

    try {
      await addLocalMusicDir(trimmedPath);
      await loadDirs();
      setScanProgress(`已添加本地音乐目录：${trimmedPath}`);
      setShowDirDialog(false);
      setDirInput('');
    } catch (error) {
      setScanProgress(`添加目录失败，请确认路径存在且可访问：${error}`);
    }
  }, [dirInput, loadDirs]);

  const removeDir = useCallback(
    async (dirPath: string) => {
      try {
        await removeLocalMusicDir(dirPath);
        await loadDirs();
        setScanProgress('已移除本地音乐目录');
      } catch (error) {
        setScanProgress(`移除目录失败：${error}`);
      }
    },
    [loadDirs]
  );

  return {
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
  };
}
