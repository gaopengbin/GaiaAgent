mod mcp;

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{ipc::Channel, Manager, State};

// ── Shared HTTP client ────────────────────────────────────────────────────────

static HTTP: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .expect("failed to build reqwest Client")
});

static HTTP_STREAM: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .build()
        .expect("failed to build streaming reqwest Client")
});

// ── Model settings ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSettings {
    pub provider: String,
    #[serde(default)]
    pub ollama_host: String,
    #[serde(default)]
    pub ollama_model: String,
    #[serde(default)]
    pub openai_base_url: String,
    #[serde(default)]
    pub openai_api_key: String,
    #[serde(default)]
    pub openai_model: String,
    #[serde(default)]
    pub cesium_ion_token: String,
    #[serde(default)]
    pub tianditu_token: String,
    #[serde(default)]
    pub proxy_url: String,
}

impl Default for ModelSettings {
    fn default() -> Self {
        Self {
            provider: "ollama".into(),
            ollama_host: "http://localhost:11434".into(),
            ollama_model: "qwen2.5:7b".into(),
            openai_base_url: "https://api.openai.com/v1".into(),
            openai_api_key: String::new(),
            openai_model: "gpt-4o-mini".into(),
            cesium_ion_token: String::new(),
            tianditu_token: String::new(),
            proxy_url: String::new(),
        }
    }
}

fn settings_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("GaiaAgent").join("model_settings.json")
}

fn load_settings_from_disk() -> ModelSettings {
    let path = settings_path();
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(s) = serde_json::from_str::<ModelSettings>(&data) {
                return s;
            }
        }
    }
    ModelSettings::default()
}

fn save_settings_to_disk(settings: &ModelSettings) -> std::result::Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// ── App state ────────────────────────────────────────────────────────────────

