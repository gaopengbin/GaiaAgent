import { useState, useCallback, useRef, useEffect } from 'react'
import { Channel, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { FileUIPart } from 'ai'
import type { ConnStatus } from '../types'
import { uid } from '../lib/utils'
import {
  agentTimelineReducer,
  applyAiSandboxPatch,
  createAgentEvent,
  initialAgentTimelineState,
  normalizeAgentTimelineState,
  toAgentError,
} from '../agent'
import { createSceneState } from '../agent/history'
import {
  buildSceneExportPayload,
  sceneExportFilename,
  sceneFromExportPayload,
} from '../agent/scene-export'
import { buildSceneMarkdownReport } from '../agent/scene-report'
import { buildSceneDeliverablesManifest } from '../agent/scene-deliverables'
import {
  buildSceneDeliverablesPackageFiles,
  buildSceneDeliverablesZipBlob,
  readSceneDeliverablesPackageFromZip,
  type SceneDeliverablesPackageReadResult,
} from '../agent/scene-deliverables-package'
import { buildSceneDeliverablesImportSummary } from '../agent/scene-deliverables-import-summary'
import {
  assetCsvFilename,
  assetGeoJsonFilename,
  deliverablesManifestFilename,
  deliverablesPackageFilename,
  markdownReportFilename,
} from '../agent/export-filenames'
import { geoJsonToCsv } from '../agent/geojson-csv'
import { mergeMissingSceneAssets } from '../agent/scene-reconcile'
import { buildSceneReplayCommands } from '../agent/scene-replay'
import { applySceneSnapshot, syncSceneCollections } from '../agent/scene-state'
import type {
  AgentEvent,
  AgentRunContinuation,
  AgentTimelineState,
  AgentToolCall,
  ToolSchema,
  ModelSettings,
  SceneState,
  SpatialAsset,
} from '../agent'
import { BRIDGE_SCENE_SNAPSHOT_EVENT, type BridgeSceneSnapshotDetail } from './useBridgeWS'

type NativeRuntimeEvent =
  | {
      type: 'phase_changed'
      phase:
        'thinking' | 'awaiting_approval' | 'executing_tool' | 'completed' | 'cancelled' | 'failed'
    }
  | {
      type: 'provider'
      event:
        | { type: 'text_delta' | 'reasoning_delta'; text: string }
        | {
            type: 'tool_call'
            call: { id: string; name: string; arguments: Record<string, unknown> }
          }
        | { type: 'usage'; usage: { inputTokens: number; outputTokens: number } }
        | { type: 'completed' }
    }
  | {
      type: 'task_plan_created'
      plan: {
        id: string
        goal: string
        steps: Array<{
          id: string
          title: string
          toolCallId?: string
          status: 'planned' | 'awaiting-approval' | 'running' | 'completed' | 'failed' | 'cancelled'
          risk?: 'read' | 'scene-write' | 'network' | 'filesystem' | 'process'
        }>
      }
    }
  | {
      type: 'task_plan_approval_required'
      plan_id: string
    }
  | {
      type: 'task_step_tool_linked'
      step_id: string
      tool_call_id: string
      title?: string
      risk?: 'read' | 'scene-write' | 'network' | 'filesystem' | 'process'
    }
  | {
      type: 'task_step_updated'
      step_id: string
      status: 'planned' | 'awaiting-approval' | 'running' | 'completed' | 'failed' | 'cancelled'
      risk?: 'read' | 'scene-write' | 'network' | 'filesystem' | 'process'
      error?: string
      artifact_refs?: string[]
    }
  | {
      type: 'approval_required'
      call: { id: string; name: string; arguments: Record<string, unknown> }
      risk: 'read' | 'scene-write' | 'network' | 'filesystem' | 'process'
    }
  | { type: 'tool_started'; call: { id: string; name: string; arguments: Record<string, unknown> } }
  | { type: 'tool_completed'; call_id: string; output: string }
  | { type: 'tool_failed'; call_id: string; error: string }

interface McpServerConfig {
  command?: string
  args: string[]
  env: Record<string, string>
  enabled?: boolean
  transport?: 'stdio' | 'streamable-http'
  url?: string
  auth?: 'none' | 'oauth'
  oauthScopes?: string[]
}

function changedMcpServerIds(paths: string[]) {
  return new Set(
    paths
      .map((path) => path.match(/^\$\.servers\.([^.]+)/)?.[1])
      .filter((id): id is string => Boolean(id)),
  )
}

export interface ChatSessionSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

interface RecoveredTaskStepToolCall {
  runId: string
  stepId: string
  retryCallId: string
  call: AgentToolCall
}

interface RemainingTaskSteps {
  runId: string
  skippedStepId: string
  replayableStepCount: number
  planningStepCount: number
  steps: Array<{
    id: string
    title: string
    status: string
    risk?: 'read' | 'scene-write' | 'network' | 'filesystem' | 'process'
    approvalRequired: boolean
    latestCall?: AgentToolCall
    replayCallId?: string
  }>
}

interface ReplannedTaskSteps {
  runId: string
  anchorStepId: string
  reason: string
  continuationPrompt: string
  steps: Array<{
    id: string
    title: string
    status: 'planned'
  }>
}

interface PendingReplayApproval {
  runId: string
  stepId: string
  title: string
  call: AgentToolCall
}

export interface PendingDeliverablesImportPreview {
  fileName: string
  fileSize: number
  summary: string
  manifest?: SceneDeliverablesPackageReadResult['manifest']
  packageIndex?: SceneDeliverablesPackageReadResult['packageIndex']
  integrity?: SceneDeliverablesPackageReadResult['integrity']
}

interface PendingDeliverablesImport {
  preview: PendingDeliverablesImportPreview
  packageData: SceneDeliverablesPackageReadResult
  imported: SceneState
}

interface SendTextOptions {
  runId?: string
  continueExistingRun?: boolean
}

interface NativeUserAttachment {
  filename?: string
  mediaType: string
  dataUrl: string
}

function imageMediaTypeFromAttachment(file: FileUIPart): string | undefined {
  if (file.mediaType?.startsWith('image/')) return file.mediaType
  if (file.url?.startsWith('data:image/')) {
    return file.url.slice(5, file.url.indexOf(';')) || 'image/png'
  }
  const filename = file.filename?.toLowerCase() ?? ''
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg'
  if (filename.endsWith('.webp')) return 'image/webp'
  if (filename.endsWith('.gif')) return 'image/gif'
  if (filename.endsWith('.png')) return 'image/png'
  return undefined
}

function normalizeImageDataUrl(dataUrl: string, mediaType: string) {
  if (!dataUrl.startsWith('data:')) return dataUrl
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return dataUrl
  const payload = dataUrl.slice(commaIndex + 1)
  return `data:${mediaType};base64,${payload}`
}

function nativeUserAttachments(files: FileUIPart[] = []): NativeUserAttachment[] {
  return files
    .map((file) => ({ file, mediaType: imageMediaTypeFromAttachment(file) }))
    .filter(({ file, mediaType }) => !!mediaType && file.url?.startsWith('data:'))
    .map(({ file, mediaType }) => ({
      filename: file.filename,
      mediaType: mediaType ?? 'image/png',
      dataUrl: normalizeImageDataUrl(file.url ?? '', mediaType ?? 'image/png'),
    }))
}

interface ReplayableBridge {
  clearAll?: () => unknown
  addGeoJsonLayer?: (params: Record<string, unknown>) => unknown
  addMarker?: (params: Record<string, unknown>) => unknown
  addPolyline?: (params: Record<string, unknown>) => unknown
  addPolygon?: (params: Record<string, unknown>) => unknown
  addModel?: (params: Record<string, unknown>) => unknown
  addBillboard?: (params: Record<string, unknown>) => unknown
  addBox?: (params: Record<string, unknown>) => unknown
  addCylinder?: (params: Record<string, unknown>) => unknown
  addEllipse?: (params: Record<string, unknown>) => unknown
  addRectangle?: (params: Record<string, unknown>) => unknown
  addWall?: (params: Record<string, unknown>) => unknown
  addCorridor?: (params: Record<string, unknown>) => unknown
  updateEntity?: (params: Record<string, unknown>) => unknown
  setLayerVisibility?: (id: string, visible: boolean) => unknown
  zoomToLayer?: (id: string) => unknown
  trackEntity?: (params: Record<string, unknown>) => unknown
  flyTo?: (params: Record<string, unknown>) => unknown
  zoomToExtent?: (params: Record<string, unknown>) => unknown
  setView?: (params: Record<string, unknown>) => unknown
  exportScene?: () => unknown
}

const SESSION_STORAGE_KEY = 'gaia-agent.chat-sessions.v1'
const SESSION_TIMELINE_PREFIX = 'gaia-agent.chat-timeline.'
const SESSION_SCENE_PREFIX = 'gaia-agent.scene-state.'
const MAX_LOCAL_SCENE_CACHE_BYTES = 1_500_000
const TASK_PLAN_SNAPSHOT_VERSION = 1 as const

function fallbackSession(): ChatSessionSummary {
  const now = Date.now()
  return { id: 'default', title: '默认会话', createdAt: now, updatedAt: now }
}

function saveSessions(sessions: ChatSessionSummary[]) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions))
}

function loadSessions(): ChatSessionSummary[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '[]')
    if (Array.isArray(parsed) && parsed.length > 0) {
      const sessions = parsed.filter((session): session is ChatSessionSummary => {
        return (
          typeof session?.id === 'string' &&
          typeof session?.title === 'string' &&
          typeof session?.createdAt === 'number' &&
          typeof session?.updatedAt === 'number'
        )
      })
      if (sessions.length > 0) return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    }
  } catch {
    // Ignore invalid local cache.
  }
  return [fallbackSession()]
}

function timelineKey(sessionId: string) {
  return `${SESSION_TIMELINE_PREFIX}${sessionId}`
}

function sceneKey(sessionId: string) {
  return `${SESSION_SCENE_PREFIX}${sessionId}`
}

function loadTimeline(sessionId: string): AgentTimelineState {
  try {
    const parsed = JSON.parse(localStorage.getItem(timelineKey(sessionId)) ?? 'null')
    return normalizeAgentTimelineState(parsed)
  } catch {
    // Ignore invalid local cache.
  }
  return initialAgentTimelineState
}

function hasTaskPlan(timeline: AgentTimelineState) {
  return Object.values(timeline.runs).some((run) => !!run.plan)
}

function createTaskPlanSnapshot(sessionId: string, timeline: AgentTimelineState) {
  return {
    version: TASK_PLAN_SNAPSHOT_VERSION,
    sessionId,
    savedAt: Date.now(),
    timeline,
  }
}

function timelineFromTaskPlanSnapshot(snapshot: unknown): AgentTimelineState | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const candidate = snapshot as { timeline?: unknown }
  const timeline = normalizeAgentTimelineState(candidate.timeline)
  return hasTaskPlan(timeline) ? timeline : null
}

function isSceneState(value: unknown): value is SceneState {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Partial<SceneState>).revision === 'number' &&
    ((value as Partial<SceneState>).camera === null ||
      typeof (value as Partial<SceneState>).camera === 'object') &&
    Array.isArray((value as Partial<SceneState>).layers) &&
    Array.isArray((value as Partial<SceneState>).labels) &&
    ((value as Partial<SceneState>).activeObjectRef === undefined ||
      (value as Partial<SceneState>).activeObjectRef === null ||
      typeof (value as Partial<SceneState>).activeObjectRef === 'string') &&
    ((value as Partial<SceneState>).recentObjectRefs === undefined ||
      Array.isArray((value as Partial<SceneState>).recentObjectRefs)) &&
    (value as Partial<SceneState>).assets !== null &&
    typeof (value as Partial<SceneState>).assets === 'object'
  )
}

function cloneSceneState(scene: SceneState): SceneState {
  return {
    revision: scene.revision,
    camera: scene.camera ? { ...scene.camera } : null,
    layers: scene.layers.map((layer) => ({ ...layer })),
    labels: scene.labels.map((label) => ({ ...label })),
    activeObjectRef: scene.activeObjectRef ?? null,
    recentObjectRefs: (scene.recentObjectRefs ?? []).filter(
      (reference) => typeof reference === 'string' && scene.assets[reference],
    ),
    assets: Object.fromEntries(
      Object.entries(scene.assets).map(([ref, asset]) => [
        ref,
        {
          ...asset,
          position: asset.position ? { ...asset.position } : undefined,
          source: asset.source,
          locked: asset.locked,
          render: asset.render ? { ...asset.render } : undefined,
        },
      ]),
    ),
  }
}

