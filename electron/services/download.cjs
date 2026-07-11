const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { getDownloadsDir } = require('./appPaths.cjs');
const { pickMediaHeaders } = require('./mediaHeaders.cjs');

let downloadDir = null;

function getDownloadDir() {
  if (!downloadDir) downloadDir = getDownloadsDir();
  return downloadDir;
}

function setDownloadDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  downloadDir = dir;
}

function finalize(tmpPath, filePath, onProgress) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
  fs.renameSync(tmpPath, filePath);
  if (onProgress) onProgress(100);
  return filePath;
}

async function downloadOnce(url, tmpPath, onProgress) {
  const headers = pickMediaHeaders(url);
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);

  const total = Number(res.headers.get('content-length') || 0);

  if (res.body && typeof Readable.fromWeb === 'function') {
    let received = 0;
    const nodeStream = Readable.fromWeb(res.body);
    const out = fs.createWriteStream(tmpPath);

    nodeStream.on('data', (chunk) => {
      received += chunk.length || 0;
      if (total > 0 && onProgress) {
        onProgress(Math.min(99, Math.round((received / total) * 100)));
      }
    });

    await pipeline(nodeStream, out);
    return;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmpPath, buf);
  if (onProgress) onProgress(99);
}

/**
 * Stream download with CDN Referer headers + automatic retries.
 */
async function downloadToFile(url, filename, onProgress, options = {}) {
  const maxAttempts = Number(options.retries) > 0 ? Number(options.retries) : 3;
  const dir = getDownloadDir();
  fs.mkdirSync(dir, { recursive: true });
  const safeName = String(filename || 'download').replace(/[<>:"/\\|?*]/g, '_');
  const filePath = path.join(dir, safeName);
  const tmpPath = `${filePath}.part`;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      if (attempt > 1) {
        console.log(`[download] retry ${attempt}/${maxAttempts}`, safeName);
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
      await downloadOnce(url, tmpPath, onProgress);
      return finalize(tmpPath, filePath, onProgress);
    } catch (e) {
      lastError = e;
      console.warn(`[download] attempt ${attempt} failed:`, e.message || e);
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : `下载失败（已重试 ${maxAttempts} 次）`
  );
}

module.exports = {
  getDownloadDir,
  setDownloadDir,
  downloadToFile,
};
