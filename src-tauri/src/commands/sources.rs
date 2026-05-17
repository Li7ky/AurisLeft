use std::sync::atomic::{AtomicU8, Ordering};
use tauri::State;

use crate::core::error::{AppError, Result};
use crate::models::SourceInfo;
use crate::AppState;
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
                    crate::core::error::AppError::InvalidFormat(
                        "Missing 'api_base' in config".into(),
                    )
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
        "js" => state.source_mgr.register_js_source(content).await,
        _ => Err(crate::core::error::AppError::InvalidFormat(
            "Unknown source type. Use 'json' or 'js'".into(),
        )),
    }
}

#[tauri::command]
pub async fn register_js_source(state: State<'_, AppState>, code: String) -> Result<SourceInfo> {
    state.source_mgr.register_js_source(code).await
}

#[tauri::command]
pub async fn list_sources(state: State<'_, AppState>) -> Result<Vec<SourceInfo>> {
    Ok(state.source_mgr.list_sources().await)
}

#[tauri::command]
pub async fn toggle_source(state: State<'_, AppState>, source_id: String) -> Result<()> {
    state.source_mgr.toggle_source(&source_id).await
}

#[tauri::command]
pub async fn remove_source(state: State<'_, AppState>, source_id: String) -> Result<()> {
    state.source_mgr.remove_source(&source_id).await
}

#[tauri::command]
pub async fn save_sources_config(state: State<'_, AppState>, content: String) -> Result<()> {
    use std::fs;

    // Validate JSON
    let _: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| crate::core::error::AppError::InvalidFormat(format!("Invalid JSON: {}", e)))?;

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
        let _ = fs::write(
            &sources_file,
            serde_json::to_string_pretty(&default_config).unwrap(),
        );
        eprintln!("[DEBUG] 默认配置已写入 {:?}", sources_file);
    }

    let mut content = String::new();
    let mut file = fs::File::open(&sources_file).map_err(|e| {
        AppError::IoError(format!(
            "无法打开音源配置文件 {}: {}",
            sources_file.display(),
            e
        ))
    })?;
    file.read_to_string(&mut content).map_err(|e| {
        AppError::IoError(format!(
            "无法读取音源配置文件 {}: {}",
            sources_file.display(),
            e
        ))
    })?;

    // 移除 BOM
    if content.starts_with('\u{FEFF}') {
        content = content[3..].to_string();
    }

    let config: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
        eprintln!("[DEBUG] JSON 解析失败：{:?}", e);
        AppError::InvalidFormat(format!(
            "音源配置文件 JSON 格式错误 {}: {}",
            sources_file.display(),
            e
        ))
    })?;

    let sources_array = config
        .get("sources")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            eprintln!("[DEBUG] 没有找到 sources 数组");
            AppError::InvalidFormat(format!(
                "音源配置文件 {} 缺少 sources 数组",
                sources_file.display()
            ))
        })?;

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
    let mut load_errors = Vec::new();
    let mut enabled_count = 0;

    for (index, source) in sources_array.iter().enumerate() {
        let Some(name) = source.get("name").and_then(|v| v.as_str()) else {
            load_errors.push(format!("第 {} 个音源缺少 name 字段", index + 1));
            continue;
        };
        let Some(url) = source.get("url").and_then(|v| v.as_str()) else {
            load_errors.push(format!("音源 {} 缺少 url 字段", name));
            continue;
        };
        let enabled = source
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        if !enabled {
            continue;
        }

        enabled_count += 1;
        eprintln!("[DEBUG] 加载 JS 音源：{} from {}", name, url);
        match state.http.get(url, None).await {
            Ok(code) => match state.source_mgr.register_js_source(code).await {
                Ok(info) => loaded.push(info),
                Err(err) => {
                    let msg = format!("注册 JS 音源 {} 失败: {}", name, err);
                    eprintln!("[DEBUG] {}", msg);
                    load_errors.push(msg);
                }
            },
            Err(err) => {
                let msg = format!(
                    "下载 JS 音源 {} 失败，请检查网络或音源地址 {}: {}",
                    name, url, err
                );
                eprintln!("[DEBUG] {}", msg);
                load_errors.push(msg);
            }
        }
    }

    if loaded.is_empty() {
        // 加载失败时允许后续重试
        SOURCE_LOAD_STATE.store(0, Ordering::SeqCst);
        let detail = if enabled_count == 0 {
            "没有启用的音源，请在 sources.json 中启用至少一个音源".to_string()
        } else if load_errors.is_empty() {
            "未能成功加载任何有效音源".to_string()
        } else {
            load_errors.join("; ")
        };
        eprintln!("[DEBUG] {}", detail);
        return Err(AppError::SourceError(detail));
    }

    SOURCE_LOAD_STATE.store(2, Ordering::SeqCst);
    eprintln!("[DEBUG] 成功加载 {} 个音源", loaded.len());

    Ok(loaded)
}
