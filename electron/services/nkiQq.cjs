/**
 * 西瓜糖 Api · QQ 音乐解析
 * 速度：播放优先插队 + 连接复用 + 并行预热 + 缓存秒开
 */
const fs = require('fs');
const path = require('path');
const { getAppDataDir } = require('./appPaths.cjs');

const API_URL = 'https://api.nki.pw/API/music_open_api.php';
/** 公开仓库不内置密钥；在设置里填写，或写入 userData/nki-prefs.json */
const DEFAULT_API_KEY = '';

// 连接复用：少握手，连续解析更快
try {
  const { Agent, setGlobalDispatcher } = require('undici');
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 120_000,
      connections: 8,
      pipelining: 1,
    })
  );
} catch {
  /* undici 不可用时忽略 */
}

/** @type {AbortController | null} */
let playAbort = null;
let playSession = 0;
/** mid+quality -> { url, meta, exp } */
const midCache = new Map();
/** 内存/磁盘缓存 24 小时 —— 听过或预热过的歌尽量秒开 */
const MID_CACHE_MS = 24 * 60 * 60 * 1000;
/** 播放路径超时：mid 常 miss，别卡太久拖死切歌；预热可稍长 */
const NKI_PLAY_MS = 4500;
/** 有歌名兜底时 mid 再缩短，尽快并行出链 */
const NKI_PLAY_MID_MS = 3200;
const NKI_WARM_MS = 9000;
/** mid -> Promise，预热与播放共用同一次请求 */
const inflightMid = new Map();
let diskCacheLoaded = false;
let preconnected = false;

function prefsPath() {
  return path.join(getAppDataDir(), 'nki-prefs.json');
}

function loadPrefs() {
  try {
    const p = prefsPath();
    if (!fs.existsSync(p)) {
      const seed = {
        apiKey: DEFAULT_API_KEY || '',
        enabled: true,
        updatedAt: Date.now(),
      };
      savePrefs(seed);
      return seed;
    }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    // 仅当代码里配置了默认密钥且本地为空时才回填（公开发布默认不内置）
    if (!data.apiKey && DEFAULT_API_KEY) {
      data.apiKey = DEFAULT_API_KEY;
      data.enabled = data.enabled !== false;
      savePrefs(data);
    }
    if (data.enabled === undefined) data.enabled = true;
    return data;
  } catch {
    return { apiKey: DEFAULT_API_KEY || '', enabled: true };
  }
}

function savePrefs(data) {
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(
      prefsPath(),
      JSON.stringify({ ...data, updatedAt: Date.now() }, null, 2),
      'utf8'
    );
  } catch (e) {
    console.warn('[nki] save prefs failed', e.message || e);
  }
}

function getApiKey() {
  return String(loadPrefs().apiKey || '').trim();
}

function isEnabled() {
  const p = loadPrefs();
  return p.enabled !== false && Boolean(getApiKey());
}

function setApiKey(key) {
  const p = loadPrefs();
  p.apiKey = String(key || '').trim();
  savePrefs(p);
  return { ok: true, hasKey: Boolean(p.apiKey) };
}

function setEnabled(enabled) {
  const p = loadPrefs();
  p.enabled = Boolean(enabled);
  savePrefs(p);
  return { ok: true, enabled: p.enabled };
}

function getStatus() {
  const p = loadPrefs();
  const key = String(p.apiKey || '');
  return {
    enabled: p.enabled !== false,
    hasKey: key.length > 8,
    keyHint: key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key ? '****' : '',
    api: API_URL,
  };
}

function beginPlaySession() {
  playSession += 1;
  if (playAbort) {
    try {
      playAbort.abort();
    } catch {
      /* ignore */
    }
  }
  playAbort = new AbortController();
  return { session: playSession, signal: playAbort.signal };
}

function switchedError() {
  const err = new Error('播放已切换');
  err.code = 'PLAY_SWITCHED';
  return err;
}

