import { useRef, useEffect, useCallback } from "react";
import { usePlayerStore } from "../../store/playerStore";
import type { LyricLine } from "../../types";
import "./LyricDisplay.css";

interface LyricDisplayProps {
  lines: LyricLine[];
}

export default function LyricDisplay({ lines }: LyricDisplayProps) {
  const progress = usePlayerStore((s) => s.progress);
  const seek = usePlayerStore((s) => s.seek);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeIndex = findActiveLineIndex(lines, progress);

  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const el = activeRef.current;
      const containerHeight = container.clientHeight;
      const elOffset = el.offsetTop - container.offsetTop;
      container.scrollTop = elOffset - containerHeight / 2;
    }
  }, [activeIndex]);

  const handleLineClick = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek],
  );

  if (!lines.length) {
    return (
      <div className="lyric-display">
        <div className="lyric-display__empty">暂无歌词</div>
      </div>
    );
  }

  return (
    <div className="lyric-display" ref={containerRef}>
      {lines.map((line, i) => (
        <div
          key={`${line.time}-${i}`}
          ref={i === activeIndex ? activeRef : undefined}
          className={`lyric-display__line${i === activeIndex ? " lyric-display__line--active" : ""}`}
          onClick={() => handleLineClick(line.time)}
        >
          {line.text || "\u00A0"}
        </div>
      ))}
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
