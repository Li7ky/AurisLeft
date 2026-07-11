/**
 * 复现连续切歌失败
 * 运行: npx electron scripts/test-switch.cjs
 */
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { app } = require('electron');

async function probeUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const r = await fetch(url, {
      headers: {
        Range: 'bytes=0-2047',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://y.qq.com/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    const b = Buffer.from(await r.arrayBuffer());
    const head = b.slice(0, 32).toString('utf8').toLowerCase();
    if (head.includes('<html') || head.includes('<!doctype')) return false;
    return (r.ok || r.status === 206) && b.length > 0;
  } catch (e) {
    console.log('  probe err', e.message);
    return false;
  }
}

app.whenReady().then(async () => {
  const nki = require('../electron/services/nkiQq.cjs');
  const { SourceManager } = require('../electron/services/sources.cjs');
  const mgr = new SourceManager();

  console.log('status', nki.getStatus());
  const list = await nki.searchSongs('林俊杰', 8);
  console.log('search count', list.length);
  if (list[0]) console.log('first', list[0].name, list[0].songId, list[0].strMediaMid);

  let okCount = 0;
  for (const s of list.slice(0, 3)) {
    try {
      console.log('--- try', s.name, s.songId);
      const t0 = Date.now();
      const url = await mgr.getMusicUrl(s.songId, '320k', 'tx', {
        name: s.name,
        artist: s.artist,
        strMediaMid: s.strMediaMid,
        source: 'tx',
        platform: 'tx',
      });
      console.log('  url', url ? String(url).slice(0, 120) : null, 'ms', Date.now() - t0);
      const p = url && (await probeUrl(url));
      console.log('  probe', p);
      if (url && p) okCount += 1;
    } catch (e) {
      console.log('  ERR', e.message, e.code || '');
    }
  }
  console.log('RESULT', `${okCount}/3`);
  app.exit(okCount >= 2 ? 0 : 1);
});
