# Agent 循环架构重设计

> 状态：Implemented (Phase 1-3)  
> 日期：2026-04-03  
> 上下文：当前 Plan-Execute 单轮架构存在盲飞、无纠错、参数依赖等结构性问题

---

## 一、现状分析

### 1.1 当前数据流

```
用户输入
  → appendUserEntry (对话历史)
  → planFromGoal (单次 LLM 调用)
      ├─ selectToolsForQuery (关键词筛选工具子集)
      ├─ formatToolSchemas (压缩工具签名)
      ├─ buildHistoryMessages (最近10轮对话)
      ├─ formatSceneContext (当前场景状态)
      └─ streamLlm → JSON Plan
  → executePlan (顺序执行所有步骤)
      └─ for each step: callToolRouted → normalizeToolResult
  → 300ms 等待 Bridge WS 结果
  → updateSceneState (批量更新)
  → appendAssistantEntry (记录到历史)
```

### 1.2 核心缺陷

| # | 问题 | 严重度 | 典型失败场景 |
|---|------|--------|-------------|
| 1 | **盲飞规划** — LLM 必须在不知道中间结果的情况下一次性生成所有步骤参数 | **高** | "在黄山附近标注三个景点"：LLM 无法获得 geocode 返回的真实坐标，只能编造 |
| 2 | **无纠错** — 步骤失败后 executor 标记 error 继续走，不会回传错误让 LLM 重规划 | **高** | 步骤 1 失败 → 后续步骤依赖步骤 1 的结果 → 级联失败 |
| 3 | **工具筛选硬编码** — `CATEGORY_TRIGGERS`/`MCP_TRIGGERS` 用手写正则匹配 | **中** | 新增工具必须手动加映射；自然语言覆盖不全导致漏选 |
| 4 | **JSON 解析脆弱** — `parsePlanJson` 先 regex 提取 JSON 再 parse | **中** | LLM 输出格式稍偏就触发重试，浪费 token |
| 5 | **结果结构丢失** — `normalizeToolResult` 将所有结果展平为 `{output: string, image?}` | **中** | 步骤间无法引用前序结果的结构化字段 |
| 6 | **Bridge 异步间隙** — HTTP call_tool 立即返回，真正结果通过 WS 异步到达，用硬编码 300ms 等待 | **低** | 耗时操作（如大 GeoJSON 加载）可能超过 300ms |

### 1.3 当前提示词关键约束

```
"The plan will be executed step-by-step automatically — 
 you will NOT see intermediate results.
 Therefore, each step must be self-contained with explicit parameters."
```

这条约束本身就是对架构缺陷的补偿说明——如果架构支持观测中间结果，就不需要这条约束。

---

## 二、方案对比

### 方案 A：步骤间变量引用

**思路**：保持单轮规划，在 `params` 中允许 `"$1.lat"` 语法引用前序步骤的输出字段。Executor 执行时做变量替换。

```json
{
  "steps": [
    { "tool": "geocode", "params": {"address": "黄山"}, "id": 1 },
    { "tool": "addMarker", "params": {"latitude": "$1.lat", "longitude": "$1.lon", "text": "黄山"}, "id": 2 }
  ]
}
```

**优点**：
- 不增加 LLM 调用次数
- 改动量小（executor + prompt）
- 执行速度不变

**缺点**：
- ❌ LLM 必须准确预知工具输出的字段名结构（`lat`? `latitude`? `result.coordinates[0]`?）
- ❌ `normalizeToolResult` 将结果展平为 string，结构化字段已丢失，需要额外保留 raw result
- ❌ 不解决纠错问题
- ❌ 增加提示词复杂度（要教 LLM 变量语法 + 每个工具的输出 schema）
- ❌ Bridge 异步结果到达时机不确定，变量可能引用到空值

**评估**：半措施。解决了参数依赖，但不解决纠错，且引入了 LLM 必须预知输出结构的新问题。

---

### 方案 B：ReAct 循环（推荐）

