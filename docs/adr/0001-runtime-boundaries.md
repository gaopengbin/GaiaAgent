# ADR 0001：现代化重构的运行时边界

- 状态：Accepted，2026-07-02 更新
- 日期：2026-06-30

## 决策

Agent Runtime 位于 Rust/Tauri 后端。React WebView 只负责：

- 发送用户目标；
- 展示版本化 `AgentEvent`；
- 处理用户审批、取消和设置输入；
- 消费 Cesium bridge 的场景快照。

模型请求、provider adapter、MCP lifecycle、工具执行、预算、超时、取消、审批策略和 trace 持久化都归 Rust 后端管理。

## 原因

- 后端统一拥有网络、凭据、MCP 进程和取消句柄。
- UI 刷新或组件重挂载不会破坏运行状态。
- 不可信 WebView 与本机能力之间保持清晰策略边界。
- 会话事件可以被 SQLite trace store 持久化和导出。

## 当前状态

迁移窗口已关闭。前端旧 Agent loop 和兼容 UI 已删除，Native Runtime 是唯一运行时。

## 后果

- Provider 和 MCP 行为可以用 Rust 单元/集成测试覆盖。
- UI 只需要围绕事件协议演进。
- 高风险能力在执行前由后端审批门控制。
