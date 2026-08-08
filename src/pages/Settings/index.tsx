import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../components/common/Toast/useToast';
import { Quality } from '../../types';
import type { ThemeConfig, ThemeMode } from '../../types';
import AppLogo from '../../components/common/AppLogo';
import {
  exportBackup,
  importBackup,
  openLogDir,
  checkForUpdates,
  openExternal,
  getAppVersion,
  getNkiQqStatus,
  setNkiQqKey,
  setNkiQqEnabled,
  clearAppCache,
  getDownloadDir,
  setDownloadDir,
  selectDirectory,
  type UpdateCheckResult,
  type NkiQqStatus,
} from '../../utils/desktop';
import './index.css';

const PRESET_THEMES: { name: string; mode: '暗色' | '明亮'; theme: ThemeConfig }[] = [
  {
    name: '琥珀暖夜',
    mode: '暗色',
    theme: {
      primary: '#e8a54b',
      background: '#0a0c10',
      surface: '#12161e',
      textPrimary: '#f4f2ed',
      textSecondary: '#7e7b88',
      accent: '#a594ff',
    },
  },
  {
    name: '深海蓝',
    mode: '暗色',
    theme: {
      primary: '#5b8def',
      background: '#0d1117',
      surface: '#161b22',
      textPrimary: '#e6edf3',
      textSecondary: '#8b949e',
      accent: '#58a6ff',
    },
  },
  {
    name: '暮光紫',
    mode: '暗色',
    theme: {
      primary: '#9b8cff',
      background: '#121018',
      surface: '#1c1828',
      textPrimary: '#f5f3ff',
      textSecondary: '#a1a1aa',
      accent: '#c4b5fd',
    },
  },
  {
    name: '晨光绿',
    mode: '明亮',
    theme: {
      primary: '#0d9488',
      background: '#f3f5f7',
      surface: '#ffffff',
      textPrimary: '#134e4a',
      textSecondary: '#5b6b6a',
      accent: '#14b8a6',
    },
  },
  {
    name: '晴空蓝',
    mode: '明亮',
    theme: {
      primary: '#3b82f6',
      background: '#f3f5f9',
      surface: '#ffffff',
      textPrimary: '#1e293b',
      textSecondary: '#64748b',
      accent: '#60a5fa',
    },
  },
  {
    name: '暖纸白',
    mode: '明亮',
    theme: {
      primary: '#d97706',
      background: '#f6f4f1',
      surface: '#ffffff',
      textPrimary: '#1c1917',
      textSecondary: '#78716c',
      accent: '#f59e0b',
    },
  },
];

const THEME_MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'manual', label: '跟随预设' },
  { value: 'light', label: '强制明亮' },
  { value: 'dark', label: '强制暗色' },
  { value: 'system', label: '跟随系统' },
];

function isSameTheme(a: ThemeConfig, b: ThemeConfig) {
  return (
    a.primary === b.primary &&
    a.background === b.background &&
    a.surface === b.surface &&
    a.textPrimary === b.textPrimary &&
    a.textSecondary === b.textSecondary &&
    a.accent === b.accent
  );
}