**思路**：Observe-Think-Act 循环。LLM 每轮生成 1~N 个步骤，执行后将结果作为观测（observation）反馈给 LLM，由 LLM 决定下一步或结束。

```
Round 1: LLM → [geocode("黄山")] → 执行
Round 2: LLM（带 geocode 结果）→ [addMarker×3] → 执行 → done
```

**优点**：
- ✅ 彻底解决盲飞 — LLM 看到真实结果后再规划下一步
- ✅ 彻底解决纠错 — LLM 看到错误后可调整策略
- ✅ 工业界验证 — ReAct 是 LLM Agent 的标准范式
- ✅ 提示词更简单 — 不需要"你看不到中间结果"的补偿说明

**缺点**：
- 多次 LLM 调用 → 延迟增加、token 消耗增加
- 需要处理无限循环风险（max iterations）
- 上下文窗口可能不够（工具结果积累）
- 实现复杂度高于方案 A

**评估**：治本之策。一次性解决所有核心缺陷。

---

### 方案 C：混合模式

**思路**：简单任务走单轮（快），复杂任务自动升级为 ReAct（准）。

**升级触发条件**：
1. 步骤数 > 1 且有工具输出依赖（如 geocode → addMarker）
2. 步骤执行失败
3. LLM 主动标记 `"continue": true`

**评估**：最终形态，但先实现方案 B 作为基础，再加模式切换逻辑。

---

## 三、方案 B 详细设计

### 3.1 新的执行循环

```
                        ┌────────────────────────────┐
                        │      用户输入 (goal)        │
                        └────────────┬───────────────┘
                                     ▼
                        ┌────────────────────────────┐
                        │  构建初始 context:          │
                        │  system + tools + scene +   │
                        │  history + user goal        │
                        └────────────┬───────────────┘
                                     ▼
                    ┌───── ReAct Loop (max N rounds) ─────┐
                    │                                      │
                    │   ┌──────────────────────────────┐   │
                    │   │  THINK: streamLlm → Action    │   │
                    │   │  输出: steps[] + done flag    │   │
                    │   └──────────┬───────────────────┘   │
                    │              ▼                        │
                    │   ┌──────────────────────────────┐   │
                    │   │  ACT: executePlan(steps)      │   │
                    │   │  逐步执行，收集结果            │   │
                    │   └──────────┬───────────────────┘   │
                    │              ▼                        │
                    │   ┌──────────────────────────────┐   │
                    │   │  OBSERVE: 格式化步骤结果      │   │
                    │   │  追加为 "tool" role message   │   │
                    │   └──────────┬───────────────────┘   │
                    │              ▼                        │
                    │     done=true ──→ 退出循环            │
                    │     done=false ──→ 继续循环           │
                    │                                      │
                    └──────────────────────────────────────┘
                                     ▼
                        ┌────────────────────────────┐
                        │  updateSceneState           │
                        │  appendAssistantEntry       │
                        │  UI 总结                    │
                        └────────────────────────────┘
```

### 3.2 新的 LLM 输出格式

```typescript
interface ReActResponse {
  // 思考过程（可选，用于 UI 展示）
  thought?: string
  
  // 本轮要执行的步骤（0 个 = 纯对话回复）
  steps: Array<{
    tool: string
    params: Record<string, unknown>
    description: string
  }>
  
  // 是否还有后续动作（false = 循环结束）
  continue: boolean
  
  // 最终回复（continue=false 时的总结语）
  reply?: string
}
```

### 3.3 消息协议

每一轮 ReAct 循环中，消息序列如下：

```
[system]  系统提示 + 工具列表 + 场景上下文
[user]    原始用户输入
[assistant] Round 1 的 LLM 输出（JSON）
[user]    Round 1 执行结果（observation）
[assistant] Round 2 的 LLM 输出（JSON）
[user]    Round 2 执行结果（observation）
...
```

**Observation 格式**（追加为 user message）：

