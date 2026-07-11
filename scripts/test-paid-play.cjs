/**
 * 全链路测付费曲取链（SourceManager.getMusicUrl）
 */
const path = require('path');
const { app } = require('electron');
process.chdir(path.join(__dirname, '..'));

app.whenReady().then(async () => {
  const catalog = require('../electron/services/catalogSearch.cjs');
  const { SourceManager } = require('../electron/services/sources.cjs');
  const nki = require('../electron/services/nkiQq.cjs');

  console.log('nki status', nki.getStatus());

  const mgr = new SourceManager();
  // 不依赖洛雪也能测 nki
  void mgr.ensureLxBuiltin().catch(() => {});

  const cases = [
    { q: '晴天 周杰伦', note: 'VIP杰伦' },
    { q: '演员 薛之谦', note: 'VIP薛' },
    { q: '孤勇者 陈奕迅', note: '热门' },
    { q: '句号 邓紫棋', note: 'VIP GEM' },
  ];

  for (const c of cases) {
    console.log('\n>>', c.q, c.note);
    try {
      const batches = await catalog.searchAllPlatforms(c.q, 1, 8000, ['wy', 'tx', 'kw']);
      let song = null;
      for (const b of batches) {
        for (const s of b.result.songs || []) {
          if (s.platform === 'wy' && (s.fee === 1 || s.fee === 8 || s.playableHint === 'maybe_vip')) {
            song = s;
            break;
          }
        }
        if (song) break;
      }
      if (!song) {
        for (const b of batches) {
          if (b.result.songs?.[0]) {
            song = b.result.songs[0];
            break;
          }
        }
      }
      if (!song) {
        console.log('  no search hit');
        continue;
      }
      console.log(
        `  pick ${song.platform} fee=${song.fee} ${song.name} - ${song.artist} id=${song.songId}`
      );
      const t0 = Date.now();
      const url = await mgr.getMusicUrl(song.songId, '320k', song.source || song.platform, {
        name: song.name,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        coverUrl: song.coverUrl,
        hash: song.hash,
        strMediaMid: song.strMediaMid,
        fee: song.fee,
        playableHint: song.playableHint,
        source: song.source,
      });
      console.log(`  OK ${Date.now() - t0}ms`, String(url).slice(0, 100));
    } catch (e) {
      console.log('  FAIL', e.message || e);
    }
  }
  app.exit(0);
});
