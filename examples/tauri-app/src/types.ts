export type StepStatus = 'pending' | 'running' | 'done' | 'failed'

export interface StepResult {
  output?: string
  image?: string
  mediaType?: string
  meta?: ResultMeta
}

export interface ResultMeta {
  entityId?: string
  layerId?: string
  layerName?: string
}

export interface PlanStep {
  id: number
  description: string
  tool: string
  params?: Record<string, unknown>
  status: StepStatus
  error?: string | null
  result?: StepResult | null
  round?: number  // ReAct round (1-based); omitted for single-round plans
}

export type ChatRole = 'user' | 'agent' | 'system' | 'error'

export type DisplayItem =
  | { kind: 'chat'; id: string; role: ChatRole; text: string }
  | { kind: 'plan'; id: string; goal: string; steps: PlanStep[]; confirmed: boolean }
  | { kind: 'thinking'; id: string; text?: string; done?: boolean }

export type ConnStatus = 'connecting' | 'connected' | 'error' | 'disconnected'
