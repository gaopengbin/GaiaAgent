import { streamLlm } from './llm'
import type { TokenUsage } from './llm'
import { SYSTEM_PROMPT_REACT, formatToolSchemas, selectToolsForQuery } from './prompts'
import { executePlan } from './executor'
import type { Plan, ToolSchema, LlmMessage, ModelSettings } from './types'
import type { PlanStep } from '../types'
import type { ToolCaller } from './executor'

// ── Types ──────────────────────────────────────────────

interface ReactStepDef {
  tool: string
  params: Record<string, unknown>
  description: string
}

interface ReactResponse {
  thought?: string
  steps: ReactStepDef[]
  continue: boolean
  reply?: string
}

/** Per-round token usage statistics */
export interface RoundUsage {
  round: number
  usage?: TokenUsage
  /** Estimated tokens from char count when API doesn't provide usage */
  estimated?: { promptTokens: number; completionTokens: number }
}

/** Accumulated usage for the entire ReAct session */
export interface ReActUsage {
  rounds: RoundUsage[]
  total: TokenUsage
}

export interface ReactCallbacks {
  /** Called when a new ReAct round starts (1-based) */
  onRoundStart?: (round: number) => void
  /** Called for each streaming token (reasoning + content) */
  onThinking?: (delta: string) => void
  /** Called when steps are determined for a round (before execution) */
  onStepsReady?: (round: number, steps: PlanStep[]) => void
  /** Called when a step's status changes during execution */
  onStepUpdate?: (step: PlanStep) => void
  /** Route tool calls to appropriate backend */
  callTool: ToolCaller
  /** Set of MCP tool names for tool filtering */
  mcpToolNames?: Set<string>
}

// ── Parser ─────────────────────────────────────────────

function parseReActResponse(raw: string, _fallbackGoal: string): ReactResponse {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return { steps: [], continue: false, reply: raw }
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>
    } catch {
      return { steps: [], continue: false, reply: raw }
    }
  }

  const steps: ReactStepDef[] = (Array.isArray(parsed.steps) ? parsed.steps : []).map(
    (s: unknown) => {
      const step = s as { tool?: string; params?: Record<string, unknown>; description?: string }
      return {
        tool: step.tool ?? '',
        params: step.params ?? {},
        description: step.description ?? step.tool ?? '',
      }
    },
  )

  return {
    thought: typeof parsed.thought === 'string' ? parsed.thought : undefined,
    steps,
    continue: parsed.continue === true,
    reply: typeof parsed.reply === 'string' ? parsed.reply : undefined,
  }
}

// ── Observation formatter ──────────────────────────────

const OBS_OUTPUT_MAX = 500

function formatObservation(steps: PlanStep[]): string {
  const lines = ['Tool execution results:']
  for (const s of steps) {
    const status = s.status === 'done' ? '✓' : '✗'
    lines.push(`Step ${s.id} [${s.tool}] ${status}:`)
    if (s.status === 'done' && s.result?.output) {
      const output =
        s.result.output.length > OBS_OUTPUT_MAX
          ? s.result.output.slice(0, OBS_OUTPUT_MAX) + '...(truncated)'
          : s.result.output
      lines.push(`  Output: ${output}`)
    }
    if (s.status === 'failed') {
      lines.push(`  Error: ${s.error}`)
    }
  }
  return lines.join('\n')
}

// ── Main ReAct loop ────────────────────────────────────

const DEFAULT_MAX_ROUNDS = 5
/** Rough token budget for the ReAct context (chars ≈ tokens × 3.5 for mixed CJK/EN) */
const MAX_CONTEXT_CHARS = 60_000

