import { X, Play, Trash2 } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { songKey } from '../../utils/song';
import './QueuePanel.css';

export default function QueuePanel() {
  const {
    queue,
    currentSong,
    currentIndex,
    showQueuePanel,
    setShowQueuePanel,
    play,
    removeFromQueue,
    clearQueue,
    quality,
  } = usePlayerStore();

  if (!showQueuePanel) return null;

  return (
    <aside className="queue-panel" aria-label="播放队列">
      <div className="queue-panel__header">
        <div>
          <h3 className="queue-panel__title">播放队列</h3>
          <p className="queue-panel__subtitle">{queue.length} 首</p>
        </div>
        <div className="queue-panel__header-actions">
          {queue.length > 0 && (
            <button className="btn--icon btn--sm" title="清空队列" onClick={() => clearQueue()}>
              <Trash2 size={16} />
            </button>
          )}
          <button
            className="btn--icon btn--sm"
            title="关闭"
            onClick={() => setShowQueuePanel(false)}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="queue-panel__list">
        {queue.length === 0 ? (
          <div className="queue-panel__empty">队列为空，从搜索或歌单添加歌曲</div>
        ) : (
          queue.map((song, index) => {
            const active =
              currentSong && songKey(song) === songKey(currentSong) && index === currentIndex;
            return (
              <button
                key={`${songKey(song)}-${index}`}
                className={`queue-panel__item${active ? ' queue-panel__item--active' : ''}`}
                onClick={() => play(song, quality)}
              >
                <span className="queue-panel__index">
                  {active ? <Play size={12} fill="currentColor" /> : index + 1}
                </span>
                <span className="queue-panel__meta">
                  <span className="queue-panel__name truncate">{song.name}</span>
                  <span className="queue-panel__artist truncate">{song.artist}</span>
                </span>
                <span
                  className="queue-panel__remove"
                  title="移除"
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeFromQueue(index);
                  }}
                >
                  <X size={14} />
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
