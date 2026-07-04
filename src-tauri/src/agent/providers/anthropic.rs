use serde_json::{json, Value};

use crate::agent::{
    invalid_response, validate_common, MessageRole, NativeToolCall, ProviderAdapter, ProviderError,
    ProviderEvent, ProviderRequest, ProviderTurn, ProviderUsage,
};

#[derive(Debug, Default)]
pub struct AnthropicAdapter;

impl ProviderAdapter for AnthropicAdapter {
    fn name(&self) -> &'static str {
        "anthropic"
    }
    fn endpoint_path(&self) -> &'static str {
        "/v1/messages"
    }
    fn validate_request(&self, request: &ProviderRequest) -> Result<(), ProviderError> {
        validate_common(request)
    }

    fn encode_request(&self, request: &ProviderRequest) -> Result<Value, ProviderError> {
        self.validate_request(request)?;
        let mut system_parts = Vec::new();
        let mut messages = Vec::new();
        for turn in &request.turns {
            match turn {
                ProviderTurn::Message { message } if message.role == MessageRole::System => system_parts.push(message.content.as_str()),
                ProviderTurn::Message { message } => messages.push(json!({"role":if message.role == MessageRole::Assistant {"assistant"} else {"user"},"content":message.content})),
                ProviderTurn::AssistantToolCalls { text, calls } => {
                    let mut content = Vec::new();
                    if let Some(text) = text { content.push(json!({"type":"text","text":text})); }
                    content.extend(calls.iter().map(|call| json!({"type":"tool_use","id":call.id,"name":call.name,"input":call.arguments})));
                    messages.push(json!({"role":"assistant","content":content}));
                }
                ProviderTurn::ToolResults { results } => messages.push(json!({"role":"user","content":results.iter().map(|result| json!({"type":"tool_result","tool_use_id":result.call_id,"content":result.output,"is_error":result.is_error})).collect::<Vec<_>>() })),
                ProviderTurn::Opaque { provider, items } if provider == self.name() => messages.extend(items.clone()),
                ProviderTurn::Opaque { .. } => {}
            }
        }
        let system = system_parts.join("\n\n");
        let tools: Vec<Value> = request.tools.iter().map(|tool| json!({
            "name": tool.name, "description": tool.description, "input_schema": tool.input_schema, "strict": true,
        })).collect();
        Ok(json!({
            "model": request.model, "system": system, "messages": messages, "tools": tools,
            "tool_choice": {"type":"auto"}, "max_tokens": request.max_output_tokens, "temperature": request.temperature,
        }))
    }

    fn decode_response(&self, response: Value) -> Result<Vec<ProviderEvent>, ProviderError> {
        let content = response
            .get("content")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid_response("Anthropic response is missing content"))?;
        let mut events = Vec::new();
        for block in content {
            match block.get("type").and_then(Value::as_str) {
                Some("text") => {
                    if let Some(text) = block.get("text").and_then(Value::as_str) {
                        events.push(ProviderEvent::TextDelta { text: text.into() });
                    }
                }
                Some("thinking") => {
                    if let Some(text) = block.get("thinking").and_then(Value::as_str) {
                        events.push(ProviderEvent::ReasoningDelta { text: text.into() });
                    }
                }
                Some("tool_use") => {
                    let id = block
                        .get("id")
                        .and_then(Value::as_str)
                        .filter(|id| !id.is_empty())
                        .ok_or_else(|| invalid_response("Anthropic tool use is missing id"))?;
                    let name = block
                        .get("name")
                        .and_then(Value::as_str)
                        .filter(|name| !name.is_empty())
                        .ok_or_else(|| invalid_response("Anthropic tool use is missing name"))?;
                    let arguments = block
                        .get("input")
                        .filter(|input| input.is_object())
                        .cloned()
                        .ok_or_else(|| {
                            invalid_response("Anthropic tool input must be an object")
                        })?;
                    events.push(ProviderEvent::ToolCall {
                        call: NativeToolCall {
                            id: id.into(),
                            name: name.into(),
                            arguments,
                        },
                    });
                }
                _ => {}
            }
        }
        if let Some(usage) = response.get("usage") {
            events.push(ProviderEvent::Usage {
                usage: ProviderUsage {
                    input_tokens: usage
                        .get("input_tokens")
                        .and_then(Value::as_u64)
                        .unwrap_or(0),
                    output_tokens: usage
                        .get("output_tokens")
                        .and_then(Value::as_u64)
                        .unwrap_or(0),
                },
            });
        }
        events.push(ProviderEvent::Completed);
        Ok(events)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_tool_use_blocks() {
        let events = AnthropicAdapter.decode_response(json!({"content":[{"type":"tool_use","id":"t1","name":"getView","input":{}}],"usage":{"input_tokens":3,"output_tokens":2}})).unwrap();
        assert!(matches!(&events[0], ProviderEvent::ToolCall { call } if call.id == "t1"));
    }
}
