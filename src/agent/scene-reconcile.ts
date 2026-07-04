import type { SceneState, SpatialAsset } from './types'
import { syncSceneCollections } from './scene-state'

export function shouldPreserveMissingSceneAsset(asset: SpatialAsset, preserveAll = false) {
  return preserveAll || asset.locked === true || asset.source === 'import'
}

export function mergeMissingSceneAssets(
  current: SceneState,
  previous: SceneState,
  options: { preserveAll?: boolean } = {},
) {
  const preserveAll = options.preserveAll === true
  let changed = false
  for (const [ref, asset] of Object.entries(previous.assets)) {
    if (current.assets[ref]) continue
    if (!shouldPreserveMissingSceneAsset(asset, preserveAll)) continue
    current.assets[ref] = { ...asset, render: asset.render ? { ...asset.render } : undefined }
    changed = true
  }

  const availableRefs = new Set(Object.keys(current.assets))
  current.activeObjectRef =
    previous.activeObjectRef && availableRefs.has(previous.activeObjectRef)
      ? previous.activeObjectRef
      : current.activeObjectRef && availableRefs.has(current.activeObjectRef)
        ? current.activeObjectRef
        : null
  current.recentObjectRefs = [
    ...(previous.recentObjectRefs ?? []),
    ...(current.recentObjectRefs ?? []),
  ].filter((ref, index, refs) => availableRefs.has(ref) && refs.indexOf(ref) === index)

  if (changed) {
    current.revision += 1
    syncSceneCollections(current)
  }
  return changed
}
