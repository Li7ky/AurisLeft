import { useState } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import { Quality } from "../../types";
import type { ThemeConfig } from "../../types";

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
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>设置</h2>

      {/* Source Management */}
      <section style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>音源管理</h3>
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <button
            onClick={handleImportSource}
            style={{
              padding: "8px 16px",
              background: "var(--primary)",
              color: "var(--background)",
              borderRadius: "4px",
              fontWeight: 500,
            }}
          >
            导入音源
          </button>
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          当前已加载音源: 0 个
        </div>
      </section>

      {/* Playback */}
      <section style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>播放设置</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            默认音质:
            <select
              value={defaultQuality}
              onChange={handleQualityChange}
              style={{
                background: "var(--surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "4px 8px",
              }}
            >
              <option value={Quality.K128}>128K</option>
              <option value={Quality.K320}>320K</option>
              <option value={Quality.FLAC}>FLAC</option>
              <option value={Quality.HiRes}>Hi-Res</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input type="checkbox" checked={autoPlayNext} onChange={handleAutoPlayChange} />
            自动播放下一首
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input type="checkbox" checked={showLyric} onChange={handleShowLyricChange} />
            显示歌词
          </label>
        </div>
      </section>

      {/* Appearance */}
      <section style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>外观设置</h3>
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>
            预设主题
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            {PRESET_THEMES.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPresetTheme(preset.theme)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px",
                  borderRadius: "8px",
                  border: theme.primary === preset.theme.primary ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: preset.theme.surface,
                  cursor: "pointer",
                  minWidth: "80px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: preset.theme.primary,
                  }}
                />
                <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>
            自定义主题色
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              style={{ width: "36px", height: "36px", border: "none", cursor: "pointer" }}
            />
            <button
              onClick={applyCustomColor}
              style={{
                padding: "6px 14px",
                background: "var(--surface-hover)",
                color: "var(--text-primary)",
                borderRadius: "4px",
              }}
            >
              应用
            </button>
          </div>
        </div>
      </section>

      {/* About */}
      <section>
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>关于</h3>
        <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.8 }}>
          <div>Music Player v0.1.0</div>
          <div>基于 Tauri 2.x + React 18 构建</div>
          <div>支持多音源搜索、歌词显示、歌单管理</div>
        </div>
      </section>
    </div>
  );
}
