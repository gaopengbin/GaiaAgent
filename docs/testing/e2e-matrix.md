# GaiaAgent E2E 测试矩阵

本矩阵用于 1.0 前的候选版本冒烟验证。自动化优先覆盖确定性链路；需要外部服务或人工凭据的项目保留为发布候选手工检查。

## 自动化门禁

| 范围 | 命令/证据 | 覆盖 |
| --- | --- | --- |
| Web 类型、lint、格式、单测 | `npm run check:web` | AgentEvent reducer、工具策略、runtime parity、场景 patch、React/TS 编译 |
| Rust 单测与集成 | `cargo test --manifest-path src-tauri/Cargo.toml` | Provider adapters、native runtime 状态机、MCP contract、trace redaction |
| Rust lint | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | Rust API、错误处理与 dead code |
| MCP contract | `npm run test:mcp-contract` | local stdio、remote Streamable HTTP、tools/list change、progress、protocol cancellation |
| Scene performance | `tests/fixtures/scene-performance.html` | 50k GeoJSON primitive load、scene snapshot、asset registry cleanup |
| SBOM | `npm run sbom` | npm CycloneDX + Cargo metadata artifacts under `dist/sbom/` |

## 候选版本手工 E2E

| 场景 | 环境 | 步骤 | 通过标准 |
| --- | --- | --- | --- |
| Native 单轮 GIS 工具 | Ollama 本地模型或 OpenAI-compatible 测试 key | 发送“定位上海并添加标记” | Native runtime 完成；工具 timeline 显示 requested/running/completed；场景出现标记 |
| 高风险工具审批 | 任意 provider | 触发删除/清空/export 类工具 | UI 显示风险审批；拒绝后工具不执行；批准后 trace 记录审批与结果 |
| MCP 本地服务 | stdio MCP server | 启用 server，发送使用 MCP 工具的请求 | 工具列表动态刷新；Native runtime 能调用 MCP 工具；取消时发送 protocol cancellation |
| MCP 远程 OAuth | Streamable HTTP + OAuth 测试 server | 完成 PKCE 授权并调用工具 | 凭据存入系统 keyring；重启后无需重新授权；elicitation 弹窗可响应 |
| 用户取消 | 慢 provider 或慢工具 | 流式输出/工具执行中点击停止 | provider 请求、MCP call、UI busy 状态均停止；trace 状态为 cancelled |
| 诊断导出 | 任意完成会话 | 设置 → Trace → 导出当前会话 | 生成 JSON；不包含 API key/token/password/authorization 明文 |
| 应用重启恢复 | 完成一次 GIS 操作后重启 | 打开应用并查看 trace / 场景上下文 | 最近会话可见；后续请求能获得稳定场景摘要 |
| 发布包安装 | Windows/macOS/Linux release artifact | 安装并首次启动 | 无缺失资源；Cesium bridge 可连接；CSP 无明显 runtime violation |

## 记录要求

- 每个 release candidate 在发布说明中附上自动化命令输出摘要。
- 手工 E2E 记录平台、provider、模型、MCP server、是否使用代理。
- 阻断级回归必须补自动化测试或在本矩阵中新增显式检查项。

## Recent automated acceptance additions

| Scope | Command / evidence | Coverage |
| --- | --- | --- |
| Replan continuation audit chain | `npm run test -- src/agent/event-reducer.test.ts` | In-run task tail replacement via `task.plan.steps_replanned`, `run.continued` metadata, linked tool execution, artifact refs, and final plan completion. |
| Scene workbench object lifecycle | `npm run test -- src/agent/scene-state.test.ts` | Tool snapshot to ScenePanel state, active/recent refs, visibility update, deletion cleanup, and protected import defaults. |
| Native SceneState lifecycle | `cargo test --manifest-path src-tauri/Cargo.toml --lib scene_workbench_backend_lifecycle_keeps_state_refs_and_protection_consistent` | Backend authoritative SceneState refs, focus/recent tracking, visibility updates, lock/unlock protection, bulk AI cleanup targeting, and imported object preservation. |

## Release-candidate scene workbench checklist

Run `docs/testing/scene-workbench-e2e.md` for the manual release-candidate path covering object creation, Scene panel management, protected imported objects, session restore, and same-run replan continuation.