function loadSceneState(sessionId: string): SceneState {
  try {
    const parsed = JSON.parse(localStorage.getItem(sceneKey(sessionId)) ?? 'null')
    if (isSceneState(parsed)) return cloneSceneState(parsed)
  } catch {
    // Ignore invalid local cache.
  }
  return createSceneState()
}

function saveSceneState(sessionId: string, scene: SceneState) {
  const key = sceneKey(sessionId)
  try {
    const payload = JSON.stringify(cloneSceneState(scene))
    if (payload.length > MAX_LOCAL_SCENE_CACHE_BYTES) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, payload)
  } catch (error) {
    localStorage.removeItem(key)
    console.warn('[agent] skipped local scene cache:', error)
  }
}

function isEmptySceneState(scene: SceneState) {
  return (
    scene.layers.length === 0 &&
    scene.labels.length === 0 &&
    Object.keys(scene.assets).length === 0 &&
    scene.camera === null
  )
}

function hasSceneContent(scene: SceneState) {
  return scene.layers.length > 0 || scene.labels.length > 0 || Object.keys(scene.assets).length > 0
}

function bridgeSnapshotHasContent(snapshot: unknown) {
  if (!isRecord(snapshot)) return false
  return (
    (Array.isArray(snapshot.layers) && snapshot.layers.length > 0) ||
    (Array.isArray(snapshot.entities) && snapshot.entities.length > 0)
  )
}

function cameraForBbox(bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox
  const lon = (west + east) / 2
  const lat = (south + north) / 2
  const span = Math.max(Math.abs(east - west), Math.abs(north - south), 0.01)
  return {
    longitude: lon,
    latitude: lat,
    height: Math.max(1200, span * 180_000),
  }
}

function sceneAssetDisplayName(asset: SpatialAsset) {
  return asset.name || asset.id || asset.ref
}

function entityLayerPrefix(asset: SpatialAsset) {
  const type = asset.type.trim().toLowerCase()
  if (type === 'point') return 'marker'
  if (
    [
      'marker',
      'polyline',
      'polygon',
      'model',
      'billboard',
      'box',
      'cylinder',
      'ellipse',
      'rectangle',
      'wall',
      'corridor',
    ].includes(type)
  ) {
    return type
  }
  return undefined
}

function layerMatchesEntity(layer: SpatialAsset, entity: SpatialAsset) {
  if (layer.kind !== 'layer' || entity.kind !== 'entity') return false
  const prefix = entityLayerPrefix(entity)
  if (
    prefix &&
    (layer.id === `${prefix}_${entity.id}` || layer.dataRefId === `${prefix}_${entity.id}`)
  ) {
    return true
  }
  const sameCall =
    layer.lastCallId !== undefined &&
    entity.lastCallId !== undefined &&
    layer.lastCallId === entity.lastCallId
  const sameName =
    (layer.name || layer.id).trim().toLowerCase() ===
    (entity.name || entity.id).trim().toLowerCase()
  if (sameCall && sameName) return true
  if (
    sameCall &&
    ['marker', 'point', 'billboard'].includes(entity.type.trim().toLowerCase()) &&
    layer.id.startsWith('marker_')
  ) {
    return true
  }
  if (sameCall && entity.type.trim().toLowerCase() === 'label' && layer.id.startsWith('label_')) {
    return true
  }
  return false
}

function isProtectedSceneAsset(asset: SpatialAsset) {
  return asset.locked || !['agent', 'mcp'].includes(asset.source ?? 'snapshot')
}

function confirmSceneAction(message: string) {
  if (typeof window === 'undefined') return true
  return window.confirm(message)
}

function pickJsonFile() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function pickGeoJsonFile() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/geo+json,application/json,.geojson,.json'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function pickCsvFile() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'text/csv,.csv'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function pickZipFile() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/zip,.zip'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsText(file, 'utf-8')
  })
}

function safeAssetIdFromFilename(name: string) {
  const withoutExtension = name.replace(/\.[^.]+$/, '')
  const normalized = withoutExtension
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || `geojson-${Date.now()}`
}

function splitCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function parseCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  if (lines.length < 2) throw new Error('CSV 至少需要表头和一行数据')
  const headers = splitCsvLine(lines[0]).map((header) => header.trim())
  if (headers.length === 0 || headers.some((header) => !header)) {
    throw new Error('CSV 表头不能为空')
  }
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] ?? ''
    })
    return row
  })
  return { headers, rows }
}

function normalizedFieldName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

function findCsvCoordinateFields(headers: string[]) {
  const longitudeNames = new Set(['lon', 'lng', 'longitude', 'long', 'x', '经度', '經度', '东经'])
  const latitudeNames = new Set(['lat', 'latitude', 'y', '纬度', '緯度', '北纬'])
  const longitude =
    headers.find((header) => longitudeNames.has(normalizedFieldName(header))) ??
    headers.find((header) => normalizedFieldName(header).includes('longitude'))
  const latitude =
    headers.find((header) => latitudeNames.has(normalizedFieldName(header))) ??
    headers.find((header) => normalizedFieldName(header).includes('latitude'))
  if (!longitude || !latitude) {
    throw new Error('未识别经纬度字段，请使用 lon/lng/longitude/经度 和 lat/latitude/纬度 等字段名')
  }
  return { longitude, latitude }
}

function csvRowsToPointGeoJson(
  headers: string[],
  rows: Array<Record<string, string>>,
  longitudeField: string,
  latitudeField: string,
): GeoJsonData {
  const features = rows.flatMap((row, index) => {
    const longitude = Number(row[longitudeField])
    const latitude = Number(row[latitudeField])
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return []
    const properties: Record<string, unknown> = { ...row, __rowIndex: index + 1 }
    delete properties[longitudeField]
    delete properties[latitudeField]
    return [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        properties,
      } satisfies GeoJsonFeature,
    ]
  })
  if (features.length === 0) throw new Error('CSV 中没有可用的经纬度点位')
  return {
    type: 'FeatureCollection',
    features,
    properties: {
      sourceHeaders: headers,
      longitudeField,
      latitudeField,
    },
  }
}

type GeoJsonPosition = number[]
type GeoJsonGeometry = {
  type?: string
  coordinates?: unknown
  geometries?: GeoJsonGeometry[]
}
type GeoJsonFeature = {
  type?: string
  geometry?: GeoJsonGeometry | null
  properties?: Record<string, unknown> | null
}
type GeoJsonData = {
  type?: string
  features?: GeoJsonFeature[]
  geometry?: GeoJsonGeometry
  properties?: Record<string, unknown> | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function coordinateDepth(value: unknown): number {
  if (!Array.isArray(value)) return 0
  if (value.length >= 2 && value.every((item) => typeof item === 'number')) return 1
  return Math.max(0, ...value.map(coordinateDepth))
}

function collectPositions(value: unknown, positions: GeoJsonPosition[]) {
  if (!Array.isArray(value)) return
  if (value.length >= 2 && value.every((item) => typeof item === 'number')) {
    positions.push(value as GeoJsonPosition)
    return
  }
  for (const item of value) collectPositions(item, positions)
}

function geometryKind(type?: string, coordinates?: unknown) {
  const normalized = type?.toLowerCase()
  if (normalized?.includes('point')) return 'point'
  if (normalized?.includes('line')) return 'line'
  if (normalized?.includes('polygon')) return 'polygon'
  const depth = coordinateDepth(coordinates)
  if (depth === 1) return 'point'
  if (depth === 2) return 'line'
  if (depth >= 3) return 'polygon'
  return 'unknown'
}

function collectGeometryInfo(
  geometry: GeoJsonGeometry | null | undefined,
  kinds: Set<string>,
  positions: GeoJsonPosition[],
) {
  if (!geometry) return
  if (geometry.type === 'GeometryCollection') {
    for (const child of geometry.geometries ?? []) collectGeometryInfo(child, kinds, positions)
    return
  }
  kinds.add(geometryKind(geometry.type, geometry.coordinates))
  collectPositions(geometry.coordinates, positions)
}

function inferGeoJsonMetadata(data: GeoJsonData) {
  const features =
    data.type === 'FeatureCollection' && Array.isArray(data.features)
      ? data.features
      : data.type === 'Feature'
        ? [data as GeoJsonFeature]
        : [
            {
              type: 'Feature',
              geometry: data.geometry ?? (data as GeoJsonGeometry),
              properties: data.properties,
            },
          ]
  const kinds = new Set<string>()
  const positions: GeoJsonPosition[] = []
  const schema: Record<string, { type: string }> = {}

  for (const feature of features) {
    collectGeometryInfo(feature.geometry, kinds, positions)
    if (isRecord(feature.properties)) {
      for (const [key, value] of Object.entries(feature.properties)) {
        if (!schema[key]) {
          schema[key] = {
            type: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
          }
        }
      }
    }
  }

  const finitePositions = positions.filter(
    (position) => Number.isFinite(position[0]) && Number.isFinite(position[1]),
  )
  const bbox =
    finitePositions.length > 0
      ? ([
          Math.min(...finitePositions.map((position) => position[0])),
          Math.min(...finitePositions.map((position) => position[1])),
          Math.max(...finitePositions.map((position) => position[0])),
          Math.max(...finitePositions.map((position) => position[1])),
        ] as [number, number, number, number])
      : undefined
  const cleanKinds = [...kinds].filter((kind) => kind !== 'unknown')
  const geometryType =
    cleanKinds.length === 0 ? 'unknown' : cleanKinds.length === 1 ? cleanKinds[0] : 'mixed'

  return {
    featureCount: features.length,
    geometryType,
    bbox,
    schema: Object.keys(schema).length > 0 ? schema : undefined,
  }
}

function getReplayableBridge() {
  return (window as unknown as { __bridge?: ReplayableBridge }).__bridge
}

function waitForReplayableBridge(timeoutMs = 5000) {
  const startedAt = Date.now()
  return new Promise<ReplayableBridge | undefined>((resolve) => {
    const tick = () => {
      const bridge = getReplayableBridge()
      if (bridge || Date.now() - startedAt >= timeoutMs) {
        resolve(bridge)
        return
      }
      window.setTimeout(tick, 120)
    }
    tick()
  })
}

function nextBridgeFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

async function replaySceneOnBridge(scene: SceneState) {
  const bridge = getReplayableBridge()
  if (!bridge) {
    return {
      replayed: 0,
      skipped: Object.keys(scene.assets).length,
      failed: 0,
      bridgeReady: false,
      snapshot: null,
    }
  }

  let replayed = 0
  let failed = 0
  const commands = buildSceneReplayCommands(scene)
  if (commands.length > 0) {
    bridge.clearAll?.()
  }
  for (const command of commands) {
    const method = bridge[command.method]
    if (typeof method !== 'function') continue
    try {
      await Promise.resolve(method.call(bridge, command.params))
      replayed += 1
    } catch (error) {
      failed += 1
      console.warn(`[scene] failed to replay ${command.sourceRef}:`, error)
    }
  }
  if (scene.camera && typeof bridge.setView === 'function') {
    bridge.setView({
      latitude: scene.camera.lat,
      longitude: scene.camera.lon,
      height: scene.camera.height,
      heading: scene.camera.heading ?? 0,
      // Older persisted scenes only stored lon/lat/height. The bridge defaults
      // a missing pitch to -45°, which points into space at global-view heights.
      pitch: scene.camera.pitch ?? -90,
      roll: scene.camera.roll ?? 0,
      absolute: true,
    })
  }
  await nextBridgeFrame()
  return {
    replayed,
    skipped:
      Object.values(scene.assets).filter((asset) => asset.kind === 'entity').length -
      replayed -
      failed,
    failed,
    bridgeReady: true,
    snapshot: bridge.exportScene?.() ?? null,
  }
}

function findLatestToolCallForStep(
  timeline: AgentTimelineState,
  runId: string,
  stepId: string,
): AgentToolCall | null {
  const run = timeline.runs[runId]
  const step = run?.plan?.steps.find((candidate) => candidate.id === stepId)
  if (!run || !step) return null
  const callIds = new Set([step.id, step.toolCallId, ...(step.toolCallIds ?? [])].filter(Boolean))
  const tool = [...run.tools]
    .reverse()
    .find((candidate) => callIds.has(candidate.call.id) || candidate.call.id === stepId)
  return tool?.call ?? null
}

function stringifyToolOutput(output: unknown) {
  if (typeof output === 'string') return output
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function replayCallForRemainingStep(
  step: RemainingTaskSteps['steps'][number],
): AgentToolCall | null {
  if (!step.latestCall || !step.replayCallId || step.approvalRequired) return null
  return {
    ...step.latestCall,
    id: step.replayCallId,
    risk: step.risk ?? step.latestCall.risk,
    description: step.latestCall.description
      ? `${step.latestCall.description}（继续执行）`
      : `${step.latestCall.name}（继续执行）`,
  }
}

function startupErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.includes("Cannot read properties of undefined (reading 'invoke')") ||
    message.includes('__TAURI__') ||
    message.includes('not allowed on this window')
  ) {
    return '桌面运行时未连接：请在 GaiaAgent Tauri 桌面应用中运行，普通浏览器只能预览界面。'
  }
  return `启动失败: ${message}`
}

