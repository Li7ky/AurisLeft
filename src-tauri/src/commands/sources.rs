use tauri::State;
use crate::AppState;
use crate::core::error::Result;
use crate::models::SourceInfo;

#[tauri::command]
pub async fn register_source(
    _state: State<'_, AppState>,
    _name: String,
    _api_base: String,
) -> Result<SourceInfo> {
    Err(crate::core::error::AppError::SourceError(
        "Not yet implemented".into(),
    ))
}

#[tauri::command]
pub async fn list_sources(_state: State<'_, AppState>) -> Result<Vec<SourceInfo>> {
    Ok(Vec::new())
}

#[tauri::command]
pub async fn toggle_source(
    _state: State<'_, AppState>,
    _source_id: String,
) -> Result<()> {
    Err(crate::core::error::AppError::SourceError(
        "Not yet implemented".into(),
    ))
}

#[tauri::command]
pub async fn remove_source(
    _state: State<'_, AppState>,
    _source_id: String,
) -> Result<()> {
    Err(crate::core::error::AppError::SourceError(
        "Not yet implemented".into(),
    ))
}
