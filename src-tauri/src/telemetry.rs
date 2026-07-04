use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

const MAX_EVENT_BYTES: usize = 256 * 1024;
const MAX_SESSIONS: i64 = 200;

pub struct TraceStore {
    connection: Mutex<Connection>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceSessionSummary {
    run_id: String,
    goal: String,
    status: String,
    provider: Option<String>,
    runtime: Option<String>,
    started_at: i64,
    completed_at: Option<i64>,
    prompt_tokens: i64,
    completion_tokens: i64,
    event_count: i64,
    error: Option<String>,
}

impl TraceStore {
    pub fn open() -> Result<Self, String> {
        Self::open_at(trace_database_path())
    }

    fn open_at(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .busy_timeout(Duration::from_secs(3))
            .map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA foreign_keys=ON;
                 CREATE TABLE IF NOT EXISTS trace_sessions (
                   run_id TEXT PRIMARY KEY,
                   goal TEXT NOT NULL DEFAULT '',
                   status TEXT NOT NULL DEFAULT 'running',
                   provider TEXT,
                   runtime TEXT,
                   started_at INTEGER NOT NULL,
                   completed_at INTEGER,
                   prompt_tokens INTEGER NOT NULL DEFAULT 0,
                   completion_tokens INTEGER NOT NULL DEFAULT 0,
                   error TEXT
                 );
                 CREATE TABLE IF NOT EXISTS trace_events (
                   event_id TEXT PRIMARY KEY,
                   run_id TEXT NOT NULL REFERENCES trace_sessions(run_id) ON DELETE CASCADE,
                   sequence INTEGER NOT NULL,
                   event_type TEXT NOT NULL,
                   timestamp INTEGER NOT NULL,
                   payload_json TEXT NOT NULL
                 );
                 CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_run_sequence
                   ON trace_events(run_id, sequence);
                 CREATE INDEX IF NOT EXISTS idx_trace_sessions_started
                   ON trace_sessions(started_at DESC);",
            )
            .map_err(|error| error.to_string())?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn record_event_value(
        &self,
        event: Value,
        provider: Option<String>,
        runtime: Option<String>,
    ) -> Result<(), String> {
        record_event_value(event, provider, runtime, self)
    }
}

fn trace_database_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("GaiaAgent")
        .join("gaiaagent.sqlite3")
}

fn is_sensitive_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    [
        "apikey",
        "api_key",
        "token",
        "password",
        "secret",
        "authorization",
    ]
    .iter()
    .any(|needle| key.contains(needle))
}

fn redact(value: &mut Value) {
    match value {
        Value::Object(object) => {
            for (key, value) in object {
                if is_sensitive_key(key) {
                    *value = Value::String("[REDACTED]".into());
                } else {
                    redact(value);
                }
            }
        }
        Value::Array(values) => values.iter_mut().for_each(redact),
        _ => {}
    }
}

fn required_string<'a>(event: &'a Value, key: &str) -> Result<&'a str, String> {
    event
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("trace event is missing '{key}'"))
}

fn event_sequence_from_id(event_id: &str) -> Option<i64> {
    event_id
        .rsplit_once(":event:")
        .and_then(|(_, sequence)| sequence.parse::<i64>().ok())
        .filter(|sequence| *sequence > 0)
}

#[tauri::command]
pub fn trace_record_event(
    event: Value,
    provider: Option<String>,
    runtime: Option<String>,
    state: State<'_, TraceStore>,
) -> Result<(), String> {
    record_event_value(event, provider, runtime, &state)
}

