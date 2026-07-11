import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PlayerBar from '../player/PlayerBar';
import QueuePanel from '../player/QueuePanel';
import NowPlaying from '../player/NowPlaying';
import './AppLayout.css';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-container">
      <TopBar />

      <div className="app-body">
        <Sidebar />
        <main className="app-main">{children}</main>
      </div>

      <PlayerBar />
      <QueuePanel />
      <NowPlaying />
    </div>
  );
}
