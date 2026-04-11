use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// ── MCP config (persistent) ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct McpConfig {
    #[serde(default)]
    pub servers: HashMap<String, McpServerConfig>,
}

fn mcp_config_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("GaiaAgent").join("mcp_servers.json")
}

// ── MCP server process ───────────────────────────────────────────────────────

struct McpProcess {
    child: Child,
    stdin: tokio::process::ChildStdin,
    reader: BufReader<tokio::process::ChildStdout>,
}

// ── Manager ──────────────────────────────────────────────────────────────────

pub struct McpServerManager {
    servers: Mutex<HashMap<String, McpProcess>>,
    next_id: AtomicU64,
}

impl McpServerManager {
    pub fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        }
    }

    fn next_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }
}

// ── JSON-RPC stdio transport ─────────────────────────────────────────────────

/// Read one JSON-RPC message from stdout.
/// Supports both Content-Length framing (LSP-style) and JSON Lines.
async fn read_message(
    reader: &mut BufReader<tokio::process::ChildStdout>,
) -> Result<Value, String> {
    loop {
        let mut line = String::new();
        let n = reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("read error: {e}"))?;
        if n == 0 {
            return Err("MCP server closed stdout".into());
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Content-Length framing
        if let Some(rest) = trimmed.strip_prefix("Content-Length:") {
            let len: usize = rest
                .trim()
                .parse()
                .map_err(|e| format!("invalid Content-Length: {e}"))?;

            // Skip remaining headers until empty line
            loop {
                let mut hdr = String::new();
                reader
                    .read_line(&mut hdr)
                    .await
                    .map_err(|e| format!("read header error: {e}"))?;
                if hdr.trim().is_empty() {
                    break;
                }
            }

            let mut body = vec![0u8; len];
            reader
                .read_exact(&mut body)
                .await
                .map_err(|e| format!("read body error: {e}"))?;

            return serde_json::from_slice(&body)
                .map_err(|e| format!("invalid JSON body: {e}"));
        }

        // JSON Lines — try parsing line as JSON
        if let Ok(msg) = serde_json::from_str::<Value>(trimmed) {
            return Ok(msg);
        }
        // Not JSON — skip (server logs, etc.)
    }
}

/// Write a JSON-RPC message (JSON Lines format)
async fn write_message(
    stdin: &mut tokio::process::ChildStdin,
    msg: &Value,
) -> Result<(), String> {
    let mut data = serde_json::to_string(msg).map_err(|e| format!("serialize error: {e}"))?;
    data.push('\n');
    stdin
        .write_all(data.as_bytes())
        .await
        .map_err(|e| format!("write error: {e}"))?;
    stdin
        .flush()
        .await
        .map_err(|e| format!("flush error: {e}"))?;
    Ok(())
}

/// Send a JSON-RPC request and wait for the response with matching id.
async fn send_request(
    proc: &mut McpProcess,
    id: u64,
    method: &str,
    params: Option<Value>,
) -> Result<Value, String> {
    let mut request = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
    });
    if let Some(p) = params {
        request["params"] = p;
    }

    write_message(&mut proc.stdin, &request).await?;

    // Read until we get a response with matching id (skip notifications)
    let resp = tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            let msg = read_message(&mut proc.reader).await?;
            if msg.get("id").and_then(|v| v.as_u64()) == Some(id) {
                return Ok::<Value, String>(msg);
            }
        }
    })
    .await
    .map_err(|_| format!("timeout waiting for response to '{method}'"))?;

    let resp = resp?;

    // Check for JSON-RPC error response
    if let Some(err) = resp.get("error") {
        let code = err.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
        let message = err.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
        return Err(format!("JSON-RPC error {code}: {message}"));
    }

    Ok(resp)
}

