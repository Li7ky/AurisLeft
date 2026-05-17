import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { startSleepTimer, cancelSleepTimer, getSleepTimerStatus } from '../utils/tauri';

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
    const unlistenPromise = listen('sleep-timer-tick', (event) => {
      const payload = event.payload as { remainingSeconds: number; isActive: boolean };
      setIsActive(payload.isActive);
      setRemaining(payload.remainingSeconds);
    });

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    getStatus();
  }, []);

  return { isActive, remaining, start, cancel };
}
