# Context memory（已归档）

状态：Archived
归档日期：2026-07-02

这份文档曾用于讨论前端对话上下文和场景摘要。当前项目已经改为：

- Rust Native Runtime 持有 provider turn history。
- SQLite trace store 记录 run、事件、用量和诊断导出。
- Cesium scene state 由 bridge snapshot 和 `scene-state.ts` 维护。
- 长期记忆仍需要用户显式启用，尚不默认写入。

当前权威实现请参考：

- `src-tauri/src/agent/`
- `src-tauri/src/telemetry.rs`
- `src/agent/scene-state.ts`
- `docs/testing/e2e-matrix.md`