```
Tool execution results:
Step 1 [geocode] ✓:
  Output: {"lat": 30.1299, "lon": 118.1630, "display_name": "黄山市, 安徽省, 中国"}

Step 2 [addMarker] ✗:
  Error: Parameter 'latitude' is required
```

### 3.4 Prompt 改造

```
## Planning Mode — ReAct Loop

You operate in a Think-Act-Observe loop:
1. THINK: Analyze what needs to be done next
2. ACT: Output steps to execute (1 or more tool calls)
3. OBSERVE: You will see the execution results
4. Repeat until the task is complete

## Output Format
Respond ONLY with a JSON object:
{
  "thought": "<brief reasoning about what to do next>",
  "steps": [
    {
      "tool": "<exact tool name>",
      "params": { ... },
      "description": "<what this step does>"
    }
  ],
  "continue": true/false,
  "reply": "<final summary when continue=false>"
}

Rules:
- Set "continue": true if you need to see results before deciding next steps
- Set "continue": false when the task is complete or you have all info to respond
- For simple tasks (fly to a known place, change basemap), do everything in one round with continue=false
- For tasks needing intermediate results (geocode then mark), split across rounds with continue=true
- When a step fails, analyze the error and retry with corrected parameters
- Maximum 5 rounds — plan efficiently
```

### 3.5 核心实现

#### 新增文件：`agent/react.ts`

```typescript
import { streamLlm } from './llm'
import { formatToolSchemas, selectToolsForQuery, SYSTEM_PROMPT_REACT } from './prompts'
import { executePlan, normalizeToolResult } from './executor'
import type { Plan, ToolSchema, LlmMessage, ModelSettings } from './types'
import type { PlanStep } from '../types'

export interface ReactOptions {
  maxRounds: number          // 默认 5
  onThinking?: (delta: string) => void
  onRoundStart?: (round: number) => void
  onStepUpdate?: (step: PlanStep) => void
  callTool: ToolCaller
  mcpToolNames?: Set<string>
}

interface ReactResponse {
  thought?: string
  steps: Array<{ tool: string; params: Record<string, unknown>; description: string }>
  continue: boolean
  reply?: string
}

export async function executeReAct(
  goal: string,
  tools: ToolSchema[],
  history: LlmMessage[],
  sceneContext: string,
  settings: ModelSettings,
  options: ReactOptions,
): Promise<{ plan: Plan; allSteps: PlanStep[] }> {
  const filtered = options.mcpToolNames
    ? selectToolsForQuery(goal, tools, options.mcpToolNames)
    : tools
  const toolsHint = formatToolSchemas(filtered)
  const systemContent = SYSTEM_PROMPT_REACT + toolsHint + sceneContext

  // 构建消息上下文
  const messages: LlmMessage[] = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: goal },
  ]

  const allSteps: PlanStep[] = []
  let stepCounter = 0
  let finalReply: string | undefined
  let finalGoal = goal

  for (let round = 0; round < options.maxRounds; round++) {
    options.onRoundStart?.(round + 1)

    // THINK: LLM 生成本轮步骤
    const raw = await streamLlm(
      messages,
      settings,
      (delta) => options.onThinking?.(delta),
      undefined,
      (delta) => options.onThinking?.(delta),
    )

    const response = parseReActResponse(raw, goal)
    finalGoal = response.thought || finalGoal
    finalReply = response.reply

    // 无步骤 → 纯对话回复，结束
    if (response.steps.length === 0) break

    // ACT: 执行本轮步骤
    const roundSteps: PlanStep[] = response.steps.map((s, i) => ({
      id: ++stepCounter,
      tool: s.tool,
      params: s.params,
      description: s.description,
      status: 'pending' as const,
    }))

    const roundPlan: Plan = { goal: finalGoal, steps: roundSteps }
    await executePlan(roundPlan, (step) => {
      options.onStepUpdate?.(step)
    }, options.callTool)

    allSteps.push(...roundSteps)

    // 追加 assistant 消息（LLM 的输出）
    messages.push({ role: 'assistant', content: raw })

    // OBSERVE: 格式化结果为 observation
    if (!response.continue) break
    const observation = formatObservation(roundSteps)
    messages.push({ role: 'user', content: observation })
  }

  return {
    plan: { goal: finalGoal, steps: allSteps, reply: finalReply },
    allSteps,
  }
}

function formatObservation(steps: PlanStep[]): string {
  const lines = ['Tool execution results:']
  for (const s of steps) {
    const status = s.status === 'done' ? '✓' : '✗'
    lines.push(`Step ${s.id} [${s.tool}] ${status}:`)
    if (s.status === 'done' && s.result?.output) {
      // 截断过长的输出，保留结构化信息
      const output = s.result.output.length > 500
        ? s.result.output.slice(0, 500) + '...(truncated)'
        : s.result.output
      lines.push(`  Output: ${output}`)
    }
    if (s.status === 'failed') {
      lines.push(`  Error: ${s.error}`)
    }
  }
  return lines.join('\n')
}
```

