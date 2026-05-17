import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/common/Toast';
import { subscribeDownloadEvents } from './store/downloadStore';
import './styles/global.css';
import './styles/utilities.css';

subscribeDownloadEvents();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