/// Send a JSON-RPC notification (no response expected)
async fn send_notification(
    proc: &mut McpProcess,
    method: &str,
    params: Option<Value>,
) -> Result<(), String> {
    let mut msg = json!({
        "jsonrpc": "2.0",
        "method": method,
    });
    if let Some(p) = params {
        msg["params"] = p;
    }
    write_message(&mut proc.stdin, &msg).await
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn mcp_start_server(
    server_id: String,
    command: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    let mut servers = state.servers.lock().await;

    // Stop existing server with same id
    if let Some(mut old) = servers.remove(&server_id) {
        let _ = old.child.kill().await;
    }

    // Validate command — only allow known safe launchers to prevent shell injection
    const ALLOWED_COMMANDS: &[&str] = &[
        "npx", "node", "python", "python3", "uvx", "uv", "bunx", "bun", "deno",
    ];
    let cmd_base = command
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(&command)
        .trim_end_matches(".exe")
        .trim_end_matches(".cmd");
    if !ALLOWED_COMMANDS.contains(&cmd_base) {
        return Err(format!(
            "command '{command}' not allowed. Allowed: {}",
            ALLOWED_COMMANDS.join(", ")
        ));
    }

    // On Windows, resolve via cmd /C for PATH + .cmd extension lookup
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", &command]);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new(&command);

    cmd.args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    if let Some(ref env_map) = env {
        cmd.envs(env_map);
    }

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("spawn '{command}' failed: {e}"))?;

    let stdin = child.stdin.take().ok_or("failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("failed to capture stdout")?;
    let reader = BufReader::new(stdout);

    // Drain stderr in background to prevent pipe buffer deadlock
    if let Some(stderr) = child.stderr.take() {
        let sid = server_id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[MCP:{sid}] {line}");
            }
        });
    }

    let mut proc = McpProcess {
        child,
        stdin,
        reader,
    };

    // MCP initialize handshake
    let id = state.next_id();
    let init_resp = send_request(
        &mut proc,
        id,
        "initialize",
        Some(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "GaiaAgent",
                "version": "0.1.0"
            }
        })),
    )
    .await?;

    // Send initialized notification
    send_notification(&mut proc, "notifications/initialized", None).await?;

    let capabilities = init_resp.get("result").cloned().unwrap_or(Value::Null);

    servers.insert(server_id, proc);

    Ok(capabilities)
}

#[tauri::command]
pub async fn mcp_stop_server(
    server_id: String,
    state: State<'_, McpServerManager>,
) -> Result<(), String> {
    let mut servers = state.servers.lock().await;
    if let Some(mut proc) = servers.remove(&server_id) {
        let _ = proc.child.kill().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_send_message(
    server_id: String,
    method: String,
    params: Option<Value>,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    let mut servers = state.servers.lock().await;
    let proc = servers
        .get_mut(&server_id)
        .ok_or_else(|| format!("MCP server '{server_id}' not found"))?;

    let id = state.next_id();
    send_request(proc, id, &method, params).await
}

#[tauri::command]
pub async fn mcp_list_tools(
    server_id: String,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    let mut servers = state.servers.lock().await;
    let proc = servers
        .get_mut(&server_id)
        .ok_or_else(|| format!("MCP server '{server_id}' not found"))?;

    let id = state.next_id();
    let resp = send_request(proc, id, "tools/list", None).await?;

    Ok(resp
        .get("result")
        .cloned()
        .unwrap_or(json!({"tools": []})))
}

#[tauri::command]
pub async fn mcp_call_tool(
    server_id: String,
    tool_name: String,
    arguments: Option<Value>,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    let mut servers = state.servers.lock().await;
    let proc = servers
        .get_mut(&server_id)
        .ok_or_else(|| format!("MCP server '{server_id}' not found"))?;

    let id = state.next_id();
    let resp = send_request(
        proc,
        id,
        "tools/call",
        Some(json!({
            "name": tool_name,
            "arguments": arguments.unwrap_or(json!({}))
        })),
    )
    .await?;

    Ok(resp.get("result").cloned().unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn mcp_list_servers(
    state: State<'_, McpServerManager>,
) -> Result<Vec<String>, String> {
    let servers = state.servers.lock().await;
    Ok(servers.keys().cloned().collect())
}

// ── Config persistence ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn mcp_load_config() -> Result<McpConfig, String> {
    let path = mcp_config_path();
    if !path.exists() {
        return Ok(McpConfig::default());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mcp_save_config(config: McpConfig) -> Result<(), String> {
    let path = mcp_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}
