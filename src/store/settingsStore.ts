import { create } from 'zustand';
import {
  loadSettings as desktopLoadSettings,
  saveSettings as desktopSaveSettings,
  setTheme as desktopSetTheme,
  setThemeMode as desktopSetThemeMode,
  openLyricWindow as desktopOpenLyricWindow,
  closeLyricWindow as desktopCloseLyricWindow,
} from '../utils/desktop';
import type {
  ThemeConfig,
  AppSettings,
  PlayerSettings,
  ThemeMode,
  Song,
} from '../types';
import { Quality, RepeatMode } from '../types';
import { songKey } from '../utils/song';

interface SettingsState {
  theme: ThemeConfig;
  defaultQuality: Quality;
  autoPlayNext: boolean;
  showLyric: boolean;
  /** Last-known player prefs (also mirrored in playerStore) */
  volume: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  loading: boolean;
  error: string | null;
  /** Full sources block preserved across saves */
  sources: AppSettings['sources'];
  /** 主题深浅：跟随预设 / 强制亮 / 强制暗 / 跟随系统 */
  themeMode: ThemeMode;
  /** 开机自启 */
  autoLaunch: boolean;
  /** 启动恢复上次播放 */
  restorePlayback: boolean;
  /** 播放淡入淡出 */
  fadeSwitch: boolean;
  /** 桌面歌词 */
  desktopLyrics: boolean;
  /** 上次播放快照（歌曲 + 进度），用于「启动恢复上次播放」 */
  lastPlayback: PlayerSettings['lastPlayback'];
}

type ToastFn = ((message: string, type?: 'success' | 'error' | 'info') => void) | undefined;

interface SettingsActions {
  setTheme: (theme: ThemeConfig, toast?: ToastFn) => Promise<void>;
  setSetting: (key: string, value: unknown, toast?: ToastFn) => Promise<void>;
  loadSettings: (toast?: ToastFn) => Promise<void>;
  saveSettings: (toast?: ToastFn) => Promise<void>;
  /** Patch player prefs without toast spam (volume/shuffle/repeat) */
  persistPlayerPrefs: (partial: Partial<PlayerSettings>) => Promise<void>;
  /** 切换主题深浅模式并同步系统 */
  setThemeMode: (mode: ThemeMode, toast?: ToastFn) => Promise<void>;
  /** 切换桌面歌词窗口 */
  setDesktopLyrics: (enabled: boolean, toast?: ToastFn) => Promise<void>;
  /** 保存播放快照（切歌/暂停/播放中节流） */
  persistPlaybackSnapshot: (snapshot: NonNullable<PlayerSettings['lastPlayback']>) => Promise<void>;
  /** 清空播放快照（用户主动停止时） */
  clearPlaybackSnapshot: () => Promise<void>;
}

type SettingsStore = SettingsState & SettingsActions;

const defaultTheme: ThemeConfig = {
  primary: '#e8a54b',
  background: '#0a0c10',
  surface: '#12161e',
  textPrimary: '#f4f2ed',
  textSecondary: '#7e7b88',
  accent: '#a594ff',
};

const defaultSources: AppSettings['sources'] = {
  timeoutMs: 8000,
  failThreshold: 3,
  cacheDurationMinutes: 30,
};

function isLightColor(hexColor: string) {
  const normalized = hexColor.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return false;
  }

  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

  return luminance > 0.55;
}

