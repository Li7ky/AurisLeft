import { useRef, useEffect } from "react";
import { usePlayerStore } from "../../store/playerStore";
import { PlaybackState } from "../../types";
import "./AudioVisualizer.css";

function getComputedColor(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

export function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const isPlaying = usePlayerStore((s) => s.playbackState === PlaybackState.Playing);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = 64;
    const dataArray = new Uint8Array(bufferLength);

    const accentColor = getComputedColor("--accent") || "#1DB954";
    const primaryColor = getComputedColor("--primary") || "#1ed760";

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      if (isPlaying) {
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] =
            Math.random() * 80 + Math.sin(Date.now() / 200 + i * 0.5) * 40 + 40;
          dataArray[i] = Math.min(255, Math.max(0, dataArray[i]));
        }
      } else {
        dataArray.fill(0);
      }

      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, accentColor);
        gradient.addColorStop(1, primaryColor);
        ctx.fillStyle = gradient;

        const radius = Math.min(barWidth / 2, 2);
        if (barHeight > 0) {
          ctx.beginPath();
          ctx.moveTo(x, height);
          ctx.lineTo(x, height - barHeight + radius);
          ctx.quadraticCurveTo(x, height - barHeight, x + radius, height - barHeight);
          ctx.lineTo(x + barWidth - radius, height - barHeight);
          ctx.quadraticCurveTo(x + barWidth, height - barHeight, x + barWidth, height - barHeight + radius);
          ctx.lineTo(x + barWidth, height);
          ctx.closePath();
          ctx.fill();
        }

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  return <canvas ref={canvasRef} className="audio-visualizer" width={160} height={32} />;
}
