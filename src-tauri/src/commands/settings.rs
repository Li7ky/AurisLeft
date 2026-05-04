use tauri::State;
use serde_json;
use crate::AppState;
use crate::core::error::Result;
use crate::models::ThemeConfig;

#[tauri::command]
pub async fn set_theme(
    state: State<'_, AppState>,
    theme: ThemeConfig,
) -> Result<()> {
    let mut db = state.db.lock().unwrap();
    let value = serde_json::to_value(&theme)
        .map_err(|e| crate::core::error::AppError::InvalidFormat(e.to_string()))?;
    db.save_setting("appearance.theme", &value)
}

#[tauri::command]
pub async fn load_settings(state: State<'_, AppState>) -> Result<serde_json::Value> {
    let db = state.db.lock().unwrap();
    db.load_all_settings()
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<()> {
    let mut db = state.db.lock().unwrap();
    db.save_setting(&key, &value)
}
