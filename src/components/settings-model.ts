export interface ModelSettings {
  provider: 'ollama' | 'openai_compat' | 'anthropic' | 'ccswitch' | 'ccswitch_claude'
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
  contextCompactionMode: 'semantic' | 'structured' | 'recent'
  contextMaxTurns: number
  contextMaxBytes: number
}

export const defaultSettings: ModelSettings = {
  provider: 'ollama',
  agentRuntime: 'native',
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:7b',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiApiKey: '',
  hasOpenaiApiKey: false,
  openaiModel: 'gpt-4o-mini',
  anthropicBaseUrl: 'https://api.anthropic.com',
  anthropicApiKey: '',
  hasAnthropicApiKey: false,
  anthropicModel: 'claude-sonnet-4-6',
  cesiumIonToken: '',
  tiandituToken: '',
  proxyUrl: '',
  approvalMode: 'balanced',
  contextCompactionMode: 'semantic',
  contextMaxTurns: 100,
  contextMaxBytes: 512 * 1024,
}
