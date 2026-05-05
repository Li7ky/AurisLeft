use std::path::{Path, PathBuf};

use id3::TagLike;
use walkdir::WalkDir;

use crate::core::error::{AppError, Result};
use crate::models::LocalSong;

const SUPPORTED_EXTENSIONS: &[&str] = &[".mp3", ".flac", ".wav", ".ogg", ".m4a"];

pub struct LocalMusicScanner {
    scan_dirs: Vec<PathBuf>,
}

impl LocalMusicScanner {
    pub fn new(scan_dirs: Vec<PathBuf>) -> Self {
        Self { scan_dirs }
    }

    pub fn scan(&self) -> Result<Vec<LocalSong>> {
        let mut songs: Vec<LocalSong> = Vec::new();

        for dir in &self.scan_dirs {
            if !dir.exists() {
                continue;
            }

            for entry in WalkDir::new(dir)
                .into_iter()
                .filter_entry(|e| !is_hidden(e))
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                let extension = match path.extension().and_then(|e| e.to_str()) {
                    Some(ext) => ext.to_lowercase(),
                    None => continue,
                };

                if !SUPPORTED_EXTENSIONS.iter().any(|&e| e.trim_start_matches('.') == extension) {
                    continue;
                }

                match Self::get_metadata(path) {
                    Ok(song) => songs.push(song),
                    Err(_) => {
                        eprintln!("Warning: failed to read metadata for {:?}", path);
                    }
                }
            }
        }

        Ok(songs)
    }

    pub fn get_metadata(file_path: &Path) -> Result<LocalSong> {
        let file_meta = std::fs::metadata(file_path).map_err(|e| {
            AppError::IoError(format!("Failed to read file metadata for {:?}: {}", file_path, e))
        })?;

        let file_size = file_meta.len();

        let format = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown")
            .to_lowercase();

        let (title, artist, album, duration) = if format == "mp3" {
            match id3::Tag::read_from_path(file_path) {
                Ok(tag) => (
                    tag.title().unwrap_or("Unknown").to_string(),
                    tag.artist().unwrap_or("Unknown").to_string(),
                    tag.album().unwrap_or("Unknown").to_string(),
                    tag.duration().unwrap_or(0) as u32,
                ),
                Err(_) => (
                    file_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                    "Unknown".to_string(),
                    "Unknown".to_string(),
                    0,
                ),
            }
        } else {
            (
                file_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                "Unknown".to_string(),
                "Unknown".to_string(),
                0,
            )
        };

        Ok(LocalSong {
            file_path: file_path.to_string_lossy().to_string(),
            title,
            artist,
            album,
            duration,
            file_size,
            format,
        })
    }
}

fn is_hidden(entry: &walkdir::DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|s| s.starts_with('.'))
        .unwrap_or(false)
}
