use tauri::State;
use crate::AppState;
use crate::core::error::Result;

#[tauri::command]
pub async fn search_music(
    _state: State<'_, AppState>,
    _keyword: String,
    _page: u32,
) -> Result<serde_json::Value> {
    Err(crate::core::error::AppError::SearchTimeout(8000))
}
