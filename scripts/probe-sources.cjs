/**
 * 逐通道探测：哪些播放取链通道真正能出链
 * 运行: npx electron scripts/probe-sources.cjs
 */
const path = require('path');
const { app } = require('electron');
process.chdir(path.join(__dirname, '..'));

const nativePlay = require('../electron/services/nativePlay.cjs');
const catalogSearch = require('../electron/services/catalogSearch.cjs');
const nkiQq = require('../electron/services/nkiQq.cjs');

// 用固定热门曲元数据测各通道
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
          /薛之谦/.test(s.artist) &&
          /演员/.test(s.name) &&
          !/remix|dj|翻唱|片段/i.test(s.name + s.artist)
      ) || songs[0];
    if (hit) by[b.id] = hit;
  }
  return by;
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
  console.log('=== 播放通道可用性探测 ===\n');
  console.log('[1] 准备测试曲目元数据…');
  const fixtures = await pickFixtures();
  for (const [p, s] of Object.entries(fixtures)) {
    console.log(`    ${p}: ${s.name} - ${s.artist} (${s.songId})`);
  }
  if (!Object.keys(fixtures).length) {
    console.log('    搜索失败，退出');
    app.exit(1);
    return;
  }

  const rows = [];
  const row = { name: '西瓜糖 nkiQq', results: {} };

  console.log('\n[2] 西瓜糖 nkiQq 通道…\n');
  if (!nkiQq.isEnabled()) {
    row.results.tx = '未启用（缺 API key）';
    console.log('  跳过：nkiQq 未启用（未配置 API key）');
  } else {
    const tx = fixtures.tx;
    if (tx) {
      const mid = String(tx.songId || '').replace(/^tx[:/]/i, '');
      const t0 = Date.now();
      try {
        const res = await nkiQq.resolvePlayUrl({
          mid,
          name: tx.name,
          artist: tx.artist,
          quality: '320k',
        });
        const url = typeof res === 'string' ? res : res?.url || null;
        const ok = url && (await probeUrl(url));
        row.results.tx = ok ? `OK ${Date.now() - t0}ms` : 'FAIL';
        console.log(`  [${ok ? 'OK' : 'FAIL'}] nkiQq mid        tx  ${Date.now() - t0}ms  ${String(url || '').slice(0, 70)}`);
      } catch (e) {
        row.results.tx = `FAIL ${Date.now() - t0}ms`;
        console.log('  [FAIL] nkiQq mid', e.message || e);
      }
    } else {
      row.results.tx = '无测试曲';
    }
    if (fixtures.kw && nkiQq.isEnabled()) {
      const s = fixtures.kw;
      const t0 = Date.now();
      try {
        const res = await nkiQq.resolveBySearch(s.name, s.artist, '320k');
        const url = typeof res === 'string' ? res : res?.url || null;
        const ok = url && (await probeUrl(url));
        row.results.kw = ok ? `OK ${Date.now() - t0}ms` : 'FAIL';
        console.log(`  [${ok ? 'OK' : 'FAIL'}] nkiQq 歌名搜索   kw  ${Date.now() - t0}ms  ${String(url || '').slice(0, 70)}`);
      } catch (e) {
        row.results.kw = `FAIL ${Date.now() - t0}ms`;
        console.log('  [FAIL] nkiQq 歌名搜索', e.message || e);
      }
    }
  }
  rows.push(row);

  // 原生兜底
  console.log('\n[3] 原生直链通道…\n');
  const nativeRow = { name: '原生酷我/酷狗', results: {} };
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
  rows.push(nativeRow);

  console.log('\n========== 汇总 ==========');
  console.log(
    '通道'.padEnd(18) +
      'kw'.padEnd(14) +
      'kg'.padEnd(14) +
      'tx'.padEnd(14)
  );
  console.log('-'.repeat(60));
  for (const r of rows) {
    const cell = (p) => String(r.results[p] || '—').padEnd(14);
    console.log(`${r.name.slice(0, 16).padEnd(18)}${cell('kw')}${cell('kg')}${cell('tx')}`);
  }

  console.log('\n说明: OK=取到可探测音频链; FAIL=报错/空链; —=不支持该平台');
  console.log('测试曲: 演员-薛之谦（各平台对应 ID）\n');

  app.exit(0);
});

app.on('window-all-closed', (e) => e.preventDefault());
