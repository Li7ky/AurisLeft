use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::core::error::{AppError, Result};
use crate::core::http::HttpClient;
use crate::core::js_runtime::JSScript;
use crate::models::{Lyric, Quality, SearchResult, Song, SourceInfo, SourceType};

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
        let path = self
            .api_endpoints
            .get(endpoint)
            .cloned()
            .unwrap_or_else(|| endpoint.to_string());
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

/// Unified source type supporting both JSON and JS sources
pub enum MusicSource {
    Json(JsonSource),
    Js(Arc<JSScript>),
}

impl MusicSource {
    pub fn info(&self) -> SourceInfo {
        match self {
            MusicSource::Json(src) => src.info.clone(),
            MusicSource::Js(src) => SourceInfo {
                id: src.info.id.clone(),
                name: src.info.name.clone(),
                version: src.info.version.clone(),
                source_type: SourceType::JsModule,
                enabled: true,
                supported_qualities: vec![Quality::K128, Quality::K320, Quality::FLAC],
                fail_count: 0,
            },
        }
    }
}

/// Manages multiple music sources and coordinates search/playback operations
pub struct SourceManager {
    sources: RwLock<HashMap<String, Arc<MusicSource>>>,
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
        self.sources
            .write()
            .await
            .insert(info.id.clone(), Arc::new(MusicSource::Json(source)));
        Ok(info)
    }

    pub async fn register_js_source(&self, code: String) -> Result<SourceInfo> {
        let script = JSScript::load_script(&code, self.http.clone()).await?;
        let info = SourceInfo {
            id: script.info.id.clone(),
            name: script.info.name.clone(),
            version: script.info.version.clone(),
            source_type: SourceType::JsModule,
            enabled: true,
            supported_qualities: vec![Quality::K128, Quality::K320, Quality::FLAC],
            fail_count: 0,
        };
        self.sources
            .write()
            .await
            .insert(info.id.clone(), Arc::new(MusicSource::Js(Arc::new(script))));
        Ok(info)
    }

    pub async fn list_sources(&self) -> Vec<SourceInfo> {
        self.sources
            .read()
            .await
            .values()
            .map(|s| s.info())
            .collect()
    }

    pub async fn remove_source(&self, source_id: &str) -> Result<()> {
        let removed = self.sources.write().await.remove(source_id);
        if removed.is_some() {
            Ok(())
        } else {
            Err(crate::core::error::AppError::SourceError(format!(
                "Source not found: {}",
                source_id
            )))
        }
    }

    pub async fn toggle_source(&self, source_id: &str) -> Result<()> {
        let guard = self.sources.read().await;
        if guard.contains_key(source_id) {
            // For now, just acknowledge the toggle
            Ok(())
        } else {
            Err(crate::core::error::AppError::SourceError(format!(
                "Source not found: {}",
                source_id
            )))
        }
    }

    async fn get_source(&self, source_id: &str) -> Result<Arc<MusicSource>> {
        let guard = self.sources.read().await;
        guard.get(source_id).cloned().ok_or_else(|| {
            crate::core::error::AppError::SourceError(format!("Source not found: {}", source_id))
        })
    }

    pub async fn search(&self, keyword: &str, page: u32, source_id: &str) -> Result<SearchResult> {
        let source = self.get_source(source_id).await?;

        match source.as_ref() {
            MusicSource::Json(src) => {
                let url = src.build_url(
                    "search",
                    &[("keyword", keyword.to_string()), ("page", page.to_string())],
                );
                let body = self.http.get(&url, None).await?;
                let result: SearchResult = serde_json::from_str(&body).map_err(|e| {
                    crate::core::error::AppError::InvalidFormat(format!(
                        "Failed to parse search results: {}",
                        e
                    ))
                })?;
                Ok(result)
            }
            MusicSource::Js(_script) => {
                Self::builtin_search(&self.http, keyword, page, source_id).await
            }
        }
    }

    pub async fn get_music_url(
        &self,
        song_id: &str,
        quality: &Quality,
        source_id: &str,
    ) -> Result<String> {
        let source = self.get_source(source_id).await?;

        match source.as_ref() {
            MusicSource::Json(src) => {
                let url = src.build_url(
                    "music_url",
                    &[
                        ("song_id", song_id.to_string()),
                        ("quality", quality.to_string()),
                    ],
                );
                let body = self.http.get(&url, None).await?;
                let result: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
                    crate::core::error::AppError::InvalidFormat(format!(
                        "Failed to parse music URL: {}",
                        e
                    ))
                })?;
                let music_url = result
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::core::error::AppError::InvalidFormat(
                            "Missing 'url' field in response".to_string(),
                        )
                    })?
                    .to_string();
                Ok(music_url)
            }
            MusicSource::Js(script) => {
                let (platform, real_id) = Self::parse_platform_song_id(song_id, script);
                script
                    .get_music_url(&platform, &real_id, quality, self.http.clone())
                    .await
            }
        }
    }

    pub async fn get_lyric(&self, song_id: &str, source_id: &str) -> Result<Lyric> {
        let source = self.get_source(source_id).await?;

        match source.as_ref() {
            MusicSource::Json(src) => {
                let url = src.build_url("lyric", &[("song_id", song_id.to_string())]);
                let body = self.http.get(&url, None).await?;
                let lyric: Lyric = serde_json::from_str(&body).map_err(|e| {
                    crate::core::error::AppError::InvalidFormat(format!(
                        "Failed to parse lyric: {}",
                        e
                    ))
                })?;
                Ok(lyric)
            }
            MusicSource::Js(script) => {
                let (platform, real_id) = Self::parse_platform_song_id(song_id, script);
                script
                    .get_lyric(&platform, &real_id, self.http.clone())
                    .await
            }
        }
    }

    /// Parse song_id in "platform:real_id" format, fallback to first source key
    fn parse_platform_song_id(song_id: &str, script: &JSScript) -> (String, String) {
        if let Some(idx) = song_id.find(':') {
            (song_id[..idx].to_string(), song_id[idx + 1..].to_string())
        } else {
            let key = script
                .info
                .sources_info
                .keys()
                .next()
                .cloned()
                .unwrap_or_default();
            (key, song_id.to_string())
        }
    }

    /// Built-in search using NetEase Cloud Music API
    async fn builtin_search(
        http: &HttpClient,
        keyword: &str,
        page: u32,
        source_id: &str,
    ) -> Result<SearchResult> {
        let offset = ((page.max(1) - 1) * 30).to_string();
        let form = [
            ("s", keyword),
            ("type", "1"),
            ("offset", &offset),
            ("limit", "30"),
        ];
        let body = http
            .post_form("https://music.163.com/api/search/get", &form)
            .await?;

        let resp: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
            AppError::InvalidFormat(format!("Failed to parse NetEase response: {}", e))
        })?;

        let songs_arr = resp.pointer("/result/songs").and_then(|v| v.as_array());

        let total = resp
            .pointer("/result/songCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        let songs: Vec<Song> = match songs_arr {
            Some(arr) => arr
                .iter()
                .filter_map(|s| {
                    let id = s.get("id")?.as_u64()?.to_string();
                    let name = s.get("name")?.as_str()?.to_string();
                    let artists: Vec<String> = s
                        .get("artists")
                        .and_then(|a| a.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|a| {
                                    a.get("name")
                                        .and_then(|n| n.as_str())
                                        .map(|s| s.to_string())
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    let album = s
                        .pointer("/album/name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let cover = s
                        .pointer("/album/picUrl")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let duration = s.get("duration").and_then(|v| v.as_u64()).unwrap_or(0) / 1000;

                    Some(Song {
                        id: format!("wy:{}", id),
                        name,
                        artist: artists.join(" / "),
                        album,
                        duration: duration as u32,
                        cover_url: cover,
                        source: source_id.to_string(),
                        song_id: format!("wy:{}", id),
                        qualities: vec![Quality::K128, Quality::K320, Quality::FLAC],
                    })
                })
                .collect(),
            None => vec![],
        };

        eprintln!(
            "[DEBUG] NetEase search '{}': found {} songs",
            keyword,
            songs.len()
        );
        Ok(SearchResult {
            total,
            songs,
            page,
            per_page: 30,
        })
    }

    pub async fn search_all(
        &self,
        keyword: &str,
        page: u32,
        timeout_ms: u64,
    ) -> Vec<(String, SearchResult)> {
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

        match tokio::time::timeout(
            std::time::Duration::from_millis(timeout_ms),
            futures_crate::future::join_all(futures),
        )
        .await
        {
            Ok(results) => results.into_iter().filter_map(|x| x).collect(),
            Err(_) => {
                eprintln!("Search all timed out after {}ms", timeout_ms);
                Vec::new()
            }
        }
    }
}
