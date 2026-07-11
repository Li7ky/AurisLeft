const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getAppDataDir } = require('./appPaths.cjs');

const EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma']);

let mmPromise = null;
function getMusicMetadata() {
  if (!mmPromise) {
    mmPromise = import('music-metadata')
      .then((mod) => mod)
      .catch(() => false);
  }
  return mmPromise;
}

function walkFiles(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (EXTS.has(ext)) out.push(full);
    }
  }
  return out;
}

function coverCacheDir() {
  const dir = path.join(getAppDataDir(), 'covers');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function toAurisLocalUrl(filePath) {
  const encoded = Buffer.from(filePath, 'utf8').toString('base64url');
  return `aurislocal://media/${encoded}`;
}

function saveEmbeddedCover(filePath, picture) {
  if (!picture?.data) return null;
  try {
    const fmt = String(picture.format || 'image/jpeg').toLowerCase();
    const ext = fmt.includes('png') ? 'png' : fmt.includes('webp') ? 'webp' : 'jpg';
    const hash = crypto.createHash('md5').update(filePath).digest('hex');
    const coverPath = path.join(coverCacheDir(), `${hash}.${ext}`);
    if (!fs.existsSync(coverPath)) {
      fs.writeFileSync(coverPath, Buffer.from(picture.data));
    }
    return toAurisLocalUrl(coverPath);
  } catch {
    return null;
  }
}

function fallbackMeta(filePath, st) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const title = path.basename(filePath, path.extname(filePath));
  return {
    filePath,
    title,
    artist: '未知艺人',
    album: '未知专辑',
    duration: 0,
    fileSize: st.size,
    format: ext || 'unknown',
    coverUrl: null,
  };
}

async function readMeta(filePath) {
  const st = fs.statSync(filePath);
  const parser = await getMusicMetadata();
  if (!parser || !parser.parseFile) return fallbackMeta(filePath, st);

  try {
    const metadata = await parser.parseFile(filePath, { duration: true });
    const common = metadata.common || {};
    const format = metadata.format || {};
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const pic = Array.isArray(common.picture) ? common.picture[0] : null;
    const coverUrl = pic ? saveEmbeddedCover(filePath, pic) : null;
    return {
      filePath,
      title: common.title || path.basename(filePath, path.extname(filePath)),
      artist: (common.artist || (common.artists || []).join(' / ') || '未知艺人').toString(),
      album: common.album || '未知专辑',
      duration: Math.round(format.duration || 0),
      fileSize: st.size,
      format: ext || format.container || 'unknown',
      coverUrl,
    };
  } catch {
    return fallbackMeta(filePath, st);
  }
}

/**
 * Parse sibling .lrc next to audio file (same basename).
 */
function loadLocalLrc(filePath) {
  const base = filePath.replace(/\.[^.]+$/, '');
  const candidates = [`${base}.lrc`, `${base}.LRC`];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const text = fs.readFileSync(p, 'utf8');
      return parseLrc(text);
    } catch {
      /* try next */
    }
  }
  return { lines: [], metadata: null };
}

function parseLrc(text) {
  const lines = [];
  const meta = { title: null, artist: null, album: null, by: null };
  const re = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\](.*)/g;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const tag = line.match(/^\[(ti|ar|al|by):(.*)\]$/i);
    if (tag) {
      const k = tag[1].toLowerCase();
      const v = tag[2].trim();
      if (k === 'ti') meta.title = v;
      if (k === 'ar') meta.artist = v;
      if (k === 'al') meta.album = v;
      if (k === 'by') meta.by = v;
      continue;
    }
    let m;
    const localRe = new RegExp(re.source, 'g');
    const texts = [];
    let lastText = '';
    while ((m = localRe.exec(line)) !== null) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
      const time = min * 60 + sec + frac / 1000;
      lastText = (m[4] || '').trim();
      texts.push({ time, text: lastText });
    }
    if (texts.length) {
      // multi-timestamp one line: same lyric text
      for (const t of texts) {
        lines.push({ time: t.time, text: lastText || t.text });
      }
    }
  }
  lines.sort((a, b) => a.time - b.time);
  const hasMeta = meta.title || meta.artist || meta.album || meta.by;
  return { lines, metadata: hasMeta ? meta : null };
}

async function scanDirs(dirs) {
  const files = [];
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    walkFiles(dir, files);
  }

  const songs = [];
  const batch = 12;
  for (let i = 0; i < files.length; i += batch) {
    const chunk = files.slice(i, i + batch);
    const part = await Promise.all(chunk.map((f) => readMeta(f)));
    songs.push(...part);
  }

  songs.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  return songs;
}

module.exports = { scanDirs, loadLocalLrc, parseLrc };
