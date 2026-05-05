use tauri::State;
use crate::AppState;
use crate::core::error::Result;
use crate::models::SearchResult;

#[tauri::command]
pub async fn search_music(
    state: State<'_, AppState>,
    keyword: String,
    page: u32,
) -> Result<SearchResult> {
    let timeout_ms = 12_000;
    let results = state.source_mgr.search_all(&keyword, page, timeout_ms).await;

    let songs = results
        .into_iter()
        .flat_map(|(_, result)| result.songs)
        .collect::<Vec<_>>();

    Ok(SearchResult {
        total: songs.len() as u32,
        songs,
        page,
        per_page: 20,
    })
}
