<div align="center">
  <h1>GaiaAgent（盖亚）</h1>
  <p><strong>AI 驱动的 3D GIS 助手</strong></p>
  <p>用自然语言与 <a href="https://cesium.com/">CesiumJS</a> 3D 地球对话，由 LLM 和 <a href="https://github.com/gaopengbin/cesium-mcp">cesium-mcp</a> 驱动。</p>
</div>

---

## 架构

```
┌────────────────────────────────────────────────────────────┐
│                       GaiaAgent                            │
│                                                            │
│  ┌──────────────────┐       ┌────────────────────────┐    │
│  │  React 前端       │       │  后端                  │    │
│  │  CesiumJS 地图    │◄─────┤  Tauri (Rust IPC)      │    │
│  │  聊天面板         │       │  — 或 —                │    │
│  │  计划卡片         │       │  Node.js (WebSocket)   │    │
│  └──────────────────┘       └──────────┬─────────────┘    │
│                                         │                  │
│                              ┌──────────▼─────────────┐   │
│                              │  cesium-mcp-runtime     │   │
│                              │  (Node.js, 端口 9100)   │   │
│                              └──────────┬─────────────┘   │
│                                         │ WebSocket       │
│                              ┌──────────▼─────────────┐   │
│                              │  cesium-mcp-bridge      │   │
│                              │  (浏览器 SDK)           │   │
│                              └──────────┬─────────────┘   │
│                                         │                  │
│                              ┌──────────▼─────────────┐   │
│                              │  CesiumJS Viewer        │   │
│                              │  (3D 地球)              │   │
│                              └────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

## 两个版本

| | 桌面版 (Tauri) | 网页版 (Web UI) |
|---|---|---|
| 路径 | [`examples/tauri-app/`](examples/tauri-app/) | [`examples/web_ui/`](examples/web_ui/) |
| 后端 | Rust (Tauri IPC) | Node.js (Express + WebSocket) |
| 打包 | ~15 MB 二进制 | 浏览器直接访问 |
| LLM 调用 | Rust HTTP → OpenAI 兼容 API | Node.js `openai` / `@anthropic-ai/sdk` |
| MCP | HTTP `/api/command` | stdio MCP 协议 |

## 快速开始（桌面版）

```bash
cd examples/tauri-app
cp .env.example .env   # 配置 LLM 提供商
npm install
npm run tauri:dev
```

## 快速开始（网页版）

```bash
# 后端
cd examples/web_ui/backend
cp .env.example .env   # 配置 LLM 提供商
npm install
npm run dev

# 前端（另开终端）
cd examples/web_ui/frontend
npm install
npm run dev
```

## 支持的 LLM

在 `.env` 中设置 `LLM_PROVIDER`：

| 提供商 | 值 | 说明 |
|----------|-------|-------|
| Ollama | `ollama` | 本地部署，无需 API 密钥 |
| OpenAI | `openai` | 需要 `OPENAI_API_KEY` |
| OpenAI 兼容 | `openai_compat` | LM Studio / vLLM / LocalAI |
| 通义千问 | `dashscope` | 阿里云 DashScope |
| DeepSeek | `deepseek` | DeepSeek API |
| Anthropic | `anthropic` | Claude |

## 可用工具（via cesium-mcp）

12 个工具集共 49 个工具：`view`、`entity`、`layer`、`interaction`、`camera`、`entity-ext`、`animation`、`tiles`、`trajectory`、`heatmap`、`scene`、`geolocation`。

在 `.env` 中设置 `CESIUM_TOOLSETS=all` 启用全部工具。

## 项目结构

```
GaiaAgent/
├── examples/
│   ├── tauri-app/              # Tauri 2 + React 桌面应用
│   │   ├── src/                # React 前端（CesiumViewer + 聊天面板）
│   │   └── src-tauri/          # Rust 后端
│   └── web_ui/
│       ├── backend/            # Node.js + Express + WebSocket 服务
│       ├── frontend/           # React 前端（共享组件）
│       └── static/             # 预构建的前端资源
├── .env.example
└── README.md
```

## 许可证

MIT
