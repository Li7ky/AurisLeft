import { useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import AppLayout from './components/layout/AppLayout';
import { subscribePlayerEvents } from './store/playerStore';
import { useSettingsStore } from './store/settingsStore';
import {
  loadSettings as desktopLoadSettings,
  markOnboardingSeen,
  getNkiQqStatus,
} from './utils/desktop';
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

    void getNkiQqStatus()
      .then((s) => {
        if (!s.hasKey || !s.enabled) {
          addToast('请到设置开启西瓜糖 QQ 解析（需密钥）', 'info');
        }
      })
      .catch(() => undefined);

    // First-run welcome (once)
    void desktopLoadSettings()
      .then(async (settings) => {
        if (settings?.onboarding?.seen) return;
        addToast('欢迎使用 AurisLeft：搜索点歌即可，播放走西瓜糖 QQ 解析。', 'info');
        try {
          await markOnboardingSeen();
        } catch {
          /* ignore */
        }
      })
      .catch(() => undefined);
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
