import { create } from 'zustand';
import { downloadSong } from '../utils/tauri';
import { listen } from '../utils/ipc';
import type { DownloadTask, Song, Quality } from '../types';
import { DownloadStatus } from '../types';

interface DownloadState {
  tasks: DownloadTask[];
  addTask: (song: Song, quality: Quality) => Promise<void>;
  updateTask: (taskId: string, progress: number, status: DownloadStatus, error?: string) => void;
  clearCompleted: () => void;
}

function makeTaskId(song: Song): string {
  return `${song.source}:${song.songId}`;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: [],

  addTask: async (song: Song, quality: Quality) => {
    const taskId = makeTaskId(song);
    const displayName = `${song.name} - ${song.artist}`;

    const existing = get().tasks.find((t) => t.url === taskId);
    if (existing && existing.status === DownloadStatus.Downloading) {
      return;
    }

    set((state) => ({
      tasks: [
        ...state.tasks.filter((t) => t.url !== taskId),
        {
          url: taskId,
          songName: displayName,
          progress: 0,
          status: DownloadStatus.Downloading,
        },
      ],
    }));

    try {
      await downloadSong(song, quality);
      get().updateTask(taskId, 100, DownloadStatus.Completed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.url === taskId ? { ...t, status: DownloadStatus.Failed, error: message } : t
        ),
      }));
    }
  },

  updateTask: (taskId: string, progress: number, status: DownloadStatus, error?: string) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.url === taskId ? { ...t, progress, status, error } : t
      ),
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      tasks: state.tasks.filter(
        (t) => t.status !== DownloadStatus.Completed && t.status !== DownloadStatus.Failed
      ),
    }));
  },
}));

let progressListenerSetup = false;

export function subscribeDownloadEvents() {
  if (progressListenerSetup) return;
  progressListenerSetup = true;

  listen('download-progress', (raw) => {
    const payload = raw as {
      filename: string;
      progress_pct: number;
      task_id?: string;
    };
    const store = useDownloadStore.getState();
    const taskId = payload.task_id;
    if (taskId) {
      store.updateTask(taskId, Math.round(payload.progress_pct), DownloadStatus.Downloading);
    } else {
      const task = store.tasks.find(
        (t) => t.status === DownloadStatus.Downloading && t.songName.includes(payload.filename)
      );
      if (task) {
        store.updateTask(task.url, Math.round(payload.progress_pct), DownloadStatus.Downloading);
      }
    }
  });

  listen('download-complete', (raw) => {
    const payload = raw as { filename?: string; task_id?: string };
    const store = useDownloadStore.getState();
    if (payload.task_id) {
      store.updateTask(payload.task_id, 100, DownloadStatus.Completed);
    } else if (payload.filename) {
      const task = store.tasks.find(
        (t) =>
          t.status === DownloadStatus.Downloading && t.songName.includes(payload.filename as string)
      );
      if (task) store.updateTask(task.url, 100, DownloadStatus.Completed);
    }
  });
}
