use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};

use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{
        CallToolRequestParams, CancelledNotificationParam, ClientRequest, ContentBlock, Meta,
        ProgressNotificationParam, Request, ServerCapabilities, ServerInfo,
    },
    service::{NotificationContext, PeerRequestOptions, RoleClient, RoleServer},
    tool, tool_handler, tool_router,
    transport::{
        streamable_http_server::{
            session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
        },
        StreamableHttpClientTransport,
    },
    ClientHandler, Peer, ServerHandler, ServiceExt,
};
use serde::Deserialize;

#[derive(Debug, Clone)]
struct ContractServer {
    #[expect(dead_code, reason = "tool_handler macro accesses this router field")]
    tool_router: ToolRouter<Self>,
    cancelled: Arc<AtomicBool>,
}

#[tokio::test]
async fn remote_streamable_http_completes_full_lifecycle() -> anyhow::Result<()> {
    let cancellation = tokio_util::sync::CancellationToken::new();
    let service: StreamableHttpService<ContractServer, LocalSessionManager> =
        StreamableHttpService::new(
            || Ok(ContractServer::new()),
            Default::default(),
            StreamableHttpServerConfig::default()
                .with_sse_keep_alive(None)
                .with_cancellation_token(cancellation.child_token()),
        );
    let router = axum::Router::new().nest_service("/mcp", service);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let server_task = tokio::spawn({
        let cancellation = cancellation.clone();
        async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(cancellation.cancelled_owned())
                .await
        }
    });

    let transport = StreamableHttpClientTransport::from_uri(format!("http://{address}/mcp"));
    let mut client = ().serve(transport).await?;
    assert!(client
        .list_all_tools()
        .await?
        .iter()
        .any(|tool| tool.name == "echo"));
    let result =
        client
            .call_tool(CallToolRequestParams::new("echo").with_arguments(
                serde_json::Map::from_iter([("value".into(), serde_json::json!("remote-gaia"))]),
            ))
            .await?;
    assert_eq!(result.content, vec![ContentBlock::text("remote-gaia")]);

    client.close().await?;
    cancellation.cancel();
    server_task.await??;
    Ok(())
}

impl ContractServer {
    fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct EchoRequest {
    value: String,
}

#[tool_router]
impl ContractServer {
    #[tool(description = "Echo a value for MCP lifecycle verification")]
    fn echo(&self, Parameters(request): Parameters<EchoRequest>) -> String {
        request.value
    }

    #[tool(description = "Emit progress for MCP notification verification")]
    async fn report_progress(&self, meta: Meta, peer: Peer<RoleServer>) -> String {
        if let Some(token) = meta.get_progress_token() {
            let _ = peer
                .notify_progress(
                    ProgressNotificationParam::new(token, 1.0)
                        .with_total(1.0)
                        .with_message("complete"),
                )
                .await;
        }
        "progress-complete".into()
    }

    #[tool(description = "Wait briefly so cancellation can be verified")]
    async fn cancellable_wait(&self) -> String {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        "finished".into()
    }
}

#[tool_handler]
impl ServerHandler for ContractServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_tool_list_changed()
                .build(),
        )
        .with_instructions("GaiaAgent MCP contract server")
    }

    async fn on_cancelled(
        &self,
        _notification: CancelledNotificationParam,
        _context: NotificationContext<RoleServer>,
    ) {
        self.cancelled.store(true, Ordering::Relaxed);
    }
}

#[derive(Clone, Default)]
struct ContractClient {
    tool_changes: Arc<AtomicUsize>,
    progress_events: Arc<AtomicUsize>,
    tool_change_notify: Arc<tokio::sync::Notify>,
}

impl ClientHandler for ContractClient {
    async fn on_tool_list_changed(&self, _context: NotificationContext<RoleClient>) {
        self.tool_changes.fetch_add(1, Ordering::Relaxed);
        self.tool_change_notify.notify_one();
    }

    async fn on_progress(
        &self,
        _params: ProgressNotificationParam,
        _context: NotificationContext<RoleClient>,
    ) {
        self.progress_events.fetch_add(1, Ordering::Relaxed);
    }
}

#[tokio::test]
async fn local_mcp_sdk_completes_full_lifecycle() -> anyhow::Result<()> {
    let (server_transport, client_transport) = tokio::io::duplex(16 * 1024);
    let server = ContractServer::new();
    let cancelled = server.cancelled.clone();
    let server_task = tokio::spawn(async move {
        let server = server.serve(server_transport).await?;
        server.notify_tool_list_changed().await?;
        server.waiting().await?;
        anyhow::Ok(())
    });

    let handler = ContractClient::default();
    let mut client = handler.clone().serve(client_transport).await?;
    let peer = client.peer_info().expect("server handshake info");
    assert_eq!(
        peer.instructions.as_deref(),
        Some("GaiaAgent MCP contract server")
    );

    let tools = client.list_all_tools().await?;
    assert!(tools.iter().any(|tool| tool.name == "echo"));

    let result =
        client
            .call_tool(CallToolRequestParams::new("echo").with_arguments(
                serde_json::Map::from_iter([("value".into(), serde_json::json!("gaia"))]),
            ))
            .await?;
    assert_eq!(result.content, vec![ContentBlock::text("gaia")]);

    client
        .call_tool(CallToolRequestParams::new("report_progress"))
        .await?;
    assert_eq!(handler.progress_events.load(Ordering::Relaxed), 1);
    tokio::time::timeout(
        std::time::Duration::from_secs(1),
        handler.tool_change_notify.notified(),
    )
    .await?;
    assert_eq!(handler.tool_changes.load(Ordering::Relaxed), 1);

    let request = ClientRequest::CallToolRequest(Request::new(CallToolRequestParams::new(
        "cancellable_wait",
    )));
    client
        .send_cancellable_request(request, PeerRequestOptions::no_options())
        .await?
        .cancel(Some("contract cancellation".into()))
        .await?;
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        while !cancelled.load(Ordering::Relaxed) {
            tokio::task::yield_now().await;
        }
    })
    .await?;

    client.close().await?;
    server_task.await??;
    Ok(())
}
