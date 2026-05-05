import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
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
