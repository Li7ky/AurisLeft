const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Database } = require('./db.cjs');
const { SourceManager } = require('./sources.cjs');
const { scanDirs, loadLocalLrc } = require('./localMusic.cjs');
const download = require('./download.cjs');
const { SleepTimer } = require('./timer.cjs');

const defaultSettings = () => ({
  player: {
    defaultQuality: '320k',
    autoPlayNext: true,
    volume: 0.8,
    shuffle: false,
    repeatMode: 'none',
  },
  appearance: {
    theme: {
      primary: '#e8a54b',
      background: '#0c0e12',
      surface: '#141820',
      textPrimary: '#f3f1ec',
      textSecondary: '#8a8794',
      accent: '#9b8cff',
    },
    showLyric: true,
  },
  sources: {
    timeoutMs: 8000,
    failThreshold: 3,
    cacheDurationMinutes: 30,
  },
});

function createAppState() {
  const db = new Database();
  const sourceMgr = new SourceManager();
  const sleepTimer = new SleepTimer();
  // 预热洛雪隐藏音源（不阻塞 UI，失败可忽略）
  void sourceMgr.ensureLxBuiltin().catch((e) => {
    console.warn('[boot] LX sources warm-up failed', e.message || e);
  });
  return { db, sourceMgr, sleepTimer };
}

