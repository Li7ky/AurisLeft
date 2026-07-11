/**
 * 取链自测：优先挑网易 fee/VIP 曲，走完整 SourceManager.getMusicUrl
 * 运行: npx electron scripts/test-play-sources.cjs
 */
const path = require('path');
const { app } = require('electron');

// 保证从项目根加载
process.chdir(path.join(__dirname, '..'));

const CASES = [
  { keyword: '晴天 周杰伦', note: '杰伦热门' },
  { keyword: '告白气球 周杰伦', note: '杰伦热门2' },
  { keyword: '夜曲 周杰伦', note: '杰伦可能VIP' },
  { keyword: '孤勇者 陈奕迅', note: '热门影视' },
  { keyword: '起风了 买辣椒也用券', note: '热门翻唱' },
  { keyword: '句号 邓紫棋', note: 'GEM' },
  { keyword: '演员 薛之谦', note: '薛之谦' },
  { keyword: '稻香 周杰伦', note: '杰伦免费向' },
];

async function pickSong(catalogSearch, keyword) {
  const batches = await catalogSearch.searchAllPlatforms(keyword, 1, 9000, [
    'wy',
    'kw',
    'kg',
    'tx',
  ]);
  const all = [];
  for (const b of batches) {
    for (const s of b.result.songs || []) all.push(s);
  }
  const tokens = String(keyword)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const fit = (s) => {
    const blob = `${s.name} ${s.artist}`.toLowerCase();
    return tokens.every((t) => blob.includes(t));
  };
  const notRemix = (s) =>
    !/remix|翻唱|dj|cover|montagem|片段|伴奏/i.test(`${s.name} ${s.artist}`);

  // 优先：贴合关键词 + 网易 VIP
  const vip = all.find(
    (s) =>
      s.platform === 'wy' &&
      fit(s) &&
      notRemix(s) &&
      (s.playableHint === 'maybe_vip' || s.fee === 1 || s.fee === 4 || s.fee === 8)
  );
  if (vip) return { song: vip, tag: 'wy-vip' };
  // 贴合的网易
  const wy = all.find((s) => s.platform === 'wy' && fit(s) && notRemix(s));
  if (wy) return { song: wy, tag: `wy-fee${wy.fee ?? '?'}` };
  // 贴合酷我（对付费最稳）
  const kw = all.find((s) => s.platform === 'kw' && fit(s) && notRemix(s));
  if (kw) return { song: kw, tag: 'kw' };
  // 网易 VIP 任意
  const vipAny = all.find(
    (s) =>
      s.platform === 'wy' &&
      (s.playableHint === 'maybe_vip' || s.fee === 1 || s.fee === 4 || s.fee === 8)
  );
  if (vipAny) return { song: vipAny, tag: 'wy-vip-loose' };
  return { song: all[0] || null, tag: 'any' };
}

async function probe(url) {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-1023', 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const head = buf.slice(0, 40).toString('utf8').toLowerCase();
    if (head.includes('<html') || head.includes('<!doctype')) return false;
    return res.ok || res.status === 206 || buf.length > 0;
  } catch {
    return false;
  }
}

app.whenReady().then(async () => {
  const catalogSearch = require('../electron/services/catalogSearch.cjs');
  const { SourceManager } = require('../electron/services/sources.cjs');

  console.log('=== AurisLeft source play test ===');
  const mgr = new SourceManager();
  console.log('[test] warming LX sources...');
  await mgr.ensureLxBuiltin();
  const st = await mgr.getLxStatus();
  console.log(`[test] LX ready count=${st.count}/${st.total} names=${st.names.join(',')}`);

  const results = [];

  for (const c of CASES) {
    process.stdout.write(`\n>> ${c.keyword} (${c.note})\n`);
    try {
      const { song, tag } = await pickSong(catalogSearch, c.keyword);
      if (!song) {
        console.log('  SEARCH FAIL: no results');
        results.push({ ...c, ok: false, reason: 'no search' });
        continue;
      }
      console.log(
        `  pick [${tag}] ${song.platform} ${song.name} - ${song.artist} id=${song.songId} fee=${song.fee ?? '-'} hint=${song.playableHint || '-'}`
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
      const ms = Date.now() - t0;
      const playable = await probe(url);
      console.log(`  URL (${ms}ms) playable=${playable} ${String(url).slice(0, 120)}`);
      results.push({
        ...c,
        ok: Boolean(url && playable),
        song: `${song.name} - ${song.artist}`,
        platform: song.platform,
        tag,
        ms,
        url: String(url).slice(0, 100),
      });
    } catch (e) {
      console.log('  PLAY FAIL:', e.message || e);
      results.push({ ...c, ok: false, reason: e.message || String(e) });
    }
  }

  console.log('\n========== SUMMARY ==========');
  let pass = 0;
  for (const r of results) {
    const mark = r.ok ? 'OK  ' : 'FAIL';
    if (r.ok) pass += 1;
    console.log(
      `${mark} | ${r.keyword} | ${r.song || r.reason || ''} | ${r.platform || ''} | ${r.ms || 0}ms`
    );
  }
  console.log(`\nPassed ${pass}/${results.length}`);
  // exit code 0 if majority ok
  app.exit(pass >= Math.ceil(results.length * 0.6) ? 0 : 1);
});

app.on('window-all-closed', (e) => e.preventDefault());
