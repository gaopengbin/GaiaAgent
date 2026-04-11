import type { PlanStep } from '../types'

export interface Plan {
  goal: string
  steps: PlanStep[]
  reply?: string   // 纯对话回复（无需工具调用时）
}

export interface ToolSchema {
  name: string
  description: string
  inputSchema: {
    type: string
    properties: Record<string, { type?: string; description?: string }>
    required?: string[]
  }
  _meta?: { toolset?: string; [key: string]: unknown }
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ModelSettings {
  provider: string
  ollamaHost: string
  ollamaModel: string
  openaiBaseUrl: string
  openaiApiKey: string
  openaiModel: string
  cesiumIonToken: string
  tiandituToken: string
  proxyUrl: string
}

// ---- Context Memory ----

/** 单轮对话记录 */
export interface ConversationEntry {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/** 场景中的图层 */
export interface SceneLayer {
  id: string
  type: string       // 'geojson' | '3dtiles' | 'imagery' | 'terrain'
  source: string
}

/** 场景中的标注/标记（marker, label, billboard） */
export interface SceneLabel {
  id: string       // bridge 返回的 entityId
  text: string
  lat: number
  lon: number
}

/** 相机状态 */
export interface CameraState {
  lat: number
  lon: number
  height: number
}

/** 完整场景状态 */
export interface SceneState {
  camera: CameraState | null
  layers: SceneLayer[]
  labels: SceneLabel[]
}