export default function Settings() {
  const {
    theme,
    defaultQuality,
    autoPlayNext,
    showLyric,
    themeMode,
    autoLaunch,
    restorePlayback,
    fadeSwitch,
    desktopLyrics,
    setTheme,
    setSetting,
  } = useSettingsStore();
  const { addToast } = useToast();

  const [customColor, setCustomColor] = useState(theme.primary);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [nkiStatus, setNkiStatus] = useState<NkiQqStatus | null>(null);
  const [nkiKeyInput, setNkiKeyInput] = useState('');
  const [nkiBusy, setNkiBusy] = useState(false);
  const [downloadDir, setDownloadDirState] = useState('');
  const [cacheBusy, setCacheBusy] = useState(false);
  const [dirBusy, setDirBusy] = useState(false);

  useEffect(() => {
    setCustomColor(theme.primary);
  }, [theme.primary]);

  useEffect(() => {
    getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion('1.0.0'));
    getNkiQqStatus()
      .then(setNkiStatus)
      .catch(() => undefined);
    getDownloadDir()
      .then((dir) => setDownloadDirState(dir))
      .catch(() => undefined);
  }, []);

  const handleQualityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSetting('defaultQuality', e.target.value as Quality);
  };

  const handleAutoPlayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSetting('autoPlayNext', e.target.checked);
  };

  const handleShowLyricChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSetting('showLyric', e.target.checked);
  };

  const handleToggleSetting = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    void setSetting(key, e.target.checked);
  };

  const handleThemeModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void setSetting('themeMode', e.target.value as ThemeMode);
  };

  const applyPresetTheme = (presetTheme: ThemeConfig) => {
    setTheme(presetTheme);
  };

  const applyCustomColor = () => {
    setTheme({
      ...theme,
      primary: customColor,
      accent: customColor,
    });
  };

  const handleExportBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await exportBackup();
      if (res.canceled) {
        addToast('已取消导出', 'info');
      } else {
        addToast(`备份已保存：${res.path}`, 'success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`导出失败：${message}`, 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await importBackup();
      if (res.canceled) {
        addToast('已取消导入', 'info');
      } else {
        addToast(
          `导入成功：${(res.restored || []).join('、') || '数据'}。建议重启应用。`,
          'success'
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`导入失败：${message}`, 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleOpenLogs = async () => {
    try {
      await openLogDir();
      addToast('已打开日志目录', 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`打开日志失败：${message}`, 'error');
    }
  };

  const handleSaveNkiKey = async () => {
    setNkiBusy(true);
    try {
      await setNkiQqKey(nkiKeyInput.trim());
      const s = await getNkiQqStatus();
      setNkiStatus(s);
      setNkiKeyInput('');
      addToast(s.hasKey ? '解析密钥已保存' : '密钥已清空', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`保存失败：${message}`, 'error');
    } finally {
      setNkiBusy(false);
    }
  };

  const handleToggleNki = async () => {
    if (!nkiStatus) return;
    setNkiBusy(true);
    try {
      const next = !nkiStatus.enabled;
      await setNkiQqEnabled(next);
      setNkiStatus(await getNkiQqStatus());
      addToast(next ? '已开启内置 QQ 解析' : '已关闭内置 QQ 解析', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`切换失败：${message}`, 'error');
    } finally {
      setNkiBusy(false);
    }
  };

  const handleClearCache = async () => {
    setCacheBusy(true);
    try {
      await clearAppCache();
      addToast('缓存已清除', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`清除缓存失败：${message}`, 'error');
    } finally {
      setCacheBusy(false);
    }
  };

  const handlePickDownloadDir = async () => {
    setDirBusy(true);
    try {
      const dir = await selectDirectory();
      if (!dir) {
        addToast('已取消选择', 'info');
        return;
      }
      await setDownloadDir(dir);
      setDownloadDirState(dir);
      addToast('下载目录已更新', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`设置失败：${message}`, 'error');
    } finally {
      setDirBusy(false);
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateBusy(true);
    setUpdateInfo(null);
    try {
      const res = await checkForUpdates();
      setUpdateInfo(res);
      if (res.hasUpdate) {
        addToast(`发现新版本 v${res.latest}`, 'success');
      } else if (res.error) {
        addToast(res.message || '检查更新失败', 'error');
      } else {
        addToast(res.message || `已是最新版 v${res.current}`, 'info');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`检查更新失败：${message}`, 'error');
    } finally {
      setUpdateBusy(false);
    }
  };

  const nkiReady = Boolean(nkiStatus?.enabled && nkiStatus?.hasKey);

  return (
    <div className="settings-compact">
      <h2 className="settings-compact__title">设置</h2>

      <section className="settings-group-card">
        <div className="settings-group-card__header">
          <h3 className="settings-group-card__title">播放音源</h3>
        </div>
        <div className="settings-group-card__body">
          <div className="settings-source-section">
            <div className="settings-source-section__title">
              内置 QQ 解析
              <span className="settings-source-section__badge">
                {nkiReady ? '已启用' : nkiStatus?.hasKey ? '待开启' : '未配置'}
              </span>
            </div>
            <div className="settings-note">
              内置解析服务，付费曲优先走这里。曲库搜索仍用公开接口。
            </div>
            <div className="settings-row settings-row--with-control" style={{ marginTop: 12 }}>
              <span className="settings-row__label">启用 QQ 解析</span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(nkiStatus?.enabled)}
                className={`settings-toggle${nkiStatus?.enabled ? ' is-on' : ''}`}
                disabled={nkiBusy || !nkiStatus?.hasKey}
                onClick={() => void handleToggleNki()}
                title={nkiStatus?.enabled ? '点击关闭' : '点击开启'}
              >
                <span className="settings-toggle__knob" />
              </button>
            </div>
            <div className="settings-note" style={{ marginTop: 10 }}>
              解析密钥（选填）：填写可提升解析稳定性；留空使用内置配置。
            </div>
            <div className="settings-row settings-row--with-control" style={{ gap: 8, marginTop: 6 }}>
              <input
                type="password"
                className="settings-select"
                style={{ flex: 1, minWidth: 0 }}
                placeholder={nkiStatus?.hasKey ? '已保存，输入新密钥可覆盖' : '粘贴密钥'}
                value={nkiKeyInput}
                onChange={(e) => setNkiKeyInput(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="settings-btn settings-btn--primary"
                disabled={nkiBusy || !nkiKeyInput.trim()}
                onClick={() => void handleSaveNkiKey()}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-group-card">
        <div className="settings-group-card__header">
          <h3 className="settings-group-card__title">播放设置</h3>
        </div>
        <div className="settings-group-card__body">
          <label className="settings-row settings-row--with-control">
            <span className="settings-row__label">默认音质</span>
            <select
              value={defaultQuality}
              onChange={handleQualityChange}
              className="settings-select"
            >
              <option value={Quality.K128}>128K</option>
              <option value={Quality.K320}>320K</option>
              <option value={Quality.FLAC}>FLAC</option>
              <option value={Quality.HiRes}>Hi-Res</option>
            </select>
          </label>
          <label className="settings-row settings-row--with-control">
            <span className="settings-row__label">自动播放下一首</span>
            <input
              type="checkbox"
              checked={autoPlayNext}
              onChange={handleAutoPlayChange}
              className="settings-switch"
            />
          </label>
          <label className="settings-row settings-row--with-control">
            <span className="settings-row__label">显示歌词</span>
            <input
              type="checkbox"
              checked={showLyric}
              onChange={handleShowLyricChange}
              className="settings-switch"
            />
          </label>
          <label className="settings-row settings-row--with-control">
            <span className="settings-row__label">播放淡入淡出</span>
            <input
              type="checkbox"
              checked={fadeSwitch}
              onChange={handleToggleSetting('fadeSwitch')}
              className="settings-switch"
            />
          </label>
          <div className="settings-note">播放 / 暂停 / 切歌时音量平滑过渡，更自然。</div>
          <label className="settings-row settings-row--with-control">
            <span className="settings-row__label">启动恢复上次播放</span>
            <input
              type="checkbox"
              checked={restorePlayback}
              onChange={handleToggleSetting('restorePlayback')}
              className="settings-switch"
            />
          </label>
          <div className="settings-note">下次打开应用时，自动继续上次的歌曲与进度。</div>
          <label className="settings-row settings-row--with-control">
            <span className="settings-row__label">开机自启动</span>
            <input
              type="checkbox"
              checked={autoLaunch}
              onChange={handleToggleSetting('autoLaunch')}
              className="settings-switch"
            />
          </label>
          <label className="settings-row settings-row--with-control">
            <span className="settings-row__label">桌面歌词</span>
            <input
              type="checkbox"
              checked={desktopLyrics}
              onChange={handleToggleSetting('desktopLyrics')}
              className="settings-switch"
            />
          </label>
          <div className="settings-note">开启后在桌面显示可置顶的悬浮歌词窗口。</div>
        </div>
      </section>

      <section className="settings-group-card">
        <div className="settings-group-card__header">
          <h3 className="settings-group-card__title">外观设置</h3>
        </div>
        <div className="settings-group-card__body">
          <label className="settings-row settings-row--with-control">
            <span className="settings-row__label">外观模式</span>
            <select
              value={themeMode}
              onChange={handleThemeModeChange}
              className="settings-select"
            >
              {THEME_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-note">「跟随系统」会自动切换明暗，需配合下方预设主题使用。</div>
          <div className="settings-note">预设主题</div>
          <div className="settings-theme-grid">
            {PRESET_THEMES.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPresetTheme(preset.theme)}
                className={`settings-theme-item${isSameTheme(theme, preset.theme) ? ' active' : ''}`}
              >
                <div
                  className="settings-theme-item__color"
                  style={{
                    background: `linear-gradient(135deg, ${preset.theme.background} 0 50%, ${preset.theme.primary} 50% 100%)`,
                  }}
                />
                <span className="settings-theme-item__name">{preset.name}</span>
                <span className="settings-theme-item__mode">{preset.mode}</span>
              </button>
            ))}
          </div>
          <div className="settings-note">自定义主题色</div>
          <div className="settings-row settings-row--with-control">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="settings-color-input"
            />
            <button onClick={applyCustomColor} className="settings-btn">
              应用
            </button>
          </div>
        </div>
      </section>

      <section className="settings-group-card">
        <div className="settings-group-card__header">
          <h3 className="settings-group-card__title">数据与诊断</h3>
        </div>
        <div className="settings-group-card__body">
          <label className="settings-row settings-row--with-control">
            <span className="settings-row__label">下载目录</span>
            <button
              type="button"
              className="settings-btn"
              disabled={dirBusy}
              onClick={() => void handlePickDownloadDir()}
            >
              选择…
            </button>
          </label>
          <div className="settings-note settings-note--path" title={downloadDir}>
            {downloadDir || '使用系统默认下载目录'}
          </div>
          <div className="settings-row settings-row--with-control">
            <span className="settings-row__label">清除缓存</span>
            <button
              type="button"
              className="settings-btn"
              disabled={cacheBusy}
              onClick={() => void handleClearCache()}
            >
              清除
            </button>
          </div>
          <div className="settings-note">
            清除搜索 / 封面缓存，不影响歌单、收藏与设置。建议缓存异常时使用。
          </div>
          <div className="settings-note" style={{ marginTop: 4 }}>
            导出包含歌单、收藏、最近播放、设置；导入会覆盖本地数据。
          </div>
          <div className="settings-row settings-row--with-control" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              disabled={backupBusy}
              onClick={() => void handleExportBackup()}
            >
              导出备份
            </button>
            <button
              type="button"
              className="settings-btn"
              disabled={backupBusy}
              onClick={() => void handleImportBackup()}
            >
              导入备份
            </button>
            <button type="button" className="settings-btn" onClick={() => void handleOpenLogs()}>
              打开日志目录
            </button>
          </div>
        </div>
      </section>

      <section className="settings-group-card">
        <div className="settings-group-card__header">
          <h3 className="settings-group-card__title">快捷键</h3>
        </div>
        <div className="settings-group-card__body settings-about">
          <div>媒体键 播放/暂停 · 上一首 · 下一首（系统媒体键 / 任务栏媒体控件）</div>
          <div>顶栏搜索框回车：全局搜索</div>
          <div>底栏：循环菜单直接选模式 · 音质 · 睡眠定时</div>
          <div>托盘：双击显示窗口 / 右键控制播放</div>
        </div>
      </section>

      <section className="settings-group-card">
        <div className="settings-group-card__header">
          <h3 className="settings-group-card__title">关于</h3>
        </div>
        <div className="settings-group-card__body settings-about">
          <div className="settings-about__hero">
            <AppLogo size={44} />
            <div className="settings-about__headline">
              <div className="settings-about__name">左耳</div>
              <div className="settings-about__version">v{appVersion}</div>
            </div>
          </div>
          <div className="settings-about__desc">
            左耳是一款专注于「找得到、听得爽」的桌面音乐播放器。内置 QQ 音乐解析与多平台聚合搜索，
            同时支持本地音乐、在线点播、歌单管理、收听收藏与一键下载。
          </div>
          <div className="settings-about__features">
            <span>内置 QQ 解析</span>
            <span>多平台搜索</span>
            <span>本地音乐</span>
            <span>歌单管理</span>
            <span>我的收藏</span>
            <span>在线下载</span>
            <span>桌面歌词</span>
            <span>多主题换肤</span>
          </div>
          <div className="settings-about__tech">Electron + React · 轻量 · 本地优先</div>
          <div className="settings-row settings-row--with-control" style={{ marginTop: 12, gap: 8 }}>
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              disabled={updateBusy}
              onClick={() => void handleCheckUpdate()}
            >
              {updateBusy ? '检查中…' : '检查更新'}
            </button>
            {updateInfo?.url ? (
              <button
                type="button"
                className="settings-btn"
                onClick={() => void openExternal(updateInfo.url!)}
              >
                打开发布页
              </button>
            ) : null}
          </div>
          {updateInfo ? (
            <div className="settings-note" style={{ marginTop: 8 }}>
              {updateInfo.hasUpdate
                ? `新版本 v${updateInfo.latest} 可用（当前 v${updateInfo.current}）`
                : updateInfo.message || `当前 v${updateInfo.current} 已是最新`}
            </div>
          ) : null}
          <div className="settings-about__footer">© 左耳 Contributors · 仅供学习交流使用</div>
        </div>
      </section>
    </div>
  );
}
