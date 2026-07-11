import { Search as SearchIcon } from 'lucide-react';
import SearchResults from '../../components/search/SearchResults';
import { useSearchStore } from '../../store/searchStore';
import { useToast } from '../../components/common/Toast/useToast';
import './index.css';

export default function Search() {
  const loading = useSearchStore((s) => s.loading);
  const keyword = useSearchStore((s) => s.keyword);
  const results = useSearchStore((s) => s.results);
  const page = useSearchStore((s) => s.page);
  const hasMore = useSearchStore((s) => s.hasMore);
  const setPage = useSearchStore((s) => s.setPage);
  const { addToast } = useToast();

  const totalResults = Array.from(results.values()).reduce((sum, songs) => sum + songs.length, 0);

  return (
    <div className="search-page">
      <header className="search-page__header">
        <h1 className="search-page__title">搜索</h1>
        {keyword ? (
          <div className="search-page__meta">
            <span className="search-page__keyword">{keyword}</span>
            <span className="search-page__count">
              {loading ? '搜索中…' : `共 ${totalResults} 首`}
            </span>
            {!loading && totalResults > 0 && (
              <div className="search-page__pagination">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(page - 1, addToast)}
                  className="search-page__page-btn"
                >
                  上一页
                </button>
                <span className="search-page__page-num">{page}</span>
                <button
                  type="button"
                  disabled={!hasMore || loading}
                  onClick={() => setPage(page + 1, addToast)}
                  className="search-page__page-btn"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        ) : null}
      </header>

      {!keyword && !loading ? (
        <div className="search-page__hero-empty">
          <div className="search-page__hero-icon">
            <SearchIcon size={28} />
          </div>
          <h2>发现音乐</h2>
          <p>多平台聚合搜索，播放失败时自动换源</p>
        </div>
      ) : (
        <div className="search-page__results">
          <SearchResults />
        </div>
      )}
    </div>
  );
}
