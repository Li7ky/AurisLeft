use crate::core::error::Result;
use crate::core::timer::SleepTimerStatus;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn start_sleep_timer(state: State<'_, AppState>, minutes: u64) -> Result<()> {
    let app_handle = state.app_handle.lock().await.clone().ok_or_else(|| {
        crate::core::error::AppError::IoError("App handle not available".to_string())
    })?;

    state.sleep_timer.start(minutes * 60, app_handle).await;
    Ok(())
}

#[tauri::command]
pub async fn cancel_sleep_timer(state: State<'_, AppState>) -> Result<()> {
    state.sleep_timer.cancel().await;
    Ok(())
}

#[tauri::command]
pub async fn get_sleep_timer_status(state: State<'_, AppState>) -> Result<SleepTimerStatus> {
    let status = state.sleep_timer.get_status().await;
    Ok(status)
}