function httpsify(u) {
  if (!u) return null;
  let s = String(u).trim();
  if (!s) return null;
  if (s.startsWith('//')) s = `https:${s}`;
  return s.replace(/^http:\/\//i, 'https://');
}

/**
 * 限流：预热最多占 2 槽；播放可插队到 4 槽且排在队首
 * → 点播放不会被后台预热堵住
 */
let nkiInflight = 0;
/** @type {{ resolve: Function, priority: boolean }[]} */
const nkiWaitQueue = [];
const NKI_MAX_WARM = 2;
const NKI_MAX_TOTAL = 4;

function acquireNkiSlot(priority = false) {
  const limit = priority ? NKI_MAX_TOTAL : NKI_MAX_WARM;
  // 预热还要看总槽，别把播放挤死
  const canGo =
    nkiInflight < limit && (priority || nkiInflight < NKI_MAX_WARM);
  if (canGo && nkiInflight < NKI_MAX_TOTAL) {
    nkiInflight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const item = { resolve, priority: Boolean(priority) };
    if (priority) {
      // 插到第一个非 priority 之前（队首优先）
      const idx = nkiWaitQueue.findIndex((x) => !x.priority);
      if (idx === -1) nkiWaitQueue.push(item);
      else nkiWaitQueue.splice(idx, 0, item);
    } else {
      nkiWaitQueue.push(item);
    }
  }).then(() => {
    nkiInflight += 1;
  });
}

function releaseNkiSlot() {
  nkiInflight = Math.max(0, nkiInflight - 1);
  // 优先放行排队中的播放请求
  const nextIdx = nkiWaitQueue.findIndex((x) => x.priority);
  const next =
    nextIdx >= 0
      ? nkiWaitQueue.splice(nextIdx, 1)[0]
      : nkiInflight < NKI_MAX_WARM
        ? nkiWaitQueue.shift()
        : null;
  if (next) next.resolve();
  else if (nkiWaitQueue.length && nkiInflight < NKI_MAX_TOTAL) {
    // 没有播放排队时，总槽有空就放预热
    const w = nkiWaitQueue.shift();
    if (w) w.resolve();
  }
}

