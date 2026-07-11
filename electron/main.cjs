const {
  app,
  BrowserWindow,
  shell,
  Menu,
  globalShortcut,
  Tray,
  nativeImage,
  ipcMain,
  protocol,
  net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { createAppState, registerHandlers } = require('./services/handlers.cjs');
const { pickMediaHeaders } = require('./services/mediaHeaders.cjs');
const logger = require('./services/logger.cjs');

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
/** When false, close button hides to tray instead of quitting */
let isQuitting = false;
let state = null;

// 防止重复启动出现两个窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// 自定义协议：
// - aurislocal://media/<base64url-path>  本地文件
// - aurisstream://u/<base64url-url>     在线流（补 Referer，避免 CDN 拒播）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aurislocal',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
  {
    scheme: 'aurisstream',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

function getMainWindow() {
  return mainWindow;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AurisLeft',
    backgroundColor: '#0c0e12',
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 本地文件优先走 aurislocal://；保留 false 兼容旧 file://
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-state', { maximized: true });
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-state', { maximized: false });
  });

  // Close → hide to tray (true quit only via tray menu / app.quit)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerWindowControls() {
  ipcMain.handle('window-minimize', () => {
    getMainWindow()?.minimize();
  });
  ipcMain.handle('window-maximize', () => {
    const win = getMainWindow();
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  ipcMain.handle('window-close', () => {
    // Title-bar close: hide to tray (same as window close)
    const win = getMainWindow();
    if (win) win.hide();
  });
  ipcMain.handle('window-is-maximized', () => {
    return Boolean(getMainWindow()?.isMaximized());
  });
}

function setupTray() {
  try {
    // Prefer PNG for Windows tray
    const candidates = [
      path.join(__dirname, '../public/tray.png'),
      path.join(__dirname, '../public/logo.png'),
      path.join(__dirname, '../public/logo.svg'),
    ];
    let image = nativeImage.createEmpty();
    for (const iconPath of candidates) {
      if (!fs.existsSync(iconPath)) continue;
      try {
        image = nativeImage.createFromPath(iconPath);
        if (!image.isEmpty()) break;
      } catch {
        /* try next */
      }
    }
    if (image.isEmpty()) {
      // 16x16 amber pixel fallback
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVQ4T2NkYGD4z0ABYBzVMKoBQzUMdcCoBgzVQDANHD0NQw0AAH0EAv8n+k2WAAAAAElFTkSuQmCC',
        'base64'
      );
      image = nativeImage.createFromBuffer(png);
    }
    tray = new Tray(image);
    tray.setToolTip('AurisLeft');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: '显示窗口',
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
            }
          },
        },
        {
          label: '播放/暂停',
          click: () => mainWindow?.webContents.send('hotkey-play-pause'),
        },
        {
          label: '下一首',
          click: () => mainWindow?.webContents.send('hotkey-next'),
        },
        {
          label: '上一首',
          click: () => mainWindow?.webContents.send('hotkey-prev'),
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ])
    );
    tray.on('double-click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } catch (e) {
    console.warn('[tray] setup failed', e);
  }
}

function setupHotkeys() {
  try {
    globalShortcut.register('MediaPlayPause', () => {
      mainWindow?.webContents.send('hotkey-play-pause');
    });
    globalShortcut.register('MediaNextTrack', () => {
      mainWindow?.webContents.send('hotkey-next');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      mainWindow?.webContents.send('hotkey-prev');
    });
  } catch (e) {
    console.warn('[hotkeys] register failed', e);
  }
}

