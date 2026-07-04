import type { SceneState } from './types'

export function createSceneState(): SceneState {
  return {
    revision: 0,
    camera: null,
    layers: [],
    labels: [],
    activeObjectRef: null,
    recentObjectRefs: [],
    assets: {},
  }
}
