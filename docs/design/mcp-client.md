# MCP 客户端集成方案

> 状态：待实施 | 优先级：中 | 创建日期：2026-04-02

## 背景

GaiaAgent 当前仅通过 CesiumBridge（自定义 WebSocket 协议）提供地理空间工具。
用户无法通过 UI 添加额外的 MCP 服务（如 Web 搜索、Geocoding 等）。

### 现状

| 组件 | 接入方式 | 用户可配置 |
|------|----------|-----------|
| CesiumBridge | WebSocket ws://127.0.0.1:9102 | 否 |
| LLM (Ollama/OpenAI) | HTTP/SSE | 是（设置界面） |
| 其他 MCP 服务 | 不存在 | 无此功能 |

## 参考实现：NoteGen (codexu/note-gen)

NoteGen（11k+ stars, Tauri + Next.js）已实现完整的 MCP 客户端：

### Rust 后端

**`mcp.rs`** — MCP 服务器进程管理（~200 行）：
- `McpServerManager` — HashMap<server_id, Child> 进程池
- `start_mcp_stdio_server(server_id, command, args, env)` — 启动 stdio 类型 MCP 服务器
- `stop_mcp_server(server_id)` — 停止服务器
- `send_mcp_message(server_id, message)` — JSON-RPC 消息收发
- 支持 JSON Line 和 Content-Length framed 两种消息格式

**`mcp_runtime.rs`** — 运行时环境检测与安装：
- 检测 npx/uvx/python/bunx 可用性
- 各平台一键安装方案
- 安装进度通过 Tauri event 推送前端

### 前端

- MCP 服务器配置 UI（server_id, command, args, env）
- 运行时检测结果展示 + 一键安装

## GaiaAgent 实施方案

### 阶段一：Rust MCP 客户端

参考 NoteGen `mcp.rs`，在 `src-tauri/src/` 新增：
- `mcp.rs` — stdio 进程管理 + JSON-RPC 通信
- Tauri commands: `start_mcp_server`, `stop_mcp_server`, `send_mcp_message`
- 工具发现：`tools/list` JSON-RPC 调用

### 阶段二：前端集成

1. **设置界面扩展**：新增 MCP 标签页，管理服务器配置
2. **工具动态注入**：MCP 服务器的工具通过 `tools/list` 发现后，注入到 Planner 的 system prompt
3. **Executor 分发**：执行计划时，根据 tool name 路由到 CesiumBridge 或 MCP 服务器

### 阶段三：预设 MCP 服务

预配置一些常用 MCP 服务器，降低用户使用门槛：
- Geocoding（地理编码，地名 → 坐标）
- Web Search（通用搜索增强）
- File System（本地文件访问）

## 优先级建议

1. Geocoding API（最高优先，直接提升核心 GIS 能力）
2. MCP 客户端架构（中优先，提供通用扩展能力）
3. Web Search MCP（低优先，知识增强）

## 相关资源

- NoteGen 源码：https://github.com/codexu/note-gen
- MCP 协议规范：https://modelcontextprotocol.io/
- VS Code MCP 文档：https://code.visualstudio.com/docs/copilot/chat/mcp-servers
