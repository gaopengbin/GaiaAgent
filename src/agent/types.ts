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

export interface ModelSettings {
  provider: string
  agentRuntime: 'native'
  ollamaHost: string
  ollamaModel: string
  openaiBaseUrl: string
  openaiApiKey: string
  hasOpenaiApiKey: boolean
  openaiModel: string
  anthropicBaseUrl: string
  anthropicApiKey: string
  hasAnthropicApiKey: boolean
  anthropicModel: string
  cesiumIonToken: string
  tiandituToken: string
  proxyUrl: string
  approvalMode: 'safe' | 'balanced' | 'auto'
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
  type: string // 'geojson' | '3dtiles' | 'imagery' | 'terrain'
  source: string
  name?: string
  visible?: boolean
  dataRefId?: string
}

/** 场景中的标注/标记（marker, label, billboard） */
export interface SceneLabel {
  id: string // bridge 返回的 entityId
  text: string
  lat: number
  lon: number
  height?: number
  type?: string
}

/** 相机状态 */
export interface CameraState {
  lat: number
  lon: number
  height: number
}

/** 完整场景状态 */
export interface SceneState {
  revision: number
  camera: CameraState | null
  layers: SceneLayer[]
  labels: SceneLabel[]
  activeObjectRef?: string | null
  recentObjectRefs?: string[]
  assets: Record<string, SpatialAsset>
}

export interface SpatialAsset {
  ref: string
  id: string
  kind: 'layer' | 'entity' | 'asset'
  name?: string
  type: string
  visible?: boolean
  dataRefId?: string
  position?: CameraState
  lastCallId?: string
  source?: 'agent' | 'user' | 'snapshot' | 'import' | 'mcp' | string
  locked?: boolean
  render?: Record<string, unknown>
  uri?: string
  crs?: string
  geometryType?: string
  featureCount?: number
  bbox?: [number, number, number, number]
  schema?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface ScenePatch {
  revision: number
  callId?: string
  cameraChanged: boolean
  added: SpatialAsset[]
  updated: SpatialAsset[]
  removed: string[]
}
