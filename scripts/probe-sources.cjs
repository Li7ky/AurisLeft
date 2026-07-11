/**
 * 逐源探测：哪些内置音源真正能出链
 * 运行: npx electron scripts/probe-sources.cjs
 */
const path = require('path');
const { app } = require('electron');
process.chdir(path.join(__dirname, '..'));

const nativePlay = require('../electron/services/nativePlay.cjs');
const catalogSearch = require('../electron/services/catalogSearch.cjs');

// 用固定热门曲元数据测各平台
async function pickFixtures() {
  const batches = await catalogSearch.searchAllPlatforms('演员 薛之谦', 1, 10000, [
    'wy',
    'kw',
    'kg',
    'tx',
  ]);
  const by = {};
  for (const b of batches) {
    const songs = b.result?.songs || [];
    // 优先原唱贴合
    const hit =
      songs.find(
        (s) =>
          /薛之谦|薛之谦/.test(s.artist) &&
          /演员/.test(s.name) &&
          !/remix|dj|翻唱|片段/i.test(s.name + s.artist)
      ) || songs[0];
    if (hit) by[b.id] = hit;
  }
  return by;
}

function buildInfo(song, platform) {
  const bare = String(song.songId || '').replace(/^(wy|kw|kg|tx|mg)[:/]/i, '');
  return {
    songmid: bare,
    songId: bare,
    id: bare,
    hash: song.hash || (platform === 'kg' ? bare : undefined),
    strMediaMid: song.strMediaMid,
    name: song.name,
    singer: song.artist,
    albumName: song.album || '',
    interval: song.duration
      ? `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, '0')}`
      : undefined,
    img: song.coverUrl,
    types: [],
    _types: {},
    typeUrl: {},
  };
}

