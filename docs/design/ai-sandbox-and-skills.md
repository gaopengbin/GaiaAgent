# AI 沙盒与技能自修复机制

> 状态：Phase 0 设计 + 最小后端骨架  
> 目标：让 AI 能安全地修复配置、完善技能、接入能力，但不能绕过用户授权或写任意文件。

## 1. 当前结论

GaiaAgent 已经有工具风险分级、审批模式和 MCP 启动校验，但这不是完整沙盒。当前机制能回答“这个工具调用要不要确认”，还不能完整回答：

- AI 可以改哪些配置？
- 修改前如何预览 diff？
- 修改后如何验证？
- 出错后如何回滚？
- 技能包能声明哪些权限？

因此需要在现有审批闸门之外增加“受控配置沙盒”。

## 2. 边界原则

1. AI 不直接写任意路径。
2. 可修复对象必须在 Host 侧注册为能力目标。
3. 每次修改先进入沙盒补丁记录。
4. 补丁应用前必须通过 schema/语义校验。
5. 应用前生成备份，保留审计信息。
6. 自动模式也只能自动应用“沙盒允许范围内”的低风险配置。

## 3. 第一批受控目标

| Target | 文件 | 用途 | 自动应用建议 |
|---|---|---|---|
| `model-settings` | `model_settings.json` | Provider、base URL、模型、上下文策略、审批模式 | 否 |
| `mcp-servers` | `mcp_servers.json` | MCP server 列表、命令、参数、环境变量、远程 endpoint | 否 |

这些目标都位于 GaiaAgent 的应用配置目录，不接受来自模型的自定义路径。

## 4. 标准流程

```text
检测问题
  ↓
AI 生成候选配置
  ↓
Host 校验目标与 JSON schema
  ↓
写入 sandbox/patches/{patch_id}.json
  ↓
UI 展示 diff 和风险说明
  ↓
用户确认或策略自动允许
  ↓
备份当前配置到 sandbox/backups/
  ↓
原子写入真实配置
  ↓
重载服务或提示重启
```

## 5. 技能包草案

后续技能包可以采用：

```text
skills/
  mcp-repair/
    skill.json
    prompts.md
    repair-rules.json
    tests/
```

`skill.json` 应声明：

```json
{
  "id": "mcp-repair",
  "name": "MCP 配置修复",
  "version": "0.1.0",
  "permissions": {
    "configTargets": ["mcp-servers"],
    "tools": ["mcp_load_config", "mcp_start_server"],
    "network": false,
    "process": false
  },
  "validation": {
    "dryRun": true,
    "requiresUserApproval": true
  }
}
```

技能声明只描述能力边界；最终授权仍由 Host 的沙盒和审批策略决定。

## 6. 典型自修复场景

- MCP 配置里 `npx` 在 Windows 下不可用：AI 生成改用应用托管运行时的配置，Host 校验并展示 diff。
- CC Switch base URL 缺失：AI 生成默认本地 base URL，Host 校验 provider 和模型字段。
- 远程 MCP URL 不安全：Host 拒绝非 HTTPS/非本地 HTTP。
- 配置 JSON 损坏：Host 读取失败后让 AI 基于模板生成候选配置，用户确认后恢复。

## 7. 后续路线

1. 前端增加 SandboxReviewDialog，展示补丁 diff、原因、目标、风险和应用按钮。
2. Agent Runtime 增加 `config_prepare_patch` 工具，但默认需要审批。
3. MCP 设置页和模型设置页增加“AI 修复”入口。
4. 技能注册表支持安装、启用、禁用和自检。
5. 配置应用后触发对应模块热重载，例如 MCP server 重启或 provider health check。
