import { useState, useEffect, useRef } from 'react';
import { useSearchStore } from '../../store/searchStore';
import { useToast } from '../common/Toast/useToast';
import './SearchBar.css';

export default function SearchBar() {
  const [input, setInput] = useState('');
  const search = useSearchStore((s) => s.search);
  const clearResults = useSearchStore((s) => s.clearResults);
  const { addToast } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    const trimmed = input.trim();
    if (!trimmed) {
      clearResults();
      return;
    }
    timerRef.current = setTimeout(() => {
      search(trimmed, 1, addToast);
    }, 300);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [input, search, clearResults, addToast]);

  return (
    <div className="search-bar">
      <svg
        className="search-bar__icon"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        className="search-bar__input"
        type="search"
        placeholder="搜索歌曲、歌手、专辑..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
    </div>
  );
}
