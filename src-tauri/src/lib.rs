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
    use std::io::Read;

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
    
    // 启动时自动加载 sources.json 中的音源
    let sources_file = app_dir.join("sources.json");
    eprintln!("[DEBUG] 尝试加载音源配置文件：{:?}", sources_file);
    eprintln!("[DEBUG] 配置文件是否存在：{}", sources_file.exists());
    
    if sources_file.exists() {
        if let Ok(mut file) = std::fs::File::open(&sources_file) {
            let mut content = String::new();
            if let Ok(_) = file.read_to_string(&mut content) {
                // 移除 BOM 字符
                if content.starts_with('\u{FEFF}') {
                    content = content[3..].to_string();
                    eprintln!("[DEBUG] 已移除 BOM 字符");
                }
                eprintln!("[DEBUG] 配置文件内容：{}", content);
                if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(sources) = config.as_object().and_then(|o| o.get("sources")).and_then(|v| v.as_array()) {
                        eprintln!("[DEBUG] 找到 {} 个音源配置", sources.len());
                        for source in sources {
                            if let (Some(name), Some(url), Some(enabled)) = (
                                source.get("name").and_then(|v| v.as_str()),
                                source.get("url").and_then(|v| v.as_str()),
                                source.get("enabled").and_then(|v| v.as_bool())
                            ) {
                                eprintln!("[DEBUG] 处理音源：{} = {}, enabled={}", name, url, enabled);
                                if enabled {
                                    let url_clone = url.to_string();
                                    let name_clone = name.to_string();
                                    
                                    // 使用 std::thread 而不是 tokio::spawn
                                    let http_clone = http.clone();
                                    let mgr_clone = source_mgr.clone();
                                    
                                    std::thread::spawn(move || {
                                        let rt = tokio::runtime::Runtime::new().unwrap();
                                        rt.block_on(async move {
                                            eprintln!("[DEBUG] 下载音源：{} from {}", name_clone, url_clone);
                                            match http_clone.get(&url_clone, None).await {
                                                Ok(code) => {
                                                    eprintln!("[DEBUG] 下载成功，注册音源：{}", name_clone);
                                                    match mgr_clone.register_js_source(code).await {
                                                        Ok(info) => eprintln!("[DEBUG] 音源注册成功：{} ({})", info.name, info.id),
                                                        Err(e) => eprintln!("[DEBUG] 音源注册失败：{:?}", e),
                                                    }
                                                }
                                                Err(e) => eprintln!("[DEBUG] 下载失败：{:?}", e),
                                            }
                                        });
                                    });
                                }
                            }
                        }
                    } else {
                        eprintln!("[DEBUG] 配置文件中没有找到 sources 数组");
                    }
                } else {
                    eprintln!("[DEBUG] JSON 解析失败");
                }
            } else {
                eprintln!("[DEBUG] 读取文件内容失败");
            }
        } else {
            eprintln!("[DEBUG] 打开文件失败");
        }
    } else {
        eprintln!("[DEBUG] 配置文件不存在");
    }
    
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

    // Use std::thread with a blocking runtime
    std::thread::spawn(move || {
        let rt = tokio::runtime::Handle::current();
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

/// Run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            setup(app).map_err(|e| tauri::Error::Anyhow(e.into()))?;
            
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
                    let app_handle_clone = app_handle.clone();
                    std::thread::spawn(move || {
                        while let Ok(action) = rx.recv() {
                            use crate::hotkeys::HotKeyAction;
                            let event_name = match action {
                                HotKeyAction::PlayPause => "hotkey-play-pause",
                                HotKeyAction::Next => "hotkey-next",
                                HotKeyAction::Prev => "hotkey-prev",
                            };
                            let _ = app_handle_clone.emit(event_name, ());
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
