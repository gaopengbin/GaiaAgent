use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener};
use std::path::{Path, PathBuf};

use axum::body::Body;
use axum::extract::{OriginalUri, Path as AxumPath, State};
use axum::http::header::{
    ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS,
    ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_EXPOSE_HEADERS, CACHE_CONTROL, CONTENT_RANGE,
    CONTENT_TYPE, RANGE,
};
use axum::http::{HeaderMap, HeaderValue, Response, StatusCode};
use axum::routing::{get, options};
use axum::Router;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use reqwest::Url;
use serde_json::Value;

#[derive(Clone)]
struct ProxyState {
    client: reqwest::Client,
    port: u16,
    secret: String,
}

pub fn bind() -> Result<(u16, String, TcpListener), String> {
    let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0))
        .map_err(|error| format!("unable to bind resource proxy: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("unable to configure resource proxy: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("unable to read resource proxy address: {error}"))?
        .port();
    let mut token = [0_u8; 24];
    getrandom::fill(&mut token)
        .map_err(|error| format!("unable to secure resource proxy: {error}"))?;
    let secret = token.iter().map(|byte| format!("{byte:02x}")).collect();
    Ok((port, secret, listener))
}

pub fn serve(listener: TcpListener, port: u16, secret: String) -> Result<(), String> {
    let state = ProxyState {
        client: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|error| format!("unable to create resource proxy client: {error}"))?,
        port,
        secret,
    };
    let router = proxy_router(state);
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("Unable to start GaiaAgent resource proxy: {error}");
                return;
            }
        };
        if let Err(error) = axum::serve(listener, router).await {
            eprintln!("GaiaAgent resource proxy stopped: {error}");
        }
    });
    Ok(())
}

fn proxy_router(state: ProxyState) -> Router {
    Router::new()
        .route(
            "/resource/{secret}/{origin}/{*path}",
            get(resource).merge(options(preflight)),
        )
        .route(
            "/resource/{secret}/{origin}/",
            get(resource_root).merge(options(preflight)),
        )
        .with_state(state)
}

pub fn proxy_url(port: u16, secret: &str, source: &str) -> Result<String, String> {
    if let Ok(existing) = Url::parse(source.trim()) {
        if existing.host_str() == Some("127.0.0.1")
            && existing.port() == Some(port)
            && existing.path().starts_with("/resource/")
        {
            return Ok(source.trim().to_string());
        }
    }
    let target = normalize_source(source)?;
    Ok(proxy_url_for_target(port, secret, &target))
}

fn normalize_source(source: &str) -> Result<Url, String> {
    let source = source.trim();
    if source.is_empty() {
        return Err("resource URL or path is empty".into());
    }
    let windows_drive_path = source.as_bytes().get(1) == Some(&b':')
        && source
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphabetic)
        && source
            .as_bytes()
            .get(2)
            .is_some_and(|separator| matches!(separator, b'\\' | b'/'));
    if !windows_drive_path {
        if let Ok(url) = Url::parse(source) {
            return match url.scheme() {
                "http" | "https" => Ok(url),
                "file" => normalize_file_url(url),
                scheme => Err(format!("unsupported resource scheme '{scheme}'")),
            };
        }
    }

    let path = PathBuf::from(source);
    let path = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|error| format!("unable to resolve local resource path: {error}"))?
            .join(path)
    };
    let path = if path.is_dir() {
        path.join("tileset.json")
    } else {
        path
    };
    Url::from_file_path(&path)
        .map_err(|_| format!("invalid local resource path '{}'", path.display()))
}

fn normalize_file_url(url: Url) -> Result<Url, String> {
    let path = url
        .to_file_path()
        .map_err(|_| "invalid local file URL".to_string())?;
    if path.is_dir() {
        Url::from_file_path(path.join("tileset.json"))
            .map_err(|_| "invalid local tileset directory".to_string())
    } else {
        Ok(url)
    }
}

fn proxy_url_for_target(port: u16, secret: &str, target: &Url) -> String {
    let origin = match target.scheme() {
        "file" => target
            .host_str()
            .map_or_else(|| "file://".to_string(), |host| format!("file://{host}")),
        _ => target.origin().ascii_serialization(),
    };
    let origin = URL_SAFE_NO_PAD.encode(origin);
    let mut proxy = format!(
        "http://127.0.0.1:{port}/resource/{secret}/{origin}{}",
        target.path()
    );
    if let Some(query) = target.query() {
        proxy.push('?');
        proxy.push_str(query);
    }
    proxy
        .replace("%7B", "{")
        .replace("%7D", "}")
        .replace("%7b", "{")
        .replace("%7d", "}")
}

