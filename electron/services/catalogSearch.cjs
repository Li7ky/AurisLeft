/**
 * 多平台曲库搜索（对齐洛雪：wy/kw/kg/tx）
 * 仅负责搜出带平台 ID 的歌曲元数据；取链仍走洛雪脚本 musicUrl。
 */

const PLATFORM_LABEL = {
  wy: '网易云',
  kw: '酷我',
  kg: '酷狗',
  tx: 'QQ音乐',
  mg: '咪咕',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

async function httpGet(url, timeoutMs = 12000, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        ...headers,
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function httpPostForm(url, formObj, headers = {}) {
  const body = new URLSearchParams(formObj).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      ...headers,
    },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function sleepReject(ms, msg) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
}

function normalizeCover(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!u) return null;
  if (u.startsWith('//')) u = `https:${u}`;
  u = u.replace(/^http:\/\//i, 'https://');
  return u;
}

/** 解码酷我等接口里的 \u0026、&nbsp; 等 */
function decodeText(s) {
  if (s == null) return '';
  let t = String(s);
  try {
    // 字面量 \u0026 → &
    t = t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
  } catch {
    /* ignore */
  }
  return t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 网易云 */
async function searchNetease(keyword, page = 1) {
  const offset = (Math.max(1, page) - 1) * 30;
  const body = await httpPostForm(
    'https://music.163.com/api/cloudsearch/pc',
    {
      s: keyword,
      type: '1',
      offset: String(offset),
      limit: '30',
      total: 'true',
    },
    { Referer: 'https://music.163.com/' }
  ).catch(async () =>
    httpPostForm(
      'https://music.163.com/api/search/get',
      {
        s: keyword,
        type: '1',
        offset: String(offset),
        limit: '30',
      },
      { Referer: 'https://music.163.com/' }
    )
  );
  const resp = JSON.parse(body);
  const songsRaw = resp?.result?.songs || [];
  const total = resp?.result?.songCount || songsRaw.length || 0;
  const songs = songsRaw.map((s) => {
    const id = String(s.id);
    const artists = (s.ar || s.artists || []).map((a) => a.name).filter(Boolean);
    const albumName = s.al?.name || s.album?.name || '';
    const durationMs = s.dt || s.duration || 0;
    const fee = s.fee ?? 0;
    const maybeVip = fee === 1 || fee === 4 || fee === 8 || s.privilege?.fee === 1;
    let cover =
      s.al?.picUrl || s.album?.picUrl || s.al?.blurPicUrl || s.album?.blurPicUrl || null;
    cover = normalizeCover(cover);
    if (cover) cover = cover.replace(/param=\d+y\d+/i, 'param=300y300');
    return {
      id: `wy:${id}`,
      name: decodeText(s.name || '未知'),
      artist: decodeText(artists.join(' / ') || '未知'),
      album: decodeText(albumName),
      duration: Math.floor(durationMs / 1000),
      coverUrl: cover,
      source: 'wy',
      songId: `wy:${id}`,
      qualities: ['320k', '128k', 'flac'],
      fee,
      playableHint: maybeVip ? 'maybe_vip' : 'ok',
      platform: 'wy',
      platformLabel: PLATFORM_LABEL.wy,
    };
  });
  // 关键词里含歌手时，把更贴合原曲的结果提前（减少 remix / 翻唱抢第一）
  const ranked = rankByKeyword(songs, keyword);
  return { songs: ranked, total, page, perPage: 30, platform: 'wy' };
}

/** 酷我 */
async function searchKuwo(keyword, page = 1) {
  const pn = Math.max(0, page - 1);
  const url =
    `https://search.kuwo.cn/r.s?all=${encodeURIComponent(keyword)}` +
    `&ft=music&itemset=web_2013&client=kt&pn=${pn}&rn=30&rformat=json&encoding=utf8`;
  const text = await httpGet(url, 12000, { Referer: 'https://www.kuwo.cn/' });
  // 酷我有时返回非严格 JSON
  const jsonText = text.replace(/'/g, '"');
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    data = JSON.parse(text);
  }
  const list = data?.abslist || data?.list || [];
  const total = Number(data?.TOTAL || data?.total || list.length) || list.length;
  const songs = list
    .map((s) => {
      const rid = String(s.MUSICRID || s.rid || s.id || '')
        .replace(/^MUSIC_/i, '')
        .trim();
      const name = decodeText(s.SONGNAME || s.name || s.songname || '未知');
      const artist = decodeText(s.ARTIST || s.artist || s.singer || '未知');
      const album = decodeText(s.ALBUM || s.album || '');
      const duration = Number(s.DURATION || s.duration || 0) || 0;
      let cover = s.web_albumpic_short || s.hts_MVPIC || s.img || s.pic || null;
      if (cover && !/^https?:/i.test(cover)) {
        // 酷我封面路径
        const pic = String(cover).replace(/^\/+/, '');
        cover = pic.includes('http')
          ? pic
          : `https://img2.kuwo.cn/star/albumcover/${pic}`;
      }
      cover = normalizeCover(cover);
      return {
        id: `kw:${rid}`,
        name,
        artist,
        album,
        duration,
        coverUrl: cover,
        source: 'kw',
        songId: `kw:${rid}`,
        qualities: ['320k', '128k', 'flac'],
        fee: 0,
        playableHint: 'ok',
        platform: 'kw',
        platformLabel: PLATFORM_LABEL.kw,
      };
    })
    .filter((s) => s.songId !== 'kw:');
  return { songs: rankByKeyword(songs, keyword), total, page, perPage: 30, platform: 'kw' };
}

/** 酷狗 */
async function searchKugou(keyword, page = 1) {
  const url =
    `http://mobilecdn.kugou.com/api/v3/search/song?format=json` +
    `&keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=30`;
  const text = await httpGet(url, 12000);
  const data = JSON.parse(text);
  const list = data?.data?.info || [];
  const total = Number(data?.data?.total || list.length) || list.length;
  const songs = list
    .map((s) => {
      const hash = String(s.hash || s.Hash || '').toLowerCase();
      const name = decodeText(
        s.songname || s.songName || s.filename?.split(' - ').pop() || '未知'
      );
      const artist = decodeText(
        s.singername || s.singerName || s.filename?.split(' - ')[0] || '未知'
      );
      const album = decodeText(s.album_name || s.albumName || '');
      const duration = Number(s.duration || s.timeLength || 0) || 0;
      let cover = s.trans_param?.union_cover || s.album_sizable_cover || null;
      if (cover) cover = String(cover).replace(/\{size\}/g, '240');
      cover = normalizeCover(cover);
      return {
        id: `kg:${hash}`,
        name,
        artist,
        album,
        duration,
        coverUrl: cover,
        source: 'kg',
        songId: `kg:${hash}`,
        hash,
        qualities: ['320k', '128k', 'flac'],
        fee: 0,
        playableHint: 'ok',
        platform: 'kg',
        platformLabel: PLATFORM_LABEL.kg,
      };
    })
    .filter((s) => s.hash);
  return { songs: rankByKeyword(songs, keyword), total, page, perPage: 30, platform: 'kg' };
}

/** QQ 音乐 */
async function searchQQ(keyword, page = 1) {
  const url =
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=${page}&n=30` +
    `&w=${encodeURIComponent(keyword)}&format=json&inCharset=utf-8&outCharset=utf-8`;
  const text = await httpGet(url, 12000, {
    Referer: 'https://y.qq.com/',
    Origin: 'https://y.qq.com',
  });
  // 有时包一层 callback
  const jsonText = text.replace(/^\w+\(|\)$/g, '');
  const data = JSON.parse(jsonText);
  const list = data?.data?.song?.list || [];
  const total = Number(data?.data?.song?.totalnum || list.length) || list.length;
  const songs = list
    .map((s) => {
      const mid = String(s.songmid || s.mid || '');
      const name = decodeText(s.songname || s.name || '未知');
      const artist = decodeText(
        (s.singer || []).map((x) => x.name).filter(Boolean).join(' / ') || '未知'
      );
      const album = decodeText(s.albumname || s.album?.name || '');
      const duration = Number(s.interval || s.duration || 0) || 0;
      const albumMid = s.albummid || s.album?.mid;
      let cover = albumMid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`
        : null;
      cover = normalizeCover(cover);
      const pay = s.pay || {};
      const maybeVip = pay.pay_play === 1 || pay.pay_month === 1;
      return {
        id: `tx:${mid}`,
        name,
        artist,
        album,
        duration,
        coverUrl: cover,
        source: 'tx',
        songId: `tx:${mid}`,
        strMediaMid: s.strMediaMid || mid,
        qualities: ['320k', '128k', 'flac'],
        fee: maybeVip ? 1 : 0,
        playableHint: maybeVip ? 'maybe_vip' : 'ok',
        platform: 'tx',
        platformLabel: PLATFORM_LABEL.tx,
      };
    })
    .filter((s) => s.songId !== 'tx:');
  return { songs: rankByKeyword(songs, keyword), total, page, perPage: 30, platform: 'tx' };
}

