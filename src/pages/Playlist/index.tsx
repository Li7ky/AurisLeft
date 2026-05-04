import { useState } from "react";
import PlaylistSidebar from "../../components/playlist/PlaylistSidebar";
import PlaylistPanel from "../../components/playlist/PlaylistPanel";
import type { Playlist } from "../../types";
import "./index.css";

export default function Playlist() {
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  return (
    <div className="playlist-page">
      <div className="playlist-page__sidebar">
        <PlaylistSidebar
          onSelectPlaylist={setSelectedPlaylist}
          selectedPlaylist={selectedPlaylist}
        />
      </div>
      <div className="playlist-page__content">
        <PlaylistPanel playlist={selectedPlaylist} />
      </div>
    </div>
  );
}
