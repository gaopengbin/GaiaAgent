use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use reqwest::Url;
use rmcp::transport::auth::OAuthState;
use rmcp::{
    handler::client::ClientHandler,
    model::{
        CallToolRequestParams, CancelledNotificationParam, ClientCapabilities, ClientInfo,
        ClientRequest, ElicitRequestParams, ElicitResult, ElicitationAction,
        ProgressNotificationParam, Request, RequestId, ServerResult,
    },
    service::{
        NotificationContext, Peer, PeerRequestOptions, RequestContext, RoleClient, RunningService,
    },
    transport::{
        streamable_http_client::StreamableHttpClientTransportConfig, AuthClient, AuthError,
        AuthorizationManager, CredentialStore, StoredCredentials, StreamableHttpClientTransport,
        TokioChildProcess,
    },
    ServiceExt,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub transport: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub auth: Option<String>,
    #[serde(default, alias = "oauth_scopes")]
    pub oauth_scopes: Vec<String>,
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

#[derive(Clone)]
struct GaiaMcpClientHandler {
    app: AppHandle,
    server_id: String,
    pending_elicitations: PendingElicitations,
}

impl ClientHandler for GaiaMcpClientHandler {
    fn get_info(&self) -> ClientInfo {
        let mut info = ClientInfo::default();
        let mut capabilities = ClientCapabilities::default();
        capabilities.elicitation = Some(Default::default());
        info.capabilities = capabilities;
        info
    }

    async fn on_tool_list_changed(&self, _context: NotificationContext<RoleClient>) {
        let _ = self.app.emit("mcp-tools-changed", &self.server_id);
    }

    async fn on_progress(
        &self,
        params: ProgressNotificationParam,
        _context: NotificationContext<RoleClient>,
    ) {
        let _ = self.app.emit(
            "mcp-progress",
            json!({ "serverId": self.server_id, "progress": params }),
        );
    }

    async fn create_elicitation(
        &self,
        request: ElicitRequestParams,
        _context: RequestContext<RoleClient>,
    ) -> Result<ElicitResult, rmcp::ErrorData> {
        if let ElicitRequestParams::UrlElicitationParams { url, .. } = &request {
            if validate_remote_mcp_url(url).is_err() {
                return Ok(ElicitResult::new(ElicitationAction::Decline));
            }
        }
        let request_json = serde_json::to_value(&request).unwrap_or(Value::Null);
        if serde_json::to_vec(&request_json).map_or(true, |bytes| bytes.len() > 65_536) {
            return Ok(ElicitResult::new(ElicitationAction::Decline));
        }
        let is_form = matches!(request, ElicitRequestParams::FormElicitationParams { .. });
        let elicitation_id = format!(
            "mcp-elicit-{}-{}",
            now_ms(),
            ELICITATION_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let (sender, receiver) = oneshot::channel();
        {
            let mut pending = self.pending_elicitations.lock().await;
            if pending.len() >= 16 {
                return Ok(ElicitResult::new(ElicitationAction::Decline));
            }
            pending.insert(
                elicitation_id.clone(),
                PendingElicitation { sender, is_form },
            );
        }
        let emitted = self.app.emit(
            "mcp-elicitation",
            json!({
                "id": elicitation_id,
                "serverId": self.server_id,
                "request": request_json,
            }),
        );
        if emitted.is_err() {
            self.pending_elicitations
                .lock()
                .await
                .remove(&elicitation_id);
            return Ok(ElicitResult::new(ElicitationAction::Decline));
        }
        match tokio::time::timeout(std::time::Duration::from_secs(120), receiver).await {
            Ok(Ok(result)) => Ok(result),
            _ => {
                self.pending_elicitations
                    .lock()
                    .await
                    .remove(&elicitation_id);
                Ok(ElicitResult::new(ElicitationAction::Decline))
            }
        }
    }
}

static ELICITATION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

struct PendingElicitation {
    sender: oneshot::Sender<ElicitResult>,
    is_form: bool,
}

type PendingElicitations = Arc<Mutex<HashMap<String, PendingElicitation>>>;

#[derive(Clone)]
struct KeyringOAuthStore {
    account: String,
}

impl KeyringOAuthStore {
    fn for_server(server_id: &str, url: &str) -> Self {
        let mut hash = 0xcbf29ce484222325u64;
        for byte in format!("{server_id}\0{url}").bytes() {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        Self {
            account: format!("mcp-oauth-{hash:016x}"),
        }
    }

    fn entry(&self) -> Result<keyring::Entry, AuthError> {
        crate::credential_entry(&self.account).map_err(AuthError::InternalError)
    }
}

#[async_trait::async_trait]
impl CredentialStore for KeyringOAuthStore {
    async fn load(&self) -> Result<Option<StoredCredentials>, AuthError> {
        match self.entry()?.get_password() {
            Ok(json) => serde_json::from_str(&json)
                .map(Some)
                .map_err(|error| AuthError::InternalError(error.to_string())),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(AuthError::InternalError(format!(
                "unable to read OAuth credentials: {error}"
            ))),
        }
    }

    async fn save(&self, credentials: StoredCredentials) -> Result<(), AuthError> {
        let json = serde_json::to_string(&credentials)
            .map_err(|error| AuthError::InternalError(error.to_string()))?;
        self.entry()?.set_password(&json).map_err(|error| {
            AuthError::InternalError(format!("unable to save OAuth credentials: {error}"))
        })
    }

    async fn clear(&self) -> Result<(), AuthError> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(AuthError::InternalError(format!(
                "unable to delete OAuth credentials: {error}"
            ))),
        }
    }
}

type McpClient = RunningService<RoleClient, GaiaMcpClientHandler>;

struct McpProcess {
    client: McpClient,
    transport: &'static str,
    tool_count: usize,
    connected_at_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    id: String,
    state: &'static str,
    transport: &'static str,
    tool_count: usize,
    connected_at_ms: u128,
}

#[derive(Debug, Clone)]
pub struct McpToolBinding {
    pub server_id: String,
    pub tool: crate::ToolSchema,
}

pub const BUILTIN_WEB_SEARCH_SERVER_ID: &str = "__gaia_builtin_web_search";
pub const BUILTIN_WEB_TOOL_NAMES: &[&str] = &["web_search", "web_fetch"];

type SharedProcess = Arc<Mutex<McpProcess>>;

pub struct McpServerManager {
    servers: Mutex<HashMap<String, SharedProcess>>,
    active_calls: Mutex<HashMap<String, ActiveMcpCall>>,
    pending_elicitations: PendingElicitations,
    oauth_sessions: Mutex<HashMap<String, OAuthState>>,
    builtin_web_start: Mutex<()>,
    builtin_web_proxy: Mutex<Option<String>>,
}

struct ActiveMcpCall {
    server_id: String,
    peer: Peer<RoleClient>,
    request_id: RequestId,
}

impl McpServerManager {
    pub fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
            active_calls: Mutex::new(HashMap::new()),
            pending_elicitations: Arc::new(Mutex::new(HashMap::new())),
            oauth_sessions: Mutex::new(HashMap::new()),
            builtin_web_start: Mutex::new(()),
            builtin_web_proxy: Mutex::new(None),
        }
    }

    async fn server(&self, server_id: &str) -> Result<SharedProcess, String> {
        self.servers
            .lock()
            .await
            .get(server_id)
            .cloned()
            .ok_or_else(|| format!("MCP server '{server_id}' not found"))
    }

    pub async fn list_connected_tools(&self) -> Result<Vec<McpToolBinding>, String> {
        let servers: Vec<(String, SharedProcess)> = self
            .servers
            .lock()
            .await
            .iter()
            .map(|(id, process)| (id.clone(), process.clone()))
            .collect();
        let mut bindings = Vec::new();
        for (server_id, process) in servers {
            let mut process = process.lock().await;
            let tools = process
                .client
                .list_all_tools()
                .await
                .map_err(|error| format!("MCP tools/list failed for '{server_id}': {error}"))?;
            process.tool_count = tools.len();
            for tool in tools {
                let value = serde_json::to_value(tool).map_err(|error| error.to_string())?;
                bindings.push(McpToolBinding {
                    server_id: server_id.clone(),
                    tool: mcp_tool_value_to_schema(value)?,
                });
            }
        }
        Ok(bindings)
    }

    pub async fn call_connected_tool(
        &self,
        server_id: String,
        tool_name: String,
        arguments: Option<Value>,
        call_id: Option<String>,
    ) -> Result<Value, String> {
        mcp_call_tool_inner(self, server_id, tool_name, arguments, call_id).await
    }

    pub async fn shutdown_all(&self) {
        let processes = self
            .servers
            .lock()
            .await
            .drain()
            .map(|(_, process)| process)
            .collect::<Vec<_>>();
        for process in processes {
            close_process(process).await;
        }
        self.active_calls.lock().await.clear();
        *self.builtin_web_proxy.lock().await = None;
    }

    async fn start_stdio_process(
        &self,
        server_id: String,
        display_command: &str,
        cmd: Command,
        app: AppHandle,
    ) -> Result<Value, String> {
        let old = self.servers.lock().await.remove(&server_id);
        if let Some(old) = old {
            close_process(old).await;
        }

        let (transport, stderr) = TokioChildProcess::builder(cmd)
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|error| format!("spawn '{display_command}' failed: {error}"))?;

        if let Some(stderr) = stderr {
            let sid = server_id.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    eprintln!("[MCP:{sid}] {line}");
                }
            });
        }

        let client = tokio::time::timeout(
            Duration::from_secs(30),
            GaiaMcpClientHandler {
                app,
                server_id: server_id.clone(),
                pending_elicitations: self.pending_elicitations.clone(),
            }
            .serve(transport),
        )
        .await
        .map_err(|_| format!("MCP initialize handshake timed out for '{server_id}'"))?
        .map_err(|error| format!("MCP initialize handshake failed for '{server_id}': {error}"))?;
        let server_info = serde_json::to_value(client.peer_info()).unwrap_or(Value::Null);
        self.servers.lock().await.insert(
            server_id,
            Arc::new(Mutex::new(McpProcess {
                client,
                transport: "stdio",
                tool_count: 0,
                connected_at_ms: now_ms(),
            })),
        );
        Ok(server_info)
    }

    pub async fn ensure_builtin_web_search(
        &self,
        app: AppHandle,
        proxy_url: &str,
    ) -> Result<(), String> {
        let _start_guard = self.builtin_web_start.lock().await;
        let normalized_proxy = proxy_url.trim().to_string();
        let already_running = self
            .servers
            .lock()
            .await
            .contains_key(BUILTIN_WEB_SEARCH_SERVER_ID);
        let same_proxy = self.builtin_web_proxy.lock().await.as_deref() == Some(&normalized_proxy);
        if already_running && same_proxy {
            return Ok(());
        }

        let cmd = build_builtin_web_search_command(&app, &normalized_proxy).ok_or_else(|| {
            "bundled open-websearch runtime is missing; reinstall GaiaAgent".to_string()
        })?;
        self.start_stdio_process(
            BUILTIN_WEB_SEARCH_SERVER_ID.to_string(),
            "open-websearch",
            cmd,
            app,
        )
        .await?;
        let process = self.server(BUILTIN_WEB_SEARCH_SERVER_ID).await?;
        let tools = process
            .lock()
            .await
            .client
            .list_all_tools()
            .await
            .map_err(|error| format!("built-in web tools/list failed: {error}"))?;
        for required in BUILTIN_WEB_TOOL_NAMES {
            if !tools.iter().any(|tool| tool.name.as_ref() == *required) {
                return Err(format!("built-in web tool '{required}' is unavailable"));
            }
        }
        *self.builtin_web_proxy.lock().await = Some(normalized_proxy);
        Ok(())
    }
}

