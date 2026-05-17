use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;

use tauri::{Emitter, Manager};
use tokio::sync::Mutex as TokioMutex;

pub mod commands;
pub mod core;
pub mod models;

#[cfg(desktop)]
pub mod hotkeys;
#[cfg(desktop)]
pub mod tray;

use crate::core::audio::AudioEngine;
use crate::core::cache::HttpCache;
use crate::core::downloader::DownloadManager;
use crate::core::error::Result;
use crate::core::http::HttpClient;
use crate::core::source::SourceManager;
use crate::core::storage::Database;
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

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));
            loop {
                interval.tick().await;
                if audio.is_playing().await {
                    let (elapsed, total) = audio.get_progress_f64().await;
                    let _ = app.emit(
                        "playback-progress",
                        crate::core::audio::PlaybackProgress { elapsed, total },
                    );
                }
                if audio.take_playback_ended() {
                    let _ = app.emit("playback-ended", ());
                }
            }
        });
    });
}

/// Load music sources from sources.json at startup
/// Called via frontend Tauri command to ensure it runs in main runtime
fn load_sources_at_startup(app_handle: &tauri::AppHandle) {
    let app_handle = app_handle.clone();

    // Defer to main tokio runtime via a small delay + tokio::spawn in on_window_ready
    // Actually, we just let the frontend call the command directly
    eprintln!("[INFO] Music sources will be loaded by the frontend command");
    // 发送一个事件通知前端加载
    let _ = app_handle.emit("app-ready", ());
}

/// Run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            setup(app).map_err(|e| tauri::Error::Anyhow(e.into()))?;
            let window_labels: Vec<String> = app.webview_windows().keys().cloned().collect();
            eprintln!("[INFO] setup windows: {:?}", window_labels);
            eprintln!(
                "[INFO] main window exists: {}",
                app.get_webview_window("main").is_some()
            );

            // Start progress poller for playback progress events
            spawn_progress_poller(app.handle().clone());

            // 启动时加载音源
            load_sources_at_startup(app.handle());

            #[cfg(desktop)]
            {
                let _ = crate::tray::setup_tray(app);
            }

            #[cfg(desktop)]
            {
                let hotkey_rx = crate::hotkeys::setup_hotkeys(app);
                if let Ok(rx) = hotkey_rx {
                    let app_handle = app.handle().clone();
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
        .invoke_handler(tauri::generate_handler![
            commands::sources::register_source,
            commands::sources::register_js_source,
            commands::sources::list_sources,
            commands::sources::toggle_source,
            commands::sources::remove_source,
            commands::sources::load_sources_from_file,
            commands::sources::save_sources_config,
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
            commands::playlist::get_playlist_songs,
            commands::playlist::reorder_playlist_songs,
            commands::playlist::delete_playlist,
            commands::playlist::export_playlist,
            commands::playlist::import_playlist,
            commands::settings::set_theme,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::download::download_song,
            commands::download::get_download_dir,
            commands::download::set_download_dir,
            commands::local_music::scan_local_music,
            commands::local_music::play_local_file,
            commands::local_music::add_local_music_dir,
            commands::local_music::remove_local_music_dir,
            commands::local_music::list_local_music_dirs,
            commands::timer::start_sleep_timer,
            commands::timer::cancel_sleep_timer,
            commands::timer::get_sleep_timer_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
