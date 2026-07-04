use serde_json::{json, Value};

use crate::agent::{
    invalid_response, validate_common, MessageRole, NativeToolCall, ProviderAdapter, ProviderError,
    ProviderEvent, ProviderRequest, ProviderTurn, ProviderUsage,
};

#[derive(Debug, Default)]
pub struct OllamaAdapter;

impl ProviderAdapter for OllamaAdapter {
    fn name(&self) -> &'static str {
        "ollama"
    }
    fn endpoint_path(&self) -> &'static str {
        "/api/chat"
    }
    fn validate_request(&self, request: &ProviderRequest) -> Result<(), ProviderError> {
        validate_common(request)
    }

    fn encode_request(&self, request: &ProviderRequest) -> Result<Value, ProviderError> {
        self.validate_request(request)?;
        let tools: Vec<Value> = request
            .tools
            .iter()
            .map(|tool| {
                json!({"type":"function","function":{
                    "name":tool.name,"description":tool.description,"parameters":tool.input_schema
                }})
            })
            .collect();
        let mut messages = Vec::new();
        for turn in &request.turns {
            match turn {
                ProviderTurn::Message { message } => messages.push(json!({"role":match message.role { MessageRole::System=>"system",MessageRole::User=>"user",MessageRole::Assistant=>"assistant",MessageRole::Tool=>"tool" },"content":message.content})),
                ProviderTurn::AssistantToolCalls { text, calls } => messages.push(json!({"role":"assistant","content":text.clone().unwrap_or_default(),"tool_calls":calls.iter().map(|call| json!({"function":{"name":call.name,"arguments":call.arguments}})).collect::<Vec<_>>() })),
                ProviderTurn::ToolResults { results } => messages.extend(results.iter().map(|result| json!({"role":"tool","tool_name":result.name,"content":result.output}))),
                ProviderTurn::Opaque { .. } => {}
            }
        }
        Ok(json!({
            "model": request.model, "messages": messages, "tools": tools, "stream": false,
            "think": true, "options": {"temperature":request.temperature,"num_predict":request.max_output_tokens}
        }))
    }

    fn decode_response(&self, response: Value) -> Result<Vec<ProviderEvent>, ProviderError> {
        let message = response
            .get("message")
            .ok_or_else(|| invalid_response("Ollama response is missing message"))?;
        let mut events = Vec::new();
        if let Some(thinking) = message
            .get("thinking")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            events.push(ProviderEvent::ReasoningDelta {
                text: thinking.into(),
            });
        }
        if let Some(content) = message
            .get("content")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            events.push(ProviderEvent::TextDelta {
                text: content.into(),
            });
        }
        if let Some(calls) = message.get("tool_calls").and_then(Value::as_array) {
            for (index, item) in calls.iter().enumerate() {
                let function = item.get("function").unwrap_or(item);
                let name = function
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|name| !name.is_empty())
                    .ok_or_else(|| invalid_response("Ollama tool call is missing name"))?;
                let arguments = function
                    .get("arguments")
                    .filter(|arguments| arguments.is_object())
                    .cloned()
                    .ok_or_else(|| invalid_response("Ollama tool arguments must be an object"))?;
                events.push(ProviderEvent::ToolCall {
                    call: NativeToolCall {
                        id: item
                            .get("id")
                            .and_then(Value::as_str)
                            .map(str::to_owned)
                            .unwrap_or_else(|| format!("ollama-call-{index}")),
                        name: name.into(),
                        arguments,
                    },
                });
            }
        }
        events.push(ProviderEvent::Usage {
            usage: ProviderUsage {
                input_tokens: response
                    .get("prompt_eval_count")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                output_tokens: response
                    .get("eval_count")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
            },
        });
        events.push(ProviderEvent::Completed);
        Ok(events)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_ollama_tool_calls() {
        let events = OllamaAdapter.decode_response(json!({"message":{"content":"","tool_calls":[{"function":{"name":"flyTo","arguments":{"latitude":1}}}]},"prompt_eval_count":4,"eval_count":2})).unwrap();
        assert!(matches!(&events[0], ProviderEvent::ToolCall { call } if call.name == "flyTo"));
    }
}
