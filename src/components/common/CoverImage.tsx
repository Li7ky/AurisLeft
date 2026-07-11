import { useState } from 'react';
import { Music2 } from 'lucide-react';
import './CoverImage.css';

/** Normalize third-party cover URLs (NetEase etc.) for Electron display */
export function normalizeCoverUrl(url?: string | null): string | null {
  if (!url) return null;
  let u = String(url).trim();
  if (!u) return null;
  u = u.replace(/^http:\/\//i, 'https://');
  // NetEase sometimes returns //p1.music.126.net/...
  if (u.startsWith('//')) u = `https:${u}`;
  return u;
}

interface CoverImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  size?: number;
}

/**
 * Cover image that avoids CDN hotlink blocks (no-referrer)
 * and falls back to a music icon when load fails.
 */
export default function CoverImage({ src, alt = '', className = '', size = 20 }: CoverImageProps) {
  const normalized = normalizeCoverUrl(src);
  const [failed, setFailed] = useState(false);

  if (!normalized || failed) {
    return (
      <div className={`cover-image cover-image--empty ${className}`.trim()} aria-hidden>
        <Music2 size={size} />
      </div>
    );
  }

  return (
    <img
      className={`cover-image ${className}`.trim()}
      src={normalized}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
