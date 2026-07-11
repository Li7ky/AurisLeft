/**
 * Built-in free play URL resolvers (no LX script).
 * Used as high-priority fallbacks when community scripts fail on VIP/paid tracks.
 */
const { pickMediaHeaders } = require('./mediaHeaders.cjs');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function bareId(songId, prefix) {
  return String(songId || '')
    .replace(new RegExp(`^${prefix}[:/]`, 'i'), '')
    .replace(/^MUSIC_/i, '')
    .trim();
}

async function httpText(url, headers = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, ...headers },
      redirect: 'follow',
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, finalUrl: res.url };
  } finally {
    clearTimeout(timer);
  }
}

function pickUrlFromJson(data) {
  if (!data) return null;
  if (typeof data === 'string' && /^https?:\/\//i.test(data)) return data;
  return (
    data.url ||
    data.data?.url ||
    data.data?.audio ||
    data.data?.[0]?.url ||
    (typeof data.data === 'string' && /^https?:/.test(data.data) ? data.data : null)
  );
}

/**
 * Soft-probe: Range GET first 2KB, reject HTML error pages.
 */
async function probePlayableUrl(url) {
  if (!url || !/^https?:\/\//i.test(String(url))) return null;
  const target = String(url);
  try {
    const headers = {
      ...pickMediaHeaders(target),
      Range: 'bytes=0-2047',
      'User-Agent': UA,
    };
    const res = await fetch(target, { headers, redirect: 'follow' });
    if (!(res.ok || res.status === 206)) {
      // some CDNs reject Range — still accept if 200-ish path looks like media
      if (res.status === 403 || res.status === 404) return null;
    }
    const finalUrl = (res.url || target).replace(/^http:/i, 'https:');
    if (/404|\/html|error/i.test(finalUrl) && !/\.mp3|\.m4a|\.flac/i.test(finalUrl)) {
      // keep going, check body
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4) {
      // empty with Range fail — accept CDN-looking URL
      if (/\.mp3|\.m4a|\.flac|kuwo|kugou|music\.126|qqmusic|myqcloud/i.test(target)) {
        return target;
      }
      return null;
    }
    const head = buf.slice(0, 80).toString('utf8').toLowerCase();
    if (head.includes('<!doctype') || head.includes('<html') || head.includes('<script')) {
      return null;
    }
    const isId3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
    const isMp3 = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
    const isFlac = buf.slice(0, 4).toString('ascii') === 'fLaC';
    const isOgg = buf.slice(0, 4).toString('ascii') === 'OggS';
    const isFtyp = buf.slice(4, 8).toString('ascii') === 'ftyp';
    if (isId3 || isMp3 || isFlac || isOgg || isFtyp) return res.url || target;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('audio') || ct.includes('octet-stream') || ct.includes('mpeg')) {
      return res.url || target;
    }
    if (/\.mp3|\.m4a|\.flac|\.aac/i.test(res.url || target)) return res.url || target;
    // Kuwo/kg CDN paths often work even without classic magic bytes after Range
    if (/kuwo\.cn|kugou|music\.126|gtimg|myqcloud|qqmusic/i.test(res.url || target)) {
      return res.url || target;
    }
    return null;
  } catch {
    // Network flaky — still return URL for player to try
    return target;
  }
}

/**
 * 酷我：antiserver / mobi 直链（对大量「会员曲」仍可出链）
 */
async function resolveKuwo(songId, quality = '320k') {
  const rid = bareId(songId, 'kw');
  if (!rid || !/^\d+$/.test(rid)) return null;

  const br = String(quality).includes('flac')
    ? '2000kflac'
    : String(quality).includes('128')
      ? '128kmp3'
      : '320kmp3';

  const endpoints = [
    `http://antiserver.kuwo.cn/anti.s?type=convert_url3&rid=${rid}&format=mp3&response=url&br=${br}`,
    `https://antiserver.kuwo.cn/anti.s?type=convert_url3&rid=${rid}&format=mp3&response=url&br=${br}`,
    `http://antiserver.kuwo.cn/anti.s?type=convert_url3&rid=MUSIC_${rid}&format=mp3&response=url&br=${br}`,
    `https://mobi.kuwo.cn/mobi.s?f=web&type=convert_url_with_sign&rid=${rid}&br=${br}`,
  ];

  for (const ep of endpoints) {
    try {
      const { text } = await httpText(
        ep,
        { Referer: 'https://www.kuwo.cn/', Origin: 'https://www.kuwo.cn' },
        10000
      );
      let url = null;
      const trimmed = text.trim();
      if (/^https?:\/\//i.test(trimmed)) {
        url = trimmed.split(/\s/)[0];
      } else {
        try {
          const data = JSON.parse(trimmed);
          url = pickUrlFromJson(data);
        } catch {
          const m = trimmed.match(/https?:\/\/[^\s"'<>]+/);
          if (m) url = m[0];
        }
      }
      if (url && /^https?:\/\//i.test(url) && !/illegal|error/i.test(url)) {
        const ok = await probePlayableUrl(url);
        if (ok) {
          console.log('[native] kuwo hit', rid, String(ok).slice(0, 80));
          return ok;
        }
      }
    } catch (e) {
      console.warn('[native] kuwo try fail', e.message || e);
    }
  }
  return null;
}

/**
 * 酷狗：公开 track info（部分 hash 可用）
 */
async function resolveKugou(songId, hash) {
  const h = String(hash || bareId(songId, 'kg') || '').toLowerCase();
  if (!h || h.length < 8) return null;

  const endpoints = [
    `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${h}`,
    `http://trackercdn.kugou.com/i/v2/?cmd=23&hash=${h}&key=${h}&pid=1&behavior=play&appid=1001`,
  ];

  for (const ep of endpoints) {
    try {
      const { text } = await httpText(ep, { Referer: 'https://www.kugou.com/' }, 10000);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }
      const url =
        data?.url ||
        data?.data?.url ||
        data?.data?.play_url ||
        data?.data?.play_backup_url ||
        (Array.isArray(data?.data) ? data.data[0]?.url : null);
      if (url && /^https?:\/\//i.test(url)) {
        const ok = await probePlayableUrl(url);
        if (ok) {
          console.log('[native] kugou hit', h.slice(0, 12), String(ok).slice(0, 80));
          return ok;
        }
      }
    } catch (e) {
      console.warn('[native] kugou try fail', e.message || e);
    }
  }
  return null;
}

/**
 * 按平台尝试原生取链
 */
async function resolveNative(platform, songId, musicInfo = {}, quality = '320k') {
  const p = String(platform || '').toLowerCase();
  if (p === 'kw') {
    return resolveKuwo(musicInfo.songmid || musicInfo.id || songId, quality);
  }
  if (p === 'kg') {
    return resolveKugou(songId, musicInfo.hash || musicInfo.songmid);
  }
  return null;
}

module.exports = {
  resolveKuwo,
  resolveKugou,
  resolveNative,
  probePlayableUrl,
};
