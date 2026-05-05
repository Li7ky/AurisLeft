use std::collections::HashMap;
use std::sync::Arc;

use aes::cipher::BlockEncryptMut;
use aes::Aes128;
use base64::{engine::general_purpose::STANDARD, Engine};
use cbc::cipher::KeyIvInit;
use md5::Md5;
use rquickjs::{
    prelude::{Func, Rest}, CatchResultExt, Ctx, Exception, Function, Object, Result as JsResult,
    Value,
};
use rsa::pkcs8::DecodePublicKey;
use rsa::rand_core::OsRng;
use rsa::RsaPublicKey;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use serde_json::json;

use crate::core::error::Result as AppResult;
use crate::core::http::HttpClient;
use crate::core::lyric::LyricParser;
use crate::models::{Lyric, Quality, SearchResult, Song};

const EVENT_NAMES_REQUEST: &str = "request";
const EVENT_NAMES_INITED: &str = "inited";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsSourceConfig {
    pub name: String,
}

struct JSContext {
    sources_info: HashMap<String, JsSourceConfig>,
}

impl JSContext {
    fn new() -> Self {
        Self {
            sources_info: HashMap::new(),
        }
    }
}

#[derive(Clone)]
pub struct JSScriptInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub sources_info: HashMap<String, JsSourceConfig>,
}

pub struct JSScript {
    pub raw_code: String,
    pub info: JSScriptInfo,
}

fn pkcs7_pad(data: Vec<u8>, block_size: usize) -> Vec<u8> {
    let pad_len = block_size - (data.len() % block_size);
    let mut padded = data;
    padded.extend(std::iter::repeat(pad_len as u8).take(pad_len));
    padded
}

impl JSScript {
    fn parse_script_header(code: &str) -> (String, String) {
        let mut name = "Unknown".to_string();
        let mut version = "0".to_string();
        for line in code.lines().take(20) {
            let trimmed = line.trim().trim_start_matches('*').trim();
            if let Some(n) = trimmed.strip_prefix("@name ") {
                name = n.trim().to_string();
            }
            if let Some(v) = trimmed.strip_prefix("@version ") {
                version = v.trim().to_string();
            }
            if trimmed.ends_with("*/") {
                break;
            }
        }
        (name, version)
    }

    pub async fn load_script(code: &str, http: HttpClient) -> AppResult<Self> {
        let code = code.to_string();
        let result = tokio::task::spawn_blocking(move || {
            Self::do_load_script(&code, http)
        })
        .await
        .map_err(|e| {
            crate::core::error::AppError::SourceError(format!("Failed to load script: {}", e))
        })??;

        Ok(result)
    }

    fn do_load_script(code: &str, http: HttpClient) -> AppResult<Self> {
        let rt = rquickjs::Runtime::new().map_err(|e| {
            crate::core::error::AppError::SourceError(format!("Failed to create JS runtime: {}", e))
        })?;
        rt.set_memory_limit(1024 * 1024 * 200);

        let inner = Arc::new(std::sync::RwLock::new(JSContext::new()));

        let eval_result = {
            let ctx = rquickjs::Context::full(&rt).map_err(|e| {
                crate::core::error::AppError::SourceError(format!("Failed to create JS context: {}", e))
            })?;

            let res = ctx.with(|js_ctx| {
                let globals = js_ctx.globals();
                
                // Polyfill for console
                let console = Object::new(js_ctx.clone()).unwrap();
                let log_fn = Func::from(|args: Rest<Value<'_>>| {
                    let parts: Vec<String> = args.0.iter().map(|v| format!("{:?}", v)).collect();
                    eprintln!("[JS console] {}", parts.join(" "));
                    Ok::<_, rquickjs::Error>(())
                });
                console.set("log", log_fn).unwrap();
                let warn_fn = Func::from(|args: Rest<Value<'_>>| {
                    let parts: Vec<String> = args.0.iter().map(|v| format!("{:?}", v)).collect();
                    eprintln!("[JS warn] {}", parts.join(" "));
                    Ok::<_, rquickjs::Error>(())
                });
                console.set("warn", warn_fn).unwrap();
                let error_fn = Func::from(|args: Rest<Value<'_>>| {
                    let parts: Vec<String> = args.0.iter().map(|v| format!("{:?}", v)).collect();
                    eprintln!("[JS error] {}", parts.join(" "));
                    Ok::<_, rquickjs::Error>(())
                });
                console.set("error", error_fn).unwrap();
                let info_fn = Func::from(|_args: Rest<Value<'_>>| {
                    Ok::<_, rquickjs::Error>(())
                });
                console.set("info", info_fn).unwrap();
                console.set("debug", Func::from(|_args: Rest<Value<'_>>| Ok::<_, rquickjs::Error>(()))).unwrap();
                globals.set("console", console).unwrap();

                // Polyfill for process
                let process = Object::new(js_ctx.clone()).unwrap();
                let versions = Object::new(js_ctx.clone()).unwrap();
                versions.set("node", "18.0.0").unwrap();
                process.set("versions", versions).unwrap();
                process.set("version", "v18.0.0").unwrap();
                globals.set("process", process).unwrap();

                // Polyfill for global/globalThis alias
                let _ = globals.set("global", globals.clone());
                let _ = globals.set("globalThis", globals.clone());
                let _ = globals.set("window", globals.clone());

                let (script_name, script_version) = Self::parse_script_header(code);
                let lx = Self::build_lx_global(&js_ctx, &http, &script_name, &script_version, Some(inner.clone())).catch(&js_ctx).map_err(|e| {
                    crate::core::error::AppError::SourceError(format!("Failed to build lx global: {}", e))
                })?;
                
                // Set lx to all possible global objects
                globals.set("lx", lx.clone()).unwrap();
                
                js_ctx.eval::<(), _>(code).catch(&js_ctx).map_err(|e| {
                    crate::core::error::AppError::SourceError(format!("JS script execution error: {}", e))
                })?;
                
                Ok::<_, crate::core::error::AppError>(())
            });

