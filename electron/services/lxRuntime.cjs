/**
 * LX Music 自定义音源脚本运行时（Node vm）
 * 兼容 globalThis.lx 协议：on/send/request/utils，仅用于 musicUrl 取链。
 * 脚本在隔离上下文中执行，不暴露 Node require / fs。
 */
const vm = require('vm');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const inflateAsync = promisify(zlib.inflate);
const deflateAsync = promisify(zlib.deflate);
const gunzipAsync = promisify(zlib.gunzip);

const EVENT_NAMES = {
  request: 'request',
  inited: 'inited',
  updateAlert: 'updateAlert',
};

function parseScriptHeader(code) {
  let name = 'LX Source';
  let version = '0';
  let description = '';
  let author = '';
  for (const line of String(code).split('\n').slice(0, 30)) {
    const trimmed = line.trim().replace(/^\*+/, '').trim();
    if (trimmed.startsWith('@name ')) name = trimmed.slice(6).trim();
    if (trimmed.startsWith('@version ')) version = trimmed.slice(9).trim();
    if (trimmed.startsWith('@description ')) description = trimmed.slice(13).trim();
    if (trimmed.startsWith('@author ')) author = trimmed.slice(8).trim();
    if (trimmed.endsWith('*/')) break;
  }
  return { name, version, description, author };
}

function toBuffer(data, encoding) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === 'string') {
    return Buffer.from(data, encoding || 'utf8');
  }
  if (Array.isArray(data)) return Buffer.from(data);
  return Buffer.from(String(data ?? ''), 'utf8');
}

function aesEncrypt(data, mode, key, iv) {
  const buf = toBuffer(data);
  const keyBuf = toBuffer(key);
  const ivBuf = iv != null ? toBuffer(iv) : Buffer.alloc(0);
  const m = String(mode || 'aes-128-ecb').toLowerCase();

  // LX: mode 常为 'aes-128-ecb' | 'aes-128-cbc' | 'aes-192-cbc' | 'aes-256-cbc'
  let algorithm = m;
  if (m === 'aes-128-ecb' || m === 'ecb') algorithm = 'aes-128-ecb';
  if (m === 'aes-128-cbc' || m === 'cbc') algorithm = 'aes-128-cbc';

  try {
    if (algorithm.includes('ecb')) {
      const cipher = crypto.createCipheriv(algorithm, keyBuf.slice(0, 16), null);
      cipher.setAutoPadding(true);
      return Buffer.concat([cipher.update(buf), cipher.final()]);
    }
    const ivLen = algorithm.includes('256') ? 16 : 16;
    const cipher = crypto.createCipheriv(
      algorithm,
      keyBuf.slice(0, algorithm.includes('256') ? 32 : algorithm.includes('192') ? 24 : 16),
      ivBuf.length ? ivBuf.slice(0, ivLen) : Buffer.alloc(16, 0)
    );
    cipher.setAutoPadding(true);
    return Buffer.concat([cipher.update(buf), cipher.final()]);
  } catch (e) {
    // 回退：部分脚本传原始 key 字符串
    try {
      const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(String(key)).slice(0, 16), null);
      cipher.setAutoPadding(true);
      return Buffer.concat([cipher.update(buf), cipher.final()]);
    } catch {
      throw e;
    }
  }
}