async function probeUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const r = await fetch(url, {
      headers: { Range: 'bytes=0-1023', 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const head = buf.slice(0, 40).toString('utf8').toLowerCase();
    if (head.includes('<html') || head.includes('<!doctype')) return false;
    return r.ok || r.status === 206 || buf.length > 0;
  } catch {
    return false;
  }
}

app.whenReady().then(async () => {
  const { SourceManager } = require('../electron/services/sources.cjs');
  const mgr = new SourceManager();
  console.log('=== 音源可用性探测 ===\n');
  console.log('[1] 初始化内置音源…');
  await mgr.ensureLxBuiltin();
  const st = await mgr.getLxStatus();
  console.log(`    就绪 ${st.count}/${st.total}: ${st.names.join(', ') || '无'}\n`);

  console.log('[2] 准备测试曲目元数据…');
  const fixtures = await pickFixtures();
  for (const [p, s] of Object.entries(fixtures)) {
    console.log(`    ${p}: ${s.name} - ${s.artist} (${s.songId})`);
  }
  if (!Object.keys(fixtures).length) {
    console.log('    搜索失败，退出');
    app.exit(1);
    return;
  }

  const hosts = mgr.lxEngine.hosts.filter((h) => h.ready);
  const platforms = ['kw', 'kg', 'tx', 'wy'];
  const rows = [];

  console.log('\n[3] 逐源 × 平台取链…\n');

  for (const host of hosts) {
    const name = host.header.name;
    const plats = Object.keys(host.sources || {});
    const row = {
      id: host.id,
      name,
      enabled: host.enabled !== false,
      plats,
      results: {},
    };

    for (const p of platforms) {
      if (!plats.includes(p)) {
        row.results[p] = '—';
        continue;
      }
      if (!fixtures[p]) {
        row.results[p] = '无测试曲';
        continue;
      }
      const info = buildInfo(fixtures[p], p);
      const t0 = Date.now();
      try {
        const url = await host.getMusicUrl(p, info, '320k');
        const ok = await probeUrl(url);
        const ms = Date.now() - t0;
        row.results[p] = ok ? `OK ${ms}ms` : `链无效 ${ms}ms`;
        console.log(
          `  [${ok ? 'OK' : 'BAD'}] ${name.padEnd(16)} ${p} ${ms}ms  ${String(url).slice(0, 70)}`
        );
      } catch (e) {
        const ms = Date.now() - t0;
        const msg = (e.message || String(e)).replace(/\s+/g, ' ').slice(0, 60);
        row.results[p] = `FAIL ${ms}ms`;
        console.log(`  [FAIL] ${name.padEnd(16)} ${p} ${ms}ms  ${msg}`);
      }
    }
    rows.push(row);
  }

  // 原生兜底
  console.log('\n[4] 内置原生兜底（不依赖洛雪脚本）…\n');
  const nativeRow = { name: '原生兜底', results: {} };
  if (fixtures.kw) {
    const rid = String(fixtures.kw.songId).replace(/^kw[:/]/i, '');
    const t0 = Date.now();
    try {
      const url = await nativePlay.resolveKuwo(rid, '320k');
      const ok = url && (await probeUrl(url));
      nativeRow.results.kw = ok ? `OK ${Date.now() - t0}ms` : 'FAIL';
      console.log(`  [${ok ? 'OK' : 'FAIL'}] 原生酷我          kw  ${String(url || '').slice(0, 70)}`);
    } catch (e) {
      nativeRow.results.kw = 'FAIL';
      console.log('  [FAIL] 原生酷我', e.message);
    }
  }
  if (fixtures.kg) {
    const t0 = Date.now();
    try {
      const url = await nativePlay.resolveKugou(fixtures.kg.songId, fixtures.kg.hash);
      const ok = url && (await probeUrl(url));
      nativeRow.results.kg = ok ? `OK ${Date.now() - t0}ms` : 'FAIL';
      console.log(`  [${ok ? 'OK' : 'FAIL'}] 原生酷狗          kg  ${String(url || '').slice(0, 70)}`);
    } catch (e) {
      nativeRow.results.kg = 'FAIL';
      console.log('  [FAIL] 原生酷狗', e.message);
    }
  }

  console.log('\n========== 汇总 ==========');
  console.log(
    '音源'.padEnd(18) +
      '开关'.padEnd(6) +
      'kw'.padEnd(14) +
      'kg'.padEnd(14) +
      'tx'.padEnd(14) +
      'wy'.padEnd(14) +
      '评价'
  );
  console.log('-'.repeat(90));

  for (const r of rows) {
    const okCount = platforms.filter((p) => String(r.results[p] || '').startsWith('OK')).length;
    const tryCount = platforms.filter((p) => r.plats.includes(p)).length;
    let verdict = '不可用';
    if (okCount >= 2) verdict = '推荐';
    else if (okCount === 1) verdict = '勉强可用';
    else if (okCount === 0 && tryCount) verdict = '当前不可用';

    const cell = (p) => String(r.results[p] || '—').padEnd(14);
    console.log(
      `${r.name.slice(0, 16).padEnd(18)}${(r.enabled ? '开' : '关').padEnd(6)}${cell('kw')}${cell('kg')}${cell('tx')}${cell('wy')}${verdict} (${okCount}/${tryCount})`
    );
  }
  console.log(
    `${'原生酷我/酷狗'.padEnd(18)}${'—'.padEnd(6)}${String(nativeRow.results.kw || '—').padEnd(14)}${String(nativeRow.results.kg || '—').padEnd(14)}${'—'.padEnd(14)}${'—'.padEnd(14)}${String(nativeRow.results.kw || '').startsWith('OK') ? '推荐(内置)' : '弱'}`
  );

  console.log('\n说明: OK=取到可探测音频链; FAIL=脚本报错/空链; —=不支持该平台');
  console.log('测试曲: 演员-薛之谦（各平台对应 ID）\n');

  app.exit(0);
});

app.on('window-all-closed', (e) => e.preventDefault());
