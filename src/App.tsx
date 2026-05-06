import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { subscribePlayerEvents, usePlayerStore } from './store/playerStore';
import { Quality } from './types';
import Home from './pages/Home';
import LocalMusic from './pages/LocalMusic';
import DownloadManager from './pages/DownloadManager';
import Playlist from './pages/Playlist';
import Search from './pages/Search';
import Settings from './pages/Settings';

function App() {
  useEffect(() => {
    // 挂载 Tauri 全局事件监听 (快捷键、进度同步等)
    const unlistenPromise = subscribePlayerEvents();

    // [测试指令] 注入 Mock 数据以验证 Agent-Alpha 逻辑
    const mockSong = {
      id: 'mock-1',
      songId: '123456',
      name: '七里香 (Mock Test)',
      artist: '周杰伦',
      album: '七里香',
      duration: 287,
      coverUrl: 'https://p2.music.126.net/8y97_3Yv9n8S6pW8m9_Ewg==/109951165034938865.jpg',
      source: 'netease',
      qualities: [Quality.K320]
    };
    
    // 初始化播放列表
    usePlayerStore.setState({ 
      queue: [mockSong],
      currentIndex: 0,
      currentSong: mockSong 
    });

    return () => {
      // 由于 subscribePlayerEvents 内部是异步挂载，且存放在全局变量中，
      // 此处主要由 store 内部管理生命周期，但保持 Effect 结构以符合规范。
    };
  }, []);

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
