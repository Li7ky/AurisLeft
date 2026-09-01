import { useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import type { LyricLine } from '../../types';
import './LyricDisplay.css';

interface LyricDisplayProps {
  lines: LyricLine[];
  mode?: 'inline' | 'fullscreen';
}

export default function LyricDisplay({ lines, mode = 'inline' }: LyricDisplayProps) {
  const progress = usePlayerStore((s) => s.progress);
  const seek = usePlayerStore((s) => s.seek);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const prevActiveIndexRef = useRef<number>(-1);

  const activeIndex = findActiveLineIndex(lines, progress);

  const setLineRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      lineRefs.current.set(index, el);
    } else {
      lineRefs.current.delete(index);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const lineEl = lineRefs.current.get(activeIndex);
    if (!container || !lineEl) return;

    const containerHeight = container.clientHeight;
    const lineOffsetTop = lineEl.offsetTop;
    const targetScroll = lineOffsetTop - containerHeight / 2 + lineEl.clientHeight / 2;

    // 跳跃 >1 行(切歌/seek)用 instant 定位,避免平滑滚动堆积卡顿;
    // 相邻行用 smooth 保持自然过渡
    const prev = prevActiveIndexRef.current;
    const behavior: ScrollBehavior = prev >= 0 && Math.abs(activeIndex - prev) <= 1 ? 'smooth' : 'auto';
    prevActiveIndexRef.current = activeIndex;

    container.scrollTo({
      top: targetScroll,
      behavior,
    });
  }, [activeIndex]);

  const handleLineClick = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek]
  );

  if (!lines.length) {
    return (
      <div className={`lyric-display lyric-display--${mode}`}>
        <div className="lyric-display__empty">暂无歌词</div>
      </div>
    );
  }

  return (
    <div className={`lyric-display lyric-display--${mode}`} ref={containerRef}>
      {lines.map((line, i) => {
        let cls = 'lyric-line';
        if (i === activeIndex) cls += ' active';
        else if (i < activeIndex) cls += ' passed';
        return (
          <div
            key={`${line.time}-${i}`}
            ref={(el) => setLineRef(i, el)}
            className={cls}
            onClick={() => handleLineClick(line.time)}
          >
            {line.text || '\u00A0'}
          </div>
        );
      })}
    </div>
  );
}

function findActiveLineIndex(lines: LyricLine[], progress: number): number {
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= progress) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}
