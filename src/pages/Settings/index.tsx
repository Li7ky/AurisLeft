import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../components/common/Toast/useToast';
import { Quality } from '../../types';
import type { ThemeConfig } from '../../types';
import {
  listSources,
  loadSourcesFromFile,
  registerSource,
  getLxStatus,
  toggleLxSource,
  toggleSource,
  type LxHostInfo,
} from '../../utils/tauri';
import { invoke } from '../../utils/ipc';
import './index.css';

interface SourceInfo {
  id: string;
  name: string;
  version?: string;
  enabled?: boolean;
}

interface LxStatus {
  enabled: boolean;
  count: number;
  total?: number;
  ready?: boolean;
  initializing?: boolean;
  names: string[];
  hosts?: LxHostInfo[];
}

const PLATFORM_LABEL: Record<string, string> = {
  wy: '网易云',
  kw: '酷我',
  kg: '酷狗',
  tx: 'QQ',
  mg: '咪咕',
  local: '本地',
  git: 'Git',
};

function formatPlatforms(platforms: string[] = []) {
  if (!platforms.length) return '—';
  return platforms.map((p) => PLATFORM_LABEL[p] || p).join(' · ');
}

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
  const [loadedSources, setLoadedSources] = useState<SourceInfo[]>([]);
  const [lxStatus, setLxStatus] = useState<LxStatus | null>(null);

  useEffect(() => {
    setCustomColor(theme.primary);
  }, [theme.primary]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refreshSources = async () => {
      try {
        const [sources, lx] = await Promise.all([
          listSources(),
          getLxStatus().catch(() => null),
        ]);
        if (cancelled) return;
        setLoadedSources(sources);
        if (lx) setLxStatus(lx);
        // 初始化中时轮询，直到就绪
        if (lx?.initializing) {
          timer = setTimeout(refreshSources, 1500);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        addToast(`加载音源失败：${message}`, 'error');
      }
    };

    refreshSources();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [addToast]);

  const refreshAll = async () => {
    const [sources, lx] = await Promise.all([
      listSources(),
      getLxStatus().catch(() => null),
    ]);
    setLoadedSources(sources);
    if (lx) setLxStatus(lx);
  };

  const handleToggleLx = async (host: LxHostInfo) => {
    try {
      const next = !(host.enabled !== false);
      await toggleLxSource(host.id, next);
      await refreshAll();
      addToast(next ? `已开启「${host.name}」` : `已关闭「${host.name}」`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`切换失败：${message}`, 'error');
    }
  };

  const handleToggleUserSource = async (source: SourceInfo) => {
    try {
      await toggleSource(source.id);
      await refreshAll();
      addToast(
        source.enabled === false ? `已开启「${source.name}」` : `已关闭「${source.name}」`,
        'success'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`切换失败：${message}`, 'error');
    }
  };

  const handleImportSource = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.js';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const content = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase();

      try {
        if (ext === 'json') {
          await invoke('save_sources_config', { content });
          await loadSourcesFromFile();
          await refreshAll();
          addToast('音源导入成功', 'success');
        } else if (ext === 'js') {
          await registerSource('js', file.name, content);
          await refreshAll();
          addToast('音源导入成功', 'success');
        } else {
          addToast('仅支持导入 .json 或 .js 音源文件', 'error');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addToast(`导入音源失败：${message}`, 'error');
      }
    };
    input.click();
  };

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

  return (
    <div className="settings-compact">
      <h2 className="settings-compact__title">设置</h2>

      <section className="settings-group-card">
        <div className="settings-group-card__header">
          <h3 className="settings-group-card__title">音源管理</h3>
        </div>
        <div className="settings-group-card__body">
          <button onClick={handleImportSource} className="settings-btn settings-btn--primary">
            导入音源
          </button>
          <div className="settings-note" style={{ marginTop: 8 }}>
            曲库搜索使用公开接口；播放取链仅使用下方已开启的音源。可单独开关每一项。
          </div>

          <div className="settings-source-section">
            <div className="settings-source-section__title">
              播放音源（洛雪兼容）
              {lxStatus ? (
                <span className="settings-source-section__badge">
                  {lxStatus.initializing
                    ? '初始化中…'
                    : `已开 ${lxStatus.count}/${lxStatus.total ?? lxStatus.count}`}
                </span>
              ) : null}
            </div>
            <div className="settings-note">来自 pdone/lx-music-source，可自由开关。</div>
            {lxStatus?.initializing && !(lxStatus.hosts?.length) ? (
              <div className="settings-note" style={{ marginTop: 8, color: 'var(--accent-primary)' }}>
                正在初始化音源，请稍候…
              </div>
            ) : null}
            {lxStatus?.hosts && lxStatus.hosts.length > 0 ? (
              <div className="settings-source-list">
                {lxStatus.hosts.map((host) => {
                  const on = host.enabled !== false;
                  return (
                    <div key={host.id} className="settings-source-item settings-source-item--lx">
                      <div className="settings-source-item__main">
                        <span className="settings-source-item__name">{host.name}</span>
                        <span className="settings-source-item__meta">
                          {host.ready ? '已就绪' : '未就绪'}
                          {host.version ? ` · v${host.version}` : ''}
                          {' · '}
                          {formatPlatforms(host.platforms)}
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        className={`settings-toggle${on ? ' is-on' : ''}`}
                        title={on ? '点击关闭' : '点击开启'}
                        disabled={!host.ready && !on}
                        onClick={() => void handleToggleLx(host)}
                      >
                        <span className="settings-toggle__knob" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : !lxStatus?.initializing ? (
              <div className="settings-note" style={{ marginTop: 8 }}>
                暂无内置音源。请重启应用以重新加载。
              </div>
            ) : null}
          </div>

          {loadedSources.length > 0 ? (
            <div className="settings-source-section">
              <div className="settings-source-section__title">用户导入音源</div>
              <div className="settings-source-list">
                {loadedSources.map((source) => {
                  const on = source.enabled !== false;
                  return (
                    <div key={source.id} className="settings-source-item">
                      <div className="settings-source-item__main">
                        <span className="settings-source-item__name">{source.name}</span>
                        {source.version ? (
                          <span className="settings-source-item__meta">v{source.version}</span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        className={`settings-toggle${on ? ' is-on' : ''}`}
                        title={on ? '点击关闭' : '点击开启'}
                        onClick={() => void handleToggleUserSource(source)}
                      >
                        <span className="settings-toggle__knob" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
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
          <h3 className="settings-group-card__title">快捷键</h3>
        </div>
        <div className="settings-group-card__body settings-about">
          <div>媒体键 播放/暂停 · 上一首 · 下一首（系统媒体键）</div>
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
          <div>AurisLeft v0.2.0-beta · 测试版</div>
          <div>Electron + React 桌面音乐播放器</div>
          <div>多音源搜索 · 歌词 · 歌单 · 本地 · 收藏 · 最近播放 · 下载</div>
          <div className="settings-note">当前为测试分支，功能与稳定性仍在迭代中。</div>
        </div>
      </section>
    </div>
  );
}
