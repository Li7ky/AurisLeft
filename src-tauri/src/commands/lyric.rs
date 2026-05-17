use tauri::State;

use crate::core::error::Result;
use crate::models::Lyric;
use crate::AppState;

#[tauri::command]
pub async fn fetch_lyric(
    state: State<'_, AppState>,
    song_id: String,
    source: String,
) -> Result<Lyric> {
    if song_id.trim().is_empty() || source.trim().is_empty() {
        return Ok(empty_lyric());
    }

    match state.source_mgr.get_lyric(&song_id, &source).await {
        Ok(lyric) => Ok(lyric),
        Err(err) => {
            eprintln!(
                "[DEBUG] 获取歌词失败 song_id={} source={}: {}",
                song_id, source, err
            );
            Ok(empty_lyric())
        }
    }
}

fn empty_lyric() -> Lyric {
    Lyric {
        lines: Vec::new(),
        metadata: None,
    }
}
