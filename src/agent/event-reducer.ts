import type {
  AgentError,
  AgentEvent,
  AgentRunContinuation,
  AgentReasoningStatus,
  AgentRunStatus,
  AgentTaskPlanStepStatus,
  AgentToolCall,
  AgentToolResult,
  AgentToolStatus,
  AgentUsage,
  AgentUserAttachment,
  ToolRiskLevel,
} from './events'

export interface AgentMessageView {
  id: string
  text: string
  streaming: boolean
}

export interface AgentUserAttachmentView {
  filename?: string
  mediaType?: string
  url: string
}

export interface AgentReasoningView {
  text: string
  status: AgentReasoningStatus
  round?: number
}

export interface AgentToolView {
  call: AgentToolCall
  status: AgentToolStatus
  risk?: ToolRiskLevel
  approvalReason?: string
  result?: AgentToolResult
  error?: AgentError
}

export interface AgentTaskPlanStepView {
  id: string
  title: string
  status: AgentTaskPlanStepStatus
  toolCallId?: string
  toolCallIds?: string[]
  artifactRefs?: string[]
  risk?: ToolRiskLevel
  result?: AgentToolResult
  error?: AgentError
}

export interface AgentTaskPlanView {
  id: string
  goal: string
  status: 'draft' | 'awaiting-approval' | 'running' | 'completed' | 'failed' | 'cancelled'
  steps: AgentTaskPlanStepView[]
}

export interface AgentRunView {
  id: string
  goal: string
  continuation?: AgentRunContinuation
  continuations?: AgentRunContinuation[]
  status: AgentRunStatus
  startedAt: number
  completedAt?: number
  userAttachments?: AgentUserAttachmentView[]
  messages: AgentMessageView[]
  reasoning?: AgentReasoningView
  tools: AgentToolView[]
  plan?: AgentTaskPlanView
  usage?: AgentUsage
  summary?: string
  error?: AgentError
  scenePatches: Record<string, unknown>[]
}

export interface AgentTimelineState {
  runOrder: string[]
  runs: Record<string, AgentRunView>
  lastEventId?: string
}

const EMPTY_VISIBLE_REPLY =
  '模型这次没有返回可见正文，只返回了思考过程。你可以换个问法重试，或检查当前模型/中转是否把正文错误地放进 reasoning 字段。'

export const initialAgentTimelineState: AgentTimelineState = {
  runOrder: [],
  runs: {},
}

const RUN_STATUSES: AgentRunStatus[] = ['running', 'completed', 'cancelled', 'failed']
const REASONING_STATUSES: AgentReasoningStatus[] = ['streaming', 'done']
const TOOL_STATUSES: AgentToolStatus[] = [
  'requested',
  'awaiting-approval',
  'running',
  'completed',
  'failed',
  'cancelled',
]
const TASK_STEP_STATUSES: AgentTaskPlanStepStatus[] = [
  'planned',
  'retrying',
  'skipped',
  'needs-planning',
  ...TOOL_STATUSES,
]
const TASK_PLAN_STATUSES: AgentTaskPlanView['status'][] = [
  'draft',
  'awaiting-approval',
  'running',
  'completed',
  'failed',
  'cancelled',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value.filter((item): item is string => typeof item === 'string')
  return values.length > 0 ? values : undefined
}

function normalizeUserAttachment(value: unknown): AgentUserAttachmentView | undefined {
  if (!isRecord(value) || typeof value.url !== 'string') return undefined
  const mediaType = typeof value.mediaType === 'string' ? value.mediaType : undefined
  return {
    filename: typeof value.filename === 'string' ? value.filename : undefined,
    mediaType,
    url: value.url,
  }
}

function normalizeUserAttachments(value: unknown): AgentUserAttachmentView[] | undefined {
  if (!Array.isArray(value)) return undefined
  const attachments = value
    .map(normalizeUserAttachment)
    .filter((attachment): attachment is AgentUserAttachmentView => !!attachment)
  return attachments.length > 0 ? attachments : undefined
}

function eventUserAttachments(
  value?: AgentUserAttachment[],
): AgentUserAttachmentView[] | undefined {
  return normalizeUserAttachments(value)
}