fn mcp_tool_value_to_schema(value: Value) -> Result<crate::ToolSchema, String> {
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "MCP tool is missing a name".to_string())?
        .to_string();
    let description = value
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let input_schema = value
        .get("inputSchema")
        .or_else(|| value.get("input_schema"))
        .cloned()
        .unwrap_or_else(|| json!({ "type": "object", "properties": {} }));
    Ok(crate::ToolSchema {
        name,
        description,
        input_schema,
    })
}

const ALLOWED_MCP_COMMANDS: &[&str] = &[
    "npx", "node", "python", "python3", "uvx", "uv", "bunx", "bun", "deno",
];
const DENIED_MCP_ENV_KEYS: &[&str] = &[
    "BASH_ENV",
    "DYLD_INSERT_LIBRARIES",
    "ENV",
    "LD_PRELOAD",
    "NODE_OPTIONS",
    "PYTHONHOME",
    "PYTHONPATH",
    "RUSTC_WRAPPER",
    "SHELLOPTS",
];

fn validate_mcp_launch(
    command: &str,
    args: &[String],
    env: Option<&HashMap<String, String>>,
) -> Result<(), String> {
    let trimmed = command.trim();
    if trimmed != command {
        return Err("MCP command must not contain surrounding whitespace".into());
    }
    let normalized = trimmed.trim_end_matches(".exe").trim_end_matches(".cmd");
    if !cfg!(target_os = "windows") && normalized != trimmed {
        return Err("MCP command extensions are only supported on Windows".into());
    }
    if command.contains(['/', '\\']) || !ALLOWED_MCP_COMMANDS.contains(&normalized) {
        return Err(format!(
            "command '{command}' not allowed. Allowed: {}",
            ALLOWED_MCP_COMMANDS.join(", ")
        ));
    }

    if args.len() > 128 {
        return Err("MCP command has too many arguments".into());
    }
    for arg in args {
        if arg.len() > 8192 || arg.contains('\0') || arg.contains(['\r', '\n']) {
            return Err("MCP argument is invalid or too long".into());
        }
        if arg.contains(['&', '|', '<', '>', '^']) {
            return Err("MCP argument contains shell metacharacters".into());
        }
    }

    if let Some(env) = env {
        if env.len() > 64 {
            return Err("MCP environment contains too many variables".into());
        }
        for (key, value) in env {
            let valid_key = key.chars().enumerate().all(|(index, ch)| {
                ch == '_' || ch.is_ascii_alphanumeric() && (index > 0 || !ch.is_ascii_digit())
            });
            if !valid_key || key.is_empty() {
                return Err(format!("MCP environment key '{key}' is invalid"));
            }
            if DENIED_MCP_ENV_KEYS
                .iter()
                .any(|denied| key.eq_ignore_ascii_case(denied))
            {
                return Err(format!("MCP environment key '{key}' is not allowed"));
            }
            if value.len() > 32768 || value.contains('\0') {
                return Err(format!(
                    "MCP environment value for '{key}' is invalid or too long"
                ));
            }
        }
    }

    if normalized == "npx"
        && args
            .iter()
            .any(|arg| arg.eq_ignore_ascii_case("@modelcontextprotocol/server-fetch"))
    {
        return Err(
            "MCP fetch package '@modelcontextprotocol/server-fetch' is not published on npm. Use 'npx -y mcp-fetch-server' or 'uvx mcp-server-fetch' instead."
                .into(),
        );
    }

    Ok(())
}

