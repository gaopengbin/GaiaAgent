import type { CameraState, ScenePatch, SceneState, SpatialAsset } from './types'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function finite(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function renderFrom(value: unknown): Record<string, unknown> | undefined {
  const render = record(value)
  if (!render || Object.keys(render).length === 0) return undefined
  return { ...render }
}

function cameraFrom(value: unknown): CameraState | null {
  const view = record(value)
  if (!view) return null
  const lat = finite(view.latitude)
  const lon = finite(view.longitude)
  const height = finite(view.height)
  if (lat === null || lon === null || height === null) return null
  return {
    lat,
    lon,
    height,
    heading: finite(view.heading) ?? undefined,
    pitch: finite(view.pitch) ?? undefined,
    roll: finite(view.roll) ?? undefined,
  }
}

function isImportMarker(value: unknown) {
  return typeof value === 'string' && value.toLowerCase().includes('import')
}

function snapshotAssetSource(raw: UnknownRecord, callId?: string): SpatialAsset['source'] {
  const explicitSource =
    typeof raw.provenance === 'string'
      ? raw.provenance
      : typeof raw.sourceType === 'string'
        ? raw.sourceType
        : typeof raw.source === 'string' &&
            ['agent', 'user', 'snapshot', 'import', 'mcp'].includes(raw.source)
          ? raw.source
          : undefined
  if (explicitSource === 'import' || isImportMarker(callId)) return 'import'
  if (explicitSource) return explicitSource
  if (callId) return callId.startsWith('scene-panel:') ? 'user' : 'agent'
  return 'snapshot'
}

function snapshotAssetLocked(raw: UnknownRecord, source: SpatialAsset['source']) {
  if (typeof raw.locked === 'boolean') return raw.locked
  return source === 'import'
}

function assetMap(snapshot: UnknownRecord, callId?: string): Record<string, SpatialAsset> {
  const assets: Record<string, SpatialAsset> = {}
  const layers = Array.isArray(snapshot.layers) ? snapshot.layers : []
  for (const raw of layers) {
    const layer = record(raw)
    if (!layer || typeof layer.id !== 'string' || typeof layer.type !== 'string') continue
    const ref = `layer:${layer.id}`
    const source = snapshotAssetSource(layer, callId)
    assets[ref] = {
      ref,
      id: layer.id,
      kind: 'layer',
      type: layer.type,
      name: typeof layer.name === 'string' ? layer.name : undefined,
      visible: typeof layer.visible === 'boolean' ? layer.visible : undefined,
      dataRefId: typeof layer.dataRefId === 'string' ? layer.dataRefId : undefined,
      lastCallId: callId,
      source,
      locked: snapshotAssetLocked(layer, source),
    }
  }

  const entities = Array.isArray(snapshot.entities) ? snapshot.entities : []
  for (const raw of entities) {
    const entity = record(raw)
    if (!entity || typeof entity.entityId !== 'string' || typeof entity.type !== 'string') continue
    const ref = `entity:${entity.entityId}`
    const source = snapshotAssetSource(entity, callId)
    assets[ref] = {
      ref,
      id: entity.entityId,
      kind: 'entity',
      type: entity.type,
      name: typeof entity.name === 'string' ? entity.name : undefined,
      visible: typeof entity.visible === 'boolean' ? entity.visible : undefined,
      position: cameraFrom(entity.position) ?? undefined,
      lastCallId: callId,
      source,
      locked: snapshotAssetLocked(entity, source),
      render: renderFrom(entity.graphicProperties),
    }
  }
  return assets
}

function sameAsset(left: SpatialAsset, right: SpatialAsset): boolean {
  const leftValue = { ...left }
  const rightValue = { ...right }
  delete leftValue.lastCallId
  delete rightValue.lastCallId
  return JSON.stringify(leftValue) === JSON.stringify(rightValue)
}

function shouldPreserveMissingSnapshotAsset(asset: SpatialAsset) {
  return asset.kind === 'asset' || asset.locked === true || asset.source === 'import'
}

function markRecentObjectRefs(
  current: string[],
  refs: string[],
  assets: Record<string, SpatialAsset>,
) {
  const next = [...current]
  for (const ref of refs) {
    if (!assets[ref]) continue
    const existing = next.indexOf(ref)
    if (existing >= 0) next.splice(existing, 1)
    next.unshift(ref)
  }
  return next.filter((ref) => assets[ref]).slice(0, 5)
}

export function applySceneSnapshot(
  state: SceneState,
  rawSnapshot: unknown,
  callId?: string,
): ScenePatch | null {
  const snapshot = record(rawSnapshot)
  if (!snapshot) return null
  const camera = cameraFrom(snapshot.view)
  const nextAssets = assetMap(snapshot, callId)
  for (const [ref, asset] of Object.entries(state.assets)) {
    if (nextAssets[ref] || !shouldPreserveMissingSnapshotAsset(asset)) continue
    nextAssets[ref] = {
      ...asset,
      position: asset.position ? { ...asset.position } : undefined,
      render: asset.render ? { ...asset.render } : undefined,
    }
  }
  for (const asset of Object.values(nextAssets)) {
    const previous = state.assets[asset.ref]
    if (previous) {
      asset.source = previous.source ?? asset.source
      asset.locked = previous.locked ?? asset.locked
      if (sameAsset(previous, asset)) asset.lastCallId = previous.lastCallId
    }
  }
  const added = Object.values(nextAssets).filter((asset) => !state.assets[asset.ref])
  const updated = Object.values(nextAssets).filter(
    (asset) => state.assets[asset.ref] && !sameAsset(state.assets[asset.ref], asset),
  )
  const removed = Object.keys(state.assets).filter((ref) => !nextAssets[ref])
  const activeObjectRef =
    state.activeObjectRef && nextAssets[state.activeObjectRef] ? state.activeObjectRef : null
  const changedRefs = [...added.map((asset) => asset.ref), ...updated.map((asset) => asset.ref)]
  const recentObjectRefs = markRecentObjectRefs(
    state.recentObjectRefs ?? [],
    callId ? changedRefs : [],
    nextAssets,
  )
  const activeChanged = state.activeObjectRef !== activeObjectRef
  const recentChanged =
    JSON.stringify(state.recentObjectRefs ?? []) !== JSON.stringify(recentObjectRefs)
  const cameraChanged = JSON.stringify(state.camera) !== JSON.stringify(camera)
  if (
    !cameraChanged &&
    !activeChanged &&
    !recentChanged &&
    added.length === 0 &&
    updated.length === 0 &&
    removed.length === 0
  ) {
    return null
  }

  state.revision += 1
  state.camera = camera
  state.activeObjectRef = activeObjectRef
  state.recentObjectRefs = recentObjectRefs
  state.assets = nextAssets
  syncSceneCollections(state)
  return { revision: state.revision, callId, cameraChanged, added, updated, removed }
}

export function syncSceneCollections(state: SceneState) {
  state.layers = Object.values(state.assets)
    .filter((asset) => asset.kind === 'layer')
    .map((asset) => ({
      id: asset.id,
      type: asset.type,
      source: asset.dataRefId ?? asset.name ?? asset.id,
      name: asset.name,
      visible: asset.visible,
      dataRefId: asset.dataRefId,
    }))
  state.labels = Object.values(state.assets)
    .filter((asset) => asset.kind === 'entity' && asset.position)
    .map((asset) => ({
      id: asset.id,
      text: asset.name ?? asset.id,
      type: asset.type,
      lat: asset.position!.lat,
      lon: asset.position!.lon,
      height: asset.position!.height,
    }))
}
