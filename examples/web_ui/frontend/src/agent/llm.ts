import { invoke } from '@tauri-apps/api/core'
import { Channel } from '@tauri-apps/api/core'
import type { LlmMessage, ModelSettings } from './types'

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

function buildLlmUrl(settings: ModelSettings): string {
  if (settings.provider === 'ollama') {
    const host = settings.ollamaHost || 'http://localhost:11434'
    const base = host.endsWith('/v1') ? host : `${host.replace(/\/+$/, '')}/v1`
    return `${base}/chat/completions`
  }
  const base = settings.openaiBaseUrl || 'https://api.openai.com/v1'
  return `${base}/chat/completions`
}

function buildLlmHeaders(settings: ModelSettings): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.provider === 'ollama') {
    headers['Authorization'] = 'Bearer ollama'
  } else {
    const key = settings.openaiApiKey || 'sk-placeholder'
    headers['Authorization'] = `Bearer ${key}`
  }
  return headers
}

function buildLlmBody(messages: LlmMessage[], settings: ModelSettings, stream = false): string {
  const model = settings.provider === 'ollama'
    ? (settings.ollamaModel || 'qwen2.5:7b')
    : (settings.openaiModel || 'gpt-4o-mini')

  const payload: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages,
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  }

  // Ollama OpenAI-compat endpoint supports num_ctx via options
  if (settings.provider === 'ollama') {
    payload.options = { num_ctx: 16384 }
  }

  return JSON.stringify(payload)
}

export interface LlmResult {
  content: string
  usage?: TokenUsage
}

export async function callLlm(
  messages: LlmMessage[],
  settings: ModelSettings,
): Promise<LlmResult> {
  const url = buildLlmUrl(settings)
  const headers = buildLlmHeaders(settings)
  const body = buildLlmBody(messages, settings)

  const resp = await invoke<{ status: number; body: unknown }>('ai_fetch', {
    url,
    method: 'POST',
    headers,
    body,
  })

  if (resp.status >= 400) {
    throw new Error(`LLM request failed (HTTP ${resp.status}): ${JSON.stringify(resp.body)}`)
  }

  const data = resp.body as {
    choices?: Array<{
      message?: { content?: string; reasoning_content?: string }
      finish_reason?: string
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }
  const choice = data?.choices?.[0]
  const content = choice?.message?.content || choice?.message?.reasoning_content
  if (!content) {
    const reason = choice?.finish_reason
    if (reason === 'length') {
      throw new Error('LLM token 上限不足，思维链耗尽了 max_tokens，请增大配额或换用更大模型')
    }
    throw new Error('LLM 返回内容为空，请检查模型配置')
  }

  const usage = data?.usage ? {
    promptTokens: data.usage.prompt_tokens ?? 0,
    completionTokens: data.usage.completion_tokens ?? 0,
    totalTokens: data.usage.total_tokens ?? 0,
  } : undefined

  return { content, usage }
}

export interface StreamChunk {
  data?: string
  done?: boolean
}

export async function streamLlm(
  messages: LlmMessage[],
  settings: ModelSettings,
  onChunk: (delta: string) => void,
  requestId?: string,
  onReasoning?: (delta: string) => void,
): Promise<LlmResult> {
  const url = buildLlmUrl(settings)
  const headers = buildLlmHeaders(settings)
  const body = buildLlmBody(messages, settings, true)

  const id = requestId ?? `stream-${Date.now()}`
  let fullContent = ''
  let usage: TokenUsage | undefined

  const channel = new Channel<StreamChunk>()
  channel.onmessage = (msg: StreamChunk) => {
    if (msg.done) return
    if (msg.data) {
      try {
        const parsed = JSON.parse(msg.data) as {
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        }
        // Capture usage from final chunk (OpenAI stream_options.include_usage)
        if (parsed.usage) {
          usage = {
            promptTokens: parsed.usage.prompt_tokens ?? 0,
            completionTokens: parsed.usage.completion_tokens ?? 0,
            totalTokens: parsed.usage.total_tokens ?? 0,
          }
        }
        const reasoning = parsed?.choices?.[0]?.delta?.reasoning_content ?? ''
        const content = parsed?.choices?.[0]?.delta?.content ?? ''
        if (reasoning) {
          if (onReasoning) {
            onReasoning(reasoning)
          } else {
            fullContent += reasoning
            onChunk(reasoning)
          }
        }
        if (content) {
          fullContent += content
          onChunk(content)
        }
      } catch {
        // Skip unparseable SSE data lines
      }
    }
  }

  await invoke('ai_stream', {
    url,
    method: 'POST',
    headers,
    body,
    requestId: id,
    onEvent: channel,
  })

  return { content: fullContent, usage }
}

export async function cancelLlm(requestId: string): Promise<void> {
  await invoke('ai_cancel', { requestId })
}
