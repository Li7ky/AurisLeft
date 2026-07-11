const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, shell, dialog } = require('electron');
const { Database } = require('./db.cjs');
const { SourceManager } = require('./sources.cjs');
const { scanDirs, loadLocalLrc } = require('./localMusic.cjs');
const download = require('./download.cjs');
const { SleepTimer } = require('./timer.cjs');
const logger = require('./logger.cjs');
const nkiQq = require('./nkiQq.cjs');
const catalogSearch = require('./catalogSearch.cjs');
const { getLogsDir, getBackupsDir } = require('./appPaths.cjs');

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
  onboarding: {
    seen: false,
  },
});

function createAppState() {
  const db = new Database();
  const sourceMgr = new SourceManager();
  const sleepTimer = new SleepTimer();
  // 已改用西瓜糖 QQ 解析，不再启动时预热洛雪脚本（加快开机）
  // 若以后要恢复洛雪：void sourceMgr.ensureLxBuiltin()
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
        // 切歌取消是正常路径，不要当 IPC Error 刷屏 / 吓前端
        if (err?.code === 'PLAY_SWITCHED' || /播放已切换/i.test(message)) {
          return { cancelled: true, code: 'PLAY_SWITCHED' };
        }
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
  // 列表只走 QQ 官方搜索（一次请求自带封面/时长/专辑，约 0.5s）
  // 播放取链仍走西瓜糖；不再为列表打 nki 详情 / 多平台，避免慢和空封面
  handle('search_music', async ({ keyword, page }) => {
    const kw = String(keyword || '').trim();
    const pg = page || 1;
    if (!kw) {
      return { songs: [], total: 0, page: pg, perPage: 30, hasMore: false };
    }

    let songs = [];
    let total = 0;
    let pageLen = 0;

    try {
      const qq = await catalogSearch.searchQQ(kw, pg);
      pageLen = (qq.songs || []).length;
      total = Number(qq.total || pageLen) || pageLen;
      songs = (qq.songs || []).map((song) => {
        // 有西瓜糖时 VIP 也能解析，文案上不吓人
        if (nkiQq.isEnabled() && song.playableHint === 'maybe_vip') {
          return { ...song, playableHint: 'ok', feeNote: song.fee };
        }
        return song;
      });
    } catch (e) {
      console.warn('[search] QQ official failed', e.message || e);
      // 兜底：西瓜糖列表 + 官方补全（稍慢，但能出结果）
      if (nkiQq.isEnabled()) {
        try {
          songs = await nkiQq.searchSongs(kw, 30);
          total = songs.length;
          pageLen = songs.length;
        } catch (e2) {
          console.warn('[search] nki fallback failed', e2.message || e2);
        }
      }
    }

    // 仍缺封面/时长的条目，用 mid 批量补一次（官方搜索一般已齐，这里只扫漏网）
    const needMeta = songs.filter((s) => s.strMediaMid && (!s.coverUrl || !s.duration || !s.album));
    if (needMeta.length) {
      try {
        await nkiQq.enrichWithQqOfficial(needMeta);
      } catch {
        /* ignore */
      }
    }

    const filtered = filterSearchRelevance(songs, kw);
    const hasMore = pageLen >= 25 || pg * 30 < total;

    // 后台预热前几首取链缓存 → 点播放几乎秒开
    try {
      // 列表一出并行预热前 15 首 → 点播放尽量秒开
      nkiQq.prefetchSongs(filtered, 15);
    } catch {
      /* ignore */
    }

    return {
      songs: filtered,
      total: total || filtered.length,
      page: pg,
      perPage: 30,
      hasMore,
    };
  });

  // 播放世代：连点切歌时丢弃旧请求结果
  let playSongGen = 0;

  function wrapPlayUrl(url) {
    if (/^https?:\/\//i.test(url)) {
      const encoded = Buffer.from(url, 'utf8').toString('base64url');
      return `aurisstream://u/${encoded}`;
    }
    return url;
  }

  function playResultFromCache(song, quality, gen, cached) {
    try {
      db.addRecentPlay(song);
    } catch {
      /* ignore */
    }
    const meta = cached.meta || {};
    console.log('[play_song] CACHE', song?.name, 'gen=', gen);
    return {
      url: wrapPlayUrl(cached.url),
      duration: meta.duration || song.duration || 0,
      coverUrl: meta.coverUrl || song.coverUrl || null,
      album: meta.album || song.album || '',
      rawUrl: cached.url,
      gen,
      fromCache: true,
    };
  }

  // 悬停 / 队列预热：把链接放进缓存，点播秒开
  handle('warm_song', async ({ song, quality }) => {
    if (!song) return { ok: false };
    try {
      await nkiQq.warmSong(song, quality || '320k');
      return { ok: true, cached: nkiQq.hasPlayCache(song, quality || '320k') };
    } catch {
      return { ok: false };
    }
  });

  handle('warm_songs', async ({ songs, quality }) => {
    const list = Array.isArray(songs) ? songs : [];
    nkiQq.prefetchSongs(list, Math.min(12, list.length || 0));
    return { ok: true, count: list.length };
  });

  // ── Player: resolve URL, renderer plays via HTMLAudio ──
  handle('play_song', async ({ song, quality }) => {
    const gen = ++playSongGen;
    const q = quality || '320k';
    console.log('[play_song] start gen=', gen, song?.name || '');

    const switched = () => {
      const err = new Error('播放已切换');
      err.code = 'PLAY_SWITCHED';
      return err;
    };

    if (gen !== playSongGen) throw switched();

    // ⚡ 秒开快路径：缓存命中直接返回（不再走 getMusicUrl / 西瓜糖）
    try {
      const cached = nkiQq.getCachedPlay(song, q);
      if (cached?.url) {
        // 取消进行中的旧解析，但不阻塞
        try {
          nkiQq.beginPlaySession();
        } catch {
          /* ignore */
        }
        return playResultFromCache(song, q, gen, cached);
      }
    } catch {
      /* fall through */
    }

    // 有西瓜糖 QQ 时不必死等洛雪
    if (!nkiQq.isEnabled()) {
      const lx = await sourceMgr.waitLxReady(15000);
      console.log(
        `[play_song] LX init ready=${lx.ready} count=${lx.count} finished=${lx.finished} waited=${lx.waitedMs}ms`
      );
    }

    if (gen !== playSongGen) throw switched();

    // 从 songId 抽出 QQ songmid，保证取链用对 id
    const songmidFromId =
      String(song.source || song.platform || '') === 'tx' ||
      String(song.songId || '').startsWith('tx')
        ? String(song.songId || '').replace(/^tx[:/]/i, '')
        : '';

    let url;
    try {
      url = await sourceMgr.getMusicUrl(song.songId, q, song.source, {
        name: song.name,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        coverUrl: song.coverUrl,
        hash: song.hash,
        strMediaMid: song.strMediaMid,
        source: song.source,
        platform: song.platform,
        fee: song.fee,
        playableHint: song.playableHint,
        songmid: song.songmid || songmidFromId || undefined,
      });
    } catch (e) {
      if (gen !== playSongGen || e?.code === 'PLAY_SWITCHED' || /播放已切换/i.test(e?.message || '')) {
        throw switched();
      }
      throw e;
    }

    // 切走了：丢掉结果，绝不能把旧链交给新歌
    if (gen !== playSongGen) throw switched();

    if (
      !url ||
      (!/^https?:\/\//i.test(url) &&
        !url.startsWith('file:') &&
        !url.startsWith('aurislocal:') &&
        !url.startsWith('aurisstream:'))
    ) {
      throw new Error('取链结果无效');
    }
    const playUrl = wrapPlayUrl(url);
    try {
      db.addRecentPlay(song);
    } catch {
      /* ignore */
    }
    let duration = song.duration || 0;
    let coverUrl = song.coverUrl || null;
    let album = song.album || '';
    try {
      const cached = nkiQq.getCachedPlay(song, q);
      if (cached?.meta) {
        if (cached.meta.duration) duration = cached.meta.duration;
        if (cached.meta.coverUrl) coverUrl = cached.meta.coverUrl;
        if (cached.meta.album) album = cached.meta.album;
      }
    } catch {
      /* ignore */
    }

    console.log('[play_song]', song.name, 'gen=', gen, '->', url.slice(0, 120));
    return {
      url: playUrl,
      duration,
      coverUrl,
      album,
      rawUrl: url,
      gen,
      fromCache: false,
    };
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
      onboarding: { ...base.onboarding, ...(saved.onboarding || {}) },
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
      onboarding: {
        ...base.onboarding,
        ...(prev.onboarding || {}),
        ...(settings?.onboarding || {}),
      },
    };
    db.saveSetting('app_settings', merged);
    return merged;
  });

  handle('mark_onboarding_seen', async () => {
    const base = defaultSettings();
    const prev = db.loadSetting('app_settings') || {};
    const merged = {
      ...base,
      ...prev,
      player: { ...base.player, ...(prev.player || {}) },
      appearance: {
        ...base.appearance,
        ...(prev.appearance || {}),
        theme: { ...base.appearance.theme, ...(prev.appearance?.theme || {}) },
      },
      sources: { ...base.sources, ...(prev.sources || {}) },
      onboarding: { seen: true },
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
      strMediaMid: song.strMediaMid || song.songmid,
      source: song.source,
      platform: song.platform,
      fee: song.fee,
      playableHint: song.playableHint,
    });
    // QQ 常返回 m4a；flac 音质才用 flac 扩展名
    let ext = 'mp3';
    if (String(quality).includes('flac') || /\.flac(\?|$)/i.test(url)) ext = 'flac';
    else if (/\.m4a(\?|$)/i.test(url)) ext = 'm4a';
    const safeName = `${song.name} - ${song.artist}`.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${safeName}.${ext}`;

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
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  // ── Backup / restore ──
  handle('export_backup', async () => {
    const backup = db.exportBackup();
    const defaultName = `aurisleft-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: '导出数据备份',
      defaultPath: path.join(getBackupsDir(), defaultName),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2), 'utf8');
    // Also keep a copy under userData/backups
    try {
      const autoPath = path.join(getBackupsDir(), defaultName);
      if (path.resolve(autoPath) !== path.resolve(result.filePath)) {
        fs.writeFileSync(autoPath, JSON.stringify(backup, null, 2), 'utf8');
      }
    } catch {
      /* ignore */
    }
    return { canceled: false, path: result.filePath };
  });

  handle('import_backup', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '导入数据备份',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const raw = fs.readFileSync(result.filePaths[0], 'utf8');
    const payload = JSON.parse(raw);
    const info = db.importBackup(payload);
    // Reload user sources after restore
    try {
      await sourceMgr.loadFromFile();
    } catch {
      /* ignore */
    }
    return { canceled: false, ...info, path: result.filePaths[0] };
  });

  // ── Logs / diagnostics ──
  handle('get_log_dir', async () => logger.getLogDir() || getLogsDir());
  handle('open_log_dir', async () => {
    const dir = logger.getLogDir() || getLogsDir();
    await shell.openPath(dir);
    return dir;
  });
  handle('get_app_version', async () => app.getVersion());

  // ── 西瓜糖 QQ 解析 ──
  handle('get_nki_qq_status', async () => nkiQq.getStatus());
  handle('set_nki_qq_key', async ({ apiKey }) => nkiQq.setApiKey(apiKey));
  handle('set_nki_qq_enabled', async ({ enabled }) => nkiQq.setEnabled(enabled));

  // ── Update check (GitHub Releases, no auto-download) ──
  handle('check_for_updates', async () => {
    const current = app.getVersion();
    const repo = 'Li7ky/AurisLeft';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        signal: ctrl.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `AurisLeft/${current}`,
        },
      });
      clearTimeout(timer);
      if (res.status === 404) {
        return {
          current,
          latest: current,
          hasUpdate: false,
          message: '尚未发布正式版本，或仓库无 Releases',
          url: `https://github.com/${repo}/releases`,
        };
      }
      if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
      const data = await res.json();
      const tag = String(data.tag_name || data.name || '').replace(/^v/i, '');
      const hasUpdate = Boolean(tag && compareSemver(tag, current) > 0);
      return {
        current,
        latest: tag || current,
        hasUpdate,
        name: data.name || tag,
        notes: String(data.body || '').slice(0, 2000),
        url: data.html_url || `https://github.com/${repo}/releases`,
        publishedAt: data.published_at || null,
      };
    } catch (e) {
      return {
        current,
        latest: current,
        hasUpdate: false,
        error: e instanceof Error ? e.message : String(e),
        message: '检查更新失败，请稍后重试或手动打开 Releases 页面',
        url: `https://github.com/${repo}/releases`,
      };
    }
  });

  handle('open_external', async ({ url }) => {
    if (!url || !/^https?:\/\//i.test(url)) throw new Error('无效链接');
    await shell.openExternal(url);
  });
}