function registerHandlers(ipcMain, getMainWindow, state) {
  const { db, sourceMgr, sleepTimer } = state;

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (_event, payload = {}) => {
      try {
        return await fn(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[IPC ${channel}]`, message);
        throw new Error(message);
      }
    });
  };

  // ── Sources ──
  handle('register_source', async ({ sourceType, name, content }) => {
    if (sourceType === 'json') {
      const config = JSON.parse(content);
      return sourceMgr.registerJsonSource(
        name || config.name || 'JSON Source',
        config.api_base || config.apiBase,
        config.endpoints || {}
      );
    }
    if (sourceType === 'js') {
      return sourceMgr.registerJsSource(content, name || 'JS Source');
    }
    throw new Error("Unknown source type. Use 'json' or 'js'");
  });

  handle('register_js_source', async ({ code }) => sourceMgr.registerJsSource(code));
  handle('list_sources', async () => sourceMgr.listSources({ includeHidden: false }));
  handle('get_lx_status', async () => sourceMgr.getLxStatus());
  handle('toggle_source', async ({ sourceId }) => sourceMgr.toggleSource(sourceId));
  handle('toggle_lx_source', async ({ sourceId, enabled }) => {
    if (typeof enabled === 'boolean') {
      return sourceMgr.setLxSourceEnabled(sourceId, enabled);
    }
    return sourceMgr.toggleLxSource(sourceId);
  });
  handle('remove_source', async ({ sourceId }) => {
    sourceMgr.removeSource(sourceId);
  });
  handle('load_sources_from_file', async () => sourceMgr.loadFromFile());
  handle('save_sources_config', async ({ content }) => {
    sourceMgr.saveConfig(content);
  });

  // ── Search ──
  handle('search_music', async ({ keyword, page }) => {
    const timeout =
      db.loadSetting('app_settings')?.sources?.timeoutMs || defaultSettings().sources.timeoutMs;
    const results = await sourceMgr.searchAll(keyword, page || 1, timeout);
    const songs = [];
    const seen = new Set();
    let total = 0;
    for (const item of results) {
      total += item.result.total || 0;
      for (const song of item.result.songs || []) {
        const key = `${song.source}:${song.songId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        songs.push(song);
      }
    }
    return {
      songs,
      total: total || songs.length,
      page: page || 1,
      perPage: 30,
    };
  });

  // ── Player: resolve URL, renderer plays via HTMLAudio ──
  handle('play_song', async ({ song, quality }) => {
    // 播放前确保洛雪音源完成初始化（未 inited 的脚本取链必失败）
    const lx = await sourceMgr.waitLxReady(25000);
    console.log(
      `[play_song] LX init ready=${lx.ready} count=${lx.count} finished=${lx.finished} waited=${lx.waitedMs}ms`
    );
    const url = await sourceMgr.getMusicUrl(song.songId, quality || '320k', song.source, {
      name: song.name,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      coverUrl: song.coverUrl,
      hash: song.hash,
      strMediaMid: song.strMediaMid,
      source: song.source,
    });
    if (
      !url ||
      (!/^https?:\/\//i.test(url) &&
        !url.startsWith('file:') &&
        !url.startsWith('aurislocal:') &&
        !url.startsWith('aurisstream:'))
    ) {
      throw new Error('取链结果无效');
    }
    // 在线 http(s) 走 aurisstream 代理，带平台 Referer，避免 CDN 403 导致「无法播放」
    let playUrl = url;
    if (/^https?:\/\//i.test(url)) {
      const encoded = Buffer.from(url, 'utf8').toString('base64url');
      playUrl = `aurisstream://u/${encoded}`;
    }
    try {
      db.addRecentPlay(song);
    } catch {
      /* ignore */
    }
    console.log('[play_song]', song.name, '->', url.slice(0, 120));
    return { url: playUrl, duration: song.duration || 0 };
  });

  handle('play_local_file', async ({ filePath }) => {
    if (!fs.existsSync(filePath)) throw new Error(`本地文件不存在: ${filePath}`);
    // Prefer custom protocol (safer than file:// + webSecurity off)
    const encoded = Buffer.from(filePath, 'utf8').toString('base64url');
    const url = `aurislocal://media/${encoded}`;
    try {
      const name = path.basename(filePath, path.extname(filePath));
      db.addRecentPlay({
        id: `local:${filePath}`,
        songId: filePath,
        source: 'local',
        name,
        artist: '本地',
        album: '',
        duration: 0,
        coverUrl: null,
        qualities: ['320k'],
      });
    } catch {
      /* ignore */
    }
    return { url, duration: 0 };
  });

  handle('list_recent_plays', async ({ limit } = {}) => db.listRecentPlays(limit || 40));
  handle('clear_recent_plays', async () => {
    db.clearRecentPlays();
  });
  handle('record_recent_play', async ({ song }) => {
    db.addRecentPlay(song);
  });

  // Playback control is renderer-side; these no-op for API compatibility
  handle('pause_playback', async () => null);
  handle('resume_playback', async () => null);
  handle('stop_playback', async () => null);
  handle('seek_to', async () => null);
  handle('set_volume', async () => null);

  // ── Lyric ──
  handle('fetch_lyric', async ({ songId, source }) => {
    if (source === 'local' || String(songId || '').includes(':\\') || String(songId || '').startsWith('/')) {
      return loadLocalLrc(songId);
    }
    return sourceMgr.getLyric(songId, source);
  });

  // ── Favorites ──
  handle('toggle_favorite', async ({ song }) => db.toggleFavorite(song));
  handle('list_favorites', async () => db.listFavorites());
  handle('is_favorite', async ({ songId, source }) => db.isFavorite(songId, source));

  // ── Playlist ──
  handle('create_playlist', async ({ name }) => db.createPlaylist(name));
  handle('add_to_playlist', async ({ playlistId, song }) => {
    db.addSongToPlaylist(playlistId, song);
  });
  handle('remove_from_playlist', async ({ playlistId, playlistSongId }) => {
    db.removeSongFromPlaylist(playlistId, playlistSongId);
  });
  handle('list_playlists', async () => db.listPlaylists());
  handle('get_playlist_songs', async ({ playlistId }) => db.getPlaylistSongs(playlistId));
  handle('reorder_playlist_songs', async ({ playlistId, songIds }) => {
    db.reorderPlaylistSongs(playlistId, songIds);
  });
  handle('delete_playlist', async ({ playlistId }) => {
    db.deletePlaylist(playlistId);
  });
  handle('export_playlist', async ({ playlistId, format }) => {
    if (format === 'json') {
      return JSON.stringify(db.getPlaylistSongs(playlistId), null, 2);
    }
    return db.exportToM3u(playlistId);
  });
  handle('import_playlist', async ({ filePath }) => {
    const text = fs.readFileSync(filePath, 'utf8');
    const name = path.basename(filePath, path.extname(filePath)) || '导入歌单';
    const id = db.createPlaylist(name);
    // minimal m3u parse
    const lines = text.split(/\r?\n/);
    let pending = null;
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const body = line.slice(8);
        const comma = body.indexOf(',');
        const meta = comma >= 0 ? body.slice(comma + 1) : body;
        const [artist, title] = meta.includes(' - ')
          ? meta.split(' - ').map((s) => s.trim())
          : ['未知', meta.trim()];
        pending = { name: title || meta, artist: artist || '未知' };
      } else if (line.startsWith('#SONG_ID:') && pending) {
        pending.songId = line.slice(9).trim();
      } else if (line.startsWith('#SOURCE:') && pending) {
        pending.source = line.slice(8).trim();
      } else if (pending && line && !line.startsWith('#')) {
        db.addSongToPlaylist(id, {
          songId: pending.songId || line,
          source: pending.source || 'import',
          name: pending.name,
          artist: pending.artist,
          album: '',
          duration: 0,
          coverUrl: null,
        });
        pending = null;
      }
    }
    return id;
  });

  // ── Settings ──
  handle('set_theme', async ({ theme }) => {
    const current = db.loadSetting('app_settings') || defaultSettings();
    current.appearance = current.appearance || {};
    current.appearance.theme = theme;
    db.saveSetting('app_settings', current);
  });

  handle('load_settings', async () => {
    const saved = db.loadSetting('app_settings');
    if (!saved) return defaultSettings();
    // Deep-merge so partial/older saves keep new defaults
    const base = defaultSettings();
    return {
      player: { ...base.player, ...(saved.player || {}) },
      appearance: {
        ...base.appearance,
        ...(saved.appearance || {}),
        theme: { ...base.appearance.theme, ...(saved.appearance?.theme || {}) },
      },
      sources: { ...base.sources, ...(saved.sources || {}) },
    };
  });

  handle('save_settings', async ({ settings }) => {
    const base = defaultSettings();
    const prev = db.loadSetting('app_settings') || {};
    const merged = {
      player: { ...base.player, ...(prev.player || {}), ...(settings?.player || {}) },
      appearance: {
        ...base.appearance,
        ...(prev.appearance || {}),
        ...(settings?.appearance || {}),
        theme: {
          ...base.appearance.theme,
          ...(prev.appearance?.theme || {}),
          ...(settings?.appearance?.theme || {}),
        },
      },
      sources: { ...base.sources, ...(prev.sources || {}), ...(settings?.sources || {}) },
    };
    db.saveSetting('app_settings', merged);
    return merged;
  });

  // ── Download ──
  handle('download_song', async ({ song, quality }) => {
    const win = getMainWindow();
    const taskId = `${song.source}:${song.songId}`;
    const url = await sourceMgr.getMusicUrl(song.songId, quality, song.source, {
      name: song.name,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      coverUrl: song.coverUrl,
      hash: song.hash,
    });
    const ext = String(quality).includes('flac') ? 'flac' : 'mp3';
    const filename = `${song.name} - ${song.artist}.${ext}`;

    const filePath = await download.downloadToFile(url, filename, (progress_pct) => {
      win?.webContents.send('download-progress', {
        filename,
        progress_pct,
        task_id: taskId,
      });
    });

    win?.webContents.send('download-complete', { filename, task_id: taskId, path: filePath });
    return filePath;
  });

  handle('get_download_dir', async () => download.getDownloadDir());
  handle('set_download_dir', async ({ dir }) => {
    download.setDownloadDir(dir);
  });

  // ── Local music ──
  handle('scan_local_music', async () => {
    let dirs = db.getLocalMusicDirs();
    if (!dirs.length) {
      const music = require('electron').app.getPath('music');
      if (music && fs.existsSync(music)) dirs = [music];
    }
    if (!dirs.length) {
      throw new Error('No music directories configured and default music folder not found');
    }
    return scanDirs(dirs);
  });

  handle('add_local_music_dir', async ({ dirPath }) => {
    const trimmed = String(dirPath || '').trim();
    if (!trimmed) throw new Error('本地音乐目录不能为空');
    if (!fs.existsSync(trimmed)) throw new Error(`本地音乐目录不存在: ${trimmed}`);
    if (!fs.statSync(trimmed).isDirectory()) throw new Error(`本地音乐路径不是目录: ${trimmed}`);
    db.addLocalMusicDir(trimmed);
  });

  handle('remove_local_music_dir', async ({ dirPath }) => {
    db.removeLocalMusicDir(dirPath);
  });

  handle('list_local_music_dirs', async () => db.getLocalMusicDirs());

  // ── Timer ──
  handle('start_sleep_timer', async ({ minutes }) => {
    sleepTimer.start(minutes, () => {
      getMainWindow()?.webContents.send('sleep-timer-fired');
    });
  });
  handle('cancel_sleep_timer', async () => {
    sleepTimer.cancel();
  });
  handle('get_sleep_timer_status', async () => sleepTimer.status());

  // Dialog helper
  handle('select_directory', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
}

module.exports = { createAppState, registerHandlers, defaultSettings };
