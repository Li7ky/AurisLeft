use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug, Serialize)]
pub enum AppError {
    #[error("Source error: {0}")]
    SourceError(String),
    #[error("Search timeout after {0}ms")]
    SearchTimeout(u32),
    #[error("Playback error: {0}")]
    PlaybackError(String),
    #[error("Database error: {0}")]
    DatabaseError(String),
    #[error("IO error: {0}")]
    IoError(String),
    #[error("Invalid format: {0}")]
    InvalidFormat(String),
    #[error("HTTP error: {0}")]
    HttpError(String),
    #[error("Cache error: {0}")]
    CacheError(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::IoError(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::HttpError(e.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::DatabaseError(e.to_string())
    }
}

/// Convenience type alias for Result using AppError
pub type Result<T> = std::result::Result<T, AppError>;
