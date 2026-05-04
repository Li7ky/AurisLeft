import SearchBar from "../../components/search/SearchBar";
import SearchResults from "../../components/search/SearchResults";
import { useSearchStore } from "../../store/searchStore";
import "./index.css";

export default function Search() {
  const loading = useSearchStore((s) => s.loading);
  const keyword = useSearchStore((s) => s.keyword);
  const results = useSearchStore((s) => s.results);
  const page = useSearchStore((s) => s.page);
  const hasMore = useSearchStore((s) => s.hasMore);
  const setPage = useSearchStore((s) => s.setPage);

  const totalResults = Array.from(results.values()).reduce((sum, songs) => sum + songs.length, 0);

  return (
    <div className="search-page">
      <div className="search-page__header">
        <h2 className="search-page__title">搜索音乐</h2>
        <SearchBar />
      </div>

      {keyword && (
        <div className="search-page__progress">
          <span className="search-page__keyword">关键词: {keyword}</span>
          <span className="search-page__count">找到 {totalResults} 首歌曲</span>
          {loading && <span className="search-page__loading-indicator">搜索中...</span>}
          {!loading && totalResults > 0 && (
            <div className="search-page__pagination">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="search-page__page-btn"
              >
                上一页
              </button>
              <span className="search-page__page-num">第 {page} 页</span>
              <button
                disabled={!hasMore}
                onClick={() => setPage(page + 1)}
                className="search-page__page-btn"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      <div className="search-page__results">
        <SearchResults />
      </div>
    </div>
  );
}
