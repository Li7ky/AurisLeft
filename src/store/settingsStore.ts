import { create } from 'zustand';
import {
  loadSettings as tauriLoadSettings,
  saveSettings as tauriSaveSettings,
  setTheme as tauriSetTheme,
} from '../utils/tauri';
import type { ThemeConfig, AppSettings } from '../types';
import { Quality } from '../types';
import { RepeatMode } from '../types';

interface SettingsState {
  theme: ThemeConfig;
  defaultQuality: Quality;
  autoPlayNext: boolean;
  showLyric: boolean;
  loading: boolean;
  error: string | null;
}

type ToastFn = ((message: string, type?: 'success' | 'error' | 'info') => void) | undefined;

interface SettingsActions {
  setTheme: (theme: ThemeConfig, toast?: ToastFn) => Promise<void>;
  setSetting: (key: string, value: unknown, toast?: ToastFn) => Promise<void>;
  loadSettings: (toast?: ToastFn) => Promise<void>;
  saveSettings: (toast?: ToastFn) => Promise<void>;
}

type SettingsStore = SettingsState & SettingsActions;

const defaultTheme: ThemeConfig = {
  primary: '#1DB954',
  background: '#121212',
  surface: '#1e1e1e',
  textPrimary: '#ffffff',
  textSecondary: '#b3b3b3',
  accent: '#1ed760',
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
      volume: 0.8,
      shuffle: false,
      repeatMode: RepeatMode.None,
    },
    appearance: {
      theme: state.theme,
      showLyric: state.showLyric,
    },
    sources: {
      timeoutMs: 8000,
      failThreshold: 3,
      cacheDurationMinutes: 30,
    },
  };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  theme: defaultTheme,
  defaultQuality: Quality.K320,
  autoPlayNext: true,
  showLyric: true,
  loading: false,
  error: null,

  setTheme: async (theme: ThemeConfig, toast?: ToastFn) => {
    try {
      set({ theme });
      applyThemeVariables(theme);
      await tauriSetTheme(theme);
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
      }
      return newState;
    });
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
      set({
        theme: settings.appearance.theme,
        defaultQuality: settings.player.defaultQuality,
        autoPlayNext: settings.player.autoPlayNext,
        showLyric: settings.appearance.showLyric,
        loading: false,
      });
      applyThemeVariables(settings.appearance.theme);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: message });
      toast?.(message, 'error');
    }
  },

  saveSettings: async (toast?: ToastFn) => {
    try {
      const state = get();
      await tauriSaveSettings(buildAppSettings(state));
      toast?.('设置已保存', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },
}));