async fn resource(
    State(state): State<ProxyState>,
    AxumPath((secret, origin, path)): AxumPath<(String, String, String)>,
    OriginalUri(uri): OriginalUri,
    request_headers: HeaderMap,
) -> Response<Body> {
    resource_target(
        &state,
        &secret,
        &origin,
        &path,
        uri.query(),
        &request_headers,
    )
    .await
}

async fn resource_root(
    State(state): State<ProxyState>,
    AxumPath((secret, origin)): AxumPath<(String, String)>,
    OriginalUri(uri): OriginalUri,
    request_headers: HeaderMap,
) -> Response<Body> {
    resource_target(&state, &secret, &origin, "", uri.query(), &request_headers).await
}

async fn resource_target(
    state: &ProxyState,
    secret: &str,
    origin: &str,
    path: &str,
    query: Option<&str>,
    request_headers: &HeaderMap,
) -> Response<Body> {
    if secret != state.secret {
        return error_response(StatusCode::FORBIDDEN, "invalid resource proxy token");
    }
    let origin = match URL_SAFE_NO_PAD
        .decode(origin)
        .ok()
        .and_then(|origin| String::from_utf8(origin).ok())
    {
        Some(origin) => origin,
        None => return error_response(StatusCode::BAD_REQUEST, "invalid resource origin"),
    };
    let mut target = match Url::parse(&origin) {
        Ok(target) => target,
        Err(error) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                format!("invalid resource origin: {error}"),
            )
        }
    };
    target.set_path(&format!("/{path}"));
    target.set_query(query);

    match target.scheme() {
        "http" | "https" => remote_resource(state, target, request_headers).await,
        "file" => local_resource(state, target).await,
        _ => error_response(StatusCode::BAD_REQUEST, "unsupported resource scheme"),
    }
}

async fn preflight() -> Response<Body> {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
        .header(ACCESS_CONTROL_ALLOW_HEADERS, "Range, Content-Type")
        .header(
            ACCESS_CONTROL_EXPOSE_HEADERS,
            "Accept-Ranges, Content-Length, Content-Range, Content-Type",
        )
        .body(Body::empty())
        .expect("resource proxy preflight response is valid")
}

async fn remote_resource(
    state: &ProxyState,
    target: Url,
    request_headers: &HeaderMap,
) -> Response<Body> {
    let mut request = state.client.get(target);
    if let Some(range) = request_headers.get(RANGE) {
        request = request.header(RANGE, range);
    }
    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return error_response(
                StatusCode::BAD_GATEWAY,
                format!("resource request failed: {error}"),
            )
        }
    };
    let status =
        StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let final_url = response.url().clone();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| mime_for_url(&final_url));
    let content_range = response.headers().get(CONTENT_RANGE).cloned();
    let accept_ranges = response.headers().get(ACCEPT_RANGES).cloned();
    let bytes = match response.bytes().await {
        Ok(bytes) => bytes.to_vec(),
        Err(error) => {
            return error_response(
                StatusCode::BAD_GATEWAY,
                format!("unable to read resource response: {error}"),
            )
        }
    };
    build_resource_response(
        state,
        final_url,
        status,
        content_type,
        content_range,
        accept_ranges,
        bytes,
    )
}

async fn local_resource(state: &ProxyState, target: Url) -> Response<Body> {
    let path = match target.to_file_path() {
        Ok(path) => path,
        Err(_) => return error_response(StatusCode::BAD_REQUEST, "invalid local file URL"),
    };
    let bytes = match tokio::fs::read(&path).await {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return error_response(
                StatusCode::NOT_FOUND,
                format!("local resource not found: {}", path.display()),
            )
        }
        Err(error) => {
            return error_response(
                StatusCode::BAD_GATEWAY,
                format!(
                    "unable to read local resource '{}': {error}",
                    path.display()
                ),
            )
        }
    };
    build_resource_response(
        state,
        target,
        StatusCode::OK,
        mime_for_path(&path),
        None,
        Some(HeaderValue::from_static("bytes")),
        bytes,
    )
}

