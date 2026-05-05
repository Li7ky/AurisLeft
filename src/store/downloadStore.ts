import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { downloadSong } from "../utils/tauri";
import type { DownloadTask, Song, Quality } from "../types";
import { DownloadStatus } from "../types";

interface DownloadState {
  tasks: DownloadTask[];
  addTask: (song: Song, quality: Quality) => Promise<void>;
  updateTask: (songName: string, progress: number, status: DownloadStatus, error?: string) => void;
  clearCompleted: () => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  tasks: [],

  addTask: async (song: Song, quality: Quality) => {
    const songName = `${song.name} - ${song.artist}`;

    set((state) => ({
      tasks: [
        ...state.tasks,
        {
          url: song.songId,
          songName,
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
          t.songName === songName
            ? { ...t, status: DownloadStatus.Failed, error: message }
            : t
        ),
      }));
    }
  },

  updateTask: (songName: string, progress: number, status: DownloadStatus, error?: string) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.songName === songName ? { ...t, progress, status, error } : t
      ),
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status !== DownloadStatus.Completed),
    }));
  },
}));

let progressListenerSetup = false;

export function subscribeDownloadEvents() {
  if (progressListenerSetup) return;
  progressListenerSetup = true;

  listen("download-progress", (event) => {
    const payload = event.payload as {
      filename: string;
      progress_pct: number;
    };
    if (payload.progress_pct > 0) {
      useDownloadStore.getState().updateTask(
        payload.filename,
        Math.round(payload.progress_pct),
        DownloadStatus.Downloading
      );
    }
  });

  listen("download-complete", (_event) => {
    const store = useDownloadStore.getState();
    const downloadingTasks = store.tasks.filter(
      (t) => t.status === DownloadStatus.Downloading
    );
    if (downloadingTasks.length > 0) {
      const last = downloadingTasks[downloadingTasks.length - 1];
      store.updateTask(last.songName, 100, DownloadStatus.Completed);
    }
  });

  listen("download-error", (event) => {
    const message = event.payload as string;
    const store = useDownloadStore.getState();
    const downloadingTasks = store.tasks.filter(
      (t) => t.status === DownloadStatus.Downloading
    );
    if (downloadingTasks.length > 0) {
      const last = downloadingTasks[downloadingTasks.length - 1];
      store.updateTask(last.songName, last.progress, DownloadStatus.Failed, message);
    }
  });
}