function rsaEncrypt(buffer, key) {
  const buf = toBuffer(buffer);
  let pem = String(key || '');
  if (!pem.includes('BEGIN')) {
    pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
  }
  return crypto.publicEncrypt(
    {
      key: pem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    buf
  );
}

function buildUtils() {
  return {
    buffer: {
      from: (data, encoding) => toBuffer(data, encoding),
      bufToString: (buf, format) => toBuffer(buf).toString(format || 'utf8'),
    },
    crypto: {
      aesEncrypt: (buffer, mode, key, iv) => aesEncrypt(buffer, mode, key, iv),
      md5: (str) => crypto.createHash('md5').update(String(str)).digest('hex'),
      randomBytes: (size) => crypto.randomBytes(Number(size) || 16).toString('hex'),
      rsaEncrypt: (buffer, key) => rsaEncrypt(buffer, key),
    },
    zlib: {
      inflate: async (buffer) => {
        try {
          return await inflateAsync(toBuffer(buffer));
        } catch {
          return gunzipAsync(toBuffer(buffer));
        }
      },
      deflate: async (buffer) => deflateAsync(toBuffer(buffer)),
    },
  };
}

/**
 * HTTP request compatible with LX `lx.request(url, options, callback)`
 * callback(err, resp, body) — 第三参 body 与 resp.body 一致（兼容野花等脚本）
 */
function safeCallback(cb, err, resp, body) {
  try {
    if (typeof cb === 'function') {
      cb(err, resp, body !== undefined ? body : resp?.body);
    }
  } catch (e) {
    console.warn('[lx] request callback threw', e.message || e);
  }
}

function lxRequest(url, options = {}, callback) {
  let aborted = false;
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  let body;
  if (options.body != null) {
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  } else if (options.form) {
    body = new URLSearchParams(options.form).toString();
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  } else if (options.formData) {
    body = new URLSearchParams(options.formData).toString();
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  const timeoutMs = Number(options.timeout) || 15000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const run = async () => {
    try {
      if (aborted) return;
      const res = await fetch(String(url), {
        method,
        headers: {
          // 默认模拟洛雪；脚本自带 UA（如 lx-music/desktop）会覆盖
          'User-Agent': 'lx-music/desktop',
          ...headers,
        },
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        signal: ctrl.signal,
        redirect: 'follow',
      });
      const rawHeaders = {};
      res.headers.forEach((v, k) => {
        rawHeaders[k] = v;
      });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let respBody;
      const text = await res.text();
      const trimmed = text.trim();
      if (
        (ct.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) &&
        trimmed.length < 2_000_000
      ) {
        try {
          respBody = JSON.parse(trimmed);
        } catch {
          respBody = text;
        }
      } else {
        respBody = text;
      }

      if (aborted) return;
      const resp = {
        statusCode: res.status,
        statusMessage: res.statusText,
        headers: rawHeaders,
        body: respBody,
      };
      safeCallback(callback, null, resp, respBody);
    } catch (err) {
      if (aborted) return;
      const e = err instanceof Error ? err : new Error(String(err));
      safeCallback(callback, e, null, null);
    } finally {
      clearTimeout(timer);
    }
  };

  run().catch((err) => {
    if (!aborted) {
      safeCallback(callback, err instanceof Error ? err : new Error(String(err)), null, null);
    }
  });

  return () => {
    aborted = true;
    try {
      ctrl.abort();
    } catch {
      /* ignore */
    }
    clearTimeout(timer);
  };
}

/** 从 inited 载荷解析 sources（兼容多种脚本写法） */
function extractSourcesFromInited(data) {
  if (!data || typeof data !== 'object') return {};
  if (data.sources && typeof data.sources === 'object' && !Array.isArray(data.sources)) {
    return data.sources;
  }
  // 部分脚本（如聚合 API）直接把平台表放在 init 根上
  const platformKeys = ['kw', 'kg', 'tx', 'wy', 'mg', 'local', 'git'];
  const out = {};
  for (const k of platformKeys) {
    if (data[k] && typeof data[k] === 'object') out[k] = data[k];
  }
  return out;
}

class LxScriptHost {
  /**
   * @param {string} code
   * @param {{ id?: string, hidden?: boolean }} [opts]
   */
  constructor(code, opts = {}) {
    this.code = String(code || '');
    this.header = parseScriptHeader(this.code);
    this.id = opts.id || `lx-${crypto.randomUUID()}`;
    this.hidden = opts.hidden !== false;
    /** 用户可开关，默认开启 */
    this.enabled = opts.enabled !== false;
    /** @type {Record<string, any>} */
    this.sources = {};
    /** 必须收到 send(inited) 且解析出平台后才为 true */
    this.ready = false;
    this.initError = null;
    /** @type {((payload: any) => Promise<any>) | null} */
    this.requestHandler = null;
    this._context = null;
    this._initStarted = false;
  }

  get info() {
    return {
      id: this.id,
      name: this.header.name,
      version: this.header.version,
      type: 'js',
      enabled: this.enabled,
      hidden: this.hidden,
      ready: this.ready,
      supportedQualities: ['128k', '320k', 'flac', 'flac24bit'],
      failCount: 0,
      platforms: Object.keys(this.sources),
    };
  }

  async init() {
    if (this.ready) return this;
    if (this._initStarted && !this.ready) {
      // 并发 init 等待
      const deadline = Date.now() + 25_000;
      while (!this.ready && !this.initError && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (this.ready) return this;
      throw new Error(this.initError || '音源初始化未完成');
    }
    this._initStarted = true;
    const header = this.header;
    const self = this;

    const sandbox = {
      console: {
        log: (...a) => console.log('[lx]', header.name, ...a),
        info: (...a) => console.info('[lx]', header.name, ...a),
        warn: (...a) => console.warn('[lx]', header.name, ...a),
        error: (...a) => console.error('[lx]', header.name, ...a),
        debug: () => {},
        group: () => {},
        groupEnd: () => {},
        groupCollapsed: () => {},
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Promise,
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      TypeError,
      Map,
      Set,
      WeakMap,
      WeakSet,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
      atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
      Buffer,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
    };

    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    sandbox.self = sandbox;

    sandbox.lx = {
      // 使用数字友好版本，避免脚本里 version 比较异常
      version: '2.0.0',
      env: 'desktop',
      EVENT_NAMES,
      currentScriptInfo: {
        name: header.name,
        description: header.description,
        version: header.version,
        author: header.author,
        homepage: '',
        rawScript: this.code,
      },
      utils: buildUtils(),
      request: lxRequest,
      on(event, handler) {
        if (event === EVENT_NAMES.request || event === 'request') {
          self.requestHandler = handler;
        }
      },
      send(event, data) {
        if (event === EVENT_NAMES.inited || event === 'inited') {
          const sources = extractSourcesFromInited(data);
          self.sources = sources;
          // 严格：必须有平台配置才算初始化成功
          if (Object.keys(sources).length > 0) {
            self.ready = true;
            console.log(
              `[lx] ${header.name} 初始化完成 platforms=[${Object.keys(sources).join(',')}]`
            );
          } else {
            console.warn(`[lx] ${header.name} inited 但无 sources，继续等待或失败`);
          }
        }
        // updateAlert 忽略（不弹窗）
      },
    };

    sandbox.globalThis.lx = sandbox.lx;

    try {
      const script = new vm.Script(this.code, {
        filename: `lx-source:${header.name}.js`,
      });
      const context = vm.createContext(sandbox, {
        name: `lx-${header.name}`,
      });
      this._context = context;
      // 大脚本（如 sixyin）需要更长编译时间
      const runTimeout = this.code.length > 50_000 ? 30_000 : 15_000;
      script.runInContext(context, { timeout: runTimeout });

      // 必须等 send(inited)：juhe/flower/grass 会先拉远程配置
      const deadline = Date.now() + 20_000;
      while (!this.ready && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }

      if (!this.ready) {
        // 兜底：有 handler 且脚本同步注册了固定平台（极少见）时仍拒绝，强制要求 inited
        this.initError = '音源未完成初始化（未收到 inited 或 sources 为空）';
        throw new Error(this.initError);
      }
      if (!this.requestHandler) {
        this.initError = '音源未注册 request 处理器';
        this.ready = false;
        throw new Error(this.initError);
      }
    } catch (e) {
      this.initError = e instanceof Error ? e.message : String(e);
      this.ready = false;
      throw new Error(`加载音源「${header.name}」失败: ${this.initError}`);
    }
    return this;
  }

  supports(platform, action = 'musicUrl') {
    if (!this.ready || !this.enabled) return false;
    const src = this.sources[platform];
    if (!src) return false;
    const actions = src.actions || ['musicUrl'];
    return actions.includes(action);
  }

  /**
   * @param {string} platform kw|kg|tx|wy|mg|local
   * @param {object} musicInfo
   * @param {string} quality
   */
  async getMusicUrl(platform, musicInfo, quality = '320k') {
    if (!this.ready) {
      await this.init();
    }
    if (!this.ready) {
      throw new Error(`音源「${this.header.name}」尚未初始化完成`);
    }
    if (!this.requestHandler) {
      throw new Error(`音源「${this.header.name}」无 request 处理器`);
    }
    if (!this.supports(platform, 'musicUrl')) {
      throw new Error(`音源「${this.header.name}」不支持平台 ${platform}`);
    }

    // 克隆，避免并行取链时脚本互相污染 musicInfo
    const safeInfo = JSON.parse(JSON.stringify(musicInfo || {}));

    // 只请求该源声明支持的音质（野花仅 128k，乱要 320k 会直接失败）
    const qualitys = this.sources[platform]?.qualitys || ['128k', '320k'];
    const preferred = String(quality || '320k');
    const tryList = [];
    if (qualitys.includes(preferred)) tryList.push(preferred);
    for (const q of qualitys) {
      if (!tryList.includes(q)) tryList.push(q);
    }
    if (!tryList.length) tryList.push('128k');

    let lastErr;
    for (const q of tryList) {
      try {
        const result = await Promise.race([
          Promise.resolve(
            this.requestHandler({
              source: platform,
              action: 'musicUrl',
              info: {
                type: q,
                musicInfo: { ...safeInfo },
              },
            })
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('musicUrl timeout')), 10000)
          ),
        ]);

        const url =
          typeof result === 'string'
            ? result
            : result?.url || result?.data?.url || null;
        if (url && /^https?:\/\//i.test(String(url))) {
          // 部分 CDN 仅 http，不要强行改 https 导致失败
          return String(url);
        }
        lastErr = new Error('empty url');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = new Error(msg || 'script error');
      }
    }
    throw lastErr || new Error('getMusicUrl failed');
  }
}

/**
 * 管理多个 LX 脚本（内置隐藏 + 用户可选）
 */
class LxSourceEngine {
  constructor() {
    /** @type {LxScriptHost[]} */
    this.hosts = [];
    // 脚本内 fire-and-forget 请求失败时，避免 Node 把 unhandledRejection 当成致命错误
    if (!LxSourceEngine._rejectionHooked) {
      LxSourceEngine._rejectionHooked = true;
      process.on('unhandledRejection', (reason) => {
        const msg = reason instanceof Error ? reason.message : String(reason);
        if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|aborted|socket/i.test(msg)) {
          console.warn('[lx] swallowed network rejection:', msg);
          return;
        }
        console.warn('[lx] unhandledRejection:', msg);
      });
    }
  }

  listHosts({ includeHidden = true, onlyReady = false } = {}) {
    return this.hosts
      .filter((h) => (includeHidden || !h.hidden) && (!onlyReady || h.ready))
      .map((h) => h.info);
  }

  readyCount() {
    return this.hosts.filter((h) => h.ready && h.enabled).length;
  }

  setEnabled(id, enabled) {
    const host = this.hosts.find((h) => h.id === id);
    if (!host) return null;
    host.enabled = Boolean(enabled);
    return host.info;
  }

  toggleEnabled(id) {
    const host = this.hosts.find((h) => h.id === id);
    if (!host) return null;
    host.enabled = !host.enabled;
    return host.info;
  }

  async loadScript(code, opts = {}) {
    const host = new LxScriptHost(code, opts);
    // 必须 init 成功（收到 inited）才加入
    await host.init();
    if (!host.ready) {
      throw new Error(`音源「${host.header.name}」初始化未完成`);
    }
    // 同 id / 同 name 替换时保留 enabled
    const prev = this.hosts.find(
      (h) => h.id === host.id || h.header.name === host.header.name
    );
    if (prev && opts.enabled === undefined) {
      host.enabled = prev.enabled;
    }
    this.hosts = this.hosts.filter(
      (h) => h.id !== host.id && h.header.name !== host.header.name
    );
    this.hosts.push(host);
    console.log(
      `[lx] ready ${host.header.name} v${host.header.version} platforms=[${Object.keys(host.sources).join(',')}] enabled=${host.enabled}`
    );
    return host.info;
  }

  /**
   * 仅使用「已初始化且已启用」的脚本取链
   */
  async resolveMusicUrl(platform, musicInfo, quality = '320k') {
    let candidates = this.hosts.filter(
      (h) => h.ready && h.enabled && h.supports(platform, 'musicUrl')
    );
    if (!candidates.length) {
      throw new Error(
        `没有已启用的 LX 音源支持平台 ${platform}（请在设置中开启音源，或等待初始化完成）`
      );
    }

    // 实测优先序：Huibq 较稳 → 野花 → 其它
    candidates = candidates.slice().sort((a, b) => {
      const score = (h) => {
        const n = (h.header.name || '').toLowerCase();
        if (n.includes('huibq')) return 0;
        if (n.includes('野花') || n.includes('flower')) return 1;
        if (n.includes('ikun')) return 2;
        if (n.includes('六音') || n.includes('sixyin')) return 3;
        return 5;
      };
      return score(a) - score(b);
    });

    // 并行竞速：谁先返回合法 URL 用谁（上限同时 3 个，避免打爆接口）
    const errors = [];
    const queue = [...candidates];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) {
        const host = queue.shift();
        if (!host) return null;
        try {
          const url = await host.getMusicUrl(platform, musicInfo, quality);
          if (url) {
            console.log(`[lx] hit ${host.header.name} ${platform} -> ${url.slice(0, 80)}`);
            return url;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${host.header.name}: ${msg}`);
          console.warn(`[lx] ${host.header.name} ${platform} fail:`, msg);
        }
      }
      return null;
    });

    // 任意一个 worker 先拿到 URL 就返回；其余继续在后台跑完但我们可直接用结果
    const firstUrl = await new Promise((resolve) => {
      let settled = 0;
      let done = false;
      for (const w of workers) {
        w.then((url) => {
          if (url && !done) {
            done = true;
            resolve(url);
          }
          settled += 1;
          if (settled === workers.length && !done) resolve(null);
        }).catch(() => {
          settled += 1;
          if (settled === workers.length && !done) resolve(null);
        });
      }
    });

    if (firstUrl) return firstUrl;
    if (errors.length) throw new Error(errors.join(' | '));
    throw new Error(`没有可用的 LX 音源支持平台 ${platform}`);
  }
}

module.exports = {
  LxScriptHost,
  LxSourceEngine,
  parseScriptHeader,
  EVENT_NAMES,
};
