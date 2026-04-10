# GaiaAgent 上下文记忆系统设计

> 版本: v1.0 | 2025-07-29

## 一、问题陈述

当前 GaiaAgent 每次 `sendText()` 调用 `planFromGoal()` 时，只向 LLM 发送 `system` + `user` 两条消息。`contextRef` 仅保留最后一步工具执行结果的前 500 字符，效果极差——用户说"降低高度"，LLM 不知道当前相机在哪。

**目标**：让 LLM 在规划时感知完整的对话上下文，包括：
1. 之前的对话轮次（用户说了什么、Agent 做了什么）
2. 当前地图场景状态（相机位置、已加载的图层、标注等）

## 二、参考架构

GeoAgent (Python 版) 的上下文方案：
- DB 存对话历史，每次加载最近 20 条，每条截断 2000 字符
- `SessionDataContext` 管理数据资产（GeoJSON），通过 `data_ref_id` 引用
- `_build_context_prompt()` 将数据资产元信息动态注入 System Prompt
- LangGraph ReAct 循环让 LLM 逐步看到工具结果

**Tauri 版差异**：
- 数据活在 CesiumJS 浏览器端，Rust 后端是薄代理，不存数据
- Plan-Execute 模式（非 ReAct），LLM 只在规划阶段参与
- 桌面应用，不需要 DB，内存即可

## 三、数据结构设计

### 3.1 新增类型 (`agent/types.ts`)

```ts
/** 单轮对话记录 */
interface ConversationEntry {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/** 场景中的图层 */
interface SceneLayer {
  id: string
  type: string       // 'geojson' | '3dtiles' | 'imagery' | 'terrain'
  source: string     // 来源描述，如 "flyTo 故宫"
}

/** 场景中的标注 */
interface SceneLabel {
  text: string
  lat: number
  lon: number
}

/** 相机状态 */
interface CameraState {
  lat: number
  lon: number
  height: number
}

/** 完整场景状态 */
interface SceneState {
  camera: CameraState | null
  layers: SceneLayer[]
  labels: SceneLabel[]
}
```

### 3.2 存储位置

| 数据 | 容器 | 位置 |
|------|------|------|
| `ConversationEntry[]` | `useRef` | `useTauriAgent.ts` |
| `SceneState` | `useRef` | `useTauriAgent.ts` |

页面刷新清空，无需持久化。

## 四、新增模块 `agent/history.ts`

约 100 行代码，4 个核心函数：

### 4.1 `appendUserEntry(history, text)`

```ts
function appendUserEntry(
  history: ConversationEntry[],
  text: string,
): void {
  history.push({ role: 'user', content: text, timestamp: Date.now() })
}
```

### 4.2 `appendAssistantEntry(history, plan, steps)`

从计划执行结果构造精简摘要：

```ts
function appendAssistantEntry(
  history: ConversationEntry[],
  plan: Plan,
  steps: PlanStep[],
): void {
  const lines = [`目标: ${plan.goal}`]
  for (const s of steps) {
    const status = s.status === 'done' ? 'OK' : 'FAIL'
    const output = s.result?.output
      ? `: ${s.result.output.slice(0, 200)}`
      : ''
    lines.push(`  ${s.id}. ${s.tool} [${status}]${output}`)
  }
  const content = lines.join('\n')
  history.push({ role: 'assistant', content, timestamp: Date.now() })
}
```

### 4.3 `buildHistoryMessages(history, opts?)`

将 `ConversationEntry[]` 转为 `LlmMessage[]`，带截断：

```ts
interface HistoryOptions {
  maxEntries?: number       // 默认 10（最近 10 轮 = 20 条消息）
  maxEntryLength?: number   // 默认 800 字符/条
}

function buildHistoryMessages(
  history: ConversationEntry[],
  opts?: HistoryOptions,
): LlmMessage[] {
  const max = opts?.maxEntries ?? 10
  const maxLen = opts?.maxEntryLength ?? 800
  // 取最近 max*2 条（user+assistant 成对）
  const recent = history.slice(-(max * 2))
  return recent.map(e => ({
    role: e.role,
    content: e.content.length > maxLen
      ? e.content.slice(0, maxLen) + '\n...(truncated)'
      : e.content,
  }))
}
```