/** 启动时预热 TCP/TLS，第一次解析少几百 ms */
function preconnect() {
  if (preconnected) return;
  preconnected = true;
  const key = getApiKey();
  if (!key) return;
  // 轻量 HEAD/短请求打通连接（忽略结果）
  const u = new URL(API_URL);
  u.searchParams.set('apikey', key);
  u.searchParams.set('json', '1');
  u.searchParams.set('msg', 'ping');
  u.searchParams.set('n', '1');
  fetch(u.toString(), {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Accept: 'application/json,text/plain,*/*',
    },
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

/**
 * @param {object} params
 * @param {number} timeoutMs
 * @param {AbortSignal|null} externalSignal
 * @param {{ priority?: boolean }} opts
 */
async function apiGet(params, timeoutMs = 12000, externalSignal = null, opts = {}) {
  const key = getApiKey();
  if (!key) throw new Error('未配置西瓜糖 QQ 接口密钥');
  const priority = Boolean(opts.priority);

  if (externalSignal?.aborted) throw switchedError();

  await acquireNkiSlot(priority);
  if (externalSignal?.aborted) {
    releaseNkiSlot();
    throw switchedError();
  }

  const u = new URL(API_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.searchParams.set(k, String(v));
  }
  u.searchParams.set('apikey', key);
  u.searchParams.set('json', '1');

  const ctrl = new AbortController();
  const onExt = () => {
    try {
      ctrl.abort();
    } catch {
      /* ignore */
    }
  };
  if (externalSignal) {
    externalSignal.addEventListener('abort', onExt, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'application/json,text/plain,*/*',
        Connection: 'keep-alive',
      },
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`QQ接口返回非 JSON: ${text.slice(0, 80)}`);
    }
    if (data?.error) {
      throw new Error(data.error.message || `QQ接口错误 ${data.error.code}`);
    }
    return data;
  } catch (e) {
    // 外部 signal = 用户切歌
    if (externalSignal?.aborted) throw switchedError();
    // 超时等本地 abort
    if (e && e.name === 'AbortError') {
      const err = new Error('QQ接口超时');
      err.code = 'TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    releaseNkiSlot();
    if (externalSignal) {
      try {
        externalSignal.removeEventListener('abort', onExt);
      } catch {
        /* ignore */
      }
    }
  }
}

async function apiGetRetry(params, timeoutMs = 12000, signal = null) {
  try {
    return await apiGet(params, timeoutMs, signal);
  } catch (e) {
    if (e?.code === 'PLAY_SWITCHED') throw e;
    if (signal?.aborted) throw switchedError();
    await new Promise((r) => setTimeout(r, 250));
    if (signal?.aborted) throw switchedError();
    return apiGet(params, timeoutMs, signal);
  }
}

function pickUrlFromDetail(detail, quality = '320k') {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const q = String(quality || '320k').toLowerCase();
  const candidates = [];
  if (q.includes('flac') || q.includes('hires') || q === 'sq') {
    candidates.push(detail.song_play_url_sq, detail.song_play_url_hq, detail.song_play_url);
  } else if (q.includes('128') || q === 'lq' || q === 'standard') {
    candidates.push(
      detail.song_play_url_standard,
      detail.song_play_url_hq,
      detail.song_play_url,
      detail.song_play_url_fq
    );
  } else {
    candidates.push(
      detail.song_play_url_hq,
      detail.song_play_url,
      detail.song_play_url_standard,
      detail.song_play_url_sq
    );
  }
  for (const u of candidates) {
    const s = httpsify(u);
    if (s) return s;
  }
  return null;
}

function metaFromDetail(detail) {
  if (!detail || Array.isArray(detail)) return null;
  return {
    name: detail.song_name || detail.song_title || null,
    artist: detail.singer_name || null,
    album: detail.album_name || detail.album_title || '',
    duration: Number(detail.song_play_time || 0) || 0,
    coverUrl: httpsify(detail.album_pic || detail.singer_pic || null),
  };
}

function diskCachePath() {
  return path.join(getAppDataDir(), 'nki-mid-cache.json');
}

function loadDiskCache() {
  if (diskCacheLoaded) return;
  diskCacheLoaded = true;
  try {
    const p = diskCachePath();
    if (!fs.existsSync(p)) return;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const now = Date.now();
    let n = 0;
    for (const [k, v] of Object.entries(data || {})) {
      if (!v?.url || !v.exp || v.exp <= now) continue;
      midCache.set(k, { url: v.url, meta: v.meta || null, exp: v.exp });
      n += 1;
    }
    if (n) console.log('[nki-qq] disk cache loaded', n);
  } catch {
    /* ignore */
  }
}

let diskSaveTimer = null;
function scheduleDiskSave() {
  if (diskSaveTimer) return;
  diskSaveTimer = setTimeout(() => {
    diskSaveTimer = null;
    try {
      const now = Date.now();
      const out = {};
      for (const [k, v] of midCache.entries()) {
        if (v?.url && v.exp > now) out[k] = v;
      }
      fs.mkdirSync(path.dirname(diskCachePath()), { recursive: true });
      fs.writeFileSync(diskCachePath(), JSON.stringify(out), 'utf8');
    } catch {
      /* ignore */
    }
  }, 800);
}

function cacheGet(mid, quality) {
  loadDiskCache();
  const k = `${mid}::${String(quality || '320k').toLowerCase()}`;
  const hit = midCache.get(k);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    midCache.delete(k);
    return null;
  }
  return hit;
}

function cacheSet(mid, quality, url, meta) {
  if (!mid || !url) return;
  loadDiskCache();
  const k = `${mid}::${String(quality || '320k').toLowerCase()}`;
  midCache.set(k, { url, meta: meta || null, exp: Date.now() + MID_CACHE_MS });
  // 也按「任意音质」键存一份，切 128/320 时能秒开
  const anyK = `${mid}::__any__`;
  midCache.set(anyK, { url, meta: meta || null, exp: Date.now() + MID_CACHE_MS });
  while (midCache.size > 400) midCache.delete(midCache.keys().next().value);
  scheduleDiskSave();
}

function peekMidCache(mid, quality = '320k') {
  const bare = String(mid || '')
    .replace(/^tx[:/]/i, '')
    .trim();
  if (!bare) return null;
  return cacheGet(bare, quality) || cacheGet(bare, '__any__');
}

