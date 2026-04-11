import { callLlm, streamLlm } from './llm'
import { SYSTEM_PROMPT, formatToolSchemas, selectToolsForQuery } from './prompts'
import type { Plan, ToolSchema, LlmMessage, ModelSettings } from './types'
import type { PlanStep } from '../types'

function parsePlanJson(raw: string, goal: string): Plan {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()
  let parsed: { goal?: string; reply?: string; steps?: unknown[] }
  try {
    parsed = JSON.parse(cleaned) as typeof parsed
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return { goal, steps: [] }
    try {
      parsed = JSON.parse(match[0]) as typeof parsed
    } catch {
      return { goal, steps: [] }
    }
  }
  const steps: PlanStep[] = (parsed.steps ?? []).map((s, i) => {
    const step = s as { tool?: string; params?: Record<string, unknown>; description?: string }
    return {
      id: i + 1,
      tool: step.tool ?? '',
      params: step.params ?? {},
      description: step.description ?? step.tool ?? '',
      status: 'pending',
    }
  })
  return { goal: parsed.goal ?? goal, steps, reply: parsed.reply }
}

export async function planFromGoal(
  goal: string,
  tools: ToolSchema[],
  history: LlmMessage[],
  sceneContext: string,
  settings: ModelSettings,
  onThinking?: (delta: string) => void,
  mcpToolNames?: Set<string>,
): Promise<Plan> {
  const filtered = mcpToolNames ? selectToolsForQuery(goal, tools, mcpToolNames) : tools
  const toolsHint = formatToolSchemas(filtered)
  const systemContent = SYSTEM_PROMPT + toolsHint + sceneContext
  const messages: LlmMessage[] = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: `Create a plan for: ${goal}` },
  ]

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  console.log(`[GaiaAgent] Prompt: ${totalChars} chars, system: ${systemContent.length} chars, tools: ${filtered.length}/${tools.length}, history: ${history.length} msgs`)

  const MAX_RETRIES = 2
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let raw: string
      if (onThinking) {
        const result = await streamLlm(
          messages,
          settings,
          (delta) => onThinking(delta), // content tokens → also show live
          undefined,                     // requestId
          (delta) => onThinking(delta), // reasoning tokens → show live
        )
        raw = result.content
      } else {
        const result = await callLlm(messages, settings)
        raw = result.content
      }
      const plan = parsePlanJson(raw, goal)
      if (plan.steps.length > 0 || plan.reply) return plan
      // Empty plan with no reply on first attempt — retry with hint
      if (attempt < MAX_RETRIES) {
        messages.push(
          { role: 'assistant', content: raw },
          { role: 'user', content: 'The plan had no steps. If this is a conversational message, include a "reply" field. Otherwise, try again with at least one tool call.' },
        )
        continue
      }
      return plan
    } catch (e) {
      lastError = e
      if (attempt < MAX_RETRIES) continue
    }
  }

  throw lastError
}
