import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';
import LocalMusic from './pages/LocalMusic';
import DownloadManager from './pages/DownloadManager';
import Playlist from './pages/Playlist';
import Search from './pages/Search';
import Settings from './pages/Settings';

function App() {
  return (
    <Router>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/local" element={<LocalMusic />} />
          <Route path="/download" element={<DownloadManager />} />
          <Route path="/playlist/:id" element={<Playlist />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          {/* 未匹配路由统一回退到首页 */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </AppLayout>
    </Router>
  );
}

export default App;
