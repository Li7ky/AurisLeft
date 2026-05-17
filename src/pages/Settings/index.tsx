import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../components/common/Toast/useToast';
import { Quality } from '../../types';
import type { ThemeConfig } from '../../types';
import './index.css';

interface SourceInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

const PRESET_THEMES: { name: string; mode: '暗色' | '明亮'; theme: ThemeConfig }[] = [
  {
    name: '暗夜绿',
    mode: '暗色',
    theme: {
      primary: '#1DB954',
      background: '#121212',
      surface: '#1e1e1e',
      textPrimary: '#ffffff',
      textSecondary: '#b3b3b3',
      accent: '#1ed760',
    },
  },
  {
    name: '深海蓝',
    mode: '暗色',
    theme: {
      primary: '#1a73e8',
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
      primary: '#8b5cf6',
      background: '#13111c',
      surface: '#1e1b2e',
      textPrimary: '#ffffff',
      textSecondary: '#a1a1aa',
      accent: '#a78bfa',
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

  useEffect(() => {
    setCustomColor(theme.primary);
  }, [theme.primary]);

  // 设置页仅查询已加载音源，避免重复触发加载
  useEffect(() => {
    const refreshSources = async () => {
      try {
        const sources = await invoke<SourceInfo[]>('list_sources');
        setLoadedSources(sources);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast(`加载音源失败：${message}`, 'error');
      }
    };

    refreshSources();
  }, [addToast]);

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
          // Save as sources.json config and load
          await invoke('save_sources_config', { content });
          const sources = await invoke<SourceInfo[]>('load_sources_from_file');
          setLoadedSources(sources);
          addToast('音源导入成功', 'success');
        } else if (ext === 'js') {
          // Register a single JS source directly
          await invoke('register_js_source', { code: content });
          const sources = await invoke<SourceInfo[]>('list_sources');
          setLoadedSources(sources);
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
          <div className="settings-note">当前已加载音源：{loadedSources.length} 个</div>
          {loadedSources.length > 0 && (
            <div className="settings-source-list" style={{ marginTop: '10px' }}>
              {loadedSources.map((source) => (
                <div
                  key={source.id}
                  className="settings-source-item"
                >
                  <span className="settings-source-item__name">{source.name}</span>
                  <span className="settings-source-item__status">已启用</span>
                </div>
              ))}
            </div>
          )}
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
          <h3 className="settings-group-card__title">关于</h3>
        </div>
        <div className="settings-group-card__body settings-about">
          <div>左耳 v0.1.0</div>
          <div>基于 Tauri 2.x + React 构建</div>
          <div>支持多音源搜索、歌词显示、歌单管理</div>
        </div>
      </section>
    </div>
  );
}
