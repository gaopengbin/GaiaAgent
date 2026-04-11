# cesium-mcp-runtime 改进建议

> 本文档记录 GaiaAgent 集成过程中发现的 cesium-mcp-runtime 改进点，待在 cesium-mcp 项目中实施。

---

## 1. Tianditu Token 自动注入

### 问题

`setBasemap` 工具的 `token` 参数是 optional，天地图底图（`tianditu_vec` / `tianditu_img`）需要 token 才能加载。当前完全依赖 LLM 每次调用时显式传入 token——不靠谱，LLM 经常遗漏。

### 现有链路

```
AI Agent 调用 setBasemap(basemap:"tianditu_vec", token:"xxx")
  → runtime 透传参数 → bridge layer.ts → basemap-presets.ts → 拼入 URL &tk=xxx
```

### 建议方案

**runtime 侧读取 `process.env.TIANDITU_TOKEN`，自动填充缺失的 token：**

```typescript
// index.ts — setBasemap handler 内，sendToBrowser 之前
if (params.basemap?.startsWith('tianditu_') && !params.token) {
  params.token = process.env.TIANDITU_TOKEN || '';
}
```

**MCP 配置侧通过 `env` 字段注入（符合 MCP 规范）：**

```json
{
  "cesium-mcp": {
    "command": "node",
    "args": ["path/to/dist/index.js"],
    "env": {
      "TIANDITU_TOKEN": "你的token"
    },
    "enabled": true
  }
}
```

### 涉及文件

| 文件 | 行号 | 说明 |
|------|------|------|
| `runtime/src/index.ts` | L733-741 | setBasemap 工具定义 + handler |
| `bridge/src/commands/layer.ts` | L825-847 | setBasemap 执行，`params.token ?? ''` |
| `bridge/src/commands/basemap-presets.ts` | L40-49 | 天地图 URL 模板，`tk` 参数拼入 |

### 扩展

同模式可用于其他需要 API Key 的底图服务：

| 环境变量 | 用途 |
|----------|------|
| `TIANDITU_TOKEN` | 天地图底图 |
| `MAPBOX_TOKEN` | Mapbox 底图（如需支持） |
| `ARCGIS_API_KEY` | ArcGIS 底图（如需支持） |

---

## 2. CLI 参数扩展（可选）

当前 runtime 仅支持 `--transport` 和 `--port` 两个 CLI 参数。可考虑扩展：

```bash
node dist/index.js --tianditu-token=xxx --mapbox-token=xxx
```

`_parseArg()` 已有解析模式可参考（L1954-1957），扩展成本低。

优先级低于环境变量方案——MCP 规范原生支持 `env`，CLI 参数只是补充。

---

## 3. 工具描述增强（建议）

当前 `setBasemap` 的 `token` 参数 describe 为"底图服务令牌（天地图等需要认证的服务必填）"。

如果实现了自动注入，建议更新为：

```typescript
token: z.string().optional().describe(
  '底图服务令牌。天地图底图可通过 TIANDITU_TOKEN 环境变量自动注入，也可在此显式传入'
)
```
