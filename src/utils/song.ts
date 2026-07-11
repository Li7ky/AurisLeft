import type { LocalSong, PlaylistSong, Song } from '../types';
import { Quality } from '../types';

/** Stable song identity for queue matching */
export function songKey(song: Pick<Song, 'id' | 'source' | 'songId'>): string {
  return `${song.source}::${song.songId || song.id}`;
}

export function playlistSongToSong(song: PlaylistSong, quality = Quality.K320): Song {
  return {
    id: song.songId,
    name: song.name,
    artist: song.artist,
    album: song.album ?? '',
    duration: song.duration ?? 0,
    coverUrl: song.coverUrl,
    source: song.source,
    songId: song.songId,
    qualities: song.qualities?.length ? song.qualities : [quality],
  };
}

export function localSongToSong(song: LocalSong): Song {
  return {
    id: `local:${song.filePath}`,
    name: song.title || song.filePath.split(/[/\\]/).pop() || '未知曲目',
    artist: song.artist || '未知艺人',
    album: song.album || '',
    duration: song.duration || 0,
    coverUrl: song.coverUrl ?? null,
    source: 'local',
    songId: song.filePath,
    qualities: [Quality.K320],
  };
}

export function isLocalSong(song: Song): boolean {
  if (song.source === 'local') return true;
  const id = String(song.songId || song.id || '');
  // 兼容异常元数据：source 丢了但 songId 仍是本机路径
  if (/^[a-zA-Z]:[\\/]/.test(id) || id.startsWith('\\\\') || id.startsWith('/')) {
    return true;
  }
  if (id.startsWith('local:') || String(song.id || '').startsWith('local:')) {
    return true;
  }
  return false;
}

/** 从可能被污染的 Song 里取出真实本地路径 */
export function localSongPath(song: Song): string {
  const id = String(song.songId || '');
  if (id.startsWith('local:')) return id.slice(6);
  if (/^[a-zA-Z]:[\\/]/.test(id) || id.startsWith('\\\\') || id.startsWith('/')) {
    return id;
  }
  const name = String(song.name || '');
  if (name.startsWith('local:')) return name.slice(6);
  if (/^[a-zA-Z]:[\\/]/.test(name)) return name;
  return id || name;
}
