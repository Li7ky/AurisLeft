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
  setSetting: (key: string, value: unknown) => void;
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
      await tauriSetTheme(theme);
      toast?.('主题已更新', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },

  setSetting: (key: string, value: unknown) => {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: message });
      toast?.(message, 'error');
    }
  },

  saveSettings: async (toast?: ToastFn) => {
    try {
      const state = get();
      const settings: AppSettings = {
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
      await tauriSaveSettings(settings);
      toast?.('设置已保存', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast?.(message, 'error');
    }
  },
}));