### 3.6 改动清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `agent/react.ts` | **新增** | ReAct 循环核心逻辑 |
| `agent/prompts.ts` | **修改** | 新增 `SYSTEM_PROMPT_REACT`，保留旧 `SYSTEM_PROMPT` 兼容 |
| `agent/types.ts` | **修改** | 新增 `ReactResponse` 接口 |
| `agent/index.ts` | **修改** | 导出 `executeReAct` |
| `hooks/useTauriAgent.ts` | **修改** | `sendText` 改用 `executeReAct` 替代 `planFromGoal` + `executePlan` |
| `agent/executor.ts` | **不变** | `executePlan` 保持原样，被 ReAct 每轮调用 |
| `agent/history.ts` | **修改** | `appendAssistantEntry` 适配多轮步骤 |

### 3.7 UI 变化

#### PlanCard 多轮展示

当前 PlanCard 展示单个 plan 的所有 steps。改为支持多轮：

```
┌─ Round 1 ──────────────────────────┐
│  💭 需要先获取黄山的坐标            │
│  ✅ Step 1: geocode("黄山")         │
│     → lat=30.13, lon=118.16         │
├─ Round 2 ──────────────────────────┤
│  💭 已获得坐标，现在添加标注         │
│  ✅ Step 2: addMarker(黄山风景区)    │
│  ✅ Step 3: addMarker(光明顶)        │
│  ✅ Step 4: addMarker(迎客松)        │
└────────────────────────────────────┘
```

可以简单实现为：在 PlanCard 的 steps 列表中插入 "round divider" 元素。

#### ThinkingIndicator

每轮 LLM 调用都会产生 reasoning tokens。可复用现有 ThinkingIndicator，在每轮开始时重新激活。

---

## 四、Bridge 异步结果处理优化

### 4.1 问题

当前 `executePlan` 完成后，硬编码 `setTimeout(300)` 等待 Bridge WS 结果。这在以下场景不够：
- 大 GeoJSON 加载（可能超过 300ms）
- 对 ReAct 循环，步骤结果需要尽快可用于下一轮 LLM 输入

### 4.2 方案：步骤级 Promise 等待

```typescript
// 每个步骤创建一个 Promise，在 Bridge WS 收到对应结果时 resolve
const bridgePromises = new Map<string, {
  resolve: (result: StepResult) => void
  timer: ReturnType<typeof setTimeout>
}>()

// 调用工具后，如果是 Bridge 工具，等待 WS 结果（最多 2s）
async function callToolWithBridgeWait(name: string, params: Record<string, unknown>): Promise<unknown> {
  const httpResult = await callToolRouted(name, params)
  
  // 非 Bridge 工具直接返回
  if (!isBridgeTool(name)) return httpResult
  
  // Bridge 工具：等待 WS 事件或超时
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      bridgePromises.delete(name)
      resolve(httpResult) // 超时回退到 HTTP 结果
    }, 2000)
    bridgePromises.set(name, { resolve, timer })
  })
}

// WS 事件处理器中
const pending = bridgePromises.get(detail.method)
if (pending) {
  clearTimeout(pending.timer)
  bridgePromises.delete(detail.method)
  pending.resolve(normalizeToolResult(detail.result))
}
```

