use std::collections::HashMap;
use std::sync::Arc;

use aes::cipher::BlockEncryptMut;
use aes::Aes128;
use base64::{engine::general_purpose::STANDARD, Engine};
use cbc::cipher::KeyIvInit;
use md5::Md5;
use rquickjs::{
    prelude::Func, CatchResultExt, Ctx, Exception, Function, Object, Result as JsResult,
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

        let ctx = rquickjs::Context::full(&rt).map_err(|e| {
            crate::core::error::AppError::SourceError(format!("Failed to create JS context: {}", e))
        })?;

        let inner = Arc::new(std::sync::RwLock::new(JSContext::new()));

        ctx.with(|js_ctx| {
            let globals = js_ctx.globals();
            let lx = Self::build_lx_global(&js_ctx, &http).catch(&js_ctx).map_err(|e| {
                crate::core::error::AppError::SourceError(format!("Failed to build lx global: {}", e))
            })?;
            globals.set("lx", lx).catch(&js_ctx).map_err(|e| {
                crate::core::error::AppError::SourceError(format!("Failed to set global lx: {}", e))
            })?;
            js_ctx.eval::<(), _>(code).catch(&js_ctx).map_err(|e| {
                crate::core::error::AppError::SourceError(format!("JS script execution error: {}", e))
            })?;
            Ok::<_, crate::core::error::AppError>(())
        })?;

        let inner_read = inner.read().unwrap();
        let name = inner_read
            .sources_info
            .values()
            .next()
            .map(|s| s.name.clone())
            .unwrap_or_else(|| "Unknown JS Source".to_string());
        let sources_info = inner_read.sources_info.clone();
        drop(inner_read);

        let script_id = uuid::Uuid::new_v4().to_string();

        Ok(Self {
            raw_code: code.to_string(),
            info: JSScriptInfo {
                id: script_id,
                name,
                version: "1.0.0".to_string(),
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

        let ctx = rquickjs::Context::full(&rt).map_err(|e| {
            crate::core::error::AppError::SourceError(format!("Failed to create JS context: {}", e))
        })?;

        let captured_result: Arc<std::sync::Mutex<Option<serde_json::Value>>> =
            Arc::new(std::sync::Mutex::new(None));
        let captured_error: Arc<std::sync::Mutex<Option<String>>> =
            Arc::new(std::sync::Mutex::new(None));

        let source = source.to_string();
        let action = action.to_string();
        let info_str = serde_json::to_string(&info)
            .map_err(|e| crate::core::error::AppError::InvalidFormat(e.to_string()))?;

        let result = captured_result.clone();
        let err_sink = captured_error.clone();

        ctx.with(|js_ctx| {
            let globals = js_ctx.globals();

            // Build lx global with request function
            let lx = Self::build_lx_global_with_capture(
                &js_ctx,
                &http,
                &result,
                &err_sink,
            )
            .catch(&js_ctx)
            .map_err(|e| {
                crate::core::error::AppError::SourceError(format!("Failed to build lx global: {}", e))
            })?;
            globals.set("lx", lx).catch(&js_ctx).map_err(|e| {
                crate::core::error::AppError::SourceError(format!("Failed to set global lx: {}", e))
            })?;

            // Run the script
            js_ctx.eval::<(), _>(code).catch(&js_ctx).map_err(|e| {
                crate::core::error::AppError::SourceError(format!("JS script execution error: {}", e))
            })?;

            // Set up action input via globals
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

            // Try to call the handler if it was set via a special function
            // For now, we use a different approach: the script is expected to
            // call a function with the action directly
            // We'll set a global and eval a snippet that calls it

            // Create the request event info
            globals.set("__lx_action_payload", p).catch(&js_ctx).map_err(|e| {
                crate::core::error::AppError::SourceError(format!("Failed to set action payload: {}", e))
            })?;

            // Try to trigger the handler via a global eval
            // This assumes the script has set up a handler via on(EVENT_NAMES.request, ...)
            // Since we can't retain the function reference, we use a different approach:
            // Re-eval code with an appended action trigger
            let trigger_code = format!(
                r#"(function() {{
                    var handler = lx._lx_handler;
                    if (typeof handler === 'function') {{
                        handler.call(lx, __lx_action_payload);
                    }}
                }})()"#
            );

            let _: () = js_ctx.eval(trigger_code.as_str()).catch(&js_ctx).map_err(|e| {
                crate::core::error::AppError::SourceError(format!("Failed to trigger action: {}", e))
            })?;

            Ok::<_, crate::core::error::AppError>(())
        })?;

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
    ) -> JsResult<Object<'js>> {
        let lx = Object::new(ctx.clone())?;

        let event_names = Object::new(ctx.clone())?;
        event_names.set("request", EVENT_NAMES_REQUEST)?;
        event_names.set("inited", EVENT_NAMES_INITED)?;
        lx.set("EVENT_NAMES", event_names)?;
        lx.set("version", "1.0.0")?;

        let utils = Self::build_utils(ctx)?;
        lx.set("utils", utils)?;

        let on_fn = Func::from(move |_event_name: String, _handler: Function<'js>| {
            Ok::<_, rquickjs::Error>(())
        });
        lx.set("on", on_fn)?;

        let send_fn = Func::from(move |_event_name: String, _data: Value<'js>| {
            Ok::<_, rquickjs::Error>(())
        });
        lx.set("send", send_fn)?;

        let request_fn = Self::build_request_fn(ctx, http)?;
        lx.set("request", request_fn)?;

        Ok(lx)
    }

    fn build_lx_global_with_capture<'js>(
        ctx: &Ctx<'js>,
        http: &HttpClient,
        captured_result: &Arc<std::sync::Mutex<Option<serde_json::Value>>>,
        captured_error: &Arc<std::sync::Mutex<Option<String>>>,
    ) -> JsResult<Object<'js>> {
        let lx = Object::new(ctx.clone())?;

        let event_names = Object::new(ctx.clone())?;
        event_names.set("request", EVENT_NAMES_REQUEST)?;
        event_names.set("inited", EVENT_NAMES_INITED)?;
        lx.set("EVENT_NAMES", event_names)?;
        lx.set("version", "1.0.0")?;

        let utils = Self::build_utils(ctx)?;
        lx.set("utils", utils)?;

        let result_sink = captured_result.clone();
        let err_sink = captured_error.clone();

        let lx_for_on = lx.clone();
        let on_fn = Func::from(move |event_name: String, handler: Function<'js>| {
            if event_name == EVENT_NAMES_REQUEST {
                let _ = lx_for_on.set("_lx_handler", handler);
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
        let ctx_for_capture = ctx.clone();
        let capture_fn = Func::from(move |result: Value<'js>| {
            if let Ok(Some(s)) = ctx_for_capture.json_stringify(&result) {
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

        let ctx_aes = ctx.clone();
        let aes_encrypt_fn = Func::from(
            move |data: String, key: String, iv: String| -> JsResult<String> {
                type Aes128CbcEnc = cbc::Encryptor<Aes128>;
                type Aes192CbcEnc = cbc::Encryptor<aes::Aes192>;
                type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;

                let key_bytes = key.as_bytes();
                let iv_bytes = iv.as_bytes();

                if key_bytes.len() < 16 || iv_bytes.len() < 16 {
                    return Err(Exception::throw_message(&ctx_aes, "Invalid key or IV length"));
                }

                let data_len = data.len();
                let data_bytes = pkcs7_pad(data.into_bytes(), 16);

                let encrypted = if key_bytes.len() >= 32 {
                    let cipher = Aes256CbcEnc::new_from_slices(&key_bytes[..32], &iv_bytes[..16])
                        .map_err(|_| Exception::throw_message(&ctx_aes, "AES cipher init failed"))?;
                    let mut out = vec![0u8; data_bytes.len()];
                    out.copy_from_slice(&data_bytes);
                    cipher.encrypt_padded_mut::<cbc::cipher::block_padding::Pkcs7>(&mut out, data_len).map_err(|_| Exception::throw_message(&ctx_aes, "AES encrypt failed"))?;
                    out
                } else if key_bytes.len() >= 24 {
                    let cipher = Aes192CbcEnc::new_from_slices(&key_bytes[..24], &iv_bytes[..16])
                        .map_err(|_| Exception::throw_message(&ctx_aes, "AES cipher init failed"))?;
                    let mut out = vec![0u8; data_bytes.len()];
                    out.copy_from_slice(&data_bytes);
                    cipher.encrypt_padded_mut::<cbc::cipher::block_padding::Pkcs7>(&mut out, data_len).map_err(|_| Exception::throw_message(&ctx_aes, "AES encrypt failed"))?;
                    out
                } else {
                    let cipher = Aes128CbcEnc::new_from_slices(&key_bytes[..16], &iv_bytes[..16])
                        .map_err(|_| Exception::throw_message(&ctx_aes, "AES cipher init failed"))?;
                    let mut out = vec![0u8; data_bytes.len()];
                    out.copy_from_slice(&data_bytes);
                    cipher.encrypt_padded_mut::<cbc::cipher::block_padding::Pkcs7>(&mut out, data_len).map_err(|_| Exception::throw_message(&ctx_aes, "AES encrypt failed"))?;
                    out
                };

                Ok(STANDARD.encode(&encrypted))
            },
        );
        crypto.set("aesEncrypt", aes_encrypt_fn)?;

        let ctx_rsa = ctx.clone();
        let rsa_encrypt_fn = Func::from(
            move |data: String, public_key: String| -> JsResult<String> {
                let pkcs8_pem = if public_key.starts_with("-----BEGIN PUBLIC KEY-----") {
                    public_key
                } else {
                    format!("-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----", public_key)
                };

                let rsa_key =
                    RsaPublicKey::from_public_key_pem(&pkcs8_pem)
                        .map_err(|_| Exception::throw_message(&ctx_rsa, "Invalid RSA key"))?;

                let mut rng = OsRng;
                let encrypted = rsa_key
                    .encrypt(
                        &mut rng,
                        rsa::Oaep::new::<sha2::Sha256>(),
                        data.as_bytes(),
                    )
                    .map_err(|_| Exception::throw_message(&ctx_rsa, "RSA encryption failed"))?;

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
        _http: &HttpClient,
        method: &str,
        url: &str,
        headers: &[(String, String)],
        body: Option<&str>,
    ) -> AppResult<(u16, Vec<(String, String)>, String)> {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| crate::core::error::AppError::SourceError(e.to_string()))?;

        let url = url.to_string();
        let method_str = method.to_string();
        let headers_vec: Vec<(String, String)> = headers.to_vec();
        let body_opt = body.map(|s| s.to_string());

        rt.block_on(async {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(8))
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
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
                            if let Ok(name) = info.get::<_, String>("name") {
                                let config = JsSourceConfig { name };
                                guard.sources_info.insert(source_id, config);
                            }
                        }
                    }
                }
            }
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
