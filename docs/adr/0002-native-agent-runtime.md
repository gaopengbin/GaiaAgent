# ADR 0002：Native Agent Runtime 与 Provider Adapter

- 状态：Accepted，2026-07-02 更新
- 日期：2026-07-01

## 背景

项目需要稳定支持多 provider tool calling、MCP 工具、审批、取消、预算和可观测性。把这些能力放在 WebView 中会扩大权限边界，并让凭据、网络和进程生命周期难以统一治理。

## 决策

1. Agent 状态机运行在 Tauri/Rust 后端。
2. Provider 使用统一的 `ProviderTurn`、`NativeToolCall`、`ProviderToolResult` 和 `ProviderEvent` 边界。
3. OpenAI 使用 Responses API function tools；Anthropic 使用 Messages API tool use；Ollama 使用 chat tools。
4. 必要的 provider continuation 使用受限 opaque state 保存，不在不同 provider 间交叉转发。
5. 工具执行受轮次、调用次数、token、超时、取消和审批策略约束。
6. Native Runtime 聚合受控 Cesium bridge 工具和已连接 MCP 工具；同名工具优先使用受控 bridge。

## 后果

- 模型不需要生成可执行文本计划。
- API key 只在 Rust 后端从系统凭据库读取。
- WebView 不再直接执行工具或持有 provider credential。
- 行为基线由 Rust runtime tests、MCP contract tests 和 E2E 矩阵维护。