fn build_resource_response(
    state: &ProxyState,
    target: Url,
    status: StatusCode,
    content_type: HeaderValue,
    content_range: Option<HeaderValue>,
    accept_ranges: Option<HeaderValue>,
    mut bytes: Vec<u8>,
) -> Response<Body> {
    let is_json = content_type
        .to_str()
        .is_ok_and(|value| value.to_ascii_lowercase().contains("json"))
        || matches!(
            extension(&target).as_deref(),
            Some("json" | "gltf" | "subtree")
        );
    if is_json {
        if let Ok(mut value) = serde_json::from_slice::<Value>(&bytes) {
            rewrite_resource_uris(&mut value, &target, state.port, &state.secret);
            if let Ok(rewritten) = serde_json::to_vec(&value) {
                bytes = rewritten;
            }
        }
    }

    let mut response = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, content_type)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(
            ACCESS_CONTROL_EXPOSE_HEADERS,
            "Accept-Ranges, Content-Length, Content-Range, Content-Type",
        )
        .header(CACHE_CONTROL, "no-cache")
        .body(Body::from(bytes))
        .expect("resource proxy response is valid");
    if let Some(value) = content_range {
        response.headers_mut().insert(CONTENT_RANGE, value);
    }
    if let Some(value) = accept_ranges {
        response.headers_mut().insert(ACCEPT_RANGES, value);
    }
    response
}

fn rewrite_resource_uris(value: &mut Value, base: &Url, port: u16, secret: &str) {
    match value {
        Value::Array(values) => {
            for value in values {
                rewrite_resource_uris(value, base, port, secret);
            }
        }
        Value::Object(object) => {
            for (key, value) in object {
                let normalized_key = key.to_ascii_lowercase();
                let resource_key = matches!(
                    normalized_key.as_str(),
                    "uri" | "url" | "schemauri" | "image" | "href"
                );
                if resource_key {
                    if let Some(reference) = value.as_str() {
                        if let Some(resolved) = resolve_reference(base, reference) {
                            *value = Value::String(proxy_url_for_target(port, secret, &resolved));
                            continue;
                        }
                    }
                }
                if normalized_key == "tiles" {
                    if let Value::Array(tiles) = value {
                        for tile in tiles.iter_mut() {
                            if let Some(reference) = tile.as_str() {
                                if let Some(resolved) = resolve_reference(base, reference) {
                                    *tile = Value::String(proxy_url_for_target(
                                        port, secret, &resolved,
                                    ));
                                }
                            }
                        }
                    }
                }
                rewrite_resource_uris(value, base, port, secret);
            }
        }
        _ => {}
    }
}

fn resolve_reference(base: &Url, reference: &str) -> Option<Url> {
    let reference = reference.trim();
    if reference.is_empty()
        || reference.starts_with("data:")
        || reference.starts_with("blob:")
        || reference.starts_with('#')
    {
        return None;
    }
    Url::parse(reference)
        .ok()
        .or_else(|| base.join(reference).ok())
}

fn extension(url: &Url) -> Option<String> {
    Path::new(url.path())
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
}

fn mime_for_url(url: &Url) -> HeaderValue {
    mime_for_extension(extension(url).as_deref())
}

fn mime_for_path(path: &Path) -> HeaderValue {
    mime_for_extension(
        path.extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
    )
}

fn mime_for_extension(extension: Option<&str>) -> HeaderValue {
    HeaderValue::from_static(match extension {
        Some("json" | "subtree") => "application/json",
        Some("gltf") => "model/gltf+json",
        Some("glb") => "model/gltf-binary",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("kml") => "application/vnd.google-earth.kml+xml",
        Some("czml" | "geojson") => "application/json",
        _ => "application/octet-stream",
    })
}

