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

  useEffect(() => {
    void getStatus();
    const id = window.setInterval(() => {
      void getStatus();
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return { isActive, remaining, start, cancel };
}