pub(crate) fn validate_mcp_config(config: &McpConfig) -> Result<(), String> {
    for (server_id, server) in &config.servers {
        if server_id.trim().is_empty() {
            return Err("MCP server id cannot be empty".into());
        }
        if server_id.len() > 96
            || !server_id
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
        {
            return Err(format!("Invalid MCP server id '{server_id}'"));
        }
        let transport = server.transport.as_deref().unwrap_or("stdio");
        match transport {
            "streamable-http" => {
                let url = server
                    .url
                    .as_deref()
                    .ok_or_else(|| format!("MCP server '{server_id}' is missing url"))?;
                validate_remote_mcp_url(url)?;
            }
            "stdio" | "" => {
                validate_mcp_launch(&server.command, &server.args, Some(&server.env))?;
            }
            other => {
                return Err(format!(
                    "MCP server '{server_id}' uses unsupported transport '{other}'"
                ));
            }
        }
    }
    Ok(())
}

fn inherit_minimal_environment(command: &mut Command) {
    command.env_clear();
    const SAFE_ENV_KEYS: &[&str] = &[
        "APPDATA",
        "HOME",
        "LANG",
        "LOCALAPPDATA",
        "PATH",
        "PATHEXT",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "TMPDIR",
        "USERPROFILE",
    ];
    for key in SAFE_ENV_KEYS {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
}

#[cfg(target_os = "windows")]
fn common_windows_node_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(system_drive) = std::env::var_os("SystemDrive") {
        dirs.push(PathBuf::from(system_drive).join("nvm4w").join("nodejs"));
    }
    dirs.push(PathBuf::from(r"C:\nvm4w\nodejs"));
    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        dirs.push(PathBuf::from(program_files).join("nodejs"));
    }
    if let Some(program_files_x86) = std::env::var_os("ProgramFiles(x86)") {
        dirs.push(PathBuf::from(program_files_x86).join("nodejs"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    dirs
}

fn app_runtime_roots(app: Option<&AppHandle>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(app) = app {
        if let Ok(resource_dir) = app.path().resource_dir() {
            roots.push(resource_dir.join("runtime"));
            roots.push(resource_dir);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd.join("src-tauri").join("runtime-bundle"));
        roots.push(cwd.join("runtime-bundle"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            roots.push(exe_dir.join("resources").join("runtime"));
            roots.push(exe_dir.join("runtime"));
        }
    }
    roots
}

fn app_managed_bin_dirs(app: Option<&AppHandle>) -> Vec<PathBuf> {
    let mut dirs = app_runtime_roots(app)
        .into_iter()
        .flat_map(|root| [root.join("node_modules").join(".bin"), root.join("bin")])
        .collect::<Vec<_>>();
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.join("node_modules").join(".bin"));
    }
    dirs
}

fn build_builtin_web_search_command(app: &AppHandle, proxy_url: &str) -> Option<Command> {
    let (node, entrypoint) =
        bundled_open_websearch_invocation_from_roots(app_runtime_roots(Some(app)))?;
    let mut command = Command::new(&node);
    inherit_minimal_environment(&mut command);
    command
        .arg(entrypoint)
        .kill_on_drop(true)
        .env("MODE", "stdio")
        .env("DEFAULT_SEARCH_ENGINE", "bing")
        .env("ALLOWED_SEARCH_ENGINES", "bing,baidu,duckduckgo")
        .env("SEARCH_MODE", "request")
        .env("MCP_TOOL_SEARCH_NAME", "web_search")
        .env("MCP_TOOL_FETCH_WEB_NAME", "web_fetch");
    #[cfg(target_os = "windows")]
    prepend_command_dir_to_path(&mut command, &node);
    if !proxy_url.is_empty() {
        command.env("USE_PROXY", "true").env("PROXY_URL", proxy_url);
    }
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    Some(command)
}

fn bundled_open_websearch_invocation_from_roots(
    roots: impl IntoIterator<Item = PathBuf>,
) -> Option<(PathBuf, PathBuf)> {
    let node_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    roots.into_iter().find_map(|root| {
        let node = root.join("bin").join(node_name);
        let entrypoint = root
            .join("node_modules")
            .join("open-websearch")
            .join("build")
            .join("index.js");
        (node.is_file() && entrypoint.is_file())
            .then(|| (child_process_path(&node), child_process_path(&entrypoint)))
    })
}

#[cfg(target_os = "windows")]
fn child_process_path(path: &Path) -> PathBuf {
    let raw = path.to_string_lossy();
    if let Some(rest) = raw.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    raw.strip_prefix(r"\\?\")
        .map_or_else(|| path.to_path_buf(), PathBuf::from)
}

#[cfg(not(target_os = "windows"))]
fn child_process_path(path: &Path) -> PathBuf {
    path.to_path_buf()
}

fn bundled_npm_invocation(
    command: &str,
    args: &[String],
    app: Option<&AppHandle>,
) -> Option<(PathBuf, Vec<String>)> {
    bundled_npm_invocation_from_roots(command, args, app_runtime_roots(app))
}

fn bundled_npm_invocation_from_roots(
    command: &str,
    args: &[String],
    roots: impl IntoIterator<Item = PathBuf>,
) -> Option<(PathBuf, Vec<String>)> {
    let cli_name = if command.eq_ignore_ascii_case("npx") {
        "npx-cli.js"
    } else if command.eq_ignore_ascii_case("npm") {
        "npm-cli.js"
    } else {
        return None;
    };
    let node_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    roots.into_iter().find_map(|root| {
        let node = root.join("bin").join(node_name);
        let cli = root
            .join("node_modules")
            .join("npm")
            .join("bin")
            .join(cli_name);
        if !node.is_file() || !cli.is_file() {
            return None;
        }
        let mut resolved_args = Vec::with_capacity(args.len() + 1);
        resolved_args.push(child_process_path(&cli).to_string_lossy().into_owned());
        resolved_args.extend_from_slice(args);
        Some((child_process_path(&node), resolved_args))
    })
}

#[cfg(target_os = "windows")]
fn command_extensions() -> &'static [&'static str] {
    // Windows Node installations often include POSIX shims without an extension
    // next to the real `*.cmd` launchers. Prefer Win32-executable launchers first;
    // choosing the extensionless shim causes CreateProcess error 193.
    &[".cmd", ".exe", ".bat", ".com", ""]
}

#[cfg(not(target_os = "windows"))]
fn command_extensions() -> &'static [&'static str] {
    &[""]
}