pub struct AppState {
    pub runtime_process: Mutex<Option<Child>>,
    pub runtime_port: u16,
    pub model_settings: Mutex<ModelSettings>,
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSchema {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}

// ── Active streaming requests (for cancellation) ─────────────────────────────

pub struct ActiveRequests(Mutex<HashMap<String, Arc<AtomicBool>>>);

// ── cesium-mcp-runtime management ────────────────────────────────────────────


async fn wait_for_runtime(port: u16) -> Result<()> {
    let url = format!("http://127.0.0.1:{}/api/status", port);
    for _ in 0..30 {
        if let Ok(resp) = HTTP.get(&url).send().await {
            if resp.status().is_success() {
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    anyhow::bail!("cesium-mcp-runtime did not start on port {}", port)
}

#[tauri::command]
async fn start_runtime(state: State<'_, AppState>) -> Result<u16, String> {
    let port = state.runtime_port;

    // Check if already running
    if let Ok(resp) = HTTP
        .get(format!("http://127.0.0.1:{}/api/status", port))
        .timeout(Duration::from_millis(800))
        .send()
        .await
    {
        if resp.status().is_success() {
            return Ok(port);
        }
    }

    #[cfg(target_os = "windows")]
    let (cmd, args) = ("cmd", vec!["/C", "npx", "--yes", "cesium-mcp-runtime@latest"]);
    #[cfg(not(target_os = "windows"))]
    let (cmd, args) = ("npx", vec!["--yes", "cesium-mcp-runtime@latest"]);

    let child = Command::new(cmd)
        .args(&args)
        .env("CESIUM_WS_PORT", port.to_string())
        .env("CESIUM_TOOLSETS", "all")
        .env("CESIUM_LOCALE", "zh-CN")
        .env("DEFAULT_SESSION_ID", "gaiaagent")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn cesium-mcp-runtime: {e}"))?;

    *state.runtime_process.lock().unwrap() = Some(child);

    wait_for_runtime(port)
        .await
        .map_err(|e| e.to_string())?;

    Ok(port)
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn list_tools(state: State<'_, AppState>) -> Result<Vec<ToolSchema>, String> {
    let url = format!("http://127.0.0.1:{}/api/tools", state.runtime_port);
    let body: Value = HTTP.get(&url).send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let tools = body["tools"].as_array()
        .ok_or("missing tools array".to_string())?
        .iter()
        .filter_map(|v| serde_json::from_value(v.clone()).ok())
        .collect();
    Ok(tools)
}

#[tauri::command]
async fn call_tool(
    name: String,
    params: Value,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    // geocode: call Nominatim directly (with optional proxy)
    if name == "geocode" {
        let proxy_url = state.model_settings.lock().unwrap().proxy_url.clone();
        return geocode_nominatim(&params, &proxy_url).await;
    }
    let url = format!("http://127.0.0.1:{}/api/command", state.runtime_port);
    let body = HTTP.post(&url)
        .json(&json!({
            "sessionId": "gaiaagent",
            "command": { "action": name, "params": params }
        }))
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())?;
    Ok(body)
}

async fn geocode_nominatim(params: &Value, proxy_url: &str) -> Result<Value, String> {
    let address = params.get("address").and_then(|v| v.as_str())
        .ok_or("geocode requires 'address' parameter")?;
    let mut url = reqwest::Url::parse("https://nominatim.openstreetmap.org/search")
        .map_err(|e| e.to_string())?;
    url.query_pairs_mut()
        .append_pair("q", address)
        .append_pair("format", "json")
        .append_pair("addressdetails", "1")
        .append_pair("limit", "1");
    if let Some(cc) = params.get("countryCode").and_then(|v| v.as_str()) {
        url.query_pairs_mut().append_pair("countrycodes", cc);
    }
    // Build client: use proxy if configured, otherwise direct connection
    let client = if proxy_url.is_empty() {
        HTTP.clone()
    } else {
        let proxy = reqwest::Proxy::all(proxy_url).map_err(|e| format!("Invalid proxy URL: {}", e))?;
        Client::builder()
            .proxy(proxy)
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to build proxy client: {}", e))?
    };
    let resp = client.get(url)
        .header("User-Agent", "cesium-mcp-runtime/1.0")
        .send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(json!({ "success": false, "message": format!("Nominatim API error: {}", resp.status()) }));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let items = data.as_array().ok_or("Nominatim returned non-array")?;
    if items.is_empty() {
        return Ok(json!({ "success": false, "message": format!("No results found for: {}", address) }));
    }
    let item = &items[0];
    let lon: f64 = item["lon"].as_str().unwrap_or("0").parse().unwrap_or(0.0);
    let lat: f64 = item["lat"].as_str().unwrap_or("0").parse().unwrap_or(0.0);
    let display_name = item["display_name"].as_str().unwrap_or("");
    let mut result = json!({
        "success": true,
        "longitude": lon,
        "latitude": lat,
        "displayName": display_name
    });
    if let Some(bb) = item.get("boundingbox").and_then(|v| v.as_array()) {
        if bb.len() == 4 {
            let parse = |i: usize| -> f64 {
                bb[i].as_str().unwrap_or("0").parse().unwrap_or(0.0)
            };
            result["boundingBox"] = json!({
                "south": parse(0), "north": parse(1),
                "west": parse(2), "east": parse(3)
            });
        }
    }
    Ok(result)
}

#[tauri::command]
async fn load_model_settings(state: State<'_, AppState>) -> Result<ModelSettings, String> {
    let s = state.model_settings.lock().unwrap().clone();
    Ok(s)
}

#[tauri::command]
async fn save_model_settings(
    settings: ModelSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    save_settings_to_disk(&settings)?;
    *state.model_settings.lock().unwrap() = settings;
    Ok(())
}

// ── HTTP proxy commands ──────────────────────────────────────────────────────

#[tauri::command]
async fn ai_fetch(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<Value, String> {
    let client = &*HTTP;
    let mut builder = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => client.get(&url),
    };

    for (key, value) in &headers {
        builder = builder.header(key.as_str(), value.as_str());
    }

    if let Some(b) = body {
        let json_value: Value = serde_json::from_str(&b).map_err(|e| format!("Invalid JSON body: {e}"))?;
        builder = builder.json(&json_value);
    }

    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let body_value = serde_json::from_str::<Value>(&text).unwrap_or(Value::String(text));

    Ok(json!({ "status": status, "body": body_value }))
}

#[tauri::command]
async fn ai_stream(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    request_id: String,
    on_event: Channel<Value>,
    state: State<'_, ActiveRequests>,
) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(request_id.clone(), cancel.clone());

    let client = &*HTTP_STREAM;
    let mut builder = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        _ => client.get(&url),
    };

    for (key, value) in &headers {
        builder = builder.header(key.as_str(), value.as_str());
    }

    if let Some(b) = body {
        let json_value: Value = serde_json::from_str(&b).map_err(|e| format!("Invalid JSON body: {e}"))?;
        builder = builder.json(&json_value);
    }

    let mut resp = builder.send().await.map_err(|e| {
        state.0.lock().unwrap().remove(&request_id);
        e.to_string()
    })?;

    let resp_status = resp.status().as_u16();
    if resp_status >= 400 {
        state.0.lock().unwrap().remove(&request_id);
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {resp_status}: {text}"));
    }

    let mut buffer = String::new();

    loop {
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        match resp.chunk().await {
            Ok(Some(chunk)) => {
                buffer.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim_end_matches('\r').to_string();
                    buffer = buffer[pos + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            state.0.lock().unwrap().remove(&request_id);
                            let _ = on_event.send(json!({ "done": true }));
                            return Ok(());
                        }
                        let _ = on_event.send(json!({ "data": data }));
                    }
                }
            }
            Ok(None) => break,
            Err(e) => {
                state.0.lock().unwrap().remove(&request_id);
                return Err(e.to_string());
            }
        }
    }

