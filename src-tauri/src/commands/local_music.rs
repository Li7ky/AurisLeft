use std::path::PathBuf;
use tauri::State;

use crate::core::error::Result;
use crate::core::local_music::LocalMusicScanner;
use crate::models::LocalSong;
use crate::AppState;

#[tauri::command]
pub async fn scan_local_music(state: State<'_, AppState>) -> Result<Vec<LocalSong>> {
    let (scan_dirs, _app_dir) = {
        let settings = state
            .db
            .lock()
            .map_err(|e| crate::core::error::AppError::DatabaseError(e.to_string()))?
            .get_local_music_dirs()?;
        let dirs: Vec<PathBuf> = settings.into_iter().map(PathBuf::from).collect();
        (dirs, state.app_dir.clone())
    };

    if scan_dirs.is_empty() {
        if let Some(music_dir) = dirs::audio_dir() {
            let scanner = LocalMusicScanner::new(vec![music_dir]);
            return scanner.scan();
        }
        return Err(crate::core::error::AppError::IoError(
            "No music directories configured and default music folder not found".to_string(),
        ));
    }

    let scanner = LocalMusicScanner::new(scan_dirs);
    scanner.scan()
}

#[tauri::command]
pub async fn play_local_file(state: State<'_, AppState>, file_path: String) -> Result<()> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(crate::core::error::AppError::PlaybackError(format!(
            "本地文件不存在: {}",
            file_path
        )));
    }

    let url = url::Url::from_file_path(&path).map_err(|_| {
        crate::core::error::AppError::PlaybackError(format!(
            "无法解析本地文件路径: {}",
            file_path
        ))
    })?;

    state.audio.play(url.as_str()).await
}

#[tauri::command]
pub async fn add_local_music_dir(state: State<'_, AppState>, dir_path: String) -> Result<()> {
    let trimmed = dir_path.trim();
    if trimmed.is_empty() {
        return Err(crate::core::error::AppError::IoError(
            "本地音乐目录不能为空".to_string(),
        ));
    }

    let path = PathBuf::from(trimmed);
    if !path.exists() {
        return Err(crate::core::error::AppError::IoError(format!(
            "本地音乐目录不存在: {}",
            path.display()
        )));
    }
    if !path.is_dir() {
        return Err(crate::core::error::AppError::IoError(format!(
            "本地音乐路径不是目录: {}",
            path.display()
        )));
    }

    state
        .db
        .lock()
        .map_err(|e| crate::core::error::AppError::DatabaseError(e.to_string()))?
        .add_local_music_dir(trimmed)
}

#[tauri::command]
pub async fn remove_local_music_dir(state: State<'_, AppState>, dir_path: String) -> Result<()> {
    state
        .db
        .lock()
        .map_err(|e| crate::core::error::AppError::DatabaseError(e.to_string()))?
        .remove_local_music_dir(&dir_path)
}

#[tauri::command]
pub async fn list_local_music_dirs(state: State<'_, AppState>) -> Result<Vec<String>> {
    state
        .db
        .lock()
        .map_err(|e| crate::core::error::AppError::DatabaseError(e.to_string()))?
        .get_local_music_dirs()
}
