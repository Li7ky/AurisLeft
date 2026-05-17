import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { downloadSong } from '../utils/tauri';
import type { DownloadTask, Song, Quality } from '../types';
import { DownloadStatus } from '../types';

interface DownloadState {
  tasks: DownloadTask[];
  addTask: (song: Song, quality: Quality) => Promise<void>;
  updateTask: (taskId: string, progress: number, status: DownloadStatus, error?: string) => void;
  clearCompleted: () => void;
}

/** Generate a unique task ID from song data */
function makeTaskId(song: Song): string {
  return `${song.source}:${song.songId}`;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: [],

  addTask: async (song: Song, quality: Quality) => {
    const taskId = makeTaskId(song);
    const displayName = `${song.name} - ${song.artist}`;

    // Prevent duplicate downloads
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

  listen('download-progress', (event) => {
    const payload = event.payload as {
      filename: string;
      progress_pct: number;
      task_id?: string;
    };
    const store = useDownloadStore.getState();
    // Match by task_id if available, otherwise by filename
    const taskId = payload.task_id;
    if (taskId) {
      store.updateTask(taskId, Math.round(payload.progress_pct), DownloadStatus.Downloading);
    } else {
      // Fallback: match by filename (songName contains the filename)
      const task = store.tasks.find(
        (t) => t.status === DownloadStatus.Downloading && t.songName.includes(payload.filename)
      );
      if (task) {
        store.updateTask(task.url, Math.round(payload.progress_pct), DownloadStatus.Downloading);
      }
    }
  });

  listen('download-complete', (event) => {
    const payload = event.payload as { filename?: string; task_id?: string };
    const store = useDownloadStore.getState();
    const taskId: string | undefined = payload.task_id;
    if (taskId) {
      store.updateTask(taskId, 100, DownloadStatus.Completed);
    } else if (payload.filename) {
      const filename = payload.filename;
      const task = store.tasks.find(
        (t) => t.status === DownloadStatus.Downloading && t.songName.includes(filename)
      );
      if (task) {
        store.updateTask(task.url, 100, DownloadStatus.Completed);
      }
    } else {
      // Last resort: mark the last downloading task as completed
      const downloading = store.tasks.filter((t) => t.status === DownloadStatus.Downloading);
      if (downloading.length === 1) {
        store.updateTask(downloading[0].url, 100, DownloadStatus.Completed);
      }
    }
  });

  listen('download-error', (event) => {
    const payload = event.payload as { message: string; filename?: string; task_id?: string };
    const store = useDownloadStore.getState();
    const taskId: string | undefined = payload.task_id;
    if (taskId) {
      store.updateTask(taskId, 0, DownloadStatus.Failed, payload.message);
    } else if (payload.filename) {
      const filename = payload.filename;
      const task = store.tasks.find(
        (t) => t.status === DownloadStatus.Downloading && t.songName.includes(filename)
      );
      if (task) {
        store.updateTask(task.url, task.progress, DownloadStatus.Failed, payload.message);
      }
    } else {
      const downloading = store.tasks.filter((t) => t.status === DownloadStatus.Downloading);
      if (downloading.length === 1) {
        store.updateTask(downloading[0].url, downloading[0].progress, DownloadStatus.Failed, payload.message);
      }
    }
  });
}
