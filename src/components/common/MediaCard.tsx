import React from 'react';
import { Play } from 'lucide-react';
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

export const MediaCard: React.FC<MediaCardProps> = ({
  title,
  subtitle,
  coverUrl,
  type = 'playlist',
  onClick,
  onPlayClick,
}) => {
  return (
    <div className={`media-card media-card--${type}`} onClick={onClick}>
      <div className="media-card__cover-wrapper">
        <img 
          src={coverUrl || '/tauri.svg'} 
          alt={title} 
          className="media-card__cover" 
          loading="lazy"
        />
        <button 
          className="media-card__play-btn" 
          onClick={(e) => {
            e.stopPropagation();
            onPlayClick?.(e);
          }}
        >
          <Play size={20} fill="currentColor" />
        </button>
      </div>
      <div className="media-card__info">
        <h4 className="media-card__title truncate">{title}</h4>
        {subtitle && <p className="media-card__subtitle truncate">{subtitle}</p>}
      </div>
    </div>
  );
};
