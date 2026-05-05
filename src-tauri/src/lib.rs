use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;

use tauri::{Emitter, Manager};
use tokio::sync::Mutex as TokioMutex;

pub mod commands;
pub mod core;
pub mod models;

#[cfg(desktop)]
pub mod tray;
#[cfg(desktop)]
pub mod hotkeys;

use crate::core::error::Result;
use crate::core::storage::Database;
use crate::core::http::HttpClient;
use crate::core::cache::HttpCache;
use crate::core::source::SourceManager;
use crate::core::audio::AudioEngine;
use crate::core::downloader::DownloadManager;
use crate::core::timer::SleepTimer;

/// Application state shared across Tauri commands
pub struct AppState {
    pub db: Mutex<Database>,
    pub source_mgr: Arc<SourceManager>,
    pub audio: Arc<AudioEngine>,
    pub http: HttpClient,
    pub cache: HttpCache,
    pub app_dir: PathBuf,
    pub downloader: DownloadManager,
    pub sleep_timer: SleepTimer,
    pub app_handle: Arc<TokioMutex<Option<tauri::AppHandle>>>,
}

/// Setup function called when Tauri application initializes
pub fn setup(app: &mut tauri::App) -> Result<()> {
    let app_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data directory");

    let download_dir = app_dir.join("downloads");
    std::fs::create_dir_all(&download_dir).ok();

    let db = Database::init(&app_dir)?;
    let http = HttpClient::new();
    let cache = HttpCache::new(1800, 500);
    let source_mgr = Arc::new(SourceManager::new(http.clone()));
    let audio = Arc::new(AudioEngine::new()?);
    let downloader = DownloadManager::new(download_dir);
    let sleep_timer = SleepTimer::new();
    let app_handle = Arc::new(TokioMutex::new(Some(app.handle().clone())));

    app.manage(AppState {
        db: Mutex::new(db),
        source_mgr,
        audio,
        http,
        cache,
        app_dir,
        downloader,
        sleep_timer,
        app_handle,
    });

    Ok(())
}

/// Spawn a background task that periodically emits progress events
fn spawn_progress_poller(app: tauri::AppHandle) {
    let audio: Arc<AudioEngine> = app.state::<AppState>().inner().audio.clone();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));

        loop {
            interval.tick().await;

            // Emit progress if playing
            if audio.is_playing().await {
                let (elapsed, total) = audio.get_progress_f64().await;
                let _ = app.emit(
                    "playback-progress",
                    crate::core::audio::PlaybackProgress { elapsed, total },
                );
            }

            // Check for natural playback completion
            if audio.take_playback_ended() {
                let _ = app.emit("playback-ended", ());
            }
        }
    });
}

/// Run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            setup(app).map_err(|e| e.into())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sources::register_source,
            commands::sources::register_js_source,
            commands::sources::list_sources,
            commands::sources::toggle_source,
            commands::sources::remove_source,
            commands::search::search_music,
            commands::player::play_song,
            commands::player::pause_playback,
            commands::player::resume_playback,
            commands::player::stop_playback,
            commands::player::seek_to,
            commands::player::set_volume,
            commands::lyric::fetch_lyric,
            commands::playlist::create_playlist,
            commands::playlist::add_to_playlist,
            commands::playlist::remove_from_playlist,
            commands::playlist::list_playlists,
            commands::playlist::delete_playlist,
            commands::settings::set_theme,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::download::download_song,
            commands::download::get_download_dir,
            commands::download::set_download_dir,
            commands::timer::start_sleep_timer,
            commands::timer::cancel_sleep_timer,
            commands::timer::get_sleep_timer_status,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                let _ = crate::tray::setup_tray(app);
            }

            let app_handle = app.handle().clone();
            spawn_progress_poller(app_handle.clone());

            #[cfg(desktop)]
            {
                let hotkey_rx = crate::hotkeys::setup_hotkeys(app);
                if let Ok(rx) = hotkey_rx {
                    std::thread::spawn(move || {
                        while let Ok(action) = rx.recv() {
                            use crate::hotkeys::HotKeyAction;
                            let event_name = match action {
                                HotKeyAction::PlayPause => "hotkey-play-pause",
                                HotKeyAction::Next => "hotkey-next",
                                HotKeyAction::Prev => "hotkey-prev",
                            };
                            let _ = app_handle.emit(event_name, ());
                        }
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
