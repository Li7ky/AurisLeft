import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../components/common/Toast/useToast';
import { Quality } from '../../types';
import type { ThemeConfig } from '../../types';
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
      background: '#0c0e12',
      surface: '#141820',
      textPrimary: '#f3f1ec',
      textSecondary: '#8a8794',
      accent: '#9b8cff',
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
      primary: '#16a34a',
      background: '#f8fafc',
      surface: '#ffffff',
      textPrimary: '#111827',
      textSecondary: '#64748b',
      accent: '#22c55e',
    },
  },
  {
    name: '晴空蓝',
    mode: '明亮',
    theme: {
      primary: '#2563eb',
      background: '#f4f7fb',
      surface: '#ffffff',
      textPrimary: '#172033',
      textSecondary: '#667085',
      accent: '#38bdf8',
    },
  },
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
  const { theme, defaultQuality, autoPlayNext, showLyric, setTheme, setSetting } =
    useSettingsStore();
  const { addToast } = useToast();

  const [customColor, setCustomColor] = useState(theme.primary);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [nkiStatus, setNkiStatus] = useState<NkiQqStatus | null>(null);
  const [nkiKeyInput, setNkiKeyInput] = useState('');
  const [nkiBusy, setNkiBusy] = useState(false);

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
      addToast(s.hasKey ? 'QQ 解析密钥已保存' : '密钥已清空', 'success');
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
      addToast(next ? '已开启西瓜糖 QQ 解析' : '已关闭西瓜糖 QQ 解析', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`切换失败：${message}`, 'error');
    } finally {
      setNkiBusy(false);
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
              西瓜糖 QQ 解析
              <span className="settings-source-section__badge">
                {nkiReady ? `已启用 · ${nkiStatus?.keyHint || ''}` : nkiStatus?.hasKey ? '已关' : '未配置'}
              </span>
            </div>
            <div className="settings-note">
              使用 api.nki.pw 解析 QQ 音乐直链，付费曲优先走这里。曲库搜索仍用公开接口。
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
              API Key（当前不显示完整密钥；输入新密钥可覆盖）
            </div>
            <div className="settings-row settings-row--with-control" style={{ gap: 8, marginTop: 6 }}>
              <input
                type="password"
                className="settings-select"
                style={{ flex: 1, minWidth: 0 }}
                placeholder={nkiStatus?.hasKey ? '已保存，输入新密钥可覆盖' : '粘贴 apikey'}
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
        </div>
      </section>

      <section className="settings-group-card">
        <div className="settings-group-card__header">
          <h3 className="settings-group-card__title">外观设置</h3>
        </div>
        <div className="settings-group-card__body">
          <div className="settings-note">预设主题（暗色 / 明亮）</div>
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
          <div className="settings-note">
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
          <div>AurisLeft v{appVersion}</div>
          <div>Electron + React 桌面音乐播放器</div>
          <div>西瓜糖 QQ 解析 · 多平台搜索 · 歌单 · 本地 · 收藏 · 下载</div>
          <div className="settings-row settings-row--with-control" style={{ marginTop: 10, gap: 8 }}>
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
        </div>
      </section>
    </div>
  );
}
