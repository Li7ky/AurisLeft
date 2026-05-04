use std::path::Path;

use rusqlite::Connection;
use serde_json;

use crate::core::error::{AppError, Result};
use crate::models::{Playlist, PlaylistSong, Song};

/// Database wrapper managing SQLite connection
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Initialize database at the given application directory
    pub fn init(app_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(app_dir)?;
        let db_path = app_dir.join("music_player.db");
        let conn = Connection::open(db_path)?;

        // Enable WAL mode for better concurrent performance
        conn.execute_batch(
            "
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            ",
        )?;

        // Create tables
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                song_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS playlist_songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id INTEGER NOT NULL,
                song_id TEXT NOT NULL,
                source TEXT NOT NULL,
                name TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT,
                duration INTEGER,
                cover_url TEXT,
                position INTEGER NOT NULL,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_id TEXT NOT NULL UNIQUE,
                source TEXT NOT NULL,
                name TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT,
                duration INTEGER,
                cover_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON playlist_songs(playlist_id);
            CREATE INDEX IF NOT EXISTS idx_favorites_song_id ON favorites(song_id);
            ",
        )?;

        Ok(Self { conn })
    }

    /// Create a new playlist
    pub fn create_playlist(&mut self, name: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO playlists (name) VALUES (?1)",
            [name],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Add a song to a playlist
    pub fn add_song_to_playlist(&mut self, playlist_id: i64, song: &Song) -> Result<()> {
        let position: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_songs WHERE playlist_id = ?1",
            [playlist_id],
            |row| row.get(0),
        )?;

        self.conn.execute(
            "INSERT INTO playlist_songs (playlist_id, song_id, source, name, artist, album, duration, cover_url, position)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            (
                playlist_id,
                &song.song_id,
                &song.source,
                &song.name,
                &song.artist,
                &song.album,
                song.duration as i64,
                song.cover_url.as_deref().unwrap_or(""),
                position,
            ),
        )?;

        self.conn.execute(
            "UPDATE playlists SET song_count = (SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?1), updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            [playlist_id],
        )?;

        Ok(())
    }

    /// Remove a song from a playlist by position
    pub fn remove_song_from_playlist(&mut self, playlist_id: i64, position: u32) -> Result<()> {
        self.conn.execute(
            "DELETE FROM playlist_songs WHERE playlist_id = ?1 AND position = ?2",
            (playlist_id, position as i64),
        )?;

        self.conn.execute(
            "UPDATE playlists SET song_count = (SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?1), updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            [playlist_id],
        )?;

        Ok(())
    }

    /// Get all songs in a playlist
    pub fn get_playlist_songs(&self, playlist_id: i64) -> Result<Vec<PlaylistSong>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, playlist_id, song_id, source, name, artist, album, duration, cover_url, position
             FROM playlist_songs WHERE playlist_id = ?1 ORDER BY position ASC",
        )?;

        let songs = stmt
            .query_map([playlist_id], |row| {
                Ok(PlaylistSong {
                    id: row.get(0)?,
                    playlist_id: row.get(1)?,
                    song_id: row.get(2)?,
                    source: row.get(3)?,
                    name: row.get(4)?,
                    artist: row.get(5)?,
                    album: row.get(6)?,
                    duration: row.get(7).ok(),
                    cover_url: row.get(8)?,
                    position: row.get(9)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(songs)
    }

    /// List all playlists
    pub fn list_playlists(&self) -> Result<Vec<Playlist>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, song_count, created_at, updated_at FROM playlists ORDER BY updated_at DESC",
        )?;

        let playlists = stmt
            .query_map([], |row| {
                Ok(Playlist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    song_count: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(playlists)
    }

    /// Delete a playlist and its songs
    pub fn delete_playlist(&mut self, playlist_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM playlists WHERE id = ?1",
            [playlist_id],
        )?;
        Ok(())
    }

    /// Toggle a song in favorites. Returns true if added, false if removed.
    pub fn toggle_favorite(&mut self, song: &Song) -> Result<bool> {
        let existing = self.conn.query_row(
            "SELECT id FROM favorites WHERE song_id = ?1",
            [&song.song_id],
            |row| row.get::<_, i64>(0),
        );

        match existing {
            Ok(_) => {
                self.conn.execute(
                    "DELETE FROM favorites WHERE song_id = ?1",
                    [&song.song_id],
                )?;
                Ok(false)
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                self.conn.execute(
                    "INSERT INTO favorites (song_id, source, name, artist, album, duration, cover_url)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    (
                        &song.song_id,
                        &song.source,
                        &song.name,
                        &song.artist,
                        &song.album,
                        song.duration as i64,
                        song.cover_url.as_deref().unwrap_or(""),
                    ),
                )?;
                Ok(true)
            }
            Err(e) => Err(AppError::DatabaseError(e.to_string())),
        }
    }

    /// Check if a song is favorited
    pub fn is_favorite(&self, song_id: &str) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM favorites WHERE song_id = ?1",
            [song_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Get all favorite songs
    pub fn get_favorites(&self) -> Result<Vec<Song>> {
        let mut stmt = self.conn.prepare(
            "SELECT song_id, source, name, artist, album, duration, cover_url FROM favorites ORDER BY created_at DESC",
        )?;

        let songs = stmt
            .query_map([], |row| {
                let duration: Option<i64> = row.get(5)?;
                Ok(Song {
                    id: row.get(0)?,
                    name: row.get(2)?,
                    artist: row.get(3)?,
                    album: row.get(4).unwrap_or_default(),
                    duration: duration.unwrap_or(0) as u32,
                    cover_url: row.get(6)?,
                    source: row.get(1)?,
                    song_id: row.get(0)?,
                    qualities: Vec::new(),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(songs)
    }

    /// Save a setting as JSON
    pub fn save_setting(&mut self, key: &str, value: &serde_json::Value) -> Result<()> {
        let value_str = serde_json::to_string(value).map_err(|e| AppError::InvalidFormat(e.to_string()))?;
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            (key, value_str),
        )?;
        Ok(())
    }

    /// Load a single setting
    pub fn load_setting(&self, key: &str) -> Result<Option<serde_json::Value>> {
        let result = self.conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        );

        match result {
            Ok(value_str) => {
                let value: serde_json::Value =
                    serde_json::from_str(&value_str).map_err(|e| AppError::InvalidFormat(e.to_string()))?;
                Ok(Some(value))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::DatabaseError(e.to_string())),
        }
    }

    /// Load all settings into a single JSON object
    pub fn load_all_settings(&self) -> Result<serde_json::Value> {
        let mut stmt = self.conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut map = serde_json::Map::new();
        for row in rows {
            let (key, value_str) = row?;
            let value: serde_json::Value =
                serde_json::from_str(&value_str).map_err(|e| AppError::InvalidFormat(e.to_string()))?;
            map.insert(key, value);
        }

        Ok(serde_json::Value::Object(map))
    }

    /// Export playlist to M3U format
    pub fn export_to_m3u(&self, playlist_id: i64) -> Result<String> {
        let playlist = self.conn.query_row(
            "SELECT name FROM playlists WHERE id = ?1",
            [playlist_id],
            |row| row.get::<_, String>(0),
        )?;

        let songs = self.get_playlist_songs(playlist_id)?;

        let mut m3u = String::from("#EXTM3U\n");
        m3u.push_str(&format!("#PLAYLIST: {}\n", playlist));

        for song in &songs {
            m3u.push_str(&format!("#EXTINF:{},{} - {}\n", song.duration.unwrap_or(0), song.artist, song.name));
            m3u.push_str(&format!("#SOURCE:{}\n", song.source));
            m3u.push_str(&format!("#SONG_ID:{}\n", song.song_id));
            m3u.push('\n');
        }

        Ok(m3u)
    }

    /// Export playlist to JSON format
    pub fn export_to_json(&self, playlist_id: i64) -> Result<String> {
        let songs = self.get_playlist_songs(playlist_id)?;
        let json = serde_json::to_string_pretty(&songs).map_err(|e| AppError::InvalidFormat(e.to_string()))?;
        Ok(json)
    }
}
