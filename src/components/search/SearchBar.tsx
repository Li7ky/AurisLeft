import { useState } from "react";
import { useSearchStore } from "../../store/searchStore";
import "./SearchBar.css";

export default function SearchBar() {
  const [input, setInput] = useState("");
  const search = useSearchStore((s) => s.search);

  const handleSearch = () => {
    if (input.trim()) {
      search(input.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="search-bar">
      <input
        className="search-bar__input"
        type="search"
        placeholder="搜索歌曲、歌手..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button className="search-bar__btn" onClick={handleSearch}>
        搜索
      </button>
    </div>
  );
}
