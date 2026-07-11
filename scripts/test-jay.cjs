const path = require('path');
const { app } = require('electron');
process.chdir(path.join(__dirname, '..'));

app.whenReady().then(async () => {
  const nki = require('../electron/services/nkiQq.cjs');
  const { SourceManager } = require('../electron/services/sources.cjs');
  const mgr = new SourceManager();

  console.log('1) search 周杰伦');
  const t0 = Date.now();
  const list = await nki.searchSongs('周杰伦', 12);
  console.log(
    '  songs',
    list.length,
    'ms',
    Date.now() - t0,
    'withCover',
    list.filter((s) => s.coverUrl).length,
    'withDur',
    list.filter((s) => s.duration > 0).length
  );
  console.log(
    '  sample',
    list.slice(0, 3).map((s) => `${s.name} dur=${s.duration} cover=${!!s.coverUrl}`)
  );

  console.log('2) play each of first 6');
  for (const s of list.slice(0, 6)) {
    const t = Date.now();
    try {
      const url = await mgr.getMusicUrl(s.songId, '320k', 'tx', {
        name: s.name,
        artist: s.artist,
        strMediaMid: s.strMediaMid,
        source: 'tx',
        platform: 'tx',
      });
      console.log('  OK', s.name, Date.now() - t + 'ms', String(url).slice(0, 50));
    } catch (e) {
      console.log('  FAIL', s.name, e.message);
    }
  }

  console.log('3) rapid switch');
  const jobs = list.slice(0, 4).map((s, i) =>
    new Promise((r) => setTimeout(r, i * 100)).then(() =>
      nki
        .resolvePlayUrl({
          mid: s.strMediaMid,
          name: s.name,
          artist: s.artist,
          quality: '320k',
        })
        .then((x) => ({ name: s.name, ok: !!(x && (x.url || x)) }))
        .catch((e) => ({ name: s.name, err: e.code || e.message }))
    )
  );
  console.log('  ', await Promise.all(jobs));

  app.exit(0);
});
