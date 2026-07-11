const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSourcesPath, getLxPrefsPath } = require('./appPaths.cjs');
const { LxSourceEngine } = require('./lxRuntime.cjs');
const catalogSearch = require('./catalogSearch.cjs');
const nativePlay = require('./nativePlay.cjs');
const nkiQq = require('./nkiQq.cjs');

/**
 * 来自 https://github.com/pdone/lx-music-source 的内置洛雪兼容脚本
 * 野花（flower）优先。
 */
// juhe 远端常初始化失败，不参与内置加载（用户仍可自行导入）
const BUILTIN_LX_FILES = [
  'flower.js',
  'huibq.js',
  'ikun.js',
  'grass.js',
  'lx.js',
  'sixyin.js',
];

const LX_REMOTE_SOURCES = [
  { id: 'flower', path: 'flower/latest.js' },
  { id: 'huibq', path: 'huibq/latest.js' },
  { id: 'ikun', path: 'ikun/latest.js' },
  // juhe 远端经常 init 失败，不自动拉取
  { id: 'grass', path: 'grass/latest.js' },
  { id: 'lx', path: 'lx/latest.js' },
  { id: 'sixyin', path: 'sixyin/latest.js' },
];

/**
 * 脚本下载镜像（来自 pdone/lx-music-source README）
 * 原始: raw.githubusercontent.com/...
 * 加速: ghproxy.net/raw.githubusercontent.com/...
 * 其它加速站：把 ghproxy.net/ 换成 gh.llkk.cc / github.moeyy.xyz 等
 */
const LX_CDN_PREFIXES = [
  // 官方推荐加速（ghproxy）
  'https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://ghproxy.net/https://raw.githubusercontent.com/pdone/lx-music-source/main/',
  // README「其他加速站点」
  'https://gh.llkk.cc/raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://gh.llkk.cc/https://raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://github.moeyy.xyz/raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://github.moeyy.xyz/https://raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://ghproxy.cn/raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://ghproxy.cn/https://raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://gh.api.99988866.xyz/raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://gh.api.99988866.xyz/https://raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://ghp.ci/raw.githubusercontent.com/pdone/lx-music-source/main/',
  'https://ghp.ci/https://raw.githubusercontent.com/pdone/lx-music-source/main/',
  // jsDelivr / 原始 GitHub
  'https://cdn.jsdelivr.net/gh/pdone/lx-music-source@main/',
  'https://fastly.jsdelivr.net/gh/pdone/lx-music-source@main/',
  'https://raw.githubusercontent.com/pdone/lx-music-source/main/',
];

/**
 * Source manager for Electron.
 * - 曲库搜索：内部使用网易云公开接口（不再作为可管理音源）
 * - 播放取链：内置洛雪脚本 + 用户导入 JSON/JS（可单独开关）
 */
class SourceManager {
  constructor() {
    /** @type {Map<string, any>} */
    this.sources = new Map();
    this.loaded = false;
    /** @type {LxSourceEngine} */
    this.lxEngine = new LxSourceEngine();
    /** @type {Promise<any> | null} */
    this.lxReady = null;
    this.lxInitFinished = false;
    this.lxInitError = null;
    /** @type {Record<string, boolean>} */
    this.lxPrefs = this.loadLxPrefs();
  }

  lxAssetsDir() {
    return path.join(__dirname, '..', 'assets', 'lx-sources');
  }

  loadLxPrefs() {
    try {
      const p = getLxPrefsPath();
      if (!fs.existsSync(p)) return {};
      const raw = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data.enabled || data : {};
    } catch {
      return {};
    }
  }

  saveLxPrefs() {
    const enabled = {};
    for (const h of this.lxEngine.hosts) {
      enabled[h.id] = h.enabled !== false;
    }
    // 也按脚本 key 存一份，方便重载后匹配
    for (const h of this.lxEngine.hosts) {
      const key = h.id.replace(/^builtin-lx-/, '');
      enabled[`builtin-lx-${key}`] = h.enabled !== false;
    }
    this.lxPrefs = enabled;
    try {
      fs.writeFileSync(
        getLxPrefsPath(),
        JSON.stringify({ enabled, updatedAt: Date.now() }, null, 2),
        'utf8'
      );
    } catch (e) {
      console.warn('[sources] save lx prefs failed', e.message || e);
    }
  }

  isLxEnabled(id) {
    if (Object.prototype.hasOwnProperty.call(this.lxPrefs, id)) {
      return this.lxPrefs[id] !== false;
    }
    return true; // 默认开启
  }

  /**
   * 加载并完整初始化内置 LX 脚本（只跑一轮；播放前必须 await）
   */
  async ensureLxBuiltin() {
    if (this.lxReady) return this.lxReady;
    this.lxReady = (async () => {
      console.log('[sources] 开始初始化洛雪兼容音源…');
      this.lxPrefs = this.loadLxPrefs();
      const dir = this.lxAssetsDir();
      fs.mkdirSync(dir, { recursive: true });

      for (const file of BUILTIN_LX_FILES) {
        const full = path.join(dir, file);
        try {
          if (!fs.existsSync(full)) {
            console.warn('[sources] missing builtin lx script', full);
            continue;
          }
          const code = fs.readFileSync(full, 'utf8');
          if (!code || code.length < 100) {
            console.warn('[sources] skip empty lx script', file);
            continue;
          }
          const id = `builtin-lx-${path.basename(file, '.js')}`;
          console.log(`[sources] 初始化 ${file} …`);
          await this.lxEngine.loadScript(code, {
            id,
            hidden: false,
            enabled: this.isLxEnabled(id),
          });
        } catch (e) {
          console.warn('[sources] load/init lx failed', file, e.message || e);
        }
      }

      const hosts = this.lxEngine.listHosts({ includeHidden: true, onlyReady: true });
      this.lxInitFinished = true;
      this.saveLxPrefs();
      console.log(
        `[sources] 音源初始化完成: ${hosts.length} 套就绪 — ${hosts
          .map((h) => `${h.name}${h.enabled === false ? '(关)' : ''}`)
          .join(', ') || 'none'}`
      );

      this.refreshLxScriptsFromRemote().catch((e) =>
        console.warn('[sources] lx remote refresh skip', e.message || e)
      );

      return hosts;
    })().catch((e) => {
      this.lxInitFinished = true;
      this.lxInitError = e instanceof Error ? e.message : String(e);
      console.warn('[sources] LX init pipeline failed', this.lxInitError);
      return [];
    });
    return this.lxReady;
  }

