import { describe, expect, it } from 'vitest'
import type { SceneState } from './types'
import {
  buildSceneExportPayload,
  sceneExportFilename,
  sceneFromExportPayload,
} from './scene-export'

describe('scene export', () => {
  const scene = {
    revision: 3,
    camera: null,
    layers: [],
    labels: [],
    activeObjectRef: 'entity:marker-1',
    recentObjectRefs: ['entity:marker-1'],
    assets: {
      'entity:marker-1': {
        ref: 'entity:marker-1',
        id: 'marker-1',
        kind: 'entity',
        type: 'marker',
        name: 'Palace marker',
        visible: true,
      },
      'layer:roads': {
        ref: 'layer:roads',
        id: 'roads',
        kind: 'layer',
        type: 'geojson',
        name: 'Roads',
        visible: false,
      },
      'entity:route-1': {
        ref: 'entity:route-1',
        id: 'route-1',
        kind: 'entity',
        type: 'polyline',
        name: 'Route',
        render: {
          positions: [
            [116.3, 39.8, 0],
            [116.4, 39.9, 0],
          ],
          color: '#00ff00',
        },
      },
    },
  } satisfies SceneState

  it('builds a stable scene export payload with object counts', () => {
    expect(buildSceneExportPayload('session-1', scene, '2026-07-03T12:00:00.000Z')).toMatchObject({
      version: 1,
      app: 'GaiaAgent',
      kind: 'scene-state-export',
      sessionId: 'session-1',
      exportedAt: '2026-07-03T12:00:00.000Z',
      objectCount: 3,
      visibleObjectCount: 2,
      scene,
    })
  })

  it('uses a filesystem-safe filename', () => {
    expect(sceneExportFilename('session:1/path', '2026-07-03T12:00:00.000Z')).toBe(
      'gaia-scene-session-1-path-2026-07-03T12-00-00-000Z.json',
    )
  })

  it('parses a GaiaAgent scene export payload', () => {
    const payload = buildSceneExportPayload('session-1', scene, '2026-07-03T12:00:00.000Z')

    expect(sceneFromExportPayload(payload)).toMatchObject({
      revision: 3,
      activeObjectRef: 'entity:marker-1',
      recentObjectRefs: ['entity:marker-1'],
      assets: {
        'entity:marker-1': {
          ref: 'entity:marker-1',
          id: 'marker-1',
          kind: 'entity',
          type: 'marker',
        },
      },
    })
  })

  it('accepts a raw SceneState object', () => {
    expect(sceneFromExportPayload(scene)?.assets['layer:roads']).toMatchObject({
      ref: 'layer:roads',
      kind: 'layer',
      visible: false,
    })
    expect(sceneFromExportPayload(scene)?.assets['entity:route-1'].render).toEqual({
      positions: [
        [116.3, 39.8, 0],
        [116.4, 39.9, 0],
      ],
      color: '#00ff00',
    })
  })

  it('preserves registered data assets during import', () => {
    const imported = sceneFromExportPayload({
      ...scene,
      activeObjectRef: 'asset:schools',
      recentObjectRefs: ['asset:schools'],
      assets: {
        'asset:schools': {
          ref: 'asset:schools',
          id: 'schools',
          kind: 'asset',
          type: 'tabular',
          name: 'Schools',
          source: 'import',
          locked: true,
          metadata: {
            renderTool: 'addGeoJsonLayer',
          },
        },
      },
    })

    expect(imported?.activeObjectRef).toBe('asset:schools')
    expect(imported?.recentObjectRefs).toEqual(['asset:schools'])
    expect(imported?.assets['asset:schools']).toMatchObject({
      ref: 'asset:schools',
      kind: 'asset',
      type: 'tabular',
      name: 'Schools',
      locked: true,
    })
  })

  it('drops stale active and recent object refs during import', () => {
    const imported = sceneFromExportPayload({
      ...scene,
      activeObjectRef: 'entity:missing',
      recentObjectRefs: ['entity:missing', 'layer:roads'],
    })

    expect(imported?.activeObjectRef).toBeNull()
    expect(imported?.recentObjectRefs).toEqual(['layer:roads'])
  })

  it('rejects invalid payloads', () => {
    expect(sceneFromExportPayload({ kind: 'scene-state-export', app: 'Other', scene })).toBeNull()
    expect(sceneFromExportPayload({ revision: 1, assets: {} })).toBeNull()
  })
})
