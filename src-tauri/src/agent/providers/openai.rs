use serde_json::{json, Value};

use crate::agent::{
    invalid_response, validate_common, MessageRole, NativeToolCall, ProviderAdapter, ProviderError,
    ProviderEvent, ProviderRequest, ProviderTurn, ProviderUsage,
};

#[derive(Debug, Default)]
pub struct OpenAiAdapter;

impl ProviderAdapter for OpenAiAdapter {
    fn name(&self) -> &'static str {
        "openai"
    }
    fn endpoint_path(&self) -> &'static str {
        "/v1/responses"
    }

    fn validate_request(&self, request: &ProviderRequest) -> Result<(), ProviderError> {
        validate_common(request)
    }

    fn encode_request(&self, request: &ProviderRequest) -> Result<Value, ProviderError> {
        self.validate_request(request)?;
        let mut input = Vec::new();
        for turn in &request.turns {
            match turn {
                ProviderTurn::Message { message } => input.push(json!({
                    "role": match message.role { MessageRole::System => "system", MessageRole::User => "user", MessageRole::Assistant => "assistant", MessageRole::Tool => "user" },
                    "content": message.content,
                })),
                ProviderTurn::AssistantToolCalls { text, calls } => {
                    if let Some(text) = text { input.push(json!({"role":"assistant","content":text})); }
                    input.extend(calls.iter().map(|call| json!({"type":"function_call","call_id":call.id,"name":call.name,"arguments":call.arguments.to_string()})));
                }
                ProviderTurn::ToolResults { results } => input.extend(results.iter().map(|result| json!({"type":"function_call_output","call_id":result.call_id,"output":result.output}))),
                ProviderTurn::Opaque { provider, items } if provider == self.name() => input.extend(items.clone()),
                ProviderTurn::Opaque { .. } => {}
            }
        }
        let tools: Vec<Value> = request
            .tools
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                    "strict": true,
                })
            })
            .collect();
        Ok(json!({
            "model": request.model,
            "input": input,
            "tools": tools,
            "tool_choice": "auto",
            "parallel_tool_calls": false,
            "max_output_tokens": request.max_output_tokens,
            "temperature": request.temperature,
        }))
    }

    fn decode_response(&self, response: Value) -> Result<Vec<ProviderEvent>, ProviderError> {
        let output = response
            .get("output")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid_response("OpenAI response is missing output"))?;
        let mut events = Vec::new();
        let reasoning_items: Vec<Value> = output
            .iter()
            .filter(|item| item.get("type").and_then(Value::as_str) == Some("reasoning"))
            .cloned()
            .collect();
        if !reasoning_items.is_empty() {
            events.push(ProviderEvent::Continuation {
                provider: self.name().into(),
                items: reasoning_items,
            });
        }
        for item in output {
            match item.get("type").and_then(Value::as_str) {
                Some("message") => {
                    if let Some(content) = item.get("content").and_then(Value::as_array) {
                        for part in content {
                            if part.get("type").and_then(Value::as_str) == Some("output_text") {
                                if let Some(text) = part.get("text").and_then(Value::as_str) {
                                    events.push(ProviderEvent::TextDelta { text: text.into() });
                                }
                            }
                        }
                    }
                }
                Some("function_call") => {
                    let arguments_raw =
                        item.get("arguments")
                            .and_then(Value::as_str)
                            .ok_or_else(|| {
                                invalid_response("OpenAI function call is missing arguments")
                            })?;
                    let arguments = serde_json::from_str(arguments_raw).map_err(|_| {
                        invalid_response("OpenAI function arguments are invalid JSON")
                    })?;
                    let id = item
                        .get("call_id")
                        .and_then(Value::as_str)
                        .filter(|id| !id.is_empty())
                        .ok_or_else(|| {
                            invalid_response("OpenAI function call is missing call_id")
                        })?;
                    let name = item
                        .get("name")
                        .and_then(Value::as_str)
                        .filter(|name| !name.is_empty())
                        .ok_or_else(|| invalid_response("OpenAI function call is missing name"))?;
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
    use crate::agent::{ProviderMessage, ProviderTool};

    fn request() -> ProviderRequest {
        ProviderRequest {
            model: "gpt-5".into(),
            turns: vec![ProviderTurn::Message {
                message: ProviderMessage {
                    role: MessageRole::User,
                    content: "fly".into(),
                },
            }],
            tools: vec![ProviderTool {
                name: "flyTo".into(),
                description: "Fly".into(),
                input_schema: json!({"type":"object","properties":{}}),
            }],
            max_output_tokens: 512,
            temperature: 0.2,
        }
    }

    #[test]
    fn encodes_responses_api_function_tools() {
        let body = OpenAiAdapter.encode_request(&request()).unwrap();
        assert_eq!(body["tools"][0]["type"], "function");
        assert_eq!(body["tools"][0]["strict"], true);
        assert_eq!(body["parallel_tool_calls"], false);
    }

    #[test]
    fn decodes_native_function_call() {
        let events = OpenAiAdapter.decode_response(json!({
            "output": [{"type":"function_call","call_id":"c1","name":"flyTo","arguments":"{\"latitude\":39.9}"}],
            "usage": {"input_tokens":10,"output_tokens":4}
        })).unwrap();
        assert!(
            matches!(&events[0], ProviderEvent::ToolCall { call } if call.name == "flyTo" && call.arguments["latitude"] == 39.9)
        );
    }

    #[test]
    fn preserves_reasoning_items_for_tool_continuation() {
        let events = OpenAiAdapter
            .decode_response(json!({
                "output": [
                    {"type":"reasoning","id":"rs_1","content":[],"summary":[]},
                    {"type":"function_call","call_id":"c1","name":"getView","arguments":"{}"}
                ]
            }))
            .unwrap();
        assert!(
            matches!(&events[0], ProviderEvent::Continuation { provider, items } if provider == "openai" && items[0]["id"] == "rs_1")
        );

        let mut next = request();
        next.turns.push(ProviderTurn::Opaque {
            provider: "openai".into(),
            items: vec![json!({"type":"reasoning","id":"rs_1","content":[],"summary":[]})],
        });
        let encoded = OpenAiAdapter.encode_request(&next).unwrap();
        assert!(encoded["input"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["id"] == "rs_1"));
    }

    #[test]
    fn rejects_malformed_function_arguments() {
        let error = OpenAiAdapter
            .decode_response(json!({"output":[{"type":"function_call","call_id":"c1","name":"flyTo","arguments":"{"}]}))
            .unwrap_err();
        assert_eq!(error.kind, crate::agent::ProviderErrorKind::InvalidResponse);
    }
}
