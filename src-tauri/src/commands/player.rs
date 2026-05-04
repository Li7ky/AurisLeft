use tauri::State;
use crate::AppState;
use crate::core::error::Result;
use crate::models::{Song, Quality};

#[tauri::command]
pub async fn play_song(
    _state: State<'_, AppState>,
    _song: Song,
    _quality: Quality,
) -> Result<()> {
    todo!()
}

#[tauri::command]
pub async fn pause_playback(_state: State<'_, AppState>) -> Result<()> {
    todo!()
}

#[tauri::command]
pub async fn resume_playback(_state: State<'_, AppState>) -> Result<()> {
    todo!()
}

#[tauri::command]
pub async fn stop_playback(_state: State<'_, AppState>) -> Result<()> {
    todo!()
}

#[tauri::command]
pub async fn seek_to(_state: State<'_, AppState>, _position_secs: f64) -> Result<()> {
    todo!()
}

#[tauri::command]
pub async fn set_volume(_state: State<'_, AppState>, _volume: f64) -> Result<()> {
    todo!()
}