function normalizeMid(mid) {
  return String(mid || '')
    .replace(/^tx[:/]/i, '')
    .trim();
}

/**
 * 并行竞速：谁先返回有效 url 谁赢，其余 abort
 * @template T
 * @param {Array<() => Promise<T|null>>} factories
 * @param {AbortSignal|null} externalSignal
 * @returns {Promise<T|null>}
 */
async function raceFirst(factories, externalSignal = null) {
  if (!factories.length) return null;
  if (externalSignal?.aborted) throw switchedError();

  const ctrl = new AbortController();
  const onExt = () => {
    try {
      ctrl.abort();
    } catch {
      /* ignore */
    }
  };
  if (externalSignal) externalSignal.addEventListener('abort', onExt, { once: true });

  return new Promise((resolve, reject) => {
    let pending = factories.length;
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      try {
        ctrl.abort();
      } catch {
        /* ignore */
      }
      if (externalSignal) {
        try {
          externalSignal.removeEventListener('abort', onExt);
        } catch {
          /* ignore */
        }
      }
      resolve(val);
    };
    const failOne = () => {
      // 仅外部切歌 signal 才整场取消；己方 abort 输家抛的 PLAY_SWITCHED 只算一票失败
      if (externalSignal?.aborted) {
        if (!settled) {
          settled = true;
          reject(switchedError());
        }
        return;
      }
      pending -= 1;
      if (pending <= 0 && !settled) done(null);
    };

    for (const factory of factories) {
      Promise.resolve()
        .then(() => factory(ctrl.signal))
        .then((val) => {
          if (val) done(val);
          else failOne(null);
        })
        .catch(failOne);
    }
  });
}

/**
 * 单次取详情 → url
 * @param {{ priority?: boolean, timeoutMs?: number }} opts
 */
async function detailToHit(params, quality, signal, opts = {}) {
  const priority = Boolean(opts.priority);
  const timeoutMs = opts.timeoutMs || (priority ? NKI_PLAY_MS : NKI_WARM_MS);
  const detail = await apiGet(params, timeoutMs, signal, { priority });
  if (!detail || Array.isArray(detail)) return null;
  const url = pickUrlFromDetail(detail, quality);
  if (!url) return null;
  return { url, meta: metaFromDetail(detail), mid: detail.song_mid || params.mid || null };
}

/**
 * 用 mid 解析
 * @param {string} mid
 * @param {string} quality
 * @param {AbortSignal|null} signal
 * @param {string} nameHint
 * @param {{ timeoutMs?: number }} opts
 * @returns {Promise<{url:string, meta:object|null}|null>}
 */