**Token 预算估算**：$10 \times 2 \times 800 = 16000$ 字符 $\approx 8\text{K} \sim 16\text{K}$ token。4K 模型会紧张，8K+ 模型安全。

### 4.4 `updateSceneState(state, step)`

从工具执行结果推断场景变化：

```ts
function updateSceneState(state: SceneState, step: PlanStep): void {
  const p = step.params ?? {}
  switch (step.tool) {
    case 'flyTo':
    case 'setView':
      if (p.latitude && p.longitude) {
        state.camera = {
          lat: p.latitude as number,
          lon: p.longitude as number,
          height: (p.height ?? p.altitude ?? 10000) as number,
        }
      }
      break
    case 'addGeoJsonLayer':
      state.layers.push({
        id: (p.id ?? p.name ?? `layer-${state.layers.length}`) as string,
        type: 'geojson',
        source: step.description,
      })
      break
    case 'addLabel':
    case 'addMarker':
      if (p.latitude && p.longitude) {
        state.labels.push({
          text: (p.text ?? p.label ?? '') as string,
          lat: p.latitude as number,
          lon: p.longitude as number,
        })
      }
      break
    case 'removeAll':
    case 'clearEntities':
      state.layers = []
      state.labels = []
      break
    // 后续可按需扩展
  }
}
```

### 4.5 `formatSceneContext(state)`

生成注入 System Prompt 的场景描述：

```ts
function formatSceneContext(state: SceneState): string {
  const lines: string[] = []
  if (state.camera) {
    lines.push(`Camera: lat=${state.camera.lat}, lon=${state.camera.lon}, height=${state.camera.height}m`)
  }
  if (state.layers.length) {
    lines.push('Layers on map:')
    for (const l of state.layers) {
      lines.push(`  - "${l.id}" (${l.type}) — ${l.source}`)
    }
  }
  if (state.labels.length) {
    lines.push('Labels on map:')
    for (const lb of state.labels) {
      lines.push(`  - "${lb.text}" at (${lb.lat}, ${lb.lon})`)
    }
  }
  return lines.length ? '\n\nCurrent scene state:\n' + lines.join('\n') : ''
}
```

## 五、现有模块改动

### 5.1 `agent/planner.ts`

签名变更——`context: string | null` → `history: LlmMessage[]`, `sceneContext: string`：

```diff
- export async function planFromGoal(
-   goal: string,
-   tools: ToolSchema[],
-   context: string | null,
-   settings: ModelSettings,
- ): Promise<Plan> {
+ export async function planFromGoal(
+   goal: string,
+   tools: ToolSchema[],
+   history: LlmMessage[],
+   sceneContext: string,
+   settings: ModelSettings,
+ ): Promise<Plan> {
    const toolsHint = formatToolSchemas(tools)
-   const systemContent = 'You are a GIS planning assistant.' + SYSTEM_SUFFIX + toolsHint
+   const systemContent = 'You are a GIS planning assistant.'
+     + SYSTEM_SUFFIX + toolsHint + sceneContext
-   let userContent = `Create a plan for: ${goal}`
-   if (context) {
-     userContent += `\n\nContext from previous actions:\n${context}`
-   }
+   const userContent = `Create a plan for: ${goal}`
    const raw = await callLlm(
      [
        { role: 'system', content: systemContent },
+       ...history,
        { role: 'user', content: userContent },
      ],
      settings,
    )
    return parsePlanJson(raw, goal)
  }
```

**关键变化**：
1. 历史以**真正的多轮 user/assistant 消息**注入，而非拼接到 user prompt
2. 场景状态注入 system prompt 末尾（和 GeoAgent 的 context_prompt 同理）
3. 删除 `context` 字符串参数

### 5.2 `hooks/useTauriAgent.ts`

