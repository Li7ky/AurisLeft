use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;

#[derive(Clone, serde::Serialize)]
pub struct SleepTimerStatus {
    pub is_active: bool,
    pub remaining_seconds: u64,
}

struct SleepTimerInner {
    app_handle: Option<tauri::AppHandle>,
    remaining_secs: u64,
    is_active: bool,
    cancel_tx: Option<tokio::sync::oneshot::Sender<()>>,
    handle: Option<tokio::task::JoinHandle<()>>,
}

pub struct SleepTimer {
    inner: Arc<Mutex<SleepTimerInner>>,
}

impl Clone for SleepTimer {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

impl SleepTimer {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SleepTimerInner {
                app_handle: None,
                remaining_secs: 0,
                is_active: false,
                cancel_tx: None,
                handle: None,
            })),
        }
    }

    pub async fn start(&self, secs: u64, app_handle: tauri::AppHandle) {
        let mut guard = self.inner.lock().await;

        guard.cancel_active_timer().await;

        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();

        guard.is_active = true;
        guard.remaining_secs = secs;
        guard.app_handle = Some(app_handle.clone());
        guard.cancel_tx = Some(cancel_tx);

        let inner_ref = Arc::clone(&self.inner);

        let handle = tokio::spawn(async move {
            let mut secs_left = secs;

            loop {
                tokio::select! {
                    _ = &mut cancel_rx => {
                        break;
                    }
                    _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {
                        if secs_left == 0 {
                            break;
                        }
                        secs_left -= 1;

                        {
                            let mut guard = inner_ref.lock().await;
                            guard.remaining_secs = secs_left;
                        }

                        let _ = app_handle.emit("sleep-timer-tick", SleepTimerStatus {
                            is_active: true,
                            remaining_seconds: secs_left,
                        });

                        if secs_left == 0 {
                            let _ = app_handle.emit("sleep-timer-done", ());
                            {
                                let mut guard = inner_ref.lock().await;
                                guard.is_active = false;
                            }
                            break;
                        }
                    }
                }
            }
        });

        guard.handle = Some(handle);
    }

    pub async fn cancel(&self) {
        let mut guard = self.inner.lock().await;
        guard.cancel_active_timer().await;
    }

    pub async fn is_active(&self) -> bool {
        self.inner.lock().await.is_active
    }

    pub async fn remaining_secs(&self) -> u64 {
        self.inner.lock().await.remaining_secs
    }

    pub async fn get_status(&self) -> SleepTimerStatus {
        let guard = self.inner.lock().await;
        SleepTimerStatus {
            is_active: guard.is_active,
            remaining_seconds: guard.remaining_secs,
        }
    }
}

impl SleepTimerInner {
    async fn cancel_active_timer(&mut self) {
        if let Some(tx) = self.cancel_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.await;
        }
        self.is_active = false;
        self.remaining_secs = 0;
    }
}