async function resolveByMidDetailed(
  mid,
  quality = '320k',
  signal = null,
  nameHint = '',
  opts = {}
) {
  if (!isEnabled()) return null;
  const bare = normalizeMid(mid);
  if (!bare || bare.length < 6) return null;

  const cached = cacheGet(bare, quality) || cacheGet(bare, '__any__');
  if (cached?.url) {
    console.log('[nki-qq] mid cache hit', bare);
    return { url: cached.url, meta: cached.meta };
  }

  if (signal?.aborted) throw switchedError();

  // 已有同 mid 在飞（预热/上次点击）→ 等它，别再开一轮
  const flying = inflightMid.get(bare);
  if (flying) {
    try {
      const shared = await flying;
      if (signal?.aborted) throw switchedError();
      if (shared?.url) return shared;
    } catch (e) {
      if (e?.code === 'PLAY_SWITCHED') throw e;
    }
    const again = cacheGet(bare, quality) || cacheGet(bare, '__any__');
    if (again?.url) return { url: again.url, meta: again.meta };
  }

  const name = String(nameHint || '').trim() || 'music';
  const isPlay = Boolean(signal); // 有 signal = 用户点播路径，优先插队
  const midTimeout =
    opts.timeoutMs || (isPlay ? NKI_PLAY_MID_MS : NKI_WARM_MS);
  const t0 = Date.now();
  const work = (async () => {
    let hit = null;
    try {
      // 播放：music+mid 一路；超时收紧，尽快让上层走歌名/酷我
      hit = await detailToHit({ msg: 'music', mid: bare }, quality, signal, {
        priority: isPlay,
        timeoutMs: midTimeout,
      });
    } catch (e) {
      if (e?.code === 'PLAY_SWITCHED') throw e;
    }
    // 预热：再试歌名+mid；播放路径不串第二枪（已与歌名并行竞速）
    if (!hit?.url && !isPlay && !(signal?.aborted)) {
      try {
        hit = await detailToHit(
          { msg: name !== 'music' ? name : 'jay', n: '1', mid: bare },
          quality,
          signal,
          { priority: false, timeoutMs: NKI_WARM_MS }
        );
      } catch (e) {
        if (e?.code === 'PLAY_SWITCHED') throw e;
      }
    }

    if (hit?.url) {
      cacheSet(bare, quality, hit.url, hit.meta);
      if (hit.mid && hit.mid !== bare) cacheSet(hit.mid, quality, hit.url, hit.meta);
      console.log('[nki-qq] mid hit', bare, `${Date.now() - t0}ms`, String(hit.url).slice(0, 64));
      return { url: hit.url, meta: hit.meta };
    }
    console.warn('[nki-qq] mid miss', bare, `${Date.now() - t0}ms`);
    return null;
  })();

  inflightMid.set(bare, work);
  try {
    const result = await work;
    if (signal?.aborted) throw switchedError();
    return result;
  } catch (e) {
    if (e?.code === 'PLAY_SWITCHED' || signal?.aborted) throw switchedError();
    throw e;
  } finally {
    if (inflightMid.get(bare) === work) inflightMid.delete(bare);
  }
}

/**
 * 歌名直出 n=1（一条请求拿 url，比 list→再 mid 快）
 */
async function resolveByNameDirect(name, artist = '', quality = '320k', signal = null) {
  const keyword = [name, artist].filter(Boolean).join(' ').trim();
  if (!keyword) return null;
  try {
    const hit = await detailToHit({ msg: keyword, n: '1' }, quality, signal, {
      priority: Boolean(signal),
      timeoutMs: signal ? NKI_PLAY_MS : NKI_WARM_MS,
    });
    if (hit?.url) {
      if (hit.mid) cacheSet(hit.mid, quality, hit.url, hit.meta);
      console.log('[nki-qq] name-direct hit', keyword.slice(0, 40));
      return { url: hit.url, meta: hit.meta };
    }
  } catch (e) {
    if (e?.code === 'PLAY_SWITCHED') throw e;
  }
  return null;
}