fn find_command_in_dirs(command: &str, dirs: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    dirs.into_iter()
        .flat_map(|dir| {
            command_extensions()
                .iter()
                .map(move |extension| dir.join(format!("{command}{extension}")))
        })
        .find(|candidate| candidate.is_file())
}

fn normalize_npx_package_name(raw: &str) -> String {
    if let Some(rest) = raw.strip_prefix('@') {
        if let Some((scope, name)) = rest.split_once('/') {
            let name = name.split_once('@').map_or(name, |(name, _)| name);
            return format!("@{scope}/{name}");
        }
    }
    raw.split_once('@')
        .map_or(raw, |(name, _)| name)
        .to_string()
}

fn likely_package_bin_name(package: &str) -> String {
    package
        .rsplit('/')
        .next()
        .unwrap_or(package)
        .split_once('@')
        .map_or(
            package.rsplit('/').next().unwrap_or(package),
            |(name, _)| name,
        )
        .to_string()
}

fn local_npx_package_invocation(
    args: &[String],
    app: Option<&AppHandle>,
) -> Option<(PathBuf, Vec<String>)> {
    let ignored_flags = [
        "--yes",
        "-y",
        "--no-install",
        "--quiet",
        "--silent",
        "--ignore-existing",
        "exec",
    ];
    let package_index = args.iter().position(|arg| {
        !ignored_flags.contains(&arg.as_str())
            && !arg.starts_with('-')
            && !arg.contains(['&', '|', '<', '>', '^'])
    })?;
    let package = normalize_npx_package_name(&args[package_index]);
    let bin_name = likely_package_bin_name(&package);
    let program = find_command_in_dirs(&bin_name, app_managed_bin_dirs(app))?;
    let remaining_args = args
        .iter()
        .skip(package_index + 1)
        .cloned()
        .collect::<Vec<_>>();
    Some((program, remaining_args))
}

