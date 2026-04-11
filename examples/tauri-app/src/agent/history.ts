import type { PlanStep } from '../types'
import type {
  ConversationEntry,
  LlmMessage,
  Plan,
  SceneState,
} from './types'

// ---- Constants ----

const DEFAULT_MAX_ENTRIES = 10
const DEFAULT_MAX_ENTRY_LENGTH = 800
const STEP_OUTPUT_MAX = 200

// ---- Conversation History ----

export function appendUserEntry(
  history: ConversationEntry[],
  text: string,
): void {
  history.push({ role: 'user', content: text, timestamp: Date.now() })
}

export function appendAssistantEntry(
  history: ConversationEntry[],
  plan: Plan,
  steps: PlanStep[],
): void {
  const lines = [`目标: ${plan.goal}`]
  for (const s of steps) {
    const status = s.status === 'done' ? 'OK' : 'FAIL'
    const output = s.result?.output
      ? `: ${String(s.result.output).slice(0, STEP_OUTPUT_MAX)}`
      : ''
    lines.push(`  ${s.id}. ${s.tool} [${status}]${output}`)
  }
  history.push({ role: 'assistant', content: lines.join('\n'), timestamp: Date.now() })
}

export interface HistoryOptions {
  maxEntries?: number
  maxEntryLength?: number
}

export function buildHistoryMessages(
  history: ConversationEntry[],
  opts?: HistoryOptions,
): LlmMessage[] {
  const max = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES
  const maxLen = opts?.maxEntryLength ?? DEFAULT_MAX_ENTRY_LENGTH
  const recent = history.slice(-(max * 2))
  return recent.map(e => ({
    role: e.role,
    content: e.content.length > maxLen
      ? e.content.slice(0, maxLen) + '\n...(truncated)'
      : e.content,
  }))
}

// ---- Scene State ----

export function createSceneState(): SceneState {
  return { camera: null, layers: [], labels: [] }
}

export function updateSceneState(state: SceneState, step: PlanStep): void {
  if (step.status !== 'done') return
  const p = step.params ?? {}
  const meta = step.result?.meta

  switch (step.tool) {
    // ---- Camera ----
    case 'flyTo':
    case 'setView':
    case 'lookAtTransform':
      if (p.latitude != null && p.longitude != null) {
        state.camera = {
          lat: Number(p.latitude),
          lon: Number(p.longitude),
          height: Number(p.height ?? p.altitude ?? 10000),
        }
      }
      break

    // ---- Layers ----
    case 'addGeoJsonLayer':
    case 'addDataSource':
      state.layers.push({
        id: meta?.layerId ?? String(p.id ?? p.name ?? `layer-${state.layers.length}`),
        type: 'geojson',
        source: step.description,
      })
      break
    case 'add3DTileset':
    case 'load3DTiles':
      state.layers.push({
        id: meta?.layerId ?? String(p.id ?? p.name ?? `tileset-${state.layers.length}`),
        type: '3dtiles',
        source: step.description,
      })
      break

    // ---- Entities (markers, labels, billboards) ----
    case 'addLabel':
    case 'addMarker':
    case 'addBillboard':
      if (p.latitude != null && p.longitude != null) {
        state.labels.push({
          id: meta?.entityId ?? `entity-${state.labels.length}`,
          text: String(p.text ?? p.label ?? p.name ?? step.tool),
          lat: Number(p.latitude),
          lon: Number(p.longitude),
        })
      }
      break

    // ---- Clear all ----
    case 'removeAll':
    case 'clearAll':
    case 'clearEntities':
    case 'removeAllDataSources':
      state.layers = []
      state.labels = []
      break

    // ---- Remove single entity ----
    case 'removeEntity':
      if (p.entityId != null || p.id != null) {
        const eid = String(p.entityId ?? p.id)
        state.labels = state.labels.filter(lb => lb.id !== eid)
      }
      break

    // ---- Remove layer ----
    case 'removeDataSource':
    case 'removeLayer':
      if (p.id != null) {
        state.layers = state.layers.filter(l => l.id !== String(p.id))
      }
      break
  }
}

export function formatSceneContext(state: SceneState): string {
  const lines: string[] = []

  if (state.camera) {
    lines.push(
      `Camera: lat=${state.camera.lat}, lon=${state.camera.lon}, height=${state.camera.height}m`,
    )
  }

  if (state.layers.length > 0) {
    lines.push('Layers on map:')
    for (const l of state.layers) {
      lines.push(`  - id="${l.id}" type=${l.type} — ${l.source}`)
    }
  }

  if (state.labels.length > 0) {
    lines.push('Entities on map (markers/labels):')
    for (const lb of state.labels) {
      lines.push(`  - id="${lb.id}" text="${lb.text}" at (${lb.lat}, ${lb.lon})`)
    }
  }

  return lines.length > 0
    ? '\n\nCurrent scene state:\n' + lines.join('\n')
    : ''
}
