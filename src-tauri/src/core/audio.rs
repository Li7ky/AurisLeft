use std::sync::mpsc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

use rodio::{Decoder, OutputStream, Sink, Source};
use tokio::sync::RwLock;

use crate::core::error::Result;
use crate::models::PlaybackState;

#[derive(Debug, Clone)]
enum AudioCommand {
    Play(String),
    Pause,
    Resume,
    Stop,
    Seek(f64),
    SetVolume(f32),
}

struct SharedState {
    sender: mpsc::Sender<AudioCommand>,
    state: Arc<RwLock<PlaybackState>>,
    current_url: Arc<RwLock<Option<String>>>,
    current_position_secs: Arc<RwLock<f64>>,
    total_duration_secs: Arc<RwLock<f64>>,
}

impl SharedState {
    fn new() -> (Self, mpsc::Receiver<AudioCommand>) {
        let (tx, rx) = mpsc::channel();
        (
            Self {
                sender: tx,
                state: Arc::new(RwLock::new(PlaybackState::Idle)),
                current_url: Arc::new(RwLock::new(None)),
                current_position_secs: Arc::new(RwLock::new(0.0)),
                total_duration_secs: Arc::new(RwLock::new(0.0)),
            },
            rx,
        )
    }
}

pub struct AudioEngine {
    shared: Arc<SharedState>,
    running: Arc<AtomicBool>,
}

impl AudioEngine {
    pub fn new() -> Result<Self> {
        let (shared, rx) = SharedState::new();
        let shared = Arc::new(shared);
        let running = Arc::new(AtomicBool::new(true));

        let shared_clone = shared.clone();
        let running_clone = running.clone();

        thread::spawn(move || {
            let (_stream, handle) = match OutputStream::try_default() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Failed to create audio output: {}", e);
                    return;
                }
            };

            let mut sink = match Sink::try_new(&handle) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Failed to create audio sink: {}", e);
                    return;
                }
            };

            while running_clone.load(Ordering::Relaxed) {
                match rx.try_recv() {
                    Ok(cmd) => match cmd {
                        AudioCommand::Play(url) => {
                            {
                                let mut st = shared_clone.state.blocking_write();
                                *st = PlaybackState::Loading;
                            }
                            {
                                let mut u = shared_clone.current_url.blocking_write();
                                *u = Some(url.clone());
                            }
                            {
                                let mut p = shared_clone.current_position_secs.blocking_write();
                                *p = 0.0;
                            }
                            {
                                let mut d = shared_clone.total_duration_secs.blocking_write();
                                *d = 0.0;
                            }

                            let _rt = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
                                Ok(r) => r,
                                Err(e) => {
                                    let mut st = shared_clone.state.blocking_write();
                                    *st = PlaybackState::Error(format!("Failed to create runtime: {}", e));
                                    continue;
                                }
                            };

                            match Self::play_sync(&url, &mut sink) {
                                Ok(total_secs) => {
                                    let mut st = shared_clone.state.blocking_write();
                                    *st = PlaybackState::Playing;
                                    let mut d = shared_clone.total_duration_secs.blocking_write();
                                    *d = total_secs;
                                }
                                Err(e) => {
                                    let mut st = shared_clone.state.blocking_write();
                                    *st = PlaybackState::Error(e.to_string());
                                }
                            }
                        }
                        AudioCommand::Pause => {
                            sink.pause();
                            let mut st = shared_clone.state.blocking_write();
                            *st = PlaybackState::Paused;
                        }
                        AudioCommand::Resume => {
                            sink.play();
                            let mut st = shared_clone.state.blocking_write();
                            *st = PlaybackState::Playing;
                        }
                        AudioCommand::Stop => {
                            sink.stop();
                            let mut st = shared_clone.state.blocking_write();
                            *st = PlaybackState::Idle;
                            let mut u = shared_clone.current_url.blocking_write();
                            *u = None;
                            let mut p = shared_clone.current_position_secs.blocking_write();
                            *p = 0.0;
                            let mut d = shared_clone.total_duration_secs.blocking_write();
                            *d = 0.0;
                        }
                        AudioCommand::Seek(pos_secs) => {
                            let _ = sink.try_seek(std::time::Duration::from_secs_f64(pos_secs));
                            let mut p = shared_clone.current_position_secs.blocking_write();
                            *p = pos_secs;
                        }
                        AudioCommand::SetVolume(vol) => {
                            sink.set_volume(vol);
                        }
                    },
                    Err(mpsc::TryRecvError::Empty) => {
                        std::thread::sleep(std::time::Duration::from_millis(10));
                    }
                    Err(mpsc::TryRecvError::Disconnected) => break,
                }
            }
        });

        Ok(Self { shared, running })
    }

    fn play_sync(url: &str, sink: &mut Sink) -> Result<f64> {
        let client = reqwest::blocking::Client::new();
        let response = client
            .get(url)
            .send()
            .map_err(|e| crate::core::error::AppError::PlaybackError(format!("Failed to fetch audio: {}", e)))?;

        let bytes = response
            .bytes()
            .map_err(|e| crate::core::error::AppError::PlaybackError(format!("Failed to read audio bytes: {}", e)))?;

        let cursor = std::io::Cursor::new(bytes.to_vec());
        let decoder = Decoder::new(cursor)
            .map_err(|e| crate::core::error::AppError::PlaybackError(format!("Failed to decode audio: {}", e)))?;

        let total_secs = decoder.total_duration().map_or(0.0, |d| d.as_secs_f64());
        sink.append(decoder);

        Ok(total_secs)
    }

    pub async fn play(&self, url: &str) -> Result<()> {
        self.shared
            .sender
            .send(AudioCommand::Play(url.to_string()))
            .map_err(|e| crate::core::error::AppError::PlaybackError(format!("Failed to send play command: {}", e)))
    }

    pub async fn pause(&self) -> Result<()> {
        self.shared
            .sender
            .send(AudioCommand::Pause)
            .map_err(|e| crate::core::error::AppError::PlaybackError(format!("Failed to send pause command: {}", e)))
    }

    pub async fn resume(&self) -> Result<()> {
        self.shared
            .sender
            .send(AudioCommand::Resume)
            .map_err(|e| crate::core::error::AppError::PlaybackError(format!("Failed to send resume command: {}", e)))
    }

    pub async fn stop(&self) -> Result<()> {
        self.shared
            .sender
            .send(AudioCommand::Stop)
            .map_err(|e| crate::core::error::AppError::PlaybackError(format!("Failed to send stop command: {}", e)))
    }

    pub async fn seek_to(&self, position_secs: f64) -> Result<()> {
        self.shared
            .sender
            .send(AudioCommand::Seek(position_secs))
            .map_err(|e| crate::core::error::AppError::PlaybackError(format!("Failed to send seek command: {}", e)))
    }

    pub async fn set_volume(&self, volume: f32) {
        let _ = self.shared.sender.send(AudioCommand::SetVolume(volume));
    }

    pub async fn get_progress(&self) -> (std::time::Duration, std::time::Duration) {
        let pos = {
            let guard = self.shared.current_position_secs.read().await;
            *guard
        };
        let total = {
            let guard = self.shared.total_duration_secs.read().await;
            *guard
        };
        (
            std::time::Duration::from_secs_f64(pos),
            std::time::Duration::from_secs_f64(total),
        )
    }

    pub async fn get_state(&self) -> PlaybackState {
        self.shared.state.read().await.clone()
    }

    pub async fn get_current_url(&self) -> Option<String> {
        self.shared.current_url.read().await.clone()
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
    }
}
