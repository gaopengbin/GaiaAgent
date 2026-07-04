use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMessage {
    pub role: MessageRole,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAttachment {
    pub filename: Option<String>,
    pub media_type: String,
    pub data_url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderToolResult {
    pub call_id: String,
    pub name: String,
    pub output: String,
    #[serde(default)]
    pub is_error: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProviderTurn {
    Message {
        message: ProviderMessage,
    },
    AssistantToolCalls {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        calls: Vec<NativeToolCall>,
    },
    ToolResults {
        results: Vec<ProviderToolResult>,
    },
    Opaque {
        provider: String,
        items: Vec<Value>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRequest {
    pub model: String,
    pub turns: Vec<ProviderTurn>,
    pub tools: Vec<ProviderTool>,
    pub max_output_tokens: u32,
    pub temperature: f32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

impl ProviderUsage {
    pub fn total_tokens(self) -> u64 {
        self.input_tokens.saturating_add(self.output_tokens)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProviderEvent {
    TextDelta { text: String },
    ReasoningDelta { text: String },
    ToolCall { call: NativeToolCall },
    Usage { usage: ProviderUsage },
    Continuation { provider: String, items: Vec<Value> },
    Completed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderErrorKind {
    InvalidRequest,
    Authentication,
    RateLimit,
    Network,
    Timeout,
    Cancelled,
    InvalidResponse,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderError {
    pub kind: ProviderErrorKind,
    pub message: String,
    pub retryable: bool,
}

pub trait ProviderAdapter: Send + Sync {
    fn name(&self) -> &'static str;
    fn endpoint_path(&self) -> &'static str;
    fn validate_request(&self, request: &ProviderRequest) -> Result<(), ProviderError>;
    fn encode_request(&self, request: &ProviderRequest) -> Result<Value, ProviderError>;
    fn decode_response(&self, response: Value) -> Result<Vec<ProviderEvent>, ProviderError>;
}

pub(crate) fn invalid_request(message: impl Into<String>) -> ProviderError {
    ProviderError {
        kind: ProviderErrorKind::InvalidRequest,
        message: message.into(),
        retryable: false,
    }
}

pub(crate) fn invalid_response(message: impl Into<String>) -> ProviderError {
    ProviderError {
        kind: ProviderErrorKind::InvalidResponse,
        message: message.into(),
        retryable: false,
    }
}

pub(crate) fn validate_common(request: &ProviderRequest) -> Result<(), ProviderError> {
    if request.model.trim().is_empty() {
        return Err(invalid_request("model must not be empty"));
    }
    if request.turns.is_empty() {
        return Err(invalid_request("turns must not be empty"));
    }
    if request.max_output_tokens == 0 {
        return Err(invalid_request(
            "max_output_tokens must be greater than zero",
        ));
    }
    if !(0.0..=2.0).contains(&request.temperature) {
        return Err(invalid_request("temperature must be between 0 and 2"));
    }
    if request
        .tools
        .iter()
        .any(|tool| tool.name.trim().is_empty() || !tool.input_schema.is_object())
    {
        return Err(invalid_request(
            "tool names and JSON object schemas are required",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_total_saturates() {
        assert_eq!(
            ProviderUsage {
                input_tokens: u64::MAX,
                output_tokens: 1,
            }
            .total_tokens(),
            u64::MAX
        );
    }

    #[test]
    fn tool_call_event_has_stable_tag() {
        let event = ProviderEvent::ToolCall {
            call: NativeToolCall {
                id: "call-1".into(),
                name: "flyTo".into(),
                arguments: serde_json::json!({"latitude": 39.9}),
            },
        };
        let value = serde_json::to_value(event).unwrap();
        assert_eq!(value["type"], "tool_call");
        assert_eq!(value["call"]["name"], "flyTo");
    }
}