export async function executeReAct(
  goal: string,
  tools: ToolSchema[],
  history: LlmMessage[],
  sceneContext: string,
  settings: ModelSettings,
  callbacks: ReactCallbacks,
  maxRounds = DEFAULT_MAX_ROUNDS,
): Promise<{ plan: Plan; allSteps: PlanStep[]; usage: ReActUsage }> {
  const filtered = callbacks.mcpToolNames
    ? selectToolsForQuery(goal, tools, callbacks.mcpToolNames)
    : tools
  const toolsHint = formatToolSchemas(filtered)
  const systemContent = SYSTEM_PROMPT_REACT + toolsHint + sceneContext

  const messages: LlmMessage[] = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: goal },
  ]

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  console.log(
    `[GaiaAgent:ReAct] Prompt: ${totalChars} chars, system: ${systemContent.length} chars, tools: ${filtered.length}/${tools.length}, history: ${history.length} msgs`,
  )

  const allSteps: PlanStep[] = []
  let stepCounter = 0
  let finalReply: string | undefined
  let finalGoal = goal
  const roundUsages: RoundUsage[] = []

  for (let round = 0; round < maxRounds; round++) {
    callbacks.onRoundStart?.(round + 1)
    console.log(`[GaiaAgent:ReAct] ── Round ${round + 1}/${maxRounds} ──`)

    // THINK: LLM generates this round's actions
    const llmResult = await streamLlm(
      messages,
      settings,
      (delta) => callbacks.onThinking?.(delta),
      undefined,
      (delta) => callbacks.onThinking?.(delta),
    )
    const raw = llmResult.content

    // Track token usage for this round
    const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0)
    const roundUsage: RoundUsage = {
      round: round + 1,
      usage: llmResult.usage,
      estimated: !llmResult.usage ? {
        promptTokens: Math.ceil(promptChars / 3.5),
        completionTokens: Math.ceil(raw.length / 3.5),
      } : undefined,
    }
    roundUsages.push(roundUsage)

    const u = llmResult.usage
    if (u) {
      console.log(`[GaiaAgent:ReAct] Round ${round + 1} tokens: prompt=${u.promptTokens}, completion=${u.completionTokens}, total=${u.totalTokens}`)
    } else {
      console.log(`[GaiaAgent:ReAct] Round ${round + 1} tokens (estimated): prompt≈${roundUsage.estimated!.promptTokens}, completion≈${roundUsage.estimated!.completionTokens}`)
    }

    const response = parseReActResponse(raw, goal)
    if (response.thought) finalGoal = response.thought
    if (response.reply) finalReply = response.reply

    // No steps → conversational reply, exit loop
    if (response.steps.length === 0) {
      console.log(`[GaiaAgent:ReAct] Round ${round + 1}: no steps, reply=${!!response.reply}`)
      break
    }

    // Build PlanSteps for this round
    const roundSteps: PlanStep[] = response.steps.map((s) => ({
      id: ++stepCounter,
      tool: s.tool,
      params: s.params,
      description: s.description,
      status: 'pending' as const,
      round: round + 1,
    }))

    callbacks.onStepsReady?.(round + 1, roundSteps)

    // ACT: Execute this round's steps
    const roundPlan: Plan = { goal: finalGoal, steps: roundSteps }
    await executePlan(roundPlan, (step) => {
      callbacks.onStepUpdate?.(step)
    }, callbacks.callTool)

    allSteps.push(...roundSteps)

    console.log(
      `[GaiaAgent:ReAct] Round ${round + 1}: ${roundSteps.length} steps, ` +
      `done=${roundSteps.filter((s) => s.status === 'done').length}, ` +
      `failed=${roundSteps.filter((s) => s.status === 'failed').length}`,
    )

    // Append LLM output to context
    messages.push({ role: 'assistant', content: raw })

    // Exit if LLM says done
    if (!response.continue) {
      console.log(`[GaiaAgent:ReAct] Round ${round + 1}: continue=false, exiting loop`)
      break
    }

    // OBSERVE: Format results and feed back
    const observation = formatObservation(roundSteps)

    // Token budget check: if context is getting too long, truncate observation
    const contextChars = messages.reduce((sum, m) => sum + m.content.length, 0)
    const remainingBudget = MAX_CONTEXT_CHARS - contextChars
    const finalObservation = remainingBudget < observation.length
      ? observation.slice(0, Math.max(remainingBudget, 200)) + '\n...(context budget exceeded, observation truncated)'
      : observation

    messages.push({ role: 'user', content: finalObservation })
    console.log(`[GaiaAgent:ReAct] Observation: ${finalObservation.length} chars, context total: ${contextChars + finalObservation.length} chars`)
  }

  const plan: Plan = { goal: finalGoal, steps: allSteps, reply: finalReply }

  // Aggregate usage
  const totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  for (const ru of roundUsages) {
    if (ru.usage) {
      totalUsage.promptTokens += ru.usage.promptTokens
      totalUsage.completionTokens += ru.usage.completionTokens
      totalUsage.totalTokens += ru.usage.totalTokens
    } else if (ru.estimated) {
      totalUsage.promptTokens += ru.estimated.promptTokens
      totalUsage.completionTokens += ru.estimated.completionTokens
      totalUsage.totalTokens += ru.estimated.promptTokens + ru.estimated.completionTokens
    }
  }

  console.log(
    `[GaiaAgent:ReAct] Complete: ${allSteps.length} steps, ${roundUsages.length} rounds, ` +
    `tokens: prompt=${totalUsage.promptTokens}, completion=${totalUsage.completionTokens}, total=${totalUsage.totalTokens}` +
    (roundUsages.some(r => !r.usage) ? ' (partially estimated)' : ''),
  )

  return {
    plan,
    allSteps,
    usage: { rounds: roundUsages, total: totalUsage },
  }
}
