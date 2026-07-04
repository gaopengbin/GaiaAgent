# MCP Contract Tests

GaiaAgent uses the official `rmcp` SDK for both local stdio and remote Streamable HTTP transports.

Run the lifecycle contracts with:

```powershell
npm run test:mcp-contract
```

The suite starts disposable in-process MCP servers and verifies:

- protocol initialization and capability negotiation;
- complete tool discovery;
- structured tool invocation and result decoding;
- progress and `tools/list_changed` notification delivery;
- protocol-level cancellation of an in-flight request;
- graceful client/server shutdown;
- the same lifecycle over an in-memory local transport and loopback Streamable HTTP.

For release candidates, also run the current MCP Inspector manually against one configured local server and one configured remote server. Inspector findings must be captured in the release worklog; the automated contracts remain the merge gate.