---

## 五、工具筛选改进

### 5.1 问题

当前 `selectToolsForQuery` 用硬编码正则做关键词匹配，维护成本高，覆盖不全。

### 5.2 方案：LLM-based 工具选择（Phase 2）

在 ReAct 第一轮之前，用一个快速 LLM 调用（或 embedding 相似度）选择相关工具子集。

但考虑到当前工具总数约 60 个，formatToolSchemas 产出的 tokens 在可控范围内（约 3000-4000 tokens），**可以暂时全量传入**，不做筛选。等工具数超过 100+ 时再引入 LLM 筛选。

### 5.3 短期改进

- 在 `_meta.toolset` 字段动态获取工具分类（Bridge ≥1.139.18 已支持）
- 删除 `BRIDGE_TOOL_CATEGORIES` 静态映射，完全依赖 `_meta.toolset`
- 当工具数 < 80 时，跳过筛选直接全量传入

---

## 六、实施计划

### Phase 1（核心 ReAct 循环）

**目标**：替换单轮 Plan-Execute 为 ReAct 循环  
**改动范围**：4 个文件（新增 1，修改 3）  
**预估改动量**：~300 行

1. 新建 `agent/react.ts` — ReAct 循环核心
2. 修改 `agent/prompts.ts` — 新增 ReAct 提示词
3. 修改 `hooks/useTauriAgent.ts` — sendText 使用 executeReAct
4. 修改 `agent/index.ts` — 导出

**验证场景**：
- 简单任务："飞到故宫" → 1 轮完成
- 有依赖："在黄山标注三个景点" → 2 轮（geocode → addMarker×3）
- 纠错："加载一个不存在的 GeoJSON" → LLM 看到错误后给出友好回复

### Phase 2（Bridge 异步 + 工具筛选优化）

**目标**：步骤级 Bridge 结果等待 + 动态工具分类  
**改动范围**：2 个文件  

### Phase 3（混合模式 + 预算控制）

**目标**：简单任务自动走单轮加速，复杂任务走 ReAct  
**触发条件**：
- LLM 第一轮 `continue: false` → 退化为单轮（零开销）
- LLM 第一轮 `continue: true` → 进入 ReAct 循环
- Token 预算控制：observation 超过阈值时自动截断

---

## 七、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 无限循环 | `maxRounds = 5` 硬上限 + token 预算 |
| 延迟增加（多轮 LLM） | Phase 3 混合模式，简单任务不额外调用 |
| Token 消耗增加 | Observation 截断（500 chars/step），history 压缩 |
| 上下文窗口溢出 | 动态 token 计算，超限时丢弃早期 observation |
| LLM 不遵守 JSON 格式 | 保留现有 `parsePlanJson` 的容错逻辑 |
| Bridge 结果延迟 | 步骤级 Promise 等待 + 2s 超时回退 |
| 后向兼容 | 旧 `SYSTEM_PROMPT` 和 `planFromGoal` 保留，不删除 |

---

## 八、对比总结

| 维度 | 现状 (Plan-Execute) | Phase 1 (ReAct) | Phase 3 (Hybrid) |
|------|---------------------|-----------------|-------------------|
| 盲飞问题 | ❌ 完全盲飞 | ✅ 每轮观测 | ✅ |
| 纠错能力 | ❌ 无 | ✅ LLM 自主纠错 | ✅ |
| 简单任务延迟 | ✅ 1 次 LLM | ⚠️ 可能 1 次 | ✅ 1 次 LLM |
| 复杂任务成功率 | ❌ 低 | ✅ 高 | ✅ 高 |
| Token 消耗 | ✅ 最少 | ⚠️ 2-5x | ⚠️ 1-5x |
| 实现复杂度 | ✅ 简单 | 中等 | 较高 |
