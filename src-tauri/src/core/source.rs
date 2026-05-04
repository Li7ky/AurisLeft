use std::collections::HashMap;

use tokio::sync::RwLock;

use crate::core::error::Result;
use crate::models::{Lyric, Quality, SearchResult, SourceInfo, SourceType};

/// A JSON-based music source configured with API endpoints
#[derive(Clone)]
pub struct JsonSource {
    pub info: SourceInfo,
    pub api_base: String,
    pub api_endpoints: HashMap<String, String>,
}

impl JsonSource {
    pub fn new(name: &str, api_base: &str, endpoints: HashMap<String, String>) -> Self {
        Self {
            info: SourceInfo {
                id: uuid::Uuid::new_v4().to_string(),
                name: name.to_string(),
                version: "1.0.0".to_string(),
                source_type: SourceType::JsonConfig,
                enabled: true,
                supported_qualities: vec![Quality::K128, Quality::K320, Quality::FLAC],
                fail_count: 0,
            },
            api_base: api_base.to_string(),
            api_endpoints: endpoints,
        }
    }

    fn build_url(&self, endpoint: &str, params: &[(&str, String)]) -> String {
        let base = self.api_base.trim_end_matches('/');
        let path = self.api_endpoints.get(endpoint).cloned().unwrap_or_else(|| endpoint.to_string());
        let mut url = format!("{}/{}", base, path.trim_start_matches('/'));
        if !params.is_empty() {
            let query: Vec<String> = params
                .iter()
                .map(|(k, v)| format!("{}={}", k, simple_encode(v)))
                .collect();
            url.push('?');
            url.push_str(&query.join("&"));
        }
        url
    }
}

fn simple_encode(s: &str) -> String {
    let mut encoded = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

/// Manages multiple music sources and coordinates search/playback operations
pub struct SourceManager {
    sources: RwLock<HashMap<String, JsonSource>>,
    http: crate::core::http::HttpClient,
}

impl SourceManager {
    pub fn new(http: crate::core::http::HttpClient) -> Self {
        Self {
            sources: RwLock::new(HashMap::new()),
            http,
        }
    }

    pub async fn register_json_source(
        &self,
        name: &str,
        api_base: &str,
        endpoints: HashMap<String, String>,
    ) -> Result<SourceInfo> {
        let source = JsonSource::new(name, api_base, endpoints);
        let info = source.info.clone();
        self.sources.write().await.insert(info.id.clone(), source);
        Ok(info)
    }

    pub async fn list_sources(&self) -> Vec<SourceInfo> {
        self.sources.read().await.values().map(|s| s.info.clone()).collect()
    }

    pub async fn search(&self, keyword: &str, page: u32, source_id: &str) -> Result<SearchResult> {
        let sources_guard = self.sources.read().await;
        let source = sources_guard
            .get(source_id)
            .ok_or_else(|| crate::core::error::AppError::SourceError(format!("Source not found: {}", source_id)))?
            .clone();
        drop(sources_guard);

        let url = source.build_url("search", &[("keyword", keyword.to_string()), ("page", page.to_string())]);
        let body = self.http.get(&url, None).await?;
        let result: SearchResult = serde_json::from_str(&body).map_err(|e| {
            crate::core::error::AppError::InvalidFormat(format!("Failed to parse search results: {}", e))
        })?;
        Ok(result)
    }

    pub async fn get_music_url(&self, song_id: &str, quality: &Quality, source_id: &str) -> Result<String> {
        let sources_guard = self.sources.read().await;
        let source = sources_guard
            .get(source_id)
            .ok_or_else(|| crate::core::error::AppError::SourceError(format!("Source not found: {}", source_id)))?
            .clone();
        drop(sources_guard);

        let url = source.build_url(
            "music_url",
            &[("song_id", song_id.to_string()), ("quality", quality.to_string())],
        );
        let body = self.http.get(&url, None).await?;
        let result: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
            crate::core::error::AppError::InvalidFormat(format!("Failed to parse music URL: {}", e))
        })?;
        let music_url = result
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::core::error::AppError::InvalidFormat("Missing 'url' field in response".to_string()))?
            .to_string();
        Ok(music_url)
    }

    pub async fn get_lyric(&self, song_id: &str, source_id: &str) -> Result<Lyric> {
        let sources_guard = self.sources.read().await;
        let source = sources_guard
            .get(source_id)
            .ok_or_else(|| crate::core::error::AppError::SourceError(format!("Source not found: {}", source_id)))?
            .clone();
        drop(sources_guard);

        let url = source.build_url("lyric", &[("song_id", song_id.to_string())]);
        let body = self.http.get(&url, None).await?;
        let lyric: Lyric = serde_json::from_str(&body).map_err(|e| {
            crate::core::error::AppError::InvalidFormat(format!("Failed to parse lyric: {}", e))
        })?;
        Ok(lyric)
    }

    pub async fn search_all(&self, keyword: &str, page: u32, timeout_ms: u64) -> Vec<(String, SearchResult)> {
        let ids = {
            let guard = self.sources.read().await;
            guard.keys().cloned().collect::<Vec<String>>()
        };

        let futures: Vec<_> = ids
            .iter()
            .map(|id| {
                let id_clone = id.clone();
                let kw = keyword.to_string();
                let source_mgr = self;
                async move {
                    match source_mgr.search(&kw, page, &id_clone).await {
                        Ok(result) => Some((id_clone, result)),
                        Err(e) => {
                            eprintln!("Source {} search failed: {}", id_clone, e);
                            None
                        }
                    }
                }
            })
            .collect();

        match tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), async {
            futures_crate::future::join_all(futures).await.into_iter().filter_map(|x| x).collect()
        })
        .await
        {
            Ok(results) => results,
            Err(_) => {
                eprintln!("Search all timed out after {}ms", timeout_ms);
                Vec::new()
            }
        }
    }
}
