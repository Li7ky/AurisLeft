use tauri::State;
use std::sync::atomic::{AtomicU8, Ordering};

use crate::AppState;
use crate::core::error::Result;
use crate::models::SourceInfo;
use std::io::Read;

// 0 = idle, 1 = loading, 2 = loaded
static SOURCE_LOAD_STATE: AtomicU8 = AtomicU8::new(0);

#[tauri::command]
pub async fn register_source(
    state: State<'_, AppState>,
    source_type: String,
    name: String,
    content: String,
) -> Result<SourceInfo> {
    match source_type.as_str() {
        "json" => {
            let config: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
                crate::core::error::AppError::InvalidFormat(format!("Invalid JSON config: {}", e))
            })?;

            let api_base = config
                .get("api_base")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    crate::core::error::AppError::InvalidFormat("Missing 'api_base' in config".into())
                })?
                .to_string();

            let endpoints = config
                .get("endpoints")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            state
                .source_mgr
                .register_json_source(&name, &api_base, endpoints)
                .await
        }
        "js" => {
            state.source_mgr.register_js_source(content).await
        }
        _ => Err(crate::core::error::AppError::InvalidFormat(
            "Unknown source type. Use 'json' or 'js'".into(),
        )),
    }
}

#[tauri::command]
pub async fn register_js_source(
    state: State<'_, AppState>,
    code: String,
) -> Result<SourceInfo> {
    state.source_mgr.register_js_source(code).await
}

#[tauri::command]
pub async fn list_sources(state: State<'_, AppState>) -> Result<Vec<SourceInfo>> {
    Ok(state.source_mgr.list_sources().await)
}

#[tauri::command]
pub async fn toggle_source(
    state: State<'_, AppState>,
    source_id: String,
) -> Result<()> {
    state.source_mgr.toggle_source(&source_id).await
}

#[tauri::command]
pub async fn remove_source(
    state: State<'_, AppState>,
    source_id: String,
) -> Result<()> {
    state.source_mgr.remove_source(&source_id).await
}

#[tauri::command]
pub async fn save_sources_config(
    state: State<'_, AppState>,
    content: String,
) -> Result<()> {
    use std::fs;

    // Validate JSON
    let _: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
        crate::core::error::AppError::InvalidFormat(format!("Invalid JSON: {}", e))
    })?;

    let sources_file = state.app_dir.join("sources.json");
    fs::write(&sources_file, &content)?;

    // Reset load state to allow fresh loading
    SOURCE_LOAD_STATE.store(0, Ordering::SeqCst);

    eprintln!("[DEBUG] sources.json saved to {:?}", sources_file);
    Ok(())
}

#[tauri::command]
pub async fn load_sources_from_file(state: State<'_, AppState>) -> Result<Vec<SourceInfo>> {
    use std::fs;
    
    let app_dir = &state.app_dir;
    let sources_file = app_dir.join("sources.json");
    
    eprintln!("[DEBUG] load_sources_from_file: {:?}", sources_file);
    
    if !sources_file.exists() {
        eprintln!("[DEBUG] 配置文件不存在，创建默认配置");
        let default_config = serde_json::json!({
            "sources": [
                {
                    "name": "huibq",
                    "url": "https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js",
                    "enabled": true
                }
            ]
        });
        let _ = fs::create_dir_all(app_dir);
        let _ = fs::write(&sources_file, serde_json::to_string_pretty(&default_config).unwrap());
        eprintln!("[DEBUG] 默认配置已写入 {:?}", sources_file);
    }
    
    let mut content = String::new();
    if let Ok(mut file) = fs::File::open(&sources_file) {
        let _ = file.read_to_string(&mut content);
    } else {
        eprintln!("[DEBUG] 打开文件失败");
        return Ok(vec![]);
    }
    
    // 移除 BOM
    if content.starts_with('\u{FEFF}') {
        content = content[3..].to_string();
    }
    
    let config: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[DEBUG] JSON 解析失败：{:?}", e);
            return Ok(vec![]);
        }
    };
    
    let sources_array = match config.get("sources").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => {
            eprintln!("[DEBUG] 没有找到 sources 数组");
            return Ok(vec![]);
        }
    };
    
    eprintln!("[DEBUG] 找到 {} 个音源配置", sources_array.len());
    
    let load_state = SOURCE_LOAD_STATE.load(Ordering::SeqCst);
    if load_state == 1 {
        eprintln!("[DEBUG] 音源正在加载，跳过重复加载");
        return Ok(state.source_mgr.list_sources().await);
    }
    
    // 如果已经加载过，但目前列表中没有音源，则允许重新加载
    let current_sources = state.source_mgr.list_sources().await;
    if load_state == 2 && !current_sources.is_empty() {
        eprintln!("[DEBUG] 音源已加载且不为空，跳过重复加载");
        return Ok(current_sources);
    }

    SOURCE_LOAD_STATE.store(1, Ordering::SeqCst);

    let mut loaded = Vec::new();
    
    for source in sources_array.iter() {
        if let (Some(name), Some(url), Some(enabled)) = (
            source.get("name").and_then(|v| v.as_str()),
            source.get("url").and_then(|v| v.as_str()),
            source.get("enabled").and_then(|v| v.as_bool())
        ) {
            if enabled {
                eprintln!("[DEBUG] 加载 JS 音源：{} from {}", name, url);
                match state.http.get(url, None).await {
                    Ok(code) => {
                        match state.source_mgr.register_js_source(code).await {
                            Ok(info) => loaded.push(info),
                            Err(err) => {
                                eprintln!("[DEBUG] 注册 JS 音源失败 {}: {}", name, err);
                            }
                        }
                    }
                    Err(err) => {
                        eprintln!("[DEBUG] 下载 JS 音源失败 {}: {}", name, err);
                    }
                }
            }
        }
    }

    if loaded.is_empty() {
        // 加载失败时允许后续重试
        SOURCE_LOAD_STATE.store(0, Ordering::SeqCst);
        eprintln!("[DEBUG] 未能成功加载任何有效音源");
    } else {
        SOURCE_LOAD_STATE.store(2, Ordering::SeqCst);
        eprintln!("[DEBUG] 成功加载 {} 个音源", loaded.len());
    }
    
    Ok(loaded)
}