  /**
   * 播放前调用：等到初始化结束（或超时）
   */
  async waitLxReady(timeoutMs = 25000) {
    const start = Date.now();
    const p = this.ensureLxBuiltin();
    await Promise.race([
      p,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    const ready = this.lxEngine.readyCount();
    return {
      ready: ready > 0,
      count: ready,
      finished: this.lxInitFinished,
      waitedMs: Date.now() - start,
      error: this.lxInitError,
    };
  }

  async refreshLxScriptsFromRemote() {
    let updated = 0;
    for (const item of LX_REMOTE_SOURCES) {
      let code = null;
      for (const prefix of LX_CDN_PREFIXES) {
        try {
          code = await httpGet(prefix + item.path, 15000);
          // 混淆脚本不一定含明文 EVENT_NAMES
          if (code && code.length > 200) break;
          code = null;
        } catch {
          code = null;
        }
      }
      if (!code) continue;
      try {
        const id = `builtin-lx-${item.id}`;
        await this.lxEngine.loadScript(code, {
          id,
          hidden: false,
          enabled: this.isLxEnabled(id),
        });
        try {
          fs.writeFileSync(path.join(this.lxAssetsDir(), `${item.id}.js`), code, 'utf8');
        } catch {
          /* ignore */
        }
        updated += 1;
      } catch (e) {
        console.warn('[sources] remote load', item.id, e.message || e);
      }
    }
    if (updated) {
      console.log(`[sources] refreshed ${updated} LX script(s) from remote`);
      this.saveLxPrefs();
    }
    return updated > 0;
  }

  /** 用户导入的 JSON/JS 音源（不含已删除的内置网易云） */
  listSources({ includeHidden = false } = {}) {
    return Array.from(this.sources.values())
      .map((s) => s.info)
      .filter((info) => includeHidden || !info.hidden);
  }

  /** 内置洛雪音源状态 + 开关 */
  async getLxStatus() {
    if (!this.lxReady) void this.ensureLxBuiltin();
    const hosts = this.lxEngine.hosts.map((h) => ({
      id: h.id,
      name: h.header.name,
      version: h.header.version,
      ready: Boolean(h.ready),
      enabled: h.enabled !== false,
      platforms: Object.keys(h.sources || {}),
      hidden: Boolean(h.hidden),
    }));
    const enabledReady = hosts.filter((h) => h.ready && h.enabled).length;
    return {
      enabled: enabledReady > 0,
      count: enabledReady,
      total: hosts.length,
      ready: hosts.some((h) => h.ready) && this.lxInitFinished,
      initializing: Boolean(this.lxReady) && !this.lxInitFinished,
      names: hosts.filter((h) => h.ready && h.enabled).map((h) => h.name),
      hosts,
    };
  }

  /** 开关某个洛雪内置音源 */
  toggleLxSource(sourceId) {
    const info = this.lxEngine.toggleEnabled(sourceId);
    if (!info) throw new Error(`音源不存在: ${sourceId}`);
    this.saveLxPrefs();
    return info;
  }

  setLxSourceEnabled(sourceId, enabled) {
    const info = this.lxEngine.setEnabled(sourceId, enabled);
    if (!info) throw new Error(`音源不存在: ${sourceId}`);
    this.saveLxPrefs();
    return info;
  }

  registerJsonSource(name, apiBase, endpoints = {}) {
    const id = crypto.randomUUID();
    const info = {
      id,
      name,
      version: '1.0.0',
      type: 'json',
      enabled: true,
      supportedQualities: ['128k', '320k', 'flac'],
      failCount: 0,
    };
    this.sources.set(id, {
      kind: 'json',
      info,
      apiBase: String(apiBase || '').replace(/\/$/, ''),
      endpoints: endpoints || {},
    });
    return info;
  }

  registerJsSource(code, nameHint = 'JS Source') {
    const header = parseScriptHeader(code);
    const id = crypto.randomUUID();
    const info = {
      id,
      name: header.name || nameHint,
      version: header.version || '0',
      type: 'js',
      enabled: true,
      supportedQualities: ['128k', '320k', 'flac'],
      failCount: 0,
    };
    this.sources.set(id, {
      kind: 'js',
      info,
      code,
    });
    return info;
  }

  removeSource(sourceId) {
    // 洛雪内置源不允许删除，只能开关
    if (String(sourceId).startsWith('builtin-lx-')) {
      throw new Error('内置洛雪音源不可删除，可在设置中关闭');
    }
    if (!this.sources.delete(sourceId)) throw new Error(`Source not found: ${sourceId}`);
  }

  toggleSource(sourceId) {
    // 洛雪内置
    if (String(sourceId).startsWith('builtin-lx-') || this.lxEngine.hosts.some((h) => h.id === sourceId)) {
      return this.toggleLxSource(sourceId);
    }
    const src = this.sources.get(sourceId);
    if (!src) throw new Error(`Source not found: ${sourceId}`);
    src.info.enabled = !src.info.enabled;
    return src.info;
  }

  buildUrl(src, endpoint, params = {}) {
    const pathPart = src.endpoints[endpoint] || endpoint;
    const base = `${src.apiBase}/${String(pathPart).replace(/^\//, '')}`;
    const qs = new URLSearchParams(params).toString();
    return qs ? `${base}?${qs}` : base;
  }

  async search(keyword, page = 1, sourceId) {
    // 多平台曲库
    if (!sourceId || sourceId === 'catalog' || sourceId === 'all') {
      const batches = await catalogSearch.searchAllPlatforms(keyword, page, 8000);
      const songs = batches.flatMap((b) => b.result.songs || []);
      return {
        songs,
        total: songs.length,
        page,
        perPage: 30,
      };
    }
    if (['wy', 'kw', 'kg', 'tx', 'mg'].includes(sourceId)) {
      const fn = catalogSearch.SEARCHERS[sourceId];
      if (!fn) return { songs: [], total: 0, page, perPage: 30 };
      return fn(keyword, page);
    }

    const src = this.sources.get(sourceId);
    if (!src) throw new Error(`Source not found: ${sourceId}`);
    if (!src.info.enabled) {
      return { songs: [], total: 0, page, perPage: 30 };
    }

    if (src.kind === 'json') {
      const url = this.buildUrl(src, 'search', { keyword, page: String(page) });
      const body = await httpGet(url);
      const data = JSON.parse(body);
      return normalizeSearchResult(data, page, sourceId);
    }

    return catalogSearch.searchNetease(keyword, page);
  }

  /**
   * 洛雪式：并行搜 网易/酷我/酷狗/QQ，结果按平台分组返回
   */
  async searchAll(keyword, page = 1, timeoutMs = 8000) {
    const batches = await catalogSearch.searchAllPlatforms(
      keyword,
      page,
      timeoutMs,
      ['wy', 'kw', 'kg', 'tx']
    );

    // 用户 JSON 搜索源
    for (const src of this.sources.values()) {
      if (!src.info.enabled || src.kind !== 'json') continue;
      const id = src.info.id;
      try {
        const result = await Promise.race([
          this.search(keyword, page, id),
          sleepReject(timeoutMs, `source ${id} timeout`),
        ]);
        batches.push({ id, result });
      } catch (e) {
        console.warn(`[search] ${id} failed:`, e.message || e);
      }
    }

    return batches;
  }

  /**
   * 取播放地址
   * 策略：
   *  1) 西瓜糖 QQ 解析（mid / 歌名搜索，对付费曲很强）
   *  2) 酷我原生 antiserver
   *  3) 原平台原生 + LX
   *  4) 换源酷我/酷狗
   *  5) 网易公开 API
   */
  async getMusicUrl(songId, quality, sourceId, songMeta = {}) {
    const src = this.sources.get(sourceId);
    // flac 在 VIP 曲上更容易被脚本报「数字专辑」→ 默认先 320k
    let qPreferred = quality || '320k';
    if (/flac|hires|sq/i.test(String(qPreferred))) {
      const maybeVipEarly =
        songMeta.playableHint === 'maybe_vip' ||
        songMeta.fee === 1 ||
        songMeta.fee === 4 ||
        songMeta.fee === 8;
      if (maybeVipEarly) {
        console.log('[play] VIP+高音质 → 先降到 320k 提高命中');
        qPreferred = '320k';
      }
    }

    if (src?.kind === 'json') {
      const qualities = qualityLadder(qPreferred);
      let lastErr = null;
      for (const q of qualities) {
        try {
          const url = this.buildUrl(src, 'music_url', {
            song_id: songId,
            quality: String(q),
          });
          const body = await httpGet(url);
          const data = JSON.parse(body);
          if (data.url) return String(data.url);
          lastErr = new Error('音源未返回播放地址');
        } catch (e) {
          lastErr = e;
        }
      }
      throw new Error(friendlyPlayError(lastErr?.message || '用户音源取链失败'));
    }

    if (src?.kind === 'js' && src.code) {
      try {
        await this.lxEngine.loadScript(src.code, {
          id: src.info.id,
          hidden: true,
        });
      } catch {
        /* ignore */
      }
    }

    const primary = detectLxPlatform(songId, sourceId || songMeta.platform || songMeta.source);
    const maybeVip =
      songMeta.playableHint === 'maybe_vip' ||
      songMeta.fee === 1 ||
      songMeta.fee === 4 ||
      songMeta.fee === 8;
    const trackKey = `${primary}:${songId}:${songMeta.name || ''}`;
    const errors = [];
    // 默认不拉洛雪：设置页已去掉洛雪，优先 QQ。仅 QQ/酷我都失败时才懒加载 LX。
    let wait = { ready: this.lxEngine.readyCount() > 0, count: this.lxEngine.readyCount(), finished: true, waitedMs: 0 };
    let lxWaitPromise = null;
    const ensureLx = async (timeoutMs = 12000) => {
      if (wait.ready && this.lxEngine.readyCount() > 0) return wait;
      if (!lxWaitPromise) {
        lxWaitPromise = this.waitLxReady(timeoutMs).then((w) => {
          wait = w;
          return w;
        });
      }
      return lxWaitPromise;
    };

    const accept = async (url, label) => {
      if (!url || isLikelyTrialUrl(url)) return null;
      if (isStaleSharedUrl(url, trackKey)) {
        console.warn(`[play] reject stale shared url from ${label}`);
        return null;
      }
      // QQ / 酷我 CDN 直链实测可播 — 直接放行，省掉一次 Range 探测（能省 0.5–2s）
      const isTrustedCdn =
        /qqmusic\.qq\.com|stream\.qqmusic|kuwo\.cn|music\.126\.net|kugou|myqcloud/i.test(
          String(url)
        );
      if (isTrustedCdn) {
        rememberUrl(url, trackKey);
        console.log(`[play] accept(fast) ${label} -> ${String(url).slice(0, 100)}`);
        return url;
      }
      const probed = await nativePlay.probePlayableUrl(url);
      if (probed) {
        rememberUrl(probed, trackKey);
        console.log(`[play] accept ${label} -> ${String(probed).slice(0, 100)}`);
        return probed;
      }
      if (/^https?:\/\//i.test(url) && !isLikelyTrialUrl(url)) {
        rememberUrl(url, trackKey);
        console.log(`[play] accept(unprobed) ${label} -> ${String(url).slice(0, 100)}`);
        return url;
      }
      return null;
    };

    /** 单平台：原生优先，再 LX（避免先吃到「数字专辑」） */
    const tryPlatform = async (platform, musicInfo, label) => {
      try {
        const nativeUrl = await nativePlay.resolveNative(
          platform,
          musicInfo.songmid || musicInfo.id,
          musicInfo,
          qPreferred
        );
        const ok = await accept(nativeUrl, `native:${label}`);
        if (ok) return ok;
      } catch (e) {
        errors.push(`${label}/native: ${shortErr(e)}`);
      }

      // 仅在需要时懒加载洛雪（正常听歌不会走到这里）
      try {
        await ensureLx(10000);
      } catch {
        /* ignore */
      }
      if (wait.ready || this.lxEngine.readyCount() > 0) {
        try {
          const qTry = maybeVip && /flac|hires/i.test(String(qPreferred)) ? '320k' : qPreferred;
          const lxUrl = await this.lxEngine.resolveMusicUrl(platform, musicInfo, qTry);
          const ok = await accept(lxUrl, `lx:${label}`);
          if (ok) return ok;
          if (lxUrl && isLikelyTrialUrl(lxUrl)) {
            errors.push(`${label}: 疑似试听片段`);
          }
        } catch (e) {
          const msg = shortErr(e);
          if (!/数字专辑|无法获取播放链接|该渠道|soft-fail|暂无可用直链/i.test(msg)) {
            errors.push(`${label}: ${msg}`);
          }
        }
      }
      return null;
    };

    // 0) 西瓜糖 QQ + 酷我并行预热（QQ 常 mid 超时，串行会把连续切歌拖到 10s+）
    const fromId =
      primary === 'tx' || String(songId || '').startsWith('tx')
        ? String(songId || '').replace(/^tx[:/]/i, '')
        : '';
    const songmidBare = String(songMeta.songmid || fromId || '').trim();
    const mediaMidBare = String(songMeta.strMediaMid || '').trim();
    const mids = [];
    for (const m of [songmidBare, mediaMidBare]) {
      const b = String(m || '')
        .replace(/^tx[:/]/i, '')
        .trim();
      if (b.length >= 10 && b.length <= 20 && /^[0-9A-Za-z]+$/.test(b) && !/^\d+$/.test(b)) {
        if (!mids.includes(b)) mids.push(b);
      }
    }

    // 酷我搜索与 QQ 解析同时开；QQ 命中则直接返回（酷我结果丢弃）
    const kwDirectPromise = songMeta.name
      ? catalogSearch
          .searchKuwo([songMeta.name, songMeta.artist].filter(Boolean).join(' '), 1)
          .catch(() => ({ songs: [] }))
      : Promise.resolve({ songs: [] });

    const altPromise = songMeta.name
      ? catalogSearch
          .findAlternatives(songMeta.name, songMeta.artist || '', primary, 12)
          .catch(() => [])
      : Promise.resolve([]);

    try {
      if (nkiQq.isEnabled()) {
        console.log('[play] try nki-qq first…', songMeta.name || songId);
        const nkiRes = await nkiQq.resolvePlayUrl({
          mid: mids[0],
          mids: mids.slice(0, 2),
          name: songMeta.name,
          artist: songMeta.artist,
          quality: qPreferred,
        });
        const nkiUrl =
          typeof nkiRes === 'string' ? nkiRes : nkiRes && nkiRes.url ? nkiRes.url : null;
        const ok = await accept(nkiUrl, 'nki-qq');
        if (ok) {
          console.log('[play] 西瓜糖 QQ 解析成功');
          return ok;
        }
        console.warn('[play] nki-qq 未命中，继续其它通道');
      }
    } catch (e) {
      if (e?.code === 'PLAY_SWITCHED' || /播放已切换/i.test(e?.message || '')) throw e;
      console.warn('[play] nki-qq error', e.message || e);
      errors.push(`nki-qq: ${shortErr(e)}`);
    }

    // 0b) 酷我快路径（搜索已在 QQ 解析期间并行完成）
    try {
      const kwBag = await kwDirectPromise;
      // 优先歌名匹配更紧的结果，避免连切时命中同曲不同现场版/脏链
      const kwSongs = [...(kwBag.songs || [])].sort((a, b) => {
        const score = (s) => {
          const sn = String(s.name || '').toLowerCase();
          const sa = String(s.artist || '').toLowerCase();
          const want = String(songMeta.name || '').toLowerCase();
          const art = String(songMeta.artist || '').toLowerCase();
          let sc = 0;
          if (sn === want) sc += 50;
          else if (want && sn.includes(want)) sc += 25;
          if (art && sa.includes(art.split(/[\/、,&|]/)[0])) sc += 30;
          if (/live|演唱会|伴奏|片段|dj|remix/i.test(sn)) sc -= 20;
          return sc;
        };
        return score(b) - score(a);
      });
      for (const song of kwSongs.slice(0, 3)) {
        const rid = String(song.songId || '').replace(/^kw[:/]/i, '');
        const n = await nativePlay.resolveKuwo(rid, qPreferred);
        const ok = await accept(n, `native:kw-fast:${song.name}`);
        if (ok) {
          console.log('[play] 酷我原生秒切成功', song.name, song.artist);
          return ok;
        }
      }
    } catch (e) {
      errors.push(`酷我快路径: ${shortErr(e)}`);
    }

    // 1) 原平台（一般不再走洛雪）
    const primaryInfo = buildLxMusicInfo(songId, songMeta, primary);
    if (primary === 'kw') {
      try {
        const n = await nativePlay.resolveKuwo(primaryInfo.songmid || songId, qPreferred);
        const ok = await accept(n, 'native:kw-primary');
        if (ok) return ok;
      } catch {
        /* continue */
      }
    }

    if (primary && primary !== 'tx') {
      const hit = await tryPlatform(primary, primaryInfo, primary);
      if (hit) return hit;
    }

    // 1b) QQ 再搜一次
    try {
      if (nkiQq.isEnabled() && songMeta.name) {
        const nkiRetry = await nkiQq.resolveBySearch(
          songMeta.name,
          songMeta.artist || '',
          qPreferred
        );
        const retryUrl =
          typeof nkiRetry === 'string' ? nkiRetry : nkiRetry && nkiRetry.url ? nkiRetry.url : null;
        const ok = await accept(retryUrl, 'nki-qq-retry');
        if (ok) return ok;
      }
    } catch (e) {
      if (e?.code === 'PLAY_SWITCHED' || /播放已切换/i.test(e?.message || '')) throw e;
    }

    // 2) 换源：酷我优先
    let alts = await altPromise;
    if ((maybeVip || alts.length < 2) && songMeta.name) {
      try {
        const more = await catalogSearch.findAlternatives(songMeta.name, '', primary, 10);
        for (const m of more) {
          if (!alts.find((a) => a.songId === m.songId)) alts.push(m);
        }
      } catch {
        /* ignore */
      }
    }

    const platRank = (p) => ({ kw: 0, kg: 1, tx: 2, mg: 3, wy: 4 }[p] ?? 9);
    alts = [...alts].sort(
      (a, b) =>
        platRank(a.platform || detectLxPlatform(a.songId, a.source)) -
        platRank(b.platform || detectLxPlatform(b.songId, b.source))
    );

    console.log(`[play] 换源候选 ${alts.length} 首 primary=${primary} vip=${maybeVip}`);

    for (const alt of alts) {
      const p = alt.platform || detectLxPlatform(alt.songId, alt.source);
      if (p === 'kw') {
        const rid = String(alt.songId || '').replace(/^kw[:/]/i, '');
        try {
          const n = await nativePlay.resolveKuwo(rid, qPreferred);
          const ok = await accept(n, `native:kw-alt:${alt.name}`);
          if (ok) {
            console.log(`[play] 换源原生酷我成功 ${primary} → kw ${alt.name}`);
            return ok;
          }
        } catch {
          /* next */
        }
      }
    }

    for (const alt of alts) {
      const p = alt.platform || detectLxPlatform(alt.songId, alt.source);
      const info = buildLxMusicInfo(
        alt.songId,
        {
          name: alt.name,
          artist: alt.artist,
          album: alt.album,
          duration: alt.duration,
          coverUrl: alt.coverUrl,
          hash: alt.hash,
          strMediaMid: alt.strMediaMid,
          source: alt.source,
        },
        p
      );
      const url = await tryPlatform(p, info, `换源:${p}:${alt.name}`);
      if (url) {
        console.log(`[play] 换源成功 ${primary} → ${p} ${alt.name}`);
        return url;
      }
    }

    // 3) 网易公开 API
    if (primary === 'wy' || extractNeteaseId(songId)) {
      try {
        for (const q of qualityLadder(qPreferred)) {
          const url = await resolveNeteasePlayUrl(songId, q);
          const ok = await accept(url, `netease:${q}`);
          if (ok) return ok;
        }
      } catch (e) {
        errors.push(`网易兜底: ${shortErr(e)}`);
      }
    }

    if (!wait.ready) {
      throw new Error(
        friendlyPlayError(
          '音源仍在初始化或未开启。请稍候几秒，或到设置页确认已打开至少一个播放音源。'
        )
      );
    }

    throw new Error(
      friendlyPlayError(
        '该曲暂时无法播放（可能版权受限）。已自动尝试其它平台，请换一首或稍后再试。'
      )
    );
  }

  async getLyric(songId, sourceId) {
    const src = this.sources.get(sourceId);

    if (src?.kind === 'json') {
      try {
        const url = this.buildUrl(src, 'lyric', { song_id: songId });
        const body = await httpGet(url);
        return JSON.parse(body);
      } catch {
        /* fall through */
      }
    }

    return fetchNeteaseLyric(songId);
  }

  async loadFromFile() {
    const sourcesFile = getSourcesPath();
    if (!fs.existsSync(sourcesFile)) {
      const defaultConfig = {
        sources: [
          {
            name: 'note',
            note: '播放取链使用内置洛雪兼容音源（设置中可开关）。此处可添加额外 JSON/JS 音源。',
            enabled: false,
          },
        ],
      };
      fs.writeFileSync(sourcesFile, JSON.stringify(defaultConfig, null, 2), 'utf8');
    }

    let content = fs.readFileSync(sourcesFile, 'utf8');
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    const config = JSON.parse(content);
    const arr = config.sources;
    if (!Array.isArray(arr)) throw new Error('音源配置缺少 sources 数组');

    this.sources.clear();
    const loaded = [];
    const errors = [];

    for (const item of arr) {
      const name = item.name || 'unnamed';
      const enabled = item.enabled !== false;
      if (!enabled) continue;
      if (item.note && !item.url && !item.api_base && !item.code) continue;
      // 忽略旧配置里的内置网易云条目
      if (item.id === 'builtin-netease' || name.includes('内置音源')) continue;

      try {
        if (item.type === 'json' || item.api_base) {
          const info = this.registerJsonSource(name, item.api_base, item.endpoints || {});
          loaded.push(info);
        } else if (item.url) {
          const code = await httpGet(item.url);
          const info = this.registerJsSource(code, name);
          loaded.push(info);
        } else if (item.code) {
          const info = this.registerJsSource(item.code, name);
          loaded.push(info);
        }
      } catch (e) {
        errors.push(`${name}: ${e.message || e}`);
      }
    }

    this.loaded = true;
    if (errors.length) {
      console.warn('[sources] load warnings:', errors.join('; '));
    }
    return this.listSources();
  }

  saveConfig(content) {
    JSON.parse(content);
    fs.writeFileSync(getSourcesPath(), content, 'utf8');
    this.loaded = false;
  }
}

function parseScriptHeader(code) {
  let name = 'Unknown';
  let version = '0';
  for (const line of String(code).split('\n').slice(0, 20)) {
    const trimmed = line.trim().replace(/^\*/, '').trim();
    if (trimmed.startsWith('@name ')) name = trimmed.slice(6).trim();
    if (trimmed.startsWith('@version ')) version = trimmed.slice(9).trim();
  }
  return { name, version };
}

async function httpGet(url, timeoutMs = 15000, extraHeaders = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Referer: 'https://music.163.com/',
        ...extraHeaders,
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function httpPostForm(url, formObj) {
  const body = new URLSearchParams(formObj).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Referer: 'https://music.163.com/',
    },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractNeteaseId(songId) {
  const s = String(songId || '');
  const m = s.match(/(?:^wy:|^netease:)?(\d+)$/i) || s.match(/(\d{5,})/);
  return m ? m[1] : null;
}

/**
 * 将 songId / sourceId 映射为洛雪平台 key：kw/kg/tx/wy/mg
 */
function detectLxPlatform(songId, sourceId) {
  const sid = String(songId || '');
  const src = String(sourceId || '').toLowerCase();
  const prefix = sid.match(/^(wy|kw|kg|tx|mg|netease|kuwo|kugou|qq|migu)[:/]/i);
  if (prefix) {
    const p = prefix[1].toLowerCase();
    if (p === 'netease' || p === 'wy') return 'wy';
    if (p === 'kuwo' || p === 'kw') return 'kw';
    if (p === 'kugou' || p === 'kg') return 'kg';
    if (p === 'qq' || p === 'tx') return 'tx';
    if (p === 'migu' || p === 'mg') return 'mg';
  }
  if (src.includes('netease') || src.includes('builtin') || src === 'wy') return 'wy';
  if (src.includes('kuwo') || src === 'kw') return 'kw';
  if (src.includes('kugou') || src === 'kg') return 'kg';
  if (src.includes('qq') || src === 'tx') return 'tx';
  if (src.includes('migu') || src === 'mg') return 'mg';
  // 默认：内置搜索来自网易云
  if (extractNeteaseId(sid)) return 'wy';
  return 'wy';
}

/**
 * 构造 LX musicInfo（多数脚本读 songmid / hash）
 * @param {string} songId
 * @param {object} songMeta
 * @param {string} [platform]
 */
function buildLxMusicInfo(songId, songMeta = {}, platform) {
  const sid = String(songId || '');
  const bare =
    sid.replace(/^(wy|kw|kg|tx|mg|netease|kuwo|kugou|qq|migu)[:/]/i, '') || sid;
  const p = platform || detectLxPlatform(songId, songMeta.source);
  // 网易数字 id；其它平台用 bare（QQ mid / 酷狗 hash / 酷我 rid）
  const id = p === 'wy' ? extractNeteaseId(sid) || bare : bare;
  const hash =
    songMeta.hash ||
    (p === 'kg' ? bare : undefined) ||
    songMeta.strMediaMid ||
    undefined;
  return {
    songmid: id,
    songId: id,
    id,
    hash,
    strMediaMid: songMeta.strMediaMid || (p === 'tx' ? id : undefined),
    name: songMeta.name || songMeta.songname || '',
    singer: songMeta.artist || songMeta.singer || '',
    albumName: songMeta.album || songMeta.albumName || '',
    albumId: songMeta.albumId || undefined,
    interval: songMeta.duration
      ? `${Math.floor(songMeta.duration / 60)}:${String(Math.floor(songMeta.duration % 60)).padStart(2, '0')}`
      : undefined,
    img: songMeta.coverUrl || songMeta.img || undefined,
    lrc: undefined,
    otherSource: undefined,
    types: [],
    _types: {},
    typeUrl: {},
  };
}

/** 粗判试听/截断链接（洛雪也会尽量避开） */
function isLikelyTrialUrl(url) {
  if (!url) return true;
  const u = String(url).toLowerCase();
  return (
    u.includes('freeTrial') ||
    u.includes('freetrial') ||
    u.includes('trial') ||
    u.includes('preview') ||
    u.includes('/listen?') ||
    /try[_-]?listen/i.test(u)
  );
}

/** Preferred quality first, then step down for higher hit rate */
function qualityLadder(quality) {
  const q = String(quality || '320k').toLowerCase();
  if (q === 'hires' || q === 'hi-res' || q === 'sq') {
    return ['hires', 'flac', '320k', '128k'];
  }
  if (q === 'flac' || q === 'ape' || q === 'wav') {
    return ['flac', '320k', '128k'];
  }
  if (q === '320k' || q === '320' || q === 'hq') {
    return ['320k', '128k'];
  }
  if (q === '128k' || q === '128' || q === 'lq') {
    return ['128k'];
  }
  return [q, '320k', '128k'].filter((v, i, a) => a.indexOf(v) === i);
}

function shortErr(e) {
  const m = e instanceof Error ? e.message : String(e || '');
  return m.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** User-facing play errors — strip technical noise & 洛雪脚本吓人原文 */
function friendlyPlayError(message) {
  const m = String(message || '').replace(/https?:\/\/\S+/gi, '').trim();
  // 六音/野花等脚本经典文案 → 统一成人话，别吓人
  if (/数字专辑|无法获取播放链接|该渠道|GetMedia|无音源/i.test(m)) {
    return '当前音源拿不到完整播放地址，正在/已尝试其它平台换源。若仍失败请换一首或稍后再试';
  }
  if (/音源仍在初始化|未就绪|initializ/i.test(m)) {
    return '音源仍在初始化，请稍候几秒再点播放';
  }
  if (/没有已开启|未开启|no.*source/i.test(m)) {
    return '没有已开启的播放音源，请到设置页打开至少一个音源';
  }
  if (/timeout|超时|ETIMEDOUT|aborted/i.test(m)) {
    return '取链超时，请检查网络后重试';
  }
  if (/vip|会员|付费|版权|fee|试听|soft-fail|暂无可用直链/i.test(m)) {
    return '该曲可能受版权或会员限制，已尝试换源仍失败，请换一首试试';
  }
  if (/ECONN|ENOTFOUND|network|fetch failed|网络/i.test(m)) {
    return '网络异常，无法获取播放地址';
  }
  // 带多源拼接的长错误 → 收成一句
  if (m.includes('|') || m.includes('；')) {
    return '暂时无法播放（多音源均未取到可用链接），请换一首或稍后再试';
  }
  if (m.length > 120) return `${m.slice(0, 120)}…`;
  return m || '暂时无法播放，请稍后再试';
}

/** 近期 URL 去重：防止某 API 对不同歌曲返回同一条脏链 */
const recentAcceptedUrls = new Map(); // url -> songKey
function rememberUrl(url, songKey) {
  if (!url) return;
  recentAcceptedUrls.set(String(url).split('?')[0], songKey);
  if (recentAcceptedUrls.size > 40) {
    const first = recentAcceptedUrls.keys().next().value;
    recentAcceptedUrls.delete(first);
  }
}
function isStaleSharedUrl(url, songKey) {
  if (!url) return false;
  const key = String(url).split('?')[0];
  const prev = recentAcceptedUrls.get(key);
  return Boolean(prev && prev !== songKey);
}

const NETEASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Referer: 'https://music.163.com/',
  Origin: 'https://music.163.com',
};

/**
 * Probe whether a URL looks like real audio (not HTML/404 page).
 */
async function probeAudioUrl(url) {
  if (!url) return null;
  const normalized = String(url).replace(/^http:/, 'https:');
  try {
    const res = await fetch(normalized, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        ...NETEASE_HEADERS,
        Range: 'bytes=0-2047',
      },
    });
    if (!(res.ok || res.status === 206)) return null;
    const finalUrl = (res.url || normalized).replace(/^http:/, 'https:');
    if (/404|music\.163\.com\/404|#/i.test(finalUrl)) return null;

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4) return null;

    // HTML error page
    const head = buf.slice(0, 64).toString('utf8').toLowerCase();
    if (head.includes('<!doctype') || head.includes('<html') || head.includes('<script')) {
      return null;
    }

    const isId3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33; // ID3
    const isMp3Frame = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
    const isFlac = buf.slice(0, 4).toString('ascii') === 'fLaC';
    const isOgg = buf.slice(0, 4).toString('ascii') === 'OggS';
    const isAudioCt =
      ct.includes('audio') ||
      ct.includes('octet-stream') ||
      ct.includes('mpeg') ||
      ct.includes('mp3');

    if (isId3 || isMp3Frame || isFlac || isOgg || isAudioCt) {
      return finalUrl;
    }
    // CDN urls often omit content-type but path has .mp3
    if (/\.mp3(\?|$)/i.test(finalUrl) || /music\.126\.net/i.test(finalUrl)) {
      return finalUrl;
    }
    return null;
  } catch (e) {
    console.warn('[play] probe failed', e.message || e);
    return null;
  }
}

/**
 * Resolve a playable stream URL for NetEase track ids.
 * Validates that the URL is actually audio before returning.
 */
async function resolveNeteasePlayUrl(songId, quality) {
  const id = extractNeteaseId(songId);
  if (!id) {
    throw new Error(`无法解析歌曲 ID（收到: ${songId}）`);
  }

  const brList = [];
  const brMap = {
    '128k': 128000,
    '320k': 320000,
    flac: 999000,
    hires: 999000,
  };
  const preferred = brMap[String(quality)] || 320000;
  brList.push(preferred, 320000, 128000, 192000);

  const apiCandidates = [
    (br) =>
      `https://interface.music.163.com/api/song/enhance/player/url?ids=[${id}]&br=${br}`,
    (br) => `https://music.163.com/api/song/enhance/player/url?ids=[${id}]&br=${br}`,
    (br) =>
      `https://interface3.music.163.com/api/song/enhance/player/url?ids=[${id}]&br=${br}`,
  ];

  let lastCode = null;
  for (const br of [...new Set(brList)]) {
    for (const build of apiCandidates) {
      try {
        const body = await httpGet(build(br), 12000);
        const data = JSON.parse(body);
        const item = data?.data?.[0];
        if (!item) continue;
        lastCode = item.code;
        if (item.url) {
          const ok = await probeAudioUrl(item.url);
          if (ok) return ok;
          // some CDNs reject Range probe but URL still works — accept if looks like CDN
          const u = String(item.url).replace(/^http:/, 'https:');
          if (/music\.126\.net|\.mp3/i.test(u)) return u;
        }
      } catch (e) {
        console.warn('[play] enhance api failed', e.message || e);
      }
    }
  }

  // outer media URL (free tracks often redirect to CDN)
  const outer = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
  const probedOuter = await probeAudioUrl(outer);
  if (probedOuter) return probedOuter;

  // public mirror APIs (best-effort, free songs only)
  const mirrors = [
    `https://api.paugram.com/netease/?id=${id}`,
    `https://netease-cloud-music-api-tau-pink.vercel.app/song/url/v1?id=${id}&level=standard`,
  ];
  for (const mirror of mirrors) {
    try {
      const body = await httpGet(mirror, 10000);
      const data = JSON.parse(body);
      const url =
        data?.url ||
        data?.data?.[0]?.url ||
        data?.data?.url ||
        (typeof data?.data === 'string' ? data.data : null);
      if (url) {
        const ok = await probeAudioUrl(url);
        if (ok) return ok;
        const u = String(url).replace(/^http:/, 'https:');
        if (/^https?:\/\//i.test(u)) return u;
      }
    } catch (e) {
      console.warn('[play] mirror failed', mirror, e.message || e);
    }
  }

  if (lastCode === 200 || lastCode === null) {
    throw new Error(
      '该歌曲暂无可用音源（可能为付费/下架/版权限制）。请换一首免费曲目，或在设置中导入可用音源。'
    );
  }
  throw new Error(
    `取链失败（平台返回 code=${lastCode}）。该曲可能需会员，请换免费歌曲试听。`
  );
}

async function fetchNeteaseLyric(songId) {
  const id = extractNeteaseId(songId);
  if (!id) return { lines: [], metadata: null };
  try {
    const body = await httpGet(
      `https://music.163.com/api/song/lyric?id=${id}&lv=1&kv=1&tv=-1`
    );
    const data = JSON.parse(body);
    const lrc = data?.lrc?.lyric || '';
    return parseLrc(lrc);
  } catch {
    return { lines: [], metadata: null };
  }
}

function pickNeteaseCover(s) {
  const raw =
    s?.album?.picUrl ||
    s?.album?.blurPicUrl ||
    s?.al?.picUrl ||
    s?.al?.pic_str ||
    s?.picUrl ||
    null;
  if (!raw) return null;
  let u = String(raw).trim();
  if (!u) return null;
  if (u.startsWith('//')) u = `https:${u}`;
  u = u.replace(/^http:\/\//i, 'https://');
  // prefer larger cover
  u = u.replace(/param=\d+y\d+/i, 'param=300y300');
  return u;
}

async function builtinNeteaseSearch(keyword, page, sourceId) {
  const offset = (Math.max(1, page) - 1) * 30;
  const body = await httpPostForm('https://music.163.com/api/cloudsearch/pc', {
    s: keyword,
    type: '1',
    offset: String(offset),
    limit: '30',
    total: 'true',
  }).catch(async () =>
    httpPostForm('https://music.163.com/api/search/get', {
      s: keyword,
      type: '1',
      offset: String(offset),
      limit: '30',
    })
  );
  const resp = JSON.parse(body);
  const songsRaw = resp?.result?.songs || [];
  const total = resp?.result?.songCount || songsRaw.length || 0;
  const songs = songsRaw.map((s) => {
    const id = String(s.id);
    // cloudsearch uses ar/al; search/get uses artists/album
    const artists = (s.ar || s.artists || [])
      .map((a) => a.name)
      .filter(Boolean);
    const albumName = s.al?.name || s.album?.name || '';
    const durationMs = s.dt || s.duration || 0;
    const fee = s.fee ?? 0;
    // fee bits: 1 收费, 4 数字专辑等；privilege 也可能表示试听
    const maybeVip = fee === 1 || fee === 4 || fee === 8 || s.privilege?.fee === 1;
    return {
      id: `wy:${id}`,
      name: s.name || '未知',
      artist: artists.join(' / ') || '未知',
      album: albumName,
      duration: Math.floor(durationMs / 1000),
      coverUrl: pickNeteaseCover(s),
      source: sourceId,
      songId: `wy:${id}`,
      qualities: ['128k', '320k', 'flac'],
      fee,
      playableHint: maybeVip ? 'maybe_vip' : 'ok',
    };
  });
  return { songs, total, page, perPage: 30 };
}

function normalizeSearchResult(data, page, sourceId) {
  if (Array.isArray(data.songs)) {
    const songs = data.songs.map((s) => ({
      ...s,
      source: s.source || sourceId,
    }));
    return {
      songs,
      total: data.total ?? songs.length,
      page: data.page ?? page,
      perPage: data.perPage ?? data.per_page ?? 30,
    };
  }
  return { songs: [], total: 0, page, perPage: 30 };
}

function parseLrc(text) {
  const lines = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
    if (!m) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const ms = Number((m[3] || '0').padEnd(3, '0'));
    lines.push({ time: min * 60 + sec + ms / 1000, text: (m[4] || '').trim() });
  }
  return { lines, metadata: null };
}

function sleepReject(ms, msg) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
}

module.exports = { SourceManager, httpGet };
