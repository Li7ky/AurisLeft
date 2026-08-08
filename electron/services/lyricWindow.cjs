const { BrowserWindow } = require('electron');

/**
 * 桌面歌词悬浮窗：无边框、透明、置顶、跳过任务栏。
 * 不加载额外资源文件，HTML/CSS/JS 全部内联（dev/prod 一致）。
 * 数据由主窗口渲染进程经 IPC 推送：{ text, prev, next, song, artist, playing, percent, colors }
 */

let win = null;
let pendingPayload = null;

const HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<script>
  var __noop = function () {};
  window.__update = function (p) {
    var root = document.documentElement.style;
    var c = (p && p.colors) || {};
    root.setProperty('--ly-text', c.text || '#f4f2ed');
    root.setProperty('--ly-sub', c.sub || '#9a97a3');
    root.setProperty('--ly-accent', c.accent || '#e8a54b');
    root.setProperty('--ly-bg', c.bg || 'rgba(16,18,24,0.82)');
    var el = document.getElementById('l');
    var t = (p && p.text) || '';
    var idle = !(p && p.playing);
    if (t) {
      el.textContent = t;
      el.className = 'active' + (idle ? ' idle' : '');
    } else {
      el.textContent = idle ? '已暂停' : '暂无歌词';
      el.className = 'idle';
    }
    document.getElementById('title').textContent = (p && p.song) || '';
    document.getElementById('artist').textContent = p && p.artist ? p.artist : '';
    var bar = document.getElementById('bar');
    var percent = Math.max(0, Math.min(100, ((p && p.percent) || 0) * 100));
    bar.style.width = percent + '%';
  };
</script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; overflow: hidden; }
  body {
    font-family: "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
    -webkit-app-region: drag;
    user-select: none;
    cursor: default;
    height: 100vh;
    display: flex;
    align-items: center;
    padding: 0 18px;
  }
  body::after {
    content: '';
    position: absolute;
    inset: 6px;
    border-radius: 16px;
    background: var(--ly-bg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    z-index: 0;
  }
  .inner { position: relative; z-index: 1; width: 100%; overflow: hidden; padding: 12px 6px; }
  .meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; opacity: 0.75; }
  #title { font-size: 12px; font-weight: 600; color: var(--ly-accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #artist { font-size: 11px; color: var(--ly-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #l {
    font-size: 26px;
    font-weight: 600;
    color: var(--ly-text);
    letter-spacing: 0.02em;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 38px;
    transition: opacity 0.15s ease;
  }
  #l.idle { color: var(--ly-sub); font-weight: 400; font-size: 18px; }
  .bar-track { margin-top: 10px; height: 3px; border-radius: 999px; background: rgba(255, 255, 255, 0.10); overflow: hidden; }
  #bar { height: 100%; border-radius: 999px; background: var(--ly-accent); width: 0; transition: width 0.3s linear; }
</style>
</head>
<body>
  <div class="card">
    <div class="ly"><span id="title"></span><span id="artist"></span></div>
    <div id="l" class="idle">暂无歌词</div>
    <div class="bar-track"><div id="bar"></div></div>
  </div>
</body>
</html>`;

function openLyricWindow() {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.showInactive();
    if (pendingPayload) {
      push(pendingPayload);
    }
    return win;
  }

  win = new BrowserWindow({
    width: 560,
    height: 128,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setSkipTaskbar(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`);

  win.once('ready-to-show', () => {
    win.showInactive();
    if (pendingPayload) push(pendingPayload);
  });
  win.on('closed', () => {
    win = null;
  });
  return win;
}

function push(payload) {
  if (!payload) return;
  if (!win || win.isDestroyed()) {
    pendingPayload = payload;
    return;
  }
  pendingPayload = payload;
  try {
    void win.webContents
      .executeJavaScript(`window.__update(${JSON.stringify(payload)})`)
      .catch(() => undefined);
  } catch {
    /* ignore */
  }
}

function closeLyricWindow() {
  pendingPayload = null;
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
  win = null;
}

function isOpen() {
  return Boolean(win && !win.isDestroyed());
}

module.exports = { openLyricWindow, closeLyricWindow, push, isOpen };