async function resolveBySearch(name, artist = '', quality = '320k', signal = null) {
  if (!isEnabled()) return null;
  // 优先单请求直出，失败再 list
  const direct = await resolveByNameDirect(name, artist, quality, signal);
  if (direct?.url) return direct;

  const keyword = [name, artist].filter(Boolean).join(' ').trim();
  if (!keyword) return null;

  let list;
  try {
    list = await apiGet({ msg: keyword, line: '8' }, NKI_WARM_MS, signal, {
      priority: Boolean(signal),
    });
  } catch (e) {
    if (e?.code === 'PLAY_SWITCHED') throw e;
    return null;
  }
  if (!Array.isArray(list) || !list.length) return null;

  const nameL = String(name || '').toLowerCase();
  const artistCore = String(artist || '')
    .toLowerCase()
    .split(/[\/、,&|]/)[0]
    .trim();

  const scored = list
    .map((item, idx) => {
      const sn = String(item.song_title || '').toLowerCase();
      const sa = String(item.singer_name || '').toLowerCase();
      let score = 0;
      if (sn === nameL) score += 50;
      else if (nameL && (sn.includes(nameL) || nameL.includes(sn))) score += 28;
      if (artistCore && (sa.includes(artistCore) || artistCore.includes(sa))) score += 35;
      if (/remix|翻唱|dj|cover|伴奏|片段|live|女声|钢琴/i.test(sn + sa)) score -= 30;
      score += Math.max(0, 10 - idx);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  for (const { item } of scored.slice(0, 2)) {
    if (signal?.aborted) throw switchedError();
    if (!item.song_mid) continue;
    try {
      const hit = await resolveByMidDetailed(item.song_mid, quality, signal, item.song_title || name);
      if (hit?.url) {
        console.log('[nki-qq] search hit', item.song_title, item.singer_name);
        return hit;
      }
    } catch (e) {
      if (e?.code === 'PLAY_SWITCHED') throw e;
    }
  }
  return null;
}

/**
 * 播放取链：可取消
 * - 缓存秒开
 * - mid 与歌名并行竞速（mid 常 miss 且超时，串行会把连续切歌拖死）
 * - 只保留像 QQ songmid 的 id，避免 strMediaMid 乱枪
 * @param {{ mid?: string, mids?: string[], name?: string, artist?: string, quality?: string }} opts
 */
async function resolvePlayUrl({ mid, mids, name, artist, quality } = {}) {
  if (!isEnabled()) return null;
  const { session, signal } = beginPlaySession();
  const q = quality || '320k';

  try {
    if (session !== playSession) throw switchedError();

    // 只保留「像 QQ songmid」的 id（14 位左右字母数字），过滤哈希/纯数字
    const midList = [];
    const pushMid = (m) => {
      const b = normalizeMid(m);
      if (!b || b.length < 10 || b.length > 20) return;
      if (!/^[0-9A-Za-z]+$/.test(b)) return;
      if (/^\d+$/.test(b)) return;
      if (!midList.includes(b)) midList.push(b);
    };
    // 优先调用方给的主 mid，再补 mids
    pushMid(mid);
    if (Array.isArray(mids)) {
      for (const m of mids) {
        pushMid(m);
        if (midList.length >= 2) break; // 最多 2 个 mid
      }
    }

    // 先吃缓存
    for (const m of midList) {
      const c = cacheGet(m, q) || cacheGet(m, '__any__');
      if (c?.url) {
        console.log('[nki-qq] play cache hit', m);
        return { url: c.url, meta: c.meta };
      }
    }

    const t0 = Date.now();
    const primary = midList[0];
    const hasName = Boolean(String(name || '').trim());

    // mid + 歌名并行：谁先出链谁赢（连续切歌关键路径）
    if (primary && hasName) {
      try {
        const raced = await raceFirst(
          [
            (sig) =>
              resolveByMidDetailed(primary, q, sig, name || '', {
                timeoutMs: NKI_PLAY_MID_MS,
              }),
            (sig) => resolveByNameDirect(name, artist, q, sig),
          ],
          signal
        );
        if (session !== playSession || signal?.aborted) throw switchedError();
        if (raced?.url) {
          console.log(
            '[nki-qq] play ok race',
            `${Date.now() - t0}ms`,
            name || primary
          );
          return raced;
        }
      } catch (e) {
        if (e?.code === 'PLAY_SWITCHED' || signal?.aborted || session !== playSession) {
          throw switchedError();
        }
      }
    } else if (primary) {
      try {
        const byMid = await resolveByMidDetailed(primary, q, signal, name || '', {
          timeoutMs: NKI_PLAY_MS,
        });
        if (byMid?.url) {
          console.log('[nki-qq] play ok', `${Date.now() - t0}ms`, name || primary);
          return byMid;
        }
      } catch (e) {
        if (e?.code === 'PLAY_SWITCHED' || signal?.aborted || session !== playSession) {
          throw switchedError();
        }
      }
    } else if (hasName) {
      try {
        const byName = await resolveByNameDirect(name, artist, q, signal);
        if (byName?.url) {
          console.log('[nki-qq] play ok name', `${Date.now() - t0}ms`, name);
          return byName;
        }
      } catch (e) {
        if (e?.code === 'PLAY_SWITCHED' || signal?.aborted || session !== playSession) {
          throw switchedError();
        }
      }
    }

    if (signal?.aborted || session !== playSession) throw switchedError();

    // 第二个 mid（若有且主路径未命中）
    if (midList[1] && midList[1] !== primary) {
      try {
        const byMid2 = await resolveByMidDetailed(midList[1], q, signal, name || '', {
          timeoutMs: NKI_PLAY_MID_MS,
        });
        if (byMid2?.url) {
          console.log('[nki-qq] play ok mid2', `${Date.now() - t0}ms`, name || midList[1]);
          return byMid2;
        }
      } catch (e) {
        if (e?.code === 'PLAY_SWITCHED' || signal?.aborted || session !== playSession) {
          throw switchedError();
        }
      }
    }

    // 仅 mid 路径失败时再补一次歌名（有 name 且上面已 race 过则跳过）
    if (hasName && !primary) {
      /* already tried */
    } else if (hasName && primary) {
      // race 已试过 name；若 race 因单路异常提前结束，再补一枪
      try {
        const byName = await resolveByNameDirect(name, artist, q, signal);
        if (byName?.url) {
          console.log('[nki-qq] play ok name-retry', `${Date.now() - t0}ms`, name);
          return byName;
        }
      } catch (e) {
        if (e?.code === 'PLAY_SWITCHED' || signal?.aborted || session !== playSession) {
          throw switchedError();
        }
      }
    }

    return null;
  } catch (e) {
    if (e?.code === 'PLAY_SWITCHED' || signal?.aborted || session !== playSession) {
      throw switchedError();
    }
    console.warn('[nki-qq] resolve failed', e.message || e);
    return null;
  }
}

/**
 * 后台预热缓存（不占用 play session；与播放共享 inflight）
 */
async function warmMid(mid, nameHint = '', quality = '320k') {
  if (!isEnabled()) return;
  const bare = normalizeMid(mid);
  if (!bare || bare.length < 10 || bare.length > 20) return;
  if (!/^[0-9A-Za-z]+$/.test(bare) || /^\d+$/.test(bare)) return;
  if (cacheGet(bare, quality) || cacheGet(bare, '__any__')) return;
  try {
    await resolveByMidDetailed(bare, quality, null, nameHint || 'music');
  } catch {
    /* ignore */
  }
}

/** 搜索/队列预热批次；新搜索会顶掉旧预热 */
let prefetchGen = 0;

function extractSongMid(song) {
  if (!song) return '';
  const fromId = String(song.songId || '').replace(/^tx[:/]/i, '');
  const mid = normalizeMid(song.songmid || fromId);
  if (!mid || mid.length < 10 || mid.length > 20) return '';
  if (!/^[0-9A-Za-z]+$/.test(mid) || /^\d+$/.test(mid)) return '';
  return mid;
}

/**
 * 预热一批歌（并行 2 路）。列表一出几秒内顶部歌曲基本可秒开
 */
function prefetchSongs(songs, limit = 15) {
  if (!isEnabled() || !Array.isArray(songs)) return;
  preconnect();
  const gen = ++prefetchGen;
  const list = songs.slice(0, limit);
  setImmediate(async () => {
    const todos = [];
    for (const s of list) {
      const mid = extractSongMid(s);
      if (!mid) continue;
      if (cacheGet(mid, '320k') || cacheGet(mid, '__any__')) continue;
      todos.push({ mid, name: s.name || '' });
    }
    // 并行 2：和 NKI_MAX_WARM 对齐，尽快填缓存
    let i = 0;
    const worker = async () => {
      while (i < todos.length) {
        if (gen !== prefetchGen) return;
        const cur = todos[i++];
        try {
          await warmMid(cur.mid, cur.name, '320k');
        } catch {
          /* ignore */
        }
      }
    };
    await Promise.all([worker(), worker()]);
  });
}

/** 单曲预热（悬停 / 即将播放） */
function warmSong(song, quality = '320k') {
  if (!song) return Promise.resolve();
  const mid = extractSongMid(song);
  if (!mid) return Promise.resolve();
  return warmMid(mid, song.name || '', quality || '320k');
}

/** 是否已有可秒开的缓存 */
function hasPlayCache(song, quality = '320k') {
  const mid = extractSongMid(song);
  if (!mid) return false;
  return Boolean(cacheGet(mid, quality) || cacheGet(mid, '__any__'));
}

/** 直接读缓存 url（给 play 快路径） */
function getCachedPlay(song, quality = '320k') {
  const mid = extractSongMid(song);
  if (!mid) return null;
  const hit = cacheGet(mid, quality) || cacheGet(mid, '__any__');
  if (!hit?.url) return null;
  return { url: hit.url, meta: hit.meta, mid };
}

async function resolvePlayUrlString(opts) {
  const r = await resolvePlayUrl(opts);
  if (!r) return null;
  return typeof r === 'string' ? r : r.url || null;
}

async function resolveByMid(mid, quality = '320k', signal = null, nameHint = '') {
  const r = await resolveByMidDetailed(mid, quality, signal, nameHint);
  return r?.url || null;
}

/**
 * 用 QQ 官方免费接口补封面/时长/专辑（快，不占西瓜糖配额）
 * 实测 6 路并行约 150ms
 */
async function enrichWithQqOfficial(songs) {
  const list = Array.isArray(songs) ? songs : [];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const s = list[i++];
      const mid = s.strMediaMid;
      if (!mid) continue;
      try {
        const u =
          `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${encodeURIComponent(mid)}` +
          `&tpl=yqq_song_detail&format=json`;
        const res = await fetch(u, {
          headers: {
            Referer: 'https://y.qq.com/',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          },
          signal: AbortSignal.timeout(5000),
        });
        const j = await res.json();
        const d = j?.data?.[0];
        if (!d) continue;
        if (d.interval) s.duration = Number(d.interval) || s.duration;
        if (d.album?.name) s.album = d.album.name;
        if (d.album?.mid) {
          s.coverUrl = `https://y.gtimg.cn/music/photo_new/T002R300x300M000${d.album.mid}.jpg`;
        } else if (d.singer?.[0]?.mid) {
          s.coverUrl = `https://y.gtimg.cn/music/photo_new/T001R300x300M000${d.singer[0].mid}.jpg`;
        }
      } catch {
        /* skip one */
      }
    }
  };
  // 10 路并行，整页 30 首通常 <1s
  await Promise.all(Array.from({ length: 10 }, () => worker()));
  return list;
}

