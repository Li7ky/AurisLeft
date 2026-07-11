/**
 * Desktop API wrappers (Electron IPC).
 */
import { invoke } from './ipc';
import type {
  SourceInfo,
  Song,
  Lyric,
  Playlist,
  PlaylistSong,
  SearchResult,
  ThemeConfig,
  AppSettings,
  Quality,
  SleepTimerStatus,
} from '../types';

export async function registerSource(
  sourceType: 'json' | 'js',
  name: string,
  content: string
): Promise<SourceInfo> {
  return invoke<SourceInfo>('register_source', { sourceType, name, content });
}

export async function listSources(): Promise<SourceInfo[]> {
  return invoke<SourceInfo[]>('list_sources');
}

export interface LxHostInfo {
  id: string;
  name: string;
  version?: string;
  ready: boolean;
  enabled?: boolean;
  platforms: string[];
  hidden?: boolean;
}

export async function getLxStatus(): Promise<{
  enabled: boolean;
  count: number;
  total?: number;
  ready?: boolean;
  initializing?: boolean;
  names: string[];
  hosts?: LxHostInfo[];
}> {
  return invoke('get_lx_status');
}

export async function toggleLxSource(
  sourceId: string,
  enabled?: boolean
): Promise<LxHostInfo> {
  return invoke('toggle_lx_source', { sourceId, enabled });
}

export async function toggleSource(sourceId: string): Promise<unknown> {
  return invoke('toggle_source', { sourceId });
}

export async function loadSourcesFromFile(): Promise<SourceInfo[]> {
  return invoke<SourceInfo[]>('load_sources_from_file');
}

export async function removeSource(sourceId: string): Promise<void> {
  return invoke('remove_source', { sourceId });
}

export async function searchMusic(keyword: string, page: number): Promise<SearchResult> {
  return invoke<SearchResult>('search_music', { keyword, page });
}

/** Returns stream URL for renderer HTMLAudioElement */
export async function playSong(
  song: Song,
  quality: Quality
): Promise<{
  url: string;
  duration: number;
  coverUrl?: string | null;
  album?: string;
  rawUrl?: string;
  gen?: number;
  fromCache?: boolean;
  cancelled?: boolean;
  code?: string;
} | void> {
  return invoke('play_song', { song, quality });
}

/** 后台预热单曲（悬停/即将播放），命中后可秒开 */
export async function warmSong(song: Song, quality?: Quality): Promise<{ ok: boolean; cached?: boolean }> {
  return invoke('warm_song', { song, quality: quality || '320k' });
}

/** 批量预热（队列下一首等） */
export async function warmSongs(songs: Song[], quality?: Quality): Promise<{ ok: boolean }> {
  return invoke('warm_songs', { songs, quality: quality || '320k' });
}

export async function pausePlayback(): Promise<void> {
  return invoke('pause_playback');
}

export async function resumePlayback(): Promise<void> {
  return invoke('resume_playback');
}

export async function stopPlayback(): Promise<void> {
  return invoke('stop_playback');
}

export async function seekTo(positionSeconds: number): Promise<void> {
  return invoke('seek_to', { positionSeconds });
}

export async function setVolume(volume: number): Promise<void> {
  return invoke('set_volume', { volume });
}

export async function fetchLyric(songId: string, source: string): Promise<Lyric> {
  return invoke<Lyric>('fetch_lyric', { songId, source });
}

export async function createPlaylist(name: string): Promise<number> {
  return invoke<number>('create_playlist', { name });
}

export async function addToPlaylist(playlistId: number, song: Song): Promise<void> {
  return invoke('add_to_playlist', { playlistId, song });
}

export async function removeFromPlaylist(
  playlistId: number,
  playlistSongId: number
): Promise<void> {
  return invoke('remove_from_playlist', { playlistId, playlistSongId });
}

export async function listPlaylists(): Promise<Playlist[]> {
  return invoke<Playlist[]>('list_playlists');
}

export async function deletePlaylist(playlistId: number): Promise<void> {
  return invoke('delete_playlist', { playlistId });
}

export async function getPlaylistSongs(playlistId: number): Promise<PlaylistSong[]> {
  return invoke<PlaylistSong[]>('get_playlist_songs', { playlistId });
}

export async function reorderPlaylistSongs(playlistId: number, songIds: number[]): Promise<void> {
  return invoke('reorder_playlist_songs', { playlistId, songIds });
}

export async function importPlaylist(filePath: string, format: string): Promise<number> {
  return invoke<number>('import_playlist', { filePath, format });
}

export async function exportPlaylist(playlistId: number, format = 'm3u'): Promise<string> {
  return invoke<string>('export_playlist', { playlistId, format });
}

export async function setTheme(theme: ThemeConfig): Promise<void> {
  return invoke('set_theme', { theme });
}

