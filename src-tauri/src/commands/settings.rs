use crate::core::error::Result;
use crate::models::{AppSettings, ThemeConfig};
use crate::AppState;
use serde_json;
use tauri::State;

#[tauri::command]
pub async fn set_theme(state: State<'_, AppState>, theme: ThemeConfig) -> Result<()> {
    let mut db = state.db.lock().unwrap();
    let mut settings = load_app_settings(&db)?;
    settings.appearance.theme = theme;
    let value = serde_json::to_value(&settings)
        .map_err(|e| crate::core::error::AppError::InvalidFormat(e.to_string()))?;
    db.save_setting("app_settings", &value)
}

#[tauri::command]
pub async fn load_settings(state: State<'_, AppState>) -> Result<AppSettings> {
    let db = state.db.lock().unwrap();
    load_app_settings(&db)
}

#[tauri::command]
pub async fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<()> {
    let mut db = state.db.lock().unwrap();
    let value = serde_json::to_value(&settings)
        .map_err(|e| crate::core::error::AppError::InvalidFormat(e.to_string()))?;
    db.save_setting("app_settings", &value)
}

fn load_app_settings(db: &crate::core::storage::Database) -> Result<AppSettings> {
    let Some(value) = db.load_setting("app_settings")? else {
        return Ok(AppSettings::default());
    };

    serde_json::from_value(value)
        .map_err(|e| crate::core::error::AppError::InvalidFormat(e.to_string()))
}