function normalizeToolResult(value: unknown): AgentToolResult | undefined {
  if (!isRecord(value)) return undefined
  return {
    output: typeof value.output === 'string' ? value.output : undefined,
    image: typeof value.image === 'string' ? value.image : undefined,
    mediaType: typeof value.mediaType === 'string' ? value.mediaType : undefined,
    data: value.data,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  }
}

function normalizeAgentError(value: unknown): AgentError | undefined {
  if (!isRecord(value) || typeof value.message !== 'string') return undefined
  return {
    code: typeof value.code === 'string' ? value.code : 'agent_error',
    message: value.message,
    category:
      value.category === 'validation' ||
      value.category === 'authentication' ||
      value.category === 'rate-limit' ||
      value.category === 'network' ||
      value.category === 'tool' ||
      value.category === 'internal'
        ? value.category
        : undefined,
    retryable: typeof value.retryable === 'boolean' ? value.retryable : undefined,
    details: isRecord(value.details) ? value.details : undefined,
  }
}

function normalizeRunContinuation(value: unknown): AgentRunContinuation | undefined {
  if (!isRecord(value) || value.kind !== 'replan' || typeof value.parentRunId !== 'string') {
    return undefined
  }
  return {
    kind: 'replan',
    parentRunId: value.parentRunId,
    parentStepId: typeof value.parentStepId === 'string' ? value.parentStepId : undefined,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
  }
}

function normalizeToolCall(value: unknown): AgentToolCall | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return undefined
  }
  return {
    id: value.id,
    name: value.name,
    arguments: isRecord(value.arguments) ? value.arguments : {},
    description: typeof value.description === 'string' ? value.description : undefined,
    source: typeof value.source === 'string' ? value.source : undefined,
    round: typeof value.round === 'number' ? value.round : undefined,
    risk: isToolRisk(value.risk) ? value.risk : undefined,
  }
}

function isToolRisk(value: unknown): value is ToolRiskLevel {
  return (
    value === 'read' ||
    value === 'scene-write' ||
    value === 'network' ||
    value === 'filesystem' ||
    value === 'process'
  )
}

function normalizeTaskPlanStep(value: unknown): AgentTaskPlanStepView | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
    return undefined
  }
  const status = TASK_STEP_STATUSES.includes(value.status as AgentTaskPlanStepStatus)
    ? (value.status as AgentTaskPlanStepStatus)
    : 'planned'
  return {
    id: value.id,
    title: value.title,
    status,
    toolCallId: typeof value.toolCallId === 'string' ? value.toolCallId : undefined,
    toolCallIds: stringArray(value.toolCallIds),
    artifactRefs: stringArray(value.artifactRefs),
    risk: isToolRisk(value.risk) ? value.risk : undefined,
    result: normalizeToolResult(value.result),
    error: normalizeAgentError(value.error),
  }
}

function normalizeTaskPlan(value: unknown, run: AgentRunView): AgentTaskPlanView | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.goal !== 'string') {
    return undefined
  }
  const steps = Array.isArray(value.steps)
    ? value.steps.map(normalizeTaskPlanStep).filter((step): step is AgentTaskPlanStepView => !!step)
    : []
  if (steps.length === 0) return undefined
  return {
    id: value.id,
    goal: value.goal,
    status: TASK_PLAN_STATUSES.includes(value.status as AgentTaskPlanView['status'])
      ? (value.status as AgentTaskPlanView['status'])
      : planStatusFromSteps(steps, run.status),
    steps,
  }
}

