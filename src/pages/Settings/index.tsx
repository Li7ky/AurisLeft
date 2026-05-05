import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../store/settingsStore";
import { Quality } from "../../types";
import type { ThemeConfig } from "../../types";
import "./index.css";

interface SourceInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

const PRESET_THEMES: { name: string; theme: ThemeConfig }[] = [
  {
    name: "默认绿",
    theme: {
      primary: "#1DB954",
      background: "#121212",
      surface: "#1e1e1e",
      textPrimary: "#ffffff",
      textSecondary: "#b3b3b3",
      accent: "#1ed760",
    },
  },
  {
    name: "深海蓝",
    theme: {
      primary: "#1a73e8",
      background: "#0d1117",
      surface: "#161b22",
      textPrimary: "#e6edf3",
      textSecondary: "#8b949e",
      accent: "#58a6ff",
    },
  },
  {
    name: "暮光紫",
    theme: {
      primary: "#8b5cf6",
      background: "#13111c",
      surface: "#1e1b2e",
      textPrimary: "#ffffff",
      textSecondary: "#a1a1aa",
      accent: "#a78bfa",
    },
  },
];

export default function Settings() {
  const {
    theme,
    defaultQuality,
    autoPlayNext,
    showLyric,
    setTheme,
    setSetting,
  } = useSettingsStore();

  const [customColor, setCustomColor] = useState(theme.primary);
  const [loadedSources, setLoadedSources] = useState<SourceInfo[]>([]);

  // 应用启动时自动加载音源
  useEffect(() => {
    const loadSources = async () => {
      try {
        console.log("[Settings] 调用 load_sources_from_file");
        const sources = await invoke<SourceInfo[]>("load_sources_from_file");
        console.log("[Settings] 加载到的音源:", sources);
        setLoadedSources(sources);
      } catch (error) {
        console.error("[Settings] 加载音源失败:", error);
      }
    };

    loadSources();
  }, []);

  const handleImportSource = async () => {
    console.log("Import source triggered - file dialog would open here");
  };

  const handleQualityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSetting("defaultQuality", e.target.value as Quality);
  };

  const handleAutoPlayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSetting("autoPlayNext", e.target.checked);
  };

  const handleShowLyricChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSetting("showLyric", e.target.checked);
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
            <div className="settings-source-list" style={{ marginTop: "10px" }}>
              {loadedSources.map((source) => (
                <div key={source.id} className="settings-source-item" style={{
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "4px",
                  marginBottom: "6px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span style={{ color: "#fff" }}>{source.name}</span>
                  <span style={{ fontSize: "12px", color: "#1DB954" }}>已启用</span>
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
            <select value={defaultQuality} onChange={handleQualityChange} className="settings-select">
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
          <div className="settings-note">预设主题</div>
          <div className="settings-theme-grid">
            {PRESET_THEMES.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPresetTheme(preset.theme)}
                className={`settings-theme-item${theme.primary === preset.theme.primary ? " active" : ""}`}
              >
                <div className="settings-theme-item__color" style={{ background: preset.theme.primary }} />
                <span className="settings-theme-item__name">{preset.name}</span>
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
          <div>基于 Tauri 2.x + React 18 构建</div>
          <div>支持多音源搜索、歌词显示、歌单管理</div>
        </div>
      </section>
    </div>
  );
}
