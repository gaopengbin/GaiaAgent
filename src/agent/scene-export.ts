import type { SceneState, SpatialAsset } from './types'
import { filenameTimestamp, safeFilenamePart } from './export-filenames'

export interface SceneExportPayload {
  version: 1
  app: 'GaiaAgent'
  kind: 'scene-state-export'
  sessionId: string
  exportedAt: string
  objectCount: number
  visibleObjectCount: number
  scene: SceneState
}

export function buildSceneExportPayload(
  sessionId: string,
  scene: SceneState,
  exportedAt = new Date().toISOString(),
): SceneExportPayload {
  const assets = Object.values(scene.assets)
  return {
    version: 1,
    app: 'GaiaAgent',
    kind: 'scene-state-export',
    sessionId,
    exportedAt,
    objectCount: assets.length,
    visibleObjectCount: assets.filter((asset) => asset.visible !== false).length,
    scene,
  }
}

export function sceneExportFilename(sessionId: string, exportedAt = new Date().toISOString()) {
  return `gaia-scene-${safeFilenamePart(sessionId, 'session')}-${filenameTimestamp(exportedAt)}.json`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSceneStateLike(value: unknown): value is Partial<SceneState> {
  return (
    isRecord(value) &&
    typeof value.revision === 'number' &&
    (value.camera === null || isRecord(value.camera)) &&
    Array.isArray(value.layers) &&
    Array.isArray(value.labels) &&
    isRecord(value.assets)
  )
}

function normalizeCamera(value: unknown): SceneState['camera'] {
  if (!isRecord(value)) return null
  const lat = Number(value.lat)
  const lon = Number(value.lon)
  const height = Number(value.height)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(height)) return null
  return { lat, lon, height }
}

function normalizeAsset(ref: string, value: unknown): SpatialAsset | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : ref.replace(/^[^:]+:/, '')
  const kind =
    value.kind === 'layer' || value.kind === 'entity' || value.kind === 'asset' ? value.kind : null
  const type = typeof value.type === 'string' && value.type.trim() ? value.type : null
  const position = normalizeCamera(value.position)
  if (!kind || !type) return null

  return {
    ...value,
    ref: typeof value.ref === 'string' && value.ref.trim() ? value.ref : ref,
    id,
    kind,
    type,
    name: typeof value.name === 'string' ? value.name : undefined,
    visible: typeof value.visible === 'boolean' ? value.visible : undefined,
    dataRefId: typeof value.dataRefId === 'string' ? value.dataRefId : undefined,
    position: position ?? undefined,
    lastCallId: typeof value.lastCallId === 'string' ? value.lastCallId : undefined,
    source: typeof value.source === 'string' ? value.source : 'import',
    locked: typeof value.locked === 'boolean' ? value.locked : undefined,
    render: isRecord(value.render)
      ? { ...value.render }
      : isRecord(value.graphicProperties)
        ? { ...value.graphicProperties }
        : undefined,
  }
}

function normalizeSceneState(scene: Partial<SceneState>): SceneState | null {
  if (!isRecord(scene.assets)) return null

  const assets = Object.fromEntries(
    Object.entries(scene.assets)
      .map(([ref, asset]) => [ref, normalizeAsset(ref, asset)] as const)
      .filter((entry): entry is [string, SpatialAsset] => entry[1] !== null),
  )
  const assetRefs = new Set(Object.keys(assets))
  const activeObjectRef =
    typeof scene.activeObjectRef === 'string' && assetRefs.has(scene.activeObjectRef)
      ? scene.activeObjectRef
      : null

  return {
    revision: Number.isFinite(scene.revision) ? Number(scene.revision) : 0,
    camera: normalizeCamera(scene.camera),
    layers: Array.isArray(scene.layers) ? scene.layers : [],
    labels: Array.isArray(scene.labels) ? scene.labels : [],
    activeObjectRef,
    recentObjectRefs: Array.isArray(scene.recentObjectRefs)
      ? scene.recentObjectRefs.filter(
          (reference): reference is string =>
            typeof reference === 'string' && assetRefs.has(reference),
        )
      : [],
    assets,
  }
}

export function sceneFromExportPayload(value: unknown): SceneState | null {
  if (!isRecord(value)) return null

  if (
    value.kind === 'scene-state-export' &&
    value.app === 'GaiaAgent' &&
    value.version === 1 &&
    isSceneStateLike(value.scene)
  ) {
    return normalizeSceneState(value.scene)
  }

  if (isSceneStateLike(value)) {
    return normalizeSceneState(value)
  }

  return null
}