function normalizeRun(value: unknown): AgentRunView | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.goal !== 'string') {
    return undefined
  }
  const status = RUN_STATUSES.includes(value.status as AgentRunStatus)
    ? (value.status as AgentRunStatus)
    : 'completed'
  const tools = Array.isArray(value.tools)
    ? value.tools
        .map((tool): AgentToolView | undefined => {
          if (!isRecord(tool)) return undefined
          const call = normalizeToolCall(tool.call)
          if (!call) return undefined
          return {
            call,
            status: TOOL_STATUSES.includes(tool.status as AgentToolStatus)
              ? (tool.status as AgentToolStatus)
              : 'requested',
            risk: isToolRisk(tool.risk) ? tool.risk : undefined,
            approvalReason:
              typeof tool.approvalReason === 'string' ? tool.approvalReason : undefined,
            result: normalizeToolResult(tool.result),
            error: normalizeAgentError(tool.error),
          }
        })
        .filter((tool): tool is AgentToolView => !!tool)
    : []
  const run: AgentRunView = {
    id: value.id,
    goal: value.goal,
    continuation: normalizeRunContinuation(value.continuation),
    continuations: Array.isArray(value.continuations)
      ? value.continuations
          .map(normalizeRunContinuation)
          .filter((continuation): continuation is AgentRunContinuation => !!continuation)
      : undefined,
    status,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : Date.now(),
    completedAt: typeof value.completedAt === 'number' ? value.completedAt : undefined,
    userAttachments: normalizeUserAttachments(value.userAttachments),
    messages: Array.isArray(value.messages)
      ? value.messages
          .filter(isRecord)
          .filter((message) => typeof message.id === 'string')
          .map((message) => ({
            id: message.id as string,
            text: typeof message.text === 'string' ? message.text : '',
            streaming: typeof message.streaming === 'boolean' ? message.streaming : false,
          }))
      : [],
    reasoning: isRecord(value.reasoning)
      ? {
          text: typeof value.reasoning.text === 'string' ? value.reasoning.text : '',
          status: REASONING_STATUSES.includes(value.reasoning.status as AgentReasoningStatus)
            ? (value.reasoning.status as AgentReasoningStatus)
            : 'done',
          round: typeof value.reasoning.round === 'number' ? value.reasoning.round : undefined,
        }
      : undefined,
    tools,
    usage: isRecord(value.usage)
      ? {
          promptTokens: Number(value.usage.promptTokens) || 0,
          completionTokens: Number(value.usage.completionTokens) || 0,
          totalTokens: Number(value.usage.totalTokens) || 0,
        }
      : undefined,
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    error: normalizeAgentError(value.error),
    scenePatches: Array.isArray(value.scenePatches) ? value.scenePatches.filter(isRecord) : [],
  }
  const settledRun =
    status === 'failed'
      ? finishUnsettledTools(run, 'failed', run.error)
      : status === 'cancelled'
        ? finishUnsettledTools(run, 'cancelled')
        : run
  return withToolSyncedPlan({
    ...settledRun,
    plan: normalizeTaskPlan(value.plan, settledRun),
  })
}

export function normalizeAgentTimelineState(value: unknown): AgentTimelineState {
  if (!isRecord(value) || !Array.isArray(value.runOrder) || !isRecord(value.runs)) {
    return initialAgentTimelineState
  }
  const runs = Object.fromEntries(
    Object.entries(value.runs)
      .map(([runId, run]) => [runId, normalizeRun(run)] as const)
      .filter((entry): entry is readonly [string, AgentRunView] => !!entry[1]),
  )
  const runOrder = value.runOrder.filter(
    (runId): runId is string => typeof runId === 'string' && !!runs[runId],
  )
  return {
    runOrder,
    runs,
    lastEventId: typeof value.lastEventId === 'string' ? value.lastEventId : undefined,
  }
}

function updateRun(
  state: AgentTimelineState,
  runId: string,
  update: (run: AgentRunView) => AgentRunView,
  eventId: string,
): AgentTimelineState {
  const run = state.runs[runId]
  if (!run) return { ...state, lastEventId: eventId }
  return {
    ...state,
    runs: { ...state.runs, [runId]: update(run) },
    lastEventId: eventId,
  }
}

function stopRunStreaming(run: AgentRunView): AgentRunView {
  return {
    ...run,
    messages: run.messages.map((message) =>
      message.streaming ? { ...message, streaming: false } : message,
    ),
    reasoning: run.reasoning ? { ...run.reasoning, status: 'done' } : undefined,
  }
}

function finishUnsettledTools(
  run: AgentRunView,
  status: 'failed' | 'cancelled',
  error?: AgentError,
): AgentRunView {
  return {
    ...run,
    tools: run.tools.map((tool) =>
      ['requested', 'awaiting-approval', 'running'].includes(tool.status)
        ? { ...tool, status, error: status === 'failed' ? error : tool.error }
        : tool,
    ),
  }
}

function updateTool(
  run: AgentRunView,
  callId: string,
  update: (tool: AgentToolView) => AgentToolView,
): AgentRunView {
  return {
    ...run,
    tools: run.tools.map((tool) => (tool.call.id === callId ? update(tool) : tool)),
  }
}