if (gotLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    logger.install();
    state = createAppState();
    console.log(`[boot] AurisLeft v${app.getVersion()} dev=${isDev}`);
    // 预热西瓜糖连接，减少第一次解析握手时间
    try {
      const nkiQq = require('./services/nkiQq.cjs');
      nkiQq.preconnect();
    } catch {
      /* ignore */
    }

    // aurislocal://media/<base64url filepath>
    protocol.handle('aurislocal', async (request) => {
      try {
        const u = new URL(request.url);
        const b64 = u.pathname.replace(/^\//, '').replace(/^media\//, '');
        const filePath = Buffer.from(b64, 'base64url').toString('utf8');
        if (!filePath || !fs.existsSync(filePath)) {
          return new Response('Not Found', { status: 404 });
        }
        return net.fetch(pathToFileURL(filePath).href);
      } catch (e) {
        console.warn('[aurislocal]', e);
        return new Response('Bad Request', { status: 400 });
      }
    });

    // aurisstream://u/<base64url of remote audio url>
    protocol.handle('aurisstream', async (request) => {
      try {
        const m = String(request.url).match(/aurisstream:\/\/(?:\/?u\/)?([^?#]+)/i);
        let b64 = m?.[1] || '';
        // URL 解析时 host 可能是 "u"，path 才是 payload
        if (b64 === 'u' || b64.startsWith('u/')) {
          try {
            const parsed = new URL(request.url);
            b64 = parsed.pathname.replace(/^\/+/, '') || b64.replace(/^u\/?/, '');
          } catch {
            b64 = b64.replace(/^u\/?/, '');
          }
        }
        b64 = decodeURIComponent(b64).replace(/^\/+/, '');
        const target = Buffer.from(b64, 'base64url').toString('utf8');
        if (!/^https?:\/\//i.test(target)) {
          console.warn('[aurisstream] bad target from', request.url, '->', target.slice(0, 80));
          return new Response('Bad target', { status: 400 });
        }

        const range = request.headers.get('Range') || request.headers.get('range');
        let lastStatus = 0;
        let lastErr = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const headers = pickMediaHeaders(target);
            if (range) headers.Range = range;

            const res = await fetch(target, {
              headers,
              redirect: 'follow',
            });
            lastStatus = res.status;
            if (!res.ok && res.status !== 206) {
              console.warn(
                `[aurisstream] upstream ${res.status} attempt=${attempt}`,
                target.slice(0, 100)
              );
              if (attempt < 2 && (res.status >= 500 || res.status === 403 || res.status === 429)) {
                await new Promise((r) => setTimeout(r, 350));
                continue;
              }
              return new Response(`Upstream ${res.status}`, { status: res.status });
            }

            const outHeaders = new Headers();
            const ct = res.headers.get('content-type') || 'audio/mpeg';
            outHeaders.set('Content-Type', ct);
            const cl = res.headers.get('content-length');
            if (cl) outHeaders.set('Content-Length', cl);
            const cr = res.headers.get('content-range');
            if (cr) outHeaders.set('Content-Range', cr);
            outHeaders.set('Accept-Ranges', res.headers.get('accept-ranges') || 'bytes');
            outHeaders.set('Access-Control-Allow-Origin', '*');

            return new Response(res.body, {
              status: res.status,
              headers: outHeaders,
            });
          } catch (e) {
            lastErr = e;
            console.warn(`[aurisstream] fetch error attempt=${attempt}`, e.message || e);
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 350));
              continue;
            }
          }
        }

        console.warn('[aurisstream] give up', lastStatus, lastErr?.message || '');
        return new Response('Stream error', { status: 502 });
      } catch (e) {
        console.warn('[aurisstream]', e.message || e);
        return new Response('Stream error', { status: 502 });
      }
    });

    registerHandlers(ipcMain, getMainWindow, state);
    registerWindowControls();

    try {
      const { session } = require('electron');
      session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const url = details.url || '';
        const type = details.resourceType || '';
        // 封面 + 直链音频（未走 aurisstream 时的兜底）
        if (
          /music\.126\.net|126\.net|music\.163\.com/i.test(url) &&
          (type === 'image' || type === 'media' || type === 'xhr' || type === 'other')
        ) {
          details.requestHeaders.Referer = 'https://music.163.com/';
          details.requestHeaders['User-Agent'] =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
        } else if (
          /kuwo|kwcdn|panspace\.kuwo/i.test(url) &&
          (type === 'media' || type === 'xhr' || type === 'other' || type === 'image')
        ) {
          details.requestHeaders.Referer = 'https://www.kuwo.cn/';
          details.requestHeaders['User-Agent'] =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
        } else if (
          /kugou|kgimg/i.test(url) &&
          (type === 'media' || type === 'xhr' || type === 'other' || type === 'image')
        ) {
          details.requestHeaders.Referer = 'https://www.kugou.com/';
        } else if (
          /gtimg|myqcloud|tencentmusic|qq\.com\/.*music/i.test(url) &&
          (type === 'media' || type === 'xhr' || type === 'other' || type === 'image')
        ) {
          details.requestHeaders.Referer = 'https://y.qq.com/';
        }
        callback({ requestHeaders: details.requestHeaders });
      });
    } catch (e) {
      console.warn('[session] cover referer rewrite failed', e);
    }

    Menu.setApplicationMenu(null);
    createWindow();
    setupTray();
    setupHotkeys();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows/Linux when window is hidden
  if (process.platform === 'darwin') return;
  if (isQuitting) app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
