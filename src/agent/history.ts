import type { SceneState } from './types'

export function createSceneState(): SceneState {
  return {
    revision: 0,
    basemap: null,
    camera: null,
    layers: [],
    labels: [],
    activeObjectRef: null,
    recentObjectRefs: [],
    assets: {},
  }
}
