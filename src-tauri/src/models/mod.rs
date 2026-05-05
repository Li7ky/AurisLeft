use serde::{Deserialize, Serialize};

/// Audio quality options compatible with LX Music sources
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Quality {
    K128,
    K320,
    FLAC,
    HiRes,
}

impl std::fmt::Display for Quality {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Quality::K128 => write!(f, "128k"),
            Quality::K320 => write!(f, "320k"),
            Quality::FLAC => write!(f, "flac"),
            Quality::HiRes => write!(f, "hires"),
        }
    }
}

/// Represents a song from a music source
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub album: String,
    pub duration: u32,
    pub cover_url: Option<String>,
    pub source: String,
    pub song_id: String,
    pub qualities: Vec<Quality>,
}

/// Music source metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub source_type: SourceType,
    pub enabled: bool,
    pub supported_qualities: Vec<Quality>,
    pub fail_count: u32,
}

/// Type of music source
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    JsModule,
    JsonConfig,
}

/// A single line of lyrics with timestamp
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricLine {
    pub time: f64,
    pub text: String,
}

/// Complete lyrics with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lyric {
    pub lines: Vec<LyricLine>,
    pub metadata: Option<LyricMetadata>,
}

/// Metadata associated with lyrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub by: Option<String>,
}

/// Search results from a music source
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub songs: Vec<Song>,
    pub total: u32,
    pub page: u32,
    pub per_page: u32,
}

/// Current playback state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackState {
    Idle,
    Loading,
    Playing,
    Paused,
    Error(String),
}

/// Playlist summary information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub song_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// A song entry within a playlist
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistSong {
    pub id: i64,
    pub playlist_id: i64,
    pub song_id: String,
    pub source: String,
    pub name: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration: Option<u32>,
    pub cover_url: Option<String>,
    pub position: i64,
}

/// Theme color configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    pub primary: String,
    pub background: String,
    pub surface: String,
    pub text_primary: String,
    pub text_secondary: String,
    pub accent: String,
}

/// Player-specific settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerSettings {
    pub default_quality: String,
    pub auto_play_next: bool,
    pub volume: f64,
    pub shuffle: bool,
    pub repeat_mode: String,
}

/// Appearance-specific settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceSettings {
    pub theme: ThemeConfig,
    pub show_lyric: bool,
    pub font_size: String,
}

/// Source manager settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSettings {
    pub timeout_ms: u32,
    pub fail_threshold: u32,
    pub cache_duration_minutes: u32,
}

/// Application settings container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub player: PlayerSettings,
    pub appearance: AppearanceSettings,
    pub sources: SourceSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            player: PlayerSettings {
                default_quality: "320k".to_string(),
                auto_play_next: true,
                volume: 0.8,
                shuffle: false,
                repeat_mode: "none".to_string(),
            },
            appearance: AppearanceSettings {
                theme: ThemeConfig {
                    primary: "#1DB954".to_string(),
                    background: "#121212".to_string(),
                    surface: "#1e1e1e".to_string(),
                    text_primary: "#ffffff".to_string(),
                    text_secondary: "#b3b3b3".to_string(),
                    accent: "#1ed760".to_string(),
                },
                show_lyric: true,
                font_size: "medium".to_string(),
            },
            sources: SourceSettings {
                timeout_ms: 8000,
                fail_threshold: 3,
                cache_duration_minutes: 30,
            },
        }
    }
}

/// Local music file with metadata extracted from ID3 tags
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSong {
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u32,
    pub file_size: u64,
    pub format: String,
}
