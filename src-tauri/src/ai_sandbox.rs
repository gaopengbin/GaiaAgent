use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::{mcp, ModelSettings};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiSandboxTarget {
    ModelSettings,
    McpServers,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSandboxCapability {
    pub target: AiSandboxTarget,
    pub label: &'static str,
    pub description: &'static str,
    pub path: String,
    pub operations: Vec<&'static str>,
    pub requires_user_approval: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSandboxPatchRequest {
    pub target: AiSandboxTarget,
    pub proposed: Value,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiSandboxPatchStatus {
    Prepared,
    Applied,
    Discarded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSandboxPatch {
    pub id: String,
    pub target: AiSandboxTarget,
    pub status: AiSandboxPatchStatus,
    pub reason: Option<String>,
    pub target_path: String,
    pub sandbox_path: String,
    pub backup_path: Option<String>,
    pub created_at_ms: u64,
    pub applied_at_ms: Option<u64>,
    pub current: Value,
    pub proposed: Value,
    pub changed_paths: Vec<String>,
    pub validation: AiSandboxValidation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSandboxValidation {
    pub ok: bool,
    pub messages: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSandboxApplyResult {
    pub patch: AiSandboxPatch,
    pub applied_path: String,
    pub backup_path: Option<String>,
}

#[tauri::command]
pub fn ai_sandbox_capabilities() -> Result<Vec<AiSandboxCapability>, String> {
    Ok(vec![
        AiSandboxCapability {
            target: AiSandboxTarget::ModelSettings,
            label: "模型设置",
            description: "Provider、base URL、模型、上下文压缩和审批模式配置。",
            path: target_path(AiSandboxTarget::ModelSettings)
                .display()
                .to_string(),
            operations: vec!["replace"],
            requires_user_approval: true,
        },
        AiSandboxCapability {
            target: AiSandboxTarget::McpServers,
            label: "MCP 服务器配置",
            description: "MCP server 列表、启动命令、参数、环境变量和远程 endpoint。",
            path: target_path(AiSandboxTarget::McpServers)
                .display()
                .to_string(),
            operations: vec!["replace"],
            requires_user_approval: true,
        },
    ])
}

#[tauri::command]
pub fn ai_sandbox_read_target(target: AiSandboxTarget) -> Result<Value, String> {
    read_target_json(target)
}

#[tauri::command]
pub fn ai_sandbox_prepare_patch(request: AiSandboxPatchRequest) -> Result<AiSandboxPatch, String> {
    let proposed = normalize_and_validate(request.target, request.proposed)?;
    let target = target_path(request.target);
    let current = read_target_json(request.target)?;
    let changed_paths = changed_paths(&current, &proposed);
    let id = format!("patch-{}-{}", now_ms(), std::process::id());
    let sandbox_path = patch_path(&id);
    let patch = AiSandboxPatch {
        id,
        target: request.target,
        status: AiSandboxPatchStatus::Prepared,
        reason: request.reason,
        target_path: target.display().to_string(),
        sandbox_path: sandbox_path.display().to_string(),
        backup_path: None,
        created_at_ms: now_ms(),
        applied_at_ms: None,
        current,
        proposed,
        changed_paths,
        validation: AiSandboxValidation {
            ok: true,
            messages: vec!["配置目标已通过 Host 侧校验，等待用户确认应用。".into()],
        },
    };
    write_patch(&patch)?;
    Ok(patch)
}

#[tauri::command]
pub fn ai_sandbox_apply_patch(patch_id: String) -> Result<AiSandboxApplyResult, String> {
    let mut patch = read_patch(&patch_id)?;
    if matches!(patch.status, AiSandboxPatchStatus::Applied) {
        if let Ok(current) = read_target_json(patch.target) {
            patch.proposed = current;
            patch.validation = AiSandboxValidation {
                ok: true,
                messages: vec!["补丁已应用过，本次使用当前真实配置继续后续操作。".into()],
            };
        }
        return Ok(AiSandboxApplyResult {
            applied_path: target_path(patch.target).display().to_string(),
            backup_path: patch.backup_path.clone(),
            patch,
        });
    }
    if !matches!(patch.status, AiSandboxPatchStatus::Prepared) {
        return Err("Only prepared sandbox patches can be applied".into());
    }
    let proposed = normalize_and_validate(patch.target, patch.proposed.clone())?;
    let target = target_path(patch.target);
    let backup = backup_path(patch.target);
    if let Some(parent) = backup.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if target.exists() {
        fs::copy(&target, &backup).map_err(|error| error.to_string())?;
        patch.backup_path = Some(backup.display().to_string());
    }
    write_target_json(&target, &proposed)?;
    patch.status = AiSandboxPatchStatus::Applied;
    patch.applied_at_ms = Some(now_ms());
    patch.proposed = proposed;
    patch.validation = AiSandboxValidation {
        ok: true,
        messages: vec!["补丁已应用，原配置已备份。".into()],
    };
    write_patch(&patch)?;
    Ok(AiSandboxApplyResult {
        applied_path: target.display().to_string(),
        backup_path: patch.backup_path.clone(),
        patch,
    })
}

#[tauri::command]
pub fn ai_sandbox_get_patch(patch_id: String) -> Result<AiSandboxPatch, String> {
    read_patch(&patch_id)
}

#[tauri::command]
pub fn ai_sandbox_discard_patch(patch_id: String) -> Result<AiSandboxPatch, String> {
    let mut patch = read_patch(&patch_id)?;
    if matches!(patch.status, AiSandboxPatchStatus::Applied) {
        return Err("Applied sandbox patches cannot be discarded".into());
    }
    patch.status = AiSandboxPatchStatus::Discarded;
    write_patch(&patch)?;
    Ok(patch)
}

fn normalize_and_validate(target: AiSandboxTarget, value: Value) -> Result<Value, String> {
    match target {
        AiSandboxTarget::ModelSettings => {
            let settings: ModelSettings =
                serde_json::from_value(value).map_err(|error| error.to_string())?;
            validate_model_settings(&settings)?;
            serde_json::to_value(settings).map_err(|error| error.to_string())
        }
        AiSandboxTarget::McpServers => {
            let config: mcp::McpConfig =
                serde_json::from_value(value).map_err(|error| error.to_string())?;
            mcp::validate_mcp_config(&config)?;
            serde_json::to_value(config).map_err(|error| error.to_string())
        }
    }
}

fn validate_model_settings(settings: &ModelSettings) -> Result<(), String> {
    if !matches!(
        settings.provider.as_str(),
        "ollama" | "openai_compat" | "anthropic" | "ccswitch" | "ccswitch_claude"
    ) {
        return Err(format!("Unsupported provider '{}'", settings.provider));
    }
    if settings.agent_runtime != "native" {
        return Err("Only the native agent runtime is supported".into());
    }
    if !matches!(
        settings.approval_mode.as_str(),
        "safe" | "balanced" | "auto"
    ) {
        return Err(format!(
            "Unsupported approval mode '{}'",
            settings.approval_mode
        ));
    }
    if !matches!(
        settings.context_compaction_mode.as_str(),
        "semantic" | "structured" | "recent"
    ) {
        return Err(format!(
            "Unsupported context compaction mode '{}'",
            settings.context_compaction_mode
        ));
    }
    if settings.context_max_turns == 0 || settings.context_max_turns > 500 {
        return Err("contextMaxTurns must be between 1 and 500".into());
    }
    if settings.context_max_bytes < 16 * 1024 || settings.context_max_bytes > 4 * 1024 * 1024 {
        return Err("contextMaxBytes must be between 16 KiB and 4 MiB".into());
    }
    Ok(())
}

fn read_target_json(target: AiSandboxTarget) -> Result<Value, String> {
    let path = target_path(target);
    if !path.exists() {
        return Ok(default_target_json(target));
    }
    let data = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str(strip_json_bom(&data)).map_err(|error| error.to_string())
}

fn default_target_json(target: AiSandboxTarget) -> Value {
    match target {
        AiSandboxTarget::ModelSettings => {
            serde_json::to_value(ModelSettings::default()).unwrap_or_else(|_| json!({}))
        }
        AiSandboxTarget::McpServers => serde_json::to_value(mcp::McpConfig::default())
            .unwrap_or_else(|_| json!({ "servers": {} })),
    }
}

fn write_target_json(path: &PathBuf, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let json = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

fn write_patch(patch: &AiSandboxPatch) -> Result<(), String> {
    let path = patch_path(&patch.id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let json = serde_json::to_string_pretty(patch).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

fn read_patch(patch_id: &str) -> Result<AiSandboxPatch, String> {
    if !is_safe_patch_id(patch_id) {
        return Err("Invalid sandbox patch id".into());
    }
    let path = patch_path(patch_id);
    let data = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(strip_json_bom(&data)).map_err(|error| error.to_string())
}

fn strip_json_bom(data: &str) -> &str {
    data.strip_prefix('\u{feff}').unwrap_or(data)
}

fn is_safe_patch_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

fn target_path(target: AiSandboxTarget) -> PathBuf {
    let base = gaia_config_dir();
    match target {
        AiSandboxTarget::ModelSettings => base.join("model_settings.json"),
        AiSandboxTarget::McpServers => base.join("mcp_servers.json"),
    }
}

fn patch_path(patch_id: &str) -> PathBuf {
    gaia_config_dir()
        .join("sandbox")
        .join("patches")
        .join(format!("{patch_id}.json"))
}

fn backup_path(target: AiSandboxTarget) -> PathBuf {
    let name = match target {
        AiSandboxTarget::ModelSettings => "model_settings",
        AiSandboxTarget::McpServers => "mcp_servers",
    };
    gaia_config_dir()
        .join("sandbox")
        .join("backups")
        .join(format!("{name}-{}.json", now_ms()))
}

fn gaia_config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("GaiaAgent")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn changed_paths(current: &Value, proposed: &Value) -> Vec<String> {
    let mut changes = Vec::new();
    collect_changed_paths("", current, proposed, &mut changes);
    if changes.is_empty() && current != proposed {
        changes.push("$".into());
    }
    changes.truncate(128);
    changes
}

fn collect_changed_paths(
    prefix: &str,
    current: &Value,
    proposed: &Value,
    changes: &mut Vec<String>,
) {
    if changes.len() >= 128 {
        return;
    }
    match (current, proposed) {
        (Value::Object(left), Value::Object(right)) => {
            for key in sorted_union_keys(left, right) {
                let next = if prefix.is_empty() {
                    format!("$.{key}")
                } else {
                    format!("{prefix}.{key}")
                };
                match (left.get(&key), right.get(&key)) {
                    (Some(a), Some(b)) => collect_changed_paths(&next, a, b, changes),
                    _ => changes.push(next),
                }
            }
        }
        _ if current != proposed => changes.push(prefix.to_string()),
        _ => {}
    }
}

fn sorted_union_keys(left: &Map<String, Value>, right: &Map<String, Value>) -> Vec<String> {
    let mut keys = left.keys().chain(right.keys()).cloned().collect::<Vec<_>>();
    keys.sort();
    keys.dedup();
    keys
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsupported_model_provider() {
        let mut value = serde_json::to_value(ModelSettings::default()).unwrap();
        value["provider"] = Value::String("shell".into());
        assert!(normalize_and_validate(AiSandboxTarget::ModelSettings, value).is_err());
    }

    #[test]
    fn reports_changed_paths() {
        let current = json!({ "servers": { "a": { "enabled": false } } });
        let proposed = json!({ "servers": { "a": { "enabled": true }, "b": {} } });
        let paths = changed_paths(&current, &proposed);
        assert!(paths.contains(&"$.servers.a.enabled".into()));
        assert!(paths.contains(&"$.servers.b".into()));
    }

    #[test]
    fn strips_utf8_bom_before_json_parse() {
        let data = "\u{feff}{\"ok\":true}";
        let parsed: Value = serde_json::from_str(strip_json_bom(data)).unwrap();
        assert_eq!(parsed["ok"], Value::Bool(true));
    }
}
