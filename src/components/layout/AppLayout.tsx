import React from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PlayerBar from '../player/PlayerBar';
// import RightPanel from "./RightPanel"; // 后续实现
import './AppLayout.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-container">
      {/* 顶部全局导航栏 */}
      <TopBar />

      <div className="app-body">
        {/* 左侧主导航区 */}
        <Sidebar />

        {/* 中央主内容区 */}
        <main className="app-main">{children}</main>

        {/* 右侧辅助信息区 (预留) */}
        {/* <RightPanel /> */}
      </div>

      {/* 底部全局播放控制栏 */}
      <PlayerBar />
    </div>
  );
}
