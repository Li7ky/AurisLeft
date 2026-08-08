/**
 * Lightweight rotating file logger for main process.
 * Writes to userData/logs/aurisleft-YYYY-MM-DD.log
 */
const fs = require('fs');
const path = require('path');
const { getLogsDir } = require('./appPaths.cjs');

const MAX_BYTES = 2 * 1024 * 1024; // 2MB per day file before rotate
const ROTATE_CHECK_EVERY = 200; // 每 200 行检查一次文件大小（避免每次 statSync）
let ready = false;
let logDir = null;
let logFile = null;
let stream = null;
let originalConsole = null;
let lineCount = 0;
let rotating = false;

function stamp() {
  return new Date().toISOString();
}

function ensureReady() {
  if (ready) return;
  try {
    logDir = getLogsDir();
    fs.mkdirSync(logDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    logFile = path.join(logDir, `aurisleft-${day}.log`);
    ready = true;
  } catch {
    ready = false;
  }
}

function openStream() {
  if (!stream && ready && logFile) {
    stream = fs.createWriteStream(logFile, { flags: 'a' });
    stream.on('error', () => {
      /* ignore disk errors */
    });
  }
}

/** 低频轮转：仅当行数达到阈值才检查文件大小，滚动后重开流 */
function maybeRotate() {
  if (!ready || !logFile || rotating) return;
  try {
    if (!fs.existsSync(logFile)) return;
    const st = fs.statSync(logFile);
    if (st.size < MAX_BYTES) return;
    rotating = true;
    const rotated = `${logFile}.${Date.now()}.bak`;
    const oldStream = stream;
    stream = null;
    const done = () => {
      try {
        fs.renameSync(logFile, rotated);
      } catch {
        /* ignore */
      }
      rotating = false;
    };
    if (oldStream) oldStream.end(done);
    else done();
  } catch {
    rotating = false;
  }
}

function writeLine(level, parts) {
  ensureReady();
  if (!ready || !logFile) return;
  try {
    const msg = parts
      .map((p) => {
        if (p instanceof Error) return p.stack || p.message;
        if (typeof p === 'string') return p;
        try {
          return JSON.stringify(p);
        } catch {
          return String(p);
        }
      })
      .join(' ');
    openStream();
    if (stream) {
      stream.write(`[${stamp()}] [${level}] ${msg}\n`, 'utf8');
      if (++lineCount % ROTATE_CHECK_EVERY === 0) maybeRotate();
    }
  } catch {
    /* ignore disk errors */
  }
}

function install() {
  ensureReady();
  if (originalConsole) return;
  originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...args) => {
    originalConsole.log(...args);
    writeLine('INFO', args);
  };
  console.warn = (...args) => {
    originalConsole.warn(...args);
    writeLine('WARN', args);
  };
  console.error = (...args) => {
    originalConsole.error(...args);
    writeLine('ERROR', args);
  };

  process.on('uncaughtException', (err) => {
    writeLine('FATAL', [err]);
    originalConsole.error('[uncaughtException]', err);
  });
  process.on('unhandledRejection', (reason) => {
    writeLine('FATAL', ['unhandledRejection', reason]);
    originalConsole.error('[unhandledRejection]', reason);
  });
}

function getLogDir() {
  ensureReady();
  return logDir;
}

function getLogFile() {
  ensureReady();
  return logFile;
}

function info(...args) {
  writeLine('INFO', args);
}

function warn(...args) {
  writeLine('WARN', args);
}

function error(...args) {
  writeLine('ERROR', args);
}

module.exports = {
  install,
  getLogDir,
  getLogFile,
  info,
  warn,
  error,
};