fn record_event_value(
    mut event: Value,
    provider: Option<String>,
    runtime: Option<String>,
    state: &TraceStore,
) -> Result<(), String> {
    if event.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("unsupported trace event version".into());
    }
    let run_id = required_string(&event, "runId")?.to_string();
    let event_id = required_string(&event, "id")?.to_string();
    let event_type = required_string(&event, "type")?.to_string();
    let timestamp = event
        .get("timestamp")
        .and_then(Value::as_i64)
        .ok_or_else(|| "trace event is missing 'timestamp'".to_string())?;
    redact(&mut event);
    let payload = serde_json::to_string(&event).map_err(|error| error.to_string())?;
    if payload.len() > MAX_EVENT_BYTES {
        return Err("trace event exceeds 256 KiB".into());
    }

    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "trace store lock poisoned")?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO trace_sessions(run_id, provider, runtime, started_at)
             VALUES(?1, ?2, ?3, ?4)
             ON CONFLICT(run_id) DO UPDATE SET
               provider=COALESCE(trace_sessions.provider, excluded.provider),
               runtime=COALESCE(trace_sessions.runtime, excluded.runtime)",
            params![run_id, provider, runtime, timestamp],
        )
        .map_err(|error| error.to_string())?;
    let sequence: i64 = match event_sequence_from_id(&event_id) {
        Some(sequence) => sequence,
        None => transaction
            .query_row(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM trace_events WHERE run_id=?1",
                params![run_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?,
    };
    transaction
        .execute(
            "INSERT OR IGNORE INTO trace_events(event_id, run_id, sequence, event_type, timestamp, payload_json)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            params![event_id, run_id, sequence, event_type, timestamp, payload],
        )
        .map_err(|error| error.to_string())?;

    match event_type.as_str() {
        "run.started" => {
            let goal = event
                .get("goal")
                .and_then(Value::as_str)
                .unwrap_or_default();
            transaction
                .execute(
                    "UPDATE trace_sessions SET goal=?2, status='running', started_at=?3 WHERE run_id=?1",
                    params![run_id, goal, timestamp],
                )
                .map_err(|error| error.to_string())?;
        }
        "usage.updated" => {
            let usage = event.get("usage").unwrap_or(&Value::Null);
            transaction
                .execute(
                    "UPDATE trace_sessions SET prompt_tokens=?2, completion_tokens=?3 WHERE run_id=?1",
                    params![
                        run_id,
                        usage.get("promptTokens").and_then(Value::as_i64).unwrap_or(0),
                        usage
                            .get("completionTokens")
                            .and_then(Value::as_i64)
                            .unwrap_or(0)
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        "run.completed" | "run.cancelled" | "run.failed" => {
            let status = event_type.trim_start_matches("run.");
            let error = event
                .get("error")
                .and_then(|value| value.get("message"))
                .and_then(Value::as_str);
            transaction
                .execute(
                    "UPDATE trace_sessions SET status=?2, completed_at=?3, error=?4 WHERE run_id=?1",
                    params![run_id, status, timestamp, error],
                )
                .map_err(|error| error.to_string())?;
        }
        _ => {}
    }
    if event_type == "run.started" {
        transaction
            .execute(
                "DELETE FROM trace_sessions WHERE run_id IN (
                   SELECT run_id FROM trace_sessions ORDER BY started_at DESC LIMIT -1 OFFSET ?1
                 )",
                params![MAX_SESSIONS],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

fn list_sessions(connection: &Connection, limit: u32) -> Result<Vec<TraceSessionSummary>, String> {
    let mut statement = connection
        .prepare(
            "SELECT s.run_id, s.goal, s.status, s.provider, s.runtime, s.started_at,
                    s.completed_at, s.prompt_tokens, s.completion_tokens,
                    COUNT(e.event_id), s.error
             FROM trace_sessions s LEFT JOIN trace_events e ON e.run_id=s.run_id
             GROUP BY s.run_id ORDER BY s.started_at DESC LIMIT ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![limit.min(200)], |row| {
            Ok(TraceSessionSummary {
                run_id: row.get(0)?,
                goal: row.get(1)?,
                status: row.get(2)?,
                provider: row.get(3)?,
                runtime: row.get(4)?,
                started_at: row.get(5)?,
                completed_at: row.get(6)?,
                prompt_tokens: row.get(7)?,
                completion_tokens: row.get(8)?,
                event_count: row.get(9)?,
                error: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn trace_list_sessions(
    limit: Option<u32>,
    state: State<'_, TraceStore>,
) -> Result<Vec<TraceSessionSummary>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "trace store lock poisoned")?;
    list_sessions(&connection, limit.unwrap_or(50))
}

#[tauri::command]
pub fn trace_get_events(
    run_id: String,
    state: State<'_, TraceStore>,
) -> Result<Vec<Value>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "trace store lock poisoned")?;
    let mut statement = connection
        .prepare(
            "SELECT payload_json FROM trace_events WHERE run_id=?1 ORDER BY sequence LIMIT 5000",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![run_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.map(|row| {
        row.map_err(|error| error.to_string())
            .and_then(|json| serde_json::from_str(&json).map_err(|error| error.to_string()))
    })
    .collect()
}

#[tauri::command]
pub fn trace_export_diagnostics(
    run_id: Option<String>,
    state: State<'_, TraceStore>,
) -> Result<String, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "trace store lock poisoned")?;
    let sessions = if let Some(run_id) = &run_id {
        let exists: Option<String> = connection
            .query_row(
                "SELECT run_id FROM trace_sessions WHERE run_id=?1",
                params![run_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if exists.is_none() {
            return Err("trace session not found".into());
        }
        list_sessions(&connection, 200)?
            .into_iter()
            .filter(|session| &session.run_id == run_id)
            .collect::<Vec<_>>()
    } else {
        list_sessions(&connection, 50)?
    };
    let mut events = Vec::new();
    for session in &sessions {
        let mut statement = connection
            .prepare("SELECT payload_json FROM trace_events WHERE run_id=?1 ORDER BY sequence")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![session.run_id], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        for row in rows {
            let value: Value = serde_json::from_str(&row.map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())?;
            events.push(value);
        }
    }
    let diagnostic = json!({
        "schemaVersion": 1,
        "generatedAt": now_ms(),
        "appVersion": env!("CARGO_PKG_VERSION"),
        "sessions": sessions,
        "events": events,
    });
    let directory = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("GaiaAgent")
        .join("diagnostics");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let filename = format!("gaiaagent-diagnostics-{}.json", now_ms());
    let path = directory.join(filename);
    std::fs::write(
        &path,
        serde_json::to_vec_pretty(&diagnostic).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_nested_secrets_without_destroying_trace_shape() {
        let mut event = json!({
            "arguments": {
                "apiKey": "secret",
                "nested": [{ "accessToken": "token", "name": "safe" }]
            }
        });
        redact(&mut event);
        assert_eq!(event["arguments"]["apiKey"], "[REDACTED]");
        assert_eq!(event["arguments"]["nested"][0]["accessToken"], "[REDACTED]");
        assert_eq!(event["arguments"]["nested"][0]["name"], "safe");
    }

    #[test]
    fn parses_event_sequence_from_stable_event_id() {
        assert_eq!(event_sequence_from_id("run-1:event:42"), Some(42));
        assert_eq!(event_sequence_from_id("run-1:event:0"), None);
        assert_eq!(event_sequence_from_id("run-1:event:not-a-number"), None);
        assert_eq!(event_sequence_from_id("run-1"), None);
    }
}