    state.0.lock().unwrap().remove(&request_id);
    let _ = on_event.send(json!({ "done": true }));
    Ok(())
}

#[tauri::command]
fn ai_cancel(request_id: String, state: State<'_, ActiveRequests>) -> Result<(), String> {
    if let Some(flag) = state.0.lock().unwrap().get(&request_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

// ── App entry point ───────────────────────────────────────────────────────────

pub fn run() {
    // Search for .env up the directory tree from the binary location
    if let Ok(exe) = std::env::current_exe() {
        for dir in exe.ancestors().skip(1) {
            let env_path = dir.join(".env");
            if env_path.exists() {
                let _ = dotenvy::from_path_override(env_path);
                break;
            }
        }
    }
    // Also try CWD as fallback (override)
    let _ = dotenvy::dotenv_override();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            runtime_process: Mutex::new(None),
            runtime_port: std::env::var("CESIUM_WS_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(9100),
            model_settings: Mutex::new(load_settings_from_disk()),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            if let Some(win) = handle.get_webview_window("main") {
                let icon = tauri::include_image!("icons/icon.png");
                let _ = win.set_icon(icon);
            }
            Ok(())
        })
        .manage(ActiveRequests(Mutex::new(HashMap::new())))
        .manage(mcp::McpServerManager::new())
        .invoke_handler(tauri::generate_handler![
            start_runtime,
            list_tools,
            call_tool,
            load_model_settings,
            save_model_settings,
            ai_fetch,
            ai_stream,
            ai_cancel,
            mcp::mcp_start_server,
            mcp::mcp_stop_server,
            mcp::mcp_send_message,
            mcp::mcp_list_tools,
            mcp::mcp_call_tool,
            mcp::mcp_list_servers,
            mcp::mcp_load_config,
            mcp::mcp_save_config,
        ])
        .on_window_event(|_win, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // runtime process is killed automatically when Child is dropped
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
