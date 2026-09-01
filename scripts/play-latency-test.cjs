/**
 * play-latency-test.cjs
 * Measures resolve-only latency (search -> URL ready) for the play chain
 * across several artists, using the app's real nkiQq module.
 *
 * Usage:  node scripts/play-latency-test.cjs
 * Needs:  userData/nki-prefs.json with a valid apiKey (the app's own prefs).
 *         Set ZUOER_DATA_DIR to that userData dir before running.
 */
const path = require('path');
const fs = require('fs');

// Point the app-data shim at the real Electron userData so the real
// nki-prefs.json (API key) and nki-mid-cache.json are picked up.
const DATA = process.env.ZUOER_DATA_DIR;
if (!DATA || !fs.existsSync(path.join(DATA, 'nki-prefs.json'))) {
  console.error('Set ZUOER_DATA_DIR to the app userData dir containing nki-prefs.json');
  console.error('e.g.  ZUOER_DATA_DIR="$APPDATA/aurisleft" node scripts/play-latency-test.cjs');
  process.exit(2);
}
const appPaths = path.resolve(__dirname, '../electron/services/appPaths.cjs');
require.cache[require.resolve(appPaths)] = {
  id: require.resolve(appPaths),
  filename: require.resolve(appPaths),
  loaded: true,
  exports: {
    getAppDataDir: () => DATA,
    getDownloadsDir: () => path.join(DATA, 'downloads'),
    getLogsDir: () => path.join(DATA, 'logs'),
    getDbPath: () => path.join(DATA, 'music_player.json'),
    getSourcesPath: () => path.join(DATA, 'sources.json'),
    getBackupsDir: () => path.join(DATA, 'backups'),
  },
};

const nkiQq = require('../electron/services/nkiQq.cjs');

// One track per artist, chosen to span the search space: CN, EN, mixed.
const CASES = [
  { artist: '周杰伦', name: '晴天' },
  { artist: '薛之谦', name: '演员' },
  { artist: 'Ed Sheeran', name: 'Shape of You' },
  { artist: 'Billie Eilish', name: 'bad guy' },
  { artist: 'Queen', name: 'Bohemian Rhapsody' },
  { artist: '林俊杰', name: '不为谁而作的歌' },
];

const QUALITY = '320k';

async function timedResolve(label, fn) {
  const t0 = Date.now();
  try {
    const res = await fn();
    const ms = Date.now() - t0;
    const ok = res && (typeof res === 'string' ? res : res.url);
    return { label, ms, ok: Boolean(ok), url: ok ? String(ok).slice(0, 60) : null };
  } catch (e) {
    return { label, ms: Date.now() - t0, ok: false, err: (e && e.message) || String(e) };
  }
}

async function main() {
  if (!nkiQq.isEnabled()) {
    console.error('nki QQ parsing is disabled or has no API key — aborting.');
    process.exit(3);
  }
  console.log('== resolve-only latency test (quality ' + QUALITY + ') ==');
  console.log('cases:', CASES.map((c) => c.artist).join(', '));
  console.log('');

  const results = [];
  for (const c of CASES) {
    const r1 = await timedResolve(`COLD  ${c.artist} — ${c.name}`, () =>
      nkiQq.resolvePlayUrl({ name: c.name, artist: c.artist, quality: QUALITY })
    );
    results.push(r1);
    console.log(
      `${r1.ok ? 'OK  ' : 'FAIL'} ${r1.ms.toString().padStart(6)}ms  ${r1.label}` +
        (r1.ok ? `  ${r1.url}` : `  (${r1.err || 'no url'})`)
    );

    // Warm: same song again, should hit the 24h cache
    const r2 = await timedResolve(`WARM  ${c.artist} — ${c.name}`, () =>
      nkiQq.resolvePlayUrl({ name: c.name, artist: c.artist, quality: QUALITY })
    );
    results.push(r2);
    console.log(
      `${r2.ok ? 'OK  ' : 'FAIL'} ${r2.ms.toString().padStart(6)}ms  ${r2.label}` +
        (r2.ok ? `  ${r2.url}` : `  (${r2.err || 'no url'})`)
    );
    console.log('');
  }

  const cold = results.filter((r) => r.label.startsWith('COLD'));
  const warm = results.filter((r) => r.label.startsWith('WARM'));
  const stats = (arr) => {
    const ms = arr.map((r) => r.ms);
    return {
      n: arr.length,
      ok: arr.filter((r) => r.ok).length,
      min: Math.min(...ms),
      max: Math.max(...ms),
      avg: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
    };
  };
  console.log('== summary ==');
  console.log('COLD (first resolve, no cache):', JSON.stringify(stats(cold)));
  console.log('WARM (cached re-resolve):     ', JSON.stringify(stats(warm)));
  console.log('');
  console.log('NOTE: this measures resolve-only (search -> URL ready).');
  console.log('To that, add the renderer audio start: stream open + first audio buffer.');
  process.exit(0);
}

main().catch((e) => {
  console.error('test crashed:', e);
  process.exit(1);
});
