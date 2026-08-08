/**
 * 用 Electron 离屏渲染 logo.svg → 透明 PNG（tray / logo）
 * 用法: npx electron scripts/gen-tray-icon.cjs
 * 产出:
 *   public/tray.png   (32x32, 托盘图标，含透明圆角)
 *   public/logo.png   (256x256, 备用高清 logo，main.cjs 的候选路径之一)
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(ROOT, 'public/logo.svg'), 'utf8');
  const svgDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:transparent">
  <canvas id="c32" width="32" height="32" style="display:none"></canvas>
  <canvas id="c256" width="256" height="256" style="display:none"></canvas>
  <script>
    const img = new Image();
    img.onload = () => {
      for (const id of ['c32', 'c256']) {
        const c = document.getElementById(id);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
      }
      document.title = 'DONE';
    };
    img.onerror = () => { document.title = 'IMG_ERROR'; };
    img.src = '${svgDataUrl}';
  <\/script>
</body></html>`;

  const htmlPath = path.join(os.tmpdir(), 'zuoer-icon.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 256,
    height: 256,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });

  try {
    await win.webContents.loadFile(htmlPath);
    const result = await win.webContents.executeJavaScript(
      'new Promise((res) => { const t = setInterval(() => { const d = document.title; if (d === "DONE" || d === "IMG_ERROR") { clearInterval(t); res(d); } }, 50); setTimeout(() => { clearInterval(t); res(null); }, 10000); })'
    );
    if (result !== 'DONE') throw new Error('svg load failed: ' + result);

    const png32 = await win.webContents.executeJavaScript(
      'document.getElementById("c32").toDataURL("image/png")'
    );
    const png256 = await win.webContents.executeJavaScript(
      'document.getElementById("c256").toDataURL("image/png")'
    );

    fs.writeFileSync(
      path.join(ROOT, 'public/tray.png'),
      Buffer.from(String(png32).split(',')[1], 'base64')
    );
    console.log('[icons] wrote public/tray.png (32x32)');
    fs.writeFileSync(
      path.join(ROOT, 'public/logo.png'),
      Buffer.from(String(png256).split(',')[1], 'base64')
    );
    console.log('[icons] wrote public/logo.png (256x256)');
  } catch (e) {
    console.error('[icons] failed:', e.message || e);
    process.exitCode = 1;
  } finally {
    try { fs.unlinkSync(htmlPath); } catch { /* ignore */ }
    win.destroy();
    app.quit();
  }
});