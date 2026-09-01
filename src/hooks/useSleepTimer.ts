import { useState, useEffect } from 'react';
import { listen } from '../utils/ipc';
import { startSleepTimer, cancelSleepTimer, getSleepTimerStatus } from '../utils/desktop';

export function useSleepTimer() {
  const [isActive, setIsActive] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const start = async (minutes: number) => {
    await startSleepTimer(minutes);
    setIsActive(true);
    setRemaining(minutes * 60);
  };

  const cancel = async () => {
    await cancelSleepTimer();
    setIsActive(false);
    setRemaining(0);
  };

  const getStatus = async () => {
    try {
      const status = await getSleepTimerStatus();
      setIsActive(status.isActive);
      setRemaining(status.remainingSeconds);
    } catch {
      setIsActive(false);
      setRemaining(0);
    }
  };

  useEffect(() => {
    const unlisten = listen('sleep-timer-fired', () => {
      setIsActive(false);
      setRemaining(0);
    });
    return unlisten;
  }, []);

  // 仅在定时器激活时轮询；挂载时先查一次以恢复上次会话遗留的定时器状态
  useEffect(() => {
    void getStatus();
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => {
      void getStatus();
    }, 1000);
    return () => window.clearInterval(id);
  }, [isActive]);

  return { isActive, remaining, start, cancel };
}
