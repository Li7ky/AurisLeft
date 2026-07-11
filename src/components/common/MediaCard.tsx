import { Play } from 'lucide-react';
import CoverImage from './CoverImage';
import './MediaCard.css';

interface MediaCardProps {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  type?: 'playlist' | 'album' | 'artist';
  onClick?: () => void;
  onPlayClick?: (e: React.MouseEvent) => void;
}

export function MediaCard({
  title,
  subtitle,
  coverUrl,
  type = 'playlist',
  onClick,
  onPlayClick,
}: MediaCardProps) {
  return (
    <div className={`media-card media-card--${type}`} onClick={onClick}>
      <div className="media-card__cover-wrapper">
        <CoverImage src={coverUrl} alt={title} className="media-card__cover" size={28} />
        {onPlayClick && (
          <button
            className="media-card__play-btn"
            onClick={(e) => {
              e.stopPropagation();
              onPlayClick(e);
            }}
          >
            <Play size={18} fill="currentColor" />
          </button>
        )}
      </div>
      <div className="media-card__info">
        <h4 className="media-card__title truncate">{title}</h4>
        {subtitle && <p className="media-card__subtitle truncate">{subtitle}</p>}
      </div>
    </div>
  );
}
