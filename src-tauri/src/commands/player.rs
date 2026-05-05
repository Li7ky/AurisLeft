use tauri::State;
use crate::AppState;
use crate::core::error::Result;
use crate::models::{Song, Quality};

#[tauri::command]
pub async fn play_song(
    state: State<'_, AppState>,
    song: Song,
    quality: Quality,
) -> Result<()> {
    eprintln!("[DEBUG] play_song: {} - {} quality={:?} song_id={} source={}", song.name, song.artist, quality, song.song_id, song.source);
    let url = match state.source_mgr.get_music_url(&song.song_id, &quality, &song.source).await {
        Ok(u) => {
            eprintln!("[DEBUG] got music url: {}", &u[..u.len().min(120)]);
            u
        }
        Err(e) => {
            eprintln!("[ERROR] get_music_url failed: {}", e);
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
pub async fn seek_to(state: State<'_, AppState>, position_secs: f64) -> Result<()> {
    state.audio.seek_to(position_secs).await
}

#[tauri::command]
pub async fn set_volume(state: State<'_, AppState>, volume: f64) -> Result<()> {
    state.audio.set_volume(volume as f32).await;
    Ok(())
}
