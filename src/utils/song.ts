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
  return song.source === 'local';
}