export function useTauriAgent() {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>(loadSessions)
  const [currentSessionId, setCurrentSessionId] = useState(() => sessions[0]?.id ?? 'default')
  const [timeline, setTimeline] = useState(() => loadTimeline(sessions[0]?.id ?? 'default'))
  const [status, setStatus] = useState<ConnStatus>('connecting')
  const [statusText, setStatusText] = useState('正在启动 Cesium 运行时…')
  const [runtimePort, setRuntimePort] = useState<number | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [pendingDeliverablesImport, setPendingDeliverablesImport] =
    useState<PendingDeliverablesImportPreview | null>(null)
  const [sceneState, setSceneState] = useState<SceneState>(() =>
    loadSceneState(sessions[0]?.id ?? 'default'),
  )
  const sceneRef = useRef<SceneState>(sceneState)
  const timelineRef = useRef<AgentTimelineState>(timeline)
  const pendingReplayApprovalRef = useRef<PendingReplayApproval | null>(null)
  const toolsRef = useRef<ToolSchema[]>([])
  const settingsRef = useRef<ModelSettings | null>(null)
  const currentRunIdRef = useRef<string | null>(null)
  const currentSessionIdRef = useRef(currentSessionId)
  const cancellationRequestedRef = useRef(false)
  const nativeApprovalRunRef = useRef<string | null>(null)
  const pendingDeliverablesImportRef = useRef<PendingDeliverablesImport | null>(null)

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId
  }, [currentSessionId])

  useEffect(() => {
    timelineRef.current = timeline
  }, [timeline])

  useEffect(() => {
    localStorage.setItem(timelineKey(currentSessionId), JSON.stringify(timeline))
    if (!hasTaskPlan(timeline)) return
    void invoke('agent_task_plan_save_snapshot', {
      sessionId: currentSessionId,
      snapshot: createTaskPlanSnapshot(currentSessionId, timeline),
    }).catch((error) => console.warn('[agent] failed to persist task plan snapshot:', error))
  }, [currentSessionId, timeline])

  useEffect(() => {
    if (hasTaskPlan(timeline)) return
    void invoke<unknown>('agent_task_plan_load_snapshot', { sessionId: currentSessionId })
      .then((snapshot) => {
        const remoteTimeline = timelineFromTaskPlanSnapshot(snapshot)
        if (!remoteTimeline) return
        setTimeline(remoteTimeline)
        localStorage.setItem(timelineKey(currentSessionId), JSON.stringify(remoteTimeline))
      })
      .catch((error) => console.warn('[agent] failed to load task plan snapshot:', error))
  }, [currentSessionId, timeline])

  const dispatchAgentEvent = useCallback((event: AgentEvent) => {
    setTimeline((state) => agentTimelineReducer(state, event))
    if (event.type === 'message.delta' || event.type === 'reasoning.delta') return
    const settings = settingsRef.current
    void invoke('trace_record_event', {
      event,
      provider: settings?.provider ?? null,
      runtime: 'native',
    }).catch((error) => console.warn('[trace] event persistence failed:', error))
  }, [])

  const publishSceneState = useCallback(
    (sessionId = currentSessionIdRef.current, persistRemote = true) => {
      const next = cloneSceneState(sceneRef.current)
      setSceneState(next)
      saveSceneState(sessionId, next)
      if (persistRemote) {
        void invoke('agent_scene_save_state', { sessionId, scene: next }).catch((error) =>
          console.warn('[agent] failed to persist scene state:', error),
        )
      }
    },
    [],
  )

  const replayCurrentSceneToBridge = useCallback(
    async (sessionId = currentSessionIdRef.current) => {
      const previousScene = cloneSceneState(sceneRef.current)
      const replay = await replaySceneOnBridge(sceneRef.current)
      if (!replay.bridgeReady) return replay
      if (replay.snapshot) {
        applySceneSnapshot(sceneRef.current, replay.snapshot, `session-restore:${sessionId}`)
        mergeMissingSceneAssets(sceneRef.current, previousScene, { preserveAll: true })
      }
      publishSceneState(sessionId)
      return replay
    },
    [publishSceneState],
  )

  const restoreSceneState = useCallback(
    (sessionId: string) => {
      const localScene = loadSceneState(sessionId)
      const localHasContent = hasSceneContent(localScene)
      sceneRef.current = localScene
      currentSessionIdRef.current = sessionId
      publishSceneState(sessionId, false)
      if (localHasContent && getReplayableBridge()) {
        void replayCurrentSceneToBridge(sessionId)
      } else if (localScene.camera && getReplayableBridge()) {
        void replaySceneOnBridge(localScene)
      }

      void invoke<SceneState>('agent_scene_get_state', { sessionId })
        .then((remoteScene) => {
          const remoteHasContent = hasSceneContent(remoteScene)
          if (
            remoteHasContent ||
            (!localHasContent &&
              (isEmptySceneState(localScene) || !hasSceneContent(sceneRef.current)))
          ) {
            sceneRef.current = cloneSceneState(remoteScene)
            publishSceneState(sessionId)
            if (remoteHasContent) {
              void replayCurrentSceneToBridge(sessionId)
            } else if (remoteScene.camera) {
              void replaySceneOnBridge(remoteScene)
            }
          } else if (localHasContent) {
            void invoke('agent_scene_save_state', { sessionId, scene: localScene }).catch((error) =>
              console.warn('[agent] failed to seed remote scene state:', error),
            )
          }
        })
        .catch((error) => console.warn('[agent] failed to load remote scene state:', error))
    },
    [publishSceneState, replayCurrentSceneToBridge],
  )

  const applyBridgeSceneSnapshot = useCallback(
    (snapshot: unknown, callId?: string, options: { preserveMissingAssets?: boolean } = {}) => {
      if (!callId && hasSceneContent(sceneRef.current) && !bridgeSnapshotHasContent(snapshot)) {
        return null
      }
      const previousScene = cloneSceneState(sceneRef.current)
      const patch = applySceneSnapshot(sceneRef.current, snapshot, callId)
      if (options.preserveMissingAssets !== false) {
        mergeMissingSceneAssets(sceneRef.current, previousScene, { preserveAll: true })
      }
      publishSceneState()
      const runId = currentRunIdRef.current
      if (patch && runId) {
        dispatchAgentEvent(createAgentEvent(runId, { type: 'scene.changed', patch }))
      }
      return patch
    },
    [dispatchAgentEvent, publishSceneState],
  )

  const touchSession = useCallback((sessionId: string, title?: string) => {
    setSessions((current) => {
      const now = Date.now()
      const next = current
        .map((session) =>
          session.id === sessionId
            ? { ...session, title: title ?? session.title, updatedAt: now }
            : session,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
      saveSessions(next)
      return next
    })
  }, [])

  const createSession = useCallback(() => {
    const now = Date.now()
    const session: ChatSessionSummary = {
      id: uid(),
      title: '新会话',
      createdAt: now,
      updatedAt: now,
    }
    setSessions((current) => {
      const next = [session, ...current]
      saveSessions(next)
      return next
    })
    sceneRef.current = createSceneState()
    currentSessionIdRef.current = session.id
    setCurrentSessionId(session.id)
    setTimeline(initialAgentTimelineState)
    publishSceneState(session.id)
    void invoke('agent_scene_clear_state', { sessionId: session.id }).catch((error) =>
      console.warn('[agent] failed to clear new session scene state:', error),
    )
    void invoke('agent_task_plan_clear_snapshot', { sessionId: session.id }).catch((error) =>
      console.warn('[agent] failed to clear new session task snapshot:', error),
    )
  }, [publishSceneState])

  const switchSession = useCallback(
    (sessionId: string) => {
      const localTimeline = loadTimeline(sessionId)
      setCurrentSessionId(sessionId)
      setTimeline(localTimeline)
      restoreSceneState(sessionId)
      if (!hasTaskPlan(localTimeline)) {
        void invoke<unknown>('agent_task_plan_load_snapshot', { sessionId })
          .then((snapshot) => {
            const remoteTimeline = timelineFromTaskPlanSnapshot(snapshot)
            if (!remoteTimeline) return
            setTimeline(remoteTimeline)
            localStorage.setItem(timelineKey(sessionId), JSON.stringify(remoteTimeline))
          })
          .catch((error) => console.warn('[agent] failed to load task plan snapshot:', error))
      }
    },
    [restoreSceneState],
  )

  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions((current) => {
        const remaining = current.filter((session) => session.id !== sessionId)
        const next = remaining.length > 0 ? remaining : [fallbackSession()]
        saveSessions(next)
        localStorage.removeItem(timelineKey(sessionId))
        localStorage.removeItem(sceneKey(sessionId))
        void invoke('agent_clear_session', { sessionId }).catch((error) =>
          console.warn('[agent] failed to clear native session:', error),
        )
        void invoke('agent_task_plan_clear_snapshot', { sessionId }).catch((error) =>
          console.warn('[agent] failed to clear task plan snapshot:', error),
        )
        if (currentSessionIdRef.current === sessionId) {
          setCurrentSessionId(next[0].id)
          setTimeline(loadTimeline(next[0].id))
          restoreSceneState(next[0].id)
        }
        return next
      })
    },
    [restoreSceneState],
  )

  const clearCurrentContext = useCallback(async () => {
    const sessionId = currentSessionIdRef.current
    await invoke('agent_clear_context', { sessionId }).catch((error) => {
      console.warn('[agent] failed to clear native context:', error)
      throw error
    })
    await invoke('agent_task_plan_clear_snapshot', { sessionId }).catch((error) => {
      console.warn('[agent] failed to clear task plan snapshot:', error)
      throw error
    })
    setStatusText('当前会话上下文已清空')
  }, [])

  const compactCurrentContext = useCallback(async () => {
    const sessionId = currentSessionIdRef.current
    await invoke('agent_compact_session', { sessionId }).catch((error) => {
      console.warn('[agent] failed to compact native session:', error)
      throw error
    })
    setStatusText('当前会话上下文已压缩')
  }, [])

  const updateModelSettings = useCallback((settings: ModelSettings) => {
    settingsRef.current = { ...settings, agentRuntime: 'native' }
  }, [])

  const startMcpServerFromConfig = useCallback(async (id: string, cfg: McpServerConfig) => {
    window.dispatchEvent(new CustomEvent('mcp-server-starting', { detail: id }))
    try {
      if (cfg.transport === 'streamable-http' && cfg.url) {
        await invoke(cfg.auth === 'oauth' ? 'mcp_connect_remote_oauth' : 'mcp_connect_remote', {
          serverId: id,
          url: cfg.url,
        })
      } else {
        await invoke('mcp_start_server', {
          serverId: id,
          command: cfg.command,
          args: cfg.args,
          env: Object.keys(cfg.env ?? {}).length > 0 ? cfg.env : null,
        })
      }
      window.dispatchEvent(new CustomEvent('mcp-server-started', { detail: id }))
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('mcp-server-failed', {
          detail: { id, error: String(error) },
        }),
      )
      throw error
    }
  }, [])

  const refreshMcpStatus = useCallback(async () => {
    try {
      const runningServers = await invoke<string[]>('mcp_list_servers')
      let mcpToolCount = 0
      for (const serverId of runningServers) {
        try {
          const result = await invoke<{ tools: ToolSchema[] }>('mcp_list_tools', { serverId })
          mcpToolCount += result.tools?.length ?? 0
        } catch (error) {
          console.error(`Failed to list tools for MCP server '${serverId}':`, error)
        }
      }
      const mcpSuffix = mcpToolCount > 0 ? ` + ${mcpToolCount} MCP` : ''
      setStatusText(`已连接，${toolsRef.current.length} 个 GIS 工具就绪${mcpSuffix}`)
    } catch (error) {
      console.error('Failed to refresh MCP status:', error)
    }
  }, [])

  const applySandboxPatchAndStartMcp = useCallback(
    async (patchId: string) => {
      try {
        setStatusText('正在应用 AI 配置补丁…')
        const result = await applyAiSandboxPatch(patchId)
        if (result.patch.target !== 'mcp-servers') {
          setStatusText('配置补丁已应用')
          return result
        }
        const proposed = result.patch.proposed as { servers?: Record<string, McpServerConfig> }
        const servers = proposed.servers ?? {}
        const running = new Set(await invoke<string[]>('mcp_list_servers').catch(() => []))
        const changedIds = changedMcpServerIds(result.patch.changedPaths)
        const enabled = Object.entries(servers).filter(
          ([id, cfg]) => cfg.enabled !== false && (changedIds.size === 0 || changedIds.has(id)),
        )
        for (const [id, cfg] of enabled) {
          if (running.has(id)) continue
          setStatusText(`正在启动 MCP: ${id}…`)
          await startMcpServerFromConfig(id, cfg)
        }
        window.dispatchEvent(new Event('mcp-tools-changed'))
        await refreshMcpStatus()
        setStatusText(
          enabled.length > 0
            ? `配置已应用，MCP 已就绪：${enabled.map(([id]) => id).join(', ')}`
            : '配置已应用，没有需要启动的 MCP',
        )
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatusText(`应用配置失败：${message}`)
        throw error
      }
    },
    [refreshMcpStatus, startMcpServerFromConfig],
  )

  useEffect(() => {
    let mounted = true

    const handleSceneSnapshot = (event: Event) => {
      if (!mounted) return
      const detail = (event as CustomEvent<BridgeSceneSnapshotDetail>).detail
      applyBridgeSceneSnapshot(detail.snapshot, detail.callId)
    }

    async function init() {
      try {
        const [settings, mcpCfg] = await Promise.all([
          invoke<ModelSettings>('load_model_settings'),
          invoke<{ servers: Record<string, McpServerConfig> }>('mcp_load_config').catch(() => ({
            servers: {},
          })),
        ])
        if (!mounted) return
        settingsRef.current = { ...settings, agentRuntime: 'native' }

        console.log('[GaiaAgent] Starting controlled Cesium bridge runtime')
        const port = await invoke<number>('start_runtime')
        if (!mounted) return
        setRuntimePort(port)
        toolsRef.current = await invoke<ToolSchema[]>('list_tools')
        if (!mounted) return

        setStatus('connected')
        void waitForReplayableBridge().then(() => {
          if (!mounted) return
          restoreSceneState(currentSessionIdRef.current)
        })
        setStatusText(`已连接，${toolsRef.current.length} 个 GIS 工具就绪`)

        const toStart = Object.entries(mcpCfg.servers).filter(([, cfg]) => cfg.enabled)
        if (toStart.length > 0) {
          const names = toStart.map(([id]) => id).join(', ')
          setStatusText(`启动 MCP: ${names}...`)
          for (const [id, cfg] of toStart) {
            try {
              setStatusText(`启动 MCP: ${id}...`)
              window.dispatchEvent(new CustomEvent('mcp-server-starting', { detail: id }))
              if (cfg.transport === 'streamable-http' && cfg.url) {
                await invoke(
                  cfg.auth === 'oauth' ? 'mcp_connect_remote_oauth' : 'mcp_connect_remote',
                  { serverId: id, url: cfg.url },
                )
              } else {
                await invoke('mcp_start_server', {
                  serverId: id,
                  command: cfg.command,
                  args: cfg.args,
                  env: Object.keys(cfg.env ?? {}).length > 0 ? cfg.env : null,
                })
              }
            } catch (error) {
              console.error(`[GaiaAgent] MCP '${id}' auto-start failed:`, error)
              window.dispatchEvent(
                new CustomEvent('mcp-server-failed', {
                  detail: { id, error: String(error) },
                }),
              )
            } finally {
              window.dispatchEvent(new CustomEvent('mcp-server-started', { detail: id }))
            }
          }
          if (mounted) await refreshMcpStatus()
        }
      } catch (error) {
        if (!mounted) return
        setRuntimePort(null)
        setStatus('error')
        setStatusText(startupErrorMessage(error))
      }
    }

    window.addEventListener(BRIDGE_SCENE_SNAPSHOT_EVENT, handleSceneSnapshot as EventListener)
    void init()

    const handleMcpChanged = () => {
      void refreshMcpStatus()
    }
    window.addEventListener('mcp-tools-changed', handleMcpChanged)
    const unlistenMcpChanges = listen<string>('mcp-tools-changed', () => {
      void refreshMcpStatus()
    }).catch(() => undefined)

    return () => {
      mounted = false
      window.removeEventListener(BRIDGE_SCENE_SNAPSHOT_EVENT, handleSceneSnapshot as EventListener)
      window.removeEventListener('mcp-tools-changed', handleMcpChanged)
      void unlistenMcpChanges.then((dispose) => dispose?.())
    }
  }, [applyBridgeSceneSnapshot, refreshMcpStatus, restoreSceneState])

  const refreshSceneState = useCallback(
    async (options: { preserveStructuredAssets?: boolean } = {}) => {
      const snapshot = getReplayableBridge()?.exportScene?.()
      if (!snapshot) return
      applyBridgeSceneSnapshot(snapshot, undefined, {
        preserveMissingAssets: options.preserveStructuredAssets !== false,
      })
    },
    [applyBridgeSceneSnapshot],
  )

  const invokeSceneTool = useCallback(
    async (name: string, params: Record<string, unknown>) => {
      const sessionId = currentSessionIdRef.current
      await invoke('call_tool', {
        name,
        params,
        callId: `scene-panel:${Date.now()}`,
        sessionId,
      })
      if (name.startsWith('scene_')) {
        const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
        sceneRef.current = cloneSceneState(remoteScene)
        publishSceneState(sessionId)
        return
      }
      await refreshSceneState({ preserveStructuredAssets: name !== 'clearAll' })
    },
    [publishSceneState, refreshSceneState],
  )

  const patchSceneObjectRefs = useCallback(
    (refs: string[], patch: Partial<SpatialAsset>) => {
      const uniqueRefs = [...new Set(refs)]
      const nextAssets = { ...sceneRef.current.assets }
      let changed = false
      for (const ref of uniqueRefs) {
        const current = nextAssets[ref]
        if (!current) continue
        nextAssets[ref] = {
          ...current,
          ...patch,
          position: patch.position
            ? { ...patch.position }
            : current.position
              ? { ...current.position }
              : undefined,
          render: patch.render
            ? { ...patch.render }
            : current.render
              ? { ...current.render }
              : undefined,
        }
        changed = true
      }
      if (!changed) return
      sceneRef.current = {
        ...sceneRef.current,
        revision: sceneRef.current.revision + 1,
        assets: nextAssets,
      }
      syncSceneCollections(sceneRef.current)
      publishSceneState()
    },
    [publishSceneState],
  )

  const setSceneObjectVisibility = useCallback(
    async (asset: SpatialAsset, visible: boolean) => {
      const bridge = getReplayableBridge()
      let appliedToMap = false
      const allAssets = Object.values(sceneRef.current.assets)
      const relatedLayers =
        asset.kind === 'entity'
          ? allAssets.filter((candidate) => layerMatchesEntity(candidate, asset))
          : []
      const relatedEntities =
        asset.kind === 'layer'
          ? allAssets.filter((candidate) => layerMatchesEntity(asset, candidate))
          : []
      const primaryLayer = asset.kind === 'layer' ? asset : relatedLayers[0]
      if (bridge) {
        try {
          if (primaryLayer && typeof bridge.setLayerVisibility === 'function') {
            await Promise.resolve(bridge.setLayerVisibility(primaryLayer.id, visible))
            appliedToMap = true
          } else if (asset.kind === 'entity' && typeof bridge.updateEntity === 'function') {
            appliedToMap = !!(await Promise.resolve(
              bridge.updateEntity({ entityId: asset.id, show: visible }),
            ))
          }
        } catch (error) {
          console.warn('[scene] direct visibility update failed:', error)
        }
      }
      if (appliedToMap) {
        patchSceneObjectRefs(
          [
            asset.ref,
            primaryLayer?.ref,
            ...relatedLayers.map((layer) => layer.ref),
            ...relatedEntities.map((entity) => entity.ref),
          ].filter((ref): ref is string => typeof ref === 'string'),
          { visible },
        )
        await refreshSceneState()
        return
      }
      await invokeSceneTool('scene_set_visibility', { ref: asset.ref, visible })
    },
    [invokeSceneTool, patchSceneObjectRefs, refreshSceneState],
  )

  const renameSceneObject = useCallback(
    async (asset: SpatialAsset) => {
      const currentName = sceneAssetDisplayName(asset)
      const nextName = window.prompt('输入新的对象名称', currentName)?.trim()
      if (!nextName || nextName === currentName) return
      await invokeSceneTool('scene_rename_object', { ref: asset.ref, name: nextName })
    },
    [invokeSceneTool],
  )

  const deleteSceneObject = useCallback(
    async (asset: SpatialAsset) => {
      if (asset.locked) {
        setStatusText('对象已锁定，请先解锁再删除')
        return
      }
      if (
        isProtectedSceneAsset(asset) &&
        !confirmSceneAction(
          `确定删除“${sceneAssetDisplayName(asset)}”吗？\n\n这个对象来源是 ${
            asset.source ?? 'snapshot'
          }，删除后会从当前地图场景中移除。`,
        )
      ) {
        return
      }
      await invokeSceneTool('scene_delete_object', { ref: asset.ref })
    },
    [invokeSceneTool],
  )

  const selectSceneObject = useCallback(
    (asset: SpatialAsset | null) => {
      const activeObjectRef = asset?.ref ?? null
      const currentRecent = sceneRef.current.recentObjectRefs ?? []
      const recentObjectRefs = activeObjectRef
        ? [activeObjectRef, ...currentRecent.filter((reference) => reference !== activeObjectRef)]
            .filter((reference) => sceneRef.current.assets[reference])
            .slice(0, 5)
        : currentRecent.filter((reference) => sceneRef.current.assets[reference])
      if (
        sceneRef.current.activeObjectRef === activeObjectRef &&
        JSON.stringify(sceneRef.current.recentObjectRefs ?? []) === JSON.stringify(recentObjectRefs)
      ) {
        return
      }
      sceneRef.current = {
        ...sceneRef.current,
        revision: sceneRef.current.revision + 1,
        activeObjectRef,
        recentObjectRefs,
      }
      publishSceneState()
    },
    [publishSceneState],
  )

  const setAllSceneObjectsVisibility = useCallback(
    async (visible: boolean) => {
      const assets = Object.values(sceneRef.current.assets)
      for (const asset of assets) {
        if (asset.visible === visible || (asset.visible === undefined && visible)) continue
        await setSceneObjectVisibility(asset, visible)
      }
      await refreshSceneState()
    },
    [refreshSceneState, setSceneObjectVisibility],
  )

  const clearCurrentScene = useCallback(async () => {
    const count = Object.keys(sceneRef.current.assets).length
    if (
      count > 0 &&
      !confirmSceneAction(
        `确定清空当前场景吗？\n\n这会删除当前场景中的 ${count} 个对象，包括用户、导入和快照对象。`,
      )
    ) {
      return
    }
    await invokeSceneTool('clearAll', {})
  }, [invokeSceneTool])

  const clearAgentSceneObjects = useCallback(async () => {
    const targets = Object.values(sceneRef.current.assets).filter(
      (asset) => !asset.locked && ['agent', 'mcp'].includes(asset.source ?? ''),
    )
    if (
      targets.length > 0 &&
      !confirmSceneAction(`确定清空 ${targets.length} 个 AI/MCP 创建的未锁定对象吗？`)
    ) {
      return
    }
    await invokeSceneTool('scene_clear_agent_objects', {})
  }, [invokeSceneTool])

  const exportCurrentSceneJson = useCallback(async () => {
    const sessionId = currentSessionIdRef.current
    const previousScene = cloneSceneState(sceneRef.current)
    const snapshot = getReplayableBridge()?.exportScene?.()
    if (snapshot) {
      applySceneSnapshot(sceneRef.current, snapshot)
      mergeMissingSceneAssets(sceneRef.current, previousScene)
      publishSceneState(sessionId)
    }
    const exportedAt = new Date().toISOString()
    const payload = buildSceneExportPayload(sessionId, sceneRef.current, exportedAt)
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = sceneExportFilename(sessionId, exportedAt)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setStatusText(
      snapshot
        ? `已刷新地图快照并导出场景 JSON：${payload.objectCount} 个对象`
        : `已导出场景 JSON：${payload.objectCount} 个对象`,
    )
  }, [publishSceneState])

  const exportCurrentSceneMarkdownReport = useCallback(async () => {
    const sessionId = currentSessionIdRef.current
    const previousScene = cloneSceneState(sceneRef.current)
    const snapshot = getReplayableBridge()?.exportScene?.()
    if (snapshot) {
      applySceneSnapshot(sceneRef.current, snapshot)
      mergeMissingSceneAssets(sceneRef.current, previousScene)
      publishSceneState(sessionId)
    }
    const exportedAt = new Date().toISOString()
    const markdown = buildSceneMarkdownReport(sessionId, sceneRef.current, exportedAt)
    const blob = new Blob([markdown], {
      type: 'text/markdown;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = markdownReportFilename(sessionId, exportedAt)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setStatusText(`已导出 Markdown 报告：${Object.keys(sceneRef.current.assets).length} 个对象`)
  }, [publishSceneState])

  const exportCurrentDeliverablesManifest = useCallback(async () => {
    const sessionId = currentSessionIdRef.current
    const previousScene = cloneSceneState(sceneRef.current)
    const snapshot = getReplayableBridge()?.exportScene?.()
    if (snapshot) {
      applySceneSnapshot(sceneRef.current, snapshot)
      mergeMissingSceneAssets(sceneRef.current, previousScene)
      publishSceneState(sessionId)
    }
    const exportedAt = new Date().toISOString()
    const manifest = buildSceneDeliverablesManifest(sessionId, sceneRef.current, exportedAt)
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = deliverablesManifestFilename(sessionId, exportedAt)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setStatusText(`已导出成果清单：${manifest.counts.totalDeliverables} 个成果项`)
  }, [publishSceneState])

  const exportCurrentDeliverablesPackage = useCallback(async () => {
    const sessionId = currentSessionIdRef.current
    const previousScene = cloneSceneState(sceneRef.current)
    const snapshot = getReplayableBridge()?.exportScene?.()
    if (snapshot) {
      applySceneSnapshot(sceneRef.current, snapshot)
      mergeMissingSceneAssets(sceneRef.current, previousScene)
      publishSceneState(sessionId)
    }
    const exportedAt = new Date().toISOString()
    const files = buildSceneDeliverablesPackageFiles(sessionId, sceneRef.current, exportedAt)
    const zipBlob = await buildSceneDeliverablesZipBlob(files)
    const url = URL.createObjectURL(zipBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = deliverablesPackageFilename(sessionId, exportedAt)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setStatusText(`已导出成果包 ZIP：${files.length} 个文件`)
  }, [publishSceneState])

  const importSceneJson = useCallback(async () => {
    const file = await pickJsonFile()
    if (!file) return

    try {
      const text = await readTextFile(file)
      const parsed = JSON.parse(text)
      const imported = sceneFromExportPayload(parsed)
      if (!imported) {
        setStatusText('场景 JSON 格式不正确，未导入')
        return
      }

      const sessionId = currentSessionIdRef.current
      sceneRef.current = cloneSceneState({
        ...imported,
        revision: Math.max(sceneRef.current.revision, imported.revision) + 1,
      })
      const importedScene = cloneSceneState(sceneRef.current)
      const replay = await replaySceneOnBridge(sceneRef.current)
      let refreshedFromMap = false
      let preservedStructuredAssets = false
      if (replay.snapshot) {
        refreshedFromMap = !!applySceneSnapshot(
          sceneRef.current,
          replay.snapshot,
          'scene-import:replay',
        )
        preservedStructuredAssets = mergeMissingSceneAssets(sceneRef.current, importedScene, {
          preserveAll: true,
        })
      }
      publishSceneState(sessionId)
      const objectCount = Object.keys(sceneRef.current.assets).length
      const replaySyncSuffix =
        refreshedFromMap || preservedStructuredAssets ? '；已用地图快照校验同步' : ''
      if (!replay.bridgeReady) {
        setStatusText(`已导入场景 JSON：${objectCount} 个对象；地图运行时尚未就绪，稍后可刷新场景`)
      } else {
        setStatusText(
          `已导入场景 JSON：${objectCount} 个对象，已重绘 ${replay.replayed} 个，跳过 ${replay.skipped} 个，失败 ${replay.failed} 个`,
        )
      }
      if (replaySyncSuffix) {
        setStatusText((text) => `${text}${replaySyncSuffix}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatusText(`导入场景 JSON 失败：${message}`)
    }
  }, [publishSceneState])

  const applyDeliverablesPackageImport = useCallback(
    async (packageData: SceneDeliverablesPackageReadResult, imported: SceneState) => {
      const sessionId = currentSessionIdRef.current
      sceneRef.current = cloneSceneState({
        ...imported,
        revision: Math.max(sceneRef.current.revision, imported.revision) + 1,
      })
      const importedScene = cloneSceneState(sceneRef.current)
      const replay = await replaySceneOnBridge(sceneRef.current)
      let refreshedFromMap = false
      let preservedStructuredAssets = false
      if (replay.snapshot) {
        refreshedFromMap = !!applySceneSnapshot(
          sceneRef.current,
          replay.snapshot,
          'deliverables-package-import:replay',
        )
        preservedStructuredAssets = mergeMissingSceneAssets(sceneRef.current, importedScene, {
          preserveAll: true,
        })
      }
      publishSceneState(sessionId)
      const objectCount = Object.keys(sceneRef.current.assets).length
      const packageSummary = buildSceneDeliverablesImportSummary(packageData)
      const packageSummarySuffix = packageSummary ? `；${packageSummary}` : ''
      const replaySyncSuffix =
        refreshedFromMap || preservedStructuredAssets ? '；已用地图快照校验同步' : ''
      if (!replay.bridgeReady) {
        setStatusText(
          `已导入成果包 ZIP：${objectCount} 个对象${packageSummarySuffix}；地图运行时尚未就绪，稍后可刷新场景`,
        )
      } else {
        setStatusText(
          `已导入成果包 ZIP：${objectCount} 个对象${packageSummarySuffix}，已重绘 ${replay.replayed} 个，跳过 ${replay.skipped} 个，失败 ${replay.failed} 个`,
        )
      }
      if (replaySyncSuffix) {
        setStatusText((text) => `${text}${replaySyncSuffix}`)
      }
    },
    [publishSceneState],
  )

  const importDeliverablesPackage = useCallback(async () => {
    const file = await pickZipFile()
    if (!file) return

    try {
      const packageData = await readSceneDeliverablesPackageFromZip(file)
      const imported = sceneFromExportPayload(packageData.sceneExportPayload)
      if (!imported) {
        setStatusText('成果包 ZIP 中的 scene/scene.json 格式不正确，未导入')
        return
      }

      const summary = buildSceneDeliverablesImportSummary(packageData)
      const pending: PendingDeliverablesImport = {
        preview: {
          fileName: file.name,
          fileSize: file.size,
          summary,
          manifest: packageData.manifest,
          packageIndex: packageData.packageIndex,
          integrity: packageData.integrity,
        },
        packageData,
        imported,
      }
      pendingDeliverablesImportRef.current = pending
      setPendingDeliverablesImport(pending.preview)
      setStatusText(`已读取成果包 ZIP${summary ? `：${summary}` : ''}，等待确认导入`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatusText(`导入成果包 ZIP 失败：${message}`)
    }
  }, [])

  const confirmDeliverablesPackageImport = useCallback(() => {
    const pending = pendingDeliverablesImportRef.current
    if (!pending) return
    pendingDeliverablesImportRef.current = null
    setPendingDeliverablesImport(null)
    void applyDeliverablesPackageImport(pending.packageData, pending.imported)
  }, [applyDeliverablesPackageImport])

  const cancelDeliverablesPackageImport = useCallback(() => {
    if (!pendingDeliverablesImportRef.current) return
    pendingDeliverablesImportRef.current = null
    setPendingDeliverablesImport(null)
    setStatusText('已取消导入成果包 ZIP')
  }, [])

  const importGeoJsonFile = useCallback(async () => {
    const file = await pickGeoJsonFile()
    if (!file) return

    try {
      const text = await readTextFile(file)
      const parsed = JSON.parse(text) as GeoJsonData
      if (!isRecord(parsed) || !['FeatureCollection', 'Feature'].includes(String(parsed.type))) {
        setStatusText('GeoJSON 格式不正确，未导入')
        return
      }

      const sessionId = currentSessionIdRef.current
      const id = safeAssetIdFromFilename(file.name)
      const metadata = inferGeoJsonMetadata(parsed)
      const params = {
        id,
        name: file.name.replace(/\.[^.]+$/, '') || file.name,
        data: parsed,
        dataRefId: `file:${file.name}`,
        source: 'import',
        locked: true,
        type: 'vector',
        uri: `file:${file.name}`,
        crs: 'EPSG:4326',
        ...metadata,
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          importedAt: new Date().toISOString(),
          renderData: parsed,
          renderTool: 'addGeoJsonLayer',
        },
      }
      await invoke('call_tool', {
        name: 'addGeoJsonLayer',
        params,
        callId: `file-import:${id}`,
        sessionId,
      })
      const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
      sceneRef.current = cloneSceneState(remoteScene)
      publishSceneState(sessionId)
      setStatusText(
        `已导入 GeoJSON：${params.name}，${metadata.featureCount} 个要素，已生成 layer:${id} 和 asset:${id}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatusText(`导入 GeoJSON 失败：${message}`)
    }
  }, [publishSceneState])

  const importCsvFile = useCallback(async () => {
    const file = await pickCsvFile()
    if (!file) return

    try {
      const text = await readTextFile(file)
      const { headers, rows } = parseCsv(text)
      const { longitude, latitude } = findCsvCoordinateFields(headers)
      const geojson = csvRowsToPointGeoJson(headers, rows, longitude, latitude)
      const metadata = inferGeoJsonMetadata(geojson)
      const sessionId = currentSessionIdRef.current
      const id = safeAssetIdFromFilename(file.name)
      const params = {
        id,
        name: file.name.replace(/\.[^.]+$/, '') || file.name,
        data: geojson,
        dataRefId: `file:${file.name}`,
        source: 'import',
        locked: true,
        type: 'tabular',
        uri: `file:${file.name}`,
        crs: 'EPSG:4326',
        ...metadata,
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          importedAt: new Date().toISOString(),
          originalFormat: 'csv',
          longitudeField: longitude,
          latitudeField: latitude,
          rowCount: rows.length,
          renderData: geojson,
          renderTool: 'addGeoJsonLayer',
        },
      }
      await invoke('call_tool', {
        name: 'addGeoJsonLayer',
        params,
        callId: `file-import:${id}`,
        sessionId,
      })
      const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
      sceneRef.current = cloneSceneState(remoteScene)
      publishSceneState(sessionId)
      setStatusText(
        `已导入 CSV 点位：${params.name}，${metadata.featureCount} 个点，字段 ${longitude}/${latitude}，已生成 layer:${id} 和 asset:${id}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatusText(`导入 CSV 失败：${message}`)
    }
  }, [publishSceneState])

  const setSceneObjectLocked = useCallback(
    async (asset: SpatialAsset, locked: boolean) => {
      await invokeSceneTool('scene_set_locked', { ref: asset.ref, locked })
    },
    [invokeSceneTool],
  )

  const focusSceneObject = useCallback(
    async (asset: SpatialAsset) => {
      selectSceneObject(asset)
      const bridge = getReplayableBridge()
      let focusedOnMap = false
      if (bridge) {
        try {
          if (asset.kind === 'layer' && typeof bridge.zoomToLayer === 'function') {
            await Promise.resolve(bridge.zoomToLayer(asset.id))
            focusedOnMap = true
          } else if (asset.kind === 'entity' && typeof bridge.trackEntity === 'function') {
            await Promise.resolve(
              bridge.trackEntity({ entityId: asset.id, pitch: -35, range: 2_000 }),
            )
            focusedOnMap = true
          } else if (asset.bbox && typeof bridge.zoomToExtent === 'function') {
            await Promise.resolve(bridge.zoomToExtent({ bbox: asset.bbox, duration: 1 }))
            focusedOnMap = true
          } else if (asset.position && typeof bridge.flyTo === 'function') {
            await Promise.resolve(
              bridge.flyTo({
                longitude: asset.position.lon,
                latitude: asset.position.lat,
                height: Math.max(asset.position.height ?? 0, 1500),
                duration: 1,
              }),
            )
            focusedOnMap = true
          } else if (asset.bbox && typeof bridge.flyTo === 'function') {
            await Promise.resolve(bridge.flyTo({ ...cameraForBbox(asset.bbox), duration: 1 }))
            focusedOnMap = true
          }
        } catch (error) {
          console.warn('[scene] direct focus failed:', error)
        }
      }
      if (!focusedOnMap) {
        await invokeSceneTool('scene_focus_object', { ref: asset.ref })
      }
    },
    [invokeSceneTool, selectSceneObject],
  )

  const highlightSceneFeature = useCallback(
    async (
      asset: SpatialAsset,
      featureIndex?: number,
      options: { clear?: boolean; color?: string } = {},
    ) => {
      selectSceneObject(asset)
      const params: Record<string, unknown> = {
        ref: asset.ref,
        color: options.color ?? '#F59E0B',
      }
      if (featureIndex !== undefined) params.featureIndex = featureIndex
      if (options.clear) params.clear = true
      await invokeSceneTool('scene_highlight_feature', params)
      if (!options.clear && asset.bbox) {
        await invokeSceneTool('scene_focus_object', { ref: asset.ref })
      }
    },
    [invokeSceneTool, selectSceneObject],
  )

  const setFeatureReviewStatus = useCallback(
    async (
      asset: SpatialAsset,
      featureIndex: number,
      reviewStatus: 'pending' | 'confirmed' | 'excluded',
    ) => {
      selectSceneObject(asset)
      await invokeSceneTool('scene_set_feature_review_status', {
        ref: asset.ref,
        featureIndex,
        reviewStatus,
      })
      setStatusText(
        `已标记复核状态：${
          reviewStatus === 'confirmed'
            ? '已确认'
            : reviewStatus === 'excluded'
              ? '已排除'
              : '待复核'
        }`,
      )
    },
    [invokeSceneTool, selectSceneObject],
  )

  const addAssetToMap = useCallback(
    async (asset: SpatialAsset) => {
      if (asset.kind !== 'asset') return
      const renderData = asset.metadata?.renderData
      const renderTool = asset.metadata?.renderTool
      if (!renderData || renderTool !== 'addGeoJsonLayer') {
        setStatusText('这个数据资产还没有可直接添加到地图的渲染数据')
        return
      }
      const sessionId = currentSessionIdRef.current
      const params = {
        id: asset.id,
        name: asset.name ?? asset.id,
        data: renderData,
        dataRefId: asset.uri ?? asset.dataRefId ?? asset.id,
        source: asset.source ?? 'import',
        locked: asset.locked ?? true,
        type: asset.type,
        uri: asset.uri ?? asset.dataRefId,
        crs: asset.crs,
        geometryType: asset.geometryType,
        featureCount: asset.featureCount,
        bbox: asset.bbox,
        schema: asset.schema,
        metadata: {
          ...(asset.metadata ?? {}),
          reRenderedAt: new Date().toISOString(),
        },
      }
      try {
        await invoke('call_tool', {
          name: 'addGeoJsonLayer',
          params,
          callId: `asset-render:${asset.id}`,
          sessionId,
        })
        const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
        sceneRef.current = cloneSceneState(remoteScene)
        publishSceneState(sessionId)
        setStatusText(`已将数据资产添加到地图：layer:${asset.id}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatusText(`添加数据资产到地图失败：${message}`)
      }
    },
    [publishSceneState],
  )

  const createAssetBuffer = useCallback(
    async (asset: SpatialAsset, distanceMeters = 500) => {
      if (asset.kind !== 'asset') return
      if (asset.metadata?.renderTool !== 'addGeoJsonLayer' || !asset.metadata?.renderData) {
        setStatusText('这个数据资产还没有可用于缓冲区分析的 GeoJSON 数据')
        return
      }
      const sessionId = currentSessionIdRef.current
      try {
        await invoke('call_tool', {
          name: 'analysis_buffer',
          params: {
            ref: asset.ref,
            distanceMeters,
            resultId: `${asset.id}-buffer-${Math.round(distanceMeters)}m`,
            name: `${asset.name ?? asset.id} ${Math.round(distanceMeters)}m 缓冲区`,
          },
          callId: `analysis-buffer:${asset.id}`,
          sessionId,
        })
        const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
        sceneRef.current = cloneSceneState(remoteScene)
        publishSceneState(sessionId)
        setStatusText(
          `已生成缓冲区：asset:${asset.id}-buffer-${Math.round(distanceMeters)}m / layer:${asset.id}-buffer-${Math.round(distanceMeters)}m`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatusText(`生成缓冲区失败：${message}`)
      }
    },
    [publishSceneState],
  )

  const createNearestAnalysis = useCallback(
    async (source: SpatialAsset, target: SpatialAsset) => {
      if (source.kind !== 'asset' || target.kind !== 'asset') return
      if (!source.metadata?.renderData || !target.metadata?.renderData) {
        setStatusText('最近邻分析需要两个带有 GeoJSON 渲染数据的点资产')
        return
      }
      const sessionId = currentSessionIdRef.current
      const resultId = `${source.id}-nearest-${target.id}`.replace(/[^a-z0-9_-]+/gi, '-')
      try {
        await invoke('call_tool', {
          name: 'analysis_nearest',
          params: {
            sourceRef: source.ref,
            targetRef: target.ref,
            resultId,
            name: `${source.name ?? source.id} 到 ${target.name ?? target.id} 最近邻`,
          },
          callId: `analysis-nearest:${source.id}:${target.id}`,
          sessionId,
        })
        const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
        sceneRef.current = cloneSceneState(remoteScene)
        publishSceneState(sessionId)
        setStatusText(`已生成最近邻分析：asset:${resultId} / layer:${resultId}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatusText(`生成最近邻分析失败：${message}`)
      }
    },
    [publishSceneState],
  )

  const measureAsset = useCallback(
    async (asset: SpatialAsset) => {
      if (asset.kind !== 'asset') return
      if (asset.metadata?.renderTool !== 'addGeoJsonLayer' || !asset.metadata?.renderData) {
        setStatusText('这个数据资产还没有可用于量测的 GeoJSON 数据')
        return
      }
      const geometryType = asset.geometryType?.toLowerCase()
      if (geometryType && !['line', 'polygon', 'mixed'].includes(geometryType)) {
        setStatusText('量测目前支持线、面或混合 GeoJSON 资产')
        return
      }
      const sessionId = currentSessionIdRef.current
      const resultId = `${asset.id}-measure`.replace(/[^a-z0-9_-]+/gi, '-')
      try {
        await invoke('call_tool', {
          name: 'analysis_measure',
          params: {
            ref: asset.ref,
            resultId,
            name: `${asset.name ?? asset.id} 量测结果`,
          },
          callId: `analysis-measure:${asset.id}`,
          sessionId,
        })
        const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
        sceneRef.current = cloneSceneState(remoteScene)
        publishSceneState(sessionId)
        setStatusText(`已生成量测结果：asset:${resultId} / layer:${resultId}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatusText(`生成量测结果失败：${message}`)
      }
    },
    [publishSceneState],
  )

  const createSpatialJoinAnalysis = useCallback(
    async (pointAsset: SpatialAsset, polygonAsset: SpatialAsset) => {
      if (pointAsset.kind !== 'asset' || polygonAsset.kind !== 'asset') return
      if (!pointAsset.metadata?.renderData || !polygonAsset.metadata?.renderData) {
        setStatusText('点面统计需要一个点资产和一个面资产的 GeoJSON 渲染数据')
        return
      }
      const sessionId = currentSessionIdRef.current
      const resultId = `${polygonAsset.id}-count-${pointAsset.id}`.replace(/[^a-z0-9_-]+/gi, '-')
      try {
        await invoke('call_tool', {
          name: 'analysis_spatial_join',
          params: {
            pointRef: pointAsset.ref,
            polygonRef: polygonAsset.ref,
            resultId,
            name: `${polygonAsset.name ?? polygonAsset.id} 内 ${pointAsset.name ?? pointAsset.id} 统计`,
          },
          callId: `analysis-spatial-join:${pointAsset.id}:${polygonAsset.id}`,
          sessionId,
        })
        const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
        sceneRef.current = cloneSceneState(remoteScene)
        publishSceneState(sessionId)
        setStatusText(`已生成点面统计：asset:${resultId} / layer:${resultId}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatusText(`生成点面统计失败：${message}`)
      }
    },
    [publishSceneState],
  )

  const createPolygonOverlapScreen = useCallback(
    async (sourceAsset: SpatialAsset, targetAsset: SpatialAsset) => {
      if (sourceAsset.kind !== 'asset' || targetAsset.kind !== 'asset') return
      if (!sourceAsset.metadata?.renderData || !targetAsset.metadata?.renderData) {
        setStatusText('疑似冲突初筛需要两个带有 GeoJSON 渲染数据的面资产')
        return
      }
      const sourceGeometryType = sourceAsset.geometryType?.toLowerCase()
      const targetGeometryType = targetAsset.geometryType?.toLowerCase()
      if (
        (sourceGeometryType && !['polygon', 'mixed'].includes(sourceGeometryType)) ||
        (targetGeometryType && !['polygon', 'mixed'].includes(targetGeometryType))
      ) {
        setStatusText('疑似冲突初筛目前支持面或混合 GeoJSON 资产')
        return
      }
      const sessionId = currentSessionIdRef.current
      const resultId = `${sourceAsset.id}-overlap-${targetAsset.id}`.replace(/[^a-z0-9_-]+/gi, '-')
      try {
        await invoke('call_tool', {
          name: 'analysis_polygon_overlap_screen',
          params: {
            sourceRef: sourceAsset.ref,
            targetRef: targetAsset.ref,
            resultId,
            name: `${sourceAsset.name ?? sourceAsset.id} 与 ${targetAsset.name ?? targetAsset.id} 疑似冲突初筛`,
          },
          callId: `analysis-polygon-overlap:${sourceAsset.id}:${targetAsset.id}`,
          sessionId,
        })
        const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
        sceneRef.current = cloneSceneState(remoteScene)
        publishSceneState(sessionId)
        setStatusText(`已生成疑似冲突初筛：asset:${resultId} / layer:${resultId}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatusText(`生成疑似冲突初筛失败：${message}`)
      }
    },
    [publishSceneState],
  )

  const createAttributeFilterAnalysis = useCallback(
    async (asset: SpatialAsset, field: string, value: string | number | boolean) => {
      if (asset.kind !== 'asset') return
      if (asset.metadata?.renderTool !== 'addGeoJsonLayer' || !asset.metadata?.renderData) {
        setStatusText('这个数据资产还没有可用于属性筛选的 GeoJSON 数据')
        return
      }
      const sessionId = currentSessionIdRef.current
      const safeField = field.replace(/[^a-z0-9_-]+/gi, '-')
      const safeValue = String(value).replace(/[^a-z0-9_-]+/gi, '-')
      const resultId = `${asset.id}-filter-${safeField}-${safeValue}`.replace(/-+/g, '-')
      try {
        await invoke('call_tool', {
          name: 'analysis_filter',
          params: {
            ref: asset.ref,
            field,
            operator: 'eq',
            value,
            resultId,
            name: `${asset.name ?? asset.id} ${field}=${String(value)} 筛选`,
          },
          callId: `analysis-filter:${asset.id}:${field}`,
          sessionId,
        })
        const remoteScene = await invoke<SceneState>('agent_scene_get_state', { sessionId })
        sceneRef.current = cloneSceneState(remoteScene)
        publishSceneState(sessionId)
        setStatusText(`已生成属性筛选：asset:${resultId} / layer:${resultId}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatusText(`生成属性筛选失败：${message}`)
      }
    },
    [publishSceneState],
  )

  const exportAssetGeoJson = useCallback(async (asset: SpatialAsset) => {
    if (asset.kind !== 'asset') return
    const renderData = asset.metadata?.renderData
    if (!renderData || typeof renderData !== 'object') {
      setStatusText('这个数据资产没有可导出的 GeoJSON 数据')
      return
    }
    const exportedAt = new Date().toISOString()
    const payload = {
      ...(renderData as Record<string, unknown>),
      gaiaAgentExport: {
        kind: 'asset-geojson-export',
        app: 'GaiaAgent',
        assetRef: asset.ref,
        assetId: asset.id,
        assetName: asset.name ?? asset.id,
        source: asset.source,
        crs: asset.crs,
        exportedAt,
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/geo+json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = assetGeoJsonFilename(asset.name ?? asset.id, exportedAt)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setStatusText(`已导出 GeoJSON：${asset.ref}`)
  }, [])

  const exportAssetCsv = useCallback(async (asset: SpatialAsset) => {
    if (asset.kind !== 'asset') return
    const renderData = asset.metadata?.renderData
    const csv = geoJsonToCsv(renderData)
    if (!csv) {
      setStatusText('这个数据资产没有可导出的 GeoJSON 属性表')
      return
    }
    const exportedAt = new Date().toISOString()
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = assetCsvFilename(asset.name ?? asset.id, exportedAt)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setStatusText(`已导出 CSV：${asset.ref}`)
  }, [])

  const sendText = useCallback(
    async (
      text: string,
      filesOrContinuation?: FileUIPart[] | AgentRunContinuation,
      maybeContinuationOrOptions?: AgentRunContinuation | SendTextOptions,
      maybeOptions?: SendTextOptions,
    ) => {
      const settings = settingsRef.current
      if (isBusy || !settings) return

      const files = Array.isArray(filesOrContinuation) ? filesOrContinuation : []
      const continuation = Array.isArray(filesOrContinuation)
        ? (maybeContinuationOrOptions as AgentRunContinuation | undefined)
        : filesOrContinuation
      const options = Array.isArray(filesOrContinuation)
        ? maybeOptions
        : (maybeContinuationOrOptions as SendTextOptions | undefined)
      const attachments = nativeUserAttachments(files)

      const runId = options?.runId ?? uid()
      const isContinuationRun = !!options?.continueExistingRun
      const messageId = `${runId}:answer:${uid()}`
      const sessionId = currentSessionIdRef.current
      currentRunIdRef.current = runId
      cancellationRequestedRef.current = false
      setIsBusy(true)
      setStatusText('正在等待模型响应…')
      if (isContinuationRun && continuation) {
        dispatchAgentEvent(
          createAgentEvent(runId, {
            type: 'run.continued',
            goal: text,
            continuation,
            userAttachments: attachments.map((attachment) => ({
              filename: attachment.filename,
              mediaType: attachment.mediaType,
              url: attachment.dataUrl,
            })),
          }),
        )
      } else {
        dispatchAgentEvent(
          createAgentEvent(runId, {
            type: 'run.started',
            goal: text,
            continuation,
            userAttachments: attachments.map((attachment) => ({
              filename: attachment.filename,
              mediaType: attachment.mediaType,
              url: attachment.dataUrl,
            })),
          }),
        )
      }
      const sessionTitle = isContinuationRun
        ? undefined
        : continuation?.kind === 'replan'
          ? '重新规划后继续执行'
          : text.slice(0, 24) || '新会话'
      touchSession(sessionId, sessionTitle)

      const channel = new Channel<NativeRuntimeEvent>()
      channel.onmessage = (runtimeEvent) => {
        if (runtimeEvent.type === 'phase_changed') {
          if (runtimeEvent.phase === 'thinking') {
            setStatusText('正在等待模型响应…')
            dispatchAgentEvent(
              createAgentEvent(runId, { type: 'reasoning.status', status: 'streaming' }),
            )
          } else if (runtimeEvent.phase === 'awaiting_approval') {
            setStatusText('等待工具确认…')
          } else if (runtimeEvent.phase === 'executing_tool') {
            setStatusText('正在执行工具…')
          } else if (runtimeEvent.phase === 'completed') {
            setStatusText('完成')
            dispatchAgentEvent(createAgentEvent(runId, { type: 'run.completed' }))
          } else if (runtimeEvent.phase === 'cancelled') {
            setStatusText('已取消')
            dispatchAgentEvent(
              createAgentEvent(runId, { type: 'run.cancelled', reason: 'Cancelled by user' }),
            )
          } else if (runtimeEvent.phase === 'failed') {
            setStatusText('运行失败')
            dispatchAgentEvent(
              createAgentEvent(runId, {
                type: 'run.failed',
                error: {
                  code: 'native_runtime_failed',
                  message: 'Native Runtime reported a failed phase.',
                  category: 'internal',
                  retryable: true,
                },
              }),
            )
          }
          return
        }

        if (runtimeEvent.type === 'provider') {
          const event = runtimeEvent.event
          if (event.type === 'text_delta') {
            dispatchAgentEvent(
              createAgentEvent(runId, { type: 'message.delta', messageId, text: event.text }),
            )
          } else if (event.type === 'reasoning_delta') {
            dispatchAgentEvent(
              createAgentEvent(runId, { type: 'reasoning.delta', text: event.text }),
            )
          } else if (event.type === 'tool_call') {
            dispatchAgentEvent(
              createAgentEvent(runId, { type: 'tool.requested', call: event.call }),
            )
          } else if (event.type === 'usage') {
            dispatchAgentEvent(
              createAgentEvent(runId, {
                type: 'usage.updated',
                usage: {
                  promptTokens: event.usage.inputTokens,
                  completionTokens: event.usage.outputTokens,
                  totalTokens: event.usage.inputTokens + event.usage.outputTokens,
                },
              }),
            )
          }
          return
        }

        if (runtimeEvent.type === 'task_plan_created') {
          if (attachments.length > 0) {
            return
          }
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'task.plan.created',
              plan: runtimeEvent.plan,
            }),
          )
        } else if (runtimeEvent.type === 'task_plan_approval_required') {
          if (attachments.length > 0) {
            return
          }
          setStatusText('等待计划确认…')
          nativeApprovalRunRef.current = runId
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'task.plan.approval_required',
              planId: runtimeEvent.plan_id,
            }),
          )
        } else if (runtimeEvent.type === 'task_step_tool_linked') {
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'task.step.tool_linked',
              stepId: runtimeEvent.step_id,
              toolCallId: runtimeEvent.tool_call_id,
              title: runtimeEvent.title,
              risk: runtimeEvent.risk,
            }),
          )
        } else if (runtimeEvent.type === 'task_step_updated') {
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'task.step.updated',
              stepId: runtimeEvent.step_id,
              status: runtimeEvent.status,
              risk: runtimeEvent.risk,
              artifactRefs: runtimeEvent.artifact_refs,
              error: runtimeEvent.error
                ? {
                    code: 'task_step_error',
                    message: runtimeEvent.error,
                    category: 'tool',
                  }
                : undefined,
            }),
          )
        } else if (runtimeEvent.type === 'approval_required') {
          setStatusText('等待工具确认…')
          nativeApprovalRunRef.current = runId
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'tool.approval_required',
              callId: runtimeEvent.call.id,
              risk: runtimeEvent.risk,
              reason: 'Native Runtime 请求执行具有副作用的工具。',
            }),
          )
        } else if (runtimeEvent.type === 'tool_started') {
          setStatusText(`正在执行工具：${runtimeEvent.call.name}`)
          nativeApprovalRunRef.current = null
          dispatchAgentEvent(
            createAgentEvent(runId, { type: 'tool.started', callId: runtimeEvent.call.id }),
          )
        } else if (runtimeEvent.type === 'tool_completed') {
          setStatusText('工具完成，等待模型继续…')
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'tool.completed',
              callId: runtimeEvent.call_id,
              result: { output: runtimeEvent.output },
            }),
          )
        } else if (runtimeEvent.type === 'tool_failed') {
          setStatusText('工具执行失败')
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'tool.failed',
              callId: runtimeEvent.call_id,
              error: {
                code: 'native_tool_failed',
                message: runtimeEvent.error,
                category: 'tool',
                retryable: true,
              },
            }),
          )
        }
      }

      try {
        const outcome = await invoke<{ answer: string }>('agent_run_native', {
          request: {
            runId,
            sessionId,
            goal: text,
            attachments,
            budget: { maxRounds: 8, maxToolCalls: 24, maxTotalTokens: 64_000 },
            maxOutputTokens: 4096,
            temperature: 0.2,
          },
          onEvent: channel,
        })
        dispatchAgentEvent(
          createAgentEvent(runId, { type: 'message.completed', messageId, text: outcome.answer }),
        )
        setStatusText('完成')
      } catch (error) {
        if (!cancellationRequestedRef.current) {
          const agentError = toAgentError(error, 'native_runtime_failed')
          dispatchAgentEvent(createAgentEvent(runId, { type: 'run.failed', error: agentError }))
          setStatusText(`Native Runtime 失败：${agentError.message}`)
        }
      } finally {
        setIsBusy(false)
        currentRunIdRef.current = null
        nativeApprovalRunRef.current = null
      }
    },
    [dispatchAgentEvent, isBusy, touchSession],
  )

  const confirmPlan = useCallback(async () => {
    const pendingReplay = pendingReplayApprovalRef.current
    if (pendingReplay) {
      pendingReplayApprovalRef.current = null
      const { runId, call } = pendingReplay
      dispatchAgentEvent(createAgentEvent(runId, { type: 'tool.started', callId: call.id }))
      setStatusText(`正在执行已确认步骤：${pendingReplay.title || call.name}`)
      try {
        const output = await invoke<unknown>('call_tool', {
          name: call.name,
          params: call.arguments,
          callId: call.id,
          sessionId: currentSessionIdRef.current,
        })
        dispatchAgentEvent(
          createAgentEvent(runId, {
            type: 'tool.completed',
            callId: call.id,
            result: { output: stringifyToolOutput(output), data: output },
          }),
        )
        await refreshSceneState()
        setStatusText('已执行确认步骤')
      } catch (error) {
        const agentError = toAgentError(error, 'task_step_confirmed_continue_failed')
        dispatchAgentEvent(
          createAgentEvent(runId, {
            type: 'tool.failed',
            callId: call.id,
            error: { ...agentError, category: agentError.category ?? 'tool', retryable: true },
          }),
        )
        setStatusText(`确认步骤执行失败：${agentError.message}`)
      }
      return
    }

    const nativeRunId = nativeApprovalRunRef.current
    if (!nativeRunId) return
    nativeApprovalRunRef.current = null
    void invoke('agent_resolve_approval', { runId: nativeRunId, approved: true }).catch(() => {})
    setStatusText('正在执行…')
  }, [dispatchAgentEvent, refreshSceneState])

  const cancelPlan = useCallback(() => {
    const pendingReplay = pendingReplayApprovalRef.current
    if (pendingReplay) {
      pendingReplayApprovalRef.current = null
      dispatchAgentEvent(
        createAgentEvent(pendingReplay.runId, {
          type: 'tool.cancelled',
          callId: pendingReplay.call.id,
          reason: '用户取消了继续执行步骤',
        }),
      )
      setStatusText('已取消继续执行步骤')
      return
    }

    const runId = currentRunIdRef.current
    if (!runId || cancellationRequestedRef.current) return
    cancellationRequestedRef.current = true
    nativeApprovalRunRef.current = null
    dispatchAgentEvent(
      createAgentEvent(runId, { type: 'run.cancelled', reason: 'Cancelled by user' }),
    )
    void invoke('agent_resolve_approval', { runId, approved: false }).catch(() => {})
    void invoke('ai_cancel', { requestId: runId }).catch(() => {})
    void invoke('mcp_cancel_calls', { serverId: null }).catch(() => {})
    setStatusText('已取消')
  }, [dispatchAgentEvent])

  const retryTaskStep = useCallback(
    async (runId: string, stepId: string) => {
      const recovered = await invoke<RecoveredTaskStepToolCall | null>(
        'agent_task_plan_latest_step_tool_call',
        {
          sessionId: currentSessionIdRef.current,
          runId,
          stepId,
        },
      ).catch((error) => {
        console.warn('[agent] failed to recover task step tool call:', error)
        return null
      })
      const sourceCall =
        recovered?.call ?? findLatestToolCallForStep(timelineRef.current, runId, stepId)
      if (!sourceCall) {
        dispatchAgentEvent(
          createAgentEvent(runId, {
            type: 'task.step.updated',
            stepId,
            status: 'failed',
            error: {
              code: 'task_step_retry_missing_tool_call',
              message: '无法找到这个步骤对应的原始工具调用，暂时不能自动重试。',
              category: 'tool',
            },
          }),
        )
        setStatusText('无法重试：缺少原始工具调用')
        return
      }

      const retryCall: AgentToolCall = {
        ...sourceCall,
        id: recovered?.retryCallId ?? `${sourceCall.id}:retry:${Date.now().toString(36)}`,
        description: sourceCall.description
          ? `${sourceCall.description}（重试）`
          : `${sourceCall.name}（重试）`,
      }

      dispatchAgentEvent(
        createAgentEvent(runId, {
          type: 'task.step.retry_requested',
          stepId,
          reason: '用户请求重新执行这个步骤。',
        }),
      )
      dispatchAgentEvent(
        createAgentEvent(runId, {
          type: 'task.step.tool_linked',
          stepId,
          toolCallId: retryCall.id,
          title: retryCall.name,
          risk: retryCall.risk,
        }),
      )
      dispatchAgentEvent(createAgentEvent(runId, { type: 'tool.requested', call: retryCall }))
      dispatchAgentEvent(createAgentEvent(runId, { type: 'tool.started', callId: retryCall.id }))
      setStatusText('正在重试任务步骤…')

      try {
        const output = await invoke<unknown>('call_tool', {
          name: retryCall.name,
          params: retryCall.arguments,
          callId: retryCall.id,
          sessionId: currentSessionIdRef.current,
        })
        const outputText = stringifyToolOutput(output)
        dispatchAgentEvent(
          createAgentEvent(runId, {
            type: 'tool.completed',
            callId: retryCall.id,
            result: { output: outputText, data: output },
          }),
        )
        dispatchAgentEvent(
          createAgentEvent(runId, {
            type: 'run.completed',
            summary: `已重试步骤：${retryCall.name}`,
          }),
        )
        await refreshSceneState()
        setStatusText('步骤重试完成')
      } catch (error) {
        const agentError = toAgentError(error, 'task_step_retry_failed')
        dispatchAgentEvent(
          createAgentEvent(runId, {
            type: 'tool.failed',
            callId: retryCall.id,
            error: { ...agentError, category: agentError.category ?? 'tool', retryable: true },
          }),
        )
        setStatusText(`步骤重试失败：${agentError.message}`)
      }
    },
    [dispatchAgentEvent, refreshSceneState],
  )

  const skipTaskStep = useCallback(
    async (runId: string, stepId: string) => {
      const remaining = await invoke<RemainingTaskSteps | null>(
        'agent_task_plan_remaining_steps_after_skip',
        {
          sessionId: currentSessionIdRef.current,
          runId,
          stepId,
        },
      ).catch((error) => {
        console.warn('[agent] failed to recover remaining task steps:', error)
        return null
      })
      dispatchAgentEvent(
        createAgentEvent(runId, {
          type: 'task.step.skipped',
          stepId,
          reason: 'User skipped this step.',
        }),
      )
      const remainingCount = remaining?.steps.length ?? 0
      const replayableCount = remaining?.replayableStepCount ?? 0
      const planningCount = remaining?.planningStepCount ?? 0
      const approvalCount = remaining?.steps.filter((step) => step.approvalRequired).length ?? 0
      const remainingSteps = remaining?.steps ?? []
      const replayQueue: Array<{
        step: RemainingTaskSteps['steps'][number]
        call: AgentToolCall
      }> = []
      let approvalBlocked: {
        step: RemainingTaskSteps['steps'][number]
        call: AgentToolCall
      } | null = null
      let planningBlockedStep: RemainingTaskSteps['steps'][number] | null = null
      for (const step of remainingSteps) {
        if (step.approvalRequired) {
          const approvalCall =
            step.latestCall && step.replayCallId
              ? replayCallForRemainingStep({ ...step, approvalRequired: false })
              : null
          if (approvalCall) approvalBlocked = { step, call: approvalCall }
          break
        }
        const call = replayCallForRemainingStep(step)
        if (!call) {
          planningBlockedStep = step
          break
        }
        replayQueue.push({ step, call })
      }

      if (replayQueue.length === 0 && !approvalBlocked) {
        if (planningBlockedStep) {
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'task.step.updated',
              stepId: planningBlockedStep.id,
              status: 'needs-planning',
              error: {
                code: 'task_step_needs_planning',
                message: '这个后续步骤没有可重放的工具调用，需要模型重新规划。',
                category: 'tool',
              },
            }),
          )
        }
        setStatusText(
          remainingCount > 0
            ? `已跳过任务步骤，后续 ${remainingCount} 步：${replayableCount} 步已生成重放队列，${planningCount} 步需重规划，${approvalCount} 步需确认`
            : '已跳过任务步骤',
        )
        return
      }

      setIsBusy(true)
      let completed = 0
      try {
        for (const item of replayQueue) {
          const { step, call } = item
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'task.step.tool_linked',
              stepId: step.id,
              toolCallId: call.id,
              title: call.name,
              risk: call.risk,
            }),
          )
          dispatchAgentEvent(createAgentEvent(runId, { type: 'tool.requested', call }))
          dispatchAgentEvent(createAgentEvent(runId, { type: 'tool.started', callId: call.id }))
          setStatusText(`正在继续执行：${step.title || call.name}`)

          try {
            const output = await invoke<unknown>('call_tool', {
              name: call.name,
              params: call.arguments,
              callId: call.id,
              sessionId: currentSessionIdRef.current,
            })
            const outputText = stringifyToolOutput(output)
            dispatchAgentEvent(
              createAgentEvent(runId, {
                type: 'tool.completed',
                callId: call.id,
                result: { output: outputText, data: output },
              }),
            )
            completed += 1
          } catch (error) {
            const agentError = toAgentError(error, 'task_step_continue_failed')
            dispatchAgentEvent(
              createAgentEvent(runId, {
                type: 'tool.failed',
                callId: call.id,
                error: { ...agentError, category: agentError.category ?? 'tool', retryable: true },
              }),
            )
            setStatusText(`继续执行失败：${agentError.message}`)
            return
          }
        }

        await refreshSceneState()
        if (planningBlockedStep) {
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'task.step.updated',
              stepId: planningBlockedStep.id,
              status: 'needs-planning',
              error: {
                code: 'task_step_needs_planning',
                message: '这个后续步骤没有可重放的工具调用，需要模型重新规划。',
                category: 'tool',
              },
            }),
          )
        }
        if (approvalBlocked) {
          pendingReplayApprovalRef.current = {
            runId,
            stepId: approvalBlocked.step.id,
            title: approvalBlocked.step.title,
            call: approvalBlocked.call,
          }
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'task.step.tool_linked',
              stepId: approvalBlocked.step.id,
              toolCallId: approvalBlocked.call.id,
              title: approvalBlocked.call.name,
              risk: approvalBlocked.call.risk,
            }),
          )
          dispatchAgentEvent(
            createAgentEvent(runId, { type: 'tool.requested', call: approvalBlocked.call }),
          )
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'tool.approval_required',
              callId: approvalBlocked.call.id,
              risk: approvalBlocked.call.risk ?? 'scene-write',
              reason: `继续执行步骤需要确认：${approvalBlocked.step.title || approvalBlocked.call.name}`,
            }),
          )
          setStatusText(
            `继续执行已暂停，等待确认：${approvalBlocked.step.title || approvalBlocked.call.name}`,
          )
          return
        }
        if (planningBlockedStep || planningCount > 0) {
          setStatusText(`已跳过并继续执行 ${completed} 步；仍有 ${planningCount} 步需重规划`)
        } else {
          dispatchAgentEvent(
            createAgentEvent(runId, {
              type: 'run.completed',
              summary: `已跳过 1 步并继续执行 ${completed} 步`,
            }),
          )
          setStatusText(`已跳过并继续执行 ${completed} 步`)
        }
      } finally {
        setIsBusy(false)
      }
    },
    [dispatchAgentEvent, refreshSceneState],
  )

  const replanTaskStep = useCallback(
    async (runId: string, stepId: string) => {
      const reason = '用户请求重新规划这个步骤。'
      const replanned = await invoke<ReplannedTaskSteps | null>('agent_task_plan_replan_step', {
        sessionId: currentSessionIdRef.current,
        runId,
        stepId,
        reason,
      }).catch((error) => {
        console.warn('[agent] failed to replan task step:', error)
        return null
      })
      dispatchAgentEvent(
        createAgentEvent(runId, {
          type: 'task.step.replan_requested',
          stepId,
          reason,
        }),
      )
      if (replanned?.steps.length) {
        dispatchAgentEvent(
          createAgentEvent(runId, {
            type: 'task.plan.steps_replanned',
            anchorStepId: replanned.anchorStepId,
            steps: replanned.steps,
            reason: replanned.reason,
          }),
        )
        setStatusText(`已重新规划 ${replanned.steps.length} 个后续步骤，正在继续执行…`)
        if (replanned.continuationPrompt.trim()) {
          void sendText(
            replanned.continuationPrompt,
            {
              kind: 'replan',
              parentRunId: runId,
              parentStepId: stepId,
              reason: replanned.reason,
            },
            { runId, continueExistingRun: true },
          )
        }
      } else {
        setStatusText('已请求重新规划任务步骤')
      }
    },
    [dispatchAgentEvent, sendText],
  )

  return {
    timeline,
    sessions,
    currentSessionId,
    runtimePort,
    status,
    statusText,
    isBusy,
    pendingDeliverablesImport,
    sceneState,
    sendText,
    confirmPlan,
    cancelPlan,
    retryTaskStep,
    skipTaskStep,
    replanTaskStep,
    applySandboxPatchAndStartMcp,
    createSession,
    switchSession,
    deleteSession,
    clearCurrentContext,
    compactCurrentContext,
    refreshSceneState,
    replayCurrentSceneToBridge,
    setSceneObjectVisibility,
    renameSceneObject,
    setAllSceneObjectsVisibility,
    clearCurrentScene,
    clearAgentSceneObjects,
    exportCurrentSceneJson,
    exportCurrentSceneMarkdownReport,
    exportCurrentDeliverablesManifest,
    exportCurrentDeliverablesPackage,
    importSceneJson,
    importDeliverablesPackage,
    confirmDeliverablesPackageImport,
    cancelDeliverablesPackageImport,
    importGeoJsonFile,
    importCsvFile,
    setSceneObjectLocked,
    selectSceneObject,
    deleteSceneObject,
    focusSceneObject,
    highlightSceneFeature,
    setFeatureReviewStatus,
    addAssetToMap,
    createAssetBuffer,
    createNearestAnalysis,
    measureAsset,
    createSpatialJoinAnalysis,
    createPolygonOverlapScreen,
    createAttributeFilterAnalysis,
    exportAssetGeoJson,
    exportAssetCsv,
    updateModelSettings,
  }
}