/** 搜索相关性：过滤无意义乱码结果，保留有匹配的条目 */
function filterSearchRelevance(songs, keyword) {
  const list = Array.isArray(songs) ? songs : [];
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw || !list.length) return list;

  const tokens = kw.split(/\s+/).filter(Boolean);
  const compact = kw.replace(/\s+/g, '');
  const looksGarbage =
    /^[a-z0-9_\-]{10,}$/i.test(compact) && !/[\u4e00-\u9fff]/.test(kw);

  const matched = [];
  const rest = [];
  for (const s of list) {
    const blob = `${s.name || ''} ${s.artist || ''} ${s.album || ''}`.toLowerCase();
    const hit = tokens.some((t) => t.length >= 1 && blob.includes(t));
    if (hit) matched.push(s);
    else rest.push(s);
  }

  // 纯乱码关键词：没有命中就返回空
  if (looksGarbage) return matched;

  // 正常中文/歌名：有命中优先；命中太少时仍带一点其余（公开库模糊）
  if (matched.length >= 8) return matched;
  if (matched.length > 0) return [...matched, ...rest.slice(0, 12)];
  return list.slice(0, 40);
}

/** Simple semver compare: a>b → 1, a<b → -1, equal → 0 */
function compareSemver(a, b) {
  const pa = String(a)
    .replace(/-.*$/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b)
    .replace(/-.*$/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

module.exports = { createAppState, registerHandlers, defaultSettings };
