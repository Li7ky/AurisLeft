const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSourcesPath, getLxPrefsPath } = require('./appPaths.cjs');
const { LxSourceEngine } = require('./lxRuntime.cjs');
const catalogSearch = require('./catalogSearch.cjs');

/**
 * 来自 https://github.com/pdone/lx-music-source 的内置洛雪兼容脚本
 * 野花（flower）优先。
 */
const BUILTIN_LX_FILES = [
  'flower.js',
  'huibq.js',
  'ikun.js',
  'juhe.js',
  'grass.js',
  'lx.js',
  'sixyin.js',
];

const LX_REMOTE_SOURCES = [
  { id: 'flower', path: 'flower/latest.js' },
  { id: 'huibq', path: 'huibq/latest.js' },
  { id: 'ikun', path: 'ikun/latest.js' },
  { id: 'juhe', path: 'juhe/latest.js' },
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
   * 取播放地址（对齐洛雪：本平台失败则自动换源）
   */
  async getMusicUrl(songId, quality, sourceId, songMeta = {}) {
    const src = this.sources.get(sourceId);

    if (src?.kind === 'json') {
      const url = this.buildUrl(src, 'music_url', {
        song_id: songId,
        quality: String(quality),
      });
      const body = await httpGet(url);
      const data = JSON.parse(body);
      if (!data.url) throw new Error("Missing 'url' field in response");
      return String(data.url);
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

    const wait = await this.waitLxReady(25000);
    if (!wait.ready) {
      console.warn(
        `[play] LX 未就绪 finished=${wait.finished} count=${wait.count} waited=${wait.waitedMs}ms`
      );
    } else {
      console.log(`[play] LX 就绪 count=${wait.count} waited=${wait.waitedMs}ms`);
    }

    const primary = detectLxPlatform(songId, sourceId);
    const errors = [];

    // 1) 原平台取链
    if (wait.ready && primary) {
      try {
        const musicInfo = buildLxMusicInfo(songId, songMeta, primary);
        const lxUrl = await this.lxEngine.resolveMusicUrl(
          primary,
          musicInfo,
          quality || '320k'
        );
        if (lxUrl && !isLikelyTrialUrl(lxUrl)) {
          console.log(`[play] hit primary ${primary}`);
          return lxUrl;
        }
        if (lxUrl && isLikelyTrialUrl(lxUrl)) {
          errors.push(`${primary}: 疑似试听链接，尝试换源`);
          console.warn(`[play] trial-like url on ${primary}, try switch`);
        }
      } catch (e) {
        errors.push(`${primary}: ${e.message || e}`);
      }
    }

    // 2) 换源：按歌名+歌手搜其它平台再取链（洛雪核心体验）
    if (wait.ready && songMeta.name) {
      try {
        const alts = await catalogSearch.findAlternatives(
          songMeta.name,
          songMeta.artist || '',
          primary,
          6
        );
        console.log(`[play] 换源候选 ${alts.length} 首`);
        for (const alt of alts) {
          const p = alt.platform || detectLxPlatform(alt.songId, alt.source);
          try {
            const info = buildLxMusicInfo(alt.songId, {
              name: alt.name,
              artist: alt.artist,
              album: alt.album,
              duration: alt.duration,
              coverUrl: alt.coverUrl,
              hash: alt.hash,
              strMediaMid: alt.strMediaMid,
            }, p);
            const url = await this.lxEngine.resolveMusicUrl(p, info, quality || '320k');
            if (url && !isLikelyTrialUrl(url)) {
              console.log(`[play] 换源成功 ${primary} → ${p} ${alt.name}`);
              return url;
            }
            if (url && isLikelyTrialUrl(url)) {
              errors.push(`${p}: 试听链接`);
            }
          } catch (e) {
            errors.push(`${p}: ${e.message || e}`);
          }
        }
      } catch (e) {
        errors.push(`换源搜索: ${e.message || e}`);
      }
    }

    if (!wait.ready) {
      errors.push('lx: 音源仍在初始化或未开启');
    } else if (!this.lxEngine.readyCount()) {
      errors.push('lx: 没有已开启的音源');
    }

    throw new Error(
      errors.length
        ? `取链失败（${errors.slice(0, 6).join('；')}）`
        : '该歌曲暂无可用音源。请在设置中开启音源后重试。'
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