export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('load_settings');
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke('save_settings', { settings });
}

export async function scanLocalMusic(): Promise<
  {
    filePath: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    fileSize: number;
    format: string;
    coverUrl?: string | null;
  }[]
> {
  return invoke('scan_local_music');
}

export async function playLocalFile(filePath: string): Promise<{ url: string; duration: number }> {
  return invoke('play_local_file', { filePath });
}

export async function addLocalMusicDir(dirPath: string): Promise<void> {
  return invoke('add_local_music_dir', { dirPath });
}

export async function removeLocalMusicDir(dirPath: string): Promise<void> {
  return invoke('remove_local_music_dir', { dirPath });
}

export async function listLocalMusicDirs(): Promise<string[]> {
  return invoke<string[]>('list_local_music_dirs');
}

export async function downloadSong(song: Song, quality: Quality): Promise<string> {
  return invoke<string>('download_song', { song, quality });
}

export async function getDownloadDir(): Promise<string> {
  return invoke<string>('get_download_dir');
}

export async function setDownloadDir(dir: string): Promise<void> {
  return invoke('set_download_dir', { dir });
}

export async function startSleepTimer(minutes: number): Promise<void> {
  return invoke('start_sleep_timer', { minutes });
}

export async function cancelSleepTimer(): Promise<void> {
  return invoke('cancel_sleep_timer');
}

export async function getSleepTimerStatus(): Promise<SleepTimerStatus> {
  return invoke<SleepTimerStatus>('get_sleep_timer_status');
}

export async function selectDirectory(): Promise<string | null> {
  return invoke<string | null>('select_directory');
}

export async function toggleFavorite(song: Song): Promise<{ favorited: boolean }> {
  return invoke<{ favorited: boolean }>('toggle_favorite', { song });
}

export async function listFavorites(): Promise<Song[]> {
  return invoke<Song[]>('list_favorites');
}

export async function isFavorite(songId: string, source?: string): Promise<boolean> {
  return invoke<boolean>('is_favorite', { songId, source });
}

export async function listRecentPlays(limit = 40): Promise<Song[]> {
  return invoke<Song[]>('list_recent_plays', { limit });
}

export async function clearRecentPlays(): Promise<void> {
  return invoke('clear_recent_plays');
}

export async function exportBackup(): Promise<{ canceled: boolean; path?: string }> {
  return invoke('export_backup');
}

export async function importBackup(): Promise<{
  canceled: boolean;
  ok?: boolean;
  restored?: string[];
  path?: string;
}> {
  return invoke('import_backup');
}

export async function openLogDir(): Promise<string> {
  return invoke('open_log_dir');
}

export async function getLogDir(): Promise<string> {
  return invoke('get_log_dir');
}

export async function getAppVersion(): Promise<string> {
  return invoke('get_app_version');
}

export interface UpdateCheckResult {
  current: string;
  latest: string;
  hasUpdate: boolean;
  name?: string;
  notes?: string;
  url?: string;
  publishedAt?: string | null;
  message?: string;
  error?: string;
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  return invoke('check_for_updates');
}

export async function openExternal(url: string): Promise<void> {
  return invoke('open_external', { url });
}

export async function markOnboardingSeen(): Promise<void> {
  return invoke('mark_onboarding_seen');
}

export interface NkiQqStatus {
  enabled: boolean;
  hasKey: boolean;
  keyHint: string;
  api: string;
}

export async function getNkiQqStatus(): Promise<NkiQqStatus> {
  return invoke('get_nki_qq_status');
}

export async function setNkiQqKey(apiKey: string): Promise<{ ok: boolean; hasKey: boolean }> {
  return invoke('set_nki_qq_key', { apiKey });
}

export async function setNkiQqEnabled(
  enabled: boolean
): Promise<{ ok: boolean; enabled: boolean }> {
  return invoke('set_nki_qq_enabled', { enabled });
}

/** Wait until LX sources finish init (or timeout). Returns status snapshot. */
export async function waitForSourcesReady(timeoutMs = 25000): Promise<{
  ready: boolean;
  count: number;
  initializing: boolean;
}> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await getLxStatus();
    if (!s.initializing && (s.count > 0 || s.ready === true || s.total === 0)) {
      return {
        ready: Boolean(s.count > 0 || s.enabled),
        count: s.count ?? 0,
        initializing: false,
      };
    }
    if (!s.initializing && s.count === 0) {
      return { ready: false, count: 0, initializing: false };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  const last = await getLxStatus().catch(() => ({
    count: 0,
    enabled: false,
    initializing: true,
  }));
  return {
    ready: Boolean(last.count > 0 || last.enabled),
    count: last.count ?? 0,
    initializing: Boolean(last.initializing),
  };
}
