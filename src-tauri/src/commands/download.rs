use tauri::State;
use tauri::Emitter;
use crate::AppState;
use crate::core::error::Result;
use crate::models::{Song, Quality};

#[tauri::command]
pub async fn download_song(
    state: State<'_, AppState>,
    song: Song,
    quality: Quality,
) -> Result<String> {
    let source_mgr = state.source_mgr.clone();
    let url = source_mgr
        .get_music_url(&song.song_id, &quality, &song.source)
        .await
        .map_err(|e| crate::core::error::AppError::HttpError(e.to_string()))?;

    let ext = match quality {
        Quality::FLAC | Quality::HiRes => "flac",
        _ => "mp3",
    };

    let filename = format!("{} - {}.{}", song.name, song.artist, ext);

    let app_handle = state
        .app_handle
        .lock()
        .await
        .clone()
        .ok_or_else(|| crate::core::error::AppError::IoError("App handle not available".to_string()))?;

    let downloader = state.downloader.clone();
    let url_clone = url.clone();
    let filename_clone = filename.clone();

    tokio::spawn(async move {
        let result = downloader.download_song(url_clone, filename_clone, app_handle.clone()).await;
        match result {
            Ok(path) => {
                let _ = app_handle.emit("download-complete", path.to_string_lossy().to_string());
            }
            Err(e) => {
                let _ = app_handle.emit("download-error", e.to_string());
            }
        }
    });

    Ok(filename)
}

#[tauri::command]
pub async fn get_download_dir(state: State<'_, AppState>) -> Result<String> {
    let dir = state.downloader.get_download_dir().await;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_download_dir(state: State<'_, AppState>, dir: String) -> Result<()> {
    let path = std::path::PathBuf::from(&dir);
    state.downloader.set_download_dir(path).await;
    Ok(())
}
