use tauri::State;

use crate::AppState;
use crate::core::error::Result;
use crate::models::SourceInfo;

#[tauri::command]
pub async fn register_source(
    state: State<'_, AppState>,
    source_type: String,
    name: String,
    content: String,
) -> Result<SourceInfo> {
    match source_type.as_str() {
        "json" => {
            let config: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
                crate::core::error::AppError::InvalidFormat(format!("Invalid JSON config: {}", e))
            })?;

            let api_base = config
                .get("api_base")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    crate::core::error::AppError::InvalidFormat("Missing 'api_base' in config".into())
                })?
                .to_string();

            let endpoints = config
                .get("endpoints")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            state
                .source_mgr
                .register_json_source(&name, &api_base, endpoints)
                .await
        }
        "js" => {
            state.source_mgr.register_js_source(content).await
        }
        _ => Err(crate::core::error::AppError::InvalidFormat(
            "Unknown source type. Use 'json' or 'js'".into(),
        )),
    }
}

#[tauri::command]
pub async fn register_js_source(
    state: State<'_, AppState>,
    code: String,
) -> Result<SourceInfo> {
    state.source_mgr.register_js_source(code).await
}

#[tauri::command]
pub async fn list_sources(state: State<'_, AppState>) -> Result<Vec<SourceInfo>> {
    Ok(state.source_mgr.list_sources().await)
}

#[tauri::command]
pub async fn toggle_source(
    state: State<'_, AppState>,
    source_id: String,
) -> Result<()> {
    state.source_mgr.toggle_source(&source_id).await
}

#[tauri::command]
pub async fn remove_source(
    state: State<'_, AppState>,
    source_id: String,
) -> Result<()> {
    state.source_mgr.remove_source(&source_id).await
}
