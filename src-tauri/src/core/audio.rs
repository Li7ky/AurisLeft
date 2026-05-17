use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use rodio::{Decoder, OutputStream, Sink, Source};
use serde::Serialize;
use tokio::sync::RwLock;

use crate::core::error::Result;
use crate::models::PlaybackState;

#[derive(Debug, Clone)]
enum AudioCommand {
    Play(String, mpsc::Sender<Result<f64>>),
    Pause,
    Resume,
    Stop,
    Seek(f64, mpsc::Sender<Result<()>>),
    SetVolume(f32, mpsc::Sender<Result<()>>),
}

struct SharedState {
    sender: mpsc::Sender<AudioCommand>,
    state: Arc<RwLock<PlaybackState>>,
    current_url: Arc<RwLock<Option<String>>>,
    current_position_secs: Arc<RwLock<f64>>,
    total_duration_secs: Arc<RwLock<f64>>,
    start_time: Arc<RwLock<Option<std::time::Instant>>>,
    saved_position: Arc<RwLock<f64>>,
    playback_ended_flag: Arc<AtomicBool>,
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
                start_time: Arc::new(RwLock::new(None)),
                saved_position: Arc::new(RwLock::new(0.0)),
                playback_ended_flag: Arc::new(AtomicBool::new(false)),
            },
            rx,
        )
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PlaybackProgress {
    pub elapsed: f64,
    pub total: f64,
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
                    eprintln!("[ERROR] Failed to create audio output: {}", e);
                    return;
                }
            };

            let mut sink = match Sink::try_new(&handle) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[ERROR] Failed to create audio sink: {}", e);
                    return;
                }
            };

            // Position for progress reporting (updated per loop)
            let mut cur_pos = 0.0_f64;

            while running_clone.load(Ordering::Relaxed) {
                match rx.try_recv() {
                    Ok(cmd) => match cmd {
                        AudioCommand::Play(url, result_tx) => {
                            sink.stop();
                            sink = match Sink::try_new(&handle) {
                                Ok(s) => s,
                                Err(e) => {
                                    let err = crate::core::error::AppError::PlaybackError(format!(
                                        "Failed to create audio sink: {}",
                                        e
                                    ));
                                    {
                                        let mut st = shared_clone.state.blocking_write();
                                        *st = PlaybackState::Error(err.to_string());
                                    }
                                    let _ = result_tx.send(Err(err));
                                    continue;
                                }
                            };
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
                            {
                                let mut st = shared_clone.start_time.blocking_write();
                                *st = None;
                            }
                            {
                                let mut sp = shared_clone.saved_position.blocking_write();
                                *sp = 0.0;
                            }
                            {
                                shared_clone
                                    .playback_ended_flag
                                    .store(false, Ordering::Relaxed);
                            }

                            match Self::play_sync(&url, &mut sink) {
                                Ok(total_secs) => {
                                    {
                                        let mut d =
                                            shared_clone.total_duration_secs.blocking_write();
                                        *d = total_secs;
                                    }
                                    {
                                        let mut st = shared_clone.state.blocking_write();
                                        *st = PlaybackState::Playing;
                                    }
                                    {
                                        let mut st = shared_clone.start_time.blocking_write();
                                        *st = Some(std::time::Instant::now());
                                    }
                                    let _ = result_tx.send(Ok(total_secs));
                                }
                                Err(e) => {
                                    let mut st = shared_clone.state.blocking_write();
                                    *st = PlaybackState::Error(e.to_string());
                                    let _ = result_tx.send(Err(e));
                                }
                            }
                        }
                        AudioCommand::Pause => {
                            sink.pause();
                            let elapsed = cur_pos;
                            {
                                let mut sp = shared_clone.saved_position.blocking_write();
                                *sp = elapsed;
                            }
                            {
                                let mut st = shared_clone.start_time.blocking_write();
                                *st = None;
                            }
                            let mut st = shared_clone.state.blocking_write();
                            *st = PlaybackState::Paused;
                        }
                        AudioCommand::Resume => {
                            sink.play();
                            let elapsed = cur_pos;
                            {
                                let mut sp = shared_clone.saved_position.blocking_write();
                                *sp = elapsed;
                            }
                            {
                                let mut st = shared_clone.start_time.blocking_write();
                                *st = Some(std::time::Instant::now());
                            }
                            let mut st = shared_clone.state.blocking_write();
                            *st = PlaybackState::Playing;
                        }
                        AudioCommand::Stop => {
                            sink.stop();
                            cur_pos = 0.0;
                            {
                                let mut st = shared_clone.state.blocking_write();
                                *st = PlaybackState::Idle;
                            }
                            {
                                let mut u = shared_clone.current_url.blocking_write();
                                *u = None;
                            }
                            {
                                let mut p = shared_clone.current_position_secs.blocking_write();
                                *p = 0.0;
                            }
                            {
                                let mut d = shared_clone.total_duration_secs.blocking_write();
                                *d = 0.0;
                            }
                            {
                                let mut st = shared_clone.start_time.blocking_write();
                                *st = None;
                            }
                            {
                                let mut sp = shared_clone.saved_position.blocking_write();
                                *sp = 0.0;
                            }
                        }
                        AudioCommand::Seek(pos_secs, result_tx) => {
                            let seek_result = if pos_secs.is_finite() && pos_secs >= 0.0 {
                                sink.try_seek(std::time::Duration::from_secs_f64(pos_secs))
                                    .map_err(|e| {
                                        crate::core::error::AppError::PlaybackError(format!(
                                            "Failed to seek playback: {}",
                                            e
                                        ))
                                    })
                            } else {
                                Err(crate::core::error::AppError::PlaybackError(
                                    "Seek position must be a non-negative finite number"
                                        .to_string(),
                                ))
                            };

                            match seek_result {
                                Ok(()) => {
                                    {
                                        let mut sp = shared_clone.saved_position.blocking_write();
                                        *sp = pos_secs;
                                    }
                                    {
                                        let st = shared_clone.start_time.blocking_read();
                                        if st.is_some() {
                                            drop(st);
                                            let mut st = shared_clone.start_time.blocking_write();
                                            *st = Some(std::time::Instant::now());
                                        }
                                    }
                                    {
                                        let mut p =
                                            shared_clone.current_position_secs.blocking_write();
                                        *p = pos_secs;
                                    }
                                    let _ = result_tx.send(Ok(()));
                                }
                                Err(e) => {
                                    let _ = result_tx.send(Err(e));
                                }
                            }
                        }
                        AudioCommand::SetVolume(vol, result_tx) => {
                            if (0.0..=1.0).contains(&vol) {
                                sink.set_volume(vol);
                                let _ = result_tx.send(Ok(()));
                            } else {
                                let _ = result_tx.send(Err(
                                    crate::core::error::AppError::PlaybackError(
                                        "Volume must be between 0.0 and 1.0".to_string(),
                                    ),
                                ));
                            }
                        }
                    },
                    Err(mpsc::TryRecvError::Empty) => {
                        // Update current position for progress reporting
                        {
                            let st = shared_clone.start_time.blocking_read();
                            if let Some(t) = *st {
                                let saved = shared_clone.saved_position.blocking_read();
                                cur_pos = *saved + t.elapsed().as_secs_f64();
                            } else {
                                let sp = shared_clone.saved_position.blocking_read();
                                cur_pos = *sp;
                            }
                        }
                        {
                            let mut p = shared_clone.current_position_secs.blocking_write();
                            *p = cur_pos;
                        }

                        // Check if playback ended naturally (sink empty while playing)
                        {
                            let st = shared_clone.state.blocking_read();
                            if matches!(*st, PlaybackState::Playing) {
                                if sink.empty() {
                                    drop(st);
                                    let mut st = shared_clone.state.blocking_write();
                                    *st = PlaybackState::Idle;
                                    cur_pos = 0.0;
                                    {
                                        let mut st = shared_clone.start_time.blocking_write();
                                        *st = None;
                                    }
                                    {
                                        let mut sp = shared_clone.saved_position.blocking_write();
                                        *sp = 0.0;
                                    }
                                    {
                                        let mut p =
                                            shared_clone.current_position_secs.blocking_write();
                                        *p = 0.0;
                                    }
                                    shared_clone
                                        .playback_ended_flag
                                        .store(true, Ordering::Relaxed);
                                }
                            }
                        }

                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    Err(mpsc::TryRecvError::Disconnected) => break,
                }
            }
        });

        Ok(Self { shared, running })
    }

    fn play_sync(url: &str, sink: &mut Sink) -> Result<f64> {
        if url.starts_with("file://") {
            let file_path = url::Url::parse(url)
                .map_err(|e| {
                    crate::core::error::AppError::PlaybackError(format!(
                        "Invalid local audio URL: {}",
                        e
                    ))
                })?
                .to_file_path()
                .map_err(|_| {
                    crate::core::error::AppError::PlaybackError(
                        "Invalid local audio file path".to_string(),
                    )
                })?;
            let file = std::fs::File::open(&file_path).map_err(|e| {
                crate::core::error::AppError::PlaybackError(format!(
                    "Failed to open local audio file {}: {}",
                    file_path.display(),
                    e
                ))
            })?;
            let decoder = Decoder::new(std::io::BufReader::new(file)).map_err(|e| {
                crate::core::error::AppError::PlaybackError(format!(
                    "Failed to decode local audio: {}",
                    e
                ))
            })?;
            let total_secs = decoder.total_duration().map_or(0.0, |d| d.as_secs_f64());
            sink.append(decoder);
            return Ok(total_secs);
        }

        let client = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| {
                crate::core::error::AppError::PlaybackError(format!(
                    "Failed to create audio HTTP client: {}",
                    e
                ))
            })?;
        let response = client.get(url).send().map_err(|e| {
            crate::core::error::AppError::PlaybackError(format!("Failed to fetch audio: {}", e))
        })?;

        if !response.status().is_success() {
            return Err(crate::core::error::AppError::PlaybackError(format!(
                "Audio request failed with HTTP status {}",
                response.status()
            )));
        }

        let bytes = response.bytes().map_err(|e| {
            crate::core::error::AppError::PlaybackError(format!(
                "Failed to read audio bytes: {}",
                e
            ))
        })?;

        if bytes.is_empty() {
            return Err(crate::core::error::AppError::PlaybackError(
                "Audio response was empty".to_string(),
            ));
        }

        let cursor = std::io::Cursor::new(bytes.to_vec());
        let decoder = Decoder::new(cursor).map_err(|e| {
            crate::core::error::AppError::PlaybackError(format!("Failed to decode audio: {}", e))
        })?;

        let total_secs = decoder.total_duration().map_or(0.0, |d| d.as_secs_f64());
        sink.append(decoder);

        Ok(total_secs)
    }

    pub async fn play(&self, url: &str) -> Result<()> {
        let (result_tx, result_rx) = mpsc::channel();
        self.shared
            .sender
            .send(AudioCommand::Play(url.to_string(), result_tx))
            .map_err(|e| {
                crate::core::error::AppError::PlaybackError(format!(
                    "Failed to send play command: {}",
                    e
                ))
            })?;

        tokio::task::spawn_blocking(move || {
            result_rx.recv().map_err(|e| {
                crate::core::error::AppError::PlaybackError(format!(
                    "Failed to receive play result: {}",
                    e
                ))
            })?
        })
        .await
        .map_err(|e| {
            crate::core::error::AppError::PlaybackError(format!(
                "Failed to join play result task: {}",
                e
            ))
        })?
        .map(|_| ())
    }

    pub async fn pause(&self) -> Result<()> {
        self.shared.sender.send(AudioCommand::Pause).map_err(|e| {
            crate::core::error::AppError::PlaybackError(format!(
                "Failed to send pause command: {}",
                e
            ))
        })
    }

    pub async fn resume(&self) -> Result<()> {
        self.shared.sender.send(AudioCommand::Resume).map_err(|e| {
            crate::core::error::AppError::PlaybackError(format!(
                "Failed to send resume command: {}",
                e
            ))
        })
    }

    pub async fn stop(&self) -> Result<()> {
        self.shared.sender.send(AudioCommand::Stop).map_err(|e| {
            crate::core::error::AppError::PlaybackError(format!(
                "Failed to send stop command: {}",
                e
            ))
        })
    }

    pub async fn seek_to(&self, position_secs: f64) -> Result<()> {
        let (result_tx, result_rx) = mpsc::channel();
        self.shared
            .sender
            .send(AudioCommand::Seek(position_secs, result_tx))
            .map_err(|e| {
                crate::core::error::AppError::PlaybackError(format!(
                    "Failed to send seek command: {}",
                    e
                ))
            })?;

        tokio::task::spawn_blocking(move || {
            result_rx.recv().map_err(|e| {
                crate::core::error::AppError::PlaybackError(format!(
                    "Failed to receive seek result: {}",
                    e
                ))
            })?
        })
        .await
        .map_err(|e| {
            crate::core::error::AppError::PlaybackError(format!(
                "Failed to join seek result task: {}",
                e
            ))
        })?
    }

    pub async fn set_volume(&self, volume: f32) -> Result<()> {
        let (result_tx, result_rx) = mpsc::channel();
        self.shared
            .sender
            .send(AudioCommand::SetVolume(volume, result_tx))
            .map_err(|e| {
                crate::core::error::AppError::PlaybackError(format!(
                    "Failed to send volume command: {}",
                    e
                ))
            })?;

        tokio::task::spawn_blocking(move || {
            result_rx.recv().map_err(|e| {
                crate::core::error::AppError::PlaybackError(format!(
                    "Failed to receive volume result: {}",
                    e
                ))
            })?
        })
        .await
        .map_err(|e| {
            crate::core::error::AppError::PlaybackError(format!(
                "Failed to join volume result task: {}",
                e
            ))
        })?
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

    // Get progress as f64 for easier event emission
    pub async fn get_progress_f64(&self) -> (f64, f64) {
        let pos = {
            let guard = self.shared.current_position_secs.read().await;
            *guard
        };
        let total = {
            let guard = self.shared.total_duration_secs.read().await;
            *guard
        };
        (pos, total)
    }

    pub async fn get_state(&self) -> PlaybackState {
        self.shared.state.read().await.clone()
    }

    pub async fn get_current_url(&self) -> Option<String> {
        self.shared.current_url.read().await.clone()
    }

    /// Check and clear the playback-ended flag. Returns true if a song
    /// finished playing naturally (not stopped/paused by the user).
    pub fn take_playback_ended(&self) -> bool {
        self.shared
            .playback_ended_flag
            .compare_exchange(true, false, Ordering::Relaxed, Ordering::Relaxed)
            .is_ok()
    }

    /// True if currently in Playing state
    pub async fn is_playing(&self) -> bool {
        let state = self.shared.state.read().await;
        matches!(*state, PlaybackState::Playing)
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
    }
}
