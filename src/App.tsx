import { useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import AppLayout from './components/layout/AppLayout';
import { subscribePlayerEvents } from './store/playerStore';
import { useSettingsStore } from './store/settingsStore';
import { loadSourcesFromFile } from './utils/tauri';
import { useToast } from './components/common/Toast/useToast';
import Home from './pages/Home';
import LocalMusic from './pages/LocalMusic';
import DownloadManager from './pages/DownloadManager';
import Playlist from './pages/Playlist';
import Search from './pages/Search';
import Settings from './pages/Settings';
import Favorites from './pages/Favorites';
import { useFavoriteStore } from './store/favoriteStore';

function App() {
  const unlistenRef = useRef<(() => void) | null>(null);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadFavorites = useFavoriteStore((s) => s.loadFavorites);
  const { addToast } = useToast();

  useEffect(() => {
    subscribePlayerEvents().then((unlisten) => {
      unlistenRef.current = unlisten;
    });

    return () => {
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, []);

  useEffect(() => {
    loadSettings();
    void loadFavorites();
    loadSourcesFromFile()
      .then((sources) => {
        if (!sources?.length) {
          addToast('未检测到音源，已启用内置音源，可直接搜索试听', 'info');
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        addToast(`加载音源失败：${message}`, 'error');
      });
  }, [loadSettings, loadFavorites, addToast]);

  return (
    <DndProvider backend={HTML5Backend}>
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/local" element={<LocalMusic />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/download" element={<DownloadManager />} />
            <Route path="/playlist" element={<Playlist />} />
            <Route path="/playlist/:id" element={<Playlist />} />
            <Route path="/search" element={<Search />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </AppLayout>
      </Router>
    </DndProvider>
  );
}

export default App;
