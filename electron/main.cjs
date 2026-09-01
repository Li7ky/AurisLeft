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
const dns = require('dns');
const nodeNet = require('net');
const { createAppState, registerHandlers } = require('./services/handlers.cjs');
const { pickMediaHeaders } = require('./services/mediaHeaders.cjs');
const { getAppDataDir } = require('./services/appPaths.cjs');
const logger = require('./services/logger.cjs');

// 防 EPIPE：从已关闭的终端/管道启动（或父进程退出）时，写 stdout/stderr 会抛
// "EPIPE: broken pipe"，未捕获就成为主进程的 Uncaught Exception 弹窗。
// 给标准流挂空 error 处理器即可让 console.* 静默丢弃这类写失败。
for (const s of [process.stdout, process.stderr, process.stdin]) {
  if (s && typeof s.on === 'function') {
    s.on('error', () => {
      /* ignore broken pipe */
    });
  }
}

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

/** 发送 IPC 前判空，避免窗口销毁后抛 “Object has been destroyed” */
function safeSend(channel, ...args) {
  try {
    const win = getMainWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch {
    /* ignore */
  }
}

/**
 * aurislocal 路径白名单：仅允许本地音乐目录与 appData 子目录内的真实文件，
 * 解析符号链接后校验，防止 base64 路径读走任意磁盘文件。
 */
function isAllowedLocalFile(filePath) {
  try {
    const real = fs.realpathSync(path.resolve(filePath));
    const roots = [
      getAppDataDir(),
      ...(state?.db?.getLocalMusicDirs() || []),
    ];
    for (const root of roots) {
      try {
        const realRoot = fs.realpathSync(path.resolve(root));
        const rel = path.relative(realRoot, real);
        if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) {
          return true;
        }
      } catch {
        /* skip invalid root */
      }
    }
  } catch {
    /* not a real file */
  }
  return false;
}

/** IPv4 是否内网/回环/链路本地/保留段（SSRF 防护） */
function isPrivateIpv4(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true; // 0/8 10/8 127/8 组播+保留
  if (a === 169 && b === 254) return true; // 链路本地（云元数据 169.254.169.254）
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 基准测试段
  return false;
}

/** IPv6 是否回环/链路本地/唯一本地地址 */
function isPrivateIpv6(ip) {
  const lower = String(ip).toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe8') || lower.startsWith('fec0')) return true; // 链路本地/站点本地
  if (/^f[cd]/.test(lower)) return true; // ULA fc00::/7
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

/** IPv4 是否代理 Fake-IP 特征段（198.18.0.0/15） */
function isProxyFakeIpv4(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  return a === 198 && (b === 18 || b === 19);
}

/** IPv6 是否代理 Fake-IP 特征段（ULA fc00::/7，如 Clash 的 fdfe:dcba::/48） */
function isProxyFakeIpv6(ip) {
  const lower = String(ip).toLowerCase();
  return /^f[cd]/.test(lower);
}

/** hostname -> 是否解析为安全的公网地址（5 分钟缓存） */
const dnsSafeCache = new Map();
function assertPublicTarget(target) {
  const u = new URL(target);
  const host = u.hostname;
  const ipv = nodeNet.isIP(host);
  if (ipv === 4) {
    if (isPrivateIpv4(host)) throw new Error('private ipv4');
    return Promise.resolve();
  }
  if (ipv === 6) {
    if (isPrivateIpv6(host)) throw new Error('private ipv6');
    return Promise.resolve();
  }
  const cached = dnsSafeCache.get(host);
  if (cached !== undefined) {
    if (!cached) throw new Error('blocked hostname');
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    dns.lookup(host, { all: true }, (err, addresses) => {
      let ok = false;
      if (!err && Array.isArray(addresses) && addresses.length) {
        ok = addresses.every((addr) => {
          const ip = String(addr.address);
          // 代理 Fake-IP（198.18/15、ULA）不算拦截项：
          // 开着 Clash/mihomo 等 TUN 代理时，系统 DNS 会把所有域名解析到 Fake-IP，
          // 真实连接由代理接管转发，CDN 域名照常可播，且不构成访问内网的 SSRF 风险。
          if (nodeNet.isIP(ip) === 4) return !isPrivateIpv4(ip) || isProxyFakeIpv4(ip);
          if (nodeNet.isIP(ip) === 6) return !isPrivateIpv6(ip) || isProxyFakeIpv6(ip);
          return false;
        });
      }
      dnsSafeCache.set(host, ok);
      setTimeout(() => dnsSafeCache.delete(host), 5 * 60 * 1000).unref();
      if (ok) resolve();
      else reject(new Error('blocked hostname resolution'));
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '左耳',
    backgroundColor: '#0d0f12',
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
    // 仅放行 http/https，避免 file://、smb:// 等协议被静默调起本机程序
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      /* ignore malformed url */
    }
    return { action: 'deny' };
  });

  mainWindow.on('maximize', () => {
    safeSend('window-state', { maximized: true });
  });
  mainWindow.on('unmaximize', () => {
    safeSend('window-state', { maximized: false });
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
    tray.setToolTip('左耳');
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
          click: () => safeSend('hotkey-play-pause'),
        },
        {
          label: '下一首',
          click: () => safeSend('hotkey-next'),
        },
        {
          label: '上一首',
          click: () => safeSend('hotkey-prev'),
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
      safeSend('hotkey-play-pause');
    });
    globalShortcut.register('MediaNextTrack', () => {
      safeSend('hotkey-next');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      safeSend('hotkey-prev');
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
    console.log(`[boot] 左耳 v${app.getVersion()} dev=${isDev}`);
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
        // 仅允许「本地音乐目录 / appData」内的真实文件，防任意文件读取
        if (!filePath || !isAllowedLocalFile(filePath)) {
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
        // SSRF 防护：拒绝内网/回环/链路本地/保留地址（含域名解析后）
        try {
          await assertPublicTarget(target);
        } catch (e) {
          console.warn('[aurisstream] blocked target', target.slice(0, 100), e?.message || '');
          return new Response('Forbidden', { status: 403 });
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

    // 启动时按设置恢复桌面歌词窗口
    try {
      const appSettings = state?.db?.loadSetting('app_settings');
      const desktopLyrics = Boolean(appSettings?.appearance?.desktopLyrics);
      if (desktopLyrics) {
        const lyricWindow = require('./services/lyricWindow.cjs');
        lyricWindow.openLyricWindow();
      }
    } catch (e) {
      console.warn('[boot] restore desktop lyrics failed', e);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  // 防抖落盘改为退出前同步兜底，保证最后 300ms 内的改动不丢
  try {
    state?.db?.flushSync?.();
  } catch {
    /* ignore */
  }
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows/Linux when window is hidden
  if (process.platform === 'darwin') return;
  if (isQuitting) app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
