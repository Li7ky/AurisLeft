use crate::core::error::Result;
use crate::models::{Quality, Song};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn play_song(state: State<'_, AppState>, song: Song, quality: Quality) -> Result<()> {
    eprintln!(
        "[INFO] Starting playback: {} - {} quality={:?} song_id={} source={}",
        song.name, song.artist, quality, song.song_id, song.source
    );
    let url = match state
        .source_mgr
        .get_music_url(&song.song_id, &quality, &song.source)
        .await
    {
        Ok(u) => u,
        Err(e) => {
            eprintln!(
                "[ERROR] Failed to resolve music URL for song_id={} source={}: {}",
                song.song_id, song.source, e
            );
            return Err(e);
        }
    };
    state.audio.play(&url).await?;
    Ok(())
}

#[tauri::command]
pub async fn pause_playback(state: State<'_, AppState>) -> Result<()> {
    state.audio.pause().await
}

#[tauri::command]
pub async fn resume_playback(state: State<'_, AppState>) -> Result<()> {
    state.audio.resume().await
}

#[tauri::command]
pub async fn stop_playback(state: State<'_, AppState>) -> Result<()> {
    state.audio.stop().await
}

#[tauri::command]
pub async fn seek_to(state: State<'_, AppState>, position_seconds: f64) -> Result<()> {
    state.audio.seek_to(position_seconds).await
}

#[tauri::command]
pub async fn set_volume(state: State<'_, AppState>, volume: f64) -> Result<()> {
    state.audio.set_volume(volume as f32).await
}