fn resolve_managed_mcp_command(
    command: &str,
    args: &[String],
    app: Option<&AppHandle>,
) -> Option<(PathBuf, Vec<String>)> {
    if command.eq_ignore_ascii_case("npx") || command.eq_ignore_ascii_case("npm") {
        if let Some(invocation) = local_npx_package_invocation(args, app) {
            return Some(invocation);
        }
        if let Some(invocation) = bundled_npm_invocation(command, args, app) {
            return Some(invocation);
        }
    }
    find_command_in_dirs(command, app_managed_bin_dirs(app)).map(|program| (program, args.to_vec()))
}

#[cfg(target_os = "windows")]
fn resolve_windows_mcp_command(command: &str) -> Option<PathBuf> {
    let path_dirs = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect::<Vec<_>>())
        .unwrap_or_default();
    find_command_in_dirs(
        command,
        path_dirs.into_iter().chain(common_windows_node_dirs()),
    )
}

#[cfg(target_os = "windows")]
fn prepend_command_dir_to_path(command: &mut Command, program: &Path) {
    let Some(parent) = program.parent() else {
        return;
    };
    let mut paths = vec![parent.to_path_buf()];
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    if let Ok(joined) = std::env::join_paths(paths) {
        command.env("PATH", joined);
    }
}

fn build_mcp_command(
    command: &str,
    args: &[String],
    env: Option<&HashMap<String, String>>,
    app: Option<&AppHandle>,
) -> Command {
    let managed_command = resolve_managed_mcp_command(command, args, app);

    #[cfg(target_os = "windows")]
    let resolved_command = managed_command
        .as_ref()
        .map(|(program, _)| program.clone())
        .or_else(|| resolve_windows_mcp_command(command));
    #[cfg(not(target_os = "windows"))]
    let resolved_command = managed_command.as_ref().map(|(program, _)| program.clone());
    let resolved_args = managed_command
        .as_ref()
        .map(|(_, args)| args.as_slice())
        .unwrap_or(args);

    #[cfg(target_os = "windows")]
    let mut cmd = Command::new(
        resolved_command
            .as_ref()
            .map_or_else(|| command.into(), Clone::clone),
    );
    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new(
        resolved_command
            .as_ref()
            .map_or_else(|| command.into(), Clone::clone),
    );

    cmd.args(resolved_args).kill_on_drop(true);
    inherit_minimal_environment(&mut cmd);
    #[cfg(target_os = "windows")]
    if let Some(program) = &resolved_command {
        prepend_command_dir_to_path(&mut cmd, program);
    }
    if let Some(env) = env {
        cmd.envs(env);
    }
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

async fn close_process(process: SharedProcess) {
    let mut process = process.lock().await;
    let _ = process.client.close().await;
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn validate_remote_mcp_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|error| format!("invalid MCP URL: {error}"))?;
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return Err("MCP URL must not contain credentials or a fragment".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "MCP URL must contain a host".to_string())?;
    let loopback = host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback());
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        return Err("remote MCP requires HTTPS; HTTP is allowed only for loopback hosts".into());
    }
    Ok(url)
}

const OAUTH_REDIRECT_URI: &str = "http://127.0.0.1:8765/oauth/callback";

fn validate_oauth_scopes(scopes: &[String]) -> Result<(), String> {
    if scopes.len() > 16 {
        return Err("OAuth scope list is too long".into());
    }
    if scopes.iter().any(|scope| {
        scope.is_empty()
            || scope.len() > 256
            || scope
                .chars()
                .any(|character| character.is_control() || character.is_whitespace())
    }) {
        return Err("OAuth scopes must be non-empty, bounded strings without whitespace".into());
    }
    Ok(())
}

