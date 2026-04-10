<div align="center">
  <h1>GaiaAgent</h1>
  <p><strong>AI-Powered 3D GIS Assistant</strong></p>
  <p>Talk to a live <a href="https://cesium.com/">CesiumJS</a> 3D globe using natural language, powered by LLM and <a href="https://github.com/gaopengbin/cesium-mcp">cesium-mcp</a>.</p>

  <img src="docs/resource/124_1x_shots_so.png" alt="GaiaAgent Preview" width="800" />
</div>

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                       GaiaAgent                            │
│                                                            │
│  ┌──────────────────┐       ┌────────────────────────┐    │
│  │  React Frontend   │       │  Backend               │    │
│  │  CesiumJS Viewer  │◄─────┤  Tauri (Rust IPC)      │    │
│  │  Chat Panel       │       │  — or —                │    │
│  │  Plan Cards       │       │  Node.js (WebSocket)   │    │
│  └──────────────────┘       └──────────┬─────────────┘    │
│                                         │                  │
│                              ┌──────────▼─────────────┐   │
│                              │  cesium-mcp-runtime     │   │
│                              │  (Node.js, port 9100)   │   │
│                              └──────────┬─────────────┘   │
│                                         │ WebSocket       │
│                              ┌──────────▼─────────────┐   │
│                              │  cesium-mcp-bridge      │   │
│                              │  (Browser SDK)          │   │
│                              └──────────┬─────────────┘   │
│                                         │                  │
│                              ┌──────────▼─────────────┐   │
│                              │  CesiumJS Viewer        │   │
│                              │  (3D Globe)             │   │
│                              └────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

## Two Editions

| | Tauri Desktop | Web UI |
|---|---|---|
| Path | [`examples/tauri-app/`](examples/tauri-app/) | [`examples/web_ui/`](examples/web_ui/) |
| Backend | Rust (Tauri IPC) | Node.js (Express + WebSocket) |
| Packaging | ~15 MB binary | Browser-based |
| LLM Call | Rust HTTP → OpenAI-compat API | Node.js `openai` / `@anthropic-ai/sdk` |
| MCP | HTTP `/api/command` | stdio MCP protocol |

## Quick Start (Tauri)

```bash
cd examples/tauri-app
cp .env.example .env   # configure LLM provider
npm install
npm run tauri:dev
```

## Quick Start (Web UI)

```bash
# Backend
cd examples/web_ui/backend
cp .env.example .env   # configure LLM provider
npm install
npm run dev

# Frontend (separate terminal)
cd examples/web_ui/frontend
npm install
npm run dev
```

## LLM Providers

Set `LLM_PROVIDER` in `.env`:

| Provider | Value | Notes |
|----------|-------|-------|
| Ollama | `ollama` | Local, no API key needed |
| OpenAI | `openai` | `OPENAI_API_KEY` required |
| OpenAI-compatible | `openai_compat` | LM Studio / vLLM / LocalAI |
| DashScope | `dashscope` | Alibaba Qwen |
| DeepSeek | `deepseek` | DeepSeek API |
| Anthropic | `anthropic` | Claude |

## Available Tools (via cesium-mcp)

49 tools across 12 toolsets: `view`, `entity`, `layer`, `interaction`, `camera`, `entity-ext`, `animation`, `tiles`, `trajectory`, `heatmap`, `scene`, `geolocation`.

Set `CESIUM_TOOLSETS=all` in `.env` to enable everything.

## Project Structure

```
GaiaAgent/
├── examples/
│   ├── tauri-app/              # Tauri 2 + React desktop app
│   │   ├── src/                # React frontend (CesiumViewer + ChatPanel)
│   │   └── src-tauri/          # Rust backend
│   └── web_ui/
│       ├── backend/            # Node.js + Express + WebSocket server
│       ├── frontend/           # React frontend (shared components)
│       └── static/             # Pre-built frontend assets
├── .env.example
└── README.md
```

## License

MIT
