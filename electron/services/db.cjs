const fs = require('fs');
const path = require('path');
const { getDbPath } = require('./appPaths.cjs');

const defaultDb = () => ({
  playlists: [],
  playlistSongs: [],
  favorites: [],
  recentPlays: [],
  settings: {},
  nextPlaylistId: 1,
  nextPlaylistSongId: 1,
});

class Database {
  constructor() {
    this.path = getDbPath();
    this.data = defaultDb();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.path)) {
        const raw = JSON.parse(fs.readFileSync(this.path, 'utf8'));
        this.data = { ...defaultDb(), ...raw };
      } else {
        this.save();
      }
    } catch {
      this.data = defaultDb();
      this.save();
    }
  }

  /** Atomic write: temp file + rename to avoid corruption on crash */
  save() {
    const dir = path.dirname(this.path);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    const payload = JSON.stringify(this.data, null, 2);
    fs.writeFileSync(tmp, payload, 'utf8');
    try {
      fs.renameSync(tmp, this.path);
    } catch {
      // Windows: rename over existing can fail — fallback copy
      fs.copyFileSync(tmp, this.path);
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  createPlaylist(name) {
    const id = this.data.nextPlaylistId++;
    const now = new Date().toISOString();
    this.data.playlists.push({
      id,
      name,
      songCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    this.save();
    return id;
  }

  listPlaylists() {
    return [...this.data.playlists].sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt))
    );
  }

  deletePlaylist(playlistId) {
    this.data.playlists = this.data.playlists.filter((p) => p.id !== playlistId);
    this.data.playlistSongs = this.data.playlistSongs.filter((s) => s.playlistId !== playlistId);
    this.save();
  }

  addSongToPlaylist(playlistId, song) {
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) throw new Error(`歌单不存在: ${playlistId}`);

    const siblings = this.data.playlistSongs.filter((s) => s.playlistId === playlistId);
    const position = siblings.reduce((m, s) => Math.max(m, s.position), -1) + 1;
    const id = this.data.nextPlaylistSongId++;

    this.data.playlistSongs.push({
      id,
      playlistId,
      songId: song.songId,
      source: song.source,
      name: song.name,
      artist: song.artist,
      album: song.album ?? '',
      duration: song.duration ?? 0,
      coverUrl: song.coverUrl ?? null,
      position,
    });

    pl.songCount = siblings.length + 1;
    pl.updatedAt = new Date().toISOString();
    this.save();
  }

  removeSongFromPlaylist(playlistId, playlistSongId) {
    this.data.playlistSongs = this.data.playlistSongs.filter(
      (s) => !(s.playlistId === playlistId && s.id === playlistSongId)
    );
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (pl) {
      pl.songCount = this.data.playlistSongs.filter((s) => s.playlistId === playlistId).length;
      pl.updatedAt = new Date().toISOString();
    }
    this.save();
  }

  getPlaylistSongs(playlistId) {
    return this.data.playlistSongs
      .filter((s) => s.playlistId === playlistId)
      .sort((a, b) => a.position - b.position);
  }

  reorderPlaylistSongs(playlistId, songIds) {
    songIds.forEach((id, position) => {
      const row = this.data.playlistSongs.find((s) => s.playlistId === playlistId && s.id === id);
      if (!row) throw new Error(`歌单 ${playlistId} 中不存在歌曲记录 ${id}`);
      row.position = position;
    });
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (pl) pl.updatedAt = new Date().toISOString();
    this.save();
  }

  exportToM3u(playlistId) {
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) throw new Error('歌单不存在');
    const songs = this.getPlaylistSongs(playlistId);
    let m3u = '#EXTM3U\n';
    m3u += `#PLAYLIST: ${pl.name}\n`;
    for (const song of songs) {
      m3u += `#EXTINF:${song.duration || 0},${song.artist} - ${song.name}\n`;
      m3u += `#SOURCE:${song.source}\n`;
      m3u += `#SONG_ID:${song.songId}\n\n`;
    }
    return m3u;
  }

  saveSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }

  loadSetting(key) {
    return Object.prototype.hasOwnProperty.call(this.data.settings, key)
      ? this.data.settings[key]
      : null;
  }

  loadAllSettings() {
    return { ...this.data.settings };
  }

  getLocalMusicDirs() {
    const dirs = this.loadSetting('local_music_dirs');
    return Array.isArray(dirs) ? dirs : [];
  }

  addLocalMusicDir(dirPath) {
    const dirs = this.getLocalMusicDirs();
    if (!dirs.includes(dirPath)) {
      dirs.push(dirPath);
      this.saveSetting('local_music_dirs', dirs);
    }
  }

  removeLocalMusicDir(dirPath) {
    this.saveSetting(
      'local_music_dirs',
      this.getLocalMusicDirs().filter((d) => d !== dirPath)
    );
  }

  // ── Favorites ──
  toggleFavorite(song) {
    if (!this.data.favorites) this.data.favorites = [];
    const key = `${song.source}::${song.songId}`;
    // Match by source + songId only (do not collapse across platforms)
    const idx = this.data.favorites.findIndex((f) => `${f.source}::${f.songId}` === key);
    if (idx >= 0) {
      this.data.favorites.splice(idx, 1);
      this.save();
      return { favorited: false };
    }
    this.data.favorites.unshift({
      id: song.id || song.songId,
      songId: song.songId,
      source: song.source,
      name: song.name,
      artist: song.artist,
      album: song.album ?? '',
      duration: song.duration ?? 0,
      coverUrl: song.coverUrl ?? null,
      qualities: song.qualities || ['320k'],
      createdAt: new Date().toISOString(),
    });
    this.save();
    return { favorited: true };
  }

  isFavorite(songId, source) {
    if (!this.data.favorites) return false;
    if (source) {
      return this.data.favorites.some((f) => f.songId === songId && f.source === source);
    }
    return this.data.favorites.some((f) => f.songId === songId);
  }

  listFavorites() {
    return [...(this.data.favorites || [])];
  }

  // ── Recent plays ──
  addRecentPlay(song) {
    if (!this.data.recentPlays) this.data.recentPlays = [];
    const key = `${song.source}::${song.songId}`;
    this.data.recentPlays = this.data.recentPlays.filter(
      (s) => `${s.source}::${s.songId}` !== key
    );
    this.data.recentPlays.unshift({
      id: song.id || song.songId,
      songId: song.songId,
      source: song.source,
      name: song.name,
      artist: song.artist,
      album: song.album ?? '',
      duration: song.duration ?? 0,
      coverUrl: song.coverUrl ?? null,
      qualities: song.qualities || ['320k'],
      fee: song.fee,
      playedAt: new Date().toISOString(),
    });
    this.data.recentPlays = this.data.recentPlays.slice(0, 80);
    this.save();
  }

  listRecentPlays(limit = 40) {
    return [...(this.data.recentPlays || [])].slice(0, limit);
  }

  clearRecentPlays() {
    this.data.recentPlays = [];
    this.save();
  }
}

module.exports = { Database };
