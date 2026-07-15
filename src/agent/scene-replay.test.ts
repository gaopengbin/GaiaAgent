import { describe, expect, it } from 'vitest'
import type { SceneState } from './types'
import { buildSceneReplayCommands } from './scene-replay'

describe('scene replay commands', () => {
  const scene = {
    revision: 1,
    camera: null,
    layers: [],
    labels: [],
    assets: {
      'entity:marker-1': {
        ref: 'entity:marker-1',
        id: 'marker-1',
        kind: 'entity',
        type: 'marker',
        name: 'Marker',
        visible: true,
        position: { lon: 116.4, lat: 39.9, height: 0 },
        render: { color: '#ff0000', pixelSize: 16 },
      },
      'entity:route-1': {
        ref: 'entity:route-1',
        id: 'route-1',
        kind: 'entity',
        type: 'polyline',
        name: 'Route',
        visible: true,
        render: {
          color: '#00ff00',
          width: 4,
          positions: [
            [116.3, 39.8, 0],
            [116.4, 39.9, 0],
          ],
        },
      },
      'entity:hidden-1': {
        ref: 'entity:hidden-1',
        id: 'hidden-1',
        kind: 'entity',
        type: 'marker',
        visible: false,
        position: { lon: 116.1, lat: 39.7, height: 0 },
      },
      'entity:box-1': {
        ref: 'entity:box-1',
        id: 'box-1',
        kind: 'entity',
        type: 'box',
        name: 'Box',
        position: { lon: 116.2, lat: 39.6, height: 20 },
        render: {
          color: '#123456',
          dimensions: { x: 10, y: 20, z: 30 },
        },
      },
      'entity:rectangle-1': {
        ref: 'entity:rectangle-1',
        id: 'rectangle-1',
        kind: 'entity',
        type: 'rectangle',
        name: 'Rectangle',
        render: {
          color: '#abcdef',
          coordinates: { west: 116, south: 39, east: 117, north: 40 },
        },
      },
      'entity:corridor-1': {
        ref: 'entity:corridor-1',
        id: 'corridor-1',
        kind: 'entity',
        type: 'corridor',
        name: 'Corridor',
        render: {
          width: 12,
          positions: [
            [116, 39, 0],
            [117, 40, 5],
          ],
        },
      },
      'layer:roads': {
        ref: 'layer:roads',
        id: 'roads',
        kind: 'layer',
        type: 'geojson',
      },
    },
  } satisfies SceneState

  it('builds bridge replay commands for visible restorable entities', () => {
    expect(buildSceneReplayCommands(scene)).toEqual([
      {
        method: 'addMarker',
        sourceRef: 'entity:marker-1',
        params: {
          id: 'marker-1',
          layerId: 'marker_marker-1',
          label: 'Marker',
          name: 'Marker',
          color: '#ff0000',
          scale: undefined,
          show: true,
          longitude: 116.4,
          latitude: 39.9,
          size: 16,
        },
      },
      {
        method: 'addPolyline',
        sourceRef: 'entity:route-1',
        params: {
          id: 'route-1',
          layerId: 'polyline_route-1',
          label: 'Route',
          name: 'Route',
          color: '#00ff00',
          scale: undefined,
          show: true,
          coordinates: [
            [116.3, 39.8, 0],
            [116.4, 39.9, 0],
          ],
          width: 4,
          clampToGround: undefined,
        },
      },
      {
        method: 'addMarker',
        sourceRef: 'entity:hidden-1',
        params: {
          id: 'hidden-1',
          layerId: 'marker_hidden-1',
          label: 'hidden-1',
          name: 'hidden-1',
          color: undefined,
          scale: undefined,
          show: false,
          longitude: 116.1,
          latitude: 39.7,
          size: undefined,
        },
      },
      {
        method: 'addBox',
        sourceRef: 'entity:box-1',
        params: {
          id: 'box-1',
          layerId: 'box_box-1',
          label: 'Box',
          name: 'Box',
          color: '#123456',
          scale: undefined,
          show: true,
          longitude: 116.2,
          latitude: 39.6,
          height: 20,
          dimensions: { width: 10, length: 20, height: 30 },
          material: '#123456',
        },
      },
      {
        method: 'addRectangle',
        sourceRef: 'entity:rectangle-1',
        params: {
          id: 'rectangle-1',
          layerId: 'rectangle_rectangle-1',
          label: 'Rectangle',
          name: 'Rectangle',
          color: '#abcdef',
          scale: undefined,
          show: true,
          west: 116,
          south: 39,
          east: 117,
          north: 40,
          material: '#abcdef',
        },
      },
      {
        method: 'addCorridor',
        sourceRef: 'entity:corridor-1',
        params: {
          id: 'corridor-1',
          layerId: 'corridor_corridor-1',
          label: 'Corridor',
          name: 'Corridor',
          color: undefined,
          scale: undefined,
          show: true,
          positions: [
            { longitude: 116, latitude: 39, height: 0 },
            { longitude: 117, latitude: 40, height: 5 },
          ],
          width: 12,
          material: undefined,
        },
      },
    ])
  })

  it('replays renderable GeoJSON assets as map layers', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Parcel' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [116, 39],
                [117, 39],
                [117, 40],
                [116, 39],
              ],
            ],
          },
        },
      ],
    }
    expect(
      buildSceneReplayCommands({
        revision: 1,
        camera: null,
        layers: [],
        labels: [],
        assets: {
          'asset:project-parcels': {
            ref: 'asset:project-parcels',
            id: 'project-parcels',
            kind: 'asset',
            type: 'vector',
            name: 'Project parcels',
            source: 'import',
            locked: true,
            uri: 'file:project-parcels.geojson',
            crs: 'EPSG:4326',
            geometryType: 'polygon',
            featureCount: 1,
            bbox: [116, 39, 117, 40],
            metadata: {
              renderTool: 'addGeoJsonLayer',
              renderData: geojson,
              fileName: 'project-parcels.geojson',
              reRenderedAt: 'previous-run',
            },
          },
        },
      }),
    ).toEqual([
      {
        method: 'addGeoJsonLayer',
        sourceRef: 'asset:project-parcels',
        params: {
          id: 'project-parcels',
          name: 'Project parcels',
          data: geojson,
          dataRefId: 'file:project-parcels.geojson',
          source: 'import',
          locked: true,
          type: 'vector',
          uri: 'file:project-parcels.geojson',
          crs: 'EPSG:4326',
          geometryType: 'polygon',
          featureCount: 1,
          bbox: [116, 39, 117, 40],
          schema: undefined,
          metadata: {
            renderTool: 'addGeoJsonLayer',
            renderData: geojson,
            fileName: 'project-parcels.geojson',
          },
        },
      },
    ])
  })

  it('replays persisted CZML data with its animation clock', () => {
    const czml = [
      { id: 'document', version: '1.0', clock: { interval: '2026-01-01/2026-01-02' } },
      { id: 'tour-guide', position: { cartographicDegrees: [116.4, 39.9, 0] } },
    ]
    const commands = buildSceneReplayCommands({
      revision: 1,
      camera: null,
      layers: [],
      labels: [],
      assets: {
        'asset:tour': {
          ref: 'asset:tour',
          id: 'tour',
          kind: 'asset',
          type: 'vector',
          name: 'Dynamic tour',
          metadata: { renderTool: 'loadCzml', renderData: czml },
        },
      },
    })

    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({
      method: 'loadCzml',
      sourceRef: 'asset:tour',
      params: { id: 'tour', name: 'Dynamic tour', data: czml },
    })
  })
})
