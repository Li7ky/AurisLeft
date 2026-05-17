use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use tauri::Emitter;

use crate::core::error::{AppError, Result};

const MAX_FILENAME_STEM_LEN: usize = 180;
const MAX_FILENAME_ATTEMPTS: usize = 1000;

pub fn sanitize_filename(input: &str) -> String {
    let sanitized: String = input
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\0'..='\u{1f}' => '_',
            _ => ch,
        })
        .collect();

    let sanitized = sanitized
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches([' ', '.'])
        .to_string();

    if sanitized.is_empty() {
        "unknown".to_string()
    } else {
        sanitized
    }
}

pub fn truncate_filename_stem(stem: &str) -> String {
    let mut truncated = String::new();
    for ch in stem.chars() {
        if truncated.len() + ch.len_utf8() > MAX_FILENAME_STEM_LEN {
            break;
        }
        truncated.push(ch);
    }

    let truncated = truncated.trim_matches([' ', '.']).to_string();
    if truncated.is_empty() {
        "unknown".to_string()
    } else {
        truncated
    }
}

fn filename_with_suffix(stem: &str, ext: &str, suffix: Option<usize>) -> String {
    let suffix_text = suffix.map(|n| format!(" ({})", n)).unwrap_or_default();
    let max_stem_len = MAX_FILENAME_STEM_LEN.saturating_sub(suffix_text.len());
    let mut adjusted_stem = String::new();

    for ch in stem.chars() {
        if adjusted_stem.len() + ch.len_utf8() > max_stem_len {
            break;
        }
        adjusted_stem.push(ch);
    }

    let adjusted_stem = adjusted_stem.trim_matches([' ', '.']);
    let final_stem = if adjusted_stem.is_empty() {
        "unknown"
    } else {
        adjusted_stem
    };
    format!("{}{}.{}", final_stem, suffix_text, ext)
}

async fn unique_file_path(dir: &Path, stem: &str, ext: &str) -> Result<(String, PathBuf)> {
    for attempt in 0..MAX_FILENAME_ATTEMPTS {
        let filename = filename_with_suffix(stem, ext, (attempt > 0).then_some(attempt));
        let file_path = dir.join(&filename);
        if fs::metadata(&file_path).await.is_err() {
            return Ok((filename, file_path));
        }
    }

    Err(AppError::IoError(format!(
        "无法生成不重名的下载文件名：{}.{}",
        stem, ext
    )))
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct DownloadProgressEvent {
    pub task_id: String,
    pub filename: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub progress_pct: f64,
}

#[derive(Clone)]
pub struct DownloadManager {
    download_dir: Arc<Mutex<PathBuf>>,
}

impl DownloadManager {
    pub fn new(download_dir: PathBuf) -> Self {
        Self {
            download_dir: Arc::new(Mutex::new(download_dir)),
        }
    }

    pub async fn download_song(
        &self,
        url: String,
        filename_stem: String,
        extension: String,
        task_id: String,
        app_handle: tauri::AppHandle,
    ) -> Result<(String, PathBuf)> {
        let dir = self.download_dir.lock().await.clone();
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| AppError::IoError(format!("创建下载目录失败 {}: {}", dir.display(), e)))?;

        let metadata = fs::metadata(&dir)
            .await
            .map_err(|e| AppError::IoError(format!("无法访问下载目录 {}: {}", dir.display(), e)))?;
        if !metadata.is_dir() {
            return Err(AppError::IoError(format!(
                "下载路径不是目录: {}",
                dir.display()
            )));
        }

        let safe_stem = truncate_filename_stem(&sanitize_filename(&filename_stem));
        let safe_ext = truncate_filename_stem(sanitize_filename(&extension).trim_matches('.'));
        let safe_ext = if safe_ext.is_empty() {
            "mp3".to_string()
        } else {
            safe_ext
        };
        let (filename, file_path) = unique_file_path(&dir, &safe_stem, &safe_ext).await?;
        let mut file = File::create_new(&file_path).await.map_err(|e| {
            AppError::IoError(format!("创建下载文件失败 {}: {}", file_path.display(), e))
        })?;

        let resp = reqwest::Client::new()
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(AppError::HttpError(format!("HTTP {}", resp.status())));
        }

        let total_bytes = resp.content_length();
        let mut stream = resp.bytes_stream();
        let mut downloaded: u64 = 0;

        use futures_crate::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| AppError::HttpError(e.to_string()))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| AppError::IoError(e.to_string()))?;
            downloaded += chunk.len() as u64;

            let pct = match total_bytes {
                Some(total) if total > 0 => (downloaded as f64 / total as f64) * 100.0,
                _ => 0.0,
            };

            let _ = app_handle.emit(
                "download-progress",
                DownloadProgressEvent {
                    task_id: task_id.clone(),
                    filename: filename.clone(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    progress_pct: pct.max(0.0).min(100.0),
                },
            );
        }

        Ok((filename, file_path))
    }

    pub async fn get_download_dir(&self) -> PathBuf {
        self.download_dir.lock().await.clone()
    }

    pub async fn set_download_dir(&self, dir: PathBuf) -> Result<()> {
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| AppError::IoError(format!("创建下载目录失败 {}: {}", dir.display(), e)))?;

        let metadata = fs::metadata(&dir)
            .await
            .map_err(|e| AppError::IoError(format!("无法访问下载目录 {}: {}", dir.display(), e)))?;
        if !metadata.is_dir() {
            return Err(AppError::IoError(format!(
                "下载路径不是目录: {}",
                dir.display()
            )));
        }

        let mut d = self.download_dir.lock().await;
        *d = dir;
        Ok(())
    }
}
