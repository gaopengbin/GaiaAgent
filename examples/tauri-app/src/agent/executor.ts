import { invoke } from '@tauri-apps/api/core'
import type { PlanStep, StepResult, ResultMeta } from '../types'
import type { Plan } from './types'

function parseDataUrl(value: string): { mediaType: string; base64: string } | null {
  if (!value.startsWith('data:')) return null
  const commaIdx = value.indexOf(',')
  if (commaIdx < 0) return null
  const meta = value.slice(0, commaIdx)
  const base64 = value.slice(commaIdx + 1)
  const mediaType = meta.split(';')[0].replace('data:', '')
  return { mediaType, base64 }
}

export function normalizeToolResult(raw: unknown): StepResult {
  let output = ''
  let image: string | undefined
  let mediaType: string | undefined
  let meta: ResultMeta | undefined

  function extract(val: unknown): void {
    if (val == null) return
    if (typeof val === 'string') {
      const du = parseDataUrl(val)
      if (du) {
        image = du.base64
        mediaType = du.mediaType
      } else {
        try {
          extract(JSON.parse(val))
        } catch {
          if (val && !output.includes(val)) {
            output += (output ? '\n' : '') + val
          }
        }
      }
      return
    }
    if (Array.isArray(val)) {
      for (const item of val) extract(item)
      return
    }
    if (typeof val === 'object') {
      const obj = val as Record<string, unknown>
      if (typeof obj.output === 'string') output += (output ? '\n' : '') + obj.output
      if (typeof obj.text === 'string') output += (output ? '\n' : '') + obj.text
      if (typeof obj.message === 'string') output += (output ? '\n' : '') + obj.message
      if (typeof obj.image === 'string') image = obj.image
      if (typeof obj.mediaType === 'string') mediaType = obj.mediaType
      if (typeof obj.mimeType === 'string') mediaType = obj.mimeType
      if (typeof obj.dataUrl === 'string') {
        const du = parseDataUrl(obj.dataUrl)
        if (du) { image = du.base64; mediaType = du.mediaType }
      }
      // Extract entity/layer IDs for data asset tracking
      if (typeof obj.entityId === 'string') { meta = meta ?? {}; meta.entityId = obj.entityId }
      if (typeof obj.id === 'string' && !meta?.layerId) { meta = meta ?? {}; meta.layerId = obj.id }
      if (typeof obj.name === 'string' && !meta?.layerName) { meta = meta ?? {}; meta.layerName = obj.name as string }
      if (obj.data !== undefined) {
        // Array data — include each item as text so it's visible in UI
        if (Array.isArray(obj.data) && obj.data.length > 0) {
          for (const item of obj.data) {
            if (typeof item === 'object' && item !== null) {
              output += (output ? '\n' : '') + JSON.stringify(item)
            }
          }
        }
        // Object data containing nested arrays (e.g., {layers: [...]})
        if (typeof obj.data === 'object' && !Array.isArray(obj.data) && obj.data !== null) {
          for (const val of Object.values(obj.data as Record<string, unknown>)) {
            if (Array.isArray(val) && val.length > 0) {
              for (const item of val) {
                if (typeof item === 'object' && item !== null) {
                  output += (output ? '\n' : '') + JSON.stringify(item)
                }
              }
            }
          }
        }
        extract(obj.data)
      }
      if (obj.content !== undefined) extract(obj.content)
      if (obj.result !== undefined) extract(obj.result)
      if (obj.response !== undefined) extract(obj.response)
    }
  }

  extract(raw)

  if (!output.trim() && !image) {
    const obj = raw as Record<string, unknown> | null
    if (obj && obj.ok === true && typeof obj.sent === 'number') {
      output = 'Command executed'
    } else {
      output = typeof raw === 'string' ? raw : JSON.stringify(raw)
    }
  }

  return { output: output || undefined, image, mediaType, meta }
}

export type ToolCaller = (name: string, params: Record<string, unknown>) => Promise<unknown>

const defaultCallTool: ToolCaller = (name, params) =>
  invoke<unknown>('call_tool', { name, params })

export async function executePlan(
  plan: Plan,
  onStepUpdate: (step: PlanStep) => void,
  callTool: ToolCaller = defaultCallTool,
): Promise<void> {
  for (const step of plan.steps) {
    step.status = 'running'
    onStepUpdate({ ...step })

    const t0 = performance.now()
    try {
      const raw = await callTool(step.tool, step.params ?? {})
      const result = normalizeToolResult(raw)
      step.result = result
      step.status = 'done'
      console.log(`[GaiaAgent] Step ${step.id} "${step.tool}" done in ${(performance.now() - t0).toFixed(0)}ms`)
    } catch (err) {
      step.status = 'failed'
      step.error = String(err)
      step.result = { output: String(err) }
      console.log(`[GaiaAgent] Step ${step.id} "${step.tool}" failed in ${(performance.now() - t0).toFixed(0)}ms: ${err}`)
    }

    onStepUpdate({ ...step })
  }
}