fn validate_oauth_callback_url(raw: &str) -> Result<(), String> {
    let callback =
        Url::parse(raw).map_err(|error| format!("invalid OAuth callback URL: {error}"))?;
    let expected = Url::parse(OAUTH_REDIRECT_URI).expect("static OAuth redirect URL is valid");
    if callback.scheme() != expected.scheme()
        || callback.host_str() != expected.host_str()
        || callback.port_or_known_default() != expected.port_or_known_default()
        || callback.path() != expected.path()
    {
        return Err("OAuth callback URL does not match GaiaAgent's loopback redirect URI".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_start_server(
    server_id: String,
    command: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
    app: AppHandle,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    validate_mcp_launch(&command, &args, env.as_ref())?;
    let cmd = build_mcp_command(&command, &args, env.as_ref(), Some(&app));
    state
        .start_stdio_process(server_id, &command, cmd, app)
        .await
}

#[tauri::command]
pub async fn mcp_connect_remote(
    server_id: String,
    url: String,
    app: AppHandle,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    let url = validate_remote_mcp_url(&url)?;
    let old = state.servers.lock().await.remove(&server_id);
    if let Some(old) = old {
        close_process(old).await;
    }

    let transport = StreamableHttpClientTransport::from_uri(url.to_string());
    let client = GaiaMcpClientHandler {
        app,
        server_id: server_id.clone(),
        pending_elicitations: state.pending_elicitations.clone(),
    }
    .serve(transport)
    .await
    .map_err(|error| format!("MCP remote initialize failed for '{server_id}': {error}"))?;
    let server_info = serde_json::to_value(client.peer_info()).unwrap_or(Value::Null);
    state.servers.lock().await.insert(
        server_id,
        Arc::new(Mutex::new(McpProcess {
            client,
            transport: "streamable-http",
            tool_count: 0,
            connected_at_ms: now_ms(),
        })),
    );
    Ok(server_info)
}

#[tauri::command]
pub async fn mcp_oauth_start(
    server_id: String,
    url: String,
    scopes: Vec<String>,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    let url = validate_remote_mcp_url(&url)?;
    validate_oauth_scopes(&scopes)?;
    let mut oauth = OAuthState::new(url.as_str(), None)
        .await
        .map_err(|error| format!("OAuth discovery setup failed: {error}"))?;
    if let OAuthState::Unauthorized(manager) = &mut oauth {
        manager.set_credential_store(KeyringOAuthStore::for_server(&server_id, url.as_str()));
    }
    let scope_refs: Vec<_> = scopes.iter().map(String::as_str).collect();
    oauth
        .start_authorization(&scope_refs, OAUTH_REDIRECT_URI, Some("GaiaAgent"))
        .await
        .map_err(|error| format!("OAuth authorization start failed: {error}"))?;
    let authorization_url = oauth
        .get_authorization_url()
        .await
        .map_err(|error| format!("OAuth authorization URL unavailable: {error}"))?;
    state.oauth_sessions.lock().await.insert(server_id, oauth);
    Ok(json!({
        "authorizationUrl": authorization_url,
        "redirectUri": OAUTH_REDIRECT_URI,
    }))
}

#[tauri::command]
pub async fn mcp_oauth_complete(
    server_id: String,
    callback_url: String,
    state: State<'_, McpServerManager>,
) -> Result<(), String> {
    validate_oauth_callback_url(&callback_url)?;
    let mut oauth = state
        .oauth_sessions
        .lock()
        .await
        .remove(&server_id)
        .ok_or_else(|| "no pending OAuth authorization for this MCP server".to_string())?;
    if let Err(error) = oauth.handle_callback_url(&callback_url).await {
        state.oauth_sessions.lock().await.insert(server_id, oauth);
        return Err(format!("OAuth callback failed: {error}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_oauth_status(server_id: String, url: String) -> Result<bool, String> {
    let url = validate_remote_mcp_url(&url)?;
    KeyringOAuthStore::for_server(&server_id, url.as_str())
        .load()
        .await
        .map(|credentials| {
            credentials
                .and_then(|stored| stored.token_response)
                .is_some()
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn mcp_oauth_clear(server_id: String, url: String) -> Result<(), String> {
    let url = validate_remote_mcp_url(&url)?;
    KeyringOAuthStore::for_server(&server_id, url.as_str())
        .clear()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn mcp_connect_remote_oauth(
    server_id: String,
    url: String,
    app: AppHandle,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    let url = validate_remote_mcp_url(&url)?;
    let old = state.servers.lock().await.remove(&server_id);
    if let Some(old) = old {
        close_process(old).await;
    }

    let mut manager = AuthorizationManager::new(url.as_str())
        .await
        .map_err(|error| format!("OAuth manager setup failed: {error}"))?;
    manager.set_credential_store(KeyringOAuthStore::for_server(&server_id, url.as_str()));
    let authorized = manager
        .initialize_from_store()
        .await
        .map_err(|error| format!("OAuth credential restore failed: {error}"))?;
    if !authorized {
        return Err("OAuth authorization is required for this MCP server".into());
    }
    let http_client = reqwest13::Client::builder()
        .redirect(reqwest13::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| format!("OAuth MCP HTTP client setup failed: {error}"))?;
    let transport = StreamableHttpClientTransport::with_client(
        AuthClient::new(http_client, manager),
        StreamableHttpClientTransportConfig::with_uri(url.to_string()),
    );
    let client = GaiaMcpClientHandler {
        app,
        server_id: server_id.clone(),
        pending_elicitations: state.pending_elicitations.clone(),
    }
    .serve(transport)
    .await
    .map_err(|error| format!("OAuth MCP initialize failed for '{server_id}': {error}"))?;
    let server_info = serde_json::to_value(client.peer_info()).unwrap_or(Value::Null);
    state.servers.lock().await.insert(
        server_id,
        Arc::new(Mutex::new(McpProcess {
            client,
            transport: "streamable-http",
            tool_count: 0,
            connected_at_ms: now_ms(),
        })),
    );
    Ok(server_info)
}

#[tauri::command]
pub async fn mcp_stop_server(
    server_id: String,
    state: State<'_, McpServerManager>,
) -> Result<(), String> {
    if let Some(process) = state.servers.lock().await.remove(&server_id) {
        close_process(process).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_list_tools(
    server_id: String,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    let process = state.server(&server_id).await?;
    let mut process = process.lock().await;
    let tools = process
        .client
        .list_all_tools()
        .await
        .map_err(|error| format!("MCP tools/list failed: {error}"))?;
    process.tool_count = tools.len();
    Ok(json!({ "tools": tools }))
}

#[tauri::command]
pub async fn mcp_call_tool(
    server_id: String,
    tool_name: String,
    arguments: Option<Value>,
    call_id: Option<String>,
    state: State<'_, McpServerManager>,
) -> Result<Value, String> {
    mcp_call_tool_inner(&state, server_id, tool_name, arguments, call_id).await
}

async fn mcp_call_tool_inner(
    state: &McpServerManager,
    server_id: String,
    tool_name: String,
    arguments: Option<Value>,
    call_id: Option<String>,
) -> Result<Value, String> {
    let arguments = match arguments.unwrap_or_else(|| json!({})) {
        Value::Object(arguments) => arguments,
        _ => return Err("MCP tool arguments must be a JSON object".into()),
    };
    let process = state.server(&server_id).await?;
    let process = process.lock().await;
    let request = ClientRequest::CallToolRequest(Request::new(
        CallToolRequestParams::new(tool_name).with_arguments(arguments),
    ));
    let handle = process
        .client
        .send_cancellable_request(
            request,
            PeerRequestOptions::with_timeout(std::time::Duration::from_secs(60))
                .reset_timeout_on_progress()
                .with_max_total_timeout(std::time::Duration::from_secs(600)),
        )
        .await
        .map_err(|error| format!("MCP tools/call failed: {error}"))?;
    let call_id = call_id.unwrap_or_else(|| format!("mcp-call-{}", now_ms()));
    state.active_calls.lock().await.insert(
        call_id.clone(),
        ActiveMcpCall {
            server_id,
            peer: handle.peer.clone(),
            request_id: handle.id.clone(),
        },
    );
    drop(process);
    let response = handle.await_response().await;
    state.active_calls.lock().await.remove(&call_id);
    let result = match response.map_err(|error| format!("MCP tools/call failed: {error}"))? {
        ServerResult::CallToolResult(result) => result,
        _ => return Err("MCP tools/call returned an unexpected response".into()),
    };
    serde_json::to_value(result).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn mcp_cancel_calls(
    server_id: Option<String>,
    state: State<'_, McpServerManager>,
) -> Result<usize, String> {
    let calls: Vec<_> = state
        .active_calls
        .lock()
        .await
        .iter()
        .filter(|(_, call)| server_id.as_ref().map_or(true, |id| id == &call.server_id))
        .map(|(id, call)| (id.clone(), call.peer.clone(), call.request_id.clone()))
        .collect();
    for (_, peer, request_id) in &calls {
        peer.notify_cancelled(CancelledNotificationParam::new(
            Some(request_id.clone()),
            Some("Cancelled by user".into()),
        ))
        .await
        .map_err(|error| format!("failed to cancel MCP call: {error}"))?;
    }
    let mut active = state.active_calls.lock().await;
    for (id, _, _) in &calls {
        active.remove(id);
    }
    Ok(calls.len())
}

#[tauri::command]
pub async fn mcp_resolve_elicitation(
    elicitation_id: String,
    action: String,
    content: Option<Value>,
    state: State<'_, McpServerManager>,
) -> Result<(), String> {
    if content
        .as_ref()
        .and_then(|value| serde_json::to_vec(value).ok())
        .is_some_and(|bytes| bytes.len() > 65_536)
    {
        return Err("MCP elicitation response is too large".into());
    }
    let action = match action.as_str() {
        "accept" => ElicitationAction::Accept,
        "decline" => ElicitationAction::Decline,
        "cancel" => ElicitationAction::Cancel,
        _ => return Err("invalid MCP elicitation action".into()),
    };
    let is_form = state
        .pending_elicitations
        .lock()
        .await
        .get(&elicitation_id)
        .map(|pending| pending.is_form)
        .ok_or_else(|| "MCP elicitation is no longer pending".to_string())?;
    let result = if action == ElicitationAction::Accept {
        if is_form {
            let content = content.ok_or_else(|| {
                "form elicitation acceptance requires an object response".to_string()
            })?;
            if !content.is_object() {
                return Err("form elicitation response must be a JSON object".into());
            }
            ElicitResult::new(action).with_content(content)
        } else {
            if content.is_some() {
                return Err("URL elicitation acceptance must not include content".into());
            }
            ElicitResult::new(action)
        }
    } else {
        ElicitResult::new(action)
    };
    let pending = state
        .pending_elicitations
        .lock()
        .await
        .remove(&elicitation_id)
        .ok_or_else(|| "MCP elicitation is no longer pending".to_string())?;
    pending
        .sender
        .send(result)
        .map_err(|_| "MCP elicitation requester disconnected".to_string())
}

#[tauri::command]
pub async fn mcp_list_servers(state: State<'_, McpServerManager>) -> Result<Vec<String>, String> {
    let servers = state.servers.lock().await;
    Ok(servers.keys().cloned().collect())
}

#[tauri::command]
pub async fn mcp_server_statuses(
    state: State<'_, McpServerManager>,
) -> Result<Vec<McpServerStatus>, String> {
    let entries: Vec<_> = state
        .servers
        .lock()
        .await
        .iter()
        .map(|(id, process)| (id.clone(), process.clone()))
        .collect();
    let mut statuses = Vec::with_capacity(entries.len());
    for (id, process) in entries {
        let process = process.lock().await;
        statuses.push(McpServerStatus {
            id,
            state: if process.client.is_closed() || process.client.is_transport_closed() {
                "disconnected"
            } else {
                "connected"
            },
            transport: process.transport,
            tool_count: process.tool_count,
            connected_at_ms: process.connected_at_ms,
        });
    }
    Ok(statuses)
}

#[tauri::command]
pub async fn mcp_load_config() -> Result<McpConfig, String> {
    let path = mcp_config_path();
    if !path.exists() {
        return Ok(McpConfig::default());
    }
    let data = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str(data.strip_prefix('\u{feff}').unwrap_or(&data))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn mcp_save_config(config: McpConfig) -> Result<(), String> {
    let path = mcp_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    std::fs::write(&path, json).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_bounded_launcher_configuration() {
        let env = HashMap::from([("MAPS_API_KEY".into(), "secret".into())]);
        assert!(validate_mcp_launch(
            "npx",
            &["--yes".into(), "@example/mcp-server".into()],
            Some(&env),
        )
        .is_ok());
    }

    #[test]
    fn rejects_unpublished_modelcontextprotocol_fetch_npm_package() {
        let error = validate_mcp_launch(
            "npx",
            &["-y".into(), "@modelcontextprotocol/server-fetch".into()],
            None,
        )
        .unwrap_err();
        assert!(error.contains("mcp-fetch-server"));
    }

    #[test]
    fn rejects_paths_shell_metacharacters_and_multiline_arguments() {
        assert!(validate_mcp_launch("C:\\tools\\node.exe", &[], None).is_err());
        assert!(validate_mcp_launch("powershell", &[], None).is_err());
        assert!(validate_mcp_launch("npx", &["package && whoami".into()], None).is_err());
        assert!(validate_mcp_launch("npx", &["package\nother".into()], None).is_err());
    }

    #[test]
    fn rejects_environment_injection_variables() {
        for key in ["NODE_OPTIONS", "PYTHONPATH", "LD_PRELOAD"] {
            let env = HashMap::from([(key.into(), "payload".into())]);
            assert!(validate_mcp_launch("node", &["server.js".into()], Some(&env)).is_err());
        }

        let invalid = HashMap::from([("1INVALID".into(), "value".into())]);
        assert!(validate_mcp_launch("node", &["server.js".into()], Some(&invalid)).is_err());
    }

    #[test]
    fn bundled_npx_runs_through_the_managed_node_runtime() {
        let root =
            std::env::temp_dir().join(format!("gaiaagent-mcp-runtime-test-{}", std::process::id()));
        let node_name = if cfg!(target_os = "windows") {
            "node.exe"
        } else {
            "node"
        };
        let node = root.join("bin").join(node_name);
        let cli = root
            .join("node_modules")
            .join("npm")
            .join("bin")
            .join("npx-cli.js");
        std::fs::create_dir_all(node.parent().unwrap()).unwrap();
        std::fs::create_dir_all(cli.parent().unwrap()).unwrap();
        std::fs::write(&node, []).unwrap();
        std::fs::write(&cli, []).unwrap();

        let (program, args) = bundled_npm_invocation_from_roots(
            "npx",
            &["-y".into(), "mcp-fetch-server".into()],
            [root.clone()],
        )
        .expect("bundled npx should resolve");

        assert_eq!(program, child_process_path(&node));
        assert_eq!(args[0], child_process_path(&cli).to_string_lossy());
        assert_eq!(&args[1..], ["-y", "mcp-fetch-server"]);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn bundled_open_websearch_uses_the_managed_node_runtime() {
        let root = std::env::temp_dir().join(format!(
            "gaiaagent-web-search-runtime-test-{}",
            std::process::id()
        ));
        let node_name = if cfg!(target_os = "windows") {
            "node.exe"
        } else {
            "node"
        };
        let node = root.join("bin").join(node_name);
        let entrypoint = root
            .join("node_modules")
            .join("open-websearch")
            .join("build")
            .join("index.js");
        std::fs::create_dir_all(node.parent().unwrap()).unwrap();
        std::fs::create_dir_all(entrypoint.parent().unwrap()).unwrap();
        std::fs::write(&node, []).unwrap();
        std::fs::write(&entrypoint, []).unwrap();

        let (program, script) = bundled_open_websearch_invocation_from_roots([root.clone()])
            .expect("bundled open-websearch should resolve");

        assert_eq!(program, child_process_path(&node));
        assert_eq!(script, child_process_path(&entrypoint));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn strips_windows_verbatim_prefix_from_node_script_paths() {
        assert_eq!(
            child_process_path(Path::new(r"\\?\G:\runtime\npx-cli.js")),
            PathBuf::from(r"G:\runtime\npx-cli.js")
        );
        assert_eq!(
            child_process_path(Path::new(r"\\?\UNC\server\share\npx-cli.js")),
            PathBuf::from(r"\\server\share\npx-cli.js")
        );
    }

    #[test]
    fn remote_urls_require_https_except_for_loopback_development() {
        assert!(validate_remote_mcp_url("https://mcp.example.com/api").is_ok());
        assert!(validate_remote_mcp_url("http://localhost:3000/mcp").is_ok());
        assert!(validate_remote_mcp_url("http://127.0.0.1:3000/mcp").is_ok());
        assert!(validate_remote_mcp_url("http://mcp.example.com/api").is_err());
        assert!(validate_remote_mcp_url("https://user:secret@mcp.example.com").is_err());
    }

    #[test]
    fn oauth_inputs_are_bounded_and_callback_is_exact() {
        assert!(validate_oauth_scopes(&["openid".into(), "profile".into()]).is_ok());
        assert!(validate_oauth_scopes(&["bad scope".into()]).is_err());
        assert!(validate_oauth_scopes(&vec!["scope".into(); 17]).is_err());

        assert!(
            validate_oauth_callback_url("http://127.0.0.1:8765/oauth/callback?code=x&state=y")
                .is_ok()
        );
        assert!(
            validate_oauth_callback_url("http://localhost:8765/oauth/callback?code=x&state=y")
                .is_err()
        );
        assert!(validate_oauth_callback_url(
            "https://attacker.example/oauth/callback?code=x&state=y"
        )
        .is_err());
    }
}
