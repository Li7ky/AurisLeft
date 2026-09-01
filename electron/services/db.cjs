const fs = require('fs');
const path = require('path');
const { getDbPath, getSourcesPath } = require('./appPaths.cjs');

/** Bump when on-disk shape changes incompatibly */
const SCHEMA_VERSION = 1;

const defaultDb = () => ({
  schemaVersion: SCHEMA_VERSION,
  playlists: [],
  playlistSongs: [],
  favorites: [],
  recentPlays: [],
  settings: {},
  nextPlaylistId: 1,
  nextPlaylistSongId: 1,
});

function migrate(data) {
  const next = { ...defaultDb(), ...data };
  const from = Number(data.schemaVersion) || 0;

  // v0 → v1: introduce schemaVersion, ensure arrays
  if (from < 1) {
    if (!Array.isArray(next.playlists)) next.playlists = [];
    if (!Array.isArray(next.playlistSongs)) next.playlistSongs = [];
    if (!Array.isArray(next.favorites)) next.favorites = [];
    if (!Array.isArray(next.recentPlays)) next.recentPlays = [];
    if (!next.settings || typeof next.settings !== 'object') next.settings = {};
    if (!Number.isFinite(next.nextPlaylistId)) next.nextPlaylistId = 1;
    if (!Number.isFinite(next.nextPlaylistSongId)) next.nextPlaylistSongId = 1;
  }

  next.schemaVersion = SCHEMA_VERSION;
  return next;
}

class Database {
  constructor() {
    this.path = getDbPath();
    this.data = defaultDb();
    this._writeChain = Promise.resolve();
    this._saveTimer = null;
    this._dirty = false;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.path)) {
        const raw = JSON.parse(fs.readFileSync(this.path, 'utf8'));
        const before = Number(raw.schemaVersion) || 0;
        this.data = migrate(raw);
        if (before !== SCHEMA_VERSION) {
          this.save();
          console.log(`[db] migrated schema ${before} → ${SCHEMA_VERSION}`);
        }
      } else {
        this.save();
      }
    } catch (e) {
      console.warn('[db] load failed, resetting', e.message || e);
      // Keep a corrupt copy for recovery
      try {
        if (fs.existsSync(this.path)) {
          fs.copyFileSync(this.path, `${this.path}.corrupt.${Date.now()}`);
        }
      } catch {
        /* ignore */
      }
      this.data = defaultDb();
      this.save();
    }
  }

  /**
   * 防抖落盘：300ms 内多次变更只写一次，避免切歌/拖音量/收藏时
   * 反复全量 JSON.stringify + 同步写盘阻塞主进程事件循环。
   */
  save() {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      void this._flush();
    }, 300);
  }

  _flush() {
    if (!this._dirty) return this._writeChain;
    this._dirty = false;
    const dir = path.dirname(this.path);
    const tmp = `${this.path}.${process.pid}.tmp`;
    this.data.schemaVersion = SCHEMA_VERSION;
    const payload = JSON.stringify(this.data, null, 2);
    // 串行写入：上一次写完才允许下一次，避免并发写临时文件互相覆盖
    this._writeChain = this._writeChain
      .then(() => fs.promises.mkdir(dir, { recursive: true }))
      .then(() => fs.promises.writeFile(tmp, payload, 'utf8'))
      .then(async () => {
        try {
          await fs.promises.rename(tmp, this.path);
        } catch {
          // Windows: rename over existing can fail — fallback copy
          await fs.promises.copyFile(tmp, this.path);
          await fs.promises.unlink(tmp).catch(() => {});
        }
      })
      .catch((e) => console.warn('[db] save failed', e?.message || e));
    return this._writeChain;
  }

  /** 立即把当前数据写盘（导入备份后调用，保证立刻落盘） */
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    return this._flush();
  }

  /** 退出前同步兜底写盘，确保防抖窗口内的改动不丢 */
  flushSync() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (!this._dirty) return;
    try {
      const dir = path.dirname(this.path);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.path}.${process.pid}.tmp`;
      this.data.schemaVersion = SCHEMA_VERSION;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      try {
        fs.renameSync(tmp, this.path);
      } catch {
        fs.copyFileSync(tmp, this.path);
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      }
      this._dirty = false;
    } catch (e) {
      console.warn('[db] flushSync failed', e?.message || e);
    }
  }

  /** Full portable backup object (db + optional source configs) */
  exportBackup() {
    let sourcesConfig = null;
    try {
      const sp = getSourcesPath();
      if (fs.existsSync(sp)) sourcesConfig = JSON.parse(fs.readFileSync(sp, 'utf8'));
    } catch {
      /* ignore */
    }
    return {
      app: 'aurisleft',
      backupVersion: 1,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(this.data)),
      sourcesConfig,
    };
  }

  /**
   * Restore from exportBackup() payload.
   * @returns {{ ok: true, restored: string[] }}
   */
  importBackup(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('备份文件无效');
    }
    if (payload.app && payload.app !== 'aurisleft') {
      throw new Error('不是左耳备份文件');
    }
    const restored = [];
    const data = payload.data || payload;
    if (!data || typeof data !== 'object') {
      throw new Error('备份缺少数据段');
    }

    this.data = migrate({
      playlists: data.playlists || [],
      playlistSongs: data.playlistSongs || [],
      favorites: data.favorites || [],
      recentPlays: data.recentPlays || [],
      settings: data.settings || {},
      nextPlaylistId: data.nextPlaylistId || 1,
      nextPlaylistSongId: data.nextPlaylistSongId || 1,
      schemaVersion: data.schemaVersion,
    });
    this.save();
    restored.push('歌单/收藏/最近/设置');

    if (payload.sourcesConfig) {
      try {
        fs.writeFileSync(
          getSourcesPath(),
          JSON.stringify(payload.sourcesConfig, null, 2),
          'utf8'
        );
        restored.push('用户音源配置');
      } catch (e) {
        console.warn('[db] restore sourcesConfig failed', e.message || e);
      }
    }
    return { ok: true, restored };
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

module.exports = { Database, SCHEMA_VERSION };
