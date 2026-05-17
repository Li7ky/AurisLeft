import { invoke } from '@tauri-apps/api/core';
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
} from '../types';
import type { SleepTimerStatus } from '../types';

export async function registerSource(path: string): Promise<SourceInfo> {
  return invoke<SourceInfo>('register_source', { path });
}

export async function listSources(): Promise<SourceInfo[]> {
  return invoke<SourceInfo[]>('list_sources');
}

export async function loadSourcesFromFile(): Promise<SourceInfo[]> {
  return invoke<SourceInfo[]>('load_sources_from_file');
}

export async function toggleSource(sourceId: string): Promise<void> {
  return invoke('toggle_source', { sourceId });
}

export async function removeSource(sourceId: string): Promise<void> {
  return invoke('remove_source', { sourceId });
}

export async function searchMusic(keyword: string, page: number): Promise<SearchResult> {
  return invoke<SearchResult>('search_music', { keyword, page });
}

export async function playSong(song: Song, quality: Quality): Promise<void> {
  return invoke('play_song', { song, quality });
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
  }[]
> {
  return invoke('scan_local_music');
}

export async function playLocalFile(filePath: string): Promise<void> {
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
