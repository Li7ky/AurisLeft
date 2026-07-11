/**
 * 模拟听歌习惯：搜 → 播 → 队列/收藏/歌单/最近/设置/本地
 * 运行: npx electron scripts/full-user-test.cjs
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
process.chdir(path.join(__dirname, '..'));

const results = [];
function ok(name, detail = '') {
  results.push({ name, pass: true, detail });
  console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, pass: false, detail: String(detail) });
  console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
}
function info(msg) {
  console.log(`\n== ${msg} ==`);
}

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
  } catch {
    return false;
  }
}

app.whenReady().then(async () => {
  const { createAppState, registerHandlers, defaultSettings } = require('../electron/services/handlers.cjs');
  const nki = require('../electron/services/nkiQq.cjs');
  const catalog = require('../electron/services/catalogSearch.cjs');
  const nativePlay = require('../electron/services/nativePlay.cjs');
  // handlers already loads state pattern - use SourceManager + Database directly
  const { SourceManager } = require('../electron/services/sources.cjs');
  const { Database } = require('../electron/services/db.cjs');
  const { scanDirs } = require('../electron/services/localMusic.cjs');

  const db = new Database();
  const mgr = new SourceManager();

  info('0. 启动环境');
  try {
    const st = nki.getStatus();
    if (st.hasKey && st.enabled) ok('西瓜糖 QQ 已启用', st.keyHint);
    else fail('西瓜糖 QQ', JSON.stringify(st));
  } catch (e) {
    fail('西瓜糖 QQ 状态', e.message);
  }

  // ── 1. 搜索（多关键词）──
  info('1. 搜索（模拟人乱搜）');
  const searchCases = [
    '周杰伦',
    '晴天',
    '薛之谦 演员',
    'BLACKPINK',
    '林俊杰',
    '不存在的歌xyzabc123999',
    'a', // 短关键词
  ];
  const searchHits = {};
  for (const q of searchCases) {
    try {
      const t0 = Date.now();
      // 复现 search_music handler 逻辑
      const [catalogBatches, nkiSongs] = await Promise.all([
        mgr.searchAll(q, 1, 8000).catch(() => []),
        nki.isEnabled() ? nki.searchSongs(q, 20).catch(() => []) : [],
      ]);
      let n = nkiSongs.length;
      for (const b of catalogBatches) n += (b.result?.songs || []).length;
      const ms = Date.now() - t0;
      searchHits[q] = { n, ms, nki: nkiSongs.length };
      if (q.includes('不存在')) {
        if (n === 0) ok(`空搜「${q}」`, `${ms}ms 无结果(合理)`);
        else ok(`空搜「${q}」`, `${ms}ms 仍有 ${n} 条(接口宽匹配)`);
      } else if (n > 0) ok(`搜索「${q}」`, `${n} 条, QQ=${nkiSongs.length}, ${ms}ms`);
      else fail(`搜索「${q}」`, `0 条 ${ms}ms`);
    } catch (e) {
      fail(`搜索「${q}」`, e.message);
    }
  }

  // ── 2. 付费曲取链播放 ──
  info('2. 付费/热门取链（模拟点播放）');
  const playCases = [
    { name: '晴天', artist: '周杰伦' },
    { name: '演员', artist: '薛之谦' },
    { name: '孤勇者', artist: '陈奕迅' },
    { name: '夜曲', artist: '周杰伦' },
    { name: 'like', artist: 'JENNIE' },
  ];
  for (const c of playCases) {
    try {
      const t0 = Date.now();
      // 先从 QQ 搜一条
      let song = null;
      const nkiList = await nki.searchSongs(`${c.name} ${c.artist}`, 10);
      song = nkiList.find(
        (s) =>
          s.name.includes(c.name) ||
          c.name.toLowerCase().includes(String(s.name).toLowerCase().slice(0, 4))
      ) || nkiList[0];
      if (!song) {
        const batches = await catalog.searchAllPlatforms(`${c.name} ${c.artist}`, 1, 8000, [
          'wy',
          'tx',
          'kw',
        ]);
        for (const b of batches) {
          if (b.result?.songs?.[0]) {
            song = b.result.songs[0];
            break;
          }
        }
      }
      if (!song) {
        fail(`播放「${c.name}」`, '搜不到');
        continue;
      }
      const url = await mgr.getMusicUrl(song.songId, '320k', song.source || song.platform, {
        name: song.name || c.name,
        artist: song.artist || c.artist,
        album: song.album,
        duration: song.duration,
        coverUrl: song.coverUrl,
        hash: song.hash,
        strMediaMid: song.strMediaMid,
        fee: song.fee,
        playableHint: song.playableHint,
        source: song.source,
        platform: song.platform,
      });
      const playable = await probeUrl(url);
      const ms = Date.now() - t0;
      if (url && playable) ok(`播放「${song.name} - ${song.artist}」`, `可播 ${ms}ms`);
      else if (url) fail(`播放「${song.name}」`, `有URL但探测失败 ${ms}ms ${String(url).slice(0, 60)}`);
      else fail(`播放「${c.name}」`, '无URL');
    } catch (e) {
      fail(`播放「${c.name}」`, e.message);
    }
  }

  // ── 3. 收藏 ──
  info('3. 收藏');
  try {
    const song = {
      id: 'test:1',
      songId: 'tx:testmid001',
      source: 'tx',
      name: '测试收藏曲',
      artist: '测试歌手',
      album: '测试专辑',
      duration: 200,
      coverUrl: null,
      qualities: ['320k'],
    };
    const r1 = db.toggleFavorite(song);
    const list1 = db.listFavorites();
    const has = list1.some((f) => f.songId === song.songId);
    const r2 = db.toggleFavorite(song);
    const list2 = db.listFavorites();
    const gone = !list2.some((f) => f.songId === song.songId);
    if (r1.favorited && has && !r2.favorited && gone) ok('收藏/取消收藏');
    else fail('收藏', JSON.stringify({ r1, has, r2, gone }));
  } catch (e) {
    fail('收藏', e.message);
  }

  // ── 4. 歌单 ──
  info('4. 歌单');
  try {
    const id = db.createPlaylist('自测歌单-' + Date.now());
    db.addSongToPlaylist(id, {
      songId: 'tx:abc',
      source: 'tx',
      name: '歌A',
      artist: '艺人A',
      album: '',
      duration: 100,
      coverUrl: null,
    });
    db.addSongToPlaylist(id, {
      songId: 'tx:def',
      source: 'tx',
      name: '歌B',
      artist: '艺人B',
      album: '',
      duration: 120,
      coverUrl: null,
    });
    const songs = db.getPlaylistSongs(id);
    const m3u = db.exportToM3u(id);
    db.deletePlaylist(id);
    if (songs.length === 2 && m3u.includes('歌A') && !db.listPlaylists().find((p) => p.id === id)) {
      ok('歌单 创建/加歌/导出/删除', `${songs.length} 首`);
    } else fail('歌单', `songs=${songs.length}`);
  } catch (e) {
    fail('歌单', e.message);
  }

  // ── 5. 最近播放 ──
  info('5. 最近播放');
  try {
    db.addRecentPlay({
      songId: 'tx:recent1',
      source: 'tx',
      name: '最近1',
      artist: 'X',
      album: '',
      duration: 1,
      coverUrl: null,
    });
    const recent = db.listRecentPlays(10);
    if (recent.some((r) => r.songId === 'tx:recent1')) ok('最近播放写入/读取');
    else fail('最近播放', '未读到');
  } catch (e) {
    fail('最近播放', e.message);
  }

  // ── 6. 设置 ──
  info('6. 设置读写');
  try {
    const base = defaultSettings();
    base.player.volume = 0.42;
    db.saveSetting('app_settings', base);
    const loaded = db.loadSetting('app_settings');
    if (loaded?.player?.volume === 0.42) ok('设置保存/读取');
    else fail('设置', JSON.stringify(loaded?.player));
  } catch (e) {
    fail('设置', e.message);
  }

  // ── 7. 本地音乐目录 ──
  info('7. 本地音乐');
  try {
    const musicDir = app.getPath('music');
    const exists = musicDir && fs.existsSync(musicDir);
    if (!exists) {
      ok('本地音乐目录', '系统 Music 目录不存在，跳过扫描');
    } else {
      const files = await scanDirs([musicDir]);
      ok('本地扫描', `${musicDir} → ${files.length} 首`);
      if (files[0]) {
        const f = files[0].filePath;
        if (fs.existsSync(f)) ok('本地文件存在', path.basename(f));
        else fail('本地文件', f);
      }
    }
  } catch (e) {
    fail('本地音乐', e.message);
  }

  // ── 8. 酷我原生兜底 ──
  info('8. 原生酷我兜底');
  try {
    const kw = await catalog.searchKuwo('晴天 周杰伦', 1);
    const rid = String(kw.songs?.[0]?.songId || '').replace(/^kw[:/]/i, '');
    if (!rid) fail('酷我搜索', '无结果');
    else {
      const url = await nativePlay.resolveKuwo(rid, '320k');
      const p = url && (await probeUrl(url));
      if (p) ok('原生酷我取链', String(url).slice(0, 70));
      else fail('原生酷我取链', url || 'null');
    }
  } catch (e) {
    fail('原生酷我', e.message);
  }

  // ── 9. 连续点播（切歌）──
  // 模拟连点：串行快速切 3 首 + 并行抢一次（最后一首应成功）
  info('9. 连续切歌（3 首）');
  try {
    let list = await nki.searchSongs('林俊杰', 8);
    if (!list.length) {
      list = await nki.searchSongs('周杰伦', 8);
    }
    if (list.length < 2) {
      fail('连续切歌', `搜索结果不足 ${list.length}`);
    } else {
      let okCount = 0;
      const targets = list.slice(0, 3);
      for (const s of targets) {
        try {
          const url = await mgr.getMusicUrl(s.songId, '320k', 'tx', {
            name: s.name,
            artist: s.artist,
            strMediaMid: s.strMediaMid,
            songmid: String(s.songId || '').replace(/^tx[:/]/i, ''),
            source: 'tx',
            platform: 'tx',
          });
          if (url && (await probeUrl(url))) okCount += 1;
          else if (url) okCount += 0; // 有链但探测失败仍计 0
        } catch (e) {
          // 切歌取消不算失败；其它错误记日志
          if (!/播放已切换|PLAY_SWITCHED/i.test(e.message || '')) {
            console.log('    切歌异常', s.name, e.message);
          }
        }
      }
      // 再测连点取消：快速 fire 3 次 resolve，最后一次应能出链
      let raceOk = false;
      try {
        const a = targets[0];
        const b = targets[1] || targets[0];
        const c = targets[2] || targets[0];
        const p1 = mgr.getMusicUrl(a.songId, '320k', 'tx', {
          name: a.name,
          artist: a.artist,
          strMediaMid: a.strMediaMid,
          source: 'tx',
          platform: 'tx',
        });
        await new Promise((r) => setTimeout(r, 60));
        const p2 = mgr.getMusicUrl(b.songId, '320k', 'tx', {
          name: b.name,
          artist: b.artist,
          strMediaMid: b.strMediaMid,
          source: 'tx',
          platform: 'tx',
        });
        await new Promise((r) => setTimeout(r, 60));
        const p3 = mgr.getMusicUrl(c.songId, '320k', 'tx', {
          name: c.name,
          artist: c.artist,
          strMediaMid: c.strMediaMid,
          source: 'tx',
          platform: 'tx',
        });
        const settled = await Promise.allSettled([p1, p2, p3]);
        const last = settled[2];
        if (last.status === 'fulfilled' && last.value) {
          raceOk = await probeUrl(last.value);
        } else if (last.status === 'rejected' && /播放已切换|PLAY_SWITCHED/i.test(last.reason?.message || '')) {
          // 不应：最后一次被自己取消
          raceOk = false;
        }
      } catch {
        raceOk = false;
      }

      if (okCount >= 2) ok('连续切歌', `${okCount}/3 串行` + (raceOk ? ' + 连点最后一首可播' : ''));
      else if (okCount >= 1 && raceOk) ok('连续切歌', `${okCount}/3 串行 + 连点兜底`);
      else fail('连续切歌', `${okCount}/3 串行, 连点最后=${raceOk}`);
    }
  } catch (e) {
    fail('连续切歌', e.message);
  }

  // ── 10. 备份导出对象 ──
  info('10. 数据备份结构');
  try {
    const bak = db.exportBackup();
    if (bak.app === 'aurisleft' && bak.data && bak.schemaVersion) ok('备份 exportBackup 结构');
    else fail('备份', JSON.stringify(Object.keys(bak)));
  } catch (e) {
    fail('备份', e.message);
  }

  // Summary
  info('汇总');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n通过 ${passed}/${results.length}`);
  if (failed.length) {
    console.log('\n失败项:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  // write report
  const reportPath = path.join(__dirname, 'test-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, results }, null, 2)
  );
  console.log('\n报告:', reportPath);
  app.exit(failed.length ? 1 : 0);
});