fn error_response(status: StatusCode, message: impl Into<String>) -> Response<Body> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(
            ACCESS_CONTROL_EXPOSE_HEADERS,
            "Accept-Ranges, Content-Length, Content-Range, Content-Type",
        )
        .body(Body::from(message.into()))
        .expect("resource proxy error response is valid")
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SECRET: &str = "test-secret";

    #[test]
    fn proxy_url_supports_http_https_and_windows_files() {
        assert!(
            proxy_url(43123, TEST_SECRET, "http://example.com/tiles/tileset.json")
                .unwrap()
                .starts_with("http://127.0.0.1:43123/resource/test-secret/")
        );
        assert!(proxy_url(43123, TEST_SECRET, "https://example.com/model.glb").is_ok());
        if cfg!(windows) {
            assert!(proxy_url(43123, TEST_SECRET, r"C:\data\tiles\tileset.json")
                .unwrap()
                .ends_with("/C:/data/tiles/tileset.json"));
        }
    }

    #[test]
    fn nested_tileset_and_gltf_uris_are_rewritten() {
        let base = Url::parse("http://example.com/root/tileset.json").unwrap();
        let mut value = serde_json::json!({
            "root": {
                "content": { "uri": "tiles/0.b3dm" },
                "children": [{ "content": { "url": "nested/tileset.json" } }]
            },
            "buffers": [{ "uri": "model.bin" }],
            "tiles": ["terrain/{z}/{x}/{y}.terrain"],
            "image": { "uri": "data:image/png;base64,AAAA" }
        });
        rewrite_resource_uris(&mut value, &base, 43123, TEST_SECRET);

        assert!(value["root"]["content"]["uri"]
            .as_str()
            .unwrap()
            .ends_with("/root/tiles/0.b3dm"));
        assert!(value["root"]["children"][0]["content"]["url"]
            .as_str()
            .unwrap()
            .ends_with("/root/nested/tileset.json"));
        assert!(value["buffers"][0]["uri"]
            .as_str()
            .unwrap()
            .contains("model.bin"));
        assert!(value["tiles"][0]
            .as_str()
            .unwrap()
            .contains("{z}/{x}/{y}.terrain"));
        assert_eq!(
            value["image"]["uri"].as_str().unwrap(),
            "data:image/png;base64,AAAA"
        );
    }

    #[test]
    fn implicit_tiling_templates_remain_substitutable() {
        let base = Url::parse("https://example.com/root/tileset.json").unwrap();
        let mut value = serde_json::json!({
            "implicitTiling": {
                "subtrees": { "uri": "subtrees/{level}/{x}/{y}.subtree" }
            },
            "content": { "uri": "content/{level}/{x}/{y}.glb" }
        });
        rewrite_resource_uris(&mut value, &base, 43123, TEST_SECRET);
        let subtree = value["implicitTiling"]["subtrees"]["uri"].as_str().unwrap();
        assert!(subtree.contains("{level}"));
        assert!(subtree.contains("{x}"));
        assert!(subtree.contains("{y}"));
    }

    #[tokio::test]
    async fn local_tileset_is_served_with_proxied_child_resources() {
        let directory =
            std::env::temp_dir().join(format!("gaia-resource-proxy-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let tileset = directory.join("tileset.json");
        std::fs::write(
            &tileset,
            r#"{"asset":{"version":"1.1"},"root":{"content":{"uri":"tiles/0.b3dm"}}}"#,
        )
        .unwrap();

        let (port, secret, listener) = bind().unwrap();
        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
        let state = ProxyState {
            client: reqwest::Client::new(),
            port,
            secret: secret.clone(),
        };
        let router = proxy_router(state);
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

        assert!(proxy_url(port, &secret, directory.to_str().unwrap())
            .unwrap()
            .contains("tileset.json"));
        let response = reqwest::get(proxy_url(port, &secret, tileset.to_str().unwrap()).unwrap())
            .await
            .unwrap();
        assert!(response.status().is_success());
        let value = response.json::<Value>().await.unwrap();
        assert!(value["root"]["content"]["uri"]
            .as_str()
            .unwrap()
            .starts_with(&format!("http://127.0.0.1:{port}/resource/{secret}/")));

        server.abort();
        let _ = std::fs::remove_dir_all(directory);
    }

    #[tokio::test]
    async fn corsless_http_tileset_and_child_are_loaded_through_proxy() {
        let upstream = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let upstream_port = upstream.local_addr().unwrap().port();
        let upstream_router = Router::new()
            .route(
                "/data/tileset.json",
                get(|| async {
                    Response::builder()
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(
                            r#"{"asset":{"version":"1.1"},"root":{"content":{"uri":"tile.b3dm"}}}"#,
                        ))
                        .unwrap()
                }),
            )
            .route(
                "/data/tile.b3dm",
                get(|| async { Body::from(vec![0_u8, 1, 2, 3]) }),
            );
        let upstream_server =
            tokio::spawn(async move { axum::serve(upstream, upstream_router).await.unwrap() });

        let (port, secret, listener) = bind().unwrap();
        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
        let state = ProxyState {
            client: reqwest::Client::new(),
            port,
            secret: secret.clone(),
        };
        let router = proxy_router(state);
        let proxy_server =
            tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

        let root = format!("http://127.0.0.1:{upstream_port}/data/tileset.json");
        let response = reqwest::get(proxy_url(port, &secret, &root).unwrap())
            .await
            .unwrap();
        assert!(response.status().is_success());
        assert_eq!(
            response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN).unwrap(),
            "*"
        );
        let value = response.json::<Value>().await.unwrap();
        let child = value["root"]["content"]["uri"].as_str().unwrap();
        let child_response = reqwest::get(child).await.unwrap();
        assert_eq!(
            child_response.bytes().await.unwrap().as_ref(),
            &[0, 1, 2, 3]
        );

        proxy_server.abort();
        upstream_server.abort();
    }
}