/**
 * 按关键词重排：歌名/歌手更贴合、非 remix 优先
 */
function rankByKeyword(songs, keyword) {
  if (!Array.isArray(songs) || !songs.length) return songs || [];
  const raw = String(keyword || '').trim().toLowerCase();
  if (!raw) return songs;
  const tokens = raw.split(/\s+/).filter(Boolean);
  const score = (s) => {
    const name = String(s.name || '').toLowerCase();
    const artist = String(s.artist || '').toLowerCase();
    let sc = 0;
    for (const t of tokens) {
      if (name === t) sc += 40;
      else if (name.includes(t)) sc += 20;
      if (artist.includes(t)) sc += 25;
    }
    // 惩罚 remix / 翻唱 / DJ / live 片段
    if (/remix|翻唱|dj|cover|伴奏|纯音乐|片段|live|改编|montagem/i.test(name + artist)) {
      sc -= 30;
    }
    if (s.playableHint === 'maybe_vip') sc -= 2;
    if (s.coverUrl) sc += 1;
    if (s.duration > 60) sc += 2;
    return sc;
  };
  return [...songs].sort((a, b) => score(b) - score(a));
}

const SEARCHERS = {
  wy: searchNetease,
  kw: searchKuwo,
  kg: searchKugou,
  tx: searchQQ,
};

