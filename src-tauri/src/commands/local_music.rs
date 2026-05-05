use std::path::PathBuf;
use tauri::State;

use crate::AppState;
use crate::core::error::Result;
use crate::core::local_music::LocalMusicScanner;
use crate::models::LocalSong;

#[tauri::command]
pub async fn scan_local_music(state: State<'_, AppState>) -> Result<Vec<LocalSong>> {
    let (scan_dirs, _app_dir) = {
        let settings = state.db.lock().map_err(|e| crate::core::error::AppError::DatabaseError(e.to_string()))?.get_local_music_dirs()?;
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
    let url = if cfg!(target_os = "windows") {
        format!("file:///{}", file_path.replace('\\', "/"))
    } else {
        format!("file://{}", file_path)
    };

    state.audio.play(&url).await
}

#[tauri::command]
pub async fn add_local_music_dir(state: State<'_, AppState>, dir_path: String) -> Result<()> {
    state.db.lock().map_err(|e| crate::core::error::AppError::DatabaseError(e.to_string()))?.add_local_music_dir(&dir_path)
}

#[tauri::command]
pub async fn remove_local_music_dir(state: State<'_, AppState>, dir_path: String) -> Result<()> {
    state.db.lock().map_err(|e| crate::core::error::AppError::DatabaseError(e.to_string()))?.remove_local_music_dir(&dir_path)
}

#[tauri::command]
pub async fn list_local_music_dirs(state: State<'_, AppState>) -> Result<Vec<String>> {
    state.db.lock().map_err(|e| crate::core::error::AppError::DatabaseError(e.to_string()))?.get_local_music_dirs()
}