/** Mix hex with black/white; amount 0–1 toward the mix color */
function mixHex(hex: string, withColor: '#000000' | '#ffffff', amount: number): string {
  const n = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(n)) return hex;
  const t = withColor === '#ffffff' ? 255 : 0;
  const mix = (c: number) => Math.round(c + (t - c) * amount);
  const r = mix(parseInt(n.slice(0, 2), 16));
  const g = mix(parseInt(n.slice(2, 4), 16));
  const b = mix(parseInt(n.slice(4, 6), 16));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function resolveThemeMode(theme: ThemeConfig, mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  if (mode === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return isLightColor(theme.background) ? 'light' : 'dark';
}

/**
 * 主题应用：侧栏/高亮/描边/tint 必须与 background 同系，
 * 避免「浅色主区 + 纯黑侧栏」割裂（用户截图问题）。
 * themeMode: manual 时按主题背景亮度决定深浅；其余强制对应模式。
 */
function applyThemeVariables(theme: ThemeConfig, themeMode: ThemeMode = 'manual') {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const light = resolveThemeMode(theme, themeMode) === 'light';
  const mode = light ? 'light' : 'dark';

  // 侧栏：略深于底，但绝不能跳到纯黑/纯白
  const sidebar = light
    ? mixHex(theme.background, '#000000', 0.04)
    : mixHex(theme.background, '#000000', 0.22);
  const highlight = light
    ? mixHex(theme.surface, '#000000', 0.05)
    : mixHex(theme.surface, '#ffffff', 0.06);
  const press = light
    ? mixHex(theme.background, '#000000', 0.08)
    : mixHex(theme.background, '#000000', 0.35);

  root.dataset.theme = mode;
  root.style.colorScheme = mode;

  root.style.setProperty('--accent-primary', theme.primary);
  root.style.setProperty('--accent-primary-hover', mixHex(theme.primary, '#ffffff', 0.12));
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--background', theme.background);
  root.style.setProperty('--bg-base', theme.background);
  root.style.setProperty('--bg-sidebar', sidebar);
  root.style.setProperty('--surface', theme.surface);
  root.style.setProperty('--bg-elevated', theme.surface);
  root.style.setProperty('--bg-highlight', highlight);
  root.style.setProperty('--bg-press', press);
  root.style.setProperty('--bg-glass-player', light ? 'rgba(255,255,255,0.92)' : 'rgba(16,18,24,0.94)');
  root.style.setProperty('--bg-glass-heavy', light ? 'rgba(255,255,255,0.94)' : 'rgba(12,14,18,0.94)');

  root.style.setProperty(
    '--bg-tinted',
    light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)'
  );
  root.style.setProperty(
    '--bg-tinted-strong',
    light ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.1)'
  );

  root.style.setProperty('--text-primary', theme.textPrimary);
  root.style.setProperty('--text-base', theme.textPrimary);
  root.style.setProperty('--text-secondary', theme.textSecondary);
  root.style.setProperty('--text-subdued', theme.textSecondary);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--text-bright-accent', theme.primary);
  root.style.setProperty('--essential-bright-accent', theme.primary);
  root.style.setProperty(
    '--accent-gradient',
    `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`
  );
  root.style.setProperty('--accent-primary-dim', `${theme.primary}22`);
  root.style.setProperty('--accent-primary-soft', `${theme.primary}14`);
  root.style.setProperty('--surface-bg', theme.surface);

  root.style.setProperty(
    '--decorative-border',
    light ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.06)'
  );
  root.style.setProperty(
    '--decorative-border-light',
    light ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'
  );
  root.style.setProperty(
    '--decorative-hairline',
    light ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)'
  );
  root.style.setProperty('--border', light ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.06)');
  root.style.setProperty('--text-on-accent', light ? '#ffffff' : '#14110c');
}