/**
 * 并行搜多个平台
 * @returns {Promise<Array<{ id: string, result: object }>>}
 */
async function searchAllPlatforms(keyword, page = 1, timeoutMs = 8000, platforms = ['wy', 'kw', 'kg', 'tx']) {
  const tasks = platforms.map(async (p) => {
    const fn = SEARCHERS[p];
    if (!fn) return null;
    try {
      const result = await Promise.race([fn(keyword, page), sleepReject(timeoutMs, `${p} timeout`)]);
      return { id: p, result };
    } catch (e) {
      console.warn(`[catalog] ${p} search failed:`, e.message || e);
      return null;
    }
  });
  const settled = await Promise.all(tasks);
  return settled.filter(Boolean);
}

/**
 * 按歌名+歌手在其它平台找候选（用于换源）
 * 默认优先顺序：酷我 → 酷狗 → QQ → 网易（付费曲酷我命中率最高）
 */
async function findAlternatives(name, artist, excludePlatform, limit = 5) {
  const keyword = [name, artist].filter(Boolean).join(' ').trim() || name;
  if (!keyword) return [];
  // 始终把酷我放最前；exclude 掉原平台
  const platforms = ['kw', 'kg', 'tx', 'wy'].filter((p) => p !== excludePlatform);
  const batches = await searchAllPlatforms(keyword, 1, 7000, platforms);
  const out = [];
  const seen = new Set();
  const nameL = String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  const artistL = String(artist || '').toLowerCase();
  const artistCore = artistL.split(/[\/、,&|]/)[0].trim();

  const scoreSong = (song) => {
    const sn = String(song.name || '')
      .toLowerCase()
      .replace(/\s+/g, '');
    const sa = String(song.artist || '').toLowerCase();
    let score = 0;
    if (sn === nameL) score += 50;
    else if (sn.includes(nameL) || nameL.includes(sn)) score += 30;
    else score -= 20;
    if (artistCore && (sa.includes(artistCore) || artistCore.includes(sa.split(/[\/、,&]/)[0]))) {
      score += 20;
    }
    // 平台偏好
    const pr = { kw: 8, kg: 6, tx: 4, wy: 0 };
    score += pr[song.platform] || 0;
    if (song.playableHint === 'maybe_vip') score -= 5;
    return score;
  };

  const pool = [];
  for (const batch of batches) {
    for (const song of batch.result.songs || []) {
      const key = song.songId || `${song.source}:${song.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(song);
    }
  }

  pool.sort((a, b) => scoreSong(b) - scoreSong(a));
  for (const song of pool) {
    if (scoreSong(song) < 10 && out.length >= 2) continue;
    out.push(song);
    if (out.length >= limit) break;
  }

  // 仍不足：各平台前 2 条硬塞
  if (out.length < Math.min(3, limit)) {
    for (const batch of batches) {
      for (const song of (batch.result.songs || []).slice(0, 2)) {
        if (!out.find((x) => x.songId === song.songId)) out.push(song);
        if (out.length >= limit) break;
      }
    }
  }
  return out.slice(0, limit);
}

module.exports = {
  PLATFORM_LABEL,
  SEARCHERS,
  searchNetease,
  searchKuwo,
  searchKugou,
  searchQQ,
  searchAllPlatforms,
  findAlternatives,
};
