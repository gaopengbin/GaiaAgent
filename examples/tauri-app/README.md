# GaiaAgent — Tauri Desktop App

> 轻量级桌面版 AI GIS 助手（参考 note-gen 架构，~15MB 安装包）

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  Tauri 外壳 (Rust, ~3MB)                                │
│  ┌──────────────────────┐  ┌────────────────────────┐  │
│  │ WebView (前端)        │  │ Rust 后端              │  │
│  │ React + CesiumJS     │◄─┤ Tauri IPC invoke/emit  │  │
│  │ useBridgeWS → 9100   │  │ HTTP relay → /api/relay│  │
│  └──────────────────────┘  └────────────┬───────────┘  │
│                                          │ spawn        │
│                             ┌────────────▼───────────┐  │
│                             │ cesium-mcp-runtime     │  │
│                             │ (npx, port 9100)       │  │
│                             │ WebSocket bridge       │  │
│                             └────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 对比 web_ui（Node.js 版）

| 特性 | web_ui (Node.js) | tauri-app (Rust) |
|------|-----------------|-----------------|
| 打包大小 | ~80MB (Node.js) | ~15MB |
| IPC 机制 | WebSocket 8000 | Tauri invoke/event |
| MCP 工具调用 | stdio protocol | HTTP /api/relay |
| 工具列表 | stdio + callTool | HTTP /api/tools |
| LLM 调用 | openai npm | reqwest (Rust) |
| 桥接 WS | 9100 | 9100（不变） |

## 前提条件

- Rust 1.77+ + Cargo
- Node.js 18+
- Ollama（本地 LLM）或配置 API key

## 开发

```bash
# 1. 安装前端依赖
npm install

# 2. 复制环境变量
cp .env.example .env
# 编辑 .env 配置 LLM_PROVIDER / OLLAMA_HOST 等

# 3. 启动开发模式（Vite + Tauri）
npm run tauri:dev
```

## 生产构建

```bash
npm run tauri:build
# 输出: src-tauri/target/release/bundle/
```

## 环境变量

创建 `.env` 文件（放在 tauri-app/ 根目录，打包时内嵌到 app 目录）：

```env
LLM_PROVIDER=ollama          # ollama | dashscope | deepseek | openai
OLLAMA_HOST=localhost:11434
MODEL_NAME=qwen2.5:7b
# DASHSCOPE_API_KEY=sk-...
# DEEPSEEK_API_KEY=sk-...
# OPENAI_API_KEY=sk-...
CESIUM_WS_PORT=9100
```

## 文件结构

```
tauri-app/
├── src-tauri/
│   ├── src/lib.rs          Rust 命令：start_runtime, list_tools, call_tool, process_goal
│   ├── Cargo.toml          依赖：tauri, reqwest, tokio, serde, dotenvy
│   └── tauri.conf.json     窗口配置
├── src/
│   ├── App.tsx             主布局
│   ├── hooks/
│   │   ├── useTauriAgent.ts  替代 WebSocket，使用 Tauri invoke/listen
│   │   └── useBridgeWS.ts    连接 cesium-mcp-runtime bridge (9100)
│   └── components/         从 web_ui/frontend 复用
└── public/
    └── cesium-mcp-bridge.browser.global.js
```