            // Drain microtask queue so Promise callbacks (including send('inited', ...)) execute
            while let Ok(true) = rt.execute_pending_job() {}

            drop(ctx);
            res
        };

        rt.run_gc();
        eval_result?;

        let inner_read = inner.read().unwrap();
        let sources_info = inner_read.sources_info.clone();
        drop(inner_read);

        let (parsed_name, parsed_version) = Self::parse_script_header(code);
        let script_id = uuid::Uuid::new_v4().to_string();

        Ok(Self {
            raw_code: code.to_string(),
            info: JSScriptInfo {
                id: script_id,
                name: parsed_name,
                version: parsed_version,
                sources_info,
            },
        })
    }

    pub async fn search(
        &self,
        source: &str,
        keyword: &str,
        page: u32,
        http: HttpClient,
    ) -> AppResult<SearchResult> {
        let raw = self.raw_code.clone();
        let source = source.to_string();
        let keyword = keyword.to_string();
        let tokio_http = http.clone();

        let result = tokio::task::spawn_blocking(move || {
            Self::execute_js_action(
                &raw,
                &source,
                "search",
                json!({
                    "key": keyword,
                    "page": page,
                    "limit": 20,
                }),
                tokio_http,
            )
        })
        .await
        .map_err(|e| {
            crate::core::error::AppError::SourceError(format!("JS action execution error: {}", e))
        })??;

        let songs = Self::parse_search_result(&result)?;
        let total = songs.len() as u32;

        Ok(SearchResult {
            songs,
            total,
            page,
            per_page: 20,
        })
    }

    pub async fn get_music_url(
        &self,
        source: &str,
        song_id: &str,
        quality: &Quality,
        http: HttpClient,
    ) -> AppResult<String> {
        let raw = self.raw_code.clone();
        let source = source.to_string();
        let song_id = song_id.to_string();
        let quality = quality.to_string();
        let tokio_http = http.clone();

        let result = tokio::task::spawn_blocking(move || {
            Self::execute_js_action(
                &raw,
                &source,
                "musicUrl",
                json!({
                    "id": song_id,
                    "quality": quality,
                }),
                tokio_http,
            )
        })
        .await
        .map_err(|e| {
            crate::core::error::AppError::SourceError(format!("JS action execution error: {}", e))
        })??;

        let url = result
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| {
                crate::core::error::AppError::SourceError(format!(
                    "Failed to extract music URL from response: {}",
                    result
                ))
            })?;

        Ok(url)
    }

    pub async fn get_lyric(
        &self,
        source: &str,
        song_id: &str,
        http: HttpClient,
    ) -> AppResult<Lyric> {
        let raw = self.raw_code.clone();
        let source = source.to_string();
        let song_id = song_id.to_string();
        let tokio_http = http.clone();

        let result = tokio::task::spawn_blocking(move || {
            Self::execute_js_action(
                &raw,
                &source,
                "lyric",
                json!({
                    "id": song_id,
                }),
                tokio_http,
            )
        })
        .await
        .map_err(|e| {
            crate::core::error::AppError::SourceError(format!("JS action execution error: {}", e))
        })??;

        let lrc_content = result
            .get("lyric")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_default();

        LyricParser::parse_lrc(&lrc_content)
    }

    fn execute_js_action(
        code: &str,
        source: &str,
        action: &str,
        info: serde_json::Value,
        http: HttpClient,
    ) -> AppResult<serde_json::Value> {
        let rt = rquickjs::Runtime::new().map_err(|e| {
            crate::core::error::AppError::SourceError(format!("Failed to create JS runtime: {}", e))
        })?;
        rt.set_memory_limit(1024 * 1024 * 200);

        let captured_result: Arc<std::sync::Mutex<Option<serde_json::Value>>> =
            Arc::new(std::sync::Mutex::new(None));
        let captured_error: Arc<std::sync::Mutex<Option<String>>> =
            Arc::new(std::sync::Mutex::new(None));

        let eval_result = {
            let ctx = rquickjs::Context::full(&rt).map_err(|e| {
                crate::core::error::AppError::SourceError(format!("Failed to create JS context: {}", e))
            })?;

            let source = source.to_string();
            let action = action.to_string();
            let info_str = serde_json::to_string(&info)
                .map_err(|e| crate::core::error::AppError::InvalidFormat(e.to_string()))?;

            let result = captured_result.clone();
            let err_sink = captured_error.clone();

            let res = ctx.with(|js_ctx| {
                let globals = js_ctx.globals();

                // Polyfill for console
                let console = Object::new(js_ctx.clone()).unwrap();
                let log_fn = Func::from(|args: Rest<Value<'_>>| {
                    let parts: Vec<String> = args.0.iter().map(|v| format!("{:?}", v)).collect();
                    eprintln!("[JS console] {}", parts.join(" "));
                    Ok::<_, rquickjs::Error>(())
                });
                console.set("log", log_fn).unwrap();
                let warn_fn = Func::from(|args: Rest<Value<'_>>| {
                    let parts: Vec<String> = args.0.iter().map(|v| format!("{:?}", v)).collect();
                    eprintln!("[JS warn] {}", parts.join(" "));
                    Ok::<_, rquickjs::Error>(())
                });
                console.set("warn", warn_fn).unwrap();
                let error_fn = Func::from(|args: Rest<Value<'_>>| {
                    let parts: Vec<String> = args.0.iter().map(|v| format!("{:?}", v)).collect();
                    eprintln!("[JS error] {}", parts.join(" "));
                    Ok::<_, rquickjs::Error>(())
                });
                console.set("error", error_fn).unwrap();
                let info_fn = Func::from(|_args: Rest<Value<'_>>| {
                    Ok::<_, rquickjs::Error>(())
                });
                console.set("info", info_fn).unwrap();
                console.set("debug", Func::from(|_args: Rest<Value<'_>>| Ok::<_, rquickjs::Error>(()))).unwrap();
                globals.set("console", console).unwrap();

                // Polyfill for process
                let process = Object::new(js_ctx.clone()).unwrap();
                let versions = Object::new(js_ctx.clone()).unwrap();
                versions.set("node", "18.0.0").unwrap();
                process.set("versions", versions).unwrap();
                process.set("version", "v18.0.0").unwrap();
                globals.set("process", process).unwrap();

                // Polyfill for global/globalThis alias
                let _ = globals.set("global", globals.clone());
                let _ = globals.set("globalThis", globals.clone());
                let _ = globals.set("window", globals.clone());

                // Build lx global with request function
                let (script_name, script_version) = Self::parse_script_header(code);
                let lx = Self::build_lx_global_with_capture(
                    &js_ctx,
                    &http,
                    &result,
                    &err_sink,
                    &script_name,
                    &script_version,
                )
                .catch(&js_ctx)
                .map_err(|e| {
                    crate::core::error::AppError::SourceError(format!("Failed to build lx global: {}", e))
                })?;
                
                // Set lx to all possible global objects
                globals.set("lx", lx.clone()).unwrap();

                // Run the script
                js_ctx.eval::<(), _>(code).catch(&js_ctx).map_err(|e| {
                    crate::core::error::AppError::SourceError(format!("JS script execution error: {}", e))
                })?;

                Ok::<_, crate::core::error::AppError>(())
            });

            // Drain microtask queue so on('request', handler) registration executes
            while let Ok(true) = rt.execute_pending_job() {}

            // Now trigger the handler in a second ctx.with call
            let res2 = ctx.with(|js_ctx| {
                let globals = js_ctx.globals();
                let payload = json!({
                    "source": source,
                    "action": action,
                    "info": serde_json::from_str::<serde_json::Value>(&info_str).unwrap(),
                });
                let payload_str = serde_json::to_string(&payload).unwrap();
                let p = js_ctx.json_parse(payload_str.as_bytes()).catch(&js_ctx).map_err(|e| {
                    crate::core::error::AppError::SourceError(format!("Failed to parse payload: {}", e))
                })?;

                globals.set("__lx_action_payload", p).catch(&js_ctx).map_err(|e| {
                    crate::core::error::AppError::SourceError(format!("Failed to set action payload: {}", e))
                })?;

                // Trigger the handler with (query, callback) pattern used by LX Music sources
                let trigger_code = r#"(function() {
                    try {
                        var handler = globalThis._lx_handler;
                        if (typeof handler === 'function') {
                            handler.call(lx, __lx_action_payload, function(err, result) {
                                if (err) {
                                    lx._capture_error(err.message || err.toString());
                                } else {
                                    lx._capture_result(result);
                                }
                            });
                        } else {
                            lx._capture_error("not a function");
                        }
                    } catch (e) {
                        lx._capture_error(e.message || e.toString());
                    }
                })()"#;

                let _: () = js_ctx.eval(trigger_code).catch(&js_ctx).map_err(|e| {
                    crate::core::error::AppError::SourceError(format!("Failed to trigger action: {}", e))
                })?;

                Ok::<_, crate::core::error::AppError>(())
            });

            // Drain microtask queue for handler's async operations (HTTP requests, Promise callbacks)
            while let Ok(true) = rt.execute_pending_job() {}

            drop(ctx);
            res?;
            res2
        };

        rt.run_gc();
        eval_result?;

        // Check if error was captured
        if let Some(err) = captured_error.lock().unwrap().take() {
            return Err(crate::core::error::AppError::SourceError(format!(
                "JS action error: {}",
                err
            )));
        }

        let result = {
            let guard = captured_result.lock().unwrap();
            guard.clone()
        };

        result.ok_or_else(|| {
            crate::core::error::AppError::SourceError(format!(
                "JS action '{}' did not return a result",
                action
            ))
        })
    }

    fn build_lx_global<'js>(
        ctx: &Ctx<'js>,
        http: &HttpClient,
        script_name: &str,
        script_version: &str,
        inner: Option<Arc<std::sync::RwLock<JSContext>>>,
    ) -> JsResult<Object<'js>> {
        let lx = Object::new(ctx.clone())?;

        let event_names = Object::new(ctx.clone())?;
        event_names.set("request", EVENT_NAMES_REQUEST)?;
        event_names.set("inited", EVENT_NAMES_INITED)?;
        lx.set("EVENT_NAMES", event_names)?;
        lx.set("version", "1.2.0")?;

        // Set env and currentScriptInfo for LX Music source compatibility
        lx.set("env", "desktop")?;
        let script_info = Object::new(ctx.clone())?;
        script_info.set("name", script_name)?;
        script_info.set("version", script_version)?;
        lx.set("currentScriptInfo", script_info)?;

        let utils = Self::build_utils(ctx)?;
        lx.set("utils", utils)?;

        let on_fn = Func::from(move |_event_name: String, _handler: Function<'js>| {
            Ok::<_, rquickjs::Error>(())
        });
        lx.set("on", on_fn)?;

        if let Some(inner_ref) = inner {
            let send_fn = Func::from(move |event_name: String, data: Value<'js>| {
                if event_name == EVENT_NAMES_INITED {
                    Self::handle_inited(&data, &inner_ref);
                }
                Ok::<_, rquickjs::Error>(())
            });
            lx.set("send", send_fn)?;
        } else {
            let send_fn = Func::from(move |_event_name: String, _data: Value<'js>| {
                Ok::<_, rquickjs::Error>(())
            });
            lx.set("send", send_fn)?;
        }

        let request_fn = Self::build_request_fn(ctx, http)?;
        lx.set("request", request_fn)?;

        Ok(lx)
    }

    fn build_lx_global_with_capture<'js>(
        ctx: &Ctx<'js>,
        http: &HttpClient,
        captured_result: &Arc<std::sync::Mutex<Option<serde_json::Value>>>,
        captured_error: &Arc<std::sync::Mutex<Option<String>>>,
        script_name: &str,
        script_version: &str,
    ) -> JsResult<Object<'js>> {
        let lx = Object::new(ctx.clone())?;

        let event_names = Object::new(ctx.clone())?;
        event_names.set("request", EVENT_NAMES_REQUEST)?;
        event_names.set("inited", EVENT_NAMES_INITED)?;
        lx.set("EVENT_NAMES", event_names)?;
        lx.set("version", "1.2.0")?;

        // Set env and currentScriptInfo for LX Music source compatibility
        lx.set("env", "desktop")?;
        let script_info = Object::new(ctx.clone())?;
        script_info.set("name", script_name)?;
        script_info.set("version", script_version)?;
        lx.set("currentScriptInfo", script_info)?;

        let utils = Self::build_utils(ctx)?;
        lx.set("utils", utils)?;

        let result_sink = captured_result.clone();
        let err_sink = captured_error.clone();

        // 核心修复：严禁在闭包中捕获 ctx.clone()，改为通过传入的 js_ctx 获取 globals
        let on_fn = Func::from(move |js_ctx: Ctx<'js>, event_name: String, handler: Function<'js>| {
            if event_name == EVENT_NAMES_REQUEST {
                let globals = js_ctx.globals();
                let _ = globals.set("_lx_handler", handler);
            }
            Ok::<_, rquickjs::Error>(())
        });
        lx.set("on", on_fn)?;

        let send_fn = Func::from(move |event_name: String, _data: Value<'js>| {
            // Handle inited event if needed
            let _ = event_name;
            Ok::<_, rquickjs::Error>(())
        });
        lx.set("send", send_fn)?;

        let result_sink2 = result_sink.clone();
        let err_sink2 = err_sink.clone();
        let request_fn = Self::build_request_fn(ctx, http)?;
        lx.set("request", request_fn)?;

        // Add helper function to capture results
        // 核心修复：通过传入的 Ctx 进行操作，避免捕获外部 ctx 引发 GC 泄漏
        let capture_fn = Func::from(move |js_ctx: Ctx<'js>, result: Value<'js>| {
            if let Ok(Some(s)) = js_ctx.json_stringify(&result) {
                if let Ok(json_str) = s.to_string() {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        let mut guard = result_sink2.lock().unwrap();
                        *guard = Some(v);
                    }
                }
            }
            Ok::<_, rquickjs::Error>(())
        });
        lx.set("_capture_result", capture_fn)?;

        let err_capture = Func::from(move |err: String| {
            let mut guard = err_sink2.lock().unwrap();
            *guard = Some(err);
            Ok::<_, rquickjs::Error>(())
        });
        lx.set("_capture_error", err_capture)?;

        Ok(lx)
    }

    fn build_utils<'js>(ctx: &Ctx<'js>) -> JsResult<Object<'js>> {
        let utils = Object::new(ctx.clone())?;
        let crypto = Self::build_crypto(ctx)?;
        utils.set("crypto", crypto)?;
        let buffer = Self::build_buffer(ctx)?;
        utils.set("buffer", buffer)?;
        Ok(utils)
    }

    fn build_crypto<'js>(ctx: &Ctx<'js>) -> JsResult<Object<'js>> {
        let crypto = Object::new(ctx.clone())?;

        let md5_fn = Func::from(|data: String| -> JsResult<String> {
            let mut hasher = Md5::new();
            hasher.update(data.as_bytes());
            let result = hasher.finalize();
            Ok(format!("{:x}", result))
        });
        crypto.set("md5", md5_fn)?;

        let aes_encrypt_fn = Func::from(
            move |js_ctx: Ctx<'js>, data: String, key: String, iv: String| -> JsResult<String> {
                type Aes128CbcEnc = cbc::Encryptor<Aes128>;
                type Aes192CbcEnc = cbc::Encryptor<aes::Aes192>;
                type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;

                let key_bytes = key.as_bytes();
                let iv_bytes = iv.as_bytes();

                if key_bytes.len() < 16 || iv_bytes.len() < 16 {
                    return Err(Exception::throw_message(&js_ctx, "Invalid key or IV length"));
                }

                let data_len = data.len();
                let data_bytes = pkcs7_pad(data.into_bytes(), 16);

                let encrypted = if key_bytes.len() >= 32 {
                    let cipher = Aes256CbcEnc::new_from_slices(&key_bytes[..32], &iv_bytes[..16])
                        .map_err(|_| Exception::throw_message(&js_ctx, "AES cipher init failed"))?;
                    let mut out = vec![0u8; data_bytes.len()];
                    out.copy_from_slice(&data_bytes);
                    cipher.encrypt_padded_mut::<cbc::cipher::block_padding::Pkcs7>(&mut out, data_len).map_err(|_| Exception::throw_message(&js_ctx, "AES encrypt failed"))?;
                    out
                } else if key_bytes.len() >= 24 {
                    let cipher = Aes192CbcEnc::new_from_slices(&key_bytes[..24], &iv_bytes[..16])
                        .map_err(|_| Exception::throw_message(&js_ctx, "AES cipher init failed"))?;
                    let mut out = vec![0u8; data_bytes.len()];
                    out.copy_from_slice(&data_bytes);
                    cipher.encrypt_padded_mut::<cbc::cipher::block_padding::Pkcs7>(&mut out, data_len).map_err(|_| Exception::throw_message(&js_ctx, "AES encrypt failed"))?;
                    out
                } else {
                    let cipher = Aes128CbcEnc::new_from_slices(&key_bytes[..16], &iv_bytes[..16])
                        .map_err(|_| Exception::throw_message(&js_ctx, "AES cipher init failed"))?;
                    let mut out = vec![0u8; data_bytes.len()];
                    out.copy_from_slice(&data_bytes);
                    cipher.encrypt_padded_mut::<cbc::cipher::block_padding::Pkcs7>(&mut out, data_len).map_err(|_| Exception::throw_message(&js_ctx, "AES encrypt failed"))?;
                    out
                };

                Ok(STANDARD.encode(&encrypted))
            },
        );
        crypto.set("aesEncrypt", aes_encrypt_fn)?;

        let rsa_encrypt_fn = Func::from(
            move |js_ctx: Ctx<'js>, data: String, public_key: String| -> JsResult<String> {
                let pkcs8_pem = if public_key.starts_with("-----BEGIN PUBLIC KEY-----") {
                    public_key
                } else {
                    format!("-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----", public_key)
                };

                let rsa_key =
                    RsaPublicKey::from_public_key_pem(&pkcs8_pem)
                        .map_err(|_| Exception::throw_message(&js_ctx, "Invalid RSA key"))?;

                let mut rng = OsRng;
                let encrypted = rsa_key
                    .encrypt(
                        &mut rng,
                        rsa::Oaep::new::<sha2::Sha256>(),
                        data.as_bytes(),
                    )
                    .map_err(|_| Exception::throw_message(&js_ctx, "RSA encryption failed"))?;

                Ok(STANDARD.encode(&encrypted))
            },
        );
        crypto.set("rsaEncrypt", rsa_encrypt_fn)?;

        Ok(crypto)
    }

    fn build_buffer<'js>(ctx: &Ctx<'js>) -> JsResult<Object<'js>> {
        let buffer = Object::new(ctx.clone())?;

        let from_fn = Func::from(
            |ctx: Ctx<'js>, data: String, encoding: String| -> JsResult<Object<'js>> {
                let bytes = match encoding.to_lowercase().as_str() {
                    "base64" => STANDARD
                        .decode(&data)
                        .map_err(|_| Exception::throw_message(&ctx, "Invalid base64"))?,
                    "hex" => {
                        let hex_data = data.replace(' ', "").replace(':', "");
                        if hex_data.len() % 2 != 0 {
                            return Err(Exception::throw_message(&ctx, "Invalid hex string"));
                        }
                        (0..hex_data.len())
                            .step_by(2)
                            .map(|i| u8::from_str_radix(&hex_data[i..i + 2], 16))
                            .collect::<std::result::Result<Vec<_>, _>>()
                            .map_err(|_| Exception::throw_message(&ctx, "Invalid hex string"))?
                    }
                    _ => data.into_bytes(),
                };
                let obj = Object::new(ctx.clone())?;
                obj.set("__is_buffer", true)?;
                obj.set("data", bytes)?;
                Ok(obj)
            },
        );
        buffer.set("from", from_fn)?;

        let buf_to_string_fn =
            Func::from(|val: Value<'js>, encoding: String| -> JsResult<String> {
                if let Some(obj) = val.as_object() {
                    let bytes: Vec<u8> = obj.get("data").unwrap_or_default();
                    match encoding.to_lowercase().as_str() {
                        "base64" => Ok(STANDARD.encode(&bytes)),
                        "hex" => Ok(bytes.iter().map(|b| format!("{:02x}", b)).collect()),
                        _ => Ok(String::from_utf8_lossy(&bytes).to_string()),
                    }
                } else {
                    Ok(String::new())
                }
            });
        buffer.set("bufToString", buf_to_string_fn)?;

        Ok(buffer)
    }

    fn build_request_fn<'js>(
        ctx: &Ctx<'js>,
        http: &HttpClient,
    ) -> JsResult<Function<'js>> {
        let http_clone = http.clone();

        let request_fn = Function::new(
            ctx.clone(),
            move |ctx: Ctx<'js>, url: String, options: Option<Object<'js>>, callback: Function<'js>| {
                let (method, headers, body_str) = Self::parse_request_options(&options);

                let result = Self::execute_http_blocking(
                    &http_clone,
                    &method,
                    &url,
                    &headers,
                    body_str.as_deref(),
                );

                match result {
                    Ok((status, headers_map, resp_body)) => {
                        let headers_obj = Object::new(ctx.clone())?;
                        for (k, v) in headers_map {
                            let _ = headers_obj.set(&k, v);
                        }
                        callback.call::<_, ()>((Value::new_null(ctx.clone()), status, resp_body, headers_obj))?;
                    }
                    Err(e) => {
                        let err_str = rquickjs::String::from_str(ctx.clone(), &e.to_string())?;
                        callback.call::<_, ()>((err_str, 0, String::new(), Object::new(ctx.clone())?))?;
                    }
                }

                Ok::<_, rquickjs::Error>(())
            },
        )?;

        Ok(request_fn)
    }

    fn parse_request_options(
        options: &Option<Object<'_>>,
    ) -> (String, Vec<(String, String)>, Option<String>) {
        let mut method = "GET".to_string();
        let mut headers = Vec::new();
        let mut body_str = None;

        if let Some(opts) = options {
            if let Ok(m) = opts.get::<_, String>("method") {
                method = m.to_uppercase();
            }
            if let Ok(h) = opts.get::<_, Option<Object<'_>>>("headers") {
                if let Some(headers_obj) = h {
                    for pair in headers_obj.props::<String, String>() {
                        if let Ok((k, v)) = pair {
                            headers.push((k, v));
                        }
                    }
                }
            }
            if matches!(method.as_str(), "POST" | "PUT" | "PATCH") {
                if let Ok(b) = opts.get::<_, Option<String>>("body") {
                    body_str = b;
                } else if let Ok(d) = opts.get::<_, Option<String>>("data") {
                    body_str = d;
                }
            }
        }

        (method, headers, body_str)
    }

    fn execute_http_blocking(
        http: &HttpClient,
        method: &str,
        url: &str,
        headers: &[(String, String)],
        body: Option<&str>,
    ) -> AppResult<(u16, Vec<(String, String)>, String)> {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| crate::core::error::AppError::SourceError(format!("Failed to build HTTP runtime: {}", e)))?;

        let url = url.to_string();
        let method_str = method.to_string();
        let headers_vec: Vec<(String, String)> = headers.to_vec();
        let body_opt = body.map(|s| s.to_string());
        let _http_shared = http.clone();

        rt.block_on(async {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
                .redirect(reqwest::redirect::Policy::limited(5))
                .build()
                .map_err(|e| crate::core::error::AppError::SourceError(e.to_string()))?;

            let mut req = match method_str.as_str() {
                "POST" => client.post(&url),
                "PUT" => client.put(&url),
                "DELETE" => client.delete(&url),
                "PATCH" => client.patch(&url),
                _ => client.get(&url),
            };

            for (k, v) in &headers_vec {
                req = req.header(k, v);
            }

            if let Some(b) = body_opt {
                req = req.body(b);
            }

            let resp = req
                .send()
                .await
                .map_err(|e| crate::core::error::AppError::SourceError(e.to_string()))?;
            let status = resp.status().as_u16();
            let headers_out: Vec<(String, String)> = resp
                .headers()
                .iter()
                .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
                .collect();
            let resp_body = resp
                .text()
                .await
                .map_err(|e| crate::core::error::AppError::SourceError(e.to_string()))?;

            Ok((status, headers_out, resp_body))
        })
    }

    #[allow(dead_code)]
    fn handle_inited(data: &Value<'_>, inner: &Arc<std::sync::RwLock<JSContext>>) {
        if let Some(obj) = data.as_object() {
            if let Ok(sources) = obj.get::<_, Option<Object<'_>>>("sources") {
                if let Some(sources_obj) = sources {
                    let mut guard = inner.write().unwrap();
                    for pair in sources_obj.props::<String, Object<'_>>() {
                        if let Ok((source_id, info)) = pair {
                            let name = info.get::<_, String>("name")
                                .unwrap_or_else(|_| source_id.clone());
                            let config = JsSourceConfig { name };
                            guard.sources_info.insert(source_id, config);
                        }
                    }
                    eprintln!("[DEBUG] handle_inited: captured {} sources: {:?}",
                        guard.sources_info.len(),
                        guard.sources_info.keys().collect::<Vec<_>>());
                }
            }
        } else {
            eprintln!("[DEBUG] handle_inited: data is not an object");
        }
    }

    fn parse_search_result(result: &serde_json::Value) -> AppResult<Vec<Song>> {
        let arr = result
            .as_array()
            .ok_or_else(|| {
                crate::core::error::AppError::InvalidFormat(
                    "Search result is not an array".to_string(),
                )
            })?;

        let songs: Vec<Song> = arr
            .iter()
            .filter_map(|v| {
                let obj = v.as_object()?;
                let id = obj
                    .get("id")
                    .or_else(|| obj.get("songmid"))
                    .or_else(|| obj.get("songId"))
                    .or_else(|| obj.get("musicrid"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())?;

                let name = obj
                    .get("name")
                    .or_else(|| obj.get("songName"))
                    .or_else(|| obj.get("title"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string();

                let artist = obj
                    .get("artist")
                    .or_else(|| obj.get("singer"))
                    .map(|v| match v {
                        serde_json::Value::Array(arr) => arr
                            .iter()
                            .filter_map(|a| {
                                a.as_str()
                                    .or_else(|| a.get("name").and_then(|n| n.as_str()))
                            })
                            .collect::<Vec<_>>()
                            .join(", "),
                        _ => v.as_str().unwrap_or("").to_string(),
                    })
                    .unwrap_or_else(|| {
                        obj.get("singername")
                            .or_else(|| obj.get("artistName"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string()
                    });

                let album = obj
                    .get("album")
                    .or_else(|| obj.get("albumName"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string();

                let duration = obj
                    .get("duration")
                    .or_else(|| obj.get("songTimeMinutes"))
                    .or_else(|| obj.get("interval"))
                    .and_then(|v| {
                        if let Some(n) = v.as_f64() {
                            Some(n as u32)
                        } else if let Some(s) = v.as_str() {
                            Self::parse_duration_str(s)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0);

                let cover_url = obj
                    .get("cover")
                    .or_else(|| obj.get("image"))
                    .or_else(|| obj.get("pic"))
                    .or_else(|| obj.get("picUrl"))
                    .or_else(|| obj.get("albumPic"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let qualities = obj
                    .get("qualitys")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|q| q.as_str().map(Self::parse_quality))
                            .collect()
                    })
                    .unwrap_or_else(|| vec![Quality::K128, Quality::K320, Quality::FLAC]);

                Some(Song {
                    id: id.clone(),
                    song_id: id,
                    name,
                    artist,
                    album,
                    duration,
                    cover_url,
                    source: String::new(),
                    qualities,
                })
            })
            .collect();

        Ok(songs)
    }

    fn parse_duration_str(s: &str) -> Option<u32> {
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() == 2 {
            let m: f64 = parts[0].parse().ok()?;
            let s: f64 = parts[1].parse().ok()?;
            Some((m * 60.0 + s) as u32)
        } else if parts.len() == 3 {
            let h: f64 = parts[0].parse().ok()?;
            let m: f64 = parts[1].parse().ok()?;
            let s: f64 = parts[2].parse().ok()?;
            Some((h * 3600.0 + m * 60.0 + s) as u32)
        } else {
            None
        }
    }

    fn parse_quality(q: &str) -> Quality {
        match q {
            "128k" => Quality::K128,
            "320k" => Quality::K320,
            "flac" => Quality::FLAC,
            "hires" | "hi-res" | "flac24bit" => Quality::HiRes,
            _ => Quality::K128,
        }
    }
}
