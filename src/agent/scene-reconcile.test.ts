import { describe, expect, it } from 'vitest'
import { createSceneState } from './history'
import { mergeMissingSceneAssets } from './scene-reconcile'

describe('scene reconciliation', () => {
  it('preserves only protected structured assets by default', () => {
    const previous = createSceneState()
    previous.activeObjectRef = 'entity:imported'
    previous.recentObjectRefs = ['entity:agent', 'entity:imported']
    previous.assets = {
      'entity:imported': {
        ref: 'entity:imported',
        id: 'imported',
        kind: 'entity',
        type: 'marker',
        source: 'import',
        locked: true,
        position: { lon: 116.4, lat: 39.9, height: 0 },
      },
      'entity:agent': {
        ref: 'entity:agent',
        id: 'agent',
        kind: 'entity',
        type: 'marker',
        source: 'agent',
      },
    }

    const current = createSceneState()
    current.assets = {}

    expect(mergeMissingSceneAssets(current, previous)).toBe(true)
    expect(Object.keys(current.assets)).toEqual(['entity:imported'])
    expect(current.activeObjectRef).toBe('entity:imported')
    expect(current.recentObjectRefs).toEqual(['entity:imported'])
    expect(current.labels).toEqual([
      {
        id: 'imported',
        text: 'imported',
        type: 'marker',
        lat: 39.9,
        lon: 116.4,
        height: 0,
      },
    ])
  })

  it('can preserve all missing assets for explicit import replay reconciliation', () => {
    const previous = createSceneState()
    previous.assets = {
      'entity:agent': {
        ref: 'entity:agent',
        id: 'agent',
        kind: 'entity',
        type: 'marker',
        source: 'agent',
      },
    }

    const current = createSceneState()

    expect(mergeMissingSceneAssets(current, previous, { preserveAll: true })).toBe(true)
    expect(current.assets['entity:agent']).toMatchObject({ id: 'agent', source: 'agent' })
  })
})
