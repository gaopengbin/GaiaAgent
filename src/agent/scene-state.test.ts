import { describe, expect, it } from 'vitest'
import { createSceneState } from './history'
import { applySceneSnapshot, syncSceneCollections } from './scene-state'

describe('authoritative scene snapshots', () => {
  it('builds stable asset references and incremental patches', () => {
    const state = createSceneState()
    const first = applySceneSnapshot(
      state,
      {
        view: { latitude: 39.9, longitude: 116.4, height: 1000 },
        layers: [{ id: 'roads', name: 'Roads', type: 'geojson', visible: true }],
        entities: [
          {
            entityId: 'marker-1',
            name: '故宫',
            type: 'point',
            visible: false,
            position: { latitude: 39.9, longitude: 116.4, height: 0 },
          },
        ],
      },
      'run-1:tool:1',
    )
    expect(first?.added.map((asset) => asset.ref)).toEqual(['layer:roads', 'entity:marker-1'])
    expect(state.recentObjectRefs).toEqual(['entity:marker-1', 'layer:roads'])
    expect(state.assets['entity:marker-1'].lastCallId).toBe('run-1:tool:1')
    expect(state.assets['entity:marker-1'].visible).toBe(false)
    expect(state.assets['entity:marker-1'].source).toBe('agent')
    expect(state.assets['entity:marker-1'].locked).toBe(false)
    state.activeObjectRef = 'entity:marker-1'

    expect(
      applySceneSnapshot(state, {
        view: { latitude: 39.9, longitude: 116.4, height: 1000 },
        layers: [{ id: 'roads', name: 'Roads', type: 'geojson', visible: true }],
        entities: [],
      })?.removed,
    ).toEqual(['entity:marker-1'])
    expect(state.activeObjectRef).toBeNull()
    expect(state.recentObjectRefs).toEqual(['layer:roads'])
  })

  it('does not invent changes for an identical snapshot', () => {
    const state = createSceneState()
    expect(applySceneSnapshot(state, { view: null, layers: [], entities: [] })).toBeNull()
  })

  it('preserves exported graphic properties for later scene replay', () => {
    const state = createSceneState()

    applySceneSnapshot(state, {
      view: null,
      layers: [],
      entities: [
        {
          entityId: 'route-1',
          name: 'Route',
          type: 'polyline',
          visible: true,
          graphicProperties: {
            color: '#00ff00',
            width: 4,
            positions: [
              [116.3, 39.8, 0],
              [116.4, 39.9, 0],
            ],
          },
        },
      ],
    })

    expect(state.assets['entity:route-1'].render).toEqual({
      color: '#00ff00',
      width: 4,
      positions: [
        [116.3, 39.8, 0],
        [116.4, 39.9, 0],
      ],
    })
  })

  it('rebuilds layer and label collections from the authoritative asset map', () => {
    const state = createSceneState()
    state.assets = {
      'layer:roads': {
        ref: 'layer:roads',
        id: 'roads',
        kind: 'layer',
        type: 'geojson',
        name: 'Roads',
        visible: true,
      },
      'entity:marker-1': {
        ref: 'entity:marker-1',
        id: 'marker-1',
        kind: 'entity',
        type: 'marker',
        name: 'Marker',
        position: { lon: 116.4, lat: 39.9, height: 0 },
      },
    }

    syncSceneCollections(state)

    expect(state.layers).toEqual([
      {
        id: 'roads',
        type: 'geojson',
        source: 'Roads',
        name: 'Roads',
        visible: true,
        dataRefId: undefined,
      },
    ])
    expect(state.labels).toEqual([
      {
        id: 'marker-1',
        text: 'Marker',
        type: 'marker',
        lat: 39.9,
        lon: 116.4,
        height: 0,
      },
    ])
  })

  it('indexes a large scene snapshot within the interaction budget', () => {
    const state = createSceneState()
    const entities = Array.from({ length: 20_000 }, (_, index) => ({
      entityId: `entity-${index}`,
      name: `Feature ${index}`,
      type: 'point',
      position: { latitude: index / 1000, longitude: index / 1000, height: 0 },
    }))
    const started = performance.now()
    const patch = applySceneSnapshot(state, { view: null, layers: [], entities }, 'large-import')
    const elapsed = performance.now() - started

    expect(patch?.added).toHaveLength(20_000)
    expect(Object.keys(state.assets)).toHaveLength(20_000)
    expect(elapsed).toBeLessThan(1_500)
  })

  it('marks imported snapshot objects as protected by default', () => {
    const state = createSceneState()
    applySceneSnapshot(
      state,
      {
        view: null,
        layers: [
          {
            id: 'schools',
            name: 'Schools',
            type: 'geojson',
            visible: true,
            dataRefId: 'schools.geojson',
          },
        ],
        entities: [
          {
            entityId: 'school-1',
            name: 'School 1',
            type: 'point',
            provenance: 'import',
          },
        ],
      },
      'file-import:schools',
    )

    expect(state.assets['layer:schools']).toMatchObject({
      source: 'import',
      locked: true,
    })
    expect(state.assets['entity:school-1']).toMatchObject({
      source: 'import',
      locked: true,
    })

    applySceneSnapshot(
      state,
      {
        view: null,
        layers: [
          {
            id: 'schools',
            name: 'Schools',
            type: 'geojson',
            visible: true,
            dataRefId: 'schools.geojson',
          },
        ],
        entities: [],
      },
      'run-1:tool:1',
    )

    expect(state.assets['layer:schools']).toMatchObject({
      source: 'import',
      locked: true,
    })
  })

  it('preserves structured data assets that are not represented in map snapshots', () => {
    const state = createSceneState()
    state.assets = {
      'asset:project-parcels': {
        ref: 'asset:project-parcels',
        id: 'project-parcels',
        kind: 'asset',
        type: 'vector',
        name: 'Project parcels',
        source: 'import',
        locked: true,
        geometryType: 'polygon',
        featureCount: 1,
        metadata: {
          renderTool: 'addGeoJsonLayer',
          renderData: { type: 'FeatureCollection', features: [] },
        },
      },
      'layer:project-parcels': {
        ref: 'layer:project-parcels',
        id: 'project-parcels',
        kind: 'layer',
        type: 'geojson',
        name: 'Project parcels',
        source: 'import',
        locked: true,
      },
    }

    applySceneSnapshot(
      state,
      {
        view: null,
        layers: [
          {
            id: 'project-parcels',
            name: 'Project parcels',
            type: 'geojson',
            visible: true,
          },
        ],
        entities: [],
      },
      'scene-panel:refresh',
    )

    expect(state.assets['asset:project-parcels']).toMatchObject({
      kind: 'asset',
      geometryType: 'polygon',
      metadata: {
        renderTool: 'addGeoJsonLayer',
        renderData: { type: 'FeatureCollection', features: [] },
      },
    })
    expect(state.assets['layer:project-parcels']).toMatchObject({
      kind: 'layer',
      visible: true,
    })
  })

  it('covers the scene workbench object lifecycle from tool snapshot to cleanup', () => {
    const state = createSceneState()

    const created = applySceneSnapshot(
      state,
      {
        view: { latitude: 39.91, longitude: 116.39, height: 1500 },
        layers: [{ id: 'tour-layer', name: 'Tour layer', type: 'geojson', visible: true }],
        entities: [
          {
            entityId: 'start-marker',
            name: 'Start marker',
            type: 'point',
            visible: true,
            position: { latitude: 39.91, longitude: 116.39, height: 0 },
          },
          {
            entityId: 'fallback-route',
            name: 'Fallback route',
            type: 'polyline',
            visible: true,
          },
        ],
      },
      'run-1:scene_add_polyline',
    )

    expect(created?.added.map((asset) => asset.ref)).toEqual([
      'layer:tour-layer',
      'entity:start-marker',
      'entity:fallback-route',
    ])
    expect(state.camera).toEqual({ lat: 39.91, lon: 116.39, height: 1500 })
    expect(state.labels).toEqual([
      {
        id: 'start-marker',
        text: 'Start marker',
        type: 'point',
        lat: 39.91,
        lon: 116.39,
        height: 0,
      },
    ])
    expect(state.recentObjectRefs).toEqual([
      'entity:fallback-route',
      'entity:start-marker',
      'layer:tour-layer',
    ])

    state.activeObjectRef = 'entity:fallback-route'
    const hidden = applySceneSnapshot(
      state,
      {
        view: { latitude: 39.91, longitude: 116.39, height: 1500 },
        layers: [{ id: 'tour-layer', name: 'Tour layer', type: 'geojson', visible: true }],
        entities: [
          {
            entityId: 'start-marker',
            name: 'Start marker',
            type: 'point',
            visible: true,
            position: { latitude: 39.91, longitude: 116.39, height: 0 },
          },
          {
            entityId: 'fallback-route',
            name: 'Fallback route',
            type: 'polyline',
            visible: false,
          },
        ],
      },
      'scene-panel:set-visibility',
    )

    expect(hidden?.updated.map((asset) => asset.ref)).toEqual(['entity:fallback-route'])
    expect(state.activeObjectRef).toBe('entity:fallback-route')
    expect(state.assets['entity:fallback-route']).toMatchObject({
      visible: false,
      source: 'agent',
      locked: false,
      lastCallId: 'scene-panel:set-visibility',
    })

    const deleted = applySceneSnapshot(
      state,
      {
        view: { latitude: 39.91, longitude: 116.39, height: 1500 },
        layers: [{ id: 'tour-layer', name: 'Tour layer', type: 'geojson', visible: true }],
        entities: [
          {
            entityId: 'start-marker',
            name: 'Start marker',
            type: 'point',
            visible: true,
            position: { latitude: 39.91, longitude: 116.39, height: 0 },
          },
        ],
      },
      'scene-panel:delete-object',
    )

    expect(deleted?.removed).toEqual(['entity:fallback-route'])
    expect(state.assets['entity:fallback-route']).toBeUndefined()
    expect(state.activeObjectRef).toBeNull()
    expect(state.recentObjectRefs).toEqual(['entity:start-marker', 'layer:tour-layer'])
  })
})