function buildAppSettings(state: SettingsState): AppSettings {
  return {
    player: {
      defaultQuality: state.defaultQuality,
      autoPlayNext: state.autoPlayNext,
      volume: state.volume,
      shuffle: state.shuffle,
      repeatMode: state.repeatMode,
      autoLaunch: state.autoLaunch,
      restorePlayback: state.restorePlayback,
      fadeSwitch: state.fadeSwitch,
      lastPlayback: state.lastPlayback,
    },
    appearance: {
      theme: state.theme,
      showLyric: state.showLyric,
      themeMode: state.themeMode,
      desktopLyrics: state.desktopLyrics,
    },
    sources: state.sources,
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  theme: defaultTheme,
  defaultQuality: Quality.K320,
  autoPlayNext: true,
  showLyric: true,
  volume: 0.8,
  shuffle: false,
  repeatMode: RepeatMode.None,
  loading: false,
  error: null,
  sources: defaultSources,
  themeMode: 'manual',
  autoLaunch: false,
  restorePlayback: false,
  fadeSwitch: true,
  desktopLyrics: false,
  lastPlayback: null,

  setTheme: async (theme: ThemeConfig, toast?: ToastFn) => {
    try {
      set({ theme });
      applyThemeVariables(theme, get().themeMode);
      await desktopSetTheme(theme);
      await desktopSaveSettings(buildAppSettings(get()));
      toast?.('主题已更新', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  setThemeMode: async (mode: ThemeMode, toast?: ToastFn) => {
    try {
      set({ themeMode: mode });
      applyThemeVariables(get().theme, mode);
      await desktopSetThemeMode(mode);
      await desktopSaveSettings(buildAppSettings(get()));
      toast?.('外观模式已更新', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  setDesktopLyrics: async (enabled: boolean, toast?: ToastFn) => {
    try {
      set({ desktopLyrics: enabled });
      if (enabled) {
        await desktopOpenLyricWindow();
      } else {
        await desktopCloseLyricWindow();
      }
      await desktopSaveSettings(buildAppSettings(get()));
      toast?.(enabled ? '已开启桌面歌词' : '已关闭桌面歌词', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  persistPlaybackSnapshot: async (snapshot) => {
    set({ lastPlayback: snapshot });
    // 复用防抖写入，避免播放中频繁落盘
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void desktopSaveSettings(buildAppSettings(get())).catch(() => undefined);
    }, 800);
  },

  clearPlaybackSnapshot: async () => {
    set({ lastPlayback: null });
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void desktopSaveSettings(buildAppSettings(get())).catch(() => undefined);
    }, 200);
  },

  setSetting: async (key: string, value: unknown, toast?: ToastFn) => {
    set(() => {
      const newState: Partial<SettingsState> = {};
      switch (key) {
        case 'defaultQuality':
          newState.defaultQuality = value as Quality;
          break;
        case 'autoPlayNext':
          newState.autoPlayNext = value as boolean;
          break;
        case 'showLyric':
          newState.showLyric = value as boolean;
          break;
        case 'theme':
          newState.theme = value as ThemeConfig;
          break;
        case 'volume':
          newState.volume = value as number;
          break;
        case 'shuffle':
          newState.shuffle = value as boolean;
          break;
        case 'repeatMode':
          newState.repeatMode = value as RepeatMode;
          break;
        case 'autoLaunch':
          newState.autoLaunch = value as boolean;
          break;
        case 'restorePlayback':
          newState.restorePlayback = value as boolean;
          break;
        case 'fadeSwitch':
          newState.fadeSwitch = value as boolean;
          break;
        case 'themeMode':
          newState.themeMode = value as ThemeMode;
          break;
        case 'desktopLyrics':
          newState.desktopLyrics = value as boolean;
          break;
      }
      return newState;
    });

    // Keep playerStore quality in sync when default quality changes
    if (key === 'defaultQuality') {
      try {
        const { usePlayerStore } = await import('./playerStore');
        usePlayerStore.getState().setQuality(value as Quality);
      } catch {
        /* ignore */
      }
    }

    // Side effects for new settings
    try {
      if (key === 'autoLaunch') {
        const { setAutoLaunch } = await import('../utils/desktop');
        await setAutoLaunch(Boolean(value));
      } else if (key === 'themeMode') {
        const mode = value as ThemeMode;
        applyThemeVariables(get().theme, mode);
        await desktopSetThemeMode(mode);
      } else if (key === 'desktopLyrics') {
        if (value) {
          await desktopOpenLyricWindow();
        } else {
          await desktopCloseLyricWindow();
        }
      }
    } catch {
      /* 副作用失败不阻断保存 */
    }

    try {
      await desktopSaveSettings(buildAppSettings(get()));
      toast?.('设置已保存', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      toast?.(message, 'error');
    }
  },

  loadSettings: async (toast?: ToastFn) => {
    set({ loading: true, error: null });
    try {
      const settings: AppSettings = await desktopLoadSettings();
      const volume =
        typeof settings.player.volume === 'number' && Number.isFinite(settings.player.volume)
          ? Math.min(1, Math.max(0, settings.player.volume))
          : 0.8;
      const shuffle = Boolean(settings.player.shuffle);
      const repeatMode = (settings.player.repeatMode as RepeatMode) || RepeatMode.None;
      const defaultQuality = settings.player.defaultQuality || Quality.K320;
      const themeMode = (settings.appearance.themeMode as ThemeMode) || 'manual';
      const autoLaunch = Boolean(settings.player.autoLaunch);
      const restorePlayback = Boolean(settings.player.restorePlayback);
      const fadeSwitch = settings.player.fadeSwitch !== false;
      const desktopLyrics = Boolean(settings.appearance.desktopLyrics);
      const lastPlayback = settings.player.lastPlayback || null;

      set({
        theme: settings.appearance.theme,
        defaultQuality,
        autoPlayNext: settings.player.autoPlayNext !== false,
        showLyric: settings.appearance.showLyric !== false,
        volume,
        shuffle,
        repeatMode,
        sources: settings.sources || defaultSources,
        themeMode,
        autoLaunch,
        restorePlayback,
        fadeSwitch,
        desktopLyrics,
        lastPlayback,
        loading: false,
      });
      applyThemeVariables(settings.appearance.theme, themeMode);
      // 同步系统主题源（系统模式下的标题栏/原生控件）
      if (themeMode && themeMode !== 'manual') {
        await desktopSetThemeMode(themeMode).catch(() => undefined);
      }

      // 开机自启以操作系统为准（用户可能手动改过）
      try {
        const { getAutoLaunch } = await import('../utils/desktop');
        const res = await getAutoLaunch();
        if (res && typeof res.enabled === 'boolean') set({ autoLaunch: res.enabled });
      } catch {
        /* ignore */
      }

      // Hydrate player store (dynamic import avoids circular init issues)
      const { usePlayerStore } = await import('./playerStore');
      usePlayerStore.getState().hydrateFromSettings({
        volume,
        quality: defaultQuality,
        shuffle,
        repeatMode,
      });

      // 启动恢复上次播放
      if (restorePlayback && lastPlayback?.song) {
        const progress =
          typeof lastPlayback.progress === 'number' && Number.isFinite(lastPlayback.progress)
            ? lastPlayback.progress
            : 0;
        if (progress <= 0) return;
        try {
          await usePlayerStore.getState().play(lastPlayback.song as Song, undefined, undefined, true);
          if (progress > 3) {
            // 等缓冲基本就绪再定位，避免 seek 被忽略
            setTimeout(() => {
              const st = usePlayerStore.getState();
              // 1.5s 内用户可能已切歌：只对同一首歌恢复进度，防止新歌被误跳到旧进度
              if (!st.currentSong || songKey(st.currentSong) !== songKey(lastPlayback.song as Song)) {
                return;
              }
              const target = Math.min(progress, st.duration > 0 ? st.duration : progress);
              void st.seek(target).catch(() => undefined);
            }, 1500);
          }
        } catch {
          /* 恢复失败不提示，静默进入默认状态 */
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: message });
      toast?.(message, 'error');
    }
  },

  saveSettings: async (toast?: ToastFn) => {
    try {
      await desktopSaveSettings(buildAppSettings(get()));
      toast?.('设置已保存', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  persistPlayerPrefs: async (partial: Partial<PlayerSettings>) => {
    set((s) => ({
      volume: partial.volume ?? s.volume,
      shuffle: partial.shuffle ?? s.shuffle,
      repeatMode: (partial.repeatMode as RepeatMode) ?? s.repeatMode,
      defaultQuality: (partial.defaultQuality as Quality) ?? s.defaultQuality,
      autoPlayNext: partial.autoPlayNext ?? s.autoPlayNext,
    }));

    // Debounce disk writes for slider drags
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void desktopSaveSettings(buildAppSettings(get())).catch(() => undefined);
    }, 400);
  },
}));
