import React from 'react';
import './Section.css';

interface SectionProps {
  title: string;
  onViewAll?: () => void;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, onViewAll, children }) => {
  return (
    <section className="section">
      <div className="section__header">
        <h2 className="section__title">{title}</h2>
        {onViewAll && (
          <button className="section__view-all" onClick={onViewAll}>
            查看全部
          </button>
        )}
      </div>
      <div className="section__content">
        {children}
      </div>
    </section>
  );
};