```diff
  // 替换
- const contextRef = useRef<string | null>(null)
+ const historyRef = useRef<ConversationEntry[]>([])
+ const sceneRef = useRef<SceneState>({ camera: null, layers: [], labels: [] })

  // sendText 内部
  const sendText = useCallback(async (text: string) => {
+   appendUserEntry(historyRef.current, text)
+   const historyMsgs = buildHistoryMessages(historyRef.current)
+   const sceneCtx = formatSceneContext(sceneRef.current)

    const plan = await planFromGoal(
      text,
      toolsRef.current,
-     contextRef.current,
+     historyMsgs,
+     sceneCtx,
      settingsRef.current,
    )

    // ... 执行 plan ...

    // 执行后追加 assistant 条目
+   appendAssistantEntry(historyRef.current, plan, plan.steps)

    // 步骤回调中更新场景状态
    await executePlan(plan, (step) => {
+     if (step.status === 'done') {
+       updateSceneState(sceneRef.current, step)
+     }
      // ... 现有 UI 更新逻辑 ...
    })

    // 删除所有 contextRef.current = ... 赋值
  }, [isBusy])
```

### 5.3 `agent/index.ts`

新增导出：

```diff
+ export {
+   appendUserEntry,
+   appendAssistantEntry,
+   buildHistoryMessages,
+   updateSceneState,
+   formatSceneContext,
+ } from './history'
+ export type { ConversationEntry, SceneState } from './types'
```

## 六、消息流示意

```
第1轮: "飞到故宫"
  LLM 收到:
    system: "You are a GIS planning assistant..." + tools + ""
    user: "Create a plan for: 飞到故宫"/
  LLM 返回: {steps: [{tool: "flyTo", params: {lat: 39.92, lon: 116.39, height: 1000}}]}
  
第2轮: "降低高度"
  LLM 收到:
    system: "You are a GIS planning assistant..." + tools +
            "\n\nCurrent scene state:\nCamera: lat=39.92, lon=116.39, height=1000m"
    user(历史): "Create a plan for: 飞到故宫"
    assistant(历史): "目标: 飞到故宫\n  1. flyTo [OK]: Camera flew to target position"
    user(当前): "Create a plan for: 降低高度"
  LLM 返回: {steps: [{tool: "setView", params: {lat: 39.92, lon: 116.39, height: 200}}]}
```

## 七、截断策略汇总

| 机制 | 值 | 说明 |
|------|---|------|
| 历史轮数 | 最近 10 轮 (20条消息) | 超出自动丢弃最早的 |
| 单条长度 | 800 字符 | 超长截断 + `...(truncated)` |
| 估算 token 预算 | ~16K 字符 ≈ 8-16K token | 8K+ 窗口模型安全 |
| 工具结果摘要 | 200 字符/步 | 只取 `result.output` 前 200 字符 |

## 八、实施顺序

| Phase | 文件 | 改动 | 行数 |
|-------|------|------|------|
| 1 | `agent/types.ts` | 新增 ConversationEntry, SceneState 等类型 | +25 |
| 2 | `agent/history.ts` | **新建**，5 个函数 | ~100 |
| 3 | `agent/planner.ts` | 改签名，注入历史+场景 | ~10 行改动 |
| 4 | `hooks/useTauriAgent.ts` | contextRef → historyRef+sceneRef | ~20 行改动 |
| 5 | `agent/index.ts` | 新增导出 | +5 |

**验证**：
1. `npx tsc --noEmit` 编译通过
2. 发两轮请求，确认第二轮 LLM messages 包含第一轮历史
3. 连续 10 轮后检查 messages 总长度在合理范围

## 九、未来扩展

- **ReAct 模式**：将 Plan-Execute 改为循环，让 LLM 逐步看到工具结果决策下一步
- **持久化**：对话历史写入 `~/.config/GaiaAgent/history/` 支持跨重启恢复
- **场景快照**：从 CesiumJS Bridge 直接获取精确场景状态，而非从工具参数推断
- **丰富 System Prompt**：移植 GeoAgent 的领域 prompt（工具策略、数据引用规则、few-shot 示例）
