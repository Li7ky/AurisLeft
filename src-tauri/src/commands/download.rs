use crate::core::downloader::{sanitize_filename, truncate_filename_stem};
use crate::core::error::Result;
use crate::models::{Quality, Song};
use crate::AppState;
use tauri::Emitter;
use tauri::State;

#[derive(Clone, serde::Serialize)]
struct DownloadCompleteEvent {
    task_id: String,
    filename: String,
    path: String,
}

#[derive(Clone, serde::Serialize)]
struct DownloadErrorEvent {
    task_id: String,
    filename: String,
    message: String,
}

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

    let filename_stem = truncate_filename_stem(&sanitize_filename(&format!(
        "{} - {}",
        song.name, song.artist
    )));
    let display_filename = format!("{}.{}", filename_stem, ext);
    let task_id = format!("{}:{}", song.source, song.song_id);

    let app_handle = state.app_handle.lock().await.clone().ok_or_else(|| {
        crate::core::error::AppError::IoError("App handle not available".to_string())
    })?;

    let downloader = state.downloader.clone();
    let url_clone = url.clone();
    let filename_stem_clone = filename_stem.clone();
    let ext_clone = ext.to_string();
    let display_filename_clone = display_filename.clone();
    let task_id_clone = task_id.clone();

    tokio::spawn(async move {
        let result = downloader
            .download_song(
                url_clone,
                filename_stem_clone,
                ext_clone,
                task_id_clone.clone(),
                app_handle.clone(),
            )
            .await;
        match result {
            Ok((actual_filename, path)) => {
                let _ = app_handle.emit(
                    "download-complete",
                    DownloadCompleteEvent {
                        task_id: task_id_clone,
                        filename: actual_filename,
                        path: path.to_string_lossy().to_string(),
                    },
                );
            }
            Err(e) => {
                let _ = app_handle.emit(
                    "download-error",
                    DownloadErrorEvent {
                        task_id: task_id_clone,
                        filename: display_filename_clone,
                        message: e.to_string(),
                    },
                );
            }
        }
    });

    Ok(display_filename)
}

#[tauri::command]
pub async fn get_download_dir(state: State<'_, AppState>) -> Result<String> {
    let dir = state.downloader.get_download_dir().await;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_download_dir(state: State<'_, AppState>, dir: String) -> Result<()> {
    let trimmed = dir.trim();
    if trimmed.is_empty() {
        return Err(crate::core::error::AppError::IoError(
            "下载目录不能为空".to_string(),
        ));
    }

    let path = std::path::PathBuf::from(trimmed);
    state.downloader.set_download_dir(path).await
}
