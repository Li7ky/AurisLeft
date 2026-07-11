const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getAppDataDir() {
  const dir = path.join(app.getPath('userData'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDownloadsDir() {
  const dir = path.join(getAppDataDir(), 'downloads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLogsDir() {
  const dir = path.join(getAppDataDir(), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDbPath() {
  return path.join(getAppDataDir(), 'music_player.json');
}

function getSourcesPath() {
  return path.join(getAppDataDir(), 'sources.json');
}

/** 洛雪兼容音源开关偏好 */
function getLxPrefsPath() {
  return path.join(getAppDataDir(), 'lx-source-prefs.json');
}

function getBackupsDir() {
  const dir = path.join(getAppDataDir(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  getAppDataDir,
  getDownloadsDir,
  getLogsDir,
  getDbPath,
  getSourcesPath,
  getLxPrefsPath,
  getBackupsDir,
};
