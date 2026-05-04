use tauri::State;
use crate::AppState;
use crate::core::error::Result;
use crate::models::{Playlist, Song};

#[tauri::command]
pub async fn create_playlist(
    state: State<'_, AppState>,
    name: String,
) -> Result<i64> {
    let mut db = state.db.lock().unwrap();
    db.create_playlist(&name)
}

#[tauri::command]
pub async fn add_to_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    song: Song,
) -> Result<()> {
    let mut db = state.db.lock().unwrap();
    db.add_song_to_playlist(playlist_id, &song)
}

#[tauri::command]
pub async fn remove_from_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    position: u32,
) -> Result<()> {
    let mut db = state.db.lock().unwrap();
    db.remove_song_from_playlist(playlist_id, position)
}

#[tauri::command]
pub async fn list_playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>> {
    let db = state.db.lock().unwrap();
    db.list_playlists()
}

#[tauri::command]
pub async fn delete_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
) -> Result<()> {
    let mut db = state.db.lock().unwrap();
    db.delete_playlist(playlist_id)
}