/**
 * 搜索：西瓜糖列表（快）+ QQ 官方补封面/时长（也快）
 * 不再对每首歌打西瓜糖 detail（那是搜索变慢的主因）
 */
async function searchSongs(keyword, limit = 30) {
  if (!isEnabled()) return [];
  const q = String(keyword || '').trim();
  if (!q) return [];
  try {
    const list = await apiGetRetry(
      { msg: q, line: String(Math.min(40, Math.max(5, limit))) },
      12000
    );
    if (!Array.isArray(list)) return [];

    const songs = list
      .map((item, i) => {
        const mid = String(item.song_mid || '').trim();
        const name = String(item.song_title || '未知');
        const artist = String(item.singer_name || '未知');
        const isVip = /付费|vip|会员/i.test(String(item.pay || ''));
        return {
          id: mid ? `tx:${mid}` : `tx:nki-${i}`,
          name,
          artist,
          album: '',
          duration: 0,
          coverUrl: null,
          source: 'tx',
          songId: mid ? `tx:${mid}` : `tx:nki-${i}`,
          strMediaMid: mid || undefined,
          qualities: ['128k', '320k', 'flac'],
          fee: isVip ? 1 : 0,
          playableHint: 'ok',
          platform: 'tx',
          platformLabel: 'QQ音乐',
        };
      })
      .filter((s) => s.strMediaMid);

    await enrichWithQqOfficial(songs);
    return songs;
  } catch (e) {
    console.warn('[nki-qq] searchSongs failed', e.message || e);
    return [];
  }
}

module.exports = {
  API_URL,
  getApiKey,
  setApiKey,
  setEnabled,
  isEnabled,
  getStatus,
  beginPlaySession,
  searchSongs,
  enrichWithQqOfficial,
  resolveByMid,
  resolveByMidDetailed,
  resolveBySearch,
  resolvePlayUrl,
  resolvePlayUrlString,
  peekMidCache,
  warmMid,
  warmSong,
  prefetchSongs,
  hasPlayCache,
  getCachedPlay,
  extractSongMid,
  preconnect,
  pickUrlFromDetail,
};
