use std::sync::Arc;
use std::time::Duration;

use reqwest::{Client, StatusCode, Url};

use super::{
    AgentFuture, ModelProvider, ProviderAdapter, ProviderError, ProviderErrorKind, ProviderEvent,
    ProviderRequest,
};

const MAX_PROVIDER_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
const MAX_PROVIDER_REQUEST_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone)]
pub enum ProviderAuth {
    None,
    Bearer(String),
    AnthropicKey(String),
}

pub struct HttpModelProvider {
    client: Client,
    base_url: Url,
    adapter: Arc<dyn ProviderAdapter>,
    auth: ProviderAuth,
}

impl HttpModelProvider {
    pub fn new(
        base_url: &str,
        adapter: Arc<dyn ProviderAdapter>,
        auth: ProviderAuth,
        timeout: Duration,
    ) -> Result<Self, ProviderError> {
        let base_url = Url::parse(base_url).map_err(|error| ProviderError {
            kind: ProviderErrorKind::InvalidRequest,
            message: format!("invalid provider base URL: {error}"),
            retryable: false,
        })?;
        if !matches!(base_url.scheme(), "http" | "https")
            || !base_url.username().is_empty()
            || base_url.password().is_some()
        {
            return Err(ProviderError {
                kind: ProviderErrorKind::InvalidRequest,
                message: "provider URL must use HTTP(S) without embedded credentials".into(),
                retryable: false,
            });
        }
        let client = Client::builder()
            .timeout(timeout)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(internal_error)?;
        Ok(Self {
            client,
            base_url,
            adapter,
            auth,
        })
    }

    fn endpoint(&self) -> Result<Url, ProviderError> {
        endpoint_url(&self.base_url, self.adapter.endpoint_path())
    }
}

impl ModelProvider for HttpModelProvider {
    fn name(&self) -> &'static str {
        self.adapter.name()
    }

    fn complete(
        &self,
        request: ProviderRequest,
    ) -> AgentFuture<'_, Result<Vec<ProviderEvent>, ProviderError>> {
        Box::pin(async move {
            let body = self.adapter.encode_request(&request)?;
            if serde_json::to_vec(&body)
                .is_ok_and(|encoded| encoded.len() > MAX_PROVIDER_REQUEST_BYTES)
            {
                return Err(ProviderError {
                    kind: ProviderErrorKind::InvalidRequest,
                    message: "provider request exceeds 16 MiB".into(),
                    retryable: false,
                });
            }
            let mut builder = self.client.post(self.endpoint()?).json(&body);
            builder = match &self.auth {
                ProviderAuth::None => builder,
                ProviderAuth::Bearer(secret) => builder.bearer_auth(secret),
                ProviderAuth::AnthropicKey(secret) => builder
                    .header("x-api-key", secret)
                    .header("anthropic-version", "2023-06-01"),
            };
            let mut response = builder.send().await.map_err(network_error)?;
            let status = response.status();
            if response
                .content_length()
                .is_some_and(|length| length > MAX_PROVIDER_RESPONSE_BYTES as u64)
            {
                return Err(response_too_large());
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(network_error)? {
                if bytes.len().saturating_add(chunk.len()) > MAX_PROVIDER_RESPONSE_BYTES {
                    return Err(response_too_large());
                }
                bytes.extend_from_slice(&chunk);
            }
            let value = match serde_json::from_slice(&bytes) {
                Ok(value) => value,
                Err(error) if status.is_success() => {
                    return Err(ProviderError {
                        kind: ProviderErrorKind::InvalidResponse,
                        message: format!("provider returned invalid JSON: {error}"),
                        retryable: false,
                    });
                }
                Err(_) => serde_json::json!({
                    "error": { "message": String::from_utf8_lossy(&bytes) }
                }),
            };
            if !status.is_success() {
                return Err(status_error(status, &value));
            }
            self.adapter.decode_response(value)
        })
    }
}

fn response_too_large() -> ProviderError {
    ProviderError {
        kind: ProviderErrorKind::InvalidResponse,
        message: "provider response exceeds 32 MiB".into(),
        retryable: false,
    }
}

fn endpoint_url(base: &Url, endpoint_path: &str) -> Result<Url, ProviderError> {
    let endpoint_path = endpoint_path.trim_start_matches('/');
    let base_path = base.path().trim_matches('/');
    let path = if base_path.is_empty() || endpoint_path.starts_with(base_path) {
        format!("/{endpoint_path}")
    } else {
        format!("/{base_path}/{endpoint_path}")
    };
    let mut url = base.clone();
    url.set_path(&path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn status_error(status: StatusCode, body: &serde_json::Value) -> ProviderError {
    let kind = match status.as_u16() {
        401 | 403 => ProviderErrorKind::Authentication,
        408 => ProviderErrorKind::Timeout,
        429 => ProviderErrorKind::RateLimit,
        400..=499 => ProviderErrorKind::InvalidRequest,
        _ => ProviderErrorKind::Internal,
    };
    ProviderError {
        retryable: matches!(
            kind,
            ProviderErrorKind::RateLimit | ProviderErrorKind::Timeout
        ) || status.is_server_error(),
        kind,
        message: body
            .pointer("/error/message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("provider request failed")
            .to_string(),
    }
}

fn network_error(error: reqwest::Error) -> ProviderError {
    ProviderError {
        kind: if error.is_timeout() {
            ProviderErrorKind::Timeout
        } else {
            ProviderErrorKind::Network
        },
        message: error.to_string(),
        retryable: true,
    }
}

fn internal_error(error: reqwest::Error) -> ProviderError {
    ProviderError {
        kind: ProviderErrorKind::Internal,
        message: error.to_string(),
        retryable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn joins_provider_paths_without_duplicate_version_segment() {
        let openai = Url::parse("https://api.openai.com/v1").unwrap();
        assert_eq!(
            endpoint_url(&openai, "/v1/responses").unwrap().as_str(),
            "https://api.openai.com/v1/responses"
        );
        let anthropic = Url::parse("https://api.anthropic.com").unwrap();
        assert_eq!(
            endpoint_url(&anthropic, "/v1/messages").unwrap().as_str(),
            "https://api.anthropic.com/v1/messages"
        );
    }

    #[test]
    fn maps_auth_and_rate_limit_errors() {
        assert_eq!(
            status_error(StatusCode::UNAUTHORIZED, &serde_json::json!({})).kind,
            ProviderErrorKind::Authentication
        );
        let limited = status_error(
            StatusCode::TOO_MANY_REQUESTS,
            &serde_json::json!({"error":{"message":"slow down"}}),
        );
        assert_eq!(limited.kind, ProviderErrorKind::RateLimit);
        assert!(limited.retryable);
        assert_eq!(limited.message, "slow down");
    }
}
