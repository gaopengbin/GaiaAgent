export const AGENT_EVENT_VERSION = 1 as const

export type AgentRunStatus = 'running' | 'completed' | 'cancelled' | 'failed'
export type AgentReasoningStatus = 'streaming' | 'done'
export type AgentToolStatus =
  'requested' | 'awaiting-approval' | 'running' | 'completed' | 'failed' | 'cancelled'
export type AgentTaskPlanStepStatus =
  'planned' | 'retrying' | 'skipped' | 'needs-planning' | AgentToolStatus
export type ToolRiskLevel = 'read' | 'scene-write' | 'network' | 'filesystem' | 'process'

export interface AgentError {
  code: string
  message: string
  category?: 'validation' | 'authentication' | 'rate-limit' | 'network' | 'tool' | 'internal'
  retryable?: boolean
  details?: Record<string, unknown>
}

export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  description?: string
  source?: string
  round?: number
  risk?: ToolRiskLevel
}

export interface AgentToolResult {
  output?: string
  image?: string
  mediaType?: string
  data?: unknown
  metadata?: Record<string, unknown>
}

export interface AgentUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AgentTaskPlanStep {
  id: string
  title: string
  status?: AgentTaskPlanStepStatus
  toolCallId?: string
  toolCallIds?: string[]
  artifactRefs?: string[]
  risk?: ToolRiskLevel
}

export interface AgentTaskPlan {
  id: string
  goal: string
  steps: AgentTaskPlanStep[]
}

export interface AgentRunContinuation {
  kind: 'replan'
  parentRunId: string
  parentStepId?: string
  reason?: string
}

export interface AgentUserAttachment {
  filename?: string
  mediaType?: string
  url: string
}

interface AgentEventEnvelope {
  version: typeof AGENT_EVENT_VERSION
  id: string
  runId: string
  timestamp: number
}

export type AgentEvent = AgentEventEnvelope &
  (
    | {
        type: 'run.started'
        goal: string
        continuation?: AgentRunContinuation
        userAttachments?: AgentUserAttachment[]
      }
    | {
        type: 'run.continued'
        goal: string
        continuation: AgentRunContinuation
        userAttachments?: AgentUserAttachment[]
      }
    | { type: 'message.delta'; messageId: string; text: string }
    | { type: 'message.completed'; messageId: string; text?: string }
    | { type: 'reasoning.delta'; text: string; round?: number }
    | { type: 'reasoning.status'; status: AgentReasoningStatus; round?: number }
    | { type: 'task.plan.created'; plan: AgentTaskPlan }
    | { type: 'task.plan.approval_required'; planId: string }
    | {
        type: 'task.plan.steps_replanned'
        anchorStepId: string
        steps: AgentTaskPlanStep[]
        reason?: string
      }
    | { type: 'task.step.retry_requested'; stepId: string; reason?: string }
    | { type: 'task.step.skipped'; stepId: string; reason?: string }
    | { type: 'task.step.replan_requested'; stepId: string; reason?: string }
    | {
        type: 'task.step.tool_linked'
        stepId: string
        toolCallId: string
        title?: string
        risk?: ToolRiskLevel
      }
    | {
        type: 'task.step.updated'
        stepId: string
        status: AgentTaskPlanStepStatus
        risk?: ToolRiskLevel
        error?: AgentError
        artifactRefs?: string[]
      }
    | { type: 'tool.requested'; call: AgentToolCall }
    | { type: 'tool.approval_required'; callId: string; risk: ToolRiskLevel; reason?: string }
    | { type: 'tool.started'; callId: string }
    | { type: 'tool.completed'; callId: string; result: AgentToolResult }
    | { type: 'tool.failed'; callId: string; error: AgentError }
    | { type: 'tool.cancelled'; callId: string; reason?: string }
    | { type: 'scene.changed'; patch: Record<string, unknown> }
    | { type: 'usage.updated'; usage: AgentUsage }
    | { type: 'run.completed'; summary?: string }
    | { type: 'run.cancelled'; reason?: string }
    | { type: 'run.failed'; error: AgentError }
  )

let eventSequence = 0

export function createAgentEvent<T extends Omit<AgentEvent, keyof AgentEventEnvelope>>(
  runId: string,
  event: T,
): AgentEvent {
  eventSequence += 1
  return {
    version: AGENT_EVENT_VERSION,
    id: `${runId}:event:${eventSequence}`,
    runId,
    timestamp: Date.now(),
    ...event,
  } as AgentEvent
}

export function toAgentError(error: unknown, code = 'agent_error'): AgentError {
  if (error instanceof Error) {
    return { code, message: error.message, category: 'internal' }
  }
  if (error && typeof error === 'object') {
    const candidate = error as {
      code?: unknown
      kind?: unknown
      message?: unknown
      retryable?: unknown
    }
    if (typeof candidate.message === 'string') {
      return {
        code:
          typeof candidate.code === 'string'
            ? candidate.code
            : typeof candidate.kind === 'string'
              ? candidate.kind
              : code,
        message: candidate.message,
        category:
          candidate.kind === 'authentication'
            ? 'authentication'
            : candidate.kind === 'rate_limit'
              ? 'rate-limit'
              : candidate.kind === 'network' || candidate.kind === 'timeout'
                ? 'network'
                : 'internal',
        retryable: typeof candidate.retryable === 'boolean' ? candidate.retryable : undefined,
      }
    }
  }
  return { code, message: String(error), category: 'internal' }
}

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AgentEvent>
  return (
    candidate.version === AGENT_EVENT_VERSION &&
    typeof candidate.id === 'string' &&
    typeof candidate.runId === 'string' &&
    typeof candidate.timestamp === 'number' &&
    typeof candidate.type === 'string'
  )
}
