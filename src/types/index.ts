export enum Quality {
  K128 = '128k',
  K320 = '320k',
  FLAC = 'flac',
  HiRes = 'hires',
}

export enum SourceType {
  JsModule = 'js',
  JsonConfig = 'json',
}

export enum PlaybackState {
  Idle = 'idle',
  Loading = 'loading',
  Playing = 'playing',
  Paused = 'paused',
  Error = 'error',
}

export enum RepeatMode {
  None = 'none',
  One = 'one',
  All = 'all',
}

export enum DownloadStatus {
  Downloading = 'downloading',
  Completed = 'completed',
  Failed = 'failed',
}

export interface SourceInfo {
  id: string;
  name: string;
  version: string;
  type: SourceType;
  enabled: boolean;
  supportedQualities: Quality[];
  failCount: number;
  disabledUntil?: number;
}

export interface Song {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string | null;
  source: string;
  songId: string;
  qualities: Quality[];
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricMetadata {
  title: string | null;
  artist: string | null;
  album: string | null;
  by: string | null;
}

export interface Lyric {
  lines: LyricLine[];
  metadata: LyricMetadata | null;
}

export interface DownloadTask {
  url: string;
  songName: string;
  progress: number;
  status: DownloadStatus;
  error?: string;
}

export interface PlayerSettings {
  defaultQuality: Quality;
  autoPlayNext: boolean;
  volume: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
}

export interface AppearanceSettings {
  theme: ThemeConfig;
  showLyric: boolean;
}

export interface SourceSettings {
  timeoutMs: number;
  failThreshold: number;
  cacheDurationMinutes: number;
}

export interface AppSettings {
  player: PlayerSettings;
  appearance: AppearanceSettings;
  sources: SourceSettings;
}

export interface Playlist {
  id: number;
  name: string;
  songCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistSong {
  id: number;
  playlistId: number;
  songId: string;
  source: string;
  name: string;
  artist: string;
  album: string | null;
  duration: number | null;
  coverUrl: string | null;
  position: number;
  qualities: Quality[];
}

export interface SearchResult {
  songs: Song[];
  total: number;
  page: number;
  perPage: number;
}

export interface ThemeConfig {
  primary: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
}

export interface TrackInfo {
  song: Song;
  quality: Quality;
  url: string;
  duration: number;
}

export interface LocalSong {
  filePath: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileSize: number;
  format: string;
}

export interface SleepTimerStatus {
  isActive: boolean;
  remainingSeconds: number;
}
