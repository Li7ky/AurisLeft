import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import AppLayout from "./components/layout/AppLayout";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { ToastProvider } from "./components/common/Toast";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Playlist from "./pages/Playlist";
import Settings from "./pages/Settings";
import DownloadManager from "./pages/DownloadManager";
import LocalMusic from "./pages/LocalMusic";
import "./styles/global.css";

function App() {
  // 应用启动时自动加载音源
  useEffect(() => {
    const loadSources = async () => {
      try {
        console.log("[App] 启动时加载音源");
        const sources = await invoke("load_sources_from_file");
        console.log("[App] 音源加载成功:", sources);
      } catch (error) {
        console.error("[App] 音源加载失败:", error);
      }
    };
    loadSources();
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <HashRouter>
          <AppLayout>
            <Routes>
              <Route path="/home" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/playlist" element={<Playlist />} />
              <Route path="/local" element={<LocalMusic />} />
              <Route path="/download" element={<DownloadManager />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/" element={<Navigate to="/home" replace />} />
            </Routes>
          </AppLayout>
        </HashRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
