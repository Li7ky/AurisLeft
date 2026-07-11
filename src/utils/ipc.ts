/**
 * Desktop IPC bridge — Electron primary.
 */

type InvokeArgs = Record<string, unknown> | undefined;

declare global {
  interface Window {
    electronAPI?: {
      invoke: (cmd: string, args?: InvokeArgs) => Promise<unknown>;
      on: (channel: string, listener: (payload: unknown) => void) => () => void;
      isElectron?: boolean;
      platform?: string;
      windowControls?: {
        minimize: () => Promise<void>;
        maximize: () => Promise<boolean>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
      };
    };
  }
}

export function isElectronRuntime(): boolean {
  return Boolean(window.electronAPI?.invoke);
}

export function isDesktopRuntime(): boolean {
  return isElectronRuntime();
}

export async function invoke<T = unknown>(cmd: string, args?: InvokeArgs): Promise<T> {
  if (window.electronAPI?.invoke) {
    return (await window.electronAPI.invoke(cmd, args)) as T;
  }
  throw new Error(`IPC unavailable for command: ${cmd}（请使用 Electron 桌面端启动）`);
}

export function listen(channel: string, listener: (payload: unknown) => void): () => void {
  if (window.electronAPI?.on) {
    return window.electronAPI.on(channel, listener);
  }
  return () => {};
}
