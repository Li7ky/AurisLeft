use crate::core::error::{AppError, Result};
use crate::models::{Playlist, PlaylistSong, Quality, Song};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn create_playlist(state: State<'_, AppState>, name: String) -> Result<i64> {
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
    playlist_song_id: i64,
) -> Result<()> {
    let mut db = state.db.lock().unwrap();
    db.remove_song_from_playlist(playlist_id, playlist_song_id)
}

#[tauri::command]
pub async fn get_playlist_songs(
    state: State<'_, AppState>,
    playlist_id: i64,
) -> Result<Vec<PlaylistSong>> {
    let db = state.db.lock().unwrap();
    db.get_playlist_songs(playlist_id)
}

#[tauri::command]
pub async fn reorder_playlist_songs(
    state: State<'_, AppState>,
    playlist_id: i64,
    song_ids: Vec<i64>,
) -> Result<()> {
    if song_ids.is_empty() {
        return Err(AppError::InvalidFormat("歌单排序不能为空".to_string()));
    }

    let mut db = state.db.lock().unwrap();
    db.reorder_playlist_songs(playlist_id, &song_ids)
}

#[tauri::command]
pub async fn list_playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>> {
    let db = state.db.lock().unwrap();
    db.list_playlists()
}

#[tauri::command]
pub async fn delete_playlist(state: State<'_, AppState>, playlist_id: i64) -> Result<()> {
    let mut db = state.db.lock().unwrap();
    db.delete_playlist(playlist_id)
}

#[tauri::command]
pub async fn export_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    format: Option<String>,
) -> Result<String> {
    let db = state.db.lock().unwrap();
    match format.as_deref().unwrap_or("m3u") {
        "json" => db.export_to_json(playlist_id),
        "m3u" | "m3u8" => db.export_to_m3u(playlist_id),
        other => Err(AppError::InvalidFormat(format!(
            "Unsupported export format: {}",
            other
        ))),
    }
}

#[tauri::command]
pub async fn import_playlist(
    state: State<'_, AppState>,
    file_path: String,
    format: String,
) -> Result<i64> {
    let content = std::fs::read_to_string(&file_path)?;
    let name = std::path::Path::new(&file_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Imported Playlist")
        .to_string();

    let songs = match format.as_str() {
        "json" => parse_json_playlist(&content)?,
        "m3u" | "m3u8" => parse_m3u_playlist(&content),
        other => {
            return Err(AppError::InvalidFormat(format!(
                "Unsupported import format: {}",
                other
            )))
        }
    };

    let mut db = state.db.lock().unwrap();
    let playlist_id = db.create_playlist(&name)?;
    for song in songs {
        db.add_song_to_playlist(playlist_id, &song)?;
    }
    Ok(playlist_id)
}

fn parse_json_playlist(content: &str) -> Result<Vec<Song>> {
    let playlist_songs: Vec<PlaylistSong> =
        serde_json::from_str(content).map_err(|e| AppError::InvalidFormat(e.to_string()))?;

    Ok(playlist_songs
        .into_iter()
        .map(|song| Song {
            id: format!("{}:{}", song.source, song.song_id),
            name: song.name,
            artist: song.artist,
            album: song.album.unwrap_or_default(),
            duration: song.duration.unwrap_or_default(),
            cover_url: song.cover_url,
            source: song.source,
            song_id: song.song_id,
            qualities: vec![Quality::K320],
        })
        .collect())
}

fn parse_m3u_playlist(content: &str) -> Vec<Song> {
    let mut songs = Vec::new();
    let mut name = String::new();
    let mut artist = String::new();
    let mut duration = 0;
    let mut source = String::new();

    for line in content.lines().map(str::trim) {
        if let Some(extinf) = line.strip_prefix("#EXTINF:") {
            let (duration_text, title_text) = extinf.split_once(',').unwrap_or(("0", extinf));
            duration = duration_text.parse::<u32>().unwrap_or_default();
            if let Some((parsed_artist, parsed_name)) = title_text.split_once(" - ") {
                artist = parsed_artist.to_string();
                name = parsed_name.to_string();
            } else {
                artist.clear();
                name = title_text.to_string();
            }
        } else if let Some(value) = line.strip_prefix("#SOURCE:") {
            source = value.to_string();
        } else if let Some(song_id) = line.strip_prefix("#SONG_ID:") {
            let id = format!("{}:{}", source, song_id);
            songs.push(Song {
                id,
                name: name.clone(),
                artist: artist.clone(),
                album: String::new(),
                duration,
                cover_url: None,
                source: source.clone(),
                song_id: song_id.to_string(),
                qualities: vec![Quality::K320],
            });
        }
    }

    songs
}
