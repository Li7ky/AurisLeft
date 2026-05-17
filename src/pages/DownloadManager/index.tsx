import { useEffect, useRef } from 'react';
import { useDownloadStore } from '../../store/downloadStore';
import { useToast } from '../../components/common/Toast/useToast';
import { DownloadStatus } from '../../types';
import './index.css';

export default function DownloadManager() {
  const { tasks, clearCompleted } = useDownloadStore();
  const { addToast } = useToast();
  const notifiedFailuresRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const failedTaskIds = new Set<string>();

    for (const task of tasks) {
      if (task.status !== DownloadStatus.Failed) continue;

      failedTaskIds.add(task.url);
      if (!notifiedFailuresRef.current.has(task.url)) {
        notifiedFailuresRef.current.add(task.url);
        addToast(`下载失败：${task.songName}`, 'error');
      }
    }

    for (const taskId of notifiedFailuresRef.current) {
      if (!failedTaskIds.has(taskId)) {
        notifiedFailuresRef.current.delete(taskId);
      }
    }
  }, [tasks, addToast]);

  const statusText = (task: (typeof tasks)[0]) => {
    switch (task.status) {
      case DownloadStatus.Downloading:
        return `下载中 ${task.progress}%`;
      case DownloadStatus.Completed:
        return '已完成';
      case DownloadStatus.Failed:
        return `失败: ${task.error ?? '未知错误'}`;
      default:
        return '';
    }
  };

  const hasCompleted = tasks.some((t) => t.status === DownloadStatus.Completed);

  return (
    <div className="download-manager">
      <div className="download-manager__header">
        <h2 className="download-manager__title">下载管理</h2>
        {hasCompleted && (
          <button className="download-manager__clear-btn" onClick={clearCompleted}>
            清除已完成
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="download-manager__empty">暂无下载任务</div>
      ) : (
        <div className="download-manager__list">
          {tasks.map((task, index) => (
            <div key={index} className="download-manager__item">
              <div className="download-manager__row">
                <div className="download-manager__song-info">
                  <span className="download-manager__song-name">{task.songName}</span>
                  <span
                    className={`download-manager__status download-manager__status--${task.status}`}
                  >
                    {statusText(task)}
                  </span>
                </div>
              </div>
              {task.status === DownloadStatus.Downloading && (
                <div className="download-manager__progress-bar">
                  <div
                    className="download-manager__progress-fill"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
