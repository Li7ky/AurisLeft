import { create } from 'zustand';
import {
  loadSettings as tauriLoadSettings,
  saveSettings as tauriSaveSettings,
  setTheme as tauriSetTheme,
} from '../utils/tauri';
import type { ThemeConfig, AppSettings, PlayerSettings } from '../types';
import { Quality, RepeatMode } from '../types';

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
}

type ToastFn = ((message: string, type?: 'success' | 'error' | 'info') => void) | undefined;

interface SettingsActions {
  setTheme: (theme: ThemeConfig, toast?: ToastFn) => Promise<void>;
  setSetting: (key: string, value: unknown, toast?: ToastFn) => Promise<void>;
  loadSettings: (toast?: ToastFn) => Promise<void>;
  saveSettings: (toast?: ToastFn) => Promise<void>;
  /** Patch player prefs without toast spam (volume/shuffle/repeat) */
  persistPlayerPrefs: (partial: Partial<PlayerSettings>) => Promise<void>;
}

type SettingsStore = SettingsState & SettingsActions;

const defaultTheme: ThemeConfig = {
  primary: '#e8a54b',
  background: '#0c0e12',
  surface: '#141820',
  textPrimary: '#f3f1ec',
  textSecondary: '#8a8794',
  accent: '#9b8cff',
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

function applyThemeVariables(theme: ThemeConfig) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const mode = isLightColor(theme.background) ? 'light' : 'dark';

  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  root.style.setProperty('--accent-primary', theme.primary);
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--background', theme.background);
  root.style.setProperty('--bg-base', theme.background);
  root.style.setProperty('--surface', theme.surface);
  root.style.setProperty('--bg-elevated', theme.surface);
  root.style.setProperty('--text-primary', theme.textPrimary);
  root.style.setProperty('--text-base', theme.textPrimary);
  root.style.setProperty('--text-secondary', theme.textSecondary);
  root.style.setProperty('--text-subdued', theme.textSecondary);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--text-bright-accent', theme.primary);
  root.style.setProperty('--essential-bright-accent', theme.primary);
  root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`);
  root.style.setProperty('--accent-primary-dim', `${theme.primary}24`);
  root.style.setProperty('--surface-bg', theme.surface);
}

function buildAppSettings(state: SettingsState): AppSettings {
  return {
    player: {
      defaultQuality: state.defaultQuality,
      autoPlayNext: state.autoPlayNext,
      volume: state.volume,
      shuffle: state.shuffle,
      repeatMode: state.repeatMode,
    },
    appearance: {
      theme: state.theme,
      showLyric: state.showLyric,
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

  setTheme: async (theme: ThemeConfig, toast?: ToastFn) => {
    try {
      set({ theme });
      applyThemeVariables(theme);
      await tauriSetTheme(theme);
      await tauriSaveSettings(buildAppSettings(get()));
      toast?.('主题已更新', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
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

    try {
      await tauriSaveSettings(buildAppSettings(get()));
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
      const settings: AppSettings = await tauriLoadSettings();
      const volume =
        typeof settings.player.volume === 'number' && Number.isFinite(settings.player.volume)
          ? Math.min(1, Math.max(0, settings.player.volume))
          : 0.8;
      const shuffle = Boolean(settings.player.shuffle);
      const repeatMode = (settings.player.repeatMode as RepeatMode) || RepeatMode.None;
      const defaultQuality = settings.player.defaultQuality || Quality.K320;

      set({
        theme: settings.appearance.theme,
        defaultQuality,
        autoPlayNext: settings.player.autoPlayNext !== false,
        showLyric: settings.appearance.showLyric !== false,
        volume,
        shuffle,
        repeatMode,
        sources: settings.sources || defaultSources,
        loading: false,
      });
      applyThemeVariables(settings.appearance.theme);

      // Hydrate player store (dynamic import avoids circular init issues)
      const { usePlayerStore } = await import('./playerStore');
      usePlayerStore.getState().hydrateFromSettings({
        volume,
        quality: defaultQuality,
        shuffle,
        repeatMode,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: message });
      toast?.(message, 'error');
    }
  },

  saveSettings: async (toast?: ToastFn) => {
    try {
      await tauriSaveSettings(buildAppSettings(get()));
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
      void tauriSaveSettings(buildAppSettings(get())).catch(() => undefined);
    }, 400);
  },
}));
