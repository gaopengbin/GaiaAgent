# Agent loop redesign（已归档）

状态：Archived
归档日期：2026-07-02

这份文档曾用于记录前端 Agent loop 的阶段性改造思路。当前实现已经切换为 Rust Native Runtime：

- WebView 只负责发送用户目标、显示 `AgentEvent` timeline、处理审批/取消。
- 模型 provider、tool loop、预算、超时、审批和 MCP 工具路由都在 Rust 后端执行。
- 前端不再直接调用模型，也不再解析模型输出的计划文本。

当前权威设计请参考：

- `docs/design/gaiaagent-modernization-roadmap.md`
- `docs/adr/0002-native-agent-runtime.md`
- `src-tauri/src/agent/`
- `src/hooks/useTauriAgent.ts`
