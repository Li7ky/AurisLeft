use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use tauri::Emitter;

use crate::core::error::{AppError, Result};

#[derive(Clone, Debug, serde::Serialize)]
pub struct DownloadProgressEvent {
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
        filename: String,
        app_handle: tauri::AppHandle,
    ) -> Result<PathBuf> {
        let dir = self.download_dir.lock().await.clone();
        tokio::fs::create_dir_all(&dir).await.map_err(|e| AppError::IoError(e.to_string()))?;

        let file_path = dir.join(&filename);
        let mut file = File::create(&file_path).await.map_err(|e| AppError::IoError(e.to_string()))?;

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
            file.write_all(&chunk).await.map_err(|e| AppError::IoError(e.to_string()))?;
            downloaded += chunk.len() as u64;

            let pct = match total_bytes {
                Some(total) if total > 0 => (downloaded as f64 / total as f64) * 100.0,
                _ => 0.0,
            };

            let _ = app_handle.emit("download-progress", DownloadProgressEvent {
                filename: filename.clone(),
                downloaded_bytes: downloaded,
                total_bytes,
                progress_pct: pct.max(0.0).min(100.0),
            });
        }

        Ok(file_path)
    }

    pub async fn get_download_dir(&self) -> PathBuf {
        self.download_dir.lock().await.clone()
    }

    pub async fn set_download_dir(&self, dir: PathBuf) {
        let mut d = self.download_dir.lock().await;
        *d = dir;
    }
}
