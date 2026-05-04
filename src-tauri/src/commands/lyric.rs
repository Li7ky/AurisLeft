use tauri::State;
use crate::AppState;
use crate::core::error::Result;
use crate::models::Lyric;

#[tauri::command]
pub async fn fetch_lyric(
    _state: State<'_, AppState>,
    _song_id: String,
    _source: String,
) -> Result<Lyric> {
    todo!()
}
