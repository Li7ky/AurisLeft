const path = require('path');
const { app } = require('electron');
process.chdir(path.join(__dirname, '..'));

app.whenReady().then(async () => {
  const nki = require('../electron/services/nkiQq.cjs');
  console.log('status', nki.getStatus());
  try {
    const u1 = await nki.resolvePlayUrl({
      mid: '001Qu4I30eVFYb',
      name: '演员',
      artist: '薛之谦',
      quality: '320k',
    });
    console.log('play 演员', u1 ? u1.slice(0, 100) : null);

    const u2 = await nki.resolvePlayUrl({
      name: '晴天',
      artist: '周杰伦',
      quality: '320k',
    });
    console.log('play 晴天', u2 ? u2.slice(0, 100) : null);

    // 连点模拟：快速 fire 3 次，最后一次应成功
    const p1 = nki.resolvePlayUrl({ name: '夜曲', artist: '周杰伦', quality: '320k' });
    await new Promise((r) => setTimeout(r, 80));
    const p2 = nki.resolvePlayUrl({ name: '稻香', artist: '周杰伦', quality: '320k' });
    await new Promise((r) => setTimeout(r, 80));
    const p3 = nki.resolvePlayUrl({ name: '告白气球', artist: '周杰伦', quality: '320k' });
    const settled = await Promise.allSettled([p1, p2, p3]);
    console.log(
      '连点结果',
      settled.map((s) =>
        s.status === 'fulfilled'
          ? s.value
            ? 'ok'
            : 'null'
          : s.reason?.code || s.reason?.message || 'err'
      )
    );
    const last = settled[2];
    console.log(
      '最后一首',
      last.status === 'fulfilled' && last.value ? last.value.slice(0, 80) : last
    );
    app.exit(u1 && u2 ? 0 : 1);
  } catch (e) {
    console.error('FAIL', e);
    app.exit(1);
  }
});