function planStatusFromRun(run: AgentRunView): AgentTaskPlanView['status'] {
  if (run.status === 'cancelled') return 'cancelled'
  if (run.status === 'failed' || run.tools.some((tool) => tool.status === 'failed')) return 'failed'
  if (run.tools.some((tool) => tool.status === 'awaiting-approval')) return 'awaiting-approval'
  if (run.tools.length > 0 && run.tools.every((tool) => tool.status === 'completed')) {
    return 'completed'
  }
  if (run.tools.some((tool) => tool.status === 'running' || tool.status === 'completed')) {
    return 'running'
  }
  return 'draft'
}

function planStatusFromSteps(
  steps: AgentTaskPlanStepView[],
  runStatus: AgentRunStatus,
): AgentTaskPlanView['status'] {
  if (runStatus === 'cancelled') return 'cancelled'
  if (runStatus === 'failed' || steps.some((step) => step.status === 'failed')) return 'failed'
  if (steps.some((step) => step.status === 'awaiting-approval')) return 'awaiting-approval'
  if (
    steps.length > 0 &&
    steps.every((step) => step.status === 'completed' || step.status === 'skipped')
  ) {
    return 'completed'
  }
  if (
    steps.some(
      (step) =>
        step.status === 'running' ||
        step.status === 'retrying' ||
        step.status === 'completed' ||
        step.status === 'needs-planning',
    )
  ) {
    return 'running'
  }
  return 'draft'
}

function syncExplicitPlanWithTools(run: AgentRunView): AgentRunView {
  if (!run.plan) return run
  const steps = run.plan.steps.map((step) => {
    const tool = [...run.tools]
      .reverse()
      .find(
        (tool) =>
          tool.call.id === (step.toolCallId ?? step.id) ||
          tool.call.id === step.id ||
          (step.toolCallIds ?? []).includes(tool.call.id),
      )
    if (!tool) return step
    return {
      ...step,
      status: tool.status,
      risk: tool.risk ?? tool.call.risk ?? step.risk,
      result: tool.result ?? step.result,
      artifactRefs: mergeUnique(step.artifactRefs, extractArtifactRefsFromToolResult(tool.result)),
      error: tool.error ?? step.error,
    }
  })
  return {
    ...run,
    plan: {
      ...run.plan,
      status: planStatusFromSteps(steps, run.status),
      steps,
    },
  }
}

function deriveTaskPlan(run: AgentRunView): AgentTaskPlanView | undefined {
  if (run.tools.length === 0) return undefined
  return {
    id: `${run.id}:plan`,
    goal: run.goal,
    status: planStatusFromRun(run),
    steps: run.tools.map((tool) => ({
      id: tool.call.id,
      title: tool.call.description || tool.call.name,
      status: tool.status,
      toolCallId: tool.call.id,
      toolCallIds: [tool.call.id],
      artifactRefs: extractArtifactRefsFromToolResult(tool.result),
      risk: tool.risk ?? tool.call.risk,
    })),
  }
}

function mergeUnique(left?: string[], right?: string[]): string[] | undefined {
  const values = Array.from(new Set([...(left ?? []), ...(right ?? [])].filter(Boolean)))
  return values.length > 0 ? values : undefined
}

function extractArtifactRefsFromValue(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(extractArtifactRefsFromValue)
  const object = value as Record<string, unknown>
  const refs: string[] = []
  const pushSceneRef = (candidate: unknown) => {
    if (
      typeof candidate === 'string' &&
      (candidate.startsWith('entity:') || candidate.startsWith('layer:'))
    ) {
      refs.push(candidate)
    }
  }
  const pushPrefixed = (candidate: unknown, prefix: 'entity' | 'layer') => {
    if (typeof candidate === 'string' && candidate.trim()) refs.push(`${prefix}:${candidate}`)
  }
  const pushMany = (candidate: unknown, prefix: 'entity' | 'layer') => {
    if (Array.isArray(candidate)) candidate.forEach((item) => pushPrefixed(item, prefix))
    else pushPrefixed(candidate, prefix)
  }

  pushMany(object.entityId, 'entity')
  pushMany(object.entityIds, 'entity')
  pushMany(object.layerId, 'layer')
  pushMany(object.layerIds, 'layer')
  pushSceneRef(object.objectRef)
  pushSceneRef(object.activeObjectRef)
  if (Array.isArray(object.objectRefs)) object.objectRefs.forEach(pushSceneRef)

  for (const entry of Object.entries(object)) {
    if (
      [
        'entityId',
        'entityIds',
        'layerId',
        'layerIds',
        'objectRef',
        'objectRefs',
        'activeObjectRef',
        'deletedObjectRef',
      ].includes(entry[0])
    ) {
      continue
    }
    refs.push(...extractArtifactRefsFromValue(entry[1]))
  }
  return Array.from(new Set(refs))
}

function extractArtifactRefsFromToolResult(result?: AgentToolResult): string[] | undefined {
  if (!result) return undefined
  const refs = [
    ...extractArtifactRefsFromValue(result.data),
    ...extractArtifactRefsFromValue(result.metadata),
  ]
  if (typeof result.output === 'string') {
    try {
      refs.push(...extractArtifactRefsFromValue(JSON.parse(result.output)))
    } catch {
      // Tool output can be plain text; only JSON output carries artifact refs.
    }
  }
  const unique = Array.from(new Set(refs))
  return unique.length > 0 ? unique : undefined
}

function withToolSyncedPlan(run: AgentRunView): AgentRunView {
  if (run.plan) return syncExplicitPlanWithTools(run)
  return { ...run, plan: deriveTaskPlan(run) }
}

export function agentTimelineReducer(
  state: AgentTimelineState,
  event: AgentEvent,
): AgentTimelineState {
  if (event.type === 'run.started') {
    if (state.runs[event.runId]) return state
    return {
      runOrder: [...state.runOrder, event.runId],
      runs: {
        ...state.runs,
        [event.runId]: {
          id: event.runId,
          goal: event.goal,
          continuation: event.continuation,
          continuations: event.continuation ? [event.continuation] : undefined,
          status: 'running',
          startedAt: event.timestamp,
          userAttachments: eventUserAttachments(event.userAttachments),
          messages: [],
          tools: [],
          scenePatches: [],
        },
      },
      lastEventId: event.id,
    }
  }

  switch (event.type) {
    case 'run.continued':
      return updateRun(
        state,
        event.runId,
        (run) => ({
          ...run,
          continuation: event.continuation,
          continuations: [...(run.continuations ?? []), event.continuation],
          status: 'running',
          completedAt: undefined,
          userAttachments: eventUserAttachments(event.userAttachments) ?? run.userAttachments,
          summary: undefined,
          error: undefined,
        }),
        event.id,
      )
    case 'message.delta':
      return updateRun(
        state,
        event.runId,
        (run) => {
          const existing = run.messages.find((message) => message.id === event.messageId)
          const messages = existing
            ? run.messages.map((message) =>
                message.id === event.messageId
                  ? { ...message, text: message.text + event.text, streaming: true }
                  : message,
              )
            : [...run.messages, { id: event.messageId, text: event.text, streaming: true }]
          return { ...run, messages }
        },
        event.id,
      )
    case 'message.completed':
      return updateRun(
        state,
        event.runId,
        (run) => {
          const existing = run.messages.some((message) => message.id === event.messageId)
          const messages = existing
            ? run.messages.map((message) =>
                message.id === event.messageId
                  ? { ...message, text: event.text ?? message.text, streaming: false }
                  : message,
              )
            : [...run.messages, { id: event.messageId, text: event.text ?? '', streaming: false }]
          return { ...run, messages }
        },
        event.id,
      )
    case 'reasoning.delta':
      return updateRun(
        state,
        event.runId,
        (run) => ({
          ...run,
          reasoning: {
            text: (run.reasoning?.text ?? '') + event.text,
            status: 'streaming',
            round: event.round ?? run.reasoning?.round,
          },
        }),
        event.id,
      )
    case 'reasoning.status':
      return updateRun(
        state,
        event.runId,
        (run) => ({
          ...run,
          reasoning: {
            text: run.reasoning?.text ?? '',
            status: event.status,
            round: event.round ?? run.reasoning?.round,
          },
        }),
        event.id,
      )
    case 'task.plan.created':
      return updateRun(
        state,
        event.runId,
        (run) => {
          const steps = event.plan.steps.map((step) => ({
            id: step.id,
            title: step.title,
            status: step.status ?? 'planned',
            toolCallId: step.toolCallId,
            toolCallIds: step.toolCallIds,
            artifactRefs: step.artifactRefs,
            risk: step.risk,
          }))
          return {
            ...run,
            plan: {
              id: event.plan.id,
              goal: event.plan.goal,
              status: planStatusFromSteps(steps, run.status),
              steps,
            },
          }
        },
        event.id,
      )
    case 'task.plan.approval_required':
      return updateRun(
        state,
        event.runId,
        (run) => {
          if (!run.plan || run.plan.id !== event.planId) return run
          return {
            ...run,
            plan: {
              ...run.plan,
              status: 'awaiting-approval',
            },
          }
        },
        event.id,
      )
    case 'task.plan.steps_replanned':
      return updateRun(
        state,
        event.runId,
        (run) => {
          if (!run.plan) return run
          const anchorIndex = run.plan.steps.findIndex((step) => step.id === event.anchorStepId)
          if (anchorIndex < 0) return run
          const replacementSteps = event.steps.map((step) => ({
            id: step.id,
            title: step.title,
            status: step.status ?? 'planned',
            toolCallId: step.toolCallId,
            toolCallIds: step.toolCallIds,
            artifactRefs: step.artifactRefs,
            risk: step.risk,
            error: event.reason
              ? {
                  code: 'task_step_replanned',
                  message: event.reason,
                  category: 'tool' as const,
                }
              : undefined,
          }))
          const steps = [...run.plan.steps.slice(0, anchorIndex), ...replacementSteps]
          return {
            ...run,
            status: 'running',
            plan: {
              ...run.plan,
              status: 'running',
              steps,
            },
          }
        },
        event.id,
      )
    case 'task.step.retry_requested':
      return updateRun(
        state,
        event.runId,
        (run) => {
          if (!run.plan) return run
          const steps = run.plan.steps.map((step) =>
            step.id === event.stepId
              ? {
                  ...step,
                  status: 'retrying' as const,
                  error: event.reason
                    ? {
                        code: 'task_step_retry_requested',
                        message: event.reason,
                        category: 'tool' as const,
                      }
                    : undefined,
                }
              : step,
          )
          return {
            ...run,
            status: 'running',
            plan: { ...run.plan, status: planStatusFromSteps(steps, 'running'), steps },
          }
        },
        event.id,
      )
    case 'task.step.skipped':
      return updateRun(
        state,
        event.runId,
        (run) => {
          if (!run.plan) return run
          const steps = run.plan.steps.map((step) =>
            step.id === event.stepId
              ? {
                  ...step,
                  status: 'skipped' as const,
                  error: event.reason
                    ? {
                        code: 'task_step_skipped',
                        message: event.reason,
                        category: 'tool' as const,
                      }
                    : undefined,
                }
              : step,
          )
          return {
            ...run,
            plan: { ...run.plan, status: planStatusFromSteps(steps, run.status), steps },
          }
        },
        event.id,
      )
    case 'task.step.replan_requested':
      return updateRun(
        state,
        event.runId,
        (run) => {
          if (!run.plan) return run
          const steps = run.plan.steps.map((step) =>
            step.id === event.stepId
              ? {
                  ...step,
                  status: 'planned' as const,
                  error: {
                    code: 'task_step_replan_requested',
                    message: event.reason ?? 'Replanning requested.',
                    category: 'tool' as const,
                  },
                }
              : step,
          )
          return {
            ...run,
            status: 'running',
            plan: { ...run.plan, status: 'running', steps },
          }
        },
        event.id,
      )
    case 'task.step.tool_linked':
      return updateRun(
        state,
        event.runId,
        (run) => {
          if (!run.plan) return run
          const steps = run.plan.steps.map((step) => {
            if (step.id !== event.stepId) return step
            const toolCallIds = Array.from(
              new Set(
                [...(step.toolCallIds ?? []), step.toolCallId, event.toolCallId].filter(Boolean),
              ),
            ) as string[]
            return {
              ...step,
              toolCallId: step.toolCallId ?? event.toolCallId,
              toolCallIds,
              risk: event.risk ?? step.risk,
            }
          })
          return {
            ...run,
            plan: {
              ...run.plan,
              status: planStatusFromSteps(steps, run.status),
              steps,
            },
          }
        },
        event.id,
      )
    case 'task.step.updated':
      return updateRun(
        state,
        event.runId,
        (run) => {
          if (!run.plan) return run
          const steps = run.plan.steps.map((step) =>
            step.id === event.stepId ||
            step.toolCallId === event.stepId ||
            (step.toolCallIds ?? []).includes(event.stepId)
              ? {
                  ...step,
                  status: event.status,
                  risk: event.risk ?? step.risk,
                  artifactRefs: mergeUnique(step.artifactRefs, event.artifactRefs),
                  error: event.error ?? step.error,
                }
              : step,
          )
          return {
            ...run,
            plan: {
              ...run.plan,
              status: planStatusFromSteps(steps, run.status),
              steps,
            },
          }
        },
        event.id,
      )
    case 'tool.requested':
      return updateRun(
        state,
        event.runId,
        (run) =>
          run.tools.some((tool) => tool.call.id === event.call.id)
            ? run
            : withToolSyncedPlan({
                ...run,
                tools: [...run.tools, { call: event.call, status: 'requested' }],
              }),
        event.id,
      )
    case 'tool.approval_required':
      return updateRun(
        state,
        event.runId,
        (run) =>
          withToolSyncedPlan(
            updateTool(run, event.callId, (tool) => ({
              ...tool,
              status: 'awaiting-approval',
              risk: event.risk,
              approvalReason: event.reason,
            })),
          ),
        event.id,
      )
    case 'tool.started':
      return updateRun(
        state,
        event.runId,
        (run) =>
          withToolSyncedPlan(
            updateTool(run, event.callId, (tool) => ({ ...tool, status: 'running' })),
          ),
        event.id,
      )
    case 'tool.completed':
      return updateRun(
        state,
        event.runId,
        (run) =>
          withToolSyncedPlan(
            updateTool(run, event.callId, (tool) => ({
              ...tool,
              status: 'completed',
              result: event.result,
            })),
          ),
        event.id,
      )
    case 'tool.failed':
      return updateRun(
        state,
        event.runId,
        (run) =>
          withToolSyncedPlan(
            updateTool(run, event.callId, (tool) => ({
              ...tool,
              status: 'failed',
              error: event.error,
            })),
          ),
        event.id,
      )
    case 'tool.cancelled':
      return updateRun(
        state,
        event.runId,
        (run) =>
          withToolSyncedPlan(
            updateTool(run, event.callId, (tool) => ({
              ...tool,
              status: 'cancelled',
              error: event.reason
                ? { code: 'tool_cancelled', message: event.reason, category: 'tool' }
                : undefined,
            })),
          ),
        event.id,
      )
    case 'scene.changed':
      return updateRun(
        state,
        event.runId,
        (run) => ({ ...run, scenePatches: [...run.scenePatches, event.patch] }),
        event.id,
      )
    case 'usage.updated':
      return updateRun(state, event.runId, (run) => ({ ...run, usage: event.usage }), event.id)
    case 'run.completed':
      return updateRun(
        state,
        event.runId,
        (run) => {
          const hasVisibleReply = run.messages.some((message) => message.text.trim().length > 0)
          const messages = hasVisibleReply
            ? run.messages
            : [
                ...run.messages.filter((message) => message.text.trim().length > 0),
                {
                  id: `${event.runId}:empty-visible-reply`,
                  text: EMPTY_VISIBLE_REPLY,
                  streaming: false,
                },
              ]
          return withToolSyncedPlan({
            ...stopRunStreaming(run),
            status: 'completed',
            completedAt: event.timestamp,
            summary: event.summary,
            messages,
          })
        },
        event.id,
      )
    case 'run.cancelled':
      return updateRun(
        state,
        event.runId,
        (run) =>
          withToolSyncedPlan({
            ...finishUnsettledTools(stopRunStreaming(run), 'cancelled'),
            status: 'cancelled',
            completedAt: event.timestamp,
            summary: event.reason,
          }),
        event.id,
      )
    case 'run.failed':
      return updateRun(
        state,
        event.runId,
        (run) =>
          withToolSyncedPlan({
            ...finishUnsettledTools(stopRunStreaming(run), 'failed', event.error),
            status: 'failed',
            completedAt: event.timestamp,
            error: event.error,
          }),
        event.id,
      )
  }
}
